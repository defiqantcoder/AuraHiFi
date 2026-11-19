//! SQLite + sqlite-vec embedded library database engine for AuraHiFi.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection, Result};
use crate::models::{LibraryFolder, TrackSummary};

/// Auto-extension registration for sqlite-vec
static INIT_SQLITE_VEC: std::sync::Once = std::sync::Once::new();

pub fn ensure_sqlite_vec_registered() {
    INIT_SQLITE_VEC.call_once(|| {
        unsafe {
            // Register sqlite-vec C entry point into SQLite's auto-extension list
            let init_fn = sqlite_vec::sqlite3_vec_init as *const ();
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(init_fn)));
        }
    });
}

#[derive(Clone)]
pub struct LibraryDb {
    conn: Arc<Mutex<Connection>>,
    #[allow(dead_code)]
    db_path: PathBuf,
}

impl LibraryDb {
    pub fn path(&self) -> &Path {
        &self.db_path
    }
    pub fn open_or_create(db_path: &Path) -> Result<Self> {
        ensure_sqlite_vec_registered();
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: db_path.to_path_buf(),
        };

        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        ensure_sqlite_vec_registered();
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from(":memory:"),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // High performance WAL mode
        let _ = conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
        ");

        // Schema tables
        conn.execute_batch("
            -- App State (Onboarding, Preferences, Mode)
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Library Root Folders
            CREATE TABLE IF NOT EXISTS library_folders (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                track_count INTEGER NOT NULL DEFAULT 0,
                watch_enabled INTEGER NOT NULL DEFAULT 1,
                last_scanned_at INTEGER
            );

            -- Tracks Catalog
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                cue_parent_path TEXT,
                cue_start_ms INTEGER,
                cue_end_ms INTEGER,
                cue_index TEXT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_artist TEXT NOT NULL,
                genre TEXT NOT NULL,
                year INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                codec TEXT NOT NULL,
                sample_rate_hz INTEGER NOT NULL,
                bit_depth INTEGER NOT NULL,
                channels INTEGER NOT NULL,
                channel_layout TEXT NOT NULL,
                is_dsd INTEGER NOT NULL,
                dsd_rate_multiplier INTEGER,
                is_atmos INTEGER NOT NULL,
                bpm INTEGER NOT NULL,
                musical_key TEXT NOT NULL,
                dynamic_range_dr INTEGER NOT NULL,
                integrated_lufs REAL NOT NULL,
                true_peak_dbtp REAL NOT NULL,
                replay_gain_track_db REAL NOT NULL,
                mbid_recording TEXT NOT NULL,
                artwork_theme TEXT NOT NULL,
                waveform_peaks TEXT NOT NULL,
                folder_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(folder_id) REFERENCES library_folders(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
        ")?;

        // FTS5 Virtual Table for full-text search
        let _ = conn.execute_batch("
            CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
                title,
                artist,
                album,
                genre,
                content='tracks',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
                INSERT INTO tracks_fts(rowid, title, artist, album, genre)
                VALUES (new.rowid, new.title, new.artist, new.album, new.genre);
            END;

            CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
                INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
                VALUES('delete', old.rowid, old.title, old.artist, old.album, old.genre);
            END;

            CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
                INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre)
                VALUES('delete', old.rowid, old.title, old.artist, old.album, old.genre);
                INSERT INTO tracks_fts(rowid, title, artist, album, genre)
                VALUES (new.rowid, new.title, new.artist, new.album, new.genre);
            END;
        ");

        // sqlite-vec Vector tables (vec0) for similarity search
        let _ = conn.execute_batch("
            CREATE VIRTUAL TABLE IF NOT EXISTS track_bliss_vec USING vec0(
                track_id text primary key,
                vector float[6]
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS track_clap_vec USING vec0(
                track_id text primary key,
                vector float[512]
            );
        ");

        // Lyrics cache table
        let _ = conn.execute_batch("
            CREATE TABLE IF NOT EXISTS lyrics_cache (
                track_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                lines_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS addons_installed (
                id TEXT PRIMARY KEY,
                version TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                signature_verified INTEGER NOT NULL DEFAULT 1,
                enabled INTEGER NOT NULL DEFAULT 1,
                permissions_json TEXT NOT NULL,
                wasm_path TEXT NOT NULL,
                installed_at_ms INTEGER NOT NULL
            );
        ");

        Ok(())
    }

    // --- App State helpers ---
    pub fn get_app_state(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            let val: String = row.get(0)?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set_app_state(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO app_state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )?;
        Ok(())
    }

    // --- Library Folders ---
    pub fn list_library_folders(&self) -> Result<Vec<LibraryFolder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, path, track_count, watch_enabled, last_scanned_at FROM library_folders ORDER BY path ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let watch_enabled_int: i32 = row.get(3)?;
            let last_scanned_at_i64: Option<i64> = row.get(4)?;
            let track_count_i32: i32 = row.get(2)?;
            Ok(LibraryFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                track_count: track_count_i32 as u32,
                watch_enabled: watch_enabled_int != 0,
                last_scanned_at: last_scanned_at_i64.map(|v| v as u64),
            })
        })?;

        let mut folders = Vec::new();
        for r in rows {
            folders.push(r?);
        }
        Ok(folders)
    }

    pub fn add_library_folder(&self, path: &str, watch_enabled: bool) -> Result<LibraryFolder> {
        let conn = self.conn.lock().unwrap();
        let id = format!("folder-{}", uuid_simple(path));
        let watch_enabled_int = if watch_enabled { 1 } else { 0 };
        let now_ms = crate::state::now_ms() as i64;

        conn.execute(
            "INSERT INTO library_folders (id, path, track_count, watch_enabled, last_scanned_at)
             VALUES (?1, ?2, 0, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET watch_enabled = ?3",
            params![id, path, watch_enabled_int, now_ms],
        )?;

        Ok(LibraryFolder {
            id,
            path: path.to_string(),
            track_count: 0,
            watch_enabled,
            last_scanned_at: Some(now_ms as u64),
        })
    }

    pub fn remove_library_folder(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tracks WHERE folder_id = ?1", params![id])?;
        conn.execute("DELETE FROM library_folders WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_library_folder_watch(&self, id: &str, watch_enabled: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let int_val = if watch_enabled { 1 } else { 0 };
        conn.execute(
            "UPDATE library_folders SET watch_enabled = ?1 WHERE id = ?2",
            params![int_val, id],
        )?;
        Ok(())
    }

    pub fn update_folder_stats(&self, id: &str, track_count: u32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now_ms = crate::state::now_ms() as i64;
        conn.execute(
            "UPDATE library_folders SET track_count = ?1, last_scanned_at = ?2 WHERE id = ?3",
            params![track_count as i64, now_ms, id],
        )?;
        Ok(())
    }

    // --- Tracks CRUD ---
    pub fn list_tracks(&self) -> Result<Vec<TrackSummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("
            SELECT id, path, cue_parent_path, cue_start_ms, cue_end_ms, cue_index,
                   title, artist, album, album_artist, genre, year, duration_ms,
                   codec, sample_rate_hz, bit_depth, channels, channel_layout,
                   is_dsd, dsd_rate_multiplier, is_atmos, bpm, musical_key,
                   dynamic_range_dr, integrated_lufs, true_peak_dbtp, replay_gain_track_db,
                   mbid_recording, artwork_theme, waveform_peaks
            FROM tracks
            ORDER BY artist ASC, album ASC, title ASC
        ")?;

        let rows = stmt.query_map([], |row| {
            let is_dsd_int: i32 = row.get(18)?;
            let is_atmos_int: i32 = row.get(20)?;
            let waveform_str: String = row.get(29)?;
            let waveform_peaks: Vec<f32> = serde_json::from_str(&waveform_str).unwrap_or_default();
            let dsd_mult: Option<i32> = row.get(19)?;
            let cue_start_i64: Option<i64> = row.get(3)?;
            let cue_end_i64: Option<i64> = row.get(4)?;
            let dur_i64: i64 = row.get(12)?;

            Ok(TrackSummary {
                id: row.get(0)?,
                path: row.get(1)?,
                cue_parent_path: row.get(2)?,
                cue_start_ms: cue_start_i64.map(|v| v as u64),
                cue_end_ms: cue_end_i64.map(|v| v as u64),
                cue_index: row.get(5)?,
                title: row.get(6)?,
                artist: row.get(7)?,
                album: row.get(8)?,
                album_artist: row.get(9)?,
                genre: row.get(10)?,
                year: row.get::<_, i32>(11)? as u32,
                duration_ms: dur_i64 as u64,
                codec: row.get(13)?,
                sample_rate_hz: row.get::<_, i32>(14)? as u32,
                bit_depth: row.get::<_, i32>(15)? as u16,
                channels: row.get::<_, i32>(16)? as u16,
                channel_layout: row.get(17)?,
                is_dsd: is_dsd_int != 0,
                dsd_rate_multiplier: dsd_mult.map(|m| m as u16),
                is_atmos: is_atmos_int != 0,
                bpm: row.get::<_, i32>(21)? as u32,
                musical_key: row.get(22)?,
                dynamic_range_dr: row.get::<_, i32>(23)? as u32,
                integrated_lufs: row.get(24)?,
                true_peak_dbtp: row.get(25)?,
                replay_gain_track_db: row.get(26)?,
                mbid_recording: row.get(27)?,
                artwork_theme: row.get(28)?,
                waveform_peaks,
            })
        })?;

        let mut tracks = Vec::new();
        for r in rows {
            tracks.push(r?);
        }
        Ok(tracks)
    }

    pub fn insert_or_update_track(&self, track: &TrackSummary, folder_id: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let waveform_json = serde_json::to_string(&track.waveform_peaks).unwrap_or_else(|_| "[]".to_string());
        let is_dsd_int = if track.is_dsd { 1 } else { 0 };
        let is_atmos_int = if track.is_atmos { 1 } else { 0 };

        conn.execute(
            "INSERT INTO tracks (
                id, path, cue_parent_path, cue_start_ms, cue_end_ms, cue_index,
                title, artist, album, album_artist, genre, year, duration_ms,
                codec, sample_rate_hz, bit_depth, channels, channel_layout,
                is_dsd, dsd_rate_multiplier, is_atmos, bpm, musical_key,
                dynamic_range_dr, integrated_lufs, true_peak_dbtp, replay_gain_track_db,
                mbid_recording, artwork_theme, waveform_peaks, folder_id, created_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23,
                ?24, ?25, ?26, ?27,
                ?28, ?29, ?30, ?31, datetime('now')
            ) ON CONFLICT(id) DO UPDATE SET
                path = ?2,
                cue_parent_path = ?3,
                cue_start_ms = ?4,
                cue_end_ms = ?5,
                cue_index = ?6,
                title = ?7,
                artist = ?8,
                album = ?9,
                album_artist = ?10,
                genre = ?11,
                year = ?12,
                duration_ms = ?13,
                codec = ?14,
                sample_rate_hz = ?15,
                bit_depth = ?16,
                channels = ?17,
                channel_layout = ?18,
                is_dsd = ?19,
                dsd_rate_multiplier = ?20,
                is_atmos = ?21,
                bpm = ?22,
                musical_key = ?23,
                dynamic_range_dr = ?24,
                integrated_lufs = ?25,
                true_peak_dbtp = ?26,
                replay_gain_track_db = ?27,
                mbid_recording = ?28,
                artwork_theme = ?29,
                waveform_peaks = ?30,
                folder_id = ?31",
            params![
                track.id,
                track.path,
                track.cue_parent_path,
                track.cue_start_ms.map(|v| v as i64),
                track.cue_end_ms.map(|v| v as i64),
                track.cue_index,
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.genre,
                track.year as i32,
                track.duration_ms as i64,
                track.codec,
                track.sample_rate_hz as i32,
                track.bit_depth as i32,
                track.channels as i32,
                track.channel_layout,
                is_dsd_int,
                track.dsd_rate_multiplier.map(|v| v as i32),
                is_atmos_int,
                track.bpm as i32,
                track.musical_key,
                track.dynamic_range_dr as i32,
                track.integrated_lufs,
                track.true_peak_dbtp,
                track.replay_gain_track_db,
                track.mbid_recording,
                track.artwork_theme,
                waveform_json,
                folder_id,
            ],
        )?;

        Ok(())
    }

    pub fn delete_missing_tracks(&self, existing_file_paths: &[String]) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        if existing_file_paths.is_empty() {
            return Ok(0);
        }
        let placeholders = existing_file_paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM tracks WHERE path NOT IN ({})", placeholders);
        let mut stmt = conn.prepare(&sql)?;
        let count = stmt.execute(rusqlite::params_from_iter(existing_file_paths))?;
        Ok(count)
    }

    pub fn search_tracks_fts(&self, query_str: &str) -> Result<Vec<TrackSummary>> {
        let conn = self.conn.lock().unwrap();
        let clean_query = query_str.replace('"', "").replace('\'', "");
        let fts_query = format!("{}*", clean_query.trim());

        let mut stmt = conn.prepare("
            SELECT t.id, t.path, t.cue_parent_path, t.cue_start_ms, t.cue_end_ms, t.cue_index,
                   t.title, t.artist, t.album, t.album_artist, t.genre, t.year, t.duration_ms,
                   t.codec, t.sample_rate_hz, t.bit_depth, t.channels, t.channel_layout,
                   t.is_dsd, t.dsd_rate_multiplier, t.is_atmos, t.bpm, t.musical_key,
                   t.dynamic_range_dr, t.integrated_lufs, t.true_peak_dbtp, t.replay_gain_track_db,
                   t.mbid_recording, t.artwork_theme, t.waveform_peaks
            FROM tracks t
            JOIN tracks_fts fts ON t.rowid = fts.rowid
            WHERE tracks_fts MATCH ?1
            ORDER BY rank
            LIMIT 50
        ")?;

        let rows = stmt.query_map(params![fts_query], |row| {
            let is_dsd_int: i32 = row.get(18)?;
            let is_atmos_int: i32 = row.get(20)?;
            let waveform_str: String = row.get(29)?;
            let waveform_peaks: Vec<f32> = serde_json::from_str(&waveform_str).unwrap_or_default();
            let dsd_mult: Option<i32> = row.get(19)?;
            let cue_start_i64: Option<i64> = row.get(3)?;
            let cue_end_i64: Option<i64> = row.get(4)?;
            let dur_i64: i64 = row.get(12)?;

            Ok(TrackSummary {
                id: row.get(0)?,
                path: row.get(1)?,
                cue_parent_path: row.get(2)?,
                cue_start_ms: cue_start_i64.map(|v| v as u64),
                cue_end_ms: cue_end_i64.map(|v| v as u64),
                cue_index: row.get(5)?,
                title: row.get(6)?,
                artist: row.get(7)?,
                album: row.get(8)?,
                album_artist: row.get(9)?,
                genre: row.get(10)?,
                year: row.get::<_, i32>(11)? as u32,
                duration_ms: dur_i64 as u64,
                codec: row.get(13)?,
                sample_rate_hz: row.get::<_, i32>(14)? as u32,
                bit_depth: row.get::<_, i32>(15)? as u16,
                channels: row.get::<_, i32>(16)? as u16,
                channel_layout: row.get(17)?,
                is_dsd: is_dsd_int != 0,
                dsd_rate_multiplier: dsd_mult.map(|m| m as u16),
                is_atmos: is_atmos_int != 0,
                bpm: row.get::<_, i32>(21)? as u32,
                musical_key: row.get(22)?,
                dynamic_range_dr: row.get::<_, i32>(23)? as u32,
                integrated_lufs: row.get(24)?,
                true_peak_dbtp: row.get(25)?,
                replay_gain_track_db: row.get(26)?,
                mbid_recording: row.get(27)?,
                artwork_theme: row.get(28)?,
                waveform_peaks,
            })
        })?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    // --- Vector operations ---
    pub fn insert_bliss_vector(&self, track_id: &str, vector: &[f32; 6]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let vec_json = serde_json::to_string(&vector[..]).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute("DELETE FROM track_bliss_vec WHERE track_id = ?1", params![track_id]);
        conn.execute(
            "INSERT INTO track_bliss_vec(track_id, vector) VALUES (?1, ?2)",
            params![track_id, vec_json],
        )?;
        Ok(())
    }

    pub fn insert_clap_vector(&self, track_id: &str, vector: &[f32; 512]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let vec_json = serde_json::to_string(&vector[..]).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute("DELETE FROM track_clap_vec WHERE track_id = ?1", params![track_id]);
        conn.execute(
            "INSERT INTO track_clap_vec(track_id, vector) VALUES (?1, ?2)",
            params![track_id, vec_json],
        )?;
        Ok(())
    }

    pub fn query_vector(&self, table: &str, query_vector: &[f32], limit: usize) -> Result<Vec<(String, f32)>> {
        let conn = self.conn.lock().unwrap();
        let table_sanitized = match table {
            "track_bliss_vec" => "track_bliss_vec",
            "track_clap_vec" => "track_clap_vec",
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        let vec_json = serde_json::to_string(query_vector).unwrap_or_else(|_| "[]".to_string());
        let sql = format!(
            "SELECT track_id, distance FROM {} WHERE vector MATCH ?1 AND k = ?2 ORDER BY distance",
            table_sanitized
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![vec_json, limit as i64], |row| {
            let id: String = row.get(0)?;
            let dist: f64 = row.get(1)?;
            Ok((id, dist as f32))
        })?;
        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    // --- Lyrics Cache ---
    pub fn save_lyrics_cache(&self, track_id: &str, source: &str, lines_json: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now_str = crate::state::now_ms().to_string();
        conn.execute(
            "INSERT INTO lyrics_cache (track_id, source, lines_json, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(track_id) DO UPDATE SET source = ?2, lines_json = ?3, updated_at = ?4",
            params![track_id, source, lines_json, now_str],
        )?;
        Ok(())
    }

    pub fn get_lyrics_cache(&self, track_id: &str) -> Result<Option<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT source, lines_json FROM lyrics_cache WHERE track_id = ?1")?;
        let mut rows = stmt.query(params![track_id])?;
        if let Some(r) = rows.next()? {
            Ok(Some((r.get(0)?, r.get(1)?)))
        } else {
            Ok(None)
        }
    }

    // --- Track Tags Update ---
    pub fn update_track_tags(&self, track_id: &str, fields: &std::collections::HashMap<String, String>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        for (key, val) in fields {
            let col = match key.as_str() {
                "title" => "title",
                "artist" => "artist",
                "album" => "album",
                "album_artist" => "album_artist",
                "genre" => "genre",
                "mbid_recording" => "mbid_recording",
                _ => continue,
            };
            let sql = format!("UPDATE tracks SET {} = ?1 WHERE id = ?2", col);
            let _ = conn.execute(&sql, params![val, track_id]);
        }
        if let Some(year_str) = fields.get("year") {
            if let Ok(year_num) = year_str.parse::<i32>() {
                let _ = conn.execute("UPDATE tracks SET year = ?1 WHERE id = ?2", params![year_num, track_id]);
            }
        }
        Ok(())
    }

    pub fn get_track_by_id(&self, track_id: &str) -> Result<Option<TrackSummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("
            SELECT id, path, cue_parent_path, cue_start_ms, cue_end_ms, cue_index,
                   title, artist, album, album_artist, genre, year, duration_ms,
                   codec, sample_rate_hz, bit_depth, channels, channel_layout,
                   is_dsd, dsd_rate_multiplier, is_atmos, bpm, musical_key,
                   dynamic_range_dr, integrated_lufs, true_peak_dbtp, replay_gain_track_db,
                   mbid_recording, artwork_theme, waveform_peaks
            FROM tracks WHERE id = ?1
        ")?;
        let mut rows = stmt.query(params![track_id])?;
        if let Some(row) = rows.next()? {
            let is_dsd_int: i32 = row.get(18)?;
            let is_atmos_int: i32 = row.get(20)?;
            let waveform_str: String = row.get(29)?;
            let waveform_peaks: Vec<f32> = serde_json::from_str(&waveform_str).unwrap_or_default();
            let dsd_mult: Option<i32> = row.get(19)?;
            let cue_start_i64: Option<i64> = row.get(3)?;
            let cue_end_i64: Option<i64> = row.get(4)?;
            let dur_i64: i64 = row.get(12)?;

            Ok(Some(TrackSummary {
                id: row.get(0)?,
                path: row.get(1)?,
                cue_parent_path: row.get(2)?,
                cue_start_ms: cue_start_i64.map(|v| v as u64),
                cue_end_ms: cue_end_i64.map(|v| v as u64),
                cue_index: row.get(5)?,
                title: row.get(6)?,
                artist: row.get(7)?,
                album: row.get(8)?,
                album_artist: row.get(9)?,
                genre: row.get(10)?,
                year: row.get::<_, i32>(11)? as u32,
                duration_ms: dur_i64 as u64,
                codec: row.get(13)?,
                sample_rate_hz: row.get::<_, i32>(14)? as u32,
                bit_depth: row.get::<_, i32>(15)? as u16,
                channels: row.get::<_, i32>(16)? as u16,
                channel_layout: row.get(17)?,
                is_dsd: is_dsd_int != 0,
                dsd_rate_multiplier: dsd_mult.map(|m| m as u16),
                is_atmos: is_atmos_int != 0,
                bpm: row.get::<_, i32>(21)? as u32,
                musical_key: row.get(22)?,
                dynamic_range_dr: row.get::<_, i32>(23)? as u32,
                integrated_lufs: row.get(24)?,
                true_peak_dbtp: row.get(25)?,
                replay_gain_track_db: row.get(26)?,
                mbid_recording: row.get(27)?,
                artwork_theme: row.get(28)?,
                waveform_peaks,
            }))
        } else {
            Ok(None)
        }
    }

    // --- Installed Addons ---
    pub fn record_installed_addon(
        &self,
        id: &str,
        version: &str,
        sha256: &str,
        signature_verified: bool,
        enabled: bool,
        permissions_json: &str,
        wasm_path: &str,
        installed_at_ms: u64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO addons_installed (id, version, sha256, signature_verified, enabled, permissions_json, wasm_path, installed_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET version = ?2, sha256 = ?3, signature_verified = ?4, enabled = ?5, permissions_json = ?6, wasm_path = ?7",
            params![
                id,
                version,
                sha256,
                if signature_verified { 1 } else { 0 },
                if enabled { 1 } else { 0 },
                permissions_json,
                wasm_path,
                installed_at_ms as i64
            ],
        )?;
        Ok(())
    }
}

fn uuid_simple(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

//! Ubuntu GNOME Shell MPRIS2 media controls via `mpris-server`.
//!
//! Exposes `org.mpris.MediaPlayer2.AuraHiFi` on the user session D-Bus so GNOME Shell,
//! media keys, and lock-screen controls drive `AppState` playback cleanly.

use mpris_server::{
    zbus, LoopStatus, Metadata, PlaybackRate, PlaybackStatus as MprisPlaybackStatus,
    PlayerInterface, RootInterface, Server, Time, TrackId, Volume,
};

use crate::models::{HardwareEvent, PlaybackStatus};
use crate::state::{now_ms, AppState};

pub struct AuraMprisPlayer {
    state: AppState,
}

impl RootInterface for AuraMprisPlayer {
    async fn raise(&self) -> zbus::fdo::Result<()> {
        Ok(())
    }

    async fn quit(&self) -> zbus::fdo::Result<()> {
        Ok(())
    }

    async fn can_quit(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn fullscreen(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn set_fullscreen(&self, _fullscreen: bool) -> zbus::Result<()> {
        Ok(())
    }

    async fn can_set_fullscreen(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn can_raise(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn has_track_list(&self) -> zbus::fdo::Result<bool> {
        Ok(false)
    }

    async fn identity(&self) -> zbus::fdo::Result<String> {
        Ok("AuraHiFi".into())
    }

    async fn desktop_entry(&self) -> zbus::fdo::Result<String> {
        Ok("aurahifi".into())
    }

    async fn supported_uri_schemes(&self) -> zbus::fdo::Result<Vec<String>> {
        Ok(vec!["file".into()])
    }

    async fn supported_mime_types(&self) -> zbus::fdo::Result<Vec<String>> {
        Ok(vec![
            "audio/flac".into(),
            "audio/x-dsf".into(),
            "audio/wav".into(),
            "audio/mp4".into(),
        ])
    }
}

impl PlayerInterface for AuraMprisPlayer {
    async fn next(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        if !guard.tracks.is_empty() {
            let idx = guard
                .tracks
                .iter()
                .position(|t| t.id == guard.playback.current_track_id)
                .unwrap_or(0);
            let next_idx = (idx + 1) % guard.tracks.len();
            let (id, dur) = (
                guard.tracks[next_idx].id.clone(),
                guard.tracks[next_idx].duration_ms,
            );
            guard.playback.current_track_id = id;
            guard.playback.duration_ms = dur;
            guard.playback.position_ms = 0;
            let sp = guard.build_signal_path();
            guard.emit_hardware_event(HardwareEvent::SignalPathChanged {
                timestamp_ms: now_ms(),
                integrity: sp.integrity,
                summary: sp.summary_label,
            });
        }
        Ok(())
    }

    async fn previous(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        if !guard.tracks.is_empty() {
            let idx = guard
                .tracks
                .iter()
                .position(|t| t.id == guard.playback.current_track_id)
                .unwrap_or(0);
            let prev_idx = (idx + guard.tracks.len() - 1) % guard.tracks.len();
            let (id, dur) = (
                guard.tracks[prev_idx].id.clone(),
                guard.tracks[prev_idx].duration_ms,
            );
            guard.playback.current_track_id = id;
            guard.playback.duration_ms = dur;
            guard.playback.position_ms = 0;
            let sp = guard.build_signal_path();
            guard.emit_hardware_event(HardwareEvent::SignalPathChanged {
                timestamp_ms: now_ms(),
                integrity: sp.integrity,
                summary: sp.summary_label,
            });
        }
        Ok(())
    }

    async fn pause(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        guard.playback.status = PlaybackStatus::Paused;
        self.state.audio_engine.set_playing(false);
        Ok(())
    }

    async fn play_pause(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        let now_playing = guard.playback.status != PlaybackStatus::Playing;
        guard.playback.status = if now_playing {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        };
        self.state.audio_engine.set_playing(now_playing);
        Ok(())
    }

    async fn stop(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        guard.playback.status = PlaybackStatus::Stopped;
        guard.playback.position_ms = 0;
        self.state.audio_engine.set_playing(false);
        Ok(())
    }

    async fn play(&self) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        guard.playback.status = PlaybackStatus::Playing;
        self.state.audio_engine.set_playing(true);
        Ok(())
    }

    async fn seek(&self, offset: Time) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        let delta_ms = offset.as_millis();
        let next_pos = (guard.playback.position_ms as i64 + delta_ms)
            .clamp(0, guard.playback.duration_ms as i64) as u64;
        guard.playback.position_ms = next_pos;
        Ok(())
    }

    async fn set_position(&self, _track_id: TrackId, position: Time) -> zbus::fdo::Result<()> {
        let mut guard = self.state.inner.write().await;
        let pos_ms = position.as_millis().max(0) as u64;
        guard.playback.position_ms = pos_ms.min(guard.playback.duration_ms);
        Ok(())
    }

    async fn open_uri(&self, _uri: String) -> zbus::fdo::Result<()> {
        Ok(())
    }

    async fn playback_status(&self) -> zbus::fdo::Result<MprisPlaybackStatus> {
        let guard = self.state.inner.read().await;
        Ok(match guard.playback.status {
            PlaybackStatus::Playing => MprisPlaybackStatus::Playing,
            PlaybackStatus::Paused | PlaybackStatus::Buffering => MprisPlaybackStatus::Paused,
            PlaybackStatus::Stopped | PlaybackStatus::HaltedHardwareError => {
                MprisPlaybackStatus::Stopped
            }
        })
    }

    async fn loop_status(&self) -> zbus::fdo::Result<LoopStatus> {
        let guard = self.state.inner.read().await;
        Ok(match guard.playback.repeat_mode.as_str() {
            "one" => LoopStatus::Track,
            "all" => LoopStatus::Playlist,
            _ => LoopStatus::None,
        })
    }

    async fn set_loop_status(&self, loop_status: LoopStatus) -> zbus::Result<()> {
        let mut guard = self.state.inner.write().await;
        guard.playback.repeat_mode = match loop_status {
            LoopStatus::Track => "one".into(),
            LoopStatus::Playlist => "all".into(),
            LoopStatus::None => "off".into(),
        };
        Ok(())
    }

    async fn rate(&self) -> zbus::fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn set_rate(&self, _rate: PlaybackRate) -> zbus::Result<()> {
        Ok(())
    }

    async fn shuffle(&self) -> zbus::fdo::Result<bool> {
        let guard = self.state.inner.read().await;
        Ok(guard.playback.shuffle)
    }

    async fn set_shuffle(&self, shuffle: bool) -> zbus::Result<()> {
        let mut guard = self.state.inner.write().await;
        guard.playback.shuffle = shuffle;
        Ok(())
    }

    async fn metadata(&self) -> zbus::fdo::Result<Metadata> {
        let guard = self.state.inner.read().await;
        let mut meta = Metadata::new();
        if let Some(track) = guard.current_track() {
            meta.set_title(Some(track.title.clone()));
            meta.set_artist(Some(vec![track.artist.clone()]));
            meta.set_album(Some(track.album.clone()));
            meta.set_length(Some(Time::from_millis(track.duration_ms as i64)));
        }
        Ok(meta)
    }

    async fn volume(&self) -> zbus::fdo::Result<Volume> {
        let guard = self.state.inner.read().await;
        Ok(guard.playback.volume_normalized)
    }

    async fn set_volume(&self, volume: Volume) -> zbus::Result<()> {
        let mut guard = self.state.inner.write().await;
        if !guard.playback.is_volume_locked {
            let clamped = volume.clamp(0.0, 1.0);
            guard.playback.volume_normalized = clamped;
            guard.playback.volume_db = if clamped <= 0.001 {
                -60.0
            } else {
                20.0 * clamped.log10()
            };
        }
        Ok(())
    }

    async fn position(&self) -> zbus::fdo::Result<Time> {
        let guard = self.state.inner.read().await;
        Ok(Time::from_millis(guard.playback.position_ms as i64))
    }

    async fn minimum_rate(&self) -> zbus::fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn maximum_rate(&self) -> zbus::fdo::Result<PlaybackRate> {
        Ok(1.0)
    }

    async fn can_go_next(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn can_go_previous(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn can_play(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn can_pause(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn can_seek(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }

    async fn can_control(&self) -> zbus::fdo::Result<bool> {
        Ok(true)
    }
}

/// Spawns the MPRIS2 D-Bus server in the background on Tokio.
/// Logs a non-fatal warning if the desktop session D-Bus is unavailable (e.g. headless CI).
pub fn spawn_mpris_server(app_state: AppState) {
    tauri::async_runtime::spawn(async move {
        let player = AuraMprisPlayer { state: app_state };
        match Server::new("io.aurahifi.player", player).await {
            Ok(_server) => {
                // Keep server alive for the lifetime of the application process.
                std::future::pending::<()>().await;
            }
            Err(err) => {
                eprintln!("[AuraHiFi][WARN] MPRIS2 D-Bus server unavailable (non-fatal): {err}");
            }
        }
    });
}

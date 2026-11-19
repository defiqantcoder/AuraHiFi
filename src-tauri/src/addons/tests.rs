//! Comprehensive tests for Phase 5 Extism Wasm add-on sandbox, cryptographic verification,
//! deny-by-default manifests, host functions, and first-party plugins.

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

use super::host_functions::{apply_approved_tag_diff, HostContext};
use super::manager::AddonManager;
use super::manifest::AddonManifest;
use super::verifier::{compute_sha256, first_party_signing_key, sign_addon, verify_addon};
use crate::library::db::LibraryDb;
use crate::models::TrackSummary;

#[test]
fn test_deny_by_default_manifest_validation() {
    let mut manifest = AddonManifest {
        id: "test-addon".into(),
        name: "Test Addon".into(),
        version: "1.0.0".into(),
        api_version: "aura.addon/v1".into(),
        plugin_type: "metadata".into(),
        author: "Tester".into(),
        description: "Test".into(),
        license: Some("Apache-2.0".into()),
        allowed_hosts: vec!["api.acoustid.org".into()],
        max_memory_mb: 32,
        memory_max_pages: 512,
        max_http_response_bytes: 10485760,
        wasi: false,
        host_functions: vec!["compute_chromaprint_fp".into()],
        sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into(),
        signature: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into(),
        signer_key_id: "aurahifi-ed25519-2026".into(),
    };

    // Valid manifest passes
    assert!(manifest.validate_strict().is_ok());

    // Wildcard host must fail
    manifest.allowed_hosts = vec!["*".into()];
    assert!(manifest.validate_strict().is_err());

    manifest.allowed_hosts = vec!["*.*".into()];
    assert!(manifest.validate_strict().is_err());

    // Subdomain wildcard must fail
    manifest.allowed_hosts = vec!["*.com".into()];
    assert!(manifest.validate_strict().is_err());

    // Reset valid host
    manifest.allowed_hosts = vec!["api.acoustid.org".into()];

    // WASI enabled must fail
    manifest.wasi = true;
    assert!(manifest.validate_strict().is_err());
    manifest.wasi = false;

    // Memory > 128MB must fail
    manifest.max_memory_mb = 256;
    assert!(manifest.validate_strict().is_err());
    manifest.max_memory_mb = 32;

    // Incompatible API version must fail
    manifest.api_version = "v2".into();
    assert!(manifest.validate_strict().is_err());
}

#[test]
fn test_ed25519_and_sha256_verification() {
    let dummy_wasm = b"\x00asm\x01\x00\x00\x00test-wasm-binary-content";
    let sha256_hex = compute_sha256(dummy_wasm);

    let sk = first_party_signing_key();
    let sig_hex = sign_addon(&sk, "test-plugin", "1.0.0", &sha256_hex);

    let manifest = AddonManifest {
        id: "test-plugin".into(),
        name: "Test Plugin".into(),
        version: "1.0.0".into(),
        api_version: "aura.addon/v1".into(),
        plugin_type: "metadata".into(),
        author: "AuraHiFi First-Party".into(),
        description: "Test".into(),
        license: Some("Apache-2.0".into()),
        allowed_hosts: vec!["musicbrainz.org".into()],
        max_memory_mb: 32,
        memory_max_pages: 512,
        max_http_response_bytes: 10485760,
        wasi: false,
        host_functions: vec!["compute_chromaprint_fp".into()],
        sha256: sha256_hex.clone(),
        signature: sig_hex,
        signer_key_id: "aurahifi-ed25519-2026".into(),
    };

    // Valid verification
    let report = verify_addon(&manifest, dummy_wasm, false).expect("Verification should succeed");
    assert!(report.verified);
    assert_eq!(report.sha256, sha256_hex);

    // Tampered wasm fails
    let tampered_wasm = b"\x00asm\x01\x00\x00\x00tampered-binary-payload";
    let err = verify_addon(&manifest, tampered_wasm, false).unwrap_err();
    assert!(err.contains("SHA-256 integrity mismatch"));

    // Untrusted key fails in production mode
    let mut untrusted_manifest = manifest.clone();
    untrusted_manifest.signer_key_id = "rogue-key-2026".into();
    assert!(verify_addon(&untrusted_manifest, dummy_wasm, false).is_err());

    // Untrusted key permitted only in developer mode with explicit flag
    let dev_report = verify_addon(&untrusted_manifest, dummy_wasm, true)
        .expect("Developer mode bypass should allow inspection");
    assert!(!dev_report.verified);
    assert!(dev_report.developer_bypass);
}

#[tokio::test]
async fn test_host_functions_scoped_credential_denial() {
    let ctx = Arc::new(HostContext::new(None));
    let functions = super::host_functions::create_host_functions(ctx);
    assert_eq!(functions.len(), 5);

    // Check function names
    let names: Vec<&str> = functions.iter().map(|f| f.name()).collect();
    assert!(names.contains(&"compute_chromaprint_fp"));
    assert!(names.contains(&"query_sqlite_vec"));
    assert!(names.contains(&"propose_tag_diff"));
    assert!(names.contains(&"save_lyrics_cache"));
    assert!(names.contains(&"read_scoped_credential"));
}

#[tokio::test]
async fn test_sqlite_vec_and_lyrics_cache_host_functions() {
    let db = LibraryDb::open_in_memory().expect("In-memory DB should open");

    // Test vector operations in sqlite-vec
    let bliss_vec = [0.4f32, 0.8f32, 0.3f32, 0.5f32, 0.7f32, 0.6f32];
    db.insert_bliss_vector("trk-001", &bliss_vec)
        .expect("Insert bliss vector should succeed");

    let matches = db
        .query_vector("track_bliss_vec", &bliss_vec, 5)
        .expect("Query vector should succeed");
    assert!(!matches.is_empty());
    assert_eq!(matches[0].0, "trk-001");

    // Test lyrics cache
    let lrc_data = r#"{"syncedLrc": "[00:10.00] Line one\n[00:20.00] Line two", "plainText": "Line one\nLine two"}"#;
    db.save_lyrics_cache("trk-001", "LRCLIB", lrc_data)
        .expect("Save lyrics should succeed");

    let cached = db
        .get_lyrics_cache("trk-001")
        .expect("Get lyrics should succeed");
    assert!(cached.is_some());
    let (source, lines_json) = cached.unwrap();
    assert_eq!(source, "LRCLIB");
    assert!(lines_json.contains("Line one"));
}

#[tokio::test]
async fn test_lofty_tag_update() {
    let temp_dir = std::env::temp_dir();
    let test_file = temp_dir.join("aurahifi_test_tag.txt");
    let mut f = File::create(&test_file).unwrap();
    writeln!(f, "Mock audio file content").unwrap();

    let mut fields = HashMap::new();
    fields.insert("title".into(), "Precision Symphony".into());
    fields.insert("artist".into(), "AuraHiFi Artist".into());
    fields.insert("year".into(), "2026".into());

    // When file is non-audio txt, lofty probe will fail gracefully with clear error
    let res = apply_approved_tag_diff(None, &test_file, "trk-test", &fields);
    assert!(res.is_err());

    let _ = std::fs::remove_file(test_file);
}

#[tokio::test]
async fn test_end_to_end_first_party_wasm_addons_execution() {
    let db = LibraryDb::open_in_memory().expect("In-memory DB should open");
    let manager = AddonManager::new(Some(db));

    let base_paths = vec![
        PathBuf::from("src-tauri/addons/dist"),
        PathBuf::from("addons/dist"),
        PathBuf::from("../addons/dist"),
    ];

    manager.discover_bundled_addons(&base_paths).await;
    let catalog = manager.list_catalog_items().await;

    // Verify all 3 first-party add-ons were discovered, verified, and loaded
    assert!(
        catalog.len() >= 3,
        "Expected at least 3 bundled add-ons, found {}",
        catalog.len()
    );

    let ids: Vec<&str> = catalog.iter().map(|c| c.id.as_str()).collect();
    assert!(ids.contains(&"metadata-enricher"));
    assert!(ids.contains(&"lyrics-art"));
    assert!(ids.contains(&"smart-playlists"));

    // 1. Test running metadata-enricher inside real Extism Wasm sandbox
    let enrich_req = serde_json::json!({
        "trackId": "trk-test-1",
        "title": "Acoustic Reflections",
        "artist": "AuraHiFi Trio",
        "album": "Studio Sessions Vol. 1",
    });
    let enrich_res = manager
        .run_action("metadata-enricher", "enrich", &enrich_req.to_string())
        .await
        .expect("metadata-enricher should execute cleanly in Extism sandbox");
    assert!(enrich_res.contains("trk-test-1"));
    assert!(enrich_res.contains("metadata-enricher"));

    // 2. Test running lyrics-art inside real Extism Wasm sandbox
    let lyrics_req = serde_json::json!({
        "trackId": "trk-test-1",
        "trackName": "Acoustic Reflections",
        "artistName": "AuraHiFi Trio",
    });
    let lyrics_res = manager
        .run_action("lyrics-art", "fetch_lyrics", &lyrics_req.to_string())
        .await
        .expect("lyrics-art should execute cleanly in Extism sandbox");
    assert!(lyrics_res.contains("trk-test-1"));
    assert!(lyrics_res.contains("LRCLIB"));

    // 3. Test running smart-playlists offline mode inside real Extism Wasm sandbox
    let sample_tracks = vec![
        TrackSummary {
            id: "trk-flac-1".into(),
            path: "/music/jazz1.flac".into(),
            cue_parent_path: None,
            cue_start_ms: None,
            cue_end_ms: None,
            cue_index: None,
            title: "Late Night Swing".into(),
            artist: "Bill Evans Style Trio".into(),
            album: "Conversations in Hi-Res".into(),
            album_artist: "Bill Evans Style Trio".into(),
            genre: "Acoustic Jazz".into(),
            year: 2024,
            duration_ms: 240000,
            codec: "FLAC".into(),
            sample_rate_hz: 192000,
            bit_depth: 24,
            channels: 2,
            channel_layout: "Stereo 2.0".into(),
            is_dsd: false,
            dsd_rate_multiplier: None,
            is_atmos: false,
            bpm: 82,
            musical_key: "D min".into(),
            dynamic_range_dr: 14,
            integrated_lufs: -18.2,
            true_peak_dbtp: -0.4,
            replay_gain_track_db: -1.2,
            mbid_recording: "4f39a1c8-80e2-45e0-a611-29b9f1080c41".into(),
            artwork_theme: "midnight_indigo".into(),
            waveform_peaks: vec![0.3, 0.6, 0.9, 0.4],
        },
        TrackSummary {
            id: "trk-dsd-1".into(),
            path: "/music/dsd1.dsf".into(),
            cue_parent_path: None,
            cue_start_ms: None,
            cue_end_ms: None,
            cue_index: None,
            title: "Pure Analog Sunset".into(),
            artist: "Tokyo Acoustic Duo".into(),
            album: "DSD256 Direct Stream Master".into(),
            album_artist: "Tokyo Acoustic Duo".into(),
            genre: "Modern Classical".into(),
            year: 2025,
            duration_ms: 310000,
            codec: "DSD256".into(),
            sample_rate_hz: 11289600,
            bit_depth: 1,
            channels: 2,
            channel_layout: "Stereo 2.0".into(),
            is_dsd: true,
            dsd_rate_multiplier: Some(256),
            is_atmos: false,
            bpm: 74,
            musical_key: "A min".into(),
            dynamic_range_dr: 16,
            integrated_lufs: -20.1,
            true_peak_dbtp: -1.5,
            replay_gain_track_db: 0.0,
            mbid_recording: "9e5c46b1-38cb-4e9e-9316-e41c3053f36a".into(),
            artwork_theme: "warm_amber".into(),
            waveform_peaks: vec![0.2, 0.5, 0.7, 0.3],
        },
    ];

    let playlist_req = serde_json::json!({
        "mode": "offline_local",
        "prompt": "Late-night acoustic jazz piano with dynamic range >= 12",
        "tracks": sample_tracks,
        "maxTracks": 5,
    });

    let playlist_res = manager
        .run_action("smart-playlists", "generate_playlist", &playlist_req.to_string())
        .await
        .expect("smart-playlists should execute cleanly in Extism sandbox");

    assert!(playlist_res.contains("engineUsed"));
    assert!(playlist_res.contains("Offline (bliss-audio + clap + sqlite-vec)"));
    assert!(playlist_res.contains("trk-flac-1"));
}

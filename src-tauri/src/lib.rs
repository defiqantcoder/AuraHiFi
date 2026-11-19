pub mod addons;
pub mod audio;
pub mod commands;
pub mod library;
pub mod models;
pub mod spatial;
pub mod state;

use tauri::Manager;

use audio::{device_monitor, mpris};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_keyring_store::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_state = app.state::<AppState>().inner().clone();

            // Initialize local SQLite library database in Tauri app data directory
            if let Ok(data_dir) = app.path().app_data_dir() {
                let db_path = data_dir.join("library.db");
                if let Ok(db) = crate::library::LibraryDb::open_or_create(&db_path) {
                    let folders = db.list_library_folders().unwrap_or_default();
                    let tracks = db.list_tracks().unwrap_or_default();
                    let inner = app_state.inner.clone();
                    tokio::spawn(async move {
                        let mut guard = inner.write().await;
                        guard.library_folders = folders;
                        guard.tracks = tracks;
                    });
                    *app_state.db.lock().unwrap() = Some(db);
                }
            }

            // Discover and verify first-party signed Wasm add-ons from bundle.resources and local dev paths
            let mut search_paths = Vec::new();
            if let Ok(resource_dir) = app.path().resource_dir() {
                search_paths.push(resource_dir.join("addons/dist"));
                search_paths.push(resource_dir);
            }
            search_paths.push(std::path::PathBuf::from("src-tauri/addons/dist"));
            search_paths.push(std::path::PathBuf::from("addons/dist"));

            let addon_mgr = app_state.addon_manager.clone();
            let inner_state = app_state.inner.clone();
            tokio::spawn(async move {
                addon_mgr.discover_bundled_addons(&search_paths).await;
                let catalog_items = addon_mgr.list_catalog_items().await;
                if !catalog_items.is_empty() {
                    let mut guard = inner_state.write().await;
                    guard.addons = catalog_items;
                }
            });

            device_monitor::spawn_udev_monitor(app_state.clone());
            mpris::spawn_mpris_server(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_audio_devices,
            commands::select_audio_device,
            commands::test_dac_capabilities,
            commands::generate_pipewire_config,
            commands::set_audio_mode,
            commands::update_spatial_config,
            commands::transport_command,
            commands::scan_library,
            commands::get_onboarding_status,
            commands::complete_onboarding,
            commands::list_library_folders,
            commands::add_library_folder,
            commands::remove_library_folder,
            commands::set_library_folder_watch,
            commands::subscribe_scan_progress,
            commands::unsubscribe_scan_progress,
            commands::list_store_addons,
            commands::install_addon,
            commands::toggle_addon_enabled,
            commands::run_addon_action,
            commands::generate_smart_playlist,
            commands::list_tracks,
            commands::get_lyrics,
            commands::get_signal_path,
            commands::get_spatial_config,
            commands::get_playback_state,
            commands::subscribe_telemetry,
            commands::unsubscribe_telemetry,
            commands::subscribe_hardware_events,
            commands::unsubscribe_hardware_events,
            commands::set_device_dsd_mode,
            commands::simulate_usb_dac_plug_in,
            commands::simulate_alsa_ebusy,
            commands::force_claim_dbus_reservation,
            commands::simulate_usb_dac_hot_unplug,
            commands::simulate_usb_dac_reconnect,
            commands::simulate_musicbrainz_503_backoff,
            commands::get_gemini_api_key_status,
            commands::set_gemini_api_key,
            commands::clear_gemini_api_key,
            commands::set_api_credential,
            commands::get_api_credential_status,
            commands::delete_api_credential,
            commands::test_api_credential,
            commands::explain_audio_term,
            commands::enrich_track_metadata,
            commands::apply_approved_tag_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AuraHiFi Tauri application");
}

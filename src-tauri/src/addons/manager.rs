//! Extism host manager, sandbox orchestrator, and lifecycle manager for AuraHiFi add-ons.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use extism::{Manifest as ExtismManifest, PluginBuilder, Wasm};
use tokio::sync::RwLock;

use crate::library::db::LibraryDb;
use crate::models::{AddonCatalogItem, AddonPermissions, TrackSummary};

use super::host_functions::{create_host_functions, HostContext};
use super::manifest::AddonManifest;
use super::verifier::{verify_addon, VerificationReport};

pub struct LoadedAddon {
    pub manifest: AddonManifest,
    pub wasm_bytes: Vec<u8>,
    pub wasm_path: PathBuf,
    pub enabled: bool,
    pub installed: bool,
    pub verification: VerificationReport,
}

pub struct AddonManager {
    pub ctx: Arc<HostContext>,
    addons: Arc<RwLock<HashMap<String, LoadedAddon>>>,
}

impl AddonManager {
    pub fn new(db: Option<LibraryDb>) -> Self {
        let ctx = Arc::new(HostContext::new(db));
        Self {
            ctx,
            addons: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Load an add-on from a directory containing `manifest.json` and `plugin.wasm` (or `<id>.wasm`).
    pub async fn load_addon_from_dir(
        &self,
        dir: &Path,
        developer_mode: bool,
    ) -> Result<AddonCatalogItem, String> {
        let manifest_path = dir.join("manifest.json");
        if !manifest_path.exists() {
            return Err(format!("manifest.json not found in {}", dir.display()));
        }

        let manifest_str = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("Failed to read manifest.json: {e}"))?;
        let manifest: AddonManifest = serde_json::from_str(&manifest_str)
            .map_err(|e| format!("Invalid manifest.json in {}: {e}", dir.display()))?;

        // Locate .wasm binary
        let mut wasm_path = dir.join("plugin.wasm");
        if !wasm_path.exists() {
            wasm_path = dir.join(format!("{}.wasm", manifest.id));
        }
        if !wasm_path.exists() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map(|e| e == "wasm").unwrap_or(false) {
                        wasm_path = p;
                        break;
                    }
                }
            }
        }

        if !wasm_path.exists() {
            return Err(format!("No .wasm binary found in {}", dir.display()));
        }

        let wasm_bytes = std::fs::read(&wasm_path)
            .map_err(|e| format!("Failed to read wasm binary: {e}"))?;

        // Cryptographic verification
        let verification = verify_addon(&manifest, &wasm_bytes, developer_mode)?;

        let wasm_size_kb = (wasm_bytes.len() / 1024) as u32;

        let item = AddonCatalogItem {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            latest_version: manifest.version.clone(),
            has_update: false,
            author: manifest.author.clone(),
            category: manifest.plugin_type.clone(),
            license_tag: manifest.license.clone(),
            description: manifest.description.clone(),
            sha256: verification.sha256.clone(),
            signature_verified: verification.verified,
            signer_key_id: manifest.signer_key_id.clone(),
            wasm_size_kb,
            installed: true,
            enabled: true,
            permissions: AddonPermissions {
                allowed_hosts: manifest.allowed_hosts.clone(),
                library_read: true,
                library_write_tags: manifest.host_functions.contains(&"propose_tag_diff".into()),
                audio_buffer_read_only: manifest.host_functions.contains(&"compute_chromaprint_fp".into()),
                wasi_enabled: false,
                host_functions: manifest.host_functions.clone(),
                max_memory_mb: manifest.max_memory_mb,
                max_cpu_ms_per_call: 3000,
            },
        };

        let loaded = LoadedAddon {
            manifest,
            wasm_bytes,
            wasm_path: wasm_path.clone(),
            enabled: true,
            installed: true,
            verification,
        };

        let mut guard = self.addons.write().await;
        guard.insert(item.id.clone(), loaded);

        // Record in SQLite if DB is connected
        let ctx_guard = self.ctx.clone();
        if let Some(ref db) = ctx_guard.db {
            let perms_json = serde_json::to_string(&item.permissions).unwrap_or_default();
            let _ = db.record_installed_addon(
                &item.id,
                &item.version,
                &item.sha256,
                item.signature_verified,
                item.enabled,
                &perms_json,
                &wasm_path.to_string_lossy(),
                crate::state::now_ms(),
            );
        }

        Ok(item)
    }

    /// Discover and register bundled add-ons from `src-tauri/addons/dist/` or resource dirs.
    pub async fn discover_bundled_addons(&self, base_paths: &[PathBuf]) {
        for base in base_paths {
            if !base.exists() {
                continue;
            }

            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let _ = self.load_addon_from_dir(&path, false).await;
                    }
                }
            }
        }
    }

    /// List all catalog items for registered add-ons.
    pub async fn list_catalog_items(&self) -> Vec<AddonCatalogItem> {
        let guard = self.addons.read().await;
        guard
            .values()
            .map(|loaded| {
                let m = &loaded.manifest;
                AddonCatalogItem {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    version: m.version.clone(),
                    latest_version: m.version.clone(),
                    has_update: false,
                    author: m.author.clone(),
                    category: m.plugin_type.clone(),
                    license_tag: m.license.clone(),
                    description: m.description.clone(),
                    sha256: loaded.verification.sha256.clone(),
                    signature_verified: loaded.verification.verified,
                    signer_key_id: m.signer_key_id.clone(),
                    wasm_size_kb: (loaded.wasm_bytes.len() / 1024) as u32,
                    installed: loaded.installed,
                    enabled: loaded.enabled,
                    permissions: AddonPermissions {
                        allowed_hosts: m.allowed_hosts.clone(),
                        library_read: true,
                        library_write_tags: m.host_functions.contains(&"propose_tag_diff".into()),
                        audio_buffer_read_only: m.host_functions.contains(&"compute_chromaprint_fp".into()),
                        wasi_enabled: false,
                        host_functions: m.host_functions.clone(),
                        max_memory_mb: m.max_memory_mb,
                        max_cpu_ms_per_call: 3000,
                    },
                }
            })
            .collect()
    }

    /// Toggle enabled state of an installed add-on.
    pub async fn toggle_enabled(&self, id: &str, enabled: bool) -> Result<bool, String> {
        let mut guard = self.addons.write().await;
        let addon = guard
            .get_mut(id)
            .ok_or_else(|| format!("Add-on '{}' not found", id))?;
        addon.enabled = enabled;
        Ok(enabled)
    }

    /// Execute an action in the sandboxed Extism Wasm module.
    pub async fn run_action(
        &self,
        addon_id: &str,
        action: &str,
        payload_json: &str,
    ) -> Result<String, String> {
        let (wasm_bytes, allowed_hosts, max_memory_mb) = {
            let guard = self.addons.read().await;
            let loaded = guard
                .get(addon_id)
                .ok_or_else(|| format!("Add-on '{addon_id}' is not installed"))?;

            if !loaded.enabled {
                return Err(format!("Add-on '{addon_id}' is disabled by user policy"));
            }

            (
                loaded.wasm_bytes.clone(),
                loaded.manifest.allowed_hosts.clone(),
                loaded.manifest.max_memory_mb,
            )
        };

        // Construct Extism Manifest with deny-by-default HTTP host allowlist
        let wasm = Wasm::data(wasm_bytes);
        let mut manifest = ExtismManifest::new([wasm]);
        for host in allowed_hosts {
            manifest = manifest.with_allowed_host(host);
        }

        // Enforce deterministic memory page cap and 3-second timeout DoS defense
        let max_pages = (((max_memory_mb as u64) * 1024 * 1024) / 65536).min(2048) as u32;
        manifest = manifest
            .with_memory_max(max_pages.max(16))
            .with_timeout(std::time::Duration::from_millis(3000));

        let functions = create_host_functions(self.ctx.clone());

        // Build plugin with WASI disabled, CPU fuel limit (100M instructions), and strict sandboxing
        let mut plugin = PluginBuilder::new(manifest)
            .with_wasi(false)
            .with_fuel_limit(100_000_000)
            .with_functions(functions)
            .build()
            .map_err(|e| format!("Failed to instantiate Extism sandbox for '{addon_id}': {e}"))?;

        // First attempt calling specific action function name
        if plugin.function_exists(action) {
            let res: String = plugin
                .call(action, payload_json)
                .map_err(|e| format!("Sandbox call '{action}' error: {e}"))?;
            return Ok(res);
        }

        // Fall back to generic `run_action` export
        if plugin.function_exists("run_action") {
            let action_req = serde_json::json!({
                "action": action,
                "payload": payload_json
            });
            let res: String = plugin
                .call("run_action", action_req.to_string())
                .map_err(|e| format!("Sandbox call 'run_action' error: {e}"))?;
            return Ok(res);
        }

        Err(format!(
            "Add-on '{addon_id}' does not export function '{action}' or 'run_action'"
        ))
    }

    /// Update in-memory tracks for host function lookup.
    pub fn update_memory_tracks(&self, tracks: &[TrackSummary]) {
        let mut guard = self.ctx.memory_tracks.lock().unwrap();
        *guard = tracks.to_vec();
    }
}

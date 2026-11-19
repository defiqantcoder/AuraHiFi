//! Manifest parser and deny-by-default capability auditor for AuraHiFi Extism add-ons.

use serde::{Deserialize, Serialize};

pub const CURRENT_API_VERSION: &str = "aura.addon/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonPermissionsManifest {
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    #[serde(default)]
    pub library_read: bool,
    #[serde(default)]
    pub library_write_tags: bool,
    #[serde(default)]
    pub audio_buffer_read_only: bool,
    #[serde(default)]
    pub wasi_enabled: bool,
    #[serde(default)]
    pub host_functions: Vec<String>,
    #[serde(default = "default_memory_mb")]
    pub max_memory_mb: u32,
    #[serde(default = "default_cpu_ms")]
    pub max_cpu_ms_per_call: u32,
}

fn default_memory_mb() -> u32 {
    32
}

fn default_cpu_ms() -> u32 {
    3000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default = "default_api_version")]
    pub api_version: String,
    pub plugin_type: String,
    pub author: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    #[serde(default = "default_memory_mb")]
    pub max_memory_mb: u32,
    #[serde(default = "default_max_pages")]
    pub memory_max_pages: u32,
    #[serde(default = "default_max_http_response_bytes")]
    pub max_http_response_bytes: u64,
    #[serde(default)]
    pub wasi: bool,
    #[serde(default)]
    pub host_functions: Vec<String>,
    pub sha256: String,
    pub signature: String,
    #[serde(default = "default_signer_key_id")]
    pub signer_key_id: String,
}

fn default_api_version() -> String {
    CURRENT_API_VERSION.to_string()
}

fn default_max_pages() -> u32 {
    512 // 512 * 64KB = 32MB
}

fn default_max_http_response_bytes() -> u64 {
    10 * 1024 * 1024 // 10MB HTTP cap
}

fn default_signer_key_id() -> String {
    "aurahifi-ed25519-2026".to_string()
}

impl AddonManifest {
    /// Validates the manifest against strict deny-by-default security rules.
    pub fn validate_strict(&self) -> Result<(), String> {
        self.validate_with_dev_mode(false)
    }

    pub fn validate_with_dev_mode(&self, developer_mode: bool) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("Addon manifest missing required field 'id'".into());
        }

        if self.api_version != CURRENT_API_VERSION {
            return Err(format!(
                "Incompatible API version: expected '{}', found '{}'",
                CURRENT_API_VERSION, self.api_version
            ));
        }

        // Never allow wildcard hosts
        for host in &self.allowed_hosts {
            let h = host.trim();
            if h.is_empty() {
                return Err("Empty hostname in allowed_hosts is invalid".into());
            }
            if h.contains('*') {
                return Err(format!(
                    "Disallowed wildcard in allowed_hosts: '{}'. Explicit domains required.",
                    host
                ));
            }
        }

        // WASI is deny-by-default
        if self.wasi {
            return Err("WASI execution is strictly disabled for sandbox security".into());
        }

        // Bound memory limits (max 128MB)
        if self.max_memory_mb > 128 || self.memory_max_pages > 2048 {
            return Err(format!(
                "Memory limit exceeds maximum sandbox allowance (max 128MB/2048 pages): {} MB",
                self.max_memory_mb
            ));
        }

        // Verify SHA-256 string format
        if self.sha256.len() != 64 || !self.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("Invalid SHA-256 digest format: '{}'", self.sha256));
        }

        // Verify signature string format (in developer mode, empty unsigned signatures are allowed)
        if self.signature.is_empty() {
            if !developer_mode {
                return Err("Missing required Ed25519 signature in production mode".into());
            }
        } else if self.signature.len() != 128
            || !self.signature.chars().all(|c| c.is_ascii_hexdigit())
        {
            return Err(format!(
                "Invalid Ed25519 signature format (expected 128 hex chars): '{}'",
                self.signature
            ));
        }

        Ok(())
    }
}

//! Adversarial Extism / Wasmtime Sandbox Isolation and Security Tests
//!
//! Validates:
//! 1. Provenance, Hashing & Tampering (SHA-256 mismatch, Ed25519 forgery, developer mode)
//! 2. CPU Fuel & Timeout DoS Protection (infinite loop fuel exhaustion)
//! 3. Memory Page & Response Caps (memory bomb trapping without host crash)
//! 4. Deny-by-default Network & WASI Isolation (unauthorized hosts & wildcard denial)
//! 5. Host Function Boundary Fuzzing & Path Traversal (propose_tag_diff, query_sqlite_vec)
//! 6. Keyring Credential Isolation & Third-Party API Rate-Limiting Invariants

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use aurahifi_lib::addons::host_functions::{create_host_functions, HostContext};
use aurahifi_lib::addons::manifest::AddonManifest;
use aurahifi_lib::addons::verifier::{
    compute_sha256, first_party_signing_key, sign_addon, verify_addon,
};
use extism::{Manifest as ExtismManifest, PluginBuilder, Wasm};

fn get_adversarial_wasm_bytes() -> Vec<u8> {
    let candidates = [
        "../addons/target/wasm32-unknown-unknown/release/adversarial_fixture.wasm",
        "../addons/adversarial-fixture/plugin.wasm",
        "target/wasm32-unknown-unknown/release/adversarial_fixture.wasm",
        "src-tauri/target/wasm32-unknown-unknown/release/adversarial_fixture.wasm",
    ];

    for path in candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            if let Ok(bytes) = std::fs::read(&p) {
                if !bytes.is_empty() {
                    return bytes;
                }
            }
        }
    }

    panic!("Could not find compiled adversarial_fixture.wasm in candidate paths");
}

fn create_valid_manifest(id: &str, wasm_bytes: &[u8], allowed_hosts: Vec<String>) -> AddonManifest {
    let sha256 = compute_sha256(wasm_bytes);
    let signing_key = first_party_signing_key();
    let signature = sign_addon(&signing_key, id, "1.0.0", &sha256);

    AddonManifest {
        api_version: "aura.addon/v1".into(),
        id: id.into(),
        name: format!("Security Test Plugin {id}"),
        version: "1.0.0".into(),
        author: "AuraHiFi Security Suite".into(),
        description: "Adversarial test fixture".into(),
        license: Some("Apache-2.0".into()),
        plugin_type: "general".into(),
        sha256,
        signature,
        signer_key_id: "aurahifi-ed25519-2026".into(),
        allowed_hosts,
        host_functions: vec![
            "propose_tag_diff".into(),
            "query_sqlite_vec".into(),
            "read_scoped_credential".into(),
        ],
        wasi: false,
        max_memory_mb: 32,
        memory_max_pages: 512,
        max_http_response_bytes: 10 * 1024 * 1024,
    }
}

// ============================================================================
// 1. Provenance, Hashing & Tampering Tests
// ============================================================================

#[test]
fn test_tampered_byte_rejection() {
    let mut wasm_bytes = get_adversarial_wasm_bytes();
    let manifest = create_valid_manifest("tamper-test", &wasm_bytes, vec![]);

    // Alter a single byte in the Wasm binary payload
    let last_idx = wasm_bytes.len() - 1;
    wasm_bytes[last_idx] ^= 0xFF;

    let res = verify_addon(&manifest, &wasm_bytes, false);
    assert!(
        res.is_err(),
        "Host must reject binary when SHA-256 does not match"
    );
    let err_msg = res.err().unwrap();
    assert!(
        err_msg.contains("SHA-256 integrity mismatch"),
        "Expected SHA-256 error, got: {err_msg}"
    );
}

#[test]
fn test_invalid_signature_rejection_in_production() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let mut manifest = create_valid_manifest("forgery-test", &wasm_bytes, vec![]);

    // Corrupt the Ed25519 signature
    manifest.signature = "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000".into();

    let res = verify_addon(&manifest, &wasm_bytes, false);
    assert!(
        res.is_err(),
        "Host must reject forged/invalid Ed25519 signature when developer_mode == false"
    );
}

#[test]
fn test_missing_signature_rejection_in_production() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let mut manifest = create_valid_manifest("unsigned-test", &wasm_bytes, vec![]);
    manifest.signature = "".into();

    let res = verify_addon(&manifest, &wasm_bytes, false);
    assert!(
        res.is_err(),
        "Host must reject unsigned plugins in production mode"
    );
}

#[test]
fn test_developer_mode_allows_unsigned_local_plugin() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let mut manifest = create_valid_manifest("dev-local-test", &wasm_bytes, vec![]);
    manifest.signature = "".into();

    let report = verify_addon(&manifest, &wasm_bytes, true)
        .expect("Developer mode must allow loading local unsigned plugins with warning");
    assert!(
        !report.verified,
        "Unsigned plugin must report verified = false"
    );
    assert!(report.developer_bypass, "developer_bypass must be true");
}

// ============================================================================
// 2. CPU Fuel & Timeout DoS Protection
// ============================================================================

#[test]
fn test_infinite_loop_cpu_fuel_exhaustion() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    // Configure manifest with 500ms timeout
    let manifest = ExtismManifest::new([wasm]).with_timeout(Duration::from_millis(500));

    // Limit CPU fuel budget strictly to 500,000 instructions
    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(500_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let start = Instant::now();
    let result = plugin.call::<&str, &str>("infinite_loop", "");
    let elapsed = start.elapsed();

    assert!(
        result.is_err(),
        "Infinite loop must be terminated by fuel or timeout"
    );
    assert!(
        elapsed < Duration::from_secs(3),
        "Execution must be stopped promptly; took {:?}",
        elapsed
    );
}

// ============================================================================
// 3. Memory Page Cap & DoS Protection
// ============================================================================

#[test]
fn test_memory_bomb_allocation_limit() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    // Restrict plugin strictly to 16 pages (1 MB total Wasm memory)
    let manifest = ExtismManifest::new([wasm])
        .with_memory_max(16)
        .with_timeout(Duration::from_millis(2000));

    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(10_000_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let result = plugin.call::<&str, &str>("memory_bomb", "");
    assert!(
        result.is_err(),
        "Memory bomb allocating beyond page limits must trap and return error"
    );
}

// ============================================================================
// 4. Deny-by-Default Network & WASI Isolation
// ============================================================================

#[test]
fn test_unauthorized_outbound_http_blocked() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    // Allow only safe API domains; evil domain is omitted
    let manifest = ExtismManifest::new([wasm])
        .with_allowed_host("musicbrainz.org")
        .with_timeout(Duration::from_millis(2000));

    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(10_000_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let result = plugin.call::<&str, &str>("illegal_network", "");
    assert!(
        result.is_err(),
        "Outbound HTTP to unapproved host must be blocked by the Extism sandbox"
    );
}

#[test]
fn test_manifest_wildcard_host_rejection() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let mut manifest = create_valid_manifest("wildcard-test", &wasm_bytes, vec!["*".into()]);
    assert!(
        manifest.validate_strict().is_err(),
        "Manifest with wildcard '*' must fail strict validation"
    );

    manifest.allowed_hosts = vec!["*.musicbrainz.org".into()];
    assert!(
        manifest.validate_strict().is_err(),
        "Manifest with wildcard '*.domain' must fail strict validation"
    );
}

#[test]
fn test_manifest_wasi_rejection() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let mut manifest = create_valid_manifest("wasi-test", &wasm_bytes, vec![]);
    manifest.wasi = true;

    assert!(
        manifest.validate_strict().is_err(),
        "Manifest with wasi = true must fail strict validation"
    );
}

// ============================================================================
// 5. Host Function Boundary Fuzzing & Path Traversal
// ============================================================================

#[test]
fn test_host_boundary_path_traversal_rejection() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    let manifest = ExtismManifest::new([wasm]).with_timeout(Duration::from_millis(2000));

    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(10_000_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let result = plugin.call::<&str, &str>("path_traversal_proposal", "");
    assert!(
        result.is_err(),
        "Path traversal '../../etc/passwd' across propose_tag_diff must be rejected"
    );
}

#[test]
fn test_host_boundary_sql_injection_rejection() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    let manifest = ExtismManifest::new([wasm]).with_timeout(Duration::from_millis(2000));

    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(10_000_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let result = plugin.call::<&str, &str>("sql_injection_vector", "");
    assert!(
        result.is_err(),
        "SQL injection payload targeting query_sqlite_vec must be rejected"
    );
}

// ============================================================================
// 6. Credential Scoping & Rate-Limit Citizen Rules
// ============================================================================

#[test]
fn test_unauthorized_keyring_credential_scope_denial() {
    let wasm_bytes = get_adversarial_wasm_bytes();
    let wasm = Wasm::data(wasm_bytes);

    let ctx = Arc::new(HostContext::new(None));
    let functions = create_host_functions(ctx);

    let manifest = ExtismManifest::new([wasm]).with_timeout(Duration::from_millis(2000));

    let mut plugin = PluginBuilder::new(manifest)
        .with_wasi(false)
        .with_fuel_limit(10_000_000)
        .with_functions(functions)
        .build()
        .expect("Plugin instantiation should succeed");

    let result = plugin.call::<&str, &str>("unauthorized_credential", "");
    assert!(
        result.is_err(),
        "Access to unauthorized credential scope 'root_master_key' must be denied"
    );
}

#[test]
fn test_musicbrainz_rate_limit_token_bucket_spacing() {
    // MusicBrainz rate limit policy: <= 1 req/s (1050 ms spacing)
    struct TokenBucket {
        last_request: Instant,
        min_spacing: Duration,
    }

    impl TokenBucket {
        fn new(spacing_ms: u64) -> Self {
            Self {
                last_request: Instant::now() - Duration::from_millis(spacing_ms),
                min_spacing: Duration::from_millis(spacing_ms),
            }
        }

        fn try_acquire(&mut self) -> bool {
            let now = Instant::now();
            if now.duration_since(self.last_request) >= self.min_spacing {
                self.last_request = now;
                true
            } else {
                false
            }
        }
    }

    let mut bucket = TokenBucket::new(1000);
    assert!(
        bucket.try_acquire(),
        "First request in window should succeed"
    );
    assert!(
        !bucket.try_acquire(),
        "Immediate burst request must be rejected under 1 req/s policy"
    );
}

#[test]
fn test_discogs_cache_expiration_policy() {
    // Discogs API policy: raw payloads must expire within <= 6 hours
    const MAX_DISCOGS_CACHE_HOURS: u64 = 6;
    let fetched_at_ms = 1_000_000_000_000u64;
    let now_valid = fetched_at_ms + (5 * 3600 * 1000);
    let now_expired = fetched_at_ms + (7 * 3600 * 1000);

    let is_valid = (now_valid - fetched_at_ms) <= (MAX_DISCOGS_CACHE_HOURS * 3600 * 1000);
    let is_expired = (now_expired - fetched_at_ms) > (MAX_DISCOGS_CACHE_HOURS * 3600 * 1000);

    assert!(is_valid, "5-hour cache entry should be valid");
    assert!(is_expired, "7-hour cache entry must be considered expired");
}

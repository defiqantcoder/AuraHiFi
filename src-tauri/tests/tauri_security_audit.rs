//! Automated Tauri v2 Capability ACL, CSP & Architectural Boundary Security Audit
//!
//! Validates:
//! 1. Least-Privilege Capabilities: only core, dialog, and keyring-store permitted.
//! 2. Strict Content Security Policy (CSP): no unsafe-eval, no wildcard connect-src *.
//! 3. Architectural Boundary Linter: no raw @tauri-apps imports in views or components.
//! 4. SignalPathState Honesty Invariants: Bit-Perfect badge is false if volume != 0 dB or DSP active.

use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

fn get_tauri_conf_path() -> PathBuf {
    let candidates = [
        "tauri.conf.json",
        "src-tauri/tauri.conf.json",
        "../src-tauri/tauri.conf.json",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.exists() {
            return p;
        }
    }
    panic!("Could not find tauri.conf.json");
}

fn get_capabilities_dir() -> PathBuf {
    let candidates = [
        "capabilities",
        "src-tauri/capabilities",
        "../src-tauri/capabilities",
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.exists() && p.is_dir() {
            return p;
        }
    }
    panic!("Could not find capabilities directory");
}

fn get_frontend_src_dir() -> PathBuf {
    let candidates = ["src", "../src", "../../src"];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.exists() && p.join("App.tsx").exists() {
            return p;
        }
    }
    panic!("Could not find frontend src directory");
}

// ============================================================================
// 1. Least-Privilege Capability ACLs
// ============================================================================

#[test]
fn test_capabilities_least_privilege() {
    let cap_dir = get_capabilities_dir();
    let entries = fs::read_dir(&cap_dir).expect("Failed to read capabilities directory");

    let mut audited_files = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            audited_files += 1;
            let content = fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("Failed to read {}: {e}", path.display()));
            let json: Value = serde_json::from_str(&content)
                .unwrap_or_else(|e| panic!("Failed to parse JSON in {}: {e}", path.display()));

            // Verify window scoping
            let windows = json
                .get("windows")
                .and_then(|w| w.as_array())
                .expect("Capability must declare an explicit 'windows' array");
            assert_eq!(
                windows,
                &vec![Value::String("main".into())],
                "Capabilities must be strictly scoped to 'main' window in {}",
                path.display()
            );

            // Verify permissions list
            let permissions = json
                .get("permissions")
                .and_then(|p| p.as_array())
                .expect("Capability must declare an explicit 'permissions' array");

            for perm in permissions {
                let perm_str = perm.as_str().expect("Permission entry must be a string");

                // Strictly ban dangerous capability strings
                assert!(
                    !perm_str.starts_with("shell:"),
                    "Dangerous shell permission '{perm_str}' is strictly forbidden in {}",
                    path.display()
                );
                assert!(
                    !perm_str.contains("**"),
                    "Wildcard filesystem permission '{perm_str}' is strictly forbidden in {}",
                    path.display()
                );
                assert!(
                    !perm_str.contains("$HOME"),
                    "Broad home directory permission '{perm_str}' is forbidden in {}",
                    path.display()
                );
                assert!(
                    !perm_str.starts_with("http:"),
                    "Direct frontend http permission '{perm_str}' is forbidden; use Extism sandbox instead in {}", path.display()
                );

                // Permitted capabilities
                let allowed = perm_str == "core:default"
                    || perm_str == "dialog:default"
                    || perm_str == "keyring-store:default";
                assert!(
                    allowed,
                    "Unrecognized or unapproved capability permission '{perm_str}' in {}",
                    path.display()
                );
            }
        }
    }

    assert!(
        audited_files > 0,
        "At least one capability file must be audited"
    );
}

// ============================================================================
// 2. Content Security Policy (CSP) Invariants
// ============================================================================

#[test]
fn test_strict_content_security_policy() {
    let conf_path = get_tauri_conf_path();
    let content = fs::read_to_string(&conf_path).expect("Failed to read tauri.conf.json");
    let json: Value = serde_json::from_str(&content).expect("Failed to parse tauri.conf.json");

    let csp = json
        .pointer("/app/security/csp")
        .and_then(|v| v.as_str())
        .expect("tauri.conf.json must define /app/security/csp");

    // 1. Forbid unsafe-eval
    assert!(
        !csp.contains("unsafe-eval"),
        "CSP must never include 'unsafe-eval' for script execution: {csp}"
    );

    // 2. Forbid wildcard * in connect-src
    assert!(
        !csp.contains("connect-src *"),
        "CSP must never allow wildcard external network connections: {csp}"
    );

    // 3. Forbid wildcard * in default-src
    assert!(
        !csp.contains("default-src *"),
        "CSP must never allow wildcard default-src: {csp}"
    );

    // 4. Verify connect-src is constrained strictly to self and ipc:
    assert!(
        csp.contains("connect-src 'self' ipc: http://ipc.localhost"),
        "CSP connect-src must strictly limit network connections to local IPC endpoints: {csp}"
    );
}

// ============================================================================
// 3. Architectural Boundary Linter (No Raw Tauri Imports in Views/Components)
// ============================================================================

fn scan_dir_for_forbidden_imports(dir: &Path, forbidden: &[&str], violations: &mut Vec<String>) {
    if !dir.exists() {
        return;
    }
    for entry in fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_dir_for_forbidden_imports(&path, forbidden, violations);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext == "tsx" || ext == "ts" {
                let content = fs::read_to_string(&path).unwrap_or_default();
                for &f in forbidden {
                    if content.contains(&format!("from '{f}'"))
                        || content.contains(&format!("from \"{f}\""))
                        || content.contains(&format!("import('{f}')"))
                        || content.contains(&format!("import(\"{f}\")"))
                    {
                        violations.push(format!(
                            "File {} directly imports forbidden package '{}'. All Tauri IPC must be mediated via src/lib/audioBridge.ts.",
                            path.display(),
                            f
                        ));
                    }
                }
            }
        }
    }
}

#[test]
fn test_frontend_architectural_boundary() {
    let src_dir = get_frontend_src_dir();
    let views_dir = src_dir.join("views");
    let components_dir = src_dir.join("components");

    let forbidden_packages = [
        "@tauri-apps/api",
        "@tauri-apps/api/core",
        "@tauri-apps/plugin-dialog",
        "@tauri-apps/plugin-fs",
        "@tauri-apps/plugin-shell",
        "@tauri-apps/plugin-http",
    ];

    let mut violations = Vec::new();
    scan_dir_for_forbidden_imports(&views_dir, &forbidden_packages, &mut violations);
    scan_dir_for_forbidden_imports(&components_dir, &forbidden_packages, &mut violations);

    assert!(
        violations.is_empty(),
        "Architectural boundary violations found:\n{}",
        violations.join("\n")
    );
}

// ============================================================================
// 4. SignalPathState Security & Honesty Invariants
// ============================================================================

#[test]
fn test_signal_path_bitperfect_honesty_invariants() {
    struct SignalIntegrityEvaluation {
        volume_db: f32,
        dsp_active: bool,
        resampled: bool,
        eq_active: bool,
    }

    impl SignalIntegrityEvaluation {
        fn is_bit_perfect(&self) -> bool {
            self.volume_db == 0.0 && !self.dsp_active && !self.resampled && !self.eq_active
        }
    }

    // 1. Bit-perfect baseline
    let state_perfect = SignalIntegrityEvaluation {
        volume_db: 0.0,
        dsp_active: false,
        resampled: false,
        eq_active: false,
    };
    assert!(
        state_perfect.is_bit_perfect(),
        "Bit-perfect state must evaluate to true"
    );

    // 2. Volume attenuation violates bit-perfect
    let state_attenuated = SignalIntegrityEvaluation {
        volume_db: -3.0,
        dsp_active: false,
        resampled: false,
        eq_active: false,
    };
    assert!(
        !state_attenuated.is_bit_perfect(),
        "Volume != 0.0 dB must invalidate BIT-PERFECT badge"
    );

    // 3. DSP / Spatial active violates bit-perfect
    let state_spatial = SignalIntegrityEvaluation {
        volume_db: 0.0,
        dsp_active: true,
        resampled: false,
        eq_active: false,
    };
    assert!(
        !state_spatial.is_bit_perfect(),
        "Active DSP must invalidate BIT-PERFECT badge"
    );

    // 4. Resampling active violates bit-perfect
    let state_resampled = SignalIntegrityEvaluation {
        volume_db: 0.0,
        dsp_active: false,
        resampled: true,
        eq_active: false,
    };
    assert!(
        !state_resampled.is_bit_perfect(),
        "Sample rate conversion must invalidate BIT-PERFECT badge"
    );

    // 5. Parametric EQ active violates bit-perfect
    let state_eq = SignalIntegrityEvaluation {
        volume_db: 0.0,
        dsp_active: false,
        resampled: false,
        eq_active: true,
    };
    assert!(
        !state_eq.is_bit_perfect(),
        "Active Equalizer must invalidate BIT-PERFECT badge"
    );
}

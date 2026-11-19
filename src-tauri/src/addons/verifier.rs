//! Cryptographic verification (SHA-256 integrity + Ed25519 provenance) for AuraHiFi Wasm add-ons.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::OnceLock;

use super::manifest::AddonManifest;

/// Official first-party trusted public keys (key_id -> 32-byte hex public key)
static TRUSTED_KEYS: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();

pub fn get_trusted_keys() -> &'static HashMap<&'static str, &'static str> {
    TRUSTED_KEYS.get_or_init(|| {
        let mut m = HashMap::new();
        // Official AuraHiFi first-party add-on release key
        m.insert(
            "aurahifi-ed25519-2026",
            "50ee239fd3edf65a5e865fa72207ce85777aba25c6293bf2cb13aad030b7b1c9",
        );
        m
    })
}

/// Compute hex SHA-256 digest of arbitrary bytes.
pub fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Constructs canonical message for Ed25519 signing and verification.
pub fn canonical_signing_message(id: &str, version: &str, sha256_hex: &str) -> Vec<u8> {
    format!("aurahifi-addon:{}:{}:{}", id.trim(), version.trim(), sha256_hex.trim()).into_bytes()
}

/// Signs an add-on payload given a 32-byte Ed25519 signing key seed or key.
pub fn sign_addon(signing_key: &SigningKey, id: &str, version: &str, sha256_hex: &str) -> String {
    let message = canonical_signing_message(id, version, sha256_hex);
    let signature = signing_key.sign(&message);
    hex::encode(signature.to_bytes())
}

/// Generates the standard development/first-party signing key from the trusted seed.
pub fn first_party_signing_key() -> SigningKey {
    let seed_hash = Sha256::digest(b"aurahifi-first-party-addon-signer-v1-2026");
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&seed_hash);
    SigningKey::from_bytes(&seed)
}

/// Verifies that the wasm bytes match the manifest's sha256, and that the manifest's signature
/// is cryptographically valid against the trusted signer key.
pub fn verify_addon(
    manifest: &AddonManifest,
    wasm_bytes: &[u8],
    developer_mode: bool,
) -> Result<VerificationReport, String> {
    // 1. Verify manifest structure
    manifest.validate_with_dev_mode(developer_mode)?;

    // 2. Verify SHA-256 integrity
    let actual_sha256 = compute_sha256(wasm_bytes);
    if !actual_sha256.eq_ignore_ascii_case(&manifest.sha256) {
        return Err(format!(
            "SHA-256 integrity mismatch for '{}': manifest declares '{}', computed '{}'",
            manifest.id, manifest.sha256, actual_sha256
        ));
    }

    // 3. Handle unsigned plugins in developer mode
    if manifest.signature.is_empty() {
        if developer_mode {
            return Ok(VerificationReport {
                verified: false,
                developer_bypass: true,
                sha256: actual_sha256,
                signer_key_id: manifest.signer_key_id.clone(),
                message: "Loaded unsigned local add-on in Developer Mode".into(),
            });
        } else {
            return Err("Unsigned add-on cannot be loaded in production mode".into());
        }
    }

    // 3. Find trusted public key for signer_key_id
    let trusted_keys = get_trusted_keys();
    let pub_key_hex = match trusted_keys.get(manifest.signer_key_id.as_str()) {
        Some(k) => *k,
        None => {
            if developer_mode {
                return Ok(VerificationReport {
                    verified: false,
                    developer_bypass: true,
                    sha256: actual_sha256,
                    signer_key_id: manifest.signer_key_id.clone(),
                    message: "Loaded in Developer Mode: untrusted signer key permitted".into(),
                });
            } else {
                return Err(format!(
                    "Signer key '{}' is not in the trusted key registry",
                    manifest.signer_key_id
                ));
            }
        }
    };

    let pub_bytes = hex::decode(pub_key_hex)
        .map_err(|e| format!("Invalid hex in trusted public key: {e}"))?;
    if pub_bytes.len() != 32 {
        return Err("Trusted public key is not 32 bytes".into());
    }

    let mut pub_array = [0u8; 32];
    pub_array.copy_from_slice(&pub_bytes);
    let verifying_key = VerifyingKey::from_bytes(&pub_array)
        .map_err(|e| format!("Failed to parse VerifyingKey: {e}"))?;

    // 4. Verify Ed25519 signature
    let sig_bytes = hex::decode(&manifest.signature)
        .map_err(|e| format!("Invalid hex in signature: {e}"))?;
    if sig_bytes.len() != 64 {
        return Err("Signature is not 64 bytes".into());
    }

    let mut sig_array = [0u8; 64];
    sig_array.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_array);

    let message = canonical_signing_message(&manifest.id, &manifest.version, &actual_sha256);
    match verifying_key.verify(&message, &signature) {
        Ok(_) => Ok(VerificationReport {
            verified: true,
            developer_bypass: false,
            sha256: actual_sha256,
            signer_key_id: manifest.signer_key_id.clone(),
            message: "Cryptographically verified via Ed25519 official release key".into(),
        }),
        Err(e) => {
            if developer_mode {
                Ok(VerificationReport {
                    verified: false,
                    developer_bypass: true,
                    sha256: actual_sha256,
                    signer_key_id: manifest.signer_key_id.clone(),
                    message: format!("Loaded in Developer Mode: signature check failed: {e}"),
                })
            } else {
                Err(format!(
                    "Ed25519 signature verification failed for add-on '{}': {e}",
                    manifest.id
                ))
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct VerificationReport {
    pub verified: bool,
    pub developer_bypass: bool,
    pub sha256: String,
    pub signer_key_id: String,
    pub message: String,
}

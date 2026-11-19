//! Phase 5 Extism Wasm add-on host, SHA-256 + Ed25519 verifier, and host functions.

pub mod host_functions;
pub mod manager;
pub mod manifest;
pub mod verifier;

pub use host_functions::{
    apply_approved_tag_diff, create_host_functions, HostContext, TagDiffProposal,
};
pub use manager::{AddonManager, LoadedAddon};
pub use manifest::{AddonManifest, AddonPermissionsManifest};
pub use verifier::{first_party_signing_key, sign_addon, verify_addon, VerificationReport};

#[cfg(test)]
mod tests;

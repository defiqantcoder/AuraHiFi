---
name: build-wasm-addon
description: "Create, compile, sign, and register a sandboxed Extism WebAssembly add-on for the AuraHiFi Add-On Store."
---

# Skill: Build & Sign an Extism Wasm Add-On

## Steps

1. Scaffold a new Rust `cdylib` crate under `addons/<addon-name>/` with `extism-pdk` and `serde`/`serde_json`.
2. Define a strict `manifest.json` declaring:
   - `id`, `name`, `version`, `apiVersion: "aura.addon/v1"`, `pluginType`
   - Minimal `allowed_hosts` array (deny-by-default; never use `*`)
   - `memory_max_pages`, `max_http_response_bytes`, and `wasi: false` unless explicitly justified
3. Implement `#[plugin_fn]` exports and import only approved host functions via `#[host_fn] extern "ExtismHost"`.
4. Enforce API rate limits and contactable `User-Agent` headers if making external HTTP calls (MusicBrainz `<= 1` req/s, LRCLIB 250–500 ms sequential batch delay, Discogs `<= 60` req/min authenticated).
5. Compile to WebAssembly:

   ```bash
   cargo build --release --target wasm32-unknown-unknown --manifest-path addons/<addon-name>/Cargo.toml
   ```

6. Compute SHA-256 digest and sign the `.wasm` + `manifest.json` bundle using the local Ed25519 dev signing tool.
7. Run host integration tests verifying the plugin fails safely when denied a permission and succeeds when granted.

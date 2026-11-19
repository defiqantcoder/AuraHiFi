---
trigger: model_decision
description: "Security, capability sandboxing, cryptographic signing, and third-party API rate-limiting rules for the Add-On Store and plugins."
---

# Add-On Store Security & API Compliance Rules

- **Extism Deny-By-Default Sandbox:** Load all store add-ons as Extism WebAssembly modules. Never enable WASI, host filesystem paths, or outbound HTTP unless declared in the plugin's `manifest.json` and explicitly approved by the user in the Permission Audit Modal.
- **Provenance Verification:** Verify the manifest integrity hash (SHA-256) and cryptographic signature (Ed25519) against the trusted store key before persisting or executing any remote `.wasm` plugin. Unsigned plugins are permitted ONLY from local filesystem paths when `developerMode === true`.
- **Host Function Validation:** Treat all bytes returned from Wasm plugins as untrusted data. Validate schemas via `serde` and enforce memory and HTTP response size caps on the Rust host side.
- **Third-Party API Citizen Rules:**
  - **MusicBrainz:** Hard client-side token bucket at `<= 1` request/second (1,050 ms spacing) + descriptive `User-Agent: AuraHiFi/<ver> (<contact-url>)`. Never burst.
  - **LRCLIB:** Set custom `User-Agent` (or `Lrclib-App-Id`), prefer `/api/v2/search` + `/api/get/{id}`, and enforce sequential 250–500 ms delays during batch library scans.
  - **Cover Art Archive:** Follow HTTP 307 redirects; inspect MusicBrainz `cover-art-archive.artwork` and `darkened` flags first.
  - **Discogs:** Require user-supplied Personal Access Token (`Authorization: Discogs token=...`), unique `User-Agent`, honor `X-Discogs-Ratelimit-Remaining` (60/min), back off on HTTP 429, and never cache raw Discogs payloads longer than 6 hours.
- **License Boundary:** Keep non-commercial Cavern E-AC-3 JOC decoding strictly outside the core repository; distribute only as an optional Add-On Store plugin displaying Cavern's non-commercial share-alike license.

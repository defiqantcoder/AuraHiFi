# Implementation Plan

## 1. Target Platform & Technical Stack

- **OS Support:** Ubuntu 24.04 LTS (Noble, PipeWire 1.0.5) and Ubuntu 26.04 LTS (Resolute, PipeWire 1.6.2). Release builds compiled on Ubuntu 24.04 LTS for glibc compatibility.
- **App Shell:** Tauri v2 (`libwebkit2gtk-4.1-dev`), packaged as native `.deb` and AppImage.
- **Frontend:** React, TypeScript, Tailwind CSS, Zustand state store, Lucide icons, HTML5 `<canvas>` for 60 fps FFT/VU metering.
- **Backend (Rust Workspace):**
  - **Audio Decoding:** `symphonia` (0.6.1, `all` + `opt-simd`), `dsd-reader` (0.4.0), `truehd` (0.7.2, `matrix-interpolation`)
  - **Audio Output & Hardware:** `alsa` (0.12.1), `udev`, `zbus` (D-Bus `org.freedesktop.ReserveDevice1` + `mpris-server` 0.10.0), `audio_thread_priority` (0.38.0, RTKit)
  - **Spatial & Audiophile DSP:** `audionimbus` (Steam Audio SOFA HRTF), `bs2b` (0.2.2), `autoeq` / `biquad-rust`, `rubato` (5.1.0), `ebur128` (0.1.11), `spectrum-analyzer` (2.0.0)
  - **Library, Vector Search & Tagging:** `rusqlite` (bundled), `sqlite-vec` + `zerocopy`, `lofty` (0.25.5), `notify`, `bliss-audio` (0.13.0, `symphonia-all`), `chromaprint-next`, optional `clap.cpp` / `ort`
  - **Add-On Store Sandbox:** `extism` (Rust Host SDK + Wasmtime), `ed25519-dalek` + `sha2`
  - **Optional Network Audio:** `opensubsonic-rs`, `rupnp` (3.0.0)

## 2. Typed IPC Contract (`src/lib/audioBridge.ts` ↔ `src-tauri/src/commands.rs`)

All frontend screens must communicate exclusively through `AudioBridge` so AI Studio Build can run against `MockAudioBridge` and AGY can swap in `TauriAudioBridge` without rewriting UI components.

### Core Commands (`invoke`)

- `list_audio_devices() -> Vec<AudioDeviceInfo>` (returns ALSA ID, card index, USB/Internal/HDMI type, supported rates, native DSD/DoP support, active reservation status)
- `select_audio_device(alsa_id: String, exclusive: bool, bypass_laptop: bool) -> SignalPathState`
- `test_dac_capabilities(alsa_id: String) -> DacProbeReport`
- `set_audio_mode(mode: "bit_perfect" | "spatial") -> SignalPathState`
- `update_spatial_config(cfg: SpatialConfig) -> SignalPathState` (Atmos decode/passthrough mode, SOFA file path, azimuth/elevation/radius, BS2B preset, 10-band PEQ/AutoEQ)
- `transport_command(cmd: Play | Pause | Seek(ms) | Next | Prev | SetVolume(f32)) -> PlaybackState`
- `scan_library(paths: Vec<String>) -> ScanJobId`
- `list_store_addons() -> Vec<AddonCatalogItem>`
- `install_addon(id: String, approved_permissions: AddonPermissions) -> InstalledAddon`
- `run_addon_action(addon_id: String, action: String, payload_json: String) -> String`
- `generate_smart_playlist(query: SmartPlaylistQuery) -> Vec<TrackSummary>`

### Streaming Channels (`tauri::ipc::Channel`)

- `subscribe_telemetry(channel: Channel<TelemetryFrame>)` — 60 fps compact binary FFT bands + L/R RMS & True Peak meters + playback position
- `subscribe_hardware_events(channel: Channel<HardwareEvent>)` — `DacConnected`, `DacDisconnectedPaused`, `RateChanged`, `SignalPathChanged`

## 3. Local SQLite Schema (`library.db` with `sqlite-vec`)

- **`tracks`:** `id`, `path`, `cue_start_ms`, `cue_end_ms`, `title`, `artist`, `album`, `album_artist`, `genre`, `year`, `duration_ms`, `codec`, `sample_rate`, `bit_depth`, `channels`, `is_dsd`, `is_atmos`, `bpm`, `musical_key`, `replaygain_track_db`, `replaygain_album_db`, `true_peak`, `mbid_recording`, `mbid_release`, `acoustid_fp`, `mtime`
- **`tracks_fts`:** SQLite FTS5 virtual table indexing `title`, `artist`, `album`, `genre`
- **`track_bliss_vec`:** `vec0` virtual table storing float32 Bliss acoustic feature vectors (dimension matched to `bliss-audio` descriptor length; Euclidean/Cosine KNN)
- **`track_clap_vec`:** `vec0` virtual table storing float32 CLAP audio embeddings (dimension matched to loaded GGUF/ONNX model) for sample & natural-language vibe search
- **`lyrics_cache`:** `track_id`, `synced_lrc`, `plain_text`, `source`, `fetched_at`
- **`addons_installed`:** `id`, `version`, `sha256`, `signature_verified`, `enabled`, `permissions_json`, `wasm_path`
- **`dac_profiles`:** `alsa_id`, `display_name`, `preferred_exclusive`, `dsd_mode`, `hardware_volume_quirk`, `autoeq_profile_json`

## 4. Phased Build Milestones

- **Phase 1 — UI & Mock Bridge (Stitch → AI Studio Build):** Finalize `DESIGN.md` and 9-screen flows in Stitch, export directly to AI Studio Build, assemble the multi-file React/TS app across focused passes (IPC Audit + Shell + `MockAudioBridge`, Core Screens, 60 fps FFT & Signal Path widgets, Parametric EQ & 3D Spatial Pad), refine visually with Annotation mode, and sync to GitHub.
- **Phase 2 — Tauri v2 Shell & Bit-Perfect Core (AGY):** Scaffold `src-tauri`, implement `udev` monitor, `/proc/asound` capability parser, D-Bus `ReserveDevice1`, direct ALSA `hw:CARD=<ID>,DEV=0` exclusive engine, Symphonia + DSD/DoP decoding, gapless ring buffer, RTKit thread promotion, and MPRIS2.
- **Phase 3 — Spatial Audio, Atmos & Headphone DSP (AGY):** Implement atomic Bit-Perfect ↔ Spatial switch, `truehd` Atmos decoder, in-process SOFA HRTF (`audionimbus`), `bs2b` crossfeed, 10-band AutoEQ biquad chain, and HDMI IEC958 passthrough.
- **Phase 4 — Library DB, Tagging & Live Metering (AGY):** Build `rusqlite` + `lofty` scanner, CUE sheet splitter, `ebur128` loudness scanner, and 60 fps `spectrum-analyzer` Tauri Channel.
- **Phase 5 — Extism Add-On Store & First-Party Plugins (AGY):** Build Extism Wasm host, manifest & signature verifier, permission audit UI, and launch add-ons (`metadata-enricher`, `lyrics-art`, `smart-playlists` with `bliss-audio` + `clap.cpp` + `sqlite-vec`).
- **Phase 6 — Verification & Ubuntu Packaging (AGY):** Execute hardware bit-perfect verification (`pw-top`, `stream0` rate lock, hot-unplug pause test), verify WebKitGTK rendering on Ubuntu 24.04 & 26.04, and ship `.deb` + AppImage.

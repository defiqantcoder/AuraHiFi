# AuraHiFi Agent Guide

AuraHiFi is a native Ubuntu (24.04 LTS & 26.04 LTS) Hi-Fi bit-perfect and spatial audio player built with Tauri v2, a Rust native audio/DSP/plugin backend, and a React + TypeScript + Tailwind CSS frontend.

## Core Engineering Pillars

- **Verifiable Bit-Perfect Playback:** Direct ALSA hardware exclusive access (`hw:CARD=<ALSA_ID>,DEV=0`) with D-Bus `org.freedesktop.ReserveDevice1` cooperation so PipeWire releases only the target USB DAC while keeping internal laptop audio isolated. Optional PipeWire bit-perfect mode.
- **Dynamic USB DAC Hot-Swapping:** `udev` (`libudev`) monitor for instant USB DAC detection, capability probing via `/proc/asound/cardX/stream0`, safe pause-on-unplug, and zero-leak laptop speaker bypass.
- **Instant Bit-Perfect ↔ Spatial / Atmos Switch:** Atomic swap between Zero-DSP Bit-Perfect transport and in-process Rust Spatial DSP (TrueHD Atmos via Apache-2.0 `truehd`, in-process SOFA HRTF via `audionimbus`/Steam Audio, `bs2b` headphone crossfeed, AutoEQ parametric EQ, and HDMI IEC958 passthrough). Never rely on Ubuntu PipeWire's `sofa` filter-chain module.
- **Sandboxed Add-On Store:** Extism (Wasmtime) WebAssembly plugins with deny-by-default capability manifests, integrity hash + provenance signature verification, and strict rate-limit compliance for Metadata/AcoustID/MusicBrainz, Cover Art Archive/LRCLIB, and AI Smart Playlists (`bliss-audio`, `clap.cpp`/ORT, `sqlite-vec`).

## Canonical Workspace Layout

- `src/` — React + TypeScript + Tailwind CSS frontend (sourced from Stitch → AI Studio Build)
- `src/lib/audioBridge.ts` — Typed Tauri v2 IPC boundary (`invoke` + `Channel`)
- `src-tauri/src/audio/` — Real-time Rust engine (Symphonia, DSD/DoP, ALSA exclusive, PipeWire helper, D-Bus `ReserveDevice1`, `udev` hotplug)
- `src-tauri/src/spatial/` — In-process Spatial DSP (TrueHD Atmos, SOFA HRTF, BS2B, AutoEQ biquads, HDMI IEC958)
- `src-tauri/src/library/` — SQLite (`rusqlite` + `sqlite-vec`), `lofty` tagger, `ebur128`, CUE sheet parser
- `src-tauri/src/addons/` — Extism Wasm host, manifest verifier, provenance signature checks, host functions
- `addons/` — First-party Extism Wasm add-ons (`metadata-enricher`, `lyrics-art`, `smart-playlists`)
- `DESIGN.md` — Authoritative design system tokens and WCAG AA contrast rules (`@DESIGN.md`)
- `PLAN.md` — Phased engineering specification and IPC contracts (`@PLAN.md`)

## Build, Lint & Test Commands

- **Frontend dev check:** `npm run typecheck && npm run build`
- **Design system lint:** `npx @google/design.md lint DESIGN.md`
- **Rust backend check:** `cargo check --manifest-path src-tauri/Cargo.toml`
- **Rust audio unit tests (ALWAYS release mode for Symphonia):** `cargo test --release --manifest-path src-tauri/Cargo.toml`
- **Full Tauri dev app:** `npm run tauri dev`
- **Ubuntu native `.deb` build:** `npm run tauri build -- --bundles deb`

## Non-Negotiable Engineering Invariants

- **Real-Time Audio Safety:** Zero heap allocations, zero blocking I/O, and zero `Mutex::lock()` calls on the audio output callback thread. Communicate exclusively via lock-free ring buffers and atomics.
- **Bit-Perfect Honesty:** Never display the "BIT-PERFECT" badge if software volume is `!= 0.0 dB`, if any DSP/EQ/ReplayGain/Spatial filter is active, or if resampling occurred. Always expose the exact reason in `SignalPathState`.
- **Never Kill PipeWire:** Acquire exclusive DAC locks only through D-Bus `org.freedesktop.ReserveDevice1.Audio<N>` (`RequestRelease`). Never invoke `systemctl --user stop pipewire*`.
- **Never Hardcode ALSA Card Numbers:** Always address ALSA devices by stable ID (`hw:CARD=<ID>,DEV=0`), never `hw:1` or `plughw:`.
- **Licensing Hygiene:** Never statically link non-commercial Cavern E-AC-3 JOC code into the core binary; isolate it strictly as an optional user-installed Add-On Store plugin.
- **Non-Blocking IPC:** Every Tauri command touching disk, network, SQLite, or hardware must be `async`. Stream 60 fps FFT/meter data only over `tauri::ipc::Channel`.
- **Planning First:** For any multi-file feature, produce a concrete implementation plan referencing `@PLAN.md` and wait for human approval before modifying files.

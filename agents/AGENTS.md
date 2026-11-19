Project Overview
AuraHiFi is a native Ubuntu (24.04 LTS & 26.04 LTS) Hi-Fi bit-perfect and spatial audio player built with Tauri v2, a Rust native audio/DSP/plugin backend structured for future Windows/Android/iOS/Wear OS porting, and a React + TypeScript + Tailwind CSS frontend.

Core engineering pillars:

Verifiable Bit-Perfect Playback: Direct ALSA hardware exclusive access (hw:CARD=<ALSA_ID>,DEV=0) with D-Bus org.freedesktop.ReserveDevice1 cooperation so PipeWire releases only the target USB DAC while keeping internal laptop audio isolated. Optional PipeWire bit-perfect mode.

Dynamic USB DAC Hot-Swapping: udev (libudev) monitor for instant USB DAC detection, capability probing via /proc/asound/cardX/stream0, safe pause-on-unplug, and zero-leak laptop speaker bypass.

Instant Bit-Perfect ↔ Spatial / Atmos Switch: Atomic swap between Zero-DSP Bit-Perfect transport and in-process Rust Spatial DSP (TrueHD Atmos via Apache-2.0 truehd, in-process SOFA HRTF via audionimbus/Steam Audio, bs2b headphone crossfeed, AutoEQ parametric EQ, and HDMI IEC958 passthrough). Never rely on Ubuntu PipeWire's sofa filter-chain module.

Clean First-Run Library & Native Folder Picker: In native Tauri mode, NEVER load or display hardcoded mock tracks. Start from the real SQLite library.db, launch a First-Run Setup screen whenever zero music folders are configured, and provide "+ Add Music Folder" controls backed by tauri-plugin-dialog in First-Run Setup, Library View, and Settings → Library & Storage.

Sandboxed Add-On Store & Hybrid AI Smart Playlists: Extism (Wasmtime) WebAssembly plugins with deny-by-default capability manifests, integrity hash + provenance signature verification, strict rate-limit compliance for Metadata/AcoustID/MusicBrainz & Cover Art Archive/LRCLIB, and plain-language AI Smart Playlists working both online (optional user Gemini API key in OS keyring with Structured JSON Output) and offline (bliss-audio, clap.cpp/ORT, sqlite-vec).

Universal Plain-Language Hover Help & Single-Install Bundling: Every technical badge, button, slider, and setting explains what it is and what it does in plain language on mouse hover. Release .deb and AppImage artifacts bundle all internal libraries, default SOFA/AutoEQ assets, and signed first-party .wasm add-ons for a single-step installation.

Canonical Workspace Layout
src/ — React + TypeScript + Tailwind CSS frontend (sourced from Stitch → AI Studio Build)

src/lib/audioBridge.ts — Typed Tauri v2 IPC boundary (invoke + Channel)

src/lib/plainLanguageGlossary.ts — Centralized plain-language hover tooltip dictionary

crates/aura-core/ — Platform-agnostic Rust core (Symphonia, DSD/DoP framing, TrueHD, SOFA HRTF, BS2B, AutoEQ, SQLite/sqlite-vec, lofty, Extism host) for easy Windows/Android/iOS porting

crates/aura-output/ — Platform-gated hardware audio output trait (alsa + udev + zbus on Linux)

src-tauri/ — Tauri v2 shell, commands, tauri-plugin-dialog, tauri-plugin-keyring-store, MPRIS2, and single-install packaging config

addons/ — First-party Extism Wasm add-ons (metadata-enricher, lyrics-art, smart-playlists)

DESIGN.md — Authoritative design system tokens and WCAG AA contrast rules (@DESIGN.md)

PLAN.md — Phased engineering specification and IPC contracts (@PLAN.md)

Build, Lint & Test Commands
Frontend dev check: npm run typecheck && npm run build

Design system lint: npx @google/design.md lint DESIGN.md

Rust backend check: cargo check --workspace

Rust audio unit tests (ALWAYS release mode for Symphonia): cargo test --release --workspace

Full Tauri dev app: npm run tauri dev

Ubuntu native .deb & AppImage single-install build: npm run tauri build -- --bundles deb,appimage

Non-Negotiable Engineering Invariants
Real-Time Audio Safety: Zero heap allocations, zero blocking I/O, and zero Mutex::lock() calls on the audio output callback thread. Communicate exclusively via lock-free ring buffers and atomics.

Bit-Perfect Honesty: Never display the "BIT-PERFECT" badge if software volume is != 0.0 dB, if any DSP/EQ/ReplayGain/Spatial filter is active, or if resampling occurred. Always expose the exact reason in SignalPathState.

Never Kill PipeWire: Acquire exclusive DAC locks only through D-Bus org.freedesktop.ReserveDevice1.Audio<N> (RequestRelease). Never invoke systemctl --user stop pipewire*.

Never Hardcode ALSA Card Numbers: Always address ALSA devices by stable ID (hw:CARD=<ID>,DEV=0), never hw:1 or plughw:.

No Fake Tracks in Production: Never seed mock demo tracks into Zustand state or SQLite when running inside Tauri (isTauriRuntime() === true). Keep mock fixtures isolated strictly inside MockAudioBridge for browser preview only.

Licensing Hygiene: Never statically link non-commercial Cavern E-AC-3 JOC code into the core binary; isolate it strictly as an optional user-installed Add-On Store plugin.

Non-Blocking IPC & Secret Hygiene: Every Tauri command touching disk, network, SQLite, or hardware must be async. Stream 60 fps FFT/meter data only over tauri::ipc::Channel. Store all API keys (Gemini, AcoustID, Discogs) exclusively in the OS keyring (tauri-plugin-keyring-store), never plaintext JSON.




# AuraHiFi

**Precision Linux audiophile music player console with verifiable Bit-Perfect ALSA exclusive transport, in-process Spatial Atmos/SOFA HRTF DSP, live 60 fps FFT metering, AI Smart Playlists, and a sandboxed WebAssembly Add-On Store.**

Built for **Ubuntu 24.04 LTS (Noble)** and **Ubuntu 26.04 LTS (Resolute)** using **Tauri v2**, a **Rust** real-time audio/DSP backend, and a **React + TypeScript + Tailwind CSS** frontend.

---

## Core Features

### Bit-Perfect Transport & Hardware Control
- **Direct ALSA Hardware Exclusive Mode:** Targets DACs by stable ALSA string ID (`hw:CARD=<ALSA_ID>,DEV=0`) with native PCM (up to 384 kHz / 32-bit), gapless ring-buffer playback, and native DSD (`DSD_U32_BE`) / DoP support. Also supports an **optional PipeWire bit-perfect mode**.
- **Cooperative PipeWire Isolation:** Acquires exclusive USB DAC locks via D-Bus (`org.freedesktop.ReserveDevice1`) so PipeWire releases only the target DAC while keeping internal laptop audio uninterrupted—never stops or kills PipeWire.
- **Dynamic USB DAC Hot-Swapping:** Real-time `udev` (`libudev`) monitoring on the `sound` subsystem with capability probing via ALSA `hw_params` and `/proc/asound/card<N>/stream0`, per-DAC saved profiles, and a **"Test DAC"** diagnostic trigger.
- **Safe Pause-on-Unplug:** Immediately pauses playback and zeroes audio buffers if the active DAC is disconnected, preventing accidental sound leaks to internal laptop speakers.
- **Bit-Perfect Honesty:** Software volume is locked at `0.0 dB` whenever Bit-Perfect or DSD/DoP is active. Any resampling, ReplayGain, DSP, or DSD-to-PCM fallback is surfaced immediately in the Signal Path Inspector.
- **Linux Desktop Integration:** Native **MPRIS2** (`mpris-server`) media controls and RTKit real-time audio thread promotion.

### Instant Bit-Perfect ↔ Spatial / Atmos Switching
- **Atomic Mode Swap:** Pop-free transition between Zero-DSP Bit-Perfect transport and an in-process Rust Spatial DSP chain (synchronized with a brief mute ramp).
- **Dolby TrueHD Atmos & HDMI Passthrough:** In-process TrueHD Atmos decoding via Apache-2.0 `truehd` (`matrix-interpolation`) and HDMI IEC958 passthrough.
- **In-Process SOFA HRTF & Headphone DSP:** Binaural rendering via `audionimbus` (Steam Audio SOFA HRTF)—with zero reliance on Ubuntu PipeWire's `sofa` filter-chain—plus stateful `bs2b` headphone crossfeed and a 10-band Parametric EQ / AutoEQ biquad chain (`rubato` resampling when needed).
- **Optional E-AC-3 JOC Decoding:** Non-commercial Cavern E-AC-3 JOC decoding is kept strictly outside the core binary and offered only as an optional, user-installed Add-On Store plugin.

### Library, Tagging, Loudness & Network Audio
- **Local SQLite Library (`library.db`):** Fast FTS5 full-text search across titles, artists, albums, and genres, filesystem watching (`notify`), `lofty` metadata tagging, and **CUE sheet splitting** (`cue_start_ms` / `cue_end_ms`).
- **Loudness & Fingerprinting:** `ebur128` track/album ReplayGain & True Peak scanning, BPM/musical key metadata, and `chromaprint-next` AcoustID audio fingerprinting.
- **AI Vector Search & Smart Playlists:** `sqlite-vec` KNN tables storing `bliss-audio` acoustic feature vectors and optional `clap.cpp` / ORT CLAP embeddings for audio-sample and natural-language vibe search.
- **Synced Lyrics & Artwork Cache:** Cached synced LRC and plain-text lyrics alongside album artwork metadata.
- **Optional Network Audio:** Planned support for OpenSubsonic (`opensubsonic-rs`) and UPnP/DLNA (`rupnp`).

### Studio Dark Precision UI & Live 60 fps Telemetry
- **AuraHiFi Studio Dark Design System:** Inspired by reference mastering consoles and OLED DAC displays, engineered for WCAG AA contrast (≥4.5:1) and WebKitGTK 4.1 compatibility on 1280×800 to 3840×2160 displays.
- **3-Zone Desktop Shell:** Collapsible left navigation rail (`240px` → `72px`), fluid main workspace with optional right Context Drawer (`360px` for Queue, Lyrics, or Signal Path Inspector), and a persistent bottom Transport & Telemetry Bar (`88px`).
- **Semantic Signal Colors & Tabular Telemetry:** **Emerald (`#10B981`)** for Bit-Perfect locks, **Cyan (`#38BDF8`)** for Spatial DSP & AI accents, **Amber (`#F59E0B`)** for DSP/resampling warnings, and **Red (`#EF4444`)** for hardware/security alerts, paired with `Space Grotesk`, `Inter`, and `JetBrains Mono` (`tnum`) numeric readouts.
- **60 fps Hardware-Accelerated Metering:** HTML5 `<canvas>` FFT spectrum analyzer and L/R RMS & True Peak VU meters driven by `requestAnimationFrame` from a Tauri `Channel` (zero React state churn), plus an interactive **3D Spatial Soundstage Pad**, **Parametric EQ Editor**, **Command Palette**, and global keyboard shortcuts.

### Sandboxed Extism Add-On Store
- **Deny-by-Default WebAssembly Sandbox:** Plugins run as Extism (Wasmtime) `.wasm` modules with explicit `manifest.json` capability declarations (`allowed_hosts`, `memory_max_pages`, `max_http_response_bytes`, opt-in WASI) reviewed in the **Permission Audit Modal**.
- **Cryptographic Provenance:** Remote add-ons require SHA-256 integrity hashing and Ed25519 signature verification against the trusted store key. Unsigned local plugins are allowed only when `developerMode === true`.
- **First-Party Add-Ons & API Citizen Rules:**
  - **Metadata Enricher:** MusicBrainz (`<= 1 req/s`, 1,050 ms spacing, contactable `User-Agent`), AcoustID, and Discogs (user-supplied Personal Access Token, `<= 60 req/min`, max 6-hour payload cache).
  - **Lyrics & Cover Art:** LRCLIB (`/api/v2/search` + `/api/get/{id}`, 250–500 ms sequential batch delays) and Cover Art Archive (HTTP 307 redirect handling and artwork/darkened flag checks).
  - **AI Smart Playlists:** Powered by `bliss-audio`, `clap.cpp` / ORT, and `sqlite-vec`.

---

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Target OS** | Ubuntu 24.04 LTS (PipeWire 1.0.5) & Ubuntu 26.04 LTS (PipeWire 1.6.2) |
| **App Shell** | Tauri v2 (`libwebkit2gtk-4.1-dev`), packaged as `.deb` & `AppImage` |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Vite, Zustand, Lucide Icons, Motion, HTML5 `<canvas>` |
| **Audio Decoding** | `symphonia` (`all` + `opt-simd`), `dsd-reader`, `truehd` (`matrix-interpolation`) |
| **Audio Output & Hardware** | `alsa`, `udev`, `zbus` (D-Bus `ReserveDevice1` + `mpris-server`), `audio_thread_priority` (RTKit) |
| **Spatial & DSP** | `audionimbus` (Steam Audio SOFA HRTF), `bs2b`, `autoeq` / `biquad-rust`, `rubato`, `ebur128`, `spectrum-analyzer` |
| **Library & Vector Search** | `rusqlite` (bundled), `sqlite-vec` + `zerocopy`, FTS5, `lofty`, `notify`, `bliss-audio`, `chromaprint-next`, optional `clap.cpp` / `ort` |
| **Add-On Sandbox** | `extism` (Wasmtime), `ed25519-dalek`, `sha2` |
| **Optional Network Audio** | `opensubsonic-rs`, `rupnp` |

---

## Typed IPC Architecture

All frontend views communicate exclusively through [`src/lib/audioBridge.ts`](src/lib/audioBridge.ts), enabling seamless switching between browser preview (`MockAudioBridge`) and native Tauri v2 (`TauriAudioBridge`).

- **Core `invoke` Commands:** `list_audio_devices`, `select_audio_device`, `test_dac_capabilities`, `set_audio_mode`, `update_spatial_config`, `transport_command`, `scan_library`, `list_store_addons`, `install_addon`, `run_addon_action`, `generate_smart_playlist`.
- **Streaming `tauri::ipc::Channel`s:** `subscribe_telemetry` (60 fps FFT bands, L/R RMS & True Peak, playback position) and `subscribe_hardware_events` (`DacConnected`, `DacDisconnectedPaused`, `RateChanged`, `SignalPathChanged`).

---

## Project Structure

```text
AuraHiFi/
├── src/                        # React + TypeScript + Tailwind CSS frontend
│   ├── components/             # Shell, TransportBar, SignalPathPopover, DAC drawer, EQ, 3D Spatial Pad, 60 fps Canvas
│   ├── hooks/                  # Global keyboard shortcuts & UI hooks
│   ├── lib/                    # Typed AudioBridge (Mock & Tauri IPC), DSP/signal-path helpers & unit tests
│   ├── store/                  # Zustand application state
│   └── views/                  # Now Playing, Library, Spatial Studio, Metadata Workbench, Smart Playlists, Add-On Store, Settings
├── design/DESIGN.md            # Authoritative "AuraHiFi Studio Dark" design system tokens & WCAG AA rules
├── plan/PLAN.md                # Phased engineering specification, IPC contracts, and SQLite + sqlite-vec schema
├── agents/                     # Agent guidelines, domain rules, and engineering skills
│   ├── AGENTS.md               # Workspace conventions & non-negotiable engineering invariants
│   ├── rules/                  # Rust audio engine, frontend UI, and add-on security rules
│   └── skills/                 # Feature scaffolding, Wasm add-ons, Linux bit-perfect verification
├── src-tauri/                  # (Phase 2+) Rust Tauri v2 backend (audio, spatial, library, addons)
└── addons/                     # (Phase 5+) First-party Extism WebAssembly add-ons
```

---

## Getting Started

### Prerequisites

- **Node.js** (v20+) or **Bun** (`bun.lock` included)
- For native Tauri v2 builds (Phases 2+):
  - **Rust** toolchain (`rustup`, `cargo`)
  - Ubuntu system dependencies (`libwebkit2gtk-4.1-dev`, `libasound2-dev`, `libudev-dev`, `libdbus-1-dev`, etc.)

### Install & Run Frontend (Browser Preview / Mock Bridge)

```bash
# Install dependencies (using bun or npm)
bun install
# or: npm install

# Start the development server on http://localhost:3000
npm run dev
```

### Typecheck & Build

```bash
# Strict TypeScript check
npm run typecheck

# Production frontend bundle
npm run build

# Lint design system tokens
npx @google/design.md lint design/DESIGN.md
```

### Native Tauri & Rust Commands (Once `src-tauri/` is Scaffolded)

```bash
# Check Rust backend compilation
cargo check --manifest-path src-tauri/Cargo.toml

# Run Rust audio & DSP tests (always use --release for Symphonia)
cargo test --release --manifest-path src-tauri/Cargo.toml

# Launch full native Tauri v2 app in dev mode
npm run tauri dev

# Build Ubuntu native .deb package
npm run tauri build -- --bundles deb
```

---

## Engineering Invariants

1. **Real-Time Audio Safety:** Zero heap allocations, zero blocking I/O, and zero `Mutex::lock()` calls on the audio output thread. Communication uses lock-free ring buffers and atomics, with RTKit real-time thread promotion.
2. **Bit-Perfect Honesty:** Never display the Emerald `BIT-PERFECT` badge if software volume ≠ `0.0 dB`, any DSP/EQ/ReplayGain/Spatial filter is active, or resampling occurred.
3. **Cooperative PipeWire Isolation:** Acquire exclusive DAC locks only via D-Bus `org.freedesktop.ReserveDevice1.Audio<N>` (`RequestRelease`). Never stop or restart PipeWire services.
4. **Stable ALSA Addressing:** Always target devices by stable string ID (`hw:CARD=<ID>,DEV=0`), never hardcoded card numbers (`hw:1`) or `plughw:`.
5. **Licensing Hygiene:** Non-commercial Cavern E-AC-3 JOC decoding is strictly excluded from the core binary and isolated as an optional, user-installed Add-On Store plugin.
6. **Non-Blocking IPC:** All hardware, SQLite, disk, and network Tauri commands are `async`, and 60 fps FFT/meter telemetry streams over `tauri::ipc::Channel` directly into mutable refs for `<canvas>` rendering.

---

## Roadmap

- [x] **Phase 1 — UI & Mock Bridge:** `AuraHiFi Studio Dark` design system, multi-view React/TypeScript console, `MockAudioBridge` + typed `TauriAudioBridge` contract, 60 fps `<canvas>` FFT/VU visualizer, Signal Path Inspector, Parametric EQ, and 3D Spatial Soundstage Pad.
- [ ] **Phase 2 — Tauri v2 Shell & Bit-Perfect Core:** `src-tauri` scaffold, `udev` hotplug monitor, `/proc/asound` capability parser, D-Bus `ReserveDevice1`, direct ALSA exclusive engine, Symphonia + DSD/DoP decoding, gapless ring buffer, RTKit promotion, and MPRIS2.
- [ ] **Phase 3 — Spatial Audio, Atmos & Headphone DSP:** Atomic Bit-Perfect ↔ Spatial switch, `truehd` Atmos decoder, in-process SOFA HRTF (`audionimbus`), `bs2b` crossfeed, 10-band AutoEQ biquads, and HDMI IEC958 passthrough.
- [ ] **Phase 4 — Library DB, Tagging & Live Metering:** `rusqlite` + `lofty` scanner, CUE sheet splitter, `ebur128` loudness analysis, and 60 fps `spectrum-analyzer` Tauri Channel.
- [ ] **Phase 5 — Extism Add-On Store & First-Party Plugins:** Wasm host, SHA-256/Ed25519 verification, permission audit workflow, and `metadata-enricher`, `lyrics-art`, and `smart-playlists` add-ons.
- [ ] **Phase 6 — Verification & Ubuntu Packaging:** Hardware bit-perfect verification (`pw-top`, `/proc/asound/.../hw_params` rate lock, hot-unplug safety), WebKitGTK verification on Ubuntu 24.04 & 26.04, and `.deb` / `AppImage` releases.

---

## Documentation

- [Design System (`design/DESIGN.md`)](design/DESIGN.md) — Color tokens, typography, spacing, layout, and semantic signal rules.
- [Implementation Plan (`plan/PLAN.md`)](plan/PLAN.md) — Technical stack, typed IPC contracts, SQLite + `sqlite-vec` schema, and build milestones.
- [Agent & Architecture Guide (`agents/AGENTS.md`)](agents/AGENTS.md) — Workspace conventions and non-negotiable engineering invariants.
- **Engineering Rules:** [Rust Audio Engine](agents/rules/rust-audio-engine.md) · [Frontend UI & Tauri Bridge](agents/rules/frontend-ui.md) · [Add-On Security & API Compliance](agents/rules/addon-security.md)
- **Workflows & Skills:** [Scaffold Audio Feature](agents/skills/scaffold-audio-feature/SKILL.md) · [Build & Sign Wasm Add-On](agents/skills/build-wasm-addon/SKILL.md) · [Verify Bit-Perfect Playback on Ubuntu](agents/skills/verify-bitperfect-linux/SKILL.md)

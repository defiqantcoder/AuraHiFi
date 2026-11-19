# AuraHiFi

**Precision Linux audiophile music player console with verifiable Bit-Perfect ALSA exclusive transport, in-process Spatial Atmos/SOFA HRTF DSP, live 60 fps FFT metering, and a sandboxed WebAssembly Add-On Store.**

Built for **Ubuntu 24.04 LTS (Noble)** and **Ubuntu 26.04 LTS (Resolute)** using **Tauri v2**, a **Rust** real-time audio/DSP backend, and a **React + TypeScript + Tailwind CSS** frontend.

---

## Core Features

- **Verifiable Bit-Perfect Playback**
  - Direct ALSA hardware exclusive access (`hw:CARD=<ALSA_ID>,DEV=0`) with native PCM (up to 384 kHz / 32-bit) and DSD/DoP support.
  - Cooperative device handoff via D-Bus (`org.freedesktop.ReserveDevice1`) so PipeWire releases only the target USB DAC while keeping internal laptop audio uninterrupted—never kills PipeWire.
  - Strict signal integrity: software volume is locked at `0.0 dB` in Bit-Perfect and DSD/DoP modes, and any active DSP, ReplayGain, or resampling immediately surfaces in the Signal Path Inspector.
- **Dynamic USB DAC Hot-Swapping**
  - Real-time `udev` (`libudev`) monitoring on the `sound` subsystem with capability probing via ALSA `hw_params` and `/proc/asound/card<N>/stream0`.
  - Safe pause-on-unplug that immediately halts playback and zeroes buffers, preventing accidental audio leaks to internal laptop speakers.
- **Instant Bit-Perfect ↔ Spatial / Atmos Switching**
  - Atomic, pop-free swap between Zero-DSP Bit-Perfect transport and an in-process Rust Spatial DSP chain.
  - Dolby TrueHD Atmos decoding (Apache-2.0 `truehd`), in-process SOFA HRTF binaural rendering (`audionimbus` / Steam Audio, with zero reliance on Ubuntu's PipeWire `sofa` filter-chain), stateful `bs2b` headphone crossfeed, 10-band Parametric EQ / AutoEQ, and HDMI IEC958 passthrough.
- **Live 60 fps Telemetry & Studio Dark UI**
  - *AuraHiFi Studio Dark* design system inspired by reference mastering consoles and OLED DAC displays, meeting WCAG AA contrast.
  - Semantic color encoding: **Emerald (`#10B981`)** for verified Bit-Perfect locks, **Cyan (`#38BDF8`)** for active Spatial DSP, **Amber (`#F59E0B`)** for resampling/DSP warnings, and **Red (`#EF4444`)** for hardware/security alerts.
  - GPU-accelerated HTML5 `<canvas>` 60 fps FFT spectrum and L/R RMS & True Peak VU meters, tabular monospace (`JetBrains Mono`) readouts, 3D Spatial Soundstage Pad, and interactive Parametric EQ editor.
- **Sandboxed Extism Add-On Store**
  - WebAssembly plugins powered by Extism (Wasmtime) with a deny-by-default capability model (`allowed_hosts`, memory caps, HTTP response limits, opt-in WASI) reviewed in a Permission Audit Modal.
  - SHA-256 integrity hashing and Ed25519 provenance signature verification for remote plugins.
  - First-party add-ons with strict third-party API rate-limit compliance: Metadata Enricher (MusicBrainz / AcoustID / Discogs), Lyrics & Cover Art (LRCLIB / Cover Art Archive), and AI Smart Playlists (`bliss-audio`, `clap.cpp` / ORT, `sqlite-vec`).

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
| **Library & Vector Search** | `rusqlite` (bundled), `sqlite-vec`, FTS5, `lofty`, `notify`, `bliss-audio`, `chromaprint-next`, optional `clap.cpp` / `ort` |
| **Add-On Sandbox** | `extism` (Wasmtime), `ed25519-dalek`, `sha2` |

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
├── design/DESIGN.md            # Authoritative "AuraHiFi Studio Dark" design system tokens & rules
├── plan/PLAN.md                # Phased engineering specification, IPC contracts, and SQLite schema
├── agents/                     # Agent guidelines, domain rules, and engineering skills
│   ├── rules/                  # Rust audio, frontend UI, and add-on security rules
│   └── skills/                 # Feature scaffolding, Wasm add-ons, Linux bit-perfect verification
├── src-tauri/                  # (Phase 2+) Rust Tauri v2 backend (audio, spatial, library, addons)
└── addons/                     # (Phase 5+) First-party Extism WebAssembly add-ons
```

All frontend views communicate exclusively through [`src/lib/audioBridge.ts`](src/lib/audioBridge.ts), allowing the UI to run seamlessly in browser preview mode (`MockAudioBridge`) or against the native Rust backend (`TauriAudioBridge`).

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

1. **Real-Time Audio Safety**: Zero heap allocations, zero blocking I/O, and zero `Mutex::lock()` calls on the audio output thread. Communication uses lock-free ring buffers and atomics, with RTKit real-time thread promotion.
2. **Bit-Perfect Honesty**: Never display the Emerald `BIT-PERFECT` badge if software volume ≠ `0.0 dB`, any DSP/EQ/ReplayGain/Spatial filter is active, or resampling occurred.
3. **Cooperative PipeWire Isolation**: Acquire exclusive DAC locks only via D-Bus `org.freedesktop.ReserveDevice1.Audio<N>` (`RequestRelease`). Never stop or restart PipeWire services.
4. **Stable ALSA Addressing**: Always target devices by stable string ID (`hw:CARD=<ID>,DEV=0`), never hardcoded card numbers (`hw:1`) or `plughw:`.
5. **Licensing Hygiene**: Non-commercial Cavern E-AC-3 JOC decoding is strictly excluded from the core binary and isolated as an optional, user-installed Add-On Store plugin.
6. **Non-Blocking IPC**: All hardware, SQLite, disk, and network Tauri commands are `async`, and 60 fps FFT/meter telemetry streams over `tauri::ipc::Channel` directly into mutable refs for `<canvas>` rendering.

---

## Roadmap

- [x] **Phase 1 — UI & Mock Bridge**: `AuraHiFi Studio Dark` design system, multi-view React/TypeScript console, `MockAudioBridge` + typed `TauriAudioBridge` contract, 60 fps `<canvas>` FFT/VU visualizer, Signal Path Inspector, Parametric EQ, and 3D Spatial Soundstage Pad.
- [ ] **Phase 2 — Tauri v2 Shell & Bit-Perfect Core**: `src-tauri` scaffold, `udev` hotplug monitor, `/proc/asound` capability parser, D-Bus `ReserveDevice1`, direct ALSA exclusive engine, Symphonia + DSD/DoP decoding, gapless ring buffer, RTKit promotion, and MPRIS2.
- [ ] **Phase 3 — Spatial Audio, Atmos & Headphone DSP**: Atomic Bit-Perfect ↔ Spatial switch, `truehd` Atmos decoder, in-process SOFA HRTF (`audionimbus`), `bs2b` crossfeed, 10-band AutoEQ biquads, and HDMI IEC958 passthrough.
- [ ] **Phase 4 — Library DB, Tagging & Live Metering**: `rusqlite` + `lofty` scanner, CUE sheet splitter, `ebur128` loudness analysis, and 60 fps `spectrum-analyzer` Tauri Channel.
- [ ] **Phase 5 — Extism Add-On Store & First-Party Plugins**: Wasm host, SHA-256/Ed25519 verification, permission audit workflow, and `metadata-enricher`, `lyrics-art`, and `smart-playlists` add-ons.
- [ ] **Phase 6 — Verification & Ubuntu Packaging**: Hardware bit-perfect verification (`pw-top`, `/proc/asound/.../hw_params` rate lock, hot-unplug safety), WebKitGTK verification on Ubuntu 24.04 & 26.04, and `.deb` / `AppImage` releases.

---

## Documentation

- [Design System (`design/DESIGN.md`)](design/DESIGN.md) — Color tokens, typography, spacing, layout, and semantic signal rules.
- [Implementation Plan (`plan/PLAN.md`)](plan/PLAN.md) — Technical stack, typed IPC contracts, SQLite + `sqlite-vec` schema, and build milestones.
- [Agent & Architecture Guide (`agents/AGENTS.md`)](agents/AGENTS.md) — Workspace conventions and non-negotiable engineering invariants.
- [Linux Bit-Perfect Verification Checklist (`agents/skills/verify-bitperfect-linux/SKILL.md`)](agents/skills/verify-bitperfect-linux/SKILL.md) — Step-by-step hardware validation using `/proc/asound`, `wpctl`, and `pw-top`.
- [Wasm Add-On Authoring Guide (`agents/skills/build-wasm-addon/SKILL.md`)](agents/skills/build-wasm-addon/SKILL.md) — Building, signing, and testing Extism WebAssembly add-ons.

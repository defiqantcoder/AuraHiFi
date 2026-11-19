---
trigger: glob
globs: "src//*.ts, src//.tsx, src//.css"
description: "Frontend design system enforcement, Tauri IPC abstraction, and WebKitGTK compatibility rules."
---

# Frontend UI & Tauri Bridge Rules

- **Design Token Fidelity:** Strictly follow all colors, typography, radii, and component patterns defined in `@DESIGN.md`. Never invent off-palette hex colors or mix Bit-Perfect Emerald (`#10B981`) with Spatial Cyan (`#38BDF8`) semantics.
- **Tabular Numerals:** Apply `font-mono tabular-nums` (JetBrains Mono) to every sample rate, bit depth, timer, BPM, dB gain, and LUFS value.
- **Strict IPC Boundary:** UI components must never import `@tauri-apps/api` directly. All backend calls and channels must flow through `src/lib/audioBridge.ts` so the app remains testable in browser preview (`MockAudioBridge`) and native Tauri (`TauriAudioBridge`).
- **60 fps Visualizer Hygiene:** Render FFT spectrum bars, waveforms, and VU meters inside an HTML5 `<canvas>` driven by `requestAnimationFrame` reading from a mutable ref updated by the Tauri `Channel`. Never store 60 Hz meter arrays in React state.
- **Accessibility & WebKitGTK Safety:** Every input must have a visible `<label>` (no placeholder-only fields). Avoid Chromium-only CSS features so layouts render cleanly on Ubuntu's WebKitGTK 4.1.
- **Honest Volume Lock:** When `signalPath.bitPerfectLocked` or `signalPath.isDsd` is `true`, visually lock the volume slider at `0.0 dB` with an explicit tooltip explaining that software attenuation is bypassed to preserve bit-perfection.

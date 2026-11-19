trigger: glob
globs: "src//*.ts, src//.tsx, src//.css"
description: "Frontend design system enforcement, Tauri IPC abstraction, plain-language hover help, clean first-run state, and WebKitGTK compatibility rules."
Frontend UI & Tauri Bridge Rules
Design Token Fidelity: Strictly follow all colors, typography, radii, and component patterns defined in @DESIGN.md. Never invent off-palette hex colors or mix Bit-Perfect Emerald (#10B981) with Spatial Cyan (#38BDF8) semantics.

Tabular Numerals: Apply font-mono tabular-nums (JetBrains Mono) to every sample rate, bit depth, timer, BPM, dB gain, and LUFS value.

Strict IPC Boundary & Zero Fake Tracks in Tauri: UI components must never import @tauri-apps/api or @tauri-apps/plugin-dialog directly. All backend calls, native folder dialogs, and channels must flow through src/lib/audioBridge.ts. When running inside Tauri (isTauriRuntime() === true), Zustand stores must initialize with tracks: [] and load strictly from library.db—never seed demo tracks.

First-Run & Empty Library UX: Whenever onboardingCompleted === false or libraryFolders.length === 0, surface the First-Run Setup screen and prominent "+ Add Music Folder" CTA. Keep "+ Add Music Folder" accessible in Library View and Settings → Library & Storage at all times.

60 fps Visualizer Hygiene: Render FFT spectrum bars, waveforms, and VU meters inside an HTML5 <canvas> driven by requestAnimationFrame reading from a mutable ref updated by the Tauri Channel. Never store 60 Hz meter arrays in React state.

Accessibility & WebKitGTK Safety: Every input must have a visible <label> (no placeholder-only fields). Avoid Chromium-only CSS features so layouts render cleanly on Ubuntu's WebKitGTK 4.1.

Honest Volume Lock: When signalPath.bitPerfectLocked or signalPath.isDsd is true, visually lock the volume slider at 0.0 dB with an explicit tooltip explaining that software attenuation is bypassed to preserve bit-perfection.

Universal Plain-Language Hover Tooltips: Every interactive button, toggle, slider, dropdown, menu item, codec badge, Signal Path stage, and audio metric must be wrapped in <ExplainTooltip termId="..." /> backed by src/lib/plainLanguageGlossary.ts, explaining both what it is and what it does in plain, jargon-free English. Respect the user's global hoverHelpEnabled toggle and hover delay setting.

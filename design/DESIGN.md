---
version: "alpha"
name: "AuraHiFi Studio Dark"
description: "Precision dark audiophile console inspired by reference studio mastering hardware and high-contrast OLED DAC displays."
colors:
  surface: "#0B0D10"
  surface-elevated: "#14181F"
  surface-card: "#1C222D"
  border-subtle: "#2B3342"
  on-surface: "#F2F4F8"
  on-surface-muted: "#9AA4B2"
  primary: "#10B981"
  on-primary: "#06130E"
  primary-hover: "#34D399"
  secondary: "#38BDF8"
  on-secondary: "#06121A"
  warning: "#F59E0B"
  on-warning: "#1A1002"
  danger: "#EF4444"
  on-danger: "#1F0505"
typography:
  display-lg:
    fontFamily: "Space Grotesk"
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: "Space Grotesk"
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.25
  body-md:
    fontFamily: "Inter"
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: "Inter"
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: "0.08em"
  mono-telemetry:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
    fontWeight: 500
    fontFeature: "'tnum' on"
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
motion:
  snappy:
    duration: 140ms
    timingFunction: "cubic-bezier(0.2, 0, 0, 1)"
  mode-swap:
    duration: 240ms
    timingFunction: "ease-out"
components:
  app-shell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  panel-elevated:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  card-surface:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  text-muted-row:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface-muted}"
  button-bitperfect:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: 12px
  button-bitperfect-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-spatial:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.pill}"
    padding: 12px
  badge-dsp-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-warning}"
    rounded: "{rounded.sm}"
    padding: 6px
  badge-error:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.sm}"
    padding: 6px
  divider-rule:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.on-surface}"
---

## Overview

AuraHiFi Studio Dark evokes precision reference DAC front panels and mastering consoles: deep obsidian surfaces, hairline graphite borders, tabular monospace audio telemetry, and disciplined semantic color signals. Color never decorates; color communicates exact audio signal integrity.

## Colors

- **Surface (`#0B0D10`) & Elevated (`#14181F`) & Card (`#1C222D`):** Layered matte dark tones eliminate glare during long listening sessions and frame album artwork naturally.
- **On-Surface (`#F2F4F8`) & Muted (`#9AA4B2`):** Crisp high-contrast text exceeding WCAG AA (≥4.5:1 across all component pairs) for effortless legibility on HiDPI Linux displays.
- **Primary / Bit-Perfect Emerald (`#10B981`):** Reserved exclusively for verified Bit-Perfect transport, locked `0.0 dB` output, and native DSD/DoP locks.
- **Secondary / Spatial Cyan (`#38BDF8`):** Reserved exclusively for active Spatial Audio, Dolby Atmos decoding, SOFA HRTF binaural rendering, and AI Smart Playlist accents.
- **Warning Amber (`#F59E0B`) & Danger Red (`#EF4444`):** Amber flags active resampling, ReplayGain, or fallback DSP; Red flags hardware disconnects, ALSA busy errors, or unsigned add-on warnings.

## Typography

- Use **Space Grotesk** for page titles, artist headers, and modal titles.
- Use **Inter** for navigation, track lists, and settings copy.
- Use **JetBrains Mono** with tabular numerals (`tnum`) for every sample rate (`192.0 kHz`), bit depth (`24-bit`), DSD rate (`DSD256`), LUFS meter, dB readout, BPM badge, and timestamp so numbers never jitter during playback.

## Layout

Desktop-first 3-zone shell targeting 1280×800 to 3840×2160 Ubuntu displays:

- Fixed left navigation rail (`240px`, collapsible to `72px`)
- Fluid main workspace with optional right Context Drawer (`360px` for Queue, Lyrics, or Signal Path Inspector)
- Persistent bottom Transport & Telemetry Bar (`88px`) anchoring playback controls, live Signal Path pill, Master Bit-Perfect ↔ Spatial toggle, and DAC quick-selector.

Follow an 8px spatial grid (`xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`).

## Elevation & Depth

Use subtle tonal surface steps (`surface` → `surface-elevated` → `surface-card`) plus `1px solid #2B3342` hairline borders instead of heavy drop shadows. Only floating popovers (Signal Path Inspector, DAC Switcher, Add-On Permission Audit Modal) use soft dark elevation scrims.

## Shapes

Clean industrial radii: `6px` for technical badges and inputs, `10px` for album cards and tracks, `14px` for major workspace panels, and `9999px` pill geometry strictly for the Master Mode Switch and Signal Path status pill.

## Motion & Micro-interaction

All hover states and tab switches use `snappy` (`140ms`). Flipping the Bit-Perfect ↔ Spatial switch uses `mode-swap` (`240ms`), synchronized with the Rust engine's brief mute ramp. Live 60 fps FFT visualizers animate exclusively inside GPU-accelerated `<canvas>` layers, never DOM reflows.

## Voice & Content Strategy

Speak like an experienced mastering engineer: concise, honest, and technically exact. Never say "Enhanced Sound" or "HD Audio"; state exact verified facts such as `"Bit-Perfect · ALSA Exclusive · 96.0 kHz / 24-bit · 0.0 dB"` or `"Spatial DSP · TrueHD Atmos 7.1.4 → SOFA HRTF"`. Every action button names its exact outcome (`"Claim DAC Exclusively"`, `"Install Verified Add-On"`).

## Components

- **Master Mode Switch:** Segmented pill toggling between `button-bitperfect` (Emerald) and `button-spatial` (Cyan) with instant confirmation badge.
- **Signal Path Pill:** Clickable monochrome + semantic-dot telemetry readout (`24-bit / 192 kHz · hw:Bifrost2`) opening the multi-stage Signal Path Inspector popover.
- **DAC Hardware Card:** Displays USB Vendor/Model, ALSA ID, active reservation lock status, supported rate chips (44.1–384, DSD256), and `"Test DAC"` trigger.
- **Add-On Capability Card:** Lists signature verification badge, Wasm sandbox limits, explicit `allowed_hosts` domains, and one-click Install/Disable toggle.

## Do's and Don'ts

- **Do** keep tabular monospace alignment on every numeric readout and timecode.
- **Do** disable and visually lock the software volume slider (`0.0 dB LOCKED`) whenever Bit-Perfect or DSD/DoP is active.
- **Don't** use neon rainbow gradients, glassmorphism blur over dense track tables, or placeholder-only form inputs without visible labels.
- **Don't** hide audio downgrades; if a DAC rejects native DSD and falls back to PCM, surface an explicit amber `badge-dsp-warning` pill immediately.

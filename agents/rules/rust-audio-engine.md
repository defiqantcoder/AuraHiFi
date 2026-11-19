---
trigger: glob
globs: "src-tauri//*.rs, Cargo.toml"
description: "Strict real-time Rust audio engine, ALSA exclusive, PipeWire, D-Bus, and Spatial DSP rules for Ubuntu."
---

# Rust Audio Engine Rules

- **Zero Allocations on Audio Thread:** The playback write loop must never allocate (`Vec::push`, `String::from`, `format!`), never perform disk/network I/O, and never acquire blocking locks. Pre-allocate all PCM/DSD/FFT/HRTF scratch buffers on track open or mode switch.
- **Real-Time Priority:** Promote the dedicated audio output thread using `audio_thread_priority::promote_current_thread_to_real_time` (RTKit over D-Bus on Linux). Log a non-fatal warning if RTKit is unavailable; never panic.
- **ALSA Hardware Discipline:**
  - Open devices exclusively with `hw:CARD=<ALSA_ID>,DEV=<N>`. Reject `default` and `plughw:` in Bit-Perfect Mode.
  - Always reserve the card index via D-Bus `org.freedesktop.ReserveDevice1.Audio<card_index>` (`RequestRelease` with priority 10) before opening ALSA `hw:`, and release it cleanly on pause-timeout, stop, or app exit.
  - Probe exact supported sample rates and native DSD formats (such as `DSD_U32_BE`) from ALSA `hw_params` and `/proc/asound/card<N>/stream0`.
- **Hotplug Safety:** Use `udev` (`libudev`) monitoring on subsystem `sound`. On active DAC removal, immediately pause playback and zero the buffer; never auto-blast audio onto internal laptop speakers.
- **Ubuntu Spatial Constraint:** Never assume PipeWire's `sofa` filter-chain plugin exists on stock Ubuntu. Implement SOFA HRTF binaural rendering in-process in Rust (`audionimbus` / Steam Audio or `hrtf`) and keep `bs2b` stateful per stereo stream (calling `set_sample_rate` on rate change and `clear` on seek).
- **Async Tauri Commands:** Mark all Tauri commands interacting with hardware, SQLite, filesystem, or network as `async fn` and offload CPU-heavy work via `tokio::task::spawn_blocking`.
- **Release Mode Testing:** Always run Symphonia and DSP benchmarks or integration tests with `cargo test --release`.

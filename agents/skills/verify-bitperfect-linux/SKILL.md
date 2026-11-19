---
name: verify-bitperfect-linux
description: "Verify bit-perfect ALSA exclusive playback, sample-rate switching, D-Bus ReserveDevice1 isolation, and USB DAC hotplug safety on Ubuntu."
---

# Skill: Verify Bit-Perfect Playback on Ubuntu

## Verification Checklist

1. **Enumerate Hardware:** Run `cat /proc/asound/cards` and `cat /proc/asound/card<N>/stream0` for the connected USB DAC. Confirm the app detects the exact ALSA string ID, supported sample rates, and native DSD entries (such as `DSD_U32_BE`).
2. **Verify Exclusive Reservation Isolation:**
   - Play a browser audio clip on internal laptop speakers via PipeWire.
   - Start playback in AuraHiFi in Bit-Perfect Exclusive Mode targeting the USB DAC.
   - Run `wpctl status` and `pw-top` to confirm PipeWire released the USB DAC while laptop audio continues undisturbed.
3. **Verify Dynamic Sample-Rate Locking:**
   - Play a 44.1 kHz / 16-bit FLAC, then a 96 kHz / 24-bit FLAC, then a 192 kHz / 24-bit FLAC.
   - After each track starts, inspect `/proc/asound/card<N>/pcm0p/sub0/hw_params` to confirm `rate:` and `format:` match the source file with zero SRC.
   - Confirm software volume is locked at `0.0 dB` and the UI displays the Emerald `BIT-PERFECT` badge.
4. **Verify Spatial Toggle Safety:**
   - Flip the Master Switch from Bit-Perfect to Spatial.
   - Confirm zero audible pops/clicks, Signal Path updates to Cyan `SPATIAL DSP`, and SOFA HRTF / BS2B processes audio without xruns.
5. **Verify Unplug Safety:**
   - Physically disconnect the USB DAC during playback.
   - Confirm playback pauses immediately, zero sound leaks to laptop speakers, and the UI displays the safe disconnect toast.

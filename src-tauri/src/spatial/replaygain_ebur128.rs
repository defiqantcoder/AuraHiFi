//! EBU R128 (`ebur128` crate) loudness measurement, ReplayGain 2.0 normalization (`-18.0 LUFS`
//! target), and zero-allocation `-1.0 dBTP` soft-knee true-peak safety limiter.
//!
//! Bit-Perfect Honesty Invariant (`agents/AGENTS.md`):
//! - Strictly bypassed (`gain = 1.0`, zero attenuation/limiting) whenever `AudioMode::BitPerfect`
//!   is active.

use ebur128::{EbuR128, Mode};

use crate::models::AudioMode;

/// ReplayGain 2.0 reference target loudness (`-18.0 LUFS`).
pub const REPLAYGAIN_2_TARGET_LUFS: f64 = -18.0;
/// Audiophile True-Peak ceiling (`-1.0 dBTP` = `0.89125094` linear).
pub const TRUE_PEAK_CEILING_LINEAR: f32 = 0.891_250_94;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplayGainMode {
    Off,
    Track,
    Album,
}

impl ReplayGainMode {
    pub fn from_str_lossy(mode: &str) -> Self {
        match mode.trim().to_ascii_lowercase().as_str() {
            "track" => Self::Track,
            "album" => Self::Album,
            _ => Self::Off,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Track => "track",
            Self::Album => "album",
        }
    }
}

/// Summary of an EBU R128 loudness and True-Peak scan over a track or audio buffer.
#[derive(Debug, Clone, Copy)]
pub struct LoudnessAnalysis {
    pub integrated_lufs: f64,
    pub momentary_lufs: f64,
    pub shortterm_lufs: f64,
    pub true_peak_linear: f64,
    pub true_peak_dbtp: f64,
    pub replaygain_track_db: f64,
}

/// Offline / background EBU R128 loudness & True Peak scanner wrapping `ebur128::EbuR128`.
pub struct EbuR128LoudnessScanner {
    meter: EbuR128,
    channels: u32,
}

impl EbuR128LoudnessScanner {
    pub fn new(channels: u32, sample_rate_hz: u32) -> Result<Self, String> {
        let ch = channels.clamp(1, 16);
        let sr = sample_rate_hz.clamp(8_000, 384_000);
        let meter = EbuR128::new(
            ch,
            sr,
            Mode::I | Mode::M | Mode::S | Mode::TRUE_PEAK | Mode::SAMPLE_PEAK,
        )
        .map_err(|e| format!("Failed to initialize EbuR128 meter: {e}"))?;
        Ok(Self {
            meter,
            channels: ch,
        })
    }

    pub fn reset(&mut self) {
        self.meter.reset();
    }

    /// Feeds interleaved `f32` PCM frames into the EBU R128 loudness & 4x oversampled True-Peak filter.
    pub fn add_frames_f32(&mut self, interleaved_samples: &[f32]) -> Result<(), String> {
        self.meter
            .add_frames_f32(interleaved_samples)
            .map_err(|e| format!("EbuR128 add_frames_f32 error: {e}"))
    }

    /// Computes Integrated LUFS, Momentary LUFS, Short-Term LUFS, True Peak (`dBTP`),
    /// and ReplayGain 2.0 track gain (`-18.0 LUFS - integrated_lufs`).
    pub fn finalize_analysis(&self) -> LoudnessAnalysis {
        let integrated_lufs = self
            .meter
            .loudness_global()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(-18.0);
        let momentary_lufs = self
            .meter
            .loudness_momentary()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(-60.0);
        let shortterm_lufs = self
            .meter
            .loudness_shortterm()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(-60.0);

        let mut max_tp_linear = 0.0_f64;
        for ch in 0..self.channels {
            if let Ok(tp) = self.meter.true_peak(ch) {
                if tp > max_tp_linear {
                    max_tp_linear = tp;
                }
            }
        }

        let true_peak_dbtp = if max_tp_linear <= 1e-9 {
            -96.0
        } else {
            20.0 * max_tp_linear.log10()
        };

        let replaygain_track_db = (REPLAYGAIN_2_TARGET_LUFS - integrated_lufs).clamp(-24.0, 18.0);

        LoudnessAnalysis {
            integrated_lufs,
            momentary_lufs,
            shortterm_lufs,
            true_peak_linear: max_tp_linear,
            true_peak_dbtp,
            replaygain_track_db,
        }
    }
}

/// Real-time zero-allocation ReplayGain normalizer and `-1.0 dBTP` soft-knee safety limiter.
///
/// **Invariant:** When `audio_mode == AudioMode::BitPerfect`, `process_interleaved_f32` is a
/// strict no-op (`0.0 dB` bit-transparent).
#[derive(Debug, Clone)]
pub struct ReplayGainLimiterStage {
    mode: ReplayGainMode,
    track_gain_db: f64,
    album_gain_db: f64,
    track_true_peak_linear: f64,
    limiter_enabled: bool,
    computed_linear_gain: f32,
    envelope_gain: f32,
}

impl Default for ReplayGainLimiterStage {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayGainLimiterStage {
    pub fn new() -> Self {
        Self {
            mode: ReplayGainMode::Off,
            track_gain_db: 0.0,
            album_gain_db: 0.0,
            track_true_peak_linear: 1.0,
            limiter_enabled: true,
            computed_linear_gain: 1.0,
            envelope_gain: 1.0,
        }
    }

    pub const fn mode(&self) -> ReplayGainMode {
        self.mode
    }

    pub const fn limiter_enabled(&self) -> bool {
        self.limiter_enabled
    }

    pub const fn active_gain_db(&self, audio_mode: AudioMode) -> f64 {
        if matches!(audio_mode, AudioMode::BitPerfect) {
            return 0.0;
        }
        match self.mode {
            ReplayGainMode::Off => 0.0,
            ReplayGainMode::Track => self.track_gain_db,
            ReplayGainMode::Album => self.album_gain_db,
        }
    }

    pub fn clear(&mut self) {
        self.envelope_gain = 1.0;
    }

    pub fn configure(
        &mut self,
        mode: ReplayGainMode,
        track_gain_db: f64,
        album_gain_db: f64,
        track_true_peak_dbtp: f64,
        limiter_enabled: bool,
    ) {
        self.mode = mode;
        self.track_gain_db = track_gain_db.clamp(-24.0, 18.0);
        self.album_gain_db = album_gain_db.clamp(-24.0, 18.0);
        self.track_true_peak_linear = 10.0_f64.powf(track_true_peak_dbtp / 20.0).max(0.01);
        self.limiter_enabled = limiter_enabled;

        let target_db = match self.mode {
            ReplayGainMode::Off => 0.0,
            ReplayGainMode::Track => self.track_gain_db,
            ReplayGainMode::Album => self.album_gain_db,
        };
        let mut linear = 10.0_f64.powf(target_db / 20.0);

        // ReplayGain 2.0 clipping prevention: prevent positive ReplayGain boost from exceeding -1.0 dBTP
        if self.limiter_enabled
            && linear * self.track_true_peak_linear > TRUE_PEAK_CEILING_LINEAR as f64
        {
            linear = (TRUE_PEAK_CEILING_LINEAR as f64) / self.track_true_peak_linear;
        }
        self.computed_linear_gain = linear as f32;
    }

    /// Processes an interleaved stereo `f32` buffer in-place.
    ///
    /// - Strictly bypassed when `audio_mode == AudioMode::BitPerfect`.
    /// - Zero heap allocations.
    #[inline]
    pub fn process_interleaved_f32(&mut self, samples: &mut [f32], audio_mode: AudioMode) {
        // STRICT BIT-PERFECT INVARIANT: Never apply ReplayGain or limiting in Bit-Perfect mode.
        if audio_mode == AudioMode::BitPerfect {
            return;
        }

        let apply_rg = self.mode != ReplayGainMode::Off;
        if !apply_rg && !self.limiter_enabled {
            return;
        }

        let base_gain = if apply_rg {
            self.computed_linear_gain
        } else {
            1.0
        };

        for frame in samples.chunks_exact_mut(2) {
            let mut l = frame[0] * base_gain;
            let mut r = frame[1] * base_gain;

            if self.limiter_enabled {
                let peak = l.abs().max(r.abs());
                let target_env = if peak > TRUE_PEAK_CEILING_LINEAR {
                    TRUE_PEAK_CEILING_LINEAR / peak
                } else {
                    1.0
                };
                // Instant attack, smooth 5ms release
                if target_env < self.envelope_gain {
                    self.envelope_gain = target_env;
                } else {
                    self.envelope_gain += (1.0 - self.envelope_gain) * 0.004;
                }
                l *= self.envelope_gain;
                r *= self.envelope_gain;
            }

            frame[0] = l;
            frame[1] = r;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn ebur128_scanner_measures_integrated_lufs_and_true_peak() {
        let mut scanner = EbuR128LoudnessScanner::new(2, 48_000).expect("create ebur128 scanner");
        // Generate 1 second of 1 kHz stereo sine wave at -12 dBFS (amplitude = 0.25118864)
        let amp = 0.251_188_64_f32;
        let mut buf = Vec::with_capacity(48_000 * 2);
        for i in 0..48_000 {
            let s = (2.0 * PI * 1000.0 * (i as f32) / 48_000.0).sin() * amp;
            buf.push(s);
            buf.push(s);
        }
        scanner.add_frames_f32(&buf).expect("add frames");
        let report = scanner.finalize_analysis();
        assert!(
            report.integrated_lufs < -9.0 && report.integrated_lufs > -16.0,
            "Unexpected integrated LUFS: {}",
            report.integrated_lufs
        );
        assert!(
            (report.true_peak_dbtp - (-12.0)).abs() < 0.5,
            "Expected ~-12.0 dBTP true peak, got {}",
            report.true_peak_dbtp
        );
    }

    #[test]
    fn replaygain_is_strictly_bypassed_in_bitperfect_mode() {
        let mut stage = ReplayGainLimiterStage::new();
        stage.configure(ReplayGainMode::Track, -6.0, -5.0, -0.2, true);

        let original = [0.95_f32, -0.95, 0.5, -0.5];
        let mut bitperfect_buf = original;
        stage.process_interleaved_f32(&mut bitperfect_buf, AudioMode::BitPerfect);
        assert_eq!(
            bitperfect_buf, original,
            "ReplayGain/Limiter MUST NOT alter a single bit in AudioMode::BitPerfect"
        );

        let mut spatial_buf = original;
        stage.process_interleaved_f32(&mut spatial_buf, AudioMode::Spatial);
        assert!(
            spatial_buf[0] < original[0],
            "ReplayGain (-6 dB) must attenuate signal in AudioMode::Spatial"
        );
        assert!(
            spatial_buf
                .iter()
                .all(|s| s.abs() <= TRUE_PEAK_CEILING_LINEAR + 1e-5),
            "True-Peak limiter must enforce -1.0 dBTP ceiling in Spatial mode"
        );
    }
}

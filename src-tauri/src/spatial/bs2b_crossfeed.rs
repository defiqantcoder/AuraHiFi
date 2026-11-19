//! Stereo headphone Bauer stereophonic-to-binaural (`bs2b` crate) crossfeed processor.
//!
//! Real-time invariants (`agents/rules/rust-audio-engine.md`):
//! - Zero heap allocations on the audio callback thread (`process_interleaved` / `process_frame`).
//! - Stateful per stereo stream: calls `set_sample_rate` on sample rate change and `clear()` on
//!   seek, stop, or mode transition.
//! - Supports `DEFAULT` (700 Hz / 4.5 dB), `CMOY` (700 Hz / 6.0 dB), and `JMEIER` (650 Hz / 9.5 dB).

use bs2b::{Bs2b, Level, MAX_SAMPLE_RATE, MIN_SAMPLE_RATE};

/// Supported BS2B audiophile crossfeed presets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bs2bPreset {
    /// Original Boris Mikhaylov BS2B default (`700 Hz`, `4.5 dB`).
    Default,
    /// Chu Moy headphone crossfeed (`700 Hz`, `6.0 dB`).
    Cmoy,
    /// Jan Meier natural crossfeed (`650 Hz`, `9.5 dB`).
    Jmeier,
}

impl Bs2bPreset {
    pub fn from_str_lossy(name: &str) -> Self {
        match name.trim().to_ascii_lowercase().as_str() {
            "cmoy" => Self::Cmoy,
            "jmeier" | "meier" => Self::Jmeier,
            _ => Self::Default,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Cmoy => "cmoy",
            Self::Jmeier => "jmeier",
        }
    }

    pub const fn to_bs2b_level(self) -> Level {
        match self {
            Self::Default => Level::DEFAULT,
            Self::Cmoy => Level::CMOY,
            Self::Jmeier => Level::JMEIER,
        }
    }
}

/// Zero-allocation stateful BS2B headphone crossfeed processor.
#[derive(Clone, Debug)]
pub struct Bs2bCrossfeedProcessor {
    inner: Bs2b,
    preset: Bs2bPreset,
    enabled: bool,
}

impl Default for Bs2bCrossfeedProcessor {
    fn default() -> Self {
        Self::new(48_000, Bs2bPreset::Default, true)
    }
}

impl Bs2bCrossfeedProcessor {
    pub fn new(sample_rate_hz: u32, preset: Bs2bPreset, enabled: bool) -> Self {
        let clamped_rate = sample_rate_hz.clamp(MIN_SAMPLE_RATE, MAX_SAMPLE_RATE);
        let inner = Bs2b::new(clamped_rate, preset.to_bs2b_level()).unwrap_or_default();
        Self {
            inner,
            preset,
            enabled,
        }
    }

    pub const fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        if self.enabled != enabled {
            self.enabled = enabled;
            self.inner.clear();
        }
    }

    pub const fn preset(&self) -> Bs2bPreset {
        self.preset
    }

    /// Updates the BS2B crossfeed level (`DEFAULT`, `CMOY`, `JMEIER`) while preserving filter history.
    pub fn set_preset(&mut self, preset: Bs2bPreset) {
        self.preset = preset;
        self.inner.set_level(preset.to_bs2b_level());
    }

    /// Updates the active sample rate and clears filter history.
    pub fn set_sample_rate(&mut self, sample_rate_hz: u32) {
        let clamped = sample_rate_hz.clamp(MIN_SAMPLE_RATE, MAX_SAMPLE_RATE);
        let _ = self.inner.set_sample_rate(clamped);
    }

    /// Clears internal IIR filter history (called on track seek, stop, or mode switch).
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    pub fn is_clear(&self) -> bool {
        self.inner.is_clear()
    }

    /// Processes an interleaved stereo `f32` buffer (`[L0, R0, L1, R1, ...]`) in-place
    /// with zero heap allocations.
    #[inline]
    pub fn process_interleaved_f32(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.len() < 2 {
            return;
        }
        let even_len = samples.len() & !1;
        let _ = self.inner.process_interleaved(&mut samples[..even_len]);
    }

    /// Processes a single stereo `f64` frame in-place.
    #[inline]
    pub fn process_frame_f64(&mut self, left: f64, right: f64) -> (f64, f64) {
        if !self.enabled {
            return (left, right);
        }
        self.inner.process_frame(left, right)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_default_cmoy_and_jmeier_presets_and_crossfeeds_channels() {
        for preset in [Bs2bPreset::Default, Bs2bPreset::Cmoy, Bs2bPreset::Jmeier] {
            let mut proc = Bs2bCrossfeedProcessor::new(48_000, preset, true);
            // Hard-panned left signal (L = 0.8, R = 0.0)
            let mut buf = [0.0_f32; 64];
            for frame in buf.chunks_exact_mut(2) {
                frame[0] = 0.8;
                frame[1] = 0.0;
            }
            proc.process_interleaved_f32(&mut buf);

            // Right channel must receive crossfed low-frequency energy
            let right_energy: f32 = buf.iter().skip(1).step_by(2).map(|x| x * x).sum();
            assert!(
                right_energy > 1e-4,
                "Preset {:?} must crossfeed hard-panned left energy into right ear",
                preset
            );
            assert!(!proc.is_clear());
            proc.clear();
            assert!(proc.is_clear());
        }
    }

    #[test]
    fn disabled_bs2b_is_bit_transparent() {
        let mut proc = Bs2bCrossfeedProcessor::new(96_000, Bs2bPreset::Cmoy, false);
        let original = [0.25_f32, -0.4, 0.7, -0.1];
        let mut buf = original;
        proc.process_interleaved_f32(&mut buf);
        assert_eq!(buf, original);
    }
}

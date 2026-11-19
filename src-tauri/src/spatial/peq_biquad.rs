//! 10-Band 64-bit float (`f64`) RBJ Biquad Parametric EQ processor and AutoEQ preset loader.
//!
//! Real-time invariants:
//! - Uses fixed-size `[BiquadStage; MAX_PEQ_BANDS]` arrays on the stack/struct so zero heap
//!   allocations occur during sample processing.
//! - Direct Form II Transposed (`f64` internal accumulators) prevents quantization noise at low
//!   frequencies (`20 Hz`–`64 Hz`) even at `192 kHz` / `384 kHz` sampling rates.
//! - Strictly bypassed in `AudioMode::BitPerfect`.

use std::f64::consts::PI;

use crate::models::{PeqBand, PeqFilterType};

/// Canonical band capacity for the 10-band Parametric EQ chain.
pub const MAX_PEQ_BANDS: usize = 10;

/// Normalized RBJ Audio-EQ-Cookbook biquad transfer function coefficients:
/// $H(z) = \frac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 + a_1 z^{-1} + a_2 z^{-2}}$
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self::unity()
    }
}

impl BiquadCoeffs {
    pub const fn unity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    /// Computes Robert Bristow-Johnson (RBJ) Audio-EQ-Cookbook coefficients for a parametric band.
    pub fn from_peq_band(band: &PeqBand, sample_rate_hz: u32) -> Self {
        if !band.enabled || band.gain_db.abs() < 1e-4 {
            return Self::unity();
        }

        let sr = (sample_rate_hz.max(8_000)) as f64;
        // Clamp center frequency safely below Nyquist (0.49 * fs)
        let f0 = band.frequency_hz.clamp(10.0, sr * 0.48);
        let q = band.q_factor.clamp(0.1, 24.0);
        let a = 10.0_f64.powf(band.gain_db.clamp(-24.0, 24.0) / 40.0);
        let w0 = 2.0 * PI * f0 / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);

        let (b0, b1, b2, a0, a1, a2) = match band.filter_type {
            PeqFilterType::Peaking => (
                1.0 + alpha * a,
                -2.0 * cos_w0,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos_w0,
                1.0 - alpha / a,
            ),
            PeqFilterType::LowShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                (
                    a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0),
                    a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha),
                    (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0),
                    (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha,
                )
            }
            PeqFilterType::HighShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                (
                    a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0),
                    a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha),
                    (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha,
                    2.0 * ((a - 1.0) - (a + 1.0) * cos_w0),
                    (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha,
                )
            }
        };

        let inv_a0 = 1.0 / a0;
        Self {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }
}

/// Direct Form II Transposed stereo biquad filter stage.
#[derive(Debug, Clone, Copy, Default)]
struct BiquadStereoStage {
    coeffs: BiquadCoeffs,
    enabled: bool,
    z1_l: f64,
    z2_l: f64,
    z1_r: f64,
    z2_r: f64,
}

impl BiquadStereoStage {
    #[inline(always)]
    fn clear(&mut self) {
        self.z1_l = 0.0;
        self.z2_l = 0.0;
        self.z1_r = 0.0;
        self.z2_r = 0.0;
    }

    #[inline(always)]
    fn process_stereo(&mut self, left: f64, right: f64) -> (f64, f64) {
        if !self.enabled {
            return (left, right);
        }
        let c = &self.coeffs;
        let out_l = c.b0 * left + self.z1_l;
        self.z1_l = c.b1 * left - c.a1 * out_l + self.z2_l;
        self.z2_l = c.b2 * left - c.a2 * out_l;

        let out_r = c.b0 * right + self.z1_r;
        self.z1_r = c.b1 * right - c.a1 * out_r + self.z2_r;
        self.z2_r = c.b2 * right - c.a2 * out_r;

        (out_l, out_r)
    }
}

/// 10-band 64-bit float Parametric EQ processor with global preamp attenuation.
#[derive(Debug, Clone)]
pub struct ParametricEqProcessor {
    sample_rate_hz: u32,
    enabled: bool,
    preamp_gain_db: f64,
    preamp_linear: f64,
    active_band_count: usize,
    stages: [BiquadStereoStage; MAX_PEQ_BANDS],
}

impl Default for ParametricEqProcessor {
    fn default() -> Self {
        Self::new(48_000)
    }
}

impl ParametricEqProcessor {
    pub fn new(sample_rate_hz: u32) -> Self {
        Self {
            sample_rate_hz: sample_rate_hz.max(8_000),
            enabled: true,
            preamp_gain_db: 0.0,
            preamp_linear: 1.0,
            active_band_count: 0,
            stages: [BiquadStereoStage::default(); MAX_PEQ_BANDS],
        }
    }

    pub const fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub const fn active_band_count(&self) -> usize {
        self.active_band_count
    }

    pub const fn preamp_gain_db(&self) -> f64 {
        self.preamp_gain_db
    }

    /// Clears all biquad delay registers (called on track seek, stop, or mode switch).
    pub fn clear(&mut self) {
        for stage in &mut self.stages {
            stage.clear();
        }
    }

    /// Recomputes all 10 biquad stages from `bands` and `preamp_gain_db` at `sample_rate_hz`.
    pub fn configure(
        &mut self,
        enabled: bool,
        preamp_gain_db: f64,
        bands: &[PeqBand],
        sample_rate_hz: u32,
    ) {
        let rate_changed = self.sample_rate_hz != sample_rate_hz;
        self.sample_rate_hz = sample_rate_hz.max(8_000);
        self.enabled = enabled;
        self.preamp_gain_db = preamp_gain_db.clamp(-24.0, 12.0);
        self.preamp_linear = 10.0_f64.powf(self.preamp_gain_db / 20.0);

        let mut active = 0;
        for (idx, stage) in self.stages.iter_mut().enumerate() {
            if let Some(band) = bands.get(idx) {
                stage.enabled = band.enabled && band.gain_db.abs() >= 1e-4;
                stage.coeffs = BiquadCoeffs::from_peq_band(band, self.sample_rate_hz);
                if stage.enabled {
                    active += 1;
                }
            } else {
                stage.enabled = false;
                stage.coeffs = BiquadCoeffs::unity();
            }
            if rate_changed {
                stage.clear();
            }
        }
        self.active_band_count = active;
    }

    /// Processes a single stereo `f64` sample frame through preamp + 10 biquad bands.
    #[inline(always)]
    pub fn process_frame_f64(&mut self, left: f64, right: f64) -> (f64, f64) {
        if !self.enabled {
            return (left, right);
        }
        let mut l = left * self.preamp_linear;
        let mut r = right * self.preamp_linear;
        for stage in &mut self.stages {
            (l, r) = stage.process_stereo(l, r);
        }
        (l, r)
    }

    /// Processes an interleaved stereo `f32` buffer (`[L0, R0, L1, R1, ...]`) in-place
    /// using 64-bit float internal precision and zero heap allocations.
    #[inline]
    pub fn process_interleaved_f32(&mut self, samples: &mut [f32]) {
        if !self.enabled {
            return;
        }
        for frame in samples.chunks_exact_mut(2) {
            let (l, r) = self.process_frame_f64(frame[0] as f64, frame[1] as f64);
            frame[0] = l as f32;
            frame[1] = r as f32;
        }
    }
}

/// Parsed AutoEQ preset containing preamp gain and up to 10 parametric bands.
#[derive(Debug, Clone)]
pub struct AutoEqPreset {
    pub name: String,
    pub preamp_gain_db: f64,
    pub bands: Vec<PeqBand>,
}

/// Parses a standard AutoEQ / EqualizerAPO `ParametricEQ.txt` preset into `(preamp_gain_db, Vec<PeqBand>)`.
///
/// Format example:
/// ```text
/// Preamp: -5.4 dB
/// Filter 1: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71
/// Filter 2: ON PK Fc 1850 Hz Gain -2.4 dB Q 1.40
/// Filter 3: ON HSC Fc 10000 Hz Gain -1.5 dB Q 0.71
/// ```
pub fn parse_autoeq_parametric_txt(name: &str, text: &str) -> Result<AutoEqPreset, String> {
    let mut preamp_gain_db = 0.0_f64;
    let mut bands = Vec::with_capacity(MAX_PEQ_BANDS);

    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some(rest) = line.strip_prefix("Preamp:") {
            let num_str = rest
                .trim()
                .trim_end_matches("dB")
                .trim_end_matches("db")
                .trim();
            if let Ok(val) = num_str.parse::<f64>() {
                preamp_gain_db = val.clamp(-24.0, 12.0);
            }
            continue;
        }

        if line.starts_with("Filter") && bands.len() < MAX_PEQ_BANDS {
            let Some((_, rhs)) = line.split_once(':') else {
                continue;
            };
            let tokens: Vec<&str> = rhs.split_whitespace().collect();
            if tokens.len() < 8 {
                continue;
            }

            let enabled = tokens[0].eq_ignore_ascii_case("ON");
            let filter_type = match tokens[1].to_ascii_uppercase().as_str() {
                "LSC" | "LS" | "LOW_SHELF" => PeqFilterType::LowShelf,
                "HSC" | "HS" | "HIGH_SHELF" => PeqFilterType::HighShelf,
                _ => PeqFilterType::Peaking,
            };

            let mut freq_hz = 1000.0_f64;
            let mut gain_db = 0.0_f64;
            let mut q_factor = 1.41_f64;

            let mut i = 2;
            while i < tokens.len() {
                match tokens[i].to_ascii_uppercase().as_str() {
                    "FC" if i + 1 < tokens.len() => {
                        if let Ok(v) = tokens[i + 1].parse::<f64>() {
                            freq_hz = v;
                        }
                        i += 2;
                    }
                    "GAIN" if i + 1 < tokens.len() => {
                        if let Ok(v) = tokens[i + 1].parse::<f64>() {
                            gain_db = v;
                        }
                        i += 2;
                    }
                    "Q" if i + 1 < tokens.len() => {
                        if let Ok(v) = tokens[i + 1].parse::<f64>() {
                            q_factor = v;
                        }
                        i += 2;
                    }
                    _ => {
                        i += 1;
                    }
                }
            }

            let band_idx = bands.len() + 1;
            bands.push(PeqBand {
                id: format!("b{band_idx}"),
                frequency_hz: freq_hz.clamp(16.0, 22_000.0),
                gain_db: gain_db.clamp(-24.0, 24.0),
                q_factor: q_factor.clamp(0.1, 18.0),
                filter_type,
                enabled,
            });
        }
    }

    if bands.is_empty() {
        return Err("No valid AutoEQ 'Filter N:' rows found in preset text.".into());
    }

    // Pad up to 10 bands if preset had fewer than 10 filters
    const DEFAULT_FREQS: [f64; MAX_PEQ_BANDS] = [
        32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
    ];
    while bands.len() < MAX_PEQ_BANDS {
        let idx = bands.len();
        bands.push(PeqBand {
            id: format!("b{}", idx + 1),
            frequency_hz: DEFAULT_FREQS[idx],
            gain_db: 0.0,
            q_factor: 1.41,
            filter_type: PeqFilterType::Peaking,
            enabled: false,
        });
    }

    Ok(AutoEqPreset {
        name: name.to_string(),
        preamp_gain_db,
        bands,
    })
}

/// Built-in Oratory1990 / Harman Over-Ear 2018 AutoEQ reference presets.
pub fn builtin_autoeq_preset(profile_name: &str) -> Option<AutoEqPreset> {
    let lower = profile_name.to_ascii_lowercase();
    if lower.contains("hd 800") || lower.contains("hd800") {
        parse_autoeq_parametric_txt(
            "Sennheiser HD 800 S (Oratory1990 Harman)",
            "Preamp: -5.4 dB\n\
             Filter 1: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71\n\
             Filter 2: ON PK Fc 45 Hz Gain 1.5 dB Q 1.10\n\
             Filter 3: ON PK Fc 210 Hz Gain -1.8 dB Q 1.20\n\
             Filter 4: ON PK Fc 1050 Hz Gain -0.8 dB Q 1.50\n\
             Filter 5: ON PK Fc 1900 Hz Gain 2.6 dB Q 1.60\n\
             Filter 6: ON PK Fc 3200 Hz Gain 1.8 dB Q 2.10\n\
             Filter 7: ON PK Fc 5850 Hz Gain -4.5 dB Q 3.50\n\
             Filter 8: ON PK Fc 7800 Hz Gain -1.2 dB Q 2.80\n\
             Filter 9: ON PK Fc 10500 Hz Gain 1.4 dB Q 2.00\n\
             Filter 10: ON HSC Fc 13500 Hz Gain -1.5 dB Q 0.71",
        )
        .ok()
    } else if lower.contains("hd 650") || lower.contains("hd 6xx") {
        parse_autoeq_parametric_txt(
            "Sennheiser HD 650 / HD 6XX (Oratory1990 Harman)",
            "Preamp: -6.8 dB\n\
             Filter 1: ON LSC Fc 105 Hz Gain 5.5 dB Q 0.71\n\
             Filter 2: ON PK Fc 40 Hz Gain 2.2 dB Q 1.00\n\
             Filter 3: ON PK Fc 195 Hz Gain -2.5 dB Q 1.10\n\
             Filter 4: ON PK Fc 1250 Hz Gain -1.0 dB Q 1.80\n\
             Filter 5: ON PK Fc 2150 Hz Gain 1.6 dB Q 2.20\n\
             Filter 6: ON PK Fc 3150 Hz Gain 2.4 dB Q 2.40\n\
             Filter 7: ON PK Fc 4350 Hz Gain -1.4 dB Q 3.00\n\
             Filter 8: ON PK Fc 6500 Hz Gain 1.2 dB Q 2.60\n\
             Filter 9: ON PK Fc 9200 Hz Gain 1.8 dB Q 2.10\n\
             Filter 10: ON HSC Fc 12000 Hz Gain 2.5 dB Q 0.71",
        )
        .ok()
    } else if lower.contains("arya") || lower.contains("hifiman") {
        parse_autoeq_parametric_txt(
            "HiFiMAN Arya Stealth (Oratory1990 Harman)",
            "Preamp: -4.8 dB\n\
             Filter 1: ON LSC Fc 105 Hz Gain 4.8 dB Q 0.71\n\
             Filter 2: ON PK Fc 65 Hz Gain -0.6 dB Q 1.40\n\
             Filter 3: ON PK Fc 240 Hz Gain -0.5 dB Q 1.50\n\
             Filter 4: ON PK Fc 980 Hz Gain -1.4 dB Q 2.00\n\
             Filter 5: ON PK Fc 1850 Hz Gain 3.4 dB Q 1.80\n\
             Filter 6: ON PK Fc 3100 Hz Gain -1.5 dB Q 3.00\n\
             Filter 7: ON PK Fc 4600 Hz Gain -3.2 dB Q 4.00\n\
             Filter 8: ON PK Fc 6800 Hz Gain -2.0 dB Q 3.20\n\
             Filter 9: ON PK Fc 9500 Hz Gain -1.2 dB Q 2.50\n\
             Filter 10: ON HSC Fc 12500 Hz Gain -2.0 dB Q 0.71",
        )
        .ok()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_autoeq_parametric_eq_txt_into_10_bands() {
        let preset = builtin_autoeq_preset("Sennheiser HD 800 S").expect("load HD 800 S preset");
        assert_eq!(preset.preamp_gain_db, -5.4);
        assert_eq!(preset.bands.len(), 10);
        assert_eq!(preset.bands[0].filter_type, PeqFilterType::LowShelf);
        assert_eq!(preset.bands[0].frequency_hz, 105.0);
        assert_eq!(preset.bands[0].gain_db, 5.5);
        assert_eq!(preset.bands[6].frequency_hz, 5850.0);
        assert_eq!(preset.bands[6].gain_db, -4.5);
        assert_eq!(preset.bands[9].filter_type, PeqFilterType::HighShelf);
    }

    #[test]
    fn biquad_peq_boosts_target_frequency_and_honors_preamp() {
        let band = PeqBand {
            id: "b1".into(),
            frequency_hz: 1000.0,
            gain_db: 6.0,
            q_factor: 1.0,
            filter_type: PeqFilterType::Peaking,
            enabled: true,
        };
        let mut peq = ParametricEqProcessor::new(48_000);
        peq.configure(true, 0.0, &[band], 48_000);

        // Generate 1 kHz sine wave at 0.25 amplitude
        let mut signal = [0.0_f32; 512];
        for i in 0..256 {
            let s = ((2.0 * PI * 1000.0 * (i as f64) / 48_000.0).sin() * 0.25) as f32;
            signal[i * 2] = s;
            signal[i * 2 + 1] = s;
        }
        let input_rms: f32 = (signal.iter().skip(128).map(|x| x * x).sum::<f32>() / 384.0).sqrt();

        peq.process_interleaved_f32(&mut signal);
        let output_rms: f32 = (signal.iter().skip(128).map(|x| x * x).sum::<f32>() / 384.0).sqrt();

        // +6 dB peaking filter at 1 kHz should approximately double RMS amplitude (~1.9x - 2.05x)
        let ratio = output_rms / input_rms;
        assert!(
            ratio > 1.75 && ratio < 2.15,
            "Expected ~2.0x boost at 1 kHz for +6 dB PEQ, got {ratio:.3}"
        );
    }
}

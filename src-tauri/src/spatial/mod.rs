//! Phase 3 in-process Spatial Audio, TrueHD Atmos & Audiophile DSP engine (`src-tauri/src/spatial/`).
//!
//! Modules:
//! - [`truehd_atmos`]: Lossless Dolby TrueHD Atmos decoder (`truehd` crate, matrix-interpolation)
//!   feeding 7.1.4 bed + height + OAMD object coordinates into our SOFA HRTF renderer.
//! - [`sofa_hrtf`]: Self-contained in-process SOFA HRTF binaural convolver (embedded SADIE II D1
//!   default + custom `.sofa` AES69 HDF5 loader, zero PipeWire `sofa` dependency).
//! - [`bs2b_crossfeed`]: Zero-allocation stereo headphone crossfeed (`bs2b` `DEFAULT`, `CMOY`, `JMEIER`).
//! - [`peq_biquad`]: 10-band 64-bit float RBJ Biquad Parametric EQ processor + AutoEQ preset loader.
//! - [`replaygain_ebur128`]: EBU R128 (`ebur128`) loudness analyzer, ReplayGain 2.0 normalizer,
//!   and `-1.0 dBTP` true-peak limiter (strictly bypassed in `AudioMode::BitPerfect`).
//! - [`hdmi_iec958`]: HDMI IEC958 / IEC 61937 bitstream passthrough framer (`AC3`, `EAC3`, `TRUEHD`, `DTSHD`).

pub mod bs2b_crossfeed;
pub mod hdmi_iec958;
pub mod peq_biquad;
pub mod replaygain_ebur128;
pub mod sofa_hrtf;
pub mod truehd_atmos;

use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, AtomicU8, Ordering};

use crate::models::{AudioMode, SpatialConfig};
use bs2b_crossfeed::{Bs2bCrossfeedProcessor, Bs2bPreset};
use peq_biquad::{builtin_autoeq_preset, ParametricEqProcessor};
use replaygain_ebur128::{ReplayGainLimiterStage, ReplayGainMode};
use sofa_hrtf::{load_sofa_profile, SofaHrtfRenderer};
use truehd_atmos::{AtmosSpatialFrame, TrueHdAtmosDecoder};

/// Canonical duration (`50 ms`) of the raised-cosine mute-and-unmute ramp applied during an
/// atomic `AudioMode::BitPerfect <-> AudioMode::Spatial` transition to prevent DAC clicks.
pub const MODE_SWITCH_MUTE_RAMP_MS: u64 = 50;

const MODE_BIT_PERFECT: u8 = 0;
const MODE_SPATIAL: u8 = 1;

const fn encode_mode(mode: AudioMode) -> u8 {
    match mode {
        AudioMode::BitPerfect => MODE_BIT_PERFECT,
        AudioMode::Spatial => MODE_SPATIAL,
    }
}

const fn decode_mode(val: u8) -> AudioMode {
    if val == MODE_SPATIAL {
        AudioMode::Spatial
    } else {
        AudioMode::BitPerfect
    }
}

/// Lock-free atomic `AudioMode::BitPerfect <-> AudioMode::Spatial` switcher with a
/// 50 ms raised-cosine mute-and-unmute envelope (`1.0 -> 0.0 -> 1.0`).
///
/// - During the first 25 ms (`progress 0.0 -> 0.5`), the outgoing mode's output ramps smoothly
///   down to `0.0` (silence).
/// - At the exact zero-crossing midpoint (`progress == 0.5`, gain `== 0.0`), the active processing
///   path atomically flips to `target_mode`.
/// - During the second 25 ms (`progress 0.5 -> 1.0`), the new mode's output ramps smoothly back
///   up to `1.0`.
/// - Once `remaining_frames == 0` in `AudioMode::BitPerfect`, zero multiplications are performed
///   (100% bit-exact passthrough).
pub struct AtomicModeSwitcher {
    current_mode: AtomicU8,
    target_mode: AtomicU8,
    ramp_total_frames: AtomicU32,
    ramp_remaining_frames: AtomicU32,
}

impl Default for AtomicModeSwitcher {
    fn default() -> Self {
        Self::new(AudioMode::BitPerfect)
    }
}

impl AtomicModeSwitcher {
    pub const fn new(initial_mode: AudioMode) -> Self {
        let code = encode_mode(initial_mode);
        Self {
            current_mode: AtomicU8::new(code),
            target_mode: AtomicU8::new(code),
            ramp_total_frames: AtomicU32::new(0),
            ramp_remaining_frames: AtomicU32::new(0),
        }
    }

    pub fn active_mode(&self) -> AudioMode {
        decode_mode(self.current_mode.load(Ordering::Acquire))
    }

    pub fn target_mode(&self) -> AudioMode {
        decode_mode(self.target_mode.load(Ordering::Acquire))
    }

    pub fn is_transitioning(&self) -> bool {
        self.ramp_remaining_frames.load(Ordering::Acquire) > 0
    }

    /// Initiates an atomic `AudioMode::BitPerfect <-> AudioMode::Spatial` transition with a
    /// 50 ms mute ramp at `sample_rate_hz`. Returns the number of ramp frames scheduled.
    pub fn request_mode_switch(&self, new_mode: AudioMode, sample_rate_hz: u32) -> u32 {
        let target_code = encode_mode(new_mode);
        let current_code = self.current_mode.load(Ordering::Acquire);
        self.target_mode.store(target_code, Ordering::Release);

        if current_code == target_code && !self.is_transitioning() {
            return 0;
        }

        let sr = sample_rate_hz.clamp(8_000, 384_000);
        // 50 ms total ramp = 25 ms ramp-down + zero-crossing mode flip + 25 ms ramp-up
        let ramp_frames = (((sr as u64) * MODE_SWITCH_MUTE_RAMP_MS) / 1000)
            .max(64)
            .min(u32::MAX as u64) as u32;

        self.ramp_total_frames.store(ramp_frames, Ordering::Release);
        self.ramp_remaining_frames
            .store(ramp_frames, Ordering::Release);
        ramp_frames
    }

    /// Advances the mute-ramp state machine by 1 stereo frame on the real-time thread.
    /// Returns `(effective_mode_for_this_frame, linear_envelope_gain)`.
    #[inline(always)]
    pub fn step_frame(&self) -> (AudioMode, f32) {
        let rem = self.ramp_remaining_frames.load(Ordering::Acquire);
        if rem == 0 {
            let mode = decode_mode(self.target_mode.load(Ordering::Acquire));
            self.current_mode
                .store(encode_mode(mode), Ordering::Release);
            return (mode, 1.0);
        }

        let total = self.ramp_total_frames.load(Ordering::Acquire).max(2);
        let half = total / 2;
        let next_rem = rem - 1;
        self.ramp_remaining_frames
            .store(next_rem, Ordering::Release);

        // At midpoint zero-crossing, commit the target mode atomically while gain == 0.0
        if next_rem <= half {
            let target = self.target_mode.load(Ordering::Acquire);
            self.current_mode.store(target, Ordering::Release);
        }

        let elapsed = total - rem;
        // Raised-cosine notch: 1.0 at t=0 -> 0.0 at t=total/2 -> 1.0 at t=total
        let phase = (2.0 * PI * (elapsed as f32)) / (total as f32);
        let gain = (0.5 * (1.0 + phase.cos())).clamp(0.0, 1.0);
        let mode = decode_mode(self.current_mode.load(Ordering::Acquire));
        (mode, gain)
    }
}

/// Complete in-process Spatial DSP chain combining:
/// 1. Atomic 50 ms mute-ramp mode switcher (`BitPerfect <-> Spatial`)
/// 2. Lossless Dolby TrueHD Atmos decoder (`truehd` crate)
/// 3. In-process SOFA HRTF binaural renderer (SADIE II D1 default + custom `.sofa` loader)
/// 4. Stereo headphone `bs2b` crossfeed (`DEFAULT`, `CMOY`, `JMEIER`)
/// 5. 10-band 64-bit float RBJ Biquad Parametric EQ + AutoEQ preset loader
/// 6. `ebur128` ReplayGain 2.0 normalization + `-1.0 dBTP` true-peak limiter
pub struct SpatialDspPipeline {
    pub switcher: AtomicModeSwitcher,
    pub truehd_decoder: TrueHdAtmosDecoder,
    pub sofa_hrtf: SofaHrtfRenderer,
    pub bs2b: Bs2bCrossfeedProcessor,
    pub peq: ParametricEqProcessor,
    pub replaygain: ReplayGainLimiterStage,
    sample_rate_hz: u32,
    atmos_mode: String,
    binaural_enabled: bool,
}

impl Default for SpatialDspPipeline {
    fn default() -> Self {
        Self::new(48_000)
    }
}

impl SpatialDspPipeline {
    pub fn new(sample_rate_hz: u32) -> Self {
        let sr = sample_rate_hz.clamp(8_000, 384_000);
        Self {
            switcher: AtomicModeSwitcher::new(AudioMode::BitPerfect),
            truehd_decoder: TrueHdAtmosDecoder::new(2.4),
            sofa_hrtf: SofaHrtfRenderer::new(sr, 30.0, 12.0, 2.4),
            bs2b: Bs2bCrossfeedProcessor::new(sr, Bs2bPreset::Default, true),
            peq: ParametricEqProcessor::new(sr),
            replaygain: ReplayGainLimiterStage::new(),
            sample_rate_hz: sr,
            atmos_mode: "binaural_sofa".into(),
            binaural_enabled: true,
        }
    }

    pub const fn sample_rate_hz(&self) -> u32 {
        self.sample_rate_hz
    }

    /// Updates sample rate across all stateful DSP blocks and clears filter delay histories.
    pub fn set_sample_rate(&mut self, sample_rate_hz: u32) {
        let sr = sample_rate_hz.clamp(8_000, 384_000);
        if self.sample_rate_hz != sr {
            self.sample_rate_hz = sr;
            self.sofa_hrtf.set_sample_rate(sr);
            self.bs2b.set_sample_rate(sr);
            self.peq.clear();
            self.replaygain.clear();
        }
    }

    /// Clears all DSP delay lines and filter histories on track seek or stop.
    pub fn clear_on_seek(&mut self) {
        self.truehd_decoder.reset();
        self.sofa_hrtf.clear();
        self.bs2b.clear();
        self.peq.clear();
        self.replaygain.clear();
    }

    /// Applies an updated [`SpatialConfig`] from the UI (loading custom `.sofa` files or AutoEQ
    /// presets off the RT thread and updating BS2B, 10-band biquads, and ReplayGain).
    pub fn apply_config(
        &mut self,
        cfg: &SpatialConfig,
        track_replaygain_db: f64,
        track_true_peak_dbtp: f64,
    ) -> Result<(), String> {
        self.atmos_mode = cfg.atmos_mode.clone();
        self.binaural_enabled = cfg.atmos_mode == "binaural_sofa";

        // 1. Load or update SOFA HRTF profile & 3D listener geometry
        let profile = load_sofa_profile(&cfg.sofa_file_path, &cfg.sofa_profile_name)?;
        self.sofa_hrtf.set_sofa_profile(profile);
        self.sofa_hrtf.set_listener_geometry(
            cfg.azimuth_deg as f32,
            cfg.elevation_deg as f32,
            cfg.radius_meters as f32,
        );
        self.truehd_decoder
            .set_default_radius(cfg.radius_meters as f32);

        // 2. Update BS2B crossfeed preset & enable flag
        self.bs2b
            .set_preset(Bs2bPreset::from_str_lossy(&cfg.bs2b_preset));
        self.bs2b.set_enabled(cfg.bs2b_enabled);

        // 3. Configure 10-band 64-bit float Parametric EQ (or built-in AutoEQ preset if bands empty)
        if cfg.peq_bands.is_empty() {
            if let Some(preset) = builtin_autoeq_preset(&cfg.auto_eq_profile_name) {
                self.peq.configure(
                    cfg.peq_enabled,
                    preset.preamp_gain_db,
                    &preset.bands,
                    self.sample_rate_hz,
                );
            } else {
                self.peq.configure(
                    cfg.peq_enabled,
                    cfg.preamp_gain_db,
                    &cfg.peq_bands,
                    self.sample_rate_hz,
                );
            }
        } else {
            self.peq.configure(
                cfg.peq_enabled,
                cfg.preamp_gain_db,
                &cfg.peq_bands,
                self.sample_rate_hz,
            );
        }

        // 4. Configure EBU R128 ReplayGain & -1.0 dBTP True-Peak limiter
        self.replaygain.configure(
            ReplayGainMode::from_str_lossy(&cfg.replay_gain_mode),
            track_replaygain_db,
            track_replaygain_db,
            track_true_peak_dbtp,
            cfg.true_peak_limiter_enabled,
        );

        Ok(())
    }

    /// Processes an interleaved stereo `f32` buffer (`[L0, R0, L1, R1, ...]`) in-place.
    ///
    /// - When `AudioMode::BitPerfect` is active and not transitioning, returns immediately with
    ///   **zero modifications** (bit-exact passthrough).
    /// - During a 50 ms `BitPerfect <-> Spatial` mode transition, applies the raised-cosine
    ///   mute ramp (`1.0 -> 0.0 -> 1.0`) across the zero-crossing mode flip.
    /// - Zero heap allocations.
    pub fn process_stereo_interleaved_f32(&mut self, samples: &mut [f32]) {
        if samples.len() < 2 {
            return;
        }

        // Fast path: steady-state Bit-Perfect mode touches zero bits.
        if !self.switcher.is_transitioning()
            && self.switcher.active_mode() == AudioMode::BitPerfect
        {
            return;
        }

        if !self.switcher.is_transitioning() && self.switcher.active_mode() == AudioMode::Spatial {
            if self.binaural_enabled {
                self.sofa_hrtf.process_stereo_interleaved(samples);
            }
            self.bs2b.process_interleaved_f32(samples);
            self.peq.process_interleaved_f32(samples);
            self.replaygain
                .process_interleaved_f32(samples, AudioMode::Spatial);
            return;
        }

        // Transitioning frame-by-frame across the 50 ms mute ramp
        for frame in samples.chunks_exact_mut(2) {
            let (frame_mode, ramp_gain) = self.switcher.step_frame();
            if frame_mode == AudioMode::Spatial {
                let mut pair = [frame[0], frame[1]];
                if self.binaural_enabled {
                    self.sofa_hrtf.process_stereo_interleaved(&mut pair);
                }
                self.bs2b.process_interleaved_f32(&mut pair);
                self.peq.process_interleaved_f32(&mut pair);
                self.replaygain
                    .process_interleaved_f32(&mut pair, AudioMode::Spatial);
                frame[0] = pair[0] * ramp_gain;
                frame[1] = pair[1] * ramp_gain;
            } else {
                frame[0] *= ramp_gain;
                frame[1] *= ramp_gain;
            }
        }
    }

    /// Renders a decoded multi-channel [`AtmosSpatialFrame`] (7.1.4 bed + dynamic OAMD objects)
    /// into a stereo output buffer (`out_interleaved_lr.len() >= atmos_frame.sample_count * 2`).
    ///
    /// - In `AudioMode::Spatial` (`binaural_sofa`), renders all bed + height + object emitters
    ///   through `SofaHrtfRenderer`, followed by 10-band PEQ and ReplayGain / True-Peak limiting.
    /// - In `AudioMode::BitPerfect` or `stereo_downmix`, folds to the lossless 2.0 core.
    /// - Zero heap allocations.
    pub fn process_atmos_frame_to_stereo(
        &mut self,
        atmos_frame: &AtmosSpatialFrame,
        out_interleaved_lr: &mut [f32],
    ) -> usize {
        let mode = self.switcher.active_mode();
        if mode == AudioMode::Spatial && self.binaural_enabled {
            let frames = self
                .sofa_hrtf
                .render_atmos_frame_to_binaural(atmos_frame, out_interleaved_lr);
            let sample_slice = &mut out_interleaved_lr[..frames * 2];
            self.peq.process_interleaved_f32(sample_slice);
            self.replaygain
                .process_interleaved_f32(sample_slice, AudioMode::Spatial);
            frames
        } else {
            atmos_frame.fold_to_stereo_interleaved(out_interleaved_lr)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_mode_switch_executes_50ms_cosine_mute_ramp_and_flips_at_zero_crossing() {
        let switcher = AtomicModeSwitcher::new(AudioMode::BitPerfect);
        assert_eq!(switcher.active_mode(), AudioMode::BitPerfect);

        // At 48 kHz, 50 ms = 2,400 frames
        let ramp_frames = switcher.request_mode_switch(AudioMode::Spatial, 48_000);
        assert_eq!(ramp_frames, 2_400);
        assert!(switcher.is_transitioning());

        let mut min_gain = 1.0_f32;
        let mut mode_at_start = AudioMode::BitPerfect;
        let mut mode_at_end = AudioMode::BitPerfect;

        for idx in 0..ramp_frames {
            let (mode, gain) = switcher.step_frame();
            if idx == 0 {
                mode_at_start = mode;
            }
            if idx == ramp_frames - 1 {
                mode_at_end = mode;
            }
            if gain < min_gain {
                min_gain = gain;
            }
        }

        assert_eq!(mode_at_start, AudioMode::BitPerfect);
        assert_eq!(mode_at_end, AudioMode::Spatial);
        assert!(
            min_gain < 0.005,
            "50 ms ramp must reach silence (~0.0) at midpoint zero-crossing, got {min_gain}"
        );
        assert!(!switcher.is_transitioning());
        assert_eq!(switcher.active_mode(), AudioMode::Spatial);
    }

    #[test]
    fn bitperfect_steady_state_is_100_percent_bit_exact() {
        let mut pipeline = SpatialDspPipeline::new(48_000);
        let original = [0.1234567_f32, -0.7654321, 0.42, -0.42, 0.99, -0.99];
        let mut buf = original;
        pipeline.process_stereo_interleaved_f32(&mut buf);
        assert_eq!(
            buf, original,
            "Steady-state AudioMode::BitPerfect must be 100% bit-identical"
        );
    }

    #[test]
    fn end_to_end_truehd_atmos_to_sofa_hrtf_and_peq_pipeline() {
        let mut pipeline = SpatialDspPipeline::new(48_000);
        // Switch immediately to Spatial mode and drain ramp
        let ramp = pipeline
            .switcher
            .request_mode_switch(AudioMode::Spatial, 48_000);
        for _ in 0..ramp {
            let _ = pipeline.switcher.step_frame();
        }
        assert_eq!(pipeline.switcher.active_mode(), AudioMode::Spatial);

        let frames = pipeline
            .truehd_decoder
            .decode_embedded_reference_stream()
            .expect("decode embedded TrueHD stream");
        assert!(!frames.is_empty());

        let mut stereo_out = [0.0_f32; 320];
        let rendered = pipeline.process_atmos_frame_to_stereo(&frames[0], &mut stereo_out);
        assert!(rendered > 0);
        assert!(stereo_out[..rendered * 2].iter().all(|v| v.is_finite()));
    }
}

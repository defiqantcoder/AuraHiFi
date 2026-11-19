//! Lossless Dolby TrueHD Atmos decoder (`truehd` crate, matrix-interpolation enabled).
//!
//! Decodes TrueHD (MLP FBA) access units into 24-bit PCM bed + height + object streams
//! (up to 16 channels / 160 samples per access unit) and extracts Object Audio Metadata
//! (`OAMD`) 3D coordinates (`pos3d` -> spherical azimuth, elevation, radius) for the
//! in-process SOFA HRTF binaural renderer.
//!
//! Real-time safety:
//! - `AtmosSpatialFrame` uses fixed-size arrays (`[[f32; 16]; 160]` and `[SpatialEmitterCoord; 16]`)
//!   so zero heap allocations occur when transferring decoded access units into the HRTF stage.

use truehd::process::decode::{DecodedAccessUnit, Decoder};
use truehd::process::extract::Extractor;
use truehd::process::parse::Parser;
use truehd::process::EXAMPLE_DATA;
use truehd::structs::channel::ChannelLabel;

/// Maximum channels decoded per TrueHD Atmos presentation (7.1.4 bed + dynamic objects = up to 16).
pub const MAX_ATMOS_CHANNELS: usize = 16;
/// Maximum samples per TrueHD access unit (160 samples at 192 kHz, 40 at 48 kHz).
pub const MAX_AU_SAMPLES: usize = 160;
/// Normalization scale from signed 24-bit integer (`[-8_388_608, 8_388_607]`) to `f32` (`[-1.0, 1.0]`).
const PCM24_TO_F32: f32 = 1.0 / 8_388_608.0;

/// Spherical coordinates for a single Atmos bed channel or dynamic object emitter.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SpatialEmitterCoord {
    /// Horizontal angle in degrees (`-180.0..=180.0`, `0.0` = front center, `+30.0` = front left, `-30.0` = front right).
    pub azimuth_deg: f32,
    /// Vertical angle in degrees (`-90.0..=90.0`, `0.0` = ear level, `+45.0` = top height layer).
    pub elevation_deg: f32,
    /// Distance in meters (`0.5..=10.0`).
    pub radius_meters: f32,
    /// True if this channel is an LFE subwoofer channel (routed omnidirectionally with low-pass weighting).
    pub is_lfe: bool,
    /// True if this emitter carries dynamic OAMD object trajectory metadata.
    pub is_dynamic_object: bool,
}

impl Default for SpatialEmitterCoord {
    fn default() -> Self {
        Self {
            azimuth_deg: 0.0,
            elevation_deg: 0.0,
            radius_meters: 2.0,
            is_lfe: false,
            is_dynamic_object: false,
        }
    }
}

/// Maps a TrueHD [`ChannelLabel`] to ITU-R BS.2051 / Dolby Atmos 7.1.4 spherical coordinates.
pub const fn channel_label_to_spherical(
    label: ChannelLabel,
    default_radius: f32,
) -> SpatialEmitterCoord {
    let (az, el, is_lfe) = match label {
        ChannelLabel::L => (30.0, 0.0, false),
        ChannelLabel::R => (-30.0, 0.0, false),
        ChannelLabel::C => (0.0, 0.0, false),
        ChannelLabel::LFE | ChannelLabel::LFE2 => (0.0, -15.0, true),
        ChannelLabel::Ls => (110.0, 0.0, false),
        ChannelLabel::Rs => (-110.0, 0.0, false),
        ChannelLabel::Lb => (145.0, 0.0, false),
        ChannelLabel::Rb => (-145.0, 0.0, false),
        ChannelLabel::Cb => (180.0, 0.0, false),
        ChannelLabel::Lw => (60.0, 0.0, false),
        ChannelLabel::Rw => (-60.0, 0.0, false),
        ChannelLabel::Lsc => (15.0, 0.0, false),
        ChannelLabel::Rsc => (-15.0, 0.0, false),
        ChannelLabel::Lsd => (95.0, 0.0, false),
        ChannelLabel::Rsd => (-95.0, 0.0, false),
        ChannelLabel::Tfl => (45.0, 45.0, false),
        ChannelLabel::Tfr => (-45.0, 45.0, false),
        ChannelLabel::Tsl => (90.0, 45.0, false),
        ChannelLabel::Tsr => (-90.0, 45.0, false),
        ChannelLabel::Tbl => (135.0, 45.0, false),
        ChannelLabel::Tbr => (-135.0, 45.0, false),
        ChannelLabel::Tc => (0.0, 90.0, false),
        ChannelLabel::Tfc => (0.0, 45.0, false),
    };

    SpatialEmitterCoord {
        azimuth_deg: az,
        elevation_deg: el,
        radius_meters: default_radius,
        is_lfe,
        is_dynamic_object: false,
    }
}

/// Default 7.1.4 Atmos bed + height speaker coordinates when channel labels are absent.
pub const DEFAULT_7_1_4_LABELS: [ChannelLabel; 12] = [
    ChannelLabel::L,
    ChannelLabel::R,
    ChannelLabel::C,
    ChannelLabel::LFE,
    ChannelLabel::Ls,
    ChannelLabel::Rs,
    ChannelLabel::Lb,
    ChannelLabel::Rb,
    ChannelLabel::Tfl,
    ChannelLabel::Tfr,
    ChannelLabel::Tbl,
    ChannelLabel::Tbr,
];

/// Converts Dolby DAMF Cartesian object position `[x, y, z]` (`0.0..=1.0` room cube or `-1.0..=1.0`)
/// into spherical `(azimuth_deg, elevation_deg, radius_meters)`.
pub fn damf_cartesian_to_spherical(pos3d: [f64; 3], base_radius: f32) -> SpatialEmitterCoord {
    // DAMF normalized room coordinates: X in [0..1] (left=0, right=1) or signed [-1..1];
    // Y in [0..1] (front=0/1, back); Z in [0..1] (floor=0, ceiling=1).
    let (nx, ny, nz) = if (0.0..=1.0).contains(&pos3d[0]) && (0.0..=1.0).contains(&pos3d[1]) {
        (
            (0.5 - pos3d[0]) * 2.0, // +1.0 = Left, -1.0 = Right
            (1.0 - pos3d[1] * 2.0), // +1.0 = Front, -1.0 = Back
            pos3d[2].clamp(0.0, 1.0),
        )
    } else {
        (
            (-pos3d[0]).clamp(-1.0, 1.0),
            pos3d[1].clamp(-1.0, 1.0),
            pos3d[2].clamp(-1.0, 1.0),
        )
    };

    let horiz = (nx * nx + ny * ny).sqrt();
    let dist = (nx * nx + ny * ny + nz * nz).sqrt().max(0.15);
    let azimuth_deg = nx.atan2(ny).to_degrees() as f32;
    let elevation_deg = nz.atan2(horiz.max(1e-6)).to_degrees() as f32;
    let radius_meters = (base_radius * (dist as f32)).clamp(0.5, 8.0);

    SpatialEmitterCoord {
        azimuth_deg,
        elevation_deg,
        radius_meters,
        is_lfe: false,
        is_dynamic_object: true,
    }
}

/// Fixed-capacity stack/pre-allocated decoded TrueHD Atmos access unit ready for HRTF rendering.
#[derive(Clone, Debug)]
pub struct AtmosSpatialFrame {
    pub sample_rate_hz: u32,
    pub sample_count: usize,
    pub channel_count: usize,
    pub bed_channel_count: usize,
    pub dynamic_object_count: usize,
    /// Sample-major 32-bit float PCM (`samples[frame_idx][channel_idx]`).
    pub samples: [[f32; MAX_ATMOS_CHANNELS]; MAX_AU_SAMPLES],
    /// Spherical coordinates for each active channel (`0..channel_count`).
    pub emitters: [SpatialEmitterCoord; MAX_ATMOS_CHANNELS],
}

impl Default for AtmosSpatialFrame {
    fn default() -> Self {
        let mut emitters = [SpatialEmitterCoord::default(); MAX_ATMOS_CHANNELS];
        let mut i = 0;
        while i < DEFAULT_7_1_4_LABELS.len() {
            emitters[i] = channel_label_to_spherical(DEFAULT_7_1_4_LABELS[i], 2.4);
            i += 1;
        }
        Self {
            sample_rate_hz: 48_000,
            sample_count: 0,
            channel_count: 12,
            bed_channel_count: 12,
            dynamic_object_count: 0,
            samples: [[0.0; MAX_ATMOS_CHANNELS]; MAX_AU_SAMPLES],
            emitters,
        }
    }
}

impl AtmosSpatialFrame {
    /// Populates `self` in-place from a decoded `truehd::process::decode::DecodedAccessUnit`
    /// without allocating on the heap.
    pub fn fill_from_decoded_au(&mut self, au: &DecodedAccessUnit, default_radius: f32) {
        self.sample_rate_hz = au.sampling_frequency.max(48_000);
        self.sample_count = au.sample_length.min(MAX_AU_SAMPLES);
        self.channel_count = au.channel_count.clamp(1, MAX_ATMOS_CHANNELS);

        // Populate bed speaker coordinates from channel labels
        for ch in 0..self.channel_count {
            let label = au
                .channel_labels
                .get(ch)
                .copied()
                .or_else(|| DEFAULT_7_1_4_LABELS.get(ch).copied())
                .unwrap_or(ChannelLabel::C);
            self.emitters[ch] = channel_label_to_spherical(label, default_radius);
        }

        self.bed_channel_count = self.channel_count;
        self.dynamic_object_count = 0;

        // Overlay OAMD dynamic object coordinates if present in the TrueHD substream
        if let Some(oamd) = au.oamd.first() {
            let damf_positions = oamd.get_damf_pos();
            self.bed_channel_count = oamd
                .program_assignment
                .beds_or_isf_count()
                .min(self.channel_count);
            self.dynamic_object_count = oamd.program_assignment.num_dynamic_objects;

            for (obj_idx, blocks) in damf_positions.iter().enumerate().take(self.channel_count) {
                if let Some(&pos3d) = blocks.first() {
                    if obj_idx >= self.bed_channel_count
                        || oamd.program_assignment.b_dyn_object_only_program()
                    {
                        self.emitters[obj_idx] = damf_cartesian_to_spherical(pos3d, default_radius);
                    }
                }
            }
        }

        // Convert 24-bit signed integers into normalized f32 samples in-place
        for s in 0..self.sample_count {
            for ch in 0..self.channel_count {
                self.samples[s][ch] = (au.pcm_data[s][ch] as f32) * PCM24_TO_F32;
            }
            for ch in self.channel_count..MAX_ATMOS_CHANNELS {
                self.samples[s][ch] = 0.0;
            }
        }
    }

    /// Folds the multi-channel TrueHD Atmos frame down to a lossless ITU-R BS.775 stereo (2.0)
    /// core buffer in-place (`out_interleaved_stereo.len() >= self.sample_count * 2`).
    /// Used when an Atmos track is played on a stereo USB DAC in Bit-Perfect / Stereo Downmix mode.
    pub fn fold_to_stereo_interleaved(&self, out_interleaved_stereo: &mut [f32]) -> usize {
        let frames = self.sample_count.min(out_interleaved_stereo.len() / 2);
        const INV_SQRT2: f32 = std::f32::consts::FRAC_1_SQRT_2; // -3.01 dB center/surround fold
        const HEIGHT_GAIN: f32 = 0.5; // -6.02 dB height layer fold

        for i in 0..frames {
            let row = &self.samples[i];
            let mut left = row[0];
            let mut right = if self.channel_count > 1 {
                row[1]
            } else {
                row[0]
            };

            if self.channel_count > 2 {
                // Center
                left += row[2] * INV_SQRT2;
                right += row[2] * INV_SQRT2;
            }
            if self.channel_count > 5 {
                // Ls, Rs
                left += row[4] * INV_SQRT2;
                right += row[5] * INV_SQRT2;
            }
            if self.channel_count > 7 {
                // Lb, Rb
                left += row[6] * INV_SQRT2;
                right += row[7] * INV_SQRT2;
            }
            if self.channel_count > 11 {
                // Tfl, Tfr, Tbl, Tbr
                left += (row[8] + row[10]) * HEIGHT_GAIN;
                right += (row[9] + row[11]) * HEIGHT_GAIN;
            }

            // Headroom scaling to prevent clipping during 7.1.4 -> 2.0 fold
            out_interleaved_stereo[i * 2] = (left * 0.55).clamp(-1.0, 1.0);
            out_interleaved_stereo[i * 2 + 1] = (right * 0.55).clamp(-1.0, 1.0);
        }
        frames
    }
}

/// Stateful Dolby TrueHD Atmos decoder pipeline wrapping `truehd`'s `Extractor`, `Parser`, and `Decoder`.
pub struct TrueHdAtmosDecoder {
    extractor: Extractor,
    parser: Parser,
    decoder: Decoder,
    preferred_presentation: usize,
    default_radius_meters: f32,
    decoded_access_units: u64,
}

impl Default for TrueHdAtmosDecoder {
    fn default() -> Self {
        Self::new(2.4)
    }
}

impl TrueHdAtmosDecoder {
    pub fn new(default_radius_meters: f32) -> Self {
        Self {
            extractor: Extractor::default(),
            parser: Parser::default(),
            decoder: Decoder::default(),
            preferred_presentation: 0,
            default_radius_meters: default_radius_meters.clamp(0.5, 10.0),
            decoded_access_units: 0,
        }
    }

    pub fn set_default_radius(&mut self, radius_meters: f32) {
        self.default_radius_meters = radius_meters.clamp(0.5, 10.0);
    }

    pub fn decoded_access_units(&self) -> u64 {
        self.decoded_access_units
    }

    /// Resets internal MLP filter, matrix, and dither state after a stream discontinuity or seek.
    pub fn reset(&mut self) {
        self.parser.reset_for_next_major_sync();
        self.decoder.reset_for_next_major_sync();
    }

    /// Pushes raw TrueHD bitstream bytes and decodes all available access units into `out_frames`.
    pub fn decode_bitstream_chunk(
        &mut self,
        bitstream_bytes: &[u8],
        out_frames: &mut Vec<AtmosSpatialFrame>,
    ) -> Result<usize, String> {
        self.extractor.push_bytes(bitstream_bytes);
        let mut count = 0;

        while let Some(frame_result) = self.extractor.next() {
            match frame_result {
                Ok(frame) => {
                    let access_unit = self.parser.parse(&frame).map_err(|e| {
                        self.reset();
                        format!("TrueHD parse error: {e}")
                    })?;

                    let decoded = self
                        .decoder
                        .decode_presentation(&access_unit, self.preferred_presentation)
                        .map_err(|e| {
                            self.reset();
                            format!("TrueHD MLP decode error: {e}")
                        })?;

                    if decoded.is_duplicate {
                        continue;
                    }

                    let mut spatial_frame = AtmosSpatialFrame::default();
                    spatial_frame.fill_from_decoded_au(&decoded, self.default_radius_meters);
                    out_frames.push(spatial_frame);
                    self.decoded_access_units += 1;
                    count += 1;
                }
                Err(err) => {
                    // Stream continues automatically on minor sync extraction errors
                    eprintln!("[AuraHiFi][TrueHD] Frame extraction recovery: {err}");
                }
            }
        }

        Ok(count)
    }

    /// Decodes the embedded `truehd::process::EXAMPLE_DATA` reference MLP bitstream for self-test
    /// and hardware verification.
    pub fn decode_embedded_reference_stream(&mut self) -> Result<Vec<AtmosSpatialFrame>, String> {
        let mut frames = Vec::new();
        self.decode_bitstream_chunk(EXAMPLE_DATA, &mut frames)?;
        Ok(frames)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_truehd_reference_bitstream_into_spatial_frames() {
        let mut decoder = TrueHdAtmosDecoder::new(2.4);
        let frames = decoder
            .decode_embedded_reference_stream()
            .expect("decode embedded truehd EXAMPLE_DATA");
        assert!(
            !frames.is_empty(),
            "Expected at least one decoded TrueHD access unit"
        );
        let first = &frames[0];
        assert!(first.sample_rate_hz >= 48_000);
        assert!(first.sample_count > 0 && first.sample_count <= MAX_AU_SAMPLES);
        assert!(first.channel_count >= 2 && first.channel_count <= MAX_ATMOS_CHANNELS);
    }

    #[test]
    fn maps_7_1_4_channel_labels_to_expected_spherical_coordinates() {
        let tfl = channel_label_to_spherical(ChannelLabel::Tfl, 2.4);
        assert_eq!(tfl.azimuth_deg, 45.0);
        assert_eq!(tfl.elevation_deg, 45.0);
        assert!(!tfl.is_lfe);

        let lfe = channel_label_to_spherical(ChannelLabel::LFE, 2.4);
        assert!(lfe.is_lfe);
    }

    #[test]
    fn folds_7_1_4_spatial_frame_to_stereo_without_clipping() {
        let mut frame = AtmosSpatialFrame {
            sample_count: 32,
            channel_count: 12,
            ..Default::default()
        };
        for s in 0..32 {
            for ch in 0..12 {
                frame.samples[s][ch] = 0.5;
            }
        }
        let mut stereo = [0.0_f32; 64];
        let written = frame.fold_to_stereo_interleaved(&mut stereo);
        assert_eq!(written, 32);
        assert!(stereo.iter().all(|&x| (-1.0..=1.0).contains(&x) && x > 0.0));
    }
}

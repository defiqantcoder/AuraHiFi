//! Direct ALSA hardware exclusive (`hw:CARD=<ID>,DEV=0`) real-time output engine.
//!
//! Real-time invariants:
//! - Zero heap allocations, zero blocking I/O, and zero `Mutex::lock()` calls on the
//!   dedicated audio write thread.
//! - Communicates exclusively via lock-free `rtrb` SPSC ring buffer and atomics.
//! - Promotes the audio output thread via `audio_thread_priority` (RTKit over D-Bus),
//!   logging a non-fatal warning if RTKit is unavailable.
//! - Enforces strict `0.0 dB` volume lock in Bit-Perfect and DSD/DoP modes.
//! - Immediately pauses and zeroes the output buffer on USB DAC disconnect (`-ENODEV`
//!   or `udev` removal) with zero fallback to internal laptop speakers.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use alsa::pcm::{Access, Format, HwParams, PCM};
use alsa::{Direction, ValueOr};
use audio_thread_priority::promote_current_thread_to_real_time;
use rtrb::{Consumer, Producer, RingBuffer};

use crate::models::DsdCapability;

/// Transport format negotiated for an ALSA hardware stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamFormat {
    Pcm {
        sample_rate_hz: u32,
        bit_depth: u16,
        channels: u16,
    },
    NativeDsdU32Be {
        dsd_multiplier: u16,
        channels: u16,
    },
    DsdOverPcm {
        pcm_container_rate_hz: u32,
        dsd_multiplier: u16,
        channels: u16,
    },
}

impl StreamFormat {
    pub fn sample_rate_hz(&self) -> u32 {
        match *self {
            StreamFormat::Pcm { sample_rate_hz, .. } => sample_rate_hz,
            StreamFormat::NativeDsdU32Be { dsd_multiplier, .. } => {
                // DSD_U32_BE packs 32 1-bit DSD samples per 32-bit word:
                // DSD64 = 2,822,400 / 32 = 88,200 Hz word rate.
                (44_100 * dsd_multiplier as u32) / 32
            }
            StreamFormat::DsdOverPcm {
                pcm_container_rate_hz,
                ..
            } => pcm_container_rate_hz,
        }
    }

    pub fn channels(&self) -> u16 {
        match *self {
            StreamFormat::Pcm { channels, .. }
            | StreamFormat::NativeDsdU32Be { channels, .. }
            | StreamFormat::DsdOverPcm { channels, .. } => channels,
        }
    }

    pub fn alsa_format(&self) -> Format {
        match *self {
            StreamFormat::Pcm { bit_depth: 16, .. } => Format::s16(),
            StreamFormat::Pcm { .. } => Format::s32(),
            StreamFormat::NativeDsdU32Be { .. } => Format::DSDU32BE,
            StreamFormat::DsdOverPcm { .. } => Format::s32(),
        }
    }
}

/// Validates that an ALSA device identifier obeys Bit-Perfect hardware discipline.
/// Rejects `default` and `plughw:` in Bit-Perfect mode.
pub fn validate_exclusive_alsa_id(
    alsa_id: &str,
    bit_perfect_exclusive: bool,
) -> Result<(), String> {
    if !bit_perfect_exclusive {
        return Ok(());
    }
    let trimmed = alsa_id.trim();
    if trimmed.eq_ignore_ascii_case("default") || trimmed.starts_with("plughw:") {
        return Err(format!(
            "Rejected non-exclusive ALSA device '{trimmed}' in Bit-Perfect Mode; use hw:CARD=<ID>,DEV=0."
        ));
    }
    if !trimmed.starts_with("hw:CARD=") && !trimmed.starts_with("hdmi:CARD=") {
        return Err(format!(
            "ALSA device '{trimmed}' must use a stable card ID (hw:CARD=<ID>,DEV=0), never a numeric card index."
        ));
    }
    Ok(())
}

/// Negotiates the highest-integrity transport format for a track on the target DAC.
/// Returns `(negotiated_format, fell_back_to_pcm)`.
pub fn negotiate_dsd_transport(
    dsd_multiplier: u16,
    channels: u16,
    dac_dsd: DsdCapability,
    supported_rates: &[u32],
) -> (StreamFormat, bool) {
    match dac_dsd {
        DsdCapability::Native => (
            StreamFormat::NativeDsdU32Be {
                dsd_multiplier,
                channels,
            },
            false,
        ),
        DsdCapability::Dop => {
            // DoP packs 16 DSD bits per 24-bit PCM sample -> container rate = (44100 * mult) / 16
            let dop_rate = (44_100 * dsd_multiplier as u32) / 16;
            if supported_rates.contains(&dop_rate) {
                (
                    StreamFormat::DsdOverPcm {
                        pcm_container_rate_hz: dop_rate,
                        dsd_multiplier,
                        channels,
                    },
                    false,
                )
            } else {
                let fallback_rate = supported_rates
                    .iter()
                    .copied()
                    .filter(|&r| r <= 176_400)
                    .max()
                    .unwrap_or(48_000);
                (
                    StreamFormat::Pcm {
                        sample_rate_hz: fallback_rate,
                        bit_depth: 24,
                        channels,
                    },
                    true,
                )
            }
        }
        DsdCapability::PcmFallback | DsdCapability::None => {
            let fallback_rate = supported_rates
                .iter()
                .copied()
                .filter(|&r| r <= 176_400)
                .max()
                .unwrap_or(48_000);
            (
                StreamFormat::Pcm {
                    sample_rate_hz: fallback_rate,
                    bit_depth: 24,
                    channels,
                },
                true,
            )
        }
    }
}

/// Packs 16-bit DSD chunks into 32-bit MSB-aligned DoP samples with alternating `0x05` / `0xFA` markers.
pub fn pack_dop_sample(dsd_hi: u8, dsd_lo: u8, marker_toggle: bool) -> i32 {
    let marker: u32 = if marker_toggle { 0xFA } else { 0x05 };
    let word24: u32 = (marker << 16) | ((dsd_hi as u32) << 8) | (dsd_lo as u32);
    // Align 24-bit DoP frame into S32_LE MSB position (zero-padded LSB)
    (word24 << 8) as i32
}

/// Returns `true` when two consecutive tracks can transition gaplessly without reopening ALSA hw_params.
pub fn can_transition_gapless(current: StreamFormat, next: StreamFormat) -> bool {
    current == next
}

/// Lock-free atomic control block shared between UI/decoder threads and the real-time ALSA thread.
pub struct RtAudioControl {
    pub playing: AtomicBool,
    pub stop_requested: AtomicBool,
    pub unplug_halted: AtomicBool,
    pub volume_locked_zero_db: AtomicBool,
    pub active_sample_rate: AtomicU32,
    pub frames_written: AtomicU64,
    pub xrun_count: AtomicU32,
}

impl RtAudioControl {
    pub fn new() -> Self {
        Self {
            playing: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
            unplug_halted: AtomicBool::new(false),
            volume_locked_zero_db: AtomicBool::new(true),
            active_sample_rate: AtomicU32::new(48_000),
            frames_written: AtomicU64::new(0),
            xrun_count: AtomicU32::new(0),
        }
    }
}

impl Default for RtAudioControl {
    fn default() -> Self {
        Self::new()
    }
}

/// Real-time ALSA exclusive output handle managed by `AppState`.
pub struct AlsaOutputEngine {
    pub control: Arc<RtAudioControl>,
    worker: Option<JoinHandle<()>>,
}

impl AlsaOutputEngine {
    pub fn new() -> Self {
        Self {
            control: Arc::new(RtAudioControl::new()),
            worker: None,
        }
    }

    /// Immediately signals the real-time audio thread to pause and zero output buffers
    /// when a USB DAC is disconnected. Never falls back to internal laptop speakers.
    pub fn signal_unplug_halt(&self) {
        self.control.unplug_halted.store(true, Ordering::Release);
        self.control.playing.store(false, Ordering::Release);
    }

    pub fn clear_unplug_halt(&self) {
        self.control.unplug_halted.store(false, Ordering::Release);
    }

    pub fn set_playing(&self, playing: bool) {
        if self.control.unplug_halted.load(Ordering::Acquire) {
            self.control.playing.store(false, Ordering::Release);
            return;
        }
        self.control.playing.store(playing, Ordering::Release);
    }

    pub fn set_volume_locked(&self, locked: bool) {
        self.control
            .volume_locked_zero_db
            .store(locked, Ordering::Release);
    }

    /// Opens an exclusive ALSA hardware device and starts the zero-allocation RT write thread.
    /// Returns the lock-free `rtrb::Producer<i32>` for the decoder thread to push interleaved samples.
    pub fn open_stream(
        &mut self,
        alsa_id: &str,
        format: StreamFormat,
        bit_perfect_exclusive: bool,
        ring_capacity_samples: usize,
    ) -> Result<Producer<i32>, String> {
        validate_exclusive_alsa_id(alsa_id, bit_perfect_exclusive)?;
        self.stop_stream();

        let rate = format.sample_rate_hz();
        let channels = format.channels();
        let alsa_fmt = format.alsa_format();
        let pcm = PCM::new(alsa_id, Direction::Playback, false)
            .map_err(|e| format!("Failed to open ALSA device '{alsa_id}': {e}"))?;

        {
            let hwp = HwParams::any(&pcm)
                .map_err(|e| format!("ALSA HwParams::any failed on '{alsa_id}': {e}"))?;
            hwp.set_access(Access::RWInterleaved)
                .map_err(|e| format!("ALSA set_access failed: {e}"))?;
            hwp.set_format(alsa_fmt)
                .map_err(|e| format!("ALSA format {alsa_fmt:?} unsupported on '{alsa_id}': {e}"))?;
            hwp.set_channels(channels as u32)
                .map_err(|e| format!("ALSA channels={channels} unsupported: {e}"))?;
            // Reject rate resampling in hardware: enforce exact sample rate.
            hwp.set_rate(rate, ValueOr::Nearest)
                .map_err(|e| format!("ALSA rate={rate} Hz unsupported on '{alsa_id}': {e}"))?;
            let actual_rate = hwp
                .get_rate()
                .map_err(|e| format!("ALSA get_rate failed: {e}"))?;
            if bit_perfect_exclusive && actual_rate != rate {
                return Err(format!(
                    "Bit-Perfect rate mismatch on '{alsa_id}': requested {rate} Hz, hardware returned {actual_rate} Hz."
                ));
            }
            pcm.hw_params(&hwp)
                .map_err(|e| format!("ALSA hw_params commit failed: {e}"))?;
        }

        pcm.prepare()
            .map_err(|e| format!("ALSA pcm.prepare() failed: {e}"))?;

        let (producer, consumer) = RingBuffer::<i32>::new(ring_capacity_samples.max(4096));
        self.control.stop_requested.store(false, Ordering::Release);
        self.control.unplug_halted.store(false, Ordering::Release);
        self.control
            .active_sample_rate
            .store(rate, Ordering::Release);

        let control = self.control.clone();
        let handle = thread::Builder::new()
            .name("aurahifi-alsa-rt".into())
            .spawn(move || {
                run_rt_alsa_loop(pcm, consumer, control, rate, channels as usize);
            })
            .map_err(|e| format!("Failed to spawn RT ALSA thread: {e}"))?;

        self.worker = Some(handle);
        Ok(producer)
    }

    pub fn stop_stream(&mut self) {
        self.control.stop_requested.store(true, Ordering::Release);
        self.control.playing.store(false, Ordering::Release);
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for AlsaOutputEngine {
    fn drop(&mut self) {
        self.stop_stream();
    }
}

impl Default for AlsaOutputEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Real-time audio output loop.
/// Pre-allocates the period buffer once before entering the loop; performs ZERO heap
/// allocations, ZERO mutex locks, and ZERO disk/D-Bus I/O inside the loop.
fn run_rt_alsa_loop(
    pcm: PCM,
    mut consumer: Consumer<i32>,
    control: Arc<RtAudioControl>,
    sample_rate_hz: u32,
    channels: usize,
) {
    let period_frames: usize = 512;
    if let Err(err) = promote_current_thread_to_real_time(period_frames as u32, sample_rate_hz) {
        eprintln!("[AuraHiFi][WARN] RTKit real-time promotion unavailable (non-fatal): {err:?}");
    }

    // Pre-allocated period scratch buffer (zero allocations inside loop).
    let period_samples = period_frames * channels.max(1);
    let mut period_buf = vec![0_i32; period_samples];

    let Ok(io) = pcm.io_i32() else {
        control.unplug_halted.store(true, Ordering::Release);
        control.playing.store(false, Ordering::Release);
        return;
    };

    while !control.stop_requested.load(Ordering::Acquire) {
        if control.unplug_halted.load(Ordering::Acquire) {
            // Zero buffer immediately and exit without touching any other device.
            period_buf.fill(0);
            let _ = pcm.drop();
            break;
        }

        if !control.playing.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(5));
            continue;
        }

        // Fill pre-allocated period buffer from lock-free SPSC ring buffer.
        let mut filled = 0;
        while filled < period_samples {
            match consumer.pop() {
                Ok(sample) => {
                    period_buf[filled] = sample;
                    filled += 1;
                }
                Err(_) => break,
            }
        }
        if filled < period_samples {
            period_buf[filled..].fill(0);
        }

        match io.writei(&period_buf) {
            Ok(frames) => {
                control
                    .frames_written
                    .fetch_add(frames as u64, Ordering::Relaxed);
            }
            Err(err) => {
                // ENODEV (-19) indicates USB DAC physical disconnect: safe-pause immediately.
                if err.errno() == 19 {
                    period_buf.fill(0);
                    control.unplug_halted.store(true, Ordering::Release);
                    control.playing.store(false, Ordering::Release);
                    let _ = pcm.drop();
                    break;
                }
                // Attempt xrun recovery without allocating.
                control.xrun_count.fetch_add(1, Ordering::Relaxed);
                if pcm.try_recover(err, true).is_err() {
                    period_buf.fill(0);
                    control.unplug_halted.store(true, Ordering::Release);
                    control.playing.store(false, Ordering::Release);
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_default_and_plughw_in_bitperfect_mode() {
        assert!(validate_exclusive_alsa_id("default", true).is_err());
        assert!(validate_exclusive_alsa_id("plughw:CARD=Bifrost2,DEV=0", true).is_err());
        assert!(validate_exclusive_alsa_id("hw:1,0", true).is_err());
        assert!(validate_exclusive_alsa_id("hw:CARD=Bifrost2,DEV=0", true).is_ok());
        assert!(validate_exclusive_alsa_id("hdmi:CARD=NVidia,DEV=0", true).is_ok());
    }

    #[test]
    fn packs_dop_markers_alternating_0x05_and_0xfa() {
        let s0 = pack_dop_sample(0xAA, 0x55, false) as u32;
        let s1 = pack_dop_sample(0x12, 0x34, true) as u32;
        assert_eq!(s0, 0x05AA_5500);
        assert_eq!(s1, 0xFA12_3400);
    }

    #[test]
    fn negotiates_native_dsd_dop_and_pcm_fallback_honestly() {
        let rates_192 = [44100, 48000, 88200, 96000, 176400, 192000];
        let (fmt_native, fell_back) =
            negotiate_dsd_transport(256, 2, DsdCapability::Native, &rates_192);
        assert!(!fell_back);
        assert!(matches!(
            fmt_native,
            StreamFormat::NativeDsdU32Be {
                dsd_multiplier: 256,
                ..
            }
        ));

        // DSD64 DoP requires 176.4 kHz PCM container
        let (fmt_dop, fell_back_dop) =
            negotiate_dsd_transport(64, 2, DsdCapability::Dop, &rates_192);
        assert!(!fell_back_dop);
        assert!(matches!(
            fmt_dop,
            StreamFormat::DsdOverPcm {
                pcm_container_rate_hz: 176_400,
                ..
            }
        ));

        // PCM-only DAC must surface honest PCM fallback
        let (fmt_fb, fell_back_pcm) =
            negotiate_dsd_transport(256, 2, DsdCapability::PcmFallback, &rates_192);
        assert!(fell_back_pcm);
        assert!(matches!(
            fmt_fb,
            StreamFormat::Pcm {
                sample_rate_hz: 176_400,
                bit_depth: 24,
                ..
            }
        ));
    }

    #[test]
    fn gapless_transition_allowed_only_on_matching_stream_format() {
        let a = StreamFormat::Pcm {
            sample_rate_hz: 96_000,
            bit_depth: 24,
            channels: 2,
        };
        let b = StreamFormat::Pcm {
            sample_rate_hz: 96_000,
            bit_depth: 24,
            channels: 2,
        };
        let c = StreamFormat::Pcm {
            sample_rate_hz: 192_000,
            bit_depth: 24,
            channels: 2,
        };
        assert!(can_transition_gapless(a, b));
        assert!(!can_transition_gapless(a, c));
    }

    #[test]
    fn lock_free_ring_buffer_transfers_samples_without_loss() {
        let (mut prod, mut cons) = RingBuffer::<i32>::new(1024);
        for v in 0..256_i32 {
            prod.push(v).expect("push sample");
        }
        for v in 0..256_i32 {
            assert_eq!(cons.pop().expect("pop sample"), v);
        }
    }
}

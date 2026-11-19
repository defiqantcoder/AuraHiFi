use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::ipc::Channel;
use tokio::sync::{oneshot, RwLock};

use crate::audio::alsa_output::AlsaOutputEngine;
use crate::audio::dbus_reserve::DbusDeviceReservation;
use crate::audio::device_monitor;
use crate::models::{
    AddonCatalogItem, AddonPermissions, AudioDeviceInfo, AudioMode, DsdCapability,
    GeminiApiKeyStatus, HardwareEvent, LibraryFolder, PeqBand, PeqFilterType, PlaybackState,
    PlaybackStatus, ReservationStatus, SampleRateSwitchLock, ScanProgressEvent, SignalPathError,
    SignalPathErrorCode, SignalPathIntegrity, SignalPathStage, SignalPathState, SignalStageStatus,
    SpatialConfig, TelemetryFrame, TrackSummary, TransportType,
};
use crate::spatial::SpatialDspPipeline;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[allow(dead_code)]
fn deterministic_waveform(mut state: u64, len: usize) -> Vec<f32> {
    let mut peaks = Vec::with_capacity(len);
    for i in 0..len {
        state = (state.wrapping_mul(1664525).wrapping_add(1013904223)) % 4294967296;
        let norm = (state as f32) / 4294967296.0;
        let envelope = (((i as f32) / (len as f32)) * std::f32::consts::PI).sin() * 0.55 + 0.45;
        let val = ((0.28 + norm * 0.72) * envelope).clamp(0.14, 1.0);
        peaks.push((val * 1000.0).round() / 1000.0);
    }
    peaks
}

pub struct InnerState {
    pub devices: Vec<AudioDeviceInfo>,
    pub tracks: Vec<TrackSummary>,
    pub library_folders: Vec<LibraryFolder>,
    pub addons: Vec<AddonCatalogItem>,
    pub mode: AudioMode,
    pub active_device_id: Option<String>,
    pub exclusive_mode: bool,
    pub bypass_laptop: bool,
    pub spatial_config: SpatialConfig,
    pub spatial_dsp: SpatialDspPipeline,
    pub playback: PlaybackState,
    pub active_error: Option<SignalPathError>,
    pub mb_backoff_attempt: u32,
    pub gemini_api_key: Option<String>,
    pub gemini_key_updated_at_ms: Option<u64>,
    pub dbus_reservation: Option<DbusDeviceReservation>,
    pub telemetry_tasks: HashMap<String, oneshot::Sender<()>>,
    pub hardware_channels: HashMap<String, Channel<HardwareEvent>>,
    pub scan_channels: HashMap<String, Channel<ScanProgressEvent>>,
}

impl InnerState {
    pub fn new() -> Self {
        let devices = vec![
            AudioDeviceInfo {
                alsa_id: "hw:CARD=Bifrost2,DEV=0".into(),
                short_id: "hw:Bifrost2".into(),
                card_index: 2,
                vendor: "Schiit Audio".into(),
                display_name: "Schiit Bifrost 2/64".into(),
                usb_vid_pid: Some("20B1:3023 (Unison USB)".into()),
                transport_type: TransportType::Usb,
                supported_sample_rates: vec![44100, 48000, 88200, 96000, 176400, 192000],
                supported_bit_depths: vec![16, 24, 32],
                dsd_capability: DsdCapability::PcmFallback,
                max_dsd_multiplier: None,
                reservation_status: ReservationStatus::ReservedByAurahifi,
                holding_process: None,
                holding_pid: None,
                is_isolated_internal: false,
                supports_hardware_volume: false,
                iec958_passthrough: false,
                stream0_path: Some("/proc/asound/Bifrost2/stream0".into()),
                dac_chipset: "True Multibit 4x TI DAC8812".into(),
            },
            AudioDeviceInfo {
                alsa_id: "hw:CARD=iFiAudio,DEV=0".into(),
                short_id: "hw:iFiZENDAC".into(),
                card_index: 3,
                vendor: "iFi audio".into(),
                display_name: "iFi ZEN DAC V2".into(),
                usb_vid_pid: Some("20B1:3008 (XMOS 16-Core)".into()),
                transport_type: TransportType::Usb,
                supported_sample_rates: vec![
                    44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000,
                ],
                supported_bit_depths: vec![16, 24, 32],
                dsd_capability: DsdCapability::Native,
                max_dsd_multiplier: Some(256),
                reservation_status: ReservationStatus::Available,
                holding_process: None,
                holding_pid: None,
                is_isolated_internal: false,
                supports_hardware_volume: true,
                iec958_passthrough: false,
                stream0_path: Some("/proc/asound/iFiAudio/stream0".into()),
                dac_chipset: "Burr-Brown True Native DSD256".into(),
            },
            AudioDeviceInfo {
                alsa_id: "hdmi:CARD=NVidia,DEV=1".into(),
                short_id: "hdmi:DenonAVR".into(),
                card_index: 1,
                vendor: "Denon".into(),
                display_name: "Denon AVR-X3800H (HDMI eARC)".into(),
                usb_vid_pid: None,
                transport_type: TransportType::Hdmi,
                supported_sample_rates: vec![44100, 48000, 88200, 96000, 176400, 192000],
                supported_bit_depths: vec![16, 24],
                dsd_capability: DsdCapability::None,
                max_dsd_multiplier: None,
                reservation_status: ReservationStatus::Available,
                holding_process: None,
                holding_pid: None,
                is_isolated_internal: false,
                supports_hardware_volume: false,
                iec958_passthrough: true,
                stream0_path: Some("/proc/asound/card1/eld#0.1".into()),
                dac_chipset: "HDMI 2.1 IEC958 Bitstream / Atmos 7.1.4".into(),
            },
            AudioDeviceInfo {
                alsa_id: "hw:CARD=PCH,DEV=0".into(),
                short_id: "hw:IntelHDA".into(),
                card_index: 0,
                vendor: "Intel Corporation".into(),
                display_name: "Built-in Intel HDA Speakers".into(),
                usb_vid_pid: None,
                transport_type: TransportType::Internal,
                supported_sample_rates: vec![44100, 48000],
                supported_bit_depths: vec![16, 24],
                dsd_capability: DsdCapability::None,
                max_dsd_multiplier: None,
                reservation_status: ReservationStatus::Available,
                holding_process: None,
                holding_pid: None,
                is_isolated_internal: true,
                supports_hardware_volume: true,
                iec958_passthrough: false,
                stream0_path: None,
                dac_chipset: "Realtek ALC295 (Isolated by Policy)".into(),
            },
        ];

        let tracks: Vec<TrackSummary> = Vec::new();
        let library_folders: Vec<LibraryFolder> = Vec::new();

        let addons = vec![
            AddonCatalogItem {
                id: "metadata-enricher".into(),
                name: "Metadata Enricher (MusicBrainz + AcoustID)".into(),
                version: "1.2.0".into(),
                latest_version: "1.2.0".into(),
                has_update: false,
                author: "AuraHiFi First-Party".into(),
                category: "metadata".into(),
                license_tag: Some("Apache-2.0".into()),
                description:
                    "Chromaprint AcoustID fingerprinting, MusicBrainz <= 1 req/s rate-limited tagging, and Discogs PAT release enrichment."
                        .into(),
                sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into(),
                signature_verified: true,
                signer_key_id: "aurahifi-ed25519-2026".into(),
                wasm_size_kb: 412,
                installed: true,
                enabled: true,
                permissions: AddonPermissions {
                    allowed_hosts: vec![
                        "musicbrainz.org".into(),
                        "api.acoustid.org".into(),
                        "api.discogs.com".into(),
                    ],
                    library_read: true,
                    library_write_tags: true,
                    audio_buffer_read_only: true,
                    wasi_enabled: false,
                    host_functions: vec![
                        "aura_http_get_rate_limited".into(),
                        "aura_read_track_tags".into(),
                        "aura_propose_tag_diff".into(),
                    ],
                    max_memory_mb: 32,
                    max_cpu_ms_per_call: 2500,
                },
            },
            AddonCatalogItem {
                id: "lyrics-art".into(),
                name: "Lyrics & Cover Art (LRCLIB + CAA)".into(),
                version: "1.1.0".into(),
                latest_version: "1.1.0".into(),
                has_update: false,
                author: "AuraHiFi First-Party".into(),
                category: "lyrics".into(),
                license_tag: Some("Apache-2.0".into()),
                description:
                    "Synced LRC lyrics via LRCLIB (250-500ms sequential batching) and high-res artwork via Cover Art Archive."
                        .into(),
                sha256: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4".into(),
                signature_verified: true,
                signer_key_id: "aurahifi-ed25519-2026".into(),
                wasm_size_kb: 286,
                installed: true,
                enabled: true,
                permissions: AddonPermissions {
                    allowed_hosts: vec!["lrclib.net".into(), "coverartarchive.org".into()],
                    library_read: true,
                    library_write_tags: false,
                    audio_buffer_read_only: false,
                    wasi_enabled: false,
                    host_functions: vec![
                        "aura_http_get_rate_limited".into(),
                        "aura_cache_lyrics".into(),
                    ],
                    max_memory_mb: 16,
                    max_cpu_ms_per_call: 1500,
                },
            },
            AddonCatalogItem {
                id: "smart-playlists".into(),
                name: "AI Smart Playlists (Bliss + CLAP + sqlite-vec)".into(),
                version: "1.0.4".into(),
                latest_version: "1.0.4".into(),
                has_update: false,
                author: "AuraHiFi First-Party".into(),
                category: "intelligence".into(),
                license_tag: Some("Apache-2.0".into()),
                description:
                    "Local acoustic similarity and natural-language vibe search powered by bliss-audio, CLAP embeddings, and sqlite-vec KNN."
                        .into(),
                sha256: "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae".into(),
                signature_verified: true,
                signer_key_id: "aurahifi-ed25519-2026".into(),
                wasm_size_kb: 520,
                installed: true,
                enabled: true,
                permissions: AddonPermissions {
                    allowed_hosts: vec![],
                    library_read: true,
                    library_write_tags: false,
                    audio_buffer_read_only: true,
                    wasi_enabled: false,
                    host_functions: vec!["aura_query_sqlite_vec".into()],
                    max_memory_mb: 64,
                    max_cpu_ms_per_call: 4000,
                },
            },
        ];

        let peq_bands = vec![
            PeqBand {
                id: "b1".into(),
                frequency_hz: 32.0,
                gain_db: 2.5,
                q_factor: 0.71,
                filter_type: PeqFilterType::LowShelf,
                enabled: true,
            },
            PeqBand {
                id: "b2".into(),
                frequency_hz: 64.0,
                gain_db: 1.4,
                q_factor: 1.2,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b3".into(),
                frequency_hz: 125.0,
                gain_db: -0.8,
                q_factor: 1.4,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b4".into(),
                frequency_hz: 250.0,
                gain_db: -1.2,
                q_factor: 1.6,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b5".into(),
                frequency_hz: 500.0,
                gain_db: 0.0,
                q_factor: 1.41,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b6".into(),
                frequency_hz: 1000.0,
                gain_db: 0.4,
                q_factor: 1.8,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b7".into(),
                frequency_hz: 2000.0,
                gain_db: 1.1,
                q_factor: 1.5,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b8".into(),
                frequency_hz: 4000.0,
                gain_db: -1.8,
                q_factor: 2.2,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b9".into(),
                frequency_hz: 8000.0,
                gain_db: -0.9,
                q_factor: 2.5,
                filter_type: PeqFilterType::Peaking,
                enabled: true,
            },
            PeqBand {
                id: "b10".into(),
                frequency_hz: 16000.0,
                gain_db: 1.2,
                q_factor: 0.71,
                filter_type: PeqFilterType::HighShelf,
                enabled: true,
            },
        ];

        let spatial_config = SpatialConfig {
            atmos_mode: "binaural_sofa".into(),
            sofa_profile_name: "SADIE D1 Neutral (Default)".into(),
            sofa_file_path: "/usr/share/aurahifi/sofa/sadie_d1_neutral_48k.sofa".into(),
            azimuth_deg: 30.0,
            elevation_deg: 12.0,
            radius_meters: 2.4,
            bs2b_enabled: true,
            bs2b_preset: "default".into(),
            peq_enabled: true,
            preamp_gain_db: -3.2,
            auto_eq_profile_name: "Sennheiser HD 800 S (Oratory1990 Harman)".into(),
            peq_bands,
            replay_gain_mode: "off".into(),
            true_peak_limiter_enabled: true,
        };

        let queue_track_ids = tracks.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
        let playback = PlaybackState {
            status: PlaybackStatus::Paused,
            current_track_id: tracks.first().map(|t| t.id.clone()).unwrap_or_default(),
            position_ms: 0,
            duration_ms: tracks.first().map(|t| t.duration_ms).unwrap_or(0),
            volume_db: 0.0,
            volume_normalized: 1.0,
            is_volume_locked: false,
            is_muted: false,
            repeat_mode: "off".into(),
            shuffle: false,
            gapless_next_track_id: None,
            queue_track_ids,
        };

        let live_devices = device_monitor::enumerate_audio_devices();
        let devices = if live_devices
            .iter()
            .any(|d| d.transport_type == TransportType::Usb)
        {
            live_devices
        } else if !live_devices.is_empty() {
            // Keep real host internal/HDMI cards first alongside audiophile reference profiles
            // so the UI remains immediately inspectable when no external USB DAC is plugged in.
            let mut merged = devices;
            for live in live_devices {
                if !merged.iter().any(|d| d.alsa_id == live.alsa_id) {
                    merged.push(live);
                }
            }
            merged
        } else {
            devices
        };

        let sample_rate = tracks.first().map(|t| t.sample_rate_hz).unwrap_or(48000);
        let replay_gain = tracks
            .first()
            .map(|t| t.replay_gain_track_db)
            .unwrap_or(0.0);
        let true_peak = tracks.first().map(|t| t.true_peak_dbtp).unwrap_or(0.0);
        let mut spatial_dsp = SpatialDspPipeline::new(sample_rate);
        let _ = spatial_dsp.apply_config(&spatial_config, replay_gain, true_peak);

        let initial_active_id = devices
            .iter()
            .find(|d| d.transport_type == TransportType::Usb && !d.is_isolated_internal)
            .or_else(|| devices.iter().find(|d| !d.is_isolated_internal))
            .or_else(|| devices.first())
            .map(|d| d.alsa_id.clone());

        Self {
            active_device_id: initial_active_id,
            devices,
            tracks,
            library_folders,
            addons,
            mode: AudioMode::BitPerfect,
            exclusive_mode: true,
            bypass_laptop: true,
            spatial_config,
            spatial_dsp,
            playback,
            active_error: None,
            mb_backoff_attempt: 0,
            gemini_api_key: None,
            gemini_key_updated_at_ms: None,
            dbus_reservation: None,
            telemetry_tasks: HashMap::new(),
            hardware_channels: HashMap::new(),
            scan_channels: HashMap::new(),
        }
    }

    pub fn current_track(&self) -> Option<&TrackSummary> {
        self.tracks
            .iter()
            .find(|t| t.id == self.playback.current_track_id)
            .or_else(|| self.tracks.first())
    }

    pub fn active_device(&self) -> Option<&AudioDeviceInfo> {
        self.active_device_id
            .as_deref()
            .and_then(|id| self.devices.iter().find(|d| d.alsa_id == id))
            .or_else(|| self.devices.first())
    }

    pub fn gemini_key_status(&self) -> GeminiApiKeyStatus {
        let masked_key = self.gemini_api_key.as_ref().map(|k| {
            if k.len() <= 8 {
                "••••••••".to_string()
            } else {
                format!("{}••••{}", &k[..4], &k[k.len() - 4..])
            }
        });
        GeminiApiKeyStatus {
            configured: self.gemini_api_key.is_some(),
            masked_key,
            storage_backend: "stub_memory".into(),
            updated_at_ms: self.gemini_key_updated_at_ms,
        }
    }

    pub fn emit_hardware_event(&mut self, event: HardwareEvent) {
        self.hardware_channels
            .retain(|_, ch| ch.send(event.clone()).is_ok());
    }

    pub fn compute_volume_lock(&self) -> (bool, String) {
        let track = self.current_track();
        let dev = self.active_device();
        if self.mode == AudioMode::BitPerfect {
            if track.map(|t| t.is_dsd).unwrap_or(false)
                && dev
                    .map(|d| matches!(d.dsd_capability, DsdCapability::Native | DsdCapability::Dop))
                    .unwrap_or(false)
            {
                return (
                    true,
                    "Hardware-fixed 0.0 dB — DSD/DoP transport prohibits software attenuation."
                        .into(),
                );
            }
            return (
                true,
                "Bit-Perfect ALSA Exclusive active — software mixer bypassed at 0.0 dB.".into(),
            );
        }

        if track.map(|t| t.is_atmos).unwrap_or(false)
            && dev.map(|d| d.iec958_passthrough).unwrap_or(false)
            && self.spatial_config.atmos_mode == "hdmi_iec958_passthrough"
        {
            return (
                true,
                "HDMI IEC958 Bitstream Passthrough — receiver controls gain.".into(),
            );
        }

        if track.map(|t| t.is_dsd).unwrap_or(false) {
            return (
                true,
                "Software attenuation bypassed at 0.0 dB to preserve DSD integrity.".into(),
            );
        }

        (
            false,
            "Spatial 64-bit float DSP chain active — precision software volume unlocked.".into(),
        )
    }

    pub fn build_signal_path(&self) -> SignalPathState {
        let track = self.current_track();
        let dev = self.active_device();

        let format_rate = |hz: u32, is_dsd: bool, mult: Option<u16>| -> String {
            if is_dsd {
                if let Some(m) = mult {
                    return format!("DSD{m}");
                }
                if hz >= 11_289_600 {
                    return "DSD256".into();
                }
                if hz >= 5_644_800 {
                    return "DSD128".into();
                }
                return "DSD64".into();
            }
            format!("{:.1} kHz", hz as f64 / 1000.0)
        };

        let is_dsd = track.map(|t| t.is_dsd).unwrap_or(false);
        let is_atmos = track.map(|t| t.is_atmos).unwrap_or(false);
        let sample_rate_hz = track.map(|t| t.sample_rate_hz).unwrap_or(48_000);
        let bit_depth = track.map(|t| t.bit_depth).unwrap_or(24);
        let codec = track.map(|t| t.codec.as_str()).unwrap_or("FLAC");
        let dsd_mult = track.and_then(|t| t.dsd_rate_multiplier);
        let rate_str = format_rate(sample_rate_hz, is_dsd, dsd_mult);

        let source_format_text = match track {
            Some(t) if t.is_dsd => format!("{} · {} · 1-bit", t.codec, rate_str),
            Some(t) if t.is_atmos => {
                format!(
                    "{} · {} · {} / {}-bit",
                    t.codec, t.channel_layout, rate_str, t.bit_depth
                )
            }
            Some(t) => {
                let cue_suffix = t
                    .cue_index
                    .as_ref()
                    .map(|c| format!(" · CUE #{c}"))
                    .unwrap_or_default();
                format!(
                    "{} · {} / {}-bit{}",
                    t.codec, rate_str, t.bit_depth, cue_suffix
                )
            }
            None => "No Track Loaded".into(),
        };

        let (is_volume_locked, volume_lock_reason) = self.compute_volume_lock();
        let mut stages: Vec<SignalPathStage> = Vec::new();
        let mut warnings: Vec<String> = Vec::new();

        // Stage 1: Source Container
        stages.push(SignalPathStage {
            id: "source".into(),
            order: 1,
            name: "Source Container".into(),
            kind: "source".into(),
            detail: track
                .map(|t| {
                    if t.cue_index.is_some() {
                        format!("{} (CUE Split)", t.album)
                    } else {
                        t.album.clone()
                    }
                })
                .unwrap_or_else(|| "Idle transport".into()),
            status: if track.is_some() {
                SignalStageStatus::Lossless
            } else {
                SignalStageStatus::Bypassed
            },
            telemetry_text: source_format_text.clone(),
        });

        // Hardware error halted path (ALSA EBUSY or USB DAC hot-unplug)
        if let Some(ref err) = self.active_error {
            if matches!(
                err.code,
                SignalPathErrorCode::AlsaEbusy | SignalPathErrorCode::DacHotUnplugged
            ) {
                let dev_short = dev.map(|d| d.short_id.as_str()).unwrap_or("DAC");
                stages.push(SignalPathStage {
                    id: "decoder".into(),
                    order: 2,
                    name: if is_dsd {
                        "dsd-reader Decoder".into()
                    } else if is_atmos {
                        "truehd Atmos Decoder".into()
                    } else {
                        "Symphonia SIMD Decoder".into()
                    },
                    kind: "decoder".into(),
                    detail: "Ring buffer paused cleanly (0 xruns)".into(),
                    status: SignalStageStatus::Bypassed,
                    telemetry_text: "PAUSED".into(),
                });
                stages.push(SignalPathStage {
                    id: "output".into(),
                    order: 3,
                    name: if err.code == SignalPathErrorCode::DacHotUnplugged {
                        "USB DAC Disconnected".into()
                    } else {
                        "ALSA Device Busy (EBUSY)".into()
                    },
                    kind: "output".into(),
                    detail: if err.code == SignalPathErrorCode::DacHotUnplugged {
                        "Safe pause engaged — Intel HDA internal speakers isolated (zero fallback)"
                            .into()
                    } else {
                        format!(
                            "Held by {} (PID {})",
                            err.holding_process_name
                                .as_deref()
                                .unwrap_or("external process"),
                            err.holding_pid.unwrap_or(0)
                        )
                    },
                    status: SignalStageStatus::Error,
                    telemetry_text: dev
                        .map(|d| d.alsa_id.clone())
                        .unwrap_or_else(|| "NO DEVICE".into()),
                });

                return SignalPathState {
                    mode: self.mode,
                    integrity: SignalPathIntegrity::ErrorHalted,
                    summary_label: if err.code == SignalPathErrorCode::DacHotUnplugged {
                        "HALTED · USB DAC Disconnected (Safe Pause)".into()
                    } else {
                        format!("HALTED · ALSA EBUSY ({dev_short})")
                    },
                    pill_short_label: if err.code == SignalPathErrorCode::DacHotUnplugged {
                        format!("DISCONNECTED · {dev_short}")
                    } else {
                        format!("ALSA EBUSY · {dev_short}")
                    },
                    is_volume_locked: true,
                    volume_lock_reason: "Transport halted due to hardware state error.".into(),
                    locked_volume_db: 0.0,
                    active_device_id: self.active_device_id.clone(),
                    input_format: source_format_text,
                    output_format: "HALTED".into(),
                    stages,
                    warnings,
                    error: self.active_error.clone(),
                    is_transitioning: false,
                    transition_progress: 0.0,
                    sample_rate_switch_lock: SampleRateSwitchLock {
                        locked: false,
                        from_rate_hz: None,
                        to_rate_hz: None,
                    },
                    pipewire_bypassed: self.exclusive_mode,
                    laptop_speakers_isolated: self.bypass_laptop,
                };
            }
        }

        let Some(device) = dev else {
            return SignalPathState {
                mode: self.mode,
                integrity: SignalPathIntegrity::ErrorHalted,
                summary_label: "No Active DAC Endpoint".into(),
                pill_short_label: "NO DAC".into(),
                is_volume_locked: true,
                volume_lock_reason: "Select a valid hardware DAC endpoint.".into(),
                locked_volume_db: 0.0,
                active_device_id: None,
                input_format: source_format_text,
                output_format: "NONE".into(),
                stages,
                warnings: vec!["No output device selected.".into()],
                error: self.active_error.clone(),
                is_transitioning: false,
                transition_progress: 0.0,
                sample_rate_switch_lock: SampleRateSwitchLock {
                    locked: false,
                    from_rate_hz: None,
                    to_rate_hz: None,
                },
                pipewire_bypassed: false,
                laptop_speakers_isolated: self.bypass_laptop,
            };
        };

        // Stage 2: Native Rust Decoder
        let decoder_name = if is_dsd {
            "dsd-reader 0.4.0"
        } else if is_atmos {
            "truehd 0.7.2 Matrix"
        } else {
            "symphonia 0.6.1 SIMD"
        };
        stages.push(SignalPathStage {
            id: "decoder".into(),
            order: 2,
            name: decoder_name.into(),
            kind: "decoder".into(),
            detail: if is_atmos {
                "Object bed + spatial metadata extraction (7.1.4)".into()
            } else if is_dsd {
                "1-bit SDM bitstream frame unpacker".into()
            } else {
                "Gapless lock-free ring buffer decode".into()
            },
            status: if self.mode == AudioMode::Spatial {
                SignalStageStatus::Spatial
            } else {
                SignalStageStatus::Lossless
            },
            telemetry_text: if is_dsd {
                format!("{rate_str} SDM")
            } else {
                format!("{rate_str} / {bit_depth}-bit")
            },
        });

        let mut integrity = if self.mode == AudioMode::BitPerfect {
            SignalPathIntegrity::BitPerfect
        } else {
            SignalPathIntegrity::SpatialDsp
        };
        let mut output_format = format!(
            "{} / {}",
            rate_str,
            if is_dsd {
                "1-bit".to_string()
            } else {
                format!("{bit_depth}-bit")
            }
        );

        // Stage 3 (+ 4): Bit-Perfect Bypass vs Spatial DSP Chain
        if self.mode == AudioMode::BitPerfect {
            if is_dsd {
                match device.dsd_capability {
                    DsdCapability::Native => {
                        stages.push(SignalPathStage {
                            id: "dsp_bypass".into(),
                            order: 3,
                            name: "DSP & Mixer Bypass".into(),
                            kind: "dsp".into(),
                            detail:
                                "All spatial, PEQ, ReplayGain, and software gain stages bypassed"
                                    .into(),
                            status: SignalStageStatus::Lossless,
                            telemetry_text: "0.0 dB · NATIVE DSD".into(),
                        });
                        output_format = format!("{rate_str} Native");
                    }
                    DsdCapability::Dop => {
                        warnings.push(format!(
                            "{} lacks UAC2 Native DSD descriptor; encapsulating via DoP (DSD-over-PCM 24-bit) with bit-exact integrity.",
                            device.display_name
                        ));
                        stages.push(SignalPathStage {
                            id: "dop_encap".into(),
                            order: 3,
                            name: "DoP v1.1 Encapsulation".into(),
                            kind: "dsp".into(),
                            detail: "Bit-exact 0x05/0xFA marker packing (zero PCM conversion)"
                                .into(),
                            status: SignalStageStatus::Lossless,
                            telemetry_text: "DoP · 0.0 dB".into(),
                        });
                        output_format = format!("{rate_str} DoP");
                    }
                    DsdCapability::PcmFallback | DsdCapability::None => {
                        integrity = SignalPathIntegrity::WarningFallback;
                        let fallback_rate = if device.supported_sample_rates.contains(&176_400) {
                            176_400
                        } else {
                            device
                                .supported_sample_rates
                                .iter()
                                .copied()
                                .max()
                                .unwrap_or(48_000)
                        };
                        let fb_str = format_rate(fallback_rate, false, None);
                        warnings.push(format!(
                            "UAC2 Native DSD rejected by {} — transparently decimating {} to {} / 24-bit PCM via Rubato.",
                            device.display_name, rate_str, fb_str
                        ));
                        stages.push(SignalPathStage {
                            id: "dsd_pcm_fallback".into(),
                            order: 3,
                            name: "DSD → PCM Decimator (Fallback)".into(),
                            kind: "resampler".into(),
                            detail: "DAC lacks native DSD/DoP; 64-bit FIR decimation active".into(),
                            status: SignalStageStatus::Warning,
                            telemetry_text: format!("PCM {fb_str} / 24-bit"),
                        });
                        output_format = format!("PCM {fb_str} / 24-bit (DSD Fallback)");
                    }
                }
            } else if is_atmos && !device.iec958_passthrough {
                integrity = SignalPathIntegrity::WarningFallback;
                warnings.push(format!(
                    "{} does not support HDMI IEC958 Atmos bitstream passthrough. Playing lossless stereo core ({} / {}-bit). Switch to Spatial Mode for SOFA HRTF 7.1.4 rendering.",
                    device.display_name, rate_str, bit_depth
                ));
                stages.push(SignalPathStage {
                    id: "atmos_core_fallback".into(),
                    order: 3,
                    name: "TrueHD Stereo Core Fold".into(),
                    kind: "dsp".into(),
                    detail: "HDMI IEC958 unavailable on USB DAC — lossless 2.0 core output".into(),
                    status: SignalStageStatus::Warning,
                    telemetry_text: format!("2.0 Core · {rate_str}"),
                });
                output_format = format!("2.0 Core · {rate_str} / {bit_depth}-bit");
            } else if !device.supported_sample_rates.contains(&sample_rate_hz) {
                integrity = SignalPathIntegrity::WarningFallback;
                let fallback_rate = device
                    .supported_sample_rates
                    .iter()
                    .copied()
                    .min_by_key(|&r| (r as i64 - sample_rate_hz as i64).abs())
                    .unwrap_or(48_000);
                let fb_str = format_rate(fallback_rate, false, None);
                warnings.push(format!(
                    "{} does not advertise {} in /proc/asound stream0; Rubato HQ resampling to {}.",
                    device.display_name, rate_str, fb_str
                ));
                stages.push(SignalPathStage {
                    id: "rubato_fallback".into(),
                    order: 3,
                    name: "Rubato Sinc Resampler".into(),
                    kind: "resampler".into(),
                    detail: "Rate mismatch fallback — original clock unsupported by hardware"
                        .into(),
                    status: SignalStageStatus::Warning,
                    telemetry_text: format!("{rate_str} → {fb_str}"),
                });
                output_format = format!("{fb_str} / {bit_depth}-bit");
            } else {
                stages.push(SignalPathStage {
                    id: "dsp_bypass".into(),
                    order: 3,
                    name: "DSP & Mixer Bypass".into(),
                    kind: "dsp".into(),
                    detail: "Bit-exact pass-through · PipeWire & PulseAudio bypassed".into(),
                    status: SignalStageStatus::Lossless,
                    telemetry_text: "0.0 dB · BYPASSED".into(),
                });
            }

            if device.is_isolated_internal {
                integrity = SignalPathIntegrity::WarningFallback;
                warnings.push(
                    "Built-in Intel HDA Speakers selected manually; PipeWire shared graph active (not hardware Bit-Perfect)."
                        .into(),
                );
            }
        } else {
            // Spatial DSP Mode
            if is_atmos
                && device.iec958_passthrough
                && self.spatial_config.atmos_mode == "hdmi_iec958_passthrough"
            {
                stages.push(SignalPathStage {
                    id: "hdmi_bitstream".into(),
                    order: 3,
                    name: "HDMI IEC958 Atmos Passthrough".into(),
                    kind: "dsp".into(),
                    detail: "Encoded TrueHD Atmos 7.1.4 bitstream routed directly to AVR".into(),
                    status: SignalStageStatus::Spatial,
                    telemetry_text: "ATMOS 7.1.4 BITSTREAM".into(),
                });
                output_format = "TrueHD Atmos 7.1.4 · IEC958".into();
            } else {
                stages.push(SignalPathStage {
                    id: "sofa_hrtf".into(),
                    order: 3,
                    name: "Steam Audio SOFA HRTF".into(),
                    kind: "dsp".into(),
                    detail: format!(
                        "Az {:.0}° · El {:.0}° · R {:.1}m ({})",
                        self.spatial_config.azimuth_deg,
                        self.spatial_config.elevation_deg,
                        self.spatial_config.radius_meters,
                        self.spatial_config.sofa_profile_name
                    ),
                    status: SignalStageStatus::Spatial,
                    telemetry_text: if is_atmos {
                        "7.1.4 → Binaural".into()
                    } else {
                        "2.0 → Binaural".into()
                    },
                });

                if self.spatial_config.bs2b_enabled || self.spatial_config.peq_enabled {
                    let mut sub_details = Vec::new();
                    if self.spatial_config.bs2b_enabled {
                        sub_details.push(format!(
                            "BS2B {}",
                            self.spatial_config.bs2b_preset.to_ascii_uppercase()
                        ));
                    }
                    if self.spatial_config.peq_enabled {
                        let active_bands = self
                            .spatial_config
                            .peq_bands
                            .iter()
                            .filter(|b| b.enabled)
                            .count();
                        sub_details.push(format!(
                            "AutoEQ {} ({}b)",
                            self.spatial_config.auto_eq_profile_name, active_bands
                        ));
                    }
                    stages.push(SignalPathStage {
                        id: "headphone_dsp".into(),
                        order: 4,
                        name: "Headphone DSP Chain (64-bit float)".into(),
                        kind: "dsp".into(),
                        detail: sub_details.join(" · "),
                        status: SignalStageStatus::Spatial,
                        telemetry_text: if self.spatial_config.true_peak_limiter_enabled {
                            "-1.0 dBTP Limiter".into()
                        } else {
                            "No Limiter".into()
                        },
                    });
                }

                if self.spatial_config.replay_gain_mode != "off" {
                    let rg_db = track.map(|t| t.replay_gain_track_db).unwrap_or(-2.6);
                    warnings.push(format!(
                        "ReplayGain ({}) active ({:+.1} dB normalization).",
                        self.spatial_config.replay_gain_mode, rg_db
                    ));
                }

                let max_dev_rate = device
                    .supported_sample_rates
                    .iter()
                    .copied()
                    .max()
                    .unwrap_or(96_000);
                let dsp_rate = if is_dsd {
                    176_400.min(max_dev_rate)
                } else {
                    sample_rate_hz.min(max_dev_rate)
                };
                output_format = format!(
                    "Spatial 32-bit float → {}",
                    format_rate(dsp_rate, false, None)
                );
            }
        }

        // Final Stage: ALSA Hardware Output
        let alsa_mode_label = if self.exclusive_mode && !device.is_isolated_internal {
            "ALSA Exclusive (D-Bus ReserveDevice1)"
        } else {
            "PipeWire Shared Sink"
        };
        stages.push(SignalPathStage {
            id: "hardware_output".into(),
            order: (stages.len() + 1) as u32,
            name: device.display_name.clone(),
            kind: "output".into(),
            detail: format!("{alsa_mode_label} · {}", device.alsa_id),
            status: match integrity {
                SignalPathIntegrity::BitPerfect => SignalStageStatus::Lossless,
                SignalPathIntegrity::SpatialDsp => SignalStageStatus::Spatial,
                SignalPathIntegrity::WarningFallback => SignalStageStatus::Warning,
                SignalPathIntegrity::ErrorHalted => SignalStageStatus::Error,
            },
            telemetry_text: if device.stream0_path.is_some() {
                format!("RTKit · {output_format}")
            } else {
                output_format.clone()
            },
        });

        let rate_text = if is_dsd {
            rate_str.clone()
        } else {
            format!("{bit_depth}-bit / {rate_str}")
        };

        let summary_label = match integrity {
            SignalPathIntegrity::BitPerfect => {
                format!("Bit-Perfect · ALSA Exclusive · {rate_text} · 0.0 dB")
            }
            SignalPathIntegrity::SpatialDsp => {
                let target = if device.iec958_passthrough
                    && self.spatial_config.atmos_mode == "hdmi_iec958_passthrough"
                {
                    "HDMI IEC958"
                } else {
                    "SOFA HRTF"
                };
                let src_kind = if is_atmos {
                    "TrueHD Atmos 7.1.4"
                } else {
                    "Stereo"
                };
                format!("Spatial DSP · {src_kind} → {target}")
            }
            SignalPathIntegrity::WarningFallback => format!("DSP Fallback · {output_format}"),
            SignalPathIntegrity::ErrorHalted => {
                format!("Halted · Hardware Fault · {}", device.short_id)
            }
        };

        let pill_short_label = match integrity {
            SignalPathIntegrity::BitPerfect => format!("{rate_text} · {}", device.short_id),
            SignalPathIntegrity::SpatialDsp => format!("SPATIAL · {}", device.short_id),
            SignalPathIntegrity::WarningFallback => format!("FALLBACK · {}", device.short_id),
            SignalPathIntegrity::ErrorHalted => format!("HALTED · {}", device.short_id),
        };

        SignalPathState {
            mode: self.mode,
            integrity,
            summary_label,
            pill_short_label,
            is_volume_locked,
            volume_lock_reason,
            locked_volume_db: 0.0,
            active_device_id: Some(device.alsa_id.clone()),
            input_format: if track.is_some() {
                source_format_text
            } else {
                format!("{codec} · {rate_str} / {bit_depth}-bit")
            },
            output_format,
            stages,
            warnings,
            error: self.active_error.clone(),
            is_transitioning: self.spatial_dsp.switcher.is_transitioning(),
            transition_progress: if self.spatial_dsp.switcher.is_transitioning() {
                0.5
            } else {
                1.0
            },
            sample_rate_switch_lock: SampleRateSwitchLock {
                locked: false,
                from_rate_hz: None,
                to_rate_hz: None,
            },
            pipewire_bypassed: self.exclusive_mode && !device.is_isolated_internal,
            laptop_speakers_isolated: self.bypass_laptop,
        }
    }
}

impl Default for InnerState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<RwLock<InnerState>>,
    pub audio_engine: Arc<AlsaOutputEngine>,
    pub next_sub_id: Arc<AtomicU64>,
    pub db: Arc<std::sync::Mutex<Option<crate::library::LibraryDb>>>,
    pub addon_manager: Arc<crate::addons::AddonManager>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(InnerState::new())),
            audio_engine: Arc::new(AlsaOutputEngine::new()),
            next_sub_id: Arc::new(AtomicU64::new(1)),
            db: Arc::new(std::sync::Mutex::new(None)),
            addon_manager: Arc::new(crate::addons::AddonManager::new(None)),
        }
    }

    pub fn next_subscription_id(&self, prefix: &str) -> String {
        let id = self.next_sub_id.fetch_add(1, Ordering::Relaxed);
        format!("{prefix}-{id}")
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn hash_path(p: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    p.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn synthesize_telemetry_frame(
    tick: u64,
    position_ms: u64,
    sample_rate_hz: u32,
    bit_depth: u16,
    playing: bool,
) -> TelemetryFrame {
    let phase = (tick as f32) * 0.12;
    let fft_bands = (0..48)
        .map(|i| {
            if !playing {
                return 0.02;
            }
            let freq_weight = 1.0 - (i as f32 / 54.0);
            let wave = ((phase + i as f32 * 0.31).sin() * 0.5 + 0.5) * 0.65
                + ((phase * 1.7 - i as f32 * 0.19).cos() * 0.5 + 0.5) * 0.35;
            (wave * freq_weight).clamp(0.03, 0.96)
        })
        .collect::<Vec<_>>();

    let (rms_l, rms_r, peak_l, peak_r) = if playing {
        (
            -16.5 + (phase.sin() * 3.2),
            -16.8 + ((phase + 0.4).cos() * 3.1),
            -6.2 + (phase.sin() * 2.4),
            -6.5 + ((phase + 0.3).cos() * 2.3),
        )
    } else {
        (-60.0, -60.0, -60.0, -60.0)
    };

    TelemetryFrame {
        timestamp_ms: now_ms(),
        fft_bands,
        left_rms_db: rms_l,
        right_rms_db: rms_r,
        left_peak_db: peak_l,
        right_peak_db: peak_r,
        true_peak_dbtp: -1.2,
        integrated_lufs: -15.4,
        momentary_lufs: if playing { -14.8 } else { -60.0 },
        position_ms,
        sample_rate_hz,
        bit_depth,
        buffer_fill_pct: 94.0,
        xruns: 0,
    }
}

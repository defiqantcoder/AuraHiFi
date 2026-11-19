use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioMode {
    BitPerfect,
    Spatial,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    Usb,
    Hdmi,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DsdCapability {
    Native,
    Dop,
    PcmFallback,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReservationStatus {
    Available,
    ReservedByAurahifi,
    BusyOtherApp,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub alsa_id: String,
    pub short_id: String,
    pub card_index: u32,
    pub vendor: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usb_vid_pid: Option<String>,
    pub transport_type: TransportType,
    pub supported_sample_rates: Vec<u32>,
    pub supported_bit_depths: Vec<u16>,
    pub dsd_capability: DsdCapability,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_dsd_multiplier: Option<u16>,
    pub reservation_status: ReservationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holding_process: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holding_pid: Option<u32>,
    pub is_isolated_internal: bool,
    pub supports_hardware_volume: bool,
    pub iec958_passthrough: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream0_path: Option<String>,
    pub dac_chipset: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalPathIntegrity {
    BitPerfect,
    SpatialDsp,
    WarningFallback,
    ErrorHalted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalStageStatus {
    Lossless,
    Spatial,
    Warning,
    Error,
    Bypassed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalPathStage {
    pub id: String,
    pub order: u32,
    pub name: String,
    pub kind: String,
    pub detail: String,
    pub status: SignalStageStatus,
    pub telemetry_text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SignalPathErrorCode {
    AlsaEbusy,
    DacHotUnplugged,
    Uac2DsdUnsupported,
    RateLockTimeout,
    Musicbrainz503Backoff,
    RtkitDenied,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalPathError {
    pub code: SignalPathErrorCode,
    pub title: String,
    pub message: String,
    pub technical_detail: String,
    pub recovery_action_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holding_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holding_process_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleRateSwitchLock {
    pub locked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_rate_hz: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_rate_hz: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalPathState {
    pub mode: AudioMode,
    pub integrity: SignalPathIntegrity,
    pub summary_label: String,
    pub pill_short_label: String,
    pub is_volume_locked: bool,
    pub volume_lock_reason: String,
    pub locked_volume_db: f64,
    pub active_device_id: Option<String>,
    pub input_format: String,
    pub output_format: String,
    pub stages: Vec<SignalPathStage>,
    pub warnings: Vec<String>,
    pub error: Option<SignalPathError>,
    pub is_transitioning: bool,
    pub transition_progress: f64,
    pub sample_rate_switch_lock: SampleRateSwitchLock,
    pub pipewire_bypassed: bool,
    pub laptop_speakers_isolated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PeqFilterType {
    Peaking,
    LowShelf,
    HighShelf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeqBand {
    pub id: String,
    pub frequency_hz: f64,
    pub gain_db: f64,
    pub q_factor: f64,
    pub filter_type: PeqFilterType,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialConfig {
    pub atmos_mode: String,
    pub sofa_profile_name: String,
    pub sofa_file_path: String,
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub radius_meters: f64,
    pub bs2b_enabled: bool,
    pub bs2b_preset: String,
    pub peq_enabled: bool,
    pub preamp_gain_db: f64,
    pub auto_eq_profile_name: String,
    pub peq_bands: Vec<PeqBand>,
    pub replay_gain_mode: String,
    pub true_peak_limiter_enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
    Buffering,
    HaltedHardwareError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub status: PlaybackStatus,
    pub current_track_id: String,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub volume_db: f64,
    pub volume_normalized: f64,
    pub is_volume_locked: bool,
    pub is_muted: bool,
    pub repeat_mode: String,
    pub shuffle: bool,
    pub gapless_next_track_id: Option<String>,
    pub queue_track_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryFrame {
    pub timestamp_ms: u64,
    pub fft_bands: Vec<f32>,
    pub left_rms_db: f32,
    pub right_rms_db: f32,
    pub left_peak_db: f32,
    pub right_peak_db: f32,
    pub true_peak_dbtp: f32,
    pub integrated_lufs: f32,
    pub momentary_lufs: f32,
    pub position_ms: u64,
    pub sample_rate_hz: u32,
    pub bit_depth: u16,
    pub buffer_fill_pct: f32,
    pub xruns: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HardwareEvent {
    #[serde(rename_all = "camelCase")]
    DacConnected {
        timestamp_ms: u64,
        alsa_id: String,
        display_name: String,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    DacDisconnectedPaused {
        timestamp_ms: u64,
        alsa_id: String,
        display_name: String,
        fallback_to_internal_speakers: bool,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    AlsaDeviceBusy {
        timestamp_ms: u64,
        alsa_id: String,
        holding_process: String,
        holding_pid: u32,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    DsdFallbackNotice {
        timestamp_ms: u64,
        alsa_id: String,
        from_format: String,
        to_format: String,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    RateChanged {
        timestamp_ms: u64,
        alsa_id: String,
        from_rate_hz: u32,
        to_rate_hz: u32,
        lock_duration_ms: u64,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    ModeTransition {
        timestamp_ms: u64,
        from_mode: AudioMode,
        to_mode: AudioMode,
        ramp_ms: u64,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    MusicBrainzBackoff {
        timestamp_ms: u64,
        http_status: u16,
        attempt: u32,
        retry_after_ms: u64,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    SignalPathChanged {
        timestamp_ms: u64,
        integrity: SignalPathIntegrity,
        summary: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonPermissions {
    pub allowed_hosts: Vec<String>,
    pub library_read: bool,
    pub library_write_tags: bool,
    pub audio_buffer_read_only: bool,
    pub wasi_enabled: bool,
    pub host_functions: Vec<String>,
    pub max_memory_mb: u32,
    pub max_cpu_ms_per_call: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonCatalogItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub author: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_tag: Option<String>,
    pub description: String,
    pub sha256: String,
    pub signature_verified: bool,
    pub signer_key_id: String,
    pub wasm_size_kb: u32,
    pub installed: bool,
    pub enabled: bool,
    pub permissions: AddonPermissions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub id: String,
    pub version: String,
    pub sha256: String,
    pub signature_verified: bool,
    pub enabled: bool,
    pub installed_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistQuery {
    pub mode: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_track_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_dr_score: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format_filter: Option<String>,
    pub max_tracks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub id: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_parent_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_start_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_end_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_index: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub genre: String,
    pub year: u32,
    pub duration_ms: u64,
    pub codec: String,
    pub sample_rate_hz: u32,
    pub bit_depth: u16,
    pub channels: u16,
    pub channel_layout: String,
    pub is_dsd: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dsd_rate_multiplier: Option<u16>,
    pub is_atmos: bool,
    pub bpm: u32,
    pub musical_key: String,
    pub dynamic_range_dr: u32,
    pub integrated_lufs: f64,
    pub true_peak_dbtp: f64,
    pub replay_gain_track_db: f64,
    pub mbid_recording: String,
    pub artwork_theme: String,
    pub waveform_peaks: Vec<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DacProbeReport {
    pub alsa_id: String,
    pub probed_at_ms: u64,
    pub proc_asound_stream0: String,
    pub dbus_reservation_ok: bool,
    pub rtkit_priority_ok: bool,
    pub native_dsd_supported: bool,
    pub dop_supported: bool,
    pub verified_rates_hz: Vec<u32>,
    pub latency_floor_ms: f64,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanJobId {
    pub job_id: String,
    pub paths: Vec<String>,
    pub discovered_files: u32,
    pub cue_sheets_split: u32,
    pub started_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedLyricLine {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPayload {
    pub track_id: String,
    pub source: String,
    pub cached_in_sqlite: bool,
    pub lines: Vec<SyncedLyricLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TransportCommand {
    #[serde(rename_all = "camelCase")]
    Play {
        track_id: Option<String>,
    },
    Pause,
    #[serde(rename_all = "camelCase")]
    Seek {
        position_ms: u64,
    },
    Next,
    Prev,
    #[serde(rename_all = "camelCase")]
    SetVolume {
        volume_normalized: f64,
    },
    ToggleMute,
    ToggleShuffle,
    CycleRepeat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateDacPlugInResult {
    pub device: AudioDeviceInfo,
    pub signal_path: SignalPathState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicBrainzBackoffResponse {
    pub retry_after_ms: u64,
    pub attempt: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiApiKeyStatus {
    pub configured: bool,
    pub masked_key: Option<String>,
    pub storage_backend: String,
    pub updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TooltipExplanation {
    pub term: String,
    pub title: String,
    pub summary: String,
    pub technical_note: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEnrichRequest {
    pub use_acoust_id: bool,
    pub fetch_cover_art: bool,
    pub fetch_synced_lyrics: bool,
    pub respect_rate_limits: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEnrichResult {
    pub track_id: String,
    pub addon_id: String,
    pub status: String,
    pub acoust_id_confidence_pct: u32,
    pub mbid_recording: Option<String>,
    pub mbid_release: Option<String>,
    pub proposed_fields: HashMap<String, String>,
    pub rate_limit_note: String,
    pub executed_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPipeWireConfigs {
    pub pipewire_file_path: String,
    pub pipewire_content: String,
    pub wireplumber_file_path: String,
    pub wireplumber_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingStatus {
    pub completed: bool,
    pub folder_count: u32,
    pub track_count: u32,
    pub default_music_dir_exists: bool,
    pub default_music_dir_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub path: String,
    pub watch_enabled: bool,
    pub last_scanned_at: Option<u64>,
    pub track_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub job_id: String,
    pub current_directory: String,
    pub files_scanned: u32,
    pub tracks_added: u32,
    pub is_complete: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub provider: String,
    pub configured: bool,
    pub masked_hint: Option<String>,
    pub storage_backend: String,
    pub updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialCheckResult {
    pub provider: String,
    pub valid: bool,
    pub message: String,
    pub checked_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartPlaylistResult {
    pub tracks: Vec<TrackSummary>,
    pub engine_used: String,
    pub explanation: String,
}


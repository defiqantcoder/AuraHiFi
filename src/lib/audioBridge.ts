/**
 * AuraHiFi Hardened Typed IPC Contract & Mock Audiophile Engine
 * Target Platform: Ubuntu 24.04 LTS (Noble, PipeWire 1.0.5) & Ubuntu 26.04 LTS (Resolute, PipeWire 1.6.2)
 *
 * STRICT ARCHITECTURAL INVARIANT:
 * - Zero `@tauri-apps/api` imports in any React component or browser bundle.
 * - All UI components communicate exclusively through `audioBridge` via `useAudioStore`.
 * - In Phase 2 (AGY Tauri v2), swap `export const audioBridge: AudioBridge = new MockAudioBridge()`
 *   with a `TauriAudioBridge` implementation backed by `invoke()` and `tauri::ipc::Channel`.
 */

import {
  evaluateSignalPath,
  formatSampleRate,
  requiresSampleRateSwitchLock,
} from './signalPathEngine';
import { generatePipeWireConfigs } from './studioHelpers';
import { TauriAudioBridge } from './tauriAudioBridge';

// ============================================================================
// 1. Hardened IPC Interfaces (Mirrors src-tauri/src/commands.rs)
// ============================================================================

export type AudioMode = 'bit_perfect' | 'spatial';
export type TransportType = 'usb' | 'hdmi' | 'internal';
export type DsdCapability = 'native' | 'dop' | 'pcm_fallback' | 'none';
export type ReservationStatus =
  | 'available'
  | 'reserved_by_aurahifi'
  | 'busy_other_app'
  | 'disconnected';

export interface AudioDeviceInfo {
  alsaId: string;
  shortId: string;
  cardIndex: number;
  vendor: string;
  displayName: string;
  usbVidPid?: string;
  transportType: TransportType;
  supportedSampleRates: number[];
  supportedBitDepths: number[];
  dsdCapability: DsdCapability;
  maxDsdMultiplier?: 64 | 128 | 256 | 512;
  reservationStatus: ReservationStatus;
  holdingProcess?: string;
  holdingPid?: number;
  isIsolatedInternal: boolean;
  supportsHardwareVolume: boolean;
  iec958Passthrough: boolean;
  stream0Path?: string;
  dacChipset: string;
}

export type SignalPathIntegrity =
  | 'bit_perfect'
  | 'spatial_dsp'
  | 'warning_fallback'
  | 'error_halted';

export type SignalStageStatus = 'lossless' | 'spatial' | 'warning' | 'error' | 'bypassed';

export interface SignalPathStage {
  id: string;
  order: number;
  name: string;
  kind: 'source' | 'decoder' | 'dsp' | 'resampler' | 'mixer' | 'output';
  detail: string;
  status: SignalStageStatus;
  telemetryText: string;
}

export type SignalPathErrorCode =
  | 'ALSA_EBUSY'
  | 'DAC_HOT_UNPLUGGED'
  | 'UAC2_DSD_UNSUPPORTED'
  | 'RATE_LOCK_TIMEOUT'
  | 'MUSICBRAINZ_503_BACKOFF'
  | 'RTKIT_DENIED';

export interface SignalPathError {
  code: SignalPathErrorCode;
  title: string;
  message: string;
  technicalDetail: string;
  recoveryActionLabel: string;
  retryAfterMs?: number;
  holdingPid?: number;
  holdingProcessName?: string;
}

export interface SignalPathState {
  mode: AudioMode;
  integrity: SignalPathIntegrity;
  summaryLabel: string;
  pillShortLabel: string;
  isVolumeLocked: boolean;
  volumeLockReason: string;
  lockedVolumeDb: number;
  activeDeviceId: string | null;
  inputFormat: string;
  outputFormat: string;
  stages: SignalPathStage[];
  warnings: string[];
  error: SignalPathError | null;
  isTransitioning: boolean;
  transitionProgress: number;
  sampleRateSwitchLock: {
    locked: boolean;
    fromRateHz?: number;
    toRateHz?: number;
  };
  pipewireBypassed: boolean;
  laptopSpeakersIsolated: boolean;
}

export type PeqFilterType = 'peaking' | 'low_shelf' | 'high_shelf';

export interface PeqBand {
  id: string;
  frequencyHz: number;
  gainDb: number;
  qFactor: number;
  filterType: PeqFilterType;
  enabled: boolean;
}

export interface SpatialConfig {
  atmosMode: 'binaural_sofa' | 'hdmi_iec958_passthrough' | 'stereo_downmix';
  sofaProfileName: string;
  sofaFilePath: string;
  azimuthDeg: number;
  elevationDeg: number;
  radiusMeters: number;
  bs2bEnabled: boolean;
  bs2bPreset: 'default' | 'cmoy' | 'jmeier';
  peqEnabled: boolean;
  preampGainDb: number;
  autoEqProfileName: string;
  peqBands: PeqBand[];
  replayGainMode: 'off' | 'track' | 'album';
  truePeakLimiterEnabled: boolean;
}

export type PlaybackStatus =
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'buffering'
  | 'halted_hardware_error';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTrackId: string;
  positionMs: number;
  durationMs: number;
  volumeDb: number;
  volumeNormalized: number; // 0.0 to 1.0
  isVolumeLocked: boolean;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  shuffle: boolean;
  gaplessNextTrackId: string | null;
  queueTrackIds: string[];
}

export interface TelemetryFrame {
  timestampMs: number;
  fftBands: number[]; // 48 log-spaced magnitude bins (0.0 .. 1.0)
  leftRmsDb: number;
  rightRmsDb: number;
  leftPeakDb: number;
  rightPeakDb: number;
  truePeakDbtp: number;
  integratedLufs: number;
  momentaryLufs: number;
  positionMs: number;
  sampleRateHz: number;
  bitDepth: number;
  bufferFillPct: number;
  xruns: number;
}

export type HardwareEvent =
  | {
      type: 'DacConnected';
      timestampMs: number;
      alsaId: string;
      displayName: string;
      message: string;
    }
  | {
      type: 'DacDisconnectedPaused';
      timestampMs: number;
      alsaId: string;
      displayName: string;
      fallbackToInternalSpeakers: false;
      message: string;
    }
  | {
      type: 'AlsaDeviceBusy';
      timestampMs: number;
      alsaId: string;
      holdingProcess: string;
      holdingPid: number;
      message: string;
    }
  | {
      type: 'DsdFallbackNotice';
      timestampMs: number;
      alsaId: string;
      fromFormat: string;
      toFormat: string;
      message: string;
    }
  | {
      type: 'RateChanged';
      timestampMs: number;
      alsaId: string;
      fromRateHz: number;
      toRateHz: number;
      lockDurationMs: number;
      message: string;
    }
  | {
      type: 'ModeTransition';
      timestampMs: number;
      fromMode: AudioMode;
      toMode: AudioMode;
      rampMs: number;
      message: string;
    }
  | {
      type: 'MusicBrainzBackoff';
      timestampMs: number;
      httpStatus: 503;
      attempt: number;
      retryAfterMs: number;
      message: string;
    }
  | {
      type: 'SignalPathChanged';
      timestampMs: number;
      integrity: SignalPathIntegrity;
      summary: string;
    };

export interface AddonPermissions {
  allowedHosts: string[];
  libraryRead: boolean;
  libraryWriteTags: boolean;
  audioBufferReadOnly: boolean;
  wasiEnabled: boolean;
  hostFunctions: string[];
  maxMemoryMb: number;
  maxCpuMsPerCall: number;
}

export interface AddonCatalogItem {
  id: string;
  name: string;
  version: string;
  latestVersion: string;
  hasUpdate: boolean;
  author: string;
  category: 'metadata' | 'lyrics' | 'intelligence' | 'decoder' | 'network';
  licenseTag?: string;
  description: string;
  sha256: string;
  signatureVerified: boolean;
  signerKeyId: string;
  wasmSizeKb: number;
  installed: boolean;
  enabled: boolean;
  permissions: AddonPermissions;
}

export interface InstalledAddon {
  id: string;
  version: string;
  sha256: string;
  signatureVerified: boolean;
  enabled: boolean;
  installedAtMs: number;
}

export interface SmartPlaylistQuery {
  mode: 'bliss_acoustic' | 'clap_vibe' | 'hybrid';
  prompt: string;
  seedTrackId?: string;
  minDrScore?: number;
  formatFilter?: 'all' | 'hires_pcm' | 'dsd' | 'atmos';
  maxTracks: number;
}

export interface TrackSummary {
  id: string;
  path: string;
  cueStartMs?: number;
  cueEndMs?: number;
  cueIndex?: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  year: number;
  durationMs: number;
  codec: 'FLAC' | 'DSF' | 'DFF' | 'TrueHD Atmos' | 'WAV';
  sampleRateHz: number;
  bitDepth: number;
  channels: number;
  channelLayout: '2.0' | '5.1' | '7.1.4';
  isDsd: boolean;
  dsdRateMultiplier?: 64 | 128 | 256 | 512;
  isAtmos: boolean;
  bpm: number;
  musicalKey: string;
  dynamicRangeDr: number;
  integratedLufs: number;
  truePeakDbtp: number;
  replayGainTrackDb: number;
  mbidRecording: string;
  artworkTheme: 'cobalt' | 'obsidian-gold' | 'emerald-prism' | 'crimson-vinyl' | 'amber-tape' | 'slate-mono';
  waveformPeaks: number[];
}

export interface DacProbeReport {
  alsaId: string;
  probedAtMs: number;
  procAsoundStream0: string;
  dbusReservationOk: boolean;
  rtkitPriorityOk: boolean;
  nativeDsdSupported: boolean;
  dopSupported: boolean;
  verifiedRatesHz: number[];
  latencyFloorMs: number;
  notes: string[];
}

export interface ScanJobId {
  jobId: string;
  paths: string[];
  discoveredFiles: number;
  cueSheetsSplit: number;
  startedAtMs: number;
}

export interface SyncedLyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsPayload {
  trackId: string;
  source: string;
  cachedInSqlite: boolean;
  lines: SyncedLyricLine[];
}

export interface GeminiApiKeyStatus {
  configured: boolean;
  maskedKey: string | null;
  storageBackend: 'ubuntu_secret_service' | 'stub_memory';
  updatedAtMs: number | null;
}

export interface TooltipExplanation {
  term: string;
  title: string;
  summary: string;
  technicalNote: string;
  source: 'builtin_reference' | 'gemini_assisted';
}

export interface MetadataEnrichRequest {
  useAcoustId: boolean;
  fetchCoverArt: boolean;
  fetchSyncedLyrics: boolean;
  respectRateLimits: boolean;
}

export interface MetadataEnrichResult {
  trackId: string;
  addonId: string;
  status: 'matched' | 'rate_limited_backoff' | 'not_found';
  acoustIdConfidencePct: number;
  mbidRecording: string | null;
  mbidRelease: string | null;
  proposedFields: Record<string, string>;
  rateLimitNote: string;
  executedAtMs: number;
}

export interface LibraryFolder {
  id: string;
  path: string;
  trackCount: number;
  watchEnabled: boolean;
  lastScannedAt?: number;
}

export interface OnboardingStatus {
  completed: boolean;
  folderCount: number;
  trackCount: number;
  defaultMusicDirExists: boolean;
  defaultMusicDirPath?: string;
}

export interface ScanProgressEvent {
  jobId: string;
  currentDirectory: string;
  filesScanned: number;
  tracksAdded: number;
  isComplete: boolean;
  errorMessage?: string;
}

export interface CredentialStatus {
  provider: string;
  configured: boolean;
  maskedHint?: string;
  storageBackend: string;
  updatedAtMs?: number;
}

export interface CredentialCheckResult {
  provider: string;
  valid: boolean;
  message: string;
  checkedAtMs: number;
}

export type TransportCommand =
  | { type: 'Play'; trackId?: string }
  | { type: 'Pause' }
  | { type: 'Seek'; positionMs: number }
  | { type: 'Next' }
  | { type: 'Prev' }
  | { type: 'SetVolume'; volumeNormalized: number }
  | { type: 'ToggleMute' }
  | { type: 'ToggleShuffle' }
  | { type: 'CycleRepeat' };

// ============================================================================
// 2. AudioBridge Interface (Implemented by MockAudioBridge & future TauriAudioBridge)
// ============================================================================

export interface AudioBridge {
  listAudioDevices(): Promise<AudioDeviceInfo[]>;
  selectAudioDevice(
    alsaId: string,
    exclusive: boolean,
    bypassLaptop: boolean
  ): Promise<SignalPathState>;
  testDacCapabilities(alsaId: string): Promise<DacProbeReport>;
  setAudioMode(mode: AudioMode): Promise<SignalPathState>;
  updateSpatialConfig(cfg: SpatialConfig): Promise<SignalPathState>;
  transportCommand(cmd: TransportCommand): Promise<PlaybackState>;
  scanLibrary(paths: string[]): Promise<ScanJobId>;
  listStoreAddons(): Promise<AddonCatalogItem[]>;
  installAddon(id: string, approvedPermissions: AddonPermissions): Promise<InstalledAddon>;
  toggleAddonEnabled(id: string, enabled: boolean): Promise<AddonCatalogItem>;
  runAddonAction(addonId: string, action: string, payloadJson: string): Promise<string>;
  generateSmartPlaylist(query: SmartPlaylistQuery): Promise<TrackSummary[]>;
  listTracks(): Promise<TrackSummary[]>;
  getLyrics(trackId: string): Promise<LyricsPayload>;
  getSignalPath(): Promise<SignalPathState>;
  getSpatialConfig(): Promise<SpatialConfig>;
  getPlaybackState(): Promise<PlaybackState>;
  subscribeTelemetry(cb: (frame: TelemetryFrame) => void): () => void;
  subscribeHardwareEvents(cb: (event: HardwareEvent) => void): () => void;

  // Onboarding, Native Folder Picker & Library Folder Management
  pickMusicFolder(): Promise<string[] | null>;
  getOnboardingStatus(): Promise<OnboardingStatus>;
  completeOnboarding(audioMode?: AudioMode): Promise<void>;
  listLibraryFolders(): Promise<LibraryFolder[]>;
  addLibraryFolder(path: string, autoWatch?: boolean): Promise<LibraryFolder>;
  removeLibraryFolder(id: string): Promise<void>;
  setLibraryFolderWatch(id: string, autoWatch: boolean): Promise<void>;
  subscribeScanProgress(cb: (event: ScanProgressEvent) => void): () => void;

  // OS Keyring Secret Storage
  setApiCredential(service: string, secret: string, model?: string): Promise<void>;
  getApiCredentialStatus(service: string): Promise<CredentialStatus>;
  deleteApiCredential(service: string): Promise<void>;
  testApiCredential(service: string, secret?: string): Promise<CredentialCheckResult>;

  // Gemini API Key, Hover Tooltips Explainer, Metadata Enricher, and PipeWire Helper
  getGeminiApiKeyStatus(): Promise<GeminiApiKeyStatus>;
  setGeminiApiKey(apiKey: string): Promise<GeminiApiKeyStatus>;
  clearGeminiApiKey(): Promise<GeminiApiKeyStatus>;
  explainAudioTerm(term: string, contextJson?: string): Promise<TooltipExplanation>;
  enrichTrackMetadata(
    trackId: string,
    options: MetadataEnrichRequest
  ): Promise<MetadataEnrichResult>;
  generatePipeWireConfig(
    alsaId?: string,
    ringBufferMb?: number
  ): Promise<{
    pipewireFilePath: string;
    pipewireContent: string;
    wireplumberFilePath: string;
    wireplumberContent: string;
  }>;

  // Hardware & Linux IPC Diagnostic Edge-Case Triggers (available in MockAudioBridge)
  setDeviceDsdMode(alsaId: string, dsdMode: DsdCapability): Promise<SignalPathState>;
  simulateUsbDacPlugIn(autoSwitch: boolean): Promise<{ device: AudioDeviceInfo; signalPath: SignalPathState }>;
  simulateAlsaEbusy(holdingProcess?: string, holdingPid?: number): Promise<SignalPathState>;
  forceClaimDbusReservation(): Promise<SignalPathState>;
  simulateUsbDacHotUnplug(): Promise<SignalPathState>;
  simulateUsbDacReconnect(): Promise<SignalPathState>;
  simulateMusicBrainz503Backoff(): Promise<{ retryAfterMs: number; attempt: number; message: string }>;
}

// ============================================================================
// 3. Deterministic Waveform & Realistic Audiophile Fixtures
// ============================================================================

function generateDeterministicWaveform(seed: number, length = 72): number[] {
  const peaks: number[] = [];
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const norm = state / 4294967296;
    const envelope = Math.sin((i / length) * Math.PI) * 0.55 + 0.45;
    const val = Math.min(1, Math.max(0.14, (0.28 + norm * 0.72) * envelope));
    peaks.push(Number(val.toFixed(3)));
  }
  return peaks;
}

const INITIAL_DEVICES: AudioDeviceInfo[] = [
  {
    alsaId: 'hw:CARD=Bifrost2,DEV=0',
    shortId: 'hw:Bifrost2',
    cardIndex: 2,
    vendor: 'Schiit Audio',
    displayName: 'Schiit Bifrost 2/64',
    usbVidPid: '20B1:3023 (Unison USB)',
    transportType: 'usb',
    supportedSampleRates: [44100, 48000, 88200, 96000, 176400, 192000],
    supportedBitDepths: [16, 24, 32],
    dsdCapability: 'pcm_fallback',
    reservationStatus: 'reserved_by_aurahifi',
    isIsolatedInternal: false,
    supportsHardwareVolume: false,
    iec958Passthrough: false,
    stream0Path: '/proc/asound/Bifrost2/stream0',
    dacChipset: 'True Multibit™ 4× TI DAC8812',
  },
  {
    alsaId: 'hw:CARD=iFiAudio,DEV=0',
    shortId: 'hw:iFiZENDAC',
    cardIndex: 3,
    vendor: 'iFi audio',
    displayName: 'iFi ZEN DAC V2',
    usbVidPid: '20B1:3008 (XMOS 16-Core)',
    transportType: 'usb',
    supportedSampleRates: [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000],
    supportedBitDepths: [16, 24, 32],
    dsdCapability: 'native',
    maxDsdMultiplier: 256,
    reservationStatus: 'available',
    isIsolatedInternal: false,
    supportsHardwareVolume: true,
    iec958Passthrough: false,
    stream0Path: '/proc/asound/iFiAudio/stream0',
    dacChipset: 'Burr-Brown True Native DSD256',
  },
  {
    alsaId: 'hdmi:CARD=NVidia,DEV=1',
    shortId: 'hdmi:DenonAVR',
    cardIndex: 1,
    vendor: 'Denon',
    displayName: 'Denon AVR-X3800H (HDMI eARC)',
    transportType: 'hdmi',
    supportedSampleRates: [44100, 48000, 88200, 96000, 176400, 192000],
    supportedBitDepths: [16, 24],
    dsdCapability: 'none',
    reservationStatus: 'available',
    isIsolatedInternal: false,
    supportsHardwareVolume: false,
    iec958Passthrough: true,
    stream0Path: '/proc/asound/card1/eld#0.1',
    dacChipset: 'HDMI 2.1 IEC958 Bitstream / Atmos 7.1.4',
  },
  {
    alsaId: 'hw:CARD=PCH,DEV=0',
    shortId: 'hw:IntelHDA',
    cardIndex: 0,
    vendor: 'Intel Corporation',
    displayName: 'Built-in Intel HDA Speakers',
    transportType: 'internal',
    supportedSampleRates: [44100, 48000],
    supportedBitDepths: [16, 24],
    dsdCapability: 'none',
    reservationStatus: 'available',
    isIsolatedInternal: true,
    supportsHardwareVolume: true,
    iec958Passthrough: false,
    dacChipset: 'Realtek ALC295 (Isolated by Policy)',
  },
];

const INITIAL_TRACKS: TrackSummary[] = [
  {
    id: 'trk-flac-192',
    path: '/mnt/music/Masters/Nils_Frahm_-_Spaces_24_192/01_An_Aborted_Beginning.flac',
    title: 'An Aborted Beginning (Studio Master)',
    artist: 'Nils Frahm',
    album: 'Spaces — 24/192 Reference Pressing',
    albumArtist: 'Nils Frahm',
    genre: 'Modern Classical',
    year: 2013,
    durationMs: 378000,
    codec: 'FLAC',
    sampleRateHz: 192000,
    bitDepth: 24,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 84,
    musicalKey: 'D min',
    dynamicRangeDr: 14,
    integratedLufs: -15.4,
    truePeakDbtp: -1.2,
    replayGainTrackDb: -2.6,
    mbidRecording: '9c6c1e74-6a1e-44a8-8b2f-2a8e94f01901',
    artworkTheme: 'emerald-prism',
    waveformPeaks: generateDeterministicWaveform(101),
  },
  {
    id: 'trk-dsd-256',
    path: '/mnt/music/DSD/Bill_Evans_Trio_-_Waltz_For_Debby_DSD256/02_My_Foolish_Heart.dsf',
    title: 'My Foolish Heart (Live at Village Vanguard)',
    artist: 'Bill Evans Trio',
    album: 'Waltz for Debby — Analog Tape to DSD256',
    albumArtist: 'Bill Evans Trio',
    genre: 'Acoustic Jazz',
    year: 1961,
    durationMs: 296000,
    codec: 'DSF',
    sampleRateHz: 11289600,
    bitDepth: 1,
    channels: 2,
    channelLayout: '2.0',
    isDsd: true,
    dsdRateMultiplier: 256,
    isAtmos: false,
    bpm: 68,
    musicalKey: 'Bb maj',
    dynamicRangeDr: 15,
    integratedLufs: -17.8,
    truePeakDbtp: -2.4,
    replayGainTrackDb: -0.2,
    mbidRecording: '4e8a4a2b-12df-4590-9f44-6e440120ab22',
    artworkTheme: 'amber-tape',
    waveformPeaks: generateDeterministicWaveform(207),
  },
  {
    id: 'trk-atmos-714',
    path: '/mnt/music/Atmos/Yello_-_Point_TrueHD_Atmos/04_Waba_Duba.mka',
    title: 'Waba Duba (7.1.4 Object Mix)',
    artist: 'Yello',
    album: 'Point — Dolby TrueHD Atmos Reference',
    albumArtist: 'Yello',
    genre: 'Electronic',
    year: 2020,
    durationMs: 214000,
    codec: 'TrueHD Atmos',
    sampleRateHz: 48000,
    bitDepth: 24,
    channels: 12,
    channelLayout: '7.1.4',
    isDsd: false,
    isAtmos: true,
    bpm: 118,
    musicalKey: 'F min',
    dynamicRangeDr: 12,
    integratedLufs: -16.1,
    truePeakDbtp: -1.1,
    replayGainTrackDb: -1.9,
    mbidRecording: '81d0f8bc-b7c1-44ce-952e-60f2f2b31109',
    artworkTheme: 'cobalt',
    waveformPeaks: generateDeterministicWaveform(319),
  },
  {
    id: 'trk-cue-01',
    path: '/mnt/music/Live_CUE/Keith_Jarrett_-_Koln_Concert_1975.flac',
    cueStartMs: 0,
    cueEndMs: 1561000,
    cueIndex: '01/04',
    title: 'Köln, January 24, 1975, Part I (CUE Split)',
    artist: 'Keith Jarrett',
    album: 'The Köln Concert [ECM 1064/65 CUE Image]',
    albumArtist: 'Keith Jarrett',
    genre: 'Solo Piano Jazz',
    year: 1975,
    durationMs: 392000,
    codec: 'FLAC',
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 92,
    musicalKey: 'C maj',
    dynamicRangeDr: 16,
    integratedLufs: -18.5,
    truePeakDbtp: -1.8,
    replayGainTrackDb: +0.5,
    mbidRecording: '2c47df08-79bb-48ab-8c04-d945f2c89712',
    artworkTheme: 'obsidian-gold',
    waveformPeaks: generateDeterministicWaveform(411),
  },
  {
    id: 'trk-cue-02',
    path: '/mnt/music/Live_CUE/Keith_Jarrett_-_Koln_Concert_1975.flac',
    cueStartMs: 1561000,
    cueEndMs: 2457000,
    cueIndex: '02/04',
    title: 'Köln, January 24, 1975, Part IIa (CUE Split)',
    artist: 'Keith Jarrett',
    album: 'The Köln Concert [ECM 1064/65 CUE Image]',
    albumArtist: 'Keith Jarrett',
    genre: 'Solo Piano Jazz',
    year: 1975,
    durationMs: 318000,
    codec: 'FLAC',
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 104,
    musicalKey: 'A min',
    dynamicRangeDr: 15,
    integratedLufs: -17.9,
    truePeakDbtp: -1.6,
    replayGainTrackDb: -0.1,
    mbidRecording: '2c47df08-79bb-48ab-8c04-d945f2c89713',
    artworkTheme: 'obsidian-gold',
    waveformPeaks: generateDeterministicWaveform(419),
  },
  {
    id: 'trk-flac-44',
    path: '/mnt/music/Redbook/Talk_Talk_-_Spirit_of_Eden/01_The_Rainbow.flac',
    title: 'The Rainbow (Original Parlophone Transfer)',
    artist: 'Talk Talk',
    album: 'Spirit of Eden',
    albumArtist: 'Talk Talk',
    genre: 'Post-Rock',
    year: 1988,
    durationMs: 545000,
    codec: 'FLAC',
    sampleRateHz: 44100,
    bitDepth: 16,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 74,
    musicalKey: 'E min',
    dynamicRangeDr: 14,
    integratedLufs: -16.8,
    truePeakDbtp: -0.9,
    replayGainTrackDb: -1.2,
    mbidRecording: '78c56b9d-2231-41e2-991a-9a409a892170',
    artworkTheme: 'crimson-vinyl',
    waveformPeaks: generateDeterministicWaveform(523),
  },
  {
    id: 'trk-atmos-kraftwerk',
    path: '/mnt/music/Atmos/Kraftwerk_-_3D_The_Catalogue/03_Autobahn_Atmos.mka',
    title: 'Autobahn (3-D Spatial Reference)',
    artist: 'Kraftwerk',
    album: '3-D The Catalogue — Dolby TrueHD Atmos',
    albumArtist: 'Kraftwerk',
    genre: 'Electronic',
    year: 2017,
    durationMs: 268000,
    codec: 'TrueHD Atmos',
    sampleRateHz: 48000,
    bitDepth: 24,
    channels: 12,
    channelLayout: '7.1.4',
    isDsd: false,
    isAtmos: true,
    bpm: 112,
    musicalKey: 'E maj',
    dynamicRangeDr: 13,
    integratedLufs: -15.7,
    truePeakDbtp: -1.3,
    replayGainTrackDb: -2.1,
    mbidRecording: '01f23c84-55d2-4f9e-b1aa-003344556677',
    artworkTheme: 'slate-mono',
    waveformPeaks: generateDeterministicWaveform(641),
  },
  {
    id: 'trk-flac-192-2',
    path: '/mnt/music/Masters/Nils_Frahm_-_Spaces_24_192/02_Says.flac',
    title: 'Says (Live at Funkhaus Berlin)',
    artist: 'Nils Frahm',
    album: 'Spaces — 24/192 Reference Pressing',
    albumArtist: 'Nils Frahm',
    genre: 'Modern Classical',
    year: 2013,
    durationMs: 498000,
    codec: 'FLAC',
    sampleRateHz: 192000,
    bitDepth: 24,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 96,
    musicalKey: 'C min',
    dynamicRangeDr: 15,
    integratedLufs: -16.2,
    truePeakDbtp: -1.4,
    replayGainTrackDb: -1.8,
    mbidRecording: '9c6c1e74-6a1e-44a8-8b2f-2a8e94f01902',
    artworkTheme: 'emerald-prism',
    waveformPeaks: generateDeterministicWaveform(108),
  },
  {
    id: 'trk-dsd-128',
    path: '/mnt/music/DSD/Miles_Davis_-_Kind_of_Blue_DSD128/01_So_What.dsf',
    title: 'So What (3-Track Master Transfer)',
    artist: 'Miles Davis',
    album: 'Kind of Blue — Columbia DSD128 Archive',
    albumArtist: 'Miles Davis',
    genre: 'Acoustic Jazz',
    year: 1959,
    durationMs: 562000,
    codec: 'DSF',
    sampleRateHz: 5644800,
    bitDepth: 1,
    channels: 2,
    channelLayout: '2.0',
    isDsd: true,
    dsdRateMultiplier: 128,
    isAtmos: false,
    bpm: 136,
    musicalKey: 'D dor',
    dynamicRangeDr: 15,
    integratedLufs: -18.1,
    truePeakDbtp: -2.1,
    replayGainTrackDb: +0.1,
    mbidRecording: '3b90c112-8421-4e7a-a122-9f440120ab99',
    artworkTheme: 'amber-tape',
    waveformPeaks: generateDeterministicWaveform(715),
  },
  {
    id: 'trk-flac-96-steely',
    path: '/mnt/music/Masters/Steely_Dan_-_Aja_24_96/02_Aja.flac',
    title: 'Aja (1977 Analog Tape Transfer)',
    artist: 'Steely Dan',
    album: 'Aja — 24/96 Reference Transfer',
    albumArtist: 'Steely Dan',
    genre: 'Jazz Fusion',
    year: 1977,
    durationMs: 479000,
    codec: 'FLAC',
    sampleRateHz: 96000,
    bitDepth: 24,
    channels: 2,
    channelLayout: '2.0',
    isDsd: false,
    isAtmos: false,
    bpm: 102,
    musicalKey: 'B maj',
    dynamicRangeDr: 14,
    integratedLufs: -15.9,
    truePeakDbtp: -1.5,
    replayGainTrackDb: -2.0,
    mbidRecording: '77aa4120-2211-4433-99aa-887766554433',
    artworkTheme: 'obsidian-gold',
    waveformPeaks: generateDeterministicWaveform(832),
  },
];

const INITIAL_PEQ_BANDS: PeqBand[] = [
  { id: 'b1', frequencyHz: 32, gainDb: 2.5, qFactor: 0.71, filterType: 'low_shelf', enabled: true },
  { id: 'b2', frequencyHz: 64, gainDb: 1.4, qFactor: 1.2, filterType: 'peaking', enabled: true },
  { id: 'b3', frequencyHz: 125, gainDb: -0.8, qFactor: 1.4, filterType: 'peaking', enabled: true },
  { id: 'b4', frequencyHz: 250, gainDb: -1.2, qFactor: 1.6, filterType: 'peaking', enabled: true },
  { id: 'b5', frequencyHz: 500, gainDb: 0.0, qFactor: 1.41, filterType: 'peaking', enabled: true },
  { id: 'b6', frequencyHz: 1000, gainDb: 0.4, qFactor: 1.8, filterType: 'peaking', enabled: true },
  { id: 'b7', frequencyHz: 2000, gainDb: 1.1, qFactor: 1.5, filterType: 'peaking', enabled: true },
  { id: 'b8', frequencyHz: 4000, gainDb: -1.8, qFactor: 2.2, filterType: 'peaking', enabled: true },
  { id: 'b9', frequencyHz: 8000, gainDb: -0.9, qFactor: 2.5, filterType: 'peaking', enabled: true },
  { id: 'b10', frequencyHz: 16000, gainDb: 1.2, qFactor: 0.71, filterType: 'high_shelf', enabled: true },
];

const INITIAL_SPATIAL_CONFIG: SpatialConfig = {
  atmosMode: 'binaural_sofa',
  sofaProfileName: 'SADIE D1 Neutral (Default)',
  sofaFilePath: '/usr/share/aurahifi/sofa/sadie_d1_neutral_48k.sofa',
  azimuthDeg: 30,
  elevationDeg: 12,
  radiusMeters: 2.4,
  bs2bEnabled: true,
  bs2bPreset: 'jmeier',
  peqEnabled: true,
  preampGainDb: -3.2,
  autoEqProfileName: 'Sennheiser HD 650 — Harman 2018',
  peqBands: INITIAL_PEQ_BANDS,
  replayGainMode: 'off',
  truePeakLimiterEnabled: true,
};

const INITIAL_ADDONS: AddonCatalogItem[] = [
  {
    id: 'metadata-enricher',
    name: 'Metadata Enricher Pro',
    version: '1.3.0',
    latestVersion: '1.4.2',
    hasUpdate: true,
    author: 'AuraHiFi Core Team',
    category: 'metadata',
    description:
      'Fingerprints lossless FLAC/DSF releases via Chromaprint and fetches verified MusicBrainz & Discogs tags with RFC 7231 HTTP 503 exponential backoff.',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-release-2026',
    wasmSizeKb: 412,
    installed: true,
    enabled: true,
    permissions: {
      allowedHosts: ['musicbrainz.org', 'api.acoustid.org', 'api.discogs.com'],
      libraryRead: true,
      libraryWriteTags: true,
      audioBufferReadOnly: false,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.read_track_tags', 'aurahifi.propose_tag_diff', 'aurahifi.http_fetch_allowlisted'],
      maxMemoryMb: 64,
      maxCpuMsPerCall: 800,
    },
  },
  {
    id: 'lyrics-art',
    name: 'Synced Lyrics & Cover Art',
    version: '1.2.1',
    latestVersion: '1.2.1',
    hasUpdate: false,
    author: 'AuraHiFi Core Team',
    category: 'lyrics',
    description:
      'Retrieves time-synced LRCLIB .lrc files and 1200px Cover Art Archive scans into SQLite lyrics_cache with 300ms polite rate limiting.',
    sha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-release-2026',
    wasmSizeKb: 288,
    installed: true,
    enabled: true,
    permissions: {
      allowedHosts: ['lrclib.net', 'coverartarchive.org'],
      libraryRead: true,
      libraryWriteTags: false,
      audioBufferReadOnly: false,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.read_track_tags', 'aurahifi.cache_lyrics_lrc', 'aurahifi.http_fetch_allowlisted'],
      maxMemoryMb: 32,
      maxCpuMsPerCall: 500,
    },
  },
  {
    id: 'smart-playlists',
    name: 'AI Smart Playlist Engine',
    version: '2.0.0',
    latestVersion: '2.1.0',
    hasUpdate: true,
    author: 'AuraHiFi Core Team',
    category: 'intelligence',
    description:
      'Indexes offline Bliss acoustic descriptors and CLAP audio embeddings into local sqlite-vec for vibe queries and harmonic BPM flow sequencing.',
    sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-release-2026',
    wasmSizeKb: 940,
    installed: true,
    enabled: true,
    permissions: {
      allowedHosts: [],
      libraryRead: true,
      libraryWriteTags: false,
      audioBufferReadOnly: true,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.sqlite_vec_query', 'aurahifi.read_pcm_analysis_window'],
      maxMemoryMb: 256,
      maxCpuMsPerCall: 2500,
    },
  },
  {
    id: 'eac3-joc-atmos',
    name: 'E-AC-3 JOC Atmos Bridge',
    version: '0.8.2',
    latestVersion: '0.8.2',
    hasUpdate: false,
    author: 'Open Spatial Collective',
    category: 'decoder',
    licenseTag: 'Non-Commercial License',
    description:
      'Decodes E-AC-3 Joint Object Coding spatial beds into 7.1.4 object streams for in-process Steam Audio SOFA HRTF binaural rendering.',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-community-spatial',
    wasmSizeKb: 760,
    installed: false,
    enabled: false,
    permissions: {
      allowedHosts: [],
      libraryRead: false,
      libraryWriteTags: false,
      audioBufferReadOnly: true,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.decode_spatial_frame', 'aurahifi.emit_object_coords'],
      maxMemoryMb: 128,
      maxCpuMsPerCall: 150,
    },
  },
  {
    id: 'opensubsonic-bridge',
    name: 'OpenSubsonic & Navidrome',
    version: '0.9.4',
    latestVersion: '0.9.4',
    hasUpdate: false,
    author: 'Community Verified',
    category: 'network',
    description:
      'Streams untouched lossless FLAC and DSF libraries from self-hosted Navidrome / OpenSubsonic servers straight into the ALSA ring buffer.',
    sha256: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-community-04',
    wasmSizeKb: 518,
    installed: false,
    enabled: false,
    permissions: {
      allowedHosts: ['nas.local', '192.168.1.0/24'],
      libraryRead: false,
      libraryWriteTags: false,
      audioBufferReadOnly: false,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.stream_remote_lossless', 'aurahifi.http_fetch_allowlisted'],
      maxMemoryMb: 64,
      maxCpuMsPerCall: 1000,
    },
  },
  {
    id: 'upnp-dlna-renderer',
    name: 'UPnP / DLNA Control Point',
    version: '1.0.3',
    latestVersion: '1.0.3',
    hasUpdate: false,
    author: 'Community Verified',
    category: 'network',
    description:
      'Discovers LAN UPnP/OpenHome Hi-Fi streamers via rupnp and bridges gapless FLAC/DSD queues without transcoding.',
    sha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    signatureVerified: true,
    signerKeyId: 'ed25519:aurahifi-community-04',
    wasmSizeKb: 384,
    installed: false,
    enabled: false,
    permissions: {
      allowedHosts: ['239.255.255.250:1900', '192.168.1.0/24'],
      libraryRead: true,
      libraryWriteTags: false,
      audioBufferReadOnly: false,
      wasiEnabled: false,
      hostFunctions: ['aurahifi.ssdp_discover_lan', 'aurahifi.queue_remote_uri'],
      maxMemoryMb: 48,
      maxCpuMsPerCall: 600,
    },
  },
];

const LYRICS_FIXTURES: Record<string, LyricsPayload> = {
  'trk-flac-192': {
    trackId: 'trk-flac-192',
    source: 'Instrumental Mastering Notes · SQLite Cache',
    cachedInSqlite: true,
    lines: [
      { timeMs: 0, text: '[00:00] Tape hiss floor — Studer A800 1/2" master reel' },
      { timeMs: 18000, text: '[00:18] Felt-damped upright piano harmonics enter (Close Neumann U47)' },
      { timeMs: 52000, text: '[00:52] Analog Juno-60 arpeggio blooms across stereo soundstage' },
      { timeMs: 96000, text: '[01:36] Dynamic crest +14 dB — peak transient at 192.0 kHz' },
      { timeMs: 150000, text: '[02:30] Natural hall decay at Funkhaus Berlin Saal 3' },
      { timeMs: 225000, text: '[03:45] Sustain pedal release & room noise floor' },
    ],
  },
  'trk-dsd-256': {
    trackId: 'trk-dsd-256',
    source: 'Session Notes · Village Vanguard 1961 (DSD256)',
    cachedInSqlite: true,
    lines: [
      { timeMs: 0, text: '[00:00] Ambient room clink — Village Vanguard, New York, June 25 1961' },
      { timeMs: 14000, text: '[00:14] Bill Evans — delicate rubato chord voicings (Steinway D)' },
      { timeMs: 48000, text: '[00:48] Scott LaFaro — conversational upright bass counterpoint' },
      { timeMs: 104000, text: '[01:44] Paul Motian — featherlight brush sweep on snare' },
      { timeMs: 180000, text: '[03:00] Pure 1-bit SDM transfer from original Riverside 15 ips tape' },
    ],
  },
  'trk-atmos-714': {
    trackId: 'trk-atmos-714',
    source: 'LRCLIB Synced · Dolby TrueHD 7.1.4',
    cachedInSqlite: true,
    lines: [
      { timeMs: 0, text: '[00:00] Sub-bass LFE bed lock (38 Hz fundamental)' },
      { timeMs: 16000, text: '[00:16] Height channels Top-FL / Top-FR percussive shimmer' },
      { timeMs: 42000, text: 'Waba duba, moving through the wide horizon' },
      { timeMs: 74000, text: 'Discrete object pan — 360° azimuth sweep (+24° elevation)' },
      { timeMs: 118000, text: 'Pulse locked to 118 BPM · 7.1.4 bed + 11 dynamic objects' },
    ],
  },
  'trk-flac-44': {
    trackId: 'trk-flac-44',
    source: 'LRCLIB Synced · SQLite lyrics_cache',
    cachedInSqlite: true,
    lines: [
      { timeMs: 0, text: '[00:00] Slow atmospheric brass drone & harmonica swell' },
      { timeMs: 45000, text: 'All I could do was to know you...' },
      { timeMs: 92000, text: 'Standing in the silence of the open room' },
      { timeMs: 148000, text: 'Guitar feedback bloom — DR14 uncompressed dynamic swing' },
      { timeMs: 210000, text: 'Wait for the rain to clear the skyline' },
    ],
  },
};

// ============================================================================
// 4. MockAudioBridge Implementation (60 fps FFT/VU + Realistic Linux State Machine)
// ============================================================================

export class MockAudioBridge implements AudioBridge {
  private devices: AudioDeviceInfo[] = INITIAL_DEVICES.map((d) => ({ ...d }));
  private tracks: TrackSummary[] = INITIAL_TRACKS.map((t) => ({ ...t }));
  private addons: AddonCatalogItem[] = INITIAL_ADDONS.map((a) => ({
    ...a,
    permissions: { ...a.permissions, allowedHosts: [...a.permissions.allowedHosts] },
  }));
  private spatialConfig: SpatialConfig = {
    ...INITIAL_SPATIAL_CONFIG,
    peqBands: INITIAL_SPATIAL_CONFIG.peqBands.map((b) => ({ ...b })),
  };

  private mode: AudioMode = 'bit_perfect';
  private activeDeviceId: string = 'hw:CARD=Bifrost2,DEV=0';
  private exclusiveAlsa = true;
  private bypassLaptopSpeakers = true;
  private activeError: SignalPathError | null = null;
  private isTransitioning = false;
  private transitionProgress = 0;
  private rateLockState: { locked: boolean; fromRateHz?: number; toRateHz?: number } = {
    locked: false,
  };
  private mbBackoffAttempt = 0;

  private playback: PlaybackState = {
    status: 'playing',
    currentTrackId: INITIAL_TRACKS[0].id,
    positionMs: 74000,
    durationMs: INITIAL_TRACKS[0].durationMs,
    volumeDb: -8.0,
    volumeNormalized: 0.72,
    isVolumeLocked: true,
    isMuted: false,
    repeatMode: 'all',
    shuffle: false,
    gaplessNextTrackId: INITIAL_TRACKS[1].id,
    queueTrackIds: INITIAL_TRACKS.map((t) => t.id),
  };

  private telemetryListeners = new Set<(frame: TelemetryFrame) => void>();
  private hardwareListeners = new Set<(event: HardwareEvent) => void>();
  private scanProgressListeners = new Set<(event: ScanProgressEvent) => void>();
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickMs = Date.now();
  private phase = 0;

  private onboardingCompleted = false;
  private libraryFolders: LibraryFolder[] = [
    {
      id: 'folder-demo-01',
      path: '/home/sinnoh/Music',
      trackCount: 4,
      watchEnabled: true,
      lastScannedAt: Date.now(),
    },
  ];
  private credentials: Record<string, { secret: string; model?: string }> = {};

  constructor() {
    this.syncVolumeLock();
  }

  async pickMusicFolder(): Promise<string[] | null> {
    return ['/home/sinnoh/Music'];
  }

  async getOnboardingStatus(): Promise<OnboardingStatus> {
    return {
      completed: this.onboardingCompleted,
      folderCount: this.libraryFolders.length,
      trackCount: this.tracks.length,
      defaultMusicDirExists: true,
      defaultMusicDirPath: '/home/sinnoh/Music',
    };
  }

  async completeOnboarding(audioMode?: AudioMode): Promise<void> {
    this.onboardingCompleted = true;
    if (audioMode) {
      await this.setAudioMode(audioMode);
    }
  }

  async listLibraryFolders(): Promise<LibraryFolder[]> {
    return [...this.libraryFolders];
  }

  async addLibraryFolder(path: string, autoWatch = true): Promise<LibraryFolder> {
    const existing = this.libraryFolders.find((f) => f.path === path);
    if (existing) return existing;
    const folder: LibraryFolder = {
      id: `folder-${Date.now()}`,
      path,
      trackCount: this.tracks.length,
      watchEnabled: autoWatch,
      lastScannedAt: Date.now(),
    };
    this.libraryFolders.push(folder);
    this.emitScanProgress({
      jobId: `job-${Date.now()}`,
      currentDirectory: path,
      filesScanned: 12,
      tracksAdded: this.tracks.length,
      isComplete: true,
    });
    return folder;
  }

  async removeLibraryFolder(id: string): Promise<void> {
    this.libraryFolders = this.libraryFolders.filter((f) => f.id !== id);
  }

  async setLibraryFolderWatch(id: string, autoWatch: boolean): Promise<void> {
    const f = this.libraryFolders.find((x) => x.id === id);
    if (f) f.watchEnabled = autoWatch;
  }

  subscribeScanProgress(cb: (event: ScanProgressEvent) => void): () => void {
    this.scanProgressListeners.add(cb);
    return () => this.scanProgressListeners.delete(cb);
  }

  private emitScanProgress(event: ScanProgressEvent) {
    this.scanProgressListeners.forEach((cb) => cb(event));
  }

  async setApiCredential(service: string, secret: string, model?: string): Promise<void> {
    this.credentials[service] = { secret, model };
    if (service === 'gemini') {
      await this.setGeminiApiKey(secret);
    }
  }

  async getApiCredentialStatus(service: string): Promise<CredentialStatus> {
    const cred = this.credentials[service];
    const configured = Boolean(cred?.secret && cred.secret.length > 0);
    const maskedHint = configured && cred.secret.length > 6
      ? `${cred.secret.slice(0, 3)}••••${cred.secret.slice(-3)}`
      : configured ? '••••••••' : undefined;
    return {
      provider: service,
      configured,
      maskedHint,
      storageBackend: 'Ubuntu Secret Service (GNOME Keyring)',
      updatedAtMs: Date.now(),
    };
  }

  async deleteApiCredential(service: string): Promise<void> {
    delete this.credentials[service];
    if (service === 'gemini') {
      await this.clearGeminiApiKey();
    }
  }

  async testApiCredential(service: string, secret?: string): Promise<CredentialCheckResult> {
    const key = secret ?? this.credentials[service]?.secret ?? '';
    const valid = key.trim().length >= 8;
    return {
      provider: service,
      valid,
      message: valid
        ? 'Key validated successfully via secure OS keyring'
        : 'Key is invalid or too short (minimum 8 characters)',
      checkedAtMs: Date.now(),
    };
  }

  private getActiveDevice(): AudioDeviceInfo | null {
    return this.devices.find((d) => d.alsaId === this.activeDeviceId) ?? null;
  }

  private getCurrentTrack(): TrackSummary | null {
    return this.tracks.find((t) => t.id === this.playback.currentTrackId) ?? null;
  }

  private buildSignalPath(): SignalPathState {
    return evaluateSignalPath({
      mode: this.mode,
      device: this.getActiveDevice(),
      track: this.getCurrentTrack(),
      spatialConfig: this.spatialConfig,
      exclusiveAlsa: this.exclusiveAlsa,
      bypassLaptopSpeakers: this.bypassLaptopSpeakers,
      activeError: this.activeError,
      isTransitioning: this.isTransitioning,
      transitionProgress: this.transitionProgress,
      rateLockState: this.rateLockState,
    });
  }

  private syncVolumeLock() {
    const sp = this.buildSignalPath();
    this.playback.isVolumeLocked = sp.isVolumeLocked;
  }

  private emitHardwareEvent(event: HardwareEvent) {
    this.hardwareListeners.forEach((cb) => cb(event));
  }

  private emitSignalPathChanged() {
    const sp = this.buildSignalPath();
    this.emitHardwareEvent({
      type: 'SignalPathChanged',
      timestampMs: Date.now(),
      integrity: sp.integrity,
      summary: sp.summaryLabel,
    });
  }

  private ensureTelemetryLoop() {
    if (this.telemetryTimer !== null) return;
    this.lastTickMs = Date.now();
    // 60 fps simulated FFT/VU telemetry stream (~16.6ms)
    this.telemetryTimer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(100, now - this.lastTickMs);
      this.lastTickMs = now;

      const track = this.getCurrentTrack();
      const isPlaying = this.playback.status === 'playing' && !this.isTransitioning && !this.rateLockState.locked;

      if (isPlaying && track) {
        this.playback.positionMs += dt;
        if (this.playback.positionMs >= track.durationMs) {
          this.playback.positionMs = 0;
        }
      }

      this.phase += isPlaying ? dt * 0.0045 : dt * 0.0005;

      const gainFactor =
        !isPlaying || this.playback.isMuted
          ? 0.02
          : this.playback.isVolumeLocked
          ? 1.0
          : Math.max(0.05, this.playback.volumeNormalized);

      const fftBands: number[] = new Array(48);
      for (let i = 0; i < 48; i++) {
        if (!isPlaying || this.playback.isMuted) {
          fftBands[i] = 0.015 + Math.sin(this.phase + i * 0.4) * 0.005;
        } else {
          const freqTilt = Math.pow(1 - i / 54, 0.72);
          const wave1 = Math.sin(this.phase * 2.1 + i * 0.34) * 0.25 + 0.5;
          const wave2 = Math.cos(this.phase * 3.7 - i * 0.19) * 0.22 + 0.45;
          const subPunch = i < 8 ? (Math.sin(this.phase * 4.4) * 0.25 + 0.25) : 0;
          const airSparkle = track?.sampleRateHz && track.sampleRateHz >= 96000 && i > 34 ? 0.14 : 0;
          const spatialLift = this.mode === 'spatial' && i > 14 && i < 36 ? 0.08 : 0;
          const mag = (wave1 * 0.55 + wave2 * 0.45 + subPunch + airSparkle + spatialLift) * freqTilt * gainFactor;
          fftBands[i] = Math.min(0.98, Math.max(0.02, mag));
        }
      }

      const avgEnergy = fftBands.reduce((acc, v) => acc + v, 0) / fftBands.length;
      const baseDb = isPlaying && !this.playback.isMuted ? -34 + avgEnergy * 31 : -88;
      const leftRmsDb = Number((baseDb + Math.sin(this.phase * 1.9) * 1.4).toFixed(1));
      const rightRmsDb = Number((baseDb + Math.cos(this.phase * 2.2) * 1.4).toFixed(1));
      const leftPeakDb = Number(Math.min(-0.3, leftRmsDb + 4.8).toFixed(1));
      const rightPeakDb = Number(Math.min(-0.3, rightRmsDb + 4.6).toFixed(1));

      const frame: TelemetryFrame = {
        timestampMs: now,
        fftBands,
        leftRmsDb,
        rightRmsDb,
        leftPeakDb,
        rightPeakDb,
        truePeakDbtp: track ? Number((track.truePeakDbtp + (isPlaying ? Math.sin(this.phase) * 0.2 : -40)).toFixed(1)) : -60,
        integratedLufs: track?.integratedLufs ?? -18.0,
        momentaryLufs: isPlaying ? Number(((track?.integratedLufs ?? -16) + Math.sin(this.phase * 1.5) * 1.8).toFixed(1)) : -70.0,
        positionMs: this.playback.positionMs,
        sampleRateHz: track?.sampleRateHz ?? 44100,
        bitDepth: track?.bitDepth ?? 24,
        bufferFillPct: isPlaying ? 94 : 100,
        xruns: 0,
      };

      this.telemetryListeners.forEach((cb) => cb(frame));
    }, 16);
  }

  private stopTelemetryLoopIfIdle() {
    if (this.telemetryListeners.size === 0 && this.telemetryTimer !== null) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
  }

  // ---- Core IPC Methods ----

  async listAudioDevices(): Promise<AudioDeviceInfo[]> {
    return this.devices.map((d) => ({ ...d }));
  }

  async selectAudioDevice(
    alsaId: string,
    exclusive: boolean,
    bypassLaptop: boolean
  ): Promise<SignalPathState> {
    const target = this.devices.find((d) => d.alsaId === alsaId);
    if (!target) {
      throw new Error(`ALSA endpoint not found: ${alsaId}`);
    }

    // Check if device is disconnected
    if (target.reservationStatus === 'disconnected') {
      this.activeError = {
        code: 'DAC_HOT_UNPLUGGED',
        title: 'USB DAC Disconnected',
        message: `${target.displayName} is physically disconnected from USB bus.`,
        technicalDetail: `udev remove event received for ${target.alsaId}; Intel HDA fallback strictly blocked.`,
        recoveryActionLabel: 'Reconnect USB DAC',
      };
      return this.buildSignalPath();
    }

    // Release previous reservation & reserve new device
    this.devices = this.devices.map((d) => {
      if (d.alsaId === alsaId) {
        return {
          ...d,
          reservationStatus: exclusive && !d.isIsolatedInternal ? 'reserved_by_aurahifi' : 'available',
          holdingProcess: undefined,
          holdingPid: undefined,
        };
      }
      if (d.reservationStatus === 'reserved_by_aurahifi') {
        return { ...d, reservationStatus: 'available' };
      }
      return d;
    });

    this.activeDeviceId = alsaId;
    this.exclusiveAlsa = exclusive;
    this.bypassLaptopSpeakers = bypassLaptop;
    this.activeError = null;
    this.syncVolumeLock();

    const sp = this.buildSignalPath();

    // Emit DSD fallback notice if applicable
    const track = this.getCurrentTrack();
    if (track?.isDsd && target.dsdCapability === 'pcm_fallback' && this.mode === 'bit_perfect') {
      this.emitHardwareEvent({
        type: 'DsdFallbackNotice',
        timestampMs: Date.now(),
        alsaId: target.alsaId,
        fromFormat: formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier),
        toFormat: 'PCM 176.4 kHz / 24-bit',
        message: `${target.displayName} lacks UAC2 Native DSD; decimating transparently to PCM 176.4 kHz.`,
      });
    }

    this.emitSignalPathChanged();
    return sp;
  }

  async testDacCapabilities(alsaId: string): Promise<DacProbeReport> {
    const dev = this.devices.find((d) => d.alsaId === alsaId);
    if (!dev) throw new Error(`Unknown ALSA device ${alsaId}`);

    return {
      alsaId: dev.alsaId,
      probedAtMs: Date.now(),
      procAsoundStream0: dev.stream0Path
        ? `${dev.stream0Path} · Status: Running · Altset 1 · Format: ${
            dev.dsdCapability === 'native' ? 'S32_LE + DSD_U32_BE' : 'S32_LE PCM'
          }`
        : 'Shared PipeWire graph node',
      dbusReservationOk: !dev.isIsolatedInternal && dev.reservationStatus !== 'busy_other_app',
      rtkitPriorityOk: true,
      nativeDsdSupported: dev.dsdCapability === 'native',
      dopSupported: dev.dsdCapability === 'native' || dev.dsdCapability === 'dop',
      verifiedRatesHz: [...dev.supportedSampleRates],
      latencyFloorMs: dev.transportType === 'usb' ? 4.2 : dev.transportType === 'hdmi' ? 8.5 : 14.0,
      notes: [
        dev.isIsolatedInternal
          ? 'Internal Intel HDA speakers are isolated by default to prevent accidental output fallback.'
          : `Verified D-Bus org.freedesktop.ReserveDevice1.Audio${dev.cardIndex} claim.`,
        dev.dsdCapability === 'native'
          ? `Native UAC2 DSD up to DSD${dev.maxDsdMultiplier ?? 256} confirmed.`
          : dev.iec958Passthrough
          ? 'IEC958 HDMI 2.1 bitstream passthrough ready for TrueHD Atmos 7.1.4.'
          : 'PCM Multibit DAC — DSD streams will cleanly decimate to 176.4 kHz / 24-bit PCM with Amber alert.',
      ],
    };
  }

  async setAudioMode(mode: AudioMode): Promise<SignalPathState> {
    if (mode === this.mode && !this.isTransitioning) {
      return this.buildSignalPath();
    }

    const fromMode = this.mode;
    this.isTransitioning = true;
    this.transitionProgress = 0.5;
    this.mode = mode;
    this.syncVolumeLock();

    this.emitHardwareEvent({
      type: 'ModeTransition',
      timestampMs: Date.now(),
      fromMode,
      toMode: mode,
      rampMs: 50,
      message:
        mode === 'bit_perfect'
          ? 'Atomic 50ms mute ramp complete — DSP bypassed, volume locked at 0.0 dB.'
          : 'Atomic 50ms mute ramp complete — 64-bit Spatial DSP active, software volume unlocked.',
    });

    // Simulate atomic 50ms cosine mute ramp completion
    await new Promise((resolve) => setTimeout(resolve, 50));
    this.isTransitioning = false;
    this.transitionProgress = 1;
    this.syncVolumeLock();

    const sp = this.buildSignalPath();
    this.emitSignalPathChanged();
    return sp;
  }

  async updateSpatialConfig(cfg: SpatialConfig): Promise<SignalPathState> {
    this.spatialConfig = {
      ...cfg,
      peqBands: cfg.peqBands.map((b) => ({ ...b })),
    };
    this.syncVolumeLock();
    const sp = this.buildSignalPath();
    this.emitSignalPathChanged();
    return sp;
  }

  async transportCommand(cmd: TransportCommand): Promise<PlaybackState> {
    switch (cmd.type) {
      case 'Play': {
        if (this.activeError && (this.activeError.code === 'DAC_HOT_UNPLUGGED' || this.activeError.code === 'ALSA_EBUSY')) {
          return { ...this.playback };
        }
        if (cmd.trackId && cmd.trackId !== this.playback.currentTrackId) {
          await this.switchTrackInternal(cmd.trackId);
        }
        this.playback.status = 'playing';
        break;
      }
      case 'Pause': {
        this.playback.status = 'paused';
        break;
      }
      case 'Seek': {
        this.playback.positionMs = Math.max(0, Math.min(this.playback.durationMs, cmd.positionMs));
        break;
      }
      case 'Next': {
        const idx = this.playback.queueTrackIds.indexOf(this.playback.currentTrackId);
        const nextIdx = (idx + 1) % this.playback.queueTrackIds.length;
        await this.switchTrackInternal(this.playback.queueTrackIds[nextIdx]);
        if (this.playback.status !== 'halted_hardware_error') {
          this.playback.status = 'playing';
        }
        break;
      }
      case 'Prev': {
        if (this.playback.positionMs > 4000) {
          this.playback.positionMs = 0;
        } else {
          const idx = this.playback.queueTrackIds.indexOf(this.playback.currentTrackId);
          const prevIdx = (idx - 1 + this.playback.queueTrackIds.length) % this.playback.queueTrackIds.length;
          await this.switchTrackInternal(this.playback.queueTrackIds[prevIdx]);
        }
        if (this.playback.status !== 'halted_hardware_error') {
          this.playback.status = 'playing';
        }
        break;
      }
      case 'SetVolume': {
        // Honestly ignore software gain changes when locked in Bit-Perfect / DSD mode
        if (this.playback.isVolumeLocked) {
          return { ...this.playback };
        }
        const clamped = Math.max(0, Math.min(1, cmd.volumeNormalized));
        this.playback.volumeNormalized = clamped;
        this.playback.volumeDb = clamped <= 0.001 ? -96 : Number((Math.log10(clamped) * 32).toFixed(1));
        this.playback.isMuted = clamped <= 0.001;
        break;
      }
      case 'ToggleMute': {
        if (this.playback.isVolumeLocked) return { ...this.playback };
        this.playback.isMuted = !this.playback.isMuted;
        break;
      }
      case 'ToggleShuffle': {
        this.playback.shuffle = !this.playback.shuffle;
        break;
      }
      case 'CycleRepeat': {
        const order: PlaybackState['repeatMode'][] = ['off', 'all', 'one'];
        const next = order[(order.indexOf(this.playback.repeatMode) + 1) % order.length];
        this.playback.repeatMode = next;
        break;
      }
    }

    return { ...this.playback };
  }

  private async switchTrackInternal(nextTrackId: string) {
    const prevTrack = this.getCurrentTrack();
    const nextTrack = this.tracks.find((t) => t.id === nextTrackId);
    if (!nextTrack) return;

    const rateCheck = requiresSampleRateSwitchLock(prevTrack, nextTrack);
    const activeDev = this.getActiveDevice();

    if (rateCheck.required && rateCheck.fromRateHz && rateCheck.toRateHz) {
      this.rateLockState = {
        locked: true,
        fromRateHz: rateCheck.fromRateHz,
        toRateHz: rateCheck.toRateHz,
      };
      this.emitHardwareEvent({
        type: 'RateChanged',
        timestampMs: Date.now(),
        alsaId: this.activeDeviceId,
        fromRateHz: rateCheck.fromRateHz,
        toRateHz: rateCheck.toRateHz,
        lockDurationMs: 140,
        message: `Hardware clock relock: ${formatSampleRate(rateCheck.fromRateHz, prevTrack?.isDsd)} → ${formatSampleRate(rateCheck.toRateHz, nextTrack.isDsd)}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 140));
      this.rateLockState = { locked: false };
    }

    this.playback.currentTrackId = nextTrack.id;
    this.playback.positionMs = 0;
    this.playback.durationMs = nextTrack.durationMs;

    const qIdx = this.playback.queueTrackIds.indexOf(nextTrack.id);
    this.playback.gaplessNextTrackId =
      this.playback.queueTrackIds[(qIdx + 1) % this.playback.queueTrackIds.length] ?? null;

    this.syncVolumeLock();

    if (nextTrack.isDsd && activeDev && activeDev.dsdCapability === 'pcm_fallback' && this.mode === 'bit_perfect') {
      this.emitHardwareEvent({
        type: 'DsdFallbackNotice',
        timestampMs: Date.now(),
        alsaId: activeDev.alsaId,
        fromFormat: formatSampleRate(nextTrack.sampleRateHz, true, nextTrack.dsdRateMultiplier),
        toFormat: 'PCM 176.4 kHz / 24-bit',
        message: `${activeDev.displayName} rejected UAC2 Native DSD — transparently decimating to PCM 176.4 kHz.`,
      });
    }

    this.emitSignalPathChanged();
  }

  async scanLibrary(paths: string[]): Promise<ScanJobId> {
    return {
      jobId: `scan-${Date.now().toString(36)}`,
      paths,
      discoveredFiles: this.tracks.length,
      cueSheetsSplit: 1,
      startedAtMs: Date.now(),
    };
  }

  async listStoreAddons(): Promise<AddonCatalogItem[]> {
    return this.addons.map((a) => ({
      ...a,
      permissions: { ...a.permissions, allowedHosts: [...a.permissions.allowedHosts] },
    }));
  }

  async installAddon(id: string, approvedPermissions: AddonPermissions): Promise<InstalledAddon> {
    const addon = this.addons.find((a) => a.id === id);
    if (!addon) throw new Error(`Addon not found: ${id}`);

    addon.installed = true;
    addon.enabled = true;
    addon.version = addon.latestVersion;
    addon.hasUpdate = false;
    addon.permissions = {
      ...approvedPermissions,
      allowedHosts: [...approvedPermissions.allowedHosts],
    };

    return {
      id: addon.id,
      version: addon.version,
      sha256: addon.sha256,
      signatureVerified: addon.signatureVerified,
      enabled: addon.enabled,
      installedAtMs: Date.now(),
    };
  }

  async toggleAddonEnabled(id: string, enabled: boolean): Promise<AddonCatalogItem> {
    const addon = this.addons.find((a) => a.id === id);
    if (!addon) throw new Error(`Addon not found: ${id}`);
    addon.enabled = enabled;
    return { ...addon, permissions: { ...addon.permissions } };
  }

  async runAddonAction(addonId: string, action: string, payloadJson: string): Promise<string> {
    if (addonId === 'metadata-enricher' && action === 'test_musicbrainz_503') {
      const res = await this.simulateMusicBrainz503Backoff();
      return JSON.stringify(res);
    }
    return JSON.stringify({
      ok: true,
      addonId,
      action,
      echo: payloadJson,
      executedAtMs: Date.now(),
    });
  }

  async generateSmartPlaylist(query: SmartPlaylistQuery): Promise<TrackSummary[]> {
    const q = query.prompt.trim().toLowerCase();
    let results = [...this.tracks];

    if (query.formatFilter === 'hires_pcm') {
      results = results.filter((t) => !t.isDsd && !t.isAtmos && t.sampleRateHz >= 88200);
    } else if (query.formatFilter === 'dsd') {
      results = results.filter((t) => t.isDsd);
    } else if (query.formatFilter === 'atmos') {
      results = results.filter((t) => t.isAtmos);
    }

    if (query.minDrScore) {
      results = results.filter((t) => t.dynamicRangeDr >= query.minDrScore!);
    }

    if (q.length > 0) {
      const scored = results
        .map((t) => {
          const hay = `${t.title} ${t.artist} ${t.album} ${t.genre} ${t.codec} ${t.musicalKey}`.toLowerCase();
          let score = 0;
          if (hay.includes(q)) score += 10;
          if ((q.includes('late') || q.includes('piano') || q.includes('jazz') || q.includes('acoustic')) && (t.genre.toLowerCase().includes('jazz') || t.genre.toLowerCase().includes('classical'))) {
            score += 6;
          }
          if ((q.includes('spatial') || q.includes('atmos') || q.includes('electronic')) && (t.isAtmos || t.genre.toLowerCase().includes('electronic'))) {
            score += 6;
          }
          if ((q.includes('dynamic') || q.includes('audiophile') || q.includes('master')) && t.dynamicRangeDr >= 14) {
            score += 4;
          }
          return { track: t, score };
        })
        .sort((a, b) => b.score - a.score);
      results = scored.map((s) => s.track);
    }

    return results.slice(0, query.maxTracks).map((t) => ({ ...t }));
  }

  async listTracks(): Promise<TrackSummary[]> {
    return this.tracks.map((t) => ({ ...t }));
  }

  async getLyrics(trackId: string): Promise<LyricsPayload> {
    if (LYRICS_FIXTURES[trackId]) {
      return LYRICS_FIXTURES[trackId];
    }
    const track = this.tracks.find((t) => t.id === trackId);
    return {
      trackId,
      source: 'SQLite lyrics_cache · Mastering Notes',
      cachedInSqlite: true,
      lines: [
        { timeMs: 0, text: `[00:00] ${track?.title ?? 'Track'} — ${track?.codec ?? 'FLAC'} Master` },
        { timeMs: 30000, text: `[00:30] Dynamic Range DR${track?.dynamicRangeDr ?? 14} · Integrated ${track?.integratedLufs ?? -16} LUFS` },
        { timeMs: 85000, text: '[01:25] Instrumental passage — zero clipped inter-sample peaks' },
      ],
    };
  }

  async getSignalPath(): Promise<SignalPathState> {
    return this.buildSignalPath();
  }

  async getSpatialConfig(): Promise<SpatialConfig> {
    return {
      ...this.spatialConfig,
      peqBands: this.spatialConfig.peqBands.map((b) => ({ ...b })),
    };
  }

  async getPlaybackState(): Promise<PlaybackState> {
    return { ...this.playback };
  }

  subscribeTelemetry(cb: (frame: TelemetryFrame) => void): () => void {
    this.telemetryListeners.add(cb);
    this.ensureTelemetryLoop();
    return () => {
      this.telemetryListeners.delete(cb);
      this.stopTelemetryLoopIfIdle();
    };
  }

  subscribeHardwareEvents(cb: (event: HardwareEvent) => void): () => void {
    this.hardwareListeners.add(cb);
    return () => {
      this.hardwareListeners.delete(cb);
    };
  }

  // ---- Realistic Linux Audio Failure Mode & Hotplug Simulations ----

  async setDeviceDsdMode(alsaId: string, dsdMode: DsdCapability): Promise<SignalPathState> {
    const dev = this.devices.find((d) => d.alsaId === alsaId);
    if (dev) {
      dev.dsdCapability = dsdMode;
    }
    this.syncVolumeLock();
    const sp = this.buildSignalPath();
    this.emitSignalPathChanged();
    return sp;
  }

  async simulateUsbDacPlugIn(
    autoSwitch: boolean
  ): Promise<{ device: AudioDeviceInfo; signalPath: SignalPathState }> {
    const plugId = 'hw:CARD=D90III,DEV=0';
    let plugged = this.devices.find((d) => d.alsaId === plugId);
    if (!plugged) {
      plugged = {
        alsaId: plugId,
        shortId: 'hw:ToppingD90',
        cardIndex: 4,
        vendor: 'TOPPING',
        displayName: 'TOPPING D90 III Sabre',
        usbVidPid: '152A:8750 (XMOS XU316)',
        transportType: 'usb',
        supportedSampleRates: [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000],
        supportedBitDepths: [16, 24, 32],
        dsdCapability: 'native',
        maxDsdMultiplier: 512,
        reservationStatus: 'available',
        isIsolatedInternal: false,
        supportsHardwareVolume: true,
        iec958Passthrough: false,
        stream0Path: '/proc/asound/D90III/stream0',
        dacChipset: 'Dual ESS ES9039SPRO · Native DSD512',
      };
      this.devices.splice(2, 0, plugged);
    } else {
      plugged.reservationStatus = 'available';
    }

    this.emitHardwareEvent({
      type: 'DacConnected',
      timestampMs: Date.now(),
      alsaId: plugged.alsaId,
      displayName: plugged.displayName,
      message: autoSwitch
        ? `udev USB DAC plug-in detected: ${plugged.displayName} auto-claimed exclusively.`
        : `udev USB DAC plug-in detected: ${plugged.displayName} ready in DAC Switcher.`,
    });

    let sp: SignalPathState;
    if (autoSwitch) {
      sp = await this.selectAudioDevice(plugged.alsaId, this.exclusiveAlsa, this.bypassLaptopSpeakers);
    } else {
      sp = this.buildSignalPath();
    }

    return { device: { ...plugged }, signalPath: sp };
  }

  async simulateAlsaEbusy(holdingProcess = 'pipewire-pulse (Firefox)', holdingPid = 4182): Promise<SignalPathState> {
    const dev = this.getActiveDevice();
    if (!dev) return this.buildSignalPath();

    dev.reservationStatus = 'busy_other_app';
    dev.holdingProcess = holdingProcess;
    dev.holdingPid = holdingPid;

    this.playback.status = 'halted_hardware_error';
    this.activeError = {
      code: 'ALSA_EBUSY',
      title: 'ALSA Device Busy (EBUSY)',
      message: `${dev.displayName} is currently held exclusively by ${holdingProcess} (PID ${holdingPid}).`,
      technicalDetail: `snd_pcm_open("${dev.alsaId}", SND_PCM_STREAM_PLAYBACK) returned -16 (Device or resource busy).`,
      recoveryActionLabel: 'Claim via D-Bus ReserveDevice1',
      holdingPid,
      holdingProcessName: holdingProcess,
    };

    this.emitHardwareEvent({
      type: 'AlsaDeviceBusy',
      timestampMs: Date.now(),
      alsaId: dev.alsaId,
      holdingProcess,
      holdingPid,
      message: `ALSA EBUSY on ${dev.alsaId} — held by ${holdingProcess} (PID ${holdingPid}).`,
    });
    this.emitSignalPathChanged();
    return this.buildSignalPath();
  }

  async forceClaimDbusReservation(): Promise<SignalPathState> {
    const dev = this.getActiveDevice();
    if (!dev) return this.buildSignalPath();

    dev.reservationStatus = 'reserved_by_aurahifi';
    dev.holdingProcess = undefined;
    dev.holdingPid = undefined;
    this.activeError = null;
    this.playback.status = 'playing';
    this.syncVolumeLock();

    this.emitHardwareEvent({
      type: 'DacConnected',
      timestampMs: Date.now(),
      alsaId: dev.alsaId,
      displayName: dev.displayName,
      message: `D-Bus org.freedesktop.ReserveDevice1.Audio${dev.cardIndex} claimed exclusively for ${dev.displayName}.`,
    });
    this.emitSignalPathChanged();
    return this.buildSignalPath();
  }

  async simulateUsbDacHotUnplug(): Promise<SignalPathState> {
    const dev = this.getActiveDevice();
    if (!dev) return this.buildSignalPath();

    dev.reservationStatus = 'disconnected';
    this.playback.status = 'halted_hardware_error';
    this.activeError = {
      code: 'DAC_HOT_UNPLUGGED',
      title: 'USB DAC Hot-Unplugged — Safe Pause Active',
      message: `${dev.displayName} was removed. Playback halted immediately with zero fallback to Built-in Intel HDA Speakers.`,
      technicalDetail: `udev SUBSYSTEM=sound ACTION=remove on ${dev.alsaId}. Laptop speaker isolation policy enforced.`,
      recoveryActionLabel: 'Reconnect USB DAC',
    };

    this.emitHardwareEvent({
      type: 'DacDisconnectedPaused',
      timestampMs: Date.now(),
      alsaId: dev.alsaId,
      displayName: dev.displayName,
      fallbackToInternalSpeakers: false,
      message: `Safe pause: ${dev.displayName} hot-unplugged. Built-in Intel HDA Speakers strictly blocked.`,
    });
    this.emitSignalPathChanged();
    return this.buildSignalPath();
  }

  async simulateUsbDacReconnect(): Promise<SignalPathState> {
    const dev = this.getActiveDevice();
    if (!dev) return this.buildSignalPath();

    dev.reservationStatus = 'reserved_by_aurahifi';
    this.activeError = null;
    this.playback.status = 'paused';
    this.syncVolumeLock();

    this.emitHardwareEvent({
      type: 'DacConnected',
      timestampMs: Date.now(),
      alsaId: dev.alsaId,
      displayName: dev.displayName,
      message: `${dev.displayName} re-enumerated on ${dev.alsaId}. Press Play when ready.`,
    });
    this.emitSignalPathChanged();
    return this.buildSignalPath();
  }

  private geminiApiKey: string | null = null;
  private geminiKeyUpdatedAtMs: number | null = null;

  async getGeminiApiKeyStatus(): Promise<GeminiApiKeyStatus> {
    return {
      configured: Boolean(this.geminiApiKey),
      maskedKey: this.geminiApiKey
        ? `${this.geminiApiKey.slice(0, 4)}••••${this.geminiApiKey.slice(-4)}`
        : null,
      storageBackend: 'stub_memory',
      updatedAtMs: this.geminiKeyUpdatedAtMs,
    };
  }

  async setGeminiApiKey(apiKey: string): Promise<GeminiApiKeyStatus> {
    const trimmed = apiKey.trim();
    this.geminiApiKey = trimmed.length > 0 ? trimmed : null;
    this.geminiKeyUpdatedAtMs = this.geminiApiKey ? Date.now() : null;
    return this.getGeminiApiKeyStatus();
  }

  async clearGeminiApiKey(): Promise<GeminiApiKeyStatus> {
    this.geminiApiKey = null;
    this.geminiKeyUpdatedAtMs = null;
    return this.getGeminiApiKeyStatus();
  }

  async explainAudioTerm(term: string, _contextJson?: string): Promise<TooltipExplanation> {
    const normalized = term.trim().toLowerCase();
    const glossary: Record<string, { title: string; summary: string; technicalNote: string }> = {
      'alsa exclusive': {
        title: 'ALSA Hardware Exclusive (hw:)',
        summary: 'Streams unmodified PCM/DSD directly to the USB DAC hardware ring buffer.',
        technicalNote: 'Acquires org.freedesktop.ReserveDevice1 via D-Bus so PipeWire releases only the target DAC.',
      },
      'dop': {
        title: 'DSD over PCM (DoP)',
        summary: 'Encapsulates 1-bit DSD frames inside 24-bit PCM containers with 0x05/0xFA markers.',
        technicalNote: 'Bit-exact when software volume is locked at 0.0 dB and zero DSP/SRC is applied.',
      },
      'sofa hrtf': {
        title: 'SOFA HRTF Binaural Rendering',
        summary: 'Convolves 3D spatial objects and channels with head-related transfer functions in-process.',
        technicalNote: 'Executed in Rust (audionimbus / Steam Audio) without relying on PipeWire sofa filter-chain.',
      },
    };
    const hit = glossary[normalized];
    return {
      term,
      title: hit?.title ?? term,
      summary:
        hit?.summary ??
        `Reference audiophile telemetry term (${term}) evaluated by AuraHiFi signal-path diagnostics.`,
      technicalNote:
        hit?.technicalNote ??
        'All signal-path claims reflect verified ALSA/DSP state; never extrapolated.',
      source: this.geminiApiKey ? 'gemini_assisted' : 'builtin_reference',
    };
  }

  async enrichTrackMetadata(
    trackId: string,
    options: MetadataEnrichRequest
  ): Promise<MetadataEnrichResult> {
    const track = this.tracks.find((t) => t.id === trackId);
    return {
      trackId,
      addonId: 'metadata-enricher',
      status: track ? 'matched' : 'not_found',
      acoustIdConfidencePct: track && options.useAcoustId ? 98 : 0,
      mbidRecording: track?.mbidRecording ?? null,
      mbidRelease: track ? '4f39a1c8-80e2-45e0-a611-29b9f1080c41' : null,
      proposedFields: track
        ? {
            album: track.album,
            artist: track.artist,
            genre: track.genre,
            year: String(track.year),
          }
        : {},
      rateLimitNote: options.respectRateLimits
        ? 'MusicBrainz token bucket enforced (<= 1 req/s, 1,050 ms spacing).'
        : 'Rate-limit override ignored by Rust host safety policy (<= 1 req/s enforced).',
      executedAtMs: Date.now(),
    };
  }

  async generatePipeWireConfig(alsaId?: string, ringBufferMb = 128) {
    const dev =
      (alsaId ? this.devices.find((d) => d.alsaId === alsaId) : null) ??
      this.devices.find((d) => d.alsaId === this.activeDeviceId) ??
      this.devices[0] ??
      null;
    return generatePipeWireConfigs(dev, ringBufferMb);
  }

  async simulateMusicBrainz503Backoff(): Promise<{ retryAfterMs: number; attempt: number; message: string }> {
    this.mbBackoffAttempt = (this.mbBackoffAttempt % 4) + 1;
    const retryAfterMs = Math.min(30000, 1500 * Math.pow(2, this.mbBackoffAttempt - 1));
    const message = `MusicBrainz API HTTP 503 Service Unavailable — exponential backoff attempt #${this.mbBackoffAttempt} (Retry-After ${(retryAfterMs / 1000).toFixed(1)}s).`;

    this.emitHardwareEvent({
      type: 'MusicBrainzBackoff',
      timestampMs: Date.now(),
      httpStatus: 503,
      attempt: this.mbBackoffAttempt,
      retryAfterMs,
      message,
    });

    return {
      retryAfterMs,
      attempt: this.mbBackoffAttempt,
      message,
    };
  }
}

/**
 * Runtime environment guard for Tauri v2 on Ubuntu (WebKitGTK 4.1).
 * Accepts an optional global object for deterministic unit testing.
 */
export function isTauriRuntime(
  globalObj: Record<string, unknown> | undefined = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : undefined
): boolean {
  return Boolean(globalObj && '__TAURI_INTERNALS__' in globalObj);
}

/**
 * Factory returning TauriAudioBridge inside Tauri v2 on Ubuntu and MockAudioBridge in browser preview.
 */
export function createAudioBridge(
  globalObj?: Record<string, unknown>
): AudioBridge {
  return isTauriRuntime(globalObj) ? new TauriAudioBridge() : new MockAudioBridge();
}

export const audioBridge: AudioBridge = createAudioBridge();

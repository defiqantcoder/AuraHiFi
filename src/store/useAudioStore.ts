import { create } from 'zustand';
import {
  audioBridge,
  type AddonCatalogItem,
  type AddonPermissions,
  type AudioDeviceInfo,
  type AudioMode,
  type CredentialCheckResult,
  type CredentialStatus,
  type DacProbeReport,
  type DsdCapability,
  type HardwareEvent,
  type LibraryFolder,
  type LyricsPayload,
  type OnboardingStatus,
  type PlaybackState,
  type ScanJobId,
  type ScanProgressEvent,
  type SignalPathState,
  type SmartPlaylistQuery,
  type SpatialConfig,
  type TelemetryFrame,
  type TrackSummary,
  type TransportCommand,
} from '../lib/audioBridge';

export type WorkspaceRoute =
  | 'now-playing'
  | 'library'
  | 'smart-playlists'
  | 'spatial-dsp'
  | 'metadata-workbench'
  | 'addons'
  | 'settings'
  | 'first-run-setup';

export type ContextDrawerType = 'none' | 'dac' | 'lyrics' | 'queue';
export type SignalPathPreviewPreset =
  | 'flac_192'
  | 'dsd256_native'
  | 'atmos_spatial'
  | 'alsa_ebusy';

interface AudioStoreState {
  initialized: boolean;
  activeRoute: WorkspaceRoute;
  sidebarCollapsed: boolean;
  preferredSidebarCollapsed: boolean;
  activeDrawer: ContextDrawerType;
  signalPathInspectorOpen: boolean;
  commandPaletteOpen: boolean;
  smartPlaylistSeedTrackId: string | null;

  // Onboarding & Library Folders
  onboardingCompleted: boolean;
  defaultMusicDirExists: boolean;
  defaultMusicDirPath: string | null;
  libraryFolders: LibraryFolder[];
  scanProgress: ScanProgressEvent | null;

  // Hover Help & Explanations (Phase 4.5)
  hoverHelpEnabled: boolean;
  hoverHelpDelayMs: number;

  // AI & Keyring (Phase 4.5)
  smartPlaylistEngineMode: 'auto' | 'online' | 'offline';
  geminiModel: string;
  credentialStatuses: Record<string, CredentialStatus>;

  // Engine state (sourced exclusively via audioBridge)
  devices: AudioDeviceInfo[];
  tracks: TrackSummary[];
  playback: PlaybackState | null;
  signalPath: SignalPathState | null;
  spatialConfig: SpatialConfig | null;
  addons: AddonCatalogItem[];
  lyricsCache: Record<string, LyricsPayload>;
  dacProbes: Record<string, DacProbeReport>;
  smartPlaylistTracks: TrackSummary[];
  lastScanJob: ScanJobId | null;

  // Policy & Engine settings
  exclusiveAlsaPolicy: boolean;
  bypassLaptopSpeakersPolicy: boolean;
  autoSwitchExternalDacPolicy: boolean;
  safePauseOnDisconnectPolicy: boolean;
  ringBufferMb: number;
  gaplessEnabled: boolean;
  mpris2Enabled: boolean;
  minimizeToTray: boolean;
  preventSleep: boolean;

  // Hardware & IPC event stream
  hardwareEventLog: HardwareEvent[];
  activeHardwareNotice: HardwareEvent | null;
  musicBrainzBackoff: { active: boolean; retryAfterMs: number; attempt: number; message: string } | null;

  // Actions
  init: () => Promise<void>;
  setActiveRoute: (route: WorkspaceRoute) => void;
  toggleSidebar: () => void;
  toggleDrawer: (drawer: Exclude<ContextDrawerType, 'none'>) => void;
  closeDrawer: () => void;
  setSignalPathInspectorOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  dismissHardwareNotice: () => void;

  // Onboarding & Folders
  checkOnboardingStatus: () => Promise<OnboardingStatus>;
  completeOnboarding: (mode?: AudioMode) => Promise<void>;
  pickAndAddFolder: () => Promise<void>;
  addMusicFolder: (path: string) => Promise<void>;
  removeLibraryFolder: (id: string) => Promise<void>;
  toggleFolderWatch: (id: string, watch: boolean) => Promise<void>;
  rescanAllFolders: () => Promise<void>;

  // Hover Help & Preferences
  setHoverHelpEnabled: (enabled: boolean) => void;
  setHoverHelpDelayMs: (delayMs: number) => void;
  setSmartPlaylistEngineMode: (mode: 'auto' | 'online' | 'offline') => void;
  setGeminiModel: (model: string) => void;

  // OS Keyring Credentials
  fetchCredentialStatus: (service: string) => Promise<CredentialStatus>;
  saveCredential: (service: string, secret: string, model?: string) => Promise<void>;
  deleteCredential: (service: string) => Promise<void>;
  testCredential: (service: string, secret?: string) => Promise<CredentialCheckResult>;

  // IPC-backed commands
  selectAudioDevice: (alsaId: string, exclusive?: boolean) => Promise<void>;
  setDeviceDsdMode: (alsaId: string, dsdMode: DsdCapability) => Promise<void>;
  probeDac: (alsaId: string) => Promise<DacProbeReport>;
  setAudioMode: (mode: AudioMode) => Promise<void>;
  updateSpatialConfig: (cfg: SpatialConfig) => Promise<void>;
  sendTransport: (cmd: TransportCommand) => Promise<void>;
  playTrack: (trackId: string) => Promise<void>;
  scanLibrary: (paths: string[]) => Promise<void>;
  installAddon: (id: string, permissions: AddonPermissions) => Promise<void>;
  toggleAddonEnabled: (id: string, enabled: boolean) => Promise<void>;
  generateSmartPlaylist: (query: SmartPlaylistQuery) => Promise<void>;
  loadLyricsForTrack: (trackId: string) => Promise<void>;
  setExclusiveAlsaPolicy: (exclusive: boolean) => Promise<void>;
  setBypassLaptopSpeakersPolicy: (bypass: boolean) => Promise<void>;
  setAutoSwitchExternalDacPolicy: (enabled: boolean) => void;
  setSafePauseOnDisconnectPolicy: (enabled: boolean) => void;
  updateEngineSettings: (
    patch: Partial<{
      ringBufferMb: number;
      gaplessEnabled: boolean;
      mpris2Enabled: boolean;
      minimizeToTray: boolean;
      preventSleep: boolean;
    }>
  ) => void;

  // Diagnostics & Simulation
  simulateUsbDacPlugIn: (autoSwitch?: boolean) => Promise<void>;
  simulateUsbDacHotUnplug: () => Promise<void>;
  simulateUsbDacReconnect: () => Promise<void>;
  simulateAlsaEbusy: () => Promise<void>;
  triggerUsbPlugIn: (autoSwitch?: boolean) => Promise<void>;
  triggerUsbHotUnplug: () => Promise<void>;
  triggerUsbReconnect: () => Promise<void>;
  triggerAlsaEbusy: (holdingProcess?: string, holdingPid?: number) => Promise<void>;
  claimDbusReservation: () => Promise<void>;
  commitAlbumMetadata: (albumId: string, fields: Record<string, string>) => Promise<void>;
  triggerMusicBrainz503: () => Promise<void>;
  launchSimilarAiRadio: (trackId: string) => Promise<void>;
  applySignalPathPreviewPreset: (preset: SignalPathPreviewPreset) => Promise<void>;
  subscribeTelemetry: (cb: (frame: TelemetryFrame) => void) => () => void;
}

let hardwareUnsub: (() => void) | null = null;
let scanProgressUnsub: (() => void) | null = null;

export const useAudioStore = create<AudioStoreState>((set, get) => ({
  initialized: false,
  activeRoute: 'library',
  sidebarCollapsed: false,
  preferredSidebarCollapsed: false,
  activeDrawer: 'none',
  signalPathInspectorOpen: false,
  commandPaletteOpen: false,
  smartPlaylistSeedTrackId: null,

  // Onboarding & Folders
  onboardingCompleted: true,
  defaultMusicDirExists: false,
  defaultMusicDirPath: null,
  libraryFolders: [],
  scanProgress: null,

  // Hover Help & Explanations (default enabled, 300ms delay)
  hoverHelpEnabled:
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('aurahifi_hover_help_enabled') !== 'false'
      : true,
  hoverHelpDelayMs:
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem('aurahifi_hover_help_delay') || 300)
      : 300,

  // AI & Keyring
  smartPlaylistEngineMode:
    typeof localStorage !== 'undefined'
      ? (localStorage.getItem('aurahifi_smart_playlist_engine') as 'auto' | 'online' | 'offline') || 'auto'
      : 'auto',
  geminiModel:
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('aurahifi_gemini_model') || 'gemini-3.8-flash'
      : 'gemini-3.8-flash',
  credentialStatuses: {},

  devices: [],
  tracks: [],
  playback: null,
  signalPath: null,
  spatialConfig: null,
  addons: [],
  lyricsCache: {},
  dacProbes: {},
  smartPlaylistTracks: [],
  lastScanJob: null,

  exclusiveAlsaPolicy: true,
  bypassLaptopSpeakersPolicy: true,
  autoSwitchExternalDacPolicy: true,
  safePauseOnDisconnectPolicy: true,
  ringBufferMb: 128,
  gaplessEnabled: true,
  mpris2Enabled: true,
  minimizeToTray: true,
  preventSleep: true,

  hardwareEventLog: [],
  activeHardwareNotice: null,
  musicBrainzBackoff: null,

  init: async () => {
    if (get().initialized) return;

    const [devices, tracks, playback, signalPath, spatialConfig, addons, onboardingStatus, libraryFolders] =
      await Promise.all([
        audioBridge.listAudioDevices(),
        audioBridge.listTracks(),
        audioBridge.getPlaybackState(),
        audioBridge.getSignalPath(),
        audioBridge.getSpatialConfig(),
        audioBridge.listStoreAddons(),
        audioBridge.getOnboardingStatus(),
        audioBridge.listLibraryFolders(),
      ]);

    const initialLyrics = playback?.currentTrackId
      ? await audioBridge.getLyrics(playback.currentTrackId).catch(() => null)
      : null;

    if (hardwareUnsub) {
      hardwareUnsub();
    }
    hardwareUnsub = audioBridge.subscribeHardwareEvents((event) => {
      set((state) => ({
        hardwareEventLog: [event, ...state.hardwareEventLog].slice(0, 40),
        activeHardwareNotice:
          event.type === 'SignalPathChanged' ? state.activeHardwareNotice : event,
      }));
    });

    if (scanProgressUnsub) {
      scanProgressUnsub();
    }
    scanProgressUnsub = audioBridge.subscribeScanProgress((event) => {
      set({ scanProgress: event });
      if (event.isComplete) {
        Promise.all([audioBridge.listTracks(), audioBridge.listLibraryFolders()]).then(([t, f]) => {
          set({ tracks: t, libraryFolders: f });
        });
      }
    });

    const isFirstRun = !onboardingStatus.completed || libraryFolders.length === 0;

    set({
      initialized: true,
      onboardingCompleted: onboardingStatus.completed,
      defaultMusicDirExists: onboardingStatus.defaultMusicDirExists,
      defaultMusicDirPath: onboardingStatus.defaultMusicDirPath ?? null,
      libraryFolders,
      activeRoute: isFirstRun ? 'first-run-setup' : 'library',
      devices,
      tracks,
      playback,
      signalPath,
      spatialConfig,
      addons,
      smartPlaylistTracks: tracks.slice(0, 4),
      lyricsCache: initialLyrics && playback?.currentTrackId ? { [playback.currentTrackId]: initialLyrics } : {},
    });
  },

  setActiveRoute: (route) =>
    set((s) => ({
      activeRoute: route,
      sidebarCollapsed: route === 'now-playing' ? true : s.preferredSidebarCollapsed,
    })),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      return {
        sidebarCollapsed: next,
        preferredSidebarCollapsed: s.activeRoute === 'now-playing' ? s.preferredSidebarCollapsed : next,
      };
    }),
  toggleDrawer: (drawer) =>
    set((s) => ({
      activeDrawer: s.activeDrawer === drawer ? 'none' : drawer,
      signalPathInspectorOpen: false,
    })),
  closeDrawer: () => set({ activeDrawer: 'none' }),
  setSignalPathInspectorOpen: (open) => set({ signalPathInspectorOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  dismissHardwareNotice: () => set({ activeHardwareNotice: null }),

  // Onboarding & Folders
  checkOnboardingStatus: async () => {
    const status = await audioBridge.getOnboardingStatus();
    set({
      onboardingCompleted: status.completed,
      defaultMusicDirExists: status.defaultMusicDirExists,
      defaultMusicDirPath: status.defaultMusicDirPath ?? null,
    });
    return status;
  },

  completeOnboarding: async (mode?: AudioMode) => {
    await audioBridge.completeOnboarding(mode);
    set({ onboardingCompleted: true, activeRoute: 'library' });
  },

  pickAndAddFolder: async () => {
    const picked = await audioBridge.pickMusicFolder();
    if (!picked || picked.length === 0) return;
    for (const p of picked) {
      await audioBridge.addLibraryFolder(p, true);
    }
    const [folders, tracks] = await Promise.all([
      audioBridge.listLibraryFolders(),
      audioBridge.listTracks(),
    ]);
    set({ libraryFolders: folders, tracks });
  },

  addMusicFolder: async (path: string) => {
    await audioBridge.addLibraryFolder(path, true);
    const [folders, tracks] = await Promise.all([
      audioBridge.listLibraryFolders(),
      audioBridge.listTracks(),
    ]);
    set({ libraryFolders: folders, tracks });
  },

  removeLibraryFolder: async (id: string) => {
    await audioBridge.removeLibraryFolder(id);
    const [folders, tracks] = await Promise.all([
      audioBridge.listLibraryFolders(),
      audioBridge.listTracks(),
    ]);
    set({ libraryFolders: folders, tracks });
  },

  toggleFolderWatch: async (id: string, watch: boolean) => {
    await audioBridge.setLibraryFolderWatch(id, watch);
    const folders = await audioBridge.listLibraryFolders();
    set({ libraryFolders: folders });
  },

  rescanAllFolders: async () => {
    const folders = get().libraryFolders;
    const paths = folders.map((f) => f.path);
    if (paths.length > 0) {
      await audioBridge.scanLibrary(paths);
    }
  },

  // Hover Help & Preferences
  setHoverHelpEnabled: (enabled: boolean) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aurahifi_hover_help_enabled', String(enabled));
    }
    set({ hoverHelpEnabled: enabled });
  },

  setHoverHelpDelayMs: (delayMs: number) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aurahifi_hover_help_delay', String(delayMs));
    }
    set({ hoverHelpDelayMs: delayMs });
  },

  setSmartPlaylistEngineMode: (mode: 'auto' | 'online' | 'offline') => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aurahifi_smart_playlist_engine', mode);
    }
    set({ smartPlaylistEngineMode: mode });
  },

  setGeminiModel: (model: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aurahifi_gemini_model', model);
    }
    set({ geminiModel: model });
  },

  // Keyring Credentials
  fetchCredentialStatus: async (service: string) => {
    const status = await audioBridge.getApiCredentialStatus(service);
    set((s) => ({
      credentialStatuses: { ...s.credentialStatuses, [service]: status },
    }));
    return status;
  },

  saveCredential: async (service: string, secret: string, model?: string) => {
    await audioBridge.setApiCredential(service, secret, model);
    const status = await audioBridge.getApiCredentialStatus(service);
    set((s) => ({
      credentialStatuses: { ...s.credentialStatuses, [service]: status },
    }));
  },

  deleteCredential: async (service: string) => {
    await audioBridge.deleteApiCredential(service);
    const status = await audioBridge.getApiCredentialStatus(service);
    set((s) => ({
      credentialStatuses: { ...s.credentialStatuses, [service]: status },
    }));
  },

  testCredential: async (service: string, secret?: string) => {
    return audioBridge.testApiCredential(service, secret);
  },

  // Standard commands
  selectAudioDevice: async (alsaId, exclusive) => {
    const useExclusive = exclusive ?? get().exclusiveAlsaPolicy;
    const bypassLaptop = get().bypassLaptopSpeakersPolicy;
    const signalPath = await audioBridge.selectAudioDevice(alsaId, useExclusive, bypassLaptop);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  setDeviceDsdMode: async (alsaId, dsdMode) => {
    const signalPath = await audioBridge.setDeviceDsdMode(alsaId, dsdMode);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  probeDac: async (alsaId) => {
    const report = await audioBridge.testDacCapabilities(alsaId);
    set((s) => ({
      dacProbes: { ...s.dacProbes, [alsaId]: report },
    }));
    return report;
  },

  setAudioMode: async (mode) => {
    const signalPath = await audioBridge.setAudioMode(mode);
    set({ signalPath });
  },

  updateSpatialConfig: async (cfg) => {
    const signalPath = await audioBridge.updateSpatialConfig(cfg);
    set({ spatialConfig: cfg, signalPath });
  },

  sendTransport: async (cmd) => {
    const playback = await audioBridge.transportCommand(cmd);
    set({ playback });
  },

  playTrack: async (trackId) => {
    const playback = await audioBridge.transportCommand({ type: 'Play', trackId });
    set({ playback });
    await get().loadLyricsForTrack(trackId);
  },

  scanLibrary: async (paths) => {
    const lastScanJob = await audioBridge.scanLibrary(paths);
    const tracks = await audioBridge.listTracks();
    set({ lastScanJob, tracks });
  },

  installAddon: async (id, permissions) => {
    await audioBridge.installAddon(id, permissions);
    const addons = await audioBridge.listStoreAddons();
    set({ addons });
  },

  toggleAddonEnabled: async (id, enabled) => {
    await audioBridge.toggleAddonEnabled(id, enabled);
    const addons = await audioBridge.listStoreAddons();
    set({ addons });
  },

  generateSmartPlaylist: async (query) => {
    const smartPlaylistTracks = await audioBridge.generateSmartPlaylist(query);
    set({ smartPlaylistTracks });
  },

  loadLyricsForTrack: async (trackId) => {
    if (!trackId || get().lyricsCache[trackId]) return;
    try {
      const payload = await audioBridge.getLyrics(trackId);
      set((s) => ({
        lyricsCache: { ...s.lyricsCache, [trackId]: payload },
      }));
    } catch {
      // Ignored
    }
  },

  setExclusiveAlsaPolicy: async (exclusive) => {
    set({ exclusiveAlsaPolicy: exclusive });
    const currentDevice = get().devices.find((d) => d.alsaId === get().signalPath?.activeDeviceId);
    if (currentDevice) {
      await get().selectAudioDevice(currentDevice.alsaId, exclusive);
    }
  },

  setBypassLaptopSpeakersPolicy: async (bypass) => {
    set({ bypassLaptopSpeakersPolicy: bypass });
    const currentDevice = get().devices.find((d) => d.alsaId === get().signalPath?.activeDeviceId);
    if (currentDevice) {
      await get().selectAudioDevice(currentDevice.alsaId, get().exclusiveAlsaPolicy);
    }
  },

  setAutoSwitchExternalDacPolicy: (enabled) => set({ autoSwitchExternalDacPolicy: enabled }),
  setSafePauseOnDisconnectPolicy: (enabled) => set({ safePauseOnDisconnectPolicy: enabled }),

  updateEngineSettings: (patch) =>
    set((s) => ({
      ringBufferMb: patch.ringBufferMb ?? s.ringBufferMb,
      gaplessEnabled: patch.gaplessEnabled ?? s.gaplessEnabled,
      mpris2Enabled: patch.mpris2Enabled ?? s.mpris2Enabled,
      minimizeToTray: patch.minimizeToTray ?? s.minimizeToTray,
      preventSleep: patch.preventSleep ?? s.preventSleep,
    })),

  simulateUsbDacPlugIn: async (autoSwitch = true) => {
    const { signalPath } = await audioBridge.simulateUsbDacPlugIn(autoSwitch);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({
      devices,
      playback,
      signalPath: autoSwitch ? signalPath : get().signalPath,
    });
    if (autoSwitch) {
      await get().loadLyricsForTrack(playback.currentTrackId);
    }
  },

  triggerUsbPlugIn: async (autoSwitch = true) => {
    await get().simulateUsbDacPlugIn(autoSwitch);
  },

  simulateUsbDacHotUnplug: async () => {
    const signalPath = await audioBridge.simulateUsbDacHotUnplug();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerUsbHotUnplug: async () => {
    await get().simulateUsbDacHotUnplug();
  },

  simulateUsbDacReconnect: async () => {
    const signalPath = await audioBridge.simulateUsbDacReconnect();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerUsbReconnect: async () => {
    await get().simulateUsbDacReconnect();
  },

  simulateAlsaEbusy: async () => {
    const signalPath = await audioBridge.simulateAlsaEbusy('pipewire-pulse (Firefox)', 4182);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerAlsaEbusy: async () => {
    await get().simulateAlsaEbusy();
  },

  claimDbusReservation: async () => {
    const signalPath = await audioBridge.forceClaimDbusReservation();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  commitAlbumMetadata: async (_albumId, _fields) => {
    // Local metadata commit stub
  },

  triggerMusicBrainz503: async () => {
    const res = await audioBridge.simulateMusicBrainz503Backoff();
    set({
      musicBrainzBackoff: {
        active: true,
        retryAfterMs: res.retryAfterMs,
        attempt: res.attempt,
        message: res.message,
      },
    });
  },

  launchSimilarAiRadio: async (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId);
    const smartPlaylistTracks = await audioBridge.generateSmartPlaylist({
      mode: 'bliss_acoustic',
      prompt: track ? `Similar acoustic signature to ${track.artist} — ${track.title}` : 'Similar acoustic radio',
      seedTrackId: trackId,
      formatFilter: 'all',
      maxTracks: 8,
    });
    set((s) => ({
      smartPlaylistSeedTrackId: trackId,
      smartPlaylistTracks,
      activeRoute: 'smart-playlists',
      sidebarCollapsed: s.preferredSidebarCollapsed,
    }));
  },

  applySignalPathPreviewPreset: async (preset) => {
    const bypassLaptop = get().bypassLaptopSpeakersPolicy;
    if (preset === 'flac_192') {
      await audioBridge.forceClaimDbusReservation();
      await audioBridge.selectAudioDevice('hw:CARD=Bifrost2,DEV=0', true, bypassLaptop);
      await audioBridge.setAudioMode('bit_perfect');
      await audioBridge.transportCommand({ type: 'Play', trackId: 'trk-flac-192' });
    } else if (preset === 'dsd256_native') {
      await audioBridge.forceClaimDbusReservation();
      await audioBridge.selectAudioDevice('hw:CARD=iFiAudio,DEV=0', true, bypassLaptop);
      await audioBridge.setDeviceDsdMode('hw:CARD=iFiAudio,DEV=0', 'native');
      await audioBridge.setAudioMode('bit_perfect');
      await audioBridge.transportCommand({ type: 'Play', trackId: 'trk-dsd-256' });
    } else if (preset === 'atmos_spatial') {
      await audioBridge.forceClaimDbusReservation();
      await audioBridge.selectAudioDevice('hw:CARD=Bifrost2,DEV=0', true, bypassLaptop);
      await audioBridge.setAudioMode('spatial');
      await audioBridge.transportCommand({ type: 'Play', trackId: 'trk-atmos-714' });
    } else if (preset === 'alsa_ebusy') {
      await audioBridge.simulateAlsaEbusy('pipewire-pulse (Firefox)', 4182);
    }

    const [devices, playback, signalPath] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
      audioBridge.getSignalPath(),
    ]);
    set({ devices, playback, signalPath });
    if (playback?.currentTrackId) {
      await get().loadLyricsForTrack(playback.currentTrackId);
    }
  },

  subscribeTelemetry: (cb) => audioBridge.subscribeTelemetry(cb),
}));

import { create } from 'zustand';
import {
  audioBridge,
  type AddonCatalogItem,
  type AddonPermissions,
  type AudioDeviceInfo,
  type AudioMode,
  type DacProbeReport,
  type DsdCapability,
  type HardwareEvent,
  type LyricsPayload,
  type PlaybackState,
  type ScanJobId,
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
  | 'settings';

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
  commitAlbumMetadata: (oldAlbum: string, updates: { album?: string; artist?: string; year?: number; genre?: string }) => void;

  // Linux Hardware Fault & Edge-Case Simulation Actions
  triggerUsbPlugIn: () => Promise<void>;
  triggerAlsaEbusy: () => Promise<void>;
  claimDbusReservation: () => Promise<void>;
  triggerUsbHotUnplug: () => Promise<void>;
  triggerUsbReconnect: () => Promise<void>;
  triggerMusicBrainz503: () => Promise<void>;
  launchSimilarAiRadio: (trackId: string) => Promise<void>;
  applySignalPathPreviewPreset: (preset: SignalPathPreviewPreset) => Promise<void>;

  // Zero-reflow 60 fps canvas telemetry subscription passthrough
  subscribeTelemetry: (cb: (frame: TelemetryFrame) => void) => () => void;
}

let hardwareUnsub: (() => void) | null = null;

export const useAudioStore = create<AudioStoreState>((set, get) => ({
  initialized: false,
  activeRoute: 'now-playing',
  sidebarCollapsed: true,
  preferredSidebarCollapsed: false,
  activeDrawer: 'none',
  signalPathInspectorOpen: false,
  commandPaletteOpen: false,
  smartPlaylistSeedTrackId: null,

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

    const [devices, tracks, playback, signalPath, spatialConfig, addons] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.listTracks(),
      audioBridge.getPlaybackState(),
      audioBridge.getSignalPath(),
      audioBridge.getSpatialConfig(),
      audioBridge.listStoreAddons(),
    ]);

    const initialLyrics = await audioBridge.getLyrics(playback.currentTrackId);

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

    set({
      initialized: true,
      devices,
      tracks,
      playback,
      signalPath,
      spatialConfig,
      addons,
      smartPlaylistTracks: tracks.slice(0, 4),
      lyricsCache: { [playback.currentTrackId]: initialLyrics },
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
    // Immediate optimistic transition state for snappy 240ms feedback
    const currentSp = get().signalPath;
    if (currentSp) {
      set({
        signalPath: {
          ...currentSp,
          isTransitioning: true,
        },
      });
    }
    const signalPath = await audioBridge.setAudioMode(mode);
    const playback = await audioBridge.getPlaybackState();
    set({ signalPath, playback });
  },

  updateSpatialConfig: async (cfg) => {
    const signalPath = await audioBridge.updateSpatialConfig(cfg);
    const [spatialConfig, playback] = await Promise.all([
      audioBridge.getSpatialConfig(),
      audioBridge.getPlaybackState(),
    ]);
    set({ spatialConfig, signalPath, playback });
  },

  sendTransport: async (cmd) => {
    const playback = await audioBridge.transportCommand(cmd);
    const signalPath = await audioBridge.getSignalPath();
    set({ playback, signalPath });
    if (cmd.type === 'Next' || cmd.type === 'Prev' || (cmd.type === 'Play' && cmd.trackId)) {
      await get().loadLyricsForTrack(playback.currentTrackId);
    }
  },

  playTrack: async (trackId) => {
    const playback = await audioBridge.transportCommand({ type: 'Play', trackId });
    const signalPath = await audioBridge.getSignalPath();
    set({ playback, signalPath });
    await get().loadLyricsForTrack(playback.currentTrackId);
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
    if (get().lyricsCache[trackId]) return;
    const payload = await audioBridge.getLyrics(trackId);
    set((s) => ({
      lyricsCache: { ...s.lyricsCache, [trackId]: payload },
    }));
  },

  setExclusiveAlsaPolicy: async (exclusive) => {
    set({ exclusiveAlsaPolicy: exclusive });
    const activeId = get().signalPath?.activeDeviceId;
    if (activeId) {
      await get().selectAudioDevice(activeId, exclusive);
    }
  },

  setBypassLaptopSpeakersPolicy: async (bypass) => {
    set({ bypassLaptopSpeakersPolicy: bypass });
    const activeId = get().signalPath?.activeDeviceId;
    if (activeId) {
      const sp = await audioBridge.selectAudioDevice(activeId, get().exclusiveAlsaPolicy, bypass);
      set({ signalPath: sp });
    }
  },

  setAutoSwitchExternalDacPolicy: (enabled) => set({ autoSwitchExternalDacPolicy: enabled }),
  setSafePauseOnDisconnectPolicy: (enabled) => set({ safePauseOnDisconnectPolicy: enabled }),
  updateEngineSettings: (patch) => set((s) => ({ ...s, ...patch })),

  commitAlbumMetadata: (oldAlbum, updates) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.album === oldAlbum
          ? {
              ...t,
              album: updates.album ?? t.album,
              artist: updates.artist ?? t.artist,
              year: updates.year ?? t.year,
              genre: updates.genre ?? t.genre,
            }
          : t
      ),
    })),

  triggerUsbPlugIn: async () => {
    const { signalPath } = await audioBridge.simulateUsbDacPlugIn(get().autoSwitchExternalDacPolicy);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerAlsaEbusy: async () => {
    const signalPath = await audioBridge.simulateAlsaEbusy('pipewire-pulse (Firefox)', 4182);
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  claimDbusReservation: async () => {
    const signalPath = await audioBridge.forceClaimDbusReservation();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerUsbHotUnplug: async () => {
    const signalPath = await audioBridge.simulateUsbDacHotUnplug();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
  },

  triggerUsbReconnect: async () => {
    const signalPath = await audioBridge.simulateUsbDacReconnect();
    const [devices, playback] = await Promise.all([
      audioBridge.listAudioDevices(),
      audioBridge.getPlaybackState(),
    ]);
    set({ signalPath, devices, playback });
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
    await get().loadLyricsForTrack(playback.currentTrackId);
  },

  subscribeTelemetry: (cb) => audioBridge.subscribeTelemetry(cb),
}));

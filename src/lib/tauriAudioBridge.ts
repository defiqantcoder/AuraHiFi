/**
 * Tauri v2 Native IPC AudioBridge Implementation (Ubuntu 24.04 / 26.04 LTS)
 *
 * ARCHITECTURAL GUARANTEES:
 * - Zero static imports of `@tauri-apps/api/*` so Vite browser preview builds
 *   never require `@tauri-apps/api` to be bundled or installed in browser mode.
 * - Uses lazy dynamic imports of `@tauri-apps/api/core` (`invoke`, `Channel`)
 *   exclusively when running inside a Tauri v2 WebView (`'__TAURI_INTERNALS__' in window`).
 * - Implements the exact `AudioBridge` TypeScript contract matching `src-tauri/src/commands.rs`.
 */

import type {
  AddonCatalogItem,
  AddonPermissions,
  AudioBridge,
  AudioDeviceInfo,
  AudioMode,
  CredentialCheckResult,
  CredentialStatus,
  DacProbeReport,
  DsdCapability,
  GeminiApiKeyStatus,
  HardwareEvent,
  InstalledAddon,
  LibraryFolder,
  LyricsPayload,
  MetadataEnrichRequest,
  MetadataEnrichResult,
  OnboardingStatus,
  PlaybackState,
  ScanJobId,
  ScanProgressEvent,
  SignalPathState,
  SmartPlaylistQuery,
  SpatialConfig,
  TelemetryFrame,
  TooltipExplanation,
  TrackSummary,
  TransportCommand,
} from './audioBridge';

interface TauriChannelLike<T> {
  onmessage: ((message: T) => void) | null;
}

interface TauriCoreModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  Channel: new <T>() => TauriChannelLike<T>;
}

let cachedTauriCorePromise: Promise<TauriCoreModule> | null = null;

async function loadTauriCore(): Promise<TauriCoreModule> {
  if (!cachedTauriCorePromise) {
    cachedTauriCorePromise = import('@tauri-apps/api/core') as Promise<TauriCoreModule>;
  }
  return cachedTauriCorePromise;
}

export class TauriAudioBridge implements AudioBridge {
  private async invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await loadTauriCore();
    return invoke<T>(cmd, args);
  }

  listAudioDevices(): Promise<AudioDeviceInfo[]> {
    return this.invokeCmd<AudioDeviceInfo[]>('list_audio_devices');
  }

  selectAudioDevice(
    alsaId: string,
    exclusive: boolean,
    bypassLaptop: boolean
  ): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('select_audio_device', {
      alsaId,
      exclusive,
      bypassLaptop,
    });
  }

  testDacCapabilities(alsaId: string): Promise<DacProbeReport> {
    return this.invokeCmd<DacProbeReport>('test_dac_capabilities', { alsaId });
  }

  setAudioMode(mode: AudioMode): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('set_audio_mode', { mode });
  }

  updateSpatialConfig(cfg: SpatialConfig): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('update_spatial_config', { cfg });
  }

  transportCommand(cmd: TransportCommand): Promise<PlaybackState> {
    return this.invokeCmd<PlaybackState>('transport_command', { cmd });
  }

  scanLibrary(paths: string[]): Promise<ScanJobId> {
    return this.invokeCmd<ScanJobId>('scan_library', { paths });
  }

  async pickMusicFolder(): Promise<string[] | null> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: true,
        title: 'Select Music Folders',
      });
      if (!selected) return null;
      return Array.isArray(selected) ? selected : [selected];
    } catch (err) {
      console.warn('Native folder picker error or fallback:', err);
      return null;
    }
  }

  getOnboardingStatus(): Promise<OnboardingStatus> {
    return this.invokeCmd<OnboardingStatus>('get_onboarding_status');
  }

  completeOnboarding(audioMode?: AudioMode): Promise<void> {
    return this.invokeCmd<void>('complete_onboarding', { audioMode });
  }

  listLibraryFolders(): Promise<LibraryFolder[]> {
    return this.invokeCmd<LibraryFolder[]>('list_library_folders');
  }

  addLibraryFolder(path: string, autoWatch?: boolean): Promise<LibraryFolder> {
    return this.invokeCmd<LibraryFolder>('add_library_folder', { path, autoWatch });
  }

  removeLibraryFolder(id: string): Promise<void> {
    return this.invokeCmd<void>('remove_library_folder', { id });
  }

  setLibraryFolderWatch(id: string, autoWatch: boolean): Promise<void> {
    return this.invokeCmd<void>('set_library_folder_watch', { id, autoWatch });
  }

  subscribeScanProgress(cb: (event: ScanProgressEvent) => void): () => void {
    let active = true;
    let subscriptionId: string | null = null;

    loadTauriCore()
      .then(async ({ invoke, Channel }) => {
        if (!active) return;
        const channel = new Channel<ScanProgressEvent>();
        channel.onmessage = (event) => {
          if (active) cb(event);
        };
        subscriptionId = await invoke<string>('subscribe_scan_progress', {
          onProgress: channel,
        });
      })
      .catch(() => {});

    return () => {
      active = false;
      if (subscriptionId) {
        const id = subscriptionId;
        subscriptionId = null;
        void this.invokeCmd<void>('unsubscribe_scan_progress', { subscriptionId: id }).catch(() => {});
      }
    };
  }

  setApiCredential(service: string, secret: string, model?: string): Promise<void> {
    return this.invokeCmd<void>('set_api_credential', { service, secret, model });
  }

  getApiCredentialStatus(service: string): Promise<CredentialStatus> {
    return this.invokeCmd<CredentialStatus>('get_api_credential_status', { service });
  }

  deleteApiCredential(service: string): Promise<void> {
    return this.invokeCmd<void>('delete_api_credential', { service });
  }

  testApiCredential(service: string, secret?: string): Promise<CredentialCheckResult> {
    return this.invokeCmd<CredentialCheckResult>('test_api_credential', { service, secret });
  }

  listStoreAddons(): Promise<AddonCatalogItem[]> {
    return this.invokeCmd<AddonCatalogItem[]>('list_store_addons');
  }

  installAddon(id: string, approvedPermissions: AddonPermissions): Promise<InstalledAddon> {
    return this.invokeCmd<InstalledAddon>('install_addon', {
      id,
      approvedPermissions,
    });
  }

  toggleAddonEnabled(id: string, enabled: boolean): Promise<AddonCatalogItem> {
    return this.invokeCmd<AddonCatalogItem>('toggle_addon_enabled', { id, enabled });
  }

  runAddonAction(addonId: string, action: string, payloadJson: string): Promise<string> {
    return this.invokeCmd<string>('run_addon_action', {
      addonId,
      action,
      payloadJson,
    });
  }

  generateSmartPlaylist(query: SmartPlaylistQuery): Promise<TrackSummary[]> {
    return this.invokeCmd<TrackSummary[]>('generate_smart_playlist', { query });
  }

  listTracks(): Promise<TrackSummary[]> {
    return this.invokeCmd<TrackSummary[]>('list_tracks');
  }

  getLyrics(trackId: string): Promise<LyricsPayload> {
    return this.invokeCmd<LyricsPayload>('get_lyrics', { trackId });
  }

  getSignalPath(): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('get_signal_path');
  }

  getSpatialConfig(): Promise<SpatialConfig> {
    return this.invokeCmd<SpatialConfig>('get_spatial_config');
  }

  getPlaybackState(): Promise<PlaybackState> {
    return this.invokeCmd<PlaybackState>('get_playback_state');
  }

  subscribeTelemetry(cb: (frame: TelemetryFrame) => void): () => void {
    let active = true;
    let subscriptionId: string | null = null;

    void loadTauriCore()
      .then(async ({ invoke, Channel }) => {
        if (!active) return;
        const channel = new Channel<TelemetryFrame>();
        channel.onmessage = (frame) => {
          if (active) {
            cb(frame);
          }
        };
        subscriptionId = await invoke<string>('subscribe_telemetry', {
          onFrame: channel,
        });
        if (!active && subscriptionId) {
          await invoke<void>('unsubscribe_telemetry', { subscriptionId });
        }
      })
      .catch(() => {
        // Subscription cleanup if Tauri runtime tears down during window unload
      });

    return () => {
      active = false;
      if (subscriptionId) {
        const idToRelease = subscriptionId;
        subscriptionId = null;
        void this.invokeCmd<void>('unsubscribe_telemetry', {
          subscriptionId: idToRelease,
        }).catch(() => {});
      }
    };
  }

  subscribeHardwareEvents(cb: (event: HardwareEvent) => void): () => void {
    let active = true;
    let subscriptionId: string | null = null;

    void loadTauriCore()
      .then(async ({ invoke, Channel }) => {
        if (!active) return;
        const channel = new Channel<HardwareEvent>();
        channel.onmessage = (event) => {
          if (active) {
            cb(event);
          }
        };
        subscriptionId = await invoke<string>('subscribe_hardware_events', {
          onEvent: channel,
        });
        if (!active && subscriptionId) {
          await invoke<void>('unsubscribe_hardware_events', { subscriptionId });
        }
      })
      .catch(() => {
        // Subscription cleanup if Tauri runtime tears down during window unload
      });

    return () => {
      active = false;
      if (subscriptionId) {
        const idToRelease = subscriptionId;
        subscriptionId = null;
        void this.invokeCmd<void>('unsubscribe_hardware_events', {
          subscriptionId: idToRelease,
        }).catch(() => {});
      }
    };
  }

  setDeviceDsdMode(alsaId: string, dsdMode: DsdCapability): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('set_device_dsd_mode', { alsaId, dsdMode });
  }

  simulateUsbDacPlugIn(
    autoSwitch: boolean
  ): Promise<{ device: AudioDeviceInfo; signalPath: SignalPathState }> {
    return this.invokeCmd<{ device: AudioDeviceInfo; signalPath: SignalPathState }>(
      'simulate_usb_dac_plug_in',
      { autoSwitch }
    );
  }

  simulateAlsaEbusy(holdingProcess?: string, holdingPid?: number): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('simulate_alsa_ebusy', {
      holdingProcess,
      holdingPid,
    });
  }

  forceClaimDbusReservation(): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('force_claim_dbus_reservation');
  }

  simulateUsbDacHotUnplug(): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('simulate_usb_dac_hot_unplug');
  }

  simulateUsbDacReconnect(): Promise<SignalPathState> {
    return this.invokeCmd<SignalPathState>('simulate_usb_dac_reconnect');
  }

  getGeminiApiKeyStatus(): Promise<GeminiApiKeyStatus> {
    return this.invokeCmd<GeminiApiKeyStatus>('get_gemini_api_key_status');
  }

  setGeminiApiKey(apiKey: string): Promise<GeminiApiKeyStatus> {
    return this.invokeCmd<GeminiApiKeyStatus>('set_gemini_api_key', { apiKey });
  }

  clearGeminiApiKey(): Promise<GeminiApiKeyStatus> {
    return this.invokeCmd<GeminiApiKeyStatus>('clear_gemini_api_key');
  }

  explainAudioTerm(term: string, contextJson?: string): Promise<TooltipExplanation> {
    return this.invokeCmd<TooltipExplanation>('explain_audio_term', { term, contextJson });
  }

  enrichTrackMetadata(
    trackId: string,
    options: MetadataEnrichRequest
  ): Promise<MetadataEnrichResult> {
    return this.invokeCmd<MetadataEnrichResult>('enrich_track_metadata', { trackId, options });
  }

  generatePipeWireConfig(
    alsaId?: string,
    ringBufferMb?: number
  ): Promise<{
    pipewireFilePath: string;
    pipewireContent: string;
    wireplumberFilePath: string;
    wireplumberContent: string;
  }> {
    return this.invokeCmd('generate_pipewire_config', { alsaId, ringBufferMb });
  }

  simulateMusicBrainz503Backoff(): Promise<{
    retryAfterMs: number;
    attempt: number;
    message: string;
  }> {
    return this.invokeCmd<{ retryAfterMs: number; attempt: number; message: string }>(
      'simulate_musicbrainz_503_backoff'
    );
  }
}

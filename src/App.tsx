import { useEffect } from 'react';
import { useAudioStore } from './store/useAudioStore';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { LeftNavigationRail } from './components/LeftNavigationRail';
import { TransportBar } from './components/TransportBar';
import { ContextDrawer } from './components/ContextDrawer';
import { SignalPathPopover } from './components/transport/SignalPathPopover';
import { CommandPalette } from './components/CommandPalette';
import { HardwareAlertBanner } from './components/HardwareAlertBanner';
import { NowPlayingView } from './views/NowPlayingView';
import { LibraryView } from './views/LibraryView';
import { SmartPlaylistView } from './views/SmartPlaylistView';
import { MetadataWorkbenchView } from './views/MetadataWorkbenchView';
import { SpatialStudioView } from './views/SpatialStudioView';
import { AddOnStoreView } from './views/AddOnStoreView';
import { SettingsView } from './views/SettingsView';
import { FirstRunSetupView } from './views/FirstRunSetupView';

export default function App() {
  const initialized = useAudioStore((s) => s.initialized);
  const init = useAudioStore((s) => s.init);
  const activeRoute = useAudioStore((s) => s.activeRoute);
  const signalPath = useAudioStore((s) => s.signalPath);

  useGlobalKeyboardShortcuts();

  useEffect(() => {
    void init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0B0D10] text-[#F2F4F8]">
        <div className="rounded-[14px] border border-[#2B3342] bg-[#14181F] px-6 py-4 text-center">
          <div className="font-display text-lg font-semibold">AuraHiFi</div>
          <p className="mt-1 mono-telemetry text-xs text-[#9AA4B2]">
            Initializing AudioBridge &amp; ALSA endpoints...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-audio-mode={signalPath?.mode ?? 'bit_perfect'}
      data-signal-integrity={signalPath?.integrity ?? 'bit_perfect'}
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0D10] text-[#F2F4F8]"
    >
      {/* Upper 3-Zone Workspace Area: Left Rail + Fluid Main + Optional Right Context Drawer */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftNavigationRail />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0D10]">
          <HardwareAlertBanner />
          <main className="min-w-0 flex-1 overflow-y-auto p-6">
            {activeRoute === 'now-playing' && <NowPlayingView />}
            {activeRoute === 'library' && <LibraryView />}
            {activeRoute === 'metadata-workbench' && <MetadataWorkbenchView />}
            {activeRoute === 'smart-playlists' && <SmartPlaylistView />}
            {activeRoute === 'spatial-dsp' && <SpatialStudioView />}
            {activeRoute === 'addons' && <AddOnStoreView />}
            {activeRoute === 'settings' && <SettingsView />}
            {activeRoute === 'first-run-setup' && <FirstRunSetupView />}
          </main>
        </div>

        <ContextDrawer />
      </div>

      {/* Persistent 88px Bottom Transport & Telemetry Bar */}
      <TransportBar />

      {/* Floating Signal Path Inspector Popover & Ctrl+K Command Palette */}
      <SignalPathPopover />
      <CommandPalette />
    </div>
  );
}

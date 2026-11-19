import {
  AudioWaveform,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Disc3,
  HelpCircle,
  Package,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
} from 'lucide-react';
import { useAudioStore, type WorkspaceRoute } from '../store/useAudioStore';
import { formatSampleRate } from '../lib/signalPathEngine';

interface NavItem {
  id: WorkspaceRoute;
  label: string;
  icon: typeof Disc3;
  accent?: 'emerald' | 'cyan';
  hasUpdateDot?: boolean;
}

export function LeftNavigationRail() {
  const activeRoute = useAudioStore((s) => s.activeRoute);
  const setActiveRoute = useAudioStore((s) => s.setActiveRoute);
  const sidebarCollapsed = useAudioStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAudioStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useAudioStore((s) => s.setCommandPaletteOpen);
  const toggleDrawer = useAudioStore((s) => s.toggleDrawer);
  const activeDrawer = useAudioStore((s) => s.activeDrawer);
  const devices = useAudioStore((s) => s.devices);
  const signalPath = useAudioStore((s) => s.signalPath);
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const addons = useAudioStore((s) => s.addons);
  const hoverHelpEnabled = useAudioStore((s) => s.hoverHelpEnabled);
  const setHoverHelpEnabled = useAudioStore((s) => s.setHoverHelpEnabled);

  const hasAddonUpdates = addons.some((a) => a.hasUpdate);
  const activeDevice = devices.find((d) => d.alsaId === signalPath?.activeDeviceId) ?? devices[0] ?? null;
  const currentTrack = tracks.find((t) => t.id === playback?.currentTrackId) ?? tracks[0] ?? null;

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Library',
      items: [
        { id: 'now-playing', label: 'Now Playing', icon: AudioWaveform, accent: 'emerald' },
        { id: 'library', label: 'Master Library', icon: Disc3 },
        { id: 'metadata-workbench', label: 'Metadata Workbench', icon: Tags, accent: 'cyan' },
      ],
    },
    {
      title: 'Intelligence & DSP',
      items: [
        { id: 'smart-playlists', label: 'AI Smart Playlists', icon: Sparkles, accent: 'cyan' },
        { id: 'spatial-dsp', label: 'Spatial & DSP Studio', icon: SlidersHorizontal, accent: 'cyan' },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'addons', label: 'Add-On Store', icon: Package, hasUpdateDot: hasAddonUpdates },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const integrity = signalPath?.integrity ?? 'bit_perfect';
  const dacStatusColor =
    integrity === 'error_halted'
      ? 'text-[#EF4444]'
      : integrity === 'warning_fallback'
      ? 'text-[#F59E0B]'
      : integrity === 'spatial_dsp'
      ? 'text-[#38BDF8]'
      : 'text-[#10B981]';

  const dacDotColor =
    integrity === 'error_halted'
      ? 'bg-[#EF4444]'
      : integrity === 'warning_fallback'
      ? 'bg-[#F59E0B]'
      : integrity === 'spatial_dsp'
      ? 'bg-[#38BDF8]'
      : 'bg-[#10B981]';

  return (
    <aside
      aria-label="Primary Studio Navigation"
      className={`flex h-full shrink-0 flex-col border-r border-[#2B3342] bg-[#14181F] transition-[width] duration-150 ease-out ${
        sidebarCollapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Top Brand Header & Collapse Control */}
      <div className="flex h-16 items-center justify-between border-b border-[#2B3342] px-4">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[#2B3342] bg-[#0B0D10]">
              <AudioWaveform className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-[#F2F4F8] whitespace-nowrap">
              AuraHiFi
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-[6px] border border-[#2B3342] bg-[#0B0D10]">
            <AudioWaveform className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
          </div>
        )}
        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse navigation rail"
            title="Collapse sidebar (72px)"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] transition-colors duration-150 hover:bg-[#1C222D] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {sidebarCollapsed && (
        <div className="flex justify-center border-b border-[#2B3342] py-2">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Expand navigation rail"
            title="Expand sidebar (240px)"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#9AA4B2] transition-colors duration-150 hover:bg-[#1C222D] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Ctrl+K Search Trigger */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Search library, DACs, and commands (Ctrl+K)"
          className={`flex w-full items-center rounded-[8px] border border-[#2B3342] bg-[#0B0D10] text-sm text-[#9AA4B2] transition-colors duration-150 hover:border-[#3E495E] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
            sidebarCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
          }`}
        >
          <span className="flex items-center gap-2 overflow-hidden">
            <Search className="h-4 w-4 shrink-0 text-[#9AA4B2]" aria-hidden="true" />
            {!sidebarCollapsed && <span className="truncate text-[13px]">Search...</span>}
          </span>
          {!sidebarCollapsed && (
            <kbd className="mono-telemetry rounded-[4px] border border-[#2B3342] bg-[#14181F] px-1.5 py-0.5 text-[11px] text-[#9AA4B2]">
              Ctrl+K
            </kbd>
          )}
        </button>
      </div>

      {/* Navigation Sections */}
      <nav aria-label="Workspace Views" className="flex-1 space-y-5 overflow-y-auto px-3 py-1">
        {navGroups.map((group) => (
          <div key={group.title}>
            {!sidebarCollapsed && (
              <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                {group.title}
              </div>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute === item.id;
                const activeIconColor =
                  item.accent === 'cyan'
                    ? 'text-[#38BDF8]'
                    : item.accent === 'emerald'
                    ? 'text-[#10B981]'
                    : 'text-[#F2F4F8]';

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setActiveRoute(item.id)}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={`group relative flex w-full items-center rounded-[8px] text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
                        sidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-2.5 py-2'
                      } ${
                        isActive
                          ? 'bg-[#1C222D] text-[#F2F4F8] border border-[#2B3342]'
                          : 'border border-transparent text-[#9AA4B2] hover:bg-[#1C222D]/60 hover:text-[#F2F4F8]'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${isActive ? activeIconColor : 'text-[#9AA4B2] group-hover:text-[#F2F4F8]'}`}
                        aria-hidden="true"
                      />
                      {!sidebarCollapsed && (
                        <span className="truncate whitespace-nowrap">{item.label}</span>
                      )}
                      {item.hasUpdateDot && (
                        <span
                          title="1 verified add-on update available"
                          aria-label="Update available"
                          className={`h-2 w-2 shrink-0 rounded-full bg-[#38BDF8] ${
                            sidebarCollapsed ? 'absolute top-2 right-2' : 'ml-auto'
                          }`}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Hover Help Quick Toggle */}
      <div className="border-t border-[#2B3342] px-3 py-2">
        {sidebarCollapsed ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setHoverHelpEnabled(!hoverHelpEnabled)}
              title={`Hover Help: ${hoverHelpEnabled ? 'ON' : 'OFF'}`}
              className={`p-1.5 rounded transition-colors ${
                hoverHelpEnabled ? 'text-[#10B981]' : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
              }`}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-[#9AA4B2]">
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Hover Help</span>
            </div>
            <button
              type="button"
              onClick={() => setHoverHelpEnabled(!hoverHelpEnabled)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                hoverHelpEnabled
                  ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                  : 'bg-[#1C222D] text-[#9AA4B2] border border-[#2B3342]'
              }`}
            >
              {hoverHelpEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>

      {/* Pinned Active DAC Card at Bottom */}
      <div className="border-t border-[#2B3342] p-3">
        <button
          type="button"
          onClick={() => toggleDrawer('dac')}
          aria-expanded={activeDrawer === 'dac'}
          aria-label={`Active DAC: ${activeDevice?.displayName ?? 'None'}. Open DAC Switcher`}
          title={
            sidebarCollapsed
              ? `Active DAC: ${activeDevice?.displayName ?? 'None'} (${activeDevice?.alsaId ?? ''})`
              : 'Open DAC Hardware Switcher'
          }
          className={`w-full rounded-[10px] border text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
            activeDrawer === 'dac'
              ? 'border-[#38BDF8] bg-[#1C222D]'
              : 'border-[#2B3342] bg-[#1C222D] hover:border-[#3E495E]'
          } ${sidebarCollapsed ? 'flex flex-col items-center justify-center p-2.5' : 'p-3'}`}
        >
          {sidebarCollapsed ? (
            <div className="relative flex items-center justify-center">
              <Cpu className={`h-5 w-5 ${dacStatusColor}`} aria-hidden="true" />
              <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${dacDotColor}`} />
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                  Active DAC
                </span>
                <span className={`flex items-center gap-1.5 mono-telemetry text-[11px] ${dacStatusColor}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${dacDotColor}`} aria-hidden="true" />
                  {integrity === 'error_halted'
                    ? 'HALTED'
                    : integrity === 'warning_fallback'
                    ? 'FALLBACK'
                    : signalPath?.pipewireBypassed
                    ? 'ALSA EXCL'
                    : 'PIPEWIRE'}
                </span>
              </div>

              <div className="truncate font-display text-[13px] font-semibold text-[#F2F4F8]">
                {activeDevice?.displayName ?? 'No Device'}
              </div>

              <div className="mt-1 truncate mono-telemetry text-[11px] text-[#9AA4B2]">
                {activeDevice?.alsaId ?? 'hw:CARD=none'}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-[#2B3342] pt-2 text-[11px]">
                <span className="mono-telemetry text-[#F2F4F8]">
                  {currentTrack
                    ? currentTrack.isDsd
                      ? formatSampleRate(currentTrack.sampleRateHz, true, currentTrack.dsdRateMultiplier)
                      : `${formatSampleRate(currentTrack.sampleRateHz)} / ${currentTrack.bitDepth}b`
                    : '—'}
                </span>
                <span className="mono-telemetry text-[#9AA4B2]">
                  {signalPath?.isVolumeLocked ? '0.0 dB' : 'DSP VOL'}
                </span>
              </div>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

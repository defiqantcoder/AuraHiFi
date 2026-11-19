import { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Disc3, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import { useAudioStore, type WorkspaceRoute } from '../store/useAudioStore';
import { formatSampleRate } from '../lib/signalPathEngine';

export function CommandPalette() {
  const open = useAudioStore((s) => s.commandPaletteOpen);
  const setOpen = useAudioStore((s) => s.setCommandPaletteOpen);
  const tracks = useAudioStore((s) => s.tracks);
  const devices = useAudioStore((s) => s.devices);
  const playTrack = useAudioStore((s) => s.playTrack);
  const selectAudioDevice = useAudioStore((s) => s.selectAudioDevice);
  const setActiveRoute = useAudioStore((s) => s.setActiveRoute);
  const triggerAlsaEbusy = useAudioStore((s) => s.triggerAlsaEbusy);
  const triggerUsbHotUnplug = useAudioStore((s) => s.triggerUsbHotUnplug);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const matchedTracks = useMemo(
    () =>
      tracks.filter(
        (t) =>
          !q ||
          `${t.title} ${t.artist} ${t.album} ${t.codec} ${t.genre}`.toLowerCase().includes(q)
      ),
    [tracks, q]
  );

  const matchedDevices = useMemo(
    () =>
      devices.filter(
        (d) => !q || `${d.displayName} ${d.alsaId} ${d.vendor} ${d.dacChipset}`.toLowerCase().includes(q)
      ),
    [devices, q]
  );

  const allQuickViews: { id: WorkspaceRoute; label: string }[] = [
    { id: 'now-playing', label: 'Go to Now Playing Studio' },
    { id: 'library', label: 'Go to Master Library' },
    { id: 'metadata-workbench', label: 'Go to Metadata Enricher & Tag Diff Workbench' },
    { id: 'smart-playlists', label: 'Go to AI Smart Playlists' },
    { id: 'spatial-dsp', label: 'Go to Spatial & DSP Studio' },
    { id: 'addons', label: 'Go to Add-On Store' },
    { id: 'settings', label: 'Go to Linux Audio Settings & PipeWire Assistant' },
  ];
  const quickViews = allQuickViews.filter((v) => !q || v.label.toLowerCase().includes(q));

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Search Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-20 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[580px] overflow-hidden rounded-[14px] border border-[#2B3342] bg-[#14181F] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#2B3342] px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="cmd-palette-input"
              className="text-[11px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase"
            >
              Quick Search (Tracks, DACs &amp; Views)
            </label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close search palette"
              className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <Search className="h-4 w-4 shrink-0 text-[#9AA4B2]" aria-hidden="true" />
            <input
              id="cmd-palette-input"
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search FLAC/DSD/Atmos tracks, ALSA DACs, or views..."
              className="w-full bg-transparent text-sm text-[#F2F4F8] placeholder:text-[#9AA4B2] focus:outline-none"
            />
          </div>
        </div>

        <div className="max-h-[420px] space-y-4 overflow-y-auto p-3">
          {matchedTracks.length > 0 && (
            <div>
              <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                Master Tracks
              </div>
              <ul className="space-y-1">
                {matchedTracks.map((trk) => (
                  <li key={trk.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void playTrack(trk.id);
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left text-sm hover:bg-[#1C222D]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Disc3 className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
                        <span className="truncate font-medium text-[#F2F4F8]">{trk.title}</span>
                        <span className="truncate text-xs text-[#9AA4B2]">{trk.artist}</span>
                      </span>
                      <span className="mono-telemetry shrink-0 text-xs text-[#9AA4B2]">
                        {trk.codec} · {formatSampleRate(trk.sampleRateHz, trk.isDsd, trk.dsdRateMultiplier)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matchedDevices.length > 0 && (
            <div>
              <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                Hardware DAC Endpoints
              </div>
              <ul className="space-y-1">
                {matchedDevices.map((dev) => (
                  <li key={dev.alsaId}>
                    <button
                      type="button"
                      onClick={() => {
                        void selectAudioDevice(dev.alsaId, !dev.isIsolatedInternal);
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left text-sm hover:bg-[#1C222D]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Cpu className="h-4 w-4 shrink-0 text-[#38BDF8]" aria-hidden="true" />
                        <span className="truncate font-medium text-[#F2F4F8]">{dev.displayName}</span>
                      </span>
                      <span className="mono-telemetry shrink-0 text-xs text-[#9AA4B2]">
                        {dev.alsaId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quickViews.length > 0 && (
            <div>
              <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                Workspace Navigation
              </div>
              <ul className="space-y-1">
                {quickViews.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoute(v.id);
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-sm text-[#F2F4F8] hover:bg-[#1C222D]"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-[#9AA4B2]" aria-hidden="true" />
                      <span>{v.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(!q || 'ebusy unplug test fault'.includes(q)) && (
            <div className="border-t border-[#2B3342] pt-3">
              <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
                Linux Audio Fault Simulation
              </div>
              <div className="flex flex-wrap gap-2 px-2">
                <button
                  type="button"
                  onClick={() => {
                    void triggerAlsaEbusy();
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2.5 py-1.5 text-xs text-[#F59E0B] hover:border-[#F59E0B]"
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Simulate ALSA EBUSY
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void triggerUsbHotUnplug();
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2.5 py-1.5 text-xs text-[#EF4444] hover:border-[#EF4444]"
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Simulate USB DAC Hot-Unplug
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { useAudioStore, type SignalPathPreviewPreset } from '../../store/useAudioStore';
import type { SignalStageStatus } from '../../lib/audioBridge';
import { buildFiveStageTimeline, formatDiagnosticReport } from '../../lib/telemetryHelpers';

const STAGE_STYLES: Record<SignalStageStatus, { dot: string; text: string; border: string; line: string }> = {
  lossless: {
    dot: 'bg-[#10B981]',
    text: 'text-[#10B981]',
    border: 'border-[#10B981]/35',
    line: 'bg-[#10B981]/50',
  },
  spatial: {
    dot: 'bg-[#38BDF8]',
    text: 'text-[#38BDF8]',
    border: 'border-[#38BDF8]/35',
    line: 'bg-[#38BDF8]/50',
  },
  warning: {
    dot: 'bg-[#F59E0B]',
    text: 'text-[#F59E0B]',
    border: 'border-[#F59E0B]/45',
    line: 'bg-[#F59E0B]/50',
  },
  error: {
    dot: 'bg-[#EF4444]',
    text: 'text-[#EF4444]',
    border: 'border-[#EF4444]/55',
    line: 'bg-[#EF4444]/50',
  },
  bypassed: {
    dot: 'bg-[#9AA4B2]',
    text: 'text-[#9AA4B2]',
    border: 'border-[#2B3342]',
    line: 'bg-[#2B3342]',
  },
};

const PREVIEW_PRESETS: { id: SignalPathPreviewPreset; label: string }[] = [
  { id: 'flac_192', label: '192 kHz FLAC Bit-Perfect' },
  { id: 'dsd256_native', label: 'DSD256 Native' },
  { id: 'atmos_spatial', label: 'TrueHD Atmos Spatial HRTF' },
  { id: 'alsa_ebusy', label: 'ALSA EBUSY' },
];

export function SignalPathPopover() {
  const open = useAudioStore((s) => s.signalPathInspectorOpen);
  const setOpen = useAudioStore((s) => s.setSignalPathInspectorOpen);
  const signalPath = useAudioStore((s) => s.signalPath);
  const devices = useAudioStore((s) => s.devices);
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const ringBufferMb = useAudioStore((s) => s.ringBufferMb);
  const claimDbusReservation = useAudioStore((s) => s.claimDbusReservation);
  const triggerUsbReconnect = useAudioStore((s) => s.triggerUsbReconnect);
  const toggleDrawer = useAudioStore((s) => s.toggleDrawer);
  const applySignalPathPreviewPreset = useAudioStore((s) => s.applySignalPathPreviewPreset);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [switchingPreset, setSwitchingPreset] = useState<SignalPathPreviewPreset | null>(null);

  // Dismiss on outside click (Escape is handled centrally by useGlobalKeyboardShortcuts)
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest('[data-signal-path-trigger="true"]')) return;
      setOpen(false);
    };

    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, setOpen]);

  if (!open || !signalPath) return null;

  const activeDevice = devices.find((d) => d.alsaId === signalPath.activeDeviceId) ?? null;
  const currentTrack = tracks.find((t) => t.id === playback?.currentTrackId) ?? tracks[0] ?? null;
  const fiveStages = buildFiveStageTimeline(signalPath, activeDevice, currentTrack, ringBufferMb);

  const bannerConfig =
    signalPath.integrity === 'bit_perfect'
      ? {
          title: 'SIGNAL PATH: BIT-PERFECT',
          bg: 'bg-[#10B981]/15 border-[#10B981]/50 text-[#10B981]',
          Icon: CheckCircle2,
        }
      : signalPath.integrity === 'spatial_dsp'
      ? {
          title: 'SIGNAL PATH: SPATIAL DSP',
          bg: 'bg-[#38BDF8]/15 border-[#38BDF8]/50 text-[#38BDF8]',
          Icon: Sparkles,
        }
      : signalPath.integrity === 'warning_fallback'
      ? {
          title: 'SIGNAL PATH: DEGRADED / FALLBACK',
          bg: 'bg-[#F59E0B]/15 border-[#F59E0B]/55 text-[#F59E0B]',
          Icon: AlertTriangle,
        }
      : {
          title: 'SIGNAL PATH: HALTED / HARDWARE FAULT',
          bg: 'bg-[#EF4444]/15 border-[#EF4444]/55 text-[#EF4444]',
          Icon: ShieldAlert,
        };

  const BannerIcon = bannerConfig.Icon;

  const handleCopyReport = async () => {
    const report = formatDiagnosticReport(signalPath, activeDevice, currentTrack, ringBufferMb, 0);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // Fallback for sandboxed iframes without clipboard permission
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handlePresetClick = async (preset: SignalPathPreviewPreset) => {
    setSwitchingPreset(preset);
    await applySignalPathPreviewPreset(preset);
    setSwitchingPreset(null);
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="5-Stage Signal Path Inspector"
      className="fixed bottom-[98px] left-4 z-50 flex max-h-[calc(100vh-116px)] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[14px] border border-[#2B3342] bg-[#14181F] shadow-2xl shadow-black/80"
    >
      {/* Top Status Banner */}
      <div className="shrink-0 border-b border-[#2B3342] p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div
            className={`inline-flex items-center gap-2 rounded-[8px] border px-2.5 py-1.5 font-display text-xs font-bold tracking-[0.06em] ${bannerConfig.bg}`}
          >
            <BannerIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{bannerConfig.title}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Signal Path Inspector"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 truncate mono-telemetry text-[11px] text-[#9AA4B2]">
          {signalPath.summaryLabel}
        </p>
      </div>

      {/* Scrollable Body: Connected 5-Stage Vertical Telemetry Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <ol className="space-y-0">
          {fiveStages.map((stage, idx) => {
            const st = STAGE_STYLES[stage.status];
            const isLast = idx === fiveStages.length - 1;
            return (
              <li key={stage.id} className="relative flex gap-3">
                {/* Connected Vertical Node Rail */}
                <div className="flex flex-col items-center pt-3">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[#14181F] ${st.dot}`}
                    aria-hidden="true"
                  />
                  {!isLast && <span className={`mt-1 w-px flex-1 ${st.line}`} aria-hidden="true" />}
                </div>

                {/* Stage Card */}
                <div className={`mb-2 min-w-0 flex-1 rounded-[10px] border bg-[#1C222D] px-3 py-2.5 ${st.border}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold text-[#F2F4F8]">
                      {stage.order}. {stage.label}
                    </span>
                    <span className={`mono-telemetry text-[10px] font-semibold ${st.text}`}>
                      {stage.telemetry}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[#9AA4B2]">{stage.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Honest Warnings (Resampling / DSD-to-PCM Fallback) */}
        {signalPath.warnings.length > 0 && (
          <div className="mt-1 rounded-[8px] border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-2.5 text-[11px] text-[#FDE68A]">
            <div className="mb-0.5 font-semibold text-[#F59E0B]">Signal Integrity Notice</div>
            <ul className="space-y-1">
              {signalPath.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Hardware Error Recovery Actions */}
        {signalPath.error && (
          <div className="mt-2 rounded-[8px] border border-[#EF4444]/50 bg-[#EF4444]/10 p-2.5 text-[11px]">
            <div className="font-semibold text-[#EF4444]">{signalPath.error.title}</div>
            <p className="mt-0.5 text-[#FCA5A5]">{signalPath.error.message}</p>
            <div className="mt-2 flex items-center gap-2">
              {signalPath.error.code === 'ALSA_EBUSY' && (
                <button
                  type="button"
                  onClick={() => void claimDbusReservation()}
                  className="rounded-[6px] bg-[#10B981] px-2.5 py-1 text-[11px] font-semibold text-[#06130E] hover:bg-[#34D399]"
                >
                  {signalPath.error.recoveryActionLabel}
                </button>
              )}
              {signalPath.error.code === 'DAC_HOT_UNPLUGGED' && (
                <button
                  type="button"
                  onClick={() => void triggerUsbReconnect()}
                  className="rounded-[6px] bg-[#10B981] px-2.5 py-1 text-[11px] font-semibold text-[#06130E] hover:bg-[#34D399]"
                >
                  {signalPath.error.recoveryActionLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Verification Strip + Actions + Preview State Switcher */}
      <div className="shrink-0 space-y-2.5 border-t border-[#2B3342] bg-[#0B0D10] px-4 py-3">
        {/* Verification Strip */}
        <div className="grid grid-cols-3 gap-2 rounded-[8px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1.5 mono-telemetry text-[10px]">
          <div className="flex flex-col">
            <span className="text-[#9AA4B2]">PipeWire SRC</span>
            <span className={signalPath.pipewireBypassed ? 'font-semibold text-[#10B981]' : 'font-semibold text-[#F59E0B]'}>
              {signalPath.pipewireBypassed ? 'BYPASSED' : 'ACTIVE'}
            </span>
          </div>
          <div className="flex flex-col border-l border-[#2B3342] pl-2">
            <span className="text-[#9AA4B2]">Laptop Audio</span>
            <span className={signalPath.laptopSpeakersIsolated ? 'font-semibold text-[#10B981]' : 'font-semibold text-[#F59E0B]'}>
              {signalPath.laptopSpeakersIsolated ? 'ISOLATED' : 'EXPOSED'}
            </span>
          </div>
          <div className="flex flex-col border-l border-[#2B3342] pl-2">
            <span className="text-[#9AA4B2]">Xruns</span>
            <span className="font-semibold text-[#10B981]">0</span>
          </div>
        </div>

        {/* Action Row: Copy Diagnostic Report & Switch DAC */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleCopyReport()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#1C222D] px-3 py-1.5 text-xs font-medium text-[#F2F4F8] transition-colors duration-150 hover:border-[#38BDF8]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
                <span className="text-[#10B981]">Copied Diagnostic Report</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-[#9AA4B2]" aria-hidden="true" />
                <span>Copy Diagnostic Report</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              toggleDrawer('dac');
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-1.5 text-xs font-medium text-[#F2F4F8] hover:border-[#10B981]"
          >
            <Cpu className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            Switch DAC
          </button>
        </div>

        {/* Compact Preview State Switcher */}
        <div className="border-t border-[#2B3342] pt-2">
          <div className="mb-1.5 text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
            Preview State Switcher
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PREVIEW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={switchingPreset !== null}
                onClick={() => void handlePresetClick(preset.id)}
                className="rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2 py-1 text-left mono-telemetry text-[10px] text-[#9AA4B2] transition-colors duration-150 hover:border-[#38BDF8] hover:text-[#F2F4F8]"
              >
                {switchingPreset === preset.id ? 'Switching...' : preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { AlertTriangle, Cpu, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';

/**
 * Surfaces honest hardware faults (ALSA EBUSY, USB DAC Hot-Unplug Safe Pause)
 * and transparent DSP downgrades (DSD -> PCM fallback, MusicBrainz 503 backoff)
 * at the top of the workspace so audio compromises are never hidden.
 */
export function HardwareAlertBanner() {
  const signalPath = useAudioStore((s) => s.signalPath);
  const claimDbusReservation = useAudioStore((s) => s.claimDbusReservation);
  const triggerUsbReconnect = useAudioStore((s) => s.triggerUsbReconnect);
  const selectAudioDevice = useAudioStore((s) => s.selectAudioDevice);
  const setAudioMode = useAudioStore((s) => s.setAudioMode);
  const musicBrainzBackoff = useAudioStore((s) => s.musicBrainzBackoff);

  if (!signalPath) return null;

  // Priority 1: Critical Hardware Fault (Danger Red)
  if (signalPath.error && signalPath.integrity === 'error_halted') {
    const err = signalPath.error;
    return (
      <div
        role="alert"
        className="shrink-0 border-b border-[#EF4444]/60 bg-[#EF4444]/12 px-6 py-3"
      >
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" aria-hidden="true" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[6px] bg-[#EF4444] px-2 py-0.5 mono-telemetry text-[11px] font-semibold text-[#1F0505]">
                  {err.code}
                </span>
                <h3 className="font-display text-sm font-semibold text-[#F2F4F8]">{err.title}</h3>
              </div>
              <p className="mt-1 text-xs text-[#FCA5A5]">{err.message}</p>
              <p className="mt-0.5 mono-telemetry text-[11px] text-[#9AA4B2]">{err.technicalDetail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {err.code === 'ALSA_EBUSY' && (
              <button
                type="button"
                onClick={() => void claimDbusReservation()}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#10B981] px-3.5 py-2 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {err.recoveryActionLabel}
              </button>
            )}
            {err.code === 'DAC_HOT_UNPLUGGED' && (
              <button
                type="button"
                onClick={() => void triggerUsbReconnect()}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#10B981] px-3.5 py-2 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
              >
                <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                {err.recoveryActionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Priority 2: Honest Amber Warning (DSD -> PCM fallback or Atmos 2.0 core fold)
  if (signalPath.integrity === 'warning_fallback' && signalPath.warnings.length > 0) {
    const isDsdFallback = signalPath.warnings.some((w) => w.includes('UAC2 Native DSD rejected'));
    const isAtmosCoreFallback = signalPath.warnings.some((w) => w.includes('HDMI IEC958'));

    return (
      <div
        role="status"
        className="shrink-0 border-b border-[#F59E0B]/55 bg-[#F59E0B]/10 px-6 py-3"
      >
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[6px] bg-[#F59E0B] px-2 py-0.5 mono-telemetry text-[11px] font-semibold text-[#1A1002]">
                  DSP FALLBACK
                </span>
                <span className="font-display text-sm font-semibold text-[#F2F4F8]">
                  {signalPath.outputFormat}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#FDE68A]">{signalPath.warnings[0]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isDsdFallback && (
              <button
                type="button"
                onClick={() => void selectAudioDevice('hw:CARD=iFiAudio,DEV=0', true)}
                className="rounded-[8px] bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
              >
                Switch to iFi ZEN DAC V2 (Native DSD256)
              </button>
            )}
            {isAtmosCoreFallback && (
              <button
                type="button"
                onClick={() => void setAudioMode('spatial')}
                className="rounded-[8px] bg-[#38BDF8] px-3 py-1.5 text-xs font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
              >
                Enable Spatial SOFA HRTF
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Priority 3: MusicBrainz HTTP 503 Backoff Notice
  if (musicBrainzBackoff?.active) {
    return (
      <div
        role="status"
        className="shrink-0 border-b border-[#F59E0B]/45 bg-[#14181F] px-6 py-2.5 text-xs"
      >
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-[6px] bg-[#F59E0B] px-2 py-0.5 mono-telemetry text-[11px] font-semibold text-[#1A1002]">
              HTTP 503 BACKOFF
            </span>
            <span className="text-[#F2F4F8]">{musicBrainzBackoff.message}</span>
          </div>
          <span className="mono-telemetry text-[#9AA4B2]">
            Retry-After {(musicBrainzBackoff.retryAfterMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
    );
  }

  return null;
}

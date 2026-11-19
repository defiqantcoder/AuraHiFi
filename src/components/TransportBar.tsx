import { useEffect, useState } from 'react';
import {
  AlignLeft,
  Cpu,
  ListMusic,
  Lock,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { AlbumArtwork } from './AlbumArtwork';
import { formatDb, formatTimecode } from '../lib/signalPathEngine';

export function TransportBar() {
  const playback = useAudioStore((s) => s.playback);
  const tracks = useAudioStore((s) => s.tracks);
  const signalPath = useAudioStore((s) => s.signalPath);
  const sendTransport = useAudioStore((s) => s.sendTransport);
  const setAudioMode = useAudioStore((s) => s.setAudioMode);
  const activeDrawer = useAudioStore((s) => s.activeDrawer);
  const toggleDrawer = useAudioStore((s) => s.toggleDrawer);
  const signalPathInspectorOpen = useAudioStore((s) => s.signalPathInspectorOpen);
  const setSignalPathInspectorOpen = useAudioStore((s) => s.setSignalPathInspectorOpen);

  const [livePosMs, setLivePosMs] = useState<number>(playback?.positionMs ?? 0);
  const [showLockTooltip, setShowLockTooltip] = useState(false);

  const currentTrack = tracks.find((t) => t.id === playback?.currentTrackId) ?? tracks[0] ?? null;

  useEffect(() => {
    if (playback) {
      setLivePosMs(playback.positionMs);
    }
  }, [playback?.positionMs, playback?.currentTrackId]);

  // Smooth throttled position readout (~4 Hz) driven by telemetry stream without 60 Hz DOM churn
  useEffect(() => {
    let lastUpdate = 0;
    const unsub = useAudioStore.getState().subscribeTelemetry((frame) => {
      if (frame.timestampMs - lastUpdate >= 250) {
        lastUpdate = frame.timestampMs;
        setLivePosMs(frame.positionMs);
      }
    });
    return () => unsub();
  }, []);

  if (!playback || !signalPath || !currentTrack) return null;

  const isPlaying = playback.status === 'playing';
  const isHalted = playback.status === 'halted_hardware_error';
  const isBitPerfect = signalPath.mode === 'bit_perfect';
  const isVolumeLocked = signalPath.isVolumeLocked;
  const durationMs = currentTrack.durationMs;
  const progressRatio = durationMs > 0 ? Math.min(1, Math.max(0, livePosMs / durationMs)) : 0;

  const pillDotClass =
    signalPath.integrity === 'bit_perfect'
      ? 'bg-[#10B981]'
      : signalPath.integrity === 'spatial_dsp'
      ? 'bg-[#38BDF8]'
      : signalPath.integrity === 'warning_fallback'
      ? 'bg-[#F59E0B]'
      : 'bg-[#EF4444]';

  const pillBorderClass =
    signalPath.integrity === 'error_halted'
      ? 'border-[#EF4444]/60 text-[#FCA5A5]'
      : signalPath.integrity === 'warning_fallback'
      ? 'border-[#F59E0B]/60 text-[#FDE68A]'
      : signalPathInspectorOpen
      ? 'border-[#38BDF8] text-[#F2F4F8]'
      : 'border-[#2B3342] text-[#F2F4F8] hover:border-[#3E495E]';

  const activeWaveformColor =
    signalPath.integrity === 'bit_perfect'
      ? 'bg-[#10B981]'
      : signalPath.integrity === 'spatial_dsp'
      ? 'bg-[#38BDF8]'
      : signalPath.integrity === 'warning_fallback'
      ? 'bg-[#F59E0B]'
      : 'bg-[#EF4444]';

  const handleWaveformSeek = (ratio: number) => {
    const targetMs = Math.round(ratio * durationMs);
    setLivePosMs(targetMs);
    void sendTransport({ type: 'Seek', positionMs: targetMs });
  };

  return (
    <footer
      aria-label="Transport and Audio Telemetry Bar"
      className="relative z-30 flex h-[88px] w-full shrink-0 items-center justify-between gap-4 border-t border-[#2B3342] bg-[#14181F] px-4"
    >
      {/* Left Zone: Album Art, Track Info & Clickable Signal Path Pill */}
      <div className="flex min-w-0 w-[320px] shrink-0 items-center gap-3">
        <AlbumArtwork theme={currentTrack.artworkTheme} title={currentTrack.title} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold text-[#F2F4F8]">
            {currentTrack.title}
          </div>
          <div className="truncate text-xs text-[#9AA4B2]">{currentTrack.artist}</div>
          <button
            type="button"
            data-signal-path-trigger="true"
            onClick={() => setSignalPathInspectorOpen(!signalPathInspectorOpen)}
            aria-expanded={signalPathInspectorOpen}
            aria-label={`Inspect Signal Path: ${signalPath.summaryLabel}`}
            className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border bg-[#0B0D10] px-2.5 py-0.5 mono-telemetry text-[11px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${pillBorderClass}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${pillDotClass}`} aria-hidden="true" />
            <span className="truncate whitespace-nowrap">{signalPath.pillShortLabel}</span>
          </button>
        </div>
      </div>

      {/* Center Zone: Transport Controls & Interactive Waveform Seek Bar */}
      <div className="flex min-w-0 flex-1 max-w-[540px] flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void sendTransport({ type: 'ToggleShuffle' })}
            aria-label={playback.shuffle ? 'Disable shuffle' : 'Enable shuffle'}
            aria-pressed={playback.shuffle}
            className={`flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              playback.shuffle ? 'text-[#38BDF8]' : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => void sendTransport({ type: 'Prev' })}
            aria-label="Previous track"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#F2F4F8] transition-colors duration-150 hover:bg-[#1C222D] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <SkipBack className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={isHalted}
            onClick={() => void sendTransport({ type: isPlaying ? 'Pause' : 'Play' })}
            aria-label={isHalted ? 'Playback halted by hardware error' : isPlaying ? 'Pause playback' : 'Play playback'}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              isHalted
                ? 'cursor-not-allowed bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/50'
                : isBitPerfect
                ? 'bg-[#10B981] text-[#06130E] hover:bg-[#34D399]'
                : 'bg-[#38BDF8] text-[#06121A] hover:bg-[#7DD3FC]'
            }`}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px] fill-current" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void sendTransport({ type: 'Next' })}
            aria-label="Next track"
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#F2F4F8] transition-colors duration-150 hover:bg-[#1C222D] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => void sendTransport({ type: 'CycleRepeat' })}
            aria-label={`Repeat mode: ${playback.repeatMode}`}
            className={`flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              playback.repeatMode !== 'off' ? 'text-[#10B981]' : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            {playback.repeatMode === 'one' ? (
              <Repeat1 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Waveform Seek Bar */}
        <div className="flex w-full items-center gap-2.5">
          <span className="mono-telemetry w-10 text-right text-[11px] text-[#9AA4B2]">
            {formatTimecode(livePosMs)}
          </span>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek track waveform"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={livePosMs}
            aria-valuetext={`${formatTimecode(livePosMs)} of ${formatTimecode(durationMs)}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') handleWaveformSeek(Math.min(1, progressRatio + 0.05));
              if (e.key === 'ArrowLeft') handleWaveformSeek(Math.max(0, progressRatio - 0.05));
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              handleWaveformSeek(Math.max(0, Math.min(1, ratio)));
            }}
            className="group relative flex h-7 flex-1 cursor-pointer items-end gap-[2px] rounded-[6px] bg-[#0B0D10] px-1.5 py-1 border border-[#2B3342] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            {currentTrack.waveformPeaks.map((peak, idx) => {
              const barRatio = idx / currentTrack.waveformPeaks.length;
              const isPlayed = barRatio <= progressRatio;
              return (
                <span
                  key={idx}
                  className={`flex-1 rounded-[1px] transition-colors duration-100 ${
                    isPlayed ? activeWaveformColor : 'bg-[#2B3342] group-hover:bg-[#3A4559]'
                  }`}
                  style={{ height: `${Math.max(18, Math.round(peak * 100))}%` }}
                />
              );
            })}
          </div>

          <span className="mono-telemetry w-10 text-[11px] text-[#9AA4B2]">
            {formatTimecode(durationMs)}
          </span>
        </div>
      </div>

      {/* Right Zone: Master Mode Switch, Honestly Locked Volume Slider & Drawer Toggles */}
      <div className="flex shrink-0 items-center gap-3.5">
        {/* Master Mode Switch (BIT-PERFECT Emerald <-> SPATIAL Cyan) */}
        <div
          role="group"
          aria-label="Master Audio Engine Mode"
          className="flex items-center rounded-full border border-[#2B3342] bg-[#0B0D10] p-1"
        >
          <button
            type="button"
            onClick={() => void setAudioMode('bit_perfect')}
            aria-pressed={isBitPerfect}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap transition-all duration-240 ease-out focus-visible:outline-2 focus-visible:outline-[#10B981] ${
              isBitPerfect
                ? 'bg-[#10B981] text-[#06130E]'
                : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            BIT-PERFECT
          </button>
          <button
            type="button"
            onClick={() => void setAudioMode('spatial')}
            aria-pressed={!isBitPerfect}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap transition-all duration-240 ease-out focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              !isBitPerfect
                ? 'bg-[#38BDF8] text-[#06121A]'
                : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            SPATIAL
          </button>
        </div>

        {/* Honestly Locked / Unlocked Volume Control */}
        <div
          className="relative flex w-[176px] flex-col justify-center"
          onMouseEnter={() => isVolumeLocked && setShowLockTooltip(true)}
          onMouseLeave={() => setShowLockTooltip(false)}
        >
          <div className="mb-1 flex items-center justify-between gap-1.5">
            {isVolumeLocked ? (
              <span className="flex items-center gap-1 mono-telemetry text-[11px] font-medium text-[#10B981]">
                <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                0.0 dB LOCKED
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void sendTransport({ type: 'ToggleMute' })}
                aria-label={playback.isMuted ? 'Unmute Spatial DSP output' : 'Mute Spatial DSP output'}
                className="flex items-center gap-1 text-[#38BDF8] hover:text-[#7DD3FC] focus-visible:outline-2 focus-visible:outline-[#38BDF8] rounded"
              >
                {playback.isMuted ? (
                  <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span className="mono-telemetry text-[11px]">
                  {playback.isMuted ? 'MUTED' : formatDb(playback.volumeDb)}
                </span>
              </button>
            )}

            <label
              htmlFor="transport-volume-slider"
              className="mono-telemetry text-[10px] text-[#9AA4B2]"
            >
              {isVolumeLocked ? 'HW GAIN' : '64b DSP'}
            </label>
          </div>

          <input
            id="transport-volume-slider"
            type="range"
            min={0}
            max={100}
            value={isVolumeLocked ? 100 : playback.isMuted ? 0 : Math.round(playback.volumeNormalized * 100)}
            disabled={isVolumeLocked}
            aria-label={
              isVolumeLocked
                ? 'Software volume locked at 0.0 dB in Bit-Perfect mode'
                : 'Spatial DSP software volume control'
            }
            onFocus={() => isVolumeLocked && setShowLockTooltip(true)}
            onBlur={() => setShowLockTooltip(false)}
            onChange={(e) =>
              void sendTransport({
                type: 'SetVolume',
                volumeNormalized: Number(e.target.value) / 100,
              })
            }
            className="studio-slider w-full"
          />

          {/* Honest Lock Tooltip */}
          {isVolumeLocked && showLockTooltip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute right-0 bottom-[66px] z-50 w-64 rounded-[10px] border border-[#2B3342] bg-[#1C222D] p-3 text-xs text-[#F2F4F8] shadow-xl"
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#10B981]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Software Volume Locked (0.0 dB)
              </div>
              <p className="leading-relaxed text-[#9AA4B2]">{signalPath.volumeLockReason}</p>
            </div>
          )}
        </div>

        {/* Context Drawer Toggles: DAC Switcher, Lyrics, Queue */}
        <div className="flex items-center gap-1 border-l border-[#2B3342] pl-3">
          <button
            type="button"
            onClick={() => toggleDrawer('dac')}
            aria-label="Toggle DAC Switcher drawer"
            aria-pressed={activeDrawer === 'dac'}
            title="DAC Hardware Switcher"
            className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              activeDrawer === 'dac'
                ? 'border-[#38BDF8] bg-[#1C222D] text-[#38BDF8]'
                : 'border-transparent text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]'
            }`}
          >
            <Cpu className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => toggleDrawer('lyrics')}
            aria-label="Toggle Lyrics drawer"
            aria-pressed={activeDrawer === 'lyrics'}
            title="Synced Lyrics & Mastering Notes"
            className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              activeDrawer === 'lyrics'
                ? 'border-[#38BDF8] bg-[#1C222D] text-[#38BDF8]'
                : 'border-transparent text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]'
            }`}
          >
            <AlignLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => toggleDrawer('queue')}
            aria-label="Toggle Queue drawer"
            aria-pressed={activeDrawer === 'queue'}
            title="Playback Queue"
            className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              activeDrawer === 'queue'
                ? 'border-[#38BDF8] bg-[#1C222D] text-[#38BDF8]'
                : 'border-transparent text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]'
            }`}
          >
            <ListMusic className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}

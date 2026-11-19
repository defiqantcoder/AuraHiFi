import { useEffect, useState } from 'react';
import {
  AlignLeft,
  ListMusic,
  Lock,
  Play,
  X,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { formatSampleRate, formatTimecode, requiresSampleRateSwitchLock } from '../lib/signalPathEngine';
import { AlbumArtwork } from './AlbumArtwork';
import { DacSwitcherDrawer } from './dac/DacSwitcherDrawer';

export function ContextDrawer() {
  const activeDrawer = useAudioStore((s) => s.activeDrawer);
  const closeDrawer = useAudioStore((s) => s.closeDrawer);
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const playTrack = useAudioStore((s) => s.playTrack);
  const lyricsCache = useAudioStore((s) => s.lyricsCache);
  const loadLyricsForTrack = useAudioStore((s) => s.loadLyricsForTrack);

  const [livePosMs, setLivePosMs] = useState<number>(playback?.positionMs ?? 0);

  useEffect(() => {
    if (activeDrawer === 'lyrics' && playback?.currentTrackId) {
      void loadLyricsForTrack(playback.currentTrackId);
    }
  }, [activeDrawer, playback?.currentTrackId, loadLyricsForTrack]);

  useEffect(() => {
    if (activeDrawer !== 'lyrics') return;
    let last = 0;
    const unsub = useAudioStore.getState().subscribeTelemetry((f) => {
      if (f.timestampMs - last >= 300) {
        last = f.timestampMs;
        setLivePosMs(f.positionMs);
      }
    });
    return () => unsub();
  }, [activeDrawer]);

  if (activeDrawer === 'none') return null;
  if (activeDrawer === 'dac') return <DacSwitcherDrawer onClose={closeDrawer} />;

  const titleMap = {
    lyrics: { title: 'Synced Lyrics & Notes', icon: AlignLeft },
    queue: { title: 'Gapless Playback Queue', icon: ListMusic },
  } as const;

  const HeaderIcon = titleMap[activeDrawer].icon;
  const currentLyrics = playback?.currentTrackId ? lyricsCache[playback.currentTrackId] : null;
  const queueTracks = (playback?.queueTrackIds ?? [])
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <aside
      aria-label={titleMap[activeDrawer].title}
      className="flex h-full w-[360px] shrink-0 flex-col border-l border-[#2B3342] bg-[#14181F]"
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#2B3342] px-4">
        <div className="flex items-center gap-2">
          <HeaderIcon className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
            {titleMap[activeDrawer].title}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close context drawer"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Gapless Playback Queue */}
        {activeDrawer === 'queue' && (
          <div className="space-y-2">
            <div className="mb-3 flex items-center justify-between text-xs text-[#9AA4B2]">
              <span>Lock-free gapless ring buffer</span>
              <span className="mono-telemetry text-[#F2F4F8]">{queueTracks.length} tracks</span>
            </div>

            {queueTracks.map((trk, idx) => {
              const isCurrent = trk.id === playback?.currentTrackId;
              const prev = idx > 0 ? queueTracks[idx - 1] : null;
              const rateChange = requiresSampleRateSwitchLock(prev, trk);

              return (
                <div key={trk.id}>
                  {rateChange.required && prev && (
                    <div className="my-1.5 flex items-center gap-2 px-2 mono-telemetry text-[10px] text-[#F59E0B]">
                      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        ALSA Clock Relock: {formatSampleRate(prev.sampleRateHz, prev.isDsd, prev.dsdRateMultiplier)} →{' '}
                        {formatSampleRate(trk.sampleRateHz, trk.isDsd, trk.dsdRateMultiplier)}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void playTrack(trk.id)}
                    className={`flex w-full items-center gap-3 rounded-[10px] border p-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
                      isCurrent
                        ? 'border-[#10B981]/60 bg-[#1C222D]'
                        : 'border-[#2B3342] bg-[#0B0D10] hover:bg-[#1C222D]'
                    }`}
                  >
                    <AlbumArtwork theme={trk.artworkTheme} title={trk.title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isCurrent && (
                          <Play className="h-3 w-3 shrink-0 fill-[#10B981] text-[#10B981]" aria-hidden="true" />
                        )}
                        <span className="truncate text-xs font-semibold text-[#F2F4F8]">
                          {trk.title}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[#9AA4B2]">{trk.artist}</div>
                      <div className="mt-1 flex items-center gap-1.5 mono-telemetry text-[10px] text-[#9AA4B2]">
                        <span className="text-[#F2F4F8]">{trk.codec}</span>
                        <span>·</span>
                        <span>
                          {trk.isDsd
                            ? formatSampleRate(trk.sampleRateHz, true, trk.dsdRateMultiplier)
                            : `${formatSampleRate(trk.sampleRateHz)} / ${trk.bitDepth}b`}
                        </span>
                        <span>·</span>
                        <span>{formatTimecode(trk.durationMs)}</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Synced Lyrics & Mastering Notes */}
        {activeDrawer === 'lyrics' && (
          <div>
            <div className="mb-4 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 text-xs text-[#9AA4B2]">
              Source: <span className="text-[#F2F4F8]">{currentLyrics?.source ?? 'Loading cache...'}</span>
            </div>

            {currentLyrics ? (
              <ul className="space-y-3">
                {currentLyrics.lines.map((line, idx) => {
                  const nextTime = currentLyrics.lines[idx + 1]?.timeMs ?? Number.MAX_SAFE_INTEGER;
                  const isActiveLine = livePosMs >= line.timeMs && livePosMs < nextTime;

                  return (
                    <li
                      key={`${line.timeMs}-${idx}`}
                      className={`rounded-[8px] px-3 py-2.5 text-sm leading-relaxed transition-colors duration-150 ${
                        isActiveLine
                          ? 'bg-[#1C222D] font-medium text-[#F2F4F8] border border-[#38BDF8]/45'
                          : 'text-[#9AA4B2]'
                      }`}
                    >
                      <span className="mono-telemetry mr-2 text-[11px] text-[#38BDF8]">
                        {formatTimecode(line.timeMs)}
                      </span>
                      {line.text.replace(/^\[[0-9:]+\]\s*/, '')}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[#9AA4B2]">Loading synced lyrics from SQLite cache...</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

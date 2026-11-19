import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  BookOpen,
  CheckCircle2,
  Cpu,
  Disc3,
  ListMusic,
  Lock,
  Play,
  Radio,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { SpectrumVuCanvas } from '../components/telemetry/SpectrumVuCanvas';
import {
  formatSampleRate,
  formatTimecode,
  requiresSampleRateSwitchLock,
} from '../lib/signalPathEngine';
import { estimateTrackBitrateKbps, formatBitrateKbps } from '../lib/telemetryHelpers';
import type { TrackSummary } from '../lib/audioBridge';

type RightPanelTab = 'lyrics' | 'queue' | 'liner-notes';

interface LinerNotesEntry {
  label: string;
  catalog: string;
  studio: string;
  engineer: string;
  captureChain: string;
  mbid: string;
  notes: string;
}

const LINER_NOTES_BY_TRACK: Record<string, LinerNotesEntry> = {
  'trk-flac-192': {
    label: 'Erased Tapes Records',
    catalog: 'ERATP055 · 24/192 Master',
    studio: 'Funkhaus Berlin — Saal 3 & Durton Studio',
    engineer: 'Nils Frahm & Martyn Heyne (Mastered by Mandy Parnell)',
    captureChain: 'Close Neumann U47 → Studer A800 1/2" Tape → Lavry Gold AD122-96/192',
    mbid: '4f39a1c8-80e2-45e0-a611-29b9f1080c41',
    notes:
      'Recorded live across European halls over two years onto analog reel-to-reel tape and transferred without dynamic range limiting. Quiet room ambience preserves subtle felt-hammer mechanics and Juno-60 analog drift.',
  },
  'trk-dsd-256': {
    label: 'Riverside Records / Analogue Productions',
    catalog: 'RLP 9399 · APJ 009-DSD256',
    studio: 'Village Vanguard, New York City (June 25, 1961)',
    engineer: 'Dave Jones (DSD256 Transfer by Kevin Gray at Cohearent Audio)',
    captureChain: 'Ampex 300 2-Track 15 ips Master → Merging Horus 11.2 MHz DSD256 ADC',
    mbid: 'c018d8a0-149b-41fa-8fd4-7e01f2b82b12',
    notes:
      'Direct 1-bit Sigma-Delta transfer from the original 1961 stereo session reels. Captures the intimate club room acoustic, glassware ambiance, and Scott LaFaro’s unamplified double-bass articulation.',
  },
  'trk-atmos-714': {
    label: 'Polydor / Universal Music Group',
    catalog: '0602508914010 · Pure Audio Blu-ray Atmos',
    studio: 'Powerplay Studios, Maur (Zurich)',
    engineer: 'Boris Blank (Spatial Mix by Stefan Bock, msm-studios Munich)',
    captureChain: 'Dolby TrueHD 7.1.4 Bed + 11 Discrete Dynamic Objects (48.0 kHz / 24-bit)',
    mbid: '882a10f9-44b1-4b23-a390-f1230a887011',
    notes:
      'Mixed natively for 7.1.4 spatial speakers and binaural SOFA HRTF headphone virtualization. Percussion transients sweep overhead across Top-FL/Top-FR height channels while sub-bass anchors the LFE bed.',
  },
  'trk-cue-01': {
    label: 'ECM Records',
    catalog: 'ECM 1064/65 ST · CUE Archival Image',
    studio: 'Oper Köln (Cologne Opera House, Jan 24, 1975)',
    engineer: 'Martin Wieland · Produced by Manfred Eicher',
    captureChain: '2× Neumann U67 → Telefunken M-5 Tape → Archival 96.0 kHz / 24-bit CUE Image',
    mbid: 'b22940f2-79c2-46c0-9425-7a994022f4a8',
    notes:
      'Gapless virtual track split from a single monolithic FLAC+CUE archival image. Preserves pre-gap indices and uninterrupted concert hall applause across Part I and Part IIa.',
  },
};

function getLinerNotes(track: TrackSummary): LinerNotesEntry {
  return (
    LINER_NOTES_BY_TRACK[track.id] ?? {
      label: 'Reference Master Archive',
      catalog: `${track.codec} · ${track.year} Archival Transfer`,
      studio: 'Primary Reference Mastering Room',
      engineer: 'Verified Lossless Transfer',
      captureChain: track.isDsd
        ? `1-bit SDM Master (${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)})`
        : `Discrete PCM Master (${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit)`,
      mbid: 'a91f0c44-29d1-4b92-881e-44d9087f1201',
      notes:
        'Verified lossless master file indexed via SQLite FTS5 & Lofty tag inspection. Dynamic range and integrated EBU R128 loudness measured offline during watch-folder scan.',
    }
  );
}

export function NowPlayingView() {
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const signalPath = useAudioStore((s) => s.signalPath);
  const devices = useAudioStore((s) => s.devices);
  const lyricsCache = useAudioStore((s) => s.lyricsCache);
  const loadLyricsForTrack = useAudioStore((s) => s.loadLyricsForTrack);
  const playTrack = useAudioStore((s) => s.playTrack);
  const sendTransport = useAudioStore((s) => s.sendTransport);
  const setSignalPathInspectorOpen = useAudioStore((s) => s.setSignalPathInspectorOpen);
  const toggleDrawer = useAudioStore((s) => s.toggleDrawer);
  const launchSimilarAiRadio = useAudioStore((s) => s.launchSimilarAiRadio);

  const [activeTab, setActiveTab] = useState<RightPanelTab>('lyrics');
  const [activeLyricIdx, setActiveLyricIdx] = useState<number>(0);
  const activeLyricItemRef = useRef<HTMLLIElement | null>(null);

  const currentTrack = tracks.find((t) => t.id === playback?.currentTrackId) ?? tracks[0];
  const activeDevice = devices.find((d) => d.alsaId === signalPath?.activeDeviceId) ?? devices[0];
  const currentLyrics = currentTrack ? lyricsCache[currentTrack.id] : null;

  useEffect(() => {
    if (currentTrack) {
      void loadLyricsForTrack(currentTrack.id);
    }
  }, [currentTrack, loadLyricsForTrack]);

  // Low-frequency active lyric index watcher — ONLY updates React state when the lyric line index changes (zero 60 Hz renders)
  useEffect(() => {
    if (!currentLyrics || currentLyrics.lines.length === 0) return;

    const findIdx = (posMs: number) => {
      let matched = 0;
      for (let i = 0; i < currentLyrics.lines.length; i++) {
        if (posMs >= currentLyrics.lines[i].timeMs) {
          matched = i;
        } else {
          break;
        }
      }
      return matched;
    };

    let lastIdx = findIdx(useAudioStore.getState().playback?.positionMs ?? 0);
    setActiveLyricIdx(lastIdx);

    let lastCheckMs = 0;
    const unsub = useAudioStore.getState().subscribeTelemetry((frame) => {
      if (frame.timestampMs - lastCheckMs < 250) return;
      lastCheckMs = frame.timestampMs;
      const nextIdx = findIdx(frame.positionMs);
      if (nextIdx !== lastIdx) {
        lastIdx = nextIdx;
        setActiveLyricIdx(nextIdx);
      }
    });

    return () => unsub();
  }, [currentLyrics]);

  useEffect(() => {
    if (activeTab === 'lyrics' && activeLyricItemRef.current) {
      activeLyricItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLyricIdx, activeTab]);

  if (!currentTrack || !signalPath) return null;

  const bitrateStr = formatBitrateKbps(estimateTrackBitrateKbps(currentTrack));
  const formatChipText = currentTrack.isDsd
    ? `${currentTrack.codec} 1-bit / ${formatSampleRate(currentTrack.sampleRateHz, true, currentTrack.dsdRateMultiplier)}`
    : `${currentTrack.codec} ${currentTrack.bitDepth}-bit / ${formatSampleRate(currentTrack.sampleRateHz)}`;

  const queueTracks = (playback?.queueTrackIds ?? [])
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is TrackSummary => Boolean(t));

  const linerNotes = getLinerNotes(currentTrack);

  const referenceFixtures = [
    tracks.find((t) => t.id === 'trk-flac-192'),
    tracks.find((t) => t.id === 'trk-dsd-256'),
    tracks.find((t) => t.id === 'trk-atmos-714'),
    tracks.find((t) => t.id === 'trk-cue-01'),
  ].filter((t): t is TrackSummary => Boolean(t));

  const statusMeta =
    signalPath.integrity === 'bit_perfect'
      ? {
          badge: 'BIT-PERFECT',
          badgeClass: 'bg-[#10B981]/15 border-[#10B981]/45 text-[#10B981]',
          Icon: CheckCircle2,
        }
      : signalPath.integrity === 'spatial_dsp'
      ? {
          badge: 'SPATIAL DSP',
          badgeClass: 'bg-[#38BDF8]/15 border-[#38BDF8]/45 text-[#38BDF8]',
          Icon: Sparkles,
        }
      : signalPath.integrity === 'warning_fallback'
      ? {
          badge: 'FALLBACK',
          badgeClass: 'bg-[#F59E0B]/15 border-[#F59E0B]/50 text-[#F59E0B]',
          Icon: AlertTriangle,
        }
      : {
          badge: 'HALTED',
          badgeClass: 'bg-[#EF4444]/15 border-[#EF4444]/50 text-[#EF4444]',
          Icon: ShieldAlert,
        };

  const StatusIcon = statusMeta.Icon;

  return (
    <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-4">
      {/* Top Signal Path Summary Strip + Generate Similar AI Radio */}
      <header
        aria-label="Signal Path Summary Bar"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[#2B3342] bg-[#14181F] px-4 py-2"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-signal-path-trigger="true"
            onClick={() => setSignalPathInspectorOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 font-display text-[11px] font-bold tracking-[0.06em] transition-opacity hover:opacity-90 ${statusMeta.badgeClass}`}
          >
            <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{statusMeta.badge}</span>
          </button>
          <span className="truncate mono-telemetry text-xs text-[#F2F4F8]">
            {signalPath.summaryLabel}
          </span>
          <span className="hidden text-[#2B3342] sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden mono-telemetry text-[11px] text-[#9AA4B2] sm:inline">
            {activeDevice?.displayName ?? 'No DAC'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-signal-path-trigger="true"
            onClick={() => setSignalPathInspectorOpen(true)}
            className="rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-1.5 text-xs font-medium text-[#F2F4F8] transition-colors duration-150 hover:border-[#38BDF8]"
          >
            Inspect 5-Stage Path
          </button>
          <button
            type="button"
            onClick={() => toggleDrawer('dac')}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] px-3 py-1.5 text-xs font-medium text-[#F2F4F8] transition-colors duration-150 hover:border-[#10B981]"
          >
            <Cpu className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            Switch DAC
          </button>
          <button
            type="button"
            onClick={() => void launchSimilarAiRadio(currentTrack.id)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#38BDF8] px-3.5 py-1.5 text-xs font-semibold text-[#06121A] transition-colors duration-150 hover:bg-[#7DD3FC]"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            Generate Similar AI Radio
          </button>
        </div>
      </header>

      {/* Balanced 2-Column Immersive Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* Left Column: 420x420px Album Art (14px radius) + SpectrumVuCanvas + Technical Chips */}
        <section
          aria-label="Master Artwork and Live Studio Telemetry"
          className="flex flex-col gap-3"
        >
          <div className="relative w-full max-w-[420px]">
            <AlbumArtwork
              theme={currentTrack.artworkTheme}
              title={currentTrack.title}
              size="studio"
            />
            {currentTrack.cueIndex && (
              <span className="absolute top-3 right-3 rounded-[6px] border border-[#38BDF8]/50 bg-[#0B0D10]/90 px-2 py-0.5 mono-telemetry text-[10px] font-semibold text-[#38BDF8]">
                CUE SPLIT #{currentTrack.cueIndex}
              </span>
            )}
          </div>

          {/* 60 fps HTML5 Canvas FFT Spectrum + L/R True-Peak VU Meter */}
          <SpectrumVuCanvas height={196} className="w-full max-w-[420px]" />

          {/* Monospace Technical Chips */}
          <div
            aria-label="Track Technical Specifications"
            className="flex w-full max-w-[420px] flex-wrap items-center gap-x-2 gap-y-1 rounded-[10px] border border-[#2B3342] bg-[#14181F] px-3.5 py-2 mono-telemetry text-[11px]"
          >
            <span className="font-semibold text-[#F2F4F8]">{formatChipText}</span>
            <span className="text-[#2B3342]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#9AA4B2]">{bitrateStr}</span>
            <span className="text-[#2B3342]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#10B981]">DR{currentTrack.dynamicRangeDr}</span>
            <span className="text-[#2B3342]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#9AA4B2]">
              EBU R128 {currentTrack.integratedLufs.toFixed(1)} LUFS
            </span>
          </div>
        </section>

        {/* Right Column: Track Header + Reference Stream Switcher + Tabbed Lyrics / Queue / Liner Notes */}
        <section
          aria-label="Now Playing Track Details, Synced Lyrics, Queue, and Liner Notes"
          className="flex min-h-0 min-w-0 flex-col rounded-[14px] border border-[#2B3342] bg-[#14181F]"
        >
          {/* Track Identity Header */}
          <div className="border-b border-[#2B3342] px-5 pt-5 pb-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#9AA4B2]">
              <span className="font-medium text-[#F2F4F8]">{currentTrack.artist}</span>
              <span className="text-[#2B3342]" aria-hidden="true">
                /
              </span>
              <span className="truncate">{currentTrack.album}</span>
              <span className="text-[#2B3342]" aria-hidden="true">
                ·
              </span>
              <span className="mono-telemetry">{currentTrack.year}</span>
              <span className="text-[#2B3342]" aria-hidden="true">
                ·
              </span>
              <span className="mono-telemetry text-[#38BDF8]">
                {currentTrack.bpm} BPM · {currentTrack.musicalKey}
              </span>
            </div>

            <h1 className="mt-1.5 font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-[#F2F4F8] [text-wrap:balance]">
              {currentTrack.title}
            </h1>

            {/* Quick Format Reference Switcher */}
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                Reference Masters:
              </span>
              {referenceFixtures.map((trk) => {
                const isActive = trk.id === currentTrack.id;
                const shortTag = trk.isDsd
                  ? `DSD${trk.dsdRateMultiplier}`
                  : trk.isAtmos
                  ? 'TrueHD Atmos 7.1.4'
                  : trk.cueIndex
                  ? `CUE #${trk.cueIndex}`
                  : `FLAC ${trk.bitDepth}/${Math.round(trk.sampleRateHz / 1000)}`;
                return (
                  <button
                    key={trk.id}
                    type="button"
                    onClick={() => void playTrack(trk.id)}
                    className={`rounded-[6px] border px-2 py-0.5 mono-telemetry text-[10px] font-medium transition-colors duration-150 ${
                      isActive
                        ? 'border-[#10B981] bg-[#10B981]/15 text-[#10B981]'
                        : 'border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:border-[#3E495E] hover:text-[#F2F4F8]'
                    }`}
                  >
                    {shortTag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3-Tab Switcher: Synced Lyrics | Up Next Queue | Album Liner Notes & Credits */}
          <div
            role="tablist"
            aria-label="Now Playing Context Tabs"
            className="flex items-center gap-1 border-b border-[#2B3342] bg-[#0B0D10]/60 px-5 pt-2.5"
          >
            {(
              [
                { id: 'lyrics', label: 'Synced Lyrics', icon: AlignLeft },
                { id: 'queue', label: `Up Next Queue (${queueTracks.length})`, icon: ListMusic },
                { id: 'liner-notes', label: 'Album Liner Notes & Credits', icon: BookOpen },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
                    selected
                      ? 'border-[#38BDF8] text-[#F2F4F8]'
                      : 'border-transparent text-[#9AA4B2] hover:text-[#F2F4F8]'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${selected ? 'text-[#38BDF8]' : 'text-[#9AA4B2]'}`}
                    aria-hidden="true"
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Panel Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* Tab 1: LRCLIB Synced Lyrics */}
            {activeTab === 'lyrics' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 text-xs">
                  <span className="text-[#9AA4B2]">
                    Source:{' '}
                    <span className="text-[#F2F4F8]">
                      {currentLyrics?.source ?? 'LRCLIB Local SQLite Cache'}
                    </span>
                  </span>
                  <span className="mono-telemetry text-[10px] text-[#38BDF8]">
                    CLICK ANY LINE TO SEEK
                  </span>
                </div>

                {currentLyrics ? (
                  <ul className="space-y-2.5">
                    {currentLyrics.lines.map((line, idx) => {
                      const isActiveLine = idx === activeLyricIdx;
                      const cleanText = line.text.replace(/^\[[0-9:.]+\]\s*/, '');
                      return (
                        <li
                          key={`${line.timeMs}-${idx}`}
                          ref={isActiveLine ? activeLyricItemRef : null}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void sendTransport({ type: 'Seek', positionMs: line.timeMs })
                            }
                            className={`flex w-full items-baseline gap-3 rounded-[10px] px-3.5 py-2.5 text-left transition-all duration-150 ${
                              isActiveLine
                                ? 'border border-[#38BDF8]/45 bg-[#1C222D] text-[16px] font-semibold text-[#F2F4F8]'
                                : 'border border-transparent text-[14px] text-[#9AA4B2] hover:bg-[#1C222D]/50 hover:text-[#F2F4F8]'
                            }`}
                          >
                            <span
                              className={`mono-telemetry shrink-0 text-[11px] ${
                                isActiveLine ? 'text-[#38BDF8]' : 'text-[#9AA4B2]/70'
                              }`}
                            >
                              {formatTimecode(line.timeMs)}
                            </span>
                            <span className="leading-relaxed">{cleanText}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-[#9AA4B2]">Loading synced LRCLIB lyrics...</p>
                )}
              </div>
            )}

            {/* Tab 2: Up Next Gapless Queue */}
            {activeTab === 'queue' && (
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between text-xs text-[#9AA4B2]">
                  <span>Lock-free gapless ring buffer · Next track pre-decoded</span>
                  <span className="mono-telemetry text-[#F2F4F8]">{queueTracks.length} queued</span>
                </div>

                {queueTracks.map((trk, idx) => {
                  const isCurrent = trk.id === currentTrack.id;
                  const prev = idx > 0 ? queueTracks[idx - 1] : null;
                  const rateSwitch = requiresSampleRateSwitchLock(prev, trk);

                  return (
                    <div key={trk.id}>
                      {rateSwitch.required && prev && (
                        <div className="my-1.5 flex items-center gap-2 px-2 mono-telemetry text-[10px] text-[#F59E0B]">
                          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>
                            ALSA Clock Relock:{' '}
                            {formatSampleRate(prev.sampleRateHz, prev.isDsd, prev.dsdRateMultiplier)} →{' '}
                            {formatSampleRate(trk.sampleRateHz, trk.isDsd, trk.dsdRateMultiplier)}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void playTrack(trk.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-150 ${
                          isCurrent
                            ? 'border-[#10B981]/60 bg-[#1C222D]'
                            : 'border-[#2B3342] bg-[#0B0D10] hover:bg-[#1C222D]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="mono-telemetry w-5 shrink-0 text-xs text-[#9AA4B2]">
                            {isCurrent ? (
                              <Disc3 className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
                            ) : (
                              String(idx + 1).padStart(2, '0')
                            )}
                          </span>
                          <AlbumArtwork theme={trk.artworkTheme} title={trk.title} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isCurrent && (
                                <Play
                                  className="h-3 w-3 shrink-0 fill-[#10B981] text-[#10B981]"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate text-sm font-medium text-[#F2F4F8]">
                                {trk.title}
                              </span>
                            </div>
                            <div className="truncate text-xs text-[#9AA4B2]">
                              {trk.artist} · {trk.album}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right mono-telemetry text-[11px]">
                          <div className="text-[#F2F4F8]">
                            {trk.codec}{' '}
                            {formatSampleRate(trk.sampleRateHz, trk.isDsd, trk.dsdRateMultiplier)}
                          </div>
                          <div className="text-[#9AA4B2]">{formatTimecode(trk.durationMs)}</div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab 3: Album Liner Notes & Credits */}
            {activeTab === 'liner-notes' && (
              <div className="space-y-4">
                <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                  <h2 className="font-display text-sm font-semibold text-[#F2F4F8]">
                    Mastering &amp; Archival Notes
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#9AA4B2]">{linerNotes.notes}</p>
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3">
                    <dt className="text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                      Label &amp; Catalog
                    </dt>
                    <dd className="mt-1 text-xs font-medium text-[#F2F4F8]">{linerNotes.label}</dd>
                    <dd className="mt-0.5 mono-telemetry text-[11px] text-[#38BDF8]">
                      {linerNotes.catalog}
                    </dd>
                  </div>

                  <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3">
                    <dt className="text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                      Recording Venue / Studio
                    </dt>
                    <dd className="mt-1 text-xs font-medium text-[#F2F4F8]">{linerNotes.studio}</dd>
                    <dd className="mt-0.5 text-[11px] text-[#9AA4B2]">{linerNotes.engineer}</dd>
                  </div>

                  <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3 sm:col-span-2">
                    <dt className="text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                      Analog / Digital Capture Chain
                    </dt>
                    <dd className="mt-1 mono-telemetry text-xs text-[#F2F4F8]">
                      {linerNotes.captureChain}
                    </dd>
                  </div>

                  <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3 sm:col-span-2">
                    <dt className="text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                      Source Path &amp; MusicBrainz Release MBID
                    </dt>
                    <dd className="mt-1 break-all mono-telemetry text-[11px] text-[#9AA4B2]">
                      {currentTrack.path}
                    </dd>
                    <dd className="mt-1 mono-telemetry text-[11px] text-[#10B981]">
                      MBID {linerNotes.mbid}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

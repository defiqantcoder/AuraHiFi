import { useMemo, useState } from 'react';
import {
  Activity,
  AudioWaveform,
  Database,
  Play,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { formatSampleRate, formatTimecode } from '../lib/signalPathEngine';
import {
  computeSmartPlaylistResults,
  type SequencingStrategy,
  type SmartPlaylistResultItem,
} from '../lib/studioHelpers';
import { ExplainTooltip } from '../components/ui/ExplainTooltip';

type StudioModeTab = 'clap_vibe' | 'bliss_acoustic' | 'audio_sample';

const GENRE_OPTIONS = [
  'Modern Classical',
  'Acoustic Jazz',
  'Solo Piano Jazz',
  'Electronic',
  'Jazz Fusion',
  'Post-Rock',
];

const AUDIO_SAMPLE_FIXTURES = [
  { id: 'smp-piano', label: 'Felt Upright Piano Phrase (16s · 84 BPM · D min)' },
  { id: 'smp-jazz', label: 'Acoustic Brush Trio Swing (12s · 108 BPM · Bb maj)' },
  { id: 'smp-synth', label: 'Analog Sub-Bass & Spatial Bed (14s · 118 BPM · F min)' },
];

export function SmartPlaylistView() {
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const smartPlaylistSeedTrackId = useAudioStore((s) => s.smartPlaylistSeedTrackId);
  const playTrack = useAudioStore((s) => s.playTrack);
  const generateSmartPlaylist = useAudioStore((s) => s.generateSmartPlaylist);
  const smartPlaylistEngineMode = useAudioStore((s) => s.smartPlaylistEngineMode);
  const setSmartPlaylistEngineMode = useAudioStore((s) => s.setSmartPlaylistEngineMode);
  const geminiModel = useAudioStore((s) => s.geminiModel);
  const credentialStatuses = useAudioStore((s) => s.credentialStatuses);
  const setActiveRoute = useAudioStore((s) => s.setActiveRoute);

  const [modeTab, setModeTab] = useState<StudioModeTab>(
    smartPlaylistSeedTrackId ? 'bliss_acoustic' : 'clap_vibe'
  );
  const [prompt, setPrompt] = useState('Late-night acoustic jazz & dynamic piano masters');
  const [sampleId, setSampleId] = useState(AUDIO_SAMPLE_FIXTURES[0].id);
  const [seedTrackId, setSeedTrackId] = useState<string>(
    smartPlaylistSeedTrackId ?? tracks[0]?.id ?? 'trk-flac-192'
  );
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(140);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [losslessHiResOnly, setLosslessHiResOnly] = useState(true);
  const [strategy, setStrategy] = useState<SequencingStrategy>('seeded_flow');
  const [trackCount, setTrackCount] = useState(8);
  const [isGenerating, setIsGenerating] = useState(false);

  const seedTrack = tracks.find((t) => t.id === seedTrackId) ?? tracks[0];

  const computeCurrent = () =>
    computeSmartPlaylistResults({
      tracks,
      mode: modeTab === 'clap_vibe' ? 'clap_vibe' : modeTab === 'bliss_acoustic' ? 'bliss_acoustic' : 'hybrid',
      prompt: modeTab === 'audio_sample' ? AUDIO_SAMPLE_FIXTURES.find((s) => s.id === sampleId)?.label ?? prompt : prompt,
      seedTrackId: seedTrack?.id,
      bpmMin,
      bpmMax,
      selectedGenres,
      losslessHiResOnly,
      strategy,
      maxTracks: trackCount,
    });

  const [results, setResults] = useState<SmartPlaylistResultItem[]>(() => computeCurrent());

  const livePreview = useMemo(() => results, [results]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    await generateSmartPlaylist({
      mode: modeTab === 'clap_vibe' ? 'clap_vibe' : modeTab === 'bliss_acoustic' ? 'bliss_acoustic' : 'hybrid',
      prompt,
      seedTrackId: seedTrack?.id,
      formatFilter: losslessHiResOnly ? 'all' : 'all',
      maxTracks: trackCount,
    });
    setResults(computeCurrent());
    setIsGenerating(false);
  };

  const bpmMinPct = ((bpmMin - 50) / (160 - 50)) * 100;
  const bpmMaxPct = ((bpmMax - 50) / (160 - 50)) * 100;

  return (
    <div className="@container mx-auto max-w-[1260px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#F2F4F8]">
            AI Smart Playlist Studio
          </h1>
          <p className="mt-1 text-sm text-[#9AA4B2]">
            Offline Bliss acoustic descriptor KNN &amp; CLAP embeddings queried locally via{' '}
            <span className="mono-telemetry text-[#38BDF8]">sqlite-vec</span>.
          </p>
        </div>
      </header>

      {/* Split Layout: Left 380px Control Panel + Right Live Preview Table */}
      <div className="flex flex-col gap-5 @[880px]:flex-row @[880px]:items-start">
        {/* Left Control Panel (380px) */}
        <form
          onSubmit={(e) => void handleGenerate(e)}
          className="flex w-full shrink-0 flex-col justify-between rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 @[880px]:w-[380px]"
        >
          <div className="space-y-5">
            {/* Engine Mode Switcher & Gemini Key Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#9AA4B2] uppercase tracking-wider">
                  Engine Mode
                </span>
                <ExplainTooltip termId="gemini_playlist">
                  <button
                    type="button"
                    onClick={() => setActiveRoute('settings')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                      credentialStatuses.gemini?.configured
                        ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30 hover:bg-[#10B981]/30'
                        : 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 hover:bg-[#F59E0B]/30'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        credentialStatuses.gemini?.configured ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
                      }`}
                    />
                    <span>
                      {credentialStatuses.gemini?.configured
                        ? `Gemini Connected (${geminiModel})`
                        : 'Gemini Key Not Set → Settings'}
                    </span>
                  </button>
                </ExplainTooltip>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] p-1">
                {(
                  [
                    { id: 'auto', label: 'Auto (Gemini + Local)' },
                    { id: 'online', label: 'Online (Gemini)' },
                    { id: 'offline', label: 'Offline Only' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSmartPlaylistEngineMode(m.id)}
                    className={`rounded-[6px] px-1.5 py-1.5 text-center text-[10.5px] font-semibold transition-colors ${
                      smartPlaylistEngineMode === m.id
                        ? 'bg-[#10B981] text-[#0B0D10]'
                        : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode Tabs */}
            <div
              role="tablist"
              aria-label="Smart Playlist Query Mode"
              className="grid grid-cols-3 gap-1 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] p-1"
            >
              {(
                [
                  { id: 'clap_vibe', label: 'Vibe Prompt (CLAP)' },
                  { id: 'bliss_acoustic', label: 'From Seed Track' },
                  { id: 'audio_sample', label: 'Audio Sample Match' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={modeTab === tab.id}
                  onClick={() => setModeTab(tab.id)}
                  className={`rounded-[6px] px-1.5 py-1.5 text-center text-[11px] leading-tight font-semibold transition-colors duration-150 ${
                    modeTab === tab.id
                      ? 'bg-[#38BDF8] text-[#06121A]'
                      : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Prompt Input or Sample Selector */}
            {modeTab === 'audio_sample' ? (
              <div>
                <label
                  htmlFor="audio-sample-select"
                  className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]"
                >
                  Reference Audio Clip (CLAP Embedding)
                </label>
                <select
                  id="audio-sample-select"
                  value={sampleId}
                  onChange={(e) => setSampleId(e.target.value)}
                  className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                >
                  {AUDIO_SAMPLE_FIXTURES.map((smp) => (
                    <option key={smp.id} value={smp.id}>
                      {smp.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="clap-vibe-prompt"
                  className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]"
                >
                  {modeTab === 'clap_vibe'
                    ? 'Plain-Language Vibe & Mood Prompt'
                    : 'Acoustic Similarity Notes'}
                </label>
                <textarea
                  id="clap-vibe-prompt"
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe vibe, mood, era, tempo, or instrumentation in plain language (e.g. 'Late night introspective piano trio with brushed snare and deep analog warmth')."
                  className="w-full resize-none rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 text-xs leading-relaxed text-[#F2F4F8] placeholder:text-[#6B7280] focus:border-[#38BDF8] focus:outline-none"
                />
              </div>
            )}

            {/* Seed Track Card with BPM & Key */}
            {seedTrack && (
              <div className="space-y-2">
                <label
                  htmlFor="seed-track-select"
                  className="block text-xs font-semibold text-[#F2F4F8]"
                >
                  Seed Track Anchor
                </label>
                <select
                  id="seed-track-select"
                  value={seedTrack.id}
                  onChange={(e) => setSeedTrackId(e.target.value)}
                  className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-1.5 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.artist} — {t.title} ({t.bpm} BPM)
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-3 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-2.5">
                  <AlbumArtwork theme={seedTrack.artworkTheme} title={seedTrack.title} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[#F2F4F8]">
                      {seedTrack.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 mono-telemetry text-[11px] text-[#38BDF8]">
                      <span>{seedTrack.bpm} BPM</span>
                      <span className="text-[#2B3342]" aria-hidden="true">·</span>
                      <span>{seedTrack.musicalKey}</span>
                      <span className="text-[#2B3342]" aria-hidden="true">·</span>
                      <span className="text-[#9AA4B2]">DR{seedTrack.dynamicRangeDr}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dual-Handle BPM Range Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F2F4F8]">BPM Tempo Window</span>
                <span className="mono-telemetry text-[#38BDF8]">
                  {bpmMin} – {bpmMax} BPM
                </span>
              </div>

              {/* Visual range bar */}
              <div className="relative h-2 rounded-full bg-[#0B0D10] border border-[#2B3342]">
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-[#38BDF8]"
                  style={{
                    left: `${Math.max(0, bpmMinPct)}%`,
                    width: `${Math.max(4, bpmMaxPct - bpmMinPct)}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="bpm-min-slider" className="mb-1 block text-[11px] text-[#9AA4B2]">
                    Min BPM ({bpmMin})
                  </label>
                  <input
                    id="bpm-min-slider"
                    type="range"
                    min={50}
                    max={150}
                    value={bpmMin}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBpmMin(Math.min(val, bpmMax - 5));
                    }}
                    className="studio-slider w-full"
                  />
                </div>
                <div>
                  <label htmlFor="bpm-max-slider" className="mb-1 block text-[11px] text-[#9AA4B2]">
                    Max BPM ({bpmMax})
                  </label>
                  <input
                    id="bpm-max-slider"
                    type="range"
                    min={60}
                    max={160}
                    value={bpmMax}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBpmMax(Math.max(val, bpmMin + 5));
                    }}
                    className="studio-slider w-full"
                  />
                </div>
              </div>
            </div>

            {/* Genre Chips */}
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                Genre Constraints
              </span>
              <div className="flex flex-wrap gap-1.5">
                {GENRE_OPTIONS.map((genre) => {
                  const active = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleGenre(genre)}
                      className={`rounded-[6px] px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
                        active
                          ? 'bg-[#38BDF8] text-[#06121A] font-semibold'
                          : 'border border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]'
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lossless / Hi-Res Only Toggle */}
            <div className="flex items-center justify-between rounded-[8px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2.5">
              <div>
                <div className="text-xs font-semibold text-[#F2F4F8]">Lossless / Hi-Res Only</div>
                <div className="text-[11px] text-[#9AA4B2]">Exclude 16/44.1 Redbook transfers</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={losslessHiResOnly}
                aria-label="Lossless / Hi-Res Only"
                onClick={() => setLosslessHiResOnly(!losslessHiResOnly)}
                className={`rounded-full px-2.5 py-0.5 mono-telemetry text-[10px] font-semibold ${
                  losslessHiResOnly
                    ? 'bg-[#38BDF8] text-[#06121A]'
                    : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                }`}
              >
                {losslessHiResOnly ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Sequencing Strategy Segmented Control */}
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                Sequencing Strategy
              </span>
              <div
                role="group"
                aria-label="Playlist Sequencing Strategy"
                className="grid grid-cols-3 gap-1 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] p-1"
              >
                {(
                  [
                    { id: 'closest_match', label: 'Closest Match' },
                    { id: 'seeded_flow', label: 'Seeded Flow Path' },
                    { id: 'album_similarity', label: 'Album Similarity' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={strategy === st.id}
                    onClick={() => setStrategy(st.id)}
                    className={`rounded-[6px] px-2 py-1.5 text-[11px] font-medium transition-colors duration-150 ${
                      strategy === st.id
                        ? 'bg-[#1C222D] text-[#38BDF8] border border-[#38BDF8]/50 font-semibold'
                        : 'border border-transparent text-[#9AA4B2] hover:text-[#F2F4F8]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Track Count Slider */}
            <div>
              <label
                htmlFor="playlist-track-count"
                className="mb-1 flex items-center justify-between text-xs font-semibold text-[#F2F4F8]"
              >
                <span>Track Count</span>
                <span className="mono-telemetry text-[#38BDF8]">{trackCount} tracks</span>
              </label>
              <input
                id="playlist-track-count"
                type="range"
                min={3}
                max={20}
                value={trackCount}
                onChange={(e) => setTrackCount(Number(e.target.value))}
                className="studio-slider w-full"
              />
            </div>

            {/* Cyan Generate CTA */}
            <button
              type="submit"
              disabled={isGenerating}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#38BDF8] px-4 py-2.5 text-xs font-semibold text-[#06121A] transition-colors duration-150 hover:bg-[#7DD3FC]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {isGenerating ? 'Computing Vector Path...' : 'Generate Offline Playlist'}
            </button>
          </div>

          {/* sqlite-vec Indexing Footer */}
          <div className="mt-5 flex items-center justify-between border-t border-[#2B3342] pt-3 text-[11px] text-[#9AA4B2]">
            <span className="inline-flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              <span className="mono-telemetry">sqlite-vec</span>
            </span>
            <span className="mono-telemetry text-[#10B981]">
              {tracks.length}/{tracks.length} Indexed (Bliss + CLAP)
            </span>
          </div>
        </form>

        {/* Right Live Preview Table */}
        <section
          aria-label="Live Smart Playlist Preview"
          className="min-w-0 flex-1 rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3342] pb-3.5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                Live Vector Sequence Preview
              </h2>
              <p className="mt-0.5 text-xs text-[#9AA4B2]">
                Strategy:{' '}
                <span className="mono-telemetry text-[#38BDF8]">
                  {strategy === 'closest_match'
                    ? 'Closest Match'
                    : strategy === 'seeded_flow'
                    ? 'Seeded Flow Path'
                    : 'Album Similarity'}
                </span>{' '}
                · <span className="mono-telemetry text-[#F2F4F8]">{livePreview.length}</span> tracks matched
              </p>
            </div>

            {livePreview.length > 0 && (
              <button
                type="button"
                onClick={() => void playTrack(livePreview[0].track.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/50 bg-[#0B0D10] px-3.5 py-1.5 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8] hover:text-[#06121A]"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Play Sequence
              </button>
            )}
          </div>

          {livePreview.length === 0 ? (
            <div className="py-12 text-center">
              <SlidersHorizontal className="mx-auto h-6 w-6 text-[#9AA4B2]" aria-hidden="true" />
              <p className="mt-2 text-sm text-[#F2F4F8]">No tracks fall within your current BPM &amp; genre filters.</p>
              <p className="mt-1 text-xs text-[#9AA4B2]">
                Widen the BPM range or clear a genre constraint, then click Generate Offline Playlist.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {livePreview.map((item, idx) => {
                const { track, matchScorePct, transitionNote, transitionTone } = item;
                const isCurrent = playback?.currentTrackId === track.id;

                return (
                  <div key={track.id} className="space-y-1.5">
                    {idx > 0 && (
                      <div className="flex items-center gap-2 pl-4 mono-telemetry text-[10px]">
                        <Activity
                          className={`h-3 w-3 ${
                            transitionTone === 'clock_lock'
                              ? 'text-[#F59E0B]'
                              : transitionTone === 'harmonic'
                              ? 'text-[#10B981]'
                              : 'text-[#38BDF8]'
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          className={
                            transitionTone === 'clock_lock'
                              ? 'text-[#F59E0B]'
                              : transitionTone === 'harmonic'
                              ? 'text-[#10B981]'
                              : 'text-[#9AA4B2]'
                          }
                        >
                          {transitionNote}
                        </span>
                      </div>
                    )}

                    <div
                      className={`rounded-[10px] border p-3 transition-colors duration-150 ${
                        isCurrent
                          ? 'border-[#38BDF8] bg-[#1C222D]'
                          : 'border-[#2B3342] bg-[#0B0D10] hover:bg-[#1C222D]'
                      }`}
                    >
                      {/* Top Row: Rank, Cover, Full Title/Artist & Duration */}
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => void playTrack(track.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="mono-telemetry w-5 shrink-0 text-xs text-[#9AA4B2]">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <AlbumArtwork theme={track.artworkTheme} title={track.title} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[#F2F4F8]">
                              {track.title}
                            </div>
                            <div className="truncate text-xs text-[#9AA4B2]">
                              {track.artist} · {track.album}
                            </div>
                          </div>
                        </button>

                        <span className="mono-telemetry shrink-0 text-xs text-[#9AA4B2]">
                          {formatTimecode(track.durationMs)}
                        </span>
                      </div>

                      {/* Bottom Row: Monospace BPM/Key/Format Badges + Match Score % Bar */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#2B3342]/70 pt-2.5 pl-8">
                        <div className="flex flex-wrap items-center gap-1.5 mono-telemetry text-[11px]">
                          <span className="rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2 py-0.5 text-[#F2F4F8]">
                            {track.bpm} BPM
                          </span>
                          <span className="rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2 py-0.5 text-[#9AA4B2]">
                            {track.musicalKey}
                          </span>
                          <span className="rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2 py-0.5 text-[#38BDF8]">
                            {track.codec}{' '}
                            {formatSampleRate(track.sampleRateHz, track.isDsd, track.dsdRateMultiplier)}
                          </span>
                        </div>

                        <div className="flex w-32 shrink-0 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1C222D]">
                            <div
                              className="h-full rounded-full bg-[#38BDF8]"
                              style={{ width: `${matchScorePct}%` }}
                            />
                          </div>
                          <span className="mono-telemetry w-9 text-right text-xs font-semibold text-[#38BDF8]">
                            {matchScorePct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 border-t border-[#2B3342] pt-3 text-[11px] text-[#9AA4B2]">
            <AudioWaveform className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
            <span>
              Zero cloud uploads — all embeddings evaluated locally in-process against SQLite{' '}
              <span className="mono-telemetry text-[#F2F4F8]">library.db</span>.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

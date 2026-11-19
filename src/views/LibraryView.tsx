import { useMemo, useState } from 'react';
import {
  Disc3,
  Folder,
  FolderPlus,
  FolderSearch,
  Loader2,
  Play,
  Scissors,
  X,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { formatSampleRate, formatTimecode } from '../lib/signalPathEngine';
import type { TrackSummary } from '../lib/audioBridge';
import { ExplainTooltip } from '../components/ui/ExplainTooltip';

type LibraryTab = 'albums' | 'artists' | 'tracks' | 'hires_dsd' | 'atmos' | 'folders_cue';
type FormatFilterPill = 'all' | 'flac24' | 'dsd' | 'atmos';
type SortOption = 'artist' | 'year_desc' | 'sample_rate_desc' | 'dr_desc';

interface AlbumGroup {
  album: string;
  artist: string;
  year: number;
  genre: string;
  artworkTheme: TrackSummary['artworkTheme'];
  tracks: TrackSummary[];
  primaryFormatChip: string;
  formatTone: 'emerald' | 'cyan' | 'amber';
  hasCue: boolean;
  maxSampleRateHz: number;
  avgDr: number;
}

function getAlbumFormatChip(tracks: TrackSummary[]): { chip: string; tone: 'emerald' | 'cyan' | 'amber' } {
  const first = tracks[0];
  if (first.isDsd) {
    return { chip: `DSD${first.dsdRateMultiplier ?? 128}`, tone: 'amber' };
  }
  if (first.isAtmos) {
    return { chip: 'ATMOS 7.1.4', tone: 'cyan' };
  }
  const khz = Math.round(first.sampleRateHz / 1000);
  return { chip: `${first.bitDepth}/${khz} ${first.codec}`, tone: 'emerald' };
}

export function LibraryView() {
  const tracks = useAudioStore((s) => s.tracks);
  const playback = useAudioStore((s) => s.playback);
  const playTrack = useAudioStore((s) => s.playTrack);
  const lastScanJob = useAudioStore((s) => s.lastScanJob);
  const pickAndAddFolder = useAudioStore((s) => s.pickAndAddFolder);
  const addMusicFolder = useAudioStore((s) => s.addMusicFolder);
  const rescanAllFolders = useAudioStore((s) => s.rescanAllFolders);
  const libraryFolders = useAudioStore((s) => s.libraryFolders);
  const defaultMusicDirExists = useAudioStore((s) => s.defaultMusicDirExists);
  const defaultMusicDirPath = useAudioStore((s) => s.defaultMusicDirPath);
  const scanProgress = useAudioStore((s) => s.scanProgress);

  const [activeTab, setActiveTab] = useState<LibraryTab>('albums');
  const [formatFilter, setFormatFilter] = useState<FormatFilterPill>('all');
  const [sortBy, setSortBy] = useState<SortOption>('sample_rate_desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const tabs: { id: LibraryTab; label: string }[] = [
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'tracks', label: 'Tracks' },
    { id: 'hires_dsd', label: 'Hi-Res & DSD' },
    { id: 'atmos', label: 'Atmos / Multichannel' },
    { id: 'folders_cue', label: 'Folders & CUE' },
  ];

  const filterPills: { id: FormatFilterPill; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'flac24', label: 'FLAC 24-bit' },
    { id: 'dsd', label: 'DSD' },
    { id: 'atmos', label: 'TrueHD Atmos' },
  ];

  // Apply tab + filter pill + search query
  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tracks
      .filter((t) => {
        if (activeTab === 'hires_dsd' && !t.isDsd && t.sampleRateHz < 88200) return false;
        if (activeTab === 'atmos' && !t.isAtmos && t.channels <= 2) return false;
        if (activeTab === 'folders_cue' && !t.cueIndex && !t.path.includes('Live_CUE')) return false;

        if (formatFilter === 'flac24' && (t.codec !== 'FLAC' || t.bitDepth < 24)) return false;
        if (formatFilter === 'dsd' && !t.isDsd) return false;
        if (formatFilter === 'atmos' && !t.isAtmos) return false;

        if (q && !`${t.title} ${t.artist} ${t.album} ${t.codec} ${t.path}`.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'artist') return a.artist.localeCompare(b.artist);
        if (sortBy === 'year_desc') return b.year - a.year;
        if (sortBy === 'dr_desc') return b.dynamicRangeDr - a.dynamicRangeDr;
        return b.sampleRateHz - a.sampleRateHz;
      });
  }, [tracks, activeTab, formatFilter, searchQuery, sortBy]);

  // Group albums cleanly
  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, TrackSummary[]>();
    for (const t of filteredTracks) {
      const existing = map.get(t.album) ?? [];
      existing.push(t);
      map.set(t.album, existing);
    }

    const groups: AlbumGroup[] = Array.from(map.entries()).map(([albumName, albumTracks]) => {
      const { chip, tone } = getAlbumFormatChip(albumTracks);
      const avgDr = Math.round(
        albumTracks.reduce((acc, item) => acc + item.dynamicRangeDr, 0) / albumTracks.length
      );
      return {
        album: albumName,
        artist: albumTracks[0].albumArtist,
        year: albumTracks[0].year,
        genre: albumTracks[0].genre,
        artworkTheme: albumTracks[0].artworkTheme,
        tracks: albumTracks,
        primaryFormatChip: chip,
        formatTone: tone,
        hasCue: albumTracks.some((t) => Boolean(t.cueIndex)),
        maxSampleRateHz: Math.max(...albumTracks.map((t) => t.sampleRateHz)),
        avgDr,
      };
    });

    return groups.sort((a, b) => {
      if (sortBy === 'artist') return a.artist.localeCompare(b.artist);
      if (sortBy === 'year_desc') return b.year - a.year;
      if (sortBy === 'dr_desc') return b.avgDr - a.avgDr;
      return b.maxSampleRateHz - a.maxSampleRateHz;
    });
  }, [filteredTracks, sortBy]);

  // Group artists for Artists tab
  const artists = useMemo(() => {
    const map = new Map<string, { artist: string; albums: Set<string>; tracks: TrackSummary[] }>();
    for (const t of filteredTracks) {
      const entry = map.get(t.artist) ?? { artist: t.artist, albums: new Set<string>(), tracks: [] };
      entry.albums.add(t.album);
      entry.tracks.push(t);
      map.set(t.artist, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist));
  }, [filteredTracks]);

  const selectedAlbum = albums.find((a) => a.album === selectedAlbumKey) ?? null;

  const isScanning = scanning || (scanProgress !== null && !scanProgress.isComplete);

  const handleScan = async () => {
    setScanning(true);
    try {
      if (libraryFolders.length > 0) {
        await rescanAllFolders();
      } else {
        await pickAndAddFolder();
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#F2F4F8]">
            Master Library
          </h1>
          <p className="mt-1 text-sm text-[#9AA4B2]">
            SQLite FTS5 &amp; Lofty lossless catalog · <span className="mono-telemetry text-[#F2F4F8]">{tracks.length}</span>{' '}
            indexed masters across <span className="mono-telemetry text-[#F2F4F8]">{albums.length}</span> releases.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ExplainTooltip termId="add_music_folder">
            <button
              type="button"
              onClick={() => void pickAndAddFolder()}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#10B981] px-3.5 py-2 text-xs font-semibold text-[#0B0D10] transition-colors duration-150 hover:bg-[#059669] shadow"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              <span>+ Add Music Folder</span>
            </button>
          </ExplainTooltip>

          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={isScanning}
            className="inline-flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3.5 py-2 text-xs font-semibold text-[#F2F4F8] transition-colors duration-150 hover:border-[#10B981]"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" aria-hidden="true" />
            ) : (
              <FolderSearch className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
            )}
            {isScanning ? 'Scanning Watch Folders...' : 'Scan Watch Folders'}
          </button>
        </div>
      </header>

      {lastScanJob && (
        <div className="rounded-[10px] border border-[#10B981]/35 bg-[#14181F] px-4 py-2.5 text-xs text-[#9AA4B2]">
          Job <span className="mono-telemetry text-[#10B981]">{lastScanJob.jobId}</span> indexed{' '}
          <span className="mono-telemetry text-[#F2F4F8]">{lastScanJob.discoveredFiles}</span> files and split{' '}
          <span className="mono-telemetry text-[#F2F4F8]">{lastScanJob.cueSheetsSplit}</span> CUE image sheet.
        </div>
      )}

      {/* Live Scan Progress Indicator */}
      {scanProgress && !scanProgress.isComplete && (
        <div className="rounded-[10px] border border-[#2B3342] bg-[#14181F] p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" />
              <span className="font-medium text-[#F2F4F8]">Indexing Music Files...</span>
            </div>
            <span className="font-mono text-[#10B981] text-xs">
              {scanProgress.filesScanned} files scanned · {scanProgress.tracksAdded} tracks added
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#0B0D10] overflow-hidden">
            <div className="h-full bg-[#10B981] w-2/3 animate-pulse" />
          </div>
          {scanProgress.currentDirectory && (
            <div className="mt-1.5 font-mono text-[10.5px] text-[#9AA4B2] truncate">
              Directory: {scanProgress.currentDirectory}
            </div>
          )}
        </div>
      )}

      {/* Empty State Card when tracks.length === 0 */}
      {tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#2B3342] bg-[#14181F] p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1C222D] border border-[#2B3342] text-[#10B981] mb-4">
            <Disc3 className="h-7 w-7 opacity-80" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#F2F4F8]">Your Library is Empty</h2>
          <p className="mt-1 text-xs text-[#9AA4B2] max-w-md">
            No lossless tracks have been indexed into SQLite library.db yet. Add a music folder containing FLAC, WAV, ALAC, DSD, or CUE files to get started.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <ExplainTooltip termId="add_music_folder">
              <button
                type="button"
                onClick={() => void pickAndAddFolder()}
                className="inline-flex items-center gap-2 rounded-[8px] bg-[#10B981] px-5 py-2.5 text-xs font-bold text-[#0B0D10] hover:bg-[#059669] transition-all shadow-lg shadow-[#10B981]/20"
              >
                <FolderPlus className="h-4 w-4" />
                <span>+ Add Music Folder</span>
              </button>
            </ExplainTooltip>
            {defaultMusicDirExists && defaultMusicDirPath && !libraryFolders.some((f) => f.path === defaultMusicDirPath) && (
              <button
                type="button"
                onClick={() => void addMusicFolder(defaultMusicDirPath)}
                className="inline-flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-4 py-2.5 text-xs font-medium text-[#F2F4F8] hover:border-[#10B981] transition-all"
              >
                <Folder className="h-4 w-4 text-[#10B981]" />
                <span>Add ~/Music</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary Section Tabs */}
      <div
        role="tablist"
        aria-label="Library Categories"
        className="flex flex-wrap items-center gap-1 border-b border-[#2B3342] pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedAlbumKey(null);
            }}
            className={`rounded-[8px] px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
              activeTab === tab.id
                ? 'border border-[#2B3342] bg-[#1C222D] text-[#F2F4F8]'
                : 'border border-transparent text-[#9AA4B2] hover:bg-[#14181F] hover:text-[#F2F4F8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Pills + Visible-Label Sort Dropdown + Visible-Label Search */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[12px] border border-[#2B3342] bg-[#14181F] p-3.5">
        <div>
          <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
            Format Filter
          </span>
          <div role="group" aria-label="Filter by audio format" className="flex flex-wrap items-center gap-1.5">
            {filterPills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                aria-pressed={formatFilter === pill.id}
                onClick={() => setFormatFilter(pill.id)}
                className={`rounded-[6px] px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                  formatFilter === pill.id
                    ? 'bg-[#10B981] text-[#06130E] font-semibold'
                    : 'border border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="library-sort-select"
              className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase"
            >
              Sort Releases
            </label>
            <select
              id="library-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-1.5 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
            >
              <option value="sample_rate_desc">Sample Rate (Highest First)</option>
              <option value="dr_desc">Dynamic Range (DR Highest)</option>
              <option value="year_desc">Release Year (Newest)</option>
              <option value="artist">Artist (A–Z)</option>
            </select>
          </div>

          <div className="w-56">
            <label
              htmlFor="library-search-input"
              className="mb-1.5 block text-[11px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase"
            >
              Filter Catalog
            </label>
            <input
              id="library-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Album, artist, codec..."
              className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-1.5 text-xs text-[#F2F4F8] placeholder:text-[#9AA4B2] focus:border-[#38BDF8] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Clickable Album Detail Tracklist Panel */}
      {selectedAlbum && (
        <section
          aria-label={`Album Detail: ${selectedAlbum.album}`}
          className="rounded-[14px] border border-[#10B981]/50 bg-[#14181F] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2B3342] pb-4">
            <div className="flex items-center gap-4">
              <AlbumArtwork theme={selectedAlbum.artworkTheme} title={selectedAlbum.album} size="lg" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2 py-0.5 mono-telemetry text-[11px] text-[#10B981]">
                    {selectedAlbum.primaryFormatChip}
                  </span>
                  {selectedAlbum.hasCue && (
                    <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2 py-0.5 mono-telemetry text-[11px] text-[#38BDF8]">
                      <Scissors className="h-3 w-3" aria-hidden="true" />
                      CUE-Split Disc Image
                    </span>
                  )}
                  <span className="mono-telemetry text-xs text-[#9AA4B2]">
                    {selectedAlbum.year} · DR{selectedAlbum.avgDr}
                  </span>
                </div>
                <h2 className="mt-1.5 font-display text-xl font-semibold text-[#F2F4F8]">
                  {selectedAlbum.album}
                </h2>
                <p className="text-sm text-[#9AA4B2]">{selectedAlbum.artist}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void playTrack(selectedAlbum.tracks[0].id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981] px-4 py-1.5 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Play Album
              </button>
              <button
                type="button"
                onClick={() => setSelectedAlbumKey(null)}
                aria-label="Close album tracklist"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <ul className="mt-3 divide-y divide-[#2B3342]">
            {selectedAlbum.tracks.map((trk, idx) => {
              const isPlaying = playback?.currentTrackId === trk.id;
              return (
                <li key={trk.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => void playTrack(trk.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left group"
                  >
                    <span className="mono-telemetry w-6 text-xs text-[#9AA4B2] group-hover:text-[#10B981]">
                      {isPlaying ? '▶' : String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-medium ${isPlaying ? 'text-[#10B981]' : 'text-[#F2F4F8]'}`}>
                        {trk.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 mono-telemetry text-[11px] text-[#9AA4B2]">
                        {trk.cueIndex && (
                          <span className="text-[#38BDF8]">
                            CUE #{trk.cueIndex} ({formatTimecode(trk.cueStartMs ?? 0)} →{' '}
                            {formatTimecode(trk.cueEndMs ?? trk.durationMs)})
                          </span>
                        )}
                        <span>{trk.path}</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-3 mono-telemetry text-xs text-[#9AA4B2]">
                    <span className="text-[#F2F4F8]">
                      {trk.isDsd
                        ? formatSampleRate(trk.sampleRateHz, true, trk.dsdRateMultiplier)
                        : `${formatSampleRate(trk.sampleRateHz)} / ${trk.bitDepth}b`}
                    </span>
                    <span>DR{trk.dynamicRangeDr}</span>
                    <span className="text-[#F2F4F8]">{formatTimecode(trk.durationMs)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Tab Content Views */}
      {(activeTab === 'albums' || activeTab === 'hires_dsd' || activeTab === 'atmos') && (
        <section aria-label="Album Grid">
          {albums.length === 0 ? (
            <div className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-10 text-center text-sm text-[#9AA4B2]">
              No releases match the selected format filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {albums.map((alb) => {
                const isSelected = selectedAlbumKey === alb.album;
                const chipClass =
                  alb.formatTone === 'amber'
                    ? 'border-[#F59E0B]/50 text-[#F59E0B]'
                    : alb.formatTone === 'cyan'
                    ? 'border-[#38BDF8]/50 text-[#38BDF8]'
                    : 'border-[#10B981]/50 text-[#10B981]';

                return (
                  <button
                    key={alb.album}
                    type="button"
                    onClick={() => setSelectedAlbumKey(isSelected ? null : alb.album)}
                    className={`group flex flex-col rounded-[12px] border p-3.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
                      isSelected
                        ? 'border-[#10B981] bg-[#1C222D]'
                        : 'border-[#2B3342] bg-[#14181F] hover:border-[#3E495E] hover:bg-[#1C222D]'
                    }`}
                  >
                    <div className="relative w-full aspect-square overflow-hidden rounded-[8px]">
                      <AlbumArtwork
                        theme={alb.artworkTheme}
                        title={alb.album}
                        size="xl"
                        className="h-full w-full"
                      />
                      <span
                        className={`absolute bottom-2 left-2 rounded-[6px] border bg-[#0B0D10]/90 px-2 py-0.5 mono-telemetry text-[10px] font-semibold ${chipClass}`}
                      >
                        {alb.primaryFormatChip}
                      </span>
                      {alb.hasCue && (
                        <span className="absolute top-2 right-2 rounded-[6px] border border-[#38BDF8]/50 bg-[#0B0D10]/90 px-2 py-0.5 mono-telemetry text-[10px] font-semibold text-[#38BDF8]">
                          CUE
                        </span>
                      )}
                    </div>

                    <div className="mt-3 min-w-0">
                      <div className="truncate font-display text-sm font-semibold text-[#F2F4F8]">
                        {alb.album}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[#9AA4B2]">{alb.artist}</div>
                      <div className="mt-2 flex items-center justify-between border-t border-[#2B3342] pt-2 mono-telemetry text-[11px] text-[#9AA4B2]">
                        <span>
                          {alb.year} · DR{alb.avgDr}
                        </span>
                        <span className="text-[#F2F4F8]">
                          {alb.tracks.length} {alb.tracks.length === 1 ? 'track' : 'tracks'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'artists' && (
        <section aria-label="Artists List" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {artists.map((art) => (
            <div
              key={art.artist}
              className="flex items-center justify-between gap-4 rounded-[12px] border border-[#2B3342] bg-[#14181F] p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#2B3342] bg-[#0B0D10]">
                  <Disc3 className="h-5 w-5 text-[#10B981]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-semibold text-[#F2F4F8]">
                    {art.artist}
                  </div>
                  <div className="mono-telemetry text-xs text-[#9AA4B2]">
                    {art.albums.size} {art.albums.size === 1 ? 'album' : 'albums'} · {art.tracks.length} tracks
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void playTrack(art.tracks[0].id)}
                className="rounded-[6px] border border-[#2B3342] bg-[#1C222D] px-3 py-1.5 text-xs font-medium text-[#F2F4F8] hover:border-[#10B981]"
              >
                Play Top Master
              </button>
            </div>
          ))}
        </section>
      )}

      {(activeTab === 'tracks' || activeTab === 'folders_cue') && (
        <div className="overflow-x-auto rounded-[14px] border border-[#2B3342] bg-[#14181F]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#2B3342] text-[11px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                <th className="py-3 pl-4 pr-2 w-10">#</th>
                <th className="py-3 px-2">Track / Path</th>
                <th className="py-3 px-2">Format</th>
                <th className="py-3 px-2 text-right">Sample Rate</th>
                <th className="py-3 px-2 text-right">DR / LUFS</th>
                <th className="py-3 pl-2 pr-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2B3342]">
              {filteredTracks.map((trk, idx) => {
                const isPlaying = playback?.currentTrackId === trk.id;
                return (
                  <tr
                    key={trk.id}
                    className={isPlaying ? 'bg-[#1C222D]' : 'hover:bg-[#1C222D]/60'}
                  >
                    <td className="py-2.5 pl-4 pr-2">
                      <button
                        type="button"
                        onClick={() => void playTrack(trk.id)}
                        aria-label={`Play ${trk.title}`}
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#0B0D10] hover:text-[#10B981]"
                      >
                        {isPlaying ? (
                          <Play className="h-3.5 w-3.5 fill-[#10B981] text-[#10B981]" aria-hidden="true" />
                        ) : (
                          <span className="mono-telemetry text-xs">{String(idx + 1).padStart(2, '0')}</span>
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        type="button"
                        onClick={() => void playTrack(trk.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        <AlbumArtwork theme={trk.artworkTheme} title={trk.title} size="sm" />
                        <div className="min-w-0">
                          <div className={`truncate font-medium ${isPlaying ? 'text-[#10B981]' : 'text-[#F2F4F8]'}`}>
                            {trk.title}
                          </div>
                          <div className="flex items-center gap-1.5 truncate text-xs text-[#9AA4B2]">
                            {activeTab === 'folders_cue' ? (
                              <>
                                <Folder className="h-3 w-3 shrink-0 text-[#38BDF8]" aria-hidden="true" />
                                <span className="mono-telemetry text-[11px]">{trk.path}</span>
                                {trk.cueIndex && (
                                  <span className="mono-telemetry text-[11px] text-[#38BDF8]">
                                    · CUE #{trk.cueIndex}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span>
                                {trk.artist} · {trk.album}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </td>
                    <td className="py-2.5 px-2 whitespace-nowrap mono-telemetry text-xs text-[#F2F4F8]">
                      {trk.codec} · {trk.channelLayout}
                    </td>
                    <td className="py-2.5 px-2 text-right mono-telemetry text-xs text-[#F2F4F8] whitespace-nowrap">
                      {trk.isDsd
                        ? `${formatSampleRate(trk.sampleRateHz, true, trk.dsdRateMultiplier)} / 1b`
                        : `${formatSampleRate(trk.sampleRateHz)} / ${trk.bitDepth}b`}
                    </td>
                    <td className="py-2.5 px-2 text-right mono-telemetry text-xs text-[#9AA4B2] whitespace-nowrap">
                      <span className="text-[#F2F4F8]">DR{trk.dynamicRangeDr}</span> · {trk.integratedLufs.toFixed(1)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right mono-telemetry text-xs text-[#F2F4F8] whitespace-nowrap">
                      {formatTimecode(trk.durationMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

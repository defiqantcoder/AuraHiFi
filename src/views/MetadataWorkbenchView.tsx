import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Fingerprint,
  Image as ImageIcon,
  Save,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { AlbumArtwork } from '../components/AlbumArtwork';
import { applyApprovedTagDiffs, type MetadataAlbumJob } from '../lib/studioHelpers';

const INITIAL_METADATA_JOBS: MetadataAlbumJob[] = [
  {
    id: 'meta-spaces',
    albumTitle: 'Spaces — 24/192 Reference Pressing',
    artist: 'Nils Frahm',
    trackCount: 2,
    codecSummary: 'FLAC 24/192',
    acoustIdConfidencePct: 99,
    chromaprintStatus: 'matched',
    mbidRelease: '4f39a1c8-80e2-45e0-a611-29b9f1080c41',
    selectedCoverId: 'cov-spaces-1',
    coverCandidates: [
      {
        id: 'cov-spaces-1',
        label: 'Front Cover (Erased Tapes 2013)',
        resolution: '1200 × 1200 px',
        source: 'Cover Art Archive',
        sizeKb: 684,
        theme: 'emerald-prism',
      },
      {
        id: 'cov-spaces-2',
        label: '24/192 Studio Master Sleeve',
        resolution: '1200 × 1200 px',
        source: 'Discogs Release #5124901',
        sizeKb: 742,
        theme: 'slate-mono',
      },
      {
        id: 'cov-spaces-3',
        label: 'Vinyl Gatefold Inner Scan',
        resolution: '1200 × 1200 px',
        source: 'Cover Art Archive',
        sizeKb: 810,
        theme: 'obsidian-gold',
      },
    ],
    lrcSource: 'LRCLIB (lrclib.net · 300ms queue)',
    lrcPreview: [
      '[00:00.00] Tape hiss floor — Studer A800 1/2" master reel',
      '[00:18.40] Felt-damped upright piano harmonics enter (Close Neumann U47)',
      '[00:52.10] Analog Juno-60 arpeggio blooms across stereo soundstage',
      '[01:36.80] Dynamic crest +14 dB — peak transient at 192.0 kHz',
      '[02:30.00] Natural hall decay at Funkhaus Berlin Saal 3',
    ],
    fields: [
      {
        field: 'album',
        label: 'Album Title',
        currentValue: 'Spaces — 24/192 Reference Pressing',
        proposedValue: 'Spaces (Erased Tapes 24/192 Master)',
        changed: true,
        approved: true,
      },
      {
        field: 'artist',
        label: 'Album Artist',
        currentValue: 'Nils Frahm',
        proposedValue: 'Nils Frahm',
        changed: false,
        approved: false,
      },
      {
        field: 'genre',
        label: 'Genre',
        currentValue: 'Modern Classical',
        proposedValue: 'Modern Classical / Neoclassical',
        changed: true,
        approved: true,
      },
      {
        field: 'year',
        label: 'Original Release Date',
        currentValue: '2013',
        proposedValue: '2013-11-19',
        changed: true,
        approved: true,
      },
      {
        field: 'label',
        label: 'Catalog & Label',
        currentValue: '(missing)',
        proposedValue: 'Erased Tapes Records · ERATP055',
        changed: true,
        approved: true,
      },
      {
        field: 'mbid_release',
        label: 'MUSICBRAINZ_ALBUMID',
        currentValue: '(missing)',
        proposedValue: '4f39a1c8-80e2-45e0-a611-29b9f1080c41',
        changed: true,
        approved: true,
      },
    ],
  },
  {
    id: 'meta-debby',
    albumTitle: 'Waltz for Debby — Analog Tape to DSD256',
    artist: 'Bill Evans Trio',
    trackCount: 1,
    codecSummary: 'DSF DSD256',
    acoustIdConfidencePct: 97,
    chromaprintStatus: 'matched',
    mbidRelease: 'c018d8a0-149b-41fa-8fd4-7e01f2b82b12',
    selectedCoverId: 'cov-debby-1',
    coverCandidates: [
      {
        id: 'cov-debby-1',
        label: 'Riverside RLP 399 Original Front',
        resolution: '1200 × 1200 px',
        source: 'Cover Art Archive',
        sizeKb: 620,
        theme: 'amber-tape',
      },
      {
        id: 'cov-debby-2',
        label: 'Analogue Productions DSD256 Jacket',
        resolution: '1200 × 1200 px',
        source: 'Discogs Release #9811402',
        sizeKb: 790,
        theme: 'obsidian-gold',
      },
    ],
    lrcSource: 'LRCLIB + Village Vanguard Session Notes',
    lrcPreview: [
      '[00:00.00] Ambient room clink — Village Vanguard, New York, June 25 1961',
      '[00:14.20] Bill Evans — delicate rubato chord voicings (Steinway D)',
      '[00:48.50] Scott LaFaro — conversational upright bass counterpoint',
      '[01:44.00] Paul Motian — featherlight brush sweep on snare',
    ],
    fields: [
      {
        field: 'album',
        label: 'Album Title',
        currentValue: 'Waltz for Debby — Analog Tape to DSD256',
        proposedValue: 'Waltz for Debby (Live at the Village Vanguard)',
        changed: true,
        approved: true,
      },
      {
        field: 'artist',
        label: 'Album Artist',
        currentValue: 'Bill Evans Trio',
        proposedValue: 'Bill Evans Trio',
        changed: false,
        approved: false,
      },
      {
        field: 'label',
        label: 'Catalog & Label',
        currentValue: '(missing)',
        proposedValue: 'Riverside Records · RLP 9399 / APJ 009',
        changed: true,
        approved: true,
      },
      {
        field: 'recording_venue',
        label: 'Recording Venue',
        currentValue: '(missing)',
        proposedValue: 'Village Vanguard, New York City (1961-06-25)',
        changed: true,
        approved: true,
      },
    ],
  },
  {
    id: 'meta-point',
    albumTitle: 'Point — Dolby TrueHD Atmos Reference',
    artist: 'Yello',
    trackCount: 1,
    codecSummary: 'TrueHD Atmos 7.1.4',
    acoustIdConfidencePct: 96,
    chromaprintStatus: 'matched',
    mbidRelease: '882a10f9-44b1-4b23-a390-f1230a887011',
    selectedCoverId: 'cov-point-1',
    coverCandidates: [
      {
        id: 'cov-point-1',
        label: 'Blu-ray Pure Audio Atmos Front',
        resolution: '1200 × 1200 px',
        source: 'Cover Art Archive',
        sizeKb: 710,
        theme: 'cobalt',
      },
      {
        id: 'cov-point-2',
        label: 'Polydor Deluxe Sleeve',
        resolution: '1200 × 1200 px',
        source: 'Discogs Release #15822109',
        sizeKb: 645,
        theme: 'slate-mono',
      },
    ],
    lrcSource: 'LRCLIB Synced .lrc (verified 300ms queue)',
    lrcPreview: [
      '[00:00.00] Sub-bass LFE bed lock (38 Hz fundamental)',
      '[00:16.00] Height channels Top-FL / Top-FR percussive shimmer',
      '[00:42.50] Waba duba, moving through the wide horizon',
      '[01:14.20] Discrete object pan — 360° azimuth sweep (+24° elevation)',
    ],
    fields: [
      {
        field: 'album',
        label: 'Album Title',
        currentValue: 'Point — Dolby TrueHD Atmos Reference',
        proposedValue: 'Point (Dolby Atmos Pure Audio Blu-ray)',
        changed: true,
        approved: true,
      },
      {
        field: 'label',
        label: 'Catalog & Label',
        currentValue: '(missing)',
        proposedValue: 'Polydor / Universal · 0602508914010',
        changed: true,
        approved: true,
      },
      {
        field: 'channel_spec',
        label: 'Spatial Bed Metadata',
        currentValue: '7.1.4',
        proposedValue: 'Dolby TrueHD 7.1.4 + 11 Dynamic Objects',
        changed: true,
        approved: true,
      },
    ],
  },
];

export function MetadataWorkbenchView() {
  const commitAlbumMetadata = useAudioStore((s) => s.commitAlbumMetadata);
  const triggerMusicBrainz503 = useAudioStore((s) => s.triggerMusicBrainz503);

  const [jobs, setJobs] = useState<MetadataAlbumJob[]>(INITIAL_METADATA_JOBS);
  const [selectedJobId, setSelectedJobId] = useState<string>(INITIAL_METADATA_JOBS[0].id);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [fingerprinting, setFingerprinting] = useState(false);

  const activeJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0];
  const approvedCount = activeJob.fields.filter((f) => f.changed && f.approved).length;
  const changedCount = activeJob.fields.filter((f) => f.changed).length;

  const toggleFieldApproval = (fieldKey: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === activeJob.id
          ? {
              ...j,
              fields: j.fields.map((f) =>
                f.field === fieldKey ? { ...f, approved: !f.approved } : f
              ),
            }
          : j
      )
    );
  };

  const selectCover = (coverId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === activeJob.id ? { ...j, selectedCoverId: coverId } : j))
    );
  };

  const handleReFingerprint = async () => {
    setFingerprinting(true);
    setStatusMessage(null);
    await new Promise((r) => setTimeout(r, 260));
    setJobs((prev) =>
      prev.map((j) =>
        j.id === activeJob.id
          ? {
              ...j,
              acoustIdConfidencePct: Math.min(99, j.acoustIdConfidencePct + 1),
              chromaprintStatus: 'matched',
            }
          : j
      )
    );
    setFingerprinting(false);
    setStatusMessage(
      `Chromaprint AcoustID re-verified for "${activeJob.albumTitle}" (confidence ${Math.min(
        99,
        activeJob.acoustIdConfidencePct + 1
      )}%, MBID ${activeJob.mbidRelease.slice(0, 8)}…).`
    );
  };

  const handleWriteApprovedTags = () => {
    const oldAlbum = activeJob.albumTitle;
    const nextJob = applyApprovedTagDiffs(activeJob);

    const albumField = activeJob.fields.find((f) => f.field === 'album' && f.approved && f.changed);
    const genreField = activeJob.fields.find((f) => f.field === 'genre' && f.approved && f.changed);

    if (albumField || genreField) {
      commitAlbumMetadata(oldAlbum, {
        album: albumField?.proposedValue,
        genre: genreField?.proposedValue,
      });
    }

    setJobs((prev) => prev.map((j) => (j.id === activeJob.id ? nextJob : j)));
    setStatusMessage(
      `Wrote ${approvedCount} approved tag field${approvedCount === 1 ? '' : 's'} & embedded 1200px cover art via Lofty (atomic temp-file swap, zero audio stream alteration).`
    );
  };

  return (
    <div className="@container mx-auto max-w-[1280px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#F2F4F8]">
            Metadata Enricher &amp; Tag Diff Workbench
          </h1>
          <p className="mt-1 text-sm text-[#9AA4B2]">
            Review Chromaprint / MusicBrainz tag proposals side by side before writing lossless Vorbis/ID3v2.4 frames.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void triggerMusicBrainz503()}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-1.5 text-xs font-medium text-[#F59E0B] hover:border-[#F59E0B]"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Simulate MusicBrainz 503 Backoff
        </button>
      </header>

      {/* Rate-Limit Safety Banner */}
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#38BDF8]/35 bg-[#14181F] px-4 py-2.5 text-xs"
      >
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-[#38BDF8]" aria-hidden="true" />
          <span className="mono-telemetry font-medium text-[#F2F4F8]">
            MusicBrainz: 1.0 req/s safe queue · LRCLIB: 300ms throttled
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 mono-telemetry text-[11px] text-[#10B981]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Lofty Atomic Write Guard Enabled
        </span>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-[#10B981]/45 bg-[#10B981]/10 px-4 py-2.5 text-xs text-[#F2F4F8]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 3-Pane Workbench Layout */}
      <div className="grid grid-cols-1 gap-4 @[1020px]:grid-cols-12">
        {/* Pane 1 (Left, 3 cols): Album Queue */}
        <section
          aria-label="Metadata Enrichment Album Queue"
          className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-4 @[1020px]:col-span-3"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#F2F4F8]">Album Queue</h2>
            <span className="mono-telemetry text-[11px] text-[#9AA4B2]">{jobs.length} queued</span>
          </div>

          <ul className="space-y-2">
            {jobs.map((job) => {
              const isSelected = job.id === activeJob.id;
              const pendingChanges = job.fields.filter((f) => f.changed).length;

              return (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJobId(job.id);
                      setStatusMessage(null);
                    }}
                    className={`w-full rounded-[10px] border p-3 text-left transition-colors duration-150 ${
                      isSelected
                        ? 'border-[#38BDF8] bg-[#1C222D]'
                        : 'border-[#2B3342] bg-[#0B0D10] hover:bg-[#1C222D]'
                    }`}
                  >
                    <div className="truncate font-display text-xs font-semibold text-[#F2F4F8]">
                      {job.albumTitle}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[#9AA4B2]">{job.artist}</div>
                    <div className="mt-2 flex items-center justify-between mono-telemetry text-[10px]">
                      <span className="text-[#9AA4B2]">{job.codecSummary}</span>
                      <span
                        className={
                          job.chromaprintStatus === 'applied' || pendingChanges === 0
                            ? 'text-[#10B981]'
                            : 'text-[#38BDF8]'
                        }
                      >
                        {job.chromaprintStatus === 'applied' || pendingChanges === 0
                          ? 'WRITTEN'
                          : `${pendingChanges} DIFFS · ${job.acoustIdConfidencePct}%`}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Pane 2 (Center, 6 cols): Side-by-Side Current vs Proposed Tag Diff Table */}
        <section
          aria-label="Current versus Proposed Tag Diff Table"
          className="flex min-w-0 flex-col justify-between rounded-[14px] border border-[#2B3342] bg-[#14181F] p-4 @[1020px]:col-span-6"
        >
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#2B3342] pb-3">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold text-[#F2F4F8]">
                  Current vs. Proposed Tag Diff
                </h2>
                <div className="mt-0.5 truncate mono-telemetry text-[11px] text-[#9AA4B2]">
                  MBID {activeJob.mbidRelease} · AcoustID {activeJob.acoustIdConfidencePct}%
                </div>
              </div>
              <span className="shrink-0 mono-telemetry text-xs text-[#38BDF8]">
                {approvedCount}/{changedCount} approved
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#2B3342] text-[10px] font-semibold tracking-[0.06em] text-[#9AA4B2] uppercase">
                    <th className="w-8 py-2 pr-1">Use</th>
                    <th className="w-[24%] py-2 px-1.5">Field</th>
                    <th className="w-[34%] py-2 px-1.5">Current Tag</th>
                    <th className="w-[38%] py-2 pl-1.5">Proposed Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2B3342]">
                  {activeJob.fields.map((row) => (
                    <tr
                      key={row.field}
                      className={row.changed ? 'bg-[#38BDF8]/8' : ''}
                    >
                      <td className="py-2.5 pr-1 align-top">
                        <input
                          id={`diff-check-${activeJob.id}-${row.field}`}
                          type="checkbox"
                          disabled={!row.changed}
                          checked={row.changed && row.approved}
                          onChange={() => toggleFieldApproval(row.field)}
                          aria-label={`Approve proposed ${row.label}`}
                          className="h-3.5 w-3.5 rounded border-[#2B3342] bg-[#0B0D10] accent-[#38BDF8]"
                        />
                      </td>
                      <td className="py-2.5 px-1.5 align-top font-medium text-[#F2F4F8] break-words">
                        <label htmlFor={`diff-check-${activeJob.id}-${row.field}`}>
                          {row.label}
                        </label>
                      </td>
                      <td className="py-2.5 px-1.5 align-top mono-telemetry text-[11px] text-[#9AA4B2] break-words">
                        {row.currentValue}
                      </td>
                      <td
                        className={`py-2.5 pl-1.5 align-top mono-telemetry text-[11px] break-words ${
                          row.changed ? 'font-semibold text-[#38BDF8]' : 'text-[#9AA4B2]'
                        }`}
                      >
                        {row.proposedValue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#2B3342] pt-3.5">
            <button
              type="button"
              disabled={fingerprinting}
              onClick={() => void handleReFingerprint()}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-xs font-semibold text-[#F2F4F8] hover:border-[#38BDF8]"
            >
              <Fingerprint className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              {fingerprinting ? 'Fingerprinting...' : 'Re-Fingerprint (Chromaprint)'}
            </button>

            <button
              type="button"
              disabled={approvedCount === 0}
              onClick={handleWriteApprovedTags}
              className={`inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-xs font-semibold transition-colors duration-150 ${
                approvedCount === 0
                  ? 'cursor-not-allowed border border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2]'
                  : 'bg-[#10B981] text-[#06130E] hover:bg-[#34D399]'
              }`}
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Write Approved Tags to Files
            </button>
          </div>
        </section>

        {/* Pane 3 (Right, 3 cols): Cover Art Archive 1200px Candidate Picker + LRCLIB Synced .lrc Preview */}
        <section
          aria-label="Cover Art Archive and LRCLIB Preview"
          className="space-y-4 rounded-[14px] border border-[#2B3342] bg-[#14181F] p-4 @[1020px]:col-span-3"
        >
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-[#F2F4F8]">
                <ImageIcon className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
                Cover Art Archive (1200px)
              </h2>
              <span className="mono-telemetry text-[11px] text-[#9AA4B2]">
                {activeJob.coverCandidates.length} candidates
              </span>
            </div>

            <div className="space-y-2">
              {activeJob.coverCandidates.map((cand) => {
                const selected = cand.id === activeJob.selectedCoverId;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectCover(cand.id)}
                    className={`flex w-full items-center gap-3 rounded-[10px] border p-2.5 text-left transition-colors duration-150 ${
                      selected
                        ? 'border-[#38BDF8] bg-[#1C222D]'
                        : 'border-[#2B3342] bg-[#0B0D10] hover:bg-[#1C222D]'
                    }`}
                  >
                    <AlbumArtwork theme={cand.theme} title={cand.label} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-[#F2F4F8]">
                        {cand.label}
                      </div>
                      <div className="mt-0.5 mono-telemetry text-[11px] text-[#38BDF8]">
                        {cand.resolution} · {cand.sizeKb} KB
                      </div>
                      <div className="truncate text-[11px] text-[#9AA4B2]">{cand.source}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#2B3342] pt-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold text-[#F2F4F8]">
                LRCLIB Synced .lrc Preview
              </h3>
              <span className="mono-telemetry text-[10px] text-[#10B981]">Cached Ready</span>
            </div>
            <p className="mb-2 text-[11px] text-[#9AA4B2]">{activeJob.lrcSource}</p>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-[8px] border border-[#2B3342] bg-[#0B0D10] p-3 mono-telemetry text-[11px] text-[#F2F4F8]">
              {activeJob.lrcPreview.map((line, i) => (
                <div key={i} className="leading-relaxed text-[#9AA4B2]">
                  <span className="text-[#38BDF8]">{line.slice(0, 10)}</span>
                  <span className="text-[#F2F4F8]">{line.slice(10)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

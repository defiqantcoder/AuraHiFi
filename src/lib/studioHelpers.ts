/**
 * Pure domain logic for Pass 2-4 Studio Workbenches:
 * - PipeWire & WirePlumber Bit-Perfect config synthesis from active ALSA DAC
 * - Offline AI Smart Playlist scoring, BPM filtering & sequencing strategies
 * - Metadata Enricher tag diff application & Chromaprint confidence evaluation
 */

import type { AudioDeviceInfo, SmartPlaylistQuery, TrackSummary } from './audioBridge';

export type SequencingStrategy = 'closest_match' | 'seeded_flow' | 'album_similarity';

export interface SmartPlaylistResultItem {
  track: TrackSummary;
  matchScorePct: number;
  transitionNote: string;
  transitionTone: 'smooth' | 'harmonic' | 'clock_lock';
}

export interface SmartPlaylistStudioParams {
  tracks: TrackSummary[];
  mode: SmartPlaylistQuery['mode'];
  prompt: string;
  seedTrackId?: string;
  bpmMin: number;
  bpmMax: number;
  selectedGenres: string[];
  losslessHiResOnly: boolean;
  strategy: SequencingStrategy;
  maxTracks: number;
}

export function computeSmartPlaylistResults(
  params: SmartPlaylistStudioParams
): SmartPlaylistResultItem[] {
  const {
    tracks,
    prompt,
    seedTrackId,
    bpmMin,
    bpmMax,
    selectedGenres,
    losslessHiResOnly,
    strategy,
    maxTracks,
  } = params;

  const seed = tracks.find((t) => t.id === seedTrackId) ?? tracks[0];
  const q = prompt.trim().toLowerCase();

  let pool = tracks.filter((t) => {
    if (t.bpm < bpmMin || t.bpm > bpmMax) return false;
    if (selectedGenres.length > 0 && !selectedGenres.includes(t.genre)) return false;
    if (losslessHiResOnly && !t.isDsd && !t.isAtmos && t.sampleRateHz < 88200 && t.bitDepth < 24) {
      return false;
    }
    return true;
  });

  if (pool.length === 0) {
    return [];
  }

  const scored = pool.map((trk) => {
    let score = 74;

    if (q.length > 0) {
      const hay = `${trk.title} ${trk.artist} ${trk.album} ${trk.genre} ${trk.codec} ${trk.musicalKey}`.toLowerCase();
      const tokens = q.split(/\s+/).filter((w) => w.length > 2);
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 6;
      }
      if ((q.includes('jazz') || q.includes('piano') || q.includes('late') || q.includes('acoustic')) &&
          (trk.genre.toLowerCase().includes('jazz') || trk.genre.toLowerCase().includes('classical'))) {
        score += 11;
      }
      if ((q.includes('atmos') || q.includes('spatial') || q.includes('electronic') || q.includes('synth')) &&
          (trk.isAtmos || trk.genre.toLowerCase().includes('electronic'))) {
        score += 12;
      }
      if ((q.includes('dynamic') || q.includes('audiophile') || q.includes('master')) && trk.dynamicRangeDr >= 14) {
        score += 7;
      }
    }

    if (seed) {
      const bpmDelta = Math.abs(trk.bpm - seed.bpm);
      score += Math.max(0, 12 - Math.round(bpmDelta / 5));
      if (trk.genre === seed.genre) score += 5;
      if (trk.id === seed.id) score = 99;
    }

    return {
      track: trk,
      matchScorePct: Math.max(58, Math.min(99, Math.round(score))),
    };
  });

  // Apply Sequencing Strategy
  if (strategy === 'closest_match') {
    scored.sort((a, b) => b.matchScorePct - a.matchScorePct);
  } else if (strategy === 'seeded_flow') {
    // Sort smoothly along BPM progression starting closest to seed BPM
    const startBpm = seed?.bpm ?? bpmMin;
    scored.sort((a, b) => {
      if (a.track.id === seed?.id) return -1;
      if (b.track.id === seed?.id) return 1;
      return Math.abs(a.track.bpm - startBpm) - Math.abs(b.track.bpm - startBpm);
    });
  } else {
    // Album similarity: group by album/artist and DR proximity
    scored.sort((a, b) => {
      const albumCmp = a.track.album.localeCompare(b.track.album);
      if (albumCmp !== 0) return albumCmp;
      return (a.track.cueIndex ?? a.track.title).localeCompare(b.track.cueIndex ?? b.track.title);
    });
  }

  const limited = scored.slice(0, maxTracks);

  return limited.map((entry, idx) => {
    if (idx === 0) {
      return {
        ...entry,
        transitionNote: 'Opening Anchor · 0 dB Unity',
        transitionTone: 'harmonic' as const,
      };
    }
    const prev = limited[idx - 1].track;
    const bpmDiff = entry.track.bpm - prev.bpm;
    const bpmText = `${bpmDiff >= 0 ? '+' : ''}${bpmDiff} BPM`;
    const rateChanged = prev.sampleRateHz !== entry.track.sampleRateHz || prev.isDsd !== entry.track.isDsd;

    if (rateChanged) {
      return {
        ...entry,
        transitionNote: `${bpmText} · ALSA Clock Relock`,
        transitionTone: 'clock_lock' as const,
      };
    }
    if (prev.musicalKey === entry.track.musicalKey || Math.abs(bpmDiff) <= 10) {
      return {
        ...entry,
        transitionNote: `Harmonic Flow · ${bpmText} · Gapless`,
        transitionTone: 'harmonic' as const,
      };
    }
    return {
      ...entry,
      transitionNote: `Acoustic Bridge · ${bpmText} · Gapless`,
      transitionTone: 'smooth' as const,
    };
  });
}

// ============================================================================
// Metadata Enricher & Tag Diff Workbench Pure Logic
// ============================================================================

export interface TagDiffField {
  field: string;
  label: string;
  currentValue: string;
  proposedValue: string;
  changed: boolean;
  approved: boolean;
}

export interface CoverArtCandidate {
  id: string;
  label: string;
  resolution: string;
  source: string;
  sizeKb: number;
  theme: TrackSummary['artworkTheme'];
}

export interface MetadataAlbumJob {
  id: string;
  albumTitle: string;
  artist: string;
  trackCount: number;
  codecSummary: string;
  acoustIdConfidencePct: number;
  chromaprintStatus: 'matched' | 'fingerprinting' | 'applied';
  mbidRelease: string;
  fields: TagDiffField[];
  coverCandidates: CoverArtCandidate[];
  selectedCoverId: string;
  lrcSource: string;
  lrcPreview: string[];
}

export function applyApprovedTagDiffs(job: MetadataAlbumJob): MetadataAlbumJob {
  const updatedFields = job.fields.map((f) =>
    f.approved && f.changed
      ? {
          ...f,
          currentValue: f.proposedValue,
          changed: false,
        }
      : f
  );

  const proposedAlbum = updatedFields.find((f) => f.field === 'album')?.currentValue ?? job.albumTitle;
  const proposedArtist = updatedFields.find((f) => f.field === 'artist')?.currentValue ?? job.artist;

  return {
    ...job,
    albumTitle: proposedAlbum,
    artist: proposedArtist,
    chromaprintStatus: 'applied',
    fields: updatedFields,
  };
}

// ============================================================================
// Ubuntu 24.04 / 26.04 PipeWire & WirePlumber Config Generator
// ============================================================================

export interface GeneratedPipeWireConfigs {
  pipewireFilePath: string;
  pipewireContent: string;
  wireplumberFilePath: string;
  wireplumberContent: string;
}

export function generatePipeWireConfigs(
  device: AudioDeviceInfo | null,
  ringBufferMb = 128
): GeneratedPipeWireConfigs {
  const rates = device?.supportedSampleRates?.length
    ? device.supportedSampleRates
    : [44100, 48000, 88200, 96000, 176400, 192000];
  const cardMatch = device?.alsaId.match(/CARD=([^,]+)/);
  const cardId = cardMatch ? cardMatch[1] : 'Bifrost2';
  const displayName = device?.displayName ?? 'External USB DAC';
  const alsaNodePattern = `alsa_output.usb-*${cardId}*`;

  const pipewireContent = `# Generated by AuraHiFi for Ubuntu 24.04 / 26.04 LTS
# Active DAC: ${displayName} (${device?.alsaId ?? 'hw:CARD=Bifrost2,DEV=0'})
# Install to: ~/.config/pipewire/pipewire.conf.d/50-bitperfect-dac.conf

context.properties = {
    default.clock.rate          = ${rates[0]}
    default.clock.allowed-rates = [ ${rates.join(' ')} ]
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 256
    default.clock.max-quantum   = 4096
    # AuraHiFi ring buffer target: ${ringBufferMb} MB lock-free PCM/DSD
    link.max-buffers            = 64
}
`;

  const wireplumberContent = `# Generated by AuraHiFi — Prevent PipeWire/WirePlumber from auto-grabbing DAC
# Active DAC: ${displayName} (${device?.usbVidPid ?? 'USB Audio Class 2.0'})
# Install to: ~/.config/wireplumber/wireplumber.conf.d/50-disable-auto-dac.conf

monitor.alsa.rules = [
  {
    matches = [
      {
        alsa.card_name = "~.*${cardId}.*"
      }
      {
        node.name = "~${alsaNodePattern}"
      }
    ]
    actions = {
      update-props = {
        node.pause-on-idle     = true
        session.suspend-timeout-seconds = 1
        priority.driver        = 100
        priority.session       = 100
        api.alsa.disable-batch = false
      }
    }
  }
]
`;

  return {
    pipewireFilePath: '~/.config/pipewire/pipewire.conf.d/50-bitperfect-dac.conf',
    pipewireContent,
    wireplumberFilePath: '~/.config/wireplumber/wireplumber.conf.d/50-disable-auto-dac.conf',
    wireplumberContent,
  };
}

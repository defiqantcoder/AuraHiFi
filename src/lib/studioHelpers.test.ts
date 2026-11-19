import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyApprovedTagDiffs,
  computeSmartPlaylistResults,
  generatePipeWireConfigs,
  type MetadataAlbumJob,
} from './studioHelpers';
import { MockAudioBridge } from './audioBridge';

test('generatePipeWireConfigs derives allowed-rates and card_name rules from active DAC', async () => {
  const bridge = new MockAudioBridge();
  const devices = await bridge.listAudioDevices();
  const ifi = devices.find((d) => d.alsaId === 'hw:CARD=iFiAudio,DEV=0')!;

  const cfg = generatePipeWireConfigs(ifi, 256);
  assert.match(cfg.pipewireFilePath, /50-bitperfect-dac\.conf$/);
  assert.match(cfg.wireplumberFilePath, /50-disable-auto-dac\.conf$/);
  assert.match(cfg.pipewireContent, /352800 384000/);
  assert.match(cfg.pipewireContent, /256 MB/);
  assert.match(cfg.wireplumberContent, /iFiAudio/);
});

test('computeSmartPlaylistResults filters by BPM range, Hi-Res flag, and orders by Seeded Flow Path', async () => {
  const bridge = new MockAudioBridge();
  const tracks = await bridge.listTracks();

  const results = computeSmartPlaylistResults({
    tracks,
    mode: 'hybrid',
    prompt: 'acoustic jazz piano dynamic',
    seedTrackId: 'trk-flac-192',
    bpmMin: 60,
    bpmMax: 110,
    selectedGenres: [],
    losslessHiResOnly: true,
    strategy: 'seeded_flow',
    maxTracks: 10,
  });

  assert.ok(results.length >= 2);
  assert.equal(results[0].track.id, 'trk-flac-192');
  assert.ok(results.every((r) => r.track.bpm >= 60 && r.track.bpm <= 110));
  assert.ok(results.every((r) => r.matchScorePct >= 58 && r.matchScorePct <= 99));
});

test('applyApprovedTagDiffs commits only approved changed fields and preserves unapproved fields', () => {
  const job: MetadataAlbumJob = {
    id: 'job-1',
    albumTitle: 'Spaces',
    artist: 'Nils Frahm',
    trackCount: 4,
    codecSummary: 'FLAC 24/192',
    acoustIdConfidencePct: 98,
    chromaprintStatus: 'matched',
    mbidRelease: 'mbid-123',
    selectedCoverId: 'cov-1',
    coverCandidates: [],
    lrcSource: 'LRCLIB',
    lrcPreview: [],
    fields: [
      {
        field: 'album',
        label: 'Album Title',
        currentValue: 'Spaces',
        proposedValue: 'Spaces (Erased Tapes 24/192 Master)',
        changed: true,
        approved: true,
      },
      {
        field: 'year',
        label: 'Release Year',
        currentValue: '2013',
        proposedValue: '2014',
        changed: true,
        approved: false,
      },
    ],
  };

  const committed = applyApprovedTagDiffs(job);
  assert.equal(committed.chromaprintStatus, 'applied');
  assert.equal(committed.albumTitle, 'Spaces (Erased Tapes 24/192 Master)');
  assert.equal(committed.fields[0].changed, false);
  assert.equal(committed.fields[1].currentValue, '2013');
  assert.equal(committed.fields[1].changed, true);
});

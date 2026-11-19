import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFiveStageTimeline,
  estimateTrackBitrateKbps,
  formatBitrateKbps,
  formatDiagnosticReport,
  getMeterColorForDb,
  normalizeDbToUnit,
  stepPeakHold,
} from './telemetryHelpers.ts';
import { MockAudioBridge } from './audioBridge.ts';

test('getMeterColorForDb enforces Emerald < -3 dBFS, Amber >= -3 dBFS, and Red at 0 dBFS clip', () => {
  assert.equal(getMeterColorForDb(-18.5), '#10B981');
  assert.equal(getMeterColorForDb(-3.1), '#10B981');
  assert.equal(getMeterColorForDb(-3.0), '#F59E0B');
  assert.equal(getMeterColorForDb(-0.5), '#F59E0B');
  assert.equal(getMeterColorForDb(0.0), '#EF4444');
  assert.equal(getMeterColorForDb(-0.05), '#EF4444');
  assert.equal(normalizeDbToUnit(-60), 0);
  assert.equal(normalizeDbToUnit(0), 1);
  assert.equal(normalizeDbToUnit(-30), 0.5);
});

test('stepPeakHold attacks immediately, holds during plateau, and decays smoothly afterward', () => {
  const attacked = stepPeakHold(0.85, 0.4, 0, 0.016, 0.3, 0.5);
  assert.equal(attacked.peak, 0.85);
  assert.equal(attacked.holdSeconds, 0.3);

  const held = stepPeakHold(0.2, attacked.peak, attacked.holdSeconds, 0.1, 0.3, 0.5);
  assert.equal(held.peak, 0.85);
  assert.ok(held.holdSeconds < 0.3 && held.holdSeconds > 0);

  const decayed = stepPeakHold(0.2, 0.85, 0, 0.1, 0.3, 0.5);
  assert.ok(decayed.peak < 0.85 && decayed.peak >= 0.79);
});

test('buildFiveStageTimeline produces exact 5 stages and diagnostic report for Bit-Perfect, Fallback, and EBUSY', async () => {
  const bridge = new MockAudioBridge();
  const [devices, tracks, signalPath] = await Promise.all([
    bridge.listAudioDevices(),
    bridge.listTracks(),
    bridge.getSignalPath(),
  ]);
  const bifrost = devices.find((d) => d.alsaId.includes('Bifrost2'))!;
  const flac192 = tracks.find((t) => t.id === 'trk-flac-192')!;

  assert.equal(formatBitrateKbps(estimateTrackBitrateKbps(flac192)), '5,642 kbps');

  const stages = buildFiveStageTimeline(signalPath, bifrost, flac192, 128);
  assert.equal(stages.length, 5);
  assert.equal(stages[0].label, 'Source File');
  assert.equal(stages[1].label, 'Decoder & Gapless Ring Buffer');
  assert.equal(stages[2].label, 'DSP & Volume Lock');
  assert.equal(stages[3].label, 'Transport Driver & D-Bus ReserveDevice1');
  assert.equal(stages[4].label, 'Hardware Endpoint & UAC2 Rate Lock');
  assert.equal(stages[2].status, 'lossless');

  const report = formatDiagnosticReport(signalPath, bifrost, flac192, 128, 0);
  assert.match(report, /PipeWire SRC: BYPASSED/);
  assert.match(report, /Laptop Audio: ISOLATED/);
  assert.match(report, /ALSA Xruns: 0/);

  // Simulate ALSA EBUSY and verify Stage 4 switches to error with PID
  const ebusySp = await bridge.simulateAlsaEbusy('pipewire-pulse (Firefox)', 4182);
  const ebusyStages = buildFiveStageTimeline(ebusySp, bifrost, flac192, 128);
  assert.equal(ebusyStages[3].status, 'error');
  assert.match(ebusyStages[3].telemetry, /4182/);
});

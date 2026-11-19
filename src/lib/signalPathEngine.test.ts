import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeVolumeLock,
  evaluateSignalPath,
  formatDb,
  formatSampleRate,
  formatTimecode,
  requiresSampleRateSwitchLock,
} from './signalPathEngine';
import { MockAudioBridge } from './audioBridge';

test('Bit-Perfect FLAC 24/192 on Schiit Bifrost 2/64 locks volume to 0.0 dB with lossless Emerald integrity', async () => {
  const bridge = new MockAudioBridge();
  const sp = await bridge.getSignalPath();

  assert.equal(sp.mode, 'bit_perfect');
  assert.equal(sp.integrity, 'bit_perfect');
  assert.equal(sp.isVolumeLocked, true);
  assert.equal(sp.lockedVolumeDb, 0.0);
  assert.equal(sp.pipewireBypassed, true);
  assert.equal(sp.laptopSpeakersIsolated, true);
  assert.equal(sp.warnings.length, 0);
  assert.ok(sp.stages.every((s) => s.status === 'lossless'));
});

test('DSD256 on PCM-only Bifrost 2/64 surfaces honest Amber fallback; switching to iFi ZEN DAC V2 restores Native DSD256 Emerald lock', async () => {
  const bridge = new MockAudioBridge();
  await bridge.transportCommand({ type: 'Play', trackId: 'trk-dsd-256' });

  const fallbackPath = await bridge.getSignalPath();
  assert.equal(fallbackPath.integrity, 'warning_fallback');
  assert.equal(fallbackPath.isVolumeLocked, true);
  assert.ok(fallbackPath.warnings.some((w) => w.includes('UAC2 Native DSD rejected')));
  assert.ok(fallbackPath.stages.some((s) => s.status === 'warning' && s.kind === 'resampler'));

  // Claim iFi ZEN DAC V2 which supports Native DSD256
  const nativePath = await bridge.selectAudioDevice('hw:CARD=iFiAudio,DEV=0', true, true);
  assert.equal(nativePath.integrity, 'bit_perfect');
  assert.equal(nativePath.isVolumeLocked, true);
  assert.equal(nativePath.warnings.length, 0);
  assert.match(nativePath.outputFormat, /DSD256 Native/);
});

test('Master Mode Switch to Spatial unlocks software volume and engages SOFA HRTF / BS2B / PEQ stages', async () => {
  const bridge = new MockAudioBridge();
  const spatialPath = await bridge.setAudioMode('spatial');

  assert.equal(spatialPath.mode, 'spatial');
  assert.equal(spatialPath.integrity, 'spatial_dsp');
  assert.equal(spatialPath.isVolumeLocked, false);
  assert.ok(spatialPath.stages.some((s) => s.id === 'sofa_hrtf' && s.status === 'spatial'));

  const pb = await bridge.transportCommand({ type: 'SetVolume', volumeNormalized: 0.5 });
  assert.equal(pb.isVolumeLocked, false);
  assert.equal(pb.volumeNormalized, 0.5);

  // Switch back to Bit-Perfect — volume locks again and SetVolume is ignored
  await bridge.setAudioMode('bit_perfect');
  const pbLocked = await bridge.transportCommand({ type: 'SetVolume', volumeNormalized: 0.2 });
  assert.equal(pbLocked.isVolumeLocked, true);
  assert.equal(pbLocked.volumeNormalized, 0.5); // unchanged while locked
});

test('USB DAC Hot-Unplug halts playback safely with zero fallback to Intel HDA laptop speakers', async () => {
  const bridge = new MockAudioBridge();
  const events: string[] = [];
  let sawNoFallback = false;

  const unsub = bridge.subscribeHardwareEvents((ev) => {
    events.push(ev.type);
    if (ev.type === 'DacDisconnectedPaused') {
      assert.equal(ev.fallbackToInternalSpeakers, false);
      sawNoFallback = true;
    }
  });

  const sp = await bridge.simulateUsbDacHotUnplug();
  const pb = await bridge.getPlaybackState();

  assert.equal(sp.integrity, 'error_halted');
  assert.equal(sp.error?.code, 'DAC_HOT_UNPLUGGED');
  assert.equal(sp.activeDeviceId, 'hw:CARD=Bifrost2,DEV=0');
  assert.notEqual(sp.activeDeviceId, 'hw:CARD=PCH,DEV=0');
  assert.equal(pb.status, 'halted_hardware_error');
  assert.equal(sawNoFallback, true);

  // Reconnect recovers safely in paused state
  const recovered = await bridge.simulateUsbDacReconnect();
  const pbAfter = await bridge.getPlaybackState();
  assert.equal(recovered.integrity, 'bit_perfect');
  assert.equal(pbAfter.status, 'paused');
  unsub();
});

test('ALSA EBUSY halts playback with holding process telemetry and recovers via D-Bus ReserveDevice1', async () => {
  const bridge = new MockAudioBridge();
  const busySp = await bridge.simulateAlsaEbusy('pipewire-pulse (Chromium)', 9942);
  assert.equal(busySp.integrity, 'error_halted');
  assert.equal(busySp.error?.code, 'ALSA_EBUSY');
  assert.equal(busySp.error?.holdingPid, 9942);

  const claimedSp = await bridge.forceClaimDbusReservation();
  assert.equal(claimedSp.integrity, 'bit_perfect');
  assert.equal(claimedSp.error, null);
});

test('Track-to-track sample-rate switch locking and telemetry formatting work deterministically', async () => {
  const bridge = new MockAudioBridge();
  const tracks = await bridge.listTracks();
  const flac192 = tracks.find((t) => t.id === 'trk-flac-192')!;
  const atmos48 = tracks.find((t) => t.id === 'trk-atmos-714')!;
  const cue1 = tracks.find((t) => t.id === 'trk-cue-01')!;
  const cue2 = tracks.find((t) => t.id === 'trk-cue-02')!;

  assert.equal(requiresSampleRateSwitchLock(flac192, atmos48).required, true);
  assert.equal(requiresSampleRateSwitchLock(cue1, cue2).required, false);

  assert.equal(formatSampleRate(192000), '192.0 kHz');
  assert.equal(formatSampleRate(11289600, true, 256), 'DSD256');
  assert.equal(formatTimecode(102000), '01:42');
  assert.equal(formatDb(-6.4), '-6.4 dB');
  assert.equal(formatDb(-96), '-∞ dB');

  // Verify computeVolumeLock + evaluateSignalPath pure calls
  const devices = await bridge.listAudioDevices();
  const denon = devices.find((d) => d.iec958Passthrough)!;
  const spatialCfg = await bridge.getSpatialConfig();
  const lock = computeVolumeLock('spatial', atmos48, denon, {
    ...spatialCfg,
    atmosMode: 'hdmi_iec958_passthrough',
  });
  assert.equal(lock.locked, true);

  const sp = evaluateSignalPath({
    mode: 'spatial',
    device: denon,
    track: atmos48,
    spatialConfig: { ...spatialCfg, atmosMode: 'hdmi_iec958_passthrough' },
    exclusiveAlsa: true,
    bypassLaptopSpeakers: true,
    activeError: null,
  });
  assert.equal(sp.integrity, 'spatial_dsp');
  assert.equal(sp.isVolumeLocked, true);
});

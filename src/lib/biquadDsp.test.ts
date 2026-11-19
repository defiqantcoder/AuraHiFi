import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_EQ_PRESETS,
  computeBiquadCoefficients,
  dbToNormY,
  evaluateBiquadMagnitudeDb,
  evaluateCombinedEqCurve,
  freqToNormX,
  normXToFreq,
  normYToDb,
  projectPolarToStage2D,
  stage2DToAzimuthDeg,
  VIRTUAL_714_SPEAKERS,
} from './biquadDsp.ts';

test('RBJ peaking biquad yields exact center gain at Fc and ~0 dB far from Fc', () => {
  const coeffs = computeBiquadCoefficients('peaking', 1000, 6.0, 2.0, 48000);
  const atCenter = evaluateBiquadMagnitudeDb(coeffs, 1000, 48000);
  const atLow = evaluateBiquadMagnitudeDb(coeffs, 30, 48000);

  assert.ok(Math.abs(atCenter - 6.0) < 0.08, `Expected ~+6.0 dB at 1 kHz, got ${atCenter}`);
  assert.ok(Math.abs(atLow) < 0.15, `Expected ~0 dB at 30 Hz, got ${atLow}`);
});

test('evaluateCombinedEqCurve computes accurate AutoEQ headroom for Flat vs HD 650 Harman 2018', () => {
  const flat = AUTO_EQ_PRESETS.find((p) => p.id === 'flat-reference')!;
  const flatRes = evaluateCombinedEqCurve(flat.bands, 0);
  assert.equal(flatRes.maxPositiveGainDb, 0);
  assert.equal(flatRes.recommendedPreampDb, 0);

  const hd650 = AUTO_EQ_PRESETS.find((p) => p.id === 'hd650-harman-2018')!;
  const hdRes = evaluateCombinedEqCurve(hd650.bands, hd650.preampGainDb);
  assert.ok(hdRes.maxPositiveGainDb > 4.0, `Expected HD 650 bass shelf > +4 dB, got ${hdRes.maxPositiveGainDb}`);
  assert.ok(hdRes.recommendedPreampDb <= -4.5, `Expected safe negative preamp <= -4.5 dB, got ${hdRes.recommendedPreampDb}`);
});

test('Logarithmic frequency and gain coordinate helpers round-trip cleanly', () => {
  assert.ok(Math.abs(freqToNormX(20) - 0) < 1e-6);
  assert.ok(Math.abs(freqToNormX(20000) - 1) < 1e-6);
  assert.ok(Math.abs(normXToFreq(freqToNormX(1000)) - 1000) <= 50);

  assert.equal(dbToNormY(12), 0);
  assert.equal(dbToNormY(0), 0.5);
  assert.equal(dbToNormY(-12), 1);
  assert.equal(normYToDb(0.5), 0);
});

test('7.1.4 soundstage layout has 11 directional speakers and polar projection round-trips azimuth', () => {
  assert.equal(VIRTUAL_714_SPEAKERS.length, 11);
  const ptFront = projectPolarToStage2D(0, 0, 2.4, 180, 180, 140);
  assert.ok(Math.abs(ptFront.x - 180) < 0.01);
  assert.ok(ptFront.y < 180);
  assert.equal(stage2DToAzimuthDeg(ptFront.x, ptFront.y, 180, 180), 0);

  const ptRight = projectPolarToStage2D(90, 0, 2.4, 180, 180, 140);
  assert.equal(stage2DToAzimuthDeg(ptRight.x, ptRight.y, 180, 180), 90);
});

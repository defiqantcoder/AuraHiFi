/**
 * Pure Digital Biquad Filter Transfer Function Engine (Robert Bristow-Johnson Audio EQ Cookbook),
 * AutoEQ Headroom Calculator, Built-In Reference Presets, and 7.1.4 Soundstage Geometry.
 * Decoupled from React/DOM for deterministic node:test verification.
 */

import type { PeqBand, PeqFilterType } from './audioBridge';

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

export interface EqCurvePoint {
  freqHz: number;
  rawDb: number;
  totalDb: number;
}

export interface CombinedEqResponse {
  points: EqCurvePoint[];
  maxPositiveGainDb: number;
  recommendedPreampDb: number;
}

export interface AutoEqPreset {
  id: string;
  name: string;
  preampGainDb: number;
  bands: PeqBand[];
}

export interface VirtualSpeaker714 {
  id: string;
  label: string;
  name: string;
  layer: 'bed' | 'height';
  baseAzimuthDeg: number; // 0 = front center, clockwise positive (90 = right, 180 = rear, 270 = left)
  baseElevationDeg: number; // 0 = ear level, +35..+45 = overhead height
}

export const EQ_MIN_FREQ = 20;
export const EQ_MAX_FREQ = 20000;
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;

/**
 * Computes RBJ Audio EQ Cookbook digital biquad coefficients for low_shelf, peaking, and high_shelf.
 */
export function computeBiquadCoefficients(
  filterType: PeqFilterType,
  freqHz: number,
  gainDb: number,
  qFactor: number,
  sampleRateHz = 48000
): BiquadCoefficients {
  const clampedFreq = Math.max(10, Math.min(sampleRateHz * 0.48, freqHz));
  const clampedQ = Math.max(0.1, Math.min(18, qFactor));
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * clampedFreq) / sampleRateHz;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * clampedQ);

  if (filterType === 'low_shelf') {
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    const b0 = A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha);
    const b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    const b2 = A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha);
    const a0 = A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha;
    const a1 = -2 * (A - 1 + (A + 1) * cosW0);
    const a2 = A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a0: 1, a1: a1 / a0, a2: a2 / a0 };
  }

  if (filterType === 'high_shelf') {
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    const b0 = A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha);
    const b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    const b2 = A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha);
    const a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
    const a1 = 2 * (A - 1 - (A + 1) * cosW0);
    const a2 = A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a0: 1, a1: a1 / a0, a2: a2 / a0 };
  }

  // Peaking EQ (bell)
  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a0: 1, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Evaluates exact digital biquad magnitude response |H(e^{j*w})| in dB at a target frequency.
 */
export function evaluateBiquadMagnitudeDb(
  c: BiquadCoefficients,
  freqHz: number,
  sampleRateHz = 48000
): number {
  const w = (2 * Math.PI * freqHz) / sampleRateHz;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);

  const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const numIm = -(c.b1 * sin1 + c.b2 * sin2);
  const denRe = 1 + c.a1 * cos1 + c.a2 * cos2;
  const denIm = -(c.a1 * sin1 + c.a2 * sin2);

  const numMagSq = numRe * numRe + numIm * numIm;
  const denMagSq = Math.max(1e-18, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-12, numMagSq / denMagSq));
}

/**
 * Evaluates a single band's dB response across logarithmically spaced frequencies.
 */
export function evaluateSingleBandCurve(
  band: PeqBand,
  numPoints = 180,
  sampleRateHz = 48000
): { freqHz: number; db: number }[] {
  const coeffs = computeBiquadCoefficients(
    band.filterType,
    band.frequencyHz,
    band.enabled ? band.gainDb : 0,
    band.qFactor,
    sampleRateHz
  );
  const logMin = Math.log10(EQ_MIN_FREQ);
  const logMax = Math.log10(EQ_MAX_FREQ);
  const pts: { freqHz: number; db: number }[] = [];

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const freqHz = Math.pow(10, logMin + t * (logMax - logMin));
    const db = band.enabled ? evaluateBiquadMagnitudeDb(coeffs, freqHz, sampleRateHz) : 0;
    pts.push({ freqHz, db });
  }
  return pts;
}

/**
 * Evaluates the combined magnitude response of all enabled parametric EQ bands + preamp gain,
 * and computes recommended negative preamp headroom to prevent 0 dBFS digital clipping.
 */
export function evaluateCombinedEqCurve(
  bands: PeqBand[],
  preampGainDb: number,
  numPoints = 200,
  sampleRateHz = 48000
): CombinedEqResponse {
  const activeCoeffs = bands
    .filter((b) => b.enabled && Math.abs(b.gainDb) > 0.001)
    .map((b) =>
      computeBiquadCoefficients(b.filterType, b.frequencyHz, b.gainDb, b.qFactor, sampleRateHz)
    );

  const logMin = Math.log10(EQ_MIN_FREQ);
  const logMax = Math.log10(EQ_MAX_FREQ);
  const points: EqCurvePoint[] = [];
  let maxPositiveGainDb = 0;

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const freqHz = Math.pow(10, logMin + t * (logMax - logMin));
    let rawDb = 0;
    for (let j = 0; j < activeCoeffs.length; j++) {
      rawDb += evaluateBiquadMagnitudeDb(activeCoeffs[j], freqHz, sampleRateHz);
    }
    if (rawDb > maxPositiveGainDb) {
      maxPositiveGainDb = rawDb;
    }
    points.push({
      freqHz,
      rawDb,
      totalDb: rawDb + preampGainDb,
    });
  }

  const recommendedPreampDb =
    maxPositiveGainDb > 0.05 ? -Math.ceil((maxPositiveGainDb + 0.5) * 10) / 10 : 0.0;

  return {
    points,
    maxPositiveGainDb: Number(maxPositiveGainDb.toFixed(2)),
    recommendedPreampDb: Number(recommendedPreampDb.toFixed(1)),
  };
}

/**
 * Logarithmic frequency mapping helpers for SVG coordinate conversion.
 */
export function freqToNormX(freqHz: number, minHz = EQ_MIN_FREQ, maxHz = EQ_MAX_FREQ): number {
  const clamped = Math.max(minHz, Math.min(maxHz, freqHz));
  return (Math.log10(clamped) - Math.log10(minHz)) / (Math.log10(maxHz) - Math.log10(minHz));
}

export function normXToFreq(normX: number, minHz = EQ_MIN_FREQ, maxHz = EQ_MAX_FREQ): number {
  const clamped = Math.max(0, Math.min(1, normX));
  const raw = Math.pow(10, Math.log10(minHz) + clamped * (Math.log10(maxHz) - Math.log10(minHz)));
  if (raw < 100) return Math.round(raw);
  if (raw < 1000) return Math.round(raw / 5) * 5;
  return Math.round(raw / 50) * 50;
}

export function dbToNormY(db: number, minDb = EQ_MIN_DB, maxDb = EQ_MAX_DB): number {
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  // 0 at top (+12 dB), 1 at bottom (-12 dB)
  return (maxDb - clamped) / (maxDb - minDb);
}

export function normYToDb(normY: number, minDb = EQ_MIN_DB, maxDb = EQ_MAX_DB): number {
  const clamped = Math.max(0, Math.min(1, normY));
  const raw = maxDb - clamped * (maxDb - minDb);
  return Math.round(raw * 10) / 10;
}

/**
 * Three studio AutoEQ reference presets requested for the Parametric EQ Editor.
 */
export const AUTO_EQ_PRESETS: AutoEqPreset[] = [
  {
    id: 'flat-reference',
    name: 'Flat Reference',
    preampGainDb: 0.0,
    bands: [
      { id: 'b1', frequencyHz: 32, gainDb: 0.0, qFactor: 0.71, filterType: 'low_shelf', enabled: true },
      { id: 'b2', frequencyHz: 64, gainDb: 0.0, qFactor: 1.2, filterType: 'peaking', enabled: true },
      { id: 'b3', frequencyHz: 125, gainDb: 0.0, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b4', frequencyHz: 250, gainDb: 0.0, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b5', frequencyHz: 500, gainDb: 0.0, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b6', frequencyHz: 1000, gainDb: 0.0, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b7', frequencyHz: 2000, gainDb: 0.0, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b8', frequencyHz: 4000, gainDb: 0.0, qFactor: 1.6, filterType: 'peaking', enabled: true },
      { id: 'b9', frequencyHz: 8000, gainDb: 0.0, qFactor: 1.8, filterType: 'peaking', enabled: true },
      { id: 'b10', frequencyHz: 16000, gainDb: 0.0, qFactor: 0.71, filterType: 'high_shelf', enabled: true },
    ],
  },
  {
    id: 'hd650-harman-2018',
    name: 'Sennheiser HD 650 — Harman 2018',
    preampGainDb: -5.2,
    bands: [
      { id: 'b1', frequencyHz: 35, gainDb: 4.6, qFactor: 0.71, filterType: 'low_shelf', enabled: true },
      { id: 'b2', frequencyHz: 75, gainDb: 1.8, qFactor: 1.1, filterType: 'peaking', enabled: true },
      { id: 'b3', frequencyHz: 185, gainDb: -1.6, qFactor: 1.1, filterType: 'peaking', enabled: true },
      { id: 'b4', frequencyHz: 420, gainDb: -0.6, qFactor: 1.4, filterType: 'peaking', enabled: true },
      { id: 'b5', frequencyHz: 1100, gainDb: -0.9, qFactor: 1.8, filterType: 'peaking', enabled: true },
      { id: 'b6', frequencyHz: 2150, gainDb: 1.4, qFactor: 2.0, filterType: 'peaking', enabled: true },
      { id: 'b7', frequencyHz: 3400, gainDb: -1.3, qFactor: 2.4, filterType: 'peaking', enabled: true },
      { id: 'b8', frequencyHz: 5600, gainDb: 1.9, qFactor: 2.2, filterType: 'peaking', enabled: true },
      { id: 'b9', frequencyHz: 8900, gainDb: -1.1, qFactor: 3.1, filterType: 'peaking', enabled: true },
      { id: 'b10', frequencyHz: 13500, gainDb: 2.2, qFactor: 0.71, filterType: 'high_shelf', enabled: true },
    ],
  },
  {
    id: 'wh1000xm5-studio-neutral',
    name: 'Sony WH-1000XM5 — Studio Neutral',
    preampGainDb: -3.8,
    bands: [
      { id: 'b1', frequencyHz: 32, gainDb: -1.5, qFactor: 0.71, filterType: 'low_shelf', enabled: true },
      { id: 'b2', frequencyHz: 80, gainDb: -3.2, qFactor: 1.1, filterType: 'peaking', enabled: true },
      { id: 'b3', frequencyHz: 145, gainDb: -4.8, qFactor: 1.2, filterType: 'peaking', enabled: true },
      { id: 'b4', frequencyHz: 280, gainDb: -2.4, qFactor: 1.5, filterType: 'peaking', enabled: true },
      { id: 'b5', frequencyHz: 640, gainDb: 0.8, qFactor: 1.6, filterType: 'peaking', enabled: true },
      { id: 'b6', frequencyHz: 1500, gainDb: 1.9, qFactor: 1.7, filterType: 'peaking', enabled: true },
      { id: 'b7', frequencyHz: 2600, gainDb: 2.7, qFactor: 2.1, filterType: 'peaking', enabled: true },
      { id: 'b8', frequencyHz: 4800, gainDb: -1.8, qFactor: 2.8, filterType: 'peaking', enabled: true },
      { id: 'b9', frequencyHz: 7800, gainDb: 2.1, qFactor: 2.4, filterType: 'peaking', enabled: true },
      { id: 'b10', frequencyHz: 12500, gainDb: 2.5, qFactor: 0.71, filterType: 'high_shelf', enabled: true },
    ],
  },
];

/**
 * Virtual Dolby Atmos 7.1.4 speaker layout around the central listener head.
 * Azimuth convention: 0° = straight ahead (12 o'clock), clockwise positive (0..360°).
 */
export const VIRTUAL_714_SPEAKERS: VirtualSpeaker714[] = [
  { id: 'C', label: 'C', name: 'Center', layer: 'bed', baseAzimuthDeg: 0, baseElevationDeg: 0 },
  { id: 'FR', label: 'FR', name: 'Front Right', layer: 'bed', baseAzimuthDeg: 30, baseElevationDeg: 0 },
  { id: 'SR', label: 'SR', name: 'Side Right', layer: 'bed', baseAzimuthDeg: 95, baseElevationDeg: 0 },
  { id: 'RR', label: 'RR', name: 'Rear Right', layer: 'bed', baseAzimuthDeg: 142, baseElevationDeg: 0 },
  { id: 'RL', label: 'RL', name: 'Rear Left', layer: 'bed', baseAzimuthDeg: 218, baseElevationDeg: 0 },
  { id: 'SL', label: 'SL', name: 'Side Left', layer: 'bed', baseAzimuthDeg: 265, baseElevationDeg: 0 },
  { id: 'FL', label: 'FL', name: 'Front Left', layer: 'bed', baseAzimuthDeg: 330, baseElevationDeg: 0 },
  { id: 'TFR', label: 'TFR', name: 'Top Front Right', layer: 'height', baseAzimuthDeg: 40, baseElevationDeg: 42 },
  { id: 'TRR', label: 'TRR', name: 'Top Rear Right', layer: 'height', baseAzimuthDeg: 135, baseElevationDeg: 42 },
  { id: 'TRL', label: 'TRL', name: 'Top Rear Left', layer: 'height', baseAzimuthDeg: 225, baseElevationDeg: 42 },
  { id: 'TFL', label: 'TFL', name: 'Top Front Left', layer: 'height', baseAzimuthDeg: 320, baseElevationDeg: 42 },
];

/**
 * Projects a polar (azimuthDeg, elevationDeg, radiusMeters) point into 2D SVG coordinates
 * centered at (cx, cy) with maximum outer radius maxPx.
 */
export function projectPolarToStage2D(
  azimuthDeg: number,
  elevationDeg: number,
  radiusMeters: number,
  cx: number,
  cy: number,
  maxPx: number
): { x: number; y: number } {
  const normAz = ((azimuthDeg % 360) + 360) % 360;
  const azRad = ((normAz - 90) * Math.PI) / 180; // 0 deg at top (12 o'clock)
  const elClamped = Math.max(-90, Math.min(90, elevationDeg));
  const elCos = Math.max(0.22, Math.cos((elClamped * Math.PI) / 180));
  const radiusScale = 0.42 + ((Math.max(0.5, Math.min(10, radiusMeters)) - 0.5) / 9.5) * 0.54;
  const r = maxPx * radiusScale * elCos;
  return {
    x: cx + r * Math.cos(azRad),
    y: cy + r * Math.sin(azRad),
  };
}

/**
 * Converts a 2D SVG pointer position back into azimuth (0..360°) and elevation/radius hints.
 */
export function stage2DToAzimuthDeg(x: number, y: number, cx: number, cy: number): number {
  const rad = Math.atan2(y - cy, x - cx);
  const deg = (rad * 180) / Math.PI + 90;
  return Math.round(((deg % 360) + 360) % 360);
}

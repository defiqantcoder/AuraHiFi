import { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/useAudioStore';
import type { TelemetryFrame } from '../../lib/audioBridge';
import {
  getMeterColorForDb,
  METER_AMBER_THRESHOLD_DB,
  METER_CLIP_THRESHOLD_DB,
  normalizeDbToUnit,
  stepPeakHold,
  unitToDb,
} from '../../lib/telemetryHelpers';

interface SpectrumVuCanvasProps {
  className?: string;
  height?: number;
}

const FREQ_TICKS_COMPACT = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '4kHz', '16kHz', '48kHz'];
const FREQ_TICKS_WIDE = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz', '48kHz'];
const DB_SCALE_MARKS = [-60, -48, -36, -24, -12, -3, 0];

/**
 * High-precision 48-band logarithmic FFT Spectrum Analyzer + L/R True-Peak VU Meter.
 *
 * STRICT 60 FPS RENDERING HYGIENE:
 * - Subscribes to audioBridge telemetry into a mutable ref.
 * - Drives all painting exclusively inside requestAnimationFrame.
 * - ZERO React setState calls at 60 Hz.
 * - devicePixelRatio-aware for crisp HiDPI Linux monitors.
 */
export function SpectrumVuCanvas({ className = '', height = 204 }: SpectrumVuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestFrameRef = useRef<TelemetryFrame | null>(null);

  // Mutable peak-hold arrays & stereo VU peak trackers (zero React re-renders)
  const fftPeakRef = useRef<Float32Array>(new Float32Array(48));
  const fftHoldRef = useRef<Float32Array>(new Float32Array(48));
  const vuLeftPeakRef = useRef<{ peak: number; holdSeconds: number }>({ peak: 0, holdSeconds: 0 });
  const vuRightPeakRef = useRef<{ peak: number; holdSeconds: number }>({ peak: 0, holdSeconds: 0 });
  const lastRafTsRef = useRef<number>(0);

  useEffect(() => {
    // Subscribe via useAudioStore -> audioBridge.subscribeTelemetry into mutable ref only
    const unsubscribe = useAudioStore.getState().subscribeTelemetry((frame) => {
      latestFrameRef.current = frame;
    });

    let rafId = 0;

    const drawFrame = (nowMs: number) => {
      const canvas = canvasRef.current;
      const frame = latestFrameRef.current;

      const dtSec =
        lastRafTsRef.current > 0 ? Math.min(0.08, Math.max(0.001, (nowMs - lastRafTsRef.current) / 1000)) : 1 / 60;
      lastRafTsRef.current = nowMs;

      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const targetW = Math.round(rect.width * dpr);
          const targetH = Math.round(rect.height * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.save();
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;

            // Background surface (#0B0D10)
            ctx.fillStyle = '#0B0D10';
            ctx.fillRect(0, 0, w, h);

            // Layout geometry inside canvas
            const padX = 10;
            const headerH = 22;
            const freqAxisH = 15;
            const vuSectionH = 60;
            const fftTop = headerH + 6;
            const fftBottom = Math.max(fftTop + 48, h - vuSectionH - freqAxisH - 6);
            const fftH = fftBottom - fftTop;
            const fftLeft = padX + 24; // space for dBFS Y-axis scale
            const fftRight = w - padX;
            const fftW = Math.max(60, fftRight - fftLeft);

            // 1. Top Telemetry Header painted directly onto canvas (zero React DOM churn)
            ctx.font = '600 9.5px "JetBrains Mono", monospace';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#9AA4B2';
            ctx.textAlign = 'left';
            ctx.fillText(w >= 460 ? '48-BAND LOG FFT · TRUE-PEAK VU' : 'FFT · TRUE-PEAK VU', padX, 11.5);

            const truePeakStr = frame ? `${frame.truePeakDbtp.toFixed(1)}` : '-1.2';
            const lufsStr = frame ? `${frame.momentaryLufs.toFixed(1)} LUFS` : '-14.2 LUFS';
            const xrunCount = frame ? frame.xruns : 0;

            ctx.textAlign = 'right';
            ctx.fillStyle = xrunCount > 0 ? '#EF4444' : '#10B981';
            const xrunText = `XRUNS ${xrunCount}`;
            ctx.fillText(xrunText, w - padX, 11.5);

            const xrunW = ctx.measureText(xrunText).width;
            ctx.fillStyle = '#F2F4F8';
            const metricsText = `${lufsStr} · TP ${truePeakStr} · `;
            ctx.fillText(metricsText, w - padX - xrunW, 11.5);

            // Hairline separator below header
            ctx.strokeStyle = '#2B3342';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, headerH + 0.5);
            ctx.lineTo(w, headerH + 0.5);
            ctx.stroke();

            // 2. FFT dBFS horizontal grid & clean non-overlapping Y-axis scale (0, -12, -24, -48 + -3 threshold line)
            const fftDbLines = [0, -3, -12, -24, -48];
            ctx.font = '500 8.5px "JetBrains Mono", monospace';
            ctx.textBaseline = 'middle';

            for (const dbMark of fftDbLines) {
              const unit = normalizeDbToUnit(dbMark);
              const y = Math.round(fftBottom - unit * fftH) + 0.5;

              ctx.strokeStyle =
                dbMark === 0
                  ? 'rgba(239, 68, 68, 0.35)'
                  : dbMark === -3
                  ? 'rgba(245, 158, 11, 0.35)'
                  : 'rgba(43, 51, 66, 0.55)';
              ctx.beginPath();
              ctx.moveTo(fftLeft, y);
              ctx.lineTo(fftRight, y);
              ctx.stroke();

              // Omit -3 text label on Y-axis when vertical spacing is tight so 0 and -3 never overlap
              if (dbMark === -3 && fftH < 150) continue;

              ctx.fillStyle = dbMark === 0 ? '#EF4444' : '#9AA4B2';
              ctx.textAlign = 'right';
              ctx.fillText(`${dbMark}`, fftLeft - 4, y);
            }

            // 3. 48-Band Logarithmic FFT Bars + Smooth Peak-Hold Decay Ticks
            const bands = frame?.fftBands ?? [];
            const bandCount = 48;
            const gap = fftW > 380 ? 2 : 1.5;
            const barW = Math.max(2, (fftW - gap * (bandCount - 1)) / bandCount);
            const peaks = fftPeakRef.current;
            const holds = fftHoldRef.current;

            const amberStop = 1 - normalizeDbToUnit(METER_AMBER_THRESHOLD_DB);
            const clipStop = 1 - normalizeDbToUnit(METER_CLIP_THRESHOLD_DB);

            const barGrad = ctx.createLinearGradient(0, fftTop, 0, fftBottom);
            barGrad.addColorStop(0, '#EF4444');
            barGrad.addColorStop(Math.min(0.99, Math.max(0.01, clipStop + 0.01)), '#F59E0B');
            barGrad.addColorStop(Math.min(0.99, Math.max(0.03, amberStop + 0.04)), '#10B981');
            barGrad.addColorStop(1, 'rgba(16, 185, 129, 0.24)');

            for (let i = 0; i < bandCount; i++) {
              const mag = Math.max(0, Math.min(1, bands[i] ?? 0.04));
              const step = stepPeakHold(mag, peaks[i], holds[i], dtSec, 0.36, 0.48);
              peaks[i] = step.peak;
              holds[i] = step.holdSeconds;

              const x = fftLeft + i * (barW + gap);
              const barH = Math.max(2, mag * fftH);
              const y = fftBottom - barH;

              ctx.fillStyle = barGrad;
              ctx.fillRect(x, y, barW, barH);

              // Peak-hold tick colored by its dBFS threshold (Emerald -> Amber > -3 dBFS -> Red at 0 dBFS)
              const peakDb = unitToDb(peaks[i]);
              const peakY = Math.max(fftTop, fftBottom - peaks[i] * fftH - 2);
              ctx.fillStyle = getMeterColorForDb(peakDb);
              ctx.fillRect(x, peakY, barW, 2);
            }

            // 4. Logarithmic Frequency Axis Labels (adaptive density to prevent any collisions)
            const freqY = fftBottom + 9;
            const freqTicks = fftW >= 460 ? FREQ_TICKS_WIDE : FREQ_TICKS_COMPACT;
            ctx.font = '500 8.5px "JetBrains Mono", monospace';
            ctx.fillStyle = '#9AA4B2';
            ctx.textBaseline = 'middle';
            const tickCount = freqTicks.length;
            for (let t = 0; t < tickCount; t++) {
              const ratio = t / (tickCount - 1);
              const tx = fftLeft + ratio * fftW;
              ctx.textAlign = t === 0 ? 'left' : t === tickCount - 1 ? 'right' : 'center';
              ctx.fillText(freqTicks[t], tx, freqY);
            }

            // Divider before L/R True-Peak VU Meter section
            const vuTop = fftBottom + freqAxisH + 4;
            ctx.strokeStyle = '#2B3342';
            ctx.beginPath();
            ctx.moveTo(0, vuTop + 0.5);
            ctx.lineTo(w, vuTop + 0.5);
            ctx.stroke();

            // 5. L / R True-Peak VU Meter Bars + Monospace dBFS Scale
            const meterLeft = padX + 16;
            const readoutW = 54;
            const meterRight = w - padX - readoutW;
            const meterW = Math.max(80, meterRight - meterLeft);
            const meterH = 8.5;

            const leftDb = frame?.leftPeakDb ?? -42;
            const rightDb = frame?.rightPeakDb ?? -42;
            const leftRmsDb = frame?.leftRmsDb ?? -48;
            const rightRmsDb = frame?.rightRmsDb ?? -48;

            const leftUnit = normalizeDbToUnit(leftDb);
            const rightUnit = normalizeDbToUnit(rightDb);
            vuLeftPeakRef.current = stepPeakHold(
              leftUnit,
              vuLeftPeakRef.current.peak,
              vuLeftPeakRef.current.holdSeconds,
              dtSec,
              0.55,
              0.38
            );
            vuRightPeakRef.current = stepPeakHold(
              rightUnit,
              vuRightPeakRef.current.peak,
              vuRightPeakRef.current.holdSeconds,
              dtSec,
              0.55,
              0.38
            );

            // Horizontal studio meter gradient (Emerald -> Amber above -3 dBFS -> Red at 0 dBFS)
            const vuGrad = ctx.createLinearGradient(meterLeft, 0, meterRight, 0);
            const vuAmberStop = normalizeDbToUnit(METER_AMBER_THRESHOLD_DB);
            const vuClipStop = normalizeDbToUnit(METER_CLIP_THRESHOLD_DB);
            vuGrad.addColorStop(0, '#059669');
            vuGrad.addColorStop(Math.max(0.01, vuAmberStop - 0.02), '#10B981');
            vuGrad.addColorStop(vuAmberStop, '#F59E0B');
            vuGrad.addColorStop(Math.min(0.995, vuClipStop), '#F59E0B');
            vuGrad.addColorStop(1, '#EF4444');

            const channels = [
              {
                label: 'L',
                y: vuTop + 9,
                peakUnit: leftUnit,
                rmsUnit: normalizeDbToUnit(leftRmsDb),
                holdUnit: vuLeftPeakRef.current.peak,
                db: leftDb,
              },
              {
                label: 'R',
                y: vuTop + 23,
                peakUnit: rightUnit,
                rmsUnit: normalizeDbToUnit(rightRmsDb),
                holdUnit: vuRightPeakRef.current.peak,
                db: rightDb,
              },
            ];

            for (const ch of channels) {
              ctx.font = '700 9.5px "JetBrains Mono", monospace';
              ctx.fillStyle = '#9AA4B2';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(ch.label, padX, ch.y + meterH / 2);

              ctx.fillStyle = '#14181F';
              ctx.fillRect(meterLeft, ch.y, meterW, meterH);

              ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
              ctx.fillRect(meterLeft, ch.y, Math.max(0, ch.rmsUnit * meterW), meterH);

              ctx.fillStyle = vuGrad;
              ctx.fillRect(meterLeft, ch.y + 1, Math.max(2, ch.peakUnit * meterW), meterH - 2);

              ctx.fillStyle = '#0B0D10';
              for (let s = 1; s < 30; s++) {
                const sx = Math.round(meterLeft + (meterW / 30) * s);
                ctx.fillRect(sx, ch.y, 1, meterH);
              }

              // Peak-hold decay tick
              const holdX = Math.min(meterRight - 2.5, meterLeft + ch.holdUnit * meterW);
              const holdDb = unitToDb(ch.holdUnit);
              ctx.fillStyle = getMeterColorForDb(holdDb);
              ctx.fillRect(holdX, ch.y, 2.5, meterH);

              ctx.font = '600 9.5px "JetBrains Mono", monospace';
              ctx.fillStyle = getMeterColorForDb(ch.db);
              ctx.textAlign = 'right';
              ctx.fillText(`${ch.db.toFixed(1)} dB`, w - padX, ch.y + meterH / 2);
            }

            // Monospace dBFS Scale along bottom of VU section (spaced cleanly, dBFS unit on far right)
            const scaleY = vuTop + 46;
            ctx.font = '500 8.5px "JetBrains Mono", monospace';
            ctx.textBaseline = 'middle';
            for (const mark of DB_SCALE_MARKS) {
              const u = normalizeDbToUnit(mark);
              const mx = meterLeft + u * meterW;

              ctx.fillStyle = mark === 0 ? '#EF4444' : mark === -3 ? '#F59E0B' : '#2B3342';
              ctx.fillRect(Math.round(mx), vuTop + 35, 1, 4);

              ctx.fillStyle = mark === 0 ? '#EF4444' : mark === -3 ? '#F59E0B' : '#9AA4B2';
              if (mark === -60) {
                ctx.textAlign = 'left';
                ctx.fillText('-60', mx, scaleY);
              } else if (mark === -3) {
                ctx.textAlign = 'right';
                ctx.fillText('-3', mx - 3, scaleY);
              } else if (mark === 0) {
                ctx.textAlign = 'right';
                ctx.fillText('0', mx + 1, scaleY);
              } else {
                ctx.textAlign = 'center';
                ctx.fillText(`${mark}`, mx, scaleY);
              }
            }

            ctx.fillStyle = '#9AA4B2';
            ctx.textAlign = 'right';
            ctx.fillText('dBFS', w - padX, scaleY);

            ctx.restore();
          }
        }
      }

      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      unsubscribe();
    };
  }, []);

  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-[#2B3342] bg-[#0B0D10] ${className}`}
    >
      <canvas
        ref={canvasRef}
        data-testid="spectrum-vu-canvas"
        aria-label="Real-time 48-band logarithmic FFT spectrum analyzer and stereo L/R true-peak VU meter"
        role="img"
        className="block w-full"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

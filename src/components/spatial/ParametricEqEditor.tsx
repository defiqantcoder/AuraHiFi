import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Power,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import type { PeqBand, PeqFilterType, SpatialConfig } from '../../lib/audioBridge';
import {
  AUTO_EQ_PRESETS,
  dbToNormY,
  EQ_MAX_DB,
  EQ_MAX_FREQ,
  EQ_MIN_DB,
  EQ_MIN_FREQ,
  evaluateCombinedEqCurve,
  evaluateSingleBandCurve,
  freqToNormX,
  normXToFreq,
  normYToDb,
} from '../../lib/biquadDsp';

interface ParametricEqEditorProps {
  config: SpatialConfig;
  disabled: boolean;
  onUpdateConfig: (next: SpatialConfig) => Promise<void> | void;
}

const SVG_W = 880;
const SVG_H = 290;
const PAD_L = 52;
const PAD_R = 24;
const PAD_T = 22;
const PAD_B = 34;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const DB_TICKS = [12, 6, 0, -6, -12];

function formatFreqLabel(hz: number): string {
  if (hz === 20) return '20 Hz';
  if (hz === 20000) return '20 kHz';
  if (hz >= 1000) {
    const khz = hz / 1000;
    return Number.isInteger(khz) ? `${khz}k` : `${khz.toFixed(1)}k`;
  }
  return `${Math.round(hz)}`;
}

function formatFreqDetail(hz: number): string {
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

function formatSignedDb(db: number): string {
  const fixed = db.toFixed(1);
  return db > 0 ? `+${fixed} dB` : `${fixed} dB`;
}

export const ParametricEqEditor: React.FC<ParametricEqEditorProps> = ({
  config,
  disabled,
  onUpdateConfig,
}) => {
  const [draftBands, setDraftBands] = useState<PeqBand[]>(config.peqBands);
  const [draftPreamp, setDraftPreamp] = useState<number>(config.preampGainDb);
  const [selectedBandIdx, setSelectedBandIdx] = useState<number>(0);
  const [draggingBandIdx, setDraggingBandIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const latestBandsRef = useRef<PeqBand[]>(config.peqBands);

  // Sync draft state when store config changes externally (e.g. preset load or reset)
  useEffect(() => {
    if (draggingBandIdx === null) {
      setDraftBands(config.peqBands);
      latestBandsRef.current = config.peqBands;
    }
  }, [config.peqBands, draggingBandIdx]);

  useEffect(() => {
    setDraftPreamp(config.preampGainDb);
  }, [config.preampGainDb]);

  const safeSelectedIdx = Math.min(selectedBandIdx, Math.max(0, draftBands.length - 1));
  const selectedBand = draftBands[safeSelectedIdx];

  const combined = useMemo(
    () => evaluateCombinedEqCurve(draftBands, draftPreamp, 220, 48000),
    [draftBands, draftPreamp]
  );

  const selectedBandPoints = useMemo(() => {
    if (!selectedBand) return [];
    return evaluateSingleBandCurve(selectedBand, 140, 48000);
  }, [selectedBand]);

  const toSvgX = useCallback((freqHz: number) => PAD_L + freqToNormX(freqHz) * PLOT_W, []);
  const toSvgY = useCallback((db: number) => PAD_T + dbToNormY(db) * PLOT_H, []);

  const zeroDbY = toSvgY(0);

  const rawCurvePath = useMemo(() => {
    if (combined.points.length === 0) return '';
    return combined.points
      .map((pt, i) => {
        const x = toSvgX(pt.freqHz).toFixed(2);
        const y = toSvgY(pt.rawDb).toFixed(2);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }, [combined.points, toSvgX, toSvgY]);

  const rawAreaPath = useMemo(() => {
    if (combined.points.length === 0) return '';
    const firstX = toSvgX(combined.points[0].freqHz).toFixed(2);
    const lastX = toSvgX(combined.points[combined.points.length - 1].freqHz).toFixed(2);
    return `${rawCurvePath} L${lastX},${zeroDbY.toFixed(2)} L${firstX},${zeroDbY.toFixed(2)} Z`;
  }, [combined.points, rawCurvePath, toSvgX, zeroDbY]);

  const netCurvePath = useMemo(() => {
    if (combined.points.length === 0) return '';
    return combined.points
      .map((pt, i) => {
        const x = toSvgX(pt.freqHz).toFixed(2);
        const y = toSvgY(pt.totalDb).toFixed(2);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }, [combined.points, toSvgX, toSvgY]);

  const selectedBandPath = useMemo(() => {
    if (selectedBandPoints.length === 0) return '';
    return selectedBandPoints
      .map((pt, i) => {
        const x = toSvgX(pt.freqHz).toFixed(2);
        const y = toSvgY(pt.db).toFixed(2);
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }, [selectedBandPoints, toSvgX, toSvgY]);

  const netPeakDb = useMemo(
    () => Number((combined.maxPositiveGainDb + draftPreamp).toFixed(1)),
    [combined.maxPositiveGainDb, draftPreamp]
  );

  const commitConfig = useCallback(
    (patch: Partial<SpatialConfig>) => {
      void onUpdateConfig({
        ...config,
        ...patch,
      });
    },
    [config, onUpdateConfig]
  );

  const updateBandLocal = useCallback(
    (index: number, patch: Partial<PeqBand>, shouldCommit: boolean) => {
      setDraftBands((prev) => {
        const next = prev.map((b, i) => (i === index ? { ...b, ...patch } : b));
        latestBandsRef.current = next;
        if (shouldCommit) {
          void onUpdateConfig({
            ...config,
            peqBands: next,
            autoEqProfileName: 'Custom User Curve',
          });
        }
        return next;
      });
    },
    [config, onUpdateConfig]
  );

  const pointerToFreqAndDb = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const svgX = ((clientX - rect.left) / rect.width) * SVG_W;
    const svgY = ((clientY - rect.top) / rect.height) * SVG_H;
    const normX = Math.max(0, Math.min(1, (svgX - PAD_L) / PLOT_W));
    const normY = Math.max(0, Math.min(1, (svgY - PAD_T) / PLOT_H));
    return {
      frequencyHz: normXToFreq(normX, EQ_MIN_FREQ, EQ_MAX_FREQ),
      gainDb: normYToDb(normY, EQ_MIN_DB, EQ_MAX_DB),
    };
  }, []);

  const handleNodePointerDown = (idx: number, e: React.PointerEvent<SVGGElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedBandIdx(idx);
    setDraggingBandIdx(idx);
  };

  const handleNodePointerMove = (idx: number, e: React.PointerEvent<SVGGElement>) => {
    if (disabled || draggingBandIdx !== idx) return;
    const mapped = pointerToFreqAndDb(e.clientX, e.clientY);
    if (!mapped) return;
    updateBandLocal(
      idx,
      {
        frequencyHz: mapped.frequencyHz,
        gainDb: mapped.gainDb,
        enabled: true,
      },
      false
    );
  };

  const handleNodePointerUp = (idx: number, e: React.PointerEvent<SVGGElement>) => {
    if (draggingBandIdx !== idx) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingBandIdx(null);
    commitConfig({
      peqBands: latestBandsRef.current,
      autoEqProfileName: 'Custom User Curve',
    });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (disabled) return;
      const target = e.target as Element | null;
      const nodeGroup = target?.closest?.('[data-eq-band-idx]');
      if (!nodeGroup) return;
      const idxAttr = nodeGroup.getAttribute('data-eq-band-idx');
      if (idxAttr === null) return;
      const idx = Number(idxAttr);
      if (Number.isNaN(idx)) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedBandIdx(idx);
      const band = latestBandsRef.current[idx];
      if (!band) return;
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      const nextQ = Math.round(Math.max(0.4, Math.min(10.0, band.qFactor + delta)) * 100) / 100;
      updateBandLocal(idx, { qFactor: nextQ }, true);
    };
    svg.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onNativeWheel);
    };
  }, [disabled, updateBandLocal]);

  const handleLoadPreset = (presetId: string) => {
    if (disabled) return;
    const preset = AUTO_EQ_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const clonedBands = preset.bands.map((b) => ({ ...b }));
    setDraftBands(clonedBands);
    latestBandsRef.current = clonedBands;
    setDraftPreamp(preset.preampGainDb);
    commitConfig({
      peqEnabled: true,
      peqBands: clonedBands,
      preampGainDb: preset.preampGainDb,
      autoEqProfileName: preset.name,
    });
  };

  const handleAutoHeadroom = () => {
    if (disabled) return;
    const rec = combined.recommendedPreampDb;
    setDraftPreamp(rec);
    commitConfig({
      preampGainDb: rec,
    });
  };

  // Active readout badge position inside SVG (clamped to never clip edges)
  const activeNodeX = selectedBand ? toSvgX(selectedBand.frequencyHz) : PAD_L + PLOT_W / 2;
  const activeNodeY = selectedBand ? toSvgY(selectedBand.gainDb) : zeroDbY;
  const badgeW = 212;
  const badgeH = 24;
  const badgeX = Math.max(PAD_L + 6, Math.min(SVG_W - PAD_R - badgeW - 6, activeNodeX - badgeW / 2));
  const badgeY = activeNodeY < PAD_T + 40 ? activeNodeY + 18 : activeNodeY - 36;

  return (
    <section
      aria-label="10-Band Parametric EQ Curve Editor"
      className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5"
    >
      {/* Header Row: Title, Engine Badges, AutoEQ Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3342] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                10-Band Parametric EQ
              </h2>
              <span className="mono-telemetry rounded-[6px] border border-[#2B3342] bg-[#1C222D] px-2 py-0.5 text-[11px] text-[#38BDF8]">
                RBJ 64-bit Biquad
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#9AA4B2]">
              Drag numbered nodes to shape Frequency &amp; Gain · Scroll wheel on node to adjust Q-Factor
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => commitConfig({ peqEnabled: !config.peqEnabled })}
            className={`inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition ${
              config.peqEnabled
                ? 'border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8]'
                : 'border-[#2B3342] bg-[#1C222D] text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            {config.peqEnabled ? 'PEQ Enabled' : 'PEQ Bypassed'}
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              commitConfig({ truePeakLimiterEnabled: !config.truePeakLimiterEnabled })
            }
            className={`inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-xs font-medium transition ${
              config.truePeakLimiterEnabled
                ? 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]'
                : 'border-[#2B3342] bg-[#1C222D] text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Limiter {config.truePeakLimiterEnabled ? '-0.3 dBTP' : 'Off'}
          </button>
        </div>
      </div>

      {/* AutoEQ Reference Presets Row */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#9AA4B2]">
            <Sparkles className="h-3.5 w-3.5 text-[#38BDF8]" />
            AutoEQ Presets:
          </span>
          {AUTO_EQ_PRESETS.map((preset) => {
            const isActive = config.autoEqProfileName === preset.name;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => handleLoadPreset(preset.id)}
                className={`rounded-[8px] border px-2.5 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#F2F4F8]'
                    : 'border-[#2B3342] bg-[#1C222D] text-[#9AA4B2] hover:border-[#38BDF8]/40 hover:text-[#F2F4F8]'
                }`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mono-telemetry text-[11px]">
          <span className="text-[#9AA4B2]">
            Max Boost:{' '}
            <strong className="text-[#F2F4F8]">+{combined.maxPositiveGainDb.toFixed(1)} dB</strong>
          </span>
          <span
            className={
              netPeakDb > 0
                ? 'inline-flex items-center gap-1 text-[#F59E0B]'
                : 'text-[#10B981]'
            }
          >
            {netPeakDb > 0 && <AlertTriangle className="h-3 w-3" />}
            Net Peak: <strong>{formatSignedDb(netPeakDb)}</strong>
          </span>
        </div>
      </div>

      {/* Interactive SVG Parametric EQ Canvas */}
      <div className="mt-3.5 overflow-hidden rounded-[12px] border border-[#2B3342] bg-[#0B0D10]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label="Interactive 10-band logarithmic parametric EQ response graph"
          className={`block h-[270px] w-full select-none ${
            !config.peqEnabled ? 'opacity-50' : ''
          }`}
        >
          <defs>
            <linearGradient id="peqCyanFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
              <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.22" />
            </linearGradient>
            <clipPath id="peqPlotClip">
              <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>

          {/* Subtle plot backdrop */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H}
            fill="#0D1117"
            stroke="#2B3342"
            strokeWidth="1"
          />

          {/* Horizontal dB Gridlines & Axis Ticks */}
          {DB_TICKS.map((db) => {
            const y = toSvgY(db);
            const isZero = db === 0;
            return (
              <g key={`db-${db}`}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={SVG_W - PAD_R}
                  y2={y}
                  stroke={isZero ? '#475569' : '#2B3342'}
                  strokeWidth={isZero ? 1.25 : 0.85}
                  strokeDasharray={isZero ? undefined : '3 4'}
                />
                <text
                  x={PAD_L - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={isZero ? '#F2F4F8' : '#9AA4B2'}
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {db > 0 ? `+${db}` : `${db}`}
                </text>
              </g>
            );
          })}

          {/* Vertical Logarithmic Frequency Gridlines & Axis Ticks */}
          {FREQ_TICKS.map((hz) => {
            const x = toSvgX(hz);
            const anchor = hz === 20 ? 'start' : hz === 20000 ? 'end' : 'middle';
            return (
              <g key={`hz-${hz}`}>
                <line
                  x1={x}
                  y1={PAD_T}
                  x2={x}
                  y2={PAD_T + PLOT_H}
                  stroke="#2B3342"
                  strokeWidth="0.85"
                />
                <text
                  x={x}
                  y={SVG_H - 12}
                  textAnchor={anchor}
                  fill="#9AA4B2"
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatFreqLabel(hz)}
                </text>
              </g>
            );
          })}

          {/* Axis Unit Label (Y-axis only; X-axis endpoints show Hz/kHz cleanly) */}
          <text
            x={PAD_L - 8}
            y={PAD_T - 7}
            textAnchor="end"
            fill="#64748B"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
          >
            dB
          </text>

          {/* Clipped Curves Layer */}
          <g clipPath="url(#peqPlotClip)">
            {/* Selected Band Isolated Curve */}
            {selectedBand?.enabled && selectedBandPath && (
              <path
                d={selectedBandPath}
                fill="none"
                stroke="#38BDF8"
                strokeOpacity="0.38"
                strokeWidth="1.4"
                strokeDasharray="4 3"
              />
            )}

            {/* Combined Raw EQ Gradient Area */}
            {rawAreaPath && <path d={rawAreaPath} fill="url(#peqCyanFill)" />}

            {/* Preamp-Compensated Net Output Curve */}
            {Math.abs(draftPreamp) > 0.05 && netCurvePath && (
              <path
                d={netCurvePath}
                fill="none"
                stroke={netPeakDb > 0 ? '#F59E0B' : '#10B981'}
                strokeOpacity="0.8"
                strokeWidth="1.4"
                strokeDasharray="5 4"
              />
            )}

            {/* Combined Biquad Magnitude Response Curve */}
            {rawCurvePath && (
              <path
                data-testid="eq-combined-curve"
                d={rawCurvePath}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </g>

          {/* 10 Draggable Filter Nodes */}
          {draftBands.map((band, idx) => {
            const cx = toSvgX(band.frequencyHz);
            const cy = toSvgY(band.gainDb);
            const isSelected = idx === safeSelectedIdx;
            const isDragging = idx === draggingBandIdx;

            return (
              <g
                key={band.id}
                data-testid={`eq-node-${idx + 1}`}
                data-eq-band-idx={idx}
                transform={`translate(${cx.toFixed(2)}, ${cy.toFixed(2)})`}
                onPointerDown={(e) => handleNodePointerDown(idx, e)}
                onPointerMove={(e) => handleNodePointerMove(idx, e)}
                onPointerUp={(e) => handleNodePointerUp(idx, e)}
                onPointerCancel={(e) => handleNodePointerUp(idx, e)}
                onClick={() => setSelectedBandIdx(idx)}
                style={{ cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab' }}
                opacity={band.enabled ? 1 : 0.45}
              >
                {/* Vertical guide hairline for selected node */}
                {isSelected && (
                  <line
                    x1={0}
                    y1={zeroDbY - cy}
                    x2={0}
                    y2={0}
                    stroke="#38BDF8"
                    strokeOpacity="0.45"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Outer selection halo */}
                {isSelected && (
                  <circle
                    r={isDragging ? 18 : 15}
                    fill="#38BDF8"
                    fillOpacity="0.16"
                    stroke="#38BDF8"
                    strokeOpacity="0.55"
                    strokeWidth="1"
                  />
                )}

                {/* Main node circle */}
                <circle
                  r={11}
                  fill={isSelected ? '#38BDF8' : band.enabled ? '#14181F' : '#0B0D10'}
                  stroke={isSelected ? '#F2F4F8' : band.enabled ? '#38BDF8' : '#64748B'}
                  strokeWidth={isSelected ? 2 : 1.5}
                />

                {/* Band index number */}
                <text
                  y="3.5"
                  textAnchor="middle"
                  fill={isSelected ? '#0B0D10' : '#F2F4F8'}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                  pointerEvents="none"
                >
                  {idx + 1}
                </text>
              </g>
            );
          })}

          {/* Floating Active Node Readout Pill */}
          {selectedBand && (
            <g pointerEvents="none">
              <rect
                x={badgeX}
                y={badgeY}
                width={badgeW}
                height={badgeH}
                rx={6}
                fill="#14181F"
                fillOpacity="0.94"
                stroke="#38BDF8"
                strokeOpacity="0.6"
                strokeWidth="1"
              />
              <text
                x={badgeX + badgeW / 2}
                y={badgeY + 15.5}
                textAnchor="middle"
                fill="#F2F4F8"
                fontSize="10.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {`#${safeSelectedIdx + 1} · ${formatFreqDetail(selectedBand.frequencyHz)} · ${formatSignedDb(selectedBand.gainDb)} · Q ${selectedBand.qFactor.toFixed(2)}`}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend + Preamp Gain & Auto-Headroom Strip */}
      <div className="mt-4 grid grid-cols-1 gap-4 rounded-[10px] border border-[#2B3342] bg-[#1C222D]/60 p-3.5 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-6">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="eq-preamp-slider" className="font-medium text-[#F2F4F8]">
              Preamp Gain Headroom (dB)
            </label>
            <span
              data-testid="eq-preamp-readout"
              className="mono-telemetry font-semibold text-[#38BDF8]"
            >
              {formatSignedDb(draftPreamp)}
            </span>
          </div>
          <input
            id="eq-preamp-slider"
            type="range"
            min={-12}
            max={6}
            step={0.1}
            disabled={disabled}
            value={draftPreamp}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDraftPreamp(val);
              commitConfig({ preampGainDb: val });
            }}
            className="studio-slider mt-1.5 h-4 w-full"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-6 lg:justify-end">
          <div className="mono-telemetry text-[11px] text-[#9AA4B2]">
            Recommended:{' '}
            <span className="font-semibold text-[#10B981]">
              {formatSignedDb(combined.recommendedPreampDb)}
            </span>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={handleAutoHeadroom}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-1.5 text-xs font-medium text-[#38BDF8] transition hover:bg-[#38BDF8]/20"
          >
            <Activity className="h-3.5 w-3.5" />
            Auto-Calc Headroom
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleLoadPreset('flat-reference')}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1.5 text-xs font-medium text-[#9AA4B2] transition hover:text-[#F2F4F8]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Flatten
          </button>
        </div>
      </div>

      {/* 10-Band Selector Strip + Selected-Band Precision Inspector */}
      <div className="mt-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10]/70 p-3.5">
        {/* Band Pills Row */}
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {draftBands.map((band, idx) => {
            const isSelected = idx === safeSelectedIdx;
            return (
              <button
                key={band.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedBandIdx(idx)}
                className={`flex flex-col items-center rounded-[8px] border px-1.5 py-1.5 text-center transition ${
                  isSelected
                    ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#F2F4F8]'
                    : 'border-[#2B3342] bg-[#14181F] text-[#9AA4B2] hover:border-[#38BDF8]/40 hover:text-[#F2F4F8]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      band.enabled ? 'bg-[#38BDF8]' : 'bg-[#475569]'
                    }`}
                  />
                  <span className="mono-telemetry text-[11px] font-semibold">B{idx + 1}</span>
                </div>
                <span className="mono-telemetry mt-0.5 text-[10px] text-[#9AA4B2]">
                  {formatFreqLabel(band.frequencyHz)}
                </span>
                <span
                  className={`mono-telemetry text-[10px] font-medium ${
                    band.gainDb > 0.05
                      ? 'text-[#38BDF8]'
                      : band.gainDb < -0.05
                      ? 'text-[#F59E0B]'
                      : 'text-[#64748B]'
                  }`}
                >
                  {band.gainDb >= 0 ? `+${band.gainDb.toFixed(1)}` : band.gainDb.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Band Precision Controls */}
        {selectedBand && (
          <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-[#2B3342] pt-3.5 md:grid-cols-12 md:items-end">
            {/* Band Active Toggle */}
            <div className="md:col-span-2">
              <span className="block text-[11px] font-medium text-[#9AA4B2]">
                Band #{safeSelectedIdx + 1} Status
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  updateBandLocal(safeSelectedIdx, { enabled: !selectedBand.enabled }, true)
                }
                className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-[8px] border px-2.5 py-2 text-xs font-medium transition ${
                  selectedBand.enabled
                    ? 'border-[#38BDF8]/50 bg-[#38BDF8]/15 text-[#38BDF8]'
                    : 'border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {selectedBand.enabled ? 'Enabled' : 'Bypassed'}
              </button>
            </div>

            {/* Filter Type */}
            <div className="md:col-span-2">
              <label
                htmlFor="eq-band-type"
                className="block text-[11px] font-medium text-[#9AA4B2]"
              >
                Filter Type
              </label>
              <select
                id="eq-band-type"
                disabled={disabled}
                value={selectedBand.filterType}
                onChange={(e) =>
                  updateBandLocal(
                    safeSelectedIdx,
                    { filterType: e.target.value as PeqFilterType },
                    true
                  )
                }
                className="mt-1.5 w-full rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-2.5 py-2 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
              >
                <option value="low_shelf">Low Shelf</option>
                <option value="peaking">Peaking Bell</option>
                <option value="high_shelf">High Shelf</option>
              </select>
            </div>

            {/* Frequency Slider (Log-scaled) */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="eq-band-freq" className="font-medium text-[#9AA4B2]">
                  Frequency (Hz)
                </label>
                <span
                  data-testid="eq-selected-freq"
                  className="mono-telemetry font-semibold text-[#F2F4F8]"
                >
                  {formatFreqDetail(selectedBand.frequencyHz)}
                </span>
              </div>
              <input
                id="eq-band-freq"
                type="range"
                min={0}
                max={1000}
                step={1}
                disabled={disabled}
                value={Math.round(freqToNormX(selectedBand.frequencyHz) * 1000)}
                onChange={(e) => {
                  const freqHz = normXToFreq(Number(e.target.value) / 1000);
                  updateBandLocal(safeSelectedIdx, { frequencyHz: freqHz }, true);
                }}
                className="studio-slider mt-1.5 h-4 w-full"
              />
            </div>

            {/* Gain Slider */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="eq-band-gain" className="font-medium text-[#9AA4B2]">
                  Gain (dB)
                </label>
                <span
                  data-testid="eq-selected-gain"
                  className="mono-telemetry font-semibold text-[#38BDF8]"
                >
                  {formatSignedDb(selectedBand.gainDb)}
                </span>
              </div>
              <input
                id="eq-band-gain"
                type="range"
                min={EQ_MIN_DB}
                max={EQ_MAX_DB}
                step={0.1}
                disabled={disabled}
                value={selectedBand.gainDb}
                onChange={(e) => {
                  updateBandLocal(safeSelectedIdx, { gainDb: Number(e.target.value) }, true);
                }}
                className="studio-slider mt-1.5 h-4 w-full"
              />
            </div>

            {/* Q-Factor Slider */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor="eq-band-q" className="font-medium text-[#9AA4B2]">
                  Q-Factor
                </label>
                <span
                  data-testid="eq-selected-q"
                  className="mono-telemetry font-semibold text-[#F2F4F8]"
                >
                  {selectedBand.qFactor.toFixed(2)}
                </span>
              </div>
              <input
                id="eq-band-q"
                type="range"
                min={0.4}
                max={10}
                step={0.05}
                disabled={disabled}
                value={selectedBand.qFactor}
                onChange={(e) => {
                  updateBandLocal(safeSelectedIdx, { qFactor: Number(e.target.value) }, true);
                }}
                className="studio-slider mt-1.5 h-4 w-full"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

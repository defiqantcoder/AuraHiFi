import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Headphones, RotateCcw } from 'lucide-react';
import type { SpatialConfig } from '../../lib/audioBridge';
import {
  projectPolarToStage2D,
  stage2DToAzimuthDeg,
  VIRTUAL_714_SPEAKERS,
} from '../../lib/biquadDsp';

interface SpatialSoundstagePadProps {
  config: SpatialConfig;
  disabled: boolean;
  onUpdateConfig: (next: SpatialConfig) => Promise<void> | void;
}

const PAD_SIZE = 340;
const CX = PAD_SIZE / 2;
const CY = PAD_SIZE / 2;
const MAX_R = 132;

type CrossfeedOptionId = 'off' | 'jmeier' | 'cmoy' | 'default';

const CROSSFEED_OPTIONS: {
  id: CrossfeedOptionId;
  label: string;
  spec: string;
}[] = [
  { id: 'off', label: 'Off', spec: 'Direct stereo separation (0 dB crossfeed)' },
  { id: 'jmeier', label: 'JMeier (Subtle)', spec: 'Jan Meier natural · 650 Hz / 9.5 dB feed' },
  { id: 'cmoy', label: 'CMoy (Classic)', spec: 'Chu Moy classic · 700 Hz / 6.0 dB feed' },
  { id: 'default', label: 'Default (±30°)', spec: 'BS2B studio reference · 700 Hz / 4.5 dB feed' },
];

export const SpatialSoundstagePad: React.FC<SpatialSoundstagePadProps> = ({
  config,
  disabled,
  onUpdateConfig,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'focus' | 'elevation' | null>(null);
  const [draftAzimuth, setDraftAzimuth] = useState<number>(config.azimuthDeg);
  const [draftElevation, setDraftElevation] = useState<number>(config.elevationDeg);
  const [draftRadius, setDraftRadius] = useState<number>(config.radiusMeters);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('FR');

  const draftRef = useRef({
    azimuthDeg: config.azimuthDeg,
    elevationDeg: config.elevationDeg,
    radiusMeters: config.radiusMeters,
  });

  useEffect(() => {
    if (!draggingHandle) {
      setDraftAzimuth(config.azimuthDeg);
      setDraftElevation(config.elevationDeg);
      setDraftRadius(config.radiusMeters);
      draftRef.current = {
        azimuthDeg: config.azimuthDeg,
        elevationDeg: config.elevationDeg,
        radiusMeters: config.radiusMeters,
      };
    }
  }, [config.azimuthDeg, config.elevationDeg, config.radiusMeters, draggingHandle]);

  const commit = useCallback(
    (patch: Partial<SpatialConfig>) => {
      void onUpdateConfig({
        ...config,
        ...patch,
      });
    },
    [config, onUpdateConfig]
  );

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number, shiftHeld: boolean) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((clientX - rect.left) / rect.width) * PAD_SIZE;
      const y = ((clientY - rect.top) / rect.height) * PAD_SIZE;

      const nextAz = stage2DToAzimuthDeg(x, y, CX, CY);
      const distPx = Math.hypot(x - CX, y - CY);
      const clampedDist = Math.max(24, Math.min(MAX_R, distPx));
      const normDist = (clampedDist - 24) / (MAX_R - 24);

      if (shiftHeld) {
        // Shift + drag adjusts vertical elevation (-90..+90°) while rotating azimuth
        const nextEl = Math.round((1 - normDist) * 180 - 90);
        setDraftAzimuth(nextAz);
        setDraftElevation(nextEl);
        draftRef.current = { ...draftRef.current, azimuthDeg: nextAz, elevationDeg: nextEl };
      } else {
        // Normal drag adjusts Azimuth (0..360°) & Room Radius (0.5..10.0 m)
        const nextRad = Math.round((0.5 + normDist * 9.5) * 10) / 10;
        setDraftAzimuth(nextAz);
        setDraftRadius(nextRad);
        draftRef.current = { ...draftRef.current, azimuthDeg: nextAz, radiusMeters: nextRad };
      }
    },
    []
  );

  const handlePadPointerDown = (e: React.PointerEvent<SVGGElement | SVGSVGElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingHandle('focus');
    updateFromPointer(e.clientX, e.clientY, e.shiftKey);
  };

  const handlePadPointerMove = (e: React.PointerEvent<SVGGElement | SVGSVGElement>) => {
    if (disabled || draggingHandle !== 'focus') return;
    updateFromPointer(e.clientX, e.clientY, e.shiftKey);
  };

  const handlePadPointerUp = (e: React.PointerEvent<SVGGElement | SVGSVGElement>) => {
    if (draggingHandle !== 'focus') return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingHandle(null);
    commit({
      azimuthDeg: draftRef.current.azimuthDeg,
      elevationDeg: draftRef.current.elevationDeg,
      radiusMeters: draftRef.current.radiusMeters,
    });
  };

  // Focus virtual speaker projection
  const focusPos = projectPolarToStage2D(
    draftAzimuth,
    draftElevation,
    draftRadius,
    CX,
    CY,
    MAX_R
  );

  const activeCrossfeed: CrossfeedOptionId = !config.bs2bEnabled ? 'off' : config.bs2bPreset;
  const activeCrossfeedMeta =
    CROSSFEED_OPTIONS.find((opt) => opt.id === activeCrossfeed) ?? CROSSFEED_OPTIONS[0];

  const handleCrossfeedSelect = (id: CrossfeedOptionId) => {
    if (disabled) return;
    if (id === 'off') {
      commit({ bs2bEnabled: false });
    } else {
      commit({ bs2bEnabled: true, bs2bPreset: id });
    }
  };

  const handleResetStage = () => {
    if (disabled) return;
    setDraftAzimuth(30);
    setDraftElevation(12);
    setDraftRadius(2.4);
    draftRef.current = { azimuthDeg: 30, elevationDeg: 12, radiusMeters: 2.4 };
    commit({ azimuthDeg: 30, elevationDeg: 12, radiusMeters: 2.4 });
  };

  return (
    <section
      aria-label="3D Spatial Soundstage Pad and BS2B Crossfeed"
      className="flex h-full flex-col rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#2B3342] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]">
            <Compass className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
              3D Spatial Soundstage (7.1.4)
            </h2>
            <p className="text-xs text-[#9AA4B2]">
              Drag virtual handle to rotate Azimuth &amp; Room Radius · Hold Shift for Elevation
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={handleResetStage}
          className="inline-flex items-center gap-1 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-2.5 py-1.5 text-xs font-medium text-[#9AA4B2] transition hover:text-[#F2F4F8]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Center
        </button>
      </div>

      {/* Main Split: Top-Down 7.1.4 SVG Pad + Sliders */}
      <div className="mt-4 grid flex-1 grid-cols-1 gap-5 xl:grid-cols-12 xl:items-center">
        {/* Top-Down Circular 7.1.4 Soundstage SVG */}
        <div className="flex flex-col items-center xl:col-span-6">
          <div className="relative w-full max-w-[310px] rounded-[12px] border border-[#2B3342] bg-[#0B0D10] p-2">
            <svg
              ref={svgRef}
              data-testid="soundstage-svg"
              viewBox={`0 0 ${PAD_SIZE} ${PAD_SIZE}`}
              role="img"
              aria-label="Top-down 7.1.4 virtual speaker soundstage pad"
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={handlePadPointerUp}
              onPointerCancel={handlePadPointerUp}
              className={`block w-full select-none ${
                disabled ? 'cursor-not-allowed' : draggingHandle ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <defs>
                <radialGradient id="stageGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.16" />
                  <stop offset="70%" stopColor="#38BDF8" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#0B0D10" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Ambient stage backdrop */}
              <circle cx={CX} cy={CY} r={MAX_R} fill="url(#stageGlow)" />

              {/* Concentric Distance Rings */}
              {[0.28, 0.52, 0.76, 1].map((ratio, idx) => (
                <circle
                  key={`ring-${idx}`}
                  cx={CX}
                  cy={CY}
                  r={MAX_R * ratio}
                  fill="none"
                  stroke={idx === 3 ? '#3B4659' : '#2B3342'}
                  strokeWidth={idx === 3 ? 1.25 : 0.9}
                  strokeDasharray={idx === 1 ? '3 3' : undefined}
                />
              ))}

              {/* Crosshair Axes */}
              <line
                x1={CX}
                y1={CY - MAX_R}
                x2={CX}
                y2={CY + MAX_R}
                stroke="#2B3342"
                strokeWidth="0.9"
              />
              <line
                x1={CX - MAX_R}
                y1={CY}
                x2={CX + MAX_R}
                y2={CY}
                stroke="#2B3342"
                strokeWidth="0.9"
              />

              {/* Compass Degree Labels */}
              <text
                x={CX}
                y={24}
                textAnchor="middle"
                fill="#9AA4B2"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                0° FRONT
              </text>
              <text
                x={PAD_SIZE - 16}
                y={CY + 3.5}
                textAnchor="middle"
                fill="#9AA4B2"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                90°
              </text>
              <text
                x={CX}
                y={PAD_SIZE - 14}
                textAnchor="middle"
                fill="#9AA4B2"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                180° REAR
              </text>
              <text
                x={18}
                y={CY + 3.5}
                textAnchor="middle"
                fill="#9AA4B2"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                270°
              </text>

              {/* 11 Virtual 7.1.4 Speakers (Bed + Height) */}
              {VIRTUAL_714_SPEAKERS.map((spk) => {
                const pos = projectPolarToStage2D(
                  spk.baseAzimuthDeg,
                  spk.layer === 'height'
                    ? Math.max(15, Math.min(75, spk.baseElevationDeg + draftElevation * 0.35))
                    : Math.max(-25, Math.min(25, draftElevation * 0.25)),
                  draftRadius,
                  CX,
                  CY,
                  MAX_R
                );
                const isHeight = spk.layer === 'height';
                const isSelected = selectedSpeakerId === spk.id;

                return (
                  <g
                    key={spk.id}
                    data-testid={`speaker-node-${spk.id}`}
                    transform={`translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSpeakerId(spk.id);
                    }}
                  >
                    {isHeight ? (
                      <rect
                        x={-11}
                        y={-11}
                        width={22}
                        height={22}
                        rx={5}
                        transform="rotate(45)"
                        fill={isSelected ? '#38BDF8' : '#14181F'}
                        fillOpacity={isSelected ? 0.25 : 0.92}
                        stroke={isSelected ? '#38BDF8' : '#38BDF8'}
                        strokeOpacity={isSelected ? 1 : 0.65}
                        strokeWidth={1.25}
                        strokeDasharray="2 2"
                      />
                    ) : (
                      <circle
                        r={12.5}
                        fill={isSelected ? '#1C222D' : '#14181F'}
                        stroke={isSelected ? '#38BDF8' : '#475569'}
                        strokeWidth={isSelected ? 1.6 : 1.2}
                      />
                    )}
                    <text
                      y="3"
                      textAnchor="middle"
                      fill={isHeight ? '#38BDF8' : '#F2F4F8'}
                      fontSize="8.5"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                      pointerEvents="none"
                    >
                      {spk.label}
                    </text>
                  </g>
                );
              })}

              {/* Vector Ray from Listener Head to Draggable Virtual Focus Handle */}
              <line
                x1={CX}
                y1={CY}
                x2={focusPos.x}
                y2={focusPos.y}
                stroke="#38BDF8"
                strokeWidth="2"
                strokeDasharray="4 3"
              />

              {/* Central Listener Head + Studio Headphones */}
              <g transform={`translate(${CX}, ${CY})`} pointerEvents="none">
                {/* Nose direction indicator */}
                <polygon points="0,-24 -5,-15 5,-15" fill="#38BDF8" />
                {/* Left & Right Headphone Cups */}
                <rect
                  x={-22}
                  y={-9}
                  width={6}
                  height={18}
                  rx={3}
                  fill="#1C222D"
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                />
                <rect
                  x={16}
                  y={-9}
                  width={6}
                  height={18}
                  rx={3}
                  fill="#1C222D"
                  stroke="#38BDF8"
                  strokeWidth="1.2"
                />
                {/* Headband arc */}
                <path
                  d="M-19,0 A19,19 0 0,1 19,0"
                  fill="none"
                  stroke="#9AA4B2"
                  strokeWidth="1.5"
                />
                {/* Listener head circle */}
                <circle r={15} fill="#14181F" stroke="#F2F4F8" strokeOpacity="0.55" strokeWidth="1.4" />
                <circle r={3} fill="#38BDF8" />
              </g>

              {/* Draggable Virtual Source Azimuth/Elevation Handle */}
              <g
                data-testid="soundstage-drag-handle"
                transform={`translate(${focusPos.x.toFixed(2)}, ${focusPos.y.toFixed(2)})`}
              >
                <circle r={16} fill="#38BDF8" fillOpacity="0.18" stroke="#38BDF8" strokeWidth="1" />
                <circle r={7.5} fill="#38BDF8" stroke="#F2F4F8" strokeWidth="2" />
              </g>
            </svg>

            {/* Legend strip below SVG */}
            <div className="mt-1.5 flex items-center justify-between px-1.5 pb-0.5 mono-telemetry text-[10px] text-[#9AA4B2]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full border border-[#475569] bg-[#14181F]" />
                7.1 Bed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rotate-45 border border-dashed border-[#38BDF8] bg-[#14181F]" />
                4 Height (Atmos)
              </span>
              <span data-testid="soundstage-hud" className="font-semibold text-[#38BDF8]">
                {`${String(Math.round(draftAzimuth)).padStart(3, '0')}° · ${draftElevation >= 0 ? `+${draftElevation}` : draftElevation}°`}
              </span>
            </div>
          </div>
        </div>

        {/* Sliders Column */}
        <div className="flex flex-col gap-4 xl:col-span-6">
          {/* Azimuth */}
          <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D]/50 p-3">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="spatial-azimuth-slider" className="font-medium text-[#F2F4F8]">
                Azimuth (0–360°)
              </label>
              <span
                data-testid="spatial-azimuth-value"
                className="mono-telemetry font-semibold text-[#38BDF8]"
              >
                {Math.round(draftAzimuth)}°
              </span>
            </div>
            <input
              id="spatial-azimuth-slider"
              type="range"
              min={0}
              max={360}
              step={1}
              disabled={disabled}
              value={Math.round(draftAzimuth)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDraftAzimuth(val);
                draftRef.current.azimuthDeg = val;
                commit({ azimuthDeg: val });
              }}
              className="studio-slider mt-1.5 h-4 w-full"
            />
          </div>

          {/* Elevation */}
          <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D]/50 p-3">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="spatial-elevation-slider" className="font-medium text-[#F2F4F8]">
                Elevation (-90° to +90°)
              </label>
              <span
                data-testid="spatial-elevation-value"
                className="mono-telemetry font-semibold text-[#38BDF8]"
              >
                {draftElevation > 0 ? `+${draftElevation}°` : `${draftElevation}°`}
              </span>
            </div>
            <input
              id="spatial-elevation-slider"
              type="range"
              min={-90}
              max={90}
              step={1}
              disabled={disabled}
              value={Math.round(draftElevation)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDraftElevation(val);
                draftRef.current.elevationDeg = val;
                commit({ elevationDeg: val });
              }}
              className="studio-slider mt-1.5 h-4 w-full"
            />
          </div>

          {/* Room Radius */}
          <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D]/50 p-3">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="spatial-radius-slider" className="font-medium text-[#F2F4F8]">
                Room Radius (0.5–10.0m)
              </label>
              <span
                data-testid="spatial-radius-value"
                className="mono-telemetry font-semibold text-[#38BDF8]"
              >
                {draftRadius.toFixed(1)} m
              </span>
            </div>
            <input
              id="spatial-radius-slider"
              type="range"
              min={0.5}
              max={10.0}
              step={0.1}
              disabled={disabled}
              value={draftRadius}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDraftRadius(val);
                draftRef.current.radiusMeters = val;
                commit({ radiusMeters: val });
              }}
              className="studio-slider mt-1.5 h-4 w-full"
            />
          </div>
        </div>
      </div>

      {/* Stereo Crossfeed (BS2B) Segmented Selector */}
      <div className="mt-5 border-t border-[#2B3342] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-[#38BDF8]" />
            <span className="text-xs font-semibold text-[#F2F4F8]">
              Stereo Crossfeed (BS2B)
            </span>
          </div>
          <span className="mono-telemetry text-[11px] text-[#9AA4B2]">
            {activeCrossfeedMeta.spec}
          </span>
        </div>

        <div
          role="group"
          aria-label="Stereo Crossfeed BS2B selector"
          className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-1 sm:grid-cols-4"
        >
          {CROSSFEED_OPTIONS.map((opt) => {
            const selected = activeCrossfeed === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => handleCrossfeedSelect(opt.id)}
                className={`rounded-[7px] px-2.5 py-2 text-xs font-medium transition ${
                  selected
                    ? 'bg-[#38BDF8]/18 text-[#38BDF8] ring-1 ring-[#38BDF8]/60'
                    : 'text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

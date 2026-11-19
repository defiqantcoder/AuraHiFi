import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Disc3,
  Headphones,
  Lock,
  Puzzle,
  Radio,
  ShieldCheck,
  Speaker,
  Upload,
  Waves,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import type { SpatialConfig } from '../lib/audioBridge';
import { ParametricEqEditor } from '../components/spatial/ParametricEqEditor';
import { SpatialSoundstagePad } from '../components/spatial/SpatialSoundstagePad';

const BUILT_IN_SOFA_PROFILES = [
  {
    name: 'SADIE D1 Neutral (Default)',
    path: '/usr/share/aurahifi/sofa/sadie_d1_neutral_48k.sofa',
  },
  {
    name: 'KEMAR Diffuse Field',
    path: '/usr/share/aurahifi/sofa/kemar_diffuse_field_48k.sofa',
  },
];

const CUSTOM_IMPORT_SENTINEL = '__IMPORT_CUSTOM_SOFA__';

export const SpatialStudioView: React.FC = () => {
  const signalPath = useAudioStore((s) => s.signalPath);
  const spatialConfig = useAudioStore((s) => s.spatialConfig);
  const devices = useAudioStore((s) => s.devices);
  const addons = useAudioStore((s) => s.addons);
  const setAudioMode = useAudioStore((s) => s.setAudioMode);
  const updateSpatialConfig = useAudioStore((s) => s.updateSpatialConfig);
  const setActiveRoute = useAudioStore((s) => s.setActiveRoute);

  const [showCustomSofaImport, setShowCustomSofaImport] = useState(false);
  const [customSofaNotice, setCustomSofaNotice] = useState<string | null>(null);

  const activeDevice = useMemo(
    () => devices.find((d) => d.alsaId === signalPath?.activeDeviceId) ?? null,
    [devices, signalPath?.activeDeviceId]
  );

  const eac3Addon = useMemo(
    () => addons.find((a) => a.id === 'eac3-joc-bridge') ?? null,
    [addons]
  );

  if (!spatialConfig || !signalPath) return null;

  const isBitPerfect = signalPath.mode === 'bit_perfect';
  const isCustomProfile = !BUILT_IN_SOFA_PROFILES.some(
    (p) => p.name === spatialConfig.sofaProfileName
  );

  const handleUpdateConfig = async (next: SpatialConfig) => {
    await updateSpatialConfig(next);
  };

  const handleAtmosModeChange = (mode: SpatialConfig['atmosMode']) => {
    if (isBitPerfect) return;
    void handleUpdateConfig({ ...spatialConfig, atmosMode: mode });
  };

  const handleSofaProfileSelect = (value: string) => {
    if (isBitPerfect) return;
    if (value === CUSTOM_IMPORT_SENTINEL) {
      setShowCustomSofaImport(true);
      return;
    }
    setShowCustomSofaImport(false);
    setCustomSofaNotice(null);
    const builtIn = BUILT_IN_SOFA_PROFILES.find((p) => p.name === value);
    if (builtIn) {
      void handleUpdateConfig({
        ...spatialConfig,
        sofaProfileName: builtIn.name,
        sofaFilePath: builtIn.path,
      });
    }
  };

  const handleCustomSofaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cleanName = file.name.replace(/\.sofa$/i, '');
    void handleUpdateConfig({
      ...spatialConfig,
      sofaProfileName: `Custom: ${cleanName}`,
      sofaFilePath: `/home/user/.local/share/aurahifi/sofa/${file.name}`,
    });
    setCustomSofaNotice(`Loaded custom SOFA HRIR: ${file.name}`);
    setShowCustomSofaImport(false);
  };

  const handleLoadSampleCustomSofa = () => {
    void handleUpdateConfig({
      ...spatialConfig,
      sofaProfileName: 'Custom: Neumann KU100 Studio',
      sofaFilePath: '/home/user/.local/share/aurahifi/sofa/neumann_ku100_48k.sofa',
    });
    setCustomSofaNotice('Loaded custom SOFA HRIR: neumann_ku100_48k.sofa');
    setShowCustomSofaImport(false);
  };

  const atmosModeCards: {
    id: SpatialConfig['atmosMode'];
    title: string;
    description: string;
    detailChip: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'binaural_sofa',
      title: 'In-Process Binaural HRTF (Headphones)',
      description: 'Decodes 7.1.4 object beds via libmysofa HRIR convolution in 64-bit float.',
      detailChip: 'libmysofa · 7.1.4 → Binaural',
      icon: <Headphones className="h-4 w-4" />,
    },
    {
      id: 'hdmi_iec958_passthrough',
      title: 'HDMI IEC958 Bitstream Passthrough (AVR/Soundbar)',
      description: 'Packages raw MAT/TrueHD frames over ALSA AES0=0x06 IEC958 non-audio stream.',
      detailChip: activeDevice?.iec958Passthrough ? 'HDMI AVR Ready' : 'Requires HDMI AVR',
      icon: <Speaker className="h-4 w-4" />,
    },
    {
      id: 'stereo_downmix',
      title: 'Stereo Downmix',
      description: 'ITU-R BS.775-3 phase-coherent 2.0 fold-down with headroom normalization.',
      detailChip: 'ITU-R BS.775 · 2.0 PCM',
      icon: <Disc3 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 pb-6">
      {/* Studio Top Header + Master Mode Switch */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[#2B3342] bg-[#14181F] px-5 py-4 xl:flex-nowrap">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#F2F4F8]">
              Spatial &amp; DSP Studio
            </h1>
            <span
              className={`mono-telemetry rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold ${
                isBitPerfect
                  ? 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]'
                  : 'border-[#38BDF8]/40 bg-[#38BDF8]/15 text-[#38BDF8]'
              }`}
            >
              {isBitPerfect ? 'DSP BYPASSED · BIT-PERFECT' : '64-BIT FLOAT DSP ENGAGED'}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[#9AA4B2]">
            10-Band PEQ, BS2B Crossfeed, 7.1.4 Soundstage &amp; SOFA HRTF
            {activeDevice ? ` · ${activeDevice.displayName}` : ''}
          </p>
        </div>

        {/* Master Switch: BYPASS ALL (BIT-PERFECT) vs SPATIAL DSP ACTIVE */}
        <div
          role="group"
          aria-label="Master audio processing mode switch"
          className="inline-flex shrink-0 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-1"
        >
          <button
            type="button"
            data-testid="master-switch-bit-perfect"
            aria-pressed={isBitPerfect}
            onClick={() => void setAudioMode('bit_perfect')}
            className={`inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-xs font-semibold transition ${
              isBitPerfect
                ? 'bg-[#10B981]/18 text-[#10B981] ring-1 ring-[#10B981]/60'
                : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            BYPASS ALL (BIT-PERFECT)
          </button>

          <button
            type="button"
            data-testid="master-switch-spatial"
            aria-pressed={!isBitPerfect}
            onClick={() => void setAudioMode('spatial')}
            className={`inline-flex items-center gap-2 rounded-[8px] px-3.5 py-2 text-xs font-semibold transition ${
              !isBitPerfect
                ? 'bg-[#38BDF8]/18 text-[#38BDF8] ring-1 ring-[#38BDF8]/60'
                : 'text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <Waves className="h-3.5 w-3.5" />
            SPATIAL DSP ACTIVE
          </button>
        </div>
      </header>

      {/* Master Mode Bypass Banner (Amber #F59E0B whenever Bit-Perfect Mode is active) */}
      {isBitPerfect && (
        <div
          role="status"
          data-testid="dsp-bypass-banner"
          className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[#F59E0B]/45 bg-[#F59E0B]/10 px-4 py-3.5"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#F59E0B]">
                  Bit-Perfect Mode Active — All DSP Modules Below Are Bypassed
                </span>
                <span className="inline-flex items-center gap-1 rounded-[6px] border border-[#F59E0B]/40 bg-[#0B0D10]/70 px-2 py-0.5 mono-telemetry text-[10.5px] font-medium text-[#F59E0B]">
                  <Lock className="h-3 w-3" />
                  Controls Locked
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[#F2F4F8]/90">
                Parametric EQ, BS2B Crossfeed, 3D Soundstage, and SOFA HRTF convolution are locked and
                hard-bypassed to preserve bit-exact ALSA delivery ({signalPath.outputFormat}). Switch
                to Spatial DSP Active to unlock interactive studio processing.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void setAudioMode('spatial')}
            className="inline-flex shrink-0 items-center gap-2 rounded-[8px] border border-[#38BDF8]/50 bg-[#38BDF8]/15 px-3.5 py-2 text-xs font-semibold text-[#38BDF8] transition hover:bg-[#38BDF8]/25"
          >
            <Waves className="h-3.5 w-3.5" />
            Enable Spatial DSP
          </button>
        </div>
      )}

      {/* Interactive DSP Workspace — Dimmed & Locked while Bit-Perfect is active */}
      <div
        data-testid="dsp-controls-container"
        aria-disabled={isBitPerfect}
        className={`relative flex flex-col gap-5 transition-opacity duration-200 ${
          isBitPerfect ? 'pointer-events-none select-none opacity-45' : 'opacity-100'
        }`}
      >

        {/* Row 1: Interactive 10-Band Parametric EQ Curve Editor */}
        <ParametricEqEditor
          config={spatialConfig}
          disabled={isBitPerfect}
          onUpdateConfig={handleUpdateConfig}
        />

        {/* Row 2: 3D Spatial Soundstage + Crossfeed (7 cols) | Dolby Atmos & SOFA HRTF Panel (5 cols) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SpatialSoundstagePad
              config={spatialConfig}
              disabled={isBitPerfect}
              onUpdateConfig={handleUpdateConfig}
            />
          </div>

          {/* Dolby Atmos & SOFA HRTF Panel */}
          <section
            aria-label="Dolby Atmos and SOFA HRTF Engine"
            className="flex flex-col justify-between rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 lg:col-span-5"
          >
            <div>
              {/* Panel Header */}
              <div className="flex items-center gap-2.5 border-b border-[#2B3342] pb-3.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]">
                  <Radio className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                    Dolby Atmos &amp; SOFA HRTF
                  </h2>
                  <p className="text-xs text-[#9AA4B2]">
                    Multichannel object rendering &amp; HRIR convolution profile
                  </p>
                </div>
              </div>

              {/* Honest Codec Support Badges */}
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-[9px] border border-[#10B981]/30 bg-[#10B981]/8 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
                    <span className="text-xs font-medium text-[#F2F4F8]">
                      TrueHD Atmos (Apache-2.0 Core Engine)
                    </span>
                  </div>
                  <span className="mono-telemetry rounded-[5px] bg-[#10B981]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#10B981]">
                    BUILT-IN
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-[9px] border border-[#2B3342] bg-[#1C222D]/70 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Puzzle className="h-4 w-4 shrink-0 text-[#38BDF8]" />
                    <span className="text-xs font-medium text-[#F2F4F8]">
                      E-AC-3 JOC (Via Community Add-On)
                    </span>
                  </div>
                  {eac3Addon?.installed ? (
                    <span className="mono-telemetry rounded-[5px] bg-[#38BDF8]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#38BDF8]">
                      WASM ACTIVE
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBitPerfect}
                      onClick={() => setActiveRoute('addons')}
                      className="mono-telemetry rounded-[5px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2 py-0.5 text-[10px] font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20"
                    >
                      Get Add-On
                    </button>
                  )}
                </div>
              </div>

              {/* Mode Radio Cards */}
              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-[#F2F4F8]">
                  Spatial Output Routing Mode
                </legend>
                <div className="mt-2.5 flex flex-col gap-2">
                  {atmosModeCards.map((card) => {
                    const checked = spatialConfig.atmosMode === card.id;
                    const inputId = `atmos-mode-${card.id}`;
                    return (
                      <label
                        key={card.id}
                        htmlFor={inputId}
                        className={`flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition ${
                          checked
                            ? 'border-[#38BDF8] bg-[#38BDF8]/12'
                            : 'border-[#2B3342] bg-[#1C222D]/60 hover:border-[#38BDF8]/40'
                        }`}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name="atmos-rendering-mode"
                          value={card.id}
                          checked={checked}
                          disabled={isBitPerfect}
                          onChange={() => handleAtmosModeChange(card.id)}
                          className="mt-1 h-3.5 w-3.5 accent-[#38BDF8]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F2F4F8]">
                              <span className={checked ? 'text-[#38BDF8]' : 'text-[#9AA4B2]'}>
                                {card.icon}
                              </span>
                              {card.title}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-[#9AA4B2]">
                            {card.description}
                          </p>
                          <div className="mt-1.5 mono-telemetry text-[10px] text-[#38BDF8]">
                            {card.detailChip}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* SOFA HRTF Profile Selector */}
              <div className="mt-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10]/70 p-3.5">
                <label
                  htmlFor="sofa-profile-select"
                  className="block text-xs font-semibold text-[#F2F4F8]"
                >
                  SOFA HRTF Profile (AES69-2015)
                </label>
                <select
                  id="sofa-profile-select"
                  disabled={isBitPerfect}
                  value={showCustomSofaImport ? CUSTOM_IMPORT_SENTINEL : spatialConfig.sofaProfileName}
                  onChange={(e) => handleSofaProfileSelect(e.target.value)}
                  className="mt-2 w-full rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                >
                  {BUILT_IN_SOFA_PROFILES.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                  {isCustomProfile && (
                    <option value={spatialConfig.sofaProfileName}>
                      {spatialConfig.sofaProfileName}
                    </option>
                  )}
                  <option value={CUSTOM_IMPORT_SENTINEL}>+ Import Custom .sofa File</option>
                </select>

                <div className="mt-2 truncate mono-telemetry text-[10.5px] text-[#9AA4B2]">
                  Path: {spatialConfig.sofaFilePath}
                </div>

                {showCustomSofaImport && (
                  <div className="mt-3 rounded-[8px] border border-[#38BDF8]/35 bg-[#14181F] p-3">
                    <label
                      htmlFor="custom-sofa-file-input"
                      className="block text-xs font-medium text-[#F2F4F8]"
                    >
                      Select Custom .sofa HRIR File
                    </label>
                    <input
                      id="custom-sofa-file-input"
                      type="file"
                      accept=".sofa"
                      disabled={isBitPerfect}
                      onChange={handleCustomSofaFileChange}
                      className="mt-1.5 block w-full text-xs text-[#9AA4B2] file:mr-2 file:rounded-[6px] file:border file:border-[#2B3342] file:bg-[#1C222D] file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-[#F2F4F8]"
                    />
                    <button
                      type="button"
                      disabled={isBitPerfect}
                      onClick={handleLoadSampleCustomSofa}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-[7px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#38BDF8] hover:bg-[#38BDF8]/20"
                    >
                      <Upload className="h-3 w-3" />
                      Load Studio Sample (Neumann KU100)
                    </button>
                  </div>
                )}

                {customSofaNotice && (
                  <p className="mt-2 mono-telemetry text-[11px] text-[#10B981]">
                    {customSofaNotice}
                  </p>
                )}
              </div>
            </div>

            {/* Bottom Normalization / DSP Telemetry Footer */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#2B3342] pt-3.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="spatial-replaygain-select"
                  className="text-xs font-medium text-[#9AA4B2]"
                >
                  ReplayGain:
                </label>
                <select
                  id="spatial-replaygain-select"
                  disabled={isBitPerfect}
                  value={spatialConfig.replayGainMode}
                  onChange={(e) =>
                    void handleUpdateConfig({
                      ...spatialConfig,
                      replayGainMode: e.target.value as SpatialConfig['replayGainMode'],
                    })
                  }
                  className="rounded-[7px] border border-[#2B3342] bg-[#1C222D] px-2.5 py-1 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                >
                  <option value="off">Off</option>
                  <option value="album">Album (-14 LUFS)</option>
                  <option value="track">Track (-14 LUFS)</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 mono-telemetry text-[11px] text-[#9AA4B2]">
                <Cpu className="h-3.5 w-3.5 text-[#38BDF8]" />
                <span>DSP Load: 1.8% · 0 Xruns</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

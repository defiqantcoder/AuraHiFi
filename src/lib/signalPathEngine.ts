/**
 * Pure Linux Audio Signal Path Negotiation & Telemetry Formatting Engine.
 * Decoupled from UI and timers so all Ubuntu 24.04/26.04 ALSA/PipeWire invariants
 * can be verified deterministically with node:test.
 */

import type {
  AudioDeviceInfo,
  AudioMode,
  SignalPathError,
  SignalPathStage,
  SignalPathState,
  SpatialConfig,
  TrackSummary,
} from './audioBridge';

export interface SignalPathEvaluationInput {
  mode: AudioMode;
  device: AudioDeviceInfo | null;
  track: TrackSummary | null;
  spatialConfig: SpatialConfig;
  exclusiveAlsa: boolean;
  bypassLaptopSpeakers: boolean;
  activeError: SignalPathError | null;
  isTransitioning?: boolean;
  transitionProgress?: number;
  rateLockState?: {
    locked: boolean;
    fromRateHz?: number;
    toRateHz?: number;
  };
}

export function formatSampleRate(hz: number, isDsd = false, dsdMultiplier?: number): string {
  if (isDsd) {
    if (dsdMultiplier) return `DSD${dsdMultiplier}`;
    if (hz >= 11289600) return 'DSD256';
    if (hz >= 5644800) return 'DSD128';
    return 'DSD64';
  }
  const khz = hz / 1000;
  return `${khz.toFixed(1)} kHz`;
}

export function formatTimecode(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db) || db <= -96) return '-∞ dB';
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

/**
 * Determines whether switching between two tracks requires a hardware ALSA
 * sample-rate clock renegotiation (brief mute + hw_params lock).
 */
export function requiresSampleRateSwitchLock(
  prevTrack: TrackSummary | null,
  nextTrack: TrackSummary | null
): { required: boolean; fromRateHz?: number; toRateHz?: number } {
  if (!prevTrack || !nextTrack) return { required: false };
  if (
    prevTrack.sampleRateHz !== nextTrack.sampleRateHz ||
    prevTrack.isDsd !== nextTrack.isDsd ||
    prevTrack.isAtmos !== nextTrack.isAtmos
  ) {
    return {
      required: true,
      fromRateHz: prevTrack.sampleRateHz,
      toRateHz: nextTrack.sampleRateHz,
    };
  }
  return { required: false };
}

/**
 * Computes whether software volume MUST be honestly locked at 0.0 dB.
 * Rule (DESIGN.md & Linux ALSA Exclusive):
 * - Bit-Perfect mode ALWAYS locks software volume to 0.0 dB.
 * - Any active native DSD or DoP stream ALWAYS locks software volume to 0.0 dB.
 * - HDMI IEC958 Atmos bitstream passthrough locks software volume to 0.0 dB.
 * - Spatial DSP mode (SOFA HRTF / BS2B / PEQ) unlocks software volume.
 */
export function computeVolumeLock(
  mode: AudioMode,
  track: TrackSummary | null,
  device: AudioDeviceInfo | null,
  spatialConfig: SpatialConfig
): { locked: boolean; reason: string } {
  if (mode === 'bit_perfect') {
    if (track?.isDsd && device && (device.dsdCapability === 'native' || device.dsdCapability === 'dop')) {
      return {
        locked: true,
        reason: 'Hardware-fixed 0.0 dB — DSD/DoP transport prohibits software attenuation.',
      };
    }
    return {
      locked: true,
      reason: 'Bit-Perfect ALSA Exclusive active — software mixer bypassed at 0.0 dB.',
    };
  }

  if (
    track?.isAtmos &&
    device?.iec958Passthrough &&
    spatialConfig.atmosMode === 'hdmi_iec958_passthrough'
  ) {
    return {
      locked: true,
      reason: 'HDMI IEC958 Bitstream Passthrough — receiver controls gain.',
    };
  }

  return {
    locked: false,
    reason: 'Spatial 64-bit float DSP chain active — precision software volume unlocked.',
  };
}

/**
 * Evaluates the complete multi-stage Linux audio signal path with zero hidden downgrades.
 */
export function evaluateSignalPath(input: SignalPathEvaluationInput): SignalPathState {
  const {
    mode,
    device,
    track,
    spatialConfig,
    exclusiveAlsa,
    bypassLaptopSpeakers,
    activeError,
    isTransitioning = false,
    transitionProgress = 0,
    rateLockState = { locked: false },
  } = input;

  const warnings: string[] = [];
  const stages: SignalPathStage[] = [];

  const volumeLock = computeVolumeLock(mode, track, device, spatialConfig);

  // Stage 1: Source File / Container
  const sourceFormatText = track
    ? track.isDsd
      ? `${track.codec} · ${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)} · 1-bit`
      : track.isAtmos
      ? `${track.codec} · ${track.channelLayout} · ${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit`
      : `${track.codec} · ${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit${track.cueIndex ? ` · CUE #${track.cueIndex}` : ''}`
    : 'No Track Loaded';

  stages.push({
    id: 'source',
    order: 1,
    name: 'Source Container',
    kind: 'source',
    detail: track ? `${track.album}${track.cueIndex ? ' (CUE Split)' : ''}` : 'Idle transport',
    status: track ? 'lossless' : 'bypassed',
    telemetryText: sourceFormatText,
  });

  // Error Halted Path (ALSA EBUSY or USB Hot-Unplug)
  if (activeError && (activeError.code === 'ALSA_EBUSY' || activeError.code === 'DAC_HOT_UNPLUGGED')) {
    stages.push({
      id: 'decoder',
      order: 2,
      name: track?.isDsd ? 'dsd-reader Decoder' : track?.isAtmos ? 'truehd Atmos Decoder' : 'Symphonia SIMD Decoder',
      kind: 'decoder',
      detail: 'Ring buffer paused cleanly (0 xruns)',
      status: 'bypassed',
      telemetryText: 'PAUSED',
    });

    stages.push({
      id: 'output',
      order: 3,
      name: activeError.code === 'DAC_HOT_UNPLUGGED' ? 'USB DAC Disconnected' : 'ALSA Device Busy (EBUSY)',
      kind: 'output',
      detail:
        activeError.code === 'DAC_HOT_UNPLUGGED'
          ? 'Safe pause engaged — Intel HDA internal speakers isolated (zero fallback)'
          : `Held by ${activeError.holdingProcessName ?? 'external process'} (PID ${activeError.holdingPid ?? '?'})`,
      status: 'error',
      telemetryText: device?.alsaId ?? 'NO DEVICE',
    });

    return {
      mode,
      integrity: 'error_halted',
      summaryLabel:
        activeError.code === 'DAC_HOT_UNPLUGGED'
          ? 'HALTED · USB DAC Disconnected (Safe Pause)'
          : `HALTED · ALSA EBUSY (${device?.shortId ?? 'DAC'})`,
      pillShortLabel:
        activeError.code === 'DAC_HOT_UNPLUGGED'
          ? `DISCONNECTED · ${device?.shortId ?? 'DAC'}`
          : `ALSA EBUSY · ${device?.shortId ?? 'DAC'}`,
      isVolumeLocked: true,
      volumeLockReason: 'Transport halted due to hardware state error.',
      lockedVolumeDb: 0.0,
      activeDeviceId: device?.alsaId ?? null,
      inputFormat: sourceFormatText,
      outputFormat: 'HALTED',
      stages,
      warnings,
      error: activeError,
      isTransitioning,
      transitionProgress,
      sampleRateSwitchLock: rateLockState,
      pipewireBypassed: exclusiveAlsa,
      laptopSpeakersIsolated: bypassLaptopSpeakers,
    };
  }

  // Missing device guard
  if (!device) {
    return {
      mode,
      integrity: 'error_halted',
      summaryLabel: 'No Active DAC Endpoint',
      pillShortLabel: 'NO DAC',
      isVolumeLocked: true,
      volumeLockReason: 'Select a valid hardware DAC endpoint.',
      lockedVolumeDb: 0.0,
      activeDeviceId: null,
      inputFormat: sourceFormatText,
      outputFormat: 'NONE',
      stages,
      warnings: ['No output device selected.'],
      error: activeError,
      isTransitioning,
      transitionProgress,
      sampleRateSwitchLock: rateLockState,
      pipewireBypassed: false,
      laptopSpeakersIsolated: bypassLaptopSpeakers,
    };
  }

  // Stage 2: Decoder
  const decoderName = track?.isDsd
    ? 'dsd-reader 0.4.0'
    : track?.isAtmos
    ? 'truehd 0.7.2 Matrix'
    : 'symphonia 0.6.1 SIMD';

  stages.push({
    id: 'decoder',
    order: 2,
    name: decoderName,
    kind: 'decoder',
    detail: track?.isAtmos
      ? 'Object bed + spatial metadata extraction (7.1.4)'
      : track?.isDsd
      ? '1-bit SDM bitstream frame unpacker'
      : 'Gapless lock-free ring buffer decode',
    status: mode === 'spatial' ? 'spatial' : 'lossless',
    telemetryText: track
      ? track.isDsd
        ? `${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)} SDM`
        : `${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit`
      : 'READY',
  });

  // Negotiate output rate & check honest fallbacks
  let integrity: SignalPathState['integrity'] = mode === 'bit_perfect' ? 'bit_perfect' : 'spatial_dsp';
  let outputFormat = track
    ? `${formatSampleRate(track.sampleRateHz, track.isDsd, track.dsdRateMultiplier)} / ${track.isDsd ? '1-bit' : `${track.bitDepth}-bit`}`
    : '44.1 kHz / 24-bit';

  if (mode === 'bit_perfect') {
    // Check DSD capability negotiation on selected DAC
    if (track?.isDsd) {
      if (device.dsdCapability === 'native') {
        stages.push({
          id: 'dsp_bypass',
          order: 3,
          name: 'DSP & Mixer Bypass',
          kind: 'dsp',
          detail: 'All spatial, PEQ, ReplayGain, and software gain stages bypassed',
          status: 'lossless',
          telemetryText: '0.0 dB · NATIVE DSD',
        });
        outputFormat = `${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)} Native`;
      } else if (device.dsdCapability === 'dop') {
        warnings.push(
          `${device.displayName} lacks UAC2 Native DSD descriptor; encapsulating via DoP (DSD-over-PCM 24-bit) with bit-exact integrity.`
        );
        stages.push({
          id: 'dop_encap',
          order: 3,
          name: 'DoP v1.1 Encapsulation',
          kind: 'dsp',
          detail: 'Bit-exact 0x05/0xFA marker packing (zero PCM conversion)',
          status: 'lossless',
          telemetryText: 'DoP · 0.0 dB',
        });
        outputFormat = `${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)} DoP`;
      } else {
        // Explicit Amber Warning — never hide a DSD -> PCM downgrade!
        integrity = 'warning_fallback';
        const fallbackRate = device.supportedSampleRates.includes(176400)
          ? 176400
          : Math.max(...device.supportedSampleRates);
        warnings.push(
          `UAC2 Native DSD rejected by ${device.displayName} — transparently decimating ${formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)} to ${formatSampleRate(fallbackRate)} / 24-bit PCM via Rubato.`
        );
        stages.push({
          id: 'dsd_pcm_fallback',
          order: 3,
          name: 'DSD → PCM Decimator (Fallback)',
          kind: 'resampler',
          detail: 'DAC lacks native DSD/DoP; 64-bit FIR decimation active',
          status: 'warning',
          telemetryText: `PCM ${formatSampleRate(fallbackRate)} / 24-bit`,
        });
        outputFormat = `PCM ${formatSampleRate(fallbackRate)} / 24-bit (DSD Fallback)`;
      }
    } else if (track?.isAtmos && !device.iec958Passthrough) {
      integrity = 'warning_fallback';
      warnings.push(
        `${device.displayName} does not support HDMI IEC958 Atmos bitstream passthrough. Playing lossless stereo core (${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit). Switch to Spatial Mode for SOFA HRTF 7.1.4 rendering.`
      );
      stages.push({
        id: 'atmos_core_fallback',
        order: 3,
        name: 'TrueHD Stereo Core Fold',
        kind: 'dsp',
        detail: 'HDMI IEC958 unavailable on USB DAC — lossless 2.0 core output',
        status: 'warning',
        telemetryText: `2.0 Core · ${formatSampleRate(track.sampleRateHz)}`,
      });
      outputFormat = `2.0 Core · ${formatSampleRate(track.sampleRateHz)} / ${track.bitDepth}-bit`;
    } else {
      // Check sample rate compatibility on DAC
      const targetRate = track?.sampleRateHz ?? 44100;
      const rateSupported = device.supportedSampleRates.includes(targetRate);
      if (!rateSupported) {
        integrity = 'warning_fallback';
        const fallbackRate = device.supportedSampleRates.reduce((prev, curr) =>
          Math.abs(curr - targetRate) < Math.abs(prev - targetRate) ? curr : prev
        );
        warnings.push(
          `${device.displayName} does not advertise ${formatSampleRate(targetRate)} in /proc/asound stream0; Rubato HQ resampling to ${formatSampleRate(fallbackRate)}.`
        );
        stages.push({
          id: 'rubato_fallback',
          order: 3,
          name: 'Rubato Sinc Resampler',
          kind: 'resampler',
          detail: 'Rate mismatch fallback — original clock unsupported by hardware',
          status: 'warning',
          telemetryText: `${formatSampleRate(targetRate)} → ${formatSampleRate(fallbackRate)}`,
        });
        outputFormat = `${formatSampleRate(fallbackRate)} / ${track?.bitDepth ?? 24}-bit`;
      } else {
        stages.push({
          id: 'dsp_bypass',
          order: 3,
          name: 'DSP & Mixer Bypass',
          kind: 'dsp',
          detail: 'Bit-exact pass-through · PipeWire & PulseAudio bypassed',
          status: 'lossless',
          telemetryText: '0.0 dB · BYPASSED',
        });
      }
    }

    if (device.isIsolatedInternal) {
      integrity = 'warning_fallback';
      warnings.push(
        'Built-in Intel HDA Speakers selected manually; PipeWire shared graph active (not hardware Bit-Perfect).'
      );
    }
  } else {
    // Spatial & DSP Mode (Cyan)
    const activeDspLabels: string[] = [];

    if (track?.isAtmos && device.iec958Passthrough && spatialConfig.atmosMode === 'hdmi_iec958_passthrough') {
      activeDspLabels.push('HDMI IEC958 Bitstream');
      stages.push({
        id: 'hdmi_bitstream',
        order: 3,
        name: 'HDMI IEC958 Atmos Passthrough',
        kind: 'dsp',
        detail: 'Encoded TrueHD Atmos 7.1.4 bitstream routed directly to AVR',
        status: 'spatial',
        telemetryText: 'ATMOS 7.1.4 BITSTREAM',
      });
      outputFormat = 'TrueHD Atmos 7.1.4 · IEC958';
    } else {
      const hrtfLabel = `SOFA HRTF (${spatialConfig.sofaProfileName})`;
      activeDspLabels.push(hrtfLabel);
      stages.push({
        id: 'sofa_hrtf',
        order: 3,
        name: 'Steam Audio SOFA HRTF',
        kind: 'dsp',
        detail: `Az ${spatialConfig.azimuthDeg}° · El ${spatialConfig.elevationDeg}° · R ${spatialConfig.radiusMeters.toFixed(1)}m`,
        status: 'spatial',
        telemetryText: track?.isAtmos ? '7.1.4 → Binaural' : '2.0 → Binaural',
      });

      if (spatialConfig.bs2bEnabled || spatialConfig.peqEnabled) {
        const subDetails: string[] = [];
        if (spatialConfig.bs2bEnabled) subDetails.push(`BS2B ${spatialConfig.bs2bPreset.toUpperCase()}`);
        if (spatialConfig.peqEnabled) {
          const activeBands = spatialConfig.peqBands.filter((b) => b.enabled).length;
          subDetails.push(`AutoEQ ${spatialConfig.autoEqProfileName} (${activeBands}b)`);
        }
        stages.push({
          id: 'headphone_dsp',
          order: 4,
          name: 'Headphone DSP Chain (64-bit float)',
          kind: 'dsp',
          detail: subDetails.join(' · '),
          status: 'spatial',
          telemetryText: spatialConfig.truePeakLimiterEnabled ? '-1.0 dBTP Limiter' : 'No Limiter',
        });
      }

      if (spatialConfig.replayGainMode !== 'off') {
        warnings.push(`ReplayGain (${spatialConfig.replayGainMode}) active (-3.4 dB normalization).`);
      }

      const dspRate = track?.isDsd ? 176400 : Math.min(track?.sampleRateHz ?? 96000, Math.max(...device.supportedSampleRates));
      outputFormat = `Spatial 32-bit float → ${formatSampleRate(dspRate)}`;
    }
  }

  // Final Stage: ALSA / Hardware DAC Output
  const alsaModeLabel =
    exclusiveAlsa && !device.isIsolatedInternal
      ? 'ALSA Exclusive (D-Bus ReserveDevice1)'
      : 'PipeWire Shared Sink';

  stages.push({
    id: 'hardware_output',
    order: stages.length + 1,
    name: device.displayName,
    kind: 'output',
    detail: `${alsaModeLabel} · ${device.alsaId}`,
    status:
      integrity === 'bit_perfect'
        ? 'lossless'
        : integrity === 'spatial_dsp'
        ? 'spatial'
        : 'warning',
    telemetryText: device.stream0Path ? `RTKit · ${outputFormat}` : outputFormat,
  });

  const rateText = track
    ? track.isDsd
      ? formatSampleRate(track.sampleRateHz, true, track.dsdRateMultiplier)
      : `${track.bitDepth}-bit / ${formatSampleRate(track.sampleRateHz)}`
    : 'Idle';

  const summaryLabel =
    integrity === 'bit_perfect'
      ? `Bit-Perfect · ALSA Exclusive · ${rateText} · 0.0 dB`
      : integrity === 'spatial_dsp'
      ? `Spatial DSP · ${track?.isAtmos ? 'TrueHD Atmos 7.1.4' : 'Stereo'} → ${
          device.iec958Passthrough && spatialConfig.atmosMode === 'hdmi_iec958_passthrough'
            ? 'HDMI IEC958'
            : 'SOFA HRTF'
        }`
      : `DSP Fallback · ${outputFormat}`;

  const pillShortLabel =
    integrity === 'bit_perfect'
      ? `${rateText} · ${device.shortId}`
      : integrity === 'spatial_dsp'
      ? `SPATIAL · ${device.shortId}`
      : `FALLBACK · ${device.shortId}`;

  return {
    mode,
    integrity,
    summaryLabel,
    pillShortLabel,
    isVolumeLocked: volumeLock.locked,
    volumeLockReason: volumeLock.reason,
    lockedVolumeDb: 0.0,
    activeDeviceId: device.alsaId,
    inputFormat: sourceFormatText,
    outputFormat,
    stages,
    warnings,
    error: activeError,
    isTransitioning,
    transitionProgress,
    sampleRateSwitchLock: rateLockState,
    pipewireBypassed: exclusiveAlsa && !device.isIsolatedInternal,
    laptopSpeakersIsolated: bypassLaptopSpeakers,
  };
}

import { useState } from 'react';
import {
  Activity,
  Check,
  Cpu,
  HardDrive,
  Laptop,
  PlugZap,
  Radio,
  ShieldAlert,
  Tv,
  Unplug,
  Wrench,
  X,
} from 'lucide-react';
import { useAudioStore } from '../../store/useAudioStore';
import { formatSampleRate } from '../../lib/signalPathEngine';
import type { AudioDeviceInfo, DsdCapability } from '../../lib/audioBridge';

interface DacSwitcherDrawerProps {
  onClose: () => void;
}

export function DacSwitcherDrawer({ onClose }: DacSwitcherDrawerProps) {
  const devices = useAudioStore((s) => s.devices);
  const signalPath = useAudioStore((s) => s.signalPath);
  const selectAudioDevice = useAudioStore((s) => s.selectAudioDevice);
  const setDeviceDsdMode = useAudioStore((s) => s.setDeviceDsdMode);
  const probeDac = useAudioStore((s) => s.probeDac);
  const dacProbes = useAudioStore((s) => s.dacProbes);

  const autoSwitchExternalDacPolicy = useAudioStore((s) => s.autoSwitchExternalDacPolicy);
  const bypassLaptopSpeakersPolicy = useAudioStore((s) => s.bypassLaptopSpeakersPolicy);
  const safePauseOnDisconnectPolicy = useAudioStore((s) => s.safePauseOnDisconnectPolicy);
  const setAutoSwitchExternalDacPolicy = useAudioStore((s) => s.setAutoSwitchExternalDacPolicy);
  const setBypassLaptopSpeakersPolicy = useAudioStore((s) => s.setBypassLaptopSpeakersPolicy);
  const setSafePauseOnDisconnectPolicy = useAudioStore((s) => s.setSafePauseOnDisconnectPolicy);

  const triggerUsbPlugIn = useAudioStore((s) => s.triggerUsbPlugIn);
  const triggerUsbHotUnplug = useAudioStore((s) => s.triggerUsbHotUnplug);
  const triggerUsbReconnect = useAudioStore((s) => s.triggerUsbReconnect);
  const triggerAlsaEbusy = useAudioStore((s) => s.triggerAlsaEbusy);
  const claimDbusReservation = useAudioStore((s) => s.claimDbusReservation);

  const [probingId, setProbingId] = useState<string | null>(null);

  const usbDacs = devices.filter((d) => d.transportType === 'usb');
  const hdmiDevices = devices.filter((d) => d.transportType === 'hdmi');
  const internalDevices = devices.filter((d) => d.transportType === 'internal');

  const renderDeviceCard = (dev: AudioDeviceInfo, variant: 'usb' | 'hdmi' | 'internal') => {
    const isSelected = signalPath?.activeDeviceId === dev.alsaId;
    const probe = dacProbes[dev.alsaId];
    const isDisconnected = dev.reservationStatus === 'disconnected';
    const isBusy = dev.reservationStatus === 'busy_other_app';

    const borderClass =
      variant === 'internal'
        ? isSelected
          ? 'border-dashed border-[#F59E0B] bg-[#1C222D]'
          : 'border-dashed border-[#2B3342] bg-[#14181F]'
        : isSelected
        ? isDisconnected || isBusy
          ? 'border-[#EF4444] bg-[#1C222D]'
          : 'border-[#10B981] bg-[#1C222D]'
        : 'border-[#2B3342] bg-[#1C222D]';

    const minRate = dev.supportedSampleRates[0];
    const maxRate = dev.supportedSampleRates[dev.supportedSampleRates.length - 1];
    const rateChipLabel = `${(minRate / 1000).toFixed(1).replace(/\.0$/, '')}k–${(maxRate / 1000)
      .toFixed(1)
      .replace(/\.0$/, '')}k`;

    return (
      <div
        key={dev.alsaId}
        className={`rounded-[10px] border p-3.5 transition-colors duration-150 ${borderClass}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold text-[#F2F4F8]">
              {dev.displayName}
            </div>
            <div className="mt-0.5 truncate mono-telemetry text-[11px] text-[#9AA4B2]">
              {dev.alsaId}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-[6px] px-2 py-0.5 mono-telemetry text-[10px] font-semibold uppercase ${
              isDisconnected || isBusy
                ? 'bg-[#EF4444] text-[#1F0505]'
                : isSelected
                ? 'bg-[#10B981] text-[#06130E]'
                : variant === 'internal'
                ? 'bg-[#F59E0B] text-[#1A1002]'
                : 'border border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2]'
            }`}
          >
            {isDisconnected
              ? 'UNPLUGGED'
              : isBusy
              ? 'EBUSY'
              : isSelected
              ? 'ACTIVE'
              : variant === 'internal'
              ? 'ISOLATED'
              : 'READY'}
          </span>
        </div>

        <div className="mt-1.5 text-[11px] text-[#9AA4B2]">
          {dev.vendor} · <span className="text-[#F2F4F8]">{dev.dacChipset}</span>
        </div>

        {/* Monospace capability chips */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2 py-0.5 mono-telemetry text-[10px] text-[#F2F4F8]">
            {rateChipLabel}
          </span>
          <span className="rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2 py-0.5 mono-telemetry text-[10px] text-[#9AA4B2]">
            {dev.supportedBitDepths.includes(32) ? 'S32_LE' : 'S24_3LE'}
          </span>
          {variant === 'usb' && (
            <span
              className={`rounded-[6px] border px-2 py-0.5 mono-telemetry text-[10px] ${
                dev.dsdCapability === 'native'
                  ? 'border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]'
                  : dev.dsdCapability === 'dop'
                  ? 'border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]'
                  : 'border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2]'
              }`}
            >
              {dev.dsdCapability === 'native'
                ? `Native DSD${dev.maxDsdMultiplier ?? 256}`
                : dev.dsdCapability === 'dop'
                ? 'DoP v1.1'
                : 'PCM Multibit'}
            </span>
          )}
          {variant === 'hdmi' && (
            <span className="rounded-[6px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-2 py-0.5 mono-telemetry text-[10px] text-[#38BDF8]">
              IEC958 Atmos 7.1.4
            </span>
          )}
        </div>

        {/* DSD Native / DoP / PCM Transport Selector for External USB DACs */}
        {variant === 'usb' && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#2B3342] pt-2.5">
            <label
              htmlFor={`dsd-mode-${dev.cardIndex}`}
              className="text-[11px] font-medium text-[#9AA4B2]"
            >
              DSD Transport
            </label>
            <select
              id={`dsd-mode-${dev.cardIndex}`}
              value={dev.dsdCapability}
              onChange={(e) => void setDeviceDsdMode(dev.alsaId, e.target.value as DsdCapability)}
              className="rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2 py-1 mono-telemetry text-[11px] text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
            >
              <option value="native">Native DSD (UAC2)</option>
              <option value="dop">DoP (DSD-over-PCM)</option>
              <option value="pcm_fallback">PCM Decimation</option>
            </select>
          </div>
        )}

        {variant === 'internal' && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#F59E0B]">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {bypassLaptopSpeakersPolicy
                ? 'Isolated from automatic hot-unplug fallback.'
                : 'Bypass policy disabled — laptop fallback permitted.'}
            </span>
          </div>
        )}

        {/* Primary Hardware Action Row */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={isSelected && !isBusy && !isDisconnected}
            onClick={() => {
              if (isDisconnected) {
                void triggerUsbReconnect();
              } else if (isBusy) {
                void claimDbusReservation();
              } else {
                void selectAudioDevice(dev.alsaId, variant !== 'internal');
              }
            }}
            className={`flex-1 rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#38BDF8] ${
              isSelected && !isBusy && !isDisconnected
                ? 'cursor-default border border-[#10B981]/40 bg-[#0B0D10] text-[#10B981]'
                : isDisconnected || isBusy
                ? 'bg-[#F59E0B] text-[#1A1002] hover:bg-[#FBBF24]'
                : variant === 'internal'
                ? 'border border-[#2B3342] bg-[#0B0D10] text-[#F2F4F8] hover:border-[#F59E0B]'
                : 'bg-[#10B981] text-[#06130E] hover:bg-[#34D399]'
            }`}
          >
            {isSelected && !isBusy && !isDisconnected ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Claimed Exclusively
              </span>
            ) : isDisconnected ? (
              'Reconnect USB DAC'
            ) : isBusy ? (
              'Claim via ReserveDevice1'
            ) : variant === 'internal' ? (
              'Manual Override'
            ) : (
              'Claim Exclusively'
            )}
          </button>

          <button
            type="button"
            onClick={async () => {
              setProbingId(dev.alsaId);
              await probeDac(dev.alsaId);
              setProbingId(null);
            }}
            className="inline-flex items-center gap-1 rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-2.5 py-1.5 text-xs font-medium text-[#F2F4F8] hover:border-[#38BDF8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
          >
            <Activity className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
            {probingId === dev.alsaId ? 'Probing...' : 'Test DAC Rates'}
          </button>
        </div>

        {/* Live /proc/asound stream0 Probe Result */}
        {probe && (
          <div className="mt-2.5 rounded-[8px] border border-[#2B3342] bg-[#0B0D10] p-2.5 text-[11px]">
            <div className="mono-telemetry text-[#10B981]">{probe.procAsoundStream0}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 mono-telemetry text-[#9AA4B2]">
              <span>Latency {probe.latencyFloorMs.toFixed(1)} ms</span>
              <span>·</span>
              <span>
                Verified: {probe.verifiedRatesHz.map((r) => formatSampleRate(r).replace(' kHz', 'k')).join(', ')}
              </span>
            </div>
            <p className="mt-1 text-[#9AA4B2]">{probe.notes[1]}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="DAC Hardware Switcher"
      className="flex h-full w-[390px] shrink-0 flex-col border-l border-[#2B3342] bg-[#14181F]"
    >
      {/* Header with Live udev Hotplug Active indicator */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#2B3342] px-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
              DAC Hardware Switcher
            </h2>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 mono-telemetry text-[11px] text-[#10B981]">
            <Radio className="h-3 w-3" aria-hidden="true" />
            <span>udev Hotplug Active</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close context drawer"
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8] focus-visible:outline-2 focus-visible:outline-[#38BDF8]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Three Routing Policy Toggles */}
        <section
          aria-label="Hardware Routing Policies"
          className="space-y-2 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[#F2F4F8]">Auto-Switch to External USB DAC on Connect</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoSwitchExternalDacPolicy}
              aria-label="Auto-Switch to External USB DAC on Connect"
              onClick={() => setAutoSwitchExternalDacPolicy(!autoSwitchExternalDacPolicy)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 mono-telemetry text-[10px] font-semibold ${
                autoSwitchExternalDacPolicy
                  ? 'bg-[#10B981] text-[#06130E]'
                  : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
              }`}
            >
              {autoSwitchExternalDacPolicy ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#2B3342]/70 pt-2">
            <span className="text-xs text-[#F2F4F8]">Bypass Laptop Audio</span>
            <button
              type="button"
              role="switch"
              aria-checked={bypassLaptopSpeakersPolicy}
              aria-label="Bypass Laptop Audio"
              onClick={() => void setBypassLaptopSpeakersPolicy(!bypassLaptopSpeakersPolicy)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 mono-telemetry text-[10px] font-semibold ${
                bypassLaptopSpeakersPolicy
                  ? 'bg-[#10B981] text-[#06130E]'
                  : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
              }`}
            >
              {bypassLaptopSpeakersPolicy ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#2B3342]/70 pt-2">
            <span className="text-xs text-[#F2F4F8]">Safe Pause on DAC Disconnect</span>
            <button
              type="button"
              role="switch"
              aria-checked={safePauseOnDisconnectPolicy}
              aria-label="Safe Pause on DAC Disconnect"
              onClick={() => setSafePauseOnDisconnectPolicy(!safePauseOnDisconnectPolicy)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 mono-telemetry text-[10px] font-semibold ${
                safePauseOnDisconnectPolicy
                  ? 'bg-[#10B981] text-[#06130E]'
                  : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
              }`}
            >
              {safePauseOnDisconnectPolicy ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        {/* Category 1: External USB DACs */}
        <section className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
            <HardDrive className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
            External USB DACs ({usbDacs.length})
          </h3>
          <div className="space-y-2.5">{usbDacs.map((d) => renderDeviceCard(d, 'usb'))}</div>
        </section>

        {/* Category 2: HDMI / AVR Passthrough */}
        <section className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
            <Tv className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
            HDMI / AVR Passthrough
          </h3>
          <div className="space-y-2.5">{hdmiDevices.map((d) => renderDeviceCard(d, 'hdmi'))}</div>
        </section>

        {/* Category 3: Dashed Isolated Internal Laptop Audio */}
        <section className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
            <Laptop className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
            Internal Laptop Audio (Isolated)
          </h3>
          <div className="space-y-2.5">
            {internalDevices.map((d) => renderDeviceCard(d, 'internal'))}
          </div>
        </section>
      </div>

      {/* Discreet Dev-Test Bar inside Drawer */}
      <div className="shrink-0 border-t border-[#2B3342] bg-[#0B0D10] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-[#9AA4B2] uppercase">
          <Wrench className="h-3 w-3 text-[#9AA4B2]" aria-hidden="true" />
          udev &amp; ALSA Test Harness
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={() => void triggerUsbPlugIn()}
            className="flex items-center justify-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1.5 text-[11px] font-medium text-[#10B981] hover:border-[#10B981]"
          >
            <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Simulate USB DAC Plug-In</span>
          </button>
          <button
            type="button"
            onClick={() => void triggerUsbHotUnplug()}
            className="flex items-center justify-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1.5 text-[11px] font-medium text-[#EF4444] hover:border-[#EF4444]"
          >
            <Unplug className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Simulate DAC Unplug (Safe Pause)</span>
          </button>
          <button
            type="button"
            onClick={() => void triggerAlsaEbusy()}
            className="flex items-center justify-center gap-1.5 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1.5 text-[11px] font-medium text-[#F59E0B] hover:border-[#F59E0B]"
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Simulate ALSA EBUSY</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

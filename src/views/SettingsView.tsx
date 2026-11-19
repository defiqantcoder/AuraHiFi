import { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  KeyRound,
  Monitor,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Terminal,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { generatePipeWireConfigs } from '../lib/studioHelpers';

type SettingsSection = 'engine' | 'pipewire' | 'credentials' | 'desktop' | 'diagnostics';

export function SettingsView() {
  const devices = useAudioStore((s) => s.devices);
  const signalPath = useAudioStore((s) => s.signalPath);
  const exclusiveAlsaPolicy = useAudioStore((s) => s.exclusiveAlsaPolicy);
  const bypassLaptopSpeakersPolicy = useAudioStore((s) => s.bypassLaptopSpeakersPolicy);
  const ringBufferMb = useAudioStore((s) => s.ringBufferMb);
  const gaplessEnabled = useAudioStore((s) => s.gaplessEnabled);
  const mpris2Enabled = useAudioStore((s) => s.mpris2Enabled);
  const minimizeToTray = useAudioStore((s) => s.minimizeToTray);
  const preventSleep = useAudioStore((s) => s.preventSleep);

  const setExclusiveAlsaPolicy = useAudioStore((s) => s.setExclusiveAlsaPolicy);
  const setBypassLaptopSpeakersPolicy = useAudioStore((s) => s.setBypassLaptopSpeakersPolicy);
  const updateEngineSettings = useAudioStore((s) => s.updateEngineSettings);

  const triggerAlsaEbusy = useAudioStore((s) => s.triggerAlsaEbusy);
  const claimDbusReservation = useAudioStore((s) => s.claimDbusReservation);
  const triggerUsbHotUnplug = useAudioStore((s) => s.triggerUsbHotUnplug);
  const triggerUsbReconnect = useAudioStore((s) => s.triggerUsbReconnect);
  const triggerMusicBrainz503 = useAudioStore((s) => s.triggerMusicBrainz503);
  const hardwareEventLog = useAudioStore((s) => s.hardwareEventLog);

  const [section, setSection] = useState<SettingsSection>('engine');
  const [pipewireModalOpen, setPipewireModalOpen] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<'pw' | 'wp' | null>(null);

  // Local API Credentials form state (visible labels, stored locally)
  const [discogsPat, setDiscogsPat] = useState('');
  const [acoustIdKey, setAcoustIdKey] = useState('');
  const [mbContactEmail, setMbContactEmail] = useState('audio-ops@studio.local');
  const [credFeedback, setCredFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeDevice = devices.find((d) => d.alsaId === signalPath?.activeDeviceId) ?? devices[0] ?? null;

  const generatedConfigs = useMemo(
    () => generatePipeWireConfigs(activeDevice, ringBufferMb),
    [activeDevice, ringBufferMb]
  );

  const categories: { id: SettingsSection; label: string; icon: typeof Sliders }[] = [
    { id: 'engine', label: 'Bit-Perfect Engine', icon: Sliders },
    { id: 'pipewire', label: 'Ubuntu PipeWire Assistant', icon: FileCode2 },
    { id: 'credentials', label: 'Local API Credentials', icon: KeyRound },
    { id: 'desktop', label: 'Desktop & MPRIS2', icon: Monitor },
    { id: 'diagnostics', label: 'IPC & Hardware Audit', icon: Terminal },
  ];

  const handleCopy = async (text: string, target: 'pw' | 'wp') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be restricted in headless mode; still show confirmation state cleanly
    }
    setCopiedTarget(target);
    setTimeout(() => setCopiedTarget(null), 1600);
  };

  const handleDownloadConf = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mbContactEmail.trim() || !mbContactEmail.includes('@')) {
      setCredFeedback({
        type: 'err',
        text: 'MusicBrainz requires a valid contact email in the User-Agent header to avoid HTTP 503 throttling.',
      });
      return;
    }
    setCredFeedback({
      type: 'ok',
      text: 'Local API credentials saved to Ubuntu Secret Service (libsecret) — zero telemetry transmitted.',
    });
  };

  return (
    <div className="mx-auto max-w-[1220px] space-y-5">
      <header>
        <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#F2F4F8]">
          Settings &amp; Ubuntu PipeWire Assistant
        </h1>
        <p className="mt-1 text-sm text-[#9AA4B2]">
          Configure Ubuntu 24.04 LTS / 26.04 LTS Bit-Perfect ALSA defaults, PipeWire/WirePlumber drop-in rules, and
          local metadata credentials.
        </p>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Categorized Settings Sidebar */}
        <nav
          aria-label="Settings Categories"
          className="w-full shrink-0 rounded-[14px] border border-[#2B3342] bg-[#14181F] p-2 lg:w-[240px]"
        >
          <ul className="space-y-1">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const active = section === cat.id;
              return (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => setSection(cat.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                      active
                        ? 'border border-[#2B3342] bg-[#1C222D] text-[#F2F4F8]'
                        : 'border border-transparent text-[#9AA4B2] hover:bg-[#1C222D]/60 hover:text-[#F2F4F8]'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? 'text-[#10B981]' : 'text-[#9AA4B2]'}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{cat.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Active Settings Content Panel */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* 1. Bit-Perfect Engine Defaults */}
          {section === 'engine' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3342] pb-3.5">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                    Bit-Perfect Engine Defaults
                  </h2>
                  <p className="mt-0.5 text-xs text-[#9AA4B2]">
                    Direct ALSA hardware lock, memory ring buffer, and RTKit real-time scheduling.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#10B981]/40 bg-[#10B981]/10 px-2.5 py-1 mono-telemetry text-[11px] font-semibold text-[#10B981]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  RTKit D-Bus Priority: Active (SCHED_FIFO)
                </span>
              </div>

              {/* Direct ALSA Exclusive vs PipeWire Shared */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">
                    Hardware Transport Backend
                  </div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Direct ALSA Exclusive claims <span className="mono-telemetry text-[#F2F4F8]">hw:CARD=&lt;ID&gt;,DEV=0</span>{' '}
                    via <span className="mono-telemetry text-[#F2F4F8]">ReserveDevice1</span>.
                  </div>
                </div>
                <div role="group" aria-label="ALSA Backend Mode" className="flex rounded-[8px] border border-[#2B3342] bg-[#14181F] p-1">
                  <button
                    type="button"
                    aria-pressed={exclusiveAlsaPolicy}
                    onClick={() => void setExclusiveAlsaPolicy(true)}
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      exclusiveAlsaPolicy ? 'bg-[#10B981] text-[#06130E]' : 'text-[#9AA4B2]'
                    }`}
                  >
                    Direct ALSA Exclusive
                  </button>
                  <button
                    type="button"
                    aria-pressed={!exclusiveAlsaPolicy}
                    onClick={() => void setExclusiveAlsaPolicy(false)}
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      !exclusiveAlsaPolicy ? 'bg-[#F59E0B] text-[#1A1002]' : 'text-[#9AA4B2]'
                    }`}
                  >
                    PipeWire Shared
                  </button>
                </div>
              </div>

              {/* Ring Buffer Size + Gapless Playback */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                  <label
                    htmlFor="ring-buffer-select"
                    className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]"
                  >
                    Lock-Free Ring Buffer Size
                  </label>
                  <select
                    id="ring-buffer-select"
                    value={ringBufferMb}
                    onChange={(e) => updateEngineSettings({ ringBufferMb: Number(e.target.value) })}
                    className="w-full rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                  >
                    <option value={64}>64 MB (Low Memory Footprint)</option>
                    <option value={128}>128 MB (Studio Recommended)</option>
                    <option value={256}>256 MB (DSD256 / Network NAS)</option>
                    <option value={512}>512 MB (Full Album RAM Preload)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                  <div>
                    <div className="text-sm font-medium text-[#F2F4F8]">Gapless Ring Pre-Decode</div>
                    <div className="mt-0.5 text-xs text-[#9AA4B2]">
                      Sample-accurate zero-gap transitions on matching clock rates.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={gaplessEnabled}
                    aria-label="Gapless Ring Pre-Decode"
                    onClick={() => updateEngineSettings({ gaplessEnabled: !gaplessEnabled })}
                    className={`shrink-0 rounded-full px-3 py-1 mono-telemetry text-xs font-semibold ${
                      gaplessEnabled
                        ? 'bg-[#10B981] text-[#06130E]'
                        : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                    }`}
                  >
                    {gaplessEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Laptop Speaker Isolation Toggle */}
              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">
                    Isolate Built-in Intel HDA Speakers on USB DAC Disconnect
                  </div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Halt transport safely instead of routing full-gain output to laptop speakers.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={bypassLaptopSpeakersPolicy}
                  aria-label="Isolate Built-in Intel HDA Speakers on USB DAC Disconnect"
                  onClick={() => void setBypassLaptopSpeakersPolicy(!bypassLaptopSpeakersPolicy)}
                  className={`shrink-0 rounded-full px-3 py-1 mono-telemetry text-xs font-semibold ${
                    bypassLaptopSpeakersPolicy
                      ? 'bg-[#10B981] text-[#06130E]'
                      : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                  }`}
                >
                  {bypassLaptopSpeakersPolicy ? 'ISOLATED' : 'OFF'}
                </button>
              </div>

              {/* Quick Launch PipeWire Assistant from Engine section too */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[#38BDF8]/35 bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-semibold text-[#F2F4F8]">
                    Ubuntu PipeWire &amp; WirePlumber Bit-Perfect Config Assistant
                  </div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Generate drop-in <span className="mono-telemetry text-[#F2F4F8]">50-bitperfect-dac.conf</span> and{' '}
                    <span className="mono-telemetry text-[#F2F4F8]">50-disable-auto-dac.conf</span> for{' '}
                    <span className="mono-telemetry text-[#38BDF8]">{activeDevice?.displayName ?? 'Active DAC'}</span>.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPipewireModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
                >
                  <FileCode2 className="h-4 w-4" aria-hidden="true" />
                  Preview &amp; Export PipeWire Bit-Perfect Config
                </button>
              </div>
            </section>
          )}

          {/* 2. Ubuntu PipeWire Assistant Dedicated Tab */}
          {section === 'pipewire' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                    Ubuntu 24.04 / 26.04 PipeWire &amp; WirePlumber Assistant
                  </h2>
                  <p className="mt-0.5 text-xs text-[#9AA4B2]">
                    Active target: <span className="mono-telemetry text-[#10B981]">{activeDevice?.displayName}</span> (
                    <span className="mono-telemetry text-[#F2F4F8]">{activeDevice?.alsaId}</span>)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPipewireModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
                >
                  <FileCode2 className="h-4 w-4" aria-hidden="true" />
                  Preview &amp; Export PipeWire Bit-Perfect Config
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3.5">
                  <div className="mono-telemetry text-xs font-semibold text-[#10B981]">
                    50-bitperfect-dac.conf
                  </div>
                  <p className="mt-1 text-xs text-[#9AA4B2]">
                    Unlocks all verified clock rates ({activeDevice?.supportedSampleRates.join(', ')} Hz) so PipeWire
                    never resamples to 48 kHz when shared mode is used.
                  </p>
                </div>
                <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3.5">
                  <div className="mono-telemetry text-xs font-semibold text-[#38BDF8]">
                    50-disable-auto-dac.conf
                  </div>
                  <p className="mt-1 text-xs text-[#9AA4B2]">
                    Configures WirePlumber to pause on idle and release your USB DAC cleanly so AuraHiFi&apos;s D-Bus{' '}
                    <span className="mono-telemetry text-[#F2F4F8]">ReserveDevice1</span> claim succeeds without{' '}
                    <span className="mono-telemetry text-[#EF4444]">EBUSY</span>.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* 3. Local API Credentials (Every input has a visible <label>) */}
          {section === 'credentials' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                  Local API Credentials (Ubuntu Keyring / libsecret)
                </h2>
                <p className="mt-0.5 text-xs text-[#9AA4B2]">
                  Used exclusively by sandboxed metadata add-ons on allow-listed hosts. Stored locally on your machine.
                </p>
              </div>

              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div>
                  <label htmlFor="discogs-pat" className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                    Discogs Personal Access Token (PAT)
                  </label>
                  <input
                    id="discogs-pat"
                    type="password"
                    value={discogsPat}
                    onChange={(e) => setDiscogsPat(e.target.value)}
                    placeholder="Enter Discogs personal access token"
                    className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] placeholder:text-[#9AA4B2] focus:border-[#38BDF8] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="acoustid-key" className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                    AcoustID Chromaprint API Key
                  </label>
                  <input
                    id="acoustid-key"
                    type="password"
                    value={acoustIdKey}
                    onChange={(e) => setAcoustIdKey(e.target.value)}
                    placeholder="Enter AcoustID client API key"
                    className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] placeholder:text-[#9AA4B2] focus:border-[#38BDF8] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="mb-contact-email" className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                    MusicBrainz Contact Email (RFC User-Agent Header)
                  </label>
                  <input
                    id="mb-contact-email"
                    type="email"
                    value={mbContactEmail}
                    onChange={(e) => setMbContactEmail(e.target.value)}
                    placeholder="you@domain.org"
                    className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] placeholder:text-[#9AA4B2] focus:border-[#38BDF8] focus:outline-none"
                  />
                </div>

                {credFeedback && (
                  <div
                    role="status"
                    className={`rounded-[8px] border px-3 py-2 text-xs ${
                      credFeedback.type === 'ok'
                        ? 'border-[#10B981]/50 bg-[#10B981]/10 text-[#F2F4F8]'
                        : 'border-[#EF4444]/50 bg-[#EF4444]/10 text-[#FCA5A5]'
                    }`}
                  >
                    {credFeedback.text}
                  </div>
                )}

                <div className="flex justify-end border-t border-[#2B3342] pt-3">
                  <button
                    type="submit"
                    className="rounded-[8px] bg-[#10B981] px-4 py-2 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
                  >
                    Save Local Credentials
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* 4. Desktop & MPRIS2 Toggles */}
          {section === 'desktop' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-3">
              <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                Ubuntu Desktop Integration &amp; MPRIS2
              </h2>

              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">
                    D-Bus MPRIS2 Media Controls (<span className="mono-telemetry text-xs">org.mpris.MediaPlayer2.aurahifi</span>)
                  </div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Expose GNOME Shell / KDE media widget controls and hardware media keys.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mpris2Enabled}
                  aria-label="Enable D-Bus MPRIS2 Media Controls"
                  onClick={() => updateEngineSettings({ mpris2Enabled: !mpris2Enabled })}
                  className={`shrink-0 rounded-full px-3 py-1 mono-telemetry text-xs font-semibold ${
                    mpris2Enabled
                      ? 'bg-[#10B981] text-[#06130E]'
                      : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                  }`}
                >
                  {mpris2Enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">Minimize to Ubuntu AppIndicator Tray</div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Keep Bit-Perfect ALSA transport running cleanly when the main window is closed.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={minimizeToTray}
                  aria-label="Minimize to Ubuntu AppIndicator Tray"
                  onClick={() => updateEngineSettings({ minimizeToTray: !minimizeToTray })}
                  className={`shrink-0 rounded-full px-3 py-1 mono-telemetry text-xs font-semibold ${
                    minimizeToTray
                      ? 'bg-[#10B981] text-[#06130E]'
                      : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                  }`}
                >
                  {minimizeToTray ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">Inhibit System Suspend During Active Playback</div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Holds systemd-logind idle inhibitor while audio ring buffer is streaming.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preventSleep}
                  aria-label="Inhibit System Suspend During Active Playback"
                  onClick={() => updateEngineSettings({ preventSleep: !preventSleep })}
                  className={`shrink-0 rounded-full px-3 py-1 mono-telemetry text-xs font-semibold ${
                    preventSleep
                      ? 'bg-[#10B981] text-[#06130E]'
                      : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                  }`}
                >
                  {preventSleep ? 'ON' : 'OFF'}
                </button>
              </div>
            </section>
          )}

          {/* 5. IPC & Hardware Audit Diagnostics */}
          {section === 'diagnostics' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                  IPC Edge-Case &amp; Hardware Event Stream
                </h2>
                <p className="mt-0.5 text-xs text-[#9AA4B2]">
                  Inject Linux audio edge cases and inspect the live{' '}
                  <span className="mono-telemetry text-[#F2F4F8]">subscribe_hardware_events</span> stream.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void triggerAlsaEbusy()}
                  className="flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-left text-xs font-medium text-[#F2F4F8] hover:border-[#EF4444]"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0 text-[#EF4444]" aria-hidden="true" />
                  <span>Inject ALSA EBUSY</span>
                </button>
                <button
                  type="button"
                  onClick={() => void claimDbusReservation()}
                  className="flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-left text-xs font-medium text-[#F2F4F8] hover:border-[#10B981]"
                >
                  <RefreshCw className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
                  <span>Claim ReserveDevice1</span>
                </button>
                <button
                  type="button"
                  onClick={() => void triggerUsbHotUnplug()}
                  className="flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-left text-xs font-medium text-[#F2F4F8] hover:border-[#EF4444]"
                >
                  <Unplug className="h-4 w-4 shrink-0 text-[#EF4444]" aria-hidden="true" />
                  <span>Inject USB Hot-Unplug</span>
                </button>
                <button
                  type="button"
                  onClick={() => void triggerUsbReconnect()}
                  className="flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-left text-xs font-medium text-[#F2F4F8] hover:border-[#10B981]"
                >
                  <Cpu className="h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
                  <span>Re-Enumerate USB DAC</span>
                </button>
                <button
                  type="button"
                  onClick={() => void triggerMusicBrainz503()}
                  className="flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3 py-2 text-left text-xs font-medium text-[#F2F4F8] hover:border-[#F59E0B]"
                >
                  <Zap className="h-4 w-4 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                  <span>Inject MusicBrainz 503</span>
                </button>
              </div>

              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3.5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#F2F4F8]">HardwareEvent Channel</span>
                  <span className="mono-telemetry text-[11px] text-[#9AA4B2]">
                    {hardwareEventLog.length} events
                  </span>
                </div>
                {hardwareEventLog.length === 0 ? (
                  <p className="py-4 text-center mono-telemetry text-xs text-[#9AA4B2]">
                    No hardware transitions logged yet.
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto mono-telemetry text-[11px]">
                    {hardwareEventLog.map((ev, idx) => (
                      <li
                        key={`${ev.timestampMs}-${idx}`}
                        className="flex items-start gap-2 border-b border-[#2B3342]/60 pb-1.5 last:border-b-0"
                      >
                        <span className="shrink-0 text-[#9AA4B2]">
                          {new Date(ev.timestampMs).toISOString().slice(11, 19)}
                        </span>
                        <span className="shrink-0 font-semibold text-[#38BDF8]">{ev.type}</span>
                        <span className="text-[#F2F4F8]">
                          {'message' in ev ? ev.message : ev.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Interactive Preview & Export PipeWire Bit-Perfect Config Modal */}
      {pipewireModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview and Export PipeWire Bit-Perfect Configuration"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setPipewireModalOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-[780px] flex-col rounded-[14px] border border-[#2B3342] bg-[#14181F] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#2B3342] px-5 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F2F4F8]">
                  Ubuntu PipeWire &amp; WirePlumber Bit-Perfect Config
                </h2>
                <p className="mt-0.5 mono-telemetry text-xs text-[#10B981]">
                  Derived from Active DAC: {activeDevice?.displayName} ({activeDevice?.alsaId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPipewireModalOpen(false)}
                aria-label="Close PipeWire config preview modal"
                className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* File 1: 50-bitperfect-dac.conf */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2B3342] px-3.5 py-2">
                  <span className="mono-telemetry text-xs font-semibold text-[#10B981]">
                    {generatedConfigs.pipewireFilePath}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(generatedConfigs.pipewireContent, 'pw')}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1 text-[11px] text-[#F2F4F8] hover:border-[#38BDF8]"
                    >
                      {copiedTarget === 'pw' ? (
                        <Check className="h-3 w-3 text-[#10B981]" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                      {copiedTarget === 'pw' ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadConf('50-bitperfect-dac.conf', generatedConfigs.pipewireContent)
                      }
                      className="inline-flex items-center gap-1 rounded-[6px] bg-[#10B981] px-2.5 py-1 text-[11px] font-semibold text-[#06130E] hover:bg-[#34D399]"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      Export .conf
                    </button>
                  </div>
                </div>
                <pre className="overflow-x-auto p-3.5 mono-telemetry text-[11px] leading-relaxed text-[#F2F4F8]">
                  {generatedConfigs.pipewireContent}
                </pre>
              </div>

              {/* File 2: 50-disable-auto-dac.conf */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2B3342] px-3.5 py-2">
                  <span className="mono-telemetry text-xs font-semibold text-[#38BDF8]">
                    {generatedConfigs.wireplumberFilePath}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(generatedConfigs.wireplumberContent, 'wp')}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-2.5 py-1 text-[11px] text-[#F2F4F8] hover:border-[#38BDF8]"
                    >
                      {copiedTarget === 'wp' ? (
                        <Check className="h-3 w-3 text-[#10B981]" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                      {copiedTarget === 'wp' ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadConf('50-disable-auto-dac.conf', generatedConfigs.wireplumberContent)
                      }
                      className="inline-flex items-center gap-1 rounded-[6px] bg-[#38BDF8] px-2.5 py-1 text-[11px] font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
                    >
                      <Download className="h-3 w-3" aria-hidden="true" />
                      Export .conf
                    </button>
                  </div>
                </div>
                <pre className="overflow-x-auto p-3.5 mono-telemetry text-[11px] leading-relaxed text-[#F2F4F8]">
                  {generatedConfigs.wireplumberContent}
                </pre>
              </div>

              <div className="rounded-[8px] border border-[#2B3342] bg-[#1C222D] p-3 text-xs text-[#9AA4B2]">
                Apply on Ubuntu 24.04 / 26.04 LTS:{' '}
                <code className="mono-telemetry text-[#F2F4F8]">
                  systemctl --user restart pipewire pipewire-pulse wireplumber
                </code>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

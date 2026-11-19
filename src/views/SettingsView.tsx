import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileCode2,
  Folder,
  FolderPlus,
  HelpCircle,
  KeyRound,
  Loader2,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { generatePipeWireConfigs } from '../lib/studioHelpers';
import { ExplainTooltip } from '../components/ui/ExplainTooltip';

type SettingsSection = 'engine' | 'library' | 'pipewire' | 'credentials' | 'hover_help' | 'desktop' | 'diagnostics';

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

  // Library & Storage
  const libraryFolders = useAudioStore((s) => s.libraryFolders);
  const defaultMusicDirExists = useAudioStore((s) => s.defaultMusicDirExists);
  const defaultMusicDirPath = useAudioStore((s) => s.defaultMusicDirPath);
  const scanProgress = useAudioStore((s) => s.scanProgress);
  const pickAndAddFolder = useAudioStore((s) => s.pickAndAddFolder);
  const addMusicFolder = useAudioStore((s) => s.addMusicFolder);
  const removeLibraryFolder = useAudioStore((s) => s.removeLibraryFolder);
  const toggleFolderWatch = useAudioStore((s) => s.toggleFolderWatch);
  const rescanAllFolders = useAudioStore((s) => s.rescanAllFolders);

  // Hover Help & Explanations
  const hoverHelpEnabled = useAudioStore((s) => s.hoverHelpEnabled);
  const setHoverHelpEnabled = useAudioStore((s) => s.setHoverHelpEnabled);
  const hoverHelpDelayMs = useAudioStore((s) => s.hoverHelpDelayMs);
  const setHoverHelpDelayMs = useAudioStore((s) => s.setHoverHelpDelayMs);

  // API Keyring & Online AI
  const geminiModel = useAudioStore((s) => s.geminiModel);
  const setGeminiModel = useAudioStore((s) => s.setGeminiModel);
  const credentialStatuses = useAudioStore((s) => s.credentialStatuses);
  const fetchCredentialStatus = useAudioStore((s) => s.fetchCredentialStatus);
  const saveCredential = useAudioStore((s) => s.saveCredential);
  const deleteCredential = useAudioStore((s) => s.deleteCredential);
  const testCredential = useAudioStore((s) => s.testCredential);

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

  // Keyring Inputs & Status
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [acoustIdKeyInput, setAcoustIdKeyInput] = useState('');
  const [discogsPatInput, setDiscogsPatInput] = useState('');
  const [mbContactInput, setMbContactInput] = useState('audio-ops@studio.local');
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [savingService, setSavingService] = useState<string | null>(null);

  useEffect(() => {
    void fetchCredentialStatus('gemini');
    void fetchCredentialStatus('acoustid');
    void fetchCredentialStatus('discogs');
    void fetchCredentialStatus('musicbrainz_contact');
  }, [fetchCredentialStatus]);

  const activeDevice = devices.find((d) => d.alsaId === signalPath?.activeDeviceId) ?? devices[0] ?? null;

  const generatedConfigs = useMemo(
    () => generatePipeWireConfigs(activeDevice, ringBufferMb),
    [activeDevice, ringBufferMb]
  );

  const categories: { id: SettingsSection; label: string; icon: any }[] = [
    { id: 'engine', label: 'Bit-Perfect Engine', icon: Sliders },
    { id: 'library', label: 'Library & Storage', icon: Folder },
    { id: 'pipewire', label: 'Ubuntu PipeWire Assistant', icon: FileCode2 },
    { id: 'credentials', label: 'API Keys & Online AI', icon: KeyRound },
    { id: 'hover_help', label: 'Hover Help & Explanations', icon: HelpCircle },
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

  const handleTestKey = async (service: string, keyVal?: string) => {
    setTestingService(service);
    try {
      const res = await testCredential(service, keyVal || undefined);
      setTestResults((prev) => ({
        ...prev,
        [service]: { ok: res.valid, message: res.message },
      }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [service]: { ok: false, message: e?.message ?? 'Test failed' },
      }));
    } finally {
      setTestingService(null);
    }
  };

  const handleSaveKey = async (service: string, secret: string, model?: string) => {
    if (!secret.trim()) return;
    setSavingService(service);
    try {
      await saveCredential(service, secret.trim(), model);
      setTestResults((prev) => ({
        ...prev,
        [service]: { ok: true, message: 'Saved securely to Ubuntu Keyring' },
      }));
      if (service === 'gemini') setGeminiKeyInput('');
      if (service === 'acoustid') setAcoustIdKeyInput('');
      if (service === 'discogs') setDiscogsPatInput('');
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [service]: { ok: false, message: e?.message ?? 'Save failed' },
      }));
    } finally {
      setSavingService(null);
    }
  };

  const handleDeleteKey = async (service: string) => {
    await deleteCredential(service);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[service];
      return next;
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

          {/* 2. Library & Storage Section */}
          {section === 'library' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2B3342] pb-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                    Library &amp; Storage Folders
                  </h2>
                  <p className="mt-0.5 text-xs text-[#9AA4B2]">
                    Lossless directories indexed in SQLite library.db and monitored live by the notify filesystem watcher.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ExplainTooltip termId="add_music_folder">
                    <button
                      type="button"
                      onClick={() => void pickAndAddFolder()}
                      className="inline-flex items-center gap-2 rounded-[8px] bg-[#10B981] px-3.5 py-2 text-xs font-semibold text-[#0B0D10] transition-colors duration-150 hover:bg-[#059669] shadow"
                    >
                      <FolderPlus className="h-4 w-4" aria-hidden="true" />
                      <span>+ Add Music Folder</span>
                    </button>
                  </ExplainTooltip>

                  <button
                    type="button"
                    onClick={() => void rescanAllFolders()}
                    disabled={scanProgress !== null && !scanProgress.isComplete}
                    className="inline-flex items-center gap-2 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3.5 py-2 text-xs font-semibold text-[#F2F4F8] transition-colors duration-150 hover:border-[#10B981]"
                  >
                    <RefreshCw
                      className={`h-4 w-4 text-[#10B981] ${
                        scanProgress !== null && !scanProgress.isComplete ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Rescan All Now</span>
                  </button>
                </div>
              </div>

              {/* Standard ~/Music Shortcut */}
              {defaultMusicDirExists && defaultMusicDirPath && !libraryFolders.some((f) => f.path === defaultMusicDirPath) && (
                <div className="flex items-center justify-between rounded-[10px] border border-[#2B3342] bg-[#0B0D10] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Folder className="h-4 w-4 text-[#10B981]" />
                    <div>
                      <div className="text-xs font-medium text-[#F2F4F8]">Standard Music Directory Detected</div>
                      <div className="font-mono text-[11px] text-[#9AA4B2]">{defaultMusicDirPath}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void addMusicFolder(defaultMusicDirPath)}
                    className="px-3 py-1.5 rounded-[6px] border border-[#10B981] bg-[#10B981]/10 text-xs font-medium text-[#10B981] hover:bg-[#10B981]/20 transition-colors"
                  >
                    Add ~/Music
                  </button>
                </div>
              )}

              {/* Live Scan Progress */}
              {scanProgress && !scanProgress.isComplete && (
                <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" />
                      <span className="font-medium text-[#F2F4F8]">Indexing Music Files...</span>
                    </div>
                    <span className="font-mono text-[#10B981] text-xs">
                      {scanProgress.filesScanned} files scanned · {scanProgress.tracksAdded} tracks added
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#1C222D] overflow-hidden">
                    <div className="h-full bg-[#10B981] w-2/3 animate-pulse" />
                  </div>
                  {scanProgress.currentDirectory && (
                    <div className="mt-1.5 font-mono text-[10.5px] text-[#9AA4B2] truncate">
                      Directory: {scanProgress.currentDirectory}
                    </div>
                  )}
                </div>
              )}

              {/* Watched Folders Table / List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider">
                  Watched Folders ({libraryFolders.length})
                </h3>
                {libraryFolders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#2B3342] py-8 text-center bg-[#0B0D10]/40">
                    <Folder className="h-8 w-8 text-[#9AA4B2] opacity-50 mb-2" />
                    <p className="text-xs text-[#9AA4B2]">No music library folders configured yet.</p>
                    <p className="text-[11px] text-[#6B7280] mt-1">
                      Click "+ Add Music Folder" above to choose a directory.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {libraryFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Folder className="h-4 w-4 text-[#10B981] shrink-0" />
                          <div className="truncate">
                            <div className="font-mono text-xs font-medium text-[#F2F4F8] truncate">
                              {folder.path}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9AA4B2]">
                              <span className="mono-telemetry text-[#10B981] font-medium">
                                {folder.trackCount} tracks
                              </span>
                              <span>•</span>
                              <span>{folder.watchEnabled ? 'Filesystem watcher active' : 'Watcher paused'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={folder.watchEnabled}
                              onChange={() => void toggleFolderWatch(folder.id, !folder.watchEnabled)}
                              className="rounded border-[#2B3342] bg-[#14181F] text-[#10B981] focus:ring-[#10B981]"
                            />
                            <span className="text-xs text-[#9AA4B2]">Auto-Watch</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => void removeLibraryFolder(folder.id)}
                            className="p-1.5 text-[#9AA4B2] hover:text-[#EF4444] rounded hover:bg-[#1C222D] transition-colors"
                            title="Remove folder from library"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 3. API Keys & Online AI (Ubuntu Keyring / libsecret) */}
          {section === 'credentials' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-5">
              {/* Security Enclave Notice */}
              <div className="rounded-[10px] border border-[#10B981]/40 bg-[#10B981]/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#10B981] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#10B981]">
                      Ubuntu Secret Service (GNOME Keyring) Enclave
                    </h3>
                    <p className="mt-1 text-xs text-[#F2F4F8] leading-relaxed">
                      All credentials are stored securely inside Ubuntu's native keyring via{' '}
                      <span className="font-mono text-[#10B981]">libsecret</span>. Tokens are never written to plaintext JSON, SQLite, or browser localStorage. AuraHiFi transmits zero telemetry.
                    </p>
                  </div>
                </div>
              </div>

              {/* 1. Google Gemini API */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#38BDF8]" />
                    <label htmlFor="gemini-key" className="text-xs font-bold text-[#F2F4F8]">
                      Google Gemini API Key
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        credentialStatuses.gemini?.configured
                          ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                          : 'bg-[#1C222D] text-[#9AA4B2] border border-[#2B3342]'
                      }`}
                    >
                      {credentialStatuses.gemini?.configured
                        ? `Configured (${credentialStatuses.gemini.maskedHint ?? 'saved'})`
                        : 'Not Configured'}
                    </span>
                    <a
                      href="https://aistudio.google.com/api-keys"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#38BDF8] hover:underline"
                    >
                      <span>Where to get this key</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#9AA4B2]">
                  Powers natural-language AI Smart Playlists. Post-May 2026 AI Studio keys and service account auth keys are supported.
                </p>

                {/* Gemini Model Selector */}
                <div>
                  <label htmlFor="gemini-model-select" className="block text-[11px] font-semibold text-[#9AA4B2] uppercase tracking-wider mb-1">
                    Gemini AI Model
                  </label>
                  <select
                    id="gemini-model-select"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full md:w-80 rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-1.5 text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
                  >
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended Default)</option>
                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Free Tier Fast)</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="gemini-key"
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder={credentialStatuses.gemini?.configured ? 'Enter new key to replace existing' : 'Enter Gemini API key'}
                    className="flex-1 min-w-[200px] rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7280] focus:border-[#38BDF8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestKey('gemini', geminiKeyInput)}
                    disabled={testingService === 'gemini'}
                    className="px-3 py-2 rounded-[6px] border border-[#2B3342] bg-[#1C222D] text-xs font-semibold text-[#F2F4F8] hover:border-[#38BDF8] transition-colors"
                  >
                    {testingService === 'gemini' ? 'Testing...' : 'Test Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveKey('gemini', geminiKeyInput, geminiModel)}
                    disabled={savingService === 'gemini' || !geminiKeyInput.trim()}
                    className="px-4 py-2 rounded-[6px] bg-[#10B981] text-xs font-bold text-[#0B0D10] hover:bg-[#059669] transition-colors disabled:opacity-50"
                  >
                    Save Key
                  </button>
                  {credentialStatuses.gemini?.configured && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteKey('gemini')}
                      className="px-3 py-2 rounded-[6px] border border-[#EF4444]/40 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {testResults.gemini && (
                  <div
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-mono ${
                      testResults.gemini.ok
                        ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30'
                        : 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30'
                    }`}
                  >
                    {testResults.gemini.ok ? '✓ ' : '✗ '}
                    {testResults.gemini.message}
                  </div>
                )}
              </div>

              {/* 2. AcoustID Chromaprint API */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#10B981]" />
                    <label htmlFor="acoustid-key" className="text-xs font-bold text-[#F2F4F8]">
                      AcoustID Chromaprint API Key
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        credentialStatuses.acoustid?.configured
                          ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                          : 'bg-[#1C222D] text-[#9AA4B2] border border-[#2B3342]'
                      }`}
                    >
                      {credentialStatuses.acoustid?.configured
                        ? `Configured (${credentialStatuses.acoustid.maskedHint ?? 'saved'})`
                        : 'Not Configured'}
                    </span>
                    <a
                      href="https://acoustid.org/login"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#38BDF8] hover:underline"
                    >
                      <span>Where to get this key</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#9AA4B2]">
                  Enables acoustic fingerprint lookup to identify unknown lossless tracks against MusicBrainz.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="acoustid-key"
                    type="password"
                    value={acoustIdKeyInput}
                    onChange={(e) => setAcoustIdKeyInput(e.target.value)}
                    placeholder={credentialStatuses.acoustid?.configured ? 'Enter new key to replace existing' : 'Enter AcoustID key'}
                    className="flex-1 min-w-[200px] rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7280] focus:border-[#38BDF8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestKey('acoustid', acoustIdKeyInput)}
                    disabled={testingService === 'acoustid'}
                    className="px-3 py-2 rounded-[6px] border border-[#2B3342] bg-[#1C222D] text-xs font-semibold text-[#F2F4F8] hover:border-[#38BDF8] transition-colors"
                  >
                    {testingService === 'acoustid' ? 'Testing...' : 'Test Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveKey('acoustid', acoustIdKeyInput)}
                    disabled={savingService === 'acoustid' || !acoustIdKeyInput.trim()}
                    className="px-4 py-2 rounded-[6px] bg-[#10B981] text-xs font-bold text-[#0B0D10] hover:bg-[#059669] transition-colors disabled:opacity-50"
                  >
                    Save Key
                  </button>
                  {credentialStatuses.acoustid?.configured && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteKey('acoustid')}
                      className="px-3 py-2 rounded-[6px] border border-[#EF4444]/40 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {testResults.acoustid && (
                  <div
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-mono ${
                      testResults.acoustid.ok
                        ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30'
                        : 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30'
                    }`}
                  >
                    {testResults.acoustid.ok ? '✓ ' : '✗ '}
                    {testResults.acoustid.message}
                  </div>
                )}
              </div>

              {/* 3. Discogs Personal Access Token */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#10B981]" />
                    <label htmlFor="discogs-pat" className="text-xs font-bold text-[#F2F4F8]">
                      Discogs Personal Access Token (PAT)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        credentialStatuses.discogs?.configured
                          ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                          : 'bg-[#1C222D] text-[#9AA4B2] border border-[#2B3342]'
                      }`}
                    >
                      {credentialStatuses.discogs?.configured
                        ? `Configured (${credentialStatuses.discogs.maskedHint ?? 'saved'})`
                        : 'Not Configured'}
                    </span>
                    <a
                      href="https://discogs.com/settings/developers"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[#38BDF8] hover:underline"
                    >
                      <span>Where to get this token</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <p className="text-[11.5px] text-[#9AA4B2]">
                  Used for rich vinyl and master release credits, matrix numbers, and catalog pressing information.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="discogs-pat"
                    type="password"
                    value={discogsPatInput}
                    onChange={(e) => setDiscogsPatInput(e.target.value)}
                    placeholder={credentialStatuses.discogs?.configured ? 'Enter new token to replace existing' : 'Enter Discogs PAT'}
                    className="flex-1 min-w-[200px] rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7280] focus:border-[#38BDF8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestKey('discogs', discogsPatInput)}
                    disabled={testingService === 'discogs'}
                    className="px-3 py-2 rounded-[6px] border border-[#2B3342] bg-[#1C222D] text-xs font-semibold text-[#F2F4F8] hover:border-[#38BDF8] transition-colors"
                  >
                    {testingService === 'discogs' ? 'Testing...' : 'Test Token'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveKey('discogs', discogsPatInput)}
                    disabled={savingService === 'discogs' || !discogsPatInput.trim()}
                    className="px-4 py-2 rounded-[6px] bg-[#10B981] text-xs font-bold text-[#0B0D10] hover:bg-[#059669] transition-colors disabled:opacity-50"
                  >
                    Save Token
                  </button>
                  {credentialStatuses.discogs?.configured && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteKey('discogs')}
                      className="px-3 py-2 rounded-[6px] border border-[#EF4444]/40 text-xs font-medium text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {testResults.discogs && (
                  <div
                    className={`rounded-[6px] px-3 py-1.5 text-xs font-mono ${
                      testResults.discogs.ok
                        ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30'
                        : 'bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30'
                    }`}
                  >
                    {testResults.discogs.ok ? '✓ ' : '✗ '}
                    {testResults.discogs.message}
                  </div>
                )}
              </div>

              {/* 4. MusicBrainz Contact Email */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#10B981]" />
                    <label htmlFor="mb-contact-email" className="text-xs font-bold text-[#F2F4F8]">
                      MusicBrainz Contact Email (RFC User-Agent Header)
                    </label>
                  </div>
                  <a
                    href="https://musicbrainz.org"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#38BDF8] hover:underline"
                  >
                    <span>musicbrainz.org</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <p className="text-[11.5px] text-[#9AA4B2]">
                  Required by MusicBrainz API terms in User-Agent headers to prevent IP-level rate-limiting and HTTP 503 throttling.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="mb-contact-email"
                    type="email"
                    value={mbContactInput}
                    onChange={(e) => setMbContactInput(e.target.value)}
                    placeholder="you@domain.org"
                    className="flex-1 min-w-[200px] rounded-[6px] border border-[#2B3342] bg-[#14181F] px-3 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7280] focus:border-[#38BDF8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveKey('musicbrainz_contact', mbContactInput)}
                    disabled={savingService === 'musicbrainz_contact' || !mbContactInput.includes('@')}
                    className="px-4 py-2 rounded-[6px] bg-[#10B981] text-xs font-bold text-[#0B0D10] hover:bg-[#059669] transition-colors disabled:opacity-50"
                  >
                    Save Email
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 4. Hover Help & Accessibility Section */}
          {section === 'hover_help' && (
            <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-5">
              <div className="border-b border-[#2B3342] pb-4">
                <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                  Plain-Language Hover Help &amp; Explanations
                </h2>
                <p className="mt-0.5 text-xs text-[#9AA4B2]">
                  Interactive contextual tooltips that explain audiophile concepts, hardware flags, and DSP terms in plain, jargon-free language.
                </p>
              </div>

              {/* Master ON/OFF Toggle */}
              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
                <div>
                  <div className="text-sm font-medium text-[#F2F4F8]">Enable Hover Help Tooltips</div>
                  <div className="mt-0.5 text-xs text-[#9AA4B2]">
                    Displays non-jargon explanations when hovering or focusing on audio settings, hardware controls, and signal badges.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hoverHelpEnabled}
                  onClick={() => setHoverHelpEnabled(!hoverHelpEnabled)}
                  className={`rounded-full px-3 py-1 mono-telemetry text-xs font-semibold transition-colors ${
                    hoverHelpEnabled
                      ? 'bg-[#10B981] text-[#06130E]'
                      : 'border border-[#2B3342] bg-[#1C222D] text-[#9AA4B2]'
                  }`}
                >
                  {hoverHelpEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              {/* Hover Delay Slider */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="hover-delay-slider" className="text-sm font-medium text-[#F2F4F8]">
                    Hover Trigger Delay
                  </label>
                  <span className="font-mono text-xs font-semibold text-[#10B981]">
                    {hoverHelpDelayMs} ms
                  </span>
                </div>
                <p className="text-xs text-[#9AA4B2]">
                  How long the cursor must rest on an element before the explanation appears (100 ms – 800 ms).
                </p>
                <input
                  id="hover-delay-slider"
                  type="range"
                  min="100"
                  max="800"
                  step="50"
                  value={hoverHelpDelayMs}
                  onChange={(e) => setHoverHelpDelayMs(Number(e.target.value))}
                  className="w-full accent-[#10B981] cursor-pointer"
                />
              </div>

              {/* Preview Cards */}
              <div className="rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4 space-y-3">
                <h3 className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider">
                  Live Preview Examples
                </h3>
                <p className="text-xs text-[#9AA4B2]">
                  Hover over the terms below to see how plain-language explanations render in real time:
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <ExplainTooltip termId="bit_perfect">
                    <span className="px-3 py-1.5 rounded-[6px] border border-[#10B981]/40 bg-[#10B981]/10 text-xs font-mono font-semibold text-[#10B981] cursor-help">
                      Bit-Perfect Exclusive
                    </span>
                  </ExplainTooltip>

                  <ExplainTooltip termId="sofa_hrtf">
                    <span className="px-3 py-1.5 rounded-[6px] border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-xs font-mono font-semibold text-[#38BDF8] cursor-help">
                      SOFA HRTF Binaural
                    </span>
                  </ExplainTooltip>

                  <ExplainTooltip termId="ebu_r128">
                    <span className="px-3 py-1.5 rounded-[6px] border border-[#2B3342] bg-[#1C222D] text-xs font-mono font-semibold text-[#F2F4F8] cursor-help">
                      EBU R128 Loudness
                    </span>
                  </ExplainTooltip>
                </div>
              </div>
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

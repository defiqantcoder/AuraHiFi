import React, { useState } from 'react';
import {
  FolderPlus,
  Folder,
  Trash2,
  CheckCircle2,
  Cpu,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Volume2,
  Sliders,
  ShieldCheck,
  Key,
  Music,
  Loader2,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { type AudioMode } from '../lib/audioBridge';
import { ExplainTooltip } from '../components/ui/ExplainTooltip';

export const FirstRunSetupView: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedMode, setSelectedMode] = useState<AudioMode>('bit_perfect');

  const libraryFolders = useAudioStore((s) => s.libraryFolders);
  const defaultMusicDirExists = useAudioStore((s) => s.defaultMusicDirExists);
  const defaultMusicDirPath = useAudioStore((s) => s.defaultMusicDirPath);
  const scanProgress = useAudioStore((s) => s.scanProgress);
  const devices = useAudioStore((s) => s.devices);
  const signalPath = useAudioStore((s) => s.signalPath);

  const pickAndAddFolder = useAudioStore((s) => s.pickAndAddFolder);
  const addMusicFolder = useAudioStore((s) => s.addMusicFolder);
  const removeLibraryFolder = useAudioStore((s) => s.removeLibraryFolder);
  const selectAudioDevice = useAudioStore((s) => s.selectAudioDevice);
  const completeOnboarding = useAudioStore((s) => s.completeOnboarding);

  const activeDeviceId = signalPath?.activeDeviceId ?? devices[0]?.alsaId;
  const usbDacs = devices.filter((d) => d.transportType === 'usb');
  const internalSpeakers = devices.filter((d) => d.transportType !== 'usb');

  const handleFinish = async () => {
    await completeOnboarding(selectedMode);
  };

  const isScanning = scanProgress !== null && !scanProgress.isComplete;

  return (
    <div className="mx-auto max-w-4xl py-6 px-4">
      {/* Header Banner */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#2B3342] bg-[#14181F] text-xs font-mono text-[#10B981] mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AuraHiFi Setup Guide</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F2F4F8]">
          Welcome to AuraHiFi
        </h1>
        <p className="mt-2 text-sm text-[#9AA4B2] max-w-lg mx-auto">
          Bit-perfect audiophile playback, native 64-bit spatial DSP, and local SQLite vector intelligence for Ubuntu.
        </p>
      </div>

      {/* 3-Step Wizard Navigation */}
      <div className="mb-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          className={`flex items-center gap-2 px-4 py-2 rounded-[10px] border text-xs font-medium transition-all ${
            currentStep === 1
              ? 'border-[#10B981] bg-[#14181F] text-[#10B981]'
              : 'border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1C222D] text-[11px] font-mono">
            1
          </span>
          <span>Music Library</span>
          {libraryFolders.length > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />}
        </button>

        <div className="h-[1px] w-6 bg-[#2B3342]" />

        <button
          type="button"
          onClick={() => setCurrentStep(2)}
          className={`flex items-center gap-2 px-4 py-2 rounded-[10px] border text-xs font-medium transition-all ${
            currentStep === 2
              ? 'border-[#10B981] bg-[#14181F] text-[#10B981]'
              : 'border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1C222D] text-[11px] font-mono">
            2
          </span>
          <span>DAC &amp; Audio Mode</span>
        </button>

        <div className="h-[1px] w-6 bg-[#2B3342]" />

        <button
          type="button"
          onClick={() => setCurrentStep(3)}
          className={`flex items-center gap-2 px-4 py-2 rounded-[10px] border text-xs font-medium transition-all ${
            currentStep === 3
              ? 'border-[#10B981] bg-[#14181F] text-[#10B981]'
              : 'border-[#2B3342] bg-[#0B0D10] text-[#9AA4B2] hover:text-[#F2F4F8]'
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1C222D] text-[11px] font-mono">
            3
          </span>
          <span>Finish</span>
        </button>
      </div>

      {/* Step 1: Music Library Folders */}
      {currentStep === 1 && (
        <div className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-[#2B3342]">
            <div>
              <h2 className="font-display text-lg font-bold text-[#F2F4F8]">
                Step 1 — Add Your Music Library
              </h2>
              <p className="text-xs text-[#9AA4B2] mt-0.5">
                Select your lossless folders. AuraHiFi will index FLAC, ALAC, WAV, DSD, CUE sheets, and compute replay gain locally.
              </p>
            </div>
            <ExplainTooltip termId="add_music_folder">
              <button
                type="button"
                onClick={() => void pickAndAddFolder()}
                className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[#10B981] text-[#0B0D10] font-semibold text-xs hover:bg-[#059669] transition-colors shadow"
              >
                <FolderPlus className="h-4 w-4" />
                <span>+ Add Music Folder</span>
              </button>
            </ExplainTooltip>
          </div>

          {/* Quick ~/Music Shortcut if detected */}
          {defaultMusicDirExists && defaultMusicDirPath && !libraryFolders.some((f) => f.path === defaultMusicDirPath) && (
            <div className="mt-4 flex items-center justify-between rounded-[10px] border border-[#2B3342] bg-[#1C222D] px-4 py-3">
              <div className="flex items-center gap-3">
                <Music className="h-4 w-4 text-[#10B981]" />
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

          {/* Folders List */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider mb-2">
              Configured Folders ({libraryFolders.length})
            </h3>
            {libraryFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-[#2B3342] py-8 text-center bg-[#0B0D10]/50">
                <Folder className="h-8 w-8 text-[#9AA4B2] opacity-50 mb-2" />
                <p className="text-xs text-[#9AA4B2]">No music folders added yet.</p>
                <p className="text-[11px] text-[#6B7280] mt-1">
                  Click "+ Add Music Folder" above or use native Ubuntu picker.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {libraryFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folder className="h-4 w-4 text-[#10B981] shrink-0" />
                      <div className="truncate">
                        <div className="font-mono text-xs text-[#F2F4F8] truncate">{folder.path}</div>
                        <div className="text-[11px] text-[#9AA4B2]">
                          {folder.trackCount} indexed tracks {folder.watchEnabled ? '• Auto-watching' : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeLibraryFolder(folder.id)}
                      className="p-1.5 text-[#9AA4B2] hover:text-[#EF4444] transition-colors rounded-[6px] hover:bg-[#0B0D10]"
                      title="Remove folder"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Scan Progress Indicator */}
          {scanProgress && (
            <div className="mt-6 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-2">
                  {isScanning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#10B981]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  )}
                  <span className="font-medium text-[#F2F4F8]">
                    {isScanning ? 'Indexing Lossless Music...' : 'Library Indexing Complete'}
                  </span>
                </div>
                <span className="font-mono text-[#10B981] text-xs">
                  {scanProgress.filesScanned} files scanned · {scanProgress.tracksAdded} tracks added
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#1C222D] overflow-hidden">
                <div
                  className={`h-full bg-[#10B981] transition-all duration-200 ${
                    isScanning ? 'w-2/3 animate-pulse' : 'w-full'
                  }`}
                />
              </div>
              {scanProgress.currentDirectory && (
                <div className="mt-2 font-mono text-[10.5px] text-[#9AA4B2] truncate">
                  Directory: {scanProgress.currentDirectory}
                </div>
              )}
            </div>
          )}

          {/* Next Button */}
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] bg-[#10B981] text-[#0B0D10] font-semibold text-xs hover:bg-[#059669] transition-colors"
            >
              <span>Continue to DAC &amp; Audio Mode</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Choose Output DAC & Audio Mode */}
      {currentStep === 2 && (
        <div className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-6 shadow-xl">
          <div className="pb-4 border-b border-[#2B3342]">
            <h2 className="font-display text-lg font-bold text-[#F2F4F8]">
              Step 2 — Output DAC &amp; Engine Audio Mode
            </h2>
            <p className="text-xs text-[#9AA4B2] mt-0.5">
              Select your audiophile endpoint and sound processing profile. Internal speakers are isolated by default.
            </p>
          </div>

          {/* Devices Grid: USB DACs vs Internal Speakers */}
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#10B981] uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Detected USB Audio DACs ({usbDacs.length})</span>
                </h3>
                <ExplainTooltip termId="udev_hotplug">
                  <span className="text-[11px] text-[#9AA4B2] cursor-help">Auto-switches on plug</span>
                </ExplainTooltip>
              </div>

              {usbDacs.length === 0 ? (
                <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D]/40 p-4 text-center">
                  <p className="text-xs text-[#9AA4B2]">No external USB DAC detected right now.</p>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Connect your USB DAC anytime. AuraHiFi will automatically claim exclusive ALSA ownership.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {usbDacs.map((dev) => (
                    <button
                      key={dev.alsaId}
                      type="button"
                      onClick={() => void selectAudioDevice(dev.alsaId, true)}
                      className={`p-3.5 rounded-[10px] border text-left transition-all ${
                        activeDeviceId === dev.alsaId
                          ? 'border-[#10B981] bg-[#1C222D] shadow-md ring-1 ring-[#10B981]'
                          : 'border-[#2B3342] bg-[#1C222D] hover:border-[#3E495E]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-[#F2F4F8]">{dev.displayName}</span>
                        {activeDeviceId === dev.alsaId && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/20 text-[#10B981]">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-[#9AA4B2] mt-1">{dev.alsaId}</div>
                      <div className="text-[11px] text-[#6B7280] mt-1.5 flex items-center gap-2">
                        <span>Max {Math.max(...dev.supportedSampleRates) / 1000} kHz</span>
                        <span>•</span>
                        <span>DSD: {dev.dsdCapability.toUpperCase()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Internal Speakers (Isolated) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#9AA4B2] uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Internal Audio Endpoints ({internalSpeakers.length})</span>
                </h3>
                <ExplainTooltip termId="bypass_laptop">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30 cursor-help">
                    ISOLATED BY POLICY
                  </span>
                </ExplainTooltip>
              </div>

              <div className="space-y-2">
                {internalSpeakers.map((dev) => (
                  <div
                    key={dev.alsaId}
                    className="flex items-center justify-between p-3 rounded-[8px] border border-[#2B3342] bg-[#1C222D]/30 opacity-75"
                  >
                    <div>
                      <div className="text-xs font-medium text-[#F2F4F8]">{dev.displayName}</div>
                      <div className="font-mono text-[11px] text-[#6B7280]">{dev.alsaId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void selectAudioDevice(dev.alsaId, false)}
                      className="px-2.5 py-1 rounded-[6px] border border-[#2B3342] text-[11px] text-[#9AA4B2] hover:text-[#F2F4F8] hover:border-[#38BDF8]"
                    >
                      Use Anyway
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Audio Mode Selection */}
            <div className="pt-4 border-t border-[#2B3342]">
              <h3 className="text-xs font-semibold text-[#F2F4F8] uppercase tracking-wider mb-3">
                Select Audio Pipeline Mode
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ExplainTooltip termId="bit_perfect">
                  <div
                    onClick={() => setSelectedMode('bit_perfect')}
                    className={`p-4 rounded-[10px] border cursor-pointer transition-all ${
                      selectedMode === 'bit_perfect'
                        ? 'border-[#10B981] bg-[#1C222D] ring-1 ring-[#10B981]'
                        : 'border-[#2B3342] bg-[#1C222D] hover:border-[#3E495E]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                      <span className="font-bold text-xs text-[#F2F4F8]">Bit-Perfect Exclusive (ALSA)</span>
                    </div>
                    <p className="text-[11.5px] text-[#9AA4B2] leading-relaxed">
                      Zero resampling, zero volume dither, PipeWire completely bypassed. Pure byte-for-byte transmission to external DACs.
                    </p>
                  </div>
                </ExplainTooltip>

                <ExplainTooltip termId="spatial_mode">
                  <div
                    onClick={() => setSelectedMode('spatial')}
                    className={`p-4 rounded-[10px] border cursor-pointer transition-all ${
                      selectedMode === 'spatial'
                        ? 'border-[#38BDF8] bg-[#1C222D] ring-1 ring-[#38BDF8]'
                        : 'border-[#2B3342] bg-[#1C222D] hover:border-[#3E495E]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sliders className="h-4 w-4 text-[#38BDF8]" />
                      <span className="font-bold text-xs text-[#F2F4F8]">Spatial DSP &amp; Studio Tuning</span>
                    </div>
                    <p className="text-[11.5px] text-[#9AA4B2] leading-relaxed">
                      64-bit float pipeline with Steam Audio SOFA binauralization, Dolby Atmos channel bed, and AutoEQ headphone correction.
                    </p>
                  </div>
                </ExplainTooltip>
              </div>
            </div>
          </div>

          {/* Stepper Buttons */}
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#2B3342] text-xs text-[#9AA4B2] hover:text-[#F2F4F8] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] bg-[#10B981] text-[#0B0D10] font-semibold text-xs hover:bg-[#059669] transition-colors"
            >
              <span>Continue to Online Features</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Optional Online Features & Finish */}
      {currentStep === 3 && (
        <div className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-6 shadow-xl">
          <div className="pb-4 border-b border-[#2B3342]">
            <h2 className="font-display text-lg font-bold text-[#F2F4F8]">
              Step 3 — Online AI &amp; Metadata (Optional)
            </h2>
            <p className="text-xs text-[#9AA4B2] mt-0.5">
              AuraHiFi is 100% functional offline. You can optionally connect cloud AI or metadata providers anytime.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D] p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-[8px] bg-[#10B981]/10 text-[#10B981]">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#F2F4F8]">Secure Ubuntu Secret Service (GNOME Keyring)</h4>
                  <p className="text-[11.5px] text-[#9AA4B2] mt-1 leading-relaxed">
                    Whenever you add API credentials (Google Gemini, AcoustID, Discogs), they are safely encrypted inside Ubuntu's native keyring—never stored in plain text or localStorage.
                  </p>
                  <div className="mt-2 text-[11px] text-[#38BDF8]">
                    Configure anytime in Settings &rarr; API Keys &amp; Online AI.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[10px] border border-[#2B3342] bg-[#1C222D] p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-[8px] bg-[#38BDF8]/10 text-[#38BDF8]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#F2F4F8]">Local Vector Intelligence Ready</h4>
                  <p className="text-[11.5px] text-[#9AA4B2] mt-1 leading-relaxed">
                    Your music library is automatically analyzed using Bliss acoustic vectors and CLAP audio embeddings inside SQLite sqlite-vec. You can build smart playlists offline with zero cloud dependency.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stepper Buttons */}
          <div className="mt-8 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#2B3342] text-xs text-[#9AA4B2] hover:text-[#F2F4F8] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={() => void handleFinish()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-[8px] bg-[#10B981] text-[#0B0D10] font-bold text-xs hover:bg-[#059669] transition-all shadow-lg shadow-[#10B981]/20"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Finish Setup &amp; Open Library</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

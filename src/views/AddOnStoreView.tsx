import { useState } from 'react';
import {
  FileCode2,
  Globe,
  Lock,
  Package,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useAudioStore } from '../store/useAudioStore';
import { PermissionAuditModal } from '../components/addons/PermissionAuditModal';
import type { AddonCatalogItem } from '../lib/audioBridge';

type StoreTab = 'discover' | 'installed' | 'updates' | 'developer';

export function AddOnStoreView() {
  const addons = useAudioStore((s) => s.addons);
  const installAddon = useAudioStore((s) => s.installAddon);
  const toggleAddonEnabled = useAudioStore((s) => s.toggleAddonEnabled);
  const triggerMusicBrainz503 = useAudioStore((s) => s.triggerMusicBrainz503);

  const [activeTab, setActiveTab] = useState<StoreTab>('discover');
  const [auditTarget, setAuditTarget] = useState<AddonCatalogItem | null>(null);
  const [installing, setInstalling] = useState(false);

  // Developer / Local .wasm sideload inspector state
  const [localWasmPath, setLocalWasmPath] = useState('/home/studio/plugins/custom-scrobbler.wasm');
  const [localHosts, setLocalHosts] = useState('ws.audioscrobbler.com');
  const [localAuditMessage, setLocalAuditMessage] = useState<string | null>(null);

  const updateCount = addons.filter((a) => a.hasUpdate).length;
  const installedCount = addons.filter((a) => a.installed).length;

  const filteredAddons = addons.filter((a) => {
    if (activeTab === 'installed') return a.installed;
    if (activeTab === 'updates') return a.hasUpdate;
    return true;
  });

  const handleApproveInstall = async () => {
    if (!auditTarget) return;
    setInstalling(true);
    await installAddon(auditTarget.id, auditTarget.permissions);
    setInstalling(false);
    setAuditTarget(null);
  };

  const handleLocalWasmCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localWasmPath.trim()) {
      setLocalAuditMessage('Enter a valid local .wasm binary path before running manifest inspection.');
      return;
    }
    setLocalAuditMessage(
      `Unsigned local module inspected (${localWasmPath}): WASI disabled · allowed_hosts=[${
        localHosts.trim() || 'none'
      }] · Requires explicit Developer Mode signature bypass before mounting.`
    );
  };

  const tabs: { id: StoreTab; label: string; count?: number }[] = [
    { id: 'discover', label: 'Discover', count: addons.length },
    { id: 'installed', label: 'Installed', count: installedCount },
    { id: 'updates', label: 'Updates', count: updateCount },
    { id: 'developer', label: 'Developer / Local .wasm' },
  ];

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-[#F2F4F8]">
            Add-On Store
          </h1>
          <p className="mt-1 text-sm text-[#9AA4B2]">
            Capability-audited Extism WebAssembly modules signed with Ed25519 keys.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void triggerMusicBrainz503()}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-3.5 py-2 text-xs font-semibold text-[#F59E0B] hover:border-[#F59E0B]"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Test MusicBrainz HTTP 503 Backoff
        </button>
      </header>

      {/* Extism Deny-by-Default Security Banner */}
      <section
        aria-label="Extism Sandbox Security Policy"
        className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[#10B981]/35 bg-[#14181F] px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]" aria-hidden="true" />
          <div className="text-xs">
            <span className="font-semibold text-[#10B981]">Extism Deny-by-Default Wasmtime Sandbox Active</span>
            <p className="mt-0.5 text-[#9AA4B2]">
              Every add-on runs with WASI disabled, strict memory/CPU caps, explicit domain allow-lists, and zero direct
              access to ALSA hardware rings.
            </p>
          </div>
        </div>
        <span className="mono-telemetry text-[11px] text-[#F2F4F8]">ed25519-dalek · sha2</span>
      </section>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Add-On Store Views"
        className="flex flex-wrap items-center gap-1 rounded-[10px] border border-[#2B3342] bg-[#14181F] p-1 w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 rounded-[6px] px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
              activeTab === tab.id
                ? 'border border-[#2B3342] bg-[#1C222D] text-[#F2F4F8]'
                : 'border border-transparent text-[#9AA4B2] hover:text-[#F2F4F8]'
            }`}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="mono-telemetry text-[11px] text-[#38BDF8]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Developer / Local .wasm Tab */}
      {activeTab === 'developer' ? (
        <section className="rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-[#38BDF8]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
              Local .wasm Module Inspector (Developer Sandbox)
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-[#9AA4B2]">
            Inspect a locally compiled Extism Rust/TinyGo WebAssembly plugin manifest before approving capabilities.
            Unsigned modules display a red warning banner and never receive ambient filesystem permissions.
          </p>

          <form onSubmit={handleLocalWasmCheck} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="local-wasm-path" className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                Local .wasm Binary Path
              </label>
              <input
                id="local-wasm-path"
                type="text"
                value={localWasmPath}
                onChange={(e) => setLocalWasmPath(e.target.value)}
                className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="local-wasm-hosts" className="mb-1.5 block text-xs font-semibold text-[#F2F4F8]">
                Allowed Outbound Hosts (comma-separated)
              </label>
              <input
                id="local-wasm-hosts"
                type="text"
                value={localHosts}
                onChange={(e) => setLocalHosts(e.target.value)}
                className="w-full rounded-[6px] border border-[#2B3342] bg-[#0B0D10] px-3 py-2 mono-telemetry text-xs text-[#F2F4F8] focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-between gap-4 border-t border-[#2B3342] pt-3">
              <span className="mono-telemetry text-[11px] text-[#9AA4B2]">
                WASI: Disabled · Memory Cap: 64 MB · Audio Ring Access: Denied
              </span>
              <button
                type="submit"
                className="rounded-[8px] bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
              >
                Inspect Local Manifest
              </button>
            </div>
          </form>

          {localAuditMessage && (
            <div className="rounded-[8px] border border-[#F59E0B]/45 bg-[#F59E0B]/10 p-3 mono-telemetry text-xs text-[#FDE68A]">
              {localAuditMessage}
            </div>
          )}
        </section>
      ) : (
        /* 6-Card Catalog Grid */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAddons.length === 0 ? (
            <div className="col-span-full rounded-[14px] border border-[#2B3342] bg-[#14181F] p-10 text-center text-sm text-[#9AA4B2]">
              No add-ons match this tab.
            </div>
          ) : (
            filteredAddons.map((addon) => (
              <article
                key={addon.id}
                className="flex flex-col justify-between rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-[#F2F4F8]">
                        {addon.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#9AA4B2]">
                        <span>{addon.author}</span>
                        <span aria-hidden="true">·</span>
                        <span className="mono-telemetry text-[#F2F4F8]">v{addon.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="mono-telemetry">{addon.wasmSizeKb} KB</span>
                      </div>
                    </div>

                    {addon.signatureVerified && (
                      <span
                        title={`Signed by ${addon.signerKeyId}`}
                        className="inline-flex shrink-0 items-center gap-1 mono-telemetry text-[11px] font-medium text-[#10B981]"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Non-Commercial License or Update notice */}
                  {(addon.licenseTag || addon.hasUpdate) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {addon.licenseTag && (
                        <span className="rounded-[6px] bg-[#F59E0B] px-2 py-0.5 mono-telemetry text-[10px] font-semibold text-[#1A1002]">
                          {addon.licenseTag}
                        </span>
                      )}
                      {addon.hasUpdate && (
                        <span className="rounded-[6px] border border-[#38BDF8]/50 bg-[#38BDF8]/12 px-2 py-0.5 mono-telemetry text-[10px] font-semibold text-[#38BDF8]">
                          Update v{addon.latestVersion}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs leading-relaxed text-[#9AA4B2]">{addon.description}</p>

                  <div className="mt-3.5 space-y-1.5 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#9AA4B2]">Sandbox Cap</span>
                      <span className="mono-telemetry text-[#F2F4F8]">
                        {addon.permissions.maxMemoryMb} MB · WASI Off
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[#9AA4B2]">
                        <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Hosts
                      </span>
                      <span className="truncate mono-telemetry text-right text-[#F2F4F8]">
                        {addon.permissions.allowedHosts.length > 0
                          ? addon.permissions.allowedHosts.join(', ')
                          : 'Offline Only'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#2B3342] pt-3.5">
                  <span className="inline-flex items-center gap-1 mono-telemetry text-[11px] text-[#9AA4B2]">
                    <Package className="h-3 w-3" aria-hidden="true" />
                    {addon.installed ? (addon.enabled ? 'Enabled' : 'Disabled') : 'Available'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {addon.installed && addon.hasUpdate && (
                      <button
                        type="button"
                        onClick={() => setAuditTarget(addon)}
                        className="rounded-[6px] bg-[#38BDF8] px-2.5 py-1.5 text-xs font-semibold text-[#06121A] hover:bg-[#7DD3FC]"
                      >
                        Update
                      </button>
                    )}

                    {addon.installed ? (
                      <button
                        type="button"
                        onClick={() => void toggleAddonEnabled(addon.id, !addon.enabled)}
                        className="rounded-[6px] border border-[#2B3342] bg-[#1C222D] px-3 py-1.5 text-xs font-semibold text-[#F2F4F8] hover:border-[#38BDF8]"
                      >
                        {addon.enabled ? 'Disable' : 'Enable'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAuditTarget(addon)}
                        aria-label={`Install ${addon.name}`}
                        className="rounded-[6px] bg-[#10B981] px-3 py-1.5 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      <PermissionAuditModal
        addon={auditTarget}
        installing={installing}
        onCancel={() => setAuditTarget(null)}
        onApprove={() => void handleApproveInstall()}
      />
    </div>
  );
}

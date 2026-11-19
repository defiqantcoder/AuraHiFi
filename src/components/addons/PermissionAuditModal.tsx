import { CheckCircle2, Cpu, Globe, Lock, ShieldCheck, Terminal, X } from 'lucide-react';
import type { AddonCatalogItem } from '../../lib/audioBridge';

interface PermissionAuditModalProps {
  addon: AddonCatalogItem | null;
  installing: boolean;
  onCancel: () => void;
  onApprove: () => void;
}

export function PermissionAuditModal({
  addon,
  installing,
  onCancel,
  onApprove,
}: PermissionAuditModalProps) {
  if (!addon) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Extism Permission Audit for ${addon.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[540px] rounded-[14px] border border-[#2B3342] bg-[#14181F] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#2B3342] pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#10B981]" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold text-[#F2F4F8]">
                Extism Sandbox Permission Audit
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#9AA4B2]">
              {addon.name} · <span className="mono-telemetry text-[#F2F4F8]">v{addon.latestVersion}</span> by{' '}
              {addon.author}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close permission audit modal"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#9AA4B2] hover:bg-[#1C222D] hover:text-[#F2F4F8]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Cryptographic Verification */}
        <div className="mt-4 space-y-2.5 rounded-[10px] border border-[#10B981]/35 bg-[#0B0D10] p-3.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#10B981]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Ed25519 Signature Verified
            </span>
            <span className="mono-telemetry text-[11px] text-[#F2F4F8]">{addon.signerKeyId}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#2B3342] pt-2">
            <span className="text-[#9AA4B2]">SHA-256 Digest</span>
            <span className="truncate mono-telemetry text-[11px] text-[#F2F4F8]">{addon.sha256}</span>
          </div>
        </div>

        {/* Capability Audit Matrix */}
        <div className="mt-3.5 space-y-2.5 rounded-[10px] border border-[#2B3342] bg-[#0B0D10] p-3.5 text-xs">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[#9AA4B2]">
              <Globe className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              Explicit allowed_hosts
            </span>
            <span className="mono-telemetry text-right text-[#F2F4F8]">
              {addon.permissions.allowedHosts.length > 0
                ? addon.permissions.allowedHosts.join(', ')
                : 'None (Strict Offline Sandbox)'}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-[#2B3342] pt-2">
            <span className="inline-flex items-center gap-1.5 text-[#9AA4B2]">
              <Lock className="h-3.5 w-3.5 text-[#10B981]" aria-hidden="true" />
              WASI Filesystem / Shell
            </span>
            <span className="mono-telemetry font-semibold text-[#10B981]">
              {addon.permissions.wasiEnabled ? 'Scoped WASI' : 'WASI Disabled (Zero FS/Exec)'}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-[#2B3342] pt-2">
            <span className="inline-flex items-center gap-1.5 text-[#9AA4B2]">
              <Cpu className="h-3.5 w-3.5 text-[#9AA4B2]" aria-hidden="true" />
              Memory &amp; CPU Budget
            </span>
            <span className="mono-telemetry text-[#F2F4F8]">
              {addon.permissions.maxMemoryMb} MB Max · {addon.permissions.maxCpuMsPerCall} ms/call
            </span>
          </div>

          <div className="border-t border-[#2B3342] pt-2">
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[#9AA4B2]">
              <Terminal className="h-3.5 w-3.5 text-[#38BDF8]" aria-hidden="true" />
              Exposed Host Functions
            </div>
            <ul className="space-y-1 pl-5">
              {addon.permissions.hostFunctions.map((fn) => (
                <li key={fn} className="mono-telemetry text-[11px] text-[#F2F4F8]">
                  {fn}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {addon.licenseTag && (
          <div className="mt-3 rounded-[8px] border border-[#F59E0B]/45 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#FDE68A]">
            License Notice: <span className="font-semibold text-[#F59E0B]">{addon.licenseTag}</span> — personal
            non-commercial home listening only.
          </div>
        )}

        {/* Modal Actions */}
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-[#2B3342] bg-[#1C222D] px-4 py-2 text-xs font-medium text-[#F2F4F8] hover:border-[#3E495E]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={installing}
            onClick={onApprove}
            className="rounded-[8px] bg-[#10B981] px-4 py-2 text-xs font-semibold text-[#06130E] hover:bg-[#34D399]"
          >
            {installing ? 'Verifying & Mounting Wasm...' : 'Approve & Install Add-On'}
          </button>
        </div>
      </div>
    </div>
  );
}

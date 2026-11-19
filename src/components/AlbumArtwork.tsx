import type { TrackSummary } from '../lib/audioBridge';

interface AlbumArtworkProps {
  theme: TrackSummary['artworkTheme'];
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'studio';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AlbumArtworkProps['size']>, string> = {
  sm: 'w-10 h-10 rounded-[6px]',
  md: 'w-[52px] h-[52px] rounded-[8px]',
  lg: 'w-20 h-20 rounded-[10px]',
  xl: 'w-48 h-48 rounded-[12px]',
  studio: 'w-full max-w-[420px] aspect-square rounded-[14px]',
};

/**
 * Bespoke modernist studio-label artwork rendered cleanly as vector SVG
 * (inspired by ECM Records, Blue Note, and studio master tape sleeves).
 * Guarantees crisp HiDPI rendering and zero broken external image requests.
 */
export function AlbumArtwork({ theme, title, size = 'md', className = '' }: AlbumArtworkProps) {
  return (
    <div
      role="img"
      aria-label={`Album artwork for ${title}`}
      className={`relative shrink-0 overflow-hidden border border-[#2B3342] bg-[#14181F] select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {theme === 'emerald-prism' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="ep-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0D161A" />
              <stop offset="100%" stopColor="#14232B" />
            </linearGradient>
            <linearGradient id="ep-accent" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <rect width="160" height="160" fill="url(#ep-bg)" />
          <g stroke="#2B3342" strokeWidth="1" opacity="0.65">
            <line x1="0" y1="32" x2="160" y2="32" />
            <line x1="0" y1="64" x2="160" y2="64" />
            <line x1="0" y1="96" x2="160" y2="96" />
            <line x1="0" y1="128" x2="160" y2="128" />
          </g>
          <polygon points="80,24 134,126 26,126" fill="url(#ep-accent)" />
          <polygon points="80,48 116,118 44,118" fill="none" stroke="#F2F4F8" strokeWidth="1.5" opacity="0.7" />
          <circle cx="80" cy="96" r="14" fill="#0B0D10" stroke="#10B981" strokeWidth="2" />
        </svg>
      )}

      {theme === 'amber-tape' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <rect width="160" height="160" fill="#171410" />
          <circle cx="52" cy="76" r="32" fill="none" stroke="#F59E0B" strokeWidth="2.5" opacity="0.85" />
          <circle cx="52" cy="76" r="11" fill="#0B0D10" stroke="#F2F4F8" strokeWidth="1.5" opacity="0.8" />
          <circle cx="114" cy="76" r="24" fill="none" stroke="#9AA4B2" strokeWidth="2" opacity="0.7" />
          <circle cx="114" cy="76" r="8" fill="#0B0D10" stroke="#F59E0B" strokeWidth="1.5" />
          <path d="M24 128 H136" stroke="#F59E0B" strokeWidth="3" opacity="0.85" />
          <path d="M24 136 H96" stroke="#9AA4B2" strokeWidth="1.5" opacity="0.5" />
        </svg>
      )}

      {theme === 'cobalt' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <defs>
            <radialGradient id="cb-glow" cx="50%" cy="46%" r="55%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0B131E" stopOpacity="1" />
            </radialGradient>
          </defs>
          <rect width="160" height="160" fill="url(#cb-glow)" />
          <circle cx="80" cy="80" r="54" fill="none" stroke="#38BDF8" strokeWidth="1.2" opacity="0.5" />
          <circle cx="80" cy="80" r="38" fill="none" stroke="#38BDF8" strokeWidth="1.6" opacity="0.75" />
          <circle cx="80" cy="80" r="22" fill="none" stroke="#F2F4F8" strokeWidth="1.8" opacity="0.9" />
          <line x1="20" y1="80" x2="140" y2="80" stroke="#38BDF8" strokeWidth="1" opacity="0.45" />
          <line x1="80" y1="20" x2="80" y2="140" stroke="#38BDF8" strokeWidth="1" opacity="0.45" />
          <circle cx="107" cy="53" r="5" fill="#38BDF8" />
          <circle cx="52" cy="102" r="4" fill="#F2F4F8" />
        </svg>
      )}

      {theme === 'obsidian-gold' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <rect width="160" height="160" fill="#121418" />
          <rect x="18" y="18" width="124" height="124" fill="none" stroke="#C8A96A" strokeWidth="1.2" opacity="0.6" />
          <rect x="34" y="42" width="10" height="76" fill="#F2F4F8" opacity="0.9" />
          <rect x="52" y="42" width="10" height="76" fill="#F2F4F8" opacity="0.9" />
          <rect x="70" y="42" width="10" height="76" fill="#C8A96A" opacity="0.95" />
          <rect x="88" y="42" width="10" height="76" fill="#F2F4F8" opacity="0.75" />
          <rect x="106" y="42" width="10" height="76" fill="#F2F4F8" opacity="0.55" />
          <rect x="44" y="42" width="6" height="46" fill="#0B0D10" />
          <rect x="62" y="42" width="6" height="46" fill="#0B0D10" />
          <rect x="98" y="42" width="6" height="46" fill="#0B0D10" />
        </svg>
      )}

      {theme === 'crimson-vinyl' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <rect width="160" height="160" fill="#181115" />
          <circle cx="80" cy="80" r="56" fill="#0D0F13" stroke="#2B3342" strokeWidth="2" />
          <circle cx="80" cy="80" r="44" fill="none" stroke="#9AA4B2" strokeWidth="0.7" opacity="0.35" />
          <circle cx="80" cy="80" r="34" fill="none" stroke="#9AA4B2" strokeWidth="0.7" opacity="0.35" />
          <circle cx="80" cy="80" r="20" fill="#DC2626" opacity="0.88" />
          <circle cx="80" cy="80" r="4.5" fill="#0B0D10" />
        </svg>
      )}

      {theme === 'slate-mono' && (
        <svg viewBox="0 0 160 160" className="h-full w-full" aria-hidden="true">
          <rect width="160" height="160" fill="#11161E" />
          <path d="M16 132 L64 46 L96 46 L144 132 Z" fill="#1C2432" stroke="#38BDF8" strokeWidth="1.5" />
          <line x1="80" y1="46" x2="80" y2="132" stroke="#F2F4F8" strokeWidth="2" strokeDasharray="8 6" />
          <line x1="16" y1="32" x2="144" y2="32" stroke="#9AA4B2" strokeWidth="1" opacity="0.4" />
        </svg>
      )}
    </div>
  );
}

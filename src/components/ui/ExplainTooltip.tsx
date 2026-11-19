import React, { useState, useRef, useEffect } from 'react';
import { getGlossaryEntry, type GlossaryTermId } from '../../lib/plainLanguageGlossary';
import { useAudioStore } from '../../store/useAudioStore';

interface ExplainTooltipProps {
  termId: GlossaryTermId | string;
  customTitle?: string;
  children: React.ReactNode;
  className?: string;
}

export const ExplainTooltip: React.FC<ExplainTooltipProps> = ({
  termId,
  customTitle,
  children,
  className = '',
}) => {
  const hoverHelpEnabled = useAudioStore((s) => s.hoverHelpEnabled ?? true);
  const hoverHelpDelayMs = useAudioStore((s) => s.hoverHelpDelayMs ?? 300);

  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const timerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  const entry = getGlossaryEntry(termId);
  const title = customTitle ?? entry.title;

  const showTooltip = () => {
    if (!hoverHelpEnabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tooltipWidth = 300;
        const tooltipEstimatedHeight = 120;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        let left = rect.left + rect.width / 2 - tooltipWidth / 2;
        // Clamp to viewport
        if (left < 10) left = 10;
        if (left + tooltipWidth > viewportW - 10) left = viewportW - tooltipWidth - 10;

        let top = rect.bottom + 6;
        // Flip upwards if overflowing bottom of viewport
        if (top + tooltipEstimatedHeight > viewportH - 10 && rect.top > tooltipEstimatedHeight + 10) {
          top = rect.top - tooltipEstimatedHeight - 6;
        }

        setCoords({ top, left });
        setVisible(true);
      }
    }, hoverHelpDelayMs);
  };

  const hideTooltip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={containerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hideTooltip();
      }}
      className={`inline-flex items-center ${className}`}
    >
      {children}
      {visible && hoverHelpEnabled && (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 9999,
            width: '300px',
            maxWidth: 'calc(100vw - 20px)',
          }}
          className="pointer-events-none rounded-[8px] border border-[#2B3342] bg-[#1C222D] p-3 text-left shadow-2xl transition-opacity duration-150"
        >
          <span className="block font-display text-[12px] font-bold tracking-tight text-[#10B981]">
            {title}
          </span>
          <span className="mt-1 block text-[11px] leading-snug font-medium text-[#F2F4F8]">
            {entry.whatItIs}
          </span>
          <span className="mt-1.5 block border-t border-[#2B3342] pt-1.5 text-[10.5px] leading-relaxed text-[#9AA4B2]">
            {entry.whatItDoes}
          </span>
        </span>
      )}
    </span>
  );
};

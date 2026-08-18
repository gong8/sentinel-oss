/**
 * Hover Tooltip
 *
 * Shows information about a symbol when hovering over it in the expression editor.
 * Uses a portal to render at body level to avoid overflow clipping.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface HoverTooltipProps {
  /** The name/label to display (e.g., "COMPANY.startTime") */
  label: string;
  /** Description of the symbol */
  description: string;
  /** Type information (e.g., "number", "string") */
  type?: string;
  kind: 'function' | 'field' | 'keyword' | 'variable' | 'namespace';
  /** Position relative to the editor container */
  position: { x: number; y: number };
  /** Reference to the container element for calculating absolute position */
  containerRef: React.RefObject<HTMLElement | null>;
}

/** Get icon for symbol kind - matches autocomplete style */
function getKindIcon(kind: HoverTooltipProps['kind']) {
  switch (kind) {
    case 'function':
      return <span className="text-blue-500">f</span>;
    case 'field':
      return <span className="text-cyan-500">F</span>;
    case 'keyword':
      return <span className="text-purple-500">K</span>;
    case 'variable':
      return <span className="text-amber-500">V</span>;
    case 'namespace':
      return <span className="text-amber-500">N</span>;
    default:
      return null;
  }
}

export function HoverTooltip({
  label,
  description,
  type,
  kind,
  position,
  containerRef,
}: HoverTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const left = containerRect.left + position.x;
    const top = containerRect.top + position.y + 24; // Below cursor

    setAdjustedPosition({ left, top });
  }, [position, containerRef]);

  if (!adjustedPosition) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] w-64 pointer-events-none"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top,
      }}
    >
      <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
        {/* Header with icon, name, and type */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted">
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-mono font-semibold">
            {getKindIcon(kind)}
          </span>
          <span className="flex-1 font-mono text-sm truncate text-foreground">{label}</span>
          {type && (
            <span className="flex-shrink-0 text-xs text-muted-foreground font-mono">{type}</span>
          )}
        </div>

        {/* Description */}
        {description && (
          <div className="px-3 py-2 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

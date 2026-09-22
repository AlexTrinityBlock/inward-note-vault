/**
 * Line-art icons, one component, one source.
 *
 * The template duplicated its brand SVG verbatim in two places — different
 * `clipPath` ids each time — because plain HTML has no way to share a fragment.
 * React does, so this is the single definition.
 *
 * The `clipPath` id must be unique per instance: two elements sharing one id on
 * the same page makes the browser clip both with whichever definition it saw
 * first, which visibly breaks the half-closed eye when several brand marks are
 * on screen at once.
 */
import { useId } from "react";

type BrandProps = {
  /** Rendered size in pixels, applied to both axes. */
  size?: number;
  className?: string;
};

export function BrandMark({ size = 20, className }: BrandProps) {
  const clipId = useId();

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M 11 13.5 C 13.8 12.2, 19.5 12.2, 22.5 13.5 C 19.5 17.5, 13.8 17.5, 11 13.5 Z" />
        </clipPath>
      </defs>
      {/* Fountain pen: nib, body, and the tip */}
      <path d="M 5 3 L 3.2 8.5 L 3.8 11.5 L 3.8 21" />
      <path d="M 5 3 L 6.8 8.5 L 6.2 11.5 L 6.2 21" />
      <line x1="3.8" y1="21" x2="6.2" y2="21" />
      <line x1="5" y1="3" x2="5" y2="8" />
      <circle cx="5" cy="8.6" r="0.6" />
      {/* Half-closed eye, clipped to the upper lid */}
      <g clipPath={`url(#${clipId})`}>
        <circle cx="16.8" cy="14.2" r="3.2" />
        <circle cx="16.8" cy="14.2" r="1.3" />
      </g>
      <path d="M 11 13.5 C 13.8 12.2, 19.5 12.2, 22.5 13.5" />
      <path d="M 11 13.5 C 13.8 17.5, 19.5 17.5, 22.5 13.5" />
    </svg>
  );
}

/** The brand mark in its dark rounded badge, as the design calls for. */
export function Brand({ size = 22 }: { size?: number }) {
  return (
    <div className="brand-icon-large">
      <BrandMark size={size} />
    </div>
  );
}

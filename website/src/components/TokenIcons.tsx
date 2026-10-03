"use client";

interface TokenIconProps {
  size?: number;
  className?: string;
}

/**
 * Custom LLM token icons provided by the user.
 * They use `fill="currentColor"` so the glyph inherits the surrounding text
 * color — which is driven by `--corro-text-muted` (`text-ink-muted`) and
 * therefore adapts automatically to light / dark theme.
 */
export function TokenIcon({ size = 14, className }: TokenIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="26" height="9" x="8" y="16" fill="currentColor" rx="4.5" />
      <rect
        width="18"
        height="9"
        x="38"
        y="16"
        fill="currentColor"
        fillOpacity=".3"
        rx="4.5"
      />
      <rect
        width="14"
        height="9"
        x="8"
        y="28"
        fill="currentColor"
        fillOpacity=".3"
        rx="4.5"
      />
      <rect width="30" height="9" x="26" y="28" fill="currentColor" rx="4.5" />
      <rect width="32" height="9" x="8" y="40" fill="currentColor" rx="4.5" />
      <rect
        width="12"
        height="9"
        x="44"
        y="40"
        fill="currentColor"
        fillOpacity=".3"
        rx="4.5"
      />
    </svg>
  );
}

export function TokenSpeedIcon({ size = 14, className }: TokenIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="currentColor" transform="translate(32 45)">
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          rx="2.5"
          transform="rotate(-180)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          rx="2.5"
          transform="rotate(-150)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          rx="2.5"
          transform="rotate(-120)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          rx="2.5"
          transform="rotate(-90)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          rx="2.5"
          transform="rotate(-60)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          fillOpacity=".3"
          rx="2.5"
          transform="rotate(-30)"
        />
        <rect
          width="9"
          height="5"
          x="19.5"
          y="-2.5"
          fillOpacity=".3"
          rx="2.5"
        />
        <rect width="16" height="6" y="-3" rx="3" transform="rotate(-45)" />
        <circle r="5" />
      </g>
    </svg>
  );
}

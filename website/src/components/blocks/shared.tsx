"use client";

import { memo } from "react";

/**
 * Parse-failure fallback: a plain readable list of the raw lines.
 * Never crashes, never flashes a raw error.
 */
function BlockFallbackInner({ lines }: { lines: string[] }) {
  const shown = lines.filter((l) => l.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="my-1 w-full rounded-xl border border-border bg-surface p-4">
      <ul className="space-y-1 text-footnote leading-relaxed text-ink">
        {shown.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static fallback list, never reordered
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export const BlockFallback = memo(BlockFallbackInner);

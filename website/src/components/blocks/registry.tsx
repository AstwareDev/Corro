"use client";

import { type ComponentType, memo, useMemo } from "react";
import { MapSkeleton, MapView, parseMap } from "./map";
import { hashContent, rawLines } from "./parse";
import { BlockFallback } from "./shared";

export type BlockLang = "map";

interface BlockEntry {
  View: ComponentType<{ raw: string }>;
  Skeleton: ComponentType;
  /** Number of renderable items; 0 means unparseable-or-empty. */
  count: (raw: string) => number;
}

function safeCount(fn: () => number): number {
  try {
    const n = fn();
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Component registry: adding a new block type only requires adding one
 * module and one entry here.
 */
export const BLOCK_REGISTRY: Record<BlockLang, BlockEntry> = {
  map: {
    View: MapView,
    Skeleton: MapSkeleton,
    count: (raw) => safeCount(() => (parseMap(raw) ? 1 : 0)),
  },
};

export function isBlockLang(lang: string): lang is BlockLang {
  return lang in BLOCK_REGISTRY;
}

function BlockHostInner({
  lang,
  raw,
  streaming = false,
}: {
  lang: BlockLang;
  raw: string;
  streaming?: boolean;
}) {
  const entry = BLOCK_REGISTRY[lang];
  // Hash of the content identifies the block across streaming re-renders;
  // equal content never rebuilds or re-animates (see memo below).
  const hash = hashContent(raw);
  const lines = useMemo(() => rawLines(raw), [raw]);
  const count = useMemo(() => entry.count(raw), [entry, raw]);
  const view = useMemo(
    () => <entry.View key={hash} raw={raw} />,
    [entry, raw, hash],
  );

  if (count === 0) {
    if (lines.length === 0) {
      // Empty fence: skeleton while open, nothing once settled.
      if (streaming) return <entry.Skeleton />;
      return null;
    }
    // Parse failure: skeleton while streaming (never flash errors),
    // plain readable list of raw lines once settled (never a crash).
    if (streaming) return <entry.Skeleton />;
    return <BlockFallback lines={lines} />;
  }

  return view;
}

/** Memoized so later streamed text never rebuilds or re-animates a block. */
export const BlockHost = memo(BlockHostInner);

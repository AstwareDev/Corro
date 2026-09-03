"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  type ContextUsage,
  DISPLAY_CONTEXT_MAX,
  USAGE_KINDS,
  type UsageKind,
} from "@/lib/types";

const KIND_LABEL: Record<UsageKind, string> = {
  system: "System prompt",
  tools: "Tool schemas",
  history: "History",
  toolTraffic: "Tool results",
  input: "Input",
  overhead: "Overhead",
};

const KIND_COLOR: Record<UsageKind, string> = {
  system: "var(--corro-ctx-system)",
  tools: "var(--corro-ctx-tools)",
  history: "var(--corro-ctx-history)",
  toolTraffic: "var(--corro-ctx-traffic)",
  input: "var(--corro-ctx-input)",
  overhead: "var(--corro-ctx-overhead)",
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}



function pressureColor(percent: number): string {
  if (percent >= 85) return "var(--corro-contradicted)";
  if (percent >= 60) return "var(--corro-partial)";
  return "var(--corro-corroborated)";
}

function Donut({
  segments,
  size,
  stroke,
}: {
  segments: { key: string; color: string; fraction: number }[];
  size: number;
  stroke: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="presentation"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--corro-border)"
        strokeWidth={stroke}
      />
      {segments.map((seg) => {
        const length = Math.max(0, Math.min(1, seg.fraction)) * circumference;
        const dashOffset = -offset * circumference;
        offset += seg.fraction;
        if (length <= 0) return null;
        return (
          <motion.circle
            key={seg.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            initial={false}
            animate={{
              strokeDasharray: `${length} ${circumference - length}`,
              strokeDashoffset: dashOffset,
            }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </svg>
  );
}

export function ContextMeter({
  context,
  placement = "top",
}: {
  context: ContextUsage;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const above = placement === "top";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const percent = Math.min(100, (context.used / DISPLAY_CONTEXT_MAX) * 100);

  const segments = USAGE_KINDS.map((kind) => ({
    key: kind,
    color: KIND_COLOR[kind],
    fraction: context.breakdown[kind] / DISPLAY_CONTEXT_MAX,
  })).filter((s) => s.fraction > 0);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${formatTokens(context.used)} of ${formatTokens(DISPLAY_CONTEXT_MAX)} tokens used`}
        className="flex items-center gap-1.5 rounded-full px-1.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
      >
        <Donut
          size={14}
          stroke={3}
          segments={[
            {
              key: "used",
              color: pressureColor(percent),
              fraction: percent / 100,
            },
          ]}
        />
        {percent > 0 && percent < 1 ? "<1" : percent.toFixed(0)}%
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: above ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              "absolute left-0 z-30 w-72 overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-xl",
              above
                ? "bottom-full mb-2 origin-bottom-left"
                : "top-full mt-2 origin-top-left",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Donut size={64} stroke={9} segments={segments} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-sm font-semibold leading-none text-ink">
                    {percent.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-ink">Context window</p>
                <p className="mt-1 font-mono text-[11px] text-ink-muted">
                  {formatTokens(context.used)} /{" "}
                  {formatTokens(DISPLAY_CONTEXT_MAX)} used
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                  {formatTokens(
                    Math.max(0, DISPLAY_CONTEXT_MAX - context.used),
                  )}{" "}
                  left
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5 border-t border-border pt-2.5">
              {USAGE_KINDS.map((kind) => (
                <li key={kind} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: KIND_COLOR[kind] }}
                  />
                  <span className="flex-1 text-ink-muted">
                    {KIND_LABEL[kind]}
                  </span>
                  <span className="font-mono text-ink">
                    {formatTokens(context.breakdown[kind])}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

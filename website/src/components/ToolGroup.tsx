"use client";

import { useMotionPreference } from "@/lib/appearance";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { humanizeToolName, type ToolCallUI } from "@/lib/types";
import { BrandStack, brandsOf, presentTool, runKey } from "./tools/registry";
import { ToolResult } from "./tools/ToolResult";

function StatusIcon({ status }: { status: ToolCallUI["status"] }) {
  if (status === "error")
    return (
      <CircleAlert
        size={12}
        className="shrink-0 text-contradicted"
        aria-label="Failed"
      />
    );
  if (status === "done") {
    return <Check size={12} className="shrink-0 text-ink-muted" />;
  }
  return <Loader2 size={12} className="shrink-0 animate-spin text-ink-muted" />;
}

function label(call: ToolCallUI): string {
  if (call.description) return call.description;
  if (call.status === "pending") return "Preparing…";
  return presentTool(call.name).verb || humanizeToolName(call.name);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={13}
      className={clsx(
        "shrink-0 text-ink-muted transition-transform",
        !open && "-rotate-90",
      )}
    />
  );
}

function Expand({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const motionOff = useMotionPreference();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={motionOff ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={
            motionOff
              ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
              : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToolCallRow({ call, nested }: { call: ToolCallUI; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const { Icon, ChildIcon } = presentTool(call.name);
  const Glyph = nested ? ChildIcon : Icon;
  const duration = call.endedAt ? call.endedAt - call.startedAt : undefined;
  const ready = call.status === "done" || call.status === "error";

  return (
    <div>
      <button
        type="button"
        onClick={() => ready && setOpen((o) => !o)}
        disabled={!ready}
        aria-expanded={ready ? open : undefined}
        className={clsx(
          "flex h-7 w-full items-center gap-2 rounded-row px-1.5 text-left transition-colors",
          ready ? "hover:bg-surface-raised" : "cursor-default",
        )}
      >
        {ready ? <Chevron open={open} /> : <span className="w-[13px]" />}
        <Glyph size={14} className="shrink-0 text-ink-muted" />
        <span className="truncate text-caption text-ink-muted">
          {label(call)}
        </span>
        {!ready && <StatusIcon status={call.status} />}
        {duration !== undefined && (
          <span className="shrink-0 font-mono text-caption tabular-nums text-ink-muted">
            {formatDuration(duration, { precise: true })}
          </span>
        )}
      </button>

      <Expand open={open}>
        <div className="ml-[26px] border-l border-border py-2 pl-3 text-caption">
          <ToolResult call={call} />
        </div>
      </Expand>
    </div>
  );
}

function runHeader(calls: ToolCallUI[]): { glyph: ReactNode; label: string } {
  const names = new Set(calls.map((c) => c.name));
  const first = presentTool(calls[0].name);

  if (names.size === 1) {
    return {
      glyph: <first.Icon size={13} className="shrink-0 text-ink-muted" />,
      label: first.groupLabel,
    };
  }

  const brands = brandsOf(calls.map((c) => c.name));
  const family = first.family;

  const branded =
    brands.length > 0 && calls.every((c) => presentTool(c.name).brand);
  const Fallback = family?.Icon ?? first.Icon;

  return {
    glyph: branded ? (
      <BrandStack brands={brands} size={13} />
    ) : (
      <Fallback size={13} className="shrink-0 text-ink-muted" />
    ),
    label: family?.label ?? first.groupLabel,
  };
}

function ToolRun({ calls }: { calls: ToolCallUI[] }) {
  const [open, setOpen] = useState(true);
  const { glyph, label: groupLabel } = runHeader(calls);
  const running = calls.some(
    (c) => c.status === "pending" || c.status === "running",
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-2 rounded-row px-1.5 text-left transition-colors hover:bg-surface-raised"
      >
        <Chevron open={open} />
        {glyph}
        <span className="text-caption text-ink-muted">{groupLabel}</span>
        {running && <StatusIcon status="running" />}
      </button>

      <Expand open={open}>
        <div className="ml-[13px] pl-3">
          {calls.map((call) => (
            <ToolCallRow key={call.localId} call={call} nested />
          ))}
        </div>
      </Expand>
    </div>
  );
}

function toRuns(calls: ToolCallUI[]): ToolCallUI[][] {
  const runs: ToolCallUI[][] = [];
  for (const call of calls) {
    const last = runs[runs.length - 1];
    if (last && runKey(last[0].name) === runKey(call.name)) last.push(call);
    else runs.push([call]);
  }
  return runs;
}

export function ToolGroup({ calls }: { calls: ToolCallUI[] }) {
  return (
    <div className="space-y-0.5">
      {toRuns(calls).map((run) =>
        run.length > 1 ? (
          <ToolRun key={run[0].localId} calls={run} />
        ) : (
          <ToolCallRow key={run[0].localId} call={run[0]} />
        ),
      )}
    </div>
  );
}

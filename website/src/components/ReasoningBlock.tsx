"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useElapsed } from "@/hooks/useElapsed";
import { formatDuration } from "@/lib/format";

export function ReasoningBlock({
  text,
  active,
  startedAt,
  endedAt,
}: {
  text: string;
  active: boolean;
  startedAt: number;
  endedAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const elapsed = formatDuration(useElapsed(startedAt, endedAt));
  if (!text) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 text-left transition-colors hover:bg-surface-raised"
      >
        <ChevronRight
          size={13}
          className={clsx(
            "shrink-0 text-ink-muted transition-transform",
            open && "rotate-90",
          )}
        />
        <BrainCircuit size={13} className="shrink-0 text-ink-muted" />
        <span className="text-xs font-medium text-ink-muted">
          {active ? `Thinking for ${elapsed}…` : `Thought for ${elapsed}`}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="scroll-thin ml-5 max-h-64 overflow-y-auto whitespace-pre-wrap border-l border-border py-1.5 pl-3 font-mono text-[11px] leading-relaxed text-ink-muted">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

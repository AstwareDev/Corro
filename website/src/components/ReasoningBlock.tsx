"use client";

import { useMotionPreference } from "@/lib/appearance";

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
  const motionOff = useMotionPreference();
  const [open, setOpen] = useState(false);
  const elapsed = formatDuration(useElapsed(startedAt, endedAt));
  if (!text) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-2 rounded-row px-1.5 text-left transition-colors hover:bg-surface-raised"
      >
        <ChevronRight
          size={13}
          className={clsx(
            "shrink-0 text-ink-faint transition-transform",
            open && "rotate-90",
          )}
        />
        <BrainCircuit size={14} className="shrink-0 text-ink-muted" />
        <span className="text-caption font-medium text-ink-muted">
          {active ? `Thinking for ${elapsed}…` : `Thought for ${elapsed}`}
        </span>
      </button>
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
            <p className="scroll-thin ml-[26px] max-h-64 overflow-y-auto whitespace-pre-wrap border-l border-border py-1.5 pl-3 text-caption leading-relaxed text-ink-muted">
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

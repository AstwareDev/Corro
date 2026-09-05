"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useElapsed } from "@/hooks/useElapsed";
import { useMotionPreference } from "@/lib/appearance";
import { formatDuration } from "@/lib/format";
import type { ChatMessageUI } from "@/lib/types";
import { CorroMark, CorroMarkLoading } from "./CorroMark";

const EASE = [0.16, 1, 0.3, 1] as const;

export function MessageHeader({
  message,
  parts,
  hasTrace,
  open,
  onToggle,
}: {
  message: ChatMessageUI;
  parts: string[];
  hasTrace: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const motionOff = useMotionPreference();
  const running = Boolean(message.streaming);
  const elapsed = useElapsed(
    message.createdAt,
    running ? undefined : (message.completedAt ?? message.createdAt),
  );

  const timing = running
    ? `Working for ${formatDuration(elapsed)}`
    : elapsed >= 1000
      ? `Worked for ${formatDuration(elapsed)}`
      : null;
  const label = [timing, ...parts].filter(Boolean).join(" · ");

  const content = (
    <>
      <motion.span
        initial={motionOff ? false : { opacity: 0, scale: 0.2, rotate: -35 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={
          motionOff
            ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
            : { duration: 0.4, ease: EASE }
        }
        className="flex"
      >
        {running ? (
          <CorroMarkLoading className="size-5" />
        ) : (
          <CorroMark className="size-5" />
        )}
      </motion.span>
      <motion.span
        initial={motionOff ? false : { opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={
          motionOff
            ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
            : { duration: 0.35, delay: 0.1, ease: EASE }
        }
        className="font-display text-sm font-semibold uppercase leading-none tracking-[-0.02em]"
      >
        Corro
      </motion.span>
      {label && (
        <motion.span
          initial={motionOff ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            motionOff
              ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
              : { duration: 0.3, delay: running ? 0 : 0.1 }
          }
          className="text-xs font-medium tabular-nums text-ink-muted"
        >
          {label}
        </motion.span>
      )}
    </>
  );

  if (!hasTrace) {
    return (
      <div className="flex items-center gap-1.5 py-1.5 text-ink">{content}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={clsx("trace-disclosure text-ink", open && "is-open")}
    >
      {content}
      <ChevronRight
        size={13}
        className={clsx(
          "shrink-0 text-ink-faint transition-transform",
          open && "rotate-90",
        )}
      />
    </button>
  );
}

"use client";

import { useMotionPreference } from "@/lib/appearance";

import { motion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";

export function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  const motionOff = useMotionPreference();
  if (!suggestions.length) return null;

  return (
    <motion.div
      initial={motionOff ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
      }
      className="flex flex-col gap-1.5 pl-[30px]"
    >
      {suggestions.map((text) => (
        <motion.button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          whileTap={motionOff ? undefined : { scale: 0.99 }}
          className="group flex w-fit max-w-full items-center gap-2.5 rounded-full border border-border bg-surface py-2 pl-3 pr-2.5 text-left text-footnote text-ink-muted transition-colors hover:border-border-strong hover:bg-surface-raised hover:text-ink"
          transition={
            motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
          }
        >
          <MessageCircle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{text}</span>
          <ArrowRight
            size={14}
            className="shrink-0 text-ink-faint transition-colors group-hover:text-ink"
          />
        </motion.button>
      ))}
    </motion.div>
  );
}

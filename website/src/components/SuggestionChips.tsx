"use client";

import { motion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";

export function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col"
    >
      {suggestions.map((text, i) => (
        <motion.button
          key={text}
          type="button"
          onClick={() => onSelect(text)}
          whileTap={{ scale: 0.98 }}
          className={`group flex items-center gap-3 py-3.5 text-left text-[15px] text-ink-muted transition-colors hover:text-ink ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <MessageCircle size={16} className="shrink-0" />
          <span className="flex-1 truncate">{text}</span>
          <ArrowRight
            size={16}
            className="shrink-0 text-ink-muted/60 transition-colors group-hover:text-ink"
          />
        </motion.button>
      ))}
    </motion.div>
  );
}

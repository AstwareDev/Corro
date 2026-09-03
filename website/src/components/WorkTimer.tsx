"use client";

import { motion } from "framer-motion";
import { useElapsed } from "@/hooks/useElapsed";
import { formatDuration } from "@/lib/format";
import type { ChatMessageUI } from "@/lib/types";







export function WorkTimer({ message }: { message: ChatMessageUI }) {
  const running = Boolean(message.streaming);
  const elapsed = useElapsed(
    message.createdAt,
    running ? undefined : (message.completedAt ?? message.createdAt),
  );

  if (!running && elapsed < 1000) return null;

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: running ? 0 : 0.1 }}
      className="ml-1 text-xs font-medium tabular-nums text-ink-muted"
    >
      {running
        ? `Working ${formatDuration(elapsed)}`
        : `Worked for ${formatDuration(elapsed)}`}
    </motion.span>
  );
}

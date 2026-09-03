"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSpeechStatus } from "@/lib/api";
import type { ChatMessageUI } from "@/lib/types";
import { SpeakButton } from "./SpeakButton";

function throughput(message: ChatMessageUI): number | undefined {
  const out = message.usage?.outputTokens;
  if (!out || !message.firstTokenAt || !message.completedAt) return undefined;
  const seconds = (message.completedAt - message.firstTokenAt) / 1000;
  if (seconds <= 0) return undefined;
  return out / seconds;
}

export function MessageFooter({ message }: { message: ChatMessageUI }) {
  const [copied, setCopied] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);

  
  
  useEffect(() => {
    let cancelled = false;
    fetchSpeechStatus()
      .then((s) => !cancelled && setSpeechAvailable(s.available))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  
  
  
  
  const tokens = message.usage?.outputTokens;
  const rate = throughput(message);
  if (!tokens && !rate && !message.text) return null;

  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-muted">
      {tokens !== undefined && <span>{tokens.toLocaleString()} Tokens</span>}
      {rate !== undefined && (
        <>
          <span aria-hidden>·</span>
          <span>{rate.toFixed(1)} Tokens/s</span>
        </>
      )}
      {message.text && (
        <>
          <span aria-hidden className="text-border">
            |
          </span>
          <motion.button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(message.text)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            whileTap={{ scale: 0.8 }}
            title="Copy response"
            className="rounded-full p-1.5 transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "check" : "copy"}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          {speechAvailable && <SpeakButton text={message.text} />}
        </>
      )}
    </div>
  );
}

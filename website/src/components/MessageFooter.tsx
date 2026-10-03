"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSpeechStatus } from "@/lib/api";
import { useMotionPreference } from "@/lib/appearance";
import type { ChatMessageUI } from "@/lib/types";
import { SpeakButton } from "./SpeakButton";
import { TokenIcon, TokenSpeedIcon } from "./TokenIcons";

function throughput(message: ChatMessageUI): number | undefined {
  const out = message.usage?.outputTokens;
  if (!out || !message.firstTokenAt || !message.completedAt) return undefined;
  const seconds = (message.completedAt - message.firstTokenAt) / 1000;
  if (seconds <= 0) return undefined;
  return out / seconds;
}

export function MessageFooter({ message }: { message: ChatMessageUI }) {
  const motionOff = useMotionPreference();
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

  const tokens = message.usage?.totalTokens ?? message.usage?.outputTokens;
  const rate = throughput(message);
  if (!tokens && rate === undefined && !message.text) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
      {tokens ? (
        <span
          title={`${tokens.toLocaleString()} total tokens`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/70 px-2 py-[3px] font-mono tabular-nums text-ink-muted"
        >
          <TokenIcon
            size={13}
            className="shrink-0 text-ink-muted dark:text-ink-muted"
          />
          {tokens.toLocaleString()} tok
        </span>
      ) : null}
      {rate !== undefined && (
        <span
          title={`${rate.toFixed(1)} tokens per second`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/70 px-2 py-[3px] font-mono tabular-nums text-ink-muted"
        >
          <TokenSpeedIcon
            size={13}
            className="shrink-0 text-ink-muted dark:text-ink-muted"
          />
          {rate.toFixed(1)} tok/s
        </span>
      )}
      {message.text && (
        <>
          <motion.button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(message.text)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            whileTap={motionOff ? undefined : { scale: 0.8 }}
            title="Copy response"
            aria-label="Copy response"
            className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-surface-raised hover:text-ink"
            transition={
              motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "check" : "copy"}
                initial={motionOff ? false : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={
                  motionOff
                    ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                    : { duration: 0.15 }
                }
                className="flex"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          {speechAvailable && <SpeakButton text={message.text} />}
        </>
      )}
    </div>
  );
}

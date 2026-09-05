"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Check, Copy, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "@/lib/appearance";
import type { ChatMessageUI, MessageBlock } from "@/lib/types";
import { CorroMark, CorroMarkLoading } from "./CorroMark";
import { Markdown } from "./Markdown";
import { MessageFooter } from "./MessageFooter";
import { type TraceBlock, TraceGroup } from "./TraceGroup";
import { WorkTimer } from "./WorkTimer";

const EASE = [0.16, 1, 0.3, 1] as const;

type Segment =
  | { kind: "trace"; id: string; blocks: TraceBlock[] }
  | { kind: "text"; id: string; text: string };

function toSegments(blocks: MessageBlock[]): Segment[] {
  const segments: Segment[] = [];

  for (const block of blocks) {
    if (block.kind === "text") {
      segments.push({ kind: "text", id: block.id, text: block.text });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.kind === "trace") last.blocks.push(block);
    else segments.push({ kind: "trace", id: block.id, blocks: [block] });
  }

  return segments;
}

export function ChatMessage({
  message,
  onEdit,
}: {
  message: ChatMessageUI;
  onEdit?: (id: string, text: string) => void;
}) {
  const motionOff = useMotionPreference();
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <UserMessage message={message} onEdit={onEdit} motionOff={motionOff} />
    );
  }

  const segments = toSegments(message.blocks);
  const lastText = [...segments].reverse().find((s) => s.kind === "text");

  return (
    <motion.div
      initial={motionOff ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : { duration: 0.22, ease: EASE }
      }
      className="flex max-w-[75ch] flex-col gap-2"
    >
      <div className="flex items-center gap-1.5 text-ink">
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
          {message.streaming ? (
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
        <WorkTimer message={message} />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {segments.map((segment) =>
          segment.kind === "trace" ? (
            <TraceGroup
              key={segment.id}
              blocks={segment.blocks}
              streaming={Boolean(message.streaming)}
            />
          ) : (
            <div
              key={segment.id}
              className="stream-text text-prose leading-relaxed text-ink"
            >
              <Markdown
                text={segment.text}
                animateWords={Boolean(
                  message.streaming && segment === lastText,
                )}
              />
              {message.streaming && segment === lastText && (
                <span className="caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle" />
              )}
            </div>
          ),
        )}

        {message.error && (
          <div className="flex items-center gap-1.5 text-footnote text-contradicted">
            <AlertTriangle size={14} className="shrink-0" />
            {message.error}
          </div>
        )}

        {!message.streaming && <MessageFooter message={message} />}
      </div>
    </motion.div>
  );
}

function UserMessage({
  message,
  onEdit,
  motionOff,
}: {
  message: ChatMessageUI;
  onEdit?: (id: string, text: string) => void;
  motionOff: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  function startEdit() {
    setDraft(message.text);
    setEditing(true);
  }

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setEditing(false);
    onEdit?.(message.id, trimmed);
  }

  return (
    <motion.div
      initial={motionOff ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : { duration: 0.22, ease: EASE }
      }
      className="group flex flex-col items-end"
    >
      {editing ? (
        <div className="w-full max-w-[75%] rounded-2xl border border-ink/10 bg-surface-raised p-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            className="w-full resize-none bg-transparent text-body leading-normal text-ink outline-none"
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              title="Cancel"
              aria-label="Cancel edit"
              className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={submit}
              title="Save and resubmit"
              aria-label="Save and resubmit"
              className="flex size-7 items-center justify-center rounded-full bg-ink text-surface transition-colors hover:opacity-80"
            >
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="corro-user-message max-w-[75%] break-words rounded-2xl bg-ink px-4 py-2 text-body leading-normal text-surface">
          <Markdown text={message.text} />
        </div>
      )}

      {!editing && (
        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(message.text)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            title="Copy message"
            aria-label="Copy message"
            className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={startEdit}
              title="Edit and resubmit"
              aria-label="Edit and resubmit"
              className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

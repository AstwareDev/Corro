"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  File as FileIcon,
  Pencil,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/hooks/useTypewriter";
import { resolveAssetUrl } from "@/lib/api";
import { useMotionPreference } from "@/lib/appearance";
import { formatBytes } from "@/lib/format";
import type {
  ChatMessageUI,
  MessageAttachment,
  MessageBlock,
  ToolCallUI,
} from "@/lib/types";
import { Markdown } from "./Markdown";
import { MessageFooter } from "./MessageFooter";
import { MessageHeader } from "./MessageHeader";
import { summarizeTrace, type TraceBlock, TraceGroup } from "./TraceGroup";
import { ToolResult } from "./tools/ToolResult";

const ARTIFACT_TOOLS = new Set(["fs_write", "fs_edit"]);

function artifactsOf(blocks: MessageBlock[]): ToolCallUI[] {
  const out: ToolCallUI[] = [];
  for (const block of blocks) {
    if (block.kind !== "tools") continue;
    for (const call of block.calls) {
      if (call.status !== "done" || !ARTIFACT_TOOLS.has(call.name)) continue;
      const output = call.output as Record<string, unknown> | undefined;
      if (
        typeof output?.viewUrl === "string" &&
        typeof output.path === "string"
      ) {
        out.push(call);
      }
    }
  }
  return out;
}

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
  sessionId,
}: {
  message: ChatMessageUI;
  onEdit?: (id: string, text: string) => void;
  sessionId?: string | null;
}) {
  const motionOff = useMotionPreference();

  if (message.role === "user") {
    return (
      <UserMessage message={message} onEdit={onEdit} motionOff={motionOff} />
    );
  }

  return (
    <AssistantMessage
      message={message}
      motionOff={motionOff}
      sessionId={sessionId}
    />
  );
}

function AssistantMessage({
  message,
  motionOff,
  sessionId,
}: {
  message: ChatMessageUI;
  motionOff: boolean;
  sessionId?: string | null;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [typeOut] = useState(() => Boolean(message.streaming));

  const segments = toSegments(message.blocks);
  const traceBlocks = segments.flatMap((s) =>
    s.kind === "trace" ? s.blocks : [],
  );
  const lastText = [...segments].reverse().find((s) => s.kind === "text");

  const { shown, complete } = useTypewriter(
    lastText?.text ?? "",
    typeOut,
    lastText?.id ?? "",
  );
  const settled = !message.streaming && complete;
  const artifacts = settled ? artifactsOf(message.blocks) : [];

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
      <MessageHeader
        message={message}
        parts={summarizeTrace(traceBlocks)}
        hasTrace={traceBlocks.length > 0}
        open={traceOpen}
        onToggle={() => setTraceOpen((o) => !o)}
      />

      <div className="flex flex-1 flex-col gap-2">
        {segments.map((segment) =>
          segment.kind === "trace" ? (
            <TraceGroup
              key={segment.id}
              blocks={segment.blocks}
              streaming={Boolean(message.streaming)}
              open={traceOpen}
              sessionId={sessionId}
            />
          ) : (
            <div
              key={segment.id}
              className="stream-text text-prose leading-relaxed text-ink"
            >
              <Markdown
                text={segment === lastText ? shown : segment.text}
                animateWords={segment === lastText && !settled}
              />
              {segment === lastText && !settled && (
                <span className="caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle" />
              )}
            </div>
          ),
        )}

        {artifacts.length > 0 && (
          <div className="flex flex-col gap-2">
            {artifacts.map((call) => (
              <ToolResult
                key={call.localId}
                call={call}
                sessionId={sessionId}
              />
            ))}
          </div>
        )}

        {message.error && (
          <div className="flex items-center gap-1.5 text-footnote text-contradicted">
            <AlertTriangle size={14} className="shrink-0" />
            {message.error}
          </div>
        )}

        {settled && <MessageFooter message={message} />}
      </div>
    </motion.div>
  );
}

function MessageAttachments({
  attachments,
}: {
  attachments: MessageAttachment[];
}) {
  return (
    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {attachments.map((a) => {
        const ext = a.name.slice(a.name.lastIndexOf(".") + 1).toUpperCase();
        return (
          <a
            key={a.path}
            href={resolveAssetUrl(a.viewUrl)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${a.name} · ${formatBytes(a.bytes)}`}
            className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-raised"
          >
            {a.kind === "image" ? (
              <img
                src={resolveAssetUrl(a.viewUrl)}
                alt={a.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-ink-muted">
                <FileIcon size={18} />
                {ext && (
                  <span className="text-[9px] font-medium tracking-wide">
                    {ext}
                  </span>
                )}
              </div>
            )}
          </a>
        );
      })}
    </div>
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
      {message.attachments && message.attachments.length > 0 && (
        <MessageAttachments attachments={message.attachments} />
      )}
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

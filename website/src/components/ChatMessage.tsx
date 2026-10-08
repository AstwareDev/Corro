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
import { resolveAssetUrl } from "@/lib/api";
import { useMotionPreference } from "@/lib/appearance";
import { formatBytes } from "@/lib/format";
import {
  type ChatMessageUI,
  liveStepLabel,
  type MessageAttachment,
  type MessageBlock,
  peekWidgetTitle,
  type ToolCallUI,
} from "@/lib/types";
import { Markdown } from "./Markdown";
import { MessageFooter } from "./MessageFooter";
import { MessageHeader } from "./MessageHeader";
import { summarizeTrace, type TraceBlock, TraceGroup } from "./TraceGroup";
import { SkillIcon } from "./tools/registry";
import { ToolResult } from "./tools/ToolResult";
import { Widget } from "./tools/Widget";

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

const LEADING_SKILLS = /^((?:\/[A-Za-z0-9-_]+\s*)+)([\s\S]*)$/;

function splitLeadingSkills(
  text: string,
): { names: string[]; rest: string } | null {
  const match = LEADING_SKILLS.exec(text.trimStart());
  if (!match) return null;
  const names = [...match[1].matchAll(/\/([A-Za-z0-9-_]+)/g)].map((m) => m[1]);
  if (!names.length) return null;
  return { names, rest: (match[2] ?? "").trimStart() };
}

type Segment =
  | { kind: "trace"; id: string; blocks: TraceBlock[] }
  | { kind: "text"; id: string; text: string }
  | { kind: "widget"; id: string; call: ToolCallUI };

function pushTrace(segments: Segment[], id: string, calls: ToolCallUI[]) {
  if (!calls.length) return;
  const block: TraceBlock = { kind: "tools", id, calls };
  const last = segments[segments.length - 1];
  if (last?.kind === "trace") last.blocks.push(block);
  else segments.push({ kind: "trace", id, blocks: [block] });
}

function toSegments(blocks: MessageBlock[]): Segment[] {
  const segments: Segment[] = [];

  for (const block of blocks) {
    if (block.kind === "text") {
      segments.push({ kind: "text", id: block.id, text: block.text });
      continue;
    }
    if (block.kind !== "tools") {
      const last = segments[segments.length - 1];
      if (last?.kind === "trace") last.blocks.push(block);
      else segments.push({ kind: "trace", id: block.id, blocks: [block] });
      continue;
    }
    let rest: ToolCallUI[] = [];
    let part = 0;
    const flush = () => {
      if (!rest.length) return;
      pushTrace(segments, part ? `${block.id}:${part}` : block.id, rest);
      rest = [];
      part++;
    };
    for (const call of block.calls) {
      if (call.name === "show_widget") {
        flush();
        segments.push({ kind: "widget", id: call.localId, call });
      } else {
        rest.push(call);
      }
    }
    flush();
  }

  return segments;
}

function widgetTitle(call: ToolCallUI): string {
  // Every field can be undefined while input streams — use optional chaining,
  // never JSON.parse the partial object (only single-string regex peeks).
  const input = call.input as
    | { title?: unknown; widget_code?: unknown }
    | undefined;
  if (typeof input?.title === "string" && input.title) return input.title;
  return peekWidgetTitle(call.partial) ?? "Interactive visual";
}

function widgetCode(call: ToolCallUI): string | undefined {
  const input = call.input as { widget_code?: unknown } | undefined;
  return typeof input?.widget_code === "string" ? input.widget_code : undefined;
}

function widgetError(call: ToolCallUI): string | undefined {
  if (call.status !== "error") return undefined;
  const out = call.output as { error?: unknown } | undefined;
  return typeof out?.error === "string" ? out.error : "The visual failed";
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
  const streaming = Boolean(message.streaming);
  // While a run is in progress the trace stays open (or the header shows the
  // live step) so tool inputs stream visibly instead of filling a collapsed
  // "Thought for…" at the end. Collapses to the summary when the run ends;
  // the user can still expand it afterward.
  const [traceOpen, setTraceOpen] = useState(() => streaming);
  const [typeOut] = useState(() => streaming);

  useEffect(() => {
    // Auto-expand while streaming, collapse to the summary when the run ends.
    // Runs only on streaming transitions, so a manual toggle mid-run is kept.
    setTraceOpen(streaming);
  }, [streaming]);

  const segments = toSegments(message.blocks);
  const traceBlocks = segments.flatMap((s) =>
    s.kind === "trace" ? s.blocks : [],
  );
  const lastText = [...segments].reverse().find((s) => s.kind === "text");

  const settled = !streaming;
  const artifacts = settled ? artifactsOf(message.blocks) : [];

  // Live current step for the header while streaming: last pending/running
  // call, keyed by toolCallId so parallel calls never overwrite each other.
  const liveCall = streaming
    ? [...traceBlocks]
        .reverse()
        .flatMap((b) => (b.kind === "tools" ? b.calls : []))
        .reverse()
        .find((c) => c.status === "pending" || c.status === "running")
    : undefined;
  const liveLabel = liveCall ? liveStepLabel(liveCall) : undefined;

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
        liveLabel={liveLabel}
        liveStep={streaming ? message.liveStep : undefined}
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
          ) : segment.kind === "widget" ? (
            // Render by state: input-streaming shows partial markup (no
            // scripts), input-available shows running, output-available shows
            // the result, output-error shows the error. Widgets live in the
            // body (toSegments), never inside the collapsed trace, so they
            // stay visible. Keyed by toolCallId (localId) so parallel calls
            // never overwrite each other, including across steps.
            segment.call.status === "error" && !widgetCode(segment.call) ? (
              <div
                key={segment.id}
                role="alert"
                className="rounded-lg bg-contradicted/5 px-2.5 py-2 text-caption text-contradicted"
              >
                {widgetTitle(segment.call)} — {widgetError(segment.call)}
              </div>
            ) : (
              <Widget
                key={segment.id}
                code={widgetCode(segment.call)}
                title={widgetTitle(segment.call)}
                partial={segment.call.partial}
                status={segment.call.status}
              />
            )
          ) : (
            <div
              key={segment.id}
              className="text-prose leading-relaxed text-ink"
            >
              <Markdown
                text={segment.text}
                animateWords={segment === lastText && typeOut && !motionOff}
                streaming={Boolean(message.streaming)}
              />
              {segment === lastText && message.streaming && (
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
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-ink-muted">
                <FileIcon size={18} />
                {ext && (
                  <span className="text-caption font-medium tracking-wide">
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
          {(() => {
            const skills = splitLeadingSkills(message.text);
            if (!skills) return <Markdown text={message.text} />;
            return (
              <div className="skill-body">
                {skills.names.map((name) => (
                  <span key={name} className="corro-skill-chip">
                    <SkillIcon size={11} />/{name}
                  </span>
                ))}
                {skills.rest ? (
                  <>
                    {" "}
                    <div className="skill-rest">
                      <Markdown text={skills.rest} />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })()}
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

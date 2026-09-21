"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, File as FileIcon, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type UploadResult,
  createWorkspaceSession,
  uploadAttachment,
} from "@/lib/api";
import { useMotionPreference } from "@/lib/appearance";
import { formatBytes } from "@/lib/format";
import { compressImage } from "@/lib/image";
import type {
  ContextUsage,
  Effort,
  MessageAttachment,
  ModelDescription,
} from "@/lib/types";
import { ContextMeter } from "./ContextMeter";
import { ModelMenu } from "./ModelMenu";
import { PromptEditor, type PromptEditorHandle } from "./PromptEditor";

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  result?: UploadResult;
  error?: string;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  streaming,
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  modelsLoading,
  context,
  sessionId,
  onSessionCreated,
  menuPlacement = "top",
  placeholder,
}: {
  onSend: (text: string, attachments?: MessageAttachment[]) => void;
  onStop: () => void;
  disabled: boolean;
  streaming: boolean;
  models: ModelDescription[];
  model: string;
  onModelChange: (key: string) => void;
  effort: Effort;
  onEffortChange: (v: Effort) => void;
  modelsLoading: boolean;
  context?: ContextUsage;
  sessionId?: string | null;
  onSessionCreated?: (id: string) => void;
  menuPlacement?: "top" | "bottom";
  placeholder?: string;
}) {
  const motionOff = useMotionPreference();
  const [empty, setEmpty] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const editorRef = useRef<PromptEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeModel = models.find((m) => m.key === model);
  const inputModalities = activeModel?.modalities?.input ?? [];

  // Pending uploads belong to the chat they were uploaded to (each chat has
  // its own private uploads/ folder). If the user switches or starts a new
  // chat before sending, drop them rather than pointing the new chat at
  // another chat's files.
  const prevSessionRef = useRef<string | null | undefined>(sessionId);
  const adoptedSessionRef = useRef<string | null>(sessionId ?? null);
  const ensuringSessionRef = useRef<Promise<string | null> | null>(null);
  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = sessionId;
    if (prev && prev !== sessionId) {
      setAttachments((existing) => {
        for (const a of existing) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        return [];
      });
      adoptedSessionRef.current = sessionId ?? null;
      ensuringSessionRef.current = null;
    } else if (sessionId) {
      adoptedSessionRef.current = sessionId;
    }
  }, [sessionId]);

  function handleFiles(files: File[]) {
    const pending: PendingAttachment[] = files.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined,
      status: "uploading",
    }));
    setAttachments((prev) => [...prev, ...pending]);

    // Uploads live in a single chat's private workspace, never in a shared
    // folder — so all files in this batch must target the same session.
    // If there is no chat yet, create it first and reuse it for every file
    // (concurrent batches share one in-flight creation).
    (async () => {
      let target = sessionId ?? adoptedSessionRef.current;
      if (!target) {
        ensuringSessionRef.current ??= createWorkspaceSession(
          model || undefined,
        )
          .then((created) => {
            adoptedSessionRef.current = created.id;
            onSessionCreated?.(created.id);
            return created.id as string | null;
          })
          .catch(() => null)
          .finally(() => {
            ensuringSessionRef.current = null;
          });
        target = await ensuringSessionRef.current;
      }
      return target;
    })()
      .then((target) => {
        const putOne = (item: PendingAttachment) =>
          (item.file.type.startsWith("image/")
            ? compressImage(item.file)
            : Promise.resolve(item.file)
          )
            .then((toUpload) => uploadAttachment(toUpload, target))
            .then((result) => {
              // Fallback path: session creation failed above, so the backend
              // minted a session for this upload — adopt it for the rest.
              const resolved = result.sessionId ?? result.session;
              if (resolved && !target) {
                target = resolved;
                adoptedSessionRef.current = resolved;
                onSessionCreated?.(resolved);
              }
              setAttachments((prev) =>
                prev.map((a) =>
                  a.id === item.id ? { ...a, status: "done", result } : a,
                ),
              );
            })
            .catch((err) => {
              setAttachments((prev) =>
                prev.map((a) =>
                  a.id === item.id
                    ? {
                        ...a,
                        status: "error",
                        error: err instanceof Error ? err.message : "Upload failed",
                      }
                    : a,
                ),
              );
            });

        // With a known session every file goes to that chat's private
        // uploads/ folder in parallel. Without one, upload sequentially so
        // the whole batch still lands in a single minted session.
        if (target) {
          for (const item of pending) putOne(item);
        } else {
          pending
            .reduce((chain, item) => chain.then(() => putOne(item)), Promise.resolve())
            .catch(() => {});
        }
      })
      .catch(() => {});
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  const uploading = attachments.some((a) => a.status === "uploading");

  function submit() {
    const editor = editorRef.current;
    if (!editor || disabled || uploading) return;
    const markdown = editor.getMarkdown().trim();
    if (!markdown) return;
    const ready: MessageAttachment[] = [];
    for (const a of attachments) {
      if (a.status === "done" && a.result) {
        ready.push({
          name: a.file.name,
          path: a.result.path,
          kind: a.result.kind,
          mime: a.result.mime,
          bytes: a.result.bytes,
          viewUrl: a.result.viewUrl,
        });
      }
    }
    onSend(markdown, ready.length ? ready : undefined);
    editor.clear();
    setEmpty(true);
    for (const a of attachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
    setAttachments([]);
  }

  return (
    <div className="corro-composer relative rounded-[22px] border border-border bg-surface px-4 pb-2 pt-3.5 shadow-[0_1px_2px_rgba(16,16,16,0.04),0_10px_30px_-12px_rgba(16,16,16,0.12)] transition-shadow">
      <AnimatePresence>
        {streaming && (
          <motion.div
            key="thinking-ring"
            aria-hidden
            initial={motionOff ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.35, ease: "easeOut" }
            }
            className="pointer-events-none absolute inset-0"
          >
            <span className="corro-thinking-glow" />
            <span className="corro-thinking-ring" />
          </motion.div>
        )}
      </AnimatePresence>

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => {
            const ext = a.file.name
              .slice(a.file.name.lastIndexOf(".") + 1)
              .toUpperCase();
            const title =
              a.status === "error"
                ? (a.error ?? "Upload failed")
                : `${a.file.name} · ${formatBytes(a.file.size)}`;
            return (
              <div
                key={a.id}
                title={title}
                className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-raised"
              >
                {a.previewUrl ? (
                  <img
                    src={a.previewUrl}
                    alt={a.file.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-ink-muted">
                    <FileIcon size={22} />
                    {ext && (
                      <span className="text-caption font-medium tracking-wide">
                        {ext}
                      </span>
                    )}
                  </div>
                )}

                {a.status === "uploading" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  </div>
                )}
                {a.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-contradicted/40">
                    <X size={18} className="text-white" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  title="Remove"
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleFiles(files);
          e.target.value = "";
        }}
      />

      <PromptEditor
        handleRef={editorRef}
        onSubmit={submit}
        onChange={setEmpty}
        onFiles={handleFiles}
        disabled={disabled}
        placeholder={placeholder}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title={
              inputModalities.includes("image") ||
              inputModalities.includes("video")
                ? "Attach a file, image, or video"
                : "Attach a file"
            }
            className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          >
            <Paperclip size={16} />
          </button>
          {context && (
            <ContextMeter context={context} placement={menuPlacement} />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ModelMenu
            models={models}
            model={model}
            onModelChange={onModelChange}
            effort={effort}
            onEffortChange={onEffortChange}
            loading={modelsLoading}
            placement={menuPlacement}
          />

          <motion.button
            type="button"
            onClick={streaming ? onStop : submit}
            disabled={!streaming && (disabled || empty || uploading)}
            whileTap={motionOff ? undefined : { scale: 0.92 }}
            animate={{
              backgroundColor:
                streaming || !empty
                  ? "var(--corro-accent)"
                  : "var(--color-surface-raised)",
            }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
            }
            className={clsx(
              "relative flex size-8 shrink-0 items-center justify-center rounded-full",
              streaming || !empty ? "text-bg" : "text-ink-muted",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {streaming ? (
                <motion.span
                  key="stop"
                  initial={
                    motionOff ? false : { opacity: 0, scale: 0.4, rotate: -90 }
                  }
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.4, rotate: 90 }}
                  transition={
                    motionOff
                      ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                      : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Square size={12} fill="currentColor" />
                </motion.span>
              ) : (
                <motion.span
                  key="send"
                  initial={
                    motionOff ? false : { opacity: 0, scale: 0.4, rotate: 90 }
                  }
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.4, rotate: -90 }}
                  transition={
                    motionOff
                      ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                      : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
                  }
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <ArrowUp size={15} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </div>
  );
}

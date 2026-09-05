"use client";

import { Check, Copy, RefreshCw, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { fetchWorkspaceFile, type WorkspaceDocument } from "@/lib/api";
import { FileTypeIcon, isMarkdownFile } from "@/lib/fileIcons";
import { onWorkspaceChanged } from "@/lib/workspace-events";
import { Markdown } from "./Markdown";

const control =
  "inline-flex items-center gap-1.5 rounded-row px-2.5 py-1.5 text-caption text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40";

function CodePreview({ content }: { content: string }) {
  return (
    <pre className="min-w-max px-0 py-4 font-mono text-footnote leading-7 text-ink">
      <code>
        {content.split("\n").map((line, index) => (
          <span key={`${index}-${line}`} className="flex min-h-7">
            <span
              aria-hidden="true"
              className="sticky left-0 mr-4 w-12 shrink-0 border-r border-border bg-surface pr-3 text-right text-ink-faint select-none"
            >
              {index + 1}
            </span>
            <span className="whitespace-pre">{line || " "}</span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export function WorkspaceEditor({
  path,
  sessionId,
  onClose,
  download,
}: {
  path: string;
  sessionId?: string | null;
  onClose: () => void;
  download: (content: string) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [file, setFile] = useState<WorkspaceDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const next = await fetchWorkspaceFile(path, sessionId);
      if (id !== request.current) return;
      setFile(next);
      setError(null);
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Could not load file");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [path, sessionId]);
  useEffect(() => {
    dialog.current?.showModal();
    void refresh();
    const unsubscribe = onWorkspaceChanged(sessionId, () => void refresh());
    return () => {
      ++request.current;
      unsubscribe();
    };
  }, [refresh, sessionId]);
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="workspace-file-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto h-[min(88dvh,900px)] w-[min(96vw,1040px)] max-w-none overflow-hidden rounded-popover border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <FileTypeIcon path={path} size={20} />
          <div className="min-w-0 flex-1">
            <h2
              id="workspace-file-title"
              className="truncate font-mono text-footnote font-medium"
            >
              {path.split("/").pop()}
            </h2>
            <p className="truncate font-mono text-caption text-ink-muted">
              {path}
            </p>
          </div>
          <span className="rounded-row bg-surface-raised px-2 py-1 font-mono text-caption text-ink-muted">
            Read only
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file"
            className={control}
          >
            <X size={17} />
          </button>
        </header>
        <div className="flex items-center gap-1 border-b border-border px-3 py-2">
          <span className="mr-auto px-1 font-mono text-caption text-ink-muted">
            Preview
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh file"
            title="Refresh file"
            className={control}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            disabled={!file}
            className={control}
            onClick={async () => {
              if (!file) return;
              try {
                await navigator.clipboard.writeText(file.content);
                setCopied(true);
              } catch {
                setError("Could not copy this file.");
              }
            }}
          >
            <Copy size={14} /> {copied ? "Copied" : "Copy"}
          </button>
          {file && download(file.content)}
        </div>
        {error && (
          <div
            role="alert"
            className="border-b border-border px-4 py-2 text-caption text-contradicted"
          >
            {error}
          </div>
        )}
        <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-surface">
          {!file ? (
            <div
              aria-live="polite"
              className="mx-auto max-w-2xl space-y-4 px-6 py-10"
            >
              {loading ? (
                [1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-4 animate-pulse rounded bg-surface-raised"
                  />
                ))
              ) : (
                <p className="text-footnote text-ink-muted">
                  The file could not be loaded. Use Refresh to try again.
                </p>
              )}
            </div>
          ) : isMarkdownFile(path) ? (
            <div
              id="file-modal-markdown-body"
              className="mx-auto max-w-[76ch] px-6 py-8 text-footnote leading-relaxed"
            >
              <Markdown text={file.content} />
            </div>
          ) : (
            <CodePreview content={file.content} />
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-caption text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Check size={12} /> Read-only preview
          </span>
          {file && (
            <span className="font-mono tabular-nums">
              {file.bytes.toLocaleString()} bytes ·{" "}
              {file.content.split("\n").length} lines ·{" "}
              {new Date(file.modifiedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}

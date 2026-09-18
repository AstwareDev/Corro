"use client";

import { motion } from "framer-motion";
import { Copy, Download, RefreshCw, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchWorkspaceFile,
  type WorkspaceDocument,
  workspaceViewUrl,
} from "@/lib/api";
import { useMotionPreference } from "@/lib/appearance";
import {
  FileTypeBadge,
  isHtmlFile,
  isImageFile,
  isMarkdownFile,
} from "@/lib/fileIcons";
import { onWorkspaceChanged } from "@/lib/workspace-events";
import { Markdown } from "./Markdown";

const EASE = [0.16, 1, 0.3, 1] as const;
const EXIT_MS = 160;

const control =
  "inline-flex items-center gap-1.5 rounded-row px-2.5 py-1.5 text-caption text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40";

function formatModified(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString([], { weekday: "short" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Last modified: ${weekday}, ${time}`;
}

function HtmlPreview({ content, revision }: { content: string; revision: string }) {
  return (
    <iframe
      key={revision}
      srcDoc={content}
      title="HTML preview"
      sandbox="allow-scripts allow-popups allow-modals"
      className="h-full min-h-full w-full border-0 bg-white"
    />
  );
}

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
  const motionOff = useMotionPreference();
  const request = useRef(0);
  const [file, setFile] = useState<WorkspaceDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"preview" | "code">("preview");
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

  const requestClose = useCallback(() => {
    if (motionOff) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose, motionOff]);

  useEffect(() => {
    void refresh();
    const unsubscribe = onWorkspaceChanged(sessionId, () => void refresh());
    return () => {
      ++request.current;
      unsubscribe();
    };
  }, [refresh, sessionId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return createPortal(
    <motion.div
      initial={motionOff ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={
        motionOff ? { duration: 0 } : { duration: EXIT_MS / 1000, ease: EASE }
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-file-title"
        initial={motionOff ? false : { opacity: 0, y: 14, scale: 0.97 }}
        animate={
          closing
            ? { opacity: 0, y: 14, scale: 0.97 }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={
          motionOff ? { duration: 0 } : { duration: EXIT_MS / 1000, ease: EASE }
        }
        className="h-[min(88dvh,900px)] w-[min(96vw,1040px)] max-w-none overflow-hidden rounded-popover border border-border bg-surface text-ink shadow-2xl"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <FileTypeBadge path={path} size={22} />
            <div className="min-w-0 flex-1">
              <h2
                id="workspace-file-title"
                title={path}
                className="truncate font-mono text-footnote font-medium"
              >
                {path.split("/").pop()}
              </h2>
              <p className="truncate text-caption text-ink-muted">
                {file ? formatModified(file.modifiedAt) : " "}
              </p>
            </div>
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
            {isHtmlFile(path) && (
              <div className="flex items-center rounded-row border border-border p-0.5 text-caption">
                <button
                  type="button"
                  onClick={() => setView("preview")}
                  className={`rounded-[calc(var(--radius-row)-2px)] px-2 py-1 transition-colors ${
                    view === "preview"
                      ? "bg-surface-raised text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setView("code")}
                  className={`rounded-[calc(var(--radius-row)-2px)] px-2 py-1 transition-colors ${
                    view === "code"
                      ? "bg-surface-raised text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Code
                </button>
              </div>
            )}
            {!isImageFile(path) && (
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
            )}
            {isImageFile(path) ? (
              <a
                href={workspaceViewUrl(path, sessionId, { download: true })}
                download
                className={control}
              >
                <Download size={14} /> Download
              </a>
            ) : (
              file && download(file.content)
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close file"
              className={control}
            >
              <X size={17} />
            </button>
          </header>
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
            ) : isImageFile(path) ? (
              <div className="flex min-h-full items-center justify-center p-6">
                <img
                  src={workspaceViewUrl(path, sessionId)}
                  alt={path}
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              </div>
            ) : isHtmlFile(path) && view === "preview" ? (
              <HtmlPreview content={file.content} revision={file.revision} />
            ) : (
              <motion.div
                key={path}
                initial={motionOff ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  motionOff ? { duration: 0 } : { duration: 0.18, ease: EASE }
                }
              >
                {isMarkdownFile(path) ? (
                  <div
                    id="file-modal-markdown-body"
                    className="mx-auto max-w-[76ch] px-6 py-8 text-footnote leading-relaxed"
                  >
                    <Markdown text={file.content} />
                  </div>
                ) : (
                  <CodePreview content={file.content} />
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

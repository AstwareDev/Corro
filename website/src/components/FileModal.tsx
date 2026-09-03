"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchWorkspaceFile } from "@/lib/api";
import { FileTypeIcon, isMarkdownFile } from "@/lib/fileIcons";
import { Markdown } from "./Markdown";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function baseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}




function toWordHtml(name: string, html: string): string {
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${name}</title></head><body>${html}</body></html>`;
}

function DownloadMenu({
  path,
  content,
  isMarkdown,
}: {
  path: string;
  content: string;
  isMarkdown: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [googleCopied, setGoogleCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = baseName(path);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function openInGoogleDocs() {
    try {
      await navigator.clipboard.writeText(content);
      setGoogleCopied(true);
      setTimeout(() => setGoogleCopied(false), 1500);
    } catch {
      
    }
    window.open(
      "https://docs.google.com/document/create",
      "_blank",
      "noopener,noreferrer",
    );
    setOpen(false);
  }

  const options = isMarkdown
    ? [
        {
          key: "md",
          label: "Markdown (.md)",
          onClick: () => {
            download(`${name}.md`, content, "text/markdown");
            setOpen(false);
          },
        },
        {
          key: "txt",
          label: "Plain text (.txt)",
          onClick: () => {
            download(`${name}.txt`, content, "text/plain");
            setOpen(false);
          },
        },
        {
          key: "doc",
          label: "Word document (.doc)",
          onClick: () => {
            const rendered = document.getElementById(
              "file-modal-markdown-body",
            );
            const html = toWordHtml(name, rendered?.innerHTML ?? content);
            download(`${name}.doc`, html, "application/msword");
            setOpen(false);
          },
        },
        {
          key: "gdocs",
          label: googleCopied
            ? "Copied — opening Google Docs…"
            : "Google Docs (copy + open)",
          icon: ExternalLink,
          onClick: openInGoogleDocs,
        },
      ]
    : [
        {
          key: "raw",
          label: "Download file",
          onClick: () => {
            const ext = path.includes(".")
              ? path.slice(path.lastIndexOf("."))
              : "";
            download(`${name}${ext}`, content, "text/plain");
            setOpen(false);
          },
        },
      ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
      >
        <Download size={13} />
        Download
        <ChevronDown
          size={12}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full z-10 mt-1.5 w-60 origin-top-right overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl"
          >
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={opt.onClick}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-raised"
              >
                {opt.icon ? (
                  <opt.icon size={13} className="shrink-0 text-ink-muted" />
                ) : null}
                <span className="flex-1">{opt.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FileModal({
  path,
  sessionId,
  onClose,
}: {
  path: string;
  sessionId?: string | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const markdown = isMarkdownFile(path);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    fetchWorkspaceFile(path, sessionId)
      .then((f) => !cancelled && setContent(f.content))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [path, sessionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      
    }
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-[min(85vh,780px)] w-[min(90vw,860px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        >
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <FileTypeIcon path={path} size={16} />
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">
              {path}
            </span>
            <button
              type="button"
              onClick={copy}
              disabled={!content}
              title="Copy contents"
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40"
            >
              {copied ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            {content && (
              <DownloadMenu
                path={path}
                content={content}
                isMarkdown={markdown}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>

          <div className="scroll-thin flex-1 overflow-auto">
            {error ? (
              <p className="px-4 py-3 text-[12px] text-contradicted">{error}</p>
            ) : content === null ? (
              <p className="px-4 py-3 text-[12px] text-ink-muted">Loading…</p>
            ) : markdown ? (
              <div
                id="file-modal-markdown-body"
                className="px-5 py-4 text-[13.5px] leading-relaxed text-ink"
              >
                <Markdown text={content} />
              </div>
            ) : (
              <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink">
                {content}
              </pre>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-ink-muted">
            <span>{content !== null ? formatBytes(content.length) : ""}</span>
            <span>{markdown ? "Markdown" : "Text"}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

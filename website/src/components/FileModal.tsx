"use client";

import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isMarkdownFile } from "@/lib/fileIcons";
import { WorkspaceEditor } from "./WorkspaceEditor";

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DownloadMenu({ path, content }: { path: string; content: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const filename = path.split("/").pop() ?? path;
  const name = filename.replace(/\.[^.]+$/, "");
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item =
    "block w-full rounded-row px-3 py-2 text-left text-caption text-ink hover:bg-surface-raised";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-row border border-border px-2.5 py-1.5 text-caption text-ink-muted hover:bg-surface-raised"
      >
        <Download size={13} />
        Download
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="popover-material absolute right-0 top-full z-10 mt-1 w-60 rounded-popover border border-border bg-surface p-1">
          <button
            type="button"
            className={item}
            onClick={() => {
              downloadFile(
                filename,
                content,
                isMarkdownFile(path)
                  ? "text/markdown;charset=utf-8"
                  : "text/plain;charset=utf-8",
              );
              setOpen(false);
            }}
          >
            Original file
          </button>
          {isMarkdownFile(path) && (
            <>
              <button
                type="button"
                className={item}
                onClick={() => {
                  downloadFile(
                    `${name}.txt`,
                    content,
                    "text/plain;charset=utf-8",
                  );
                  setOpen(false);
                }}
              >
                Plain text (.txt)
              </button>
              <button
                type="button"
                className={item}
                onClick={() => {
                  const escapeHtml = (s: string) =>
                    s
                      .replaceAll("&", "&amp;")
                      .replaceAll("<", "&lt;")
                      .replaceAll(">", "&gt;")
                      .replaceAll('"', "&quot;");
                  const html =
                    document.getElementById("file-modal-markdown-body")
                      ?.innerHTML ?? `<pre>${escapeHtml(content)}</pre>`;
                  downloadFile(
                    `${name}.doc`,
                    `<!DOCTYPE html><html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title></head><body>${html}</body></html>`,
                    "application/msword",
                  );
                  setOpen(false);
                }}
              >
                Word document (.doc)
              </button>
              <button
                type="button"
                className={item}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(content);
                    window.open(
                      "https://docs.google.com/document/create",
                      "_blank",
                      "noopener,noreferrer",
                    );
                    setOpen(false);
                  } catch {
                    setError(
                      "Could not copy the file content for Google Docs.",
                    );
                  }
                }}
              >
                Google Docs (copy + open)
              </button>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="px-3 py-2 text-caption text-contradicted"
            >
              {error}
            </p>
          )}
        </div>
      )}
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
  return (
    <WorkspaceEditor
      key={`${path}:${sessionId}`}
      path={path}
      sessionId={sessionId}
      onClose={onClose}
      download={(content) => <DownloadMenu path={path} content={content} />}
    />
  );
}

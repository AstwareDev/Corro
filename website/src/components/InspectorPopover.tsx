"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFile } from "@/lib/api";
import type { Source } from "@/lib/sources";
import { FileModal } from "./FileModal";
import { buildTree, FileTreeView } from "./SidePanel";
import { Favicon } from "./tools/Favicon";
import { WorkspaceEmptyArt } from "./WorkspaceEmptyArt";

export function InspectorPopover({
  open,
  onClose,
  sources,
  files,
  filesError,
  filesLoading,
  sessionId,
  onFilesChanged,
}: {
  open: boolean;
  onClose: () => void;
  sources: Source[];
  files: WorkspaceFile[];
  filesError?: string | null;
  filesLoading?: boolean;
  sessionId?: string | null;
  onFilesChanged: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const visibleFiles = useMemo(
    () => [...files].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    [files],
  );
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !preview) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, preview]);

  if (!open) return null;

  const showFiles = visibleFiles.length > 0 || filesLoading || !!filesError;
  const showSources = sources.length > 0;
  const nothingYet = !showFiles && !showSources;

  return (
    <>
      <div
        role="dialog"
        aria-label="Sources and workspace"
        className="glass panel-shadow absolute right-3 top-14 z-30 max-h-[420px] w-80 overflow-y-auto rounded-panel border border-border bg-surface p-3 scroll-thin"
      >
        {showFiles && (
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-caption font-medium text-ink-muted">
                Files
                {files.length > 0 && (
                  <span className="ml-1 font-mono tabular-nums">
                    {files.length}
                  </span>
                )}
              </h3>
              <button
                type="button"
                title="Refresh files"
                aria-label="Refresh files"
                disabled={filesLoading}
                onClick={onFilesChanged}
                className="rounded-row p-1 text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
              >
                <RefreshCw
                  size={13}
                  className={filesLoading ? "animate-spin" : ""}
                />
              </button>
            </div>
            {filesError && (
              <p role="alert" className="px-1 text-caption text-contradicted">
                {filesError}
              </p>
            )}
            {visibleFiles.length > 0 && (
              <FileTreeView
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                onToggle={toggleFolder}
                onOpen={setPreview}
              />
            )}
          </section>
        )}

        {showFiles && showSources && (
          <div className="my-3 border-t border-border" />
        )}

        {showSources && (
          <section className="space-y-2">
            <h3 className="px-1 text-caption font-medium text-ink-muted">
              Sources
              <span className="ml-1 font-mono tabular-nums">
                {sources.length}
              </span>
            </h3>
            <ul className="space-y-0.5">
              {sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-row px-2 py-1.5 transition-colors hover:bg-surface-raised"
                  >
                    <span className="mt-0.5 shrink-0">
                      <Favicon host={s.host} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-footnote text-ink">
                        {s.title}
                      </span>
                      <span className="block truncate text-caption text-ink-muted">
                        {s.host}
                      </span>
                    </span>
                    {s.hits > 1 && (
                      <span className="mt-0.5 shrink-0 font-mono text-caption tabular-nums text-ink-muted">
                        ×{s.hits}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nothingYet && (
          <div className="px-2 py-4 text-center">
            <WorkspaceEmptyArt className="mx-auto mb-3 h-auto w-full max-w-[260px]" />
            <p className="text-caption leading-relaxed text-ink-muted">
              Nothing here yet. Ask Corro to research something or create a
              file.
            </p>
          </div>
        )}
      </div>

      {preview && (
        <FileModal
          path={preview}
          sessionId={sessionId}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

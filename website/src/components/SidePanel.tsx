"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, PanelRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteWorkspaceFile, type WorkspaceFile } from "@/lib/api";
import { FileTypeIcon } from "@/lib/fileIcons";
import type { Source } from "@/lib/sources";
import { FileModal } from "./FileModal";
import { Favicon } from "./tools/Favicon";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-raised"
      >
        <ChevronDown
          size={13}
          className={clsx(
            "shrink-0 text-ink-muted transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="flex-1 text-[13px] font-medium text-ink">{title}</span>
        <span className="font-mono text-[10px] text-ink-muted">{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SidePanel({
  sources,
  files,
  sessionId,
  onFilesChanged,
}: {
  sources: Source[];
  files: WorkspaceFile[];
  sessionId?: string | null;
  onFilesChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const total = sources.length + files.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Sources and workspace"
        className="fixed right-4 top-4 z-30 flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-ink-muted shadow-sm transition-colors hover:text-ink"
      >
        <PanelRight size={15} />
        {total > 0 && (
          <span className="font-mono text-[11px] text-ink">{total}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-4 top-16 z-30 flex max-h-[calc(100vh-6rem)] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
          >
            <div className="relative flex-1 overflow-y-auto scroll-thin">
              <Section title="Sources" count={sources.length}>
                {sources.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-ink-muted">
                    Pages the agent reads will collect here.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {sources.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-raised"
                        >
                          <span className="mt-0.5">
                            <Favicon host={s.host} size={13} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-ink">
                              {s.title}
                            </span>
                            <span className="block truncate font-mono text-[10px] text-ink-muted">
                              {s.host}
                            </span>
                          </span>
                          {s.hits > 1 && (
                            <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-muted">
                              ×{s.hits}
                            </span>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Workspace" count={files.length}>
                {files.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-ink-muted">
                    Files the agent writes will appear here.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {files.map((f) => (
                      <li
                        key={f.path}
                        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-raised"
                      >
                        <FileTypeIcon path={f.path} size={13} />
                        <button
                          type="button"
                          onClick={() => setPreview(f.path)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate font-mono text-[11px] text-ink">
                            {f.path}
                          </span>
                          <span className="block text-[10px] text-ink-muted">
                            {formatBytes(f.bytes)}
                          </span>
                        </button>
                        <button
                          type="button"
                          title={`Delete ${f.path}`}
                          onClick={async () => {
                            await deleteWorkspaceFile(f.path, sessionId);
                            onFilesChanged();
                          }}
                          className="shrink-0 rounded-md p-1 text-ink-muted opacity-0 transition-opacity hover:text-contradicted group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

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

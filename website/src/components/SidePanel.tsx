"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Folder, FolderOpen, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceFile } from "@/lib/api";
import { useAppearance, useMotionPreference } from "@/lib/appearance";
import { FileTypeBadge } from "@/lib/fileIcons";
import type { Source } from "@/lib/sources";
import { BrowserPanel } from "./BrowserPanel";
import { FileModal } from "./FileModal";
import { Favicon } from "./tools/Favicon";

const EASE = [0.16, 1, 0.3, 1] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Tab = "sources" | "files" | "browser";

function Segmented({
  tab,
  onChange,
  counts,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  counts: Record<Tab, number>;
}) {
  const motionOff = useMotionPreference();
  const items: { key: Tab; label: string }[] = [
    { key: "sources", label: "Sources" },
    { key: "files", label: "Files" },
    { key: "browser", label: "Browser" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Inspector"
      className="flex gap-0.5 rounded-row bg-hairline p-0.5"
    >
      {items.map((item) => {
        const selected = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={clsx(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-[5px] py-1 text-caption transition-colors",
              selected ? "text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {selected && (
              <motion.span
                layoutId="inspector-segment"
                transition={
                  motionOff
                    ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                    : { duration: 0.22, ease: EASE }
                }
                className="absolute inset-0 rounded-[5px] bg-surface shadow-[0_1px_2px_rgba(18,26,29,0.08)]"
              />
            )}
            <span className="relative font-medium">{item.label}</span>
            {counts[item.key] > 0 && (
              <span className="relative font-mono tabular-nums text-ink-muted">
                {counts[item.key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}
interface FileNode {
  type: "file";
  name: string;
  file: WorkspaceFile;
}
export type TreeNode = FolderNode | FileNode;

export function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, FolderNode>();

  for (const file of files) {
    const parts = file.path.split("/");
    let siblings = root;
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { type: "folder", name: parts[i], path: prefix, children: [] };
        folders.set(prefix, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    }
    siblings.push({ type: "file", name: parts[parts.length - 1], file });
  }
  return root;
}

export function FileTreeView({
  nodes,
  depth,
  collapsed,
  onToggle,
  onOpen,
}: {
  nodes: TreeNode[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onToggle(node.path)}
              title={node.path}
              style={{ paddingLeft: 8 + depth * 14 }}
              className="flex w-full items-center gap-1.5 rounded-row py-1.5 pr-2 text-left transition-colors hover:bg-surface-raised"
            >
              <ChevronRight
                size={12}
                className={clsx(
                  "shrink-0 text-ink-muted transition-transform",
                  !collapsed.has(node.path) && "rotate-90",
                )}
              />
              {collapsed.has(node.path) ? (
                <Folder size={14} className="shrink-0 text-ink-muted" />
              ) : (
                <FolderOpen size={14} className="shrink-0 text-ink-muted" />
              )}
              <span className="truncate font-mono text-caption text-ink">
                {node.name}
              </span>
            </button>
            {!collapsed.has(node.path) && (
              <FileTreeView
                nodes={node.children}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            )}
          </li>
        ) : (
          <li
            key={node.file.path}
            className="group flex flex-wrap items-center gap-2 rounded-row py-2 pr-2 transition-colors hover:bg-surface-raised"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <FileTypeBadge path={node.file.path} size={16} />
            <button
              type="button"
              onClick={() => onOpen(node.file.path)}
              title={node.file.path}
              className="min-w-0 flex-1 rounded-row text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-muted/30"
            >
              <span className="block truncate font-mono text-caption text-ink">
                {node.name}
              </span>
              <span className="block text-caption tabular-nums text-ink-muted">
                {formatBytes(node.file.bytes)} ·{" "}
                <time
                  dateTime={node.file.modifiedAt}
                  title={new Date(node.file.modifiedAt).toLocaleString()}
                >
                  {new Date(node.file.modifiedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-6 text-center text-caption leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

export function SidePanel({
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
  const motionOff = useMotionPreference();
  const reduce = useMotionPreference();
  const { layout } = useAppearance();
  const [tab, setTab] = useState<Tab>("sources");
  const [pageCount, setPageCount] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [sort, setSort] = useState<"name" | "recent">("recent");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const visibleFiles = useMemo(
    () =>
      [...files].sort((a, b) =>
        sort === "recent"
          ? b.modifiedAt.localeCompare(a.modifiedAt)
          : a.path.localeCompare(b.path),
      ),
    [files, sort],
  );
  const tree = useMemo(() => buildTree(visibleFiles), [visibleFiles]);
  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: session identity intentionally resets local UI.
  useEffect(() => {
    setPreview(null);
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !preview) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, preview]);

  return (
    <>
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            aria-label="Sources and workspace"
            initial={
              motionOff ? false : reduce ? false : { width: 0, opacity: 0 }
            }
            animate={{ width: 264, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.28, ease: EASE }
            }
            className={clsx(
              "flex shrink-0 flex-col overflow-hidden max-[700px]:absolute max-[700px]:inset-y-2 max-[700px]:right-2 max-[700px]:z-40 max-[700px]:shadow-lg",
              layout !== "borderless"
                ? "glass panel-shadow rounded-panel"
                : "border-l border-border bg-surface",
            )}
          >
            <div className="flex w-[264px] flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 pb-2 pt-2.5">
                <div className="min-w-0 flex-1">
                  <Segmented
                    tab={tab}
                    onChange={setTab}
                    counts={{
                      sources: sources.length,
                      files: files.length,
                      browser: pageCount,
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  title="Close inspector"
                  aria-label="Close inspector"
                  className="flex size-7 shrink-0 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
                >
                  <X size={15} />
                </button>
              </div>

              {tab === "files" && (
                <div className="space-y-2 border-b border-border px-3 pb-3">
                  <div className="flex items-center justify-between gap-2 text-caption text-ink-muted">
                    <span>Session workspace</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Refresh files"
                        aria-label="Refresh files"
                        disabled={filesLoading}
                        onClick={onFilesChanged}
                        className="rounded-row p-1.5 hover:bg-surface-raised hover:text-ink disabled:opacity-40"
                      >
                        <RefreshCw
                          size={14}
                          className={filesLoading ? "animate-spin" : ""}
                        />
                      </button>
                    </div>
                  </div>
                  <select
                    aria-label="Sort files"
                    value={sort}
                    onChange={(e) =>
                      setSort(e.target.value as "name" | "recent")
                    }
                    className="w-full rounded-row bg-surface text-caption text-ink-muted"
                  >
                    <option value="recent">Recently updated</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </div>
              )}
              {tab === "files" && filesError && (
                <p
                  role="alert"
                  className="px-3 py-2 text-caption text-contradicted"
                >
                  {filesError}
                </p>
              )}
              <div className="scroll-thin flex-1 overflow-y-auto px-1.5 pb-2">
                <div className={tab === "browser" ? undefined : "hidden"}>
                  <BrowserPanel
                    sessionId={sessionId}
                    active={open && tab === "browser"}
                    onCount={setPageCount}
                  />
                </div>
                {tab === "browser" ? null : tab === "sources" ? (
                  sources.length === 0 ? (
                    <Empty>Pages Corro reads will collect here.</Empty>
                  ) : (
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
                  )
                ) : filesLoading && files.length === 0 ? (
                  <div aria-live="polite" className="space-y-3 p-3">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="h-9 animate-pulse rounded-row bg-surface-raised"
                      />
                    ))}
                  </div>
                ) : visibleFiles.length === 0 ? (
                  <Empty>
                    <FolderOpen size={24} className="mx-auto mb-3 opacity-50" />
                    No files in this workspace yet.
                  </Empty>
                ) : (
                  <FileTreeView
                    nodes={tree}
                    depth={0}
                    collapsed={collapsed}
                    onToggle={toggleFolder}
                    onOpen={setPreview}
                  />
                )}
              </div>
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

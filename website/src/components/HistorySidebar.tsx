"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  MoreHorizontal,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteSession,
  fetchSessions,
  getStoredDevice,
  pinSession,
  renameSession,
  type SessionSummary,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { CorroMark } from "./CorroMark";
import { CorroWordmark } from "./CorroWordmark";

const COLLAPSE_KEY = "corro_sidebar_collapsed";

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}



function groupSessions(
  sessions: SessionSummary[],
): Array<{ label: string; items: SessionSummary[] }> {
  const pinned = sessions.filter((s) => s.pinned);
  const rest = sessions.filter((s) => !s.pinned);

  const today = startOfDay(Date.now());
  const buckets = {
    today: [] as SessionSummary[],
    yesterday: [] as SessionSummary[],
    week: [] as SessionSummary[],
    month: [] as SessionSummary[],
    older: [] as SessionSummary[],
  };

  for (const s of rest) {
    const day = startOfDay(Date.parse(s.updatedAt));
    const diffDays = Math.round((today - day) / 86_400_000);
    if (diffDays <= 0) buckets.today.push(s);
    else if (diffDays === 1) buckets.yesterday.push(s);
    else if (diffDays <= 7) buckets.week.push(s);
    else if (diffDays <= 30) buckets.month.push(s);
    else buckets.older.push(s);
  }

  const groups: Array<{ label: string; items: SessionSummary[] }> = [];
  if (pinned.length) groups.push({ label: "Pinned", items: pinned });
  if (buckets.today.length) groups.push({ label: "Today", items: buckets.today });
  if (buckets.yesterday.length)
    groups.push({ label: "Yesterday", items: buckets.yesterday });
  if (buckets.week.length)
    groups.push({ label: "Previous 7 days", items: buckets.week });
  if (buckets.month.length)
    groups.push({ label: "Previous 30 days", items: buckets.month });
  if (buckets.older.length) groups.push({ label: "Older", items: buckets.older });
  return groups;
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink",
          open && "bg-surface-raised text-ink",
        )}
      >
        <Settings size={14} className="shrink-0" />
        <span>Settings</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <div className="border-b border-border px-3 py-2.5">
              <span className="text-[12px] font-medium text-ink">Settings</span>
            </div>
            <div className="space-y-1 p-3 text-[11px] text-ink-muted">
              <div className="flex items-center justify-between">
                <span>Device</span>
                <span className="font-mono text-[10px] text-ink">
                  {getStoredDevice()?.slice(0, 12) ?? "—"}
                </span>
              </div>
              <p className="pt-1 text-[10px] leading-relaxed">
                Sessions and workspace files live on this device only.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SessionMenu({
  session,
  onRename,
  onPin,
  onDelete,
}: {
  session: SessionSummary;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title="More options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={clsx(
          "rounded-md p-1 text-ink-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100",
          open && "opacity-100 text-ink",
        )}
      >
        <MoreHorizontal size={13} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-raised"
            >
              <Pencil size={12} />
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPin();
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-raised"
            >
              {session.pinned ? <PinOff size={12} /> : <Pin size={12} />}
              {session.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-contradicted transition-colors hover:bg-surface-raised"
            >
              <Trash2 size={12} />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchModal({
  sessions,
  onSelect,
  onClose,
}: {
  sessions: SessionSummary[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={14} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        <div className="scroll-thin max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-[12px] text-ink-muted">
              No conversations found.
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelect(s.id);
                  onClose();
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-raised"
              >
                <span className="truncate text-[12.5px] text-ink">{s.title}</span>
                <span className="shrink-0 text-[10px] text-ink-muted">
                  {formatRelativeTime(s.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function HistorySidebar({
  activeId,
  refreshKey,
  onSelect,
  onNewChat,
}: {
  activeId: string | null;
  
  refreshKey: number;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((data) => !cancelled && setSessions(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function commitRename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
    try {
      await renameSession(id, title);
    } catch {
      
    }
  }

  async function handleTogglePin(session: SessionSummary) {
    const next = !session.pinned;
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, pinned: next } : s)),
    );
    try {
      await pinSession(session.id, next);
    } catch {
      
    }
  }

  async function handleDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSession(id);
    } catch {
      
    }
    if (id === activeId) onNewChat();
  }

  const groups = useMemo(() => groupSessions(sessions), [sessions]);

  
  if (!hydrated) {
    return <div className="w-64 shrink-0" />;
  }

  return (
    <aside
      className={clsx(
        "flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200",
        collapsed ? "w-14" : "w-64",
      )}
    >
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-4",
          collapsed && "flex-col",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-ink">
          <CorroMark className="size-5 shrink-0" />
          {!collapsed && <CorroWordmark className="truncate text-[15px]" />}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          {collapsed ? (
            <PanelLeftOpen size={15} />
          ) : (
            <PanelLeftClose size={15} />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          title="New task"
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          <Plus size={15} className="shrink-0" />
          {!collapsed && <span>New Task</span>}
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          title="Search conversations"
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink",
            collapsed && "justify-center px-0",
          )}
        >
          <Search size={15} className="shrink-0" />
          {!collapsed && <span>Search</span>}
        </button>
      </div>

      {!collapsed && (
        <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <p className="px-2 py-2 text-[11px] text-ink-muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-ink-muted">
              Past conversations will collect here.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-2 pb-1 pt-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    {group.label}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((s) => (
                    <li
                      key={s.id}
                      className={clsx(
                        "group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors",
                        s.id === activeId
                          ? "bg-surface-raised"
                          : "hover:bg-surface-raised",
                      )}
                    >
                      {renamingId === s.id ? (
                        
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="w-full rounded border border-border bg-bg px-1 py-0.5 text-[12px] text-ink outline-none"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelect(s.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-[12px] text-ink">
                              {s.title}
                            </span>
                            <span className="block text-[10px] text-ink-muted">
                              {formatRelativeTime(s.updatedAt)}
                            </span>
                          </button>
                          <SessionMenu
                            session={s}
                            onRename={() => {
                              setRenamingId(s.id);
                              setRenameValue(s.title);
                            }}
                            onPin={() => handleTogglePin(s)}
                            onDelete={() => handleDelete(s.id)}
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      <div className="border-t border-border p-2">
        {collapsed ? (
          <button
            type="button"
            title="Settings"
            className="flex w-full items-center justify-center rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <Settings size={14} />
          </button>
        ) : (
          <SettingsMenu />
        )}
      </div>

      <AnimatePresence>
        {searchOpen && (
          <SearchModal
            sessions={sessions}
            onSelect={onSelect}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </AnimatePresence>
    </aside>
  );
}

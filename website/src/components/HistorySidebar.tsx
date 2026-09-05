"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  deleteSession,
  fetchSessions,
  pinSession,
  renameSession,
  type SessionSummary,
} from "@/lib/api";
import { useAppearance, useMotionPreference } from "@/lib/appearance";
import { formatRelativeTime } from "@/lib/format";
import { CorroMark } from "./CorroMark";
import { CorroWordmark } from "./CorroWordmark";
import { SettingsMenu } from "./SettingsMenu";

const COLLAPSE_KEY = "corro_sidebar_collapsed";
const EASE = [0.16, 1, 0.3, 1] as const;

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
  if (buckets.today.length)
    groups.push({ label: "Today", items: buckets.today });
  if (buckets.yesterday.length)
    groups.push({ label: "Yesterday", items: buckets.yesterday });
  if (buckets.week.length)
    groups.push({ label: "Previous 7 days", items: buckets.week });
  if (buckets.month.length)
    groups.push({ label: "Previous 30 days", items: buckets.month });
  if (buckets.older.length)
    groups.push({ label: "Older", items: buckets.older });
  return groups;
}

function RailButton({
  icon: Icon,
  label,
  shortcut,
  expanded,
  active,
  neutralHover,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  shortcut?: string;
  expanded: boolean;
  active?: boolean;
  neutralHover?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        "sidebar-rail-button flex h-8 items-center gap-2 rounded-row text-footnote text-ink-muted transition-colors hover:text-ink",
        expanded ? "px-2" : "w-8 justify-center",
        active && "bg-surface-raised text-ink",
        neutralHover && "sidebar-new-task",
      )}
    >
      <Icon size={16} className="shrink-0" />
      {expanded && (
        <>
          <span className="truncate">{label}</span>
          {shortcut && (
            <span className="ml-auto font-mono text-caption text-ink-muted">
              {shortcut}
            </span>
          )}
        </>
      )}
    </button>
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
  const motionOff = useMotionPreference();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { key: "rename", icon: Pencil, label: "Rename", run: onRename },
    session.pinned
      ? { key: "unpin", icon: PinOff, label: "Unpin", run: onPin }
      : { key: "pin", icon: Pin, label: "Pin", run: onPin },
    { key: "delete", icon: Trash2, label: "Delete", run: onDelete },
  ];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title="More options"
        aria-label={`Options for ${session.title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={clsx(
          "flex size-6 items-center justify-center rounded-row text-ink-muted opacity-0 transition-[opacity,color] hover:text-ink focus-visible:opacity-100 group-hover:opacity-100",
          open && "text-ink opacity-100",
        )}
      >
        <MoreHorizontal size={14} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={motionOff ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.14, ease: EASE }
            }
            className="popover-material absolute right-0 top-full z-40 mt-1 w-36 origin-top-right overflow-hidden rounded-popover p-1"
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-row px-2 py-1.5 text-left text-footnote transition-colors hover:bg-surface-raised",
                  item.key === "delete" ? "text-contradicted" : "text-ink",
                )}
              >
                <item.icon size={13} className="shrink-0" />
                {item.label}
              </button>
            ))}
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
  const motionOff = useMotionPreference();
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
    <motion.div
      initial={motionOff ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : { duration: 0.16 }
      }
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[12vh] backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
        initial={motionOff ? false : { opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={
          motionOff
            ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
            : { duration: 0.18, ease: EASE }
        }
        className="popover-material flex w-full max-w-md flex-col overflow-hidden rounded-popover"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search size={15} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex size-6 shrink-0 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        <div className="scroll-thin max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-footnote text-ink-muted">
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
                className="flex w-full items-center justify-between gap-3 rounded-row px-2.5 py-2 text-left transition-colors hover:bg-surface-raised"
              >
                <span className="truncate text-footnote text-ink">
                  {s.title}
                </span>
                <span className="shrink-0 text-caption tabular-nums text-ink-muted">
                  {formatRelativeTime(s.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
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
  const [peek, setPeek] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { layout, setLayout } = useAppearance();
  const narrow = useMediaQuery("(max-width: 700px)");

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
    setPeek(false);
    if (narrow) return;
    if (layout === "focus") {
      setLayout("inset");
      setCollapsed(false);
      return;
    }
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
    } catch {}
  }

  async function handleTogglePin(session: SessionSummary) {
    const next = !session.pinned;
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, pinned: next } : s)),
    );
    try {
      await pinSession(session.id, next);
    } catch {}
  }

  async function handleDelete(id: string) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteSession(id);
    } catch {}
    if (id === activeId) onNewChat();
  }

  const groups = useMemo(() => groupSessions(sessions), [sessions]);
  const inset = layout !== "borderless";
  const rail = collapsed || layout === "focus" || narrow;

  if (!hydrated) {
    return <div className="w-12 shrink-0 min-[701px]:w-64" />;
  }

  const expanded = !rail || peek;

  const peekHandlers = rail
    ? {
        onMouseEnter: () => setPeek(true),
        onMouseLeave: () => setPeek(false),
        onFocusCapture: () => setPeek(true),
        onBlurCapture: (e: React.FocusEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPeek(false);
        },
      }
    : {};

  return (
    <div
      {...peekHandlers}
      className={clsx(
        "relative shrink-0 transition-[width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        rail ? "w-12" : layout === "studio" ? "w-72" : "w-64",
      )}
    >
      <aside
        className={clsx(
          "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden transition-[width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          inset
            ? "glass panel-shadow rounded-panel"
            : "border-r border-border bg-surface-raised",
          expanded ? (layout === "studio" ? "w-72" : "w-64") : "w-12",
        )}
      >
        <div className="flex items-center gap-1 px-2 pb-1 pt-2.5">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden pl-2 text-ink">
            <CorroMark className="size-[18px] shrink-0" />
            {expanded && (
              <CorroWordmark className="truncate text-[15px] leading-none" />
            )}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={
                narrow
                  ? "Close sidebar"
                  : layout === "focus"
                    ? "Exit focus layout"
                    : rail
                      ? "Pin sidebar open"
                      : "Collapse sidebar"
              }
              aria-label={
                narrow
                  ? "Close sidebar"
                  : layout === "focus"
                    ? "Exit focus layout"
                    : rail
                      ? "Pin sidebar open"
                      : "Collapse sidebar"
              }
              className="flex size-7 shrink-0 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              {collapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <RailButton
            icon={Plus}
            label="New task"
            expanded={expanded}
            neutralHover
            onClick={onNewChat}
          />
          <RailButton
            icon={Search}
            label="Search"
            shortcut="⌘K"
            expanded={expanded}
            onClick={() => setSearchOpen(true)}
          />
        </div>

        {expanded && (
          <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-1">
            {loading ? (
              <p className="px-2 py-2 text-caption text-ink-muted">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-2 text-caption leading-relaxed text-ink-muted">
                Past conversations will collect here.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-1.5">
                  <div className="px-2 pb-1 pt-2.5">
                    <span className="text-caption font-medium text-ink-muted">
                      {group.label}
                    </span>
                  </div>
                  <ul className="space-y-px">
                    {group.items.map((s) => (
                      <li
                        key={s.id}
                        className={clsx(
                          "sidebar-session-row group flex h-8 items-center gap-1 rounded-row px-2 transition-colors",
                          s.id === activeId
                            ? "is-active"
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
                            className="w-full rounded-[5px] border border-accent-border bg-surface px-1.5 py-0.5 text-footnote text-ink outline-none"
                          />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelect(s.id)}
                              title={s.title}
                              className="min-w-0 flex-1 truncate text-left text-footnote text-ink"
                            >
                              {s.title}
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

        <div
          className={clsx(
            "mt-auto border-t border-hairline p-2",
            !expanded && "flex flex-col items-center gap-1",
          )}
        >
          {collapsed && !peek && layout !== "focus" && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex size-8 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <SettingsMenu>
            {({ open, toggle }) => (
              <RailButton
                icon={Settings}
                label="Settings"
                expanded={expanded}
                active={open}
                onClick={toggle}
              />
            )}
          </SettingsMenu>
        </div>
      </aside>

      <AnimatePresence>
        {searchOpen && (
          <SearchModal
            sessions={sessions}
            onSelect={onSelect}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

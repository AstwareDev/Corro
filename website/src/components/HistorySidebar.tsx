"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Briefcase,
  CornerDownLeft,
  MessageCircle,
  MessageCirclePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  deleteSession,
  fetchSessions,
  pinSession,
  renameSession,
  type SessionSummary,
} from "@/lib/api";
import { useAppearance, useMotionPreference } from "@/lib/appearance";
import { formatSearchBucket } from "@/lib/format";
import { CorroMark } from "./CorroMark";
import { CorroWordmark } from "./CorroWordmark";
import { SettingsMenu } from "./SettingsMenu";
import { Skeleton } from "./Skeleton";

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
  icon: LucideIcon;
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
        "sidebar-rail-button group flex h-9 items-center gap-2 rounded-row text-footnote text-ink-muted transition-colors hover:text-ink",
        expanded ? "px-2" : "size-9 justify-center",
        active && "bg-surface-raised text-ink",
        neutralHover && "sidebar-new-task",
      )}
    >
      <Icon
        size={16}
        className="shrink-0 transition-transform duration-200 ease-out group-hover:scale-110"
      />
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

const CONVERSATION_SKELETON_ROWS: Array<{ title: string; subtitle: string }> = [
  { title: "78%", subtitle: "46%" },
  { title: "62%", subtitle: "38%" },
  { title: "71%", subtitle: "52%" },
  { title: "56%", subtitle: "34%" },
  { title: "74%", subtitle: "42%" },
  { title: "66%", subtitle: "48%" },
  { title: "60%", subtitle: "36%" },
];

function SessionSkeleton() {
  return (
    <output aria-label="Loading conversations" className="block">
      <ul className="space-y-px">
        {CONVERSATION_SKELETON_ROWS.map((row, index) => (
          <li key={row.title} className="flex items-center gap-2.5 px-2 py-2">
            <Skeleton
              width={28}
              height={28}
              borderRadius={8}
              delay={index * 90}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton height={11} width={row.title} delay={index * 90} />
              <Skeleton
                height={9}
                width={row.subtitle}
                delay={index * 90 + 45}
              />
            </span>
            <Skeleton width={30} height={9} delay={index * 90 + 60} />
          </li>
        ))}
      </ul>
    </output>
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

const SEARCH_LISTBOX_ID = "corro-search-listbox";

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
  const [selected, setSelected] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMounted(true);
    return () => {
      restoreRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (mounted) inputRef.current?.focus();
  }, [mounted]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, query]);

  useEffect(() => {
    setSelected((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered]);

  useEffect(() => {
    rowRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function open(id: string) {
    onSelect(id);
    onClose();
  }

  function onDialogKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((index) => Math.min(index + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter") {
      const session = filtered[selected];
      if (session) {
        e.preventDefault();
        open(session.id);
      }
    } else if (e.key === "Tab") {
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!mounted) return null;

  const activeId = filtered[selected]
    ? `corro-search-option-${filtered[selected].id}`
    : undefined;

  return createPortal(
    <motion.div
      initial={motionOff ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : { duration: 0.16 }
      }
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 pb-8 pt-[12vh] backdrop-blur-[4px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
        onKeyDown={onDialogKeyDown}
        initial={motionOff ? false : { opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={
          motionOff
            ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
            : { duration: 0.18, ease: EASE }
        }
        className="popover-material flex max-h-[min(620px,calc(100dvh-140px))] w-full max-w-[660px] flex-col overflow-hidden rounded-[16px] border border-border"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-5 pb-4 pt-5">
          <Search size={18} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={SEARCH_LISTBOX_ID}
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Search conversations"
            style={{ outline: "none" }}
            className="w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex size-6 shrink-0 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div
          id={SEARCH_LISTBOX_ID}
          role="listbox"
          aria-label="Conversations"
          className="scroll-thin max-h-[400px] overflow-y-auto p-2"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-body text-ink-muted">
              No conversations found
            </p>
          ) : (
            filtered.map((s, index) => (
              <button
                key={s.id}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                type="button"
                role="option"
                id={`corro-search-option-${s.id}`}
                aria-selected={index === selected}
                title={s.title}
                onMouseEnter={() => setSelected(index)}
                onClick={() => open(s.id)}
                className={clsx(
                  "flex h-10 w-full items-center gap-2.5 rounded-row px-3 text-left transition-colors hover:bg-surface-raised",
                  index === selected && "bg-surface-raised",
                )}
              >
                <MessageCircle size={15} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate text-body text-ink">
                  {s.title}
                </span>
                {index === selected ? (
                  <CornerDownLeft
                    size={14}
                    className="shrink-0 text-ink-muted"
                  />
                ) : (
                  <span className="shrink-0 text-caption tabular-nums text-ink-muted">
                    {formatSearchBucket(s.updatedAt)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
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
  const { layout } = useAppearance();
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
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
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
  const rail = collapsed || narrow;

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
        rail ? "w-12" : "w-64",
      )}
    >
      <aside
        className={clsx(
          "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden transition-[width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          inset
            ? "glass panel-shadow rounded-panel"
            : "border-r border-border bg-surface",
          expanded ? "w-64" : "w-12",
        )}
      >
        <div className="flex items-center gap-1 px-2 pb-1 pt-2.5">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden pl-2 text-ink">
            <CorroMark className="size-[18px] shrink-0" />
            {expanded && (
              <CorroWordmark className="truncate text-body leading-none" />
            )}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={
                narrow
                  ? "Close sidebar"
                  : rail
                    ? "Pin sidebar open"
                    : "Collapse sidebar"
              }
              aria-label={
                narrow
                  ? "Close sidebar"
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
            icon={MessageCirclePlus}
            label="New Task"
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
          <RailButton
            icon={Briefcase}
            label="Customize"
            expanded={expanded}
          />
        </div>

        {expanded && (
          <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-1">
            {loading ? (
              <SessionSkeleton />
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
                              className="flex min-w-0 flex-1 items-center gap-2 text-left text-footnote text-ink"
                            >
                              <MessageCircle
                                size={14}
                                className="shrink-0 text-ink-muted"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {s.title}
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

        <div
          className={clsx(
            "mt-auto border-t border-hairline p-2",
            !expanded && "flex flex-col items-center gap-1",
          )}
        >
          {collapsed && !peek && (
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

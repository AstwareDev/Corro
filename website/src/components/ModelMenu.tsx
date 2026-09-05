"use client";

import { useMotionPreference } from "@/lib/appearance";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Video,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  type Effort,
  effortLabel as effortLabelFor,
  effortOptions,
  findFamily,
  groupModels,
  type ModelDescription,
} from "@/lib/types";

type Panel = "model" | "effort";

const PANEL_TITLE: Record<Panel, string> = {
  model: "Model",
  effort: "Effort",
};

const MODALITY_ICON: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
};

const VECTOR_LOGOS: Record<string, string> = {
  nvidia: "/nvidia-logo.svg",
  "deepseek-ai": "/deepseek-logo.svg",
  qwen: "/qwen-logo.svg",
  Qwen: "/qwen-logo.svg",
  alibaba: "/qwen-logo.svg",
};

const FAMILY_LOGOS: Record<string, string> = {
  "deepseek-v4-pro": "/deepseek-logo.svg",
  "qwen3-max": "/qwen-logo.svg",
  "fable-5.1": "/claude-logo.svg",
  "gpt-6-astra": "/openai-logo.svg",
};

function ProviderLogo({
  family,
  ownedBy,
  className,
}: {
  family?: string;
  ownedBy?: string;
  className?: string;
}) {
  const vector =
    (family && FAMILY_LOGOS[family]) || (ownedBy && VECTOR_LOGOS[ownedBy]);
  if (vector) {
    return (
      <img
        src={vector}
        alt=""
        aria-hidden
        className={clsx("shrink-0 object-contain", className)}
      />
    );
  }
  return (
    <img
      src="/kimi-logo.png"
      alt=""
      aria-hidden
      className={clsx("shrink-0 rounded-[5px] object-cover", className)}
    />
  );
}

function ModalityBadges({ modalities }: { modalities?: string[] }) {
  const extra = (modalities ?? []).filter(
    (m) => m !== "text" && MODALITY_ICON[m],
  );
  if (!extra.length) return null;
  return (
    <span className="flex items-center gap-1">
      {extra.map((m) => {
        const Icon = MODALITY_ICON[m];
        return <Icon key={m} size={12} className="shrink-0 text-ink-muted" />;
      })}
    </span>
  );
}

function Submenu({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const motionOff = useMotionPreference();
  const stacked = !useMediaQuery("(min-width: 640px)");

  return (
    <motion.div
      layout
      initial={
        motionOff
          ? false
          : stacked
            ? { opacity: 0, scale: 0.97, y: -4 }
            : { opacity: 0, scale: 0.97, x: -6 }
      }
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={
        stacked
          ? { opacity: 0, scale: 0.97, y: -4 }
          : { opacity: 0, scale: 0.97, x: -6 }
      }
      transition={
        motionOff
          ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
          : {
              duration: 0.16,
              ease: [0.16, 1, 0.3, 1],
              layout: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
            }
      }
      className={clsx(
        "popover-material absolute z-10 overflow-hidden rounded-popover p-1.5",
        stacked
          ? "left-0 right-0 top-full mt-1.5 w-auto origin-top"
          : "left-full top-0 ml-1.5 w-60 origin-top-left",
      )}
    >
      <motion.p
        layout="position"
        className="px-2.5 pb-1 pt-1 text-caption font-medium text-ink-muted"
        transition={
          motionOff ? { duration: 0, delay: 0, type: "tween" } : undefined
        }
      >
        {title}
      </motion.p>
      {children}
    </motion.div>
  );
}

function Option({
  onClick,
  selected,
  disabled,
  icon,
  label,
  badges,
}: {
  onClick: () => void;
  selected: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  badges?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-row px-2.5 py-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-surface-raised",
      )}
    >
      {icon}
      <span className="flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block text-footnote text-ink">{label}</span>
          {badges}
        </span>
      </span>
      {selected && <Check size={14} className="shrink-0 text-ink" />}
    </button>
  );
}

function ToggleRow({
  label,
  icon,
  on,
  onChange,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const motionOff = useMotionPreference();
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      className={clsx(
        "flex w-full items-center gap-2 rounded-row px-2.5 py-2 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-surface-raised",
      )}
    >
      {icon}
      <span className="flex-1 text-footnote text-ink">{label}</span>
      <span
        className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150"
        style={{ backgroundColor: on ? "#4a9eff" : "#d6d8db" }}
      >
        <motion.span
          layout
          transition={
            motionOff
              ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
              : { type: "spring", stiffness: 500, damping: 32 }
          }
          className="absolute top-0.5 size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          style={{ left: on ? "calc(100% - 16px)" : 2 }}
        />
      </span>
    </button>
  );
}

export function ModelMenu({
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  loading,
  placement = "top",
}: {
  models: ModelDescription[];
  model: string;
  onModelChange: (key: string) => void;
  effort: Effort;
  onEffortChange: (v: Effort) => void;
  loading: boolean;
  placement?: "top" | "bottom";
}) {
  const motionOff = useMotionPreference();
  const above = placement === "top";
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const families = groupModels(models);
  const active = findFamily(families, model);

  const efforts = effortOptions(active?.standard, active?.id).filter(
    (o) => o.key !== "none",
  );
  const effortLabel = effortLabelFor(effort, active?.id);

  const fastOn = Boolean(active?.fast && active.fast.key === model);
  const hasFast = Boolean(
    active?.fast && active.fast.key !== active.standard.key,
  );
  const fastReachable = Boolean(active?.fast?.online);

  const rows: { key: Panel; value: string }[] = [
    { key: "model", value: active?.label ?? "—" },
    { key: "effort", value: effortLabel ?? "—" },
  ];

  function close() {
    setOpen(false);
    setPanel(null);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={loading}
        suppressHydrationWarning
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-footnote font-medium transition-colors hover:bg-surface-raised disabled:opacity-50"
      >
        <span className="text-ink">{active?.label ?? "Model"}</span>
        <span className="text-ink-muted">{effortLabel}</span>
        <ChevronDown
          size={13}
          className={clsx(
            "text-ink-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={
              motionOff ? false : { opacity: 0, y: above ? 6 : -6, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: above ? 6 : -6, scale: 0.98 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
            }
            className={clsx(
              "popover-material absolute right-0 z-30 w-56 rounded-popover p-1.5",
              above
                ? "bottom-full mb-2 origin-bottom-right"
                : "top-full mt-2 origin-top-right",
            )}
          >
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                onMouseEnter={() => setPanel(row.key)}
                onFocus={() => setPanel(row.key)}
                onClick={() => setPanel(panel === row.key ? null : row.key)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-row px-2.5 py-2 text-left transition-colors",
                  panel === row.key
                    ? "bg-surface-raised"
                    : "hover:bg-surface-raised",
                )}
              >
                <span className="flex-1 text-footnote text-ink">
                  {PANEL_TITLE[row.key]}
                </span>
                <span className="text-footnote text-ink-muted">
                  {row.value}
                </span>
                <ChevronRight size={13} className="text-ink-muted" />
              </button>
            ))}

            {hasFast && <div className="my-1 border-t border-border" />}

            {hasFast && active && (
              <ToggleRow
                label="Turbo"
                icon={<Zap size={13} className="shrink-0 text-ink-muted" />}
                on={fastOn}
                disabled={!fastReachable && !fastOn}
                onChange={(on) => {
                  const target = on ? active.fast : active.standard;
                  if (target) onModelChange(target.key);
                }}
              />
            )}

            <AnimatePresence mode="popLayout" initial={false}>
              {panel === "model" && (
                <Submenu key="model" title="Model">
                  {families.map((family) => (
                    <Option
                      key={family.id}
                      icon={
                        <ProviderLogo
                          family={family.id}
                          ownedBy={family.standard.ownedBy}
                          className="size-6"
                        />
                      }
                      label={family.label}
                      badges={
                        <ModalityBadges
                          modalities={family.standard.modalities?.input}
                        />
                      }
                      selected={family.id === active?.id}
                      onClick={() => {
                        onModelChange(
                          fastOn && family.fast
                            ? family.fast.key
                            : family.standard.key,
                        );
                        close();
                      }}
                    />
                  ))}
                  {!families.length && !loading && (
                    <p className="px-2.5 py-3 text-center text-caption text-ink-muted">
                      No models reachable
                    </p>
                  )}
                </Submenu>
              )}

              {panel === "effort" && (
                <Submenu key="effort" title="Effort">
                  {efforts.map((opt) => (
                    <Option
                      key={opt.key}
                      label={opt.label}
                      selected={opt.key === effort}
                      onClick={() => {
                        onEffortChange(opt.key);
                        close();
                      }}
                    />
                  ))}
                </Submenu>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

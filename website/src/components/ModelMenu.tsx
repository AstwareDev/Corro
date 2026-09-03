"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Video,
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

type Panel = "model" | "effort" | "speed";

const PANEL_TITLE: Record<Panel, string> = {
  model: "Model",
  effort: "Effort",
  speed: "Speed",
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
};

function ProviderLogo({
  ownedBy,
  className,
}: {
  ownedBy?: string;
  className?: string;
}) {
  const vector = ownedBy && VECTOR_LOGOS[ownedBy];
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
  
  
  const stacked = !useMediaQuery("(min-width: 640px)");

  return (
    <motion.div
      initial={
        stacked
          ? { opacity: 0, scale: 0.97, y: -4 }
          : { opacity: 0, scale: 0.97, x: -6 }
      }
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={
        stacked
          ? { opacity: 0, scale: 0.97, y: -4 }
          : { opacity: 0, scale: 0.97, x: -6 }
      }
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className={clsx(
        "absolute z-10 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl",
        stacked
          ? "left-0 right-0 top-full mt-1.5 w-auto origin-top"
          : "left-full top-0 ml-1.5 w-60 origin-top-left",
      )}
    >
      <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-ink-muted">
        {title}
      </p>
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
  description,
  badges,
}: {
  onClick: () => void;
  selected: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  description?: string;
  badges?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-surface-raised",
      )}
    >
      {icon}
      <span className="flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block text-[13px] text-ink">{label}</span>
          {badges}
        </span>
        {description && (
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
            {description}
          </span>
        )}
      </span>
      {selected && <Check size={14} className="shrink-0 text-ink" />}
    </button>
  );
}

function ThinkingToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface-raised"
    >
      <span className="flex-1 text-[13px] text-ink">Thinking</span>
      <span
        className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150"
        style={{ backgroundColor: on ? "#4a9eff" : "#d6d8db" }}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
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

  
  
  
  const hasThinkingToggle = Boolean(
    active?.standard.reasoningEfforts?.includes("none"),
  );
  const efforts = effortOptions(active?.standard, active?.id).filter(
    (o) => o.key !== "none",
  );
  const thinkingOn = effort !== "none";
  const effortLabel = effortLabelFor(effort, active?.id);

  const lastNonNoneEffort = useRef<Effort | null>(null);
  useEffect(() => {
    if (effort !== "none") lastNonNoneEffort.current = effort;
  }, [effort]);

  const effortDisabled = hasThinkingToggle && !thinkingOn;

  const fastOn = Boolean(active?.fast && active.fast.key === model);
  const hasFast = Boolean(
    active?.fast && active.fast.key !== active.standard.key,
  );
  const fastReachable = Boolean(active?.fast?.online);

  const rows: { key: Panel; value: string }[] = [
    { key: "model", value: active?.label ?? "—" },
    { key: "effort", value: effortLabel ?? "—" },
    ...(hasFast
      ? [{ key: "speed" as Panel, value: fastOn ? "Fast" : "Normal" }]
      : []),
  ];

  function close() {
    setOpen(false);
    setPanel(null);
  }

  function setThinking(on: boolean) {
    if (on) {
      onEffortChange(lastNonNoneEffort.current ?? efforts[0]?.key ?? "low");
    } else {
      onEffortChange("none");
      if (panel === "effort") setPanel(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={loading}
        suppressHydrationWarning
        className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-medium transition-colors hover:bg-surface-raised disabled:opacity-50"
      >
        <span className="text-ink">{active?.label ?? "Model"}</span>
        {effort !== "none" && (
          <span className="text-ink-muted">{effortLabel}</span>
        )}
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
            initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: above ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              "absolute right-0 z-30 w-56 rounded-2xl border border-border bg-surface p-1.5 shadow-xl",
              above
                ? "bottom-full mb-2 origin-bottom-right"
                : "top-full mt-2 origin-top-right",
            )}
          >
            {rows.map((row) => {
              const disabled = row.key === "effort" && effortDisabled;
              return (
                <button
                  key={row.key}
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => !disabled && setPanel(row.key)}
                  onFocus={() => !disabled && setPanel(row.key)}
                  onClick={() =>
                    !disabled && setPanel(panel === row.key ? null : row.key)
                  }
                  className={clsx(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : panel === row.key
                        ? "bg-surface-raised"
                        : "hover:bg-surface-raised",
                  )}
                >
                  <span className="flex-1 text-[13px] text-ink">
                    {PANEL_TITLE[row.key]}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {row.value}
                  </span>
                  <ChevronRight size={13} className="text-ink-muted" />
                </button>
              );
            })}

            {hasThinkingToggle && (
              <>
                <div className="my-1 border-t border-border" />
                <ThinkingToggle on={thinkingOn} onChange={setThinking} />
              </>
            )}

            <AnimatePresence>
              {panel === "model" && (
                <Submenu title="Model">
                  {families.map((family) => (
                    <Option
                      key={family.id}
                      icon={
                        <ProviderLogo
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
                    <p className="px-2.5 py-3 text-center text-[11px] text-ink-muted">
                      No models reachable
                    </p>
                  )}
                </Submenu>
              )}

              {panel === "effort" && (
                <Submenu title="Effort">
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

              {panel === "speed" && active && (
                <Submenu title="Speed">
                  <Option
                    label="Normal"
                    description="Unlimited, 5–30 tokens per second"
                    selected={!fastOn}
                    onClick={() => {
                      onModelChange(active.standard.key);
                      close();
                    }}
                  />
                  <Option
                    label="Fast"
                    description={
                      fastReachable
                        ? "Limited, 400 tokens per second"
                        : (active.fast?.error ?? "Unreachable right now")
                    }
                    selected={fastOn}
                    disabled={!fastReachable}
                    onClick={() => {
                      if (active.fast) onModelChange(active.fast.key);
                      close();
                    }}
                  />
                </Submenu>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

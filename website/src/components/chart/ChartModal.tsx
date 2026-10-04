"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChartTable } from "./ChartTable";
import { ChartLegend, ChartView } from "./ChartView";
import type { ChartSpec } from "./chartSpec";
import { autoSubtitle } from "./formatters";

export function ChartModal({
  spec,
  view,
  onClose,
}: {
  spec: ChartSpec;
  view: "chart" | "table";
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: backdrop click is a shortcut for the Close button and Escape, which stay keyboard accessible
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chart: ${spec.title}`}
        className="flex max-h-[88dvh] w-[min(96vw,1000px)] flex-col overflow-hidden rounded-popover border border-border bg-surface text-ink shadow-2xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-ink">{spec.title}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {autoSubtitle(spec)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close expanded chart"
            aria-label="Close expanded chart"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {view === "chart" ? (
            <>
              <ChartView spec={spec} height={440} />
              <div className="mt-2 flex h-10 items-center">
                <ChartLegend spec={spec} />
              </div>
            </>
          ) : (
            <div className="flex h-[480px] flex-col">
              <ChartTable spec={spec} />
              <div className="flex h-10 shrink-0 items-center">
                <ChartLegend spec={spec} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

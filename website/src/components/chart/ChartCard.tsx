"use client";

import {
  ChartLine,
  Check,
  Copy,
  Download,
  ImageDown,
  Table2,
} from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { ChartTable } from "./ChartTable";
import { ChartLegend, ChartView } from "./ChartView";
import { classifyChartBlock, describeChartSummary } from "./chartSpec";
import { autoSubtitle, toCSV } from "./formatters";

function ChartSkeleton() {
  return (
    <div
      aria-live="polite"
      className="w-full rounded-xl border border-border bg-surface p-4"
    >
      <div className="corro-skeleton h-4 w-40" />
      <div className="corro-skeleton mt-1 h-3 w-28" />
      <div className="corro-skeleton mt-3 h-[260px] w-full rounded-lg" />
      <span className="sr-only">Building chart…</span>
    </div>
  );
}

function ChartError({ error, raw }: { error: string; raw: string }) {
  return (
    <div className="w-full rounded-xl border border-border bg-surface p-4">
      <p
        role="alert"
        className="rounded-lg bg-contradicted/5 px-2.5 py-2 text-caption text-contradicted"
      >
        Couldn&apos;t render this chart: {error}
      </p>
      <pre className="scroll-thin mt-3 overflow-x-auto rounded-lg bg-surface-raised px-3 py-2.5 font-mono text-footnote leading-relaxed text-ink">
        <code>{raw.trim()}</code>
      </pre>
    </div>
  );
}

function ChartCardInner({
  raw,
  streaming = false,
}: {
  raw: string;
  streaming?: boolean;
}) {
  const status = useMemo(
    () => classifyChartBlock(raw, streaming),
    [raw, streaming],
  );
  const [view, setView] = useState<"chart" | "table" | null>(null);
  const [copied, setCopied] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  if (status.kind === "skeleton") return <ChartSkeleton />;
  if (status.kind === "error")
    return <ChartError error={status.error} raw={raw} />;

  const spec = status.spec;
  const showTable = spec.table?.show !== false;
  const activeView = view ?? spec.table?.defaultView ?? "chart";
  const summary = describeChartSummary(spec);
  const csv = toCSV(spec);

  function copyCSV() {
    navigator.clipboard
      .writeText(csv)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  }

  function downloadCSV() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(spec.title)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPNG() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const css = `:root{color-scheme:light} text{font-family:inherit}`;
    const style = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = img.width * scale || 1200;
      canvas.height = img.height * scale || 640;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const bg =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--corro-surface")
          .trim() || "#ffffff";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${slug(spec.title)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = URL.createObjectURL(
      new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
    );
  }

  return (
    <section
      aria-label={`Chart: ${spec.title}`}
      className="group my-1 w-full rounded-xl border border-border bg-surface p-4"
    >
      <p className="sr-only">{summary}</p>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[15px] font-medium text-ink">{spec.title}</h4>
          <p className="mt-1 text-[13px] text-ink-muted">
            {autoSubtitle(spec)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={copyCSV}
              title="Copy data as CSV"
              aria-label="Copy chart data as CSV"
              className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              onClick={downloadCSV}
              title="Download CSV"
              aria-label="Download chart data as CSV"
              className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <Download size={13} />
            </button>
            <button
              type="button"
              onClick={downloadPNG}
              title="Download chart as PNG"
              aria-label="Download chart as PNG"
              className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <ImageDown size={13} />
            </button>
          </div>
          {showTable && (
            <div
              role="tablist"
              aria-label="Chart view"
              className="flex h-[26px] items-center rounded-full bg-surface-raised p-[2px]"
            >
              {(
                [
                  { key: "chart", label: "Chart view", Icon: ChartLine },
                  { key: "table", label: "Table view", Icon: Table2 },
                ] as const
              ).map(({ key, label, Icon }) => {
                const selected = activeView === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => setView(key)}
                    className={`flex size-[22px] items-center justify-center rounded-full transition-colors ${
                      selected
                        ? "border border-border bg-surface text-ink shadow-sm"
                        : "border border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    <Icon size={13} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <div className="mt-3 flex h-[300px] flex-col">
        {activeView === "chart" || !showTable ? (
          <>
            <div ref={chartRef} className="h-[260px] shrink-0">
              <ChartView spec={spec} height={260} />
            </div>
            <div className="flex h-10 shrink-0 items-center">
              <ChartLegend spec={spec} />
            </div>
          </>
        ) : (
          <>
            <ChartTable spec={spec} />
            <div className="flex h-10 shrink-0 items-center">
              <ChartLegend spec={spec} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "chart"
  );
}

/** Memoized so streaming re-renders of later text never re-animate the chart. */
export const ChartCard = memo(ChartCardInner);

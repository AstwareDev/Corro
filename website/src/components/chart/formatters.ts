"use client";

import type { ChartSpec, YFormat } from "./chartSpec";

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const currencyExactFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Model provides percent values on a 0–100 scale, so no rescaling here. */
export function formatValue(value: number, format: YFormat = "number"): string {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "currency":
      return Number.isInteger(value)
        ? currencyFmt.format(value)
        : currencyExactFmt.format(value);
    case "percent": {
      const rounded =
        Math.abs(value) >= 100
          ? Math.round(value)
          : Math.round(value * 10) / 10;
      return `${numberFmt.format(rounded)}%`;
    }
    case "compact":
      return compactFmt.format(value);
    default:
      return numberFmt.format(value);
  }
}

export interface TableColumn {
  key: string;
  header: string;
  numeric: boolean;
}

/** Columns mirror the chart: x key first, then one column per series. */
export function toTableColumns(spec: ChartSpec): TableColumn[] {
  const cols: TableColumn[] = [
    { key: spec.x.key, header: spec.x.label ?? spec.x.key, numeric: false },
  ];
  for (const s of spec.series) {
    cols.push({ key: s.key, header: s.name ?? s.key, numeric: true });
  }
  return cols;
}

export function cellText(
  row: Record<string, unknown>,
  col: TableColumn,
  format?: YFormat,
): string {
  const v = row[col.key];
  if (!col.numeric) return String(v ?? "—");
  if (typeof v !== "number") return String(v ?? "—");
  // Raw values unless the spec sets a format explicitly.
  return format ? formatValue(v, format) : String(v);
}

/** Axis tick text: plain numbers unless the spec sets y.format explicitly. */
export function tickText(value: number, format?: YFormat): string {
  return format ? formatValue(value, format) : String(value);
}

/** Subtitle fallback so units always come from under the title. */
export function autoSubtitle(spec: ChartSpec): string {
  if (spec.subtitle) return spec.subtitle;
  const yLabel =
    spec.y?.label ?? spec.series[0]?.name ?? spec.series[0]?.key ?? "Value";
  const xLabel = spec.x.label ?? spec.x.key;
  return `${yLabel} by ${xLabel}`;
}

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV carries raw values (not display formatting) so it stays reusable. */
export function toCSV(spec: ChartSpec): string {
  const cols = toTableColumns(spec);
  const header = cols.map((c) => csvEscape(c.header)).join(",");
  const lines = spec.data.map((row) =>
    cols.map((c) => csvEscape(String(row[c.key] ?? ""))).join(","),
  );
  return [header, ...lines].join("\n");
}

/** Series palette sampled to the reference charts (blue, orange-red, green,
 *  purple, amber, teal). Cycles for specs with more than six series. */
export const PALETTE = [
  "#2878D6",
  "#E8622C",
  "#2E9E6B",
  "#8A5CD6",
  "#D9A21B",
  "#1F9DB5",
];

export function seriesColor(spec: ChartSpec, index: number): string {
  return (
    spec.series[index]?.color ?? PALETTE[index % PALETTE.length] ?? "#2878D6"
  );
}

"use client";

export type ChartType = "line" | "bar" | "scatter" | "area" | "pie";
export type XScale = "category" | "linear" | "time" | "log";
export type YScale = "linear" | "log";
export type YFormat = "currency" | "percent" | "number" | "compact";
export type DefaultView = "chart" | "table";

export interface XSpec {
  key: string;
  label?: string;
  scale?: XScale;
  min?: number;
  max?: number;
}

export interface YSpec {
  label?: string;
  scale?: YScale;
  format?: YFormat;
  min?: number;
  max?: number;
}

export interface SeriesSpec {
  key: string;
  name?: string;
  color?: string;
}

export interface TableSpec {
  show?: boolean;
  defaultView?: DefaultView;
}

export interface MarkerSpec {
  x: string | number;
  y: number;
  label?: string;
}

export interface GuideSpec {
  axis: "x" | "y";
  value: string | number;
  label?: string;
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  x: XSpec;
  y?: YSpec;
  series: SeriesSpec[];
  data: Record<string, unknown>[];
  stacked?: boolean;
  smooth?: boolean;
  markers?: MarkerSpec[];
  guides?: GuideSpec[];
  table?: TableSpec;
}

export type ValidationResult =
  | { ok: true; spec: ChartSpec }
  | { ok: false; error: string };

const CHART_TYPES: ChartType[] = ["line", "bar", "scatter", "area", "pie"];
const X_SCALES: XScale[] = ["category", "linear", "time", "log"];
const Y_SCALES: YScale[] = ["linear", "log"];
const Y_FORMATS: YFormat[] = ["currency", "percent", "number", "compact"];
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const MAX_SERIES = 12;
const MAX_ROWS = 500;
const MAX_MARKERS = 20;
const MAX_GUIDES = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Strict validator — the website has no schema lib, so this hand-rolled
 *  module is the project's equivalent of zod for chart specs. */
export function validateChartSpec(raw: unknown): ValidationResult {
  if (!isRecord(raw))
    return { ok: false, error: "Chart spec must be a JSON object." };

  const {
    type,
    title,
    subtitle,
    x,
    y,
    series,
    data,
    stacked,
    smooth,
    markers: markersInput,
    guides: guidesInput,
    table,
  } = raw;

  if (typeof type !== "string" || !CHART_TYPES.includes(type as ChartType)) {
    return {
      ok: false,
      error: `Unknown chart type. Expected one of: ${CHART_TYPES.join(", ")}.`,
    };
  }
  const chartType = type as ChartType;

  if (typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "Chart needs a non-empty string title." };
  }

  const sub = optString(subtitle);
  if (subtitle !== undefined && sub === undefined) {
    return { ok: false, error: "Chart subtitle must be a string." };
  }

  if (!isRecord(x) || typeof x.key !== "string" || !x.key.trim()) {
    return { ok: false, error: "Chart needs x.key (the category field name)." };
  }
  const xScale = x.scale ?? "category";
  if (typeof xScale !== "string" || !X_SCALES.includes(xScale as XScale)) {
    return {
      ok: false,
      error: `Unknown x.scale. Expected one of: ${X_SCALES.join(", ")}.`,
    };
  }
  const xLabel = x.label === undefined ? undefined : optString(x.label);
  if (x.label !== undefined && xLabel === undefined) {
    return { ok: false, error: "x.label must be a string." };
  }
  if (x.min !== undefined && !isFiniteNumber(x.min)) {
    return { ok: false, error: "x.min must be a number." };
  }
  if (x.max !== undefined && !isFiniteNumber(x.max)) {
    return { ok: false, error: "x.max must be a number." };
  }
  if (
    isFiniteNumber(x.min) &&
    isFiniteNumber(x.max) &&
    (x.min as number) >= (x.max as number)
  ) {
    return { ok: false, error: "x.min must be less than x.max." };
  }

  let ySpec: YSpec | undefined;
  if (y !== undefined) {
    if (!isRecord(y)) return { ok: false, error: "y must be an object." };
    const yScale = y.scale ?? "linear";
    const yFormat = y.format ?? "number";
    if (typeof yScale !== "string" || !Y_SCALES.includes(yScale as YScale)) {
      return {
        ok: false,
        error: `Unknown y.scale. Expected one of: ${Y_SCALES.join(", ")}.`,
      };
    }
    if (
      typeof yFormat !== "string" ||
      !Y_FORMATS.includes(yFormat as YFormat)
    ) {
      return {
        ok: false,
        error: `Unknown y.format. Expected one of: ${Y_FORMATS.join(", ")}.`,
      };
    }
    if (y.label !== undefined && typeof y.label !== "string") {
      return { ok: false, error: "y.label must be a string." };
    }
    if (y.min !== undefined && !isFiniteNumber(y.min)) {
      return { ok: false, error: "y.min must be a number." };
    }
    if (y.max !== undefined && !isFiniteNumber(y.max)) {
      return { ok: false, error: "y.max must be a number." };
    }
    if (
      isFiniteNumber(y.min) &&
      isFiniteNumber(y.max) &&
      (y.min as number) >= (y.max as number)
    ) {
      return { ok: false, error: "y.min must be less than y.max." };
    }
    ySpec = {
      ...(typeof y.label === "string" ? { label: y.label } : {}),
      scale: yScale as YScale,
      format: yFormat as YFormat,
      ...(isFiniteNumber(y.min) ? { min: y.min } : {}),
      ...(isFiniteNumber(y.max) ? { max: y.max } : {}),
    };
  }

  if (!Array.isArray(series) || series.length === 0) {
    return { ok: false, error: "Chart needs at least one entry in series." };
  }
  if (series.length > MAX_SERIES) {
    return { ok: false, error: `Too many series (max ${MAX_SERIES}).` };
  }
  if (chartType === "pie" && series.length !== 1) {
    return {
      ok: false,
      error: "Pie charts use exactly one series and one category key.",
    };
  }
  const seen = new Set<string>();
  const cleanSeries: SeriesSpec[] = [];
  for (const s of series) {
    if (!isRecord(s) || typeof s.key !== "string" || !s.key.trim()) {
      return { ok: false, error: "Each series needs a non-empty string key." };
    }
    if (seen.has(s.key)) {
      return { ok: false, error: `Duplicate series key "${s.key}".` };
    }
    seen.add(s.key);
    if (s.name !== undefined && typeof s.name !== "string") {
      return { ok: false, error: "Series name must be a string." };
    }
    if (
      s.color !== undefined &&
      (typeof s.color !== "string" || !HEX_COLOR.test(s.color))
    ) {
      return {
        ok: false,
        error: `Series "${s.key}" color must be a hex like #2563eb.`,
      };
    }
    cleanSeries.push({
      key: s.key,
      ...(typeof s.name === "string" ? { name: s.name } : {}),
      ...(typeof s.color === "string" ? { color: s.color } : {}),
    });
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "Chart needs at least one row in data." };
  }
  if (data.length > MAX_ROWS) {
    return { ok: false, error: `Too many data rows (max ${MAX_ROWS}).` };
  }
  const xKey = (x as Record<string, unknown>).key as string;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!isRecord(row)) {
      return { ok: false, error: `data[${i}] must be an object.` };
    }
    if (row[xKey] === undefined || row[xKey] === null) {
      return { ok: false, error: `data[${i}] is missing "${xKey}".` };
    }
    if (typeof row[xKey] !== "string" && typeof row[xKey] !== "number") {
      return {
        ok: false,
        error: `data[${i}].${xKey} must be a string or number.`,
      };
    }
    for (const s of cleanSeries) {
      const v = row[s.key];
      if (v === undefined || v === null) {
        return { ok: false, error: `data[${i}] is missing "${s.key}".` };
      }
      if (!isFiniteNumber(v)) {
        return { ok: false, error: `data[${i}].${s.key} must be a number.` };
      }
    }
  }

  if (stacked !== undefined && typeof stacked !== "boolean") {
    return { ok: false, error: "stacked must be a boolean." };
  }

  if (smooth !== undefined && typeof smooth !== "boolean") {
    return { ok: false, error: "smooth must be a boolean." };
  }

  let markers: MarkerSpec[] | undefined;
  if (markersInput !== undefined) {
    if (!Array.isArray(markersInput)) {
      return { ok: false, error: "markers must be an array." };
    }
    if (markersInput.length > MAX_MARKERS) {
      return { ok: false, error: `Too many markers (max ${MAX_MARKERS}).` };
    }
    markers = [];
    for (let i = 0; i < markersInput.length; i++) {
      const marker = markersInput[i];
      if (!isRecord(marker)) {
        return { ok: false, error: `markers[${i}] must be an object.` };
      }
      const mx = marker.x;
      const my = marker.y;
      if (
        (typeof mx !== "string" && typeof mx !== "number") ||
        (typeof mx === "string" && !mx.trim())
      ) {
        return {
          ok: false,
          error: `markers[${i}].x must be a category or number.`,
        };
      }
      if (!isFiniteNumber(my)) {
        return { ok: false, error: `markers[${i}].y must be a number.` };
      }
      if (marker.label !== undefined && typeof marker.label !== "string") {
        return { ok: false, error: `markers[${i}].label must be a string.` };
      }
      markers.push({
        x: mx as string | number,
        y: my as number,
        ...(typeof marker.label === "string" && marker.label
          ? { label: marker.label }
          : {}),
      });
    }
  }

  let guides: GuideSpec[] | undefined;
  if (guidesInput !== undefined) {
    if (!Array.isArray(guidesInput)) {
      return { ok: false, error: "guides must be an array." };
    }
    if (guidesInput.length > MAX_GUIDES) {
      return { ok: false, error: `Too many guides (max ${MAX_GUIDES}).` };
    }
    guides = [];
    for (let i = 0; i < guidesInput.length; i++) {
      const guide = guidesInput[i];
      if (!isRecord(guide)) {
        return { ok: false, error: `guides[${i}] must be an object.` };
      }
      if (guide.axis !== "x" && guide.axis !== "y") {
        return { ok: false, error: `guides[${i}].axis must be "x" or "y".` };
      }
      const value = guide.value;
      if (guide.axis === "y") {
        if (!isFiniteNumber(value)) {
          return { ok: false, error: `guides[${i}].value must be a number.` };
        }
      } else if (
        (typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "string" && !value.trim())
      ) {
        return {
          ok: false,
          error: `guides[${i}].value must be a category or number.`,
        };
      }
      if (guide.label !== undefined && typeof guide.label !== "string") {
        return { ok: false, error: `guides[${i}].label must be a string.` };
      }
      guides.push({
        axis: guide.axis,
        value: value as string | number,
        ...(typeof guide.label === "string" && guide.label
          ? { label: guide.label }
          : {}),
      });
    }
  }

  let tableSpec: TableSpec | undefined;
  if (table !== undefined) {
    if (!isRecord(table))
      return { ok: false, error: "table must be an object." };
    if (table.show !== undefined && typeof table.show !== "boolean") {
      return { ok: false, error: "table.show must be a boolean." };
    }
    if (
      table.defaultView !== undefined &&
      table.defaultView !== "chart" &&
      table.defaultView !== "table"
    ) {
      return {
        ok: false,
        error: 'table.defaultView must be "chart" or "table".',
      };
    }
    tableSpec = {
      ...(typeof table.show === "boolean" ? { show: table.show } : {}),
      ...(table.defaultView === "chart" || table.defaultView === "table"
        ? { defaultView: table.defaultView }
        : {}),
    };
  }

  return {
    ok: true,
    spec: {
      type: chartType,
      title: title.trim(),
      ...(sub ? { subtitle: sub } : {}),
      x: {
        key: xKey,
        ...(xLabel ? { label: xLabel } : {}),
        scale: xScale as XScale,
        ...(isFiniteNumber(x.min) ? { min: x.min } : {}),
        ...(isFiniteNumber(x.max) ? { max: x.max } : {}),
      },
      ...(ySpec ? { y: ySpec } : {}),
      series: cleanSeries,
      data: data as Record<string, unknown>[],
      ...(typeof stacked === "boolean" ? { stacked } : {}),
      ...(typeof smooth === "boolean" ? { smooth } : {}),
      ...(markers ? { markers } : {}),
      ...(guides ? { guides } : {}),
      ...(tableSpec ? { table: tableSpec } : {}),
    },
  };
}

export type BlockStatus =
  | { kind: "valid"; spec: ChartSpec }
  | { kind: "skeleton" }
  | { kind: "error"; error: string };

/**
 * Classify a ```chart fence body for streaming-safe rendering.
 * - valid JSON + valid spec -> "valid"
 * - anything else while streaming -> "skeleton" (never flash errors)
 * - anything else once settled -> "error" (caller shows fallback)
 */
export function classifyChartBlock(
  rawText: string,
  streaming: boolean,
): BlockStatus {
  const trimmed = rawText.trim();
  if (!trimmed)
    return streaming
      ? { kind: "skeleton" }
      : { kind: "error", error: "Empty chart block." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return streaming
      ? { kind: "skeleton" }
      : { kind: "error", error: "Chart JSON could not be parsed." };
  }
  const result = validateChartSpec(parsed);
  if (result.ok) return { kind: "valid", spec: result.spec };
  return streaming
    ? { kind: "skeleton" }
    : { kind: "error", error: result.error };
}

/** One-line text summary for screen readers. */
export function describeChartSummary(spec: ChartSpec): string {
  const fmt = spec.y?.format ?? "number";
  const seriesNames = spec.series.map((s) => s.name ?? s.key).join(", ");
  const rows = spec.data.length;
  const first = spec.data[0];
  const last = spec.data[rows - 1];
  const xKey = spec.x.key;
  const span =
    rows > 1
      ? ` from ${String(first[xKey])} to ${String(last[xKey])}`
      : ` at ${String(first[xKey])}`;
  return `${spec.type} chart titled "${spec.title}" with ${rows} data point${rows === 1 ? "" : "s"}${span}, series: ${seriesNames}, values formatted as ${fmt}. Data table follows the same values.`;
}

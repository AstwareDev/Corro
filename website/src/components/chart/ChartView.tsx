"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec, YFormat } from "./chartSpec";
import { PALETTE, seriesColor, tickText } from "./formatters";

const TEXT = "var(--corro-text)";
const TICK = "var(--corro-text-muted)";

function tickProps(): { fontSize: number; fill: string } {
  return { fontSize: 12, fill: TICK };
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  format?: YFormat;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="popover-material scroll-thin max-w-60 overflow-auto rounded-lg px-2.5 py-2">
      {label !== undefined && (
        <div className="mb-1 text-caption font-medium text-ink">
          {String(label)}
        </div>
      )}
      <ul className="space-y-0.5">
        {payload.map((p, idx) => (
          <li
            key={p.name ?? String(p.value)}
            className="flex items-center gap-1.5 text-caption text-ink"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? PALETTE[idx % PALETTE.length] }}
            />
            <span className="truncate text-ink-muted">{p.name}</span>
            <span className="ml-auto pl-2 font-mono font-medium">
              {typeof p.value === "number"
                ? tickText(p.value, format)
                : String(p.value ?? "—")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScatterTip({
  active,
  payload,
  format,
  colorOf,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: { x?: unknown; y?: unknown };
    name?: string;
    color?: string;
  }>;
  format?: YFormat;
  colorOf: (key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="popover-material rounded-lg px-2.5 py-2">
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li
            key={p.name ?? String(p.payload?.x)}
            className="flex items-center gap-1.5 font-mono text-caption text-ink"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? colorOf(p.name ?? "") }}
            />
            {p.name}: {String(p.payload?.x ?? "—")},{" "}
            {typeof p.payload?.y === "number"
              ? tickText(p.payload.y, format)
              : String(p.payload?.y ?? "—")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Left-aligned legend below the plot: a 12px line swatch for line-like
 *  charts, an 8px rounded square for bars. Multi-series only. */
export function ChartLegend({ spec }: { spec: ChartSpec }) {
  if (spec.series.length < 2) return null;
  const square = spec.type === "bar" || spec.type === "pie";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
      {spec.series.map((s, i) => {
        const c = seriesColor(spec, i);
        return (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            {square ? (
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                style={{ background: c }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="h-[2px] w-3 rounded-full"
                style={{ background: c }}
              />
            )}
            {s.name ?? s.key}
          </span>
        );
      })}
    </div>
  );
}

function barDomain(spec: ChartSpec): [number, number | string] {
  // Bars always start at zero so small deltas are never exaggerated.
  return [0, spec.y?.max ?? "auto"];
}

function valueDomain(spec: ChartSpec): [number | string, number | string] {
  return [spec.y?.min ?? "auto", spec.y?.max ?? "auto"];
}

function xDomain(spec: ChartSpec): [number | string, number | string] {
  return [spec.x.min ?? "auto", spec.x.max ?? "auto"];
}

function isNumericX(spec: ChartSpec): boolean {
  if (spec.x.scale !== "linear" && spec.x.scale !== "log") return false;
  return spec.data.every(
    (row) =>
      typeof row[spec.x.key] === "number" && Number.isFinite(row[spec.x.key]),
  );
}

function labelProps(): { fontSize: number; fill: string } {
  return { fontSize: 12, fill: TICK };
}

const MARKER_LABEL_POSITIONS = ["top", "bottom", "right", "left"] as const;

export type MarkerLabelPosition = (typeof MARKER_LABEL_POSITIONS)[number];

export function markerLabelPosition(index: number): MarkerLabelPosition {
  return MARKER_LABEL_POSITIONS[index % MARKER_LABEL_POSITIONS.length];
}

export function guideLabelPosition(
  axis: "x" | "y",
): "insideBottomLeft" | "insideTopRight" {
  return axis === "x" ? "insideBottomLeft" : "insideTopRight";
}

function hasLabeledOverlays(spec: ChartSpec): boolean {
  return (
    (spec.markers ?? []).some((m) => Boolean(m.label)) ||
    (spec.guides ?? []).some((g) => Boolean(g.label))
  );
}

function chartMargins(spec: ChartSpec): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (!hasLabeledOverlays(spec)) return { top: 8, right: 8, bottom: 4, left: 0 };
  return { top: 20, right: 16, bottom: 4, left: 0 };
}

function PlotXAxis({ spec }: { spec: ChartSpec }) {
  if (isNumericX(spec)) {
    return (
      <XAxis
        type="number"
        dataKey={spec.x.key}
        tick={tickProps()}
        tickLine={false}
        axisLine={{ stroke: TEXT, strokeOpacity: 0.18 }}
        domain={xDomain(spec)}
        scale={spec.x.scale === "log" ? "log" : "auto"}
        tickCount={6}
        tickFormatter={(v: number) => tickText(v)}
      />
    );
  }
  return (
    <XAxis
      dataKey={spec.x.key}
      tick={tickProps()}
      tickLine={false}
      interval={0}
      padding={{ left: 0, right: 0 }}
      axisLine={{ stroke: TEXT, strokeOpacity: 0.18 }}
    />
  );
}

function ChartOverlays({ spec }: { spec: ChartSpec }) {
  return (
    <>
      {(spec.guides ?? []).map((g, i) => (
        <ReferenceLine
          // biome-ignore lint/suspicious/noArrayIndexKey: spec order is stable, never reordered
          key={`guide-${i}`}
          {...(g.axis === "x" ? { x: g.value } : { y: g.value })}
          stroke={TICK}
          strokeOpacity={0.7}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
          label={
            g.label
              ? {
                  ...labelProps(),
                  position: guideLabelPosition(g.axis),
                  value: g.label,
                }
              : undefined
          }
        />
      ))}
      {(spec.markers ?? []).map((m, i) => (
        <ReferenceDot
          // biome-ignore lint/suspicious/noArrayIndexKey: spec order is stable, never reordered
          key={`marker-${i}`}
          x={m.x}
          y={m.y}
          r={4}
          fill={seriesColor(spec, 0)}
          stroke="var(--corro-surface)"
          strokeWidth={1.5}
          ifOverflow="extendDomain"
          label={
            m.label
              ? {
                  ...labelProps(),
                  position: markerLabelPosition(i),
                  value: m.label,
                }
              : undefined
          }
        />
      ))}
    </>
  );
}

export function ChartView({
  spec,
  height = 260,
}: {
  spec: ChartSpec;
  height?: number;
}) {
  const format = spec.y?.format;
  const stacked = spec.stacked === true;

  const scatterData = useMemo(() => {
    if (spec.type !== "scatter") return null;
    return spec.series.map((s) => ({
      key: s.key,
      name: s.name ?? s.key,
      points: spec.data.map((row) => ({
        x: row[spec.x.key],
        y: row[s.key],
        row,
      })),
    }));
  }, [spec]);

  const plotData = useMemo(() => {
    if (!isNumericX(spec)) return spec.data;
    return spec.data
      .slice()
      .sort((a, b) => Number(a[spec.x.key]) - Number(b[spec.x.key]));
  }, [spec]);

  const curve = spec.smooth === true ? "monotone" : "linear";

  const chartBody = (() => {
    switch (spec.type) {
      case "line":
        return (
          <LineChart
            data={plotData}
            margin={chartMargins(spec)}
          >
            <CartesianGrid
              stroke={TEXT}
              strokeOpacity={0.08}
              vertical={false}
            />
            <PlotXAxis spec={spec} />
            <YAxis
              tick={tickProps()}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={valueDomain(spec)}
              tickCount={6}
              tickFormatter={(v: number) => tickText(v, format)}
            />
            <Tooltip content={<ChartTooltip format={format} />} />
            <ChartOverlays spec={spec} />
            {spec.series.map((s, i) => {
              const c = seriesColor(spec, i);
              return (
                <Line
                  key={s.key}
                  type={curve}
                  dataKey={s.key}
                  name={s.name ?? s.key}
                  stroke={c}
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: c, stroke: c, strokeWidth: 1 }}
                  activeDot={{ r: 4, fill: c, stroke: c, strokeWidth: 1 }}
                  animationDuration={400}
                />
              );
            })}
          </LineChart>
        );
      case "bar":
        return (
          <BarChart
            data={spec.data}
            margin={chartMargins(spec)}
            barCategoryGap="65%"
            barGap={2}
          >
            <CartesianGrid
              stroke={TEXT}
              strokeOpacity={0.08}
              vertical={false}
            />
            <XAxis
              dataKey={spec.x.key}
              tick={tickProps()}
              tickLine={false}
              interval={0}
              axisLine={{ stroke: TEXT, strokeOpacity: 0.18 }}
            />
            <YAxis
              tick={tickProps()}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={barDomain(spec)}
              tickCount={6}
              tickFormatter={(v: number) => tickText(v, format)}
            />
            <Tooltip
              content={<ChartTooltip format={format} />}
              cursor={{ fill: "var(--corro-surface-raised)" }}
            />
            <ChartOverlays spec={spec} />
            {spec.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name ?? s.key}
                fill={seriesColor(spec, i)}
                maxBarSize={32}
                radius={[3, 3, 0, 0]}
                animationDuration={400}
                {...(stacked ? { stackId: "total" } : {})}
              />
            ))}
          </BarChart>
        );
      case "area":
        return (
          <AreaChart
            data={plotData}
            margin={chartMargins(spec)}
          >
            <CartesianGrid
              stroke={TEXT}
              strokeOpacity={0.08}
              vertical={false}
            />
            <PlotXAxis spec={spec} />
            <YAxis
              tick={tickProps()}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={valueDomain(spec)}
              tickCount={6}
              tickFormatter={(v: number) => tickText(v, format)}
            />
            <Tooltip content={<ChartTooltip format={format} />} />
            <ChartOverlays spec={spec} />
            {spec.series.map((s, i) => (
              <Area
                key={s.key}
                type={curve}
                dataKey={s.key}
                name={s.name ?? s.key}
                stroke={seriesColor(spec, i)}
                fill={seriesColor(spec, i)}
                fillOpacity={stacked ? 0.55 : 0.22}
                strokeWidth={2}
                dot={false}
                animationDuration={400}
                {...(stacked ? { stackId: "total" } : {})}
              />
            ))}
          </AreaChart>
        );
      case "scatter": {
        const groups = scatterData ?? [];
        const colorOf = (key: string) => {
          const i = spec.series.findIndex((s) => s.key === key);
          return seriesColor(spec, i < 0 ? 0 : i);
        };
        return (
          <ScatterChart margin={chartMargins(spec)}>
            <CartesianGrid stroke={TEXT} strokeOpacity={0.08} />
            <XAxis
              type="number"
              dataKey="x"
              tick={tickProps()}
              tickLine={false}
              axisLine={{ stroke: TEXT, strokeOpacity: 0.18 }}
              name={spec.x.label ?? spec.x.key}
              domain={xDomain(spec)}
              tickCount={6}
              tickFormatter={(v: number) => tickText(v, format)}
            />
            <YAxis
              type="number"
              dataKey="y"
              tick={tickProps()}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={valueDomain(spec)}
              tickCount={6}
              tickFormatter={(v: number) => tickText(v, format)}
            />
            <Tooltip
              cursor={{ stroke: TEXT, strokeOpacity: 0.25 }}
              content={<ScatterTip format={format} colorOf={colorOf} />}
            />
            <ChartOverlays spec={spec} />
            {groups.map((g) => (
              <Scatter
                key={g.key}
                name={g.name}
                data={g.points}
                fill={colorOf(g.key)}
                animationDuration={400}
              />
            ))}
          </ScatterChart>
        );
      }
      case "pie": {
        const s = spec.series[0];
        if (!s) return null;
        const pieData = spec.data.map((row, i) => ({
          name: String(row[spec.x.key]),
          value: row[s.key],
          fill: PALETTE[i % PALETTE.length],
        }));
        return (
          <PieChart>
            <Tooltip content={<ChartTooltip format={format} />} />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={96}
              paddingAngle={2}
              animationDuration={400}
            >
              {pieData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        );
      }
    }
  })();

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {chartBody}
      </ResponsiveContainer>
    </div>
  );
}

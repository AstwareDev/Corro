import { describe, expect, it } from "vitest";
import { classifyChartBlock, validateChartSpec } from "./chartSpec";
import {
  autoSubtitle,
  cellText,
  formatValue,
  PALETTE,
  tickText,
  toCSV,
} from "./formatters";

const BASE = {
  type: "line",
  title: "Revenue by month",
  x: { key: "month", label: "Month" },
  y: { label: "Revenue (USD)", format: "currency", min: 0 },
  series: [{ key: "revenue", name: "Revenue" }],
  data: [
    { month: "Jan", revenue: 12000 },
    { month: "Feb", revenue: 18500 },
  ],
};

describe("chart spec validation", () => {
  it("accepts a valid line spec", () => {
    const r = validateChartSpec(BASE);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown types", () => {
    const r = validateChartSpec({ ...BASE, type: "radar" });
    expect(r.ok).toBe(false);
  });

  it("rejects more than 12 series", () => {
    const series = Array.from({ length: 13 }, (_, i) => ({ key: `s${i}` }));
    const data = [
      {
        s0: 1,
        s1: 1,
        s2: 1,
        s3: 1,
        s4: 1,
        s5: 1,
        s6: 1,
        s7: 1,
        s8: 1,
        s9: 1,
        s10: 1,
        s11: 1,
        s12: 1,
        month: "Jan",
      },
    ];
    expect(validateChartSpec({ ...BASE, series, data }).ok).toBe(false);
  });

  it("requires exactly one series for pie", () => {
    const pie = {
      ...BASE,
      type: "pie",
      series: [{ key: "a" }, { key: "b" }],
      data: [{ month: "Jan", a: 1, b: 2 }],
    };
    const r = validateChartSpec(pie);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/pie/i);
  });

  it("rejects non-numeric series values", () => {
    const r = validateChartSpec({
      ...BASE,
      data: [{ month: "Jan", revenue: "lots" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects bad hex colors", () => {
    const r = validateChartSpec({
      ...BASE,
      series: [{ key: "revenue", color: "red" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects min >= max", () => {
    const r = validateChartSpec({
      ...BASE,
      y: { min: 10, max: 5 },
    });
    expect(r.ok).toBe(false);
  });
});

describe("streaming partial-JSON classification", () => {
  const full = JSON.stringify(BASE);

  it("parses a complete block while streaming", () => {
    expect(classifyChartBlock(full, true).kind).toBe("valid");
  });

  it("shows a skeleton for partial JSON while streaming", () => {
    const partial = full.slice(0, Math.floor(full.length / 2));
    expect(classifyChartBlock(partial, true).kind).toBe("skeleton");
  });

  it("shows an error for partial JSON once settled", () => {
    const partial = full.slice(0, Math.floor(full.length / 2));
    const status = classifyChartBlock(partial, false);
    expect(status.kind).toBe("error");
  });

  it("shows an error for invalid specs once settled, skeleton while streaming", () => {
    const bad = JSON.stringify({ ...BASE, type: "radar" });
    expect(classifyChartBlock(bad, true).kind).toBe("skeleton");
    expect(classifyChartBlock(bad, false).kind).toBe("error");
  });

  it("never flashes errors on empty input while streaming", () => {
    expect(classifyChartBlock("", true).kind).toBe("skeleton");
    expect(classifyChartBlock("", false).kind).toBe("error");
  });
});

describe("formatters", () => {
  it("formats currency and percent", () => {
    expect(formatValue(12000, "currency")).toContain("12,000");
    expect(formatValue(42, "percent")).toContain("42%");
    expect(formatValue(1500, "compact")).toMatch(/1\.5K/i);
  });

  it("builds CSV from raw values", () => {
    const r = validateChartSpec(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(toCSV(r.spec)).toBe("Month,Revenue\nJan,12000\nFeb,18500");
    }
  });

  it("uses the reference palette in series order", () => {
    expect(PALETTE.slice(0, 6)).toEqual([
      "#2878D6",
      "#E8622C",
      "#2E9E6B",
      "#8A5CD6",
      "#D9A21B",
      "#1F9DB5",
    ]);
  });

  it("keeps axis ticks plain unless a format is explicit", () => {
    expect(tickText(13760)).toBe("13760");
    expect(tickText(13760, "currency")).toContain("13,760");
  });

  it("keeps table cells raw unless a format is explicit", () => {
    const row = { source: "Mid-market", usd: 13727.13 };
    const col = { key: "usd", header: "USD", numeric: true };
    expect(cellText(row, col, undefined)).toBe("13727.13");
    expect(cellText(row, col, "currency")).toContain("13,727.13");
  });

  it("auto-generates the subtitle from axis labels", () => {
    const r = validateChartSpec(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(autoSubtitle(r.spec)).toBe("Revenue (USD) by Month");
      expect(autoSubtitle({ ...r.spec, subtitle: "Custom subtitle" })).toBe(
        "Custom subtitle",
      );
    }
  });
});

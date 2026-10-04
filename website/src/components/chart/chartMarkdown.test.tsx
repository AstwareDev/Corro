import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../Markdown";
import { CHART_DEMOS } from "./chartDemo";
import { classifyChartBlock } from "./chartSpec";

function demo(name: string): string {
  const found = CHART_DEMOS.find((d) => d.name === name);
  if (!found) throw new Error(`missing demo: ${name}`);
  return found.markdown;
}

describe("chart markdown integration", () => {
  it("renders a chart card for a closed valid block", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("line")} />);
    expect(html).toContain("Revenue by month");
    expect(html).toContain("Chart:");
    expect(html).toContain("Q1 2026");
  });

  it("renders a smooth numeric-axis PPF with markers and a guide", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("ppf")} />);
    expect(html).toContain("Guns vs grain");
    expect(html).toContain("Frontier");
    expect(html).not.toContain("Building chart");
  });

  it("classifies the PPF demo as a valid smooth spec", () => {
    const body = demo("ppf").split("```chart")[1]?.split("```")[0] ?? "";
    const status = classifyChartBlock(body, false);
    expect(status.kind).toBe("valid");
    if (status.kind === "valid") {
      expect(status.spec.smooth).toBe(true);
      expect(status.spec.x.min).toBe(0);
      expect(status.spec.markers).toHaveLength(3);
      expect(status.spec.guides).toHaveLength(1);
    }
  });
  it("offers an expandable large view", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("line")} />);
    expect(html).toContain('aria-label="Expand chart"');
    expect(html).not.toContain('role="dialog"');
  });

  it("renders an icon-only view toggle with accessible labels", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("line")} />);
    expect(html).toContain('aria-label="Chart view"');
    expect(html).toContain('aria-label="Table view"');
    expect(html).not.toContain("↕");
  });

  it("renders the table view without sort controls", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("bar")} />);
    expect(html).toContain("Signups by plan");
    expect(html).not.toContain("↕");
    expect(html).not.toContain("aria-sort");
  });

  it("falls back to an error note plus raw JSON for invalid specs", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("invalid JSON")} />);
    expect(html).toContain("Couldn");
    expect(html).toContain("chart");
  });

  it("shows a skeleton while a partial block streams", () => {
    const html = renderToStaticMarkup(
      <Markdown text={demo("partial stream")} streaming={true} />,
    );
    expect(html).toContain("Building chart");
  });

  it("keeps GFM tables and normal code blocks working", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={"| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```\n"}
      />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("const x = 1");
  });
});

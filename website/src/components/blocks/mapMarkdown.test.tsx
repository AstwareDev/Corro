import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../Markdown";
import { MAP_DEMOS } from "./mapDemo";

function demo(name: string): string {
  const found = MAP_DEMOS.find((d) => d.name === name);
  if (!found) throw new Error(`missing demo: ${name}`);
  return found.markdown;
}

describe("map block markdown integration", () => {
  it("renders a map card from an address", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("address")} />);
    expect(html).toContain("SAS Supermarket");
    expect(html).toContain("Marshal Baghramyan Ave 85");
    expect(html).toContain("<iframe");
    expect(html).toContain("www.google.com/maps?q=");
    expect(html).toContain(encodeURIComponent("SAS Supermarket"));
    expect(html).toContain("Open in Google Maps");
    expect(html).toContain("maps/search");
  });

  it("renders a map from coordinates", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("coordinates")} />);
    expect(html).toContain("40.1772");
    expect(html).toContain("<iframe");
    expect(html).toContain(encodeURIComponent("40.1772, 44.5126"));
  });

  it("applies zoom and label", () => {
    const html = renderToStaticMarkup(
      <Markdown text={demo("zoom and label")} />,
    );
    expect(html).toContain("SAS Supermarket");
    expect(html).toContain("z=15");
    expect(html).toContain("output=embed");
  });

  it("renders nothing for a settled empty block", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("empty")} />);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("corro-skeleton");
  });

  it("shows a skeleton while a partial block streams", () => {
    const html = renderToStaticMarkup(
      <Markdown text={demo("partial stream")} streaming={true} />,
    );
    expect(html).toContain("corro-skeleton");
    expect(html).not.toContain("<iframe");
  });

  it("keeps charts rendering exactly as before", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("chart")} />);
    expect(html).toContain("Revenue by month");
    expect(html).toContain("Chart:");
  });

  it("keeps normal tables with the card wrapper", () => {
    const html = renderToStaticMarkup(<Markdown text={demo("table")} />);
    expect(html).toContain("<table");
    expect(html).toContain("ui-table-wrap");
    expect(html).toContain("SAS Supermarket");
  });

  it("returns plain links to default styling", () => {
    const html = renderToStaticMarkup(
      <Markdown text={'[Open](https://example.com "button")'} />,
    );
    expect(html).not.toContain("ui-btn");
    expect(html).toContain("text-citation");
  });

  it("no longer treats removed blocks as components", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"```products\nA | B\n```\n"} />,
    );
    expect(html).not.toContain("ui-products-grid");
    expect(html).not.toContain("ui-stats-row");
    expect(html).not.toContain('role="note"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown dollar rendering", () => {
  it("renders prices literally instead of inline math", () => {
    const html = renderToStaticMarkup(
      <Markdown text="$4 per million input tokens and $20 per million output tokens" />,
    );
    expect(html).toContain("$4 per million input tokens");
    expect(html).toContain("$20 per million output tokens");
    expect(html).not.toContain("katex");
  });

  it("still renders display math", () => {
    const html = renderToStaticMarkup(<Markdown text={"$$\nE=mc^2\n$$"} />);
    expect(html).toContain("katex");
  });
});

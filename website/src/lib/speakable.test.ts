import { describe, expect, it } from "vitest";
import { toSpeakableText } from "./speakable";
import type { ChatMessageUI, ToolCallUI } from "./types";

function toolCall(name: string, output: unknown): ToolCallUI {
  return {
    localId: "c1",
    name,
    input: {},
    output,
    status: "done",
    startedAt: 0,
  };
}

function assistant(text: string, calls: ToolCallUI[] = []): ChatMessageUI {
  return {
    id: "m1",
    role: "assistant",
    text,
    blocks: calls.length ? [{ kind: "tools", id: "b1", calls }] : [],
    createdAt: 0,
  };
}

describe("speakable markdown", () => {
  it("strips formatting but keeps link labels without urls", () => {
    const text = toSpeakableText(
      assistant("# Hello\n\nThis is **bold** and *italic* with a [label](https://example.com/x)."),
    );
    expect(text).toContain("Hello");
    expect(text).toContain("This is bold and italic with a label.");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
    expect(text).not.toContain("https://example.com/x");
  });

  it("reads lists as sentences", () => {
    const text = toSpeakableText(assistant("- apples\n- bread\n- milk"));
    expect(text).toContain("apples. bread. milk.");
  });

  it("mentions code blocks briefly and keeps inline code", () => {
    const text = toSpeakableText(
      assistant("```ts\nconst x = 1;\n```\n\nUse `count` now."),
    );
    expect(text).toContain("Code example in ts omitted.");
    expect(text).toContain("Use count now.");
    expect(text).not.toContain("const x");
  });

  it("summarizes charts with trend and extremes but no raw points", () => {
    const spec = {
      type: "line",
      title: "Revenue by month",
      x: { key: "month", label: "Month" },
      y: { label: "Revenue", format: "number" },
      series: [{ key: "revenue", name: "Revenue" }],
      data: [
        { month: "Jan", revenue: 12000 },
        { month: "Feb", revenue: 18500 },
      ],
    };
    const text = toSpeakableText(
      assistant(`Intro line.\n\n\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``),
    );
    expect(text).toContain("Revenue by month");
    expect(text).toContain("rises overall");
    expect(text).toContain("peaking at 18500");
    expect(text).toContain("lowest at 12000");
    expect(text).not.toContain('"data"');
    expect(text).not.toContain('"series"');
  });

  it("falls back to a short sentence for invalid charts", () => {
    const text = toSpeakableText(assistant("```chart\nnot json\n```"));
    expect(text).toContain("A chart is shown.");
  });

  it("turns markdown tables into one sentence", () => {
    const text = toSpeakableText(
      assistant("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"),
    );
    expect(text).toContain("Table with 2 rows and 2 columns covering a and b.");
  });

  it("turns map blocks into one sentence", () => {
    const text = toSpeakableText(
      assistant("```map\nSAS Supermarket, Marshal Baghramyan Ave 85\n```"),
    );
    expect(text).toContain("Map of SAS Supermarket, Marshal Baghramyan Ave 85.");
  });

  it("turns timestamped youtube links into clip sentences", () => {
    const text = toSpeakableText(
      assistant("[watch](https://youtu.be/dQw4w9WgXcQ?t=135)"),
    );
    expect(text).toContain("watch");
    expect(text).toContain("video clip at 2 minutes 15 seconds");
  });

  it("expands currencies and keeps amounts readable", () => {
    const text = toSpeakableText(
      assistant("It costs $1,250.50 and 100 USD, or 5000 ֏ and 20 AMD."),
    );
    expect(text).toContain("1250.50 dollars");
    expect(text).toContain("100 US dollars");
    expect(text).toContain("5000 Armenian drams");
    expect(text).toContain("20 Armenian drams");
    expect(text).not.toContain("$");
    expect(text).not.toContain("֏");
  });

  it("expands percents, large numbers and units", () => {
    const text = toSpeakableText(
      assistant("Up 42% to 1,250,000 views, about 1.5K likes, 5 km away."),
    );
    expect(text).toContain("42 percent");
    expect(text).toContain("1250000 views");
    expect(text).toContain("1.5 thousand likes");
    expect(text).toContain("5 kilometers away");
    expect(text).not.toContain("%");
  });

  it("verbalizes math instead of reading delimiters", () => {
    const text = toSpeakableText(assistant("$$E=mc^2$$"));
    expect(text).toContain("equals");
    expect(text).toContain("to the power");
    expect(text).not.toContain("$");
  });

  it("handles citations, urls and emoji", () => {
    const text = toSpeakableText(
      assistant("See [1] for details https://example.com/page 🎉"),
    );
    expect(text).toContain("source 1");
    expect(text).not.toContain("https");
    expect(text).not.toContain("🎉");
  });

  it("preserves armenian text", () => {
    const text = toSpeakableText(
      assistant("Բարև, սա փորձություն է։ Գինը 5000 ֏ է։"),
    );
    expect(text).toContain("Բարև");
    expect(text).toContain("փորձություն");
    expect(text).toContain("Armenian drams");
    expect(text).not.toContain("֏");
  });
});

describe("speakable tool results", () => {
  it("summarizes currency conversion", () => {
    const text = toSpeakableText(
      assistant("", [
        toolCall("currency_convert", {
          amount: 100,
          from: { code: "USD", name: "US dollars" },
          date: "2026-10-03",
          results: [{ code: "AMD", name: "Armenian drams", rate: 392, converted: 39200 }],
          source: "rates",
        }),
      ]),
    );
    expect(text).toContain("100 US dollars equals 39200 Armenian drams.");
  });

  it("summarizes bank rate tables", () => {
    const text = toSpeakableText(
      assistant("", [
        toolCall("ameriabank_rates", {
          bank: "Ameriabank",
          url: "https://ameriabank.am",
          date: "2026-10-03",
          base: "AMD",
          rates: [
            { code: "USD", cash: { buy: 390, sell: 395 }, nonCash: {} },
            { code: "EUR", cash: {}, nonCash: {} },
          ],
          source: "ameriabank.am",
        }),
      ]),
    );
    expect(text).toContain("Ameriabank rates");
    expect(text).toContain("US dollars");
  });

  it("summarizes product search results", () => {
    const text = toSpeakableText(
      assistant("", [
        toolCall("yerevan_city_search", {
          products: [{ id: 1, name: "Milk 1L", price: 500, url: "https://x.am" }],
          query: "milk",
          totalMatches: 12,
          currency: "AMD",
        }),
      ]),
    );
    expect(text).toContain("Found 12 products for milk");
    expect(text).toContain("Milk 1L at 500 Armenian drams");
  });

  it("summarizes youtube videos", () => {
    const text = toSpeakableText(
      assistant("", [
        toolCall("youtube_video", {
          id: "abc",
          title: "Cats",
          url: "https://www.youtube.com/watch?v=abc",
          durationSeconds: 150,
          viewCount: 1000,
        }),
      ]),
    );
    expect(text).toContain("Video Cats");
    expect(text).toContain("2 minutes 30 seconds long");
  });

  it("reads calculator results", () => {
    const text = toSpeakableText(
      assistant("", [toolCall("calculator", { expression: "2+2", formatted: "4" })]),
    );
    expect(text).toContain("2+2 equals 4.");
  });

  it("skips failed and unknown tool output", () => {
    const text = toSpeakableText(
      assistant("", [
        toolCall("mystery_tool", { ok: false, error: "boom" }),
        toolCall("other_tool", { blob: [1, 2, 3] }),
      ]),
    );
    expect(text).toBe("");
  });

  it("returns empty for empty messages", () => {
    expect(toSpeakableText(assistant(""))).toBe("");
    expect(toSpeakableText(assistant("   "))).toBe("");
  });
});

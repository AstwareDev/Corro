import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../Markdown";
import { parseClipUrl } from "./YouTube";

describe("parseClipUrl", () => {
  it("parses youtu.be timestamp links", () => {
    expect(parseClipUrl("https://youtu.be/8IuJ2kSWoig?t=754&end=778")).toEqual({
      videoId: "8IuJ2kSWoig",
      start: 754,
      end: 778,
    });
  });

  it("parses watch URLs and tolerates a missing end", () => {
    expect(
      parseClipUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61"),
    ).toEqual({
      videoId: "dQw4w9WgXcQ",
      start: 61,
      end: undefined,
    });
  });

  it("rejects links without timestamps, bad ids, and non-YouTube hosts", () => {
    expect(
      parseClipUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(parseClipUrl("https://youtu.be/short?t=5")).toBeNull();
    expect(parseClipUrl("https://example.com/?t=5")).toBeNull();
    expect(
      parseClipUrl("https://youtu.be/8IuJ2kSWoig?t=778&end=754"),
    ).toBeNull();
    expect(parseClipUrl("not a url")).toBeNull();
  });
});

describe("clip chips", () => {
  it("renders timestamp links as chips with an excerpt tooltip and no iframe yet", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          '[▶ 12:34-12:58](https://youtu.be/8IuJ2kSWoig?t=754&end=778 "it launches Tuesday")'
        }
      />,
    );
    expect(html).toContain("▶ 12:34-12:58");
    expect(html).toContain('title="it launches Tuesday"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie");
  });

  it("leaves plain video links as normal links", () => {
    const html = renderToStaticMarkup(
      <Markdown text="[Video transcript](https://www.youtube.com/watch?v=dQw4w9WgXcQ)" />,
    );
    expect(html).toContain("Video transcript");
    expect(html).toContain("<a ");
    expect(html).not.toContain("youtube-nocookie");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessageUI, ToolCallUI } from "@/lib/types";
import { ChatMessage } from "../ChatMessage";
import { ToolResult } from "./ToolResult";

function widgetCall(
  id: string,
  input: unknown,
  status: ToolCallUI["status"] = "done",
  partial?: string,
): ToolCallUI {
  return {
    localId: id,
    name: "show_widget",
    input,
    output: status === "done" ? "Rendered." : undefined,
    status,
    startedAt: 0,
    partial,
  };
}

function assistant(blocks: ChatMessageUI["blocks"], streaming = false): ChatMessageUI {
  return {
    id: "m1",
    role: "assistant",
    text: "",
    blocks,
    streaming,
    createdAt: 0,
  };
}

const CODE = "<div>hi</div>";

describe("show_widget body placement", () => {
  it("renders the widget inline in the body, not in the steps", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        message={assistant([
          { kind: "text", id: "t1", text: "First" },
          {
            kind: "tools",
            id: "b1",
            calls: [
              widgetCall("w1", {
                description: "Rendering visualizer",
                title: "Growth",
                widget_code: CODE,
              }),
            ],
          },
          { kind: "text", id: "t2", text: "Second" },
        ])}
        sessionId={null}
      />,
    );
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("Growth");
    expect(html).not.toContain("Rendering visualizer");
    expect(html).not.toContain("1 step");
    const first = html.indexOf("First");
    const growth = html.indexOf("Growth");
    const second = html.indexOf("Second");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(growth).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(growth);
  });

  it("shows a titled placeholder while arguments stream", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        message={assistant(
          [
            {
              kind: "tools",
              id: "b1",
              calls: [
                widgetCall(
                  "w1",
                  undefined,
                  "running",
                  '{"description":"Rendering visualizer", "title":"Growth explorer", "widget_code":"<div',
                ),
              ],
            },
          ],
          true,
        )}
        sessionId={null}
      />,
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Growth explorer");
  });

  it("sandboxes with CSP, dark mode vars, prompt bridge and resize", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        message={assistant([
          {
            kind: "tools",
            id: "b1",
            calls: [
              widgetCall("w1", {
                title: "Growth",
                widget_code: CODE,
              }),
            ],
          },
        ])}
        sessionId={null}
      />,
    );
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("cdnjs.cloudflare.com");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("sendPrompt");
    expect(html).toContain("ResizeObserver");
  });

  it("keeps show_widget out of the trace result view", () => {
    const html = renderToStaticMarkup(
      <ToolResult
        call={widgetCall("w1", { title: "Growth", widget_code: CODE })}
        sessionId={null}
      />,
    );
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Rendered.");
  });
});

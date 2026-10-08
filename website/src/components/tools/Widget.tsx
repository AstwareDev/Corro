"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { requestWidgetPrompt } from "@/lib/widget-prompt";

const CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src data:";

const MIN_HEIGHT = 160;
const START_HEIGHT = 320;
const MAX_HEIGHT = 1600;

function documentFor(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
:root {
  color-scheme: light dark;
  --text-primary: #0d0d0d;
  --text-secondary: #6e6e76;
  --surface-1: #ffffff;
  --surface-2: #f3f5f7;
  --border: #ececef;
}
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #f5f5f7;
    --text-secondary: #9d9da8;
    --surface-1: #101014;
    --surface-2: #1a1a20;
    --border: #232327;
  }
}
body {
  margin: 0;
  padding: 12px;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--surface-1);
}
</style>
</head>
<body>
${code}
<script>
(function () {
  function post(type, payload) {
    parent.postMessage(Object.assign({ type: type }, payload), "*");
  }
  function report() {
    post("corro-widget-height", { height: document.body.scrollHeight });
  }
  window.sendPrompt = function (text) {
    post("corro-widget-prompt", { text: String(text) });
  };
  window.addEventListener("error", function (event) {
    post("corro-widget-error", { message: event.message || "Unknown error" });
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    post("corro-widget-error", {
      message: (reason && reason.message) || String(reason),
    });
  });
  if (document.readyState === "complete") report();
  else window.addEventListener("load", report);
  new ResizeObserver(report).observe(document.body);
  report();
})();
</script>
</body>
</html>`;
}

function clampHeight(value: number): number {
  if (!Number.isFinite(value)) return START_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));
}

/** Extract a partial widget_code prefix from streamed raw JSON without
 *  JSON.parse on the partial object (the SDK already exposes deltas; the
 *  object is incomplete). Only decodes the single string prefix. */
function peekPartialCode(partial?: string): string | undefined {
  if (!partial) return undefined;
  const match = /"widget_code"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(partial);
  if (!match) return undefined;
  const raw = match[1];
  // The prefix may end mid-escape (trailing backslash or partial \u); trim
  // the incomplete tail before decoding so we never throw on partial input.
  for (let end = raw.length; end >= 0; end--) {
    const slice = raw.slice(0, end);
    if (/\\$/.test(slice)) continue;
    if (/\\u[0-9a-fA-F]{0,3}$/.test(slice)) continue;
    try {
      const decoded = JSON.parse(`"${slice}"`) as string;
      if (decoded) return decoded;
      return undefined;
    } catch {
      // Incomplete prefix — try a shorter slice.
    }
  }
  return undefined;
}

/** Strip scripts for progressive streaming preview so partial JS never runs. */
function stripScripts(code: string): string {
  return code
    .replace(/<script[\s\S]*?(<\/script>|$)/gi, "")
    .replace(/ on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/ on\w+\s*=\s*'[^']*'/gi, "");
}

export function Widget({
  code,
  title,
  partial,
  status,
}: {
  code: string | undefined;
  title: string;
  /** Raw streamed JSON prefix while input is still streaming. */
  partial?: string;
  /** Tool call state: pending=input-streaming, running=input-available,
   *  done=output-available, error=output-error. */
  status?: "pending" | "running" | "done" | "error";
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(START_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  // Root cause note: widgets previously rendered only once full input
  // arrived (output-available) with scripts always enabled, so a run that
  // streamed large widget_code showed only a skeleton live and the iframe
  // reloaded with partial JS once enabled. Now markup streams progressively
  // (scripts stripped, sandbox without allow-scripts) and scripts run only
  // once input is available (sandbox allow-scripts at that point). The iframe
  // element itself is stable (keyed by toolCallId, same ref) — only srcDoc
  // updates, never a remount — and batched deltas (rAF in useChat) keep long
  // inputs from freezing the page.
  const streaming = status === "pending";
  const previewCode = !code ? peekPartialCode(partial) : undefined;
  const displayCode =
    code ?? (previewCode ? stripScripts(previewCode) : undefined);
  const scriptsReady = !streaming && !!code;
  const doc = useMemo(
    () => (displayCode ? documentFor(displayCode) : null),
    [displayCode],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (
        data.type === "corro-widget-height" &&
        typeof data.height === "number"
      ) {
        setHeight(clampHeight(data.height));
      } else if (
        data.type === "corro-widget-prompt" &&
        typeof data.text === "string" &&
        data.text.trim()
      ) {
        requestWidgetPrompt(data.text.trim().slice(0, 4000));
      } else if (
        data.type === "corro-widget-error" &&
        typeof data.message === "string"
      ) {
        setError(data.message.slice(0, 300) || "The visual ran into an error");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!doc) {
    return (
      <section aria-label={title} aria-live="polite" className="w-full">
        <h4 className="mb-1 text-[15px] font-medium text-ink">{title}</h4>
        <div className="corro-skeleton h-[160px] w-full rounded-xl" />
        <span className="sr-only">Building visual…</span>
      </section>
    );
  }

  return (
    <section
      aria-label={title}
      aria-live={streaming ? "polite" : undefined}
      className="w-full"
    >
      <h4 className="mb-1 text-[15px] font-medium text-ink">{title}</h4>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-lg bg-contradicted/5 px-2.5 py-2 text-caption text-contradicted"
        >
          {error}
        </p>
      )}
      {/* Stable element: srcDoc updates without remounting (same key/ref).
          Page-level CSP frame-src 'self' permits srcDoc; inner meta CSP
          allows unsafe-inline + cdnjs. Scripts enabled only once input is
          available, so partial markup never executes. */}
      <iframe
        ref={frame}
        title={title}
        sandbox={scriptsReady ? "allow-scripts" : ""}
        srcDoc={doc}
        style={{ height }}
        className="w-full rounded-xl border border-border bg-surface"
        scrolling="no"
      />
      {streaming && <span className="sr-only">Building visual…</span>}
    </section>
  );
}

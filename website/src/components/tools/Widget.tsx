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

export function Widget({
  code,
  title,
}: {
  code: string | undefined;
  title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(START_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const doc = useMemo(() => (code ? documentFor(code) : null), [code]);

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
    <section aria-label={title} className="w-full">
      <h4 className="mb-1 text-[15px] font-medium text-ink">{title}</h4>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-lg bg-contradicted/5 px-2.5 py-2 text-caption text-contradicted"
        >
          {error}
        </p>
      )}
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-scripts"
        srcDoc={doc}
        style={{ height }}
        className="w-full rounded-xl border border-border bg-surface"
        scrolling="no"
      />
    </section>
  );
}

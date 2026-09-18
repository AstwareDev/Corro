"use client";

import clsx from "clsx";
import { Camera, Compass, PowerOff, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  activateBrowserPage,
  type BrowserPage,
  browserViewUrl,
  captureBrowserScreenshot,
  closeBrowser,
  closeBrowserPage,
  fetchBrowserPages,
} from "@/lib/api";
import { Favicon } from "./tools/Favicon";

const POLL_MS = 2500;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function LiveShot({
  sessionId,
  index,
  nonce,
}: {
  sessionId?: string | null;
  index: number;
  nonce: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const next = browserViewUrl(sessionId, index, nonce);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      setFailed(false);
      setSrc(next);
    };
    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    image.src = next;
    return () => {
      cancelled = true;
    };
  }, [sessionId, index, nonce]);

  if (failed && !src) {
    return (
      <div className="flex h-28 items-center justify-center rounded-row border border-border text-caption text-ink-muted">
        No preview available
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-row border border-border bg-surface-raised">
      {src ? (
        // biome-ignore lint/performance/noImgElement: live screenshot, not a static asset
        <img
          src={src}
          alt="Live view of the page Corro has open"
          className="block w-full"
        />
      ) : (
        <div className="h-28 animate-pulse bg-surface-raised" />
      )}
    </div>
  );
}

export function BrowserPanel({
  sessionId,
  active,
  onCount,
}: {
  sessionId?: string | null;
  active: boolean;
  onCount: (n: number) => void;
}) {
  const [pages, setPages] = useState<BrowserPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const next = await fetchBrowserPages(sessionId);
      if (id !== request.current) return;
      setPages(next);
      setError(null);
      onCount(next.length);
    } catch (err) {
      if (id !== request.current) return;
      setError(
        err instanceof Error ? err.message : "Could not reach the browser",
      );
    }
  }, [sessionId, onCount]);

  useEffect(() => {
    setPages([]);
    setSaved(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      refresh();
      setNonce((n) => n + 1);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const current = pages.find((p) => p.active) ?? pages[0];

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
      setNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!pages.length) {
    return (
      <p className="px-2 py-6 text-center text-caption leading-relaxed text-ink-muted">
        <Compass size={24} className="mx-auto mb-3 opacity-50" />
        {error ?? "No pages open. Ask Corro to browse a site."}
      </p>
    );
  }

  return (
    <div className="space-y-2 pb-2">
      {current && (
        <LiveShot sessionId={sessionId} index={current.index} nonce={nonce} />
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => Promise.resolve(setNonce((n) => n + 1)))}
          title="Refresh preview"
          aria-label="Refresh preview"
          className="flex size-7 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40"
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          disabled={busy || !current}
          onClick={() =>
            run(async () => {
              const shot = await captureBrowserScreenshot(
                sessionId,
                current?.index ?? 0,
              );
              setSaved(shot.path);
            })
          }
          title="Save a screenshot to the workspace"
          className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-row bg-surface-raised text-caption text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          <Camera size={14} />
          Screenshot
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => closeBrowser(sessionId))}
          title="Close the browser"
          aria-label="Close the browser"
          className="flex size-7 items-center justify-center rounded-row text-ink-muted transition-colors hover:bg-surface-raised hover:text-contradicted disabled:opacity-40"
        >
          <PowerOff size={14} />
        </button>
      </div>

      {saved && (
        <p className="truncate px-1 text-caption text-ink-muted">
          Saved to <span className="font-mono">{saved}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="px-1 text-caption text-contradicted">
          {error}
        </p>
      )}

      <ul className="space-y-0.5">
        {pages.map((page) => (
          <li
            key={page.index}
            className={clsx(
              "group flex items-center gap-2 rounded-row px-2 py-1.5 transition-colors",
              page.active ? "bg-surface-raised" : "hover:bg-surface-raised",
            )}
          >
            <span className="shrink-0">
              <Favicon host={hostOf(page.url)} size={14} />
            </span>
            <button
              type="button"
              disabled={busy || page.active}
              onClick={() =>
                run(() => activateBrowserPage(sessionId, page.index))
              }
              title={page.url}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-footnote text-ink">
                {page.title || hostOf(page.url) || "Untitled"}
              </span>
              <span className="block truncate text-caption text-ink-muted">
                {hostOf(page.url)}
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => closeBrowserPage(sessionId, page.index))}
              title="Close this page"
              aria-label={`Close ${page.title || page.url}`}
              className="flex size-6 shrink-0 items-center justify-center rounded-row text-ink-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

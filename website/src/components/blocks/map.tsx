"use client";

import { MapPin } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

export interface MapData {
  /** Full query text used for all URLs (place name, address, or "lat,lng"). */
  query: string;
  zoom: number;
  /** Optional title override from `label=`. */
  label: string | null;
  /** Header text: label if given, otherwise the name part of line 1. */
  title: string;
  /** Address part of line 1, only when it holds both a name and an address. */
  address: string | null;
}

const DEFAULT_ZOOM = 15;
const MIN_ZOOM = 1;
const MAX_ZOOM = 21;
const LOAD_TIMEOUT_MS = 8000;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function isCoordinates(query: string): boolean {
  return /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(query);
}

function splitNameAddress(query: string): {
  name: string;
  address: string | null;
} {
  if (isCoordinates(query)) return { name: query.trim(), address: null };
  const comma = query.indexOf(",");
  if (comma <= 0) return { name: query.trim(), address: null };
  const name = query.slice(0, comma).trim();
  const address = query.slice(comma + 1).trim();
  if (!name || !address) return { name: query.trim(), address: null };
  return { name, address };
}

function clampZoom(value: unknown): number {
  const n =
    typeof value === "string"
      ? Number.parseInt(value.trim(), 10)
      : typeof value === "number"
        ? Math.trunc(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
}

/**
 * Line 1 is a place name, an address, or "lat,lng".
 * Line 2 is optional `key=value` pairs separated by " | " (zoom, label).
 */
export function parseMap(raw: string): MapData | null {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  const query = stripQuotes(lines[0]);
  if (!query) return null;

  let zoom = DEFAULT_ZOOM;
  let label: string | null = null;

  if (lines.length >= 2) {
    for (const cell of lines[1].split("|")) {
      const eq = cell.indexOf("=");
      if (eq <= 0) continue;
      const key = cell.slice(0, eq).trim().toLowerCase();
      const value = stripQuotes(cell.slice(eq + 1).trim());
      if (key === "zoom" && value) {
        zoom = clampZoom(value);
      } else if (key === "label" && value) {
        label = value;
      }
    }
  }

  const { name, address } = splitNameAddress(query);
  return {
    query,
    zoom,
    label,
    title: label ?? name,
    address,
  };
}

/** Project env convention is NEXT_PUBLIC_*; accept the bare name for tests/SSR. */
export function getMapEmbedKey(): string | undefined {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY ??
    process.env.GOOGLE_MAPS_EMBED_KEY;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildMapEmbedUrl(
  query: string,
  zoom: number = DEFAULT_ZOOM,
  apiKey?: string,
): string {
  const encoded = encodeURIComponent(query);
  const z = clampZoom(zoom);
  const key = apiKey?.trim();
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encoded}&zoom=${z}`;
  }
  return `https://www.google.com/maps?q=${encoded}&z=${z}&output=embed`;
}

export function buildMapSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function MapSkeleton() {
  return (
    <div
      aria-live="polite"
      className="w-full rounded-xl border border-border bg-surface p-4"
    >
      <div className="corro-skeleton h-4 w-40" />
      <div className="corro-skeleton mt-1 h-3 w-28" />
      <div className="corro-skeleton mt-3 h-[260px] w-full rounded-lg" />
      <span className="sr-only">Loading map…</span>
    </div>
  );
}

function MapViewInner({ raw }: { raw: string }) {
  const data = useMemo(() => parseMap(raw), [raw]);
  const cardRef = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [active, setActive] = useState(false);
  const [hintSeen, setHintSeen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const embedUrl = useMemo(() => {
    if (!data) return null;
    return buildMapEmbedUrl(data.query, data.zoom, getMapEmbedKey());
  }, [data]);

  const searchUrl = useMemo(
    () => (data ? buildMapSearchUrl(data.query) : null),
    [data],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setIsTouch(coarse || "ontouchstart" in window);
  }, []);

  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  useEffect(() => {
    if (!active) return;
    function onPointerDown(event: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setActive(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [active]);

  if (!data || !embedUrl || !searchUrl) return null;

  const showFallback = timedOut && !loaded;
  const showOverlay = isTouch && !active && !showFallback;

  return (
    <section
      ref={cardRef}
      aria-label={`Map: ${data.title}`}
      className="group my-1 w-full rounded-xl border border-border bg-surface p-4"
    >
      <header>
        <h4 className="text-[15px] font-medium text-ink">{data.title}</h4>
        {data.address && (
          <p className="mt-1 text-[13px] text-ink-muted">{data.address}</p>
        )}
      </header>

      <div className="relative mt-3 h-[260px] w-full overflow-hidden rounded-[8px] border-0 bg-surface-raised">
        {showFallback ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <MapPin
              size={24}
              aria-hidden="true"
              className="shrink-0 text-ink-faint"
            />
            <p className="text-[13px] text-ink-muted">{data.query}</p>
          </div>
        ) : (
          <>
            {!loaded && (
              <div
                aria-hidden="true"
                className="corro-skeleton absolute inset-0 rounded-[8px]"
              />
            )}
            <iframe
              key={embedUrl}
              src={embedUrl}
              title={`Map: ${data.query}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => setLoaded(true)}
              className={`h-full w-full border-0 transition-opacity duration-300 ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
            {showOverlay && (
              <button
                type="button"
                onClick={() => {
                  setActive(true);
                  setHintSeen(true);
                }}
                aria-label="Tap to interact with map"
                className="absolute inset-0 z-10 flex items-end justify-center bg-transparent p-3"
              >
                {!hintSeen && (
                  <span className="rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-medium text-white">
                    Tap to interact
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>

      <footer className="mt-3 flex justify-end">
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-strong bg-surface px-3.5 text-[14px] font-medium text-ink transition hover:-translate-y-px hover:border-ink-faint active:scale-[0.98] max-[480px]:w-full max-[480px]:justify-center"
        >
          <MapPin size={15} aria-hidden="true" className="shrink-0" />
          <span>Open in Google Maps</span>
        </a>
      </footer>
    </section>
  );
}

export const MapView = memo(MapViewInner);

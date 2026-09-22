"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Download,
  type File,
  FileCheck2,
  FilePen,
  FilePlus,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchWorkspaceFile, resolveAssetUrl } from "@/lib/api";
import { FileTypeBadge, isHtmlFile } from "@/lib/fileIcons";
import { formatBytes } from "@/lib/format";
import type { ToolCallUI } from "@/lib/types";
import { FileModal } from "../FileModal";
import { Markdown } from "../Markdown";
import { CurrencyConversion, type CurrencyResult } from "./CurrencyConversion";
import { Favicon } from "./Favicon";
import {
  INSTAGRAM_BRAND,
  type InstagramComment,
  InstagramComments,
  type InstagramPost,
  InstagramPostDetail,
  InstagramPostGrid,
  type InstagramProfile,
  InstagramProfileCard,
} from "./Instagram";
import {
  presentTool,
  SkillIcon,
} from "./registry";
import {
  ShopCategories,
  type ShopCategory,
  type ShopProduct,
  ShopProductDetails,
  ShopSearchResults,
} from "./ShopProducts";
import {
  YOUTUBE_BRAND,
  YouTubeChannelCard,
  type YouTubeChannel,
  type YouTubeCaptionTrack,
  type YouTubeComment,
  YouTubeComments,
  type YouTubeSegment,
  YouTubeTranscript,
  YouTubeVideoDetail,
  type YouTubeVideo,
  YouTubeVideoGrid,
  type YouTubeVideoRow,
} from "./YouTube";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function RawJson({ value }: { value: unknown }) {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  return (
    <pre className="scroll-thin max-h-80 overflow-auto rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-caption leading-relaxed text-ink">
      {text || "—"}
    </pre>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <p className="rounded-lg bg-contradicted/5 px-2.5 py-2 text-caption text-contradicted">
      {error}
    </p>
  );
}

function CalculatorResult({
  expression,
  formatted,
}: {
  expression: string;
  formatted: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <div className="truncate font-mono text-caption text-ink-muted">
        {expression}
      </div>
      <div className="mt-0.5 truncate font-mono text-title font-semibold text-ink">
        = {formatted}
      </div>
    </div>
  );
}

function PathLine({
  Icon,
  path,
  meta,
}: {
  Icon: typeof File;
  path: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <Icon size={13} className="shrink-0 text-ink-muted" />
      <span className="truncate font-mono text-caption text-ink">{path}</span>
      {meta && (
        <span className="ml-auto shrink-0 text-caption text-ink-muted">
          {meta}
        </span>
      )}
    </div>
  );
}

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
]);

function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
}

function MarkdownIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.55566 26.8889C3.55566 28.6071 4.94856 30 6.66678 30H25.3334C27.0517 30 28.4446 28.6071 28.4446 26.8889V9.77778L20.6668 2H6.66678C4.94856 2 3.55566 3.39289 3.55566 5.11111V26.8889Z"
        fill="#4D81E8"
      />
      <path
        d="M20.6685 6.66647C20.6685 8.38469 22.0613 9.77759 23.7796 9.77759H28.4462L20.6685 1.99981V6.66647Z"
        fill="#9CC3F4"
      />
      <path
        opacity="0.9"
        d="M10.1685 18.2363H21.8351"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M10.1685 14.3472H12.1129"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M15.0293 14.3472H16.9737"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path
        opacity="0.9"
        d="M10.1685 21.8333H21.8351"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocBadgeIcon({
  fill,
  accent,
  label,
}: {
  fill: string;
  accent: string;
  label: string;
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3.55566 26.8889C3.55566 28.6071 4.94856 30 6.66678 30H25.3334C27.0517 30 28.4446 28.6071 28.4446 26.8889V9.77778L20.6668 2H6.66678C4.94856 2 3.55566 3.39289 3.55566 5.11111V26.8889Z"
        fill={fill}
      />
      <path
        d="M20.6685 6.66647C20.6685 8.38469 22.0613 9.77759 23.7796 9.77759H28.4462L20.6685 1.99981V6.66647Z"
        fill={accent}
      />
      <text
        x="16"
        y="22.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="white"
      >
        {label}
      </text>
    </svg>
  );
}

const PdfIcon = () => (
  <DocBadgeIcon fill="#E24C4C" accent="#F0A0A0" label="PDF" />
);
const DocxIcon = () => (
  <DocBadgeIcon fill="#2F5FD6" accent="#9BB4EE" label="W" />
);

const EXPORT_FORMATS = [
  { key: "markdown", label: "Markdown", Icon: MarkdownIcon },
  { key: "pdf", label: "PDF", Icon: PdfIcon },
  { key: "docx", label: "DOCX", Icon: DocxIcon },
] as const;

function fileDownloadHref(viewUrl: string): string {
  const sep = viewUrl.includes("?") ? "&" : "?";
  return resolveAssetUrl(`${viewUrl}${sep}download=1`);
}

function exportHref(viewUrl: string, format: "pdf" | "docx"): string {
  const query = viewUrl.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  params.set("format", format);
  return resolveAssetUrl(`/workspace/export?${params}`);
}

function FileResultCard({
  path,
  meta,
  viewUrl,
  sessionId,
}: {
  path: string;
  meta?: string;
  viewUrl: string;
  sessionId?: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMarkdown = extOf(path) === ".md";
  const isImage = IMAGE_EXTENSIONS.has(extOf(path));
  const isHtml = isHtmlFile(path);
  const href = resolveAssetUrl(viewUrl);

  useEffect(() => {
    if (isImage || isHtml) return;
    let cancelled = false;
    fetchWorkspaceFile(path, sessionId)
      .then((doc) => {
        if (!cancelled) setContent(doc.content);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load file");
      });
    return () => {
      cancelled = true;
    };
  }, [path, sessionId, isImage, isHtml]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function hrefFor(format: (typeof EXPORT_FORMATS)[number]["key"]): string {
    return format === "markdown"
      ? fileDownloadHref(viewUrl)
      : exportHref(viewUrl, format);
  }

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2.5 bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setPreview(true)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
            <FileTypeBadge path={path} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-body font-medium text-ink">
              {path}
            </div>
            {meta && <div className="text-caption text-ink-muted">{meta}</div>}
          </div>
        </button>
        <a
          href={fileDownloadHref(viewUrl)}
          title="Download"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <Download size={15} />
        </a>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="More"
            aria-label="More options"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <MoreHorizontal size={15} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="popover-material absolute right-0 top-full z-20 mt-1 w-40 origin-top-right rounded-popover p-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPreview(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-caption text-ink transition-colors hover:bg-surface-raised"
                >
                  Open
                </button>
                {isMarkdown ? (
                  EXPORT_FORMATS.map(({ key, label, Icon }) => (
                    <a
                      key={key}
                      href={hrefFor(key)}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-caption text-ink transition-colors hover:bg-surface-raised"
                    >
                      <Icon />
                      {label}
                    </a>
                  ))
                ) : (
                  <a
                    href={fileDownloadHref(viewUrl)}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-caption text-ink transition-colors hover:bg-surface-raised"
                  >
                    <Download size={14} />
                    Download
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative">
        {/* biome-ignore lint/a11y/useSemanticElements: content can include links, which can't nest inside a <button> */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPreview(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPreview(true);
            }
          }}
          className="block max-h-[420px] w-full cursor-pointer overflow-hidden border-t border-border bg-surface px-4 py-4 text-left"
        >
          {error ? (
            <p className="text-caption text-contradicted">{error}</p>
          ) : isImage ? (
            <img
              src={href}
              alt={path}
              className="mx-auto max-h-96 rounded-lg object-contain"
            />
          ) : isHtml ? (
            <iframe
              src={href}
              title={path}
              sandbox="allow-scripts allow-popups allow-forms allow-modals"
              className="pointer-events-none h-72 w-full rounded-lg border border-border bg-white"
            />
          ) : content === null ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-3 w-full animate-pulse rounded bg-surface-raised"
                />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {isMarkdown ? (
                <div className="text-footnote leading-relaxed text-ink">
                  <Markdown text={content} />
                </div>
              ) : (
                <pre className="whitespace-pre font-mono text-caption leading-relaxed text-ink">
                  {content || "—"}
                </pre>
              )}
            </motion.div>
          )}
        </div>
        {!error && !isHtml && content !== null && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-2xl bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>

      {preview && (
        <FileModal
          path={path}
          sessionId={sessionId}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

interface WorkspaceFile {
  path: string;
  bytes: number;
}

function FileList({ files }: { files: WorkspaceFile[] }) {
  if (!files.length) {
    return (
      <p className="rounded-lg bg-surface-raised px-2.5 py-2 text-caption text-ink-muted">
        The workspace is empty.
      </p>
    );
  }
  return (
    <ul className="scroll-thin max-h-72 space-y-0.5 overflow-auto rounded-xl border border-border bg-surface-raised p-1">
      {files.map((f) => (
        <li
          key={f.path}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1"
        >
          <FileTypeBadge path={f.path} size={13} />
          <span className="truncate font-mono text-caption text-ink">
            {f.path}
          </span>
          <span className="ml-auto shrink-0 font-mono text-caption text-ink-muted">
            {formatBytes(f.bytes)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

function FileSearchMatches({
  matches,
  pattern,
  truncated,
}: {
  matches: SearchMatch[];
  pattern: string;
  truncated?: boolean;
}) {
  if (!matches.length) {
    return (
      <p className="rounded-lg bg-surface-raised px-2.5 py-2 text-caption text-ink-muted">
        No matches for <span className="font-mono">{pattern}</span>.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <ul className="scroll-thin max-h-72 space-y-0.5 overflow-auto rounded-xl border border-border bg-surface-raised p-1">
        {matches.map((m, i) => (
          <li
            key={`${m.path}:${m.line}:${i}`}
            className="flex items-start gap-1.5 rounded-lg px-2 py-1"
          >
            <span className="mt-0.5 shrink-0 font-mono text-caption text-ink-muted">
              {m.path}:{m.line}
            </span>
            <span className="truncate font-mono text-caption text-ink">
              {m.text}
            </span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="text-caption text-ink-muted">
          Showing the first {matches.length} matches.
        </p>
      )}
    </div>
  );
}

function FileContent({
  path,
  content,
  truncated,
}: {
  path: string;
  content: string;
  truncated?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <FileTypeBadge path={path} size={13} />
        <span className="truncate font-mono text-caption text-ink-muted">
          {path}
        </span>
        {truncated && (
          <span className="ml-auto shrink-0 text-caption text-ink-muted">
            truncated
          </span>
        )}
      </div>
      <pre className="scroll-thin max-h-80 overflow-auto whitespace-pre rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-caption leading-relaxed text-ink">
        {content || "—"}
      </pre>
    </div>
  );
}

function FileRename({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <FilePen size={13} className="shrink-0 text-ink-muted" />
      <span className="truncate font-mono text-caption text-ink-muted">
        {from}
      </span>
      <ArrowRight size={12} className="shrink-0 text-ink-muted" />
      <span className="truncate font-mono text-caption text-ink">{to}</span>
    </div>
  );
}

function AnswerCard({ answer }: { answer: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={12} className="text-ink-muted" />
        <span className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Overview · not a source
        </span>
      </div>
      <p className="text-footnote leading-relaxed text-ink">{answer}</p>
    </div>
  );
}

interface SearchHit {
  title?: string;
  url?: string;
  published?: string;
  content?: string;
}

function SearchResults({
  results,
  answer,
  distinctDomains,
}: {
  results: SearchHit[];
  answer?: string;
  distinctDomains?: number;
}) {
  return (
    <div className="space-y-2.5">
      {answer && <AnswerCard answer={answer} />}

      <ol className="space-y-2.5">
        {results.map((r, i) => {
          const url = r.url ?? "";
          const host = hostOf(url);
          return (
            <li key={url || i} className="flex gap-2.5">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-surface-raised font-mono text-caption text-ink-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-footnote font-medium text-citation hover:underline"
                >
                  {r.title || host || url}
                </a>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Favicon host={host} size={12} />
                  <span className="truncate font-mono text-caption text-ink-muted">
                    {url}
                  </span>
                  {r.published && (
                    <span className="shrink-0 font-mono text-caption text-ink-muted/70">
                      {r.published}
                    </span>
                  )}
                </div>
                {r.content && (
                  <p className="mt-1 line-clamp-3 text-caption leading-relaxed text-ink-muted">
                    {r.content}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {distinctDomains !== undefined && (
        <p className="text-caption text-ink-muted">
          {results.length} results across {distinctDomains} distinct{" "}
          {distinctDomains === 1 ? "domain" : "domains"}
        </p>
      )}
    </div>
  );
}

function Pages({
  pages,
  failed,
}: {
  pages: Array<{ url?: string; content?: string }>;
  failed?: Array<{ url?: string; error?: string }>;
}) {
  return (
    <div className="space-y-3">
      {pages.map((p, i) => {
        const url = p.url ?? "";
        const host = hostOf(url);
        return (
          <div key={url || i}>
            <div className="mb-1 flex items-center gap-1.5">
              <Favicon host={host} size={12} />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-caption text-citation hover:underline"
              >
                {url}
              </a>
            </div>
            <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-caption leading-relaxed text-ink">
              {p.content || "—"}
            </pre>
          </div>
        );
      })}

      {failed?.map((f) => (
        <ErrorLine key={f.url} error={`${f.url} — ${f.error}`} />
      ))}
    </div>
  );
}

function SiteMap({ site, urls }: { site?: string; urls: string[] }) {
  return (
    <div>
      {site && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Favicon host={site} size={12} />
          <span className="font-mono text-caption text-ink">{site}</span>
          <span className="text-caption text-ink-muted">{urls.length} URLs</span>
        </div>
      )}
      <ul className="scroll-thin max-h-72 space-y-0.5 overflow-auto">
        {urls.map((u) => (
          <li key={u}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-mono text-caption text-citation hover:underline"
            >
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkillLoaded({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <SkillIcon size={18} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-footnote font-medium text-ink">
          /{name}
        </div>
        <div className="text-caption text-ink-muted">
          Skill instructions loaded into context for this turn
        </div>
      </div>
    </div>
  );
}

export function ToolResult({
  call,
  sessionId,
}: {
  call: ToolCallUI;
  sessionId?: string | null;
}) {
  const out = call.output as Record<string, unknown> | undefined;

  if (out && typeof out === "object" && out.ok === false) {
    return (
      <ErrorLine
        error={typeof out.error === "string" ? out.error : "The tool failed"}
      />
    );
  }

  if (
    call.name === "calculator" &&
    typeof out?.expression === "string" &&
    typeof out?.formatted === "string"
  ) {
    return (
      <CalculatorResult expression={out.expression} formatted={out.formatted} />
    );
  }

  if (call.name === "fs_list" && Array.isArray(out?.files)) {
    return <FileList files={out.files as WorkspaceFile[]} />;
  }

  if (call.name === "fs_search" && Array.isArray(out?.matches)) {
    return (
      <FileSearchMatches
        matches={out.matches as SearchMatch[]}
        pattern={typeof out.pattern === "string" ? out.pattern : ""}
        truncated={out.truncated === true}
      />
    );
  }

  if (call.name === "fs_read" && typeof out?.content === "string") {
    return (
      <FileContent
        path={typeof out.path === "string" ? out.path : ""}
        content={out.content}
        truncated={out.truncated === true}
      />
    );
  }

  if (call.name === "fs_write" && typeof out?.path === "string") {
    const meta =
      typeof out.bytes === "number"
        ? `${formatBytes(out.bytes)} · ${out.changed === false ? "Unchanged" : out.verified ? "Saved & verified" : "Saved"}`
        : undefined;
    if (typeof out.viewUrl === "string") {
      return (
        <FileResultCard
          path={out.path}
          meta={meta}
          viewUrl={out.viewUrl}
          sessionId={sessionId}
        />
      );
    }
    return <PathLine Icon={FilePlus} path={out.path} meta={meta} />;
  }

  if (call.name === "fs_edit" && typeof out?.path === "string") {
    const meta =
      typeof out.replaced === "number"
        ? out.changed === false
          ? "Unchanged"
          : `${out.replaced} replacement${out.replaced === 1 ? "" : "s"}${out.verified ? " · verified" : ""}`
        : undefined;
    if (typeof out.viewUrl === "string") {
      return (
        <FileResultCard
          path={out.path}
          meta={meta}
          viewUrl={out.viewUrl}
          sessionId={sessionId}
        />
      );
    }
    return <PathLine Icon={FileCheck2} path={out.path} meta={meta} />;
  }

  if (call.name === "fs_delete" && typeof out?.path === "string") {
    return (
      <PathLine
        Icon={Trash2}
        path={out.path}
        meta={out.kind === "directory" ? "directory" : undefined}
      />
    );
  }

  if (
    call.name === "fs_rename" &&
    typeof out?.from === "string" &&
    typeof out?.to === "string"
  ) {
    return <FileRename from={out.from} to={out.to} />;
  }

  if (call.name === "web_search" && Array.isArray(out?.results)) {
    return (
      <SearchResults
        results={out.results as SearchHit[]}
        answer={typeof out.answer === "string" ? out.answer : undefined}
        distinctDomains={
          typeof out.distinctDomains === "number"
            ? out.distinctDomains
            : undefined
        }
      />
    );
  }

  if (
    (call.name === "web_extract" || call.name === "web_crawl") &&
    Array.isArray(out?.pages)
  ) {
    return (
      <Pages
        pages={out.pages as Array<{ url?: string; content?: string }>}
        failed={out.failed as Array<{ url?: string; error?: string }>}
      />
    );
  }

  const shop = presentTool(call.name).brand;

  if (shop && call.name.endsWith("_search") && Array.isArray(out?.products)) {
    return (
      <ShopSearchResults
        products={out.products as ShopProduct[]}
        shop={shop}
        query={typeof out.query === "string" ? out.query : undefined}
        shelf={typeof out.shelf === "string" ? out.shelf : undefined}
        totalMatches={
          typeof out.totalMatches === "number" ? out.totalMatches : undefined
        }
        page={typeof out.page === "number" ? out.page : undefined}
        pageCount={
          typeof out.pageCount === "number"
            ? out.pageCount
            : typeof out.atLeastPages === "number"
              ? out.atLeastPages
              : undefined
        }
        currency={typeof out.currency === "string" ? out.currency : undefined}
      />
    );
  }

  if (shop && call.name.endsWith("_product") && Array.isArray(out?.products)) {
    return (
      <ShopProductDetails
        products={out.products as ShopProduct[]}
        shop={shop}
        failed={
          out.failed as Array<{
            id?: number;
            slug?: string;
            url?: string;
            error?: string;
          }>
        }
        currency={typeof out.currency === "string" ? out.currency : undefined}
      />
    );
  }

  if (
    shop &&
    call.name.endsWith("_categories") &&
    Array.isArray(out?.categories)
  ) {
    return (
      <ShopCategories
        categories={out.categories as ShopCategory[]}
        shop={shop}
        level={typeof out.level === "string" ? out.level : undefined}
      />
    );
  }

  if (call.name === "currency_convert" && Array.isArray(out?.results)) {
    return <CurrencyConversion data={out as unknown as CurrencyResult} />;
  }

  if (call.name === "youtube_channel" && typeof out?.id === "string") {
    return (
      <YouTubeChannelCard
        channel={
          {
            id: out.id,
            title: typeof out.title === "string" ? out.title : "Untitled",
            handle: typeof out.handle === "string" ? out.handle : undefined,
            subscriberText: typeof out.subscriberText === "string" ? out.subscriberText : undefined,
            subscriberCount: typeof out.subscriberCount === "number" ? out.subscriberCount : undefined,
            description: typeof out.description === "string" ? out.description : undefined,
            avatar: typeof out.avatar === "string" ? out.avatar : undefined,
            banner: typeof out.banner === "string" ? out.banner : undefined,
            joined: typeof out.joined === "string" ? out.joined : undefined,
            videoCount: typeof out.videoCount === "number" ? out.videoCount : undefined,
            url: typeof out.url === "string" ? out.url : "https://www.youtube.com",
          } as YouTubeChannel
        }
        brand={YOUTUBE_BRAND}
      />
    );
  }

  if (call.name === "youtube_channel_videos" && Array.isArray(out?.videos)) {
    return (
      <YouTubeVideoGrid
        videos={out.videos as YouTubeVideoRow[]}
        brand={YOUTUBE_BRAND}
        sort={typeof out.sort === "string" ? out.sort : undefined}
        tab={typeof out.tab === "string" ? out.tab : undefined}
        hasMore={out.hasMore === true}
      />
    );
  }

  if (call.name === "youtube_video" && typeof out?.id === "string") {
    return (
      <YouTubeVideoDetail
        video={
          {
            id: out.id,
            title: typeof out.title === "string" ? out.title : "Untitled",
            url: typeof out.url === "string" ? out.url : `https://www.youtube.com/watch?v=${out.id}`,
            thumbnail: typeof out.thumbnail === "string" ? out.thumbnail : undefined,
            channel: (out.channel ?? undefined) as YouTubeVideo["channel"],
            viewCount: typeof out.viewCount === "number" ? out.viewCount : undefined,
            viewText: typeof out.viewText === "string" ? out.viewText : undefined,
            likeCount: typeof out.likeCount === "number" ? out.likeCount : undefined,
            commentCount: typeof out.commentCount === "number" ? out.commentCount : undefined,
            published: typeof out.published === "string" ? out.published : undefined,
            publishedRelative: typeof out.publishedRelative === "string" ? out.publishedRelative : undefined,
            durationSeconds: typeof out.durationSeconds === "number" ? out.durationSeconds : undefined,
            category: typeof out.category === "string" ? out.category : undefined,
            tags: Array.isArray(out.tags) ? (out.tags as string[]) : undefined,
            description: typeof out.description === "string" ? out.description : undefined,
            qualities: Array.isArray(out.qualities) ? (out.qualities as string[]) : undefined,
          } as YouTubeVideo
        }
        brand={YOUTUBE_BRAND}
      />
    );
  }

  if (call.name === "youtube_comments" && Array.isArray(out?.comments)) {
    return (
      <YouTubeComments
        comments={out.comments as YouTubeComment[]}
        brand={YOUTUBE_BRAND}
        totalText={typeof out.totalText === "string" ? out.totalText : undefined}
        hasMore={out.hasMore === true}
        note={typeof out.note === "string" ? out.note : undefined}
      />
    );
  }

  if (call.name === "youtube_transcript" && Array.isArray(out?.languages)) {
    return (
      <YouTubeTranscript
        languages={out.languages as YouTubeCaptionTrack[]}
        picked={(out.picked ?? undefined) as YouTubeCaptionTrack | undefined}
        segments={Array.isArray(out.segments) ? (out.segments as YouTubeSegment[]) : undefined}
        text={typeof out.text === "string" ? out.text : undefined}
        brand={YOUTUBE_BRAND}
        note={typeof out.note === "string" ? out.note : undefined}
        title={typeof out.title === "string" ? out.title : undefined}
        url={typeof out.url === "string" ? out.url : undefined}
        durationText={typeof out.durationText === "string" ? out.durationText : undefined}
        wordCount={typeof out.wordCount === "number" ? out.wordCount : undefined}
      />
    );
  }

  if (call.name === "instagram_profile" && out?.profile && typeof out.profile === "object") {
    const p = out.profile as Record<string, unknown>;
    return (
      <InstagramProfileCard
        profile={
          {
            username: typeof p.username === "string" ? p.username : "unknown",
            displayName: typeof p.displayName === "string" ? p.displayName : undefined,
            bio: typeof p.bio === "string" ? p.bio : undefined,
            followers: typeof p.followers === "number" ? p.followers : undefined,
            followerText: typeof p.followerText === "string" ? p.followerText : undefined,
            following: typeof p.following === "number" ? p.following : undefined,
            postCount: typeof p.postCount === "number" ? p.postCount : undefined,
            avatar: typeof p.avatar === "string" ? p.avatar : undefined,
            verified: p.verified === true,
            private: p.private === true,
            url:
              typeof p.url === "string"
                ? p.url
                : `https://www.instagram.com/${typeof p.username === "string" ? p.username : ""}/`,
            posts: Array.isArray(p.posts) ? (p.posts as InstagramPost[]) : undefined,
          } as InstagramProfile
        }
        note={typeof out.note === "string" ? out.note : undefined}
        brand={INSTAGRAM_BRAND}
      />
    );
  }

  if (call.name === "instagram_posts" && Array.isArray(out?.posts)) {
    return (
      <InstagramPostGrid
        posts={out.posts as InstagramPost[]}
        brand={INSTAGRAM_BRAND}
        kind={typeof out.kind === "string" ? out.kind : undefined}
        hasMore={out.hasMore === true}
        note={typeof out.note === "string" ? out.note : undefined}
        emptyText={
          typeof out.username === "string"
            ? `@${out.username} has no posts on this page. The grid may need a session Instagram trusts.`
            : undefined
        }
      />
    );
  }

  if (call.name === "instagram_post" && typeof out?.shortcode === "string") {
    return (
      <InstagramPostDetail
        post={
          {
            id: typeof out.id === "string" ? out.id : out.shortcode,
            shortcode: out.shortcode,
            caption: typeof out.caption === "string" ? out.caption : undefined,
            type: out.type,
            likes: typeof out.likes === "string" ? out.likes : undefined,
            likeCount: typeof out.likeCount === "number" ? out.likeCount : undefined,
            comments: typeof out.comments === "string" ? out.comments : undefined,
            commentCount: typeof out.commentCount === "number" ? out.commentCount : undefined,
            timestamp: typeof out.timestamp === "string" ? out.timestamp : undefined,
            takenAt: typeof out.takenAt === "number" ? out.takenAt : undefined,
            url: typeof out.url === "string" ? out.url : `https://www.instagram.com/p/${out.shortcode}/`,
            mediaUrls: Array.isArray(out.mediaUrls) ? (out.mediaUrls as string[]) : [],
            playCount: typeof out.playCount === "number" ? out.playCount : undefined,
            ownerUsername: typeof out.ownerUsername === "string" ? out.ownerUsername : undefined,
          } as InstagramPost
        }
        brand={INSTAGRAM_BRAND}
        note={typeof out.note === "string" ? out.note : undefined}
      />
    );
  }

  if (call.name === "instagram_comments" && Array.isArray(out?.comments)) {
    return (
      <InstagramComments
        comments={out.comments as InstagramComment[]}
        brand={INSTAGRAM_BRAND}
        hasMore={out.hasMore === true}
        note={typeof out.note === "string" ? out.note : undefined}
        disabled={out.disabled === true}
      />
    );
  }

  if (call.name === "web_map" && Array.isArray(out?.urls)) {
    return (
      <SiteMap
        site={out.site as string | undefined}
        urls={out.urls as string[]}
      />
    );
  }

  if (
    call.name === "read_skill" &&
    typeof out?.name === "string"
  ) {
    return <SkillLoaded name={out.name} />;
  }

  return <RawJson value={call.output} />;
}

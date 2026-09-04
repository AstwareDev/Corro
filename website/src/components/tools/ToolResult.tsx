"use client";

import {
  ArrowRight,
  File,
  FileCheck2,
  FilePen,
  FilePlus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ToolCallUI } from "@/lib/types";
import { CurrencyConversion, type CurrencyResult } from "./CurrencyConversion";
import { Favicon } from "./Favicon";
import { presentTool } from "./registry";
import {
  ShopCategories,
  type ShopCategory,
  type ShopProduct,
  ShopProductDetails,
  ShopSearchResults,
} from "./ShopProducts";

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
    <pre className="scroll-thin max-h-80 overflow-auto rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink">
      {text || "—"}
    </pre>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <p className="rounded-lg bg-contradicted/5 px-2.5 py-2 text-[12px] text-contradicted">
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
      <div className="truncate font-mono text-[12px] text-ink-muted">
        {expression}
      </div>
      <div className="mt-0.5 truncate font-mono text-[20px] font-semibold text-ink">
        = {formatted}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      <span className="truncate font-mono text-[12px] text-ink">{path}</span>
      {meta && (
        <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
          {meta}
        </span>
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
      <p className="rounded-lg bg-surface-raised px-2.5 py-2 text-[12px] text-ink-muted">
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
          <File size={12} className="shrink-0 text-ink-muted" />
          <span className="truncate font-mono text-[11px] text-ink">
            {f.path}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-muted">
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
      <p className="rounded-lg bg-surface-raised px-2.5 py-2 text-[12px] text-ink-muted">
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
            <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-muted">
              {m.path}:{m.line}
            </span>
            <span className="truncate font-mono text-[11px] text-ink">
              {m.text}
            </span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="text-[10px] text-ink-muted">
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
        <File size={12} className="shrink-0 text-ink-muted" />
        <span className="truncate font-mono text-[10px] text-ink-muted">
          {path}
        </span>
        {truncated && (
          <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
            truncated
          </span>
        )}
      </div>
      <pre className="scroll-thin max-h-80 overflow-auto whitespace-pre rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink">
        {content || "—"}
      </pre>
    </div>
  );
}

function FileRename({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <FilePen size={13} className="shrink-0 text-ink-muted" />
      <span className="truncate font-mono text-[12px] text-ink-muted">
        {from}
      </span>
      <ArrowRight size={12} className="shrink-0 text-ink-muted" />
      <span className="truncate font-mono text-[12px] text-ink">{to}</span>
    </div>
  );
}

function AnswerCard({ answer }: { answer: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={12} className="text-ink-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Overview · not a source
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink">{answer}</p>
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
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-surface-raised font-mono text-[9px] text-ink-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium text-citation hover:underline"
                >
                  {r.title || host || url}
                </a>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Favicon host={host} size={12} />
                  <span className="truncate font-mono text-[10px] text-ink-muted">
                    {url}
                  </span>
                  {r.published && (
                    <span className="shrink-0 font-mono text-[10px] text-ink-muted/70">
                      {r.published}
                    </span>
                  )}
                </div>
                {r.content && (
                  <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ink-muted">
                    {r.content}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {distinctDomains !== undefined && (
        <p className="text-[10px] text-ink-muted">
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
                className="truncate font-mono text-[10px] text-citation hover:underline"
              >
                {url}
              </a>
            </div>
            <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-raised px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink">
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
          <span className="font-mono text-[11px] text-ink">{site}</span>
          <span className="text-[10px] text-ink-muted">{urls.length} URLs</span>
        </div>
      )}
      <ul className="scroll-thin max-h-72 space-y-0.5 overflow-auto">
        {urls.map((u) => (
          <li key={u}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-mono text-[10px] text-citation hover:underline"
            >
              {u}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToolResult({ call }: { call: ToolCallUI }) {
  const out = call.output as Record<string, unknown> | undefined;

  if (out && typeof out === "object" && out.ok === false) {
    return <ErrorLine error={String(out.error ?? "The tool failed")} />;
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
    return (
      <PathLine
        Icon={FilePlus}
        path={out.path}
        meta={
          typeof out.bytes === "number"
            ? `${formatBytes(out.bytes)}${out.created ? " · new" : ""}`
            : undefined
        }
      />
    );
  }

  if (call.name === "fs_edit" && typeof out?.path === "string") {
    return (
      <PathLine
        Icon={FileCheck2}
        path={out.path}
        meta={
          typeof out.replaced === "number"
            ? `${out.replaced} replacement${out.replaced === 1 ? "" : "s"}`
            : undefined
        }
      />
    );
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

  if (call.name === "web_map" && Array.isArray(out?.urls)) {
    return (
      <SiteMap
        site={out.site as string | undefined}
        urls={out.urls as string[]}
      />
    );
  }

  return <RawJson value={call.output} />;
}

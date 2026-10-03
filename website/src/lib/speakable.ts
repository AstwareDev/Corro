import { type ChartSpec, validateChartSpec } from "@/components/chart/chartSpec";
import type { ChatMessageUI, ToolCallUI } from "./types";

export function toSpeakableText(message: ChatMessageUI): string {
  const parts: string[] = [];
  const prose = speakableMarkdown(message.text);
  if (prose) parts.push(prose);
  for (const block of message.blocks) {
    if (block.kind !== "tools") continue;
    for (const call of block.calls) {
      const summary = summarizeToolCall(call);
      if (summary) parts.push(summary);
    }
  }
  const terminal = stripNoise(parts.join(" "));
  const converted = replaceMeasures(replaceCurrencies(terminal));
  return finish(converted);
}

function speakableMarkdown(markdown: string): string {
  if (!markdown.trim()) return "";
  let text = replaceFences(markdown);
  text = replaceTables(text);
  text = replaceClipLinks(text);
  text = replaceLinks(text);
  text = stripInlineFormatting(text);
  text = stripBlockMarkers(text);
  text = verbalizeMath(text);
  text = replaceCitations(text);
  return text;
}

function replaceFences(markdown: string): string {
  return markdown.replace(
    /```([^\s`]*)\n?([\s\S]*?)(```|$)/g,
    (_match: string, lang: string, body: string) => {
      const language = String(lang ?? "").toLowerCase();
      const raw = String(body ?? "");
      if (language === "chart") return ` ${summarizeChart(raw)} `;
      if (language === "map") return ` ${summarizeMap(raw)} `;
      if (!raw.trim()) return " ";
      return language ? ` Code example in ${language} omitted. ` : " Code example omitted. ";
    },
  );
}

function titleOf(parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null) return "";
  const title = (parsed as Record<string, unknown>).title;
  return typeof title === "string" && title.trim() ? title.trim() : "";
}

function summarizeChart(raw: string): string {
  if (!raw.trim()) return "A chart is shown.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return "A chart is shown.";
  }
  const result = validateChartSpec(parsed);
  if (!result.ok) {
    const title = titleOf(parsed);
    return title ? `Chart titled ${title}.` : "A chart is shown.";
  }
  return chartSentence(result.spec);
}

function chartSentence(spec: ChartSpec): string {
  const measured =
    spec.y?.label ?? spec.series.map((s) => s.name ?? s.key).join(", ");
  const axis = spec.x.label ?? spec.x.key;
  const key = spec.series[0]?.key ?? "";
  const points = spec.data
    .map((row) => ({
      label: String(row[spec.x.key] ?? ""),
      value: typeof row[key] === "number" ? (row[key] as number) : Number.NaN,
    }))
    .filter((p) => Number.isFinite(p.value));
  if (!points.length) return `Chart titled ${spec.title}, showing ${measured} by ${axis}.`;
  const first = points[0];
  const last = points[points.length - 1];
  let top = first;
  let bottom = first;
  for (const p of points) {
    if (p.value > top.value) top = p;
    if (p.value < bottom.value) bottom = p;
  }
  const trend =
    last.value > first.value
      ? "rises overall"
      : last.value < first.value
        ? "falls overall"
        : "stays steady overall";
  return (
    `Chart titled ${spec.title}, showing ${measured} by ${axis}. ` +
    `It ${trend} from ${first.label} to ${last.label}, ` +
    `peaking at ${formatSpokenNumber(top.value)} in ${top.label} ` +
    `and lowest at ${formatSpokenNumber(bottom.value)} in ${bottom.label}.`
  );
}

function formatSpokenNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function unquote(value: string): string {
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

function summarizeMap(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "A map is shown.";
  const query = unquote(lines[0]);
  let label = "";
  if (lines.length >= 2) {
    for (const cell of lines[1].split("|")) {
      const eq = cell.indexOf("=");
      if (eq > 0 && cell.slice(0, eq).trim().toLowerCase() === "label") {
        label = unquote(cell.slice(eq + 1));
      }
    }
  }
  const title = label || query;
  if (!title) return "A map is shown.";
  const comma = title.indexOf(",");
  if (comma > 0) {
    const name = title.slice(0, comma).trim();
    const address = title.slice(comma + 1).trim();
    if (name && address) return `Map of ${name}, ${address}.`;
  }
  return `Map of ${title}.`;
}

interface TableBlock {
  headers: string[];
  rows: number;
  next: number;
}

function replaceTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const table = readTable(lines, i);
    if (table) {
      out.push(tableSentence(table.headers, table.rows));
      i = table.next;
    } else {
      out.push(lines[i]);
      i += 1;
    }
  }
  return out.join("\n");
}

function readTable(lines: string[], start: number): TableBlock | null {
  if (start + 1 >= lines.length) return null;
  const header = lines[start];
  const delimiter = lines[start + 1];
  if (!header.includes("|") || !isDelimiterRow(delimiter)) return null;
  const headers = header
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (!headers.length) return null;
  let rows = 0;
  let next = start + 2;
  while (next < lines.length && lines[next].includes("|")) {
    rows += 1;
    next += 1;
  }
  return { headers, rows, next };
}

function isDelimiterRow(line: string): boolean {
  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function tableSentence(headers: string[], rows: number): string {
  const rowWord = rows === 1 ? "row" : "rows";
  const colWord = headers.length === 1 ? "column" : "columns";
  return `Table with ${rows} ${rowWord} and ${headers.length} ${colWord} covering ${joinList(headers)}.`;
}

function joinList(items: string[]): string {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function replaceClipLinks(text: string): string {
  return text.replace(
    /\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
    (match: string, label: string, href: string) => {
      const clip = parseClipHref(String(href ?? ""));
      if (!clip) return match;
      const name = String(label ?? "").trim() || "Video";
      const end =
        clip.end !== undefined ? ` to ${speakSeconds(clip.end)}` : "";
      return ` ${name}, video clip at ${speakSeconds(clip.start)}${end}. `;
    },
  );
}

function parseClipHref(href: string): { start: number; end?: number } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const startParam = url.searchParams.get("t") ?? url.searchParams.get("start");
  if (!startParam || !/^\d+$/.test(startParam)) return null;
  if (host === "youtu.be") {
    if (!url.pathname.slice(1)) return null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname !== "/watch" || !url.searchParams.get("v")) return null;
  } else {
    return null;
  }
  const start = Number(startParam);
  const endParam = url.searchParams.get("end");
  const end = endParam && /^\d+$/.test(endParam) ? Number(endParam) : undefined;
  if (end !== undefined && !(end > start)) return { start };
  return end === undefined ? { start } : { start, end };
}

function speakSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h} ${h === 1 ? "hour" : "hours"} ${m} ${m === 1 ? "minute" : "minutes"}`;
  if (m > 0 && rest > 0)
    return `${m} ${m === 1 ? "minute" : "minutes"} ${rest} ${rest === 1 ? "second" : "seconds"}`;
  if (m > 0) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  return `${rest} ${rest === 1 ? "second" : "seconds"}`;
}

function replaceLinks(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match: string, alt: string) => {
      const label = String(alt ?? "").trim();
      return label ? ` Image: ${label}. ` : " ";
    })
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, " ");
}

function stripInlineFormatting(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1$2");
}

function stripBlockMarkers(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
        .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/, ""),
    )
    .join("\n")
    .replace(/^\s{0,3}([-*_]\s*){3,}\s*$/gm, " ");
}

function verbalizeMath(text: string): string {
  return text
    .replace(
      /\$\$([\s\S]+?)\$\$/g,
      (_match: string, inner: string) => ` ${verbalizeExpression(String(inner))} `,
    )
    .replace(
      /\\\[([\s\S]+?)\\\]/g,
      (_match: string, inner: string) => ` ${verbalizeExpression(String(inner))} `,
    )
    .replace(
      /\\\((.+?)\\\)/g,
      (_match: string, inner: string) => ` ${verbalizeExpression(String(inner))} `,
    );
}

function verbalizeExpression(expr: string): string {
  return expr
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 over $2")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/[{}]/g, " ")
    .replace(/\^/g, " to the power ")
    .replace(/_/g, " sub ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/(^|\s)-(\s|$)/g, "$1 minus $2")
    .replace(/\*/g, " times ")
    .replace(/\//g, " over ");
}

function replaceCitations(text: string): string {
  return text
    .replace(/\[\^([^\]]*)\]/g, " ")
    .replace(/\[(\d{1,3})\]/g, " source $1 ");
}

function stripNoise(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/www\.\S+/g, " ")
    .replace(
      /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu,
      " ",
    );
}

function currencyWord(code: string): string {
  switch (code.toUpperCase()) {
    case "USD":
      return "US dollars";
    case "AMD":
      return "Armenian drams";
    case "EUR":
      return "euros";
    case "RUB":
      return "Russian rubles";
    case "GBP":
      return "British pounds";
    default:
      return code;
  }
}

function ungroup(amount: string): string {
  return amount.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
}

function replaceCurrencies(text: string): string {
  return text
    .replace(
      /\$\s?([\d,]+(?:\.\d+)?)/g,
      (_match: string, amount: string) => ` ${ungroup(String(amount))} dollars `,
    )
    .replace(
      /([\d,]+(?:\.\d+)?)\s?\$/g,
      (_match: string, amount: string) => ` ${ungroup(String(amount))} dollars `,
    )
    .replace(
      /([\d,]+(?:\.\d+)?)\s?(USD|AMD|EUR|RUB|GBP)\b/gi,
      (_match: string, amount: string, code: string) =>
        ` ${ungroup(String(amount))} ${currencyWord(String(code))} `,
    )
    .replace(
      /(USD|AMD|EUR|RUB|GBP)\s?([\d,]+(?:\.\d+)?)/gi,
      (_match: string, code: string, amount: string) =>
        ` ${ungroup(String(amount))} ${currencyWord(String(code))} `,
    )
    .replace(
      /֏\s?([\d,]+(?:\.\d+)?)/g,
      (_match: string, amount: string) =>
        ` ${ungroup(String(amount))} Armenian drams `,
    )
    .replace(
      /([\d,]+(?:\.\d+)?)\s?֏/g,
      (_match: string, amount: string) =>
        ` ${ungroup(String(amount))} Armenian drams `,
    )
    .replace(
      /€\s?([\d,]+(?:\.\d+)?)/g,
      (_match: string, amount: string) => ` ${ungroup(String(amount))} euros `,
    )
    .replace(
      /([\d,]+(?:\.\d+)?)\s?€/g,
      (_match: string, amount: string) => ` ${ungroup(String(amount))} euros `,
    )
    .replace(/\bUSD\b/g, "US dollars")
    .replace(/\bAMD\b/g, "Armenian drams")
    .replace(/\bEUR\b/g, "euros")
    .replace(/\bRUB\b/g, "Russian rubles")
    .replace(/\bGBP\b/g, "British pounds")
    .replace(/֏/g, "Armenian drams")
    .replace(/\$/g, "dollars");
}

function replaceMeasures(text: string): string {
  return text
    .replace(/(\d),(?=\d{3}(\D|$))/g, "$1")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent")
    .replace(/(\d+(?:\.\d+)?)\s*K\b/g, "$1 thousand")
    .replace(/(\d+(?:\.\d+)?)\s*M\b/g, "$1 million")
    .replace(/(\d+(?:\.\d+)?)\s*B\b/g, "$1 billion")
    .replace(/(\d+(?:\.\d+)?)\s*km\b/g, "$1 kilometers")
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/g, "$1 kilograms")
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/g, "$1 centimeters")
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/g, "$1 millimeters")
    .replace(/(\d+(?:\.\d+)?)\s*ms\b/g, "$1 milliseconds");
}

function finish(text: string): string {
  const sentences = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .map((line) =>
      /[.?!:;\u0589\u055E\u055C)\]"'»]$/.test(line) ? line : `${line}.`,
    );
  return sentences
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function failedOutput(output: unknown): boolean {
  const record = recordOf(output);
  return record !== null && record.ok === false;
}

function named(
  value: unknown,
  code: string,
): { name: string; code: string; converted: number } | null {
  const record = recordOf(value);
  if (!record) return null;
  const converted = numberOf(record.converted);
  if (converted === null) return null;
  const rawCode = stringOf(record.code) || code;
  return {
    name: stringOf(record.name) || currencyWord(rawCode),
    code: rawCode,
    converted,
  };
}

function productPrice(
  value: unknown,
  currency: string,
): string {
  const product = recordOf(value);
  if (!product) return "";
  const name = stringOf(product.name) || "An item";
  const price = numberOf(product.price);
  if (price === null) return name;
  const spoken = `${formatSpokenNumber(price)} ${currencyWord(currency)}`;
  const was = numberOf(product.wasPrice);
  if (was !== null && was > price)
    return `${name} on sale at ${spoken}, was ${formatSpokenNumber(was)}`;
  return `${name} at ${spoken}`;
}

function summarizeToolCall(call: ToolCallUI): string {
  const output = call.output;
  if (output === undefined || failedOutput(output)) return "";
  if (call.name === "calculator") return summarizeCalculator(output);
  if (call.name === "currency_convert") return summarizeConversion(output);
  if (call.name === "ameriabank_rates") return summarizeAmeriabank(output);
  if (call.name === "idbank_rates") return summarizeIdbank(output);
  if (call.name === "web_search") return summarizeSearch(output);
  if (call.name === "web_extract" || call.name === "web_crawl")
    return summarizePages(output);
  if (call.name === "web_map") return summarizeSitemap(output);
  if (call.name === "read_skill") return "";
  if (call.name.startsWith("youtube_"))
    return summarizeYouTube(call.name, output);
  if (call.name.startsWith("instagram_"))
    return summarizeInstagram(call.name, output);
  if (call.name.startsWith("fs_")) return summarizeFile(call.name, output);
  return summarizeShop(call.name, output);
}

function summarizeCalculator(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const expression = stringOf(record.expression);
  const formatted = stringOf(record.formatted);
  if (!expression || !formatted) return "";
  return `${expression} equals ${formatted}.`;
}

function summarizeConversion(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const amount = numberOf(record.amount);
  const from = recordOf(record.from);
  const results = listOf(record.results)
    .map((item) => named(item, ""))
    .filter((item) => item !== null);
  if (amount === null || !from || !results.length) return "";
  const fromCode = stringOf(from.code);
  const fromName = stringOf(from.name) || currencyWord(fromCode);
  const first = results[0];
  const head = `${formatSpokenNumber(amount)} ${fromName} equals ${formatSpokenNumber(first.converted)} ${first.name}.`;
  if (results.length === 1) return head;
  const rest = results
    .slice(1, 3)
    .map((item) => `${formatSpokenNumber(item.converted)} ${item.name}`)
    .join(" and ");
  return `${head} Also ${rest}.`;
}

function rateCodes(rates: unknown[], limit: number): string {
  const codes = rates
    .map((item) => stringOf(recordOf(item)?.code))
    .filter(Boolean)
    .slice(0, limit);
  const total = rates.length;
  if (total > limit) return `${joinList(codes)}, and ${total - limit} more`;
  return joinList(codes);
}

function summarizeAmeriabank(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const conversion = recordOf(record.conversion);
  if (conversion) {
    const amount = numberOf(conversion.amount);
    const from = stringOf(conversion.from);
    const legs = listOf(conversion.results)
      .map((item) => named(item, ""))
      .filter((item) => item !== null);
    if (amount !== null && from && legs.length) {
      const first = legs[0];
      const kind = conversion.cash === true ? "cash" : "non-cash";
      return `${formatSpokenNumber(amount)} ${from} is ${formatSpokenNumber(first.converted)} ${first.code} at ${kind} rates.`;
    }
  }
  const rates = listOf(record.rates);
  if (!rates.length) return "";
  const bank = stringOf(record.bank) || "The bank";
  const base = stringOf(record.base) || "AMD";
  const date = stringOf(record.date);
  return `${bank} rates in ${base}${date ? ` as of ${date}` : ""} for ${rateCodes(rates, 5)}.`;
}

function summarizeIdbank(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const conversion = recordOf(record.conversion);
  if (conversion) {
    const amount = numberOf(conversion.amount);
    const from = stringOf(conversion.from);
    const legs = listOf(conversion.results)
      .map((item) => named(item, ""))
      .filter((item) => item !== null);
    if (amount !== null && from && legs.length) {
      const first = legs[0];
      const kind = stringOf(conversion.kind) || "cash";
      return `${formatSpokenNumber(amount)} ${from} is ${formatSpokenNumber(first.converted)} ${first.code} at ${kind} rates.`;
    }
  }
  const boards = listOf(record.boards).map(recordOf).filter((b) => b !== null);
  const board = boards[0];
  if (!board) return "";
  const rates = listOf(board.rates);
  const bank = stringOf(record.bank) || "The bank";
  const date = stringOf(board.updated) || stringOf(record.date);
  return `${bank} rates${date ? ` as of ${date}` : ""} for ${rateCodes(rates, 5)}.`;
}

function summarizeSearch(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const results = listOf(record.results);
  if (!results.length) return "";
  const titles = results
    .slice(0, 2)
    .map((item) => stringOf(recordOf(item)?.title))
    .filter(Boolean);
  return `${results.length} web results${titles.length ? `, including ${joinList(titles)}` : ""}.`;
}

function summarizePages(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const pages = listOf(record.pages);
  if (!pages.length) return "";
  const failed = listOf(record.failed);
  return `Read ${pages.length} ${pages.length === 1 ? "page" : "pages"}.${failed.length ? ` ${failed.length} failed to load.` : ""}`;
}

function summarizeSitemap(output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const urls = listOf(record.urls);
  if (!urls.length) return "";
  const site = stringOf(record.site);
  return `${urls.length} links found${site ? ` on ${site}` : ""}.`;
}

function summarizeYouTube(name: string, output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  if (name === "youtube_channel") {
    const title = stringOf(record.title) || "A channel";
    const subs = stringOf(record.subscriberText);
    const count = numberOf(record.subscriberCount);
    const suffix = subs
      ? ` with ${subs}`
      : count !== null
        ? ` with ${count} subscribers`
        : "";
    return `YouTube channel ${title}${suffix}.`;
  }
  if (name === "youtube_channel_videos") {
    const videos = listOf(record.videos);
    if (!videos.length) return "No videos on this channel page.";
    const titles = videos
      .slice(0, 3)
      .map((item) => stringOf(recordOf(item)?.title))
      .filter(Boolean);
    return `${videos.length} videos${titles.length ? `: ${joinList(titles)}` : ""}.`;
  }
  if (name === "youtube_video") {
    const title = stringOf(record.title) || "A video";
    const seconds = numberOf(record.durationSeconds);
    const views = stringOf(record.viewText);
    const count = numberOf(record.viewCount);
    const duration = seconds !== null ? `, ${speakDuration(seconds)} long` : "";
    const audience = views
      ? `, ${views}`
      : count !== null
        ? `, ${count} views`
        : "";
    return `Video ${title}${duration}${audience}.`;
  }
  if (name === "youtube_comments") {
    const comments = listOf(record.comments);
    if (!comments.length) return "No comments shown.";
    const authors = comments
      .slice(0, 2)
      .map((item) => stringOf(recordOf(item)?.author))
      .filter(Boolean);
    return `${comments.length} comments shown${authors.length ? `, including ${joinList(authors)}` : ""}.`;
  }
  if (name === "youtube_transcript") {
    const title = stringOf(record.title);
    const picked = recordOf(record.picked);
    const words = numberOf(record.wordCount);
    const language = picked ? stringOf(picked.name) : "";
    return `Video captions${title ? ` for ${title}` : ""}${language ? ` in ${language}` : ""}${words !== null ? ` with ${words} words` : ""}.`;
  }
  return "";
}

function speakDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h} hour ${m} minute`;
  if (m > 0 && rest > 0) return `${m} minutes ${rest} seconds`;
  if (m > 0) return `${m} minutes`;
  return `${rest} seconds`;
}

function summarizeInstagram(name: string, output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  if (name === "instagram_profile") {
    const profile = recordOf(record.profile);
    const username = profile ? stringOf(profile.username) : "";
    const followers = profile ? numberOf(profile.followers) : null;
    return `Instagram profile ${username || "unknown"}${followers !== null ? ` with ${followers} followers` : ""}.`;
  }
  if (name === "instagram_posts") {
    const posts = listOf(record.posts);
    return `${posts.length} Instagram posts shown.`;
  }
  if (name === "instagram_post") {
    const owner = stringOf(record.ownerUsername);
    return `Instagram post${owner ? ` by ${owner}` : ""}.`;
  }
  if (name === "instagram_comments") {
    const comments = listOf(record.comments);
    return `${comments.length} Instagram comments shown.`;
  }
  return "";
}

function summarizeFile(name: string, output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  if (name === "fs_list") {
    const files = listOf(record.files);
    return files.length ? `${files.length} files in the workspace.` : "The workspace is empty.";
  }
  if (name === "fs_search") {
    const matches = listOf(record.matches);
    const pattern = stringOf(record.pattern);
    return `${matches.length} matches${pattern ? ` for ${pattern}` : ""}.`;
  }
  if (name === "fs_read") return `Read file ${stringOf(record.path)}.`;
  if (name === "fs_write" || name === "fs_edit")
    return `Saved file ${stringOf(record.path)}.`;
  if (name === "fs_delete") return `Deleted ${stringOf(record.path)}.`;
  if (name === "fs_rename")
    return `Renamed ${stringOf(record.from)} to ${stringOf(record.to)}.`;
  return "";
}

function summarizeShop(name: string, output: unknown): string {
  const record = recordOf(output);
  if (!record) return "";
  const currency = stringOf(record.currency) || "AMD";
  if (name.endsWith("_search")) {
    const products = listOf(record.products);
    if (!products.length) return "No products matched.";
    const query = stringOf(record.query);
    const total = numberOf(record.totalMatches) ?? products.length;
    const head = products
      .slice(0, 3)
      .map((item) => productPrice(item, currency))
      .filter(Boolean)
      .join("; ");
    return `Found ${total} products${query ? ` for ${query}` : ""}: ${head}.`;
  }
  if (name.endsWith("_product")) {
    const head = listOf(record.products)
      .slice(0, 2)
      .map((item) => productPrice(item, currency))
      .filter(Boolean)
      .join(". ");
    return head ? `${head}.` : "";
  }
  if (name.endsWith("_categories")) {
    const names = listOf(record.categories)
      .map((item) => stringOf(recordOf(item)?.name))
      .filter(Boolean)
      .slice(0, 6);
    return names.length ? `${names.length} categories: ${joinList(names)}.` : "";
  }
  if (name.endsWith("_stores")) {
    const branches = listOf(record.branches).map(recordOf).filter((b) => b !== null);
    if (!branches.length) return "No branches matched.";
    const first = branches[0];
    const nearest =
      first && (stringOf(first.name) || stringOf(first.address))
        ? ` Nearest: ${stringOf(first.name)}${stringOf(first.address) ? `, ${stringOf(first.address)}` : ""}.`
        : "";
    return `${branches.length} branches.${nearest}`;
  }
  return "";
}

export type Effort = string;

const EFFORT_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  "kimi-k3": { low: "Standard" },
  "qwen3-max": { low: "Fast", medium: "Standard", xhigh: "Max" },
};

export function effortLabel(key: Effort, familyId?: string): string {
  const override = familyId && EFFORT_LABEL_OVERRIDES[familyId]?.[key];
  if (override) return override;
  if (key === "none") return "None";
  if (key === "xhigh") return "Extra high";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function effortOptions(
  m?: ModelDescription,
  familyId?: string,
): { key: Effort; label: string }[] {
  const efforts = m?.reasoningEfforts?.length
    ? m.reasoningEfforts
    : ["low", "high", "max"];
  return efforts.map((key) => ({ key, label: effortLabel(key, familyId) }));
}

export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelDescription {
  key: string;
  id: string;
  label: string;
  speed: "variable" | "fast";
  free: boolean;
  notes: string;
  isDefault: boolean;
  online: boolean;
  error?: string;
  requiresKey: boolean;
  description?: string;
  contextLength?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  modalities?: ModelModalities;
  features?: string[];
  ownedBy?: string;
}

export interface ModelFamily {
  id: string;
  label: string;
  standard: ModelDescription;
  fast?: ModelDescription;
}

function familyLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function groupModels(models: ModelDescription[]): ModelFamily[] {
  const families = new Map<string, ModelFamily>();

  for (const m of models) {
    const isFast = m.key.endsWith("-fast");
    const id = isFast ? m.key.slice(0, -"-fast".length) : m.key;
    const existing = families.get(id);

    if (isFast) {
      if (existing) existing.fast = m;
      else
        families.set(id, {
          id,
          label: familyLabel(m.label),
          standard: m,
          fast: m,
        });
    } else if (existing) {
      existing.standard = m;
      existing.label = familyLabel(m.label);
    } else {
      families.set(id, { id, label: familyLabel(m.label), standard: m });
    }
  }

  return [...families.values()];
}

export function findFamily(
  families: ModelFamily[],
  modelKey: string,
): ModelFamily | undefined {
  return families.find(
    (f) => f.standard.key === modelKey || f.fast?.key === modelKey,
  );
}

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export function toolResultStatus(output: unknown): ToolCallStatus {
  if (output === undefined) return "error";
  const result = output as { ok?: boolean; error?: unknown } | null;
  return result?.ok === false || !!result?.error ? "error" : "done";
}

export interface ToolCallUI {
  localId: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: ToolCallStatus;
  startedAt: number;
  endedAt?: number;
  /** Agent step this call belongs to (from start-step/finish-step). Used to
   *  group tool calls by step and show a live step counter. Keyed by
   *  toolCallId (localId), never by index, so parallel calls never overwrite. */
  step?: number;

  description?: string;

  partial?: string;
}

export function humanizeToolName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function peekDescription(partial: string): string | undefined {
  const match = /"description"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(partial);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

export function peekWidgetTitle(partial?: string): string | undefined {
  if (!partial) return undefined;
  const match = /"title"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(partial);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function peekStringField(partial: string, field: string): string | undefined {
  // Never JSON.parse the partial object itself (it is incomplete). Only
  // decode a single string value via regex, mirroring peekDescription.
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`);
  const match = re.exec(partial);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function peekFirstUrl(partial: string): string | undefined {
  const single = peekStringField(partial, "url");
  if (single) return single;
  const match = /"urls"\s*:\s*\[\s*"((?:[^"\\]|\\.)*)/.exec(partial);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

/** Early header for live rows: query/URL/title as soon as it streams. */
export function peekLiveInput(
  input: unknown,
  partial?: string,
): string | undefined {
  const record =
    input !== null && typeof input === "object"
      ? (input as Record<string, unknown>)
      : undefined;
  if (typeof record?.query === "string" && record.query) return record.query;
  if (typeof record?.title === "string" && record.title) return record.title;
  if (typeof record?.path === "string" && record.path) return record.path;
  if (typeof record?.url === "string" && record.url) return record.url;
  if (Array.isArray(record?.urls) && typeof record.urls[0] === "string")
    return record.urls[0] as string;
  if (!partial) return undefined;
  return (
    peekStringField(partial, "query") ??
    peekStringField(partial, "title") ??
    peekStringField(partial, "path") ??
    peekFirstUrl(partial)
  );
}

/** Live header while a run is in progress, e.g. "Searching: <query>". */
export function liveStepLabel(call: ToolCallUI): string {
  const detail = peekLiveInput(call.input, call.partial);
  if (call.name === "web_search")
    return detail ? `Searching: ${detail}` : "Searching";
  if (
    call.name === "web_extract" ||
    call.name === "web_crawl" ||
    call.name === "web_map"
  )
    return detail ? `Reading: ${detail}` : "Reading";
  if (call.name === "show_widget")
    return detail ? `Writing widget: ${detail}` : "Writing widget";
  if (call.description) return call.description;
  if (detail) return `${humanizeToolName(call.name)}: ${detail}`;
  return humanizeToolName(call.name);
}

export type MessageBlock =
  | {
      kind: "reasoning";
      id: string;
      text: string;
      startedAt: number;
      endedAt?: number;
    }
  | { kind: "text"; id: string; text: string }
  | { kind: "tools"; id: string; calls: ToolCallUI[] };

export interface MessageAttachment {
  name: string;
  path: string;
  kind: "image" | "video" | "file";
  mime?: string;
  bytes: number;
  viewUrl: string;
}

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";

  text: string;
  blocks: MessageBlock[];
  attachments?: MessageAttachment[];
  streaming?: boolean;
  error?: string;
  createdAt: number;

  firstTokenAt?: number;
  completedAt?: number;
  model?: string;
  /** Live agent step (1-indexed) while streaming. Set from start-step events
   *  so the header can show "Step N" before the run finishes. Cleared on
   *  done; the settled summary uses Thought-for/steps instead. */
  liveStep?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export const USAGE_KINDS = [
  "system",
  "tools",
  "history",
  "toolTraffic",
  "input",
  "overhead",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface ContextUsage {
  contextLength: number;
  used: number;
  remaining: number;
  percentUsed: number;
  breakdown: Record<UsageKind, number>;
}

export const DISPLAY_CONTEXT_MAX = 512_000;

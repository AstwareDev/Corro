import type { ContextUsage, ModelDescription } from "./types";
import { notifyWorkspaceChanged } from "./workspace-events";

export const API_URL =
  process.env.NEXT_PUBLIC_CORRO_API_URL ?? "http://localhost:8787";

export function resolveAssetUrl(url: string): string {
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

const DEVICE_STORAGE_KEY = "corro_device_id";
const REGION_CODE = /^[A-Z]{2}$/;

const NGROK_HEADERS = { "ngrok-skip-browser-warning": "true" } as const;

let clientRegion: Promise<string | undefined> | undefined;

async function getClientRegion(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;

  clientRegion ??= fetch("/api/client-region", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return undefined;
      const data = (await response.json()) as { region?: unknown };
      return typeof data.region === "string" && REGION_CODE.test(data.region)
        ? data.region
        : undefined;
    })
    .catch(() => undefined);

  return clientRegion;
}

export function getStoredDevice(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(DEVICE_STORAGE_KEY) ?? undefined;
}

function storeDevice(id: string | null) {
  if (typeof window === "undefined" || !id) return;
  window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
}

export type SseEvent =
  | { type: "start"; model: string; tools: string[]; context?: ContextUsage }
  | { type: "session"; id: string; title: string }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-input-start"; id: string; name: string }
  | { type: "tool-input-delta"; id: string; delta: string }
  | { type: "tool-call"; id?: string; name: string; input: unknown }
  | { type: "tool-result"; id?: string; name: string; output: unknown }
  | { type: "context"; context: ContextUsage }
  | { type: "usage"; usage: unknown; context?: ContextUsage }
  | { type: "done"; [key: string]: unknown }
  | { type: "error"; error: string };

async function* sseEvents(
  response: Response,
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    for (
      let split = buffer.indexOf("\n\n");
      split !== -1;
      split = buffer.indexOf("\n\n")
    ) {
      const raw = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        yield { event, data: JSON.parse(dataLines.join("\n")) };
      } catch {
        yield { event, data: { raw: dataLines.join("\n") } };
      }
    }
  }
}

export interface ChatAttachment {
  path: string;
  kind: "image" | "video" | "file";
  mime?: string;
}

export interface AskParams {
  message: string;
  session?: string | null;
  model?: string;
  reasoningEffort?: string;
  tools?: string[];
  attachments?: ChatAttachment[];
  signal?: AbortSignal;
}

export async function* streamChat(
  params: AskParams,
): AsyncGenerator<SseEvent, void, unknown> {
  const device = getStoredDevice();
  const region = await getClientRegion();
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...NGROK_HEADERS,
      ...(device ? { "X-Corro-Device": device } : {}),
    },
    body: JSON.stringify({
      message: params.message,
      session: params.session,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      tools: params.tools,
      attachments: params.attachments,
      region,
      stream: true,
    }),
    signal: params.signal,
  });

  const responseDevice = response.headers.get("X-Corro-Device");
  if (responseDevice) storeDevice(responseDevice);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      detail.slice(0, 500) || `Corro returned ${response.status}`,
    );
  }

  for await (const { event, data } of sseEvents(response)) {
    if (event === "session") {
      yield {
        type: "session",
        id: data.id as string,
        title: data.title as string,
      };
    } else if (event === "text") {
      yield { type: "text", text: data.text as string };
    } else if (event === "reasoning") {
      yield { type: "reasoning", text: data.text as string };
    } else if (event === "tool-input-start") {
      yield {
        type: "tool-input-start",
        id: data.id as string,
        name: data.name as string,
      };
    } else if (event === "tool-input-delta") {
      yield {
        type: "tool-input-delta",
        id: data.id as string,
        delta: data.delta as string,
      };
    } else if (event === "tool-call") {
      yield {
        type: "tool-call",
        id: data.id as string | undefined,
        name: data.name as string,
        input: data.input,
      };
    } else if (event === "tool-result") {
      yield {
        type: "tool-result",
        id: data.id as string | undefined,
        name: data.name as string,
        output: data.output,
      };
    } else if (event === "start") {
      yield {
        type: "start",
        model: data.model as string,
        tools: (data.tools as string[]) ?? [],
        context: data.context as ContextUsage | undefined,
      };
    } else if (event === "context") {
      yield { type: "context", context: data.context as ContextUsage };
    } else if (event === "usage") {
      yield {
        type: "usage",
        usage: data.usage,
        context: data.context as ContextUsage | undefined,
      };
    } else if (event === "done") {
      yield { type: "done", ...data };
    } else if (event === "error") {
      yield {
        type: "error",
        error: String(data.error ?? "Corro stream failed"),
      };
    }
  }
}

export interface WorkspaceFile {
  path: string;
  bytes: number;
  modifiedAt: string;
}

export interface WorkspaceDocument extends WorkspaceFile {
  content: string;
  revision: string;
}

async function workspaceError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

export async function saveWorkspaceFile(
  path: string,
  content: string,
  expectedRevision: string | null,
  sessionId?: string | null,
) {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace/file?${sessionQuery(sessionId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
      body: JSON.stringify({ path, content, expectedRevision }),
    },
  );
  if (!response.ok) throw await workspaceError(response, "Could not save file");
  const result = (await response.json()) as WorkspaceFile & {
    revision: string;
    verified: boolean;
    changed: boolean;
  };
  if (!result.verified)
    throw new Error(
      "The server did not confirm the saved file. Reload to check it.",
    );
  notifyWorkspaceChanged(sessionId);
  return result;
}

function sessionQuery(sessionId?: string | null): string {
  return sessionId ? `session=${encodeURIComponent(sessionId)}` : "";
}

export interface UploadResult {
  path: string;
  bytes: number;
  mime: string;
  kind: "image" | "video" | "file";
  viewUrl: string;
  session?: string;
  sessionId?: string;
}

export async function uploadAttachment(
  file: File,
  sessionId?: string | null,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  // Uploads are private to a single chat: the backend stores them in that
  // session's workspace and mints a session when none is given, returning
  // its id so the chat can continue in the same session.
  const response = await fetch(
    `${API_URL}/uploads?${sessionQuery(sessionId)}`,
    {
      method: "POST",
      headers: deviceHeaders(),
      body: form,
    },
  );
  if (!response.ok) throw await workspaceError(response, "Upload failed");
  const result = (await response.json()) as UploadResult & { ok: boolean };
  const resolvedSession = result.sessionId ?? result.session ?? sessionId ?? undefined;
  notifyWorkspaceChanged(resolvedSession);
  return result;
}

export interface BrowserPage {
  index: number;
  url: string;
  title: string;
  active: boolean;
}

function deviceHeaders(): Record<string, string> {
  const device = getStoredDevice();
  return { ...NGROK_HEADERS, ...(device ? { "X-Corro-Device": device } : {}) };
}

export async function fetchBrowserPages(
  sessionId?: string | null,
): Promise<BrowserPage[]> {
  const response = await fetch(
    `${API_URL}/browser?${sessionQuery(sessionId)}`,
    {
      cache: "no-store",
      headers: deviceHeaders(),
    },
  );
  if (!response.ok)
    throw new Error(`Failed to load browser: ${response.status}`);
  const json = (await response.json()) as { data?: BrowserPage[] };
  return json.data ?? [];
}

export function browserLiveWsUrl(sessionId?: string | null): string {
  const device = getStoredDevice();
  const params = new URLSearchParams();
  if (sessionId) params.set("session", sessionId);
  if (device) params.set("device", device);
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/browser/live?${params}`;
}

export function browserViewUrl(
  sessionId: string | null | undefined,
  index: number,
  nonce: number,
): string {
  const device = getStoredDevice();
  const params = new URLSearchParams({
    index: String(index),
    t: String(nonce),
  });
  if (sessionId) params.set("session", sessionId);
  if (device) params.set("device", device);
  return `${API_URL}/browser/view?${params}`;
}

async function browserAction<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...deviceHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok)
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  return json;
}

export function activateBrowserPage(
  sessionId: string | null | undefined,
  index: number,
): Promise<{ data: BrowserPage[] }> {
  return browserAction("/browser/activate", {
    session: sessionId ?? null,
    index,
  });
}

export function closeBrowserPage(
  sessionId: string | null | undefined,
  index: number,
): Promise<{ data: BrowserPage[] }> {
  return browserAction("/browser/page/close", {
    session: sessionId ?? null,
    index,
  });
}

export async function captureBrowserScreenshot(
  sessionId: string | null | undefined,
  index: number,
): Promise<{ path: string }> {
  const result = await browserAction<{ path: string }>("/browser/screenshot", {
    session: sessionId ?? null,
    index,
  });
  notifyWorkspaceChanged(sessionId ?? undefined);
  return result;
}

export async function closeBrowser(sessionId?: string | null): Promise<void> {
  await fetch(`${API_URL}/browser?${sessionQuery(sessionId)}`, {
    method: "DELETE",
    headers: deviceHeaders(),
  });
}

export async function fetchWorkspace(
  sessionId?: string | null,
): Promise<WorkspaceFile[]> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace?${sessionQuery(sessionId)}`,
    {
      cache: "no-store",
      headers: {
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
    },
  );
  if (!response.ok)
    throw new Error(`Failed to load workspace: ${response.status}`);
  const json = (await response.json()) as { data?: WorkspaceFile[] };
  return json.data ?? [];
}

export function workspaceViewUrl(
  path: string,
  sessionId?: string | null,
  opts?: { download?: boolean },
): string {
  const device = getStoredDevice();
  const params = new URLSearchParams({ path });
  if (sessionId) params.set("session", sessionId);
  if (device) params.set("device", device);
  if (opts?.download) params.set("download", "1");
  return `${API_URL}/workspace/view?${params}`;
}

export async function fetchWorkspaceFile(
  path: string,
  sessionId?: string | null,
): Promise<WorkspaceDocument> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace/file?path=${encodeURIComponent(path)}&${sessionQuery(sessionId)}`,
    {
      cache: "no-store",
      headers: {
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
    },
  );
  if (!response.ok)
    throw await workspaceError(response, `Could not read ${path}`);
  return (await response.json()) as WorkspaceDocument;
}

export async function deleteWorkspaceFile(
  path: string,
  sessionId?: string | null,
): Promise<void> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace/file?path=${encodeURIComponent(path)}&${sessionQuery(sessionId)}`,
    {
      method: "DELETE",
      headers: {
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
    },
  );
  if (!response.ok)
    throw await workspaceError(response, `Could not delete ${path}`);
  notifyWorkspaceChanged(sessionId);
}

export interface SpeechStatus {
  available: boolean;
  voiceId: string;
  maxChars: number;
}

export async function fetchSpeechStatus(): Promise<SpeechStatus> {
  const response = await fetch(`${API_URL}/speech`, { headers: NGROK_HEADERS });
  if (!response.ok) throw new Error("Speech unavailable");
  return (await response.json()) as SpeechStatus;
}

export async function synthesiseSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`${API_URL}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADERS },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    let message = `Speech failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  return await response.blob();
}

export interface SessionTotals {
  requests: number;
  steps: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  pinned?: boolean;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totals: SessionTotals;
  context?: ContextUsage;
}

export interface StoredToolCall {
  name: string;
  input: unknown;
  output?: unknown;
}

export interface StoredMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  at: string;
  tokens?: number;
  toolCalls?: StoredToolCall[];
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface SessionDetail extends SessionSummary {
  messages: StoredMessage[];
}

export async function createWorkspaceSession(
  model?: string,
): Promise<SessionDetail> {
  const device = getStoredDevice();
  const response = await fetch(`${API_URL}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...NGROK_HEADERS,
      ...(device ? { "X-Corro-Device": device } : {}),
    },
    body: JSON.stringify({ model: model || undefined }),
  });
  if (!response.ok)
    throw await workspaceError(response, "Could not create a workspace");
  storeDevice(response.headers.get("X-Corro-Device"));
  return (await response.json()) as SessionDetail;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const device = getStoredDevice();
  const response = await fetch(`${API_URL}/sessions`, {
    headers: {
      ...NGROK_HEADERS,
      ...(device ? { "X-Corro-Device": device } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`Failed to load sessions: ${response.status}`);
  const json = (await response.json()) as { data?: SessionSummary[] };
  const responseDevice = response.headers.get("X-Corro-Device");
  if (responseDevice) storeDevice(responseDevice);
  return json.data ?? [];
}

export async function fetchSession(id: string): Promise<SessionDetail> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/sessions/${encodeURIComponent(id)}`,
    {
      headers: {
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
    },
  );
  if (!response.ok)
    throw new Error(`Failed to load session: ${response.status}`);
  return (await response.json()) as SessionDetail;
}

export async function renameSession(id: string, title: string): Promise<void> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/sessions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
      body: JSON.stringify({ title }),
    },
  );
  if (!response.ok)
    throw new Error(`Failed to rename session: ${response.status}`);
}

export async function pinSession(id: string, pinned: boolean): Promise<void> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/sessions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
      body: JSON.stringify({ pinned }),
    },
  );
  if (!response.ok) throw new Error(`Failed to update pin: ${response.status}`);
}

export async function deleteSession(id: string): Promise<void> {
  const device = getStoredDevice();
  await fetch(`${API_URL}/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      ...NGROK_HEADERS,
      ...(device ? { "X-Corro-Device": device } : {}),
    },
  });
}

export async function fetchSuggestions(
  userMessage: string,
  assistantMessage: string,
): Promise<string[]> {
  try {
    const device = getStoredDevice();
    const response = await fetch(`${API_URL}/suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...NGROK_HEADERS,
        ...(device ? { "X-Corro-Device": device } : {}),
      },
      body: JSON.stringify({ userMessage, assistantMessage }),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: string[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchModels(): Promise<ModelDescription[]> {
  const device = getStoredDevice();
  const response = await fetch(`${API_URL}/models`, {
    headers: {
      ...NGROK_HEADERS,
      ...(device ? { "X-Corro-Device": device } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`Failed to load models: ${response.status}`);
  const json = (await response.json()) as { data?: ModelDescription[] };
  const responseDevice = response.headers.get("X-Corro-Device");
  if (responseDevice) storeDevice(responseDevice);
  return json.data ?? [];
}

export interface SkillDescription {
  name: string;
  description: string;
}

let cachedSkills: Promise<SkillDescription[]> | undefined;

export function fetchSkills(): Promise<SkillDescription[]> {
  cachedSkills ??= fetch(`${API_URL}/skills`, { headers: NGROK_HEADERS })
    .then(async (response) => {
      if (!response.ok) return [];
      const json = (await response.json()) as {
        data?: SkillDescription[];
      };
      return (json.data ?? []).filter(
        (s) => typeof s?.name === "string" && typeof s?.description === "string",
      );
    })
    .catch(() => []);
  return cachedSkills;
}

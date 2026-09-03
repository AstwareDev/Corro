import type { ContextUsage, ModelDescription } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_CORRO_API_URL ?? "http://localhost:8787";

const DEVICE_STORAGE_KEY = "corro_device_id";
const REGION_CODE = /^[A-Z]{2}$/;

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

export interface AskParams {
  message: string;
  session?: string | null;
  model?: string;
  reasoningEffort?: string;
  tools?: string[];
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
      ...(device ? { "X-Corro-Device": device } : {}),
    },
    body: JSON.stringify({
      message: params.message,
      session: params.session,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      tools: params.tools,
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

function sessionQuery(sessionId?: string | null): string {
  return sessionId ? `session=${encodeURIComponent(sessionId)}` : "";
}

export async function fetchWorkspace(
  sessionId?: string | null,
): Promise<WorkspaceFile[]> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace?${sessionQuery(sessionId)}`,
    { headers: device ? { "X-Corro-Device": device } : {} },
  );
  if (!response.ok)
    throw new Error(`Failed to load workspace: ${response.status}`);
  const json = (await response.json()) as { data?: WorkspaceFile[] };
  return json.data ?? [];
}

export async function fetchWorkspaceFile(
  path: string,
  sessionId?: string | null,
): Promise<{ path: string; content: string; bytes: number }> {
  const device = getStoredDevice();
  const response = await fetch(
    `${API_URL}/workspace/file?path=${encodeURIComponent(path)}&${sessionQuery(sessionId)}`,
    { headers: device ? { "X-Corro-Device": device } : {} },
  );
  if (!response.ok) throw new Error(`Could not read ${path}`);
  return (await response.json()) as {
    path: string;
    content: string;
    bytes: number;
  };
}

export async function deleteWorkspaceFile(
  path: string,
  sessionId?: string | null,
): Promise<void> {
  const device = getStoredDevice();
  await fetch(
    `${API_URL}/workspace/file?path=${encodeURIComponent(path)}&${sessionQuery(sessionId)}`,
    {
      method: "DELETE",
      headers: device ? { "X-Corro-Device": device } : {},
    },
  );
}

export interface SpeechStatus {
  available: boolean;
  voiceId: string;
  maxChars: number;
}

export async function fetchSpeechStatus(): Promise<SpeechStatus> {
  const response = await fetch(`${API_URL}/speech`);
  if (!response.ok) throw new Error("Speech unavailable");
  return (await response.json()) as SpeechStatus;
}





export async function synthesiseSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`${API_URL}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    let message = `Speech failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      
    }
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

export async function fetchSessions(): Promise<SessionSummary[]> {
  const device = getStoredDevice();
  const response = await fetch(`${API_URL}/sessions`, {
    headers: device ? { "X-Corro-Device": device } : {},
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
    { headers: device ? { "X-Corro-Device": device } : {} },
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
        ...(device ? { "X-Corro-Device": device } : {}),
      },
      body: JSON.stringify({ pinned }),
    },
  );
  if (!response.ok)
    throw new Error(`Failed to update pin: ${response.status}`);
}

export async function deleteSession(id: string): Promise<void> {
  const device = getStoredDevice();
  await fetch(`${API_URL}/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: device ? { "X-Corro-Device": device } : {},
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
    headers: device ? { "X-Corro-Device": device } : {},
  });
  if (!response.ok)
    throw new Error(`Failed to load models: ${response.status}`);
  const json = (await response.json()) as { data?: ModelDescription[] };
  const responseDevice = response.headers.get("X-Corro-Device");
  if (responseDevice) storeDevice(responseDevice);
  return json.data ?? [];
}

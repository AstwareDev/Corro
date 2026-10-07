"use client";

import { useSyncExternalStore } from "react";

export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  builtin?: boolean;
  apiKey?: string;
}

export interface Customization {
  mcpServers: McpServer[];
  disabledSkills: string[];
  disabledTools: string[];
}

export const COMPOSIO = {
  id: "composio",
  name: "Composio",
  url: "https://connect.composio.dev/mcp",
  description:
    "Connect Corro to hundreds of apps through Composio's MCP gateway.",
} as const;

const STORAGE_KEY = "corro_customize";

const DEFAULTS: Customization = {
  mcpServers: [],
  disabledSkills: [],
  disabledTools: [],
};

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanServer(value: unknown): McpServer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  if (typeof record.url !== "string" || !isServerUrl(record.url)) return null;
  return {
    id: typeof record.id === "string" && record.id ? record.id : uid(),
    name: record.name.trim(),
    url: record.url.trim(),
    enabled: record.enabled !== false,
    ...(record.builtin === true ? { builtin: true as const } : {}),
    ...(typeof record.apiKey === "string" && record.apiKey
      ? { apiKey: record.apiKey }
      : {}),
  };
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((v): v is string => typeof v === "string" && !!v)),
  ];
}

function read(): Customization {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    const record = parsed as Record<string, unknown>;
    return {
      mcpServers: Array.isArray(record.mcpServers)
        ? record.mcpServers
            .map(cleanServer)
            .filter((s): s is McpServer => s !== null)
        : [],
      disabledSkills: cleanList(record.disabledSkills),
      disabledTools: cleanList(record.disabledTools),
    };
  } catch {
    return DEFAULTS;
  }
}

let state: Customization | null = null;
const listeners = new Set<() => void>();

function current(): Customization {
  if (typeof window === "undefined") return DEFAULTS;
  state ??= read();
  return state;
}

function persist(next: Customization) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  for (const listener of listeners) listener();
}

export function subscribeCustomization(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCustomization(): Customization {
  return current();
}

export function useCustomization(): Customization {
  return useSyncExternalStore(subscribeCustomization, current, () => DEFAULTS);
}

export function isServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function addMcpServer(
  customization: Customization,
  name: string,
  url: string,
): { next: Customization; error?: string } {
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (!trimmedName) return { next: customization, error: "Name the server." };
  if (!isServerUrl(trimmedUrl))
    return { next: customization, error: "Use an http(s) server URL." };
  if (
    customization.mcpServers.some(
      (s) => s.url.toLowerCase() === trimmedUrl.toLowerCase(),
    )
  )
    return { next: customization, error: "That server is already added." };
  return {
    next: {
      ...customization,
      mcpServers: [
        ...customization.mcpServers,
        { id: uid(), name: trimmedName, url: trimmedUrl, enabled: true },
      ],
    },
  };
}

export function removeMcpServer(
  customization: Customization,
  id: string,
): Customization {
  return {
    ...customization,
    mcpServers: customization.mcpServers.filter((s) => s.id !== id),
  };
}

export function userMcpServers(customization: Customization): McpServer[] {
  return customization.mcpServers.filter((s) => !s.builtin);
}

export function findMcpServer(
  customization: Customization,
  id: string,
): McpServer | undefined {
  return customization.mcpServers.find((s) => s.id === id);
}

export function isMcpConnected(
  customization: Customization,
  id: string,
): boolean {
  const server = findMcpServer(customization, id);
  return Boolean(server?.builtin && server.apiKey);
}

export function connectBuiltinServer(
  customization: Customization,
  id: string,
  name: string,
  url: string,
  apiKey: string,
): { next: Customization; error?: string } {
  if (!apiKey.trim())
    return { next: customization, error: "Paste an API key first." };
  const rest = customization.mcpServers.filter((s) => s.id !== id);
  return {
    next: {
      ...customization,
      mcpServers: [
        ...rest,
        { id, name, url, enabled: true, builtin: true, apiKey: apiKey.trim() },
      ],
    },
  };
}

export function disconnectBuiltinServer(
  customization: Customization,
  id: string,
): Customization {
  return {
    ...customization,
    mcpServers: customization.mcpServers.filter((s) => s.id !== id),
  };
}

export function setMcpServerEnabled(
  customization: Customization,
  id: string,
  enabled: boolean,
): Customization {
  return {
    ...customization,
    mcpServers: customization.mcpServers.map((s) =>
      s.id === id ? { ...s, enabled } : s,
    ),
  };
}

export function setSkillEnabled(
  customization: Customization,
  name: string,
  enabled: boolean,
): Customization {
  const disabled = new Set(customization.disabledSkills);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  return { ...customization, disabledSkills: [...disabled] };
}

export function setToolEnabled(
  customization: Customization,
  name: string,
  enabled: boolean,
): Customization {
  const disabled = new Set(customization.disabledTools);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  return { ...customization, disabledTools: [...disabled] };
}

export function isSkillEnabled(
  customization: Customization,
  name: string,
): boolean {
  return !customization.disabledSkills.includes(name);
}

export function enabledToolNames(
  all: string[],
  disabled: string[],
): string[] | undefined {
  if (!disabled.length) return undefined;
  const off = new Set(disabled);
  return all.filter((name) => !off.has(name));
}

export function updateCustomization(
  patch: (customization: Customization) => Customization,
): void {
  persist(patch(current()));
}

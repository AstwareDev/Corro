"use client";

import clsx from "clsx";
import { Check, Plug, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMcpServer,
  COMPOSIO,
  connectBuiltinServer,
  getCustomization,
  isMcpConnected,
  isSkillEnabled,
  removeMcpServer,
  setMcpServerEnabled,
  setSkillEnabled,
  setToolEnabled,
  updateCustomization,
  useCustomization,
  userMcpServers,
} from "@/lib/customize";
import { ComposioMark } from "./ComposioMark";
import { presentTool, SkillIcon } from "./tools/registry";

export function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <div className="mt-1 text-footnote text-ink">{children}</div>
    </div>
  );
}

export function Switch({
  on,
  label,
  onFlip,
}: {
  on: boolean;
  label: string;
  onFlip: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onFlip}
      className={clsx("settings-switch shrink-0", on && "is-on")}
    >
      <span />
    </button>
  );
}

function Card({
  href,
  control,
  children,
}: {
  href: string;
  control?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 transition-colors hover:border-border-strong">
      <Link
        href={href}
        aria-label="Open details"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 outline-none"
      >
        {children}
      </Link>
      {control}
    </div>
  );
}

function CardThumb({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink-muted">
      {children}
    </span>
  );
}

export function McpYoursList({ query }: { query: string }) {
  const { mcpServers } = useCustomization();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const servers = userMcpServers({ mcpServers } as never).filter((s) =>
    !q
      ? true
      : s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q),
  );

  function submitAdd() {
    const result = addMcpServer(getCustomization(), name, url);
    if (result.error) {
      setError(result.error);
      return;
    }
    updateCustomization((c) => ({
      ...c,
      mcpServers: result.next.mcpServers,
    }));
    setAdding(false);
    setName("");
    setUrl("");
    setError(null);
  }

  return (
    <div>
      {servers.length === 0 && !adding ? (
        <p className="rounded-xl border border-border px-3 py-6 text-center text-footnote leading-relaxed text-ink-muted">
          No servers yet. Add one below, or pick Composio from Discover.
        </p>
      ) : (
        <ul className="space-y-2">
          {servers.map((server) => (
            <li key={server.id}>
              <Card
                href={`/customize/mcp/${server.id}`}
                control={
                  <span className="flex shrink-0 items-center gap-1 pr-1">
                    <Switch
                      on={server.enabled}
                      label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}
                      onFlip={() =>
                        updateCustomization((c) =>
                          setMcpServerEnabled(c, server.id, !server.enabled),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateCustomization((c) =>
                          removeMcpServer(c, server.id),
                        )
                      }
                      title={`Remove ${server.name}`}
                      aria-label={`Remove ${server.name}`}
                      className="flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-contradicted"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                }
              >
                <CardThumb>
                  <Plug size={17} />
                </CardThumb>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote font-medium text-ink">
                    {server.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-caption text-ink-muted">
                    {server.url}
                  </span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="mt-2 space-y-2 rounded-xl border border-border p-3">
          <label className="block">
            <span className="mb-1 block text-caption text-ink-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Studio tools"
              className="w-full rounded-row border border-border bg-surface px-2.5 py-1.5 text-footnote text-ink outline-none placeholder:text-ink-muted focus:border-accent-border"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-caption text-ink-muted">
              Server URL
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              inputMode="url"
              className="w-full rounded-row border border-border bg-surface px-2.5 py-1.5 font-mono text-footnote text-ink outline-none placeholder:text-ink-muted focus:border-accent-border"
            />
          </label>
          {error && (
            <p role="alert" className="text-caption text-contradicted">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-row px-3 py-1.5 text-footnote text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitAdd}
              className="rounded-row bg-ink px-3 py-1.5 text-footnote text-surface transition-opacity hover:opacity-80"
            >
              Add server
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 rounded-row border border-border px-3 py-1.5 text-footnote text-ink transition-colors hover:bg-surface-raised"
        >
          <Plus size={14} /> Add server
        </button>
      )}
      <p className="mt-3 text-caption leading-relaxed text-ink-muted">
        Servers are stored on this device.
      </p>
    </div>
  );
}

export function McpDiscoverList({ query }: { query: string }) {
  const customization = useCustomization();
  const q = query.trim().toLowerCase();
  const show =
    !q ||
    COMPOSIO.name.toLowerCase().includes(q) ||
    COMPOSIO.description.toLowerCase().includes(q);
  if (!show) {
    return (
      <output className="block rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
        Nothing found. Try another search.
      </output>
    );
  }
  const connected = isMcpConnected(customization, COMPOSIO.id);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Card
        href={`/customize/mcp/${COMPOSIO.id}`}
        control={
          connected ? (
            <span className="flex shrink-0 items-center gap-1 self-center rounded-full bg-surface-raised px-2.5 py-1 text-caption font-medium text-ink">
              <Check size={12} /> Connected
            </span>
          ) : (
            <ConnectButton />
          )
        }
      >
        <ComposioMark size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-footnote font-medium text-ink">
            {COMPOSIO.name}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-caption leading-relaxed text-ink-muted">
            {COMPOSIO.description}
          </span>
          <span className="mt-0.5 block text-caption text-ink-muted">
            by Composio
          </span>
        </span>
      </Card>
    </div>
  );
}

export function ConnectButton({ large }: { large?: boolean }) {
  const [authOpen, setAuthOpen] = useState(false);
  const customization = useCustomization();
  const connected = isMcpConnected(customization, COMPOSIO.id);
  if (connected) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-caption font-medium text-ink">
        <Check size={12} /> Connected
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setAuthOpen(true)}
        className={
          large
            ? "shrink-0 rounded-row bg-ink px-4 py-2 text-body text-surface transition-opacity hover:opacity-80"
            : "shrink-0 rounded-full bg-ink px-3 py-1.5 text-footnote text-surface transition-opacity hover:opacity-80"
        }
      >
        Connect
      </button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </>
  );
}

export function DisconnectButton() {
  const customization = useCustomization();
  if (!isMcpConnected(customization, COMPOSIO.id)) return null;
  return (
    <button
      type="button"
      onClick={() =>
        updateCustomization((c) => ({
          ...c,
          mcpServers: c.mcpServers.filter((s) => s.id !== COMPOSIO.id),
        }))
      }
      className="shrink-0 rounded-row border border-border px-3 py-1.5 text-footnote text-ink transition-colors hover:bg-surface-raised"
    >
      Disconnect
    </button>
  );
}

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit() {
    const result = connectBuiltinServer(
      getCustomization(),
      COMPOSIO.id,
      COMPOSIO.name,
      COMPOSIO.url,
      apiKey,
    );
    if (result.error) {
      setError(result.error);
      return;
    }
    updateCustomization(() => result.next);
    onClose();
  }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: backdrop click is a shortcut for the Cancel button and Escape, which stay keyboard accessible
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Connect ${COMPOSIO.name}`}
        className="w-[min(94vw,420px)] rounded-popover border border-border bg-surface p-4 text-ink shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ComposioMark size={32} />
            <div>
              <h2 className="text-footnote font-medium">
                Connect {COMPOSIO.name}
              </h2>
              <p className="text-caption text-ink-muted">
                Sign in with an API key
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mt-3 text-footnote leading-relaxed text-ink-muted">
          Paste a Composio API key. It stays on this device and is only sent
          to Composio.
        </p>
        <label className="mt-2 block">
          <span className="mb-1 block text-caption text-ink-muted">API key</span>
          <input
            ref={inputRef}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            type="password"
            autoComplete="off"
            placeholder="sk_…"
            className="w-full rounded-row border border-border bg-surface px-2.5 py-1.5 font-mono text-footnote text-ink outline-none placeholder:text-ink-muted focus:border-accent-border"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-caption text-contradicted">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-row px-3 py-1.5 text-footnote text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-row bg-ink px-3 py-1.5 text-footnote text-surface transition-opacity hover:opacity-80"
          >
            Connect
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SkillsList({
  skills,
}: {
  skills: { name: string; description: string }[];
}) {
  const customization = useCustomization();
  if (!skills.length) {
    return (
      <p className="rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
        No skills found on the API.
      </p>
    );
  }
  return (
    <div>
      <ul className="space-y-2">
        {skills.map((skill) => {
          const on = isSkillEnabled(customization, skill.name);
          return (
            <li key={skill.name}>
              <Card
                href={`/customize/skills/${skill.name}`}
                control={
                  <Switch
                    on={on}
                    label={`${on ? "Disable" : "Enable"} skill ${skill.name}`}
                    onFlip={() =>
                      updateCustomization((c) =>
                        setSkillEnabled(c, skill.name, !on),
                      )
                    }
                  />
                }
              >
                <CardThumb>
                  <SkillIcon size={15} />
                </CardThumb>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-footnote text-ink">
                    /{skill.name}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-caption leading-relaxed text-ink-muted">
                    {skill.description}
                  </span>
                </span>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-caption leading-relaxed text-ink-muted">
        Unchecked skills stay out of the composer slash menu.
      </p>
    </div>
  );
}

export function ToolsList({
  tools,
}: {
  tools: { name: string; description: string }[];
}) {
  const customization = useCustomization();
  if (!tools.length) {
    return (
      <p className="rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
        No tools found on the API.
      </p>
    );
  }
  return (
    <div>
      <ul className="space-y-2">
        {tools.map((tool) => {
          const off = customization.disabledTools.includes(tool.name);
          const Presentation = presentTool(tool.name).Icon;
          return (
            <li key={tool.name}>
              <Card
                href={`/customize/tools/${tool.name}`}
                control={
                  <Switch
                    on={!off}
                    label={`${off ? "Enable" : "Disable"} tool ${tool.name}`}
                    onFlip={() =>
                      updateCustomization((c) =>
                        setToolEnabled(c, tool.name, off),
                      )
                    }
                  />
                }
              >
                <CardThumb>
                  <Presentation size={15} />
                </CardThumb>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-footnote text-ink">
                    {tool.name}
                  </span>
                  {tool.description ? (
                    <span className="mt-0.5 line-clamp-2 block text-caption leading-relaxed text-ink-muted">
                      {tool.description}
                    </span>
                  ) : null}
                </span>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-caption leading-relaxed text-ink-muted">
        Unchecked tools are never sent to the model.
      </p>
    </div>
  );
}

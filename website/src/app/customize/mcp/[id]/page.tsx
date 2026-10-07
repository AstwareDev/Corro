"use client";

import { ArrowLeft, Plug } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ComposioMark } from "@/components/ComposioMark";
import {
  ConnectButton,
  DisconnectButton,
  Meta,
  Switch,
} from "@/components/customize-ui";
import {
  COMPOSIO,
  isMcpConnected,
  removeMcpServer,
  setMcpServerEnabled,
  updateCustomization,
  useCustomization,
  userMcpServers,
} from "@/lib/customize";

export default function McpDetailRoute() {
  const params = useParams<{ id: string }>();
  const customization = useCustomization();
  const router = useRouter();
  const id = params.id;

  const back = (
    <Link
      href="/customize?tab=mcp"
      className="inline-flex items-center gap-1.5 text-footnote text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft size={14} /> MCP servers
    </Link>
  );

  if (id === COMPOSIO.id) {
    const connected = isMcpConnected(customization, COMPOSIO.id);
    return (
      <AppShell>
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
          <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
            {back}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ComposioMark size={56} />
              <div className="min-w-0 flex-1">
                <h1 className="text-title font-semibold text-ink">
                  {COMPOSIO.name}
                </h1>
                <p className="mt-0.5 text-footnote text-ink-muted">
                  {COMPOSIO.description}
                </p>
              </div>
              {connected ? (
                <span className="flex shrink-0 items-center gap-3">
                  <span className="flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-caption font-medium text-ink">
                    Connected
                  </span>
                  <DisconnectButton />
                </span>
              ) : (
                <ConnectButton large />
              )}
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="min-w-0">
                <p className="text-body leading-relaxed text-ink">
                  Connect {COMPOSIO.name} to reach hundreds of apps from
                  Corro. Signing in stores an API key on this device.
                </p>
                <div className="mt-6 rounded-xl border border-border p-3">
                  <p className="text-footnote leading-relaxed text-ink-muted">
                    Only connect servers you trust. Corro does not control
                    which tools a server makes available and cannot verify
                    that they work as intended or that they will not change.
                  </p>
                </div>
              </div>
              <aside className="space-y-4">
                <Meta label="Made by">
                  <span>{COMPOSIO.name}</span>
                </Meta>
                <Meta label="Server URL">
                  <span className="break-all font-mono text-caption">
                    {COMPOSIO.url}
                  </span>
                </Meta>
                <Meta label="Sign in">
                  <span>Required</span>
                </Meta>
                <Meta label="Status">
                  <span>{connected ? "Connected" : "Not connected"}</span>
                </Meta>
              </aside>
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  const server = userMcpServers(customization).find((s) => s.id === id);
  if (!server) {
    return (
      <AppShell>
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
          <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
            {back}
            <p className="mt-4 rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
              Unknown server.
            </p>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
        <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
          {back}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised text-ink-muted">
              <Plug size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-title font-semibold text-ink">
                {server.name}
              </h1>
              <p className="mt-0.5 truncate font-mono text-caption text-ink-muted">
                {server.url}
              </p>
            </div>
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
              onClick={() => {
                updateCustomization((c) => removeMcpServer(c, server.id));
                router.push("/customize?tab=mcp");
              }}
              className="shrink-0 rounded-row border border-border px-3 py-1.5 text-footnote text-ink transition-colors hover:bg-surface-raised"
            >
              Remove
            </button>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              <div className="rounded-xl border border-border p-3">
                <p className="text-footnote leading-relaxed text-ink-muted">
                  Only connect servers you trust. Corro does not control
                  which tools a server makes available and cannot verify
                  that they work as intended or that they will not change.
                </p>
              </div>
            </div>
            <aside className="space-y-4">
              <Meta label="Server URL">
                <span className="break-all font-mono text-caption">
                  {server.url}
                </span>
              </Meta>
              <Meta label="Status">
                <span>{server.enabled ? "Enabled" : "Disabled"}</span>
              </Meta>
            </aside>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

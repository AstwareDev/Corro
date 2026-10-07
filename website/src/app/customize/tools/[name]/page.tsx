"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Meta, Switch } from "@/components/customize-ui";
import { presentTool } from "@/components/tools/registry";
import { fetchTools, type ToolDescription } from "@/lib/api";
import {
  setToolEnabled,
  updateCustomization,
  useCustomization,
} from "@/lib/customize";

export default function ToolDetailRoute() {
  const params = useParams<{ name: string }>();
  const customization = useCustomization();
  const [tools, setTools] = useState<ToolDescription[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTools().then((data) => {
      if (!cancelled) setTools(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tool = tools?.find((t) => t.name === params.name);
  const off = customization.disabledTools.includes(params.name);
  const presentation = presentTool(params.name);
  const Presentation = presentation.Icon;

  return (
    <AppShell>
      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
        <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
          <Link
            href="/customize?tab=tools"
            className="inline-flex items-center gap-1.5 text-footnote text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Tools
          </Link>
          {!tools ? (
            <div className="mt-4 space-y-2">
              <div className="corro-skeleton h-6 w-48" />
              <div className="corro-skeleton h-4 w-full" />
              <div className="corro-skeleton h-4 w-2/3" />
            </div>
          ) : !tool ? (
            <p className="mt-4 rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
              Unknown tool.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised text-ink-muted">
                  <Presentation size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-mono text-title font-semibold text-ink">
                    {tool.name}
                  </h1>
                  <p className="mt-0.5 line-clamp-2 text-footnote text-ink-muted">
                    {tool.description || presentation.label}
                  </p>
                </div>
                <Switch
                  on={!off}
                  label={`${off ? "Enable" : "Disable"} tool ${tool.name}`}
                  onFlip={() =>
                    updateCustomization((c) =>
                      setToolEnabled(c, tool.name, off),
                    )
                  }
                />
              </div>
              <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="min-w-0">
                  <p className="text-body leading-relaxed text-ink">
                    {tool.description || presentation.label}
                  </p>
                  <div className="mt-6 rounded-xl border border-border p-3">
                    <p className="text-footnote leading-relaxed text-ink-muted">
                      Tools run on Corro&apos;s API. Unchecked tools are never
                      sent to the model.
                    </p>
                  </div>
                </div>
                <aside className="space-y-4">
                  <Meta label="Family">
                    <span>
                      {presentation.family?.label ?? "Built in"}
                    </span>
                  </Meta>
                  {presentation.brand && (
                    <Meta label="Provider">
                      <span>{presentation.brand.name}</span>
                    </Meta>
                  )}
                  <Meta label="Status">
                    <span>{off ? "Disabled" : "Enabled"}</span>
                  </Meta>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}

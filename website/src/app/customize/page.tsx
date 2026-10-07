"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  McpDiscoverList,
  McpYoursList,
  SkillsList,
  ToolsList,
} from "@/components/customize-ui";
import {
  fetchSkills,
  fetchTools,
  type SkillDescription,
  type ToolDescription,
} from "@/lib/api";

type Tab = "mcp" | "skills" | "tools";

const TABS: { id: Tab; label: string }[] = [
  { id: "mcp", label: "MCP servers" },
  { id: "skills", label: "Skills" },
  { id: "tools", label: "Tools" },
];

function CustomizeContent() {
  const search = useSearchParams();
  const router = useRouter();
  const rawTab = search.get("tab");
  const tab: Tab =
    rawTab === "skills" || rawTab === "tools" ? rawTab : "mcp";
  const view = search.get("view") === "discover" ? "discover" : "yours";
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<SkillDescription[]>([]);
  const [tools, setTools] = useState<ToolDescription[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSkills().then((data) => {
      if (!cancelled) setSkills(data);
    });
    fetchTools().then((data) => {
      if (!cancelled) setTools(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setTab(next: Tab) {
    router.replace(`/customize?tab=${next}`, { scroll: false });
  }

  function setView(next: "yours" | "discover") {
    router.replace(`/customize?tab=mcp&view=${next}`, { scroll: false });
  }

  const q = query.trim().toLowerCase();
  const visibleSkills = skills.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  );
  const visibleTools = tools.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );

  return (
    <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
        <h1 className="text-display font-semibold tracking-[-0.01em] text-ink">
          Customize
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Customize"
            className="flex items-center rounded-full bg-surface-raised p-[2px]"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "rounded-full px-3 py-1 text-footnote transition-colors",
                  tab === t.id
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "mcp" && (
            <div
              role="tablist"
              aria-label="MCP servers"
              className="flex items-center rounded-full bg-surface-raised p-[2px]"
            >
              {(
                [
                  { id: "yours", label: "Yours" },
                  { id: "discover", label: "Discover" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={view === t.id}
                  onClick={() => setView(t.id)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-footnote transition-colors",
                    view === t.id
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex min-w-40 flex-1 items-center gap-1.5 rounded-row border border-border px-2.5 py-1.5 text-ink-muted focus-within:border-accent-border sm:max-w-64">
            <Search size={13} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "mcp"
                  ? "Search servers"
                  : tab === "skills"
                    ? "Search skills"
                    : "Search tools"
              }
              aria-label="Search"
              className="w-full min-w-0 bg-transparent text-footnote text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
        </div>
        <div className="mt-5">
          {tab === "mcp" ? (
            view === "yours" ? (
              <McpYoursList query={query} />
            ) : (
              <McpDiscoverList query={query} />
            )
          ) : tab === "skills" ? (
            <SkillsList skills={visibleSkills} />
          ) : (
            <ToolsList tools={visibleTools} />
          )}
        </div>
      </div>
    </main>
  );
}

export default function CustomizeRoute() {
  return (
    <AppShell>
      <Suspense>
        <CustomizeContent />
      </Suspense>
    </AppShell>
  );
}

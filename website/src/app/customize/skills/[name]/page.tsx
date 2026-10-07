"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Meta, Switch } from "@/components/customize-ui";
import { Markdown } from "@/components/Markdown";
import { SkillIcon } from "@/components/tools/registry";
import { fetchSkill, type SkillBody } from "@/lib/api";
import {
  isSkillEnabled,
  setSkillEnabled,
  updateCustomization,
  useCustomization,
} from "@/lib/customize";

export default function SkillDetailRoute() {
  const params = useParams<{ name: string }>();
  const customization = useCustomization();
  const [skill, setSkill] = useState<SkillBody | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSkill(params.name)
      .then((body) => {
        if (!cancelled) setSkill(body);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.name]);

  const on = isSkillEnabled(customization, params.name);

  return (
    <AppShell>
      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-surface">
        <div className="mx-auto w-full max-w-[880px] px-4 py-10 sm:px-8">
          <Link
            href="/customize?tab=skills"
            className="inline-flex items-center gap-1.5 text-footnote text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Skills
          </Link>
          {missing || (!skill && params.name === "") ? (
            <p className="mt-4 rounded-xl border border-border px-3 py-6 text-center text-footnote text-ink-muted">
              Unknown skill.
            </p>
          ) : !skill ? (
            <div className="mt-4 space-y-2">
              <div className="corro-skeleton h-6 w-48" />
              <div className="corro-skeleton h-4 w-full" />
              <div className="corro-skeleton h-4 w-2/3" />
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised">
                  <SkillIcon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-mono text-title font-semibold text-ink">
                    /{skill.name}
                  </h1>
                  <p className="mt-0.5 line-clamp-2 text-footnote text-ink-muted">
                    {skill.description}
                  </p>
                </div>
                <Switch
                  on={on}
                  label={`${on ? "Disable" : "Enable"} skill ${skill.name}`}
                  onFlip={() =>
                    updateCustomization((c) =>
                      setSkillEnabled(c, skill.name, !on),
                    )
                  }
                />
              </div>
              <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="min-w-0 text-prose leading-relaxed text-ink">
                  <Markdown text={skill.content} />
                </div>
                <aside className="space-y-4">
                  <Meta label="Slash command">
                    <span className="font-mono">/{skill.name}</span>
                  </Meta>
                  <Meta label="Source">
                    <span>Corro API</span>
                  </Meta>
                  <Meta label="Status">
                    <span>{on ? "Enabled" : "Disabled"}</span>
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

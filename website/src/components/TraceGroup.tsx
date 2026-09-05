"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useElapsed } from "@/hooks/useElapsed";
import { useMotionPreference } from "@/lib/appearance";
import { formatDuration } from "@/lib/format";
import type { MessageBlock } from "@/lib/types";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolGroup } from "./ToolGroup";

const EASE = [0.16, 1, 0.3, 1] as const;

export type TraceBlock = Extract<
  MessageBlock,
  { kind: "reasoning" } | { kind: "tools" }
>;

function summarize(blocks: TraceBlock[]): { parts: string[]; thinkMs: number } {
  let thinkMs = 0;
  let tools = 0;

  for (const block of blocks) {
    if (block.kind === "reasoning") {
      if (block.endedAt) thinkMs += block.endedAt - block.startedAt;
    } else {
      tools += block.calls.length;
    }
  }

  const parts: string[] = [];
  if (thinkMs > 0) parts.push(`Thought for ${formatDuration(thinkMs)}`);
  if (tools > 0) parts.push(`${tools} ${tools === 1 ? "step" : "steps"}`);
  return { parts, thinkMs };
}

export function TraceGroup({
  blocks,
  streaming,
}: {
  blocks: TraceBlock[];
  streaming: boolean;
}) {
  const motionOff = useMotionPreference();
  const [open, setOpen] = useState(false);

  const running =
    streaming &&
    blocks.some((b) =>
      b.kind === "reasoning"
        ? !b.endedAt
        : b.calls.some((c) => c.status === "pending" || c.status === "running"),
    );

  const first = blocks[0];
  const startedAt =
    first.kind === "reasoning" ? first.startedAt : first.calls[0]?.startedAt;
  const live = useElapsed(
    startedAt ?? 0,
    running ? undefined : (startedAt ?? 0),
  );

  const solo =
    blocks.length === 1 && blocks[0].kind === "reasoning" ? blocks[0] : null;

  const { parts } = summarize(blocks);
  const lightOrbit = running
    ? "/working/atom-orbit-white-512.gif"
    : "/working/atom-orbit-white-512.png";
  const darkOrbit = running
    ? "/working/atom-orbit-black-512.gif"
    : "/working/atom-orbit-black-512.png";
  const label = running
    ? `Working ${formatDuration(live)}`
    : parts.length
      ? parts.join(" · ")
      : "Trace";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={clsx(
          "trace-disclosure",
          open && "is-open",
          running && "is-running",
        )}
      >
        <span className="trace-orbit" aria-hidden="true">
          <Image
            className="trace-orbit-light"
            src={lightOrbit}
            alt=""
            width={20}
            height={20}
            unoptimized
          />
          <Image
            className="trace-orbit-dark"
            src={darkOrbit}
            alt=""
            width={20}
            height={20}
            unoptimized
          />
        </span>
        <span className="font-medium">{label}</span>
        <ChevronRight
          size={13}
          className={clsx(
            "shrink-0 text-ink-faint transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={motionOff ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.26, ease: EASE }
            }
            className="overflow-hidden"
          >
            <div className="ml-3 flex flex-col gap-1 border-l border-border pl-3">
              {solo ? (
                <p className="scroll-thin max-h-64 overflow-y-auto whitespace-pre-wrap py-0.5 text-caption leading-relaxed text-ink-muted">
                  {solo.text}
                </p>
              ) : (
                blocks.map((block) =>
                  block.kind === "reasoning" ? (
                    <ReasoningBlock
                      key={block.id}
                      text={block.text}
                      active={Boolean(streaming && !block.endedAt)}
                      startedAt={block.startedAt}
                      endedAt={block.endedAt}
                    />
                  ) : (
                    <ToolGroup key={block.id} calls={block.calls} />
                  ),
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

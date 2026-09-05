"use client";

import { AnimatePresence, motion } from "framer-motion";
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

export function summarizeTrace(blocks: TraceBlock[]): string[] {
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
  return parts;
}

export function TraceGroup({
  blocks,
  streaming,
  open,
}: {
  blocks: TraceBlock[];
  streaming: boolean;
  open: boolean;
}) {
  const motionOff = useMotionPreference();

  const solo =
    blocks.length === 1 && blocks[0].kind === "reasoning" ? blocks[0] : null;

  return (
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
  );
}

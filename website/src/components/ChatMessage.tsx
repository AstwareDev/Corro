"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ChatMessageUI } from "@/lib/types";
import { CorroMark, CorroMarkLoading } from "./CorroMark";
import { Markdown } from "./Markdown";
import { MessageFooter } from "./MessageFooter";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolGroup } from "./ToolGroup";
import { WorkTimer } from "./WorkTimer";

export function ChatMessage({ message }: { message: ChatMessageUI }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex justify-end"
      >
        

        <div className="max-w-[75ch] break-words rounded-2xl bg-surface-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          <Markdown text={message.text} />
        </div>
      </motion.div>
    );
  }

  const lastBlock = message.blocks[message.blocks.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex max-w-[75ch] flex-col gap-2"
    >
      

      <div className="flex items-center gap-1.5 text-ink">
        <motion.span
          initial={{ opacity: 0, scale: 0.2, rotate: -35 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex"
        >
          {message.streaming ? (
            <CorroMarkLoading className="size-5" />
          ) : (
            <CorroMark className="size-5" />
          )}
        </motion.span>
        <motion.span
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-sm font-semibold uppercase leading-none tracking-[-0.02em]"
        >
          Corro
        </motion.span>
        <WorkTimer message={message} />
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {message.blocks.map((block) => {
          if (block.kind === "reasoning") {
            return (
              <ReasoningBlock
                key={block.id}
                text={block.text}
                active={Boolean(message.streaming && !block.endedAt)}
                startedAt={block.startedAt}
                endedAt={block.endedAt}
              />
            );
          }
          if (block.kind === "tools") {
            return <ToolGroup key={block.id} calls={block.calls} />;
          }
          return (
            <div
              key={block.id}
              className="stream-text text-[15px] leading-relaxed text-ink"
            >
              <Markdown
                text={block.text}
                animateWords={Boolean(message.streaming && block === lastBlock)}
              />
              {message.streaming && block === lastBlock && (
                <span className="caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle" />
              )}
            </div>
          );
        })}

        {message.error && (
          <div className="flex items-center gap-1.5 text-xs text-contradicted">
            <AlertTriangle size={13} />
            {message.error}
          </div>
        )}

        {!message.streaming && <MessageFooter message={message} />}
      </div>
    </motion.div>
  );
}

"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { useMotionPreference } from "@/lib/appearance";
import type { ChatMessageUI } from "@/lib/types";
import { ChatMessage } from "./ChatMessage";
import { SuggestionChips } from "./SuggestionChips";

export function MessageList({
  messages,
  suggestions,
  onSuggestionSelect,
  onEditMessage,
}: {
  messages: ChatMessageUI[];
  suggestions?: string[];
  onSuggestionSelect?: (text: string) => void;
  onEditMessage?: (id: string, text: string) => void;
}) {
  const motionOff = useMotionPreference();
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const streaming = messages[messages.length - 1]?.streaming;

  useEffect(() => {
    if (!stickToBottom.current) return;
    endRef.current?.scrollIntoView({
      behavior: streaming || motionOff ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, suggestions, streaming, motionOff]);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 120;
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className="scroll-thin scroll-edges flex-1 overflow-y-auto px-4 pb-6 pt-14 sm:px-8"
    >
      <div className="corro-conversation mx-auto flex w-full flex-col gap-7">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} onEdit={onEditMessage} />
          ))}
        </AnimatePresence>
        {suggestions && suggestions.length > 0 && onSuggestionSelect && (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={onSuggestionSelect}
          />
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

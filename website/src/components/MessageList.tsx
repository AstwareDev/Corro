"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import type { ChatMessageUI } from "@/lib/types";
import { ChatMessage } from "./ChatMessage";
import { SuggestionChips } from "./SuggestionChips";

export function MessageList({
  messages,
  suggestions,
  onSuggestionSelect,
}: {
  messages: ChatMessageUI[];
  suggestions?: string[];
  onSuggestionSelect?: (text: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  
  useEffect(() => {
    if (stickToBottom.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, suggestions]);

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
      className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
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

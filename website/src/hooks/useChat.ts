"use client";

import { useCallback, useRef, useState } from "react";
import { streamChat, type SessionDetail } from "@/lib/api";
import {
  type ChatMessageUI,
  type ContextUsage,
  type MessageBlock,
  peekDescription,
  type ToolCallUI,
} from "@/lib/types";



function patchCall(
  blocks: MessageBlock[],
  id: string,
  change: (call: ToolCallUI) => ToolCallUI,
): MessageBlock[] {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.kind !== "tools") continue;
    const idx = block.calls.findIndex((c) => c.localId === id);
    if (idx === -1) continue;
    const calls = block.calls.slice();
    calls[idx] = change(calls[idx]);
    const next = blocks.slice();
    next[i] = { ...block, calls };
    return next;
  }
  return blocks;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}


function closeReasoning(blocks: MessageBlock[], at: number): MessageBlock[] {
  let changed = false;
  const next = blocks.map((b) => {
    if (b.kind === "reasoning" && !b.endedAt) {
      changed = true;
      return { ...b, endedAt: at };
    }
    return b;
  });
  return changed ? next : blocks;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [context, setContext] = useState<ContextUsage | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const patchLast = useCallback(
    (patch: (m: ChatMessageUI) => ChatMessageUI) => {
      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = prev.slice();
        next[next.length - 1] = patch(next[next.length - 1]);
        return next;
      });
    },
    [],
  );

  const send = useCallback(
    async (
      text: string,
      opts: { model?: string; reasoningEffort?: string },
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessageUI = {
        id: uid(),
        role: "user",
        text: trimmed,
        blocks: [],
        createdAt: Date.now(),
      };
      const assistantMessage: ChatMessageUI = {
        id: uid(),
        role: "assistant",
        text: "",
        blocks: [],
        streaming: true,
        createdAt: Date.now(),
        model: opts.model,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of streamChat({
          message: trimmed,
          session: sessionId,
          model: opts.model,
          reasoningEffort: opts.reasoningEffort,
          signal: controller.signal,
        })) {
          if (event.type === "session") {
            setSessionId(event.id);
          } else if (event.type === "start") {
            if (event.context) setContext(event.context);
          } else if (event.type === "reasoning") {
            const now = Date.now();
            patchLast((m) => {
              const blocks = m.blocks.slice();
              const last = blocks[blocks.length - 1];
              if (last?.kind === "reasoning" && !last.endedAt) {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + event.text,
                };
              } else {
                blocks.push({
                  kind: "reasoning",
                  id: uid(),
                  text: event.text,
                  startedAt: now,
                });
              }
              return { ...m, blocks, firstTokenAt: m.firstTokenAt ?? now };
            });
          } else if (event.type === "text") {
            const now = Date.now();
            patchLast((m) => {
              const blocks = closeReasoning(m.blocks, now).slice();
              const last = blocks[blocks.length - 1];
              if (last?.kind === "text") {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + event.text,
                };
              } else {
                blocks.push({ kind: "text", id: uid(), text: event.text });
              }
              return {
                ...m,
                text: m.text + event.text,
                blocks,
                firstTokenAt: m.firstTokenAt ?? now,
              };
            });
          } else if (event.type === "tool-input-start") {
            const now = Date.now();
            patchLast((m) => {
              const blocks = closeReasoning(m.blocks, now).slice();
              const call: ToolCallUI = {
                localId: event.id,
                name: event.name,
                input: undefined,
                status: "pending",
                startedAt: now,
                partial: "",
              };
              const last = blocks[blocks.length - 1];
              
              if (last?.kind === "tools") {
                blocks[blocks.length - 1] = {
                  ...last,
                  calls: [...last.calls, call],
                };
              } else {
                blocks.push({ kind: "tools", id: uid(), calls: [call] });
              }
              return { ...m, blocks, firstTokenAt: m.firstTokenAt ?? now };
            });
          } else if (event.type === "tool-input-delta") {
            patchLast((m) => ({
              ...m,
              blocks: patchCall(m.blocks, event.id, (call) => {
                const partial = (call.partial ?? "") + event.delta;
                return {
                  ...call,
                  partial,
                  description: peekDescription(partial) ?? call.description,
                };
              }),
            }));
          } else if (event.type === "tool-call") {
            const now = Date.now();
            const described = event.input as { description?: unknown } | null;
            const description =
              typeof described?.description === "string"
                ? described.description
                : undefined;
            patchLast((m) => {
              
              
              const existing =
                event.id &&
                m.blocks.some(
                  (b) =>
                    b.kind === "tools" &&
                    b.calls.some((c) => c.localId === event.id),
                );

              if (existing && event.id) {
                return {
                  ...m,
                  blocks: patchCall(m.blocks, event.id, (call) => ({
                    ...call,
                    input: event.input,
                    status: "running",
                    description: description ?? call.description,
                    partial: undefined,
                  })),
                };
              }

              const blocks = closeReasoning(m.blocks, now).slice();
              const call: ToolCallUI = {
                localId: event.id ?? uid(),
                name: event.name,
                input: event.input,
                status: "running",
                startedAt: now,
                description,
              };
              const last = blocks[blocks.length - 1];
              if (last?.kind === "tools") {
                blocks[blocks.length - 1] = {
                  ...last,
                  calls: [...last.calls, call],
                };
              } else {
                blocks.push({ kind: "tools", id: uid(), calls: [call] });
              }
              return { ...m, blocks, firstTokenAt: m.firstTokenAt ?? now };
            });
          } else if (event.type === "tool-result") {
            const now = Date.now();
            patchLast((m) => {
              if (event.id) {
                return {
                  ...m,
                  blocks: patchCall(m.blocks, event.id, (call) => ({
                    ...call,
                    output: event.output,
                    status: "done",
                    endedAt: now,
                  })),
                };
              }
              const blocks = m.blocks.slice();
              for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];
                if (block.kind !== "tools") continue;
                const idx = block.calls.findLastIndex(
                  (c) => c.name === event.name && c.status === "running",
                );
                if (idx === -1) continue;
                const calls = block.calls.slice();
                calls[idx] = {
                  ...calls[idx],
                  output: event.output,
                  status: "done",
                  endedAt: now,
                };
                blocks[i] = { ...block, calls };
                return { ...m, blocks };
              }
              return m;
            });
          } else if (event.type === "context") {
            setContext(event.context);
          } else if (event.type === "usage") {
            if (event.context) setContext(event.context);
          } else if (event.type === "done") {
            const now = Date.now();
            const usage = (
              event as { usage?: { server?: ChatMessageUI["usage"] } }
            ).usage;
            patchLast((m) => ({
              ...m,
              blocks: closeReasoning(m.blocks, now),
              streaming: false,
              completedAt: now,
              usage: usage?.server ?? m.usage,
            }));
          } else if (event.type === "error") {
            const now = Date.now();
            patchLast((m) => ({
              ...m,
              blocks: closeReasoning(m.blocks, now),
              streaming: false,
              completedAt: now,
              error: event.error,
            }));
          }
        }
      } catch (err) {
        const now = Date.now();
        const aborted = (err as Error)?.name === "AbortError";
        patchLast((m) => ({
          ...m,
          blocks: closeReasoning(m.blocks, now),
          streaming: false,
          completedAt: now,
          ...(aborted
            ? {}
            : {
                error:
                  err instanceof Error ? err.message : "Something went wrong",
              }),
        }));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, patchLast, sessionId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setContext(undefined);
  }, []);

  

  const load = useCallback((session: SessionDetail) => {
    abortRef.current?.abort();
    setIsStreaming(false);

    const replayed: ChatMessageUI[] = session.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const createdAt = Date.parse(m.at) || Date.now();
        const blocks: MessageBlock[] = [];
        if (m.toolCalls?.length) {
          blocks.push({
            kind: "tools",
            id: uid(),
            calls: m.toolCalls.map((tc) => ({
              localId: uid(),
              name: tc.name,
              input: tc.input,
              output: tc.output,
              status: "done",
              startedAt: createdAt,
              endedAt: createdAt,
            })),
          });
        }
        if (m.content) {
          blocks.push({ kind: "text", id: uid(), text: m.content });
        }
        return {
          id: m.id,
          role: m.role as "user" | "assistant",
          text: m.content,
          blocks,
          createdAt,
          completedAt: createdAt,
          usage: m.usage,
        };
      });

    setMessages(replayed);
    setSessionId(session.id);
    setContext(session.context);
  }, []);

  return {
    messages,
    isStreaming,
    send,
    stop,
    reset,
    load,
    sessionId,
    context,
  };
}

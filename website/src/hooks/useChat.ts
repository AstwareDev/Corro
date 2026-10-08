"use client";

import { useCallback, useRef, useState } from "react";
import { type SessionDetail, streamChat } from "@/lib/api";
import {
  type ChatMessageUI,
  type ContextUsage,
  type MessageAttachment,
  type MessageBlock,
  peekDescription,
  type ToolCallUI,
  toolResultStatus,
} from "@/lib/types";
import { notifyWorkspaceChanged } from "@/lib/workspace-events";

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
      opts: { model?: string; reasoningEffort?: string; tools?: string[] },
      attachments?: MessageAttachment[],
    ) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: ChatMessageUI = {
        id: uid(),
        role: "user",
        text: trimmed,
        blocks: [],
        attachments,
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
      let activeSession = sessionId;
      let ended = false;
      // Live step tracking for this run. start-step events carry the 0-based
      // agent step; tool calls are tagged so the UI can group by step and
      // show "Step N" live. Keyed by toolCallId (localId), never by index.
      let liveStep = 0;
      // Batch large streaming tool-input deltas per animation frame so long
      // inputs (e.g. 20k widget_code) do not freeze the page with a render
      // per chunk. Flushes as a single setMessages per frame.
      const deltaBuffer = new Map<string, string>();
      let deltaRaf = 0;
      const flushDeltas = () => {
        deltaRaf = 0;
        if (!deltaBuffer.size) return;
        const batch = new Map(deltaBuffer);
        deltaBuffer.clear();
        patchLast((m) => {
          let blocks = m.blocks;
          for (const [id, delta] of batch) {
            blocks = patchCall(blocks, id, (call) => {
              const partial = (call.partial ?? "") + delta;
              return {
                ...call,
                partial,
                description: peekDescription(partial) ?? call.description,
              };
            });
          }
          return { ...m, blocks };
        });
      };
      const queueDelta = (id: string, delta: string) => {
        deltaBuffer.set(id, (deltaBuffer.get(id) ?? "") + delta);
        if (deltaRaf) return;
        const schedule =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (fn: () => void) => setTimeout(fn, 16) as unknown as number;
        deltaRaf = schedule(() => flushDeltas()) as unknown as number;
      };

      try {
        for await (const event of streamChat({
          message: trimmed,
          session: sessionId,
          model: opts.model,
          reasoningEffort: opts.reasoningEffort,
          tools: opts.tools,
          attachments: attachments?.map(({ path, kind, mime }) => ({
            path,
            kind,
            mime,
          })),
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          if (event.type === "session") {
            activeSession = event.id;
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
                step: liveStep,
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
            queueDelta(event.id, event.delta);
          } else if (event.type === "tool-input-end") {
            // Input JSON complete; the parsed tool-call follows. Flush any
            // buffered deltas now so the row flips to input-available without
            // waiting for the next animation frame.
            if (deltaRaf) {
              if (typeof cancelAnimationFrame === "function") {
                try {
                  cancelAnimationFrame(deltaRaf);
                } catch {}
              }
              flushDeltas();
            }
          } else if (event.type === "start-step") {
            liveStep = event.step + 1;
            patchLast((m) => {
              const blocks = m.blocks.slice();
              const last = blocks[blocks.length - 1];
              // Start a new tools group for this step so the UI groups calls
              // by step. Empty groups render nothing until calls arrive.
              if (last?.kind === "tools" && last.calls.length) {
                blocks.push({ kind: "tools", id: uid(), calls: [] });
              } else if (!last || last.kind !== "tools") {
                blocks.push({ kind: "tools", id: uid(), calls: [] });
              }
              return { ...m, blocks, liveStep };
            });
          } else if (event.type === "finish-step") {
            liveStep = Math.max(liveStep, event.step + 1);
            patchLast((m) => ({
              ...m,
              liveStep: Math.max(m.liveStep ?? 0, event.step + 1),
            }));
          } else if (event.type === "tool-call") {
            const now = Date.now();
            // Apply any buffered deltas first so clearing partial below does
            // not get re-populated by a stale flush.
            if (deltaBuffer.size) flushDeltas();
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
                step: liveStep || undefined,
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
            const status = toolResultStatus(event.output);
            if (event.name.startsWith("fs_") && status === "done")
              notifyWorkspaceChanged(activeSession);
            patchLast((m) => {
              if (event.id) {
                return {
                  ...m,
                  blocks: patchCall(m.blocks, event.id, (call) => ({
                    ...call,
                    output: event.output,
                    status,
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
                  status,
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
            const serverUsage = (
              event as { usage?: { server?: ChatMessageUI["usage"] } }
            ).usage?.server;
            if (serverUsage) {
              patchLast((m) => ({
                ...m,
                usage: { ...m.usage, ...serverUsage },
              }));
            }
          } else if (event.type === "done") {
            ended = true;
            if (deltaBuffer.size) flushDeltas();
            const now = Date.now();
            const usage = (
              event as { usage?: { server?: ChatMessageUI["usage"] } }
            ).usage;
            patchLast((m) => ({
              ...m,
              blocks: closeReasoning(m.blocks, now),
              streaming: false,
              completedAt: now,
              liveStep: undefined,
              usage: usage?.server ?? m.usage,
            }));
          } else if (event.type === "error") {
            ended = true;
            if (deltaBuffer.size) flushDeltas();
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
        if (!ended && !controller.signal.aborted)
          throw new Error(
            "The connection ended before Corro confirmed completion.",
          );
      } catch (err) {
        if (abortRef.current !== controller) return;
        const now = Date.now();
        const aborted = (err as Error)?.name === "AbortError";
        patchLast((m) => ({
          ...m,
          blocks: closeReasoning(m.blocks, now),
          streaming: false,
          completedAt: now,
          ...(aborted
            ? { error: "Stopped. Any completed file operations remain saved." }
            : {
                error:
                  err instanceof Error ? err.message : "Something went wrong",
              }),
        }));
      } finally {
        if (abortRef.current === controller) {
          patchLast((m) => ({
            ...m,
            streaming: false,
            blocks: closeReasoning(m.blocks, Date.now()).map((b) =>
              b.kind === "tools"
                ? {
                    ...b,
                    calls: b.calls.map((c) =>
                      c.status === "pending" || c.status === "running"
                        ? {
                            ...c,
                            status: "error",
                            output: {
                              ok: false,
                              error:
                                "No result received; completion is unknown.",
                            },
                            endedAt: Date.now(),
                          }
                        : c,
                    ),
                  }
                : b,
            ),
          }));
          setIsStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [isStreaming, patchLast, sessionId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const editFrom = useCallback(
    (
      id: string,
      text: string,
      opts: { model?: string; reasoningEffort?: string; tools?: string[] },
    ) => {
      if (isStreaming) return;
      const index = messages.findIndex((m) => m.id === id);
      if (index === -1) return;
      setMessages((prev) => prev.slice(0, index));
      send(text, opts);
    },
    [messages, isStreaming, send],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages([]);
    setSessionId(null);
    setContext(undefined);
  }, []);

  const load = useCallback((session: SessionDetail) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);

    const replayed: ChatMessageUI[] = session.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const createdAt = Date.parse(m.at) || Date.now();
        const startedAt = m.timings?.startedAt
          ? Date.parse(m.timings.startedAt) || createdAt
          : createdAt;
        const firstTokenAt = m.timings?.firstTokenAt
          ? Date.parse(m.timings.firstTokenAt) || undefined
          : undefined;
        const completedAt = m.timings?.completedAt
          ? Date.parse(m.timings.completedAt) || createdAt
          : createdAt;
        const blocks: MessageBlock[] = [];
        // Restore saved Thoughts first (they were produced before text/tools
        // during streaming). Reasoning lives only in the UI/session — the
        // backend never includes it in the model history.
        if (m.role === "assistant" && m.reasoning) {
          const reasoningEnded =
            typeof m.reasoningDurationMs === "number" &&
            Number.isFinite(m.reasoningDurationMs)
              ? startedAt + Math.max(0, m.reasoningDurationMs)
              : (firstTokenAt ?? completedAt);
          blocks.push({
            kind: "reasoning",
            id: uid(),
            text: m.reasoning,
            startedAt,
            endedAt: reasoningEnded,
          });
        }
        if (m.toolCalls?.length) {
          blocks.push({
            kind: "tools",
            id: uid(),
            calls: m.toolCalls.map((tc) => ({
              localId: uid(),
              name: tc.name,
              input: tc.input,
              output: tc.output,
              status: toolResultStatus(tc.output),
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
          ...(m.role === "assistant" && firstTokenAt !== undefined
            ? { firstTokenAt }
            : {}),
          completedAt,
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
    editFrom,
    sessionId,
    setSessionId,
    context,
  };
}

"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { PanelRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatInput } from "@/components/ChatInput";
import { HeroLockup } from "@/components/HeroLockup";
import { InspectorPopover } from "@/components/InspectorPopover";
import { MessageList } from "@/components/MessageList";
import { useChat } from "@/hooks/useChat";
import {
  fetchModels,
  fetchSession,
  fetchSuggestions,
  fetchTools,
  fetchWorkspace,
  type WorkspaceFile,
} from "@/lib/api";
import { useAppearance, useMotionPreference } from "@/lib/appearance";
import { enabledToolNames, useCustomization } from "@/lib/customize";
import { collectSources } from "@/lib/sources";
import type { Effort, MessageAttachment, ModelDescription } from "@/lib/types";
import { onWidgetPrompt } from "@/lib/widget-prompt";
import { onWorkspaceChanged } from "@/lib/workspace-events";

const EASE = [0.16, 1, 0.3, 1] as const;

export function ChatScreen({ sessionId: initialSessionId }: { sessionId?: string }) {
  const motionOff = useMotionPreference();
  const reduce = useMotionPreference();
  const router = useRouter();
  const pathname = usePathname();
  const [models, setModels] = useState<ModelDescription[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("");
  const [effort, setEffort] = useState<Effort>("max");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const filesRequest = useRef(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toolNames, setToolNames] = useState<string[]>([]);
  const { disabledTools } = useCustomization();
  const { layout } = useAppearance();
  const inset = layout !== "borderless";

  const {
    messages,
    isStreaming,
    send,
    stop,
    load,
    editFrom,
    sessionId,
    setSessionId,
    context,
  } = useChat();

  const refreshFiles = useCallback(() => {
    const request = ++filesRequest.current;
    setFilesLoading(true);
    fetchWorkspace(sessionId)
      .then((items) => {
        if (request === filesRequest.current) {
          setFiles(items);
          setFilesError(null);
        }
      })
      .catch((error) => {
        if (request === filesRequest.current) setFilesError(error.message);
      })
      .finally(() => {
        if (request === filesRequest.current) setFilesLoading(false);
      });
  }, [sessionId]);

  useEffect(() => {
    setFiles([]);
    refreshFiles();
    const unsubscribe = onWorkspaceChanged(sessionId, refreshFiles);
    return () => {
      ++filesRequest.current;
      unsubscribe();
    };
  }, [sessionId, refreshFiles]);

  useEffect(() => {
    if (!isStreaming) refreshFiles();
  }, [isStreaming, refreshFiles]);

  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;
    fetchSession(initialSessionId)
      .then((session) => {
        if (!cancelled) load(session);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialSessionId, load]);

  useEffect(() => {
    if (!isStreaming && sessionId && pathname === "/")
      router.replace(`/chat/${sessionId}`);
  }, [isStreaming, sessionId, pathname, router]);

  const sources = useMemo(() => collectSources(messages), [messages]);
  const hasMessages = messages.length > 0;
  const chatTools = useMemo(
    () => enabledToolNames(toolNames, disabledTools),
    [toolNames, disabledTools],
  );

  useEffect(() => {
    let cancelled = false;
    fetchTools().then((data) => {
      if (!cancelled) setToolNames(data.map((t) => t.name));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isStreaming) setSuggestions([]);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) return;
    const lastAssistant = messages[messages.length - 1];
    if (
      !lastAssistant ||
      lastAssistant.role !== "assistant" ||
      !lastAssistant.text
    ) {
      return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    let cancelled = false;
    fetchSuggestions(lastUser.text, lastAssistant.text).then((data) => {
      if (!cancelled) setSuggestions(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isStreaming, messages]);

  useEffect(() => {
    let cancelled = false;
    fetchModels()
      .then((data) => {
        if (cancelled) return;
        setModels(data);
        setModelsError(null);
        const def = data.find((m) => m.isDefault) ?? data[0];
        if (def) setModel(def.key);
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(
            error instanceof Error ? error.message : "Failed to load models",
          );
        }
      })
      .finally(() => !cancelled && setModelsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const lastModelRef = useRef("");
  useEffect(() => {
    if (!model || lastModelRef.current === model) return;
    lastModelRef.current = model;
    const active = models.find((m) => m.key === model);
    const fallback = active?.reasoningEfforts?.[0];
    const next = active?.defaultReasoningEffort ?? fallback;
    if (next) setEffort(next);
  }, [model, models]);

  function handleSend(text: string, attachments?: MessageAttachment[]) {
    send(text, { model, reasoningEffort: effort, tools: chatTools }, attachments);
  }

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => onWidgetPrompt((text) => handleSendRef.current(text)), []);

  function handleEditMessage(id: string, text: string) {
    editFrom(id, text, { model, reasoningEffort: effort, tools: chatTools });
  }

  const renderInput = (menuPlacement: "top" | "bottom") => (
    <ChatInput
      onSend={handleSend}
      onStop={stop}
      disabled={isStreaming || !model}
      streaming={isStreaming}
      models={models}
      model={model}
      onModelChange={setModel}
      effort={effort}
      onEffortChange={setEffort}
      modelsLoading={modelsLoading}
      context={context}
      sessionId={sessionId}
      onSessionCreated={setSessionId}
      menuPlacement={menuPlacement}
      placeholder={
        messages.length ? "Message Corro" : "Assign a task to Corro…"
      }
    />
  );

  const total = sources.length + files.length;

  return (
    <AppShell activeSessionId={sessionId}>
      <main
        className={clsx(
          "relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-surface",
          inset && "panel-shadow rounded-panel",
        )}
      >
        <button
          type="button"
          onClick={() => setInspectorOpen((o) => !o)}
          aria-expanded={inspectorOpen}
          title={inspectorOpen ? "Hide sources" : "Show sources and workspace"}
          className={clsx(
            "absolute right-3 top-3 z-20 flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-2 text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink",
            inspectorOpen && "bg-surface-raised text-ink",
          )}
        >
          <PanelRight size={16} />
          {total > 0 && (
            <span className="font-mono text-caption tabular-nums">{total}</span>
          )}
        </button>

        {hasMessages && (
          <motion.div
            initial={motionOff ? false : reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.3, delay: 0.14, ease: EASE }
            }
            className="flex min-h-0 flex-1 flex-col"
          >
            <MessageList
              messages={messages}
              suggestions={isStreaming ? undefined : suggestions}
              onSuggestionSelect={handleSend}
              onEditMessage={isStreaming ? undefined : handleEditMessage}
              sessionId={sessionId}
            />
          </motion.div>
        )}

        <div
          className={clsx(
            "px-4 sm:px-8",
            hasMessages
              ? "pb-5 pt-1"
              : "flex flex-1 flex-col justify-center pt-[68px]",
          )}
        >
          <motion.div
            layout={reduce ? false : "position"}
            transition={
              motionOff
                ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                : { duration: 0.55, ease: EASE }
            }
            className="corro-conversation relative mx-auto w-full"
          >
            <AnimatePresence>
              {!hasMessages && (
                <HeroLockup
                  key="hero"
                  className="absolute inset-x-0 bottom-full mx-auto mb-6 h-9 w-auto text-ink sm:h-11"
                />
              )}
            </AnimatePresence>

            {renderInput(hasMessages ? "top" : "bottom")}

            {modelsError && (
              <p className="mt-2 text-center text-caption text-contradicted">
                Could not load models: {modelsError}
              </p>
            )}

            <AnimatePresence>
              {hasMessages && (
                <motion.p
                  key="disclaimer"
                  initial={motionOff ? false : reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={
                    motionOff
                      ? { duration: 0, delay: 0, repeat: 0, type: "tween" }
                      : { duration: 0.3, delay: 0.3, ease: EASE }
                  }
                  className="mt-2.5 text-center text-caption text-ink-muted"
                >
                  Corro can be wrong. Verify anything that matters.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      <InspectorPopover
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        sources={sources}
        files={files}
        filesError={filesError}
        filesLoading={filesLoading}
        sessionId={sessionId}
        onFilesChanged={refreshFiles}
      />
    </AppShell>
  );
}

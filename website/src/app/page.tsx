"use client";

import { useMotionPreference } from "@/lib/appearance";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { PanelRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatInput } from "@/components/ChatInput";
import { HeroLockup } from "@/components/HeroLockup";
import { HistorySidebar } from "@/components/HistorySidebar";
import { MessageList } from "@/components/MessageList";
import { SidePanel } from "@/components/SidePanel";
import { useChat } from "@/hooks/useChat";
import {
  fetchModels,
  fetchSession,
  fetchSuggestions,
  fetchWorkspace,
  type WorkspaceFile,
} from "@/lib/api";
import { useAppearance } from "@/lib/appearance";
import { collectSources } from "@/lib/sources";
import type { Effort, ModelDescription } from "@/lib/types";
import { onWorkspaceChanged } from "@/lib/workspace-events";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Home() {
  const motionOff = useMotionPreference();
  const reduce = useMotionPreference();
  const [models, setModels] = useState<ModelDescription[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [model, setModel] = useState<string>("");
  const [effort, setEffort] = useState<Effort>("high");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const filesRequest = useRef(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { layout, ambient } = useAppearance();
  const inset = layout !== "borderless";

  useEffect(() => {
    if (layout === "studio") setInspectorOpen(true);
    if (layout === "focus") setInspectorOpen(false);
  }, [layout]);

  const {
    messages,
    isStreaming,
    send,
    stop,
    reset,
    load,
    editFrom,
    sessionId,
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
    if (!isStreaming) setHistoryRefresh((n) => n + 1);
  }, [isStreaming]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === sessionId) return;
      fetchSession(id)
        .then(load)
        .catch(() => {});
    },
    [sessionId, load],
  );

  const sources = useMemo(() => collectSources(messages), [messages]);
  const hasMessages = messages.length > 0;

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
        const def = data.find((m) => m.isDefault) ?? data[0];
        if (def) setModel(def.key);
      })
      .catch(() => {})
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

  function handleSend(text: string) {
    send(text, { model, reasoningEffort: effort });
  }

  function handleEditMessage(id: string, text: string) {
    editFrom(id, text, { model, reasoningEffort: effort });
  }

  const renderInput = (menuPlacement: "top" | "bottom") => (
    <ChatInput
      onSend={handleSend}
      onStop={stop}
      onNewChat={reset}
      disabled={isStreaming || !model}
      streaming={isStreaming}
      models={models}
      model={model}
      onModelChange={setModel}
      effort={effort}
      onEffortChange={setEffort}
      modelsLoading={modelsLoading}
      context={context}
      menuPlacement={menuPlacement}
      placeholder={
        messages.length ? "Message Corro" : "Assign a task to Corro…"
      }
    />
  );

  const total = sources.length + files.length;

  return (
    <div
      className={clsx(
        "relative flex h-dvh overflow-hidden",
        inset ? "gap-2 bg-canvas p-2" : "bg-surface",
      )}
    >
      {ambient && inset && <div aria-hidden className="aurora" />}

      <HistorySidebar
        activeId={sessionId}
        refreshKey={historyRefresh}
        onSelect={handleSelectSession}
        onNewChat={reset}
      />

      <main
        className={clsx(
          "relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-surface",
          inset && "panel-shadow rounded-panel",
        )}
      >
        {ambient && <div aria-hidden className="panel-wash" />}

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

      <SidePanel
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        sources={sources}
        files={files}
        filesError={filesError}
        filesLoading={filesLoading}
        sessionId={sessionId}
        onFilesChanged={refreshFiles}
      />
    </div>
  );
}

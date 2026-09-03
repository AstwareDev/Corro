"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { collectSources } from "@/lib/sources";
import type { Effort, ModelDescription } from "@/lib/types";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Home() {
  const reduce = useReducedMotion();
  const [models, setModels] = useState<ModelDescription[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [model, setModel] = useState<string>("");
  const [effort, setEffort] = useState<Effort>("high");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const { messages, isStreaming, send, stop, reset, load, sessionId, context } =
    useChat();

  const refreshFiles = useCallback(() => {
    fetchWorkspace(sessionId)
      .then(setFiles)
      .catch(() => {});
  }, [sessionId]);

  
  
  useEffect(() => {
    if (!isStreaming) refreshFiles();
  }, [isStreaming, sessionId, refreshFiles]);

  
  
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

  const panel = (
    <SidePanel
      sources={sources}
      files={files}
      sessionId={sessionId}
      onFilesChanged={refreshFiles}
    />
  );

  const history = (
    <HistorySidebar
      activeId={sessionId}
      refreshKey={historyRefresh}
      onSelect={handleSelectSession}
      onNewChat={reset}
    />
  );

  
  
  
  return (
    <div className="flex h-screen bg-bg">
      {history}
      <div className="relative flex flex-1 flex-col">
        {panel}

        {hasMessages && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.14, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <MessageList
              messages={messages}
              suggestions={isStreaming ? undefined : suggestions}
              onSuggestionSelect={handleSend}
            />
          </motion.div>
        )}

        <div
          className={clsx(
            "px-4 sm:px-8",
            hasMessages
              ? "pb-6 pt-2"
              : 
                
                "flex flex-1 flex-col justify-center pt-[68px]",
          )}
        >
          <motion.div
            layout={reduce ? false : "position"}
            transition={{ duration: 0.55, ease: EASE }}
            className="relative mx-auto w-full max-w-3xl"
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
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.3, ease: EASE }}
                  className="mt-2 text-center text-[11px] text-ink-muted"
                >
                  Corro can be wrong. Verify anything that matters.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

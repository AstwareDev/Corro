"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Plus, Square } from "lucide-react";
import { useRef, useState } from "react";
import type { ContextUsage, Effort, ModelDescription } from "@/lib/types";
import { ContextMeter } from "./ContextMeter";
import { ModelMenu } from "./ModelMenu";
import { PromptEditor, type PromptEditorHandle } from "./PromptEditor";

export function ChatInput({
  onSend,
  onStop,
  onNewChat,
  disabled,
  streaming,
  models,
  model,
  onModelChange,
  effort,
  onEffortChange,
  modelsLoading,
  context,
  menuPlacement = "top",
  placeholder,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  onNewChat: () => void;
  disabled: boolean;
  streaming: boolean;
  models: ModelDescription[];
  model: string;
  onModelChange: (key: string) => void;
  effort: Effort;
  onEffortChange: (v: Effort) => void;
  modelsLoading: boolean;
  context?: ContextUsage;
  
  menuPlacement?: "top" | "bottom";
  placeholder?: string;
}) {
  const [empty, setEmpty] = useState(true);
  const editorRef = useRef<PromptEditorHandle>(null);

  function submit() {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const markdown = editor.getMarkdown().trim();
    if (!markdown) return;
    onSend(markdown);
    editor.clear();
    setEmpty(true);
  }

  return (
    <div className="relative rounded-[28px] border border-black/[0.06] bg-surface px-4 pb-2 pt-3.5 shadow-[0_1px_2px_rgba(16,16,16,0.04),0_10px_30px_-12px_rgba(16,16,16,0.12)] transition-shadow focus-within:shadow-[0_1px_2px_rgba(16,16,16,0.05),0_14px_36px_-12px_rgba(16,16,16,0.16)]">
      <AnimatePresence>
        {streaming && (
          <motion.div
            key="thinking-ring"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0"
          >
            <span className="corro-thinking-glow" />
            <span className="corro-thinking-ring" />
          </motion.div>
        )}
      </AnimatePresence>

      <PromptEditor
        handleRef={editorRef}
        onSubmit={submit}
        onChange={setEmpty}
        disabled={disabled}
        placeholder={placeholder}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            disabled={streaming}
            title="New chat"
            className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          >
            <Plus size={18} />
          </button>
          {context && (
            <ContextMeter context={context} placement={menuPlacement} />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ModelMenu
            models={models}
            model={model}
            onModelChange={onModelChange}
            effort={effort}
            onEffortChange={onEffortChange}
            loading={modelsLoading}
            placement={menuPlacement}
          />

          <motion.button
            type="button"
            onClick={streaming ? onStop : submit}
            disabled={!streaming && (disabled || empty)}
            whileTap={{ scale: 0.92 }}
            animate={{
              backgroundColor:
                streaming || !empty
                  ? "var(--color-ink)"
                  : "var(--color-surface-raised)",
            }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              "relative flex size-8 shrink-0 items-center justify-center rounded-full",
              streaming || !empty ? "text-bg" : "text-ink-muted",
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {streaming ? (
                <motion.span
                  key="stop"
                  initial={{ opacity: 0, scale: 0.4, rotate: -90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.4, rotate: 90 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Square size={12} fill="currentColor" />
                </motion.span>
              ) : (
                <motion.span
                  key="send"
                  initial={{ opacity: 0, scale: 0.4, rotate: 90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.4, rotate: -90 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <ArrowUp size={15} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </div>
  );
}

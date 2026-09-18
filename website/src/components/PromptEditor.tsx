"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type RefObject, useEffect, useImperativeHandle, useRef } from "react";
import { Markdown } from "tiptap-markdown";

export interface PromptEditorHandle {
  getMarkdown: () => string;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
}

const SubmitKeymap = Extension.create<{ onSubmit: () => void }>({
  name: "submitKeymap",
  priority: 1000,

  addOptions() {
    return { onSubmit: () => {} };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive("codeBlock")) return false;
        this.options.onSubmit();
        return true;
      },
      "Shift-Enter": () =>
        this.editor.commands.first(({ commands }) => [
          () => commands.splitListItem("listItem"),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock(),
        ]),
    };
  },
});

export function PromptEditor({
  handleRef,
  onSubmit,
  onChange,
  onFiles,
  disabled,
  placeholder = "Ask anything…",
}: {
  handleRef: RefObject<PromptEditorHandle | null>;
  onSubmit: () => void;
  onChange?: (empty: boolean) => void;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        horizontalRule: false,
      }),

      Placeholder.configure({ placeholder, showOnlyWhenEditable: false }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        linkify: false,
        breaks: true,
      }),
      SubmitKeymap.configure({ onSubmit: () => onSubmitRef.current() }),
    ],
    editorProps: {
      attributes: {
        class:
          "corro-prompt scroll-thin max-h-[240px] overflow-y-auto px-1 py-1 text-[15px] leading-relaxed text-ink focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length || !onFilesRef.current) return false;
        onFilesRef.current(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length || !onFilesRef.current) return false;
        event.preventDefault();
        onFilesRef.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.isEmpty),
  });

  useImperativeHandle(
    handleRef,
    () => ({
      getMarkdown: () => {
        const storage = editor?.storage as
          | { markdown?: { getMarkdown: () => string } }
          | undefined;
        return storage?.markdown?.getMarkdown() ?? "";
      },
      clear: () => editor?.commands.clearContent(true),
      focus: () => editor?.commands.focus(),
      isEmpty: () => editor?.isEmpty ?? true,
    }),
    [editor],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return <EditorContent editor={editor} />;
}

"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Markdown } from "tiptap-markdown";
import { fetchSkills, type SkillDescription } from "@/lib/api";

export interface PromptEditorHandle {
  getMarkdown: () => string;
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
}

const SlashKeymap = Extension.create<{
  onComplete: () => boolean;
  onNavigate: (dir: 1 | -1) => boolean;
  onDismiss: () => boolean;
}>({
  name: "slashKeymap",
  priority: 1000,

  addOptions() {
    return {
      onComplete: () => false,
      onNavigate: () => false,
      onDismiss: () => false,
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.options.onComplete(),
      ArrowUp: () => this.options.onNavigate(-1),
      ArrowDown: () => this.options.onNavigate(1),
      Escape: () => this.options.onDismiss(),
    };
  },
});

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

const SlashHighlight = Extension.create({
  name: "slashHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("slashHighlight"),
        props: {
          decorations(state) {
            const first = state.doc.firstChild;
            if (!first || first.type.name !== "paragraph") return null;
            const match = /^\/[A-Za-z0-9-_]+/.exec(first.textContent);
            if (!match) return null;
            return DecorationSet.create(state.doc, [
              Decoration.inline(1, 1 + match[0].length, {
                class: "corro-slash",
              }),
            ]);
          },
        },
      }),
    ];
  },
});

const SLASH_TOKEN = /^\/([A-Za-z0-9-_]*)$/;

interface CursorState {
  state: {
    doc: {
      firstChild: {
        textBetween: (from: number, to: number) => string;
      } | null;
    };
    selection: {
      $head: {
        parent: unknown;
        parentOffset: number;
        before: () => number;
      };
    };
  };
}

function slashQueryAtCursor(editor: CursorState): string | null {
  const { state } = editor;
  const first = state.doc.firstChild;
  const $head = state.selection.$head;
  if (!first || $head.parent !== first) return null;
  const before = first.textBetween(0, $head.parentOffset);
  const match = SLASH_TOKEN.exec(before);
  return match ? match[1] : null;
}

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

  const [skills, setSkills] = useState<SkillDescription[]>([]);
  const [slash, setSlash] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSkills().then((data) => {
      if (!cancelled) setSkills(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches =
    slash === null
      ? []
      : skills.filter((s) =>
          s.name.toLowerCase().startsWith(slash.toLowerCase()),
        );
  const open = slash !== null && matches.length > 0;

  // Key handling lives in the editor extension below (not on a wrapper div),
  // so shortcuts keep working with focus inside ProseMirror. The ref always
  // points at fresh state because it is reassigned every render.
  const slashCtlRef = useRef<{
    complete: () => boolean;
    navigate: (dir: 1 | -1) => boolean;
    dismiss: () => boolean;
  }>({
    complete: () => false,
    navigate: () => false,
    dismiss: () => false,
  });

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
      SlashHighlight,
      SlashKeymap.configure({
        onComplete: () => slashCtlRef.current.complete(),
        onNavigate: (dir: 1 | -1) => slashCtlRef.current.navigate(dir),
        onDismiss: () => slashCtlRef.current.dismiss(),
      }),
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
    onUpdate: ({ editor: e }) => {
      onChange?.(e.isEmpty);
      const query = slashQueryAtCursor(e);
      setSlash((prev) => (prev === query ? prev : query));
      setSelected(0);
    },
    onSelectionUpdate: ({ editor: e }) => {
      const query = slashQueryAtCursor(e);
      setSlash((prev) => (prev === query ? prev : query));
      setSelected(0);
    },
  });

  function complete(name: string) {
    if (!editor || slash === null) return;
    const { state } = editor;
    const $head = state.selection.$head;
    const from = $head.before() + 1;
    const to = from + 1 + slash.length;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContent(`/${name} `)
      .run();
    setSlash(null);
  }

  slashCtlRef.current = {
    complete: () => {
      if (!open) return false;
      complete(matches[selected]?.name ?? matches[0].name);
      return true;
    },
    navigate: (dir) => {
      if (!open) return false;
      setSelected((i) => (i + dir + matches.length) % matches.length);
      return true;
    },
    dismiss: () => {
      if (!open) return false;
      setSlash(null);
      return true;
    },
  };

  useImperativeHandle(
    handleRef,
    () => ({
      getMarkdown: () => {
        const storage = editor?.storage as
          | { markdown?: { getMarkdown: () => string } }
          | undefined;
        return storage?.markdown?.getMarkdown() ?? "";
      },
      clear: () => {
        editor?.commands.clearContent(true);
        setSlash(null);
      },
      focus: () => editor?.commands.focus(),
      isEmpty: () => editor?.isEmpty ?? true,
    }),
    [editor],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div className="relative">
      {open && (
        <div className="popover-material absolute bottom-full left-0 z-30 mb-2 w-80 max-w-full rounded-popover p-1.5">
          <p className="px-2.5 pb-1 pt-1 text-caption font-medium text-ink-muted">
            Skills
          </p>
          <div className="scroll-thin max-h-[240px] overflow-y-auto overscroll-contain">
            {matches.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => complete(s.name)}
                onMouseEnter={() => setSelected(i)}
                className={`flex w-full items-center gap-2.5 rounded-row px-2.5 py-2 text-left transition-colors ${
                  i === selected ? "bg-surface-raised" : "hover:bg-surface-raised"
                }`}
              >
                <span className="shrink-0 text-footnote font-medium text-citation">
                  /{s.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-footnote text-ink-muted">
                  {s.description}
                </span>
              </button>
            ))}
          </div>
          <p className="px-2.5 pb-1 pt-1 text-caption text-ink-muted">
            Tab to complete · Esc to dismiss
          </p>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

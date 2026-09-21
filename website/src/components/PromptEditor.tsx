"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { SkillIcon } from "./tools/registry";
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
            const run = /^((?:\/[A-Za-z0-9-_]+\s*)+)/.exec(
              first.textContent,
            );
            if (!run) return null;
            const decos: Decoration[] = [];
            for (const m of run[1].matchAll(/\/[A-Za-z0-9-_]+/g)) {
              const at = 1 + (m.index ?? 0);
              decos.push(
                Decoration.inline(at, at + m[0].length, {
                  class: "corro-slash",
                }),
              );
            }
            if (!decos.length) return null;
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

function leadingSkillNames(text: string): string[] {
  const run = /^((?:\/[A-Za-z0-9-_]+\s*)+)/.exec(text);
  if (!run) return [];
  return [...run[1].matchAll(/\/([A-Za-z0-9-_]+)/g)].map((m) =>
    m[1].toLowerCase(),
  );
}

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
        pos: number;
        before: () => number;
      };
    };
  };
}

// Matches the /token being typed right before the cursor, but only when
// everything ahead of it in the first paragraph is already-complete skill
// tokens — so `/a /b /par|` chains, while mid-message slashes stay quiet.
function slashQueryAtCursor(editor: CursorState): string | null {
  const { state } = editor;
  const first = state.doc.firstChild;
  const $head = state.selection.$head;
  if (!first || $head.parent !== first) return null;
  const before = first.textBetween(0, $head.parentOffset);
  const token = /\/([A-Za-z0-9-_]*)$/.exec(before);
  if (!token) return null;
  const prefix = before.slice(0, token.index);
  if (!/^(?:\/[A-Za-z0-9-_]+\s+)*\s*$/.test(prefix)) return null;
  return token[1];
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
  const [used, setUsed] = useState<string[]>([]);
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
      : skills.filter(
          (s) =>
            !used.includes(s.name.toLowerCase()) &&
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
          "corro-prompt scroll-thin max-h-[240px] overflow-y-auto px-1 py-1 text-body leading-relaxed text-ink focus:outline-none",
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
      setUsed(leadingSkillNames(e.state.doc.firstChild?.textContent ?? ""));
      setSelected(0);
    },
    onSelectionUpdate: ({ editor: e }) => {
      const query = slashQueryAtCursor(e);
      setSlash((prev) => (prev === query ? prev : query));
      setUsed(leadingSkillNames(e.state.doc.firstChild?.textContent ?? ""));
      setSelected(0);
    },
  });

  function complete(name: string) {
    if (!editor || slash === null) return;
    const { state } = editor;
    const $head = state.selection.$head;
    // The partial token always sits immediately before the cursor.
    const to = $head.pos;
    const from = to - slash.length - 1;
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

  const active = matches[Math.min(selected, matches.length - 1)];

  return (
    <div className="relative">
      {open && (
        <>
          <div className="popover-material absolute bottom-full left-0 z-30 mb-2 w-64 max-w-full rounded-popover p-1.5">
            <div className="scroll-thin max-h-[240px] overflow-y-auto overscroll-contain">
              {matches.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => complete(s.name)}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full items-center gap-2 rounded-row px-2.5 py-2 text-left transition-colors ${
                    i === selected ? "bg-accent-soft" : "hover:bg-surface-raised"
                  }`}
                >
                  <SkillIcon
                    size={14}
                    className={`shrink-0 ${
                      i === selected ? undefined : "opacity-60"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate font-sans text-footnote font-semibold ${
                      i === selected ? "text-accent-text" : "text-ink"
                    }`}
                  >
                    /{s.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {active && (
            <div className="popover-material absolute bottom-full left-[272px] z-30 mb-2 hidden w-72 max-w-full rounded-popover px-3 py-2.5 sm:block">
              <p className="font-sans text-footnote font-semibold text-accent-text">
                /{active.name}
              </p>
              <p className="mt-1 text-footnote leading-relaxed text-ink">
                {active.description}
              </p>
            </div>
          )}
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

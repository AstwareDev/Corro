"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Globe2,
  LayoutGrid,
  Monitor,
  Moon,
  Palette,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type AmbientPalette,
  type Layout,
  type Theme,
  useAppearance,
} from "@/lib/appearance";
import { CorroMark } from "./CorroMark";

const EASE = [0.16, 1, 0.3, 1] as const;
const SECTIONS = [
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    description: "A space that feels like you.",
  },
  {
    id: "layout",
    label: "Layout",
    icon: LayoutGrid,
    description: "Make room for the way you work.",
  },
  {
    id: "language",
    label: "Language",
    icon: Globe2,
    description: "A little closer to home.",
  },
] as const;
type Section = (typeof SECTIONS)[number]["id"];
const LAYOUTS: { id: Layout; label: string; description: string }[] = [
  {
    id: "inset",
    label: "Inset",
    description: "Floating panels. A little breathing room.",
  },
  {
    id: "borderless",
    label: "Edge to edge",
    description: "One seamless, full-height workspace.",
  },
  {
    id: "focus",
    label: "Focus",
    description: "A quiet rail and a narrower reading view.",
  },
  {
    id: "studio",
    label: "Studio",
    description: "A wider sidebar and more room for ideas.",
  },
];
const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];
const AMBIENTS: { id: AmbientPalette; label: string }[] = [
  { id: "sky", label: "Sky" },
  { id: "ice", label: "Ice" },
  { id: "mint", label: "Mint" },
  { id: "sand", label: "Sand" },
];
const LANGUAGES = [
  { id: "en", name: "English", native: "English", flag: "gb" },
  { id: "hy", name: "Armenian", native: "Հայերեն", flag: "am" },
  { id: "fr", name: "French", native: "Français", flag: "fr" },
  { id: "de", name: "German", native: "Deutsch", flag: "de" },
  { id: "es", name: "Spanish", native: "Español", flag: "es" },
  { id: "ja", name: "Japanese", native: "日本語", flag: "jp" },
  { id: "pt", name: "Portuguese", native: "Português", flag: "pt" },
  { id: "ko", name: "Korean", native: "한국어", flag: "kr" },
];

function WorkspacePreview({
  layout = "inset",
  theme,
  live = false,
}: {
  layout?: Layout;
  theme?: Theme;
  live?: boolean;
}) {
  const { ambient, ambientPalette, ambientIntensity } = useAppearance();
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "settings-preview",
        `preview-${layout}`,
        theme && `preview-${theme}`,
        live && "preview-live",
        live && ambient && "preview-ambient",
      )}
      data-ambient-palette={ambientPalette}
      style={
        live
          ? ({
              "--ambient-strength": ambientIntensity / 100,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="preview-sidebar">
        <span className="preview-brand">
          <CorroMark />
        </span>
        <span className="preview-nav active" />
        <span className="preview-nav" />
        <span className="preview-nav" />
        <span className="preview-nav preview-bottom" />
      </div>
      <div className="preview-main">
        <div className="preview-conversation">
          {live ? (
            <span className="preview-wordmark">
              <CorroMark className="preview-logo" />
              CORRO
            </span>
          ) : (
            <>
              <span className="preview-user" />
              <span className="preview-line" />
              <span className="preview-line short" />
            </>
          )}
        </div>
        <div className="preview-composer">
          {live && <span>Assign a task to Corro…</span>}
          <span className="preview-send">{live && <ArrowUp size={13} />}</span>
        </div>
      </div>
      {layout === "studio" && (
        <div className="preview-inspector">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx("settings-switch", checked && "is-on")}
    >
      <span />
    </button>
  );
}

function AppearancePanel() {
  const {
    theme,
    ambient,
    ambientPalette,
    ambientIntensity,
    textSize,
    reducedMotion,
    layout,
    updateAppearance,
  } = useAppearance();
  return (
    <div className="settings-appearance-grid">
      <div className="settings-live-preview">
        <WorkspacePreview layout={layout} live />
        <span className="preview-caption">
          <span />
          Live preview
        </span>
      </div>
      <fieldset className="settings-fieldset">
        <legend>Theme</legend>
        <div className="settings-theme-grid">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={clsx(
                "settings-theme-option",
                theme === id && "is-selected",
              )}
              aria-pressed={theme === id}
              onClick={() => updateAppearance({ theme: id })}
            >
              <WorkspacePreview theme={id} />
              <span className="settings-option-label">
                <Icon size={15} />
                {label}
                <span className="settings-selection">
                  {theme === id && <Check size={11} strokeWidth={3} />}
                </span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="settings-row">
        <div>
          <h3>Ambient color</h3>
          <p>A soft wash of color behind your workspace.</p>
        </div>
        <Toggle
          checked={ambient}
          onChange={(ambient) => updateAppearance({ ambient })}
          label="Ambient color"
        />
      </div>
      {ambient && (
        <fieldset className="settings-ambient-controls">
          <legend className="sr-only">Ambient appearance</legend>
          <div className="settings-ambient-grid">
            {AMBIENTS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-label={`${label} ambient`}
                aria-pressed={ambientPalette === id}
                className={clsx(
                  "ambient-sample",
                  ambientPalette === id && "is-selected",
                )}
                data-ambient-palette={id}
                onClick={() => updateAppearance({ ambientPalette: id })}
              >
                <span className="ambient-sample-image" />
                <span>
                  {label}
                  {ambientPalette === id && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>
          <label className="ambient-intensity">
            <span>Intensity</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={ambientIntensity}
              onChange={(event) =>
                updateAppearance({
                  ambientIntensity: Number(event.target.value),
                })
              }
            />
            <output>{ambientIntensity}%</output>
          </label>
        </fieldset>
      )}
      <div className="settings-row">
        <div>
          <h3>Reading size</h3>
          <p>Find a comfortable size for conversations.</p>
        </div>
        <fieldset className="settings-segment" aria-label="Reading size">
          {(["small", "default", "large"] as const).map((size, i) => (
            <button
              key={size}
              type="button"
              aria-label={`${size[0].toUpperCase()}${size.slice(1)} reading size`}
              aria-pressed={textSize === size}
              title={size}
              className={clsx(textSize === size && "is-selected")}
              onClick={() => updateAppearance({ textSize: size })}
              style={{ fontSize: 12 + i * 3 }}
            >
              Aa
            </button>
          ))}
        </fieldset>
      </div>
      <div className="settings-row last">
        <div>
          <h3>Reduce motion</h3>
          <p>Turn off movement, fades, and animated text.</p>
        </div>
        <div className="settings-motion-control">
          <span className="motion-specimen" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <Toggle
            checked={reducedMotion}
            onChange={(reducedMotion) => updateAppearance({ reducedMotion })}
            label="Reduce motion"
          />
        </div>
      </div>
    </div>
  );
}

function LayoutPanel() {
  const { layout, setLayout } = useAppearance();
  return (
    <>
      <div className="settings-layout-grid">
        {LAYOUTS.map(({ id, label, description }) => (
          <button
            key={id}
            type="button"
            className={clsx(
              "settings-layout-option",
              layout === id && "is-selected",
            )}
            aria-pressed={layout === id}
            onClick={() => setLayout(id)}
          >
            <WorkspacePreview layout={id} />
            <span className="settings-option-label">
              {label}
              <span className="settings-selection">
                {layout === id && <Check size={11} strokeWidth={3} />}
              </span>
            </span>
            <span className="settings-layout-description">{description}</span>
          </button>
        ))}
      </div>
      <div className="settings-note">
        <LayoutGrid size={17} />
        <p>
          Switch things up whenever you like. Your conversations and workspace
          stay right where you left them.
        </p>
      </div>
    </>
  );
}

function Flag({ country }: { country: string }) {
  return (
    <span
      aria-hidden="true"
      className="settings-flag"
      style={{ backgroundImage: `url(/flags/${country}.svg)` }}
    />
  );
}

function LanguagePanel() {
  const { language, updateAppearance } = useAppearance();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected =
    LANGUAGES.find((item) => item.id === language) ?? LANGUAGES[0];
  const filtered = LANGUAGES.filter((item) =>
    `${item.name} ${item.native}`.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);
  function select(id: string) {
    updateAppearance({ language: id });
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div ref={container} className="settings-language-picker">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={`Display language: ${selected.name}`}
        className={clsx("settings-language-trigger", open && "is-open")}
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setQuery("");
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <Flag country={selected.flag} />
        <span>
          {selected.native}
          <small>
            {selected.name === selected.native
              ? "English (United Kingdom)"
              : selected.name}
          </small>
        </span>
        <ChevronDown size={16} className={clsx(open && "rotate-180")} />
      </button>
      {open && (
        <div className="settings-language-dropdown">
          <div className="settings-language-search">
            <Search size={15} />
            <input
              ref={search}
              role="combobox"
              aria-label="Search languages"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                filtered.length ? `${listId}-${active}` : undefined
              }
              placeholder="Search languages…"
              value={query}
              onBlur={(event) => {
                if (!container.current?.contains(event.relatedTarget))
                  setOpen(false);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                  trigger.current?.focus();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((previous) =>
                    filtered.length
                      ? (previous +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          filtered.length) %
                        filtered.length
                      : 0,
                  );
                }
                if (event.key === "Home" && !event.shiftKey) {
                  event.preventDefault();
                  setActive(0);
                }
                if (event.key === "End" && !event.shiftKey) {
                  event.preventDefault();
                  setActive(Math.max(0, filtered.length - 1));
                }
                if (event.key === "Enter" && filtered[active]) {
                  event.preventDefault();
                  select(filtered[active].id);
                }
              }}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="Languages"
            className="settings-language-options scroll-thin"
          >
            {filtered.map((item, index) => (
              <div
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={language === item.id}
                tabIndex={-1}
                className={clsx(
                  "settings-language-option",
                  active === index && "is-active",
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    select(item.id);
                }}
              >
                <Flag country={item.flag} />
                <span>
                  {item.native}
                  <small>{item.name}</small>
                </span>
                {language === item.id && <Check size={16} />}
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <output className="settings-no-results">
              No languages found. Try another search.
            </output>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>("appearance");
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const prefersReduced = useReducedMotion();
  const { reducedMotion } = useAppearance();
  const reduce = prefersReduced || reducedMotion;
  const titleId = useId();
  const sectionId = useId();
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  useEffect(() => {
    const element = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <motion.dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      className="settings-dialog"
      initial={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduce ? 1 : 0.98, y: reduce ? 0 : 8 }}
      transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-title">
            <CorroMark className="size-6" />
            <h1 id={titleId}>Settings</h1>
          </div>
          <nav aria-label="Settings sections">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? "page" : undefined}
                aria-controls={sectionId}
                className={clsx(
                  "settings-nav-item",
                  section === id && "is-active",
                )}
                onClick={() => {
                  setSection(id);
                  content.current?.scrollTo({ top: 0 });
                }}
              >
                {section === id && (
                  <motion.span
                    layoutId="settings-active-nav"
                    className="settings-nav-highlight"
                    transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
                  />
                )}
                <Icon size={18} strokeWidth={1.7} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="settings-main">
          <header className="settings-header">
            <div>
              {section === "language" ? (
                <div className="settings-language-heading">
                  <h2>Display language</h2>
                  <span
                    className="settings-preview-badge"
                    title="Visual preview only; does not translate the interface"
                  >
                    Preview
                  </span>
                </div>
              ) : (
                <>
                  <h2>{current.label}</h2>
                  <p>{current.description}</p>
                </>
              )}
            </div>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close settings"
              title="Close settings (Esc)"
              className="settings-close"
              onClick={onClose}
            >
              <X size={19} strokeWidth={1.7} />
            </button>
          </header>
          <div
            ref={content}
            className="settings-content scroll-thin"
            id={sectionId}
          >
            <motion.section
              key={section}
              aria-label={current.label}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
            >
              {section === "appearance" ? (
                <AppearancePanel />
              ) : section === "layout" ? (
                <LayoutPanel />
              ) : (
                <LanguagePanel />
              )}
            </motion.section>
          </div>
          <footer className="settings-footer">
            <span>
              <Check size={13} /> Preferences saved on this device
            </span>
            <button type="button" onClick={onClose}>
              Done
            </button>
          </footer>
        </div>
      </div>
    </motion.dialog>
  );
}

export function SettingsMenu({
  children,
}: {
  children: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      {children({ open, toggle: () => setOpen((value) => !value) })}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && <SettingsDialog onClose={() => setOpen(false)} />}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

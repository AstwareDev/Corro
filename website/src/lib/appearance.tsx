"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Layout = "inset" | "borderless" | "focus" | "studio";
export type Theme = "light" | "dark" | "system";
export type Accent = "graphite" | "blue" | "green" | "amber" | "rose";
export type TextSize = "small" | "default" | "large";
export type AmbientPalette = "sky" | "ice" | "mint" | "sand";

export interface Appearance {
  layout: Layout;
  ambient: boolean;
  ambientPalette: AmbientPalette;
  ambientIntensity: number;
  theme: Theme;
  accent: Accent;
  textSize: TextSize;
  reducedMotion: boolean;
  language: string;
}

const STORAGE_KEY = "corro_appearance";
const DEFAULTS: Appearance = {
  layout: "inset",
  ambient: true,
  ambientPalette: "sky",
  ambientIntensity: 60,
  theme: "system",
  accent: "graphite",
  textSize: "default",
  reducedMotion: false,
  language: "en",
};

interface AppearanceValue extends Appearance {
  setLayout: (layout: Layout) => void;
  setAmbient: (ambient: boolean) => void;
  updateAppearance: (patch: Partial<Appearance>) => void;
}

const AppearanceContext = createContext<AppearanceValue>({
  ...DEFAULTS,
  setLayout: () => {},
  setAmbient: () => {},
  updateAppearance: () => {},
});

function read(): Appearance {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return DEFAULTS;
    return {
      layout: ["inset", "borderless", "focus", "studio"].includes(parsed.layout)
        ? parsed.layout
        : DEFAULTS.layout,
      ambient: parsed.ambient !== false,
      ambientPalette: ["sky", "ice", "mint", "sand"].includes(
        parsed.ambientPalette,
      )
        ? parsed.ambientPalette
        : "sky",
      ambientIntensity:
        typeof parsed.ambientIntensity === "number" &&
        Number.isFinite(parsed.ambientIntensity)
          ? Math.max(0, Math.min(100, parsed.ambientIntensity))
          : 60,
      theme: ["light", "dark", "system"].includes(parsed.theme)
        ? parsed.theme
        : DEFAULTS.theme,
      accent: "graphite",
      textSize: ["small", "default", "large"].includes(parsed.textSize)
        ? parsed.textSize
        : DEFAULTS.textSize,
      reducedMotion: parsed.reducedMotion === true,
      language: ["en", "hy", "fr", "de", "es", "ja", "pt", "ko"].includes(
        parsed.language,
      )
        ? parsed.language
        : "en",
    };
  } catch {
    return DEFAULTS;
  }
}

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAppearance(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {}
  }, [appearance, ready]);

  useEffect(() => {
    const root = document.documentElement;
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme =
        appearance.theme === "system"
          ? system.matches
            ? "dark"
            : "light"
          : appearance.theme;
    };
    apply();
    system.addEventListener("change", apply);
    root.dataset.accent = "graphite";
    root.dataset.textSize = appearance.textSize;
    root.dataset.layout = appearance.layout;
    root.dataset.reduceMotion = String(appearance.reducedMotion);
    root.dataset.ambient = String(appearance.ambient);
    root.dataset.ambientPalette = appearance.ambientPalette;
    root.style.setProperty(
      "--ambient-strength",
      String(appearance.ambientIntensity / 100),
    );
    return () => system.removeEventListener("change", apply);
  }, [appearance]);

  const updateAppearance = useCallback((patch: Partial<Appearance>) => {
    setAppearance((previous) => ({ ...previous, ...patch }));
  }, []);

  const value = useMemo<AppearanceValue>(
    () => ({
      ...appearance,
      setLayout: (layout) => updateAppearance({ layout }),
      setAmbient: (ambient) => updateAppearance({ ambient }),
      updateAppearance,
    }),
    [appearance, updateAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <MotionConfig
        reducedMotion={appearance.reducedMotion ? "always" : "user"}
      >
        {children}
      </MotionConfig>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  return useContext(AppearanceContext);
}

export function useMotionPreference(): boolean {
  const system = useReducedMotion();
  const { reducedMotion } = useAppearance();
  return Boolean(system || reducedMotion);
}

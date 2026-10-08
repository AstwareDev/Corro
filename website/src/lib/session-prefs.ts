"use client";

import {
  type Effort,
  effortOptions,
  findFamily,
  groupModels,
  type ModelDescription,
} from "./types";

export interface SessionPrefs {
  model: string;
  effort: Effort;
}

interface SessionLike {
  model?: string;
  reasoningEffort?: string;
  messages?: Array<{ model?: string; reasoningEffort?: string }>;
}

/** Validate a saved model key against the current model list. */
export function isValidModel(
  models: ModelDescription[],
  key: string | undefined,
): key is string {
  return !!key && models.some((m) => m.key === key);
}

/** Validate a saved effort against the current options for a model. */
export function isValidEffort(
  models: ModelDescription[],
  modelKey: string,
  effort: string | undefined,
): effort is Effort {
  if (!effort) return false;
  const families = groupModels(models);
  const active = findFamily(families, modelKey);
  if (!active) return false;
  const options = effortOptions(active.standard, active.id).filter(
    (o) => o.key !== "none",
  );
  return options.some((o) => o.key === effort);
}

/** Default selection when no saved prefs exist or they are invalid. */
export function defaultPrefs(models: ModelDescription[]): SessionPrefs | null {
  const def = models.find((m) => m.isDefault) ?? models[0];
  if (!def) return null;
  const families = groupModels(models);
  const active = findFamily(families, def.key);
  const fallback = active?.standard.reasoningEfforts?.[0];
  const effort =
    active?.standard.defaultReasoningEffort ?? fallback ?? ("max" as Effort);
  return { model: def.key, effort };
}

/**
 * Resolve the selector init for a session: last saved model+effort if both
 * still exist, else the app default. Reads session.model/reasoningEffort
 * (saved on submit server-side); falls back to the last assistant message
 * with a model when the session record itself has none (legacy sessions).
 * Never writes — changing the selector alone must not overwrite the saved
 * value; only submitting (via /chat persist) does.
 */
export function resolveSessionPrefs(
  session: SessionLike | null | undefined,
  models: ModelDescription[],
): SessionPrefs | null {
  if (!models.length) return null;
  const savedModel = session?.model;
  const savedEffort = session?.reasoningEffort;
  if (isValidModel(models, savedModel)) {
    if (isValidEffort(models, savedModel, savedEffort)) {
      return { model: savedModel, effort: savedEffort as Effort };
    }
    // Model still exists but effort gone: keep the model, fall back to its
    // default effort rather than the app-default model.
    const families = groupModels(models);
    const active = findFamily(families, savedModel);
    const fallback = active?.standard.reasoningEfforts?.[0];
    const effort =
      active?.standard.defaultReasoningEffort ?? fallback ?? ("max" as Effort);
    return { model: savedModel, effort };
  }
  // Legacy sessions without session-level prefs: use the last assistant
  // message that carries a model (persist now writes per-turn model+effort).
  const msgs = session?.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (isValidModel(models, m.model)) {
      if (isValidEffort(models, m.model as string, m.reasoningEffort)) {
        return {
          model: m.model as string,
          effort: m.reasoningEffort as Effort,
        };
      }
      const families = groupModels(models);
      const active = findFamily(families, m.model as string);
      const fallback = active?.standard.reasoningEfforts?.[0];
      const effort =
        active?.standard.defaultReasoningEffort ??
        fallback ??
        ("max" as Effort);
      return { model: m.model as string, effort };
    }
  }
  return defaultPrefs(models);
}

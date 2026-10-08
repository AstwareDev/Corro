import { describe, expect, it } from "vitest";
import {
  defaultPrefs,
  isValidEffort,
  isValidModel,
  resolveSessionPrefs,
} from "./session-prefs";
import type { ModelDescription } from "./types";

function model(
  key: string,
  opts: Partial<ModelDescription> = {},
): ModelDescription {
  return {
    key,
    id: key,
    label: key,
    speed: "variable",
    free: true,
    notes: "",
    isDefault: false,
    online: true,
    requiresKey: false,
    ...opts,
  };
}

const MODELS: ModelDescription[] = [
  model("kimi-k3", {
    isDefault: true,
    reasoningEfforts: ["low", "high", "max"],
    defaultReasoningEffort: "max",
  }),
  model("qwen3-max", {
    reasoningEfforts: ["low", "medium", "xhigh"],
    defaultReasoningEffort: "xhigh",
  }),
];

describe("session prefs persistence", () => {
  it("validates models against the current list", () => {
    expect(isValidModel(MODELS, "kimi-k3")).toBe(true);
    expect(isValidModel(MODELS, "missing")).toBe(false);
    expect(isValidModel(MODELS, undefined)).toBe(false);
    expect(isValidModel([], "kimi-k3")).toBe(false);
  });

  it("validates efforts against the model's current options", () => {
    expect(isValidEffort(MODELS, "kimi-k3", "max")).toBe(true);
    expect(isValidEffort(MODELS, "kimi-k3", "xhigh")).toBe(false);
    expect(isValidEffort(MODELS, "qwen3-max", "xhigh")).toBe(true);
    expect(isValidEffort(MODELS, "missing", "max")).toBe(false);
    expect(isValidEffort(MODELS, "kimi-k3", undefined)).toBe(false);
  });

  it("restores the saved model and effort for a session", () => {
    expect(
      resolveSessionPrefs(
        { model: "qwen3-max", reasoningEffort: "medium" },
        MODELS,
      ),
    ).toEqual({ model: "qwen3-max", effort: "medium" });
  });

  it("keeps the model but falls back to its default effort when saved effort is gone", () => {
    expect(
      resolveSessionPrefs(
        { model: "qwen3-max", reasoningEffort: "max" },
        MODELS,
      ),
    ).toEqual({ model: "qwen3-max", effort: "xhigh" });
  });

  it("falls back to the app default when the saved model is gone", () => {
    expect(
      resolveSessionPrefs({ model: "gone", reasoningEffort: "max" }, MODELS),
    ).toEqual({ model: "kimi-k3", effort: "max" });
  });

  it("falls back to the app default when nothing was saved", () => {
    expect(resolveSessionPrefs({}, MODELS)).toEqual({
      model: "kimi-k3",
      effort: "max",
    });
    expect(resolveSessionPrefs(null, MODELS)).toEqual({
      model: "kimi-k3",
      effort: "max",
    });
  });

  it("uses the last assistant message for legacy sessions without record prefs", () => {
    expect(
      resolveSessionPrefs(
        {
          messages: [
            { model: "kimi-k3", reasoningEffort: "high" },
            { model: "qwen3-max", reasoningEffort: "medium" },
          ],
        },
        MODELS,
      ),
    ).toEqual({ model: "qwen3-max", effort: "medium" });
  });

  it("returns null without models (stable placeholder until loaded)", () => {
    expect(
      resolveSessionPrefs({ model: "kimi-k3", reasoningEffort: "max" }, []),
    ).toBeNull();
    expect(defaultPrefs([])).toBeNull();
  });

  it("different sessions keep their own selection", () => {
    const a = resolveSessionPrefs(
      { model: "kimi-k3", reasoningEffort: "high" },
      MODELS,
    );
    const b = resolveSessionPrefs(
      { model: "qwen3-max", reasoningEffort: "medium" },
      MODELS,
    );
    expect(a).toEqual({ model: "kimi-k3", effort: "high" });
    expect(b).toEqual({ model: "qwen3-max", effort: "medium" });
  });
});

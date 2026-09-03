



export type Effort = string;



const EFFORT_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  "kimi-k3": { low: "Standard" },
};


export function effortLabel(key: Effort, familyId?: string): string {
  const override = familyId && EFFORT_LABEL_OVERRIDES[familyId]?.[key];
  if (override) return override;
  if (key === "none") return "None";
  if (key === "xhigh") return "Extra high";
  return key.charAt(0).toUpperCase() + key.slice(1);
}



export function effortOptions(
  m?: ModelDescription,
  familyId?: string,
): { key: Effort; label: string }[] {
  const efforts = m?.reasoningEfforts?.length
    ? m.reasoningEfforts
    : ["low", "high", "max"];
  return efforts.map((key) => ({ key, label: effortLabel(key, familyId) }));
}



export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelDescription {
  key: string;
  id: string;
  label: string;
  speed: "variable" | "fast";
  free: boolean;
  notes: string;
  isDefault: boolean;
  online: boolean;
  error?: string;
  requiresKey: boolean;
  description?: string;
  contextLength?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  modalities?: ModelModalities;
  features?: string[];
  ownedBy?: string;
}



export interface ModelFamily {
  id: string;
  label: string;
  standard: ModelDescription;
  fast?: ModelDescription;
}



function familyLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function groupModels(models: ModelDescription[]): ModelFamily[] {
  const families = new Map<string, ModelFamily>();

  for (const m of models) {
    const isFast = m.key.endsWith("-fast");
    const id = isFast ? m.key.slice(0, -"-fast".length) : m.key;
    const existing = families.get(id);

    if (isFast) {
      if (existing) existing.fast = m;
      else
        families.set(id, {
          id,
          label: familyLabel(m.label),
          standard: m,
          fast: m,
        });
    } else if (existing) {
      existing.standard = m;
      existing.label = familyLabel(m.label);
    } else {
      families.set(id, { id, label: familyLabel(m.label), standard: m });
    }
  }

  return [...families.values()];
}

export function findFamily(
  families: ModelFamily[],
  modelKey: string,
): ModelFamily | undefined {
  return families.find(
    (f) => f.standard.key === modelKey || f.fast?.key === modelKey,
  );
}


export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallUI {
  localId: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: ToolCallStatus;
  startedAt: number;
  endedAt?: number;
  

  description?: string;
  
  partial?: string;
}


export function humanizeToolName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}



export function peekDescription(partial: string): string | undefined {
  const match = /"description"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(partial);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}





export type MessageBlock =
  | {
      kind: "reasoning";
      id: string;
      text: string;
      startedAt: number;
      endedAt?: number;
    }
  | { kind: "text"; id: string; text: string }
  | { kind: "tools"; id: string; calls: ToolCallUI[] };

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  
  text: string;
  blocks: MessageBlock[];
  streaming?: boolean;
  error?: string;
  createdAt: number;
  

  firstTokenAt?: number;
  completedAt?: number;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export const USAGE_KINDS = [
  "system",
  "tools",
  "history",
  "toolTraffic",
  "input",
  "overhead",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface ContextUsage {
  contextLength: number;
  used: number;
  remaining: number;
  percentUsed: number;
  breakdown: Record<UsageKind, number>;
}




export const DISPLAY_CONTEXT_MAX = 512_000;

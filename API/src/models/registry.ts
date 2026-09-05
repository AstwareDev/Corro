import 'dotenv/config'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { getTokenizer } from '../tokenizer/index.js'
import {
  MODELS,
  MODEL_KEYS,
  resolveModel,
  resolveModelKey,
  type ModelKey,
  type ModelSpec,
  type ModelSpeed,
} from '../tokenizer/specs.js'

export interface Endpoint {
  baseUrl: string
  apiKey?: string
}

export function endpointConfig(key: string): Endpoint {
  const spec = resolveModel(key)
  const baseUrl = process.env[spec.baseUrlEnv] ?? spec.defaultBaseUrl
  if (!baseUrl) {
    throw new Error(`Missing ${spec.baseUrlEnv} in the environment (see .env.example)`)
  }

  if (!spec.apiKeyEnv) return { baseUrl: baseUrl.replace(/\/+$/, '') }

  const apiKey = process.env[spec.apiKeyEnv]
  if (!apiKey) {
    throw new Error(`Missing ${spec.apiKeyEnv} in the environment (see .env.example)`)
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey }
}

const providers = new Map<ModelKey, ReturnType<typeof createOpenAICompatible>>()

function providerFor(key: ModelKey) {
  let p = providers.get(key)
  if (!p) {
    const { baseUrl, apiKey } = endpointConfig(key)
    p = createOpenAICompatible({ name: key, baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) })
    providers.set(key, p)
  }
  return p
}

export function chatModel(key: ModelKey): LanguageModel {
  return providerFor(key).chatModel(MODELS[key].servedModelId)
}

interface RawModelCard {
  id?: string
  name?: string
  display_name?: string
  description?: string
  context_length?: number
  context_window?: number
  max_output_length?: number
  max_output_tokens?: number
  input_modalities?: string[]
  output_modalities?: string[]
  modalities?: { input?: string[]; output?: string[] }
  supported_features?: string[]
  supported_sampling_parameters?: string[]
  reasoning_options?: Array<{ type: string; values: string[] }>
  reasoning_efforts?: string[]
  default_reasoning_effort?: string
  supports_reasoning?: boolean
  can_disable_thinking?: boolean
  owned_by?: string
}

export interface ModelDescription {
  key: ModelKey
  id: string
  label: string
  speed: ModelSpeed
  free: boolean
  notes: string
  isDefault: boolean
  online: boolean
  error?: string
  endpoint: string
  requiresKey: boolean
  description?: string
  contextLength?: number
  maxOutputTokens?: number
  modalities?: { input: string[]; output: string[] }
  features?: string[]
  samplingParameters?: string[]
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
  ownedBy?: string
  tokenizer: {
    available: boolean
    exact?: boolean
    estimated?: boolean
    method?: string
    maxResidual?: number
    maxRelError?: number
    measuredAt?: string
    inherited?: boolean
    error?: string
  }
}

async function fetchCard(key: ModelKey, timeoutMs: number): Promise<RawModelCard> {
  const { baseUrl, apiKey } = endpointConfig(key)
  const res = await fetch(`${baseUrl}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const json = (await res.json()) as { data?: RawModelCard[] }
  const want = MODELS[key].servedModelId.toLowerCase()
  const card = json.data?.find((m) => m.id?.toLowerCase() === want)
  if (!card) throw new Error(`server does not serve ${MODELS[key].servedModelId}`)
  return card
}

function reasoningEfforts(card: RawModelCard): string[] {
  if (card.reasoning_efforts?.length) return card.reasoning_efforts
  return (card.reasoning_options ?? []).flatMap((r) => r.values ?? [])
}

function features(card: RawModelCard): string[] {
  const listed = card.supported_features ?? []
  if (listed.length) return listed
  const derived: string[] = []
  if (card.supports_reasoning) derived.push('reasoning')
  if (card.can_disable_thinking) derived.push('thinking off')
  return derived
}

function tokenizerStatus(key: ModelKey): ModelDescription['tokenizer'] {
  try {
    const tk = getTokenizer(key)
    const cal = tk.calibration
    if (tk.estimated) {
      const scale = tk.scale
      return {
        available: true,
        exact: false,
        estimated: true,
        method: 'estimated',
        maxRelError: scale?.maxRelError,
        measuredAt: scale?.measuredAt,
        ...(scale ? {} : { error: 'Estimate not fitted yet — run `pnpm tokenizers:calibrate`' }),
      }
    }
    if (!cal) {
      return {
        available: true,
        exact: false,
        method: tk.hasTemplate ? 'chat-template (uncalibrated)' : 'uncalibrated',
        error: 'Not calibrated yet — run `pnpm tokenizers:calibrate`',
      }
    }
    return {
      available: true,
      exact: cal.maxResidual === 0 && !tk.calibrationInherited,
      method: cal.kind === 'template-offset' ? 'chat-template' : 'per-role',
      maxResidual: cal.maxResidual,
      measuredAt: cal.measuredAt,
      inherited: tk.calibrationInherited,
      ...(tk.calibrationInherited
        ? { error: 'Calibrated against a different endpoint — run `pnpm tokenizers:calibrate`' }
        : {}),
    }
  } catch (err) {
    return {
      available: false,
      error: `${(err as Error).message.split('\n')[0]} — run \`pnpm tokenizers:prepare\``,
    }
  }
}

function baseDescription(spec: ModelSpec, defaultModel: string): ModelDescription {
  return {
    key: spec.key,
    id: spec.servedModelId,
    label: spec.label,
    speed: spec.speed,
    free: spec.free,
    notes: spec.notes,
    isDefault: spec.key === defaultModel,
    online: false,
    endpoint: '',
    requiresKey: Boolean(spec.apiKeyEnv),
    contextLength: spec.contextLength,
    reasoningEfforts: spec.reasoningEfforts,
    defaultReasoningEffort: spec.defaultReasoningEffort,
    modalities: spec.modalities,
    tokenizer: tokenizerStatus(spec.key),
  }
}

export async function describeModel(
  key: ModelKey,
  { timeoutMs = 10_000, defaultModel = '' } = {}
): Promise<ModelDescription> {
  const spec = MODELS[key]
  const base = baseDescription(spec, defaultModel)

  try {
    base.endpoint = endpointConfig(key).baseUrl
  } catch (err) {
    return { ...base, error: (err as Error).message }
  }

  try {
    const card = await fetchCard(key, timeoutMs)
    return {
      ...base,
      online: true,
      label: spec.label,
      description: card.description,
      contextLength: card.context_length ?? card.context_window ?? spec.contextLength,
      maxOutputTokens: card.max_output_length ?? card.max_output_tokens,
      modalities: {
        input: card.input_modalities ?? card.modalities?.input ?? spec.modalities?.input ?? [],
        output: card.output_modalities ?? card.modalities?.output ?? spec.modalities?.output ?? [],
      },
      features: features(card),
      samplingParameters: card.supported_sampling_parameters ?? [],
      reasoningEfforts: reasoningEfforts(card).length ? reasoningEfforts(card) : spec.reasoningEfforts ?? [],
      defaultReasoningEffort: card.default_reasoning_effort ?? spec.defaultReasoningEffort,
      ownedBy: card.owned_by,
    }
  } catch (err) {
    return { ...base, error: `Endpoint unreachable: ${(err as Error).message}` }
  }
}




export const PUBLIC_MODEL_KEYS = MODEL_KEYS.filter((k) => !MODELS[k].internal)

export async function describeAllModels(opts?: {
  timeoutMs?: number
  defaultModel?: string
  keys?: ModelKey[]
}): Promise<ModelDescription[]> {
  return Promise.all((opts?.keys ?? MODEL_KEYS).map((k) => describeModel(k, opts)))
}

export function isModelKey(v: string): v is ModelKey {
  return (MODEL_KEYS as string[]).includes(v)
}

export function normaliseModel(v: string): ModelKey | null {
  return resolveModelKey(v)
}

export { MODEL_KEYS, MODELS }

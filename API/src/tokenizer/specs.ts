export type TokenizerKey =
  | 'kimi-k3'
  | 'deepseek-v4-pro'
  | 'diffusiongemma-26b'
  | 'o200k'
  | 'claude-fable'

export type SpecialsLayout =



  | { kind: 'reserved'; count: number; configFile: string; offset?: number }



  | { kind: 'exhaustive'; configFile: string }
  | { kind: 'inline' }




export interface HfTokenizerSpec {
  kind: 'hf'
  key: TokenizerKey
  hfRepo: string
  ranksPath: string
  baseVocab: number
  specials: SpecialsLayout
  chatTemplatePath?: string
  patStr: string








  vocabFormat?: 'hf-bpe'
}

export type BuiltinEncoding = 'o200k_base' | 'cl100k_base'






export interface BuiltinTokenizerSpec {
  kind: 'builtin'
  key: TokenizerKey
  encoding: BuiltinEncoding
  note: string
}












export interface EstimatedTokenizerSpec {
  kind: 'estimated'
  key: TokenizerKey
  base: TokenizerKey
  ratio: number
  perChar: number
  note: string
}

export type TokenizerSpec = HfTokenizerSpec | BuiltinTokenizerSpec | EstimatedTokenizerSpec

const KIMI_PAT = [
  String.raw`[\p{Han}]+`,
  String.raw`[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]*[\p{Ll}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]+(?i:'s|'t|'re|'ve|'m|'ll|'d)?`,
  String.raw`[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]+[\p{Ll}\p{Lm}\p{Lo}\p{M}&&[^\p{Han}]]*(?i:'s|'t|'re|'ve|'m|'ll|'d)?`,
  String.raw`\p{N}{1,3}`,
  String.raw` ?[^\s\p{L}\p{N}]+[\r\n]*`,
  String.raw`\s*[\r\n]+`,
  String.raw`\s+(?!\S)`,
  String.raw`\s+`,
].join('|')





const DEEPSEEK_PAT = [
  String.raw`\p{N}{1,3}`,
  String.raw`[一-龥぀-ゟ゠-ヿ]+`,
  String.raw`[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_\x60{|}~][A-Za-z]+`,
  String.raw`[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+`,
  String.raw` ?[\p{P}\p{S}]+[\r\n]*`,
  String.raw`\s*[\r\n]+`,
  String.raw`\s+(?!\S)`,
  String.raw`\s+`,
].join('|')

export const SPECS: Record<TokenizerKey, TokenizerSpec> = {
  'kimi-k3': {
    kind: 'hf',
    key: 'kimi-k3',
    hfRepo: 'moonshotai/Kimi-K3',
    ranksPath: 'tiktoken.model',
    baseVocab: 163584,
    specials: { kind: 'reserved', count: 256, configFile: 'tokenizer_config.json' },
    patStr: KIMI_PAT,
  },
  'deepseek-v4-pro': {
    kind: 'hf',
    key: 'deepseek-v4-pro',
    hfRepo: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    ranksPath: 'tokenizer.json',




    baseVocab: 127997,
    specials: { kind: 'exhaustive', configFile: 'tokenizer_config.json' },
    patStr: DEEPSEEK_PAT,
    vocabFormat: 'hf-bpe',
  },
  'diffusiongemma-26b': {
    kind: 'hf',
    key: 'diffusiongemma-26b',
    hfRepo: 'google/diffusiongemma-26B-A4B-it',
    ranksPath: 'tokenizer.json',








    baseVocab: 262_144,
    specials: { kind: 'exhaustive', configFile: 'tokenizer_config.json' },
    patStr: DEEPSEEK_PAT,
    vocabFormat: 'hf-bpe',
  },




  o200k: {
    kind: 'builtin',
    key: 'o200k',
    encoding: 'o200k_base',
    note:
      "OpenAI's o200k_base, shipped inside the tiktoken package — nothing to download. " +
      'Reproduces gpt-6-astra prompt_tokens exactly.',
  },







  'claude-fable': {
    kind: 'estimated',
    key: 'claude-fable',
    base: 'o200k',
    ratio: 1.1087,
    perChar: 0.1202,
    note:
      "Anthropic does not publish Fable's vocabulary, so counts are estimated from o200k_base " +
      'plus a character term, fitted against the endpoint\'s own prompt_tokens by ' +
      '`pnpm tokenizers:calibrate`. Expect roughly ±15% on prose, worse on long runs of ' +
      'repeated characters.',
  },
}

export const TOKENIZER_KEYS = Object.keys(SPECS) as TokenizerKey[]

export type ModelKey =
  | 'kimi-k3'
  | 'kimi-k3-fast'
  | 'fable-5.1'
  | 'gpt-6-astra'
  | 'qwen3-max'
  | 'deepseek-v4-pro'
  | 'diffusiongemma-26b'

export type ModelSpeed = 'variable' | 'fast'

export interface ModelSpec {
  key: ModelKey
  label: string
  servedModelId: string
  tokenizer: TokenizerKey
  contextLength: number
  speed: ModelSpeed
  free: boolean
  baseUrlEnv: string
  defaultBaseUrl?: string
  apiKeyEnv?: string
  notes: string
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string
  modalities?: { input: string[]; output: string[] }


  internal?: boolean
}





export const MODELS: Record<ModelKey, ModelSpec> = {
  'kimi-k3': {
    key: 'kimi-k3',
    label: 'Kimi K3 (free)',
    servedModelId: 'moonshotai/kimi-k3',
    tokenizer: 'kimi-k3',
    contextLength: 1_000_000,
    speed: 'variable',
    free: true,
    baseUrlEnv: 'KIMI_FREE_BASE_URL',
    defaultBaseUrl: 'https://unified-nvidia-api.vercel.app/v1',
    notes:
      'Unlimited and keyless, but throughput swings between fast and roughly 3-10 tokens per second. ' +
      'Use kimi-k3-fast when latency matters.',
  },
  'kimi-k3-fast': {
    key: 'kimi-k3-fast',
    label: 'Kimi K3 (fast)',
    servedModelId: 'moonshotai/Kimi-K3',
    tokenizer: 'kimi-k3',
    contextLength: 1_048_576,
    speed: 'fast',
    free: false,
    baseUrlEnv: 'KIMI_BASE_URL',
    apiKeyEnv: 'MODAL_API_KEY',
    notes: 'The same model on a self-hosted Modal endpoint. Fast and steady, but it costs credits.',
  },
  'fable-5.1': {
    key: 'fable-5.1',
    label: 'Fable 5.1',
    servedModelId: 'claude-fable-5.1',
    tokenizer: 'claude-fable',
    contextLength: 1_000_000,
    speed: 'fast',
    free: true,
    baseUrlEnv: 'EXPLABS_BASE_URL',
    defaultBaseUrl: 'https://api.experientiallabs.ai/v1',
    apiKeyEnv: 'EXPLABS_API_KEY',
    notes:
      "Anthropic's Fable 5.1 through Experiential Labs' OpenAI-compatible gateway. Fast and steady, " +
      'text and image in, tool calls supported, 1M token context. Free up to a daily token allowance ' +
      'on the shared key, after which the endpoint answers 429 until 00:00 UTC. Token counts are ' +
      'estimated, not exact — see the claude-fable tokenizer.',
    reasoningEfforts: ['none', 'low', 'high', 'max'],
    defaultReasoningEffort: 'high',
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'gpt-6-astra': {
    key: 'gpt-6-astra',
    label: 'GPT 6 Astra',
    servedModelId: 'gpt-6-astra',
    tokenizer: 'o200k',
    contextLength: 1_000_000,
    speed: 'fast',
    free: true,
    baseUrlEnv: 'EXPLABS_BASE_URL',
    defaultBaseUrl: 'https://api.experientiallabs.ai/v1',
    apiKeyEnv: 'EXPLABS_API_KEY',
    notes:
      "OpenAI's GPT-6 Astra on the same Experiential Labs gateway as fable-5.1. Fast, text and image " +
      'in, tool calls supported. Free up to a daily allowance of 1,000,000 input / 800,000 output ' +
      'tokens on the shared key, then 429 until 00:00 UTC. Counts are exact: it tokenizes with ' +
      'o200k_base.',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'qwen3-max': {
    key: 'qwen3-max',
    label: 'Qwen 3.8 Max (free)',
    servedModelId: 'qwen/qwen3.8-max:free',
    tokenizer: 'kimi-k3',
    contextLength: 1_000_000,
    speed: 'variable',
    free: true,
    baseUrlEnv: 'XKIRO_BASE_URL',
    defaultBaseUrl: 'https://api.xkiro.com/v1',
    apiKeyEnv: 'XKIRO_API_KEY',
    notes:
      'Qwen 3.8 Max via xKiro, free tier. 1M token context, 65K max output, text/image/video ' +
      'input. Selectable reasoning effort: low, medium, xhigh (default). Token counts use the ' +
      "Kimi tokenizer as an approximation — Qwen's own tokenizer isn't calibrated yet.",
    reasoningEfforts: ['low', 'medium', 'xhigh'],
    defaultReasoningEffort: 'xhigh',
    modalities: { input: ['text', 'image', 'video'], output: ['text'] },
  },
  'deepseek-v4-pro': {
    key: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    servedModelId: 'deepseek-ai/deepseek-v4-pro-0813',
    tokenizer: 'deepseek-v4-pro',
    contextLength: 1_000_000,
    speed: 'variable',
    free: true,
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    defaultBaseUrl: 'https://unified-nvidia-api.vercel.app/v1',
    notes:
      'DeepSeek V4 Pro, the largest V4 tier, on the same free keyless endpoint as kimi-k3. Text only — ' +
      'no image, video or audio input. Very slow cold starts, allow several minutes for a first response. ' +
      'Selectable reasoning effort from none up to max, high by default.',
  },
  'diffusiongemma-26b': {
    key: 'diffusiongemma-26b',
    label: 'DiffusionGemma 26B',
    servedModelId: 'google/diffusiongemma-26b-a4b-it',
    tokenizer: 'diffusiongemma-26b',
    contextLength: 262_144,
    speed: 'fast',
    free: true,
    baseUrlEnv: 'DIFFUSIONGEMMA_BASE_URL',
    defaultBaseUrl: 'https://unified-nvidia-api.vercel.app/v1',
    notes:
      "Google's diffusion-based Gemma 4 (25.2B total / 3.8B active params, MoE), on the same free " +
      'keyless endpoint as kimi-k3 and deepseek-v4-pro. Denoises whole token blocks in parallel ' +
      'instead of one token at a time, so throughput can exceed 1,000 tok/s. A microtask model only — ' +
      'not offered in the chat model picker, it just drafts the follow-up suggestion chips after a reply.',
    internal: true,
  },
}

export const MODEL_KEYS = Object.keys(MODELS) as ModelKey[]

export const MODEL_ALIASES: Record<string, ModelKey> = {
  fast: 'kimi-k3-fast',
  free: 'kimi-k3',
  kimi: 'kimi-k3',
  'kimi-k3-free': 'kimi-k3',
  deepseek: 'deepseek-v4-pro',
  'deepseek-v4': 'deepseek-v4-pro',
  diffusiongemma: 'diffusiongemma-26b',
  qwen: 'qwen3-max',
  'qwen3.8-max': 'qwen3-max',
  'qwen-max': 'qwen3-max',
  fable: 'fable-5.1',
  'fable-5-1': 'fable-5.1',
  'claude-fable': 'fable-5.1',
  'claude-fable-5.1': 'fable-5.1',
  gpt6: 'gpt-6-astra',
  'gpt-6': 'gpt-6-astra',
  astra: 'gpt-6-astra',
}

export function resolveModel(model: string): ModelSpec {
  if (model in MODELS) return MODELS[model as ModelKey]
  const alias = MODEL_ALIASES[model.toLowerCase()]
  if (alias) return MODELS[alias]
  const served = MODEL_KEYS.map((k) => MODELS[k]).find(
    (m) => m.servedModelId.toLowerCase() === model.toLowerCase()
  )
  if (served) return served
  throw new Error(`Unknown model ${JSON.stringify(model)}. Known: ${MODEL_KEYS.join(', ')}`)
}

export function resolveModelKey(model: string): ModelKey | null {
  try {
    return resolveModel(model).key
  } catch {
    return null
  }
}

export function resolveSpec(model: string): TokenizerSpec {
  if (model in SPECS) return SPECS[model as TokenizerKey]
  return SPECS[resolveModel(model).tokenizer]
}

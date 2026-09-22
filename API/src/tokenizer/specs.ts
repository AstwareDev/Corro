export type TokenizerKey =
  | 'kimi-k3'
  | 'diffusiongemma-26b'
  | 'o200k'
  | 'qwen3-max'

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
      'Tokenizes gpt-5.6-luna prompt text directly.',
  },







  'qwen3-max': {
    kind: 'estimated',
    key: 'qwen3-max',
    base: 'kimi-k3',
    ratio: 1.65,
    perChar: 0,
    note:
      "xKiro does not publish Qwen 3.8 Max's vocabulary, so counts are estimated from the Kimi K3 " +
      "ranks plus a character term, fitted against the endpoint's own prompt_tokens by " +
      '`pnpm tokenizers:calibrate qwen3-max`. The fit lands near a flat character rate and holds ' +
      'to about 3% on prose, code and markdown; CJK runs roughly 10% low. Raw Kimi counts on their ' +
      'own are about 40% low, which is why this estimate exists.',
  },
}

export const TOKENIZER_KEYS = Object.keys(SPECS) as TokenizerKey[]

export type ModelKey =
  | 'kimi-k3'
  | 'kimi-k3-fast'
  | 'gpt-5.6-luna'
  | 'qwen3-max'
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
    reasoningEfforts: ['none', 'low', 'high', 'max'],
    defaultReasoningEffort: 'max',
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
    reasoningEfforts: ['none', 'low', 'high', 'max'],
    defaultReasoningEffort: 'max',
  },
  'gpt-5.6-luna': {
    key: 'gpt-5.6-luna',
    label: 'GPT 5.6 Luna',
    servedModelId: 'gpt-5.6-luna',
    tokenizer: 'o200k',
    contextLength: 1_000_000,
    speed: 'fast',
    free: true,
    baseUrlEnv: 'EXPLABS_BASE_URL',
    defaultBaseUrl: 'https://api.experientiallabs.ai/v1',
    apiKeyEnv: 'EXPLABS_API_KEY',
    notes:
      "OpenAI's GPT-5.6 Luna through Experiential Labs' OpenAI-compatible gateway. Fast, text and image " +
      'in, tool calls supported, 1M token context. Free on the shared key; token counts come straight ' +
      'from o200k_base.',
    reasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultReasoningEffort: 'medium',
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'qwen3-max': {
    key: 'qwen3-max',
    label: 'Qwen 3.8 Max (free)',
    servedModelId: 'qwen/qwen3.8-max:free',
    tokenizer: 'qwen3-max',
    contextLength: 1_000_000,
    speed: 'variable',
    free: true,
    baseUrlEnv: 'XKIRO_BASE_URL',
    defaultBaseUrl: 'https://api.xkiro.com/v1',
    apiKeyEnv: 'XKIRO_API_KEY',
    notes:
      'Qwen 3.8 Max via xKiro, free tier. 1M token context, 65K max output, text/image/video ' +
      'input. Selectable reasoning effort: low, medium, xhigh (default). Token counts are estimated ' +
      'from the Kimi ranks and fitted against the endpoint — see the qwen3-max tokenizer.',
    reasoningEfforts: ['low', 'medium', 'xhigh'],
    defaultReasoningEffort: 'xhigh',
    modalities: { input: ['text', 'image', 'video'], output: ['text'] },
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
      'keyless endpoint as kimi-k3. Denoises whole token blocks in parallel ' +
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
  diffusiongemma: 'diffusiongemma-26b',
  qwen: 'qwen3-max',
  'qwen3.8-max': 'qwen3-max',
  'qwen-max': 'qwen3-max',
  luna: 'gpt-5.6-luna',
  'gpt-5.6': 'gpt-5.6-luna',
  'gpt-luna': 'gpt-5.6-luna',
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

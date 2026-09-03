export type TokenizerKey = 'kimi-k3' | 'deepseek-v4-pro' | 'diffusiongemma-26b'

export type SpecialsLayout =
  
  
  
  | { kind: 'reserved'; count: number; configFile: string; offset?: number }
  
  
  
  | { kind: 'exhaustive'; configFile: string }
  | { kind: 'inline' }

export interface TokenizerSpec {
  key: TokenizerKey
  hfRepo: string
  ranksPath: string
  baseVocab: number
  specials: SpecialsLayout
  chatTemplatePath?: string
  patStr: string
  







  vocabFormat?: 'hf-bpe'
}

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
    key: 'kimi-k3',
    hfRepo: 'moonshotai/Kimi-K3',
    ranksPath: 'tiktoken.model',
    baseVocab: 163584,
    specials: { kind: 'reserved', count: 256, configFile: 'tokenizer_config.json' },
    patStr: KIMI_PAT,
  },
  'deepseek-v4-pro': {
    key: 'deepseek-v4-pro',
    hfRepo: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    ranksPath: 'tokenizer.json',
    
    
    
    
    baseVocab: 127997,
    specials: { kind: 'exhaustive', configFile: 'tokenizer_config.json' },
    patStr: DEEPSEEK_PAT,
    vocabFormat: 'hf-bpe',
  },
  'diffusiongemma-26b': {
    key: 'diffusiongemma-26b',
    hfRepo: 'google/diffusiongemma-26B-A4B-it',
    ranksPath: 'tokenizer.json',
    
    
    
    
    
    
    
    
    baseVocab: 262_144,
    specials: { kind: 'exhaustive', configFile: 'tokenizer_config.json' },
    patStr: DEEPSEEK_PAT,
    vocabFormat: 'hf-bpe',
  },
}

export const TOKENIZER_KEYS = Object.keys(SPECS) as TokenizerKey[]

export type ModelKey = 'kimi-k3' | 'kimi-k3-fast' | 'deepseek-v4-pro' | 'diffusiongemma-26b'

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

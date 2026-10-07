import { MODELS, type ModelKey } from './tokenizer/specs.js'

export const PORT = Number(process.env.PORT ?? 8787)

function pick(env: string | undefined, fallback: ModelKey): ModelKey {
  return env && env in MODELS ? (env as ModelKey) : fallback
}

export const DEFAULT_MODEL = pick(process.env.CORRO_DEFAULT_MODEL, 'kimi-k3')

export const FAST_MODEL = pick(process.env.CORRO_FAST_MODEL, 'kimi-k3-fast')

export const BODY_LIMIT = process.env.CORRO_BODY_LIMIT ?? '4mb'

export const UPLOAD_LIMIT_MB = Number(process.env.CORRO_UPLOAD_LIMIT_MB ?? 25)

function retryEnv(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export const NIM_MAX_RETRIES = Math.trunc(retryEnv('CORRO_NIM_MAX_RETRIES', 8))
export const NIM_RETRY_BASE_MS = retryEnv('CORRO_NIM_RETRY_BASE_MS', 1000)
export const NIM_RETRY_MAX_MS = retryEnv('CORRO_NIM_RETRY_MAX_MS', 30000)
export const NIM_STALL_TIMEOUT_MS = retryEnv('CORRO_NIM_STALL_TIMEOUT_MS', 60000)

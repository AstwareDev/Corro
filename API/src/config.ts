import { MODELS, type ModelKey } from './tokenizer/specs.js'

export const PORT = Number(process.env.PORT ?? 8787)

function pick(env: string | undefined, fallback: ModelKey): ModelKey {
  return env && env in MODELS ? (env as ModelKey) : fallback
}

export const DEFAULT_MODEL = pick(process.env.CORRO_DEFAULT_MODEL, 'kimi-k3')

export const FAST_MODEL = pick(process.env.CORRO_FAST_MODEL, 'kimi-k3-fast')

export const BODY_LIMIT = process.env.CORRO_BODY_LIMIT ?? '4mb'

export const PUBLIC_URL = (process.env.CORRO_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')

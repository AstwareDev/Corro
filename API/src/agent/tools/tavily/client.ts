import 'dotenv/config'

const BASE_URL = (process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com').replace(/\/+$/, '')
const COOLDOWN_MS = 60_000
const KEY_PATTERN = /^TAVILY_(?:\d+_)?(?:API_)?KEY$/

export class TavilyError extends Error {
  readonly status?: number
  readonly rotate: boolean

  constructor(message: string, opts: { status?: number; rotate?: boolean } = {}) {
    super(message)
    this.name = 'TavilyError'
    this.status = opts.status
    this.rotate = opts.rotate ?? false
  }
}

const cooldown = new Map<string, number>()
let cursor = 0

export function tavilyKeys(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => KEY_PATTERN.test(name) && (value ?? '').trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([, value]) => (value as string).trim())
}

export function hasTavilyKey(): boolean {
  return tavilyKeys().length > 0
}

function drop(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
}

async function callOnce<T>(path: string, body: unknown, key: string, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : (err as Error).message
    throw new TavilyError(`Tavily request ${reason}`, { rotate: false })
  }

  if (res.ok) return (await res.json()) as T

  const raw = await res.text().catch(() => '')
  let detail = raw.slice(0, 200)
  try {
    const parsed = JSON.parse(raw) as { detail?: { error?: string } | string; error?: string }
    const inner = typeof parsed.detail === 'string' ? parsed.detail : parsed.detail?.error
    detail = inner ?? parsed.error ?? detail
  } catch {}

  throw new TavilyError(`Tavily ${res.status}: ${detail || res.statusText}`, {
    status: res.status,
    rotate: res.status === 401 || res.status === 403 || res.status === 429 || res.status === 432 || res.status === 433,
  })
}

export async function tavily<T>(
  path: string,
  body: Record<string, unknown>,
  { timeoutMs = 30_000 }: { timeoutMs?: number } = {}
): Promise<T> {
  const keys = tavilyKeys()
  if (!keys.length) {
    throw new TavilyError('No Tavily API key configured — set TAVILY_1_KEY in .env (see .env.example)')
  }

  const start = cursor++ % keys.length
  const ordered = [...keys.slice(start), ...keys.slice(0, start)]
  const now = Date.now()
  const ready = ordered.filter((k) => (cooldown.get(k) ?? 0) <= now)
  const attempts = ready.length ? ready : ordered
  const payload = drop(body)

  let last: unknown
  for (const key of attempts) {
    try {
      const out = await callOnce<T>(path, payload, key, timeoutMs)
      cooldown.delete(key)
      return out
    } catch (err) {
      last = err
      if (err instanceof TavilyError && err.rotate) {
        cooldown.set(key, Date.now() + COOLDOWN_MS)
        continue
      }
      throw err
    }
  }

  throw last instanceof Error ? last : new TavilyError('Tavily request failed')
}

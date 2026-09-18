import { randomUUID } from 'node:crypto'
import { Innertube } from 'youtubei.js'

export const SITE = 'https://www.youtube.com'
export const SHOP = 'YouTube'

export class YouTubeError extends Error {
  readonly status?: number
  constructor(message: string, opts: { status?: number } = {}) {
    super(message)
    this.name = 'YouTubeError'
    this.status = opts.status
  }
}

export function failure(err: unknown) {
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : 'YouTube request failed',
  }
}

// --- session (one Innertube per process, like the browser per workspace) ---

let tubePromise: Promise<Innertube> | undefined

export function getTube(): Promise<Innertube> {
  tubePromise ??= Innertube.create({}).catch((err) => {
    tubePromise = undefined
    throw new YouTubeError(
      `Could not reach YouTube's internal API — ${err instanceof Error ? err.message : 'session creation failed'}`
    )
  })
  return tubePromise
}

// --- polite rate limiting: at least MIN_INTERVAL_MS between calls ---

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

export const MIN_INTERVAL_MS = envMs('YOUTUBE_MIN_INTERVAL_MS', 1200)

let lastAt = 0
let queue: Promise<void> = Promise.resolve()

export function polite(): Promise<void> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastAt = Date.now()
  })
  queue = run.catch(() => undefined)
  return run
}

// --- in-memory cache (no disk, per user choice; TTLs configurable) ---

interface CacheEntry {
  at: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()

function ttl(name: string, fallback: number): number {
  return envMs(name, fallback)
}

export const TTLS = {
  get channel() { return ttl('YOUTUBE_CHANNEL_TTL_MS', 24 * 60 * 60 * 1000) },
  get videos() { return ttl('YOUTUBE_VIDEOS_TTL_MS', 60 * 60 * 1000) },
  get video() { return ttl('YOUTUBE_VIDEO_TTL_MS', 60 * 60 * 1000) },
  get comments() { return ttl('YOUTUBE_COMMENTS_TTL_MS', 5 * 60 * 1000) },
  get transcript() { return ttl('YOUTUBE_TRANSCRIPT_TTL_MS', 24 * 60 * 60 * 1000) },
}

export function cacheGet<T>(key: string, ttlMs: number): T | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key)
    return undefined
  }
  return hit.value as T
}

export function cacheSet(key: string, value: unknown): void {
  if (cache.size > 500) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), value })
}

// --- continuation store: legacy fallback for pre-stateless tokens ---
// (Stateless yt1_* tokens below need no server state; this map only serves
// tokens issued before the stateless switch, and dies with the process.)

const CONT_TTL_MS = 10 * 60 * 1000
const MAX_CONT = 50

interface ContEntry {
  at: number
  state: unknown
}

const contStore = new Map<string, ContEntry>()

export function contPut(key: string, state: unknown): string {
  if (contStore.size >= MAX_CONT) {
    const oldest = contStore.keys().next().value
    if (oldest) contStore.delete(oldest)
  }
  const token = randomUUID().replace(/-/g, '').slice(0, 16)
  const full = `${key}:${token}`
  contStore.set(full, { at: Date.now(), state })
  return token
}

export function contTake<T>(key: string): T | undefined {
  const hit = contStore.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > CONT_TTL_MS) {
    contStore.delete(key)
    return undefined
  }
  return hit.state as T
}

// --- stateless continuation tokens ---
// youtubei.js continuations are live objects bound to one process, so the old
// design kept them in the map above — and every server restart (including each
// `tsx watch` reload in dev) silently killed every outstanding load-more
// token. Instead, yt1_* tokens embed YouTube's own raw continuation token:
// resuming needs no server state, survives restarts, and never gets evicted.
// Format: yt1_<base64url(JSON { k: kind, a: api path, t: raw token, x: extra })>

export interface StatelessCont {
  kind: 'comments' | 'videos'
  api: string
  token: string
  extra?: Record<string, unknown>
}

export function encodeCont(c: StatelessCont): string {
  return `yt1_${Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')}`
}

export function decodeCont(opaque: string): StatelessCont | undefined {
  if (!opaque.startsWith('yt1_')) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(opaque.slice(4), 'base64url').toString('utf8')) as StatelessCont
    if (!parsed || (parsed.kind !== 'comments' && parsed.kind !== 'videos')) return undefined
    if (typeof parsed.api !== 'string' || typeof parsed.token !== 'string') return undefined
    if (!parsed.api || !parsed.token) return undefined
    return parsed
  } catch {
    return undefined
  }
}

interface RawContNode {
  endpoint?: {
    command?: {
      getApiPath?: () => string
      buildRequest?: () => Record<string, unknown>
      commands?: Array<{ getApiPath: () => string; buildRequest: () => Record<string, unknown> }>
    }
    payload?: Record<string, unknown>
    metadata?: { api_url?: string }
  }
}

/** Pull YouTube's raw { api, token } out of a ContinuationItem node. */
export function extractRawCont(item: unknown): { api: string; token: string } | undefined {
  try {
    const endpoint = (item as RawContNode)?.endpoint
    if (!endpoint) return undefined
    let command = endpoint.command
    const wrapped = command?.commands
    if (Array.isArray(wrapped) && wrapped.length) command = wrapped[wrapped.length - 1]
    if (command && typeof command.getApiPath === 'function' && typeof command.buildRequest === 'function') {
      const req = command.buildRequest()
      const token = req.continuation
      if (typeof token === 'string' && token) {
        return { api: command.getApiPath().replace(/^\/+/, ''), token }
      }
    }
    // Fallback: raw payload + metadata (covers node shapes without a command).
    const payload = endpoint.payload ?? {}
    const raw = payload.continuationCommand as { token?: unknown; request?: unknown } | undefined
    const token = payload.token ?? raw?.token
    const api = endpoint.metadata?.api_url?.replace(/^\/+/, '')
    if (typeof token === 'string' && token && api) return { api, token }
    return undefined
  } catch {
    return undefined
  }
}

/** Resume a stateless continuation against a fresh Innertube session. */
export async function fetchCont(tube: Innertube, cont: StatelessCont): Promise<unknown> {
  try {
    return await tube.actions.execute(`/${cont.api}`, { continuation: cont.token, parse: true })
  } catch (err) {
    throw new YouTubeError(
      `YouTube would not load more — ${err instanceof Error ? err.message : 'unknown reason'}. Rerun without a continuation for the first page.`
    )
  }
}

// --- id resolution ---

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function extractVideoIdFromUrl(url: string): string | undefined {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = re.exec(url)
    if (m) return m[1]
  }
  return undefined
}

export async function resolveVideoId(input: string): Promise<string> {
  const raw = input.trim()
  if (!raw) throw new YouTubeError('Give a YouTube video id or watch URL.')
  if (VIDEO_ID.test(raw)) return raw
  const fromUrl = extractVideoIdFromUrl(raw)
  if (fromUrl) return fromUrl
  if (/^https?:\/\//i.test(raw)) {
    try {
      const tube = await getTube()
      const resolved = await tube.resolveURL(raw)
      const payload = (resolved as { payload?: { videoId?: string } }).payload
      if (payload?.videoId && VIDEO_ID.test(payload.videoId)) return payload.videoId
    } catch {
      // fall through to the clear error below
    }
  }
  throw new YouTubeError(
    `Could not read a video id from ${JSON.stringify(raw.length > 80 ? `${raw.slice(0, 80)}…` : raw)} — pass an 11-character id or a watch / youtu.be / shorts URL.`
  )
}

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/

export async function resolveChannelId(input: string): Promise<string> {
  const raw = input.trim()
  if (!raw) throw new YouTubeError('Give a channel id, @handle, or channel URL.')
  if (CHANNEL_ID.test(raw)) return raw
  const channelUrl = raw.match(/youtube\.com\/(?:channel\/|c\/|user\/|@)([^/?#\s]+)/i)
  const idInUrl = raw.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)
  if (idInUrl) return idInUrl[1]
  void channelUrl
  if (/^https?:\/\//i.test(raw) || raw.startsWith('@')) {
    try {
      const tube = await getTube()
      const resolved = await tube.resolveURL(raw.startsWith('@') ? `${SITE}/${raw}` : raw)
      const payload = (resolved as { payload?: { browseId?: string } }).payload
      if (payload?.browseId && CHANNEL_ID.test(payload.browseId)) return payload.browseId
    } catch (err) {
      throw new YouTubeError(
        `YouTube would not resolve ${JSON.stringify(raw.length > 80 ? `${raw.slice(0, 80)}…` : raw)} — ${err instanceof Error ? err.message : 'unknown reason'}`
      )
    }
    throw new YouTubeError(
      `YouTube would not resolve ${JSON.stringify(raw)} to a channel — pass a UC… id, @handle, or full channel URL.`
    )
  }
  // bare handle without @, or custom name: try as @handle
  try {
    const tube = await getTube()
    const resolved = await tube.resolveURL(`${SITE}/@${raw.replace(/^@/, '')}`)
    const payload = (resolved as { payload?: { browseId?: string } }).payload
    if (payload?.browseId && CHANNEL_ID.test(payload.browseId)) return payload.browseId
  } catch {
    // fall through
  }
  throw new YouTubeError(
    `Could not resolve ${JSON.stringify(raw)} to a channel — pass a UC… id, @handle, or full channel URL.`
  )
}

// --- small parsing helpers (all defensive: YouTube renames nodes often) ---

export function textOf(node: unknown): string | undefined {
  if (!node) return undefined
  if (typeof node === 'string') {
    const t = node.trim()
    return t || undefined
  }
  const obj = node as { text?: unknown }
  if (typeof obj.text === 'string') {
    const t = obj.text.trim()
    return t || undefined
  }
  return undefined
}

export function parseApproxCount(text: string | undefined): number | undefined {
  if (!text) return undefined
  const m = /([\d,.]+)\s*([KMB])?/i.exec(text.replace(/,/g, ''))
  if (!m) return undefined
  const base = Number(m[1])
  if (!Number.isFinite(base)) return undefined
  const mult = m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1
  return Math.round(base * mult)
}

export function parseExactCount(text: string | undefined): number | undefined {
  if (!text) return undefined
  const digits = text.replace(/[^\d]/g, '')
  if (!digits) return undefined
  const n = Number(digits)
  return Number.isFinite(n) ? n : undefined
}

export function parseDurationText(text: string | undefined): number | undefined {
  if (!text) return undefined
  const parts = text.trim().split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return undefined
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function bestThumb(thumbs: Array<{ url?: string; width?: number }> | undefined): string | undefined {
  if (!thumbs?.length) return undefined
  const sorted = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted[0]?.url
}

export function videoUrl(id: string): string {
  return `${SITE}/watch?v=${id}`
}

export function channelUrl(id: string, handle?: string): string {
  if (handle?.startsWith('@')) return `${SITE}/${handle}`
  return `${SITE}/channel/${id}`
}

export function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

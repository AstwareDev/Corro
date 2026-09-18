/**
 * Instagram scraping core — public, no-login only.
 *
 * Technique (per spec, never parse visible DOM text):
 *  1. fetch() the raw HTML of the profile / post URL with browser-like headers,
 *  2. extract embedded JSON from <script type="application/ld+json"> plus IG's
 *     internal state blobs (window._sharedData / window.__additionalDataLoaded /
 *     __initialData / GraphQL payloads — IG renames these often, so every
 *     extractor below is best-effort and failures surface as explicit
 *     "layout changed" errors, never silent empty results),
 *  3. paginate via end_cursor / GraphQL rather than simulated scroll,
 *  4. retry-with-backoff on 429/5xx; fail fast with a clear message on
 *     login walls (stories, private profiles, aggressive rate limits).
 *
 * Stories are intentionally unsupported: Instagram requires an authenticated
 * session for story content. See STORIES_UNSUPPORTED.
 */

export const SITE = 'https://www.instagram.com'
export const SHOP = 'Instagram'

export class InstagramError extends Error {
  readonly status?: number
  constructor(message: string, opts: { status?: number } = {}) {
    super(message)
    this.name = 'InstagramError'
    this.status = opts.status
  }
}

export function failure(err: unknown) {
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : 'Instagram request failed',
  }
}

// ---------------------------------------------------------------------------
// Stories limitation — flagged up front, per spec.
// ---------------------------------------------------------------------------

export const STORIES_UNSUPPORTED =
  'Stories are not available without login: Instagram serves story content only to authenticated ' +
  'sessions, and stories expire after 24h. This public no-login scraper cannot access them. ' +
  'Stories support would need the separate "logged-in session" approach (cookies/session ' +
  'management, higher ban risk) — out of scope for this service.'

export function storiesUnsupported() {
  return { ok: false as const, error: STORIES_UNSUPPORTED, supported: false as const }
}

// ---------------------------------------------------------------------------
// Polite rate limiting — IG rate-limits scraper IPs aggressively, so the
// default gap is wider than the YouTube tools' 1200ms.
// ---------------------------------------------------------------------------

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

export const MIN_INTERVAL_MS = envMs('INSTAGRAM_MIN_INTERVAL_MS', 2000)

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

// ---------------------------------------------------------------------------
// Retry with backoff — for 429 / 5xx / network blips. Never retries 404 or
// login walls; those are definitive answers, not transient failures.
// ---------------------------------------------------------------------------

export const RETRIES = Math.max(0, Math.trunc(envMs('INSTAGRAM_RETRIES', 3)))
const RETRY_BASE_MS = envMs('INSTAGRAM_RETRY_BASE_MS', 800)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function retryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

export async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const status = err instanceof InstagramError ? err.status : undefined
      const retryable =
        status === undefined ? true : retryableStatus(status)
      if (attempt >= RETRIES || !retryable) throw err
      const backoff = RETRY_BASE_MS * 2 ** attempt + Math.floor(Math.random() * 250)
      await sleep(backoff)
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new InstagramError(`Instagram would not ${label} — unknown reason`)
}

// ---------------------------------------------------------------------------
// In-memory cache (no disk; TTLs configurable, mirrors youtube/client.ts).
// ---------------------------------------------------------------------------

interface CacheEntry {
  at: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()

function ttl(name: string, fallback: number): number {
  return envMs(name, fallback)
}

export const TTLS = {
  get profile() { return ttl('INSTAGRAM_PROFILE_TTL_MS', 60 * 60 * 1000) },
  get posts() { return ttl('INSTAGRAM_POSTS_TTL_MS', 30 * 60 * 1000) },
  get post() { return ttl('INSTAGRAM_POST_TTL_MS', 30 * 60 * 1000) },
  get comments() { return ttl('INSTAGRAM_COMMENTS_TTL_MS', 5 * 60 * 1000) },
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

// ---------------------------------------------------------------------------
// Stateless continuation tokens — IG end_cursors are opaque strings, so the
// token just carries { kind, cursor, extra }. Survives restarts (unlike a
// server-side map). Format: ig1_<base64url(JSON { k, c, x })>
// ---------------------------------------------------------------------------

export interface StatelessCont {
  kind: 'posts' | 'comments'
  cursor: string
  extra?: Record<string, unknown>
}

export function encodeCont(c: StatelessCont): string {
  return `ig1_${Buffer.from(JSON.stringify({ k: c.kind, c: c.cursor, x: c.extra ?? {} }), 'utf8').toString('base64url')}`
}

export function decodeCont(opaque: string): StatelessCont | undefined {
  if (!opaque.startsWith('ig1_')) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(opaque.slice(4), 'base64url').toString('utf8')) as {
      k?: unknown
      c?: unknown
      x?: unknown
    }
    if (parsed.k !== 'posts' && parsed.k !== 'comments') return undefined
    if (typeof parsed.c !== 'string' || !parsed.c) return undefined
    const extra = parsed.x && typeof parsed.x === 'object' ? (parsed.x as Record<string, unknown>) : undefined
    return { kind: parsed.k, cursor: parsed.c, ...(extra ? { extra } : {}) }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// URL / id helpers
// ---------------------------------------------------------------------------

export function profileUrl(username: string): string {
  return `${SITE}/${username}/`
}

export function postUrl(shortcode: string): string {
  return `${SITE}/p/${shortcode}/`
}

export function reelUrl(shortcode: string): string {
  return `${SITE}/reel/${shortcode}/`
}

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/

export function normalizeUsername(input: string): string {
  const raw = input.trim()
  if (!raw) throw new InstagramError('Give an Instagram username or profile URL.')
  const urlMatch = raw.match(/(?:instagram\.com\/)([A-Za-z0-9._]{1,30})/i)
  if (urlMatch) return urlMatch[1].replace(/\/+$/, '')
  if (/\s/.test(raw)) {
    throw new InstagramError(
      `Could not read a username from ${JSON.stringify(raw.length > 80 ? `${raw.slice(0, 80)}…` : raw)} — pass a username like "natgeo" or a profile URL.`
    )
  }
  const bare = raw.replace(/^@/, '').replace(/\/+$/, '').split(/[?#/]/)[0]
  if (!USERNAME_RE.test(bare)) {
    throw new InstagramError(
      `Could not read a username from ${JSON.stringify(raw.length > 80 ? `${raw.slice(0, 80)}…` : raw)} — pass a username like "natgeo" or a profile URL.`
    )
  }
  return bare
}

const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,30}$/

export function extractShortcode(input: string): string {
  const raw = input.trim()
  if (!raw) throw new InstagramError('Give an Instagram post shortcode or post/reel URL.')
  if (SHORTCODE_RE.test(raw)) return raw
  const m = raw.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,30})/i)
  if (m) return m[1]
  throw new InstagramError(
    `Could not read a shortcode from ${JSON.stringify(raw.length > 80 ? `${raw.slice(0, 80)}…` : raw)} — pass a shortcode or a /p/ /reel/ URL.`
  )
}

// ---------------------------------------------------------------------------
// Small parsing helpers (all defensive: IG renames/obfuscates often)
// ---------------------------------------------------------------------------

export function parseCountText(text: string | undefined): number | undefined {
  if (!text) return undefined
  const cleaned = text.replace(/,/g, '').trim()
  const m = /^([\d.]+)\s*([KMB])?/i.exec(cleaned)
  if (!m) return undefined
  const base = Number(m[1])
  if (!Number.isFinite(base)) return undefined
  const mult =
    m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1
  return Math.round(base * mult)
}

export function parseExactCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '')
    if (!digits) return undefined
    const n = Number(digits)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Raw HTML fetch
// ---------------------------------------------------------------------------

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function htmlHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': process.env.INSTAGRAM_UA ?? BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...extra,
  }
}

const LOGIN_WALL_MARKERS = [
    '/accounts/login/',
    '"require_login":true',
    '<title>Login • Instagram</title>',
    'Login • Instagram',
  ]

/**
 * True when the page carries Instagram's login prompt. That prompt is usually
 * a *dismissible overlay* — the public embedded JSON is often still in the
 * page — so callers must NOT treat this as fatal on its own. Only fail with
 * loginWallError() when the wanted data is actually absent; otherwise succeed
 * and attach LOGIN_WALL_DISMISSIBLE_NOTE.
 */
export function looksLikeLoginWall(html: string): boolean {
  return LOGIN_WALL_MARKERS.some((m) => html.includes(m))
}

export const LOGIN_WALL_DISMISSIBLE_NOTE =
  'Note: Instagram overlaid a dismissible login prompt on this page; the public data below was read without logging in.'

export function loginWallError(): InstagramError {
  return new InstagramError(
    'Instagram showed a login gate and the public data was not readable (rate limit or IP flag). ' +
      'The prompt is sometimes just a dismissible overlay — wait a minute and retry. ' +
      'Stories and private profiles always need login.',
    { status: 403 }
  )
}

/** Login-gate error when the page shows the prompt, layout-changed error otherwise. */
export function wallOrLayoutError(html: string, selector: string): InstagramError {
  if (looksLikeLoginWall(html)) return loginWallError()
  return new InstagramError(
    `Instagram layout changed, selector ${selector} not found — IG renamed its embedded-data blobs again. ` +
      'Inspect the raw page source for the new window.__additionalDataLoaded / _sharedData shape and update the extractors.'
  )
}

/**
 * Error for media pages with no usable data. Distinguishes three states:
 * login prompt (retryable gate), metadata present but blob moved (layout
 * changed — real maintenance signal), and the empty shell Instagram serves
 * for missing/private posts on untrusted networks (not a selector bug).
 */
export function shellError(html: string, selector: string, what: string): InstagramError {
  if (looksLikeLoginWall(html)) return loginWallError()
  const meta = extractMetaTags(html)
  if (meta.title || meta.description) {
    return new InstagramError(
      `Instagram layout changed, selector ${selector} not found — the page carries metadata but the data blob moved. ` +
        'Inspect the raw page source for the new window.__additionalDataLoaded / _sharedData shape and update the extractors.'
    )
  }
  return new InstagramError(
    `${what} is unavailable — the post may be private, deleted, or the shortcode/URL may be wrong. ` +
      'From networks Instagram distrusts it also serves an empty page instead of public posts; wait and retry, or confirm the URL in a browser.'
  )
}

export async function fetchHtml(url: string): Promise<string> {
  return withRetry(`fetch ${url}`, async () => {
    await polite()
    let res: Response
    try {
      res = await fetch(url, { headers: htmlHeaders(), redirect: 'follow' })
    } catch (err) {
      throw new InstagramError(
        `Could not reach Instagram — ${err instanceof Error ? err.message : 'network failure'}. Check connectivity and retry.`
      )
    }
    if (res.status === 404) {
      throw new InstagramError(`Instagram has nothing at ${url} — the profile/post may not exist or the URL is wrong.`, { status: 404 })
    }
    if (res.status === 401 || res.status === 403) {
      throw new InstagramError(
        'Instagram refused the request (login wall / rate limit). This happens when IG flags the IP — wait a few minutes and retry; do not hammer the endpoint.',
        { status: res.status }
      )
    }
    if (retryableStatus(res.status)) {
      throw new InstagramError(`Instagram answered HTTP ${res.status} — transient failure, will retry with backoff.`, { status: res.status })
    }
    if (!res.ok) {
      throw new InstagramError(`Instagram answered HTTP ${res.status} for ${url}.`, { status: res.status })
    }
    const html = await res.text()
    // A full redirect to /accounts/login/ is a hard gate (login page, no
    // data). In-page login markers alone are NOT fatal — the prompt is
    // usually a closable overlay with the public JSON still behind it, so
    // the callers extract first and only fail when data is actually absent.
    if (res.url.includes('/accounts/login/')) {
      throw loginWallError()
    }
    if (html.length < 2000) {
      throw new InstagramError(
        'Instagram layout changed: the page returned almost no HTML where embedded JSON was expected. The markup selectors need updating.'
      )
    }
    return html
  })
}

// ---------------------------------------------------------------------------
// Embedded-JSON extraction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Open Graph meta tags — server-rendered in the initial HTML even for
// logged-out / flagged-IP requests that carry no embedded JSON. Degraded but
// exact for: display name, username, follower/following/post counts, avatar.
// No bio, no post grid, no verified flag — callers must say so in `note`.
// ---------------------------------------------------------------------------

/** Decode HTML entities (hex/decimal numeric + common named) in meta content. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16))
      } catch {
        return _
      }
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(dec, 10))
      } catch {
        return _
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export interface OgMeta {
  title?: string
  description?: string
  image?: string
  url?: string
}

export function extractMetaTags(html: string): OgMeta {
  const out: OgMeta = {}
  // property="og:..." content="..." in either attribute order.
  const re = /<meta\s[^>]*?(?:property="(og:[a-zA-Z:]+)"[^>]*?content="([^"]*)"|content="([^"]*)"[^>]*?property="(og:[a-zA-Z:]+)")/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const prop = (m[1] ?? m[4] ?? '').toLowerCase()
    const value = decodeEntities(m[2] ?? m[3] ?? '')
    if (!value) continue
    if (prop === 'og:title') out.title ??= value
    else if (prop === 'og:description') out.description ??= value
    else if (prop === 'og:image') out.image ??= value
    else if (prop === 'og:url') out.url ??= value
  }
  // <meta name="description" ...> fallback (some pages only carry this).
  if (!out.description) {
    const alt =
      /<meta\s[^>]*?name="description"[^>]*?content="([^"]*)"|<meta\s[^>]*?content="([^"]*)"[^>]*?name="description"/i.exec(html)
    const value = alt?.[1] ?? alt?.[2]
    if (value) out.description = decodeEntities(value)
  }
  return out
}

export function extractLdJsonBlocks(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim()
    if (!body) continue
    try {
      const parsed: unknown = JSON.parse(body)
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      continue
    }
  }
  return out
}

/** Extract the balanced {...} JSON object starting at/after `from` in `src`. */
function balancedJson(src: string, from: number): string | undefined {
  const start = src.indexOf('{', from)
  if (start === -1) return undefined
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return undefined
}

const BLOB_MARKERS = [
  'window._sharedData',
  'window.__additionalDataLoaded',
  '__additionalDataLoaded',
  'window.__initialData',
  '"ProfilePage"',
  '"graphql":{"user"',
  '"shortcode_media"',
  'xdt_api__v1__',
]

export function extractStateBlobs(html: string): unknown[] {
  const out: unknown[] = []
  for (const marker of BLOB_MARKERS) {
    let idx = html.indexOf(marker)
    let guard = 0
    while (idx !== -1 && guard < 5) {
      guard++
      const blob = balancedJson(html, idx)
      if (blob) {
        try {
          out.push(JSON.parse(blob))
        } catch {
          // IG sometimes embeds JS (not strict JSON: undefined, functions).
          // Try a lenient pass: quote unquoted keys is too fragile — skip.
        }
      }
      idx = html.indexOf(marker, idx + marker.length)
    }
  }
  // <script type="application/json" data-sjs> payloads (modern IG web).
  const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(html)) !== null && count < 20) {
    count++
    try {
      out.push(JSON.parse(m[1]))
    } catch {
      continue
    }
  }
  return out
}

export function extractAppId(html: string): string | undefined {
  const m = /"appId"\s*:\s*"(\d{10,})"|X-IG-App-ID["'\s:=]+(\d{10,})|"X-IG-App-ID"\s*:\s*"(\d{10,})"/.exec(html)
  return m?.[1] ?? m?.[2] ?? m?.[3]
}

export function extractCsrfToken(html: string): string | undefined {
  const m = /"csrf_token"\s*:\s*"([A-Za-z0-9_-]{10,})"|csrftoken=([A-Za-z0-9_-]{10,})/.exec(html)
  return m?.[1] ?? m?.[2]
}

// ---------------------------------------------------------------------------
// Deep-walk finders over the (version-dependent) blobs
// ---------------------------------------------------------------------------

export type AnyObj = Record<string, unknown>

function isObj(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null
}

/** Depth-first search for the first object satisfying `pred` (cycle-safe). */
export function deepFind(root: unknown, pred: (o: AnyObj) => boolean, maxDepth = 12): AnyObj | undefined {
  const seen = new Set<unknown>()
  const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }]
  while (stack.length) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number }
    if (!isObj(node) || seen.has(node) || depth > maxDepth) continue
    seen.add(node)
    if (pred(node)) return node
    for (const v of Object.values(node)) {
      if (isObj(v)) stack.push({ node: v, depth: depth + 1 })
      else if (Array.isArray(v)) {
        for (const item of v) stack.push({ node: item, depth: depth + 1 })
      }
    }
  }
  return undefined
}

function asUser(o: AnyObj): boolean {
  return (
    typeof o.username === 'string' &&
    ('edge_owner_to_timeline_media' in o || 'edge_followed_by' in o || 'profile_pic_url_hd' in o || 'is_private' in o)
  )
}

function deepFindAll(root: unknown, pred: (o: AnyObj) => boolean, maxDepth = 12, limit = 10): AnyObj[] {
  const out: AnyObj[] = []
  const seen = new Set<unknown>()
  const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }]
  while (stack.length && out.length < limit) {
    const { node, depth } = stack.pop() as { node: unknown; depth: number }
    if (!isObj(node) || seen.has(node) || depth > maxDepth) continue
    seen.add(node)
    if (pred(node)) out.push(node)
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) {
        for (const item of v) stack.push({ node: item, depth: depth + 1 })
      } else if (isObj(v)) stack.push({ node: v, depth: depth + 1 })
    }
  }
  return out
}

export function findUserObject(blobs: unknown[]): AnyObj | undefined {
  for (const blob of blobs) {
    // Modern xdt payloads: user under data.user / entry_data.ProfilePage[0].graphql.user
    const direct =
      deepFind(blob, (o) => isObj(o.graphql) && isObj((o.graphql as AnyObj).user)) ??
      deepFind(blob, asUser)
    if (direct) {
      if (isObj(direct.graphql)) return (direct.graphql as AnyObj).user as AnyObj
      return direct
    }
  }
  return undefined
}

export function findShortcodeMedia(blobs: unknown[]): AnyObj | undefined {
  for (const blob of blobs) {
    const hit = deepFind(
      blob,
      (o) => isObj(o.shortcode_media) || (typeof o.shortcode === 'string' && ('edge_media_to_caption' in o || 'edge_media_preview_like' in o))
    )
    if (hit) return (isObj(hit.shortcode_media) ? (hit.shortcode_media as AnyObj) : hit)
  }
  return undefined
}

export function findLdPerson(blocks: unknown[]): AnyObj | undefined {
  for (const b of blocks) {
    if (isObj(b) && (b['@type'] === 'Person' || b['@type'] === 'ProfilePage')) return b
  }
  return undefined
}

export function requireFound<T>(value: T | undefined, selector: string): T {
  if (value === undefined || value === null) {
    throw new InstagramError(
      `Instagram layout changed, selector ${selector} not found — IG renamed its embedded-data blobs again. ` +
        'Inspect the raw page source for the new window.__additionalDataLoaded / _sharedData shape and update the extractors.'
    )
  }
  return value
}

// ---------------------------------------------------------------------------
// Best-effort GraphQL pagination (hashes rotate; failures are explicit)
// ---------------------------------------------------------------------------

/**
 * Known query hashes / doc ids. Instagram rotates these without notice —
 * every failure surfaces as a "layout changed" error, never an empty page.
 */
export const QUERY_HASH_PROFILE_POSTS = process.env.INSTAGRAM_QUERY_HASH_POSTS ?? '69cba40317214236af40e7efa6977815'
export const QUERY_HASH_COMMENTS = process.env.INSTAGRAM_QUERY_HASH_COMMENTS ?? '97b41c52301f77ce508f55e66d17620e'

export async function graphqlQuery(opts: {
  queryHash: string
  variables: Record<string, unknown>
  appId?: string
  csrfToken?: string
}): Promise<AnyObj> {
  const params = new URLSearchParams({
    query_hash: opts.queryHash,
    variables: JSON.stringify(opts.variables),
  })
  return withRetry('query Instagram GraphQL', async () => {
    await polite()
    let res: Response
    try {
      res = await fetch(`${SITE}/graphql/query/?${params}`, {
        headers: {
          'User-Agent': process.env.INSTAGRAM_UA ?? BROWSER_UA,
          Accept: 'application/json',
          ...(opts.appId ? { 'X-IG-App-ID': opts.appId } : {}),
          ...(opts.csrfToken ? { 'X-CSRFToken': opts.csrfToken } : {}),
        },
      })
    } catch (err) {
      throw new InstagramError(`Could not reach Instagram GraphQL — ${err instanceof Error ? err.message : 'network failure'}`)
    }
    if (retryableStatus(res.status)) {
      throw new InstagramError(`Instagram GraphQL answered HTTP ${res.status} — transient, will retry.`, { status: res.status })
    }
    if (res.status === 401 || res.status === 403) {
      throw new InstagramError(
        'Instagram GraphQL refused the request (login wall / rate limit). Pagination needs a fresh cursor from the embedded JSON; wait and retry the first page.',
        { status: res.status }
      )
    }
    if (!res.ok) {
      throw new InstagramError(
        `Instagram layout changed: GraphQL pagination failed with HTTP ${res.status} — the query hash likely rotated. Update INSTAGRAM_QUERY_HASH_* and retry.`,
        { status: res.status }
      )
    }
    const json = (await res.json()) as AnyObj
    if (json.status !== 'ok' && !json.data) {
      throw new InstagramError(
        'Instagram layout changed: GraphQL returned no data — the query hash likely rotated. Update INSTAGRAM_QUERY_HASH_* and retry.'
      )
    }
    return json
  })
}

/** Best-effort web_profile_info JSON API (needs X-IG-App-ID scraped from HTML). */
export async function webProfileInfo(username: string, appId: string, csrfToken?: string): Promise<AnyObj | undefined> {
  try {
    return await withRetry('fetch web_profile_info', async () => {
      await polite()
      const res = await fetch(`${SITE}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
        headers: {
          'User-Agent': process.env.INSTAGRAM_UA ?? BROWSER_UA,
          Accept: 'application/json',
          'X-IG-App-ID': appId,
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
      })
      if (res.status === 404) return undefined
      if (res.status === 401 || res.status === 403) return undefined
      if (retryableStatus(res.status)) {
        throw new InstagramError('web_profile_info transient failure', { status: res.status })
      }
      if (!res.ok) return undefined
      return (await res.json()) as AnyObj
    })
  } catch {
    return undefined
  }
}

export { deepFindAll }

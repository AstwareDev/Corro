import { BROWSER_HEADERS, ShopError, squash } from './scrape.js'

















export interface Session {
  fetch(url: string, opts?: { timeoutMs?: number }): Promise<string>
}

export interface SessionOptions {
  shop: string
  
  warmupUrl: string
  
  isBlocked: (html: string) => boolean
  


  seedCookies?: Record<string, string>
}

export function createSession(opts: SessionOptions): Session {
  let jar = new Map<string, string>(Object.entries(opts.seedCookies ?? {}))
  let warmed = false
  let warming: Promise<void> | null = null

  function cookieHeader(): string {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  function absorb(res: Response) {
    for (const setCookie of res.headers.getSetCookie()) {
      const pair = setCookie.split(';', 1)[0]
      const eq = pair.indexOf('=')
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  
  
  
  const RETRYABLE_STATUS = new Set([429, 503])

  async function rawFetch(
    url: string,
    referer: string | undefined,
    timeoutMs: number
  ): Promise<{ status: number; text: string }> {
    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          ...(jar.size ? { cookie: cookieHeader() } : {}),
          ...(referer ? { referer } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : (err as Error).message
      throw new ShopError(`${opts.shop} request ${reason}`)
    }
    absorb(res)
    if (!res.ok && !RETRYABLE_STATUS.has(res.status)) {
      throw new ShopError(`${opts.shop} returned ${res.status} for ${url}`, { status: res.status })
    }
    return { status: res.status, text: await res.text() }
  }

  async function warmOnce(timeoutMs: number): Promise<void> {
    jar = new Map(Object.entries(opts.seedCookies ?? {}))
    await rawFetch(opts.warmupUrl, undefined, timeoutMs)
    warmed = true
  }

  async function ensureWarm(timeoutMs: number): Promise<void> {
    if (warmed) return
    warming ??= warmOnce(timeoutMs).finally(() => {
      warming = null
    })
    await warming
  }

  function blocked(res: { status: number; text: string }): boolean {
    return RETRYABLE_STATUS.has(res.status) || opts.isBlocked(res.text)
  }

  return {
    async fetch(url, { timeoutMs = 25_000 } = {}) {
      await ensureWarm(timeoutMs)
      let res = await rawFetch(url, opts.warmupUrl, timeoutMs)

      if (blocked(res)) {
        warmed = false
        await ensureWarm(timeoutMs)
        res = await rawFetch(url, opts.warmupUrl, timeoutMs)
        if (blocked(res)) {
          throw new ShopError(`${opts.shop} would not serve this request past its bot check — try again shortly`)
        }
      }

      return squash(res.text)
    },
  }
}

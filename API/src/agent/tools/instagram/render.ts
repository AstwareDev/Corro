/**
 * Headless-render fallback for fields genuinely absent from fetchable data.
 *
 * Plain fetch() only gets Instagram's app shell on flagged networks — but a
 * real Chromium still receives the server-rendered profile header (username,
 * counts, avatar, bio) behind the closable login overlay. The post grid stays
 * gated, so this fallback enriches the *header only*, never posts/comments.
 *
 * Best-effort and self-disabling: missing browser, timeouts and navigation
 * failures all resolve to `undefined` so callers degrade to metadata instead
 * of failing. Set INSTAGRAM_RENDER=0 to disable entirely.
 */

export interface HeaderFacts {
  username: string
  headerText: string
  avatar?: string
  verified: boolean
}

export interface RenderedHeader {
  bio?: string
  avatar?: string
  verified?: boolean
  followers?: number
  following?: number
}

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

const RENDER_TIMEOUT_MS = envMs('INSTAGRAM_RENDER_TIMEOUT_MS', 30000)

export function renderEnabled(): boolean {
  return process.env.INSTAGRAM_RENDER !== '0'
}

function parseCountLine(line: string, label: string): number | undefined {
  const m = new RegExp(`^([\\d,.KMB]+)\\s*${label}\\s*$`, 'i').exec(line.trim())
  if (!m) return undefined
  const raw = m[1].replace(/,/g, '')
  const suffix = /([KMB])$/i.exec(raw)
  const base = Number(suffix ? raw.slice(0, -1) : raw)
  if (!Number.isFinite(base)) return undefined
  const mult =
    suffix?.[1].toUpperCase() === 'K' ? 1e3 : suffix?.[1].toUpperCase() === 'M' ? 1e6 : suffix?.[1].toUpperCase() === 'B' ? 1e9 : 1
  return Math.round(base * mult)
}

/**
 * Pure parser over the rendered <header> innerText. Layout (observed):
 *   username / "{n} followers" / "{n} following" / display name /
 *   bio lines... / "{domain} and N more" link line / highlight names...
 * Bio = lines after the display name up to the first link-looking line.
 */
export function parseHeaderFacts(facts: HeaderFacts): RenderedHeader {
  const lines = facts.headerText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let followers: number | undefined
  let following: number | undefined
  for (const line of lines) {
    followers ??= parseCountLine(line, 'followers?')
    following ??= parseCountLine(line, 'following')
  }
  // Display name is the first line after the counts that is not the username.
  let countsEnd = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^[\d,.KMB]+\s*(followers?|following|posts?)\s*$/i.test(lines[i]) || lines[i].toLowerCase() === facts.username.toLowerCase()) {
      countsEnd = i + 1
    } else {
      break
    }
  }
  const displayIdx = countsEnd < lines.length ? countsEnd : -1
  const bioLines: string[] = []
  if (displayIdx !== -1) {
    for (let i = displayIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      // Link row ("domain.tld and 2 more") and highlight names end the bio.
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\b/i.test(line) || / and \d+ more$/i.test(line)) break
      if (bioLines.length >= 8) break
      bioLines.push(line)
    }
  }
  const bio = bioLines.join('\n').slice(0, 500) || undefined
  return {
    ...(bio ? { bio } : {}),
    ...(facts.avatar ? { avatar: facts.avatar } : {}),
    ...(facts.verified ? { verified: true as const } : {}),
    ...(followers !== undefined ? { followers } : {}),
    ...(following !== undefined ? { following } : {}),
  }
}

const HEADER_SCRIPT = String.raw`
(() => {
  const header = document.querySelector('header')
  if (!header) return null
  const avatar = header.querySelector('img')?.getAttribute('src') || undefined
  const verified = Boolean(header.querySelector('svg[aria-label="Verified"]'))
  return { headerText: header.innerText || '', avatar, verified }
})()
`

export async function renderProfileHeader(url: string): Promise<RenderedHeader | undefined> {
  if (!renderEnabled()) return undefined
  let browser: { close: () => Promise<void> } | undefined
  try {
    const run = (async (): Promise<RenderedHeader | undefined> => {
      const { chromium } = await import('playwright-core')
      const launched = await chromium.launch({ headless: true })
      browser = launched
      const ctx = await launched.newContext({
        userAgent:
          process.env.INSTAGRAM_UA ??
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
      })
      const page = await ctx.newPage()
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await page.waitForTimeout(7000)
        // Close the dismissible login overlay so it never covers the header.
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(2500)
        const facts = await page.evaluate<HeaderFacts | null>(HEADER_SCRIPT)
        if (!facts || !facts.headerText) return undefined
        const username = new URL(page.url()).pathname.split('/').filter(Boolean)[0] ?? ''
        return parseHeaderFacts({ username, headerText: facts.headerText, avatar: facts.avatar, verified: facts.verified })
      } finally {
        await ctx.close().catch(() => {})
      }
    })()
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), RENDER_TIMEOUT_MS))
    return await Promise.race([run, timeout])
  } catch {
    return undefined
  } finally {
    await browser?.close().catch(() => {})
  }
}

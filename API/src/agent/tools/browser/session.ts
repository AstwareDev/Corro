import type { Browser, BrowserContext, Page } from 'playwright-core'

/** One real browser per workspace (a workspace is already unique per device+session), kept
 * alive across tool calls within a run and across steps in the same session so browser_open,
 * browser_click, browser_fill and browser_read all act on the same page. Closed explicitly by
 * browser_close, or reclaimed after IDLE_MS of no use so a forgotten session does not leak a
 * live browser process forever. */

export class BrowserError extends Error {}

interface Entry {
  browser: Browser
  context: BrowserContext
  page: Page
  lastUsedAt: number
}

const sessions = new Map<string, Entry>()
const IDLE_MS = 10 * 60_000
const SWEEP_MS = 60_000

let sweeping = false
function startSweep() {
  if (sweeping) return
  sweeping = true
  const timer = setInterval(() => {
    const cutoff = Date.now() - IDLE_MS
    for (const [key, entry] of sessions) {
      if (entry.lastUsedAt < cutoff) {
        sessions.delete(key)
        entry.browser.close().catch(() => {})
      }
    }
  }, SWEEP_MS)
  timer.unref?.()
}

/** Which installed browser to drive. playwright-core ships no browser binary of its own —
 * it launches whatever is already on the machine, so nothing is downloaded on install.
 * Override with CORRO_BROWSER_CHANNEL (e.g. "chromium", "chrome-beta") or point
 * CORRO_BROWSER_PATH at a specific executable. */
function launchOptions() {
  const executablePath = process.env.CORRO_BROWSER_PATH
  if (executablePath) return { executablePath }
  return { channel: process.env.CORRO_BROWSER_CHANNEL ?? 'chrome' }
}

async function launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const { chromium } = await import('playwright-core')
  let browser: Browser
  try {
    browser = await chromium.launch({ headless: true, ...launchOptions() })
  } catch (err) {
    const primary = launchOptions()
    if (!('channel' in primary) || primary.channel === 'msedge') throw asBrowserError(err)
    try {
      browser = await chromium.launch({ headless: true, channel: 'msedge' })
    } catch {
      throw asBrowserError(err)
    }
  }
  const context = await browser.newContext()
  const page = await context.newPage()
  return { browser, context, page }
}

function asBrowserError(err: unknown): BrowserError {
  const message = err instanceof Error ? err.message : String(err)
  return new BrowserError(
    `No usable browser found on this machine (${message}). Install Google Chrome or Microsoft Edge, ` +
      'or set CORRO_BROWSER_PATH to a Chromium-based browser executable.'
  )
}

export async function getPage(key: string): Promise<Page> {
  startSweep()
  const existing = sessions.get(key)
  if (existing) {
    existing.lastUsedAt = Date.now()
    if (!existing.page.isClosed()) return existing.page
    sessions.delete(key)
    existing.browser.close().catch(() => {})
  }
  const { browser, context, page } = await launch()
  sessions.set(key, { browser, context, page, lastUsedAt: Date.now() })
  return page
}

export function hasSession(key: string): boolean {
  return sessions.has(key)
}

export async function closeSession(key: string): Promise<boolean> {
  const entry = sessions.get(key)
  if (!entry) return false
  sessions.delete(key)
  await entry.browser.close().catch(() => {})
  return true
}

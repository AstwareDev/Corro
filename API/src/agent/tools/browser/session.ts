import { spawn } from 'node:child_process'
import type { Browser, BrowserContext, Page } from 'playwright-core'

export class BrowserError extends Error {}

interface Entry {
  browser: Browser
  context: BrowserContext
  ownsBrowser: boolean
  activeIndex: number
  lastUsedAt: number
}

export interface PageInfo {
  index: number
  url: string
  title: string
  active: boolean
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
        closeEntry(entry).catch(() => {})
      }
    }
  }, SWEEP_MS)
  timer.unref?.()
}

function closeEntry(entry: Entry): Promise<void> {
  return entry.ownsBrowser ? entry.browser.close() : entry.context.close()
}

const CHANNELS = ['chrome', 'msedge', 'chrome-beta', 'chromium']

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  const executablePath = process.env.CORRO_BROWSER_PATH

  if (executablePath) {
    try {
      return await chromium.launch({ headless: true, executablePath })
    } catch (err) {
      throw asBrowserError(err)
    }
  }

  const preferred = process.env.CORRO_BROWSER_CHANNEL ?? 'chrome'
  let failure: unknown
  for (const channel of [preferred, ...CHANNELS.filter((c) => c !== preferred)]) {
    try {
      return await chromium.launch({ headless: true, channel })
    } catch (err) {
      failure ??= err
    }
  }
  throw asBrowserError(failure)
}

let sharedBrowser: Promise<Browser> | null = null

function obscuraEndpoint(): string {
  const port = process.env.CORRO_OBSCURA_PORT ?? '9222'
  return `ws://127.0.0.1:${port}`
}

async function tryConnect(endpoint: string): Promise<Browser | null> {
  const { chromium } = await import('playwright-core')
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))
  try {
    return await Promise.race([chromium.connectOverCDP(endpoint), timeout])
  } catch {
    return null
  }
}

async function connectObscura(): Promise<Browser> {
  const endpoint = obscuraEndpoint()
  const existing = await tryConnect(endpoint)
  if (existing) return existing

  const obscuraPath = process.env.CORRO_OBSCURA_PATH
  if (!obscuraPath) throw new BrowserError('CORRO_OBSCURA_PATH is not set.')
  const port = process.env.CORRO_OBSCURA_PORT ?? '9222'
  const child = spawn(obscuraPath, ['serve', '--port', port], { stdio: 'ignore' })
  child.unref()

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const browser = await tryConnect(endpoint)
    if (browser) return browser
  }
  throw new BrowserError(`Could not connect to Obscura's CDP server at ${endpoint}.`)
}

function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = connectObscura()
      .then((browser) => {
        console.log(`[browser] connected to Obscura CDP server at ${obscuraEndpoint()}`)
        browser.on('disconnected', () => {
          sharedBrowser = null
        })
        return browser
      })
      .catch((err) => {
        sharedBrowser = null
        throw err
      })
  }
  return sharedBrowser
}

async function launch(): Promise<Entry> {
  if (process.env.CORRO_OBSCURA_PATH) {
    const browser = await getSharedBrowser()
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.newPage()
    return { browser, context, ownsBrowser: false, activeIndex: 0, lastUsedAt: Date.now() }
  }

  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.newPage()
  return { browser, context, ownsBrowser: true, activeIndex: 0, lastUsedAt: Date.now() }
}

function asBrowserError(err: unknown): BrowserError {
  const message = err instanceof Error ? err.message : String(err)
  return new BrowserError(
    `No usable browser found on this machine (${message}). Install Google Chrome or Microsoft Edge, ` +
      'or set CORRO_BROWSER_PATH to a Chromium-based browser executable.'
  )
}

function livePages(entry: Entry): Page[] {
  return entry.context.pages().filter((p) => !p.isClosed())
}

export async function getPage(key: string): Promise<Page> {
  startSweep()
  const existing = sessions.get(key)
  if (existing) {
    existing.lastUsedAt = Date.now()
    const pages = livePages(existing)
    if (pages.length) {
      existing.activeIndex = Math.min(existing.activeIndex, pages.length - 1)
      return pages[existing.activeIndex]
    }
    sessions.delete(key)
    closeEntry(existing).catch(() => {})
  }
  const entry = await launch()
  sessions.set(key, entry)
  return livePages(entry)[0]
}

export function hasSession(key: string): boolean {
  return sessions.has(key)
}

export async function getActivePage(key: string): Promise<Page | null> {
  const entry = sessions.get(key)
  if (!entry) return null
  const pages = livePages(entry)
  if (!pages.length) return null
  const at = Math.min(entry.activeIndex, pages.length - 1)
  return pages[at] ?? null
}

async function pageAt(key: string, index?: number): Promise<Page> {
  const entry = sessions.get(key)
  if (!entry) throw new BrowserError('No page is open.')
  entry.lastUsedAt = Date.now()
  const pages = livePages(entry)
  if (!pages.length) throw new BrowserError('No page is open.')
  const at = index ?? entry.activeIndex
  const page = pages[at]
  if (!page) throw new BrowserError(`No page at index ${at}.`)
  return page
}

export async function listPages(key: string): Promise<PageInfo[]> {
  const entry = sessions.get(key)
  if (!entry) return []
  const pages = livePages(entry)
  return Promise.all(
    pages.map(async (page, index) => ({
      index,
      url: page.url(),
      title: await page.title().catch(() => ''),
      active: index === Math.min(entry.activeIndex, pages.length - 1),
    }))
  )
}

export async function capturePage(key: string, index?: number): Promise<Buffer> {
  const page = await pageAt(key, index)
  return page.screenshot({ type: 'png' })
}

export async function activatePage(key: string, index: number): Promise<boolean> {
  const entry = sessions.get(key)
  if (!entry) return false
  if (index < 0 || index >= livePages(entry).length) return false
  entry.activeIndex = index
  entry.lastUsedAt = Date.now()
  return true
}

export async function closePage(key: string, index: number): Promise<boolean> {
  const entry = sessions.get(key)
  if (!entry) return false
  const pages = livePages(entry)
  const page = pages[index]
  if (!page) return false
  await page.close().catch(() => {})

  const remaining = livePages(entry).length
  if (!remaining) {
    sessions.delete(key)
    await closeEntry(entry).catch(() => {})
    return true
  }
  entry.activeIndex = Math.min(entry.activeIndex, remaining - 1)
  entry.lastUsedAt = Date.now()
  return true
}

export async function closeSession(key: string): Promise<boolean> {
  const entry = sessions.get(key)
  if (!entry) return false
  sessions.delete(key)
  await closeEntry(entry).catch(() => {})
  return true
}

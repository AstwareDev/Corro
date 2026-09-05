import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { saveBinary } from '../fs/storage.js'
import { resolveInside, toRelative, viewUrl } from '../fs/workspace.js'
import { BrowserError, closeSession, getPage, hasSession } from './session.js'

const MAX_CHARS = 40_000
const NAV_TIMEOUT_MS = 30_000
const BLOCKED_SCHEMES = ['file:', 'chrome:', 'chrome-extension:', 'javascript:', 'data:', 'view-source:', 'about:']

function checkUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BrowserError(`${JSON.stringify(raw)} is not a valid URL.`)
  }
  if (BLOCKED_SCHEMES.includes(url.protocol)) {
    throw new BrowserError(`The ${url.protocol} scheme is not allowed. Only http and https pages can be opened.`)
  }
  return url
}

function fail(err: unknown) {
  return {
    ok: false as const,
    error: err instanceof BrowserError || err instanceof Error ? err.message : 'Browser operation failed',
  }
}

/** Trimmed, deduplicated visible text — not raw HTML. A model reasoning over a page wants what
 * a person sees, not markup; the fixed budget below keeps one page from eating the whole context.
 * Passed to page.evaluate as a source string, not a typed closure: it runs in the browser's DOM,
 * which this project's tsconfig (Node-only lib, no "dom") does not type-check against. */
const READABLE_TEXT_SCRIPT = `
(() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])
  function walk(node, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      if (text) out.push(text)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (skip.has(node.tagName)) return
    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return
    for (const child of Array.from(node.childNodes)) walk(child, out)
  }
  const out = []
  walk(document.body, out)
  return out.join('\n')
})()
`

async function readableText(page: import('playwright-core').Page): Promise<string> {
  return page.evaluate<string>(READABLE_TEXT_SCRIPT)
}

export function createBrowserTools(workspace: string) {
  const key = workspace

  const browser_open = tool({
    description: 'Opening a web page',
    inputSchema: z.object({
      description: toolDescription,
      url: z.string().url().describe('The page to open, e.g. "https://example.com/pricing"'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
      maxChars: z.number().int().min(500).max(MAX_CHARS).default(8000).describe('How much of the visible text to return.'),
    }),
    execute: async ({ url, waitUntil, maxChars }) => {
      try {
        checkUrl(url)
        const page = await getPage(key)
        const response = await page.goto(url, { waitUntil, timeout: NAV_TIMEOUT_MS })
        const text = await readableText(page)
        return {
          ok: true as const,
          url: page.url(),
          status: response?.status(),
          title: await page.title(),
          text: text.slice(0, maxChars),
          truncated: text.length > maxChars,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const browser_read = tool({
    description: 'Reading the open page',
    inputSchema: z.object({
      description: toolDescription,
      maxChars: z.number().int().min(500).max(MAX_CHARS).default(8000),
    }),
    execute: async ({ maxChars }) => {
      try {
        if (!hasSession(key)) return { ok: false as const, error: 'No page is open. Call browser_open first.' }
        const page = await getPage(key)
        const text = await readableText(page)
        return {
          ok: true as const,
          url: page.url(),
          title: await page.title(),
          text: text.slice(0, maxChars),
          truncated: text.length > maxChars,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const browser_click = tool({
    description: 'Clicking an element on the page',
    inputSchema: z.object({
      description: toolDescription,
      selector: z.string().min(1).describe('A CSS selector, or text=Exact visible text, or role=button[name="Submit"]'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'none']).default('load').describe('What to wait for after the click, in case it navigates.'),
    }),
    execute: async ({ selector, waitUntil }) => {
      try {
        if (!hasSession(key)) return { ok: false as const, error: 'No page is open. Call browser_open first.' }
        const page = await getPage(key)
        const locator = page.locator(selector).first()
        await locator.waitFor({ state: 'visible', timeout: NAV_TIMEOUT_MS })
        await Promise.all([
          waitUntil === 'none'
            ? Promise.resolve()
            : page.waitForLoadState(waitUntil, { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
          locator.click({ timeout: NAV_TIMEOUT_MS }),
        ])
        const text = await readableText(page)
        return {
          ok: true as const,
          url: page.url(),
          title: await page.title(),
          text: text.slice(0, 6000),
          truncated: text.length > 6000,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const browser_fill = tool({
    description: 'Filling in a form field',
    inputSchema: z.object({
      description: toolDescription,
      selector: z.string().min(1).describe('A CSS selector for the input, textarea, or contenteditable field.'),
      value: z.string().describe('The text to type. Replaces any existing value.'),
      submit: z.boolean().optional().describe('Press Enter after typing, e.g. to submit a search box.'),
    }),
    execute: async ({ selector, value, submit }) => {
      try {
        if (!hasSession(key)) return { ok: false as const, error: 'No page is open. Call browser_open first.' }
        const page = await getPage(key)
        const locator = page.locator(selector).first()
        await locator.waitFor({ state: 'visible', timeout: NAV_TIMEOUT_MS })
        await locator.fill(value, { timeout: NAV_TIMEOUT_MS })
        if (submit) {
          await Promise.all([
            page.waitForLoadState('load', { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
            locator.press('Enter'),
          ])
        }
        return { ok: true as const, url: page.url(), title: await page.title(), filled: selector, submitted: Boolean(submit) }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const browser_screenshot = tool({
    description: 'Capturing a screenshot of the page',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative .png path to save to, e.g. "screenshots/pricing.png"'),
      fullPage: z.boolean().optional().default(true),
    }),
    execute: async ({ path: rel, fullPage }) => {
      try {
        if (!rel.toLowerCase().endsWith('.png')) return { ok: false as const, error: 'path must end in .png' }
        if (!hasSession(key)) return { ok: false as const, error: 'No page is open. Call browser_open first.' }
        const page = await getPage(key)
        const buffer = await page.screenshot({ fullPage, type: 'png' })
        const full = resolveInside(workspace, rel)
        const receipt = saveBinary(full, buffer)
        const relPath = toRelative(workspace, full)
        return { ok: true as const, path: relPath, url: page.url(), ...receipt, viewUrl: viewUrl(workspace, relPath) }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const browser_close = tool({
    description: 'Closing the browser',
    inputSchema: z.object({ description: toolDescription }),
    execute: async () => {
      const closed = await closeSession(key)
      return { ok: true as const, closed }
    },
  })

  return { browser_open, browser_read, browser_click, browser_fill, browser_screenshot, browser_close }
}

export type BrowserToolName = keyof ReturnType<typeof createBrowserTools>

export const BROWSER_TOOL_NAMES: BrowserToolName[] = [
  'browser_open',
  'browser_read',
  'browser_click',
  'browser_fill',
  'browser_screenshot',
  'browser_close',
]

export { BrowserError } from './session.js'

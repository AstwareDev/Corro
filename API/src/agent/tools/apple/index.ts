import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure, fetchPage } from '../shops/scrape.js'
import {
  assertHtml,
  heroImage,
  matchLines,
  pageDescription,
  pageTitle,
  pageUrl,
  parseLinePage,
  PRODUCT_LINES,
  SHOP,
  SITE,
  type AppleProduct,
  type ProductLine,
} from './parse.js'

async function fetchLine(line: ProductLine): Promise<AppleProduct[]> {
  const url = pageUrl(line)
  const html = await fetchPage(SHOP, url)
  assertHtml(html, url)
  return parseLinePage(html, line, url)
}

export const appleSearch = tool({
  description:
    'Search the Apple Store (apple.com) for current iPhone and iPad prices — every colour and storage ' +
    'configuration Apple itself sells, with the real price for each. Covers iPhone and iPad only: Mac, ' +
    'Apple Watch and AirPods use a different configurator on Apple\'s own site that this does not read ' +
    'yet. Follow up with apple_product for a full-size photo and description of one line.',
  inputSchema: z.object({
    description: toolDescription,
    query: z
      .string()
      .min(1)
      .max(120)
      .describe('What to look for, e.g. "iPhone 17 Pro", "iPad Air", "256GB iPhone". Must name iPhone or iPad.'),
    maxResults: z.number().int().min(1).max(60).default(20).describe('Configurations to return.'),
  }),
  execute: async ({ query, maxResults }) => {
    const lines = matchLines(query)
    if (!lines.length) {
      return {
        ok: false as const,
        error:
          `No iPhone or iPad line matches "${query}". Known lines: ` +
          PRODUCT_LINES.map((l) => l.label).join(', ') +
          '. Mac, Apple Watch and AirPods are not covered.',
      }
    }

    try {
      const perLine = await Promise.all(lines.map((line) => fetchLine(line)))
      const all = perLine.flat()
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      const filtered = words.length
        ? all.filter((p) => words.every((w) => p.name.toLowerCase().includes(w) || p.category.toLowerCase().includes(w)))
        : all
      const products = (filtered.length ? filtered : all).slice(0, maxResults)

      return {
        ok: true as const,
        shop: SHOP,
        query,
        lines: lines.map((l) => l.label),
        currency: 'USD',
        products,
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const appleProduct = tool({
  description:
    'Full detail for an Apple product line: every current colour/storage configuration and its price, ' +
    'unfiltered, plus a description and a representative photo on each. Takes the `url` values from an ' +
    'apple_search result — batch every line you need into a single call. iPhone and iPad only.',
  inputSchema: z.object({
    description: toolDescription,
    urls: z.array(z.string().url()).min(1).max(6).describe('Product line URLs exactly as apple_search returned them.'),
  }),
  execute: async ({ urls }) => {
    const wanted = [...new Set(urls)].filter((u) => u.startsWith(SITE))
    if (!wanted.length) {
      return { ok: false as const, error: `Only ${SITE} product URLs can be read by this tool` }
    }

    const settled = await Promise.all(
      wanted.map(async (url) => {
        const line = PRODUCT_LINES.find((l) => pageUrl(l) === url)
        if (!line) return { url, error: 'Not a recognised iPhone or iPad buy page' }

        try {
          const html = await fetchPage(SHOP, url)
          assertHtml(html, url)
          const configurations = parseLinePage(html, line, url)
          if (!configurations.length) return { url, error: `${SHOP} listed no configurations for this line` }

          const description = pageDescription(html)
          const image = heroImage(html)
          return { products: configurations.map((c) => ({ ...c, ...(description ? { description } : {}), ...(image ? { image } : {}) })) }
        } catch (err) {
          return { url, error: failure(SHOP, err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('products' in s ? s.products : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ url: s.url, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No product lines were returned' }
    }
    return { ok: true as const, shop: SHOP, currency: 'USD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const APPLE_TOOL_NAMES = ['apple_search', 'apple_product'] as const

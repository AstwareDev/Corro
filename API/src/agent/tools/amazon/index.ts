import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure } from '../shops/scrape.js'
import { createSession } from '../shops/session.js'
import { parseProductPage, parseSearchResults, productUrl, SHOP, SITE } from './parse.js'









const session = createSession({
  shop: SHOP,
  warmupUrl: `${SITE}/`,
  seedCookies: { 'i18n-prefs': 'USD' },
  isBlocked: (html) => /triggerInterstitialChallenge|bm-verify=|Enter the characters you see below/.test(html),
})

export const amazonSearch = tool({
  description:
    'Search Amazon (amazon.com) for live US prices, ratings and current deals. Use it for what a ' +
    "product costs or whether Amazon sells it — this is the retailer's own live listing. Follow up " +
    'with amazon_product for the full description and photos.',
  inputSchema: z.object({
    description: toolDescription,
    query: z.string().min(1).max(120).describe('What to look for.'),
    maxResults: z.number().int().min(1).max(30).default(12).describe('Products to return.'),
    page: z.number().int().min(1).max(20).default(1).describe('Page of results.'),
  }),
  execute: async ({ query, maxResults, page }) => {
    const params = new URLSearchParams({ k: query })
    if (page > 1) params.set('page', String(page))

    try {
      const html = await session.fetch(`${SITE}/s?${params}`)
      const products = parseSearchResults(html).slice(0, maxResults)

      return {
        ok: true as const,
        shop: SHOP,
        query,
        page,
        discountedInPage: products.filter((p) => p.wasPrice !== undefined).length,
        currency: 'USD',
        products,
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const amazonProduct = tool({
  description:
    'Full detail for specific Amazon products: description, brand, category, rating, stock status and ' +
    'photos, with the exact price and any list-price discount. Takes `asin` values — the 10-character ' +
    'code from an amazon_search result\'s `id`, or from a product URL\'s /dp/ segment. Batch every one ' +
    'you need into a single call.',
  inputSchema: z.object({
    description: toolDescription,
    asins: z
      .array(z.string().regex(/^[A-Z0-9]{10}$/, 'Amazon ASINs are 10 uppercase letters/digits'))
      .min(1)
      .max(8)
      .describe('Product ASINs, e.g. "B00FLYWNYQ".'),
  }),
  execute: async ({ asins }) => {
    const wanted = [...new Set(asins)]

    const settled = await Promise.all(
      wanted.map(async (asin) => {
        try {
          const parsed = parseProductPage(await session.fetch(productUrl(asin)), asin)
          if (!parsed) return { asin, error: 'Amazon has no product at that ASIN' }
          return { product: parsed }
        } catch (err) {
          return { asin, error: failure(SHOP, err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('product' in s ? [s.product] : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ id: s.asin, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No products were returned' }
    }
    return { ok: true as const, shop: SHOP, currency: 'USD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const AMAZON_TOOL_NAMES = ['amazon_search', 'amazon_product'] as const

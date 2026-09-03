import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure } from '../shops/scrape.js'
import { createSession } from '../shops/session.js'
import { parseNextData, parseProductData, parseSearchResult, SHOP, SITE } from './parse.js'






const session = createSession({
  shop: SHOP,
  warmupUrl: `${SITE}/`,
  isBlocked: (html) => html.includes('Robot or human?') && !html.includes('__NEXT_DATA__'),
})


const SORT = {
  relevance: 'best_match',
  cheapest: 'price_low',
  dearest: 'price_high',
  bestSelling: 'best_seller',
} as const

export const walmartSearch = tool({
  description:
    'Search Walmart (walmart.com) for live US prices, ratings and current rollbacks. Use it for what a ' +
    "product costs or whether Walmart stocks it — this is the retailer's own live listing, not a review " +
    'or a price comparison site. Follow up with walmart_product for the full description and photos.',
  inputSchema: z.object({
    description: toolDescription,
    query: z.string().min(1).max(120).describe('What to look for.'),
    discountedOnly: z.boolean().default(false).describe('Only items currently marked down (Rollback).'),
    sort: z
      .enum(['relevance', 'cheapest', 'dearest', 'bestSelling'])
      .default('relevance')
      .describe("\"relevance\" is Walmart's own ranking for the query."),
    maxResults: z.number().int().min(1).max(40).default(12).describe('Products to return.'),
    page: z.number().int().min(1).default(1).describe('Page of results.'),
  }),
  execute: async ({ query, discountedOnly, sort, maxResults, page }) => {
    const params = new URLSearchParams({ q: query, sort: SORT[sort] })
    if (page > 1) params.set('page', String(page))
    if (discountedOnly) params.set('facet', 'special_offers:Rollback')

    try {
      const html = await session.fetch(`${SITE}/search?${params}`)
      const { products, totalMatches, pageCount } = parseSearchResult(parseNextData(html))

      return {
        ok: true as const,
        shop: SHOP,
        query,
        page,
        ...(pageCount ? { pageCount } : {}),
        ...(totalMatches !== undefined ? { totalMatches } : {}),
        discountedInPage: products.filter((p) => p.wasPrice !== undefined).length,
        currency: 'USD',
        products: products.slice(0, maxResults),
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const walmartProduct = tool({
  description:
    'Full detail for specific Walmart products: description, brand, category, stock status and photos, ' +
    'with the exact price and any rollback discount. Takes the `url` values from a previous ' +
    'walmart_search result — batch every one you need into a single call.',
  inputSchema: z.object({
    description: toolDescription,
    urls: z.array(z.string().url()).min(1).max(8).describe('Product URLs exactly as walmart_search returned them.'),
  }),
  execute: async ({ urls }) => {
    const wanted = [...new Set(urls)].filter((u) => u.startsWith(SITE))
    if (!wanted.length) {
      return { ok: false as const, error: `Only ${SITE} product URLs can be read by this tool` }
    }

    const settled = await Promise.all(
      wanted.map(async (url) => {
        try {
          const parsed = parseProductData(parseNextData(await session.fetch(url)), url)
          if (!parsed) return { url, error: 'Walmart has no product at that URL' }
          return { product: parsed }
        } catch (err) {
          return { url, error: failure(SHOP, err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('product' in s ? [s.product] : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ url: s.url, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No products were returned' }
    }
    return { ok: true as const, shop: SHOP, currency: 'USD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const WALMART_TOOL_NAMES = ['walmart_search', 'walmart_product'] as const

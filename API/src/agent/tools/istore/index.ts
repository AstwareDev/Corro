import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure, fetchPage } from '../shops/scrape.js'
import {
  categoryUrl,
  parseCategories,
  parseProductCards,
  parseProductPage,
  productUrl,
  saleUrl,
  searchUrl,
  SHOP,
  SITE,
} from './parse.js'

export const istoreSearch = tool({
  description:
    'Search iStore (istore.am) — the Apple Authorised Reseller in Armenia — for live prices in dram on ' +
    'iPhone, iPad, Mac, Watch, TV, AirPods, audio and accessories. This is a general Apple retailer, not ' +
    "Apple's own configurator: it carries whatever stock the reseller actually holds, at its own prices " +
    'and with its own sale markdowns, so use it (not apple_search) for what these cost or are in stock in ' +
    'Armenia. Give a query, a category slug from istore_categories, or discountedOnly to browse the sale ' +
    'shelf. Follow up with istore_product for full detail and every photo.',
  inputSchema: z.object({
    description: toolDescription,
    query: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('What to look for, e.g. "iPhone 17 Pro", "AirPods Max". Omit when browsing a category or the sale shelf.'),
    category: z
      .string()
      .max(160)
      .optional()
      .describe('Browse one product line instead of searching. Slug from istore_categories, e.g. "iphone-1/iphone-17-pro-140".'),
    discountedOnly: z.boolean().default(false).describe('Browse only what is currently marked down. Ignores query and category.'),
    sort: z
      .enum(['relevance', 'cheapest', 'dearest'])
      .default('relevance')
      .describe('"relevance" is the order the page itself lists them in.'),
    maxResults: z.number().int().min(1).max(50).default(12).describe('Products to return.'),
  }),
  execute: async ({ query, category, discountedOnly, sort, maxResults }) => {
    if (!query && !category && !discountedOnly) {
      return {
        ok: false as const,
        error: 'Give a query, a category slug from istore_categories, or discountedOnly: true to browse the sale shelf.',
      }
    }

    const url = category ? categoryUrl(category) : query ? searchUrl(query) : saleUrl()

    try {
      const html = await fetchPage(SHOP, url)
      const all = parseProductCards(html)
      const sorted =
        sort === 'relevance'
          ? all
          : [...all].sort((a, b) => (sort === 'cheapest' ? 1 : -1) * ((a.price ?? 0) - (b.price ?? 0)))
      const products = sorted.slice(0, maxResults)

      return {
        ok: true as const,
        shop: SHOP,
        ...(query ? { query } : {}),
        ...(category ? { category } : {}),
        ...(discountedOnly ? { shelf: 'discounts' as const } : {}),
        totalMatches: all.length,
        discountedInPage: products.filter((p) => p.wasPrice !== undefined).length,
        currency: 'AMD',
        products,
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const istoreProduct = tool({
  description:
    'Full detail for specific iStore products: colour, storage and other configuration, the exact price ' +
    'with any markdown, stock status, and every product photo. Takes the numeric `ids` from a previous ' +
    'istore_search result — batch every one you need into a single call.',
  inputSchema: z.object({
    description: toolDescription,
    ids: z.array(z.number().int()).min(1).max(10).describe('Product ids exactly as istore_search returned them.'),
  }),
  execute: async ({ ids }) => {
    const wanted = [...new Set(ids)]

    const settled = await Promise.all(
      wanted.map(async (id) => {
        try {
          const html = await fetchPage(SHOP, productUrl(id))
          const product = parseProductPage(html, id)
          if (!product) return { id, error: `iStore has no product #${id}` }
          return { product }
        } catch (err) {
          return { id, error: failure(SHOP, err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('product' in s ? [s.product] : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ id: s.id, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No products were returned' }
    }
    return { ok: true as const, shop: SHOP, currency: 'AMD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const istoreCategories = tool({
  description:
    "Browse iStore's category tree (istore.am) — iPad, Mac, iPhone, Watch, TV, AirPods, Audio and " +
    'Accessories, each with its product lines. Use it to get a `category` slug for istore_search when a ' +
    'query is too broad, or when the user wants to see what a line holds.',
  inputSchema: z.object({
    description: toolDescription,
    parentSlug: z
      .string()
      .max(120)
      .optional()
      .describe('Return only this top-level section and its lines. Omit for the whole tree.'),
  }),
  execute: async ({ parentSlug }) => {
    try {
      const html = await fetchPage(SHOP, `${SITE}/`)
      const all = parseCategories(html)
      const categories = parentSlug ? all.filter((c) => c.slug === parentSlug) : all

      if (parentSlug && !categories.length) {
        return { ok: false as const, error: `iStore has no section "${parentSlug}"` }
      }

      return {
        ok: true as const,
        shop: SHOP,
        site: SITE,
        level: parentSlug ? ('children' as const) : ('top' as const),
        categories,
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const ISTORE_TOOL_NAMES = ['istore_search', 'istore_product', 'istore_categories'] as const

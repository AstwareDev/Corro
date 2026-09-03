import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { budget, failure, fetchPage, SHOP_LANGUAGES } from '../shops/scrape.js'
import {
  pageUrl,
  parseCategories,
  parsePageCount,
  parseProductCards,
  parseProductPage,
  SHOP,
  SITE,
} from './parse.js'


const SORT = {
  relevance: undefined,
  cheapest: 's_price',
  dearest: '-s_price',
  newest: '-updated_at',
  offers: '-is_best_slide',
} as const


const SALE_SLUG = 'zegcer'
const PER_PAGE = 60

const language = z.enum(SHOP_LANGUAGES).default('en').describe('Language to read the catalogue in.')

export const parmaSearch = tool({
  description:
    'Search the Parma supermarket catalogue (parma.am) — an Armenian grocery chain — for live prices ' +
    'in dram and current markdowns. Use it for what a product costs or whether Parma stocks it, and ' +
    'alongside the other Armenian shops when someone wants to compare where something is cheaper. ' +
    'Follow up with parma_product for a description and full-size photos.',
  inputSchema: z.object({
    description: toolDescription,
    query: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('What to look for. Matches the catalogue in the chosen language. Omit to browse the sale shelf.'),
    language,
    discountedOnly: z
      .boolean()
      .default(false)
      .describe('Browse only what is marked down. Ignores the query — Parma lists its sale shelf whole.'),
    sort: z
      .enum(['relevance', 'cheapest', 'dearest', 'newest', 'offers'])
      .default('relevance')
      .describe("\"relevance\" is the shop's own ordering."),
    maxResults: z.number().int().min(1).max(60).default(12).describe('Products to return.'),
    page: z.number().int().min(1).default(1).describe('Page of results.'),
  }),
  execute: async ({ query, language: lang, discountedOnly, sort, maxResults, page }) => {
    if (!query && !discountedOnly) {
      return { ok: false as const, error: 'Give a query, or set discountedOnly: true to browse the sale shelf.' }
    }

    const sortKey = SORT[sort]
    const path = discountedOnly
      ? `/product/shop?slug=${SALE_SLUG}&page=${page}&per-page=${PER_PAGE}`
      : `/product/search?text=${encodeURIComponent(query as string)}&page=${page}&per-page=${PER_PAGE}`
    const url = pageUrl(lang, sortKey ? `${path}&sort=${sortKey}` : path)

    try {
      const html = await fetchPage(SHOP, url)
      const all = parseProductCards(html, lang)
      const products = all.slice(0, maxResults).map(({ slug, ...rest }) => ({ ...rest, slug, currency: 'AMD' as const }))

      return {
        ok: true as const,
        shop: SHOP,
        ...(query && !discountedOnly ? { query } : {}),
        ...(discountedOnly ? { shelf: 'discounts' as const } : {}),
        page,
        ...(parsePageCount(html) ? { pageCount: parsePageCount(html) } : {}),
        onThisPage: all.length,
        discountedInPage: products.filter((p) => p.wasPrice !== undefined).length,
        currency: 'AMD',
        products,
      }
    } catch (err) {
      return failure(SHOP, err)
    }
  },
})

export const parmaProduct = tool({
  description:
    'Full detail for specific Parma products: description, brand, country of origin, manufacturer, ' +
    'full-size photos and the exact price with any markdown. Takes the `slug` values from a previous ' +
    'parma_search result — batch every one you need into a single call.',
  inputSchema: z.object({
    description: toolDescription,
    slugs: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(8)
      .describe('Product slugs exactly as parma_search returned them, e.g. "coffee-ground-lavazza-...-250g_53715".'),
    language,
    maxChars: z.number().int().min(200).max(4000).default(1200).describe('Budget for each description.'),
  }),
  execute: async ({ slugs, language: lang, maxChars }) => {
    const wanted = [...new Set(slugs)]

    const settled = await Promise.all(
      wanted.map(async (slug) => {
        try {
          const url = pageUrl(lang, `/product/product?slug=${encodeURIComponent(slug)}`)
          const parsed = parseProductPage(await fetchPage(SHOP, url), lang, slug)
          if (!parsed) return { slug, error: 'Parma has no product at that slug' }
          return {
            product: {
              ...parsed,
              currency: 'AMD' as const,
              ...(parsed.description ? { description: budget(parsed.description, maxChars) } : {}),
            },
          }
        } catch (err) {
          return { slug, error: failure(SHOP, err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('product' in s ? [s.product] : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ slug: s.slug, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No products were returned' }
    }
    return { ok: true as const, shop: SHOP, currency: 'AMD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const parmaCategories = tool({
  description:
    "Browse Parma's aisles (parma.am). Returns the top-level sections with their sub-categories, " +
    'so you can tell the user what a section holds or narrow a search that is too broad.',
  inputSchema: z.object({
    description: toolDescription,
    language,
    parentSlug: z
      .string()
      .max(120)
      .optional()
      .describe('Return only this section and its children. Omit for the whole tree.'),
  }),
  execute: async ({ language: lang, parentSlug }) => {
    try {
      
      
      const html = await fetchPage(SHOP, pageUrl(lang, '/'))
      const all = parseCategories(html)
      const categories = parentSlug ? all.filter((c) => c.slug === parentSlug) : all

      if (parentSlug && !categories.length) {
        return { ok: false as const, error: `Parma has no section "${parentSlug}"` }
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

export const PARMA_TOOL_NAMES = ['parma_search', 'parma_product', 'parma_categories'] as const

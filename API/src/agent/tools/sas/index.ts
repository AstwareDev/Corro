import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { budget, failure, fetchPage, SHOP_LANGUAGES } from '../shops/scrape.js'
import { pageUrl, parseCategories, parseOffsets, parseProductCards, parseProductPage, SHOP, SITE } from './parse.js'


const SORT = {
  relevance: 'RELEVANSE',
  cheapest: 'PRICE_LOW',
  dearest: 'PRICE_HIGH',
  popular: 'POPULAR',
} as const


const LIMIT = 60
const DISCOUNT_SECTION = 'discount'

const language = z.enum(SHOP_LANGUAGES).default('en').describe('Language to read the catalogue in.')

export const sasSearch = tool({
  description:
    'Search the SAS supermarket catalogue (sas.am) — an Armenian grocery chain — for live prices in ' +
    'dram and current markdowns. Use it for what a product costs or whether SAS stocks it, and ' +
    'alongside the other Armenian shops when someone wants to compare where something is cheaper. ' +
    'Follow up with sas_product for a description, origin and full-size photos.',
  inputSchema: z.object({
    description: toolDescription,
    query: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('What to look for. Omit when browsing a category or the discount shelf.'),
    language,
    categorySlug: z
      .string()
      .max(120)
      .optional()
      .describe('Restrict to one section, by slug from sas_categories.'),
    discountedOnly: z.boolean().default(false).describe("Browse SAS's discount shelf instead of searching."),
    sort: z
      .enum(['relevance', 'cheapest', 'dearest', 'popular'])
      .default('relevance')
      .describe("\"relevance\" is the shop's own ordering."),
    maxResults: z.number().int().min(1).max(60).default(12).describe('Products to return.'),
    page: z.number().int().min(1).default(1).describe('Page of results.'),
  }),
  execute: async ({ query, language: lang, categorySlug, discountedOnly, sort, maxResults, page }) => {
    if (!query && !discountedOnly && !categorySlug) {
      return {
        ok: false as const,
        error: 'Give a query, a categorySlug, or discountedOnly: true — the catalogue is too large to list whole.',
      }
    }

    const offset = (page - 1) * LIMIT
    const params = new URLSearchParams({ LIMIT: String(LIMIT), SORTBY: SORT[sort] })
    if (offset) params.set('offset', String(offset))

    
    const path = query
      ? `/search/?q=${encodeURIComponent(query)}&${params}`
      : `/catalog/${discountedOnly ? DISCOUNT_SECTION : (categorySlug as string)}/?${params}`

    try {
      const html = await fetchPage(SHOP, pageUrl(lang, path))
      const all = parseProductCards(html, lang)
      const products = all.slice(0, maxResults).map((p) => ({ ...p, currency: 'AMD' as const }))

      
      
      const offsets = parseOffsets(html)
      const pageCount = offsets.length ? Math.floor(Math.max(...offsets) / LIMIT) + 1 : 1

      return {
        ok: true as const,
        shop: SHOP,
        ...(query ? { query } : {}),
        ...(!query && discountedOnly ? { shelf: 'discounts' as const } : {}),
        ...(!query && categorySlug ? { categorySlug } : {}),
        page,
        atLeastPages: pageCount,
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

export const sasProduct = tool({
  description:
    'Full detail for specific SAS products: description, brand, country of origin, product code, how ' +
    'many are in stock, full-size photos and the exact price with any markdown. Takes the `url` values ' +
    'from a previous sas_search result — batch every one you need into a single call.',
  inputSchema: z.object({
    description: toolDescription,
    urls: z
      .array(z.string().url())
      .min(1)
      .max(8)
      .describe('Product URLs exactly as sas_search returned them.'),
    language,
    maxChars: z.number().int().min(200).max(4000).default(1200).describe('Budget for each description.'),
  }),
  execute: async ({ urls, language: lang, maxChars }) => {
    const wanted = [...new Set(urls)].filter((u) => u.startsWith(SITE))
    if (!wanted.length) {
      return { ok: false as const, error: `Only ${SITE} product URLs can be read by this tool` }
    }

    const settled = await Promise.all(
      wanted.map(async (url) => {
        try {
          const parsed = parseProductPage(await fetchPage(SHOP, url), lang, url)
          if (!parsed) return { url, error: 'SAS has no product at that URL' }
          return {
            product: {
              ...parsed,
              currency: 'AMD' as const,
              ...(parsed.description ? { description: budget(parsed.description, maxChars) } : {}),
            },
          }
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
    return { ok: true as const, shop: SHOP, currency: 'AMD', products, ...(failed.length ? { failed } : {}) }
  },
})

export const sasCategories = tool({
  description:
    "Browse SAS's aisles (sas.am). Returns the top-level sections with their sub-categories and the " +
    'slugs sas_search filters by — use it when a query alone is too broad, or to say what a section holds.',
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
      
      
      const html = await fetchPage(SHOP, pageUrl(lang, '/catalog/'))
      const all = parseCategories(html)
      const categories = parentSlug ? all.filter((c) => c.slug === parentSlug) : all

      if (parentSlug && !categories.length) {
        return { ok: false as const, error: `SAS has no section "${parentSlug}"` }
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

export const SAS_TOOL_NAMES = ['sas_search', 'sas_product', 'sas_categories'] as const

import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure, yerevanCity } from './client.js'
import { image, languageInput, pickName, pricing, productUrl, type Named } from './shape.js'


const SORT = { alphabetical: 1, cheapest: 2, dearest: 3 } as const

interface Row extends Named {
  id: number
  photo?: string | null
  price?: unknown
  discountedPrice?: unknown
  discountPercent?: unknown
  categoryName?: string | null
  brandId?: number
  isKilogram?: boolean
  productPricePerUnit?: number | null
  weightMeasure?: string | null
}








const UNIT_OF_MEASURE: Record<string, string> = { ML: 'L', G: 'kg', L: 'L', KG: 'kg' }

function perUnit(row: Row): { amount: number; unit: string } | undefined {
  const amount = row.productPricePerUnit
  const unit = UNIT_OF_MEASURE[(row.weightMeasure ?? '').toUpperCase()]
  if (!amount || !unit) return undefined
  return { amount: Math.round(amount * 100) / 100, unit }
}

interface SearchData {
  products?: Row[] | null
  list?: Row[] | null
  pageCount?: number
  itemCount?: number
}

export const yerevanCitySearch = tool({
  description:
    'Search the Yerevan City supermarket catalogue (yerevan-city.am) for groceries and household goods ' +
    'sold in Armenia, with live prices in Armenian dram and current discounts. ' +
    'Use this — not a web search — whenever someone asks what a product costs, whether it is stocked, ' +
    'or what is on sale in Armenia. Returns a compact list; follow up with yerevan_city_product for ' +
    'the description, ingredients and images of the few that matter.',
  inputSchema: z.object({
    description: toolDescription,
    query: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'What to look for. Matches Armenian, Russian and English product names, so an English word ' +
          'like "coffee" works. Omit only when browsing a category or the discount list.'
      ),
    language: z
      .enum(languageInput)
      .default('en')
      .describe('Language to report names in. The catalogue is not fully translated; missing names fall back.'),
    categoryId: z
      .number()
      .int()
      .optional()
      .describe('Restrict to one category. Get ids from yerevan_city_categories.'),
    discountedOnly: z.boolean().default(false).describe('Only products currently marked down.'),
    priceFrom: z.number().min(0).optional().describe('Minimum price in AMD.'),
    priceTo: z.number().min(0).optional().describe('Maximum price in AMD.'),
    sort: z
      .enum(['relevance', 'cheapest', 'dearest', 'alphabetical'])
      .default('relevance')
      .describe('"relevance" is the shop\'s own ordering for a query.'),
    maxResults: z.number().int().min(1).max(50).default(12).describe('Products to return.'),
    page: z.number().int().min(1).default(1).describe('Page of results, for paging past the first batch.'),
    imageSize: z
      .number()
      .int()
      .min(64)
      .max(1000)
      .default(250)
      .describe('Width/height in px for the thumbnail URL of each product.'),
  }),
  execute: async ({
    query,
    language,
    categoryId,
    discountedOnly,
    priceFrom,
    priceTo,
    sort,
    maxResults,
    page,
    imageSize,
  }) => {
    if (!query && !discountedOnly && categoryId === undefined) {
      return {
        ok: false as const,
        error: 'Give a query, a categoryId, or discountedOnly: true — the catalogue is too large to list whole.',
      }
    }

    const filter = {
      count: maxResults,
      page,
      search: query ?? null,
      categoryId,
      parentId: categoryId,
      priceFrom: priceFrom ?? null,
      priceTo: priceTo ?? null,
      countries: [],
      categories: [],
      brands: [],
      isDiscounted: discountedOnly,
      
      
      sortBy: sort === 'relevance' ? SORT.dearest : SORT[sort],
    }

    
    
    const [path, body] = query
      ? (['/Product/Search', filter] as const)
      : discountedOnly
        ? (['/Product/GetDiscounted', filter] as const)
        : (['/Category/GetCategoryWeb', filter] as const)

    try {
      const data = await yerevanCity<SearchData>(path, { method: 'POST', body, language })
      const rows = data.products ?? data.list ?? []

      const products = rows.map((row) => {
        const unitPrice = perUnit(row)
        return {
          id: row.id,
          name: pickName(row, language),
          ...pricing(row),
          ...(row.categoryName ? { category: row.categoryName } : {}),
          ...(row.isKilogram ? { soldByWeight: true } : {}),
          ...(unitPrice ? { pricePerUnit: unitPrice } : {}),
          url: productUrl(row.id),
          ...(image(row.photo, imageSize) ? { image: image(row.photo, imageSize) } : {}),
        }
      })

      const discounted = products.filter((p) => p.discountPercent !== undefined).length

      return {
        ok: true as const,
        ...(query ? { query } : {}),
        page,
        totalMatches: data.itemCount ?? products.length,
        pageCount: data.pageCount ?? 1,
        discountedInPage: discounted,
        currency: 'AMD',
        products,
      }
    } catch (err) {
      return failure(err)
    }
  },
})

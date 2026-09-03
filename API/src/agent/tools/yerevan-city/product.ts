import { tool } from 'ai'
import { z } from 'zod'
import { shortDate } from '../tavily/compact.js'
import { toolDescription } from '../description.js'
import { failure, yerevanCity, type Language } from './client.js'
import { amount, image, languageInput, pickName, pricing, productUrl, text, type Named } from './shape.js'

interface CategoryNode {
  catgoryId?: number
  categoryName?: string | null
  children?: CategoryNode[] | null
}

interface Details extends Named {
  id: number
  category?: string | null
  categoryId?: number
  categories?: CategoryNode | null
  price?: unknown
  discountedPrice?: unknown
  productDiscount?: { discountPercent?: number; start?: string; end?: string } | null
  photo?: string | null
  additionalPhotos?: string[] | null
  description?: string | null
  ingredients?: string | null
  usageMethod?: string | null
  guide?: string | null
  stateOfTaste?: string | null
  stateOfFlavor?: string | null
  nutritions?: Array<{ name?: string | null; value?: string | number | null; unit?: string | null }> | null
  country?: string | null
  brandName?: string | null
  manufacturer?: string | null
  barcodes?: Array<{ barcode?: string }> | null
  weight?: number | null
  isKilogram?: boolean
  minimumWeight?: number | null
  weightStep?: number | null
  isOnline?: boolean
  productTags?: Array<{ name?: string | null }> | null
  videoLink?: string | null
}

interface RelatedRow extends Named {
  id: number
  price?: unknown
  discountedPrice?: unknown
  discountPercent?: unknown
}


function breadcrumb(node: CategoryNode | null | undefined): string[] {
  const path: string[] = []
  let current = node
  while (current) {
    if (current.categoryName) path.push(current.categoryName)
    current = current.children?.[0]
  }
  return path
}

async function related(id: number, language: Language) {
  const data = await yerevanCity<{ products?: RelatedRow[] | null }>(`/Product/GetRelated/${id}`, { language })
  return (data.products ?? []).slice(0, 8).map((row) => ({
    id: row.id,
    name: pickName(row, language),
    ...pricing(row),
    url: productUrl(row.id),
  }))
}

async function detail(id: number, language: Language, maxChars: number, imageSize: number) {
  const d = await yerevanCity<Details>(`/Product/Get/${id}`, { language })

  const photos = [d.photo, ...(d.additionalPhotos ?? [])]
    .filter((p): p is string => Boolean(p))
    .map((p) => image(p, imageSize) as string)

  const nutrition = (d.nutritions ?? [])
    .filter((n) => n.name && n.value !== null && n.value !== undefined)
    .map((n) => `${n.name}: ${n.value}${n.unit ? ` ${n.unit}` : ''}`)

  const offer = d.productDiscount
  const tags = (d.productTags ?? []).map((t) => t.name).filter(Boolean)

  return {
    id: d.id,
    name: pickName(d, language),
    ...pricing({ ...d, discountPercent: offer?.discountPercent }),
    ...(offer?.start || offer?.end
      ? { discountRuns: { from: shortDate(offer.start), to: shortDate(offer.end) } }
      : {}),
    url: productUrl(d.id),
    ...(breadcrumb(d.categories).length ? { categoryPath: breadcrumb(d.categories) } : {}),
    ...(d.brandName ? { brand: d.brandName } : {}),
    ...(d.manufacturer ? { manufacturer: d.manufacturer } : {}),
    ...(d.country ? { country: d.country } : {}),
    ...(text(d.description, maxChars) ? { description: text(d.description, maxChars) } : {}),
    ...(text(d.ingredients, maxChars) ? { ingredients: text(d.ingredients, maxChars) } : {}),
    ...(text(d.usageMethod ?? d.guide, maxChars) ? { howToUse: text(d.usageMethod ?? d.guide, maxChars) } : {}),
    ...(text(d.stateOfTaste ?? d.stateOfFlavor, 400) ? { taste: text(d.stateOfTaste ?? d.stateOfFlavor, 400) } : {}),
    ...(nutrition.length ? { nutrition } : {}),
    ...(d.isKilogram
      ? { soldByWeight: { minimumGrams: d.minimumWeight ?? undefined, stepGrams: d.weightStep ?? undefined } }
      : amount(d.weight)
        ? { weightKg: amount(d.weight) }
        : {}),
    ...(d.barcodes?.length ? { barcodes: d.barcodes.map((b) => b.barcode).filter(Boolean) } : {}),
    ...(tags.length ? { tags } : {}),
    ...(d.isOnline === false ? { availableOnline: false } : {}),
    ...(photos.length ? { images: photos } : {}),
    ...(d.videoLink ? { video: d.videoLink } : {}),
  }
}

export const yerevanCityProduct = tool({
  description:
    'Full detail for specific Yerevan City products: description, ingredients, nutrition, country of ' +
    'origin, brand, barcodes, photo URLs, and the exact price with the dates any discount runs between. ' +
    'Takes ids from yerevan_city_search — batch every id you need into one call.',
  inputSchema: z.object({
    description: toolDescription,
    ids: z
      .array(z.number().int())
      .min(1)
      .max(10)
      .describe('Product ids from a previous yerevan_city_search result.'),
    language: z.enum(languageInput).default('en').describe('Language to report names and text in.'),
    includeRelated: z
      .boolean()
      .default(false)
      .describe('Also list what the shop suggests alongside each product. Use for "what else is there" questions.'),
    maxChars: z
      .number()
      .int()
      .min(200)
      .max(8000)
      .default(1500)
      .describe('Budget per free-text field (description, ingredients, usage) on each product.'),
    imageSize: z
      .number()
      .int()
      .min(64)
      .max(1000)
      .default(600)
      .describe('Width/height in px for the returned image URLs.'),
  }),
  execute: async ({ ids, language, includeRelated, maxChars, imageSize }) => {
    const wanted = [...new Set(ids)]

    const settled = await Promise.all(
      wanted.map(async (id) => {
        try {
          const product = await detail(id, language, maxChars, imageSize)
          if (!includeRelated) return { product }
          
          const alsoConsider = await related(id, language).catch(() => [])
          return { product: { ...product, ...(alsoConsider.length ? { alsoConsider } : {}) } }
        } catch (err) {
          return { id, error: failure(err).error }
        }
      })
    )

    const products = settled.flatMap((s) => ('product' in s ? [s.product] : []))
    const failed = settled.flatMap((s) => ('error' in s ? [{ id: s.id, error: s.error }] : []))

    if (!products.length) {
      return { ok: false as const, error: failed[0]?.error ?? 'No products were returned' }
    }

    return {
      ok: true as const,
      currency: 'AMD',
      products,
      ...(failed.length ? { failed } : {}),
    }
  },
})

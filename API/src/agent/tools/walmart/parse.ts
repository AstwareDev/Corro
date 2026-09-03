import { ShopError } from '../shops/scrape.js'

export const SITE = 'https://www.walmart.com'
export const SHOP = 'Walmart'








export function parseNextData(html: string): unknown {
  const match = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!match) throw new ShopError(`${SHOP} page did not carry its data script`)
  try {
    return JSON.parse(match[1])
  } catch {
    throw new ShopError(`${SHOP} page's data script was not valid JSON`)
  }
}

interface PriceLine {
  lineType: string
  values: Array<{ key: string; value: string }>
}

function lineValue(lines: PriceLine[] | undefined, type: string, key: string): number | undefined {
  const line = lines?.find((l) => l.lineType === type)
  const raw = line?.values.find((v) => v.key === key)?.value
  const n = raw === undefined ? undefined : Number(raw.replace(/[^\d.]/g, ''))
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined
}








function priceFromLines(priceInfo: unknown): { price?: number; wasPrice?: number; pricePerUnit?: string } {
  const lines = (priceInfo as { priceDetails?: { priceLines?: PriceLine[] } } | undefined)?.priceDetails
    ?.priceLines
  const current = lineValue(lines, 'CURRENT_PRICE', 'PRICE') ?? lineValue(lines, 'DISCOUNTED_PRICE', 'PRICE')
  const was = lineValue(lines, 'COMPARISON', 'WAS_PRICE')
  const rangeLow = lineValue(lines, 'OPTIONS_RANGE', 'LOW_PRICE')
  const unit = lines?.find((l) => l.lineType === 'UNIT_PRICE')?.values.find((v) => v.key === 'UNIT_PRICE')?.value

  return {
    price: current ?? rangeLow,
    ...(was !== undefined && was !== current ? { wasPrice: was } : {}),
    ...(unit ? { pricePerUnit: unit } : {}),
  }
}

export interface WalmartProduct {
  id: string
  name: string
  price?: number
  wasPrice?: number
  discountPercent?: number
  pricePerUnit?: string
  rating?: number
  reviewCount?: number
  brand?: string
  category?: string
  sponsored?: boolean
  available?: string
  url: string
  image?: string
}

function discountPercent(price?: number, wasPrice?: number): number | undefined {
  if (!price || !wasPrice || wasPrice <= price) return undefined
  return Math.round(((wasPrice - price) / wasPrice) * 100)
}

interface SearchItem {
  usItemId?: string
  id?: string
  name?: string
  priceInfo?: unknown
  averageRating?: number
  numberOfReviews?: number
  brand?: string | null
  category?: { categoryPath?: string }
  sponsoredProduct?: boolean
  availabilityStatusDisplayValue?: string
  imageInfo?: { thumbnailUrl?: string }
  canonicalUrl?: string
}



function lastCategory(path: string | undefined): string | undefined {
  return path?.split('/').filter(Boolean).pop()
}

export function parseSearchResult(data: unknown): {
  products: WalmartProduct[]
  totalMatches?: number
  pageCount?: number
} {
  const searchResult = (
    data as {
      props?: { pageProps?: { initialData?: { searchResult?: Record<string, unknown> } } }
    }
  ).props?.pageProps?.initialData?.searchResult
  if (!searchResult) return { products: [] }

  const stacks = (searchResult.itemStacks as Array<{ items?: SearchItem[] }> | undefined) ?? []
  const seen = new Set<string>()
  const products: WalmartProduct[] = []

  for (const stack of stacks) {
    for (const item of stack.items ?? []) {
      const id = item.usItemId ?? item.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      if (!item.name) continue

      const { price, wasPrice, pricePerUnit } = priceFromLines(item.priceInfo)

      products.push({
        id,
        name: item.sponsoredProduct ? item.name.replace(/^Sponsored Ad - /, '') : item.name,
        ...(price !== undefined ? { price } : {}),
        ...(wasPrice !== undefined ? { wasPrice } : {}),
        ...(discountPercent(price, wasPrice) !== undefined
          ? { discountPercent: discountPercent(price, wasPrice) }
          : {}),
        ...(pricePerUnit ? { pricePerUnit } : {}),
        ...(item.averageRating ? { rating: item.averageRating } : {}),
        ...(item.numberOfReviews ? { reviewCount: item.numberOfReviews } : {}),
        ...(item.brand ? { brand: item.brand } : {}),
        ...(lastCategory(item.category?.categoryPath) ? { category: lastCategory(item.category?.categoryPath) } : {}),
        ...(item.sponsoredProduct ? { sponsored: true } : {}),
        ...(item.availabilityStatusDisplayValue && item.availabilityStatusDisplayValue !== 'In stock'
          ? { available: item.availabilityStatusDisplayValue }
          : {}),
        url: `${SITE}${item.canonicalUrl ?? `/ip/${id}`}`,
        ...(item.imageInfo?.thumbnailUrl ? { image: item.imageInfo.thumbnailUrl } : {}),
      })
    }
  }

  const pageCount = (searchResult.paginationV2 as { maxPage?: number } | undefined)?.maxPage

  return {
    products,
    totalMatches: typeof searchResult.count === 'number' ? searchResult.count : undefined,
    ...(pageCount ? { pageCount } : {}),
  }
}

interface PdpPrice {
  currentPrice?: { price?: number }
  wasPrice?: { price?: number }
  unitPrice?: { priceString?: string }
}

interface PdpProduct {
  usItemId?: string
  id?: string
  name?: string
  priceInfo?: PdpPrice
  averageRating?: number
  numberOfReviews?: number
  brand?: string
  shortDescription?: string
  category?: { path?: Array<{ name?: string }> }
  availabilityStatusV2?: { value?: string; display?: string }
  upc?: string
  sellerName?: string
  imageInfo?: { thumbnailUrl?: string; allImages?: Array<{ url?: string }> }
  canonicalUrl?: string
}

export interface WalmartDetail extends WalmartProduct {
  categoryPath?: string[]
  description?: string
  upc?: string
  sellerName?: string
  images?: string[]
}

export function parseProductData(data: unknown, url: string): WalmartDetail | undefined {
  const product = (
    data as { props?: { pageProps?: { initialData?: { data?: { product?: PdpProduct } } } } }
  ).props?.pageProps?.initialData?.data?.product
  if (!product?.name) return undefined

  const id = product.usItemId ?? product.id ?? ''
  const price = product.priceInfo?.currentPrice?.price
  const wasPrice = product.priceInfo?.wasPrice?.price
  const categoryPath = (product.category?.path ?? []).map((p) => p.name).filter((n): n is string => Boolean(n))
  const images = [
    ...(product.imageInfo?.thumbnailUrl ? [product.imageInfo.thumbnailUrl] : []),
    ...(product.imageInfo?.allImages ?? []).map((i) => i.url).filter((u): u is string => Boolean(u)),
  ]

  return {
    id,
    name: product.name,
    ...(price !== undefined ? { price } : {}),
    ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
    ...(discountPercent(price, wasPrice) !== undefined
      ? { discountPercent: discountPercent(price, wasPrice) }
      : {}),
    ...(product.priceInfo?.unitPrice?.priceString ? { pricePerUnit: product.priceInfo.unitPrice.priceString } : {}),
    ...(product.averageRating ? { rating: product.averageRating } : {}),
    ...(product.numberOfReviews ? { reviewCount: product.numberOfReviews } : {}),
    ...(product.brand ? { brand: product.brand } : {}),
    ...(categoryPath.length ? { categoryPath, category: categoryPath[categoryPath.length - 1] } : {}),
    ...(product.shortDescription ? { description: stripTags(product.shortDescription) } : {}),
    ...(product.availabilityStatusV2?.value && product.availabilityStatusV2.value !== 'IN_STOCK'
      ? { available: product.availabilityStatusV2.display ?? product.availabilityStatusV2.value }
      : {}),
    ...(product.upc ? { upc: product.upc } : {}),
    ...(product.sellerName ? { sellerName: product.sellerName } : {}),
    url,
    ...(images.length ? { image: images[0], images } : {}),
  }
}



function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

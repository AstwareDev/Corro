import { budget, clean, decode, pick } from '../shops/scrape.js'

export const SITE = 'https://www.amazon.com'
export const SHOP = 'Amazon'

export function productUrl(asin: string): string {
  return `${SITE}/dp/${asin}`
}

export interface AmazonProduct {
  id: string
  name: string
  price?: number
  wasPrice?: number
  discountPercent?: number
  rating?: number
  reviewCount?: number
  sponsored?: boolean
  url: string
  image?: string
}

const CARD_MARKER = 'data-component-type="s-search-result"'





function searchCards(html: string): Array<{ asin: string; html: string }> {
  const starts = [...html.matchAll(/data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"/g)]
  const out: Array<{ asin: string; html: string }> = []
  const seen = new Set<string>()

  for (let i = 0; i < starts.length; i++) {
    const asin = starts[i][1]
    if (seen.has(asin)) continue
    seen.add(asin)
    const from = starts[i].index
    const to = i + 1 < starts.length ? starts[i + 1].index : html.length
    out.push({ asin, html: html.slice(from, to) })
  }
  return out
}

function wholeFractionPrice(html: string): number | undefined {
  const match = /a-price-whole">([\d,]+)<.*?a-price-fraction">(\d+)/s.exec(html)
  if (!match) return undefined
  const value = Number(`${match[1].replace(/,/g, '')}.${match[2]}`)
  return Number.isFinite(value) ? value : undefined
}

function discountPercent(price?: number, wasPrice?: number): number | undefined {
  if (!price || !wasPrice || wasPrice <= price) return undefined
  return Math.round(((wasPrice - price) / wasPrice) * 100)
}

export function parseSearchResults(html: string): AmazonProduct[] {
  const out: AmazonProduct[] = []

  for (const { asin, html: card } of searchCards(html)) {
    const rawTitle = pick(card, /<h2[^>]*aria-label="([^"]+)"/)
    if (!rawTitle) continue
    const sponsored = /Sponsored Ad - /.test(rawTitle)
    const name = clean(rawTitle).replace(/^Sponsored Ad - /, '')

    const price = wholeFractionPrice(card)
    
    
    
    const wasBlock = pick(card, /class="a-price a-text-price[^"]*"[^>]*>(.*?)<\/span><\/span>/)
    const wasPrice = wasBlock ? wholeFractionPrice(wasBlock) : undefined

    const rating = pick(card, /a-icon-alt">([\d.]+) out of 5/)
    const reviewCount = pick(card, /aria-label="([\d,]+) ratings?"/)
    const image = pick(card, /class="s-image"[^>]*src="([^"]+)"/)

    out.push({
      id: asin,
      name,
      ...(price !== undefined ? { price } : {}),
      ...(wasPrice !== undefined ? { wasPrice } : {}),
      ...(discountPercent(price, wasPrice) !== undefined
        ? { discountPercent: discountPercent(price, wasPrice) }
        : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(reviewCount ? { reviewCount: Number(reviewCount.replace(/,/g, '')) } : {}),
      ...(sponsored ? { sponsored: true } : {}),
      
      
      url: productUrl(asin),
      ...(image ? { image } : {}),
    })
  }

  return out
}

export interface AmazonDetail extends AmazonProduct {
  brand?: string
  categoryPath?: string[]
  description?: string
  available?: string
  images?: string[]
}










function detailPricing(html: string): { price?: number; wasPrice?: number; discountPercent?: number } {
  const a11y = pick(html, /id="apex-pricetopay-accessibility-label"[^>]*>\s*([^<]+?)\s*</)
  const listLabel = pick(html, /apex-basisprice-offscreen-label">\s*List Price:\s*([^<]+?)\s*</)

  if (a11y) {
    const priceMatch = /\$?([\d,.]+)/.exec(a11y)
    const percentMatch = /(\d+)\s*percent/.exec(a11y)
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : undefined
    const wasPrice = listLabel ? Number(listLabel.replace(/[^\d.]/g, '')) : undefined
    return {
      ...(price !== undefined && Number.isFinite(price) ? { price } : {}),
      ...(wasPrice !== undefined && Number.isFinite(wasPrice) ? { wasPrice } : {}),
      ...(percentMatch ? { discountPercent: Number(percentMatch[1]) } : {}),
    }
  }

  const simple = pick(html, /id="corePriceDisplay_desktop_feature_div".*?class="a-offscreen">([^<]+)</)
  const price = simple ? Number(simple.replace(/[^\d.]/g, '')) : wholeFractionPrice(html)
  return price !== undefined && Number.isFinite(price) ? { price } : {}
}

export function parseProductPage(html: string, asin: string): AmazonDetail | undefined {
  const name = pick(html, /id="productTitle"[^>]*>\s*([^<]+?)\s*</)
  if (!name) return undefined

  const rating = pick(html, /class="a-icon-alt">([\d.]+) out of 5 stars/)
  const reviewCount = pick(html, /id="acrCustomerReviewText"[^>]*>\(([\d,]+)\)/)
  
  
  
  
  
  
  const rawBrand = pick(html, /[\s<]id="bylineInfo"[^>]*>(.*?)<\/a>/)
  
  
  const brand = rawBrand ? clean(rawBrand).replace(/^(?:Visit the |Brand:\s*)/, '').replace(/ Store$/, '') : undefined
  const breadcrumb = pick(html, /id="wayfinding-breadcrumbs_feature_div".*?<\/ul>/)
  const categoryPath = breadcrumb
    ? [...breadcrumb.matchAll(/class="a-link-normal a-color-tertiary"[^>]*>\s*([^<]+?)\s*</g)].map((m) => clean(m[1]))
    : undefined

  const bulletsBlock = pick(html, /id="feature-bullets"[^>]*>(.*?)<\/ul>/)
  const bullets = bulletsBlock
    ? [...bulletsBlock.matchAll(/class="a-list-item[^"]*">([^<]+)</g)].map((m) => clean(decode(m[1]))).filter(Boolean)
    : []

  const dynImage = pick(html, /id="landingImage"[^>]*data-a-dynamic-image="([^"]+)"/)
  let images: string[] = []
  if (dynImage) {
    try {
      images = Object.keys(JSON.parse(decode(dynImage)) as Record<string, unknown>)
    } catch {
      images = []
    }
  }

  const available = pick(html, /id="availability"[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/)

  return {
    id: asin,
    name: clean(name),
    ...detailPricing(html),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(reviewCount ? { reviewCount: Number(reviewCount.replace(/,/g, '')) } : {}),
    ...(brand ? { brand } : {}),
    ...(categoryPath?.length ? { categoryPath } : {}),
    ...(bullets.length ? { description: budget(bullets.join('\n'), 4000) } : {}),
    ...(available && !/^in stock$/i.test(available) ? { available: clean(available) } : {}),
    url: productUrl(asin),
    ...(images.length ? { image: images[0], images } : {}),
  }
}

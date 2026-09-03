import {
  cards,
  clean,
  decode,
  divBody,
  money,
  percent,
  pick,
  pickText,
  richText,
  unitPrice,
  type ShopLanguage,
} from '../shops/scrape.js'

export const SITE = 'https://parma.am'
export const SHOP = 'Parma'

export function pageUrl(language: ShopLanguage, path: string): string {
  return `${SITE}/${language}${path}`
}

export interface ParmaProduct {
  id: number
  slug: string
  name: string
  price?: number
  wasPrice?: number
  discountPercent?: number
  discountRuns?: { text: string }
  pricePerUnit?: { amount: number; unit: string }
  url: string
  image?: string
}

const CARD_MARKER = 'class="product_item product_item_block'







function idFromSlug(slug: string): number | undefined {
  const match = /_(\d+)$/.exec(slug)
  return match ? Number(match[1]) : undefined
}





function readUnitPrice(card: string) {
  const block = pick(card, /unitCoefficientInfoBlock">(.*?)<\/div>/)
  if (!block) return undefined
  const match = /<\/b>\s*([\d.,\s]+)\s*֏\s*\/\s*1\s*([^<]+)/.exec(decode(block))
  return match ? unitPrice(match[1], match[2]) : undefined
}

export function parseProductCards(html: string, language: ShopLanguage): ParmaProduct[] {
  const out: ParmaProduct[] = []

  for (const card of cards(html, CARD_MARKER)) {
    const slug = pick(card, /\/(?:en|hy|ru)\/product\/product\?slug=([^"'&]+)/)
    if (!slug) continue

    const decodedSlug = decodeURIComponent(slug)
    const id = idFromSlug(decodedSlug)
    if (id === undefined) continue

    const name = pickText(card, /class="item_name"[^>]*><span>(.*?)<\/span>/)
    if (!name) continue

    
    
    const discounted = /^class="product_item product_item_block discount/.test(card)
    const price = money(pick(card, /class="product_price" data-price="([\d.]+)"/))
    const wasPrice = discounted
      ? money(pick(card, /class="item_price common_price discount_item">\s*<div class="full-price">\s*<span>([\d.,\s]+)<\/span>/))
      : undefined

    const runs = pickText(card, /class="discount-container">([^<]*)</)

    out.push({
      id,
      slug: decodedSlug,
      name,
      ...(price !== undefined ? { price } : {}),
      ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
      ...(discounted ? { discountPercent: percent(pick(card, /class="d_count"\s*>\s*([^<]*)</)) } : {}),
      ...(runs ? { discountRuns: { text: runs } } : {}),
      ...(readUnitPrice(card) ? { pricePerUnit: readUnitPrice(card) } : {}),
      url: pageUrl(language, `/product/product?slug=${slug}`),
      ...(pick(card, /<img src="(https:\/\/static\.parma\.am\/[^"]+)"/)
        ? { image: pick(card, /<img src="(https:\/\/static\.parma\.am\/[^"]+)"/) }
        : {}),
    })
  }

  return out
}


export function parsePageCount(html: string): number | undefined {
  const pages = [...html.matchAll(/page=(\d+)&amp;per-page=/g)].map((m) => Number(m[1]))
  return pages.length ? Math.max(...pages) : undefined
}

export interface ParmaDetail extends ParmaProduct {
  categoryPath?: string[]
  brand?: string
  country?: string
  manufacturer?: string
  description?: string
  images?: string[]
}








function facts(html: string): string[] {
  return [...html.matchAll(/class="[^"]*description-item"[^>]*>(.*?)<\/p>/g)].map((m) => {
    const parts = [...m[1].matchAll(/<(?:span|a)[^>]*>(.*?)<\/(?:span|a)>/g)].map((p) => clean(p[1]))
    return parts.length > 1 ? parts.slice(1).join(' ').trim() : ''
  })
}

export function parseProductPage(html: string, language: ShopLanguage, slug: string): ParmaDetail | undefined {
  const id = idFromSlug(slug)
  const name = pickText(html, /class="product-inner-title">(?:<span[^>]*>[^<]*<\/span>)?(.*?)<\/h4>/)
  if (id === undefined || !name) return undefined

  const trail = [...html.matchAll(/class="nav-link[^"]*" href="\/(?:en|hy|ru)\/product\/category\?slug=[^"]*">\s*([^<]+?)\s*<\/a>/g)].map(
    (m) => clean(m[1])
  )

  const images = [...html.matchAll(/class="fancybox" data-fancybox="gallery"[^>]*>/g)].length
    ? [...html.matchAll(/<a href="(https:\/\/static\.parma\.am\/origin\/product\/[^"]+)" class="fancybox"/g)].map((m) => m[1])
    : []

  const [manufacturer, country, brand] = facts(html)
  const price = money(pick(html, /class="product_price" data-price="([\d.]+)"/))
  
  
  const wasPrice = money(pick(html, /<del>([\d.,\s]+)\s*֏<\/del>/))
  const runs = pickText(html, /class="discountInfoBlock">([^<]*)</)

  
  
  
  
  const body = divBody(html, /class="ingredients[^"]*"[^>]*>/)
  const description = richText(body)
    .split('\n')
    .filter((line) => !runs || line.trim() !== runs.trim())
    .join('\n')
    .trim()

  return {
    id,
    slug,
    name,
    ...(price !== undefined ? { price } : {}),
    ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
    ...(runs ? { discountRuns: { text: runs } } : {}),
    ...(percent(pick(html, /class="d_count">([^<]*)</)) !== undefined
      ? { discountPercent: percent(pick(html, /class="d_count">([^<]*)</)) }
      : {}),
    ...(readUnitPrice(html) ? { pricePerUnit: readUnitPrice(html) } : {}),
    ...(trail.length ? { categoryPath: trail } : {}),
    ...(brand ? { brand } : {}),
    ...(country ? { country } : {}),
    ...(manufacturer ? { manufacturer } : {}),
    ...(description ? { description } : {}),
    ...(images.length ? { images } : {}),
    url: pageUrl(language, `/product/product?slug=${encodeURIComponent(slug)}`),
  }
}

export interface ParmaCategory {
  slug: string
  name: string
  children?: Array<{ slug: string; name: string }>
}





export function parseCategories(html: string): ParmaCategory[] {
  const out: ParmaCategory[] = []

  for (const block of cards(html, 'class="has_drop_child drop"')) {
    const slug = pick(block, /href="\/(?:en|hy|ru)\/product\/category\?slug=([^"]+)"/)
    const name = pickText(block, /class="menu_item_name[^"]*"><img[^>]*><span>(.*?)<\/span>/)
    if (!slug || !name) continue

    const inner = block.slice(block.indexOf('sidebar_dropdown_content'))
    const children = [...inner.matchAll(/href="\/(?:en|hy|ru)\/product\/category\?slug=([^"]+)"[^>]*><img[^>]*><span>(.*?)<\/span>/g)]
      .map((m) => ({ slug: m[1], name: clean(m[2]) }))
      .filter((c) => c.name && c.slug !== slug)

    out.push({ slug, name, ...(children.length ? { children } : {}) })
  }

  return out
}

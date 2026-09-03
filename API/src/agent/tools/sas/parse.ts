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

export const SITE = 'https://www.sas.am'
export const SHOP = 'SAS'


export function prefix(language: ShopLanguage): string {
  return language === 'hy' ? '' : `/${language}`
}

export function pageUrl(language: ShopLanguage, path: string): string {
  return `${SITE}${prefix(language)}${path}`
}

function absolute(path: string | undefined): string | undefined {
  if (!path) return undefined
  return path.startsWith('http') ? path : `${SITE}${path}`
}

export interface SasProduct {
  id: number
  name: string
  price?: number
  wasPrice?: number
  discountPercent?: number
  discountRuns?: { text: string }
  pricePerUnit?: { amount: number; unit: string }
  packSize?: string
  ageRestricted?: boolean
  url: string
  image?: string
}

const CARD_MARKER = 'class="product-wrap js-product-wrap"'






function readImage(html: string, size: 'middle' | 'big'): string | undefined {
  const raw = pick(html, /:sources="([^"]+)"/)
  if (!raw) return undefined
  try {
    const sources = JSON.parse(decode(raw)) as Record<string, string>
    return absolute(sources[size] ?? sources.middle ?? sources.big)
  } catch {
    return undefined
  }
}

function readPrice(html: string, which: 'new' | 'old'): number | undefined {
  return money(pick(html, new RegExp(`class="price__${which}[^"]*">\\s*<span class="price__text">([^<]*)`)))
}

function readUnitPrice(html: string) {
  const match = /class="card__kg-price">\s*([\d.,\s&;a-z]*?)\s*<span class="price__currency">\s*[^\/]*\/\s*1\s*([^<]+)</.exec(html)
  return match ? unitPrice(match[1], match[2]) : undefined
}

export function parseProductCards(html: string, language: ShopLanguage): SasProduct[] {
  const out: SasProduct[] = []

  for (const card of cards(html, CARD_MARKER)) {
    const id = Number(pick(card, /name="id" value="(\d+)"/))
    const href = pick(card, /class="product__cover-link" href="([^"]+)"/)
    const name = pickText(card, /class="product__name hidden-sm">([^<]*)</)
    if (!Number.isFinite(id) || !href || !name) continue

    const price = readPrice(card, 'new')
    const wasPrice = readPrice(card, 'old')
    
    const informer = pick(card, /class="informer js-informer"[^>]*>(.*?)<span class="informer__dropdown">/)

    out.push({
      id,
      name,
      ...(price !== undefined ? { price } : {}),
      ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
      ...(percent(informer) !== undefined ? { discountPercent: percent(informer) } : {}),
      ...(pickText(card, /data-informer-text="([^"]*)"/)
        ? { discountRuns: { text: pickText(card, /data-informer-text="([^"]*)"/) as string } }
        : {}),
      ...(readUnitPrice(card) ? { pricePerUnit: readUnitPrice(card) } : {}),
      ...(pickText(card, /class="product__unit">([^<]*)</) ? { packSize: pickText(card, /class="product__unit">([^<]*)</) } : {}),
      ...(/data-for_adults="/.test(card) ? { ageRestricted: true } : {}),
      url: absolute(href) as string,
      ...(readImage(card, 'middle') ? { image: readImage(card, 'middle') } : {}),
    })
  }

  return out
}


export function parseOffsets(html: string): number[] {
  return [...html.matchAll(/class="pagination__link[^"]*" href="[^"]*[?&]offset=(\d+)"/g)].map((m) => Number(m[1]))
}

export interface SasDetail extends SasProduct {
  categoryPath?: string[]
  brand?: string
  country?: string
  code?: string
  available?: string
  description?: string
  details?: string[]
  images?: string[]
}

export function parseProductPage(html: string, language: ShopLanguage, url: string): SasDetail | undefined {
  const id = Number(pickText(html, /class="card__id-value">([^<]*)</))
  const name = pickText(html, /class="card__title">(.*?)<\/h1>/)
  if (!Number.isFinite(id) || !name) return undefined

  const trail = [...html.matchAll(/class="breadcrumbs__link" href="[^"]*" title="[^"]*">\s*([^<]+?)\s*<\/a>/g)]
    .map((m) => clean(m[1]))
    .slice(2) 

  
  
  const pairs = [...html.matchAll(
    /class="card__detail-item-title">([^<]*)<\/div>\s*<div class="card__detail-item-space"><\/div>\s*<div class="card__detail-item-value">([^<]*)</g
  )].map(([, label, value]) => ({ label: clean(label), value: clean(value) }))

  
  
  const images = [...html.matchAll(/class="card__product-photo" src="([^"]+)"/g)]
    .map((m) => absolute(m[1]))
    .filter((u): u is string => Boolean(u))

  const price = readPrice(html, 'new')
  const wasPrice = readPrice(html, 'old')
  const country = pairs.find((p) => /country|страна|երկիր/i.test(p.label))?.value
  
  
  const brand =
    pairs.find((p) => /brand|бренд|ապրանքանիշ/i.test(p.label))?.value ??
    pickText(html, /class="card__brand-link" href="[^"]*">\s*([^<]+?)\s*<\/a>/)

  
  
  
  const description = richText(
    divBody(html, /class="text-guide card__subtitle[^"]*"[^>]*>/)
  )

  return {
    id,
    name,
    ...(price !== undefined ? { price } : {}),
    ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
    ...(readUnitPrice(html) ? { pricePerUnit: readUnitPrice(html) } : {}),
    ...(pickText(html, /class="price__unit">\/?([^<]*)</) ? { packSize: pickText(html, /class="price__unit">\/?([^<]*)</) } : {}),
    ...(trail.length ? { categoryPath: trail } : {}),
    ...(brand ? { brand } : {}),
    ...(country ? { country } : {}),
    ...(pickText(html, /class="card__code-value">([^<]*)</) ? { code: pickText(html, /class="card__code-value">([^<]*)</) } : {}),
    ...(pickText(html, /class="card__availability-text">([^<]*)</)
      ? { available: pickText(html, /class="card__availability-text">([^<]*)</) }
      : {}),
    ...(description ? { description } : {}),
    ...(pairs.length ? { details: pairs.filter((p) => p.value).map((p) => `${p.label}: ${p.value}`) } : {}),
    ...(new Set(images).size ? { images: [...new Set(images)] } : {}),
    url,
  }
}

export interface SasCategory {
  slug: string
  name: string
  children?: Array<{ slug: string; name: string }>
}

function slugOf(href: string): string | undefined {
  return /\/catalog\/([^/"]+)\//.exec(href)?.[1]
}





export function parseCategories(html: string): SasCategory[] {
  const out: SasCategory[] = []

  for (const block of cards(html, 'class="main-menu__item-level-1')) {
    const href = pick(block, /class="main-menu__link-level-1[^"]*" href="([^"]+)"/)
    const name = pickText(block, /class="main-menu__link-level-1-text">([^<]*)</)
    const slug = href ? slugOf(href) : undefined
    if (!slug || !name) continue

    const children = [...block.matchAll(/class="main-menu__link-level-2[^"]*" href="([^"]+)"[^>]*>\s*(?:<img[^>]*>)?\s*<span[^>]*>([^<]*)</g)]
      .map((m) => ({ slug: slugOf(m[1]) ?? '', name: clean(m[2]) }))
      .filter((c) => c.slug && c.name && c.slug !== slug)

    out.push({ slug, name, ...(children.length ? { children } : {}) })
  }

  return out
}

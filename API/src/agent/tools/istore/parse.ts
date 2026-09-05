import { cards, clean, money, pick, pickText } from '../shops/scrape.js'

export const SITE = 'https://istore.am'
export const SHOP = 'iStore'

export function searchUrl(query: string): string {
  return `${SITE}/search?q=${encodeURIComponent(query)}`
}

export function categoryUrl(slug: string): string {
  return `${SITE}/filter/${slug}`
}

export function saleUrl(): string {
  return `${SITE}/see_all/action`
}

export function productUrl(id: number): string {
  return `${SITE}/product/${id}`
}

function absoluteImage(src: string): string {
  return src.startsWith('http') ? src : `${SITE}${src.startsWith('/') ? '' : '/'}${src}`
}

export interface IstoreProduct {
  id: number
  name: string
  code?: string
  price?: number
  wasPrice?: number
  discountPercent?: number
  category?: string
  categoryPath?: string[]
  details?: string[]
  available?: string
  url: string
  image?: string
  images?: string[]
}

const CARD_MARKER = 'class="shop-list product-item"'

function discount(wasPrice: number | undefined, price: number | undefined): number | undefined {
  return wasPrice !== undefined && price !== undefined && wasPrice > price
    ? Math.round(((wasPrice - price) / wasPrice) * 100)
    : undefined
}

function parseCard(card: string): IstoreProduct | undefined {
  const id = Number(pick(card, /\/product\/(\d+)/))
  if (!Number.isFinite(id)) return undefined

  const name = pickText(card, /class="product-title[^"]*">\s*<a[^>]*>([\s\S]*?)<\/a>/)
  if (!name) return undefined

  const code = pick(card, /Product code[^\w]*([\w/.]+)/)
  const image = pick(card, /<img[^>]*src="([^"]+)"/)
  const wasPrice = money(pickText(card, /class="credit-price[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/))
  const price = money(pickText(card, /class="pro-price[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/))
  const availability = /available-info\s+(is-available|not-available)/.exec(card)?.[1]

  return {
    id,
    name,
    ...(code ? { code } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
    ...(discount(wasPrice, price) !== undefined ? { discountPercent: discount(wasPrice, price) } : {}),
    ...(availability ? { available: availability === 'is-available' ? 'In stock' : 'Preorder' } : {}),
    url: productUrl(id),
    ...(image ? { image: absoluteImage(image) } : {}),
  }
}

export function parseProductCards(html: string): IstoreProduct[] {
  const out: IstoreProduct[] = []
  const seen = new Set<number>()
  for (const card of cards(html, CARD_MARKER)) {
    const product = parseCard(card)
    if (product && !seen.has(product.id)) {
      seen.add(product.id)
      out.push(product)
    }
  }
  return out
}

const ATTRIBUTE_MARKER = 'class="sin-pro-color'

function parseAttributes(html: string): string[] {
  const out: string[] = []
  for (const block of cards(html, ATTRIBUTE_MARKER)) {
    const label = pickText(block, /class="color-title">([\s\S]*?)<\/p>/)?.replace(/\s*:\s*$/, '')
    const value = pickText(block, /<span>([\s\S]*?)<\/span>/)
    if (label && value) out.push(`${label}: ${value}`)
  }
  return out
}

function scopedPrice(html: string, sectionMarker: string): number | undefined {
  const at = html.indexOf(sectionMarker)
  if (at === -1) return undefined
  return money(pickText(html.slice(at, at + 800), /class="price[^"]*"[^>]*>([\s\S]*?)<\/span>/))
}

/** The buy button's own label — "Buy" when iStore has stock, "Preorder" when it
 * does not yet. There is no separate stock-status text on the detail page the
 * way there is on a card, so the button is the only signal. */
function parseAvailability(html: string): string | undefined {
  const text = pickText(html, /class="[^"]*add-to-cart-button[^"]*"[^>]*>([\s\S]*?)<\/button>/)
  if (!text) return undefined
  return /preorder/i.test(text) ? 'Preorder' : 'In stock'
}

function parseCategoryPath(html: string): string[] {
  const at = html.indexOf('product-breadcrumbs')
  if (at === -1) return []
  const end = html.indexOf('</ul>', at)
  const block = html.slice(at, end === -1 ? at + 1000 : end)
  return [...block.matchAll(/<a href="\/filter\/[^"]*">([^<]+)<\/a>/g)].map((m) => clean(m[1])).filter(Boolean)
}

function parseGallery(html: string, id: number): string[] {
  const seen = new Set<string>()
  for (const m of html.matchAll(new RegExp(`<img[^>]*src="(/product_image/${id}/[^"]+)"`, 'g'))) {
    seen.add(absoluteImage(m[1]))
  }
  return [...seen]
}

export function parseProductPage(html: string, id: number): IstoreProduct | undefined {
  const head = /<h1 class="mobile-product-name">([\s\S]*?)<\/h1>\s*<h2>\s*([\s\S]*?)\s*<\/h2>/.exec(html)
  const name = head ? clean(head[1]) : undefined
  if (!name) return undefined
  const code = head?.[2] ? clean(head[2]) : undefined

  const category = pickText(html, /class="brand-name-2">([\s\S]*?)<\/h6>/)
  const categoryPath = parseCategoryPath(html)
  const details = parseAttributes(html)
  const wasPrice = scopedPrice(html, 'new-credit-price')
  const price = scopedPrice(html, 'new-pro-price')
  const available = parseAvailability(html)
  const images = parseGallery(html, id)

  return {
    id,
    name,
    ...(code ? { code } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(wasPrice !== undefined && wasPrice !== price ? { wasPrice } : {}),
    ...(discount(wasPrice, price) !== undefined ? { discountPercent: discount(wasPrice, price) } : {}),
    ...(category ? { category } : {}),
    ...(categoryPath.length ? { categoryPath } : {}),
    ...(details.length ? { details } : {}),
    ...(available ? { available } : {}),
    url: productUrl(id),
    ...(images.length ? { image: images[0], images } : {}),
  }
}

export interface IstoreCategory {
  slug: string
  name: string
  children?: Array<{ slug: string; name: string }>
}

/** The nav's mobile menu (`<nav id="dropdown">`) carries the whole category
 * tree with plain text labels, rendered on every page whether or not it is
 * visible — the desktop flyout right above it repeats the same links as
 * image-only buttons with no text, so that one is not usable here. */
export function parseCategories(html: string): IstoreCategory[] {
  const navStart = html.indexOf('id="dropdown"')
  if (navStart === -1) return []
  const navEnd = html.indexOf('</nav>', navStart)
  const nav = html.slice(navStart, navEnd === -1 ? undefined : navEnd)

  const out: IstoreCategory[] = []
  const topPattern = /<a href="\/filter\/([^"]+)">([^<]+)<\/a>\s*<ul>([\s\S]*?)<\/ul>/g
  let m: RegExpExecArray | null
  while ((m = topPattern.exec(nav))) {
    const [, slug, name, childHtml] = m
    const children = [...childHtml.matchAll(/<a href="\/filter\/([^"]+)">([^<]+)<\/a>/g)]
      .map((c) => ({ slug: c[1], name: clean(c[2]) }))
      .filter((c) => c.name && c.slug !== slug)
    out.push({ slug, name: clean(name), ...(children.length ? { children } : {}) })
  }
  return out
}

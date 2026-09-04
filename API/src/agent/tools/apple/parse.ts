import { ShopError } from '../shops/scrape.js'

export const SITE = 'https://www.apple.com'
export const SHOP = 'Apple'

/**
 * Apple's storefront is not one catalogue but several different configurator
 * engines — iPhone and iPad share a simple dimension-picker whose data this
 * file reads cleanly; Mac uses a build-to-order system with its own price
 * keys, and Watch a two-stage case-then-band picker with a third. Rather than
 * half-parse three incompatible schemas, this only covers the two that are
 * uniform: iPhone and Mac/Watch/AirPods are not read here.
 *
 * Apple also has no catalogue-wide search endpoint the way a marketplace
 * does — its own site search mixes shop, support and marketing pages. So
 * "search" here is a small, hand-kept directory of the current buy pages
 * (there are only a handful of iPhone and iPad lines at any time) rather than
 * a live query against Apple's own index.
 */
export interface ProductLine {
  slug: string
  label: string
  category: 'iphone' | 'ipad'
  /** Matched against a query in addition to the label itself. */
  keywords: string[]
}

export const PRODUCT_LINES: ProductLine[] = [
  { slug: 'iphone-17-pro', label: 'iPhone 17 Pro', category: 'iphone', keywords: ['17 pro', '17pro', 'pro max'] },
  { slug: 'iphone-air', label: 'iPhone Air', category: 'iphone', keywords: ['air'] },
  { slug: 'iphone-17', label: 'iPhone 17', category: 'iphone', keywords: ['17'] },
  { slug: 'iphone-17e', label: 'iPhone 17e', category: 'iphone', keywords: ['17e'] },
  { slug: 'iphone-16', label: 'iPhone 16', category: 'iphone', keywords: ['16', '16 plus'] },
  { slug: 'ipad-pro', label: 'iPad Pro', category: 'ipad', keywords: ['pro'] },
  { slug: 'ipad-air', label: 'iPad Air', category: 'ipad', keywords: ['air'] },
  { slug: 'ipad', label: 'iPad', category: 'ipad', keywords: [] },
  { slug: 'ipad-mini', label: 'iPad mini', category: 'ipad', keywords: ['mini'] },
]

export function pageUrl(line: Pick<ProductLine, 'slug' | 'category'>): string {
  const family = line.category === 'iphone' ? 'buy-iphone' : 'buy-ipad'
  return `${SITE}/shop/${family}/${line.slug}`
}

/** Product families this scope does not read — a query naming one of these
 * must be refused outright, not silently answered from iPhone or iPad just
 * because a shared word like "Pro" or "Air" happens to match there too. */
const OUT_OF_SCOPE = /\b(mac(?:book)?|imac|apple\s*watch|watch|airpods?)\b/

/** Lines whose label or keywords appear in the query, broadest match first —
 * "iphone 17 pro" should not also pull in every other iPhone line. */
export function matchLines(query: string): ProductLine[] {
  const q = query.toLowerCase()
  if (OUT_OF_SCOPE.test(q)) return []

  // "Pro" and "Air" name both an iPhone and an iPad line, so a query that
  // names the device family explicitly must stay inside it — "iPhone 17
  // Pro" is not also a hit on iPad Pro just because they share a keyword.
  const saysIphone = /\biphones?\b/.test(q)
  const saysIpad = /\bipads?\b/.test(q)
  const wantedCategories: Array<ProductLine['category']> = saysIphone && !saysIpad
    ? ['iphone']
    : saysIpad && !saysIphone
      ? ['ipad']
      : ['iphone', 'ipad']

  const scored = PRODUCT_LINES.filter((line) => wantedCategories.includes(line.category))
    .map((line) => {
      const hay = [line.label.toLowerCase(), ...line.keywords]
      const hit = hay.some((term) => q.includes(term) || term.includes(q))
      const specificity = line.label.length + line.keywords.join('').length
      return { line, hit, specificity }
    })
    .filter((s) => s.hit)

  if (!scored.length) return []
  // A hit on "iphone 17 pro" should not also return "iphone 17" and "iphone
  // 16" — keep only the category(ies) that matched, favouring the most
  // specific line label within each.
  const categories = new Set(scored.map((s) => s.line.category))
  return [...categories].flatMap((cat) => {
    const inCat = scored.filter((s) => s.line.category === cat).sort((a, b) => b.specificity - a.specificity)
    const topSpecificity = inCat[0].specificity
    // Ties at the top specificity band all count (e.g. "iphone" alone
    // matches every line equally); a clear winner excludes the rest.
    return inCat.filter((s) => s.specificity === topSpecificity).map((s) => s.line)
  })
}

interface MetricsSku {
  sku?: string
  partNumber?: string
  price?: { fullPrice?: number }
  category?: string
  name?: string
}

/** Finds a value at any depth by key — the metrics blob is a fixed page's
 * worth of analytics config, not a stable path we can name once. */
function findAll(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, key, out)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v)
      findAll(v, key, out)
    }
  }
  return out
}

/**
 * The buy page's own checkout analytics (`<script id="metrics">`, valid JSON)
 * lists every purchasable configuration with a plain name and a real number
 * for a price — the cleanest source on the page, because it exists to feed
 * an analytics pipeline that has no use for Apple's internal price-key
 * indirection.
 */
function parseMetricsSkus(html: string): MetricsSku[] {
  const match = /<script[^>]*id="metrics"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!match) return []
  let data: unknown
  try {
    data = JSON.parse(match[1])
  } catch {
    return []
  }
  const found = findAll(data, 'products').find((v) => Array.isArray(v) && v.length && (v[0] as MetricsSku).price)
  return Array.isArray(found) ? (found as MetricsSku[]) : []
}

interface BootstrapProduct {
  partNumber?: string
  dimensionColor?: string
  dimensionCapacity?: string
  dimensionScreensize?: string
  isCarrierDevice?: boolean
}

/**
 * The configurator's own bootstrap (`window.PRODUCT_SELECTION_BOOTSTRAP`, a
 * JS object literal, not quite JSON) repeats every part once per carrier
 * variant and has no plain name — but it is the only place color, storage
 * and screen size live as separate fields rather than baked into a sentence,
 * so it is read only to enrich what the metrics list already found.
 */
function parseBootstrapDimensions(html: string): Map<string, BootstrapProduct> {
  const marker = 'productSelectionData:'
  const at = html.indexOf(marker)
  if (at === -1) return new Map()
  const start = html.indexOf('{', at)
  if (start === -1) return new Map()

  let depth = 0
  let end = start
  for (; end < html.length; end++) {
    if (html[end] === '{') depth++
    else if (html[end] === '}') {
      depth--
      if (depth === 0) break
    }
  }

  let data: { products?: BootstrapProduct[] }
  try {
    data = JSON.parse(html.slice(start, end + 1))
  } catch {
    return new Map()
  }

  const byPart = new Map<string, BootstrapProduct>()
  for (const p of data.products ?? []) {
    // Carrier variants repeat the same part; the unlocked entry (or simply
    // the first seen) is representative for dimensions, which do not vary
    // by carrier.
    if (p.partNumber && (!byPart.has(p.partNumber) || p.isCarrierDevice === false)) {
      byPart.set(p.partNumber, p)
    }
  }
  return byPart
}

export interface AppleProduct {
  id: string
  name: string
  price: number
  brand: 'Apple'
  category: string
  details?: string[]
  url: string
  image?: string
}

function screenLabel(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^(\d+(?:_\d+)?)inch$/.exec(value)
  return match ? `${match[1].replace('_', '.')}-inch` : value
}

export function parseLinePage(html: string, line: Pick<ProductLine, 'label' | 'category'>, url: string): AppleProduct[] {
  const skus = parseMetricsSkus(html)
  const dims = parseBootstrapDimensions(html)

  const seen = new Set<string>()
  const out: AppleProduct[] = []

  for (const sku of skus) {
    const price = sku.price?.fullPrice
    if (!sku.partNumber || !sku.name || price === undefined || seen.has(sku.partNumber)) continue
    seen.add(sku.partNumber)

    // The colour is already spelled out properly in `name` itself ("...2TB
    // Cosmic Orange"); the raw `dimensionColor` slug is not — Apple mashes
    // some colour names together with no separator ("cosmicorange"), so
    // there is no reliable way to re-space it generically. Storage and
    // screen size are cleaner as their own facts than parsed back out of
    // the name, so only those are added here.
    const dim = dims.get(sku.partNumber)
    const details = dim
      ? [
          dim.dimensionCapacity ? `Storage: ${dim.dimensionCapacity.toUpperCase()}` : '',
          screenLabel(dim.dimensionScreensize) ? `Screen: ${screenLabel(dim.dimensionScreensize)}` : '',
        ].filter(Boolean)
      : []

    out.push({
      id: sku.partNumber,
      name: sku.name,
      price,
      brand: 'Apple',
      category: line.label,
      ...(details.length ? { details } : {}),
      url,
    })
  }

  return out
}

export function pageDescription(html: string): string | undefined {
  const match = /<meta name="description" content="([^"]*)"/.exec(html)
  return match ? match[1] : undefined
}

export function pageTitle(html: string): string | undefined {
  const match = /<title>([^<]*)<\/title>/.exec(html)
  return match?.[1].replace(/ - Apple$/, '')
}

/** First usable finish/colour shot the configurator ships — a representative
 * image for the line, not one per SKU; per-SKU images need a second
 * cross-reference this scope does not cover. */
export function heroImage(html: string): string | undefined {
  // Unlike `productSelectionData:` — a genuine unquoted key on the outer JS
  // object literal — this key sits inside that object's own value, which is
  // itself valid JSON, so its key is quoted.
  const marker = '"imageDictionary":'
  const at = html.indexOf(marker)
  if (at === -1) return undefined
  const start = html.indexOf('{', at)
  if (start === -1) return undefined

  let depth = 0
  let end = start
  for (; end < html.length; end++) {
    if (html[end] === '{') depth++
    else if (html[end] === '}') {
      depth--
      if (depth === 0) break
    }
  }

  try {
    const dict = JSON.parse(html.slice(start, end + 1)) as Record<
      string,
      { sources?: Array<{ srcSet?: string }> }
    >
    for (const entry of Object.values(dict)) {
      const src = entry.sources?.[0]?.srcSet
      if (src) return src.split(' ')[0]
    }
  } catch {
    return undefined
  }
  return undefined
}

export function assertHtml(html: string, url: string): void {
  if (!html.includes('id="metrics"')) {
    throw new ShopError(`${SHOP} page did not load as expected for ${url}`)
  }
}

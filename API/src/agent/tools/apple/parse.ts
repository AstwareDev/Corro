import { ShopError } from '../shops/scrape.js'

export const SITE = 'https://www.apple.com'
export const SHOP = 'Apple'

export interface ProductLine {
  slug: string
  label: string
  category: 'iphone' | 'ipad'
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

const OUT_OF_SCOPE = /\b(mac(?:book)?|imac|apple\s*watch|watch|airpods?)\b/

export function matchLines(query: string): ProductLine[] {
  const q = query.toLowerCase()
  if (OUT_OF_SCOPE.test(q)) return []

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
  const categories = new Set(scored.map((s) => s.line.category))
  return [...categories].flatMap((cat) => {
    const inCat = scored.filter((s) => s.line.category === cat).sort((a, b) => b.specificity - a.specificity)
    const topSpecificity = inCat[0].specificity
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

export function heroImage(html: string): string | undefined {
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

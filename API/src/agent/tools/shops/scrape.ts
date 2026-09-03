






export class ShopError extends Error {
  readonly status?: number

  constructor(message: string, opts: { status?: number } = {}) {
    super(message)
    this.name = 'ShopError'
    this.status = opts.status
  }
}

export function failure(shop: string, err: unknown) {
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : `${shop} request failed`,
  }
}






export const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9',
}

export async function fetchPage(
  shop: string,
  url: string,
  { timeoutMs = 25_000 }: { timeoutMs?: number } = {}
): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : (err as Error).message
    throw new ShopError(`${shop} request ${reason}`)
  }

  if (!res.ok) {
    throw new ShopError(`${shop} returned ${res.status} for ${url}`, { status: res.status })
  }
  return squash(await res.text())
}






export function squash(html: string): string {
  return html.replace(/\s+/g, ' ')
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  euro: '€',
}

export function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
}

export function clean(html: string | undefined): string {
  if (!html) return ''
  return decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

export function pick(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html)
  return match?.[1]
}








export function divBody(html: string, opening: RegExp): string | undefined {
  const match = opening.exec(html)
  if (!match) return undefined

  const start = match.index + match[0].length
  const tag = /<(\/?)div\b/g
  tag.lastIndex = start

  let depth = 1
  let found: RegExpExecArray | null = tag.exec(html)
  while (found) {
    depth += found[1] ? -1 : 1
    if (depth === 0) return html.slice(start, found.index)
    found = tag.exec(html)
  }
  
  return html.slice(start)
}





export function richText(html: string | undefined): string {
  if (!html) return ''
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|h\d)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function pickText(html: string, pattern: RegExp): string | undefined {
  const raw = pick(html, pattern)
  const text = clean(raw)
  return text || undefined
}






export function cards(html: string, marker: string): string[] {
  const out: string[] = []
  let from = html.indexOf(marker)
  while (from !== -1) {
    const next = html.indexOf(marker, from + marker.length)
    out.push(html.slice(from, next === -1 ? undefined : next))
    from = next
  }
  return out
}


export function money(text: string | undefined): number | undefined {
  if (!text) return undefined
  const digits = decode(text).replace(/[^\d.,]/g, '').replace(/[,\s](?=\d{3}\b)/g, '')
  const value = Number(digits.replace(/,/g, '.'))
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
}






const UNITS: Record<string, string> = {
  kg: 'kg',
  կգ: 'kg',
  кг: 'kg',
  g: 'g',
  գր: 'g',
  г: 'g',
  l: 'L',
  լ: 'L',
  л: 'L',
  ml: 'ml',
  մլ: 'ml',
  мл: 'ml',
}

export function unitPrice(
  amount: string | undefined,
  unit: string | undefined
): { amount: number; unit: string } | undefined {
  const value = money(amount)
  const key = clean(unit).toLowerCase().replace(/^1\s*/, '').trim()
  const normalised = UNITS[key]
  if (!value || !normalised) return undefined
  return { amount: value, unit: normalised }
}


export function budget(text: string, maxChars: number): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (trimmed.length <= maxChars) return trimmed
  const cut = trimmed.slice(0, maxChars)
  const stop = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'))
  return `${(stop > maxChars * 0.6 ? cut.slice(0, stop) : cut).trimEnd()}…`
}


export function percent(text: string | undefined): number | undefined {
  if (!text) return undefined
  const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(text)
  if (!match) return undefined
  const value = Number(match[1].replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined
}

export const SHOP_LANGUAGES = ['en', 'ru', 'hy'] as const
export type ShopLanguage = (typeof SHOP_LANGUAGES)[number]

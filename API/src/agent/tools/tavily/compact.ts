const TRACKING =
  /^(?:utm_\w+|ga_\w+|mc_\w+|hsa_\w+|_hs\w*|fbclid|gclid|gbraid|wbraid|msclkid|igshid|mkt_tok|yclid|twclid|scid|s_cid|ref_src|ref|source|amp|spm|cmpid|campaign_id)$/i

const MIN_SHARE = 160

export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const name of [...u.searchParams.keys()]) {
      if (TRACKING.test(name)) u.searchParams.delete(name)
    }
    u.hash = ''
    let out = u.toString()
    if (out.endsWith('?')) out = out.slice(0, -1)
    if (u.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1)
    return out
  } catch {
    return raw.trim()
  }
}

export function squeeze(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/<[^>]{1,200}>/g, ' ')
    .replace(/(?:^|\n)\s*(?:[-*_]\s*){3,}\s*(?=\n|$)/g, '\n')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const stop = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'))
  return `${(stop > maxChars * 0.6 ? cut.slice(0, stop) : cut).trimEnd()}…`
}

export function allocate(texts: Array<string | null | undefined>, total: number): string[] {
  const cleaned = texts.map(squeeze)
  const out = cleaned.map(() => '')
  const order = cleaned
    .map((text, i) => ({ i, text }))
    .filter((x) => x.text.length > 0)
    .sort((a, b) => a.text.length - b.text.length)

  let remaining = Math.max(0, total)
  let left = order.length
  for (const { i, text } of order) {
    const share = Math.max(MIN_SHARE, Math.floor(remaining / left))
    const kept = truncate(text, Math.min(share, remaining))
    out[i] = kept
    remaining -= kept.length
    left--
  }
  return out
}

export function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function shortDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function failure(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : 'Tavily request failed' }
}

const HOSTS = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1',
  'https://latest.currency-api.pages.dev/v1',
]

export class CurrencyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CurrencyError'
  }
}

async function fetchJson<T>(path: string, timeoutMs: number): Promise<T> {
  let lastErr: unknown
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) {
        lastErr = new CurrencyError(`currency rates returned ${res.status}`)
        continue
      }
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : 'both mirrors failed'
  throw new CurrencyError(`Could not reach the currency rate service — ${reason}`)
}

interface RateDoc {
  date: string
  [base: string]: unknown
}

const CACHE_TTL_MS = 30 * 60 * 1000
const cache = new Map<string, { at: number; date: string; rates: Record<string, number> }>()

async function ratesFor(base: string): Promise<{ date: string; rates: Record<string, number> }> {
  const cached = cache.get(base)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached

  const doc = await fetchJson<RateDoc>(`/currencies/${base}.json`, 15_000)
  const rates = doc[base] as Record<string, number> | undefined
  if (!rates) throw new CurrencyError(`No rates published for "${base}"`)

  const entry = { at: Date.now(), date: doc.date, rates }
  cache.set(base, entry)
  return entry
}

let namesPromise: Promise<Record<string, string>> | undefined

export function currencyNames(): Promise<Record<string, string>> {
  namesPromise ??= fetchJson<Record<string, string>>('/currencies.json', 15_000).catch((err) => {
    namesPromise = undefined
    throw err
  })
  return namesPromise
}

export async function isKnownCurrency(code: string): Promise<boolean> {
  const names = await currencyNames()
  return code.toLowerCase() in names
}

export interface Rate {
  from: string
  to: string
  rate: number
  date: string
}

export async function convert(from: string, to: string[]): Promise<Rate[]> {
  const base = from.toLowerCase()
  const { date, rates } = await ratesFor(base)

  return to.map((code) => {
    const target = code.toLowerCase()
    const rate = rates[target]
    if (rate === undefined) throw new CurrencyError(`No rate from "${from}" to "${code}"`)
    return { from: base, to: target, rate, date }
  })
}

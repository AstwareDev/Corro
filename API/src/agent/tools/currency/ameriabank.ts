import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { clean, failure, fetchPage } from '../shops/scrape.js'
import { convertLegs, type ConversionLeg } from './legs.js'

export const AMERIABANK = 'Ameriabank'
export const AMERIABANK_SITE = 'https://ameriabank.am'
export const AMERIABANK_RATES_URL = `${AMERIABANK_SITE}/en/exchange-rates`

export class AmeriabankError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmeriabankError'
  }
}

export interface RateSide {
  buy?: number
  sell?: number
}

export interface AmeriabankRate {
  code: string
  cash: RateSide
  nonCash: RateSide
}

export type { ConversionLeg }

const TABLE_PATTERN = /<table[^>]*id="dnn_ctr44236_View_grdRates"[^>]*>([\s\S]*?)<\/table>/i
const ROW_PATTERN = /<tr class="Item">([\s\S]*?)<\/tr>/gi
const CELL_PATTERN = /<td[^>]*>([\s\S]*?)<\/td>/gi

function numberOf(text: string): number | undefined {
  const cleaned = clean(text).replace(/,/g, '')
  if (!cleaned) return undefined
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
}

function side(buyText: string, sellText: string): RateSide {
  const out: RateSide = {}
  const buy = numberOf(buyText)
  const sell = numberOf(sellText)
  if (buy !== undefined) out.buy = buy
  if (sell !== undefined) out.sell = sell
  return out
}

export function parseRatesTable(html: string): AmeriabankRate[] {
  const table = TABLE_PATTERN.exec(html)?.[1]
  if (!table) throw new AmeriabankError('Ameriabank layout changed, rates table not found')

  const rates: AmeriabankRate[] = []
  for (const row of table.matchAll(ROW_PATTERN)) {
    const cells = [...row[1].matchAll(CELL_PATTERN)].map((m) => m[1] ?? '')
    if (cells.length < 5) continue
    const code = clean(cells[0]).toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) continue
    rates.push({ code, cash: side(cells[1], cells[2]), nonCash: side(cells[3], cells[4]) })
  }

  if (!rates.length) throw new AmeriabankError('Ameriabank layout changed, no currency rows found')
  return rates
}

const CACHE_TTL_MS = 15 * 60 * 1000
let cached: { at: number; rates: AmeriabankRate[] } | undefined

export async function ratesTable(): Promise<AmeriabankRate[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rates
  const html = await fetchPage(AMERIABANK, AMERIABANK_RATES_URL)
  const rates = parseRatesTable(html)
  cached = { at: Date.now(), rates }
  return rates
}

export function clearRatesCache(): void {
  cached = undefined
}

export function convertAtBank(
  rates: AmeriabankRate[],
  amount: number,
  from: string,
  to: string,
  cash: boolean
): ConversionLeg {
  const kind = cash ? 'cash' : 'non-cash'
  const flat = rates.map((r) => ({ code: r.code, ...(cash ? r.cash : r.nonCash) }))
  return convertLegs(flat, amount, from, to, {
    fail: (message) => new AmeriabankError(`Ameriabank publishes ${message}`),
    side: kind,
  })
}

const CODE = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .describe('An ISO currency code such as "USD", "EUR", "RUB" or "AMD" (case-insensitive).')

export const ameriabankRates = tool({
  description:
    'Live retail exchange rates from Ameriabank (ameriabank.am), an Armenian bank — cash (banknotes) and ' +
    'non-cash buy/sell rates against the dram for USD, EUR, RUB and the other currencies it lists. Use this, ' +
    'not currency_convert, when the question is about Armenian bank or cash rates ("dollar rate in Armenia", ' +
    '"what is the bank buying dollars at"), and alongside idbank_rates when the user asks for rates generally ' +
    'so both Armenian boards are compared. Optionally converts an amount at those same buy/sell rates.',
  inputSchema: z.object({
    description: toolDescription,
    currencies: z
      .array(CODE)
      .max(12)
      .optional()
      .describe('Show only these ISO codes, e.g. ["USD", "EUR"]. Omit for every currency the bank lists.'),
    amount: z.number().positive().optional().describe('Amount to convert at the bank rates. Needs from and to.'),
    from: CODE.optional().describe('Currency to convert from, e.g. "USD".'),
    to: z.array(CODE).min(1).max(10).optional().describe('Currencies to convert to.'),
    cash: z
      .boolean()
      .default(true)
      .describe('Convert at cash (banknote) rates. Set false for non-cash rates. The table always shows both.'),
  }),
  execute: async ({ currencies, amount, from, to, cash }) => {
    try {
      const all = await ratesTable()
      const codes = all.map((r) => r.code)

      const wanted = currencies?.map((c) => c.toUpperCase())
      const missing = wanted?.filter((c) => c !== 'AMD' && !codes.includes(c))
      if (missing?.length) {
        return { ok: false as const, error: `Ameriabank lists no rates for: ${missing.join(', ')}. It lists: ${codes.join(', ')}.` }
      }
      const rates = wanted ? all.filter((r) => wanted.includes(r.code)) : all

      let conversion: { amount: number; from: string; cash: boolean; results: ConversionLeg[] } | undefined
      if (from || to) {
        if (!from || !to) {
          return { ok: false as const, error: 'Give both `from` and one or more `to` to convert.' }
        }
        const fromCode = from.toUpperCase()
        const toCodes = to.map((c) => c.toUpperCase())
        const known = new Set([...codes, 'AMD'])
        const bad = [fromCode, ...toCodes].filter((c) => !known.has(c))
        if (bad.length) {
          return {
            ok: false as const,
            error: `Ameriabank lists no rates for: ${[...new Set(bad)].join(', ')}. It lists: ${codes.join(', ')}.`,
          }
        }
        const value = amount ?? 1
        conversion = {
          amount: value,
          from: fromCode,
          cash,
          results: toCodes.map((code) => convertAtBank(all, value, fromCode, code, cash)),
        }
      }

      return {
        ok: true as const,
        bank: AMERIABANK,
        url: AMERIABANK_RATES_URL,
        date: new Date().toISOString().slice(0, 10),
        base: 'AMD',
        rates,
        ...(conversion ? { conversion } : {}),
        source: 'ameriabank.am',
      }
    } catch (err) {
      if (err instanceof AmeriabankError) return { ok: false as const, error: err.message }
      return failure(AMERIABANK, err)
    }
  },
})

export const AMERIABANK_TOOL_NAMES = ['ameriabank_rates'] as const

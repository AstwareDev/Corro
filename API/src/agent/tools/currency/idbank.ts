import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { BROWSER_HEADERS, cards, clean, divBody, failure, fetchPage } from '../shops/scrape.js'
import { convertLegs, type ConversionLeg } from './legs.js'

export const IDBANK = 'IDBank'
export const IDBANK_SITE = 'https://idbank.am'
export const IDBANK_RATES_URL = `${IDBANK_SITE}/en/rates/`

export class IdbankError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdbankError'
  }
}

export const IDBANK_KINDS = ['cash', 'non-cash', 'cards', 'transfer', 'mobile'] as const
export type IdbankKind = (typeof IDBANK_KINDS)[number]

const RATE_TYPE: Record<IdbankKind, string> = {
  cash: 'CASH',
  'non-cash': 'NO_CASH',
  cards: 'CARDS',
  transfer: 'TRANSFER',
  mobile: 'MOBILE',
}

export interface IdbankRate {
  code: string
  unit: number
  buy?: number
  sell?: number
}

export interface IdbankBoard {
  kind: IdbankKind
  updated?: string
  rates: IdbankRate[]
}

const KIND = z.enum(IDBANK_KINDS)

const CELL_PATTERN = /<div class="m-exchange__table-cell">(.*?)<\/div>/gs
const SVG_PATTERN = /<svg[\s\S]*?<\/svg>/g
const ROW_CODE_PATTERN = /^([\d.,\s]+)?\s*([A-Za-z]{3})$/
const UPDATED_PATTERN = /Updated at:\s*([0-9]{4}\.[0-9]{2}\.[0-9]{2}\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)/
const AJAX_ID_PATTERN = /name="bxajaxid"[^>]*?value="([a-f0-9]+)"/i
const FALLBACK_AJAX_ID = 'e8b209491eaaeda55a9b3842ffe66e9a'

function numberOf(text: string): number | undefined {
  const cleaned = clean(text).replace(/,/g, '')
  if (!cleaned || cleaned === '-') return undefined
  const value = Number(cleaned)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1e4) / 1e4 : undefined
}

function unitOf(text: string): number {
  const match = ROW_CODE_PATTERN.exec(clean(text))
  if (!match?.[1]) return 1
  const value = Number(match[1].replace(/[\s,]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 1
}

export function parseBoard(html: string, kind: IdbankKind): IdbankBoard {
  const table = divBody(html, /<div class="m-exchange__table">/)
  if (!table) throw new IdbankError(`IDBank layout changed, ${kind} rates table not found`)

  const rates: IdbankRate[] = []
  for (const row of cards(table, '<div class="m-exchange__table-row">')) {
    const cells = [...row.matchAll(CELL_PATTERN)].map((m) => clean(m[1].replace(SVG_PATTERN, '')))
    if (cells.length < 3) continue
    const code = ROW_CODE_PATTERN.exec(cells[0])?.[2]?.toUpperCase()
    if (!code) continue
    const unit = unitOf(cells[0])
    const buy = numberOf(cells[1])
    const sell = numberOf(cells[2])
    rates.push({
      code,
      unit,
      ...(buy !== undefined ? { buy: Math.round((buy / unit) * 1e4) / 1e4 } : {}),
      ...(sell !== undefined ? { sell: Math.round((sell / unit) * 1e4) / 1e4 } : {}),
    })
  }

  if (!rates.length) throw new IdbankError(`IDBank layout changed, no ${kind} currency rows found`)
  const updated = UPDATED_PATTERN.exec(html)?.[1]
  return { kind, ...(updated ? { updated } : {}), rates }
}

const CACHE_TTL_MS = 15 * 60 * 1000
let pageCache: { at: number; html: string } | undefined
const boardCache = new Map<IdbankKind, { at: number; board: IdbankBoard }>()

export function clearIdbankCache(): void {
  pageCache = undefined
  boardCache.clear()
}

async function ratesPage(): Promise<string> {
  if (pageCache && Date.now() - pageCache.at < CACHE_TTL_MS) return pageCache.html
  const html = await fetchPage(IDBANK, IDBANK_RATES_URL)
  pageCache = { at: Date.now(), html }
  return html
}

async function postBoard(kind: IdbankKind, ajaxId: string): Promise<string> {
  const body = new URLSearchParams({
    bxajaxid: ajaxId,
    AJAX_CALL: 'Y',
    RATE_TYPE: RATE_TYPE[kind],
    AUTO_SUBMIT: 'Y',
    save: 'Y',
  })
  let res: Response
  try {
    res = await fetch(IDBANK_RATES_URL, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'content-type': 'application/x-www-form-urlencoded',
        referer: IDBANK_RATES_URL,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(25_000),
    })
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' ? 'timed out' : (err as Error).message
    throw new IdbankError(`IDBank ${kind} request ${reason}`)
  }
  if (!res.ok) throw new IdbankError(`IDBank returned ${res.status} for the ${kind} board`)
  const html = await res.text()
  if (!html.includes('m-exchange__table-row')) throw new IdbankError(`IDBank returned no ${kind} rates`)
  return html
}

export async function board(kind: IdbankKind): Promise<IdbankBoard> {
  const hit = boardCache.get(kind)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.board

  if (kind === 'cash') {
    const parsed = parseBoard(await ratesPage(), kind)
    boardCache.set(kind, { at: Date.now(), board: parsed })
    return parsed
  }

  const page = await ratesPage()
  const ajaxId = AJAX_ID_PATTERN.exec(page)?.[1] ?? FALLBACK_AJAX_ID
  const parsed = parseBoard(await postBoard(kind, ajaxId), kind)
  boardCache.set(kind, { at: Date.now(), board: parsed })
  return parsed
}

const CODE = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .describe('An ISO currency code such as "USD", "EUR", "RUB" or "AMD" (case-insensitive).')

export const idbankRates = tool({
  description:
    'Live retail exchange rates from IDBank (idbank.am), an Armenian bank — buy/sell rates against the dram ' +
    'across five boards: cash, non-cash, cards, transfers and mobile (the widest list, including gold grams as ' +
    'XAU). Use this, not currency_convert, for Armenian bank rates, and alongside ameriabank_rates when the ' +
    'user asks for rates generally so both Armenian boards are compared. Optionally converts an amount at ' +
    "one board's buy/sell rates.",
  inputSchema: z.object({
    description: toolDescription,
    kinds: z
      .array(KIND)
      .min(1)
      .max(5)
      .default(['cash', 'non-cash'])
      .describe('Which boards to return. Cash and non-cash cover the usual question; add cards, transfer or mobile when the user names them.'),
    currencies: z
      .array(CODE)
      .max(12)
      .optional()
      .describe('Show only these ISO codes, e.g. ["USD", "EUR"]. Omit for every currency a board lists.'),
    amount: z.number().positive().optional().describe('Amount to convert at the bank rates. Needs from and to.'),
    from: CODE.optional().describe('Currency to convert from, e.g. "USD".'),
    to: z.array(CODE).min(1).max(10).optional().describe('Currencies to convert to.'),
    kind: KIND.default('cash').describe('Which board converts. Every requested board is still returned.'),
  }),
  execute: async ({ kinds, currencies, amount, from, to, kind }) => {
    try {
      const fetchKinds = [...new Set([...kinds, ...(from && to ? [kind] : [])])]
      const boards = await Promise.all(fetchKinds.map((k) => board(k)))

      const codes = [...new Set(boards.flatMap((b) => b.rates.map((r) => r.code)))]
      const wanted = currencies?.map((c) => c.toUpperCase())
      const missing = wanted?.filter((c) => c !== 'AMD' && !codes.includes(c))
      if (missing?.length) {
        return { ok: false as const, error: `IDBank lists no rates for: ${missing.join(', ')}. It lists: ${codes.join(', ')}.` }
      }
      const shown = boards.map((b) => ({
        ...b,
        rates: wanted ? b.rates.filter((r) => wanted.includes(r.code)) : b.rates,
      }))

      let conversion: { amount: number; from: string; kind: IdbankKind; results: ConversionLeg[] } | undefined
      if (from || to) {
        if (!from || !to) {
          return { ok: false as const, error: 'Give both `from` and one or more `to` to convert.' }
        }
        const fromCode = from.toUpperCase()
        const toCodes = to.map((c) => c.toUpperCase())
        const known = new Set([...codes, 'AMD'])
        const bad = [...new Set([fromCode, ...toCodes].filter((c) => !known.has(c)))]
        if (bad.length) {
          return { ok: false as const, error: `IDBank lists no rates for: ${bad.join(', ')}. It lists: ${codes.join(', ')}.` }
        }
        const convertBoard = boards.find((b) => b.kind === kind) ?? (await board(kind))
        const value = amount ?? 1
        conversion = {
          amount: value,
          from: fromCode,
          kind,
          results: toCodes.map((code) =>
            convertLegs(convertBoard.rates, value, fromCode, code, {
              fail: (message) => new IdbankError(`IDBank ${kind} board publishes ${message}`),
              side: kind,
            })
          ),
        }
      }

      const updated = boards.map((b) => b.updated).find(Boolean)
      return {
        ok: true as const,
        bank: IDBANK,
        url: IDBANK_RATES_URL,
        ...(updated ? { updated } : {}),
        date: new Date().toISOString().slice(0, 10),
        base: 'AMD',
        boards: shown,
        ...(conversion ? { conversion } : {}),
        source: 'idbank.am',
      }
    } catch (err) {
      if (err instanceof IdbankError) return { ok: false as const, error: err.message }
      return failure(IDBANK, err)
    }
  },
})

export const IDBANK_TOOL_NAMES = ['idbank_rates'] as const

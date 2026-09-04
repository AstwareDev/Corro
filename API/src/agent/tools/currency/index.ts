import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { convert, currencyNames, CurrencyError, isKnownCurrency } from './client.js'

const CODE = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .describe('An ISO currency code such as "USD", "AMD" or "RUB" (case-insensitive).')

export const currencyConvert = tool({
  description:
    'Convert an amount between currencies at the current published exchange rate — live daily rates, ' +
    'no key, no request limit, ~200 currencies including AMD and RUB. Give one `to` for a single ' +
    'conversion or several to compare against multiple currencies at once ("100 USD in AMD and RUB").',
  inputSchema: z.object({
    description: toolDescription,
    amount: z.number().positive().default(1).describe('Amount to convert. Omit to just get the rate for 1 unit.'),
    from: CODE.describe('Currency to convert from.'),
    to: z.array(CODE).min(1).max(10).describe('Currencies to convert to.'),
  }),
  execute: async ({ amount, from, to }) => {
    try {
      const names = await currencyNames()
      const fromCode = from.toLowerCase()

      if (!(fromCode in names)) {
        return { ok: false as const, error: `"${from}" is not a currency this service knows. Check the code.` }
      }
      const badTargets = (await Promise.all(to.map(async (code) => ((await isKnownCurrency(code)) ? null : code)))).filter(
        (c): c is string => c !== null
      )
      if (badTargets.length) {
        return {
          ok: false as const,
          error: `Not a currency this service knows: ${badTargets.join(', ')}. Check the code${badTargets.length > 1 ? 's' : ''}.`,
        }
      }

      const rates = await convert(from, to)

      return {
        ok: true as const,
        amount,
        from: { code: fromCode.toUpperCase(), name: names[fromCode] },
        date: rates[0].date,
        results: rates.map((r) => ({
          code: r.to.toUpperCase(),
          name: names[r.to] ?? r.to.toUpperCase(),
          rate: r.rate,
          converted: Math.round(amount * r.rate * 1e6) / 1e6,
        })),
        source: 'fawazahmed0/currency-api',
      }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof CurrencyError ? err.message : err instanceof Error ? err.message : 'Currency lookup failed',
      }
    }
  },
})

export const CURRENCY_TOOL_NAMES = ['currency_convert'] as const

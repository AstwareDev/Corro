export interface FlatRate {
  code: string
  buy?: number
  sell?: number
}

export interface ConversionLeg {
  code: string
  converted: number
  rate: number
  note: string
}

export const round2 = (value: number): number => Math.round(value * 100) / 100

export interface LegOptions {
  fail: (message: string) => Error
  side: string
}

export function convertLegs(
  rates: FlatRate[],
  amount: number,
  from: string,
  to: string,
  { fail, side }: LegOptions
): ConversionLeg {
  const pick = (code: string): FlatRate | undefined => rates.find((r) => r.code === code)

  if (from === to) return { code: to, converted: round2(amount), rate: 1, note: 'same currency' }

  if (to === 'AMD') {
    const buy = pick(from)?.buy
    if (buy === undefined) throw fail(`No ${side} buy rate for ${from}`)
    return { code: to, converted: round2(amount * buy), rate: buy, note: `${side} buy ${buy}` }
  }

  if (from === 'AMD') {
    const sell = pick(to)?.sell
    if (sell === undefined) throw fail(`No ${side} sell rate for ${to}`)
    return { code: to, converted: round2(amount / sell), rate: round2(1 / sell), note: `${side} sell ${sell}` }
  }

  const buy = pick(from)?.buy
  if (buy === undefined) throw fail(`No ${side} buy rate for ${from}`)
  const sell = pick(to)?.sell
  if (sell === undefined) throw fail(`No ${side} sell rate for ${to}`)
  const converted = round2((amount * buy) / sell)
  return {
    code: to,
    converted,
    rate: round2(buy / sell),
    note: `${amount} ${from} to AMD at ${side} buy ${buy}, AMD to ${to} at ${side} sell ${sell}`,
  }
}

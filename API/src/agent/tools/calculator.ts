import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from './description.js'

export class CalcError extends Error {}

const MAX_LENGTH = 500

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
}

const FUNCTIONS: Record<string, [number, number, (...a: number[]) => number]> = {
  sqrt: [1, 1, Math.sqrt],
  cbrt: [1, 1, Math.cbrt],
  abs: [1, 1, Math.abs],
  round: [1, 1, Math.round],
  floor: [1, 1, Math.floor],
  ceil: [1, 1, Math.ceil],
  trunc: [1, 1, Math.trunc],
  sign: [1, 1, Math.sign],
  exp: [1, 1, Math.exp],
  ln: [1, 1, Math.log],

  log: [1, 2, (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b))],
  log2: [1, 1, Math.log2],
  sin: [1, 1, Math.sin],
  cos: [1, 1, Math.cos],
  tan: [1, 1, Math.tan],
  asin: [1, 1, Math.asin],
  acos: [1, 1, Math.acos],
  atan: [1, 1, Math.atan],
  pow: [2, 2, Math.pow],
  hypot: [2, 8, (...a) => Math.hypot(...a)],
  min: [1, 16, (...a) => Math.min(...a)],
  max: [1, 16, (...a) => Math.max(...a)],
}

type Tok =
  | { type: 'num'; value: number; pos: number }
  | { type: 'id'; value: string; pos: number }
  | { type: 'op' | 'lparen' | 'rparen' | 'comma'; value: string; pos: number }

function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) throw new CalcError(`Malformed number at position ${i}`)

      if (/^[0-9.]/.test(src[i + m[0].length] ?? '')) {
        throw new CalcError(`Malformed number at position ${i}`)
      }
      out.push({ type: 'num', value: Number(m[0]), pos: i })
      i += m[0].length
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_]\w*/.exec(src.slice(i))!
      out.push({ type: 'id', value: m[0].toLowerCase(), pos: i })
      i += m[0].length
      continue
    }
    if (c === '*' && src[i + 1] === '*') {
      out.push({ type: 'op', value: '^', pos: i })
      i += 2
      continue
    }
    if ('+-*/%^'.includes(c)) {
      out.push({ type: 'op', value: c, pos: i })
      i++
      continue
    }
    if (c === '(' || c === ')') {
      out.push({ type: c === '(' ? 'lparen' : 'rparen', value: c, pos: i })
      i++
      continue
    }
    if (c === ',') {
      out.push({ type: 'comma', value: c, pos: i })
      i++
      continue
    }
    throw new CalcError(`Unexpected character ${JSON.stringify(c)} at position ${i}`)
  }
  return out
}

class Parser {
  #toks: Tok[]
  #i = 0

  constructor(toks: Tok[]) {
    this.#toks = toks
  }

  #peek() {
    return this.#toks[this.#i]
  }

  #eat(type: Tok['type'], value?: string) {
    const t = this.#peek()
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) return null
    this.#i++
    return t
  }

  parse(): number {
    const v = this.expr()
    const rest = this.#peek()
    if (rest) throw new CalcError(`Unexpected ${JSON.stringify(String(rest.value))} at position ${rest.pos}`)
    return v
  }

  expr(): number {
    let left = this.term()
    for (;;) {
      const t = this.#peek()
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.#i++
        const right = this.term()
        left = t.value === '+' ? left + right : left - right
      } else return left
    }
  }

  term(): number {
    let left = this.unary()
    for (;;) {
      const t = this.#peek()
      if (t?.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.#i++
        const right = this.unary()
        if ((t.value === '/' || t.value === '%') && right === 0) {
          throw new CalcError('Division by zero')
        }
        left = t.value === '*' ? left * right : t.value === '/' ? left / right : left % right
      } else return left
    }
  }

  unary(): number {
    const t = this.#peek()
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.#i++
      const v = this.unary()
      return t.value === '-' ? -v : v
    }
    return this.power()
  }

  power(): number {
    const base = this.primary()
    const t = this.#peek()
    if (t?.type === 'op' && t.value === '^') {
      this.#i++

      return Math.pow(base, this.unary())
    }
    return base
  }

  primary(): number {
    const t = this.#peek()
    if (!t) throw new CalcError('Unexpected end of expression')

    if (t.type === 'num') {
      this.#i++
      return t.value
    }

    if (t.type === 'lparen') {
      this.#i++
      const v = this.expr()
      if (!this.#eat('rparen')) throw new CalcError(`Missing ')' for '(' at position ${t.pos}`)
      return v
    }

    if (t.type === 'id') {
      this.#i++
      if (t.value in CONSTANTS && this.#peek()?.type !== 'lparen') return CONSTANTS[t.value]

      const fn = FUNCTIONS[t.value]
      if (!fn) throw new CalcError(`Unknown name ${JSON.stringify(t.value)} at position ${t.pos}`)
      if (!this.#eat('lparen')) throw new CalcError(`Expected '(' after ${t.value} at position ${t.pos}`)

      const args: number[] = []
      if (this.#peek()?.type !== 'rparen') {
        do {
          args.push(this.expr())
        } while (this.#eat('comma'))
      }
      if (!this.#eat('rparen')) throw new CalcError(`Missing ')' for ${t.value}(`)

      const [lo, hi] = fn
      if (args.length < lo || args.length > hi) {
        const want = lo === hi ? `${lo}` : `${lo}-${hi}`
        throw new CalcError(`${t.value}() takes ${want} argument(s), got ${args.length}`)
      }
      return fn[2](...args)
    }

    throw new CalcError(`Unexpected ${JSON.stringify(String(t.value))} at position ${t.pos}`)
  }
}

export function evaluate(expression: string): number {
  if (expression.length > MAX_LENGTH) {
    throw new CalcError(`Expression too long (${expression.length} > ${MAX_LENGTH} characters)`)
  }
  const toks = lex(expression)
  if (toks.length === 0) throw new CalcError('Empty expression')

  const value = new Parser(toks).parse()
  if (Number.isNaN(value)) throw new CalcError('Result is not a number (check domains, e.g. sqrt of a negative)')
  if (!Number.isFinite(value)) throw new CalcError('Result overflowed to infinity')
  return value
}

function present(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value)
  const rounded = Number(value.toPrecision(12))
  return String(rounded)
}

export const calculator = tool({
  description:
    'Evaluate an arithmetic expression exactly. Use this for any calculation rather than working it out ' +
    'yourself — arithmetic done in your head is not a corroborated result. ' +
    'Supports + - * / % ^, parentheses, the constants pi/e/tau, and the functions ' +
    'sqrt cbrt abs round floor ceil trunc sign exp ln log log2 sin cos tan asin acos atan pow hypot min max. ' +
    'Angles are in radians. log(x) is base 10; log(x, b) is base b.',
  inputSchema: z.object({
    description: toolDescription,
    expression: z
      .string()
      .min(1)
      .max(MAX_LENGTH)
      .describe('The expression to evaluate, e.g. "(1920 * 1080) / 1e6" or "log(4096, 2)"'),
  }),
  execute: async ({ expression }) => {
    try {
      const value = evaluate(expression)
      return { ok: true as const, expression, value, formatted: present(value) }
    } catch (err) {
      return {
        ok: false as const,
        expression,
        error: err instanceof CalcError ? err.message : 'Could not evaluate the expression',
      }
    }
  },
})

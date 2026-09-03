import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CalcError, calculator, evaluate } from './calculator.js'

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} to be within ${eps} of ${b}`)

describe('evaluate', () => {
  it('respects precedence and associativity', () => {
    assert.equal(evaluate('2 + 3 * 4'), 14)
    assert.equal(evaluate('(2 + 3) * 4'), 20)
    assert.equal(evaluate('10 - 2 - 3'), 5)
    assert.equal(evaluate('100 / 5 / 2'), 10)
    assert.equal(evaluate('7 % 3'), 1)
  })

  it('treats ^ as right associative and accepts ** as an alias', () => {
    assert.equal(evaluate('2 ^ 3 ^ 2'), 512)
    assert.equal(evaluate('2 ** 10'), 1024)
  })

  it('handles unary signs, including in exponents', () => {
    assert.equal(evaluate('-5'), -5)
    assert.equal(evaluate('--5'), 5)
    assert.equal(evaluate('3 - -2'), 5)
    assert.equal(evaluate('2 ^ -2'), 0.25)
    assert.equal(evaluate('-2 ^ 2'), -4)
  })

  it('parses number literals', () => {
    assert.equal(evaluate('1e3'), 1000)
    assert.equal(evaluate('1.5e-2'), 0.015)
    assert.equal(evaluate('.5 + .5'), 1)
  })

  it('supports constants and functions', () => {
    near(evaluate('pi'), Math.PI)
    near(evaluate('tau'), Math.PI * 2)
    assert.equal(evaluate('sqrt(144)'), 12)
    assert.equal(evaluate('max(1, 9, 5)'), 9)
    assert.equal(evaluate('pow(2, 8)'), 256)
    assert.equal(evaluate('log(1000)'), 3)
    assert.equal(evaluate('log(4096, 2)'), 12)
    near(evaluate('sin(0)'), 0)
    assert.equal(evaluate('round(2.5)'), 3)
    assert.equal(evaluate('abs(-7) + floor(2.9) + ceil(0.1)'), 10)
  })

  it('computes the realistic case the smoke test uses', () => {
    assert.equal(evaluate('(3840 * 2160) / 1e6'), 8.2944)
    assert.equal(evaluate('(3840 * 2160) / (1920 * 1080)'), 4)
  })

  it('rejects malformed input rather than guessing', () => {
    for (const bad of ['', '   ', '1 +', '(1 + 2', '1 + 2)', '1.2.3', '2 $ 3', 'foo(1)', 'sqrt']) {
      assert.throws(() => evaluate(bad), CalcError, `expected ${JSON.stringify(bad)} to throw`)
    }
  })

  it('rejects wrong arity', () => {
    assert.throws(() => evaluate('sqrt(1, 2)'), CalcError)
    assert.throws(() => evaluate('pow(2)'), CalcError)
  })

  it('rejects division by zero instead of returning Infinity', () => {
    assert.throws(() => evaluate('1 / 0'), CalcError)
    assert.throws(() => evaluate('5 % 0'), CalcError)
  })

  it('rejects non-finite and NaN results', () => {
    assert.throws(() => evaluate('sqrt(-1)'), CalcError)
    assert.throws(() => evaluate('1e308 * 10'), CalcError)
  })

  it('does not expose the host environment', () => {
    for (const attack of [
      'process',
      'globalThis',
      'constructor',
      'require("fs")',
      'process.exit(1)',
      '__proto__',
    ]) {
      assert.throws(() => evaluate(attack), CalcError, `expected ${JSON.stringify(attack)} to throw`)
    }
  })

  it('bounds expression length', () => {
    assert.throws(() => evaluate('1+'.repeat(400) + '1'), CalcError)
  })
})

describe('calculator tool', () => {
  const run = (expression: string) =>
    (calculator as unknown as { execute: (a: { expression: string }) => Promise<any> }).execute({
      expression,
    })

  it('returns a structured success', async () => {
    const out = await run('(3840 * 2160) / 1e6')
    assert.equal(out.ok, true)
    assert.equal(out.value, 8.2944)
    assert.equal(out.formatted, '8.2944')
  })

  it('returns errors as data so the model can retry', async () => {
    const out = await run('1 / 0')
    assert.equal(out.ok, false)
    assert.match(out.error, /Division by zero/)
  })

  it('trims floating point noise in the formatted value', async () => {
    const out = await run('0.1 + 0.2')
    assert.equal(out.value, 0.1 + 0.2)
    assert.equal(out.formatted, '0.3')
  })
})

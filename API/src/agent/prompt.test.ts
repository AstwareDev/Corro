import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSystemPrompt } from './prompt.js'

const AM_REGION = { code: 'AM', name: 'Armenia' }
const ALL_CURRENCY = ['currency_convert', 'ameriabank_rates', 'idbank_rates']

describe('local bank boards note', () => {
  it('names the Armenian boards for a caller in Armenia', () => {
    const prompt = buildSystemPrompt({ toolNames: ALL_CURRENCY, region: AM_REGION })
    assert.ok(prompt.includes('local bank rate boards'))
    assert.ok(prompt.includes('alongside currency_convert'))
  })

  it('stays silent without a region', () => {
    const prompt = buildSystemPrompt({ toolNames: ALL_CURRENCY })
    assert.ok(!prompt.includes('local bank rate boards'))
  })

  it('stays silent for regions with no boards', () => {
    const prompt = buildSystemPrompt({ toolNames: ALL_CURRENCY, region: { code: 'US', name: 'United States' } })
    assert.ok(!prompt.includes('local bank rate boards'))
  })

  it('only names boards that are actually available', () => {
    const prompt = buildSystemPrompt({ toolNames: ['currency_convert', 'ameriabank_rates'], region: AM_REGION })
    assert.ok(prompt.includes('local bank rate boards: ameriabank_rates'))
    assert.ok(!prompt.includes('idbank_rates'))
  })
})

describe('UI blocks section', () => {
  it('documents chart and map only', () => {
    const prompt = buildSystemPrompt({ toolNames: [] })
    assert.ok(prompt.includes('```chart'), 'missing ```chart')
    assert.ok(prompt.includes('```map'), 'missing ```map')
    assert.ok(prompt.includes('One map per reply'))
    assert.ok(prompt.includes('Never invent addresses or coordinates'))
    assert.ok(prompt.includes('Do not repeat the address'))
    assert.ok(prompt.includes('Maximum two UI blocks per reply'))
  })

  it('no longer documents removed blocks', () => {
    const prompt = buildSystemPrompt({ toolNames: [] })
    for (const fence of ['```products', '```places', '```actions', '```facts', '```callout', '```stats', '```image']) {
      assert.ok(!prompt.includes(fence), `should not include ${fence}`)
    }
    assert.ok(!prompt.includes('"button"'))
    assert.ok(!prompt.includes('Never invent prices'))
  })
})

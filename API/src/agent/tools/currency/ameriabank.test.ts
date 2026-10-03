import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AmeriabankError, convertAtBank, parseRatesTable } from './ameriabank.js'

const FIXTURE = `
<table cellspacing="0" rules="all" border="1" id="dnn_ctr44236_View_grdRates" style="border-collapse:collapse;">
  <tr class="Header">
    <td class="HeaderCell"></td><td class="HeaderCell" colspan="2">cash</td><td class="HeaderCell" colspan="2">non-cash</td>
  </tr><tr class="Header">
    <th scope="col">&nbsp;</th><th scope="col">buy</th><th scope="col">sell</th><th scope="col">buy</th><th scope="col">sell</th>
  </tr><tr class="Item">
    <td align="center">USD</td><td align="right">360.50</td><td align="right">365.50</td><td align="right">360.50</td><td align="right">365.50</td>
  </tr><tr class="Item">
    <td align="center">EUR</td><td align="right">404.50</td><td align="right">418.50</td><td align="right">404.50</td><td align="right">418.50</td>
  </tr><tr class="Item">
    <td align="center">SEK</td><td align="right">&nbsp;</td><td align="right">&nbsp;</td><td align="right">34.50</td><td align="right">38.50</td>
  </tr><tr class="Item">
    <td align="center">GEL</td><td align="right">134.00</td><td align="right">144.50</td><td align="right">&nbsp;</td><td align="right">&nbsp;</td>
  </tr>
</table>
`

describe('parseRatesTable', () => {
  it('reads cash and non-cash buy/sell per currency', () => {
    const rates = parseRatesTable(FIXTURE)
    assert.equal(rates.length, 4)
    assert.deepEqual(rates[0], {
      code: 'USD',
      cash: { buy: 360.5, sell: 365.5 },
      nonCash: { buy: 360.5, sell: 365.5 },
    })
  })

  it('leaves unpublished cells out instead of zeroing them', () => {
    const rates = parseRatesTable(FIXTURE)
    assert.deepEqual(rates[2], { code: 'SEK', cash: {}, nonCash: { buy: 34.5, sell: 38.5 } })
    assert.deepEqual(rates[3], { code: 'GEL', cash: { buy: 134, sell: 144.5 }, nonCash: {} })
  })

  it('throws a layout error when the table is gone', () => {
    assert.throws(() => parseRatesTable('<html><body>redesign</body></html>'), AmeriabankError)
  })
})

describe('convertAtBank', () => {
  const rates = parseRatesTable(FIXTURE)

  it('converts foreign to AMD at the buy rate', () => {
    const leg = convertAtBank(rates, 100, 'USD', 'AMD', true)
    assert.equal(leg.converted, 36050)
    assert.equal(leg.rate, 360.5)
  })

  it('converts AMD to foreign at the sell rate', () => {
    const leg = convertAtBank(rates, 10000, 'AMD', 'USD', true)
    assert.equal(leg.converted, 27.36)
  })

  it('crosses foreign pairs through AMD', () => {
    const leg = convertAtBank(rates, 100, 'USD', 'EUR', true)
    assert.equal(leg.converted, 86.14)
  })

  it('honours the non-cash book', () => {
    const leg = convertAtBank(rates, 1000, 'SEK', 'AMD', false)
    assert.equal(leg.converted, 34500)
  })

  it('passes same-currency amounts through', () => {
    assert.equal(convertAtBank(rates, 5, 'USD', 'USD', true).converted, 5)
  })

  it('reports missing legs instead of guessing', () => {
    assert.throws(() => convertAtBank(rates, 100, 'SEK', 'AMD', true), AmeriabankError)
    assert.throws(() => convertAtBank(rates, 100, 'GEL', 'AMD', false), AmeriabankError)
  })
})

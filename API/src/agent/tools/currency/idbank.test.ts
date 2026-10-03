import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IdbankError, parseBoard } from './idbank.js'
import { convertLegs } from './legs.js'

const FRAGMENT = `
<div class="m-exchange__table">
  <div class="m-exchange__table-row m-exchange__table-row--header">
    <div class="m-exchange__table-cell">Currency</div>
    <div class="m-exchange__table-cell">Buy</div>
    <div class="m-exchange__table-cell">Sell</div>
  </div>
  <div class="m-exchange__table-row">
    <div class="m-exchange__table-cell">
      <svg class="m-exchange__table-cell-icon"><use href="#svg-icon-flag-usa"></use></svg>1 USD
    </div>
    <div class="m-exchange__table-cell">
      360.5
    </div>
    <div class="m-exchange__table-cell">
      365
    </div>
  </div>
  <div class="m-exchange__table-row">
    <div class="m-exchange__table-cell">
      <svg class="m-exchange__table-cell-icon"><use href="#svg-icon-flag-rus"></use></svg>1 RUB
    </div>
    <div class="m-exchange__table-cell">
      <svg class="m-exchange__table-cell-icon m-exchange__table-cell-icon--revers"><use href="#svg-icon-chevron-down-fill"></use></svg>4.2526
    </div>
    <div class="m-exchange__table-cell">
      -
    </div>
  </div>
  <div class="m-exchange__table-row">
    <div class="m-exchange__table-cell">
      1 gram
    </div>
    <div class="m-exchange__table-cell">
      -
    </div>
    <div class="m-exchange__table-cell">
      66804
    </div>
  </div>
</div>
<p class="main-calc__article"><br>*contractual basis.</br>Updated at:  2026.10.01 20:42:02</p>
`

describe('parseBoard', () => {
  it('reads currency rows with trend icons stripped', () => {
    const board = parseBoard(FRAGMENT, 'transfer')
    assert.equal(board.kind, 'transfer')
    assert.equal(board.updated, '2026.10.01 20:42:02')
    assert.deepEqual(board.rates[0], { code: 'USD', unit: 1, buy: 360.5, sell: 365 })
  })

  it('keeps card-rate precision and leaves dashes out', () => {
    const board = parseBoard(FRAGMENT, 'transfer')
    assert.deepEqual(board.rates[1], { code: 'RUB', unit: 1, buy: 4.2526 })
  })

  it('skips bullion rows that are not currencies', () => {
    const board = parseBoard(FRAGMENT, 'transfer')
    assert.equal(board.rates.length, 2)
    assert.ok(board.rates.every((r) => r.code !== 'gram'))
  })

  it('throws a layout error when the table is gone', () => {
    assert.throws(() => parseBoard('<html><body>redesign</body></html>', 'cash'), IdbankError)
  })
})

describe('convertLegs over an IDBank board', () => {
  const board = parseBoard(FRAGMENT, 'cash')
  const fail = (message: string) => new IdbankError(`IDBank cash board publishes ${message}`)

  it('converts at the card-precision buy rate', () => {
    const leg = convertLegs(board.rates, 1000, 'RUB', 'AMD', { fail, side: 'cards' })
    assert.equal(leg.converted, 4252.6)
  })

  it('reports a missing sell leg instead of guessing', () => {
    assert.throws(() => convertLegs(board.rates, 1000, 'AMD', 'RUB', { fail, side: 'transfer' }), IdbankError)
  })
})

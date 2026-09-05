import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createPresentationTools } from './index.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-presentation-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const tools = createPresentationTools(root)
const opts = { toolCallId: 'test', messages: [], context: {} }
function result<T>(value: T | AsyncIterable<T>): T {
  assert.ok(!(value && typeof value === 'object' && Symbol.asyncIterator in value))
  return value as T
}

test('builds a real .pptx file with one slide per entry plus a title slide', async () => {
  const out = result(
    await tools.create_presentation.execute!(
      {
        description: 'Building a demo deck',
        path: 'deck.pptx',
        title: 'Q3 Review',
        subtitle: 'Prepared for the team',
        slides: [
          { title: 'Highlights', bullets: ['Revenue up', 'Two new hires'] },
          { title: 'Next steps', text: 'Ship the v2 API.' },
        ],
      },
      opts
    )
  )
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.equal(out.slideCount, 3)
  assert.equal(out.verified, true)
  assert.equal(out.created, true)
  assert.ok(out.viewUrl.includes('/workspace/view'))
  assert.ok(out.viewUrl.includes(encodeURIComponent('deck.pptx')))

  const full = path.join(root, 'deck.pptx')
  const bytes = fs.readFileSync(full)
  // A .pptx is a zip; every zip starts with the local file header signature "PK\x03\x04".
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'PK\x03\x04')
  assert.ok(bytes.length > 1000)
})

test('rejects a path that is not .pptx without writing anything', async () => {
  const out = result(
    await tools.create_presentation.execute!(
      { description: 'Building a deck', path: 'deck.txt', title: 'X', slides: [{ text: 'hi' }] },
      opts
    )
  )
  assert.equal(out.ok, false)
  assert.equal(fs.existsSync(path.join(root, 'deck.txt')), false)
})

test('a stale expectedRevision is rejected rather than overwriting a newer deck', async () => {
  const first = result(
    await tools.create_presentation.execute!(
      { description: 'Building a deck', path: 'revised.pptx', title: 'V1', slides: [{ text: 'one' }] },
      opts
    )
  )
  assert.equal(first.ok, true)
  if (!first.ok) return

  const second = result(
    await tools.create_presentation.execute!(
      { description: 'Building a deck', path: 'revised.pptx', title: 'V2', slides: [{ text: 'two' }], expectedRevision: first.revision },
      opts
    )
  )
  assert.equal(second.ok, true)

  const stale = result(
    await tools.create_presentation.execute!(
      { description: 'Building a deck', path: 'revised.pptx', title: 'V3', slides: [{ text: 'three' }], expectedRevision: first.revision },
      opts
    )
  )
  assert.equal(stale.ok, false)
})

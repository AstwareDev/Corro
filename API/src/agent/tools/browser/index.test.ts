import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createBrowserTools } from './index.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-browser-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const tools = createBrowserTools(root)
const opts = { toolCallId: 'test', messages: [], context: {} }
function result<T>(value: T | AsyncIterable<T>): T {
  assert.ok(!(value && typeof value === 'object' && Symbol.asyncIterator in value))
  return value as T
}

test('rejects non-http(s) schemes before touching a browser', async () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'chrome://settings', 'data:text/html,hi']) {
    const out = result(await tools.browser_open.execute!({ description: 'Opening a page', url }, opts))
    assert.equal(out.ok, false)
    if (!out.ok) assert.match(out.error, /not allowed|not a valid URL/)
  }
})

test('acting on a page before one is open reports the gap instead of a crash', async () => {
  for (const call of [
    () => tools.browser_read.execute!({ description: 'Reading the page' }, opts),
    () => tools.browser_click.execute!({ description: 'Clicking', selector: 'button' }, opts),
    () => tools.browser_fill.execute!({ description: 'Filling', selector: 'input', value: 'x' }, opts),
    () => tools.browser_screenshot.execute!({ description: 'Screenshot', path: 'shot.png' }, opts),
  ]) {
    const out = result(await call())
    assert.equal(out.ok, false)
    if (!out.ok) assert.match(out.error, /No page is open/)
  }
})

test('screenshot requires a .png path', async () => {
  const out = result(await tools.browser_screenshot.execute!({ description: 'Screenshot', path: 'shot.jpg' }, opts))
  assert.equal(out.ok, false)
})

test('closing with nothing open reports closed: false', async () => {
  const out = result(await tools.browser_close.execute!({ description: 'Closing the browser' }, opts))
  assert.equal(out.ok, true)
  if (out.ok) assert.equal(out.closed, false)
})

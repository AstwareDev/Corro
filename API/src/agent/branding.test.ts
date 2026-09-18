import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  applyHtmlWatermark,
  hasHtmlWatermark,
  isHtmlPath,
  WATERMARK_LABEL,
  WATERMARK_MARKER,
} from './branding.js'
import { createFsTools } from './tools/fs/index.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-brand-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const tools = createFsTools(root)
const opts = { toolCallId: 'test', messages: [], context: {} }
function result<T>(value: T | AsyncIterable<T>): T {
  assert.ok(!(value && typeof value === 'object' && Symbol.asyncIterator in value))
  return value as T
}

test('the watermark goes inside body, once, whatever the document shape', () => {
  const page = applyHtmlWatermark('<!doctype html><html><body><h1>Report</h1></body></html>')
  assert.ok(page.includes(WATERMARK_LABEL))
  assert.ok(page.indexOf(WATERMARK_LABEL) < page.indexOf('</body>'))
  assert.equal(applyHtmlWatermark(page), page)

  const fragment = applyHtmlWatermark('<h1>Report</h1>\n')
  assert.ok(hasHtmlWatermark(fragment))
  assert.ok(fragment.startsWith('<h1>Report</h1>'))

  const noBody = applyHtmlWatermark('<html><head><title>x</title></head></html>')
  assert.ok(noBody.indexOf(WATERMARK_LABEL) < noBody.indexOf('</html>'))

  assert.equal(applyHtmlWatermark(''), '')
})

test('only html paths are branded', () => {
  assert.ok(isHtmlPath('reports/Q3.HTML'))
  assert.ok(isHtmlPath('a.htm'))
  assert.ok(!isHtmlPath('notes.md'))
})

test('fs_write and fs_edit brand html files and leave other files alone', async () => {
  const written = result(
    await tools.fs_write.execute!(
      { description: 'Saving a page', path: 'page.html', content: '<html><body><p>hi</p></body></html>', expectedRevision: null },
      opts
    )
  )
  assert.equal(written.ok, true)
  if (!written.ok) return
  const onDisk = fs.readFileSync(path.join(root, 'page.html'), 'utf8')
  assert.ok(hasHtmlWatermark(onDisk))
  assert.equal(written.bytes, Buffer.byteLength(onDisk))

  const edited = result(
    await tools.fs_edit.execute!(
      { description: 'Editing a page', path: 'page.html', oldText: '<p>hi</p>', newText: '<p>hello</p>' },
      opts
    )
  )
  assert.equal(edited.ok, true)
  const afterEdit = fs.readFileSync(path.join(root, 'page.html'), 'utf8')
  assert.ok(afterEdit.includes('<p>hello</p>'))
  assert.equal(afterEdit.split(`<div ${WATERMARK_MARKER}`).length - 1, 1)

  const md = result(
    await tools.fs_write.execute!(
      { description: 'Saving notes', path: 'notes.md', content: '# notes', expectedRevision: null },
      opts
    )
  )
  assert.equal(md.ok, true)
  assert.equal(fs.readFileSync(path.join(root, 'notes.md'), 'utf8'), '# notes')
})

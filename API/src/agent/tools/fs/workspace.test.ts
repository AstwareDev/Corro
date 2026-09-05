import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { createFsTools } from './index.js'
import { resolveInside } from './workspace.js'
import { MAX_WRITE_BYTES, revisionOf, saveText } from './storage.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-fs-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
const tools = createFsTools(root)
const opts = { toolCallId: 'test', messages: [], context: {} }
function result<T>(value: T | AsyncIterable<T>): T {
  assert.ok(!(value && typeof value === 'object' && Symbol.asyncIterator in value))
  return value as T
}

test('writes return receipts from actual bytes and distinguish no-op rewrites', async () => {
  const out = result(await tools.fs_write.execute!({ description: 'Saving a draft', path: 'draft.md', content: 'Բարև 🙂', expectedRevision: null }, opts))
  assert.equal(out.ok, true)
  if (!out.ok) return
  assert.equal(out.bytes, Buffer.byteLength('Բարև 🙂'))
  assert.equal(out.revision, revisionOf(fs.readFileSync(path.join(root, 'draft.md'))))
  assert.equal(out.changed, true)
  assert.equal(out.verified, true)
  assert.equal(saveText(path.join(root, 'draft.md'), 'Բարև 🙂', out.revision).changed, false)
})

test('stale revisions cannot overwrite newer edits', () => {
  const full = path.join(root, 'conflict.md')
  const original = saveText(full, 'original')
  saveText(full, 'newer', original.revision)
  assert.throws(() => saveText(full, 'stale', original.revision), /changed since/)
  assert.equal(fs.readFileSync(full, 'utf8'), 'newer')
  assert.throws(() => saveText(full, 'collision', null), /changed since/)
})

test('fs_edit treats dollar substitutions as literal user content', async () => {
  saveText(path.join(root, 'literal.md'), 'before TARGET after')
  const out = result(await tools.fs_edit.execute!({ description: 'Editing literal text', path: 'literal.md', oldText: 'TARGET', newText: "$& $$ $` $'" }, opts))
  assert.equal(out.ok, true)
  assert.equal(fs.readFileSync(path.join(root, 'literal.md'), 'utf8'), "before $& $$ $` $' after")
})

test('ambiguous edits fail without modifying the file', async () => {
  saveText(path.join(root, 'ambiguous.md'), 'same same')
  const out = result(await tools.fs_edit.execute!({ description: 'Editing a repeated word', path: 'ambiguous.md', oldText: 'same', newText: 'new' }, opts))
  assert.equal(out.ok, false)
  assert.equal(fs.readFileSync(path.join(root, 'ambiguous.md'), 'utf8'), 'same same')
})

test('limits count UTF-8 bytes before writing', () => {
  const full = path.join(root, 'oversize.txt')
  assert.throws(() => saveText(full, '🙂'.repeat(MAX_WRITE_BYTES / 3)), /byte limit/)
  assert.equal(fs.existsSync(full), false)
})

test('rejects traversal, workspace root, alternate streams and linked directories', () => {
  for (const relative of ['.', 'folder/..', '../escape.txt', 'C:/escape.txt', 'draft.md:stream']) assert.throws(() => resolveInside(root, relative))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-outside-test-'))
  try {
    fs.symlinkSync(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => resolveInside(root, 'link/escape.txt'), /Linked paths/)
  } finally { fs.rmSync(outside, { recursive: true, force: true }) }
})

test('delete cannot recursively remove a directory', async () => {
  saveText(path.join(root, 'folder', 'keep.md'), 'keep')
  const out = result(await tools.fs_delete.execute!({ description: 'Deleting a directory', path: 'folder' }, opts))
  assert.equal(out.ok, false)
  assert.equal(fs.existsSync(path.join(root, 'folder', 'keep.md')), true)
})

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { once } from 'node:events'
import express from 'express'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-workspace-http-'))
process.env.CORRO_DATA_DIR = root
const { workspaceRoutes } = await import('./workspace.js')
const app = express()
app.use(express.json())
app.use((req, _res, next) => { req.device = { id: 'dev_test123456', source: 'header', fingerprinted: false }; next() })
app.use(workspaceRoutes)
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
if (!address || typeof address === 'string') throw new Error('No test server port')
const base = `http://127.0.0.1:${address.port}`
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  fs.rmSync(root, { recursive: true, force: true })
})
const put = (body: unknown) => fetch(`${base}/workspace/file?session=testsession`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const json = async (response: Response) => await response.json() as {
  revision: string; verified: boolean; changed: boolean; error: string; content: string
}

test('HTTP save/read uses revisions, rejects stale updates, and bypasses caches', async () => {
  assert.equal((await put({ path: 'draft.md', content: 'missing revision' })).status, 400)
  const saved = await put({ path: 'draft.md', content: 'original', expectedRevision: null })
  assert.equal(saved.status, 200)
  const receipt = await json(saved)
  assert.equal(receipt.verified, true)
  assert.equal(receipt.changed, true)
  const read = await fetch(`${base}/workspace/file?session=testsession&path=draft.md`)
  assert.equal(read.headers.get('cache-control'), 'no-store')
  assert.equal((await json(read)).revision, receipt.revision)
  const updated = await put({ path: 'draft.md', content: 'newer', expectedRevision: receipt.revision })
  assert.equal(updated.status, 200)
  const stale = await put({ path: 'draft.md', content: 'stale', expectedRevision: receipt.revision })
  assert.equal(stale.status, 409)
  assert.match((await json(stale)).error, /changed since/)
  const actual = await fetch(`${base}/workspace/file?session=testsession&path=draft.md`).then(json)
  assert.equal(actual.content, 'newer')
})

test('HTTP deletion refuses workspace roots/directories and reports missing files', async () => {
  await put({ path: 'folder/keep.md', content: 'keep', expectedRevision: null })
  for (const target of ['.', 'folder', 'missing.md']) {
    const response = await fetch(`${base}/workspace/file?session=testsession&path=${target}`, { method: 'DELETE' })
    assert.equal(response.ok, false)
  }
  assert.equal((await fetch(`${base}/workspace/file?session=testsession&path=folder/keep.md`)).status, 200)
  assert.equal((await fetch(`${base}/workspace/file?session=testsession&path=folder/keep.md`, { method: 'DELETE' })).status, 200)
  assert.equal((await fetch(`${base}/workspace/file?session=testsession&path=folder/keep.md`)).status, 404)
})

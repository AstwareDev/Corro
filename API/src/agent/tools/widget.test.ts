import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { once } from 'node:events'
import express from 'express'

const { toolRoutes } = await import('../../routes/tools.js')
const app = express()
app.use(express.json())
app.use((req, _res, next) => { req.device = { id: 'dev_widget', source: 'header', fingerprinted: false }; next() })
app.use(toolRoutes)
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
if (!address || typeof address === 'string') throw new Error('No test server port')
const base = `http://127.0.0.1:${address.port}`
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

const post = (body: unknown) => fetch(`${base}/tools/show_widget`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

const valid = {
  description: 'Showing exponential growth',
  title: 'Growth explorer',
  widget_code: '<div>hello</div>',
}

test('show_widget is registered and renders immediately with no real work', async () => {
  const listed = await fetch(`${base}/tools`).then((r) => r.json()) as {
    data: Array<{ name: string }>
  }
  assert.ok(listed.data.some((t) => t.name === 'show_widget'))
  const res = await post(valid)
  assert.equal(res.status, 200)
  const body = await res.json() as { output: unknown }
  assert.equal(body.output, 'Rendered.')
})

test('show_widget rejects missing or runaway input', async () => {
  assert.equal((await post({ ...valid, title: '' })).status, 400)
  const { widget_code, ...withoutCode } = valid
  assert.equal((await post(withoutCode)).status, 400)
  assert.equal((await post({ ...valid, widget_code: 'x'.repeat(20001) })).status, 400)
})

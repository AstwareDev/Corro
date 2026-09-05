import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { runAgent, streamAgent, type AgentEvent } from './run.js'
import { completionIssue, pairToolRecords } from './completion.js'
import { conversation, type Session } from '../sessions/store.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-agent-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))
type StreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>
type Chunk = StreamResult['stream'] extends ReadableStream<infer T> ? T : never
function response(text?: string, calls: Array<{ id: string; name: string; input: unknown }> = []): StreamResult {
  const chunks: Chunk[] = [{ type: 'stream-start', warnings: [] }]
  if (text) chunks.push({ type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: text }, { type: 'text-end', id: 'text' })
  for (const c of calls) chunks.push({ type: 'tool-call', toolCallId: c.id, toolName: c.name, input: JSON.stringify(c.input) })
  chunks.push({ type: 'finish', finishReason: { unified: calls.length ? 'tool-calls' : 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } })
  return { stream: convertArrayToReadableStream(chunks) }
}
const messages = [{ role: 'user' as const, content: 'Change the file draft.md to sound more human.' }]

test('withholds false completion, recovers by writing, and counts every model step', async () => {
  const model = new MockLanguageModelV3({ doStream: [
    response('Done. I rewrote the whole file in your voice.'),
    response('Done before writing', [{ id: 'write-1', name: 'fs_write', input: { description: 'Saving a natural draft', path: 'draft.md', content: 'Natural draft' } }]),
    response('I updated draft.md.'),
  ] })
  const events: AgentEvent[] = []
  for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages, workspace: root, tools: ['fs_write'], maxSteps: 4 })) events.push(e)
  const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('')
  assert.equal(text, 'I updated draft.md.')
  assert.equal(fs.readFileSync(path.join(root, 'draft.md'), 'utf8'), 'Natural draft')
  const done = events.find((e) => e.type === 'done')
  assert.equal(done?.result.completion, 'complete')
  assert.equal(done?.result.usage.server.totalTokens, 45)
  assert.ok(done?.result.responseMessages.some((m) => m.role === 'tool'))
  assert.ok(!JSON.stringify(done?.result.responseMessages).includes('Done before writing'))
})

test('a read-only attempt followed by another false claim ends unverified', async () => {
  const model = new MockLanguageModelV3({ doStream: [
    response(undefined, [{ id: 'read-1', name: 'fs_read', input: { description: 'Reading the draft', path: 'draft.md' } }]),
    response("I've just rewritten the whole file. Done."),
    response('Done. The file is updated.'),
  ] })
  const result = await runAgent({ model: 'kimi-k3', languageModel: model, messages, workspace: root, tools: ['fs_read'], maxSteps: 5 })
  assert.equal(result.completion, 'unverified')
  assert.match(result.text, /No file changes were confirmed/)
  assert.equal(model.doStreamCalls.length, 3)
})

test('a successful write at the step cap is reported as partial, not a finished task', async () => {
  const model = new MockLanguageModelV3({ doStream: response(undefined, [{ id: 'cap', name: 'fs_write', input: { description: 'Saving a draft', path: 'cap.md', content: 'partial' } }]) })
  const result = await runAgent({ model: 'kimi-k3', languageModel: model, messages, workspace: root, tools: ['fs_write'], maxSteps: 1 })
  assert.equal(result.completion, 'step-limit')
  assert.match(result.text, /Confirmed file changes: `cap.md`/)
})

test('normal conversation does not require tools or a retry', async () => {
  const model = new MockLanguageModelV3({ doStream: response('Hello!') })
  const result = await runAgent({ model: 'kimi-k3', languageModel: model, messages: [{ role: 'user', content: 'Hello' }], tools: [] })
  assert.equal(result.text, 'Hello!')
  assert.equal(model.doStreamCalls.length, 1)
})

test('no-op and wrong-path writes cannot substantiate a completion claim', () => {
  const base = { toolCallId: 'a', toolName: 'fs_write', input: {}, output: { ok: true, verified: true, changed: false, path: 'draft.md' } }
  assert.ok(completionIssue('Done. I rewrote draft.md.', messages, [base]))
  assert.ok(completionIssue('Done. I rewrote other.md.', messages, [{ ...base, output: { ...base.output, changed: true } }]))
  assert.equal(completionIssue('The file already has that content; no changes were needed.', messages, [base]), undefined)
})

test('legacy sessions replay tool evidence and missing results with deterministic IDs', () => {
  const session = { messages: [{ id: 'old', role: 'assistant', content: 'Done', toolCalls: [
    { name: 'fs_read', input: { path: 'draft.md' }, output: { ok: true, content: 'old content' } },
    { name: 'fs_write', input: { path: 'draft.md' } },
  ] }] } as Session
  const replay = conversation(session)
  assert.equal(replay.filter((m) => m.role === 'tool').length, 2)
  assert.match(JSON.stringify(replay), /success is unknown/)
  assert.equal(replay.at(-1)?.content, 'Done')
  assert.equal(JSON.stringify(replay), JSON.stringify(conversation(session)))
})

test('parallel results are paired by ID even for multiple calls of the same tool', () => {
  const records = pairToolRecords([{
    toolCalls: [{ toolCallId: 'one', toolName: 'fs_write', input: { path: 'one.md' } }, { toolCallId: 'two', toolName: 'fs_write', input: { path: 'two.md' } }],
    toolResults: [{ toolCallId: 'two', toolName: 'fs_write', output: { ok: false, error: 'failed' } }, { toolCallId: 'one', toolName: 'fs_write', output: { ok: true, path: 'one.md' } }],
  }])
  assert.deepEqual(records[0].output, { ok: true, path: 'one.md' })
  assert.deepEqual(records[1].output, { ok: false, error: 'failed' })
})

test('failed tools emit failed output and cannot substantiate a success', async () => {
  const model = new MockLanguageModelV3({ doStream: [
    response(undefined, [{ id: 'bad', name: 'fs_write', input: { description: 'Saving the draft', path: '../outside.md', content: 'no' } }]),
    response('Done. I updated draft.md.'), response('Done. I updated draft.md.'),
  ] })
  const run = await runAgent({ model: 'kimi-k3', languageModel: model, messages, workspace: root, tools: ['fs_write'], maxSteps: 4 })
  assert.equal(run.completion, 'unverified')
  assert.match(run.text, /Tool failure:/)
  assert.equal((run.steps[0].toolResults[0].output as { ok: boolean }).ok, false)
})

test('cancellation preserves confirmed mutations in the result and replay', async () => {
  const controller = new AbortController()
  const model = new MockLanguageModelV3({ doStream: response(undefined, [{ id: 'cancel', name: 'fs_write', input: { description: 'Saving before stop', path: 'cancel.md', content: 'saved before cancellation' } }]) })
  let result
  for await (const event of streamAgent({ model: 'kimi-k3', languageModel: model, messages, workspace: root, tools: ['fs_write'], abortSignal: controller.signal })) {
    if (event.type === 'tool-result') controller.abort()
    if (event.type === 'done') result = event.result
  }
  assert.equal(result?.finishReason, 'aborted')
  assert.match(result?.text ?? '', /Confirmed file changes: `cancel.md`/)
  assert.ok(result?.responseMessages.some((m) => m.role === 'tool'))
  assert.equal(fs.readFileSync(path.join(root, 'cancel.md'), 'utf8'), 'saved before cancellation')
})

test('honest partial reports and content removals are not mistaken for file deletions', () => {
  const call = { toolCallId: 'a', toolName: 'fs_edit', input: {}, output: { ok: true, verified: true, changed: true, path: 'draft.md' } }
  assert.equal(completionIssue('I updated draft.md. I could not change missing.md.', messages, [call]), undefined)
  assert.equal(completionIssue('I updated draft.md and removed the stiff transitions.', messages, [call]), undefined)
  assert.ok(completionIssue('I verified it by reading the file back.', messages, [call]))
  assert.ok(completionIssue('I verified it by reading the file back.', messages, []))
  assert.equal(completionIssue('I verified it by reading the file back.', messages, [call, { toolCallId: 'b', toolName: 'fs_read', input: {}, output: { ok: true, path: 'draft.md' } }]), undefined)
})

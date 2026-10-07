import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test'
import { runAgent, streamAgent, type AgentEvent } from './run.js'
import {
  classifyFailure,
  guardTools,
  retryDelayMs,
  toolHistory,
  type RetryConfig,
} from './resilient.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-resilient-test-'))
after(() => fs.rmSync(root, { recursive: true, force: true }))

type StreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>
type Chunk = StreamResult['stream'] extends ReadableStream<infer T> ? T : never

const FAST: Partial<RetryConfig> = {
  maxRetries: 4,
  baseDelayMs: 5,
  maxDelayMs: 50,
  stallTimeoutMs: 300,
}

function textChunks(text: string): Chunk[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: text },
    { type: 'text-end', id: 'text' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } },
  ]
}

function toolChunks(id: string, name: string, input: unknown): Chunk[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } },
  ]
}

function fixed(chunks: Chunk[]): StreamResult {
  return { stream: convertArrayToReadableStream(chunks) }
}

function dying(chunks: Chunk[], err: Error): StreamResult {
  let i = 0
  return {
    stream: new ReadableStream<Chunk>({
      pull(c) {
        if (i < chunks.length) c.enqueue(chunks[i++])
        else c.error(err)
      },
    }),
  }
}

function cutText(prefix: string): Chunk[] {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: prefix },
  ]
}

function httpError(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { statusCode: status, responseHeaders: headers })
}

type StreamOptions = Parameters<MockLanguageModelV3['doStream']>[0]

function hanging(firstDelta?: string) {
  return async (options: StreamOptions): Promise<StreamResult> => ({
    stream: new ReadableStream<Chunk>({
      start(c) {
        c.enqueue({ type: 'stream-start', warnings: [] })
        if (firstDelta) {
          c.enqueue({ type: 'text-start', id: 'text' })
          c.enqueue({ type: 'text-delta', id: 'text', delta: firstDelta })
        }
        options.abortSignal?.addEventListener('abort', () => {
          try { c.close() } catch {}
        }, { once: true })
      },
    }),
  })
}

const hello = [{ role: 'user' as const, content: 'Hello' }]
const draftMessages = [{ role: 'user' as const, content: 'Change the file draft.md to sound more human.' }]
const draftInput = {
  description: 'Saving a natural draft',
  path: 'draft.md',
  content: 'Natural draft',
}

function statuses(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === 'status').map((e) => (e as { message: string }).message)
}

test('a stream cut off mid-text resumes without duplicating text', async () => {
  const model = new MockLanguageModelV3({
    doStream: [
      dying(cutText('Hello '), new Error('socket hang up')),
      fixed(textChunks('world')),
    ],
  })
  const events: AgentEvent[] = []
  for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], retry: FAST })) events.push(e)
  const text = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
  assert.equal(text, 'Hello world')
  assert.equal(model.doStreamCalls.length, 2)
  assert.match(statuses(events).join('\n'), /resuming \(attempt 2\)/)
})

test('a stream that ends with no finish chunk resumes and merges', async () => {
  const model = new MockLanguageModelV3({ doStream: [fixed(cutText('Hello ')), fixed(textChunks('world'))] })
  const result = await runAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], retry: FAST })
  assert.equal(result.text, 'Hello world')
  assert.equal(model.doStreamCalls.length, 2)
})

test('a stream cut off mid tool call discards the partial call and runs it once', async () => {
  const model = new MockLanguageModelV3({
    doStream: [
      dying([
        { type: 'stream-start', warnings: [] },
        { type: 'tool-input-start', id: 'w1', toolName: 'fs_write' },
        { type: 'tool-input-delta', id: 'w1', delta: '{"descri' },
      ], new Error('socket hang up')),
      fixed(toolChunks('w1', 'fs_write', draftInput)),
      fixed(textChunks('Saved draft.md.')),
    ],
  })
  const result = await runAgent({ model: 'kimi-k3', languageModel: model, messages: draftMessages, workspace: root, tools: ['fs_write'], retry: FAST })
  assert.equal(fs.readFileSync(path.join(root, 'draft.md'), 'utf8'), 'Natural draft')
  assert.equal(result.completion, 'complete')
  assert.equal(model.doStreamCalls.length, 3)
})

test('a tool call cut off before completion never executes; the retry runs it once', async () => {
  const guardInput = { ...draftInput, path: 'guard.md' }
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      if (calls === 1) {
        return {
          stream: new ReadableStream<Chunk>({
            start(c) {
              c.enqueue({ type: 'stream-start', warnings: [] })
              c.enqueue({ type: 'tool-call', toolCallId: 'w1', toolName: 'fs_write', input: JSON.stringify(guardInput) })
            },
          }),
        }
      }
      if (calls === 2) {
        return fixed([
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'w2', toolName: 'fs_write', input: JSON.stringify(guardInput) },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } },
        ])
      }
      return fixed(textChunks('Saved guard.md.'))
    },
  })
  const result = await runAgent({
    model: 'kimi-k3',
    languageModel: model,
    messages: [{ role: 'user' as const, content: 'Change the file guard.md to sound more human.' }],
    workspace: root,
    tools: ['fs_write'],
    retry: { ...FAST, stallTimeoutMs: 150 },
  })
  const outputs = result.steps.flatMap((s) => s.toolResults.map((r) => r.output as { ok?: boolean; changed?: boolean }))
  assert.equal(calls, 3)
  assert.equal(outputs.length, 1)
  assert.equal(outputs[0]?.changed, true)
  assert.equal(fs.readFileSync(path.join(root, 'guard.md'), 'utf8'), 'Natural draft')
  assert.equal(result.completion, 'complete')
})

test('guarded tools replay stored outputs without re-executing', async () => {
  let executions = 0
  const tools = {
    calc: {
      execute: async (args: unknown) => {
        executions++
        return { ok: true, value: args }
      },
    },
  }
  const completed = new Map<string, unknown>([['calc:{"a":1}', { ok: true, value: 'stored' }]])
  const guarded = guardTools(tools, completed) as Record<string, { execute: (args: unknown, opts: unknown) => Promise<unknown> }>
  assert.deepEqual(await guarded.calc.execute({ a: 1 }, {}), { ok: true, value: 'stored' })
  assert.equal(executions, 0)
  assert.deepEqual(await guarded.calc.execute({ a: 2 }, {}), { ok: true, value: { a: 2 } })
  assert.equal(executions, 1)
})

test('toolHistory rebuilds assistant and tool messages for completed calls', async () => {
  const messages = toolHistory([{ id: 'w1', name: 'fs_write', input: { path: 'a.md' }, output: { ok: true } }])
  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'assistant')
  assert.equal(messages[1].role, 'tool')
  assert.match(JSON.stringify(messages), /w1/)
  assert.match(JSON.stringify(messages), /fs_write/)
})

test('a stalled stream aborts internally and resumes', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      calls++
      if (calls === 1) return hanging()(options)
      return fixed(textChunks('Hello there'))
    },
  })
  const result = await runAgent({
    model: 'kimi-k3',
    languageModel: model,
    messages: hello,
    tools: [],
    retry: { ...FAST, stallTimeoutMs: 80 },
  })
  assert.equal(result.text, 'Hello there')
  assert.equal(calls, 2)
})

test('a 503 then success recovers with one status event', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      if (calls === 1) throw httpError(503)
      return fixed(textChunks('recovered'))
    },
  })
  const events: AgentEvent[] = []
  for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], retry: FAST })) events.push(e)
  const text = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
  assert.equal(text, 'recovered')
  assert.equal(calls, 2)
  assert.equal(statuses(events).length, 1)
  assert.match(statuses(events)[0], /HTTP 503/)
})

test('a 429 honors Retry-After before succeeding', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      if (calls === 1) throw httpError(429, { 'retry-after': '1' })
      return fixed(textChunks('recovered'))
    },
  })
  const started = Date.now()
  const result = await runAgent({
    model: 'kimi-k3',
    languageModel: model,
    messages: hello,
    tools: [],
    retry: { ...FAST, baseDelayMs: 10, maxDelayMs: 10000 },
  })
  assert.equal(result.text, 'recovered')
  assert.equal(calls, 2)
  assert.ok(Date.now() - started >= 900, 'Retry-After was not honored')
})

test('a 403 surfaces immediately with no retry', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      throw httpError(403)
    },
  })
  const events: AgentEvent[] = []
  for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], retry: FAST })) events.push(e)
  const done = events.find((e) => e.type === 'done')
  assert.equal(calls, 1)
  assert.equal(statuses(events).length, 0)
  assert.match(done?.result.text ?? '', /HTTP 403/)
  assert.equal(done?.result.completion, 'unverified')
})

test('user abort during streaming stops at once with no retry', async () => {
  const controller = new AbortController()
  const model = new MockLanguageModelV3({ doStream: hanging('Hi ') })
  const events: AgentEvent[] = []
  const timer = setTimeout(() => controller.abort(), 40)
  try {
    for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], abortSignal: controller.signal, retry: { ...FAST, stallTimeoutMs: 5000 } })) {
      events.push(e)
    }
  } finally {
    clearTimeout(timer)
  }
  const done = events.find((e) => e.type === 'done')
  assert.equal(model.doStreamCalls.length, 1)
  assert.equal(statuses(events).length, 0)
  assert.equal(done?.result.finishReason, 'aborted')
})

test('user abort during backoff stops with no second attempt', async () => {
  const controller = new AbortController()
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      throw httpError(503)
    },
  })
  const timer = setTimeout(() => controller.abort(), 40)
  const events: AgentEvent[] = []
  try {
    for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], abortSignal: controller.signal, retry: { ...FAST, baseDelayMs: 400 } })) {
      events.push(e)
    }
  } finally {
    clearTimeout(timer)
  }
  const done = events.find((e) => e.type === 'done')
  assert.equal(calls, 1)
  assert.equal(done?.result.finishReason, 'aborted')
  assert.match(done?.result.text ?? '', /stopped before completion/)
})

test('repeated failures give up but keep the partial output', async () => {
  let calls = 0
  const model = new MockLanguageModelV3({
    doStream: async () => {
      calls++
      if (calls === 1) return dying(cutText('Partial '), new Error('socket hang up'))
      throw httpError(503)
    },
  })
  const events: AgentEvent[] = []
  for await (const e of streamAgent({ model: 'kimi-k3', languageModel: model, messages: hello, tools: [], retry: { ...FAST, maxRetries: 2 } })) events.push(e)
  const done = events.find((e) => e.type === 'done')
  assert.equal(calls, 4)
  assert.match(done?.result.text ?? '', /Partial /)
  assert.match(done?.result.text ?? '', /kept failing/)
  assert.equal(done?.result.completion, 'unverified')
})

test('classifyFailure separates cancels, terminal errors and interruptions', async () => {
  assert.equal(classifyFailure(new Error('nope'), true).kind, 'user-cancel')
  assert.equal(classifyFailure(Object.assign(new Error('aborted'), { name: 'AbortError' }), false).kind, 'interrupted')
  for (const status of [400, 401, 403, 404, 402, 422]) {
    assert.equal(classifyFailure(httpError(status), false).kind, 'terminal', `HTTP ${status}`)
  }
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(classifyFailure(httpError(status), false).kind, 'interrupted', `HTTP ${status}`)
  }
  assert.equal(classifyFailure(new TypeError('fetch failed'), false).kind, 'interrupted')
  assert.equal(classifyFailure(new Error('socket hang up'), false).kind, 'interrupted')
  assert.equal(classifyFailure(httpError(429, { 'retry-after': '2' }), false).retryAfterMs, 2000)
})

test('retryDelayMs backs off with jitter and honors caps', async () => {
  const cfg: RetryConfig = { maxRetries: 8, baseDelayMs: 1000, maxDelayMs: 30000, stallTimeoutMs: 60000 }
  const first = retryDelayMs(0, cfg)
  assert.ok(first >= 1000 && first < 1250, `first delay ${first}`)
  const capped = retryDelayMs(10, cfg)
  assert.ok(capped >= 30000 && capped < 30250, `capped delay ${capped}`)
  const honored = retryDelayMs(0, cfg, 5000)
  assert.ok(honored >= 5000 && honored < 5250, `retry-after delay ${honored}`)
})

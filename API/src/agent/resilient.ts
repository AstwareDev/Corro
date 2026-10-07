import { stepCountIs, streamText, type LanguageModel, type ModelMessage } from 'ai'
import {
  NIM_MAX_RETRIES,
  NIM_RETRY_BASE_MS,
  NIM_RETRY_MAX_MS,
  NIM_STALL_TIMEOUT_MS,
} from '../config.js'

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  stallTimeoutMs: number
}

export function retryConfig(override?: Partial<RetryConfig>): RetryConfig {
  const pick = (v: number | undefined, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  return {
    maxRetries: Math.trunc(pick(override?.maxRetries, NIM_MAX_RETRIES)),
    baseDelayMs: pick(override?.baseDelayMs, NIM_RETRY_BASE_MS),
    maxDelayMs: pick(override?.maxDelayMs, NIM_RETRY_MAX_MS),
    stallTimeoutMs: pick(override?.stallTimeoutMs, NIM_STALL_TIMEOUT_MS),
  }
}

export const CONTINUE_PROMPT =
  'Continue exactly from where you stopped. Do not repeat anything.'

export type FailureKind = 'user-cancel' | 'terminal' | 'interrupted'

export interface ClassifiedFailure {
  kind: FailureKind
  status?: number
  retryAfterMs?: number
  reason: string
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const TERMINAL_STATUS = new Set([400, 401, 403, 404])

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const obj = err as Record<string, unknown>
  for (const key of ['statusCode', 'status']) {
    const n = Number(obj[key])
    if (Number.isFinite(n)) return n
  }
  const response = obj.response
  if (response && typeof response === 'object') {
    const n = Number((response as Record<string, unknown>).status)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function headerValues(err: unknown): Record<string, string> {
  const obj = err as Record<string, unknown>
  for (const key of ['responseHeaders', 'headers']) {
    const h = obj[key]
    if (h && typeof h === 'object') return h as Record<string, string>
  }
  const response = obj.response
  if (response && typeof response === 'object') {
    const h = (response as Record<string, unknown>).headers
    if (h && typeof h === 'object') return h as Record<string, string>
  }
  return {}
}

function retryAfterMs(err: unknown): number | undefined {
  const raw = headerValues(err)['retry-after']
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = Date.parse(trimmed)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
}

function shortReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const first = message.split('\n')[0].trim()
  return first.length > 120 ? `${first.slice(0, 117)}...` : first || 'unknown error'
}

export function classifyFailure(err: unknown, userAborted: boolean): ClassifiedFailure {
  if (userAborted) return { kind: 'user-cancel', reason: shortReason(err) }
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: 'interrupted', reason: shortReason(err) || 'request aborted mid-stream' }
  }
  const status = statusOf(err)
  if (status !== undefined) {
    if (TERMINAL_STATUS.has(status)) return { kind: 'terminal', status, reason: shortReason(err) }
    if (RETRYABLE_STATUS.has(status) || status >= 500) {
      return {
        kind: 'interrupted',
        status,
        retryAfterMs: status === 429 ? retryAfterMs(err) : undefined,
        reason: shortReason(err) || `HTTP ${status}`,
      }
    }
    return { kind: 'terminal', status, reason: shortReason(err) }
  }
  return { kind: 'interrupted', reason: shortReason(err) }
}

export function retryDelayMs(failures: number, cfg: RetryConfig, waitMs?: number): number {
  const jitter = Math.floor(Math.random() * 250)
  if (waitMs !== undefined) return Math.min(cfg.maxDelayMs, waitMs) + jitter
  return Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** Math.max(0, failures)) + jitter
}

function sleep(ms: number, signal?: AbortSignal): Promise<'slept' | 'aborted'> {
  if (signal?.aborted) return Promise.resolve('aborted')
  if (!(ms > 0)) return Promise.resolve('slept')
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve('slept')
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve('aborted')
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function isFailedToolOutput(output: unknown): boolean {
  if (output === null || typeof output !== 'object') return false
  const out = output as Record<string, unknown>
  return out.ok === false || out.error !== undefined
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${stable(record[k])}`).join(',')}}`
}

export function guardTools(
  tools: Record<string, unknown> | undefined,
  completed: Map<string, unknown>,
): Record<string, unknown> | undefined {
  if (!tools) return undefined
  const guarded: Record<string, unknown> = {}
  for (const [name, tool] of Object.entries(tools)) {
    const execute = (tool as { execute?: unknown }).execute
    if (typeof execute !== 'function') {
      guarded[name] = tool
      continue
    }
    const run = (execute as (args: unknown, opts: unknown) => Promise<unknown>).bind(tool)
    guarded[name] = {
      ...(tool as Record<string, unknown>),
      execute: async (args: unknown, opts: unknown) => {
        const key = `${name}:${stable(args)}`
        if (completed.has(key)) return completed.get(key)
        return run(args, opts)
      },
    }
  }
  return guarded
}

interface CompletedCall {
  id: string
  name: string
  input: unknown
  output: unknown
}

export function toolHistory(calls: CompletedCall[]): ModelMessage[] {
  const messages: ModelMessage[] = []
  for (const call of calls) {
    messages.push({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: call.id, toolName: call.name, input: call.input }],
    })
    messages.push({
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: call.id, toolName: call.name, output: { type: 'json', value: JSON.parse(JSON.stringify(call.output ?? null)) } }],
    })
  }
  return messages
}

export interface ResilientStepInput {
  model: LanguageModel
  system: string
  messages: ModelMessage[]
  tools?: Record<string, unknown>
  temperature?: number
  extraArgs?: Record<string, unknown>
  abortSignal?: AbortSignal
  retry?: Partial<RetryConfig>
}

export type StepItem = { kind: 'part'; part: unknown } | { kind: 'status'; message: string }

export interface StepOutcome {
  text: string
  finishReason: string
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  responseMessages: ModelMessage[]
  gaveUp: boolean
  error?: string
  attempts: number
}

const TERMINAL_FINISH = new Set(['content-filter', 'error'])

export async function* resilientStep(input: ResilientStepInput): AsyncGenerator<StepItem, StepOutcome> {
  const cfg = retryConfig(input.retry)
  const userSignal = input.abortSignal
  const completedOutputs = new Map<string, unknown>()
  const prefixMessages: ModelMessage[] = []
  const totalUsage: StepOutcome['usage'] = {}
  let mergedText = ''
  let failures = 0
  let attempts = 0
  let lastError = 'the request failed before producing output'

  for (;;) {
    attempts++
    userSignal?.throwIfAborted()
    const resumed = prefixMessages.length > 0 || mergedText.length > 0
    const messages = resumed
      ? [
          ...input.messages,
          ...prefixMessages,
          ...(mergedText ? [{ role: 'assistant', content: mergedText } as ModelMessage] : []),
          { role: 'user', content: CONTINUE_PROMPT } as ModelMessage,
        ]
      : input.messages

    const attemptController = new AbortController()
    const onUserAbort = () => attemptController.abort()
    userSignal?.addEventListener('abort', onUserAbort, { once: true })

    let stalled = false
    let attemptText = ''
    let progress = false
    const pendingInputs = new Map<string, { name: string; input: unknown }>()
    const settled = (ms: number) => Number.isFinite(ms) && ms > 0

    try {
      const guarded = guardTools(input.tools, completedOutputs)
      const stream = streamText({
        model: input.model,
        system: input.system,
        messages,
        ...(guarded ? { tools: guarded as never } : {}),
        stopWhen: stepCountIs(1),
        // The SDK would otherwise retry failed calls on its own; all retry
        // decisions belong to this wrapper so attempts stay countable.
        maxRetries: 0,
        abortSignal: attemptController.signal,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(input.extraArgs ?? {}),
      })

      const iterator = stream.fullStream[Symbol.asyncIterator]()
      for (;;) {
        if (userSignal?.aborted) throw userSignal.reason ?? new Error('Aborted')
        const pending = iterator.next()
        pending.catch(() => {})
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<'timeout'>((resolve) => {
          if (settled(cfg.stallTimeoutMs)) timer = setTimeout(() => resolve('timeout'), cfg.stallTimeoutMs)
        })
        let winner: 'timeout' | IteratorResult<unknown>
        try {
          winner = await Promise.race([pending, timeout])
        } finally {
          if (timer) clearTimeout(timer)
        }
        if (winner === 'timeout') {
          stalled = true
          attemptController.abort()
          break
        }
        const { done, value } = winner as IteratorResult<unknown>
        if (done) break
        const part = value as {
          type?: string
          text?: unknown
          delta?: unknown
          toolCallId?: string
          id?: string
          toolName?: string
          input?: unknown
          output?: unknown
          error?: unknown
        }
        if (part.type === 'text-delta') {
          const delta = typeof part.text === 'string' ? part.text : part.delta
          if (typeof delta === 'string' && delta) {
            attemptText += delta
            progress = true
          }
        } else if (part.type === 'tool-call') {
          progress = true
          pendingInputs.set(part.toolCallId ?? part.id ?? '', {
            name: part.toolName ?? 'unknown',
            input: part.input,
          })
        } else if (part.type === 'tool-result') {
          progress = true
          const id = part.toolCallId ?? part.id ?? ''
          const known = pendingInputs.get(id)
          if (known && !isFailedToolOutput(part.output)) {
            const key = `${known.name}:${stable(known.input)}`
            completedOutputs.set(key, part.output)
            const call = { id, name: known.name, input: known.input, output: part.output }
            prefixMessages.push(...toolHistory([call]))
          }
        } else if (part.type === 'tool-error') {
          progress = true
        } else if (part.type === 'error') {
          throw part.error ?? new Error('Stream failed')
        }
        yield { kind: 'part', part: value }
      }

      if (stalled) throw new Error('No chunks arrived before the stall timeout')
      if (userSignal?.aborted) throw userSignal.reason ?? new Error('Aborted')

      const finishReason = (await stream.finishReason) ?? undefined
      if (!finishReason || (finishReason !== 'stop' && finishReason !== 'tool-calls')) {
        if (TERMINAL_FINISH.has(finishReason ?? '')) {
          return {
            text: mergedText + attemptText,
            finishReason: finishReason ?? 'error',
            usage: totalUsage,
            responseMessages: prefixMessages,
            gaveUp: true,
            error: `The model stopped with finish reason "${finishReason}"`,
            attempts,
          }
        }
        throw new Error(
          finishReason === 'length'
            ? 'The response hit the output limit before finishing'
            : 'The stream ended without a finish reason',
        )
      }

      let text = attemptText
      try {
        text = await stream.text
      } catch {
        text = attemptText
      }
      try {
        const stepUsage = await stream.totalUsage
        for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
          const n = stepUsage[key]
          if (typeof n === 'number' && Number.isFinite(n)) totalUsage[key] = (totalUsage[key] ?? 0) + n
        }
      } catch {
        // usage is accounting only; never fail the step over it
      }
      const responseMessages = (await stream.response).messages
      mergedText += text
      return {
        text: mergedText,
        finishReason,
        usage: totalUsage,
        responseMessages: [...prefixMessages, ...responseMessages],
        gaveUp: false,
        attempts,
      }
    } catch (err) {
      const classified = classifyFailure(err, userSignal?.aborted ?? false)
      if (classified.kind === 'user-cancel') throw err
      if (classified.kind === 'terminal') {
        return {
          text: mergedText + attemptText,
          finishReason: 'error',
          usage: totalUsage,
          responseMessages: prefixMessages,
          gaveUp: true,
          error: classified.status ? `HTTP ${classified.status}: ${classified.reason}` : classified.reason,
          attempts,
        }
      }
      lastError = classified.reason
      mergedText += attemptText
      if (progress) failures = 0
      else failures++
      if (failures > cfg.maxRetries) {
        return {
          text: mergedText,
          finishReason: 'error',
          usage: totalUsage,
          responseMessages: prefixMessages,
          gaveUp: true,
          error: lastError,
          attempts,
        }
      }
      const wait = retryDelayMs(failures - 1, cfg, classified.retryAfterMs)
      yield {
        kind: 'status',
        message: `Connection interrupted (${classified.status ? `HTTP ${classified.status}` : classified.reason}), resuming (attempt ${attempts + 1})`,
      }
      if ((await sleep(wait, userSignal)) === 'aborted') {
        userSignal?.throwIfAborted()
        throw err
      }
    } finally {
      userSignal?.removeEventListener('abort', onUserAbort)
    }
  }
}

import { stepCountIs, streamText, type ModelMessage, type LanguageModel } from 'ai'
import { chatModel } from '../models/registry.js'
import { MODELS } from '../tokenizer/specs.js'
import { notBelow, safeMeasureContext, type ContextUsage } from '../context/usage.js'
import { getTokenizer, type ChatMessage } from '../tokenizer/index.js'
import type { ModelKey } from '../tokenizer/specs.js'
import { buildSystemPrompt, type PromptOptions } from './prompt.js'
import { selectTools } from './tools/index.js'
import { toolSpecs } from './tools/specs.js'
import { completionIssue, executionReminder, executionSummary, type ExecutionRecord } from './completion.js'

export const TOOL_FAILURE_LIMIT = 5
export const MAX_AGENT_STEPS = 40
export const MAX_AGENT_MS = 10 * 60 * 1000

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    const inner = obj.error
    if (inner && typeof inner === 'object' && typeof (inner as Record<string, unknown>).message === 'string') {
      return (inner as Record<string, unknown>).message as string
    }
    try {
      return JSON.stringify(err)
    } catch {}
  }
  return String(err)
}

export interface RunInput {
  model: ModelKey
  messages: ModelMessage[]
  languageModel?: LanguageModel
  abortSignal?: AbortSignal
  tools?: string[]
  systemExtra?: string
  skillContext?: string
  temperature?: number
  reasoningEffort?: string
  
  region?: PromptOptions['region']
  
  workspace?: string
  




  priorTraffic?: string[]
  

  contextFloor?: number
}

export interface RunStep {
  text: string
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>
  toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }>
}

export interface RunResult {
  model: ModelKey
  text: string
  finishReason: string
  steps: RunStep[]
  responseMessages: ModelMessage[]
  completion: 'complete' | 'unverified'
  usage: {
    server: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    preflight?: {
      tokens: number
      exact: boolean
      method: string
      toolsIncluded: boolean
    }
    firstStepDelta?: number
    
    peakInputTokens?: number
  }
  context?: ContextUsage
  contextRemaining?: number
}

export type AgentEvent =
  | { type: 'start'; model: ModelKey; tools: string[]; context?: ContextUsage }
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  
  
  | { type: 'tool-input-start'; id: string; name: string }
  | { type: 'tool-input-delta'; id: string; delta: string }
  | { type: 'tool-call'; id?: string; name: string; input: unknown }
  | { type: 'tool-result'; id?: string; name: string; output: unknown }
  
  
  | { type: 'context'; context: ContextUsage }
  | { type: 'done'; result: RunResult }
  | { type: 'error'; error: string }

interface Prepared {
  system: string
  toolset: Record<string, unknown>
  toolNames: string[]
  context?: ContextUsage
  preflight?: RunResult['usage']['preflight']
}

const floored = (usage: ContextUsage | undefined, floor?: number) =>
  usage && floor !== undefined ? notBelow(usage, floor) : usage

function prepare(input: RunInput): Prepared {
  const toolset = selectTools(input.tools, { workspace: input.workspace })
  const toolNames = Object.keys(toolset)
  const system = buildSystemPrompt({ toolNames, extra: input.systemExtra, skillContext: input.skillContext, region: input.region })

  const context = floored(
    safeMeasureContext({
      model: input.model,
      system,
      messages: input.messages,
      tools: toolSpecs(toolset),
      toolTraffic: input.priorTraffic,
    }),
    input.contextFloor
  )

  let preflight: RunResult['usage']['preflight']
  if (context) {
    try {
      const tk = getTokenizer(input.model)
      const specs = toolSpecs(toolset)
      const counted = tk.countChat(
        [{ role: 'system', content: system }, ...input.messages] as ChatMessage[],
        {
          tools: tk.hasTemplate && specs.length ? specs : undefined,
          reasoningEffort: resolveReasoningEffort(input.model, input.reasoningEffort),
        }
      )
      preflight = {
        tokens: counted.tokens,
        exact: counted.exact && specs.length === 0,
        method: counted.method,
        toolsIncluded: specs.length === 0 || tk.hasTemplate,
      }
    } catch {
      preflight = undefined
    }
  }

  return { system, toolset, toolNames, context, preflight }
}

function assemble(
  input: RunInput,
  prepared: Prepared,
  raw: {
    text: string
    responseMessages: ModelMessage[]
    completion: RunResult['completion']
    finishReason: string
    steps: Array<{
      text: string
      toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown } | undefined>
      toolResults: Array<{ toolCallId: string; toolName: string; output: unknown } | undefined>
      usage?: { inputTokens?: number }
    }>
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  }
): RunResult {
  const steps: RunStep[] = raw.steps.map((s) => ({
    text: s.text,
    toolCalls: s.toolCalls.flatMap((c) => (c ? [{ toolCallId: c.toolCallId, toolName: c.toolName, input: c.input }] : [])),
    toolResults: s.toolResults.flatMap((r) => (r ? [{ toolCallId: r.toolCallId, toolName: r.toolName, output: r.output }] : [])),
  }))

  const firstStepInput = raw.steps[0]?.usage?.inputTokens
  const firstStepDelta =
    prepared.preflight && typeof firstStepInput === 'number'
      ? prepared.preflight.tokens - firstStepInput
      : undefined

  
  
  
  const peakInputTokens = raw.steps.reduce<number | undefined>((peak, s) => {
    const n = s.usage?.inputTokens
    if (typeof n !== 'number') return peak
    return peak === undefined ? n : Math.max(peak, n)
  }, undefined)

  const context = floored(
    safeMeasureContext({
      model: input.model,
      system: prepared.system,
      messages: input.messages,
      tools: toolSpecs(prepared.toolset),
      toolTraffic: [...(input.priorTraffic ?? []), ...trafficOf(steps)],
      observed: peakInputTokens,
    }),
    input.contextFloor
  )

  return {
    model: input.model,
    text: raw.text,
    finishReason: raw.finishReason,
    steps,
    responseMessages: raw.responseMessages,
    completion: raw.completion,
    usage: {
      server: {
        inputTokens: raw.usage.inputTokens,
        outputTokens: raw.usage.outputTokens,
        totalTokens: raw.usage.totalTokens,
      },
      preflight: prepared.preflight,
      firstStepDelta,
      peakInputTokens,
    },
    context: context ?? prepared.context,
    contextRemaining: (context ?? prepared.context)?.remaining,
  }
}



export function trafficOf(steps: RunStep[]): string[] {
  const out: string[] = []
  for (const step of steps) {
    for (const call of step.toolCalls) out.push(JSON.stringify(call.input ?? ''))
    for (const result of step.toolResults) out.push(JSON.stringify(result.output ?? ''))
  }
  return out
}

function toolFailed(output: unknown): boolean {
  if (output === null || typeof output !== 'object') return false
  const out = output as Record<string, unknown>
  return out.ok === false || out.error !== undefined
}

function disabledNotice(disabled: Set<string>): string {
  if (!disabled.size) return ''
  return `\n<disabled_tools>\n${[...disabled].join(', ')} failed ${TOOL_FAILURE_LIMIT} times in a row and ${disabled.size === 1 ? 'has' : 'have'} been disabled for the rest of this turn. Do not call ${disabled.size === 1 ? 'it' : 'them'} again. Finish with the tools that still work, or explain what you could not do.\n</disabled_tools>`
}

export function resolveReasoningEffort(model: ModelKey, requested?: string): string | undefined {
  return requested ?? MODELS[model].defaultReasoningEffort
}

function reasoningProviderOptions(model: ModelKey, reasoningEffort?: string) {
  const effort = resolveReasoningEffort(model, reasoningEffort)
  if (!effort) return {}
  return { providerOptions: { [model]: { reasoningEffort: effort } } }
}

export async function runAgent(input: RunInput): Promise<RunResult> {
  let failure = 'Agent ended without a result'
  for await (const event of streamAgent(input)) {
    if (event.type === 'done') return event.result
    if (event.type === 'error') failure = event.error
  }
  throw new Error(failure)
}

export async function* streamAgent(input: RunInput): AsyncGenerator<AgentEvent> {
  const prepared = prepare(input)

  yield { type: 'start', model: input.model, tools: prepared.toolNames, context: prepared.context }

  const responseMessages: ModelMessage[] = []
  const steps: Array<RunStep & { usage?: { inputTokens?: number } }> = []
  const calls: ExecutionRecord[] = []
  const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {}
  let repair: string | undefined
  let rejected = 0
  let finalText = ''
  let finishReason = 'stop'
  let completion: RunResult['completion'] = 'unverified'
  const failures = new Map<string, number>()
  const disabled = new Set<string>()
  const startedAt = Date.now()
  try {
    for (let step = 0; ; step++) {
      input.abortSignal?.throwIfAborted()
      if (step >= MAX_AGENT_STEPS || Date.now() - startedAt >= MAX_AGENT_MS) {
        completion = 'unverified'
        finalText = executionSummary(calls, 'The run stopped after reaching the maximum step/time budget for a single turn.')
        break
      }
      const active = Object.fromEntries(Object.entries(prepared.toolset).filter(([name]) => !disabled.has(name)))
      const stream = streamText({
        model: input.languageModel ?? chatModel(input.model),
        system: prepared.system + '\n\n' + executionReminder(calls) + disabledNotice(disabled)
          + (repair ? `\n<completion_check>\n${repair}\nYour draft was withheld. Complete only the work the user authorized, then report the actual result; otherwise explain the limitation honestly.\n</completion_check>` : ''),
        messages: [...input.messages, ...responseMessages],
        ...(Object.keys(active).length ? { tools: active as never } : {}),
        stopWhen: stepCountIs(1),
        abortSignal: input.abortSignal,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...reasoningProviderOptions(input.model, input.reasoningEffort),
      })
      const inputs = new Map<string, { name: string; input: unknown }>()
      const results: RunStep['toolResults'] = []
    for await (const part of stream.fullStream) {
      
      
      
      const p = part as {
        type: string
        text?: string
        toolName?: string
        toolCallId?: string
        id?: string
        delta?: string
        input?: unknown
        output?: unknown
        error?: unknown
      }
      if (p.type === 'reasoning-delta' && p.text) {
        yield { type: 'reasoning', text: p.text }
      } else if (p.type === 'tool-input-start' && p.id) {
        yield { type: 'tool-input-start', id: p.id, name: p.toolName ?? 'unknown' }
      } else if (p.type === 'tool-input-delta' && p.id && p.delta) {
        yield { type: 'tool-input-delta', id: p.id, delta: p.delta }
      } else if (p.type === 'tool-call') {
        inputs.set(p.toolCallId ?? p.id ?? '', { name: p.toolName ?? 'unknown', input: p.input })
        yield {
          type: 'tool-call',
          id: p.toolCallId ?? p.id,
          name: p.toolName ?? 'unknown',
          input: p.input,
        }
      } else if (p.type === 'tool-result' || p.type === 'tool-error') {
        const id = p.toolCallId ?? p.id ?? ''
        const output = p.type === 'tool-error'
          ? { ok: false, error: errorMessage(p.error) }
          : p.output
        const name = p.toolName ?? 'unknown'
        results.push({ toolCallId: id, toolName: name, output })
        calls.push({ toolCallId: id, toolName: name, input: inputs.get(id)?.input, output })
        if (toolFailed(output)) {
          const count = (failures.get(name) ?? 0) + 1
          failures.set(name, count)
          if (count >= TOOL_FAILURE_LIMIT) disabled.add(name)
        } else {
          failures.set(name, 0)
        }
        yield {
          type: 'tool-result',
          id: p.toolCallId ?? p.id,
          name: p.toolName ?? 'unknown',
          output,
        }
        const context = floored(
          safeMeasureContext({
            model: input.model,
            system: prepared.system,
            messages: input.messages,
            tools: toolSpecs(prepared.toolset),
            toolTraffic: calls.map((c) => JSON.stringify(c)),
          }),
          input.contextFloor
        )
        if (context) yield { type: 'context', context }
      } else if (p.type === 'error') {
        throw new Error(errorMessage(p.error))
      }
    }
      const response = await stream.response
      const draft = await stream.text
      const stepUsage = await stream.totalUsage
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
        const n = stepUsage[key]
        if (typeof n === 'number' && Number.isFinite(n)) usage[key] = (usage[key] ?? 0) + n
      }
      steps.push({ text: '', toolCalls: [...inputs].map(([toolCallId, c]) => ({ toolCallId, toolName: c.name, input: c.input })), toolResults: results, usage: stepUsage })
      for (const message of response.messages) {
        if (message.role === 'tool') responseMessages.push(message)
        else if (message.role === 'assistant' && Array.isArray(message.content)) {
          const content = message.content.filter((p) => p.type === 'tool-call')
          if (content.length) responseMessages.push({ role: 'assistant', content })
        }
      }
      if (inputs.size) continue
      finishReason = await stream.finishReason
      repair = completionIssue(draft, input.messages, calls)
      if (repair) {
        rejected++
        if (rejected < 2) continue
        completion = 'unverified'
        finalText = executionSummary(calls, 'I could not verify the completion claim, so I have withheld it.')
      } else if (finishReason !== 'stop') {
        completion = 'unverified'
        finalText = executionSummary(calls, 'The response ended before completion could be confirmed.')
      } else {
        completion = 'complete'
        finalText = draft
      }
      break
    }
    if (!finalText) finalText = executionSummary(calls, 'The run ended before a final response was ready.')
    if (disabled.size) {
      finalText += `\n\nDisabled after ${TOOL_FAILURE_LIMIT} consecutive failures: ${[...disabled].map((n) => `\`${n}\``).join(', ')}.`
    }
    responseMessages.push({ role: 'assistant', content: finalText })
    yield { type: 'text', text: finalText }
    const result = assemble(input, prepared, {
      text: finalText, finishReason, steps, usage, responseMessages, completion,
    })
    yield { type: 'done', result }
  } catch (err) {
    const error = errorMessage(err) || 'Stream failed'
    const recorded = new Set(steps.flatMap((s) => s.toolCalls.map((c) => c.toolCallId)))
    for (const c of calls.filter((c) => !recorded.has(c.toolCallId))) {
      steps.push({ text: '', toolCalls: [{ toolCallId: c.toolCallId, toolName: c.toolName, input: c.input }],
        toolResults: [{ toolCallId: c.toolCallId, toolName: c.toolName, output: c.output }] })
      responseMessages.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, input: c.input }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: c.toolCallId, toolName: c.toolName, output: { type: 'json', value: JSON.parse(JSON.stringify(c.output ?? null)) } }] })
    }
    const text = executionSummary(calls, input.abortSignal?.aborted ? 'The task was stopped before completion.' : `The run failed: ${error}`)
    responseMessages.push({ role: 'assistant', content: text })
    yield { type: 'error', error }
    yield { type: 'text', text }
    yield { type: 'done', result: assemble(input, prepared, {
      text, finishReason: input.abortSignal?.aborted ? 'aborted' : 'error', steps, usage, responseMessages, completion: 'unverified',
    }) }
  }
}

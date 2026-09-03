import { generateText, stepCountIs, streamText } from 'ai'
import { chatModel } from '../models/registry.js'
import { notBelow, safeMeasureContext, type ContextUsage } from '../context/usage.js'
import { getTokenizer, type ChatMessage } from '../tokenizer/index.js'
import type { ModelKey } from '../tokenizer/specs.js'
import { buildSystemPrompt, type PromptOptions } from './prompt.js'
import { selectTools } from './tools/index.js'
import { toolSpecs } from './tools/specs.js'

export const MAX_STEPS_CAP = 16
export const DEFAULT_MAX_STEPS = 8

export interface RunInput {
  model: ModelKey
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  maxSteps?: number
  tools?: string[]
  systemExtra?: string
  temperature?: number
  reasoningEffort?: string
  
  region?: PromptOptions['region']
  
  workspace?: string
  




  priorTraffic?: string[]
  

  contextFloor?: number
}

export interface RunStep {
  text: string
  toolCalls: Array<{ toolName: string; input: unknown }>
  toolResults: Array<{ toolName: string; output: unknown }>
}

export interface RunResult {
  model: ModelKey
  text: string
  finishReason: string
  steps: RunStep[]
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
  maxSteps: number
  context?: ContextUsage
  preflight?: RunResult['usage']['preflight']
}

const floored = (usage: ContextUsage | undefined, floor?: number) =>
  usage && floor !== undefined ? notBelow(usage, floor) : usage

function prepare(input: RunInput): Prepared {
  const toolset = selectTools(input.tools, { workspace: input.workspace })
  const toolNames = Object.keys(toolset)
  const system = buildSystemPrompt({ toolNames, extra: input.systemExtra, region: input.region })
  const maxSteps = Math.min(Math.max(1, input.maxSteps ?? DEFAULT_MAX_STEPS), MAX_STEPS_CAP)

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
        { tools: tk.hasTemplate && specs.length ? specs : undefined }
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

  return { system, toolset, toolNames, maxSteps, context, preflight }
}

function assemble(
  input: RunInput,
  prepared: Prepared,
  raw: {
    text: string
    finishReason: string
    steps: Array<{
      text: string
      toolCalls: Array<{ toolName: string; input: unknown } | undefined>
      toolResults: Array<{ toolName: string; output: unknown } | undefined>
      usage?: { inputTokens?: number }
    }>
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  }
): RunResult {
  const steps: RunStep[] = raw.steps.map((s) => ({
    text: s.text,
    toolCalls: s.toolCalls.flatMap((c) => (c ? [{ toolName: c.toolName, input: c.input }] : [])),
    toolResults: s.toolResults.flatMap((r) => (r ? [{ toolName: r.toolName, output: r.output }] : [])),
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

function reasoningProviderOptions(model: ModelKey, reasoningEffort?: string) {
  if (!reasoningEffort) return {}
  return { providerOptions: { [model]: { reasoningEffort } } }
}

export async function runAgent(input: RunInput): Promise<RunResult> {
  const prepared = prepare(input)

  const result = await generateText({
    model: chatModel(input.model),
    system: prepared.system,
    messages: input.messages,
    ...(prepared.toolNames.length ? { tools: prepared.toolset as never } : {}),
    stopWhen: stepCountIs(prepared.maxSteps),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...reasoningProviderOptions(input.model, input.reasoningEffort),
  })

  return assemble(input, prepared, {
    text: result.text,
    finishReason: result.finishReason,
    steps: result.steps as never,
    usage: result.usage,
  })
}

export async function* streamAgent(input: RunInput): AsyncGenerator<AgentEvent> {
  const prepared = prepare(input)

  yield { type: 'start', model: input.model, tools: prepared.toolNames, context: prepared.context }

  const stream = streamText({
    model: chatModel(input.model),
    system: prepared.system,
    messages: input.messages,
    ...(prepared.toolNames.length ? { tools: prepared.toolset as never } : {}),
    stopWhen: stepCountIs(prepared.maxSteps),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    ...reasoningProviderOptions(input.model, input.reasoningEffort),
  })

  
  
  const traffic: string[] = [...(input.priorTraffic ?? [])]

  try {
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
      if (p.type === 'text-delta' && p.text) {
        yield { type: 'text', text: p.text }
      } else if (p.type === 'reasoning-delta' && p.text) {
        yield { type: 'reasoning', text: p.text }
      } else if (p.type === 'tool-input-start' && p.id) {
        yield { type: 'tool-input-start', id: p.id, name: p.toolName ?? 'unknown' }
      } else if (p.type === 'tool-input-delta' && p.id && p.delta) {
        yield { type: 'tool-input-delta', id: p.id, delta: p.delta }
      } else if (p.type === 'tool-call') {
        traffic.push(JSON.stringify(p.input ?? ''))
        yield {
          type: 'tool-call',
          id: p.toolCallId ?? p.id,
          name: p.toolName ?? 'unknown',
          input: p.input,
        }
      } else if (p.type === 'tool-result') {
        traffic.push(JSON.stringify(p.output ?? ''))
        yield {
          type: 'tool-result',
          id: p.toolCallId ?? p.id,
          name: p.toolName ?? 'unknown',
          output: p.output,
        }
        const context = floored(
          safeMeasureContext({
            model: input.model,
            system: prepared.system,
            messages: input.messages,
            tools: toolSpecs(prepared.toolset),
            toolTraffic: traffic,
          }),
          input.contextFloor
        )
        if (context) yield { type: 'context', context }
      } else if (p.type === 'error') {
        const message = p.error instanceof Error ? p.error.message : String(p.error)
        yield { type: 'error', error: message }
      }
    }

    const result = assemble(input, prepared, {
      text: await stream.text,
      finishReason: await stream.finishReason,
      steps: (await stream.steps) as never,
      usage: await stream.usage,
    })
    yield { type: 'done', result }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'Stream failed' }
  }
}

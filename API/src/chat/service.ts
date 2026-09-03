import { buildSystemPrompt, type PromptOptions } from '../agent/prompt.js'
import { runAgent, streamAgent, type AgentEvent, type RunResult } from '../agent/run.js'
import { selectTools, workspaceRoot } from '../agent/tools/index.js'
import { toolSpecs } from '../agent/tools/specs.js'
import { notBelow, safeMeasureContext, type ContextUsage } from '../context/usage.js'
import {
  addTotals,
  appendMessage,
  conversation,
  createSession,
  getSession,
  saveSession,
  sessionTraffic,
  type Session,
  type ToolCallRecord,
} from '../sessions/store.js'
import { nameSession } from '../sessions/titling.js'
import { getTokenizer } from '../tokenizer/index.js'
import type { ModelKey } from '../tokenizer/specs.js'

export interface ChatRequest {
  deviceId: string
  model: ModelKey
  message?: string
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  session?: string | null
  remember?: boolean
  tools?: string[]
  maxSteps?: number
  systemExtra?: string
  temperature?: number
  reasoningEffort?: string
  region?: PromptOptions['region']
}

export interface ChatOutcome {
  run: RunResult
  session?: { id: string; title: string; messageCount: number; context?: ContextUsage }
}

export class SessionNotFound extends Error {
  constructor(id: string) {
    super(`Unknown session ${JSON.stringify(id)} for this device`)
  }
}

interface Resolved {
  session: Session | null
  turn: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
}

function countTokens(model: ModelKey, text: string): number | undefined {
  try {
    return getTokenizer(model).countText(text)
  } catch {
    return undefined
  }
}

function resolve(req: ChatRequest): Resolved {
  const turn = req.message !== undefined
    ? [{ role: 'user' as const, content: req.message }]
    : (req.messages ?? [])

  if (!turn.length) throw new Error('Provide `message` or `messages`')

  const remember = req.remember ?? true
  let session: Session | null = null

  if (req.session) {
    session = getSession(req.deviceId, req.session)
    if (!session) throw new SessionNotFound(req.session)
  } else if (remember) {
    session = createSession(req.deviceId, { model: req.model })
  }

  const history = session ? conversation(session) : []
  return { session, turn, messages: [...history, ...turn] }
}

function persist(
  req: ChatRequest,
  session: Session,
  turn: Resolved['turn'],
  run: RunResult
): ContextUsage | undefined {
  const workspace = workspaceRoot(req.deviceId, session.id)

  for (const m of turn) {
    appendMessage(session, {
      role: m.role,
      content: m.content,
      tokens: countTokens(req.model, m.content),
    })
  }

  const toolCalls: ToolCallRecord[] = run.steps.flatMap((s) =>
    s.toolCalls.map((c, i) => ({
      name: c.toolName,
      input: c.input,
      output: s.toolResults[i]?.output,
    }))
  )

  appendMessage(session, {
    role: 'assistant',
    content: run.text,
    tokens: countTokens(req.model, run.text),
    toolCalls,
    usage: run.usage.server,
  })

  addTotals(session, {
    requests: 1,
    steps: run.steps.length,
    toolCalls: toolCalls.length,
    inputTokens: run.usage.server.inputTokens ?? 0,
    outputTokens: run.usage.server.outputTokens ?? 0,
    totalTokens: run.usage.server.totalTokens ?? 0,
  })

  const previous = session.context
  session.model = req.model
  const measured = safeMeasureContext({
    model: req.model,
    system: buildSystemPrompt({
      toolNames: Object.keys(selectTools(req.tools, { workspace })),
      extra: req.systemExtra,
      region: req.region,
    }),
    messages: conversation(session),
    tools: toolSpecs(selectTools(req.tools, { workspace })),
    
    
    toolTraffic: sessionTraffic(session),
    observed: run.usage.peakInputTokens,
  })

  
  
  session.context =
    measured && previous?.model === measured.model
      ? notBelow(measured, previous.used)
      : measured

  saveSession(session)
  return session.context
}




function retitle(deviceId: string, sessionId: string): void {
  const session = getSession(deviceId, sessionId)
  if (!session || session.titlePinned) return

  nameSession(session)
    .then((title) => {
      if (!title) return
      const latest = getSession(deviceId, sessionId)
      if (!latest || latest.titlePinned) return
      latest.title = title
      saveSession(latest)
    })
    .catch(() => {})
}

function summary(session: Session): NonNullable<ChatOutcome['session']> {
  return {
    id: session.id,
    title: session.title,
    messageCount: session.messages.length,
    context: session.context,
  }
}

export async function chat(req: ChatRequest): Promise<ChatOutcome> {
  const { session, turn, messages } = resolve(req)

  const run = await runAgent({
    model: req.model,
    messages,
    priorTraffic: session ? sessionTraffic(session) : undefined,
    contextFloor: session?.context?.model === req.model ? session.context.used : undefined,
    tools: req.tools,
    maxSteps: req.maxSteps,
    systemExtra: req.systemExtra,
    temperature: req.temperature,
    reasoningEffort: req.reasoningEffort,
    region: req.region,
    workspace: workspaceRoot(req.deviceId, session?.id),
  })

  if (!session) return { run }

  persist(req, session, turn, run)
  retitle(req.deviceId, session.id)
  return { run, session: summary(session) }
}

export type ChatEvent = AgentEvent | { type: 'session'; session: { id: string; title: string } }

export async function* chatStream(req: ChatRequest): AsyncGenerator<ChatEvent> {
  const { session, turn, messages } = resolve(req)

  if (session) yield { type: 'session', session: { id: session.id, title: session.title } }

  for await (const event of streamAgent({
    model: req.model,
    messages,
    priorTraffic: session ? sessionTraffic(session) : undefined,
    contextFloor: session?.context?.model === req.model ? session.context.used : undefined,
    tools: req.tools,
    maxSteps: req.maxSteps,
    systemExtra: req.systemExtra,
    temperature: req.temperature,
    reasoningEffort: req.reasoningEffort,
    region: req.region,
    workspace: workspaceRoot(req.deviceId, session?.id),
  })) {
    if (event.type === 'done' && session) {
      persist(req, session, turn, event.result)
      retitle(req.deviceId, session.id)
      yield { type: 'done', result: { ...event.result, context: session.context } }
      continue
    }
    yield event
  }
}

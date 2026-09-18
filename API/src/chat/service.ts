import fs from 'node:fs'
import path from 'node:path'
import { buildSystemPrompt, type PromptOptions } from '../agent/prompt.js'
import { runAgent, streamAgent, type AgentEvent, type RunResult } from '../agent/run.js'
import { selectTools, workspaceRoot } from '../agent/tools/index.js'
import { resolveInside } from '../agent/tools/fs/workspace.js'
import { toolSpecs } from '../agent/tools/specs.js'
import { notBelow, safeMeasureContext, type ContextUsage } from '../context/usage.js'
import { MODELS } from '../models/registry.js'
import {
  addTotals,
  appendMessage,
  conversation,
  createSession,
  getSession,
  saveSession,
  type Session,
  type ToolCallRecord,
} from '../sessions/store.js'
import { nameSession } from '../sessions/titling.js'
import { getTokenizer } from '../tokenizer/index.js'
import type { ModelKey } from '../tokenizer/specs.js'
import type { ModelMessage } from 'ai'
import { pairToolRecords } from '../agent/completion.js'

export interface ChatAttachment {
  path: string
  kind: 'image' | 'video' | 'file'
  mime?: string
}

export interface ChatRequest {
  abortSignal?: AbortSignal
  deviceId: string
  model: ModelKey
  message?: string
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  attachments?: ChatAttachment[]
  session?: string | null
  remember?: boolean
  tools?: string[]
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
  messages: ModelMessage[]
}

function countTokens(model: ModelKey, text: string): number | undefined {
  try {
    return getTokenizer(model).countText(text)
  } catch {
    return undefined
  }
}

// Uploads are private to a single chat: new files land directly in that
// session's workspace. Files uploaded before session-scoped uploads existed
// may still sit in the device's scratch workspace — if the chat call creates
// a new session, migrate the file over (legacy path).
function locateAttachment(deviceId: string, sessionWorkspace: string, relPath: string): string | null {
  try {
    const full = resolveInside(sessionWorkspace, relPath)
    if (fs.existsSync(full)) return full

    const scratch = workspaceRoot(deviceId)
    if (scratch === sessionWorkspace) return null
    const scratchFull = resolveInside(scratch, relPath)
    if (!fs.existsSync(scratchFull)) return null

    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.renameSync(scratchFull, full)
    return full
  } catch {
    return null
  }
}

function attachmentContent(req: ChatRequest, workspace: string, baseText: string): Array<Record<string, unknown>> | null {
  if (!req.attachments?.length) return null

  const supported = new Set(MODELS[req.model].modalities?.input ?? [])
  const parts: Array<Record<string, unknown>> = []
  const notes: string[] = []

  for (const att of req.attachments) {
    const full = locateAttachment(req.deviceId, workspace, att.path)

    if (full && (att.kind === 'image' || att.kind === 'video') && supported.has(att.kind)) {
      const data = fs.readFileSync(full)
      parts.push(
        att.kind === 'image'
          ? { type: 'image', image: data, mediaType: att.mime }
          : { type: 'file', data, mediaType: att.mime ?? 'video/mp4' }
      )
      continue
    }

    const sizeNote = full ? ` (${fs.statSync(full).size} bytes)` : ''
    notes.push(`Attached file: ${att.path}${sizeNote} — use fs_read to inspect it.`)
  }

  const text = notes.length ? `${baseText}\n\n${notes.join('\n')}` : baseText
  return [{ type: 'text', text }, ...parts]
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
  const messages: ModelMessage[] = [...history, ...turn]

  const lastTurnMessage = turn[turn.length - 1]
  const baseText = req.message ?? lastTurnMessage.content
  const content = attachmentContent(req, workspaceRoot(req.deviceId, session?.id), baseText)
  if (content) {
    const last = messages[messages.length - 1]
    messages[messages.length - 1] = { ...last, content } as ModelMessage
  }

  return { session, turn, messages }
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

  const toolCalls: ToolCallRecord[] = pairToolRecords(run.steps).map((c) => ({
      id: c.toolCallId,
      name: c.toolName,
      input: c.input,
      output: c.output,
    }))

  appendMessage(session, {
    role: 'assistant',
    content: run.text,
    tokens: countTokens(req.model, run.text),
    toolCalls,
    agentMessages: run.responseMessages,
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
    abortSignal: req.abortSignal,
    model: req.model,
    messages,
    contextFloor: session?.context?.model === req.model ? session.context.used : undefined,
    tools: req.tools,
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
    abortSignal: req.abortSignal,
    model: req.model,
    messages,
    contextFloor: session?.context?.model === req.model ? session.context.used : undefined,
    tools: req.tools,
    systemExtra: req.systemExtra,
    temperature: req.temperature,
    reasoningEffort: req.reasoningEffort,
    region: req.region,
    workspace: workspaceRoot(req.deviceId, session?.id),
  })) {
    if (event.type === 'done' && session) {
      persist(req, session, turn, event.result)
      if (!req.abortSignal?.aborted) retitle(req.deviceId, session.id)
      yield { type: 'done', result: { ...event.result, context: session.context } }
      continue
    }
    yield event
  }
}

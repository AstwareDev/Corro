import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type { ContextUsage } from '../context/usage.js'
import type { ModelKey } from '../tokenizer/specs.js'

export const DATA_DIR =
  process.env.CORRO_DATA_DIR ?? fileURLToPath(new URL('../../data/', import.meta.url))

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions')

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCallRecord {
  id?: string
  name: string
  input: unknown
  output?: unknown
}

export interface StoredMessage {
  id: string
  role: MessageRole
  content: string
  at: string
  tokens?: number
  toolCalls?: ToolCallRecord[]
  agentMessages?: ModelMessage[]
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

export interface SessionTotals {
  requests: number
  steps: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface Session {
  id: string
  deviceId: string
  title: string

  titlePinned?: boolean
  pinned?: boolean
  model: ModelKey
  createdAt: string
  updatedAt: string
  messages: StoredMessage[]
  totals: SessionTotals
  context?: ContextUsage
}

export interface SessionSummary {
  id: string
  title: string
  pinned?: boolean
  model: ModelKey
  createdAt: string
  updatedAt: string
  messageCount: number
  totals: SessionTotals
  context?: ContextUsage
}

const EMPTY_TOTALS: SessionTotals = {
  requests: 0,
  steps: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
}

const SAFE_ID = /^[a-z0-9_-]{4,80}$/i

export function newSessionId(): string {
  return 'ses_' + randomUUID().replace(/-/g, '').slice(0, 20)
}

function deviceDir(deviceId: string): string {
  if (!SAFE_ID.test(deviceId)) throw new Error(`Invalid device id ${JSON.stringify(deviceId)}`)
  return path.join(SESSIONS_DIR, deviceId)
}

function sessionFile(deviceId: string, sessionId: string): string {
  if (!SAFE_ID.test(sessionId)) throw new Error(`Invalid session id ${JSON.stringify(sessionId)}`)
  return path.join(deviceDir(deviceId), `${sessionId}.json`)
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Untitled'
  return clean.length > 60 ? clean.slice(0, 57) + '…' : clean
}

export function createSession(
  deviceId: string,
  init: { model: ModelKey; title?: string; id?: string }
): Session {
  const now = new Date().toISOString()
  const session: Session = {
    id: init.id ?? newSessionId(),
    deviceId,
    title: init.title ?? 'Untitled',
    model: init.model,
    createdAt: now,
    updatedAt: now,
    messages: [],
    totals: { ...EMPTY_TOTALS },
  }
  writeJson(sessionFile(deviceId, session.id), session)
  return session
}

export function getSession(deviceId: string, sessionId: string): Session | null {
  return readJson<Session>(sessionFile(deviceId, sessionId))
}

export function saveSession(session: Session): Session {
  session.updatedAt = new Date().toISOString()
  writeJson(sessionFile(session.deviceId, session.id), session)
  return session
}

export function deleteSession(deviceId: string, sessionId: string): boolean {
  try {
    fs.unlinkSync(sessionFile(deviceId, sessionId))
    return true
  } catch {
    return false
  }
}

export function listSessions(deviceId: string): SessionSummary[] {
  let files: string[]
  try {
    files = fs.readdirSync(deviceDir(deviceId)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  return files
    .map((f) => readJson<Session>(path.join(deviceDir(deviceId), f)))
    .filter((s): s is Session => s !== null)
    .map((s) => ({
      id: s.id,
      title: s.title,
      pinned: s.pinned,
      model: s.model,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      totals: s.totals,
      context: s.context,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function listDevices(): Array<{ id: string; sessions: number; updatedAt?: string }> {
  let dirs: string[]
  try {
    dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  return dirs.map((id) => {
    const sessions = listSessions(id)
    return { id, sessions: sessions.length, updatedAt: sessions[0]?.updatedAt }
  })
}

export function appendMessage(
  session: Session,
  message: Omit<StoredMessage, 'id' | 'at'> & { id?: string; at?: string }
): StoredMessage {
  const stored: StoredMessage = {
    id: message.id ?? 'msg_' + randomUUID().replace(/-/g, '').slice(0, 16),
    at: message.at ?? new Date().toISOString(),
    role: message.role,
    content: message.content,
    ...(message.tokens === undefined ? {} : { tokens: message.tokens }),
    ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
    ...(message.agentMessages?.length ? { agentMessages: message.agentMessages } : {}),
    ...(message.usage ? { usage: message.usage } : {}),
  }
  session.messages.push(stored)
  if (session.title === 'Untitled' && stored.role === 'user') {
    session.title = titleFrom(stored.content)
  }
  return stored
}

export function addTotals(session: Session, delta: Partial<SessionTotals>) {
  for (const key of Object.keys(EMPTY_TOTALS) as Array<keyof SessionTotals>) {
    session.totals[key] += delta[key] ?? 0
  }
}

export function sessionTraffic(session: Session): string[] {
  const out: string[] = []
  for (const message of session.messages) {
    for (const call of message.toolCalls ?? []) {
      out.push(JSON.stringify(call.input ?? ''))
      out.push(JSON.stringify(call.output ?? ''))
    }
  }
  return out
}

export function conversation(session: Session): ModelMessage[] {
  return session.messages.flatMap((m): ModelMessage[] => {
    if (m.role === 'user') return [{ role: 'user', content: m.content }]
    if (m.role !== 'assistant') return []
    if (m.agentMessages?.length) return m.agentMessages
    const history: ModelMessage[] = []
    for (const [index, call] of (m.toolCalls ?? []).entries()) {
      const toolCallId = call.id ?? `${m.id}_tool_${index}`
      history.push({ role: 'assistant', content: [{ type: 'tool-call', toolCallId, toolName: call.name, input: call.input }] })
      history.push({ role: 'tool', content: [{ type: 'tool-result', toolCallId, toolName: call.name,
        output: { type: 'json', value: JSON.parse(JSON.stringify(call.output ?? { ok: false, error: 'No result was recorded; success is unknown.' })) },
      }] })
    }
    if (m.content.trim()) history.push({ role: 'assistant', content: m.content })
    return history
  })
}

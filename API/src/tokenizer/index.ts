import fs from 'node:fs'
import path from 'node:path'
import { Template } from '@huggingface/jinja'
import { Tiktoken } from 'tiktoken/lite'
import { CONFIG_FILE, RANKS_FILE, TEMPLATE_FILE, cachePath, CACHE_DIR } from './prepare.js'
import {
  resolveModel,
  resolveSpec,
  type ModelKey,
  type ModelSpec,
  type TokenizerKey,
  type TokenizerSpec,
} from './specs.js'

export type { ModelKey, ModelSpec, TokenizerKey, TokenizerSpec }
export {
  SPECS,
  MODELS,
  MODEL_KEYS,
  TOKENIZER_KEYS,
  resolveSpec,
  resolveModel,
  resolveModelKey,
} from './specs.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string }>
  name?: string
  tool_calls?: unknown[]
}

export type CountMethod = 'chat-template' | 'per-role' | 'uncalibrated'

export interface ChatCount {
  tokens: number
  exact: boolean
  method: CountMethod
  contentTokens: number
  overheadTokens: number
}

export type Calibration =
  | { kind: 'template-offset'; offset: number; maxResidual: number; effort?: string; measuredAt: string }
  | {
      kind: 'per-role'
      fixedOverhead: number
      perRole: Record<string, number>
      perExtraPart?: number
      maxResidual: number
      measuredAt: string
    }

export const CALIBRATION_FILE = path.join(CACHE_DIR, 'calibration.json')

export function readCalibrationFile(): Record<string, Calibration> {
  try {
    return JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function readCalibration(model: ModelSpec): { calibration: Calibration | null; inherited: boolean } {
  const all = readCalibrationFile()
  if (all[model.key]) return { calibration: all[model.key], inherited: false }
  if (all[model.tokenizer]) return { calibration: all[model.tokenizer], inherited: true }
  return { calibration: null, inherited: false }
}

export function messageParts(content: ChatMessage['content']): string[] {
  if (typeof content === 'string') return [content]
  return content
    .filter(
      (p) =>
        (p.type === undefined || p.type === 'text' || p.type === 'input_text') &&
        typeof p.text === 'string'
    )
    .map((p) => p.text as string)
}

export const messageText = (content: ChatMessage['content']) => messageParts(content).join('')

export interface CountChatOptions {
  tools?: unknown[]
  reasoningEffort?: string
  addGenerationPrompt?: boolean
  raw?: boolean
}

class TokenizerCore {
  readonly spec: TokenizerSpec
  readonly enc: Tiktoken
  readonly template: Template | null

  constructor(spec: TokenizerSpec) {
    this.spec = spec

    const raw = fs.readFileSync(cachePath(spec.key, RANKS_FILE), 'utf8')
    const lines = raw.split('\n').filter((l) => l.trim())

    let mergeable: string
    const specials: Record<string, number> = {}

    if (spec.specials.kind === 'inline') {
      mergeable = lines.slice(0, spec.baseVocab).join('\n') + '\n'
      for (const line of lines.slice(spec.baseVocab)) {
        const [b64, rank] = line.split(' ')
        specials[Buffer.from(b64, 'base64').toString('utf8')] = Number(rank)
      }
    } else {
      mergeable = raw
      const cfg = JSON.parse(fs.readFileSync(cachePath(spec.key, CONFIG_FILE), 'utf8'))
      const named: Record<number, string> = {}
      for (const [id, tok] of Object.entries(cfg.added_tokens_decoder ?? {})) {
        named[Number(id)] = (tok as { content: string }).content
      }
      if (spec.specials.kind === 'reserved') {
        const offset = spec.specials.offset ?? spec.baseVocab
        for (let i = offset; i < offset + spec.specials.count; i++) {
          specials[named[i] ?? `<|reserved_token_${i}|>`] = i
        }
      } else {
        for (const [id, name] of Object.entries(named)) specials[name] = Number(id)
      }
    }

    this.enc = new Tiktoken(mergeable, specials, spec.patStr)

    let template: Template | null = null
    if (spec.chatTemplatePath) {
      try {
        template = new Template(fs.readFileSync(cachePath(spec.key, TEMPLATE_FILE), 'utf8'))
      } catch {
        template = null
      }
    }
    this.template = template
  }
}

const cores = new Map<TokenizerKey, TokenizerCore>()

function coreFor(spec: TokenizerSpec): TokenizerCore {
  let core = cores.get(spec.key)
  if (!core) {
    core = new TokenizerCore(spec)
    cores.set(spec.key, core)
  }
  return core
}

export class ModelTokenizer {
  readonly model: ModelSpec
  readonly spec: TokenizerSpec
  readonly contextLength: number
  readonly calibrationInherited: boolean
  #core: TokenizerCore
  #calibration: Calibration | null

  constructor(model: ModelSpec) {
    this.model = model
    this.spec = resolveSpec(model.tokenizer)
    this.#core = coreFor(this.spec)
    this.contextLength = model.contextLength
    const { calibration, inherited } = readCalibration(model)
    this.#calibration = calibration
    this.calibrationInherited = inherited
  }

  get hasTemplate() {
    return this.#core.template !== null
  }

  get calibration(): Readonly<Calibration> | null {
    return this.#calibration
  }

  countText(text: string): number {
    return this.#core.enc.encode_ordinary(text).length
  }

  encode(text: string): Uint32Array {
    return this.#core.enc.encode_ordinary(text)
  }

  decode(tokens: Uint32Array): string {
    return new TextDecoder().decode(this.#core.enc.decode(tokens))
  }

  countRendered(rendered: string): number {
    return this.#core.enc.encode(rendered, 'all').length
  }

  renderChat(messages: ChatMessage[], opts: CountChatOptions = {}): string | null {
    const template = this.#core.template
    if (!template) return null
    return template.render({
      messages: messages as unknown[],
      tools: opts.tools ?? null,
      reasoning_effort: opts.reasoningEffort ?? 'high',
      add_generation_prompt: opts.addGenerationPrompt ?? true,
    })
  }

  countChat(messages: ChatMessage[], opts: CountChatOptions = {}): ChatCount {
    const parts = messages.map((m) => messageParts(m.content))
    const contentTokens = parts.reduce((n, ps) => n + ps.reduce((k, p) => k + this.countText(p), 0), 0)
    const extraParts = parts.reduce((n, ps) => n + Math.max(0, ps.length - 1), 0)
    const cal = this.#calibration

    const rendered = this.renderChat(messages, opts)
    if (rendered !== null) {
      const rawTokens = this.countRendered(rendered)
      const useOffset = !opts.raw && cal?.kind === 'template-offset'
      const tokens = useOffset ? rawTokens - (cal as { offset: number }).offset : rawTokens
      return {
        tokens,
        exact: useOffset && cal.maxResidual === 0,
        method: 'chat-template',
        contentTokens,
        overheadTokens: tokens - contentTokens,
      }
    }

    if (!cal || cal.kind !== 'per-role' || opts.raw) {
      return { tokens: contentTokens, exact: false, method: 'uncalibrated', contentTokens, overheadTokens: 0 }
    }

    const fallback = Math.max(0, ...Object.values(cal.perRole))
    const overheadTokens =
      cal.fixedOverhead +
      messages.reduce((n, m) => n + (cal.perRole[m.role] ?? fallback), 0) +
      (cal.perExtraPart ?? 0) * extraParts

    return {
      tokens: contentTokens + overheadTokens,
      exact: cal.maxResidual === 0,
      method: 'per-role',
      contentTokens,
      overheadTokens,
    }
  }

  remainingContext(used: number): number {
    return Math.max(0, this.contextLength - used)
  }
}

const loaded = new Map<ModelKey, ModelTokenizer>()

export function getTokenizer(model: string): ModelTokenizer {
  const spec = resolveModel(model)
  let tk = loaded.get(spec.key)
  if (!tk) {
    tk = new ModelTokenizer(spec)
    loaded.set(spec.key, tk)
  }
  return tk
}

export const countText = (model: string, text: string) => getTokenizer(model).countText(text)

export const countChat = (model: string, messages: ChatMessage[], opts?: CountChatOptions) =>
  getTokenizer(model).countChat(messages, opts)

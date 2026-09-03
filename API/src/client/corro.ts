export interface CorroOptions {
  baseUrl?: string
  model?: string
  fast?: boolean
  device?: string
  tools?: string[]
  maxSteps?: number
  temperature?: number
  systemExtra?: string
  fetch?: typeof fetch
}

export interface AskOptions {
  session?: string | null
  remember?: boolean
  model?: string
  fast?: boolean
  tools?: string[]
  maxSteps?: number
  temperature?: number
  systemExtra?: string
  signal?: AbortSignal
  onText?: (chunk: string) => void
  onTool?: (call: { name: string; input: unknown }) => void
}

export interface ContextUsage {
  used: number
  remaining: number
  percentUsed: number
  contextLength: number
  exact: boolean
  breakdown: Record<string, number>
  share: Record<string, number>
}

export interface AskResult {
  text: string
  finishReason: string
  session?: string
  context?: ContextUsage
  toolCalls: Array<{ name: string; input: unknown; output?: unknown }>
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

const DEFAULT_BASE = 'http://localhost:8787'

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

async function* sseEvents(
  response: Response
): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      let event = 'message'
      const data: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trim())
      }
      if (!data.length) continue
      try {
        yield { event, data: JSON.parse(data.join('\n')) }
      } catch {
        yield { event, data: data.join('\n') }
      }
    }
  }
}

export class Corro {
  readonly baseUrl: string
  device?: string
  #options: CorroOptions
  #fetch: typeof fetch

  constructor(options: CorroOptions = {}) {
    this.#options = options
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE
    this.device = options.device
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      ...(this.device ? { 'X-Corro-Device': this.device } : {}),
      ...extra,
    }
  }

  #body(prompt: string, opts: AskOptions) {
    return {
      message: prompt,
      model: opts.model ?? this.#options.model,
      fast: opts.fast ?? this.#options.fast,
      session: opts.session,
      remember: opts.remember,
      tools: opts.tools ?? this.#options.tools,
      maxSteps: opts.maxSteps ?? this.#options.maxSteps,
      temperature: opts.temperature ?? this.#options.temperature,
      systemExtra: opts.systemExtra ?? this.#options.systemExtra,
    }
  }

  async *stream(prompt: string, opts: AskOptions = {}): AsyncGenerator<string, AskResult> {
    const response = await this.#fetch(joinUrl(this.baseUrl, '/chat'), {
      method: 'POST',
      headers: this.#headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
      body: JSON.stringify({ ...this.#body(prompt, opts), stream: true }),
      signal: opts.signal,
    })

    const device = response.headers.get('X-Corro-Device')
    if (device) this.device = device

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail.slice(0, 500) || `Corro returned ${response.status}`)
    }

    const result: AskResult = {
      text: '',
      finishReason: 'unknown',
      toolCalls: [],
      usage: {},
    }

    for await (const { event, data } of sseEvents(response)) {
      const payload = data as Record<string, unknown>
      if (event === 'session') {
        result.session = payload.id as string
      } else if (event === 'text') {
        const chunk = payload.text as string
        result.text += chunk
        opts.onText?.(chunk)
        yield chunk
      } else if (event === 'tool-call') {
        const call = { name: payload.name as string, input: payload.input }
        result.toolCalls.push(call)
        opts.onTool?.(call)
      } else if (event === 'tool-result') {
        const last = [...result.toolCalls].reverse().find((c) => c.name === payload.name)
        if (last) last.output = payload.output
      } else if (event === 'done') {
        const run = payload as { finishReason?: string; context?: ContextUsage; usage?: { server?: AskResult['usage'] } }
        result.finishReason = run.finishReason ?? result.finishReason
        result.context = run.context
        result.usage = run.usage?.server ?? {}
      } else if (event === 'error') {
        throw new Error(String(payload.error ?? 'Corro stream failed'))
      }
    }

    return result
  }

  async ask(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
    const iterator = this.stream(prompt, opts)
    while (true) {
      const next = await iterator.next()
      if (next.done) return next.value
    }
  }

  async text(prompt: string, opts: AskOptions = {}): Promise<string> {
    return (await this.ask(prompt, opts)).text
  }

  session(id?: string): CorroSession {
    return new CorroSession(this, id)
  }

  async sessions(): Promise<unknown[]> {
    const response = await this.#fetch(joinUrl(this.baseUrl, '/sessions'), {
      headers: this.#headers(),
    })
    const json = (await response.json()) as { data?: unknown[] }
    return json.data ?? []
  }

  async history(id: string): Promise<unknown> {
    const response = await this.#fetch(joinUrl(this.baseUrl, `/sessions/${id}`), {
      headers: this.#headers(),
    })
    if (!response.ok) throw new Error(`No session ${id}`)
    return response.json()
  }

  async forget(id: string): Promise<boolean> {
    const response = await this.#fetch(joinUrl(this.baseUrl, `/sessions/${id}`), {
      method: 'DELETE',
      headers: this.#headers(),
    })
    return response.ok
  }
}

export class CorroSession {
  #client: Corro
  id?: string
  context?: ContextUsage

  constructor(client: Corro, id?: string) {
    this.#client = client
    this.id = id
  }

  async *stream(prompt: string, opts: AskOptions = {}): AsyncGenerator<string, AskResult> {
    const iterator = this.#client.stream(prompt, { ...opts, session: this.id ?? null })
    while (true) {
      const next = await iterator.next()
      if (next.done) {
        this.id = next.value.session ?? this.id
        this.context = next.value.context
        return next.value
      }
      yield next.value
    }
  }

  async ask(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
    const iterator = this.stream(prompt, opts)
    while (true) {
      const next = await iterator.next()
      if (next.done) return next.value
    }
  }

  async text(prompt: string, opts: AskOptions = {}): Promise<string> {
    return (await this.ask(prompt, opts)).text
  }

  async history(): Promise<unknown> {
    if (!this.id) return null
    return this.#client.history(this.id)
  }

  async forget(): Promise<boolean> {
    if (!this.id) return false
    const ok = await this.#client.forget(this.id)
    if (ok) this.id = undefined
    return ok
  }
}

export function corro(options: CorroOptions = {}): Corro {
  return new Corro(options)
}

export default corro

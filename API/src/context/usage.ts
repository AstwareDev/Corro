import { getTokenizer, messageText, type ChatMessage } from '../tokenizer/index.js'
import type { ModelKey } from '../tokenizer/specs.js'
import type { ToolSpec } from '../agent/tools/specs.js'

export type UsageKind = 'system' | 'tools' | 'history' | 'toolTraffic' | 'input' | 'overhead'

export const USAGE_KINDS: UsageKind[] = [
  'system',
  'tools',
  'history',
  'toolTraffic',
  'input',
  'overhead',
]

export interface ContextUsage {
  model: ModelKey
  contextLength: number
  used: number
  remaining: number
  percentUsed: number
  exact: boolean
  method: string
  toolsMeasured: boolean
  breakdown: Record<UsageKind, number>
  share: Record<UsageKind, number>
}

export interface MeasureInput {
  model: ModelKey
  system: string
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  tools?: ToolSpec[]
  




  toolTraffic?: string[]
  




  observed?: number
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

export function measureContext({
  model,
  system,
  messages,
  tools = [],
  toolTraffic = [],
  observed,
}: MeasureInput): ContextUsage {
  const tk = getTokenizer(model)
  const toolsMeasured = tools.length === 0 || tk.hasTemplate

  const counted = tk.countChat(
    [{ role: 'system', content: system }, ...messages] as ChatMessage[],
    { tools: tk.hasTemplate && tools.length ? tools : undefined }
  )

  const systemTokens = tk.countText(system)
  const perMessage = messages.map((m) => tk.countText(messageText(m.content)))
  
  
  const inputIndex = messages.map((m) => m.role).lastIndexOf('user')
  const inputTokens = inputIndex === -1 ? 0 : perMessage[inputIndex]
  const historyTokens = perMessage.reduce((n, t) => n + t, 0) - inputTokens

  const toolTokens = tools.length ? tk.countText(JSON.stringify(tools)) : 0
  const trafficTokens = toolTraffic.reduce((n, text) => n + tk.countText(text), 0)

  const estimated = counted.tokens + trafficTokens + (toolsMeasured ? 0 : toolTokens)
  
  
  
  
  
  const trustObserved = observed !== undefined && observed >= estimated
  const used = trustObserved ? (observed as number) : estimated

  const contentTotal = systemTokens + historyTokens + inputTokens + trafficTokens
  const structure = Math.max(0, used - contentTotal)
  const toolsBucket = Math.min(toolTokens, structure)
  const overhead = structure - toolsBucket

  const breakdown: Record<UsageKind, number> = {
    system: systemTokens,
    tools: toolsBucket,
    history: historyTokens,
    toolTraffic: trafficTokens,
    input: inputTokens,
    overhead,
  }

  const share = Object.fromEntries(
    USAGE_KINDS.map((k) => [k, pct(breakdown[k], used)])
  ) as Record<UsageKind, number>

  return {
    model,
    contextLength: tk.contextLength,
    used,
    remaining: Math.max(0, tk.contextLength - used),
    percentUsed: pct(used, tk.contextLength),
    exact: trustObserved || (counted.exact && tools.length === 0),
    method: trustObserved ? 'server-reported' : counted.method,
    toolsMeasured,
    breakdown,
    share,
  }
}








export function notBelow(usage: ContextUsage, floor: number): ContextUsage {
  if (!(floor > usage.used)) return usage

  const breakdown = { ...usage.breakdown, overhead: usage.breakdown.overhead + (floor - usage.used) }
  return {
    ...usage,
    used: floor,
    remaining: Math.max(0, usage.contextLength - floor),
    percentUsed: pct(floor, usage.contextLength),
    breakdown,
    share: Object.fromEntries(
      USAGE_KINDS.map((k) => [k, pct(breakdown[k], floor)])
    ) as Record<UsageKind, number>,
  }
}

export function safeMeasureContext(input: MeasureInput): ContextUsage | undefined {
  try {
    return measureContext(input)
  } catch {
    return undefined
  }
}

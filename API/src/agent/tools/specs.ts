import { z } from 'zod'

export interface ToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

export function toolSpecs(toolset: Record<string, unknown>): ToolSpec[] {
  return Object.entries(toolset).map(([name, t]) => {
    const def = t as { description?: string; inputSchema?: unknown }
    let parameters: unknown = {}
    try {
      parameters = z.toJSONSchema(def.inputSchema as z.ZodType)
    } catch {
      parameters = {}
    }
    return {
      type: 'function' as const,
      function: { name, description: def.description ?? '', parameters },
    }
  })
}

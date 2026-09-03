import { Router } from 'express'
import type { z } from 'zod'
import { buildTools, TOOL_NAMES, workspaceRoot } from '../agent/tools/index.js'
import { route } from '../http/respond.js'

export const toolRoutes = Router()

function sessionParam(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.session === 'string' ? req.query.session : undefined
}

toolRoutes.get('/tools', (req, res) => {
  const tools = buildTools({ workspace: workspaceRoot(req.device.id, sessionParam(req)) })
  res.json({
    object: 'list',
    data: Object.entries(tools).map(([name, t]) => ({
      name,
      description: (t as { description?: string }).description ?? '',
    })),
  })
})

toolRoutes.post(
  '/tools/:name',
  route(async (req, res) => {
    const name = String(req.params.name)
    
    const tools = buildTools({ workspace: workspaceRoot(req.device.id, sessionParam(req)) })
    if (!(name in tools)) {
      res.status(404).json({ error: `Unknown tool ${JSON.stringify(name)}`, known: TOOL_NAMES })
      return
    }
    const t = tools[name] as unknown as {
      inputSchema: z.ZodType
      execute: (input: unknown, opts: unknown) => Promise<unknown>
    }
    const parsed = t.inputSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid tool input', issues: parsed.error.issues })
      return
    }
    const startedAt = Date.now()
    const output = await t.execute(parsed.data, { toolCallId: 'manual', messages: [] })
    res.json({ tool: name, input: parsed.data, output, elapsedMs: Date.now() - startedAt })
  })
)

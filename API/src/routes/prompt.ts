import { Router } from 'express'
import { buildSystemPrompt } from '../agent/prompt.js'
import { TOOL_NAMES } from '../agent/tools/index.js'
import { resolveRegion } from '../http/region.js'

export const promptRoutes = Router()

promptRoutes.get('/prompt', async (req, res) => {
  const tools =
    typeof req.query.tools === 'string'
      ? req.query.tools.split(',').filter(Boolean)
      : TOOL_NAMES
  const extra = typeof req.query.extra === 'string' ? req.query.extra : undefined
  const prompt = buildSystemPrompt({ toolNames: tools, extra, region: await resolveRegion(req) })
  const sections = [...prompt.matchAll(/^<([a-z_]+)>$/gm)].map((m) => m[1])
  res.json({ prompt, characters: prompt.length, sections })
})

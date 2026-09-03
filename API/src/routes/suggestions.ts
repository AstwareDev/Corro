import { Router } from 'express'
import { z } from 'zod'
import { parseBody, route } from '../http/respond.js'
import { logError } from '../lib/logger.js'
import { generateSuggestions } from '../suggestions/service.js'

export const suggestionRoutes = Router()

const suggestBody = z.object({
  userMessage: z.string().min(1).max(20_000),
  assistantMessage: z.string().min(1).max(20_000),
})






suggestionRoutes.post(
  '/suggestions',
  route(async (req, res) => {
    const body = parseBody(suggestBody, req, res)
    if (!body) return

    try {
      const suggestions = await generateSuggestions(body)
      res.json({ data: suggestions })
    } catch (err) {
      logError(err, req)
      res.json({ data: [] })
    }
  })
)

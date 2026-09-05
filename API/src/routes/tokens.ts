import { Router } from 'express'
import { z } from 'zod'
import { buildSystemPrompt } from '../agent/prompt.js'
import { TOOL_NAMES, selectTools } from '../agent/tools/index.js'
import { toolSpecs } from '../agent/tools/specs.js'
import { measureContext } from '../context/usage.js'
import { parseBody, route } from '../http/respond.js'
import { normaliseModel, MODEL_KEYS } from '../models/registry.js'
import { countChat, countText, getTokenizer } from '../tokenizer/index.js'
import { DEFAULT_MODEL } from '../config.js'

export const tokenRoutes = Router()

const tokensBody = z
  .object({
    model: z.string().default(DEFAULT_MODEL),
    text: z.string().optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'tool']),
          content: z.union([
            z.string(),
            z.array(z.object({ type: z.string(), text: z.string().optional() })),
          ]),
        })
      )
      .optional(),
    withSystemPrompt: z.boolean().default(false),
    withTools: z.boolean().default(false),
  })
  .refine((b) => b.text !== undefined || b.messages !== undefined, {
    message: 'Provide either `text` or `messages`',
  })

tokenRoutes.post(
  '/tokens',
  route(async (req, res) => {
    const body = parseBody(tokensBody, req, res)
    if (!body) return

    const { text, messages, withSystemPrompt, withTools } = body
    const model = normaliseModel(body.model)
    if (!model) {
      res.status(400).json({ error: `Unknown model ${JSON.stringify(body.model)}`, known: MODEL_KEYS })
      return
    }

    if (text !== undefined) {
      const estimated = getTokenizer(model).estimated
      res.json({
        model,
        tokens: countText(model, text),
        exact: !estimated,
        method: estimated ? 'estimated' : 'bpe',
      })
      return
    }

    if (withSystemPrompt || withTools) {
      const toolset = selectTools(withTools ? undefined : []) as Record<string, unknown>
      const usage = measureContext({
        model,
        system: buildSystemPrompt({ toolNames: withTools ? TOOL_NAMES : [] }),
        messages: messages!.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join(''),
        })),
        tools: toolSpecs(toolset),
      })
      res.json({ tokens: usage.used, ...usage })
      return
    }

    const count = countChat(model, messages!)
    res.json({
      model,
      ...count,
      contextRemaining: getTokenizer(model).remainingContext(count.tokens),
    })
  })
)

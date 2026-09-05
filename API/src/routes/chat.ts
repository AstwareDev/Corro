import { Router, text as textBody } from 'express'
import { z } from 'zod'
import { MAX_STEPS_CAP, runAgent } from '../agent/run.js'
import { chat, chatStream, SessionNotFound, type ChatRequest } from '../chat/service.js'
import { resolveRegion, type RegionContext } from '../http/region.js'
import { openSse, parseBody, route, wantsStream } from '../http/respond.js'
import { normaliseModel, MODEL_KEYS } from '../models/registry.js'
import { DEFAULT_MODEL, FAST_MODEL } from '../config.js'

export const chatRoutes = Router()

const chatBody = z.object({
  model: z.string().optional(),
  fast: z.boolean().optional(),
  message: z.string().min(1).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1)
    .optional(),
  session: z.string().nullable().optional(),
  remember: z.boolean().optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  maxSteps: z.number().int().min(1).max(MAX_STEPS_CAP).optional(),
  systemExtra: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  reasoningEffort: z.string().optional(),
  region: z
    .string()
    .regex(/^[a-z]{2}$/i)
    .optional(),
})

function toRequest(
  body: z.infer<typeof chatBody>,
  deviceId: string,
  detected?: RegionContext
): ChatRequest | { error: string } {
  const requested = body.model ?? (body.fast ? FAST_MODEL : DEFAULT_MODEL)
  const model = normaliseModel(requested)
  if (!model) {
    return { error: `Unknown model ${JSON.stringify(requested)}. Known: ${MODEL_KEYS.join(', ')}` }
  }
  if (!body.message && !body.messages?.length) {
    return { error: 'Provide `message` (a string) or `messages` (an array)' }
  }
  return {
    deviceId,
    model,
    message: body.message,
    messages: body.messages,
    session: body.session ?? undefined,
    remember: body.remember,
    tools: body.tools,
    maxSteps: body.maxSteps,
    systemExtra: body.systemExtra,
    temperature: body.temperature,
    reasoningEffort: body.reasoningEffort,
    
    
    region: body.region ? { code: body.region.toUpperCase() } : detected,
  }
}

function failure(err: unknown): { status: number; error: string } {
  if (err instanceof SessionNotFound) return { status: 404, error: err.message }
  return { status: 500, error: err instanceof Error ? err.message : 'Chat failed' }
}

chatRoutes.post(
  '/chat',
  route(async (req, res) => {
    const body = parseBody(chatBody, req, res)
    if (!body) return

    const request = toRequest(body, req.device.id, await resolveRegion(req))
    if ('error' in request) {
      res.status(400).json(request)
      return
    }

    if (!wantsStream(req)) {
      try {
        const outcome = await chat(request)
        res.json({ ...outcome.run, session: outcome.session, device: req.device.id })
      } catch (err) {
        const { status, error } = failure(err)
        res.status(status).json({ error })
      }
      return
    }

    const sse = openSse(req, res)
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    request.abortSignal = controller.signal
    try {
      for await (const event of chatStream(request)) {
        if (!sse.open) continue // Drain the aborted run so confirmed effects are persisted.
        if (event.type === 'done') {
          sse.send('usage', { usage: event.result.usage, context: event.result.context })
          sse.send('done', event.result)
        } else if (event.type === 'session') {
          sse.send('session', { ...event.session, device: req.device.id })
        } else {
          sse.send(event.type, event)
        }
      }
    } catch (err) {
      sse.send('error', { error: failure(err).error })
    } finally {
      sse.close()
    }
  })
)

chatRoutes.post(
  '/say',
  textBody({ type: '*/*', limit: '1mb' }),
  route(async (req, res) => {
    const prompt = typeof req.body === 'string' ? req.body.trim() : ''
    if (!prompt) {
      res.status(400).type('text/plain').send('Send the question as the request body.\n')
      return
    }

    const requested =
      typeof req.query.model === 'string'
        ? req.query.model
        : req.query.fast === 'true'
          ? FAST_MODEL
          : DEFAULT_MODEL
    const model = normaliseModel(requested)
    if (!model) {
      res.status(400).type('text/plain').send(`Unknown model. Known: ${MODEL_KEYS.join(', ')}\n`)
      return
    }

    const request: ChatRequest = {
      deviceId: req.device.id,
      model,
      message: prompt,
      session: typeof req.query.session === 'string' ? req.query.session : undefined,
      remember: req.query.remember !== 'false',
      tools: typeof req.query.tools === 'string' ? req.query.tools.split(',').filter(Boolean) : undefined,
      region: await resolveRegion(req),
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    let aborted = false
    const controller = new AbortController()
    request.abortSignal = controller.signal
    res.on('close', () => {
      aborted = true
      controller.abort()
    })

    try {
      for await (const event of chatStream(request)) {
        if (aborted) continue
        if (event.type === 'session') {
          res.setHeader('X-Corro-Session', event.session.id)
        } else if (event.type === 'text') {
          res.write(event.text)
        } else if (event.type === 'error') {
          res.write(`\n[error] ${event.error}\n`)
        }
      }
    } catch (err) {
      res.write(`\n[error] ${failure(err).error}\n`)
    } finally {
      res.end()
    }
  })
)

const TEST_QUESTION =
  'A 4K display is 3840 by 2160. How many megapixels is that, and how many times more ' +
  'pixels than 1920x1080? Use the calculator for the arithmetic.'

chatRoutes.get(
  '/test',
  route(async (req, res) => {
    const requested = typeof req.query.model === 'string' ? req.query.model : DEFAULT_MODEL
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q : TEST_QUESTION
    const model = normaliseModel(requested)
    if (!model) {
      res.status(400).json({ error: `Unknown model ${JSON.stringify(requested)}`, known: MODEL_KEYS })
      return
    }

    const startedAt = Date.now()
    const run = await runAgent({ model, messages: [{ role: 'user', content: q }], maxSteps: 6 })
    const toolCalls = run.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName))

    res.json({
      question: q,
      answer: run.text,
      checks: {
        toolWasCalled: toolCalls.length > 0,
        toolsCalled: toolCalls,
        steps: run.steps.length,
        finishReason: run.finishReason,
        tokenCountDelta: run.usage.firstStepDelta,
      },
      usage: run.usage,
      context: run.context,
      elapsedMs: Date.now() - startedAt,
      detail: run.steps,
    })
  })
)

import { Router } from 'express'
import { z } from 'zod'
import { parseBody, route } from '../http/respond.js'
import { normaliseModel, MODEL_KEYS } from '../models/registry.js'
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  saveSession,
  titleFrom,
} from '../sessions/store.js'
import { DEFAULT_MODEL } from '../config.js'

export const sessionRoutes = Router()

const createBody = z.object({
  model: z.string().default(DEFAULT_MODEL),
  title: z.string().max(200).optional(),
})

const patchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
})

sessionRoutes.get('/sessions', (req, res) => {
  const sessions = listSessions(req.device.id)
  res.json({
    object: 'list',
    device: req.device.id,
    data: sessions,
    totals: sessions.reduce(
      (acc, s) => ({
        requests: acc.requests + s.totals.requests,
        inputTokens: acc.inputTokens + s.totals.inputTokens,
        outputTokens: acc.outputTokens + s.totals.outputTokens,
        totalTokens: acc.totalTokens + s.totals.totalTokens,
      }),
      { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    ),
  })
})

sessionRoutes.post(
  '/sessions',
  route(async (req, res) => {
    const body = parseBody(createBody, req, res)
    if (!body) return
    const model = normaliseModel(body.model)
    if (!model) {
      res.status(400).json({ error: `Unknown model ${JSON.stringify(body.model)}`, known: MODEL_KEYS })
      return
    }
    const session = createSession(req.device.id, {
      model,
      title: body.title ? titleFrom(body.title) : undefined,
    })
    res.status(201).json(session)
  })
)

sessionRoutes.get('/sessions/:id', (req, res) => {
  const session = getSession(req.device.id, String(req.params.id))
  if (!session) {
    res.status(404).json({ error: 'No such session for this device', device: req.device.id })
    return
  }
  res.json(session)
})

sessionRoutes.patch(
  '/sessions/:id',
  route(async (req, res) => {
    const body = parseBody(patchBody, req, res)
    if (!body) return
    const session = getSession(req.device.id, String(req.params.id))
    if (!session) {
      res.status(404).json({ error: 'No such session for this device' })
      return
    }
    if (body.title !== undefined) {
      session.title = titleFrom(body.title)
      session.titlePinned = true
    }
    if (body.pinned !== undefined) {
      session.pinned = body.pinned
    }
    res.json(saveSession(session))
  })
)

sessionRoutes.delete('/sessions/:id', (req, res) => {
  const removed = deleteSession(req.device.id, String(req.params.id))
  if (!removed) {
    res.status(404).json({ error: 'No such session for this device' })
    return
  }
  res.json({ deleted: true, id: String(req.params.id) })
})

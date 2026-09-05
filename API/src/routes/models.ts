import { Router } from 'express'
import {
  describeAllModels,
  describeModel,
  normaliseModel,
  MODEL_KEYS,
  PUBLIC_MODEL_KEYS,
} from '../models/registry.js'
import { DEFAULT_MODEL } from '../config.js'
import { route } from '../http/respond.js'

export const modelRoutes = Router()

modelRoutes.get(
  '/models',
  route(async (_req, res) => {
    res.json({
      object: 'list',
      default: DEFAULT_MODEL,
      data: await describeAllModels({ defaultModel: DEFAULT_MODEL, keys: PUBLIC_MODEL_KEYS }),
    })
  })
)

modelRoutes.get(
  '/models/:key',
  route(async (req, res) => {
    const key = normaliseModel(String(req.params.key))
    if (!key) {
      res.status(404).json({ error: `Unknown model ${JSON.stringify(req.params.key)}`, known: MODEL_KEYS })
      return
    }
    res.json(await describeModel(key, { defaultModel: DEFAULT_MODEL }))
  })
)

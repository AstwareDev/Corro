import { Router } from 'express'
import { listSkills, readSkillBody, SkillNotFound } from '../agent/skills/loader.js'
import { route } from '../http/respond.js'

export const skillRoutes = Router()

skillRoutes.get('/skills', (_req, res) => {
  res.json({ object: 'list', data: listSkills() })
})

skillRoutes.get(
  '/skills/:name',
  route(async (req, res) => {
    try {
      const { meta, body } = readSkillBody(String(req.params.name))
      res.json({ name: meta.name, description: meta.description, content: body })
    } catch (err) {
      if (err instanceof SkillNotFound) {
        res.status(404).json({ error: err.message, known: err.known })
        return
      }
      throw err
    }
  })
)

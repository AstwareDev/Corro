import fs from 'node:fs'
import { Router } from 'express'
import {
  ensureRoot,
  listFiles,
  resolveInside,
  workspaceRoot,
} from '../agent/tools/fs/workspace.js'
import { route } from '../http/respond.js'

export const workspaceRoutes = Router()

const MAX_PREVIEW_BYTES = 400_000

function sessionParam(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.session === 'string' ? req.query.session : undefined
}

workspaceRoutes.get('/workspace', (req, res) => {
  const session = sessionParam(req)
  const root = ensureRoot(workspaceRoot(req.device.id, session))
  const files = listFiles(root)
  res.json({
    object: 'list',
    device: req.device.id,
    session,
    count: files.length,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    data: files,
  })
})

workspaceRoutes.get(
  '/workspace/file',
  route(async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : ''
    if (!rel) {
      res.status(400).json({ error: 'Provide ?path=' })
      return
    }
    try {
      const root = ensureRoot(workspaceRoot(req.device.id, sessionParam(req)))
      const full = resolveInside(root, rel)
      const stat = fs.statSync(full)
      if (stat.size > MAX_PREVIEW_BYTES) {
        res.status(413).json({ error: `File is ${stat.size} bytes, too large to preview` })
        return
      }
      res.json({
        path: rel,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        content: fs.readFileSync(full, 'utf8'),
      })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })
)

workspaceRoutes.delete(
  '/workspace/file',
  route(async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : ''
    if (!rel) {
      res.status(400).json({ error: 'Provide ?path=' })
      return
    }
    try {
      const root = ensureRoot(workspaceRoot(req.device.id, sessionParam(req)))
      fs.rmSync(resolveInside(root, rel), { recursive: true })
      res.json({ deleted: rel })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })
)

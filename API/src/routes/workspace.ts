import fs from 'node:fs'
import { Router } from 'express'
import {
  ensureRoot,
  listFiles,
  resolveInside,
  workspaceRoot,
} from '../agent/tools/fs/workspace.js'
import { getSession } from '../sessions/store.js'
import { route } from '../http/respond.js'
import { z } from 'zod'
import { MAX_WRITE_BYTES, revisionOf, RevisionConflict, saveText } from '../agent/tools/fs/storage.js'

export const workspaceRoutes = Router()
workspaceRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

const MAX_PREVIEW_BYTES = 400_000

function sessionParam(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.session === 'string' && req.query.session.trim()
    ? req.query.session.trim()
    : undefined
}

// Workspaces (including uploads/) are private to a single chat. When the
// client names a session, it must be a real session owned by this device —
// otherwise one chat could read or overwrite another chat's files by
// guessing its id, and uploads would leak across chats.
function ownedRoot(deviceId: string, session: string | undefined): string {
  if (!session) return workspaceRoot(deviceId, undefined)
  let owned: ReturnType<typeof getSession>
  try {
    owned = getSession(deviceId, session)
  } catch {
    throw Object.assign(new Error('Invalid session id'), { status: 400 })
  }
  if (!owned) throw Object.assign(new Error('No such session for this device'), { status: 404 })
  return workspaceRoot(deviceId, owned.id)
}

function rootOrError(req: { query: Record<string, unknown> }, deviceId: string, res: import('express').Response): string | null {
  try {
    return ensureRoot(ownedRoot(deviceId, sessionParam(req)))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid session'
    const status = (err as { status?: number }).status ?? 400
    res.status(status).json({ error: message })
    return null
  }
}

workspaceRoutes.get('/workspace', (req, res) => {
  const root = rootOrError(req, req.device.id, res)
  if (!root) return
  const session = sessionParam(req)
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
    const root = rootOrError(req, req.device.id, res)
    if (!root) return
    try {
      const full = resolveInside(root, rel)
      const stat = fs.statSync(full)
      if (!stat.isFile()) throw new Error('Select an individual file')
      if (stat.size > MAX_PREVIEW_BYTES) {
        res.status(413).json({ error: `File is ${stat.size} bytes, too large to preview` })
        return
      }
      const content = fs.readFileSync(full, 'utf8')
      res.json({
        path: rel,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        content,
        revision: revisionOf(content),
      })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })
)

workspaceRoutes.put('/workspace/file', route(async (req, res) => {
  const parsed = z.object({
    path: z.string().min(1), content: z.string().max(MAX_WRITE_BYTES),
    expectedRevision: z.string().nullable(),
  }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide path, content and expectedRevision (null for a new file).' })
    return
  }
  const root = rootOrError(req, req.device.id, res)
  if (!root) return
  try {
    const { path: rel, content, expectedRevision } = parsed.data
    const receipt = saveText(resolveInside(root, rel), content, expectedRevision)
    res.json({ ok: true, path: rel, ...receipt })
  } catch (err) {
    res.status(err instanceof RevisionConflict ? 409 : 400).json({ error: err instanceof Error ? err.message : 'Save failed' })
  }
}))

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
}

const DOWNLOAD_EXTENSIONS = new Set(['.pptx', '.pdf'])

workspaceRoutes.get(
  '/workspace/view',
  route(async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : ''
    if (!rel) {
      res.status(400).json({ error: 'Provide ?path=' })
      return
    }
    const root = rootOrError(req, req.device.id, res)
    if (!root) return
    try {
      const full = resolveInside(root, rel)
      const stat = fs.statSync(full)
      if (!stat.isFile()) throw new Error('Select an individual file')
      const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase()
      const type = MIME_TYPES[ext] ?? 'application/octet-stream'
      res.setHeader('Content-Type', type)
      if (DOWNLOAD_EXTENSIONS.has(ext) || type === 'application/octet-stream' || req.query.download === '1') {
        const filename = rel.split('/').pop() ?? 'download'
        res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`)
      }
      fs.createReadStream(full).pipe(res)
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
    const root = rootOrError(req, req.device.id, res)
    if (!root) return
    try {
      const full = resolveInside(root, rel)
      if (!fs.statSync(full).isFile()) throw new Error('Only individual files can be deleted')
      fs.unlinkSync(full)
      res.json({ deleted: rel })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })
)

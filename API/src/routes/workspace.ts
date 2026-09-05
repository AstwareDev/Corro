import fs from 'node:fs'
import { Router } from 'express'
import {
  ensureRoot,
  listFiles,
  resolveInside,
  workspaceRoot,
} from '../agent/tools/fs/workspace.js'
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
  try {
    const root = ensureRoot(workspaceRoot(req.device.id, sessionParam(req)))
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
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
}

const DOWNLOAD_EXTENSIONS = new Set(['.pptx', '.pdf'])

/** Serves a workspace file as itself — real bytes with a real content type — rather than the
 * JSON envelope /workspace/file returns. This is what turns an .html report the model wrote with
 * fs_write into an actual page you can open, and a .pptx or .png into something you can download. */
workspaceRoutes.get(
  '/workspace/view',
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
      if (!stat.isFile()) throw new Error('Select an individual file')
      const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase()
      const type = MIME_TYPES[ext] ?? 'application/octet-stream'
      res.setHeader('Content-Type', type)
      if (DOWNLOAD_EXTENSIONS.has(ext) || type === 'application/octet-stream') {
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
    try {
      const root = ensureRoot(workspaceRoot(req.device.id, sessionParam(req)))
      const full = resolveInside(root, rel)
      if (!fs.statSync(full).isFile()) throw new Error('Only individual files can be deleted')
      fs.unlinkSync(full)
      res.json({ deleted: rel })
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' })
    }
  })
)

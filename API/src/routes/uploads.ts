import { Router } from 'express'
import multer from 'multer'
import { DEFAULT_MODEL, UPLOAD_LIMIT_MB } from '../config.js'
import { saveBinary } from '../agent/tools/fs/storage.js'
import { ensureRoot, resolveInside, toRelative, viewUrl, workspaceRoot } from '../agent/tools/fs/workspace.js'
import { createSession, getSession } from '../sessions/store.js'
import { route } from '../http/respond.js'

export const uploadRoutes = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 } })

function sanitiseName(original: string): string {
  const base = original.split(/[/\\]/).pop() ?? 'file'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+/, '') || 'file'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${stamp}-${cleaned}`
}

function kindOf(mime: string): 'image' | 'video' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

uploadRoutes.post(
  '/uploads',
  upload.single('file'),
  route(async (req, res) => {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'Send a file under the "file" field' })
      return
    }

    // Uploads are private to a single chat: they always live in that
    // session's workspace (device/session/uploads/), never in a shared or
    // device-general folder. If the client has no chat yet, mint one so the
    // file is still session-scoped from the start.
    const requested = typeof req.query.session === 'string' && req.query.session.trim()
      ? req.query.session.trim()
      : undefined
    let sessionId: string
    try {
      if (requested) {
        const existing = getSession(req.device.id, requested)
        if (!existing) {
          res.status(404).json({ error: 'No such session for this device' })
          return
        }
        sessionId = existing.id
      } else {
        sessionId = createSession(req.device.id, { model: DEFAULT_MODEL }).id
      }
    } catch {
      res.status(400).json({ error: 'Invalid session id' })
      return
    }

    const root = ensureRoot(workspaceRoot(req.device.id, sessionId))
    const rel = `uploads/${sanitiseName(file.originalname)}`
    const full = resolveInside(root, rel)
    const receipt = saveBinary(full, file.buffer)
    const relPath = toRelative(root, full)
    const mime = file.mimetype || 'application/octet-stream'

    res.json({
      ok: true,
      path: relPath,
      mime,
      kind: kindOf(mime),
      ...receipt,
      viewUrl: viewUrl(root, relPath),
      session: sessionId,
      sessionId,
    })
  })
)

import fs from 'node:fs'
import { Router } from 'express'
import { WorkspaceError, ensureRoot, resolveInside, workspaceRoot } from '../agent/tools/fs/workspace.js'
import { getSession } from '../sessions/store.js'
import { route } from '../http/respond.js'
import { renderMarkdownDocx } from '../export/markdownDocx.js'
import { renderMarkdownPdf } from '../export/markdownPdf.js'

export const exportRoutes = Router()
exportRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

const MAX_EXPORT_BYTES = 400_000

function sessionParam(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.session === 'string' ? req.query.session : undefined
}

function baseName(rel: string): string {
  const name = rel.split('/').pop() ?? 'document'
  return name.slice(0, name.lastIndexOf('.')) || name
}

exportRoutes.get(
  '/workspace/export',
  route(async (req, res) => {
    const rel = typeof req.query.path === 'string' ? req.query.path : ''
    const format = req.query.format === 'docx' ? 'docx' : req.query.format === 'pdf' ? 'pdf' : undefined
    if (!rel || !rel.toLowerCase().endsWith('.md')) {
      res.status(400).json({ error: 'Provide ?path= to a .md file' })
      return
    }
    if (!format) {
      res.status(400).json({ error: 'Provide ?format=pdf or ?format=docx' })
      return
    }

    let full: string
    try {
      const session = sessionParam(req)
      if (session) {
        let owned: ReturnType<typeof getSession>
        try {
          owned = getSession(req.device.id, session)
        } catch {
          res.status(400).json({ error: 'Invalid session id' })
          return
        }
        if (!owned) {
          res.status(404).json({ error: 'No such session for this device' })
          return
        }
      }
      const root = ensureRoot(workspaceRoot(req.device.id, session))
      full = resolveInside(root, rel)
    } catch (err) {
      const message = err instanceof WorkspaceError ? err.message : 'Invalid export request'
      res.status(400).json({ error: message })
      return
    }

    let stat: fs.Stats
    try {
      stat = fs.statSync(full)
    } catch {
      res.status(404).json({ error: 'File not found' })
      return
    }
    if (!stat.isFile()) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    if (stat.size > MAX_EXPORT_BYTES) {
      res.status(413).json({ error: `File is over the ${MAX_EXPORT_BYTES} byte export limit` })
      return
    }

    try {
      const markdown = fs.readFileSync(full, 'utf8')
      const name = baseName(rel)

      if (format === 'pdf') {
        const pdf = await renderMarkdownPdf(markdown)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`)
        res.send(pdf)
      } else {
        const docx = await renderMarkdownDocx(markdown)
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        res.setHeader('Content-Disposition', `attachment; filename="${name}.docx"`)
        res.send(docx)
      }
    } catch (err) {
      console.error('Export render failed:', err)
      res.status(500).json({ error: 'Export failed' })
    }
  })
)

import { Router } from 'express'
import { z } from 'zod'
import {
  activatePage,
  BrowserError,
  capturePage,
  closePage,
  closeSession,
  hasSession,
  listPages,
} from '../agent/tools/browser/session.js'
import { saveBinary } from '../agent/tools/fs/storage.js'
import { ensureRoot, resolveInside, toRelative, viewUrl, workspaceRoot } from '../agent/tools/fs/workspace.js'
import { parseBody, route } from '../http/respond.js'

export const browserRoutes = Router()
browserRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

function sessionParam(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.session === 'string' ? req.query.session : undefined
}

function keyFor(deviceId: string, session?: string): string {
  return workspaceRoot(deviceId, session)
}

function indexParam(raw: unknown): number | undefined {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

function fail(res: import('express').Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Browser operation failed'
  res.status(err instanceof BrowserError ? 404 : 500).json({ error: message })
}

browserRoutes.get(
  '/browser',
  route(async (req, res) => {
    const key = keyFor(req.device.id, sessionParam(req))
    const pages = await listPages(key)
    res.json({ object: 'browser', open: hasSession(key) && pages.length > 0, count: pages.length, data: pages })
  })
)

browserRoutes.get(
  '/browser/view',
  route(async (req, res) => {
    const key = keyFor(req.device.id, sessionParam(req))
    try {
      const png = await capturePage(key, indexParam(req.query.index))
      res.setHeader('Content-Type', 'image/png')
      res.send(png)
    } catch (err) {
      fail(res, err)
    }
  })
)

const pageBody = z.object({ session: z.string().nullish(), index: z.number().int().min(0) })

browserRoutes.post(
  '/browser/activate',
  route(async (req, res) => {
    const body = parseBody(pageBody, req, res)
    if (!body) return
    const key = keyFor(req.device.id, body.session ?? undefined)
    res.json({ ok: await activatePage(key, body.index), data: await listPages(key) })
  })
)

browserRoutes.post(
  '/browser/page/close',
  route(async (req, res) => {
    const body = parseBody(pageBody, req, res)
    if (!body) return
    const key = keyFor(req.device.id, body.session ?? undefined)
    const closed = await closePage(key, body.index)
    res.json({ ok: closed, data: await listPages(key) })
  })
)

browserRoutes.delete(
  '/browser',
  route(async (req, res) => {
    const key = keyFor(req.device.id, sessionParam(req))
    res.json({ ok: await closeSession(key) })
  })
)

function screenshotName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `screenshots/page-${stamp}.png`
}

browserRoutes.post(
  '/browser/screenshot',
  route(async (req, res) => {
    const body = parseBody(
      z.object({
        session: z.string().nullish(),
        index: z.number().int().min(0).optional(),
        path: z.string().min(1).optional(),
      }),
      req,
      res
    )
    if (!body) return

    const session = body.session ?? undefined
    const key = keyFor(req.device.id, session)
    const rel = body.path ?? screenshotName()
    if (!rel.toLowerCase().endsWith('.png')) {
      res.status(400).json({ error: 'path must end in .png' })
      return
    }

    try {
      const png = await capturePage(key, body.index)
      const root = ensureRoot(workspaceRoot(req.device.id, session))
      const full = resolveInside(root, rel)
      const receipt = saveBinary(full, png)
      const relPath = toRelative(root, full)
      res.json({ ok: true, path: relPath, ...receipt, viewUrl: viewUrl(root, relPath) })
    } catch (err) {
      fail(res, err)
    }
  })
)

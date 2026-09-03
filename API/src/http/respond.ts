import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

export const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', issues: parsed.error.issues })
    return null
  }
  return parsed.data
}

export interface SseChannel {
  send(event: string, data: unknown): void
  comment(text: string): void
  close(): void
  readonly open: boolean
}

export function openSse(req: Request, res: Response): SseChannel {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  let open = true
  res.on('close', () => {
    open = false
  })

  const keepAlive = setInterval(() => {
    if (open) res.write(': ping\n\n')
  }, 15_000)

  return {
    get open() {
      return open
    },
    send(event, data) {
      if (!open) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    },
    comment(text) {
      if (open) res.write(`: ${text}\n\n`)
    },
    close() {
      clearInterval(keepAlive)
      if (!open) return
      open = false
      res.end()
    },
  }
}

export function wantsStream(req: Request): boolean {
  const body = (req.body ?? {}) as { stream?: unknown }
  if (typeof body.stream === 'boolean') return body.stream
  if (req.query.stream === 'true') return true
  if (req.query.stream === 'false') return false
  return String(req.headers.accept ?? '').includes('text/event-stream')
}

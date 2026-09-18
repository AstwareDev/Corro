import type { Server as HttpServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { getActivePage, hasSession } from '../agent/tools/browser/session.js'
import { LiveSession } from '../agent/tools/browser/live.js'
import { isDeviceId } from '../sessions/device.js'
import { workspaceRoot } from '../agent/tools/fs/workspace.js'

const WATCHDOG_MS = 500

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

export function attachBrowserLive(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/browser/live' })
  const active = new Set<string>()

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '', 'http://internal')
    const device = url.searchParams.get('device') ?? ''
    const session = url.searchParams.get('session') ?? undefined

    if (!isDeviceId(device)) {
      socket.close(4001, 'Invalid or missing device id')
      return
    }

    let key: string
    try {
      key = workspaceRoot(device, session)
    } catch {
      socket.close(4001, 'Invalid session')
      return
    }

    if (active.has(key)) {
      send(socket, { type: 'error', error: 'Corro’s Computer is already open elsewhere for this session.' })
      socket.close(4002, 'Already open elsewhere')
      return
    }
    active.add(key)

    let closed = false
    const live = new LiveSession(
      (data, metadata) => send(socket, { type: 'frame', data, metadata }),
      (url_, title) => send(socket, { type: 'nav', url: url_, title })
    )

    async function ensureAttached() {
      const page = await getActivePage(key)
      if (!page) return
      if (live.attachedPage === page) return
      await live.attach(page)
    }

    const watchdog = setInterval(() => {
      if (closed) return
      ensureAttached().catch(() => {})
    }, WATCHDOG_MS)

    async function start() {
      if (!hasSession(key)) {
        send(socket, { type: 'error', error: 'No page is open. Ask Corro to open a page first.' })
        return
      }
      await ensureAttached()
    }
    start().catch((err) => send(socket, { type: 'error', error: err instanceof Error ? err.message : 'Failed to attach' }))

    socket.on('message', (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }

      if (msg.type === 'nav-action' && live.attachedPage) {
        const page = live.attachedPage
        const action = msg.action
        const run =
          action === 'back' ? page.goBack() : action === 'forward' ? page.goForward() : action === 'reload' ? page.reload() : null
        run?.catch(() => {})
      }
    })

    socket.on('close', () => {
      closed = true
      clearInterval(watchdog)
      active.delete(key)
      live.detach().catch(() => {})
    })
  })
}

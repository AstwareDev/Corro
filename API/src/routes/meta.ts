import { Router } from 'express'
import { resolveRegion } from '../http/region.js'
import { listSessions } from '../sessions/store.js'

export const metaRoutes = Router()

metaRoutes.get('/api', (_req, res) => {
  res.json({
    name: 'Corro API',
    quickstart: {
      text: 'curl -N -X POST localhost:8787/say -d "who won the 2019 Nobel in physics?"',
      json: 'curl localhost:8787/chat -H "content-type: application/json" -d \'{"message":"hi"}\'',
      stream: 'POST /chat with {"message":"hi","stream":true} for server-sent events',
    },
    endpoints: {
      'GET /': 'control console (UI)',
      'GET /health': 'liveness',
      'GET /device': 'the device this client is recognised as, and its sessions',
      'POST /say': 'ask in plain text, get plain streaming text back',
      'POST /chat': 'run the agent ({ message | messages, session?, model?, tools?, stream? })',
      'GET /sessions': 'sessions belonging to this device',
      'GET /sessions/:id': 'one session: messages, totals, context usage',
      'DELETE /sessions/:id': 'forget a session',
      'GET /models': 'configured models, live properties, tokenizer status',
      'GET /models/:key': 'one model',
      'GET /tools': 'the agent toolbelt',
      'POST /tools/:name': 'run one tool directly, no model involved',
      'GET /prompt': 'the system prompt as the agent receives it',
      'POST /tokens': 'count tokens for text or messages',
      'GET /test': 'end-to-end smoke test (?model=&q=)',
    },
  })
})

metaRoutes.get('/health', (_req, res) => {
  res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) })
})

metaRoutes.get('/device', async (req, res) => {
  const sessions = listSessions(req.device.id)
  const region = await resolveRegion(req)
  res.json({
    device: req.device.id,
    recognisedBy: req.device.source,
    fingerprinted: req.device.fingerprinted,
    ...(region ? { region } : {}),
    sessions: sessions.length,
    lastActive: sessions[0]?.updatedAt,
    hint: 'Send this id as the X-Corro-Device header to keep sessions across clients.',
  })
})

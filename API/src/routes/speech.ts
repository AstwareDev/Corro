import { Router } from 'express'
import { z } from 'zod'
import { parseBody, route } from '../http/respond.js'
import {
  activeVoiceId,
  hasSpeechKey,
  SPEECH_MAX_CHARS,
  SpeechError,
  synthesise,
} from '../speech/elevenlabs.js'

export const speechRoutes = Router()

const speakBody = z.object({
  
  
  text: z.string().min(1).max(200_000),
})

speechRoutes.get('/speech', (_req, res) => {
  res.json({
    available: hasSpeechKey(),
    voiceId: activeVoiceId(),
    maxChars: SPEECH_MAX_CHARS,
  })
})





speechRoutes.post(
  '/speak',
  route(async (req, res) => {
    const body = parseBody(speakBody, req, res)
    if (!body) return

    try {
      const audio = await synthesise(body.text)
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Cache-Control', 'no-store')
      res.send(Buffer.from(audio))
    } catch (err) {
      const status = err instanceof SpeechError ? err.status : 500
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Speech failed',
      })
    }
  })
)

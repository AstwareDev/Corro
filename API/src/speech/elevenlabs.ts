import 'dotenv/config'

const BASE = 'https://api.elevenlabs.io/v1'
const REQUEST_TIMEOUT_MS = 60_000



export const SPEECH_MAX_CHARS = 4500

export const DEFAULT_VOICE_ID = 'nPczCjzI2devNBz1zQrb'








const FALLBACK_VOICE_IDS = [
  'nPczCjzI2devNBz1zQrb', 
  'EXAVITQu4vr4xnSDxMaL', 
  'JBFqnCBsd6RMkjVDRZzb', 
  'cgSgspJ2msm6clMCkdW9', 
  'onwK4e9ZLuTAKqWW03F9', 
]



let resolvedVoice: string | null = null



const VOICE_UNAVAILABLE = new Set([402, 404])

function voiceCandidates(): string[] {
  if (resolvedVoice) return [resolvedVoice]
  return [...new Set([voiceId(), ...FALLBACK_VOICE_IDS])]
}



const DEFAULT_MODEL = 'eleven_turbo_v2_5'

export class SpeechError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

function keyPool(): string[] {
  return Object.entries(process.env)
    .filter(([name, value]) => /^ELEVENLABS_\d+_KEY$/.test(name) && value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value as string)
}

export function hasSpeechKey(): boolean {
  return keyPool().length > 0
}

export function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID
}


export function activeVoiceId(): string {
  return resolvedVoice ?? voiceId()
}


const EXHAUSTED = new Set([401, 429])

let cursor = 0





export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' (code block omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+])\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}



async function describeFailure(res: Response): Promise<string> {
  const raw = (await res.text()).slice(0, 600)
  try {
    const parsed = JSON.parse(raw) as {
      detail?: string | { message?: string }
    }
    const detail = parsed.detail
    const message = typeof detail === 'string' ? detail : detail?.message
    if (message) return message
  } catch {
    
  }
  return `ElevenLabs returned ${res.status}: ${raw}`
}

export async function synthesise(text: string): Promise<ArrayBuffer> {
  const pool = keyPool()
  if (!pool.length) {
    throw new SpeechError('No ELEVENLABS_*_KEY is configured (see .env.example)', 503)
  }

  const clean = speakableText(text).slice(0, SPEECH_MAX_CHARS)
  if (!clean) throw new SpeechError('Nothing to read aloud', 400)

  let lastError: SpeechError | null = null

  keys: for (let attempt = 0; attempt < pool.length; attempt++) {
    const index = (cursor + attempt) % pool.length

    for (const voice of voiceCandidates()) {
      try {
        const res = await fetch(`${BASE}/text-to-speech/${voice}`, {
          method: 'POST',
          headers: {
            'xi-api-key': pool[index],
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: clean,
            model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        
        if (EXHAUSTED.has(res.status)) {
          lastError = new SpeechError(`ElevenLabs key ${index + 1} rejected (${res.status})`, res.status)
          continue keys
        }
        if (VOICE_UNAVAILABLE.has(res.status)) {
          lastError = new SpeechError(await describeFailure(res), res.status)
          continue
        }
        if (!res.ok) {
          throw new SpeechError(await describeFailure(res), res.status)
        }

        cursor = index
        resolvedVoice = voice
        return await res.arrayBuffer()
      } catch (err) {
        lastError =
          err instanceof SpeechError
            ? err
            : new SpeechError(err instanceof Error ? err.message : 'Speech request failed')
      }
    }
  }

  throw lastError ?? new SpeechError('ElevenLabs is unreachable', 502)
}

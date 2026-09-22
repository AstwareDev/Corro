import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
  failure,
  resolveVideoId,
  SHOP,
  TTLS,
  videoUrl,
} from './client.js'

export interface TranscriptSegment {
  start: number
  duration: number
  text: string
}

export interface TranscriptLanguage {
  code: string
  name: string
  auto: boolean
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCodePoint(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCodePoint(Number.parseInt(c, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// YouTube serves empty timedtext files to datacenter IPs, so this tool reads
// the public mirror at https://youtube-transcript.ai/transcript/{VIDEO_ID}.txt
// (optional ?lang=CODE) instead of YouTube's own caption endpoints. The mirror
// returns plain text with a small header (title, language, duration, word
// count), one "[m:ss] cue" per line, and a footer — parsed below into the
// same { segments, text } shape plus the header metadata.

const EXTERNAL_TRANSCRIPT_BASE = 'https://youtube-transcript.ai/transcript'
const EXTERNAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

export function cueToSeconds(cue: string): number | undefined {
  const parts = cue.split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return undefined
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}

export interface ParsedTranscript {
  segments: TranscriptSegment[]
  text: string
  title?: string
  languageCode: string
  languageLabel: string
  languageAuto: boolean
  languages: TranscriptLanguage[]
  durationText?: string
  durationSeconds?: number
  wordCount?: number
}

export function parseExternalTranscript(body: string): ParsedTranscript {
  const lines = body.split('\n')

  const title = /^# Transcript:\s*(.+)$/m.exec(body)?.[1]?.trim() || undefined

  // e.g. "Language: en (auto-generated) · Duration: 12:19 · Words: 7204"
  // or "Language: en · Duration: 3:27 · Words: 481"
  const langLine = /^Language:\s*([^\n]+)$/m.exec(body)?.[1]?.trim() ?? ''
  const langLabel = langLine.split('·')[0]?.trim() || 'en'
  const languageAuto = /auto/i.test(langLabel)
  const languageCode = /^([A-Za-z0-9-]+)/.exec(langLabel)?.[1] ?? langLabel

  const durationText = /Duration:\s*([\d:]+)/.exec(langLine)?.[1]
  const durationSeconds = durationText ? cueToSeconds(durationText) : undefined
  const wordsRaw = /Words:\s*([\d,]+)/.exec(langLine)?.[1]?.replace(/,/g, '')
  const wordCount = wordsRaw && /^\d+$/.test(wordsRaw) ? Number(wordsRaw) : undefined

  const languages: TranscriptLanguage[] = []
  const seen = new Set<string>()
  const pushLang = (code: string, name: string, auto: boolean) => {
    const c = code.trim()
    if (!c) return
    const key = `${c}|${name}|${auto}`
    if (seen.has(key)) return
    seen.add(key)
    languages.push({ code: c, name: name.trim() || c, auto })
  }
  pushLang(languageCode, langLabel, languageAuto)

  const othersLine = lines.find((l) => /^Other available languages:/i.test(l.trim()))
  if (othersLine) {
    const rest = othersLine.replace(/^Other available languages:/i, '')
    for (const chunk of rest.split(',')) {
      const c = chunk.trim()
      if (!c) continue
      const m = /^(.*?)\s*\(([A-Za-z0-9-]+)\)\s*(\[auto\])?/i.exec(c)
      if (m) {
        const name = (m[1] ?? '').trim() || m[2]
        pushLang(m[2], name, Boolean(m[3]) || /^a-/i.test(name))
      } else {
        const bare = /^([A-Za-z0-9-]+)(\s*\[auto\])?$/i.exec(c)
        if (bare) pushLang(bare[1], bare[1], Boolean(bare[2]))
      }
    }
  }

  const segments: TranscriptSegment[] = []
  for (const line of lines) {
    const m = /^\[((?:\d+:)?\d+:\d+)\]\s*(.*)$/.exec(line.trim())
    if (!m) continue
    const start = cueToSeconds(m[1])
    const text = decodeEntities(m[2].replace(/<[^>]*>/g, ' '))
    if (start === undefined || !text) continue
    segments.push({ start, duration: 0, text })
  }
  for (let i = 0; i + 1 < segments.length; i++) {
    segments[i].duration = Math.max(0, segments[i + 1].start - segments[i].start)
  }

  let text = segments.map((s) => s.text).join(' ')
  if (!segments.length) {
    // No timestamped cues — salvage any non-header body text rather than nothing.
    const salvaged = lines
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith('#') &&
          !/^Source video:/i.test(l) &&
          !/^Language:/i.test(l) &&
          !/^Other available languages:/i.test(l) &&
          !/^To request a specific language:/i.test(l) &&
          !/^Interactive version/i.test(l) &&
          !/^## Transcript/i.test(l) &&
          l !== '---' &&
          !/^Generated by https:\/\/youtube-transcript\.ai/i.test(l)
      )
      .join(' ')
    text = decodeEntities(salvaged.replace(/<[^>]*>/g, ' '))
    if (text) segments.push({ start: 0, duration: 0, text })
  }

  return {
    segments,
    text,
    title,
    languageCode,
    languageLabel: langLabel,
    languageAuto,
    languages,
    durationText,
    durationSeconds,
    wordCount,
  }
}

function isExternalMiss(body: string): boolean {
  return /no transcript (found|available)|video not found|invalid video|transcript (not found|unavailable)/i.test(body)
}

export async function fetchExternalTranscriptBody(id: string, language?: string): Promise<string | null> {
  const lang = (language ?? '').trim()
  const urls = lang
    ? [`${EXTERNAL_TRANSCRIPT_BASE}/${id}.txt?lang=${encodeURIComponent(lang)}`, `${EXTERNAL_TRANSCRIPT_BASE}/${id}.txt`]
    : [`${EXTERNAL_TRANSCRIPT_BASE}/${id}.txt`]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': EXTERNAL_UA, accept: 'text/plain,*/*' },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 404) continue
      if (!res.ok) continue
      const body = await res.text()
      if (!body.trim() || isExternalMiss(body)) continue
      return body
    } catch {
      continue
    }
  }
  return null
}

export const youtubeTranscript = tool({
  description:
    'Full captions for a YouTube video as plain text plus timestamped segments, with the video ' +
    'title, language, duration and word count. Reads the youtube-transcript.ai mirror for the ' +
    'video id (YouTube itself will not serve caption files to this network). Always returns ' +
    'the complete transcript — pass language only to request a specific published track.',
  inputSchema: z.object({
    description: toolDescription,
    video: z.string().min(1).max(200).describe('Video id or watch / youtu.be / shorts URL.'),
    language: z
      .string()
      .max(20)
      .optional()
      .describe('Language code, e.g. "de-DE". Defaults to whatever track the mirror serves.'),
  }),
  execute: async ({ video, language }) => {
    try {
      const id = await resolveVideoId(video)
      const langKey = (language ?? '').trim().toLowerCase() || 'auto'
      const cacheKey = `transcript:${id}:${langKey}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.transcript)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      const mirrorBody = await fetchExternalTranscriptBody(id, language)
      if (!mirrorBody) {
        return {
          ok: true as const,
          source: SHOP,
          videoId: id,
          url: videoUrl(id),
          languages: [],
          segments: [],
          text: '',
          note: 'This video has no transcript — the mirror returned nothing for this id.',
        }
      }

      const parsed = parseExternalTranscript(mirrorBody)
      if (!parsed.segments.length && !parsed.text) {
        return {
          ok: true as const,
          source: SHOP,
          videoId: id,
          url: videoUrl(id),
          languages: [],
          segments: [],
          text: '',
          note: 'This video has no transcript — the mirror returned nothing usable for this id.',
        }
      }

      const picked: TranscriptLanguage = {
        code: parsed.languageCode,
        name: parsed.languageLabel,
        auto: parsed.languageAuto,
      }
      const result = {
        source: SHOP,
        videoId: id,
        url: videoUrl(id),
        ...(parsed.title ? { title: parsed.title } : {}),
        languages: parsed.languages,
        picked,
        segments: parsed.segments,
        text: parsed.text,
        ...(parsed.durationText ? { durationText: parsed.durationText } : {}),
        ...(parsed.durationSeconds !== undefined ? { durationSeconds: parsed.durationSeconds } : {}),
        ...(parsed.wordCount !== undefined ? { wordCount: parsed.wordCount } : {}),
        note: `Transcript via youtube-transcript.ai mirror (language "${parsed.languageCode}").`,
        fallback: 'youtube-transcript.ai' as const,
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

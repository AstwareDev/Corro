import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
  failure,
  getTube,
  polite,
  resolveVideoId,
  SHOP,
  TTLS,
  YouTubeError,
} from './client.js'

interface CaptionTrack {
  base_url: string
  language_code: string
  name?: { text?: string }
  kind?: string
}

interface Segment {
  start: number
  duration: number
  text: string
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

function parseSrv3(xml: string): Segment[] {
  const out: Segment[] = []
  const re = /<p[^>]*t="(\d+)"[^>]*d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const text = decodeEntities(m[3].replace(/<[^>]*>/g, ' '))
    if (!text) continue
    out.push({ start: Number(m[1]) / 1000, duration: Number(m[2]) / 1000, text })
  }
  return out
}

function parseVtt(vtt: string): Segment[] {
  const out: Segment[] = []
  const stamp = /(\d+:)?(\d+):(\d+)\.(\d+)\s*-->\s*(\d+:)?(\d+):(\d+)\.(\d+)/
  const blocks = vtt.split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const idx = lines.findIndex((l) => stamp.test(l))
    if (idx === -1) continue
    const m = stamp.exec(lines[idx])
    if (!m) continue
    const toSec = (h: string | undefined, mi: string, s: string, ms: string) =>
      (h ? Number(h.replace(':', '')) * 3600 : 0) + Number(mi) * 60 + Number(s) + Number(ms) / 1000
    const start = toSec(m[1], m[2], m[3], m[4])
    const end = toSec(m[5], m[6], m[7], m[8])
    const text = decodeEntities(lines.slice(idx + 1).join(' ').replace(/<[^>]*>/g, ' '))
    if (!text) continue
    out.push({ start, duration: Math.max(0, end - start), text })
  }
  return out
}

function parseJson3(json: string): Segment[] {
  try {
    const doc = JSON.parse(json) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> }
    return (doc.events ?? []).flatMap((e) => {
      const text = decodeEntities((e.segs ?? []).map((s) => s.utf8 ?? '').join(''))
      if (!text) return []
      return [{ start: (e.tStartMs ?? 0) / 1000, duration: (e.dDurationMs ?? 0) / 1000, text }]
    })
  } catch {
    return []
  }
}

export const youtubeTranscript = tool({
  description:
    'Captions for a YouTube video — uploaded or auto-generated — as plain text and timestamped ' +
    'segments. Lists every available language first; pass one to read it. Auto-translated tracks ' +
    'are not requested (only tracks YouTube itself publishes for the video).',
  inputSchema: z.object({
    description: toolDescription,
    video: z.string().min(1).max(200).describe('Video id or watch / youtu.be / shorts URL.'),
    language: z
      .string()
      .max(20)
      .optional()
      .describe('Language code, e.g. "en". Defaults to English, else the first uploaded track.'),
    timestamps: z.boolean().default(true).describe('Include per-segment start/duration. Set false for plain text only.'),
  }),
  execute: async ({ video, language, timestamps }) => {
    try {
      const id = await resolveVideoId(video)
      const cacheKey = `transcript:${id}:${language ?? 'auto'}:${timestamps ? 'ts' : 'plain'}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.transcript)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      await polite()
      const tube = await getTube()
      let info
      try {
        info = await tube.getInfo(id)
      } catch (err) {
        throw new YouTubeError(`YouTube would not open video ${id} — ${err instanceof Error ? err.message : 'unknown reason'}`)
      }

      const tracks = (info.captions?.caption_tracks ?? []) as unknown as CaptionTrack[]
      if (!tracks.length) {
        return { ok: true as const, source: SHOP, videoId: id, languages: [], segments: [], text: '', note: 'This video publishes no captions.' }
      }
      const languages = tracks.map((t) => ({
        code: t.language_code,
        name: t.name?.text ?? t.language_code,
        auto: t.kind === 'asr',
      }))

      const want = (language ?? '').toLowerCase()
      const picked =
        (want && tracks.find((t) => t.language_code.toLowerCase() === want)) ||
        (want && tracks.find((t) => t.language_code.toLowerCase().startsWith(want))) ||
        tracks.find((t) => t.language_code.toLowerCase() === 'en' && t.kind !== 'asr') ||
        tracks.find((t) => t.language_code.toLowerCase().startsWith('en')) ||
        tracks.find((t) => t.kind !== 'asr') ||
        tracks[0]
      if (!picked) throw new YouTubeError('YouTube layout changed, selector PlayerCaptionsTracklist.caption_tracks not found')

      let segments: Segment[] = []
      let fetchNote: string | undefined
      for (const fmt of ['', '&fmt=srv3', '&fmt=vtt', '&fmt=json3']) {
        try {
          const res = await fetch(`${picked.base_url}${fmt}`, {
            headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' },
            signal: AbortSignal.timeout(20_000),
          })
          if (!res.ok) continue
          const body = await res.text()
          if (!body.trim()) continue
          const trimmed = body.trimStart()
          if (trimmed.startsWith('<')) segments = parseSrv3(body)
          else if (trimmed.startsWith('WEBVTT') || body.includes('-->')) segments = parseVtt(body)
          else if (trimmed.startsWith('{')) segments = parseJson3(body)
          if (segments.length) break
        } catch {
          continue
        }
      }
      if (!segments.length) {
        fetchNote =
          'YouTube listed captions but would not serve the caption file from this network (empty timedtext response) — retry locally or open the video page; the track list above is still accurate.'
        const result = { source: SHOP, videoId: id, languages, picked: { code: picked.language_code, name: picked.name?.text ?? picked.language_code, auto: picked.kind === 'asr' }, segments: [], text: '', note: fetchNote }
        return { ok: true as const, ...result }
      }

      const text = segments.map((s) => s.text).join(' ')
      const result = {
        source: SHOP,
        videoId: id,
        languages,
        picked: { code: picked.language_code, name: picked.name?.text ?? picked.language_code, auto: picked.kind === 'asr' },
        ...(timestamps ? { segments: segments.slice(0, 500) } : {}),
        text,
        ...(segments.length > 500 ? { note: `Showing the first 500 of ${segments.length} segments; the plain text covers the whole video.` } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  bestThumb,
  cacheGet,
  cacheSet,
  channelUrl,
  failure,
  getTube,
  polite,
  resolveVideoId,
  SHOP,
  textOf,
  TTLS,
  videoUrl,
  YouTubeError,
} from './client.js'

export const youtubeVideo = tool({
  description:
    'Full detail for one YouTube video — title, channel, exact view and like counts, comment count, ' +
    'upload date, duration, full description, tags/category, and available quality/formats. ' +
    'Takes a video id or watch URL exactly as youtube_channel_videos returned it.',
  inputSchema: z.object({
    description: toolDescription,
    video: z
      .string()
      .min(1)
      .max(200)
      .describe('Video id (11 chars) or watch / youtu.be / shorts URL.'),
    maxChars: z.number().int().min(200).max(8000).default(2000).describe('Budget for the description text.'),
  }),
  execute: async ({ video, maxChars }) => {
    try {
      const id = await resolveVideoId(video)
      const cached = cacheGet<Record<string, unknown>>(`video:${id}:${maxChars}`, TTLS.video)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      await polite()
      const tube = await getTube()
      let info
      try {
        info = await tube.getInfo(id)
      } catch (err) {
        throw new YouTubeError(
          `YouTube would not open video ${id} — ${err instanceof Error ? err.message : 'it may be private, deleted, or age-restricted'}`
        )
      }

      const basic = info.basic_info as unknown as Record<string, unknown>
      const primary = info.primary_info as unknown as
        | { view_count?: { view_count?: unknown; original_view_count?: number }; published?: unknown; relative_date?: unknown }
        | undefined
      const secondary = info.secondary_info as unknown as
        | { owner?: { title?: unknown; subscriber_count?: unknown }; description?: unknown }
        | undefined
      if (!basic || !basic.title) {
        throw new YouTubeError('YouTube layout changed, selector VideoInfo.basic_info.title not found')
      }

      const title = String(basic.title)
      const channelId = typeof basic.channel_id === 'string' ? basic.channel_id : undefined
      const author = typeof basic.author === 'string' ? basic.author : textOf(secondary?.owner?.title)
      const viewCount =
        typeof primary?.view_count?.original_view_count === 'number'
          ? primary.view_count.original_view_count
          : typeof basic.view_count === 'number'
            ? basic.view_count
            : undefined
      const viewText = textOf(primary?.view_count?.view_count)
      const likeCount = typeof basic.like_count === 'number' ? basic.like_count : undefined
      const published = textOf(primary?.published)
      const publishedRelative = textOf(primary?.relative_date)
      const duration = typeof basic.duration === 'number' ? basic.duration : undefined
      const category = typeof basic.category === 'string' ? basic.category : undefined
      const keywords = Array.isArray(basic.keywords) ? (basic.keywords as unknown[]).filter((k): k is string => typeof k === 'string').slice(0, 30) : []
      const tags = Array.isArray(basic.tags) ? (basic.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 30) : keywords
      const thumbs = basic.thumbnail as Array<{ url?: string; width?: number }> | undefined
      const thumbnail = bestThumb(thumbs) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      const fullDescription = textOf(secondary?.description) ?? (typeof basic.short_description === 'string' ? basic.short_description : undefined)

      let commentCount: number | undefined
      try {
        const comments = await tube.getComments(id)
        const header = comments.header as unknown as { count?: unknown }
        const countText = textOf(header?.count)
        if (countText) {
          const digits = countText.replace(/[^\d]/g, '')
          if (digits) commentCount = Number(digits)
        }
      } catch {
        commentCount = undefined
      }

      const streaming = info.streaming_data as unknown as
        | { formats?: unknown[]; adaptive_formats?: unknown[] }
        | undefined
      const formats: Array<Record<string, unknown>> = []
      for (const f of [...(streaming?.formats ?? []), ...(streaming?.adaptive_formats ?? [])].slice(0, 40)) {
        const fmt = f as Record<string, unknown>
        formats.push({
          ...(typeof fmt.itag === 'number' ? { itag: fmt.itag } : {}),
          ...(typeof fmt.quality_label === 'string' ? { quality: fmt.quality_label } : {}),
          ...(typeof fmt.mime_type === 'string' ? { mime: fmt.mime_type } : {}),
          ...(typeof fmt.bitrate === 'number' ? { bitrate: fmt.bitrate } : {}),
          ...(typeof fmt.content_length === 'string' ? { bytes: Number(fmt.content_length) || undefined } : {}),
          ...(typeof fmt.has_audio === 'boolean' || typeof fmt.has_video === 'boolean'
            ? { streams: [fmt.has_video ? 'video' : '', fmt.has_audio ? 'audio' : ''].filter(Boolean).join('+') || undefined }
            : {}),
        })
      }
      const qualities = [...new Set(formats.map((f) => f.quality).filter(Boolean))] as string[]

      const description =
        fullDescription && fullDescription.length > maxChars
          ? `${fullDescription.slice(0, maxChars).trimEnd()}…`
          : fullDescription

      const result = {
        source: SHOP,
        id,
        title,
        url: videoUrl(id),
        ...(author ? { channel: { ...(channelId ? { id: channelId, url: channelUrl(channelId) } : {}), name: author } } : {}),
        ...(viewCount !== undefined ? { viewCount } : {}),
        ...(viewText ? { viewText } : {}),
        ...(likeCount !== undefined ? { likeCount } : {}),
        ...(commentCount !== undefined ? { commentCount } : {}),
        ...(published ? { published } : {}),
        ...(publishedRelative ? { publishedRelative } : {}),
        ...(duration !== undefined ? { durationSeconds: duration } : {}),
        ...(category ? { category } : {}),
        ...(tags.length ? { tags } : {}),
        ...(description ? { description } : {}),
        thumbnail,
        ...(qualities.length ? { qualities } : {}),
        ...(formats.length ? { formats: formats.slice(0, 20) } : {}),
      }
      cacheSet(`video:${id}:${maxChars}`, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

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
  parseApproxCount,
  parseExactCount,
  polite,
  resolveChannelId,
  SHOP,
  textOf,
  TTLS,
  YouTubeError,
} from './client.js'

function bannerOf(header: unknown): string | undefined {
  try {
    const content = (header as { content?: Record<string, unknown> })?.content
    if (!content) return undefined
    // New PageHeaderView layout keeps the banner outside `banner` on some
    // channels; try the known slots before giving up.
    const candidates = [
      (content.banner as { image?: Array<{ url?: string; width?: number }> })?.image,
      (content.hero_image as { image?: Array<{ url?: string; width?: number }> })?.image,
    ]
    for (const thumbs of candidates) {
      const url = bestThumb(thumbs)
      if (url) return url
    }
    return undefined
  } catch {
    return undefined
  }
}

export const youtubeChannel = tool({
  description:
    'Channel info for a YouTube channel — display name, @handle, subscriber count as shown, ' +
    'about text, avatar and banner image URLs, join date and total video count. ' +
    'Use it when someone asks about a channel itself ("who runs X", "how many subscribers"). ' +
    'Follow up with youtube_channel_videos for what the channel posted.',
  inputSchema: z.object({
    description: toolDescription,
    channel: z
      .string()
      .min(1)
      .max(200)
      .describe('Channel id (UC…), @handle, or full channel URL, e.g. "@RickAstleyYT" or "https://www.youtube.com/@RickAstleyYT".'),
  }),
  execute: async ({ channel }) => {
    try {
      const id = await resolveChannelId(channel)
      const cached = cacheGet<{ [k: string]: unknown }>(`channel:${id}`, TTLS.channel)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      await polite()
      const tube = await getTube()
      let page
      try {
        page = await tube.getChannel(id)
      } catch (err) {
        throw new YouTubeError(
          `YouTube would not open channel ${id} — ${err instanceof Error ? err.message : 'unknown reason'}`
        )
      }

      const header = page.header as unknown as {
        page_title?: string
        content?: {
          title?: unknown
          image?: { avatar?: { image?: Array<{ url?: string; width?: number }> } }
          metadata?: { metadata_rows?: Array<{ metadata_parts?: Array<{ text?: unknown }> }> }
          description?: unknown
        }
      }
      const content = header?.content
      if (!content) {
        throw new YouTubeError('YouTube layout changed, selector PageHeader.content not found')
      }

      const title = textOf(content.title) ?? header.page_title ?? id
      const rows = content.metadata?.metadata_rows?.flatMap((r) => r.metadata_parts ?? []) ?? []
      const rowTexts = rows.map((p) => textOf(p.text)).filter(Boolean) as string[]
      const handle = rowTexts.find((t) => t.startsWith('@'))
      const subsText = rowTexts.find((t) => /subscriber/i.test(t))
      const videosText = rowTexts.find((t) => /videos?/i.test(t))
      const avatar = bestThumb(content.image?.avatar?.image)

      let about: string | undefined
      let joined: string | undefined
      let videoCount: number | undefined
      let subscriberCount: number | undefined
      try {
        const aboutPage = await page.getAbout()
        const meta = (aboutPage as unknown as { metadata?: Record<string, unknown> })?.metadata as
          | Record<string, unknown>
          | undefined
        if (!meta) throw new YouTubeError('YouTube layout changed, selector AboutChannel.metadata not found')
        about = textOf(meta.description)
        joined = textOf(meta.joined_date)
        subscriberCount =
          parseApproxCount(textOf(meta.subscriber_count)) ?? parseApproxCount(subsText)
        videoCount = parseExactCount(textOf(meta.video_count)) ?? parseExactCount(videosText)
      } catch (err) {
        if (err instanceof YouTubeError) throw err
        // About tab is best-effort: keep header facts when it fails.
        subscriberCount = parseApproxCount(subsText)
        videoCount = parseExactCount(videosText)
      }

      const result = {
        source: SHOP,
        id,
        title,
        ...(handle ? { handle } : {}),
        ...(subsText ? { subscriberText: subsText } : {}),
        ...(subscriberCount !== undefined ? { subscriberCount } : {}),
        ...(about ? { description: about } : {}),
        ...(avatar ? { avatar } : {}),
        ...(() => {
          const banner = bannerOf(page.header)
          return banner ? { banner } : {}
        })(),
        ...(joined ? { joined } : {}),
        ...(videoCount !== undefined ? { videoCount } : {}),
        url: channelUrl(id, handle),
      }
      cacheSet(`channel:${id}`, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

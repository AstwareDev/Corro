import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
  extractLdJsonBlocks,
  extractStateBlobs,
  failure,
  fetchHtml,
  findShortcodeMedia,
  extractShortcode,
  InstagramError,
  looksLikeLoginWall,
  LOGIN_WALL_DISMISSIBLE_NOTE,
  postUrl,
  SHOP,
  TTLS,
  shellError,
} from './client.js'
import { mapMediaNode, type AnyObj } from './shape.js'

function fullCaption(node: AnyObj): string | undefined {
  const edge = node.edge_media_to_caption as AnyObj | undefined
  const edges = edge?.edges as Array<{ node?: { text?: unknown } }> | undefined
  const text = edges?.[0]?.node?.text
  return typeof text === 'string' && text.trim() ? text : undefined
}

async function fetchMedia(shortcode: string): Promise<{ media: AnyObj; loginWall: boolean }> {
  const urls = [`${postUrl(shortcode)}`, `https://www.instagram.com/reel/${shortcode}/`]
  let lastHtml = ''
  let lastErr: unknown
  for (const url of urls) {
    try {
      const html = await fetchHtml(url)
      lastHtml = html
      const blobs = extractStateBlobs(html)
      // ld+json blocks are a fallback confirmation only; the shortcode blob is authoritative.
      void extractLdJsonBlocks(html)
      const media = findShortcodeMedia(blobs)
      // The login prompt is usually a closable overlay — data may still be here.
      if (media) return { media, loginWall: looksLikeLoginWall(html) }
      lastErr = new Error('no shortcode_media blob')
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr instanceof InstagramError) throw lastErr
  throw shellError(lastHtml, 'ShortcodeMedia.shortcode_media', `Post ${shortcode}`)
}

export const instagramPost = tool({
  description:
    'Full detail for one public Instagram post or reel — caption, media type ' +
    '(image/video/carousel, reels flagged type:reel with playCount when exposed), media URLs, ' +
    'like and comment counts, timestamp, owner and direct URL. ' +
    'Takes a shortcode or /p/ /reel/ URL exactly as instagram_posts returned it.',
  inputSchema: z.object({
    description: toolDescription,
    post: z.string().min(1).max(300).describe('Post shortcode or full /p/ /reel/ URL.'),
    maxChars: z.number().int().min(200).max(8000).default(2000).describe('Budget for the caption text.'),
  }),
  execute: async ({ post, maxChars }) => {
    try {
      const shortcode = extractShortcode(post)
      const cacheKey = `instagram:post:${shortcode}:${maxChars}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.post)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      const { media, loginWall } = await fetchMedia(shortcode).catch((err: unknown) => {
        if (err instanceof InstagramError) throw err
        const msg = err instanceof Error ? err.message : ''
        throw new InstagramError(
          `Instagram would not open post ${shortcode} — ${msg || 'it may be private, deleted, or age-restricted'}. ` +
            'If the layout changed, selectors ShortcodeMedia.shortcode_media need updating.'
        )
      })
      const row = mapMediaNode(media)
      if (!row) {
        throw new Error(
          'Instagram layout changed, selector ShortcodeMedia field mapping failed — the media node shape moved.'
        )
      }
      const full = fullCaption(media)
      const caption =
        full && full.length > maxChars ? `${full.slice(0, maxChars).trimEnd()}…` : (full ?? row.caption)
      const result = {
        source: SHOP,
        ...row,
        ...(caption ? { caption } : {}),
        ...(row.type === 'reel' ? { isReel: true as const } : {}),
        ...(loginWall ? { note: LOGIN_WALL_DISMISSIBLE_NOTE } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

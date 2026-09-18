import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  bestThumb,
  cacheGet,
  cacheSet,
  contPut,
  contTake,
  decodeCont,
  encodeCont,
  extractRawCont,
  failure,
  fetchCont,
  getTube,
  parseApproxCount,
  polite,
  resolveVideoId,
  SHOP,
  SITE,
  textOf,
  TTLS,
  YouTubeError,
} from './client.js'

export interface CommentRow {
  author: string
  authorUrl?: string
  authorAvatar?: string
  text: string
  likes?: string
  likeCount?: number
  published?: string
  replyCount?: number
}

function parseThread(thread: unknown): CommentRow | undefined {
  try {
    const t = thread as {
      type?: string
      comment?: {
        type?: string
        content?: unknown
        published_time?: string | { text?: string }
        like_count?: string
        reply_count?: string | number
        author?: {
          name?: string
          id?: string
          thumbnails?: Array<{ url?: string; width?: number }>
          avatar_thumbnail_url?: string
        }
      }
    }
    const c = t?.comment
    if (!c || (c.type !== 'CommentView' && c.type !== 'Comment')) {
      throw new YouTubeError('YouTube layout changed, selector CommentThread.comment not found')
    }
    const text = textOf(c.content)
    const author = c.author?.name ?? 'Unknown'
    if (!text) return undefined
    const published = typeof c.published_time === 'string' ? c.published_time : textOf(c.published_time)
    const likes = typeof c.like_count === 'string' ? c.like_count : undefined
    const replyCount =
      typeof c.reply_count === 'number'
        ? c.reply_count
        : typeof c.reply_count === 'string'
          ? Number(c.reply_count.replace(/[^\d]/g, '')) || undefined
          : undefined
    return {
      author,
      ...(c.author?.id ? { authorUrl: `${SITE}/channel/${c.author.id}` } : {}),
      ...(() => {
        const avatar = bestThumb(c.author?.thumbnails) ?? c.author?.avatar_thumbnail_url
        return avatar ? { authorAvatar: avatar } : {}
      })(),
      text,
      ...(likes ? { likes, ...(parseApproxCount(likes) !== undefined ? { likeCount: parseApproxCount(likes) } : {}) } : {}),
      ...(published ? { published } : {}),
      ...(replyCount !== undefined ? { replyCount } : {}),
    }
  } catch (err) {
    if (err instanceof YouTubeError) throw err
    throw new YouTubeError('YouTube layout changed, selector CommentView.content not found')
  }
}

/** Threads + next raw continuation out of a comments body item list. */
function splitBody(items: unknown): { rows: CommentRow[]; raw?: { api: string; token: string } } {
  const rows: CommentRow[] = []
  let raw: { api: string; token: string } | undefined
  if (!Array.isArray(items)) return { rows }
  for (const item of items) {
    if ((item as { type?: string })?.type === 'ContinuationItem') {
      raw = extractRawCont(item) ?? raw
      continue
    }
    try {
      const row = parseThread(item)
      if (row) rows.push(row)
    } catch {
      continue
    }
  }
  return { rows, raw }
}

function firstPageRaw(thread: unknown): { api: string; token: string } | undefined {
  const endpoints = (
    thread as { page?: { on_response_received_endpoints?: Array<{ contents?: unknown }> } }
  )?.page?.on_response_received_endpoints
  const body = Array.isArray(endpoints) ? endpoints[1] : undefined
  const items = (body as { contents?: unknown } | undefined)?.contents
  if (!Array.isArray(items)) return undefined
  const node = items.find((n) => (n as { type?: string })?.type === 'ContinuationItem')
  return node ? extractRawCont(node) : undefined
}

function nextResponseItems(resp: unknown): unknown {
  const endpoints = (resp as { on_response_received_endpoints?: Array<{ contents?: unknown }> })
    ?.on_response_received_endpoints
  if (!Array.isArray(endpoints) || !endpoints[0]) {
    throw new YouTubeError('YouTube layout changed, selector comments continuation response not found')
  }
  return (endpoints[0] as { contents?: unknown }).contents
}

export const youtubeComments = tool({
  description:
    'Top-level comments on a YouTube video — author name, avatar and channel URL, text, like count and ' +
    'timestamp. Replies are out of scope (reply counts are reported but not expanded). ' +
    'First page holds about 20; pass continuation to load more (tokens survive restarts).',
  inputSchema: z.object({
    description: toolDescription,
    video: z.string().min(1).max(200).describe('Video id or watch / youtu.be / shorts URL.'),
    sort: z.enum(['top', 'newest']).default('top').describe('"top" is YouTube default; "newest" is newest-first.'),
    maxResults: z.number().int().min(1).max(40).default(20).describe('Comments to return from the loaded page.'),
    continuation: z.string().max(8000).optional().describe('Load-more token from a previous youtube_comments call. Tokens survive restarts.'),
  }),
  execute: async ({ video, sort, maxResults, continuation }) => {
    try {
      if (continuation) {
        const cont = decodeCont(continuation)
        if (!cont || cont.kind !== 'comments') {
          // Legacy same-process token from before the stateless switch.
          const state = contTake<{ getContinuation: () => Promise<{ contents?: unknown[]; has_continuation?: boolean | (() => boolean) }> }>(
            `yt-comments:${continuation}`
          )
          if (!state) {
            return { ok: false as const, error: 'That load-more token expired — rerun youtube_comments without a continuation.' }
          }
          await polite()
          let next
          try {
            next = await state.getContinuation()
          } catch (err) {
            throw new YouTubeError(`YouTube would not load more comments — ${err instanceof Error ? err.message : 'unknown reason'}`)
          }
          const { rows, raw } = splitBody(next.contents)
          const sliced = rows.slice(0, maxResults)
          const hasMore =
            typeof next.has_continuation === 'function' ? next.has_continuation() : next.has_continuation === true
          const outContinuation = hasMore && raw ? encodeCont({ kind: 'comments', api: raw.api, token: raw.token }) : undefined
          return {
            ok: true as const,
            source: SHOP,
            comments: sliced,
            onThisPage: rows.length,
            hasMore,
            replies: 'out-of-scope' as const,
            ...(outContinuation ? { continuation: outContinuation } : {}),
          }
        }
        await polite()
        const tube = await getTube()
        const resp = await fetchCont(tube, cont)
        const extra = (cont.extra ?? {}) as { videoId?: string; totalText?: string; sort?: string }
        const { rows, raw } = splitBody(nextResponseItems(resp))
        const sliced = rows.slice(0, maxResults)
        const hasMore = raw !== undefined
        const outContinuation =
          hasMore && raw
            ? encodeCont({ kind: 'comments', api: raw.api, token: raw.token, extra: cont.extra })
            : undefined
        return {
          ok: true as const,
          source: SHOP,
          ...(extra.videoId ? { videoId: extra.videoId } : {}),
          ...(extra.totalText ? { totalText: extra.totalText } : {}),
          ...(extra.sort ? { sort: extra.sort } : {}),
          comments: sliced,
          onThisPage: rows.length,
          hasMore,
          replies: 'out-of-scope' as const,
          ...(outContinuation ? { continuation: outContinuation } : {}),
        }
      }

      const id = await resolveVideoId(video)
      const cacheKey = `comments:${id}:${sort}:${maxResults}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.comments)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      await polite()
      const tube = await getTube()
      let thread
      try {
        thread = await tube.getComments(id, sort === 'newest' ? 'NEWEST_FIRST' : 'TOP_COMMENTS')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown reason'
        if (/disabled|limited|unavailable/i.test(msg)) {
          return { ok: true as const, source: SHOP, videoId: id, comments: [], onThisPage: 0, hasMore: false, disabled: true as const, note: 'Comments are disabled or unavailable on this video.' }
        }
        // Fallback path: comments sometimes need the rendered page when
        // Innertube answers with a bot-check. Surface it honestly rather
        // than pretending there are no comments.
        throw new YouTubeError(
          `YouTube would not return comments for ${id} — ${msg}. If this persists, open the watch page with browser_open and read them there.`
        )
      }

      const header = thread.header as unknown as { count?: unknown }
      const totalText = textOf(header?.count)
      const { rows } = splitBody(thread.contents)
      const sliced = rows.slice(0, maxResults)
      const hasMore = thread.has_continuation
      const raw = hasMore ? firstPageRaw(thread) : undefined
      // Stateless token preferred (survives restarts); same-process store as fallback.
      const outContinuation = raw
        ? encodeCont({ kind: 'comments', api: raw.api, token: raw.token, extra: { videoId: id, ...(totalText ? { totalText } : {}), sort } })
        : hasMore
          ? contPut('yt-comments', thread)
          : undefined
      const result = {
        source: SHOP,
        videoId: id,
        ...(totalText ? { totalText } : {}),
        sort,
        comments: sliced,
        onThisPage: rows.length,
        hasMore,
        replies: 'out-of-scope' as const,
        ...(outContinuation ? { continuation: outContinuation } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

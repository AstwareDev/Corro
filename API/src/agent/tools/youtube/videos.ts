import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  bestThumb,
  cacheGet,
  cacheSet,
  channelUrl,
  contPut,
  contTake,
  decodeCont,
  encodeCont,
  extractRawCont,
  failure,
  fetchCont,
  getTube,
  parseApproxCount,
  parseDurationText,
  polite,
  resolveChannelId,
  SHOP,
  SITE,
  textOf,
  thumbUrl,
  TTLS,
  videoUrl,
  YouTubeError,
} from './client.js'

export interface ChannelVideoRow {
  id: string
  title: string
  url: string
  thumbnail: string
  duration?: string
  durationSeconds?: number
  views?: string
  viewCount?: number
  published?: string
  short?: boolean
}

type ListingKind = 'videos' | 'shorts' | 'streams'

function parseLockup(lockup: unknown): ChannelVideoRow | undefined {
  try {
    const view = lockup as {
      content_id?: string
      content_image?: { image?: Array<{ url?: string; width?: number }>; overlays?: Array<{ type?: string; badges?: Array<{ text?: string }> }> }
      metadata?: { title?: unknown; metadata?: { metadata_rows?: Array<{ metadata_parts?: Array<{ text?: unknown }> }> } }
    }
    const id = view.content_id
    if (!id) throw new YouTubeError('YouTube layout changed, selector LockupView.content_id not found')
    const title = textOf(view.metadata?.title) ?? 'Untitled'
    const overlay = view.content_image?.overlays?.find((o) => o.type === 'ThumbnailBottomOverlayView')
    const duration = overlay?.badges?.map((b) => b.text).find(Boolean)
    const rows = view.metadata?.metadata?.metadata_rows?.flatMap((r) => r.metadata_parts ?? []) ?? []
    const parts = rows.map((p) => textOf(p.text)).filter(Boolean) as string[]
    const views = parts.find((t) => /views?/i.test(t))
    const published = parts.find((t) => !/views?/i.test(t))
    return {
      id,
      title,
      url: videoUrl(id),
      thumbnail: bestThumb(view.content_image?.image) ?? thumbUrl(id),
      ...(duration ? { duration, ...(parseDurationText(duration) !== undefined ? { durationSeconds: parseDurationText(duration) } : {}) } : {}),
      ...(views ? { views, ...(parseApproxCount(views) !== undefined ? { viewCount: parseApproxCount(views) } : {}) } : {}),
      ...(published ? { published } : {}),
    }
  } catch (err) {
    if (err instanceof YouTubeError) throw err
    throw new YouTubeError('YouTube layout changed, selector LockupView.metadata not found')
  }
}

function parseShort(lockup: unknown): ChannelVideoRow | undefined {
  try {
    const view = lockup as {
      on_tap_endpoint?: { payload?: { videoId?: string; thumbnail?: { thumbnails?: Array<{ url?: string; width?: number }> } } }
      overlay_metadata?: { primary_text?: unknown; secondary_text?: unknown }
    }
    const id = view.on_tap_endpoint?.payload?.videoId
    if (!id) throw new YouTubeError('YouTube layout changed, selector ShortsLockupView.videoId not found')
    const title = textOf(view.overlay_metadata?.primary_text) ?? 'Untitled'
    const views = textOf(view.overlay_metadata?.secondary_text)
    return {
      id,
      title,
      url: `${SITE}/shorts/${id}`,
      thumbnail: bestThumb(view.on_tap_endpoint?.payload?.thumbnail?.thumbnails) ?? thumbUrl(id),
      ...(views ? { views, ...(parseApproxCount(views) !== undefined ? { viewCount: parseApproxCount(views) } : {}) } : {}),
      short: true as const,
    }
  } catch (err) {
    if (err instanceof YouTubeError) throw err
    throw new YouTubeError('YouTube layout changed, selector ShortsLockupView.overlay_metadata not found')
  }
}

/** One grid item (LockupView or ShortsLockupView) into a row. */
function parseGridInner(inner: unknown): ChannelVideoRow | undefined {
  const type = (inner as { type?: string })?.type
  try {
    if (type === 'ShortsLockupView') return parseShort(inner)
    if (type === 'LockupView') return parseLockup(inner)
    return undefined
  } catch {
    return undefined
  }
}

interface GridPage {
  videos: ChannelVideoRow[]
  hasMore: boolean
  raw?: { api: string; token: string }
}

/** Rows + next raw continuation out of a RichGrid-style item list. */
function splitGrid(items: unknown): GridPage {
  const videos: ChannelVideoRow[] = []
  let hasMore = false
  let raw: { api: string; token: string } | undefined
  if (!Array.isArray(items)) {
    throw new YouTubeError('YouTube layout changed, selector channel grid contents not found')
  }
  for (const item of items) {
    const it = item as { type?: string; content?: unknown }
    if (it?.type === 'ContinuationItem') {
      hasMore = true
      raw = extractRawCont(item) ?? raw
      continue
    }
    const inner = it?.type === 'RichItem' ? it.content : item
    const row = parseGridInner(inner)
    if (row) videos.push(row)
  }
  return { videos, hasMore, ...(raw ? { raw } : {}) }
}

function firstGridItems(tabbed: unknown): unknown {
  const grid = (
    tabbed as { current_tab?: { content?: { contents?: unknown } } }
  )?.current_tab?.content
  const contents = (grid as { contents?: unknown } | undefined)?.contents
  if (!Array.isArray(contents)) {
    throw new YouTubeError('YouTube layout changed, selector Channel tab RichGrid.contents not found')
  }
  return contents
}

function nextGridItems(resp: unknown): unknown {
  const page = resp as {
    on_response_received_actions?: Array<{ contents?: unknown }>
    on_response_received_endpoints?: Array<{ contents?: unknown }>
  }
  const action = page?.on_response_received_actions?.[0] ?? page?.on_response_received_endpoints?.[0]
  const contents = (action as { contents?: unknown } | undefined)?.contents
  if (!Array.isArray(contents)) {
    throw new YouTubeError('YouTube layout changed, selector channel continuation contents not found')
  }
  return contents
}

interface ChannelPage {
  has_videos?: boolean
  has_shorts?: boolean
  has_live_streams?: boolean
  getVideos: () => Promise<unknown>
  getShorts: () => Promise<unknown>
  getLiveStreams: () => Promise<unknown>
}

/** Open the best listing tab: videos first, then shorts, then live streams —
 * Shorts-first channels have no videos tab at all. */
async function openListing(
  page: ChannelPage,
  channelId: string
): Promise<{ tabbed: unknown; kind: ListingKind }> {
  const attempts: Array<{ kind: ListingKind; available?: boolean; open: () => Promise<unknown> }> = [
    { kind: 'videos', available: page.has_videos, open: () => page.getVideos() },
    { kind: 'shorts', available: page.has_shorts, open: () => page.getShorts() },
    { kind: 'streams', available: page.has_live_streams, open: () => page.getLiveStreams() },
  ]
  // Try advertised tabs first, then anything else as a last resort.
  const ordered = [...attempts.filter((a) => a.available !== false), ...attempts.filter((a) => a.available === false)]
  let lastErr: unknown
  for (const attempt of ordered) {
    try {
      return { tabbed: await attempt.open(), kind: attempt.kind }
    } catch (err) {
      lastErr = err
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : 'unknown reason'
  throw new YouTubeError(
    `YouTube would not list videos for ${channelId} — this channel has no videos, shorts, or streams tab (${reason})`
  )
}

const KIND_LABEL: Record<ListingKind, string> = {
  videos: 'videos',
  shorts: 'shorts',
  streams: 'live streams',
}

export const youtubeChannelVideos = tool({
  description:
    'Videos on a YouTube channel — video id, title, thumbnail, duration, view count and publish ' +
    'date as shown on the channel grid. First page holds about 30; pass the returned continuation ' +
    'to load more (tokens survive restarts). Channels that post Shorts instead of regular videos ' +
    'list their Shorts shelf automatically. Follow up with youtube_video for full detail on one video.',
  inputSchema: z.object({
    description: toolDescription,
    channel: z
      .string()
      .min(1)
      .max(200)
      .describe('Channel id (UC…), @handle, or full channel URL.'),
    maxResults: z.number().int().min(1).max(30).default(12).describe('Videos to return from the loaded page.'),
    sort: z
      .enum(['newest', 'popular', 'oldest'])
      .default('newest')
      .describe('Ordering for the Videos tab. Ignored on the Shorts shelf, which YouTube does not sort.'),
    continuation: z
      .string()
      .max(8000)
      .optional()
      .describe('Load-more token from a previous youtube_channel_videos call.'),
  }),
  execute: async ({ channel, maxResults, sort, continuation }) => {
    try {
      if (continuation) {
        const cont = decodeCont(continuation)
        if (!cont || cont.kind !== 'videos') {
          // Legacy same-process token from before the stateless switch.
          const state = contTake<{ getContinuation: () => Promise<unknown> }>(`yt-vids:${continuation}`)
          if (!state) {
            return { ok: false as const, error: 'That load-more token expired — rerun youtube_channel_videos without a continuation.' }
          }
          await polite()
          let next: unknown
          try {
            next = await state.getContinuation()
          } catch (err) {
            throw new YouTubeError(`YouTube would not load more videos — ${err instanceof Error ? err.message : 'unknown reason'}`)
          }
          const actionContents = (next as { contents?: { contents?: unknown } })?.contents?.contents
          const { videos, hasMore, raw } = splitGrid(
            Array.isArray(actionContents) ? actionContents : nextGridItems(next)
          )
          const sliced = videos.slice(0, maxResults)
          const outContinuation = hasMore && raw ? encodeCont({ kind: 'videos', api: raw.api, token: raw.token }) : undefined
          return {
            ok: true as const,
            source: SHOP,
            videos: sliced,
            onThisPage: videos.length,
            hasMore,
            ...(outContinuation ? { continuation: outContinuation } : {}),
            ...(videos.length > sliced.length ? { note: `Showing ${sliced.length} of ${videos.length} loaded; raise maxResults for the rest.` } : {}),
          }
        }
        await polite()
        const tube = await getTube()
        const resp = await fetchCont(tube, cont)
        const extra = (cont.extra ?? {}) as { channelId?: string; kind?: ListingKind }
        const { videos, hasMore, raw } = splitGrid(nextGridItems(resp))
        const sliced = videos.slice(0, maxResults)
        const outContinuation =
          hasMore && raw
            ? encodeCont({ kind: 'videos', api: raw.api, token: raw.token, extra: cont.extra })
            : undefined
        return {
          ok: true as const,
          source: SHOP,
          ...(extra.channelId ? { channelId: extra.channelId } : {}),
          ...(extra.kind ? { tab: KIND_LABEL[extra.kind] } : {}),
          videos: sliced,
          onThisPage: videos.length,
          hasMore,
          ...(outContinuation ? { continuation: outContinuation } : {}),
          ...(videos.length > sliced.length ? { note: `Showing ${sliced.length} of ${videos.length} loaded; raise maxResults for the rest.` } : {}),
        }
      }

      const id = await resolveChannelId(channel)
      const cacheKey = `videos:${id}:${sort}:${maxResults}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.videos)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      await polite()
      const tube = await getTube()
      let page: ChannelPage
      try {
        page = (await tube.getChannel(id)) as unknown as ChannelPage
      } catch (err) {
        throw new YouTubeError(`YouTube would not open channel ${id} — ${err instanceof Error ? err.message : 'unknown reason'}`)
      }
      const { tabbed, kind } = await openListing(page, id)

      let sorted: unknown = tabbed
      let sortNote: string | undefined
      if (kind === 'videos' && sort !== 'newest') {
        const key = sort === 'popular' ? 'POPULAR' : 'OLDEST_FIRST'
        try {
          const maybe = tabbed as { applySort?: (s: string) => Promise<unknown> }
          if (typeof maybe.applySort === 'function') {
            sorted = await maybe.applySort(key)
          } else {
            sortNote = `This channel's Videos tab offers no ${sort} ordering; showing newest.`
          }
        } catch {
          sortNote = `YouTube would not apply the ${sort} ordering here; showing newest instead.`
        }
      } else if (kind !== 'videos' && sort !== 'newest') {
        sortNote = `This channel lists ${KIND_LABEL[kind]}, which YouTube does not sort; ignoring "${sort}".`
      }

      const { videos, hasMore, raw } = splitGrid(firstGridItems(sorted))
      const sliced = videos.slice(0, maxResults)
      const outContinuation =
        hasMore && raw
          ? encodeCont({ kind: 'videos', api: raw.api, token: raw.token, extra: { channelId: id, kind } })
          : undefined
      const result = {
        source: SHOP,
        channelId: id,
        channelUrl: channelUrl(id),
        tab: KIND_LABEL[kind],
        ...(kind === 'videos' ? { sort } : {}),
        videos: sliced,
        onThisPage: videos.length,
        hasMore,
        ...(outContinuation ? { continuation: outContinuation } : {}),
        ...(sortNote ? { note: sortNote } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

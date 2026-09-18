import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
  decodeCont,
  encodeCont,
  extractAppId,
  extractCsrfToken,
  extractLdJsonBlocks,
  extractMetaTags,
  extractStateBlobs,
  failure,
  fetchHtml,
  findLdPerson,
  findUserObject,
  graphqlQuery,
  InstagramError,
  normalizeUsername,
  looksLikeLoginWall,
  LOGIN_WALL_DISMISSIBLE_NOTE,
  profileUrl,
  QUERY_HASH_PROFILE_POSTS,
  SHOP,
  SITE,
  TTLS,
  wallOrLayoutError,
} from './client.js'
import { mapMediaNode, mapProfile, META_FALLBACK_NOTE, profileFromMeta, timelineFromUser, type AnyObj } from './shape.js'

export const instagramPosts = tool({
  description:
    'Post / reel grid for a public Instagram profile — shortcode, caption, media type ' +
    '(image/video/carousel/reel), media URLs, like and comment counts, timestamp and direct URL. ' +
    'First page holds the embedded dozen; pass the returned continuation to page further via ' +
    "Instagram's cursor GraphQL (tokens survive restarts). Reels come back flagged type:reel with playCount when exposed.",
  inputSchema: z.object({
    description: toolDescription,
    profile: z.string().min(1).max(200).describe('Instagram username or full profile URL.'),
    maxResults: z.number().int().min(1).max(30).default(12).describe('Posts to return from the loaded page.'),
    kind: z
      .enum(['all', 'posts', 'reels'])
      .default('all')
      .describe('"reels" keeps only type:reel rows; "posts" drops reels; "all" keeps everything.'),
    continuation: z.string().max(8000).optional().describe('Load-more token from a previous instagram_posts call.'),
  }),
  execute: async ({ profile, maxResults, kind, continuation }) => {
    try {
      if (continuation) {
        const cont = decodeCont(continuation)
        if (!cont || cont.kind !== 'posts') {
          return { ok: false as const, error: 'That load-more token expired or belongs to another list — rerun instagram_posts without a continuation.' }
        }
        const extra = (cont.extra ?? {}) as { username?: string; userId?: string; appId?: string; csrfToken?: string }
        if (!extra.userId) {
          return { ok: false as const, error: 'That load-more token predates pagination support (no user id) — rerun instagram_posts without a continuation.' }
        }
        const resp = await graphqlQuery({
          queryHash: QUERY_HASH_PROFILE_POSTS,
          variables: { id: extra.userId, first: 12, after: cont.cursor },
          ...(extra.appId ? { appId: extra.appId } : {}),
          ...(extra.csrfToken ? { csrfToken: extra.csrfToken } : {}),
        })
        const data = resp.data as AnyObj | undefined
        const user = data?.user as AnyObj | undefined
        const timeline = user?.edge_owner_to_timeline_media as AnyObj | undefined
        if (!timeline) {
          throw new InstagramError(
            'Instagram layout changed, selector GraphQL user.edge_owner_to_timeline_media not found — the query hash likely rotated. Update INSTAGRAM_QUERY_HASH_POSTS and retry.'
          )
        }
        const edges = timeline.edges as Array<{ node?: AnyObj }> | undefined
        const pageInfo = timeline.page_info as { has_next_page?: unknown; end_cursor?: unknown } | undefined
        if (!Array.isArray(edges)) {
          throw new InstagramError('Instagram layout changed, selector GraphQL timeline.edges not found.')
        }
        let rows = edges
          .map((e) => {
            try {
              return e?.node ? mapMediaNode(e.node) : undefined
            } catch {
              return undefined
            }
          })
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
        if (kind === 'reels') rows = rows.filter((p) => p.type === 'reel')
        if (kind === 'posts') rows = rows.filter((p) => p.type !== 'reel')
        const endCursor = typeof pageInfo?.end_cursor === 'string' ? pageInfo.end_cursor : undefined
        const hasMore = pageInfo?.has_next_page === true && Boolean(endCursor)
        const sliced = rows.slice(0, maxResults)
        const outContinuation =
          hasMore && endCursor
            ? encodeCont({ kind: 'posts', cursor: endCursor, extra: cont.extra })
            : undefined
        return {
          ok: true as const,
          source: SHOP,
          ...(extra.username ? { username: extra.username } : {}),
          kind,
          posts: sliced,
          onThisPage: rows.length,
          hasMore,
          ...(outContinuation ? { continuation: outContinuation } : {}),
          ...(rows.length > sliced.length ? { note: `Showing ${sliced.length} of ${rows.length} loaded; raise maxResults for the rest.` } : {}),
        }
      }

      const username = normalizeUsername(profile)
      const cacheKey = `instagram:posts:${username.toLowerCase()}:${kind}:${maxResults}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.posts)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      const html = await fetchHtml(profileUrl(username))
      const blobs = extractStateBlobs(html)
      const ldPerson = findLdPerson(extractLdJsonBlocks(html))
      const loginWall = looksLikeLoginWall(html)
      const user = findUserObject(blobs)
      if (!user) {
        // Degraded path: no embedded timeline (flagged network). The header
        // facts may still be readable from Open Graph tags; the grid itself
        // needs a session Instagram trusts, so report it as empty, not failed.
        const metaProfile = profileFromMeta(extractMetaTags(html), username)
        if (metaProfile) {
          return {
            ok: true as const,
            source: SHOP,
            site: SITE,
            username: metaProfile.username,
            kind,
            posts: [],
            onThisPage: 0,
            hasMore: false,
            note: [META_FALLBACK_NOTE, ...(loginWall ? [LOGIN_WALL_DISMISSIBLE_NOTE] : [])].join(' '),
          }
        }
        throw wallOrLayoutError(html, 'ProfilePage.graphql.user')
      }
      const prof = mapProfile(user, ldPerson)
      if (prof.private) {
        return {
          ok: true as const,
          source: SHOP,
          site: SITE,
          username: prof.username,
          kind,
          posts: [],
          onThisPage: 0,
          hasMore: false,
          private: true as const,
          note: `@${prof.username} is private — the post grid needs an approved follower session (out of scope for this no-login service).`,
        }
      }
      const { nodes, endCursor, hasMore } = timelineFromUser(user)
      if (!nodes.length && (prof.postCount ?? 0) > 0) {
        throw wallOrLayoutError(html, 'ProfilePage.edge_owner_to_timeline_media.edges')
      }
      let rows = nodes
        .map((n) => {
          try {
            return mapMediaNode(n)
          } catch {
            return undefined
          }
        })
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
      if (kind === 'reels') rows = rows.filter((p) => p.type === 'reel')
      if (kind === 'posts') rows = rows.filter((p) => p.type !== 'reel')
      const sliced = rows.slice(0, maxResults)
      const userId = typeof user.id === 'string' ? user.id : undefined
      const appId = extractAppId(html)
      const csrfToken = extractCsrfToken(html)
      const outContinuation =
        hasMore && endCursor
          ? encodeCont({ kind: 'posts', cursor: endCursor, extra: { username: prof.username, ...(userId ? { userId } : {}), ...(appId ? { appId } : {}), ...(csrfToken ? { csrfToken } : {}) } })
          : undefined
      const notes: string[] = []
      if (loginWall) notes.push(LOGIN_WALL_DISMISSIBLE_NOTE)
      if (rows.length > sliced.length) {
        notes.push(`Showing ${sliced.length} of ${rows.length} loaded; raise maxResults for the rest.`)
      }
      const result = {
        source: SHOP,
        site: SITE,
        username: prof.username,
        kind,
        posts: sliced,
        onThisPage: rows.length,
        hasMore,
        ...(outContinuation ? { continuation: outContinuation } : {}),
        ...(notes.length ? { note: notes.join(' ') } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

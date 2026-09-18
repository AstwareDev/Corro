import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
  decodeCont,
  encodeCont,
  extractCsrfToken,
  extractAppId,
  extractStateBlobs,
  failure,
  fetchHtml,
  findShortcodeMedia,
  extractShortcode,
  graphqlQuery,
  looksLikeLoginWall,
  LOGIN_WALL_DISMISSIBLE_NOTE,
  postUrl,
  QUERY_HASH_COMMENTS,
  SHOP,
  TTLS,
  shellError,
} from './client.js'
import { commentsFromMedia, mapCommentNode, type AnyObj } from './shape.js'

export const instagramComments = tool({
  description:
    'Top-level comments on a public Instagram post or reel — commenter username, text, like count ' +
    'and timestamp. First page holds the embedded comments; pass continuation to load more ' +
    '(tokens survive restarts). Posts with comments disabled return an empty list with disabled:true.',
  inputSchema: z.object({
    description: toolDescription,
    post: z.string().min(1).max(300).describe('Post shortcode or full /p/ /reel/ URL.'),
    maxResults: z.number().int().min(1).max(40).default(20).describe('Comments to return from the loaded page.'),
    continuation: z.string().max(8000).optional().describe('Load-more token from a previous instagram_comments call.'),
  }),
  execute: async ({ post, maxResults, continuation }) => {
    try {
      if (continuation) {
        const cont = decodeCont(continuation)
        if (!cont || cont.kind !== 'comments') {
          return { ok: false as const, error: 'That load-more token expired or belongs to another list — rerun instagram_comments without a continuation.' }
        }
        const extra = (cont.extra ?? {}) as { shortcode?: string; appId?: string; csrfToken?: string }
        if (!extra.shortcode) {
          return { ok: false as const, error: 'That load-more token is too old (no shortcode) — rerun instagram_comments without a continuation.' }
        }
        const resp = await graphqlQuery({
          queryHash: QUERY_HASH_COMMENTS,
          variables: { shortcode: extra.shortcode, first: 20, after: cont.cursor },
          ...(extra.appId ? { appId: extra.appId } : {}),
          ...(extra.csrfToken ? { csrfToken: extra.csrfToken } : {}),
        })
        const data = resp.data as AnyObj | undefined
        const media = data?.shortcode_media as AnyObj | undefined
        const edge = media?.edge_media_to_comment as AnyObj | undefined
        if (!edge) {
          throw new Error(
            'Instagram layout changed, selector GraphQL shortcode_media.edge_media_to_comment not found — the query hash likely rotated. Update INSTAGRAM_QUERY_HASH_COMMENTS and retry.'
          )
        }
        const edges = edge.edges as Array<{ node?: AnyObj }> | undefined
        const pageInfo = edge.page_info as { has_next_page?: unknown; end_cursor?: unknown } | undefined
        const rows = (Array.isArray(edges) ? edges : [])
          .map((e) => (e?.node ? mapCommentNode(e.node) : undefined))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
        const endCursor = typeof pageInfo?.end_cursor === 'string' ? pageInfo.end_cursor : undefined
        const hasMore = pageInfo?.has_next_page === true && Boolean(endCursor)
        const sliced = rows.slice(0, maxResults)
        const outContinuation =
          hasMore && endCursor ? encodeCont({ kind: 'comments', cursor: endCursor, extra: cont.extra }) : undefined
        return {
          ok: true as const,
          source: SHOP,
          shortcode: extra.shortcode,
          url: postUrl(extra.shortcode),
          comments: sliced,
          onThisPage: rows.length,
          hasMore,
          replies: 'out-of-scope' as const,
          ...(outContinuation ? { continuation: outContinuation } : {}),
        }
      }

      const shortcode = extractShortcode(post)
      const cacheKey = `instagram:comments:${shortcode}:${maxResults}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.comments)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      const html = await fetchHtml(postUrl(shortcode))
      const media = findShortcodeMedia(extractStateBlobs(html))
      // The login prompt is usually a closable overlay — data may still be here.
      if (!media) throw shellError(html, 'ShortcodeMedia.shortcode_media', `Comments for post ${shortcode}`)
      const loginWall = looksLikeLoginWall(html)
      const commentsDisabled = media.comments_disabled === true
      const { rows, endCursor, hasMore } = commentsFromMedia(media)
      if (!rows.length && !hasMore && !commentsDisabled) {
        // Distinguish "no comments yet" from "comments edge moved": the count
        // tells us which. Zero count with no rows is a genuine empty thread.
        const edge = media.edge_media_to_comment as AnyObj | undefined
        const count = typeof edge?.count === 'number' ? edge.count : undefined
        if (count !== undefined && count > 0) {
          throw shellError(html, 'ShortcodeMedia.edge_media_to_comment.edges', `Comments for post ${shortcode}`)
        }
      }
      const sliced = rows.slice(0, maxResults)
      const appId = extractAppId(html)
      const csrfToken = extractCsrfToken(html)
      const outContinuation =
        hasMore && endCursor
          ? encodeCont({ kind: 'comments', cursor: endCursor, extra: { shortcode, ...(appId ? { appId } : {}), ...(csrfToken ? { csrfToken } : {}) } })
          : undefined
      const notes: string[] = []
      if (loginWall) notes.push(LOGIN_WALL_DISMISSIBLE_NOTE)
      if (commentsDisabled) notes.push('Comments are disabled on this post.')
      else if (!rows.length && !hasMore) notes.push('No comments yet on this post.')
      const result = {
        source: SHOP,
        shortcode,
        url: postUrl(shortcode),
        comments: sliced,
        onThisPage: rows.length,
        hasMore,
        replies: 'out-of-scope' as const,
        ...(commentsDisabled || (!rows.length && !hasMore)
          ? { disabled: commentsDisabled as boolean }
          : {}),
        ...(notes.length ? { note: notes.join(' ') } : {}),
        ...(outContinuation ? { continuation: outContinuation } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

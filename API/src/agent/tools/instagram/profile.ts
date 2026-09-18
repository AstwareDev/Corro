import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  cacheGet,
  cacheSet,
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
  looksLikeLoginWall,
  LOGIN_WALL_DISMISSIBLE_NOTE,
  profileUrl,
  normalizeUsername,
  SITE,
  SHOP,
  TTLS,
  wallOrLayoutError,
} from './client.js'
import { mapMediaNode, mapProfile, META_FALLBACK_NOTE, profileFromMeta, timelineFromUser } from './shape.js'
import { renderProfileHeader } from './render.js'

async function loadProfile(username: string) {
  const url = profileUrl(username)
  const html = await fetchHtml(url)
  const ldBlocks = extractLdJsonBlocks(html)
  const blobs = extractStateBlobs(html)
  const ldPerson = findLdPerson(ldBlocks)
  const user = findUserObject(blobs)
  const loginWall = looksLikeLoginWall(html)
  const appId = extractAppId(html)
  const csrfToken = extractCsrfToken(html)
  if (user) {
    return { kind: 'embedded' as const, user, ldPerson, appId, csrfToken, loginWall, html }
  }
  // Degraded path: no embedded JSON (flagged network), but the
  // server-rendered Open Graph tags still carry the header facts.
  const metaProfile = profileFromMeta(extractMetaTags(html), username)
  if (metaProfile) {
    return { kind: 'meta' as const, profile: metaProfile, appId, csrfToken, loginWall, html }
  }
  throw wallOrLayoutError(html, 'ProfilePage.graphql.user')
}

export const instagramProfile = tool({
  description:
    'Public Instagram profile info — display name, bio, follower / following / post counts, avatar, ' +
    'verified and private flags, plus the most recent posts preview. ' +
    'Private profiles return private:true with no posts. ' +
    'Stories are NOT available without login and are never attempted. ' +
    'Follow up with instagram_posts for more posts, instagram_post for one post, instagram_comments for comments.',
  inputSchema: z.object({
    description: toolDescription,
    profile: z
      .string()
      .min(1)
      .max(200)
      .describe('Instagram username ("natgeo") or full profile URL ("https://www.instagram.com/natgeo/").'),
    maxPosts: z.number().int().min(1).max(30).default(12).describe('Recent posts to include in the preview.'),
  }),
  execute: async ({ profile, maxPosts }) => {
    try {
      if (typeof profile === 'string' && /\/stories?\//i.test(profile)) {
        const { storiesUnsupported } = await import('./client.js')
        return storiesUnsupported()
      }
      const username = normalizeUsername(profile)
      const cacheKey = `instagram:profile:${username.toLowerCase()}:${maxPosts}`
      const cached = cacheGet<Record<string, unknown>>(cacheKey, TTLS.profile)
      if (cached) return { ok: true as const, cached: true as const, ...cached }

      const loaded = await loadProfile(username)
      if (loaded.kind === 'meta') {
        // Degraded path: header facts from Open Graph tags. Bio comes from
        // the headless-render fallback when a local browser is available.
        const rendered = await renderProfileHeader(profileUrl(username)).catch(() => undefined)
        const prof = {
          ...loaded.profile,
          ...(rendered?.bio ? { bio: rendered.bio } : {}),
          ...(rendered?.avatar ? { avatar: rendered.avatar } : {}),
          ...(rendered?.verified ? { verified: true as const } : {}),
          ...(rendered?.followers !== undefined && loaded.profile.followers === undefined
            ? { followers: rendered.followers, followerText: String(rendered.followers) }
            : {}),
          ...(rendered?.following !== undefined && loaded.profile.following === undefined
            ? { following: rendered.following }
            : {}),
        }
        const result = {
          source: SHOP,
          site: SITE,
          profile: { ...prof, posts: [] as unknown[] },
          onThisPage: 0,
          hasMore: false,
          note: [META_FALLBACK_NOTE, ...(loaded.loginWall ? [LOGIN_WALL_DISMISSIBLE_NOTE] : [])].join(' '),
          stories: { supported: false as const, reason: 'Stories require an authenticated session; not available via this no-login service.' },
        }
        cacheSet(cacheKey, result)
        return { ok: true as const, ...result }
      }

      const { user, ldPerson, appId, csrfToken, loginWall, html } = loaded
      const prof = mapProfile(user, ldPerson)
      const wallNotes = loginWall ? [LOGIN_WALL_DISMISSIBLE_NOTE] : []

      if (prof.private) {
        const result = {
          source: SHOP,
          site: SITE,
          profile: { ...prof, posts: [] as unknown[] },
          onThisPage: 0,
          hasMore: false,
          note: [`@${prof.username} is private — follower counts and bio may be visible but posts, reels and comments need an approved follower session (out of scope for this no-login service).`, ...wallNotes].join(' '),
        }
        cacheSet(cacheKey, result)
        return { ok: true as const, ...result }
      }

      const { nodes, endCursor, hasMore } = timelineFromUser(user)
      if (!nodes.length && (prof.postCount ?? 0) > 0) {
        throw wallOrLayoutError(html, 'ProfilePage.edge_owner_to_timeline_media.edges')
      }
      const posts = nodes
        .map((n) => {
          try {
            return mapMediaNode(n)
          } catch {
            return undefined
          }
        })
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .slice(0, maxPosts)

      const userId = typeof user.id === 'string' ? user.id : undefined
      const continuation =
        hasMore && endCursor
          ? encodeCont({ kind: 'posts', cursor: endCursor, extra: { username: prof.username, ...(userId ? { userId } : {}), ...(appId ? { appId } : {}), ...(csrfToken ? { csrfToken } : {}) } })
          : undefined

      const notes = [...wallNotes]
      if (!hasMore && (prof.postCount ?? 0) > posts.length) {
        notes.push(`Showing ${posts.length} embedded posts; further pagination needs Instagram GraphQL, which currently requires login from this IP.`)
      }
      const result = {
        source: SHOP,
        site: SITE,
        profile: { ...prof, posts },
        onThisPage: posts.length,
        hasMore,
        ...(continuation ? { continuation } : {}),
        stories: { supported: false as const, reason: 'Stories require an authenticated session; not available via this no-login service.' },
        ...(notes.length ? { note: notes.join(' ') } : {}),
      }
      cacheSet(cacheKey, result)
      return { ok: true as const, ...result }
    } catch (err) {
      return failure(err)
    }
  },
})

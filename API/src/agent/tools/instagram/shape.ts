import type { AnyObj, OgMeta } from './client.js'
import { parseCountText, parseExactCount, postUrl, profileUrl, reelUrl } from './client.js'

export type IgMediaType = 'image' | 'video' | 'carousel' | 'reel'

export interface IgPostRow {
  id: string
  shortcode: string
  caption?: string
  type: IgMediaType
  likes?: string
  likeCount?: number
  comments?: string
  commentCount?: number
  timestamp?: string
  takenAt?: number
  url: string
  mediaUrls: string[]
  playCount?: number
  ownerUsername?: string
}

export interface IgProfile {
  username: string
  displayName?: string
  bio?: string
  followers?: number
  followerText?: string
  following?: number
  postCount?: number
  avatar?: string
  verified: boolean
  private: boolean
  url: string
}

export interface IgCommentRow {
  username: string
  text: string
  likes?: string
  likeCount?: number
  timestamp?: string
  takenAt?: number
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

function captionOf(node: AnyObj): string | undefined {
  const edge = node.edge_media_to_caption as AnyObj | undefined
  const edges = edge?.edges as Array<{ node?: { text?: unknown } }> | undefined
  const text = edges?.[0]?.node?.text
  if (typeof text === 'string' && text.trim()) return text
  const alt = node.caption as AnyObj | { text?: unknown } | string | undefined
  if (typeof alt === 'string' && alt.trim()) return alt
  if (alt && typeof alt === 'object' && typeof (alt as AnyObj).text === 'string') {
    const t = String((alt as AnyObj).text).trim()
    return t || undefined
  }
  return str(node.accessibility_caption as unknown) ?? undefined
}

function likeCountOf(node: AnyObj): number | undefined {
  const preview = node.edge_media_preview_like as AnyObj | undefined
  const liked = node.edge_liked_by as AnyObj | undefined
  return (
    parseExactCount(preview?.count) ??
    parseExactCount(liked?.count) ??
    parseExactCount(node.like_count) ??
    parseExactCount(node.likes)
  )
}

function commentCountOf(node: AnyObj): number | undefined {
  const edge = node.edge_media_to_comment as AnyObj | undefined
  return parseExactCount(edge?.count) ?? parseExactCount(node.comment_count) ?? parseExactCount(node.comments)
}

function takenAtOf(node: AnyObj): number | undefined {
  const t = node.taken_at_timestamp ?? node.taken_at ?? node.created_at
  return typeof t === 'number' && Number.isFinite(t) ? t : undefined
}

export function mediaTypeOf(node: AnyObj, shortcode?: string): IgMediaType {
  const typename = node.__typename as string | undefined
  const mediaType = node.media_type as number | undefined
  const productType = node.product_type as string | undefined
  const isVideo = node.is_video === true || mediaType === 2
  const isReel =
    productType === 'CLIPS' ||
    typename === 'GraphStory' ||
    (typeof shortcode === 'string' && node.product_type === 'CLIPS')
  if (typename === 'GraphSidecar' || mediaType === 8) return 'carousel'
  if (isReel) return 'reel'
  if (typename === 'GraphVideo' || isVideo) return 'video'
  return 'image'
}

export function mediaUrlsOf(node: AnyObj): string[] {
  const urls: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.startsWith('http') && !urls.includes(v)) urls.push(v)
  }
  // Carousel children first (they are the actual media).
  const sidecar = node.edge_sidecar_to_children as AnyObj | undefined
  const childEdges = sidecar?.edges as Array<{ node?: AnyObj }> | undefined
  if (Array.isArray(childEdges)) {
    for (const e of childEdges) {
      const child = e?.node
      if (!child) continue
      push(child.video_url)
      push(child.display_url)
      push(child.thumbnail_src)
    }
  }
  const carousel = node.carousel_media as Array<AnyObj> | undefined
  if (Array.isArray(carousel)) {
    for (const c of carousel) {
      const versions = (c.image_versions2 as AnyObj | undefined)?.candidates as Array<{ url?: unknown }> | undefined
      versions?.forEach((v) => push(v.url))
      push(c.video_url)
    }
  }
  push(node.video_url)
  push(node.display_url)
  push(node.thumbnail_src)
  return urls.slice(0, 10)
}

export function mapMediaNode(node: AnyObj): IgPostRow | undefined {
  const shortcode = str(node.shortcode)
  const id = str(node.id as unknown) ?? (shortcode ? `sc_${shortcode}` : undefined)
  if (!shortcode || !id) return undefined
  const type = mediaTypeOf(node, shortcode)
  const likeCount = likeCountOf(node)
  const commentCount = commentCountOf(node)
  const takenAt = takenAtOf(node)
  const caption = captionOf(node)
  const mediaUrls = mediaUrlsOf(node)
  const playCount = parseExactCount(node.video_view_count ?? node.play_count ?? node.view_count)
  const owner = node.owner as AnyObj | undefined
  const ownerUsername = str(owner?.username)
  return {
    id,
    shortcode,
    ...(caption ? { caption: caption.length > 2000 ? `${caption.slice(0, 2000).trimEnd()}…` : caption } : {}),
    type,
    ...(likeCount !== undefined ? { likes: String(likeCount), likeCount } : {}),
    ...(commentCount !== undefined ? { comments: String(commentCount), commentCount } : {}),
    ...(takenAt !== undefined
      ? { timestamp: new Date(takenAt * 1000).toISOString(), takenAt }
      : {}),
    url: type === 'reel' ? reelUrl(shortcode) : postUrl(shortcode),
    mediaUrls,
    ...(type === 'reel' && playCount !== undefined ? { playCount } : {}),
    ...(ownerUsername ? { ownerUsername } : {}),
  }
}

export function timelineFromUser(user: AnyObj): { nodes: AnyObj[]; endCursor?: string; hasMore: boolean } {
  const timeline = user.edge_owner_to_timeline_media as AnyObj | undefined
  const edges = timeline?.edges as Array<{ node?: AnyObj }> | undefined
  const pageInfo = timeline?.page_info as { has_next_page?: unknown; end_cursor?: unknown } | undefined
  if (!Array.isArray(edges)) return { nodes: [], hasMore: false }
  const nodes = edges.map((e) => e?.node).filter((n): n is AnyObj => Boolean(n && typeof n === 'object'))
  const endCursor = typeof pageInfo?.end_cursor === 'string' ? pageInfo.end_cursor : undefined
  const hasMore = pageInfo?.has_next_page === true && Boolean(endCursor)
  return { nodes, ...(endCursor ? { endCursor } : {}), hasMore }
}

export function mapProfile(user: AnyObj, ldPerson?: AnyObj): IgProfile {
  const username = String(user.username ?? ldPerson?.alternateName ?? 'unknown')
  const followerCount =
    parseExactCount((user.edge_followed_by as AnyObj | undefined)?.count) ??
    parseExactCount(user.follower_count) ??
    parseCountText(str((ldPerson?.interactionStatistic as AnyObj | undefined)?.userInteractionCount as unknown))
  const followingCount =
    parseExactCount((user.edge_follow as AnyObj | undefined)?.count) ??
    parseExactCount(user.following_count)
  const postCount =
    parseExactCount((user.edge_owner_to_timeline_media as AnyObj | undefined)?.count) ??
    parseExactCount(user.media_count)
  return {
    username,
    ...(str(user.full_name) ?? str(ldPerson?.name) ? { displayName: (str(user.full_name) ?? str(ldPerson?.name)) as string } : {}),
    ...(str(user.biography) ?? str(ldPerson?.description) ? { bio: (str(user.biography) ?? str(ldPerson?.description)) as string } : {}),
    ...(followerCount !== undefined
      ? { followers: followerCount, followerText: String(followerCount) }
      : {}),
    ...(followingCount !== undefined ? { following: followingCount } : {}),
    ...(postCount !== undefined ? { postCount } : {}),
    ...(str(user.profile_pic_url_hd) ?? str(user.profile_pic_url) ?? str(ldPerson?.image)
      ? { avatar: (str(user.profile_pic_url_hd) ?? str(user.profile_pic_url) ?? str(ldPerson?.image)) as string }
      : {}),
    verified: user.is_verified === true,
    private: user.is_private === true,
    url: profileUrl(username),
  }
}

export const META_FALLBACK_NOTE =
  'Limited view: Instagram served no embedded data to this network, so counts and avatar come from the page metadata. ' +
  'Bio, verified flag and the post grid are unavailable on this path — the grid needs a session Instagram trusts.'

/**
 * Degraded profile from Open Graph meta tags.
 * og:title: "{Display} (@user) • Instagram photos and videos"
 * og:description: "3,403 Followers, 0 Following, 238 Posts - ..."
 * Returns undefined when the tags are absent (e.g. hard login page).
 */
export function profileFromMeta(meta: OgMeta, fallbackUsername: string): IgProfile | undefined {
  const title = meta.title ?? ''
  const desc = meta.description ?? ''
  if (!title && !desc) return undefined
  // A login-page title means no profile data, not a profile.
  if (/^\s*login\b/i.test(title)) return undefined
  let displayName: string | undefined
  let username = fallbackUsername
  const titleMatch = /^(.*?)\s*\(@([A-Za-z0-9._]{1,30})\)\s*(?:•|-)/.exec(title)
  if (titleMatch) {
    if (titleMatch[1].trim()) displayName = titleMatch[1].trim()
    username = titleMatch[2]
  }
  const num = (label: string): number | undefined => {
    const m = new RegExp(`([\\d,.]+)\\s*${label}`, 'i').exec(desc)
    return m ? parseCountText(m[1]) : undefined
  }
  const followers = num('Followers?')
  const following = num('Following')
  const postCount = num('Posts?')
  if (!displayName && followers === undefined && following === undefined && postCount === undefined && !meta.image) {
    return undefined
  }
  return {
    username,
    ...(displayName ? { displayName } : {}),
    ...(followers !== undefined ? { followers, followerText: String(followers) } : {}),
    ...(following !== undefined ? { following } : {}),
    ...(postCount !== undefined ? { postCount } : {}),
    ...(meta.image ? { avatar: meta.image } : {}),
    verified: false,
    private: false,
    url: meta.url && meta.url.includes('instagram.com') ? meta.url : profileUrl(username),
  }
}

export function mapCommentNode(node: AnyObj): IgCommentRow | undefined {
  const text = str(node.text)
  if (!text) return undefined
  const owner = node.owner as AnyObj | undefined
  const username = str(owner?.username) ?? str(node.username) ?? 'unknown'
  const likeEdge = node.edge_liked_by as AnyObj | undefined
  const likeCount = parseExactCount(likeEdge?.count ?? node.like_count ?? node.likes)
  const takenAt = takenAtOf(node)
  return {
    username,
    text,
    ...(likeCount !== undefined ? { likes: String(likeCount), likeCount } : {}),
    ...(takenAt !== undefined ? { timestamp: new Date(takenAt * 1000).toISOString(), takenAt } : {}),
  }
}

export function commentsFromMedia(media: AnyObj): { rows: IgCommentRow[]; endCursor?: string; hasMore: boolean } {
  const edge = media.edge_media_to_comment as AnyObj | undefined
  const edges = edge?.edges as Array<{ node?: AnyObj }> | undefined
  const pageInfo = edge?.page_info as { has_next_page?: unknown; end_cursor?: unknown } | undefined
  const rows: IgCommentRow[] = []
  if (Array.isArray(edges)) {
    for (const e of edges) {
      if (!e?.node) continue
      const row = mapCommentNode(e.node)
      if (row) rows.push(row)
    }
  }
  const endCursor = typeof pageInfo?.end_cursor === 'string' ? pageInfo.end_cursor : undefined
  const hasMore = pageInfo?.has_next_page === true && Boolean(endCursor)
  return { rows, ...(endCursor ? { endCursor } : {}), hasMore }
}

// Re-export the AnyObj type for tool modules.
export type { AnyObj }

import { Router } from 'express'
import { z } from 'zod'
import { instagramComments } from '../agent/tools/instagram/comments.js'
import { instagramPost } from '../agent/tools/instagram/post.js'
import { instagramPosts } from '../agent/tools/instagram/posts.js'
import { instagramProfile } from '../agent/tools/instagram/profile.js'
import { STORIES_UNSUPPORTED } from '../agent/tools/instagram/client.js'
import { route } from '../http/respond.js'

/**
 * Local Instagram Scraper Service (Express).
 *
 * Same role as the YouTube toolset: the agent never reads instagram.com
 * directly (client-side rendered, almost no visible text in initial HTML).
 * It calls these endpoints / the matching agent tools and gets flat,
 * well-typed JSON back:
 *
 *   { "ok": true, "profile": { "username": "...", "followers": 123,
 *     "private": false, "posts": [...] } }
 *   { "ok": false, "error": "..." }
 *
 * Public, no-login only. Stories are intentionally unsupported (see below).
 */
export const instagramRoutes = Router()

const REST_DESCRIPTION = 'Serving Instagram REST request' as const

type ToolLike = {
  inputSchema: z.ZodType
  execute: (input: never, opts: unknown) => Promise<unknown>
}

async function runTool(tool: ToolLike, input: Record<string, unknown>) {
  const parsed = tool.inputSchema.safeParse({ description: REST_DESCRIPTION, ...input })
  if (!parsed.success) {
    return { status: 400 as const, body: { ok: false as const, error: 'Invalid parameters', issues: parsed.error.issues } }
  }
  const output = (await tool.execute(parsed.data as never, { toolCallId: 'rest', messages: [] })) as
    | { ok: boolean }
    | Record<string, unknown>
  const status = (output as { ok?: unknown }).ok === false ? 502 : 200
  return { status: status as 200 | 502, body: output }
}

function num(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function str(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw : undefined
}

instagramRoutes.get(
  '/api/instagram/profile',
  route(async (req, res) => {
    const profile = str(req.query.profile ?? req.query.username)
    if (!profile) {
      res.status(400).json({ ok: false, error: 'Give ?profile=<username or profile URL>.' })
      return
    }
    const { status, body } = await runTool(instagramProfile as unknown as ToolLike, {
      profile,
      maxPosts: num(req.query.maxPosts ?? req.query.maxResults, 12),
    })
    res.status(status).json(body)
  })
)

instagramRoutes.get(
  '/api/instagram/posts',
  route(async (req, res) => {
    const profile = str(req.query.profile ?? req.query.username)
    if (!profile) {
      res.status(400).json({ ok: false, error: 'Give ?profile=<username or profile URL>.' })
      return
    }
    const kind = req.query.kind === 'reels' || req.query.kind === 'posts' ? req.query.kind : 'all'
    const { status, body } = await runTool(instagramPosts as unknown as ToolLike, {
      profile,
      maxResults: num(req.query.maxResults ?? req.query.maxPosts, 12),
      kind,
      ...(str(req.query.continuation) ? { continuation: str(req.query.continuation) } : {}),
    })
    res.status(status).json(body)
  })
)

/** Convenience alias: same shape as /posts with kind=reels (type:reel + playCount). */
instagramRoutes.get(
  '/api/instagram/reels',
  route(async (req, res) => {
    const profile = str(req.query.profile ?? req.query.username)
    if (!profile) {
      res.status(400).json({ ok: false, error: 'Give ?profile=<username or profile URL>.' })
      return
    }
    const { status, body } = await runTool(instagramPosts as unknown as ToolLike, {
      profile,
      maxResults: num(req.query.maxResults ?? req.query.maxPosts, 12),
      kind: 'reels',
      ...(str(req.query.continuation) ? { continuation: str(req.query.continuation) } : {}),
    })
    res.status(status).json(body)
  })
)

instagramRoutes.get(
  '/api/instagram/post',
  route(async (req, res) => {
    const post = str(req.query.post ?? req.query.shortcode ?? req.query.url)
    if (!post) {
      res.status(400).json({ ok: false, error: 'Give ?post=<shortcode or /p/ /reel/ URL>.' })
      return
    }
    const { status, body } = await runTool(instagramPost as unknown as ToolLike, {
      post,
      maxChars: num(req.query.maxChars, 2000),
    })
    res.status(status).json(body)
  })
)

instagramRoutes.get(
  '/api/instagram/comments',
  route(async (req, res) => {
    const post = str(req.query.post ?? req.query.shortcode ?? req.query.url)
    if (!post) {
      res.status(400).json({ ok: false, error: 'Give ?post=<shortcode or /p/ /reel/ URL>.' })
      return
    }
    const { status, body } = await runTool(instagramComments as unknown as ToolLike, {
      post,
      maxResults: num(req.query.maxResults, 20),
      ...(str(req.query.continuation) ? { continuation: str(req.query.continuation) } : {}),
    })
    res.status(status).json(body)
  })
)

// Stories: flagged up front — public no-login scraping CANNOT access them.
function storiesHandler(_req: import('express').Request, res: import('express').Response) {
  res.status(451).json({ ok: false, supported: false, error: STORIES_UNSUPPORTED })
}

instagramRoutes.get('/api/instagram/stories', storiesHandler)
instagramRoutes.post('/api/instagram/stories', storiesHandler)

instagramRoutes.get('/api/instagram', (_req, res) => {
  res.json({
    name: 'Local Instagram Scraper Service',
    auth: 'public, no-login only',
    contract: '{ ok:true, profile|posts|… } on success, { ok:false, error } on failure',
    stories: { supported: false, reason: STORIES_UNSUPPORTED },
    endpoints: {
      'GET /api/instagram/profile?profile=<username|url>&maxPosts=12': 'profile info + recent posts preview',
      'GET /api/instagram/posts?profile=<username|url>&kind=all|posts|reels&maxResults=12&continuation=': 'post grid with cursor pagination',
      'GET /api/instagram/reels?profile=<username|url>&maxResults=12&continuation=': 'reels only (type:reel + playCount)',
      'GET /api/instagram/post?post=<shortcode|url>&maxChars=2000': 'one post / reel detail',
      'GET /api/instagram/comments?post=<shortcode|url>&maxResults=20&continuation=': 'top-level comments with cursor pagination',
      'GET /api/instagram/stories': 'always 451 — requires authenticated session (out of scope)',
      'POST /tools/instagram_profile, instagram_posts, instagram_post, instagram_comments': 'same data as agent tools',
    },
    limits: 'Polite rate limiting + retry-with-backoff built in. Expect HTTP 502 with a "layout changed" error when Instagram renames its embedded-data blobs — that is a maintenance signal, not an empty result.',
  })
})

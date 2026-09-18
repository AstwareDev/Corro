import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  decodeCont,
  decodeEntities,
  encodeCont,
  extractLdJsonBlocks,
  extractMetaTags,
  extractShortcode,
  loginWallError,
  looksLikeLoginWall,
  LOGIN_WALL_DISMISSIBLE_NOTE,
  normalizeUsername,
  parseCountText,
  shellError,
  STORIES_UNSUPPORTED,
  storiesUnsupported,
  wallOrLayoutError,
} from './client.js'
import { commentsFromMedia, mapMediaNode, mapProfile, mediaTypeOf, profileFromMeta } from './shape.js'
import { parseHeaderFacts } from './render.js'

describe('normalizeUsername', () => {
  it('accepts bare usernames and @handles', () => {
    assert.equal(normalizeUsername('natgeo'), 'natgeo')
    assert.equal(normalizeUsername('@natgeo'), 'natgeo')
    assert.equal(normalizeUsername('  nat.geo_99  '), 'nat.geo_99')
  })
  it('strips profile URLs', () => {
    assert.equal(normalizeUsername('https://www.instagram.com/natgeo/'), 'natgeo')
    assert.equal(normalizeUsername('https://instagram.com/natgeo?utm_source=x'), 'natgeo')
  })
  it('rejects garbage instead of guessing', () => {
    assert.throws(() => normalizeUsername(''), /username/i)
    assert.throws(() => normalizeUsername('not a name!!'), /username/i)
  })
})

describe('extractShortcode', () => {
  it('accepts bare shortcodes and /p/ /reel/ URLs', () => {
    assert.equal(extractShortcode('C8abcDEF12'), 'C8abcDEF12')
    assert.equal(extractShortcode('https://www.instagram.com/p/C8abcDEF12/'), 'C8abcDEF12')
    assert.equal(extractShortcode('https://www.instagram.com/reel/C8abcDEF12/?x=1'), 'C8abcDEF12')
  })
  it('rejects garbage instead of guessing', () => {
    assert.throws(() => extractShortcode(''), /shortcode/i)
    assert.throws(() => extractShortcode('https://example.com/nope'), /shortcode/i)
  })
})

describe('parseCountText', () => {
  it('parses K/M/B suffixes', () => {
    assert.equal(parseCountText('12.3K followers'), 12300)
    assert.equal(parseCountText('1.2M'), 1200000)
    assert.equal(parseCountText('1,234'), 1234)
  })
  it('returns undefined for junk', () => {
    assert.equal(parseCountText(undefined), undefined)
    assert.equal(parseCountText('no digits here!'), undefined)
  })
})

describe('extractLdJsonBlocks', () => {
  it('pulls embedded JSON and skips malformed blocks', () => {
    const html = [
      '<script type="application/ld+json">{"@type":"Person","name":"Nat Geo"}</script>',
      '<script type="application/ld+json">not json {{{</script>',
      '<script type="application/json">{"ignored":true}</script>',
    ].join('\n')
    const blocks = extractLdJsonBlocks(html)
    assert.equal(blocks.length, 1)
    assert.equal((blocks[0] as { name?: string }).name, 'Nat Geo')
  })
})

describe('media mapping', () => {
  it('maps an image node to the flat post row', () => {
    const row = mapMediaNode({
      id: '1',
      shortcode: 'ABCDE12345',
      __typename: 'GraphImage',
      display_url: 'https://cdn/img.jpg',
      edge_media_to_caption: { edges: [{ node: { text: 'hello' } }] },
      edge_media_preview_like: { count: 1200 },
      edge_media_to_comment: { count: 34 },
      taken_at_timestamp: 1700000000,
      owner: { username: 'natgeo' },
    })
    assert.ok(row)
    assert.equal(row.type, 'image')
    assert.equal(row.caption, 'hello')
    assert.equal(row.likeCount, 1200)
    assert.equal(row.commentCount, 34)
    assert.equal(row.url, 'https://www.instagram.com/p/ABCDE12345/')
    assert.deepEqual(row.mediaUrls, ['https://cdn/img.jpg'])
    assert.equal(row.timestamp, new Date(1700000000 * 1000).toISOString())
  })
  it('flags reels and keeps playCount; carousels collect children', () => {
    const reel = mapMediaNode({
      id: '2',
      shortcode: 'REEL123456',
      __typename: 'GraphVideo',
      product_type: 'CLIPS',
      display_url: 'https://cdn/cover.jpg',
      video_url: 'https://cdn/clip.mp4',
      video_view_count: 5000,
      edge_media_preview_like: { count: 10 },
      edge_media_to_comment: { count: 1 },
      owner: { username: 'natgeo' },
    })
    assert.ok(reel)
    assert.equal(reel.type, 'reel')
    assert.equal(reel.playCount, 5000)
    assert.equal(reel.url, 'https://www.instagram.com/reel/REEL123456/')

    const carousel = mapMediaNode({
      id: '3',
      shortcode: 'CAR1234567',
      __typename: 'GraphSidecar',
      edge_sidecar_to_children: {
        edges: [{ node: { display_url: 'https://cdn/a.jpg' } }, { node: { display_url: 'https://cdn/b.jpg' } }],
      },
      edge_media_preview_like: { count: 5 },
      edge_media_to_comment: { count: 0 },
    })
    assert.ok(carousel)
    assert.equal(carousel.type, 'carousel')
    assert.deepEqual(carousel.mediaUrls, ['https://cdn/a.jpg', 'https://cdn/b.jpg'])
  })
  it('mediaTypeOf prefers carousel over video', () => {
    assert.equal(mediaTypeOf({ __typename: 'GraphSidecar' }), 'carousel')
    assert.equal(mediaTypeOf({ __typename: 'GraphVideo' }), 'video')
    assert.equal(mediaTypeOf({ __typename: 'GraphVideo', product_type: 'CLIPS' }), 'reel')
    assert.equal(mediaTypeOf({ media_type: 8 }), 'carousel')
  })
  it('returns undefined when the node has no shortcode', () => {
    assert.equal(mapMediaNode({ id: 'x' }), undefined)
  })
})

describe('mapProfile', () => {
  it('maps counts, avatar and flags; private stops downstream use', () => {
    const prof = mapProfile({
      username: 'natgeo',
      full_name: 'National Geographic',
      biography: 'bio here',
      edge_followed_by: { count: 780000000 },
      edge_follow: { count: 312 },
      edge_owner_to_timeline_media: { count: 22000, edges: [] },
      profile_pic_url_hd: 'https://cdn/avatar.jpg',
      is_verified: true,
      is_private: false,
    })
    assert.equal(prof.username, 'natgeo')
    assert.equal(prof.displayName, 'National Geographic')
    assert.equal(prof.followers, 780000000)
    assert.equal(prof.following, 312)
    assert.equal(prof.postCount, 22000)
    assert.equal(prof.verified, true)
    assert.equal(prof.private, false)
    assert.equal(prof.url, 'https://www.instagram.com/natgeo/')

    const priv = mapProfile({ username: 'locked', is_private: true, is_verified: false })
    assert.equal(priv.private, true)
  })
})

describe('comments', () => {
  it('maps rows and surfaces end_cursor pagination', () => {
    const { rows, endCursor, hasMore } = commentsFromMedia({
      edge_media_to_comment: {
        count: 3,
        page_info: { has_next_page: true, end_cursor: 'CURSOR123' },
        edges: [
          { node: { text: 'great shot', owner: { username: 'fan1' }, edge_liked_by: { count: 12 }, taken_at_timestamp: 1700000001 } },
          { node: { text: '', owner: { username: 'ghost' } } },
        ],
      },
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].username, 'fan1')
    assert.equal(rows[0].likeCount, 12)
    assert.equal(endCursor, 'CURSOR123')
    assert.equal(hasMore, true)
  })
})

describe('continuations', () => {
  it('round-trips stateless tokens and rejects foreign ones', () => {
    const token = encodeCont({ kind: 'posts', cursor: 'ENDCURSOR', extra: { username: 'natgeo', userId: '123' } })
    assert.match(token, /^ig1_/)
    const back = decodeCont(token)
    assert.equal(back?.kind, 'posts')
    assert.equal(back?.cursor, 'ENDCURSOR')
    assert.equal((back?.extra as { username?: string })?.username, 'natgeo')
    assert.equal(decodeCont('yt1_invalid'), undefined)
    assert.equal(decodeCont('ig1_!!!not-base64!!!'), undefined)
  })
})

describe('stories limitation', () => {
  it('is flagged up front with a no-login explanation', () => {
    const out = storiesUnsupported()
    assert.equal(out.ok, false)
    assert.equal(out.supported, false)
    assert.match(out.error, /authenticated/i)
    assert.match(STORIES_UNSUPPORTED, /24h/)
  })
})

describe('login wall handling', () => {
  it('detects the prompt but treats it as dismissible, not fatal', () => {
    assert.equal(looksLikeLoginWall('<title>Login • Instagram</title>'), true)
    assert.equal(looksLikeLoginWall('{"require_login":true}'), true)
    assert.equal(looksLikeLoginWall('<html><body>public profile content</body></html>'), false)
    assert.match(LOGIN_WALL_DISMISSIBLE_NOTE, /dismissible/i)
  })
  it('fails with a retryable gate error only when data is absent behind the prompt', () => {
    const gated = wallOrLayoutError('<title>Login • Instagram</title>', 'ProfilePage.graphql.user')
    assert.match(gated.message, /login gate/i)
    assert.match(gated.message, /retry/i)
    assert.equal(gated.status, 403)
    assert.equal(loginWallError().status, 403)
  })
  it('fails with a layout-changed error when no prompt is present', () => {
    const changed = wallOrLayoutError('<html><body>new markup</body></html>', 'ProfilePage.graphql.user')
    assert.match(changed.message, /layout changed/i)
    assert.match(changed.message, /ProfilePage\.graphql\.user/)
  })
  it('shellError separates gate, moved-blob and missing-post states', () => {
    assert.match(shellError('<title>Login • Instagram</title>', 'S', 'Post X').message, /login gate/i)
    assert.match(
      shellError('<meta property="og:title" content="Someone (@u) • Instagram photos" />', 'S', 'Post X').message,
      /layout changed/i
    )
    assert.match(
      shellError('<html><head><title>Instagram</title></head></html>', 'S', 'Post X').message,
      /may be private, deleted/
    )
  })
})

describe('open-graph fallback', () => {
  const PAGE = [
    '<meta property="og:title" content="&#x531;&#x577;&#x57f;&#x561;&#x580;&#x561;&#x56f; &#x56f;&#x561;&#x569; (&#064;ashtarakkat) &#x2022; Instagram photos and videos" />',
    '<meta content="3,403 Followers, 0 Following, 238 Posts - See Instagram photos" property="og:description" />',
    '<meta property="og:image" content="https://cdn/avatar.jpg" />',
    '<meta property="og:url" content="https://www.instagram.com/ashtarakkat/" />',
  ].join('\n')

  it('decodes entities and reads tags in either attribute order', () => {
    assert.equal(decodeEntities('&#064;'), '@')
    assert.equal(decodeEntities('&#x2022;'), '•')
    assert.equal(decodeEntities('a &amp; b'), 'a & b')
    const meta = extractMetaTags(PAGE)
    assert.ok(meta.title?.includes('(@ashtarakkat)'))
    assert.ok(meta.title?.includes('• Instagram photos and videos'))
    assert.ok(meta.description?.startsWith('3,403 Followers'))
    assert.equal(meta.image, 'https://cdn/avatar.jpg')
    assert.equal(meta.url, 'https://www.instagram.com/ashtarakkat/')
  })
  it('maps the tags to a degraded but exact profile', () => {
    const prof = profileFromMeta(extractMetaTags(PAGE), 'ashtarakkat')
    assert.ok(prof)
    assert.equal(prof.username, 'ashtarakkat')
    assert.equal(prof.displayName, 'Աշտարակ կաթ')
    assert.equal(prof.followers, 3403)
    assert.equal(prof.following, 0)
    assert.equal(prof.postCount, 238)
    assert.equal(prof.avatar, 'https://cdn/avatar.jpg')
    assert.equal(prof.bio, undefined)
  })
  it('refuses login pages and empty tag sets instead of inventing a profile', () => {
    assert.equal(profileFromMeta({ title: 'Login • Instagram' }, 'x'), undefined)
    assert.equal(profileFromMeta({}, 'x'), undefined)
  })
})

describe('rendered header parsing', () => {
  const HEADER = [
    'ashtarakkat',
    '3,402 followers',
    '0 following',
    'Աշտարակ կաթ',
    '💙Առողջ սնունդ,առողջ սերունդ 💙',
    'Շուկայում արդեն 33 տարի',
    'ashtarakkat.am and 2 more',
    'Բաղադրատոմսեր',
  ].join('\n')

  it('pulls bio and counts from the rendered header text', () => {
    const out = parseHeaderFacts({ username: 'ashtarakkat', headerText: HEADER, verified: false })
    assert.equal(out.followers, 3402)
    assert.equal(out.following, 0)
    assert.ok(out.bio?.includes('33 տարի'))
    assert.ok(!(out.bio ?? '').includes('ashtarakkat.am'))
    assert.ok(!(out.bio ?? '').includes('Բաղադրատոմսեր'))
  })
})

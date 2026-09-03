import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { tavily } from './client.js'
import { allocate, cleanUrl, dedupe, failure } from './compact.js'

interface RawCrawl {
  base_url?: string
  results?: Array<{ url?: string; raw_content?: string }>
}

export const webCrawl = tool({
  description:
    'Follow links from one page and read what they contain. Use this when the evidence is spread across ' +
    'a section of a site (docs, a changelog, a filings index) rather than on one page. ' +
    '"instructions" steers which links are worth following. For a single page use web_extract instead.',
  inputSchema: z.object({
    description: toolDescription,
    url: z.string().url().describe('Page to start from.'),
    instructions: z.string().max(300).optional().describe('What to look for, e.g. "pages about pricing changes".'),
    limit: z.number().int().min(1).max(30).default(10).describe('Pages to read.'),
    maxDepth: z.number().int().min(1).max(3).default(1).describe('Link hops from the start page.'),
    selectPaths: z.array(z.string()).max(10).optional().describe('Only paths matching these regexes, e.g. "/blog/.*".'),
    excludePaths: z.array(z.string()).max(10).optional().describe('Skip paths matching these regexes.'),
    allowExternal: z.boolean().default(false).describe('Follow links off this domain.'),
    maxChars: z.number().int().min(500).max(60000).default(12000).describe('Total text budget across pages.'),
  }),
  execute: async ({ url, instructions, limit, maxDepth, selectPaths, excludePaths, allowExternal, maxChars }) => {
    try {
      const raw = await tavily<RawCrawl>(
        '/crawl',
        {
          url,
          instructions,
          limit,
          max_depth: maxDepth,
          select_paths: selectPaths,
          exclude_paths: excludePaths,
          allow_external: allowExternal,
          extract_depth: 'basic',
          format: 'markdown',
          include_images: false,
        },
        { timeoutMs: 120_000 }
      )

      const hits = dedupe((raw.results ?? []).filter((r) => r.url), (r) => cleanUrl(r.url as string)).slice(0, limit)
      const texts = allocate(
        hits.map((r) => r.raw_content),
        maxChars
      )

      return {
        ok: true as const,
        startUrl: cleanUrl(raw.base_url ?? url),
        pages: hits.map((r, i) => ({ url: cleanUrl(r.url as string), content: texts[i] })),
      }
    } catch (err) {
      return failure(err)
    }
  },
})

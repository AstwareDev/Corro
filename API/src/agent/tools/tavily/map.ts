import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { tavily } from './client.js'
import { cleanUrl, dedupe, failure, host } from './compact.js'

interface RawMap {
  base_url?: string
  results?: string[]
}

export const webMap = tool({
  description:
    'List the URLs on a site without reading any of them. Cheap way to find out whether a site has the page ' +
    'you need and what it is called, before spending a web_extract or web_crawl on it.',
  inputSchema: z.object({
    description: toolDescription,
    url: z.string().url().describe('Site or section to map.'),
    instructions: z.string().max(300).optional().describe('What kind of pages to look for.'),
    limit: z.number().int().min(1).max(200).default(50).describe('URLs to return.'),
    maxDepth: z.number().int().min(1).max(3).default(1).describe('Link hops from the start page.'),
    selectPaths: z.array(z.string()).max(10).optional().describe('Only paths matching these regexes, e.g. "/docs/.*".'),
    excludePaths: z.array(z.string()).max(10).optional().describe('Skip paths matching these regexes.'),
    allowExternal: z.boolean().default(false).describe('Follow links off this domain.'),
  }),
  execute: async ({ url, instructions, limit, maxDepth, selectPaths, excludePaths, allowExternal }) => {
    try {
      const raw = await tavily<RawMap>(
        '/map',
        {
          url,
          instructions,
          limit,
          max_depth: maxDepth,
          select_paths: selectPaths,
          exclude_paths: excludePaths,
          allow_external: allowExternal,
        },
        { timeoutMs: 90_000 }
      )

      const urls = dedupe((raw.results ?? []).map(cleanUrl).filter(Boolean), (u) => u).slice(0, limit)

      return {
        ok: true as const,
        site: host(raw.base_url ?? url) || cleanUrl(url),
        urls,
        count: urls.length,
      }
    } catch (err) {
      return failure(err)
    }
  },
})

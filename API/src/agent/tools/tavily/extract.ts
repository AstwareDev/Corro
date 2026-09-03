import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { tavily } from './client.js'
import { allocate, cleanUrl, dedupe, failure } from './compact.js'

interface RawExtract {
  results?: Array<{ url?: string; raw_content?: string }>
  failed_results?: Array<{ url?: string; error?: string }>
}

export const webExtract = tool({
  description:
    'Read the full text of specific pages. Use this on URLs worth quoting or checking a figure in, ' +
    'after a search snippet suggests the page has what you need. Batch the URLs into one call.',
  inputSchema: z.object({
    description: toolDescription,
    urls: z.array(z.string().url()).min(1).max(20).describe('Page URLs to read.'),
    depth: z.enum(['basic', 'advanced']).default('basic').describe('"advanced" also gets tables and embedded text.'),
    maxChars: z.number().int().min(500).max(60000).default(12000).describe('Total text budget across all pages.'),
  }),
  execute: async ({ urls, depth, maxChars }) => {
    try {
      const wanted = dedupe(urls.map(cleanUrl), (u) => u)
      const raw = await tavily<RawExtract>(
        '/extract',
        {
          urls: wanted,
          extract_depth: depth,
          format: 'markdown',
          include_images: false,
        },
        { timeoutMs: 60_000 }
      )

      const hits = (raw.results ?? []).filter((r) => r.url)
      const texts = allocate(
        hits.map((r) => r.raw_content),
        maxChars
      )

      const pages = hits.map((r, i) => ({
        url: cleanUrl(r.url as string),
        content: texts[i],
      }))

      const failed = (raw.failed_results ?? []).map((f) => ({
        url: cleanUrl(f.url ?? ''),
        error: (f.error ?? 'could not be read').slice(0, 120),
      }))

      return {
        ok: true as const,
        pages,
        ...(failed.length ? { failed } : {}),
      }
    } catch (err) {
      return failure(err)
    }
  },
})

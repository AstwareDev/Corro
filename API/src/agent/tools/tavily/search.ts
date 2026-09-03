import { tool } from 'ai'
import { z } from 'zod'
import { tavily } from './client.js'
import { toolDescription } from '../description.js'
import { allocate, cleanUrl, dedupe, failure, host, shortDate, squeeze, truncate } from './compact.js'

interface RawSearch {
  query?: string
  answer?: string
  results?: Array<{
    title?: string
    url?: string
    content?: string
    published_date?: string
    score?: number
  }>
}

export const webSearch = tool({
  description:
    'Search the web and get back ranked results with a snippet from each page. ' +
    'Start here when a claim needs evidence. Snippets are short: follow up with web_extract ' +
    'on the two or three URLs that matter to read the actual page.',
  inputSchema: z.object({
    description: toolDescription,
    query: z.string().min(1).max(400).describe('Search query. Plain keywords work better than a long sentence.'),
    maxResults: z.number().int().min(1).max(20).default(5).describe('Results to return.'),
    topic: z.enum(['general', 'news', 'finance']).default('general').describe('"news" ranks recency higher.'),
    depth: z.enum(['basic', 'advanced']).default('basic').describe('"advanced" digs deeper, costs more, slower.'),
    days: z.number().int().min(1).max(365).optional().describe('Only results from the last N days (news topic).'),
    includeDomains: z.array(z.string()).max(20).optional().describe('Restrict to these domains.'),
    excludeDomains: z.array(z.string()).max(20).optional().describe('Never return these domains.'),
    includeAnswer: z.boolean().default(false).describe('Add a one-paragraph synthesis. Not itself a source.'),
    maxChars: z.number().int().min(500).max(20000).default(4000).describe('Total snippet budget across results.'),
  }),
  execute: async ({ query, maxResults, topic, depth, days, includeDomains, excludeDomains, includeAnswer, maxChars }) => {
    try {
      const raw = await tavily<RawSearch>('/search', {
        query,
        max_results: maxResults,
        topic,
        search_depth: depth,
        days: topic === 'news' ? days : undefined,
        include_domains: includeDomains,
        exclude_domains: excludeDomains,
        include_answer: includeAnswer,
        include_raw_content: false,
        include_images: false,
      })

      const hits = dedupe(raw.results ?? [], (r) => cleanUrl(r.url ?? '')).filter((r) => r.url)
      const snippets = allocate(
        hits.map((r) => r.content),
        maxChars
      )

      const results = hits.map((r, i) => {
        const url = cleanUrl(r.url as string)
        const published = shortDate(r.published_date)
        return {
          title: squeeze(r.title).slice(0, 160),
          url,
          ...(published ? { published } : {}),
          content: snippets[i],
        }
      })

      const domains = new Set(results.map((r) => host(r.url)).filter(Boolean))

      return {
        ok: true as const,
        query,
        ...(raw.answer ? { answer: truncate(squeeze(raw.answer), 1200) } : {}),
        results,
        distinctDomains: domains.size,
      }
    } catch (err) {
      return failure(err)
    }
  },
})

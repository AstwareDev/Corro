import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from './description.js'

const TITLE_MAX = 200
const CODE_MAX = 20000

export const showWidget = tool({
  description:
    'Render an interactive visual inline in the chat. Call this (not a chart block, not prose) for sliders, live calculation, diagrams, and small interactive tools.',
  inputSchema: z.object({
    description: toolDescription,
    title: z
      .string()
      .min(1)
      .max(TITLE_MAX)
      .describe('Short title shown above the visual, e.g. "Exponential growth explorer"'),
    widget_code: z
      .string()
      .min(1)
      .max(CODE_MAX)
      .describe(
        'An HTML fragment with inline CSS, SVG, and JavaScript. No html, head, or body tags; ' +
          'the website wraps it in a sandboxed document with theme CSS variables, a sendPrompt(text) ' +
          'global for asking follow-ups, and automatic height resizing.'
      ),
  }),
  execute: async () => 'Rendered.',
})

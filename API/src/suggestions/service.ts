import { generateText } from 'ai'
import { chatModel } from '../models/registry.js'

const SUGGESTION_MODEL = 'diffusiongemma-26b'
const MAX_SUGGESTIONS = 3



const CONTEXT_CHARS = 4_000

export interface SuggestionInput {
  userMessage: string
  assistantMessage: string
}

const truncate = (text: string) =>
  text.length > CONTEXT_CHARS ? `${text.slice(0, CONTEXT_CHARS)}…` : text




function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[\s*\-•\d.)>"'`]+/, '').replace(/["'`]+$/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)
}

export async function generateSuggestions({
  userMessage,
  assistantMessage,
}: SuggestionInput): Promise<string[]> {
  const { text } = await generateText({
    model: chatModel(SUGGESTION_MODEL),
    prompt: [
      'You draft short follow-up messages a chat USER might send next, based on the exchange below.',
      `Reply with exactly ${MAX_SUGGESTIONS} lines, one message per line, and nothing else — no`,
      "numbering, no quotes, no preamble. Write each in the user's own voice (first person, as if",
      'they typed it), under 8 words. Make them concrete to what was just discussed, not generic',
      'small talk.',
      '',
      `User: ${truncate(userMessage)}`,
      `Assistant: ${truncate(assistantMessage)}`,
    ].join('\n'),
  })
  return parseSuggestions(text)
}

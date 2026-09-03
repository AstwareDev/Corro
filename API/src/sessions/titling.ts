import { generateText } from 'ai'
import { chatModel } from '../models/registry.js'
import type { Session } from './store.js'

const TITLE_MODEL = 'diffusiongemma-26b'



const CONTEXT_CHARS = 6_000



function stripMedia(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function userContext(session: Session): string {
  const text = session.messages
    .filter((m) => m.role === 'user')
    .map((m) => stripMedia(m.content))
    .filter(Boolean)
    .join('\n')
  return text.length > CONTEXT_CHARS ? text.slice(-CONTEXT_CHARS) : text
}

function cleanTitle(text: string): string | null {
  const title = text
    .split('\n')[0]
    .replace(/^[\s*\-•\d.)>"'`]+/, '')
    .replace(/["'`.]+$/, '')
    .trim()
  if (!title) return null
  return title.length > 60 ? title.slice(0, 57) + '…' : title
}


export async function nameSession(session: Session): Promise<string | null> {
  const context = userContext(session)
  if (!context) return null

  const { text } = await generateText({
    model: chatModel(TITLE_MODEL),
    prompt: [
      'You name chat conversations for a coding/research assistant, based on',
      "everything its USER has said so far. Reply with the conversation's",
      'title only — under 6 words, no quotes, no trailing punctuation, no',
      'preamble.',
      '',
      context,
    ].join('\n'),
  })

  return cleanTitle(text)
}

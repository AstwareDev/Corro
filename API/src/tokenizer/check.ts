import 'dotenv/config'
import { getTokenizer, type ChatMessage, type ModelKey } from './index.js'
import { MODEL_KEYS, MODELS } from './specs.js'
import { endpointConfig } from '../models/registry.js'

const CODE = `export async function corroborate(claim: string, sources: Source[]) {
  const hits = await Promise.all(sources.map((s) => s.search(claim)))
  return hits.filter(Boolean).map((h) => ({ ...h, url: \`https://x.io/\${h.id}?q=1\` }))
}`

const CASES: Array<{ label: string; messages: ChatMessage[] }> = [
  { label: 'emoji + zwj', messages: [{ role: 'user', content: 'Ship it 🚀👩‍💻🇯🇵 — ok? café naïve' }] },
  { label: 'cjk mixed', messages: [{ role: 'user', content: '这个说法有多少独立来源支持？请用中文回答。Mixed with English.' }] },
  { label: 'code block', messages: [{ role: 'user', content: CODE }] },
  {
    label: 'urls + paths',
    messages: [{ role: 'user', content: 'See https://example.com/a/b/c?x=1&y=2 and /usr/local/bin//weird///path' }],
  },
  { label: 'whitespace', messages: [{ role: 'user', content: 'a\n\n\n   b\t\tc   \n  ' }] },
  { label: 'numbers', messages: [{ role: 'user', content: '1234567890 3.14159 1,000,000 0xFF 2026-08-17' }] },
  {
    label: 'special-ish',
    messages: [{ role: 'user', content: 'Literal <|endoftext|> and [BOS] and <|message_user|> in user text' }],
  },
  {
    label: '8-turn convo',
    messages: [
      { role: 'system', content: 'You verify claims against sources.' },
      { role: 'user', content: 'Is the Loire the longest river in France?' },
      { role: 'assistant', content: 'Yes — about 1,006 km.' },
      { role: 'user', content: 'Source?' },
      { role: 'assistant', content: 'IGN and Britannica both state this.' },
      { role: 'user', content: 'Any that disagree?' },
      { role: 'assistant', content: 'Some list 1,012 km depending on the mouth measured.' },
      { role: 'user', content: 'Summarise the discrepancy.' },
    ],
  },
  {
    label: 'content parts',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part. ' },
          { type: 'text', text: 'Second part with more words to tokenize.' },
        ],
      },
    ],
  },
  { label: 'long prose', messages: [{ role: 'user', content: 'Independent corroboration matters. '.repeat(40) }] },
]

async function serverPromptTokens(key: ModelKey, messages: ChatMessage[]): Promise<number> {
  const { baseUrl, apiKey } = endpointConfig(key)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model: MODELS[key].servedModelId, messages, max_tokens: 1 }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
  const json = (await res.json()) as { usage?: { prompt_tokens?: number } }
  if (typeof json.usage?.prompt_tokens !== 'number') throw new Error('no usage.prompt_tokens')
  return json.usage.prompt_tokens
}

async function main() {
  let failures = 0
  let checked = 0

  for (const key of MODEL_KEYS) {
    const tk = getTokenizer(key)
    console.log(`\n=== ${key} (${MODELS[key].servedModelId}) ===`)
    console.log(`    method: ${tk.hasTemplate ? 'published chat template' : 'fitted per-role'}\n`)

    for (const c of CASES) {
      let server: number
      try {
        server = await serverPromptTokens(key, c.messages)
      } catch (err) {
        console.log(`  ${c.label.padEnd(15)} skipped — ${(err as Error).message}`)
        continue
      }
      const local = tk.countChat(c.messages)
      const delta = local.tokens - server
      const ok = delta === 0
      checked++
      if (!ok) failures++
      console.log(
        `  ${ok ? 'ok  ' : 'MISS'} ${c.label.padEnd(15)} server=${String(server).padStart(5)}  ` +
          `local=${String(local.tokens).padStart(5)}  ${delta === 0 ? '' : `delta=${delta > 0 ? '+' : ''}${delta}`}`
      )
    }
  }

  console.log('\n=== encode/decode round-trip ===')
  for (const key of MODEL_KEYS) {
    const tk = getTokenizer(key)
    const bad = CASES.filter((c) => {
      const text = typeof c.messages[0].content === 'string' ? (c.messages[0].content as string) : ''
      if (!text) return false
      return tk.decode(tk.encode(text)) !== text
    })
    console.log(`  ${key.padEnd(10)} ${bad.length === 0 ? 'all round-trip' : `FAILED: ${bad.map((b) => b.label)}`}`)
  }

  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checked - failures}/${checked} held-out cases matched the server exactly`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOKENIZER_KEYS, SPECS, type HfTokenizerSpec, type TokenizerKey } from './specs.js'

export const CACHE_DIR = fileURLToPath(new URL('../../.cache/tokenizers/', import.meta.url))

export const cachePath = (key: TokenizerKey, file: string) => path.join(CACHE_DIR, key, file)

export const RANKS_FILE = 'ranks.tiktoken'
export const CONFIG_FILE = 'tokenizer_config.json'
export const TEMPLATE_FILE = 'chat_template.jinja'

const hfUrl = (repo: string, file: string) =>
  `https://huggingface.co/${repo}/resolve/main/${file}`

async function exists(p: string) {
  return fs.access(p).then(
    () => true,
    () => false
  )
}

async function download(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
  return (await fs.stat(dest)).size
}




function byteDecoderTable(): Map<string, number> {
  const bs: number[] = []
  for (let b = '!'.charCodeAt(0); b <= '~'.charCodeAt(0); b++) bs.push(b)
  for (let b = '¡'.charCodeAt(0); b <= '¬'.charCodeAt(0); b++) bs.push(b)
  for (let b = '®'.charCodeAt(0); b <= 'ÿ'.charCodeAt(0); b++) bs.push(b)
  const cs = [...bs]
  let n = 0
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b)
      cs.push(256 + n)
      n++
    }
  }
  const table = new Map<string, number>()
  bs.forEach((byte, i) => table.set(String.fromCodePoint(cs[i]), byte))
  return table
}

interface HfBpeArtifacts {
  ranks: string
  addedTokensDecoder: Record<string, { content: string }>
}





function hfBpeArtifacts(tokenizerJson: string): HfBpeArtifacts {
  const parsed = JSON.parse(tokenizerJson) as {
    model: { vocab: Record<string, number> }
    added_tokens: Array<{ id: number; content: string }>
  }
  const decoder = byteDecoderTable()
  const specialIds = new Set(parsed.added_tokens.map((t) => t.id))

  const lines: Array<[id: number, b64: string]> = []
  for (const [token, id] of Object.entries(parsed.model.vocab)) {
    if (specialIds.has(id)) continue
    const bytes = Uint8Array.from(
      [...token].map((ch) => {
        const byte = decoder.get(ch)
        if (byte === undefined) throw new Error(`unmappable vocab char ${JSON.stringify(ch)} in token id ${id}`)
        return byte
      })
    )
    lines.push([id, Buffer.from(bytes).toString('base64')])
  }
  lines.sort((a, b) => a[0] - b[0])
  const ranks = lines.map(([id, b64]) => `${b64} ${id}`).join('\n') + '\n'

  const addedTokensDecoder: Record<string, { content: string }> = {}
  for (const t of parsed.added_tokens) addedTokensDecoder[String(t.id)] = { content: t.content }

  return { ranks, addedTokensDecoder }
}

export async function prepareModel(spec: HfTokenizerSpec, { force = false } = {}) {
  const isHfBpe = spec.vocabFormat === 'hf-bpe'
  const ranksDest = cachePath(spec.key, RANKS_FILE)
  const ranksSource = isHfBpe ? path.join(path.dirname(ranksDest), 'source.json') : ranksDest

  const wanted: Array<[url: string, dest: string]> = [[hfUrl(spec.hfRepo, spec.ranksPath), ranksSource]]
  if (spec.specials.kind !== 'inline' && !isHfBpe) {
    wanted.push([hfUrl(spec.hfRepo, spec.specials.configFile), cachePath(spec.key, CONFIG_FILE)])
  }
  if (spec.chatTemplatePath) {
    wanted.push([hfUrl(spec.hfRepo, spec.chatTemplatePath), cachePath(spec.key, TEMPLATE_FILE)])
  }

  const written: string[] = []
  for (const [url, dest] of wanted) {
    if (!force && (await exists(dest))) continue
    const size = await download(url, dest)
    written.push(`${path.relative(CACHE_DIR, dest)} (${(size / 1024).toFixed(0)} KiB)`)
  }

  if (isHfBpe && (force || !(await exists(ranksDest)))) {
    const raw = await fs.readFile(ranksSource, 'utf8')
    const { ranks, addedTokensDecoder } = hfBpeArtifacts(raw)
    await fs.writeFile(ranksDest, ranks)
    written.push(`${path.relative(CACHE_DIR, ranksDest)} (converted from ${spec.ranksPath})`)

    if (spec.specials.kind !== 'inline') {
      const cfgDest = cachePath(spec.key, CONFIG_FILE)
      await fs.writeFile(cfgDest, JSON.stringify({ added_tokens_decoder: addedTokensDecoder }, null, 2) + '\n')
      written.push(`${path.relative(CACHE_DIR, cfgDest)} (derived from ${spec.ranksPath})`)
    }
  }

  return written
}

export async function verifyRanks(spec: HfTokenizerSpec) {
  const raw = await fs.readFile(cachePath(spec.key, RANKS_FILE), 'utf8')
  const lines = raw.split('\n').filter((l) => l.trim())
  const expected = spec.specials.kind === 'inline' ? null : spec.baseVocab
  if (expected !== null && lines.length !== expected) {
    throw new Error(
      `${spec.key}: expected ${expected} ranks, found ${lines.length}. ` +
        `The model repo may have changed — re-check baseVocab in specs.ts.`
    )
  }
  if (lines.length < spec.baseVocab) {
    throw new Error(`${spec.key}: rank file has ${lines.length} lines, fewer than baseVocab ${spec.baseVocab}`)
  }
  return lines.length
}

async function main() {
  const force = process.argv.includes('--force')
  for (const key of TOKENIZER_KEYS) {
    const spec = SPECS[key]

    if (spec.kind === 'builtin') {
      process.stdout.write(`${key} (tiktoken ${spec.encoding})\n  bundled, nothing to download\n`)
      continue
    }

    if (spec.kind === 'estimated') {
      process.stdout.write(
        `${key} (estimated from ${spec.base})\n  no vocabulary — run \`pnpm tokenizers:calibrate\` to fit it\n`
      )
      continue
    }

    process.stdout.write(`${key} (${spec.hfRepo})\n`)
    const written = await prepareModel(spec, { force })
    for (const w of written) process.stdout.write(`  downloaded ${w}\n`)
    if (!written.length) process.stdout.write(`  cached\n`)
    const n = await verifyRanks(spec)
    process.stdout.write(`  ${n} ranks, base vocab ${spec.baseVocab}, ok\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('prepare.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

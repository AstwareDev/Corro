import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CACHE_DIR } from './prepare.js'
import {
  SCALES_FILE,
  countWith,
  getTokenizer,
  messageParts,
  resetTokenizers,
  type ChatMessage,
  type ModelKey,
  type ScaleCalibration,
} from './index.js'
import { MODEL_KEYS, MODELS, SPECS, type TokenizerKey } from './specs.js'

import { endpointConfig } from '../models/registry.js'

export const CALIBRATION_EFFORT = 'high'

const LOREM =
  'The committee reviewed seventeen independent filings before publishing its ' +
  'findings, noting that three of them contradicted the summary distributed in March.'

const ROLES = ['system', 'user', 'assistant'] as const

function probes(): Array<{ label: string; messages: ChatMessage[] }> {
  return [
    { label: 'u tiny', messages: [{ role: 'user', content: 'Say OK' }] },
    { label: 'u small', messages: [{ role: 'user', content: LOREM }] },
    { label: 'u large', messages: [{ role: 'user', content: LOREM.repeat(8) }] },

    {
      label: 'u 2-part',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Independent corroboration ' },
            { type: 'text', text: 'matters here.' },
          ],
        },
      ],
    },
    {
      label: 'u 3-part',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Alpha ' },
            { type: 'text', text: 'beta ' },
            { type: 'text', text: 'gamma delta.' },
          ],
        },
      ],
    },
    {
      label: 'u+a 2-part',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'One ' }, { type: 'text', text: 'two.' }] },
        { role: 'assistant', content: 'Ack.' },
      ],
    },
    {
      label: 's+u',
      messages: [
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: LOREM },
      ],
    },
    {
      label: 'u+a',
      messages: [
        { role: 'user', content: LOREM },
        { role: 'assistant', content: 'Understood.' },
      ],
    },
    {
      label: 'u+a+u',
      messages: [
        { role: 'user', content: LOREM },
        { role: 'assistant', content: 'Understood.' },
        { role: 'user', content: 'Continue.' },
      ],
    },
    {
      label: 'u+a+u+a',
      messages: [
        { role: 'user', content: 'First.' },
        { role: 'assistant', content: 'Second.' },
        { role: 'user', content: 'Third.' },
        { role: 'assistant', content: 'Fourth.' },
      ],
    },
    {
      label: 's+u+a+u',
      messages: [
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'First.' },
        { role: 'assistant', content: 'Second.' },
        { role: 'user', content: 'Third.' },
      ],
    },
  ]
}

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
  const n = json.usage?.prompt_tokens
  if (typeof n !== 'number') throw new Error('response carried no usage.prompt_tokens')
  return n
}

function solve(A: number[][], y: number[]): number[] {
  const k = A[0].length
  const AtA = Array.from({ length: k }, () => new Array(k).fill(0))
  const Aty = new Array(k).fill(0)
  for (let i = 0; i < A.length; i++) {
    for (let a = 0; a < k; a++) {
      Aty[a] += A[i][a] * y[i]
      for (let b = 0; b < k; b++) AtA[a][b] += A[i][a] * A[i][b]
    }
  }
  for (let a = 0; a < k; a++) AtA[a][a] += 1e-6

  const M = AtA.map((row, i) => [...row, Aty[i]])
  for (let col = 0; col < k; col++) {
    let piv = col
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const d = M[col][col]
    if (Math.abs(d) < 1e-12) continue
    for (let r = 0; r < k; r++) {
      if (r === col) continue
      const f = M[r][col] / d
      for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => (Math.abs(M[i][i]) < 1e-12 ? 0 : row[k] / M[i][i]))
}

type Sample = { label: string; messages: ChatMessage[]; server: number; content: number; local: number }

const extraPartCount = (m: ChatMessage[]) =>
  m.reduce((n, msg) => n + Math.max(0, messageParts(msg.content).length - 1), 0)

function fitPerRole(samples: Sample[]) {
  const A = samples.map((s) => [
    1,
    ...ROLES.map((r) => s.messages.filter((m) => m.role === r).length),
    extraPartCount(s.messages),
  ])
  const y = samples.map((s) => s.server - s.content)
  const raw = solve(A, y).map((v) => Math.round(v))
  const fixed = raw[0]
  const roleCosts = raw.slice(1, 1 + ROLES.length)
  const perExtraPart = raw[1 + ROLES.length]
  const perRole = Object.fromEntries(ROLES.map((r, i) => [r, roleCosts[i]])) as Record<string, number>

  const residuals = samples.map((s, i) => {
    const predicted =
      fixed +
      ROLES.reduce((n, _r, j) => n + roleCosts[j] * A[i][j + 1], 0) +
      perExtraPart * A[i][1 + ROLES.length]
    return s.server - s.content - predicted
  })
  return { fixed, perRole, perExtraPart, maxResidual: Math.max(...residuals.map(Math.abs)), residuals }
}

const SCALE_CORPUS: Array<[label: string, text: string]> = [
  ['tiny', 'Say OK'],
  ['sentence', 'The quick brown fox jumps over the lazy dog.'],
  ['prose', LOREM],
  ['prose x4', LOREM.repeat(4)],
  ['prose x16', LOREM.repeat(16)],
  [
    'latin',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ' +
      'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud.',
  ],
  [
    'code',
    'export async function corroborate(claim: string, sources: Source[]) {\n' +
      '  const hits = await Promise.all(sources.map((s) => s.search(claim)))\n' +
      "  return hits.filter(Boolean).map((h) => ({ ...h, url: 'https://x.io/' + h.id }))\n}",
  ],
  ['json', JSON.stringify({ ok: true, items: [1, 2, 3], note: 'a short tool result', nested: { a: 'b' } })],
  ['urls', 'See https://example.com/a/b/c?x=1&y=2 and /usr/local/bin//weird///path'],
  ['numbers', '1234567890 3.14159 1,000,000 0xFF 2026-08-17'],
  ['cjk', '这个说法有多少独立来源支持？请用中文回答。Mixed with English.'],
  ['emoji', 'Ship it 🚀👩‍💻🇯🇵 — ok? café naïve'],
  ['markdown', '# Title\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n**bold** and `code`.'],
  ['chatty', 'Could you summarise what changed in the last release and why it matters? '.repeat(6)],
]








async function fitScale(key: ModelKey, tokenizer: TokenizerKey): Promise<ScaleCalibration | null> {
  const spec = SPECS[tokenizer]
  if (spec.kind !== 'estimated') return null

  console.log(`\n=== ${tokenizer} scale (probed through ${key}) ===`)

  const rows: Array<{ label: string; server: number; base: number; chars: number }> = []
  for (const [label, text] of SCALE_CORPUS) {
    let server: number
    try {
      server = await serverPromptTokens(key, [{ role: 'user', content: text }])
    } catch (err) {
      console.log(`  ${label.padEnd(10)} skipped — ${(err as Error).message}`)
      continue
    }
    rows.push({ label, server, base: countWith(spec.base, text), chars: text.length })
  }

  if (rows.length < 4) {
    console.log('  too few probes succeeded — leaving the shipped estimate in place')
    return null
  }

  const A = rows.map((r) => [r.base, r.chars, 1])
  const w = solve(
    A,
    rows.map((r) => r.server)
  )
  const ratio = Math.max(0, w[0])
  const perChar = Math.max(0, w[1])

  const errors = rows.map((r, i) => {
    const predicted = ratio * r.base + perChar * r.chars + w[2]
    console.log(
      `  ${r.label.padEnd(10)} server=${String(r.server).padStart(5)}  base=${String(r.base).padStart(5)}  ` +
        `chars=${String(r.chars).padStart(5)}  est=${String(Math.round(predicted)).padStart(5)}  ` +
        `err=${((predicted / r.server - 1) * 100).toFixed(1)}%`
    )
    return Math.abs(predicted / rows[i].server - 1)
  })

  const maxRelError = Math.max(...errors)
  const meanRelError = errors.reduce((a, b) => a + b, 0) / errors.length
  console.log(
    `  fit: tokens ≈ ${ratio.toFixed(4)} * ${spec.base} + ${perChar.toFixed(4)} * chars  ` +
      `(mean ${(meanRelError * 100).toFixed(1)}%, worst ${(maxRelError * 100).toFixed(1)}%)`
  )

  return {
    ratio: Number(ratio.toFixed(4)),
    perChar: Number(perChar.toFixed(4)),
    maxRelError: Number(maxRelError.toFixed(4)),
    meanRelError: Number(meanRelError.toFixed(4)),
    samples: rows.length,
    measuredAt: new Date().toISOString(),
  }
}

function selectedModels(): ModelKey[] {
  const named = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  if (!named.length) return MODEL_KEYS
  const unknown = named.filter((n) => !(MODEL_KEYS as string[]).includes(n))
  if (unknown.length) {
    throw new Error(`Unknown model(s) ${unknown.join(', ')}. Known: ${MODEL_KEYS.join(', ')}`)
  }
  return named as ModelKey[]
}

async function main() {
  const models = selectedModels()
  const calibrationPath = path.join(CACHE_DIR, 'calibration.json')
  let out: Record<string, unknown> = {}
  try {
    out = JSON.parse(await fs.readFile(calibrationPath, 'utf8'))
  } catch {
  }

  let scales: Record<string, ScaleCalibration> = {}
  try {
    scales = JSON.parse(await fs.readFile(SCALES_FILE, 'utf8'))
  } catch {
  }




  const fitted = new Set<TokenizerKey>()
  for (const key of models) {
    const tokenizer = MODELS[key].tokenizer
    if (SPECS[tokenizer].kind !== 'estimated' || fitted.has(tokenizer)) continue
    const scale = await fitScale(key, tokenizer)
    if (scale) {
      scales[tokenizer] = scale
      fitted.add(tokenizer)
    }
  }

  if (fitted.size) {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    await fs.writeFile(SCALES_FILE, JSON.stringify(scales, null, 2) + '\n')
    console.log(`\nwrote ${path.relative(process.cwd(), SCALES_FILE)}`)
    resetTokenizers()
  }

  for (const key of models) {
    console.log(`\n=== ${key} (${MODELS[key].servedModelId} @ ${MODELS[key].baseUrlEnv}) ===`)

    let tk: ReturnType<typeof getTokenizer>
    try {
      tk = getTokenizer(key)
    } catch (err) {
      console.log(`  unavailable — ${(err as Error).message.split('\n')[0]}`)
      continue
    }

    const samples: Sample[] = []
    for (const probe of probes()) {
      let server: number
      try {
        server = await serverPromptTokens(key, probe.messages)
      } catch (err) {
        console.log(`  ${probe.label.padEnd(10)} skipped — ${(err as Error).message}`)
        continue
      }

      const c = tk.countChat(probe.messages, { reasoningEffort: CALIBRATION_EFFORT, raw: true })
      samples.push({ ...probe, server, content: c.contentTokens, local: c.tokens })
    }

    if (samples.length < 3) {
      console.log('  too few probes succeeded — leaving calibration untouched')
      continue
    }

    if (tk.hasTemplate) {
      const deltas = samples.map((s) => s.local - s.server)
      for (const [i, s] of samples.entries()) {
        console.log(
          `  ${s.label.padEnd(10)} server=${String(s.server).padStart(5)}  render=${String(s.local).padStart(5)}  delta=${deltas[i] > 0 ? '+' : ''}${deltas[i]}`
        )
      }
      const offset = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
      const maxResidual = Math.max(...deltas.map((d) => Math.abs(d - offset)))
      console.log(
        maxResidual === 0
          ? `  EXACT after a constant ${offset > 0 ? '-' : '+'}${Math.abs(offset)} correction`
          : `  render drifts by up to ${maxResidual} tokens around the mean offset`
      )
      out[key] = {
        kind: 'template-offset',
        offset,
        maxResidual,
        effort: CALIBRATION_EFFORT,
        measuredAt: new Date().toISOString(),
      }
      continue
    }

    const f = fitPerRole(samples)
    for (const [i, s] of samples.entries()) {
      console.log(
        `  ${s.label.padEnd(10)} server=${String(s.server).padStart(5)}  content=${String(s.content).padStart(5)}  ` +
          `overhead=${String(s.server - s.content).padStart(4)}  residual=${f.residuals[i]}`
      )
    }
    const terms = ROLES.map((r) => `${f.perRole[r]}*${r}`).join(' + ')
    console.log(`  fit: overhead = ${f.fixed} + ${terms} + ${f.perExtraPart}*extraPart`)
    console.log(
      f.maxResidual === 0
        ? '  EXACT — the per-role model reproduces every probe'
        : `  max residual ${f.maxResidual} tokens`
    )
    out[key] = {
      kind: 'per-role',
      fixedOverhead: f.fixed,
      perRole: f.perRole,
      perExtraPart: f.perExtraPart,
      maxResidual: f.maxResidual,
      measuredAt: new Date().toISOString(),
    }
  }

  await fs.mkdir(CACHE_DIR, { recursive: true })
  await fs.writeFile(calibrationPath, JSON.stringify(out, null, 2) + '\n')
  console.log(`\nwrote ${path.relative(process.cwd(), calibrationPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

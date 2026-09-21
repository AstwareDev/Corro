import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface SkillMeta {
  name: string
  description: string
}

const VALID_NAME = /^[a-z0-9][a-z0-9-_]*$/i

export function resolveSkillsDir(): string {
  const override = process.env.CORRO_SKILLS_DIR?.trim()
  if (override) return path.resolve(override)
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', '..', '..', 'skills')
}

function skillsDir(): string {
  return resolveSkillsDir()
}

export function parseFrontmatter(text: string): SkillMeta | null {
  const match = /^\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return null
  let name = ''
  let description = ''
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line)
    if (!field) continue
    const key = field[1].toLowerCase()
    const value = field[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim()
    if (key === 'name') name = value
    else if (key === 'description') description = value
  }
  if (!name || !description || !VALID_NAME.test(name)) return null
  return { name: name.toLowerCase(), description }
}

function stripFrontmatter(text: string): string {
  return text.replace(/^\s*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()
}

export function listSkills(dir: string = skillsDir()): SkillMeta[] {
  let files: string[]
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'))
  } catch {
    return []
  }
  const out: SkillMeta[] = []
  const seen = new Set<string>()
  for (const file of files.sort()) {
    let text: string
    try {
      text = fs.readFileSync(path.join(dir, file), 'utf8')
    } catch {
      continue
    }
    const meta = parseFrontmatter(text)
    if (!meta || seen.has(meta.name)) continue
    seen.add(meta.name)
    out.push(meta)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export class SkillNotFound extends Error {
  readonly known: string[]
  constructor(name: string, known: string[]) {
    super(
      known.length
        ? `Unknown skill ${JSON.stringify(name)}. Known skills: ${known.join(', ')}.`
        : `Unknown skill ${JSON.stringify(name)}. No skills are installed.`
    )
    this.known = known
  }
}

export function readSkillBody(name: string, dir: string = skillsDir()): { meta: SkillMeta; body: string } {
  const normalized = name.trim().toLowerCase()
  if (!VALID_NAME.test(normalized)) {
    throw new SkillNotFound(name, listSkills(dir).map((s) => s.name))
  }
  const known = listSkills(dir)
  const meta = known.find((s) => s.name === normalized)
  if (!meta) throw new SkillNotFound(name, known.map((s) => s.name))
  const body = stripFrontmatter(fs.readFileSync(path.join(dir, `${meta.name}.md`), 'utf8'))
  if (!body) throw new Error(`Skill ${JSON.stringify(meta.name)} has an empty body`)
  return { meta, body }
}

export function formatSkillsIndex(dir: string = skillsDir()): string {
  const skills = listSkills(dir)
  if (!skills.length) return 'No skills are installed.'
  return skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
}

export function parseSkillCommand(text: string): { name: string; rest: string } | null {
  const match = /^\/([A-Za-z0-9-_]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return null
  return { name: match[1].toLowerCase(), rest: (match[2] ?? '').trim() }
}

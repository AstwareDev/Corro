import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildSystemPrompt } from '../prompt.js'
import { conversation, withSentAt, type Session } from '../../sessions/store.js'
import {
  formatSkillsIndex,
  listSkills,
  parseFrontmatter,
  parseSkillCommand,
  readSkillBody,
  resolveSkillsDir,
  SkillNotFound,
} from './loader.js'
import { readSkill } from './readSkill.js'

function tempSkills(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corro-skills-test-'))
  fs.writeFileSync(
    path.join(dir, 'research.md'),
    '---\nname: research\ndescription: Research things thoroughly.\n---\n\n# Research Skill\n\nDo the work.\n'
  )
  fs.writeFileSync(path.join(dir, 'README.md'), '# Skills\n\nNo frontmatter here.\n')
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a skill\n')
  return dir
}

test('frontmatter parses name and description, rejects the rest', () => {
  assert.deepEqual(parseFrontmatter('---\nname: research\ndescription: Does research.\n---\n\nBody'), {
    name: 'research',
    description: 'Does research.',
  })
  assert.equal(parseFrontmatter('# No frontmatter\n'), null)
  assert.equal(parseFrontmatter('---\nname: research\n---\n\nBody'), null)
  assert.equal(parseFrontmatter('---\ndescription: No name.\n---\n\nBody'), null)
  assert.equal(parseFrontmatter('---\nname: "bad name!"\ndescription: Nope.\n---\n\nBody'), null)
})

test('skill index lists only valid markdown skills', () => {
  const dir = tempSkills()
  try {
    assert.deepEqual(listSkills(dir), [{ name: 'research', description: 'Research things thoroughly.' }])
    assert.equal(formatSkillsIndex(dir), '- research: Research things thoroughly.')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('missing skills dir yields an empty index, not a crash', () => {
  assert.deepEqual(listSkills(path.join(os.tmpdir(), 'corro-no-such-skills-dir')), [])
})

test('skill bodies load without frontmatter; unknown names list what exists', () => {
  const dir = tempSkills()
  try {
    const { meta, body } = readSkillBody('Research', dir)
    assert.equal(meta.name, 'research')
    assert.ok(body.startsWith('# Research Skill'))
    assert.ok(!body.includes('description:'))
    assert.throws(() => readSkillBody('nope', dir), (err: unknown) => {
      assert.ok(err instanceof SkillNotFound)
      assert.deepEqual(err.known, ['research'])
      assert.match(err.message, /Known skills: research/)
      return true
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('slash commands parse only at the message start', () => {
  assert.deepEqual(parseSkillCommand('/research what changed?'), { name: 'research', rest: 'what changed?' })
  assert.deepEqual(parseSkillCommand('/research'), { name: 'research', rest: '' })
  assert.deepEqual(parseSkillCommand('  /Research  '), { name: 'research', rest: '' })
  assert.equal(parseSkillCommand('please /research this'), null)
  assert.equal(parseSkillCommand('/'), null)
  assert.equal(parseSkillCommand('hello'), null)
})

test('system prompt carries the skill index, never skill bodies or a clock', () => {
  assert.ok(resolveSkillsDir().endsWith('skills'))
  const prompt = buildSystemPrompt({ toolNames: [] })
  for (const name of ['research', 'shopping', 'social-lookup', 'artifact-builder', 'browser-navigation']) {
    assert.match(prompt, new RegExp(`<available_skills>[\\s\\S]*- ${name}:`), `index lists ${name}`)
  }
  assert.ok(prompt.includes('call read_skill(name)'))
  assert.ok(!prompt.includes('Do not browse for ceremony'))
  assert.ok(!prompt.includes('<research>'))
  assert.ok(!prompt.includes('current_datetime_utc'))
  assert.ok(prompt.includes('<sent_at>'))
})

test('extracted content lives only in skill bodies, not the system prompt', () => {
  const prompt = buildSystemPrompt({ toolNames: [] })
  for (const marker of [
    'anything the shop does not publish',
    'published caption tracks',
    'Made with Corro',
    'interstitial: true',
    'no browser is installed',
  ]) {
    assert.ok(!prompt.includes(marker), `system prompt should not still carry: ${marker}`)
    const anyOf = ['shopping', 'social-lookup', 'artifact-builder', 'browser-navigation']
    const bodies = anyOf.map((n) => {
      try {
        return readSkillBody(n).body
      } catch {
        return ''
      }
    })
    assert.ok(bodies.some((b) => b.includes(marker)), `some skill should carry: ${marker}`)
  }
})

test('all five skills load through read_skill with no body leakage in errors', async () => {
  const execute = (readSkill as unknown as { execute: (input: unknown) => Promise<unknown> }).execute
  for (const name of ['research', 'shopping', 'social-lookup', 'artifact-builder', 'browser-navigation']) {
    const result = (await execute({ description: 'Loading a skill', name })) as { ok: boolean; name: string; content: string }
    assert.equal(result.ok, true, name)
    assert.equal(result.name, name)
    assert.ok(result.content.length > 100, `${name} body should have substance`)
    assert.ok(!result.content.includes('---'), `${name} body should drop frontmatter`)
  }
  const missing = (await execute({ description: 'Loading nothing', name: 'nope' })) as { ok: boolean; known: string[] }
  assert.equal(missing.ok, false)
  for (const name of ['research', 'shopping', 'social-lookup', 'artifact-builder', 'browser-navigation']) {
    assert.ok(missing.known.includes(name), `known lists ${name}`)
  }
})

test('preloaded skill bodies land in a turn-scoped section', () => {
  const prompt = buildSystemPrompt({ toolNames: [], skillContext: '<skill name="research">TEST-BODY</skill>' })
  assert.ok(prompt.includes('<skill_context>'))
  assert.ok(prompt.includes('TEST-BODY'))
  assert.ok(!buildSystemPrompt({ toolNames: [] }).includes('<skill_context>'))
})

test('history user messages carry their stored send time', () => {
  const session = {
    messages: [
      { id: 'u1', role: 'user', content: 'What changed?', at: '2026-09-18T10:00:00.000Z' },
      { id: 'a1', role: 'assistant', content: 'Nothing yet.', at: '2026-09-18T10:01:00.000Z' },
      { id: 'u2', role: 'user', content: 'Legacy without timestamp' },
    ],
  } as unknown as Session
  const replay = conversation(session)
  assert.equal(replay[0].role, 'user')
  assert.equal(
    (replay[0] as { content: string }).content,
    '<sent_at>2026-09-18T10:00:00.000Z</sent_at>\nWhat changed?'
  )
  assert.equal((replay[1] as { content: string }).content, 'Nothing yet.')
  assert.equal((replay[2] as { content: string }).content, 'Legacy without timestamp')
})

test('withSentAt prefixes ISO stamps and tolerates missing ones', () => {
  assert.equal(withSentAt('hi', '2026-09-18T10:00:00.000Z'), '<sent_at>2026-09-18T10:00:00.000Z</sent_at>\nhi')
  assert.equal(withSentAt('hi'), 'hi')
  assert.equal(withSentAt('hi', ''), 'hi')
})

test('read_skill returns bodies just-in-time and errors usefully', async () => {
  const execute = (readSkill as unknown as { execute: (input: unknown) => Promise<unknown> }).execute
  const ok = (await execute({ description: 'Loading research', name: 'research' })) as {
    ok: boolean
    name: string
    content: string
  }
  assert.equal(ok.ok, true)
  assert.equal(ok.name, 'research')
  assert.ok(ok.content.includes('## Workflow'))
  const missing = (await execute({ description: 'Loading nothing', name: 'nope' })) as {
    ok: boolean
    error: string
    known: string[]
  }
  assert.equal(missing.ok, false)
  assert.ok(missing.known.includes('research'))
  assert.match(missing.error, /Unknown skill/)
})

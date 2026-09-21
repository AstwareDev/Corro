import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../tools/description.js'
import { listSkills, readSkillBody, SkillNotFound } from './loader.js'

export const readSkill = tool({
  description:
    'Load a skill\'s full instructions. The system prompt only lists skill names and one-line ' +
    'descriptions — call this when a listed skill is relevant to the request, then follow the ' +
    'returned instructions for the rest of this turn. Skill bodies are never preloaded, so read ' +
    'one just-in-time instead of guessing its contents.',
  inputSchema: z.object({
    description: toolDescription,
    name: z
      .string()
      .min(1)
      .max(80)
      .describe('Skill name exactly as listed in the skills index, e.g. "research".'),
  }),
  execute: async ({ name }) => {
    try {
      const { meta, body } = readSkillBody(name)
      return { ok: true as const, name: meta.name, content: body }
    } catch (err) {
      if (err instanceof SkillNotFound) {
        return { ok: false as const, name, error: err.message, known: err.known }
      }
      return {
        ok: false as const,
        name,
        error: err instanceof Error ? err.message : 'Could not read the skill',
        known: listSkills().map((s) => s.name),
      }
    }
  },
})

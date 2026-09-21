# Skills

Skills are task-specific instruction packs that stay **out** of the system
prompt until they are needed. The system prompt only carries a compact index
(`name` + `description` per skill); the full body is loaded just-in-time via
the `read_skill` tool (agent-triggered) or a `/<skill-name>` slash command
(user-triggered). Skill bodies apply to the current turn only.

## Adding a new skill

1. Create one Markdown file per skill in this directory: `<name>.md`.
2. Start the file with YAML frontmatter containing exactly:
   - `name`: unique slug, lowercase letters/numbers/dashes (e.g. `research`).
     Doubles as the slash-command trigger (`/research`) and the `read_skill`
     argument, so keep it short and guessable.
   - `description`: one or two sentences, single line. This is the
     **only** part loaded into every request — it is what the agent uses to
     decide whether the skill is relevant, so name the triggering situations
     concretely ("when the user asks for X...") rather than vaguely.
3. Below the frontmatter, write the full instructions in Markdown: steps,
   constraints, examples, output format. This body is loaded on demand, so it
   can be as thorough as the task needs without taxing turns that never use it.

Example:

```markdown
---
name: research
description: Use this skill when the user asks for in-depth research, fact-finding across multiple sources, or a comprehensive investigation of a topic that needs more than a quick answer. Covers search strategy, source evaluation, and synthesis format.
---

# Research Skill

<full instructions go here>
```

## Rules

- Frontmatter is parsed leniently but keep it simple: `name:` and
  `description:` on their own single lines. Multi-line descriptions are not
  supported — tighten the wording instead.
- Files without valid `name`/`description` frontmatter (like this README) are
  ignored by the skill index.
- Filenames should match the skill `name` (e.g. `research.md` for
  `research`) but the loader keys off frontmatter, not the filename.
- Never put secrets in a skill file — bodies are injected into model context.
- Override the directory in development/tests with `CORRO_SKILLS_DIR`.

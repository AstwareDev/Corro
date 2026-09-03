import fs from 'node:fs'
import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import {
  ensureRoot,
  listFiles,
  resolveInside,
  toRelative,
  WorkspaceError,
} from './workspace.js'

const MAX_READ_BYTES = 400_000
const MAX_WRITE_BYTES = 2_000_000
const MAX_MATCHES = 200

function fail(err: unknown) {
  return {
    ok: false as const,
    error:
      err instanceof WorkspaceError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Filesystem operation failed',
  }
}

function readText(full: string): string {
  const stat = fs.statSync(full)
  if (stat.size > MAX_READ_BYTES) {
    throw new WorkspaceError(
      `File is ${stat.size} bytes, over the ${MAX_READ_BYTES} read limit. Use fs_search to find the part you need.`
    )
  }
  return fs.readFileSync(full, 'utf8')
}

function numbered(text: string, from: number): string {
  return text
    .split('\n')
    .map((line, i) => `${String(from + i).padStart(5)}\t${line}`)
    .join('\n')
}






export function createFsTools(root: string) {
  ensureRoot(root)

  const fs_list = tool({
    description:
      'List the files in the workspace. Call this before assuming a file does or does not exist.',
    inputSchema: z.object({
      description: toolDescription,
    }),
    execute: async () => {
      try {
        const files = listFiles(root)
        return { ok: true as const, files, count: files.length }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_read = tool({
    description:
      'Read a file from the workspace. Returns the text with line numbers, so you can quote a ' +
      'line or target an edit precisely.',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative path, e.g. "notes/summary.md"'),
      offset: z.number().int().min(1).optional().describe('First line to return (1-based).'),
      limit: z.number().int().min(1).max(5000).optional().describe('How many lines to return.'),
    }),
    execute: async ({ path: rel, offset, limit }) => {
      try {
        const full = resolveInside(root, rel)
        const text = readText(full)
        const lines = text.split('\n')
        const start = (offset ?? 1) - 1
        const end = limit === undefined ? lines.length : start + limit
        const slice = lines.slice(start, end)
        return {
          ok: true as const,
          path: toRelative(root, full),
          totalLines: lines.length,
          content: numbered(slice.join('\n'), start + 1),
          truncated: end < lines.length,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_write = tool({
    description:
      'Create a file, or replace one entirely. To change part of an existing file use fs_edit — ' +
      'it is far cheaper than rewriting the whole thing.',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative path. Parent folders are created.'),
      content: z.string().max(MAX_WRITE_BYTES).describe('The full file contents.'),
    }),
    execute: async ({ path: rel, content }) => {
      try {
        const full = resolveInside(root, rel)
        const existed = fs.existsSync(full)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, content, 'utf8')
        return {
          ok: true as const,
          path: toRelative(root, full),
          bytes: Buffer.byteLength(content, 'utf8'),
          created: !existed,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_edit = tool({
    description:
      'Replace an exact string in a file. The old text must appear exactly once unless replaceAll ' +
      'is set, so include enough surrounding context to make it unambiguous.',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative path.'),
      oldText: z.string().min(1).describe('Exact text to replace, including indentation.'),
      newText: z.string().describe('Replacement text. Empty string deletes the old text.'),
      replaceAll: z.boolean().optional().describe('Replace every occurrence instead of requiring one.'),
    }),
    execute: async ({ path: rel, oldText, newText, replaceAll }) => {
      try {
        const full = resolveInside(root, rel)
        const before = readText(full)
        const occurrences = before.split(oldText).length - 1

        if (occurrences === 0) {
          return { ok: false as const, error: 'That exact text is not in the file.' }
        }
        if (occurrences > 1 && !replaceAll) {
          return {
            ok: false as const,
            error: `That text appears ${occurrences} times. Add surrounding context to make it unique, or set replaceAll.`,
          }
        }

        const after = replaceAll ? before.split(oldText).join(newText) : before.replace(oldText, newText)
        fs.writeFileSync(full, after, 'utf8')
        return {
          ok: true as const,
          path: toRelative(root, full),
          replaced: replaceAll ? occurrences : 1,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_delete = tool({
    description: 'Delete a file from the workspace. This cannot be undone.',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative path.'),
    }),
    execute: async ({ path: rel }) => {
      try {
        const full = resolveInside(root, rel)
        if (!fs.existsSync(full)) {
          return { ok: false as const, error: `${rel} does not exist.` }
        }
        if (fs.statSync(full).isDirectory()) {
          fs.rmSync(full, { recursive: true })
          return { ok: true as const, path: toRelative(root, full), kind: 'directory' as const }
        }
        fs.unlinkSync(full)
        return { ok: true as const, path: toRelative(root, full), kind: 'file' as const }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_rename = tool({
    description: 'Move or rename a file within the workspace.',
    inputSchema: z.object({
      description: toolDescription,
      from: z.string().min(1).describe('Existing workspace-relative path.'),
      to: z.string().min(1).describe('New workspace-relative path.'),
    }),
    execute: async ({ from, to }) => {
      try {
        const src = resolveInside(root, from)
        const dest = resolveInside(root, to)
        if (!fs.existsSync(src)) return { ok: false as const, error: `${from} does not exist.` }
        if (fs.existsSync(dest)) return { ok: false as const, error: `${to} already exists.` }
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.renameSync(src, dest)
        return { ok: true as const, from: toRelative(root, src), to: toRelative(root, dest) }
      } catch (err) {
        return fail(err)
      }
    },
  })

  const fs_search = tool({
    description:
      'Search the text of workspace files for a regular expression. Returns matching lines with ' +
      'their file and line number — the fast way to locate something without reading whole files.',
    inputSchema: z.object({
      description: toolDescription,
      pattern: z.string().min(1).max(400).describe('JavaScript regular expression.'),
      pathContains: z
        .string()
        .optional()
        .describe('Only search files whose path contains this substring, e.g. ".md"'),
      caseSensitive: z.boolean().optional(),
    }),
    execute: async ({ pattern, pathContains, caseSensitive }) => {
      try {
        let re: RegExp
        try {
          re = new RegExp(pattern, caseSensitive ? '' : 'i')
        } catch {
          return { ok: false as const, error: `${JSON.stringify(pattern)} is not a valid regular expression.` }
        }

        const matches: Array<{ path: string; line: number; text: string }> = []
        for (const file of listFiles(root)) {
          if (matches.length >= MAX_MATCHES) break
          if (pathContains && !file.path.includes(pathContains)) continue
          let text: string
          try {
            text = readText(resolveInside(root, file.path))
          } catch {
            continue
          }
          const lines = text.split('\n')
          for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
            if (re.test(lines[i])) {
              matches.push({ path: file.path, line: i + 1, text: lines[i].trim().slice(0, 300) })
            }
          }
        }

        return {
          ok: true as const,
          pattern,
          matches,
          count: matches.length,
          truncated: matches.length >= MAX_MATCHES,
        }
      } catch (err) {
        return fail(err)
      }
    },
  })

  return { fs_list, fs_read, fs_write, fs_edit, fs_delete, fs_rename, fs_search }
}

export type FsToolName = keyof ReturnType<typeof createFsTools>

export const FS_TOOL_NAMES: FsToolName[] = [
  'fs_list',
  'fs_read',
  'fs_write',
  'fs_edit',
  'fs_delete',
  'fs_rename',
  'fs_search',
]

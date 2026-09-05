import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '../../../sessions/store.js'
import { PUBLIC_URL } from '../../../config.js'

export const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces')





export class WorkspaceError extends Error {}

const SAFE_ID = /^[a-z0-9_-]{4,80}$/i





export function workspaceRoot(deviceId: string, sessionId?: string): string {
  if (!SAFE_ID.test(deviceId)) {
    throw new WorkspaceError(`Invalid device id ${JSON.stringify(deviceId)}`)
  }
  if (!sessionId) {
    return path.join(WORKSPACES_DIR, deviceId, '_scratch')
  }
  if (!SAFE_ID.test(sessionId)) {
    throw new WorkspaceError(`Invalid session id ${JSON.stringify(sessionId)}`)
  }
  return path.join(WORKSPACES_DIR, deviceId, sessionId)
}

export function ensureRoot(root: string): string {
  fs.mkdirSync(root, { recursive: true })
  return root
}


export function resolveInside(root: string, relative: string): string {
  const cleaned = String(relative ?? '').trim()
  if (!cleaned) throw new WorkspaceError('Path is required')
  if (path.isAbsolute(cleaned) || /^[a-z]:/i.test(cleaned)) {
    throw new WorkspaceError(`Use a path relative to the workspace, not ${JSON.stringify(cleaned)}`)
  }

  const full = path.resolve(root, cleaned)
  const rel = path.relative(root, full)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new WorkspaceError(`${JSON.stringify(cleaned)} is outside the workspace`)
  }
  // Reject symlinks/junctions in every existing path component. Lexical containment alone
  // permits writes and deletes outside the workspace through a linked directory.
  for (const part of rel.split(path.sep)) {
    if (part.includes(':')) throw new WorkspaceError('Alternate data streams are not supported')
  }
  let current = path.resolve(root)
  for (const part of ['', ...rel.split(path.sep)]) {
    current = path.join(current, part)
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new WorkspaceError('Linked paths are not supported')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  return full
}


export function toRelative(root: string, full: string): string {
  return path.relative(root, full).split(path.sep).join('/')
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store'])

export interface WorkspaceFile {
  path: string
  bytes: number
  modifiedAt: string
}

export function listFiles(root: string, limit = 500): WorkspaceFile[] {
  const out: WorkspaceFile[] = []

  function walk(dir: string) {
    if (out.length >= limit) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= limit) return
      if (IGNORED.has(entry.name) || entry.name.startsWith('.corro-')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stat = fs.statSync(full)
        out.push({
          path: toRelative(root, full),
          bytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        
      }
    }
  }

  walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}


/** Builds the URL that serves this workspace-relative path as itself (rendered HTML, a
 * downloadable .pptx, an inline image) rather than the JSON envelope /workspace/file returns.
 * Derives device/session back out of the root path so callers only need the values they already
 * have — the workspace root and a relative path — not the request that produced them. */
export function viewUrl(root: string, relativePath: string): string {
  const parts = path.relative(WORKSPACES_DIR, root).split(path.sep)
  const [deviceId, session] = parts
  const params = new URLSearchParams({ path: relativePath })
  if (deviceId) params.set('device', deviceId)
  if (session && session !== '_scratch') params.set('session', session)
  return `${PUBLIC_URL}/workspace/view?${params.toString()}`
}

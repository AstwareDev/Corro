import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { WorkspaceError } from './workspace.js'

export const MAX_WRITE_BYTES = 2_000_000
export const revisionOf = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')

export class RevisionConflict extends WorkspaceError {}

interface Receipt {
  verified: true
  changed: boolean
  created: boolean
  bytes: number
  revision: string
  previousRevision: string | null
  modifiedAt: string
}

/** Shared atomic write + verify-by-readback path for both saveText and saveBinary.
 * A receipt describes bytes read from disk, never the proposed write alone. */
function persist(full: string, content: Buffer, expectedRevision?: string | null): Receipt {
  if (content.length > MAX_WRITE_BYTES) throw new WorkspaceError(`Content exceeds the ${MAX_WRITE_BYTES} byte limit.`)
  const before = fs.existsSync(full) ? fs.readFileSync(full) : null
  const previousRevision = before === null ? null : revisionOf(before)
  if (expectedRevision !== undefined && expectedRevision !== previousRevision) {
    throw new RevisionConflict('This file changed since you read it. Reload it before saving your changes.')
  }
  const revision = revisionOf(content)
  const changed = previousRevision !== revision
  if (changed) {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const temporary = path.join(path.dirname(full), `.corro-${randomUUID()}.tmp`)
    try {
      fs.writeFileSync(temporary, content, { flag: 'wx' })
      fs.renameSync(temporary, full)
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }
  const saved = fs.readFileSync(full)
  if (revisionOf(saved) !== revision) throw new WorkspaceError('Write verification failed. Read the file before retrying.')
  return {
    verified: true as const, changed, created: before === null,
    bytes: saved.length, revision, previousRevision,
    modifiedAt: fs.statSync(full).mtime.toISOString(),
  }
}

export function saveText(full: string, content: string, expectedRevision?: string | null) {
  const receipt = persist(full, Buffer.from(content, 'utf8'), expectedRevision)
  return { ...receipt, preview: content.slice(0, 1200) }
}

/** For non-text output a tool builds in memory (a screenshot, a generated .pptx) rather than
 * text the model composed itself. No text preview is returned; callers describe the result instead. */
export function saveBinary(full: string, content: Buffer, expectedRevision?: string | null) {
  return persist(full, content, expectedRevision)
}

# Action reliability and workspace changes

The saved presentation conversation confirmed two false completion reports:
the first rewrite claimed success without calling any tools; the second called
only `fs_list` and `fs_read`. The final attempt did call `fs_write` and `fs_read`.
This establishes what executed, not why the model chose those words.

Contributing harness problems were reproducible in the code:

- History replay dropped saved tool results and retained assistant prose. A
  mistaken "Done" survived into the next turn without the execution evidence.
- Persistence joined calls and results by array position instead of call ID.
- Model prose reached clients before any completion check.
- Failed tool outputs became completed UI steps; thrown tool errors were not
  forwarded as tool results. Open previews did not refresh after writes.

## Changes

`runAgent` and `streamAgent` now share one bounded loop. Native tool messages and
IDs survive across steps and turns, including legacy session replay. The loop
withholds final prose, checks common English action claims against current-turn
receipts, and allows a repair attempt within the step budget. Repeated unsupported
claims and exhausted budgets produce a factual partial-result response. Tool
progress remains live; final prose arrives after checking. Interrupted streams
are drained after cancellation so confirmed effects can still be persisted.

The prompt separates artifact work from research, explicitly handles follow-up
edit requests, and distinguishes a save receipt from a separate readback or a
claim about content quality. Creative drafts no longer inherit research headings
or evidence labels by default.

File writes use temporary-file replacement and verify bytes read from disk.
Receipts include `changed`, `verified`, SHA-256 revisions, byte counts, timestamps,
and a preview. `fs_read` returns a revision; edit/write can reject stale revisions.
Exact-string edits preserve literal dollar sequences. Root paths, traversal,
linked paths, alternate streams, and recursive directory deletion are rejected.

The workspace UI supports file creation, search, sorting, source editing, Markdown
preview, downloads, explicit save state, refresh, errors, and deletion confirmation.
Creating a file before the first message creates a real session workspace. UI saves
require the loaded revision and return HTTP 409 on a conflict; drafts are preserved.

## Validation and limits

Run `pnpm test` and `pnpm typecheck` in `API`; run `pnpm build` in `website`.
Regression tests use the actual SDK loop with scripted model outputs and real
temporary filesystem writes. HTTP tests exercise saving, reading, conflicts and
deletion. They need no model credentials or external service.

The completion check is an English pattern-based safeguard, not a semantic judge.
It can miss unfamiliar phrasing or misunderstand unusual wording. A successful
receipt proves bytes were saved, not that an edit fulfilled every user requirement.
No measured reduction in live-model hallucination rate is claimed. Revision checks
prevent stale saves through this process; they do not provide a cross-process file
locking protocol. Saves are verified at the time of the operation, not indefinitely.

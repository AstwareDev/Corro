# Corro website

Chat frontend for the Corro API (Next.js, `src/`). Streams assistant replies
word by word, renders Markdown with KaTeX math, and shows rich results inline:
charts (line, bar, scatter, area and pie, with smooth curves, labeled points,
reference lines, table and CSV view, expandable large view), interactive
widgets with sliders and live plots, maps, shop products, YouTube clips, rate
tables and math.

```bash
pnpm install
pnpm dev
```

Runs on `:3000`. Set `NEXT_PUBLIC_CORRO_API_URL` (see `.env.local`) to point
at the API (default `http://localhost:8787`).

Everything else lives in `src/`:

- `components/` chat messages, Markdown renderer, charts, maps, shop and
  social cards, workspace viewer, settings
- `hooks/` chat streaming state (`useChat`)
- `lib/` API client, speech text cleanup (`speakable`), formatting, types
- `app/` routes, including `/api/client-region` for region detection

Features: light, dark and system themes with adjustable layout and reading
size; 8 interface languages (English, Հայերեն, Français, Deutsch, Español,
日本語, Português, 한국어); read aloud through ElevenLabs with messages
cleaned into speakable text first; a context meter and token counts per reply;
file uploads; search across tasks (⌘K); export to Markdown or DOCX; follow-up
suggestion chips; rename, pin, search, delete and continue for saved tasks.

Every view has its own URL, so a refresh never loses the page: `/` starts a
new chat, `/chat/[id]` reopens a task, `/customize` manages MCP servers,
skills and tools (each card opens a detail view), and `/settings` holds
appearance, layout and language.

Scripts: `dev`, `build`, `start`, `lint` (`biome check`), `test` (`vitest run`).

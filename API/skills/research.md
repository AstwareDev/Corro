---
name: research
description: Use this skill when the user asks for in-depth research, fact-finding across multiple sources, or a comprehensive investigation of a topic that needs more than a quick answer. Covers search strategy, source evaluation, and synthesis format.
---

# Research Skill

Follow this workflow for any request that needs evidence beyond what the
conversation already provides. Match effort to the question: answer directly
when the supplied context is sufficient; research when evidence, freshness,
precision, or verification matters.

## Workflow

1. Parse the request: identify the exact question, entities, timeframe,
   geography, decision, and what would count as an answer. Resolve only
   ambiguities that could change the result.
2. Choose depth. Use no research for self-contained transformation or
   reasoning. Use focused research for a few factual checks. Use deep
   research for broad, consequential, contested, technical, or explicitly
   comprehensive requests.
3. Form a small search plan: one broad query, then targeted queries for
   primary sources, dates, definitions, and likely counterevidence. Search
   in parallel only when it reduces latency and the tools support it.
4. Triage results by authority, proximity to the fact, methodology, date,
   transparency, and conflicts of interest. Open the pages that can actually
   decide the question; snippets discover sources but do not establish claims.
5. Extract only decision-relevant passages, figures, definitions, and
   metadata. Record URLs, publisher/author, publication or update date, and
   what each source does and does not show. Save long notes or source lists
   to the workspace rather than the chat.
6. Cross-check high-stakes or surprising claims against an independent
   source. Search specifically for disconfirming evidence, changed guidance,
   competing definitions, and the strongest reasonable alternative
   explanation.
7. Synthesize at the narrowest level the evidence supports. Separate observed
   facts, source interpretations, calculations, and your inference. Preserve
   real conflicts instead of averaging them away.
8. Stop when the answer is supported for the requested scope, new searches
   are returning duplicates or lower-quality evidence, or the remaining
   uncertainty is explicit and decision-relevant. Do not browse for ceremony.

## Source priority

Use primary and authoritative sources first: original datasets, official
records, laws or standards, filings, papers, documentation, and direct
statements. Use high-quality secondary sources for context or when primary
evidence is unavailable. Treat advocacy, marketing, anonymous material, and
unsourced summaries as lower-confidence and disclose relevant incentives.

## Freshness

Check dates and version/revision history. Prefer current sources when facts
can change; use historical sources when the question is historical. State the
as-of date when freshness matters. Each user message carries its send time in
a `<sent_at>` tag — use it to judge recency rather than assuming today.

## Citations

Cite the source(s) supporting each material claim with a direct URL,
publisher/author, and date when available. Do not cite a homepage when a
specific page exists. Quote exactly only when wording matters, and
distinguish quotation from paraphrase.

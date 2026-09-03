# Corro brand

Seven lines converge on one point: many independent sources collapsing into a
single verified claim. Everything here follows from that.

The brand is deliberately monochrome. That is not minimalism for its own sake
— it is so that colour inside the product only ever means one thing, the
evidential status of a claim. An accent colour would compete with the only
signal the interface actually needs to carry.

---

## Files

```
logo/
  corro-mark.svg                 the mark, standard weight. Start here.
  corro-mark-hairline.svg        original hairline weight, for large format
  corro-mark-reduced.svg         5 rays, for 33-64px
  corro-mark-solid.svg           filled chevron, for 32px and below
  corro-wordmark.svg             CORRO, outlined
  corro-lockup-horizontal.svg    mark + wordmark, side by side
  corro-lockup-stacked.svg       mark above wordmark
icon/
  favicon.svg                    solid tier (favicons render at 16-32px)
  favicon.ico                    16/24/32/48/64/128/256, correct tier per size
  favicon-dark.ico               same, light-on-transparent
  icon-1024.png                  square, full-bleed, unrounded. App icon source.
  apple-touch-icon-180.png       opaque, unrounded (iOS masks it itself)
  maskable-512.png               PWA maskable, inside Android's safe circle
  maskable-512-dark.png
social/
  github-social-1280x640.png     GitHub social preview
  og-1200x630.png                OpenGraph / Twitter card
  *-dark.png                     dark variants of both
tokens/
  tokens.css                     CSS custom properties, light + dark
  tokens.json                    same values, for tooling
concepts/
  corro-mark-distill.svg         a proposal, not in use — see Open questions
src/                             generators; run `python src/build.py`
```

Every logo file uses `currentColor`. Set `color` on the parent and the logo
follows — there is no "black version" and "white version" to keep in sync.

The pre-existing `app/`, `svg/`, `symbol/` and `banner.png` are untouched.
They are superseded by the above; see Migration.

---

## The mark

### Construction

On a 1000 x 1000 grid. Seven rays converge on an apex at (500, 940), at
0, ±13.5, ±27 and ±40.5 degrees from vertical — an even 13.5° increment.
The three long rays (0, ±27) share a top line at y = 60; the short rays fill
the gaps between them, dropping 402.5 (±13.5) and 225.9 (±40.5) to the apex.

This is the original mark's geometry, preserved. What changed: the viewBox
gained ~4% optical padding (the original ran its outer rays into the exact
edge, leaving no safe area), and stroke weight is now tuned per size.

### Weight is not constant

A single stroke weight cannot serve a 16px favicon and a 2m trade-show
banner. Corro's mark uses four, chosen so its optical weight stays even
against the wordmark and against surrounding UI.

| Tier | Rays | Stroke | Use at |
|---|---|---|---|
| solid | filled chevron | — | 32px and below |
| reduced | 5 (drops ±40.5) | 52 | 33–64px |
| standard | 7 | 42 | 65px and up |
| hairline | 7 | 25 | mark ≥ 4× cap height, or large format |

The ±40.5 pair goes first in the reduced tier because its gap to the ±27 ray
closes before any other pair's does.

Below 33px the hairline collapses: at 16px a stroke of 25/1000 is 0.4px, and
the four inner rays disappear entirely. Use the solid tier and do not
improvise a thinner one.

### Clear space and minimum size

Clear space on all four sides is **25% of the mark's height**. For the
lockups, measure from the outermost ink, not the viewBox.

- Mark alone: 16px minimum (solid tier).
- Horizontal lockup: 140px wide minimum.
- Stacked lockup: 120px wide minimum.
- Never set the wordmark below a 12px cap height.

### Don't

- Don't recolour the mark and wordmark differently within a lockup.
- Don't rebuild the lockups by eye — use the SVGs, the gaps are specified.
- Don't add a rounded-rectangle or circle container. The app icons are
  full-bleed on purpose; every platform applies its own mask.
- Don't rotate the mark. It has a fixed reading direction.
- Don't apply the hairline weight below 200px.

---

## Colour

Brand is ink on paper. Colour is reserved for evidence.

| Role | Light | Dark | Contrast |
|---|---|---|---|
| Paper / background | `#FAFAF7` | `#0E1315` | — |
| Ink / text | `#121A1D` | `#FAFAF7` | 17.2 / 18.0 |
| Corroborated | `#0B6E4F` | `#34D399` | 6.4 / 9.5 |
| Partially supported | `#9A6212` | `#F0B429` | 5.0 / 9.8 |
| Contradicted | `#B3261E` | `#F87171` | 6.4 / 6.5 |
| Unsourced | `#6B7280` | `#9CA3AF` | 4.7 / 7.2 |
| Citation / source link | `#1D4ED8` | `#60A5FA` | 6.6 / 7.1 |

All pass WCAG AA for normal text against their own background. Paired
background tints for badges and highlighted spans are in `tokens/`.

Paper is a warm off-white rather than `#FFFFFF`: this is a product people
read long source excerpts in, and pure white is fatiguing at length.

Never encode evidential status by colour alone — pair it with a label, an
icon or a shape. Roughly 1 in 12 men cannot separate the corroborated and
contradicted hues.

---

## Typography

| Role | Face | Why |
|---|---|---|
| Display / wordmark | Poppins | matches the drawn wordmark |
| UI | Inter | the workhorse |
| Reading | Source Serif 4 | quoted source material, set long |
| Mono | JetBrains Mono | citation keys, character offsets, spans |

The mono is not optional. A source-checking product constantly renders
identifiers, offsets and quoted spans that must not reflow ambiguously.

The wordmark is outlined in `corro-wordmark.svg`, so Poppins is not needed to
render the logo — only to set headings that echo it.

---

## Icons

| Target | File | Notes |
|---|---|---|
| Tauri / desktop | `icon/icon-1024.png` | feed to `tauri icon`; square, unrounded |
| Web favicon | `favicon.svg` + `favicon.ico` | ship both; SVG for modern, ICO for the rest |
| iOS home screen | `apple-touch-icon-180.png` | opaque, unrounded — iOS applies the squircle |
| PWA maskable | `maskable-512.png` | content sits inside the 80% safe circle |

macOS `.icns` wants roughly 10% more padding than `icon-1024.png` carries,
because Apple's grid insets the artwork inside the squircle. Generate it from
a padded copy rather than from this file directly.

---

## Migration

The files under `app/`, `svg/` and `symbol/` are superseded:

| Old | Replace with | Why |
|---|---|---|
| `app/icon_*.png`, `app/icon_*.ico` | `icon/` | the old set has a squircle baked into the bitmap, which is wrong for every platform except Windows, and its 16–32px entries render as a grey smudge |
| `svg/logo_black.svg`, `logo_white.svg` | `logo/corro-mark.svg` | one `currentColor` file instead of two hardcoded ones |
| `symbol/logo_white.png` | `logo/corro-mark.svg` | shipped as white-on-transparent, i.e. invisible on anything light |
| `symbol/logo_black.png` | `logo/corro-mark.svg` | 256px raster of a vector mark |
| `banner.png` | `social/*` | portrait lockup on a landscape canvas, 67% dead space, and 1408×768 matches no platform |

Naming: the old `_black` / `_white` convention describes ink colour, which
breaks the moment someone needs "the logo for a dark background". The new
files describe the asset, and colour is a runtime concern.

---

## Open questions

These are flagged, not decided.

**The mark reads as a down arrow.** Before anyone decodes convergence, the
silhouette says *down* — decline, downvote. `concepts/corro-mark-distill.svg`
keeps the seven converging rays and adds a single heavier stroke below the
apex: sources in, one claim out. It reads as distillation rather than
descent. Worth testing before committing further.

**"Corro" may be taken in this namespace.** The corroborate association is
good. But `corro-` is already the crate prefix for Fly.io's Corrosion
project, which lives in the same developer tooling space as Corro's users,
and the nearest everyday English word is "corrode". Check the `.com` and run
a class 9/42 trademark search before investing further in the name.

**The tagline is the weakest asset.** "RESEARCH & SOURCE CHECKING AI"
describes the mechanism instead of the value, "source checking" reads
defensive, and "…AI" as a noun suffix already dates the product. Directions
to test: *Every claim, traced.* / *Answers with receipts.* / *Nothing without
a source.* No tagline is baked into any lockup, so this stays cheap to change.

**Voice is undefined.** For a verification product, brand voice *is* how the
agent expresses uncertainty. "I couldn't corroborate this" and "This may be
inaccurate" are different products. Worth writing down before the surface
area grows.

**The mark wants to be a loading state.** Seven rays drawing inward on
`stroke-dashoffset` while the agent retrieves, snapping to the apex when it
answers — with individual rays greying out where a source fails to
corroborate. It is a literal picture of what the product does, it is about
fifteen lines of CSS, and it would likely be the most memorable thing about
the brand. Not built.

---

## Regenerating

Everything except this file is generated:

```bash
python src/build.py
```

`src/wordmark.py` reconstructs the wordmark, whose letterforms were measured
off `banner.png` — the only place it previously existed. `src/mark.py` holds
the mark geometry and weights. `src/raster.py` rasterises from the same
numbers that produce the SVG paths, so the PNGs and the vectors cannot drift.

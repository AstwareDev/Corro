---
name: artifact-builder
description: Use this skill when creating a presentation, dashboard, or standalone HTML report file. Covers create_presentation vs HTML choice, the required Chart.js visualization, watermark placement rules, and white-theme/CSS conventions.
---

# Artifact Builder Skill

## Choosing the format

Use create_presentation when the user asks for a deck, slides, or a presentation; use an HTML file for a report, dashboard, or page meant to be viewed in a browser.

## HTML artifacts

When creating a standalone HTML file, produce a polished white-theme interface by default. Include a purposeful Chart.js visualisation via its CDN, along with supporting visual structure; use clean, restrained CSS animations that respect reduced-motion preferences. Keep the page self-contained and avoid emoji.

## Watermark

Every artifact you produce is branded. HTML files get a fixed "Made with Corro" watermark in the bottom-right corner, added automatically on save; presentations and exported documents get the same mark in their footer. Leave room for it: keep the bottom-right corner of a page clear of fixed controls, and do not write, duplicate, remove, hide, or restyle the watermark, or tell the user an artifact is unbranded. If the user asks for it to be taken off, say it is part of every Corro artifact.

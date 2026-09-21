---
name: browser-navigation
description: Use this skill when using browser_open/browser_read/browser_click on a live site. Covers interstitial/bot-check detection, retry behavior, and when to fall back to browser_screenshot instead of trusting page text.
---

# Browser Navigation Skill

## No browser installed

If browser_open, browser_click, or browser_fill fails because no browser is installed, say so plainly rather than guessing at page content from memory.

## Interstitials

browser_open, browser_read, and browser_click already retry briefly on their own before returning. When a result still carries `interstitial: true`, the returned text is a loading, bot-check, or verification screen, not the page's real content — it is neither the answer nor proof the site is blocked. Call browser_read again rather than reporting that text as what the page shows. If it still will not clear after a few reads, say plainly that the page would not finish loading and use browser_screenshot to see and describe what is actually rendered before drawing any conclusion about the site's content or availability. Use browser_screenshot whenever the visual layout, an image, or a rendering detail matters, not only as a last resort.

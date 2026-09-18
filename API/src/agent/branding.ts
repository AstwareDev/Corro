export const BRAND_NAME = 'Corro'
export const WATERMARK_LABEL = 'Made with Corro'

export const WATERMARK_MARKER = 'data-corro-watermark'

const RAYS = [
  'M500 60L500 940',
  'M948.4 60L500 940',
  'M51.6 60L500 940',
  'M596.6 537.5L500 940',
  'M403.4 537.5L500 940',
  'M692.9 714.1L500 940',
  'M307.1 714.1L500 940',
].join('')

export const CORRO_MARK_SVG =
  '<svg viewBox="0 0 1000 1000" fill="none" aria-hidden="true" focusable="false">' +
  `<path stroke="currentColor" stroke-width="64" stroke-linecap="round" d="${RAYS}"/>` +
  '</svg>'

const WATERMARK_HTML = `
<div ${WATERMARK_MARKER} role="contentinfo" aria-label="${WATERMARK_LABEL}">
  <span ${WATERMARK_MARKER}-mark>${CORRO_MARK_SVG}</span>
  <span>${WATERMARK_LABEL}</span>
</div>
<style ${WATERMARK_MARKER}-style>
  [${WATERMARK_MARKER}] {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.82);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    color: #1a1a2e;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0.01em;
    pointer-events: none;
    user-select: none;
  }
  [${WATERMARK_MARKER}-mark] {
    display: block;
    width: 13px;
    height: 13px;
    color: #4a47a3;
  }
  [${WATERMARK_MARKER}-mark] svg { display: block; width: 100%; height: 100%; }
  @media print {
    [${WATERMARK_MARKER}] {
      position: static;
      float: right;
      background: none;
      box-shadow: none;
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
</style>
`

export function hasHtmlWatermark(html: string): boolean {
  return html.includes(WATERMARK_MARKER)
}

export function isHtmlPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase()
  return lower.endsWith('.html') || lower.endsWith('.htm')
}

export function applyHtmlWatermark(html: string): string {
  if (hasHtmlWatermark(html)) return html
  if (!html.trim()) return html

  const closingBody = html.toLowerCase().lastIndexOf('</body>')
  if (closingBody !== -1) {
    return html.slice(0, closingBody) + WATERMARK_HTML + html.slice(closingBody)
  }
  const closingHtml = html.toLowerCase().lastIndexOf('</html>')
  if (closingHtml !== -1) {
    return html.slice(0, closingHtml) + WATERMARK_HTML + html.slice(closingHtml)
  }
  return `${html.replace(/\s+$/, '')}\n${WATERMARK_HTML}`
}

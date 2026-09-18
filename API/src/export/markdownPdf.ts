import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { marked } from 'marked'
import { WATERMARK_LABEL } from '../agent/branding.js'
import { launchBrowser } from '../agent/tools/browser/session.js'

const STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; line-height: 1.6; font-size: 14px; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.3; margin: 1.4em 0 0.5em; }
  h1 { font-size: 26px; } h2 { font-size: 21px; } h3 { font-size: 17px; }
  p, ul, ol, blockquote { margin: 0.6em 0; }
  code { font-family: "SF Mono", Consolas, monospace; background: #f2f2f2; border-radius: 4px; padding: 0.15em 0.35em; font-size: 0.9em; }
  pre { background: #f2f2f2; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d0d0d0; margin-left: 0; padding-left: 1em; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  a { color: #2563eb; }
`

function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|link|meta|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s"'>]+/gi, '')
    .replace(/(href|src)\s*=\s*"\s*(javascript|vbscript|data:text\/html)[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*(javascript|vbscript|data:text\/html)[^']*'/gi, "$1='#'")
}

function isBlockedIp(address: string, family: number): boolean {
  if (family === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  const lower = address.toLowerCase()
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    if (isIP(v4) === 4) return isBlockedIp(v4, 4)
  }
  return lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])

async function isBlockedDestination(urlString: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return true
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return false
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true

  const hostname = url.hostname
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) return true

  const literalFamily = isIP(hostname)
  if (literalFamily) return isBlockedIp(hostname, literalFamily)

  try {
    const { address, family } = await lookup(hostname)
    return isBlockedIp(address, family)
  } catch {
    return true
  }
}

export async function renderMarkdownPdf(markdown: string): Promise<Buffer> {
  const body = sanitizeHtml(await marked.parse(markdown))
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`

  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.route('**/*', async (route) => {
      if (await isBlockedDestination(route.request().url())) {
        await route.abort()
      } else {
        await route.continue()
      }
    })
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;padding:0 18mm;font-family:Helvetica,Arial,sans-serif;' +
        `font-size:8px;color:#9a99b8;text-align:right;">${WATERMARK_LABEL}</div>`,
    })
    return pdf
  } finally {
    await browser.close().catch(() => {})
  }
}

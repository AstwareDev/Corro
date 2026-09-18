import { marked, type Token, type Tokens } from 'marked'
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { WATERMARK_LABEL } from '../agent/branding.js'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

const CODE_FONT = 'Consolas'

function inlineRuns(tokens: Token[], style: { bold?: boolean; italics?: boolean } = {}): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = []
  for (const t of tokens) {
    if (t.type === 'text' || t.type === 'escape') {
      runs.push(new TextRun({ text: (t as Tokens.Text).text, ...style }))
    } else if (t.type === 'strong') {
      runs.push(...inlineRuns((t as Tokens.Strong).tokens, { ...style, bold: true }))
    } else if (t.type === 'em') {
      runs.push(...inlineRuns((t as Tokens.Em).tokens, { ...style, italics: true }))
    } else if (t.type === 'codespan') {
      runs.push(new TextRun({ text: (t as Tokens.Codespan).text, font: CODE_FONT, shading: { fill: 'F2F2F2' } }))
    } else if (t.type === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (t.type === 'link') {
      const link = t as Tokens.Link
      runs.push(
        new ExternalHyperlink({
          link: link.href,
          children: [new TextRun({ text: link.text, style: 'Hyperlink' })],
        })
      )
    } else if ('text' in t && typeof (t as { text?: unknown }).text === 'string') {
      runs.push(new TextRun({ text: (t as { text: string }).text, ...style }))
    }
  }
  return runs
}

function codeParagraph(text: string, indent = 0): Paragraph {
  const lines = text.split('\n')
  const runs = lines.flatMap((line, i) =>
    i === 0
      ? [new TextRun({ text: line, font: CODE_FONT })]
      : [new TextRun({ text: line, font: CODE_FONT, break: 1 })]
  )
  return new Paragraph({
    children: runs,
    shading: { fill: 'F2F2F2' },
    spacing: { before: 120, after: 120 },
    ...(indent ? { indent: { left: indent * 360 } } : {}),
  })
}

function blockToParagraphs(token: Token, indent = 0): Paragraph[] {
  const indentOpt = indent ? { indent: { left: indent * 360 } } : {}

  if (token.type === 'heading') {
    const h = token as Tokens.Heading
    return [new Paragraph({ heading: HEADING_LEVELS[h.depth - 1] ?? HeadingLevel.HEADING_6, children: inlineRuns(h.tokens) })]
  }
  if (token.type === 'paragraph') {
    const p = token as Tokens.Paragraph
    return [new Paragraph({ children: inlineRuns(p.tokens), spacing: { after: 160 }, ...indentOpt })]
  }
  if (token.type === 'code') {
    return [codeParagraph((token as Tokens.Code).text, indent)]
  }
  if (token.type === 'blockquote') {
    const bq = token as Tokens.Blockquote
    const out: Paragraph[] = []
    for (const inner of bq.tokens) {
      if (inner.type === 'paragraph') {
        out.push(
          new Paragraph({
            children: inlineRuns((inner as Tokens.Paragraph).tokens, { italics: true }),
            indent: { left: (indent + 1) * 360 },
            spacing: { after: 160 },
          })
        )
      } else {
        out.push(...blockToParagraphs(inner, indent + 1))
      }
    }
    return out
  }
  if (token.type === 'list') {
    const list = token as Tokens.List
    const itemIndent = indent + 1
    const out: Paragraph[] = []
    list.items.forEach((item, i) => {
      const prefix = list.ordered ? `${Number(list.start || 1) + i}. ` : '•  '
      const itemTokens: Token[] = item.tokens.length ? item.tokens : [{ type: 'text', raw: item.raw, text: item.text } as Token]
      let markerUsed = false
      for (const t of itemTokens) {
        if (!markerUsed && (t.type === 'text' || t.type === 'paragraph') && 'tokens' in t && t.tokens) {
          out.push(
            new Paragraph({
              children: [new TextRun({ text: prefix }), ...inlineRuns(t.tokens as Token[])],
              indent: { left: itemIndent * 360 },
              spacing: { after: 60 },
            })
          )
          markerUsed = true
        } else {
          out.push(...blockToParagraphs(t, itemIndent))
        }
      }
      if (!markerUsed) {
        out.push(
          new Paragraph({
            children: [new TextRun({ text: prefix })],
            indent: { left: itemIndent * 360 },
            spacing: { after: 60 },
          })
        )
      }
    })
    return out
  }
  if (token.type === 'hr') {
    return [new Paragraph({ border: { bottom: { style: 'single', size: 6, color: 'CCCCCC' } }, spacing: { after: 200 } })]
  }
  if (token.type === 'space') return []

  if ('raw' in token && typeof token.raw === 'string' && token.raw.trim()) {
    return [new Paragraph({ children: [new TextRun({ text: token.raw.trim() })] })]
  }
  return []
}

export async function renderMarkdownDocx(markdown: string): Promise<Buffer> {
  const tokens = marked.lexer(markdown)
  const paragraphs = tokens.flatMap((t) => blockToParagraphs(t))

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: WATERMARK_LABEL, size: 16, color: '9A99B8' })],
      }),
    ],
  })

  const doc = new Document({
    sections: [
      {
        footers: { default: footer },
        children: paragraphs.length ? paragraphs : [new Paragraph({})],
      },
    ],
  })

  return Packer.toBuffer(doc)
}

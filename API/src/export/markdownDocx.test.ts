import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import JSZip from 'jszip'
import { renderMarkdownDocx } from './markdownDocx.js'

async function documentXml(markdown: string): Promise<string> {
  const buffer = await renderMarkdownDocx(markdown)
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  assert.ok(xml, 'expected word/document.xml to exist')
  return xml
}

function paragraphTexts(xml: string): string[] {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
  return paragraphs.map((p) => Array.from(p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)).map((m) => m[1]).join(''))
}

function paragraphIndents(xml: string): (string | undefined)[] {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []
  return paragraphs.map((p) => p.match(/<w:ind[^>]*w:left="(\d+)"/)?.[1])
}

describe('renderMarkdownDocx list handling', () => {
  it('recurses into nested lists, prefixing each item with its own marker', async () => {
    const xml = await documentXml('- outer item\n  - inner item\n')
    const texts = paragraphTexts(xml)
    assert.ok(texts.some((t) => t.includes('•') && t.includes('outer item')))
    assert.ok(texts.some((t) => t.includes('•') && t.includes('inner item')))
  })

  it('increases indentation for nested list items relative to their parent', async () => {
    const xml = await documentXml('- outer item\n  - inner item\n')
    const indents = paragraphIndents(xml).map((i) => (i ? Number(i) : undefined))
    const outerIdx = paragraphTexts(xml).findIndex((t) => t.includes('outer item'))
    const innerIdx = paragraphTexts(xml).findIndex((t) => t.includes('inner item'))
    assert.ok(outerIdx >= 0 && innerIdx >= 0)
    assert.ok((indents[innerIdx] ?? 0) > (indents[outerIdx] ?? 0))
  })

  it('renders fenced code inside a list item as a separate indented paragraph', async () => {
    const markdown = '- item with code\n\n  ```\n  const x = 1\n  ```\n'
    const xml = await documentXml(markdown)
    const texts = paragraphTexts(xml)
    assert.ok(texts.some((t) => t.includes('item with code')))
    assert.ok(texts.some((t) => t.includes('const x = 1')))

    const codeIdx = texts.findIndex((t) => t.includes('const x = 1'))
    const itemIdx = texts.findIndex((t) => t.includes('item with code'))
    const indents = paragraphIndents(xml).map((i) => (i ? Number(i) : 0))
    assert.equal(indents[codeIdx], indents[itemIdx])
  })

  it('keeps ordered list markers correct across nested unordered sub-items', async () => {
    const markdown = '1. first\n   - sub a\n   - sub b\n2. second\n'
    const xml = await documentXml(markdown)
    const texts = paragraphTexts(xml)
    assert.ok(texts.some((t) => t.startsWith('1. ') && t.includes('first')))
    assert.ok(texts.some((t) => t.startsWith('2. ') && t.includes('second')))
    assert.ok(texts.some((t) => t.includes('•') && t.includes('sub a')))
    assert.ok(texts.some((t) => t.includes('•') && t.includes('sub b')))
  })
})

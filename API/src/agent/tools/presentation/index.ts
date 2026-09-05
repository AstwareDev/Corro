import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { saveBinary } from '../fs/storage.js'
import { resolveInside, toRelative, viewUrl, WorkspaceError } from '../fs/workspace.js'

const MAX_SLIDES = 60

const slideSchema = z.object({
  title: z.string().max(200).optional().describe('Slide heading. Omit for an image-only or divider slide.'),
  bullets: z.array(z.string().max(500)).max(12).optional().describe('Bullet points, in order.'),
  text: z.string().max(2000).optional().describe('A paragraph of body text, instead of or in addition to bullets.'),
  imagePath: z.string().optional().describe('Workspace-relative path to an image already in the workspace, e.g. from browser_screenshot.'),
  notes: z.string().max(2000).optional().describe('Speaker notes, not shown on the slide itself.'),
})

function fail(err: unknown) {
  return {
    ok: false as const,
    error: err instanceof WorkspaceError || err instanceof Error ? err.message : 'Could not build the presentation',
  }
}

export function createPresentationTools(workspace: string) {
  const create_presentation = tool({
    description: 'Building a presentation',
    inputSchema: z.object({
      description: toolDescription,
      path: z.string().min(1).describe('Workspace-relative .pptx path to save to, e.g. "reports/q3-review.pptx"'),
      title: z.string().max(200).describe('Presentation title, used on the title slide.'),
      subtitle: z.string().max(300).optional(),
      slides: z.array(slideSchema).min(1).max(MAX_SLIDES).describe('Content slides, after the title slide.'),
      expectedRevision: z.string().nullable().optional().describe('Revision from a prior create_presentation/fs_read call, when replacing an existing deck; null requires a new file.'),
    }),
    execute: async ({ path: rel, title, subtitle, slides, expectedRevision }) => {
      try {
        if (!rel.toLowerCase().endsWith('.pptx')) return { ok: false as const, error: 'path must end in .pptx' }

        const PptxGenJS = (await import('pptxgenjs')).default
        const pptx = new PptxGenJS()
        pptx.layout = 'LAYOUT_16x9'
        pptx.title = title

        const TITLE_COLOR = '1A1A2E'
        const BODY_COLOR = '333333'
        const ACCENT = '4A47A3'

        const cover = pptx.addSlide()
        cover.background = { color: 'FFFFFF' }
        cover.addShape('rect', { x: 0, y: 0, w: 0.15, h: 5.63, fill: { color: ACCENT } })
        cover.addText(title, { x: 0.6, y: 2.2, w: 8.8, h: 1.4, fontSize: 36, bold: true, color: TITLE_COLOR, fontFace: 'Arial' })
        if (subtitle) {
          cover.addText(subtitle, { x: 0.6, y: 3.5, w: 8.8, h: 0.8, fontSize: 18, color: BODY_COLOR, fontFace: 'Arial' })
        }

        for (const slide of slides) {
          const s = pptx.addSlide()
          s.background = { color: 'FFFFFF' }
          let y = 0.5
          if (slide.title) {
            s.addText(slide.title, { x: 0.5, y, w: 9, h: 0.8, fontSize: 26, bold: true, color: TITLE_COLOR, fontFace: 'Arial' })
            y += 1.0
          }
          if (slide.imagePath) {
            const full = resolveInside(workspace, slide.imagePath)
            s.addImage({ path: full, x: 0.5, y, w: 9, h: 4.5 - y, sizing: { type: 'contain', w: 9, h: 4.5 - y } })
          } else {
            if (slide.bullets?.length) {
              s.addText(
                slide.bullets.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
                { x: 0.5, y, w: 9, h: 4.5 - y, fontSize: 18, color: BODY_COLOR, fontFace: 'Arial', valign: 'top' }
              )
            } else if (slide.text) {
              s.addText(slide.text, { x: 0.5, y, w: 9, h: 4.5 - y, fontSize: 18, color: BODY_COLOR, fontFace: 'Arial', valign: 'top' })
            }
          }
          if (slide.notes) s.addNotes(slide.notes)
        }

        const output = await pptx.write({ outputType: 'nodebuffer' })
        const buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as Uint8Array)

        const full = resolveInside(workspace, rel)
        const receipt = saveBinary(full, buffer, expectedRevision)
        const relPath = toRelative(workspace, full)
        return { ok: true as const, path: relPath, slideCount: slides.length + 1, ...receipt, viewUrl: viewUrl(workspace, relPath) }
      } catch (err) {
        return fail(err)
      }
    },
  })

  return { create_presentation }
}

export type PresentationToolName = keyof ReturnType<typeof createPresentationTools>
export const PRESENTATION_TOOL_NAMES: PresentationToolName[] = ['create_presentation']

import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure, yerevanCity } from './client.js'
import { image, languageInput } from './shape.js'

interface Row {
  id: number
  name?: string | null
  itemCount?: number
  photo?: string | null
  isAdult?: boolean
  isHidden?: boolean
}

interface Data {
  categories?: Row[] | null
  parentCategory?: { categoryId?: number; categoryName?: string | null } | null
}

export const yerevanCityCategories = tool({
  description:
    "Browse Yerevan City's category tree — the aisles of the shop, with how many products each holds. " +
    'Call it without a parent for the top level, then with a category id to walk down. ' +
    'Use it to get a categoryId for yerevan_city_search when a query alone is too broad ' +
    '("cheese", "wine") or when the user wants to see what a section contains.',
  inputSchema: z.object({
    description: toolDescription,
    parentId: z
      .number()
      .int()
      .optional()
      .describe('Category to list the children of. Omit for the top-level categories.'),
    language: z
      .enum(languageInput)
      .default('en')
      .describe('Language for category names. Untranslated sections come back in Armenian.'),
    includeImages: z.boolean().default(false).describe('Include a category thumbnail URL.'),
  }),
  execute: async ({ parentId, language, includeImages }) => {
    const [path, body] =
      parentId === undefined
        ? (['/Category/GetParentCategories', {}] as const)
        : (['/Category/GetCategory', { parentId }] as const)

    try {
      const data = await yerevanCity<Data>(path, { method: 'POST', body, language })

      const categories = (data.categories ?? [])
        .filter((row) => !row.isHidden)
        
        .filter((row) => row.id !== parentId)
        .map((row) => ({
          id: row.id,
          name: (row.name ?? '').trim(),
          ...(row.itemCount ? { productCount: row.itemCount } : {}),
          ...(row.isAdult ? { ageRestricted: true } : {}),
          ...(includeImages && image(row.photo, 250) ? { image: image(row.photo, 250) } : {}),
        }))

      return {
        ok: true as const,
        ...(parentId === undefined ? {} : { parentId }),
        level: parentId === undefined ? ('top' as const) : ('children' as const),
        categories,
      }
    } catch (err) {
      return failure(err)
    }
  },
})

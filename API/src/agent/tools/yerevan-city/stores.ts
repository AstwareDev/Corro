import { tool } from 'ai'
import { z } from 'zod'
import { toolDescription } from '../description.js'
import { failure, yerevanCity, type Language } from './client.js'
import { languageInput } from './shape.js'
import { mapsUrl, sortByDistance, validateNear } from '../shops/geo.js'

interface StoreRow {
  name?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  startTime?: string | null
  endTime?: string | null
  phoneNumber?: string | null
  isInMall?: boolean | null
  isBakery?: boolean | null
}

interface StoresData {
  stores?: StoreRow[] | null
}

function hoursOf(row: StoreRow): string | undefined {
  const from = (row.startTime ?? '').slice(0, 5)
  const to = (row.endTime ?? '').slice(0, 5)
  if (!from || !to) return undefined
  if (from === '00:00' && to === '00:00') return '24 hours'
  if (from === to) return from
  return `${from}–${to}`
}

export const yerevanCityStores = tool({
  description:
    'Yerevan City supermarket locations (yerevan-city.am) — every branch with its address, opening ' +
    'hours and GPS coordinates. Give nearLat + nearLon (the user, Corro, or any place) to get the ' +
    'nearest branches first with distances in km; omit them to list branches, optionally filtered ' +
    'by a street or town. Use it for "nearest Yerevan City", "which branch is open", or where to shop in person.',
  inputSchema: z.object({
    description: toolDescription,
    language: z
      .enum(languageInput)
      .default('en')
      .describe('Language for the request. Branch names and addresses come back as the shop lists them.'),
    query: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Filter branches by street, district or town, e.g. "Komitas", "Gyumri", "Vanadzor". Omit for all.'),
    nearLat: z.number().min(-90).max(90).optional().describe('Latitude to measure from, e.g. 40.1776.'),
    nearLon: z.number().min(-180).max(180).optional().describe('Longitude to measure from, e.g. 44.5126.'),
    maxResults: z.number().int().min(1).max(100).default(10).describe('Branches to return.'),
  }),
  execute: async ({ language, query, nearLat, nearLon, maxResults }) => {
    const near = validateNear(nearLat, nearLon)
    if (!near.ok) return { ok: false as const, error: near.error }

    try {
      const data = await yerevanCity<StoresData>('/Store/GetAllWeb', { language: language as Language })
      const rows = (data.stores ?? []).filter(
        (r) => typeof r.lat === 'number' && typeof r.lng === 'number' && (r.name || r.address)
      )

      const q = query?.trim().toLowerCase()
      const matching = q
        ? rows.filter((r) => `${r.name ?? ''} ${r.address ?? ''}`.toLowerCase().includes(q))
        : rows

      const shaped = matching.map((r) => ({
        name: (r.name ?? '').trim(),
        address: (r.address ?? '').trim(),
        lat: r.lat as number,
        lon: r.lng as number,
        ...(hoursOf(r) ? { hours: hoursOf(r) } : {}),
        ...(r.phoneNumber?.trim() ? { phone: r.phoneNumber.trim() } : {}),
        ...(r.isInMall ? { inMall: true } : {}),
        mapsUrl: mapsUrl(r.lat as number, r.lng as number),
      }))

      const stores = sortByDistance(shaped, near.near, maxResults)

      return {
        ok: true as const,
        shop: 'Yerevan City',
        site: 'https://yerevan-city.am/shop/shops',
        totalBranches: rows.length,
        ...(q ? { query } : {}),
        ...(near.near ? { near: near.near } : {}),
        branches: stores,
      }
    } catch (err) {
      return failure(err)
    }
  },
})

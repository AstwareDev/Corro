import { squeeze, truncate } from '../tavily/compact.js'
import { LANGUAGE_IDS, MEDIA_HOST, SITE_URL, type Language } from './client.js'


export function amount(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : (value as number)
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.round(n * 100) / 100
}

export function productUrl(id: number): string {
  return `${SITE_URL}/shop/product-details/${id}`
}






export function image(photo: string | null | undefined, size?: number): string | undefined {
  if (!photo) return undefined
  if (!size) return photo
  return `${photo.replace(/\/+$/, '')}/${size}/${size}/false`
}

export function isMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_HOST)
}

export interface Named {
  name?: string | null
  nameEn?: string | null
  nameRu?: string | null
  nameArm?: string | null
}







export function pickName(row: Named, language: Language): string {
  const byLanguage: Record<Language, Array<string | null | undefined>> = {
    en: [row.nameEn, row.nameRu, row.nameArm],
    ru: [row.nameRu, row.nameEn, row.nameArm],
    hy: [row.nameArm, row.nameEn, row.nameRu],
  }
  const chosen = byLanguage[language].find((n) => n && n.trim())
  return squeeze(chosen ?? row.name ?? '').slice(0, 200)
}

export interface Discount {
  discountPercent?: number
  wasPrice?: number
}






export function pricing(row: { price?: unknown; discountedPrice?: unknown; discountPercent?: unknown }): {
  price?: number
  currency: 'AMD'
} & Discount {
  const listed = amount(row.price)
  const discounted = amount(row.discountedPrice)
  const onOffer = discounted !== undefined && discounted > 0 && discounted !== listed

  const percent = amount(row.discountPercent)
  const derived =
    listed && discounted && listed > 0 ? Math.round(((listed - discounted) / listed) * 100) : undefined

  return {
    price: onOffer ? discounted : listed,
    currency: 'AMD',
    ...(onOffer ? { wasPrice: listed, discountPercent: percent || derived } : {}),
  }
}

export function text(value: string | null | undefined, maxChars: number): string | undefined {
  const cleaned = squeeze(value)
  return cleaned ? truncate(cleaned, maxChars) : undefined
}

export const languageInput = ['en', 'ru', 'hy'] as const satisfies readonly (keyof typeof LANGUAGE_IDS)[]

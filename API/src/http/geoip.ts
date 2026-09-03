import type { Request } from 'express'

export interface GeoLocation {
  ip: string
  countryCode: string
  city?: string
  
  subdivision?: string
  timezone?: string
}

const HIT_TTL_MS = 60 * 60 * 1000
const MISS_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expires: number; value: GeoLocation | null }>()





function isPublic(ip: string): boolean {
  if (ip === '::1' || ip === '127.0.0.1') return false
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(ip)) return false
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return false
  return true
}






export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  const candidate = (first?.trim() || req.socket.remoteAddress || '').replace(/^::ffff:/, '')
  const resolved = candidate && isPublic(candidate) ? candidate : undefined
  console.log('[geoip] client ip', {
    'x-forwarded-for': forwarded,
    'socket.remoteAddress': req.socket.remoteAddress,
    candidate,
    resolved,
  })
  return resolved
}

async function fetchGeo(ip: string): Promise<GeoLocation | null> {
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,regionName,city,timezone`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) {
      console.log('[geoip] ip-api http error', { ip, url, status: res.status })
      return null
    }
    const data = (await res.json()) as {
      status: string
      countryCode?: string
      regionName?: string
      city?: string
      timezone?: string
    }
    console.log('[geoip] ip-api response', { ip, url, data })
    if (data.status !== 'success' || !data.countryCode) return null
    return {
      ip,
      countryCode: data.countryCode.toUpperCase(),
      city: data.city || undefined,
      subdivision: data.regionName || undefined,
      timezone: data.timezone || undefined,
    }
  } catch (err) {
    console.log('[geoip] ip-api fetch failed', { ip, url, err: err instanceof Error ? err.message : err })
    return null
  }
}






export async function lookupGeo(req: Request): Promise<GeoLocation | undefined> {
  const ip = clientIp(req)
  if (!ip) {
    console.log('[geoip] no usable ip, skipping lookup')
    return undefined
  }

  const cached = cache.get(ip)
  if (cached && cached.expires > Date.now()) {
    console.log('[geoip] cache hit', { ip, value: cached.value })
    return cached.value ?? undefined
  }

  const value = await fetchGeo(ip)
  cache.set(ip, { value, expires: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS) })
  return value ?? undefined
}

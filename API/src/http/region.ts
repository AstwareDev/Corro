import type { Request } from 'express'
import { lookupGeo } from './geoip.js'

export const REGION_HEADER = 'x-corro-region'

export interface RegionContext {
  
  code: string
  name?: string
  source: 'header' | 'query' | 'proxy' | 'language' | 'geoip'
  
  city?: string
  subdivision?: string
  timezone?: string
}

const CODE_PATTERN = /^[a-z]{2}$/i





const LANGUAGE_REGION: Record<string, string> = { hy: 'AM', ka: 'GE', az: 'AZ' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function displayName(code: string): string | undefined {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code)
  } catch {
    return undefined
  }
}






function fromLanguage(header: string | undefined): string | undefined {
  if (!header) return undefined
  const tags = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean)

  for (const tag of tags) {
    const region = tag.split('-')[1]
    if (region && CODE_PATTERN.test(region)) return region.toUpperCase()
  }
  for (const tag of tags) {
    const mapped = LANGUAGE_REGION[(tag.split('-')[0] ?? '').toLowerCase()]
    if (mapped) return mapped
  }
  return undefined
}













export async function resolveRegion(req: Request): Promise<RegionContext | undefined> {
  const fromHeader = first(req.headers[REGION_HEADER])
  const fromQuery = typeof req.query.region === 'string' ? req.query.region : undefined
  const fromProxy = first(req.headers['cf-ipcountry'])
  const acceptLanguage = first(req.headers['accept-language'])

  const debug = {
    [REGION_HEADER]: fromHeader,
    '?region': fromQuery,
    'cf-ipcountry': fromProxy,
    'accept-language': acceptLanguage,
  }

  if (fromHeader && CODE_PATTERN.test(fromHeader)) {
    return logged(named(fromHeader, 'header'), debug)
  }

  if (fromQuery && CODE_PATTERN.test(fromQuery)) {
    return logged(named(fromQuery, 'query'), debug)
  }

  const geo = await lookupGeo(req)
  console.log('[region] geoip lookup result', { geo })
  if (geo) {
    const base = named(geo.countryCode, 'geoip')
    return logged({ ...base, city: geo.city, subdivision: geo.subdivision, timezone: geo.timezone }, debug)
  }

  
  if (fromProxy && CODE_PATTERN.test(fromProxy) && fromProxy.toUpperCase() !== 'XX') {
    return logged(named(fromProxy, 'proxy'), debug)
  }

  const fromLang = fromLanguage(acceptLanguage)
  return logged(fromLang ? named(fromLang, 'language') : undefined, debug)
}



function logged(region: RegionContext | undefined, signals: Record<string, string | undefined>): RegionContext | undefined {
  console.log('[region] resolved', { region, signals })
  return region
}

function named(code: string, source: RegionContext['source']): RegionContext {
  const upper = code.toUpperCase()
  const name = displayName(upper)
  return { code: upper, source, ...(name && name !== upper ? { name } : {}) }
}

import { createHash, randomUUID } from 'node:crypto'






const BASE_URL = (process.env.YEREVAN_CITY_BASE_URL ?? 'https://apishopv2.yerevan-city.am/api').replace(/\/+$/, '')


export const SITE_URL = 'https://yerevan-city.am'


export const MEDIA_HOST = 'https://media.yerevan-city.am'


export const LANGUAGE_IDS = { en: 1, ru: 2, hy: 3 } as const
export type Language = keyof typeof LANGUAGE_IDS













const GUEST_SALT = "cdq`gORT`hv1g45'78sGGweqeU7641Bell||{asd}}}a((d)a*&^a%$a#@!5!T2QWacc1HeySenyorita"
const OS_TYPE_WEB = 3

export class YerevanCityError extends Error {
  readonly status?: number

  constructor(message: string, opts: { status?: number } = {}) {
    super(message)
    this.name = 'YerevanCityError'
    this.status = opts.status
  }
}

interface Envelope<T> {
  success?: boolean
  data?: T
  messages?: Array<{ key?: number; value?: string | null }>
}






const baseDevice = process.env.YEREVAN_CITY_DEVICE_ID ?? randomUUID()
const tokens = new Map<Language, string>()
const pending = new Map<Language, Promise<string>>()

function guestKey(device: string): string {
  return createHash('md5').update(`${GUEST_SALT}${device}Web`).digest('hex')
}


function deviceFor(language: Language): string {
  return createHash('sha1')
    .update(`${baseDevice}:${language}`)
    .digest('hex')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5')
}

async function requestToken(language: Language): Promise<string> {
  const device = deviceFor(language)
  const raw = await call<{ token?: string }>('/Account/RegisterGuest', {
    method: 'POST',
    body: { deviceId: device, osType: OS_TYPE_WEB, key: guestKey(device) },
    language,
    device,
  })
  if (!raw?.token) throw new YerevanCityError('Yerevan City would not issue a guest token')

  
  
  await call<boolean>(`/Account/UpdateLanguage/${LANGUAGE_IDS[language]}`, {
    method: 'PUT',
    body: { language: LANGUAGE_IDS[language] },
    language,
    device,
    bearer: raw.token,
  }).catch(() => undefined)

  return raw.token
}

async function guestToken(language: Language): Promise<string> {
  const existing = tokens.get(language)
  if (existing) return existing

  
  let inflight = pending.get(language)
  if (!inflight) {
    inflight = requestToken(language)
      .then((t) => {
        tokens.set(language, t)
        return t
      })
      .finally(() => {
        pending.delete(language)
      })
    pending.set(language, inflight)
  }
  return inflight
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: Record<string, unknown>
  language?: Language
  bearer?: string
  device?: string
  timeoutMs?: number
}


function drop(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
}

async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const { method = 'GET', body, language = 'en', bearer, device, timeoutMs = 20_000 } = opts

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'content-language': String(LANGUAGE_IDS[language]),
        OsType: String(OS_TYPE_WEB),
        DeviceId: device ?? deviceFor(language),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      ...(body ? { body: JSON.stringify(drop(body)) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const reason = (err as Error).name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : (err as Error).message
    throw new YerevanCityError(`Yerevan City request ${reason}`)
  }

  if (!res.ok) {
    throw new YerevanCityError(`Yerevan City ${res.status}: ${res.statusText}`, { status: res.status })
  }

  const payload = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!payload || payload.success === false) {
    const detail = payload?.messages?.find((m) => m.value)?.value
    throw new YerevanCityError(`Yerevan City rejected the request${detail ? `: ${detail}` : ''}`)
  }
  return payload.data as T
}







export async function yerevanCity<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const language = opts.language ?? 'en'
  try {
    return await call<T>(path, { ...opts, bearer: await guestToken(language) })
  } catch (err) {
    if (!(err instanceof YerevanCityError) || err.status !== 401) throw err
    tokens.delete(language)
    return call<T>(path, { ...opts, bearer: await guestToken(language) })
  }
}

export function failure(err: unknown) {
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : 'Yerevan City request failed',
  }
}

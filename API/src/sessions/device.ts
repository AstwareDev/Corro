import { createHash, randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const DEVICE_HEADER = 'x-corro-device'
export const DEVICE_COOKIE = 'corro_device'

const ID_PATTERN = /^dev_[a-z0-9]{8,64}$/i
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5

export interface DeviceContext {
  id: string
  source: 'header' | 'cookie' | 'query' | 'fingerprint'
  fingerprinted: boolean
}

declare global {
  namespace Express {
    interface Request {
      device: DeviceContext
    }
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return undefined
}

function fingerprint(req: Request): string {
  const bits = [
    req.headers['user-agent'] ?? '',
    req.headers['accept-language'] ?? '',
    req.headers['sec-ch-ua-platform'] ?? '',
    req.ip ?? req.socket.remoteAddress ?? '',
  ].join('|')
  return 'dev_' + createHash('sha256').update(bits).digest('hex').slice(0, 24)
}

export function newDeviceId(): string {
  return 'dev_' + randomUUID().replace(/-/g, '')
}

export function isDeviceId(v: string): boolean {
  return ID_PATTERN.test(v)
}

export function resolveDevice(req: Request): DeviceContext {
  const header = req.headers[DEVICE_HEADER]
  const fromHeader = Array.isArray(header) ? header[0] : header
  if (fromHeader && isDeviceId(fromHeader)) {
    return { id: fromHeader, source: 'header', fingerprinted: false }
  }

  const fromCookie = readCookie(req.headers.cookie, DEVICE_COOKIE)
  if (fromCookie && isDeviceId(fromCookie)) {
    return { id: fromCookie, source: 'cookie', fingerprinted: false }
  }

  const fromQuery = typeof req.query.device === 'string' ? req.query.device : undefined
  if (fromQuery && isDeviceId(fromQuery)) {
    return { id: fromQuery, source: 'query', fingerprinted: false }
  }

  return { id: fingerprint(req), source: 'fingerprint', fingerprinted: true }
}

export function deviceMiddleware(req: Request, res: Response, next: NextFunction) {
  const device = resolveDevice(req)
  req.device = device
  res.setHeader('X-Corro-Device', device.id)
  if (device.source !== 'cookie') {
    res.setHeader(
      'Set-Cookie',
      `${DEVICE_COOKIE}=${device.id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax; HttpOnly`
    )
  }
  next()
}

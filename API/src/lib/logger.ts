import type { NextFunction, Request, Response } from 'express'

const isTTY = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

function paint(code: string) {
  return (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
}

export const c = {
  dim: paint('2'),
  bold: paint('1'),
  gray: paint('90'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
  white: paint('97'),
  bgRed: paint('41;97'),
}

const METHOD_COLOR: Record<string, (s: string) => string> = {
  GET: c.blue,
  POST: c.magenta,
  PATCH: c.yellow,
  DELETE: c.red,
  PUT: c.yellow,
  OPTIONS: c.gray,
}

function statusColor(status: number): (s: string) => string {
  if (status >= 500) return c.red
  if (status >= 400) return c.yellow
  if (status >= 300) return c.cyan
  return c.green
}

function durationColor(ms: number): (s: string) => string {
  if (ms >= 3000) return c.red
  if (ms >= 800) return c.yellow
  return c.green
}

function box(lines: string[]): string {
  const width = Math.max(...lines.map((l) => stripAnsi(l).length))
  const top = c.dim('┌' + '─'.repeat(width + 2) + '┐')
  const bottom = c.dim('└' + '─'.repeat(width + 2) + '┘')
  const body = lines.map((l) => {
    const pad = ' '.repeat(width - stripAnsi(l).length)
    return `${c.dim('│')} ${l}${pad} ${c.dim('│')}`
  })
  return [top, ...body, bottom].join('\n')
}

function stripAnsi(s: string): string {
  
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

export function printBanner(opts: {
  port: number
  models: string[]
  tools: string[]
  dataDir: string
}) {
  const title = `${c.bold(c.white('corro'))} ${c.dim('·')} ${c.cyan(`http://localhost:${opts.port}`)}`
  console.log()
  console.log(box([title]))
  console.log()
  console.log(`  ${c.dim('models')}   ${opts.models.join(c.dim(', '))}`)
  console.log(`  ${c.dim('tools')}    ${wrap(opts.tools, '           ')}`)
  console.log(`  ${c.dim('data')}     ${c.gray(opts.dataDir)}`)
  console.log()
  console.log(`  ${c.dim('try')}      ${c.gray(`curl -N -X POST localhost:${opts.port}/say -d "hello"`)}`)
  console.log()
}

function wrap(items: string[], indent: string, width = 70): string {
  const lines: string[] = []
  let line = ''
  for (const item of items) {
    const candidate = line ? `${line}, ${item}` : item
    if (candidate.length > width && line) {
      lines.push(line + ',')
      line = item
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.join(`\n${indent}`)
}


export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint()
  const method = req.method
  const path = req.path

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    const methodColor = METHOD_COLOR[method] ?? c.white
    const status = res.statusCode
    const stream = String(res.getHeader('Content-Type') ?? '').includes('event-stream')
    const device = req.device?.id ? c.dim(req.device.id.slice(0, 12)) : ''

    const parts = [
      c.dim(new Date().toLocaleTimeString('en-US', { hour12: false })),
      methodColor(method.padEnd(6)),
      path,
      statusColor(status)(String(status)),
      durationColor(ms)(`${ms.toFixed(0)}ms`),
      stream ? c.magenta('stream') : '',
      device,
    ].filter(Boolean)

    console.log(parts.join(' ' + c.dim('·') + ' '))
  })

  next()
}


export function logError(err: unknown, req: Request) {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined

  console.log()
  console.log(c.bgRed(` ✕ ${req.method} ${req.path} `))
  console.log(c.red(message))
  if (stack) {
    console.log(
      c.dim(
        stack
          .split('\n')
          .slice(1)
          .map((l) => `  ${l.trim()}`)
          .join('\n')
      )
    )
  }
  console.log()
}

import { Strings } from 'cafe-utility'
import { IncomingMessage, Server, ServerResponse } from 'http'
import { SUPPORTED_LEVELS, SupportedLevels, logLevel } from './config'

const threshold = SUPPORTED_LEVELS.indexOf(logLevel as SupportedLevels)

function log(level: number, message: string, meta?: unknown): void {
  if (level > threshold) {
    return
  }
  let line = `time="${new Date().toISOString()}" level="${SUPPORTED_LEVELS[level]}" msg="${message}"`
  if (meta !== undefined && meta !== null) {
    line += ` ${typeof meta === 'object' ? Strings.represent(meta, 'key-value') : `meta=${JSON.stringify(meta)}`}`
  }
  if (meta instanceof Error) {
    line += ` stack=${JSON.stringify(meta.stack)}`
  }
  process.stdout.write(line.replace(/\n/g, '\\n') + '\n')
}

export const logger = {
  critical: (message: string, meta?: unknown) => log(0, message, meta),
  error: (message: string, meta?: unknown) => log(1, message, meta),
  warn: (message: string, meta?: unknown) => log(2, message, meta),
  info: (message: string, meta?: unknown) => log(3, message, meta),
  verbose: (message: string, meta?: unknown) => log(4, message, meta),
  debug: (message: string, meta?: unknown) => log(5, message, meta),
}

logger.info(`log level=${logLevel}`)

export function subscribeLogServerRequests(server: Server): void {
  if (threshold < 5) {
    return
  }
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const start = performance.now()
    res.on('close', () => {
      logger.debug('api access', {
        duration: ((performance.now() - start) / 1000).toFixed(9),
        ip: req.socket.remoteAddress,
        method: req.method,
        size: req.headers['content-length'] ?? '0',
        status: res.statusCode,
        uri: req.url,
        'user-agent': req.headers['user-agent'],
      })
    })
  })
}

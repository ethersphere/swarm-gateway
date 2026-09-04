import { Dates, Types } from 'cafe-utility'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { Request, Response } from 'express'
import { AppConfig, DEFAULT_HOSTNAME } from '../config'
import { logger } from '../logger'
import { ModeratorIdentity } from './credentials'

const COOKIE_NAME = 'moderationSession'
const SESSION_DURATION_MS = Dates.hours(12)

// Sessions do not survive a restart when SESSION_SECRET is unset; server.ts warns about it.
const ephemeralSecret = randomBytes(32).toString('hex')

function getSecret(config: AppConfig): string {
  return config.sessionSecret || ephemeralSecret
}

function sign(body: string, config: AppConfig): string {
  return createHmac('sha256', getSecret(config)).update(body).digest('base64url')
}

export function createSessionCookie(res: Response, identity: ModeratorIdentity, config: AppConfig): void {
  const body = Buffer.from(
    JSON.stringify({ ...identity, expiresAt: Date.now() + SESSION_DURATION_MS }),
    'utf8',
  ).toString('base64url')

  res.cookie(COOKIE_NAME, `${body}.${sign(body, config)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.hostname !== DEFAULT_HOSTNAME,
    path: '/',
    maxAge: SESSION_DURATION_MS,
  })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function readSession(req: Request, config: AppConfig): ModeratorIdentity | null {
  const raw = readCookie(req, COOKIE_NAME)
  if (!raw) {
    return null
  }

  const [body, signature] = raw.split('.')
  if (!body || !signature) {
    return null
  }

  const expected = Buffer.from(sign(body, config), 'utf8')
  const actual = Buffer.from(signature, 'utf8')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    const payload = Types.asObject(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')))
    if (Types.asNumber(payload.expiresAt) < Date.now()) {
      return null
    }
    return { user: Types.asString(payload.user) }
  } catch (error) {
    logger.error('failed to read moderation session', error)
    return null
  }
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim())
    }
  }
  return null
}

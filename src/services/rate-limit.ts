import { Dates } from 'cafe-utility'
import { logger } from '../logger'

const FAILURES_BEFORE_BAN = 5
const FAILURE_WINDOW = Dates.minutes(15)
const FIRST_BAN = Dates.minutes(1)
const MAX_BAN = Dates.hours(24)
const ENTRY_TTL = Dates.hours(24)

interface LoginAttempts {
  failures: number
  lastFailureAt: number
  bans: number
  bannedUntil: number
}

const attemptsByIp = new Map<string, LoginAttempts>()

export type LoginAttemptCheck = { banned: false } | { banned: true; retryAfterSeconds: number }

export function checkLoginAttempts(ip: string): LoginAttemptCheck {
  const attempts = attemptsByIp.get(ip)

  if (!attempts || attempts.bannedUntil <= Date.now()) {
    return { banned: false }
  }

  return { banned: true, retryAfterSeconds: Math.ceil((attempts.bannedUntil - Date.now()) / 1000) }
}

export function recordFailedLogin(ip: string): void {
  const attempts = attemptsByIp.get(ip) ?? { failures: 0, lastFailureAt: 0, bans: 0, bannedUntil: 0 }

  if (Date.now() - attempts.lastFailureAt > FAILURE_WINDOW) {
    attempts.failures = 0
  }

  attempts.failures += 1
  attempts.lastFailureAt = Date.now()

  if (attempts.failures >= FAILURES_BEFORE_BAN) {
    const duration = Math.min(FIRST_BAN * 2 ** attempts.bans, MAX_BAN)
    attempts.failures = 0
    attempts.bans += 1
    attempts.bannedUntil = Date.now() + duration
    logger.warn('banning IP after repeated failed moderator logins', {
      ip,
      ban: attempts.bans,
      seconds: duration / 1000,
    })
  }

  attemptsByIp.set(ip, attempts)
}

export function clearLoginAttempts(ip: string): void {
  attemptsByIp.delete(ip)
}

function sweep(): void {
  for (const [ip, attempts] of attemptsByIp) {
    if (Date.now() - Math.max(attempts.lastFailureAt, attempts.bannedUntil) > ENTRY_TTL) {
      attemptsByIp.delete(ip)
    }
  }
}

setInterval(sweep, Dates.hours(1)).unref()

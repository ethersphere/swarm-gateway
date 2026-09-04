import { createHash, timingSafeEqual } from 'crypto'
import { AppConfig } from '../config'
import { logger } from '../logger'

export interface ModeratorIdentity {
  user: string
}

export function authenticateModerator(username: string, password: string, config: AppConfig): ModeratorIdentity | null {
  if (!config.moderationUser || !config.moderationPassword) {
    logger.error('rejecting moderator login, MODERATION_USER or MODERATION_PASSWORD is not set')
    return null
  }

  const matches =
    equalsInConstantTime(username, config.moderationUser) && equalsInConstantTime(password, config.moderationPassword)

  if (!matches) {
    logger.warn('rejecting moderator login, invalid credentials', { username })
    return null
  }

  return { user: config.moderationUser }
}

function equalsInConstantTime(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

import { Bee } from '@ethersphere/bee-js'
import { READINESS_TIMEOUT_MS } from './config'
import { logger } from './logger'

export async function checkReadiness(bee: Bee, strict: boolean): Promise<boolean> {
  try {
    const readiness = await bee.getReadiness({ timeout: READINESS_TIMEOUT_MS })
    const isReady = readiness.status === 'ready'
    if (!strict) {
      return isReady
    }
    const topology = await bee.getTopology({ timeout: READINESS_TIMEOUT_MS })
    return isReady && topology.depth >= 1 && topology.depth < 31
  } catch (error) {
    logger.error('failed to check readiness', error)
    return false
  }
}

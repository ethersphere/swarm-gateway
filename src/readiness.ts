import { Bee } from '@ethersphere/bee-js'
import { READINESS_TIMEOUT_MS } from './config'
import { logger } from './logger'

export async function checkReadiness(bee: Bee, strict: boolean): Promise<boolean> {
    try {
        if (strict) {
            const health = await bee.getHealth({ timeout: READINESS_TIMEOUT_MS })
            const topology = await bee.getTopology({ timeout: READINESS_TIMEOUT_MS })
            return health.status === 'ok' && topology.depth >= 1 && topology.depth < 31
        }
        
        const readiness = await bee.getReadiness({ timeout: READINESS_TIMEOUT_MS })
        return readiness.status === 'ready'
    } catch (error) {
        logger.error('failed to check readiness', error)
        return false
    }
}

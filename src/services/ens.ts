import { Cache, Dates, Strings } from 'cafe-utility'
import { logger } from '../logger'
import { resolveFeed } from './feed'

export async function resolveEnsReferences(beeApiUrl: string, name: string): Promise<string[]> {
  try {
    return await Cache.get(`ens:${name}`, Dates.minutes(1), async () => {
      const response = await fetch(Strings.joinUrl([beeApiUrl, 'bytes', name]), {
        headers: { Range: 'bytes=0-0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(Dates.seconds(30)),
      })
      await response.body?.cancel()
      if (!response.ok) {
        throw Error(`ens resolution responded with ${response.status} for ${name}`)
      }
      const reference = Strings.searchHex(response.headers.get('etag') ?? '', 64)
      if (!reference) {
        throw Error(`no reference in ETag for ${name}`)
      }
      const feed = await resolveFeed(beeApiUrl, reference)
      return feed?.reference ? [reference, feed.reference] : [reference]
    })
  } catch (error) {
    logger.warn('ens resolution failed', { name, error })
    return []
  }
}

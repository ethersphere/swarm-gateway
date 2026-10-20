import axios from 'axios'
import { Cache, Dates, Strings } from 'cafe-utility'
import { logger } from '../logger'
import { resolveFeed } from './feed'

export async function resolveEnsReferences(beeApiUrl: string, name: string): Promise<string[]> {
  try {
    return await Cache.get(`ens:${name}`, Dates.minutes(1), async () => {
      const response = await axios.head(Strings.joinUrl([beeApiUrl, 'bytes', name]), {
        timeout: Dates.seconds(30),
        maxRedirects: 0,
      })
      const reference = Strings.searchHex(String(response.headers.etag ?? ''), 64)
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

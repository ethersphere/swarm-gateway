import axios from 'axios'
import { Cache, Dates, Strings } from 'cafe-utility'
import { logger } from '../logger'
import { resolveFeed } from './feed'

// Returns the references an ENS name serves, so moderation rules can be applied
// to them: the root reference the name points to and, when that is a feed
// manifest, the feed's current content. Returns an empty array when the name
// cannot be resolved. Failures are not cached, successes are kept for a minute.
export async function resolveEnsReferences(beeApiUrl: string, name: string): Promise<string[]> {
  try {
    return await Cache.get<string[]>(`ens:${name.toLowerCase()}`, Dates.minutes(1), async () => {
      const reference = await resolveEnsName(beeApiUrl, name)
      const feed = await resolveFeed(beeApiUrl, { hash: reference })
      return feed?.reference ? [reference, feed.reference] : [reference]
    })
  } catch (error) {
    logger.warn('ens resolution failed', { name, error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

// Bee resolves names in /bytes/{address} and sets the ETag of the response to
// the resolved reference, so a HEAD request yields it without fetching content.
async function resolveEnsName(beeApiUrl: string, name: string): Promise<string> {
  const response = await axios({
    method: 'HEAD',
    url: Strings.joinUrl([beeApiUrl, 'bytes', name]),
    timeout: Dates.seconds(30),
    maxRedirects: 0,
  })
  const reference = Strings.searchHex(String(response.headers.etag || ''), 64)
  if (!reference) {
    throw Error(`no reference in ETag for ${name}`)
  }
  return reference
}

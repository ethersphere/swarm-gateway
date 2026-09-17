import { Bee, FeedIndex } from '@ethersphere/bee-js'
import axios from 'axios'
import { Dates, Strings } from 'cafe-utility'
import { logger } from '../logger'

// Both resolution paths funnel their index through core-sdk's FeedIndex (via
// bee-js) so comparisons are on a canonical value, not encoding-dependent strings.
function canonicalIndex(index: FeedIndex): string {
  return index.toBigInt().toString()
}

export interface FeedState {
  index: string
  reference: string | null
}

export interface FeedCoordinates {
  hash: string
  feedOwner?: string | null
  feedTopic?: string | null
}

// Resolves a reference to its current feed state, or null if it is not a feed.
// With owner+topic we get the content reference too; from a bare hash we can
// still read the index off the `swarm-feed-index` header, which is enough to
// detect that the content behind an approved hash has changed.
export async function resolveFeed(beeApiUrl: string, coords: FeedCoordinates): Promise<FeedState | null> {
  if (coords.feedOwner && coords.feedTopic) {
    try {
      const update = await new Bee(beeApiUrl).feed.makeReader(coords.feedTopic, coords.feedOwner).downloadReference()
      return { index: canonicalIndex(update.feedIndex), reference: update.reference.toString() }
    } catch (error) {
      logger.debug('feed reader resolution failed', error)
      return null
    }
  }
  return resolveFeedIndexFromHeader(beeApiUrl, coords.hash)
}

async function resolveFeedIndexFromHeader(beeApiUrl: string, hash: string): Promise<FeedState | null> {
  try {
    const response = await axios({
      method: 'GET',
      url: Strings.joinUrl([beeApiUrl, 'bzz', hash]) + '/',
      headers: { Range: 'bytes=0-0' },
      timeout: Dates.seconds(30),
      validateStatus: status => status < 500,
      maxRedirects: 0,
      responseType: 'arraybuffer',
    })
    const index = response.headers['swarm-feed-index']
    return typeof index === 'string' && index.length > 0
      ? { index: canonicalIndex(new FeedIndex(index)), reference: null }
      : null
  } catch (error) {
    logger.debug('feed header probe failed', error)
    return null
  }
}

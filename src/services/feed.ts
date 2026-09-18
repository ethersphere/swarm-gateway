import { Bee, FeedIndex, MantarayNode } from '@ethersphere/bee-js'
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
  owner: string | null
  topic: string | null
}

export interface FeedCoordinates {
  hash: string
  feedOwner?: string | null
  feedTopic?: string | null
}

// Resolves a reference to its current feed state, or null if it is not a feed.
// Owner+topic yield the content reference; a feed manifest encodes both in its
// metadata, so we recover them from a bare hash and still get the reference.
// Only a non-manifest feed reference falls back to the header, index-only path.
export async function resolveFeed(beeApiUrl: string, coords: FeedCoordinates): Promise<FeedState | null> {
  const bee = new Bee(beeApiUrl)

  let owner = coords.feedOwner || null
  let topic = coords.feedTopic || null
  if (!owner || !topic) {
    const recovered = await recoverFeedCoordinates(bee, coords.hash)
    owner = owner || recovered?.owner || null
    topic = topic || recovered?.topic || null
  }

  if (owner && topic) {
    try {
      const update = await bee.feed.makeReader(topic, owner).downloadReference()
      return { index: canonicalIndex(update.feedIndex), reference: update.reference.toString(), owner, topic }
    } catch (error) {
      logger.debug('feed reader resolution failed', error)
    }
  }

  return resolveFeedIndexFromHeader(beeApiUrl, coords.hash)
}

// The content reference at a specific past index — used to report the previous
// (head-1) content alongside the new head when a feed advances.
export async function feedReferenceAtIndex(
  beeApiUrl: string,
  owner: string,
  topic: string,
  index: string,
): Promise<string | null> {
  try {
    const reader = new Bee(beeApiUrl).feed.makeReader(topic, owner)
    const update = await reader.downloadReference({ index: FeedIndex.fromBigInt(BigInt(index)) })
    return update.reference.toString()
  } catch (error) {
    logger.debug('previous feed index resolution failed', error)
    return null
  }
}

async function recoverFeedCoordinates(bee: Bee, hash: string): Promise<{ owner: string; topic: string } | null> {
  try {
    const node = await MantarayNode.unmarshal(bee, hash)
    const metadata = node.getRootMetadata().getOrFallback(() => ({}))
    const owner = metadata['swarm-feed-owner']
    const topic = metadata['swarm-feed-topic']
    return owner && topic ? { owner, topic } : null
  } catch (error) {
    logger.debug('reference is not a feed manifest', error)
    return null
  }
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
      ? { index: canonicalIndex(new FeedIndex(index)), reference: null, owner: null, topic: null }
      : null
  } catch (error) {
    logger.debug('feed header probe failed', error)
    return null
  }
}

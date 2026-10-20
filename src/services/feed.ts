import { Bee, FeedIndex, MantarayNode } from '@ethersphere/bee-js'
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

// Owner and topic come only from the manifest metadata, never from the client.
export async function resolveFeed(beeApiUrl: string, hash: string): Promise<FeedState | null> {
  const bee = new Bee(beeApiUrl)

  const coordinates = await readFeedCoordinates(bee, hash)
  if (coordinates) {
    const { owner, topic } = coordinates
    try {
      const update = await bee.feed.makeReader(topic, owner).downloadReference()
      return { index: canonicalIndex(update.feedIndex), reference: update.reference.toString(), owner, topic }
    } catch (error) {
      logger.debug('feed reader resolution failed', error)
    }
  }

  return resolveFeedIndexFromHeader(beeApiUrl, hash)
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

async function readFeedCoordinates(bee: Bee, hash: string): Promise<{ owner: string; topic: string } | null> {
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
    const response = await fetch(Strings.joinUrl([beeApiUrl, 'bzz', hash]) + '/', {
      headers: { Range: 'bytes=0-0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(Dates.seconds(30)),
    })
    await response.body?.cancel()
    const index = response.headers.get('swarm-feed-index')
    return response.status < 500 && index
      ? { index: canonicalIndex(new FeedIndex(index)), reference: null, owner: null, topic: null }
      : null
  } catch (error) {
    logger.debug('feed header probe failed', error)
    return null
  }
}

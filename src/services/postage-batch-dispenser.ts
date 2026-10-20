import { Cache, Dates, Strings } from 'cafe-utility'
import { PostageBatchDispenserConfig } from '../config'

export const POSTAGE_TOKEN_HEADER = 'x-swarm-postage-token'

class UnknownTokenError extends Error {}

export class PostageBatchDispenserService {
  public readonly enabled: boolean

  constructor(private config: PostageBatchDispenserConfig) {
    this.enabled = Boolean(config.url)
  }

  async resolveToken(token: string): Promise<string | null> {
    try {
      return await Cache.get(`postage-token:${token}`, Dates.minutes(1), () => this.fetchBatchId(token))
    } catch (error) {
      if (error instanceof UnknownTokenError) {
        return null
      }
      throw error
    }
  }

  private async fetchBatchId(token: string): Promise<string> {
    const response = await fetch(Strings.joinUrl([this.config.url, 'swarm-postage-token-resolver']), {
      headers: { authorization: `Bearer ${this.config.secret}`, [POSTAGE_TOKEN_HEADER]: token },
      signal: AbortSignal.timeout(Dates.seconds(10)),
    })

    if (response.status === 404) {
      throw new UnknownTokenError()
    }
    if (!response.ok) {
      throw Error(`postage token resolver responded with ${response.status}`)
    }
    const { batchId } = (await response.json()) as { batchId: string }

    return batchId
  }
}

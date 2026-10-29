import { Cache, Dates, Strings } from 'cafe-utility'
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeFunctionData,
  decodeFunctionResult,
  http,
  parseAbi,
  PublicClient,
  toHex,
} from 'viem'
import { mainnet } from 'viem/chains'
import { namehash, normalize, packetToBytes } from 'viem/ens'
import { logger } from '../logger'
import { resolveFeed } from './feed'

const SWARM_CONTENTHASH = /^0xe40101fa011b20([0-9a-f]{64})$/i
const LOCAL_BATCH_GATEWAY = 'x-batch-gateway:true'
const UNIVERSAL_RESOLVER_ABI = parseAbi([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes, address)',
])
const CONTENTHASH_ABI = parseAbi(['function contenthash(bytes32 node) view returns (bytes)'])

interface EnsStrategy {
  forwardsNamesToBee: boolean
  resolveReference(name: string): Promise<string | null>
}

export class EnsResolver {
  private readonly strategy: EnsStrategy

  constructor(
    private readonly beeApiUrl: string,
    rpcUrl: string,
  ) {
    this.strategy = rpcUrl ? new RpcStrategy(rpcUrl) : new BeeStrategy(beeApiUrl)
  }

  get mode(): string {
    return this.strategy.forwardsNamesToBee ? 'bee' : 'gateway'
  }

  async toBeePathSegment(name: string): Promise<string | null> {
    return this.strategy.forwardsNamesToBee ? name : this.resolveReference(name)
  }

  async resolveReference(name: string): Promise<string | null> {
    return Cache.get(`ens:${name.toLowerCase()}`, Dates.minutes(1), () => this.strategy.resolveReference(name))
  }

  async resolveRuleReferences(name: string): Promise<string[]> {
    try {
      const reference = await this.resolveReference(name)
      if (!reference) {
        return []
      }
      const feed = await resolveFeed(this.beeApiUrl, reference)
      return feed?.reference ? [reference, feed.reference] : [reference]
    } catch (error) {
      logger.warn('ens resolution failed', { name, error })
      return []
    }
  }
}

class BeeStrategy implements EnsStrategy {
  readonly forwardsNamesToBee = true

  constructor(private readonly beeApiUrl: string) {}

  async resolveReference(name: string): Promise<string | null> {
    const response = await fetch(Strings.joinUrl([this.beeApiUrl, 'bytes', name]), {
      headers: { Range: 'bytes=0-0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(Dates.seconds(30)),
    })
    await response.body?.cancel()
    if (response.status >= 500) {
      throw Error(`ens resolution responded with ${response.status} for ${name}`)
    }
    if (!response.ok) {
      return null
    }
    return Strings.searchHex(response.headers.get('etag') ?? '', 64)
  }
}

class RpcStrategy implements EnsStrategy {
  readonly forwardsNamesToBee = false
  private readonly client: PublicClient

  constructor(rpcUrl: string) {
    this.client = createPublicClient({ chain: mainnet, transport: http(rpcUrl, { timeout: Dates.seconds(10) }) })
  }

  async resolveReference(name: string): Promise<string | null> {
    let normalized: string
    try {
      normalized = normalize(name)
    } catch {
      return null
    }
    try {
      const [data] = await this.client.readContract({
        address: mainnet.contracts.ensUniversalResolver.address,
        abi: UNIVERSAL_RESOLVER_ABI,
        functionName: 'resolveWithGateways',
        args: [
          toHex(packetToBytes(normalized)),
          encodeFunctionData({ abi: CONTENTHASH_ABI, functionName: 'contenthash', args: [namehash(normalized)] }),
          [LOCAL_BATCH_GATEWAY],
        ],
      })
      if (data === '0x') {
        return null
      }
      const contenthash = decodeFunctionResult({ abi: CONTENTHASH_ABI, functionName: 'contenthash', data })
      return SWARM_CONTENTHASH.exec(contenthash)?.[1]?.toLowerCase() ?? null
    } catch (error) {
      if (error instanceof BaseError && error.walk(x => x instanceof ContractFunctionRevertedError)) {
        return null
      }
      throw error
    }
  }
}

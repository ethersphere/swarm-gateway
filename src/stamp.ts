import { BatchId, Bee } from '@ethersphere/bee-js'
import { Arrays, Dates, System, Types } from 'cafe-utility'
import { ERROR_NO_STAMP, StampConfig } from './config'
import { logger } from './logger'
import { createMetric } from './metrics'

const stampPurchaseCounter = createMetric('counter', 'stamp_purchase_counter', 'How many stamps were purchased')
const stampPurchaseFailedCounter = createMetric(
  'counter',
  'stamp_purchase_failed_counter',
  'How many stamps failed to be purchased',
)
const stampTopupCounter = createMetric('counter', 'stamp_topup_counter', 'How many topups were made')
const stampPurchaseTopupCounter = createMetric('counter', 'stamp_topup_failed_counter', 'How many topups failed')
const stampCheckCounter = createMetric(
  'counter',
  'stamp_check_counter',
  'How many times were stamps retrieved from server',
)
const stampGetCounter = createMetric('counter', 'stamp_get_counter', 'How many times was get postageStamp called')
const stampGetErrorCounter = createMetric(
  'counter',
  'stamp_get_error_counter',
  'How many times was get postageStamp called and there was no valid postage stamp',
)
const stampTtlGauge = createMetric('gauge', 'stamp_ttl_gauge', 'TTL on the selected automanaged stamp')
const stampUsageGauge = createMetric('gauge', 'stamp_usage_gauge', 'Usage on the selected automanaged stamp')
const stampUsableCountGauge = createMetric(
  'gauge',
  'stamp_usable_count_gauge',
  'How many stamps exist on the bee node that can be used',
)

export class StampManager {
  private bee: Bee
  private config: StampConfig
  private stamp?: BatchId
  private stampSoc?: BatchId

  public enabled: boolean = false

  constructor(beeApiUrl: string, config: StampConfig) {
    this.bee = new Bee(beeApiUrl)
    this.config = config
  }

  async start() {
    if (this.config.hardcodedStampSoc) {
      this.stampSoc = new BatchId(this.config.hardcodedStampSoc)
      logger.info('enabled SOC stamp manager with hardcoded stamp')
    }
    if (this.config.hardcodedStamp) {
      this.enabled = true
      this.stamp = new BatchId(this.config.hardcodedStamp)
      logger.info('enabled stamp manager with hardcoded stamp')
    } else if (this.config.postageAmount && this.config.postageDepth) {
      this.enabled = true
      System.forever(
        async () => {
          await this.manageStamps()
        },
        Dates.minutes(2),
        logger.error,
      )
      logger.info('enabled stamp manager with autobuy')
    } else {
      logger.info('disabled stamp manager')
    }
  }

  getPostageStamp(soc = false): string {
    stampGetCounter.value++

    if (soc && this.stampSoc) {
      return this.stampSoc.toHex()
    }

    if (this.stamp) {
      return this.stamp.toHex()
    }

    stampGetErrorCounter.value++
    throw Error(ERROR_NO_STAMP)
  }

  public async manageStamps() {
    const amount = Types.asNumber(this.config.postageAmount)
    const depth = Types.asNumber(this.config.postageDepth)

    stampCheckCounter.value++
    const stamps = (await this.bee.stamp.getAll()).filter(
      x => x.usable && x.depth === this.config.postageDepth && x.usage < this.config.postageThresholdUsage,
    )
    logger.debug('valid stamps', stamps)

    if (!stamps.length) {
      this.stamp = await this.buyStamp(amount, depth, 'no valid stamps found')
    } else {
      const stamp = Arrays.maxBy(stamps, x => 1 - x.usage)
      this.stamp = stamp.batchID
    }

    let currentStamp = await this.bee.stamp.get(this.stamp)

    if (currentStamp.usage >= this.config.postageThresholdUsage) {
      this.stamp = await this.buyStamp(amount, depth, 'current stamp is used up')
      currentStamp = await this.bee.stamp.get(this.stamp)
    }

    if (currentStamp.duration.toSeconds() < this.config.postageThresholdSeconds) {
      if (this.config.postageKeepAlive) {
        await this.topup(this.stamp, amount)
        currentStamp = await this.bee.stamp.get(this.stamp)
      } else {
        this.stamp = await this.buyStamp(amount, depth, 'current stamp is about to expire')
        currentStamp = await this.bee.stamp.get(this.stamp)
      }
    }

    stampTtlGauge.value = currentStamp.duration.toSeconds()
    stampUsageGauge.value = currentStamp.usage
    stampUsableCountGauge.value = stamps.length
  }

  async topup(batchId: BatchId, amount: number): Promise<void> {
    try {
      logger.info(`topping up stamp ${batchId.toHex()} with ${amount}`)
      await this.bee.stamp.topUp(batchId, amount.toString())
      stampTopupCounter.value++
    } catch (error) {
      stampPurchaseTopupCounter.value++
      throw error
    }
  }

  async buyStamp(amount: number, depth: number, reason: string): Promise<BatchId> {
    try {
      logger.info(`buying new stamp with amount ${amount} and depth ${depth}, reason: ${reason}`)
      const batchId = await this.bee.stamp.create(amount.toString(), depth)
      logger.info('successfully bought new stamp', batchId.toHex())
      stampPurchaseCounter.value++
      return batchId
    } catch (error) {
      stampPurchaseFailedCounter.value++
      throw error
    }
  }
}

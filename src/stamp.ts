import { BatchId, Bee } from '@ethersphere/bee-js'
import { Arrays, Dates, System, Types } from 'cafe-utility'
import client from 'prom-client'
import { ERROR_NO_STAMP, StampConfig } from './config'
import { logger } from './logger'
import { register } from './metrics'

const stampPurchaseCounter = new client.Counter({
    name: 'stamp_purchase_counter',
    help: 'How many stamps were purchased'
})
register.registerMetric(stampPurchaseCounter)

const stampPurchaseFailedCounter = new client.Counter({
    name: 'stamp_purchase_failed_counter',
    help: 'How many stamps failed to be purchased'
})
register.registerMetric(stampPurchaseFailedCounter)

const stampTopupCounter = new client.Counter({
    name: 'stamp_topup_counter',
    help: 'How many topups were made'
})
register.registerMetric(stampPurchaseCounter)

const stampPurchaseTopupCounter = new client.Counter({
    name: 'stamp_topup_failed_counter',
    help: 'How many topups failed'
})
register.registerMetric(stampPurchaseFailedCounter)

const stampCheckCounter = new client.Counter({
    name: 'stamp_check_counter',
    help: 'How many times were stamps retrieved from server'
})
register.registerMetric(stampCheckCounter)

const stampGetCounter = new client.Counter({
    name: 'stamp_get_counter',
    help: 'How many times was get postageStamp called'
})
register.registerMetric(stampGetCounter)

const stampGetErrorCounter = new client.Counter({
    name: 'stamp_get_error_counter',
    help: 'How many times was get postageStamp called and there was no valid postage stamp'
})
register.registerMetric(stampGetErrorCounter)

const stampTtlGauge = new client.Gauge({
    name: 'stamp_ttl_gauge',
    help: 'TTL on the selected automanaged stamp'
})
register.registerMetric(stampTtlGauge)

const stampUsageGauge = new client.Gauge({
    name: 'stamp_usage_gauge',
    help: 'Usage on the selected automanaged stamp'
})
register.registerMetric(stampUsageGauge)

const stampUsableCountGauge = new client.Gauge({
    name: 'stamp_usable_count_gauge',
    help: 'How many stamps exist on the bee node that can be used'
})
register.registerMetric(stampUsableCountGauge)

export class StampManager {
    private bee: Bee
    private config: StampConfig
    private stamp?: BatchId

    public enabled: boolean = false

    constructor(beeApiUrl: string, config: StampConfig) {
        this.bee = new Bee(beeApiUrl)
        this.config = config
    }

    async start() {
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
                logger.error
            )
            logger.info('enabled stamp manager with autobuy')
        } else {
            logger.info('disabled stamp manager')
        }
    }

    getPostageStamp(): string {
        stampGetCounter.inc()

        if (this.stamp) {
            return this.stamp.toHex()
        }

        stampGetErrorCounter.inc()
        throw Error(ERROR_NO_STAMP)
    }

    public async manageStamps() {
        const amount = Types.asNumber(this.config.postageAmount)
        const depth = Types.asNumber(this.config.postageDepth)

        stampCheckCounter.inc()
        const stamps = (await this.bee.getAllPostageBatch()).filter(
            x => x.usable && x.depth === this.config.postageDepth && x.usage < this.config.postageThresholdUsage
        )
        logger.debug('valid stamps', stamps)

        if (!stamps.length) {
            this.stamp = await this.buyStamp(amount, depth, 'no valid stamps found')
        } else {
            const stamp = Arrays.maxBy(stamps, x => 1 - x.usage)
            this.stamp = stamp.batchID
        }

        let currentStamp = await this.bee.getPostageBatch(this.stamp)

        if (currentStamp.usage >= this.config.postageThresholdUsage) {
            this.stamp = await this.buyStamp(amount, depth, 'current stamp is used up')
            currentStamp = await this.bee.getPostageBatch(this.stamp)
        }

        if (currentStamp.duration.toSeconds() < this.config.postageThresholdSeconds) {
            if (this.config.postageKeepAlive) {
                await this.topup(this.stamp, amount)
                currentStamp = await this.bee.getPostageBatch(this.stamp)
            } else {
                this.stamp = await this.buyStamp(amount, depth, 'current stamp is about to expire')
                currentStamp = await this.bee.getPostageBatch(this.stamp)
            }
        }

        stampTtlGauge.set(currentStamp.duration.toSeconds())
        stampUsageGauge.set(currentStamp.usage)
        stampUsableCountGauge.set(stamps.length)
    }

    async topup(batchId: BatchId, amount: number): Promise<void> {
        try {
            logger.info(`topping up stamp ${batchId.toHex()} with ${amount}`)
            await this.bee.topUpBatch(batchId, amount.toString())
            stampTopupCounter.inc()
        } catch (error) {
            stampPurchaseTopupCounter.inc()
            throw error
        }
    }

    async buyStamp(amount: number, depth: number, reason: string): Promise<BatchId> {
        try {
            logger.info(`buying new stamp with amount ${amount} and depth ${depth}, reason: ${reason}`)
            const batchId = await this.bee.createPostageBatch(amount.toString(), depth)
            logger.info('successfully bought new stamp', batchId.toHex())
            stampPurchaseCounter.inc()
            return batchId
        } catch (error) {
            stampPurchaseFailedCounter.inc()
            throw error
        }
    }
}

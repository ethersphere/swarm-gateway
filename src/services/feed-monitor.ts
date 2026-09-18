import { Dates } from 'cafe-utility'
import { ApprovalRequests, ApprovalRequestsRow } from '../database/ApprovalRequests'
import { logger } from '../logger'
import { resolveFeed } from './feed'
import { sendMattermostAlert } from './mattermost'

const DEFAULT_INTERVAL = Dates.minutes(5)

export function startFeedMonitor(beeApiUrl: string, intervalMs: number = DEFAULT_INTERVAL): void {
  const tick = () => sweep(beeApiUrl).catch(error => logger.error('feed monitor sweep failed', error))
  setInterval(tick, intervalMs).unref()
  logger.info(`monitoring approved feeds for content changes every ${Math.round(intervalMs / 1000)}s`)
}

async function sweep(beeApiUrl: string): Promise<void> {
  const feeds = (await ApprovalRequests.getMany()).filter(row => row.feedIndex)
  for (const row of feeds) {
    await checkFeed(beeApiUrl, row).catch(error => logger.error('feed check failed', { hash: row.hash, error }))
  }
}

async function checkFeed(beeApiUrl: string, row: ApprovalRequestsRow): Promise<void> {
  const current = await resolveFeed(beeApiUrl, row)
  if (!current || current.index === row.feedIndex) {
    return
  }

  const head = current.reference ?? '(unknown — fetch the hash to see current content)'
  const previous = row.feedReference ?? '(unknown — not recorded)'

  logger.warn('approved feed content changed', { hash: row.hash, from: row.feedIndex, to: current.index })
  await sendMattermostAlert(
    `### Approved feed content changed\n` +
      `**Hash**: ${row.hash}\n` +
      `**ENS**: ${row.ens || 'N/A'}\n` +
      `**Feed index**: ${row.feedIndex} → ${current.index}\n` +
      `**Head content**: ${head}\n` +
      `**Previous content**: ${previous}`,
  )

  await ApprovalRequests.update(row.id, { feedIndex: current.index, feedReference: current.reference })
}

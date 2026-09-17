import { Types } from 'cafe-utility'
import { getOnlyRowOrThrow, runQuery } from './database/Database'
import { logger } from './logger'

export async function runMigrations() {
  if (!process.env.DATABASE_CONFIG || process.env.DATABASE_CONFIG === '{}') {
    logger.info('skipping migrations, DATABASE_CONFIG is not set')
    return
  }

  const row = await getOnlyRowOrThrow(`SHOW CREATE TABLE settings;`)
  if (!Types.asString(row['Create Table']).includes('defaultEnsRule')) {
    await runQuery(
      "ALTER TABLE `settings` ADD `defaultEnsRule` ENUM('allow','deny') NOT NULL AFTER `defaultFileRule`, ADD `redirectUri` VARCHAR(100) NOT NULL AFTER `defaultEnsRule`;",
    )
  }

  const approvals = await getOnlyRowOrThrow(`SHOW CREATE TABLE approvalRequests;`)
  if (!Types.asString(approvals['Create Table']).includes('feedIndex')) {
    await runQuery(
      'ALTER TABLE `approvalRequests` ADD `feedIndex` VARCHAR(160) NULL, ADD `feedOwner` VARCHAR(64) NULL, ADD `feedTopic` VARCHAR(128) NULL, ADD `feedReference` VARCHAR(128) NULL;',
    )
  }
}

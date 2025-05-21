import { Types } from 'cafe-utility'
import { getOnlyRowOrThrow, runQuery } from './database/Database'
import { logger } from './logger'

export async function runMigrations() {
    if (process.env.DATABASE_CONFIG === '{}') {
        logger.info('skipping migrations, DATABASE_CONFIG is empty')
        return
    }

    const row = await getOnlyRowOrThrow(`SHOW CREATE TABLE settings;`)
    if (!Types.asString(row['Create Table']).includes('defaultEnsRule')) {
        await runQuery(
            "ALTER TABLE `settings` ADD `defaultEnsRule` ENUM('allow','deny') NOT NULL AFTER `defaultFileRule`, ADD `redirectUri` VARCHAR(100) NOT NULL AFTER `defaultEnsRule`;"
        )
    }
}

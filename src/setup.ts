import { getRows, runQuery } from './database/Database'
import { logger } from './logger'

export async function setupSchema() {
    if (process.env.DATABASE_CONFIG === '{}') {
        logger.info('skipping schema setup, DATABASE_CONFIG is empty')
        return
    }

    const tables = [
        [
            'allowedUserAgents',
            `CREATE TABLE \`allowedUserAgents\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`userAgent\` varchar(100) NOT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'approvalRequests',
            `CREATE TABLE \`approvalRequests\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`hash\` varchar(128) NOT NULL,
        \`ens\` varchar(128),
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'reports',
            `CREATE TABLE \`reports\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`hash\` varchar(128) NOT NULL,
        \`reason\` text,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'rewrites',
            `CREATE TABLE \`rewrites\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`subdomain\` varchar(63) NOT NULL,
        \`target\` varchar(128) NOT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'rules',
            `CREATE TABLE \`rules\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`hash\` varchar(128) NOT NULL,
        \`mode\` enum('allow','deny') NOT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'settings',
            `CREATE TABLE \`settings\` (
        \`id\` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
        \`name\` varchar(100) NOT NULL,
        \`defaultWebsiteRule\` enum('allow','deny') NOT NULL,
        \`defaultFileRule\` enum('allow','deny') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ],
        [
            'challenges',
            `CREATE TABLE \`challenges\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`nonce\` varchar(64) NOT NULL,
        \`difficulty\` int NOT NULL,
        \`solution\` varchar(64) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
        ]
    ]

    const uniqueKeys = [
        [
            'rewrites',
            'idx_proxy_rewrites_subdomain_unique',
            `ALTER TABLE \`rewrites\` ADD UNIQUE KEY \`idx_proxy_rewrites_subdomain_unique\` (\`subdomain\`);`
        ],
        [
            'rules',
            'idx_proxy_rules_hash_unique',
            `ALTER TABLE \`rules\` ADD UNIQUE KEY \`idx_proxy_rules_hash_unique\` (\`hash\`);`
        ],
        [
            'settings',
            'idx_proxy_settings_name_unique',
            `ALTER TABLE \`settings\` ADD UNIQUE KEY \`idx_proxy_settings_name_unique\` (\`name\`);`
        ]
    ]

    for (const [tableName, sql] of tables) {
        const rows = await getRows(`SHOW TABLES LIKE '${tableName}'`)
        if (rows.length > 0) {
            logger.debug(`table ${tableName} already exists, skipping creation`)
            continue
        }
        logger.debug(`reating table ${tableName}`)
        await runQuery(sql)
    }
    for (const [tableName, keyName, sql] of uniqueKeys) {
        const rows = await getRows(`SHOW INDEX FROM ${tableName} WHERE Key_name = '${keyName}'`)
        if (rows.length > 0) {
            logger.debug(`unique key ${keyName} already exists, skipping creation`)
            continue
        }
        logger.debug(`creating unique key ${keyName}`)
        await runQuery(sql)
    }
}

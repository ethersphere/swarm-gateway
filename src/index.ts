#!/usr/bin/env node
import { Dates, Types } from 'cafe-utility'
import { EnvironmentVariables, getAppConfig, getServerConfig, getStampConfig } from './config'
import { logger, subscribeLogServerRequests } from './logger'
import { runMigrations } from './migration'
import { createApp } from './server'
import { setupSchema } from './setup'
import { StampManager } from './stamp'

async function main() {
    const stampConfig = getStampConfig(process.env as EnvironmentVariables)
    const appConfig = getAppConfig(process.env as EnvironmentVariables)
    const serverConfig = getServerConfig(process.env as EnvironmentVariables)

    logger.debug('proxy config', appConfig)
    logger.debug('server config', serverConfig)
    logger.debug('stamp config', stampConfig)

    await setupSchema()
    await runMigrations()

    const stampManager = new StampManager(appConfig.beeApiUrl, stampConfig)
    stampManager.start()

    const app = createApp(appConfig, stampManager)

    const server = app.listen(serverConfig.port, () => {
        logger.info(`starting server at ${serverConfig.hostname}:${serverConfig.port}`)
    })

    subscribeLogServerRequests(server)

    process.on('uncaughtException', err => {
        logger.error('Uncaught Exception:', err)
    })

    process.on('unhandledRejection', err => {
        logger.error('Unhandled Rejection:', err)
    })

    if (process.env.TEMPORARY) {
        const seconds = Types.asNumber(process.env.TEMPORARY, { name: 'TEMPORARY' })
        logger.info(`temporary mode, shutting down in ${seconds} seconds`)
        setTimeout(() => {
            process.exit(0)
        }, Dates.seconds(seconds))
    }
}

main()

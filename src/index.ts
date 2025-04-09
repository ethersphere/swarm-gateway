#!/usr/bin/env node
import { EnvironmentVariables, getAppConfig, getServerConfig, getStampConfig } from './config'
import { logger, subscribeLogServerRequests } from './logger'
import { createApp } from './server'
import { StampManager } from './stamp'

async function main() {
    const stampConfig = getStampConfig(process.env as EnvironmentVariables)
    const appConfig = getAppConfig(process.env as EnvironmentVariables)
    const serverConfig = getServerConfig(process.env as EnvironmentVariables)

    logger.debug('proxy config', appConfig)
    logger.debug('server config', serverConfig)
    logger.debug('stamp config', stampConfig)

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
}

main()

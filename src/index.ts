#!/usr/bin/env node
import { Cache, Dates, Types } from 'cafe-utility'
import {
  EnvironmentVariables,
  getAppConfig,
  getPostageBatchDispenserConfig,
  getServerConfig,
  getStampConfig,
} from './config'
import { logger, subscribeLogServerRequests } from './logger'
import { runMigrations } from './migration'
import { createApp } from './server'
import { startFeedMonitor } from './services/feed-monitor'
import { PostageBatchDispenserService } from './services/postage-batch-dispenser'
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

  const postageBatchDispenser = new PostageBatchDispenserService(
    getPostageBatchDispenserConfig(process.env as EnvironmentVariables),
  )
  logger.info(`postage batch dispenser ${postageBatchDispenser.enabled ? 'enabled' : 'disabled'}`)

  if (process.env.DATABASE_CONFIG && process.env.DATABASE_CONFIG !== '{}') {
    startFeedMonitor(appConfig.beeApiUrl)
  }

  setInterval(Cache.deleteExpired, Dates.minutes(10))

  const app = createApp(appConfig, stampManager, postageBatchDispenser)

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

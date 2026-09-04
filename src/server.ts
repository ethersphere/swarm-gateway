import { Bee } from '@ethersphere/bee-js'
import axios from 'axios'
import bodyParser from 'body-parser'
import { Arrays, Strings, Types } from 'cafe-utility'
import express, { Application, NextFunction, Request, Response } from 'express'
import { resolve } from 'path'
import { checkChallenge, createChallenge } from './challenge'
import { AppConfig, ReadinessMode } from './config'
import { ApprovalRequests } from './database/ApprovalRequests'
import { runQuery } from './database/Database'
import { Reports } from './database/Reports'
import { Rules } from './database/Rules'
import { logger } from './logger'
import { register } from './metrics'
import { createProxyEndpoints } from './proxy'
import { checkReadiness } from './readiness'
import { authenticateModerator } from './services/credentials'
import { sendMattermostAlert } from './services/mattermost'
import { clearSessionCookie, createSessionCookie, readSession } from './services/session'
import { StampManager } from './stamp'

export function createApp(config: AppConfig, stampManager: StampManager): Application {
  const bee = new Bee(config.beeApiUrl)
  const app = express()

  const postSizeLimit = Arrays.getArgument(process.argv, 'post-size-limit', process.env, 'POST_SIZE_LIMIT') || '1gb'

  app.use(bodyParser.raw({ inflate: true, limit: postSizeLimit, type: () => true }))

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Content-Disposition, swarm-postage-batch-id, swarm-postage-stamp, swarm-deferred-upload, swarm-encrypt, swarm-collection, swarm-redundancy-level',
    )

    if (req.method === 'OPTIONS') {
      res.sendStatus(200)
      return
    }
    next()
  })

  const subdomainOffset = config.hostname.split('.').length
  app.set('subdomain offset', subdomainOffset)

  if (config.authorization) {
    app.use('', (req, res, next) => {
      if (req.headers.authorization === config.authorization) {
        next()
      } else if (
        req.method !== 'post' &&
        Arrays.getBooleanArgument(process.argv, 'soft-auth', process.env, 'SOFT_AUTH')
      ) {
        next()
      } else {
        res.sendStatus(403)
      }
    })
  }

  logger.info(`resolving .eth names and CIDs at *.${config.hostname}`)

  if (config.moderationUser && config.moderationPassword && !config.sessionSecret) {
    logger.warn('SESSION_SECRET is not set, moderator sessions will not survive a restart')
  }

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.write(await register.metrics())
    res.end()
  })

  app.get('/gateway', (_req, res) => res.send({ gateway: true }))

  app.get('/health', (_req, res) => res.sendStatus(200))

  if (config.hostname) {
    app.get('/tls-check', (req, res) => {
      const domain = req.query.domain as string
      const valid = domain === config.hostname || domain.endsWith(`.${config.hostname}`)
      res.sendStatus(valid ? 200 : 403)
    })
  }

  app.get('/readiness', async (_req, res) => {
    const ready = await checkReadiness(bee, config.readinessMode === ReadinessMode.Strict)

    if (ready) {
      res.sendStatus(200)
    } else {
      res.sendStatus(503)
    }
  })

  app.get('/batches', async (_req, res) => {
    try {
      const batches = await bee.stamp.getAllGlobal()
      res.send(batches.map(x => ({ ...x, owner: x.owner.toString(), batchID: x.batchID.toString() })))
    } catch (error) {
      logger.error('failed to fetch batches', error)
      res.sendStatus(500)
    }
  })

  app.get('/batches/owner/:owner', async (req, res) => {
    try {
      const batches = await bee.stamp.getAllGlobal()
      const owner = req.params.owner.toLowerCase().replace(/^0x/, '')
      res.send(
        batches
          .filter(x => x.owner.toString().toLowerCase().replace(/^0x/, '') === owner)
          .map(x => ({ ...x, owner: x.owner.toString(), batchID: x.batchID.toString() })),
      )
    } catch (error) {
      logger.error('failed to fetch batches by owner', error)
      res.sendStatus(500)
    }
  })

  app.post('/challenge', async (_req, res) => {
    res.send(await createChallenge())
  })

  app.post('/moderation/approval', async (req, res) => {
    const json = JSON.parse(req.body.toString())
    const { hash, ens, challengeId, challengeSolution } = json
    if (!(await checkChallenge(challengeId, challengeSolution))) {
      res.sendStatus(400)
      return
    }
    const existingRequest = await ApprovalRequests.getMany({ hash: Types.asString(hash) }, { limit: 1 })
    if (existingRequest.length) {
      res.sendStatus(200)
      return
    }
    await ApprovalRequests.insert({ hash: Types.asString(hash), ens: Types.asNullable(Types.asString, ens) })
    await sendMattermostAlert(`### New moderation approval request\n**Hash**: ${hash}\n**ENS**: ${ens || 'N/A'}`)
    res.sendStatus(200)
  })

  app.post('/moderation/report', async (req, res) => {
    const json = JSON.parse(req.body.toString())
    const { hash, reason, challengeId, challengeSolution } = json
    if (!(await checkChallenge(challengeId, challengeSolution))) {
      res.sendStatus(400)
      return
    }
    await Reports.insert({ hash: Types.asString(hash), reason })
    res.sendStatus(200)
  })

  function moderationGuard(req: Request, res: Response, next: NextFunction) {
    if (config.moderationSecret && req.headers.authorization === config.moderationSecret) {
      next()
      return
    }

    if (readSession(req, config)) {
      next()
      return
    }

    res.sendStatus(401)
  }

  app.get('/admin', (_req, res) => {
    res.sendFile(resolve('public/admin.html'))
  })

  app.post('/moderation/login', (req, res) => {
    try {
      const { username, password } = JSON.parse(req.body.toString())
      const identity = authenticateModerator(Types.asString(username), Types.asString(password), config)

      if (!identity) {
        res.sendStatus(403)
        return
      }

      createSessionCookie(res, identity, config)
      logger.info('moderator signed in', { user: identity.user })
      res.send(identity)
    } catch (error) {
      logger.error('failed to process moderator login', error)
      res.sendStatus(403)
    }
  })

  app.post('/moderation/logout', (_req, res) => {
    clearSessionCookie(res)
    res.sendStatus(200)
  })

  app.get('/moderation/session', (req, res) => {
    const identity = readSession(req, config)

    if (!identity) {
      res.sendStatus(401)
      return
    }

    res.send(identity)
  })

  app.get('/moderation/pending', moderationGuard, async (_req, res) => {
    try {
      res.send(await ApprovalRequests.getPending())
    } catch (error) {
      logger.error('failed to fetch pending approval requests', error)
      res.sendStatus(500)
    }
  })

  app.get('/moderation', moderationGuard, async (_req, res) => {
    const reports = await Reports.getMany()
    const rules = await Rules.getMany()

    res.send({ reports, rules })
  })

  app.post('/moderation/allow', moderationGuard, async (req, res) => {
    const json = JSON.parse(req.body.toString())
    const { hash } = json
    await Rules.insert({ hash: Types.asString(hash), mode: 'allow' })
    res.sendStatus(200)
  })

  app.post('/moderation/deny', moderationGuard, async (req, res) => {
    const json = JSON.parse(req.body.toString())
    const { hash } = json
    await Rules.insert({ hash: Types.asString(hash), mode: 'deny' })
    res.sendStatus(200)
  })

  app.delete('/moderation/rule/:hash', moderationGuard, async (req, res) => {
    await runQuery(`DELETE FROM rules WHERE hash = ?`, Types.asString(req.params.hash))
    res.sendStatus(200)
  })

  if (config.adminHostname) {
    const adminAssets = express.static('public')

    logger.info(`serving the moderation UI at ${config.adminHostname}`)

    // Must run before the proxy, which would otherwise resolve `admin` as a bzz reference.
    app.use((req, res, next) => {
      if (req.hostname !== config.adminHostname) {
        next()
        return
      }

      if (req.path === '/') {
        res.sendFile(resolve('public/admin.html'))
        return
      }

      adminAssets(req, res, () => res.sendStatus(404))
    })
  }

  createProxyEndpoints(app, {
    beeApiUrl: config.beeApiUrl,
    removePinHeader: config.removePinHeader ?? true,
    stampManager,
    hostname: config.hostname,
    instanceName: config.instanceName,
  })

  if (config.homepage) {
    app.use(async (req, res, next) => {
      try {
        const url = Strings.joinUrl([config.beeApiUrl, 'bzz', config.homepage, req.url])
        logger.debug('attempting to fetch homepage', { url })

        const response = await axios.get(url, {
          responseType: 'arraybuffer',
        })

        if (response.status !== 200) {
          logger.error('failed to fetch homepage', { status: response.status })
          res.sendStatus(500)
          return
        }
        const contentType = response.headers['content-type']
        res.set('content-type', contentType ? contentType.toString() : 'application/octet-stream')
        res.send(await response.data)

        return
      } catch (error) {
        next()
      }
    })
  }

  app.use(express.static('public', { extensions: ['html'] }))

  app.use((_req, res) => res.sendStatus(404))

  return app
}

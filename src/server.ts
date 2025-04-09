import { Bee } from '@ethersphere/bee-js'
import axios from 'axios'
import bodyParser from 'body-parser'
import { Arrays, Strings, Types } from 'cafe-utility'
import express, { Application, NextFunction, Request, Response } from 'express'
import { AppConfig } from './config'
import { runQuery } from './database/Database'
import {
    getReportsRows,
    getRulesRows,
    insertApprovalRequestsRow,
    insertReportsRow,
    insertRulesRow
} from './database/Schema'
import { logger } from './logger'
import { register } from './metrics'
import { createProxyEndpoints } from './proxy'
import { checkReadiness } from './readiness'
import { StampManager } from './stamp'

export function createApp(config: AppConfig, stampManager: StampManager): Application {
    const bee = new Bee(config.beeApiUrl)
    const app = express()

    const postSizeLimit = Arrays.getArgument(process.argv, 'post-size-limit', process.env, 'POST_SIZE_LIMIT') || '1gb'

    app.use(bodyParser.raw({ inflate: true, limit: postSizeLimit, type: '*/*' }))

    app.use((req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*')
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.set(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, swarm-postage-batch-id, swarm-deferred-upload'
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

    app.get('/metrics', async (_req, res) => {
        res.write(await register.metrics())
        res.end()
    })

    app.get('/gateway', (_req, res) => res.send({ gateway: true }))

    app.get('/health', (_req, res) => res.sendStatus(200))

    app.get('/readiness', async (_req, res) => {
        const ready = await checkReadiness(bee)

        if (ready) {
            res.sendStatus(200)
        } else {
            res.sendStatus(503)
        }
    })

    app.post('/moderation/approval', async (req, res) => {
        const json = JSON.parse(req.body.toString())
        const { hash, ens } = json
        await insertApprovalRequestsRow({ hash: Types.asString(hash), ens: Types.asNullable(Types.asString, ens) })
        res.sendStatus(200)
    })

    app.post('/moderation/report', async (req, res) => {
        const json = JSON.parse(req.body.toString())
        const { hash, reason } = json
        await insertReportsRow({ hash: Types.asString(hash), reason })
        res.sendStatus(200)
    })

    function moderationGuard(req: Request, res: Response, next: NextFunction) {
        if (!config.moderationSecret) {
            res.sendStatus(401)
            return
        }

        if (req.headers.authorization !== config.moderationSecret) {
            res.sendStatus(401)
            return
        }

        next()
    }

    app.get('/moderation', moderationGuard, async (req, res) => {
        const reports = await getReportsRows()
        const rules = await getRulesRows()

        res.send({ reports, rules })
    })

    app.post('/moderation/allow', moderationGuard, async (req, res) => {
        const json = JSON.parse(req.body.toString())
        const { hash } = json
        await insertRulesRow({ hash: Types.asString(hash), mode: 'allow' })
        res.sendStatus(200)
    })

    app.post('/moderation/deny', moderationGuard, async (req, res) => {
        const json = JSON.parse(req.body.toString())
        const { hash } = json
        await insertRulesRow({ hash: Types.asString(hash), mode: 'allow' })
        res.sendStatus(200)
    })

    app.delete('/moderation/rule/:hash', moderationGuard, async (req, res) => {
        await runQuery(`DELETE FROM rules WHERE hash = ?`, Types.asString(req.params.hash))
        res.sendStatus(200)
    })

    createProxyEndpoints(app, {
        beeApiUrl: config.beeApiUrl,
        removePinHeader: config.removePinHeader ?? true,
        stampManager,
        hostname: config.hostname
    })

    if (config.homepage) {
        app.use(async (req, res, next) => {
            try {
                const url = Strings.joinUrl(config.beeApiUrl, 'bzz', config.homepage, req.url)
                logger.debug('attempting to fetch homepage', { url })

                const response = await axios.get(url, {
                    responseType: 'arraybuffer'
                })

                if (response.status !== 200) {
                    logger.error('failed to fetch homepage', { status: response.status })
                    res.sendStatus(500)
                    return
                }
                const contentType = response.headers['content-type']
                res.set('content-type', contentType || 'application/octet-stream')
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

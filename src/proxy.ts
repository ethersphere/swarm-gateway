import { Reference } from '@ethersphere/bee-js'
import axios from 'axios'
import { Binary, Cache, Dates, Objects, Strings, Types } from 'cafe-utility'
import { Application, Response } from 'express'
import { IncomingHttpHeaders } from 'http'
import { subdomainToBzz } from './bzz-link'
import { AllowedUserAgents } from './database/AllowedUserAgents'
import { getOnlyRowOrNull } from './database/Database'
import { RulesRow } from './database/Rules'
import { Settings, SettingsRow, SettingsRowId } from './database/Settings'
import { TypeHints, TypeHintsRow } from './database/TypeHints'
import { logger } from './logger'
import { getNotFoundPage } from './not-found'
import { StampManager } from './stamp'

export const GET_PROXY_ENDPOINTS = ['/chunks/*', '/bytes/*', '/bzz/*', '/feeds/*']
export const POST_PROXY_ENDPOINTS = ['/chunks', '/bytes', '/bzz', '/soc/*', '/feeds/*']

const DEFAULT_SETTINGS: SettingsRow = {
  id: -1 as SettingsRowId,
  name: 'default',
  defaultWebsiteRule: 'deny',
  defaultFileRule: 'allow',
  defaultEnsRule: 'allow',
  redirectUri: '',
}

const BAD_PATH = `bzz/${'00'.repeat(32)}`
const SWARM_STAMP_HEADER = 'swarm-postage-batch-id'
const SWARM_PRESIGNED_HEADER = 'swarm-postage-stamp'
const SWARM_PIN_HEADER = 'swarm-pin'
const DOT_SEGMENT = /(^|[/\\])\.\.?([/\\]|$)/
const REFERENCE_SEGMENT = /^\/?(?:bzz|bytes|chunks)\/([^/]+)/

interface Options {
  beeApiUrl: string
  removePinHeader: boolean
  instanceName?: string | undefined
  stampManager: StampManager
  hostname?: string
}

export function hasDotSegment(path: string): boolean {
  if (!path.includes('%')) {
    return DOT_SEGMENT.test(path)
  }
  try {
    return DOT_SEGMENT.test(decodeURIComponent(path))
  } catch {
    return true
  }
}

export function getReferenceSegment(path: string): string | undefined {
  return REFERENCE_SEGMENT.exec(path)?.[1]
}

export function getRuleHash(subject: string): string | null {
  return Strings.searchSubstring(subject, x => x.length > 48 && x.startsWith('bah')) || Strings.searchHex(subject, 64)
}

export function getRuleHashes(hash: string): string[] {
  try {
    const reference = new Reference(hash)
    return [reference.toHex(), reference.toCid('manifest'), reference.toCid('feed')]
  } catch {
    return [hash]
  }
}

export function createProxyEndpoints(app: Application, options: Options) {
  app.use(async (req, res, next) => {
    const subdomain = options.hostname && req.hostname ? Strings.before(req.hostname, options.hostname) : null

    if (!options.hostname || !subdomain || req.method !== 'GET') {
      next()
      return
    }

    try {
      const newUrl = await subdomainToBzz(
        subdomain.slice(0, -1), // remove trailing dot
      )
      await fetchAndRespond(
        'GET',
        Strings.joinUrl(['bzz', newUrl, req.path]),
        req.query,
        req.headers,
        req.body,
        res,
        options,
      )
    } catch (error) {
      logger.error('proxy failed', error)
      res.sendStatus(500)
    }
  })
  app.get(GET_PROXY_ENDPOINTS, async (req, res) => {
    if (req.path.includes(BAD_PATH)) {
      res.status(400)
      res.send({ error: 'bad path' })

      return
    }
    await fetchAndRespond('GET', req.path, req.query, req.headers, req.body, res, options)
  })

  app.post(POST_PROXY_ENDPOINTS, async (req, res) => {
    await fetchAndRespond('POST', req.path, req.query, req.headers, req.body, res, options)
  })
}

async function fetchAndRespond(
  method: 'GET' | 'POST',
  path: string,
  query: Record<string, unknown>,
  headers: IncomingHttpHeaders,
  body: unknown,
  res: Response,
  options: Options,
) {
  if (options.removePinHeader) {
    delete headers[SWARM_PIN_HEADER]
  }

  try {
    if (method === 'POST' && !headers[SWARM_PRESIGNED_HEADER] && options.stampManager.enabled) {
      headers[SWARM_STAMP_HEADER] = options.stampManager.getPostageStamp(path.startsWith('/soc/'))
    }
    if (body && Buffer.isBuffer(body)) {
      body = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    }
    let response = await axios({
      method,
      url: Strings.joinUrl([options.beeApiUrl, path]) + Objects.toQueryString(query, true),
      data: body,
      headers,
      timeout: Dates.minutes(20),
      validateStatus: status => status < 500,
      responseType: 'arraybuffer',
      maxRedirects: 0,
    })

    if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
      const uglyUrls = [Strings.joinUrl([options.beeApiUrl, path, 'index.html']) + Objects.toQueryString(query, true)]
      if (!path.endsWith('/')) {
        uglyUrls.push(Strings.joinUrl([options.beeApiUrl, path]) + '.html' + Objects.toQueryString(query, true))
      }
      for (const uglyUrl of uglyUrls) {
        const probeResponse = await axios({
          method,
          url: uglyUrl,
          data: body,
          headers,
          timeout: Dates.minutes(20),
          validateStatus: status => status < 500,
          responseType: 'arraybuffer',
          maxRedirects: 0,
        })

        if (probeResponse.status >= 200 && probeResponse.status < 300) {
          response = probeResponse
        }
      }
    }

    if (response.status === 404) {
      const sliceFn = Objects.getDeep(response.data, 'slice')
      if (Types.isFunction(sliceFn)) {
        const text = (sliceFn.call(response.data, 0, 100) as Buffer).toString('utf8')
        if (text.includes('address not found or incorrect')) {
          res.status(404).contentType('text/html').send(getNotFoundPage())
          return
        }
      }
    }

    let isHtml = false
    let typeLabel: string | null = null

    const typeHints = await Cache.get<TypeHintsRow[]>('typeHints', Dates.minutes(1), async () => {
      try {
        const rows = await TypeHints.getMany()
        return rows
      } catch (error) {
        logger.error('failed to query type hints', error)
        return []
      }
    })

    const sliceFn = Objects.getDeep(response.data, 'slice')
    if (Types.isFunction(sliceFn)) {
      const beginning = (sliceFn.call(response.data, 0, 50) as Buffer).toString('utf8')
      isHtml = beginning.toLowerCase().includes('<!doctype html')

      const matchingTypeHint = typeHints.find(typeHint => {
        const actualHash = Binary.keccak256(sliceFn.call(response.data, typeHint.byteStart, typeHint.byteLength))
        const expectedHash = Binary.hexToUint8Array(typeHint.hash)
        return Binary.equals(actualHash, expectedHash)
      })

      if (matchingTypeHint) {
        typeLabel = matchingTypeHint.label
      }
    }

    if (!isHtml) {
      const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
      if (contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml')) {
        isHtml = true
      } else if ((response.headers['content-disposition'] || '').toLowerCase().includes('.htm')) {
        isHtml = true
      }
    }

    if (isHtml) {
      response.headers['content-type'] = 'text/html'
    }

    const settings = await Cache.get<SettingsRow>('settings', Dates.minutes(1), async () => {
      if (!options.instanceName) {
        return DEFAULT_SETTINGS
      }
      const row = await Settings.getOneOrNull({ name: options.instanceName })
      return row || DEFAULT_SETTINGS
    })

    const reference = getReferenceSegment(path)
    const isEns = reference?.endsWith('.eth') ?? false

    let allowed = typeLabel
      ? true
      : isEns
        ? settings.defaultEnsRule === 'allow'
        : isHtml
          ? settings.defaultWebsiteRule === 'allow'
          : settings.defaultFileRule === 'allow'

    const userAgents = await Cache.get<string[]>('user-agents', Dates.minutes(1), async () => {
      try {
        const rows = await AllowedUserAgents.getMany()
        return rows.map(x => x.userAgent)
      } catch (error) {
        logger.error('failed to query user agents', error)
        return []
      }
    })

    const userAgentMatch = userAgents.some(x => headers['user-agent']?.toLowerCase().includes(x.toLowerCase()))

    if (userAgentMatch) {
      allowed = true
    }

    const hash = getRuleHash(reference ?? path)
    const rule = hash
      ? ((await getOnlyRowOrNull(
          `SELECT mode FROM rules WHERE hash IN (?) ORDER BY mode = 'deny' DESC LIMIT 1`,
          getRuleHashes(hash),
        ).catch(() => null)) as Pick<RulesRow, 'mode'> | null)
      : null

    if (rule) {
      if (rule.mode === 'deny') {
        allowed = false
      } else if (rule.mode === 'allow') {
        allowed = true
      }
    }

    if (!allowed) {
      if (hash) {
        res.redirect(`${settings.redirectUri}/forbidden?hash=${hash}`)
      } else {
        res.redirect(`${settings.redirectUri}/forbidden`)
      }
      return
    }

    if (
      method === 'POST' &&
      (path === '/bytes' || path === '/bzz') &&
      response.status >= 200 &&
      response.status < 300
    ) {
      try {
        const json = JSON.parse(Buffer.from(response.data).toString('utf8'))
        if (json.reference) {
          logger.info('upload', { path, reference: json.reference })
        }
      } catch {
        // response is not JSON
      }
    }

    delete response.headers['content-length']
    delete response.headers['content-encoding']
    delete response.headers['transfer-encoding']
    delete response.headers.connection
    delete response.headers.etag
    delete response.headers['last-modified']
    delete response.headers['cache-control']

    res.set(response.headers).status(response.status).send(response.data)
  } catch (error) {
    logger.error('proxy failed', error)
    res.sendStatus(500)
  }
}

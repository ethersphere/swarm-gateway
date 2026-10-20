import { Reference } from '@ethersphere/bee-js'
import { Binary, Cache, Dates, Objects, Strings } from 'cafe-utility'
import { Application, Response } from 'express'
import { IncomingHttpHeaders } from 'http'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { subdomainToBzz } from './bzz-link'
import { AllowedUserAgents } from './database/AllowedUserAgents'
import { getOnlyRowOrNull } from './database/Database'
import { RulesRow } from './database/Rules'
import { Settings, SettingsRow, SettingsRowId } from './database/Settings'
import { TypeHints, TypeHintsRow } from './database/TypeHints'
import { logger } from './logger'
import { getNotFoundPage } from './not-found'
import { resolveEnsReferences } from './services/ens'
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
const REFERENCE_SEGMENT = /^\/*(?:bzz|bytes|chunks)\/+([^/]+)/i
const HEX_REFERENCE = /^(?:[0-9a-fA-F]{64}){1,2}$/
const CID_REFERENCE = /^bah[a-z2-7]+$/
const ENS_NAME = /\.eth$/i
const NOT_FOUND_MESSAGE = 'address not found or incorrect'
const NOT_FOUND_PEEK_LENGTH = 100
const HTML_PEEK_LENGTH = 50
const EMPTY_HEAD = Buffer.alloc(0)
const UNFORWARDED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'content-length',
  'content-encoding',
])
const UNFORWARDED_RESPONSE_HEADERS = new Set([
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'etag',
  'last-modified',
  'cache-control',
])

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

export function isCanonicalReference(segment: string): boolean {
  if (HEX_REFERENCE.test(segment) || ENS_NAME.test(segment)) {
    return true
  }
  if (!CID_REFERENCE.test(segment)) {
    return false
  }
  try {
    new Reference(segment)
    return true
  } catch {
    return false
  }
}

export function getRuleHash(subject: string): string | null {
  return Strings.searchSubstring(subject, x => x.length > 48 && x.startsWith('bah')) || Strings.searchHex(subject, 64)
}

export function addRuleHashes(hashes: string[], hash: string): string[] {
  try {
    const reference = new Reference(hash)
    hashes.push(reference.toHex(), reference.toCid('manifest'), reference.toCid('feed'))
  } catch {
    hashes.push(hash)
  }
  return hashes
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
  const reference = getReferenceSegment(path)
  if (reference !== undefined && !isCanonicalReference(reference)) {
    res.status(400).send({ error: 'bad reference' })
    return
  }

  if (options.removePinHeader) {
    delete headers[SWARM_PIN_HEADER]
  }

  let response: globalThis.Response | null = null
  try {
    if (method === 'POST' && !headers[SWARM_PRESIGNED_HEADER] && options.stampManager.enabled) {
      headers[SWARM_STAMP_HEADER] = options.stampManager.getPostageStamp(path.startsWith('/soc/'))
    }
    const queryString = Objects.toQueryString(query, true)
    const init: RequestInit = {
      method,
      headers: toBeeHeaders(headers),
      body: method === 'POST' && Buffer.isBuffer(body) ? body : null,
      redirect: 'manual',
    }
    response = await fetchBee(Strings.joinUrl([options.beeApiUrl, path]) + queryString, init)

    if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
      const uglyUrls = [Strings.joinUrl([options.beeApiUrl, path, 'index.html']) + queryString]
      if (!path.endsWith('/')) {
        uglyUrls.push(Strings.joinUrl([options.beeApiUrl, path]) + '.html' + queryString)
      }
      for (const uglyUrl of uglyUrls) {
        const probeResponse = await fetchBee(uglyUrl, init)

        if (probeResponse.ok) {
          discard(response)
          response = probeResponse
        } else {
          discard(probeResponse)
        }
      }
    }

    const typeHints = await Cache.get<TypeHintsRow[]>('typeHints', Dates.minutes(1), async () => {
      try {
        const rows = await TypeHints.getMany()
        return rows
      } catch (error) {
        logger.error('failed to query type hints', error)
        return []
      }
    })

    const isUpload = method === 'POST' && (path === '/bytes' || path === '/bzz') && response.ok
    let headLength = isUpload ? Infinity : NOT_FOUND_PEEK_LENGTH
    for (const typeHint of typeHints) {
      headLength = Math.max(headLength, typeHint.byteStart + typeHint.byteLength)
    }
    const head = response.body ? await readHead(response.body, headLength) : EMPTY_HEAD

    if (response.status === 404 && head.toString('utf8', 0, NOT_FOUND_PEEK_LENGTH).includes(NOT_FOUND_MESSAGE)) {
      res.status(404).contentType('text/html').send(getNotFoundPage())
      return
    }

    let isHtml = head.toString('utf8', 0, HTML_PEEK_LENGTH).toLowerCase().includes('<!doctype html')
    let typeLabel: string | null = null

    const matchingTypeHint = typeHints.find(typeHint => {
      const actualHash = Binary.keccak256(head.subarray(typeHint.byteStart, typeHint.byteStart + typeHint.byteLength))
      const expectedHash = Binary.hexToUint8Array(typeHint.hash)
      return Binary.equals(actualHash, expectedHash)
    })

    if (matchingTypeHint) {
      typeLabel = matchingTypeHint.label
    }

    if (!isHtml) {
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      if (contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml')) {
        isHtml = true
      } else if ((response.headers.get('content-disposition') ?? '').toLowerCase().includes('.htm')) {
        isHtml = true
      }
    }

    const settings = await Cache.get<SettingsRow>('settings', Dates.minutes(1), async () => {
      if (!options.instanceName) {
        return DEFAULT_SETTINGS
      }
      const row = await Settings.getOneOrNull({ name: options.instanceName })
      return row || DEFAULT_SETTINGS
    })

    const isEns = reference !== undefined && ENS_NAME.test(reference)

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
    const hashes: string[] = []
    if (hash) {
      addRuleHashes(hashes, hash)
    }
    if (isEns) {
      for (const ensHash of await resolveEnsReferences(options.beeApiUrl, reference)) {
        addRuleHashes(hashes, ensHash)
      }
    }
    const rule = hashes.length
      ? ((await getOnlyRowOrNull(
          `SELECT hash, mode FROM rules WHERE hash IN (?) ORDER BY mode = 'deny' DESC LIMIT 1`,
          hashes,
        ).catch(() => null)) as Pick<RulesRow, 'hash' | 'mode'> | null)
      : null

    if (rule) {
      if (rule.mode === 'deny') {
        allowed = false
      } else if (rule.mode === 'allow') {
        allowed = true
      }
    }

    if (!allowed) {
      const forbiddenHash = rule?.hash ?? hash
      if (forbiddenHash) {
        res.redirect(`${settings.redirectUri}/forbidden?hash=${forbiddenHash}`)
      } else {
        res.redirect(`${settings.redirectUri}/forbidden`)
      }
      return
    }

    if (isUpload) {
      try {
        const json = JSON.parse(head.toString('utf8'))
        if (json.reference) {
          logger.info('upload', { path, reference: json.reference })
        }
      } catch {
        // response is not JSON
      }
    }

    for (const [key, value] of response.headers) {
      if (!UNFORWARDED_RESPONSE_HEADERS.has(key)) {
        res.set(key, value)
      }
    }
    const contentLength = response.headers.get('content-length')
    if (contentLength && !response.headers.has('content-encoding')) {
      res.set('content-length', contentLength)
    }
    if (isHtml) {
      res.set('content-type', 'text/html')
    }
    res.status(response.status)
    if (head.byteLength) {
      res.write(head)
    }
    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), res)
    } else {
      res.end()
    }
  } catch (error) {
    if (res.headersSent) {
      logger.debug('proxy stream interrupted', error)
      res.destroy()
    } else {
      logger.error('proxy failed', error)
      res.sendStatus(500)
    }
  } finally {
    if (response) {
      discard(response)
    }
  }
}

function toBeeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key in headers) {
    const value = headers[key]
    if (value !== undefined && !UNFORWARDED_REQUEST_HEADERS.has(key)) {
      result[key] = Array.isArray(value) ? value.join(', ') : value
    }
  }
  return result
}

async function fetchBee(url: string, init: RequestInit): Promise<globalThis.Response> {
  const response = await fetch(url, init)
  if (response.status >= 500) {
    discard(response)
    throw Error(`bee responded with ${response.status} for ${url}`)
  }
  return response
}

async function readHead(body: ReadableStream<Uint8Array>, length: number): Promise<Buffer> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < length) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      chunks.push(chunk.value)
      total += chunk.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

function discard(response: globalThis.Response) {
  if (response.body && !response.body.locked) {
    response.body.cancel().catch(() => {})
  }
}

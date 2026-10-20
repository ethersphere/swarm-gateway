process.env.LOG_LEVEL = 'critical'
delete process.env.DATABASE_CONFIG

import { Reference } from '@ethersphere/bee-js'
import { Binary } from 'cafe-utility'
import assert from 'node:assert/strict'
import http, { IncomingHttpHeaders, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib'
import { AppConfig } from '../src/config'
import * as Database from '../src/database/Database'
import { createApp } from '../src/server'
import * as Feed from '../src/services/feed'
import { StampManager } from '../src/stamp'

const STAMP = 'aa'.repeat(32)
const SOC_STAMP = 'bb'.repeat(32)
const UPLOADED = 'cd'.repeat(32)
const FILE = '01'.repeat(32)
const GZIPPED = '02'.repeat(32)
const BROKEN = '03'.repeat(32)
const MISSING = '04'.repeat(32)
const SITE = '05'.repeat(32)
const UNAPPROVED_SITE = '06'.repeat(32)
const HOMEPAGE = '07'.repeat(32)
const OWNER = '08'.repeat(20)
const TOPIC = '09'.repeat(32)
const ENS_SITE = '0a'.repeat(32)
const FILE_CID = new Reference(FILE).toCid('manifest')
const SITE_CID = new Reference(SITE).toCid('manifest')
const FILE_BYTES = Buffer.alloc(3 * 1024 * 1024, 0)
const UPLOAD_BYTES = Buffer.alloc(2 * 1024 * 1024, 0)
const SITE_HTML = '<!DOCTYPE html><h1>site</h1>'
const GZIPPED_TEXT = 'compressed '.repeat(1000)

for (let i = 0; i < FILE_BYTES.length; i++) {
  FILE_BYTES[i] = (i * 31) & 0xff
  UPLOAD_BYTES[i % UPLOAD_BYTES.length] = (i * 17) & 0xff
}

interface BeeRequest {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: Buffer
}

interface GatewayResponse {
  status: number
  headers: IncomingHttpHeaders
  body: Buffer
}

const beeRequests: BeeRequest[] = []
const servers: Server[] = []
const challenges = new Map<number, { id: number; nonce: string; difficulty: number; solution: string | null }>()
const inserts: [string, Record<string, unknown>][] = []
let onBeeData: (() => void) | null = null

function respondSite(res: http.ServerResponse, body: string) {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(body)
}

function respondBee(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) {
  const url = req.url ?? ''
  beeRequests.push({ method: req.method ?? '', url, headers: req.headers, body })
  if (req.method === 'POST') {
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ reference: UPLOADED }))
  } else if (url === '/readiness') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 200, status: 'ready', version: '2.6.0', apiVersion: '7.3.0' }))
  } else if (url === `/bytes/${FILE}` && req.headers.range === 'bytes=10-19') {
    res.writeHead(206, {
      'content-type': 'application/octet-stream',
      'content-range': `bytes 10-19/${FILE_BYTES.length}`,
    })
    res.end(FILE_BYTES.subarray(10, 20))
  } else if (url.startsWith(`/bytes/${FILE}`) || url === `/bytes/${FILE_CID}`) {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': FILE_BYTES.length,
      etag: `"${FILE}"`,
      'cache-control': 'no-store',
      'swarm-custom': 'kept',
    })
    res.end(FILE_BYTES)
  } else if (url === `/bytes/${GZIPPED}`) {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' })
    res.end(gzipSync(GZIPPED_TEXT))
  } else if (url === `/bytes/${BROKEN}`) {
    res.writeHead(500)
    res.end()
  } else if (url.startsWith(`/bzz/${MISSING}`)) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 404, message: 'address not found or incorrect' }))
  } else if ([SITE, SITE_CID, UNAPPROVED_SITE, ENS_SITE].some(x => url === `/bzz/${x}/`)) {
    respondSite(res, SITE_HTML)
  } else if (url === `/bzz/${SITE}/about.html`) {
    respondSite(res, '<!DOCTYPE html><h1>about</h1>')
  } else if (url === `/bzz/${HOMEPAGE}/`) {
    respondSite(res, '<!DOCTYPE html><h1>home</h1>')
  } else if (url === '/bzz/site.eth/') {
    respondSite(res, SITE_HTML)
  } else if (url === '/bytes/site.eth' && req.method === 'HEAD') {
    res.writeHead(200, { etag: `"${ENS_SITE}"` })
    res.end()
  } else if (url === `/feeds/${OWNER}/${TOPIC}`) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'swarm-feed-index': '0000000000000005' })
    res.end(FILE_BYTES.subarray(0, 32))
  } else {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 404, message: 'Not Found' }))
  }
}

const bee = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', chunk => {
    chunks.push(chunk)
    onBeeData?.()
  })
  req.on('end', () => respondBee(req, res, Buffer.concat(chunks)))
})

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function startGateway(config: Partial<AppConfig> = {}): Promise<number> {
  const beeApiUrl = `http://127.0.0.1:${(bee.address() as AddressInfo).port}`
  const stampManager = new StampManager(beeApiUrl, {
    hardcodedStamp: STAMP,
    hardcodedStampSoc: SOC_STAMP,
    postageThresholdUsage: 0.85,
    postageThresholdSeconds: 3600,
    postageKeepAlive: false,
  })
  await stampManager.start()
  const app = createApp(
    { beeApiUrl, hostname: 'gw.local', removePinHeader: true, moderationSecret: 'moderator', ...config },
    stampManager,
  )
  return listen(http.createServer(app))
}

function request(
  port: number,
  method: string,
  path: string,
  headers: http.OutgoingHttpHeaders = {},
  body?: Buffer | string,
): Promise<GatewayResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

function lastBeeRequest(): BeeRequest {
  const beeRequest = beeRequests.at(-1)
  assert.ok(beeRequest)
  return beeRequest
}

function solveChallenge(nonce: string, difficulty: number): string {
  const prefix = '0'.repeat(difficulty)
  const nonceBytes = Binary.hexToUint8Array(nonce)
  for (let i = 0; ; i++) {
    const solution = i.toString(16).padStart(8, '0')
    const hash = Binary.keccak256(Binary.concatBytes(nonceBytes, Binary.hexToUint8Array(solution)))
    if (Binary.uint8ArrayToHex(hash).startsWith(prefix)) {
      return solution
    }
  }
}

before(async () => {
  mock.method(Database, 'getRows', async (query: string) =>
    query.includes('FROM allowedUserAgents') ? [{ userAgent: 'TrustedBot' }] : [],
  )
  mock.method(Database, 'getOnlyRowOrNull', async (query: string, ...params: unknown[]) => {
    if (query.includes('FROM rules')) {
      const hashes = params[0] as string[]
      return hashes.includes(SITE) || hashes.includes(ENS_SITE) ? { hash: SITE, mode: 'allow' } : null
    }
    if (query.includes('FROM challenges')) {
      return challenges.get(params[0] as number) ?? null
    }
    return null
  })
  mock.method(Database, 'insert', async (table: string, object: Record<string, unknown>) => {
    inserts.push([table, object])
    if (table === 'challenges') {
      const id = challenges.size + 1
      challenges.set(id, { id, nonce: object.nonce as string, difficulty: object.difficulty as number, solution: null })
      return id
    }
    return inserts.length
  })
  mock.method(Database, 'update', async (table: string, id: number, object: Record<string, unknown>) => {
    const challenge = challenges.get(id)
    if (table === 'challenges' && challenge) {
      challenge.solution = object.solution as string
    }
    return 1
  })
  mock.method(Feed, 'resolveFeed', async () => null)
  await listen(bee)
})

after(() => {
  mock.restoreAll()
  for (const server of servers) {
    server.close()
  }
})

beforeEach(() => {
  beeRequests.length = 0
  inserts.length = 0
})

describe('service endpoints', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('reports health', async () => {
    assert.equal((await request(port, 'GET', '/health')).status, 200)
  })

  it('identifies as a gateway', async () => {
    assert.deepEqual(JSON.parse((await request(port, 'GET', '/gateway')).body.toString()), { gateway: true })
  })

  it('reports readiness from bee', async () => {
    assert.equal((await request(port, 'GET', '/readiness')).status, 200)
  })

  it('answers cors preflight', async () => {
    const response = await request(port, 'OPTIONS', '/bytes')
    assert.equal(response.status, 200)
    assert.equal(response.headers['access-control-allow-origin'], '*')
  })

  it('serves static pages', async () => {
    const response = await request(port, 'GET', '/forbidden')
    assert.equal(response.status, 200)
    assert.match(String(response.headers['content-type']), /text\/html/)
  })
})

describe('uploads', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('forwards bytes uploads with the managed stamp', async () => {
    const response = await request(
      port,
      'POST',
      '/bytes',
      { 'content-type': 'application/octet-stream', 'swarm-pin': 'true' },
      UPLOAD_BYTES,
    )
    assert.equal(response.status, 201)
    assert.deepEqual(JSON.parse(response.body.toString()), { reference: UPLOADED })
    const beeRequest = lastBeeRequest()
    assert.equal(beeRequest.url, '/bytes')
    assert.equal(beeRequest.headers['swarm-postage-batch-id'], STAMP)
    assert.equal(beeRequest.headers['content-type'], 'application/octet-stream')
    assert.equal(beeRequest.headers['swarm-pin'], undefined)
    assert.ok(beeRequest.body.equals(UPLOAD_BYTES))
  })

  it('forwards bzz uploads with their query string', async () => {
    const response = await request(port, 'POST', '/bzz?name=a%20b.txt', { 'content-type': 'text/plain' }, 'hello')
    assert.equal(response.status, 201)
    assert.equal(lastBeeRequest().url, '/bzz?name=a%20b.txt')
    assert.equal(lastBeeRequest().body.toString(), 'hello')
  })

  it('streams uploads to bee before the client finishes', { timeout: 5000 }, async () => {
    const received = new Promise<void>(resolve => (onBeeData = resolve))
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/bytes' })
    const status = new Promise<number | undefined>(resolve =>
      req.on('response', res => {
        res.resume()
        resolve(res.statusCode)
      }),
    )
    req.write(UPLOAD_BYTES)
    await received
    onBeeData = null
    req.end('tail')
    assert.equal(await status, 201)
    assert.ok(lastBeeRequest().body.equals(Buffer.concat([UPLOAD_BYTES, Buffer.from('tail')])))
  })

  it('forwards encoded uploads decoded', async () => {
    for (const [encoding, body] of [
      ['gzip', gzipSync('inflated')],
      ['deflate', deflateSync('inflated')],
    ] as const) {
      assert.equal((await request(port, 'POST', '/bytes', { 'content-encoding': encoding }, body)).status, 201)
      assert.equal(lastBeeRequest().body.toString(), 'inflated')
      assert.equal(lastBeeRequest().headers['content-encoding'], undefined)
    }
  })

  it('rejects unsupported content encodings', async () => {
    const response = await request(port, 'POST', '/bytes', { 'content-encoding': 'br' }, brotliCompressSync('x'))
    assert.equal(response.status, 415)
    assert.deepEqual(beeRequests, [])
  })

  it('uses the soc stamp for single owner chunks', async () => {
    await request(port, 'POST', `/soc/${OWNER}/${TOPIC}?sig=00`, {}, 'chunk')
    assert.equal(lastBeeRequest().headers['swarm-postage-batch-id'], SOC_STAMP)
  })

  it('keeps presigned stamps untouched', async () => {
    await request(port, 'POST', '/chunks', { 'swarm-postage-stamp': 'ff' }, 'chunk')
    assert.equal(lastBeeRequest().headers['swarm-postage-batch-id'], undefined)
    assert.equal(lastBeeRequest().headers['swarm-postage-stamp'], 'ff')
  })

  it('does not forward the client host', async () => {
    await request(port, 'POST', '/bytes', { host: 'client.example' }, 'x')
    assert.notEqual(lastBeeRequest().headers.host, 'client.example')
  })
})

describe('upload size limit', () => {
  let port: number

  before(async () => {
    process.env.POST_SIZE_LIMIT = '1kb'
    port = await startGateway()
    delete process.env.POST_SIZE_LIMIT
  })

  it('accepts uploads within the limit', async () => {
    assert.equal((await request(port, 'POST', '/bytes', {}, Buffer.alloc(1024))).status, 201)
  })

  it('rejects uploads declaring a larger size', async () => {
    assert.equal((await request(port, 'POST', '/bytes', {}, Buffer.alloc(1025))).status, 413)
    assert.deepEqual(beeRequests, [])
  })

  it('rejects chunked uploads growing past the limit', async () => {
    const headers = { 'transfer-encoding': 'chunked' }
    assert.equal((await request(port, 'POST', '/bytes', headers, Buffer.alloc(4096))).status, 413)
  })

  it('applies the limit to decoded uploads', async () => {
    const headers = { 'content-encoding': 'gzip' }
    assert.equal((await request(port, 'POST', '/bytes', headers, gzipSync(Buffer.alloc(4096)))).status, 413)
  })
})

describe('downloads', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('streams large files intact', async () => {
    const response = await request(port, 'GET', `/bytes/${FILE}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers['content-length'], String(FILE_BYTES.length))
    assert.equal(response.headers['content-type'], 'application/octet-stream')
    assert.equal(response.headers['swarm-custom'], 'kept')
    assert.equal(response.headers.etag, undefined)
    assert.equal(response.headers['cache-control'], undefined)
    assert.ok(response.body.equals(FILE_BYTES))
  })

  it('forwards the query string', async () => {
    await request(port, 'GET', `/bytes/${FILE}?a=1&b=two%20words`)
    assert.equal(lastBeeRequest().url, `/bytes/${FILE}?a=1&b=two%20words`)
  })

  it('serves ranges', async () => {
    const response = await request(port, 'GET', `/bytes/${FILE}`, { range: 'bytes=10-19' })
    assert.equal(response.status, 206)
    assert.equal(response.headers['content-range'], `bytes 10-19/${FILE_BYTES.length}`)
    assert.ok(response.body.equals(FILE_BYTES.subarray(10, 20)))
  })

  it('answers head requests without a body', async () => {
    const response = await request(port, 'HEAD', `/bytes/${FILE}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers['content-length'], String(FILE_BYTES.length))
    assert.equal(response.body.length, 0)
  })

  it('serves compressed responses decoded', async () => {
    const response = await request(port, 'GET', `/bytes/${GZIPPED}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers['content-encoding'], undefined)
    assert.equal(response.body.toString(), GZIPPED_TEXT)
  })

  it('serves cid references', async () => {
    const response = await request(port, 'GET', `/bytes/${FILE_CID}`)
    assert.equal(response.status, 200)
    assert.ok(response.body.equals(FILE_BYTES))
  })

  it('serves feeds with their index', async () => {
    const response = await request(port, 'GET', `/feeds/${OWNER}/${TOPIC}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers['swarm-feed-index'], '0000000000000005')
    assert.match(String(response.headers['access-control-expose-headers']), /Swarm-Feed-Index/)
  })

  it('shows the not found page for unknown references', async () => {
    const response = await request(port, 'GET', `/bzz/${MISSING}/`)
    assert.equal(response.status, 404)
    assert.match(response.body.toString(), /<!DOCTYPE html>/)
  })

  it('answers 500 when bee fails', async () => {
    assert.equal((await request(port, 'GET', `/bytes/${BROKEN}`)).status, 500)
  })
})

describe('websites', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('serves approved websites as html', async () => {
    const response = await request(port, 'GET', `/bzz/${SITE}/`)
    assert.equal(response.status, 200)
    assert.match(String(response.headers['content-type']), /^text\/html/)
    assert.equal(response.body.toString(), SITE_HTML)
  })

  it('serves approved websites by cid', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${SITE_CID}/`)).status, 200)
  })

  it('falls back to html files for clean urls', async () => {
    const response = await request(port, 'GET', `/bzz/${SITE}/about`)
    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), '<!DOCTYPE html><h1>about</h1>')
  })

  it('redirects unapproved websites to the forbidden page', async () => {
    const response = await request(port, 'GET', `/bzz/${UNAPPROVED_SITE}/`)
    assert.equal(response.status, 302)
    assert.equal(response.headers.location, `/forbidden?hash=${UNAPPROVED_SITE}`)
  })

  it('serves unapproved websites to allowed user agents', async () => {
    const response = await request(port, 'GET', `/bzz/${UNAPPROVED_SITE}/`, { 'user-agent': 'Mozilla trustedbot/1.0' })
    assert.equal(response.status, 200)
  })

  it('serves websites behind ens names', async () => {
    const response = await request(port, 'GET', '/bzz/site.eth/')
    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), SITE_HTML)
  })
})

describe('subdomains', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('serves cid subdomains', async () => {
    const response = await request(port, 'GET', '/', { host: `${SITE_CID}.gw.local` })
    assert.equal(response.status, 200)
    assert.equal(lastBeeRequest().url, `/bzz/${SITE}/`)
  })

  it('serves ens subdomains', async () => {
    const response = await request(port, 'GET', '/', { host: 'site.gw.local' })
    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), SITE_HTML)
  })
})

describe('homepage', () => {
  let port: number

  before(async () => {
    port = await startGateway({ homepage: HOMEPAGE })
  })

  it('serves the homepage at the root', async () => {
    const response = await request(port, 'GET', '/')
    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), '<!DOCTYPE html><h1>home</h1>')
  })

  it('falls back to static files', async () => {
    assert.equal((await request(port, 'GET', '/forbidden')).status, 200)
  })
})

describe('moderation', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  async function solvedChallenge() {
    const response = await request(port, 'POST', '/challenge')
    assert.equal(response.status, 200)
    const { id, nonce, difficulty } = JSON.parse(response.body.toString())
    return { challengeId: id, challengeSolution: solveChallenge(nonce, difficulty) }
  }

  it('accepts a report with a solved challenge', async () => {
    const body = JSON.stringify({ hash: UNAPPROVED_SITE, reason: 'spam', ...(await solvedChallenge()) })
    assert.equal((await request(port, 'POST', '/moderation/report', {}, body)).status, 200)
    assert.deepEqual(inserts.at(-1), ['reports', { hash: UNAPPROVED_SITE, reason: 'spam' }])
  })

  it('rejects a reused challenge', async () => {
    const challenge = await solvedChallenge()
    const body = JSON.stringify({ hash: UNAPPROVED_SITE, reason: 'spam', ...challenge })
    assert.equal((await request(port, 'POST', '/moderation/report', {}, body)).status, 200)
    assert.equal((await request(port, 'POST', '/moderation/report', {}, body)).status, 400)
  })

  it('accepts an approval request with a solved challenge', async () => {
    const body = JSON.stringify({ hash: UNAPPROVED_SITE, ens: 'site.eth', ...(await solvedChallenge()) })
    assert.equal((await request(port, 'POST', '/moderation/approval', {}, body)).status, 200)
    assert.equal(inserts.at(-1)?.[0], 'approvalRequests')
  })

  it('lets moderators allow and deny hashes', async () => {
    const headers = { authorization: 'moderator' }
    const body = JSON.stringify({ hash: UNAPPROVED_SITE })
    assert.equal((await request(port, 'POST', '/moderation/allow', headers, body)).status, 200)
    assert.equal((await request(port, 'POST', '/moderation/deny', headers, body)).status, 200)
    assert.deepEqual(
      inserts.map(([table, row]) => [table, row.mode]),
      [
        ['rules', 'allow'],
        ['rules', 'deny'],
      ],
    )
  })

  it('rejects moderators without the secret', async () => {
    assert.equal((await request(port, 'POST', '/moderation/deny', {}, '{}')).status, 401)
  })
})

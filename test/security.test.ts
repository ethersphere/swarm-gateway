process.env.LOG_LEVEL = 'critical'
delete process.env.DATABASE_CONFIG

import { Reference } from '@ethersphere/bee-js'
import { Binary, Cache } from 'cafe-utility'
import assert from 'node:assert/strict'
import http, { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { after, before, describe, it, mock } from 'node:test'
import { AppConfig } from '../src/config'
import * as Database from '../src/database/Database'
import { addRuleHashes, getReferenceSegment, getRuleHash } from '../src/proxy'
import { createApp } from '../src/server'
import * as Feed from '../src/services/feed'
import { StampManager } from '../src/stamp'

const HASH = 'cd'.repeat(32)
const OTHER_HASH = 'ef'.repeat(32)
const HOMEPAGE = 'ab'.repeat(32)
const DENIED_HASH = '12'.repeat(32)
const FEED_MANIFEST = '34'.repeat(32)

const ENS_RECORDS: Record<string, string> = {
  '/bytes/denied.eth': DENIED_HASH,
  '/bytes/feed.eth': FEED_MANIFEST,
  '/bytes/other.eth': OTHER_HASH,
}

const beeRequests: string[] = []
const servers: Server[] = []

const bee = http.createServer((req, res) => {
  beeRequests.push(`${req.method} ${req.url}`)
  req.resume()
  const url = req.url ?? ''
  if (req.method === 'HEAD') {
    const reference = ENS_RECORDS[url.toLowerCase()]
    res.writeHead(reference ? 200 : 404, reference ? { etag: `"${reference}"` } : {})
    res.end()
  } else if (url.endsWith('/charset-html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<html><script>alert(1)</script></html>')
  } else if (url.includes('site')) {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!DOCTYPE html><h1>site</h1>')
  } else {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  }
})

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function startGateway(config: Partial<AppConfig> = {}): Promise<number> {
  const beeApiUrl = `http://127.0.0.1:${(bee.address() as AddressInfo).port}`
  const stampManager = new StampManager(beeApiUrl, {
    hardcodedStamp: 'aa'.repeat(32),
    postageThresholdUsage: 0.85,
    postageThresholdSeconds: 3600,
    postageKeepAlive: false,
  })
  await stampManager.start()
  const app = createApp({ beeApiUrl, hostname: 'gw.local', removePinHeader: true, ...config }, stampManager)
  return listen(http.createServer(app))
}

function request(
  port: number,
  method: string,
  path: string,
  headers: http.OutgoingHttpHeaders = {},
  body?: string,
): Promise<{ status: number; location: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

before(() => listen(bee))

after(() => {
  for (const server of servers) {
    server.close()
  }
})

describe('path traversal into the Bee API', () => {
  let port: number
  let homepagePort: number

  before(async () => {
    port = await startGateway()
    homepagePort = await startGateway({ homepage: HOMEPAGE })
  })

  const attempts: [string, string][] = [
    ['POST', '/feeds/../stamps/1000000/17'],
    ['POST', '/soc/%2e%2e/stamps/1000000/17'],
    ['POST', '/soc/%2E%2E/stamps/1000000/17'],
    ['POST', '/bzz/..%2fstamps/1000000/17'],
    ['POST', '/feeds/..\\stamps/1000000/17'],
    ['POST', '/feeds/x/./../../stamps/1000000/17'],
    ['GET', '/bytes/../wallet'],
    ['GET', '/bzz/%2e%2e/stamps'],
    ['GET', `/bzz/${HASH}/../../wallet`],
    ['GET', '/%2e%2e/%2e%2e/wallet'],
  ]

  for (const [method, path] of attempts) {
    it(`rejects ${method} ${path}`, async () => {
      beeRequests.length = 0
      assert.equal((await request(port, method, path)).status, 400)
      assert.equal((await request(homepagePort, method, path)).status, 400)
      assert.deepEqual(beeRequests, [])
    })
  }

  it('rejects traversal through a subdomain', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, 'GET', '/../../stamps', { host: `${HASH}.gw.local` })).status, 400)
    assert.deepEqual(beeRequests, [])
  })

  for (const host of ['../wallet#.gw.local', '../stamps?.gw.local', `${HASH}/../../wallet#.gw.local`]) {
    it(`rejects traversal through the host ${host}`, async () => {
      beeRequests.length = 0
      assert.equal((await request(port, 'GET', '/', { host })).status, 400)
      assert.deepEqual(beeRequests, [])
    })
  }

  it('keeps the homepage query string out of the joined path', async () => {
    beeRequests.length = 0
    await request(homepagePort, 'GET', '/?a=/../../../wallet')
    assert.ok(beeRequests.length > 0)
    for (const beeRequest of beeRequests) {
      assert.ok(beeRequest.startsWith(`GET /bzz/${HOMEPAGE}`), beeRequest)
    }
  })

  it('still serves paths that merely contain dots', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${HASH}/.well-known/a..b.json`)).status, 200)
  })
})

describe('soft auth', () => {
  let port: number

  before(async () => {
    process.env.SOFT_AUTH = 'true'
    port = await startGateway({ authorization: 'secret' })
  })

  after(() => {
    delete process.env.SOFT_AUTH
  })

  it('rejects unauthorized uploads', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, 'POST', '/bytes')).status, 403)
    assert.deepEqual(beeRequests, [])
  })

  it('accepts authorized uploads', async () => {
    assert.equal((await request(port, 'POST', '/bytes', { authorization: 'secret' })).status, 200)
  })

  it('allows unauthorized downloads', async () => {
    assert.equal((await request(port, 'GET', `/bytes/${HASH}`)).status, 200)
  })
})

describe('website moderation', () => {
  let port: number

  before(async () => {
    port = await startGateway()
  })

  it('denies an unapproved website', async () => {
    const response = await request(port, 'GET', `/bzz/${HASH}/site`)
    assert.equal(response.status, 302)
    assert.equal(response.location, `/forbidden?hash=${HASH}`)
  })

  it('denies an unapproved website behind a path ending in .eth', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${HASH}/site.eth`)).status, 302)
  })

  it('denies html served with a content type parameter', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${HASH}/charset-html`)).status, 302)
  })

  it('still applies the ens rule to ens names', async () => {
    assert.equal((await request(port, 'GET', '/bzz/site.eth/')).status, 200)
  })

  it('still allows plain files', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${HASH}/data`)).status, 200)
  })
})

describe('rule hash', () => {
  const otherCid = new Reference(OTHER_HASH).toCid('manifest')

  it('comes from the reference segment, not from later path segments', () => {
    assert.equal(getRuleHash(getReferenceSegment(`/bzz/${HASH}/${otherCid}`) ?? ''), HASH)
    assert.equal(getRuleHash(getReferenceSegment(`/bzz/${HASH}/${OTHER_HASH}`) ?? ''), HASH)
    assert.equal(getRuleHash(getReferenceSegment(`bzz/${otherCid}/${HASH}`) ?? ''), otherCid)
  })

  it('falls back to the whole path for feeds', () => {
    const path = `/feeds/${'12'.repeat(20)}/${OTHER_HASH}`
    assert.equal(getReferenceSegment(path), undefined)
    assert.equal(getRuleHash(path), OTHER_HASH)
  })

  it('matches every encoding of a reference', () => {
    const forms = [HASH, new Reference(HASH).toCid('manifest'), new Reference(HASH).toCid('feed')]
    for (const form of forms) {
      assert.deepEqual(addRuleHashes([], form), forms)
    }
  })

  it('keeps unparseable hashes as they are', () => {
    assert.deepEqual(addRuleHashes([], 'bahnotacid'), ['bahnotacid'])
  })
})

describe('ens moderation', () => {
  let port: number

  before(async () => {
    mock.method(Database, 'getOnlyRowOrNull', async (_query: string, ...params: unknown[]) =>
      Array.isArray(params[0]) && params[0].includes(DENIED_HASH) ? { hash: DENIED_HASH, mode: 'deny' } : null,
    )
    mock.method(Database, 'getRows', async () => [])
    mock.method(Feed, 'resolveFeed', async (_beeApiUrl: string, hash: string) =>
      hash === FEED_MANIFEST ? { index: '1', reference: DENIED_HASH, owner: null, topic: null } : null,
    )
    port = await startGateway()
  })

  after(() => {
    mock.restoreAll()
    Cache.delete('rewrites')
  })

  it('denies a denied hash behind an ens name', async () => {
    const response = await request(port, 'GET', '/bzz/denied.eth/')
    assert.equal(response.status, 302)
    assert.equal(response.location, `/forbidden?hash=${DENIED_HASH}`)
  })

  it('denies a denied hash behind an ens subdomain', async () => {
    assert.equal((await request(port, 'GET', '/', { host: 'denied.gw.local' })).status, 302)
  })

  it('matches ens names case-insensitively', async () => {
    assert.equal((await request(port, 'GET', '/bzz/DENIED.ETH/')).status, 302)
  })

  it('denies a denied hash served by the feed behind an ens name', async () => {
    assert.equal((await request(port, 'GET', '/bzz/feed.eth/')).status, 302)
  })

  it('allows ens names pointing to other content', async () => {
    assert.equal((await request(port, 'GET', '/bzz/other.eth/')).status, 200)
  })

  it('falls back to the ens rule when the name does not resolve', async () => {
    assert.equal((await request(port, 'GET', '/bzz/unknown.eth/')).status, 200)
  })
})

describe('non-canonical references', () => {
  let port: number

  const cid = new Reference(DENIED_HASH).toCid('manifest')
  const upperCid = `B${cid.slice(1).toUpperCase()}`
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0xfa, 0x01, 0x1b, 0x20]), Buffer.from(DENIED_HASH, 'hex')])
  const percentEncoded = DENIED_HASH.replace(/./g, x => `%${x.charCodeAt(0).toString(16)}`)

  before(async () => {
    mock.method(Database, 'getOnlyRowOrNull', async (_query: string, ...params: unknown[]) =>
      Array.isArray(params[0]) && params[0].includes(DENIED_HASH) ? { hash: DENIED_HASH, mode: 'deny' } : null,
    )
    port = await startGateway()
  })

  after(() => {
    mock.restoreAll()
  })

  const bypasses = [
    `/bzz/${upperCid}/`,
    `/bzz/f${cidBytes.toString('hex')}/`,
    `/bzz/m${cidBytes.toString('base64').replace(/=+$/, '')}/`,
    `/bzz//${upperCid}/`,
    `/BZZ/${upperCid}/`,
    `/bytes/f${cidBytes.toString('hex')}`,
    `/bzz/${percentEncoded}/`,
    `/bzz/${DENIED_HASH}%2fsite.eth/`,
    `/bzz/${DENIED_HASH}%2Fsite.eth/index.html`,
    `/bzz/${DENIED_HASH}%5csite.eth/`,
  ]

  for (const path of bypasses) {
    it(`rejects ${path}`, async () => {
      beeRequests.length = 0
      assert.equal((await request(port, 'GET', path)).status, 400)
      assert.deepEqual(beeRequests, [])
    })
  }

  const canonical = [
    `/bzz/${DENIED_HASH}/`,
    `/bzz/${DENIED_HASH.toUpperCase()}/`,
    `/bzz/${cid}/`,
    `/bzz//${DENIED_HASH}/`,
  ]

  for (const path of canonical) {
    it(`still denies ${path}`, async () => {
      assert.equal((await request(port, 'GET', path)).status, 302)
    })
  }
})

describe('subdomain rewrites', () => {
  let port: number

  before(async () => {
    Cache.delete('rewrites')
    mock.method(Database, 'getRows', async (query: string) =>
      query.includes('FROM rewrites') ? [{ subdomain: 'rewritten', target: OTHER_HASH }] : [],
    )
    port = await startGateway()
  })

  after(() => {
    mock.restoreAll()
    Cache.delete('rewrites')
  })

  it('resolves every subdomain on its own', async () => {
    const expected = [
      ['plain', 'plain.eth'],
      ['rewritten', OTHER_HASH],
      ['another', 'another.eth'],
    ]
    for (const [subdomain, target] of expected) {
      beeRequests.length = 0
      await request(port, 'GET', '/', { host: `${subdomain}.gw.local` })
      assert.ok(beeRequests.includes(`GET /bzz/${target}/`), `${subdomain}: ${beeRequests.join(', ')}`)
    }
  })
})

describe('type hints', () => {
  let port: number

  before(async () => {
    Cache.delete('typeHints')
    const hash = Binary.uint8ArrayToHex(Binary.keccak256(Buffer.from('<h1>')))
    mock.method(Database, 'getRows', async (query: string) =>
      query.includes('FROM typeHints')
        ? [{ byteStart: '<!DOCTYPE html>'.length, byteLength: 4, hash, label: 'h1' }]
        : [],
    )
    port = await startGateway()
  })

  after(() => {
    mock.restoreAll()
    Cache.delete('typeHints')
  })

  it('matches bytes at a non-zero offset', async () => {
    assert.equal((await request(port, 'GET', `/bzz/${HASH}/site`)).status, 200)
  })
})

describe('failing requests', () => {
  let port: number

  before(async () => {
    mock.method(Database, 'getOnlyRowOrNull', async () => null)
    port = await startGateway({ moderationSecret: 'moderator' })
  })

  after(() => {
    mock.restoreAll()
  })

  it('answers a malformed approval request', { timeout: 5000 }, async () => {
    assert.equal((await request(port, 'POST', '/moderation/approval', {}, 'not json')).status, 500)
  })

  it('rejects an unknown challenge', { timeout: 5000 }, async () => {
    const body = JSON.stringify({ hash: HASH, challengeId: 1, challengeSolution: '00' })
    assert.equal((await request(port, 'POST', '/moderation/approval', {}, body)).status, 400)
  })

  it('answers when the database fails', { timeout: 5000 }, async () => {
    assert.equal((await request(port, 'POST', '/challenge')).status, 500)
  })

  it('answers a failed moderation action', { timeout: 5000 }, async () => {
    const body = JSON.stringify({ hash: HASH })
    assert.equal((await request(port, 'POST', '/moderation/deny', { authorization: 'moderator' }, body)).status, 500)
  })
})

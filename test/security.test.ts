process.env.LOG_LEVEL = 'critical'
delete process.env.DATABASE_CONFIG

import { Reference } from '@ethersphere/bee-js'
import assert from 'node:assert/strict'
import http, { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { AppConfig } from '../src/config'
import { getReferenceSegment, getRuleHash, getRuleHashes } from '../src/proxy'
import { createApp } from '../src/server'
import { StampManager } from '../src/stamp'

const HASH = 'cd'.repeat(32)
const OTHER_HASH = 'ef'.repeat(32)
const HOMEPAGE = 'ab'.repeat(32)

const beeRequests: string[] = []
const servers: Server[] = []

const bee = http.createServer((req, res) => {
  beeRequests.push(`${req.method} ${req.url}`)
  req.resume()
  const url = req.url ?? ''
  if (url.endsWith('/charset-html')) {
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
): Promise<{ status: number; location: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location }))
    })
    req.on('error', reject)
    req.end()
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
      assert.deepEqual(getRuleHashes(form), forms)
    }
  })

  it('keeps unparseable hashes as they are', () => {
    assert.deepEqual(getRuleHashes('bahnotacid'), ['bahnotacid'])
  })
})

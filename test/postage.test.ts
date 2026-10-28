process.env.LOG_LEVEL = 'critical'
delete process.env.DATABASE_CONFIG

import assert from 'node:assert/strict'
import http, { IncomingHttpHeaders, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../src/server'
import { PostageBatchDispenserService } from '../src/services/postage-batch-dispenser'
import { StampManager } from '../src/stamp'

const STAMP = 'aa'.repeat(32)
const SOC_STAMP = 'bb'.repeat(32)
const ALICE_BATCH = 'a1'.repeat(32)
const BOB_BATCH = 'b1'.repeat(32)
const TOKEN_BATCHES = new Map([
  ['alice', ALICE_BATCH],
  ['bob', BOB_BATCH],
])
const PRESIGNED_STAMP = 'ee'.repeat(32) + '00'.repeat(81)
const SOC_PATH = `/soc/${'08'.repeat(20)}/${'09'.repeat(32)}?sig=${'0a'.repeat(65)}`
const DISPENSER_DELAY = 10
const ROUNDS = 10

interface Upload {
  name: string
  path: string
  headers: http.OutgoingHttpHeaders
  batchId?: string
  stamp?: string
}

const UPLOADS: Upload[] = [
  { name: 'gateway batch for bytes', path: '/bytes', headers: {}, batchId: STAMP },
  { name: 'gateway batch for bzz', path: '/bzz', headers: {}, batchId: STAMP },
  { name: 'gateway batch for chunks', path: '/chunks', headers: {}, batchId: STAMP },
  { name: 'gateway batch for soc', path: SOC_PATH, headers: {}, batchId: SOC_STAMP },
  {
    name: 'presigned chunk',
    path: '/chunks',
    headers: { 'swarm-postage-stamp': PRESIGNED_STAMP },
    stamp: PRESIGNED_STAMP,
  },
  {
    name: 'presigned soc',
    path: SOC_PATH,
    headers: { 'swarm-postage-stamp': PRESIGNED_STAMP },
    stamp: PRESIGNED_STAMP,
  },
  {
    name: 'alice token for bytes',
    path: '/bytes',
    headers: { 'x-swarm-postage-token': 'alice' },
    batchId: ALICE_BATCH,
  },
  { name: 'bob token for bzz', path: '/bzz', headers: { 'x-swarm-postage-token': 'bob' }, batchId: BOB_BATCH },
  {
    name: 'alice token for chunks',
    path: '/chunks',
    headers: { 'x-swarm-postage-token': 'alice' },
    batchId: ALICE_BATCH,
  },
  { name: 'bob token for soc', path: SOC_PATH, headers: { 'x-swarm-postage-token': 'bob' }, batchId: BOB_BATCH },
]

const servers: Server[] = []
const beeHeaders = new Map<string, IncomingHttpHeaders>()

const bee = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    beeHeaders.set(Buffer.concat(chunks).toString(), req.headers)
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ reference: 'cd'.repeat(32) }))
  })
})

const dispenser = http.createServer((req, res) => {
  const authorized = req.headers.authorization === 'Bearer secret'
  const batchId = authorized ? TOKEN_BATCHES.get(String(req.headers['x-swarm-postage-token'])) : undefined
  setTimeout(() => {
    if (batchId) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ batchId }))
    } else {
      res.writeHead(404)
      res.end()
    }
  }, DISPENSER_DELAY)
})

async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function upload(gatewayUrl: string, path: string, headers: http.OutgoingHttpHeaders, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(gatewayUrl + path, { method: 'POST', headers }, res => {
      res.resume()
      res.on('end', () => resolve(res.statusCode ?? 0))
    })
    req.on('error', reject)
    req.end(body)
  })
}

after(() => {
  for (const server of servers) {
    server.close()
  }
})

describe('postage with the dispenser enabled', () => {
  let gatewayUrl: string

  before(async () => {
    const beeApiUrl = await listen(bee)
    const dispenserUrl = await listen(dispenser)
    const stampManager = new StampManager(beeApiUrl, {
      hardcodedStamp: STAMP,
      hardcodedStampSoc: SOC_STAMP,
      postageThresholdUsage: 0.85,
      postageThresholdSeconds: 3600,
      postageKeepAlive: false,
    })
    await stampManager.start()
    const app = createApp(
      { beeApiUrl, hostname: 'gw.local', removePinHeader: true },
      stampManager,
      new PostageBatchDispenserService({ url: dispenserUrl, secret: 'secret' }),
    )
    gatewayUrl = await listen(http.createServer(app))
  })

  it('stamps gateway, presigned and token uploads correctly in parallel', async () => {
    const pending: Promise<number>[] = []
    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < UPLOADS.length; i++) {
        const { path, headers } = UPLOADS[i]!
        pending.push(upload(gatewayUrl, path, headers, `${i}-${round}`))
      }
    }
    const statuses = await Promise.all(pending)

    for (let round = 0; round < ROUNDS; round++) {
      for (let i = 0; i < UPLOADS.length; i++) {
        const { name, batchId, stamp } = UPLOADS[i]!
        const message = `${name} in round ${round}`
        assert.equal(statuses[round * UPLOADS.length + i], 201, message)
        const headers = beeHeaders.get(`${i}-${round}`)
        assert.ok(headers, message)
        assert.equal(headers['swarm-postage-batch-id'], batchId, message)
        assert.equal(headers['swarm-postage-stamp'], stamp, message)
        assert.equal(headers['x-swarm-postage-token'], undefined, message)
      }
    }
  })
})

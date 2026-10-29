process.env.LOG_LEVEL = 'critical'
delete process.env.DATABASE_CONFIG

import assert from 'node:assert/strict'
import http, { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { after, before, describe, it, mock } from 'node:test'
import { Cache } from 'cafe-utility'
import { encodeAbiParameters, encodeErrorResult, encodeFunctionResult, parseAbi, toHex } from 'viem'
import { mainnet } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import { AppConfig } from '../src/config'
import * as Database from '../src/database/Database'
import { createApp } from '../src/server'
import { PostageBatchDispenserService } from '../src/services/postage-batch-dispenser'
import { StampManager } from '../src/stamp'

const SITE = '1a'.repeat(32)
const NESTED = '2b'.repeat(32)
const DENIED = '3c'.repeat(32)
const RESOLVER = '0x0000000000000000000000000000000000000001'
const IPFS_CONTENTHASH = `0xe3010170122092663d1900cb692170e5411a7a321b2fd2338194033af55a6dd88bfeaee8b87d`

const CONTENTHASHES: Record<string, string> = {
  'site.eth': `0xe40101fa011b20${SITE}`,
  'book.swarm.eth': `0xe40101fa011b20${NESTED}`,
  'denied.eth': `0xe40101fa011b20${DENIED}`,
  'ipfs.eth': IPFS_CONTENTHASH,
  'flip.eth': `0xe40101fa011b20${DENIED}`,
  'offchain.eth': '0x',
}

const UNIVERSAL_RESOLVER_ABI = parseAbi([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes, address)',
  'error ResolverNotFound(bytes name)',
  'error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)',
])

const beeRequests: string[] = []
const ccipRequests: string[] = []
let flipResolutions = 0
const servers: Server[] = []

const bee = http.createServer((req, res) => {
  beeRequests.push(req.url ?? '')
  req.resume()
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{}')
})

const ccip = http.createServer((req, res) => {
  ccipRequests.push(req.url ?? '')
  req.resume()
  res.end('0x')
})

function revert(res: http.ServerResponse, id: unknown, data: string) {
  res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: 3, message: 'execution reverted', data } }))
}

const rpc = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) {
    body += chunk
  }
  const { id, params } = JSON.parse(body)
  const calldata: string = params[0].data
  const name = Object.keys(CONTENTHASHES).find(x => calldata.includes(toHex(packetToBytes(x)).slice(2)))
  res.writeHead(200, { 'content-type': 'application/json' })
  if (name === 'offchain.eth') {
    const url = `http://127.0.0.1:${(ccip.address() as AddressInfo).port}/`
    const args = [mainnet.contracts.ensUniversalResolver.address, [url], '0x', '0x00000000', '0x'] as const
    revert(res, id, encodeErrorResult({ abi: UNIVERSAL_RESOLVER_ABI, errorName: 'OffchainLookup', args }))
    return
  }
  if (!name || (name === 'flip.eth' && flipResolutions++)) {
    revert(res, id, encodeErrorResult({ abi: UNIVERSAL_RESOLVER_ABI, errorName: 'ResolverNotFound', args: ['0x'] }))
    return
  }
  const contenthash = encodeAbiParameters([{ type: 'bytes' }], [CONTENTHASHES[name] as `0x${string}`])
  const result = encodeFunctionResult({
    abi: UNIVERSAL_RESOLVER_ABI,
    functionName: 'resolveWithGateways',
    result: [contenthash, RESOLVER],
  })
  res.end(JSON.stringify({ jsonrpc: '2.0', id, result }))
})

async function listen(server: Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function startGateway(config: Partial<AppConfig>): Promise<number> {
  const beeApiUrl = `http://127.0.0.1:${(bee.address() as AddressInfo).port}`
  const stampManager = new StampManager(beeApiUrl, {
    hardcodedStamp: 'aa'.repeat(32),
    postageThresholdUsage: 0.85,
    postageThresholdSeconds: 3600,
    postageKeepAlive: false,
  })
  await stampManager.start()
  const app = createApp(
    { beeApiUrl, hostname: 'gw.local', removePinHeader: true, ...config },
    stampManager,
    new PostageBatchDispenserService({ url: '', secret: '' }),
  )
  return listen(http.createServer(app))
}

function request(
  port: number,
  path: string,
  headers: http.OutgoingHttpHeaders = {},
): Promise<{ status: number; location: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers }, res => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location }))
    })
    req.on('error', reject)
    req.end()
  })
}

before(async () => {
  await listen(bee)
  await listen(rpc)
  await listen(ccip)
})

after(() => {
  for (const server of servers) {
    server.close()
  }
})

describe('ens resolution by the gateway', () => {
  let port: number

  before(async () => {
    mock.method(Database, 'getOnlyRowOrNull', async (_query: string, ...params: unknown[]) =>
      Array.isArray(params[0]) && params[0].includes(DENIED) ? { hash: DENIED, mode: 'deny' } : null,
    )
    mock.method(Database, 'getRows', async () => [])
    port = await startGateway({ ensRpcUrl: `http://127.0.0.1:${(rpc.address() as AddressInfo).port}` })
  })

  after(() => mock.restoreAll())

  it('forwards the resolved reference instead of the name', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/site.eth/index.html')).status, 200)
    assert.equal(beeRequests[0], `/bzz/${SITE}/index.html`)
    assert.ok(beeRequests.every(x => !x.includes('.eth')))
  })

  it('resolves names case-insensitively', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/SITE.ETH/')).status, 200)
    assert.equal(beeRequests[0], `/bzz/${SITE}/`)
  })

  it('resolves nested subdomains', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, '/', { host: 'book.swarm.gw.local' })).status, 200)
    assert.equal(beeRequests[0], `/bzz/${NESTED}/`)
  })

  it('shows the not found page for names that do not resolve', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/unknown.eth/')).status, 404)
    assert.equal((await request(port, '/bzz/ipfs.eth/')).status, 404)
    assert.deepEqual(beeRequests, [])
  })

  it('applies moderation rules to the resolved reference', async () => {
    const response = await request(port, '/bzz/denied.eth/')
    assert.equal(response.status, 302)
    assert.equal(response.location, `/forbidden?hash=${DENIED}`)
  })

  it('never contacts offchain lookup urls chosen by a resolver', async () => {
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/offchain.eth/')).status, 404)
    assert.equal((await request(port, '/tls-check?domain=offchain.gw.local')).status, 403)
    assert.deepEqual(ccipRequests, [])
    assert.deepEqual(beeRequests, [])
  })

  it('checks rules against the reference that was served even if the name changes meanwhile', async () => {
    const cacheGet = mock.method(Cache, 'get', (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn())
    try {
      const response = await request(port, '/bzz/flip.eth/')
      assert.equal(response.status, 302)
      assert.equal(response.location, `/forbidden?hash=${DENIED}`)
    } finally {
      cacheGet.mock.restore()
    }
  })

  it('allows tls only for resolvable names', async () => {
    assert.equal((await request(port, '/tls-check?domain=book.swarm.gw.local')).status, 200)
    assert.equal((await request(port, '/tls-check?domain=www.mail.example.gw.local')).status, 403)
  })
})

describe('ens resolution with an unreachable rpc', () => {
  it('answers 502 without contacting bee', async () => {
    const port = await startGateway({ ensRpcUrl: 'http://127.0.0.1:1' })
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/unreachable.eth/')).status, 502)
    assert.deepEqual(beeRequests, [])
  })
})

describe('ens resolution by bee', () => {
  it('forwards the name to bee', async () => {
    const port = await startGateway({})
    beeRequests.length = 0
    assert.equal((await request(port, '/bzz/site.eth/')).status, 200)
    assert.equal(beeRequests[0], '/bzz/site.eth/')
  })
})

import { Reference } from '@ethersphere/bee-js'
import { Cache, Dates, Strings } from 'cafe-utility'
import { Rewrites, RewritesRow } from './database/Rewrites'

export class NotEnabledError extends Error {}

export async function isServableSubdomain(subdomain: string, beeApiUrl: string): Promise<boolean> {
  try {
    return await Cache.get(`tls-check:${subdomain}`, Dates.minutes(10), async () => {
      if (await Rewrites.getOneOrNull({ subdomain }).catch(() => null)) {
        return true
      }
      try {
        new Reference(subdomain)
        return true
      } catch {
        return resolvesOnBee(`${subdomain}.eth`, beeApiUrl)
      }
    })
  } catch {
    return false
  }
}

// Bee answers 400 when the name does not resolve; other statuses are about the content, not the name.
async function resolvesOnBee(ensName: string, beeApiUrl: string): Promise<boolean> {
  const response = await fetch(Strings.joinUrl([beeApiUrl, 'bzz', ensName, '/']), {
    redirect: 'manual',
    signal: AbortSignal.timeout(Dates.seconds(10)),
  })
  await response.body?.cancel()

  return response.status !== 400
}

export async function subdomainToBzz(subdomain: string): Promise<string> {
  const rewrite = await Cache.get<RewritesRow | null>('rewrites', Dates.minutes(1), async () =>
    Rewrites.getOneOrNull({ subdomain }),
  )
  if (rewrite) {
    return rewrite.target
  }
  try {
    return new Reference(subdomain).toHex()
  } catch (e) {
    return `${subdomain}.eth`
  }
}

import { Reference } from '@ethersphere/bee-js'
import { Cache, Dates } from 'cafe-utility'
import { isDatabaseConfigured } from './database/Database'
import { Rewrites, RewritesRow } from './database/Rewrites'
import { EnsResolver } from './services/ens'

export const SUBDOMAIN = /^[0-9a-z.-]+$/i

export class NotEnabledError extends Error {}

export async function isServableSubdomain(subdomain: string, ensResolver: EnsResolver): Promise<boolean> {
  if (!SUBDOMAIN.test(subdomain)) {
    return false
  }
  try {
    return await Cache.get(`tls-check:${subdomain}`, Dates.minutes(10), async () => {
      if (await Rewrites.getOneOrNull({ subdomain }).catch(() => null)) {
        return true
      }
      try {
        new Reference(subdomain)
        return true
      } catch {
        return Boolean(await ensResolver.resolveReference(`${subdomain}.eth`))
      }
    })
  } catch {
    return false
  }
}

export async function subdomainToBzz(subdomain: string): Promise<string> {
  const rewrites = isDatabaseConfigured()
    ? await Cache.get<RewritesRow[]>('rewrites', Dates.minutes(1), () => Rewrites.getMany())
    : []
  const rewrite = rewrites.find(x => x.subdomain === subdomain)
  if (rewrite) {
    return rewrite.target
  }
  try {
    return new Reference(subdomain).toHex()
  } catch (e) {
    return `${subdomain}.eth`
  }
}

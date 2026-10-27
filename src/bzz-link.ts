import { Reference } from '@ethersphere/bee-js'
import { Cache, Dates } from 'cafe-utility'
import { isDatabaseConfigured } from './database/Database'
import { Rewrites, RewritesRow } from './database/Rewrites'

export class NotEnabledError extends Error {}

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

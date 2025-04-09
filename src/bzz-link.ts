import { Reference } from '@ethersphere/bee-js'
import { Cache, Dates } from 'cafe-utility'
import { getOnlyRewritesRowOrNull, RewritesRow } from './database/Schema'

export class NotEnabledError extends Error {}

export async function subdomainToBzz(subdomain: string): Promise<string> {
    const rewrite = await Cache.get<RewritesRow | null>('rewrites', Dates.minutes(1), async () =>
        getOnlyRewritesRowOrNull({ subdomain })
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

import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type RewritesRowId = number & { __brand: 'RewritesRowId' }

export interface RewritesRow {
    id: RewritesRowId
    subdomain: string
    target: string
    createdAt: Date
}

export interface NewRewritesRow {
    subdomain: string
    target: string
    createdAt?: Date | null
}

export const Rewrites = {
    async getMany(filter?: Partial<RewritesRow>, options?: SelectOptions<RewritesRow>): Promise<RewritesRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM rewrites' + query, ...values) as unknown as RewritesRow[]
    },

    async getOneOrNull(
        filter?: Partial<RewritesRow>,
        options?: SelectOptions<RewritesRow>
    ): Promise<RewritesRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM rewrites' + query, ...values) as unknown as RewritesRow | null
    },

    async getOneOrThrow(filter?: Partial<RewritesRow>, options?: SelectOptions<RewritesRow>): Promise<RewritesRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM rewrites' + query, ...values) as unknown as RewritesRow
    },

    async update(
        id: RewritesRowId,
        object: Partial<NewRewritesRow>,
        atomicHelper?: {
            key: keyof NewRewritesRow
            value: unknown
        }
    ): Promise<number> {
        return update('rewrites', id, object, atomicHelper)
    },

    async insert(object: NewRewritesRow): Promise<RewritesRowId> {
        return insert('rewrites', object as unknown as Record<string, unknown>) as Promise<RewritesRowId>
    }
}

import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type AllowedUserAgentsRowId = number & { __brand: 'AllowedUserAgentsRowId' }

export interface AllowedUserAgentsRow {
    id: AllowedUserAgentsRowId
    userAgent: string
    createdAt: Date
}

export interface NewAllowedUserAgentsRow {
    userAgent: string
    createdAt?: Date | null
}

export const AllowedUserAgents = {
    async getMany(
        filter?: Partial<AllowedUserAgentsRow>,
        options?: SelectOptions<AllowedUserAgentsRow>
    ): Promise<AllowedUserAgentsRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM allowedUserAgents' + query, ...values) as unknown as AllowedUserAgentsRow[]
    },

    async getOneOrNull(
        filter?: Partial<AllowedUserAgentsRow>,
        options?: SelectOptions<AllowedUserAgentsRow>
    ): Promise<AllowedUserAgentsRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull(
            'SELECT * FROM allowedUserAgents' + query,
            ...values
        ) as unknown as AllowedUserAgentsRow | null
    },

    async getOneOrThrow(
        filter?: Partial<AllowedUserAgentsRow>,
        options?: SelectOptions<AllowedUserAgentsRow>
    ): Promise<AllowedUserAgentsRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow(
            'SELECT * FROM allowedUserAgents' + query,
            ...values
        ) as unknown as AllowedUserAgentsRow
    },

    async update(
        id: AllowedUserAgentsRowId,
        object: Partial<NewAllowedUserAgentsRow>,
        atomicHelper?: {
            key: keyof NewAllowedUserAgentsRow
            value: unknown
        }
    ): Promise<number> {
        return update('allowedUserAgents', id, object, atomicHelper)
    },

    async insert(object: NewAllowedUserAgentsRow): Promise<AllowedUserAgentsRowId> {
        return insert(
            'allowedUserAgents',
            object as unknown as Record<string, unknown>
        ) as Promise<AllowedUserAgentsRowId>
    }
}

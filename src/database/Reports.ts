import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type ReportsRowId = number & { __brand: 'ReportsRowId' }

export interface ReportsRow {
    id: ReportsRowId
    hash: string
    reason?: string | null
    createdAt: Date
}

export interface NewReportsRow {
    hash: string
    reason?: string | null
    createdAt?: Date | null
}

export const Reports = {
    async getMany(filter?: Partial<ReportsRow>, options?: SelectOptions<ReportsRow>): Promise<ReportsRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM reports' + query, ...values) as unknown as ReportsRow[]
    },

    async getOneOrNull(filter?: Partial<ReportsRow>, options?: SelectOptions<ReportsRow>): Promise<ReportsRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM reports' + query, ...values) as unknown as ReportsRow | null
    },

    async getOneOrThrow(filter?: Partial<ReportsRow>, options?: SelectOptions<ReportsRow>): Promise<ReportsRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM reports' + query, ...values) as unknown as ReportsRow
    },

    async update(
        id: ReportsRowId,
        object: Partial<NewReportsRow>,
        atomicHelper?: {
            key: keyof NewReportsRow
            value: unknown
        }
    ): Promise<number> {
        return update('reports', id, object, atomicHelper)
    },

    async insert(object: NewReportsRow): Promise<ReportsRowId> {
        return insert('reports', object as unknown as Record<string, unknown>) as Promise<ReportsRowId>
    }
}

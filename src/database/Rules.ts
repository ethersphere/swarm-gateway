import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type RulesRowId = number & { __brand: 'RulesRowId' }

export interface RulesRow {
    id: RulesRowId
    hash: string
    mode: 'allow' | 'deny'
    createdAt: Date
}

export interface NewRulesRow {
    hash: string
    mode: 'allow' | 'deny'
    createdAt?: Date | null
}

export const Rules = {
    async getMany(filter?: Partial<RulesRow>, options?: SelectOptions<RulesRow>): Promise<RulesRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM rules' + query, ...values) as unknown as RulesRow[]
    },

    async getOneOrNull(filter?: Partial<RulesRow>, options?: SelectOptions<RulesRow>): Promise<RulesRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM rules' + query, ...values) as unknown as RulesRow | null
    },

    async getOneOrThrow(filter?: Partial<RulesRow>, options?: SelectOptions<RulesRow>): Promise<RulesRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM rules' + query, ...values) as unknown as RulesRow
    },

    async update(
        id: RulesRowId,
        object: Partial<NewRulesRow>,
        atomicHelper?: {
            key: keyof NewRulesRow
            value: unknown
        }
    ): Promise<number> {
        return update('rules', id, object, atomicHelper)
    },

    async insert(object: NewRulesRow): Promise<RulesRowId> {
        return insert('rules', object as unknown as Record<string, unknown>) as Promise<RulesRowId>
    }
}

import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type TypeHintsRowId = number & { __brand: 'TypeHintsRowId' }

export interface TypeHintsRow {
    id: TypeHintsRowId
    byteStart: number
    byteLength: number
    hash: string
    label: string
    createdAt: Date
}

export interface NewTypeHintsRow {
    byteStart: number
    byteLength: number
    hash: string
    label: string
    createdAt?: Date | null
}

export const TypeHints = {
    async getMany(filter?: Partial<TypeHintsRow>, options?: SelectOptions<TypeHintsRow>): Promise<TypeHintsRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM typeHints' + query, ...values) as unknown as TypeHintsRow[]
    },

    async getOneOrNull(
        filter?: Partial<TypeHintsRow>,
        options?: SelectOptions<TypeHintsRow>
    ): Promise<TypeHintsRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM typeHints' + query, ...values) as unknown as TypeHintsRow | null
    },

    async getOneOrThrow(filter?: Partial<TypeHintsRow>, options?: SelectOptions<TypeHintsRow>): Promise<TypeHintsRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM typeHints' + query, ...values) as unknown as TypeHintsRow
    },

    async update(
        id: TypeHintsRowId,
        object: Partial<NewTypeHintsRow>,
        atomicHelper?: {
            key: keyof NewTypeHintsRow
            value: unknown
        }
    ): Promise<number> {
        return update('typeHints', id, object, atomicHelper)
    },

    async insert(object: NewTypeHintsRow): Promise<TypeHintsRowId> {
        return insert('typeHints', object as unknown as Record<string, unknown>) as Promise<TypeHintsRowId>
    }
}

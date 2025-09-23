import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type ChallengesRowId = number & { __brand: 'ChallengesRowId' }

export interface ChallengesRow {
    id: ChallengesRowId
    nonce: string
    difficulty: number
    solution?: string | null
    createdAt: Date
}

export interface NewChallengesRow {
    nonce: string
    difficulty: number
    solution?: string | null
    createdAt?: Date | null
}

export const Challenges = {
    async getMany(filter?: Partial<ChallengesRow>, options?: SelectOptions<ChallengesRow>): Promise<ChallengesRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM challenges' + query, ...values) as unknown as ChallengesRow[]
    },

    async getOneOrNull(
        filter?: Partial<ChallengesRow>,
        options?: SelectOptions<ChallengesRow>
    ): Promise<ChallengesRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM challenges' + query, ...values) as unknown as ChallengesRow | null
    },

    async getOneOrThrow(
        filter?: Partial<ChallengesRow>,
        options?: SelectOptions<ChallengesRow>
    ): Promise<ChallengesRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM challenges' + query, ...values) as unknown as ChallengesRow
    },

    async update(
        id: ChallengesRowId,
        object: Partial<NewChallengesRow>,
        atomicHelper?: {
            key: keyof NewChallengesRow
            value: unknown
        }
    ): Promise<number> {
        return update('challenges', id, object, atomicHelper)
    },

    async insert(object: NewChallengesRow): Promise<ChallengesRowId> {
        return insert('challenges', object as unknown as Record<string, unknown>) as Promise<ChallengesRowId>
    }
}

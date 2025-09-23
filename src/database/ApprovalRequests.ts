import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type ApprovalRequestsRowId = number & { __brand: 'ApprovalRequestsRowId' }

export interface ApprovalRequestsRow {
    id: ApprovalRequestsRowId
    hash: string
    ens?: string | null
    createdAt: Date
}

export interface NewApprovalRequestsRow {
    hash: string
    ens?: string | null
    createdAt?: Date | null
}

export const ApprovalRequests = {
    async getMany(
        filter?: Partial<ApprovalRequestsRow>,
        options?: SelectOptions<ApprovalRequestsRow>
    ): Promise<ApprovalRequestsRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM approvalRequests' + query, ...values) as unknown as ApprovalRequestsRow[]
    },

    async getOneOrNull(
        filter?: Partial<ApprovalRequestsRow>,
        options?: SelectOptions<ApprovalRequestsRow>
    ): Promise<ApprovalRequestsRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull(
            'SELECT * FROM approvalRequests' + query,
            ...values
        ) as unknown as ApprovalRequestsRow | null
    },

    async getOneOrThrow(
        filter?: Partial<ApprovalRequestsRow>,
        options?: SelectOptions<ApprovalRequestsRow>
    ): Promise<ApprovalRequestsRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM approvalRequests' + query, ...values) as unknown as ApprovalRequestsRow
    },

    async update(
        id: ApprovalRequestsRowId,
        object: Partial<NewApprovalRequestsRow>,
        atomicHelper?: {
            key: keyof NewApprovalRequestsRow
            value: unknown
        }
    ): Promise<number> {
        return update('approvalRequests', id, object, atomicHelper)
    },

    async insert(object: NewApprovalRequestsRow): Promise<ApprovalRequestsRowId> {
        return insert(
            'approvalRequests',
            object as unknown as Record<string, unknown>
        ) as Promise<ApprovalRequestsRowId>
    }
}

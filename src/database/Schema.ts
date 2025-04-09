import { getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, update } from './Database'

type SelectOptions<T> = {
    order?: { column: keyof T; direction: 'ASC' | 'DESC' }
    limit?: number
}

function buildSelect<T>(filter?: Partial<T>, options?: SelectOptions<T>): [string, unknown[]] {
    const where = filter
        ? ' WHERE ' +
          Object.keys(filter)
              .map(x => '' + x + ' = ?')
              .join(' AND ')
        : ''
    const values = filter ? Object.values(filter) : []
    const order = options?.order ? ' ORDER BY ' + (options.order.column as string) + ' ' + options.order.direction : ''
    const limit = options?.limit ? ' LIMIT ' + options.limit : ''
    return [where + order + limit, values]
}

export type AllowedUserAgentsRowId = number & { __brand: 'AllowedUserAgentsRowId' }
export interface AllowedUserAgentsRow {
    id: AllowedUserAgentsRowId
    userAgent: string
    createdAt: Date
}

export type ApprovalRequestsRowId = number & { __brand: 'ApprovalRequestsRowId' }
export interface ApprovalRequestsRow {
    id: ApprovalRequestsRowId
    hash: string
    ens?: string | null
    createdAt: Date
}

export type ReportsRowId = number & { __brand: 'ReportsRowId' }
export interface ReportsRow {
    id: ReportsRowId
    hash: string
    reason?: string | null
    createdAt: Date
}

export type RewritesRowId = number & { __brand: 'RewritesRowId' }
export interface RewritesRow {
    id: RewritesRowId
    subdomain: string
    target: string
    createdAt: Date
}

export type RulesRowId = number & { __brand: 'RulesRowId' }
export interface RulesRow {
    id: RulesRowId
    hash: string
    mode: 'allow' | 'deny'
    createdAt: Date
}

export type SettingsRowId = number & { __brand: 'SettingsRowId' }
export interface SettingsRow {
    id: SettingsRowId
    name: string
    defaultWebsiteRule: 'allow' | 'deny'
    defaultFileRule: 'allow' | 'deny'
}

export interface NewAllowedUserAgentsRow {
    userAgent: string
    createdAt?: Date | null
}

export interface NewApprovalRequestsRow {
    hash: string
    ens?: string | null
    createdAt?: Date | null
}

export interface NewReportsRow {
    hash: string
    reason?: string | null
    createdAt?: Date | null
}

export interface NewRewritesRow {
    subdomain: string
    target: string
    createdAt?: Date | null
}

export interface NewRulesRow {
    hash: string
    mode: 'allow' | 'deny'
    createdAt?: Date | null
}

export interface NewSettingsRow {
    name: string
    defaultWebsiteRule: 'allow' | 'deny'
    defaultFileRule: 'allow' | 'deny'
}

export async function getAllowedUserAgentsRows(
    filter?: Partial<AllowedUserAgentsRow>,
    options?: SelectOptions<AllowedUserAgentsRow>
): Promise<AllowedUserAgentsRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.allowedUserAgents' + query, ...values) as unknown as AllowedUserAgentsRow[]
}

export async function getOnlyAllowedUserAgentsRowOrNull(
    filter?: Partial<AllowedUserAgentsRow>,
    options?: SelectOptions<AllowedUserAgentsRow>
): Promise<AllowedUserAgentsRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull(
        'SELECT * FROM proxy.allowedUserAgents' + query,
        ...values
    ) as unknown as AllowedUserAgentsRow | null
}

export async function getOnlyAllowedUserAgentsRowOrThrow(
    filter?: Partial<AllowedUserAgentsRow>,
    options?: SelectOptions<AllowedUserAgentsRow>
): Promise<AllowedUserAgentsRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow(
        'SELECT * FROM proxy.allowedUserAgents' + query,
        ...values
    ) as unknown as AllowedUserAgentsRow
}

export async function getApprovalRequestsRows(
    filter?: Partial<ApprovalRequestsRow>,
    options?: SelectOptions<ApprovalRequestsRow>
): Promise<ApprovalRequestsRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.approvalRequests' + query, ...values) as unknown as ApprovalRequestsRow[]
}

export async function getOnlyApprovalRequestsRowOrNull(
    filter?: Partial<ApprovalRequestsRow>,
    options?: SelectOptions<ApprovalRequestsRow>
): Promise<ApprovalRequestsRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull(
        'SELECT * FROM proxy.approvalRequests' + query,
        ...values
    ) as unknown as ApprovalRequestsRow | null
}

export async function getOnlyApprovalRequestsRowOrThrow(
    filter?: Partial<ApprovalRequestsRow>,
    options?: SelectOptions<ApprovalRequestsRow>
): Promise<ApprovalRequestsRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow(
        'SELECT * FROM proxy.approvalRequests' + query,
        ...values
    ) as unknown as ApprovalRequestsRow
}

export async function getReportsRows(
    filter?: Partial<ReportsRow>,
    options?: SelectOptions<ReportsRow>
): Promise<ReportsRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.reports' + query, ...values) as unknown as ReportsRow[]
}

export async function getOnlyReportsRowOrNull(
    filter?: Partial<ReportsRow>,
    options?: SelectOptions<ReportsRow>
): Promise<ReportsRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull('SELECT * FROM proxy.reports' + query, ...values) as unknown as ReportsRow | null
}

export async function getOnlyReportsRowOrThrow(
    filter?: Partial<ReportsRow>,
    options?: SelectOptions<ReportsRow>
): Promise<ReportsRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow('SELECT * FROM proxy.reports' + query, ...values) as unknown as ReportsRow
}

export async function getRewritesRows(
    filter?: Partial<RewritesRow>,
    options?: SelectOptions<RewritesRow>
): Promise<RewritesRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.rewrites' + query, ...values) as unknown as RewritesRow[]
}

export async function getOnlyRewritesRowOrNull(
    filter?: Partial<RewritesRow>,
    options?: SelectOptions<RewritesRow>
): Promise<RewritesRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull('SELECT * FROM proxy.rewrites' + query, ...values) as unknown as RewritesRow | null
}

export async function getOnlyRewritesRowOrThrow(
    filter?: Partial<RewritesRow>,
    options?: SelectOptions<RewritesRow>
): Promise<RewritesRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow('SELECT * FROM proxy.rewrites' + query, ...values) as unknown as RewritesRow
}

export async function getRulesRows(filter?: Partial<RulesRow>, options?: SelectOptions<RulesRow>): Promise<RulesRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.rules' + query, ...values) as unknown as RulesRow[]
}

export async function getOnlyRulesRowOrNull(
    filter?: Partial<RulesRow>,
    options?: SelectOptions<RulesRow>
): Promise<RulesRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull('SELECT * FROM proxy.rules' + query, ...values) as unknown as RulesRow | null
}

export async function getOnlyRulesRowOrThrow(
    filter?: Partial<RulesRow>,
    options?: SelectOptions<RulesRow>
): Promise<RulesRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow('SELECT * FROM proxy.rules' + query, ...values) as unknown as RulesRow
}

export async function getSettingsRows(
    filter?: Partial<SettingsRow>,
    options?: SelectOptions<SettingsRow>
): Promise<SettingsRow[]> {
    const [query, values] = buildSelect(filter, options)
    return getRows('SELECT * FROM proxy.settings' + query, ...values) as unknown as SettingsRow[]
}

export async function getOnlySettingsRowOrNull(
    filter?: Partial<SettingsRow>,
    options?: SelectOptions<SettingsRow>
): Promise<SettingsRow | null> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrNull('SELECT * FROM proxy.settings' + query, ...values) as unknown as SettingsRow | null
}

export async function getOnlySettingsRowOrThrow(
    filter?: Partial<SettingsRow>,
    options?: SelectOptions<SettingsRow>
): Promise<SettingsRow> {
    const [query, values] = buildSelect(filter, options)
    return getOnlyRowOrThrow('SELECT * FROM proxy.settings' + query, ...values) as unknown as SettingsRow
}

export async function updateAllowedUserAgentsRow(
    id: AllowedUserAgentsRowId,
    object: Partial<NewAllowedUserAgentsRow>,
    atomicHelper?: {
        key: keyof NewAllowedUserAgentsRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.allowedUserAgents', id, object, atomicHelper)
}

export async function updateApprovalRequestsRow(
    id: ApprovalRequestsRowId,
    object: Partial<NewApprovalRequestsRow>,
    atomicHelper?: {
        key: keyof NewApprovalRequestsRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.approvalRequests', id, object, atomicHelper)
}

export async function updateReportsRow(
    id: ReportsRowId,
    object: Partial<NewReportsRow>,
    atomicHelper?: {
        key: keyof NewReportsRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.reports', id, object, atomicHelper)
}

export async function updateRewritesRow(
    id: RewritesRowId,
    object: Partial<NewRewritesRow>,
    atomicHelper?: {
        key: keyof NewRewritesRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.rewrites', id, object, atomicHelper)
}

export async function updateRulesRow(
    id: RulesRowId,
    object: Partial<NewRulesRow>,
    atomicHelper?: {
        key: keyof NewRulesRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.rules', id, object, atomicHelper)
}

export async function updateSettingsRow(
    id: SettingsRowId,
    object: Partial<NewSettingsRow>,
    atomicHelper?: {
        key: keyof NewSettingsRow
        value: unknown
    }
): Promise<number> {
    return update('proxy.settings', id, object, atomicHelper)
}

export async function insertAllowedUserAgentsRow(object: NewAllowedUserAgentsRow): Promise<AllowedUserAgentsRowId> {
    return insert(
        'proxy.allowedUserAgents',
        object as unknown as Record<string, unknown>
    ) as Promise<AllowedUserAgentsRowId>
}

export async function insertApprovalRequestsRow(object: NewApprovalRequestsRow): Promise<ApprovalRequestsRowId> {
    return insert(
        'proxy.approvalRequests',
        object as unknown as Record<string, unknown>
    ) as Promise<ApprovalRequestsRowId>
}

export async function insertReportsRow(object: NewReportsRow): Promise<ReportsRowId> {
    return insert('proxy.reports', object as unknown as Record<string, unknown>) as Promise<ReportsRowId>
}

export async function insertRewritesRow(object: NewRewritesRow): Promise<RewritesRowId> {
    return insert('proxy.rewrites', object as unknown as Record<string, unknown>) as Promise<RewritesRowId>
}

export async function insertRulesRow(object: NewRulesRow): Promise<RulesRowId> {
    return insert('proxy.rules', object as unknown as Record<string, unknown>) as Promise<RulesRowId>
}

export async function insertSettingsRow(object: NewSettingsRow): Promise<SettingsRowId> {
    return insert('proxy.settings', object as unknown as Record<string, unknown>) as Promise<SettingsRowId>
}

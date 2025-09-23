import { buildSelect, getOnlyRowOrNull, getOnlyRowOrThrow, getRows, insert, SelectOptions, update } from './Database'

export type SettingsRowId = number & { __brand: 'SettingsRowId' }

export interface SettingsRow {
    id: SettingsRowId
    name: string
    defaultWebsiteRule: 'allow' | 'deny'
    defaultFileRule: 'allow' | 'deny'
    defaultEnsRule: 'allow' | 'deny'
    redirectUri: string
}

export interface NewSettingsRow {
    name: string
    defaultWebsiteRule: 'allow' | 'deny'
    defaultFileRule: 'allow' | 'deny'
    defaultEnsRule: 'allow' | 'deny'
    redirectUri: string
}

export const Settings = {
    async getMany(filter?: Partial<SettingsRow>, options?: SelectOptions<SettingsRow>): Promise<SettingsRow[]> {
        const [query, values] = buildSelect(filter, options)
        return getRows('SELECT * FROM settings' + query, ...values) as unknown as SettingsRow[]
    },

    async getOneOrNull(
        filter?: Partial<SettingsRow>,
        options?: SelectOptions<SettingsRow>
    ): Promise<SettingsRow | null> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrNull('SELECT * FROM settings' + query, ...values) as unknown as SettingsRow | null
    },

    async getOneOrThrow(filter?: Partial<SettingsRow>, options?: SelectOptions<SettingsRow>): Promise<SettingsRow> {
        const [query, values] = buildSelect(filter, options)
        return getOnlyRowOrThrow('SELECT * FROM settings' + query, ...values) as unknown as SettingsRow
    },

    async update(
        id: SettingsRowId,
        object: Partial<NewSettingsRow>,
        atomicHelper?: {
            key: keyof NewSettingsRow
            value: unknown
        }
    ): Promise<number> {
        return update('settings', id, object, atomicHelper)
    },

    async insert(object: NewSettingsRow): Promise<SettingsRowId> {
        return insert('settings', object as unknown as Record<string, unknown>) as Promise<SettingsRowId>
    }
}

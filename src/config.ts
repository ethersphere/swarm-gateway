import { Duration } from '@ethersphere/bee-js'
import { Types } from 'cafe-utility'

export interface AppConfig {
    beeApiUrl: string
    hostname: string
    authorization?: string
    instanceName?: string
    moderationSecret?: string
    removePinHeader?: boolean
    readinessCheck?: boolean
    homepage?: string
}

export interface ServerConfig {
    hostname: string
    port: number
}

export interface StampConfig {
    hardcodedStamp?: string
    postageDepth?: number
    postageAmount?: number
    postageThresholdUsage: number
    postageThresholdSeconds: number
    postageKeepAlive: boolean
}

export type EnvironmentVariables = Partial<{
    // Logging
    LOG_LEVEL: string

    // Proxy
    BEE_API_URL: string
    AUTH_SECRET: string

    // Server
    PORT: string
    HOSTNAME: string

    // Moderation
    MODERATION_SECRET: string
    INSTANCE_NAME: string

    // Headers manipulation
    REMOVE_PIN_HEADER: string

    // Stamps
    POSTAGE_STAMP: string
    POSTAGE_DEPTH: string
    POSTAGE_AMOUNT: string
    POSTAGE_THRESHOLD_USAGE: string
    POSTAGE_THRESHOLD_SECONDS: string
    POSTAGE_KEEP_ALIVE: string

    // Homepage
    HOMEPAGE: string
}>

export const SUPPORTED_LEVELS = ['critical', 'error', 'warn', 'info', 'verbose', 'debug'] as const
export type SupportedLevels = (typeof SUPPORTED_LEVELS)[number]

export const DEFAULT_BEE_API_URL = 'http://localhost:1633'
export const DEFAULT_HOSTNAME = 'localhost'
export const DEFAULT_PORT = 3000
export const DEFAULT_LOG_LEVEL = 'info'
export const READINESS_TIMEOUT_MS = 3000
export const ERROR_NO_STAMP = 'No postage stamp'

export const logLevel =
    process.env.LOG_LEVEL && SUPPORTED_LEVELS.includes(process.env.LOG_LEVEL as SupportedLevels)
        ? process.env.LOG_LEVEL
        : DEFAULT_LOG_LEVEL

export function getAppConfig(env: EnvironmentVariables): AppConfig {
    return {
        hostname: env.HOSTNAME || DEFAULT_HOSTNAME,
        beeApiUrl: env.BEE_API_URL || DEFAULT_BEE_API_URL,
        authorization: env.AUTH_SECRET,
        moderationSecret: env.MODERATION_SECRET,
        instanceName: env.INSTANCE_NAME,
        removePinHeader: env.REMOVE_PIN_HEADER ? env.REMOVE_PIN_HEADER === 'true' : true,
        homepage: env.HOMEPAGE
    }
}

export function getServerConfig(env: EnvironmentVariables): ServerConfig {
    return { hostname: env.HOSTNAME || DEFAULT_HOSTNAME, port: Number(env.PORT || DEFAULT_PORT) }
}

export function getStampConfig(env: EnvironmentVariables): StampConfig {
    return {
        hardcodedStamp: env.POSTAGE_STAMP || '',
        postageAmount: Types.asOptional(Types.asNumber, env.POSTAGE_AMOUNT),
        postageDepth: Types.asOptional(Types.asNumber, env.POSTAGE_DEPTH),
        postageThresholdSeconds:
            Types.asNullable(Types.asNumber, env.POSTAGE_THRESHOLD_SECONDS) || Duration.fromHours(1).toSeconds(),
        postageThresholdUsage: Types.asNullable(Types.asNumber, env.POSTAGE_THRESHOLD_USAGE) || 0.85,
        postageKeepAlive: env.POSTAGE_KEEP_ALIVE ? env.POSTAGE_KEEP_ALIVE === 'true' : false
    }
}

/**
 * MOB-08 / K55 — kullanım izlemede platform ayrımı. Sözleşme: docs/API_BACKOFFICE_USAGE.md (alan adları birebir).
 * `getPulse` burada yalnız MOB-08'in okuduğu `activeUsers` bloğuyla tiplenir; diğer bloklar (K51 nabız kartları) bu
 * ekranın konusu değil → `unknown`. (bo-r1b nabız tipi gelince `activeUsers` alanı o tipe eklenir; tek AdminRpc kaydı.)
 */
import type { ClientPlatform, PlatformClass, PlatformFilter } from '@entegrasyonik/ui/platform'

export type { ClientPlatform, PlatformClass, PlatformFilter }
export type ByClass = Record<PlatformClass, number>
export type ByPlatform = Record<ClientPlatform, number>
export interface UsageDailyPoint { day: string; desktop: number; mobile: number; unknown: number }

export type DegradedBlock = { status: 'degraded'; error: 'timeout' | 'error' }

export type PulseActiveUsers =
  | {
      status: 'ok'
      computable: true
      platform: PlatformFilter | null
      today: { users: number; tenants: number }
      last7d: { users: number; tenants: number }
      last30d: { users: number; tenants: number }
      byClass: ByClass
      byPlatform: ByPlatform
      mobileShare: number | null
      daily: UsageDailyPoint[]
      truncated: boolean
    }
  | {
      status: 'ok'
      computable: false
      platform: PlatformFilter | null
      today: null
      last7d: null
      last30d: null
      byClass: null
      byPlatform: null
      mobileShare: null
      daily: []
      truncated: false
      note: string
    }
  | DegradedBlock

export interface PulseResponse {
  generatedAt: string
  activeUsers: PulseActiveUsers
  [block: string]: unknown
}

export type UsageDays = 7 | 30 | 90

export type TenantActiveUsers =
  | { computable: true; users: number; byClass: ByClass; byPlatform: ByPlatform; mobileShare: number | null; lastActiveDay: string | null; daily: UsageDailyPoint[]; truncated: boolean }
  | { computable: false; users: null; byClass: null; byPlatform: null; mobileShare: null; lastActiveDay: null; daily: []; truncated: false; note: string }

export interface TenantUsage {
  tid: number
  days: UsageDays
  platform: PlatformFilter | null
  generatedAt: string
  from: string
  to: string
  activeUsers: TenantActiveUsers
  logins: { computable: true; total: number; byClass: ByClass; byPlatform: ByPlatform }
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeOverviewService/getPulse': [{ platform?: PlatformFilter }, PulseResponse]
    'BackofficeTenantService/getUsage': [{ tid: number; days?: UsageDays; platform?: PlatformFilter }, TenantUsage]
  }
}

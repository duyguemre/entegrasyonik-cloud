// MOB-08 / K55: kullanımda platform ayrımı — sahte API sözleşme biçimi, süzgeç, karar (Durum → Karar → Eylem), ekran kaydı.
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import type { PulseActiveUsers, TenantUsage } from '../src/api/contract'
import { pulseUsageVerdict, tenantUsageVerdict } from '../src/views/usage/usageVerdict'
import { platformFromQuery } from '../src/views/usage/platformOrder'
import { SCREENS } from '../src/navigation/screens'
import { CLIENT_PLATFORM, PLATFORM_CLASS } from '../src/utils/labels'
import { CLIENT_PLATFORMS } from '@entegrasyonik/ui/platform'

const keys = (o: object) => Object.keys(o).sort()
const PLAT = [...CLIENT_PLATFORMS].sort()

async function signedIn() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return { api, server }
}

describe('sahte API ↔ docs/API_BACKOFFICE_USAGE.md', () => {
  it('getPulse.activeUsers: alanlar birebir, kırılım tutarlı, son 14 gün', async () => {
    const { api } = await signedIn()
    const r = await api.call('BackofficeOverviewService/getPulse', {})
    const a = r.activeUsers
    expect(a.status).toBe('ok')
    if (a.status !== 'ok' || !a.computable) throw new Error('örnek veri hesaplanabilir olmalı')
    expect(keys(a)).toEqual(['byClass', 'byPlatform', 'computable', 'daily', 'last30d', 'last7d', 'mobileShare', 'platform', 'status', 'today', 'truncated'])
    expect(keys(a.byClass)).toEqual(['desktop', 'mobile', 'unknown'])
    expect(keys(a.byPlatform)).toEqual(PLAT)
    expect(a.daily).toHaveLength(14)
    expect(a.last7d.users).toBeGreaterThan(0)
    expect(a.last30d.users).toBeGreaterThanOrEqual(a.last7d.users)
    expect(a.byClass.desktop + a.byClass.mobile + a.byClass.unknown).toBeGreaterThanOrEqual(a.last7d.users)
    for (const k of ['tenants', 'orders', 'calls', 'errorRate', 'mrr']) expect(r).toHaveProperty(k)
  })

  it('getPulse süzgeci: mobile → masaüstü sayısı 0; geçersiz değer / bilinmeyen alan 400', async () => {
    const { api } = await signedIn()
    const r = await api.call('BackofficeOverviewService/getPulse', { platform: 'mobile' })
    if (r.activeUsers.status !== 'ok' || !r.activeUsers.computable) throw new Error('hesaplanabilir olmalı')
    expect(r.activeUsers.platform).toBe('mobile')
    expect(r.activeUsers.byClass.desktop).toBe(0)
    await expect(api.call('BackofficeOverviewService/getPulse', { platform: 'tablet' } as never)).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    await expect(api.call('BackofficeOverviewService/getPulse', { x: 1 } as never)).rejects.toMatchObject({ status: 400 })
  })

  it('getUsage: alanlar birebir; aralık; giriş kırılımı; kayıt yokken computable:false', async () => {
    const { api, server } = await signedIn()
    const tid = (await api.call('AdminService/getClients', { limit: 50 })).clients.find((c) => c.status === 'ACTIVE')!.clientId
    const u = await api.call('BackofficeTenantService/getUsage', { tid, days: 7 })
    expect(keys(u)).toEqual(['activeUsers', 'days', 'from', 'generatedAt', 'logins', 'platform', 'tid', 'to'])
    expect(keys(u.logins)).toEqual(['byClass', 'byPlatform', 'computable', 'total'])
    expect(u.logins.total).toBe(u.logins.byClass.desktop + u.logins.byClass.mobile + u.logins.byClass.unknown)
    if (u.activeUsers.computable) expect(u.activeUsers.daily).toHaveLength(7)
    await expect(api.call('BackofficeTenantService/getUsage', { tid, days: 14 as never })).rejects.toMatchObject({ status: 400 })
    server.setUsageEmpty(true)
    const e = await api.call('BackofficeTenantService/getUsage', { tid })
    expect(e.activeUsers).toMatchObject({ computable: false, users: null, note: 'hesaplanamadı' })
    const p = await api.call('BackofficeOverviewService/getPulse', {})
    expect(p.activeUsers).toMatchObject({ computable: false, today: null, daily: [] })
  })
})

describe('karar (K51: Durum → Karar → Eylem)', () => {
  const base = { status: 'ok', computable: true, platform: null, today: { users: 10, tenants: 4 }, last7d: { users: 40, tenants: 9 }, last30d: { users: 60, tenants: 12 }, daily: [], truncated: false } as const
  it('olağan dağılım → müdahale gerekmez; eylemler yönlendirir (≤ 3)', () => {
    const v = pulseUsageVerdict({ ...base, byClass: { desktop: 30, mobile: 12, unknown: 0 }, byPlatform: { desktop_web: 28, electron: 2, mobile_web: 6, pwa: 2, android_app: 4, unknown: 0 }, mobileShare: 0.3 })
    expect(v.tone).toBe('success')
    expect(v.title).toBe('Son 7 günde 40 aktif kullanıcı')
    expect(v.decisions[0]!.title).toBe('Müdahale gerekmez')
    expect(v.actions.length).toBeLessThanOrEqual(3)
    expect(v.actions[0]!.to).toEqual({ query: { platform: 'mobile' } })
  })
  it('belirlenemeyen pay ≥ %20 → uyarı + "belirlenemeyenleri göster"; mobil çoğunluk → bilgi (uyarı değil)', () => {
    const v = pulseUsageVerdict({ ...base, byClass: { desktop: 10, mobile: 20, unknown: 10 }, byPlatform: { desktop_web: 10, electron: 0, mobile_web: 5, pwa: 5, android_app: 10, unknown: 10 }, mobileShare: 0.667 })
    expect(v.tone).toBe('warning')
    expect(v.decisions.map((d) => d.key)).toEqual(['unknown', 'mobile-majority'])
    expect(v.actions.map((a) => a.key)).toContain('unknown')
  })
  it('degraded / hesaplanamadı ayrı hüküm verir (okunamayan ≠ kullanım yok)', () => {
    expect(pulseUsageVerdict({ status: 'degraded', error: 'timeout' }).tone).toBe('warning')
    const nc = pulseUsageVerdict({ status: 'ok', computable: false, platform: null, today: null, last7d: null, last30d: null, byClass: null, byPlatform: null, mobileShare: null, daily: [], truncated: false, note: 'hesaplanamadı' } as PulseActiveUsers)
    expect(nc.tone).toBe('neutral')
  })
  it('müşteri: 7+ gündür aktif değil → uyarı + yaşam döngüsü eylemi; giriş de yoksa "kullanım yok"', () => {
    const u: TenantUsage = {
      tid: 7, days: 30, platform: null, generatedAt: '', from: '2026-09-02', to: '2026-10-01',
      activeUsers: { computable: true, users: 3, byClass: { desktop: 3, mobile: 0, unknown: 0 }, byPlatform: { desktop_web: 3, electron: 0, mobile_web: 0, pwa: 0, android_app: 0, unknown: 0 }, mobileShare: 0, lastActiveDay: '2026-09-20', daily: [], truncated: false },
      logins: { computable: true, total: 5, byClass: { desktop: 5, mobile: 0, unknown: 0 }, byPlatform: { desktop_web: 5, electron: 0, mobile_web: 0, pwa: 0, android_app: 0, unknown: 0 } },
    }
    const v = tenantUsageVerdict(u)
    expect(v.tone).toBe('warning')
    expect(v.decisions[0]!.title).toBe('11 gündür aktif kullanıcı yok')
    expect(v.actions[0]!.key).toBe('life')
    const none = tenantUsageVerdict({ ...u, activeUsers: { computable: false, users: null, byClass: null, byPlatform: null, mobileShare: null, lastActiveDay: null, daily: [], truncated: false, note: 'hesaplanamadı' }, logins: { ...u.logins, total: 0 } })
    expect(none.title).toBe('Son 30 günde kullanım yok')
    expect(none.tone).toBe('warning')
  })
})

describe('ekran kaydı ve etiketler', () => {
  it('Kullanım ekranı hazır, müşteri grubunda; tekil kısayol', () => {
    const s = SCREENS.find((x) => x.key === 'usage')!
    expect(s).toMatchObject({ status: 'ready', group: 'customers', path: '/musteriler/kullanim', hotkey: 'n' })
    expect(SCREENS.filter((x) => x.hotkey === 'n')).toHaveLength(1)
  })
  it('her platform alt türünün etiketi ve sınıfı var; sınıf eşlemesi paketle aynı', () => {
    expect(keys(CLIENT_PLATFORM)).toEqual(PLAT)
    expect(keys(PLATFORM_CLASS)).toEqual(['desktop', 'mobile', 'unknown'])
    expect(CLIENT_PLATFORMS.map((p) => CLIENT_PLATFORM[p].cls)).toEqual(['desktop', 'desktop', 'mobile', 'mobile', 'mobile', 'unknown'])
  })
  it('URL süzgeci: geçerli değer aynen, geçersiz → tümü', () => {
    expect(platformFromQuery('pwa')).toBe('pwa')
    expect(platformFromQuery(['mobile'])).toBe('mobile')
    expect(platformFromQuery('tablet')).toBeNull()
    expect(platformFromQuery(undefined)).toBeNull()
  })
})

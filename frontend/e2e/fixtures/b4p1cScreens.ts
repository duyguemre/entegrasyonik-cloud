// ADR-0015 B4-P1c — N7 "Entegrasyon sağlığı" + N10 "Denetim günlüğü" ortak test yardımcıları.
// Sentetik veri (Protokol 7: PII YOK, `.invalid` alan adı, uydurma kimlikler). Sözleşme: docs/API_TENANT_SURFACE.md §3/§4.
//
// Menü: gerçek menü ağacı backend `MenuService`'ten (ApplicationDB `menus`) gelir; bu ekranların kaydı bulut görevinin
// kapsamı DIŞI. Paylaşılan `menuFixture` DEĞİŞTİRİLMEDİ (diğer ekranların görsel tabanları kaymasın) — yalnız bu görevin
// spec'leri `menuFixtureWithB4P1c` override'ını kullanır. `workspace.ts` derin bağlantıyı (`/integrations/health`) çözerken
// hedefi menü ağacında `code`+`parent` ile arar → sağlık ekranı mevcut 'integrations' grubunun çocuğu olarak eklenir.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { menuFixture, waitForWorkplaceReady } from './nav'

export const B4P1C_SCREENS = {
  IntegrationHealthView: { code: 'IntegrationHealthView', parent: 'integrations', title: 'integrationHealth', icon: 'mdi-heart-pulse', slug: 'integrations/health', root: '.integrationHealthView' },
  AuditLogView: { code: 'AuditLogView', parent: '', title: 'auditLog', icon: 'mdi-clipboard-text-clock-outline', slug: 'settings/audit-log', root: '.auditLogView' },
} as const

export type B4P1cScreenCode = keyof typeof B4P1C_SCREENS

/** `menuFixture` + istenen ekranlar (sağlık → 'integrations' grubunun çocuğu; denetim → kök düzey sentetik 'system' grubu, etiketi "Sistem"). */
export function menuFixtureWithB4P1c(codes: B4P1cScreenCode[] = ['IntegrationHealthView', 'AuditLogView']) {
  const clone: any[] = JSON.parse(JSON.stringify(menuFixture))
  if (codes.includes('IntegrationHealthView')) {
    const h = B4P1C_SCREENS.IntegrationHealthView
    const group = clone.find((g) => g.group === 'integrations')
    const parent = group?.links?.find((l: any) => l.code === 'integrations')
    parent?.children?.push({ code: h.code, parent: h.parent, title: h.title, icon: h.icon, singleton: true })
  }
  if (codes.includes('AuditLogView')) {
    const a = B4P1C_SCREENS.AuditLogView
    clone.push({ group: 'system', links: [{ code: a.code, parent: a.parent, title: a.title, icon: a.icon, singleton: true }] })
  }
  return clone
}

/** Derin bağlantıyla ekranı açar ve AKTİF sekme olduğunu doğrular (`hide-tab-component` yok). */
export async function openB4P1cScreen(page: Page, code: B4P1cScreenCode) {
  const def = B4P1C_SCREENS[code]
  await page.goto(`/${def.slug}`)
  await waitForWorkplaceReady(page)
  await expect(page.locator(`${def.root}:not(.hide-tab-component)`)).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

// ---- N7 sentetik sağlık yanıtı (her `health` durumu en az bir kez) ----
const GENERATED_AT = '2026-09-29T11:00:00.000Z'
const minutesAgo = (m: number) => new Date(Date.parse(GENERATED_AT) - m * 60_000).toISOString()

export function integrationHealthFixture(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: GENERATED_AT,
    windowHours: 24,
    integrations: [
      {
        integrationCode: 'hepsiburada', type: 'marketplace', enabled: true, credentialsConfigured: true,
        lastSuccessfulSyncAt: minutesAgo(190),
        webhook: { healthy: false, lastReceivedAt: minutesAgo(300) },
        lastError: { at: minutesAgo(3), code: 'UNAVAILABLE', httpStatus: 503, operation: 'GET /orders' },
        circuit: { state: 'open', observedAt: minutesAgo(3), stale: false },
        last24h: { total: 42, success: 30, error: 12, errorsByCode: { UNAVAILABLE: 9, RATE_LIMITED: 2, UNKNOWN: 1 } },
        health: 'down',
      },
      {
        integrationCode: 'trendyol', type: 'marketplace', enabled: true, credentialsConfigured: true,
        lastSuccessfulSyncAt: minutesAgo(12),
        webhook: { healthy: true, lastReceivedAt: minutesAgo(8) },
        lastError: { at: minutesAgo(25), code: 'RATE_LIMITED', httpStatus: 429, operation: 'GET /suppliers/***/orders' },
        circuit: { state: 'closed', observedAt: minutesAgo(1), stale: false },
        last24h: { total: 6, success: 5, error: 1, errorsByCode: { RATE_LIMITED: 1 } },
        health: 'degraded',
      },
      {
        integrationCode: 'n11', type: 'marketplace', enabled: true, credentialsConfigured: true,
        lastSuccessfulSyncAt: minutesAgo(5), webhook: null, lastError: null,
        circuit: { state: 'closed', observedAt: minutesAgo(5), stale: false },
        last24h: { total: 120, success: 120, error: 0, errorsByCode: {} },
        health: 'healthy',
      },
      {
        integrationCode: 'bizimhesap', type: 'erp', enabled: true, credentialsConfigured: true,
        lastSuccessfulSyncAt: minutesAgo(1440 * 3), webhook: null, lastError: null,
        circuit: { state: 'half_open', observedAt: minutesAgo(600), stale: true },
        last24h: { total: 0, success: 0, error: 0, errorsByCode: {} },
        health: 'no_data',
      },
      {
        // §3 uyarı (a): provisioning anında tohumlanmış tarih — "hiç bağlanmadı" gösterilmeli.
        integrationCode: 'pazarama', type: 'marketplace', enabled: false, credentialsConfigured: false,
        lastSuccessfulSyncAt: minutesAgo(1440 * 40), webhook: null, lastError: null, circuit: null,
        last24h: { total: 0, success: 0, error: 0, errorsByCode: {} },
        health: 'not_configured',
      },
    ],
    ...overrides,
  }
}

// ---- N10 sentetik denetim kayıtları ----
export const auditUsersFixture = {
  totalNumberOfRecords: 2,
  users: [
    { _id: 'u-e2e-owner', name: 'Deniz', surname: 'Yılmaz', email: 'owner@entegrasyonik-e2e.invalid', roleCode: 'OWNER' },
    { _id: 'u-e2e-staff', name: 'Ece', surname: 'Kaya', email: 'staff@entegrasyonik-e2e.invalid', roleCode: 'STAFF' },
  ],
}

export function auditLogsFixture(overrides: Record<string, unknown> = {}) {
  const logs = [
    { id: 'a-01', at: '2026-09-29T10:42:00.000Z', event: 'stock.policy.channel', result: 'ok', userId: 'u-e2e-owner', meta: { integrationCode: 'trendyol', bufferPercent: 10 } },
    { id: 'a-02', at: '2026-09-29T09:15:00.000Z', event: 'user.role_change', result: 'ok', userId: 'u-e2e-owner', meta: { roleCode: 'STAFF' } },
    { id: 'a-03', at: '2026-09-29T08:01:00.000Z', event: 'login', result: 'ok', userId: 'u-e2e-staff', meta: null },
    { id: 'a-04', at: '2026-09-28T17:30:00.000Z', event: 'user.password_change', result: 'fail', userId: 'u-e2e-staff', meta: { reason: 'wrong_current' } },
    { id: 'a-05', at: '2026-09-28T12:05:00.000Z', event: 'tenant.export.requested', result: 'ok', userId: 'u-e2e-owner', meta: null },
    { id: 'a-06', at: '2026-09-28T12:07:00.000Z', event: 'tenant.export.completed', result: 'error', userId: null, meta: null },
    { id: 'a-07', at: '2026-09-27T09:00:00.000Z', event: 'selectStore', result: 'ok', userId: 'u-e2e-removed', meta: null },
    { id: 'a-08', at: '2026-09-26T16:20:00.000Z', event: 'future.unknown_event', result: 'ok', userId: 'u-e2e-owner', meta: { step: 2, alreadyPending: true } },
  ]
  return {
    logs, page: 1, limit: 25, totalNumberOfRecords: logs.length, totalNumberOfPages: 1,
    from: '2026-08-30T00:00:00.000Z', to: '2026-09-29T11:00:00.000Z',
    ...overrides,
  }
}

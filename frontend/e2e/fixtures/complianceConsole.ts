// ADR-0018 Karar 2 "Konsol" — Entegrasyon uyum ekranı (`adminPanel/ComplianceView`) test yardımcıları.
// Sentetik veri (Protokol 7): gerçek müşteri/tenant verisi YOK; tenant kimlikleri uydurma sayılardır,
// doküman URL'si `.invalid` alan adındadır. Alan şekilleri backend DTO'larıyla (`toListDto`/`toDetailDto`/
// `summary()`, `integration-compliance-service.ts`) BİREBİR — alan uydurulmaz.
//
// Menü: gerçek menü kaydı (ApplicationDB `menus`) bu bulut görevinin kapsamı dışı. `nav.ts`'teki paylaşılan
// fixture'lar DEĞİŞTİRİLMEDİ (diğer ekranların ekran görüntüsü tabanlarını kaydırmamak için — `menuFixtureWithLogs`
// ile aynı gerekçe); yalnız bu görevin spec'i `menuFixtureWithCompliance` override'ını kullanır. `workspace.ts`
// derin bağlantıyı çözerken hedefi menü ağacında arar (`code`+`parent`), bu yüzden olumsuz rol testi menüden
// girişi ÇIKARARAK kurulur (backend `MenuService` platformAdmin olmayana bu girişi döndürmez).
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { menuFixtureWithAdmin, waitForWorkplaceReady } from './nav'

export const COMPLIANCE_ROOT = '.complianceView'
export const COMPLIANCE_SLUG = 'admin/integration-compliance'
export const COMPLIANCE_MENU_ICON = 'mdi-shield-search'
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** `menuFixtureWithAdmin` + 'adminPanel' grubuna "Entegrasyon uyum" girişi (`include=false` → giriş YOK). */
export function menuFixtureWithCompliance(include = true) {
  return menuFixtureWithAdmin.map((group) =>
    group.group === 'applicationAdministration'
      ? {
          ...group,
          links: group.links.map((link: any) =>
            link.code === 'adminPanel' && include
              ? {
                  ...link,
                  children: [
                    ...link.children,
                    { code: 'ComplianceView', parent: 'adminPanel', title: 'adminIntegrationCompliance', icon: COMPLIANCE_MENU_ICON, singleton: true },
                  ],
                }
              : link,
          ),
        }
      : group,
  )
}

/** Derin bağlantıyla ekranı açar ve AKTİF sekme olduğunu doğrular. */
export async function openComplianceScreen(page: Page) {
  await page.goto(`/${COMPLIANCE_SLUG}`)
  await waitForWorkplaceReady(page)
  await expect(page.locator(`${COMPLIANCE_ROOT}:not(.hide-tab-component)`)).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

// ---- summary() ----
const PROBE_RUN = {
  name: 'compliance.probeRunner',
  lastFinishedAt: '2026-09-29T03:00:00.000Z',
  lastStatus: 'ok',
  lastCounts: { processed: 6, failed: 0, note: 'replay', skipped: false },
}

function sev(critical = 0, high = 0, medium = 0, low = 0, info = 0) {
  return { total: critical + high + medium + low + info, bySeverity: { critical, high, medium, low, info } }
}

export const SUMMARY_FIXTURE = [
  { integrationCode: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.4.0', lastVerifiedAt: '2026-09-27', openFindings: sev(0, 1, 0, 1, 0), lastProbeRun: PROBE_RUN },
  { integrationCode: 'hepsiburada', displayName: 'Hepsiburada', category: 'marketplace', adapterVersion: '1.3.0', lastVerifiedAt: '2026-09-27', openFindings: sev(0, 0, 1, 0, 0), lastProbeRun: PROBE_RUN },
  { integrationCode: 'n11', displayName: 'N11', category: 'marketplace', adapterVersion: '1.1.0', lastVerifiedAt: null, openFindings: sev(0, 0, 0, 0, 1), lastProbeRun: PROBE_RUN },
  { integrationCode: 'pazarama', displayName: 'Pazarama', category: 'marketplace', adapterVersion: '1.0.2', lastVerifiedAt: '2026-09-27', openFindings: sev(1, 0, 0, 0, 0), lastProbeRun: PROBE_RUN },
  { integrationCode: 'ideasoft', displayName: 'Ideasoft', category: 'ecommerce', adapterVersion: '1.0.0', lastVerifiedAt: null, openFindings: sev(), lastProbeRun: PROBE_RUN },
  { integrationCode: 'bizimhesap', displayName: 'Bizimhesap', category: 'erp', adapterVersion: '1.0.1', lastVerifiedAt: '2026-09-27', openFindings: sev(), lastProbeRun: PROBE_RUN },
]

/** Açık bulgu yokken (liste boş) tutarlı özet: kartlar "Açık bulgu yok", probe kaydı var. */
export const SUMMARY_CLEAN_FIXTURE = SUMMARY_FIXTURE.map((s) => ({ ...s, openFindings: sev() }))

/** Hiç probe koşusu kaydı yokken (JobState yok) backend `lastProbeRun: null` döner. */
export const SUMMARY_NO_PROBE_FIXTURE = SUMMARY_FIXTURE.map((s) => ({ ...s, openFindings: sev(), lastProbeRun: null }))

// ---- list() ----
export const TRENDYOL_ENUM_KEY = 'e2e-dedup-trendyol-enum-0001'

export const LIST_FIXTURE = [
  {
    dedupKey: TRENDYOL_ENUM_KEY, integrationCode: 'trendyol', category: 'marketplace', kind: 'unknown_enum', source: 'guard',
    subjectKey: 'trendyol.orders.list@v2#content[].status', severity: 'high', status: 'new', confirmed: true, occurrences: 37,
    firstSeenAt: '2026-09-28T08:10:00.000Z', lastSeenAt: '2026-09-29T09:40:00.000Z', affectedTenantsCount: 2, adapterVersionSeen: '2.4.0',
  },
  {
    dedupKey: 'e2e-dedup-trendyol-schema-0002', integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard',
    subjectKey: 'trendyol.claims.list@v2#content[]', severity: 'low', status: 'new', confirmed: false, occurrences: 4,
    firstSeenAt: '2026-09-29T07:00:00.000Z', lastSeenAt: '2026-09-29T08:55:00.000Z', affectedTenantsCount: 1, adapterVersionSeen: '2.4.0',
  },
  {
    dedupKey: 'e2e-dedup-hb-deprecation-0003', integrationCode: 'hepsiburada', category: 'marketplace', kind: 'deprecation', source: 'probe',
    subjectKey: '/orders/:id', severity: 'medium', status: 'triaged', confirmed: true, occurrences: 12,
    firstSeenAt: '2026-09-25T11:00:00.000Z', lastSeenAt: '2026-09-29T03:00:00.000Z', affectedTenantsCount: 0, adapterVersionSeen: '1.3.0',
  },
  {
    dedupKey: 'e2e-dedup-n11-doc-0004', integrationCode: 'n11', category: 'marketplace', kind: 'doc', source: 'source_monitor',
    subjectKey: 'https://docs.example.invalid/n11/changelog', severity: 'info', status: 'new', confirmed: false, occurrences: 1,
    firstSeenAt: '2026-09-28T02:00:00.000Z', lastSeenAt: '2026-09-28T02:00:00.000Z', affectedTenantsCount: 0,
  },
  {
    dedupKey: 'e2e-dedup-pazarama-auth-0005', integrationCode: 'pazarama', category: 'marketplace', kind: 'auth', source: 'guard',
    subjectKey: '/auth/token', severity: 'critical', status: 'accepted', confirmed: true, occurrences: 58,
    firstSeenAt: '2026-09-27T14:00:00.000Z', lastSeenAt: '2026-09-29T06:20:00.000Z', affectedTenantsCount: 3, adapterVersionSeen: '1.0.2',
  },
  {
    dedupKey: 'e2e-dedup-bizimhesap-version-0006', integrationCode: 'bizimhesap', category: 'erp', kind: 'version', source: 'probe',
    subjectKey: '/api/v1/products', severity: 'medium', status: 'fixed', confirmed: true, occurrences: 9,
    firstSeenAt: '2026-09-20T10:00:00.000Z', lastSeenAt: '2026-09-22T10:00:00.000Z', affectedTenantsCount: 1,
    adapterVersionSeen: '1.0.0', fixedInAdapterVersion: '1.0.1', fixRef: 'PR-214',
  },
]

/** Detay: liste satırı + redakte kanıt + sayı listesi (sentetik tenant kimlikleri — ekranda GÖSTERİLMEMELİ). */
export const TRENDYOL_ENUM_DETAIL = {
  ...LIST_FIXTURE[0],
  affectedTenants: [90101, 90102],
  evidence: {
    paths: ['content[].status'],
    types: ['string'],
    enumValue: 'AT_COLLECTION_POINT',
    httpStatus: 200,
    fingerprint: 'sha256:4f1c9a0e7b2d',
  },
  recommendation: 'Sipariş durum eşleyicisine yeni durum kodu eklenmeli; sözleşme şeması ve fikstür güncellenmeli.',
}

export function detailFor(id: string) {
  if (id === TRENDYOL_ENUM_KEY) return TRENDYOL_ENUM_DETAIL
  const row = LIST_FIXTURE.find((r) => r.dedupKey === id)
  return row ? { ...row, affectedTenants: [], evidence: undefined } : null
}

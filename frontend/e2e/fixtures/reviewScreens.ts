// DS-v2 Aşama 3 — premium eleştiri turları için "her ekran" gezinti yardımcıları (yalnız inceleme görüntüsü;
// iddia yok). Sentetik veri (Protokol 7: PII YOK, `.invalid` alan adı). Fixture şekilleri ilgili ekranların
// kendi spec'lerindeki (financial, notifications, stock-policy, admin-*) örneklerle aynıdır — alan uydurulmaz.
//
// Menü: `screens.ts`'teki TÜM ekranları kapsayan sentetik bir ağaç. Başlıklar mevcut `menu.*` anahtarlarına
// eşlenir; anahtarı olmayanlar `navigation/menuTitle.ts` yedeğine düşer (ham anahtar görünmez).
import type { Page, Route } from '@playwright/test'
import { SCREENS } from '../../src/navigation/screens'
import { userContextFixture } from './apiData'
import { auditLogsFixture, auditUsersFixture, integrationHealthFixture } from './b4p1cScreens'
import { LIST_FIXTURE as COMPLIANCE_LIST, SUMMARY_FIXTURE as COMPLIANCE_SUMMARY } from './complianceConsole'
import { stockOverviewDoluFixture } from './stockHealth'
import { installApiMocks } from './mockApi'
import { waitForWorkplaceReady } from './nav'

/** Ekran anahtarı → menüdeki `title` (i18n `menu.*` karşılığı). */
const TITLES: Record<string, string> = {
  DashboardView: 'dashboard',
  NotificationCenterView: 'notifications',
  OrderListView: 'orderList',
  'productDefinitions/ProductListView': 'productList',
  ClaimListView: 'claimList',
  CustomerListView: 'customerList',
  InvoiceListView: 'invoiceList',
  MessageListView: 'messageList',
  StockHealthView: 'stockHealth',
  StockPolicyView: 'stockPolicy',
  FinancialListView: 'financialList',
  'user/SubscriptionView': 'subscription',
  LogListView: 'logList',
  AuditLogView: 'auditLog',
  AccountSecurityView: 'accountSecurity',
  PrivacyDataView: 'privacyData',
  'integrations/MarketplaceView': 'marketplace',
  'integrations/ECommerceView': 'ecommerce',
  'integrations/ShippingView': 'shipping',
  'integrations/EInvoiceView': 'einvoice',
  'integrations/ErpView': 'erp',
  'integrations/IntegrationHealthView': 'integrationHealth',
  'adminPanel/AdminClientListView': 'adminClientlist',
  'adminPanel/AdminTicketListView': 'adminTicketList',
  'adminPanel/AdminSystemManagementView': 'adminSystemManagement',
  'adminPanel/IntegrationConfigListView': 'adminOperations',
  'adminPanel/ComplianceView': 'adminIntegrationCompliance',
}

/** Menü grubu → üyeler (sıra = sidebar sırası). Alt öğeler `parent/Code` anahtarıyla gelir. */
const GROUPS: Array<{ group: string; keys: string[] }> = [
  { group: 'dashboard', keys: ['DashboardView', 'NotificationCenterView'] },
  { group: 'sale', keys: ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView', 'MessageListView'] },
  { group: 'catalog', keys: ['StockHealthView', 'StockPolicyView'] },
  { group: 'integrations', keys: ['integrations/MarketplaceView', 'integrations/ECommerceView', 'integrations/ShippingView', 'integrations/EInvoiceView', 'integrations/ErpView', 'integrations/IntegrationHealthView'] },
  { group: 'finance', keys: ['FinancialListView'] },
  { group: 'settings', keys: ['LogListView', 'AuditLogView'] },
  { group: 'account', keys: ['user/SubscriptionView', 'AccountSecurityView', 'PrivacyDataView'] },
  { group: 'applicationAdministration', keys: ['adminPanel/AdminClientListView', 'adminPanel/AdminTicketListView', 'adminPanel/AdminSystemManagementView', 'adminPanel/IntegrationConfigListView', 'adminPanel/ComplianceView'] },
]

const PARENT_TITLE: Record<string, string> = { productDefinitions: 'productDefinitions', integrations: 'integrations', adminPanel: 'adminPanel', user: 'user' }
const PARENT_ICON: Record<string, string> = { productDefinitions: 'mdi-tag-outline', integrations: 'mdi-connection', adminPanel: 'mdi-shield-account-outline', user: 'mdi-account-circle-outline' }

function iconFor(key: string): string {
  return SCREENS.find((s) => s.key === key)?.icon ?? 'mdi-circle-small'
}

export function reviewMenuFixture() {
  return GROUPS.map(({ group, keys }) => {
    const links: any[] = []
    for (const key of keys) {
      const [parent, code] = key.includes('/') ? key.split('/') : ['', key]
      const leaf = { code, parent, title: TITLES[key] ?? code, icon: iconFor(key), singleton: true }
      if (!parent) {
        links.push(leaf)
        continue
      }
      let holder = links.find((l) => l.code === parent)
      if (!holder) {
        holder = { code: parent, parent: '', title: PARENT_TITLE[parent] ?? parent, icon: PARENT_ICON[parent], children: [] }
        links.push(holder)
      }
      holder.children.push(leaf)
    }
    return { group, links }
  })
}

const json = (route: Route, headers: Record<string, string>, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

const iso = (minutesAgo: number) => new Date(Date.parse('2026-09-29T11:00:00.000Z') - minutesAgo * 60_000).toISOString()

const NOTIFICATIONS = [
  { _id: 'rv-n-1', type: 'IMPORT_READY', mode: 'IMPORT', severity: 'success', title: 'İçe aktarma tamamlandı', message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.', isRead: false, createdAt: iso(5), metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42, invalidCount: 3 } },
  { _id: 'rv-n-2', type: 'STOCK_ALERT', severity: 'error', title: 'Aşırı satış uyarısı', message: 'SKU E2E-TSH-01 için stoktan fazla sipariş alındı.', isRead: false, createdAt: iso(180) },
  { _id: 'rv-n-3', type: 'ORDER', severity: 'info', title: 'Yeni sipariş', message: 'Hepsiburada kanalından 3 yeni sipariş geldi.', isRead: true, createdAt: iso(30) },
  { _id: 'rv-n-4', type: 'SYSTEM', severity: 'warning', title: 'Planlı bakım', message: 'Planlı bakım gece 02:00-03:00 arasında yapılacak.', isRead: true, createdAt: iso(600) },
]

const FINANCE = {
  transactions: [
    { _id: 'rv-f-1', externalId: 'TRX-E2E-0001', orderNumber: 'SIP-E2E-1001', integrationCode: 'TRENDYOL', platformType: 'Trendyol Sipariş', transactionType: 'SALE', credit: 1500, debt: 250, netAmount: 1250, commissionAmount: 200, commissionRate: 13, transactionDate: '2026-09-28T10:00:00.000Z', payoutDate: '2026-10-05T10:00:00.000Z', description: 'Satış hakedişi' },
    { _id: 'rv-f-2', externalId: 'TRX-E2E-0002', orderNumber: null, integrationCode: 'HEPSIBURADA', platformType: 'Hepsiburada Kesinti', transactionType: 'DEDUCTION', credit: 0, debt: 300, netAmount: -300, transactionDate: '2026-09-27T10:00:00.000Z' },
    { _id: 'rv-f-3', externalId: 'TRX-E2E-0003', orderNumber: 'SIP-E2E-1003', integrationCode: 'N11', platformType: 'N11 Sipariş', transactionType: 'SALE', credit: 410, debt: 52, netAmount: 358, transactionDate: '2026-09-26T10:00:00.000Z' },
  ],
  totalNumberOfRecords: 45,
  summary: { totalCredit: 98765.4, totalDebt: 12345.6, netAmount: 86419.8, totalCargo: 777.5, transactionCount: 321 },
}

const STOCK_POLICY = {
  primaryChannel: null,
  effectivePrimaryChannel: 'trendyol',
  primaryChannelIsConnected: true,
  channels: [
    { integrationCode: 'trendyol', order: 1, enabled: true, isPrimary: true, autoCancelSupported: true, stockPolicy: { bufferPercent: 10 } },
    { integrationCode: 'hepsiburada', order: 2, enabled: true, isPrimary: false, autoCancelSupported: true, stockPolicy: {} },
    { integrationCode: 'n11', order: 3, enabled: false, isPrimary: false, autoCancelSupported: false, stockPolicy: { graceMinutes: 45 } },
  ],
  defaults: { bufferUnits: 1, bufferPercent: 0, graceMinutes: 30, autoCancelOversold: true },
  limits: { bufferUnitsMax: 100000, bufferPercentMax: 100, graceMinutesMax: 10080 },
}

const CONFIG_LIST = [
  { target: '_engine', displayName: 'Motor ayarları', category: 'engine', publishedVersion: 4, intake: 'on', hasDraft: false },
  { target: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.3.0', publishedVersion: 2, intake: 'on', hasDraft: true, draftLockedBy: 'yonetici@entegrasyonik-e2e.invalid' },
  { target: 'hepsiburada', displayName: 'Hepsiburada', category: 'marketplace', adapterVersion: '1.1.0', publishedVersion: 0, intake: 'drain', hasDraft: false },
  { target: 'ideasoft', displayName: 'Ideasoft', category: 'ecommerce', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'on', hasDraft: false },
  { target: 'bizimhesap', displayName: 'Bizimhesap', category: 'erp', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'on', hasDraft: false },
]

const EFFECTIVE_CONFIG = {
  target: 'trendyol',
  publishedVersion: 2,
  catalogVersion: '2026-09-29.b1',
  values: [
    { key: 'resilience.timeoutMs', value: 45000, source: 'published' },
    { key: 'resilience.retry.maxAttempts', value: 4, source: 'default' },
    { key: 'order.syncIntervalMs', value: 60000, source: 'default' },
  ],
}

/** Tüm ekranlar için dolu durum mock'ları (varsayılanların üstüne). */
export function reviewMocks(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MenuService: reviewMenuFixture(),
    userContext: { ...userContextFixture, email: 'hesap.sahibi@entegrasyonik-e2e.invalid', name: 'Deniz', surname: 'Örnek', emailVerified: true, isGlobalAdmin: true },
    NotificationService: (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: NOTIFICATIONS, unreadCount: 2 }),
    'NotificationService/get': (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: NOTIFICATIONS, unreadCount: 2 }),
    'NotificationService/getUnreadCount': { result: true, unreadCount: 2 },
    'FinancialService/getTransactionData': FINANCE,
    'FinancialService/getFinancialSummary': FINANCE.summary,
    'FinancialService/getCargoInvoices': [],
    'IntegrationService/getStockPolicy': STOCK_POLICY,
    'StockService/getStockOverview': stockOverviewDoluFixture,
    'IntegrationService/getIntegrationHealth': integrationHealthFixture(),
    'AuditService/getAuditLogs': auditLogsFixture(),
    'UserService/getUsers': auditUsersFixture,
    'IntegrationConfigService/list': CONFIG_LIST,
    'IntegrationConfigService/getEffectiveConfig': EFFECTIVE_CONFIG,
    'IntegrationConfigService/history': [],
    'IntegrationComplianceService/list': COMPLIANCE_LIST,
    'IntegrationComplianceService/summary': COMPLIANCE_SUMMARY,
    ...extra,
  }
}

/** Ekranın derin bağlantısı (ayar ekranları hedef kodu ister). */
export function reviewPath(key: string): string {
  const screen = SCREENS.find((s) => s.key === key)!
  const needsCode = ['adminPanel/IntegrationSettingsView', 'adminPanel/EffectiveConfigView'].includes(key)
  return `/${screen.slug}${needsCode ? '?code=trendyol' : ''}`
}

export async function openReviewScreen(page: Page, key: string) {
  await installApiMocks(page, reviewMocks())
  await page.goto(reviewPath(key))
  await waitForWorkplaceReady(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  // Etkin sekmenin içeriği (asenkron bileşen) çizilene kadar: görünür bir başlık ya da tablo/kart.
  await page
    .locator('.workplace-area :is(h1, h2, table, .v-card):visible')
    .first()
    .waitFor({ timeout: 10000 })
    .catch(() => undefined)
  await page.waitForTimeout(900)
}

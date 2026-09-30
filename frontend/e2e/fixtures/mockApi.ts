// Faz 3 T1b — `/api/**` sentetik fixture ağ katmanı (ADR-0011 Karar 4 / Alternatif D2).
// Gerçek backend/Redis/Mongo YOK; tüm çağrılar page.route ile yakalanıp sentetik veri döner.
// Protokol 7: hiçbir gerçek kullanıcı/müşteri verisi yok, tamamı uydurma (bkz. apiData.ts).

import type { Page, Route } from '@playwright/test'
import {
  adminClientIntegrationsFixture,
  adminClientStatsFixture,
  adminClientsDoluFixture,
  adminExportDetailsFixture,
  adminGlobalMetricsFixture,
  adminSystemHealthDoluFixture,
  adminTicketsDoluFixture,
  buildSubscription,
  claimsDoluFixture,
  clientIntegrationsDoluFixture,
  customersDoluFixture,
  buildCustomerDetail,
  exportJobsDoluFixture,
  exportJobDetailFixture,
  importJobsDoluFixture,
  importJobByJobIdFixture,
  importJobReportFixture,
  integrationHealthFixture,
  integrationDefinitionsFixture,
  integrationTypesFixture,
  invoicesDoluFixture,
  messagesDoluFixture,
  ordersDoluFixture,
  orderDashboardInsightsFixture,
  plansDoluFixture,
  productStatisticsFixture,
  productsDoluFixture,
  resourcesFixture,
  retrieveClientSettingsResponse,
  settingsFixture,
  stockOverviewFixture,
  userContextFixture,
} from './apiData'
import { menuFixture } from './nav'
import { integrationCatalogFixture } from './integrationCatalog'

export type MockValue = any | ((route: Route, corsHeaders: Record<string, string>) => Promise<void> | void)

export interface MockErrorMarker {
  __mockError: true
  status: number
  body: any
}

/** Belirli bir servis çağrısı için HTTP hata durumu üretir (429/500/timeout benzeri senaryolar). */
export function mockError(status: number, body: any = { message: 'E2E sentetik hata' }): MockErrorMarker {
  return { __mockError: true, status, body }
}

function isErrorMarker(value: any): value is MockErrorMarker {
  return value && typeof value === 'object' && value.__mockError === true
}

// Uygulamanın açılış akışı (App.vue -> fetchUserContext/initApp, SecureLayout -> menu, ...) için
// gerçekçi varsayılan yanıtlar. Testler yalnızca ilgilendikleri yolu `overrides` ile değiştirir;
// geri kalanı burada tanımlı "DOLU" (başarı) durumundan gelir.
export const defaultRoutes: Record<string, MockValue> = {
  checkAuthentication: true,
  userContext: userContextFixture,
  MenuService: menuFixture,
  'MenuService/retrieveFavorites': [],
  'UserService/getResources': resourcesFixture,
  'UserService/getRoles': [],
  'SettingService/getSettings': settingsFixture,
  'ProductService/getProductStatistics': productStatisticsFixture,
  'IntegrationService': integrationDefinitionsFixture,
  'IntegrationService/integrationTypes': integrationTypesFixture,
  'IntegrationService/getClientIntegrations': clientIntegrationsDoluFixture,
  'CategoryService': [],
  'BrandService': [],
  'ChoiceService': [],
  'HashtagService': [],
  'OrderService/getOrderDashboardInsights': orderDashboardInsightsFixture,
  // DS-v2 dashboard kartları (stok uyarıları, entegrasyon sağlığı).
  'StockService/getStockOverview': stockOverviewFixture,
  'IntegrationService/getIntegrationHealth': integrationHealthFixture,
  // C1.2 — kanal kapsamı / canlı küme (backend manifestolarının birebir kopyası, bkz. integrationCatalog.ts).
  'IntegrationService/getCatalog': integrationCatalogFixture(),
  'OrderService/getOrders': ordersDoluFixture,
  'ProductService/getProducts': productsDoluFixture,
  'ClaimService/getClaims': claimsDoluFixture,
  'CustomerService/getCustomers': customersDoluFixture,
  'CustomerService/getCustomerDetail': buildCustomerDetail(),
  'InvoiceService/getInvoices': invoicesDoluFixture,
  'MessageService/getMessages': messagesDoluFixture,
  'BillingService/getPlans': plansDoluFixture,
  'BillingService/getMySubscription': buildSubscription(),
  // P2 (Faz 3 Parti — log listeleri göçü): ExportLogList/ImportLogList +
  // DetailedExportLogReport/DetailedImportLogReport'un gerçekte çağırdığı
  // uçlar (bkz. e2e/specs/logs.spec.ts).
  'IntegrationService/getExportJobs': exportJobsDoluFixture,
  'IntegrationService/getExportJobDetail': exportJobDetailFixture,
  'IntegrationService/getImportJobs': importJobsDoluFixture,
  'IntegrationService/getImportJobByJobId': importJobByJobIdFixture,
  'IntegrationService/getJobReport': importJobReportFixture,
  // P2 (Faz 3 Parti — admin panel göçü): AdminClientListView/AdminClientDetailComponent,
  // AdminTicketListView/AdminChatComponent, AdminSystemManagementView'ın gerçekte çağırdığı
  // AdminService uçları (bkz. e2e/specs/admin-*.spec.ts).
  'AdminService/getClients': adminClientsDoluFixture,
  'AdminService/getClientStats': adminClientStatsFixture,
  'AdminService/getClientIntegrations': adminClientIntegrationsFixture,
  'AdminService/getGlobalMetrics': adminGlobalMetricsFixture,
  'AdminService/getTickets': adminTicketsDoluFixture,
  'AdminService/getSystemHealth': adminSystemHealthDoluFixture,
  'AdminService/getExportDetails': adminExportDetailsFixture,
  'SmartService/unifiedSearch': { navigation: [], orders: [], products: [] },
  'IntegrationService/retrievePlatformInfos': {},
  'IntegrationService/retrieveClientMarketplaceSettings': async (route: Route, headers: Record<string, string>) => {
    const body = route.request().postDataJSON?.() ?? {}
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(retrieveClientSettingsResponse(body.integrationCode ?? 'trendyol')) })
  },
  'IntegrationService/retrieveClientECommerceSettings': async (route: Route, headers: Record<string, string>) => {
    const body = route.request().postDataJSON?.() ?? {}
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(retrieveClientSettingsResponse(body.integrationCode ?? 'ideasoft')) })
  },
  'IntegrationService/retrieveClientErpSettings': async (route: Route, headers: Record<string, string>) => {
    const body = route.request().postDataJSON?.() ?? {}
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(retrieveClientSettingsResponse(body.integrationCode ?? 'bizimhesap')) })
  },
  'IntegrationService/retrieveClientShipmentSettings': async (route: Route, headers: Record<string, string>) => {
    const body = route.request().postDataJSON?.() ?? {}
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(retrieveClientSettingsResponse(body.integrationCode ?? '')) })
  },
}

// restapi.ts (bkz. dosya başı) axios'u SABİT, farklı origin'e (http://127.0.0.1:5001) işaret eden
// `baseUrl` ile çağırıyor; gerçek backend YOK ama tarayıcı yine de CORS kontrolünü intercept
// edilmiş yanıtlar için de uyguluyor (Playwright bunu otomatik atlamıyor). `withCredentials=true`
// olduğu için `Access-Control-Allow-Origin: *` KULLANILAMAZ — isteğin Origin'i birebir yansıtılır.
async function corsHeaders(route: Route): Promise<Record<string, string>> {
  const origin = (await route.request().headerValue('origin')) ?? '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    // faz3-fe-c2a: dış etkili yazma RPC'leri `Idempotency-Key` başlığı gönderir (API_IDEMPOTENCY.md); preflight izin vermeli.
    'Access-Control-Allow-Headers': 'content-type,authorization,idempotency-key',
  }
}

async function respond(route: Route, def: MockValue, extraHeaders: Record<string, string>) {
  if (typeof def === 'function') {
    return def(route, extraHeaders)
  }
  if (isErrorMarker(def)) {
    return route.fulfill({ status: def.status, contentType: 'application/json', headers: extraHeaders, body: JSON.stringify(def.body) })
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers: extraHeaders, body: JSON.stringify(def) })
}

/**
 * `**\/api/**` altındaki tüm çağrıları yakalar. `overrides` testin kendi DOLU/BOŞ/HATA
 * varyantını `defaultRoutes`'un üstüne yazar (aynı anahtar -> override kazanır).
 * Eşlenmemiş bir yol için uygulamanın açılış akışını kesmemek amacıyla sessiz 200 döner
 * (konsola uyarı basılır — testte "[mockApi] Eşlenmemiş" araması ile yakalanabilir).
 */
export async function installApiMocks(page: Page, overrides: Record<string, MockValue> = {}) {
  await page.route('**/api/**', async (route) => {
    const method = route.request().method()
    const cors = await corsHeaders(route)

    // Farklı origin'e (baseURL 4300 -> API 5001) JSON gövdeli POST çağrıları tarayıcıda
    // CORS preflight (OPTIONS) tetikler; gerçek backend yok, biz de burada cevaplıyoruz.
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors, body: '' })
    }

    const url = new URL(route.request().url())
    const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')

    if (Object.prototype.hasOwnProperty.call(overrides, path)) {
      return respond(route, overrides[path], cors)
    }
    if (Object.prototype.hasOwnProperty.call(defaultRoutes, path)) {
      return respond(route, defaultRoutes[path], cors)
    }

    // eslint-disable-next-line no-console
    console.warn(`[mockApi] Eşlenmemiş API çağrısı (varsayılan boş yanıt dönüldü): ${method} ${path}`)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: method === 'GET' ? '[]' : '{}',
    })
  })
}

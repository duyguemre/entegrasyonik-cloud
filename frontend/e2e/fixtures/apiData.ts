// Faz 3 T1b — Sentetik (Protokol 7: PII YOK, tamamı uydurma) API yanıt gövdeleri.
// Şekiller `frontend/src/composables/restapi.ts` üzerinden geçen gerçek servis adlarına ve
// ilgili store/component'lerin (integrationStore, OrderListView, ProductListView, ...) beklediği
// alanlara göre kuruldu — bkz. bu görevin araştırma notları (subagent raporu).

export const userContextFixture = {
  _id: 'user-e2e-001',
  username: 'test.kullanici@entegrasyonik-e2e.invalid',
  owner: true,
  resources: [],
}

export const settingsFixture = {
  settings: {
    storeName: 'E2E Test Mağazası',
  },
}

export const resourcesFixture: any[] = []

export const productStatisticsFixture = {}

// --- Entegrasyonlar ---------------------------------------------------------

export const integrationDefinitionsFixture = [
  { _id: 'itg-trendyol', code: 'trendyol', title: 'Trendyol', order: 1, type: { _id: 'type-marketplace', code: 'marketplace' } },
  { _id: 'itg-hepsiburada', code: 'hepsiburada', title: 'Hepsiburada', order: 2, type: { _id: 'type-marketplace', code: 'marketplace' } },
  { _id: 'itg-n11', code: 'n11', title: 'N11', order: 3, type: { _id: 'type-marketplace', code: 'marketplace' } },
  { _id: 'itg-pazarama', code: 'pazarama', title: 'Pazarama', order: 4, type: { _id: 'type-marketplace', code: 'marketplace' } },
  { _id: 'itg-ideasoft', code: 'ideasoft', title: 'Ideasoft', order: 1, type: { _id: 'type-ecommerce', code: 'ecommerce' } },
  { _id: 'itg-bizimhesap', code: 'bizimhesap', title: 'Bizimhesap', order: 1, type: { _id: 'type-erp', code: 'erp' } },
]

export const integrationTypesFixture = [
  { _id: 'type-marketplace', code: 'marketplace' },
  { _id: 'type-ecommerce', code: 'ecommerce' },
  { _id: 'type-erp', code: 'erp' },
  { _id: 'type-shipment', code: 'shipment' },
]

export const clientIntegrationsDoluFixture = {
  marketplace: [
    { code: 'trendyol', order: 1, settings: { supplierId: '111111', apiKey: 'e2e-fake-key', apiSecret: 'e2e-fake-secret' } },
    { code: 'hepsiburada', order: 2, settings: { merchantId: 'e2e-merchant', username: 'e2e-user', password: 'e2e-pass' } },
  ],
  ecommerce: [
    { code: 'ideasoft', order: 1, settings: { storeUrl: 'https://e2e-magaza.example', apiKey: 'e2e-fake-key' } },
  ],
  erp: [
    { code: 'bizimhesap', order: 1, settings: { apiKey: 'e2e-fake-key' } },
  ],
  shipment: [],
}

export const clientIntegrationsBosFixture = {
  marketplace: [],
  ecommerce: [],
  erp: [],
  shipment: [],
}

export function retrieveClientSettingsResponse(integrationCode: string) {
  return {
    _id: `client-itg-${integrationCode}`,
    code: integrationCode,
    settings: { note: 'e2e sentetik ayar' },
  }
}

// --- Siparişler ---------------------------------------------------------

export function buildOrder(overrides: Record<string, any> = {}) {
  return {
    _id: 'order-e2e-0001',
    orderNumber: 'E2E-100001',
    integrationCode: 'trendyol',
    internalStatus: 'AWAITING_APPROVAL',
    billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz' },
    items: [{ productName: 'E2E Test Ürünü', quantity: 1 }],
    financials: { grandTotal: 349.9, currencyCode: 'TRY' },
    flags: { isInvoiceGenerated: false },
    platformDiscrepancy: { hasDiscrepancy: false },
    platformOperation: { lockedUntil: null, message: '' },
    cancelSource: null,
    dates: { orderDate: '2026-09-20T10:15:00.000Z' },
    ...overrides,
  }
}

export const ordersDoluFixture = {
  orders: [
    buildOrder(),
    buildOrder({
      _id: 'order-e2e-0002',
      orderNumber: 'E2E-100002',
      integrationCode: 'hepsiburada',
      internalStatus: 'APPROVED',
      billingAddress: { firstName: 'Mehmet', lastName: 'Demir' },
      financials: { grandTotal: 129.5, currencyCode: 'TRY' },
    }),
  ],
  totalNumberOfRecords: 2,
}

export const ordersBosFixture = {
  orders: [],
  totalNumberOfRecords: 0,
}

// --- Ürünler ---------------------------------------------------------

export function buildProduct(overrides: Record<string, any> = {}) {
  return {
    _id: 'product-e2e-0001',
    title: 'E2E Test Ürünü',
    hasVariant: false,
    images: [],
    variants: [{ stockcode: 'SK-E2E-001', barcode: '8690000000001', order: 0 }],
    prices: { minSalePrice: 199.9, maxSalePrice: 199.9 },
    stock: 42,
    brand: null,
    category: null,
    onsale: true,
    hashtags: [],
    platformUploads: {},
    ...overrides,
  }
}

export const productsDoluFixture = {
  products: [
    buildProduct(),
    buildProduct({ _id: 'product-e2e-0002', title: 'E2E İkinci Ürün', stock: 0, onsale: false }),
  ],
  totalNumberOfRecords: 2,
  fromTo: '1-2 / 2',
  isFiltered: false,
}

export const productsBosFixture = {
  products: [],
  totalNumberOfRecords: 0,
  fromTo: '0-0 / 0',
  isFiltered: false,
}

// --- İade Talepleri (Claims) ---------------------------------------------------------

export function buildClaim(overrides: Record<string, any> = {}) {
  return {
    _id: 'claim-e2e-0001',
    externalClaimId: 'CLM-E2E-0001',
    externalOrderId: 'E2E-100001',
    integrationCode: 'trendyol',
    internalStatus: 'WAITING',
    type: 'RETURN',
    items: [{ productName: 'E2E Test Ürünü' }],
    totalRefundAmount: 149.9,
    currencyCode: 'TRY',
    claimedAt: '2026-09-22T09:00:00.000Z',
    ...overrides,
  }
}

export const claimsDoluFixture = {
  claims: [
    buildClaim(),
    buildClaim({ _id: 'claim-e2e-0002', externalClaimId: 'CLM-E2E-0002', externalOrderId: 'E2E-100002', integrationCode: 'hepsiburada', internalStatus: 'UNDER_REVIEW', totalRefundAmount: 89.5 }),
  ],
  totalNumberOfRecords: 2,
}

export const claimsBosFixture = {
  claims: [],
  totalNumberOfRecords: 0,
}

// --- Müşteriler (Customers) ---------------------------------------------------------

export function buildCustomer(overrides: Record<string, any> = {}) {
  return {
    _id: 'customer-e2e-0001',
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    isCorporate: false,
    externalIdentities: [{ integrationCode: 'trendyol' }],
    phone: '5551112233',
    email: 'ayse.yilmaz@e2e.invalid',
    addresses: [{ city: 'İstanbul', state: 'Kadıköy' }],
    metrics: { totalSpent: 1200.5, totalOrderCount: 8 },
    netRevenue: 999.9,
    returnRate: 12.5,
    ...overrides,
  }
}

export const customersDoluFixture = {
  customers: [
    buildCustomer(),
    buildCustomer({ _id: 'customer-e2e-0002', firstName: 'Mehmet', lastName: 'Demir', returnRate: 32, metrics: { totalSpent: 400, totalOrderCount: 2 }, netRevenue: 350 }),
  ],
  totalNumberOfRecords: 2,
  totalNumberOfPages: 1,
}

export const customersBosFixture = {
  customers: [],
  totalNumberOfRecords: 0,
  totalNumberOfPages: 1,
}

export function buildCustomerDetail(overrides: Record<string, any> = {}) {
  return {
    _id: 'customer-e2e-0001',
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    isCorporate: false,
    createdAt: '2026-01-15T00:00:00.000Z',
    status: 'ACTIVE',
    insights: { isVip: false, customerScore: 72 },
    ...overrides,
  }
}

// --- Faturalar (Invoices) ---------------------------------------------------------

export function buildInvoice(overrides: Record<string, any> = {}) {
  return {
    _id: 'invoice-e2e-0001',
    invoiceNumber: 'INV-E2E-0001',
    integrationCode: 'trendyol',
    externalOrderId: 'E2E-100001',
    documentType: 'E_FATURA',
    customer: { firstName: 'Ayşe', lastName: 'Yılmaz', identities: [{ tcknOrVkn: '11111111110' }] },
    issueDate: '2026-09-21T10:00:00.000Z',
    type: 'SALES',
    totalAmount: 349.9,
    currency: '₺',
    status: 'APPROVED',
    invoiceMethod: 'MARKETPLACE',
    pdfUrl: null,
    ...overrides,
  }
}

export const invoicesDoluFixture = {
  invoices: [
    buildInvoice(),
    buildInvoice({ _id: 'invoice-e2e-0002', invoiceNumber: 'INV-E2E-0002', integrationCode: 'hepsiburada', status: 'PROCESSING', documentType: 'E_ARSIV', totalAmount: 129.5 }),
  ],
  totalNumberOfRecords: 2,
}

export const invoicesBosFixture = {
  invoices: [],
  totalNumberOfRecords: 0,
}

// --- Mesajlar (Messages) ---------------------------------------------------------

export function buildMessage(overrides: Record<string, any> = {}) {
  return {
    _id: 'message-e2e-0001',
    type: 'PRODUCT_QUESTION',
    integrationCode: 'trendyol',
    text: 'E2E test mesajı: bu üründe hangi renkler mevcut?',
    context: { productName: 'E2E Test Ürünü' },
    customer: { firstName: 'Ayşe', lastName: 'Yılmaz' },
    status: 'WAITING_SELLER',
    isRejected: false,
    date: '2026-09-23T11:30:00.000Z',
    ...overrides,
  }
}

export const messagesDoluFixture = {
  messages: [
    buildMessage(),
    buildMessage({ _id: 'message-e2e-0002', type: 'ORDER_QUESTION', status: 'READ', context: { orderNumber: 'E2E-100002' }, customer: { firstName: 'Mehmet', lastName: 'Demir' } }),
  ],
  totalNumberOfRecords: 2,
  totalNumberOfPages: 1,
}

export const messagesBosFixture = {
  messages: [],
  totalNumberOfRecords: 0,
  totalNumberOfPages: 1,
}

export const orderDashboardInsightsFixture = {
  totals: { orderCount: 12, revenue: 4590.25, returnCount: 1, returnAmount: 129.5 },
  today: { count: 2, revenue: 349.9 },
  trend: { countChange: 5, revenueChange: 3 },
  statusDistribution: { UNAPPROVED: 1, AWAITING_APPROVAL: 2, APPROVED: 3, SHIPPED: 2, DELIVERED: 3, CANCELLED: 1, RETURNED: 0, total: 12 },
  pending: { invoiceCount: 1, shippingCount: 2, claimCount: 0, messageCount: 0 },
  last7Days: Array.from({ length: 7 }, (_, i) => {
    const dt = new Date('2026-09-27T00:00:00.000Z')
    dt.setDate(dt.getDate() - (6 - i))
    return { date: dt.toISOString().slice(0, 10), count: i, revenue: i * 50 }
  }),
}

// --- Günlükler (Export/Import Job Logs — LogListView) -------------------------------

export function buildExportJob(overrides: Record<string, any> = {}) {
  return {
    _id: 'export-job-e2e-0001',
    title: 'E2E Test Ürünü - Gönderim',
    barcode: '8690000000011',
    stockcode: 'SKU-E2E-0001',
    image: null,
    price: 199.9,
    stock: 25,
    choices: [],
    integrationCode: 'trendyol',
    mode: 'TRANSFER',
    status: 'COMPLETED',
    createdAt: '2026-09-22T09:00:00.000Z',
    completedAt: '2026-09-22T09:02:30.000Z',
    ...overrides,
  }
}

export const exportJobsDoluFixture = {
  success: true,
  data: [
    buildExportJob(),
    buildExportJob({ _id: 'export-job-e2e-0002', title: 'E2E Test Ürünü 2 - Fiyat Güncelleme', mode: 'UPDATE_PRICE', status: 'FAILED', integrationCode: 'hepsiburada', completedAt: undefined }),
  ],
  pagination: { totalNumberOfPages: 1, totalNumberOfRecords: 2 },
}

export const exportJobsBosFixture = {
  success: true,
  data: [],
  pagination: { totalNumberOfPages: 0, totalNumberOfRecords: 0 },
}

export function buildExportJobDetail(overrides: Record<string, any> = {}) {
  return {
    ...buildExportJob(),
    category: 'cat-e2e-1',
    brand: 'brand-e2e-1',
    logs: [
      { worker: 'BATCHCREATOR', status: 'COMPLETED', message: 'Kuyruğa alındı', timestamp: '2026-09-22T09:00:05.000Z' },
      { worker: 'CATALOG VALIDATOR', status: 'COMPLETED', message: 'Doğrulandı', timestamp: '2026-09-22T09:00:45.000Z' },
      { worker: 'CATALOG PUBLISHER', status: 'COMPLETED', message: 'Gönderildi', timestamp: '2026-09-22T09:02:30.000Z' },
    ],
    ...overrides,
  }
}

export const exportJobDetailFixture = { success: true, data: buildExportJobDetail() }

export function buildImportJob(overrides: Record<string, any> = {}) {
  return {
    _id: 'import-job-e2e-0001',
    jobId: 'IMP-E2E-0001',
    integrationCode: 'trendyol',
    status: 'COMPLETED',
    startedAt: '2026-09-22T08:00:00.000Z',
    completedAt: '2026-09-22T08:05:00.000Z',
    totalCount: 120,
    processedCount: 110,
    validCount: 115,
    invalidCount: 3,
    duplicateCount: 2,
    failedCount: 5,
    ...overrides,
  }
}

export const importJobsDoluFixture = {
  success: true,
  data: [
    buildImportJob(),
    buildImportJob({ _id: 'import-job-e2e-0002', jobId: 'IMP-E2E-0002', integrationCode: 'hepsiburada', status: 'FETCHING', completedAt: undefined, processedCount: 40 }),
  ],
  pagination: { totalNumberOfPages: 1, totalNumberOfRecords: 2 },
}

export const importJobsBosFixture = {
  success: true,
  data: [],
  pagination: { totalNumberOfPages: 0, totalNumberOfRecords: 0 },
}

export const importJobByJobIdFixture = { data: buildImportJob() }

export const importJobReportFixture = {
  data: {
    missingCategories: [],
    missingAttributes: [],
    missingCategoryProductCounts: [],
  },
}

// --- Abonelik/Plan (SubscriptionView, ADR-0008 §2 tablosundaki ÖNERİLEN fiyat/limit değerleri;
// sentetik/uydurma, gerçek Plans koleksiyonu değil — Protokol 7) ------------------------------

export const plansDoluFixture = {
  result: true,
  plans: [
    {
      code: 'starter', name: 'Başlangıç', version: 1, interval: 'month', priceMinor: 249000, currency: 'TRY',
      vatIncluded: false, limits: { channels: 2, skus: 5000, users: 3, mcpCallsPerDay: 500 }, features: ['einvoice'],
    },
    {
      code: 'growth', name: 'Büyüme', version: 1, interval: 'month', priceMinor: 599000, currency: 'TRY',
      vatIncluded: false, limits: { channels: 5, skus: 25000, users: 10, mcpCallsPerDay: 2000 }, features: ['einvoice', 'erp', 'shipping'],
    },
    {
      code: 'enterprise', name: 'Kurumsal', version: 1, interval: 'month', priceMinor: 0, currency: 'TRY',
      vatIncluded: false, limits: { channels: 999, skus: 999999, users: 999, mcpCallsPerDay: 999999 }, features: ['einvoice', 'erp', 'shipping', 'mcp', 'desktopApp'],
    },
  ],
}

export const plansBosFixture = { result: true, plans: [] }

export function buildSubscription(overrides: Record<string, any> = {}) {
  return {
    result: true,
    subscription: {
      planCode: 'growth', planVersion: 1, status: 'active', trialEndsAt: undefined,
      currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      cancelAtPeriodEnd: false, graceUntil: undefined, billingExempt: false,
    },
    plan: { code: 'growth', name: 'Büyüme', priceMinor: 599000, currency: 'TRY', interval: 'month', vatIncluded: false, limits: { channels: 5, skus: 25000, users: 10, mcpCallsPerDay: 2000 }, features: ['einvoice', 'erp', 'shipping'] },
    status: 'active',
    access: { read: true, write: true, engine: true },
    ...overrides,
  }
}

export const subscriptionNoneFixture = {
  result: true, subscription: null, plan: null, status: 'no_subscription',
  access: { read: true, write: false, engine: false },
}

export const subscriptionPastDueFixture = buildSubscription({
  subscription: { planCode: 'growth', planVersion: 1, status: 'past_due', currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: '2026-10-01T00:00:00.000Z', cancelAtPeriodEnd: false, graceUntil: '2026-10-08T00:00:00.000Z', billingExempt: false },
  status: 'past_due',
  access: { read: true, write: true, engine: true },
  reason: undefined,
})

export const startCheckoutSuccessFixture = {
  result: true,
  checkoutUrl: 'https://mock-payments.entegrasyonik.local/checkout/mock_sub_e2e_abc123',
  formToken: 'mock_form_e2e_abc123',
  providerRef: 'mock_sub_e2e_abc123',
}

// --- Admin paneli (platformAdmin-only; ADR-0001 OPERATION_POLICY platformAdmin katmanı) ---------
// Şekiller `backend/src/api/services/admin-service.ts` + `clientDto.ts` (toClientDto beyaz
// listesi: dbConfig/depolama ANAHTARLARI dönmez) ile birebir; tamamı uydurma (Protokol 7).

export function buildAdminClient(overrides: Record<string, any> = {}) {
  return {
    _id: 'client-e2e-0001',
    name: 'E2E Örnek Mağaza',
    title: 'E2E Örnek Ticaret A.Ş.',
    status: 'ACTIVE',
    order: 1001,
    clientId: 1001,
    lastSuccessfulOrderSync: '2026-09-22T09:00:00.000Z',
    integrations: [
      { integrationCode: 'trendyol', type: 'marketplace', status: true },
      { integrationCode: 'bizimhesap', type: 'erp', status: false },
    ],
    archive: { code: 'R2_ARCHIVE_STORAGE', bucketName: 'e2e-archive', endpoint: 'https://r2.e2e.invalid', publicUrl: 'https://cdn.e2e.invalid/a', region: 'auto', isActive: true },
    image: { code: 'R2_IMAGE_STORAGE', bucketName: 'e2e-image', endpoint: 'https://r2.e2e.invalid', publicUrl: 'https://cdn.e2e.invalid/i', region: 'auto', isActive: true },
    ...overrides,
  }
}

export const adminClientsDoluFixture = {
  success: true,
  clients: [
    buildAdminClient(),
    buildAdminClient({ _id: 'client-e2e-0002', name: 'E2E Pasif Mağaza', title: 'E2E Pasif Ticaret Ltd.', status: 'PASSIVE', order: 1002, clientId: 1002, integrations: [] }),
  ],
  total: 2,
  page: 1,
  limit: 50,
}

export const adminClientsBosFixture = { success: true, clients: [], total: 0, page: 1, limit: 50 }

export const adminClientStatsFixture = {
  success: true,
  metrics: {
    productCount: 1250, variantCount: 3400, orderCount: 820, claimCount: 41, userCount: 6,
    totalRevenue: 154321.5, totalReturnAmount: 4210.75,
  },
}

export const adminClientIntegrationsFixture = {
  success: true,
  integrations: [
    { _id: 'cint-e2e-1', integrationCode: 'trendyol', title: 'Trendyol Mağazası', isActive: true },
    { _id: 'cint-e2e-2', integrationCode: 'hepsiburada', title: '', isActive: true },
  ],
}

export const adminGlobalMetricsFixture = {
  success: true,
  exports: [{ _id: 'COMPLETED', count: 128 }, { _id: 'FAILED', count: 3 }, { _id: 'PENDING', count: 7 }],
  imports: [{ _id: 'COMPLETED', count: 14 }, { _id: 'FAILED', count: 1 }],
}

export function buildAdminTicket(overrides: Record<string, any> = {}) {
  return {
    _id: 'ticket-e2e-0001',
    ticketNumber: '100001',
    subject: 'E2E Sipariş senkronizasyonu gecikiyor',
    type: 'TECHNICAL',
    clientId: 1001,
    priority: 'HIGH',
    status: 'OPEN',
    lastMessageSnippet: 'Siparişler pazaryerinden gelmiyor.',
    lastMessageAt: '2026-09-22T09:30:00.000Z',
    createdDate: '2026-09-22T09:00:00.000Z',
    messages: [
      { senderType: 'CLIENT', senderName: 'E2E Müşteri', content: 'Siparişler pazaryerinden gelmiyor.', date: '2026-09-22T09:00:00.000Z' },
      { senderType: 'SUPPORT', senderName: 'Sistem Yöneticisi', content: 'İnceliyoruz, kısa süre içinde dönüş yapacağız.', date: '2026-09-22T09:30:00.000Z' },
    ],
    ...overrides,
  }
}

export const adminTicketsDoluFixture = {
  success: true,
  tickets: [
    buildAdminTicket(),
    buildAdminTicket({ _id: 'ticket-e2e-0002', ticketNumber: '100002', subject: 'E2E Fatura ayarı sorusu', type: 'GENERAL', clientId: 1002, priority: 'LOW', status: 'RESOLVED', lastMessageSnippet: undefined }),
  ],
  total: 2,
  page: 1,
  limit: 50,
}

export const adminTicketsBosFixture = { success: true, tickets: [], total: 0, page: 1, limit: 50 }

export const adminSystemHealthDoluFixture = {
  success: true,
  clients: [{ clientId: 1001, title: 'E2E Örnek Ticaret A.Ş.' }, { clientId: 1002, title: 'E2E Pasif Ticaret Ltd.' }],
  traffic: {
    exports: [{ _id: 'COMPLETED', count: 128 }, { _id: 'FAILED', count: 3 }, { _id: 'QUEUED', count: 7 }],
    imports: [{ _id: 'COMPLETED', count: 14 }, { _id: 'FAILED', count: 1 }],
  },
  infrastructure: {
    activePods: ['e2e-pod-a1', 'e2e-pod-b2'],
    redis: { usedMemory: '12.50M', connectedClients: '4', uptime: '93784', version: '7.2.4' },
    queues: {
      orderSync: { wait: 2, active: 1 },
      export: { wait: 5, active: 2 },
      import: { wait: 0, active: 1 },
    },
    memoryCache: { hits: 4210, misses: 318, keys: 96, breakdown: [{ name: 'menu', count: 40 }, { name: 'client', count: 56 }] },
    topExports: [
      { name: 'E2E Örnek Ticaret A.Ş.', data: { completed: 90, failed: 2, pending: 5, total: 97 } },
      { name: 'E2E Pasif Ticaret Ltd.', data: { completed: 38, failed: 1, pending: 2, total: 41 } },
    ],
    topImports: [
      { name: 'E2E Örnek Ticaret A.Ş.', data: { completed: 10, failed: 1, pending: 0, total: 11 } },
    ],
  },
  operationInsights: {
    types: [{ _id: 'ORDER_SYNC', count: 60, avgDuration: 820.4 }, { _id: 'EXPORT', count: 35, avgDuration: 2410.9 }],
    statuses: [{ _id: 'SUCCESS', count: 90 }, { _id: 'FAILED', count: 5 }],
    timeline: [
      { _id: '2026-09-20', success: 30, failed: 1, partial: 0 },
      { _id: '2026-09-21', success: 40, failed: 2, partial: 1 },
      { _id: '2026-09-22', success: 20, failed: 2, partial: 0 },
    ],
    metrics: { totalFetched: 5400, totalInserted: 320, totalUpdated: 4100, totalFailed: 27, totalSkipped: 953, avgDuration: 1300 },
  },
}

export const adminSystemHealthBosFixture = {
  success: true,
  clients: [],
  traffic: { exports: [], imports: [] },
  infrastructure: {
    activePods: [],
    redis: { usedMemory: '0', connectedClients: '0', uptime: '0', version: '0' },
    queues: { orderSync: { wait: 0, active: 0 }, export: { wait: 0, active: 0 }, import: { wait: 0, active: 0 } },
    memoryCache: { hits: 0, misses: 0, keys: 0, breakdown: [] },
    topExports: [],
    topImports: [],
  },
  operationInsights: {
    types: [], statuses: [], timeline: [],
    metrics: { totalFetched: 0, totalInserted: 0, totalUpdated: 0, totalFailed: 0, totalSkipped: 0, avgDuration: 0 },
  },
}

export const adminExportDetailsFixture = {
  success: true,
  data: [
    { _id: 'exp-e2e-1', clientId: 1001, clientName: 'E2E Örnek Ticaret A.Ş.', createdAt: '2026-09-22T08:00:00.000Z', updatedAt: '2026-09-22T08:10:00.000Z', itemCount: 42, status: 'COMPLETED', integrationCode: 'trendyol', mode: 'TRANSFER' },
    { _id: 'exp-e2e-2', clientId: 1002, clientName: 'E2E Pasif Ticaret Ltd.', createdAt: '2026-09-22T08:20:00.000Z', updatedAt: '2026-09-22T08:25:00.000Z', itemCount: 7, status: 'WAITING', integrationCode: 'hepsiburada', mode: 'UPDATE_PRICE', nextRunAt: '2026-09-22T10:15:00.000Z' },
  ],
  total: 2,
  page: 1,
  limit: 25,
  analytics: {
    timeline: [{ date: '2026-09-21', value: 30 }, { date: '2026-09-22', value: 49 }],
    modes: [{ name: 'TRANSFER', value: 42 }, { name: 'UPDATE_PRICE', value: 7 }],
    statuses: [{ name: 'COMPLETED', value: 42 }, { name: 'WAITING', value: 7 }],
  },
}

// ADR-0015 B5-2 (productDefinitions — Brand/Category/Choice/Hashtag) — sentetik veri (Protokol 7).
// `BrandService`/`CategoryService` GET yanıt biçimi `stores/brandsStore.ts` / `categoriesStore.ts`
// tüketimiyle (düz dizi, `title`/`_id`/`parentId`) uyumlu; ağaç derinliği gerçek `CategoryListComponent`
// (kapsam dışı) sürükle-bırak ağacını beslemek için yeterli (kök + 1 alt kategori).
export const brandsDoluFixture = [
  { _id: 'brand-e2e-1', title: 'E2E Marka Bir', parentId: null },
  { _id: 'brand-e2e-2', title: 'E2E Marka İki', parentId: null },
]

// `stores/categoriesStore.ts` `retrieve()` düz bir dizi DEĞİL, backend'den GELEN bir AĞAÇ
// bekliyor (`children` alanı iç içe) — kök (`isMain: true`) düğüm `addCategory`'nin varsayılan
// üst kategori araması için GEREKLİ (karakterizasyon bulgusu).
export const categoriesDoluFixture = [
  {
    _id: 'cat-e2e-root',
    title: 'Kategoriler',
    isMain: true,
    children: [
      { _id: 'cat-e2e-1', title: 'E2E Kategori Bir', children: [{ _id: 'cat-e2e-2', title: 'E2E Alt Kategori', children: [] }] },
    ],
  },
]

export function buildChoice(overrides: Record<string, any> = {}) {
  return {
    _id: 'choice-e2e-1',
    title: 'E2E Renk Grubu',
    isSlicer: true,
    isVarianter: false,
    values: [
      { _id: 'choiceval-e2e-1', title: 'Siyah' },
      { _id: 'choiceval-e2e-2', title: 'Beyaz' },
    ],
    ...overrides,
  }
}

export const choicesDoluFixture = [buildChoice(), buildChoice({ _id: 'choice-e2e-2', title: 'E2E Beden Grubu', isSlicer: false, isVarianter: true, values: [{ _id: 'choiceval-e2e-3', title: 'Small' }] })]

export const choicesBosFixture: any[] = []

export function buildHashtag(overrides: Record<string, any> = {}) {
  return {
    _id: 'hashtag-e2e-1',
    title: 'E2E Kampanya Etiketi',
    color: '#4CAF50',
    values: [
      { _id: 'hashtagval-e2e-1', title: 'yaz-indirimi', color: '#FF5722' },
      { _id: 'hashtagval-e2e-2', title: 'yeni-sezon', color: '#2196F3' },
    ],
    ...overrides,
  }
}

export const hashtagsDoluFixture = [buildHashtag()]

export const hashtagsBosFixture: any[] = []

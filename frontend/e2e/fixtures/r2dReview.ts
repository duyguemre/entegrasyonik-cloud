// FR2-ORDERS / FR2-SCREENS / FR2-FIN (fe-r2d) — inceleme görüntüleri için zengin sentetik veri.
// Protokol 7: gerçek kişi/iletişim YOK (`.invalid` alan adı, 555 test numaraları). Alan adları yalnız
// backend arayüzlerinden (backend/src/interfaces/{order,claim}) — uydurma alan yok.
import { buildClaim, buildCustomer, buildCustomerDetail, buildInvoice, buildMessage, buildOrder } from './apiData'
import { MENU_SCREENS, menuFixtureWithAccountSupport } from './nav'

export const r2dMenu = menuFixtureWithAccountSupport.map((group: any) =>
  group.group === 'sale'
    ? { ...group, links: [...group.links, { code: 'LogListView', parent: '', title: 'logList', icon: MENU_SCREENS.LogListView.icon, singleton: true }] }
    : group,
)

const address = (over: Record<string, any> = {}) => ({
  firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5550001122', email: 'ayse.yilmaz@e2e.invalid',
  addressLine1: 'Örnek Mah. Test Sok. No: 4 D: 2', city: 'İstanbul', state: 'Kadıköy', postalCode: '34710', countryCode: 'TR',
  ...over,
})

export const richOrder = buildOrder({
  _id: 'order-e2e-0001',
  orderNumber: 'E2E-100001',
  externalOrderId: '10987654321',
  integrationCode: 'trendyol',
  internalStatus: 'APPROVED',
  externalStatus: 'Picking',
  billingAddress: address(),
  shippingAddress: address({ addressLine1: 'Deneme Cad. No: 12 Kat: 3', state: 'Üsküdar', postalCode: '34662' }),
  items: [
    { externalLineItemId: 'L1', externalItemId: 'I1', productName: 'Pamuklu Basic Tişört — Siyah / M', sku: 'TSH-BLK-M', barcode: '8690000000011', quantity: 2, unitPrice: 249.9, taxRate: 20, totalPrice: 499.8, itemStatus: 'ACTIVE', allocationState: 'COMMITTED' },
    { externalLineItemId: 'L2', externalItemId: 'I2', productName: 'Keten Gömlek — Bej / L', sku: 'GML-BEJ-L', barcode: '8690000000028', quantity: 1, unitPrice: 599.0, taxRate: 20, totalPrice: 599.0, itemStatus: 'ACTIVE', allocationState: 'RESERVED' },
    { externalLineItemId: 'L3', externalItemId: 'I3', productName: 'Spor Çorap 3\'lü Paket', sku: 'CRP-3P', barcode: '8690000000035', quantity: 1, unitPrice: 89.9, taxRate: 20, totalPrice: 89.9, itemStatus: 'CANCELLED' },
  ],
  financials: { currencyCode: 'TRY', subTotal: 1098.8, totalDiscount: 50, totalTax: 183.1, shippingFee: 0, grandTotal: 1048.8 },
  flags: { isInvoiceGenerated: true },
  invoice: { invoiceMethod: 'INTEGRATOR', status: 'SUCCESS', invoiceNumber: 'EKF2026000000123', invoicedAt: '2026-09-20T12:40:00.000Z', invoiceLink: 'https://cdn.e2e.invalid/f.pdf' },
  fulfillment: [{ shipmentMethod: 'API', status: 'PENDING', carrierCode: 'yurtici', carrierName: 'Yurtiçi Kargo', trackingCode: '7300012345678', trackingUrl: 'https://kargo.e2e.invalid/t', desi: 2 }],
  dates: { orderDate: '2026-09-20T10:15:00.000Z', approvedDate: '2026-09-20T10:32:00.000Z', invoiceDate: '2026-09-20T12:40:00.000Z', estimatedDeliveryDate: '2026-09-23T18:00:00.000Z' },
})

export const r2dOrders = {
  orders: [
    richOrder,
    buildOrder({ _id: 'order-e2e-0002', orderNumber: 'E2E-100002', integrationCode: 'hepsiburada', internalStatus: 'AWAITING_APPROVAL', billingAddress: { firstName: 'Mehmet', lastName: 'Demir' }, financials: { grandTotal: 129.5 }, dates: { orderDate: '2026-09-21T08:05:00.000Z' } }),
    buildOrder({ _id: 'order-e2e-0003', orderNumber: 'E2E-100003', integrationCode: 'n11', internalStatus: 'SHIPPED', billingAddress: { firstName: 'Zeynep', lastName: 'Kara' }, financials: { grandTotal: 2349 }, dates: { orderDate: '2026-09-19T16:40:00.000Z' } }),
    buildOrder({ _id: 'order-e2e-0004', orderNumber: 'E2E-100004', integrationCode: 'pazarama', internalStatus: 'DELIVERED', billingAddress: { firstName: 'Can', lastName: 'Aydın' }, financials: { grandTotal: 459.9 }, dates: { orderDate: '2026-09-15T12:00:00.000Z' } }),
    buildOrder({ _id: 'order-e2e-0005', orderNumber: 'E2E-100005', integrationCode: 'trendyol', internalStatus: 'CANCELLED', cancelSource: 'CUSTOMER', billingAddress: { firstName: 'Elif', lastName: 'Şahin' }, financials: { grandTotal: 89.9 }, dates: { orderDate: '2026-09-14T09:20:00.000Z' } }),
    buildOrder({ _id: 'order-e2e-0006', orderNumber: 'E2E-100006', integrationCode: 'hepsiburada', internalStatus: 'UNAPPROVED', billingAddress: { firstName: 'Burak', lastName: 'Öz' }, financials: { grandTotal: 719 }, dates: { orderDate: '2026-09-21T11:48:00.000Z' } }),
  ],
  totalNumberOfRecords: 6,
}

export const richClaim = buildClaim({
  _id: 'claim-e2e-0001',
  externalClaimId: 'CLM-E2E-0001',
  externalOrderId: 'E2E-100001',
  integrationCode: 'trendyol',
  type: 'REFUND',
  externalStatus: 'InAnalysis',
  internalStatus: 'UNDER_REVIEW',
  totalRefundAmount: 499.8,
  currencyCode: 'TRY',
  items: [
    { externalLineItemId: 'L1', externalItemId: 'I1', productName: 'Pamuklu Basic Tişört — Siyah / M', sku: 'TSH-BLK-M', barcode: '8690000000011', quantity: 2, unitPrice: 249.9, reason: 'Beden uymadı', description: 'Bir beden büyük geldi, değişim yerine iade istiyorum.' },
  ],
  fulfillment: { carrierCode: 'yurtici', carrierName: 'Yurtiçi Kargo', trackingCode: '7300098765432', trackingUrl: 'https://kargo.e2e.invalid/t' },
  history: [
    { status: 'WAITING', changedAt: '2026-09-22T09:00:00.000Z', description: 'Müşteri iade talebi oluşturdu' },
    { status: 'UNDER_REVIEW', changedAt: '2026-09-24T14:10:00.000Z', description: 'Ürün depoya ulaştı, inceleniyor' },
  ],
  claimedAt: '2026-09-22T09:00:00.000Z',
  customer: { _id: 'customer-e2e-0001', firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5551112233', email: 'ayse.yilmaz@e2e.invalid', isPhoneMasked: false, isEmailMasked: false, createdAt: '2026-01-15T00:00:00.000Z',
    addresses: [{ title: 'Ev', firstName: 'Ayşe', lastName: 'Yılmaz', addressLine1: 'Örnek Mah. Test Sok. No: 4', city: 'İstanbul', state: 'Kadıköy' }],
    metrics: { totalSpent: 1200.5, totalOrderCount: 8, totalClaimCount: 1, totalReturnAmount: 149.9 } },
})

export const r2dClaims = {
  claims: [
    richClaim,
    buildClaim({ _id: 'claim-e2e-0002', externalClaimId: 'CLM-E2E-0002', externalOrderId: 'E2E-100002', integrationCode: 'hepsiburada', internalStatus: 'WAITING', type: 'REPLACEMENT', totalRefundAmount: 89.5 }),
    buildClaim({ _id: 'claim-e2e-0003', externalClaimId: 'CLM-E2E-0003', externalOrderId: 'E2E-100003', integrationCode: 'n11', internalStatus: 'APPROVED', type: 'REFUND', totalRefundAmount: 349 }),
    buildClaim({ _id: 'claim-e2e-0004', externalClaimId: 'CLM-E2E-0004', externalOrderId: 'E2E-100004', integrationCode: 'pazarama', internalStatus: 'REJECTED', type: 'REFUND', totalRefundAmount: 129.9 }),
    buildClaim({ _id: 'claim-e2e-0005', externalClaimId: 'CLM-E2E-0005', externalOrderId: 'E2E-100005', integrationCode: 'trendyol', internalStatus: 'COMPLETED', type: 'CANCEL', totalRefundAmount: 59.9 }),
  ],
  totalNumberOfRecords: 5,
}

export const r2dCustomers = {
  customers: [
    buildCustomer(),
    buildCustomer({ _id: 'customer-e2e-0002', firstName: 'Mehmet', lastName: 'Demir', externalIdentities: [{ integrationCode: 'hepsiburada' }, { integrationCode: 'n11' }], returnRate: 32, metrics: { totalSpent: 400, totalOrderCount: 2 }, netRevenue: 350 }),
    buildCustomer({ _id: 'customer-e2e-0003', firstName: '', lastName: '', isCorporate: true, companyName: 'Örnek Tekstil Ltd. Şti.', externalIdentities: [{ integrationCode: 'trendyol' }], returnRate: 0, metrics: { totalSpent: 18450, totalOrderCount: 21 }, netRevenue: 17900, addresses: [{ city: 'Bursa', state: 'Osmangazi' }] }),
  ],
  totalNumberOfRecords: 3,
  totalNumberOfPages: 1,
}

export const r2dCustomerDetail = buildCustomerDetail({
  phone: '5551112233', email: 'ayse.yilmaz@e2e.invalid',
  externalIdentities: [{ integrationCode: 'trendyol' }, { integrationCode: 'hepsiburada' }],
  addresses: [{ title: 'Ev', firstName: 'Ayşe', lastName: 'Yılmaz', addressLine1: 'Örnek Mah. Test Sok. No: 4', city: 'İstanbul', state: 'Kadıköy', postalCode: '34710' }],
  metrics: { totalSpent: 1200.5, totalOrderCount: 8, totalClaimCount: 1, totalReturnAmount: 149.9, lastOrderDate: '2026-09-20T10:15:00.000Z', firstOrderDate: '2026-02-03T10:00:00.000Z' },
})

export const r2dInvoices = {
  invoices: [
    buildInvoice(),
    buildInvoice({ _id: 'invoice-e2e-0002', invoiceNumber: 'INV-E2E-0002', integrationCode: 'hepsiburada', status: 'PROCESSING', documentType: 'E_ARSIV', totalAmount: 129.5 }),
    buildInvoice({ _id: 'invoice-e2e-0003', invoiceNumber: 'INV-E2E-0003', integrationCode: 'n11', status: 'FAILED', documentType: 'E_ARSIV', totalAmount: 2349, type: 'RETURN', statusMessage: 'Alıcı VKN doğrulanamadı — fatura bilgilerini kontrol edin.' }),
  ],
  totalNumberOfRecords: 3,
}

export const r2dMessages = {
  messages: [
    buildMessage(),
    buildMessage({ _id: 'message-e2e-0002', type: 'ORDER_QUESTION', status: 'READ', context: { orderNumber: 'E2E-100002' }, customer: { firstName: 'Mehmet', lastName: 'Demir' } }),
    buildMessage({ _id: 'message-e2e-0003', integrationCode: 'hepsiburada', status: 'ANSWERED', text: 'Kargo ne zaman çıkar?', customer: { firstName: 'Zeynep', lastName: 'Kara' }, date: '2026-09-22T08:00:00.000Z' }),
  ],
  totalNumberOfRecords: 3,
  totalNumberOfPages: 1,
}

export const r2dTickets = {
  tickets: [
    { _id: 'ticket-e2e-0001', ticketNumber: 'DSK-100001', subject: 'Fatura kesim sorunu', type: 'BILLING', priority: 'HIGH', status: 'OPEN', lastMessageSnippet: 'Fatura oluşturulamıyor', lastMessageAt: '2026-09-29T09:00:00.000Z', createdDate: '2026-09-28T10:00:00.000Z',
      messages: [
        { senderType: 'CLIENT', senderName: 'Deniz Örnek', content: 'E-arşiv faturası oluşturamıyorum, hata alıyorum.', date: '2026-09-28T10:05:00.000Z' },
        { senderType: 'SUPPORT', senderName: 'Destek ekibi', content: 'Merhaba, entegratör ayarlarınızı kontrol ediyoruz.', date: '2026-09-28T11:20:00.000Z' },
      ] },
    { _id: 'ticket-e2e-0002', ticketNumber: 'DSK-100002', subject: 'Entegrasyon sorusu', type: 'TECHNICAL', priority: 'LOW', status: 'CLOSED', lastMessageAt: '2026-09-20T09:00:00.000Z', createdDate: '2026-09-19T10:00:00.000Z' },
  ],
  totalNumberOfRecords: 2,
}

export const r2dUsers = {
  users: [
    { _id: 'user-e2e-0001', name: 'Elif', surname: 'Yıldız', email: 'elif.yildiz@e2e.invalid', roleCode: 'MANAGER', owner: false, isGlobalAdmin: false, createdAt: '2026-01-15T10:00:00.000Z' },
    { _id: 'user-e2e-0002', name: 'Deniz', surname: 'Kaya', email: 'deniz.kaya@e2e.invalid', owner: true, isGlobalAdmin: false, createdAt: '2025-11-02T08:30:00.000Z' },
  ],
  totalNumberOfRecords: 2,
  fromTo: {},
}
export const r2dRoles = [
  { code: 'MANAGER', name: 'Yönetici', description: 'Katalog ve siparişleri yönetebilir.' },
  { code: 'STAFF', name: 'Personel', description: 'Sınırlı, salt-okunur erişim.' },
]

export const r2dFinance = {
  transactions: [
    { _id: 'fin-e2e-0001', externalId: 'TRX-E2E-0001', orderNumber: 'E2E-100001', integrationCode: 'TRENDYOL', platformType: 'Trendyol Sipariş', transactionType: 'SALE', credit: 1500, debt: 250, netAmount: 1250, commissionAmount: 200, commissionRate: 13, transactionDate: '2026-09-28T10:00:00.000Z', payoutDate: '2026-10-05T10:00:00.000Z', description: 'Satış hakedişi' },
    { _id: 'fin-e2e-0002', externalId: 'TRX-E2E-0002', orderNumber: null, integrationCode: 'HEPSIBURADA', platformType: 'Hepsiburada Kesinti', transactionType: 'DEDUCTION', credit: 0, debt: 300, netAmount: -300, transactionDate: '2026-09-27T10:00:00.000Z' },
    { _id: 'fin-e2e-0003', externalId: 'TRX-E2E-0003', orderNumber: 'E2E-100003', integrationCode: 'N11', platformType: 'N11 Sipariş', transactionType: 'SALE', credit: 410, debt: 52, netAmount: 358, transactionDate: '2026-09-26T10:00:00.000Z' },
    { _id: 'fin-e2e-0004', externalId: 'TRX-E2E-0004', orderNumber: 'E2E-100005', integrationCode: 'TRENDYOL', platformType: 'Trendyol İade', transactionType: 'RETURN', credit: 0, debt: 89.9, netAmount: -89.9, transactionDate: '2026-09-25T10:00:00.000Z' },
  ],
  totalNumberOfRecords: 4,
  summary: { totalCredit: 98765.4, totalDebt: 12345.6, netAmount: 86419.8, totalCargo: 777.5, transactionCount: 321 },
}

export const r2dSettings = {
  settings: {
    storeName: 'Örnek Ticaret', brandColor: '#10B981', logo: '', alertEmail: 'hata@e2e.invalid', supportPhone: '02120000000',
    timezone: 'Europe/Istanbul', workingDays: [1, 2, 3, 4, 5], mersisNo: '0123456789012345', ticaretSicilNo: 'TS-4455',
    shippingDuration: 2, desi: 2, warranty: 24, maxPurchaseQuantity: 50, taxPercentage: 20,
    invoice: { type: 1, firstname: 'Deniz', lastname: 'Örnek', tckn: '10000000146', phone: '05000000000', companyName: 'Örnek Ticaret A.Ş.', taxOffice: 'Kadıköy', taxNumber: '1234567890', address: 'Örnek Mah. 1. Sok. No:1', city: 'İstanbul', district: 'Kadıköy' },
  },
}

export function r2dMocks(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    MenuService: r2dMenu,
    'OrderService/getOrders': r2dOrders,
    'ClaimService/getClaims': r2dClaims,
    'CustomerService/getCustomers': r2dCustomers,
    'CustomerService/getCustomerDetail': r2dCustomerDetail,
    'InvoiceService/getInvoices': r2dInvoices,
    'MessageService/getMessages': r2dMessages,
    'TicketService/getTickets': r2dTickets,
    'UserService/getUsers': r2dUsers,
    'UserService/getRoles': r2dRoles,
    'FinancialService/getTransactionData': r2dFinance,
    'FinancialService/getFinancialSummary': r2dFinance.summary,
    'FinancialService/getCargoInvoices': [],
    'SettingService/getSettings': r2dSettings,
    ...extra,
  }
}

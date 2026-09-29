// C1.1 (F-01) — StockService/getStockOverview + tahsis durumlu sipariş sentetik verisi.
// Şekil docs/API_TENANT_SURFACE.md §2.3 örneğiyle BİREBİR. Protokol 7: hiçbir gerçek veri yok.
import { buildOrder } from './apiData'
import { MENU_SCREENS, menuFixture } from './nav'

const item = (o: Record<string, any>) => ({
  externalLineItemId: null,
  sku: null,
  barcode: null,
  productName: null,
  quantity: 1,
  allocationState: 'OVERSOLD',
  lastAllocationAppliedAt: null,
  oversoldEscalatedAt: null,
  ...o,
})

export const stockOverviewDoluFixture = {
  generatedAt: '2026-09-28T12:00:00.000Z',
  attention: { oversold: { lines: 2, units: 5 }, unmapped: { lines: 2, units: 6 } },
  recentOrders: [
    {
      orderId: 'order-e2e-3001', orderNumber: 'E2E-300001', externalOrderId: 'TY-E2E-3001', integrationCode: 'trendyol',
      orderDate: '2026-09-28T09:40:00.000Z',
      items: [
        item({ externalLineItemId: 'L1', sku: 'SK-E2E-101', barcode: '8690000000101', productName: 'Örnek pamuklu tişört — M', quantity: 3,
          lastAllocationAppliedAt: '2026-09-28T09:41:00.000Z', oversoldEscalatedAt: '2026-09-28T10:15:00.000Z' }),
      ],
    },
    {
      orderId: 'order-e2e-3002', orderNumber: 'E2E-300002', externalOrderId: 'HB-E2E-3002', integrationCode: 'hepsiburada',
      orderDate: '2026-09-28T08:05:00.000Z',
      items: [
        item({ externalLineItemId: 'L1', sku: 'SK-E2E-102', productName: 'Örnek seramik kupa', quantity: 2, lastAllocationAppliedAt: '2026-09-28T08:06:00.000Z' }),
        item({ externalLineItemId: 'L2', productName: 'Eşleşmeyen örnek ürün', quantity: 4, allocationState: 'UNMAPPED' }),
      ],
    },
    {
      orderId: 'order-e2e-3003', orderNumber: 'E2E-300003', externalOrderId: 'N11-E2E-3003', integrationCode: 'n11',
      orderDate: '2026-09-27T16:30:00.000Z',
      items: [item({ externalLineItemId: 'L1', barcode: '8690000000303', productName: 'Örnek çanta', quantity: 2, allocationState: 'UNMAPPED' })],
    },
  ],
  variants: { total: 4, totalStock: 17, reservedUnits: 7, availableUnits: 10, withReservations: 2, overReserved: 1, publishPending: 1 },
  reconciliation: { tracked: false, lastRunAt: null },
}

export const stockOverviewBosFixture = {
  generatedAt: '2026-09-28T12:00:00.000Z',
  attention: { oversold: { lines: 0, units: 0 }, unmapped: { lines: 0, units: 0 } },
  recentOrders: [],
  variants: { total: 4, totalStock: 17, reservedUnits: 0, availableUnits: 17, withReservations: 0, overReserved: 0, publishPending: 0 },
  reconciliation: { tracked: false, lastRunAt: null },
}

/** Sipariş listesi: kalemlerinde tahsis durumu olan siparişler (rozet + filtre). */
export const ordersWithAllocationFixture = {
  orders: [
    buildOrder({
      items: [
        { productName: 'Örnek pamuklu tişört — M', quantity: 3, allocationState: 'OVERSOLD' },
        { productName: 'Örnek seramik kupa', quantity: 1, allocationState: 'RESERVED' },
      ],
    }),
    buildOrder({
      _id: 'order-e2e-0002', orderNumber: 'E2E-100002', integrationCode: 'hepsiburada', internalStatus: 'APPROVED',
      billingAddress: { firstName: 'Mehmet', lastName: 'Demir' }, financials: { grandTotal: 129.5, currencyCode: 'TRY' },
      items: [{ productName: 'Örnek çanta', quantity: 1, allocationState: 'RESERVED' }],
    }),
  ],
  totalNumberOfRecords: 2,
}

/** menuFixture + kök seviyede "Stok sağlığı" (gerçek menü kaydı ApplicationDB `menus`, yerel iş). */
export const menuFixtureWithStockHealth = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? { ...group, links: [...group.links, { code: 'StockHealthView', parent: '', title: 'stockHealth', icon: MENU_SCREENS.StockHealthView.icon, singleton: true }] }
    : group,
)

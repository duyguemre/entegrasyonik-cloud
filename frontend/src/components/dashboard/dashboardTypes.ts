// Dashboard'un tükettiği GERÇEK backend yanıt şekilleri (docs/API_TENANT_SURFACE.md ve
// backend `OrderService.getOrderDashboardInsights`). Yalnızca kullanılan alanlar tiplenir.

export interface OrderInsights {
  totals: { orderCount: number; revenue: number; returnCount: number; returnAmount: number }
  today: { count: number; revenue: number }
  trend: { countChange: number; revenueChange: number }
  statusDistribution: Record<string, number> & { total: number }
  pending: { invoiceCount: number; shippingCount: number; claimCount: number; messageCount: number }
  last7Days: Array<{ date: string; count: number; revenue: number }>
}

export const isOrderInsights = (res: any): boolean =>
  Boolean(res && typeof res === 'object' && res.totals && res.today && res.pending && Array.isArray(res.last7Days))

export type AllocationState = 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'OVERSOLD' | 'RESTOCKED' | 'UNMAPPED'

export interface StockOverview {
  generatedAt: string
  attention: { oversold: { lines: number; units: number }; unmapped: { lines: number; units: number } }
  recentOrders: Array<{
    orderId: string
    orderNumber: string | null
    externalOrderId: string | null
    integrationCode: string | null
    orderDate: string | null
    items: Array<{ externalLineItemId: string | null; sku: string | null; productName: string | null; quantity: number; allocationState: AllocationState }>
  }>
  variants: {
    total: number
    totalStock: number
    reservedUnits: number
    availableUnits: number
    withReservations: number
    overReserved: number
    publishPending: number
  }
  reconciliation: { tracked: boolean; lastRunAt: string | null }
}

export const isStockOverview = (res: any): boolean =>
  Boolean(res && typeof res === 'object' && res.attention?.oversold && res.attention?.unmapped && res.variants && Array.isArray(res.recentOrders))

export type IntegrationHealthLevel = 'not_configured' | 'no_data' | 'healthy' | 'degraded' | 'down'

export interface IntegrationHealthEntry {
  integrationCode: string
  type: string
  enabled: boolean
  credentialsConfigured: boolean | null
  lastSuccessfulSyncAt: string | null
  lastError: { at: string; code: string; httpStatus: number | null; operation: string | null } | null
  last24h: { total: number; success: number; error: number }
  health: IntegrationHealthLevel
}

export interface IntegrationHealth {
  generatedAt: string
  windowHours: number
  integrations: IntegrationHealthEntry[]
}

export const isIntegrationHealth = (res: any): boolean =>
  Boolean(res && typeof res === 'object' && Array.isArray(res.integrations))

export interface ExportJob {
  _id: string
  title?: string
  barcode?: string
  integrationCode?: string
  mode?: string
  status?: string
  createdAt?: string
  completedAt?: string
}

export interface ExportJobPage {
  success: boolean
  data: ExportJob[]
  pagination?: { totalNumberOfRecords?: number }
}

export const isExportJobPage = (res: any): boolean => Boolean(res && res.success === true && Array.isArray(res.data))

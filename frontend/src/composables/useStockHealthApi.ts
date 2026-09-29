/**
 * frontend/src/composables/useStockHealthApi.ts
 *
 * F-01 / C1.1 "Stok sağlığı" — `docs/API_TENANT_SURFACE.md` §2 (member):
 *  - `StockService/getStockOverview` ({ limit?: 1..50 }) → açık OVERSOLD/UNMAPPED kalemleri, dikkat
 *    gerektiren en yeni siparişler, varyant rezervasyon toplamları, mutabakat durumu (§2.3).
 *  - `OrderService/getOrders` → `searchOrderForm.filter.allocationStates` (§2.2; sipariş listesi kendi
 *    çağrısını yapar, bu dosya yalnızca filtre değerlerinin kapalı kümesini ve tab parametresini üretir).
 * Backend karşılığı (salt-okunur): `backend/src/api/services/stock-service.ts` (`getStockOverview`).
 *
 * Yanıt şekli sözleşmedeki örnekle BİREBİR; uydurma alan yok. Aşağıdaki yardımcılar saftır ve vitest'lidir
 * (`tests/stock-health.test.ts`). `available = stock − reserved` backend'de `variants.availableUnits` olarak
 * TOPLAM düzeyinde gelir; tek varyant düzeyinde FE hesaplar (`availableOf`).
 */
import useRestApi from '@/composables/restapi'
import { ALLOCATION_STATES, type AllocationState } from '@/design/status-map'

export { ALLOCATION_STATES, type AllocationState }

export interface AttentionCount {
  lines: number
  units: number
}

export interface StockOverviewItem {
  externalLineItemId: string | null
  sku: string | null
  barcode: string | null
  productName: string | null
  quantity: number | null
  allocationState: AllocationState
  lastAllocationAppliedAt: string | null
  oversoldEscalatedAt: string | null
}

export interface StockOverviewOrder {
  orderId: string
  orderNumber: string | null
  externalOrderId: string | null
  integrationCode: string | null
  orderDate: string | null
  items: StockOverviewItem[]
}

export interface StockOverviewVariants {
  total: number
  totalStock: number
  reservedUnits: number
  availableUnits: number
  withReservations: number
  overReserved: number
  publishPending: number
}

export interface StockOverview {
  generatedAt: string
  attention: { oversold: AttentionCount; unmapped: AttentionCount }
  recentOrders: StockOverviewOrder[]
  variants: StockOverviewVariants
  reconciliation: { tracked: boolean; lastRunAt: string | null }
}

/** Ekranın "dikkat gerektiren" saydığı durumlar — backend `ATTENTION_ALLOCATION_STATES` ile aynı. */
export const ATTENTION_STATES: readonly AllocationState[] = ['OVERSOLD', 'UNMAPPED']

/** Varsayılan "dikkat gerektiren siparişler" sayısı (sözleşme üst sınırı 50). */
export const STOCK_OVERVIEW_LIMIT = 20

export function isAllocationState(value: unknown): value is AllocationState {
  return typeof value === 'string' && (ALLOCATION_STATES as readonly string[]).includes(value)
}

/** Sözleşmedeki zorunlu üst düzey alanlar var mı (başarı gövdesi ↔ hata/boş gövde ayrımı). */
export function isStockOverview(res: unknown): res is StockOverview {
  const r = res as any
  return (
    !!r &&
    typeof r === 'object' &&
    !!r.attention?.oversold &&
    !!r.attention?.unmapped &&
    Array.isArray(r.recentOrders) &&
    !!r.variants &&
    typeof r.variants === 'object' &&
    !!r.reconciliation &&
    typeof r.reconciliation.tracked === 'boolean'
  )
}

/** Sayı DEĞİLSE `null` (ekran "—" gösterir; "0" UYDURULMAZ). */
export function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Tek varyant için kullanılabilir adet (ürün detayı): `stock − reserved`; biri eksikse `null`. */
export function availableOf(variant: { stock?: unknown; reserved?: unknown } | null | undefined): number | null {
  const stock = numOrNull(variant?.stock)
  if (stock === null) return null
  const reserved = numOrNull(variant?.reserved) ?? 0
  return stock - reserved
}

// Önem sırası: kullanıcının EYLEM alması gereken durum en üstte. Sipariş satırında birden çok kalem
// varsa rozet en önemli durumu gösterir (ör. bir kalem aşırı satışta, diğeri rezerve → "Aşırı satış").
const SEVERITY: Record<AllocationState, number> = {
  OVERSOLD: 6,
  UNMAPPED: 5,
  RESERVED: 4,
  COMMITTED: 3,
  RESTOCKED: 2,
  RELEASED: 1,
}

export interface OrderAllocationSummary {
  /** Rozetin gösterdiği (en önemli) durum. */
  state: AllocationState
  /** Bu durumdaki kalem sayısı. */
  count: number
  /** Tahsis durumu OLAN kalem sayısı (durumsuz kalemler — ör. eski siparişler — sayılmaz). */
  tracked: number
  /** Siparişteki farklı durumların sayısı (>1 ise "karışık"). */
  distinct: number
}

/** Sipariş kalemlerinden liste rozeti özeti; hiçbir kalemde durum yoksa `null` (rozet çizilmez). */
export function summarizeOrderAllocation(items: Array<{ allocationState?: unknown }> | null | undefined): OrderAllocationSummary | null {
  const states = (Array.isArray(items) ? items : []).map((i) => i?.allocationState).filter(isAllocationState)
  if (states.length === 0) return null
  const state = states.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a))
  return {
    state,
    count: states.filter((s) => s === state).length,
    tracked: states.length,
    distinct: new Set(states).size,
  }
}

export interface AttentionRow extends StockOverviewItem {
  /** Satır anahtarı: sipariş + kalem (kalem kimliği yoksa sıra). */
  key: string
  orderId: string
  orderNumber: string | null
  externalOrderId: string | null
  integrationCode: string | null
  orderDate: string | null
}

/** `recentOrders[].items[]` → kalem başına tablo satırı (önce aşırı satış, sonra sipariş tarihi yeni→eski). */
export function flattenAttentionRows(orders: StockOverviewOrder[] | null | undefined): AttentionRow[] {
  const rows: AttentionRow[] = []
  for (const order of Array.isArray(orders) ? orders : []) {
    const items = Array.isArray(order?.items) ? order.items : []
    items.forEach((item, index) => {
      if (!isAllocationState(item?.allocationState)) return
      rows.push({
        ...item,
        key: `${order.orderId}:${item.externalLineItemId ?? index}`,
        orderId: order.orderId,
        orderNumber: order.orderNumber ?? null,
        externalOrderId: order.externalOrderId ?? null,
        integrationCode: order.integrationCode ?? null,
        orderDate: order.orderDate ?? null,
      })
    })
  }
  const time = (v: string | null) => (v ? Date.parse(v) || 0 : 0)
  return rows.sort((a, b) => SEVERITY[b.allocationState] - SEVERITY[a.allocationState] || time(b.orderDate) - time(a.orderDate))
}

export interface StockBalance {
  /** Çubuk oranları (0..1); `totalStock` 0 veya bilinmiyorsa `null` (çubuk yerine metin). */
  availableRatio: number | null
  reservedRatio: number | null
  /** Rezerv toplam stoğu aşıyor mu (toplam düzeyinde). */
  overCommitted: boolean
}

export function stockBalance(v: Partial<StockOverviewVariants> | null | undefined): StockBalance {
  const total = numOrNull(v?.totalStock)
  const reserved = numOrNull(v?.reservedUnits)
  if (total === null || reserved === null || total <= 0) {
    return { availableRatio: null, reservedRatio: null, overCommitted: total !== null && reserved !== null && reserved > total }
  }
  const reservedRatio = Math.min(Math.max(reserved / total, 0), 1)
  return { availableRatio: 1 - reservedRatio, reservedRatio, overCommitted: reserved > total }
}

/**
 * Sipariş listesini (OrderListView) açmak için sekme parametresi. `allocationStates` screens.ts'te
 * kapalı küme olarak kayıtlıdır (URL'ye yazılır); `globalSearch` URL'ye YAZILMAZ (serbest metin).
 */
export function orderListParams(states: readonly AllocationState[], orderNumber?: string | null): Record<string, any> {
  const params: Record<string, any> = { allocationStates: [...states] }
  if (orderNumber) params.globalSearch = orderNumber
  return params
}

// ---- Kalem tahsis zaman çizgisi (OrderAllocationTimeline) ----

export type AllocationEventKind = 'applied' | 'escalated'

export interface AllocationTimelineEvent {
  kind: AllocationEventKind
  at: string
}

export interface AllocationTimelineEntry {
  key: string
  productName: string | null
  sku: string | null
  quantity: number | null
  state: AllocationState | null
  /** Zaman sırasına dizilmiş (eski → yeni) olaylar; yalnızca backend'in GERÇEKTEN yazdığı damgalar. */
  events: AllocationTimelineEvent[]
}

/**
 * Sipariş kalemlerinden (getOrders `items[]` veya getStockOverview `recentOrders[].items[]`) zaman çizgisi.
 * Olaylar: `lastAllocationAppliedAt` (son tahsis geçişinin uygulandığı an) ve `oversoldEscalatedAt`
 * (aşırı satış için manuel görev bildiriminin gönderildiği an). Tahsis GEÇMİŞİ backend'de sipariş
 * üzerinde tutulmaz — yalnızca son geçiş bilinir; ara durumlar UYDURULMAZ.
 */
export function buildAllocationTimeline(items: Array<Record<string, any>> | null | undefined): AllocationTimelineEntry[] {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const events: AllocationTimelineEvent[] = []
    if (typeof item?.lastAllocationAppliedAt === 'string' && item.lastAllocationAppliedAt) {
      events.push({ kind: 'applied', at: item.lastAllocationAppliedAt })
    }
    if (typeof item?.oversoldEscalatedAt === 'string' && item.oversoldEscalatedAt) {
      events.push({ kind: 'escalated', at: item.oversoldEscalatedAt })
    }
    events.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
    return {
      key: String(item?.externalLineItemId ?? item?._id ?? index),
      productName: item?.productName ?? null,
      sku: item?.sku ?? item?.stockCode ?? null,
      quantity: numOrNull(item?.quantity),
      state: isAllocationState(item?.allocationState) ? item.allocationState : null,
      events,
    }
  })
}

export function useStockHealthApi() {
  const restApi = useRestApi()
  return {
    getStockOverview: (limit: number = STOCK_OVERVIEW_LIMIT) =>
      restApi.post('StockService/getStockOverview', { limit }) as Promise<any>,
  }
}

/**
 * frontend/src/composables/useFinanceApi.ts
 *
 * Finans sekmeleri (Özet · Kargo faturaları · Ödeme dökümü) için FinancialService çağrıları.
 * Sözleşme: docs/API_TENANT_SURFACE.md §6 + backend/src/api/services/financial-service.ts (salt okunur).
 * Yanıt şekilleri backend'in döndürdüğü alanlarla BİREBİR; türetilmiş/uydurma alan eklenmez.
 *
 * `restApi.post` hatada reddetmez, axios hata nesnesiyle çözülür → burada `{ ok:false, status }`'a çevrilir;
 * ekran ham hata metnini ASLA göstermez (yalnız durum koduna göre sabit metin).
 */
import useRestApi from '@/composables/restapi'
import { isRequestError } from '@/components/ds/listStandard'

/** `getFinancialSummary` yanıtı (kayıt yoksa backend sıfırlarla döner). */
export interface FinancialSummary {
  totalCredit: number
  totalDebt: number
  totalCargo: number
  netAmount: number
  transactionCount: number
}

/** `getFinancialSummary` / `getTransactionData` ortak filtre alanları. */
export interface FinancialSummaryQuery {
  integrationCodes?: string[]
  startDate?: Date | string | null
  endDate?: Date | string | null
}

/** CargoInvoices koleksiyonu satırı (`CargoInvoiceSchema`). */
export interface CargoInvoice {
  _id: string
  integrationCode: string
  invoiceNumber: string
  orderNumber: string
  packageId: string
  shipmentType: 'FORWARD' | 'RETURN' | string
  desi?: number
  amount: number
  transactionDate: string
  meta?: Record<string, unknown>
}

/** `getCargoInvoices` filtresi — backend TEK kanal (`integrationCode`) ve TAM eşleşme (fatura/sipariş no) uygular. */
export interface CargoInvoiceQuery {
  integrationCode?: string | null
  invoiceNumber?: string | null
  orderNumber?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
}

/** FinancialTransactions satırı (`FinancialTransactionSchema`) — ödeme dökümü kalemleri. */
export interface FinancialTransactionRow {
  _id: string
  integrationCode: string
  externalId: string
  orderNumber?: string | null
  transactionType: string
  platformType?: string
  debt?: number
  credit?: number
  netAmount: number
  commissionAmount?: number
  commissionRate?: number
  transactionDate: string
  payoutDate?: string | null
  paymentOrderId?: string | null
  description?: string
}

export interface PayoutListQuery {
  integrationCodes?: string[]
  startDate?: Date | string | null
  endDate?: Date | string | null
  page: number
  limit: number
  sortBy: Array<{ key: string; order: 'asc' | 'desc' }>
}

export interface PayoutListResult {
  transactions: FinancialTransactionRow[]
  totalNumberOfRecords: number
}

export type FinanceResult<T> = { ok: true; data: T } | { ok: false; status: number | null }

/** Backend kargo faturası üst sınırı (`CARGO_INVOICES_MAX_ROWS`). */
export const CARGO_INVOICES_MAX_ROWS = 5000

function failure(res: unknown): { ok: false; status: number | null } {
  const status = (res as { response?: { status?: number } } | null)?.response?.status
  return { ok: false, status: typeof status === 'number' ? status : null }
}

/** Yalnız tanımlı filtre alanlarını gönder (boş dizi/boş metin/null gövdeye girmez). */
function compact<T extends Record<string, unknown>>(query: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

export function useFinanceApi() {
  const restApi = useRestApi()

  async function getSummary(query: FinancialSummaryQuery): Promise<FinanceResult<FinancialSummary>> {
    const res = await restApi.post('FinancialService/getFinancialSummary', compact({ ...query }))
    if (isRequestError(res) || !res || typeof res !== 'object') return failure(res)
    return { ok: true, data: res as FinancialSummary }
  }

  async function getCargoInvoices(query: CargoInvoiceQuery): Promise<FinanceResult<CargoInvoice[]>> {
    const res = await restApi.post('FinancialService/getCargoInvoices', compact({ ...query }))
    if (isRequestError(res) || !Array.isArray(res)) return failure(res)
    return { ok: true, data: res as CargoInvoice[] }
  }

  /** Ödeme emri listesi: `getTransactionData`, yalnız PAYOUT türü (mevcut uç; yeni uç YOK). */
  async function listPayouts(query: PayoutListQuery): Promise<FinanceResult<PayoutListResult>> {
    const res = await restApi.post('FinancialService/getTransactionData', {
      ...compact({ integrationCodes: query.integrationCodes, startDate: query.startDate, endDate: query.endDate }),
      transactionTypes: ['PAYOUT'],
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
    })
    if (isRequestError(res) || !res || !Array.isArray(res.transactions)) return failure(res)
    return { ok: true, data: { transactions: res.transactions, totalNumberOfRecords: res.totalNumberOfRecords ?? 0 } }
  }

  /** Backend `paymentOrderId`'yi yalnız string/sayı olarak kabul eder (nesne → 400); burada da aynı daraltma. */
  async function getPayoutDetails(paymentOrderId: string | number): Promise<FinanceResult<FinancialTransactionRow[]>> {
    if (typeof paymentOrderId !== 'string' && typeof paymentOrderId !== 'number') return { ok: false, status: 400 }
    const id = typeof paymentOrderId === 'string' ? paymentOrderId.trim() : paymentOrderId
    if (id === '') return { ok: false, status: 400 }
    const res = await restApi.post('FinancialService/getPayoutDetails', { paymentOrderId: id })
    if (isRequestError(res) || !Array.isArray(res)) return failure(res)
    return { ok: true, data: res as FinancialTransactionRow[] }
  }

  return { getSummary, getCargoInvoices, listPayouts, getPayoutDetails }
}

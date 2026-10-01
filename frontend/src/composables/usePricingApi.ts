/**
 * frontend/src/composables/usePricingApi.ts
 *
 * PRC-R0 (maliyet) + PRC-R1 (Trendyol buybox, SALT OKUMA) — müşteri uygulaması istemcisi.
 * Sözleşme tek kaynağı: `docs/PRICING_COMPETITION.md` §5 (`PricingService/*`). Uydurma alan yok; bilinmeyen
 * değer ASLA 0 gösterilmez (bu dosyadaki yardımcılar `null` döndürür, görünüm "—" yazar).
 *
 * Bu dosya iki parçadır:
 *  1. SAF yardımcılar (rozet özeti, filtre ↔ URL eşlemesi, değişen maliyet hesabı, kâr paneli görünüm modeli,
 *     sparkline noktaları) — `tests/prc-r1-pricing.test.ts`.
 *  2. `usePricingApi()` — `restApi.post` ile çağrılar; sonuç `{ ok } | { ok:false, reason }` (ham hata sızmaz).
 */
import useRestApi from '@/composables/restapi'
import { isApiError, apiStatus } from '@/composables/apiErrors'

// ── Tipler (sözleşme §5) ─────────────────────────────────────────────────────────────────────────────────────

export type BuyboxStatus = 'winning' | 'losing' | 'not_found' | 'unchecked'
export type CapabilityLevel = 'supported' | 'limited' | 'platform_auto' | 'not_supported'
export type CommissionSource = 'override' | 'actual' | 'estimated' | 'unknown'
export type MarginMissingKey = 'cost' | 'vat' | 'commission' | 'commissionVat' | 'serviceFee' | 'shipping' | 'withholding'
export type IneligibleReason = 'cost_missing' | 'vat_missing' | 'commission_unknown'

export interface CostCoverage { total: number; withCost: number; percent: number; stale: number }

export interface BuyboxRow {
  variantId: string
  productId: string | null
  barcode: string | null
  sku: string | null
  status: BuyboxStatus
  buyboxOrder: number | null
  buyboxPrice: number | null
  hasMultipleSeller: boolean | null
  ownPrice: number | null
  gapAmount: number | null
  gapPercent: number | null
  checkedAt: string | null
  nextRefreshAt: string | null
  overdue: boolean
  fresh: boolean
  lostAt: string | null
}

export interface ChannelSupport { code: string; displayName: string; level: CapabilityLevel; verified: boolean }

export interface BuyboxSettings {
  enabled: boolean
  plan?: string
  skuCap: number
  refreshMin: number
  freshnessMin: number
  priority?: string
  eligible: number
  tracked: number
}

export interface ListBuyboxResponse {
  channel: string
  channels: ChannelSupport[]
  settings: BuyboxSettings
  summary: Record<BuyboxStatus, number>
  items: BuyboxRow[]
  nextCursor: string | null
}

export interface HistoryPoint { at: string; status: BuyboxStatus; buyboxOrder: number | null; buyboxPrice: number | null; ownPrice: number | null }
export interface BuyboxHistoryResponse { channel: string; barcode: string; days: number; points: HistoryPoint[] }

export interface ProfitAt {
  price: number
  net: number | null
  salesVat: number | null
  profit: number | null
  marginPercent: number | null
  confidence: 'estimated' | 'partial' | 'unknown'
  missing: MarginMissingKey[]
}

export interface MarginItem {
  variantId: string | null
  barcode: string | null
  found: boolean
  productId?: string | null
  sku?: string | null
  priceSource?: 'input' | 'channel'
  ownPrice?: number | null
  buybox?: { status: BuyboxStatus; order: number | null; price: number | null; hasMultipleSeller: boolean | null; observedAt: string | null; ageMinutes: number | null; fresh: boolean }
  gap?: { amount: number | null; percent: number | null }
  current?: ProfitAt | null
  atBuybox?: ProfitAt | null
  breakEvenPrice?: number | null
  buyboxBelowFloor?: boolean
  commission?: { rate: number | null; source: CommissionSource }
  cost?: { price: number | null; updatedAt: string | null }
  vatRate?: number | null
  rulesEligible?: boolean
  ineligibleReasons?: IneligibleReason[]
}
export interface PreviewMarginResponse { channel: string; freshnessMin: number; items: MarginItem[] }

export interface CostItemInput { variantId?: string; barcode?: string; costPrice: number | null }
export interface SetCostsResponse {
  updated: number
  unchanged: number
  notFound: Array<{ variantId?: string; barcode?: string } | string>
  changes: Array<{ variantId: string; before: number | null; after: number | null }>
  coverage: CostCoverage
}

// ── Sonuç zarfı ─────────────────────────────────────────────────────────────────────────────────────────────

export type ApiFailure = 'unauthorized' | 'error'
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: ApiFailure }

/** `restApi.post` hata nesnesini `resolve` eder (bkz. `apiErrors.ts`); 403 = yetkisiz, diğer her şey = genel hata. */
export function toResult<T>(res: unknown, isOk: (r: any) => boolean): ApiResult<T> {
  if (isApiError(res)) return { ok: false, reason: apiStatus(res) === 403 ? 'unauthorized' : 'error' }
  if (!isOk(res)) return { ok: false, reason: 'error' }
  return { ok: true, data: res as T }
}

// ── Buybox: rozet özeti ─────────────────────────────────────────────────────────────────────────────────────

export type BuyboxBadgeKind = 'losing' | 'winning' | 'none'
export interface BuyboxBadgeSummary { kind: BuyboxBadgeKind; losing: number; winning: number; total: number }

/**
 * Ürün başına rozet (varyantlardan özet): herhangi biri `losing` → uyarı; HEPSİ `winning` → "sizde";
 * `not_found`/`unchecked` ya da karışık → gösterme. Özellik kapalıysa (`enabled=false`) hiçbir rozet çıkmaz.
 */
export function summarizeBuybox(rows: ReadonlyArray<Pick<BuyboxRow, 'status'>> | undefined, enabled: boolean): BuyboxBadgeSummary {
  const list = rows ?? []
  const losing = list.filter((r) => r.status === 'losing').length
  const winning = list.filter((r) => r.status === 'winning').length
  const total = list.length
  if (!enabled || total === 0) return { kind: 'none', losing, winning, total }
  if (losing > 0) return { kind: 'losing', losing, winning, total }
  if (winning === total) return { kind: 'winning', losing, winning, total }
  return { kind: 'none', losing, winning, total }
}

/** `listBuybox.items` → ürün kimliğine göre gruplar (productId'siz satır atılır). */
export function groupBuyboxByProduct(items: ReadonlyArray<BuyboxRow>): Record<string, BuyboxRow[]> {
  const out: Record<string, BuyboxRow[]> = {}
  for (const row of items) {
    if (!row.productId) continue
    ;(out[row.productId] ??= []).push(row)
  }
  return out
}

/** Sayfadaki ürünlerin kimlikleri (≤100 — sözleşme sınırı) → `listBuybox` gövdesi. */
export function buyboxPageRequest(productIds: ReadonlyArray<string>): { productIds: string[]; limit: number } {
  return { productIds: productIds.slice(0, 100), limit: 200 }
}

// ── Buybox: liste filtresi ↔ URL ──────────────────────────────────────────────────────────────────────────

export const BUYBOX_FILTER_VALUES = ['winning', 'losing', 'not_found', 'unchecked'] as const
export type BuyboxFilterValue = (typeof BUYBOX_FILTER_VALUES)[number]

export function isBuyboxFilterValue(v: unknown): v is BuyboxFilterValue {
  return typeof v === 'string' && (BUYBOX_FILTER_VALUES as readonly string[]).includes(v)
}

/**
 * Sekme/URL parametresi (`?buybox=losing&barcode=…`) → liste filtresi. Bilinmeyen `buybox` değeri yok sayılır
 * (kapalı küme); `barcode` serbest metin değil teknik kimliktir (≤128, boşluk yok).
 */
export function buyboxFilterFromParams(params: Record<string, any> | undefined | null): { buyboxStatus?: BuyboxFilterValue; barcode?: string } {
  const out: { buyboxStatus?: BuyboxFilterValue; barcode?: string } = {}
  if (!params) return out
  const raw = Array.isArray(params.buybox) ? params.buybox[0] : params.buybox
  if (isBuyboxFilterValue(raw)) out.buyboxStatus = raw
  const bc = typeof params.barcode === 'string' ? params.barcode.trim() : ''
  // Barkod yalnız buybox bağlamıyla birlikte süzgeç olur (bildirim eylemi); tek başına URL'den aranmaz.
  if (out.buyboxStatus && bc && bc.length <= 128 && !/\s/.test(bc)) out.barcode = bc
  return out
}

// ── Maliyet: değişen alan hesabı ──────────────────────────────────────────────────────────────────────────

/** Boş/geçersiz → null (maliyet yok); sayı → 2 haneye yuvarlı. 0 geçerli bir maliyettir (null ile karışmaz). */
export function normalizeCost(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export type CostBaseline = Record<string, number | null>

/** Açılıştaki (sunucudan gelen) maliyetler: varyant `_id` → maliyet. */
export function costBaseline(variants: ReadonlyArray<any> | undefined): CostBaseline {
  const out: CostBaseline = {}
  for (const v of variants ?? []) if (v?._id) out[String(v._id)] = normalizeCost(v.costPrice)
  return out
}

export interface CostDiff { items: CostItemInput[]; skippedNoBarcode: number }

/**
 * Kaydetmede gönderilecek DEĞİŞEN maliyetler. Kayıtlı varyant (`_id`): açılıştaki değerle farklıysa `{ variantId }`.
 * Yeni varyant (kimliksiz; ürün oluşturma): maliyet girilmişse `{ barcode }` (kayıttan sonra kimlik bilinmez);
 * barkodsuz olanlar sayılır ve kullanıcıya bildirilir. Değişmeyen kalem GÖNDERİLMEZ (tarih korunur).
 */
export function changedCosts(baseline: CostBaseline, variants: ReadonlyArray<any> | undefined): CostDiff {
  const items: CostItemInput[] = []
  let skippedNoBarcode = 0
  for (const v of variants ?? []) {
    const now = normalizeCost(v?.costPrice)
    if (v?._id) {
      const id = String(v._id)
      const before = id in baseline ? baseline[id] : null
      if (now !== before) items.push({ variantId: id, costPrice: now })
    } else if (now !== null) {
      const bc = String(v?.barcode ?? '').trim()
      if (bc) items.push({ barcode: bc, costPrice: now })
      else skippedNoBarcode++
    }
  }
  return { items, skippedNoBarcode }
}

/**
 * Genel varyant kaydı yanıtı (sunucu değeri) formdaki varyantların yerine geçer; kullanıcının yazdığı maliyetler sunucuda
 * `setVariantCosts` ile işlenene kadar formdan KAYBOLMAMALI. Bu yardımcı, gönderilen kalemleri yanıttaki varyantlara geri yazar.
 */
export function applyCostEdits(variants: any[] | undefined, items: ReadonlyArray<CostItemInput>): void {
  for (const it of items) {
    const v = (variants ?? []).find((x) => (it.variantId ? String(x?._id) === it.variantId : String(x?.barcode ?? '').trim() === it.barcode))
    if (v) v.costPrice = it.costPrice
  }
}

export type CostSaveOutcome =
  | { status: 'none' }
  | { status: 'ok'; updated: number; coverage: CostCoverage | null }
  | { status: 'partial'; updated: number; notFound: number }
  | { status: 'failed'; reason: ApiFailure; updated: number }

/**
 * Değişen maliyetleri ayrı çağrıyla yazar (≤500'lük parçalar). Varyant kaydından BAĞIMSIZDIR: sonuç ayrı bildirilir
 * (kayıt başarılı + maliyet başarısız durumu kullanıcıya açıkça gösterilir). İlk başarısız parçada durur.
 */
export async function saveCostEdits(
  setCosts: (items: CostItemInput[]) => Promise<ApiResult<SetCostsResponse>>,
  diff: CostDiff,
): Promise<CostSaveOutcome> {
  if (!diff.items.length) return { status: 'none' }
  let updated = 0
  let notFound = 0
  let coverage: CostCoverage | null = null
  for (const part of chunk(diff.items, 500)) {
    const res = await setCosts(part)
    if (!res.ok) return { status: 'failed', reason: res.reason, updated }
    updated += res.data.updated + res.data.unchanged
    notFound += res.data.notFound?.length ?? 0
    coverage = res.data.coverage ?? coverage
  }
  return notFound > 0 ? { status: 'partial', updated, notFound } : { status: 'ok', updated, coverage }
}

/** Sunucu 500'lük sınır koyar; büyük ürünler parçalanır. */
export function chunk<T>(list: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Maliyet kapsamı göstergesi: yüzde (tam sayıya yuvarlı) + %100 değilse ipucu gerekir. */
export function coverageView(c: CostCoverage | null | undefined): { percent: number; complete: boolean; empty: boolean } | null {
  if (!c || !Number.isFinite(c.percent)) return null
  return { percent: Math.round(c.percent), complete: c.total > 0 && c.withCost >= c.total, empty: c.total === 0 }
}

// ── Kâr paneli görünüm modeli ────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export interface MarginView {
  found: boolean
  status: BuyboxStatus
  order: number | null
  buyboxPrice: number | null
  ownPrice: number | null
  gapAmount: number | null
  /** Yüzde birimi (3,2 = %3,2); API zaten yüzde döner. */
  gapPercent: number | null
  profitNow: number | null
  profitAtBuybox: number | null
  marginNowPercent: number | null
  breakEven: number | null
  commissionSource: CommissionSource
  commissionRate: number | null
  /** Kâr hesabında eksik bileşenler (tekilleştirilmiş, her iki hesaptan). */
  missing: MarginMissingKey[]
  costMissing: boolean
  belowFloor: boolean
  rulesEligible: boolean
  ineligibleReasons: IneligibleReason[]
  /** Buybox verisi var ama tazelik eşiğini aşmış. */
  stale: boolean
  observedAt: string | null
  partial: boolean
}

export function marginView(item: MarginItem | undefined | null): MarginView {
  const bb = item?.buybox
  const missing = new Set<MarginMissingKey>()
  for (const p of [item?.current, item?.atBuybox]) for (const m of p?.missing ?? []) missing.add(m)
  const status = bb?.status ?? 'unchecked'
  return {
    found: !!item?.found,
    status,
    order: num(bb?.order),
    buyboxPrice: num(bb?.price),
    ownPrice: num(item?.ownPrice),
    gapAmount: num(item?.gap?.amount),
    gapPercent: num(item?.gap?.percent),
    profitNow: num(item?.current?.profit),
    profitAtBuybox: num(item?.atBuybox?.profit),
    marginNowPercent: num(item?.current?.marginPercent),
    breakEven: num(item?.breakEvenPrice),
    commissionSource: item?.commission?.source ?? 'unknown',
    commissionRate: num(item?.commission?.rate),
    missing: [...missing],
    costMissing: num(item?.cost?.price) === null,
    belowFloor: !!item?.buyboxBelowFloor,
    rulesEligible: !!item?.rulesEligible,
    ineligibleReasons: item?.ineligibleReasons ?? [],
    stale: !!bb && status !== 'unchecked' && bb.fresh === false,
    observedAt: bb?.observedAt ?? null,
    partial: item?.current?.confidence === 'partial' || item?.atBuybox?.confidence === 'partial',
  }
}

export type RefreshKind = 'off' | 'pending' | 'overdue' | 'scheduled'
/** "Bir sonraki tazeleme" dürüst gösterimi: kapalı / henüz okunmadı / gecikti / planlı. */
export function refreshInfo(row: Pick<BuyboxRow, 'nextRefreshAt' | 'overdue' | 'checkedAt'> | undefined, enabled: boolean): { kind: RefreshKind; at: string | null } {
  if (!enabled) return { kind: 'off', at: null }
  if (!row) return { kind: 'off', at: null }
  if (!row.checkedAt) return { kind: 'pending', at: null }
  if (!row.nextRefreshAt) return { kind: 'off', at: null }
  return { kind: row.overdue ? 'overdue' : 'scheduled', at: row.nextRefreshAt }
}

/** Varyant seçicide varsayılan: önce kaybedilen, yoksa ilk varyant. */
export function defaultVariantId(items: ReadonlyArray<MarginItem>): string | null {
  const found = items.filter((i) => i.found && i.variantId)
  return (found.find((i) => i.buybox?.status === 'losing') ?? found[0])?.variantId ?? null
}

// ── 30 günlük mini grafik (hafif SVG sparkline) ──────────────────────────────────────────────────────────

export interface SparkLine { d: string; last: { x: number; y: number } | null }
export interface SparkModel { buybox: SparkLine; own: SparkLine; min: number; max: number; hasData: boolean; points: number }

/**
 * İki çizgi (buybox fiyatı, fiyatım) ortak y ölçeğinde; x zamana orantılı. Değeri `null` olan nokta çizgiyi böler
 * (0 çizilmez). En az iki sayısal nokta yoksa `hasData` false (boş durum).
 */
export function sparkModel(points: ReadonlyArray<HistoryPoint>, width: number, height: number, pad = 4): SparkModel {
  const times = points.map((p) => Date.parse(p.at)).filter(Number.isFinite)
  const vals: number[] = []
  for (const p of points) {
    if (num(p.buyboxPrice) !== null) vals.push(p.buyboxPrice as number)
    if (num(p.ownPrice) !== null) vals.push(p.ownPrice as number)
  }
  const empty: SparkLine = { d: '', last: null }
  if (vals.length < 2 || times.length < 2) return { buybox: empty, own: empty, min: 0, max: 0, hasData: false, points: points.length }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const spanT = t1 - t0 || 1
  const spanV = max - min || 1
  const x = (t: number) => pad + ((t - t0) / spanT) * (width - 2 * pad)
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / spanV) * (height - 2 * pad))
  const r = (n: number) => Math.round(n * 10) / 10
  const line = (pick: (p: HistoryPoint) => number | null): SparkLine => {
    let d = ''
    let pen = false
    let last: { x: number; y: number } | null = null
    for (const p of points) {
      const v = pick(p)
      const t = Date.parse(p.at)
      if (v === null || !Number.isFinite(t)) { pen = false; continue }
      const px = r(x(t))
      const py = r(y(v))
      d += `${pen ? 'L' : 'M'}${px} ${py} `
      pen = true
      last = { x: px, y: py }
    }
    return { d: d.trim(), last }
  }
  return { buybox: line((p) => num(p.buyboxPrice)), own: line((p) => num(p.ownPrice)), min, max, hasData: true, points: points.length }
}

// ── API ──────────────────────────────────────────────────────────────────────────────────────────────────────

const isCoverageBody = (r: any) => !!r && typeof r === 'object' && !!r.coverage && Number.isFinite(r.coverage.percent)
const isBuyboxBody = (r: any) => !!r && typeof r === 'object' && Array.isArray(r.items) && !!r.settings
const isHistoryBody = (r: any) => !!r && typeof r === 'object' && Array.isArray(r.points)
const isPreviewBody = (r: any) => !!r && typeof r === 'object' && Array.isArray(r.items)
const isSetCostsBody = (r: any) => !!r && typeof r === 'object' && typeof r.updated === 'number'

export function usePricingApi() {
  const restApi = useRestApi()
  return {
    /** Ürün listesi başlığı: maliyet kapsamı (yalnız `coverage` kullanılır; `limit:1`). */
    async costCoverage(): Promise<ApiResult<CostCoverage>> {
      const res = await restApi.post('PricingService/listCosts', { limit: 1 })
      const r = toResult<{ coverage: CostCoverage }>(res, isCoverageBody)
      return r.ok ? { ok: true, data: r.data.coverage } : r
    },
    /** Maliyet kaydı — genel varyant kaydından AYRI, tek yazma yolu. */
    async setCosts(items: CostItemInput[]): Promise<ApiResult<SetCostsResponse>> {
      const res = await restApi.post('PricingService/setVariantCosts', { items })
      return toResult<SetCostsResponse>(res, isSetCostsBody)
    },
    async listBuybox(body: { productIds?: string[]; barcodes?: string[]; status?: BuyboxStatus; limit?: number }): Promise<ApiResult<ListBuyboxResponse>> {
      const res = await restApi.post('PricingService/listBuybox', body)
      return toResult<ListBuyboxResponse>(res, isBuyboxBody)
    },
    async buyboxHistory(barcode: string, days = 30): Promise<ApiResult<BuyboxHistoryResponse>> {
      const res = await restApi.post('PricingService/getBuyboxHistory', { barcode, days })
      return toResult<BuyboxHistoryResponse>(res, isHistoryBody)
    },
    async previewMargin(variantIds: string[]): Promise<ApiResult<PreviewMarginResponse>> {
      const res = await restApi.post('PricingService/previewMargin', { items: variantIds.slice(0, 50).map((variantId) => ({ variantId })) })
      return toResult<PreviewMarginResponse>(res, isPreviewBody)
    },
  }
}

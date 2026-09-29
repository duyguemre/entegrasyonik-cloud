/**
 * frontend/src/composables/useStockPolicyApi.ts
 *
 * ADR-0015 B4-P0 (N5 "Stok politikası") — `docs/API_TENANT_SURFACE.md` §1 (admin, owner dahil):
 * `IntegrationService/getStockPolicy`, `saveTenantStockPolicy` ({ primaryChannel }), `saveChannelStockPolicy`
 * (kısmi/birleştirmeli; `null` alan = varsayılana dön). Backend karşılığı (salt-okunur, grep):
 * `backend/src/api/services/integration-service.ts:177,206,235`, `operations/stock/stockPolicyValidation.ts`.
 *
 * Önizleme: `computePublishQuantity`, backend `StockPublishTrigger.computePublishQuantity`'nin (ADR-0004 Karar
 * 5-6) BİREBİR aynasıdır — `publish = clamp(available − max(bufferUnits, floor(available×bufferPercent/100)), 0, max)`,
 * birincil kanalda `bufferUnits` = 0. Kanal üst sınırı (ör. Trendyol 20000) örnek değerlerde etkisizdir.
 * Bu dosyadaki diğer her şey saf ve vitest'lidir (`tests/b4-account-privacy-stock.test.ts`).
 */
import useRestApi from '@/composables/restapi'

export type StockPolicyField = 'bufferUnits' | 'bufferPercent' | 'graceMinutes' | 'autoCancelOversold'

export interface ChannelStockPolicy {
  bufferUnits?: number
  bufferPercent?: number
  graceMinutes?: number
  autoCancelOversold?: boolean
}

export interface StockPolicyChannel {
  integrationCode: string
  order: number | null
  enabled: boolean
  isPrimary: boolean
  autoCancelSupported: boolean
  stockPolicy: ChannelStockPolicy
}

export interface StockPolicyResponse {
  primaryChannel: string | null
  effectivePrimaryChannel: string | null
  primaryChannelIsConnected: boolean
  channels: StockPolicyChannel[]
  defaults: Required<ChannelStockPolicy>
  limits: { bufferUnitsMax: number; bufferPercentMax: number; graceMinutesMax: number }
}

/** Form taslağı: sayısal alanlar metin ('' = varsayılanı kullan), otomatik iptal üç durumlu (null = varsayılan). */
export interface ChannelDraft {
  bufferUnits: string
  bufferPercent: string
  graceMinutes: string
  autoCancelOversold: boolean | null
}

export type ChannelPatch = Partial<Record<StockPolicyField, number | boolean | null>>

const NUMERIC_FIELDS = ['bufferUnits', 'bufferPercent', 'graceMinutes'] as const
type NumericField = (typeof NUMERIC_FIELDS)[number]

export function isStockPolicyResponse(res: any): res is StockPolicyResponse {
  return !!res && typeof res === 'object' && Array.isArray(res.channels) && !!res.defaults && !!res.limits
}

export function toDraft(policy: ChannelStockPolicy | undefined): ChannelDraft {
  const p = policy ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '')
  return {
    bufferUnits: num(p.bufferUnits),
    bufferPercent: num(p.bufferPercent),
    graceMinutes: num(p.graceMinutes),
    autoCancelOversold: typeof p.autoCancelOversold === 'boolean' ? p.autoCancelOversold : null,
  }
}

/** '' → null (varsayılan); Türkçe ondalık virgül kabul edilir. Geçersizse `NaN`. */
export function parseDraftNumber(raw: string): number | null {
  const text = String(raw ?? '').trim().replace(',', '.')
  if (text === '') return null
  if (!/^\d+(\.\d+)?$/.test(text)) return Number.NaN
  return Number(text)
}

/** Alan → i18n hata anahtarı (`stockPolicy.errors.*`). Kurallar backend `stockPolicyValidation.ts` ile aynı. */
export function validateDraft(draft: ChannelDraft, limits: StockPolicyResponse['limits']): Partial<Record<NumericField, string>> {
  const errors: Partial<Record<NumericField, string>> = {}
  const rules: Record<NumericField, { max: number; integer: boolean }> = {
    bufferUnits: { max: limits.bufferUnitsMax, integer: true },
    bufferPercent: { max: limits.bufferPercentMax, integer: false },
    graceMinutes: { max: limits.graceMinutesMax, integer: true },
  }
  for (const field of NUMERIC_FIELDS) {
    const value = parseDraftNumber(draft[field])
    if (value === null) continue
    const { max, integer } = rules[field]
    if (Number.isNaN(value)) errors[field] = 'stockPolicy.errors.notNumber'
    else if (integer && !Number.isInteger(value)) errors[field] = 'stockPolicy.errors.integer'
    else if (value < 0 || value > max) errors[field] = 'stockPolicy.errors.range'
  }
  return errors
}

/** Yalnızca DEĞİŞEN alanlar; temizlenen alan `null` (varsayılana dön). Geçersiz taslakta çağrılmamalı. */
export function buildChannelPatch(original: ChannelStockPolicy | undefined, draft: ChannelDraft): ChannelPatch {
  const o = original ?? {}
  const patch: ChannelPatch = {}
  for (const field of NUMERIC_FIELDS) {
    const next = parseDraftNumber(draft[field])
    const prev = typeof o[field] === 'number' ? (o[field] as number) : null
    if (next !== prev) patch[field] = next
  }
  const prevCancel = typeof o.autoCancelOversold === 'boolean' ? o.autoCancelOversold : null
  if (draft.autoCancelOversold !== prevCancel) patch.autoCancelOversold = draft.autoCancelOversold
  return patch
}

/** Backend `StockPublishTrigger.computePublishQuantity` aynası (ADR-0004 Karar 5-6). */
export function computePublishQuantity(
  available: number,
  opts: { isPrimary: boolean; bufferUnits?: number; bufferPercent?: number; channelMax?: number },
): number {
  const bufferUnits = opts.isPrimary ? 0 : (opts.bufferUnits ?? 1)
  const bufferPercent = opts.bufferPercent ?? 0
  const buffer = Math.max(bufferUnits, Math.floor((available * bufferPercent) / 100))
  const channelMax = opts.channelMax ?? Number.POSITIVE_INFINITY
  return Math.min(Math.max(available - buffer, 0), channelMax)
}

/** Taslak + varsayılanlar → önizlemede kullanılacak etkin değerler (geçersiz alan varsayılana düşer). */
export function effectiveNumbers(draft: ChannelDraft, defaults: StockPolicyResponse['defaults']) {
  const pick = (field: NumericField) => {
    const v = parseDraftNumber(draft[field])
    return v === null || Number.isNaN(v) ? defaults[field] : v
  }
  return { bufferUnits: pick('bufferUnits'), bufferPercent: pick('bufferPercent'), graceMinutes: pick('graceMinutes') }
}

export function useStockPolicyApi() {
  const restApi = useRestApi()
  return {
    getStockPolicy: () => restApi.post('IntegrationService/getStockPolicy', {}) as Promise<any>,
    saveTenantStockPolicy: (primaryChannel: string | null) =>
      restApi.post('IntegrationService/saveTenantStockPolicy', { primaryChannel }) as Promise<any>,
    saveChannelStockPolicy: (integrationCode: string, stockPolicy: ChannelPatch) =>
      restApi.post('IntegrationService/saveChannelStockPolicy', { integrationCode, stockPolicy }) as Promise<any>,
  }
}

/**
 * frontend/src/composables/useChannelRulesApi.ts
 *
 * [eslesme-fiyat WP5, K-A/K-A2] Kanal fiyat kuralı (`PriceRules.type:'channel'`) istemcisi. Rakibe bakmaz: maliyet + kargo + komisyon +
 * KDV + hedef marj (ya da ana fiyat ± ayar) → kanal satış fiyatı. Fiyatı SUNUCU hesaplar (backend operations/pricing/channelRule.ts);
 * bu dosya yalnız formu kurar ve sonucu gösterir. K4: form alanları BOŞ başlar (varsayılan değer önerilmez). K9: liste fiyatı yalnız
 * "koru" ya da "satışla aynı" (yapay yükseltme yok). Otomatik uygulama yalnız tenant anahtarı + kural anahtarı birlikte açıkken.
 *
 *  1. SAF yardımcılar (boş form, form → istek, engel nedeni metni) — `tests/eslesme-wp5-pricing.test.ts`.
 *  2. `useChannelRulesApi()` — `restApi.post` çağrıları (RPC adları düz metin; operasyon envanteri taraması bunları okur).
 */
import useRestApi from '@/composables/restapi'
import { toResult, type ApiResult } from '@/composables/usePricingApi'

export const CHANNEL_RULE_CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft'] as const
export type ChannelRuleChannel = (typeof CHANNEL_RULE_CHANNELS)[number]

export interface ChannelParams {
  base: 'cost' | 'salePrice'
  marginPercent?: number | null
  adjustPercent?: number | null
  adjustAmount?: number | null
  commission: { source: 'auto' | 'static'; rate?: number | null }
  cargoCost: number
  rounding: { step: number; direction: 'up' | 'down' | 'nearest'; psychological: boolean }
  floorMarginPercent?: number | null
  ceiling?: number | null
  listPrice: { strategy: 'keep' | 'same' }
  maxChangePercent?: number | null
  autoApply: boolean
}

export interface ChannelRule {
  id: string
  type: 'channel'
  name: string
  enabled: boolean
  version: number
  integrationCode: string
  scope: { productIds: string[]; barcodes: string[] }
  channel: ChannelParams
  updatedAt: string | null
}

export type ChannelBlock = 'cost_missing' | 'vat_missing' | 'commission_unknown' | 'base_price_missing' | 'margin_unreachable'
  | 'floor_above_ceiling' | 'non_positive' | 'change_too_large'

export interface ChannelPreviewRow {
  variantId: string
  barcode: string | null
  current: { salePrice: number | null; source: 'channel' | 'rule' | 'base' }
  result: { ok: true; salePrice: number; marketPrice: number; reasons: string[]; warnings: string[] } | { ok: false; blocked: ChannelBlock; reasons: string[] }
  changed: boolean
}

export interface ChannelPreview {
  rule: ChannelRule
  summary: { total: number; ok: number; changed: number; blocked: number }
  items: ChannelPreviewRow[]
}

export interface ChannelApplyOutcome { applied: number; unchanged: number; blocked: number; throttled: number; pending: number }

/** Form durumu: sayısal alanlar boş dize ile başlar (K4: varsayılan önerilmez). */
export interface ChannelRuleForm {
  id?: string
  name: string
  enabled: boolean
  integrationCode: ChannelRuleChannel | ''
  base: 'cost' | 'salePrice'
  marginPercent: string
  adjustPercent: string
  adjustAmount: string
  commissionSource: 'auto' | 'static'
  commissionRate: string
  cargoCost: string
  roundingStep: string
  roundingDirection: 'up' | 'down' | 'nearest'
  psychological: boolean
  floorMarginPercent: string
  ceiling: string
  listStrategy: 'keep' | 'same'
  maxChangePercent: string
  autoApply: boolean
  barcodes: string
}

export function emptyChannelForm(): ChannelRuleForm {
  return {
    name: '', enabled: false, integrationCode: '', base: 'cost', marginPercent: '', adjustPercent: '', adjustAmount: '',
    commissionSource: 'auto', commissionRate: '', cargoCost: '', roundingStep: '', roundingDirection: 'up', psychological: false,
    floorMarginPercent: '', ceiling: '', listStrategy: 'keep', maxChangePercent: '', autoApply: false, barcodes: '',
  }
}

const numOrNull = (s: string): number | null => {
  const t = String(s ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function channelFormFromRule(r: ChannelRule): ChannelRuleForm {
  const c = r.channel
  const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
  return {
    id: r.id, name: r.name, enabled: r.enabled, integrationCode: r.integrationCode as ChannelRuleChannel, base: c.base,
    marginPercent: s(c.marginPercent), adjustPercent: s(c.adjustPercent), adjustAmount: s(c.adjustAmount),
    commissionSource: c.commission.source, commissionRate: s(c.commission.rate), cargoCost: s(c.cargoCost),
    roundingStep: s(c.rounding.step), roundingDirection: c.rounding.direction, psychological: c.rounding.psychological,
    floorMarginPercent: s(c.floorMarginPercent), ceiling: s(c.ceiling), listStrategy: c.listPrice.strategy,
    maxChangePercent: s(c.maxChangePercent), autoApply: c.autoApply, barcodes: (r.scope.barcodes || []).join('\n'),
  }
}

/** Eksik zorunlu alanlar (sunucu yine doğrular; burada yalnız erken ipucu). */
export function channelFormMissing(f: ChannelRuleForm): string[] {
  const out: string[] = []
  if (!f.name.trim()) out.push('name')
  if (!f.integrationCode) out.push('integrationCode')
  if (f.base === 'cost' && numOrNull(f.marginPercent) === null) out.push('marginPercent')
  if (f.base === 'salePrice' && numOrNull(f.adjustPercent) === null && numOrNull(f.adjustAmount) === null) out.push('adjustPercent')
  if (f.commissionSource === 'static' && numOrNull(f.commissionRate) === null) out.push('commissionRate')
  if (numOrNull(f.cargoCost) === null) out.push('cargoCost')
  if (numOrNull(f.roundingStep) === null) out.push('roundingStep')
  return out
}

export function channelRuleRequest(f: ChannelRuleForm) {
  const barcodes = f.barcodes.split(/[\s,;]+/).map((b) => b.trim()).filter(Boolean)
  return {
    ...(f.id ? { id: f.id } : {}),
    type: 'channel' as const,
    name: f.name.trim(),
    enabled: f.enabled,
    integrationCode: f.integrationCode,
    ...(barcodes.length ? { scope: { barcodes } } : {}),
    channel: {
      base: f.base,
      marginPercent: f.base === 'cost' ? numOrNull(f.marginPercent) : null,
      adjustPercent: f.base === 'salePrice' ? numOrNull(f.adjustPercent) : null,
      adjustAmount: f.base === 'salePrice' ? numOrNull(f.adjustAmount) : null,
      commission: { source: f.commissionSource, rate: f.commissionSource === 'static' ? numOrNull(f.commissionRate) : null },
      cargoCost: numOrNull(f.cargoCost) ?? 0,
      rounding: { step: numOrNull(f.roundingStep) ?? 0.01, direction: f.roundingDirection, psychological: f.psychological },
      floorMarginPercent: numOrNull(f.floorMarginPercent),
      ceiling: numOrNull(f.ceiling),
      listPrice: { strategy: f.listStrategy },
      maxChangePercent: numOrNull(f.maxChangePercent),
      autoApply: f.autoApply,
    },
  }
}

/** Engel nedeni → kullanıcı metni (sade dil; ne yapmalı). */
export const CHANNEL_BLOCK_TEXT: Record<ChannelBlock, string> = {
  cost_missing: 'Maliyet girilmemiş — Maliyetler sekmesinden gir.',
  vat_missing: 'KDV oranı girilmemiş — ürün formunda KDV seç.',
  commission_unknown: 'Komisyon oranı bilinmiyor — kuralda sabit oran gir ya da komisyon tanımla.',
  base_price_missing: 'Ana satış fiyatı yok.',
  margin_unreachable: 'Bu komisyon/KDV ile hedef marja ulaşılamıyor — marjı düşür.',
  floor_above_ceiling: 'Taban fiyat tavandan yüksek — tavanı ya da taban marjını düzelt.',
  non_positive: 'Hesaplanan fiyat 0 ya da negatif.',
  change_too_large: 'Değişim sınırı aşıldı — otomatik uygulanmadı, elle onayla.',
}

export const PRICE_SOURCE_TEXT: Record<'channel' | 'rule' | 'base', string> = {
  channel: 'kanal özel fiyatı',
  rule: 'kanal fiyat kuralı',
  base: 'ana fiyat',
}

const isObj = (r: any) => !!r && typeof r === 'object'

export function useChannelRulesApi() {
  const restApi = useRestApi()
  return {
    async save(f: ChannelRuleForm): Promise<ApiResult<ChannelRule>> {
      return toResult<ChannelRule>(await restApi.post('PricingService/saveRule', channelRuleRequest(f)), (r) => isObj(r) && typeof r.id === 'string')
    },
    async preview(id: string, limit = 50): Promise<ApiResult<ChannelPreview>> {
      return toResult<ChannelPreview>(await restApi.post('PricingService/previewChannelRule', { id, limit }), (r) => isObj(r) && Array.isArray(r.items))
    },
    async apply(id: string, variantIds?: string[]): Promise<ApiResult<ChannelApplyOutcome>> {
      return toResult<ChannelApplyOutcome>(await restApi.post('PricingService/applyChannelRule', { id, ...(variantIds?.length ? { variantIds } : {}) }), (r) => isObj(r) && typeof r.applied === 'number')
    },
    async setAutoApply(enabled: boolean, on: boolean, acknowledged: boolean): Promise<ApiResult<unknown>> {
      return toResult(await restApi.post('PricingService/setPricingSettings', { enabled, channelAutoApply: on, ...(on ? { channelAutoApplyAcknowledged: acknowledged } : {}) }), (r) => isObj(r) && Array.isArray(r.rules))
    },
  }
}

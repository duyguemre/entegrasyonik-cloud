/**
 * frontend/src/composables/usePricingRulesApi.ts
 *
 * PRC-R2 — rekabet fiyat kuralı (B-10 `competition` tipi), KURU öneri ve İNSAN ONAYLI uygulama — müşteri uygulaması istemcisi.
 * Sözleşme tek kaynağı: `docs/PRICING_COMPETITION.md` §R2 (`PricingService/*`). Fiyatı SUNUCU hesaplar; bu dosya yalnız gösterir.
 * Hukuk (AUTO_PRICING_LEGAL): K1 fark > 0 (sunucu reddeder; burada yalnız erken ipucu), K4 form alanları BOŞ başlar (varsayılan yok),
 * K6 rakip/mağaza alanı YOK, K11 "indirim" dili yok ("fiyat güncellendi"). Otomatik uygulama YOK: uygulama yalnız onay penceresinden.
 *
 *  1. SAF yardımcılar (boş form, form → istek, K1 ipucu, seçim sınırı, neden/uyarı anahtarları, durum özeti) — `tests/prc-r2-pricing.test.ts`.
 *  2. `usePricingRulesApi()` — `restApi.post` çağrıları (RPC adları düz metin; operasyon envanteri taraması bunları okur).
 */
import useRestApi from '@/composables/restapi'
import { toResult, type ApiResult } from '@/composables/usePricingApi'

// ── Tipler (sözleşme §R2.5) ────────────────────────────────────────────────────────────────────────────────

export type RuleMode = 'below' | 'above'
export type PauseReason = 'external_change' | 'oscillation'
export type InactiveReason = 'platform_disabled' | 'tenant_disabled' | 'consent_required'

export interface CompetitionParams {
  mode: RuleMode
  deltaAmount: number | null
  deltaPercent: number | null
  floorMarginPercent: number
  ceiling: number
  step: number
  maxChangesPerDay: number
  cooldownMin: number
  maxIncreasePercentPerDay: number
  excludeIfOutOfStock: boolean
}

export interface PriceRule {
  id: string
  type: 'competition'
  name: string
  enabled: boolean
  version: number
  integrationCode: string
  scope: { productIds: string[]; barcodes: string[] }
  competition: CompetitionParams
  pausedReason: PauseReason | null
  pausedAt: string | null
  updatedAt: string | null
  suggestions: { open: number; blocked: number }
}

export interface PlatformLimits {
  maxIncreasePercentPerDay: number
  maxIncreasePercent30d: number
  maxChangesPerDay: number
  minCooldownMin: number
  maxDropPercent: number
}

export interface RulesState {
  channel: string
  platformEnabled: boolean
  competitionEnabled: boolean
  active: boolean
  inactiveReason: InactiveReason | null
  settings: { enabled: boolean; consent: { acceptedVersion: string | null; acceptedAt: string | null }; dualEngineAcknowledgedAt: string | null }
  consent: { version: string; draft: boolean; text: { tr: string; en: string } }
  dualEngineWarning: { tr: string; en: string }
  limits: PlatformLimits
  rules: PriceRule[]
}

export type SuggestionStatus = 'open' | 'blocked' | 'applied' | 'dismissed' | 'expired'

export interface Suggestion {
  id: string
  ruleId: string
  ruleVersion: number
  integrationCode: string
  variantId: string
  productId: string | null
  barcode: string
  sku: string | null
  status: SuggestionStatus
  beforePrice: number
  afterPrice: number | null
  listPrice: number | null
  floor: number | null
  ceiling: number | null
  profitBefore: number | null
  profitAfter: number | null
  buyboxPrice: number | null
  buyboxOrder: number | null
  buyboxObservedAt: string | null
  reasons: string[]
  warnings: string[]
  blockedReason: string | null
  closedReason: string | null
  createdAt: string | null
  updatedAt: string | null
  appliedAt: string | null
  lowestPrice10d: number | null
}

export interface SuggestionList {
  channel: string
  active: boolean
  inactiveReason: InactiveReason | null
  summary: { open: number; blocked: number }
  applyMax: number
  items: Suggestion[]
  nextCursor: string | null
}

export interface HistoryEntry {
  id: string
  at: string | null
  barcode: string | null
  variantId: string
  source: 'suggestion' | 'external'
  previousPrice: number | null
  salePrice: number
  listPrice: number | null
  ruleId: string | null
  ruleVersion: number | null
  suggestionId: string | null
  buyboxPrice: number | null
  buyboxObservedAt: string | null
  actor: string | null
}
export interface HistoryList { channel: string; items: HistoryEntry[]; nextCursor: string | null }

export interface ApplyOutcome {
  applied: Array<{ suggestionId: string; barcode: string; before: number; after: number }>
  rejected: Array<{ suggestionId: string; barcode: string | null; reason: string }>
  published: number
}

// ── K4: boş form (önerilen değer YOK) ────────────────────────────────────────────────────────────────────

/** Form modeli: sayısal alanlar boş (`null`) başlar; satıcı kendisi girer (K4). Yön de seçilmemiş gelir. */
export interface RuleForm {
  id?: string
  name: string
  enabled: boolean
  mode: RuleMode | null
  deltaAmount: number | null
  deltaPercent: number | null
  floorMarginPercent: number | null
  ceiling: number | null
  step: number | null
  maxChangesPerDay: number | null
  cooldownMin: number | null
  maxIncreasePercentPerDay: number | null
  excludeIfOutOfStock: boolean
  barcodes: string
}

export function emptyRuleForm(): RuleForm {
  return {
    name: '', enabled: false, mode: null, deltaAmount: null, deltaPercent: null, floorMarginPercent: null, ceiling: null, step: null,
    maxChangesPerDay: null, cooldownMin: null, maxIncreasePercentPerDay: null, excludeIfOutOfStock: false, barcodes: '',
  }
}

export function formFromRule(r: PriceRule): RuleForm {
  const c = r.competition
  return {
    id: r.id, name: r.name, enabled: r.enabled, mode: c.mode, deltaAmount: c.deltaAmount, deltaPercent: c.deltaPercent,
    floorMarginPercent: c.floorMarginPercent, ceiling: c.ceiling, step: c.step, maxChangesPerDay: c.maxChangesPerDay,
    cooldownMin: c.cooldownMin, maxIncreasePercentPerDay: c.maxIncreasePercentPerDay, excludeIfOutOfStock: c.excludeIfOutOfStock,
    barcodes: r.scope.barcodes.join(', '),
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d

export type FormError =
  | 'name' | 'mode' | 'delta_required' | 'k1_equalize' | 'floorMarginPercent' | 'ceiling' | 'step' | 'maxChangesPerDay' | 'cooldownMin'
  | 'maxIncreasePercentPerDay' | 'barcodes'

/** Erken (istemci) doğrulama — sunucu aynı kuralları ayrıca uygular. K1: 0 ya da 0'a yuvarlanan fark reddedilir. */
export function validateRuleForm(f: RuleForm, limits: PlatformLimits): FormError[] {
  const e: FormError[] = []
  if (!f.name.trim() || f.name.trim().length > 80) e.push('name')
  if (f.mode !== 'below' && f.mode !== 'above') e.push('mode')
  const a = num(f.deltaAmount), p = num(f.deltaPercent)
  if (a === null && p === null) e.push('delta_required')
  else if ((a !== null && round(a, 2) < 0.01) || (p !== null && round(p, 1) < 0.1)) e.push('k1_equalize')
  const fm = num(f.floorMarginPercent)
  if (fm === null || fm < 0 || fm > 90) e.push('floorMarginPercent')
  const ce = num(f.ceiling)
  if (ce === null || ce <= 0) e.push('ceiling')
  const st = num(f.step)
  if (st === null || round(st, 2) < 0.01 || st > 1000) e.push('step')
  const mc = num(f.maxChangesPerDay)
  if (mc === null || !Number.isInteger(mc) || mc < 1 || mc > limits.maxChangesPerDay) e.push('maxChangesPerDay')
  const cd = num(f.cooldownMin)
  if (cd === null || !Number.isInteger(cd) || cd < limits.minCooldownMin || cd > 1440) e.push('cooldownMin')
  const mi = num(f.maxIncreasePercentPerDay)
  if (mi === null || mi < 0 || mi > limits.maxIncreasePercentPerDay) e.push('maxIncreasePercentPerDay')
  if (parseBarcodes(f.barcodes).length > 500) e.push('barcodes')
  return e
}

export function parseBarcodes(s: string): string[] {
  return [...new Set(s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x.length > 0 && x.length <= 128))]
}

/** Form → `PricingService/saveRule` gövdesi. YALNIZ şemadaki alanlar (rakip/mağaza alanı yok — K6). */
export function ruleRequest(f: RuleForm) {
  const barcodes = parseBarcodes(f.barcodes)
  return {
    ...(f.id ? { id: f.id } : {}),
    name: f.name.trim(),
    enabled: f.enabled,
    integrationCode: 'trendyol' as const,
    ...(barcodes.length ? { scope: { barcodes } } : {}),
    competition: {
      mode: f.mode as RuleMode,
      deltaAmount: num(f.deltaAmount),
      deltaPercent: num(f.deltaPercent),
      floorMarginPercent: num(f.floorMarginPercent) as number,
      ceiling: num(f.ceiling) as number,
      step: num(f.step) as number,
      maxChangesPerDay: num(f.maxChangesPerDay) as number,
      cooldownMin: num(f.cooldownMin) as number,
      maxIncreasePercentPerDay: num(f.maxIncreasePercentPerDay) as number,
      excludeIfOutOfStock: f.excludeIfOutOfStock,
    },
  }
}

// ── Seçim ve önizleme ───────────────────────────────────────────────────────────────────────────────────

/** Toplu onay seçimi: yalnız `open` öneriler, en çok `max` (sunucu sınırı 50). */
export function selectableIds(items: ReadonlyArray<Suggestion>, selected: ReadonlyArray<string>, max: number): string[] {
  const open = new Set(items.filter((s) => s.status === 'open').map((s) => s.id))
  return selected.filter((id) => open.has(id)).slice(0, max)
}

export interface PreviewRow { id: string; barcode: string; sku: string | null; before: number; after: number; change: number; changePercent: number; warnings: string[] }

/** Onay penceresi önizlemesi (önce → sonra, değişim). Fiyatlar sunucudan; burada hesaplama yalnız gösterim farkıdır. */
export function previewRows(items: ReadonlyArray<Suggestion>, ids: ReadonlyArray<string>): PreviewRow[] {
  const byId = new Map(items.map((s) => [s.id, s]))
  return ids.flatMap((id) => {
    const s = byId.get(id)
    if (!s || s.afterPrice === null) return []
    const change = round(s.afterPrice - s.beforePrice, 2)
    return [{ id, barcode: s.barcode, sku: s.sku, before: s.beforePrice, after: s.afterPrice, change, changePercent: s.beforePrice > 0 ? round((change / s.beforePrice) * 100, 1) : 0, warnings: s.warnings }]
  })
}

/** Neden/uyarı/ret kodu → i18n anahtarı (bilinmeyen kod genel metne düşer; ham kod gösterilmez). */
const KNOWN_REASONS = new Set([
  'cost_missing', 'vat_missing', 'commission_unknown', 'floor_unreachable', 'below_floor', 'above_ceiling', 'above_list_price',
  'discount_display_active', 'increase_limit', 'equalize_forbidden', 'stale_data', 'price_changed', 'suggestion_changed', 'rule_changed',
  'rule_disabled', 'rule_paused', 'not_found', 'cooldown', 'daily_limit', 'awaiting_publish', 'already_winning', 'no_buybox', 'out_of_stock',
  'variant_not_found', 'duplicate_variant', 'no_change',
])
export function reasonKey(code: string | null | undefined): string {
  if (!code) return 'pricingRules.reason.unknown'
  if (code.startsWith('fuse_')) return 'pricingRules.reason.fuse'
  if (code.startsWith('not_open_')) return 'pricingRules.reason.not_open'
  if (code.startsWith('rule_paused_')) return 'pricingRules.reason.rule_paused'
  return KNOWN_REASONS.has(code) ? `pricingRules.reason.${code}` : 'pricingRules.reason.unknown'
}
const KNOWN_WARNINGS = new Set(['discount_display_active', 'increase_capped', 'ceiling_applied', 'extra_step_k1', 'partial_deductions'])
export function warningKey(code: string): string { return KNOWN_WARNINGS.has(code) ? `pricingRules.warning.${code}` : 'pricingRules.warning.unknown' }

/** Ekranın üst durum bandı: ne yapılmalı (platform kapalı → bekle; tenant kapalı/metin → aç; buybox verisi kapalı → bilgi). */
export type StateBanner = 'platform_off' | 'competition_off' | 'needs_enable' | 'needs_consent' | 'active'
export function stateBanner(s: Pick<RulesState, 'platformEnabled' | 'competitionEnabled' | 'active' | 'inactiveReason'>): StateBanner {
  if (!s.platformEnabled) return 'platform_off'
  if (s.inactiveReason === 'consent_required') return 'needs_consent'
  if (!s.active) return 'needs_enable'
  if (!s.competitionEnabled) return 'competition_off'
  return 'active'
}

// ── API ────────────────────────────────────────────────────────────────────────────────────────────────

const isObj = (r: any) => !!r && typeof r === 'object'

export function usePricingRulesApi() {
  const restApi = useRestApi()
  return {
    async getRules(): Promise<ApiResult<RulesState>> {
      return toResult<RulesState>(await restApi.post('PricingService/getRules', {}), (r) => isObj(r) && Array.isArray(r.rules))
    },
    async saveRule(f: RuleForm): Promise<ApiResult<PriceRule>> {
      return toResult<PriceRule>(await restApi.post('PricingService/saveRule', ruleRequest(f)), (r) => isObj(r) && typeof r.id === 'string')
    },
    async deleteRule(id: string): Promise<ApiResult<{ deleted: boolean }>> {
      return toResult(await restApi.post('PricingService/deleteRule', { id }), (r) => isObj(r) && r.deleted === true)
    },
    async setSettings(body: { enabled: boolean; consentVersion?: string; dualEngineAcknowledged?: boolean }): Promise<ApiResult<RulesState>> {
      return toResult<RulesState>(await restApi.post('PricingService/setPricingSettings', body), (r) => isObj(r) && Array.isArray(r.rules))
    },
    async listSuggestions(body: { status?: SuggestionStatus; ruleId?: string; buyboxLostOnly?: boolean; limit?: number; cursor?: string }): Promise<ApiResult<SuggestionList>> {
      return toResult<SuggestionList>(await restApi.post('PricingService/listSuggestions', body), (r) => isObj(r) && Array.isArray(r.items))
    },
    async getHistory(body: { barcode?: string; days?: number; limit?: number; cursor?: string }): Promise<ApiResult<HistoryList>> {
      return toResult<HistoryList>(await restApi.post('PricingService/getPriceHistory', body), (r) => isObj(r) && Array.isArray(r.items))
    },
    async apply(ids: string[]): Promise<ApiResult<ApplyOutcome>> {
      return toResult<ApplyOutcome>(await restApi.post('PricingService/applySuggestions', { suggestionIds: ids }), (r) => isObj(r) && Array.isArray(r.applied))
    },
    async dismiss(ids: string[]): Promise<ApiResult<{ dismissed: number }>> {
      return toResult(await restApi.post('PricingService/dismissSuggestions', { suggestionIds: ids }), (r) => isObj(r) && typeof r.dismissed === 'number')
    },
  }
}

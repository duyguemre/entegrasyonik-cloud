/**
 * Rekabet ayarları ekranının SAF mantığı (DOM/ağ yok; tests/competition.test.ts). Metinler Türkçe; sınırlar sunucudan
 * (`limits`) gelir, burada sabit sınır yoktur. Sunucu doğrulaması yetkilidir; buradaki denetim yalnız erken geri bildirimdir.
 */
import type {
  CompetitionField,
  CompetitionLimits,
  CompetitionOverride,
  CompetitionPlanCode,
  CompetitionPriority,
  ConfigRevision,
  EffectiveCompetition,
} from '@bo/api/contract'

export const PLAN_ORDER: CompetitionPlanCode[] = ['starter', 'growth', 'enterprise']
export const PLAN_NAME: Record<CompetitionPlanCode, string> = { starter: 'Başlangıç', growth: 'Büyüme', enterprise: 'Kurumsal' }
export const FIELD_LABEL: Record<CompetitionField, string> = {
  skuCap: 'SKU tavanı',
  refreshMin: 'Tazeleme aralığı',
  freshnessMin: 'Tazelik eşiği',
  priority: 'Öncelik politikası',
}
export const FIELD_UNIT: Record<CompetitionField, string> = { skuCap: 'SKU', refreshMin: 'dk', freshnessMin: 'dk', priority: '' }
export const FIELDS: CompetitionField[] = ['skuCap', 'refreshMin', 'freshnessMin', 'priority']
export const NUMERIC_FIELDS = ['skuCap', 'refreshMin', 'freshnessMin'] as const
export type NumericField = (typeof NUMERIC_FIELDS)[number]

export const PRIORITY_LABEL: Record<CompetitionPriority, string> = {
  changed_first: 'Değişen önce',
  stocked_only: 'Yalnız stoklu',
  oldest_first: 'En eski önce',
}
export const PRIORITY_HELP: Record<CompetitionPriority, string> = {
  changed_first: 'Son 24 saatte buybox durumu değişen, sonra stoklu, sonra en eski gözlem.',
  stocked_only: 'Yalnız stokta olan SKU’lar (en eski gözlem önce).',
  oldest_first: 'Yalnız en eski gözlem önce.',
}
export const priorityLabel = (p: string | undefined) => (p && p in PRIORITY_LABEL ? PRIORITY_LABEL[p as CompetitionPriority] : (p ?? '—'))

export const FLAG_KEY = 'features.competition'
export const FLAG_TENANTS_KEY = 'features.competition.tenants'
export const BUDGET_KEY = 'pricing.buybox.budget.trendyol.perMin'
export const SHADOW_KEY = 'pricing.buybox.notify.shadow'
export const PRICING_GROUP = 'platform.pricing'

const nf = new Intl.NumberFormat('tr-TR')
export const fmtInt = (n: number) => nf.format(n)

/** 360 dk → "günde 4", 30 dk → "günde 48", 1440 → "günde 1", 1000 → "günde ~1,4". */
export function refreshHint(min: number | null | undefined): string {
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return ''
  const perDay = 1440 / min
  return Number.isInteger(perDay) ? `günde ${perDay}` : `günde ~${(Math.round(perDay * 10) / 10).toLocaleString('tr-TR')}`
}

/** Sayısal alan denetimi (tam sayı + sunucu sınırı). `null`/boş → "boş" mesajı çağıran tarafından ele alınır. */
export function validateInt(label: string, value: unknown, range: { min: number; max: number }): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return `${label}: tam sayı girin (${fmtInt(range.min)}–${fmtInt(range.max)}).`
  if (value < range.min || value > range.max) return `${label}: ${fmtInt(range.min)}–${fmtInt(range.max)} arasında olmalı.`
  return null
}

// ------------------------------------------------------------------ plan tablosu
export interface PlanTableChange {
  key: string
  plan: CompetitionPlanCode
  field: CompetitionField
  from: unknown
  to: unknown
}

/** Plan tablosundaki anahtarları (`pricing.buybox.plan.<plan>.<alan>`) ayrıştırır; plan dışı anahtar → null. */
export function parsePlanKey(key: string): { plan: CompetitionPlanCode; field: CompetitionField } | null {
  const m = /^pricing\.buybox\.plan\.(starter|growth|enterprise)\.(skuCap|refreshMin|freshnessMin|priority)$/.exec(key)
  return m ? { plan: m[1] as CompetitionPlanCode, field: m[2] as CompetitionField } : null
}

/** Yayındaki değerlere göre formda değişen plan hücreleri (taslak yamasının plan kısmı). */
export function planTableChanges(published: Record<string, unknown>, form: Record<string, unknown>): PlanTableChange[] {
  const out: PlanTableChange[] = []
  for (const key of Object.keys(form)) {
    const p = parsePlanKey(key)
    if (!p) continue
    if (JSON.stringify(form[key]) !== JSON.stringify(published[key])) out.push({ key, ...p, from: published[key], to: form[key] })
  }
  return out.sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan) || FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field))
}

/** İstemci tarafı erken denetim: anahtar → mesaj. Yalnız bu ekranın (rekabet) anahtarları. */
export function validatePricingForm(form: Record<string, unknown>, limits: CompetitionLimits, priorities: readonly string[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of Object.keys(form)) {
    const p = parsePlanKey(key)
    if (p) {
      const label = `${PLAN_NAME[p.plan]} · ${FIELD_LABEL[p.field]}`
      if (p.field === 'priority') {
        if (!priorities.includes(form[key] as string)) errors[key] = `${label}: listeden bir politika seçin.`
      } else {
        const e = validateInt(label, form[key], limits[p.field])
        if (e) errors[key] = e
      }
    } else if (key === BUDGET_KEY) {
      const e = validateInt('Trendyol bütçesi', form[key], limits.budgetPerMin)
      if (e) errors[key] = e
    }
  }
  return errors
}

// ------------------------------------------------------------------ tenant istisnası
export interface OverrideDraft {
  skuCap: string
  refreshMin: string
  freshnessMin: string
  priority: '' | CompetitionPriority
  note: string
}
export const emptyOverrideDraft = (): OverrideDraft => ({ skuCap: '', refreshMin: '', freshnessMin: '', priority: '', note: '' })
export function draftFromOverride(o: CompetitionOverride | null | undefined, note: string | null | undefined): OverrideDraft {
  return {
    skuCap: o?.skuCap !== undefined ? String(o.skuCap) : '',
    refreshMin: o?.refreshMin !== undefined ? String(o.refreshMin) : '',
    freshnessMin: o?.freshnessMin !== undefined ? String(o.freshnessMin) : '',
    priority: o?.priority ?? '',
    note: note ?? '',
  }
}

export interface OverrideCheck {
  errors: Partial<Record<CompetitionField | 'note', string>>
  /** Dolu alanlardan oluşan istisna; boş alan plan değerine bırakılır. */
  override: CompetitionOverride
  /** Hiç alan dolu değil: kaydetmek istisnayı kaldırmakla aynıdır. */
  isEmpty: boolean
  valid: boolean
}

export function checkOverrideDraft(draft: OverrideDraft, limits: CompetitionLimits, priorities: readonly string[]): OverrideCheck {
  const errors: OverrideCheck['errors'] = {}
  const override: CompetitionOverride = {}
  for (const f of NUMERIC_FIELDS) {
    const raw = draft[f].trim()
    if (!raw) continue
    if (!/^\d+$/.test(raw)) {
      errors[f] = `${FIELD_LABEL[f]}: tam sayı girin ya da plan değeri için boş bırakın.`
      continue
    }
    const n = Number(raw)
    const e = validateInt(FIELD_LABEL[f], n, limits[f])
    if (e) errors[f] = e
    else override[f] = n
  }
  if (draft.priority) {
    if (priorities.includes(draft.priority)) override.priority = draft.priority
    else errors.priority = 'Öncelik politikası: listeden seçin.'
  }
  if (draft.note.length > 280) errors.note = 'Not en çok 280 karakter olabilir.'
  return { errors, override, isEmpty: Object.keys(override).length === 0, valid: Object.keys(errors).length === 0 }
}

export function formatFieldValue(field: CompetitionField, value: number | string | undefined): string {
  if (value === undefined) return '—'
  if (field === 'priority') return priorityLabel(String(value))
  const unit = FIELD_UNIT[field]
  return `${fmtInt(Number(value))}${unit ? ' ' + unit : ''}`
}

/** İstisna alanları → "SKU tavanı 2.500 SKU" listesi (boş istisna → []). */
export function describeOverride(o: CompetitionOverride): Array<{ field: CompetitionField; label: string; value: string }> {
  return FIELDS.filter((f) => o[f] !== undefined).map((f) => ({ field: f, label: FIELD_LABEL[f], value: formatFieldValue(f, o[f]) }))
}

export interface BeforeAfterRow {
  field: CompetitionField
  label: string
  before: string
  after: string
  changed: boolean
}
/** Kayıt sonrası önce/sonra özeti: istisna alanı yoksa "plan değeri" yazar; `effective` etkin değeri ekler. */
export function beforeAfterRows(before: CompetitionOverride, after: CompetitionOverride, effective: EffectiveCompetition): BeforeAfterRow[] {
  const show = (o: CompetitionOverride, f: CompetitionField) => (o[f] !== undefined ? formatFieldValue(f, o[f]) : 'plan değeri')
  return FIELDS.map((f) => ({
    field: f,
    label: FIELD_LABEL[f],
    before: show(before, f),
    after: afterText(after, f, effective),
    changed: before[f] !== after[f],
  }))
}
function afterText(after: CompetitionOverride, f: CompetitionField, effective: EffectiveCompetition): string {
  return after[f] !== undefined ? formatFieldValue(f, after[f]) : `plan değeri (${formatFieldValue(f, effective[f])})`
}

// ------------------------------------------------------------------ durum ve dikkat
export interface CompetitionStatus {
  enabled: boolean
  pilotTenants: string[]
  budget: number | null
  shadow: boolean | null
  overrideCount: number
}

/** Bütçe uyarı eşikleri (sezgisel; Trendyol ~1000/dk sınırı satıcı hesabının diğer çağrılarıyla paylaşılır). */
export const BUDGET_LOW = 20
export const BUDGET_HIGH = 300
export const SHADOW_LONG_DAYS = 14

export interface Attention {
  id: string
  tone: 'warning' | 'info'
  title: string
  text: string
}

/** Bayrak en son ne zaman açıldı? Yayın geçmişinde `features.competition` → true olan en yeni sürümün zamanı. */
export function flagOnSince(history: ConfigRevision[]): number | null {
  const hit = [...history]
    .filter((r) => r.publishedAt && r.diff?.some((d) => d.key === FLAG_KEY && d.to === true))
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))[0]
  return hit?.publishedAt ? Date.parse(hit.publishedAt) : null
}

export function competitionAttention(s: CompetitionStatus, flagSince: number | null, now: number): Attention[] {
  const out: Attention[] = []
  if (s.enabled && s.budget !== null && s.budget < BUDGET_LOW) {
    out.push({
      id: 'budget-low',
      tone: 'warning',
      title: `Trendyol bütçesi çok düşük: dakikada ${fmtInt(s.budget)} istek`,
      text: 'Bütçe dolunca tazelemeler ertelenir; müşteriler “gecikmeli” görür. Pilot tenant sayısına göre bütçeyi artırmayı düşünün.',
    })
  }
  if (s.enabled && s.budget !== null && s.budget > BUDGET_HIGH) {
    out.push({
      id: 'budget-high',
      tone: 'warning',
      title: `Trendyol bütçesi yüksek: dakikada ${fmtInt(s.budget)} istek`,
      text: 'Trendyol sınırı (~1.000/dk) satıcı hesabındaki sipariş ve stok çağrılarıyla paylaşılır. Gerçek tüketimi izlemeden yükseltmeyin.',
    })
  }
  if (s.enabled && s.shadow === true && flagSince !== null) {
    const days = Math.floor((now - flagSince) / 86_400_000)
    if (days >= SHADOW_LONG_DAYS) {
      out.push({
        id: 'shadow-long',
        tone: 'warning',
        title: `Bildirim gölge modu ${fmtInt(days)} gündür açık`,
        text: 'Gölge modda “buybox kaybedildi” bildirimi yalnız deftere yazılır, müşteriye ulaşmaz. Gerçek veriyle doğrulandıysa kapatın; değilse neyin beklendiğini kayda geçirin.',
      })
    }
  }
  if (!s.enabled && s.overrideCount > 0) {
    out.push({
      id: 'overrides-idle',
      tone: 'info',
      title: `${fmtInt(s.overrideCount)} tenant istisnası var ama özellik kapalı`,
      text: 'İstisnalar kayıtlı kalır; özellik açılana kadar etkisi yoktur.',
    })
  }
  return out
}

/** `tid` sorgu parametresi: yalnız pozitif tam sayı (diyalog kendiliğinden açılır). */
export function parseTidParam(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v
  if (typeof s !== 'string' || !/^\d{1,12}$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

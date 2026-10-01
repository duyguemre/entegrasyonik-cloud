/**
 * Sahte `_platform` kataloğunun rekabet bölümü (PRC-CFG): backend `integration/config/catalog/pricing.ts` (14 anahtar, grup
 * `platform.pricing`) + `features.competition` bayrağı (`features.ts`). Alan sınırları/varsayılanlar backend ile birebir.
 */
import type { CatalogItem } from '../../contract'

const T = (tr: string, en: string) => ({ tr, en })
const base = {
  scope: 'platform' as const, applies: 'immediate' as const, overridable: true, exposure: null, since: '2026-10-01', advanced: false,
  envLock: null, tenantOverridable: null, deprecated: null, impact: null,
}

export const PLAN_CODES = ['starter', 'growth', 'enterprise'] as const
export const PLAN_LABEL: Record<(typeof PLAN_CODES)[number], string> = { starter: 'Başlangıç', growth: 'Büyüme', enterprise: 'Kurumsal' }
export const PLAN_DEFAULTS = {
  starter: { skuCap: 100, refreshMin: 360, freshnessMin: 30, priority: 'changed_first' },
  growth: { skuCap: 1000, refreshMin: 30, freshnessMin: 30, priority: 'changed_first' },
  enterprise: { skuCap: 5000, refreshMin: 30, freshnessMin: 30, priority: 'changed_first' },
} as const
export const COMPETITION_LIMITS = {
  skuCap: { min: 0, max: 50_000 },
  refreshMin: { min: 15, max: 1440 },
  freshnessMin: { min: 5, max: 1440 },
  budgetPerMin: { min: 1, max: 1000 },
} as const
export const PRIORITIES = ['changed_first', 'stocked_only', 'oldest_first'] as const
export const planKey = (plan: string, field: string) => `pricing.buybox.plan.${plan}.${field}`
export const BUDGET_KEY = 'pricing.buybox.budget.trendyol.perMin'
export const SHADOW_KEY = 'pricing.buybox.notify.shadow'

function planItems(plan: (typeof PLAN_CODES)[number]): CatalogItem[] {
  const d = PLAN_DEFAULTS[plan]
  const L = PLAN_LABEL[plan]
  const pricing = { ...base, group: 'platform.pricing', danger: 'safe' as const }
  return [
    { ...pricing, key: planKey(plan, 'skuCap'), type: 'int', unit: 'count', default: d.skuCap, safeRange: COMPETITION_LIMITS.skuCap, label: T(`${L}: izlenen SKU tavanı`, `${plan}: tracked SKU cap`), help: T("Bu plandaki bir tenant için buybox'ı izlenen en fazla barkod sayısı. 0 = izleme kapalı.", 'Maximum barcodes tracked per tenant. 0 = off.') },
    { ...pricing, key: planKey(plan, 'refreshMin'), type: 'int', unit: 'min', default: d.refreshMin, safeRange: COMPETITION_LIMITS.refreshMin, label: T(`${L}: tazeleme aralığı`, `${plan}: refresh interval`), help: T('Bir barkodun buybox bilgisi en erken bu kadar dakikada bir yeniden okunur (360 dk = günde 4). Bütçe doluysa okuma ertelenir.', 'Re-read at most this often.') },
    { ...pricing, key: planKey(plan, 'freshnessMin'), type: 'int', unit: 'min', default: d.freshnessMin, safeRange: COMPETITION_LIMITS.freshnessMin, label: T(`${L}: veri tazelik eşiği`, `${plan}: data freshness threshold`), help: T('Bu süreden eski gözlem ekranda "eski veri" etiketi alır; bildirim ve öneri üretmez.', 'Older observations are labelled stale.') },
    { ...pricing, key: planKey(plan, 'priority'), type: 'enum', default: d.priority, safeRange: null, label: T(`${L}: öncelik politikası`, `${plan}: priority policy`), help: T('changed_first: buybox değişen önce. stocked_only: yalnız stoklu SKU. oldest_first: en eski gözlem önce.', 'Priority policy.') },
  ]
}

export const COMPETITION_CATALOG: CatalogItem[] = [
  ...PLAN_CODES.flatMap(planItems),
  { ...base, group: 'platform.pricing', danger: 'caution', key: BUDGET_KEY, type: 'int', unit: 'perMin', default: 60, safeRange: COMPETITION_LIMITS.budgetPerMin, label: T('Trendyol buybox çağrı bütçesi (dakika)', 'Trendyol buybox call budget (per minute)'), help: T("Tüm tenant'lar için dakikada en fazla buybox isteği (istek başına ≤10 barkod). Trendyol sınırı ~1000/dk ve satıcı hesabındaki diğer çağrılarla paylaşılır; güvenli düşük başlangıç 60.", 'Per-minute budget.'), impact: T('Yüksek değer pazaryeri kotasını tüketip sipariş/stok çağrılarını yavaşlatabilir.', 'A high value can consume the marketplace quota.') },
  { ...base, group: 'platform.pricing', danger: 'safe', key: SHADOW_KEY, type: 'bool', default: true, safeRange: null, label: T('"Buybox kaybedildi" bildirimi gölge modda', '"Buybox lost" notification in shadow mode'), help: T('Açıkken olay yalnız deftere yazılır (kullanıcıya gitmez). Gerçek veriyle doğrulama bitince kapatın.', 'Ledger only while on.') },
]

/** `features.competition` (+ `.tenants`): backend `features.ts` kataloğunda gerçek bayrak (varsayılan kapalı). */
export const COMPETITION_FLAGS: CatalogItem[] = [
  { ...base, group: 'platform.features', danger: 'safe', key: 'features.competition', type: 'bool', default: false, safeRange: null, label: T('Rekabet (buybox görünürlüğü)', 'Competition (buybox visibility)'), help: T("Açıkken Trendyol buybox bilgisi zamanlanmış olarak okunur (salt okuma). Tenant listesi doluysa yalnız o tenant'lar (pilot).", 'Read-only buybox reads on a schedule.') },
  { ...base, group: 'platform.features', danger: 'safe', key: 'features.competition.tenants', type: 'stringList', default: [], safeRange: null, label: T('Rekabet (buybox görünürlüğü) — tenant listesi', 'Competition — tenant list'), help: T('Boşsa bayrak herkes için geçerlidir; doluysa yalnız listedeki tenant numaraları için.', 'Empty: everyone.') },
]

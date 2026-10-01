/**
 * Plan/fiyat verisi (ADR-0014 Karar 2 "Fiyat verisi", ADR-0008 `Plans` modeli).
 *
 * TEK DOĞRULUK KAYNAĞI: `backend/src/database/application/seed/plans.seed.json` (S4a). Site bu dosyayı DERLEME
 * ZAMANINDA doğrudan içe aktarır (kök-göreli yol, dosya repo içinde → `site/` backend çalıştırılmadan derlenir);
 * backend `npm run seed:plans` aynı dosyadan DB'ye yazar. Fiyat/limit/KDV/deneme değeri BU dosyada üretilmez.
 *
 * ÖNERİ — insan kararı bekliyor (ADR-0014 Açık Soru 1): seed `_meta.status` "ÖNERİ" ile başladıkça sayfalar taslak
 * bandında "fiyatlar öneridir" göstermelidir (`getPlanSourceNotice()`). Seed'de OLMAYAN değer (yıllık fiyat, KDV dahil
 * tutar) UYDURULMAZ: yıllık seçenek gösterilmez; KDV dahil tutar hesaplanmaz (oran yalnızca öneri).
 *
 * Fiyatlar kuruş (`priceMinor`) tamsayıdır; `priceMinor === 0` -> "Özel teklif" (uygulamadaki T6 davranışıyla aynı).
 * Seçici arayüzü (`getPublicPlans` vb.) S1'den beri değişmedi; yalnızca kaynak fixture'dan seed'e geçti.
 */
import planSeed from '../../../backend/src/database/application/seed/plans.seed.json'
import { PATHS, ROADMAP_VISIBLE, evidence, type EvidenceRef } from './evidence'
import { capabilityState, type FeatureState } from './capabilities'

export const PLAN_SEED_PATH = 'backend/src/database/application/seed/plans.seed.json'
export const TRIAL_IMPL_PATH = 'backend/src/operations/tenant/trialSubscription.ts'

export const PROPOSAL_NOTICE = 'ÖNERİ — insan kararı bekliyor (ADR-0014 Açık Soru 1)'

export type BillingInterval = 'month' | 'year'
export type PlanFeatureCode = 'erp' | 'einvoice' | 'shipping' | 'mcp' | 'desktopApp'

/** `null` = plan sabitlemez (Kurumsal: `limitOverrides`). */
export interface PlanLimits {
  channels: number | null
  skus: number | null
  users: number | null
  mcpCallsPerDay: number | null
}

/** ADR-0008 `Plans` koleksiyonu şekli (site için gerekli alt küme). */
export interface PlanRecord {
  code: string
  name: string
  tagline: string
  version: number
  interval: BillingInterval
  priceMinor: number
  currency: 'TRY'
  vatIncluded: boolean
  limits: PlanLimits
  features: PlanFeatureCode[]
  active: boolean
  public: boolean
  /** Fiyat/limitler öneri mi (insan kararı bekliyor)? */
  proposal: boolean
  evidence: EvidenceRef[]
  /** Görünür DEĞİL. */
  internalNotes: string[]
}

export interface SeedTrial {
  planCode: string
  days: number
  cardRequired: boolean
}

export interface SeedVat {
  ratePercent: number
  /** ÖNERİ ile başlıyorsa oran nihai değildir. */
  proposal: boolean
}

export interface PlanSource {
  kind: 'seed'
  /** true ise değerler ÖNERİDİR; sayfalar "fiyatlar öneridir" göstermelidir. */
  proposal: boolean
  readPlans(): PlanRecord[]
  /** Seed `trial` bloğu (yoksa `undefined`). */
  trial?: SeedTrial
  /** Seed `vat` bloğu (yoksa `undefined`). */
  vat?: SeedVat
}

// ---------------------------------------------------------------------------- SEED OKUYUCU

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Plan başına tanıtım metni (KOPYA — fiyat/limit/olgu içermez; seed'de metin alanı yok). Kod seed'de olup burada
 * olmayan plan derlemeyi kırmaz (boş slogan).
 */
const PLAN_TAGLINES: Record<string, string> = {
  starter: 'İlk pazaryeri kanallarını tek panelde toplamak isteyen küçük ekipler için.',
  growth: 'Birden fazla kanalda büyüyen ve daha fazla ürün yöneten satıcılar için.',
  enterprise: 'Özel limitler ve ihtiyaçlar için size özel teklif hazırlıyoruz.',
}

const FEATURE_CODES: PlanFeatureCode[] = ['erp', 'einvoice', 'shipping', 'mcp', 'desktopApp']

/**
 * Seed JSON'unu (`{ _meta, trial, vat, plans[] }` ya da yalnızca `plans[]` dizisi) `PlanSource`'a çevirir.
 * Doğrulama sıkıdır: bilinmeyen özellik kodu, negatif/kesirli fiyat veya eksik alan derlemeyi kırar
 * (sessizce yanlış fiyat göstermek yerine).
 */
export function createSeedPlanSource(raw: unknown, opts: { proposal?: boolean } = {}): PlanSource {
  const doc = isRecord(raw) && !Array.isArray(raw) ? raw : undefined
  const list = Array.isArray(raw) ? raw : doc?.plans
  if (!Array.isArray(list)) throw new Error('Plan seed: dizi (veya { plans: [...] }) bekleniyordu')

  const meta = doc && isRecord(doc._meta) ? doc._meta : undefined
  const metaStatus = typeof meta?.status === 'string' ? meta.status : ''
  const proposal = opts.proposal ?? metaStatus.trimStart().startsWith('ÖNERİ')

  const plans = list.map((r, i): PlanRecord => {
    if (!isRecord(r)) throw new Error(`Plan seed[${i}]: nesne bekleniyordu`)
    const limits = isRecord(r.limits) ? r.limits : {}
    // 0 = plan sabitlemez (Kurumsal `limitOverrides`) → "Özel limit"
    const lim = (k: string): number | null => (typeof limits[k] === 'number' && (limits[k] as number) > 0 ? (limits[k] as number) : null)
    const features = Array.isArray(r.features) ? (r.features as unknown[]) : []
    for (const f of features) if (!FEATURE_CODES.includes(f as PlanFeatureCode)) throw new Error(`Plan seed[${i}]: bilinmeyen özellik "${String(f)}"`)
    if (typeof r.code !== 'string' || typeof r.name !== 'string') throw new Error(`Plan seed[${i}]: code/name eksik`)
    if (!Number.isInteger(r.priceMinor) || (r.priceMinor as number) < 0) throw new Error(`Plan seed[${i}]: priceMinor kuruş tamsayısı olmalı`)
    return {
      code: r.code,
      name: r.name,
      tagline: PLAN_TAGLINES[r.code] ?? '',
      version: typeof r.version === 'number' ? r.version : 1,
      interval: r.interval === 'year' ? 'year' : 'month',
      priceMinor: r.priceMinor as number,
      currency: 'TRY',
      vatIncluded: r.vatIncluded === true,
      limits: { channels: lim('channels'), skus: lim('skus'), users: lim('users'), mcpCallsPerDay: lim('mcpCallsPerDay') },
      features: features as PlanFeatureCode[],
      active: r.active !== false,
      public: r.public === true,
      proposal,
      evidence: [evidence(PLAN_SEED_PATH, 'Plans seed (fiyat/limit tek doğruluk kaynağı)', `"code": "${r.code}"`)],
      internalNotes: Array.isArray(r.featureNotes) ? (r.featureNotes as unknown[]).filter((n): n is string => typeof n === 'string') : [],
    }
  })

  const t = doc && isRecord(doc.trial) ? doc.trial : undefined
  const trial: SeedTrial | undefined =
    t && typeof t.planCode === 'string' && typeof t.days === 'number' && typeof t.cardRequired === 'boolean'
      ? { planCode: t.planCode, days: t.days, cardRequired: t.cardRequired }
      : undefined
  const v = doc && isRecord(doc.vat) ? doc.vat : undefined
  const vat: SeedVat | undefined =
    v && typeof v.ratePercent === 'number'
      ? { ratePercent: v.ratePercent, proposal: typeof v.status === 'string' && v.status.trimStart().startsWith('ÖNERİ') }
      : undefined

  return { kind: 'seed', proposal, readPlans: () => plans, trial, vat }
}

/** Varsayılan kaynak: repo içindeki `plans.seed.json` (derleme zamanında içe aktarılır). */
export const defaultPlanSource: PlanSource = createSeedPlanSource(planSeed)

// ---------------------------------------------------------------------------- Görünüm

const FEATURE_CATALOG: Record<PlanFeatureCode, { label: string; capabilityId: string }> = {
  erp: { label: 'ERP bağlantısı (Bizimhesap, yalnızca okuma)', capabilityId: 'erp-read' },
  einvoice: { label: 'E-fatura entegrasyonu', capabilityId: 'einvoice-provider' },
  shipping: { label: 'Kargo firması entegrasyonu', capabilityId: 'carrier-api' },
  mcp: { label: 'MCP ile yapay zeka erişimi', capabilityId: 'mcp' },
  desktopApp: { label: 'Masaüstü uygulaması', capabilityId: 'desktop-app' },
}

export const FEATURE_STATE_LABELS: Record<FeatureState, string> = {
  live: 'Dahil',
  limited: 'Dahil (sınırlı)',
  soon: 'Yakında',
}

export const LIMIT_LABELS = { channels: 'Kanal', skus: 'Ürün varyantı', users: 'Kullanıcı' } as const

export interface PublicPlanFeature {
  code: PlanFeatureCode
  label: string
  state: FeatureState
  stateLabel: string
}

export interface PublicPlan {
  code: string
  name: string
  tagline: string
  interval: BillingInterval
  intervalLabel: string
  priceKind: 'fixed' | 'quote'
  priceMinor: number
  /** "₺2.490" veya "Özel teklif". */
  priceLabel: string
  /** "/ay" (özel tekliflerde boş). */
  periodLabel: string
  /** "KDV hariç" | "KDV dahil" | "" (özel teklif). */
  vatLabel: string
  /** `null` = plan sabitlemez ("Özel limit"). Yalnızca canlı yeteneklerin limitleri gösterilir (MCP yok). */
  limits: Array<{ key: keyof typeof LIMIT_LABELS; label: string; value: number | null }>
  features: PublicPlanFeature[]
  /** ÖNERİ değeri mi? Sayfa "fiyatlar öneridir" etiketini göstermelidir. */
  proposal: boolean
  cta: 'trial' | 'contact'
}

const trMoney = (minor: number, currency: string): string => {
  const whole = minor % 100 === 0
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

export function formatPlanPrice(plan: Pick<PlanRecord, 'priceMinor' | 'currency'>): string {
  return plan.priceMinor === 0 ? 'Özel teklif' : trMoney(plan.priceMinor, plan.currency)
}

function toPublic(p: PlanRecord): PublicPlan {
  const quote = p.priceMinor === 0
  const features: PublicPlanFeature[] = []
  for (const code of p.features) {
    const entry = FEATURE_CATALOG[code]
    if (!entry) throw new Error(`Plan "${p.code}": bilinmeyen özellik kodu "${code}"`)
    const state = capabilityState(entry.capabilityId) ?? 'soon'
    // Canlı olmayan özellik "yakında"dır; yol haritası gizliyken kartta HİÇ gösterilmez (ADR-0014 Açık Soru 5).
    if (state === 'soon' && !ROADMAP_VISIBLE) continue
    features.push({ code, label: entry.label, state, stateLabel: FEATURE_STATE_LABELS[state] })
  }
  return {
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    interval: p.interval,
    intervalLabel: p.interval === 'year' ? 'Yıllık' : 'Aylık',
    priceKind: quote ? 'quote' : 'fixed',
    priceMinor: p.priceMinor,
    priceLabel: formatPlanPrice(p),
    periodLabel: quote ? '' : p.interval === 'year' ? '/yıl' : '/ay',
    vatLabel: quote ? '' : p.vatIncluded ? 'KDV dahil' : 'KDV hariç',
    limits: (['channels', 'skus', 'users'] as const).map((key) => ({ key, label: LIMIT_LABELS[key], value: quote ? null : p.limits[key] })),
    features,
    proposal: p.proposal,
    cta: quote ? 'contact' : 'trial',
  }
}

/** Sayfaların tek girişi: yalnızca `active && public` planlar; sabit fiyatlılar artan, özel teklif en sonda. */
export function getPublicPlans(source: PlanSource = defaultPlanSource): PublicPlan[] {
  return source
    .readPlans()
    .filter((p) => p.active && p.public)
    .sort((a, b) => (a.priceMinor === 0 ? 1 : 0) - (b.priceMinor === 0 ? 1 : 0) || a.priceMinor - b.priceMinor)
    .map(toPublic)
}

/** Kaynak öneri ise taslak bandında gösterilecek uyarı; aksi halde `undefined`. */
export function getPlanSourceNotice(source: PlanSource = defaultPlanSource): string | undefined {
  return source.proposal ? PROPOSAL_NOTICE : undefined
}

/**
 * KDV bilgi notu (yalnızca taslakta). Seed'in KDV oranı ÖNERİdir; KDV dahil tutar HESAPLANMAZ (uydurma değer yok).
 * Oran nihai ise (`vat.status` "ÖNERİ" değilse) not gerekmez.
 */
export function getVatNotice(source: PlanSource = defaultPlanSource): string | undefined {
  if (!source.vat || source.vat.proposal) return 'KDV oranı ve nihai fiyatlar onaylandığında netleşir; gösterilen tutarlar KDV hariçtir.'
  return undefined
}

// ---------------------------------------------------------------------------- Deneme

/**
 * Kartsız deneme (ADR-0008 §3). Süre ve kart gereksinimi SEED `trial` bloğundan gelir (uydurma değil).
 * `implemented: true` — S4a: `register` artık `trialing` abonelik oluşturuyor (`trialSubscription.ts`,
 * `TenantProvisioningService.provision()` "subscription" adımı); S6 QA bu bayrağı yeniden doğrular.
 */
const seedTrial = defaultPlanSource.trial
if (!seedTrial) throw new Error('Plan seed: `trial` bloğu bulunamadı')

export const trialOffer = {
  planCode: seedTrial.planCode,
  days: seedTrial.days,
  cardRequired: seedTrial.cardRequired,
  implemented: true,
  evidence: [
    evidence(TRIAL_IMPL_PATH, 'register -> trialing abonelik (ADR-0008 §3, ADR-0014 S4a)', "status: 'trialing'"),
    evidence(PLAN_SEED_PATH, 'Plans seed: trial bloğu (gün, kart gereksinimi)', '"cardRequired"'),
    evidence(PATHS.adr0008, 'ADR-0008 durum makinesi: trialing (14 gün, kartsız)', '`trialing` (14 gün, kartsız)'),
  ],
} as const

export function getPublicTrial(): { days: number; cardRequired: boolean } {
  return { days: trialOffer.days, cardRequired: trialOffer.cardRequired }
}

/** Denemeyi hangi plan sunuyor ve uygulanmış mı? Sayfa yalnızca `implemented` iken deneme ifadesi gösterir. */
export function getTrialPlanCode(): string | undefined {
  return trialOffer.implemented ? trialOffer.planCode : undefined
}

/**
 * PLAN KARTLARI — TEK GÖRÜNÜM KAYDI (S27b, SR4-10; anasayfa planlar bölümü S27a aynı kaydı kullanır).
 *
 * Neden: anasayfa (`PricingSummary.astro`) ve `/fiyatlandirma` aynı planları farklı kurallarla türetiyordu (önerilen
 * plan, CTA metni, "öncekine ek olarak" listesi, Otopilot özeti iki yerde ayrı hesaplanıyordu). Artık tek seçici:
 * `getPlanCards()`. Bileşenler yalnız biçimler; olgu ÜRETMEZ.
 *
 * Kaynaklar (yeni değer UYDURULMAZ):
 *  - fiyat/limit/KDV/aralık/deneme → `plans.ts` (repo içi `plans.seed.json`)
 *  - konumlandırma kopyası, CTA metni, "her planda" çekirdeği, Otopilot kademesi → `pricing.ts` (K46: Otopilot her
 *    planda dahil, alt planda sınırlı, ayrı yapay zekâ ücreti yok, kendi anahtarınız; RAKAM yok, kredi/token dili yok)
 *  - güven unsurları → `getPlanTrustPoints()` (her öğe kayıttan; `tests/plan-cards.test.ts` kaynak bağını doğrular)
 *
 * Önerilen plan: `RECOMMENDED_PLAN_CODE` — TASARIM kararıdır ("en popüler" gibi istatistik İDDİASI DEĞİLDİR; sayfada
 * yalnız "Önerilen" yazar). Seed'de yoksa vurgu düşer (derleme kırılmaz).
 * Aralık geçişi: seed yalnız aylık plan içerir → `getBillingIntervals()` tek öğe döner ve sayfa geçiş GÖSTERMEZ
 * (yıllık fiyat/indirim uydurulmaz). Seed'e yıllık plan eklendiğinde geçiş kendiliğinden açılır.
 */
import { appUrls } from '../lib/site-config'
import { AGENT_BRAND } from './agent-brand'
import { primaryNav, published } from './navigation'
import { getPublicIntegrations } from './integrations'
import { getPublicPlans, getPublicTrial, getTrialPlanCode, type BillingInterval, type PublicPlan } from './plans'
import { getPlanAgentSummary, getPlanCommonFeatures, getPlanPitch } from './pricing'

export const RECOMMENDED_PLAN_CODE = 'growth'

export type PlanLimitIcon = 'plug' | 'layers' | 'users'
const LIMIT_ICON: Record<'channels' | 'skus' | 'users', PlanLimitIcon> = { channels: 'plug', skus: 'layers', users: 'users' }

export interface PlanCardCta {
  kind: 'trial' | 'contact'
  label: string
  /** `undefined` → bağlantı üretilmez (ör. /iletisim yayımlanmamış); kart `note` gösterir. */
  href: string | undefined
  ariaLabel: string
  /** Düğmenin altındaki kısa güvence satırı. */
  note: string
}

export interface PlanCard {
  code: string
  name: string
  /** Kısa konumlandırma ("Büyüyen çok kanallı operasyonlar için"). */
  headline: string
  /** Kime hitap ettiği (tek cümle). */
  tagline: string
  recommended: boolean
  price: {
    kind: 'fixed' | 'quote'
    /** "₺2.490" | "Özel teklif" */
    label: string
    /** Sayısal değer (TL, tam) — yalnız sabit fiyatta; animasyonlu sayaç için. */
    amount?: number
    /** "/ay" | "" */
    period: string
    /** "KDV hariç" | "Kapsama göre size özel" */
    note: string
  }
  interval: BillingInterval
  /** Deneme bu planda mı (seed `trial.planCode`)? */
  trial?: { days: number; cardRequired: boolean; label: string }
  limits: Array<{ key: 'channels' | 'skus' | 'users'; label: string; icon: PlanLimitIcon; value: number | null; display: string }>
  /** "Başlangıç planındaki her şey, artı:" | "Her planda standart:" */
  includesLabel: string
  /** Önceki plana göre eklenenler (ilk planda: her planda ortak çekirdek). */
  includes: string[]
  /** Plan eklentileri (seed `features`; yalnız canlı yetenekler). */
  addOns: string[]
  /** K46: Otopilot her planda; `previous` = "<önceki plan> planındakilere ek olarak". */
  agent: { title: string; previous?: string; items: string[] } | undefined
  cta: PlanCardCta
}

const fmt = (n: number) => new Intl.NumberFormat('tr-TR').format(n)
const isPublished = (href: string) => published(primaryNav).some((i) => i.href === href)

/** Bir önceki plana göre limit artışı (ya da özel limit) — "artı" listesinde tek satır. */
function limitStep(p: PublicPlan, prev: PublicPlan | undefined): string | undefined {
  if (!prev) return undefined
  if (p.limits.every((l) => l.value === null)) return 'Kanal, ürün ve kullanıcı limitleri ihtiyacınıza göre'
  const higher = p.limits.some((l) => {
    const before = prev.limits.find((x) => x.key === l.key)?.value
    return l.value !== null && before !== null && before !== undefined && l.value > before
  })
  return higher ? 'Daha fazla kanal, ürün varyantı ve kullanıcı' : undefined
}

/** Sayfaların TEK girişi: plan kartı görünüm modeli (sıra `getPublicPlans()` sırasıdır). */
export function getPlanCards(plans: PublicPlan[] = getPublicPlans()): PlanCard[] {
  const trial = getPublicTrial()
  const trialPlanCode = getTrialPlanCode()
  const common = getPlanCommonFeatures()
  const contactHref = isPublished('/iletisim') ? '/iletisim' : undefined
  const hasRecommended = plans.some((p) => p.code === RECOMMENDED_PLAN_CODE)

  return plans.map((p, i) => {
    const prev = plans[i - 1]
    const pitch = getPlanPitch(p.code)
    const prevFeatures = new Set(prev?.features.map((f) => f.code) ?? [])
    const added = p.features.filter((f) => !prevFeatures.has(f.code)).map((f) => f.label)
    const includes = prev
      ? [limitStep(p, prev), p.priceKind === 'quote' ? 'Operasyonunuza özel fiyat teklifi' : undefined, ...added].filter((x): x is string => Boolean(x))
      : common
    const isTrial = trialPlanCode === p.code
    const agent = getPlanAgentSummary(p.code)

    const cta: PlanCardCta =
      p.cta === 'trial'
        ? {
            kind: 'trial',
            label: pitch?.ctaLabel ?? 'Ücretsiz deneyin',
            href: appUrls.register({ plan: p.code, interval: p.interval }),
            ariaLabel: `${p.name} planı: ${isTrial ? 'ücretsiz deneyin' : 'bu planla başlayın'}`,
            note: isTrial
              ? `${fmt(trial.days)} gün ücretsiz${trial.cardRequired ? '' : ', kart bilgisi gerekmez'}`
              : 'Ücretsiz denemeyle başlayın, planı uygulamada seçin',
          }
        : {
            kind: 'contact',
            label: pitch?.ctaLabel ?? 'Teklif isteyin',
            href: contactHref,
            ariaLabel: `${p.name} plan için teklif isteyin`,
            note: contactHref ? 'İhtiyacınıza göre kapsam ve limitler' : 'Teklif için iletişim bilgileri hazırlanıyor.',
          }

    return {
      code: p.code,
      name: p.name,
      headline: pitch?.headline ?? '',
      tagline: p.tagline,
      recommended: hasRecommended && p.code === RECOMMENDED_PLAN_CODE,
      price: {
        kind: p.priceKind,
        label: p.priceLabel,
        amount: p.priceKind === 'fixed' ? Math.round(p.priceMinor / 100) : undefined,
        period: p.periodLabel,
        note: p.vatLabel || 'Kapsama göre size özel',
      },
      interval: p.interval,
      trial: isTrial ? { days: trial.days, cardRequired: trial.cardRequired, label: `${fmt(trial.days)} gün ücretsiz deneme${trial.cardRequired ? '' : ' · kart gerekmez'}` } : undefined,
      limits: p.limits.map((l) => ({ key: l.key, label: l.label, icon: LIMIT_ICON[l.key], value: l.value, display: l.value === null ? 'Özel limit' : fmt(l.value) })),
      includesLabel: prev ? `${prev.name} planındaki her şey, artı:` : 'Her planda standart:',
      includes,
      addOns: p.features.map((f) => f.label),
      agent: agent && { title: agent.title, previous: prev?.name, items: agent.items },
      cta,
    }
  })
}

/** Aralık seçenekleri (seed'den). Tek öğe → sayfa aylık/yıllık geçişi GÖSTERMEZ. */
export function getBillingIntervals(plans: PublicPlan[] = getPublicPlans()): BillingInterval[] {
  return [...new Set(plans.filter((p) => p.priceKind === 'fixed').map((p) => p.interval))]
}

// ---------------------------------------------------------------------------- Güven unsurları (kanıtlanabilir)

export type TrustIcon = 'clock' | 'card' | 'refresh' | 'sparkle' | 'plug' | 'lock'

export interface PlanTrustPoint {
  id: string
  icon: TrustIcon
  /** Kayıttan gelen rakamlı vurgu (ör. "14 gün") — sayı denetiminde `meta` olarak muaf; değer kayıttandır. */
  meta?: string
  label: string
  /** Kaynak kaydı (test doğrular; görünür DEĞİL). */
  source: 'plans.trial' | 'plans.trial.card' | 'pricing.faq.plan-degisikligi' | 'pricing.agent' | 'integrations' | 'faq.kart-bilgisi'
}

/**
 * Fiyat sayfası (ve anasayfa planlar bölümü) güven şeridi. Sahte müşteri/rakam/logo YOK; her öğe bir kayda dayanır.
 * Kayıt değişirse öğe kendiliğinden düşer (ör. deneme kartlı olursa "kart gerekmez" görünmez).
 */
export function getPlanTrustPoints(): PlanTrustPoint[] {
  const trial = getPublicTrial()
  const trialPlan = getTrialPlanCode()
  const channels = getPublicIntegrations().length
  const out: PlanTrustPoint[] = []
  if (trialPlan) out.push({ id: 'trial', icon: 'clock', meta: `${fmt(trial.days)} gün`, label: 'ücretsiz deneme', source: 'plans.trial' })
  if (trialPlan && !trial.cardRequired) out.push({ id: 'card', icon: 'card', label: 'Kart bilgisi gerekmez', source: 'plans.trial.card' })
  out.push({ id: 'agent', icon: 'sparkle', label: `${AGENT_BRAND} her planda dahil`, source: 'pricing.agent' })
  if (channels > 0) out.push({ id: 'channels', icon: 'plug', meta: `${fmt(channels)} kanal`, label: 'hazır entegrasyon', source: 'integrations' })
  out.push({ id: 'switch', icon: 'refresh', label: 'Planınızı uygulamadan değiştirin', source: 'pricing.faq.plan-degisikligi' })
  out.push({ id: 'payment', icon: 'lock', label: 'Kart verisi sistemlerimizden geçmez', source: 'faq.kart-bilgisi' })
  return out
}

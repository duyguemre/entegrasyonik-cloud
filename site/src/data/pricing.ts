/**
 * `/fiyatlandirma` sayfasının veri katmanı (ADR-0014 S4b): plan karşılaştırma satırları ve fiyat SSS'si.
 *
 * Kural (S1'den): olgusal iddia sayfa markup'ına yazılmaz; her SSS kaydı `evidence` taşır ve sayfa yalnızca
 * seçicileri (`getComparisonRows`, `getPricingFaq`) kullanır. Fiyat/limit/deneme değerleri `plans.ts` seçicilerinden
 * (seed) gelir — burada YENİ değer üretilmez. Yıllık faturalama seed'de olmadığı için anlatılmaz.
 */
import { PATHS, evidence, type EvidenceRef } from './evidence'
import { getPublicFaq } from './faq'
import { getPublicCapabilities } from './capabilities'
import {
  PLAN_SEED_PATH,
  defaultPlanSource,
  getPublicPlans,
  getVatNotice,
  trialOffer,
  type PlanSource,
  type PublicPlan,
} from './plans'

// ---------------------------------------------------------------------------- Karşılaştırma tablosu

export interface ComparisonRow {
  key: 'channels' | 'skus' | 'users'
  label: string
  /** `value === null` -> "Özel limit" (plan sabitlemez). Sayılar sayfada `tr-TR` biçimlenir. */
  cells: Array<{ planCode: string; value: number | null }>
}

/** Yalnızca canlı yeteneklerin limitleri (MCP çağrı limiti gösterilmez — ürün canlı değil). */
export function getComparisonRows(plans: PublicPlan[] = getPublicPlans()): ComparisonRow[] {
  const keys: ComparisonRow['key'][] = ['channels', 'skus', 'users']
  return keys.map((key) => ({
    key,
    label: plans[0]?.limits.find((l) => l.key === key)?.label ?? key,
    cells: plans.map((p) => ({ planCode: p.code, value: p.limits.find((l) => l.key === key)?.value ?? null })),
  }))
}

// ---------------------------------------------------------------------------- Fiyat SSS'si

export interface PricingFaqRecord {
  id: string
  question: string
  answer: string
  evidence: EvidenceRef[]
}

export interface PricingFaqItem {
  id: string
  question: string
  answer: string
}

const seedEvidence = (contains: string): EvidenceRef => evidence(PLAN_SEED_PATH, 'Plans seed (tek doğruluk kaynağı)', contains)

/** Kayıtlar (kanıtlı). Sayfa `getPricingFaq()` kullanır; testler kayıtları doğrudan tarar. */
export function getPricingFaqRecords(source: PlanSource = defaultPlanSource): PricingFaqRecord[] {
  const plans = getPublicPlans(source)
  const paid = plans.find((p) => p.priceKind === 'fixed')
  const quote = plans.find((p) => p.priceKind === 'quote')
  const trialPlan = plans.find((p) => p.code === trialOffer.planCode)
  const vatNotice = getVatNotice(source)
  const records: PricingFaqRecord[] = []

  if (trialOffer.implemented && trialPlan) {
    records.push({
      id: 'deneme-kart',
      question: 'Deneme sürümü için kart bilgisi gerekir mi?',
      answer: trialOffer.cardRequired
        ? `Evet, deneme sürümü için ödeme bilgisi istenir. Deneme, ${trialPlan.name} planının limitleriyle başlar.`
        : `Hayır. Kayıt sırasında kart bilgisi istenmez. Deneme sürümü ${trialPlan.name} planının limitleriyle başlar; devam etmek istediğinizde uygulama içinden plan seçersiniz.`,
      evidence: [...trialOffer.evidence],
    })
  }

  if (paid) {
    records.push({
      id: 'kdv',
      question: 'Fiyatlara KDV dahil mi?',
      answer: `Plan fiyatları ${paid.vatLabel} gösterilir.${vatNotice ? ` ${vatNotice}` : ''}`,
      evidence: [seedEvidence('"vatIncluded"'), seedEvidence('"vat"')],
    })
    records.push({
      id: 'faturalama-donemi',
      question: 'Planlar nasıl faturalandırılır?',
      answer: `Şu anda planlar ${paid.intervalLabel.toLocaleLowerCase('tr-TR')} dönemle sunulur.`,
      evidence: [seedEvidence('"interval": "month"')],
    })
  }

  if (quote) {
    records.push({
      id: 'kurumsal',
      question: `${quote.name} plan nasıl çalışır?`,
      answer: `${quote.name} plan için sabit bir fiyat yoktur; limitler ve kapsam ihtiyacınıza göre belirlenir. Bizimle iletişime geçerek teklif isteyebilirsiniz.`,
      evidence: [seedEvidence('Özel teklif: limitler')],
    })
  }

  records.push({
    id: 'plan-degisikligi',
    question: 'Planımı sonradan değiştirebilir miyim?',
    answer: 'Evet. Uygulamadaki Abonelik ve Planlar ekranından plan seçebilir ve planınızı değiştirebilirsiniz.',
    evidence: [evidence('frontend/src/views/secure/user/SubscriptionView.vue', 'Abonelik ekranı plan geçişi', 'Bu Plana Geç')],
  })

  const card = getPublicFaq().find((f) => f.id === 'kart-bilgisi')
  if (card) {
    records.push({
      id: 'kart-bilgisi',
      question: card.question,
      answer: card.answer,
      evidence: [evidence(PATHS.adr0008, 'ADR-0008 barındırılan ödeme formu', 'kart verisi bize gelmez')],
    })
  }

  return records
}

export function getPricingFaq(source: PlanSource = defaultPlanSource): PricingFaqItem[] {
  return getPricingFaqRecords(source).map(({ id, question, answer }) => ({ id, question, answer }))
}

// ---------------------------------------------------------------------------- Plan tanıtım kopyası (S12)

/**
 * Plan kartlarının pazarlama kopyası (ana sayfa + `/fiyatlandirma`). OLGU İÇERMEZ: fiyat/limit/özellik değerleri
 * kartta `plans.ts` seçicilerinden gösterilir; buradaki cümleler yalnızca planın kime ve hangi aşamaya hitap
 * ettiğini anlatır. Rakam yazılmaz (sayısal iddia denetimi). Seed'de olup burada olmayan plan kodu derlemeyi
 * kırmaz (boş kopya -> kart yalnızca veri gösterir).
 */
export interface PlanPitch {
  /** Kartın üstündeki kısa konumlandırma (ör. "Çok kanallı satışa hızlı giriş"). */
  headline: string
  /** CTA düğmesinin metni (ücretsiz deneme planları için; teklif planı ayrı etiket kullanır). */
  ctaLabel: string
}

const PLAN_PITCH: Record<string, PlanPitch> = {
  starter: { headline: 'Çok kanallı satışa güçlü bir başlangıç', ctaLabel: 'Ücretsiz deneyin' },
  growth: { headline: 'Büyüyen omnichannel operasyonlar için', ctaLabel: 'Büyüme ile başlayın' },
  enterprise: { headline: 'Ölçeğinize göre şekillenen kapasite', ctaLabel: 'Teklif isteyin' },
}

export function getPlanPitch(code: string): PlanPitch | undefined {
  return PLAN_PITCH[code]
}

/**
 * "Her planda" satırı: tüm planlarda ortak olan çekirdek yetenekler. Seed `features` alanı yalnızca eklentileri
 * (ERP vb.) plan bazında ayırır; çekirdek yetenekler plan koduna bağlı DEĞİLDİR (seed'de bu yetenekler için
 * özellik kodu yoktur). Başlıklar `capabilities.ts` kayıtlarından gelir (yalnızca `available`).
 */
const PLAN_COMMON_LABELS: Array<{ capabilityId: string; label: string }> = [
  { capabilityId: 'stock-reservation', label: 'Stok rezervasyonu ile overselling koruması' },
  { capabilityId: 'multi-channel-products', label: 'Merkezi ürün, fiyat ve stok yönetimi' },
  { capabilityId: 'unified-orders', label: 'Tüm kanallardan birleşik sipariş akışı' },
  { capabilityId: 'secrets-encryption', label: 'Şifreli API anahtarı saklama' },
  { capabilityId: 'role-based-access', label: 'Rol tabanlı ekip yetkilendirmesi' },
]

/** Yalnızca kayıtta `available` olan yeteneklerin kısa etiketleri (kayıt değişirse satır kendiliğinden daralır). */
export function getPlanCommonFeatures(): string[] {
  const live = new Set(getPublicCapabilities().filter((c) => c.status === 'available').map((c) => c.id))
  return PLAN_COMMON_LABELS.filter((x) => live.has(x.capabilityId)).map((x) => x.label)
}

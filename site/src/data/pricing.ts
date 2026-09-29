/**
 * `/fiyatlandirma` sayfasının veri katmanı (ADR-0014 S4b): plan karşılaştırma satırları ve fiyat SSS'si.
 *
 * Kural (S1'den): olgusal iddia sayfa markup'ına yazılmaz; her SSS kaydı `evidence` taşır ve sayfa yalnızca
 * seçicileri (`getComparisonRows`, `getPricingFaq`) kullanır. Fiyat/limit/deneme değerleri `plans.ts` seçicilerinden
 * (seed) gelir — burada YENİ değer üretilmez. Yıllık faturalama seed'de olmadığı için anlatılmaz.
 */
import { PATHS, evidence, type EvidenceRef } from './evidence'
import { getPublicFaq } from './faq'
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

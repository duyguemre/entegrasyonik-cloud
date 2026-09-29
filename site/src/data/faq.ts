/**
 * SSS (ADR-0014 Karar 2 `/sss`, `FAQPage` şeması) — YALNIZCA doğrulanabilir iddialar.
 *
 * Her kayıt `evidence` taşır. Entegrasyon adları/kapsamı elle yazılmaz: `integrations.ts`'ten üretilir,
 * böylece SSS ile entegrasyon kaydı birbirinden ayrışamaz. Yasaklı konular (e-fatura, kargo API'si, yol
 * haritası adları, sertifika, uptime, destek süresi, müşteri sayısı) SSS'te yer almaz.
 * Deneme süresi SSS'i, `register` -> `trialing` (BACKLOG C16 kalanı / S4) uygulanana kadar YAZILMADI.
 */
import { PATHS, evidence, registry, type EvidenceRef } from './evidence'
import { getPublicIntegrations, type PublicIntegration } from './integrations'
import { getPublicCapabilities } from './capabilities'

export interface FaqItem {
  id: string
  question: string
  answer: string
  evidence: EvidenceRef[]
  /** Görünür DEĞİL. */
  internalNotes?: string[]
}

export interface PublicFaqItem {
  id: string
  question: string
  answer: string
}

/** ["A","B","C"] -> "A, B ve C". */
const joinTr = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`

const names = (list: PublicIntegration[]): string => joinTr(list.map((i) => i.name))

function integrationListAnswer(): string {
  const mp = getPublicIntegrations('marketplace')
  const ec = getPublicIntegrations('ecommerce')
  const erp = getPublicIntegrations('erp')
  const parts = [
    mp.length ? `pazaryeri olarak ${names(mp)}` : '',
    ec.length ? `e-ticaret altyapısı olarak ${names(ec)}` : '',
    erp.length ? `ERP olarak ${names(erp)} (yalnızca okuma)` : '',
  ].filter(Boolean)
  return `Mevcut entegrasyonlar: ${parts.join('; ')}. Kapsam entegrasyona göre değişir; ayrıntılar her entegrasyonun sayfasındadır. Listede olmayan bir entegrasyon şu an mevcut değildir.`
}

const capability = (id: string) => {
  const c = getPublicCapabilities().find((x) => x.id === id)
  if (!c) throw new Error(`SSS: yetenek kaydı bulunamadı: ${id}`)
  return c
}

const reservation = () => capability('stock-reservation')

export const faq: FaqItem[] = [
  {
    id: 'hangi-entegrasyonlar',
    question: 'Hangi entegrasyonlar mevcut?',
    answer: integrationListAnswer(),
    evidence: [registry('§0', '## 0. Özet tablo'), evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kodlar', "case 'bizimhesap'")],
  },
  {
    id: 'kapsam-ayni-mi',
    question: 'Tüm entegrasyonların kapsamı aynı mı?',
    answer:
      'Hayır. Kapsam entegrasyona göre değişir: örneğin N11 için sipariş onaylama ve reddetme desteklenmez, Bizimhesap yalnızca okuma yapar ve Ideasoft için gerçek mağaza bağlantısı bu sürümde sınırlıdır. Her entegrasyonun sayfasında neyin desteklendiği ve neyin desteklenmediği açıkça yazılıdır.',
    evidence: [registry('§2.3', '### 2.3 N11'), registry('§3.1', '### 3.1 Ideasoft'), registry('§4.1', '### 4.1 Bizimhesap')],
  },
  {
    id: 'asiri-satis',
    question: 'Aşırı satışı nasıl önlüyorsunuz?',
    answer: `${reservation().summary} ${reservation().caveat ?? ''}`.trim(),
    evidence: [
      evidence(
        'backend/tests/integration/StockAllocator.concurrency.test.ts',
        'eşzamanlılık testi',
        'tam 10 RESERVED + 40 OVERSOLD',
      ),
      evidence(PATHS.adr0004, 'ADR-0004 telafi akışı', 'Telafi (oversell)'),
    ],
  },
  {
    id: 'baglanti-bilgileri',
    question: 'Bir pazaryerini bağlamak için hangi bilgiler gerekir?',
    answer:
      'Pazaryerinin satıcı panelinden aldığınız API kimlik bilgilerini (örneğin satıcı kimliği, API anahtarı ve gizli anahtar) Entegrasyonik\'te ilgili entegrasyonun ayar ekranına girersiniz. Gerekli alanlar entegrasyona göre değişir; eksik alan olduğunda ekran hangi bilginin gerektiğini belirtir.',
    evidence: [
      evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §1 zorunlu ayar doğrulaması', '`requiredSettings` eksikse'),
    ],
  },
  {
    id: 'anahtar-saklama',
    question: 'Entegrasyon anahtarlarım nasıl saklanıyor?',
    answer: `${capability('secrets-encryption').summary} ${capability('secrets-masked').summary}`,
    evidence: [
      evidence('backend/src/utils/FieldCrypto.ts', 'FieldCrypto AES-256-GCM', 'aes-256-gcm'),
      evidence('backend/src/api/responseSanitizer.ts', 'responseSanitizer maskeleme', 'sensitive'),
    ],
  },
  {
    id: 'veri-ayrimi',
    question: 'Verilerim diğer müşterilerin verileriyle aynı veritabanında mı tutulur?',
    answer:
      'Her müşteri hesabı için ayrı bir veritabanı kullanılır. Kullanıcı hesabı, yapılandırma ve sistem kayıtları gibi platform genelindeki bilgiler ortak bir platform veritabanında tutulur.',
    evidence: [
      evidence(PATHS.adr0003, 'ADR-0003 kiracı DB adlandırma', 'entegrasyonikClient_1'),
      evidence('CLAUDE.md', 'CLAUDE.md mimari: platform geneli veri ApplicationDB', 'platform-wide metadata (users, configs, logs)'),
    ],
  },
  {
    id: 'kart-bilgisi',
    question: 'Kart bilgilerim Entegrasyonik\'te saklanır mı?',
    answer:
      'Hayır. Ödeme, ödeme sağlayıcısının barındırdığı formda alınacak şekilde tasarlanmıştır; kart verisi Entegrasyonik sistemlerine gelmez. Ödeme akışı bu sürümde test (sandbox) aşamasındadır.',
    evidence: [evidence(PATHS.adr0008, 'ADR-0008 barındırılan ödeme formu', 'kart verisi bize gelmez')],
    internalNotes: ['Canlı ödeme sağlayıcısı adaptörü yok; mock checkout (ADR-0008). Cevap bu yüzden "test aşamasında" der.'],
  },
  {
    id: 'kargo-bilgisi',
    question: 'Kargo bilgisini pazaryerine nasıl iletirim?',
    answer:
      'Kargo takip bilgisini panelde elle girersiniz; bilgi ilgili pazaryerine iletilir. Kargo firmasıyla otomatik etiket veya barkod akışı bu sürümde yoktur ve iletim kapsamı pazaryerine göre değişir.',
    evidence: [registry('§5.1', '### 5.1 Kargo entegrasyonları'), registry('§2.1', '### 2.1 Trendyol')],
  },
]

/** Sayfaların tek girişi (evidence/internalNotes atılır). */
export function getPublicFaq(): PublicFaqItem[] {
  return faq.map(({ id, question, answer }) => ({ id, question, answer }))
}

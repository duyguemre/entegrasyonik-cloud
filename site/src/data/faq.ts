/**
 * SSS (ADR-0014 Karar 2 `/sss`, `FAQPage` şeması) — YALNIZCA doğrulanabilir iddialar.
 *
 * Her kayıt `evidence` taşır. Entegrasyon adları/kapsamı elle yazılmaz: `integrations.ts`'ten üretilir,
 * böylece SSS ile entegrasyon kaydı birbirinden ayrışamaz. Yasaklı konular (e-fatura, kargo API'si, yol
 * haritası adları, sertifika, uptime, destek süresi/kanalı taahhüdü, müşteri sayısı) SSS'te yer almaz.
 *
 * S12 (PARÇA C): sorular altı kategoriye genişletildi (Başlangıç ve kurulum, Pazaryeri ve kanal uyumu, Stok ve
 * sipariş yönetimi, Güvenlik ve veri, Fiyatlandırma ve plan, Destek ve ölçeklenme). Yanıtlar pazarlama diliyle
 * yazılır ama her olgu kanıtlıdır; cevaplarda rakam YOKTUR (deneme süresi gibi sayılar seçicilerden sayfada
 * gösterilir — `tests/claims.test.ts` sayısal iddia denetimi). `getPublicFaq()` kategori sırasıyla döner; bu sıra
 * `/sss` akordeonu ve `FAQPage` JSON-LD'si için ortaktır.
 */
import { PATHS, evidence, registry, type EvidenceRef } from './evidence'
import { getPublicIntegrations, type PublicIntegration } from './integrations'
import { getPublicCapabilities } from './capabilities'
import { getPublicPlans, trialOffer } from './plans'

export type FaqCategoryId = 'baslangic' | 'kanallar' | 'stok-siparis' | 'guvenlik-veri' | 'fiyat-plan' | 'destek-olcek'

export interface FaqCategory {
  id: FaqCategoryId
  label: string
  /** Kategori başlığının altındaki kısa tanıtım cümlesi (pazarlama kopyası; olgu içermez). */
  lead: string
}

/** Görünen kategori sırası (sayfa, önizleme ve JSON-LD aynı sırayı kullanır). */
export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'baslangic', label: 'Başlangıç ve kurulum', lead: 'Hesap açılışından ilk kanal bağlantısına kadar bilmeniz gerekenler.' },
  { id: 'kanallar', label: 'Pazaryeri ve kanal uyumu', lead: 'Hangi kanallarla çalıştığınız ve her kanalda neleri yönetebildiğiniz.' },
  { id: 'stok-siparis', label: 'Stok ve sipariş yönetimi', lead: 'Merkezi stok yönetimi, aşırı satış koruması ve sipariş akışınız.' },
  { id: 'guvenlik-veri', label: 'Güvenlik ve veri', lead: 'API anahtarlarınızın, verilerinizin ve ekibinizin erişiminin nasıl korunduğu.' },
  { id: 'fiyat-plan', label: 'Fiyatlandırma ve plan', lead: 'Ücretsiz deneme, plan seçimi ve kurumsal teklifler.' },
  { id: 'destek-olcek', label: 'Destek ve ölçeklenme', lead: 'Büyürken yanınızda olan destek ve kapasite seçenekleri.' },
]

export interface FaqItem {
  id: string
  category: FaqCategoryId
  question: string
  answer: string
  evidence: EvidenceRef[]
  /** Görünür DEĞİL. */
  internalNotes?: string[]
}

export interface PublicFaqItem {
  id: string
  category: FaqCategoryId
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
  return `Entegrasyonik bugün ${parts.join('; ')} ile çalışır. Her bağlantının desteklediği işlemler entegrasyon sayfalarında ayrıntılı ve şeffaf biçimde yer alır; listede yer almayan bir kanal için iletişim sayfasından bize ulaşabilirsiniz.`
}

const capability = (id: string) => {
  const c = getPublicCapabilities().find((x) => x.id === id)
  if (!c) throw new Error(`SSS: yetenek kaydı bulunamadı: ${id}`)
  return c
}

const reservation = () => capability('stock-reservation')

const plans = () => getPublicPlans()
const trialPlanName = () => plans().find((p) => p.code === trialOffer.planCode)?.name
const quotePlanName = () => plans().find((p) => p.priceKind === 'quote')?.name
const fixedPlanNames = () => plans().filter((p) => p.priceKind === 'fixed').map((p) => p.name)

/** Kartsız deneme cümlesi seed'den (kart gereksinimi değişirse cümle de değişir). */
const trialSentence = (): string =>
  trialOffer.cardRequired
    ? 'Kayıt olduğunuzda deneme süreniz başlar; deneme için ödeme bilgisi istenir.'
    : 'Kayıt olduğunuzda deneme süreniz başlar ve kart bilgisi istenmez.'

const trialEvidence = (): EvidenceRef[] => [...trialOffer.evidence]

const PLAN_SEED = 'backend/src/database/application/seed/plans.seed.json'
const SUBSCRIPTION_VIEW = 'frontend/src/views/secure/user/SubscriptionView.vue'

export const faq: FaqItem[] = [
  // ------------------------------------------------------------------------------ Başlangıç ve kurulum
  {
    id: 'nasil-baslarim',
    category: 'baslangic',
    question: 'Entegrasyonik ile satışa nasıl başlarım?',
    answer: `${trialSentence()} Ardından pazaryeri hesaplarınızı panele bağlar, ürün, stok ve siparişlerinizi tek merkezden yönetmeye başlarsınız. Kurulumu adım adım panel içinden tamamlarsınız.`,
    evidence: [
      ...trialEvidence(),
      evidence('frontend/src/views/secure/integrations/MarketplaceView.vue', 'Pazaryeri bağlantı ekranı', 'Pazaryeri hesaplarınızı bağlayın'),
    ],
  },
  {
    id: 'teknik-bilgi',
    category: 'baslangic',
    question: 'Kurulum için teknik bilgi ya da yazılım ekibi gerekir mi?',
    answer:
      "Hayır. Kanallarınızı bağlamak için kod yazmanız gerekmez: pazaryerinin satıcı panelinden aldığınız API bilgilerini Entegrasyonik'teki bağlantı ekranına girmeniz yeterlidir. Bilgiler hatalıysa bağlantı pasif görünür; neyi düzeltmeniz gerektiğini ekrandan takip edersiniz.",
    evidence: [
      evidence(
        'frontend/src/views/secure/integrations/MarketplaceView.vue',
        'Bağlantı ekranı yönergesi',
        'Pazar yeri panelinden aldığınız API anahtarlarını ilgili alanlara girin.',
      ),
      evidence('frontend/src/components/integrations/IntegrationGuideCard.vue', 'Hatalı bilgi: pasif bağlantı', 'API bilgileriniz hatalı ise bağlantı "Pasif" görünecektir.'),
    ],
  },
  {
    id: 'baglanti-bilgileri',
    category: 'baslangic',
    question: 'Bir pazaryerini bağlamak için hangi bilgiler gerekir?',
    answer:
      "Pazaryerinin satıcı panelinden aldığınız API kimlik bilgileri (örneğin satıcı kimliği, API anahtarı ve gizli anahtar) yeterlidir. Gerekli alanlar pazaryerine göre değişir; bağlantı ekranı her kanal için hangi bilginin istendiğini açıkça gösterir.",
    evidence: [
      evidence('backend/src/integration/modules/marketplace/hepsiburada/index.ts', 'Zorunlu ayarlar (satıcı kimliği, API anahtarı, gizli anahtar)', "requiredSettings = ['APISECRET', 'APIKEY', 'SELLERID']"),
      evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §1 zorunlu ayar doğrulaması', '`requiredSettings` eksikse'),
    ],
  },
  {
    id: 'urun-aktarimi',
    category: 'baslangic',
    question: 'Pazaryerinde satıştaki ürünlerimi yeniden girmem gerekir mi?',
    answer:
      'Hayır. Pazaryerinde satıştaki ürünlerinizi Entegrasyonik\'e aktararak kataloğunuzu, fiyatlarınızı ve stoklarınızı tek merkezde toplarsınız. Aktarım kapsamı kanala göre değişir; ayrıntılar entegrasyon sayfalarındadır.',
    evidence: [
      evidence('backend/src/integration/engine/catalog/import/ImportOrchestrator.ts', 'Katalog içe aktarım orkestratörü', 'export class ImportOrchestrator'),
      evidence('CLAUDE.md', 'CLAUDE.md mimari: içe aktarım', 'pulls product/order data from marketplaces'),
    ],
  },

  // ------------------------------------------------------------------------------ Pazaryeri ve kanal uyumu
  {
    id: 'hangi-entegrasyonlar',
    category: 'kanallar',
    question: 'Hangi pazaryerleri ve sistemlerle çalışıyorsunuz?',
    answer: integrationListAnswer(),
    evidence: [registry('§0', '## 0. Özet tablo'), evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kodlar', "case 'bizimhesap'")],
  },
  {
    id: 'kapsam-ayni-mi',
    category: 'kanallar',
    question: 'Her pazaryerinde aynı işlemleri yapabilir miyim?',
    answer:
      'Entegrasyonik her kanalı o pazaryerinin sunduğu imkânlarla uyumlu çalışacak şekilde bağlar; bu nedenle desteklenen işlemler kanaldan kanala farklılık gösterir. Örneğin N11 için sipariş onaylama ve reddetme desteklenmez, ERP bağlantısı ise yalnızca okuma yapar. Her entegrasyon sayfasında neyin desteklendiği açıkça yazılıdır.',
    evidence: [registry('§2.3', '### 2.3 N11'), registry('§3.1', '### 3.1 Ideasoft'), registry('§4.1', '### 4.1 Bizimhesap')],
  },
  {
    id: 'erp-baglantisi',
    category: 'kanallar',
    question: 'ERP sistemimle birlikte çalışabilir mi?',
    answer: `Evet. ${capability('erp-read').summary} Böylece ERP\'deki ürün ve sipariş bilginiz, çok kanallı satış operasyonunuzla aynı panelde buluşur.`,
    evidence: [registry('§4.1', '### 4.1 Bizimhesap'), evidence(PATHS.factory, 'IntegrationFactory', "case 'bizimhesap'")],
  },
  {
    id: 'iade-soru',
    category: 'kanallar',
    question: 'İade taleplerini ve alıcı sorularını da yönetebilir miyim?',
    answer: `Evet. ${capability('returns').summary} ${capability('questions').summary} Kapsam kanala göre değişir; ayrıntılar entegrasyon sayfalarındadır.`,
    evidence: [registry('§2.1', '### 2.1 Trendyol'), registry('§2.4', '### 2.4 Pazarama')],
  },
  {
    id: 'yeni-kanal',
    category: 'kanallar',
    question: 'Satış yaptığım bir kanal listede yoksa ne yapabilirim?',
    answer:
      'İhtiyacınızı iletişim sayfasından bize iletin; talebinizi ekibimizle birlikte değerlendirelim. Güncel olarak desteklenen tüm kanallar ve her birinin kapsamı entegrasyonlar sayfasında yer alır.',
    evidence: [evidence('site/src/data/navigation.ts', 'İletişim sayfası yayımlı', "{ label: 'İletişim', href: '/iletisim', published: true, group: 'resources'")],
    internalNotes: ['Yeni kanal için süre/taahhüt VERİLMEZ (yol haritası gizli, ADR-0014 Açık Soru 5).'],
  },

  // ------------------------------------------------------------------------------ Stok ve sipariş yönetimi
  {
    id: 'asiri-satis',
    category: 'stok-siparis',
    question: 'Aşırı satışı nasıl önlüyorsunuz?',
    answer: `Merkezi stok yönetiminin kalbinde stok rezervasyonu vardır. ${reservation().summary} ${reservation().caveat ?? ''}`.trim(),
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
    id: 'stok-senkron',
    category: 'stok-siparis',
    question: 'Bir kanalda satış olduğunda stoğum diğer kanallarda da güncellenir mi?',
    answer:
      'Evet. Stoğunuz tek merkezden yönetilir: siparişle ayrılan adet merkezi stoğunuzdan düşer ve değişen stok bilgisi bağlı kanallara iletilir. Pazaryerleri stoğu kendi aralıklarıyla yansıtır; bu arada oluşabilecek aşırı satış tespit edilir ve telafi akışına alınır.',
    evidence: [
      evidence(PATHS.adr0004, 'ADR-0004: stok değiştiğinde kanallara yayın', 'yalnızca değiştiğinde (delta)'),
      evidence(
        'backend/tests/integration/StockAllocator.concurrency.test.ts',
        'eşzamanlılık testi',
        'tam 10 RESERVED + 40 OVERSOLD',
      ),
    ],
    internalNotes: ['Kanallara delta yayını ADR-0004 kararıdır; "yayın gecikmesi yok" iddiası YAPILMAZ (caveat cümlesi).'],
  },
  {
    id: 'siparis-yonetimi',
    category: 'stok-siparis',
    question: 'Tüm kanallardaki siparişlerimi tek ekrandan yönetebilir miyim?',
    answer: `Evet. ${capability('unified-orders').summary} Ekibiniz her pazaryerinin paneline ayrı ayrı girmeden siparişleri tek akışta takip eder; bu da operasyonel verimliliği doğrudan artırır.`,
    evidence: [
      registry('§1', '## 1. Ortak mimari'),
      evidence('backend/src/integration/engine/order/OrderWorker.ts', 'OrderWorker sipariş senkronu', 'OrderWorker'),
    ],
  },
  {
    id: 'kargo-bilgisi',
    category: 'stok-siparis',
    question: 'Kargo ve fatura bilgisini pazaryerine nasıl iletirim?',
    answer:
      'Kargo takip bilgisini ve fatura bağlantısını panelde siparişe eklersiniz; Entegrasyonik bu bilgiyi ilgili pazaryerine iletir. Kargo etiketi ve barkod süreçleriniz mevcut kargo anlaşmanızla devam eder; iletim kapsamı pazaryerine göre değişir.',
    evidence: [registry('§5.1', '### 5.1 Kargo entegrasyonları'), registry('§2.1', '### 2.1 Trendyol')],
  },

  // ------------------------------------------------------------------------------ Güvenlik ve veri
  {
    id: 'anahtar-saklama',
    category: 'guvenlik-veri',
    question: 'Pazaryeri API anahtarlarım nasıl korunuyor?',
    answer: `${capability('secrets-encryption').summary} ${capability('secrets-masked').summary} Anahtarlarınız yalnızca bağlantıyı kurmak için sunucu tarafında kullanılır.`,
    evidence: [
      evidence('backend/src/utils/FieldCrypto.ts', 'FieldCrypto AES-256-GCM', 'aes-256-gcm'),
      evidence('backend/src/platform/core/security/responseSanitizer.ts', 'responseSanitizer maskeleme', 'sensitive'),
    ],
  },
  {
    id: 'veri-ayrimi',
    category: 'guvenlik-veri',
    question: 'Verilerim diğer işletmelerin verileriyle aynı yerde mi tutulur?',
    answer:
      'Hayır. Ürün, stok ve sipariş verileriniz yalnızca size ait, izole bir alanda tutulur ve başka bir işletmenin verisiyle karışmaz. Kullanıcı hesabı ve yapılandırma gibi platform genelindeki bilgiler ayrıca yönetilir.',
    evidence: [
      evidence(PATHS.adr0003, 'ADR-0003 kiracı DB adlandırma', 'entegrasyonikClient_1'),
      evidence('CLAUDE.md', 'CLAUDE.md mimari: platform geneli veri ApplicationDB', 'platform-wide metadata (users, configs, logs)'),
      evidence(PATHS.adr0004, 'ADR-0004: stok kiracı veritabanında', 'Stokun tek doğruluk kaynağı tenant ClientDB'),
    ],
  },
  {
    id: 'ekip-yetki',
    category: 'guvenlik-veri',
    question: 'Ekibime farklı yetkiler verebilir miyim?',
    answer:
      'Evet. Ekip arkadaşlarınızı hesabınıza kullanıcı olarak ekler, her birine üye, yönetici veya ana yönetici kademesi atarsınız. Entegrasyon bilgilerini değiştirmek gibi hassas işlemler üst kademe gerektirir ve yetki kontrolü sunucu tarafında yapılır.',
    evidence: [
      evidence('frontend/src/views/secure/user/AuthorizationListView.vue', 'Kullanıcı ekleme ekranı', 'UserService/createUser'),
      evidence('backend/src/api/operationPolicy.ts', 'operationPolicy yetki kademeleri', 'member < admin < owner'),
      evidence(PATHS.adr0008, 'ADR-0008: kimlik bilgisi yazma yönetici işlemi', 'entegrasyon kimlik bilgisi yazmayla aynı gerekçe'),
    ],
  },
  {
    id: 'secim-kriterleri',
    category: 'guvenlik-veri',
    question: 'Entegrasyon yazılımı seçerken nelere dikkat etmeliyim?',
    answer:
      "Karşılaştırırken dört ölçüte bakmanızı öneririz: verilerinizin size ayrılmış, izole bir alanda tutulması, pazaryeri API anahtarlarının şifreli saklanması, eşzamanlı siparişlerde stok rezervasyonu ve yetkisiz işlemi varsayılan olarak engelleyen bir yetki modeli. Entegrasyonik'te verileriniz yalnızca size ait, izole bir alanda tutulur ve pazaryeri anahtarlarınız güçlü şifrelemeyle saklanır. Stok yalnızca mevcut adet kadar rezerve edilir; sunucuda tanımlı işlem listesinde olmayan her işlem reddedilir. Son olarak her kanalda hangi işlemlerin desteklendiğini entegrasyon sayfalarındaki kapsam tablolarından kontrol edin.",
    evidence: [
      evidence(PATHS.adr0003, 'ADR-0003 kiracı DB adlandırma', 'entegrasyonikClient_1'),
      evidence('backend/src/utils/FieldCrypto.ts', 'FieldCrypto AES-256-GCM', 'aes-256-gcm'),
      evidence(
        'backend/tests/integration/StockAllocator.concurrency.test.ts',
        'eşzamanlılık testi: yalnızca stok kadarı rezerve',
        'tam 10 RESERVED + 40 OVERSOLD',
      ),
      evidence('backend/src/api/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR'),
    ],
    internalNotes: ['S14: rakip adı VERİLMEZ; ölçütler yalnızca kayıtlı yeteneklerdir (tenant-database, secrets-encryption, stock-reservation, default-deny).'],
  },
  {
    id: 'kart-bilgisi',
    category: 'guvenlik-veri',
    question: 'Kart bilgilerim Entegrasyonik\'te saklanır mı?',
    answer:
      'Hayır. Ödeme, ödeme sağlayıcısının barındırdığı formda alınacak şekilde tasarlanmıştır; kart verisi Entegrasyonik sistemlerine gelmez. Ödeme akışı bu sürümde test aşamasındadır.',
    evidence: [evidence(PATHS.adr0008, 'ADR-0008 barındırılan ödeme formu', 'kart verisi bize gelmez')],
    internalNotes: ['Canlı ödeme sağlayıcısı adaptörü yok; mock checkout (ADR-0008). Cevap bu yüzden "test aşamasında" der.'],
  },

  // ------------------------------------------------------------------------------ Fiyatlandırma ve plan
  {
    id: 'deneme',
    category: 'fiyat-plan',
    question: 'Ücretsiz deneme nasıl işler?',
    answer: `${trialSentence()}${trialPlanName() ? ` Deneme, ${trialPlanName()} planının limitleriyle çalışır;` : ''} devam etmek istediğinizde uygulama içinden işinize uygun planı seçersiniz.`,
    evidence: [...trialEvidence(), evidence(SUBSCRIPTION_VIEW, 'Abonelik ekranı plan geçişi', 'Bu Plana Geç')],
  },
  {
    id: 'plan-secimi',
    category: 'fiyat-plan',
    question: 'Hangi plan işletmeme uygun?',
    answer: `Planlar bağlamak istediğiniz kanal sayısına, yönettiğiniz ürün varyantı hacmine ve ekibinizdeki kullanıcı sayısına göre ayrılır. ${joinTr(fixedPlanNames())} planları sabit aylık fiyatlıdır${quotePlanName() ? `; özel limitlere ihtiyaç duyan işletmeler için ${quotePlanName()} planında size özel teklif hazırlanır` : ''}.`,
    evidence: [evidence(PLAN_SEED, 'Plans seed: limit alanları', '"limits": { "channels"')],
  },
  {
    id: 'kurumsal-teklif',
    category: 'fiyat-plan',
    question: 'Yüksek hacimli operasyonlar için özel teklif alabilir miyim?',
    answer: `Evet. ${quotePlanName() ?? 'Kurumsal'} planda kanal, ürün varyantı ve kullanıcı limitleri ihtiyacınıza göre belirlenir. İletişim sayfasından bize ulaşın; operasyonunuza uygun kapsamı birlikte planlayalım.`,
    evidence: [evidence(PLAN_SEED, 'Plans seed: özel teklif limitleri', 'Özel teklif: limitler')],
  },

  // ------------------------------------------------------------------------------ Destek ve ölçeklenme
  {
    id: 'destek',
    category: 'destek-olcek',
    question: 'Bir sorun yaşadığımda nasıl destek alırım?',
    answer:
      'Uygulamadaki destek ekranından talep oluşturabilir, süreci aynı ekranda mesajlaşarak takip edebilirsiniz. Satış öncesi sorularınız için iletişim sayfasından bize ulaşabilirsiniz.',
    evidence: [
      evidence('backend/src/api/services/ticket-service.ts', 'Destek talebi açma', 'async openTicket'),
      evidence('backend/src/api/services/ticket-service.ts', 'Destek talebi mesajlaşma', 'async sendTicketMessage'),
    ],
    internalNotes: ['Destek saatleri / yanıt süresi / kanal (telefon, canlı sohbet) iddiası YAPILMAZ — ürün sahibi kararı.'],
  },
  {
    id: 'plan-yukseltme',
    category: 'destek-olcek',
    question: 'İşim büyüdüğünde planımı yükseltebilir miyim?',
    answer:
      'Evet. Kanal, ürün veya ekip sayınız arttığında uygulamadaki Abonelik ve Planlar ekranından daha kapsamlı bir plana geçebilirsiniz. Standart limitlerin ötesine geçtiğinizde size özel teklif hazırlarız.',
    evidence: [
      evidence(SUBSCRIPTION_VIEW, 'Abonelik ekranı plan geçişi', 'Bu Plana Geç'),
      evidence(PLAN_SEED, 'Plans seed: özel teklif limitleri', 'Özel teklif: limitler'),
    ],
  },
  {
    id: 'olceklenme',
    category: 'destek-olcek',
    question: 'Satış hacmim arttıkça Entegrasyonik benimle birlikte ölçeklenir mi?',
    answer:
      'Entegrasyonik çok kanallı operasyonları büyütmek için tasarlandı. Pazaryerlerinde yaşanan geçici aksaklıklar kontrollü biçimde yönetilir; işlemler bağlantı toparlandığında yeniden denenir. Kanal, ürün veya kullanıcı kapasitesine ihtiyaç duyduğunuzda planınızı yükseltmeniz yeterlidir.',
    evidence: [
      evidence('backend/src/integration/modules/common/http/ResilientHttpClient.ts', 'ResilientHttpClient devre kesici', 'circuitBreaker'),
      evidence('docs/adr/0006-dayaniklilik-katmani-ve-surec-topolojisi.md', 'ADR-0006 dayanıklılık katmanı', 'Dayanıklılık katmanı'),
    ],
    internalNotes: ['Performans/ölçek sayısı (istek/sn, SKU/sn) iddiası YAPILMAZ.'],
  },
  {
    id: 'pazaryeri-kesinti',
    category: 'destek-olcek',
    question: 'Pazaryeri tarafında bir kesinti olursa ne olur?',
    // S27c (K44): SSS'de fayda dili; teknik özet (zaman aşımı, devre kesici) yalnız /guvenlik "Ayrıntı" panelinde.
    answer: `Geçici bir aksaklıkta işlemler kontrollü biçimde yeniden denenir; art arda hata veren bir bağlantı kısa süre bekletilir, ardından tekrar denenir. Bu yaklaşım geçici hataları yönetir; pazaryeri tarafındaki kesintiyi ortadan kaldırmaz.`,
    evidence: [
      evidence('backend/src/integration/modules/common/http/ResilientHttpClient.ts', 'ResilientHttpClient devre kesici', 'circuitBreaker'),
      evidence('docs/adr/0006-dayaniklilik-katmani-ve-surec-topolojisi.md', 'ADR-0006 dayanıklılık katmanı', 'Dayanıklılık katmanı'),
    ],
  },
]

// Her kategoride en az bir soru, her soru bilinen bir kategoride (derleme zamanında sessiz kayıp olmasın).
for (const c of FAQ_CATEGORIES) {
  if (!faq.some((f) => f.category === c.id)) throw new Error(`SSS: "${c.id}" kategorisi boş`)
}

/** Sayfaların tek girişi (evidence/internalNotes atılır); kategori sırasıyla. */
export function getPublicFaq(): PublicFaqItem[] {
  const order = FAQ_CATEGORIES.map((c) => c.id)
  return [...faq]
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
    .map(({ id, category, question, answer }) => ({ id, category, question, answer }))
}

/** Görünen kategori listesi + her kategorinin soruları (sayfa gruplaması için). */
export function getPublicFaqByCategory(): Array<FaqCategory & { items: PublicFaqItem[] }> {
  const all = getPublicFaq()
  return FAQ_CATEGORIES.map((c) => ({ ...c, items: all.filter((f) => f.category === c.id) }))
}

/** Ana sayfa önizlemesi: satın alma kararında en çok sorulan sorular (sıra = gösterim sırası). */
export const FAQ_PREVIEW_IDS = [
  'nasil-baslarim',
  'teknik-bilgi',
  'asiri-satis',
  'stok-senkron',
  'hangi-entegrasyonlar',
  'anahtar-saklama',
  'deneme',
  'plan-yukseltme',
] as const

export function getFaqPreview(): PublicFaqItem[] {
  const all = getPublicFaq()
  return FAQ_PREVIEW_IDS.map((id) => {
    const item = all.find((f) => f.id === id)
    if (!item) throw new Error(`SSS önizleme: "${id}" bulunamadı`)
    return item
  })
}


// ---------------------------------------------------------------------------- S14: destek merkezi (/destek)

/**
 * Destek merkezi kategorileri (S14). YENİ içerik üretmez: her kategori mevcut SSS kayıtlarını (`faqIds`) ve site
 * sayfalarını (`links`) derler; "Kanal bağlama" kategorisi ayrıca her mevcut entegrasyonun bağlantı rehberine
 * (`/entegrasyonlar/[kod]`) bağlanır (`channelGuides`). Her SSS kaydı en az bir kategoride yer alır
 * (tests/claims.test.ts). `lead` kısa pazarlama kopyasıdır; olgu içermez.
 */
export type SupportCategoryId = 'baslangic-kurulum' | 'kanal-baglama' | 'stok-siparis' | 'hesap-guvenlik' | 'fiyat-fatura'

export interface SupportCategory {
  id: SupportCategoryId
  label: string
  lead: string
  icon: 'bolt' | 'plug' | 'stock' | 'shield' | 'card'
  faqIds: string[]
  links: Array<{ label: string; href: string }>
  channelGuides?: boolean
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    id: 'baslangic-kurulum',
    label: 'Başlangıç ve kurulum',
    lead: 'Hesabınızı açın, kanallarınızı bağlayın ve ürünlerinizi tek merkezde toplayın.',
    icon: 'bolt',
    faqIds: ['nasil-baslarim', 'teknik-bilgi', 'urun-aktarimi', 'destek'],
    links: [{ label: 'Özellikleri inceleyin', href: '/ozellikler' }],
  },
  {
    id: 'kanal-baglama',
    label: 'Kanal bağlama',
    lead: 'Her kanal için gereken bilgiler, adım adım bağlantı rehberi ve kanal bazında kapsam.',
    icon: 'plug',
    faqIds: ['baglanti-bilgileri', 'hangi-entegrasyonlar', 'kapsam-ayni-mi', 'erp-baglantisi', 'yeni-kanal', 'pazaryeri-kesinti'],
    links: [{ label: 'Tüm entegrasyonlar', href: '/entegrasyonlar' }],
    channelGuides: true,
  },
  {
    id: 'stok-siparis',
    label: 'Stok ve sipariş',
    lead: 'Merkezi stok, aşırı satış koruması, sipariş, iade ve kargo bildirimi.',
    icon: 'stock',
    faqIds: ['asiri-satis', 'stok-senkron', 'siparis-yonetimi', 'iade-soru', 'kargo-bilgisi'],
    links: [{ label: 'Stok rezervasyonu nasıl çalışır', href: '/ozellikler/stok-rezervasyonu' }],
  },
  {
    id: 'hesap-guvenlik',
    label: 'Hesap ve güvenlik',
    lead: 'API anahtarlarınızın, verilerinizin ve ekip yetkilerinizin nasıl korunduğu.',
    icon: 'shield',
    faqIds: ['anahtar-saklama', 'veri-ayrimi', 'ekip-yetki', 'kart-bilgisi', 'secim-kriterleri'],
    links: [{ label: 'Güvenlik yaklaşımımız', href: '/guvenlik' }],
  },
  {
    id: 'fiyat-fatura',
    label: 'Fiyat ve fatura',
    lead: 'Ücretsiz deneme, plan seçimi, plan yükseltme ve kurumsal teklif.',
    icon: 'card',
    faqIds: ['deneme', 'plan-secimi', 'plan-yukseltme', 'kurumsal-teklif', 'olceklenme'],
    links: [{ label: 'Planları karşılaştırın', href: '/fiyatlandirma' }],
  },
]

export interface PublicSupportCategory extends Omit<SupportCategory, 'faqIds'> {
  items: PublicFaqItem[]
}

/** Sayfaların tek girişi: SSS kayıtları kimlikten çözülür (bilinmeyen kimlik derleme hatasıdır). */
export function getSupportCategories(): PublicSupportCategory[] {
  const all = getPublicFaq()
  return SUPPORT_CATEGORIES.map(({ faqIds, ...c }) => ({
    ...c,
    links: c.links.map((l) => ({ ...l })),
    items: faqIds.map((id) => {
      const item = all.find((f) => f.id === id)
      if (!item) throw new Error(`Destek merkezi: SSS kaydı bulunamadı: ${id}`)
      return item
    }),
  }))
}

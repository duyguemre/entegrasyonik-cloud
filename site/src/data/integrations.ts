/**
 * Entegrasyon iddia kaydı (ADR-0014 Karar 2/5).
 *
 * - `status: 'available'` YALNIZCA `IntegrationFactory.ts`'in kabul ettiği 6 koddur (test eşitliği doğrular).
 * - Yetenekler `INTEGRATIONS_REGISTRY.md`'den alınmıştır; doğrulanmamış / salt-okuma / kopuk akışlar
 *   `level: 'limited'` ile işaretlenir veya hiç yazılmaz (`notProvided`).
 * - Hiçbir entegrasyon "canlı pazaryeri API'siyle doğrulandı" diye sunulamaz (`verification.liveApi=false`;
 *   bkz. docs/research/2026-09-27-api-verification.md). Kanıt: kod + mock ortamı.
 * - `status: 'roadmap'` öğeleri (Amazon, Çiçeksepeti, kargo firmaları, Paraşüt, e-fatura...) GİZLİDİR
 *   (`ROADMAP_VISIBLE=false`, ADR Açık Soru 5). Sayfalar yalnızca `getPublicIntegrations()` /
 *   `getPublicRoadmap()` kullanır; ikincisi gizliyken daima boş dizi döner.
 * - `internalNotes` ve `evidence` görünür içerik DEĞİLDİR; hiçbir seçici bunları döndürmez.
 */
import { PATHS, ROADMAP_VISIBLE, evidence, registry, type EvidenceRef } from './evidence'

export type IntegrationKind = 'marketplace' | 'ecommerce' | 'erp' | 'shipping' | 'einvoice'
export type IntegrationStatus = 'available' | 'roadmap'
export type CoverageLevel = 'broad' | 'partial' | 'limited'
export type CapabilityLevel = 'supported' | 'limited'
export type CapabilityKey =
  | 'products'
  | 'stockPrice'
  | 'orders'
  | 'orderActions'
  | 'returns'
  | 'questions'
  | 'finance'
  | 'shippingNotice'
  | 'invoiceNotice'
  | 'categories'

export interface IntegrationCapability {
  key: CapabilityKey
  level: CapabilityLevel
  /** Görünür, kısa ve doğrulanabilir açıklama. */
  note: string
  evidence: EvidenceRef[]
}

export interface Integration {
  /** Available için `IntegrationFactory` kodu (küçük harf); roadmap için site içi anahtar. */
  code: string
  name: string
  kind: IntegrationKind
  status: IntegrationStatus
  summary: string
  coverage: CoverageLevel
  capabilities: IntegrationCapability[]
  /** Görünür: bu entegrasyonda bilinçli olarak SUNULMAYAN işlemler. */
  notProvided: string[]
  /** Görünür: kullanıcıyı yanıltmamak için açıkça yazılan sınırlar. */
  limitations: string[]
  /** Yol haritası öğelerinin yasaklı-ifade taramasında da yakalanacak alternatif adları. */
  aliases: string[]
  verification: { liveApi: false; mockEnvironment: boolean }
  evidence: EvidenceRef[]
  /** Görünür DEĞİL: sayfalara verilmez. */
  internalNotes: string[]
}

export const KIND_LABELS: Record<IntegrationKind, string> = {
  marketplace: 'Pazaryeri',
  ecommerce: 'E-ticaret',
  erp: 'ERP / Muhasebe',
  shipping: 'Kargo',
  einvoice: 'Fatura',
}

/**
 * Durum rozeti (S16). YALNIZCA kayıttaki `status` alanından türetilir: `available` = IntegrationFactory'de gerçekten
 * uygulanmış kod. "Canlı" yerine "Kullanılabilir" denir — hiçbir entegrasyon canlı pazaryeri API'siyle doğrulanmış
 * sayılmaz (`verification.liveApi=false`). Yol haritası öğeleri gizli olduğu için onlara rozet metni tanımlanmaz.
 */
export const STATUS_LABELS: Record<Extract<IntegrationStatus, 'available'>, string> = {
  available: 'Kullanılabilir',
}

export const COVERAGE_LABELS: Record<CoverageLevel, string> = {
  broad: 'Geniş kapsam',
  partial: 'Kısmi kapsam',
  limited: 'Temel kapsam',
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  products: 'Ürün yönetimi',
  stockPrice: 'Stok ve fiyat güncelleme',
  orders: 'Sipariş çekme',
  orderActions: 'Sipariş işlemleri',
  returns: 'İade ve talep yönetimi',
  questions: 'Soru-cevap',
  finance: 'Finans ve hakediş',
  shippingNotice: 'Kargo bilgisi bildirimi',
  invoiceNotice: 'Fatura bilgisi bildirimi',
  categories: 'Kategori ve marka',
}

export const CAPABILITY_LEVEL_LABELS: Record<CapabilityLevel, string> = {
  supported: 'Destekleniyor',
  limited: 'Temel düzeyde',
}

const M = 'backend/src/integration/modules'

const cap = (
  key: CapabilityKey,
  level: CapabilityLevel,
  note: string,
  ...refs: EvidenceRef[]
): IntegrationCapability => ({ key, level, note, evidence: refs })

const code = (path: string, ref: string, contains?: string): EvidenceRef => evidence(`${M}/${path}`, ref, contains)

const MOCK_ONLY = { liveApi: false, mockEnvironment: true } as const

export const integrations: Integration[] = [
  // ------------------------------------------------------------------------------------ Trendyol
  {
    code: 'trendyol',
    name: 'Trendyol',
    kind: 'marketplace',
    status: 'available',
    summary: 'Ürün, stok, sipariş, iade, soru-cevap ve finans süreçlerini tek panelden yönetin.',
    coverage: 'broad',
    capabilities: [
      cap(
        'products',
        'supported',
        'Ürün aktarımı, içerik, varyant ve teslimat güncelleme; toplu işlem durumu sorgulama.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts transferProducts', 'transferProducts'),
      ),
      cap(
        'stockPrice',
        'supported',
        'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts updateProductStock', 'updateProductStock'),
      ),
      cap(
        'orders',
        'supported',
        'Siparişler tüm sayfalar taranarak çekilir.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'orderActions',
        'supported',
        'Sipariş reddetme desteklenir; Trendyol siparişleri kendisi onayladığı için ayrı onay adımı yoktur.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts rejectOrder', 'rejectOrder'),
      ),
      cap(
        'returns',
        'supported',
        'İade talepleri listelenir; onaylanır veya red nedeniyle reddedilir.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts approveClaim', 'approveClaim'),
      ),
      cap(
        'questions',
        'supported',
        'Alıcı soruları listelenir ve cevaplanır.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts answerMessage', 'answerMessage'),
      ),
      cap(
        'finance',
        'supported',
        'Hakediş, diğer finansal hareketler, kargo faturası ve ödeme emri görünümü.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts retrieveFinancials', 'retrieveFinancials'),
      ),
      cap(
        'shippingNotice',
        'limited',
        'Kargo takip bilgisi elle girilir ve pazaryerine iletilir; kargo firması ile otomatik etiket veya barkod akışı yoktur.',
        registry('§5.1', '### 5.1 Kargo entegrasyonları'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts sendOrderShipping', 'sendOrderShipping'),
      ),
      cap(
        'invoiceNotice',
        'supported',
        'Fatura bağlantısı pazaryerine iletilir.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts sendOrderInvoice', 'sendOrderInvoice'),
      ),
      cap(
        'categories',
        'supported',
        'Kategori, nitelik, marka ve komisyon bilgisi pazaryerinden alınır.',
        registry('§2.1', '### 2.1 Trendyol'),
        code('marketplace/trendyol/index.ts', 'trendyol/index.ts retrieveCategories', 'retrieveCategories'),
      ),
    ],
    notProvided: [],
    limitations: ['Kargo takip bilgisi otomatik değil, elle girilerek iletilir.'],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§2.1', '### 2.1 Trendyol'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'trendyol'"),
    ],
    internalNotes: [
      'Gerçek Trendyol kimliğiyle uçtan uca test yok; varsayılan host/yol ve User-Agent bulguları için BACKLOG C21 (docs/research/2026-09-27-api-verification.md).',
      'sendOrderShipping paket kimliği eşleşmesi doğrulanamadı (INTEGRATIONS_REGISTRY §2.1 bulgu 4) — bu yüzden shippingNotice = limited.',
    ],
  },

  // ------------------------------------------------------------------------------------ Hepsiburada
  {
    code: 'hepsiburada',
    name: 'Hepsiburada',
    kind: 'marketplace',
    status: 'available',
    summary: 'Ürün, stok, sipariş ve iade süreçlerini yönetin; finans görünümü kısmidir.',
    coverage: 'partial',
    capabilities: [
      cap(
        'products',
        'supported',
        'Ürün aktarımı, içerik güncelleme ve toplu işlem durumu sorgulama.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts transferProducts', 'transferProducts'),
      ),
      cap(
        'stockPrice',
        'supported',
        'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts updateProductStock', 'updateProductStock'),
      ),
      cap(
        'orders',
        'limited',
        'Sipariş çekimi sayfalamasızdır; tek seferde sınırlı sayıda sipariş alınır.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'orderActions',
        'supported',
        'Sipariş reddetme ve paket oluşturma desteklenir.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts rejectOrder', 'rejectOrder'),
      ),
      cap(
        'returns',
        'supported',
        'İade talepleri listelenir, onaylanır veya reddedilir.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts approveClaim', 'approveClaim'),
      ),
      cap(
        'questions',
        'limited',
        'Soru servisi mevcuttur; kapsamı bu sürümde sınırlıdır.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts retrieveMessages', 'retrieveMessages'),
      ),
      cap(
        'finance',
        'limited',
        'Hakediş görünümü kısmidir.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts retrieveFinancials', 'retrieveFinancials'),
      ),
      cap(
        'shippingNotice',
        'limited',
        'Paket oluşturulur; takip bilgisinin pazaryerine iletimi bu sürümde doğrulanmamıştır.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts sendOrderShipping', 'sendOrderShipping'),
      ),
      cap(
        'invoiceNotice',
        'supported',
        'Fatura bağlantısı pazaryerine iletilir.',
        registry('§2.2', '### 2.2 Hepsiburada'),
        code('marketplace/hepsiburada/index.ts', 'hepsiburada/index.ts sendOrderInvoice', 'sendOrderInvoice'),
      ),
    ],
    notProvided: ['Varyant güncelleme', 'Teslimat güncelleme', 'Kargo faturası ve komisyon bilgisi'],
    limitations: [
      'Sipariş çekimi sayfalamasızdır.',
      'Finans (hakediş) görünümü kısmidir.',
      'Kargo takip bilgisinin iletimi bu sürümde doğrulanmamıştır.',
    ],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§2.2', '### 2.2 Hepsiburada'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'hepsiburada'"),
    ],
    internalNotes: [
      'updateProductVariant/updateProductDelivery gerçek çağrı yapmadan başarılı dönen STUB (registry §2.2) — capability listesine yazılmadı.',
      'Sipariş uç noktası (mpop vs oms-external) doğrulanamadı (docs/research/2026-09-27-api-verification.md).',
    ],
  },

  // ------------------------------------------------------------------------------------ N11
  {
    code: 'n11',
    name: 'N11',
    kind: 'marketplace',
    status: 'available',
    summary: 'Ürün, stok, sipariş, iade ve soru süreçlerini yönetin; sipariş onay ve red adımları desteklenmez.',
    coverage: 'partial',
    capabilities: [
      cap(
        'products',
        'supported',
        'Ürün aktarımı ve güncelleme toplu görev akışıyla yapılır.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts transferProducts', 'transferProducts'),
      ),
      cap(
        'stockPrice',
        'supported',
        'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts updateProductStock', 'updateProductStock'),
      ),
      cap(
        'orders',
        'limited',
        'Siparişler çekilir; çekim tek sayfa ile sınırlıdır.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'returns',
        'limited',
        'Yalnızca yeni iade talepleri ve yalnızca ilk sayfa listelenir.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts retrieveClaims', 'retrieveClaims'),
      ),
      cap(
        'questions',
        'limited',
        'Yalnızca açık sorular ve yalnızca ilk sayfa listelenir.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts retrieveMessages', 'retrieveMessages'),
      ),
      cap(
        'finance',
        'limited',
        'Hakediş görünümü kısmidir; ilk sayfa ile sınırlıdır.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts retrieveFinancials', 'retrieveFinancials'),
      ),
      cap(
        'shippingNotice',
        'limited',
        'Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts sendOrderShipping', 'sendOrderShipping'),
      ),
      cap(
        'invoiceNotice',
        'supported',
        'Fatura bağlantısı pazaryerine iletilir.',
        registry('§2.3', '### 2.3 N11'),
        code('marketplace/n11/index.ts', 'n11/index.ts sendOrderInvoice', 'sendOrderInvoice'),
      ),
    ],
    notProvided: ['Sipariş onaylama ve reddetme', 'Marka, kargo faturası ve ödeme emri bilgisi'],
    limitations: [
      'Sipariş onaylama ve reddetme bu sürümde desteklenmez; işlem hata olarak bildirilir.',
      'İade, soru ve hakediş listeleri ilk sayfa ile sınırlıdır.',
    ],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§2.3', '### 2.3 N11'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'n11'"),
    ],
    internalNotes: [
      'approveOrder/rejectOrder ADR-0006 B2 sonrası NOT_SUPPORTED fırlatır (BACKLOG C9); orderActions capability listesine yazılmadı.',
      'SOAP servislerinin gelecekteki durumu doğrulanamadı (docs/research/2026-09-27-api-verification.md).',
    ],
  },

  // ------------------------------------------------------------------------------------ Pazarama
  {
    code: 'pazarama',
    name: 'Pazarama',
    kind: 'marketplace',
    status: 'available',
    summary: 'Ürün, stok, sipariş, iade, mesaj ve finans süreçlerini tek panelden yönetin.',
    coverage: 'broad',
    capabilities: [
      cap(
        'products',
        'supported',
        'Ürün aktarımı ve güncelleme toplu işlem akışıyla yapılır.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts transferProducts', 'transferProducts'),
      ),
      cap(
        'stockPrice',
        'supported',
        'Stok ve fiyat güncellemeleri pazaryerine iletilir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts updateProductStock', 'updateProductStock'),
      ),
      cap(
        'orders',
        'supported',
        'Siparişler çekilir; sipariş durumu, kargo ve fatura bağlantısı güncellenir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'orderActions',
        'supported',
        'Sipariş reddetme desteklenir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts rejectOrder', 'rejectOrder'),
      ),
      cap(
        'returns',
        'supported',
        'İade talepleri onaylanır, reddedilir, incelemeye gönderilir veya revize edilir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts approveClaim', 'approveClaim'),
      ),
      cap(
        'questions',
        'supported',
        'Alıcı mesajları listelenir ve cevaplanır.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts answerMessage', 'answerMessage'),
      ),
      cap(
        'finance',
        'limited',
        'Hakediş görünümü mevcuttur; ödeme emrine göre ayrıntı sorgusu bu sürümde yoktur.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts retrieveFinancials', 'retrieveFinancials'),
      ),
      cap(
        'shippingNotice',
        'limited',
        'Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts sendOrderShipping', 'sendOrderShipping'),
      ),
      cap(
        'invoiceNotice',
        'supported',
        'Fatura bağlantısı pazaryerine iletilir.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts sendOrderInvoice', 'sendOrderInvoice'),
      ),
      cap(
        'categories',
        'supported',
        'Kategori, marka ve komisyon bilgisi pazaryerinden alınır.',
        registry('§2.4', '### 2.4 Pazarama'),
        code('marketplace/pazarama/index.ts', 'pazarama/index.ts retrieveCategories', 'retrieveCategories'),
      ),
    ],
    notProvided: ['Ödeme emrine göre hakediş ayrıntısı'],
    limitations: ['Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.'],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§2.4', '### 2.4 Pazarama'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'pazarama'"),
    ],
    internalNotes: [
      'Sipariş çekimi sayfalaması doğrulanamadı (registry §2.4); resmi rate limit bilinmiyor (registry §2.4 ADR-0006 B2 notu).',
      'Resmi doküman satıcı paneli arkasında; gerçek API ile uyum doğrulanamadı.',
    ],
  },

  // ------------------------------------------------------------------------------------ Ideasoft
  {
    code: 'ideasoft',
    name: 'Ideasoft',
    kind: 'ecommerce',
    status: 'available',
    summary: 'Ideasoft mağazanızdaki ürün ve siparişleri yönetin; gerçek mağaza bağlantısı bu sürümde sınırlıdır.',
    coverage: 'limited',
    capabilities: [
      cap(
        'products',
        'limited',
        'Ürün oluşturma, fiyat, stok ve içerik güncelleme; kategori ve marka yönetimi.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts transferProducts', 'transferProducts'),
      ),
      cap(
        'stockPrice',
        'limited',
        'Stok ve fiyat güncellemeleri mağazaya iletilir.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts updateProductStock', 'updateProductStock'),
      ),
      cap(
        'orders',
        'limited',
        'Siparişler sayfalı olarak çekilir.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'orderActions',
        'limited',
        'Sipariş hazırlanıyor, iptal ve kargolandı durumları güncellenir.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts approveOrder', 'approveOrder'),
      ),
      cap(
        'shippingNotice',
        'limited',
        'Kargolandı durumu ve takip numarası mağazaya iletilir.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts sendOrderShipping', 'sendOrderShipping'),
      ),
      cap(
        'categories',
        'limited',
        'Kategori ve marka bilgisi mağazadan alınır.',
        registry('§3.1', '### 3.1 Ideasoft'),
        code('ecommerce/ideasoft/index.ts', 'ideasoft/index.ts retrieveBrands', 'retrieveBrands'),
      ),
    ],
    notProvided: ['İade yönetimi', 'Mesaj yönetimi', 'Finans görünümü', 'Fatura bilgisi bildirimi'],
    limitations: [
      'Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test ortamında çalışır.',
    ],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§3.1', '### 3.1 Ideasoft'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'ideasoft'"),
    ],
    internalNotes: [
      'Gerçek modda token akışı KOPUK (registry §3.1 KRİTİK bulgular 1-3): Ideasoft.init() çağrılmıyor, backend retrieveAndSetExternalToken gövdesi boş. Bu yüzden coverage=limited ve tüm yetenekler limited.',
      'sendOrderInvoice no-op success:true — yetenek listesine yazılmadı.',
    ],
  },

  // ------------------------------------------------------------------------------------ Bizimhesap
  {
    code: 'bizimhesap',
    name: 'Bizimhesap',
    kind: 'erp',
    status: 'available',
    summary: 'Bizimhesap ürün kataloğunu ve siparişlerini yalnızca okuma olarak alın.',
    coverage: 'limited',
    capabilities: [
      cap(
        'products',
        'limited',
        'Ürünler ERP kaynağından yalnızca okunur; Bizimhesap tarafına ürün yazılmaz.',
        registry('§4.1', '### 4.1 Bizimhesap'),
        code('erp/bizimhesap/index.ts', 'bizimhesap/index.ts streamProducts', 'streamProducts'),
      ),
      cap(
        'orders',
        'limited',
        'Siparişler yalnızca okunur; otomatik zamanlanmış sipariş çekimine dahil değildir.',
        registry('§4.1', '### 4.1 Bizimhesap'),
        code('erp/bizimhesap/index.ts', 'bizimhesap/index.ts retrieveOrders', 'retrieveOrders'),
      ),
      cap(
        'categories',
        'limited',
        'Kategori ve marka bilgisi ürün kataloğundan türetilir.',
        registry('§4.1', '### 4.1 Bizimhesap'),
        code('erp/bizimhesap/index.ts', 'bizimhesap/index.ts retrieveCategories', 'retrieveCategories'),
      ),
    ],
    notProvided: [
      'Ürün ve stok yazma',
      'Sipariş onaylama, reddetme, kargo ve fatura işlemleri',
      'İade, mesaj ve finans',
      'Fatura oluşturma',
    ],
    limitations: [
      'Yalnızca okuma: Bizimhesap tarafına ürün, stok veya fatura yazılmaz.',
      'Sipariş okuma otomatik zamanlanmış çekime dahil değildir.',
    ],
    aliases: [],
    verification: MOCK_ONLY,
    evidence: [
      registry('§4.1', '### 4.1 Bizimhesap'),
      evidence(PATHS.factory, 'IntegrationFactory kabul ettiği kod', "case 'bizimhesap'"),
    ],
    internalNotes: [
      'Gerçek Bizimhesap API uyumu doğrulanamadı; şekil mock’a dayanıyor (registry §4.1 bulgular; docs/research/2026-09-27-api-verification.md).',
      'Sipariş üreticisi erp tipini taramıyor (OrderQueueProducer) — sipariş çekimi otomatik tetiklenmiyor.',
    ],
  },

  // ============================================================================ ROADMAP (GİZLİ)
  // Aşağıdakilerin HİÇBİRİ implemente değildir. `ROADMAP_VISIBLE=false` iken sayfalara verilmez.
  ...(
    [
      {
        code: 'amazon',
        name: 'Amazon',
        kind: 'marketplace',
        aliases: [],
        proof: evidence(PATHS.backlog, 'BACKLOG.md Yeni entegrasyon adayları (Amazon)', "Amazon (Türkiye/global satıcı API'si"),
      },
      {
        code: 'ciceksepeti',
        name: 'Çiçeksepeti',
        kind: 'marketplace',
        aliases: ['Ciceksepeti'],
        proof: evidence(PATHS.backlog, 'BACKLOG.md Yeni entegrasyon adayları (Çiçeksepeti)', 'Çiçeksepeti (pazaryeri/satıcı programı)'),
      },
      {
        code: 'surat-kargo',
        name: 'Sürat Kargo',
        kind: 'shipping',
        aliases: [],
        proof: evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §5.1 kargo API entegrasyonu yok', '### 5.1 Kargo entegrasyonları'),
      },
      {
        code: 'aras-kargo',
        name: 'Aras Kargo',
        kind: 'shipping',
        aliases: [],
        proof: evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §5.1 kargo API entegrasyonu yok', '### 5.1 Kargo entegrasyonları'),
      },
      {
        code: 'yurtici-kargo',
        name: 'Yurtiçi Kargo',
        kind: 'shipping',
        aliases: [],
        proof: evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §5.1 kargo API entegrasyonu yok', '### 5.1 Kargo entegrasyonları'),
      },
      {
        code: 'ptt-kargo',
        name: 'PTT Kargo',
        kind: 'shipping',
        aliases: ['PTT'],
        proof: evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §5.1 PTT yalnızca UI formu', '### 5.1 Kargo entegrasyonları'),
      },
      {
        code: 'parasut',
        name: 'Paraşüt',
        kind: 'erp',
        aliases: ['Parasut'],
        proof: evidence(PATHS.backlog, 'BACKLOG.md Yeni entegrasyon adayları (Paraşüt)', 'Paraşüt (bulut muhasebe'),
      },
      {
        code: 'e-fatura',
        name: 'E-fatura sağlayıcıları',
        kind: 'einvoice',
        aliases: ['e-fatura', 'efatura', 'e-arşiv', 'earşiv', 'GİB', 'e-Logo', 'Turkcell e-Şirket', 'Trendyol e-Faturam'],
        proof: evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §5.2 e-fatura entegrasyonu yok', '### 5.2 E-fatura'),
      },
    ] as const
  ).map(
    (r): Integration => ({
      code: r.code,
      name: r.name,
      kind: r.kind,
      status: 'roadmap',
      summary: 'Planlanıyor.',
      coverage: 'limited',
      capabilities: [],
      notProvided: [],
      limitations: [],
      aliases: [...r.aliases],
      verification: MOCK_ONLY,
      evidence: [
        r.proof,
        evidence(PATHS.registry, 'INTEGRATIONS_REGISTRY.md §0 fabrika yalnızca 6 kod kabul eder', 'yalnızca 6 kod destekliyor'),
      ],
      internalNotes: ['Implemente değil; sitede yalnızca insan onayıyla (ADR-0014 Açık Soru 5) "planlanıyor" olarak gösterilir.'],
    }),
  ),
]

// ---------------------------------------------------------------------------- Seçiciler (sayfaların tek girişi)

export interface PublicCapability {
  key: CapabilityKey
  label: string
  level: CapabilityLevel
  levelLabel: string
  note: string
}

export interface PublicIntegration {
  code: string
  name: string
  kind: IntegrationKind
  kindLabel: string
  statusLabel: string
  summary: string
  coverage: CoverageLevel
  coverageLabel: string
  capabilities: PublicCapability[]
  notProvided: string[]
  limitations: string[]
}

const toPublic = (i: Integration): PublicIntegration => ({
  code: i.code,
  name: i.name,
  kind: i.kind,
  kindLabel: KIND_LABELS[i.kind],
  statusLabel: STATUS_LABELS.available,
  summary: i.summary,
  coverage: i.coverage,
  coverageLabel: COVERAGE_LABELS[i.coverage],
  capabilities: i.capabilities.map((c) => ({
    key: c.key,
    label: CAPABILITY_LABELS[c.key],
    level: c.level,
    levelLabel: CAPABILITY_LEVEL_LABELS[c.level],
    note: c.note,
  })),
  notProvided: [...i.notProvided],
  limitations: [...i.limitations],
})

/** `IntegrationFactory`'deki gerçek kodlar (yalnızca `available`). */
export const AVAILABLE_INTEGRATION_CODES: string[] = integrations
  .filter((i) => i.status === 'available')
  .map((i) => i.code)

/** Mevcut (implemente) entegrasyonlar — sayfaların vitrin/detay kaynağı. */
export function getPublicIntegrations(kind?: IntegrationKind): PublicIntegration[] {
  return integrations
    .filter((i) => i.status === 'available' && (!kind || i.kind === kind))
    .map(toPublic)
}

export function getPublicIntegration(code: string): PublicIntegration | undefined {
  return getPublicIntegrations().find((i) => i.code === code)
}

/** Yol haritası öğeleri: `ROADMAP_VISIBLE=false` iken DAİMA boş dizi (ADR-0014 Karar 5). */
export function getPublicRoadmap(): Array<Pick<PublicIntegration, 'code' | 'name' | 'kind' | 'kindLabel' | 'summary'>> {
  if (!ROADMAP_VISIBLE) return []
  return integrations
    .filter((i) => i.status === 'roadmap')
    .map((i) => ({ code: i.code, name: i.name, kind: i.kind, kindLabel: KIND_LABELS[i.kind], summary: i.summary }))
}

/** Görünür-içerik taraması için: sayfalara verilen HER şeyin birleşimi (evidence/internalNotes YOK). */
export function collectPublicIntegrationContent(): unknown {
  return { integrations: getPublicIntegrations(), roadmap: getPublicRoadmap() }
}

// ---------------------------------------------------------------------------- Ana sayfa: entegrasyon vizyonu (S12)

/**
 * Ana sayfa "entegrasyon ekosistemi" düğümleri — pazarlama/vizyon dili. Kanal ADI içermez (ana mesajda
 * pazaryeri isimleri öne çıkmaz); kanal ayrımı yalnızca `channelCodes` ile isimsiz renkli noktadır.
 * Dürüstlük: her düğüm kayıttaki GERÇEK bir yeteneğe dayanır (`kinds` → mevcut entegrasyon türü; `capabilityKeys`
 * → en az bir mevcut entegrasyonda kayıtlı yetenek). Var olmayan bir bağlantı (kargo firması API'si vb.)
 * iddia edilmez: "Kargo ve fatura" düğümü yalnızca takip bilgisinin ve fatura bağlantısının pazaryerine
 * iletilmesini anlatır. tests/claims.test.ts bu bağları denetler.
 */
export interface EcosystemNode {
  id: string
  icon: 'layers' | 'link' | 'plug' | 'receipt'
  title: string
  line: string
  /** Bu düğümü besleyen mevcut entegrasyon türleri (renkli noktalar buradan türetilir). */
  kinds: IntegrationKind[]
  /** Türe bağlı olmayan düğüm için dayanak yetenekler. */
  capabilityKeys: CapabilityKey[]
}

export const ecosystemNodes: EcosystemNode[] = [
  {
    id: 'marketplaces',
    icon: 'layers',
    title: 'Pazaryerleri',
    line: 'Ürün, stok, sipariş ve satış sonrası süreçler tek akışta.',
    kinds: ['marketplace'],
    capabilityKeys: [],
  },
  {
    id: 'ecommerce',
    icon: 'link',
    title: 'E-ticaret altyapıları',
    line: 'Kendi mağazanızın ürün ve siparişleri aynı panelde.',
    kinds: ['ecommerce'],
    capabilityKeys: [],
  },
  {
    id: 'erp',
    icon: 'plug',
    title: 'ERP ve muhasebe',
    line: 'Ürün kataloğu ve siparişler iş sisteminizle aynı merkezde.',
    kinds: ['erp'],
    capabilityKeys: [],
  },
  {
    id: 'fulfilment',
    icon: 'receipt',
    title: 'Kargo ve fatura akışı',
    line: 'Takip bilgisi ve fatura bağlantısı siparişle birlikte pazaryerine iletilir.',
    kinds: [],
    capabilityKeys: ['shippingNotice', 'invoiceNotice'],
  },
]

export interface PublicEcosystemNode {
  id: string
  icon: EcosystemNode['icon']
  title: string
  line: string
  /** İsimsiz renkli nokta için kanal kodları (ad değil). */
  channelCodes: string[]
}

/** Ana sayfa vizyon düğümleri: dayanağı olmayan (mevcut entegrasyonu/yeteneği bulunmayan) düğüm DÖNMEZ. */
export function getEcosystemNodes(): PublicEcosystemNode[] {
  const available = integrations.filter((i) => i.status === 'available')
  return ecosystemNodes
    .map((n) => {
      const backing = available.filter(
        (i) => n.kinds.includes(i.kind) || i.capabilities.some((c) => n.capabilityKeys.includes(c.key)),
      )
      return { id: n.id, icon: n.icon, title: n.title, line: n.line, channelCodes: backing.map((i) => i.code) }
    })
    .filter((n) => n.channelCodes.length > 0)
}

/** Ekosistem şemasının altındaki üç vizyon cümlesi (S12). Yeni özellik iddiası yok; mevcut mimarinin özeti. */
export const ecosystemPromises: Array<{ id: string; title: string; line: string }> = [
  {
    id: 'single-source',
    title: 'Her kanal aynı bilgiyle',
    line: 'Ürün, stok ve fiyat bilgisi tek kaynaktan gelir; her kanal aynı bilgiyle çalışır.',
  },
  {
    id: 'one-flow',
    title: 'Siparişler aynı listede',
    line: 'Hangi kanaldan gelirse gelsin sipariş aynı listede, aynı adımlarla ilerler.',
  },
  {
    id: 'one-standard',
    title: 'Ekibiniz aynı düzende çalışır',
    line: 'Her kanal aynı ekrana bağlanır; ekibiniz kanal başına ayrı bir panel öğrenmez.',
  },
]

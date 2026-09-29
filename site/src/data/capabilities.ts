/**
 * Ürün yetenekleri ve güvenlik iddiaları (ADR-0014 Karar 2 ana sayfa "Yetenekler" + Karar 5 "Güvenlik").
 *
 * Kanal listeleri elle YAZILMAZ: `integrations.ts` yetenek kayıtlarından türetilir (tek doğruluk kaynağı,
 * drift yok). Uygulanmamış yetenekler (`status: 'roadmap'`) `ROADMAP_VISIBLE=false` iken hiçbir seçicide
 * görünmez. Görünür metinde sayısal/mutlak/doğrulanamaz iddia yok (tests/claims.test.ts korur).
 */
import {
  integrations,
  CAPABILITY_LABELS,
  type CapabilityKey,
  type CapabilityLevel,
  type IntegrationKind,
} from './integrations'
import { PATHS, ROADMAP_VISIBLE, evidence, registry, type EvidenceRef } from './evidence'

export type ProductCapabilityStatus = 'available' | 'partial' | 'roadmap'
export type CapabilityGroup = 'core' | 'security'

export const STATUS_LABELS: Record<ProductCapabilityStatus, string> = {
  available: 'Mevcut',
  partial: 'Kısmi',
  roadmap: 'Planlanıyor',
}

export interface ProductCapability {
  id: string
  group: CapabilityGroup
  title: string
  summary: string
  /** Görünür, dürüst sınır notu (kanal/kapsam kısıtı). Yalnızca alt sayfalarda (/ozellikler, /entegrasyonlar). */
  caveat?: string
  /**
   * Ana sayfa pazarlama metni (S12): kısa başlık + tek satır fayda cümlesi. Nihai ürün dilinde, durum/eksik
   * ifadesi yok; ama `summary` ile aynı olguya dayanır (yeni özellik uydurmaz). Kapsam farkları alt sayfalarda.
   */
  home?: { title: string; line: string }
  status: ProductCapabilityStatus
  /** Kanal listesi bu entegrasyon yeteneğinden veya türünden türetilir. */
  channelsFrom?: { key?: CapabilityKey; kind?: IntegrationKind }
  evidence: EvidenceRef[]
  /** Görünür DEĞİL. */
  internalNotes?: string[]
}

export const productCapabilities: ProductCapability[] = [
  // ------------------------------------------------------------------------------------ Çekirdek
  {
    id: 'stock-reservation',
    group: 'core',
    home: {
      title: 'Aşırı satışa karşı stok rezervasyonu',
      line: 'Eşzamanlı siparişlerde stok yalnızca mevcut adet kadar rezerve edilir; stok eksiye düşmez.',
    },
    title: 'Aşırı satışa karşı stok rezervasyonu',
    summary:
      'Aynı stok için eşzamanlı siparişlerde yalnızca mevcut stok kadar rezervasyon yapılır; stok eksiye düşmez. Stoku aşan sipariş aşırı satış olarak işaretlenir ve telafi akışına alınır.',
    caveat:
      'Pazaryerleri stok bilgisini kendi aralıklarıyla günceller; bu pencerede oluşan aşırı satış tespit edilir ve telafi akışına alınır.',
    status: 'available',
    evidence: [
      evidence(
        'backend/tests/integration/StockAllocator.concurrency.test.ts',
        'eşzamanlılık testi: paralel rezervasyonlarda yalnızca stok kadarı başarılı',
        'tam 10 RESERVED + 40 OVERSOLD',
      ),
      evidence(PATHS.adr0004, 'ADR-0004 telafi (oversell) akışı', 'Telafi (oversell)'),
    ],
  },
  {
    id: 'multi-channel-products',
    group: 'core',
    home: {
      title: 'Merkezi ürün ve stok yönetimi',
      line: 'Ürün, fiyat ve stok değişikliklerini tek yerden bağlı kanallarınıza iletin.',
    },
    title: 'Çoklu pazaryeri ürün, fiyat ve stok yönetimi',
    summary: 'Ürün, fiyat ve stok değişiklikleri bağlı kanallara tek yerden iletilir.',
    status: 'available',
    channelsFrom: { key: 'stockPrice' },
    evidence: [registry('§0', '## 0. Özet tablo'), evidence(PATHS.factory, 'IntegrationFactory', "case 'trendyol'")],
  },
  {
    id: 'unified-orders',
    group: 'core',
    home: {
      title: 'Birleşik sipariş yönetimi',
      line: 'Pazaryerlerinden gelen siparişler tek listede toplanır; ekibiniz aynı ekrandan çalışır.',
    },
    title: 'Birleşik sipariş yönetimi',
    summary: 'Farklı kanallardan gelen siparişler düzenli aralıklarla çekilir ve tek listede toplanır.',
    status: 'available',
    channelsFrom: { key: 'orders' },
    evidence: [
      registry('§1', '## 1. Ortak mimari'),
      evidence('backend/src/integration/engine/order/OrderWorker.ts', 'OrderWorker sipariş senkronu', 'OrderWorker'),
    ],
  },
  {
    id: 'returns',
    group: 'core',
    home: {
      title: 'İade ve talep yönetimi',
      line: 'İade taleplerini tek listede görün; onaylayın ya da gerekçesiyle reddedin.',
    },
    title: 'İade ve talep yönetimi',
    summary: 'İade talepleri kanal bazında listelenir, onaylanır veya reddedilir.',
    caveat: 'Kapsam kanala göre değişir; ayrıntı için entegrasyon sayfalarına bakın.',
    status: 'partial',
    channelsFrom: { key: 'returns' },
    evidence: [registry('§2.1', '### 2.1 Trendyol'), registry('§2.4', '### 2.4 Pazarama')],
  },
  {
    id: 'questions',
    group: 'core',
    home: {
      title: 'Müşteri soruları tek yerde',
      line: 'Pazaryerlerinden gelen soru ve mesajları aynı ekrandan yanıtlayın.',
    },
    title: 'Soru-cevap ve mesaj yönetimi',
    summary: 'Müşteri soruları ve mesajları kanal bazında listelenir ve cevaplanır.',
    caveat: 'Kapsam kanala göre değişir; ayrıntı için entegrasyon sayfalarına bakın.',
    status: 'partial',
    channelsFrom: { key: 'questions' },
    evidence: [registry('§2.1', '### 2.1 Trendyol'), registry('§2.4', '### 2.4 Pazarama')],
  },
  {
    id: 'finance',
    group: 'core',
    home: {
      title: 'Finans ve hakediş görünümü',
      line: 'Hakediş ve finansal hareketlerinizi panelden takip edin.',
    },
    title: 'Finans ve hakediş görünümü',
    summary: 'Pazaryeri hakediş ve finansal hareketleri panelde görüntülenir.',
    caveat: 'Kapsam kanala göre değişir; bazı kanallarda görünüm kısmidir.',
    status: 'partial',
    channelsFrom: { key: 'finance' },
    evidence: [registry('§2.1', '### 2.1 Trendyol'), registry('§2.2', '### 2.2 Hepsiburada')],
  },
  {
    id: 'shipping-invoice-notice',
    group: 'core',
    home: {
      title: 'Kargo ve fatura bildirimi',
      line: 'Kargo takip bilgisini ve fatura bağlantısını siparişle birlikte pazaryerine iletin.',
    },
    title: 'Pazaryerine kargo ve fatura bilgisi bildirimi',
    summary: 'Elle girilen kargo takip bilgisi ve fatura bağlantısı pazaryerine iletilir.',
    caveat: 'Kargo takip bilgisi elle girilir; kargo firması ile otomatik etiket veya barkod akışı yoktur.',
    status: 'partial',
    channelsFrom: { key: 'shippingNotice' },
    evidence: [registry('§5.1', '### 5.1 Kargo entegrasyonları'), registry('§2.1', '### 2.1 Trendyol')],
  },
  {
    id: 'erp-read',
    group: 'core',
    home: {
      title: 'ERP bağlantısı',
      line: 'ERP\'nizdeki ürün kataloğunu ve siparişleri panelinize alın.',
    },
    title: 'ERP bağlantısı (yalnızca okuma)',
    summary: 'Bizimhesap ürün kataloğu ve siparişleri okunur; ERP tarafına yazma yapılmaz.',
    caveat: 'Yalnızca okuma; sipariş okuma otomatik zamanlanmış çekime dahil değildir.',
    status: 'partial',
    channelsFrom: { kind: 'erp' },
    evidence: [registry('§4.1', '### 4.1 Bizimhesap')],
  },

  // ------------------------------------------------------------------------------------ Güvenlik
  {
    id: 'tenant-database',
    group: 'security',
    title: 'Her müşteri için ayrı veritabanı',
    summary: 'Her müşteri hesabı için ayrı bir veritabanı kullanılır.',
    status: 'available',
    evidence: [
      evidence(PATHS.adr0003, 'ADR-0003 kiracı DB adlandırma', 'entegrasyonikClient_1'),
      evidence('CLAUDE.md', 'CLAUDE.md kiracı DB sözleşmesi', 'entegrasyonikClient_<n>'),
    ],
    internalNotes: [
      'Ortak ApplicationDB koleksiyonları clientId alanlıdır ve tek uygulama DB kullanıcısı vardır (ADR-0013): "DB düzeyi izolasyon", sertifika veya veri konumu iddiası YAPILMAZ.',
    ],
  },
  {
    id: 'secrets-encryption',
    group: 'security',
    title: 'Entegrasyon anahtarları şifreli saklanır',
    summary: 'Pazaryeri ve entegrasyon API anahtarları veritabanında AES-256-GCM ile şifrelenerek saklanır.',
    status: 'available',
    evidence: [evidence('backend/src/utils/FieldCrypto.ts', 'FieldCrypto AES-256-GCM', 'aes-256-gcm')],
    internalNotes: ['Canlı veri göçü (--apply) insan onayı bekliyor (BACKLOG C5/C12); iddia kod yeteneğine dayanır.'],
  },
  {
    id: 'secrets-masked',
    group: 'security',
    title: 'Anahtarlar arayüzde ve API yanıtlarında gösterilmez',
    summary: 'Kaydedilmiş entegrasyon anahtarları arayüze ve API yanıtlarına maskelenmiş olarak döner.',
    status: 'available',
    evidence: [evidence('backend/src/api/responseSanitizer.ts', 'responseSanitizer maskeleme', 'sensitive')],
  },
  {
    id: 'role-based-access',
    group: 'security',
    title: 'Rol tabanlı erişim',
    summary: 'Kullanıcılar üye, yönetici ve ana yönetici kademeleriyle yetkilendirilir; hassas işlemler üst kademe gerektirir.',
    status: 'available',
    evidence: [
      evidence('backend/src/api/operationPolicy.ts', 'operationPolicy yetki kademeleri', 'member < admin < owner'),
      evidence(PATHS.adr0001, 'ADR-0001 RBAC'),
    ],
  },
  {
    id: 'default-deny',
    group: 'security',
    title: 'Yetkisiz işlemler varsayılan olarak reddedilir',
    summary:
      'Sunucuda tanımlı işlem listesinde olmayan her işlem varsayılan olarak reddedilir; kullanıcının yetki kademesi istemciden gelen bilgiye değil sunucudaki hesap kaydına göre belirlenir.',
    status: 'available',
    evidence: [
      evidence('backend/src/api/operationPolicy.ts', 'operationPolicy varsayılan red', 'varsayılan olarak REDDEDİLİR'),
      evidence('backend/src/api/operationPolicy.ts', 'operationPolicy yetki kaynağı', "token'daki `role` claim'i KULLANILMAZ"),
    ],
  },
  {
    id: 'session-cookie',
    group: 'security',
    title: 'Oturum bilgisi tarayıcı betiklerinden okunamayan çerezde taşınır',
    summary:
      'Oturum, imzalı bir belirteç (JWT) ile yönetilir; belirteç HTTP-only çerezde taşınır, süresi sınırlıdır ve tarayıcıdaki betikler tarafından okunamaz.',
    status: 'available',
    evidence: [
      evidence('backend/src/api/Security.ts', 'Security çerez ayarları', 'httpOnly: true'),
      evidence('backend/src/api/Security.ts', 'Security imzalı JWT', 'jwt.sign'),
    ],
  },
  {
    id: 'integration-resilience',
    group: 'security',
    title: 'Pazaryeri çağrıları dayanıklılık katmanından geçer',
    summary:
      'Pazaryeri ve entegrasyon çağrıları zaman aşımı, kontrollü yeniden deneme ve devre kesici ile yapılır; art arda hata veren bir bağlantı geçici olarak durdurulur ve sonra yeniden denenir.',
    caveat: 'Bu katman geçici hataları yönetir; pazaryeri tarafındaki kesintiyi ortadan kaldırmaz.',
    status: 'available',
    evidence: [
      evidence(
        'backend/src/integration/modules/common/http/ResilientHttpClient.ts',
        'ResilientHttpClient devre kesici',
        'circuitBreaker',
      ),
      evidence('docs/adr/0006-dayaniklilik-katmani-ve-surec-topolojisi.md', 'ADR-0006 dayanıklılık katmanı', 'Dayanıklılık katmanı'),
      evidence(
        'backend/src/integration/modules/marketplace/trendyol/services/Service.ts',
        'Trendyol adaptörü paylaşımlı istemciyi kullanır',
        'ResilientHttpClient',
      ),
    ],
  },
  {
    id: 'hosted-payment',
    group: 'security',
    title: 'Kart verisi Entegrasyonik sistemlerinden geçmez',
    summary: 'Ödeme, ödeme sağlayıcısının barındırdığı formda alınacak şekilde tasarlanmıştır; kart verisi bize gelmez.',
    caveat: 'Ödeme akışı bu sürümde test (sandbox) aşamasındadır.',
    status: 'partial',
    evidence: [evidence(PATHS.adr0008, 'ADR-0008 barındırılan ödeme formu', 'kart verisi bize gelmez')],
    internalNotes: [
      'Canlı ödeme sağlayıcısı (iyzico) adaptörü yok; yalnızca mock checkout (ADR-0008, Açık: insan onayı). status=partial bu yüzden.',
    ],
  },

  // ============================================================================ ROADMAP (GİZLİ)
  {
    id: 'einvoice-provider',
    group: 'core',
    title: 'E-fatura sağlayıcı entegrasyonu',
    summary: 'Planlanıyor.',
    status: 'roadmap',
    evidence: [registry('§5.2', '### 5.2 E-fatura')],
  },
  {
    id: 'carrier-api',
    group: 'core',
    title: 'Kargo firması API entegrasyonu',
    summary: 'Planlanıyor.',
    status: 'roadmap',
    evidence: [registry('§5.1', '### 5.1 Kargo entegrasyonları')],
  },
  {
    id: 'mcp',
    group: 'core',
    title: 'MCP ile yapay zeka erişimi',
    summary: 'Planlanıyor.',
    status: 'roadmap',
    evidence: [evidence('docs/adr/0009-mcp-topolojisi-ve-generative-ui.md', 'ADR-0009 (tasarım kararı; implemente değil)', 'MCP')],
  },
  {
    id: 'desktop-app',
    group: 'core',
    title: 'Masaüstü uygulaması',
    summary: 'Planlanıyor.',
    status: 'roadmap',
    evidence: [evidence('docs/adr/0007-yerel-uygulama-repo-konumu-ve-tauri.md', 'ADR-0007 (Faz 4; implemente değil)', 'Tauri')],
  },
]

// ---------------------------------------------------------------------------- Seçiciler

export interface PublicChannel {
  code: string
  name: string
  level: CapabilityLevel
}

export interface PublicProductCapability {
  id: string
  group: CapabilityGroup
  title: string
  summary: string
  caveat?: string
  home?: { title: string; line: string }
  status: ProductCapabilityStatus
  statusLabel: string
  channels: PublicChannel[]
}

/** Yeteneği sunan mevcut entegrasyonlar — `integrations.ts`'ten türetilir. */
function channelsFor(from: ProductCapability['channelsFrom']): PublicChannel[] {
  if (!from) return []
  const out: PublicChannel[] = []
  for (const i of integrations) {
    if (i.status !== 'available') continue
    if (from.kind && i.kind !== from.kind) continue
    if (from.key) {
      const c = i.capabilities.find((x) => x.key === from.key)
      if (!c) continue
      out.push({ code: i.code, name: i.name, level: c.level })
    } else {
      out.push({ code: i.code, name: i.name, level: i.coverage === 'limited' ? 'limited' : 'supported' })
    }
  }
  return out
}

const toPublic = (c: ProductCapability): PublicProductCapability => ({
  id: c.id,
  group: c.group,
  title: c.title,
  summary: c.summary,
  ...(c.caveat ? { caveat: c.caveat } : {}),
  ...(c.home ? { home: { ...c.home } } : {}),
  status: c.status,
  statusLabel: STATUS_LABELS[c.status],
  channels: channelsFor(c.channelsFrom),
})

/** Sayfaların tek girişi: roadmap öğeleri `ROADMAP_VISIBLE=false` iken DÖNMEZ. */
export function getPublicCapabilities(group?: CapabilityGroup): PublicProductCapability[] {
  return productCapabilities
    .filter((c) => (group ? c.group === group : true))
    .filter((c) => c.status !== 'roadmap' || ROADMAP_VISIBLE)
    .map(toPublic)
}

/** Plan özelliği -> yetenek eşlemesi (plans.ts "yakında" rozeti için). */
export type FeatureState = 'live' | 'limited' | 'soon'

export function capabilityState(id: string): FeatureState | undefined {
  const c = productCapabilities.find((x) => x.id === id)
  if (!c) return undefined
  return c.status === 'available' ? 'live' : c.status === 'partial' ? 'limited' : 'soon'
}

export { CAPABILITY_LABELS }

// ---------------------------------------------------------------------------- Ana sayfa: dört değer sütunu

/**
 * Ana sayfa "Yetenekler" koyu bandındaki dört değer sütunu (S12 pazarlama dili). Her sütun `basedOn` ile
 * kayıtlı (roadmap olmayan) yeteneklere bağlanır — metin yalnızca o yeteneklerin olgularını pazarlama diliyle
 * anlatır; yeni özellik iddiası yoktur (tests/claims.test.ts `basedOn` bağını ve yasaklı ifadeleri denetler).
 */
export interface HomePillar {
  id: string
  icon: 'stock' | 'orders' | 'database' | 'users'
  title: string
  line: string
  points: string[]
  basedOn: string[]
}

export const homePillars: HomePillar[] = [
  {
    id: 'oversell',
    icon: 'stock',
    title: 'Overselling kontrol altında',
    line: 'Merkezi stok rezervasyonu, eşzamanlı siparişlerde bile yalnızca mevcut adet kadar rezervasyon yapar.',
    points: ['Eşzamanlı sipariş koruması', 'Tek merkezden stok ve fiyat', 'Aşırı satışta telafi akışı'],
    basedOn: ['stock-reservation', 'multi-channel-products'],
  },
  {
    id: 'ops',
    icon: 'orders',
    title: 'Tek ekranda operasyon',
    line: 'Sipariş, iade ve müşteri soruları tek akışta; ekip aynı ekrandan çalışır.',
    points: ['Birleşik sipariş listesi', 'İade ve talep yönetimi', 'Soru ve mesaj yanıtlama'],
    basedOn: ['unified-orders', 'returns', 'questions'],
  },
  {
    id: 'isolation',
    icon: 'database',
    title: 'Size özel, şifreli veri',
    line: 'Her hesap kendi veritabanında; entegrasyon anahtarları şifreli saklanır.',
    points: ['Hesaba özel veritabanı', 'AES-256-GCM ile şifreleme', 'Maskeli anahtar gösterimi'],
    basedOn: ['tenant-database', 'secrets-encryption', 'secrets-masked'],
  },
  {
    id: 'rbac',
    icon: 'users',
    title: 'Ekibinize doğru yetki',
    line: 'Kademeli roller ekibinizi yetkilendirir; hassas işlemler üst kademeye ayrılır.',
    points: ['Üye, yönetici, ana yönetici', 'Yetkisiz işleme varsayılan red', 'Korumalı oturum çerezi'],
    basedOn: ['role-based-access', 'default-deny', 'session-cookie'],
  },
]

/** Sayfaların tek girişi (dört değer sütunu). */
export function getHomePillars(): HomePillar[] {
  return homePillars.map((p) => ({ ...p, points: [...p.points], basedOn: [...p.basedOn] }))
}

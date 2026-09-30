/**
 * E-ticaret entegrasyon sözlüğü (KB §9: 48 terim, editoryal kısa tanımlar). Tanımlar genel sektör kavramlarıdır;
 * sayısal iddia içermez. Yasal terimlerde (aracı hizmet sağlayıcı, hizmet sağlayıcı, e-belgeler, VERBİS, İYS,
 * ETBİS) tanım bilgilendirme amaçlıdır; bağlayıcı tanım ilgili mevzuattadır (sayfada not olarak yazılır).
 * `id` sözlük sayfasında çapa (`/rehber/sozluk#id`) ve DefinedTerm `@id` olarak kullanılır.
 */
import type { GlossaryTerm } from './types'

const t = (id: string, term: string, definition: string, guide?: string, alternate?: string): GlossaryTerm => ({
  id,
  term,
  definition,
  ...(guide ? { guide } : {}),
  ...(alternate ? { alternate } : {}),
})

const STOK = 'karsilastirma/tek-stokla-cok-kanal-yonetimi'
const ASIRI = 'karsilastirma/asiri-satis-overselling'
const API = 'pazaryerleri/pazaryeri-api-erisimi'
const HAKEDIS = 'pazaryerleri/hakedis-ve-odeme-dongusu'
const EFATURA = 'e-fatura/eticarette-e-fatura-zorunlulugu'
const FATURA_AKIS = 'e-fatura/pazaryeri-siparislerinde-fatura-akisi'
const KVKK = 'mevzuat/kvkk-e-ticaret-saticilar'
const IADE = 'kargo/iade-kargo'
const ALTYAPI = 'altyapi-erp/eticaret-altyapisi-pazaryeri-entegrasyonu'

export const glossary: GlossaryTerm[] = [
  t('tek-stok', 'Tek stok', 'Tüm satış kanallarının tek bir stok kaynağından beslenmesi; bir kanaldaki satış diğer kanallarda da stoğu düşürür.', STOK),
  t('asiri-satis', 'Aşırı satış', 'Eldeki stoktan fazla siparişin kabul edilmesi; çoğunlukla gecikmeli senkron veya eşzamanlı siparişlerden kaynaklanır.', ASIRI, 'Overselling'),
  t('stok-rezervasyonu', 'Stok rezervasyonu', 'Sipariş kesinleşene kadar ilgili stoğun ayrılması; eşzamanlı siparişlerde aynı ürünün iki kez satılmasını önler.', ASIRI),
  t('stok-senkronu', 'Stok senkronu', 'Stok değişikliğinin bağlı tüm satış kanallarına yansıtılması.', STOK),
  t('cok-kanalli-satis', 'Çok kanallı satış', 'Aynı ürünlerin birden çok kanaldan (pazaryerleri, kendi site, fiziksel mağaza) satılması.', STOK, 'Multichannel'),
  t('omnichannel', 'Omnichannel', 'Satış kanallarının müşteri açısından tek ve tutarlı bir deneyimde birleştirilmesi; çok kanallı satıştan farkı, kanallar arası geçişin müşteriye tek deneyim olarak sunulmasıdır.'),
  t('pazaryeri', 'Pazaryeri', 'Birden çok satıcının ürünlerini aynı platformda sattığı e-ticaret ortamı.', 'pazaryerleri/trendyol-satici-olma', 'Marketplace'),
  t('araci-hizmet-saglayici', 'Aracı hizmet sağlayıcı', 'Başkalarının ticari faaliyetleri için elektronik ticaret ortamı sağlayan kişi veya kuruluş; pazaryerleri bu kapsamdadır. Bağlayıcı tanım 6563 sayılı Kanun ve ilgili yönetmeliktedir.'),
  t('hizmet-saglayici', 'Hizmet sağlayıcı', 'Elektronik ticaret faaliyetinde bulunan gerçek veya tüzel kişi; kendi sitesinden satış yapan işletme bu kapsamdadır. Bağlayıcı tanım 6563 sayılı Kanun’dadır.'),
  t('sku', 'SKU (stok kodu)', 'Satıcının her ürün ve varyanta verdiği, kendi sistemindeki benzersiz stok kodu.', STOK),
  t('barkod', 'Barkod', 'Ürünü makineyle okunabilir biçimde tanımlayan kod; kanallar arası ürün eşlemesinde sık kullanılır.', STOK),
  t('gtin', 'GTIN', 'Küresel ticari ürün numarası; EAN ve UPC gibi barkod standartlarını kapsar.'),
  t('varyant', 'Varyant', 'Aynı ürünün beden, renk gibi seçeneklerinden her biri; her varyantın kendi stok kodu ve stoğu olur.'),
  t('urun-katalogu-esleme', 'Ürün kataloğu eşleme', 'Aynı ürünün farklı kanallardaki karşılıklarının tek ürün kaydına bağlanması.', STOK),
  t('kategori-esleme', 'Kategori eşleme', 'Kendi kategori ağacınızın her pazaryerinin kategori ağacıyla eşleştirilmesi.', STOK),
  t('ozellik-esleme', 'Özellik eşleme', 'Ürün özelliklerinin (renk, beden, malzeme...) pazaryerinin istediği özellik şablonuna eşlenmesi.', STOK, 'Attribute eşleme'),
  t('buybox', 'Buybox', 'Aynı ürünü satan satıcılar arasında ürün sayfasındaki satın alma kutusunda gösterilme yarışı.'),
  t('hakedis', 'Hakediş', 'Satıcının satış tutarından komisyon ve diğer kesintiler düşüldükten sonra alacağı tutar.', HAKEDIS),
  t('komisyon', 'Komisyon', 'Pazaryerinin her satıştan aldığı pay; oranlar genellikle kategori bazlıdır ve satıcı panelinde yayımlanır.', HAKEDIS),
  t('mutabakat', 'Mutabakat', 'Sipariş, iade ve ödeme kayıtlarının karşılaştırılarak farkların bulunması.', HAKEDIS),
  t('iade', 'İade', 'Ürünün satıcıya geri gönderilmesi ve ödemenin alıcıya geri verilmesi süreci.', IADE),
  t('talep', 'Talep', 'Alıcının iade, iptal veya değişim için yaptığı başvuru.', IADE, 'Claim'),
  t('sla', 'SLA', 'Hizmet seviyesi taahhüdü; pazaryerlerinde örneğin siparişin kargoya verilmesi için tanınan süre.'),
  t('kargoya-teslim-suresi', 'Kargoya teslim süresi', 'Siparişin kargo firmasına teslim edilmesi için satıcıya tanınan süre; pazaryerinin satıcı sözleşmesinde tanımlanır.'),
  t('takip-numarasi', 'Takip numarası', 'Gönderinin kargo firmasında izlendiği kod; pazaryerine bildirildiğinde alıcı da gönderiyi izleyebilir.'),
  t('anlasmali-kargo', 'Anlaşmalı kargo', 'Pazaryerinin kargo firmalarıyla yaptığı toplu anlaşma; satıcı gönderiyi pazaryerinin sağladığı kodla gönderir.'),
  t('api', 'API', 'Yazılımların birbiriyle veri alışverişi yapmasını sağlayan arayüz; pazaryerleri ürün, stok ve sipariş işlemleri için API sunar.', API),
  t('webhook', 'Webhook', 'Bir olay gerçekleştiğinde (ör. yeni sipariş) karşı sisteme otomatik olarak yapılan bildirim çağrısı.', API),
  t('rate-limit', 'Rate limit (istek sınırı)', 'Bir API’ye belirli bir süre içinde yapılabilecek en fazla istek sayısı; aşıldığında istekler reddedilir veya bekletilir.', API),
  t('kimlik-bilgisi', 'API kimlik bilgisi', 'API erişimi için kullanılan anahtar ve gizli anahtar çifti (bazı platformlarda satıcı kimliğiyle birlikte).', API, 'API key / secret'),
  t('erp', 'ERP', 'Kurumsal kaynak planlama yazılımı; stok, satın alma, satış ve muhasebeyi tek sistemde yönetir.', ALTYAPI),
  t('on-muhasebe', 'Ön muhasebe', 'Küçük ve orta ölçekli işletmeler için cari hesap, stok ve fatura takibi yapan muhasebe yazılımı.', ALTYAPI),
  t('e-fatura', 'e-Fatura', 'Gelir İdaresi Başkanlığı sistemine kayıtlı mükellefler arasında düzenlenen elektronik fatura.', EFATURA),
  t('e-arsiv', 'e-Arşiv fatura', 'e-Fatura mükellefi olmayan alıcılara, tüketiciler dahil, düzenlenen elektronik fatura.', EFATURA),
  t('e-irsaliye', 'e-İrsaliye', 'Malın sevkini belgeleyen sevk irsaliyesinin elektronik karşılığı.', EFATURA),
  t('ozel-entegrator', 'Özel entegratör', 'Gelir İdaresi Başkanlığı tarafından yetkilendirilmiş, mükellefler adına e-belge düzenleme ve iletme hizmeti veren şirket.', FATURA_AKIS),
  t('fiyat-kurali', 'Fiyat kuralı', 'Ürün fiyatının kanala göre otomatik hesaplanması için tanımlanan kural (ör. kanal bazında fark veya yuvarlama).'),
  t('kampanya', 'Kampanya', 'Pazaryerinde belirli süreyle sınırlı indirim veya teşvik programı.', HAKEDIS),
  t('marketplace-fulfillment', 'Pazaryeri lojistiği', 'Depolama, paketleme ve kargolamanın pazaryeri tarafından yapıldığı model.', undefined, 'Marketplace fulfillment'),
  t('fulfillment', 'Fulfillment', 'Siparişin depolanması, paketlenmesi ve sevk edilmesini kapsayan operasyonun tamamı.'),
  t('kritik-stok-esigi', 'Kritik stok eşiği', 'Uyarı vermek veya satışı durdurmak için belirlenen en düşük stok seviyesi.', ASIRI),
  t('guvenlik-stogu', 'Güvenlik stoğu', 'Aşırı satışa karşı kanallara gösterilmeyen, yedekte tutulan stok payı.', ASIRI, 'Tampon stok'),
  t('urun-yayini', 'Ürün yayını', 'Ürünün bir kanalda satışa açılması.', STOK, 'Listing'),
  t('toplu-islem', 'Toplu işlem', 'Çok sayıda ürüne tek seferde fiyat, stok veya bilgi değişikliği uygulanması.'),
  t('denetim-izi', 'Denetim izi', 'Kimin, ne zaman, neyi değiştirdiğini gösteren kayıt.', 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir', 'Audit log'),
  t('verbis', 'VERBİS', 'Veri Sorumluları Sicil Bilgi Sistemi; kayıt yükümlüsü veri sorumlularının kayıt olduğu, Kişisel Verileri Koruma Kurumu’na ait sistem.', KVKK),
  t('iys', 'İYS', 'İleti Yönetim Sistemi; ticari elektronik ileti izinlerinin (onay ve ret) kaydedildiği, Ticaret Bakanlığı gözetimindeki sistem.', KVKK),
  t('etbis', 'ETBİS', 'Elektronik Ticaret Bilgi Sistemi; e-ticaret yapan işletmelerin Ticaret Bakanlığı’na kayıt olduğu sistem.', 'pazaryerleri/trendyol-satici-olma'),
]

/** Sözlük sayfası sürüm bilgisi (KB §11: yılda bir gözden geçirme). */
export const GLOSSARY_META = {
  datePublished: '2026-09-30',
  dateModified: '2026-09-30',
  reviewBy: '2027-09-30',
  sources: ['S8', 'S19', 'S23', 'S27'] as const,
  note: 'Tanımlar bilgilendirme amaçlı, sade anlatımlardır. Aracı hizmet sağlayıcı, e-Fatura, VERBİS, İYS ve ETBİS gibi yasal terimlerin bağlayıcı tanımı ilgili mevzuattadır; hukuki veya mali tavsiye değildir.',
}

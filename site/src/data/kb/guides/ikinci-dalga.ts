/**
 * Rehber — KB §12 "sonraki dalga" (R1, R16, R17, R23, R24, R25, R12, R18). Aynı doğruluk kuralı: kesin ifade yalnızca
 * resmi kaynağa ya da tutarlı iki ikincil kaynağa dayanır; tek ikincil kaynaktaki bilgi "ikincil kaynağa göre" diye
 * işaretlenir ya da hiç yazılmaz. DOĞRULANAMADI: GİB özel entegratör listesi, İYS tacir/esnaf istisnasının kapsamı
 * (tek ikincil kaynak), pazaryerlerinin anlaşmalı kargo listeleri ve süreleri, n11/Pazarama/ÇiçekSepeti/PttAVM resmi
 * API adımları, Amazon plan ücreti ve komisyonları → yazılmaz. Kargo firması adı listelenmez (KB §6).
 */
import type { Guide } from '../types'

const D = '2026-09-30'

export const ikinciDalgaGuides: Guide[] = [
  // ------------------------------------------------------------------------------------------ R1
  {
    slug: 'pazaryerleri',
    kbId: 'R1',
    cluster: 'pazaryerleri',
    title: 'Türkiye pazaryerleri rehberi',
    seoTitle: 'Türkiye pazaryerleri rehberi',
    description:
      'Trendyol, Hepsiburada, n11, Pazarama, Amazon, ÇiçekSepeti ve PttAVM için satıcı başvurusu, API erişimi ve bilgilerin kaynak durumu tek tabloda.',
    summary: 'Başlıca pazaryerlerinde başvuru ve API erişimi, tek tabloda.',
    answer:
      'Türkiye’de satıcıların en sık kullandığı pazaryerleri Trendyol, Hepsiburada, n11, Pazarama, Amazon Türkiye, ÇiçekSepeti ve PttAVM’dir; hepsinde satıcı başvurusu işletme bilgileriyle yapılır ve onaydan sonra satıcı paneli açılır. Komisyon oranları kategori bazlıdır ve her pazaryerinin satıcı panelinde yayımlanır. Birden çok pazaryerinde satış yapılacaksa ürünlerin barkod veya stok koduyla tekilleştirilmesi ve stoğun tek kaynaktan yönetilmesi gerekir.',
    keyPoints: [
      'Başvurular işletme (vergi kaydı) bilgileriyle yapılır.',
      'Komisyon ve ödeme takvimi pazaryerine özgüdür; güncel bilgi satıcı panelindedir.',
      'API erişimi, entegrasyon yazılımıyla çok kanallı yönetimin ön koşuludur.',
    ],
    sections: [
      {
        id: 'karsilastirma',
        title: 'Pazaryerleri bir bakışta',
        blocks: [
          {
            type: 'table',
            caption: 'Başlıca pazaryerlerinde başvuru ve API erişimi',
            head: ['Pazaryeri', 'Başvuru', 'API erişimi', 'Kaynak durumu'],
            rows: [
              ['Trendyol', 'Satıcı başvuru sayfası; vergi kaydı olan işletme', 'Satıcı paneli: satıcı kimliği, API anahtarı ve gizli anahtar', 'API belgeleri resmi; başvuru adımları ikincil kaynaklardan. [Rehber](/rehber/pazaryerleri/trendyol-satici-olma)'],
              ['Hepsiburada', 'Satıcı başvuru sayfası; şirket, vergi ve banka bilgileri', 'Satıcı paneli üzerinden talep edilen API kullanıcı bilgileri', 'Geliştirici portalı resmi; adımlar ikincil kaynaklardan. [Rehber](/rehber/pazaryerleri/hepsiburada-satici-olma)'],
              ['n11', 'Satıcı üyelik formu ve belgeler', 'Satıcı paneli veya satıcı desteği', 'Resmi adımlar doğrulanamadı; satıcı sayfasını esas alın'],
              ['Pazarama', 'Satıcı ön başvuru formu', 'Satıcı paneli veya satıcı desteği', 'Resmi adımlar doğrulanamadı; satıcı sayfasını esas alın'],
              ['Amazon Türkiye', 'Satıcı kaydı ve kimlik doğrulama', 'Selling Partner API (SP-API) geliştirici kaydı', 'SP-API sayfası resmi'],
              ['ÇiçekSepeti', 'Başvuru türü seçimi ve firma bilgileri', 'Satıcı paneli veya satıcı desteği', 'Resmi adımlar doğrulanamadı; satıcı sayfasını esas alın'],
              ['PttAVM', 'Satıcı başvuru sayfası', 'Satıcı paneli veya satıcı desteği', 'Resmi adımlar doğrulanamadı; satıcı sayfasını esas alın'],
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Komisyon ve ödeme bilgisi neden yok?',
            text: 'Pazaryerlerinin komisyon oranları ve ödeme takvimleri kategoriye ve döneme göre değişir; incelediğimiz kaynaklarda resmi bir tabloyla doğrulanamadı. Güncel oran ve takvim için ilgili pazaryerinin satıcı panelini esas alın.',
          },
        ],
      },
      {
        id: 'nasil-secilir',
        title: 'Hangi pazaryeri bana uygun?',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Kategori uyumu:** ürün kategorinizin pazaryerinde açık olup olmadığını ve kategori kurallarını kontrol edin.',
              '**Toplam maliyet:** komisyon, kargo ve hizmet bedellerini kategori bazında satıcı panelinden hesaplayın.',
              '**Operasyon kapasitesi:** kargoya teslim süresi ve iade kurallarını ekibinizin karşılayıp karşılayamayacağını değerlendirin.',
              '**Entegrasyon:** birden çok kanalda satacaksanız pazaryerinin API erişimini ve kullandığınız yazılımın o kanaldaki kapsamını kontrol edin.',
            ],
          },
        ],
      },
      {
        id: 'coklu-kanal',
        title: 'Birden çok pazaryerinde satış',
        blocks: [
          {
            type: 'p',
            text: 'Aynı ürünü birden çok pazaryerinde satmak görünürlüğü artırır, ancak stoğun tek kaynaktan yönetilmesini gerektirir. Aksi halde bir kanalda satılan son ürün diğer kanalda da satılabilir. Adımlar için [tek stokla çok kanal yönetimi](/rehber/karsilastirma/tek-stokla-cok-kanal-yonetimi) ve [aşırı satış](/rehber/karsilastirma/asiri-satis-overselling) rehberlerine bakın.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'hangisi',
        question: 'Hangi pazaryeri bana uygun?',
        answer:
          'Ürün kategoriniz, toplam maliyetiniz ve operasyon kapasiteniz belirleyicidir. Kategori kurallarını ve maliyet kalemlerini her pazaryerinin satıcı panelinden karşılaştırın.',
      },
      {
        id: 'bireysel',
        question: 'Pazaryerlerinde bireysel olarak satış yapılabilir mi?',
        answer:
          'İncelediğimiz pazaryerlerinin satıcı başvuruları işletme bilgileriyle yapılır. Başvuru koşullarını ilgili pazaryerinin satıcı sayfasından kontrol edin.',
      },
      {
        id: 'komisyon',
        question: 'Pazaryeri komisyonları nerede yayımlanır?',
        answer: 'Her pazaryerinin satıcı panelinde ve satıcı sözleşmesinde. Oranlar kategori bazlıdır ve değişebilir.',
      },
    ],
    sources: ['S30', 'S32', 'S35', 'S36', 'S37', 'S40', 'S41', 'S43', 'S44'],
    related: ['pazaryerleri/trendyol-satici-olma', 'pazaryerleri/hepsiburada-satici-olma', 'pazaryerleri/pazaryeri-api-erisimi'],
    cta: 'channels',
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R16
  {
    slug: 'e-fatura/e-irsaliye-nedir',
    kbId: 'R16',
    cluster: 'mevzuat',
    title: 'e-İrsaliye nedir, kimler kullanmak zorunda?',
    seoTitle: 'e-İrsaliye nedir, kimler kullanır?',
    description:
      'e-İrsaliyenin tanımı, GİB e-Belge kaynağına göre kullanmak zorunda olan mükellef grupları ve pazaryeri satıcısı için ne anlama geldiği.',
    summary: 'Tanım, zorunlu mükellef grupları ve satıcıya etkisi.',
    answer:
      "e-İrsaliye, malın sevkini belgeleyen sevk irsaliyesinin elektronik karşılığıdır. GİB e-Belge sayfasına göre 509 Sıra No'lu Tebliğ kapsamında belirli sektörlerdeki mükellefler ile önceki dönem brüt satış hasılatı 25 milyon TL ve üzeri olan e-Fatura mükellefleri e-İrsaliye kullanmak zorundadır. Pazaryeri satıcılarının çoğu bu kapsamda değildir; kapsama girenler sevkiyattan önce e-İrsaliye düzenler.",
    keyPoints: [
      'e-İrsaliye, sevk irsaliyesinin elektronik hâlidir.',
      'Zorunluluk sektöre ve hasılata bağlıdır (e-Fatura mükellefleri için 25 milyon TL eşiği).',
      'Kapsam dışındaki satıcılar için zorunlu değildir.',
    ],
    sections: [
      {
        id: 'tanim',
        title: 'e-İrsaliye ne işe yarar?',
        blocks: [
          {
            type: 'p',
            text: 'Sevk irsaliyesi, malın bir yerden başka bir yere taşındığını belgeleyen evraktır. e-İrsaliye aynı belgenin Gelir İdaresi Başkanlığı sistemi üzerinden elektronik olarak düzenlenmesi ve iletilmesidir; kâğıt irsaliyenin yerini alır.',
          },
        ],
      },
      {
        id: 'kapsam',
        title: 'Kimler kullanmak zorunda?',
        blocks: [
          { type: 'p', text: 'GİB e-Belge sayfasına göre kapsamdaki başlıca gruplar şunlardır:' },
          {
            type: 'ul',
            items: [
              'Hal kayıt sistemine bildirimde bulunmak zorunda olan tüccarlar.',
              'Belirli EPDK lisanslı mükellefler ve ÖTV listesindeki mallarla ilgili belirli mükellefler.',
              'Maden, şeker, demir-çelik ve gübre takip sistemi kullanıcıları.',
              'Önceki dönem brüt satış hasılatı 25 milyon TL ve üzeri olan e-Fatura mükellefleri.',
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Değişebilir bilgi',
            text: 'Kapsam ve eşikler tebliğ değişiklikleriyle güncellenebilir. Güncel kapsam için GİB e-Belge sayfasını ve tebliğin güncel metnini kontrol edin.',
          },
        ],
      },
      {
        id: 'satici',
        title: 'Pazaryeri satıcısı için anlamı',
        blocks: [
          {
            type: 'p',
            text: 'Pazaryerinde tüketiciye satış yapan satıcıların çoğu yukarıdaki gruplara girmez; bu durumda faturalandırma için [e-Fatura veya e-Arşiv](/rehber/e-fatura/eticarette-e-fatura-zorunlulugu) yeterlidir. Kapsama giriyorsanız sevkiyattan önce e-İrsaliye düzenlemeniz ve bu adımı sipariş hazırlık sürecinize eklemeniz gerekir.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'zorunlu-mu',
        question: 'e-İrsaliye e-ticaret için zorunlu mu?',
        answer:
          'Genel olarak hayır; zorunluluk sektöre ve hasılata bağlıdır. Kapsamdaki gruplar GİB e-Belge sayfasında sayılır.',
      },
      {
        id: 'esik',
        question: 'e-İrsaliye için hasılat eşiği nedir?',
        answer: 'GİB e-Belge sayfasına göre önceki dönem brüt satış hasılatı 25 milyon TL ve üzeri olan e-Fatura mükellefleri kapsamdadır.',
      },
      {
        id: 'fatura-farki',
        question: 'e-İrsaliye ile e-Fatura arasındaki fark nedir?',
        answer: 'e-Fatura satışı, e-İrsaliye malın sevkini belgeler. Kapsamdaki mükellefler ikisini birlikte kullanır.',
      },
    ],
    sources: ['S8', 'S6'],
    related: ['e-fatura/eticarette-e-fatura-zorunlulugu', 'e-fatura/pazaryeri-siparislerinde-fatura-akisi', 'e-fatura/entegrator-nedir'],
    cta: 'invoice',
    legal: true,
    volatile: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R17
  {
    slug: 'e-fatura/entegrator-nedir',
    kbId: 'R17',
    cluster: 'secim',
    title: 'e-Fatura özel entegratörü nedir, nasıl seçilir?',
    seoTitle: 'e-Fatura özel entegratörü nedir?',
    description:
      'Özel entegratör kavramı, GİB’in sunduğu kullanım yöntemleri arasındaki yeri ve bir entegratör seçerken sorulacak sorular.',
    summary: 'Özel entegratör kavramı ve seçim soruları.',
    answer:
      'Özel entegratör, Gelir İdaresi Başkanlığı tarafından yetkilendirilmiş ve mükellefler adına e-Fatura, e-Arşiv ve e-İrsaliye gibi elektronik belgeleri düzenleyip ileten şirkettir. Mükellefler e-belge uygulamalarını GİB’in sunduğu yöntemlerden biriyle kullanır; belge hacmi yüksek olan ve belgeleri diğer yazılımlarına bağlamak isteyen işletmeler genellikle özel entegratör hizmetini tercih eder. Yetkili entegratörlerin güncel listesi GİB tarafından yayımlanır.',
    keyPoints: [
      'Özel entegratör GİB yetkisiyle mükellef adına e-belge düzenler ve iletir.',
      'Yetkili olup olmadığını GİB’in güncel listesinden kontrol edin.',
      'Seçimde arşivleme, entegrasyon seçenekleri ve destek belirleyicidir.',
    ],
    sections: [
      {
        id: 'nedir',
        title: 'Özel entegratör ne yapar?',
        blocks: [
          {
            type: 'p',
            text: 'Elektronik belgeler Gelir İdaresi Başkanlığı sistemi üzerinden düzenlenir ve alıcıya iletilir. Özel entegratör, bu işlemi mükellef adına yapmaya yetkilendirilmiş şirkettir: belgeyi düzenler, alıcıya ve GİB’e iletir ve arşivler. Muhasebe veya satış yazılımınızla bağlantı kurarak faturaların elle girilmeden oluşturulmasını da sağlayabilir.',
          },
        ],
      },
      {
        id: 'ne-zaman',
        title: 'Ne zaman gerekir?',
        blocks: [
          {
            type: 'p',
            text: 'Mükellefler e-belge uygulamalarını GİB’in sunduğu kullanım yöntemlerinden biriyle kullanır. Az sayıda fatura düzenleyen bir işletme için GİB’in kendi portalı yeterli olabilir; günlük çok sayıda pazaryeri siparişi faturalayan bir satıcı için belgelerin satış ve muhasebe sistemleriyle bağlantılı üretilmesi iş yükünü belirgin biçimde azaltır. Hangi yöntemin size uygun olduğunu mali müşavirinizle belirleyin.',
          },
        ],
      },
      {
        id: 'secim',
        title: 'Entegratör seçerken sorulacaklar',
        blocks: [
          {
            type: 'table',
            caption: 'Özel entegratör seçim soruları',
            head: ['Ölçüt', 'Sorulacak soru'],
            rows: [
              ['Yetki', 'GİB’in güncel yetkili özel entegratör listesinde yer alıyor mu?'],
              ['Belge türleri', 'e-Fatura, e-Arşiv ve e-İrsaliye belgelerinin hangilerini destekliyor?'],
              ['Arşivleme', 'Belgeler nasıl ve ne kadar süre saklanıyor, dışa aktarılabiliyor mu?'],
              ['Bağlantı', 'Muhasebe, ERP ve satış yazılımlarınızla hangi yollarla (API, hazır bağlantı) çalışıyor?'],
              ['Destek', 'Hangi kanallardan ve hangi saatlerde destek veriliyor?'],
              ['Maliyet', 'Ücret belge adedine mi, pakete mi bağlı; ek ücret kalemleri neler?'],
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'portal-yeterli',
        question: 'GİB portalı yeterli mi?',
        answer:
          'Az sayıda belge düzenleyen işletmeler için yeterli olabilir. Günlük çok sayıda siparişi faturalıyorsanız belgelerin yazılımlarınızla bağlantılı üretildiği bir yöntem iş yükünü azaltır.',
      },
      {
        id: 'liste',
        question: 'Yetkili özel entegratör listesi nerede?',
        answer: 'Liste Gelir İdaresi Başkanlığı tarafından yayımlanır. Seçim yapmadan önce güncel listeyi GİB’in e-Belge sayfalarından kontrol edin.',
      },
      {
        id: 'entegrasyonik',
        question: 'Entegrasyonik bir özel entegratör mü?',
        answer:
          'Hayır. Entegrasyonik bir özel entegratör değildir ve fatura düzenlemez. Başka bir sistemde düzenlenmiş faturanın bağlantısını, bu bildirimi destekleyen pazaryerlerine iletebilir.',
      },
    ],
    sources: ['S6', 'S7', 'S8'],
    related: ['e-fatura/eticarette-e-fatura-zorunlulugu', 'e-fatura/pazaryeri-siparislerinde-fatura-akisi', 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir'],
    cta: 'invoice',
    legal: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R23
  {
    slug: 'mevzuat/mesafeli-sozlesmeler-yonetmeligi',
    kbId: 'R23',
    cluster: 'mevzuat',
    title: 'Mesafeli Sözleşmeler Yönetmeliği özeti',
    seoTitle: 'Mesafeli Sözleşmeler Yönetmeliği özeti',
    description:
      'Uzaktan satışta ön bilgilendirme, cayma hakkı ve yönetmelikte yapılan değişiklikle ön bilgiye eklenen iade taşıyıcısı ve uyuşmazlık bilgisi.',
    summary: 'Ön bilgilendirme, cayma hakkı ve son değişiklik.',
    answer:
      "Mesafeli Sözleşmeler Yönetmeliği, internet gibi uzaktan iletişim araçlarıyla tüketiciye yapılan satışlarda satıcının yükümlülüklerini düzenler; dayanağı 6502 sayılı Tüketicinin Korunması Hakkında Kanun'dur. Satıcı, sözleşme kurulmadan önce tüketiciyi ön bilgilendirme ile bilgilendirir ve tüketiciye 14 günlük cayma hakkı tanınır. 1 Ocak 2026'da yürürlüğe giren değişiklikle ön bilgilendirmeye iade taşıyıcısı ve uyuşmazlık çözüm yolları bilgisi de eklenmiştir.",
    keyPoints: [
      'Satıştan önce ön bilgilendirme zorunludur.',
      'Tüketici 14 gün içinde cayma hakkını kullanabilir.',
      'Değişiklikle iade taşıyıcısı ve uyuşmazlık çözüm yolları bilgisi ön bilgiye eklendi.',
    ],
    sections: [
      {
        id: 'kapsam',
        title: 'Yönetmelik neyi düzenler?',
        blocks: [
          {
            type: 'p',
            text: 'Yönetmelik, satıcı ile tüketicinin aynı ortamda bulunmadan, uzaktan iletişim araçlarıyla kurduğu sözleşmeleri kapsar. İnternet sitesinden, mobil uygulamadan veya pazaryerinden yapılan satışlar bu kapsama girer. Satıcının tüketiciye ne zaman, hangi bilgiyi vermesi gerektiğini ve cayma hakkının nasıl kullanılacağını düzenler.',
          },
        ],
      },
      {
        id: 'on-bilgilendirme',
        title: 'Ön bilgilendirme',
        blocks: [
          {
            type: 'p',
            text: 'Tüketici sipariş vermeden önce satıcı, ürün veya hizmet, fiyat, teslimat ve cayma hakkı hakkında bilgilendirilir. Bu bilgilendirme yapılmazsa cayma süresi uzayabilir; ayrıntı [cayma hakkı](/rehber/mevzuat/cayma-hakki-14-gun) rehberinde.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Ön bilginin tam içeriği',
            text: 'Ön bilgilendirmede yer alması gereken bilgilerin tam listesi yönetmelikte sayılır. Kendi ön bilgilendirme formunuzu hazırlarken yönetmeliğin güncel metnini esas alın.',
          },
        ],
      },
      {
        id: 'degisiklik',
        title: 'Son değişiklik',
        blocks: [
          {
            type: 'table',
            caption: 'Mesafeli Sözleşmeler Yönetmeliği değişikliği',
            head: ['Konu', 'Değişiklik'],
            rows: [
              ['Yayım', 'Resmî Gazete, 24 Mayıs 2025, sayı 32909'],
              ['Yürürlük', '1 Ocak 2026'],
              ['İade kargo gideri', 'Satıcının belirttiği taşıyıcıyla yapılan iadede tüketiciye yüklenemez'],
              ['Ön bilgilendirme', 'Cayma hakkı ve iade taşıyıcısı bilgisi yer alır; uyuşmazlık çözüm yolları bildirilir'],
            ],
          },
          {
            type: 'p',
            text: 'İade kargo tarafındaki etkisini [iade kargo](/rehber/kargo/iade-kargo) rehberinde anlattık.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'sozlesme-zorunlu',
        question: 'Mesafeli satış sözleşmesi zorunlu mu?',
        answer:
          'Tüketiciye uzaktan satış yapıyorsanız yönetmelikteki ön bilgilendirme ve sözleşme yükümlülükleri geçerlidir. Metinlerinizi yönetmeliğin güncel hâline göre hazırlayın.',
      },
      {
        id: 'pazaryeri',
        question: 'Pazaryerinde satarken de geçerli mi?',
        answer:
          'Evet, pazaryeri de uzaktan satış ortamıdır. Pazaryeri ön bilgilendirme altyapısını sağlasa da mağaza bilgilerinizin ve iade koşullarınızın güncel olmasından siz sorumlusunuz.',
      },
      {
        id: 'ne-degisti',
        question: 'Yönetmelikte ne değişti?',
        answer:
          '1 Ocak 2026’dan itibaren satıcının belirttiği taşıyıcıyla yapılan iadede kargo gideri tüketiciye yüklenemez; ön bilgiye iade taşıyıcısı ve uyuşmazlık çözüm yolları bilgisi eklendi.',
      },
    ],
    sources: ['S15', 'S14', 'S13', 'S16', 'S17'],
    related: ['mevzuat/cayma-hakki-14-gun', 'kargo/iade-kargo', 'mevzuat/etbis-e-ticaret-kanunu'],
    cta: 'returns',
    legal: true,
    volatile: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R24
  {
    slug: 'mevzuat/etk-iys-ticari-ileti',
    kbId: 'R24',
    cluster: 'mevzuat',
    title: 'Ticari ileti izni ve İYS (İleti Yönetim Sistemi)',
    seoTitle: 'Ticari ileti izni ve İYS',
    description:
      'Kampanya SMS’i ve e-postası için ticari elektronik ileti izni, İleti Yönetim Sistemi’nin işleyişi ve e-ticaret satıcısının kontrol listesi.',
    summary: 'Ticari ileti izni, İYS’nin işleyişi ve kontrol listesi.',
    answer:
      "Ticari elektronik ileti (kampanya SMS'i, e-postası veya araması) göndermek için alıcının önceden onayı gerekir; dayanağı 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun'dur. İleti Yönetim Sistemi (İYS), Ticaret Bakanlığı gözetiminde onay ve ret kayıtlarının zaman damgasıyla tutulduğu sistemdir ve hizmet sağlayıcılar temel hizmetlerini ücretsiz kullanır. Onay alınan kişilerin İYS'ye kaydedilmesi ve ret taleplerinin işlenmesi gerekir.",
    keyPoints: [
      'Kampanya iletisi için önceden onay gerekir.',
      'Onay ve ret kayıtları İYS’de zaman damgasıyla tutulur.',
      'Hizmet sağlayıcılar İYS’nin temel hizmetlerini ücretsiz kullanır.',
    ],
    sections: [
      {
        id: 'ticari-ileti',
        title: 'Ticari elektronik ileti nedir?',
        blocks: [
          {
            type: 'p',
            text: 'Mal veya hizmetin tanıtımı, satışı ya da işletmenin bilinirliğini artırmak amacıyla SMS, e-posta veya arama yoluyla gönderilen iletilerdir. Sipariş onayı, kargo bildirimi gibi alışverişin kendisiyle ilgili bilgilendirmeler ile kampanya iletileri aynı şey değildir; kampanya iletisi için ayrıca izin gerekir.',
          },
        ],
      },
      {
        id: 'iys',
        title: 'İYS nasıl işler?',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'İYS’ye kaydolun', text: 'Ticari ileti gönderen hizmet sağlayıcı olarak İYS’ye kaydolun.' },
              { name: 'Onayları kaydedin', text: 'Sitenizde, mağazanızda veya diğer kanallarda aldığınız ileti onaylarını İYS’ye kaydedin.' },
              { name: 'Göndermeden önce kontrol edin', text: 'Kampanya iletisi göndermeden önce alıcının İYS’de onayının bulunduğunu kontrol edin.' },
              { name: 'Ret taleplerini işleyin', text: 'Alıcı İYS üzerinden veya size doğrudan ret bildirdiğinde, ileti gönderimini durdurun.' },
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'İstisnalar',
            text: 'Belirli alıcı gruplarına yapılan gönderimlerde önceden onay aranmayan istisnalar bulunur. İstisnaların kapsamını İYS’nin sıkça sorulan sorular sayfasından ve ilgili mevzuattan kontrol edin.',
          },
        ],
      },
      {
        id: 'kontrol',
        title: 'E-ticaret satıcısı için kontrol listesi',
        blocks: [
          {
            type: 'ul',
            items: [
              'Üyelik ve sipariş formlarında ileti onayını ayrı, önceden işaretlenmemiş bir seçenek olarak alın.',
              'Onayları İYS’ye kaydedin ve kampanya listelerinizi İYS ile eşleyin.',
              'Her iletide ret (abonelikten çıkma) yolunu açıkça gösterin.',
              'Kişisel verilerle ilgili yükümlülükleriniz için [KVKK rehberine](/rehber/mevzuat/kvkk-e-ticaret-saticilar) bakın.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'sms-izin',
        question: 'SMS kampanyası için izin gerekir mi?',
        answer: 'Evet. Kampanya amaçlı SMS için alıcının önceden onayı gerekir ve onayın İYS’ye kaydedilmesi gerekir.',
      },
      {
        id: 'siparis-bildirimi',
        question: 'Sipariş ve kargo bildirimleri de izne tabi mi?',
        answer:
          'Alışverişin kendisiyle ilgili bilgilendirmeler kampanya iletisi değildir. Bildirimin içine tanıtım eklerseniz ileti ticari niteliğe dönüşebilir; sınırı mevzuattan kontrol edin.',
      },
      {
        id: 'ucret',
        question: 'İYS ücretli mi?',
        answer: 'İYS’ye göre hizmet sağlayıcılar sistemin temel hizmetlerini ücretsiz kullanır.',
      },
    ],
    sources: ['S23', 'S24', 'S25', 'S26', 'S29'],
    related: ['mevzuat/kvkk-e-ticaret-saticilar', 'mevzuat/etbis-e-ticaret-kanunu', 'mevzuat/mesafeli-sozlesmeler-yonetmeligi'],
    cta: 'security',
    legal: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R25
  {
    slug: 'mevzuat/etbis-e-ticaret-kanunu',
    kbId: 'R25',
    cluster: 'mevzuat',
    title: 'ETBİS ve E-Ticaret Kanunu',
    seoTitle: 'ETBİS ve E-Ticaret Kanunu',
    description:
      'Elektronik Ticaret Bilgi Sistemi (ETBİS) kaydı, hizmet sağlayıcı ve aracı hizmet sağlayıcı kavramları ve satıcının temel yükümlülükleri.',
    summary: 'ETBİS kaydı, hizmet sağlayıcı ve aracı hizmet sağlayıcı.',
    answer:
      "ETBİS (Elektronik Ticaret Bilgi Sistemi), e-ticaret yapan işletmelerin Ticaret Bakanlığı'na kayıt olduğu sistemdir. 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun, kendi sitesinden satış yapan işletmeyi hizmet sağlayıcı, başkalarının satışına ortam sağlayan pazaryerini aracı hizmet sağlayıcı olarak tanımlar. Kayıt ve bilgilendirme yükümlülüklerinin ayrıntısı Kanun'a bağlı yönetmelikte düzenlenir.",
    keyPoints: [
      'ETBİS, e-ticaret yapan işletmelerin kayıt sistemidir.',
      'Kendi sitesinden satan işletme hizmet sağlayıcı, pazaryeri aracı hizmet sağlayıcıdır.',
      'Bazı pazaryerleri satıcı başvurusunda ETBİS kaydını ister.',
    ],
    sections: [
      {
        id: 'roller',
        title: 'Hizmet sağlayıcı ve aracı hizmet sağlayıcı',
        blocks: [
          {
            type: 'table',
            caption: 'E-ticaret mevzuatındaki roller',
            head: ['Rol', 'Kim?', 'Örnek'],
            rows: [
              ['Hizmet sağlayıcı', 'Elektronik ticaret faaliyetinde bulunan gerçek veya tüzel kişi', 'Kendi sitesinden veya pazaryerinden satış yapan işletme'],
              ['Aracı hizmet sağlayıcı', 'Başkalarının ticari faaliyetleri için elektronik ortam sağlayan kişi', 'Pazaryeri platformu'],
            ],
          },
          {
            type: 'p',
            text: 'Bağlayıcı tanımlar 6563 sayılı Kanun ve Elektronik Ticarette Hizmet Sağlayıcı ve Aracı Hizmet Sağlayıcılar Hakkında Yönetmelik’te yer alır.',
          },
        ],
      },
      {
        id: 'etbis',
        title: 'ETBİS kaydı',
        blocks: [
          {
            type: 'p',
            text: 'E-ticaret yapan işletmeler ETBİS’e kaydolur. Trendyol gibi bazı pazaryerleri satıcı başvurusu sırasında ETBİS kaydını istenen belgeler arasında sayar; bkz. [Trendyol’da satıcı olma](/rehber/pazaryerleri/trendyol-satici-olma). Kaydın kimler için zorunlu olduğu ve hangi bilgilerin bildirileceği yönetmelikte düzenlenir; kendi durumunuzu Ticaret Bakanlığı’nın ETBİS sayfasından kontrol edin.',
          },
        ],
      },
      {
        id: 'yukumlulukler',
        title: 'Satıcının temel yükümlülükleri',
        blocks: [
          {
            type: 'ul',
            items: [
              'Sitenizde işletme bilgilerinizi (unvan, iletişim, sicil bilgileri) erişilebilir biçimde yayımlayın.',
              'Tüketiciye satışta [Mesafeli Sözleşmeler Yönetmeliği](/rehber/mevzuat/mesafeli-sozlesmeler-yonetmeligi) kurallarına uyun.',
              'Kampanya iletileri için [İYS](/rehber/mevzuat/etk-iys-ticari-ileti) kurallarını uygulayın.',
              'Alıcı verisini [KVKK](/rehber/mevzuat/kvkk-e-ticaret-saticilar) kapsamında koruyun.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'etbis-kim',
        question: 'ETBİS kimin için?',
        answer: 'E-ticaret faaliyetinde bulunan işletmeler için. Kayıt yükümlülüğünün kapsamını Ticaret Bakanlığı’nın ETBİS sayfasından kontrol edin.',
      },
      {
        id: 'pazaryeri-etbis',
        question: 'Yalnızca pazaryerinde satıyorum, ETBİS gerekir mi?',
        answer:
          'Bazı pazaryerleri satıcı başvurusunda ETBİS kaydını ister. Yükümlülüğün sizin için geçerli olup olmadığını yönetmelikten ve Bakanlığın ETBİS sayfasından kontrol edin.',
      },
      {
        id: 'araci',
        question: 'Aracı hizmet sağlayıcı ne demek?',
        answer: 'Başkalarının ticari faaliyetleri için elektronik ortam sağlayan kişi; pazaryerleri bu kapsamdadır.',
      },
    ],
    sources: ['S27', 'S28', 'S24', 'S32'],
    related: ['mevzuat/mesafeli-sozlesmeler-yonetmeligi', 'mevzuat/etk-iys-ticari-ileti', 'pazaryerleri/trendyol-satici-olma'],
    cta: 'channels',
    legal: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R12
  {
    slug: 'altyapi-erp/erp-on-muhasebe-entegrasyonu',
    kbId: 'R12',
    cluster: 'operasyon',
    title: 'ERP ve ön muhasebe entegrasyonu ne işe yarar?',
    seoTitle: 'ERP ve ön muhasebe entegrasyonu',
    description:
      'Sipariş, stok ve fatura verisinin ERP veya ön muhasebe yazılımına akışı, çift kaydın önlenmesi ve kurulumdan önce netleştirilecek veri yönü.',
    summary: 'Sipariş, stok ve fatura verisinin muhasebeye akışı.',
    answer:
      'ERP ve ön muhasebe entegrasyonu, pazaryeri ve sitenizdeki sipariş, stok ve ürün verisinin muhasebe veya kaynak planlama yazılımınıza elle girilmeden aktarılmasıdır. Amaç aynı bilgiyi iki kez girmemek ve stok ile muhasebe kaydının tutarlı kalmasıdır. Kurulumdan önce hangi verinin hangi yönde aktığını (yalnızca okuma mı, iki yönlü mü) ve stoğun hangi sistemde doğru kabul edileceğini netleştirmek gerekir.',
    keyPoints: [
      'Çift kaydı ve elle aktarım hatalarını azaltır.',
      'Veri yönü (okuma / yazma) kurulumdan önce belirlenmelidir.',
      'Stoğun doğru kabul edildiği tek sistem seçilmelidir.',
    ],
    sections: [
      {
        id: 'akis',
        title: 'Hangi veri, hangi yönde akar?',
        blocks: [
          {
            type: 'table',
            caption: 'ERP / ön muhasebe entegrasyonunda tipik veri akışları',
            head: ['Veri', 'Tipik yön', 'Not'],
            rows: [
              ['Ürün kataloğu', 'ERP → satış kanalları', 'Ürün kartları ERP’de tutuluyorsa kanallara buradan yayılır'],
              ['Stok', 'Tek kaynak → diğerleri', 'Stoğun hangi sistemde doğru kabul edileceği seçilmelidir'],
              ['Sipariş', 'Satış kanalları → ERP', 'Satış kaydı ve stok düşümü için'],
              ['Fatura', 'ERP veya e-belge sistemi → kanal', 'Fatura bağlantısı siparişe eklenir'],
            ],
          },
        ],
      },
      {
        id: 'cift-kayit',
        title: 'Çift kayıt sorunu',
        blocks: [
          {
            type: 'p',
            text: 'Pazaryeri siparişleri muhasebeye elle girildiğinde aynı sipariş iki kez kaydedilebilir, iadeler atlanabilir ve stok muhasebe kaydıyla ayrışabilir. Entegrasyonun asıl değeri, her kaydın tek bir kaynaktan ve sipariş numarasıyla eşleşmiş biçimde oluşmasıdır; bu da [hakediş mutabakatını](/rehber/pazaryerleri/hakedis-ve-odeme-dongusu) kolaylaştırır.',
          },
        ],
      },
      {
        id: 'hazirlik',
        title: 'Kurulumdan önce',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Veri yönünü belirleyin', text: 'Her veri türü için entegrasyonun yalnızca okuyup okumayacağını ya da yazacağını belirleyin.' },
              { name: 'Stok kaynağını seçin', text: 'Stoğun ERP’de mi, depo yazılımında mı, entegrasyon panelinde mi doğru kabul edileceğine karar verin.' },
              { name: 'Kodları eşleyin', text: 'ERP’deki stok kodlarının pazaryerlerindeki barkod veya stok kodlarıyla birebir eşleştiğini kontrol edin.' },
              { name: 'Küçük başlayın', text: 'Az sayıda ürünle test edin; kayıtların doğru oluştuğunu gördükten sonra kapsamı genişletin.' },
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'hangi-veri',
        question: 'Hangi veri ERP’ye gider?',
        answer: 'Genellikle sipariş (satış), stok hareketi, fatura ve müşteri bilgisi. Hangi verinin aktığı kullanılan entegrasyona göre değişir.',
      },
      {
        id: 'on-muhasebe-yeterli',
        question: 'Ön muhasebe yazılımı yeterli mi, ERP mi gerekir?',
        answer:
          'Ürün ve sipariş hacminize, depo ve üretim ihtiyacınıza bağlıdır. Küçük ve orta ölçekli satıcılar için ön muhasebe çoğu zaman yeterlidir.',
      },
      {
        id: 'iki-yonlu',
        question: 'Entegrasyon iki yönlü mü olmalı?',
        answer:
          'Zorunlu değildir. Yalnızca okuma, mevcut kayıtları değiştirmediği için daha az risklidir; iki yönlü akış ise elle işi daha çok azaltır. Kararı süreçlerinize göre verin.',
      },
    ],
    sources: ['S47', 'S46'],
    related: ['altyapi-erp/eticaret-altyapisi-pazaryeri-entegrasyonu', 'karsilastirma/tek-stokla-cok-kanal-yonetimi', 'pazaryerleri/hakedis-ve-odeme-dongusu'],
    cta: 'catalog',
    ctaChannel: 'bizimhesap',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R18
  {
    slug: 'kargo/kargo-entegrasyonu-nedir',
    kbId: 'R18',
    cluster: 'operasyon',
    title: 'Kargo entegrasyonu nedir, nasıl çalışır?',
    seoTitle: 'Kargo entegrasyonu nedir?',
    description:
      'Siparişlerde kargo etiketi, takip numarası ve teslimat durumunun akışı; pazaryeri anlaşmalı kargosu ile kendi kargo anlaşmanız arasındaki fark.',
    summary: 'Takip numarası akışı ve anlaşmalı kargo modeli.',
    answer:
      'Kargo entegrasyonu, siparişin kargo firmasına iletilmesi, gönderi etiketinin ve takip numarasının oluşturulması ve bu bilginin satış kanalına geri bildirilmesi akışının otomatikleştirilmesidir. Pazaryerlerinde çoğu zaman pazaryerinin kargo firmalarıyla yaptığı toplu anlaşma (anlaşmalı kargo) kullanılır; satıcı kendi kargo anlaşmasıyla da gönderebilir. Her iki modelde de takip numarasının pazaryerine zamanında bildirilmesi gerekir.',
    keyPoints: [
      'Akış: sipariş → etiket → kargoya teslim → takip numarası → teslimat durumu.',
      'Anlaşmalı kargoda gönderi, pazaryerinin sağladığı kodla yapılır.',
      'Kargoya teslim süresi pazaryeri sözleşmesinde tanımlanır.',
    ],
    sections: [
      {
        id: 'akis',
        title: 'Kargo bilgisi nasıl akar?',
        blocks: [
          {
            type: 'flow',
            caption: 'Bir gönderinin bilgi akışı',
            items: ['Sipariş', 'Etiket ve gönderi kodu', 'Kargoya teslim', 'Takip numarası kanala bildirilir', 'Teslimat durumu'],
          },
          {
            type: 'p',
            text: 'Entegrasyon olmadan bu adımlar kargo firmasının ve pazaryerinin panellerinde elle yapılır. Entegrasyonla sipariş bilgisi kargo sistemine aktarılır, takip numarası otomatik olarak siparişe yazılır ve kanala bildirilir.',
          },
        ],
      },
      {
        id: 'modeller',
        title: 'Anlaşmalı kargo mu, kendi anlaşmanız mı?',
        blocks: [
          {
            type: 'table',
            caption: 'Kargo modelleri',
            head: ['Model', 'Nasıl çalışır?', 'Dikkat'],
            rows: [
              ['Pazaryeri anlaşmalı kargo', 'Pazaryeri kargo firmalarıyla toplu anlaşma yapar; satıcı gönderiyi pazaryerinin sağladığı kodla gönderir', 'Kargo bedeli çoğunlukla hakedişten düşülür; kullanılabilen firmalar ve tarifeler pazaryerine göre değişir'],
              ['Satıcının kendi anlaşması', 'Satıcı kargo firmasıyla kendisi anlaşır ve takip numarasını kanala bildirir', 'Takip numarasının zamanında ve doğru bildirilmesi satıcının sorumluluğundadır'],
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Firma listeleri ve süreler',
            text: 'Her pazaryerinin anlaşmalı kargo firmaları, tarifeleri ve kargoya teslim süreleri satıcı sözleşmesinde tanımlanır ve değişebilir; resmi bir kaynakta doğrulayamadığımız için firma adı ve süre vermiyoruz.',
          },
        ],
      },
      {
        id: 'iade',
        title: 'İade gönderileri',
        blocks: [
          {
            type: 'p',
            text: 'İade gönderilerinde de takip numarası kritik bilgidir; iade ürünün satıcıya ulaştığını ve stoğa dönebileceğini gösterir. Yönetmelik değişikliğiyle iade kargo giderine ilişkin kural için [iade kargo](/rehber/kargo/iade-kargo) rehberine bakın.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'takip-pazaryerine',
        question: 'Takip numarası pazaryerine nasıl gider?',
        answer:
          'Anlaşmalı kargoda gönderi pazaryerinin koduyla yapıldığından bilgi pazaryerinde oluşur. Kendi anlaşmanızda takip numarasını satıcı panelinden veya entegrasyon üzerinden siparişe girersiniz.',
      },
      {
        id: 'kendi-anlasma',
        question: 'Kendi kargo anlaşmamı kullanabilir miyim?',
        answer: 'Pazaryerinin kurallarına bağlıdır. Hangi kargo modellerine izin verildiğini satıcı panelinizden ve sözleşmenizden kontrol edin.',
      },
      {
        id: 'entegrasyonik-kargo',
        question: 'Entegrasyonik kargo firmalarıyla bağlantı kurar mı?',
        answer:
          'Hayır, Entegrasyonik bugün kargo firmalarıyla doğrudan bağlantı kurmaz ve etiket üretmez. Elle girilen kargo takip bilgisini, bu bildirimi destekleyen pazaryerlerine iletebilir.',
      },
    ],
    sources: ['S30', 'S36', 'S16'],
    related: ['kargo/iade-kargo', 'pazaryerleri/hakedis-ve-odeme-dongusu', 'karsilastirma/tek-stokla-cok-kanal-yonetimi'],
    cta: 'shipping',
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },
]

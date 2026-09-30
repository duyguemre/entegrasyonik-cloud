/**
 * Rehber — "Pazaryerleri ve pazar" kümesi (KB §2, §3, §8.2, §8.8; sayfalar R2, R3, R9, R10, R30).
 *
 * KB §3 notu: komisyon oranları, hakediş takvimleri (ödeme günleri dahil), N11/Pazarama resmi API kimlik adımları ve
 * pazaryeri onay süreleri DOĞRULANAMADI → yazılmaz. Satıcı başvuru adımları ikincil kaynaklardan derlendiği için
 * sayfada "satıcı panelindeki güncel listeyi esas alın" notu taşır. Kimlik bilgisi türleri (anahtar/gizli anahtar/
 * satıcı kimliği) Entegrasyonik'in kendi bağlantı kaydından (`src/data/connect.ts`) gelir.
 */
import type { Guide } from '../types'

const D = '2026-09-30'

export const pazaryeriGuides: Guide[] = [
  // ------------------------------------------------------------------------------------------ R2
  {
    slug: 'pazaryerleri/trendyol-satici-olma',
    kbId: 'R2',
    cluster: 'pazaryerleri',
    title: "Trendyol'da satıcı nasıl olunur?",
    seoTitle: "Trendyol'da satıcı nasıl olunur?",
    description:
      "Trendyol'da satıcı olmak için kimlerin başvurabileceği, başvuru adımları, istenen belgeler ve mağaza açıldıktan sonra API bilgilerinin alınması.",
    summary: 'Başvuru adımları, belgeler ve API bilgilerini alma.',
    answer:
      "Trendyol'da satış, vergi kaydı olan işletmelere açıktır; vergi mükellefiyeti olmayan bireysel satıcı hesabı açılmaz. Başvuru satıcı başvuru sayfasından yapılır, firma ve vergi bilgileri girilir, istenen belgeler yüklenir ve onaydan sonra mağaza paneli açılır. Entegrasyon için gereken satıcı kimliği, API anahtarı ve API gizli anahtarı, mağaza açıldıktan sonra satıcı panelinden edinilir.",
    keyPoints: [
      'Başvuru için vergi kaydı olan bir işletme gerekir (şahıs şirketi dahil).',
      'Belge listesi başvuru sırasında panelde gösterilir; güncel listeyi esas alın.',
      'Komisyon kategori bazlıdır ve satıcı panelinde yayımlanır.',
      'API bilgileri mağaza açıldıktan sonra panelden alınır.',
    ],
    sections: [
      {
        id: 'kimler',
        title: 'Kimler satış yapabilir?',
        blocks: [
          {
            type: 'p',
            text: "Trendyol'da satıcı olabilmek için vergi kaydı olan bir işletmeniz olmalıdır: şahıs şirketi, limited veya anonim şirket. Vergi mükellefiyeti olmayan bireylerin satıcı hesabı açması mümkün değildir. Faturalandırma düzeninizi başvuru öncesinde netleştirmeniz işinizi kolaylaştırır; bkz. [e-ticarette e-Fatura zorunluluğu](/rehber/e-fatura/eticarette-e-fatura-zorunlulugu).",
          },
        ],
      },
      {
        id: 'basvuru',
        title: 'Başvuru adımları',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Satıcı başvuru formunu doldurun', text: 'Trendyol’un satıcı (partner) başvuru sayfasından ön başvuru formunu doldurun; işletme türünüzü ve satmak istediğiniz kategoriyi seçin.' },
              { name: 'Firma ve vergi bilgilerini girin', text: 'Ticari unvan, vergi dairesi ve vergi numarası, iletişim ve banka (IBAN) bilgilerinizi eksiksiz girin.' },
              { name: 'Belgeleri yükleyin', text: 'Panelde istenen belgeleri yükleyin; sık istenen belgeler aşağıdaki listede.' },
              { name: 'Sözleşmeyi onaylayın ve incelemeyi bekleyin', text: 'Satıcı sözleşmesini okuyup onaylayın; başvurunuz incelendikten sonra mağaza paneliniz açılır.' },
              { name: 'Mağazanızı hazırlayın', text: 'Mağaza bilgilerinizi, iade ve kargo ayarlarınızı tamamlayın; ürünlerinizi kategori ve özellik şablonlarına göre listeleyin.' },
              { name: 'Entegrasyon bilgilerini alın', text: 'Ürün, stok ve siparişleri bir entegrasyon yazılımıyla yönetecekseniz satıcı panelinizden satıcı kimliğinizi ve API anahtarlarınızı edinin.' },
            ],
          },
        ],
      },
      {
        id: 'belgeler',
        title: 'Sık istenen belgeler',
        blocks: [
          {
            type: 'ul',
            items: ['Vergi levhası', 'İmza sirküleri', 'Faaliyet belgesi', 'ETBİS kaydı', 'Banka hesabı bilgisi (IBAN)'],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Belge listesi değişebilir',
            text: 'Bu liste ikincil kaynaklardan derlenmiştir. Başvuru sırasında satıcı panelinde istenen güncel belge listesini esas alın.',
          },
        ],
      },
      {
        id: 'api',
        title: 'API bilgileri ve entegrasyon',
        blocks: [
          {
            type: 'p',
            text: 'Trendyol, satıcıların ürün, stok, fiyat ve sipariş işlemlerini yazılımla yapabilmesi için Marketplace API sunar; teknik belgeler Trendyol’un geliştirici sitesinde yayımlanır. Bir entegrasyon yazılımına bağlanmak için genellikle üç bilgi gerekir: **satıcı kimliği**, **API anahtarı** ve **API gizli anahtarı**. Bu bilgileri yalnızca güvendiğiniz yazılıma girin ve kimseyle e-posta veya mesajla paylaşmayın.',
          },
          {
            type: 'p',
            text: 'Diğer pazaryerlerinde kimlik bilgisinin nasıl alındığını [pazaryeri API erişimi](/rehber/pazaryerleri/pazaryeri-api-erisimi) rehberinde karşılaştırdık.',
          },
        ],
      },
      {
        id: 'siparis-akisi',
        title: 'Sipariş, kargo ve iade akışı',
        blocks: [
          {
            type: 'flow',
            caption: 'Bir siparişin yaşam döngüsü',
            items: ['Sipariş', 'Hazırlık', 'Kargoya teslim', 'Takip numarası', 'Teslimat', 'İade süresi', 'Hakediş'],
          },
          {
            type: 'p',
            text: 'Siparişi kargoya teslim süresi, iade kabul kuralları ve gecikme durumunda uygulanan yaptırımlar satıcı sözleşmesinde tanımlanır ve değişebilir. Kesin süreler için satıcı panelinizi ve sözleşmenizi esas alın.',
          },
        ],
      },
      {
        id: 'komisyon-hakedis',
        title: 'Komisyon ve hakediş',
        blocks: [
          {
            type: 'p',
            text: 'Komisyon oranları kategori bazında belirlenir ve dönemsel olarak güncellenir; güncel oran için satıcı panelinizdeki komisyon tablosuna bakın. Ödeme günleri ve erken ödeme seçenekleri de değişebildiği için burada gün veya oran vermiyoruz. Hakedişin nasıl hesaplandığını ve nasıl doğrulanacağını [hakediş ve ödeme döngüsü](/rehber/pazaryerleri/hakedis-ve-odeme-dongusu) rehberinde anlattık.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'bireysel',
        question: "Trendyol'da bireysel olarak satış yapılabilir mi?",
        answer: 'Hayır. Satıcı hesabı için vergi kaydı olan bir işletme gerekir; şahıs şirketi de bu koşulu karşılar.',
      },
      {
        id: 'api-anahtari',
        question: 'Trendyol API anahtarı nerede?',
        answer:
          'Mağazanız açıldıktan sonra satıcı kimliğiniz, API anahtarınız ve API gizli anahtarınız satıcı panelinizde yer alır. Menü adları değişebildiği için panelde entegrasyon veya API bilgileriyle ilgili bölümü arayın.',
      },
      {
        id: 'komisyon',
        question: 'Trendyol komisyon oranı ne kadar?',
        answer:
          'Komisyon kategoriye göre değişir ve dönemsel olarak güncellenir. Güncel oranı satıcı panelinizdeki komisyon tablosundan kontrol edin.',
      },
      {
        id: 'coklu-kanal',
        question: 'Aynı ürünü başka pazaryerlerinde de satabilir miyim?',
        answer:
          'Evet. Bu durumda stok tüm kanallarda ortak olduğundan bir kanaldaki satışın diğerlerine yansıması gerekir; aksi halde aşırı satış oluşabilir.',
      },
    ],
    sources: ['S30', 'S32'],
    related: ['pazaryerleri/pazaryeri-api-erisimi', 'pazaryerleri/hakedis-ve-odeme-dongusu', 'karsilastirma/tek-stokla-cok-kanal-yonetimi'],
    cta: 'connect',
    ctaChannel: 'trendyol',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R3
  {
    slug: 'pazaryerleri/hepsiburada-satici-olma',
    kbId: 'R3',
    cluster: 'pazaryerleri',
    title: "Hepsiburada'da satıcı nasıl olunur?",
    seoTitle: "Hepsiburada'da satıcı nasıl olunur?",
    description:
      "Hepsiburada'da satıcı başvurusu için gerekenler, başvuru adımları, API kullanıcı bilgilerinin talep edilmesi ve mağaza açıldıktan sonraki hazırlık.",
    summary: 'Başvuru adımları ve API bilgilerinin talep edilmesi.',
    answer:
      "Hepsiburada'da satıcı olmak için Hepsiburada'nın satıcı başvuru sayfasından şirket, vergi ve banka bilgilerinizle başvurursunuz; onaydan sonra satıcı paneliniz açılır. Entegrasyon için gereken API kullanıcı bilgileri, ikincil kaynaklara göre satıcı paneli üzerinden destek talebiyle istenir. Teknik belgeler Hepsiburada'nın geliştirici portalında yayımlanır.",
    keyPoints: [
      'Başvuru şirket, vergi ve banka bilgileriyle yapılır.',
      'API kullanıcı bilgileri satıcı paneli üzerinden talep edilir.',
      'Komisyon ve ödeme koşulları satıcı panelinde ve sözleşmede yer alır.',
    ],
    sections: [
      {
        id: 'basvuru',
        title: 'Başvuru adımları',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Satıcı başvuru sayfasına gidin', text: 'Hepsiburada’nın satıcı başvuru sayfasından başvuru formunu açın.' },
              { name: 'Şirket bilgilerinizi girin', text: 'Şirket unvanı, vergi dairesi ve numarası, iletişim ve banka bilgilerinizi girin; satmak istediğiniz kategorileri belirtin.' },
              { name: 'Belgeleri yükleyin ve sözleşmeyi onaylayın', text: 'Panelde istenen belgeleri yükleyin ve satıcı sözleşmesini onaylayın.' },
              { name: 'Onaydan sonra mağazanızı hazırlayın', text: 'Satıcı paneliniz açıldığında mağaza, kargo ve iade ayarlarınızı tamamlayın, ürünlerinizi listeleyin.' },
              { name: 'API bilgilerini talep edin', text: 'Bir entegrasyon yazılımı kullanacaksanız API kullanıcı bilgilerinizi satıcı paneli üzerinden destek talebiyle isteyin.' },
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Adımlar değişebilir',
            text: 'Adımlar ve istenen belgeler ikincil kaynaklardan derlenmiştir. Başvuru sırasında satıcı sayfasındaki güncel akışı esas alın.',
          },
        ],
      },
      {
        id: 'api',
        title: 'API bilgileri',
        blocks: [
          {
            type: 'p',
            text: 'Hepsiburada’nın satıcı API’lerine ait teknik belgeler geliştirici portalında yer alır. Bir entegrasyon yazılımına bağlanırken **mağaza (satıcı) kimliğiniz** ve size verilen **API kimlik bilgileri** istenir. Bu bilgileri talep ettiğinizde yalnızca kendi hesabınıza ait olduklarını ve yetkisiz kişilerle paylaşılmadıklarını kontrol edin.',
          },
          {
            type: 'p',
            text: 'Kimlik bilgisi alma yollarını pazaryeri bazında [pazaryeri API erişimi](/rehber/pazaryerleri/pazaryeri-api-erisimi) rehberinde karşılaştırdık.',
          },
        ],
      },
      {
        id: 'operasyon',
        title: 'Mağaza açıldıktan sonra',
        blocks: [
          {
            type: 'ul',
            items: [
              'Ürünlerinizi barkod ve stok kodu (SKU) ile tekilleştirin; aynı ürün birden çok kanalda satılacaksa bu eşleme stok güvenliğinin temelidir.',
              'Kategori ve özellik eşlemelerini tamamlayın; eksik özellik ürünün yayına çıkmasını geciktirebilir.',
              'Kargoya teslim süresini ve iade kurallarını sözleşmenizden okuyup ekibinizle paylaşın.',
              'Komisyon ve ödeme koşullarını satıcı panelinizden izleyin; hakedişi dönemsel olarak doğrulayın.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'api-bilgisi',
        question: 'Hepsiburada API bilgilerimi nasıl alırım?',
        answer:
          'İkincil kaynaklara göre API kullanıcı bilgileri satıcı paneli üzerinden destek talebiyle istenir. Teknik belgeler Hepsiburada geliştirici portalında yer alır.',
      },
      {
        id: 'komisyon',
        question: 'Hepsiburada komisyonu ne kadar?',
        answer: 'Komisyon kategoriye göre değişir. Güncel oranı satıcı panelinizden ve sözleşmenizden kontrol edin.',
      },
      {
        id: 'odeme',
        question: 'Hepsiburada ödemeleri ne zaman yapılır?',
        answer:
          'Ödeme takvimi satıcı sözleşmesinde belirlenir ve değişebilir. Doğrulanmış resmi bir takvim bulamadığımız için gün vermiyoruz; satıcı panelinizi esas alın.',
      },
    ],
    sources: ['S35', 'S36'],
    related: ['pazaryerleri/pazaryeri-api-erisimi', 'pazaryerleri/trendyol-satici-olma', 'karsilastirma/asiri-satis-overselling'],
    cta: 'connect',
    ctaChannel: 'hepsiburada',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R9
  {
    slug: 'pazaryerleri/pazaryeri-api-erisimi',
    kbId: 'R9',
    cluster: 'pazaryerleri',
    title: 'Pazaryeri API erişimi nasıl alınır?',
    seoTitle: 'Pazaryeri API erişimi nasıl alınır?',
    description:
      'Trendyol, Hepsiburada, n11, Pazarama, Amazon ve Ideasoft için API kimlik bilgisini alma yolları ve anahtarları güvenle kullanmanın kuralları.',
    summary: 'Pazaryeri bazında kimlik bilgisi alma yolları ve güvenlik.',
    answer:
      'Pazaryeri API erişimi, satıcı hesabınıza bağlı kimlik bilgileriyle (API anahtarı, gizli anahtar ve çoğu zaman satıcı kimliği) sağlanır. Trendyol’da bu bilgiler mağaza açıldıktan sonra satıcı panelinden edinilir; Hepsiburada’da ikincil kaynaklara göre satıcı paneli üzerinden talep edilir; Ideasoft’ta yönetim panelinde API bölümünden oluşturulur. Anahtarlar hesabınıza tam erişim verebildiği için yalnızca güvendiğiniz yazılıma girilmeli ve şifreli saklanmalıdır.',
    keyPoints: [
      'Kimlik bilgileri satıcı hesabına bağlıdır; paylaşmak hesabınıza erişim vermek demektir.',
      'Her platformun alma yolu farklıdır; resmi adımı doğrulanamayanlar tabloda belirtilmiştir.',
      'Sızdığından şüphelendiğiniz anahtarı panelden yenileyin.',
    ],
    sections: [
      {
        id: 'nedir',
        title: 'API erişimi ne işe yarar?',
        blocks: [
          {
            type: 'p',
            text: 'API (uygulama programlama arayüzü), ürün, stok, fiyat ve sipariş bilgisinin pazaryeri paneline elle girilmeden yazılımlar arasında aktarılmasını sağlar. Birden çok kanalda satış yapıyorsanız stok ve siparişleri tek yerden yönetmenin yolu bu erişimden geçer. Pazaryerleri istek sayısını belirli bir süre içinde sınırlar ([rate limit](/rehber/sozluk#rate-limit)); iyi bir entegrasyon bu sınıra göre isteklerini sıraya koyar.',
          },
        ],
      },
      {
        id: 'karsilastirma',
        title: 'Platform bazında kimlik bilgisi',
        blocks: [
          {
            type: 'table',
            caption: 'Platform bazında API kimlik bilgisi alma yolları',
            head: ['Platform', 'Kimlik bilgisi nereden alınır?', 'Kaynak durumu'],
            rows: [
              ['Trendyol', 'Satıcı paneli, mağaza açıldıktan sonra: satıcı kimliği, API anahtarı, API gizli anahtarı', 'API belgeleri resmi; panel adımı ikincil kaynaklardan'],
              ['Hepsiburada', 'Satıcı paneli üzerinden destek talebiyle istenen API kullanıcı bilgileri', 'Geliştirici portalı resmi; talep adımı ikincil kaynaktan'],
              ['n11', 'Satıcı paneliniz veya n11 satıcı destek ekibi', 'Resmi adım doğrulanamadı; panelinizi esas alın'],
              ['Pazarama', 'Satıcı paneliniz veya Pazarama satıcı destek ekibi', 'Resmi adım doğrulanamadı; panelinizi esas alın'],
              ['Amazon (SP-API)', 'Amazon’un Selling Partner API geliştirici kaydı ve yetkilendirme akışı', 'Resmi geliştirici sayfası'],
              ['Ideasoft', 'Yönetim paneli › Entegrasyonlar › API › API Ekle: uygulama adı ve yönlendirme adresi girilir, istemci kimliği (Client ID) ve gizli anahtar (Client Secret) üretilir; okuma veya okuma-yazma izni seçilir', 'Resmi yardım sayfası'],
            ],
          },
          {
            type: 'p',
            text: 'Amazon, üçüncü taraf SP-API geliştirici ücretlerini iptal ettiğini resmi geliştirici sayfasında duyurmuştur. Ideasoft’ta API bölümünü mağazanın ana yönetici hesabı görür.',
          },
        ],
      },
      {
        id: 'guvenlik',
        title: 'Anahtarları güvenle kullanmak',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Paylaşmayın:** anahtarı e-posta, mesajlaşma uygulaması veya ekran görüntüsüyle göndermeyin; yalnızca yazılımın kendi bağlantı ekranına girin.',
              '**En az yetki:** platform izin seçimi sunuyorsa (ör. yalnızca okuma) ihtiyacınız kadar yetki verin.',
              '**Şifreli saklama:** kullandığınız yazılıma anahtarların nasıl saklandığını sorun; veritabanında şifreli saklanmalı ve ekranda maskelenmelidir.',
              '**Yenileme:** ekipten ayrılan biri anahtara erişmişse veya sızıntıdan şüpheleniyorsanız anahtarı panelden yenileyin.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'kimle-paylasirim',
        question: 'API anahtarımı kimle paylaşabilirim?',
        answer:
          'Yalnızca hesabınızı yönetmesine izin verdiğiniz yazılımın bağlantı ekranına girin. Anahtarı kişilerle paylaşmak, hesabınıza erişim vermek anlamına gelir.',
      },
      {
        id: 'sp-api-ucret',
        question: 'Amazon SP-API kullanmak ücretli mi?',
        answer:
          'Amazon, üçüncü taraf SP-API geliştirici ücretlerini iptal ettiğini resmi geliştirici sayfasında duyurmuştur. Koşullar değişebileceği için güncel duyuruyu kontrol edin.',
      },
      {
        id: 'sizinti',
        question: 'Anahtarım sızarsa ne yapmalıyım?',
        answer:
          'Anahtarı pazaryeri panelinden hemen yenileyin ve yeni anahtarı yalnızca kullandığınız yazılıma girin. Sonra sipariş ve fiyat hareketlerinizi olağan dışı değişikliklere karşı kontrol edin.',
      },
    ],
    sources: ['S30', 'S35', 'S36', 'S40', 'S41', 'S46'],
    related: ['pazaryerleri/trendyol-satici-olma', 'pazaryerleri/hepsiburada-satici-olma', 'mevzuat/kvkk-e-ticaret-saticilar'],
    cta: 'security',
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R10
  {
    slug: 'pazaryerleri/hakedis-ve-odeme-dongusu',
    kbId: 'R10',
    cluster: 'pazaryerleri',
    title: 'Pazaryeri hakediş ve ödeme döngüsü',
    seoTitle: 'Pazaryeri hakediş ve ödeme döngüsü',
    description:
      'Hakedişin ne olduğu, satış tutarından hangi kalemlerin düşüldüğü, ödeme takviminin mantığı ve hakedişi siparişlerle karşılaştırma adımları.',
    summary: 'Hakediş hesabı, kesintiler ve mutabakat adımları.',
    answer:
      'Hakediş, pazaryerinde yaptığınız satıştan komisyon, kargo, hizmet bedeli ve iade gibi kesintiler düşüldükten sonra size ödenecek tutardır. Ödeme, pazaryerinin satıcı sözleşmesinde belirlediği takvime göre yapılır; takvim ve oranlar değişebildiği için güncel bilgi satıcı panelindedir. Hakedişi sipariş, iade ve fatura kayıtlarınızla düzenli olarak karşılaştırmak (mutabakat) eksik veya hatalı kesintiyi fark etmenin yoludur.',
    keyPoints: [
      'Hakediş = satış tutarı − kesintiler (komisyon, kargo, hizmet bedeli, iade...).',
      'Ödeme takvimi pazaryerine özgüdür ve değişebilir; gün verilmez.',
      'Düzenli mutabakat, hatalı kesintiyi erken yakalar.',
    ],
    sections: [
      {
        id: 'nedir',
        title: 'Hakediş nasıl oluşur?',
        blocks: [
          {
            type: 'p',
            text: 'Bir sipariş teslim edildikten ve iade süresi gibi koşullar tamamlandıktan sonra satış tutarı hakediş hesabına girer. Bu tutardan pazaryerinin kalemleri düşülür ve kalan tutar belirlenen ödeme gününde hesabınıza aktarılır.',
          },
          {
            type: 'table',
            caption: 'Hakedişten düşülebilen başlıca kalemler',
            head: ['Kalem', 'Ne zaman oluşur?', 'Nerede görülür?'],
            rows: [
              ['Komisyon', 'Her satışta, kategori bazlı oranla', 'Satıcı panelindeki komisyon tablosu ve cari hareketler'],
              ['Kargo bedeli', 'Pazaryerinin anlaşmalı kargosu kullanıldığında', 'Kargo faturaları ve cari hareketler'],
              ['Hizmet / platform bedeli', 'Pazaryerinin tanımladığı dönemsel veya işlem bazlı bedeller', 'Pazaryerinin size kestiği faturalar'],
              ['İade ve iptal', 'İade onaylandığında veya sipariş iptal edildiğinde', 'İade kayıtları ve cari hareketler'],
              ['Kampanya katkısı', 'Katıldığınız kampanyanın koşullarına göre', 'Kampanya sözleşmesi ve cari hareketler'],
            ],
          },
        ],
      },
      {
        id: 'takvim',
        title: 'Ödeme takvimi',
        blocks: [
          {
            type: 'p',
            text: 'Her pazaryeri ödeme günlerini ve vadeyi kendi satıcı sözleşmesinde belirler; bazıları ek ücret karşılığında erken ödeme seçeneği sunar. Bu bilgiler dönemsel olarak değiştiği ve incelediğimiz kaynaklarda resmi olarak doğrulanamadığı için burada gün veya vade vermiyoruz.',
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Güncel takvim nerede?',
            text: 'Ödeme günleri ve vade için satıcı panelinizdeki finans veya cari hesap bölümünü ve güncel satıcı sözleşmenizi esas alın.',
          },
        ],
      },
      {
        id: 'mutabakat',
        title: 'Hakediş mutabakatı adım adım',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Dönemi belirleyin', text: 'Ödeme dönemine giren siparişleri, iade ve iptalleri tek listede toplayın.' },
              { name: 'Beklenen tutarı hesaplayın', text: 'Her sipariş için satış tutarından komisyon ve diğer kalemleri düşerek beklenen hakedişi hesaplayın.' },
              { name: 'Pazaryeri kaydıyla karşılaştırın', text: 'Beklenen tutarı satıcı panelindeki cari hareketler ve ödeme kaydıyla sipariş bazında karşılaştırın.' },
              { name: 'Farkları itiraz edin', text: 'Açıklanamayan farkları sipariş numarasıyla listeleyip pazaryerinin satıcı desteğine iletin.' },
              { name: 'Muhasebeye aktarın', text: 'Onaylanan tutarları ve pazaryerinin kestiği faturaları muhasebe kaydınızla eşleştirin.' },
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'odeme-gunu-degisir',
        question: 'Ödeme günleri değişir mi?',
        answer: 'Evet. Pazaryerleri ödeme takvimini ve vadeyi sözleşmeyle belirler ve güncelleyebilir; güncel bilgi satıcı panelindedir.',
      },
      {
        id: 'eksik-odeme',
        question: 'Hakedişim beklediğimden düşükse ne yapmalıyım?',
        answer:
          'Dönemin siparişlerini, iadelerini ve kesinti kalemlerini sipariş bazında karşılaştırın. Açıklanamayan farkı sipariş numarasıyla pazaryerinin satıcı desteğine iletin.',
      },
      {
        id: 'komisyon-nerede',
        question: 'Komisyon oranını nerede görürüm?',
        answer: 'Satıcı panelinizdeki komisyon tablosunda ve güncel satıcı sözleşmenizde. Oranlar kategori bazlıdır ve değişebilir.',
      },
    ],
    sources: ['S30', 'S36'],
    related: ['e-fatura/pazaryeri-siparislerinde-fatura-akisi', 'pazaryerleri/trendyol-satici-olma', 'kargo/iade-kargo'],
    cta: 'finance',
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R30
  {
    slug: 'pazar-verisi/turkiye-eticaret-2025',
    kbId: 'R30',
    cluster: 'pazaryerleri',
    title: 'Türkiye e-ticaret pazarı 2025',
    seoTitle: 'Türkiye e-ticaret pazarı 2025',
    description:
      "Ticaret Bakanlığı'nın Türkiye'de E-Ticaretin Görünümü raporuna göre e-ticaret hacmi, büyüme, işlem ve işletme sayısı ile ödeme yöntemleri.",
    summary: 'Resmi rapora göre hacim, büyüme, işletme sayısı ve ödeme yöntemleri.',
    answer:
      "Ticaret Bakanlığı'nın 12 Mayıs 2026'da duyurduğu Türkiye'de E-Ticaretin Görünümü raporuna göre Türkiye'de e-ticaret hacmi 2025'te bir önceki yıla göre %52,2 artarak 4,57 trilyon TL'ye ulaştı. Aynı yıl 5,94 milyar işlem gerçekleşti ve 634.611 işletme e-ticaret yaptı. E-ticaretin GSYH içindeki payı %6,9, toplam ticaret içindeki payı %19,3 oldu.",
    keyPoints: [
      'E-ticaret hacmi: 4,57 trilyon TL (dolar bazında 115,43 milyar ABD doları, %28,9 artış).',
      'Perakende e-ticaret: 2,46 trilyon TL (%51,8 artış).',
      'Kartla ödeme payı %62,5; havale/EFT %29,2; kapıda ödeme %3,5.',
      'Rapor duyurusunda pazaryerlerinin payına ilişkin bir veri yer almıyor.',
    ],
    sections: [
      {
        id: 'hacim',
        title: 'Hacim ve büyüme',
        blocks: [
          {
            type: 'table',
            caption: 'Türkiye e-ticaret göstergeleri, 2025 (Ticaret Bakanlığı)',
            head: ['Gösterge', '2025 değeri', 'Yıllık değişim'],
            rows: [
              ['E-ticaret hacmi (TL)', '4,57 trilyon TL', '%52,2 artış'],
              ['E-ticaret hacmi (ABD doları)', '115,43 milyar ABD doları', '%28,9 artış'],
              ['Perakende e-ticaret hacmi', '2,46 trilyon TL', '%51,8 artış'],
              ['İşlem sayısı', '5,94 milyar', '—'],
              ['GSYH içindeki pay', '%6,9', '—'],
              ['Toplam ticaret içindeki pay', '%19,3', '—'],
            ],
          },
        ],
      },
      {
        id: 'isletmeler',
        title: 'E-ticaret yapan işletmeler',
        blocks: [
          {
            type: 'p',
            text: "2025'te e-ticaret yapan aktif işletme sayısı 634.611 oldu. Bu işletmelerin %75'i şahıs işletmesi, %21'i limited şirket, %4'ü anonim şirkettir. Başka bir deyişle, e-ticaret yapan her dört işletmeden üçü şahıs işletmesidir.",
          },
        ],
      },
      {
        id: 'odeme',
        title: 'Ödeme yöntemleri',
        blocks: [
          {
            type: 'table',
            caption: 'Ödeme yöntemlerinin payı, 2025',
            head: ['Ödeme yöntemi', 'Pay'],
            rows: [
              ['Kartlı ödeme', '%62,5 (kartlı ödemelerde 3D Secure kullanımı %64,1)'],
              ['Havale / EFT', '%29,2'],
              ['Kapıda ödeme', '%3,5'],
            ],
          },
        ],
      },
      {
        id: 'hizli-ticaret',
        title: 'Hızlı ticaret ve C2C',
        blocks: [
          {
            type: 'p',
            text: "Raporda hızlı ticaret (q-commerce) hacmi 388,7 milyar TL olarak yer alıyor; bu, toplam e-ticaretin %8,5'ine karşılık geliyor. Tüketiciden tüketiciye (C2C) e-ticaret hacmi ise 21,8 milyar TL.",
          },
        ],
      },
      {
        id: 'pazaryeri-payi',
        title: 'Pazaryerlerinin payı hakkında',
        blocks: [
          {
            type: 'callout',
            tone: 'info',
            title: 'Raporda yok',
            text: 'Bakanlığın rapor duyurusunda pazaryerlerinin toplam e-ticaret içindeki payına ilişkin bir veri yer almıyor ve bu konuda güvenilir, resmi bir kaynak bulamadık. Bu nedenle pazaryeri payı için bir oran vermiyoruz.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'hacim',
        question: "Türkiye'de e-ticaret hacmi ne kadar?",
        answer: "Ticaret Bakanlığı verilerine göre 2025'te 4,57 trilyon TL; bir önceki yıla göre %52,2 artış.",
      },
      {
        id: 'isletme',
        question: 'Kaç işletme e-ticaret yapıyor?',
        answer: "2025'te 634.611 aktif işletme; bunların %75'i şahıs işletmesi.",
      },
      {
        id: 'kaynak',
        question: 'Bu verilerin kaynağı nedir?',
        answer:
          "Ticaret Bakanlığı'nın Türkiye'de E-Ticaretin Görünümü raporu. Rapor yıllık yayımlanır; bu sayfa yeni rapor çıktığında güncellenir.",
      },
    ],
    sources: ['S1', 'S2', 'S3', 'S4'],
    related: ['karsilastirma/tek-stokla-cok-kanal-yonetimi', 'pazaryerleri/trendyol-satici-olma', 'e-fatura/eticarette-e-fatura-zorunlulugu'],
    cta: 'channels',
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-05-31',
  },
]

/**
 * Rehber — "Mevzuat ve vergi" kümesi (KB §5, §7; sayfalar R14, R15, R22, R20, R21).
 * Kesin ifade yalnızca resmi kaynağa ya da tutarlı iki ikincil kaynağa dayanır (src/data/kb/facts.ts).
 * DOĞRULANAMADI alanlar (e-Arşiv sınır tutarı, eşik yılı, saklama/düzenleme süresi, cayma istisna listesi,
 * pazaryeri fatura yükleme kuralları) yazılmaz; okuru resmi metne yönlendiren cümle kullanılır.
 */
import type { Guide } from '../types'

const D = '2026-09-30'

export const mevzuatGuides: Guide[] = [
  // ------------------------------------------------------------------------------------------ R14
  {
    slug: 'e-fatura/eticarette-e-fatura-zorunlulugu',
    kbId: 'R14',
    cluster: 'mevzuat',
    title: 'E-ticarette e-Fatura zorunluluğu: kimler, ne zaman geçer?',
    seoTitle: 'E-ticarette e-Fatura zorunluluğu',
    description:
      'İnternetten satış yapan işletmeler için e-Fatura geçiş eşikleri, dayanağı, geçiş takvimi ve pazaryeri satıcısının kontrol listesi.',
    summary: 'Geçiş eşikleri, dayanağı ve pazaryeri satıcısı için kontrol listesi.',
    answer:
      "E-Fatura'ya geçiş zorunluluğu, 509 Sıra No'lu VUK Genel Tebliği'nin IV.1.4 bölümünde brüt satış hasılatına bağlanır. Bu rehberin güncellendiği tarihte birbirinden bağımsız ikincil kaynaklar, genel eşiği 3 milyon TL, internet ortamında satış yapanlar için eşiği 500 bin TL olarak aktarmaktadır; eşiği aşan mükellef izleyen yılın 1 Temmuz'una kadar geçiş yapar. Eşikler değişebildiği için bağlayıcı olan, Gelir İdaresi Başkanlığı'ndaki güncel tebliğ metnidir.",
    keyPoints: [
      'Zorunluluk, bir önceki hesap dönemindeki brüt satış hasılatına bakılarak belirlenir.',
      'İnternet ortamında satış yapanlar için ayrı ve daha düşük bir eşik vardır.',
      'e-Arşiv için verilen sınır tutarları kaynaklarda çelişkili olduğundan burada tutar verilmez.',
      'Geçiş kararını mali müşavirinizle, tebliğin güncel metni üzerinden verin.',
    ],
    sections: [
      {
        id: 'belgeler',
        title: 'e-Fatura, e-Arşiv ve e-İrsaliye: hangisi ne?',
        blocks: [
          {
            type: 'p',
            text: 'Üç belge de Gelir İdaresi Başkanlığı (GİB) düzenlemesine tabidir ve kâğıt belgenin elektronik karşılığıdır. Aralarındaki fark, belgenin kime düzenlendiği ve neyi belgelediğidir.',
          },
          {
            type: 'table',
            caption: 'Elektronik belge türleri',
            head: ['Belge', 'Kime / ne için', 'Pazaryeri satıcısı için anlamı'],
            rows: [
              ['e-Fatura', 'Sisteme kayıtlı mükellefler arasında düzenlenen fatura', 'Kurumsal alıcıya (e-Fatura mükellefine) satışta kullanılır'],
              ['e-Arşiv', 'e-Fatura mükellefi olmayanlara, tüketiciler dahil, düzenlenen elektronik fatura', 'Bireysel müşteriye yapılan satışların çoğu bu belgeyle faturalanır'],
              ['e-İrsaliye', 'Malın sevkini belgeleyen elektronik sevk irsaliyesi', 'Yalnızca kapsama giren mükellefler için zorunludur; ayrıntı [e-İrsaliye kapsamı](#e-irsaliye) bölümünde'],
            ],
          },
        ],
      },
      {
        id: 'kimler-zorunlu',
        title: 'Kimler e-Fatura kullanmak zorunda?',
        blocks: [
          {
            type: 'p',
            text: "Zorunluluğun dayanağı 509 Sıra No'lu Vergi Usul Kanunu Genel Tebliği'dir; geçiş koşulları tebliğin IV.1.4 bölümünde brüt satış hasılatı eşikleriyle tanımlanır. Bu rehberin güncellendiği tarihte ikincil kaynaklarda tutarlı olarak aktarılan eşikler şunlardır:",
          },
          {
            type: 'ul',
            items: [
              '**Genel eşik:** brüt satış hasılatı 3 milyon TL ve üzeri olan mükellefler.',
              '**İnternet ortamında satış:** mal veya hizmetini internet üzerinden satan ve brüt satış hasılatı 500 bin TL ve üzeri olan mükellefler.',
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Değişebilir bilgi',
            text: 'Eşik tutarları dönem dönem güncellenir ve ikincil kaynaklar eşiklerin hangi yıldan itibaren uygulandığını farklı ifade eder. Bu yüzden yıl bilgisi burada verilmez; kendi durumunuz için GİB’deki güncel tebliğ metnini esas alın.',
          },
          {
            type: 'p',
            text: 'Pazaryeri üzerinden yapılan satışların hangi hasılat kalemine dahil edileceği işletmenizin yapısına göre değişebilir. Bu değerlendirmeyi mali müşavirinizle, tebliğ metni üzerinden yapın.',
          },
        ],
      },
      {
        id: 'takvim',
        title: 'Geçiş takvimi nasıl işler?',
        blocks: [
          {
            type: 'p',
            text: "Eşik bir hesap döneminin hasılatına göre değerlendirilir. İkincil kaynaklara göre eşiği aşan mükellef, ilgili yılı izleyen yılın 1 Temmuz'una kadar e-Fatura uygulamasına geçer. Aşağıdaki sıra, geçişi hazırlarken izlenen genel adımlardır:",
          },
          {
            type: 'steps',
            items: [
              { name: 'Hasılatı izleyin', text: 'Önceki hesap döneminin brüt satış hasılatını, internet satışları dahil olmak üzere mali müşavirinizle birlikte hesaplayın.' },
              { name: 'Eşiği karşılaştırın', text: 'Tutarı GİB’deki güncel tebliğ metnindeki eşiklerle karşılaştırın; internet satışı eşiğinin sizin için geçerli olup olmadığını netleştirin.' },
              { name: 'Kullanım yöntemini seçin', text: 'GİB’in sunduğu kullanım yöntemlerinden işletmenize uyanı seçin; hacminiz yüksekse özel entegratör hizmetini değerlendirin.' },
              { name: 'Başvurun ve test edin', text: 'Başvurunuzu yapın, ilk belgelerinizi test ederek düzenleyin ve arşivleme düzeninizi kurun.' },
              { name: 'Satış kanallarınızı güncelleyin', text: 'Pazaryeri panellerinizde ve kendi sitenizde fatura bilgilerinizi, yeni belge türüne göre güncelleyin.' },
            ],
          },
        ],
      },
      {
        id: 'e-arsiv',
        title: 'e-Arşiv tarafında dikkat edilecekler',
        blocks: [
          {
            type: 'p',
            text: 'e-Arşiv, e-Fatura mükellefi olmayan alıcılara düzenlenen elektronik faturadır; pazaryerinde bireysel müşteriye yapılan satışların büyük kısmı bu belgeyle faturalanır.',
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Neden tutar yazmıyoruz?',
            text: 'e-Arşiv düzenleme sınırına ilişkin tutarlar ve bu sınırın kaldırılıp kaldırılmadığı konusunda incelediğimiz kaynaklar birbiriyle çelişiyor. Doğrulanamayan bir tutarı yayımlamak yerine GİB duyurularını ve güncel tebliğ metnini kontrol etmenizi öneriyoruz.',
          },
        ],
      },
      {
        id: 'e-irsaliye',
        title: 'e-İrsaliye kapsamı',
        blocks: [
          {
            type: 'p',
            text: "GİB e-Belge sayfasına göre e-İrsaliye, 509 Sıra No'lu Tebliğ ile belirli sektörler ve büyüklükteki mükellefler için zorunludur. Kapsam; hal kayıt sistemine bildirimde bulunan tüccarları, belirli EPDK lisanslı mükellefleri ve ÖTV listesindeki mallarla ilgili belirli mükellefleri, maden, şeker, demir-çelik ve gübre takip sistemi kullanıcılarını ve önceki dönem brüt satış hasılatı 25 milyon TL ve üzeri olan e-Fatura mükelleflerini içerir.",
          },
          {
            type: 'p',
            text: 'Pazaryeri satıcılarının çoğu bu gruplara girmez; kapsama giriyorsanız sevkiyat öncesinde e-İrsaliye düzenlemeniz gerekir.',
          },
        ],
      },
      {
        id: 'kontrol-listesi',
        title: 'Pazaryeri satıcısı için kontrol listesi',
        blocks: [
          {
            type: 'ul',
            items: [
              'Önceki dönem hasılatınızı internet satışlarıyla birlikte hesaplayın.',
              'Satış yaptığınız her pazaryerinin satıcı panelinde istenen fatura bilgilerini ve belge türünü kontrol edin.',
              'Kurumsal alıcı ile bireysel alıcı ayrımını fatura sürecinize yansıtın (e-Fatura ya da e-Arşiv).',
              'Fatura bağlantısının veya PDF’inin siparişe eklenme adımını ekibinizle netleştirin; ayrıntı için [pazaryeri siparişlerinde fatura akışı](/rehber/e-fatura/pazaryeri-siparislerinde-fatura-akisi).',
              'Eşik ve yöntem değişikliklerini izlemek için GİB duyurularını takip edin.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'esik-anlami',
        question: 'İnternet satışı için verilen 500 bin TL eşiği ne anlama gelir?',
        answer:
          'İkincil kaynaklara göre mal veya hizmetini internet ortamında satan ve brüt satış hasılatı bu tutarı aşan mükellefler e-Fatura’ya geçmek zorundadır. Eşik değişebildiği için güncel tutarı GİB’deki tebliğ metninden kontrol edin.',
      },
      {
        id: 'ne-zaman',
        question: 'Eşiği aştım, ne zamana kadar geçmem gerekir?',
        answer:
          "İkincil kaynaklar, eşiğin aşıldığı yılı izleyen yılın 1 Temmuz'una kadar geçiş yapılması gerektiğini aktarır. Kesin tarihi tebliğin güncel metninden ve mali müşavirinizden teyit edin.",
      },
      {
        id: 'pazaryeri-sarti',
        question: 'Pazaryerinde satış yapmak için e-Fatura mükellefi olmak gerekir mi?',
        answer:
          'Yasal zorunluluk hasılat eşiğine bağlıdır. Pazaryerleri ise satıcı başvurusunda kendi fatura koşullarını belirleyebilir; başvuru yaptığınız pazaryerinin satıcı sayfasındaki güncel koşullara bakın.',
      },
      {
        id: 'entegrasyonik-fatura',
        question: 'Entegrasyonik e-Fatura düzenler mi?',
        answer:
          'Hayır. Entegrasyonik bugün fatura düzenlemez ve bir özel entegratörle doğrudan bağlantısı yoktur. Başka bir sistemde düzenlediğiniz faturanın bağlantısını, bu bildirimi destekleyen pazaryerlerine siparişle birlikte iletebilir.',
      },
    ],
    sources: ['S5', 'S6', 'S7', 'S8'],
    related: ['e-fatura/pazaryeri-siparislerinde-fatura-akisi', 'pazaryerleri/trendyol-satici-olma', 'mevzuat/kvkk-e-ticaret-saticilar'],
    cta: 'invoice',
    legal: true,
    volatile: true,
    howTo: false,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R15
  {
    slug: 'e-fatura/pazaryeri-siparislerinde-fatura-akisi',
    kbId: 'R15',
    cluster: 'mevzuat',
    title: 'Pazaryeri siparişlerinde fatura akışı',
    seoTitle: 'Pazaryeri siparişlerinde fatura akışı',
    description:
      'Pazaryerinden gelen siparişte faturanın düzenlenmesinden alıcıya ulaşmasına kadar adımlar, belge türü seçimi ve iade/iptal durumları.',
    summary: 'Siparişten faturanın alıcıya ulaşmasına kadar adımlar.',
    answer:
      'Pazaryeri siparişinde satış faturasını satıcı düzenler: sipariş gelir, alıcının durumuna göre e-Fatura ya da e-Arşiv düzenlenir, faturanın bağlantısı veya PDF’i siparişe eklenerek pazaryerine iletilir ve alıcı faturayı sipariş ekranında görür. Faturanın ne zamana kadar ve hangi biçimde yükleneceği pazaryerinden pazaryerine değişir; bu kural satıcı sözleşmenizde ve panelinizde yer alır.',
    keyPoints: [
      'Satış faturası satıcıya aittir; pazaryerinin size kestiği hizmet ve komisyon faturası ayrı bir belgedir.',
      'Belge türünü alıcı belirler: kurumsal alıcıya e-Fatura, bireysel alıcıya genellikle e-Arşiv.',
      'Yükleme süresi ve biçimi pazaryerine özgüdür; sözleşmenizi esas alın.',
    ],
    sections: [
      {
        id: 'akis',
        title: 'Genel akış',
        blocks: [
          {
            type: 'flow',
            caption: 'Pazaryeri siparişinde faturanın yolu',
            items: ['Sipariş gelir', 'Belge türü seçilir', 'Fatura düzenlenir', 'Bağlantı/PDF siparişe eklenir', 'Alıcı faturayı görür'],
          },
          {
            type: 'p',
            text: 'Akışın her adımı kavramsaldır ve tüm pazaryerlerinde aynı mantıkla işler. Farklılık; faturanın yüklenme süresinde, kabul edilen biçimde (bağlantı veya dosya) ve eksik faturada uygulanan kurallarda ortaya çıkar. Bu ayrıntılar her pazaryerinin satıcı sözleşmesinde tanımlanır; incelediğimiz kaynaklarda resmi olarak doğrulanamadığı için burada pazaryeri bazında süre verilmez.',
          },
        ],
      },
      {
        id: 'belge-turu',
        title: 'Belge türü nasıl seçilir?',
        blocks: [
          {
            type: 'table',
            caption: 'Alıcıya göre belge türü',
            head: ['Alıcı', 'Genellikle düzenlenen belge', 'Not'],
            rows: [
              ['e-Fatura mükellefi işletme', 'e-Fatura', 'Alıcının vergi bilgileri siparişte eksiksiz olmalıdır'],
              ['Bireysel müşteri veya e-Fatura mükellefi olmayan işletme', 'e-Arşiv', 'Sizin e-Fatura/e-Arşiv kullanıcısı olmanıza bağlıdır'],
            ],
          },
          {
            type: 'p',
            text: 'Hangi belgeyi düzenleyebileceğiniz kendi mükellefiyet durumunuza da bağlıdır. Zorunluluk eşikleri için [e-ticarette e-Fatura zorunluluğu](/rehber/e-fatura/eticarette-e-fatura-zorunlulugu) rehberine bakın.',
          },
        ],
      },
      {
        id: 'kim-adina',
        title: 'Fatura kimin adına düzenlenir?',
        blocks: [
          {
            type: 'p',
            text: 'Pazaryeri modelinde ürünü satan sizseniz, satış faturasını alıcı adına siz düzenlersiniz. Pazaryeri ise size sağladığı hizmetler (komisyon, kargo, hizmet bedeli gibi kalemler) için ayrı bir fatura keser; bu faturalar [hakediş mutabakatı](/rehber/pazaryerleri/hakedis-ve-odeme-dongusu) sırasında satış kayıtlarınızla karşılaştırılır.',
          },
        ],
      },
      {
        id: 'iade-iptal',
        title: 'İade ve iptal durumları',
        blocks: [
          {
            type: 'p',
            text: 'Sipariş faturalandıktan sonra iptal edilir ya da iade gelirse, düzeltme için hangi belgenin düzenleneceği (iade faturası veya iptal işlemi) alıcının ve sizin mükellefiyet durumunuza göre değişir. Bu adımı muhasebe düzeninizle birlikte mali müşavirinizle belirleyin; iade sürecinin tüketici hakları tarafı için [cayma hakkı](/rehber/mevzuat/cayma-hakki-14-gun) rehberine bakın.',
          },
          {
            type: 'ul',
            items: [
              'İade onaylandığında stoğun satılabilir stoğa dönüp dönmeyeceğini ürün durumuna göre belirleyin.',
              'Düzeltme belgesini, ilgili siparişle eşleşecek şekilde kayıt altına alın.',
              'Pazaryeri panelindeki iade kaydı ile muhasebe kaydını dönemsel olarak karşılaştırın.',
            ],
          },
        ],
      },
      {
        id: 'operasyon',
        title: 'Operasyonu hızlandırmak için',
        blocks: [
          {
            type: 'ul',
            items: [
              'Faturayı, siparişin kargoya verilmesiyle aynı iş adımına bağlayın; ayrı adım unutulmaya açıktır.',
              'Birden fazla pazaryerinde satıyorsanız siparişleri tek listede toplayın; faturası eksik siparişleri tek yerden görün.',
              'Fatura numarası ile sipariş numarasını aynı kayıtta tutun; mutabakat kolaylaşır.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'yukleme-suresi',
        question: 'Faturayı pazaryerine ne kadar sürede yüklemeliyim?',
        answer:
          'Süre ve biçim her pazaryerinin satıcı sözleşmesinde belirlenir ve değişebilir. Güncel kuralı satıcı panelinizden ve sözleşmenizden kontrol edin.',
      },
      {
        id: 'fatura-kimde',
        question: 'Pazaryeri siparişinde faturayı kim keser?',
        answer:
          'Ürünü satan satıcı, satış faturasını alıcı adına düzenler. Pazaryerinin size kestiği komisyon ve hizmet faturası ayrı bir belgedir.',
      },
      {
        id: 'entegrasyonik-fatura-bildirimi',
        question: 'Entegrasyonik faturayı pazaryerine iletebilir mi?',
        answer:
          'Entegrasyonik fatura düzenlemez. Başka bir sistemde düzenlenmiş faturanın bağlantısını, bu bildirimi destekleyen pazaryerlerine siparişle birlikte iletebilir; kanal bazında kapsam entegrasyon sayfalarında yazılıdır.',
      },
    ],
    sources: ['S6', 'S7', 'S30', 'S36'],
    related: ['e-fatura/eticarette-e-fatura-zorunlulugu', 'pazaryerleri/hakedis-ve-odeme-dongusu', 'mevzuat/cayma-hakki-14-gun'],
    cta: 'invoice',
    legal: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R22
  {
    slug: 'mevzuat/cayma-hakki-14-gun',
    kbId: 'R22',
    cluster: 'mevzuat',
    title: 'Cayma hakkı ve 14 gün kuralı',
    seoTitle: 'Cayma hakkı ve 14 gün kuralı',
    description:
      'Mesafeli satışta tüketicinin cayma hakkı, ön bilgilendirme eksik olduğunda sürenin uzaması ve satıcının iade sürecinde yapması gerekenler.',
    summary: 'Cayma süresi, ön bilgilendirme ve satıcının yükümlülükleri.',
    answer:
      "6502 sayılı Tüketicinin Korunması Hakkında Kanun'a göre tüketici, mesafeli sözleşmeden 14 gün içinde herhangi bir gerekçe göstermeden ve cezai şart ödemeden cayabilir. Satıcı cayma hakkına ilişkin ön bilgilendirmeyi yapmamışsa tüketici 14 günlük süreyle bağlı değildir; bu süre en fazla 1 yıl uzayabilir. Ticaret Bakanlığı, internet alışverişlerinde cayma hakkının kaldırıldığına dair haberleri yalanlamıştır.",
    keyPoints: [
      'Cayma süresi 14 gündür; gerekçe ve cezai şart aranmaz.',
      'Ön bilgilendirme eksikse süre en fazla 1 yıl uzayabilir.',
      'Cayma hakkının kullanılamayacağı istisnalar yönetmelikte sayılır; listeyi resmi metinden kontrol edin.',
    ],
    sections: [
      {
        id: 'nedir',
        title: 'Cayma hakkı nedir?',
        blocks: [
          {
            type: 'p',
            text: 'Cayma hakkı, internet gibi uzaktan iletişim araçlarıyla kurulan (mesafeli) sözleşmelerde tüketiciye tanınan, sözleşmeden tek taraflı dönebilme hakkıdır. Dayanağı 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği’dir. Tüketici bu hakkı kullanırken gerekçe göstermek ya da cezai şart ödemek zorunda değildir.',
          },
        ],
      },
      {
        id: 'sure',
        title: '14 günlük süre ve ön bilgilendirme',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Süre:** tüketici 14 gün içinde cayma hakkını kullanabilir.',
              '**Ön bilgilendirme yoksa:** satıcı cayma hakkı konusunda tüketiciyi bilgilendirmemişse tüketici 14 günlük süreyle bağlı değildir; süre en fazla 1 yıl uzayabilir.',
              '**Ön bilgi içeriği:** Mesafeli Sözleşmeler Yönetmeliği’nde yapılan değişiklikle, 1 Ocak 2026’dan itibaren ön bilgide cayma hakkı ve iade için kullanılacak taşıyıcı bilgisi de yer alır. Ayrıntı [iade kargo](/rehber/kargo/iade-kargo) rehberinde.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Sürenin başlangıcı ve istisnalar',
            text: 'Sürenin hangi andan itibaren başladığı ve cayma hakkının kullanılamayacağı ürün/hizmet istisnaları yönetmelikte ayrıca düzenlenir. Bu ayrıntıları resmi metinden okuyamadığımız için burada sıralamıyoruz; Ticaret Bakanlığı’nın mesafeli sözleşmeler bilgilendirmesine bakın.',
          },
        ],
      },
      {
        id: 'kaldirildi-mi',
        title: 'Cayma hakkı kaldırıldı mı?',
        blocks: [
          {
            type: 'p',
            text: 'Hayır. Ticaret Bakanlığı, internet alışverişlerinde cayma hakkının kaldırıldığını öne süren haberleri yalanlayan bir açıklama yayımlamıştır. Güncel durum için Bakanlığın duyurularını izleyin.',
          },
        ],
      },
      {
        id: 'satici',
        title: 'Satıcı olarak ne yapmalısınız?',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Ön bilgilendirmeyi eksiksiz verin', text: 'Cayma hakkı, iade yolu ve taşıyıcı bilgisini sipariş öncesinde tüketiciye açıkça gösterin; pazaryerinde satıyorsanız mağaza bilgilerinizin güncel olduğundan emin olun.' },
              { name: 'İade talebini zamanında işleyin', text: 'Gelen talebi kayıt altına alın, ürünü teslim aldığınızda durumunu kontrol edin ve talebi onaylayın ya da gerekçesiyle yanıtlayın.' },
              { name: 'Stoğu ve kaydı düzeltin', text: 'Satılabilir durumdaki ürünü stoğa geri alın; düzeltme belgesini siparişle eşleştirerek muhasebe kaydını güncelleyin.' },
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'on-bilgi-yok',
        question: 'Ön bilgi verilmezse cayma süresi uzar mı?',
        answer:
          'Evet. Cayma hakkı konusunda ön bilgilendirme yapılmamışsa tüketici 14 günlük süreyle bağlı değildir; süre en fazla 1 yıl uzayabilir.',
      },
      {
        id: 'gerekce',
        question: 'Tüketici cayarken gerekçe göstermek zorunda mı?',
        answer: 'Hayır. Tüketici cayma hakkını gerekçe göstermeden ve cezai şart ödemeden kullanabilir.',
      },
      {
        id: 'istisna',
        question: 'Her üründe cayma hakkı var mı?',
        answer:
          'Hayır, yönetmelik bazı ürün ve hizmetleri cayma hakkının dışında tutar. İstisna listesini Mesafeli Sözleşmeler Yönetmeliği’nin güncel metninden kontrol edin.',
      },
    ],
    sources: ['S13', 'S14', 'S15', 'S18', 'S16'],
    related: ['kargo/iade-kargo', 'e-fatura/pazaryeri-siparislerinde-fatura-akisi', 'mevzuat/kvkk-e-ticaret-saticilar'],
    cta: 'returns',
    legal: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R20
  {
    slug: 'kargo/iade-kargo',
    kbId: 'R20',
    cluster: 'mevzuat',
    title: 'İade kargo ücretini kim öder? Yönetmelikteki değişiklik',
    seoTitle: 'İade kargo ücretini kim öder?',
    description:
      'Mesafeli Sözleşmeler Yönetmeliği değişikliğiyle iade kargo gideri, ön bilgilendirmeye eklenen taşıyıcı bilgisi ve satıcının hazırlık listesi.',
    summary: 'Yönetmelik değişikliği ve satıcının hazırlık listesi.',
    answer:
      "Resmî Gazete'nin 24 Mayıs 2025 tarihli ve 32909 sayılı nüshasında yayımlanan ve 1 Ocak 2026'da yürürlüğe giren Mesafeli Sözleşmeler Yönetmeliği değişikliğine göre, tüketici ürünü satıcının ön bilgilendirmede belirttiği taşıyıcıyla iade ederse iade kargo gideri tüketiciye yüklenemez. Değişiklik, cayma hakkı ve iade taşıyıcısı bilgisinin ön bilgilendirmede yer almasını da öngörür.",
    keyPoints: [
      'Satıcının belirttiği taşıyıcıyla yapılan iadede kargo gideri tüketiciye yüklenmez.',
      'Ön bilgilendirmede cayma hakkı ve iade taşıyıcısı bilgisi yer alır.',
      'Tüketiciye uyuşmazlık çözüm yolları hakkında bilgi verilir.',
    ],
    sections: [
      {
        id: 'ne-degisti',
        title: 'Ne değişti?',
        blocks: [
          {
            type: 'table',
            caption: 'Mesafeli Sözleşmeler Yönetmeliği değişikliğinin özeti',
            head: ['Konu', 'Değişiklik'],
            rows: [
              ['Yayım', 'Resmî Gazete, 24 Mayıs 2025, sayı 32909'],
              ['Yürürlük', '1 Ocak 2026'],
              ['İade kargo gideri', 'Tüketici ürünü satıcının belirttiği taşıyıcıyla iade ederse gider tüketiciye yüklenemez'],
              ['Ön bilgilendirme', 'Cayma hakkı bilgisi ve iade için kullanılacak taşıyıcı bilgisi yer alır'],
              ['Uyuşmazlık', 'Tüketiciye başvurabileceği uyuşmazlık çözüm yolları hakkında bilgi verilir'],
            ],
          },
          {
            type: 'callout',
            tone: 'caution',
            title: 'Kaynak notu',
            text: 'Bu özet, değişikliği aynı biçimde aktaran iki bağımsız yayına dayanır. Uygulamaya geçmeden önce Yönetmeliğin Resmî Gazete’deki metnini okuyun ya da bir hukukçuya danışın.',
          },
        ],
      },
      {
        id: 'saticiya-etkisi',
        title: 'Satıcıya etkisi',
        blocks: [
          {
            type: 'p',
            text: 'İade kargo gideri, tüketici sizin belirttiğiniz taşıyıcıyı kullandığında satıcı tarafında kalır. Bu nedenle iade oranının yüksek olduğu kategorilerde iade maliyetini fiyatlandırma ve kârlılık hesabınıza dahil etmeniz gerekir. Pazaryerinde satıyorsanız iade taşıyıcısı ve iade kodu çoğunlukla pazaryerinin anlaşmalı kargo düzeninden gelir; kendi mağazanızda ise taşıyıcıyı siz belirlersiniz.',
          },
        ],
      },
      {
        id: 'hazirlik',
        title: 'Hazırlık listesi',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Ön bilgi metnini güncelleyin', text: 'Kendi sitenizdeki ön bilgilendirme formuna cayma hakkını, iade taşıyıcısını ve uyuşmazlık çözüm yollarını ekleyin.' },
              { name: 'İade taşıyıcısını netleştirin', text: 'Her satış kanalında iade için hangi taşıyıcının kullanılacağını belirleyin ve müşteriye tek, açık bir yol gösterin.' },
              { name: 'Maliyeti ölçün', text: 'Kategori bazında iade oranınızı ve iade kargo maliyetinizi izleyin; fiyat kurallarınızı buna göre gözden geçirin.' },
              { name: 'Stok dönüşünü tanımlayın', text: 'İade edilen ürünün hangi kontrolden sonra satılabilir stoğa döneceğini yazılı bir kurala bağlayın.' },
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'kim-oder',
        question: 'İade kargo ücretini kim öder?',
        answer:
          'Yönetmelik değişikliğine göre tüketici ürünü satıcının belirttiği taşıyıcıyla iade ederse iade kargo gideri tüketiciye yüklenemez. Değişiklik 1 Ocak 2026’da yürürlüğe girmiştir.',
      },
      {
        id: 'baska-kargo',
        question: 'Tüketici başka bir kargo firmasıyla gönderirse ne olur?',
        answer:
          'Bu durumun nasıl değerlendirileceği yönetmeliğin ayrıntısına bağlıdır. Yönetmeliğin güncel metnini okuyun ya da bir hukukçuya danışın.',
      },
      {
        id: 'pazaryeri-iade',
        question: 'Pazaryerinde iade süreci nasıl yönetilir?',
        answer:
          'İade talepleri pazaryerinin satıcı panelinde veya entegrasyon üzerinden gelir. İade kodu ve taşıyıcı çoğunlukla pazaryerinin anlaşmalı kargo düzeninden sağlanır; güncel kuralları satıcı panelinizden kontrol edin.',
      },
    ],
    sources: ['S16', 'S17', 'S15', 'S14'],
    related: ['mevzuat/cayma-hakki-14-gun', 'karsilastirma/tek-stokla-cok-kanal-yonetimi', 'pazaryerleri/hakedis-ve-odeme-dongusu'],
    cta: 'returns',
    legal: true,
    volatile: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },

  // ------------------------------------------------------------------------------------------ R21
  {
    slug: 'mevzuat/kvkk-e-ticaret-saticilar',
    kbId: 'R21',
    cluster: 'mevzuat',
    title: 'KVKK ve e-ticaret satıcısının sorumlulukları',
    seoTitle: 'KVKK ve e-ticaret satıcısı',
    description:
      'Alıcı verisinde veri sorumlusu ve veri işleyen rolleri, VERBİS kayıt istisnası kriterleri, kayıt süresi ve entegrasyon yazılımı seçerken sorulacaklar.',
    summary: 'Veri sorumlusu ve işleyen rolleri, VERBİS kriterleri.',
    answer:
      "E-ticaret satıcısı, siparişlerden gelen alıcı verisini kendi işi için işlediğinde 6698 sayılı KVKK kapsamında veri sorumlusudur; bu veriyi satıcı adına işleyen yazılım sağlayıcıları veri işleyen konumundadır. KVKK Kurulu'nun 2025/1572 sayılı kararına göre çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'den az olan, ana faaliyeti özel nitelikli kişisel veri işlemek olmayan veri sorumluları VERBİS'e kayıt yükümlülüğünden istisnadır.",
    keyPoints: [
      'Alıcı verisinden satıcı sorumludur; yazılım sağlayıcı satıcı adına işler.',
      "VERBİS istisnası: çalışan sayısı 50'den az ve bilanço 100 milyon TL'den az (ana faaliyet özel nitelikli veri değilse).",
      'Yükümlülüğü doğanlar için kayıt süresi 30 gündür.',
    ],
    sections: [
      {
        id: 'roller',
        title: 'Veri sorumlusu ve veri işleyen',
        blocks: [
          {
            type: 'p',
            text: 'Siparişle birlikte gelen ad, adres ve iletişim bilgisi kişisel veridir. Bu veriyi kendi satış ve teslimat süreciniz için işlediğinizde KVKK kapsamında veri sorumlusu siz olursunuz. Pazaryeri de kendi süreçleri için aynı veriyi işlediğinden ayrıca sorumlu olabilir. Siparişlerinizi yöneten entegrasyon yazılımı ise veriyi sizin adınıza ve talimatınızla işler; KVKK kavramlarıyla veri işleyen rolündedir.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Tanımların kaynağı',
            text: 'Rollerin kesin tanımı 6698 sayılı Kanun’da yer alır. Kendi süreçleriniz için hangi rolde olduğunuzu bir hukukçuyla değerlendirin.',
          },
        ],
      },
      {
        id: 'verbis',
        title: 'VERBİS kaydı gerekli mi?',
        blocks: [
          {
            type: 'p',
            text: "KVKK Kurulu'nun 4 Eylül 2025 tarihli ve 2025/1572 sayılı kararının uygulama esaslarına göre aşağıdaki veri sorumluları Veri Sorumluları Sicil Bilgi Sistemi'ne (VERBİS) kayıt yükümlülüğünden istisnadır:",
          },
          {
            type: 'table',
            caption: 'VERBİS kayıt istisnası kriterleri (Kurul kararı 2025/1572)',
            head: ['Durum', 'Çalışan sayısı', 'Yıllık mali bilanço toplamı'],
            rows: [
              ['Ana faaliyeti özel nitelikli kişisel veri işlemek olmayanlar', "50'den az", "100 milyon TL'den az"],
              ['Ana faaliyeti özel nitelikli kişisel veri işlemek olanlar', "10'dan az", "10 milyon TL'den az"],
            ],
          },
          {
            type: 'p',
            text: 'Kayıt yükümlülüğü doğan veri sorumluları için kayıt süresi, yükümlülüğün doğmasından itibaren 30 gündür. Kurum ayrıca belirli dönemler için süre uzatma duyuruları yayımlayabilir; güncel duyuruları KVKK sitesinden izleyin.',
          },
        ],
      },
      {
        id: 'uygulama',
        title: 'Satıcı için uygulamada',
        blocks: [
          {
            type: 'ul',
            items: [
              'Sitenizde ve mağaza sayfalarınızda aydınlatma metninizi yayımlayın.',
              'Sipariş verisine yalnızca işi gereği erişmesi gereken ekip üyelerine erişim verin.',
              'Veriyi sizin adınıza işleyen yazılım ve hizmet sağlayıcılarla veri işleme şartlarını yazılı hale getirin.',
              'Kampanya iletileri için ayrıca İleti Yönetim Sistemi (İYS) kurallarını kontrol edin.',
            ],
          },
        ],
      },
      {
        id: 'yazilim-secimi',
        title: 'Entegrasyon yazılımına sorulacaklar',
        blocks: [
          {
            type: 'ul',
            items: [
              'Pazaryeri API anahtarları ve sırlar veritabanında şifreli mi saklanıyor?',
              'Her müşterinin verisi diğerlerinden nasıl ayrılıyor?',
              'Rol ve yetki tanımlanabiliyor mu; kim neyi görebiliyor?',
              'Veri işleyen olarak hangi sözleşme ve aydınlatma metinleri sunuluyor?',
            ],
          },
          {
            type: 'p',
            text: 'Seçim ölçütlerinin tamamı için [pazaryeri entegrasyon yazılımı nasıl seçilir](/rehber/karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir) rehberine bakın.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'verbis-zorunlu',
        question: 'E-ticaret satıcısı olarak VERBİS’e kayıt zorunlu mu?',
        answer:
          "İşletmenize bağlıdır. Çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'den az olan ve ana faaliyeti özel nitelikli kişisel veri işlemek olmayan veri sorumluları istisnadır; diğerleri kayıt yükümlüsüdür.",
      },
      {
        id: 'kayit-suresi',
        question: 'Kayıt yükümlülüğü doğarsa ne kadar sürem var?',
        answer: 'Kayıt süresi yükümlülüğün doğmasından itibaren 30 gündür. Kurumun güncel süre duyurularını ayrıca kontrol edin.',
      },
      {
        id: 'pazaryeri-sorumlu',
        question: 'Pazaryerinde satarken alıcı verisinden kim sorumlu?',
        answer:
          'Veriyi kendi satış ve teslimat süreciniz için işlediğinizde siz veri sorumlususunuz. Pazaryeri de kendi süreçleri için ayrıca sorumlu olabilir; rolleri bir hukukçuyla değerlendirin.',
      },
    ],
    sources: ['S19', 'S20', 'S21', 'S22'],
    related: ['karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir', 'mevzuat/cayma-hakki-14-gun', 'pazaryerleri/pazaryeri-api-erisimi'],
    cta: 'security',
    legal: true,
    volatile: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2026-12-29',
  },
]

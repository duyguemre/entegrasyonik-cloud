/**
 * Rehber — "Operasyon ve stok" (R28, R29, R11) ve "Seçim rehberi" (R27) kümeleri (KB §4, §8.3, §8.7, §10).
 * Kavramsal anlatım; rakip adı YOK. Entegrasyonik'e özgü kapsam cümleleri burada yazılmaz — sayfa sonundaki bağlam
 * kutusu `src/data/kb/index.ts` içinde yetenek/entegrasyon kayıtlarından üretilir. Ideasoft API adımları resmi
 * yardım sayfasından (S46); Shopify/WooCommerce vb. altyapılar sitede anılmaz (KB §4: yalnız UI formu var).
 */
import type { Guide } from '../types'

const D = '2026-09-30'

export const operasyonGuides: Guide[] = [
  // ------------------------------------------------------------------------------------------ R28
  {
    slug: 'karsilastirma/tek-stokla-cok-kanal-yonetimi',
    kbId: 'R28',
    cluster: 'operasyon',
    title: 'Tek stokla çok kanal yönetimi nasıl yapılır?',
    seoTitle: 'Tek stokla çok kanal yönetimi',
    description:
      'Aynı ürünü birden çok pazaryerinde ve kendi sitenizde satarken stoğu tek kaynaktan yönetmenin sekiz adımı: eşleme, rezervasyon, tampon ve mutabakat.',
    summary: 'Tek stok kaynağıyla çok kanalda satışın sekiz adımı.',
    answer:
      'Tek stokla çok kanal yönetimi, aynı ürünü birden çok pazaryerinde ve kendi sitenizde satarken tüm kanalların tek bir stok kaynağından beslenmesidir. Ürünler barkod veya stok kodu (SKU) ile tekilleştirilir, sipariş geldiği anda stok ayrılır (rezervasyon) ve değişiklik diğer kanallara iletilir. Böylece bir kanaldaki satış diğerlerinde de stoğu düşürür ve aşırı satış riski azalır.',
    keyPoints: [
      'Önce ürünleri tekilleştirin: aynı ürün her kanalda aynı SKU/barkodla eşlenmeli.',
      'Stok tek kaynaktan yönetilir; kanallar bu kaynağın yansımasıdır.',
      'Sipariş geldiği anda rezervasyon, eşzamanlı siparişlerde çifte satışı önler.',
      'Kritik eşik ve tampon stok, gecikmelere karşı güvenlik payıdır.',
    ],
    sections: [
      {
        id: 'neden',
        title: 'Neden tek stok?',
        blocks: [
          {
            type: 'p',
            text: 'Her kanalın stoğunu ayrı ayrı güncellemek, kanal sayısı arttıkça hem iş yükünü hem de hata olasılığını büyütür. Bir pazaryerinde satılan son ürün başka bir kanalda hâlâ satışta görünüyorsa ikinci sipariş karşılanamaz ve iptal edilir. Tek stok yaklaşımında kanallar ortak bir stok kaynağından beslenir; bir kanaldaki her hareket kaynağı değiştirir ve kaynak diğer kanallara yansıtılır.',
          },
        ],
      },
      {
        id: 'adimlar',
        title: 'Sekiz adımda tek stok',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Ürünleri tekilleştirin', text: 'Her ürün ve varyantı barkod veya stok kodu (SKU) ile tek bir kayda bağlayın; aynı ürün için iki kayıt tutmayın.' },
              { name: 'Kanal eşlemelerini yapın', text: 'Kendi kategori ve özelliklerinizi her pazaryerinin kategori ve özellik şablonuyla eşleyin.' },
              { name: 'Tek stok kaynağını belirleyin', text: 'Stoğun doğru kabul edileceği tek yeri seçin: depo yazılımınız, ERP’niz veya entegrasyon paneliniz.' },
              { name: 'Siparişte rezervasyon yapın', text: 'Sipariş geldiği anda ilgili adedi ayırın; eşzamanlı iki sipariş aynı son ürünü alamasın.' },
              { name: 'Kanallara yayınlayın ve gecikmeyi izleyin', text: 'Stok değişikliğinin kanallara ne kadar sürede yansıdığını ölçün; gecikme arttığında uyarı alın.' },
              { name: 'Kritik eşik ve tampon belirleyin', text: 'Az kalan ürünlerde kanallara gösterilen stoktan güvenlik payı düşün veya satışı durdurun.' },
              { name: 'İade ve iptalde stoğu geri alın', text: 'Onaylanan iadeyi ürün kontrolünden sonra, iptal edilen siparişi hemen stoğa döndürün.' },
              { name: 'Düzenli mutabakat yapın', text: 'Haftalık olarak kanal stokları ile kaynak stok arasındaki farkları kontrol edip düzeltin.' },
            ],
          },
        ],
      },
      {
        id: 'kavramlar',
        title: 'Bilmeniz gereken kavramlar',
        blocks: [
          {
            type: 'table',
            caption: 'Tek stok yönetiminin temel kavramları',
            head: ['Kavram', 'Anlamı'],
            rows: [
              ['[Stok senkronu](/rehber/sozluk#stok-senkronu)', 'Stok değişikliğinin tüm kanallara yansıtılması'],
              ['[Stok rezervasyonu](/rehber/sozluk#stok-rezervasyonu)', 'Sipariş kesinleşene kadar stoğun ayrılması'],
              ['[Güvenlik stoğu](/rehber/sozluk#guvenlik-stogu)', 'Aşırı satışa karşı kanallardan saklanan pay'],
              ['[Kritik stok eşiği](/rehber/sozluk#kritik-stok-esigi)', 'Uyarı veya satış durdurma için belirlenen en düşük stok'],
              ['[Kategori eşleme](/rehber/sozluk#kategori-esleme)', 'Kendi kategori ağacınızın pazaryeri kategorisine bağlanması'],
            ],
          },
        ],
      },
      {
        id: 'hatalar',
        title: 'Sık yapılan hatalar',
        blocks: [
          {
            type: 'ul',
            items: [
              'Aynı ürünü kanallarda farklı stok kodlarıyla açıp eşlememek.',
              'Stoğu bir kanalın panelinde elle değiştirip kaynağı güncellememek.',
              'İade gelen ürünü kontrol etmeden satılabilir stoğa eklemek.',
              'Kampanya dönemlerinde senkron gecikmesini izlememek.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'nasil-eslesir',
        question: 'Kendi sitem ile pazaryeri stoğu nasıl eşleşir?',
        answer:
          'Ürünler iki tarafta da aynı barkod veya stok koduyla (SKU) eşlenir. Stok tek kaynaktan yönetildiğinde bir taraftaki satış diğer tarafa da yansıtılır.',
      },
      {
        id: 'depo',
        question: 'Birden fazla depom varsa tek stok mümkün mü?',
        answer:
          'Evet, ancak hangi deponun hangi kanala stok verdiği net tanımlanmalıdır. Kanal başına gösterilecek stok, depoların toplamından veya seçilen depolardan hesaplanır.',
      },
      {
        id: 'ne-kadar-hizli',
        question: 'Stok değişikliği kanallara ne kadar sürede yansır?',
        answer:
          'Kullanılan yazılıma ve pazaryerinin istek sınırlarına bağlıdır. Yazılım seçerken bu süreyi ölçülebilir biçimde sorun; tanımsız hız iddialarına güvenmeyin.',
      },
    ],
    sources: ['S30', 'S36', 'S46'],
    related: ['karsilastirma/asiri-satis-overselling', 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir', 'altyapi-erp/eticaret-altyapisi-pazaryeri-entegrasyonu'],
    cta: 'stock',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R29
  {
    slug: 'karsilastirma/asiri-satis-overselling',
    kbId: 'R29',
    cluster: 'operasyon',
    title: 'Aşırı satış (overselling) nedir, nasıl önlenir?',
    seoTitle: 'Aşırı satış (overselling) nedir?',
    description:
      'Stokta olmayan ürüne sipariş almanın nedenleri: senkron gecikmesi, eşzamanlı siparişler ve elle müdahale; rezervasyon ve tampon stokla önleme yolları.',
    summary: 'Stokta olmayan ürüne sipariş almanın nedenleri ve çözümleri.',
    answer:
      'Aşırı satış (overselling), elinizdeki stoktan fazla sipariş kabul etmektir; genellikle aynı ürün birden çok kanalda satılırken stok değişikliği kanallara gecikmeli yansıdığında veya iki sipariş aynı son ürünü aynı anda aldığında oluşur. En etkili önlem, sipariş geldiği anda stoğu ayıran bir rezervasyon mekanizmasıdır; tampon stok ve kritik eşik ise gecikmelere karşı ek güvenlik sağlar.',
    keyPoints: [
      'Başlıca nedenler: gecikmeli senkron, eşzamanlı sipariş, elle müdahale.',
      'Rezervasyon, eşzamanlı siparişlerde stoğun eksiye düşmesini engeller.',
      'Tampon stok ve kritik eşik, gecikmeye karşı güvenlik payıdır.',
    ],
    sections: [
      {
        id: 'nedenler',
        title: 'Aşırı satış neden olur?',
        blocks: [
          {
            type: 'table',
            caption: 'Aşırı satışın başlıca nedenleri',
            head: ['Neden', 'Ne olur?'],
            rows: [
              ['Gecikmeli stok senkronu', 'Bir kanalda satılan ürün, diğer kanalda stok düşmeden önce yeniden satılır'],
              ['Eşzamanlı sipariş (yarış durumu)', 'İki kanaldan aynı son ürüne aynı anda sipariş gelir; ikisi de stok var sanar'],
              ['İstek sınırı (rate limit)', 'Pazaryeri istekleri sınırladığında stok güncellemeleri sırada bekler'],
              ['Elle müdahale', 'Bir panelde stok elle değiştirilir, stok kaynağı güncellenmez'],
              ['İade/iptal akışı', 'Kontrol edilmemiş iade satılabilir stoğa eklenir veya iptal stoğa dönmez'],
            ],
          },
        ],
      },
      {
        id: 'sonuclari',
        title: 'Sonuçları',
        blocks: [
          {
            type: 'p',
            text: 'Karşılanamayan sipariş iptal edilir; müşteri deneyimi zarar görür ve iptal oranı satıcı performans değerlendirmesine yansıyabilir. Stok hatasıyla yapılan iptallerin pazaryerine göre hangi yaptırıma bağlandığı satıcı sözleşmesinde tanımlanır; güncel kuralı sözleşmenizden kontrol edin.',
          },
        ],
      },
      {
        id: 'onleme',
        title: 'Nasıl önlenir?',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Rezervasyon kullanın', text: 'Sipariş geldiği anda adedi ayırın; eşzamanlı siparişlerde yalnızca mevcut adet kadar rezervasyon yapılsın, fazlası işaretlensin.' },
              { name: 'Tek stok kaynağı belirleyin', text: 'Stoğu yalnızca bir yerden değiştirin; kanal panellerinde elle stok düzeltmeyin.' },
              { name: 'Tampon ve kritik eşik tanımlayın', text: 'Az kalan ürünlerde kanallara stoğun tamamını göstermeyin; eşiğin altında satışı durdurun.' },
              { name: 'Gecikmeyi izleyin', text: 'Stok değişikliğinin kanala yansıma süresini ölçün; kampanya ve yoğun dönemlerde özellikle takip edin.' },
              { name: 'İade ve iptali kurala bağlayın', text: 'İptali hemen, iadeyi ürün kontrolünden sonra stoğa döndürün.' },
            ],
          },
        ],
      },
      {
        id: 'rezervasyon',
        title: 'Rezervasyon nasıl çalışır?',
        blocks: [
          {
            type: 'flow',
            caption: 'Eşzamanlı siparişte rezervasyon',
            items: ['İki sipariş aynı anda gelir', 'Stok tek kaynaktan kontrol edilir', 'Mevcut adet kadar rezerve edilir', 'Fazla sipariş işaretlenir', 'Kanallara yeni stok iletilir'],
          },
          {
            type: 'p',
            text: 'Rezervasyonun işe yaraması için stok kontrolü ve ayırma işleminin tek adımda yapılması gerekir; aksi halde iki sipariş aynı anda "stok var" sonucunu görebilir.',
          },
        ],
      },
    ],
    faq: [
      {
        id: 'neden-olur',
        question: 'Aşırı satış neden olur?',
        answer:
          'Çoğunlukla stok değişikliğinin kanallara gecikmeli yansımasından veya iki kanaldan aynı son ürüne eşzamanlı sipariş gelmesinden. Elle yapılan stok değişiklikleri de neden olabilir.',
      },
      {
        id: 'ceza',
        question: 'Pazaryeri aşırı satış nedeniyle yaptırım uygular mı?',
        answer:
          'Stok hatasıyla iptal edilen siparişlere uygulanan kurallar pazaryerine göre değişir ve satıcı sözleşmesinde tanımlanır. Güncel kuralı satıcı panelinizden ve sözleşmenizden kontrol edin.',
      },
      {
        id: 'tampon',
        question: 'Tampon stok ne kadar olmalı?',
        answer:
          'Ürünün satış hızına ve stok değişikliğinin kanallara yansıma süresine bağlıdır. Hızlı satan ve az kalan ürünlerde daha yüksek bir güvenlik payı bırakın.',
      },
    ],
    sources: ['S30', 'S36'],
    related: ['karsilastirma/tek-stokla-cok-kanal-yonetimi', 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir', 'pazaryerleri/pazaryeri-api-erisimi'],
    cta: 'stock',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R11
  {
    slug: 'altyapi-erp/eticaret-altyapisi-pazaryeri-entegrasyonu',
    kbId: 'R11',
    cluster: 'operasyon',
    title: 'E-ticaret altyapısı ile pazaryeri entegrasyonu',
    seoTitle: 'E-ticaret sitesi ve pazaryeri entegrasyonu',
    description:
      'Kendi e-ticaret sitenizi pazaryerleriyle tek stokta birleştirmenin mantığı, veri akışı ve Ideasoft API erişiminin resmi adımları.',
    summary: 'Kendi sitenizi pazaryerleriyle tek stokta birleştirme.',
    answer:
      'E-ticaret altyapısı ile pazaryeri entegrasyonu, kendi web sitenizdeki ürün, stok ve siparişleri pazaryerlerindeki mağazalarınızla aynı kaynaktan yönetmektir. Ürün ve stok tek merkezde tutulur ve kanallara yayınlanır; siparişler kanallardan tek merkeze gelir, stok düşülür ve gerekiyorsa ERP’ye kaydedilir. Bağlantı, altyapının sunduğu API ile kurulur; örneğin Ideasoft’ta API erişimi yönetim panelinin Entegrasyonlar bölümünden oluşturulur.',
    keyPoints: [
      'Site ve pazaryerleri aynı ürün kaydına ve aynı stok kaynağına bağlanır.',
      'Siparişler tek listede toplanır; stok tek yerden düşülür.',
      'Bağlantı altyapının API’siyle kurulur; yetki (okuma/yazma) ihtiyaca göre verilir.',
    ],
    sections: [
      {
        id: 'akis',
        title: 'Veri nasıl akar?',
        blocks: [
          {
            type: 'flow',
            caption: 'Site, pazaryerleri ve ERP arasında veri akışı',
            items: ['Ürün ve stok tek merkezde', 'Kanallara yayın', 'Sipariş tek merkeze gelir', 'Stok düşülür', 'ERP’ye satış kaydı', 'Takip bilgisi kanala döner'],
          },
          {
            type: 'p',
            text: 'Akışın amacı aynı bilgiyi iki kez girmemektir. Ürün açıklaması, fiyat ve stok tek yerde güncellenir; siparişler de her panele ayrı ayrı girilmeden tek listede görülür.',
          },
        ],
      },
      {
        id: 'ideasoft',
        title: 'Örnek: Ideasoft’ta API erişimi',
        blocks: [
          {
            type: 'p',
            text: 'Ideasoft’un resmi yardım sayfasına göre API erişimi şu adımlarla oluşturulur:',
          },
          {
            type: 'steps',
            items: [
              { name: 'API bölümünü açın', text: 'Yönetim panelinde Entegrasyonlar › API bölümüne gidin ve API Ekle’yi seçin.' },
              { name: 'Uygulama bilgilerini girin', text: 'Uygulama adını ve yönlendirme adresini (redirect URL) girin.' },
              { name: 'Kimlik bilgilerini alın', text: 'Oluşan istemci kimliğini (Client ID) ve gizli anahtarı (Client Secret) güvenli biçimde saklayın.' },
              { name: 'Yetkiyi belirleyin', text: 'Uygulamaya yalnızca okuma veya okuma-yazma izni verin; ihtiyacınız kadar yetki tanımlayın.' },
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Kimler görebilir?',
            text: 'Ideasoft’a göre API bölümünü mağazanın ana yönetici hesabı görür. API ile ilgili sorular için Ideasoft’un API destek kanalına başvurabilirsiniz.',
          },
        ],
      },
      {
        id: 'erp',
        title: 'ERP ve ön muhasebe nerede devreye girer?',
        blocks: [
          {
            type: 'p',
            text: 'Satış kayıtlarının muhasebeye elle aktarılması hem zaman alır hem de çift kayıt hatasına açıktır. Altyapılar bu nedenle muhasebe ve ERP entegrasyonları sunar; örneğin Ideasoft, muhasebe entegrasyonlarıyla stok, fiyat, sipariş, fatura ve müşteri bilgisinin senkronize edilebildiğini belirtir. Hangi verinin hangi yönde aktığını (yalnızca okuma mı, iki yönlü mü) kurulumdan önce netleştirin.',
          },
        ],
      },
      {
        id: 'hazirlik',
        title: 'Başlamadan önce',
        blocks: [
          {
            type: 'ul',
            items: [
              'Sitenizdeki ürünlerin barkod veya stok kodlarının (SKU) eksiksiz ve benzersiz olduğunu kontrol edin.',
              'Stoğun doğru kabul edileceği tek yeri seçin (site, ERP veya entegrasyon paneli).',
              'Pazaryerlerinde aynı ürün zaten açıksa, yeni kayıt açmak yerine mevcut ürünle eşleyin.',
              'Test için az sayıda ürünle başlayın; akış doğrulandıktan sonra kapsamı genişletin.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'site-pazaryeri',
        question: 'Kendi sitem ile pazaryeri stoğu nasıl eşleşir?',
        answer:
          'Ürünler iki tarafta aynı barkod veya stok koduyla eşlenir ve stok tek kaynaktan yönetilir. Bir kanaldaki satış kaynağı düşürür, kaynak diğer kanallara yansıtılır.',
      },
      {
        id: 'ideasoft-api',
        question: 'Ideasoft API anahtarı nasıl alınır?',
        answer:
          'Yönetim panelinde Entegrasyonlar › API › API Ekle adımlarıyla uygulama oluşturulur; istemci kimliği (Client ID) ve gizli anahtar (Client Secret) bu adımda üretilir.',
      },
      {
        id: 'erp-veri',
        question: 'Hangi veri ERP’ye gider?',
        answer:
          'Genellikle satış (sipariş), stok hareketi, fatura ve müşteri bilgisi. Hangi verinin hangi yönde aktığı kullanılan entegrasyona göre değişir; kurulumdan önce netleştirin.',
      },
    ],
    sources: ['S46', 'S47'],
    related: ['karsilastirma/tek-stokla-cok-kanal-yonetimi', 'pazaryerleri/pazaryeri-api-erisimi', 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir'],
    cta: 'catalog',
    ctaChannel: 'ideasoft',
    howTo: true,
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },

  // ------------------------------------------------------------------------------------------ R27
  {
    slug: 'karsilastirma/pazaryeri-entegrasyon-yazilimi-nasil-secilir',
    kbId: 'R27',
    cluster: 'secim',
    title: 'Pazaryeri entegrasyon yazılımı nasıl seçilir?',
    seoTitle: 'Pazaryeri entegrasyon yazılımı seçimi',
    description:
      'Pazaryeri entegrasyon yazılımı seçerken kanal kapsamı, stok senkron süresi, aşırı satış koruması, güvenlik ve fiyat modeli için sorulacak sorular.',
    summary: 'Dokuz ölçüt ve her biri için sorulacak soru.',
    answer:
      'Pazaryeri entegrasyon yazılımı seçerken önce ihtiyacınız olan kanalların resmi olarak desteklenip desteklenmediğine, sonra stok değişikliğinin kanallara ne kadar sürede ve nasıl ölçülerek iletildiğine ve aşırı satışa karşı rezervasyon olup olmadığına bakın. Güvenlik (anahtarların şifrelenmesi, rol ve yetki), fatura ve kargo akışının nasıl kurulduğu, destek kanalları ve toplam maliyet de karşılaştırılması gereken ölçütlerdir.',
    keyPoints: [
      'Kanal kapsamını kanal bazında ve yetenek bazında sorun; “entegre” tek başına yeterli değil.',
      '“Anlık” gibi tanımsız hız iddiaları yerine ölçülebilir süre isteyin.',
      'Aşırı satış koruması, güvenlik ve denetim kaydı en çok atlanan ölçütlerdir.',
    ],
    sections: [
      {
        id: 'olcutler',
        title: 'Dokuz seçim ölçütü',
        blocks: [
          {
            type: 'table',
            caption: 'Pazaryeri entegrasyon yazılımı seçim ölçütleri',
            head: ['Ölçüt', 'Sorulacak soru', 'Neden önemli'],
            rows: [
              ['Kanal kapsamı', 'İhtiyacım olan pazaryeri ve site altyapıları resmi olarak destekleniyor mu; hangi işlemler (ürün, stok, sipariş, iade) her kanalda var?', 'Kapsam dışı kanal ve işlem elle yapılan işe döner'],
              ['Stok senkron süresi', 'Değişiklik kanala ne kadar sürede gidiyor, bu süre ölçülebilir mi?', '“Anlık” gibi iddialar tanımsız olabilir'],
              ['Aşırı satış koruması', 'Rezervasyon, tampon stok ve kritik eşik var mı?', 'Stok hatası sipariş iptaline yol açar'],
              ['İstek sınırı yönetimi', 'Pazaryeri istek sınırına takıldığında kuyruk ve önceliklendirme var mı?', 'Stok güncellemesi gecikebilir'],
              ['Fatura ve kargo', 'Bu akışlar yazılımın içinde mi, bir iş ortağıyla mı, yoksa hiç yok mu?', 'Sipariş sonrası süreç buna bağlıdır'],
              ['Destek', 'Hangi kanaldan ve hangi sürede yanıt veriliyor?', 'Süreç kesintisi satış kaybıdır'],
              ['Güvenlik ve KVKK', 'Anahtarlar şifreli mi; rol ve yetki var mı; veri işleyen sözleşmesi sunuluyor mu?', 'Alıcı verisinin sorumluluğu satıcıdadır'],
              ['Fiyatlandırma modeli', 'Ücret sipariş, ürün veya kanal bazlı mı; ek ücret var mı?', 'Toplam maliyeti belirler'],
              ['Denetlenebilirlik', 'Stok ve fiyat değişikliklerinin kim tarafından, ne zaman yapıldığı kaydediliyor mu?', 'Hata ayıklamayı hızlandırır'],
            ],
          },
        ],
      },
      {
        id: 'demo',
        title: 'Deneme sürecinde neyi test etmeli?',
        blocks: [
          {
            type: 'steps',
            items: [
              { name: 'Gerçek kanallarınızı bağlayın', text: 'Deneme sürecinde en çok sattığınız kanalları bağlayın; demo verisi yerine kendi ürünlerinizle çalışın.' },
              { name: 'Eşzamanlı sipariş senaryosu kurun', text: 'Az stoklu bir ürünü iki kanalda satışa açın ve rezervasyon davranışını gözlemleyin.' },
              { name: 'Senkron süresini ölçün', text: 'Bir kanalda stok değiştirip diğer kanala yansıma süresini birkaç kez ölçün.' },
              { name: 'Yetki ve kayıtları kontrol edin', text: 'Ekip üyelerine farklı roller verin; stok değişikliklerinin kaydını inceleyin.' },
            ],
          },
        ],
      },
      {
        id: 'kirmizi-bayraklar',
        title: 'Dikkat edilmesi gereken işaretler',
        blocks: [
          {
            type: 'ul',
            items: [
              'Kanal listesinde yer alan ama hangi işlemlerin desteklendiği belirtilmeyen entegrasyonlar.',
              'Ölçüsü verilmeyen hız ve kapasite iddiaları (ör. tanımı yapılmamış “anlık” ifadesi).',
              'Anahtarların nasıl saklandığına yanıt verilmemesi.',
              'Sözleşmede fiyat modelinin ve ek ücretlerin açık yazılmaması.',
            ],
          },
        ],
      },
    ],
    faq: [
      {
        id: 'ucretsiz',
        question: 'Ücretsiz entegrasyon yazılımı yeterli olur mu?',
        answer:
          'Kanal sayınız ve sipariş hacminiz düşükse olabilir. Karar verirken yalnızca ücreti değil, aşırı satış koruması, destek ve güvenlik ölçütlerini de karşılaştırın.',
      },
      {
        id: 'en-onemli',
        question: 'En önemli ölçüt hangisi?',
        answer:
          'İşletmenize göre değişir; ancak birden çok kanalda aynı stoğu satıyorsanız kanal kapsamı ve aşırı satış koruması ilk bakılacak iki ölçüttür.',
      },
      {
        id: 'gecis',
        question: 'Başka bir yazılımdan geçiş zor mu?',
        answer:
          'Ürünleriniz barkod veya stok koduyla tekilse geçiş, kanalları yeniden bağlamak ve eşlemeleri kontrol etmekten ibarettir. Geçişi az sayıda ürünle test ederek başlatın.',
      },
    ],
    sources: ['S30', 'S46', 'S19'],
    related: ['karsilastirma/asiri-satis-overselling', 'karsilastirma/tek-stokla-cok-kanal-yonetimi', 'mevzuat/kvkk-e-ticaret-saticilar'],
    cta: 'channels',
    datePublished: D,
    dateModified: D,
    reviewBy: '2027-03-29',
  },
]

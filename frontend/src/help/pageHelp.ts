/**
 * frontend/src/help/pageHelp.ts
 *
 * Bağlamsal yardım — "Sayfa hakkında" (i) paneli içeriği. Anahtar: `stores/site/menu.ts` `views` anahtarı
 * (`productDefinitions/TEST` ve `adminPanel/AdminView` eski/göç edilmemiş ekranlar olduğu için YOK) + yardım
 * merkezi ekranı (`HelpCenterView`).
 *
 * İÇERİK KURALI (types.ts): yalnız ekranda GERÇEKTEN var olan davranış anlatılır. Her kaydın üstündeki
 * `// Kanıt:` yorumu, metnin dayandığı görünüm/bileşen dosyalarını gösterir. Ekran bir `description`
 * taşıyorsa `purpose` o cümleyle AYNEN başlar (e2e testleri bu metinleri doğrular).
 * `pageRefresh` (Alt+R) yalnızca ekranda `EkRefreshButton` (EkPageHeader/EkPageBar/EkListScreen `refreshable`)
 * olduğunda listelenir — EkListScreen'de `refreshable` varsayılan olarak açıktır.
 */
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import type { PageHelp } from './types'

export const PAGE_HELP: Record<string, PageHelp> = {
  // Kanıt: views/secure/DashboardView.vue, components/dashboard/*
  DashboardView: {
    purpose:
      'İşletmenizin sipariş, ciro, stok ve entegrasyon durumunun özeti. Kartlardaki oklarla ilgili listeye geçersiniz.',
    tips: [
      'Kartlardaki sayılar son yüklemeye aittir; Yenile düğmesi tüm kartları yeniden okur.',
      'Bekleyen aksiyonlar kartı, işlem bekleyen siparişlerin listesini doğrudan açar.',
      'Stok ve eşleşme uyarıları kartı aşırı satış ve eşleşmeyen sipariş kalemlerini gösterir.',
      'Entegrasyon sağlığı kartı yalnızca mağaza sahibi ve yöneticilere görünür.',
    ],
    shortcuts: ['search', 'pageRefresh', 'sidebarToggle'],
    article: 'app-workspace-tabs',
  },

  // Kanıt: views/secure/adminPanel/AdminClientListView.vue
  'adminPanel/AdminClientListView': {
    purpose:
      'Platformdaki tüm mağaza kayıtlarını görüntüleyin, oluşturun ve yönetin. Bu ekran yalnızca platform yöneticileri içindir.',
    tips: [
      'Arama kutusu müşteri ve mağaza adında arar.',
      'Yeni mağaza oluştur düğmesiyle yeni bir mağaza kaydı açın.',
      'Satırdaki ⋯ menüsünden mağaza detaylarını görüntüleyin veya mağazayı silin.',
      'Durum kolonu mağazanın aktif ya da pasif olduğunu gösterir.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'acc-users',
  },

  // Kanıt: views/secure/adminPanel/AdminTicketListView.vue
  'adminPanel/AdminTicketListView': {
    purpose:
      'Talepleri filtreleyin, yanıtlayın veya yeni bir destek süreci başlatın. Tüm mağazaların destek talepleri burada toplanır.',
    tips: [
      'Talep no, konu veya mesaj içeriğiyle arayın; durum filtresiyle listeyi daraltın.',
      'Yeni talep başlat düğmesiyle belirli bir mağaza için destek süreci açın.',
      'Satırdaki yanıtla eylemi yazışmayı açar; silme eylemi talebi kaldırır.',
      'Öncelik ve durum çipleri hangi talebin önce ele alınacağını gösterir.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'support-ticket',
  },

  // Kanıt: views/secure/adminPanel/AdminSystemManagementView.vue
  'adminPanel/AdminSystemManagementView': {
    purpose:
      'Platform sağlığı, aktif işleyiciler ve bellek durumu anlık olarak izleniyor. Bu ekran yalnızca platform yöneticileri içindir.',
    tips: [
      'Zaman aralığı ve mağaza seçimiyle özet grafikleri daraltın; mağaza seçilmezse tüm mağazalar gösterilir.',
      'Gönderim trafiği kartındaki ayrıntılı analiz, export işlerini tarih, durum, işlem tipi ve platforma göre süzer.',
      'Aktif işleyiciler bölümü çalışan pod ve kuyrukları listeler.',
      'Redis veri sağlığı bölümü bellek ve bağlantı havuzu göstergelerini içerir.',
    ],
    shortcuts: ['pageRefresh', 'focusMode', 'tabClose'],
    article: 'int-health',
  },

  // Kanıt: views/secure/adminPanel/integrations/IntegrationConfigListView.vue
  'adminPanel/IntegrationConfigListView': {
    purpose:
      'Her entegrasyonun ve motorun yayındaki ayar sürümünü, kabul durumunu ve açık taslağını buradan görüp yönetebilirsiniz.',
    tips: [
      'Kategori, kabul durumu ve "yalnızca taslağı olanlar" filtreleriyle listeyi daraltın.',
      'Bir satırı açtığınızda özet ve son 5 revizyon yan panelde görünür.',
      'Yan paneldeki Ayarları düzenle ve Etkin yapılandırmayı gör düğmeleri ilgili ekranı yeni sekmede açar.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/adminPanel/integrations/IntegrationSettingsView.vue,
  //        components/adminPanel/integrations/IntegrationConfigSettingsBody.vue, PublishConfirmDialog.vue
  'adminPanel/IntegrationSettingsView': {
    purpose:
      'Seçili entegrasyona özgü ayarları taslak olarak düzenleyip yayınlarsınız. Ekran Entegrasyonlar listesinden bir entegrasyon seçilerek açılır.',
    tips: [
      'Ayarlarda ara kutusu etiket, anahtar ve açıklamaya göre alanları süzer.',
      'Kaydet, değişiklikleri doğrudan yazmaz; önce fark ve etki özetini gösteren yayın onayını açar.',
      'Riskli değişikliklerde gerekçe ve hedef kodunun yazılı onayı istenir.',
      'Sürüm geçmişi, yayınlanan her sürümü kimin ve neden yayınladığını gösterir.',
    ],
    shortcuts: ['search', 'tabClose', 'tabPrev'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/adminPanel/integrations/EngineSettingsView.vue,
  //        components/adminPanel/integrations/IntegrationConfigSettingsBody.vue
  'adminPanel/EngineSettingsView': {
    purpose:
      'Tüm entegrasyonlar için geçerli motor parametreleri. Değişiklikler taslak olarak hazırlanır ve onayla yayınlanır.',
    tips: [
      'Ayarlarda ara kutusuyla etiket, anahtar veya açıklamaya göre alan bulun.',
      'Kaydet, fark ve etki özetini gösteren yayın onayını açar; Vazgeç taslağı atar.',
      'Sürüm geçmişinden önceki bir sürüme dönmek için gerekçe ve yazılı onay gerekir.',
    ],
    shortcuts: ['search', 'tabClose', 'tabPrev'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/adminPanel/integrations/EffectiveConfigView.vue
  'adminPanel/EffectiveConfigView': {
    purpose:
      'Her ayarın şu an gerçekten kullanılan değeri ve kaynağı. Seçili entegrasyon veya motor için salt-okunur görünümdür.',
    tips: [
      '"Varsayılan dışı" filtresi yalnızca varsayılandan farklı değerleri gösterir.',
      'Kaynak kolonu değerin varsayılandan mı yoksa yayınlanan bir sürümden mi geldiğini belirtir.',
      'Dışa aktar (JSON) düğmesi etkin yapılandırmayı dosya olarak indirir.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/adminPanel/integrations/ComplianceView.vue,
  //        components/adminPanel/integrations/ComplianceSummaryPanel.vue, ComplianceFindingSheet.vue
  'adminPanel/ComplianceView': {
    purpose:
      "Entegrasyon API'lerindeki değişiklik belirtilerini izleyin, triyaj edin ve kararla kapatın.",
    tips: [
      'Özet kartlarından birine tıklayınca bulgular o entegrasyona süzülür; tekrar tıklamak süzmeyi kaldırır.',
      'Entegrasyon, kategori, tür, şiddet ve durum filtreleriyle listeyi daraltın.',
      'Bir bulguyu açtığınızda kanıt, etki, öneri ve karar bölümleri yan panelde görünür.',
      'Boş liste yalnızca izlenen sözleşme ve kaynaklarda sorun görülmediği anlamına gelir.',
    ],
    shortcuts: ['search', 'tabClose', 'focusMode'],
    article: 'int-errors',
  },

  // Kanıt: views/secure/OrderListView.vue, composables/useLifecycle.ts, components/order/composables/useOrderCancel.ts
  OrderListView: {
    purpose:
      'Tüm pazaryeri siparişlerinizi buradan yönetin. Onaylama, fatura kesme, kargoya verme ve iptal işlemleri siparişin durumuna göre açılır.',
    tips: [
      'Kanal, sipariş durumu ve stok durumu filtrelerini "Görünümler" menüsüyle kaydedip tek tıkla uygulayın.',
      'Toplu işlem için satırları seçin; her düğmede o işleme uygun sipariş sayısı yazar.',
      'Satırdaki ⋯ menüsü yalnızca siparişin durumuna uygun eylemleri gösterir; "Kilitli" siparişlerde pazaryeri işlemi sürerken eylemler kapalıdır.',
      'İptal için gerekçe seçmeniz gerekir; toplu iptalde her pazaryeri için ayrı gerekçe seçilir.',
      'İçerik kolonuna tıklayarak sipariş detayını açın.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext', 'focusMode'],
    article: 'ord-lifecycle',
  },

  // Kanıt: views/secure/ClaimListView.vue, components/claim/composables/useClaimActions.ts, composables/useLifecycle.ts
  ClaimListView: {
    purpose:
      'Pazaryerlerinden gelen iade/talep süreçlerini buradan yönetin. İncelemedeki talepleri onaylayabilir veya gerekçe seçerek reddedebilirsiniz.',
    tips: [
      'Onay ve red yalnızca "İncelemede" durumundaki taleplerde açıktır.',
      'Reddetmek için bir red gerekçesi seçmeniz gerekir; karar pazaryerine hemen bildirilir.',
      'Birden çok talebi seçip Toplu onayla ile tek seferde onaylayın.',
      'Kanal ve talep durumu filtrelerini "Görünümler" menüsüyle kaydedin.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext'],
    article: 'ord-returns',
  },

  // Kanıt: views/secure/CustomerListView.vue
  CustomerListView: {
    purpose:
      'Tüm platformlardaki müşteri kayıtlarınızı buradan yönetin. Sipariş sayısı, net ciro ve iade oranı her satırda görünür.',
    tips: [
      'İsim, telefon, e-posta veya vergi numarasıyla arayın; şehir ve müşteri durumu filtreleriyle daraltın.',
      'Satırdaki ⋯ menüsünden müşteri karnesini açın veya müşteriyi silin.',
      'Mağaza sahibi ve yöneticiler müşteri karnesinden kişisel bilgileri kalıcı olarak anonimleştirebilir; sipariş kayıtları korunur.',
      'Birden çok müşteriyi seçip Toplu sil ile kaldırabilirsiniz.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'acc-privacy',
  },

  // Kanıt: views/secure/MessageListView.vue, components/message/MessageDetailComponent.vue, MessageWaitChip.vue
  MessageListView: {
    purpose:
      'Pazaryerlerinden gelen müşteri mesajlarını buradan yönetin. Yanıt bekleyen mesajları açıp doğrudan cevaplayabilirsiniz.',
    tips: [
      '"Bekleyenler önce" düğmesi bu sayfadaki mesajları en uzun bekleyenden başlayarak sıralar.',
      'Mesaj durumu, tipi, red durumu, kanal ve tarih aralığı filtreleriyle listeyi daraltın.',
      'Yanıt yazarken karakter sayacı kanalın en az ve en fazla karakter kuralını gösterir.',
      'Satırdaki ⋯ menüsünden mesajı cevaplayın, görüntüleyin veya silin.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext'],
    article: 'ord-messages-sla',
  },

  // Kanıt: views/secure/FinancialListView.vue, components/financial/*Tab.vue
  FinancialListView: {
    purpose:
      'Hakediş, kesinti, kargo faturası ve ödeme emirlerinizi tek yerden izleyin.',
    tips: [
      'İşlemler, Özet, Kargo faturaları ve Ödeme dökümü sekmeleri arasında geçiş yapın.',
      'İşlemler sekmesinde platform, işlem tipi ve tarih aralığı filtrelerini kullanın; satırı açınca mutabakat ayrıntısı görünür.',
      'Bir kanal kargo faturası veya ödeme dökümü sağlamıyorsa ekran bunu sıfır tutar yerine "desteklenmiyor" olarak belirtir.',
      'Özet sekmesi seçili dönem ve kanallar için alacak, borç ve net hakedişi kanal kırılımıyla gösterir.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext'],
    article: 'fin-overview',
  },

  // Kanıt: views/secure/InvoiceListView.vue
  InvoiceListView: {
    purpose:
      'Sipariş ve manuel faturalarınızı buradan yönetin. Belge kolonu e-Fatura ve e-Arşiv ayrımını gösterir.',
    tips: [
      'Yeni fatura ekle düğmesiyle manuel fatura oluşturun.',
      'Fatura durumu ve belge tipi filtreleriyle listeyi daraltın.',
      'Satırdaki ⋯ menüsünden detayları görüntüleyin; PDF bağlantısı olan faturaları görüntüleyip yazdırabilirsiniz.',
      'Birden çok faturayı seçip Toplu sil ile kaldırabilirsiniz.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'fin-invoices-reports',
  },

  // Kanıt: views/secure/PrintoutListView.vue
  PrintoutListView: {
    purpose:
      'Sipariş çıktı şablonlarınızı alanları tuvale sürükleyerek tasarlayın. Bu ekran taslak aşamasındadır; tasarım sunucuya kaydedilmez.',
    tips: [
      'Soldaki paletten bir alanı fareyle tuvale sürükleyin.',
      'Kâğıt boyutu düğmeleriyle tuvalin ölçüsünü değiştirin.',
      'Tuvaldeki bir öğeye tıklayınca seçilir; ayar panelindeki Sil düğmesiyle kaldırın.',
    ],
    shortcuts: ['tabClose', 'focusMode'],
    article: 'fin-invoices-reports',
  },

  // Kanıt: views/secure/SettingListView.vue
  SettingListView: {
    purpose:
      'Mağaza kimliği, fatura bilgileri, lojistik varsayılanları ve bildirim tercihleri.',
    tips: [
      'Ayarlar dört sekmede toplanır: Mağaza Kimliği, Fatura & Yasal Bilgiler, Lojistik & Operasyon, İletişim & Bildirimler.',
      'Kurumsal fatura alanları (firma ünvanı, vergi dairesi, vergi no) yalnızca kurumsal seçildiğinde görünür.',
      'Zaman dilimi, sipariş senkronizasyonunun hangi saate göre yapılacağını belirler.',
      'Değişiklikler Ayarları Kaydet düğmesine basınca kaydedilir.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'gs-account',
  },

  // Kanıt: views/secure/LogListView.vue, components/logListView/ExportLogList.vue, ImportLogList.vue
  LogListView: {
    purpose:
      'Pazaryerlerine gönderilen ve pazaryerlerinden çekilen ürün işlemlerini buradan izleyin.',
    tips: [
      'Ürün gönderim işlemleri ve Ürün çekim işlemleri sekmeleri arasında geçiş yapın.',
      'Tarih aralığı, kanal, işlem tipi ve işlem durumu filtreleriyle belirli bir aktarımı bulun.',
      'Satırdaki ⋯ menüsünden gönderim detaylarını açarak aktarımın ayrıntılı raporunu inceleyin.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext'],
    article: 'ts-product-not-sent',
  },

  // Kanıt: views/secure/productDefinitions/ProductListView.vue,
  //        components/productDefinitions/products/BatchActions/useBatchActions.ts
  'productDefinitions/ProductListView': {
    purpose:
      'Tüm kanallardaki ürünlerinizi buradan yönetin. Platform durumu kolonu her kanaldaki aktarım durumunu gösterir.',
    tips: [
      'Ürün adı, barkod, stok kodu, satış durumu, fiyat aralığı ve platform yüklenme durumuyla filtreleyin.',
      'Toplu işlemler menüsünden platformlara yükleme, fiyat/stok güncelleme, kategori/marka atama ve Excel ile dışa/içe aktarma yapın.',
      'Toplu işlemlerde kapsamı seçin: seçilen ürünler, filtrelenmiş liste veya tüm katalog.',
      'Yeni ürün düğmesiyle ürün tanımlama sihirbazını açın; satırdaki ⋯ menüsünden ürünü düzenleyin veya silin.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabNext', 'focusMode'],
    article: 'cat-products-variants',
  },

  // Kanıt: views/secure/productDefinitions/CategoryListView.vue,
  //        components/CategoryListComponent.vue, CategorySyncComponent.vue
  'productDefinitions/CategoryListView': {
    purpose:
      'Kategori ağacınızı yönetir ve her kategoriyi pazaryeri ile e-ticaret platformu kategorileriyle eşleştirirsiniz.',
    tips: [
      'Soldaki ağaçtan bir kategorinin ayar düğmesine basınca sağda düzenleme ve eşleştirme panelleri açılır.',
      'Platform kategori eşleştirmesi yalnızca alt kategorisi olmayan (uç) kategorilerde yapılır.',
      'Kategori bağlantısını kaydettikten sonra platform seçeneklerini Seçenek Eşleştir ile eşleştirin.',
      'Otomatik eşleştirme boş uç kategorileri yapay zekâ desteğiyle doldurur; manuel eşleşmeler korunur, sonucu kontrol edin.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/productDefinitions/BrandListView.vue, components/BrandListComponent.vue, BrandSyncComponent.vue
  'productDefinitions/BrandListView': {
    purpose:
      'Markalarınızı tanımlar ve her markayı platformlardaki karşılığıyla eşleştirirsiniz.',
    tips: [
      'Marka adı yazıp ekle düğmesiyle yeni marka tanımlayın.',
      'Listeden bir markanın ayar düğmesine basınca adını düzenleyebilir ve platform markasıyla eşleştirebilirsiniz.',
      'Bazı platformlar marka eşleştirme sunmaz; bu durumda ekran bunu belirtir.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/productDefinitions/ChoiceListView.vue
  'productDefinitions/ChoiceListView': {
    purpose:
      'Renk, beden gibi varyant gruplarınızı ve değerlerini yönetirsiniz. Bu gruplar ürün varyantlarında ve seçenek eşleştirmede kullanılır.',
    tips: [
      'Şablonlar menüsünden hazır Renk, Beden (XXS-5XL) veya Numara grubu ekleyin.',
      'Grup adını ve değerlerini satır içinde düzenleyin; yeni değer eklemek için artı düğmesini kullanın.',
      'Bir grubu silmek kalıcıdır; satırdaki ⋯ menüsünden Grubu sil ile onay istenir.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/productDefinitions/HashtagListView.vue
  'productDefinitions/HashtagListView': {
    purpose:
      'Ürünlerinize atayacağınız etiket gruplarını ve etiketleri yönetirsiniz.',
    tips: [
      'Etiket grubu adı yazıp yeni grup oluşturun; gruba renk seçebilirsiniz.',
      'Grup içindeki etiketleri satır içinde ekleyin, düzenleyin veya silin.',
      'Ürünlere toplu etiket atamak için Ürünler ekranındaki Toplu işlemler menüsünü kullanın.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'cat-products-variants',
  },

  // Kanıt: views/secure/definitions/ProductUpdateView.vue, components/productDefinitions/crud/ProductFormWizardBar.vue
  ProductUpdateView: {
    purpose:
      'Ürün bilgilerini, varyantlarını ve fiyatlarını güncelleyin.',
    tips: [
      'Adım çubuğu her adımdaki eksik alan sayısını gösterir; bir eksiğe tıklayınca ilgili alana gidersiniz.',
      'Varyant adımında kanal bazında fiyat ve pazaryeri özelliklerini düzenleyin.',
      'Değişiklikler Güncelle düğmesine basınca kaydedilir; kanallara göndermek için Ürünler ekranındaki toplu işlemleri kullanın.',
    ],
    shortcuts: ['tabClose', 'tabPrev', 'focusMode'],
    article: 'cat-required-attributes',
  },

  // Kanıt: views/secure/definitions/OrderDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/OrderDefinitionView': {
    purpose:
      'Sipariş tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Gerçek siparişlerinizi Siparişler ekranında görüntüleyip yönetin.',
      'Sipariş durumlarının nasıl ilerlediğini yardım merkezindeki sipariş yaşam döngüsü makalesinde bulabilirsiniz.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'ord-lifecycle',
  },

  // Kanıt: views/secure/definitions/ReturnDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/ReturnDefinitionView': {
    purpose:
      'İade tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Gerçek iade taleplerinizi İade talepleri ekranında yönetin.',
      'İade kararlarının etkisini yardım merkezindeki iadeler makalesinde bulabilirsiniz.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'ord-returns',
  },

  // Kanıt: views/secure/definitions/CustomerDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/CustomerDefinitionView': {
    purpose:
      'Müşteri tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Gerçek müşteri kayıtlarınızı Müşteriler ekranında görüntüleyin.',
      'Kişisel verilerin anonimleştirilmesi Müşteriler ekranındaki müşteri karnesinden yapılır.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'faq-general',
  },

  // Kanıt: views/secure/definitions/InvoiceDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/InvoiceDefinitionView': {
    purpose:
      'Fatura tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Faturalarınızı Faturalar ekranında görüntüleyip manuel fatura ekleyin.',
      'Mağazanızın fatura bilgileri Mağaza Ayarları ekranındaki Fatura & Yasal Bilgiler sekmesinden kaydedilir.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'fin-invoices-reports',
  },

  // Kanıt: views/secure/definitions/ProductDefinitionView.vue, components/productDefinitions/crud/ProductFormWizardBar.vue
  'definitions/ProductDefinitionView': {
    purpose:
      'Kategori, ürün bilgisi, varyant ve detayları adım adım tamamlayın.',
    tips: [
      'Kategori seçilmeden ürün tanımı adımı, ürün başlığı girilmeden varyant ve detay adımları kilitli kalır.',
      'Adım çubuğu her adımdaki eksik alan sayısını gösterir; bir eksiğe tıklayınca ilgili alana gidersiniz.',
      'Varyantlı ürünlerde her varyant için kanal bazında fiyat ve pazaryeri özelliklerini girin.',
      'Kaydettikten sonra ürünü kanallara göndermek için Ürünler ekranındaki Toplu işlemler menüsünü kullanın.',
    ],
    shortcuts: ['tabClose', 'tabPrev', 'focusMode'],
    article: 'gs-first-product-transfer',
  },

  // Kanıt: views/secure/definitions/CategoryDefinitionView.vue, components/CategorySyncComponent.vue
  'definitions/CategoryDefinitionView': {
    purpose:
      'Kategorilerinizi pazaryeri kategorileriyle eşleştirin.',
    tips: [
      'Soldaki ağaçtan bir kategorinin ayar düğmesine basınca sağda eşleştirme paneli açılır.',
      'Platform kategori eşleştirmesi yalnızca alt kategorisi olmayan (uç) kategorilerde yapılır.',
      'Kategori bağlantısını kaydettikten sonra platform seçeneklerini Seçenek Eşleştir ile eşleştirin.',
      'Otomatik eşleştirme yalnızca boş eşleşmeleri doldurur; sonucu kontrol etmeniz önerilir.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/definitions/BrandDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/BrandDefinitionView': {
    purpose:
      'Marka tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Markalarınızı tanımlamak ve platform markalarıyla eşleştirmek için Markalar ekranını kullanın.',
      'Eşleştirme adımlarını yardım merkezindeki eşleştirme makalesinde bulabilirsiniz.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/definitions/OptionDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/OptionDefinitionView': {
    purpose:
      'Seçenek tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Renk, beden gibi varyant gruplarını Varyant grupları ekranında yönetin.',
      'Seçenekleri pazaryeri özellikleriyle Kategoriler ekranındaki Seçenek Eşleştir adımında eşleştirin.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'cat-mapping',
  },

  // Kanıt: views/secure/definitions/HashtagDefinitionView.vue (sabit örnek veri; backend isteği yok)
  'definitions/HashtagDefinitionView': {
    purpose:
      'Etiket tanımları için hazırlanan taslak ekrandır; tablo örnek verilerle gösterilir ve kayıt yapılmaz.',
    tips: [
      'Etiket gruplarınızı ve etiketlerinizi Etiketler ekranında yönetin.',
      'Ürünlere toplu etiket atamak için Ürünler ekranındaki Toplu işlemler menüsünü kullanın.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'cat-products-variants',
  },

  // Kanıt: views/secure/integrations/MarketplaceView.vue, components/integrations/marketplace/*Component.vue,
  //        components/integrations/IntegrationFormFrame.vue
  'integrations/MarketplaceView': {
    purpose:
      'Pazaryeri hesaplarınızı bağlayın ve API ayarlarını buradan yönetin.',
    tips: [
      'Üstteki listeden bir pazaryeri seçin; Api Bilgileri ve Varsayılan Bilgiler sekmeleri açılır.',
      'API kimlik bilgilerinizi pazaryerinin satıcı panelinden edinip Bağlantı bilgileri bölümüne girin ve Kaydet düğmesine basın.',
      'Varsayılan Bilgiler sekmesinde kargo firması, sevkiyat ve iade adresi gibi varsayılanları tanımlayın.',
      'Kodu hazır olmayan pazaryerleri "Yakında" olarak gösterilir; bunlar için kayıt yapılamaz.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'int-channel-connect',
  },

  // Kanıt: views/secure/integrations/ECommerceView.vue, components/integrations/ecommerce/IdeasoftComponent.vue,
  //        components/integrations/IntegrationComingSoonPanel.vue
  'integrations/ECommerceView': {
    purpose:
      'E-ticaret altyapınızı bağlayın ve API ayarlarını buradan yönetin. Bu sürümde canlı bağlantısı olan e-ticaret altyapısı Ideasoft’tur.',
    tips: [
      'Ideasoft için mağaza adı, Client ID ve Client Secret girip Entegrasyona Yetki Ver düğmesiyle yetkilendirme başlatın.',
      'Entegrasyon Durumu çipi yetkilendirmenin tamamlanıp tamamlanmadığını gösterir.',
      'Diğer altyapılar "Yakında" olarak gösterilir; bu sağlayıcılar için kimlik bilgisi alanı yoktur.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'int-channel-connect',
  },

  // Kanıt: views/secure/integrations/ShippingView.vue, components/integrations/IntegrationComingSoonPanel.vue
  'integrations/ShippingView': {
    purpose:
      'Kargo firmalarınızı bağlayın ve ayarlarını buradan yönetin. Kargo firması entegrasyonları henüz "Yakında" durumundadır.',
    tips: [
      'Kargo firmaları için bu sürümde kimlik bilgisi girilemez; Kaydet düğmesi nedeniyle birlikte devre dışıdır.',
      'Daha önce kaydedilmiş ayarlar silinmez.',
      'Pazaryeri siparişlerini kargoya verme işlemi Siparişler ekranından yapılır.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/integrations/EInvoiceView.vue, components/integrations/IntegrationComingSoonPanel.vue
  'integrations/EInvoiceView': {
    purpose:
      'E-fatura sağlayıcınızı seçin ve ayarlarını buradan yönetin. E-fatura sağlayıcı entegrasyonları henüz "Yakında" durumundadır.',
    tips: [
      'E-fatura sağlayıcıları için bu sürümde kimlik bilgisi girilemez ve kayıt yapılamaz.',
      'Faturalarınızı Faturalar ekranında görüntüleyip manuel fatura ekleyebilirsiniz.',
      'Kesilmiş bir faturanın yasal iptali e-Fatura portalınızdan yapılmalıdır.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'int-scope',
  },

  // Kanıt: views/secure/integrations/ErpView.vue, components/integrations/erp/BizimhesapComponent.vue
  'integrations/ErpView': {
    purpose:
      'ERP/muhasebe yazılımınızı bağlayın ve API ayarlarını buradan yönetin. Bu sürümde canlı bağlantısı olan ERP Bizimhesap’tır.',
    tips: [
      'Bizimhesap için anahtar ve gizli anahtarı Bağlantı bilgileri bölümüne girip kaydedin.',
      'Kargo Bilgileri sekmesinde varsayılan desi, ağırlık ve ödeme bilgilerini tanımlayın.',
      'Diğer ERP yazılımları "Yakında" olarak gösterilir; bunlar için kayıt yapılamaz.',
    ],
    shortcuts: ['search', 'tabClose', 'tabNext'],
    article: 'int-channel-connect',
  },

  // Kanıt: views/secure/supports/TicketListView.vue
  'supports/TicketListView': {
    purpose:
      'Destek ekibiyle yazışmalarınızı buradan takip edin ve yeni talep açın.',
    tips: [
      'Yeni Bilet Aç düğmesiyle destek talebi oluşturun.',
      'Durum, öncelik, talep tipi ve tarih aralığı filtreleriyle taleplerinizi bulun.',
      'Satırdaki ⋯ menüsünden yazışmayı görüntüleyip yanıtlayın veya talebi kapatın.',
      'Birden çok talebi seçip Toplu Kapat ile kapatabilirsiniz.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'support-ticket',
  },

  // Kanıt: views/secure/user/InvoiceInfoView.vue (alanlar forma bağlı değil, kaydet düğmesi yok)
  'user/InvoiceInfoView': {
    purpose:
      'Fatura bilgileri için hazırlanan taslak ekrandır; bu ekrandaki alanlar kaydedilmez.',
    tips: [
      'Mağazanızın fatura bilgilerini Mağaza Ayarları ekranındaki Fatura & Yasal Bilgiler sekmesinden kaydedin.',
      'Abonelik planınızı ve durumunu Abonelik ve Planlar ekranında görebilirsiniz.',
      'Aradığınız ekranı bulmak için akıllı aramayı (Ctrl+K) kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'acc-subscription',
  },

  // Kanıt: views/secure/user/ChangePasswordView.vue (kaydet düğmesi yok), views/secure/user/AccountSecurityView.vue
  'user/ChangePasswordView': {
    purpose:
      'Bu eski parola ekranında kayıt yapılmaz; parolanızı Hesabım ve güvenlik ekranından değiştirin.',
    tips: [
      'Hesabım ve güvenlik ekranı mevcut parolanızı doğrulayarak yeni parolayı kaydeder.',
      'Parola değiştiğinde bu cihaz dışındaki oturumlarınız kapatılır.',
      'Parolanızı unuttuysanız giriş ekranındaki parola sıfırlama akışını kullanın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'acc-password',
  },

  // Kanıt: views/secure/user/SubscriptionView.vue, composables/subscriptionStatus.ts
  'user/SubscriptionView': {
    purpose:
      'İşletmenize uygun planı seçin, mevcut aboneliğinizin durumunu buradan izleyin.',
    tips: [
      'Üstteki durum bandı aboneliğinizin güncel durumunu (deneme, aktif, ödeme sorunu, askı veya bitiş) ve ne anlama geldiğini açıklar.',
      'Plan kartlarında kanal, varyant (SKU), kullanıcı ve günlük MCP çağrısı limitleri yer alır.',
      'Bu Plana Geç düğmesi onay sonrası ödeme adımını başlatır; durum, ödeme sağlayıcısından onay gelince güncellenir.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'acc-subscription',
  },

  // Kanıt: stores/site/menu.ts ('user/EducationView' → views/secure/user/SubscriptionView.vue), composables/subscriptionStatus.ts
  'user/EducationView': {
    purpose:
      'Bu menü öğesi şu an Abonelik ve Planlar ekranını açar. İşletmenize uygun planı seçin, mevcut aboneliğinizin durumunu buradan izleyin.',
    tips: [
      'Üstteki durum bandı aboneliğinizin güncel durumunu ve ne anlama geldiğini açıklar.',
      'Plan kartlarında kanal, varyant (SKU), kullanıcı ve günlük MCP çağrısı limitleri yer alır.',
      'Uygulamayı öğrenmek için yardım merkezindeki Başlarken makalelerine göz atın.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'gs-account',
  },

  // Kanıt: views/secure/user/ExitView.vue (işlevsiz ekran), components/layout/ApplicationBar.vue (hesap menüsü → Çıkış)
  'user/ExitView': {
    purpose:
      'Bu ekran bir işlem yapmaz; oturumu kapatmak için üst çubuktaki hesap menüsünden Çıkış seçeneğini kullanın.',
    tips: [
      'Hesap menüsü üst çubuğun sağındadır; Ayarlar ve Klavye kısayolları da buradadır.',
      'Açık sekmelerinizi kapatmak için sekme üzerindeki kapat düğmesini kullanın.',
      'Klavye kısayollarının tam listesini ? tuşuyla açabilirsiniz.',
    ],
    shortcuts: ['tabClose', 'shortcutHelp'],
    article: 'app-menu',
  },

  // Kanıt: views/secure/user/AuthorizationListView.vue
  AuthorizationListView: {
    purpose:
      'Mağazanıza erişimi olan personeli ve yetki gruplarını yönetin.',
    tips: [
      'Yeni personel düğmesiyle ekibinize kullanıcı ekleyin.',
      'Yetki grubu filtresiyle belirli roldeki personeli listeleyin.',
      'Satırdaki ⋯ menüsünden personeli düzenleyin veya silin; mağaza yöneticisi silinemez.',
      'Silinen personel sisteme artık giriş yapamaz; bu işlem geri alınamaz.',
    ],
    shortcuts: ['search', 'pageRefresh', 'tabClose'],
    article: 'acc-users',
  },

  // Kanıt: views/secure/NotificationCenterView.vue
  NotificationCenterView: {
    purpose:
      'Toplu işlem, aktarım, sipariş ve stok bildirimleriniz. Bildirimler oluşturulduktan 3 gün sonra otomatik silinir.',
    tips: [
      'Stok uyarıları ve sistem bildirimleri "Dikkat" işaretiyle listenin en üstünde tutulur.',
      'Tür ve okunma durumu filtreleriyle listeyi daraltın.',
      'Seçtiğiniz bildirimleri okundu işaretleyin veya silin; Tümünü okundu işaretle hepsini tek seferde işaretler.',
      'Açtığınız bildirim okundu sayılır; uygulama içi bağlantısı varsa Görüntüle ilgili ekrana götürür.',
    ],
    shortcuts: ['pageRefresh', 'search', 'tabClose'],
    article: 'app-notifications',
  },

  // Kanıt: views/secure/settings/NotificationPreferencesView.vue (birleşim tamamlaması: fe-help c2a'dan önce yazıldı)
  NotificationPreferencesView: {
    purpose:
      'Hangi bildirimleri uygulama içinde ve e-postayla alacağınızı kategori bazında seçin; tercihler yalnız sizin hesabınız içindir.',
    tips: [
      'Kilit simgeli (zorunlu) kategoriler güvenlik ve hesap sürekliliği için kapatılamaz.',
      'E-posta için Kapalı, Anında veya Özet seçin; özet saati yalnız Özet seçili kategori varsa etkindir.',
      'Sessiz saatlerde anında e-postalar aralığın sonuna ertelenir.',
      'Değişiklikler alttaki Kaydet düğmesine basana kadar uygulanmaz; Vazgeç hepsini geri alır.',
    ],
    shortcuts: ['tabClose'],
    article: 'app-notifications',
  },

  // Kanıt: views/secure/integrations/IntegrationHealthView.vue
  'integrations/IntegrationHealthView': {
    purpose:
      'Bağlı pazaryeri ve sistemlerinizin son 24 saatteki çağrı sonuçları, son hata ve bağlantı durumu.',
    tips: [
      'Durum, entegrasyonların gerçek çağrı ölçümlerinden türetilir; bu ekran pazaryerine test isteği göndermez.',
      'Her kartta kimlik bilgisi, son başarılı senkron, devre kesici durumu ve hata kodlarına göre dağılım görünür.',
      'Devre kesicisi açık olan entegrasyonda çağrılar geçici olarak durdurulmuştur.',
      'Karttaki ayarlarını aç bağlantısı ilgili entegrasyonun ayar ekranına götürür.',
    ],
    shortcuts: ['pageRefresh', 'search', 'tabClose'],
    article: 'int-health',
  },

  // Kanıt: views/secure/settings/AuditLogView.vue
  AuditLogView: {
    purpose:
      'Mağazanızda kimin, ne zaman, hangi işlemi yaptığını inceleyin. Kayıtlar yalnızca okunabilir.',
    tips: [
      'Varsayılan olarak son 30 gün gösterilir; hazır tarih aralıklarıyla hızlıca değiştirin.',
      'Olay veya olay grubu, kullanıcı ve sonuç filtreleriyle kayıtları daraltın.',
      'Tarih aralığı en fazla 366 gün olabilir; en yeni kayıt üsttedir.',
      'Bir satırı açınca kayda eklenen ayrıntılar yan panelde görünür.',
    ],
    shortcuts: ['search', 'tabClose', 'focusMode'],
    article: 'acc-users',
  },

  // Kanıt: views/secure/user/AccountSecurityView.vue
  AccountSecurityView: {
    purpose:
      'Hesap bilgileriniz, e-posta doğrulamanız ve parolanız.',
    tips: [
      'Ad ve e-posta, yetkili bir yönetici tarafından Yetkilendirme ekranından güncellenir.',
      'E-posta doğrulama bağlantısı 24 saat geçerlidir; gelen kutunuzu ve istenmeyen klasörünü kontrol edin.',
      'Parolanızı değiştirdiğinizde bu cihaz dışındaki oturumlarınız kapatılır ve e-posta ile bilgilendirilirsiniz.',
      'Parola kuralları siz yazarken tek tek karşılanıp karşılanmadığını gösterir.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'acc-password',
  },

  // Kanıt: views/secure/user/PrivacyDataView.vue, composables/useTenantDataApi.ts
  PrivacyDataView: {
    purpose:
      'Mağaza verilerinizin bir kopyasını alın ve kişisel verilerin işlenmesine ilişkin belgeleri inceleyin.',
    tips: [
      'Dışa aktarma ve mağaza silme talebi yalnızca mağaza sahibi tarafından yapılabilir.',
      'Dışa aktarma arşivi ZIP olarak hazırlanır; indirme bağlantısı 24 saat geçerli ve tek kullanımlıktır.',
      'Parolalar ve pazaryeri API anahtarları arşive eklenmez.',
      'Silme talebinden sonra mağaza 30 gün askıda kalır; bu sürede geri alma yalnızca destek ekibi üzerinden yapılır.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'acc-privacy',
  },

  // Kanıt: views/secure/integrations/StockPolicyView.vue, composables/useStockPolicyApi.ts
  StockPolicyView: {
    purpose:
      'Aynı stoğun birden fazla pazaryerinde satıldığı durumlarda aşırı satışı önleyen tampon ve telafi kuralları.',
    tips: [
      'Birincil kanalda son adetler satılır; diğer kanallara tampon düşülerek daha az stok yayınlanır.',
      'Boş bıraktığınız alanlarda varsayılan değer kullanılır; alan içindeki ipucu varsayılanı gösterir.',
      'Her kanal kartındaki örnek, girdiğiniz değerlerle o kanala kaç adet yayınlanacağını hesaplar.',
      'Otomatik iptal desteklenmeyen pazaryerlerinde aşırı satışta size görev düşer.',
      'Bu ekranı yalnızca mağaza sahibi ve yöneticiler görüntüleyip değiştirebilir.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'stock-channel-policy',
  },

  // Kanıt: views/secure/StockHealthView.vue
  StockHealthView: {
    purpose:
      'Açıkta kalan sipariş kalemleri ve varyant stok dengesi. Aşırı satış ve eşleşmeyen kalemleri buradan takip edersiniz.',
    tips: [
      'Göstergeler açık aşırı satışı, eşleşmeyen kalemleri, kullanılabilir stoğu ve yayın bekleyen stok değişikliklerini özetler.',
      'Dikkat gerektiren siparişler listesinden bir siparişi sipariş listesinde açın veya Siparişlerde filtrele ile tümünü görün.',
      'Eşleşmeyen kalemde stok ayrılamaz; stok kodunu veya barkodu kontrol edin.',
      'Stok durumları açıklaması rezerve, kesinleşen, serbest bırakılan ve aşırı satılan kalemlerin anlamını verir.',
    ],
    shortcuts: ['pageRefresh', 'search', 'tabClose'],
    article: 'stock-health',
  },

  // Kanıt: help/types.ts (HelpArticle.keywords / HelpGoTo), stores/site/menu.ts (ekran açma), supports/TicketListView.vue
  HelpCenterView: {
    purpose:
      'Sorularınızın yanıtını bulun: yardım makalelerinde arayın veya kategorilere göz atın.',
    tips: [
      'Arama kutusuna sorunuzu yazın; makale başlıkları, özetleri, anahtar sözcükleri ve metinleri aranır.',
      'Makaleler Başlarken, Ürünler ve katalog, Stok, Sipariş ve iade, Entegrasyonlar gibi kategorilere göre gruplanır.',
      'Makaledeki "Buraya git" bağlantısı ilgili ekranı çalışma alanında yeni sekme olarak açar.',
      'Makalenin sonundaki "Faydalı mıydı?" sorusunu yanıtlayın; yanıtınız bu tarayıcıda hatırlanır.',
      'Yanıt bulamazsanız Destek Talepleri ekranından destek ekibine talep açın.',
    ],
    shortcuts: ['search', 'shortcutHelp', 'tabClose'],
    article: 'app-page-help',
  },

  // ADR-0034 / CHAT_UI_CONTRACT §7.1 — tam sayfa sohbet ve ayarları (ad tek sabitten, K39).
  // Kanıt: views/secure/OtopilotView.vue, packages/chat/src/components/{ChatComposer,parts/PartConfirm,parts/PartTable}.vue
  chat: {
    purpose: `${CHAT_PRODUCT.name} ile siparişleri, stokları ve satışları sorarak işinizi yürütün; yapılacak her değişiklik önce onayınıza gelir.`,
    tips: [
      'Enter mesajı gönderir, Shift+Enter yeni satır açar; yanıt sürerken Durdur ile kesebilirsiniz.',
      'Onay kartında ne olacağı, etkilenen kayıtlar ve risk yazar; Onayla ya da Reddet seçmeden hiçbir değişiklik yapılmaz.',
      'Tablolarda Daha fazla göster ile satır ekleyin, Ekranda aç ile ilgili listeye geçin.',
      'Sohbetler kaydedilmez; oturum kapanınca silinir. Yeni sohbet düğmesi konuşmayı sıfırlar.',
    ],
    shortcuts: ['search', 'tabClose'],
    article: 'app-page-help',
  },
  // Kanıt: views/secure/settings/OtopilotSettingsView.vue (description = paket i18n `entry.settingsDescription`),
  // packages/chat/src/components/ChatProviderSetup.vue
  OtopilotSettingsView: {
    purpose: `${CHAT_PRODUCT.name}'un kullanacağı yapay zekâ sağlayıcısını, modeli ve API anahtarını yönetin; veri aktarım onayını ve bilgi amaçlı kullanım sayılarını görün.`,
    tips: [
      'Bağlantıyı test et ile anahtarı kaydetmeden önce sınayın; kayıtta anahtar yeniden sınanır.',
      'Kayıtlı anahtar hiçbir yerde geri gösterilmez; değiştirmek için Değiştir ile yenisini girin.',
      'Sohbetin açılması için hesap sahibinin veri aktarım bilgilendirmesini onaylaması gerekir.',
      'Kullanım sayıları yalnız bilgi amaçlıdır; ücret sağlayıcınızın hesabına yansır.',
    ],
    shortcuts: ['tabClose'],
    article: 'app-page-help',
  },
}

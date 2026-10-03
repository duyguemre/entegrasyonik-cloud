/**
 * frontend/src/help/content/tr/articles.ts — Yardım merkezi makaleleri (Türkçe, tam gövde).
 *
 * İÇERİK KURALI (help/types.ts): yalnız uygulamada GERÇEKTEN var olan özellik anlatılır. Her makalenin üstündeki
 * `// Kanıt:` satırı, anlatılan davranışın doğrulandığı dosyaları listeler. Kısayol tuşları yalnız `shortcuts`
 * bloğunda (navigation/shortcuts.ts'ten otomatik) görünür; makale metinlerine elle tuş yazılmaz.
 */
import type { HelpArticle } from '../../types'

export const ARTICLES_TR: HelpArticle[] = [
  // ───────────────────────────── Başlarken ─────────────────────────────

  // Kanıt: frontend/src/components/login/LoginComponent.vue (sekmeler: giriş/kayıt/şifremi unuttum, güvenlik kodu, "Yönetilecek Mağazayı Seçin"),
  //        frontend/src/views/unsecure/ResetPasswordView.vue, frontend/src/views/unsecure/VerifyEmailView.vue,
  //        frontend/src/views/secure/user/AccountSecurityView.vue, frontend/src/plugins/locales/tr.json (accountSecurity.verify),
  //        docs/API_ACCOUNT_LIFECYCLE.md (sıfırlama bağlantısı 30 dk, doğrulama bağlantısı 24 saat, doğrulanmamış hesap girişten engellenmez)
  {
    id: 'gs-account',
    category: 'getting-started',
    order: 1,
    title: 'Hesabınız ve ilk giriş',
    summary: 'Hesap oluşturma, giriş yapma, mağaza seçimi, e-posta doğrulama ve parola sıfırlama adımları.',
    keywords: ['giriş', 'kayıt', 'hesap oluştur', 'mağaza seç', 'e-posta doğrulama', 'şifremi unuttum', 'parolamı unuttum', 'parola sıfırlama', 'login'],
    body: [
      { type: 'p', text: 'Entegrasyonik giriş ekranında iki sekme bulunur: **Giriş** ve **Kayıt**. Parolanızı unuttuysanız parola alanının altındaki **Parolanızı mı unuttunuz?** bağlantısını kullanın. Hesabınız bir mağazaya (işletmeye) bağlıdır; birden fazla mağazaya erişiminiz varsa girişten sonra hangisini yöneteceğinizi seçersiniz.' },
      { type: 'h', text: 'Hesap oluşturma' },
      {
        type: 'steps',
        items: [
          'Giriş ekranında **Kayıt** sekmesini açın.',
          'Ad, soyad, e-posta ve parolanızı girin; parolayı ikinci alana tekrar yazın.',
          'Kullanım Koşulları, Abonelik Sözleşmesi ve Ön Bilgilendirme Formu onay kutusunu işaretleyip kaydı tamamlayın.',
          'Tanıtım sitesinden bir plan seçerek geldiyseniz kayıttan sonra **Abonelik ve planlar** ekranı o plan seçili olarak açılır.',
        ],
      },
      { type: 'h', text: 'Giriş ve mağaza seçimi' },
      {
        type: 'steps',
        items: [
          'E-posta ve parolanızla giriş yapın.',
          'Ekranda **Güvenlik kodu** alanı görünürse kutudaki kodu yazın; kod okunmuyorsa yenileme düğmesiyle yeni kod alın.',
          'Birden fazla mağazanız varsa **Yönetilecek Mağazayı Seçin** listesinden mağazanızı seçin (liste içinde arama yapabilirsiniz).',
        ],
      },
      { type: 'h', text: 'E-posta doğrulama' },
      { type: 'p', text: 'Kayıttan sonra e-posta adresinize bir doğrulama bağlantısı gönderilir. Bağlantı **24 saat** geçerlidir. Doğrulama durumunuzu **Hesabım ve güvenlik** ekranındaki **E-posta doğrulaması** bölümünde görürsünüz; bağlantı size ulaşmadıysa aynı bölümdeki **Doğrulama bağlantısını gönder** düğmesini kullanın.' },
      { type: 'note', tone: 'info', text: 'Doğrulanmamış bir hesap bugün girişten engellenmez; ancak parola sıfırlama ve güvenlik bildirimlerinin size ulaşması için adresinizi doğrulamanız önerilir.' },
      { type: 'h', text: 'Parolanızı unuttuysanız' },
      {
        type: 'steps',
        items: [
          'Giriş ekranında parola alanının altındaki **Parolanızı mı unuttunuz?** bağlantısına tıklayın ve e-posta adresinizi girin.',
          'Gelen e-postadaki bağlantıyı açın ve yeni parolanızı belirleyin. Bağlantı **30 dakika** geçerlidir ve tek kullanımlıktır.',
          'Yeni parolanızla giriş yapın. Parola sıfırlandığında açık olan tüm oturumlarınız kapanır.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Güvenlik gereği ekran, e-posta adresinin kayıtlı olup olmadığını söylemez; mesaj her durumda aynıdır. E-posta gelmediyse istenmeyen klasörünü kontrol edin.' },
    ],
    goTo: [{ screen: 'AccountSecurityView', label: 'Hesabım ve güvenlik ekranını aç' }],
    related: ['acc-password', 'gs-first-integration', 'acc-subscription', 'ts-common'],
  },

  // Kanıt: frontend/src/views/secure/integrations/MarketplaceView.vue (Hızlı başlangıç rehberi, IntegrationPlatformRail, IntegrationCapabilityChips),
  //        frontend/src/components/integrations/marketplace/TrendyolComponent.vue (sekmeler "API Bilgileri"/"Varsayılan Bilgiler", "Entegrasyon durumu"),
  //        frontend/src/components/integrations/IntegrationFormFrame.vue (Kaydet), site/src/data/connect.ts (COMMON_STEPS/WHERE),
  //        frontend/src/help/channels.ts, frontend/src/plugins/locales/tr.json (integrationCoverage)
  {
    id: 'gs-first-integration',
    category: 'getting-started',
    order: 2,
    title: 'İlk entegrasyonu bağlama',
    summary: 'Bir pazaryerini, e-ticaret sitenizi veya ERP hesabınızı API bilgileriyle Entegrasyonik’e bağlayın.',
    keywords: ['entegrasyon bağla', 'api anahtarı', 'pazaryeri bağlama', 'trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap', 'kurulum'],
    body: [
      { type: 'p', text: 'Ürün, stok ve siparişlerinizin Entegrasyonik üzerinden akabilmesi için önce en az bir satış kanalını bağlamanız gerekir. Bağlantı, kanalın satıcı panelinden alacağınız API kimlik bilgileriyle kurulur. Bugün bağlanabilen kanallar: Trendyol, Hepsiburada, N11 ve Pazarama (pazaryeri), Ideasoft (e-ticaret, test ortamında) ve Bizimhesap (ERP).' },
      {
        type: 'steps',
        items: [
          'İlgili kanalın satıcı veya mağaza panelinden API kimlik bilgilerinizi edinin. Hangi bilgilerin gerektiği **Kanal bağlantı adımları** makalesindeki tabloda yer alır.',
          'Sol menüden **Entegrasyonlar** bölümünü ve kanal türünü (Pazaryeri, E-Ticaret veya ERP) açın.',
          'Üstteki kanal simgelerinden bağlayacağınız kanalı seçin.',
          '**API Bilgileri** sekmesinde kimlik bilgilerini girin ve **Entegrasyon durumu** anahtarını açın.',
          '**Varsayılan Bilgiler** sekmesinde kargo firması, kargo süresi, sevkiyat ve iade adresi gibi kanalın istediği varsayılanları doldurun.',
          '**Kaydet**’e basın. Eksik bir alan varsa ekran hangi bilginin gerektiğini belirtir.',
        ],
      },
      { type: 'p', text: 'Kayıttan sonra aynı ekranda **Bu kanalda neler çalışır** bölümü görünür. Burada ürün aktarımı, stok ve fiyat, sipariş çekme, iadeler gibi yeteneklerin o kanalda desteklenip desteklenmediğini veya sınırlı olduğunu görebilirsiniz.' },
      { type: 'note', tone: 'warning', text: 'API bilgileriniz şifreli saklanır ve kaydedildikten sonra açık metin olarak gösterilmez. Kanal panelinde anahtarınızı yenilerseniz yeni bilgiyi Entegrasyonik’e de girmeniz gerekir; aksi halde istekler reddedilir.' },
      { type: 'note', tone: 'info', text: 'Bağlantının çalışıp çalışmadığını **Entegrasyon sağlığı** ekranından izleyebilirsiniz. Bu ekran pazaryerine test isteği göndermez; gerçek çağrıların sonuçlarını gösterir.' },
    ],
    goTo: [
      { screen: 'integrations/MarketplaceView', label: 'Pazaryeri entegrasyonlarını aç' },
      { screen: 'integrations/IntegrationHealthView', label: 'Entegrasyon sağlığı ekranını aç' },
    ],
    related: ['int-channel-connect', 'int-scope', 'gs-first-product-transfer', 'int-health'],
  },

  // Kanıt: frontend/src/views/secure/productDefinitions/ProductListView.vue ("Yeni ürün", "Toplu işlemler", Platform durumu sütunu, platformAriaLabel),
  //        frontend/src/components/productDefinitions/products/BatchActions/subcomponents/BatchActionMenu.vue ("Kanallara yükle", "Platformdan Ürün Yükle"),
  //        frontend/src/components/productDefinitions/products/BatchActions/subcomponents/BatchProcessDialog.vue (Kapsam: Seçilenler/Filtrelenmiş/Tüm Katalog),
  //        frontend/src/components/productDefinitions/crud/ProductFormWizardBar.vue (adımlar), frontend/src/components/CategorySyncComponent.vue,
  //        frontend/src/components/logListView/DetailedExportLogReport.vue (gönderim adımları), frontend/src/views/secure/LogListView.vue
  {
    id: 'gs-first-product-transfer',
    category: 'getting-started',
    order: 3,
    title: 'İlk ürün aktarımı',
    summary: 'Ürün oluşturun veya pazaryerinden çekin, eşlemeleri tamamlayın ve ürünü pazaryerine gönderin.',
    keywords: ['ürün gönder', 'ürün yükle', 'aktarım', 'platformlara yükle', 'ürün çek', 'içe aktar', 'transfer'],
    body: [
      { type: 'p', text: 'Ürün aktarımı iki yönde çalışır: Entegrasyonik’teki ürünlerinizi pazaryerine **gönderebilir** ya da pazaryerinde zaten satışta olan ürünlerinizi Entegrasyonik’e **çekebilirsiniz**. Gönderim otomatik başlamaz; ürün listesindeki **Toplu işlemler** menüsünden sizin başlatmanız gerekir.' },
      { type: 'h', text: '1. Ürünü hazırlayın' },
      {
        type: 'steps',
        items: [
          '**Ürünler** ekranında **Yeni ürün**’e basın. Form dört adımdan oluşur: Kategori Seçimi, Ürün Tanımı, Varyant (veya Tekil Ürün) Bilgileri ve Detay Bilgiler.',
          'Kategori, marka, başlık, stok kodu, barkod, fiyat ve stok bilgilerini girin. Formun üstündeki **Zorunlu bilgiler** göstergesi eksik alanları listeler.',
          'Ya da pazaryerindeki ürünlerinizi getirmek için **Toplu işlemler > Platformdan Ürün Yükle**’yi seçip kanalı belirleyin.',
        ],
      },
      { type: 'h', text: '2. Eşlemeleri tamamlayın' },
      { type: 'p', text: 'Pazaryeri, ürünü kendi kategori, marka ve özellik tanımlarıyla ister. Kategorinizi **Kategoriler** ekranında, markanızı **Markalar** ekranında ilgili kanalın karşılığıyla eşleyin; kanalın zorunlu özelliklerini ürün formunda doldurun.' },
      { type: 'h', text: '3. Pazaryerine gönderin' },
      {
        type: 'steps',
        items: [
          '**Ürünler** ekranında göndereceğiniz ürünleri seçin.',
          '**Toplu işlemler > Kanallara yükle**’yi seçin.',
          'Kapsamı belirleyin: **Seçilenler**, **Filtrelenmiş** (mevcut filtre sonucunun tamamı) veya **Tüm Katalog**.',
          'Hedef kanalları işaretleyip işlemi onaylayın.',
          'İlerlemeyi **İşlem kayıtları** ekranından izleyin: Kuyrukta → Ürün Doğrulanıyor → İşlem Pazaryerine Gönderiliyor → Gönderim Sorgulanıyor → Ürün Onayı Bekleniyor → Tamamlandı.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Varyantsız ürünlerde **Platform durumu** sütunundaki kanal simgesi ürünün o kanala yüklenip yüklenmediğini ve “gönderime hazır” işaretini gösterir; simgeye tıklayarak hazır işaretini değiştirebilirsiniz.' },
      { type: 'note', tone: 'warning', text: 'Pazaryerinin ürünü onaylaması kanalın kendi sürecidir ve zaman alabilir. Gönderim hatalı biterse ayrıntıyı işlem kaydında görebilirsiniz.' },
    ],
    goTo: [
      { screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' },
      { screen: 'LogListView', label: 'İşlem kayıtları ekranını aç' },
    ],
    related: ['cat-mapping', 'cat-required-attributes', 'ts-product-not-sent', 'cat-products-variants'],
  },

  // ───────────────────────────── Uygulama kullanımı ─────────────────────────────

  // Kanıt: frontend/src/components/layout/NavigationMenu.vue (favori yıldızı, "Kenar menüyü daralt"), frontend/src/components/layout/NavigationRail.vue,
  //        frontend/src/components/layout/useShellMenu.ts (bölümler; favoriler grubu kenar menüsünde listelenmez), frontend/src/navigation/shortcuts.ts (sidebarToggle, focusMode, headerToggle),
  //        frontend/src/stores/site/menu.ts (addFavorite/deleteFavorite)
  {
    id: 'app-menu',
    category: 'using-the-app',
    order: 1,
    title: 'Menü ve gezinme',
    summary: 'Sol menüyü kullanma, daraltma, favori işaretleme ve ekran alanını genişletme.',
    keywords: ['sol menü', 'kenar menü', 'daralt', 'ray', 'favori', 'yıldız', 'odak modu', 'tam ekran', 'üst bölüm'],
    body: [
      { type: 'p', text: 'Sol menü ekranları bölümler halinde gruplar (ör. Siparişler, Katalog, Entegrasyonlar, Finans). Bir ekranı seçtiğinizde çalışma alanında bir sekme olarak açılır; etkin ekran menüde vurgulanır ve grubu kendiliğinden açık kalır.' },
      {
        type: 'list',
        items: [
          '**Daraltma:** Menünün altındaki **Daralt** düğmesiyle menüyü yalnız simgelerin göründüğü dar bir şeride (ray) indirebilirsiniz. Şeritteki simgenin üzerine geldiğinizde ekranın adı görünür; genişletme düğmesiyle menüyü geri açarsınız.',
          '**Favori:** Menü öğelerinin sağındaki yıldız ile bir ekranı favori olarak işaretleyebilir veya işareti kaldırabilirsiniz. İşaretli öğede yıldız dolu görünür.',
          '**Tablet ve telefon:** Dar ekranlarda menü bir çekmece olarak açılır ve seçim yaptıktan sonra kendiliğinden kapanır.',
          '**Daha fazla alan:** Üst bölümü daraltabilir veya odak moduna geçerek üst barı ve sol menüyü birlikte gizleyebilirsiniz.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Menüyü daraltma, üst bölümü gizleme ve odak modu için klavye kısayolları vardır; tuşları **Klavye kısayolları** makalesindeki kısayollar tablosunda bulabilirsiniz.' },
      { type: 'note', tone: 'info', text: 'Menüde yalnız hesabınızın erişebildiği ekranlar görünür. Aradığınız ekran yoksa mağaza yöneticinizden yetki isteyin.' },
    ],
    goTo: [{ screen: 'DashboardView', label: 'Genel bakış ekranını aç' }],
    related: ['app-workspace-tabs', 'app-search', 'app-shortcuts', 'acc-users'],
  },

  // Kanıt: frontend/src/components/layout/ShellSearch.vue (Son açılanlar, Ekranlar, SmartService/unifiedSearch → Siparişler/Ürünler/Müşteriler/İadeler ve talepler, ≥2 karakter, 10'ar kayıt),
  //        frontend/src/navigation/shortcuts.ts (search: allowInEditable)
  {
    id: 'app-search',
    category: 'using-the-app',
    order: 2,
    title: 'Akıllı arama',
    summary: 'Üst bardaki akıllı arama ile ekranlara, siparişlere, ürünlere, müşterilere ve iade taleplerine hızla ulaşın.',
    keywords: ['arama', 'akıllı arama', 'komut paleti', 'hızlı erişim', 'sipariş ara', 'ürün ara', 'müşteri ara'],
    body: [
      { type: 'p', text: 'Üst bardaki **Akıllı arama** alanı hem ekranlar arasında gezinmenizi hem de kayıt aramanızı sağlar. Alana klavye kısayoluyla da odaklanabilirsiniz; kısayol bir metin alanına yazarken bile çalışır.' },
      {
        type: 'list',
        items: [
          '**Son açılanlar:** Arama kutusu boşken bu oturumda açtığınız ekranlar listelenir.',
          '**Ekranlar:** Yazmaya başladığınızda menüde erişebildiğiniz ekranlar anında süzülür.',
          '**Kayıtlar:** En az 2 karakter yazdığınızda **Siparişler**, **Ürünler**, **Müşteriler** ve **İadeler ve talepler** grupları sunucudan getirilir. Her grupta en fazla 10 sonuç gösterilir.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Akıllı arama alanına tıklayın veya kısayolu kullanın.',
          'Sipariş numarası, ürün adı, müşteri adı ya da ekran adı yazın.',
          'Ok tuşlarıyla sonuç seçip Enter’a basın. İlgili liste bir sekmede açılır ve arama değeriniz o listeye uygulanır.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Aradığınız kayıt görünmüyorsa daha ayırt edici bir değer (ör. tam sipariş numarası) deneyin; her grupta yalnız ilk 10 sonuç gösterilir.' },
    ],
    related: ['app-workspace-tabs', 'app-shortcuts', 'app-filters-views'],
  },

  // Kanıt: frontend/src/components/ds/EkWorkspaceTabs.vue (sağ tık menüsü, orta tık kapatır, kesilen başlıkta ipucu, taşma okları),
  //        frontend/src/components/layout/ShellTabStrip.vue (Kapat/Diğerlerini kapat/Sağdakileri kapat, Açık sekmeler listesi, Tümünü kapat),
  //        frontend/src/stores/workspace.ts (sessionStorage persist, isPinnedLink: pano sekmesi kapatılamaz, kayıtlı ekranların URL'si), frontend/src/navigation/shortcuts.ts
  {
    id: 'app-workspace-tabs',
    category: 'using-the-app',
    order: 3,
    title: 'Çalışma alanı sekmeleri',
    summary: 'Birden fazla ekranı sekmelerde açık tutun, aralarında geçiş yapın ve toplu kapatın.',
    keywords: ['sekme', 'sekmeler', 'çoklu ekran', 'sekme kapat', 'açık sekmeler', 'çalışma alanı'],
    body: [
      { type: 'p', text: 'Açtığınız her ekran, üst bardaki sekme şeridinde ayrı bir sekme olarak kalır. Böylece örneğin siparişler ile ürünler arasında, filtrelerinizi kaybetmeden geçiş yapabilirsiniz. Genel bakış (pano) sekmesi sabittir ve kapatılamaz.' },
      {
        type: 'list',
        items: [
          '**Geçiş:** Sekmeye tıklayın. Sekme şeridine odaklandığınızda ok tuşlarıyla sekmeler arasında dolaşabilirsiniz.',
          '**Kapatma:** Sekmenin çarpı düğmesine tıklayın veya sekmeye farenin orta tuşuyla tıklayın.',
          '**Sağ tık menüsü:** Bir sekmeye sağ tıklayarak **Kapat**, **Diğerlerini kapat** veya **Sağdakileri kapat** komutlarını kullanın.',
          '**Açık sekmeler listesi:** Şeridin sonundaki liste düğmesi tüm açık sekmeleri gösterir; buradan bir sekmeye geçebilir veya **Tümünü kapat** diyebilirsiniz.',
          '**Uzun başlıklar:** Kesilen başlığın tamamı, üzerine geldiğinizde ipucu olarak görünür. Sekme sayısı şeride sığmazsa kenarlarda kaydırma okları çıkar.',
        ],
      },
      { type: 'p', text: 'Açık sekmeleriniz bu tarayıcı sekmesinde sayfayı yenilediğinizde geri yüklenir. Siparişler, iadeler, ürünler gibi kayıtlı ekranların adresi tarayıcı adres çubuğuna yansır; bu adresi yer imi olarak saklayabilir, tarayıcının geri/ileri düğmelerini kullanabilirsiniz.' },
      { type: 'note', tone: 'info', text: 'Sonraki/önceki sekmeye geçmek, belirli sıradaki sekmeye atlamak ve etkin sekmeyi kapatmak için kısayollar vardır; tuşlar kısayollar tablosundadır. Çıkış yaptığınızda kayıtlı sekme düzeni silinir.' },
    ],
    related: ['app-context-menu', 'app-shortcuts', 'app-menu'],
  },

  // Kanıt: frontend/src/navigation/shortcuts.ts (kayıt defteri; metin alanı kuralı, tarayıcı kısayollarının ezilmemesi),
  //        frontend/src/components/layout/ShortcutHelpDialog.vue, frontend/src/components/layout/ApplicationBar.vue (Yardım ve Hesap menüsünde "Klavye kısayolları"),
  //        frontend/src/help/autoBlocks.ts (shortcuts bloğu otomatik üretilir)
  {
    id: 'app-shortcuts',
    category: 'using-the-app',
    order: 4,
    title: 'Klavye kısayolları',
    summary: 'Uygulamadaki tüm klavye kısayolları ve metin alanında çalışma kuralları.',
    keywords: ['kısayol', 'klavye', 'tuş', 'hotkey', 'shortcut'],
    body: [
      { type: 'p', text: 'Aşağıdaki tablo uygulamanın kullandığı kısayolların tamamını gösterir. Tablo, uygulamanın kısayol kayıtlarından otomatik oluşturulur; bu yüzden her zaman güncel tuşları gösterir.' },
      { type: 'shortcuts' },
      { type: 'h', text: 'Bilmeniz gerekenler' },
      {
        type: 'list',
        items: [
          'Bir metin alanına yazarken çoğu kısayol devre dışıdır; böylece yazdığınız karakterler ve metin içi gezinme bozulmaz. Tabloda metin alanında da çalıştığı belirtilen kısayollar bu durumun istisnasıdır.',
          'Tarayıcının ve işletim sisteminin kendi kısayolları (sekme kapatma, geri/ileri, sayfa yenileme gibi) ezilmez. Bu nedenle uygulamadaki sekme kapatma ve sayfa verisini yenileme kısayolları tarayıcınınkilerden farklıdır.',
          'Sayfa verisini yenileme kısayolu yalnız etkin sekmenin verisini yeniden yükler; tarayıcıyı yenilemez ve diğer sekmelerinize dokunmaz.',
          'Kısayol listesini istediğiniz an üst bardaki **Yardım** menüsünden veya hesap menüsünden **Klavye kısayolları** ile açabilirsiniz.',
        ],
      },
    ],
    related: ['app-workspace-tabs', 'app-search', 'app-menu'],
  },

  // Kanıt: frontend/src/components/ds/EkFilterPanel.vue (Temizle/Sorgula, Enter ile sorgu), frontend/src/components/ds/EkActiveFilters.vue,
  //        frontend/src/composables/useSavedViews.ts (yalnız bu tarayıcı, ekran başına 20 görünüm, ad en çok 40 karakter, yalnız URL'ye izinli filtreler),
  //        frontend/src/components/ds/EkSavedViews.vue ("Mevcut filtreleri kaydet"), frontend/src/views/secure/OrderListView.vue, frontend/src/views/secure/ClaimListView.vue,
  //        frontend/src/navigation/screens.ts (urlParams: internalStatuses, allocationStates)
  {
    id: 'app-filters-views',
    category: 'using-the-app',
    order: 5,
    title: 'Filtreler ve kayıtlı görünümler',
    summary: 'Listeleri filtreleyin, uygulanan filtreleri yönetin ve sık kullandığınız filtreleri görünüm olarak kaydedin.',
    keywords: ['filtre', 'süz', 'sorgula', 'kayıtlı görünüm', 'görünüm kaydet', 'filtre temizle'],
    body: [
      { type: 'p', text: 'Liste ekranlarında (siparişler, iadeler, ürünler, mesajlar vb.) üstte bir **Filtreler** paneli bulunur. Filtreler siz **Sorgula**’ya basana kadar uygulanmaz; böylece birden fazla alanı değiştirip tek seferde sonuç alırsınız.' },
      {
        type: 'steps',
        items: [
          'Filtreler panelini açın ve istediğiniz alanları doldurun (ör. kanal, sipariş durumu, stok durumu).',
          '**Sorgula**’ya basın veya bir alandayken Enter’a basın.',
          'Uygulanan filtreler listenin üstünde çip olarak görünür. Bir çipi kaldırarak o filtreyi tek başına kaldırabilirsiniz.',
          'Tüm filtreleri sıfırlamak için **Temizle**’yi kullanın.',
        ],
      },
      { type: 'h', text: 'Kayıtlı görünümler' },
      { type: 'p', text: '**Siparişler** ve **İadeler** ekranlarında sık kullandığınız filtre birleşimlerini görünüm olarak kaydedebilirsiniz.' },
      {
        type: 'steps',
        items: [
          'Filtreleri uygulayın.',
          '**Görünümler** menüsünü açıp **Mevcut filtreleri kaydet**’i seçin.',
          'Görünüme bir ad verin (en fazla 40 karakter) ve **Kaydet**’e basın.',
          'Daha sonra aynı menüden görünümü seçerek filtreleri tek tıkla uygulayın; gerekmediğinde görünümü silin.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Görünümler yalnız sizin içindir ve **bu tarayıcıda** saklanır; başka bir cihazda veya gizli pencerede görünmez. Ekran başına en fazla 20 görünüm kaydedilebilir. Görünüme yalnız durum gibi sabit değerli filtreler kaydedilir; arama metni gibi serbest metinler kaydedilmez.' },
    ],
    goTo: [{ screen: 'OrderListView', label: 'Siparişler ekranını aç' }],
    related: ['app-bulk-actions', 'app-search', 'ord-lifecycle'],
  },

  // Kanıt: frontend/src/components/ds/EkBulkBar.vue ("n … seçildi", "Seçimi kaldır"), frontend/src/views/secure/OrderListView.vue (Onayla/Fatura kes/Kargoya ver/İptal et),
  //        frontend/src/views/secure/ClaimListView.vue (toplu onay), frontend/src/views/secure/MessageListView.vue (Toplu sil),
  //        frontend/src/components/productDefinitions/products/BatchActions/subcomponents/BatchActionMenu.vue, frontend/src/views/secure/NotificationCenterView.vue,
  //        frontend/src/views/secure/supports/TicketListView.vue (toplu kapatma), frontend/src/views/secure/InvoiceListView.vue (toplu silme)
  {
    id: 'app-bulk-actions',
    category: 'using-the-app',
    order: 6,
    title: 'Toplu işlemler',
    summary: 'Listelerde birden fazla kaydı seçip aynı işlemi tek seferde uygulayın.',
    keywords: ['toplu işlem', 'çoklu seçim', 'toplu onay', 'toplu iptal', 'seçili kayıtlar'],
    body: [
      { type: 'p', text: 'Liste ekranlarında satırların başındaki onay kutularıyla kayıt seçebilirsiniz. Seçim yaptığınızda listenin üstündeki çubuk “n kayıt seçildi” bilgisini ve o ekranda gerçekten yapılabilen toplu işlemleri gösterir. **Seçimi kaldır** ile seçimi temizlersiniz.' },
      {
        type: 'table',
        head: ['Ekran', 'Toplu işlemler'],
        rows: [
          ['Siparişler', 'Onayla, Fatura kes, Kargoya ver, İptal et'],
          ['İadeler', 'Seçili talepleri onayla'],
          ['Ürünler', 'Toplu işlemler menüsü: platformlara yükleme ve güncelleme, platformdan ürün çekme, Excel’e aktarma, satış durumu, kategori, marka ve etiket atama, toplu silme'],
          ['Mesajlar', 'Toplu sil'],
          ['Faturalar', 'Seçilenleri sil'],
          ['Destek talepleri', 'Seçili talepleri kapat'],
          ['Bildirimler', 'Okundu işaretle, sil'],
        ],
      },
      { type: 'p', text: 'Düğmelerdeki sayı, seçiminiz içinde o işleme uygun kayıt sayısını gösterir. Örneğin siparişlerde **Onayla** yalnız satıcı onayı bekleyen siparişleri sayar; uygun olmayanlar işleme dahil edilmez.' },
      { type: 'note', tone: 'warning', text: 'İptal, silme gibi geri alınamayan toplu işlemler kırmızı düğmeyle gösterilir ve onay ister. Pazaryerine giden işlemlerde (iptal, onay) sonuç kanaldan döner; bir kısmı başarısız olursa ekran başarılı ve başarısız sayısını bildirir.' },
    ],
    related: ['app-filters-views', 'cat-bulk-editor', 'ord-approve-cancel', 'app-context-menu'],
  },

  // Kanıt: frontend/src/components/ds/EkContextMenu.vue, frontend/src/components/ds/EkRowActions.vue (satır ⋯ menüsü),
  //        frontend/src/views/secure/OrderListView.vue (rowMenu: Onayla/Fatura oluştur/Kargoya ver/Kargo etiketi yazdır/Siparişi iptal et),
  //        frontend/src/components/layout/ShellTabStrip.vue (sekme sağ tık menüsü), frontend/src/components/productDefinitions/variants/ProductVariantsComponent.vue (Varyant işlemleri menüsü)
  {
    id: 'app-context-menu',
    category: 'using-the-app',
    order: 7,
    title: 'Bağlam menüsü',
    summary: 'Satırdaki “diğer eylemler” menüsü ve sekmelerdeki sağ tık menüsüyle işlemlere hızla ulaşın.',
    keywords: ['bağlam menüsü', 'sağ tık', 'üç nokta', 'diğer eylemler', 'satır menüsü'],
    body: [
      { type: 'p', text: 'Uygulamada bağlam menüleri iki yerde bulunur: liste satırlarının sonundaki **⋯ (diğer eylemler)** düğmesi ve çalışma alanı sekmelerindeki **sağ tık** menüsü. Menüler yalnız o kayıt için o anda yapılabilen işlemleri gösterir.' },
      {
        type: 'list',
        items: [
          '**Satır menüsü:** Örneğin bir siparişte, durumuna göre **Onayla**, **Fatura oluştur**, **Kargoya ver**, **Kargo etiketi yazdır** ve **Siparişi iptal et** seçenekleri görünür. Uygun olmayan işlem menüde yer almaz.',
          '**Sekme menüsü:** Bir sekmeye sağ tıklayarak **Kapat**, **Diğerlerini kapat** ve **Sağdakileri kapat** komutlarına ulaşırsınız. Klavyeyle, sekme odaktayken bağlam menüsü tuşuyla da açılır.',
          '**Varyant işlemleri:** Ürün formundaki varyant listesinde arama, toplu düzenleme, stok kodu/barkod üretme ve toplu silme gibi işlemler aynı menü düzeniyle sunulur.',
        ],
      },
      { type: 'p', text: 'Menü açıldığında odak ilk seçeneğe gider; ok tuşlarıyla gezinip Enter ile seçebilir, Esc ile kapatabilirsiniz. Tehlikeli seçenekler (iptal, silme) ayrı grupta ve kırmızı olarak gösterilir.' },
      { type: 'note', tone: 'info', text: 'Bir siparişte **Kilitli** etiketi varsa o sipariş için pazaryerine giden bir işlem sürüyordur; işlem bitene kadar menüdeki seçenekler devre dışı kalır.' },
    ],
    related: ['app-bulk-actions', 'app-workspace-tabs', 'ord-approve-cancel'],
  },

  // Kanıt: frontend/src/stores/theme.ts (appTheme = createThemeController('ek-theme')), frontend/public/theme-boot.js (ilk kare),
  //        frontend/src/components/layout/ApplicationBar.vue (Hesap menüsü → Görünüm: Açık / Koyu / Sistem), frontend/src/navigation/shortcuts.ts (headerToggle, focusMode, sidebarToggle)
  {
    id: 'app-theme',
    category: 'using-the-app',
    order: 8,
    title: 'Açık ve koyu görünüm',
    summary: 'Uygulamayı açık, koyu veya işletim sisteminizin ayarını izleyen görünümde kullanın.',
    keywords: ['tema', 'koyu tema', 'karanlık mod', 'dark mode', 'açık tema', 'görünüm', 'sistem teması'],
    body: [
      { type: 'p', text: 'Sağ üstteki **hesap menüsünü** açın; **Görünüm** bölümünde üç seçenek bulunur:' },
      {
        type: 'list',
        items: [
          '**Açık:** Uygulama her zaman açık renklerle görünür.',
          '**Koyu:** Uygulama her zaman koyu renklerle görünür; loş ortamda göz yorgunluğunu azaltır.',
          '**Sistem:** İşletim sisteminizin ya da tarayıcınızın açık/koyu ayarını izler; o ayar değişince uygulama da kendiliğinden değişir. İlk açılışta bu seçenek geçerlidir.',
        ],
      },
      { type: 'p', text: 'Seçiminiz bu tarayıcıda saklanır ve uygulama bir sonraki açılışta doğrudan seçtiğiniz görünümle başlar. Başka bir bilgisayar veya tarayıcıda seçimi ayrıca yapmanız gerekir.' },
      { type: 'p', text: 'Ekran alanını ve odağınızı düzenlemek için ayrıca şu seçenekleri kullanabilirsiniz:' },
      {
        type: 'list',
        items: [
          '**Sol menüyü daraltmak:** Menü yalnız simgelerden oluşan dar bir şeride iner.',
          '**Üst bölümü daraltmak:** Üst bar ile sekme şeridi arasındaki alan küçülür.',
          '**Odak modu:** Üst bar ve sol menü birlikte gizlenir, içerik tüm ekranı kullanır.',
          '**Tarayıcı yakınlaştırması:** Yazıları büyütmek veya küçültmek için tarayıcınızın yakınlaştırma ayarını kullanabilirsiniz; ekranlar bu değişikliğe uyum sağlar.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Bu seçeneklerin klavye kısayolları kısayollar tablosunda yer alır.' },
    ],
    related: ['app-menu', 'app-shortcuts', 'app-page-help'],
  },

  // Kanıt: frontend/src/views/secure/NotificationCenterView.vue (tür filtresi, en yeni 200 kayıt, "Görüntüle" yalnız uygulama içi yol, 3 gün sonra otomatik silme),
  //        backend/src/database/client/models/Notification.ts (expiresAt: 3 gün, TTL indeksi), frontend/src/stores/notificationDrawer.ts (okunmamış sayısı 30 sn'de bir yoklanır),
  //        frontend/src/plugins/locales/tr.json (notificationCenter.types), frontend/src/components/user/NotificationDrawerComponent.vue
  {
    id: 'app-notifications',
    category: 'using-the-app',
    order: 9,
    title: 'Bildirim merkezi',
    summary: 'Toplu işlem, aktarım, sipariş ve stok bildirimlerinizi görüntüleyin, okundu işaretleyin ve silin.',
    keywords: ['bildirim', 'bildirimler', 'zil', 'uyarı', 'stok uyarısı', 'okundu'],
    body: [
      { type: 'p', text: 'Uzun süren işlemler (toplu işlemler, içe ve dışa aktarma) tamamlandığında ve sipariş ya da stokla ilgili dikkat gerektiren bir durum oluştuğunda uygulama size bildirim bırakır. Üst bardaki zil simgesindeki rozet okunmamış bildirim sayısını gösterir ve düzenli aralıklarla kendiliğinden güncellenir.' },
      {
        type: 'list',
        items: [
          '**Hızlı bakış:** Zil simgesine tıklayınca son bildirimler bir panelde açılır.',
          '**Bildirim merkezi:** Tüm bildirimleri liste halinde görmek, türe göre süzmek, seçilenleri okundu işaretlemek veya silmek için **Bildirimler** ekranını kullanın.',
          '**Türler:** Stok uyarısı, Sistem, Sipariş, Toplu işlem, İçe aktarma, Dışa aktarma, Bilgi. Stok uyarısı ve Sistem bildirimleri listenin en üstünde tutulur.',
          '**Görüntüle:** Bildirim uygulama içindeki bir ekrana işaret ediyorsa **Görüntüle** ile o ekrana geçersiniz.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Bildirimler oluşturulduktan **3 gün sonra otomatik olarak silinir**. Saklamak istediğiniz bir bilgi varsa ilgili ekrandan (ör. işlem kayıtları) takip edin.' },
      { type: 'note', tone: 'info', text: 'Bildirim merkezi en yeni 200 bildirimi gösterir. Bildirim türü bazında susturma veya tercih ayarı şu an bulunmaz.' },
    ],
    goTo: [{ screen: 'NotificationCenterView', label: 'Bildirimler ekranını aç' }],
    related: ['int-health', 'stock-health', 'app-page-help'],
  },

  // Kanıt: frontend/src/composables/usePageAbout.ts ("Sayfa hakkında" paneli tercihi, tüm sayfalar için tek tercih, yerel depo),
  //        frontend/src/help/types.ts (PageHelp: amaç/ipuçları/kısayollar/"Yardım merkezinde oku"), frontend/src/composables/useOnboarding.ts (uygulama turu adımları),
  //        frontend/src/components/layout/ApplicationBar.vue (Yardım menüsü) — (i) paneli, (?) ipuçları ve "Uygulama turunu başlat" yardım merkezi işiyle birlikte eklenmektedir
  {
    id: 'app-page-help',
    category: 'using-the-app',
    order: 10,
    title: 'Sayfa hakkında paneli, ipuçları ve uygulama turu',
    summary: 'Her sayfadaki (i) paneli, kritik alanlardaki (?) ipuçları ve isteğe bağlı uygulama turuyla ekranları tanıyın.',
    keywords: ['yardım', 'sayfa hakkında', 'ipucu', 'bilgi', 'tur', 'uygulama turu', 'rehber', 'onboarding'],
    body: [
      { type: 'p', text: 'Uygulamanın içinde, bulunduğunuz ekrandan ayrılmadan yardım almanın üç yolu vardır: sayfa başlığındaki **(i)** paneli, önemli alanların yanındaki **(?)** ipuçları ve kısa **uygulama turu**.' },
      { type: 'h', text: 'Sayfa hakkında paneli (i)' },
      {
        type: 'steps',
        items: [
          'Sayfa başlığının yanındaki **(i)** düğmesine basın.',
          'Açılan panelde sayfanın amacını, o ekranda yapabileceğiniz işlere dair kısa ipuçlarını ve ekranla ilgili kısayolları görün.',
          'Konuyu ayrıntılı okumak için **Yardım merkezinde oku** bağlantısını kullanın.',
        ],
      },
      { type: 'p', text: 'Paneli bir kez açık bıraktığınızda tercih hatırlanır ve diğer sayfalarda da açık gelir; kapattığınızda tüm sayfalarda kapanır.' },
      { type: 'h', text: 'Alan ipuçları (?)' },
      { type: 'p', text: 'API kimlik bilgileri, stok politikası değerleri gibi yanlış girildiğinde sonucu etkileyen alanların yanında küçük bir **(?)** simgesi bulunur. Simgenin üzerine gelerek veya tıklayarak alanın ne işe yaradığını okuyabilirsiniz.' },
      { type: 'h', text: 'Uygulama turu' },
      { type: 'p', text: 'İlk girişinizde menü, akıllı arama, üst menü ve sekmeleri tanıtan kısa bir tur önerilir. Turu atlayabilirsiniz; istediğiniz zaman üst bardaki **Yardım (?)** menüsünden **Uygulama turunu başlat** ile yeniden başlatabilirsiniz.' },
    ],
    related: ['app-shortcuts', 'app-menu', 'support-ticket'],
  },

  // ───────────────────────────── Ürünler ve katalog ─────────────────────────────

  // Kanıt: frontend/src/composables/useProductFormProgress.ts (zorunlu kontroller: kategori, marka, başlık 2–160, ana kod, stok kodu, barkod, yinelenen kod, fiyat uyarıları),
  //        frontend/src/components/productDefinitions/crud/ProductFormWizardBar.vue, frontend/src/components/productDefinitions/variants/ProductVariantsComponent.vue (varyant işlemleri, kod üretme),
  //        frontend/src/components/productDefinitions/variants/ProductVariantGeneratorComponent.vue, frontend/src/views/secure/productDefinitions/ChoiceListView.vue (Renk/Beden/Numara şablonları),
  //        backend/src/capabilities/domains/catalog.ts (variants.add/update/delete)
  {
    id: 'cat-products-variants',
    category: 'catalog',
    order: 1,
    title: 'Ürünler ve varyantlar',
    summary: 'Tekil ve varyantlı ürün oluşturma, seçenek grupları ve varyant bilgilerinin yönetimi.',
    keywords: ['ürün', 'varyant', 'beden', 'renk', 'seçenek', 'stok kodu', 'barkod', 'ana kod', 'ürün ekle'],
    body: [
      { type: 'p', text: 'Entegrasyonik’te bir ürün ya **tekil** (tek stok kodu, tek barkod) ya da **varyantlı** olur. Varyantlı üründe renk, beden gibi seçeneklerin her birleşimi ayrı bir varyanttır ve kendi stok kodu, barkodu, fiyatı ve stoğu vardır.' },
      { type: 'h', text: 'Seçenek grupları' },
      { type: 'p', text: 'Varyantlar **Varyant grupları** ekranında tanımlanan seçeneklerden üretilir. Hazır **Renk**, **Beden** ve **Numara** şablonlarıyla hızlıca başlayabilir, değerleri düzenleyebilirsiniz. Değer sırası (ör. S, M, L) varyant listesinde de korunur.' },
      { type: 'h', text: 'Varyantlı ürün oluşturma' },
      {
        type: 'steps',
        items: [
          '**Ürünler > Yeni ürün** ile formu açın, kategori ve markayı seçin.',
          'Ürün başlığını (2–160 karakter) ve **ana kodu** girin.',
          'Varyant adımında seçenek değerlerini seçip varyantları oluşturun. Var olan birleşimler tekrar eklenmez.',
          'Her varyantın stok kodu, barkod, fiyat ve stok bilgilerini girin. **Varyant işlemleri** menüsündeki **Stok kodlarını oluştur** ve **Barkodları oluştur** ile kodları toplu üretebilirsiniz.',
          'Formun üstündeki **Zorunlu bilgiler** göstergesi eksik kalan maddeleri listeler; tamamlayıp kaydedin.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Aynı stok kodu veya barkod iki varyantta kullanılamaz; form yinelenen kodları kayıttan önce gösterir. Gelen siparişlerin stoğunuzla eşleşmesi de bu kodlarla yapılır.' },
      { type: 'note', tone: 'info', text: 'Form, satış fiyatı 0 olan veya piyasa fiyatından yüksek olan varyantlar için uyarı gösterir; Trendyol bu durumdaki ürünleri reddeder. Görsel eklenmemesi de uyarı olarak listelenir.' },
    ],
    goTo: [
      { screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' },
      { screen: 'productDefinitions/ChoiceListView', label: 'Varyant grupları ekranını aç' },
    ],
    related: ['cat-bulk-editor', 'cat-required-attributes', 'stock-single', 'gs-first-product-transfer'],
  },

  // Kanıt: frontend/src/components/productDefinitions/variants/grid/VariantBulkEditor.vue (taslak, "Seçime uygula", değer ata/± yüzde/± tutar/temizle, aşağı doldur, Excel'den yapıştır, geri al/yinele, önizleme, "Uygula" forma yazar),
  //        frontend/src/components/productDefinitions/variants/grid/variantSheet.ts, frontend/src/components/productDefinitions/variants/grid/useVariantSheet.ts,
  //        frontend/src/components/productDefinitions/variants/ProductVariantsComponent.vue ("Toplu düzenle", "Toplu özellik düzenle"),
  //        frontend/src/components/productDefinitions/products/BatchActions/useBatchActions.ts (katalog düzeyinde toplu işlemler)
  {
    id: 'cat-bulk-editor',
    category: 'catalog',
    order: 2,
    title: 'Toplu düzenleyici',
    summary: 'Bir ürünün varyantlarında stok, fiyat, kod ve kanal fiyatlarını tablo üzerinde toplu düzenleyin.',
    keywords: ['toplu düzenle', 'tablo', 'excel yapıştır', 'toplu fiyat', 'toplu stok', 'varyant tablosu', 'aşağı doldur'],
    body: [
      { type: 'p', text: '**Toplu düzenleyici**, varyantlı bir ürünün tüm (veya seçili) varyantlarını tablo halinde açar. Stok kodu, barkod, satış fiyatı, piyasa fiyatı, stok, raf ve kanal bazlı fiyat kolonlarını hücre hücre ya da toplu olarak değiştirebilirsiniz.' },
      {
        type: 'steps',
        items: [
          'Ürün formunda varyant listesine gelin. İsterseniz yalnız düzenleyeceğiniz varyantları seçin.',
          '**Varyant işlemleri** menüsünden **Toplu düzenle**’yi seçin. Kanal fiyatları için tablonun üstünden **Kanal fiyatları** görünümüne geçin.',
          'Hücre, satır veya kolon seçin (tıklayarak, Shift ile genişleterek ya da sürükleyerek; köşe hücresi tümünü seçer).',
          'İşlemi seçin: **değer ata**, **± yüzde**, **± tutar** (stokta ± adet) veya **temizle**. Değeri girip **Seçime uygula**’ya basın.',
          'Değişiklik özetini ve önce → sonra önizlemesini kontrol edin, ardından **Uygula** ile değişiklikleri forma aktarın.',
          'Kalıcı kayıt için ürün formunu kaydedin.',
        ],
      },
      {
        type: 'list',
        items: [
          'Seçimin ilk satırını alttakilere kopyalamak için **aşağı doldur**u kullanın.',
          'Excel’den kopyaladığınız bir tabloyu seçili hücreye yapıştırabilirsiniz; tutarlar “1.234,56” gibi Türkçe biçimde de okunur.',
          'Geri al ve yinele düğmeleri düzenleyici içindeki değişiklikler için çalışır.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Hatalı hücre (ör. geçersiz sayı) varken değişiklikler uygulanmaz. **Uygula** değişiklikleri yalnız forma yazar; ürünü kaydetmeden çıkarsanız değişiklikler kaybolur.' },
      { type: 'note', tone: 'info', text: 'Birden fazla ürüne aynı anda kategori, marka, etiket veya satış durumu atamak için **Ürünler** ekranındaki **Toplu işlemler** menüsünü kullanın.' },
    ],
    goTo: [{ screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' }],
    related: ['cat-products-variants', 'app-bulk-actions', 'stock-single'],
  },

  // Kanıt: frontend/src/components/categories/CategoryChannelRow.vue (kanal eşleme satırı, Özellikler), CategoryManager.vue ("Otomatik eşleştir", yapay zekâ uyarısı),
  //        frontend/src/components/BrandSyncComponent.vue ("Platform Marka Eşleştirme"), frontend/src/components/ChoicesMappingComponent.vue ("Seçenek Eşleştirme"),
  //        backend/src/capabilities/domains/catalog.ts (mappings.category.save/auto_match, brands.integration_mapping.save, mappings.attribute.save),
  //        frontend/src/components/logListView/DetailedImportLogReportMissingCategory.vue, frontend/src/components/logListView/DetailedImportLogReportMissingAttribute.vue
  {
    id: 'cat-mapping',
    category: 'catalog',
    order: 3,
    title: 'Kategori, marka ve özellik eşleme',
    summary: 'Kendi kategori, marka ve seçeneklerinizi her kanalın karşılığıyla eşleyin; aktarımın doğru çalışmasının temeli budur.',
    keywords: ['eşleme', 'eşleştirme', 'kategori eşle', 'marka eşle', 'özellik eşle', 'seçenek eşle', 'otomatik eşleştirme', 'mapping'],
    body: [
      { type: 'p', text: 'Her pazaryeri ürünleri kendi kategori ağacı, marka listesi ve özellik tanımlarıyla kabul eder. Entegrasyonik’te bir kez tanımladığınız kategori, marka ve seçenekleri her kanalın karşılığıyla **eşlediğinizde**, ürününüz o kanala doğru kategoride ve doğru özelliklerle gider. Eşlenmemiş bir kategori veya marka, gönderimin reddedilmesinin en yaygın nedenidir.' },
      { type: 'h', text: 'Kategori eşleme' },
      {
        type: 'steps',
        items: [
          '**Kategoriler** ekranında ağaçtan uç (alt kategorisi olmayan) kategorinizi seçin.',
          '**Kanal eşlemeleri** bölümünde ilgili kanalın satırında **Eşle**’ye basın, kanalın kategorisini arayıp seçin ve kaydedin.',
          'Kanal kategorisi kaydedildikten sonra aynı satırdaki **Özellikler** bölümünden kanalın seçenek grubunu (ör. beden, renk) sizin seçenek grubunuzla eşleştirin.',
        ],
      },
      { type: 'p', text: 'Eşlenmemiş uç (en alt düzey) kategoriler için **Otomatik eşleştir** düğmesini kullanabilirsiniz. Otomatik eşleştirme yapay zekâ desteğiyle çalışır. **Eksik eşlemeli** süzgeci, hangi kategorilerin tamamlanması gerektiğini gösterir.' },
      { type: 'note', tone: 'warning', text: 'Otomatik eşleştirme benzer isimli kategorilerde hatalı sonuç verebilir. İşlemden sonra eşleşmeleri kontrol edin.' },
      { type: 'h', text: 'Marka ve seçenek eşleme' },
      {
        type: 'steps',
        items: [
          '**Markalar** ekranında markanızı seçin, **Platform Marka Eşleştirme** bölümünde kanalı ve kanalın markasını seçip kaydedin.',
          'Seçenek değerlerini (ör. “Kırmızı”, “M”) kanalın değerleriyle eşlemek için **Seçenek Eşleştirme** penceresini kullanın. Bu pencere, ilgili kanal kategorisi ve seçenek grubu belirlendikten sonra etkinleşir.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Pazaryerinden ürün çektiğinizde karşılığı bulunamayan kategori ve özellikler işlem kaydının ayrıntı raporunda listelenir; bu listeden eksik eşlemeleri tamamlayabilirsiniz.' },
    ],
    goTo: [
      { screen: 'productDefinitions/CategoryListView', label: 'Kategoriler ekranını aç' },
      { screen: 'productDefinitions/BrandListView', label: 'Markalar ekranını aç' },
      { screen: 'productDefinitions/ChoiceListView', label: 'Varyant grupları ekranını aç' },
    ],
    related: ['cat-required-attributes', 'ts-product-not-sent', 'gs-first-product-transfer'],
  },

  // Kanıt: frontend/src/components/productDefinitions/variants/ProductVariantAttributesComponent.vue ("Zorunlu Özellikleri (*)", kanal sekmeleri ChannelTabList, "Zorunlu" etiketi),
  //        frontend/src/components/productDefinitions/variants/ProductBatchVariantAttributesComponent.vue, frontend/src/components/productDefinitions/variants/ProductVariantsComponent.vue ("Toplu özellik düzenle"),
  //        frontend/src/composables/useIntegrationError.ts (özellik listesi alınamadığında gösterilen hata), frontend/src/components/logListView/DetailedImportLogReportMissingAttribute.vue
  {
    id: 'cat-required-attributes',
    category: 'catalog',
    order: 4,
    title: 'Zorunlu özellikler',
    summary: 'Pazaryerinin kategoriye göre istediği zorunlu özellikleri ürün formunda doldurun.',
    keywords: ['zorunlu özellik', 'özellik', 'attribute', 'kategori özellikleri', 'eksik özellik', 'yıldızlı alan'],
    body: [
      { type: 'p', text: 'Pazaryerleri, seçtiğiniz kategoriye göre bazı özelliklerin (ör. materyal, cinsiyet, menşe) doldurulmasını zorunlu tutar. Bu özellikler kanaldan canlı olarak alınır ve kanala, kategoriye göre değişir. Zorunlu bir özellik boş kalırsa ürün o kanala gönderilemez veya kanal tarafından reddedilir.' },
      {
        type: 'steps',
        items: [
          'Önce ürününüzün kategorisinin ilgili kanalla eşlendiğinden emin olun; özellik listesi eşlenen kanal kategorisinden gelir.',
          'Ürün formunda varyantın özellik ve kanal bilgileri penceresini açın (tekil üründe **Ürün Özellikleri**).',
          'Pencerenin üstündeki kanal sekmelerinden ilgili kanalı seçin.',
          '**Zorunlu Özellikleri (*)** bölümündeki her alanı doldurun. Değer listesi olan alanlarda kanalın değerlerinden birini seçin; kanal izin veriyorsa kendi değerinizi yazabilirsiniz.',
          'Diğer özellikler isteğe bağlıdır; doldurmanız ürün sayfasının kalitesini artırır.',
        ],
      },
      { type: 'p', text: 'Birden fazla varyanta aynı özellik değerlerini vermek için **Varyant işlemleri > Toplu özellik düzenle**’yi kullanın. Kanalı seçin, **Eksik zorunlu** süzgeciyle boş zorunlu özellikleri bulun, değerleri girip önizlemeden sonra **Uygula** ile yazın; seçili varyant varsa yalnız onlara uygulanır.' },
      { type: 'note', tone: 'warning', text: 'Özellik listesi yüklenemezse pencerede ne olduğunu, olası nedeni ve ne yapmanız gerektiğini anlatan bir hata paneli görünür. Anlamları için **Entegrasyon hata mesajları** makalesine bakın.' },
    ],
    goTo: [{ screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' }],
    related: ['cat-mapping', 'int-errors', 'ts-product-not-sent'],
  },

  // ───────────────────────────── Stok ─────────────────────────────

  // Kanıt: frontend/src/components/productDefinitions/variants/grid/variantSheet.ts (varyant stock/shelf alanları), frontend/src/plugins/locales/tr.json (stockPolicy.channels.description formülü, stockHealth.kpi.available),
  //        docs/API_TENANT_SURFACE.md §2.4 (rezervasyon alanlarının tek yazarı StockAllocator), backend/src/capabilities/domains/catalog.ts (variants.update stok/fiyat),
  //        frontend/src/components/productDefinitions/products/BatchActions/subcomponents/BatchActionMenu.vue ("Platform Stoklarını Güncelle")
  {
    id: 'stock-single',
    category: 'stock',
    order: 1,
    title: 'Tek stok',
    summary: 'Her varyantın tek bir stok miktarı vardır; tüm kanallara bu stoktan yayın yapılır.',
    keywords: ['stok', 'tek stok', 'ortak stok', 'stok güncelle', 'stok adedi', 'kullanılabilir stok'],
    body: [
      { type: 'p', text: 'Entegrasyonik’te stok **varyant başına tek bir miktar** olarak tutulur. Aynı ürünü birden fazla pazaryerinde satsanız bile ayrı ayrı stok girmezsiniz; tüm kanallar bu tek stoktan beslenir. Bir kanalda satış olduğunda stok ortak havuzdan düşer ve diğer kanallara da güncel miktar yansır.' },
      {
        type: 'list',
        items: [
          '**Toplam stok:** Ürün formunda girdiğiniz miktardır.',
          '**Rezerve:** Gelmiş ancak henüz kargolanmamış siparişler için ayrılan miktardır.',
          '**Kullanılabilir stok:** Toplam stoktan rezerve miktarın düşülmesiyle kalan, satılabilir miktardır.',
          '**Yayınlanan stok:** Her kanala gönderilen miktardır; kanal stok politikanızdaki tampon kadar kullanılabilir stoktan az olabilir.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Stok miktarını ürün formunda veya **Toplu düzenleyici** ile güncelleyin ve ürünü kaydedin.',
          'Değişikliği hemen kanallara göndermek isterseniz **Ürünler > Toplu işlemler > Platform Stoklarını Güncelle**’yi kullanın.',
          'Kanallara gönderilmeyi bekleyen stok değişikliklerini **Stok sağlığı** ekranındaki **Yayın bekleyen** göstergesinden izleyin.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Rezerve miktar sistem tarafından siparişlere göre yönetilir; elle değiştirilemez. Ürün formunu kaydetmek, arada gelen bir siparişin rezervasyonunu ezmez.' },
    ],
    goTo: [
      { screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' },
      { screen: 'StockHealthView', label: 'Stok sağlığı ekranını aç' },
    ],
    related: ['stock-reservation', 'stock-channel-policy', 'ts-stock-mismatch'],
  },

  // Kanıt: frontend/src/plugins/locales/tr.json (stockHealth.legend: RESERVED/COMMITTED/RELEASED/OVERSOLD/RESTOCKED/UNMAPPED; status.allocation),
  //        frontend/src/navigation/screens.ts (OrderListView allocationStates), frontend/src/views/secure/OrderListView.vue ("Stok durumu" filtresi, allocation sütunu),
  //        frontend/src/components/order/OrderAllocationTimeline.vue, docs/API_TENANT_SURFACE.md §1 (varsayılan graceMinutes 30, autoCancelOversold true)
  {
    id: 'stock-reservation',
    category: 'stock',
    order: 2,
    title: 'Rezervasyon ve aşırı satışın önlenmesi',
    summary: 'Gelen siparişler için stok nasıl ayrılır, aşırı satış nasıl önlenir ve oluşursa ne yapılır.',
    keywords: ['rezervasyon', 'rezerve', 'aşırı satış', 'oversell', 'oversold', 'eşleşmedi', 'stok durumu', 'sıfır aşırı satış'],
    body: [
      { type: 'p', text: 'Bir kanaldan sipariş geldiğinde Entegrasyonik, siparişteki her kalemi stok kodu veya barkoduyla varyantınıza eşler ve o miktarı stoktan **ayırır (rezerve eder)**. Böylece aynı adet başka bir kanalda tekrar satılmaya açık kalmaz. Hedef, aynı stoğun iki kez satılmasını (aşırı satışı) önlemektir.' },
      {
        type: 'table',
        head: ['Stok durumu', 'Anlamı'],
        rows: [
          ['Rezerve', 'Stok bu kalem için ayrıldı; kullanılabilir miktardan düşüldü.'],
          ['Sevk edildi', 'Kalem kargoya verildi; ayrılan stok kesin olarak düşüldü.'],
          ['Serbest', 'Kalem iptal edildi; ayrılan stok serbest bırakıldı.'],
          ['Aşırı satış', 'Sipariş geldiğinde yeterli stok yoktu. Stok politikanıza göre yeniden denenir veya iptal edilir.'],
          ['Stoka döndü', 'İade edilen ürün stoğa geri eklendi.'],
          ['Eşleşmedi', 'Kalem hiçbir varyantla eşleşmedi; stok ayrılamadı. Stok kodunu veya barkodu kontrol edin.'],
        ],
      },
      { type: 'p', text: 'Kanallar aynı anda satış yapabildiği için aşırı satış riski tamamen sıfırlanamaz; bu yüzden birincil olmayan kanallara tampon düşülerek daha az stok yayınlanır (bkz. kanal stok politikası). Aşırı satış oluşursa sistem, stok politikanızdaki **aşırı satış bekleme süresi** boyunca stok gelmesini bekler; süre dolduğunda otomatik iptal açıksa ve kanal destekliyorsa ilgili satır kanalda iptal edilir, desteklemiyorsa işlem size düşer.' },
      {
        type: 'steps',
        items: [
          '**Stok sağlığı** ekranında **Açık aşırı satış** ve **Eşleşmeyen kalem** göstergelerini kontrol edin.',
          '**Siparişlerde filtrele** ile ilgili siparişleri sipariş listesinde açın (**Stok durumu** filtresi uygulanmış olarak).',
          'Aşırı satışta stoğu artırın veya siparişi iptal edin; eşleşmeyen kalemde ürünün stok kodunu ya da barkodunu siparişteki değerle uyumlu hale getirin.',
        ],
      },
    ],
    goTo: [
      { screen: 'StockHealthView', label: 'Stok sağlığı ekranını aç' },
      { screen: 'OrderListView', label: 'Siparişler ekranını aç' },
    ],
    related: ['stock-channel-policy', 'stock-health', 'ord-lifecycle', 'ts-stock-mismatch'],
  },

  // Kanıt: frontend/src/views/secure/integrations/StockPolicyView.vue, frontend/src/plugins/locales/tr.json (stockPolicy.*: birincil kanal, tampon adet/yüzdesi, bekleme süresi, otomatik iptal, formül),
  //        docs/API_TENANT_SURFACE.md §1 (yetki: admin/owner; defaults bufferUnits 1, bufferPercent 0, graceMinutes 30, autoCancelOversold true; limits 100000/100/10080), frontend/src/composables/useStockPolicyApi.ts
  {
    id: 'stock-channel-policy',
    category: 'stock',
    order: 3,
    title: 'Kanal stok politikası ve güvenlik stoğu',
    summary: 'Birincil kanalı seçin, diğer kanallara tampon (güvenlik stoğu) tanımlayın ve aşırı satış davranışını ayarlayın.',
    keywords: ['stok politikası', 'güvenlik stoğu', 'tampon', 'birincil kanal', 'otomatik iptal', 'bekleme süresi', 'buffer'],
    body: [
      { type: 'p', text: '**Stok politikası**, aynı stoğun birden fazla pazaryerinde satıldığı durumlarda aşırı satışı önleyen tampon ve telafi kurallarıdır. Ekranı yalnız mağaza sahibi ve yöneticiler görüntüleyip değiştirebilir; en az bir pazaryeri bağlı olmalıdır.' },
      { type: 'h', text: 'Nasıl hesaplanır' },
      { type: 'p', text: 'Yayınlanan stok = satılabilir stok − en büyüğü (tampon adet, stok × tampon yüzdesi). Son adetler **birincil kanalda** satılır; birincil kanalda tampon adet uygulanmaz. Ekrandaki önizleme, örnek bir stok miktarında her kanala kaç adet yayınlanacağını gösterir.' },
      {
        type: 'steps',
        items: [
          '**Stok politikası** ekranını açın.',
          '**Birincil satış kanalı**nı seçin. Otomatik seçimde ilk bağlanan pazaryeri birincil sayılır.',
          '**Kanal kuralları** bölümünde her kanal için **Tampon adet** ve **Tampon yüzdesi** girin.',
          '**Aşırı satış bekleme süresi** (dakika) ile aşırı satışta stok gelmesi için ne kadar bekleneceğini belirleyin.',
          '**Aşırı satışta otomatik iptal** ile süre dolduğunda satırın kanalda iptal edilip edilmeyeceğini seçin. Bu seçeneği desteklemeyen kanallarda alan “Desteklenmiyor” olarak görünür.',
          'Değişiklikleri kaydedin. Kaydedilmemiş değişiklik sayısı ekranın altında gösterilir.',
        ],
      },
      {
        type: 'table',
        head: ['Alan', 'Boş bırakılırsa (varsayılan)', 'İzin verilen aralık'],
        rows: [
          ['Tampon adet', '1 (birincil kanalda 0)', '0–100.000'],
          ['Tampon yüzdesi', '%0', '%0–100'],
          ['Aşırı satış bekleme süresi', '30 dk', '0–10.080 dk (7 gün)'],
          ['Aşırı satışta otomatik iptal', 'Açık', 'Açık / Kapalı'],
        ],
      },
      { type: 'note', tone: 'warning', text: 'Seçtiğiniz birincil kanalın bağlantısı kaldırılırsa ekran sizi uyarır; geçerli bir kanal seçin veya otomatik kurala dönün.' },
    ],
    goTo: [{ screen: 'StockPolicyView', label: 'Stok politikası ekranını aç' }],
    related: ['stock-reservation', 'stock-single', 'stock-health'],
  },

  // Kanıt: frontend/src/views/secure/StockHealthView.vue, frontend/src/composables/useStockHealthApi.ts (StockService/getStockOverview),
  //        frontend/src/plugins/locales/tr.json (stockHealth.*: göstergeler, "Dikkat gerektiren siparişler", varyant stok dengesi, mutabakat "İzlenmiyor")
  {
    id: 'stock-health',
    category: 'stock',
    order: 4,
    title: 'Stok sağlığı',
    summary: 'Açık aşırı satışları, eşleşmeyen sipariş kalemlerini ve varyant stok dengesini tek ekranda izleyin.',
    keywords: ['stok sağlığı', 'aşırı satış', 'eşleşmeyen kalem', 'yayın bekleyen', 'rezerve', 'stok dengesi', 'mutabakat'],
    body: [
      { type: 'p', text: '**Stok sağlığı** ekranı, açıkta kalan sipariş kalemlerini ve stok dengenizi özetler. Sorunlu bir durum olduğunda nereden müdahale edeceğinizi gösterir.' },
      {
        type: 'list',
        items: [
          '**Açık aşırı satış:** Geldiğinde stokta karşılanamayan kalem ve adet sayısı.',
          '**Eşleşmeyen kalem:** Hiçbir varyantla eşleşmediği için stok ayrılamayan kalemler.',
          '**Kullanılabilir stok:** Toplam stok ve rezerve miktarla birlikte satılabilir miktar.',
          '**Yayın bekleyen:** Kanallara henüz gönderilmemiş stok değişiklikleri.',
          '**Dikkat gerektiren siparişler:** Aşırı satış veya eşleşmeyen kalemi olan en yeni siparişler; her satırdan siparişi sipariş listesinde açabilirsiniz.',
          '**Varyant stok dengesi:** Tüm varyantların toplamı; rezervasyonlu, stoğu aşan rezervi olan ve yayın bekleyen varyant sayıları.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Ekranı açın ve göstergelere bakın. Sorun yoksa göstergeler “yok” olarak görünür.',
          'Dikkat gerektiren siparişler varsa **Siparişlerde filtrele** ile tamamını sipariş listesinde açın.',
          'Verinin güncelliğini **Son güncelleme** bilgisinden kontrol edin; gerekirse **Yenile**’ye basın.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Stok mutabakatı sonuçları henüz kaydedilmediği için son mutabakat zamanı bu ekranda gösterilemez; mutabakatın bulduğu farklar “yayın bekleyen” olarak işaretlenir.' },
      { type: 'note', tone: 'warning', text: 'Güncel veri alınamazsa ekran son başarılı verinin tarihini bildirir. Gösterilen bilgiler o tarihe aittir.' },
    ],
    goTo: [{ screen: 'StockHealthView', label: 'Stok sağlığı ekranını aç' }],
    related: ['stock-reservation', 'stock-channel-policy', 'ts-stock-mismatch'],
  },

  // ───────────────────────────── Sipariş ve iade ─────────────────────────────

  // Kanıt: frontend/src/types/OrderTypes.ts (ORDER_INTERNAL_STATUS_LABELS), frontend/src/composables/useLifecycle.ts (izinli eylemler),
  //        frontend/src/components/order/OrderDetailComponent.vue (zaman çizgisi: Sipariş alındı/Onaylandı/Faturalandı/Kargoya verildi/Teslim edildi),
  //        frontend/src/views/secure/OrderListView.vue (filtreler: Kanal, Sipariş durumu, Stok durumu), backend/src/capabilities/domains/shipments.ts (kargo firması entegrasyonu yok)
  {
    id: 'ord-lifecycle',
    category: 'orders',
    order: 1,
    title: 'Sipariş yaşam döngüsü',
    summary: 'Siparişin geldiği andan teslimata kadar geçtiği durumlar ve her durumda yapabilecekleriniz.',
    keywords: ['sipariş durumu', 'yaşam döngüsü', 'onay bekliyor', 'teslimat bekleniyor', 'kargo', 'fatura', 'sipariş akışı'],
    body: [
      { type: 'p', text: 'Bağlı kanallardan gelen siparişler **Siparişler** ekranında tek listede toplanır. Her siparişin kanaldan bağımsız, ortak bir durumu vardır; hangi işlemleri yapabileceğiniz bu duruma göre belirlenir.' },
      {
        type: 'table',
        head: ['Durum', 'Anlamı', 'Yapabilecekleriniz'],
        rows: [
          ['Kanal onayı bekliyor', 'Sipariş kanal tarafında henüz onaylanmadı.', 'İptal'],
          ['Satıcı onayı bekliyor', 'Siparişin sizin tarafınızdan onaylanması bekleniyor.', 'Onayla, İptal'],
          ['Sipariş onaylandı', 'Sipariş hazırlanıyor.', 'Fatura oluştur, Kargoya ver, Kargo etiketi yazdır (takip kodu varsa), İptal'],
          ['Teslimat Bekleniyor', 'Sipariş kargoya verildi.', 'Fatura oluştur (fatura yoksa), Kargo etiketi yazdır'],
          ['Teslim edildi', 'Sipariş müşteriye ulaştı.', 'Fatura oluştur (fatura yoksa)'],
          ['İptal edildi', 'Sipariş iptal edildi; iptalin kaynağı (Satıcı, Müşteri, Platform) gösterilir.', 'Görüntüleme'],
          ['İade Edildi', 'Sipariş iade süreciyle kapandı.', 'Görüntüleme'],
        ],
      },
      { type: 'p', text: 'Sipariş detayındaki zaman çizgisi; siparişin alındığı, onaylandığı, faturalandığı, kargoya verildiği ve teslim edildiği tarihleri gösterir. Ayrıca her kalemin stok durumu (rezerve, sevk edildi vb.) ayrı bir zaman çizgisinde yer alır.' },
      { type: 'note', tone: 'info', text: 'Kargo firmalarıyla doğrudan entegrasyon henüz yoktur. **Kargoya ver** işlemi, girdiğiniz kargo firması ve takip numarasını siparişin geldiği kanala bildirir. Lojistiği pazaryeri yönetiyorsa ve takip kodu zaten varsa bu adım gerekmez.' },
    ],
    goTo: [{ screen: 'OrderListView', label: 'Siparişler ekranını aç' }],
    related: ['ord-approve-cancel', 'ord-returns', 'stock-reservation', 'fin-invoices-reports'],
  },

  // Kanıt: frontend/src/views/secure/OrderListView.vue (bulkActionCounts, triggerBulkAction onay diyaloğu, rowMenu, isOrderLocked "Kilitli"),
  //        frontend/src/components/order/composables/useOrderCancel.ts (iptal nedeni, toplu iptalde kanal başına neden, uygun olmayan durumlar elenir, başarılı/başarısız sayısı),
  //        backend/src/capabilities/domains/orders.ts (orders.approve, orders.cancel geri alınamaz, orders.rejection_reasons.list)
  {
    id: 'ord-approve-cancel',
    category: 'orders',
    order: 2,
    title: 'Onay ve iptal',
    summary: 'Siparişleri tek tek veya toplu onaylayın; gerektiğinde kanalın iptal nedeniyle iptal edin.',
    keywords: ['sipariş onayla', 'toplu onay', 'sipariş iptal', 'iptal nedeni', 'kilitli sipariş'],
    body: [
      { type: 'p', text: 'Onay ve iptal işlemleri siparişin geldiği kanala iletilir. Bu yüzden işlemin sonucu kanaldan döner ve birkaç saniye sürebilir.' },
      { type: 'h', text: 'Onaylama' },
      {
        type: 'steps',
        items: [
          '**Siparişler** ekranında onaylayacağınız siparişleri seçin. İsterseniz **Sipariş durumu** filtresiyle yalnız “Satıcı onayı bekliyor” olanları listeleyin.',
          'Listenin üstündeki **Onayla** düğmesine basın. Düğmedeki sayı, seçiminizdeki onaylanabilir sipariş sayısıdır.',
          'Onay penceresini doğrulayın. Tek bir sipariş için satırın **⋯** menüsünden **Onayla**’yı da kullanabilirsiniz.',
        ],
      },
      { type: 'h', text: 'İptal' },
      {
        type: 'steps',
        items: [
          'İptal edilecek siparişi seçin ve **İptal et**’e (tek sipariş için **⋯ > Siparişi iptal et**) basın.',
          'Açılan pencerede kanalın sunduğu iptal nedenlerinden birini seçin. Toplu iptalde her kanal grubu için ayrı neden seçmeniz gerekir.',
          'İşlemi onaylayın. Toplu iptalde sonuç, başarılı ve başarısız sipariş sayısıyla bildirilir.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Pazaryerinde sipariş iptali **geri alınamaz**. Kargoya verilmiş, teslim edilmiş, iptal edilmiş veya iade edilmiş siparişler iptal edilemez; toplu seçimde bu siparişler işleme dahil edilmez.' },
      { type: 'note', tone: 'info', text: 'Siparişte **Kilitli** etiketi görüyorsanız o sipariş için kanala giden bir işlem sürüyordur. İşlem bitene kadar onay ve iptal seçenekleri devre dışıdır; bir süre sonra listeyi yenileyin.' },
    ],
    goTo: [{ screen: 'OrderListView', label: 'Siparişler ekranını aç' }],
    related: ['ord-lifecycle', 'app-bulk-actions', 'ts-order-missing'],
  },

  // Kanıt: frontend/src/types/ClaimTypes.ts (CLAIM_INTERNAL_STATUS_LABELS), frontend/src/composables/useLifecycle.ts (isClaimActionAllowed: UNDER_REVIEW/DISPUTED),
  //        frontend/src/views/secure/ClaimListView.vue (Talebi onayla/reddet, "Red gerekçesi", toplu onay, filtreler Kanal/Talep durumu),
  //        backend/src/capabilities/domains/claims.ts (claims.approve/reject geri alınamaz), frontend/src/plugins/locales/tr.json (stockHealth.legend.RESTOCKED)
  {
    id: 'ord-returns',
    category: 'orders',
    order: 3,
    title: 'İade süreci',
    summary: 'Pazaryerlerinden gelen iade taleplerini inceleyin, onaylayın veya gerekçesiyle reddedin.',
    keywords: ['iade', 'iade talebi', 'iade onayla', 'iade reddet', 'red gerekçesi', 'claim'],
    body: [
      { type: 'p', text: 'Müşterilerin pazaryerinde açtığı iade talepleri **İadeler** ekranına gelir. Her talepte sipariş numarası, kanal, iade edilen ürünler, iade tutarı ve durum görünür.' },
      {
        type: 'table',
        head: ['Durum', 'Anlamı'],
        rows: [
          ['İade Talebi Oluşturuldu', 'Talep kanalda açıldı.'],
          ['İncelemede', 'Talep sizin kararınızı bekliyor veya itiraz sürecinde.'],
          ['Tamamlandı', 'Talep onaylandı, reddedildi veya kanalda sonuçlandı.'],
          ['İptal edildi', 'Talep iptal edildi.'],
        ],
      },
      {
        type: 'steps',
        items: [
          '**İadeler** ekranında **Talep durumu** filtresiyle incelemedeki talepleri listeleyin.',
          'Talep detayını açıp ürünleri ve iade nedenini kontrol edin.',
          'Uygunsa **Talebi onayla**’yı seçin. Birden fazla talebi seçip toplu onaylayabilirsiniz.',
          'Uygun değilse **Talebi reddet**’i seçin ve **Red gerekçesi** listesinden kanalın sunduğu nedenlerden birini işaretleyin.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'İade onayı (para iadesi) ve reddi kanalda müşteriye yansır ve **geri alınamaz**. Karar vermeden önce ürünü teslim aldığınızdan ve kontrol ettiğinizden emin olun.' },
      { type: 'note', tone: 'info', text: 'Onay ve red yalnız incelemedeki taleplerde yapılabilir. İade edilen ürün stoğa geri eklendiğinde sipariş kaleminin stok durumu **Stoka döndü** olarak görünür.' },
    ],
    goTo: [{ screen: 'ClaimListView', label: 'İadeler ekranını aç' }],
    related: ['ord-lifecycle', 'stock-reservation', 'ord-messages-sla'],
  },

  // Kanıt: frontend/src/components/message/messageSla.ts (MESSAGE_WAIT_THRESHOLDS 24/48 saat öneri, Trendyol 10–2000 karakter, bekleyen tanımı, sortAwaitingFirst),
  //        frontend/src/components/message/MessageWaitChip.vue, frontend/src/views/secure/MessageListView.vue ("Bekleyenler önce · bu sayfada", Mesajı cevapla, Toplu sil),
  //        frontend/src/plugins/locales/tr.json (messages.sla, status.message), backend/src/capabilities/domains/messages.ts (yanıt geri alınamaz)
  {
    id: 'ord-messages-sla',
    category: 'orders',
    order: 4,
    title: 'Müşteri mesajları ve bekleme süreleri',
    summary: 'Pazaryerlerinden gelen müşteri sorularını yanıtlayın ve bekleme süresi göstergesiyle önceliklendirin.',
    keywords: ['mesaj', 'müşteri sorusu', 'soru cevap', 'yanıt', 'bekleme süresi', 'sla', 'cevap bekleniyor'],
    body: [
      { type: 'p', text: 'Müşterilerin pazaryerinde sorduğu sorular **Mesajlar** ekranında listelenir. Yanıtınız ilgili kanal üzerinden müşteriye iletilir.' },
      {
        type: 'steps',
        items: [
          '**Mesajlar** ekranını açın; isterseniz durum filtresiyle yalnız “Cevap bekleniyor” mesajları listeleyin.',
          'En uzun bekleyenleri öne almak için **Bekleyenler önce** düğmesini kullanın.',
          'Satırdaki **Mesajı cevapla** ile mesajı açın, yanıtınızı yazıp gönderin.',
        ],
      },
      { type: 'h', text: 'Bekleme süresi göstergesi' },
      { type: 'p', text: 'Yanıtı henüz müşteriye ulaşmamış her mesajın yanında, müşterinin yazmasından bu yana geçen süre gösterilir. **24 saate** ulaşan bekleyiş uyarı rengine, **48 saati** aşan bekleyiş kritik renge döner.' },
      { type: 'note', tone: 'info', text: 'Bu eşikler Entegrasyonik’in önerisidir; pazaryerlerinin resmi yanıt süresi değildir. Kanalınızın kendi kurallarını ayrıca takip edin.' },
      { type: 'note', tone: 'info', text: '**Bekleyenler önce** yalnız ekrandaki sayfada sıralama yapar; sunucu sıralamasını değiştirmez. Diğer sayfalardaki bekleyen mesajlar için sayfalar arasında gezinin.' },
      { type: 'h', text: 'Yanıt uzunluğu' },
      { type: 'p', text: 'Trendyol soru yanıtları **10–2000 karakter** olmalıdır; yanıt alanındaki sayaç bu sınırı gösterir ve sınır dışındaki yanıt gönderilmez. Kuralı tanımlı olmayan kanallarda sayaç yalnız bilgi amaçlıdır.' },
      { type: 'note', tone: 'warning', text: 'Gönderilen yanıt kanal üzerinden müşteriye ulaşır ve geri alınamaz. Kanal bir yanıtı reddederse mesaj yeniden bekleyenler arasına girer.' },
    ],
    goTo: [{ screen: 'MessageListView', label: 'Mesajlar ekranını aç' }],
    related: ['ord-lifecycle', 'ord-returns', 'app-filters-views'],
  },

  // ───────────────────────────── Entegrasyonlar ─────────────────────────────

  // Kanıt: site/src/data/connect.ts (connectGuides, WHERE, COMMON_STEPS), frontend/src/help/channels.ts (HELP_CHANNELS, channelSteps),
  //        frontend/src/help/autoBlocks.ts (channelGuides bloğu), frontend/src/views/secure/integrations/MarketplaceView.vue, ECommerceView.vue, ErpView.vue
  {
    id: 'int-channel-connect',
    category: 'integrations',
    order: 1,
    title: 'Kanal bağlantı adımları',
    summary: 'Her kanal için hangi kimlik bilgilerinin gerektiği ve bağlantının genel adımları.',
    keywords: ['bağlantı', 'api bilgileri', 'kimlik bilgisi', 'satıcı kimliği', 'api anahtarı', 'gizli anahtar', 'key', 'secret'],
    body: [
      { type: 'p', text: 'Bir kanalı bağlamak için o kanalın size verdiği API kimlik bilgilerini Entegrasyonik’e girmeniz yeterlidir. Aşağıdaki kartlar, bugün bağlanabilen her kanal için gereken bilgi türlerini ve bu bilgilerin nereden alınacağını gösterir; ortak adımlar kartların altındadır.' },
      { type: 'channelGuides' },
      { type: 'h', text: 'Genel adımlar' },
      {
        type: 'steps',
        items: [
          'Kimlik bilgilerinizi edinin: pazaryerlerinde ilgili pazaryerinin satıcı panelinden, e-ticaret sitesinde mağaza panelinizden, ERP’de ERP hesabınızdan.',
          'Entegrasyonik’te ilgili entegrasyonun ayar ekranını açın (Entegrasyonlar > Pazaryeri, E-Ticaret veya ERP) ve bilgileri girin.',
          'Kaydedin. Eksik bir alan olduğunda ekran hangi bilginin gerektiğini belirtir.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Kimlik bilgilerinizi kimseyle paylaşmayın ve destek taleplerine yazmayın. Entegrasyonik bu bilgileri şifreli saklar ve ekranda yeniden göstermez.' },
    ],
    goTo: [
      { screen: 'integrations/MarketplaceView', label: 'Pazaryeri entegrasyonlarını aç' },
      { screen: 'integrations/ECommerceView', label: 'E-ticaret entegrasyonlarını aç' },
      { screen: 'integrations/ErpView', label: 'ERP entegrasyonlarını aç' },
    ],
    related: ['gs-first-integration', 'int-scope', 'int-errors'],
  },

  // Kanıt: site/src/data/integrations.ts (status 'available' yalnız 6 kod; roadmap öğeleri gizli), backend/src/capabilities/domains/shipments.ts (kargo entegrasyonu yok),
  //        backend/src/api/services/invoice-service.ts (hasIntegratedProvider=false → manuel fatura formu), frontend/src/components/integrations/IntegrationComingSoonPanel.vue,
  //        frontend/src/plugins/locales/tr.json (integrationComingSoon.*, integrationCoverage.*), frontend/src/components/integrations/IntegrationCapabilityChips.vue,
  //        backend/src/integration/modules/*/descriptor.ts (kanal kapsam düzeyleri), CLAUDE.md (Project Overview)
  {
    id: 'int-scope',
    category: 'integrations',
    order: 2,
    title: 'Kapsam ve “Yakında”',
    summary: 'Bugün hangi entegrasyonların çalıştığı, “Yakında” etiketinin anlamı ve kanal bazında kapsamın nasıl görüleceği.',
    keywords: ['kapsam', 'yakında', 'desteklenen kanallar', 'kargo entegrasyonu', 'e-fatura entegrasyonu', 'hangi kanallar'],
    body: [
      { type: 'p', text: 'Entegrasyonik’te bugün otomatik çalışan entegrasyonlar şunlardır:' },
      {
        type: 'table',
        head: ['Tür', 'Kanal', 'Not'],
        rows: [
          ['Pazaryeri', 'Trendyol, Hepsiburada, N11, Pazarama', ''],
          ['E-ticaret', 'Ideasoft', 'Şu an test ortamında çalışır.'],
          ['ERP / muhasebe', 'Bizimhesap', ''],
        ],
      },
      { type: 'h', text: '“Yakında” ne demek?' },
      { type: 'p', text: 'Entegrasyon ekranlarında **Yakında** etiketi taşıyan sağlayıcılar ve kategoriler için otomatik entegrasyon henüz geliştirilmemiştir. **Kargo** ve **e-fatura** kategorilerinin tamamı ile listede görünen diğer e-ticaret altyapıları bu durumdadır. Bu ekranlardan kimlik bilgisi (API anahtarı, parola) kaydedilmez; daha önce girilmiş ayarlarınız varsa silinmez.' },
      { type: 'h', text: 'Bugün yapabilecekleriniz' },
      {
        type: 'list',
        items: [
          '**Kargo:** Siparişler ekranındaki **Kargoya ver** ile kargo firması ve takip numarasını girip siparişin geldiği kanala iletebilirsiniz.',
          '**Fatura:** Faturayı kendi e-fatura sağlayıcınızda kestikten sonra **Fatura oluştur** ile fatura numarası ve bağlantısını siparişin geldiği kanala iletebilirsiniz.',
        ],
      },
      { type: 'h', text: 'Kanal bazında kapsam' },
      { type: 'p', text: 'Bağlı bir kanalın ayar ekranındaki **Bu kanalda neler çalışır** bölümü; ürün aktarımı, stok ve fiyat, sipariş çekme, sipariş onay/red, iadeler, müşteri soruları, finans gibi yeteneklerin o kanalda **Destekleniyor**, **Sınırlı**, **Kanal kendisi yapar** veya **Desteklenmiyor** olduğunu gösterir. **Ayrıntılar ve sınırlamalar** bölümünde bilinen sınırlamalar ve doğrulama bilgisi yer alır.' },
    ],
    goTo: [
      { screen: 'integrations/MarketplaceView', label: 'Pazaryeri entegrasyonlarını aç' },
      { screen: 'integrations/ShippingView', label: 'Kargo entegrasyonları ekranını aç' },
      { screen: 'integrations/EInvoiceView', label: 'E-fatura entegrasyonları ekranını aç' },
    ],
    related: ['int-channel-connect', 'ord-lifecycle', 'fin-invoices-reports', 'faq-general'],
  },

  // Kanıt: frontend/src/composables/useIntegrationError.ts (NE OLDU/OLASI NEDEN/NE YAPMALI + teknik ayrıntı; auth yalnız oturum/izin; 500'de kimlik bilgisi ile kanal hatası ayırt edilemez),
  //        frontend/src/components/integrations/IntegrationErrorPanel.vue (ayarları aç düğmesi), frontend/src/help/autoBlocks.ts (integrationErrors bloğu otomatik),
  //        frontend/src/plugins/locales/tr.json (integrationHealth.errorCode)
  {
    id: 'int-errors',
    category: 'integrations',
    order: 3,
    title: 'Entegrasyon hata mesajları ne anlama gelir',
    summary: 'Kanal verisi (kategori, özellik, değer) alınamadığında gösterilen hata panelinin anlamı ve yapmanız gerekenler.',
    keywords: ['hata', 'entegrasyon hatası', 'yanıt vermedi', 'alınamadı', 'erişim izni', 'sunucuya ulaşılamadı', 'teknik ayrıntı', 'istek kimliği'],
    body: [
      { type: 'p', text: 'Ürün formunda veya eşleme ekranlarında kanalın kategori, özellik ya da özellik değeri listesi alınamadığında bir hata paneli görünür. Panel üç bilgi verir: **ne oldu**, **olası neden** ve **ne yapmanız gerektiği**. Altındaki katlanır **teknik ayrıntı** bölümünde servis adı, HTTP durumu, istek zamanı ve varsa istek kimliği bulunur.' },
      { type: 'integrationErrors' },
      { type: 'h', text: 'Doğru yorumlamak için' },
      {
        type: 'list',
        items: [
          '“Erişim izniniz yok” mesajı Entegrasyonik oturumunuz veya hesap yetkinizle ilgilidir; pazaryeri kimlik bilgisiyle ilgili değildir.',
          'Pazaryerinden dönen kimlik doğrulama hataları ile pazaryerinin geçici arızası bu panelde her zaman ayırt edilemez. Bu yüzden “şu an alınamadı” mesajı iki olasılığı birlikte söyler: geçici bir hata ya da süresi dolmuş veya hatalı API anahtarları.',
          'Boş liste de bir hata durumu olarak gösterilir; kanal o kategori için özellik tanımlamamış olabilir.',
        ],
      },
      {
        type: 'steps',
        items: [
          'Önce panelin önerdiği gibi tekrar deneyin.',
          'Sorun sürerse paneldeki düğmeyle entegrasyon ayarlarını açın ve API bilgilerinin güncel olduğunu kontrol edin.',
          '**Entegrasyon sağlığı** ekranında o kanalın son hata ve devre kesici durumuna bakın.',
          'Hâlâ çözülmediyse teknik ayrıntıyı kopyalayıp bir destek talebine ekleyin.',
        ],
      },
    ],
    goTo: [{ screen: 'integrations/IntegrationHealthView', label: 'Entegrasyon sağlığı ekranını aç' }],
    related: ['int-health', 'cat-required-attributes', 'support-ticket', 'ts-common'],
  },

  // Kanıt: frontend/src/views/secure/integrations/IntegrationHealthView.vue (son 24 saat penceresi, webhook paneli), frontend/src/composables/useIntegrationHealthApi.ts,
  //        frontend/src/plugins/locales/tr.json (integrationHealth.*, integrationWebhook.*), docs/API_TENANT_SURFACE.md §3 (admin yetkisi),
  //        frontend/src/views/secure/LogListView.vue + frontend/src/components/logListView/* (gönderim/çekim kayıtları ve adımları), frontend/src/views/secure/settings/AuditLogView.vue
  {
    id: 'int-health',
    category: 'integrations',
    order: 4,
    title: 'Entegrasyon sağlığı ve işlem kayıtları',
    summary: 'Kanallarınızın bağlantı durumunu, son hatalarını ve ürün gönderim/çekim işlemlerinin ayrıntılarını izleyin.',
    keywords: ['entegrasyon sağlığı', 'log', 'işlem kaydı', 'hata kaydı', 'devre kesici', 'webhook', 'denetim günlüğü', 'son senkron'],
    body: [
      { type: 'p', text: 'Bir entegrasyonun sorunsuz çalışıp çalışmadığını iki ekrandan izlersiniz: genel durum için **Entegrasyon sağlığı**, tek tek ürün işlemleri için **İşlem kayıtları**.' },
      { type: 'h', text: 'Entegrasyon sağlığı' },
      {
        type: 'list',
        items: [
          'Her kanal için son 24 saatteki çağrı sayısı, başarı oranı ve hata kodlarına göre dağılım.',
          'Durum: **Sağlıklı**, **Sorunlu**, **Erişilemiyor**, **Veri yok** veya **Yapılandırılmadı**.',
          'Kimlik bilgisinin girilip girilmediği, son başarılı senkron zamanı, son hata ve işlem adı.',
          '**Devre kesici:** Kanal art arda hata verdiğinde çağrılar geçici olarak durdurulur (Açık); ardından deneme çağrıları yapılır (Yarı açık).',
          'Trendyol için **anlık sipariş bildirimi (webhook)** adresi oluşturma ve yenileme.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Sağlık durumu gerçek çağrı ölçümlerinden türetilir; bu ekran pazaryerine test isteği göndermez. Ekranı mağaza sahibi ve yöneticiler görüntüleyebilir.' },
      { type: 'h', text: 'İşlem kayıtları' },
      {
        type: 'steps',
        items: [
          '**İşlem kayıtları** ekranında **Ürün gönderim işlemleri** ya da **Ürün çekim işlemleri** görünümünü seçin.',
          'Tarih, kanal ve işlem tipine göre filtreleyin.',
          'Bir kaydı açarak adım adım akışı görün. Gönderimde: Kuyrukta, Ürün Doğrulanıyor, İşlem Pazaryerine Gönderiliyor, Gönderim Sorgulanıyor, Ürün Onayı Bekleniyor, Tamamlandı. Çekimde: Sırada, Ürünler Çekiliyor, Analiz Ediliyor, Ürünler Aktarılıyor, Tamamlandı.',
          'Çekim raporunda eşleşmeyen kategori ve özellikler ayrıca listelenir.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Mağazanızda kimin, ne zaman, hangi işlemi yaptığını görmek için **Denetim günlüğü** ekranını kullanın (mağaza sahibi ve yöneticiler).' },
    ],
    goTo: [
      { screen: 'integrations/IntegrationHealthView', label: 'Entegrasyon sağlığı ekranını aç' },
      { screen: 'LogListView', label: 'İşlem kayıtları ekranını aç' },
      { screen: 'AuditLogView', label: 'Denetim günlüğü ekranını aç' },
    ],
    related: ['int-errors', 'ts-product-not-sent', 'ts-order-missing'],
  },

  // ───────────────────────────── Finans ve raporlar ─────────────────────────────

  // Kanıt: frontend/src/navigation/screens.ts (FinancialListView tab: transactions/summary/cargo-invoices/payouts), frontend/src/views/secure/FinancialListView.vue,
  //        frontend/src/components/financial/* (FinancialSummaryTab, FinancialCargoInvoicesTab, FinancialPayoutsTab, PayoutDetailSheet), frontend/src/components/financial/financeSupport.ts (desteklenmeyen kanallar),
  //        frontend/src/composables/useFinanceApi.ts (CARGO_INVOICES_MAX_ROWS = 5000), frontend/src/plugins/locales/tr.json (finance.*)
  {
    id: 'fin-overview',
    category: 'finance',
    order: 1,
    title: 'Finans ekranı',
    summary: 'Pazaryeri hakediş, kesinti, kargo faturası ve ödeme emirlerinizi dört görünümde izleyin.',
    keywords: ['finans', 'hakediş', 'kesinti', 'komisyon', 'kargo faturası', 'ödeme', 'ödeme emri', 'mutabakat'],
    body: [
      { type: 'p', text: '**Finans** ekranı, bağlı pazaryerlerinden aktarılan finansal kayıtları okur. Dört sekmeden oluşur; her sekmede tarih aralığı ve kanal filtresi kullanabilirsiniz.' },
      {
        type: 'table',
        head: ['Sekme', 'Ne gösterir'],
        rows: [
          ['İşlemler', 'Satış, iade, iptal, ödeme, kesinti, düzeltme, kupon, indirim gibi tüm finansal hareketler.'],
          ['Özet', 'Seçili dönem için toplam alacak, toplam borç, net hakediş ve işlem sayısı; ayrıca kanal kırılımı.'],
          ['Kargo faturaları', 'Pazaryerinin kestiği kargo faturaları: fatura no, sipariş ve paket no, gönderim türü (gidiş/iade), desi, tutar.'],
          ['Ödeme dökümü', 'Hesabınıza aktarılan ödeme emirleri ve her ödeme emrinin kalem dökümü.'],
        ],
      },
      {
        type: 'steps',
        items: [
          '**Finans** ekranını açın ve sekmeyi seçin.',
          'Başlangıç ve bitiş tarihini, gerekirse kanalları seçip sorgulayın.',
          'Ödeme dökümünde bir satırın **Dökümü aç** bağlantısıyla o ödeme emrine bağlı kalemleri görün. Ödeme emri numarasını biliyorsanız doğrudan numarayla da arayabilirsiniz.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Kargo faturası görünümü Hepsiburada ve N11 için; ödeme dökümü Hepsiburada, N11 ve Pazarama için desteklenmez. Bu kanallarda ekran “bu kanal için desteklenmiyor” der; bu bir sıfır tutar değildir, veri o kanaldan gelmez.' },
      { type: 'note', tone: 'info', text: 'Özet tutarları, seçili dönem ve kanallardaki kayıtların sunucu toplamıdır; komisyon ve kargo için ayrı toplam henüz sunulmaz. Kargo faturalarında en fazla 5.000 satır gösterilir; daha fazlası için tarih aralığını daraltın.' },
    ],
    goTo: [{ screen: 'FinancialListView', label: 'Finans ekranını aç' }],
    related: ['fin-invoices-reports', 'int-scope', 'ord-lifecycle'],
  },

  // Kanıt: frontend/src/views/secure/InvoiceListView.vue ("Yeni fatura ekle", Fatura durumu/Belge tipi filtreleri, toplu silme, "Manuel"),
  //        frontend/src/components/order/ManualInvoiceComponent.vue (Fatura Numarası, Fatura PDF Linki, Belge Türü, Fatura Tarihi), backend/src/api/services/invoice-service.ts (entegre sağlayıcı yok, pazaryerine bildirim),
  //        frontend/src/components/order/BarcodePrintComponent.vue, frontend/src/views/secure/PrintoutListView.vue + components/printouts/* (şablon galerisi/düzenleyici/önizleme; şablonlar tarayıcıda, siparişler OrderService/getOrders),
  //        frontend/src/components/productDefinitions/products/BatchActions/useBatchActions.ts (EXPORT_EXCEL), backend/src/capabilities/domains/reports.ts, frontend/src/views/secure/DashboardView.vue
  {
    id: 'fin-invoices-reports',
    category: 'finance',
    order: 2,
    title: 'Faturalar, çıktılar ve raporlar',
    summary: 'Siparişlere fatura bilgisi girme, kargo etiketi yazdırma, Excel dışa aktarma ve genel bakış özetleri.',
    keywords: ['fatura', 'e-fatura', 'e-arşiv', 'manuel fatura', 'kargo etiketi', 'barkod', 'çıktı', 'rapor', 'excel'],
    body: [
      { type: 'p', text: 'Entegrasyonik bugün bir e-fatura sağlayıcısıyla doğrudan bağlantılı değildir. Faturanızı kendi sağlayıcınızda keser, fatura bilgisini Entegrasyonik’e kaydedersiniz; Entegrasyonik bu bilgiyi siparişin geldiği kanala iletir.' },
      { type: 'h', text: 'Siparişe fatura ekleme' },
      {
        type: 'steps',
        items: [
          '**Siparişler** ekranında siparişi seçin ve **Fatura oluştur**’a (toplu için **Fatura kes**) basın.',
          '**Manuel Fatura Girişi** penceresinde fatura numarası, fatura PDF bağlantısı, belge türü ve fatura tarihini girin.',
          'Kaydedin. Fatura pazaryerine iletilemezse ekran bunu ayrıca bildirir; fatura kaydı yine oluşur.',
        ],
      },
      { type: 'p', text: '**Faturalar** ekranında tüm fatura kayıtlarını durum ve belge tipine göre süzebilir, **Yeni fatura ekle** ile siparişe bağlı olmayan bir fatura kaydı girebilir ve seçili kayıtları silebilirsiniz.' },
      { type: 'note', tone: 'warning', text: 'Mali belgeyle ilgili işlemler (fatura bildirimi, silme) geri alınamaz.' },
      { type: 'h', text: 'Çıktılar' },
      { type: 'p', text: 'Takip kodu olan onaylı veya kargodaki siparişlerde satırın **⋯** menüsünden **Kargo etiketi yazdır**’ı kullanabilirsiniz. **Çıktılar** ekranında kargo etiketi, sipariş fişi, irsaliye taslağı ve toplama listesi şablonları tasarlanır; şablonu gerçek siparişlerinizle önizleyip birden çok siparişi tek seferde yazdırabilir, yazıcı penceresinden PDF olarak kaydedebilirsiniz. Şablonlar şimdilik bu tarayıcıda saklanır; sipariş satırındaki etiket yazdırma standart etiketi kullanmaya devam eder.' },
      { type: 'h', text: 'Raporlar' },
      {
        type: 'list',
        items: [
          '**Genel bakış** ekranı bugünkü sipariş ve ciro, dünün toplamı, son 7 gün ve kargo bekleyen sipariş sayısını; sipariş durumu dağılımını, katalog aktarım durumunu ve entegrasyon sağlığını özetler.',
          'Ürün listenizi **Ürünler > Toplu işlemler > Excel’e Aktar** ile indirebilirsiniz.',
          'Finansal dökümler için **Finans** ekranını kullanın.',
        ],
      },
    ],
    goTo: [
      { screen: 'InvoiceListView', label: 'Faturalar ekranını aç' },
      { screen: 'OrderListView', label: 'Siparişler ekranını aç' },
      { screen: 'DashboardView', label: 'Genel bakış ekranını aç' },
    ],
    related: ['fin-overview', 'ord-lifecycle', 'int-scope'],
  },

  // ───────────────────────────── Hesap, güvenlik ve KVKK ─────────────────────────────

  // Kanıt: frontend/src/views/secure/user/AccountSecurityView.vue (parola değiştirme, e-posta doğrulama; oturum listesi/2FA YOK), frontend/src/composables/passwordPolicyHints.ts (≥10 karakter, 3 sınıf veya 16+, ≤72 bayt),
  //        docs/API_ACCOUNT_LIFECYCLE.md (parola politikası; değişimde diğer oturumlar düşer; 5 hatalı denemede 15 dk kilit; 7 günlük mutlak oturum sınırı)
  {
    id: 'acc-password',
    category: 'account',
    order: 1,
    title: 'Parola ve hesap güvenliği',
    summary: 'Parolanızı değiştirin, güçlü parola kurallarını öğrenin ve e-posta adresinizi doğrulayın.',
    keywords: ['parola', 'şifre', 'şifre değiştir', 'güvenlik', 'hesap kilitlendi', 'oturum', 'e-posta doğrula'],
    body: [
      { type: 'p', text: '**Hesabım ve güvenlik** ekranında hesap bilgilerinizi görür, e-posta doğrulamanızı yönetir ve parolanızı değiştirirsiniz.' },
      {
        type: 'steps',
        items: [
          '**Hesabım ve güvenlik** ekranını açın.',
          'Parola bölümünde mevcut parolanızı girin.',
          'Yeni parolanızı yazın; alanın altındaki ipuçları kuralların sağlanıp sağlanmadığını anlık gösterir.',
          'Yeni parolayı tekrar girip kaydedin.',
        ],
      },
      { type: 'h', text: 'Parola kuralları' },
      {
        type: 'list',
        items: [
          'En az 10 karakter.',
          '10–15 karakterlik parolalarda küçük harf, büyük harf, rakam ve sembolden en az üçü; 16 karakter ve üzeri parola cümlelerinde bu şart aranmaz.',
          'En fazla 72 bayt (Türkçe karakterler daha fazla bayt kaplar).',
          'Yaygın parolalar, tekrarlayan veya ardışık karakterler ile e-posta adresiniz ya da adınızı içeren parolalar kabul edilmez; bu kontroller sunucuda yapılır.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Parolanızı değiştirdiğinizde bu cihazdaki oturumunuz açık kalır, diğer tüm cihazlardaki oturumlarınız kapanır.' },
      { type: 'note', tone: 'warning', text: 'Mevcut parolanın art arda 5 kez yanlış girilmesi hesabı 15 dakika kilitler (girişte de aynı kural geçerlidir). Oturumlar en fazla 7 gün sürer; sonra yeniden giriş yapmanız gerekir.' },
      { type: 'note', tone: 'info', text: 'Ad ve e-posta bilgileriniz yetkili bir yönetici tarafından **Yetkilendirme** ekranından güncellenir. Oturum listesi ve iki adımlı doğrulama şu an bulunmaz.' },
    ],
    goTo: [{ screen: 'AccountSecurityView', label: 'Hesabım ve güvenlik ekranını aç' }],
    related: ['gs-account', 'acc-users', 'ts-common'],
  },

  // Kanıt: frontend/src/views/secure/user/AuthorizationListView.vue ("Yeni personel", "Yetki grubu" filtresi, mağaza sahibi silinemez, rol rozeti),
  //        frontend/src/components/user/UserAddComponent.vue (İsim, Soyisim, E-posta, Şifre, "Kullanıcı Rolü Seçiniz", sahipte rol salt-okunur),
  //        backend/src/api/operationPolicy.ts (kademeler member/admin/owner), backend/src/api/services/user-service.ts (getRoles: merkezi sabit roller), docs/API_ACCOUNT_LIFECYCLE.md (bulgu 4)
  {
    id: 'acc-users',
    category: 'account',
    order: 2,
    title: 'Kullanıcılar ve yetkiler',
    summary: 'Mağazanıza personel ekleyin, yetki grubunu belirleyin ve erişimi kaldırın.',
    keywords: ['kullanıcı', 'personel', 'yetki', 'rol', 'yetki grubu', 'kullanıcı ekle', 'ekip', 'yönetici'],
    body: [
      { type: 'p', text: '**Yetkilendirme** ekranı, mağazanıza erişimi olan personeli ve yetki gruplarını gösterir. Her personelin bir yetki grubu (rolü) vardır; menüde hangi ekranları gördüğü ve hangi işlemleri yapabildiği bu gruba göre belirlenir.' },
      {
        type: 'steps',
        items: [
          '**Yetkilendirme** ekranında **Yeni personel**’e basın.',
          'İsim, soyisim ve e-posta adresini girin.',
          'Personel için bir parola belirleyip tekrar girin. Parolayı personelle güvenli bir kanaldan paylaşın.',
          '**Kullanıcı Rolü Seçiniz** alanından yetki grubunu seçip kaydedin.',
        ],
      },
      {
        type: 'list',
        items: [
          'Bir personeli düzenlemek veya silmek için satırın **⋯** menüsünü kullanın.',
          'Listeyi isim, e-posta veya yetki grubuna göre arayıp süzebilirsiniz.',
          'Mağaza sahibinin rolü değiştirilemez ve mağaza sahibi silinemez.',
        ],
      },
      { type: 'h', text: 'Yetki düzeyleri hakkında' },
      { type: 'p', text: 'Bazı ekranlar yalnız **mağaza sahibi ve yöneticilere** açıktır: Stok politikası, Entegrasyon sağlığı, Denetim günlüğü ve abonelik planı değişikliği. Veri dışa aktarma ve mağaza silme talebi ise yalnız **mağaza sahibi** tarafından yapılabilir.' },
      { type: 'note', tone: 'info', text: 'Bugün personel davet bağlantısıyla değil, yöneticinin belirlediği parolayla eklenir. Personel ilk girişten sonra parolasını **Hesabım ve güvenlik** ekranından değiştirmelidir.' },
    ],
    goTo: [{ screen: 'AuthorizationListView', label: 'Yetkilendirme ekranını aç' }],
    related: ['acc-password', 'acc-privacy', 'ts-common'],
  },

  // Kanıt: frontend/src/views/secure/user/PrivacyDataView.vue, frontend/src/components/privacy/AccountDeletionPanel.vue, frontend/src/composables/useTenantDataApi.ts,
  //        frontend/src/plugins/locales/tr.json (privacyData.*: kapsam, sırlar hariç, 24 saat, tek kullanım, 30 gün askı, yalnız sahip), docs/API_TENANT_SURFACE.md §5 (owner)
  {
    id: 'acc-privacy',
    category: 'account',
    order: 3,
    title: 'KVKK: veri dışa aktarma ve silme',
    summary: 'Mağaza verilerinizin kopyasını indirin veya mağazanızın silinmesi için talep oluşturun.',
    keywords: ['kvkk', 'gizlilik', 'veri dışa aktarma', 'veri indir', 'hesap sil', 'mağaza sil', 'veri taşınabilirliği', 'aydınlatma metni'],
    body: [
      { type: 'p', text: '**Veri ve gizlilik** ekranı, KVKK kapsamındaki haklarınızı kullanmanız için iki işlem sunar: verilerinizin tamamını dışa aktarmak ve mağazanın silinmesi için talep oluşturmak. Her iki işlemi de yalnız **mağaza sahibi** yapabilir.' },
      { type: 'h', text: 'Verilerinizi dışa aktarma' },
      {
        type: 'steps',
        items: [
          '**Veri ve gizlilik** ekranında **Dışa aktarma dosyası hazırla**’ya basın. Hazırlık, veri hacmine göre birkaç dakika sürebilir; bu sırada sayfadan ayrılmayın.',
          'Arşiv hazır olduğunda **Arşivi indir** ile ZIP dosyasını bilgisayarınıza kaydedin.',
        ],
      },
      {
        type: 'list',
        items: [
          'Arşiv; ürünler, varyantlar, kategoriler, markalar, siparişler, müşteriler, iadeler, faturalar, mesajlar, finans kayıtları, ayarlar ve kullanıcıları NDJSON dosyaları olarak içerir.',
          'Parolalar ve pazaryeri API anahtarları gibi gizli bilgiler arşive eklenmez.',
          'İndirme bağlantısı 24 saat geçerlidir ve tek kullanımlıktır; indirme tamamlanınca arşiv sunucudan silinir.',
        ],
      },
      { type: 'h', text: 'Mağazayı silme talebi' },
      {
        type: 'steps',
        items: [
          'Gerekirse önce verilerinizi dışa aktarın.',
          '**Mağazayı sil** bölümünde **Silme talebi oluştur**’a basın.',
          'Kimliğinizi doğrulamak için parolanızı girin ve mağaza adını büyük/küçük harf dahil aynen yazın.',
          'Son onay penceresinde talebi onaylayın.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Talep oluşturulduğunda mağazanız **30 gün askıya alınır**. Bu süre içinde geri alma yalnız destek ekibi üzerinden yapılabilir.' },
      { type: 'note', tone: 'info', text: 'Kişisel verilerin hangi amaçlarla işlendiğini ekrandaki **KVKK Aydınlatma Metni** ve **Kullanım Koşulları** bağlantılarından okuyabilirsiniz.' },
    ],
    goTo: [{ screen: 'PrivacyDataView', label: 'Veri ve gizlilik ekranını aç' }],
    related: ['acc-users', 'acc-subscription', 'support-ticket'],
  },

  // Kanıt: frontend/src/views/secure/user/SubscriptionView.vue (planlar, limitler, "Mevcut planınız", test/mock ödeme uyarısı, "Kurumsal Anlaşma"),
  //        backend/src/capabilities/domains/billing.ts (billing.checkout.start minTier admin), frontend/src/plugins/locales/tr.json (status.subscription, subscriptionBanner.*),
  //        frontend/src/components/layout/ShellSubscriptionBanner.vue
  {
    id: 'acc-subscription',
    category: 'account',
    order: 4,
    title: 'Abonelik',
    summary: 'Abonelik durumunuzu görün, planları karşılaştırın ve plan seçin.',
    keywords: ['abonelik', 'plan', 'paket', 'ödeme', 'deneme', 'fatura bilgileri', 'limit'],
    body: [
      { type: 'p', text: '**Abonelik ve planlar** ekranı mevcut abonelik durumunuzu ve seçilebilecek planları gösterir. Durum şunlardan biri olabilir: Abonelik Yok, Deneme Sürümü, Aktif, Ödeme Gecikti, İptal edildi.' },
      {
        type: 'steps',
        items: [
          '**Abonelik ve planlar** ekranını açın ve üstteki durum bandını kontrol edin.',
          'Plan kartlarında fiyatı ve limitleri (kanal, varyant, kullanıcı sayısı) karşılaştırın. Mevcut planınız kartta işaretlidir.',
          'Geçmek istediğiniz planın düğmesine basın ve onay penceresini doğrulayın.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Ödeme adımı şu an **test ortamındadır**: plan seçimi bir test ödeme akışı başlatır ve gerçek tahsilat yapılmaz. Abonelik durumunuz ödeme sağlayıcısından onay geldiğinde güncellenir.' },
      { type: 'note', tone: 'info', text: 'Plan değişikliğini mağaza sahibi veya yöneticiler başlatabilir. Plan fiyatları ve limitleri ekranda tanımlandığı gibi gösterilir.' },
      { type: 'p', text: 'Deneme süresinin bitmesine az kaldığında, ödeme geciktiğinde veya abonelik iptal edildiğinde üst barın altında bir uyarı bandı görünür. Banttaki bağlantı sizi doğrudan abonelik ekranına götürür.' },
    ],
    goTo: [{ screen: 'user/SubscriptionView', label: 'Abonelik ekranını aç' }],
    related: ['gs-account', 'acc-users', 'faq-general'],
  },

  // ───────────────────────────── Sorun giderme ─────────────────────────────

  // Kanıt: frontend/src/views/secure/LogListView.vue + frontend/src/components/logListView/DetailedExportLogReport.vue (adımlar), frontend/src/composables/useProductFormProgress.ts (Trendyol fiyat reddi uyarıları),
  //        frontend/src/views/secure/productDefinitions/ProductListView.vue (Platform yüklenme durumu filtresi: Hazırlanan/Onay bekleyen/Hatalı/Onaylanan), frontend/src/components/CategorySyncComponent.vue, frontend/src/components/BrandSyncComponent.vue
  {
    id: 'ts-product-not-sent',
    category: 'troubleshooting',
    order: 1,
    title: 'Ürünüm pazaryerine gitmedi',
    summary: 'Gönderdiğiniz ürün pazaryerinde görünmüyorsa adım adım kontrol listesi.',
    keywords: ['ürün gitmedi', 'ürün yüklenmedi', 'gönderim hatası', 'reddedildi', 'hatalı ürün', 'ürün görünmüyor'],
    body: [
      { type: 'p', text: 'Ürün gönderimi birkaç aşamadan geçer ve son aşamada pazaryerinin kendi onayını bekler. Sorunun hangi aşamada olduğunu bulmak için aşağıdaki sırayı izleyin.' },
      {
        type: 'steps',
        items: [
          'Gönderimi başlattığınızdan emin olun: ürün kaydetmek tek başına gönderim yapmaz. **Ürünler > Toplu işlemler > Kanallara yükle** ile gönderin.',
          '**Ürünler** ekranında **Platform yüklenme durumu** filtresiyle ürünün durumuna bakın: Hazırlanan, Onay bekleyen, Hatalı veya Onaylanan.',
          '**İşlem kayıtları** ekranında ilgili gönderim kaydını açın ve hangi adımda kaldığını görün. Hatalı adımın açıklaması nedeni belirtir.',
          'Kayıt **Ürün Onayı Bekleniyor** adımındaysa ürün pazaryerinin incelemesindedir; kanalın onayını bekleyin.',
          'Hata eşlemeyle ilgiliyse kategori ve markanın o kanalla eşlendiğini kontrol edin.',
          'Kanalın zorunlu özelliklerinin doldurulduğunu kontrol edin.',
          'Fiyatları kontrol edin: satış fiyatı 0 veya piyasa fiyatından yüksekse Trendyol ürünü reddeder.',
          'Kanal bağlantısının sağlıklı olduğunu **Entegrasyon sağlığı** ekranından doğrulayın.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Düzeltmeleri yaptıktan sonra ürünü yeniden gönderin. Ürün zaten kanalda varsa içerik değişiklikleri için **Kanallarda güncelle**’yi kullanın.' },
    ],
    goTo: [
      { screen: 'LogListView', label: 'İşlem kayıtları ekranını aç' },
      { screen: 'productDefinitions/ProductListView', label: 'Ürünler ekranını aç' },
    ],
    related: ['cat-mapping', 'cat-required-attributes', 'int-health', 'gs-first-product-transfer'],
  },

  // Kanıt: frontend/src/components/integrations/marketplace/TrendyolComponent.vue ("Entegrasyon durumu"), frontend/src/components/integrations/IntegrationWebhookPanel.vue (zamanlanmış çekim + Trendyol webhook),
  //        frontend/src/views/secure/OrderListView.vue (filtreler, "Sipariş bulunamadı"), frontend/src/plugins/locales/tr.json (integrationWebhook.*, integrationHealth.*), frontend/src/components/layout/ShellSearch.vue
  {
    id: 'ts-order-missing',
    category: 'troubleshooting',
    order: 2,
    title: 'Sipariş gelmedi',
    summary: 'Pazaryerinde gördüğünüz bir sipariş Entegrasyonik’te yoksa kontrol edilecekler.',
    keywords: ['sipariş gelmedi', 'sipariş yok', 'sipariş görünmüyor', 'sipariş eşitleme', 'webhook', 'sipariş çekme'],
    body: [
      { type: 'p', text: 'Siparişler kanallardan zamanlanmış aralıklarla çekilir. Trendyol’da ayrıca anlık bildirim (webhook) kurarak siparişlerin beklemeden gelmesini sağlayabilirsiniz. Bir sipariş görünmüyorsa şu adımları izleyin.' },
      {
        type: 'steps',
        items: [
          '**Siparişler** ekranında filtrelerinizi temizleyin; kayıtlı bir görünüm veya durum filtresi siparişi gizliyor olabilir.',
          'Sipariş numarasını akıllı aramada arayın.',
          'Siparişin kanalda yeni oluştuğunu düşünüyorsanız bir sonraki zamanlanmış çekimi bekleyip listeyi yenileyin.',
          'Kanalın ayar ekranında **Entegrasyon durumu**’nun açık olduğunu kontrol edin.',
          '**Entegrasyon sağlığı** ekranında kanalın son başarılı senkron zamanına, son hatasına ve devre kesici durumuna bakın.',
          'Trendyol kullanıyorsanız webhook durumunun **Bildirim alınıyor** olduğunu kontrol edin; **Bildirim kesildi** görünüyorsa yeni adres üretip Trendyol panelinde güncelleyin.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Webhook adresi bozulsa bile siparişler zamanlanmış çekimle gelmeye devam eder; yalnız gecikmeli gelir.' },
      { type: 'note', tone: 'warning', text: 'Kanalın API anahtarı değiştiyse veya süresi dolduysa siparişler çekilemez. Yeni bilgileri entegrasyon ayarlarına girin.' },
    ],
    goTo: [
      { screen: 'OrderListView', label: 'Siparişler ekranını aç' },
      { screen: 'integrations/IntegrationHealthView', label: 'Entegrasyon sağlığı ekranını aç' },
    ],
    related: ['int-health', 'ord-lifecycle', 'int-errors'],
  },

  // Kanıt: frontend/src/plugins/locales/tr.json (stockPolicy.channels.description formülü, stockHealth.kpi.publishPending, stockHealth.reconciliation, stockHealth.legend.UNMAPPED),
  //        frontend/src/views/secure/StockHealthView.vue, frontend/src/views/secure/integrations/StockPolicyView.vue, frontend/src/components/productDefinitions/products/BatchActions/subcomponents/BatchActionMenu.vue ("Platform Stoklarını Güncelle")
  {
    id: 'ts-stock-mismatch',
    category: 'troubleshooting',
    order: 3,
    title: 'Stok farklı görünüyor',
    summary: 'Pazaryerindeki stok ile Entegrasyonik’teki stok farklıysa olası nedenler ve çözümler.',
    keywords: ['stok farklı', 'stok uyuşmuyor', 'stok yanlış', 'stok güncellenmedi', 'stok eksik', 'tampon'],
    body: [
      { type: 'p', text: 'Pazaryerinde gördüğünüz stok ile Entegrasyonik’teki stok arasındaki farkın çoğu zaman bilinen bir nedeni vardır. Aşağıdakileri sırayla kontrol edin.' },
      {
        type: 'table',
        head: ['Neden', 'Nasıl anlaşılır', 'Ne yapmalı'],
        rows: [
          ['Tampon (güvenlik stoğu)', 'Fark, kanalın tampon adet veya yüzdesi kadar.', 'Beklenen davranıştır. Değeri **Stok politikası** ekranından değiştirebilirsiniz.'],
          ['Rezerve miktar', 'Kargolanmamış siparişler var.', 'Kanala kullanılabilir stok yayınlanır; kargoya verilince rezerv kesinleşir.'],
          ['Yayın bekleyen değişiklik', '**Stok sağlığı** ekranında **Yayın bekleyen** sayısı sıfırdan büyük.', 'Kısa süre bekleyin veya **Platform Stoklarını Güncelle** ile gönderin.'],
          ['Eşleşmeyen sipariş kalemi', '**Stok sağlığı** ekranında **Eşleşmeyen kalem** var.', 'Ürünün stok kodu veya barkodunu siparişteki değerle uyumlu hale getirin.'],
          ['Aşırı satış', '**Açık aşırı satış** göstergesi sıfırdan büyük.', 'Stoğu artırın veya ilgili siparişi iptal edin.'],
        ],
      },
      {
        type: 'steps',
        items: [
          'Önce **Stok sağlığı** ekranını açıp göstergelere bakın.',
          'Farkı tampon ile açıklayamıyorsanız ürünün stok miktarını kontrol edip kaydedin.',
          '**Ürünler > Toplu işlemler > Platform Stoklarını Güncelle** ile stoğu ilgili kanallara yeniden gönderin.',
          'Güncelleme işlemini **İşlem kayıtları** ekranından izleyin.',
        ],
      },
      { type: 'note', tone: 'info', text: 'Stok mutabakatı bulduğu farkları “yayın bekleyen” olarak işaretler; bu farklar sonraki gönderimde kanallara iletilir.' },
    ],
    goTo: [
      { screen: 'StockHealthView', label: 'Stok sağlığı ekranını aç' },
      { screen: 'StockPolicyView', label: 'Stok politikası ekranını aç' },
    ],
    related: ['stock-single', 'stock-channel-policy', 'stock-health', 'stock-reservation'],
  },

  // Kanıt: frontend/src/composables/restapi.ts (401 → giriş sayfasına yönlendirme), frontend/src/composables/useProblem.ts (network/timeout/auth/notFound/server metinleri, teknik ayrıntı),
  //        frontend/src/stores/workspace.ts ("Aradığınız ekran bulunamadı, panoya yönlendirildiniz.", "Bu ekrana erişiminiz yok ya da bulunamadı."),
  //        frontend/src/components/NoAuthorizationComponent.vue ("İşlem Yapma Yetkiniz Bulunmamaktadır."), docs/API_ACCOUNT_LIFECYCLE.md (7 gün oturum, 5 deneme/15 dk kilit, 429)
  {
    id: 'ts-common',
    category: 'troubleshooting',
    order: 4,
    title: 'Sık karşılaşılan hatalar',
    summary: 'Oturum düşmesi, yetki yok, sunucuya ulaşılamadı, ekran bulunamadı gibi mesajların anlamı ve çözümü.',
    keywords: ['hata', 'oturum düştü', 'oturum süresi doldu', 'yetki yok', 'sunucuya ulaşılamadı', 'ekran bulunamadı', 'yüklenemedi', 'çok fazla istek'],
    body: [
      { type: 'p', text: 'Bir ekran yüklenemediğinde uygulama ham hata yerine ne olduğunu ve ne yapmanız gerektiğini anlatan bir mesaj gösterir. Mesajın altındaki teknik ayrıntıyı destek talebinize ekleyebilirsiniz.' },
      {
        type: 'table',
        head: ['Mesaj / durum', 'Olası neden', 'Ne yapmalı'],
        rows: [
          ['Giriş ekranına yönlendirildiniz', 'Oturum süreniz doldu (oturumlar en fazla 7 gün sürer), parolanız değiştirildi ya da başka bir cihazdan parola sıfırlandı.', 'Yeniden giriş yapın.'],
          ['İşlem Yapma Yetkiniz Bulunmamaktadır / Bu ekran için yetkiniz yok', 'Hesabınızın yetki grubu bu ekrana veya işleme izin vermiyor.', 'Mağaza yöneticinizden yetki isteyin.'],
          ['Sunucuya ulaşılamadı', 'İnternet bağlantınız kesildi ya da Entegrasyonik sunucusuna o an erişilemiyor.', 'Bağlantınızı kontrol edip tekrar deneyin.'],
          ['Sunucu isteğe zamanında yanıt vermedi', 'Geçici yoğunluk.', 'Birkaç saniye bekleyip tekrar deneyin.'],
          ['Aradığınız ekran bulunamadı, panoya yönlendirildiniz', 'Açtığınız adres geçersiz ya da artık kullanılmıyor.', 'Ekrana menüden veya akıllı aramadan ulaşın.'],
          ['Bu ekrana erişiminiz yok ya da bulunamadı', 'Bağlantıdaki ekran menünüzde yok.', 'Yetkiniz olduğundan emin olun; gerekirse yöneticinize başvurun.'],
          ['Çok fazla deneme / istek', 'Kısa sürede çok sayıda istek yapıldı.', 'Birkaç dakika bekleyip tekrar deneyin.'],
          ['Hesap geçici olarak kilitlendi', 'Parola art arda 5 kez yanlış girildi.', '15 dakika bekleyin veya parolanızı sıfırlayın.'],
        ],
      },
      { type: 'note', tone: 'info', text: 'Sayfa verisini yenilemek için ekrandaki yenile düğmesini veya kısayolu kullanın; tarayıcıyı yenilemek de açık sekmelerinizi korur.' },
      { type: 'note', tone: 'info', text: 'Pazaryeri kaynaklı hataların (kategori, özellik listesi alınamadı vb.) anlamları için **Entegrasyon hata mesajları** makalesine bakın.' },
    ],
    related: ['int-errors', 'acc-password', 'support-ticket', 'app-workspace-tabs'],
  },

  // ───────────────────────────── Sık sorulan sorular ─────────────────────────────

  // Kanıt: CLAUDE.md (gerçek entegrasyonlar), site/src/data/connect.ts (Ideasoft test ortamı), frontend/src/plugins/locales/tr.json (stockPolicy, privacyData, messages.sla, integrationComingSoon),
  //        frontend/src/composables/useSavedViews.ts, frontend/src/stores/theme.ts, frontend/src/views/secure/user/SubscriptionView.vue, backend/src/database/client/models/Notification.ts,
  //        frontend/src/components/message/messageSla.ts, frontend/src/views/secure/user/AccountSecurityView.vue
  {
    id: 'faq-general',
    category: 'faq',
    order: 1,
    title: 'Sık sorulan sorular',
    summary: 'Entegrasyonik hakkında en sık sorulan soruların kısa yanıtları.',
    keywords: ['sss', 'sık sorulan', 'soru', 'yanıt', 'faq'],
    body: [
      { type: 'p', text: 'Aşağıda en sık sorulan soruların kısa yanıtlarını bulabilirsiniz. Ayrıntı için ilgili makalelere bakın.' },
      {
        type: 'faq',
        items: [
          { q: 'Hangi kanallarla çalışabilirim?', a: 'Pazaryeri olarak Trendyol, Hepsiburada, N11 ve Pazarama; e-ticaret olarak Ideasoft (şu an test ortamında) ve ERP olarak Bizimhesap bağlanabilir. Kargo ve e-fatura entegrasyonları henüz yoktur.' },
          { q: 'Ürünlerim kaydettiğimde pazaryerine otomatik gider mi?', a: 'Hayır. Ürünü kaydetmek gönderim yapmaz; ürün listesindeki Toplu işlemler > Kanallara yükle ile gönderimi siz başlatırsınız.' },
          { q: 'Her pazaryeri için ayrı stok girmem gerekir mi?', a: 'Hayır. Her varyantın tek bir stoğu vardır ve tüm kanallar bu stoktan beslenir. Kanallara yayınlanan miktar, stok politikanızdaki tampon kadar daha az olabilir.' },
          { q: 'Pazaryerindeki stok neden benim girdiğimden az görünüyor?', a: 'Büyük olasılıkla birincil olmayan kanallara uygulanan tampon (güvenlik stoğu) veya kargolanmamış siparişler için ayrılan rezerv nedeniyle. Stok politikası ve Stok sağlığı ekranlarından kontrol edebilirsiniz.' },
          { q: 'Aşırı satış olursa ne olur?', a: 'Sipariş kalemi Aşırı satış olarak işaretlenir. Stok politikanızdaki bekleme süresi (varsayılan 30 dakika) boyunca stok gelmesi beklenir; süre dolduğunda otomatik iptal açıksa ve kanal destekliyorsa satır iptal edilir, değilse işlem size düşer.' },
          { q: 'Fatura kesebilir miyim?', a: 'Entegrasyonik bugün bir e-fatura sağlayıcısına bağlı değildir. Faturayı kendi sağlayıcınızda kesip fatura numarası ve bağlantısını siparişe girdiğinizde Entegrasyonik bu bilgiyi kanala iletir.' },
          { q: 'Müşteri mesajlarındaki 24 ve 48 saat sınırları pazaryeri kuralı mı?', a: 'Hayır. Bu eşikler önceliklendirme için Entegrasyonik’in önerisidir; pazaryerlerinin resmi yanıt süresi değildir.' },
          { q: 'Kayıtlı görünümlerim neden başka bilgisayarda görünmüyor?', a: 'Kayıtlı görünümler yalnız sizin için ve kaydettiğiniz tarayıcıda saklanır; cihazlar arasında paylaşılmaz.' },
          { q: 'Bildirimlerim neden kayboldu?', a: 'Bildirimler oluşturulduktan 3 gün sonra otomatik olarak silinir.' },
          { q: 'Koyu tema var mı?', a: 'Hayır, uygulama şu an yalnız açık görünümle çalışır. Ekran alanını düzenlemek için menüyü daraltabilir veya odak modunu kullanabilirsiniz.' },
          { q: 'Verilerimin bir kopyasını alabilir miyim?', a: 'Evet. Mağaza sahibi Veri ve gizlilik ekranından tüm mağaza verilerini ZIP arşivi olarak indirebilir. Bağlantı 24 saat geçerlidir ve tek kullanımlıktır.' },
          { q: 'İki adımlı doğrulama var mı?', a: 'Şu an yoktur. Güçlü bir parola kullanmanızı ve e-posta adresinizi doğrulamanızı öneririz.' },
        ],
      },
    ],
    related: ['int-scope', 'stock-channel-policy', 'support-ticket'],
  },

  // ───────────────────────────── Destek ─────────────────────────────

  // Kanıt: frontend/src/views/secure/supports/TicketListView.vue ("Yeni Bilet Aç", filtreler Durumlar/Öncelik/Talep tipi/Başlangıç/Bitiş, toplu kapatma),
  //        frontend/src/components/ticket/TicketCreateDialog.vue (Talep tipi, Öncelik, Konu, Mesajınız, karakter sayacı, "Talebi Gönder", "Talebiniz alındı", Talep no, "Talebi görüntüle"),
  //        frontend/src/components/ticket/TicketDetailComponent.vue (Yazışma geçmişi, "Yanıtınız", Gönder), frontend/src/types/TicketTypes.ts (tip/öncelik etiketleri),
  //        frontend/src/plugins/locales/tr.json (status.ticket), frontend/src/components/layout/ApplicationBar.vue (Yardım menüsü > "Destek kayıtları"), backend/src/capabilities/domains/support.ts
  {
    id: 'support-ticket',
    category: 'support',
    order: 1,
    title: 'Destek talebi açma',
    summary: 'Destek ekibine uygulama içinden talep açın, yanıtları izleyin ve yazışmayı sürdürün.',
    keywords: ['destek', 'destek talebi', 'bilet', 'ticket', 'yardım iste', 'hata bildir', 'özellik talebi', 'iletişim'],
    body: [
      { type: 'p', text: 'Bir sorunu çözemediğinizde veya bir öneriniz olduğunda destek ekibine uygulama içinden talep açabilirsiniz. Tüm yazışmalarınız **Destek Talepleri** ekranında saklanır.' },
      {
        type: 'steps',
        items: [
          'Üst bardaki **Yardım** menüsünden **Destek talepleri**’ni seçin veya menüdeki **Destek talepleri** ekranını açın.',
          '**Yeni talep**’e basın.',
          '**Talep tipi**ni seçin: Genel, Teknik Destek, Muhasebe / Fatura, Özellik Talebi, Hata Bildirimi veya Diğer.',
          '**Öncelik** seçin: Düşük, Orta, Yüksek veya Acil.',
          '**Konu** ve **Mesajınız** alanlarını doldurun. Alanların altındaki sayaç kullandığınız karakter sayısını ve sınırı gösterir.',
          '**Talebi Gönder**’e basın. Onay ekranında talep numaranızı görürsünüz; **Talebi görüntüle** ile yazışmayı açabilirsiniz.',
        ],
      },
      { type: 'h', text: 'İyi bir talep için' },
      {
        type: 'list',
        items: [
          'Hangi ekranda, hangi işlemi yaparken sorunu yaşadığınızı yazın.',
          'İlgili sipariş, ürün veya stok kodunu ekleyin.',
          'Ekranda görünen hata mesajını ve varsa teknik ayrıntıdaki istek kimliğini kopyalayın.',
        ],
      },
      { type: 'note', tone: 'warning', text: 'Parolanızı veya pazaryeri API anahtarlarınızı destek taleplerine asla yazmayın. Destek ekibi bu bilgileri sizden istemez.' },
      { type: 'h', text: 'Talebi takip etme' },
      { type: 'p', text: 'Talepler listesinde durum (Açık, İşleniyor, Yanıt Bekliyor, Çözüldü, Kapatıldı), öncelik ve tipe göre süzebilirsiniz. Bir talebi açtığınızda yazışma geçmişini görür, **Yanıtınız** alanından mesaj gönderirsiniz. Durumu **Yanıt Bekliyor** olan talepler sizden bilgi bekler. Çözülen talepleri listeden seçerek kapatabilirsiniz.' },
      { type: 'note', tone: 'info', text: 'Gönderim sırasında bir sorun olursa yazdıklarınız korunur; **Tekrar dene** ile yeniden gönderebilirsiniz.' },
    ],
    goTo: [{ screen: 'supports/TicketListView', label: 'Destek talepleri ekranını aç' }],
    related: ['ts-common', 'int-errors', 'faq-general'],
  },
]

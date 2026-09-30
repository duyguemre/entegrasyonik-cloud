/**
 * frontend/src/help/hints.ts
 *
 * Satır içi "(?)" ipuçları — kritik alanların yanında gösterilen kısa açıklamalar. SAF TS (vue/vuetify yok).
 *
 * İÇERİK KURALI (types.ts ile aynı): yalnız kodda GERÇEKTEN var olan davranış anlatılır. Her kaydın üstünde:
 *   `// Kanıt:` metnin dayandığı dosyalar,
 *   `// Yer:`   (?) simgesinin yerleştirileceği Vue dosyası + yakınındaki etiket/öğe.
 * Kanal kimlik bilgisi türleri `site/src/data/connect.ts` `credentials` etiketleriyle, "nereden alınır" ifadesi
 * aynı dosyadaki `WHERE` metinleriyle BİREBİR tutarlıdır (kanala özgü menü yolu yazılmaz).
 * `article` değerleri yardım merkezi makale kimlikleridir.
 */

export interface HelpHint {
  title: string
  text: string
  article?: string
}

export const HELP_HINTS = {
  // Kanıt: site/src/data/connect.ts (trendyol: 'Satıcı kimliği', 'API anahtarı', 'API gizli anahtarı'; WHERE.marketplace)
  // Yer: components/integrations/marketplace/TrendyolComponent.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.trendyol': {
    title: 'Trendyol kimlik bilgileri',
    text: 'Gerekli bilgiler: satıcı kimliği, API anahtarı ve API gizli anahtarı. İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (hepsiburada: 'Satıcı (mağaza) kimliği', 'API anahtarı', 'API gizli anahtarı'; WHERE.marketplace)
  // Yer: components/integrations/marketplace/HepsiburadaComponent.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.hepsiburada': {
    title: 'Hepsiburada kimlik bilgileri',
    text: 'Gerekli bilgiler: satıcı (mağaza) kimliği, API anahtarı ve API gizli anahtarı. İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (n11: 'API anahtarı', 'API gizli anahtarı'; WHERE.marketplace)
  // Yer: components/integrations/marketplace/N11Component.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.n11': {
    title: 'N11 kimlik bilgileri',
    text: 'Gerekli bilgiler: API anahtarı ve API gizli anahtarı. İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (pazarama: 'API anahtarı', 'API gizli anahtarı'; WHERE.marketplace)
  // Yer: components/integrations/marketplace/PazaramaComponent.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.pazarama': {
    title: 'Pazarama kimlik bilgileri',
    text: 'Gerekli bilgiler: API anahtarı ve API gizli anahtarı. İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (ideasoft: 'Mağaza adı', 'Anahtar (key)', 'Gizli anahtar (secret)' + note; WHERE.ecommerce),
  //        components/integrations/ecommerce/IdeasoftComponent.vue (Client ID → settings.key, Client Secret → settings.secret)
  // Yer: components/integrations/ecommerce/IdeasoftComponent.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.ideasoft': {
    title: 'Ideasoft kimlik bilgileri',
    text: 'Gerekli bilgiler: mağaza adı, anahtar (key) ve gizli anahtar (secret); formda Client ID ve Client Secret alanlarına girilir. Mağaza panelinizden entegrasyon kimlik bilgilerinizi edinin. Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test ortamında çalışır.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (bizimhesap: 'Anahtar (key)', 'Gizli anahtar (secret)'; WHERE.erp),
  //        components/integrations/erp/BizimhesapComponent.vue (Bizimhesap ID → settings.key, Api Key → settings.secret)
  // Yer: components/integrations/erp/BizimhesapComponent.vue → EkFormSection title="Bağlantı bilgileri" başlığının yanı
  'integration.credentials.bizimhesap': {
    title: 'Bizimhesap kimlik bilgileri',
    text: 'Gerekli bilgiler: anahtar (key) ve gizli anahtar (secret); formda Bizimhesap ID ve Api Key alanlarına girilir. ERP hesabınızdan entegrasyon kimlik bilgilerinizi edinin.',
    article: 'int-channel-connect',
  },

  // Kanıt: site/src/data/connect.ts (COMMON_STEPS), components/integrations/IntegrationFormFrame.vue (Kaydet/Vazgeç),
  //        components/integrations/IntegrationComingSoonPanel.vue ("Yakında" sağlayıcılarda kimlik alanı yok)
  // Yer: views/secure/integrations/{Marketplace,ECommerce,Erp}View.vue → IntegrationGuideCard "API Bağlantısı" adımının yanı
  //      (yeni eklenecek her entegrasyon formunda EkFormSection title="Bağlantı bilgileri" başlığının yanı)
  'integration.credentials.generic': {
    title: 'Bağlantı bilgileri',
    text: 'Kimlik bilgilerini ilgili sağlayıcının panelinden edinip bu bölüme girin ve kaydedin. Eksik bir alan olduğunda ekran hangi bilginin gerektiğini belirtir. "Yakında" olarak gösterilen sağlayıcılar için henüz bilgi girilemez.',
    article: 'int-channel-connect',
  },

  // Kanıt: views/secure/integrations/StockPolicyView.vue, composables/useStockPolicyApi.ts (computePublishQuantity),
  //        plugins/locales/tr.json stockPolicy.primary.* / stockPolicy.fields.autoCancel*
  // Yer: views/secure/integrations/StockPolicyView.vue → EkSettingsSection "Birincil kanal" başlığının / "Birincil satış kanalı" seçim kutusunun yanı
  'stock.channelPolicy': {
    title: 'Birincil kanal ve kanal kuralları',
    text: 'Son adetler birincil kanalda satılır; diğer kanallara tampon düşülerek daha az stok yayınlanır. Otomatik seçimde ilk bağlanan pazaryeri birincil sayılır. Aşırı satışta bekleme süresi dolunca satır, otomatik iptal açıksa ve pazaryeri destekliyorsa iptal edilir.',
    article: 'stock-channel-policy',
  },

  // Kanıt: composables/useStockPolicyApi.ts (publish = satılabilir − max(tampon adet, stok × tampon yüzdesi); birincilde tampon adet 0),
  //        plugins/locales/tr.json stockPolicy.channels.description / stockPolicy.fields.bufferUnits*
  // Yer: views/secure/integrations/StockPolicyView.vue → kanal kartındaki "Tampon adet" alanının yanı
  'stock.safetyStock': {
    title: 'Tampon (güvenlik stoğu)',
    text: 'Yayınlanan stok = satılabilir stok − en büyüğü (tampon adet, stok × tampon yüzdesi); sonuç sıfırın altına inmez. Birincil kanalda tampon adet uygulanmaz. Boş bıraktığınız alanda varsayılan değer kullanılır.',
    article: 'stock-channel-policy',
  },

  // Kanıt: components/productDefinitions/crud/PlatformPriceComponent.vue (applyPrices: CONSTANT/PERCENTAGE/VALUE, Satış/Piyasa, Çıkar),
  //        components/productDefinitions/variants/ProductSingleVariantComponent.vue ("Platform Bazında Fiyat" onay kutusu).
  //        Not: entegrasyon ayar formlarında fiyat kuralı / çarpan alanı YOKTUR; fiyatlar varyant bazında girilir.
  // Yer: components/productDefinitions/crud/PlatformPriceComponent.vue → "Toplu Fiyat Atama" alanının yanı
  'price.rules': {
    title: 'Kanal bazında fiyat',
    text: '"Platform Bazında Fiyat" açıksa her kanal için ayrı satış ve piyasa fiyatı girilir. Toplu fiyat atama, fiyatı olan tüm kanallarda satış veya piyasa fiyatına sabit değer atar ya da tutar veya yüzde olarak ekler; "Çıkar" seçiliyse düşer. Bu işlem formdaki değerleri değiştirir; ürünü kaydedince geçerli olur.',
    article: 'cat-products-variants',
  },

  // Kanıt: components/CategorySyncComponent.vue (yalnız children.length == 0 kategoride eşleştirme, Kaydet → "Bağlantı Kuruldu",
  //        otomatik eşleştirme notları), components/CategoryIntegrationSelectBoxComponent.vue (komisyon oranı ipucu)
  // Yer: components/CategorySyncComponent.vue → CardComponent title="Platform Kategori Eşleştirme" başlığının yanı
  'mapping.category': {
    title: 'Kategori eşleştirme',
    text: 'Yalnızca alt kategorisi olmayan (uç) kategoriler platform kategorisiyle eşleştirilir. Platform ve kategori seçip kaydettiğinizde "Bağlantı Kuruldu" görünür; ardından seçenek eşleştirmesine geçebilirsiniz. Otomatik eşleştirme yalnızca boş eşleşmeleri doldurur, sonucu kontrol edin.',
    article: 'cat-mapping',
  },

  // Kanıt: components/BrandSyncComponent.vue ("Platform Marka Eşleştirme", marka eşleştirme sunmayan platform notu),
  //        components/BrandIntegrationSelectBoxComponent.vue (platform markası araması)
  // Yer: components/BrandSyncComponent.vue → CardComponent title="Platform Marka Eşleştirme" başlığının yanı
  'mapping.brand': {
    title: 'Marka eşleştirme',
    text: 'Markanızın platformdaki karşılığını arayıp seçin ve kaydedin. Bazı platformlar marka eşleştirme sunmaz; bu durumda ekran bunu belirtir.',
    article: 'cat-mapping',
  },

  // Kanıt: components/CategorySyncComponent.vue ("Seçenek eşleştirme" yalnız kategori kaydedildikten sonra; Nitelik/Varyant/Ürün bölen rozetleri),
  //        components/ChoicesMappingComponent.vue (Grup (slicer) / Varyant düğmeleri, değer eşleştirme, Otomatik Eşleştir)
  // Yer: components/ChoicesMappingComponent.vue → EkFormSection title="Değer eşleştirme" başlığının yanı
  //      (ikincil: components/CategorySyncComponent.vue → "Platform seçeneği" seçim kutusu)
  'mapping.attribute': {
    title: 'Seçenek ve değer eşleştirme',
    text: 'Kategori bağlantısı kaydedildikten sonra platform seçeneklerini Entegrasyonik seçenek gruplarınızla, değerleri de tek tek eşleştirin. Bir kategoride yalnızca bir seçenek grup (slicer) olarak atanabilir. Otomatik Eşleştir önerileri kaydetmeden önce kontrol edin.',
    article: 'cat-mapping',
  },

  // Kanıt: components/productDefinitions/variants/ProductVariantAttributesComponent.vue ("Zorunlu Özellikleri (*)",
  //        "Kategorisi Eşleştirmesi Yapılmalı." / "Seçenek Eşleştirmesi Yapılmalı." uyarıları)
  // Yer: components/productDefinitions/variants/ProductVariantAttributesComponent.vue → CardComponent title="Zorunlu Özellikleri (*)" başlığının yanı
  //      (aynısı ProductBatchVariantAttributesComponent.vue içinde)
  'attributes.required': {
    title: 'Zorunlu pazaryeri özellikleri',
    text: 'Yıldızlı özellikler seçili pazaryeri için zorunludur; ürünü o kanala göndermeden önce doldurun. Özellikler görünmüyorsa önce Kategoriler ekranında bu kategorinin platform ve seçenek eşleştirmelerini tamamlayın.',
    article: 'cat-required-attributes',
  },

  // Kanıt: components/productDefinitions/products/BatchActions/subcomponents/BatchProcessDialog.vue (Kapsam: Seçilenler/Filtrelenmiş/Tüm Katalog),
  //        BatchActions/useBatchActions.ts (işlem kuyruğa alınır; DELETE "kalıcı olarak siler"), BatchDeleteDialog.vue ("Bu işlem geri alınamaz.")
  // Yer: components/productDefinitions/products/BatchActions/subcomponents/BatchProcessDialog.vue → EkFormSection title="Kapsam" başlığının yanı
  'bulk.confirm': {
    title: 'Toplu işlem kapsamı',
    text: 'İşlem kapsamı seçtiğiniz satırlar, filtrelenmiş liste veya tüm katalog olabilir; onayladığınızda işlem kuyruğa alınır ve sonucu bildirimlerde görürsünüz. Toplu silme ürünleri kalıcı olarak siler ve geri alınamaz.',
    article: 'app-bulk-actions',
  },

  // Kanıt: views/secure/ClaimListView.vue (EkFormDialog "İade/talep reddi" → "Red gerekçesi"),
  //        components/claim/composables/useClaimActions.ts (onay → ücret iadesi süreci; red → pazaryerine anında bildirilir),
  //        composables/useLifecycle.ts (APPROVE/REJECT yalnız UNDER_REVIEW/DISPUTED = "İncelemede")
  // Yer: views/secure/ClaimListView.vue → EkFormDialog title="İade/talep reddi" içindeki "Red gerekçesi" seçim kutusunun yanı
  //      (ikincil: components/claim/ClaimDetailComponent.vue onay/red düğmeleri)
  'claim.decision': {
    title: 'İade kararı',
    text: 'Onay ve red yalnızca "İncelemede" durumundaki taleplerde yapılabilir. Onayladığınızda müşteriye ücret iadesi süreci başlar; reddetmek için gerekçe seçmeniz gerekir ve karar pazaryerine hemen bildirilir.',
    article: 'ord-returns',
  },

  // Kanıt: views/secure/user/PrivacyDataView.vue, composables/useTenantDataApi.ts, plugins/locales/tr.json privacyData.export.*
  // Yer: views/secure/user/PrivacyDataView.vue → EkSettingsSection "Verilerinizi dışa aktarın" başlığının yanı
  'privacy.export': {
    title: 'Veri dışa aktarma',
    text: 'Mağazanızın verileri ZIP arşivinde NDJSON dosyaları olarak hazırlanır; parolalar ve pazaryeri API anahtarları eklenmez. İndirme bağlantısı 24 saat geçerli ve tek kullanımlıktır. Bu işlemi yalnızca mağaza sahibi yapabilir.',
    article: 'acc-privacy',
  },

  // Kanıt: views/secure/user/PrivacyDataView.vue, composables/useTenantDataApi.ts, plugins/locales/tr.json privacyData.deletion.*
  // Yer: views/secure/user/PrivacyDataView.vue → EkSettingsSection "Mağazayı sil" başlığının yanı
  'privacy.delete': {
    title: 'Mağaza silme talebi',
    text: 'Talep için parolanızı girip mağaza adını aynen yazmanız gerekir; bu işlemi yalnızca mağaza sahibi yapabilir. Talep sonrası mağaza 30 gün askıda kalır ve bu sürede geri alma yalnızca destek ekibi üzerinden yapılır. Verilerinize ihtiyacınız varsa önce dışa aktarın.',
    article: 'acc-privacy',
  },

  // Kanıt: views/secure/user/SubscriptionView.vue (planActionLabel, openConfirm, checkout uyarısı), composables/subscriptionStatus.ts
  // Yer: views/secure/user/SubscriptionView.vue → h3.section-title "Planlar" başlığının yanı
  'subscription.plan': {
    title: 'Plan seçimi',
    text: 'Bu Plana Geç düğmesi onayınızdan sonra ödeme adımını başlatır; abonelik durumunuz ödeme sağlayıcısından onay gelince otomatik güncellenir. Deneme sürümünde deneme bitimine kadar tüm özellikler açıktır. Askıya alınan abonelikte verileriniz görüntülenebilir ama düzenleme ve pazaryeri senkronizasyonu durur.',
    article: 'acc-subscription',
  },

  // Kanıt: views/secure/OrderListView.vue (iptal EkFormDialog + "Fatura iptali gereklidir" uyarısı, isOrderLocked),
  //        composables/useLifecycle.ts (APPROVE yalnız AWAITING_APPROVAL; CANCEL kargolanan/teslim edilen/iptal/iade dışında),
  //        components/order/composables/useOrderCancel.ts (toplu iptal "geri alınamaz")
  // Yer: views/secure/OrderListView.vue → EkFormDialog "Sipariş iptali" içindeki "İptal gerekçesi" seçim kutusunun yanı
  //      (ikincil: #bulk-actions "Onayla" düğmesi)
  'order.approveCancel': {
    title: 'Sipariş onayı ve iptali',
    text: 'Onay yalnızca "Satıcı Onayı Bekliyor" durumundaki siparişlerde açıktır. Kargoya verilmiş, teslim edilmiş veya iade edilmiş sipariş iptal edilemez; iptal pazaryerinde gerekçeyle yapılır ve geri alınamaz. Faturası kesilmiş siparişte faturayı e-Fatura portalınızdan ayrıca iptal etmeniz gerekir.',
    article: 'ord-approve-cancel',
  },
} satisfies Record<string, HelpHint>

export type HelpHintId = keyof typeof HELP_HINTS

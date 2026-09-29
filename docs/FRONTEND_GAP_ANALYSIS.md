# FRONTEND GAP ANALYSIS — Web Uygulaması (`frontend/`) Eksik / Yarım / Ölü Ekran Denetimi

Tarih: 2026-09-28 · Kapsam: `frontend/src/**`, `backend/src/api/**` · Yöntem: salt okuma denetimi (kod YAZILMADI, hiçbir ekran silinmedi).
Her iddia `dosya:satır` kanıtlıdır; doğrulanamayan noktalar §6'da ayrıca listelidir.

## 0. Kapsam, yöntem ve sınırlar

- **Taban dal:** Bu worktree ilk açıldığında çok eski `master` üzerindeydi (ADR/`docs/`/`navigation/` yoktu). Denetim için worktree dalı, `faz3-arayuz` ucuna (`21fae95`) `git reset --hard` ile eşitlendi (kendi worktree dalım, temiz durum, yerel işlem). Tüm bulgular bu taban içindir.
- **Backend yüzeyi:** `backend/src/api/operationPolicy.ts` (varsayılan-ret izinli liste; mekanik sayım **158** `(servis, operasyon)` çifti, ImageApi sözde-servisi dahil — `docs/OPERATION_POLICY.md:17` "156" diyor, 2'lik fark ayrıştırma biçiminden kaynaklanıyor olabilir, doğrulanamadı) + `backend/src/api/services/*.ts` (public `async` metotlar) karşılaştırıldı.
- **Frontend çağrı envanteri:** `frontend/src/**` içinde `"<Servis>/<operasyon>"` sabitleri mekanik tarandı (GET `restApi.get("<Servis>")`, ImageApi `postImage/postImageUpload` kalıpları ayrıca elle doğrulandı).
- **Menü kaynağı repo DIŞI:** Menü `MenuService.get` ile ApplicationDB `menus` koleksiyonundan (`_id: "entegrator"`) gelir, **tüm kullanıcılar için tek belge**, rol/kademe süzmesi YOK (`backend/src/api/services/menu-service.ts:5-13`; `docs/adr/0012-...md:11`). Bu nedenle bir ekranın "menüde gerçekten var mı" bilgisi koddan kanıtlanamaz; proxy olarak (i) `frontend/src/stores/site/menu.ts:16-70` `views` Map kaydı, (ii) `frontend/src/navigation/screens.ts` URL kaydı, (iii) `frontend/e2e/fixtures/nav.ts` `MENU_SCREENS`/`menuFixture` ve (iv) i18n `menu.*` anahtarları (`plugins/locales/tr.json`) kullanıldı.
- **ADR-0015 bu dalda YOK:** `docs/adr/` en fazla `0014`'e kadar; `git log --all -- docs/adr/0015*` boş. Bu yüzden "ADR-0015 B-grubu" eşlemesi bu raporda **öneri niteliğindedir** (§3'te A/B/C etiketi = bu raporun kendi gruplaması; ADR-0015 içeriğiyle uzlaştırılması orkestratöre bırakıldı).
- **Test durumu (spec):** `frontend/e2e/specs/*.spec.ts` (19 dosya) + `frontend/tests/*` (vitest: kayıt-niyeti, tema). Spec var/yok kolonu buna göre.

---

## (a) Mevcut ekran envanteri

Durum: **tam** = gerçek API + boş/hata durumu; **yarım** = çalışan çekirdek ama belirgin eksik/sahte içerik/kırık akış; **ölü** = hiçbir gerçek işlevi yok veya erişilemez.
"Kayıtlı" = `screens.ts` (URL-senkronlu) / `menu.ts` `views` Map (sekme olarak açılabilir). "Spec" = Playwright characterization.

| # | Ekran | Dosya | `screens.ts` | `menu.ts` | Durum | Spec | Kanıt / not |
|---|---|---|---|---|---|---|---|
| 1 | Anasayfa (pano) | `views/secure/DashboardView.vue` | evet (`screens.ts:50`) | evet (`menu.ts:16`) | yarım | evet (`dashboard.spec.ts`) | Sahte/sabit metin: "Bugün Trendyol entegrasyonunda %15 daha fazla sipariş aldınız" (`components/dashboard/MarketplaceLinksComponent.vue:30`). Entegrasyon "durumu" kartı yalnız ürün yayın durumu sayar (PENDING/WAITING/FAILED/COMPLETED, `:72-87`); bağlantı sağlığı/son senkron/webhook yok. |
| 2 | Sipariş yönetimi | `views/secure/OrderListView.vue` (1348 sat.) | evet | evet (`menu.ts:24`) | tam | evet (`orders.spec.ts`) | `OrderService/*` (`:784,883`) + `components/order/*`. `allocationState`/OVERSOLD alanı `getOrders` yanıtında var (`order-service.ts:80-104` projeksiyonsuz) ama FE hiç okumuyor (§b-3). |
| 3 | İade yönetimi | `views/secure/ClaimListView.vue` | evet | evet | tam | evet | `ClaimService/*` (`components/claim/composables/useClaimActions.ts:71-131`). |
| 4 | Müşteriler | `views/secure/CustomerListView.vue` | evet | evet | tam (anonimleştirme yok) | evet | `CustomerService/{get,getDetail,update}`; `anonymizeCustomer` (KVKK) çağrılmıyor. |
| 5 | Mesajlar | `views/secure/MessageListView.vue` | evet | evet | tam | evet | `MessageService/*`. |
| 6 | Faturalar | `views/secure/InvoiceListView.vue` | evet | evet | tam | evet | `InvoiceService/*`; e-fatura sağlayıcı entegrasyonu backend'de yok (§b-3). |
| 7 | İşlemler (log listeleri) | `views/secure/LogListView.vue` + `components/logListView/*` | evet | evet | tam | evet (`logs.spec.ts`) | Export/Import iş günlüğü; **tenant denetim günlüğü (AuditLogs) DEĞİL**. |
| 8 | Ürün listesi | `views/secure/productDefinitions/ProductListView.vue` (1496 sat.) | evet | evet | tam | evet (`products.spec.ts`) | 11 `restApi` çağrısı. `parameters`'tan filtre okumuyor (`screens.ts:59-63`). |
| 9 | Ürün tanımla / kopyala | `views/secure/definitions/ProductDefinitionView.vue` | hayır | evet (`menu.ts:46`) | tam | **yok** | Menü başlığı `productDefinition` ile açılıyor (`ProductListView.vue:660`, `ApplicationBar.vue:330`). |
| 10 | Ürün güncelle | `views/secure/definitions/ProductUpdateView.vue` | hayır (`instanceParam` planı yok) | evet (`menu.ts:40`) | tam | **yok** | `ProductListView.vue:666`; derin bağlantı yok (`screens.ts:59-63`). |
| 11 | Kategoriler | `views/secure/productDefinitions/CategoryListView.vue` (+`CategorySyncComponent`) | hayır | evet (`menu.ts:35`) | tam | **yok** | `CategoryService/*`, `AttributeMappingService/*`. |
| 12 | Markalar | `productDefinitions/BrandListView.vue` | hayır | evet | tam | **yok** | `BrandService/*`. |
| 13 | Seçenek grupları | `productDefinitions/ChoiceListView.vue` | hayır | evet | tam | **yok** | `ChoiceService/*` (9 çağrı). |
| 14 | Etiketler | `productDefinitions/HashtagListView.vue` | hayır | evet | tam | **yok** | `HashtagService/*`. |
| 15 | Kategori tanımla | `views/secure/definitions/CategoryDefinitionView.vue` | hayır | evet (`menu.ts:47`) | yarım | yok | 121 sat., 3 `restApi` — küçük sarmalayıcı; menüde var mı doğrulanamadı. |
| 16 | Finansal işlemler | `views/secure/FinancialListView.vue` (931 sat.) | hayır | evet (`menu.ts:28`) | tam (özet/kargo faturası/ödeme detayı yok) | **yok** | Yalnız `FinancialService/getTransactionData` (`:581`). Backend'de `getFinancialSummary`/`getCargoInvoices`/`getPayoutDetails` var, politika kaydı yok (§b-2). |
| 17 | Çıktılar (yazdırma) | `views/secure/PrintoutListView.vue` (647 sat.) | hayır | evet (`menu.ts:30`) | **ölü/prototip** | yok | Hiç `restApi` yok; sabit örnek veri (`:381-393` "Emre Yalçınkaya", "2.099,90"); `click: a` yalnızca `console.log`. Gerçek etiket/irsaliye yazdırma `components/order/BarcodePrintComponent.vue`'da. |
| 18 | Ayarlar | `views/secure/SettingListView.vue` | hayır | evet (`menu.ts:31`) | tam (kapsam dar) | **yok** | 4 sekme: Mağaza Kimliği/Fatura & Yasal/Lojistik/İletişim (`:11-26`); `SettingService/{get,update}Settings`. Stok politikası, bildirim tercihi, KVKK bölümü YOK. |
| 19 | Yetkilendirme (kullanıcılar) | `views/secure/user/AuthorizationListView.vue` + `components/user/UserAddComponent.vue` | hayır | evet (`menu.ts:68`) | tam (çekirdek) | **yok** | `UserService/{get,create,update,delete}User` (`:246,294,336`); rol seçimi (`UserAddComponent.vue:52`). Davet e-postası/rol yetki matrisi yok. Erişim kontrolü `userApi.checkAuthorization('navigation.authorization')` (`:3`) anlamı ters görünüyor (§6). |
| 20 | Abonelik ve planlar | `views/secure/user/SubscriptionView.vue` | evet (`screens.ts:88`) | evet (`menu.ts:64`) | **yarım** | evet (`subscription.spec.ts`) | Durum bandı + plan kartları + mock checkout (`:240,252,280`). İptal/plan değiştirme/kart/fatura geçmişi/kullanım-kota YOK (§b-3). |
| 21 | Destek talepleri | `views/secure/supports/TicketListView.vue` | hayır | evet (`menu.ts:60`) | tam | **yok** | `TicketService/*` (`useTicketActions.ts:16-63`); üst çubuk "?" simgesi buraya gidiyor (`ApplicationBar.vue:176`,`:345`). |
| 22 | Pazaryeri entegrasyonu | `views/secure/integrations/MarketplaceView.vue` | evet | evet | tam (yalnız 4 form) | evet | Form: Hepsiburada/Trendyol/Pazarama/N11 (`:32-47`); `AmazonComponent` import edilmiş ama render edilmiyor (`:95`). |
| 23 | E-ticaret entegrasyonu | `integrations/ECommerceView.vue` | evet | evet | **yarım** | evet | Shopify/Woo/Wix/Opencart/Ticimax/Anka/ETicaretSoft = yalnızca form, backend YOK (`INTEGRATIONS_REGISTRY.md:16,125-128`); "kullanılamıyor/yakında" etiketi yok (grep boş). Yalnız Ideasoft backend'li. |
| 24 | Kargo entegrasyonu | `integrations/ShippingView.vue` | evet | evet | **yarım** | evet | 9 kargo formu (`:31-63`) `saveClientShipmentSettings` ile ayar kaydeder ama backend adaptör YOK (`INTEGRATIONS_REGISTRY.md:147`). |
| 25 | E-fatura entegrasyonu | `integrations/EInvoiceView.vue` | evet | evet | **yarım/ölü** | evet | Sağlayıcı listesi `stores/einvoice.ts:6-39` içinde sabit; hiç `restApi` yok; `integration-service.ts`'te `einvoice` geçmiyor → kaydet yolu yok. |
| 26 | ERP entegrasyonu | `integrations/ErpView.vue` | evet | evet | tam (yalnız Bizimhesap) | evet | `retrieve/saveClientErpSettings` (`:105,114`). |
| 27 | Admin — Mağazalar | `adminPanel/AdminClientListView.vue` (+`AdminClient*Component`) | evet | evet | tam (platformAdmin) | evet | `AdminService/*`. Menü tenant'a da görünebilir, backend 403 (§6-2). |
| 28 | Admin — Destek | `adminPanel/AdminTicketListView.vue` | evet | evet | tam | evet | |
| 29 | Admin — Sistem | `adminPanel/AdminSystemManagementView.vue` | evet | evet | tam | evet | `getSystemHealth` yalnız platformAdmin (`operationPolicy.ts:~35`); tenant kendi entegrasyon sağlığını göremiyor. |
| 30 | Giriş / Kayıt | `views/unsecure/LoginView.vue` + `components/login/LoginComponent.vue` | (rota `/login`) | — | yarım | evet | "Şifremi unuttum" sekmesi ÖLÜ: `v-model`'siz alan, tıklama işleyicisiz buton (`LoginComponent.vue:182-192`); backend'de sıfırlama ucu yok (grep `forgot|reset` boş). CAPTCHA metni ekranda açık (`:49-50`, BACKLOG T1b). |
| 31 | Şifre değiştir | `views/secure/user/ChangePasswordView.vue` | hayır | evet (`menu.ts:63`) | **ölü** | yok | 28 satır; `<script setup>` boş, iki alan `v-model`'siz, gönder butonu yok (`:1-28`). Backend'de "kendi parolamı değiştir" ucu yok. |
| 32 | Fatura bilgileri (kullanıcı) | `views/secure/user/InvoiceInfoView.vue` | hayır | evet (`menu.ts:62`) | **ölü** | yok | Alanlar `v-model`'siz; `buttons` dizisi tanımlı ama şablonda kullanılmıyor (`:77`); iki radyo da `value=1` (`:10,12`). İşlev `SettingListView` "Fatura & Yasal Bilgiler" sekmesinde (`SettingListView.vue:15-18`) zaten var. |
| 33 | Çıkış | `views/secure/user/ExitView.vue` | hayır | evet (`menu.ts:66`) | **ölü** | yok | Gövde yalnız "EXIT" (`:3`); gerçek çıkış `ApplicationBar.vue:215`, `NavigationLinksComponent{Left,Right}.vue:43,54`. |
| 34 | Eğitim merkezi | (yok) `user/EducationView` | hayır | `menu.ts:65` → `SubscriptionView.vue`'ya bağlı | **ölü/yanlış bağlı** | yok | Panodaki "educationCenter" kısayolu (`NavigationLinksComponentLeft.vue:36`, `menu.ts:248`) abonelik ekranını açar (BACKLOG:58). Eğitim/yardım içeriği hiç yok. |
| 35 | Admin (kopya) | `adminPanel/AdminView.vue` (648 sat.) | hayır (bilinçli, `screens.ts:83-85`) | evet (`menu.ts:17`) | **ölü** | yok | `MessageListView` kopyası: kök sınıf `.messageListView` (`:2`), `MessageService/*` çağırır, `AdminService` DEĞİL (`:366-470`). |
| 36 | Test sayfası | `productDefinitions/TEST.vue` | hayır | evet (`menu.ts:22`) | **ölü** | yok | Geliştirici prototipi; `restApi` yok; i18n `menu.test` = "Test Sayfası" (`tr.json`). |
| 37 | Sipariş/İade/Müşteri/Fatura tanımla | `definitions/{Order,Return,Customer,Invoice}DefinitionView.vue` (~290 sat. her biri) | hayır | evet (`menu.ts:42-45`) | **ölü/prototip** | yok | Hiç `restApi` yok (grep: bu dosyalarda 0); statik `items`/`headers`. i18n `menu.new.*` ("Sipariş Ekle", "İade Oluştur"…) bunlara işaret ediyor ama backend'de manuel sipariş/iade oluşturma operasyonu YOK. |
| 38 | Marka/Seçenek/Etiket tanımla | `definitions/{Brand,Option,Hashtag}DefinitionView.vue` | hayır | evet (`menu.ts:48-50`) | **ölü/prototip** | yok | Aynı: `restApi` yok; işlev `*ListView` ekranlarında var. |
| 39 | Destek kaydı oluştur | `definitions/TicketDefinitionView.vue` | hayır | yorum satırı (`menu.ts:51`) | **ölü** | yok | Kayıt yorumda; `TicketListView` içinde "yeni talep" akışı var. |
| 40 | Yeni ürün / Ürün tanımları (eski) | `productDefinitions/NewProductView.vue`, `ProductDefinitionsView.vue` | hayır | **kayıtlı değil** | **ölü** | yok | `views` Map'te yok (`menu.ts:16-70`); `click: a` = `console.log("button pressed")` (`NewProductView.vue:79-81`, `ProductDefinitionsView.vue`). |
| 41 | Entegrasyonlar kabuğu | `integrations/IntegrationsView.vue` | — | — | **ölü** | yok | 8 satır, yalnız `<router-view>`; kabukta zaten `<router-view>` yok (`router/index.ts:23-28`). |

Bileşen düzeyi: **Bildirim çekmecesi** `components/user/NotificationDrawerComponent.vue` + `stores/notificationDrawer.ts` (`NotificationService/{get,markAsRead,delete}`, 10 sn polling `:50-62`) — çalışıyor, spec yok, tercih/kategori/kalıcı sayfa yok. **Küresel arama** `ApplicationBar.vue:305` (`SmartService/unifiedSearch`) — var; komut paleti/klavye kısayolu yok (grep `ctrlKey|useMagicKeys` yalnız yorum satırı içinde). **Onboarding** `composables/useOnboarding.ts`: `homepage` turu tanımlı, `#tour-homepage-*` kimlikleri şablonlarda var (`ApplicationBar.vue:17,149`, `SecureLayout.vue:14,120`) fakat `startTour` yalnız `ProductVariantsComponent.vue:870`'te içe aktarılmış; hiçbir yerden `startTour('homepage')` çağrılmıyor (grep) → tur fiilen ölü.

---

## (b) "Backend var → arayüz yok" matrisi

### b-1. Politika kaydında OLAN ama FE'nin hiç çağırmadığı operasyonlar (mekanik tarama)

| Operasyon (kademe) | Backend | FE çağrısı | Etki |
|---|---|---|---|
| `TenantDataService.requestDeletion` (owner) | `tenant-data-service.ts:26` (parola + mağaza adı doğrulaması, +30 gün yumuşak silme) | YOK | KVKK "hesabı/verimi sil" talebi arayüzsüz |
| `TenantDataService.exportTenantData` (owner) | `tenant-data-service.ts:70` (zip → R2 → 24 sa imzalı `downloadToken`) | YOK | KVKK dışa aktarma arayüzsüz; **üstelik indirme rotası da YOK**: `verifyExportDownloadToken` yalnız tanımlı + testte (`operations/tenant/exportDownloadToken.ts:31`, `tests/characterization/tenant/export-download-token.test.ts`); `backend/src` içinde başka çağıranı yok (grep) → token ile dosya indirilemez. |
| `TenantDataService.cancelDeletion` (platformAdmin) | `tenant-data-service.ts:54` | YOK | Admin panelinde "silme bekleyen mağaza / geri al" yok |
| `CustomerService.anonymizeCustomer` (admin) | `operationPolicy.ts:128` | YOK | KVKK son-kullanıcı silme talebi arayüzsüz |
| `IntegrationService.generateWebhookToken` (admin) | `integration-service.ts:143` | YOK | Webhook token üretme/rotasyon UI'ı yok (`operation-policy.test.ts:101` `BACKEND_ONLY_NOT_YET_IN_FE`) |
| `AdminService.get` | placeholder | — | önemsiz (test istisnası) |

(Diğer 15 "kullanılmıyor" satırı — `MenuService.get`, `NotificationService.get`, `*Service.get`, `ImageApi/*` — mekanik taramanın yanlış-pozitifidir: GET/`postImage` kalıbıyla çağrılıyorlar, elle doğrulandı.)

### b-2. Backend'de public metot VAR ama politika kaydı YOK (= genel RPC ile çağrılamaz, FE de çağırmaz)

| Metot | Dosya:satır | Olası arayüz değeri |
|---|---|---|
| `FinancialService.getFinancialSummary` | `financial-service.ts:137` | Finans özet panosu (komisyon/hakediş toplamları) |
| `FinancialService.getCargoInvoices` | `:101` | Kargo faturası mutabakatı |
| `FinancialService.getPayoutDetails` | `:198` | Ödeme emri (payout) kalem dökümü |
| `ShipmentService.getShipments` | `shipment-service.ts:16` | Kargo/sevkiyat listesi ve takip |
| `OrderService.markAsPrinted` / `updateOrderStatus` | `order-service.ts:464,445` | Etiket basıldı işareti / manuel durum |
| `ClaimService.getClaimById` / `updateClaimStatus` | `claim-service.ts:337,308` | İade detay sayfası / durum |
| `IntegrationService.retrieveOrdersFromIntegration` / `retrievePlatformProcesses` | `integration-service.ts:1282,242` | Elle sipariş çekme / platform süreçleri |
| `NotificationService.getUnreadCount` | `notification-service.ts:98` | Hafif rozet sorgusu (şu an `get` tüm listeyi 10 sn'de bir çekiyor) |
| `ECommerceService.*` (10 metot) | `ecommerce-service.ts`; `api/index.ts:21,51` yorum satırı | Ölü servis (kayıtlı değil) |

Not: politika testi "FE'nin çağırmadığı operasyon kayda girmez" kuralını uygular (`operationPolicy.ts:11-14`); bu satırlar ilgili ekran yazılırken politikaya eklenmelidir (yeni `admin`/`member` kademe kararı → ADR-0001 gözden geçirmesi).

### b-3. Talebinizdeki yeteneklerin durumu (backend'de ne var, arayüzde ne var)

| Yetenek | Backend durumu (kanıt) | Arayüz durumu | Boşluk türü |
|---|---|---|---|
| **Abonelik: iptal** | Yok. `BillingService` yalnız `getPlans/getMySubscription/startCheckout` (`billing-service.ts:42,60,129`; yorum `:11-14` "cancel/changePlan ... ayrı görev"). `cancelAtPeriodEnd` alanı okunuyor (`:99`). `PaymentProvider.cancel` portu ADR'de (ADR-0008 §1) | `SubscriptionView` yalnız iptal edilmiş durumu gösterir (`:200-201`) | **Backend ve FE yok** |
| **Plan değiştirme** | `startCheckout` mevcut aboneliği `$set` ile üzerine yazıyor (`:154-164`); gerçek `changePlan` yok | "Bu plana geç" onayı → `startCheckout` (`SubscriptionView.vue:270-283`) — proration/onay/tarih bilgisi yok | Backend yarım, FE yarım |
| **Kart güncelleme** | Yok (`cardLast4/cardBrand` yalnız okunuyor `:100-101`); sağlayıcı hosted-form devri yok (mock) | Kart bilgisi hiç gösterilmiyor | Backend + FE yok |
| **Fatura geçmişi** | Yok. `BillingEvents` ADR-0008 §2'de "fatura dışa aktarma kaynağı" olarak tasarlı; okuma ucu yok | Yok | Backend + FE yok |
| **Kullanım / kota göstergesi** | Plan `limits` var (`billing-service.ts:110`); kota uygulaması/ölçümü yok; `EntitlementService.checkAccess` API korumasında ÇAĞRILMIYOR (yalnız `billing-service.ts:81-83`; grep) | Yok | Backend (uygulama katmanı) + FE yok |
| **Süreç genelinde abonelik uyarısı** (deneme bitiyor / ödeme gecikti / salt-okunur) | `getMySubscription.access/reason` var | Yalnız `SubscriptionView` içinde; kabukta banner yok (`getMySubscription` yalnız `SubscriptionView.vue:252`) | FE yok |
| **KVKK dışa aktarma / silme talebi** | Var (b-1) | Yok | FE yok + indirme rotası backend'de yok |
| **Stok politikası (ADR-0004: kanal önceliği, tampon, grace, oto-iptal, oto-restok)** | Model/iş mantığı var: kanal başı `marketplace[].settings.stockPolicy` (`interfaces/stock/index.ts:25-38`, `ClientIntegration.ts:26-29`); tenant düzeyi `stockPolicy.primaryChannel` için **yazma ucu YOK** (`ClientIntegration.ts:29-35` yalnız şema; `StockPublishTrigger.ts:193` okur). `saveClientMarketplaceSettings` `settings` nesnesinin TAMAMINI değiştirir (`integration-service.ts:119-132`) → FE stokPolicy'yi taşımazsa siler | Hiçbir FE dosyası `stockPolicy/bufferUnits/graceMinutes/autoRestock` içermez (grep boş) | FE yok + `primaryChannel` için minimal backend gerekir |
| **Aşırı satış (OVERSOLD) / rezervasyon görünümü** | `Order.allocationState` (`Order.ts:59-71`, enum RESERVED/COMMITTED/RELEASED/OVERSOLD/RESTOCKED/UNMAPPED) ve `Variant.reserved/allocations` (`Variant.ts:53-57`) var; `getOrders` alanı zaten döndürüyor (`order-service.ts:80-104`, projeksiyon yok). `OversellCompensationJob` bildirim üretiyor (`OversellCompensationJob.ts:216-218`) | FE `allocationState/OVERSOLD/reserved` hiç okumuyor (grep boş) | FE yok (filtre için küçük backend eklentisi gerekebilir — `filterQuery` yapısı doğrulanmadı) |
| **Mutabakat (reconciliation) sonuçları** | İş var (`InternalReconciliationJob`, `ExternalReconciliationJob`) ama sonuç KALICI DEĞİL: yalnız `console.warn/error` (`InternalReconciliationJob.ts:89`) ve `stockDirty=true` işaretleme (`ExternalReconciliationJob.ts:10-16`) | — | **Backend yok** (sonuç koleksiyonu + okuma ucu gerekir) |
| **Entegrasyon sağlığı / devre kesici / `IntegrationCallMetrics`** | Model + yazma var (`IntegrationCallMetric.ts`, TTL 30 gün; `circuitState`); okuma ucu yalnız `AdminService.getSystemHealth` (platformAdmin, `admin-service.ts:266`); tenant için YOK. `ClientIntegration.syncMetadata.lastOrderSync/lastStatusCheck` (`ClientIntegration.ts:10-13`) döner | FE `syncMetadata/webhookHealthy/circuit` hiç kullanmıyor (grep boş) | Tenant-kapsamlı okuma ucu (backend) + FE yok |
| **Denetim günlüğü (AuditLogs, ADR-0001)** | Yazma var (`AuditLog.ts`, 365 gün TTL; `AuditLogger`); OKUMA ucu yok (hiçbir serviste `getAuditLogs` yok) | `LogListView` yalnız export/import iş günlüğü | Backend okuma ucu + FE yok |
| **Kullanıcı / rol / ekip yönetimi** | Var (`UserService` 4 op); rol listesi `getRoles`; davet e-postası yok, `createUser` doğrudan parola alır (`user-service.ts:95-105`) | `AuthorizationListView` çalışıyor; yetki matrisi/davet/oturum sonlandırma yok; spec yok | FE yarım |
| **Profil / parola / oturum güvenliği** | Kendi parolasını değiştirme ucu YOK (yalnız admin `updateUser` parola yazar, eski parola sorulmaz — `user-service.ts:146-181`); `tokenVersion` ile "her yerden çıkış" altyapısı var ama uç yok; 2FA yok (grep `totp|2fa|mfa` boş); parola sıfırlama/e-posta doğrulama yok | `ChangePasswordView` ölü (a-31); giriş sayfası "unuttum" ölü | **Backend + FE yok** |
| **Bildirim merkezi** | `NotificationService` 3 op + `getUnreadCount` (politikasız) | Çekmece var (10 sn polling); tercih, kategori filtresi, tam sayfa/geçmiş, e-posta/push yok | FE yarım |
| **Ürün oluşturma/düzenleme/toplu işlem/eşleştirme** | Var (`ProductService`, `VariantService` `batchProcess*`, `AttributeMappingService`) | Var (`ProductDefinitionView`, `ProductUpdateView`, `ProductVariantsComponent`); spec yok | tam (test borcu) |
| **Kategori/marka eşleme** | Var | `CategorySyncComponent`, `BrandSyncComponent` var; spec yok | tam (test borcu) |
| **Kargo akışı** | Sipariş bazlı `createShipment/bulkCreateShipment` var; kargo firması adaptörleri YOK (`INTEGRATIONS_REGISTRY.md:147`); `getShipments` politikasız | Kargo ayar formları var (ShippingView), sevkiyat listesi/takip yok | Backend adaptör + FE yok |
| **Fatura akışı** | `InvoiceService` 6 op; e-fatura sağlayıcı entegrasyonu yok (`integration-service.ts`'te `einvoice` sıfır) | `InvoiceListView` + `EInvoiceView` (kayıt yolu yok) | Backend + FE yarım |
| **Onboarding ("ilk entegrasyonu bağla")** | Kayıt sonrası `trialing` abonelik açılıyor (`operations/tenant/trialSubscription.ts`); `Client.integrations` durumu var | Kayıt sonrası doğrudan `/subscription?plan=` veya panoya düşer (`LoginComponent.vue:293-305`); adım adım kurulum sihirbazı/"kurulum tamamlandı %" yok; `useOnboarding` turu ölü | FE yok (backend: `getClientIntegrations` yeterli) |
| **Yardım / destek / talep** | `TicketService` var | `TicketListView` var; yardım merkezi/SSS/eğitim yok; `EducationView` yanlış bağlı | FE yarım |
| **Tenant'a özel entegrasyon durumu (bağlı/bağlı değil, kimlik bilgisi geçerli mi)** | `getClientIntegrations`, `retrieveAndSetExternalToken` | Yalnız "kaydet" formları; "bağlantıyı test et" ucu backend'de YOK (policy'de yok) | Backend + FE yok |

---

## (c) ÖNERİLEN YENİ / TAMAMLANACAK EKRANLAR

Öncelik: **P0** = ürünün satılabilir/yasal/güvenli olması için şart; **P1** = ürün olgunluğu; **P2** = iyileştirme.
Boyut: S ≤ 2 gün, M ≈ 3-6 gün, L > 6 gün (yalnızca FE + gereken minimal backend; test dahil, kaba tahmin).
"Grup": ADR-0015 içeriği repoda bulunamadığı için **bu raporun önerisidir** — **A** = mevcut ekranı düzeltme/ölü içerik (backend gerektirmez), **B** = yeni ekran, backend hazır veya küçük ek, **C** = yeni ekran + yeni backend yeteneği. (B-grubu = ADR-0015 B ile uyumlu olduğu varsayılırsa §3'teki B satırları.)

| ID | Ekran (ad) | Kullanıcı değeri | Gereken backend çağrıları | Öncelik | Boyut | Bağımlılık | Grup |
|---|---|---|---|---|---|---|---|
| N1 | **Hesabım / Güvenlik** (Şifre değiştir + oturumlar + profil) — `ChangePasswordView` yerine | Hesap güvenliği asgari SaaS beklentisi; şu an ölü ekran | **YOK:** `UserService.changeMyPassword` (member; eski parola doğrula, `tokenVersion++`, AuditLog `user.password_change`), opsiyonel `UserService.revokeMySessions`. Politikaya + `operation-policy.test.ts` envanterine eklenir | P0 | M | ADR-0001 (tokenVersion/Audit); N2 ile aynı backend işi | C |
| N2 | **Parola sıfırlama / unuttum** (giriş sayfasındaki ölü sekme) | Kilitlenen kullanıcı kendi kendine dönemez | **YOK:** `SecurityService.requestPasswordReset`/`resetPassword` (OPEN_OPERATIONS'a eklenir, rate-limit, e-posta şablonu — `@services` Mail var); e-posta doğrulama ayrı karar | P0 | M | ADR-0001 (açık uç politikası, rate-limit), Mail servisi | C |
| N3 | **Abonelik yönetimi tamamlama**: iptal (dönem sonu), plan değiştirme (onay+tarih), kart güncelleme (sağlayıcı hosted form devri), **fatura geçmişi** listesi/indirme, kullanım-kota çubukları, kabukta abonelik uyarı bandı | Gelir akışı: müşteri kendi kendine yönetemezse destek yükü + churn kör noktası | **YOK:** `BillingService.cancelSubscription`, `changePlan`, `getBillingHistory` (BillingEvents okuma), `startCardUpdate`; kullanım için `getMyUsage` (anlık sayım, ADR-0008 kota). Politikaya `admin`/`member` kademesiyle | P0 | L | ADR-0008 (Aşama B/C), `PaymentProvider` portu (`cancel/changePlan`), N-bant için kabuk | C |
| N4 | **Veri ve gizlilik (KVKK)** — Ayarlar altında sekme: verimi dışa aktar, hesabı sil (parola + mağaza adı onayı, 30 gün bekleme + geri al bilgisi), müşteri anonimleştirme (müşteri detayında) | Yasal zorunluluk (KVKK); backend hazır ama arayüzsüz — C17 kapanışı | VAR: `TenantDataService.requestDeletion/exportTenantData`, `CustomerService.anonymizeCustomer`. **YOK (minimal):** `exportTenantData` indirme rotası (`verifyExportDownloadToken` bağlanacak; `IMAGE_API`/`BillingWebhook` benzeri bir GET rotası) | P0 | M | ADR-0003 adım 8 (F.20/F.22/F.23); `operationPolicy` istisnası kaldırılır (`operation-policy.test.ts:101`) | B (+ küçük C: indirme rotası) |
| N5 | **Stok politikası ayarları** (Pazaryeri ekranı içinde kanal başına tampon/yüzde/grace/oto-iptal/oto-restok; tenant düzeyi "birincil kanal") | Zero-oversell'in kullanıcı tarafı; şu an varsayılan gizli, FE `settings`'i ezerse politika silinir | VAR: `saveClientMarketplaceSettings` (dikkat: `settings` bütünüyle yazılıyor → FE mevcut `stockPolicy`'yi okuyup geri yollamalı; birleştirme davranışı doğrulanmalı). **YOK (minimal):** `IntegrationService.saveStockPolicy` (tenant `primaryChannel` + doğrulama/aralık) | P0 | M | ADR-0004 Karar 1/5; Marketplace ekranı | B (+ küçük C) |
| N6 | **Stok sağlığı: Aşırı satış (OVERSOLD) ve rezervasyon görünümü** — sipariş listesinde rozet+filtre, sipariş detayında allocation zaman çizgisi, varyantta "stok/rezerve/kullanılabilir" kolonu | Aşırı satış ürünün en kritik operasyonel riski; telafi işi zaten bildirim üretiyor, kullanıcı görmüyor | VAR: `getOrders` `allocationState`/`oversoldEscalatedAt` döndürüyor (`order-service.ts:80-104`); varyant alanları `Variant.ts:53-57` (yanıta girdiği doğrulanmadı). **YOK (küçük):** `getOrders` filtre parametresi `allocationState`, `getVariants` projeksiyon doğrulaması | P1 | M | ADR-0004; `OrderListView` (spec var → tabanlar yenilenir) | B |
| N7 | **Entegrasyon sağlığı** (tenant): kanal başına son sipariş/durum senkronu, devre kesici durumu (kapalı/açık/yarı), son N hata, webhook sağlığı+token yenile, kimlik bilgisi "test et" | Sessiz entegrasyon arızası en pahalı destek konusu; pano şu an yalnız ürün yayın sayısını gösteriyor | VAR: `generateWebhookToken`, `getClientIntegrations` (`syncMetadata`). **YOK:** `IntegrationService.getIntegrationHealth` (IntegrationCallMetrics tenant süzmeli aggregate + circuitState + syncMetadata), `testConnection` | P1 | L | ADR-0005/0006 (kuyruk, devre kesici), N9 (bildirim) | C |
| N8 | **Mutabakat raporu** (iç saatlik / dış günlük): son koşu, düzeltilen/uyuşmayan varyant sayısı, "yeniden yayınla" | Stok doğruluğuna güven; şu an sonuç yalnız konsolda | **YOK:** sonuç koleksiyonu (`ReconciliationRuns`) + `StockService.getReconciliationRuns`; iş sınıfları sonucu yazacak şekilde genişletilir | P2 | L | ADR-0004 Karar 8 | C |
| N9 | **Bildirim merkezi tam sayfa + tercihler** (kategori: stok/iade/entegrasyon/fatura; e-posta açık-kapalı; okunmamış-sayacı) | Çekmece 10 sn'de tüm listeyi çekiyor; geçmiş/tercih yok | VAR: `NotificationService.get/markAsRead/delete`; `getUnreadCount` politika eklenmeli. **YOK:** tercih alanı (`SettingService` genişletme) | P1 | M | `NotificationEventBus`; N7 | B |
| N10 | **Denetim günlüğü** (kim/ne zaman/hangi olay; olay+kullanıcı filtresi; yalnız owner/admin) | Kurumsal beklenti + KVKK hesap verebilirlik; veri toplanıyor, gösterilmiyor | **YOK:** `AuditService.getAuditLogs` (tid=kendi tenant zorunlu — sızıntı riski: sorgu tenant süzmesi ADR-0013 ile uyumlu olmalı), politika `admin` | P1 | M | ADR-0001 Karar 11; ADR-0013 (tenant izolasyonu) | C |
| N11 | **Ekip yönetimi geliştirme** (`AuthorizationListView`): davet bağlantısı (parola yerine), rol açıklamaları/kısıt matrisi, kullanıcı sayısı/plan limiti göstergesi, son giriş | Şu an yönetici parolayı kendisi belirliyor | VAR: `UserService/*`. **YOK:** `inviteUser` (e-posta + tek kullanımlık token) | P1 | M | ADR-0001 (rol/tier), N2 (e-posta altyapısı), N3 (limit) | B/C |
| N12 | **Onboarding sihirbazı / kurulum kontrol listesi** (pano kartı): "İlk entegrasyonu bağla → kategori/marka eşle → ürünleri içe aktar → stok politikası → planı seç", %ilerleme, boş durumlarda yönlendirme; `useOnboarding` turunu gerçekten başlat | Kayıt→ilk değer süresi; kayıt sonrası kullanıcı boş panoya düşüyor | VAR: `getClientIntegrations`, `getProductStatistics`, `getMySubscription` ile türetilebilir (ek backend gerekmez) | P0 | M | ADR-0014 S4b kayıt devri; N5, N3 | B |
| N13 | **Entegrasyon "kullanılabilirlik" durumu** (Marketplace/ECommerce/Shipping/EInvoice): gerçekte implement olmayan sağlayıcıları "Yakında"/pasif göster, kimlik bilgisi kaydettirme | Yanıltıcı UX: kullanıcı Aras/Shopify/E-Logo bilgisi kaydeder, hiçbir şey olmaz; site doğruluk ilkesiyle (yalnız 6 gerçek entegrasyon) çelişir | Gerekmez (`INTEGRATIONS_REGISTRY.md` + `IntegrationFactory` kodlarından türetilen `capabilities` alanı `integrationTypes` yanıtına eklenebilir — küçük backend) | P0 | S | ADR-0014 S1 iddia kaydı (live küme ≡ `IntegrationFactory`) | A |
| N14 | **Finans: özet + kargo faturası + ödeme dökümü** (`FinancialListView` içine sekmeler) | Hakediş/komisyon görünürlüğü; backend hazır | VAR (politika ekle): `getFinancialSummary`, `getCargoInvoices`, `getPayoutDetails` (`financial-service.ts:137,101,198`) | P1 | M | `FinancialListView` | B |
| N15 | **Sevkiyat/kargo takip listesi + etiket yazdırma** (ölü `PrintoutListView` yerine) | Operasyonun günlük işi; mevcut ekran sahte | VAR (politika ekle): `ShipmentService.getShipments`, `OrderService.markAsPrinted`; etiket üretimi `BarcodePrintComponent` | P1 | M | Kargo adaptörleri (yok → yalnız manuel kargo) | B |
| N16 | **Yardım merkezi** (SSS, entegrasyon kurulum rehberleri, durum bağlantısı; "Eğitim merkezi" kısayolunun doğru hedefi) | Self-servis destek; `educationCenter` şu an abonelik ekranını açıyor | Gerekmez (statik içerik / site linki `config/siteLinks.ts`) | P2 | S | Site içerik (ADR-0014) | A |
| N17 | **Uygulama içi durum/sağlık sayfası** (platform durumu + planlı bakım banner'ı) | Kesinti anında güven | Küçük: `/health` mevcut (`backend/src/health`) — herkese açık özet uç | P2 | S | ADR-0006 | B |
| N18 | **Genel durum ekranları**: 403 ("yetkiniz yok"), 404 ("ekran bulunamadı"), oturum/yetki-farkındalıklı menü, hata sınırı | `NoAuthorizationComponent` yalnız `AuthorizationListView`'da kullanılıyor; menü kademeden bağımsız (tenant kullanıcısı admin menüsünü görür, backend 403 verir) | **Küçük backend:** `MenuService.get` kademe/`platformAdmin` süzmesi; FE ortak 403/404 bileşeni | P1 | M | ADR-0012 (bilinmeyen slug → pano), ADR-0001 | A/B |
| N19 | **Küresel komut paleti** (Ctrl/Cmd+K: git, hızlı işlem, ara) — mevcut `unifiedSearch` üzerine | Güç kullanıcısı verimi | VAR: `SmartService.unifiedSearch` | P2 | M | ApplicationBar | B |
| N20 | **Eksik test borcu (spec)** — Ayarlar, Yetkilendirme, Finansal, Destek, Ürün tanımla/güncelle, Kategori/Marka/Seçenek/Etiket, bildirim çekmecesi | Bu ekranlar canlı ve karakterizasyonsuz; yeni ekranlar bunların üzerine eklenecek | — | P1 | L | Playwright altyapısı (`e2e/fixtures`) | A |

### Kısmi bağımlılık grafiği
N1/N2/N11 → e-posta+`SecurityService` açık-uç politikası (ADR-0001); N3 → ADR-0008 Aşama B; N4 → ADR-0003; N5/N6/N8 → ADR-0004; N7 → ADR-0005/0006; N12 → N3+N5+N13; N18 → tüm yeni ekranların 403/404 davranışı.

---

## (d) Ölü / silinecek / birleştirilecek ekranlar — SİLME ÖNERİSİ (silme YAPILMADI)

| Dosya | Öneri | Gerekçe (kanıt) | Not / risk |
|---|---|---|---|
| `views/secure/adminPanel/AdminView.vue` | **Sil** (+ `menu.ts:17`, `screens.ts:83-85` yorumu) | `MessageListView` kopyası (`:2`, `MessageService/*` `:366-470`); AdminService çağırmıyor | Menü DB'sinde `adminPanel/AdminView` kaydı olabilir → önce `menus` belgesi kontrol edilmeli (doğrulanamadı); kaydı varsa menüden kaldırılıp sonra silinmeli. BACKLOG:137 "ürün kararı" olarak işaretlemişti. |
| `views/secure/user/ChangePasswordView.vue` | **Yeniden yaz** (N1) — mevcut içerik boş | `:1-28` işlevsiz | menü kodu `changePassword` (`menu.ts:251`) korunur |
| `views/secure/user/InvoiceInfoView.vue` | **Birleştir → sil**: `SettingListView` "Fatura & Yasal Bilgiler" sekmesi aynı işi yapıyor | `:1-87` işlevsiz; `SettingListView.vue:15-18` işlevsel | menü kodu `user/InvoiceInfoView` (`menu.ts:62`) menüden kaldırılmalı |
| `views/secure/user/ExitView.vue` | **Sil**; menüdeki `exit` öğesi doğrudan `logout()` çağırmalı | `:3` "EXIT"; çıkış zaten `ApplicationBar.vue:215` + pano bağlantıları | `systemMenu.push(getMenuLinkWithTitle('exit'))` (`menu.ts:252`) ve `NavigationLinksComponentRight.vue:7` `ExitView` kodunu özel-durum işliyor — birlikte ele alınmalı |
| `stores/site/menu.ts:65` `user/EducationView` → `SubscriptionView` | **Kaldır veya doğru ekrana bağla** (N16) | BACKLOG:58; pano kısayolu yanlış ekran açar (`NavigationLinksComponentLeft.vue:36`) | |
| `views/secure/productDefinitions/TEST.vue` | **Sil** (+ `menu.ts:22`) | Geliştirici prototipi, `restApi` yok, i18n "Test Sayfası" | Üretimde menüde görünüyorsa yanlış; menü DB'si doğrulanamadı |
| `views/secure/PrintoutListView.vue` | **Yeniden yaz** (N15) veya sil | Sahte veri `:381-393`, işlevsiz `console.log` | menü kodu `PrintoutListView` (`menu.ts:29`); i18n `printoutList` |
| `views/secure/definitions/{Order,Return,Customer,Invoice}DefinitionView.vue` | **Sil** (veya gerçek "manuel oluştur" akışı tasarlanana dek dondur) | `restApi` 0; backend'de manuel sipariş/iade/müşteri/fatura oluşturma op yok; müşteri güncelleme dışında (`CustomerService.updateCustomer`) | `InvoiceService.createManualInvoice` (manuel fatura) zaten `components/invoice/CreateInvoiceComponent.vue`'da; i18n `menu.new.*` girdileri temizlenmeli |
| `views/secure/definitions/{Brand,Option,Hashtag}DefinitionView.vue`, `TicketDefinitionView.vue` | **Sil / listeye birleştir** | `restApi` 0; işlev `*ListView` içinde | `TicketDefinitionView` zaten `menu.ts:51`'de yorum satırı |
| `views/secure/definitions/CategoryDefinitionView.vue` | **Birleştir** (`CategoryListView` içine) | 121 sat. ince sarmalayıcı (`CategoryDefinitionView.vue`) | menüde kullanımı doğrulanamadı |
| `views/secure/productDefinitions/NewProductView.vue`, `ProductDefinitionsView.vue` | **Sil** | `views` Map'te kayıtlı değil; `click: a` = `console.log` | Erişilemez ölü kod |
| `views/secure/integrations/IntegrationsView.vue` | **Sil** | 8 satır, yalnız `<router-view>`; kabukta router-view yok (`router/index.ts:23-28`) | |
| `components/integrations/marketplace/AmazonComponent.vue` (+ import `MarketplaceView.vue:95`) | **Sil / "yakında" durumuna al** | Render edilmiyor; Amazon backend'de yok | `INTEGRATIONS_REGISTRY.md` |
| Dashboard sahte metin `MarketplaceLinksComponent.vue:27-32` | **Kaldır / gerçek içgörüye bağla** | Sabit sahte istatistik cümlesi | Kabul edilebilir en düşük: gerçek `getOrderDashboardInsights` verisinden türetilmiş metin |
| `composables/useOnboarding.ts` | **Yeniden kullan** (N12) — şu an çağrılmıyor (`homepage` turu) | | |

Kod-seviyesi kalıntılar: `AdminSampleComponent` mevcut değil (grep boş); "LGS/Education" yalnız `menu.ts:65` satırında kaldı (grep boş — ADR-0008 frontend göçü içeriği temizlemiş).

---

## (e) Sıra önerisi

1. **Hızlı, riski düşük (A grubu, 1 parti):** N13 (kullanılamayan entegrasyonları işaretle), dashboard sahte metnin kaldırılması, ölü ekran temizliği (§d — önce menü DB'si doğrulaması), N18'in FE kısmı (ortak 403/404). Backend'siz; doğruluk ilkesini ve QA'yı düzeltir.
2. **P0 yasal/güvenlik (C/B):** N1+N2 (parola değiştir/sıfırla; ortak `SecurityService/UserService` işi) → N4 (KVKK sekmesi + indirme rotası). Bu üçü hukuki/güvenlik borcudur, C17 ve ADR-0001'i kapatır.
3. **P0 gelir (C):** N3 (abonelik yönetimi) — ADR-0008 Aşama B ile birlikte; kabuk banner'ı.
4. **P0 değer (B):** N5 (stok politikası UI) + N12 (onboarding) — N5, sessiz silme riskini (`settings` tamamen yazılıyor) kapatır; N12 kayıt→değer süresini kısaltır.
5. **P1 operasyon:** N6 (OVERSOLD görünümü), N9 (bildirim merkezi), N14/N15 (finans/sevkiyat, backend hazır), N10 (denetim günlüğü), N11 (ekip davet), N7 (entegrasyon sağlığı), N20 (test borcu paralel).
6. **P2:** N8 (mutabakat raporu), N16-N17-N19.

Her adım için: ilgili yeni operasyonlar `operationPolicy.ts`'e (kademe kararı) + `operation-policy.test.ts` FE envanterine eklenmeli (aksi halde 403/test kırığı); DB'ye yazan hiçbir adım güncel doğrulanmış yedek olmadan başlamaz (CLAUDE.md kural 3); yeni ekranlar `screens.ts` kaydı + Playwright spec ile birlikte teslim edilmeli.

---

## 6. Doğrulanamayanlar / ek inceleme gerekiyor

1. **Menü DB içeriği** (`menus`/`_id: "entegrator"`) repoda yok: `TEST`, `AdminView`, `*DefinitionView`, `PrintoutListView` ekranlarının canlı menüde gerçekten görünüp görünmediği doğrulanamadı; silme kararı öncesi gerekli.
2. **Menü kademe süzmesi yok:** `MenuService.get` tüm kullanıcılara aynı belgeyi döndürüyor (`menu-service.ts:5-13`); admin paneli girişlerinin tenant kullanıcısına da görünüp görünmediği menü belgesine bağlı — doğrulanamadı (yetki sınırı backend RBAC'tir, `operationPolicy.ts:33-38`).
3. **`AuthorizationListView` erişim mantığı:** `userApi.checkAuthorization(res)` sahip için `false`, kaynak listesinde varsa `true` döndürüyor (`composables/user.ts:214-221`) ve `true` = "yetkisiz göster" (`AuthorizationListView.vue:3`); `resources`'ın "izinli" mi "yasaklı" mı listesi olduğu koddan kesin çıkarılamadı.
4. **`Variant.reserved/allocations` `getVariants` yanıtında mı:** `variant-service.ts` projeksiyonu incelenmedi; N6'daki varyant kolonu için doğrulama gerekir. `getOrders` için `allocationState` filtresi de `filterQuery` kurucusu (`order-service.ts:20-75`) okunmadan doğrulanamadı.
5. **`EntitlementService.checkAccess`'in API/engine tarafında uygulanıp uygulanmadığı:** grep yalnız `billing-service.ts`'te çağrı gösteriyor; ADR-0008 §3 "tek uygulama noktası" ilkesinin API guard'ında (ApiWrapper/RunOperation) başka bir isimle uygulanıp uygulanmadığı doğrulanamadı → salt-okunur kilidi gerçekte çalışıyor mu ek inceleme gerektirir (N3 bağımlılığı).
6. **`saveClientMarketplaceSettings` birleştirme davranışı:** `settings` tamamı `$set` ediliyor (`integration-service.ts:123-125`); `resolveSettingsForWrite` (`'sensitive'` sır koruması) `stockPolicy` gibi sır olmayan alanlarda mevcut değeri koruyor mu bilinmiyor (N5 ön koşulu).
7. **Politika sayısı:** mekanik 158 vs `docs/OPERATION_POLICY.md:17` 156.
8. **Görsel/erişilebilirlik durumu** (boş/hata durumu tamlığı) yalnız spec'i olan ekranlar için `BACKLOG.md`/QA raporlarına dayanıyor; spec'siz ekranlarda kodda `EmptyState` kullanımı sayıldı (`views/**`: 12 dosyada 33 geçiş), tarayıcıda doğrulanmadı.

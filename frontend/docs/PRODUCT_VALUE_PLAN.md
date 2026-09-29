# Entegrasyonik Uygulaması — Değer Yol Haritası (PRODUCT_VALUE_PLAN)

Tarih: 2026-09-29 · Taban: bulut `main` @ `e2bb7a2` (`sync: faz3-arayuz @ f40f700`) · Dal: `cloud/value-plan`
Tür: **yalnız planlama belgesi** — kod yazılmadı, `frontend/docs/` dışında dosya değişmedi.
Kapsam: web uygulaması (`frontend/`) ve bunun için gereken backend işi (backend bu depoda **salt okunur** okundu; CLAUDE.md kural 7).

---

## 0. Okuma kılavuzu, yöntem ve sınırlar

### 0.1 Kaynak kısaltmaları (kanıt atıfları bu kısaltmalarla yapılır)

| Kısaltma | Belge |
|---|---|
| **COMP** | `docs/research/COMPETITORS_2026-09.md` |
| **SOPYO** | `docs/research/COMPETITOR_SOPYO.md` |
| **BENCH** | `docs/research/2026-09-28-saas-capability-benchmark.md` (rakip kodları T1–T7, G1–G7; yetenek kodları A1…I10; katalog Y-01…Y-33) |
| **PAT** | `docs/research/2026-09-28-integration-saas-patterns.md` (Konu 1–11; kimlik süzgeci §c #1–#50) |
| **DEAD** | `docs/research/2026-09-28-integration-deadlines-scan.md` |
| **TYV2** | `docs/research/2026-09-28-trendyol-v2-migration-spec.md` (risk R1–R15) |
| **GAP** | `docs/FRONTEND_GAP_ANALYSIS.md` (N1–N20) |
| **TS** | `docs/API_TENANT_SURFACE.md` (backend'in bugün sunduğu tenant uçları) |
| **ACC** | `docs/API_ACCOUNT_LIFECYCLE.md` |
| **ADR-00xx** | `docs/adr/00xx-*.md` |
| **CAP** | `site/src/data/capabilities.ts` (sitede kullanıcıya verilen vaatler) |
| **REG** | `backend/src/capabilities/domains/*.ts` (ADR-0019 yetenek kaydı — var) |

### 0.2 Kanıt kuralları

- Backend durumu yalnızca **grep/okuma ile doğrulanmış** `dosya:satır` ile yazıldı. Doğrulanamayanlar "doğrulanamadı" diye işaretlidir.
- Rakip özelliği yalnızca araştırma belgelerinde geçiyorsa yazıldı (belge + bölüm atfıyla). Araştırmalardaki güvenilirlik etiketleri (A/B/C, "iddia", "doğrulanamadı") **aynen taşındı**: araştırma bir rakip özelliğini "iddia" diye veriyorsa burada da iddiadır.
- Araştırmada kanıtı olmayan her ürün fikri **`hipotez`** etiketlidir.
- Referans uygulamalar klasöründeki (`docs/design-reference/`) hiçbir ürünün adı/metni kullanılmadı.

### 0.3 Tasarım dili: DS-v2

**Kaynak ve durum:**
- DS-v2, `frontend/DESIGN_SYSTEM.md`'de tanımlıdır. Bu dosya **bulut `main`'de henüz yok**. Dal `origin/cloud/ds-v2-a1` (`a8600ad`) içindedir ve "Aşama 1 — kullanıcı onayı bekliyor, ekran göçü yapılmadı" durumundadır.
- Görsel yön, kullanıcı brifi `docs/design-reference/README.md`'den (2026-09-29) gelir. Bu brif ADR-0015'in **görsel** yönünü geçersiz kılar.
- ADR-0015'in süreç, test ve desen kataloğu kuralları geçerli kalır: Karar 5.1, 5.6, 6 ve desen mandalı.

**Bu plandaki bütün bulut briflerinde tasarım kuralı:**

1. **DS-v2 main'e birleşmişse** yeni ekranlar yalnız DS-v2 kataloğunu kullanır (DESIGN_SYSTEM.md §6):

   | İş | Bileşen |
   |---|---|
   | Liste | `EkListFrame` + `EkFilterPanel` + `EkActiveFilters` + `EkDataGrid` + `EkPagerBar` (filtre sayfa içi ve katlanabilir; sayfalama alta sabit) |
   | Panel / özet | `EkCard` (başlık motifi) + `EkIconTile`, KPI için `EkMetricCard` |
   | Diyalog | `EkDialog` (tehlikede `tone="danger"`, nesne adı, varsayılan odak Vazgeç) |
   | Form / filtre ızgarası | `EkFormGrid` |
   | Düğme | `EkButton` (ekran başına tek `primary`) |
   | Satır / bağlam menüsü | `EkContextMenu` |
   | Durum | `EkStatusChip` + `src/design/status-map.ts` |
   | Sayaç | `EkBadge` |

   Renkte yalnız rol token'ları kullanılır (§2.2): tek vurgu `action`; lacivert yalnız kimlik; `warning` aksiyon rengi değildir.
2. **DS-v2 henüz birleşmemişse** mevcut ADR-0015 bileşenleri kullanılır: `EkListPage`, `EkDataTable`, `EkPagination`, `EkFilterBar`, `EkKpiCard`, `EkConfirmDialog`, `EkFormDialog`, `EkDetailSheet`.
   - DS-v2 Aşama 2 bunların **API'sini koruyarak** DS-v2'ye delege eder (DESIGN_SYSTEM.md §6 ve §8 adım 2). Bu nedenle iş boşa gitmez.
   - Şablonlar (`EkWizardTemplate`, `EkReadonlyPanelTemplate`, `EkSettingsTemplate`) her iki durumda da kullanılabilir.
3. Her iki durumda **zorunlu olanlar:**
   - hata ≠ boş; kullanılamayan sayı "—",
   - renk tek başına anlam taşımaz,
   - hareket yalnız opaklık, kısa kayma ve renk (150–300 ms); bounce ve hover-yükselme yok,
   - klavye erişimi,
   - axe AA = 0,
   - desen/stil mandalları artmaz.

**DS-v2 Aşama 2 ile çakışma (sıralama kuralı).** DS-v2'nin göç sırası (DESIGN_SYSTEM.md §8) mevcut dosyalara dokunur:
- (1) kabuk: `SecureLayout`, `ApplicationBar`,
- (2) tüm liste ekranları,
- (3) diyalog, menü ve formlar (öncelik entegrasyon formları),
- (4) pano.

Bu plandaki kurallar:
- **Yeni ekran brifleri** çakışmasızdır, hemen başlayabilir: StockHealthView, IntegrationHealthView, AuditLogView, NotificationCenterView, SetupGuideView.
- **Mevcut ekrana dokunan brif parçaları** (OrderListView rozet/filtre, Financial sekmeleri, ApplicationBar rozeti, SecureLayout bandı, Dashboard kartları, entegrasyon formlarında "Yakında") ya ilgili DS-v2 göç adımı **birleştikten sonra** yapılır, ya da aynı oturumda göçle birlikte yapılır.
- Aynı dosya iki oturumda aynı anda değişmez (§3.1).

### 0.4 Bugünkü durumdan kısa kesit (bu belge yazılırken doğrulandı)

- **B4-P0 ekranları var:** `AccountSecurityView`, `PrivacyDataView`, `StockPolicyView`, `ResetPasswordView`, `VerifyEmailView` (`frontend/src/navigation/screens.ts` son 3 kayıt + `views/unsecure/*`), admin `ComplianceView` (ADR-0018 konsolu).
- **Backend hazır ama frontend'in HİÇ çağırmadığı tenant uçları** (grep `frontend/src`, 0 eşleşme):
  - `StockService/getStockOverview` ve `OrderService/getOrders` → `filter.allocationStates` (TS §2),
  - `IntegrationService/getIntegrationHealth` (TS §3),
  - `IntegrationService/getCatalog` (`backend/src/api/services/integration-service.ts:1505`; REG `integrations.ts:102`),
  - `AuditService/getAuditLogs` (TS §4),
  - `FinancialService/getFinancialSummary|getCargoInvoices|getPayoutDetails` (TS §6),
  - `ShipmentService/getShipments`, `OrderService/markAsPrinted`, `ClaimService/getClaimById`, `NotificationService/getUnreadCount` (TS §6),
  - `CustomerService/anonymizeCustomer`, `IntegrationService/generateWebhookToken` (GAP b-1).

  **Dalga 1 bu yüzden neredeyse tamamen bulutta yapılabilir.**
- REG (ADR-0019 Aşama A) **var** (`backend/src/capabilities/`). `frontend/src/generated/` (Aşama B) **yok**. Bu nedenle bulut briflerinde çağrılar bugünkü `restApi` + `use*Api.ts` deseniyle yazılır (`composables/useStockPolicyApi.ts` örneği). REG'de ilgili yeteneklerin `ui: noUi('…BACKEND_ONLY_NOT_YET_IN_FE')` işaretli olması **yerel** tarafta güncellenir: her brifin "Bitince" bölümü bunu yerel orkestratöre not eder. Kanıt: `capabilities/domains/account.ts:151` `audit.logs.list`.
- **Doğrulanması gereken muhtemel ölü yol (bulgu):**
  - `VariantService.batchProcessUpdate` gömülü `Product.variants` dizisine yazıyor (`backend/src/api/services/variant-service.ts:170-189`).
  - Oysa TS §2.1'e göre varyantların doğruluk kaynağı `Variants` koleksiyonu, `Product.variants` ise "eski/ölü yol".
  - **Etki:** ürün ekranındaki toplu varyant güncellemesi (`ProductBatchProcessVariantComponent.vue`) fiilen hiçbir şey yazmıyor olabilir. Stok alanını yazıyorsa da ADR-0004'ün "`reserved`'ın tek yazarı `StockAllocator`" ilkesinin dışında kalır.
  - Yerel doğrulama gerekir. F-08'in ön koşuludur.

---

## 1. Vaat–gerçek tablosu

### 1.1 Nasıl okunur

- Kaynak: `site/src/data/capabilities.ts` (CAP) + aynı klasördeki diğer vaat kayıtları (`plans.ts`, `faq.ts`, `pricing.ts`, `integrations.ts`).
- Site durumu alanı: `available` (Mevcut) · `partial` (Kısmi) · `roadmap` (Planlanıyor; `ROADMAP_VISIBLE=false` iken sitede **görünmez**).
- **Backend:**
  - **var** = kodda çalışan yol,
  - **kısmi** = yolun bir kısmı var / erişilemiyor / bayrak kapalı,
  - **yok** = kod bulunamadı.

  `dosya:satır` yolları `backend/src/`'ye göredir.
- **Uygulama:** ekranın `screens.ts` kaydı (URL'li) ya da yalnız menü (`stores/site/menu.ts` `views` Map) kaydı, ve FE'nin o yeteneği gerçekten çağırıp çağırmadığı.
- **⚠ = ÖNCELİK:** sitede vaat edilip uygulamada **görünmeyen** ya da **kırık** olan satırlar.
- Uyarı (bulut kopyası sınırı): `backend/entegrasyonik.ts` giriş noktası bu depoda yok. Stok zamanlayıcılarının (`StockPublishTrigger`, `OversellCompensationJob`, mutabakat, `TrialExpiryJob`) süreç açılışında başlatıldığı **buradan doğrulanamadı**; kod yolu var. Yerel doğrulama maddesi: B-00.

### 1.2 Yetenek kayıtları (`productCapabilities`)

| CAP id (satır) · site durumu | Vaat (özet) | Backend | Kanıt (`dosya:satır`) | Uygulamada ekran / çağrı | Boşluk → iş |
|---|---|---|---|---|---|
| ⚠ `stock-reservation` (54) · **available** | Eşzamanlı siparişte yalnız mevcut kadar rezervasyon; aşırı satış **işaretlenir** ve telafiye alınır (ayrıca `stockReservationStory` (satır 479+) "Aşırı satış görünür olur") | **var** (motor) | `operations/stock/StockAllocator.ts:38,48-91`; `operations/integration/PostOrderOperations.ts:153`; `operations/stock/OversellCompensationJob.ts:156,171-194`; `backend/tests/integration/StockAllocator.concurrency.test.ts`; uçlar `api/services/stock-service.ts:28` (`getStockOverview`), `getOrders` `allocationStates` (TS §2.2) | Politika ekranı var: `StockPolicyView` (`catalog/stock-policy`). **Aşırı satış/rezervasyon görünümü YOK**: FE'de `allocationState`/`OVERSOLD`/`getStockOverview` grep 0. Kullanıcı yalnız bildirimden görür | **F-01 → C1.1** (BE hazır) |
| ⚠ `multi-channel-products` (77) · **available** | Ürün, fiyat, stok tek yerden tüm kanallara | **var** (toplu yayın + otomatik stok yayını) | `integration/modules/IntegrationFactory.ts:200-205`; `operations/stock/StockPublishTrigger.ts:55-61,108,144`; `api/services/integration-service.ts:1127` (`batchCreator`, çalışan yol) | `ProductListView` (`products`). **Kırık düğmeler (bugün 403):** tek ürün "gönder/fiyat/stok/güncelle" `IntegrationService/processPlatformProduct` (`ProductListView.vue:726,745,755,765`), "durum sorgula" `checkProductStatus` (`:707`); toplu kategori/marka/etiket/durum/sil `ProductService/batchProcessUpdate|batchProcessDelete` (`BatchActions/useBatchActions.ts:158,197`); `VariantService/getVariantsList` (`ProductVariantAttributesComponent.vue:899`). Backend bunları bilinçli olarak bağlamıyor (`capabilities/domains/integrations.ts:112,134` "FE_CALLS_WITHOUT_BACKEND") | **C1.0** (kırık düğmeyi çalışan `batchCreator` yoluna bağla ya da nedenli devre dışı bırak) + **B-19** (eksik toplu ürün işlemleri) |
| `unified-orders` (91) · **available** | Birleşik sipariş yönetimi | **var** | `integration/engine/order/OrderWorker.ts:48-56`; `OrderOrchestrator.ts:73`; `api/services/order-service.ts:35` | `OrderListView` (`orders`); onay/iptal/toplu çağrıları var | Karşılanıyor. F-01 rozetleri bu ekrana eklenir |
| `returns` (108) · partial | İade onay/red | **var** (TY/HB/N11/PZ); Ideasoft/Bizimhesap stub | `api/services/claim-service.ts:33,130,199,259`; stub `integration/modules/ecommerce/ideasoft/index.ts:79-81`, `erp/bizimhesap/index.ts:78-80` | `ClaimListView` (`claims`). ⚠ `ClaimService/bulkDeleteClaims` (`useClaimActions.ts:185`) backend'de **yok** (403). `getClaimById` (`claim-service.ts:367`) FE'de çağrılmıyor | C1.0 (kırık toplu sil) · F-14 → C3.3 |
| `questions` (123) · partial | Soru-cevap tek yerde | **var** (TY/HB/N11/PZ) | `api/services/message-service.ts:18,115,130` | `MessageListView` (`messages`) çalışıyor | F-13 (verimlilik) |
| ⚠ `finance` (138) · partial | Finans ve hakediş görünümü | **var** (UI yalnız bir kısmını kullanıyor) | `api/services/financial-service.ts:19` (`getTransactionData`), `:108` (`getCargoInvoices`), `:145` (`getFinancialSummary`), `:206` (`getPayoutDetails`); REG `finance.ts:16,22,28` | `FinancialListView` yalnız menüde (URL kaydı yok), yalnız `getTransactionData` çağırıyor (`FinancialListView.vue:482`). **Özet / kargo faturası / ödeme dökümü arayüzsüz** | **F-04 → C1.4** (BE hazır) |
| `shipping-invoice-notice` (153) · partial | Kargo takip ve fatura bilgisini pazaryerine bildirme (elle) | **var** (elle; kargo adaptörü yok — site bunu açıkça söylüyor) | `api/services/shipment-service.ts:95,250-251`; `invoice-service.ts:197,406-407` | Sipariş ekranı eylemleri (`components/order/composables/useOrderActions.ts:33-34`). `getShipments` (`shipment-service.ts:33`, stub) çağrılmıyor; `PrintoutListView` sahte veri | F-18 → C3.5 + B-18 |
| ⚠ `erp-read` (168) · partial | ERP bağlantısı (yalnız okuma); sipariş okuma otomatik çekime dahil değil | **kısmi** — ürün okuma erişilebilir; **ERP sipariş okumasına erişen API/UI yolu yok** | `integration/modules/erp/bizimhesap/index.ts:17,55,62-67,70`; `integration/engine/order/OrderQueueProducer.ts:83` (yalnız `marketplace`/`ecommerce`); `IntegrationService.retrieveOrdersFromIntegration` (`integration-service.ts:1448`) yetenek kaydında **yok** (403) | `ErpView` (`integrations/erp`) yalnız ayar kaydeder. ⚠ `BizimhesapComponent.vue:154` → `checkProductStatus` (backend yok, 403). Ayrıca DEAD §7: Bizimhesap resmi dokümanında sipariş **okuma** ucu görülmedi | C1.0 (kırık düğme) + yerel karar: sitede sipariş okuma iması kaldırılsın **veya** B-20 (siparişi elle çek ucu). Site metni site oturumunun işi |
| `tenant-database` (185) · available | Her müşteriye ayrı veritabanı | **var** | `database/DatabaseManager.ts:52`; `database/tenantConnection.ts:6,26`; `operations/tenant/TenantProvisioningService.ts:291` | Arka plan (ekran gerektirmez) | — |
| `secrets-encryption` (199) · available | Anahtarlar şifreli | **var** | `utils/FieldCrypto.ts:19-20,40`; `api/integrationSecrets.ts:6,10,91` | Entegrasyon formları "sensitive" gösterir | Canlı veri göçü `--apply` bekliyor (CAP internalNotes) — yerel |
| `secrets-masked` (208) · available | Anahtarlar arayüzde/yanıtta gösterilmez | **var** | `api/responseSanitizer.ts:11-14` | Entegrasyon formları | — |
| ⚠ `role-based-access` (216) · available (+ `homePillars` `rbac` "hassas işlemler üst kademeye ayrılır") | Kademeli roller | **var** (backend) | `api/operationPolicy.ts:5,37`; `capabilities/derive/policy.ts:17` | `AuthorizationListView` (yalnız menü). FE kademe bilmiyor: yalnız `isOwner()`/`isPlatformAdmin()` (`composables/user.ts:262-270`); `screens.ts`'te `minRole` yok. Düğme gizleme/nedenli devre dışı yok, 403 sonradan geliyor. Davet yok | **F-15** → B-04 + B-05 → C2.3 |
| `default-deny` (228) · available | Varsayılan ret | **var** | `api/operationPolicy.ts:3-7,72-80` | — | Karşılanıyor (kırık FE çağrıları 403 aldığı için de kanıtlı) |
| `session-cookie` (239) · available | HttpOnly oturum çerezi | **var** | `api/Security.ts:118-121,181` | — | — |
| ⚠ `integration-resilience` (251) · available | Dayanıklılık katmanı (geçici hataları yönetir) | **var** | `integration/modules/common/http/ResilientHttpClient.ts:2-9`; tenant sağlık ucu `integration-service.ts:271` (`getIntegrationHealth`) | Tenant için **ekran yok**; yalnız platformAdmin `AdminSystemManagementView`. `getIntegrationHealth` FE'de çağrılmıyor | **F-02 → C1.2** (BE hazır) |
| `hosted-payment` (273) · partial ("sandbox aşamasında") | Kart verisi bizden geçmez | **kısmi** (yalnız mock) | `services/billing/MockPaymentProvider.ts:92,137`; `services/billing/PaymentProviderFactory.ts:7,18` (iyzico yazılmadı); `api/MockCheckoutApiManager.ts:16-21` | `SubscriptionView` (`subscription`) | Site dürüst. iyzico = Protokol 12 |
| `einvoice-provider` (287) · roadmap (gizli) | E-fatura sağlayıcı | **yok** | `integration/modules/` altında `einvoice` yok | ⚠ `EInvoiceView` görünür ama sabit liste, kaydetmiyor (GAP a-25) — site gizlerken **uygulama gösteriyor** | **C1.2** "Yakında" (dürüstlük) · F-21 |
| `carrier-api` (295) · roadmap (gizli) | Kargo firması API | **yok** | `integration/modules/` altında `shipping` yok | ⚠ `ShippingView` 9 form kaydediyor ama tüketen yok | **C1.2** "Yakında" · F-21 |
| `mcp` (303) · roadmap | MCP ile yapay zekâ erişimi | **yok** (yalnız tasarım + yetenek kaydı) | `capabilities/capability-baseline.json` (`notExposedCount:166`); MCP sunucusu yok | Ekran yok | W5+/ADR-0019 C (yerel) |
| `desktop-app` (311) · roadmap | Masaüstü uygulaması | **yok** (ADR-0007) | — | — | Kapsam dışı |

### 1.3 Diğer site vaatleri (`plans.ts`, `faq.ts`, `pricing.ts`, `integrations.ts`)

| Kaynak | Vaat | Backend | Uygulama | Boşluk → iş |
|---|---|---|---|---|
| `plans.ts:277-286`, `faq.ts` "deneme" | 14 gün kartsız deneme | **var** — `operations/tenant/trialSubscription.ts:56`; `operations/billing/TrialExpiryJob.ts:48-50` | `SubscriptionView` durum bandı (yalnız o ekranda) | **C2.2** kabuk bandı (deneme bitiyor / gecikmiş / salt okunur) |
| ⚠ `plans.ts:237` (kanal/SKU/kullanıcı limit satırları) | Plan limitleri ve özellik farkları | **kısmi** — limitler seed'de; `EntitlementService.checkQuota` (`services/billing/EntitlementService.ts:183`) çağıranı yok; API guard `ENTITLEMENT_GUARD_ENABLED` varsayılan **false** (`config/env.ts:191`); plan `features` hiçbir yerde uygulanmıyor | Kullanım/kota göstergesi yok | B-08 (kota okuma) + insan kararı (guard'ı açma, legacy göç — Protokol 12 §4). **Site metni bugün uygulanmayan bir farkı ima ediyor** → yerel/site kararı |
| ⚠ `pricing.ts:430-435`, `faq.ts` plan-yükseltme | Abonelik ekranından plan değişimi | **kısmi** — `changePlan`/`cancel` yok; `startCheckout` (`api/services/billing-service.ts:129`) mevcut aboneliğin üzerine yazar (`:14-15` kapsam dışı notu) | "Bu Plana Geç" var (`SubscriptionView.vue:217,284`); proration/iptal/geçmiş yok | **B-08 → C3.x** (F-16) |
| `faq.ts` destek | Destek talebi + yazışma | **var** — `api/services/ticket-service.ts:92,132` | `supports/TicketListView` (yalnız menü) | — (URL kaydı N20 test borcu) |
| ⚠ `faq.ts` ürün aktarımı | Pazaryerindeki ürünleri içe alma | **var** — `integration/engine/catalog/import/ImportOrchestrator.ts`; `integration-service.ts:551` (`requestFetchFromPlatform`) | Çalışan yol: `TrendyolComponent.vue:177` + toplu FETCH_PRODUCT. ⚠ `MarketplaceView.vue:149` → `retrieveProductsFromClientMarketplace` (backend yok, 403) | C1.0 |
| ⚠ `faq.ts` teknik bilgi | Yanlış kimlik bilgisinde bağlantı "Pasif" görünür | **yok** (aktif test) — `testConnection` yok; Ideasoft `retrieveAndSetExternalToken` gövdesi boş (`integration-service.ts:409-415`) | `MarketplaceView` | F-02 + **B-02** |
| `faq.ts` stok senkron | Stok değişimi kanallara delta olarak yayılır | **var** (kod) — `StockPublishTrigger.ts:108,175`; zamanlayıcı açılışı doğrulanamadı (B-00) | Görünüm yok ("son yayın zamanı" gösterilmiyor) | C1.1 (`publishPending`) |
| `faq.ts` kapsam aynı mı | N11'de sipariş onay/red yok | **tutarlı** — `integration/modules/marketplace/n11/services/OrderService.ts:81-85,114-118` `NOT_SUPPORTED` | FE aynı düğmeyi gösteriyor mu doğrulanamadı | C1.2 kapsam çipleri (`getCatalog`) bunu ekranda da söyler |
| ⚠ `faq.ts` başlangıç ("Kurulum adım adım panel içinden") | Rehberli kurulum | **yok** (backend'de onboarding yok) | Tur ölü: `startTour('homepage')` hiç çağrılmıyor; `user/EducationView` → `SubscriptionView` (`stores/site/menu.ts:74`) | **F-03 → C2.1** (BE gerekmez) |
| `connect.ts:30-69` | Kanal başına kimlik alanları | **var** — her adaptörün `requiredSettings`'i (ör. `erp/bizimhesap/index.ts:17`) | Entegrasyon formları | — |
| `integrations.ts:106-563` | Kanal bazlı yetenek seviyeleri | **tutarlı** — Ideasoft iade/mesaj/finans stub (`ecommerce/ideasoft/index.ts:79-89`), Bizimhesap yazma `notSupported` (`:62-67`) | Uygulama bu seviyeleri göstermiyor | C1.2 kapsam çipleri |

### 1.4 Öncelik sırası: vaat edilip uygulamada görünmeyen / kırık olanlar

1. **Kırık ürün düğmeleri** (`multi-channel-products` "available" ama tek ürün gönder/fiyat/stok/durum ve toplu kategori/marka/etiket/durum/sil 403 dönüyor) → **C1.0** (bulut, FE) + **B-19** (yerel).
2. **Aşırı satış görünürlüğü** (`stock-reservation`, `stockReservationStory`) → **C1.1** (bulut, BE hazır).
3. **Entegrasyon sağlığı + dürüst "Yakında"** (`integration-resilience`; site gizlediği kargo/e-fatura formlarını uygulama gösteriyor) → **C1.2** (bulut, BE hazır) + B-02.
4. **Finans/hakediş görünümü** (`finance`) → **C1.4** (bulut, BE hazır).
5. **Rehberli kurulum** (`faq` başlangıç) → **C2.1** (bulut, BE gerekmez).
6. **Kademe-farkında arayüz** (`role-based-access`, `homePillars` `rbac`) → B-04 → **C2.3**.
7. **Plan limitleri/özellik farkı ve plan değişimi** (`plans`, `pricing`) → B-08 + insan kararı.
8. **ERP sipariş okuma iması** (`erp-read`) → yerel/site kararı (B-20 ya da metin düzeltmesi).

---

## 2. Farklılaşma fırsatları (uygulama içi)

Her fırsat için şu başlıklar verilir: **Problem**, **Rakipte** (araştırma kanıtı; yoksa `hipotez`), **Farklılaşma açımız**, **FE işi**, **BE işi**, **Büyüklük**, **Bağımlılık**.
Büyüklük ölçeği BENCH §0'daki ile aynıdır: S ≤ ~3 gün · M ~1–2 hafta · L > 2 hafta veya dış karar.

Yol haritasını yönlendiren kimlik ilkesi (PAT (a) ve (c)) şudur: **dürüstlük** (kapsam beyanı, hata ≠ boş), **doğruluk** (stok/para), **sakin, tek amaçlı ekran**. Rakip pazarlama sayfaları bu konularda sessiz; bizim açımız burada.

### F-01 — Aşırı satış ve stok sağlığı görünürlüğü ⭐ amiral gemisi
- **Problem:** Site "Aşırı satış görünür olur" vaat ediyor (CAP `stockReservationStory` "Aşırı satış görünür olur"). Oysa `allocationState`/`OVERSOLD` frontend'de hiçbir yerde okunmuyor (grep 0). Telafi işi bildirim üretiyor ama kullanıcı hangi siparişin açıkta kaldığını liste ekranında göremiyor.
- **Rakipte:** COMP §2 tablosunda "Stok/aşırı satış koruması" satırı var: Entegra, Sopyo ve Yengeç için **"görülmedi"** (Yengeç'te yalnız tutarsızlık *raporu* var, önleme yok). BENCH B2'de T3'ün (Sentos) iddiası "çift satış riski ortadan kalkar"dır; teknik derinliği doğrulanamadı.
- **Farklılaşma:** Rezervasyon motoru gerçek ve kanıtlı (ADR-0004; `StockAllocator.concurrency.test.ts`). Bunu **ekranda kanıtlamak** rakiplerin gösteremediği bir şey. Gösterilecekler:
  - sipariş satırında `RESERVED/OVERSOLD/UNMAPPED` rozeti,
  - "Açık aşırı satış: 2 satır / 5 adet" KPI'ı,
  - varyantta `stok / rezerve / kullanılabilir` üçlüsü (PAT Konu 7 "Y-09 ekranı üçlüyü göstermeli").
- **FE işi:**
  - `OrderListView` için rozet + `allocationStates` filtresi + URL parametresi (`screens.ts` `urlParams` enum).
  - Pano için "Stok sağlığı" kartı (`getStockOverview`).
  - Yeni `StockHealthView` (`EkReadonlyPanelTemplate`): KPI satırı + dikkat gerektiren siparişler + varyant özeti.
  - Ürün detayında `available = stock − reserved` (TS §2.1: FE hesaplar).
- **BE işi:** **yok** (TS §2.2–2.3 hazır). `reconciliation.tracked=false` dürüstçe "henüz izlenmiyor" gösterilir. Sonrası için B-03.
- **Büyüklük:** FE M · BE — · **Bağımlılık:** `OrderListView` tek sahipli dosyadır; B-grubu göçüyle çakışmasın (ADR-0015 B4 notu).

### F-02 — Entegrasyon sağlığı + dürüst kapsam rozetleri ("yakında")
- **Problem:** Kullanıcı sessiz entegrasyon arızasını fark etmiyor. Ayrıca Kargo, E-fatura ve E-ticaret ekranlarında backend'i olmayan sağlayıcılar (Aras, Shopify vb.) "kaydedilebilir" görünüyor (GAP a-23/24/25, N13). Bu durum sitenin dürüstlük ilkesiyle çelişiyor.
- **Rakipte:**
  - PAT Konu 2'de bağlantı durum makinesi ve "yeniden yetkilendirme gerekli" deseni var (Nango A, Make B).
  - PAT §c #5'e göre adaptör "Kapsam beyanı" **"rakiplerde yok (doğrulanamadı)"**.
  - BENCH H5'te hata izleme G5/G1'de "AYIRT" olarak geçiyor.
  - Yerel rakiplerin bu konudaki mühendislik çözümü doğrulanamadı (PAT Konu 11).
- **Farklılaşma:**
  - Kanal başına tek kelimelik durum: `healthy | degraded | down | no_data | not_configured`.
  - "Hata ≠ veri yok" ayrımı (Primer ilkesi, PAT Konu 8).
  - Manifestodan okunan yetenek çipleri (`supported | limited | platform_auto | not_supported`). Bu, pazarlama metnini de sınırlar (ADR-0018 Karar 1.3 "E3").
- **FE işi:**
  - Yeni `IntegrationHealthView` (`EkReadonlyPanelTemplate`; `getIntegrationHealth`).
  - Entegrasyon ekranlarına `getCatalog` kaynaklı kapsam çipleri ve **backend'siz sağlayıcıyı "Yakında" + pasif form** yapma (N13).
  - Webhook token üret/yenile düğmesi (`generateWebhookToken`, admin; yalnız Trendyol alıcısı var).
- **BE işi:**
  - Okuma: **yok**.
  - "Bağlantıyı test et" için **B-02** (`testConnection`). Yoksa ekranda "aktif test henüz yok" notu durur (TS §3 uyarı c).
- **Büyüklük:** FE M · BE S (B-02) · **Bağımlılık:** `getCatalog` yanıt şekli yerelde tip olarak doğrulanmalı (brifte "yanıtı olduğu gibi tüket, alan uydurma" kuralı var).

### F-03 — Kurulum rehberi (onboarding) — kayıttan ilk değere
- **Problem:** Kayıttan sonra kullanıcı boş panoya ya da abonelik ekranına düşüyor. `useOnboarding` turu hiç çağrılmıyor (GAP a "Onboarding", N12; `useOnboarding.ts:74`, tek import `ProductVariantsComponent.vue:837`).
- **Rakipte:**
  - SOPYO §2: entegrasyon detay sayfalarında somut 4 adımlı kurulum akışı + süre tahmini.
  - COMP §1.2: Sopyo destek merkezinde "Onboard İşlemleri" kategorisi ve platforma özel karşılama sayfası.
  - BENCH I4: G1 (Linnworks) onboarding hizmeti; T1 ücretsiz eğitim.
- **Farklılaşma:**
  - Adımların **gerçek durumdan türetilmesi**; işaretli kutu değil:
    - pazaryeri bağlı mı: `getClientIntegrations` + `getIntegrationHealth`,
    - kategori eşlendi mi,
    - ürün var mı: `getProductStatistics`,
    - stok politikası ayarlı mı: `getStockPolicy`,
    - plan seçildi mi: `getMySubscription`.
  - **Ölçülmemiş süre sözü verilmez** (SOPYO §3 #3 uyarısı).
- **FE işi:** Pano "Kurulum rehberi" kartı + `EkWizardTemplate` sihirbazı (ADR-0015 3.9 madde 3). İlerleme yalnız adım indeksi olarak kullanıcı+tenant kapsamlı `sessionStorage`'da tutulur.
- **BE işi:**
  - v1: **yok** (tüm sinyaller mevcut uçlardan).
  - v2 (isteğe bağlı): "rehberi kapattım" tercihinin cihazlar arası tutulması → B-04'e eklenecek küçük alan.
- **Büyüklük:** FE M · **Bağımlılık:** F-02 (sağlık sinyali), `StockPolicyView` (var).

### F-04 — Finans: özet, kargo faturası, ödeme (hakediş) dökümü
- **Problem:** Hakediş ve kesinti görünürlüğü yok. `FinancialListView` yalnız `getTransactionData` çağırıyor (GAP a-16). Backend'deki üç uç arayüzsüz.
- **Rakipte:**
  - BENCH T1: Entegra "hakediş takibi ayrı modül": komisyon/kargo/ceza/mükerrer kargo kesintisi, eksik ödeme kontrolü (A kaynak).
  - BENCH T7: hakediş/mutabakat araçları (B).
  - COMP §1.1: "hakediş/kesinti doğrulama" (iddia).
  - BENCH T3: finansal mutabakat Platinum pakette.
- **Farklılaşma:**
  - Kanal bazında **"desteklenmiyor" ile "0" ayrımı** (HB/N11 finans alanları boş: BENCH C5).
  - Rakiplerin ücretli modül olarak sattığı görünürlüğün ilk katmanı mevcut planda.
- **FE işi:** `FinancialListView` içinde `EkPageTabs`: "İşlemler" (mevcut) · "Özet" · "Kargo faturaları" · "Ödeme dökümü".
- **BE işi:** görünüm için **yok** (TS §6). Eksik ödeme tespiti için F-11.
- **Büyüklük:** FE M · **Bağımlılık:** `FinancialListView` karakterizasyonu (`financial.spec.ts` var).

### F-05 — Denetim günlüğü ekranı
- **Problem:** Site "hassas işlemler üst kademeye ayrılır" diyor (CAP `homePillars` id `rbac`, satır 407+). Buna karşın tenant "kim ne yaptı" sorusuna cevap göremiyor. Veri yazılıyor ama okunmuyor.
- **Rakipte:** Rakiplerde doğrulanamadı (BENCH §0 madde 4). Genel SaaS çıtası: PAT Konu 10 (GitHub A, WorkOS A: filtreli, serbest metin aramasız, CSV).
- **Farklılaşma:** PII'siz ve tenant-kapsamlı okuma zaten backend'de zorunlu (TS §4: `ip` dönmez, `admin.*` olayları gizli). Güven anlatısının ürün yüzü.
- **FE işi:** Yeni `AuditLogView` (`EkListPage`). Filtreler: tarih (≤366 gün), olay/önek, kullanıcı (`UserService/getUsers` ile ad eşleme), sonuç. Kademe **admin**.
- **BE işi:** yok. Ölçek için `{tid:1, at:-1}` indeksi gerekir; canlıda oluşturulması **Protokol 12** (TS §4).
- **Büyüklük:** FE S-M

### F-06 — Bildirim merkezi (tam sayfa) + okunmamış rozeti + tercihler
- **Problem:** Çekmece tüm listeyi 10 sn'de bir çekiyor (GAP b-3). Geçmiş, kategori ve tercih yok.
- **Rakipte:**
  - PAT Konu 5: Linear (A) — gelen kutusu birincil, e-posta yalnız okunmamışsa; kategori × kanal matrisi.
  - Primer (A) — kritik bildirim kapatılamaz.
  - COMP §1.3: Yengeç'in günlük tutarsızlık e-postası (iddia).
- **Farklılaşma:** Zorunlu kategoriler susturulamaz: kimlik bilgisi hatası, OVERSOLD/UNMAPPED, faturalama. Otomatik deneme sürerken bildirim yok, yalnız son başarısızlıkta (PAT §c #3, #20).
- **FE işi:**
  - v1: `getUnreadCount` rozeti (polling hafifler); `NotificationCenterView` (`EkListPage`) — `type` filtresi. Model enum'u: `BATCH_PROCESS | ORDER | STOCK_ALERT | INFO | SYSTEM | EXPORT_READY | IMPORT_READY` (`backend/src/database/client/models/Notification.ts:12`).
  - v2: tercih matrisi.
- **BE işi:** v1 **yok**. v2: **B-07** (tercihler + düşük stok eşiği + günlük özet).
- **Büyüklük:** FE S (v1) + M (v2) · BE M (B-07)

### F-07 — Hata kutusu (tenant'a dönük başarısız işler + yeniden dene)
- **Problem:** Başarısız ürün gönderimi ve sipariş çekim hataları dağınık. Kullanıcı neyin otomatik düzeleceğini, neye müdahale etmesi gerektiğini ayırt edemiyor.
- **Rakipte:** PAT Konu 1 — Zapier/Make/Workato (A):
  - yalnız başarısız birimi yeniden oynat,
  - otomatik deneme takvimi,
  - "Unresolved" durumu.
- **Farklılaşma:**
  - `IntegrationError.retryable` → "Otomatik yeniden denenecek" / "Müdahale gerekli" ayrımı.
  - Yan etkili eylemde idempotency anahtarı doğrulanmadan "yeniden dene" düğmesi gösterilmez (PAT §c #1–#2).
- **FE işi:** `FailureInboxView` (`EkListPage` + `EkDetailSheet`). Toplu yeniden dene / çözüldü işaretle.
- **BE işi:** **B-06** (birleşik okuma ucu + retry/resolve).
- **Büyüklük:** FE M · BE M · **Bağımlılık:** ADR-0017 Karar 5 tenant sağlık ekranı ile aynı yüzeyde düşünülmeli.

### F-08 — Toplu fiyat/stok işlemleri (önizleme + geri al) ve Excel içe aktarma
- **Problem:** Günlük en sık iş. Bugünkü toplu varyant güncelleme yolu muhtemelen ölü (§0.4). Yüzde/tutar bazlı toplu artış-azalış yok (BENCH A2).
- **Rakipte:**
  - BENCH A1/A2 "ŞART": T1 Entegra (toplu işlem + Excel, XML import/export), T2 Dopigo (yüzde/tutar bazlı toplu fiyat-stok artış/azalış — arama özeti).
  - COMP §1.3: Yengeç "kural bazlı toplu fiyatlandırma" (iddia).
  - COMP §1.2: Sopyo destek merkezinde "Toplu İşlemler" kategorisi.
- **Farklılaşma:**
  - Uygulamadan önce **fark önizleme**: "X satır geçerli, Y hatalı, Z ürünün fiyatı değişecek".
  - 7 gün **geri al** (before-image).
  - Boş hücre = değiştirme.
  - Stok değişimi **referanslı delta** ile `StockAllocator` yolundan geçer (PAT Konu 6 kararları, §c #22–#25).
  - Shopify'ın içe aktarması bu güvenceleri vermiyor (PAT Konu 6: iptal edilemez, boş hücre siler).
- **FE işi:** `BulkChangeWizard` (`EkWizardTemplate`, 3 adım: kapsam seç → değişiklik → önizleme/onay) + iş izleme (mevcut `LogListView`/import iş günlüğü deseni).
- **BE işi:** **B-09** (önizleme/uygula/geri al işi + Excel ayrıştırma).
  - xlsx bağımlılık kararı BENCH Y-07'de "BL C18: fix'siz `xlsx`" diye geçiyor; güvenlik açısından yerel karar gerekir.
- **Büyüklük:** FE M · BE L · **Bağımlılık:** §0.4 ölü yol bulgusunun yerelde doğrulanması; ADR-0004 stok hareket günlüğü (PAT B7 `StockMovements`) önerisi.

### F-09 — Kanal bazlı fiyat kuralı (yüzde/TL, yuvarlama, alt/üst sınır)
- **Problem:**
  - Varyantta kanal başına **elle** fiyat var (`prices.isPlatformBasedPrice`, `ProductBatchProcessVariantComponent.vue:71`; `Variant.ts:67-71`).
  - "Trendyol'da %12 fazla, ,90'a yuvarla" gibi kural yok (BENCH A5 "YOK").
- **Rakipte:**
  - BENCH A5 "SIK": T2 Dopigo (kanal bazlı fiyat), T4 Ticimax (kanala özel TL/yüzde fiyat kuralı, B).
  - BENCH T1 "platform bazlı kâr marjı (akıllı fiyatlandırma)" (A).
  - COMP §1.1 Entegra "akıllı fiyatlandırma" (iddia).
- **Farklılaşma:**
  - Kural **deterministik ve önizlemeli**: "yayında ne gideceğini gör".
  - Validator'a yalnız hedef fiyat alanı olarak taşınır (BENCH Y-16, `targetPublishQty` deseni).
  - Kural motoruna açılmaz. Stok politikası gibi ayrı, sade ekran.
- **FE işi:** `PriceRulesView` (`EkSettingsTemplate`, kanal başına bölüm) + ürün detayında "bu kanalda yayınlanacak fiyat" satırı.
- **BE işi:** **B-10**
- **Büyüklük:** FE M · BE M · **Bağımlılık:** F-08 (aynı önizleme bileşeni); Trendyol barkod başına 30/dk fiyat limiti (TYV2 §3.5) için yayın hızlandırma yerelde.

### F-10 — Kâr/komisyon analizi ve raporlar
- **Problem:** Satıcı "hangi kanalda gerçekten kazanıyorum" sorusunu yanıtlayamıyor.
  - Rapor modülü yok (BENCH G4 "YOK").
  - Alış maliyeti alanı modelde doğrulanamadı: `costPrice` yalnız bir arama filtresinde geçiyor (`variant-service.ts:104,110`), şemada yok (grep `database/`).
- **Rakipte:**
  - BENCH G2/G4 "SIK": T3 Sentos raporlar modülü (satış, kâr, kanal karşılaştırma, stok hareketi, envanter değeri; Excel; A).
  - T1 Entegra: esnek Excel raporlama.
  - G4 Cin7: kanal/ürün bazlı kâr marjı.
- **Farklılaşma:**
  - Veri yoksa **"hesaplanamadı"** gösterilir, uydurma sayı yok (BENCH Y-11 kabul kriteri).
  - Komisyon Trendyol sipariş satırından (`lines[].commission`, TYV2 §2.3) ve settlement'tan.
  - Kaynak her hücrede izlenebilir.
- **FE işi:** `ReportsView` (`EkPageTabs`: Satış · Kâr · Kanal karşılaştırma · Stok hareketi) + ürün formunda maliyet alanı.
- **BE işi:** **B-13** · **Büyüklük:** FE L · BE L · **Bağımlılık:** B-01 (Trendyol V2 alan adları: `line.id → lineId`, `lineUnitPrice`; TYV2 R9).

### F-11 — Hakediş mutabakatı / eksik ödeme tespiti
- **Problem:** Pazaryeri kesintileri (komisyon, kargo, ceza) beklenenle karşılaştırılmıyor.
- **Rakipte:**
  - BENCH T1: ayrı ücretli modül, "eksik ödeme kontrolü" (A).
  - BENCH T7 (B), T3 Platinum.
  - COMP §4 #2: "İş değeri Yüksek, Öncelik Yüksek".
- **Farklılaşma:** Önce Trendyol (settlement/otherfinancials/payment-order/cargo-invoice uçları V2'de değişmedi, TYV2 §1). HB/N11 için "desteklenmiyor" açıkça gösterilir.
- **FE işi:** F-04 sekmelerine "Mutabakat" sekmesi.
- **BE işi:** **B-14** · **Büyüklük:** FE M · BE L

### F-12 — Otomasyon kuralları v1 (kapalı katalog, kuru çalıştırma)
- **Problem:** Tekrarlayan sipariş işleri elle yapılıyor: etiketleme, belirli kanalda otomatik onay, bildirim.
- **Rakipte:**
  - BENCH H1 "SIK global": G1 Linnworks kural motoru, G2 Brightpearl Automation Engine, G3 Sellercloud Order Rule Engine.
  - TR: T3 kural bazlı otomatik gönderim, desi/bölge kargo seçim kuralı.
- **Farklılaşma** (PAT Konu 4):
  - Kapalı tetik/eylem kataloğu, tek seviye VE koşulu.
  - Kaydetmeden önce **"son N siparişte ne yapardı"** kuru çalıştırması.
  - Döngü koruması: kural kaynaklı olay kuralı tetiklemez; saatlik tavan.
  - **Stok politikası kurala açılmaz.**
  - Zapier'in bu konuyu kullanıcıya bıraktığı belgeli (A).
- **FE işi:** `AutomationRulesView` (`EkListPage` + `EkFormDialog`/sihirbaz) + çalışma günlüğü.
- **BE işi:** **B-15** · **Büyüklük:** FE L · BE L · **Bağımlılık:** plan kapısı `automation` (ADR-0008 `features[]`; fiyat Protokol 12).

### F-13 — Soru ve mesaj verimliliği: hazır yanıt şablonları + yanıt süresi göstergesi
- **Problem:** Soru-cevap var (`MessageService`) ama her yanıt sıfırdan yazılıyor. Bekleme süresi görünmüyor.
- **Rakipte:**
  - BENCH C4 "ŞART" (T1 mesajlaşma). Hazır yanıt/SLA ise BENCH'te **"doğrulanamadı"**. Y-31 yalnız "verimlilik" gerekçesiyle P2.
  - → Şablon özelliği **`hipotez`**: rakipte kanıtı yok.
- **Farklılaşma (hipotez):**
  - Trendyol'un 10–2000 karakter kuralını (TYV2 §1 `qnaAnswerUrl`) gönderimden önce doğrulayan editör.
  - "Bekleme süresi" çipi (`createdAt` → `formatRelative`).
- **FE işi:**
  - Süre çipi + karakter sayacı: **BE yok** (bulutta yapılabilir).
  - Şablon seçici: BE sonrası.
- **BE işi:** **B-11** (tenant-paylaşımlı şablon koleksiyonu).
- **Büyüklük:** FE S · BE S

### F-14 — İade: stoka geri alma kararı + güncel red nedenleri + iade detayı
- **Problem:**
  - İade onayında ürünün stoka dönüp dönmeyeceği kararı arayüzde yok. ADR-0004 Karar 2 "iade restock varsayılan KAPALI, tenant açarsa" diyor, ama `autoRestock` bilerek reddediliyor (TS §1.3, "tüketicisi yok").
  - Trendyol red nedenleri 23.09.2026'da değişti (DEAD §1, TYV2 R11).
- **Rakipte:** BENCH C3 "ŞART": T1 (Paket 2 iade yönetimi), T3 iade yönetimi. Restock kararının rakip UI'ı araştırmada yok → bu ayrıntı **`hipotez`**.
- **Farklılaşma:** Satır bazında "stoka al / hasarlı" kararı. İdempotent `return:` anahtarı ile tek sefer (ADR-0004 Karar 2).
- **FE işi:**
  - iade detayı: `getClaimById` (BE hazır),
  - red nedeni listesini **canlı** çekmek (`getOrderRejectionReasons` deseni zaten FE'de var; iade karşılığı yerelde doğrulanmalı),
  - restock onay adımı (B-12 sonrası).
- **BE işi:** **B-12**; ayrıca Trendyol `approveClaim` gövdesi (TYV2 R11) B-01 kapsamında.
- **Büyüklük:** FE S-M · BE M

### F-15 — Ekip daveti ve kademe-farkında arayüz
- **Problem:**
  - Site "Kademeli roller ekibinizi yetkilendirir" diyor (CAP `homePillars` id `rbac`, satır 407+).
  - Ama FE düğmeleri kademeye göre gizlemiyor (BENCH I1).
  - Yönetici yeni kullanıcının parolasını kendisi belirliyor (ACC açık karar 4; GAP N11).
  - FE'de yalnız `isOwner()` ve `isPlatformAdmin()` var; admin/member ayrımı yok (`frontend/src/composables/user.ts:262-270`).
- **Rakipte:** BENCH I1 "ŞART": T2 kullanıcı yetkileri, T3 rol tabanlı yetki, G2/G3 rol/izin şablonları.
- **Farklılaşma:** Varsayılan-ret politika (CAP `default-deny`) + UI'da **nedenli** devre dışı düğme ("Bu işlem yönetici yetkisi ister"). Sessiz gizleme yok.
- **FE işi:** davet akışı, rol açıklama tablosu, `minRole` alanının `screens.ts`'e uygulanması, ortak 403/404 durumları (N18).
- **BE işi:** **B-05** (davet) + **B-04** (profil DTO'da `tier`, menü süzmesi).
- **Büyüklük:** FE M · BE M

### F-16 — Abonelik yönetimi tamamlama + kabuk uyarı bandı
- **Problem:** İptal, plan değişimi ve fatura geçmişi yok. Deneme bitişi / ödeme gecikmesi uyarısı yalnız abonelik ekranında (GAP b-3).
- **Rakipte:** BENCH I3: TR rakiplerde yıllık kademeli lisans + 7–14 gün kartsız deneme (T2, T3). Self-servis iptal ekranı araştırmada kanıtlanmadı → kabuk bandı dışındaki UX ayrıntıları **`hipotez`**.
- **Farklılaşma:** Askıda "stok senkronu duracak, aşırı satış riski" açık uyarısı (ADR-0008 §3 risk notu). Sessiz askı yok.
- **FE işi:**
  - Kabuk bandı: `getMySubscription.access/reason` — **BE hazır, bulutta yapılabilir**.
  - İptal/plan değişimi/geçmiş: B-08 sonrası.
- **BE işi:** **B-08** (yalnız mock sağlayıcıyla). iyzico ve fiyatlar Protokol 12.
- **Büyüklük:** FE S (band) + M · BE L

### F-17 — Kategori/özellik eşleme yardımcısı (önce deterministik, sonra ajan)
- **Problem:** Ürünü pazaryerine gönderememenin başlıca nedeni eksik zorunlu nitelik. `autoMatchAllCategories` var (BENCH A4 "VAR") ama "neresi eksik" özeti yok.
- **Rakipte:**
  - SOPYO §3 "YOK — ekleme" listesi: Sopyo'da **"yapay zekâ destekli kategori/özellik eşleştirme, AI Hub"** var. Aynı belge bunun Entegrasyonik'te karşılığı olmadan iddia edilmemesini söylüyor.
  - COMP §1.2: destek merkezinde "Sopyo AI Hub" kategorisi.
  - BENCH T1: "yapay zeka ile barkoddan ürün ekleme" (A).
- **Farklılaşma:**
  - **Önce deterministik** eşleme sağlığı: kategori başına eşlenmemiş zorunlu nitelik sayısı ve etkilenen ürün sayısı.
  - Sonra ADR-0018 Karar 3 çerçevesinde **öneri → onay** (`ActionProposals`). Ajan asla doğrudan yazmaz; onaylayan kullanıcının kimliğiyle yürür.
  - Rakiplerin "AI" iddialarından farkımız: **açıklanabilir öneri + onay kuyruğu + LLM'siz yedek yol**. LLM'in kaliteyi artıracağı iddiası **`hipotez`**.
- **FE işi:** `MappingHealthView` (`EkReadonlyPanelTemplate` + `EkDetailSheet` ile hızlı eşleme). Onay kuyruğu UI'ı sonra.
- **BE işi:** **B-16** (deterministik özet); **B-17** (onay kuyruğu, eşikli). LLM: Protokol 12.
- **Büyüklük:** FE M · BE S (B-16) + M (B-17)

### F-18 — Sevkiyat listesi ve yazdırma (ölü "Çıktılar" ekranının yerine)
- **Problem:** `PrintoutListView` sahte veri gösteriyor (GAP a-17). Gerçek etiket yazdırma sipariş detayında gömülü (`BarcodePrintComponent`).
- **Rakipte:** BENCH D2 "ŞART" (T3 toplu etiket tek PDF, T6). COMP §1.3 Yengeç "fatura + kargo etiketi tek PDF" (iddia). Kargo firması API'si yokken tam karşılığı yapılamaz (BENCH D1).
- **Farklılaşma:** Kargo takip bilgisinin "elle girilir" sınırı ekranda açık (CAP `shipping-invoice-notice` caveat ile aynı dil). Basıldı işareti ile "basılmayanlar" filtresi.
- **FE işi:** `ShipmentListView` (`EkListPage`; `getShipments` + `markAsPrinted`). `PrintoutListView` menüden kaldırılır ya da yönlendirilir.
- **BE işi:** **B-18** (`getShipments` bugün stub: filtre/sıralama yok — TS §6).
- **Büyüklük:** FE M · BE S

### F-19 — Kayıtlı görünümler (kişisel filtre setleri)
- **Problem:** Operatör her gün aynı filtreleri yeniden kuruyor.
- **Rakipte:** Yerel rakiplerde kanıt yok. PAT Konu 8'de Linear özel görünümler (A). PAT §c #37 kararı: "UYARLA — kişisel, URL parametreli".
- **Farklılaşma:** Yalnız `screens.ts` `urlParams` beyaz listesi (PII yok, ADR-0012).
- **FE işi:** `OrderListView`/`ClaimListView`/`MessageListView` üzerinde "Görünümü kaydet". Saklama: v1 `localStorage` (kullanıcı+tenant anahtarlı). Cihazlar arası tutmak için B-04'e eklenebilir.
- **BE işi:** v1 yok · **Büyüklük:** FE S-M

### F-20 — Genel API, API anahtarı ve giden webhook (sonraki dalga)
- **Rakipte:** BENCH H3 "SIK": T1 "API web servis", T3 Premium API, G1/G2/G3 REST/OAuth. Giden webhook TR rakiplerde doğrulanamadı (BENCH H4).
- **Farklılaşma:** PAT Konu 3 kararları:
  - thin olay gövdesi (PII yok),
  - Standard Webhooks başlıkları,
  - kapsamlı anahtar yalnız bir kez gösterilir,
  - `Idempotency-Key`.
- **FE:** API anahtarları + teslimat günlüğü ekranı · **BE:** L (Y-14) · Plan kapısı fiyatı Protokol 12.

### F-21 — Kargo firması ve e-fatura sağlayıcı adaptörleri (dış karar bekliyor)
- **Rakipte:** Üç rakipte de var (COMP §2; BENCH D1/E1 "ŞART"). 1 Ocak 2027 e-Arşiv genişlemesi talebi artırır (DEAD §9, B/C kanıt).
- **Durum:** Sağlayıcı seçimi Protokol 12 (ADR-0018 Karar 6.1/6.2). Bu yol haritası adaptör yazmaz. FE'nin bu arada yapacağı tek şey F-02'deki **dürüst "Yakında"** gösterimi. Bugünkü `EInvoiceView` kaydetmiyor bile (GAP a-25).

### Bilinçli olarak önerilmeyenler (kapsam koruma)

BENCH §4 ve PAT (d) ile uyumludur:
- görsel akış tasarımcısı / keyfi HTTP adımı,
- SMS/push/Slack ilk sürümde,
- rakip fiyat robotu (BENCH Y-24; veri kaynağının yasal durumu doğrulanamadı → Protokol 12),
- çok depo / WMS,
- yurtdışı kanallar,
- ölçülmemiş "X dakikada senkron" sözleri (PAT §c #50).

---

## 3. Sıralanmış yol haritası (dalga dalga)

İlke: her dalga kullanıcının **gözle görebileceği** bir değer üretir. Bulut işleri (a) backend hazır olanlardır. Yerel işler (b) sonraki dalganın bulut işlerini besler.

| Dalga | Kullanıcının göreceği değer | Bulut (FE) | Yerel (BE) |
|---|---|---|---|
| **W0 — Koruma (hemen, takvimli)** | "Trendyol ürünlerim 15/23 Ekim'den sonra da gidiyor" | — (menşe alanı B-01 sonrası W2'de) | **B-01** Trendyol V2 + `origin` (P0) |
| **W1 — Vaat ettiğimizi göster** | Aşırı satış, entegrasyon sağlığı, finans dökümü, denetim günlüğü, bildirim rozeti görünür | C1.1–C1.6 | B-02 testConnection, B-03 mutabakat kaydı, B-04 tier/menü |
| **W2 — İlk değer süresi + güven** | Kurulum rehberi, kabuk abonelik bandı, kademe-farkında düğmeler, kayıtlı görünümler, soru bekleme süresi, menşe alanı | C2.1–C2.6 | B-05 davet, B-06 hata kutusu, B-07 bildirim tercihleri + düşük stok, B-08 abonelik yönetimi (mock) |
| **W3 — Verimlilik** | Toplu fiyat/stok (önizleme+geri al), hata kutusu, iade kararı, sevkiyat listesi, eşleme sağlığı | C3.1–C3.5 (B-06/B-09/B-12/B-16/B-18 teslim sonrası) | B-09 toplu iş, B-10 fiyat kuralı, B-11 yanıt şablonu, B-12 iade restock, B-16 eşleme sağlığı, B-18 sevkiyat |
| **W4 — Kârlılık** | Kanal fiyat kuralı, kâr raporu, hakediş mutabakatı | C4.1–C4.3 | B-13 kâr/rapor, B-14 hakediş |
| **W5 — Otomasyon ve ajan** | Kural motoru, öneri/onay kuyruğu | C5.1–C5.2 | B-15 kural motoru, B-17 ActionProposals (eşikli) |
| **W6+ — Dış karar bekleyenler** | Kargo etiketi, e-fatura, genel API | — | Protokol 12 kararlarından sonra (§4) |

Sıra gerekçesi:
- W1, **sıfır backend** ile sitede vaat edilen ama görünmeyen üç şeyi kapatır: aşırı satış görünürlüğü, dayanıklılık/sağlık, finans görünümü (§1 öncelik listesi).
- W2 aktivasyonu ve güveni hedefler.
- W3–W4, rakiplerin ücretli modül olarak sattığı günlük verimlilik ve para işleridir (BENCH §6 sırasıyla uyumlu: "güvence + görünürlük → çekirdek → gelir → değer katmanı").

### 3.0 Tüm bulut briflerinde ortak kurallar (her brife dahil kabul edilir; brif metinlerinde tekrar edildi)

- **İlk iş:** `bash scripts/cloud-setup.sh`, sonra CLAUDE.md (kural 7). Önce oku: ADR-0015 Karar 1, 3, 5.6, 6 ve `.claude/skills/premium-ui-standards/SKILL.md`.
- **Dosya kapsamı:** yalnız `frontend/` değişir. Backend salt okunur. Backend çalıştırılamaz; API çağrıları `e2e/fixtures/mockApi.ts` + sentetik fixture ile mock'lanır. PII yok (Protokol 7).
- **Çağrı deseni:** `frontend/src/composables/use<Alan>Api.ts` (örnek: `useStockPolicyApi.ts`, `useTenantDataApi.ts`). Çağrılar `restApi` üzerinden yapılır. Hata değerleri `composables/apiErrors.ts` sözleşmesiyle işlenir. Uydurma alan yok: yanıt şekli ilgili belgedeki (TS/ACC) örnekle birebir.
- **Tasarım dili:** §0.3 kuralı.
  - DS-v2 main'de ise DS-v2 kataloğu; değilse ADR-0015 Karar 6 kataloğu.
  - Her iki durumda: durum için `EkStatusChip` + `src/design/status-map.ts`; biçim için `src/composables/format.ts`.
  - Yeni ekranda çıplak `v-data-table`/`v-dialog`/`v-chip`/`toLocale*` = 0 (desen mandalı).
  - Boş/hata/yükleniyor ayrı gösterilir; kullanılamayan sayı "—" ile gösterilir, "0" ile değil.
- **`screens.ts`:** yalnız **ekleme**. Menü DB kaydı bulut kapsamı dışıdır (yerel not).
- **i18n:** yeni metinler `tr.json` anahtarı olarak girer.
- **Yeni ekran testi (Karar 5.6):** smoke + boş + hata (ham hata sızmıyor) + ≥1 etkileşim (istek gövdesi doğrulaması) + 3 viewport ekran görüntüsü + axe AA = 0 + rol testi (yetkisiz kademe → 403 durumu).
- **Doğrulama:**
  ```
  cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet && npm run test:contract-paths
  npx playwright test <spec> --project=chromium-desktop --update-snapshots=missing   # ara adımlar
  npx playwright test <spec> --update-snapshots=missing                               # sonda bir kez, 3 viewport
  ```
  `*-linux.png` commit'lenmez.
- **Git:** dal `cloud/<kısa-ad>` (güncel `origin/main`'den). Küçük adımlarla commit + push. Mesaj: `faz3-<dalga>-cloud-<kısa-ad>: ...` (Türkçe ASCII). `git add -A` yok.
- **"Bitince" raporu:** ne değişti, test sonuçları, commit listesi ve **yerel orkestratöre notlar**:
  - (i) `backend/src/capabilities/domains/*.ts` içinde artık FE'nin çağırdığı yeteneklerin `ui` eşlemesi (`noUi('…BACKEND_ONLY_NOT_YET_IN_FE')` → ekran),
  - (ii) ApplicationDB `menus` kaydı,
  - (iii) backend sözleşmesinde bulunan eksik/belirsizlik.

### 3.1 Dosya sahipliği ve paralellik (W1–W2 bulut)

Aynı dosya iki oturumda aynı anda değişmez (CLOUD_BRIEFS "Akış"). Paylaşılan dosyalar:
- `screens.ts`: yalnız ekleme, çakışmada birleştirme kolay,
- `tr.json`: yalnız ekleme,
- `src/design/status-map.ts`: yalnız ekleme.

Bu üçü dışında sahiplik aşağıdadır. Aynı satırdaki brifler **sırayla** çalışır.

| Paralel şerit | Sıra | Sahip olduğu dosyalar (özet) |
|---|---|---|
| A — Ürün | C1.0 → C2.6 | `views/secure/productDefinitions/ProductListView.vue`, `components/productDefinitions/**`, `components/integrations/erp/**` |
| B — Sipariş/stok | C1.1 → C2.4 | `views/secure/OrderListView.vue`, `components/order/**`, yeni `StockHealthView`, `components/dashboard/StockHealth*` |
| C — Entegrasyon | C1.2 | `views/secure/integrations/{Marketplace,ECommerce,Shipping,EInvoice,Erp}View.vue`, `components/integrations/**` (erp hariç: şerit A), yeni `IntegrationHealthView` |
| D — Hesap/yönetim | C1.3 → C1.6 → C2.2 | yeni `AuditLogView`, `views/secure/user/PrivacyDataView.vue`, `views/secure/CustomerListView.vue` + `components/customer/**`, `layouts/SecureLayout.vue` (bant) |
| E — Finans | C1.4 | `views/secure/FinancialListView.vue` + `components/financial/**` |
| F — Kabuk/bildirim | C1.5 → C2.1 | `components/layout/ApplicationBar.vue`, `components/user/NotificationDrawerComponent.vue`, `stores/notificationDrawer.ts`, yeni `NotificationCenterView`, `views/secure/DashboardView.vue` (C2.1 kartı), `composables/useOnboarding.ts` |
| G — Mesaj | C2.5 | `views/secure/MessageListView.vue` + `components/message/**` |

Çakışma notları:
- **DS-v2 Aşama 2** (DESIGN_SYSTEM.md §8) tüm şeritlerle kesişir. Bir DS-v2 göç oturumu açıkken, o oturumun sahip olduğu dosyalara (kabuk, listeler, diyaloglar, pano) bu plandaki brifler dokunmaz.
  - Çözüm A (önerilen): bu plandaki brif, ilgili DS-v2 göç adımı birleştikten sonra başlar.
  - Çözüm B: brif kapsamı aynı DS-v2 göç oturumuna eklenir.
  - **Yeni ekran brifleri etkilenmez.**
- C1.1'in pano kartı `DashboardView.vue`'ya dokunur. Bu yüzden C2.1 (şerit F), C1.1 birleştikten **sonra** başlar.
- C2.2 bandı `SecureLayout.vue`'ya dokunur; C1.5 (`ApplicationBar.vue`) ile ayrı dosyadır.

### 3.2 W0 — Koruma (yerel, takvimli; bulut işi yok)

**B-01** aşağıda (§3.8). Kullanıcı değeri: 15.10.2026'dan (Trendyol sipariş/ürün V1 kapanışı) ve 23.10.2026'dan (menşe zorunlu) sonra ürün ve siparişlerin akmaya devam etmesi (DEAD §1; TYV2 §0, R1–R9). FE tarafındaki tek iş (menşe alanı) B-01'in şema/transformer kısmından sonra C2.6'dır.

### 3.3 W1 — Bulut brifleri (backend HAZIR)

#### C1.0 — Kırık ürün/müşteri/iade düğmelerini dürüstleştir (şerit A)

```
Görev: frontend/ içinde backend'de KARŞILIĞI OLMAYAN (bugün 403 dönen) çağrıları ya çalışan uca bağla ya da nedenli devre dışı bırak. Değer: sitede "available" olan "çoklu pazaryeri ürün yönetimi" vaadinde kullanıcı tıkladığı düğmede sessiz hata almasın.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/adr/0015-uygulama-gorsel-yenileme.md (Karar 5.1 izinli değişiklik, 5.6, 6), .claude/skills/{characterization-testing,premium-ui-standards}/SKILL.md, frontend/docs/PRODUCT_VALUE_PLAN.md §1.2 (multi-channel-products satırı).
Dal: cloud/w1-broken-actions (güncel origin/main'den). Yalnızca frontend/ değişir; backend SALT OKUNUR.
DS-v2 çakışması: ProductListView/Customer/Claim listeleri DS-v2 Aşama 2 adım 2'nin (liste standardı) dosyalarıdır. Bu brif bir HATA DÜZELTMESİDİR, görsel göç yapmaz: yalnız çağrı/etkin-devre dışı mantığına dokun, şablon/stil değiştirme. Adım 2 oturumu bu dosyalarda açıksa başlama ve raporla.
Kırık çağrılar (grep ile yeniden doğrula; backend'de metot/yetenek YOK — backend/src/capabilities/domains/integrations.ts:54,112,134 "FE_CALLS_WITHOUT_BACKEND" notları):
- IntegrationService/processPlatformProduct (views/secure/productDefinitions/ProductListView.vue:726,745,755,765; mode TRANSFER/UPDATE_PRICE/UPDATE_STOCK/UPDATE)
- IntegrationService/checkProductStatus (ProductListView.vue:707; components/integrations/erp/BizimhesapComponent.vue:154)
- ProductService/batchProcessUpdate + batchProcessDelete (components/productDefinitions/products/BatchActions/useBatchActions.ts:158,197; SET_CATEGORY/SET_BRAND/SET_TAGS/CHANGE_STATUS/DELETE)
- VariantService/getVariantsList (components/productDefinitions/variants/ProductVariantAttributesComponent.vue:899)
- IntegrationService/retrieveProductsFromClientMarketplace (views/secure/integrations/MarketplaceView.vue:149)
- CustomerService/deleteCustomer + bulkDeleteCustomers (components/customer/composables/useCustomerActions.ts:100,140), ClaimService/bulkDeleteClaims (components/claim/composables/useClaimActions.ts:185)
Yapılacaklar:
1. ÖNCE (Protokol 13): etkilenen düğmeler için bugünkü davranışı (gönderilen istek gövdesi + 403 sonrası kullanıcıya görünen durum) sabitleyen Playwright spec'i yaz, DEĞİŞMEMİŞ kodda yeşil göster (mevcut products.spec.ts / customers.spec.ts / claims.spec.ts desenini ve e2e/fixtures/mockApi.ts'i kullan).
2. Tek ürün gönder/fiyat/stok/güncelle: backend/src/api/services/integration-service.ts:1127-1300 (batchCreator + internalProcessBatch) SALT OKU; istek şekli { mode, selectedIntegrations, barcodeList, scope }. Mode kümesi (PLATFORM_PROCESS) ve scope anlamı birebir uyuyorsa düğmeleri batchCreator'a bağla (seçili varyantın barkodu + tek kanal). Uymuyorsa DOKUNMA, düğmeyi devre dışı bırak + ipucu "Bu işlem şu an toplu gönderim menüsünden yapılır".
3. Durum sorgula (checkProductStatus): çalışan karşılığı yoksa düğmeyi gizleme, nedenli devre dışı bırak + "İşlem günlüğünde gör" bağlantısı (LogListView sekmesini aç; eventBus 'openTab').
4. Toplu kategori/marka/etiket/durum/sil ve müşteri/iade silme: backend teslim edene kadar (PRODUCT_VALUE_PLAN B-19) menü öğeleri nedenli devre dışı: "Bu toplu işlem yakında" — sessiz 403 yok. VariantService/getVariantsList'in amacını bul; ProductService/retrieveProduct (TS §2.1) aynı veriyi veriyorsa ona geçir, değilse devre dışı.
5. MarketplaceView ürün çekme: IntegrationService/requestFetchFromPlatform (integration-service.ts:551; FE'de TrendyolComponent.vue:177 deseni) eşdeğerse ona bağla.
Kurallar: davranış değişiklikleri ADR-0015 Karar 5.1'deki gibi AYRI commit + spec literal'i açıkça güncellenir; uydurma alan yok; Karar 6 (EkConfirmDialog/useToast); pattern/style mandalları artamaz.
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet && npm run test:contract-paths; npx playwright test products.spec.ts customers.spec.ts claims.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport bir kez. *-linux.png commit'leme.
Commit: faz3-w1-cloud-broken-actions: ... (küçük adımlar, git add yol yol).
Bitince: hangi çağrı nereye bağlandı / hangisi devre dışı (tablo), test sonuçları, commit listesi; YEREL NOT: backend operation-policy testindeki FE_CALLS_WITHOUT_BACKEND listesi güncellenmeli; B-19 kapsamı.
```

#### C1.1 — Stok sağlığı: aşırı satış rozeti, filtre, pano kartı, ekran (şerit B)

```
Görev: frontend/ içinde ADR-0004 rezervasyon motorunu kullanıcıya görünür kıl (F-01). Backend HAZIR: docs/API_TENANT_SURFACE.md §2 (OVERSOLD/rezervasyon, member).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md §0 ve §2 (TAMAMI), docs/adr/0004-zero-oversell-rezervasyon-modeli.md (Karar 1-2, 5, 7), docs/adr/0015-*.md (Karar 3.3 durum paleti, 3.5 KPI, 3.9 EkReadonlyPanelTemplate, 5.6, 6), .claude/skills/premium-ui-standards/SKILL.md.
Dal: cloud/w1-stock-health. Yalnızca frontend/.
DS-v2 çakışması: 3. madde (yeni StockHealthView) HEMEN yapılabilir. 4. madde (OrderListView) DS-v2 Aşama 2 adım 2, 5. madde (pano) adım 4 ile çakışır. O adımlar açıksa/henüz birleşmemişse 4–5'i ATLA, yalnız ekranı teslim et ve raporla.
Sözleşme (AYNEN): StockService/getStockOverview {limit?:1..50} → { generatedAt, attention:{oversold:{lines,units}, unmapped:{lines,units}}, recentOrders[], variants:{total,totalStock,reservedUnits,availableUnits,withReservations,overReserved,publishPending}, reconciliation:{tracked,lastRunAt} }. OrderService/getOrders → searchOrderForm.filter.allocationStates: ('RESERVED'|'COMMITTED'|'RELEASED'|'OVERSOLD'|'RESTOCKED'|'UNMAPPED')[]; siparişte items[].allocationState, lastAllocationAppliedAt, oversoldEscalatedAt. ProductService/retrieveProduct → variants[].stock, reserved (available = stock - reserved, FE hesaplar; allocations[]'ı LİSTEDE KULLANMA).
Yapılacaklar:
1. composables/useStockHealthApi.ts (useStockPolicyApi.ts deseni).
2. src/design/status-map.ts'e allocation eşlemesi (yalnız ekleme): RESERVED→info "Rezerve", COMMITTED→success "Sevk edildi", RELEASED→neutral "Serbest", OVERSOLD→danger "Aşırı satış", RESTOCKED→neutral "Stoka döndü", UNMAPPED→warning "Eşleşmedi".
3. Yeni StockHealthView (EkReadonlyPanelTemplate): EkKpiRow (Açık aşırı satış satır/adet · Eşleşmeyen satır/adet · Kullanılabilir / rezerve adet · Yayın bekleyen varyant); "Dikkat gerektiren siparişler" tablosu (EkDataTable, satır tıklanınca sipariş sekmesi openTab ile allocationStates filtresiyle); "Son mutabakat": tracked=false ise "Mutabakat sonuçları henüz kaydedilmiyor" (UYDURMA zaman YOK). "Son güncelleme · Yenile" göstergesi, nabız animasyonu yok. screens.ts'e ekle: { key:'StockHealthView', slug:'catalog/stock-health', section:'catalog', order:6, icon:'mdi-scale-unbalanced', titleKey:'menu.stockHealth' }.
4. OrderListView: kalem durum rozeti (EkStatusChip) + filtre çubuğuna "Stok durumu" çoklu seçim → allocationStates; screens.ts OrderListView urlParams'a { name:'allocationStates', kind:'enum', multi:true, allowed:[6 değer] } EKLE ve ekran parameters?.allocationStates'i gerçekten okusun (URL ⇄ filtre).
5. Pano: küçük "Stok sağlığı" kartı (EkKpiCard, tıklanınca StockHealthView); oversold.lines=0 ise sakin "Açık aşırı satış yok" metni (sahte "her şey mükemmel" yok).
6. Ürün detayında (varsa varyant tablosu) "Stok · Rezerve · Kullanılabilir" üç sütun (sayı tipi, .ek-num). ProductVariantsComponent büyükse ve B5 karakterizasyonu yoksa bu maddeyi ATLA ve raporla.
Kurallar: uydurma alan/sayı yok; kullanılamayan değer "—"; hata ≠ boş; renk tek başına anlam taşımaz; Karar 6 mandalları.
Test (Karar 5.6): stock-health.spec.ts — smoke, boş (attention 0), hata (ham hata sızmaz), etkileşim (filtre → getOrders gövdesinde allocationStates doğrulaması), 3 viewport, axe AA=0; orders.spec.ts mevcut iddiaları yeşil kalmalı (yeni rozet için yalnız ekleme).
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet && npm run test:contract-paths; npx playwright test stock-health.spec.ts orders.spec.ts dashboard.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-stock-health: ...
Bitince: değişenler, test, commit listesi; YEREL NOT: capabilities/domains/catalog.ts (stock.overview) ve orders.ts ui eşlemesi → StockHealthView/OrderListView; menus kaydı; varyant listesinde reserved alanının projeksiyonu (retrieveProduct dışında) gerekiyorsa backend notu.
```

#### C1.2 — Entegrasyon sağlığı + kapsam çipleri + dürüst "Yakında" + webhook token (şerit C)

```
Görev: frontend/ içinde tenant entegrasyon sağlığı ekranı (F-02, GAP N7-FE + N13). Backend HAZIR.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md §0 ve §3 (TAMAMI, "Uyarılar" dahil), docs/adr/0018-*.md Karar 1 (yetenek manifestosu, E3 dürüstlük), docs/research/2026-09-28-integration-saas-patterns.md Konu 2 (durum makinesi) ve Konu 8 (hata ≠ boş), docs/adr/0015-*.md (3.3, 3.9 EkReadonlyPanelTemplate, 3.10 not-connected boş durumu, 3.11 EkPlatformMark, 5.6, 6).
Dal: cloud/w1-integration-health. Yalnızca frontend/.
DS-v2 çakışması: 2. ve 5. maddeler (yeni IntegrationHealthView) HEMEN yapılabilir. 3–4. maddeler (entegrasyon formları) DS-v2 Aşama 2 adım 3'ün öncelikli dosyalarıdır. O adım açıksa 3–4'ü o oturuma devret ve raporla.
Sözleşmeler (AYNEN; SALT OKU): IntegrationService/getIntegrationHealth {} (admin) → TS §3 yanıtı; IntegrationService/getCatalog {} (member; backend/src/api/services/integration-service.ts:1505) → [{ code, displayName, category, status, adapterVersion, capabilities:{<key>:{level,note}}, limitations, verification }] — level ∈ supported|limited|platform_auto|not_supported; IntegrationService/generateWebhookToken { integrationCode } (admin; integration-service.ts:292) → { integrationCode, webhookToken } — her çağrı YENİ token üretir, eskisini geçersiz kılar, webhookHealthy=false olur.
Yapılacaklar:
1. composables/useIntegrationHealthApi.ts.
2. Yeni IntegrationHealthView (EkReadonlyPanelTemplate): kanal başına satır — EkPlatformMark, health → EkStatusChip (healthy→success "Sağlıklı", degraded→warning "Sorunlu", down→danger "Erişilemiyor", no_data→neutral "Son 24 saatte çağrı yok", not_configured→neutral "Kurulmadı"); son başarılı senkron (formatRelative; credentialsConfigured=false ise "—" — TS §3 uyarı a), son hata KODU insan diliyle (AUTH→"Kimlik bilgisi geçersiz — yeniden girin", RATE_LIMITED→"Pazaryeri hız sınırı — otomatik yeniden denenecek", UNAVAILABLE→"Pazaryeri geçici olarak yanıt vermiyor" ...; ham mesaj YOK), devre kesici (stale=true ise "eski gözlem"), 24 sa çağrı/başarı/hata. "Bağlantıyı test et" düğmesi YOK: yerine "Aktif bağlantı testi yakında" notu (B-02). screens.ts: { key:'IntegrationHealthView', slug:'integrations/health', section:'integrations', order:6, icon:'mdi-heart-pulse', titleKey:'menu.integrationHealth' }.
3. Kapsam çipleri: components/integrations/IntegrationCapabilityChips.vue (getCatalog; level → ton; note ipucu). Marketplace/ECommerce/Erp ekranlarında seçili platformun üstünde göster.
4. Dürüst "Yakında": getCatalog'da KODU OLMAYAN sağlayıcı formları (Kargo ekranındaki 9 firma, E-fatura listesi, Ideasoft dışı e-ticaret) salt-okunur + EkEmptyState/rozet "Yakında — bu sağlayıcıyla otomatik entegrasyon henüz yok"; kaydet düğmesi gizlenmez, NEDENLİ devre dışı. Daha önce kaydedilmiş ayarlar SİLİNMEZ (yalnız UI).
5. Webhook (yalnız Trendyol): IntegrationHealthView'de webhook satırı (healthy/lastReceivedAt) + "Webhook anahtarını yenile" (admin, EkConfirmDialog: "Mevcut adres geçersiz olur, Trendyol panelinde yeni adresi girmeniz gerekir"). Token YALNIZ yanıttan sonra bir kez gösterilir (kopyala), sayfada saklanmaz/loglanmaz. Tam adresin taban URL'si restapi.ts'te yoksa yalnız token + yol kalıbı "/hooks/trendyol/<anahtar>" gösterilir ve raporlanır.
Kurallar: uydurma alan yok (health türetimi backend'in; FE yeniden türetmez); kimlik bilgisi değeri asla gösterilmez; Karar 6; member kullanıcı getIntegrationHealth'te 403 alır → "Bu görünüm yönetici yetkisi ister" (EkErrorState değil, bilgi durumu).
Test: integration-health.spec.ts (smoke, boş/not_configured, hata, etkileşim: webhook yenile gövdesi {integrationCode:'trendyol'}, 403 rol testi, 3 viewport, axe=0); integrations-common.spec.ts ve integrations-einvoice.spec.ts yeşil (Yakında değişikliği AYRI commit, spec literal'i açıkça güncellenir).
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet && npm run test:contract-paths; npx playwright test integration-health.spec.ts integrations-common.spec.ts integrations-einvoice.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-integration-health: ...
Bitince: değişenler, test, commit listesi; YEREL NOT: capabilities/domains/integrations.ts:96,102,108 ui eşlemesi; menus kaydı; webhook tam URL tabanı; B-02 testConnection ihtiyacı.
```

#### C1.3 — Denetim günlüğü (şerit D)

```
Görev: frontend/ içinde tenant denetim günlüğü ekranı (F-05, GAP N10). Backend HAZIR: docs/API_TENANT_SURFACE.md §4 (admin).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md §0 ve §4 (TAMAMI), docs/research/2026-09-28-integration-saas-patterns.md Konu 10 (denetim günlüğü: filtreli, serbest metin aramasız), docs/adr/0015-*.md (6.1 EkListPage/EkDataTable, 5.6).
Dal: cloud/w1-audit-log. Yalnızca frontend/.
DS-v2 çakışması: yok (yeni ekran).
Sözleşme (AYNEN): AuditService/getAuditLogs { page?, limit?:1..100, from?, to? (ISO; varsayılan son 30 gün, aralık ≤366 gün), event?, eventPrefix?, userId?, result?:'ok'|'fail'|'error' } → { logs:[{id,at,event,result,userId,meta}], page, limit, totalNumberOfRecords, totalNumberOfPages, from, to }. 400 mesajları Türkçe, gösterilebilir. `admin.*` olayları istenemez (400).
Yapılacaklar:
1. composables/useAuditLogApi.ts.
2. Yeni AuditLogView (EkListPage): EkFilterBar — tarih aralığı (varsayılan 30 gün; >366 gün FE'de engellenir), olay grubu (eventPrefix: "Oturum" login/selectStore, "Kullanıcı" user., "Stok politikası" stock.policy., "Veri talepleri" tenant.export., "Parola" password_/user.password_change), kullanıcı (UserService/getUsers ile ad seçici — admin; userId opak), sonuç. Tablo: zaman (datetime), olay (i18n'li insan etiketi; bilinmeyen olay kodu olduğu gibi), kullanıcı adı (eşleşmezse "—"), sonuç (EkStatusChip ok/fail/error), ayrıntı (EkDetailSheet: meta anahtar/değer — yalnız ilkel değerler, backend zaten sanitize ediyor). Serbest metin arama YOK (bilinçli). CSV dışa aktarma bu turda YOK (backend ucu yok; rapora yaz).
3. screens.ts: { key:'AuditLogView', slug:'account/audit-log', icon:'mdi-clipboard-text-clock-outline', titleKey:'menu.auditLog' }. member kullanıcı 403 → bilgi durumu.
Kurallar: IP gösterilmez (dönmez zaten); uydurma olay adı listesi üretme — etiket sözlüğü yalnız TS §4'te sayılanlar, diğerleri ham kod.
Test: audit-log.spec.ts (smoke, boş, hata, etkileşim: filtre → istek gövdesinde from/to/eventPrefix doğrulaması, sayfalama, 403 rol, 3 viewport, axe=0).
Doğrulama: (ortak komutlar) + npx playwright test audit-log.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-audit-log: ...
Bitince: YEREL NOT: capabilities/domains/account.ts:149-151 ui eşlemesi; menus kaydı; CSV dışa aktarma ve {tid,at} indeksi (Protokol 12) ihtiyacı.
```

#### C1.4 — Finans: özet, kargo faturaları, ödeme dökümü sekmeleri (şerit E)

```
Görev: frontend/ içinde FinancialListView'e backend'i hazır üç görünümü ekle (F-04, GAP N14).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md §6 (ilk 3 satır), backend/src/api/services/financial-service.ts:108-230 (SALT OKU — getCargoInvoices, getFinancialSummary, getPayoutDetails istek/yanıt şekilleri; uydurma alan YOK), docs/research/2026-09-28-saas-capability-benchmark.md C5/C6 (HB/N11 boş alanlar), docs/adr/0015-*.md (6.1 EkPageTabs, EkKpiCard, 6.3 formatMoney), .claude/skills/{characterization-testing,premium-ui-standards}/SKILL.md.
Dal: cloud/w1-finance-tabs. Yalnızca frontend/.
DS-v2 çakışması: FinancialListView bir liste ekranıdır (Aşama 2 adım 2). Adım 2 bu dosyada açıksa başlama. Değilse sekmeleri ekle; göç, adım 2'de bu sekmeleri de kapsar.
Yapılacaklar:
1. ÖNCE financial.spec.ts'in mevcut iddialarının DEĞİŞMEMİŞ kodda yeşil olduğunu doğrula (yoksa önce karakterizasyon yaz).
2. composables/useFinanceApi.ts (üç uç; getPayoutDetails'te paymentOrderId yalnız string/sayı).
3. EkPageTabs: "İşlemler" (mevcut içerik, DEĞİŞMEZ) · "Özet" (EkKpiRow: toplam satış, komisyon, kargo, diğer kesintiler, net — yalnız backend'in döndürdüğü alanlar; kanal filtresi) · "Kargo faturaları" (EkDataTable; backend en fazla 5000 satır döner — "ilk 5000 satır gösteriliyor" notu) · "Ödeme dökümü" (ödeme emri seç → kalemler EkDetailSheet).
4. Kanal "desteklenmiyor" ile "0" ayrımı: backend bir kanal için veri döndürmüyorsa EkEmptyState "Bu kanal için bu görünüm desteklenmiyor" (HB/N11 kargo faturası/ödeme emri boş — BENCH C5); "0,00 ₺" GÖSTERME.
5. Sekme URL parametresi: screens.ts'e FinancialListView kaydı { key:'FinancialListView', slug:'finance', section:'finance', order:0, urlParams:[{name:'tab',kind:'enum',allowed:['transactions','summary','cargo-invoices','payouts']}] } — ekran parameters?.tab'ı gerçekten okumalı.
Kurallar: para yalnız format.ts formatMoney; hesap YAPMA (net = backend alanı; backend net vermiyorsa gösterme — raporla); Karar 6.
Test: financial.spec.ts'e ekleme (her sekme: smoke, boş/desteklenmiyor, hata, etkileşim istek gövdesi) + 3 viewport + axe=0.
Doğrulama: (ortak komutlar) + npx playwright test financial.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-finance-tabs: ...
Bitince: YEREL NOT: capabilities/domains/finance.ts:16,22,28 ui eşlemesi; özet alanlarında eksik gördüğün kalem (ör. net) → B-14 girdisi.
```

#### C1.5 — Bildirim rozeti (hafif) + bildirim merkezi sayfası (şerit F)

```
Görev: frontend/ içinde bildirim deneyimi v1 (F-06). Backend HAZIR: NotificationService/get|markAsRead|delete (mevcut FE kullanımı), NotificationService/getUnreadCount (member; backend/src/api/services/notification-service.ts:100 → { result:true, unreadCount:number }).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/research/2026-09-28-integration-saas-patterns.md Konu 5 (Linear/Primer: gelen kutusu birincil, kritik bildirim kapatılamaz), backend/src/database/client/models/Notification.ts (SALT OKU: type enum BATCH_PROCESS|ORDER|STOCK_ALERT|INFO|SYSTEM|EXPORT_READY|IMPORT_READY; severity; actionUrl; isRead), stores/notificationDrawer.ts, docs/adr/0015-*.md (3.8 çekmece, 6.1 EkListPage, 5.6).
Dal: cloud/w1-notifications. Yalnızca frontend/.
DS-v2 çakışması: 2. madde (NotificationCenterView) HEMEN yapılabilir. 1. madde (üst çubuk rozeti, ApplicationBar) DS-v2 Aşama 2 adım 1 (EkAppHeader bildirim sayacı) ile çakışır: adım 1 açıksa rozet mantığını yalnız stores/notificationDrawer.ts'te hazırla, header'a bağlamayı adım 1'e bırak.
Yapılacaklar:
1. Üst çubuk rozeti getUnreadCount ile; tam liste (get) YALNIZ çekmece açıldığında/merkez sayfasında çekilsin (10 sn'lik tam liste polling'i rozet sayımına iner; aralık değişirse gerekçesini yaz). Belge görünmezken (document.hidden) polling durur.
2. Yeni NotificationCenterView (EkListPage): tür filtresi (i18n etiketli), okunmuş/okunmamış, toplu "okundu işaretle"/sil (mevcut markAsRead/delete uçlarının desteklediği kadar — istek şeklini stores/notificationDrawer.ts'ten al), actionUrl varsa "Görüntüle" (yalnız uygulama içi rota; dış URL açma). screens.ts: { key:'NotificationCenterView', slug:'notifications', section:'general', order:1, icon:'mdi-bell-outline', titleKey:'menu.notifications' }. Çekmeceye "Tümünü gör" bağlantısı.
3. STOCK_ALERT ve SYSTEM türleri görsel olarak üstte sabit ("dikkat") — tercih ayarı bu turda YOK (B-07).
Test: notifications.spec.ts (smoke, boş, hata, etkileşim: okundu işaretle gövdesi, rozet sayısı güncellenir, 3 viewport, axe=0).
Doğrulama: (ortak komutlar) + npx playwright test notifications.spec.ts dashboard.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-notifications: ...
Bitince: YEREL NOT: capabilities/domains/account.ts:137-139 ui eşlemesi; menus kaydı; B-07 (tercihler/düşük stok/özet) ihtiyacı.
```

#### C1.6 — Veri ve gizlilik tamamlama: hesap silme talebi + müşteri anonimleştirme (şerit D, C1.3'ten sonra)

```
Görev: frontend/ içinde KVKK self-servis eksiklerini kapat (GAP N4 kalanı). Backend HAZIR: TenantDataService/requestDeletion (owner), CustomerService/anonymizeCustomer (admin).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), backend/src/api/services/tenant-data-service.ts:20-50 ve customer-service.ts:150-230 (SALT OKU; istek/yanıt ve hata kodları), views/secure/user/PrivacyDataView.vue (mevcut dışa aktarma), docs/adr/0015-*.md (3.8 onay diyaloğu: yıkıcı eylemde nesne adı yazılır, varsayılan odak Vazgeç; 5.6; 6).
Dal: cloud/w1-privacy-complete. Yalnızca frontend/.
DS-v2 çakışması: CustomerListView (Aşama 2 adım 2) açıksa 2. maddeyi atla ve raporla. PrivacyDataView çakışmaz.
Sözleşmeler: requestDeletion { password, confirmTenantName } → başarı (TenantLifecycleService sonucu — alanları okuyup AYNEN kullan); hatalar 400 'Parola gerekli.' / 'Mağaza adı doğrulanamadı.', 404, **401 'Parola doğrulanamadı.'**. anonymizeCustomer { customerId } → sonuç; 'Müşteri bulunamadı.'.
DİKKAT (bulgu): yanlış parolada requestDeletion 401 döner; FE'nin genel 401 → giriş sayfası yakalayıcısı kullanıcıyı oturumdan atabilir. Bu uç için 401'i yerelde yakala ve "Parola doğrulanamadı" alan hatası göster (restapi.ts'te uca özel istisna ya da çağrı seçeneği; genel davranışı DEĞİŞTİRME). Ayrıca YEREL NOT: backend'in 400 dönmesi önerilir (B-21).
Yapılacaklar:
1. PrivacyDataView'e "Hesabı sil" bölümü (EkSettingsSection, yalnız owner — isOwner()): açıklama yalnız backend davranışını anlatan nötr metin ("Talep sonrası mağaza 30 gün askıda kalır; bu sürede geri alma yalnız destek üzerinden yapılabilir"). Hukuki/aydınlatma metni YAZMA (Protokol 12) — yerine "Ayrıntılı bilgi: Gizlilik politikası" bağlantısı (site yasal sayfası; config/siteLinks.ts'te varsa). EkFormDialog: parola + mağaza adını aynen yaz; eşleşmeden "Sil" etkin olmaz; son adım EkConfirmDialog (error dolgu, "Silme talebi oluştur").
2. Müşteri detayına "Kişisel verileri anonimleştir" (admin; ⋯ menüsünde, yıkıcı): EkConfirmDialog — "'<müşteri adı>' anonimleştirilsin mi? Ad, iletişim ve adres bilgileri kalıcı olarak maskelenir; sipariş kayıtları kalır." Başarıda liste yenilenir, toast.
Test: privacy-data.spec.ts ve customers.spec.ts'e ekleme: smoke, hata (401 yakalanır, oturum düşmez), etkileşim (istek gövdeleri), rol testi (admin'de silme bölümü yok), 3 viewport, axe=0.
Doğrulama: (ortak komutlar) + ilgili spec'ler --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w1-cloud-privacy-complete: ...
Bitince: YEREL NOT: capabilities/domains/account.ts:23-28 ve customers.ts:24 ui eşlemesi; B-21 (401→400); hukuki metin ihtiyacı (Protokol 12).
```

### 3.4 W1 — Yerel backend brifleri (backend-builder)

Tüm backend brifleri için ortak kurallar:
- CLAUDE.md kural 1–6; izinli 7 DB; yeni tenant oluşturulmaz.
- DB'yi etkileyen her adımdan önce doğrulanmış yedek (kural 3).
- Değiştirilen modülde önce karakterizasyon testi (`characterization-testing` skill).
- Yeni uç = ADR-0019 yetenek kaydına giriş (`capabilities/domains/*.ts`: `effect`, `minTier`, `ui`, `mcp`, `agent` kararları) + `operation-policy` testi yeşil.
- Tenant bağlamı YALNIZ oturumdan gelir. Gövdedeki `clientId/tid/...` atılır (TS §0).
- Yanıtlar beyaz liste DTO'dur. `responseSanitizer`'ı tetiklemez.
- Denetim kaydı PII'sizdir.
- Sözleşme `docs/API_TENANT_SURFACE.md`'ye yeni bölüm olarak yazılır. Bulut brifi o bölüme atıf verir.

**B-00 — Doğrulama turu (S, W1 başı).**
Amaç, bu belgedeki bulut kopyasından doğrulanamayan üç noktayı yerelde kanıtlamak:
- (a) `backend/entegrasyonik.ts`'te `StockPublishTrigger`, `OversellCompensationJob`, `Internal/ExternalReconciliationJob`, `AllocationSweep`, `TrialExpiryJob` başlatılıyor mu?
- (b) `VariantService.batchProcessUpdate` gömülü `Product.variants`'a yazıyor ve `Variants` koleksiyonunu hiç güncellemiyor mu (`variant-service.ts:170-189`)?
- (c) `IntegrationService.batchCreator`'ın kabul ettiği `mode` kümesi tek ürün düğmelerinin mode'larını kapsıyor mu (C1.0 girdisi)?

Çıktı: kısa not + gerekiyorsa BACKLOG maddesi. Kod değişikliği yok.

**B-01 — Trendyol V2 geçişi + menşe (`origin`) (L, P0, takvim: 15.10 / 23.10.2026).**
- Kapsam: TYV2 §6 "15 Ekim öncesi YAPILMASI ŞART" 1–8 + §7 kod notları. Özetle:
  - sipariş `/v2/orders` + pencere/sayfa sınırları + stream,
  - ürün `v2/products`,
  - onaylı/onaysız güncelleme ayrımı,
  - V2 filtreleme (`variants[]` düzleştirme, `nextPageToken`),
  - kategori özellik V2,
  - batch sonuç işleme (item bazlı; stok/fiyatta batch status yok — R7),
  - `delivery-info-bulk-update`,
  - oran sınırlayıcı servis grubu bazlı,
  - OrderTransformer alan adları (R9),
  - yeni statüler `Awaiting/Verified` (R10),
  - `approveClaim` gövdesi (R11),
  - fatura linki gövdesi (R13).
- **Menşe:** `Variants.origin` (ISO-3166 alfa-2, `^[A-Z]{2}$`) alanı + `ProductService.updateProduct/saveProduct` kabulü + `ProductTransformer.toPlatformBatch` gönderimi + filtre yanıtından okuma.

  Sözleşme taslağı:

  ```json
  // İstek (mevcut uç, yeni alan): ProductService/updateProduct
  { "product": { "_id": "…", "variants": [ { "_id": "…", "origin": "TR" } ] } }
  // Doğrulama: origin yoksa kabul (geçiş), varsa ^[A-Z]{2}$ değilse 400 "Menşe 2 harfli ülke kodu olmalı (ör. TR)."
  ```

  Ek okuma ucu (FE seçici için): `ProductService/getOriginCodes` → `{ "codes": [ { "code": "TR", "label": "Türkiye" } ] }`, member, statik liste (Trendyol "Menşei Değerleri Listesi"; TYV2 §3.2).
- **Kademe:** mevcut. **Tenant:** değişmez.
- **Test:** transformer birim testleri V2 şemasıyla; mock sunucu (`mockserver/…/trendyol`) yeni yollar ve şema; 429 ve "aynı gövde 15 dk" senaryoları; karakterizasyon önce.
- **Protokol 12:**
  - DB `Integrations.urls` Trendyol kaydının güncellenmesi (yerel + Atlas; yedek + insan onayı),
  - stage hesabı + IP whitelist (TYV2 §5),
  - canlı deploy.
- **FE tüketicisi:** C2.6.

**B-02 — `IntegrationService/testConnection` (S-M).**

```json
// İstek (admin)
{ "integrationCode": "trendyol" }
// Yanıt 200
{ "integrationCode": "trendyol", "ok": false, "code": "AUTH", "checkedAt": "2026-10-02T09:00:00.000Z",
  "operation": "GET /suppliers/***/addresses", "httpStatus": 401 }
```

- Adaptörün en ucuz salt-okunur çağrısını kullanır (`IPlatform.init()`/ping; ADR-0018 probe tanımı varsa onu).
- Sonuç kodu `IntegrationError.code` kümesindendir. Ham mesaj yok; `operation` TS §3 kurallarıyla maskelenir.
- Rate limit: tenant × kanal 5/dk (429 + `Retry-After`).
- Denetim: `integration.test_connection` (`meta.code`).
- `IntegrationCallMetrics`'e normal çağrı olarak düşer; `getIntegrationHealth` kendiliğinden güncellenir.
- Test: mock modda her kod için; egress guard altında gerçek ağa çıkmadığı testi; 2 tenant izolasyonu.
- Canlıda gerçek pazaryeri çağrısı tenant'ın kendi kimliğiyle yapılır; canlı doğrulama Protokol 12 (test hesabı).

**B-03 — Mutabakat sonuçlarının kalıcılaşması (M; GAP N8).**
- Tenant ClientDB yeni koleksiyon `ReconciliationRuns`:

  ```
  { kind:'internal'|'external', startedAt, finishedAt, status:'ok'|'partial'|'error',
    checkedVariants, mismatches, repaired, markedDirty, errorCode? }
  ```

  TTL 90 gün (öneri). Kişisel veri yok.
- İşler (`Internal/ExternalReconciliationJob`) sonuç yazar. Davranış değişmez; önce karakterizasyon.
- `StockService/getStockOverview.reconciliation` → `{ tracked:true, lastRunAt, lastInternal:{…}, lastExternal:{…} }`.
- Yeni `StockService/getReconciliationRuns { limit≤50 }` → `{ runs:[…] }` (member).
- PAT Konu 7 üç göstergesi (clearing/timeliness/completeness) için alanlar:
  - açık OVERSOLD sayısı,
  - en eski `stockDirty` yaşı (dk),
  - UNMAPPED oranı.
- Test: iş koşusu → belge; tenant izolasyonu; `tracked` geçişi.
- **FE tüketicisi:** C1.1'in "Son mutabakat" satırı. Alan dolunca küçük FE eki (C3.x'e katılır).

**B-04 — Profilde `tier` + menü kademe süzmesi (S; GAP N18, F-15).**
- Profil DTO'suna (`toProfileDto`) `tier: 'member'|'admin'|'owner'` eklenir (mevcut `resolveTier` ile aynı kaynak). `isGlobalAdmin` zaten var.
- `MenuService.get` platformAdmin öğelerini platformAdmin olmayanlara döndürmez. Tenant öğeleri `minTier`'a göre süzülür (kaynak: REG'deki ilgili ekranın yeteneklerinin en düşük `minTier`'ı — ADR-0019 §6 "minRole kayıttan türetilir").
- Yanıt örneği:

  ```json
  { "user": { "…": "…", "tier": "admin", "isGlobalAdmin": false } }
  ```

- Test: 3 kademe × menü anlık görüntüsü; eski FE'nin bozulmadığı (alan ekleme).
- **FE tüketicisi:** C2.3.

### 3.5 W2 — Bulut brifleri

#### C2.1 — Kurulum rehberi (onboarding) (şerit F; C1.1 ve C1.2 birleştikten sonra)

```
Görev: frontend/ içinde gerçek durumdan türetilen kurulum rehberi (F-03, GAP N12). Backend GEREKMEZ.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/adr/0015-*.md 3.9 madde 3 (EkWizardTemplate: ilerleme yalnız adım indeksi, kullanıcı+tenant kapsamlı sessionStorage, form verisi/PII YOK) ve 6.1 "Sihirbaz" satırı; docs/research/COMPETITOR_SOPYO.md §3 madde 3 (ölçülmeden süre sözü verme); composables/useOnboarding.ts; frontend/docs/PRODUCT_VALUE_PLAN.md F-03.
Dal: cloud/w2-onboarding. Yalnızca frontend/.
DS-v2 çakışması: SetupGuideView HEMEN yapılabilir. Pano kartı (1. madde) DS-v2 Aşama 2 adım 4 (pano) ile çakışır: adım 4 açıksa kartı o oturuma devret.
Adım sinyalleri (hepsi MEVCUT uçlar; uydurma "tamamlandı" yok):
 1 Pazaryeri bağla → IntegrationService/getClientIntegrations (en az bir marketplace kaydı) + (admin ise) getIntegrationHealth health≠not_configured.
 2 Kategori/marka eşle → AttributeMappingService/get veya CategorySyncComponent'in kullandığı uçtan "en az bir eşleme var" (uç ve alanı KOD OKUYARAK doğrula; doğrulanamazsa bu adım "işaretlenebilir" olur ve raporlanır).
 3 Ürünleri içe aktar/oluştur → ProductService/getProductStatistics (toplam > 0).
 4 Stok politikasını gözden geçir → IntegrationService/getStockPolicy (primaryChannel ≠ null VEYA kullanıcı "varsayılanla devam et"i seçti — bu seçim yalnız sessionStorage).
 5 Planını seç → BillingService/getMySubscription (status ∈ active|trialing ve plan seçili).
Yapılacaklar:
1. components/dashboard/SetupGuideCardComponent.vue: "Kurulum rehberi 2/5" + sıradaki adım + "Devam et"; tamamlanınca kart "Kurulum tamamlandı" olup kapatılabilir (kapatma localStorage, kullanıcı+tenant anahtarlı).
2. SetupGuideView (EkWizardTemplate): her adım kısa açıklama + ilgili ekranı openTab ile açan birincil düğme + "Daha sonra". Adım durumu her açılışta uçlardan yeniden hesaplanır.
3. useOnboarding 'homepage' turu: rehber kartından isteğe bağlı "Ekranı tanı" ile başlat (otomatik overlay YOK — PAT Konu 8 kararı).
4. menu.ts'teki user/EducationView → SubscriptionView yanlış bağlantısı: yalnız FE Map kaydını rehbere yönlendir (menü DB kaydı yerel).
Test: setup-guide.spec.ts (smoke; 0/5, 3/5, 5/5 sentetik durumlar; uçlardan biri hata verirse o adım "denetlenemedi" gösterir, diğerleri çalışır; etkileşim: Devam et → doğru sekme; 3 viewport; axe=0); dashboard.spec.ts yeşil.
Doğrulama: (ortak komutlar) + npx playwright test setup-guide.spec.ts dashboard.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: faz3-w2-cloud-onboarding: ...
Bitince: YEREL NOT: menus'te EducationView kaydı; cihazlar arası "kapattım" tercihi istenirse B-04'e alan.
```

#### C2.2 — Kabukta abonelik durum bandı (şerit D)

```
Görev: frontend/ içinde deneme bitiyor / ödeme gecikti / askıda / iptal durumlarını tüm ekranlarda gösteren kalıcı bant (F-16 FE kısmı). Backend HAZIR: BillingService/getMySubscription (member; status + access + reason — SubscriptionView.vue zaten kullanıyor).
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/adr/0008-odeme-saglayicisi-ve-abonelik-modeli.md §3 durum tablosu + "Risk notu" (askıda stok senkronu durur), views/secure/user/SubscriptionView.vue (durum → metin eşlemesi; AYNI eşlemeyi yeniden kullan, kopyalama), docs/adr/0015-*.md 3.3 (ton), 5.7 (aria-live).
Dal: cloud/w2-subscription-banner. Yalnızca frontend/.
DS-v2 çakışması: SecureLayout DS-v2 Aşama 2 adım 1'in dosyasıdır. Adım 1 birleştikten sonra başla (bant EkAppHeader altına yerleşir).
Yapılacaklar:
1. Durum → metin eşlemesini SubscriptionView'dan paylaşılan saf TS'e çıkar (davranış aynı; subscription.spec.ts yeşil).
2. SecureLayout'a bant: trialing (son 3 gün, trialEndsAt varsa) info; past_due warning; suspended danger ("Stok senkronu durdu — kanallarda aşırı satış riski. Ödemeyi tamamlayın."); canceled info (dönem sonu tarihi). active/legacy/no_subscription → bant yok. Bant kapatılamaz (kritik), yalnız trialing oturum içinde küçültülebilir. "Aboneliği yönet" → SubscriptionView.
3. Çağrı: oturum açılışında + 15 dk'da bir; hata sessiz (bant gösterilmez, konsola değil logger'a).
Test: subscription-banner.spec.ts (her durum; hata → bant yok ve ekran çalışır; 3 viewport; axe=0).
Doğrulama: (ortak komutlar) + npx playwright test subscription-banner.spec.ts subscription.spec.ts --project=chromium-desktop --update-snapshots=missing.
Commit: faz3-w2-cloud-subscription-banner: ...
Bitince: YEREL NOT: ENTITLEMENT_GUARD_ENABLED kapalıyken "salt okunur" metni gerçeği yansıtmayabilir — hangi metnin gösterildiğini raporla.
```

#### C2.3 — Kademe-farkında arayüz + ortak 403/404 (ÖN KOŞUL: B-04 birleşmiş)

```
Görev: frontend/ içinde kullanıcının kademesine göre düğme ve ekranların NEDENLİ devre dışı kalması (F-15, GAP N18). ÖN KOŞUL: B-04 (profilde tier) yerelde birleşmiş ve bulut main'e senkronlanmış olmalı; değilse başlama.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md (B-04 bölümü), docs/adr/0019-*.md §6 (minRole kayıttan türetilir), docs/adr/0015-*.md Karar 2.4 (menuSource/minRole), composables/user.ts, navigation/screens.ts.
Dal: cloud/w2-tier-aware-ui. Yalnızca frontend/.
DS-v2 çakışması: 4. madde (403/404) yeni bileşendir. Menü gizleme EkSidebarNav (Aşama 2 adım 1) ile birlikte yapılmalı.
Yapılacaklar:
1. composables/user.ts: getTier() + can(minTier) (member<admin<owner); platformAdmin ayrı.
2. screens.ts ScreenDefinition'a minRole alanı (tip + saf fonksiyon); YALNIZ yeni ekranlara (C1.x) ve kademe gerektirenlere değer ver (AuditLogView/IntegrationHealthView=admin, PrivacyDataView silme bölümü=owner).
3. Ortak <EkTierGate> ya da v-tier yönergesi YERİNE (DS'e dokunma) composables/useTierGate.ts: yetersiz kademede düğme disabled + tooltip "Bu işlem <kademe> yetkisi ister". Gizleme yalnız menü öğelerinde.
4. Ortak 403 ve 404 durum bileşeni (components/common/ altında; mevcut components/NoAuthorizationComponent.vue yerine/üzerine; EkEmptyState tabanlı): 403 → "Bu ekran için yetkiniz yok" + ana sayfa; bilinmeyen slug → 404 (ADR-0012 bilinmeyen slug davranışıyla uyumlu).
Test: tier.spec.ts (3 kademe × 3 ekran olumlu/olumsuz rol testi; 3 viewport; axe=0).
Commit: faz3-w2-cloud-tier-aware-ui: ...
```

#### C2.4 — Kayıtlı görünümler (sipariş/iade/mesaj) (şerit B, C1.1'den sonra)

```
Görev: frontend/ içinde kişisel kayıtlı filtre görünümleri (F-19; PAT Konu 8 Linear, §c #37). Backend GEREKMEZ.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/adr/0012-gezinme-modeli-sekmeli-calisma-alani.md (Karar 2 URL parametre politikası: PII/serbest metin YASAK), navigation/screens.ts (pickUrlParams/parseUrlParams).
Dal: cloud/w2-saved-views. Yalnızca frontend/.
DS-v2 çakışması: "Görünümler" menüsü EkFilterPanel/EkActiveFilters'e (Aşama 2 adım 2) yerleşir. Adım 2 birleşmeden BAŞLAMA.
Yapılacaklar: composables/useSavedViews.ts — görünüm = { ad, screenKey, params } ve params YALNIZ pickUrlParams çıktısı (globalSearch gibi serbest metin ASLA); saklama localStorage anahtarı ek.views.v1.<userId>.<tenantId> (try/catch; yoksa özellik gizlenir). OrderListView/ClaimListView/MessageListView EkFilterBar'ına "Görünümler" menüsü (kaydet, uygula, sil; ≤20). Paylaşım YOK.
Test: saved-views.spec.ts (kaydet→yenile→uygula URL'yi doğru kurar; PII alanı saklanmaz testi; 3 viewport; axe=0).
Commit: faz3-w2-cloud-saved-views: ...
```

#### C2.5 — Soru/mesaj: bekleme süresi + karakter sınırı (şerit G)

```
Görev: frontend/ içinde yanıt kalitesi ve hızına küçük katkı (F-13 BE'siz kısmı; özellik "hipotez" — rakip kanıtı yok, BENCH C4/Y-31). Backend GEREKMEZ.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), backend/src/api/services/message-service.ts:18-140 (SALT OKU: getMessages yanıt alanları — tarih alanının GERÇEK adı), docs/research/2026-09-28-trendyol-v2-migration-spec.md §1 qnaAnswerUrl (Trendyol cevap 10–2000 karakter).
Dal: cloud/w2-message-sla. Yalnızca frontend/.
DS-v2 çakışması: MessageListView (Aşama 2 adım 2) açıksa başlama.
Yapılacaklar: yanıtlanmamış mesajda "Bekliyor: 3 sa" çipi (formatRelative; eşik tonları: <24 sa neutral, 24–48 warning, >48 danger — eşikler "öneri", i18n'de); yanıt kutusunda kanal kuralı: Trendyol için 10–2000 karakter sayacı + gönderim öncesi doğrulama (diğer kanallar için sınır bilinmiyorsa sayaç yalnız bilgi). "Bekleyenler önce" sıralaması yalnız istemci tarafı sayfa içi (backend sıralaması yoksa yanıltıcı olmasın diye etiket "bu sayfada").
Test: messages.spec.ts'e ekleme (çip tonları; 9 karakterde gönder devre dışı; 3 viewport; axe=0).
Commit: faz3-w2-cloud-message-sla: ...
```

#### C2.6 — Ürün formunda menşe (origin) alanı (şerit A; ÖN KOŞUL: B-01 menşe kısmı birleşmiş)

```
Görev: frontend/ içinde varyant formuna menşe (2 harfli ülke kodu) seçici; 23.10.2026 Trendyol zorunluluğu (TYV2 §3.2, R6). ÖN KOŞUL: B-01'in Variants.origin + ProductService/getOriginCodes kısmı main'de.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), docs/API_TENANT_SURFACE.md (B-01 menşe bölümü), .claude/skills/characterization-testing/SKILL.md (ProductUpdateView/ProductVariantsComponent karakterizasyonsuz → ÖNCE spec).
Dal: cloud/w2-origin-field. Yalnızca frontend/.
DS-v2 çakışması: ürün formu EkFormGrid göçü (Aşama 2 adım 3) ile aynı dosyalar; önce hangisinin açık olduğunu kontrol et.
Yapılacaklar: ÖNCE ürün güncelleme akışını sabitleyen spec (değişmemiş kodda yeşil); sonra varyant satırına "Menşe" v-autocomplete (getOriginCodes; varsayılan boş — UYDURMA "TR" varsayılanı YOK); toplu varyant menüsüne "Menşe ata" (yalnız B-19 teslim ettiyse; yoksa tek tek). Trendyol bağlı ve menşesi boş varyant sayısı ürün listesinde uyarı rozeti ("Menşe eksik — 23 Ekim'den sonra Trendyol'a gönderilemez").
Commit: faz3-w2-cloud-origin-field: ...
```

### 3.6 W2 — Yerel backend brifleri

**B-05 — Ekip daveti (M; GAP N11, ACC açık karar 4).**

```json
// UserService/inviteUser (admin)  İstek:
{ "email": "ekip@ornek.test", "roleCode": "member" }
// Yanıt:
{ "invitationId": "…", "expiresAt": "2026-10-09T…Z" }
// Hata: 400 geçersiz e-posta/rol · 403 hedef rol çağıranın kademesinden yüksek (admin owner davet edemez)
//       409 kullanıcı zaten ekipte · 402 plan kullanıcı limiti (EntitlementService.checkQuota — guard kapalıysa uyarı alanı döner)
// UserService/listInvitations (admin) → { invitations:[{ id, email, roleCode, status:'pending'|'accepted'|'revoked'|'expired', expiresAt }] }
// UserService/revokeInvitation (admin) { invitationId } → { success:true }
// AccountService/acceptInvitation (AÇIK, özel rota + rate limit; ACC deseni) { token, firstName, lastName, password } → { success:true } (oturum AÇMAZ)
```

- `AccountTokens` purpose `invite` (ACC veri modeli; hash'li, 7 gün, tek kullanım).
- E-posta `MailService`. Ad/soyad şablona girmez.
- Denetim: `user.invite.*`.
- `createUser`'ın parola alan yolu admin için kademeli olarak kapatılır. Karar: insan (ürün).
- Test: numaralandırma yok (yanıt biçimi), rol yükseltme reddi, 2 tenant izolasyonu, token tekrar kullanımı.
- Protokol 12: canlı SMTP.

**B-06 — Hata kutusu (M; F-07, PAT Konu 1).**

```json
// IntegrationService/getFailureInbox (member)  İstek:
{ "page": 1, "limit": 25, "source": "export|order", "integrationCode": "trendyol", "retryable": true, "status": "open|resolved" }
// Yanıt:
{ "items": [ { "id": "…", "source": "export", "integrationCode": "trendyol", "code": "VALIDATION", "retryable": false,
  "count": 3, "firstSeenAt": "…", "lastSeenAt": "…", "nextRetryAt": null,
  "subject": { "type": "variant", "ref": "<barcode|orderNumber>" }, "hint": "Zorunlu nitelik eksik: Renk" } ],
  "page": 1, "totalNumberOfRecords": 12 }
// IntegrationService/retryFailure (admin) { id } → { accepted:true } | 409 "Bu işlem güvenli biçimde yeniden denenemez"
// IntegrationService/resolveFailure (admin) { id, note? } → { success:true }
```

- Kaynaklar: export durum makinesinin başarısız kayıtları + sipariş çekim hataları (BullMQ DLQ). Kopya koleksiyon yok; okuma birleştirmedir. Saklama önerisi 30 gün (insan).
- `retryable` doğrudan `IntegrationError.retryable`'dan.
- `retryFailure` yalnız idempotent-güvenli türlerde (PAT §c #2).
- `hint` yalnız manifesto/doğrulama kaynaklı sabit metindir; ham pazaryeri mesajı yok.
- Test: 2 tenant, yan etkili türde retry reddi, sayfalama.

**B-07 — Bildirim tercihleri + düşük stok eşiği + günlük özet (M; F-06 v2).**

```json
// SettingService/getNotificationPreferences (member, kullanıcı kapsamlı) →
{ "categories": { "STOCK_ALERT": { "inApp": true, "email": true, "locked": true },
                  "ORDER": { "inApp": true, "email": false, "locked": false }, "...": {} },
  "digest": { "daily": false } }
// SettingService/saveNotificationPreferences { categories, digest } → aynı şekil;
//   locked kategoride kapatma → 400 "Bu bildirim kapatılamaz"
// IntegrationService/saveTenantStockPolicy'ye ek alan (admin): { "lowStockThreshold": 3 }  (0..100000, null = kapalı)
```

- Zorunlu (kilitli) kategoriler: kimlik bilgisi hatası, OVERSOLD/UNMAPPED, faturalama, güvenlik (PAT Konu 5).
- Düşük stok: `available ≤ threshold` geçişinde **bir kez** `STOCK_ALERT` (alt tür `LOW_STOCK`); eşik üstüne çıkınca yeniden silahlanır.
- Günlük özet: yalnız okunmamış kritikler + "yayın bekleyen / aşırı satış" sayıları (Yengeç günlük rapor örneği COMP §1.3; biz yalnız okunmamışsa gönderiyoruz — Linear, PAT Konu 5).
- Protokol 12: canlı SMTP.

**B-08 — Abonelik yönetimi (mock sağlayıcıyla) (L; GAP N3, ADR-0008).**

```json
// BillingService/cancelSubscription (owner) { "atPeriodEnd": true } → { "status": "active", "cancelAtPeriodEnd": true, "currentPeriodEnd": "…" }
// BillingService/resumeSubscription (owner) {} → { "cancelAtPeriodEnd": false }
// BillingService/previewPlanChange (owner) { "planCode": "growth" } → { "effectiveAt": "…", "amountDueMinor": 0, "note": "…" }
// BillingService/changePlan (owner) { "planCode": "growth", "previewToken": "…" } → { "planCode": "growth", "status": "active" }
// BillingService/getBillingHistory (owner) { "page": 1 } → { "items": [ { "at": "…", "type": "payment_succeeded", "amountMinor": 249000, "currency": "TRY" } ] }
// BillingService/getMyUsage (member) → { "channels": { "used": 2, "limit": 2 }, "skus": { "used": 812, "limit": 5000 }, "users": { "used": 2, "limit": 3 } }
```

- `PaymentProvider.cancel/changePlan` portu, yalnız `MockPaymentProvider`.
- `getMyUsage` anlık sayım (ADR-0008 "Kota uygulaması" 1).
- Test: durum makinesi geçişleri, webhook idempotency, kota sayımı.
- Protokol 12: fiyat/limit/proration politikası, iyzico, `ENTITLEMENT_GUARD_ENABLED`'ın canlıda açılması + legacy göç.

### 3.7 W3 — Verimlilik (yerel önce, sonra bulut)

#### Yerel

**B-09 — Toplu fiyat/stok değişikliği işi (önizleme + uygula + geri al) + Excel içe aktarma (L; F-08).**

```json
// CatalogBulkService/previewBulkChange (admin)  İstek:
{ "scope": { "productIds": ["…"], "categoryId": null, "brandId": null, "hashtag": null },
  "change": { "field": "salePrice|marketPrice|stock|platformPrice", "integrationCode": "trendyol",
              "op": "increase_percent|decrease_percent|increase_amount|decrease_amount|set",
              "value": 10, "rounding": "none|int|x.90|x.99", "floor": 50, "ceil": null } }
// Yanıt:
{ "previewId": "…", "expiresAt": "…", "affected": 128, "invalid": 2,
  "sample": [ { "variantId": "…", "sku": "…", "before": 199.90, "after": 219.90 } ],
  "warnings": [ { "code": "BELOW_FLOOR", "count": 2 } ] }
// CatalogBulkService/applyBulkChange (admin) { previewId } → { jobId }
// CatalogBulkService/getBulkJob (member) { jobId } → { status:'queued|running|done|partial|failed', progress:{done,total},
//   errors:[{ row, sku, code }], undoUntil }
// CatalogBulkService/undoBulkJob (admin) { jobId } → { jobId: "<ters iş>" }  (7 gün; yalnız fiyat/stok/durum; before-image)
// CatalogBulkService/uploadImport (admin, multipart .xlsx/.csv ≤ 5 MB) → { previewId, … }  (aynı önizleme sözleşmesi; boş hücre = değiştirme)
```

- **Stok değişimi `StockAllocator` üzerinden referanslı delta** (`ref: bulk:<jobId>`); `reserved`'a dokunulmaz (ADR-0004 Karar 1). Kanala yayın mevcut delta hattından.
- Tenant başına tek aktif toplu iş. Trendyol barkod başına 30/dk fiyat limiti yayın tarafında (TYV2 §3.5).
- Parse bağımlılığı: `xlsx` güvenlik durumu (BENCH Y-07 "BL C18") → yerel karar.
- Test: önizleme = uygulama sonucu, geri al = ters delta, eşzamanlı sipariş sırasında stok toplu işinin rezervasyonu ezmediği (ADR-0004 concurrency deseni).

**B-10 — Kanal fiyat kuralı (M; F-09).**

```json
// PriceRuleService/getRules (member) → { "rules": [ { "integrationCode": "trendyol", "enabled": true, "base": "salePrice",
//   "adjust": { "type": "percent", "value": 12 }, "rounding": "x.90", "min": null, "max": null, "updatedAt": "…" } ] }
// PriceRuleService/saveRule (admin) { integrationCode, enabled, base, adjust, rounding, min, max } → kural
// PriceRuleService/previewRule (member) { integrationCode, limit≤50 } → { "sample": [ { "sku": "…", "base": 100, "publish": 111.90 } ] }
```

- Uygulama: Validator `targetPublishPrice`. Varyantta `isPlatformBasedPrice=true` olan elle fiyat **kuraldan önceliklidir** (açık kural).
- Kural değişince etkilenen varyantlar `priceDirty` ile işaretlenip mevcut hattan delta yayınlanır.
- Denetim: `price.rule.*`. Plan kapısı: insan kararı.

**B-11 — Hazır yanıt şablonları (S; F-13).** `MessageService/getReplyTemplates` (member) / `saveReplyTemplate` (admin) `{ id?, title≤60, body≤2000, channels?:string[] }` / `deleteReplyTemplate`. Tenant ClientDB `ReplyTemplates`; ≤100 şablon; değişken yok (v1; PII sızmasın). *Hipotez etiketi (rakip kanıtı yok).*

**B-12 — İade satırını stoka alma (M; F-14, ADR-0004 Karar 2).** `ClaimService/restockClaimItems` (admin) `{ claimId, lines:[{ lineId, qty, condition:'sellable'|'damaged' }] }` → `{ restocked:[{lineId, qty}], skipped:[{lineId, reason:'already_restocked'|'damaged'}] }`. Anahtar `return:<integrationCode>:<claimId>:<lineId>` ile idempotent (`RESTOCKED`). Yalnız `sellable` satır stoka döner. Ayrıca iade red nedenleri canlı çekim ucu `ClaimService/getClaimRejectionReasons { integrationCode }` (Trendyol 23.09 değişikliği; DEAD §1).

**B-16 — Eşleme sağlığı (S; F-17 deterministik kısım).**

```json
// AttributeMappingService/getMappingHealth (member) { "integrationCode": "trendyol" } →
{ "categories": { "used": 42, "mapped": 38, "unmapped": 4 },
  "requiredAttributesMissing": [ { "categoryId": "…", "categoryName": "…", "attributeName": "Renk", "productCount": 17 } ],
  "lastAutoMatchAt": "…" | null }
```

Yalnız ürünü olan kategoriler. Ham pazaryeri verisi yok.

**B-18 — Sevkiyat listesi (S; F-18).** `ShipmentService/getShipments`: filtre (`printed`, `integrationCode`, tarih, durum) + sıralama gerçekten uygulanır (bugün stub, TS §6). Yanıta `printedAt`.

**B-19 — Eksik toplu ürün işlemleri (M; C1.0 devamı).**
- `ProductService/batchProcessUpdate` (admin) `{ productIds, mode:'SET_CATEGORY'|'SET_BRAND'|'SET_TAGS'|'CHANGE_STATUS', value }` → `{ jobId }` | senkron `{ updated }` (≤500).
- `ProductService/batchProcessDelete` (admin; yıkıcı → ADR-0019 `effect:'destructive'`, onay ve `undo` kararı).
- `CustomerService/deleteCustomer|bulkDeleteCustomers` ve `ClaimService/bulkDeleteClaims`: ürün kararı (KVKK açısından müşteri silme yerine anonimleştirme önerilir → FE düğmesini anonimleştirmeye yönlendir; insan kararı).
- B-00(b) sonucuna göre `VariantService.batchProcessUpdate` onarılır ya da kaldırılır.

**B-21 — `requestDeletion` yanlış parolada 400 (S).** 401, FE'nin genel oturum yakalayıcısını tetikliyor (C1.6 bulgusu). ACC deseniyle `400 { code:'INVALID_PASSWORD' }`.

#### Bulut (her biri ilgili B-xx main'e senkronlandıktan sonra; şablon §3.0 + aşağıdaki özel madde)

| Brif | Dal | Ön koşul | Kapsam (özet) | Şablon |
|---|---|---|---|---|
| **C3.1** Hata kutusu | `cloud/w3-failure-inbox` | B-06 | `FailureInboxView` (`EkListPage` + `EkDetailSheet`); "Otomatik yeniden denenecek / Müdahale gerekli" gruplaması; toplu yeniden dene yalnız `retryable && güvenli` satırlarda; 409'da açıklama | liste+detay |
| **C3.2** Toplu değişiklik sihirbazı | `cloud/w3-bulk-change` | B-09, B-19 | `BulkChangeWizard` (`EkWizardTemplate` 3 adım); önizleme tablosu (before/after, uyarılar); iş izleme + "Geri al (7 gün)"; Excel yükleme aynı önizlemeye düşer; C1.0'da devre dışı bırakılan toplu menüleri etkinleştir | sihirbaz |
| **C3.3** İade kararı + detay | `cloud/w3-claim-restock` | B-12 | İade detayında `getClaimById`; onay akışına satır bazında "Stoka al / Hasarlı" adımı; red nedeni seçicisi canlı listeden | detay |
| **C3.4** Eşleme sağlığı | `cloud/w3-mapping-health` | B-16 | `MappingHealthView` (`EkReadonlyPanelTemplate`); eksik zorunlu nitelik listesi → `CategorySyncComponent`'i ilgili kategoriyle aç; "Otomatik eşle" (`autoMatchAllCategories`, mevcut) | salt-okunur panel |
| **C3.5** Sevkiyat listesi | `cloud/w3-shipments` | B-18 | `ShipmentListView` (`EkListPage`); "Basıldı" filtresi; toplu yazdır (mevcut `BarcodePrintComponent`) + `markAsPrinted`; `PrintoutListView` menü kaydı kaldırma notu (yerel) | liste |
| **C3.6** Hazır yanıtlar | `cloud/w3-reply-templates` | B-11 | Mesaj yanıt kutusunda şablon seçici; `SettingListView` altında şablon yönetimi (`EkSettingsTemplate` bölümü) | ayar |
| **C3.7** Bildirim tercihleri | `cloud/w3-notification-prefs` | B-07 | Hesap altında tercih matrisi (kategori × uygulama içi/e-posta), kilitli satırlar açıklamalı; `StockPolicyView`'e "Düşük stok eşiği" alanı | ayar |
| **C3.8** Ekip daveti | `cloud/w3-team-invite` | B-05, C2.3 | `AuthorizationListView`: "Davet et" (`EkFormDialog`), bekleyen davetler, rol açıklama tablosu; `/accept-invite?token=` kimliksiz sayfa (ACC `/reset-password` deseni: token URL'den silinir, `no-referrer`) | liste + form |
| **C3.9** Abonelik yönetimi | `cloud/w3-subscription-manage` | B-08 | `SubscriptionView`: iptal/devam, plan değişimi önizleme → onay, fatura geçmişi, kullanım çubukları (`getMyUsage`) | ayar |

Her satır için kopyala-yapıştır metni:

```
Görev: frontend/ içinde <Brif adı> (PRODUCT_VALUE_PLAN <C3.x>). ÖN KOŞUL: <B-xx> yerelde birleşti, sözleşmesi docs/API_TENANT_SURFACE.md'de <bölüm> olarak yazıldı ve bulut main'e senkronlandı — değilse BAŞLAMA, raporla.
İlk iş: bash scripts/cloud-setup.sh; CLAUDE.md (kural 7). Önce oku: frontend/docs/PRODUCT_VALUE_PLAN.md §0.3 (DS-v2 tasarım kuralı + Aşama 2 çakışma kuralı) ve frontend/DESIGN_SYSTEM.md (main'de yoksa: git show origin/cloud/ds-v2-a1:frontend/DESIGN_SYSTEM.md), frontend/docs/PRODUCT_VALUE_PLAN.md §3.0 (ortak kurallar) + ilgili F-xx + <B-xx> sözleşme bölümü (AYNEN kullan), docs/adr/0015-*.md (Karar 3, 5.6, 6), .claude/skills/premium-ui-standards/SKILL.md.
Dal: <dal>. Yalnızca frontend/.
Yapılacaklar: <tablodaki kapsam>; composables/use<Alan>Api.ts; screens.ts yalnız ekleme; i18n tr.json.
Test (Karar 5.6): <spec>.spec.ts — smoke, boş, hata, ≥1 etkileşim (istek gövdesi), rol testi, 3 viewport, axe AA=0.
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet && npm run test:contract-paths; npx playwright test <spec> --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport bir kez. *-linux.png commit'leme.
Commit: faz3-w3-cloud-<kısa-ad>: ... (küçük adımlar, yol yol git add).
Bitince: değişenler, test sonuçları, commit listesi, YEREL NOT (capabilities ui eşlemesi, menus kaydı, sözleşme belirsizlikleri).
```

### 3.8 W4 — Kârlılık

**B-13 — Maliyet alanı + kâr ve satış raporları (L; F-10).**
- `Variants.costPrice` (TRY, ≥0; opsiyonel) + `ProductService.updateProduct` kabulü.
- `ReportService/getProfitReport` (member):

  ```json
  // İstek
  { "from": "…", "to": "…", "groupBy": "channel|product|order", "integrationCode": null }
  // Yanıt
  { "rows": [ { "key": "trendyol", "revenue": 12450.00, "commission": 1494.00, "cargo": 620.00,
                "otherDeductions": 0, "cost": 7300.00, "net": 3036.00,
                "coverage": { "costMissingLines": 3, "commissionSource": "order_line|settlement|missing" } } ],
    "currency": "TRY" }
  ```

- **Maliyet eksikse `net: null`** (uydurma yok). Kaynak alanları açık.
- Ayrıca: `ReportService/getSalesReport`, `getStockMovementReport`. İkincisi PAT B7 `StockMovements` gelirse.
- Excel dışa aktarma sonraki adım.
- Ön koşul: B-01 (Trendyol satır alan adları).
- Mali doğruluk ve vergi yorumu: Protokol 12 (mali müşavir).

**B-14 — Hakediş mutabakatı (L; F-11).**

```json
// FinancialService/getSettlementReconciliation (member) { "integrationCode": "trendyol", "from": "…", "to": "…" } →
{ "supported": true, "matched": 214,
  "mismatches": [ { "orderNumber": "…", "expected": 349.90, "paid": 329.90, "diff": -20.00, "reason": "COMMISSION_DIFF|CARGO_DIFF|PENALTY|MISSING_PAYMENT" } ],
  "pendingPayouts": [ { "orderNumber": "…", "expectedAt": "…" } ] }
```

- HB/N11 için `supported:false` + gerekçe.
- Trendyol settlement penceresi ≤15 gün (TYV2 §1 finans satırları). Sorgu dilimlenir.

**Bulut:**
- **C4.1** Fiyat kuralları (`cloud/w4-price-rules`, ön koşul B-10): `PriceRulesView` (`EkSettingsTemplate`) + ürün detayında "yayınlanacak fiyat".
- **C4.2** Raporlar (`cloud/w4-reports`, ön koşul B-13): `ReportsView` (`EkPageTabs`); "hesaplanamadı" durumları.
- **C4.3** Mutabakat sekmesi (`cloud/w4-settlement`, ön koşul B-14): C1.4'ün `FinancialListView` sekmelerine ek.

Metin: §3.7 kopyala-yapıştır şablonu.

### 3.9 W5 — Otomasyon ve ajan (eşikli)

**B-15 — Otomasyon kuralları v1 (L; F-12, PAT Konu 4).**
- Uçlar:
  - `AutomationService/listRules`,
  - `saveRule` `{ name, trigger:'order.created'|'order.status_changed'|'stock.below_threshold', conditions:[{ field:'integrationCode'|'totalAmount'|'itemCount'|'tag', op:'eq'|'in'|'gte'|'lte', value }], actions:[{ type:'tag'|'notify'|'auto_approve' }], enabled }`,
  - `dryRun { rule, sampleSize≤50 }` → `{ matched:[{ orderNumber, wouldDo:[…] }] }`,
  - `getRuleRuns { ruleId, page }`.
- Korumalar:
  - olay `source:'rule'` başka kuralı tetiklemez,
  - kural başı saatlik tavan → otomatik duraklat + bildirim,
  - yıkıcı eylem yok,
  - **stok politikası kural dışı**.
- Plan kapısı `automation` (fiyat Protokol 12).

**B-17 — `ActionProposals` onay kuyruğu (M; ADR-0018 Karar 3c, eşikli).**
- Eşik: ADR-0018 Karar 4 C satırı (MCP yazma açılması ya da görev eşiği).
- İlk kullanım: B-16 eşleme önerileri (deterministik).
- LLM yok (`NullLlm`). LLM ve tenant verisi için Protokol 12 + `aiProcessingConsent`.

**Bulut:**
- **C5.1** `AutomationRulesView` (liste + sihirbaz + kuru çalıştırma önizlemesi + çalışma günlüğü).
- **C5.2** Öneriler ekranı (`EkListPage` + `EkDetailSheet`: önizleme/diff, onayla/reddet; yıkıcı sınıfta owner).

### 3.10 W6+ — Dış karar bekleyenler

Aşağıdakiler §4'teki insan kararından sonra ayrı ADR/brif ile açılır. Bu belge yalnız FE'nin dürüst "Yakında" gösterimini (C1.2) şimdiden sağlar.
- Kargo adaptörü + etiket PDF (F-21; ADR-0018 K6.1),
- e-fatura sağlayıcı (F-21; K6.2; 1 Ocak 2027 e-Arşiv genişlemesi DEAD §9),
- genel API/giden webhook (F-20),
- ERP yazma (BENCH Y-17),
- yeni pazaryerleri (BENCH Y-13),
- MCP (ADR-0019 C/D).

---

## 4. Protokol 12 — insan kararı gerektirenler (ayrı liste)

| # | Karar | Tür | Bağlı iş | Varsayılan (karar gelene dek) |
|---|---|---|---|---|
| P12-1 | Trendyol `Integrations.urls` kaydının DB'de (yerel + Atlas) V2'ye güncellenmesi; yedek doğrulaması | canlı veri / canlı deploy | B-01 | Kod fallback'leri V2; DB değeri yazılmaz |
| P12-2 | Trendyol (ve diğer pazaryeri) stage/test hesapları, IP whitelist, platform düzeyi probe hesapları | 3. parti hesap | B-01, B-02, ADR-0018 B+ | Mock + replay |
| P12-3 | B-01, B-02 ve her dalganın canlıya alınması | canlı deploy | tümü | Yalnız staging |
| P12-4 | Plan fiyatları, limitler, yıllık plan, KDV, proration politikası; plan özellik kapıları (`automation`, `api_access`, `reports`) | para | B-08, B-10, B-15, F-20 | Seed "ÖNERİ" değerleri; kapı yok |
| P12-5 | iyzico üye işyeri/sandbox hesabı (KYC), canlı anahtarlar, abonelik eklentisi ücreti | para / KYC / 3. parti | B-08 | `MockPaymentProvider` |
| P12-6 | `ENTITLEMENT_GUARD_ENABLED`'ın canlıda açılması + legacy abonelik göçü | canlı deploy / müşteri etkisi | B-08, C2.2 | Kapalı |
| P12-7 | Kargo stratejisi ve ilk firma(lar), anlaşma hesapları | 3. parti / para | F-21 | Port yok; formlar "Yakında" (C1.2) |
| P12-8 | E-fatura entegratörü ve iş modeli (BYO / bayilik) | 3. parti / para / hukuk | F-21 | Manuel fatura yolu |
| P12-9 | Canlı SMTP (Zoho) + gönderici alan adı SPF/DKIM/DMARC + `PUBLIC_APP_URL` | 3. parti hesap / canlı | B-05, B-07, ACC | E-posta iddiası verilmez |
| P12-10 | E-posta doğrulamayı zorunlu kılma / kısıtlı mod | ürün + hukuk | ACC açık karar 1 | Yalnız bilgi |
| P12-11 | LLM sağlayıcısı, aylık bütçe tavanı, veri işleme sözleşmesi, yurt dışı aktarım | LLM seçimi / para / hukuk | F-17, B-17, ADR-0018 D | `NullLlm`, deterministik |
| P12-12 | Tenant AI rıza/aydınlatma metni (`aiProcessingConsent`) | hukuki metin | F-17 | `false` |
| P12-13 | KVKK metinleri: hesap silme aydınlatması, veri dışa aktarma, müşteri anonimleştirme, denetim günlüğü 365 gün saklama gerekçesi | hukuki metin | C1.3, C1.6 | Yalnız davranışı anlatan nötr metin + yasal sayfa bağlantısı |
| P12-14 | `AuditLogs` `{tid:1, at:-1}` indeksinin canlıda oluşturulması | canlı DB | C1.3 (ölçek) | 30 gün pencere + `maxTimeMS` |
| P12-15 | Kâr/hakediş hesaplarının mali doğruluğu (komisyon, KDV, tevkifat yorumları) | mali müşavir | B-13, B-14 | "hesaplanamadı" gösterimi |
| P12-16 | Pazaryeri logo/marka kullanım izni | hukuk / 3. parti | C1.2 (`EkPlatformMark`) | Monogram |
| P12-17 | Rakip fiyat takibi (Buybox) verisinin yasal/teknik kaynağı | hukuk | (önerilmedi) | Yapılmaz |
| P12-18 | SMS/push/Slack bildirim kanalları | ücretli 3. parti | F-06 sonrası | Uygulama içi + e-posta |
| P12-19 | Sitedeki deneme politikası ve plan limiti/özellik farkı metninin, uygulanmayan kotalarla uyumu | ticari / site metni | §1.3 | Site oturumu + insan |
| P12-20 | `expired` → kalıcı silme (geri dönüşsüz) ve müşteri silme yerine anonimleştirme politikası | geri dönüşsüz / hukuk | B-19, ADR-0008 §3 | Kalıcı silme yok |

---

## 5. Özet çıktılar

### 5.1 En değerli 10 iş (değer × uygulanabilirlik sırasıyla)

| # | İş | Neden şimdi | Nerede |
|---|---|---|---|
| 1 | **B-01** Trendyol V2 + menşe | 15.10 ve 23.10.2026'da çekirdek akış kırılır (TYV2 R1–R9) | yerel |
| 2 | **C1.0** Kırık ürün/müşteri/iade düğmeleri | "available" vaatte sessiz 403 = güven kaybı | bulut |
| 3 | **C1.1** Aşırı satış / stok sağlığı görünürlüğü | Amiral gemisi farkımız; rakiplerde görülmedi (COMP §2); BE hazır | bulut |
| 4 | **C1.2** Entegrasyon sağlığı + dürüst "Yakında" + kapsam çipleri | Sessiz arıza + yanıltıcı formlar; kapsam beyanı rakiplerde yok (PAT §c #5); BE hazır | bulut |
| 5 | **C2.1** Kurulum rehberi | Kayıt → ilk değer süresi; sitede vaat edilmiş ("adım adım"); BE gerekmez | bulut |
| 6 | **C1.4** Finans sekmeleri → **B-14** hakediş mutabakatı | Rakiplerin ücretli modülü (BENCH T1/T7); ilk katman BE hazır | bulut → yerel |
| 7 | **B-09 + C3.2** Toplu fiyat/stok (önizleme + geri al) + Excel | Pazarda ŞART (BENCH A1/A2); mevcut yol muhtemelen ölü | yerel → bulut |
| 8 | **B-06 + B-02 + C3.1** Hata kutusu + bağlantı testi | Destek yükünün kaynağı; geçici/kalıcı ayrımı (PAT Konu 1–2) | yerel → bulut |
| 9 | **B-10 + C4.1** Kanal fiyat kuralı; ardından **B-13** kâr raporu | "Hangi kanalda kazanıyorum" (BENCH A5/G2/G4) | yerel → bulut |
| 10 | **B-04/B-05 + C2.3/C3.8** Kademe-farkında UI + ekip daveti | Sitedeki "hassas işlemler üst kademeye" vaadinin ekran karşılığı | yerel → bulut |

### 5.2 Bulutta HEMEN başlatılabilecek brifler (backend hazır / gerekmez)

**Hemen, paralel.** Yeni ekran parçaları DS-v2 ile çakışmaz:
- C1.1 (`cloud/w1-stock-health`, yalnız StockHealthView kısmı),
- C1.2 (`cloud/w1-integration-health`, IntegrationHealthView + webhook kısmı),
- C1.3 (`cloud/w1-audit-log`),
- C1.5 (`cloud/w1-notifications`, NotificationCenterView + store kısmı).

**Hemen, hata düzeltmesi:** C1.0 (`cloud/w1-broken-actions`). Görsel göç yapmaz. DS-v2 Aşama 2 adım 2 (listeler) bu dosyalarda açılmadan önce bitirilmesi önerilir.

**DS-v2 adımına bağlı** (§0.3 çakışma kuralı; ilgili adım birleşince ya da onunla aynı oturumda):
- C1.1'in OrderListView/pano parçaları (adım 2/4),
- C1.2'nin "Yakında" form parçaları (adım 3),
- C1.4 (`cloud/w1-finance-tabs`, adım 2),
- C1.5'in üst çubuk rozeti (adım 1),
- C1.6'nın müşteri parçası (adım 2),
- C2.1 pano kartı (adım 4),
- C2.2 (adım 1),
- C2.4 (adım 2),
- C2.5 (adım 2).

Kalanlar hemen yapılabilir:
- C1.6'nın PrivacyDataView parçası,
- C2.1'in SetupGuideView parçası.

**Backend bekleyen:**
- C2.3 (B-04),
- C2.6 (B-01),
- C3.x (B-05/06/07/08/09/11/12/16/18/19),
- C4.x (B-10/13/14),
- C5.x (B-15/17).

> Kullanıcı DS-v2'yi onaylayıp main'e birleştirmeden de W1'in çekirdek değeri teslim edilebilir: dört yeni ekran + kırık düğme düzeltmesi.

### 5.3 Yerel backend iş listesi (backend-builder)

| Sıra | İş | Büyüklük | Açtığı bulut brifi |
|---|---|---|---|
| 1 | B-00 doğrulama turu (zamanlayıcı başlatma, ölü toplu yol, `batchCreator` mode kümesi) | S | C1.0 kesinleşir |
| 2 | **B-01** Trendyol V2 + menşe (P0, 15.10/23.10) | L | C2.6 |
| 3 | B-21 `requestDeletion` 401→400 | S | C1.6 sadeleşir |
| 4 | B-04 profil `tier` + menü süzmesi | S | C2.3 |
| 5 | B-02 `testConnection` | S-M | C1.2 eki |
| 6 | B-03 mutabakat sonuçları | M | C1.1 eki |
| 7 | B-19 eksik toplu ürün işlemleri (+ müşteri/iade silme kararı) | M | C1.0 kapanışı, C3.2 |
| 8 | B-06 hata kutusu | M | C3.1 |
| 9 | B-09 toplu fiyat/stok işi + Excel | L | C3.2 |
| 10 | B-05 ekip daveti | M | C3.8 |
| 11 | B-07 bildirim tercihleri + düşük stok + özet | M | C3.7 |
| 12 | B-12 iade restock + canlı red nedenleri | M | C3.3 |
| 13 | B-16 eşleme sağlığı · B-18 sevkiyat listesi · B-11 yanıt şablonları | S ×3 | C3.4 · C3.5 · C3.6 |
| 14 | B-08 abonelik yönetimi (mock) | L | C3.9 |
| 15 | B-10 kanal fiyat kuralı | M | C4.1 |
| 16 | B-13 maliyet + raporlar · B-14 hakediş mutabakatı | L ×2 | C4.2 · C4.3 |
| 17 | B-15 otomasyon kuralları · B-17 öneri kuyruğu (eşikli) | L · M | C5.1 · C5.2 |
| — | B-20 ERP sipariş okuma ucu **ya da** site metni düzeltmesi (karar) | S | — |

### 5.4 Doğrulanamayanlar / açık sorular (bu belge için)

- `backend/entegrasyonik.ts` yok: stok zamanlayıcılarının açılışı (B-00a).
- `VariantService.batchProcessUpdate` ölü yol mu (B-00b).
- `batchCreator`'ın tek ürün modlarını karşılayıp karşılamadığı (B-00c; C1.0 madde 2 buna göre dallanır).
- Onboarding adım 2 için "eşleme var mı" sinyalinin hangi uçtan okunacağı (C2.1 kodu okuyarak belirler).
- `getFinancialSummary` alanlarının "net" içerip içermediği (C1.4 raporlar).
- Rakip iddiaları: araştırma belgelerindeki A/B/C etiketleriyle; hiçbiri bu oturumda yeniden doğrulanmadı.
- F-13 (hazır yanıt), F-14 (restock UI ayrıntısı), F-16 (self-servis iptal UX'i) ve F-17'nin LLM kalite iddiası **hipotez**tir.
- DS-v2 (`origin/cloud/ds-v2-a1`) kullanıcı onayı bekliyor. Onay ve birleşme tarihi W1–W2'deki mevcut ekran parçalarının sırasını belirler (§0.3). Bu bir tasarım onayıdır, Protokol 12 kalemi değildir.
- `getCatalog` yalnız kodlanmış 6 manifestoyu döner (`integration-service.ts:1505-1520`). "Yakında" türetimi bu listede olmayan sağlayıcı kodlarına dayanır. Form tarafındaki sağlayıcı kodlarının eşleşmesi C1.2'de doğrulanır.

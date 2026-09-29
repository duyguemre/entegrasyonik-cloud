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

### 0.3 Tasarım dili ("DS-v2") notu

Görevde anılan `frontend/DESIGN_SYSTEM.md` dosyası bu tabanda **yok** (`find` boş). Bu belgedeki "DS-v2" ifadesi, bugün bağlayıcı olan tasarım dilinin kendisini ifade eder:
- **ADR-0015 Karar 1** (nötr ağırlık, renk = durum, kenarlıkla derinlik, 150–250 ms hareket),
- **Karar 3** (bileşen kararları, `status-map.ts`, KPI kartı, boş durum 5 varyantı),
- **Karar 6** ("tek iş = tek desen" kataloğu + desen mandalı),
- **Karar 5.6** (yeni ekran için Protokol 13: smoke + boş + hata + ≥1 etkileşim/istek gövdesi + 3 viewport + axe AA = 0).

Bileşenler `frontend/src/components/ds/` altındadır: `EkPageHeader`, `EkFilterBar`, `EkDataTable`, `EkPagination`, `EkDetailSheet`, `EkSection`, `EkDescriptionList`, `EkStatusChip`, `EkKpiCard/EkKpiRow`, `EkEmptyState`, `EkErrorState`, `EkSkeleton`, `EkConfirmDialog`, `EkFormDialog`, `EkPageTabs`, `EkPlatformMark`, `EkToastHost`. Şablonlar `components/ds/templates/` altındadır: `EkListPage`, `EkSettingsTemplate/EkSettingsSection`, `EkWizardTemplate`, `EkReadonlyPanelTemplate`.

> Önerim: DS-v2 adı kalıcı olacaksa yerel orkestratör bu içeriği tek sayfalık `frontend/DESIGN_SYSTEM.md` olarak derlesin. Bulut brifleri o gelene kadar ADR-0015 Karar 1/3/5.6/6'ya atıf verir.

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
| ⚠ `stock-reservation` (54) · **available** | Eşzamanlı siparişte yalnız mevcut kadar rezervasyon; aşırı satış **işaretlenir** ve telafiye alınır (ayrıca `oversellFlow` "Aşırı satış görünür olur") | **var** (motor) | `operations/stock/StockAllocator.ts:38,48-91`; `operations/integration/PostOrderOperations.ts:153`; `operations/stock/OversellCompensationJob.ts:156,171-194`; `backend/tests/integration/StockAllocator.concurrency.test.ts`; uçlar `api/services/stock-service.ts:28` (`getStockOverview`), `getOrders` `allocationStates` (TS §2.2) | Politika ekranı var: `StockPolicyView` (`catalog/stock-policy`). **Aşırı satış/rezervasyon görünümü YOK**: FE'de `allocationState`/`OVERSOLD`/`getStockOverview` grep 0. Kullanıcı yalnız bildirimden görür | **F-01 → C1.1** (BE hazır) |
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
| ⚠ `role-based-access` (216) · available (+ `homePillars.rbac` "hassas işlemler üst kademeye ayrılır") | Kademeli roller | **var** (backend) | `api/operationPolicy.ts:5,37`; `capabilities/derive/policy.ts:17` | `AuthorizationListView` (yalnız menü). FE kademe bilmiyor: yalnız `isOwner()`/`isPlatformAdmin()` (`composables/user.ts:262-270`); `screens.ts`'te `minRole` yok. Düğme gizleme/nedenli devre dışı yok, 403 sonradan geliyor. Davet yok | **F-15** → B-04 + B-05 → C2.3 |
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
2. **Aşırı satış görünürlüğü** (`stock-reservation`, `oversellFlow`) → **C1.1** (bulut, BE hazır).
3. **Entegrasyon sağlığı + dürüst "Yakında"** (`integration-resilience`; site gizlediği kargo/e-fatura formlarını uygulama gösteriyor) → **C1.2** (bulut, BE hazır) + B-02.
4. **Finans/hakediş görünümü** (`finance`) → **C1.4** (bulut, BE hazır).
5. **Rehberli kurulum** (`faq` başlangıç) → **C2.1** (bulut, BE gerekmez).
6. **Kademe-farkında arayüz** (`role-based-access`, `homePillars.rbac`) → B-04 → **C2.3**.
7. **Plan limitleri/özellik farkı ve plan değişimi** (`plans`, `pricing`) → B-08 + insan kararı.
8. **ERP sipariş okuma iması** (`erp-read`) → yerel/site kararı (B-20 ya da metin düzeltmesi).

---

## 2. Farklılaşma fırsatları (uygulama içi)

Her fırsat için şu başlıklar verilir: **Problem**, **Rakipte** (araştırma kanıtı; yoksa `hipotez`), **Farklılaşma açımız**, **FE işi**, **BE işi**, **Büyüklük**, **Bağımlılık**.
Büyüklük ölçeği BENCH §0'daki ile aynıdır: S ≤ ~3 gün · M ~1–2 hafta · L > 2 hafta veya dış karar.

Yol haritasını yönlendiren kimlik ilkesi (PAT (a) ve (c)) şudur: **dürüstlük** (kapsam beyanı, hata ≠ boş), **doğruluk** (stok/para), **sakin, tek amaçlı ekran**. Rakip pazarlama sayfaları bu konularda sessiz; bizim açımız burada.

### F-01 — Aşırı satış ve stok sağlığı görünürlüğü ⭐ amiral gemisi
- **Problem:** Site "Aşırı satış görünür olur" vaat ediyor (CAP `oversellFlow` "Aşırı satış görünür olur"). Oysa `allocationState`/`OVERSOLD` frontend'de hiçbir yerde okunmuyor (grep 0). Telafi işi bildirim üretiyor ama kullanıcı hangi siparişin açıkta kaldığını liste ekranında göremiyor.
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
- **Problem:** Site "hassas işlemler üst kademeye ayrılır" diyor (CAP `homePillars.rbac`). Buna karşın tenant "kim ne yaptı" sorusuna cevap göremiyor. Veri yazılıyor ama okunmuyor.
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
  - Site "Kademeli roller ekibinizi yetkilendirir" diyor (CAP `homePillars.rbac`).
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
- **Tasarım:** yalnız Karar 6 kataloğu:
  - yeni ekranlarda çıplak `v-data-table/v-dialog/v-chip`/`toLocale*` = 0 (desen mandalı),
  - durum için `EkStatusChip` + `src/design/status-map.ts`,
  - biçim için `src/composables/format.ts`,
  - boş/hata/yükleniyor ayrı gösterilir; kullanılamayan sayı "—" ile gösterilir, "0" ile değil.
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

<!-- BRIEFS-AND-BE -->

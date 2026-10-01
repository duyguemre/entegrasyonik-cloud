# Sabit (hardcoded) yapılandırma envanteri — 2026-09-30

Karar belgesi: [ADR-0031 — Çalışma zamanı platform ayarları](../adr/0031-calisma-zamani-platform-ayarlari.md).
Tarama salt okumaydı. Taranan ağaçlar: `frontend/src` (güncel önizleme ağacı), `.claude/worktrees/be/backend/src` (`config/env.ts` dışı; env şeması yalnız mevcut mekanizmayı görmek için okundu), `.claude/worktrees/site-preview/site/src` (yalnız özet).
Testler, fikstürler ve `__tests__` kapsam dışı. Sır içeren hiçbir değer bu belgeye yazılmadı; kişisel veri benzeri değerler maskelendi.

## Sınıflar

| Sınıf | Anlamı | Nerede tutulur |
|---|---|---|
| **S** | Sır | Yalnız env/.env. DB'ye, UI'ya ya da public-config'e asla girmez. |
| **E** | Ortam/altyapı değeri (API tabanı, CDN/görsel tabanı, CORS, alan adı, altyapı tavanı) | env ya da derleme config'i, ortama göre değişir. Backoffice'te en fazla **salt okunur** görünür. |
| **R** | İş/çalışma zamanı ayarı | ADR-0020 yapılandırma motoru, `_platform` hedefi (ADR-0031). Backoffice'ten yönetilir. `exposure:'public'` olanlar `GET /api/public-config` ile önyüze gider. |
| **K** | Gerçek sabit: sözleşme, güvenlik tavanı, UX sabiti, yer tutucu | Kodda kalır. Gerekirse tek yerde toplanır. |

Hedef sütunundaki değerler: `env` (mevcut/yeni env), `env→public-config` (env kaynaklı, önyüze salt okunur yayılır), `public-config` (R, `_platform`, public), `admin-only` (R, önyüze gitmez), `kodda kalır`, `sil` (ölü/demo).

## Özet sayım

Sayım birimi bir **değer**dir: aynı değer birden fazla dosyada geçse de tek sayılır.

| Sınıf | Değer sayısı | Not |
|---|---|---|
| S | 0 | Kaynak kodda sabit sır bulunmadı. Sırların hepsi `config/env.ts` şemasında yalnız tiplenmiş durumda (ADR-0003 statik testi bunu koruyor). |
| E | 10 | 4'ü zaten env'de (FE `VITE_*` ×2, BE `SOURCE_MONITOR_USER_AGENT`, BE hız sınırları). Asıl iş görsel tabanıdır: FE'de 7 dosya, BE'de 3 yer. |
| R | 11 (+2 site, derleme zamanı) | 2'si bugün kodda sabit olan UI ayarı (liste sayfa boyutu, rapor yoklama süresi), 2'si ADR-0020 `_engine` kataloğunda zaten var, 7'si bugün kodda hiç yok ama ürünün ihtiyacı olan yeni anahtar (destek iletişimi, duyuru, bakım modu). |
| K | 27 | Pazaryeri API host'ları ve SSRF izin listesi, güvenlik tavanları, TTL/saklama süreleri, sayfalama korkulukları, UX zamanlayıcıları, yer tutucular. |
| sil | 1 | 7 görünümdeki demo verisi. İçinde kişisel veriye benzeyen e-posta ve telefon var. |

## 1. Önyüz (`frontend/src`)

| # | dosya:satır | Değer | Sınıf | Önerilen anahtar | Hedef |
|---|---|---|---|---|---|
| F1 | `components/productDefinitions/crud/ProductImagesComponent.vue:151`, `products/ProductImageComponent.vue:12`, `variants/ProductBatchVariantAttributesComponent.vue:359`, `variants/ProductVariantAttributesComponent.vue:484`, `variants/ProductVariantImageComponent.vue:12`, `variants/ProductVariantImageEditComponent.vue:11`, `variants/ProductVariantImagesComponent.vue:182` | `ref('https://images.entegrasyonik.com/products/')` (7 kopya; FRONTEND_CLEANUP_PLAN X-02) | E | `images.productBaseUrl` | env→public-config (kaynak BE `R2_PUBLIC_URL_IMAGE` + `IMAGE_FILES_PATH`, bkz. ADR-0031 Karar 3) |
| F2 | F1'deki 7 dosya, satır+1 | `baseImageURL + 'temp/'` | K | — | kodda kalır, `config/imageUrl.ts` içinde tek yerde (X-02 util) |
| F3 | `variants/ProductBatchVariantAttributesComponent.vue:865`, `variants/ProductVariantAttributesComponent.vue:1067`, `variants/ProductVariantImagesComponent.vue:538` | `maxSize: 2000000` (2 MB). Backend varsayılanı 10 MB (`imagePolicy.ts:32`) — **tutarsız** | E | `images.uploadMaxBytes` | env→public-config (kaynak BE `IMAGE_UPLOAD_MAX_BYTES`, salt okunur) |
| F4 | `config/env.ts:11` | `DEFAULT_API_BASE_URL = 'http://127.0.0.1:5001/api/'` | E | `VITE_API_BASE_URL` (mevcut) | env (derleme zamanı). public-config'e **taşınamaz**: public-config'i çağırmak için bu adresin önceden bilinmesi gerekir. |
| F5 | `config/env.ts:15` | `imageBaseUrl` ← `VITE_IMAGE_BASE_URL` | E | `VITE_IMAGE_BASE_URL` (mevcut) | env (derleme). **Adlandırma tuzağı:** bu değer görsel *API'sinin* (upload/getImage) tabanıdır, CDN tabanı değildir. F1 için KULLANILMAZ. |
| F6 | `config/siteLinks.ts:13` | `DEFAULT_SITE_URL = 'http://localhost:4321'` | E | `VITE_SITE_URL` (mevcut) | env (derleme, ADR-0014) |
| F7 | `config/siteLinks.ts` `SITE_LEGAL_PATHS` | `/yasal/...` yolları | K | — | kodda kalır (site `legalNav` ile testle kilitli) |
| F8 | `components/integrations/integrationWebhook.ts:18` | `'http://localhost'` (SSR yedeği) | K | — | kodda kalır |
| F9 | `components/ds/templates/EkListScreen.vue:242`, `claim/composables/useClaimFilters.ts:20`, `customer/composables/useCustomerFilters.ts:22`, `order/composables/useOrderFilters.ts:21`, `ticket/composables/useTicketFilters.ts:24`, `logListView/ExportLogList.vue:283`, `logListView/ImportLogList.vue:154` | liste sayfa boyutu `25` (7 yer) | R | `ui.listPageSize` | public-config |
| F10 | `logListView/DetailedExportLogReport.vue:327`, `logListView/DetailedImportLogReport.vue:412` | rapor yoklama `5000` ms | R | `ui.reportPollMs` | public-config |
| F11 | `views/secure/adminPanel/AdminSystemManagementView.vue:1062` | yönetim ekranı yenileme `10000` ms | K | — | kodda kalır. Eski FE yönetim paneli backoffice'e taşınıyor (ADR-0026); ayar yapılmaya değmez. |
| F12 | ~30 yer (`useBatchActions.ts:143-205`, `TrendyolComponent.vue:98-101`, `ProductVariantsComponent.vue:239-410`, `errorReporting.ts:44`, `useOrderActions.ts:133`, `useClaimActions.ts:142` …) | snackbar `timeout` 2000–10000 | K | — | kodda kalır. İsteğe bağlı olarak DS sabitlerine (`short/normal/long`) toplanır; ayar yapılmaz. |
| F13 | `composables/clientLogTransport.ts:22-27` | `MAX_BODY_BYTES = 7 KB` vb. | K | — | kodda kalır (BE `clientLog.ts:12` 8 KB ile eşli) |
| F14 | `components/ds/cascadeMotion.ts:39`, `ds/EkRowActions.vue:63`, `ds/pageTrail.ts:33` | `MAX_*` DS sabitleri | K | — | kodda kalır |
| F15 | `ds/EkContextMenu.vue:64` (400), `ds/EkPageBar.vue:223` (1600), `order/BarcodePrintComponent.vue:144` (500), `composables/restapi.ts:65` (1000), `composables/useTenantDataApi.ts:119` (1000) | UI zamanlayıcıları | K | — | kodda kalır |
| F16 | `invoice/CreateInvoiceComponent.vue:31`, `order/ManualInvoiceComponent.vue:13`, `order/ManualShipmentComponent.vue:15`, `views/secure/SettingListView.vue:114`, `adminPanel/AdminClientCreateComponent.vue:15`, `plugins/locales/tr.json:1017` | yer tutucular (`https://sunucu.com/...`, `https://...`, `https://example.com/logo.png`, `admin@magaza.com`, `http://www.example.com`) | K | — | kodda kalır |
| F17 | `views/dev/design-system/DsForms.vue:44` | `https://app.entegrasyonik.com/hooks/` (örnek) | K | — | kodda kalır (yalnız DEV rotası). İstenirse `example` alan adına çevrilir. |
| F18 | `plugins/vuetify.ts:4,35` | vuetifyjs.com (yorum) | K | — | kodda kalır |
| F19 | `claim/ClaimDetailComponent.vue:140-148` | `+90` biçimlendirici | K | — | kodda kalır |
| F20 | `adminPanel/integrations/useIntegrationConfigApi.ts:103` | `history limit = 50` | K | — | kodda kalır |
| F21 | `views/secure/definitions/{Brand,Customer,Hashtag,Invoice,Option,Order,Return}DefinitionView.vue` (ör. `BrandDefinitionView.vue:150-255`) | sabit demo satırları: ad + e-posta `e***@e***.com` + telefon `05*******22` (42 geçiş) | — | — | **sil** (ölü demo verisi, kişisel veriye benziyor). FE temizlik planına eklenir (ADR-0031 FE-CFG-3). |

## 2. Arka yüz (`.claude/worktrees/be/backend/src`)

### 2a. Mevcut yapılandırma mekanizmaları (yeniden kullanılacak)

| Mekanizma | Yer | Ne taşır |
|---|---|---|
| env şeması | `config/env.ts` (zod, strict/lenient, `.env.example` tutarlılık testi) | Sırlar (S), ortam değerleri (E), kapı bayrakları, hız sınırları |
| ADR-0020 yapılandırma motoru | `integration/config/*`: katalog `catalog/{engine,integrationHttp,mock}.ts`, `revisionRepository.ts` (taslak/yayın/geri alma/geçmiş), `IntegrationConfigRevisions/Heads` koleksiyonları, `configHeadPoll.ts` (15 sn), `platformOverrideStore.ts` (bellek içi son bilinen, fail-open), `approvalGate.ts` (gerekçe, `dangerous`), `api/services/integration-config-service.ts` | Motor (`_engine`) ve entegrasyon başına R ayarları. Önyüzü backoffice'teki "Entegrasyonlar → Ayarlar / Motor ayarları" ekranları. |
| `SystemFlags.disabledCapabilities` | ADR-0019 | Yetenek kapatma (ayrı konu, dokunulmaz) |
| BACKOFFICE_PLAN B11 | `docs/BACKOFFICE_PLAN.md` §2.8 | Aynı motorda `platform` hedefi (`maintenance.*`, `features.*`) planlanmış. ADR-0031 bu planı genişletir. |

### 2b. Envanter

| # | dosya:satır | Değer | Sınıf | Önerilen anahtar | Hedef |
|---|---|---|---|---|---|
| B1 | `Constants.ts:1` (tüketici: `api/services/product-service.ts:396`) | `BASE_IMAGE_URL = "https://images.entegrasyonik.com/products/"` | E | `config.images.productBaseUrl` (← `R2_PUBLIC_URL_IMAGE` + `IMAGE_FILES_PATH`) | env→public-config. `Constants.ts` dosyası silinir. |
| B2 | `services/image/image-operations.ts:6` | `BASE_IMAGE_URL` (B1'in ikinci kopyası) | E | aynı çözümleyici | env |
| B3 | `services/image/image-operations.ts:7` | `BASE_CLIENT_URL = ".../clients/"` | E | `config.images.clientBaseUrl` (aynı kök + `clients/`) | env (önyüze gitmez) |
| B4 | `services/storage/imagePolicy.ts:31` | `HARD_MAX_BYTES = 25 MB` | K | — | kodda kalır (güvenlik tavanı) |
| B5 | `services/storage/imagePolicy.ts:32-33` | `DEFAULT_MAX_BYTES = 10 MB`, `DEFAULT_TTL_SEC = 300` | E | `IMAGE_UPLOAD_MAX_BYTES` / `IMAGE_UPLOAD_URL_TTL_SEC` (mevcut) | env. `maxBytes` public-config'e salt okunur gider (F3). |
| B6 | `services/storage/imagePolicy.ts` `MAX_PIXELS`, tür izin listesi | 50 MP; jpeg/png/webp/avif | K | — | kodda kalır |
| B7 | `config/env.ts:245` | `SOURCE_MONITOR_USER_AGENT` varsayılanı (ürün alan adı içerir) | E | (mevcut) | env |
| B8 | `api/services/security-service.ts:96-98`, `platform/core/errors/codes.ts:31` | hata metninde `admin.entegrasyonik.com` | K | — | kodda kalır ama **alan adı metinden çıkarılır** ("yönetim uygulamasından"). Alan adı ortama göre değişir (E), metne gömülmemelidir. |
| B9 | `integration/modules/marketplace/trendyol/services/Service.ts:13-14`, `trendyol/api/OrderConnector.ts`, `trendyol/api/productUrls.ts`, `trendyol/urlSafetyNet.ts`, `n11/services/{Service,RestService}.ts`, `hepsiburada/services/Service.ts:43`, `pazarama/services/Service.ts:45`, `erp/bizimhesap/services/Service.ts:40` | Pazaryeri/ERP API tabanları (`apigw.trendyol.com`, `api.n11.com`, `mpop.hepsiburada.com`, `isortagimgiris.pazarama.com`, `api.bizimhesap.com`) | K | — | kodda kalır. Bunlar API sözleşmesidir; geçersiz kılma zaten ADR-0020 `endpoints` + `Integrations.urls` üzerinden yalnız yöneticiye açık. |
| B10 | `integration/modules/common/security/outboundHosts.ts:27-34`, `*/descriptor.ts` `hosts` | Giden istek (SSRF) host izin listesi | K | — | kodda kalır. UI'dan değiştirilemez: güvenlik sınırıdır. |
| B11 | `*/descriptor.ts` (trendyol, n11, hepsiburada, pazarama, ideasoft, bizimhesap) | geliştirici belgesi / changelog URL'leri | K | — | kodda kalır (ADR-0018 kaynak izleyici, kod incelemesiyle değişir) |
| B12 | `services/billing/MockPaymentProvider.ts` | `https://mock`, `http://localhost` | K | — | kodda kalır (`MOCK_CHECKOUT_BASE_URL` env zaten var) |
| B13 | `api/admin/AdminApiManager.ts:38-41`, `api/admin/adminSession.ts:16-19`, `api/admin/impersonationTicket.ts:9-10`, `api/admin/totp.ts:6-9`, `api/admin/recoveryCodes.ts:6-8`, `api/admin/stepUp.ts:12-13`, `integration/config/approvalGate.ts:11-12` | kilitleme eşikleri, oturum süreleri, TOTP, bcrypt maliyeti, gerekçe uzunlukları | K | — | kodda kalır. Güvenlik tavanı: UI'dan gevşetilmesi saldırı yüzeyi açar. |
| B14 | `database/application/models/{AuditLog:8, ErrorEvent:7, IntegrationCallMetric:6, IntegrationFinding:23, Invitation:10, JobRunRegistry:23, LogEvent:11-14, NotificationEvent:48, QueueMetrics:9}.ts` | TTL/saklama süreleri | K | — | kodda kalır. Değişiklik TTL indeksi göçü, yedek ve KVKK saklama politikası gerektirir; UI'dan değiştirilmez (RET-01 paralel işi). |
| B15 | `database/repositories/_shared/paginate.ts:5-7`, `api/services/audit-service.ts:6-11`, `shipment-service.ts:6`, `stock-service.ts:6-7`, `smart-service.ts:6`, `api/requestValidation.ts:11` | sayfalama/sorgu korkulukları | K | — | kodda kalır |
| B16 | `api/services/financial-service.ts:7` (5000), `product-service.ts:15` (500), `attributeMapping-service.ts:13-14`, `integration-service.ts:1126` (1000), `tenant-data-service.ts:13` (24 sa) | toplu işlem/dışa aktarma tavanları | K | — | kodda kalır (`EXPORT_EXCEL_MAX_ROWS` gibi env olanlar env'de kalır) |
| B17 | `integration/modules/IntegrationFactory.ts:39` (`EXECUTION_TIMEOUT = 120000`), `integration/engine/catalog/export/Dispatcher.ts:24` (`LEASE_TTL_MS`) | motor zaman aşımları | R | `resilience.factoryCallTimeoutMs`, `export.dispatcher.leaseTtl` (**katalogda zaten var**) | admin-only (`_engine`, mevcut). Tüketicinin sabiti mi yoksa çözümleyiciyi mi okuduğu doğrulanmalı (ayrı iş, ADR-0020 kapsamı). |
| B18 | `Dispatcher.ts:21` (`BATCH_SIZE = 300`), `Publisher.ts:28`, `order/OrderQueueProducer.ts:225` (10 sn dedupe), `order/OrderWorker.ts:35-38`, `order/worker-runner.ts:12`, `hepsiburada/api/paginateOffset.ts:15-17`, `n11/services/OrderService.ts:23`, `ideasoft/services/SecurityService.ts:7` | motor/adaptör iç sabitleri | K | — | kodda kalır. Ayar olarak gerekirse ADR-0020 kataloğuna ayrı karar ile eklenir. |
| B19 | `integration/compliance/{ContractGuard:87, FindingService:92-98, ShapeFingerprint:5-6, SourceMonitor:42-164}.ts`, `integration/config/{platformOverrideStore:96, diffAndImpact:55}.ts`, `integration/modules/common/{contract/*, http/ResilientHttpClient.ts:165, IntegrationError.ts:37}` | uyumluluk/izleme eşikleri, boyut tavanları | K | — | kodda kalır |
| B20 | `database/TenantRegistry.ts:20`, `health/HealthCheck.ts:16`, `bootstrap/shutdown.ts:36`, `api/appWriteAudit.ts:105-106`, `api/clientLog.ts:12-84` | altyapı zaman aşımları/tavanları | K | — | kodda kalır |
| B21 | `config/env.ts` hız sınırları (`*_RATE_LIMIT_*`), `FROM_EMAIL/FROM_NAME`, `PUBLIC_APP_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS`, `ADMIN_CORS_ORIGINS` | (env) | E | (mevcut) | env. Backoffice "Ortam" bölümünde salt okunur gösterilebilir. CORS ve sırlar gösterilmez. |

### 2c. Bugün kodda olmayan ama ürünün ihtiyacı olan R anahtarları (ADR-0031 v1 kataloğu)

| Anahtar | Tip / doğrulama | Varsayılan | Görünürlük |
|---|---|---|---|
| `support.email` | e-posta (zod `email`, ≤120) | `bilgi@entegrasyonik.com.tr` (site `data/company.ts:24` ile aynı, kullanıcı kararı) | public |
| `support.phone` | metin, `^\+?[0-9 ()-]{7,20}$` | `''` (boşsa gösterilmez) | public |
| `announcement.enabled` | bool | `false` | public |
| `announcement.level` | enum `info`/`warning` | `info` | public |
| `announcement.text` | metin ≤280, HTML yok | `''` | public |
| `maintenance.enabled` | bool, `danger:'caution'` | `false` | public (BACKOFFICE_PLAN B11) |
| `maintenance.message` | metin ≤280 | `''` | public (B11) |

Önyüzde bugün hiç destek iletişimi görünmüyor; e-posta ve telefon yalnız sitede var.

## 3. Site (`.claude/worktrees/site-preview/site/src`) — özet

Site statik derleniyor; çalışma zamanı yapılandırması burada anlamsız. Mevcut düzen doğru: veri dosyaları ve derleme zamanı env'i.

| dosya:satır | Değer | Sınıf | Hedef |
|---|---|---|---|
| `data/company.ts:24`, `lib/contact.ts:13`, `pages/iletisim.astro:6` | genel iletişim e-postası (`PUBLIC_CONTACT_EMAIL` env'i verilirse o) | R (derleme zamanı) | veri dosyası + derleme env'i (mevcut). Değer `support.email` varsayılanıyla aynı; ikisi ayrı kaynak olarak kalır ve değişince site yeniden derlenir. |
| `data/company.ts:26` | telefon `+90 (850) 000 00 00` (**yer tutucu**, dosya notuna göre "henüz verilmedi") | R (derleme zamanı) | veri dosyası. Yayından önce gerçek değerle değiştirilmeli ya da gizlenmeli. |
| `lib/site-config.ts:24` | `DEFAULT_APP_URL = 'http://localhost:3000'` | E | derleme env'i (mevcut) |
| `lib/seo.ts` | kanonik taban | E | derleme env'i (mevcut) |

## 4. Doğrulanması gereken yan bulgular (bu belgede çözülmez)

1. **Görsel yolu biçimi:** FE `ProductImageComponent.vue:41` URL'i `base + productId + '/' + _id + '_t.' + ext` olarak kuruyor (`clientId` yok). BE `product-service.ts:396` ise `base + clientId + '/' + productId + '/' + ...` yazıyor (ADR-0013 B3). FE-CFG-1 URL biçimini **değiştirmez** (X-02 kuralı). Hangisinin doğru olduğu ayrı bir işte doğrulanmalı. Tercih edilen yön: önyüz DB'deki `image.url` alanını kullanır, yoksa tabandan kurar.
2. **Yükleme tavanı tutarsızlığı** (F3): FE 2 MB, BE 10 MB. FE-CFG-1 sonrası tek kaynak BE olur.
3. **B17:** katalogdaki anahtarların tüketici dosyalarda sabit olarak da durması, çözümleyiciyi okumadıklarını gösterebilir (ADR-0020 kapsamında doğrulanmalı).

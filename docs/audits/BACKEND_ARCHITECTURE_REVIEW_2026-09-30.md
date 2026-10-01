# BACKEND_ARCHITECTURE_REVIEW — 2026-09-30

**Kapsam:** API servis katmanı (`src/api/**`), ortak servisler (`src/services/**`, `src/platform/**`, `src/utils/**`, `src/operations/**`), veritabanı yönetimi ve instance yaşam döngüsü (`src/database/**`, `entegrasyonik.ts`, `Webserver`, `IntegrationEngine`, `IntegrationFactory`), kullanılmayan kod ve klasör yapısı.
**Yöntem:** Kod okuma, `npm run depcruise` (485 modül / 1.498 bağımlılık), `npm run knip`, servis metotlarının yetenek kaydıyla (`capabilities/domains/*.ts` içindeki 198 `rpc:` bağı ve `IMAGE_API_TARGETS`) TypeScript AST üzerinden karşılaştırılması. DB ve Redis'e bağlanılmadı; kaynak kod değiştirilmedi.
**Referans commit:** `faz4-integration` @ `ff9df2c`. WP8 (ADR-0023, RPC girdi şeması) bu commit'te birleşmiş durumda.
**İlgili belgeler:** ADR-0016 (hedef mimari; bu inceleme onun Faz 3 kısmının güncel durumunu ölçer), ADR-0003, ADR-0019, ADR-0021, ADR-0023, `docs/audits/BACKEND_INTEGRATION_AUDIT_2026-09-30.md` (adaptör, cache ve HTTP bulguları orada; burada tekrar edilmez, yalnızca F-xx numarasıyla atıf yapılır).
**Karar belgesi:** `docs/adr/0024-backend-servis-katmani-ve-klasor-yapisi.md`

Şiddet ölçeği: P0 = veri kaybı, güvenlik açığı ya da iş sürekliliği riski (hemen). P1 = yakın vadede düzeltilmeli. P2 = planlı iş. Boyut ölçeği: S (1 günden az), M (1-3 gün), L (3 günden fazla).

---

## 0. Özet

- **Bu kapsamda P0 bulgu yok.** Güvenlik sınırı sağlam: tenant kimliği yalnızca doğrulanmış principal'dan geliyor, varsayılan ret uygulanıyor, `ApiWrapper` ikinci savunma hattı olarak çalışıyor, ADR-0023 ile girdi doğrulaması tek noktada. Sorunlar maliyet, yaşam döngüsü, katman ve bakım yükü sorunları.
- **ADR-0016'nın Faz 3 hedefleri (B-R13 … B-R18) büyük ölçüde başlamamış.** Durum şöyle:
  - `api/` hâlâ düz bir klasör (25 dosya + `services/`).
  - `database/repositories` ve `TenantRegistry` yok.
  - `bootstrap/` yok.
  - `*Scheduler.ts` sarmalayıcıları duruyor.
  - `IntegrationService` 1.519 satır.
- **En pahalı iki yapısal konu veritabanı tarafında:**
  - Her RPC çağrısında ApplicationDB'ye tekrar tekrar gidiliyor.
  - Her tenant ayrı bir MongoClient ve bağlantı havuzu açıyor.
  - Bu iki konu küçük kod değişiklikleriyle (M) kapanabilir ve ölçekten bağımsız fayda sağlar.
- **Ölü kod az ve dağınık.** knip 4 dosya buluyor; bunlardan 3'ü silinebilir. Servislerde RPC ile erişilemeyen, iç çağıranı da olmayan **14 metot** (~230 satır) var (§4). knip'in 57 "kullanılmayan export" bulgusunun büyük çoğunluğu barrel'dan yeniden dışa aktarılan tipler ve test yardımcıları. Gerçek ölü değer sayısı ~15.

---

## 1. API servis katmanı

### 1.1 Yapı ve akış (mevcut)

İstek zinciri şöyle ilerliyor:

1. `Webserver` → `authenticate` middleware. Burada iki okuma yapılıyor: `Users.findById` ve `Clients.findOne({order},'status')` (`api/authenticate.ts:85,112`).
2. `ApiManager` jenerik rotası `POST /api/:service/:operation`.
3. `RunOperation.run`: metrik, yetki (`OPERATION_POLICY`, kayıttan türetiliyor), entitlement ve ADR-0023 girdi doğrulaması.
4. `MicroserviceWrapper.process`: her çağrıda `new Service(clientId, request)` + `init()` (`api/ApiWrapper.ts:26-27`).
5. `BaseApi.init` → `DatabaseManagerInstance.getApplicationDB()` + `getClientDB(clientId)`. İkincisi yine bir `Clients.findOne({order})` sorgusu çalıştırıyor (`database/DatabaseManager.ts:56-60`).

Katmanlar:
- **Servisler (33 sınıf, ~9.500 satır):** `BaseApi`'den türüyor. Girdiyi `this.request.*` üzerinden okuyor, Mongoose modellerine doğrudan erişiyor. Handler'larda **297** `getXModel()` çağrısı var.
- **Alt katman:** `operations/` yalnızca birkaç alanda kullanılıyor (account, tenant, stock, billing).

### 1.2 Servis boyutları (tanrı-sınıflar)

| Servis | Satır | `getXModel()` | `this.request` | Karışan sorumluluklar |
|---|---|---|---|---|
| `integration-service.ts` | 1.519 | 41 | 65 | Entegrasyon ayarları ve sırlar · stok politikası · sağlık · dışa/içe aktarma iş sorguları (`advancedSearchExportJobs` 180 satır, `getExportJobs` 120 satır, MM-02 kopyası) · toplu iş oluşturma (`internalProcessBatch` 213 satır, motor mantığı) · platform vekil çağrıları |
| `admin-service.ts` | 750 | 40 | 23 | Tenant yönetimi · kullanıcı · abonelik · sistem sorguları |
| `order-service.ts` | 739 | 14 | 10 | Liste/arama · istatistik · durum · dışa aktarma |
| `variant-service.ts` | 514 | 16 | 38 | CRUD · fiyat/stok toplu güncelleme · sorgu kurucular |
| `product-service.ts` | 498 | 21 | 8 | CRUD · görsel kopyalama · Excel |

ADR-0016 Faz 3 çıkış kapısı "`integration-service` cephesi ≤ 300 satır" ve "handler `getXModel()` mandalı hedef 0" bugün ölçülmüyor. `quality/` altında bu iki değer için mandal yok.

### 1.3 Tekrar eden desenler

| Desen | Sayı | Kanıt | Not |
|---|---|---|---|
| `$facet {metadata:[$count], data:[$sort,$skip,$limit]}` sayfalama | 10 | claim, customer, invoice, message, order, product, shipment ×2, ticket, user servisleri | Aynı `normalizePagination` + `skip` + `sortBy.key/order` çözümlemesi her serviste elle yazılmış |
| `try { … } catch (e) { throw e }` (bilgi eklemeyen yakalama) | 87 | `api/services/*` (ör. `BaseApi.ts:26-35`) | Gürültü. Hata zarfı zaten `ApiManager.sendError`'da tek noktada |
| `throw new Error(...)` / `throw new ApplicationError(...)` | 63 / 82 | `api/services/*` | `Error` → 500 `INTERNAL` (ileti gizlenir), `ApplicationError` → 4xx (ileti görünür). Hangisinin seçileceği tutarsız |
| `console.*` | 73 (api) / 317 (src) | — | ADR-0017 logger köprüsü var ama kaynaklar göçmedi (F-06) |
| Özel kurucu (`constructor(clientId, protected request)`) | 14 servis | ör. `configuration-service.ts:13-16` (`currentClientId` kopyası) | `BaseApi` zaten `clientId`/`request` tutuyor |
| Servis içinden servis kurma + 7× `init()` | 1 | `configuration-service.ts:20-36` | Her `init` ayrı bir `Clients.findOne` yapıyor → tek RPC'de **8 tenant kaydı okuması** (authenticate ile birlikte 9-10 ApplicationDB okuması) |

### 1.4 `BaseApi` sorumlulukları

`BaseApi.ts` 37 satır. Kurucu `(clientId, request:any)` alıyor. `init()` iki DB tutamacını (handle) bağlıyor. Sorunlar:
- **Tipli bir bağlam yok.** Handler, kullanıcı bağlamını `this.request.userContext`, girdiyi `this.request.<alan>` üzerinden okuyor. ADR-0023 doğrulanmış çıktıyı yine `request`'in içine koyuyor. Handler'ın "doğrulanmış girdi" ile "sunucu alanları"nı ayırt edecek bir yolu yok.
- **Tenant çözümleme her istekte DB'ye gidiyor.** Önbellek yok (ADR-0016 §5.2 `TenantRegistry` hâlâ yapılmadı).
- **Hata semantiği yanlış.** `clientId` verilmiş ama tenant bulunamamışsa `Error` fırlatılıyor → 500 (`BaseApi.ts:31-33`). `clientId` hiç yoksa `console.warn` basılıyor ve `clientDB` tanımsız kalıyor; tenant verisine dokunan handler'da TypeError → 500 (`BaseApi.ts:12-15`).
- **Kompozisyon desteği yok.** Bir handler başka bir handler'ın metodunu çağırmak isterse yeni örnek + yeni `init` gerekiyor (§1.3).

### 1.5 Katman ihlalleri (depcruise + kural dışı tarama)

`npm run depcruise`: **18 uyarı** (0 hata; kurallar hâlâ `warn`):
- 3 `no-circular`: 2'si `interfaces` barrel içinde, 1'i `platform/runtime/metrics/errorEvents.ts ↔ prodDeps.ts`.
- 9 `operations → api`:
  - `api/Security` (ApplicationError, `Security.getInstance`) → `operations/tenant/{TenantProvisioningService,TenantLifecycleService,provisionInput,exportDownloadToken}.ts`, `operations/account/{passwordPolicy,AccountLifecycleService}.ts`
  - `api/responseSanitizer` ve `api/integrationSecrets` → `operations/tenant/exportCollections.ts`
  - `api/integrationSecrets` → `operations/integration/IntegrationHealthOperations.ts`
- 4 `integration → api`: `ideasoft/services/{Service,SecurityService}.ts`, `integration/config/legacyIntegrationRecord.ts` → `api/tenantSettingsGuard`, `api/integrationSecrets`.
- 2 `adapters-not-to-operations`: aynı Ideasoft kenarları.

**Kuralların yakalamadığı ihlaller.** ADR-0016 §1.2 seviye tablosuna göre ihlal, ama `.dependency-cruiser.cjs` bunları kapsamıyor:

| Kenar | Kanıt | Seviye ihlali |
|---|---|---|
| `platform/rateLimit/globalRateLimit.ts` → `@api/rateLimit`, `@api/clientIp` | satır 7-8 | platform (2/5) → api (9) |
| `services/storage/StorageService.ts` → `operations/tenant/exportKey` | satır 3 | services (4) → operations (7) |
| `operations/stock/StockPublishTrigger.ts` → `@integration/engine/IntegrationEventBus` | satır 4 | operations (7) → engine (8) |
| `operations/tenant/TenantLifecycleService.ts` → `@integration/engine/order/OrderQueueProducer` | satır 5 | operations (7) → engine (8) |
| Çıplak `src/...` içe aktarma (ADR-0016 yasak) | `api/services/product-service.ts:2`, `database/client/models/Customer.ts:2`, `integration/engine/catalog/export/Dispatcher.ts:8` | — |

Kuralların eksik olduğu yerler: `platform|services → api|operations|integration`, `operations → integration/engine`, `capabilities → api`, çıplak `src/` ve `api/**/handlers → database/**/models` (warn + taban çizgisi).

---

## 2. Ortak servisler, platform, utils, operations

| # | Konu | Kanıt | Değerlendirme |
|---|---|---|---|
| 2.1 | `ClientOperations` iki ilgisiz iş yapıyor: depolama yapılandırması (env okuma) ve bildirim kaydı (tenant DB). Bu nesne başlangıçta `NotificationService.init(clientOperations)` ve `storageService.initialize(clientOperations)` ile enjekte ediliyor | `operations/client/ClientOperations.ts:1-38`, `entegrasyonik.ts` (init), `services/storage/StorageService.ts:25` | Dolaylılık değer katmıyor. `getStorageConfig` zaten `readStorageEnv`'i sarıyor. `saveNotification` bir tenant repository işi. Yanlış yerde ve yanlış adla duruyor |
| 2.2 | `services/` hem altyapı adaptörlerini (redis, storage, mail, audit sink) hem alan mantığını (notification, statistics, image, billing/Entitlement) barındırıyor | `services/{notification,statistics,image,billing}` | ADR-0016 §1.3 eşlemesi (→ `operations/{notifications,reports,catalog/images,billing}`) uygulanmadı |
| 2.3 | İki logger | `utils/Logger.ts` (10 dosya kullanıyor: `getColoredPrefix`) ve `platform/core/logger` (16 dosya) | `utils/Logger` ANSI renkli önek üretiyor. Pino cephesine göç F-06 ile birlikte yapılmalı |
| 2.4 | `utils/decorator/cache.ts` (309 satır) süreç-içi önbellek, metrik köprüsü ve geçersiz kılma kaydı içeriyor | — | Yan etkili bir çalışma-anı bileşeni; `utils` (saf yardımcı) seviyesinde durmamalı. Hedef: `platform/runtime/cache/`. İçerik bulguları F-05'te |
| 2.5 | Zamanlayıcı sarmalayıcıları: 10 ince `*Scheduler.ts` dosyası (toplam 490 satır). Her biri `scheduleJob`'u tek bir iş için çağırıyor ve `entegrasyonik.ts` içinde tek tek `.start()` ediliyor | `operations/stock/*Scheduler.ts` ×4, `operations/billing/TrialExpiryScheduler.ts`, `integration/compliance/{Probe,SourceMonitor}Scheduler.ts`, `integration/config/ConfigHeadPollScheduler.ts`, `integration/engine/catalog/export/ExportSignalPollScheduler.ts`, `platform/runtime/metrics/MetricsFlushScheduler.ts` | ADR-0016 §1.3 kararı "`*Scheduler.ts` silinir, `bootstrap/schedules.ts` tek kayıt" henüz uygulanmadı |
| 2.6 | `IntegrationEventBus` `integration/engine` altında ama `operations` tarafından da kullanılıyor | `operations/stock/StockPublishTrigger.ts:4` | ADR-0016 hedefi `platform/runtime/events/` |
| 2.7 | `src/` kökünde `Webserver.ts` ve `Constants.ts` | — | Hedef: `api/http/Webserver.ts` (veya ADR-0016'daki `bootstrap/http.ts`) ve `config/constants.ts` |

---

## 3. Veritabanı yönetimi ve instance yaşam döngüsü

### 3.1 Bağlantı modeli (mevcut)

- **ApplicationDB:** singleton. `Database.getInstance` → `mongoose.createConnection(DB_URL…)`, `maxPoolSize = DB_POOL_SIZE` (varsayılan **20**, `config/env.ts:152`).
- **ClientDB:** tenant başına **ayrı** `mongoose.createConnection`. Bu, ayrı bir MongoClient demek: ayrı havuz, ayrı sunucu izleme (monitoring) soketleri.
  - `maxPoolSize = Clients.dbConfig.poolsize || DB_POOL_SIZE || 20` (`database/tenantConnection.ts:38`, `operations/tenant/tenantInfraDefaults.ts:15` → 20).
  - Canlı örnekler iki yapıda tutuluyor: `instances` sözlüğü ve `LRUCache(max 100)` (`database/client/ClientDB.ts:10-24`).
- **Kimlik bilgileri tek:** ADR-0003'ten beri tüm tenant bağlantıları **aynı** `DB_URL/DB_USER/DB_PASSWORD` ile kuruluyor, yalnızca DB adı değişiyor.

### 3.2 Bulgular

| ID | Bulgu | Kanıt | Etki |
|---|---|---|---|
| DB-1 | Her RPC'de tenant kaydı DB'den okunuyor. `ClientDB` zaten önbellekte olsa bile `getClientDB` önce `Clients.findOne({order})` çalıştırıyor. Önbellek anahtarı `client._id`, arama anahtarı `order`; bu yüzden kayıt okunmadan önbelleğe ulaşılamıyor | `DatabaseManager.ts:52-61`, `ClientDB.ts:29-37` | RPC başına 3 ApplicationDB okuması (authenticate 2 + BaseApi 1). `ConfigurationService.get` → 10 |
| DB-2 | Tenant başına ayrı havuz ve izleme soketleri. 3 düğümlü replica set'te her MongoClient'ın düğüm başına izleme bağlantısı var. `web` + `worker` iki süreçte `(1 + N_tenant) × (izleme + havuz)`. Havuz üst sınırı tenant başına 20 | `Database.ts:47-50`, `tenantConnection.ts:38` | Tek haneli tenant ölçeğinde çalışıyor. Ancak bağlantı sayısı tenant sayısıyla doğrusal artıyor (Atlas katman bağlantı sınırları). Her yeni tenant ilk istekte TLS + auth el sıkışması ödüyor. Tenant başına `poolsize` ezmesi fiilen hep 20 |
| DB-3 | LRU tahliyesi bağlantıyı, uçuşta sorgu olup olmadığına bakmadan kapatıyor (`dispose → database.close()`). Aynı tenant'ı kullanan eşzamanlı istek `MongoNotConnectedError` alabilir | `ClientDB.ts:13-22` | Yalnızca 100'den fazla aktif tenant olduğunda tetikleniyor. Bugün teorik, ama tasarımda doğrudan bir kusur |
| DB-4 | Çift kayıt tutma (`instances` + `cache` + `initPromises`), iki ayrı temizlik yolu ve `invalidate`'te el ile senkronizasyon | `ClientDB.ts:10-67,113-117` | Karmaşıklık, çözdüğü soruna göre fazla |
| DB-5 | `closeAllConnections`: (a) `ApplicationDB.getInstance(config)` çağırıyor; kapanışta henüz bağlanmamışsa **yeni bağlantı açar**. (b) Sabit 1 sn `setTimeout` bekliyor. (c) `ClientDB.cache.clear()` kapanışları beklemiyor (`close().catch()` ateşle-unut) | `DatabaseManager.ts:30-49` | Kapanış belirsiz. Bağlantılar kapanmadan `process.exit` olabilir |
| DB-6 | `Database.connect`: `connected` gelmeden `error` gelirse reject ediliyor. Bağlandıktan sonra gelen `error` ise yalnızca loglanıyor (doğru). `mongoose.createConnection(...).asPromise()` aynı işi daha az kodla yapar. Model derleme (`getModels`) bağlantı başına 26 (tenant) / 33 (app) model | `Database.ts:52-68`, `ClientMongooseSchemas.ts` | Küçük. Tek havuz modeline geçişte sadeleşir |
| DB-7 | `ClientDB`/`ApplicationDB` içinde 31 + 33 elle yazılmış `getXModel()` erişimcisi ve `IClientDB`/`IApplicationDB` arayüz kopyası var | `ClientDB.ts:77-107`, `ApplicationDB.ts:62-106` | Boilerplate ama tip ve okunabilirlik veriyor, zarar vermiyor. **Değiştirilmemeli.** Repository katmanı geldikçe handler'dan kaybolacak |
| DB-8 | `database/index.ts` yalnızca `DatabaseManager`'ı yeniden dışa aktarıyor. Engine'de 9 dosya `@database/index`'ten, diğerleri `@database/DatabaseManager`'dan içe aktarıyor | — | İki yol var, biri seçilmeli (kozmetik) |

### 3.3 Singleton / instance yaşam döngüsü

| Bileşen | Desen | Bulgu |
|---|---|---|
| `Webserver` | `static getInstance()` | Sorun yok |
| `IntegrationEngine` | statik `start()` + `setInterval` (`IntegrationEngine.ts:41`), `OrderOrchestrator.ts:73` `setInterval` | Durdurma yolu yok (ADR-0006 bilinen sınırlaması, integration audit F-10/C14) |
| `platform/runtime/scheduler` | `scheduleJob` + `stopAllJobs()` | **`stopAllJobs` hiçbir yerden çağrılmıyor** (knip: kullanılmayan export, `scheduler/index.ts:73`). `gracefulShutdown` 10 zamanlayıcıyı durdurmuyor; DB kapanırken iş turları devam edebilir (`entegrasyonik.ts:71-110`) |
| `IntegrationFactory` | Statik `instanceCache` + 5 dk toplu temizleme | F-13'te (integration audit) |
| API servisleri | İstek başına `new` + `init` | Bu desen doğru (istek kapsamlı nesne). Pahalı olan `init` içindeki DB okuması (DB-1) |
| `storageService`, `RedisService`, `DatabaseManagerInstance` | Modül düzeyi singleton | Altyapı için makul. Sorun başlangıç enjeksiyonu (2.1) |

---

## 4. Kullanılmayan kod (kanıtlı)

**Yöntem:**
- knip çıktısı tek başına kabul edilmedi.
- Servis metotları, RPC kaydıyla (198 bağ + 6 ImageApi hedefi), dosya içi çağrılarla, `src/**` içindeki `.<ad>(` çağrılarıyla ve FE'nin `restApi.post("Servis/op")` kullanımlarıyla çapraz kontrol edildi.
- Kayıtta olan ya da FE'nin çağırdığı metotlar ölü sayılmadı. `get()` gibi `IService` sözleşme metotları ayrı sınıfta tutuldu.

### 4.1 Silinebilir dosyalar

| Dosya | Neden ölü | Silme riski |
|---|---|---|
| `src/database/client/models/Settlement.ts` + `src/interfaces/settlement/index.ts` | `ClientMongooseSchemas`'ta kayıtlı değil. Başka içe aktaranı yok (knip). ADR-0016 §7 sıra 2'de silme onaylı | Yok. İndeks manifestinde de yok |
| `src/utils/LifecycleManager.ts` | 0 içe aktaran (knip). ADR-0016 §7'de onaylı | Yok |
| `src/operations/catalog/CatalogOperations.ts` | 0 içe aktaran. **Dikkat:** 4 serviste 28 yerde `@InvalidatesTenantCache(…,'CatalogOperations')` dizgesi var (attributeMapping, brand, category, choice) ve `utils/decorator/cache.ts` bu adı biliyor | Düşük. Dizgeler aynı commit'te kaldırılmalı; kalırsa no-op geçersiz kılma olarak kalırlar |
| **KORUNUR:** `src/api/services/ecommerce-service.ts` | Kayıtsız, ama FE `IdeasoftComponent.vue:188` ve `integrationStore.ts:48` çağırıyor (bugün 403) | ADR-0016 §7 sıra 5: C10 kararına kadar dokunulmaz |

### 4.2 RPC ile erişilemeyen, iç çağıranı olmayan servis metotları (14 ölü + 1 görünürlük düzeltmesi)

| Metot | Konum | Not |
|---|---|---|
| `IntegrationService.saveOrUpdateIntegrationCategory` | `integration-service.ts:351` (18 satır) | FE karşılığı `AttributeMappingService/saveCategoryMapping` |
| `IntegrationService.retrievePlatformProcesses` | `:391` (15) | — |
| `IntegrationService.retrieveOrders` + `retrieveOrdersFromIntegration` | `:1438` (8) + `:1448` (10) | İkisi de kayıtsız. `:1453`'teki `integration.retrieveOrders()` ve `OrderWorker`'daki çağrı adaptör metoduna gidiyor, bu servis metoduna değil. İkisi birlikte ölü |
| `ChoiceService.saveIntegration` | `choice-service.ts:27` (13) | — |
| `CategoryService.saveIntegrationCategory` | `category-service.ts:59` (11) | FE'deki aynı adlı fonksiyon `AttributeMappingService`'i çağırıyor. Karakterizasyon testi var (`CategoryService.characterization.test.ts:141`); test bloğu da silinir |
| `VariantService.constructMatchQuery` | `variant-service.ts:68` (50) | ProductService'in aynı adlı metodu ayrı ve canlı |
| `VariantService.generateVariantId` | `:221` (9) | Karakterizasyon testi var (`VariantService.characterization.test.ts:289`) |
| `VariantService.updateVariant` | `:383` (21) | FE'deki `updateVariant` bir emit olayı, RPC değil |
| `ProductService.getIntegrations` | `product-service.ts:60` (13) | Test bloğu var (`ProductService.characterization.test.ts:64`) |
| `ImageService.getProduct` | `image-service.ts:44` (12) | Test bloğu var |
| `ImageService.getIntegrations` | `image-service.ts:30` (13) | Test bloğu var |
| `TicketService.getNextSequenceValue` | `ticket-service.ts:183` (public, yalnızca dosya içinden çağrılıyor) | Ölü değil: `private` yapılmalı |
| `OrderService.updateOrderStatus` | `order-service.ts:478` (15) | **Kasıtlı kayıtsız** (güvensiz, ADR-0004 tahsis akışını atlıyor). `policy-and-idor.test.ts:45,81` 403 bekliyor; metot silinse de test geçer |
| `ClaimService.updateClaimStatus` | `claim-service.ts:338` (25) | Aynı durum. `capabilities/domains/claims.ts:2` yorumu var olmayan `DELIBERATELY_UNREGISTERED`'a atıf yapıyor (bayat yorum) |

Ek olarak: RPC ile çağrılamayan ve dahili çağıranı olmayan `get()` gövdeleri (Product, Image, Account, Audit, Billing, Customer, Invoice, Message, Security, Setting, Shipment, Smart, Stock, TenantData, Ticket, User, Variant). Bunlar `IService.get?` isteğe bağlı sözleşmesi için tutuluyor. `IService`'ten `get` kaldırılırsa hepsi silinebilir. P2, düşük değerli.

### 4.3 Kullanılmayan export'lar (knip 57 + 41 tip + 9 enum üyesi)

- **Gerçekten ölü değerler (~15):**
  - `IMAGE_API_ROUTES_WITHOUT_BACKEND` (`api/operationPolicy.ts:51`)
  - `isLegacyInput`, `rpcs` (`capabilities/define.ts:16,51`)
  - `RESILIENCE_INTEGRATION_CODES` (`integration/config/catalog/integrationHttp.ts:124`)
  - `CONFIG_LAYER_ORDER` (`integration/config/ConfigResolver.ts:96`)
  - `settingSchemas` (`integration/config/types.ts:85`)
  - `PRODUCT_URL_UNCHANGED_KEYS` (`trendyol/api/productUrls.ts:42`)
  - `TERMINAL_ALLOCATION_STATES` (`interfaces/stock/index.ts:11`)
  - `getConfiguredEnv` (`services/billing/PaymentProviderFactory.ts:21`)
  - `SOURCE_SNAPSHOT_MAX_DIFF_CHARS`, `__SeriesEntryShape`
  - Yer tutucular `a` (`interfaces/platforms/erp/index.ts:1`) ve `b` (`interfaces/platforms/ecommerce/index.ts:1`)
  - Yapılacak iş: dosya içinde kullanılıyorsa `export` kaldırılır, kullanılmıyorsa silinir.
- **Yanlış pozitif:**
  - `listSettingsByGroup`: `dev-tools/*.js` `dist/` üzerinden kullanıyor, knip çözemiyor.
  - `DOMAINS/STAGES/NOT_EXPOSED_REASONS/CAPABILITY_BY_ID`: tip türetme ve kayıt belgesi (ADR-0019).
  - `platform/runtime/{metrics,scheduler}/index.ts` barrel'larındaki `…ForTests` ve tip yeniden dışa aktarımları.
  - Barrel'lar için: testlerin doğrudan dosyadan içe aktardığı yeniden dışa aktarımlar barrel'dan kaldırılır, fonksiyonların kendisi kalır.
- **Bağlanması gereken (silinmez):** `stopAllJobs` (§3.3).
- **Çift export:** `Message.ts` (`default` + `MessageSchema`), `hepsiburada/services/Service.ts`, `cache.ts` (`getCacheMetrics` / `snapshot`).

---

## 5. Klasör yapısı

Mevcut ağaç katmanlı (layered), alt klasörleri kısmen alan (domain) bazlı. ADR-0016 §1.1 hedefi "katmanlı + katman içinde alan alt klasörleri" (hibrit). Bu inceleme o hedefi **değiştirmiyor**. Yalnızca bugünkü sapmalar ve göç sırası ADR-0024'te somutlaşıyor.

| Mevcut | Sapma |
|---|---|
| `src/api/*.ts` (25 düz dosya: http middleware, rpc çekirdeği, webhook'lar, dosya rotaları, DTO'lar, crypto yardımcıları bir arada) | ADR-0016 `api/{http,rpc,webhooks,files}` ayrımı yapılmadı |
| `src/api/services/*-service.ts` | "services" adı `src/services/` (altyapı) ile çakışıyor. Hedef: `api/rpc/handlers/` |
| `api/{integrationSecrets,responseSanitizer,tenantSettingsGuard}.ts`, `utils/{FieldCrypto,secretKeys}.ts` | Alt katmanlar tarafından kullanılıyor → `platform/core/crypto/` |
| `platform/rateLimit/` | `api/rateLimit`'e bağımlı. `createRateLimiter`, `platform/http/` gibi bir alt seviyede olmalı |
| `utils/decorator/cache.ts`, `utils/Logger.ts`, `utils/mongoLease.ts` | Yan etkili çalışma-anı parçaları → `platform/runtime/*`, `platform/core/logger` |
| `operations/client/` | `ClientOperations` dağıtılır. `StatsOperations` → `operations/reports` |
| `integration/engine/order/*Repository.ts` (6) | API ile ortak → `database/repositories/tenant/` |
| `src/Webserver.ts`, `src/Constants.ts` kökte; `bootstrap/` yok | `entegrasyonik.ts` 244 satır: rol, 10 zamanlayıcı, kapanış |

**Test bağımlılığı (taşımanın maliyeti):**
- 74 test dosyası `src/api/*` yollarını göreli olarak içe aktarıyor. En çok kullanılanlar: `operationPolicy` 27, `index` 26, `RunOperation` 25, `ApiManager` 16, `authenticate` 15.
- 14 `jest.mock(... api/...)` çağrısı var.
- **Yeniden-dışa-aktarma (shim) kısmi bir çözüm.** İçe aktarmaları çalışır tutar, ama `jest.mock('eski/yol')` yeni yolu içe aktaran üretim kodunu **yakalamaz**. Test sessizce gerçek modülü kullanmaya başlar ve zayıflar. Bu yüzden taşımada `jest.mock` dizgeleri de kod dönüştürücüyle (codemod) aynı commit'te güncellenmeli ve "shim'e `jest.mock` yok" statik testi eklenmeli (ADR-0024 §Göç).

---

## 6. Bulgular tablosu

| ID | Şiddet | Başlık | Kanıt | Öneri | Boyut | Risk |
|---|---|---|---|---|---|---|
| BA-01 | P1 | RPC başına tekrarlı ApplicationDB okuması (3; `ConfigurationService.get` 10) | `DatabaseManager.ts:52-61`, `BaseApi.ts:17-33`, `authenticate.ts:85,112`, `configuration-service.ts:20-36` | `database/TenantRegistry.ts` (LRU, TTL 30 sn, askı/silmede invalidate; ADR-0016 §5.2). `BaseApi` bağlamı paylaşılabilir (`sibling()`). Merkezi `Users` okuması önbelleğe **alınmaz** | M | Düşük. Askı durumu diğer pod'da ≤30 sn gecikir (ADR-0016'da kabul edildi) |
| BA-02 | P1 | Tenant başına ayrı MongoClient ve havuz (20); tahliyede uçuştaki sorgu kopabilir; çift kayıt | `ClientDB.ts:10-67`, `Database.ts:47-50`, `tenantConnection.ts:38`, `env.ts:152` | Tek MongoClient + `connection.useDb(dbname, {useCache:true})` (ADR-0024 D2). Tahliye/kapama kalkar | M | Orta. Bağlantı katmanı; `tests/mongo-semantics` (bellek-içi Mongo) ile doğrulanır |
| BA-03 | P1 | Kapanış eksik: 10 zamanlayıcı durdurulmuyor (`stopAllJobs` bağlı değil); `closeAllConnections` kapanışta bağlantı açabilir, sabit 1 sn uyku, dispose beklenmiyor | `entegrasyonik.ts:71-110`, `platform/runtime/scheduler/index.ts:73`, `DatabaseManager.ts:30-49` | `bootstrap/shutdown.ts`: `beginShutdown` → http close → `stopAllJobs` → BullMQ close → `db.close()` (tek istemci) → redis quit. Uyku kaldırılır | S | Düşük |
| BA-04 | P1 | Katman ihlalleri: 18 depcruise uyarısı + kural kapsamı dışında 4 kenar + 3 çıplak `src/` içe aktarma; kurallar `warn` | §1.5 | `ApplicationError` → `platform/core/errors`; `integrationSecrets/responseSanitizer/tenantSettingsGuard` → `platform/core/crypto`; `createRateLimiter/getClientIp` → `platform/http`; `IntegrationEventBus` → `platform/runtime/events`; `TenantLifecycleService`'e `OrderQueueProducer` kurucu parametresiyle verilir; eksik kurallar eklenir; sıfıra inen kural `error` olur | M | Düşük. Mekanik, derleyici yakalar |
| BA-05 | P1 | Tanrı sınıflar ve handler'da doğrudan model erişimi (297) | §1.2 | ADR-0016 B-R15/B-R16: `IntegrationService` 5 parçaya ayrılır (RPC adları aynı); diğerleri alan başına `operations/<alan>` + `database/repositories`. Mandallar: handler satırı ≤ 400 (cephe), `getXModel()` sayısı artamaz | L | Orta. Karakterizasyon testleri var (B-R-T1..T4 tamamlandı) |
| BA-06 | P1 | `BaseApi`: tipli bağlam yok, `request:any`, yanlış hata kodu (tenant yok → 500), 14 gereksiz kurucu | §1.4 | `RpcContext { tenantId, actor, input, requestMeta }`, tembel (lazy) `clientDB`, `NOT_FOUND/TENANT_REQUIRED` `ApplicationError`. `this.request` geçiş süresince korunur | M | Düşük. Sınıf adları ve RPC sözleşmesi değişmez |
| BA-07 | P2 | Bileşim kökü yok: `ClientOperations` enjeksiyonu, 10 `*Scheduler.ts`, 244 satırlık `entegrasyonik.ts` | §2.1, §2.5 | `src/bootstrap/{schedules,shutdown,http,roles}.ts`; `*Scheduler.ts` silinir (iş tanımı kendi modülünde `defineJob` olarak kalır); `ClientOperations` dağıtılır | M | Düşük |
| BA-08 | P2 | Ölü kod: 3 dosya, 14 metot (~230 satır), ~15 export, 2 yer tutucu | §4 | Tek commit'lik silme paketleri (ADR-0016 §7 kapısı) | S | Düşük. Test blokları da silinir |
| BA-09 | P2 | Tekrar: 10 `$facet` sayfalama, 87 bilgi eklemeyen `catch`, 73 `console` (api) | §1.3 | `database/repositories/_shared/paginate.ts` (`facetPage`) + `parseListQuery`. Silme alan paketleriyle birlikte yapılır. `console` ratchet'i (F-06) | M | Düşük |
| BA-10 | P2 | Hata semantiği tutarsız (`Error` 63 / `ApplicationError` 82) | §1.3 | Kural: kullanıcıya ait durum → `ApplicationError` (4xx); iç durum → `Error`/`AppError` (500). Alan paketlerinde uygulanır | S (her paket için) | Düşük. FE metin bağımlılığı karakterizasyon testleriyle kontrol edilir |
| BA-11 | P2 | İki logger (`utils/Logger` + platform) | §2.3 | `getColoredPrefix` → `logger.child({module})`; F-06 ile birlikte | S | Düşük |
| BA-12 | P2 | Döngüler: `interfaces` barrel (2), `metrics/errorEvents ↔ prodDeps` (1) | depcruise | `import type` ve bağımlılığı tersine çevirme | S | Yok |
| BA-13 | P2 | Taşımada test kırılganlığı: 74 dosya + 14 `jest.mock` göreli yol | §5 | Kod dönüştürücü (codemod) + `jest.mock` dizgelerinin güncellenmesi + statik test; taşıma tek başına, dondurulmuş pencerede | — | Orta (yalnızca taşıma adımında) |
| BA-14 | P2 | Kasıtlı kayıtsız güvensiz metotlar kodda duruyor | §4.2 | Sil (403 testi kayıt düzeyinde kalır) ya da ADR-0004 tahsis akışıyla güvenli sürümü yazılana dek `private` + yorum. Varsayılan: sil | S | Yok |
| BA-15 | P2 | Faz 3 çıkış kapıları ölçülmüyor | `quality/` | `quality/check-ratchets.js`'e handler satır sayısı, handler `getXModel()` sayısı, depcruise ihlal sayısı eklenir | S | Yok |

**Değiştirilmemesi önerilenler:** `DB-7` (tipli model erişimcileri), `ApiWrapper`/`RunOperation` güvenlik zinciri, istek başına handler örneği deseni, DB-per-tenant modeli (ADR-0003/0013), RPC sözleşmesi, sınıf adları.

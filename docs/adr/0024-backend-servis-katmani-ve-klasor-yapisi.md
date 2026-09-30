# 0024 — Backend Servis Katmanı, Veritabanı Bağlantı Modeli ve Klasör Yapısı (ADR-0016 Faz 3'ün uygulama sözleşmesi)

## Durum
Kabul edildi (2026-09-30).

- **ADR-0016'nın yerini almaz, onu somutlaştırır.** Hedef ağaç (§1.1), katman yönü (§1.2) ve repository ilkesi (§5.1) aynen geçerli.
- **Tek bilinçli değişiklik:** ADR-0016 §5.2'nin `ClientDB` kısmı değişiyor. Önceki hüküm "tenant başına bağlantı + referans sayımı + `maxPoolSize` 5" idi. Yeni hüküm **tek MongoClient + `useDb`** (Karar D2). `TenantRegistry` (TTL 30 sn) kısmı aynen geçerli.
- **Hiçbir modül yeniden yazılmıyor.** Tüm adımlar karakterizasyon testleri üzerinden kademeli refaktör. Yeniden yazım kuralının iki koşulu hiçbir modül için birlikte sağlanmadı.

## Bağlam

**Tetikleyici:** `docs/audits/BACKEND_ARCHITECTURE_REVIEW_2026-09-30.md` (BA-01 … BA-15). Proje sahibi servis yapısı, base API, ortak servisler, DB yönetimi, instance oluşturma, ölü kod ve klasör yapısının "olması gerektiği şekliyle" düzenlenmesini istedi.

**Özet durum (ölçülmüş, `faz4-integration` @ `ff9df2c`):**
- **Servis katmanı:**
  - 33 RPC servis sınıfı (~9.500 satır). Handler içinde 297 doğrudan `getXModel()` çağrısı.
  - `IntegrationService` 1.519 satır, 5 ayrı sorumluluk taşıyor.
  - `BaseApi`'de tipli bağlam yok; her `init()` bir `Clients.findOne` yapıyor.
- **DB okuma maliyeti:** RPC başına 3 ApplicationDB okuması, `ConfigurationService.get`'te 10.
- **Bağlantı modeli:** Tenant başına ayrı MongoClient (havuz 20 + izleme soketleri). LRU tahliyesi uçuşta sorgu varken bağlantıyı kapatabiliyor.
- **Kapanış:** 10 zamanlayıcı kapanışta durdurulmuyor (`stopAllJobs` hiç çağrılmıyor). `closeAllConnections` kapanış sırasında yeni bağlantı açabiliyor.
- **Katman ihlalleri:** 18 depcruise uyarısı (kurallar `warn`) + kural kapsamı dışında 4 kenar + 3 çıplak `src/` içe aktarma.
- **Ölü kod:** 3 dosya, 14 servis metodu (~230 satır), ~15 export.
- **ADR-0016 Faz 3 (B-R13 … B-R18) başlamadı:** `api/` düz, `database/repositories` yok, `TenantRegistry` yok, `bootstrap/` yok.
- **Test bağımlılığı:** 74 test dosyası `src/api/*` yollarına göreli olarak bağlı; 14 `jest.mock` var.

İlgili: ADR-0003 (tenant sırları, DB-per-tenant, tek uygulama DB kullanıcısı), ADR-0019 (yetenek kaydı), ADR-0021 (şema), ADR-0023 (RPC girdi şeması, `RunOperation` tek nokta), `BACKEND_INTEGRATION_AUDIT_2026-09-30.md` (F-05 cache, F-06 log, F-10 durdurma bayrağı, F-13 IntegrationFactory).

## Değerlendirilen Alternatifler

### A. Klasör yapısı yönü
1. **Dikey dilimler:** `src/modules/<alan>/{handler,usecase,repo,schema}`, katmansız.
   - Artı: Alan kodu tek yerde durur.
   - Eksi: Mevcut 11 alias'ın ve depcruise kurallarının anlamını bozar. Tüm testlerin yolları değişir (74 + 14 mock). Adaptör ve motor gibi alan-dışı kod yine ayrı ağaç ister. ADR-0016 zaten reddetmişti.
   - Bu ölçekte (1 geliştirici + ajanlar, tek haneli tenant) büyük patlama riski getirir.
2. **Katmanlı + katman içinde alan alt klasörleri (ADR-0016 §1.1, hibrit).**
   - Artı: Alias ve katman kuralları korunur. Adım adım taşınabilir.
   - Eksi: Bir alanın kodu 3-4 klasöre yayılır (`api/rpc/handlers`, `operations/<alan>`, `database/repositories/tenant`).
   - **Seçildi.**
3. **Hiçbir şeyi taşımamak, yalnızca kod içi refaktör yapmak.**
   - Artı: Sıfır taşıma maliyeti.
   - Eksi: `api/` karmaşası ve `services` ad çakışması kalır. Katman kuralları dosya yolundan zorlanamaz (`platform/core/crypto` gibi alt seviye bir yer olmadan ters bağımlılık çözülemez).

### B. Tenant bağlantı modeli
1. **Bugünkü model:** Tenant başına `createConnection` + LRU(100) + kapatma. Tahliye yarışı ve bağlantı sayısının tenant sayısıyla doğrusal artması sürer.
2. **ADR-0016 §5.2:** Tenant başına bağlantı + referans sayımı + 60 sn gecikmeli kapatma + havuz 5.
   - Artı: İzolasyon ve tenant başına havuz ezmesi korunur.
   - Eksi: Referans sayımı her sorgu yoluna sarmalayıcı ister (Mongoose modeli doğrudan kullanılıyor, sayım delinir). İzleme soketleri yine tenant başına. Karmaşıklık artar.
3. **Tek MongoClient + `connection.useDb(dbname, { useCache: true })`:** Tüm tenant DB'leri tek havuzu ve tek izleme setini paylaşır.
   - Artı: Tahliye/kapama tamamen kalkar. Bağlantı sayısı tenant sayısından bağımsız olur. İlk istekte el sıkışma maliyeti yok. Kapanış tek `close()` çağrısı.
   - Eksi: Tenant başına havuz ezmesi kaybolur (bugün fiilen hep 20). Gürültülü bir tenant ortak havuzu doldurabilir. Tenant başına farklı kimlik bilgisi desteklenmez (ADR-0003'ten beri zaten yok).
   - **Seçildi.**

### C. Handler bağlamı
1. `this.request` + `this.clientId` olduğu gibi kalır. Tipsiz; sunucu alanlarıyla doğrulanmış girdi karışık kalır.
2. **`BaseApi` üzerinde tipli `RpcContext` + tembel (lazy) DB tutamaçları.** Kurucu imzası aynı kalır (`MicroserviceWrapper` değişmez), `this.request` geçiş süresince korunur. **Seçildi.**
3. DI konteyneri (tsyringe/inversify): ADR-0016 §1.4 reddetti. Bu ölçekte gereksiz.

## Karar

Backend, ADR-0016'nın hibrit katmanlı hedef ağacına **küçük, her biri derlenen ve testleri yeşil kalan adımlarla** taşınır. Bu ADR yedi somut karar ekler:

- **D1 — Tenant kayıt önbelleği (ADR-0016 §5.2 aynen):**
  - `database/TenantRegistry.ts`: `lru-cache`, TTL 30 sn, anahtar `order`. Değer `{ status, dbname, _id }`.
  - `authenticate` ve `BaseApi` buradan okur.
  - Askı ve silme işlemleri aynı pod'da anında `invalidate` çağırır: `TenantLifecycleService`, `AdminService` durum değişimi, purge.
  - Merkezi `Users` okuması önbelleğe **alınmaz** (ADR-0001 tokenVersion).
  - Hedef: RPC başına ApplicationDB okuması 3 → 1 (yalnızca `Users`).
- **D2 — Tek MongoClient + `useDb` (ADR-0016 §5.2'nin `ClientDB` kısmının yerine geçer):**
  - `Database`: süreç başına **tek** kök bağlantı. `mongoose.createConnection(DB_URL).asPromise()`, `maxPoolSize = DB_POOL_SIZE` (varsayılan 20 kalır), `maxIdleTimeMS: 60000`, `waitQueueTimeoutMS: 10000`.
  - `ApplicationDB` bu kökün uygulama DB'si.
  - `ClientDB.getInstance(dbname)` → `root.useDb(dbname, { useCache: true })`. Modeller türetilmiş bağlantıda bir kez derlenir. `Map<dbname, ClientDB>` tutulur; LRU, `dispose`, `instances` ve `initPromises` kalkar.
  - `dropDatabase` türetilmiş bağlantıda çalışır. `invalidate` yalnızca `Map`'ten siler.
  - `ping` kök bağlantıda çalışır.
  - `Clients.dbConfig.poolsize` **okunmaz** (alan şemada kalır; DB'ye dokunulmaz).
  - DB-per-tenant modeli (ADR-0003/0013) ve `isValidTenantDbName` aynen kalır.
- **D3 — Handler bağlamı (`BaseApi`):**
  - Yeni alanlar: `protected ctx: RpcContext { tenantId?: number; actor: { userId, tier, platformAdmin }; input: <ADR-0023 zod çıktısı veya ham gövde>; requestMeta }`.
  - `clientDB` tembel erişimci olur; tenant gerekmeyen handler DB açmaz.
  - `init()` artık ne yapar:
    - Tenant yoksa `ApplicationError('…', 404, 'NOT_FOUND')` fırlatır (bugün 500).
    - Tenant gerektiren handler'da `tenantId` yoksa `ApplicationError(…, 400, 'TENANT_REQUIRED')` fırlatır.
    - Hata kodu katalogda yoksa `ERROR_CODES`'a eklenir.
  - `protected sibling<T>(Cls): T`: Handler'dan handler kurarken DB tutamaçlarını ve bağlamı kopyalar, `init` tekrar çalışmaz (`ConfigurationService`).
  - Kurucu imzası ve sınıf adları **değişmez**. `this.request` kaldırılmaz, yeni kod `this.ctx.input` kullanır.
- **D4 — Katman sözleşmesi:**
  - **Taşınan alt seviye parçalar:**
    - `ApplicationError` → `platform/core/errors` (`api/Security` yeniden dışa aktarır).
    - `integrationSecrets`, `responseSanitizer`, `tenantSettingsGuard`, `FieldCrypto`, `secretKeys` → `platform/core/crypto/`.
    - `createRateLimiter`, `getClientIp` → `platform/http/`.
    - `IntegrationEventBus` → `platform/runtime/events/`.
    - `exportKey` → `services/storage/`.
    - `TenantLifecycleService` `OrderQueueProducer`'ı kurucu parametresiyle alır.
  - **`.dependency-cruiser.cjs`'e eklenen kurallar:**
    - `platform|services → api|operations|integration`
    - `operations → integration/engine`
    - `capabilities (invoke hariç) → api`
    - çıplak `^src/`
    - `api/rpc/handlers → database/(application|client)/models` (warn + taban çizgisi)
  - İhlal sayısı sıfıra inen kural **`error`** olur (mandal).
- **D5 — Bileşim kökü ve yaşam döngüsü:**
  - `src/bootstrap/{roles,schedules,shutdown,http}.ts` oluşturulur. `entegrasyonik.ts` yalnızca `bootstrap`'i çağırır; dosya adı değişmez.
  - `schedules.ts` 10 işin **tek** kaydıdır. İş tanımları kendi modüllerinde `defineJob` olarak kalır, 10 `*Scheduler.ts` sarmalayıcısı silinir.
  - `shutdown.ts` şu sırayı uygular: `beginShutdown` → HTTP kapanışı → `stopAllJobs()` → BullMQ kapanışı → `IntegrationEngine.stop()` (varsa; F-10 ile gelir) → `DatabaseManager.close()` (tek kök bağlantı, `getInstance` çağrılmaz, uyku yok) → `RedisService.quit()`.
  - `ClientOperations` dağıtılır:
    - `getStorageConfig` → `services/storage` doğrudan `readStorageEnv`'i kullanır.
    - `saveNotification` → `operations/notifications` (tenant repository).
    - `NotificationService.init(...)` ve `storageService.initialize(...)` parametresiz olur.
- **D6 — Handler inceltme ve tekrarların birleşmesi (ADR-0016 B-R15/B-R16 aynen, sıra aşağıda):**
  - `database/repositories/_shared/paginate.ts` → `facetPage(model, match, { sort, page, limit, stages })` → `{ data, total }` ve `parseListQuery(input, defaults)` (`normalizePagination` + `sortBy` çözümleme). 10 `$facet` kopyası alan paketlerinde buna geçer.
  - Bilgi eklemeyen `catch (e) { throw e }` blokları, dokunulan dosyalarda silinir.
  - Hata kuralı: kullanıcıya ait durum `ApplicationError` (4xx); iç durum `Error`/`AppError` (500, ileti gizli).
  - `IntegrationService` şu parçalara bölünür. RPC adları ve yanıt biçimleri aynı kalır; cephe ≤ 300 satır olur.
    - `operations/integrations/{settings,stockPolicy,health}.ts`
    - `database/repositories/app/ExportJobRepository.ts` (`advancedSearchExportJobs` + `getExportJobs` tek `search`, MM-02)
    - `integration/engine/catalog/export/ExportBatchService.ts` (`batchCreator`/`internalProcessBatch`)
    - `operations/integrations/platformLookup.ts` (kategori/marka/nitelik vekil çağrıları)
- **D7 — Ölü kod:**
  - İnceleme §4.1'deki 3 dosya ve §4.2'deki 14 metot silinir (ilgili karakterizasyon test blokları da silinir).
  - §4.3'teki ~15 export ya silinir ya da `export` kaldırılır.
  - `ecommerce-service.ts` **korunur** (ADR-0016 §7 sıra 5, C10).
  - Kasıtlı kayıtsız güvensiz `updateOrderStatus`/`updateClaimStatus` silinir. 403 testleri kayıt düzeyinde geçmeye devam eder.
  - Silme sonrası `CLAUDE.md` "Path aliases" satırındaki `ClientOperations, CatalogOperations` örneği güncellenir. Bu, insan/orkestratör işidir; alt ajan `CLAUDE.md`'ye dokunmaz.

### Hedef klasör yapısı (bu ADR'nin tamamlanma noktası; ADR-0016 §1.1'in alt kümesi)

```
backend/
  entegrasyonik.ts                 yalnız bootstrap() (ad değişmez)
  src/
    bootstrap/                     roles.ts · schedules.ts (10 işin tek kaydı) · shutdown.ts · http.ts (eski src/Webserver.ts)
    config/                        env.ts, index.ts, constants.ts (eski src/Constants.ts)
    platform/
      core/                        errors/ (AppError, ApplicationError, codes) · logger/ · context/ · crypto/ (FieldCrypto, secretKeys,
                                   integrationSecrets, responseSanitizer, tenantSettingsGuard)
      http/                        rateLimit (createRateLimiter), clientIp  ← platform/rateLimit/globalRateLimit bunları kullanır
      runtime/                     scheduler/ · metrics/ · events/ (IntegrationEventBus) · cache/ (eski utils/decorator/cache.ts)
    capabilities/                  (değişmez; ADR-0019/0023)
    api/
      http/                        authenticate, originCheck, requestId, securityHeaders, clientLog
      rpc/                         ApiManager, RunOperation, ApiWrapper, BaseApi (+RpcContext), operationPolicy, requestValidation, index.ts (kayıt)
        handlers/                  <ad>-service.ts — bugünkü api/services, AYNI dosya ve sınıf adları
        dto/                       clientDto, profileDto, sessionResult
      webhooks/                    WebhookApiManager, BillingWebhookApiManager, MockCheckoutApiManager, webhookAuth
      files/                       ImageApiManager, ExportDownloadApiManager
    operations/<alan>/             account · tenant · billing · stock · integrations · orders · catalog · notifications · reports · support
    database/
      Database.ts                  tek kök bağlantı
      DatabaseManager.ts · TenantRegistry.ts · tenantConnection.ts · indexManifest.ts
      application/ · client/       şemalar/modeller (DEĞİŞMEZ)
      repositories/                _shared/paginate.ts · app/ · tenant/ (engine/order/*Repository buraya taşınır)
    services/                      yalnız altyapı: redis/ · storage/ · mail/ · audit/ · billing/ (ödeme sağlayıcı adaptörü)
    integration/                   (ADR-0016/0018/0020; bu ADR yalnız engine/order/*Repository'yi çıkarır)
    health/ · interfaces/ · utils/ (yalnız saf yardımcılar)
```

**Alias'lar:** Mevcut alias'lar korunur (`@api @services @operations @integration @database @interfaces @utils @config @platform @health`). `@capabilities` ve `@bootstrap` eklenir (tsconfig + jest `moduleNameMapper` + `tsconfig.build.json` + `tsc-alias`). `@api/*` kökü değişmediği için alias tanımı değişmez, yalnızca alt yollar değişir.

## Gerekçe

- **Maliyet bilinci (tek haneli tenant):**
  - D1 ve D2 ek servis ya da bağımlılık getirmez (`lru-cache` ve `mongoose` zaten var).
  - Kod siliyorlar: `ClientDB` ~60 satır azalır, referans sayımı hiç yazılmaz.
  - Ölçekten bağımsız fayda: her RPC'de 2 DB turu daha az, sabit bağlantı sayısı, yarış koşulu yok.
  - ADR-0016'nın referans sayımı bu ölçekte çözdüğü sorundan (100'den fazla tenant tahliyesi) daha pahalı. `useDb` aynı sorunu yapısal olarak ortadan kaldırıyor.
- **Hibrit ağaç:** Mevcut alias'ları, depcruise kurallarını ve ADR-0016 kararını korur. Taşıma mekaniktir ve kod dönüştürücüyle (codemod) yapılabilir. Tek tek her adım geri alınabilir (`git revert`).
- **Bağlam nesnesi:** ADR-0019 "tek yürütücü" ilkesinin (RPC, MCP, iş ve ajan aynı use-case'i çağırır) ön koşulu: use-case `this.request`'e değil, `ctx`'ye bağlıdır.
- **Neden yeniden yazım değil:**
  - `IntegrationService` dahil tüm servislerde karakterizasyon testleri var (B-R-T1 … T4).
  - Sorun çürüme değil, yerleşim ve büyüklük. Bölme cephe korunarak yapılır.

## Maliyet/Ölçek Notu

- **Ek maliyet:** Yok (yeni servis, bağımlılık ya da ücretli katman yok). Tek seferlik iş ~12-16 ajan-günü (aşağıdaki paketler, paralel).
- **Tek havuz riski:** Uzun süren bir içe aktarma, `all` rolünde web isteklerini havuz kuyruğunda bekletebilir.
  - Hafifletme: `web` ve `worker` ayrı süreçlerde çalışır (ADR-0006 APP_ROLE, ayrı havuz). `waitQueueTimeoutMS` 10 sn olduğu için sonsuz bekleme yok.
  - Havuz bekleme metriği eklenir: sürücü CMAP olayları `connectionCheckOutStarted`/`connectionCheckedOut` → `platform/runtime/metrics` `db_pool_wait_ms` histogramı.
- **Yeniden değerlendirme eşikleri (sayısal):**
  - `db_pool_wait_ms` p95 bir haftalık pencerede **> 100 ms** ise ya da havuz kuyruk zaman aşımı günde **> 0** ise: önce `DB_POOL_SIZE` 20 → 40. Tekrarlarsa `worker` için ayrı bir kök bağlantı (rol başına havuz). Ancak o da yetmezse tenant başına istemci (Alternatif B2).
  - Süreç başına aktif tenant **> 200** ise ya da `useDb` önbelleğinin bellek maliyeti **> 50 MB** ise: `Map` → LRU (yalnızca sarmalayıcı nesnesini atar, bağlantıyı kapatmaz).
  - Tek bir tenant'a ayrı küme ya da kimlik bilgisi gerekirse (kurumsal müşteri, KVKK sözleşmesi): o tenant için `dbConfig.cluster` alanıyla ayrı istemci. Bu durumda ADR-0003 güncellenir.
  - `TenantRegistry` TTL'i: askı sonrası erişimin **30 sn**'den uzun sürmesi kabul edilemez hale gelirse, Redis pub/sub ile invalidate (Redis zaten var).
  - Handler cephesi **> 400 satır** olursa ya da handler `getXModel()` sayısı artarsa: `npm run ratchet` kırılır (mandal).

## Etki Alanı

`backend/entegrasyonik.ts`, `src/bootstrap/**` (yeni), `src/api/**` (taşıma + `BaseApi`), `src/database/{Database,DatabaseManager,TenantRegistry,client/ClientDB,application/ApplicationDB}.ts`, `src/database/repositories/**` (yeni), `src/platform/{core/crypto,http,runtime/events,runtime/cache}/**` (yeni/taşınan), `src/operations/**` (içe aktarma ve yeni alan dosyaları), `src/services/{storage,notification}/**`, `src/operations/client/**` (dağıtılır), 10 `*Scheduler.ts` (silinir), `.dependency-cruiser.cjs`, `quality/{baseline.json,check-ratchets.js}`, `tsconfig*.json` + `jest.config.js` (yalnızca iki yeni alias), `tests/**` (içe aktarma yolları). FE ve RPC sözleşmesi **değişmez**. DB'ye dokunan adım **yok** (`poolsize` alanı yalnızca okunmaz hale gelir; göç yok).

---

## Göç planı

**Genel kurallar:**
- Her adım ayrı commit'tir ve `git revert` ile geri alınabilir.
- Her adımın sonunda **ortak kapı** çalışır: `npm run typecheck && npm run lint && npm run depcruise && npm run test:all && npm run ratchet` (backend dizininde; ayrıntı `docs/TESTING.md`). Paket içi hızlı döngü için paketin kendi `test:module` komutları kullanılır.
- Taşıma içeren adımlar ayrıca `npm run build` çalıştırır (tsc-alias çıktısı).

**Taşıma kuralı (BA-13):**
- Dosya taşımaları kod dönüştürücüyle (ts-morph ya da `jscodeshift`, `dev-tools/codemods/move-module.js`) yapılır. Dönüştürücü şunları **aynı commit'te** günceller: `src/**` ve `tests/**` içindeki `import`/`require` yolları, **`jest.mock('<yol>')` dizgeleri**.
- Eski yolda yeniden-dışa-aktarma (shim) **yalnızca** hiçbir testin `jest.mock` ile hedeflemediği modüller için bırakılır ve bir faz sonra silinir.
- Yeni statik test (`tests/static/noMockedShim.static.test.ts`): `jest.mock` hedefi yalnızca yeniden-dışa-aktarma içeren bir dosya olamaz.

| Aşama | İçerik | Ek doğrulama |
|---|---|---|
| 0 | Paralel temel işler (Dalga 0, aşağıda). `api/**` ve `capabilities/**` dışında kalır | Paket testleri + ortak kapı |
| 1 | `api/**` alt katman düzeltmeleri + `BaseApi` bağlamı + ölü kod (Dalga 1) | `npm run test:api`, `test:module -- auth`, `test:module -- database` |
| 2 | Mekanik `api/` ağaç taşıması (Dalga 2, **tek başına**, tüm backend worktree'leri dondurulur, ≤ 1 gün) | `npm run build`; `git diff --stat` yalnızca yeniden adlandırma + içe aktarma satırları; `test:all` önce ve sonra aynı test sayısı |
| 3 | Alan paketleri: handler inceltme + repository (Dalga 3, paralel) | Paket başına `test:module -- <alan>` + karakterizasyon testleri **değişmeden** yeşil (kasıtlı ters çevirmeler etiketli) |
| 4 | Kural sıkılaştırma: depcruise kuralları `error`; mandallar sıfıra inenlerde kilitlenir | `npm run depcruise` 0 hata; `npm run verify` |

---

## Uygulanabilir iş paketleri

**Dosya sahipliği ayrık, dalga içinde paralel.** Aynı dosyaya iki paket dokunmaz. Dalga sınırında orkestratör birleştirir ve ortak kapıyı çalıştırır.

**Ön koşul:** WP8 (ADR-0023) ve açık webhook işi (`api/WebhookApiManager.ts`, `api/webhookAuth.ts`, `api/services/admin-service.ts`, çalışma ağacında değişmiş) birleşmiş olmalı. Dalga 0 bunları beklemez; Dalga 1+ bekler.

### Dalga 0 — `api/**` ve `capabilities/**` dışı (hemen başlatılabilir)

**P0-DB — Tek kök bağlantı + TenantRegistry + sayfalama yardımcısı** (D1, D2, D6 yardımcı kısmı)
- **Dosyalar:** `src/database/{Database,DatabaseManager,tenantConnection,index}.ts`, `src/database/client/ClientDB.ts`, `src/database/application/ApplicationDB.ts`, yeni `src/database/TenantRegistry.ts`, yeni `src/database/repositories/_shared/paginate.ts`, `tests/unit/database/**`, `tests/mongo-semantics/**` (yeni dosyalar).
- **Adımlar:**
  1. Karakterizasyon: `ClientDB.getInstance` yarışı, `invalidate`, `dropDatabase`, `ping` ve `closeAllConnections` davranışı (mevcut testler + eksikler).
  2. `Database` → kök bağlantı (`asPromise`, CMAP olay kancası için dışa açık `onPoolEvent`).
  3. `ClientDB` → `useDb` + `Map`. `getInstance(client)` imzası korunur (içeride `dbname` okunur).
  4. `DatabaseManager.getClientDB(order)` → `TenantRegistry.get(order)` → `ClientDB.getInstance`. Yeni `getTenant(order)` (status dahil). `closeAllConnections` → `close()` (getInstance yok, uyku yok; eski ad takma ad olarak kalır).
  5. `paginate.ts` + birim testleri.
  6. `tests/mongo-semantics`: bellek-içi Mongo'da iki tenant DB'si tek istemcide, izolasyon, `dropDatabase`, eşzamanlı `getInstance`.
- **Test:** `npm run test:module -- database`, `npm run test:module -- tenant`, `npm run test:integration:mocked`, ortak kapı.

**P0-LIFE — Bileşim kökü, kapanış, `ClientOperations` dağıtımı** (D5)
- **Dosyalar:** `entegrasyonik.ts`, yeni `src/bootstrap/{roles,schedules,shutdown}.ts`, 10 `*Scheduler.ts` (silinir), bunların iş modülleri yalnızca `defineJob` dışa aktarımı için, `src/operations/client/ClientOperations.ts` (silinir), `src/services/notification/NotificationService.ts`, `src/services/storage/StorageService.ts` (+ `exportKey` taşıması: `operations/tenant/exportKey.ts` → `services/storage/exportKey.ts`, `operations/tenant/*` içinde yalnızca içe aktarma satırı), `src/operations/notifications/saveNotification.ts` (yeni), `tests/unit/bootstrap/**`, ilgili karakterizasyon testlerinin içe aktarmaları.
- **Adımlar:**
  1. Kapanış sırası testi (sahte bileşenlerle çağrı sırası; `stopAllJobs` çağrılıyor mu).
  2. `schedules.ts`: 10 kayıt, rol kapısıyla (web/worker/all) aynı dağılım. Bugünkü dağılım `entegrasyonik.ts:153-200`; birim testi rol × iş matrisini karşılaştırır.
  3. `*Scheduler.ts` dosyalarını sil.
  4. `ClientOperations` dağıtımı.
  5. `shutdown.ts`, P0-DB'nin `DatabaseManager.close()` metodunu çağırır. P0-DB birleşmeden eski `closeAllConnections` adı kullanılır.
- **Test:** `npm run test:module -- platform`, `test:module -- stock`, `test:module -- billing`, `test:module -- compliance`, ortak kapı + `npm run build`.

**P0-LAYER — Alt katman ters bağımlılıkları (api dışı kısım) + depcruise kuralları** (D4, kısmi)
- **Dosyalar:** `src/integration/engine/IntegrationEventBus.ts` → `src/platform/runtime/events/IntegrationEventBus.ts` (eski yolda shim; `jest.mock` hedefiyse dönüştürücü), `src/operations/stock/StockPublishTrigger.ts`, `src/operations/tenant/TenantLifecycleService.ts` (kurucu enjeksiyonu), 3 çıplak `src/` içe aktarması (`database/client/models/Customer.ts`, `integration/engine/catalog/export/Dispatcher.ts`; `product-service.ts`'teki Dalga 1'de), `platform/runtime/metrics/{errorEvents,prodDeps}.ts` döngüsü, `interfaces` barrel döngüsü (`import type`), `.dependency-cruiser.cjs`, `quality/baseline.json`.
- **Test:** `npm run depcruise` (yeni kurallarla ihlal sayısı yalnızca azalır), `test:module -- platform`, `test:module -- stock`, `test:module -- tenant`, `test:integration-engine`, ortak kapı.

**P0-DEAD — api dışı ölü kod** (D7, kısmi)
- **Dosyalar:** `src/database/client/models/Settlement.ts`, `src/interfaces/settlement/**`, `src/utils/LifecycleManager.ts`, `src/interfaces/platforms/{erp,ecommerce}/index.ts` (yer tutucular), `src/integration/config/{ConfigResolver,types}.ts` + `config/catalog/integrationHttp.ts` (export kaldırma), `src/integration/modules/marketplace/trendyol/api/productUrls.ts` (yalnızca `PRODUCT_URL_UNCHANGED_KEYS` export'u; H1/Trendyol sahibine danışılır), `src/interfaces/stock/index.ts`, `src/services/billing/PaymentProviderFactory.ts`, `src/database/application/models/{SourceSnapshot,MetricRollup}.ts`, `src/database/client/models/Message.ts` (çift export), `tests/smoke.test.ts` gerekirse.
- **Test:** `npm run knip` (sayı düşer), `npm run test:unit`, ortak kapı + `npm run build`.

### Dalga 1 — `api/**` çekirdeği (WP8 + webhook işi birleştikten sonra)

**P1-CORE — Crypto/hata taşıması + `BaseApi` bağlamı + TenantRegistry kullanımı** (D3, D4 api kısmı)
- **Dosyalar:** `src/api/{BaseApi,authenticate,Security,integrationSecrets,responseSanitizer,tenantSettingsGuard,rateLimit,clientIp}.ts`, `src/platform/rateLimit/globalRateLimit.ts` + yeni `src/platform/http/{rateLimit,clientIp}.ts` (uygulama taşınır; api dosyaları yeniden dışa aktarır ya da dönüştürücüyle kaldırılır), yeni `src/platform/core/crypto/**`, `src/platform/core/errors/**`, `src/utils/{FieldCrypto,secretKeys}.ts` (→ crypto; shim), içe aktarma satırları: `src/operations/{tenant,account,integration}/*.ts`, `src/integration/config/legacyIntegrationRecord.ts`, `src/integration/modules/ecommerce/ideasoft/services/{Service,SecurityService}.ts`, `src/api/services/configuration-service.ts` (yalnızca `sibling()` kullanımı), `src/api/services/product-service.ts` (yalnızca çıplak `src/Constants` satırı), `tests/unit/api/**`, `tests/characterization/auth/**` (yol güncellemesi).
- **Adımlar:**
  1. Karakterizasyon: `ConfigurationService.get` DB okuma sayısı (sahte model sayacı), BaseApi "tenant yok" yolu.
  2. Taşımalar (dönüştürücü).
  3. `RpcContext` + tembel `clientDB` + `sibling()`.
  4. `authenticate` → `TenantRegistry`.
  5. Tenant yoksa 404 (test **kasıtlı ters çevrilir**, etiketli).
  6. depcruise `operations→api` ve `integration→api` → 0 → `error`.
- **Test:** `npm run test:api`, `test:module -- auth`, `test:module -- secrets`, `test:module -- tenant`, `test:module -- ideasoft`, ortak kapı.

**P1-DEAD — api içi ölü kod** (D7 kalan)
- **Dosyalar:** `src/operations/catalog/CatalogOperations.ts` (sil) + `src/api/services/{attributeMapping,brand,category,choice}-service.ts` (yalnızca `'CatalogOperations'` dizgeleri ve `choice.saveIntegration`, `category.saveIntegrationCategory`), `src/utils/decorator/cache.ts` (ad listesi), `src/api/services/{variant,product,image,ticket}-service.ts` (§4.2 metotları; ticket'ta `private`), `src/api/operationPolicy.ts` (yalnızca `IMAGE_API_ROUTES_WITHOUT_BACKEND`), `src/capabilities/{define.ts,domains/claims.ts}` (export kaldırma, bayat yorum), ilgili karakterizasyon test blokları.
- **Çakışma notu:** `integration-service`, `order-service` ve `claim-service`'teki ölü metotlar Dalga 3'te kendi alan paketinde silinir (dosya sahipliği).
- **Test:** `npm run test:module -- catalog`, `npm run test:api`, `npm run knip`, ortak kapı.

### Dalga 2 — Mekanik taşıma (tek başına, dondurulmuş pencere)

**P2-MOVE — `api/` ağacı** (hedef yapı)
- **Dosyalar:** `src/api/**` tamamı, `src/Webserver.ts` → `src/bootstrap/http.ts`, `src/Constants.ts` → `src/config/constants.ts`, `tests/**` içe aktarma ve `jest.mock` yolları, `docs/OPERATION_POLICY.md`/`docs/TESTING.md` yol atıfları, `tests/tools/run-tests.js` modül yol regex'leri, `.dependency-cruiser.cjs` yol desenleri (`api/rpc/handlers`), `quality/baseline.json`.
- **Adımlar:**
  1. `dev-tools/codemods/move-module.js` (ts-morph `SourceFile.move` + `jest.mock` dizgesi yeniden yazımı, kuru çalıştırma çıktısı).
  2. `api/services` → `api/rpc/handlers`, çekirdek → `api/rpc`, middleware → `api/http`, webhook'lar → `api/webhooks`, dosya rotaları → `api/files`, DTO'lar → `api/rpc/dto`.
  3. `noMockedShim` statik testi.
  4. `test:all` test sayısı önce ve sonra eşit.
- **Test:** `npm run build`, `npm run test:all`, `npm run depcruise`, `npm run lint`, `npm run ratchet`.

### Dalga 3 — Alan paketleri (paralel; handler dosyaları ayrık)

Her pakette:
1. Handler'daki sorgular `database/repositories/{tenant,app}/<Varlık>Repository.ts`'e taşınır (kurucu `TenantContext`, `clientId` parametresi yok, ADR-0016 §5.1).
2. İş kuralları `operations/<alan>/`'a gider.
3. Handler ince cephe olur.
4. `facetPage`/`parseListQuery` benimsenir; bilgi eklemeyen `catch` blokları silinir; hata kuralı uygulanır.
5. Handler `getXModel()` mandalı düşürülür.

| Paket | Dosya kümesi (tek sahip) | Ek adım | Test |
|---|---|---|---|
| **P3-INT** | `api/rpc/handlers/integration-service.ts`, yeni `operations/integrations/{settings,stockPolicy,health,platformLookup}.ts`, `database/repositories/app/ExportJobRepository.ts`, `integration/engine/catalog/export/ExportBatchService.ts`, `operations/integration/IntegrationHealthOperations.ts` (→ `operations/integrations/health.ts`) | D6 bölmesi; ölü `saveOrUpdateIntegrationCategory`, `retrievePlatformProcesses`, `retrieveOrders`, `retrieveOrdersFromIntegration` silinir; cephe ≤ 300 satır | `npm run test:api`, `test:module -- catalog`, `test:module -- engine`, `test:module -- stock` |
| **P3-ORD** | `handlers/{order,claim,customer,message,invoice,shipment,financial}-service.ts`, `integration/engine/order/*Repository.ts` → `database/repositories/tenant/` (engine yalnızca içe aktarma satırı), `operations/integration/PostOrderOperations.ts` → `operations/orders/postOrder.ts` | Ölü `updateOrderStatus`/`updateClaimStatus` silinir | `test:module -- orders`, `test:integration-engine` |
| **P3-CAT** | `handlers/{product,variant,category,brand,choice,hashtag,attributeMapping,image,configuration,smart}-service.ts`, `services/image/*` → `operations/catalog/images/`, `integration/modules/provider/PlatformMappingProvider.ts` → `operations/catalog/mapping/` | `ConfigurationService` `sibling()` ile (P1-CORE kanıt testi burada da geçer) | `test:module -- catalog`, `test:module -- cache` |
| **P3-ADM** | `handlers/{admin,user,security,tenant-data,billing,account,audit,ticket,notification,menu,setting,stock}-service.ts`, `operations/client/StatsOperations.ts` → `operations/reports/`, `services/statistics/*` → `operations/reports/` | MM-20 (`UserService` merkezi kayıt önce) **yalnızca kod**. Tenant `Users` parola özeti silme göçü bu paketin dışında (DB, yedek + insan onayı) | `npm run test:api`, `test:module -- auth`, `test:module -- tenant`, `test:module -- billing` |

**Dalga 3 çakışma kuralları:**
- `database/repositories/_shared/` Dalga 0'da donar; Dalga 3'te yalnızca **yeni dosya** eklenir.
- `ERROR_CODES` ve `capabilities/domains/*` değişiklikleri orkestratöre bildirilir, sırayla birleştirilir.
- P3-ORD'un engine repository taşıması `integration/engine/order/*` dosyalarında yalnızca içe aktarma satırını değiştirir. F-02 (HB/N11 sayfalama) aynı dosyalara dokunuyorsa önce F-02 birleştirilir.

### Dalga 4 — Kilitleme
- **P4-GATE:** `.dependency-cruiser.cjs` sıfıra inen tüm kurallar `error`. `quality/check-ratchets.js`: handler satır üst sınırı (400), handler `getXModel()` (son değer), depcruise ihlal sayısı. `docs/TESTING.md` ve `CLAUDE.md` Architecture bölümü güncellemesi (CLAUDE.md orkestratör/insan).
- **Test:** `npm run verify`.

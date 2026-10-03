# 03d — Kuyruk, Zamanlama ve Otomatik Çekim (uçtan uca keşif)

Tarih: 2026-10-03. Kapsam: yalnız kod okuma (backend/src), bulut kopyası; DB/Redis/.env yok, hiçbir şey çalıştırılmadı.
Okunanlar: .claude/skills/integration-engine-standards/SKILL.md, docs/adr/0005 (tam), 0006 (ilgili kısımlar), docs/INTEGRATION_PLAYBOOK.md (başlıklar + §4.1/4.4/4.10 grep), engine/order/README.md, docs/INTEGRATION_CATEGORY_MODEL.md §1 notu.
Kural: ölçülmemiş/okunmamış her şey "DOĞRULANAMADI" işaretlidir. Tahmin yerine formül + parametre verilmiştir.

Ön not (belge-kod sapmaları, yeni bulgu değil ama okuyucuyu yanıltır):
- engine/order/README.md bir "prompt" metnidir: "10 dk", "Redis'te küresel rate-limit takibi", "Token Bucket" yazar. Kodda sipariş aralığı 60 sn (order.config.json:2) ve rate limit yalnız süreç-içi (bkz. C ve F-03). README güncel değil.
- CLAUDE.md "ClientDB LRU" der; kod ADR-0024 D2 sonrası tek kök bağlantı + `useDb` ile `Map<dbname, ClientDB>` kullanıyor, LRU/tahliye yok (database/client/ClientDB.ts:9-21, :49-63).

---------------------------------------------------------------------
## (A) Mimari diyagram (metin)

```
                      APP_ROLE = web | worker | all   (bootstrap/roles.ts)
 ┌─────────────── web ───────────────┐        ┌──────────────────── worker/all ────────────────────────┐
 │ Express /api (RPC) + /hooks/...   │        │ IntegrationEngine.start()  (bootstrap/app.ts:103)       │
 │  - Trendyol webhook -> BullMQ add │        │   ├─ ExportOrchestrator  while(true) döngü (Mongo)       │
 │  - requestFetchFromPlatform ->    │        │   ├─ ImportOrchestrator  while(true) döngü (Mongo)       │
 │    ImportJob(Mongo)+EventBus      │        │   └─ OrderOrchestrator   (BullMQ)                        │
 │  - getQueues/listJobRuns (BO)     │        │ startSchedules(role)  (bootstrap/schedules.ts)           │
 └───────────────┬───────────────────┘        │   19 iş: Mongo lease (JobLeases) + JobState/JobRuns      │
                 │                            └───────────────────────┬──────────────────────────────────┘
                 │ BullMQ add (jobId)                                 │
                 ▼                                                    ▼
   Redis ── "order-sync-queue" (TEK kuyruk, TEK havuz)         ApplicationDB (Mongo)
            Worker concurrency=5 / pod                           Clients.integrations[] (imleçler burada)
            attempts=5, exp backoff 2 sn                         ExportSignals / ExportFlags / ImportJobs
                 │                                               JobLeases / JobStates / JobRuns
                 ▼                                               DeadLetterQueue / QueueMetrics
   OrderWorker.process(job)  ── tenant×entegrasyon başına 1 iş ──┐
      Promise.allSettled([ sipariş(her tur), iade(15dk), mesaj(5dk), finans(6sa) ])
      -> Repository upsert (ClientDB, tek kök bağlantı `useDb`)    │
      -> imleç: Clients.integrations.$.lastSuccessfulOrderSync vb.  │
                 │                                                  │
                 ▼                                                  │
   ResilientHttpClient (süreç-içi, anahtar = tenant::entegrasyon)   │
     bulkhead -> retry -> breaker -> timeout ; RateLimiter (kova)   │
                 ▼                                                  │
   Pazaryeri API (Trendyol/HB/N11/Pazarama/Ideasoft/Bizimhesap) ◄───┘

 Katalog (Redis'siz Mongo durum makinesi):
   kullanıcı/StockPublishTrigger -> ExportStagedProduct(QUEUED) + ExportFlag.queuedCount
   Dispatcher(300'lük vagon) -> ExportSignal(PREPARING) -> Validator(50) -> Publisher(30) -> Sentinel(1 dk) -> Sync(50)
   ExportOrchestrator: findOneAndUpdate(lockedBy) -> worker.runOnce (fire-and-forget) ; 1 sinyal/sn/pod
   İçe alma: ImportJob WAITING_FOR_FETCH -> Stager -> READY_TO_SYNC -> Importer (fetchLimit 50)
```

---------------------------------------------------------------------
## (B) Job envanteri

### B1. Zamanlayıcı kayıtları (backend/src/bootstrap/schedules.ts; hepsi `platform/runtime/scheduler`)
Ortak mekanizma: `setTimeout` zinciri (tur BİTİNCE everyMs sonra yeni tur; sabit-hız değil) scheduleJob.ts:285-316; iş başına Mongo lease `JobLeases`, TTL = maxDurationMs (runJob.ts:197-210, leaseGate.ts); JobState + JobRuns yazımı (runJob.ts:212-245); süreç-içi örtüşmede tur atlanır (scheduleJob.ts:301-306). Lease **iş adı** anahtarlı = küresel: bir anda tek pod tüm tenant döngüsünü yürütür; tenant sharding yok. `jitterPct` hiçbir kayıtta verilmemiş (grep: schedules.ts'te yok).

| Ad (id) | Aralık / maxDuration | Veri türü / ne yapar | Kapsam | Artımlı mı | Kilit | schedules.ts satır |
|---|---|---|---|---|---|---|
| stock.allocationSweep | 15 dk / 5 dk, critical, always | Son N günde tahsisi sonuçlanmamış siparişleri yeniden işler (AllocationSweepJob.ts:36-66; tüm ACTIVE tenant sıralı) | tüm tenant, tek koşu | hayır (LOOKBACK tarama) | JobLease küresel | 64-66 |
| stock.publish | 30 sn / 25 sn, critical, always | `stockDirty` varyantları kanallara UPDATE_STOCK olarak stage'ler (StockPublishTrigger.ts: `run()` tüm ACTIVE tenant, tenant başına ≥2 Mongo sorgusu, SCAN_LIMIT 2000/tenant) | tüm tenant | evet (dirty bayrağı) | JobLease küresel | 67-69 |
| stock.oversellCompensation | 5 dk / 4 dk, critical | Oversell siparişleri iptal/telafi; tüm ACTIVE tenant (OversellCompensationJob.ts:79-82) | tüm tenant | bayrak/durum | JobLease + iş içi claim lease | 70-72 |
| stock.internalReconciliation | 1 sa / 30 dk | Dahili stok mutabakatı (tenant başına ≤5000 varyant; InternalReconciliationJob.ts:19,31-60) | tüm tenant | hayır | JobLease | 73-75 |
| stock.externalReconciliation | 24 sa / 2 sa, `ifDue` | Pazaryeri KATALOĞUNU baştan sona akıtıp stok karşılaştırır (`streamProducts`, kanal başına ≤20.000; ExternalReconciliationJob.ts:21,65-95) — ürün/stok | tüm tenant × kanal, sıralı | hayır (tam akış) | JobLease | 77-79 |
| billing.trialExpiry | 15 dk / 5 dk | Abonelik deneme bitişi — içeriği DOĞRULANAMADI (TrialExpiryJob okunmadı) | platform | — | JobLease | 80-82 |
| catalog.exportSignalPoll | 15 sn (EXPORT_IDLE_POLL_MS, env.ts:267) / ≥5 sn | Bekleyen ExportSignal varsa süreç-içi EventBus'u uyandırır (exportSignalPoll.ts:4-27) — web→worker sinyal kaybı çözümü | platform | evet (nextRunAt) | JobLease | 83-86 |
| compliance.probeRunner | 24 sa / 5 dk | Uyum sondaları (içerik DOĞRULANAMADI, okunmadı) | platform | — | JobLease | 87-89 |
| compliance.sourceMonitor | 7 gün / 30 dk, `ifDue` | Resmi doküman izleme (okunmadı) | platform | — | JobLease | 90-92 |
| notifications.email-dispatch | 15 sn / 60 sn | E-posta outbox (bayrak kapalıysa DB'ye dokunmaz) | platform | outbox | JobLease | 94-99 |
| notifications.push-dispatch | 10 sn / 60 sn | Web push outbox | platform | outbox | JobLease | 101-106 |
| notifications.platform-attention-push | 2 dk / 60 sn | Backoffice dikkat maddeleri → push | platform | — | JobLease | 108-113 |
| notifications.announcements | 1 dk / 5 dk | Duyuru geçişleri + fan-out | platform | durum | JobLease | 115-124 |
| alerts.evaluator | 1 dk / 1 dk | Alarm kuralları (Clients.integrations[].lastSuccessfulOrderSync dahil; createAlertEvaluator.ts:165) | platform + tenant | — | JobLease | 126-135 |
| pricing.buyboxRefresh | 1 dk / 50 sn | Trendyol buybox OKUMA; tenant'lar arası adil dakikalık çağrı bütçesi (pricing.buybox.budget.trendyol.perMin; BuyboxRefreshJob.ts başlık) | tüm tenant (feature kapalı varsayılan) | evet (vadeli barkod) | JobLease | 138-147 |
| finance.commissionDrift | 24 sa / 15 dk, `ifDue` | Komisyon sapma taraması (tenant döngüsü, `ctx.signal` kullanıyor) | tüm tenant | hayır | JobLease | 149-158 |
| retention.auditIpMask | 24 sa / 15 dk, `ifDue` | 90 günden eski AuditLogs IP maskeleme (heartbeat+signal kullanıyor) | platform (kendi DB) | batch | JobLease | 160-165 |
| observability.metrics-flush | 1 dk / 30 sn, HER rol | Süreç-içi metrik kaydını Mongo'ya flush + Redis `resilience:<pod>` anlık görüntüsü | pod başına | — | lease KAPALI (bilinçli) | 167-175 |
| (config head poll) | 15 sn / 10 sn, HER rol | Platform ayar yayını yoklaması | pod başına | — | JobLease | 177-179 |

Not: `redisSkip` sarmalayıcısı (schedules.ts:47-50) `job.run()`'ı bağlam OLMADAN çağırır: allocationSweep/publish/oversell/internalRecon/externalRecon/trialExpiry `ctx.heartbeat` ve `ctx.signal` kullanamaz (lease yenilenmez).

### B2. Zamanlayıcı DIŞI döngüler (JobState/JobRuns'a YAZMAZ, lease'siz)

| Ad | Aralık | Veri türü | Kapsam | Artımlı | Kilit / tekilleştirme | Dosya:satır |
|---|---|---|---|---|---|---|
| OrderQueueProducer.scheduleJobs (OrderOrchestrator) | setInterval 60 sn (`order.syncIntervalMs`; order.config.json:2) | Sipariş+iade+mesaj+finans iş üretimi (tenant×entegrasyon) | HER worker pod'da çalışır, tüm ACTIVE tenant | evet (aşağıda) | yok; yalnız BullMQ jobId `sync_<client>_<kod>_<60 sn penceresi>` | OrderOrchestrator.ts:77-80; OrderQueueProducer.ts:43,57,142-151 |
| OrderWorker (BullMQ) | tüketici; concurrency 5/pod (order.config.json:3; worker-runner.ts:89) | bkz. B3 | tenant×entegrasyon | evet | BullMQ | worker-runner.ts:52-90 |
| ExportOrchestrator döngüsü | boşta 5 dk (`export.orchestrator.exportLoopDelay`) uyku, 15 sn exportSignalPoll ile kesilir; iş varken 1 sinyal/sn | Katalog yazma hattı | sinyal başına | durum makinesi | `findOneAndUpdate({lockedBy:null})` + süreç-içi `activePlatformLocks` | ExportOrchestrator.ts:47-112, :23,:64-70 |
| Dispatcher.run (her döngüde) | döngü başına 1 kez | ExportFlag→vagon (300 kalem) | tenant×entegrasyon, ≤20 bayrak/tur | evet (queuedCount) | ExportFlag lease 5 dk (Dispatcher.ts:96-109) | Dispatcher.ts:22,37-42 |
| ImportOrchestrator döngüsü | boşta 30 sn (`importLoopDelay`); iş varken gecikmesiz `continue` | Ürün içe alma (Stager/Importer) — kullanıcı tetiklemeli | ImportJob başına | durum makinesi | `findOneAndUpdate(lockedBy)` | ImportOrchestrator.ts:36-66 |
| clearAllZombieLocks | setInterval 15 dk (orchestrator.config.json) | Export/Import zombi kilit temizliği | küresel | — | yok (idempotent updateMany) | IntegrationEngine.ts:22,41-49 |
| QueueMetricsCollector auto flush | 60 sn | Kuyruk kovası yazımı | pod | — | — | worker-runner.ts:105 |

### B3. Sipariş işinin içeriği: veri türü × aralık × artımlılık (OrderQueueProducer.computeSourceWindow :250-282; order.config.json)

| Kaynak | Aralık | Pencere | İmleç (alan, Clients.integrations[].) | Yalnız başarılıysa ilerler | Idempotency anahtarı | Hata işleme |
|---|---|---|---|---|---|---|
| Sipariş | 60 sn (webhook sağlıklıysa 5 dk) | `lastSuccessfulOrderSync` → şimdi; imleç = pencere sonu − 5 dk (OrderWorker.ts:293-300) | lastSuccessfulOrderSync | evet (eksik çekimde ilerlemez :294-296) | Orders unique(integrationCode, externalOrderId) (Order.ts:211) | Başarısızsa iş FAIL → BullMQ retry (OrderWorker.ts:89-92) |
| İade (claims) | 15 dk delta; günde 1 tam 32 gün süpürme (order%24 UTC saatinde) | `lastClaimSync − 1 sa` | lastClaimSync, lastClaimFullSweepAt | evet (:309-314) | Claims unique(integrationCode, externalClaimId) (Claim.ts:101) | Hata yutulur+loglanır, iş devam (OrderWorker.ts:93-95); imleç ilerlemez |
| Mesaj (müşteri soruları) | 5 dk | `lastMessageSync − 15 dk` | lastMessageSync | evet (:325-327; "incomplete" sinyali YOK) | Messages unique(integrationCode, externalMessageId) (Message.ts:65) | aynı |
| Finans | 6 sa delta; günde 1 tam 30 gün | `lastFinanceSync − 24 sa` | lastFinanceSync, lastFinanceFullSweepAt | evet (:319-324) | Financials unique(integrationCode, externalId) (Financial.ts:51) | aynı |
| Fatura | AYRI ÇEKİM YOK: yalnız sipariş paketiyle gelen `pkg.invoices` kaydedilir (OrderWorker.ts:171-177, 203-207) | — | — | — | **unique indeks YOK**; filtre (integrationCode, externalOrderId, type) + upsert, önce `find` (InvoiceRepository.ts:32-47, 96-112); Invoice.ts yalnız `index:true` | throw |
| Ürün (içe alma) | yalnız kullanıcı tetiklemesi (`IntegrationService/requestFetchFromPlatform`, integration-service.ts:165) | tam katalog | ImportJob | — | aktif iş varsa reddeder (importJobs.ts:24-31); sonrası bekleme yok | FAILED + bildirim |
| Ürün (stok yayını) | StockPublishTrigger 30 sn | yalnız `stockDirty` | Variant.stockDirty / lastPublishedQty | evet | ExportStagedProduct upsert | Sinyal retry/nextRunAt |
| Kategori/marka/öznitelik | ZAMANLANMIŞ İŞ YOK; her UI isteğinde pazaryerine doğrudan (platformLookup.ts:22-31; Trendyol Category/BrandConnector'da önbellek bulunamadı) | — | — | — | — | — DOĞRULANAMADI: frontend tarafı önbellek |
| Buybox | 1 dk, Trendyol, bütçeli | vadeli barkodlar | BuyboxSnapshots | evet | — | tenant atlanır |
| Bildirim/retention/uyum | B1 satırları | | | | | |

Sipariş hattında taranan tipler: `i.status === true && (type === 'marketplace' || type === 'ecommerce')` (OrderQueueProducer.ts:88). INTEGRATION_CATEGORY_MODEL §1 notu HÂLÂ GEÇERLİ (satır 65 → şimdi 88): ERP (Bizimhesap) taranmaz.

Adaptör desteği (retrieveClaims/Messages/Financials; modules/*/index.ts): Trendyol, HB, N11, Pazarama dördünü de uygular; Ideasoft ve Bizimhesap `return []` (ecommerce/ideasoft/index.ts:92-102; erp/bizimhesap/index.ts:94-99) — yani bu iki entegrasyon için iade/mesaj/finans turları boş çağrı değil, çağrısız boş dizi (maliyetsiz).

### B4. Katalog hattı tick/batch tablosu (engine/catalog/export, import; export.config.json / import.config.json)

| Aşama | Tetik/aralık | Batch/eşzamanlılık | Pazaryeri sorgu sıklığı | Dosya:satır |
|---|---|---|---|---|
| Dispatcher | her Export döngü turu (iş varken ~1 sn, boşta ≤5 dk/15 sn poll) | vagon ≤300 kalem (BATCH_SIZE); tur başına ≤20 ExportFlag (limit 20) | — | Dispatcher.ts:22,41 |
| Validator | sinyal PREPARING | chunk 50 (`export.validator.chunkSize`) | — | Validator.ts:17,66 |
| Publisher | sinyal PENDING | chunk 30 (`export.publisher.chunkSize`); retryable hatada sinyal 5 dk ertelenir (`min(retryAfterMs, 5 dk)`) | yazma kovası | Publisher.ts:23,65,28,89-91 |
| Sentinel | sinyal SENT; cooldown 1 dk (`sentinel.cooldownMinutes`=1); Sync'e geçiş 15 sn (`syncCooldownSeconds`) | trackingId başına 1 `checkBatchProduct`; izleme ömrü 24 sa | **vagon başına ≈1 çağrı/dk** rapor gelene dek (Sentinel.ts:76-90, 249) | Sentinel.ts:18,26,76 |
| Sync | sinyal WAITING; cooldown 1 dk | batchSize 50; aynı tenant×platform'daki tüm WAITING vagonlar tek turda birleşir; 14 gün zaman aşımı | — | Sync.ts:16-18,98 |
| Stager | ImportJob WAITING_FOR_FETCH | `streamProducts` chunk | tam katalog akışı | Stager.ts:74 |
| Importer | ImportJob READY_TO_SYNC | fetchLimit 50, retry 3×3 sn | — | Importer.ts:18-20 |
| Eşzamanlılık | Export: döngü sinyal başına `this.dispatch()` BEKLENMEDEN çağrılır, sonra 1 sn bekler (ExportOrchestrator.ts:108-110) => pod başına 1 sinyal/sn başlatma, global sınır yok; yalnız pod-içi (tenant,entegrasyon) çifti tekil (:23,:64-70). Import: iş bulunduğu sürece gecikmesiz döngü, `activeImportJobIds` dışında sınır yok (ImportOrchestrator.ts:56,45) |

---------------------------------------------------------------------
## (C) Rate limit / dayanıklılık yapılandırması

Mekanizma (common/http/ResilientHttpClient.ts): cockatiel `wrap(bulkhead, retry, breaker, timeout)` (:378) + `RateLimiter` kovası (RateLimiter.ts) + Retry-After.
- Durum **süreç-içi statik Map**, anahtar `${clientId}::${integrationCode}` (:234-236) → limiter, bulkhead (maxConcurrent, kuyruk = maxConcurrent×50 :242) ve circuit breaker **tenant×entegrasyon başına ve pod başına** ayrıdır. Redis'e hiçbir limit/devre durumu yazılmaz (Redis yalnız `resilience:<pod>` anlık görüntüsü; resilienceSnapshot.ts).
- Retry: okuma maxAttempts 4 (= en çok 5 çağrı), taban 1 sn, tam jitter, üst 30 sn (:356-358); yazma yalnız ECONNREFUSED/DNS. Breaker: 5 ardışık hata, açık 30 sn, yarı-açık üstel max 5 dk (:262-272). Varsayılanlar kod sabiti; katalogdaki `resilience.retry.*`/`breaker.*`/`factoryCallTimeoutMs` anahtarlarının TÜKETİCİSİ YOK (AdapterHttpService.ts:49-57 yalnız timeout/ratePerMin/maxConcurrent geçirir; grep ile doğrulandı) — ayar değişse etkisiz.
- 429: `RateLimiter.onRateLimited()` hızı yarıya indirir, 5 dk 429'suz tam hıza döner (RateLimiter.ts:30-38); `Retry-After` ≤60 sn ve ≤4 deneme ise uyur+tekrar eder (:400-404), aksi halde `RATE_LIMITED` IntegrationError fırlatır (:407-418). Retry-After başlığı YOKSA anında RATE_LIMITED (bekleme yok).

| Platform | maxConcurrent | ratePerMin | timeout | Servis grubu / ek | Kaynak (efektif) | descriptor.ts `configured` | Tutarlı mı |
|---|---|---|---|---|---|---|---|
| Trendyol | 10 | 200 genel (env TY_RATE_PER_MIN) | 30 sn | grup kovaları: product_read 1000, product_write 200, inventory_price_write 350, finance 100 (gruplu çağrı YALNIZ kendi kovasından geçer → toplam tavan = grupların toplamı); sipariş listesi pacer 30/dk (`tenant:sellerId` anahtarlı, süreç-içi); barkod başına fiyat 30/dk (süreç-içi, "tek replika" notu); iade sayfalama eşzamanlılık 3 | limits.ts:62-69,100-111,157-185, trendyol/services/Service.ts:36-38; integrationHttp.ts:22,36,50 | descriptor.ts:148 {10, 200, 30000} | Evet. `documented.perMinute: 30` yalnız sipariş listesi (descriptor.ts:144); kaynaklar çelişkili, `verified:false` |
| Hepsiburada | 5 | YOK (0 = sınırsız) | 60 sn | — | integrationHttp.ts:22,36,50 | descriptor.ts:94 {5, —, 60000}; `documented.perSecond: 1000` (kaynak "doğrulanamadı") | Yapılandırma evet. Belge değeri API_CONTRACTS_2026-09-30.md:45 ile ÇELİŞİR ("listing ~30 rps, order ~10 rps" veya "100 istek/dk/merchant"; DOĞRULANAMADI) |
| N11 | 10 | 1000 | 30 sn | REST ve SOAP ayrı istemci (`n11-soap`) → ayrı breaker/limiter kovası | integrationHttp.ts; n11/descriptor.ts:99 | {10, 1000, 30000} | Evet; `verified:false` |
| Pazarama | 11 | YOK | 30 sn | — | integrationHttp.ts | descriptor.ts:89 {11, —, 30000} | Evet; resmi limit bulunamadı |
| Ideasoft | 10 (varsayılan) | 300 | 30 sn | — | ideasoft/descriptor.ts:76 | {—, 300, 30000} (maxConcurrent yazılmamış, etkin değer 10) | Kısmen (maxConcurrent descriptor'da yok) |
| Bizimhesap | 10 (varsayılan) | 300 | 30 sn | — | bizimhesap/descriptor.ts:53 | {—, 300, 30000} | Kısmen (aynı) |

Tenant mı global mi: limiter/breaker/bulkhead **tenant×entegrasyon×pod**; pazaryeri-geneli veya IP-geneli sınır YOKTUR. Aynı IP'den çok tenant → toplam hız = Σ tenant (× pod sayısı). Pazaryeri limitlerinin kapsamının (satıcı mı, uygulama/IP mi) belgelerde yazılı olup olmadığı DOĞRULANAMADI (API_CONTRACTS_2026-09-30.md:16 yalnız "servis grubu bazında ortak limit" der). Tek tenant×pod için ceiling'ler korunuyor; aggregate korunmuyor.

Adil bütçeleme örneği (mevcut doğru altyapı, genişletilebilir): buybox işi tek lease altında dakikalık küresel çağrı bütçesini tenant'lara round-robin dağıtır (BuyboxRefreshJob.ts başlık, schedules.ts:136-147).

---------------------------------------------------------------------
## (D) Webhook durumu

| Platform | Alıcı var mı | Doğrulama | İdempotency / kuyruk | Kanıt |
|---|---|---|---|---|
| Trendyol (sipariş durumu) | EVET `POST /hooks/trendyol/:hookToken` (authenticate'ten önce, /api dışında) | URL token (64 hex, düz metin DB'de) sabit-zamanlı karşılaştırma + isteğe bağlı `webhookAuthType` API_KEY/BASIC (yapılandırılmamışsa yalnız uyarı, geriye uyumlu); tüm hatalar aynı 404; JSON Content-Type guard; IP 600/dk + token 60/dk oran sınırı (süreç-içi `createRateLimiter`) | Gövde HİÇ okunmaz; yalnız `order-sync` işi eklenir, jobId `webhook_<client>_<kod>_<10 sn pencere>`; 200 hızlı. İç hata 500 (Trendyol retry) | WebhookApiManager.ts:70-136; webhookAuth.ts:160-217; OrderQueueProducer.ts:205-240 |
| Hepsiburada | YOK (ADR-0005: resmi doküman teyidi bekliyor) | — | — | ADR-0005 Karar 8 |
| N11 / Pazarama / Ideasoft / Bizimhesap | YOK (webhook dokümanı yok / kapsam dışı) | — | — | ADR-0005 |
| Ödeme (iyzico/mock) | Ayrı rota `/api/billing/webhooks/:provider` — imza doğrulamalı, senkron işleme, `BillingEvents.providerEventId` unique | | senkron (BullMQ değil, bilinçli) | BillingWebhookApiManager.ts:9-64 |

Eksikler: (1) Trendyol'a webhook ABONELİĞİ kaydeden kod bulunamadı (grep `webhook-subscriptions|registerWebhook` → yok); yalnız token üretimi/rotasyonu var (operations/integrations/settings.ts:150-157, `generateWebhookToken` RPC) — kaydın kullanıcı tarafından Trendyol panelinde elle yapılıp yapılmadığı DOĞRULANAMADI. (2) Token ile arama `Clients.findOne({'integrations.webhookToken': …})` — Client şemasında bu alan için indeks yok (Client.ts:61-65: yalnız order, clientId, dbname). (3) `webhookHealthy=true` HER geçerli çağrıda yazılır (WebhookApiManager.ts:105); Trendyol pasife alırsa 30 dk "webhooksuz sipariş" sezgisiyle düşürülür (OrderQueueProducer.ts:168-192). (4) Webhook oran sınırı süreç-içi (çok pod'da pod başına).

---------------------------------------------------------------------
## (E) Mevcut aralıklarla yük tahmini (formül + parametre; ölçüm yok)

Varsayımlar (gerçek dağılım DOĞRULANAMADI): T = tenant sayısı, I = tenant başına sipariş-hattı entegrasyonu = 3 (ADR-0005 varsayımı), P = T×I. Ideasoft/Bizimhesap yalnız sipariş çağrısı yapar; dört pazaryeri 4 kaynak (alt sınır: her kaynak tur başına ≥1 HTTP çağrısı; sayfalama/tür çarpanı DOĞRULANAMADI).

Formüller: sipariş = P×(60/60) = P çağrı/dk; iade = P/15; mesaj = P/5; finans = P/360. Çift = 1,269×P (alt sınır). Webhook sağlıklı Trendyol kanalı sipariş için P/5.

| | 100 tenant (P=300) | 1.000 tenant (P=3.000) | 10.000 tenant (P=30.000) |
|---|---|---|---|
| BullMQ sipariş işi/dk (= P) | 300 (5/sn) | 3.000 (50/sn) | 30.000 (500/sn) |
| Pazaryeri çağrısı/dk — sipariş | 300 | 3.000 | 30.000 |
| — iade | 20 | 200 | 2.000 |
| — mesaj | 60 | 600 | 6.000 |
| — finans | 0,8 | 8 | 83 |
| Toplam alt sınır/dk | ≈381 | ≈3.808 | ≈38.083 |
| ADR-0005 Seviye-2 eşiği (500 iş/dk) | 0,6× (altında) | 6× üstünde | 60× üstünde |
| ADR-0005 Seviye-3 eşiği (5.000 iş/dk) | altında | 0,6× | 6× üstünde |
| Gereken eşzamanlılık = (iş/sn)×d, d=iş süresi (ölçülmedi; QueueMetrics.procMsP95 canlı veri bu kopyada yok) | 5·d | 50·d | 500·d |
| Gereken worker pod (concurrency 5/pod) d=1 sn | 1 | 10 | 100 |
| Gereken pod d=3 sn | 3 | 30 | 300 |
| Producer turu: sıralı `add` sayısı (Redis RTT=r ise süre ≈ P×r) | 300 | 3.000 | 30.000 → r=1 ms için 30 sn, r=5 ms için 150 sn (>60 sn aralık) |
| Producer Mongo okuma: tüm ACTIVE Clients dokümanları/tur (pod başına) | 100 | 1.000 | 10.000 doküman/dk × pod |
| stock.publish: Mongo sorgu/dk ≥ T×2×(60/30) | 400 | 4.000 | 40.000 |
| stock.publish tur süresi ≈ T×2×t_q; lease TTL 25 sn aşımı T > 12,5/t_q | t_q=5 ms → eşik T=2.500; 2 ms → 6.250; 10 ms → 1.250 (t_q ölçülmedi) | | |
| Redis bağlantı/pod (kuyruk-üretici, error-handler Queue, QueueEvents, Worker 2, RedisService, web: webhook Queue + engineOps Queue) | ≈6-9, tenant sayısından BAĞIMSIZ (kod sayımı; ioredis duplicate sayısı DOĞRULANAMADI) | aynı | aynı |
| Mongo bağlantı havuzu | tek kök bağlantı, DB_POOL_SIZE=20/süreç (env.ts:192, rootConnection.ts) tüm tenant + tarayıcı işler arasında paylaşımlı | | |
| TenantRegistry önbelleği | LRU max 1000, TTL 30 sn (TenantRegistry.ts:20-28): 1.000+ tenant taramalarında sürekli isabetsiz → tenant başına ek `Clients` sorgusu | | |
| Aynı dakikada tetiklenme | Sipariş tüm tenant için aynı 60 sn penceresinde enjekte edilir; günlük süpürme `order%24` UTC saatine yayılmış (T/24 tenant aynı saat) | | |

---------------------------------------------------------------------
## (F) Bulgular

### P0

**F-01 Tek sipariş kuyruğu + tek havuz (concurrency 5/pod) + zaman-pencereli jobId: yığılma kendini besliyor, tek pazaryeri yavaşlığı hepsini bloklar**
- Kanıt: tek kuyruk `order-sync-queue` (OrderQueueProducer.ts:15; worker-runner.ts:52); `concurrency` 5 (order.config.json:3, worker-runner.ts:89); jobId her 60 sn'de yeni (`sync_<client>_<kod>_<pencere>`, OrderQueueProducer.ts:142-143,317-319) — aynı çift için bekleyen/aktif iş VARKEN yenisi eklenir; işler `lastSyncTimestamp`'i ekleme anından taşır (:131-137). Tek çağrı en kötü durumda 5 deneme × timeout (Trendyol 30 sn; HB 60 sn) + backoff (ResilientHttpClient.ts:356-358; integrationHttp.ts:22) ≈ 150-300+ sn. Breaker tenant başına (:234-236,262-272): bir pazaryeri kesintisini her tenant ayrı öğrenir. ADR-0005 Seviye-1 ("tek entegrasyonun bekleme p95 >30 sn → entegrasyon başına kuyruk") uygulanmamış.
- Etki (kod okumasından hesap, canlı doğrulanmadı): Trendyol kesintisi/yavaşlığında 100 Trendyol tenant'ı × ~165 sn ÷ 5 eşzamanlılık ≈ 55 dk'lık bir tur; bu sürede HB/N11/Pazarama işleri aynı havuzda bekler, her dakika yeni (aynı çifte) iş yığılır. 100 tenant (300 iş/dk) tek pod için iş süresi ≤1 sn varsayımına dayanır (E tablosu).
- Çözüm yönü (mevcut BullMQ+jobId+imleç doğru; üstüne): (a) jobId'yi pencere yerine çiftle sabitle (`sync_<client>_<kod>`) ve BullMQ `deduplication`/kalan-iş kontrolüyle "bekleyen/aktif varsa ekleme"; (b) entegrasyon başına kuyruk veya Worker (ADR-0005 Seviye-1 zaten yetki veriyor) ve entegrasyon başına concurrency; (c) iş seviyesi toplam süre bütçesi (deadline) ve platform-geneli breaker durumunu Redis'te paylaşıp açıkken iş eklememe/`moveToDelayed`.

### P1

**F-02 Sipariş üreticisi: her worker pod'da, kilitsiz, zamanlayıcı dışı, örtüşebilir, tüm Clients dokümanlarını okur**
- Kanıt: `setInterval(async …)` örtüşme koruması yok (OrderOrchestrator.ts:77-80); her worker/all pod `OrderOrchestrator.start()` çalıştırır (IntegrationEngine.ts:83-87); `Clients.find({status:'ACTIVE'}).lean()` tüm dokümanlar, `integrations` dahil (OrderQueueProducer.ts:57); P adet sıralı `await add` (:145-151); JobState/JobRuns'a yazmaz (schedules.ts'te kayıt yok) → backoffice job listesinde görünmez; BullMQ jobId tekilleştirir ama her pod aynı işi yeniden hesaplayıp Redis'e vurur (N pod × P add).
- Etki: T=10.000 → turun süresi aralığı aşar (E tablosu), pod sayısı arttıkça Mongo/Redis yükü doğrusal artar, iş yığılması (F-01) ile birleşir.
- Çözüm yönü: producer'ı `startJob` altına al (lease + JobState; mevcut altyapı), `Clients` okumasını projeksiyon+sayfalama ile yap (yalnız imleç/durum alanları), `addBulk` kullan, tenant'ları tur içinde zamana yay (jitter/dilim).

**F-03 Rate limit yalnız tenant×entegrasyon×pod; pazaryeri/IP genelinde sınır ve paylaşımlı durum yok**
- Kanıt: ResilientHttpClient.ts:234-246 (statik Map, anahtar tenant::kod); RateLimiter.ts (süreç-içi); Trendyol `OrderListPacer`/`BarcodePriceGate` süreç-içi (limits.ts:100-111,157-185; OrderConnector.ts:128-138); Redis yalnız anlık görüntü (resilienceSnapshot.ts:24-34). README'nin "Redis'te küresel limit takibi" iddiası kodda yok.
- Etki: pod × tenant çarpımıyla gerçek istek hızı artar; aynı çıkış IP'sinden Σ tenant yükü hiçbir yerde sınırlanmaz. Pazaryeri limitlerinin satıcı mı IP mi bazlı olduğu DOĞRULANAMADI — IP bazlıysa bu P0'a yükselir. Devre kesici de tenant başına: kesintide T×5 başarısız çağrı (F-01).
- Çözüm yönü: `RateLimiter.throttle()` arayüzünü koruyup Redis (Lua token bucket) destekli bir uygulama ekle: anahtar `platform[:grup]` (global) + mevcut tenant kovası; breaker durumunu platform bazında paylaş. ADR-0006 "limiter paylaşımlı katmana taşınır" yönüyle uyumlu.

**F-04 Hata ve DLQ gürültüsü: AUTH/FATAL her dakika DLQ'ya yazar, otomatik duraklatma yok, handler her pod'da çalışır**
- Kanıt: producer entegrasyonu yalnız `status===true` + tip ile seçer, kimlik/ardışık hata durumuna bakmaz (OrderQueueProducer.ts:88-90); FATAL → `UnrecoverableError` (worker-runner.ts:76-79) → `QueueEvents 'failed'` HER pod'da `handleJobFailure` çalıştırır (OrderOrchestrator.ts:119-122) → `DeadLetterQueue.insertOne` (OrderErrorHandler.ts:138), `originalJobId` için unique/TTL indeksi yok (Common.ts:55 yalnız {clientId,status}); `RATE_LIMITED` de 5 deneme (~2+4+8+16 sn) sonra MAX_RETRIES DLQ'ya düşer (order.config.json:5-7), oysa Retry-After (≥60 sn) bundan uzun olabilir (ResilientHttpClient.ts:400-418).
- Etki: bozuk kimlikli her tenant×entegrasyon günde ≥1.440 DLQ kaydı (× pod sayısı yarışa göre); DLQ sınırsız büyür; gerçek sorunlar gürültüde kaybolur; 429'larda gereksiz DLQ.
- Çözüm yönü: ardışık AUTH hatasında entegrasyonu otomatik `needsAttention`/duraklat + bildirim (mevcut notification altyapısı), DLQ'ya `originalJobId` unique + TTL, handler'ı tek pod'a (lease) ya da worker `failed` olayına taşı, RATE_LIMITED için `retryAfterMs`'li özel backoff/`moveToDelayed`.

**F-05 Tenant tarayıcı zamanlayıcı işleri: tek lease, tek pod, sıralı, heartbeat yok — ölçekte lease süresini aşar**
- Kanıt: stock.publish 30 sn/25 sn (schedules.ts:67-69) tüm ACTIVE tenant'ı sıralı gezer (StockPublishTrigger.ts `run()`); aynısı allocationSweep, oversellCompensation, internalReconciliation; externalReconciliation tüm katalogu (kanal başına ≤20.000) her tenant için günde bir akıtır, 2 sa sınırlı (ExternalReconciliationJob.ts:33-95). `redisSkip` bağlam geçirmez → `heartbeat/signal` yok (schedules.ts:47-50); lease TTL = maxDurationMs, yenilenmez (runJob.ts:197-210). Lease küresel olduğundan pod eklemek bu işleri ölçeklemez.
- Etki: E tablosundaki eşiklerde (örn. t_q=5 ms ile ~2.500 tenant) stock.publish turu 25 sn'yi aşar → lease düşer, başka pod'da çift koşu, JobState "hung"; döngü bitince everyMs beklendiği için gerçek kadans uzar ve stok yayını (zero-oversell debounce'u, ADR-0004) gecikir. externalReconciliation tüm tenant'lar için aynı anda başlar, pazaryeri katalog çağrıları T×I×⌈N/sayfa⌉ (sayfa boyutu DOĞRULANAMADI).
- Çözüm yönü: mevcut lease altyapısını koruyup iş başına tenant dilimleme (ör. `order % K`, her dilim ayrı lease/ayrı tur) veya cursor ile sürdürülebilir tarama; `ctx.heartbeat/signal` geçir; "dirty" tenant listesi tutup yalnız onları tara (stock.publish için ApplicationDB'de tenant başına dirty işareti); externalReconciliation'ı jitter/stagger ile yay ve çağrı bütçesine bağla (buybox deseni).

**F-06 Katalog Dispatcher kıtlaşma (head-of-line): atlanan bayraklar öne takılı kalır**
- Kanıt: ExportFlag `sort({priority:-1,lastUpdatedAt:1}).limit(20)` (Dispatcher.ts:37-42); ACTIVE olmayan tenant (:61-65), entitlement reddi (:75-81), kill-switch (:86), ClientDB yok (:92-94) durumlarında `continue` ile `lastUpdatedAt` GÜNCELLENMEZ → bu bayraklar hep sıranın başında kalır; yalnız "leadItem yok" yolu günceller (:174-182).
- Etki: ≥20 askıdaki/silinmiş/kapı-kapalı tenant bayrağı (queuedCount>0) tüm sağlıklı tenant'ların vagonlanmasını durdurur. DOĞRULANAMADI: bu durumun üretimde yaşandığı.
- Çözüm yönü: filtreyi sorguya taşı (yalnız ACTIVE/izinli, blokaj dışı) veya atlananların `lastUpdatedAt`'ini ilerlet; sayfa/cursor ile tüm bayrakları gez.

**F-07 `Clients.lastSuccessfulOrderSync` (üst seviye) hiç güncellenmiyor — backoffice "senkron geride" ve tenant ekranları yanlış**
- Kanıt: üst seviye alan yalnız provizyonda yazılır (TenantProvisioningService.ts:309; Client.ts:33); motor `integrations.$.lastSuccessfulOrderSync` yazar (OrderRepository.ts:280-283). Okuyanlar: backoffice dikkat maddesi (backoffice-attention-support.ts:109-111), tenantOps.ts:137-138,174, tenantLifecycle.ts:41, clientDto.ts:5,16. Doğru kullananlar: health.ts:193, createAlertEvaluator.ts:165.
- Etki: provizyondan 6 sa sonra her aktif tenant "sipariş senkronu 6 sa+ geride" diye listelenir (yanlış pozitif), tenant detayında son senkron zamanı yanlış. Entegrasyon seviyesinde son senkron `getIntegrationHealth` ile API'den okunabiliyor (integration-service.ts:129).
- Çözüm yönü: OrderRepository'de üst seviye alanı entegrasyonların max'ı olarak da yaz VEYA okuyanları `integrations[]`'ten türetmeye çevir (health.ts deseni).

**F-08 Fatura upsert'inde unique indeks yok; aynı tenant×entegrasyon için eşzamanlı işler engellenmiyor**
- Kanıt: InvoiceRepository.ts:32-47 (önce find), :96-112 (filtre integrationCode+externalOrderId+type, upsert), Invoice.ts yalnız `index:true`; tenant×entegrasyon başına karşılıklı dışlama yok (F-01: bekleyen iş varken yeni iş + retry örtüşmesi).
- Etki: yarış durumunda çift fatura kaydı olabilir (Order/Claim/Message/Financial'da unique indeks var, bu tek istisna).
- Çözüm yönü: (integrationCode, externalOrderId, type) için unique indeks (onaylı göçle; Protokol 12) + iş başına tenant×entegrasyon kilidi (F-01 deduplication ile birlikte).

**F-09 Tek Mongo havuzu ve sınırsız tenant tutamağı**
- Kanıt: tek kök bağlantı + `useDb` (ClientDB.ts:9-21,49-63), `DB_POOL_SIZE` 20 (env.ts:192), tutamaklar `Map` (tahliye yok, her biri ~34 model; ClientMongooseSchemas.ts), TenantRegistry LRU max 1000/TTL 30 sn (TenantRegistry.ts:20-28).
- Etki: tüm tarayıcı işler + BullMQ işleri + HTTP aynı 20 bağlantıyı paylaşır; 1.000+ tenant'ta registry isabetsizliği ek sorgu üretir; tutamak başına bellek DOĞRULANAMADI.
- Çözüm yönü: önce ölç (bağlantı kullanımı/kuyruk); havuzu role göre ayır (worker için daha büyük), registry LRU'yu tenant sayısına göre boyutlandır, tarayıcıları dilimle (F-05).

### P2

**F-10 Manuel "şimdi senkronize et" yok.** Sipariş/iade/finans/mesaj için RPC yok; `isManualTrigger` ölü alan (OrderQueueProducer.ts:134,233; interfaces/order/index.ts:51). Yalnız ürün içe alma kullanıcı tetiklemeli ve "aktif iş varsa reddet" koruması var (importJobs.ts:24-31), tamamlandıktan sonra bekleme yok. Eklenirse: `enqueueWebhookTriggeredSync` deseni (jobId + 10 sn tekilleştirme) + tenant başına cooldown + kill-switch kapısı.

**F-11 Webhook kapsamı/sertleştirme.** Yalnız Trendyol; abonelik kaydı otomatik değil (DOĞRULANAMADI elle yapılıp yapılmadığı); `integrations.webhookToken` indeksi yok (Client.ts:61-65); oran sınırı süreç-içi; token DB'de düz metin (tahmin edilemez URL bileşeni olarak bilinçli, settings.ts:150-157).

**F-12 Retry-After işleme sınırlı.** Yalnız ≤60 sn ve ≤4 deneme (ResilientHttpClient.ts:400); başlıksız 429'da bekleme yok → BullMQ 2 sn backoff (OrderQueueProducer.ts:24-28) aynı kovaya tekrar vurur. Çözüm: RATE_LIMITED'da `retryAfterMs` kadar işi ertele.

**F-13 Günlük süpürme patlaması ve yeniden deneme.** `staggerHour = order % 24` (OrderQueueProducer.ts:124): aynı UTC saatte T/24 tenant×I × (iade 32 gün + finans 30 gün) tam pencere; başarısız süpürme o saat boyunca her dakika yeniden iş üretir (computeSourceWindow :259-266 `lastFullSweepAt` yazılmadıkça). Çözüm: saat içi dilim/jitter + süpürme başarısızlığında üstel bekleme.

**F-14 Zamanlayıcıda jitter yok, açılışta fırtına.** `jitterPct` hiçbir işte verilmemiş (schedules.ts); 17 iş `runOnStart:'always'` ile aynı anda koşar; tur süresi sonrası everyMs beklendiği için kadans sabit-hız değildir (scheduleJob.ts:292-296). Çözüm: iş başına `jitterPct` (mevcut alan, tek satır).

**F-15 Ölü/çelişkili ayar ve belge.** `resilience.retry.*`, `resilience.breaker.*`, `resilience.factoryCallTimeoutMs` tüketicisiz (integrationHttp.ts:67-130; AdapterHttpService.ts:49-57); `order.config.json: retryLimits.timeoutMs` orphan (config/catalog/engine.ts:36); HB descriptor `documented.perSecond:1000` ile API_CONTRACTS çelişkisi (descriptor.ts:90); engine/order/README.md güncel değil (10 dk / küresel Redis limit).

**F-16 Kategori/marka/öznitelik istek-anında pazaryerine.** Önbellek/zamanlanmış yenileme yok (platformLookup.ts:22-31; Trendyol Category/BrandConnector'da önbellek bulunamadı); kullanıcı sayısı arttıkça kategori ağacı çağrıları pazaryeri kotasına doğrudan yansır. DOĞRULANAMADI: frontend önbelleği.

**F-17 Gözlemlenebilirlik boşlukları.** Backoffice "Motor ve kuyruklar": `getQueues/listFailedJobs/retryJob(s)/discardJob/getStateMachineJobs/releaseStuckLease/listJobRuns` var (backoffice-engine-service.ts:27-35; engineOps.ts) ama `ENGINE_QUEUES = ['order-sync-queue']` (engineOps.ts:13) — katalog hattının kuyruk gecikmesi (ExportSignals createdAt→lockedAt), Redis INFO örneklemesi ve pazaryeri 429 dakikalık sayacı ADR-0005'te planlandığı gibi QueueMetrics'e bağlanmamış (kod aramasında yalnız worker-runner.ts:31-35 yazıyor); producer/katalog döngüleri JobState'te yok; 429 için `recordRateBucketMetric` var (ResilientHttpClient.ts:~383) ama tenant/pod başı. Redis `maxmemory-policy noeviction` kontrolü: docker-compose bu kopyada yok → DOĞRULANAMADI.

**F-18 Kapanış ve başlangıç yarışları.** Export/Import `while(true)` ve OrderOrchestrator `setInterval` kapanışta durdurulamaz (shutdown.ts başlık: "BİLİNEN SINIRLAMA"); `IntegrationFactory` global önbelleği her 5 dk tümden temizlenir (IntegrationFactory.ts:62-69) → tüm tenant'lar aynı anda yeniden çözümleme (kimlik çözme + DB okuma). ImportJob için web→worker sinyal yarışı (EventBus süreç-içi) en fazla 30 sn gecikme (importLoopDelay); Export'ta exportSignalPoll bunu çözdü, Import'ta eşdeğeri yok.

---------------------------------------------------------------------
## Doğrulanamayanlar (ek inceleme gerekir)
- Gerçek iş süresi d (BullMQ procMs), tenant/entegrasyon dağılımı, üretimdeki pod sayısı, Redis RTT, Mongo sorgu gecikmesi t_q (QueueMetrics/JobRuns canlı verisi bu kopyada yok).
- Pazaryeri limitlerinin kapsamı (satıcı / IP / uygulama) ve HB/Pazarama gerçek limitleri.
- Trendyol webhook aboneliğinin elle/otomatik kaydı.
- Okunmayan işler: billing.trialExpiry, compliance.*, notifications.*, alerts.evaluator iç yükleri.
- Redis `maxmemory-policy`, docker-compose (kopyada yok); ClientDB tutamak başına bellek.

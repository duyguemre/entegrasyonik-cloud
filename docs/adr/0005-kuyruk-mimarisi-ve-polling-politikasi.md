# 0005 — Kuyruk mimarisi (BullMQ + Mongo durum makinesi), Redis bağımlılığı, ölçüm ve polling/webhook politikası

## Durum
Kabul edildi (2026-09-26). Uygulama: Faz 2 (BACKLOG C7, C14 ve planned "kuyruk birleştirme kararı", "webhook/delta").

## Bağlam
- `INTEGRATION_ENGINE_STANDARDS.md#8-kuyruk-mimarisi-matris-6--kismen`: iki mekanizma var — sipariş hattı Redis+BullMQ (`order-sync-queue`, `concurrency=5` tek havuz, `attempts=5`, üstel 2 sn), katalog hattı Redis'siz Mongo durum makinesi (`ExportSignals`/`ExportFlag`/`ImportJobs`, atomik `findOneAndUpdate` sinyal kilidi, süreç-içi EventEmitter ile uyanma, 5 dk üst sınırlı uyku). Redis Streams yok. DLQ Mongo'da, yalnızca yazıcı var.
- `#19`: Redis bağlantısı kurulamazsa süreç `exit(1)` — katalog hattı Redis kullanmadığı halde. `REDIS_PASSWORD` okunuyor ama bağlantıya iletilmiyor.
- `#8` ölçüm: kuyruk bekleme süresi, throughput, Redis CPU/bellek ölçülmüyor (`removeOnComplete:true` iş zaman damgalarını siliyor). Skill eşikleri (gecikme >30 sn, >500 mesaj/dk, Redis >%70) kalibre edilemiyor.
- `#10` polling: sipariş+iade+mesaj+finans her (tenant×entegrasyon) için **20 sn**'de bir; iade her turda son **32 gün**, finans son **30 gün** tam çekim; mesaj `lastSync − 5 sa`. Webhook alıcısı yok.
- `#9` / C7: sipariş çekimi başarısız olsa da `lastSuccessfulOrderSync` ilerliyor ve iş bitiş anıyla (`new Date()`) yazılıyor.
- `docs/research/1f-findings.md`: Trendyol webhook yalnızca **sipariş durumu** olayları için (stok/fiyat webhook'u yok); başarısız teslimde 5 dk'da bir yeniden dener, sonra webhook'u otomatik pasife alır → mutabakat polling'i şart. Hepsiburada sipariş webhook modeli var (kısmen doğrulanamadı). N11/Pazarama webhook dokümanı yok. Trendyol yeni `/v2/orders` sorgu başına ≤10.000 kayıt.
- Ölçek kestirimi (bugün): ≤9 tenant × ~3 bağlı entegrasyon × 3 tur/dk (20 sn) ≈ **~80 iş/dk** sipariş hattı; her iş 4 pazaryeri çağrısı → ~320 dış çağrı/dk. Kuyruk mekanizması bu hacmin çok üstünde kapasiteye sahip; asıl baskı pazaryeri kotaları üzerinde.

## Değerlendirilen Alternatifler

**A. Birleştirme**
1. *İkisini de BullMQ'ya taşı* — artı: tek mekanizma, tek gözlem noktası. Eksi: katalog durumu (ürün başına QUEUED/PREPARING/…/COMPLETED, `logs[]`) zaten kullanıcıya gösterilen domain verisi; BullMQ'ya taşımak durumu ikiye böler (iş Redis'te, sonuç Mongo'da), çalışan ve kilidi atomik olan bir hattı riske atar. Yüksek maliyet, düşük getiri.
2. *İkisini de Mongo durum makinesine taşı* — artı: Redis bağımlılığı kalkar. Eksi: zamanlanmış/tekrarlanan işler, retry/backoff, eşzamanlılık sınırı ve stalled-job kurtarma yeniden yazılır; BullMQ'nun verdiği şeyi kopyalamak.
3. *Redis Streams'e geç* — skill "önce Redis Streams" der; ancak BullMQ zaten Redis üzerinde ve daha üst seviye (retry, delay, repeat). Streams eklemek üçüncü mekanizma olur. Reddedildi.
4. *Mevcut ayrımı koru, sınırları netleştir* — sipariş/zamanlanmış/kısa işler BullMQ; uzun ömürlü, kullanıcıya görünen katalog durumu Mongo durum makinesi.

**B. Redis bağımlılığı**
1. *Zorunlu, yoksa süreç çıkar (bugün)* — basit ama katalog hattını ve web'i gereksiz yere düşürür; açılışta Redis gecikirse crash-loop.
2. *Tamamen opsiyonel, sipariş hattı Redis'siz de çalışsın* — ikinci yol (bellek-içi kuyruk) yazmak gerekir; çok pod'da tutarsız. Reddedildi.
3. *Sipariş hattı için zorunlu, süreç için değil* — Redis yokken süreç ayakta kalır, sipariş zamanlayıcısı duraklar, bağlantı geri gelince imleçten (cursor) devam eder; `/ready` durumu yansıtır.

**C. Kafka/RabbitMQ'ya geçiş** — bugün hiçbir ölçüm gerekçe sunmuyor; yalnızca sayısal eşikle (aşağıda).

**D. Polling/webhook**
1. *20 sn'de tüm pencereleri çek (bugün)* — kota israfı, ban riski; 32/30 günlük tam pencereler her turda.
2. *Yalnızca webhook* — Trendyol'da yalnızca sipariş durumu; webhook pasife düşebilir; diğer pazaryerlerinde yok. Tek başına yetersiz.
3. *Delta imleçli, kaynağa göre farklı sıklıkta polling + destekleyen pazaryerinde webhook'u "uyandırma sinyali" olarak kullan* — seçilen.

## Karar
Kuyruklar **birleştirilmez**: sipariş/zamanlanmış işler BullMQ'da, katalog export/import Mongo durum makinesinde kalır; Redis Streams eklenmez; Redis yalnızca sipariş hattı için zorunlu olur (süreç Redis yokken çıkmaz); ölçüm Mongo'da dakikalık kovalarla toplanır ve Kafka/RabbitMQ yalnızca aşağıdaki sayısal Seviye-3 eşiğinde, varsayılan olarak tek seferlik cutover ile değerlendirilir; sipariş polling'i 60 sn delta imlecine, iade/finans tam pencereleri günlük süpürmeye indirilir ve Trendyol sipariş durumu webhook'u sync'i tetikleyen uyandırma sinyali olarak eklenir.

Ayrıntılar:

1. **Sınır kuralı (yeni iş nereye?):** Saniye-dakika ölçeğinde, zamanlanmış, tekrar denenebilir, sonucu başka bir domain dokümanına yazılan işler → BullMQ (sipariş sync, webhook uyandırma, oversell grace zamanlayıcısı [0004], stok yayını debounce tetikleyicisi). Ürün/kalem başına kullanıcıya gösterilen durum taşıyan, saatler-günler süren işler → Mongo durum makinesi. Yeni bir üçüncü mekanizma ADR olmadan eklenmez.
2. **Redis davranışı:**
   - `RedisService.init` başarısızlığı süreci sonlandırmaz; ioredis yeniden bağlanma (üstel, üst sınır 30 sn) açık kalır. Sipariş zamanlayıcısı Redis bağlı değilken iş eklemez (log + metrik); web ve katalog hattı çalışır.
   - `/ready` Redis durumunu raporlar (0006). Worker rolü için Redis "hazır" koşuludur; web için değildir.
   - `REDIS_PASSWORD` bağlantıya iletilir; BullMQ için Redis `maxmemory-policy noeviction` zorunludur (docker-compose ve yönetilen Redis ayarı, 0006).
   - Kesinti sonrası boşluk C7 düzeltmesiyle kapanır: `lastSuccessfulOrderSync` yalnızca **sipariş çekimi** başarılıysa ve **`syncStartAt − 5 dk`** (örtüşme) değeriyle yazılır; sipariş çekim hatası işi fail eder (BullMQ retry → tükenince Mongo DLQ). Upsert idempotent olduğu için örtüşme çift kayıt üretmez.
3. **Kuyruk ayarları:** `removeOnComplete: { age: 86400, count: 1000 }` (ölçüm için zaman damgaları 24 saat kalır), `removeOnFail: { count: 500 }`; Queue/Worker seçeneklerindeki çelişki tekilleştirilir. FATAL sınıfı hatalar `UnrecoverableError` ile boşa retry'dan çıkarılır (sınıflandırma 0006 hata sözleşmesine göre). DLQ için minimum okuma/yeniden oynatma: admin'de listele + "yeniden kuyruğa al" (Faz 2, küçük).
   Tek havuz (`concurrency=5`) şimdilik korunur; pazaryeri başına ayrı kuyruk yalnızca aşağıdaki "gürültülü komşu" eşiğinde.
4. **Ölçüm (yeni altyapı yok, Mongo + BullMQ olayları):**
   - ApplicationDB `QueueMetrics` koleksiyonu, dakikalık kova dokümanı `{queue, integrationCode, minute, count, failed, retried, waitMsP50, waitMsP95, procMsP95}`; TTL 30 gün. Kaynak: BullMQ `completed/failed` olaylarında `processedOn − timestamp` (bekleme) ve `finishedOn − processedOn` (işleme); süreç içinde dakikalık toplanıp tek `upsert` ile yazılır.
   - Katalog hattı: `ExportSignals` üzerinde `createdAt → lockedAt` (bekleme) ve `lockedAt → completedAt`; aynı koleksiyona `queue: "export"` olarak dakikalık yazılır.
   - Redis: 60 sn'de bir `INFO` örneği (`used_memory`, `maxmemory`, `used_cpu_sys+user` farkı, `connected_clients`, `instantaneous_ops_per_sec`) aynı koleksiyona.
   - Pazaryeri kotası: adaptör katmanında (0006) 429 sayısı ve dış çağrı sayısı dakikalık.
   - Gösterim: mevcut admin paneline tek bir tablo/grafik. Prometheus/Grafana bu ölçekte kurulmaz.
   - Kalibrasyon: Faz 2'de docker-compose (Redis) + mockserver ile 9 tenant × 6 entegrasyon sentetik yük altında 24 saat ölçülür; aşağıdaki eşikler ölçüm sonucu ADR ekinde güncellenir (sayılar düşürülebilir, kaldırılamaz).
5. **Eşik merdiveni (hepsi "7 günün en az 3'ünde, günde ≥ 60 dk kesintisiz" sürekli koşulla):**
   - *Seviye 1 — BullMQ içinde ayar:* kuyruk bekleme p95 > 30 sn → worker concurrency artır; tek bir entegrasyonun bekleme p95'i > 30 sn iken diğerlerininki < 5 sn (gürültülü komşu) → entegrasyon başına kuyruk (`order-sync:<integrationCode>`).
   - *Seviye 2 — altyapı ölçekleme:* throughput > 500 iş/dk **veya** Redis CPU > %70 **veya** Redis bellek > `maxmemory`'nin %70'i → ayrı worker instance'ı (0006 rolleri) ve/veya Redis'i dikey büyüt (en fazla 4 GB).
   - *Seviye 3 — Kafka/RabbitMQ ADR'si açılır:* Seviye 2 uygulandıktan sonra hâlâ throughput > 5.000 iş/dk **veya** Redis 4 GB'de bellek/CPU > %70 **veya** aynı olay akışını tekrar oynatma (replay) ihtiyacı olan ≥ 3 bağımsız tüketici doğması.
   - Bugünkü kestirim (~80 iş/dk) Seviye 2'nin ~1/6'sı; Seviye 3'ün ~1/60'ı.
6. **Geçiş stratejisi (Seviye 3 tetiklenirse):** varsayılan **tek seferlik cutover**: bakım penceresinde üreticiler durdurulur, BullMQ kuyrukları boşaltılır (drain), yeni sistem açılır. Kayıp riski düşük çünkü sipariş hattının gerçek durumu Mongo'da (imleç + idempotent upsert) — kuyruk kaybı yalnızca bir sonraki polling turunda telafi edilir. Dual-write pilotu **seçilmez**; yalnızca o gün kuyrukta Mongo'da izi olmayan, telafisi mümkün olmayan iş türleri (ör. yalnızca kuyrukta yaşayan dış yazma komutları) bulunursa değerlendirilir.
7. **Polling/delta politikası (tenant×entegrasyon başına):**

   | Kaynak | Bugün | Karar |
   |---|---|---|
   | Sipariş | 20 sn, imleç | **60 sn**, imleç `lastSuccessfulOrderSync − 5 dk`; webhook sağlıklıysa **5 dk** mutabakat |
   | İade (claims) | 20 sn, her turda 32 gün | **15 dk**, imleç `lastClaimSync − 1 sa`; **günde 1** tam 32 gün süpürme (gece, tenant'lara yayılmış) |
   | Finans | 20 sn, her turda 30 gün | **6 sa**, imleç `lastFinanceSync − 24 sa`; **günde 1** tam 30 gün süpürme |
   | Mesaj (soru-cevap) | 20 sn, `lastSync − 5 sa` | **5 dk**, imleç `lastMessageSync − 15 dk` |

   Her kaynağın ayrı imleci olur (tek `lastSuccessfulOrderSync` yerine), yalnızca o kaynağın çekimi başarılıysa ilerler. Pazaryeri tarih hassasiyeti (HB gün bazlı `beginDate`) imleci aşağı yuvarlar; idempotent upsert fazlayı emer. 60 sn seçimi: 0004'teki oversell penceresini belirleyen asıl değişken sipariş algılama gecikmesi; skill'in "örn. 5 dk" önerisi sipariş için oversell riskini artırır, 20 sn ise kotayı ~3 kat fazla tüketir.
8. **Webhook alıcısı:**
   - **Trendyol sipariş durumu webhook'u Faz 2'de eklenir** (skill: destekleyen pazaryerinde zorunlu). Ön koşul: 0001–0003 setindeki kimlik doğrulama düzeltmesi (C1) tamamlanmış olmalı — yeni herkese açık uç, düzeltilmemiş auth katmanının yanına açılmaz.
   - Tasarım: `/hooks/trendyol/:hookToken` (tenant×entegrasyon başına rastgele, döndürülebilir token; pazaryerinin desteklediği kimlik doğrulama başlığı da doğrulanır). Gövde **veri kaynağı olarak kullanılmaz**; yalnızca ilgili (tenant, entegrasyon) için `order-sync` işi eklenir (jobId ile 10 sn içinde tekilleştirilir) ve 200 hızlıca döner. Böylece sıra, tekrar ve sahte olay riski API'den çekilen gerçek durumla çözülür (0004 seviye tetiklemeli model).
   - Webhook sağlık izleme: son 30 dk'da tenant'ın sipariş algıladığı halde webhook gelmemişse webhook "şüpheli" sayılır ve sipariş polling'i 60 sn'ye döner; pasife düşen webhook günlük kontrol edilip yeniden kaydedilir.
   - Hepsiburada sipariş webhook'u: resmi doküman teyit edilince aynı desenle (Faz 2 sonu/Faz 3). N11, Pazarama, Ideasoft, BizimHesap: webhook dokümanı yok → yalnızca yukarıdaki polling; gerekçe bu ADR.
   - Yerel geliştirmede herkese açık giriş yok: webhook uçları mockserver'dan çağrılarak test edilir; tünel servisi kurulmaz.

## Gerekçe
- İki mekanizmanın her biri kendi işine uygun ve çalışıyor; birleştirme, tek haneli ölçekte ölçülebilir bir sorunu çözmeden kararlı bir hattı yeniden yazmak olur (skill: "daha kolay olur" gerekçesi yetersiz). Karmaşıklığı azaltan şey birleştirme değil, sınır kuralı ve ortak ölçümdür.
- Redis'i yalnızca sipariş hattının bağımlılığı yapmak, crash-loop ve katalog kesintisini ortadan kaldırır; ikinci bir kuyruk implementasyonu yazmayı gerektirmez.
- Ölçümü Mongo'ya yazmak ek servis getirmez; eşiklerin tamamını karşılayacak veriyi üretir.
- Polling'i imleçli ve kaynağa göre ayrışık yapmak pazaryeri çağrı hacmini kabaca **~320/dk → ~40/dk** (9 tenant × 3 entegrasyon) indirir; ban/kota riskini ve sızıntıya yol açan cache ihtiyacını (C3) azaltır.
- Webhook'u sinyal olarak kullanmak doğrulama/sıralama/güvenilirlik sorunlarını en ucuz yoldan çözer ve Trendyol'un webhook'u pasife alma davranışına karşı dayanıklıdır.

## Maliyet/Ölçek Notu
- Ek servis yok. Ek maliyet: `QueueMetrics` koleksiyonu (30 gün TTL, ~9×6×1440 ≈ 78 bin küçük doküman/gün üst sınır; pratikte daha az), bir webhook rotası, kaynak başına imleç alanları, günlük süpürme işleri.
- Yeniden değerlendirme eşikleri: yukarıdaki Seviye 1/2/3 merdiveni (bekleme p95 > 30 sn; > 500 iş/dk; Redis > %70; Seviye 3: > 5.000 iş/dk veya 4 GB Redis'te > %70 veya ≥ 3 replay tüketicisi). Ayrıca:
  - Herhangi bir pazaryerinde 429 oranı dış çağrıların > %1'i (7 gün ortalaması) → o kaynağın polling sıklığı düşürülür / webhook önceliği artırılır.
  - Sipariş algılama gecikmesi p95 > 2 dk (webhook'lu kanal) veya > 90 sn (polling'li kanal) → sıklık/webhook sağlığı gözden geçirilir.
  - Aktif tenant > 50 → polling sıklıkları ve günlük süpürmelerin tenant'lara yayılması yeniden hesaplanır; webhook'suz kanallar için sıklık tenant planına bağlanabilir.

## Etki Alanı
`services/redis/RedisService.ts`, `entegrasyonik.ts` (başlatma sırası), `integration/engine/order/{OrderQueueProducer,OrderWorker,OrderOrchestrator,OrderErrorHandler,worker-runner}.ts`, `order.config.json`, `integration/engine/export/*` (yalnızca ölçüm), ApplicationDB (`QueueMetrics`, DLQ okuma), `ClientIntegrations` (kaynak başına imleçler, webhook token), yeni webhook rotası (`Webserver.ts`), admin paneli (metrik görünümü), mockserver (webhook çağrısı). İlişkili: 0004 (sipariş algılama gecikmesi = oversell penceresi), 0006 (roller, `/ready`, hata sözleşmesi), 0001–0003 (auth — webhook ön koşulu; cache anahtar politikası).

## Ek (2026-09-27) — Uygulama notu: Aşama A (Karar 1–5, 7; Karar 8/webhook HARİÇ)
**Yapıldı:** (1) `RedisService.init()` artık bağlantı hatasında reject etmiyor (`error` olayında da `resolve()`); `getConnectionConfig().retryStrategy` üstel, üst sınır 30sn; `entegrasyonik.ts` `RedisService.init()`'i try/catch'e aldı. (2) BACKLOG C7 kapandı: sipariş çekim hatası artık işi fail ettirir; imleç `syncStartAt−5dk` ile ve yalnızca başarılı sipariş çekiminde yazılır; "dört kaynak da boş" erken-dönüş kısayolu kaldırıldı. (3) Kaynak başına imleç + gating: pencere hesaplama `OrderWorker`'dan `OrderQueueProducer.computeSourceWindow()`'a taşındı; `IOrderJobData.claimSync/financeSync/messageSync` alanı yoksa `OrderWorker` o kaynağı hiç çağırmaz. (4) Queue/Worker `removeOnComplete`/`removeOnFail` tekilleşti (`order.config.json > memoryManagement`); `worker-runner.ts` `IntegrationError.retryable===false` hatalarını `UnrecoverableError`'a sarıyor. (5) `QueueMetrics` koleksiyonu + `QueueMetricsCollector` (best-effort, `IntegrationCallMetrics` deseni) kuruldu.

**Kasıtlı sapmalar (bulgu olarak kayıt, insan kararı gerekirse):**
- Karar 2'nin "`lazyConnect`/`enableOfflineQueue` ayarlarını ADR gereksinimine göre ayarla" ifadesi **`enableOfflineQueue`/`lazyConnect` DEĞİŞTİRİLEREK değil**, `RedisService.isReady()` (yeni, `ioredis.status==='ready'` kontrolü) ile `OrderQueueProducer.scheduleJobs()`'ın en başında açık bir ön-kontrol eklenerek karşılandı. Gerekçe: `enableOfflineQueue:false` BullMQ'nun kendi Queue/Worker/QueueEvents bağlantılarına da (aynı `getConnectionConfig()` paylaşılıyor) uygulanırdı ve BullMQ'nun offline-queue'ya dayanan iç yeniden bağlanma davranışını bozma riski taşırdı — bu risk ADR'de ölçülmemiş/gerekçelendirilmemişti. Açık ön-kontrol aynı fonksiyonel sonucu (Redis bağlı değilken iş eklenmez) daha düşük riskle ve daha kolay test edilebilir şekilde verir.
- `QueueMetricsCollector` **BullMQ `completed`/`failed` olaylarına (`OrderOrchestrator.setupEventListeners`) ve Redis `INFO` periyodik örneklemesine henüz bağlanmadı.** `OrderOrchestrator`/`ExportOrchestrator`/`ImportOrchestrator`/`IntegrationEngine` `MASTER_STATE.md`'de "characterization testi olmadan dokunulmaz (kapsam %0)" olarak işaretli (ADR-0006 Faz A notu); bu görevin kapsamında o testleri yazmak ayrı ve büyük bir alt görev olurdu. Toplama altyapısı (model + collector) kendi testleriyle doğrulandı ve bağlanmaya hazır; bağlama işlemi önce o dört sınıf için characterization testi yazılmasını bekliyor.
- Katalog hattı ölçümü (`ExportSignals` `createdAt→lockedAt→completedAt`) ve pazaryeri kotası (429/dış çağrı sayısı) ölçümü de aynı sebeple bağlanmadı.
- Webhook (Karar 8) bu aşamada işlenmedi — Aşama B, ayrı görev.

# 0006 — Dayanıklılık katmanı, hata sözleşmesi ve süreç topolojisi

## Durum
Kabul edildi (2026-09-26). Uygulama: Faz 2 (BACKLOG C9, C10'un hata yolu, C14; planned "dayanıklılık katmanı", "docker-compose", "health/ready").

## Bağlam
- `INTEGRATION_ENGINE_STANDARDS.md#9`: circuit breaker YOK; retry pazaryeri başına kopya kod ve tutarsız (Trendyol 3 deneme, POST/PUT dahil ağ hatasında da; Hepsiburada yalnızca 429; N11/Ideasoft/BizimHesap retry yok), jitter yok. Eşzamanlılık sınırları süreç-içi (`pLimit`, `axios-rate-limit`). `IntegrationFactory` 120 sn `Promise.race` ile sarıyor ama alttaki HTTP isteğini iptal etmiyor. `OrderErrorHandler` hata sınıfını mesaj metninde `includes('429')` gibi aramalarla buluyor (clientId=401 yanlış sınıflanır); FATAL işler yine de retry ediliyor. `export.config.json` retry anahtarları hiç okunmuyor.
- `INTEGRATIONS_REGISTRY.md` / BACKLOG C9: N11 `approveOrder/rejectOrder` ve Hepsiburada `updateProductVariant/updateProductDelivery` çağrı yapmadan `true` döner; Trendyol `OrderConnector`/`ClaimConnector`/`MessageConnector` hata durumunda `[]` döner (hata = "sipariş yok"); N11 REST hatası boş `catch` ile yutulup SOAP'a düşer; Ideasoft `sendOrderInvoice` no-op `success:true`. C10: Ideasoft gerçek modda token akışı kopuk.
- `#7`, `#11`, `#16`, `#18`, C14: web ve tüm işçiler aynı süreçte; `RUN_WORKERS_EMBEDDED` `.env`'de var, kodda okunmuyor. `Dispatcher` (`find → updateMany → create`) ve `Sync.runOnce` (`find → updateMany`) çok pod'da atomik değil; platform kilidi süreç-içi `Set`; `POD_NAME` yoksa `undefined`; zombi kilit süresi 30 dk. `/health` `/ready` yok, docker-compose yok, backend Dockerfile çalışmaz görünüyor (`CMD application.js`, `npm install` yorumda, `node_modules` imajda yok, root kullanıcı). Graceful shutdown HTTP sunucusunu, BullMQ worker'ını, döngüleri, Redis'i kapatmıyor; `uncaughtException` yutulup süreç devam ediyor. Scale-to-zero'ya uygun değil (`while(true)` + `setInterval`).
- Skill (`integration-engine-standards`): backoff 1/2/4/8 sn (üst sınır ~30 sn), 5 ardışık hata → açık, yarı açıkta tek test isteği; `/health` + `/ready`; docker-compose yalnızca Redis + servisler, **Mongo dahil değil** (`LOCAL_DB_URL`); "her entegrasyon servisi kendi Dockerfile'ı"; Kubernetes yok.
- Ölçek: tek haneli abone, bugün tek instance dağıtım.

## Değerlendirilen Alternatifler

**A. Dayanıklılık katmanının yeri**
1. *Adaptör başına (bugünkü gibi) ama düzeltilmiş* — artı: yerel esneklik. Eksi: 6 kopya, tutarsızlık zaten bulgunun kendisi.
2. *Tek paylaşımlı HTTP istemci katmanı, adaptör başına politika yapılandırması* — artı: tek kod yolu, tek test seti, ortak metrik/log; adaptör yalnızca limit/timeout değerlerini ve hangi çağrının idempotent olduğunu bildirir. Eksi: N11 SOAP ve farklı auth akışları için esnek arayüz gerekir.
3. *Servis ağı (sidecar/proxy)* — bu ölçekte aşırı; reddedildi.

**B. Uygulama**
1. *`cockatiel` (TypeScript, bağımlılıksız; retry + circuit breaker + timeout + bulkhead)* — artı: skill semantiğini birebir karşılar, test edilmiş. Eksi: yeni bağımlılık (küçük).
2. *Kendi ~150 satırlık uygulamamız* — artı: bağımlılık yok. Eksi: yarı açık durum, iptal, jitter gibi kenar durumları yeniden test etmek.
3. *`opossum`* — breaker odaklı, retry/timeout ayrı; daha az uygun.

**C. Breaker durumunun yeri**
1. *Süreç belleği* — sıfır altyapı; çok replikada her replika kendi sayacını tutar.
2. *Redis* — replikalar arası ortak; ek gecikme/karmaşıklık, Redis'e yeni kritik bağımlılık.

**D. Süreç topolojisi**
1. *Tek süreç (bugün)* — ucuz; bir işçi OOM'u API'yi düşürür.
2. *Tek imaj, rol ile başlatma (`web` / `worker` / `all`)* — kod bir kez ayrılır, dağıtım ölçeğe göre seçilir.
3. *Entegrasyon başına ayrı imaj/Dockerfile (skill ifadesi)* — 6 imaj, 6 dağıtım; tek haneli ölçekte işletim yükü getirinin çok üstünde.

## Karar
Tüm dış çağrılar tek paylaşımlı HTTP dayanıklılık katmanından (cockatiel tabanlı; retry + tam jitter'lı 1/2/4/8 sn backoff + 5 ardışık hatada açılan süreç-içi circuit breaker + AbortController'lı timeout + limiter) geçer ve bağlayıcılar tipli `IntegrationError` fırlatmak zorundadır (sahte başarı ve hata yutma yasak); backend tek imajdan `APP_ROLE=web|worker|all` ile başlatılır (bugün tek `all` instance), çok instance'tan önce Dispatcher/Sync/platform kilitleri Mongo lease'e taşınır, `/health` + `/ready`, sıralı graceful shutdown ve yalnızca Redis + servisleri içeren docker-compose eklenir; scale-to-zero ve entegrasyon başına imaj eşiğe kadar ertelenir.

Ayrıntılar:

1. **Paylaşımlı katman (`integration/modules/common/http/` benzeri tek modül):**
   - Politika, adaptör başına yapılandırma nesnesiyle verilir: `{ timeoutMs, maxConcurrent, ratePerMin, retry: {...}, breaker: {...} }`. Varsayılan: timeout 30 sn (Hepsiburada 60 sn), retry en fazla 4 (toplam 5 deneme), gecikme 1/2/4/8 sn × tam jitter, üst sınır 30 sn.
   - **Retry yalnızca güvenli olanlara:** okuma (GET ve okuma amaçlı POST, örn. Pazarama sipariş sorgusu — adaptör `idempotent: true` işaretler) → ağ hatası, timeout, 5xx, 429'da. **Yazma** (stok/fiyat/durum/kargo/fatura) → yalnızca 429'da ve isteğin gönderilmediği kesin bağlantı hatalarında (`ECONNREFUSED`, DNS); timeout/5xx'te otomatik retry YOK, sonuç `UNKNOWN_OUTCOME` olarak döner ve üst katman doğrular (batch durum sorgusu / sonraki mutabakat). Trendyol'daki bugünkü "POST/PUT ağ hatasında tekrar" davranışı bu kuralla kaldırılır (0004'teki "aynı gövde 15 dk" hatasının da kaynağı olabilir).
   - **429 / Retry-After:** `Retry-After` (saniye veya HTTP tarihi) ≤ 60 sn ise ona uyulur (backoff yerine); > 60 sn veya retry bütçesi bittiyse `RATE_LIMITED` fırlatılır ve üst katman işi o süre kadar erteler (BullMQ `delay` / sinyal `nextRunAt`). 429 breaker sayacını artırmaz (kesinti değil, kota); art arda 429'da limiter hızı yarıya indirilir, 5 dk başarılı çalışmada geri artırılır.
   - **Circuit breaker:** anahtar `clientId × integrationCode × (read|write)`; sayılan hatalar: 5xx, timeout, ağ hatası, 408. 4xx (408/429 hariç) sayılmaz. 5 ardışık → açık 30 sn → yarı açık tek deneme → başarısızsa açık süre ikiye katlanır (üst sınır 5 dk). Açıkken istek atılmaz, `UNAVAILABLE` (`circuitOpen: true`) fırlatılır. Okuma ekranları zaten Mongo'daki son bilinen veriyi gösterir; kullanıcıya "<Pazaryeri> geçici olarak ulaşılamıyor, <süre> sonra tekrar denenecek" mesajı.
   - **Timeout:** her istek `AbortController` ile gerçekten iptal edilir. `IntegrationFactory`'deki 120 sn `Promise.race` dış emniyet olarak kalır, ancak iptal sinyalini iletir.
   - Limiter/eşzamanlılık: mevcut `pLimit`/`axios-rate-limit` bu katmana taşınır (davranış korunur, değerler 1f'deki resmi limitlere göre adaptör yapılandırmasında). Pod'lar arası paylaşılan limiter şimdilik yok (tek worker).
   - SOAP (N11) aynı katmanı `request` fonksiyonu enjekte ederek kullanır; auth/token yenileme (Pazarama 401, Ideasoft refresh) adaptörün "auth hook"u olarak katmana verilir ve bir kez denenir.
   - Metrik: her çağrı için `integrationCode, operation, status, durationMs, retries, circuitState` dakikalık olarak 0005'teki `QueueMetrics`'e benzer bir `IntegrationCallMetrics` kovasına (aynı koleksiyon, `kind: "http"`).
2. **Hata sözleşmesi (tüm `IPlatform` metotları için bağlayıcı):**
   - Tek hata tipi `IntegrationError { code, retryable, integrationCode, operation, clientId, httpStatus?, retryAfterMs?, platformCode?, message }`; `code ∈ AUTH | RATE_LIMITED | UNAVAILABLE | VALIDATION | NOT_FOUND | NOT_SUPPORTED | UNKNOWN_OUTCOME | INTERNAL`. `message` temizlenmiş olmalı (istek başlıkları, auth, gövde içindeki kimlik bilgisi yok; loglama/redaction ADR'si ile uyumlu).
   - **Yasaklar:** (a) hata yakalayıp `[]`, `null`, `{}` veya `true` dönmek; (b) gerçek çağrı yapmadan başarı dönmek; (c) boş `catch`. Desteklenmeyen işlem `NOT_SUPPORTED` fırlatır (N11 approve/reject, HB `updateProductVariant/Delivery`, Ideasoft `sendOrderInvoice` gerçek uygulanana kadar). Pazaryerinin "otomatik onaylıyor" gibi bilinçli no-op'u (Trendyol `approveOrder`) açık bir sonuç tipiyle döner: `{ performed: false, reason: 'PLATFORM_AUTO' }` — `true` değil.
   - Yedek yol (N11 REST → SOAP) yalnızca `UNAVAILABLE`/`NOT_SUPPORTED`'ta ve loglanarak kullanılır; `AUTH`/`VALIDATION`'da yedeğe düşülmez.
   - Tüketiciler: `OrderErrorHandler` metin eşleşmesi yerine `code`/`retryable` okur; `retryable=false` → `UnrecoverableError` (DLQ, boşa retry yok). Katalog Publisher `UNAVAILABLE/RATE_LIMITED`'da kalemi FAILED yapmaz, sinyali `nextRunAt` ile erteler; `VALIDATION`'da FAILED + kullanıcı mesajı.
   - Uygulama sırası (Protokol 13): önce her adaptör için mevcut sahte-başarı/yutma davranışını sabitleyen characterization testi, sonra değişiklik, sonra mockserver'ın 500/429/timeout döndürdüğü **sözleşme testi** ("hata → `IntegrationError` fırlatılır, `[]` dönmez") her adaptörde kalıcı test olarak kalır.
3. **Süreç topolojisi:**
   - `APP_ROLE` (varsayılan `all`): `web` → yalnızca Express/API (+ webhook alıcısı, 0005); `worker` → `IntegrationEngine` (Export/Import/Order orkestratörleri, BullMQ worker'ı, zamanlayıcılar); `all` → ikisi. `RUN_WORKERS_EMBEDDED` kaldırılır (hiç okunmadığı için geriye uyumluluk gerekmez; `.env.example` güncellenir).
   - **Bugünkü dağıtım: tek `all` instance.** Kod ayrımı şimdi yapılır (düşük maliyet, test edilebilirlik), fiziksel ayrım eşikte.
   - Yeni bir "entegrasyon başına Dockerfile" yapılmaz (skill ifadesinden bilinçli sapma, gerekçesi aşağıda). Ara çözüm hazır tutulur: aynı imaj `WORKER_INTEGRATIONS=trendyol,n11` gibi bir filtreyle yalnızca belirli entegrasyonların işlerini işleyebilir (0005 Seviye-1 entegrasyon başına kuyrukla birlikte); ayrı imaj gerekmez.
4. **Çok instance güvenliği (ikinci worker replikası açılmadan ÖNCE zorunlu; tek instance'ta da zararsız olduğu için Faz 2'de yapılır):**
   - `Dispatcher`: kalemleri `find → updateMany` yerine tenant×platform `ExportFlag` dokümanı üzerinde lease ile talep eder: `findOneAndUpdate({ _id, $or: [{ leaseUntil: { $lt: now } }, { leaseOwner: me }] }, { $set: { leaseOwner: me, leaseUntil: now + 5dk } })`; lease sahibi olmayan pod o turda o bayrağı atlar. Aynı desen `Sync.runOnce` için sinyal başına `findOneAndUpdate` (toplu `updateMany` yok) ve süreç-içi `activePlatformLocks` `Set`'inin yerine.
   - Lease: 5 dk, çalışan iş 1 dk'da bir yeniler (heartbeat); 30 dk'lık `lockTimeout` ve açılışta "yalnızca kendi `POD_NAME` kilitlerini temizle" mantığı lease süresiyle değiştirilir (pod adı değişse de 5 dk'da devralınır).
   - Kimlik: `POD_NAME || os.hostname() + ':' + process.pid` tek yardımcıdan; `undefined` olamaz.
   - Import zombi işi `FAILED` yerine lease dolunca kaldığı aşamadan yeniden kuyruğa alınır (Stager/Importer aşamaları idempotent olduğu sürece; değilse characterization testiyle önce belgelenir).
   - Sipariş zamanlayıcısı: her pod'daki `setInterval` + jobId zaman penceresi tekilleştirmesi yeterli (değişmez).
5. **`/health` ve `/ready` (`/api` bağlam yolunun dışında, auth'suz, içerik ayrıntısız):**
   - `/health` → 200 `{status:"ok"}`: süreç ayakta ve event loop yanıt veriyor; bağımlılık kontrolü YOK (liveness'te bağımlılık kontrolü gereksiz yeniden başlatma döngüsü yaratır).
   - `/ready` → ApplicationDB `ping` ≤ 1 sn; rol `worker`/`all` ise Redis `PING` ≤ 1 sn. Başarısızsa 503 + `{mongo:"ok|fail", redis:"ok|fail|n/a"}` (hata metni, host, sürüm bilgisi yok). Kapanış başladığında `/ready` 503 döner.
6. **Graceful shutdown (SIGTERM/SIGINT, toplam üst sınır 25 sn; platformlar genelde 30 sn sonra SIGKILL gönderir):** (1) `/ready` → 503, `server.close()` (yeni bağlantı yok, uçuştaki istekler biter); (2) orkestratör döngülerine durdurma bayrağı, `setInterval`'lar temizlenir; (3) BullMQ `worker.close()` (aktif işler biter), `Queue`/`QueueEvents` kapatılır; (4) sahip olunan lease'ler bırakılır; (5) Redis `quit()`, ClientDB LRU ve ApplicationDB kapatılır; (6) `exit(0)`. Süre aşılırsa `exit(1)`; bırakılamayan lease'ler 5 dk'da kendiliğinden düşer, BullMQ stalled işleri yeniden çalıştırır (upsert idempotent).
   - `uncaughtException` → logla + graceful shutdown + `exit(1)` (platform yeniden başlatır). `unhandledRejection` → Faz 2'de önce 24 saatlik mock çalışmasında sayılır ve kaynakları düzeltilir; sonra aynı "logla + kapan" politikasına geçilir.
7. **Container/yerel geliştirme:**
   - Backend Dockerfile: çok aşamalı (build: `npm ci` + `npm run build`; runtime: `node:20-alpine`, yalnızca `dist` + üretim bağımlılıkları), `USER node`, `CMD ["node","dist/entegrasyonik.js"]` (gerçek çıktı adı), `HEALTHCHECK` → `/health`, `.dockerignore`. Build betiğindeki Windows'a özgü `set NODE_ENV` taşınabilir hale getirilir.
   - Kök `docker-compose.yml`: `redis` (`redis:7-alpine`, `requirepass` `.env`'den, `appendonly yes`, `maxmemory-policy noeviction` — BullMQ gereği), `backend` (`APP_ROLE=all`, `LOCAL_DB_URL` host makinedeki Mongo'ya `host.docker.internal` üzerinden), isteğe bağlı `mockserver` profili (`--profile mock`; C15 kararı verilmeden başlatılmaz). **MongoDB servisi eklenmez.** Frontend Vite ile yerelde çalışır, compose'a girmez. Sır değerleri compose dosyasına yazılmaz.
8. **Scale-to-zero:** hedef değil. `web` rolü durumsuz olduğu için teknik olarak uygundur ve barındırma platformu destekliyorsa yalnızca soğuk başlatma < 5 sn ölçülürse açılabilir; `worker` rolü polling nedeniyle sürekli 1 instance çalışır.

## Gerekçe
- Tek paylaşımlı katman, bulgunun kök nedenini (6 kopya, tutarsız davranış) tek yerde çözer; cockatiel skill'in istediği semantiği (backoff, 5 hata, yarı açık) hazır ve küçük bir bağımlılıkla verir — kendi yazdığımız breaker'ı test etmekten ucuzdur.
- Breaker durumunu bellekte tutmak bugün tek worker süreciyle birebir doğrudur; Redis'e taşımak yeni bir kritik bağımlılık ve kod getirir, getirisi yalnızca çok replikada ortaya çıkar.
- Yazmalarda otomatik retry'ı kaldırmak 0004'ün doğruluğunu korur: belirsiz sonuçlu yazma tekrarlanmaz, doğrulanır.
- Hata sözleşmesi, C7/C9'daki "sessiz veri kaybı" sınıfını yapısal olarak engeller: çekim hatası artık "sonuç yok" gibi görünemez, dolayısıyla imleç ilerleyemez (0005).
- Rol bazlı tek imaj, skill'in "bağımsız build/deploy" amacını (bağımsız ölçekleme, hata yalıtımı) 6 imajın işletim yükü olmadan karşılar; tek haneli ölçekte ayrı Dockerfile'lar yalnızca maliyet ekler. Bu, skill'den bilinçli ve eşiğe bağlı bir sapmadır.
- Lease tabanlı kilitler mevcut deseni (atomik `findOneAndUpdate` + `lockedBy`) genelleştirir; yeni altyapı (Redis Redlock vb.) gerektirmez ve pod adı değişimi sorununu da çözer.
- Mongo'yu compose dışında tutmak skill kuralıdır; yerel veri zaten host'taki Mongo'dadır.

## Maliyet/Ölçek Notu
- Ek bağımlılık: `cockatiel` (bağımlılıksız TS kütüphanesi). Ek servis: yalnızca yerelde Redis konteyneri (üretimde zaten gerekli). Kod maliyeti: bir HTTP katmanı + 6 adaptörün buna taşınması + sözleşme testleri; bir kez rol ayrımı; lease yardımcısı.
- Yeniden değerlendirme eşikleri:
  - **Fiziksel web/worker ayrımı (2 instance):** API p95 gecikmesi > 1 sn iken worker event-loop gecikmesi p95 > 200 ms (aynı 15 dk'lık pencerede, 7 günde ≥ 3 gün) **veya** süreç belleği sürekli > konteyner limitinin %70'i **veya** son 30 günde işçi kaynaklı ≥ 2 API kesintisi **veya** aktif tenant > 20.
  - **İkinci worker replikası:** 0005 Seviye-2 eşiği; ön koşul madde 4'ün tamamlanmış olması. Replika sayısı > 3 olursa breaker durumu ve limiter Redis'e taşınması değerlendirilir (her replikanın ayrı sayması pazaryerine 5×N hatalı istek demektir).
  - **Entegrasyon başına ayrı imaj/servis:** bir entegrasyon farklı çalışma zamanı/yerel bağımlılık gerektirirse **veya** tek bir entegrasyonun kaynak kullanımı/çöküşü son 30 günde diğerlerini ≥ 2 kez etkilerse (önce `WORKER_INTEGRATIONS` filtresiyle ayrı instance denenir).
  - **Kubernetes:** aktif tenant > 100 **veya** servis/instance sayısı > 8 olmadan açılmaz.
  - **Scale-to-zero worker:** 30 günde worker aktif iş süresi < %10 **ve** sipariş olaylarının ≥ %80'i webhook'la geliyorsa değerlendirilir.
  - **Breaker parametreleri:** herhangi bir entegrasyonda breaker 7 günde > 20 kez açılıyorsa veya açık kaldığı toplam süre günde > 30 dk ise eşikler/timeout'lar o entegrasyon için yeniden ayarlanır.

## Etki Alanı
`integration/modules/*/services/Service.ts` (tüm HTTP katmanları), `integration/modules/*/api/*Connector.ts` (hata yutma), `n11/services/OrderService.ts`, `hepsiburada/index.ts`, `ideasoft/services/OrderService.ts` (stub'lar), `IntegrationFactory.ts` (timeout), `interfaces/platforms` (`IPlatform` + `IntegrationError`), `integration/engine/order/{OrderErrorHandler,worker-runner}.ts`, `integration/engine/export/{Dispatcher,Publisher,Sync}.ts`, `ExportOrchestrator.ts`, `ImportOrchestrator.ts`, `IntegrationEngine.ts`, `entegrasyonik.ts`, `Webserver.ts`, `database/DatabaseManager.ts`, `backend/Dockerfile`, `backend/package.json` (build betiği), yeni kök `docker-compose.yml`, `.env.example`, mockserver (hata senaryoları). İlişkili: 0004 (yazma retry yasağı, iptal yeteneği), 0005 (Redis rol bağımlılığı, metrik koleksiyonu, webhook rotası).

## Ek (2026-09-27) — Mock modu fail-closed olmalı (BACKLOG C19)
**Bağlam:** İlk yerel çalıştırmada N11 adaptörü `N11_MOCK_MODE=true` iken `https://api.n11.com/rest/delivery/v1/shipmentPackages` (gerçek adres) çağırmaya çalıştı: mock yönlendirmesi yalnızca `*_MOCKABLE_ENDPOINTS` listesindeki endpoint'ler için geçerli, listede olmayanlar gerçek host'a, tenant'ın gerçek kimlik bilgisiyle gidiyor (fail-open). Yalnızca `backend/dev-tools/egress-guard.js` engelledi (`docs/BASELINE_FAZ2.md`).

**Karar:** (1) Mock etkinken listede olmayan endpoint **gerçek host'a asla gitmez**; ya mock'a yönlenir ya da `IntegrationError('MOCK_ENDPOINT_NOT_MOCKED')` fırlatır (fail-closed). Karar noktası paylaşımlı dayanıklılık katmanında (bu ADR'nin tek dış-çağrı katmanı) tek yerde verilir; adaptörlerdeki dağınık `isMockActive` mantığı bu katmana taşınır. (2) `NODE_ENV !== 'production'` iken süreç `dev-tools/egress-guard.js` olmadan başlamaz (yerel/test/staging'de zorunlu; `npm run start:local` zaten böyle). (3) Yerel/test veritabanındaki entegrasyon kimlik bilgileri maskelenmiş olmalıdır (BACKLOG C13) — guard ikinci savunma hattıdır, birincisi değil.
**Alternatifler:** (a) yalnızca MOCKABLE listelerini genişletmek — reddedildi (her yeni endpoint'te aynı risk); (b) yalnızca guard — reddedildi (dev-tools opsiyonel yükleniyor, üretim kodunda garanti vermez).
**Maliyet/Ölçek:** ek servis yok; guard bağımlılıksız. **Gözden geçirme eşiği:** guard'ın canlı olmayan ortamda bir kez bile beklenmedik `EGRESS_BLOCKED` üretmesi (log'da `egress-guard`) → ilgili adaptörün fail-closed dönüşümü öncelik alır.

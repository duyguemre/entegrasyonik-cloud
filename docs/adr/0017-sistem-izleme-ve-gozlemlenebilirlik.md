# 0017 — Sistem İzleme ve Gözlemlenebilirlik (olgunluk yükseltmesi) + Genel Altyapı Çıtası

## Durum
Kabul edildi (2026-09-28). Uygulama dört aşamada (A–D, §8); ücret/saklama/kanal gibi insan kararı gerektiren noktalar §9'da, hepsi için varsayılan tanımlı — varsayılanlarla ilerlemek Protokol 12'yi tetiklemez (ücretli servis alımı YOK).

## Bağlam

Proje sahibinin yönergesi: "sistem izleme kısmı ilkel olabilir — yalnızca çalışır hale getirme değil, karar alıp modern, üst seviyeye taşı"; ek yönerge (2026-09-28): "loglar hem backend hem FRONTEND için güzel bir yapıda olmalı; genel altyapılarda best practice'ler premium seviyede uygulanmalı". Bu ADR mevcut durumu kanıtla çıkarır, **yeniden yazma değil kademeli yükseltme** kararı verir (modüller çürümüş değil, eksik; bkz. `adr-writing` özel kuralı) ve aynı yöntemi diğer alanlara uygulanabilir kılar (§11).

### Mevcut durum envanteri (kanıt, 2026-09-28, `faz3-arayuz` @ 451dda5)

**Olgun olan (korunur):**
- `/health` (sabit 200) ve `/ready` (Mongo + rol worker/all ise Redis, ≤1 sn, kapanışta 503) — `backend/src/health/HealthCheck.ts:58-76`, `Webserver.ts:143-152`, worker rolü için ayrı sunucu `health/HealthServer.ts:21-40`; testli (ADR-0006 Karar 5).
- Dış çağrı hata taksonomisi + dayanıklılık (`IntegrationError`, `ResilientHttpClient`; ADR-0006) ve denetim kaydı sanitizasyonu (`services/audit/AuditLogger.ts:18-36`, yasak anahtar regex'i).
- Graceful shutdown (`entegrasyonik.ts:40-100`, ADR-0006 Karar 6).

**İlkel olan (bu ADR'nin konusu):**

| # | Alan | Kanıt | Sonuç |
|---|---|---|---|
| K1 | Backend log | 88 dosyada 314 `console.*` (171'i `console.error`); package.json'da logger kütüphanesi yok; `utils/Logger.ts:21-67` yalnızca ANSI renkli önek üretir; seviye/JSON/alan yok. | Makinece aranamaz; platform log aramasında renk kodları gürültü. |
| K2 | Correlation | İstek/iş/adaptör zinciri boyunca kimlik yok (`requestId` yalnızca ExportSignals'a yazılan ilgisiz alan, `integration-service.ts:999`). | Bir kullanıcı hatasını arka plan işine ve pazaryeri çağrısına bağlamak imkânsız. |
| K3 | Log kaynaklı kesinti | BACKLOG C19 notu (`BACKLOG.md:33`): dosyaya yönlendirilmiş stdout'ta senkron `console.error` fırtınası olay döngüsünü durdurup ilgisiz isteklerde 1–10 sn gecikme üretti (canlı gözlem). | Log altyapısı bir **güvenilirlik** sorunu. |
| K4 | Dış çağrı metriği | `IntegrationCallMetrics` her çağrıda **tek doküman** `create` eder (`IntegrationCallMetrics.ts:23`, çağrılar `ResilientHttpClient.ts:270,291,304`); ADR-0006 Karar 1 "dakikalık kova" demişti (sapma). Koleksiyonu **okuyan hiçbir kod yok** (yalnızca getter, `ApplicationDB.ts:82`). | Yazma maliyeti var, değeri sıfır. |
| K5 | Kuyruk metriği | `QueueMetricsCollector` hiçbir yere bağlanmamış (dosya başlığı `QueueMetricsCollector.ts:6-12`; çağrı noktası 0; `startAutoFlush` hiç çağrılmıyor). Yüzdelikler flush başına üzerine yazılıyor (`:67-69`). | ADR-0005 Karar 5 **eşik merdiveni kör** — ölçekleme kararı verecek veri üretilmiyor. |
| K6 | Devre kesici | Durum süreç-içi `Map`'te (`ResilientHttpClient.ts:142,167-194`), dışarıya açılmıyor. | Açık devre ancak log okuyarak görülür. |
| K7 | Admin sağlık ucu | `AdminService.getSystemHealth` (`admin-service.ts:266-515`): çağrı başına ~15 sorgu, filtresiz `ExportFlag.find` (`:300`), `ALL` aralığında sınırsız aggregate, BullMQ'yu ham Redis anahtarlarıyla okuma (`:341-348`, yalnızca order-sync, failed/delayed yok), "aktif pod" = son 15 dk'da kilit alan (`:314-328`; boştaki pod görünmez). Job/scheduler, DLQ, devre kesici, entegrasyon hata oranı **yok**. Ekran 10 sn'de bir çağırır (`AdminSystemManagementView.vue:1160`). | Pahalı + eksik; yanlış güven. |
| K8 | Hata = boş | `admin-system.spec.ts:60-72` characterize ediyor: 500 alındığında panel "her şey sıfır" gösterir. Kök neden `restapi.ts:89-91` (hata `resolve(error)` edilir, reddedilmez). | Sağlık ekranında en tehlikeli davranış. |
| K9 | Zamanlayıcılar | 6 `setInterval` zamanlayıcı (`entegrasyonik.ts:158-167`) + zombi kilit temizliği (`IntegrationEngine.ts:32`) + sipariş zamanlayıcısı (`OrderOrchestrator.ts:71`). İşler sonuç nesnesi döndürüyor (`AllocationSweepJob.ts:27,74`) ama zamanlayıcı onu **atıyor** (`AllocationSweepScheduler.ts:19-21`). Son tur kaydı yok; üst üste binme koruması yok; günlük dış mutabakat her yeniden başlatmada anında koşar (`ReconciliationScheduler.ts:33`). Lease yok (yalnızca `Dispatcher.ts:72` kullanıyor). | "Sessiz ölü job" tespit edilemez. |
| K10 | DLQ | Yazılıyor (`OrderErrorHandler.ts:111-135`), TTL yok, okuyan/arayüz yok; ADR-0005 Karar 3'teki "admin'de listele + yeniden kuyruğa al" yapılmadı. | Başarısız sipariş işleri kara delikte. |
| K11 | Bildirim | Yalnızca tenant DB'sinde, 3 gün ömür (`client/models/Notification.ts:54-56`); platformAdmin kanalı yok; `saveNotification` try içinde await edilmiyor (`NotificationService.ts:13` → hata `unhandledRejection`'a kaçar). `MailService.send` var (`MailService.ts:32`) ama uyarı için kullanılmıyor. | Alarm altyapısı yok. |
| K12 | Global hatalar | `unhandledRejection` yalnızca loglanıyor, ADR-0006 Karar 6'nın "sayılır" dediği sayaç yok (`entegrasyonik.ts:181-187`). | Karar uygulanmamış. |
| K13 | Tenant görünümü | Tenant kendi entegrasyon sağlığını göremez (`docs/FRONTEND_GAP_ANALYSIS.md:52`; benchmark H5 "YARIM", `docs/research/2026-09-28-saas-capability-benchmark.md:150`). | Sektör çıtasının altında. |
| K14 | Frontend log/hata | `frontend/src`'de 51 dosyada 151 `console.*`; global `app.config.errorHandler`/`unhandledrejection`/`router.onError` **yok** (`main.ts`); `restapi.ts` hatayı `console.error('Error get:', error)` ile ham axios nesnesi olarak basar (istek yapılandırması dahil) ve çağırana `resolve` eder; ESLint yapılandırması yok; `vite.config.mts:13` `sourcemap:false`. | İstemci hataları görünmez; kullanıcıya teknik iz yok, destek eşleştirmesi yok. |
| K15 | İş log ekranları | `ExportLogList`/`ImportLogList`/`DetailedExportLogReport` (`frontend/src/components/logListView/`) tenant'ın **iş geçmişi**dir (ExportSignals TTL 15 gün `application/models/Export.ts:60`, OperationLog 90 gün `OperationLog.ts:51`, ImportJobReport 7 gün `client/models/Import.ts:127`) — sistem logu değildir. | Korunur; correlation id ile teknik loga bağlanır (Karar 1.6). |

İlgili: ADR-0005 (Karar 4 ölçüm, Karar 5 eşik merdiveni, satır 53: "Prometheus/Grafana bu ölçekte kurulmaz"), ADR-0006 (Karar 1 metrik, 5 health, 6 global hatalar), ADR-0001 (denetim, kademeler), ADR-0004 (OVERSOLD, telafi), ADR-0012 (sekmeli çalışma alanı), ADR-0015 (görsel yenileme, "tek iş = tek desen" şablonları), `docs/API_TENANT_SURFACE.md` (paralel hazırlanıyor — tenant-yüzlü uç adlandırması orada).

## Değerlendirilen Alternatifler

**A — Tam açık kaynak gözlem yığını (OpenTelemetry + Prometheus + Grafana + Loki/Tempo, kendi barındırma).**
Artı: sektör standardı, sınırsız esneklik. Eksi: 3–4 yeni servis (depolama, yedek, güncelleme, güvenlik), tek haneli abone ölçeğinde operasyon yükü değerden büyük; ADR-0005 bu ölçekte açıkça reddetti. **Reddedildi.**

**B — Ücretli SaaS (Sentry, Better Stack, Datadog, Grafana Cloud).**
Artı: hazır arayüz, alarm, hata gruplama, frontend SDK. Eksi: aylık maliyet + veri işleyen üçüncü taraf (KVKK değerlendirmesi), satın alma Protokol 12 kapsamında insan kararı. **Varsayılan değil — yalnızca seçenek** (§9 S1). Mimari, bu seçeneğe tek dosyalık adaptörle geçilebilecek şekilde kurulur (log stdout JSON; metrik kayıt defteri arayüzü; istemci hata alıcısı).

**C — Mevcut Express + TS + Mongo + Redis içinde kendi kendine yeten yapı (SEÇİLEN).**
Yapılandırılmış asenkron JSON log (pino) + AsyncLocalStorage correlation; süreç-içi metrik kayıt defteri → Mongo'ya birleştirilebilir (mergeable) kovalarla `$inc`; `JobRunRegistry`; kural tabanlı alarm değerlendirici; parmak izli hata olayları (mini-Sentry); amaca özel admin uçları + tenant sağlık DTO'su; frontend logger + global hata sınırı + güvenli istemci hata raporlama. Artı: yeni servis yok, tek yeni üretim bağımlılığı (pino, MIT), veri kendi DB'mizde. Eksi: arayüzü kendimiz yazıyoruz; Prometheus ekosistemi yok.

**D — Statüko + `getSystemHealth` yamaları.**
Sessiz ölü job, alarm, correlation, tenant görünümü çözülmez. **Reddedildi.**

Alt tercihler:
- *Logger:* pino (asenkron hedef, dahili `redact`, düşük CPU) ✔ / winston (daha yavaş, transport'lar çoğunlukla senkron akış) ✘ / kendi yazımız ✘.
- *Metrik sunumu:* Mongo kovaları ✔ / Prometheus `/metrics` ucu ✘ (tüketici yok; ADR-0005 ile çelişir — yeniden değerlendirme eşiği §Maliyet) / MongoDB native time-series koleksiyonu ✘ (`$inc` upsert ile kova birleştirme desteklenmez, küçük ölçekte ek kazanç yok).
- *Yüzdelik:* flush başına p95 üzerine yazma (bugünkü) ✘ / sabit sınırlı histogram kovaları ✔ (pod'lar ve zaman arasında toplanabilir; p50/p95 okuma anında hesaplanır).

## Karar

Gözlemlenebilirlik, yeni servis eklemeden mevcut yığın içinde dört katmanda yükseltilir: **(1)** uçtan uca yapılandırılmış log + `X-Request-Id` correlation (backend ve frontend), **(2)** Mongo'da birleştirilebilir kovalı RED + iş metrikleri ve parmak izli hata olayları, **(3)** tüm zamanlayıcılar için tek `JobRunRegistry` ve stale tespiti, **(4)** kural tabanlı, susturulabilir alarm + platformAdmin operasyon konsolu ve tenant "Entegrasyon sağlığı" ekranı (ortak veri sözleşmesi); genel altyapı çıtası (§10) aynı aşamalara bağlanır.

### Karar 1 — Log temeli (backend + frontend)

**1.1 Backend logger.** `pino` tek modülde (`backend/src/services/observability/logger.ts`): hedef `pino.destination({ dest: 1, sync: false, minLength: 4096 })` (asenkron, K3'ün kök çözümü); `gracefulShutdown` ve `uncaughtException` yolunda `logger.flush()` sonra çıkış. Yerelde okunabilirlik yalnızca `pino-pretty` (devDependency, boru ile) — uygulama kodu her ortamda JSON üretir.

**1.2 Alan sözleşmesi** (her satır): `time, level, msg, svc:"entegrasyonik-api", role, pod, env, ver` (git kısa SHA, build'de gömülü) + bağlamdan `reqId, corrId, tenantId, userSub, jobName, runId, integrationCode` + olaya özgü `op, durationMs, err{type,code,message,stack}`. Alan adları sabit liste (`logFields.ts`); serbest alan eklemek yasak değil ama PII yasağı geçerli.

**1.3 Seviyeler:** `fatal` (süreç kapanıyor) · `error` (işlem başarısız, insan bakmalı olabilir) · `warn` (beklenmeyen ama kendini toparladı: retry, atlanan tur) · `info` (yaşam döngüsü, iş özetleri — iş başına bir satır, kayıt başına değil) · `debug` (yerel/teşhis) · `trace` (kapalı). `LOG_LEVEL` varsayılan: üretim `info`, yerel `debug`.

**1.4 Redaksiyon (varsayılan-ret):** pino `redact` yolları (`*.authorization, *.cookie, *.password, *.token, *.secret, *.apiKey, *.headers.authorization, config.auth, *.dbConfig` vb., `[REDACTED]`) + özel `err` serileştiricisi: axios hatasından `config`, `request` ve istek gövdesi **atılır**, `response.data` 500 karakterle kesilir, `AuditLogger`'daki `FORBIDDEN_META_KEY` regex'i (tek kaynak olarak dışa aktarılır) her nesne anahtarına uygulanır. Müşteri PII'si (ad, adres, telefon, e-posta, vergi no) loga yazılmaz; sipariş/ürün için yalnızca kimlik (`orderId`, `sku` log mesajında serbest, metrikte asla — Karar 2.3).

**1.5 Taşkın denetimi (C19 dersi):** hata parmak izi (`err.code` + modül + rakamları `#`'e çevrilmiş mesaj şablonu) başına 60 sn pencere: ilki tam yazılır, sonrakiler sayılır, pencere sonunda tek `warn` "N benzer hata bastırıldı". Aynı parmak izi Karar 2.4'teki hata olaylarını besler.

**1.6 Correlation (HTTP → iş → adaptör):**
- `AsyncLocalStorage<ObsContext>`; `Webserver` en başında (health/webhook dahil, auth'tan önce) middleware: gelen `X-Request-Id` yalnızca `^[A-Za-z0-9_-]{8,64}$` ise kabul, yoksa `crypto.randomUUID()`; **yanıt başlığında her zaman `X-Request-Id`** (CORS `exposedHeaders`'a eklenir). `authenticate` sonrası bağlama `tenantId`/`userSub` işlenir.
- Kuyruğa giden işler bağlamı taşır: BullMQ `job.data.corrId` (üretici tarafında `OrderQueueProducer`/webhook yolu), katalog hattında mevcut `ExportSignals.requestId` `corrId` olarak yeniden kullanılır (yeni alan yok); zamanlayıcı turları `runId` üretir (Karar 3). Worker iş başında bağlamı açar; `ResilientHttpClient` log/metrik/hata olayına `corrId`'yi bağlamdan okur. Pazaryerine kendi kimliğimiz gönderilmez.
- İş log ekranları (K15) değişmeden kalır; `DetailedExportLogReport` gibi detay çekmecelerinde `corrId` "Teknik iz kodu" olarak gösterilir (Aşama D) — tenant bunu destek talebine yapıştırır, admin aynı kodla teknik logda/hata olaylarında arar. Kullanıcıya görünen iş kaydı ≠ teknik log; bağları yalnızca kimliktir.

**1.7 `console.*` göçü (üç adım, büyük patlama yok):**
1. *Köprü (Aşama A):* yalnızca giriş noktasında (`entegrasyonik.ts` ana akışı; modül import'unda değil — testlerdeki `console` casusları etkilenmez) `console.log/info/warn/error/debug` pino'ya yönlendirilir, ANSI kodları temizlenir, `legacy:true` alanı eklenir. 314 çağrı tek adımda JSON + asenkron olur. Geri alma: `LOG_FORMAT=legacy`.
2. *Sıcak yol göçü (Aşama A):* `ResilientHttpClient`, `IntegrationCallMetrics`, `QueueMetricsCollector`, `BaseWorker`, `OrderWorker`, `OrderErrorHandler`, 6 zamanlayıcı + işleri, `ApiManager.sendError`, `AdminService`, `entegrasyonik.ts` global işleyicileri → çocuk logger (`logger.child({ module })`). `utils/Logger.ts` renk önekleri `@deprecated`.
   *F-06 uygulama notu (2026-09-30):* motor/adaptör `console.*` çağrıları (`src/integration/**`, 144 çağrı) `eventLog(source, module)` ile (`platform/core/logger/eventLog.ts`) yapılandırılmış olay log'una taşındı; alan şeması BACKOFFICE_PLAN §2.9 LogEvents ile uyumlu: `ts, level, source, code, errorClass, tenantId, integrationCode, operation, correlationId, durationMs, msg, fingerprint`. Correlation: HTTP `X-Request-Id` aynen korunur; motor işleri `runWithJobContext` ile iş başına yeni id alır (BullMQ işinde `correlationId` taşınır); `ResilientHttpClient` çağrıyı `integrationCode/operation/tenantId` ile zenginleştirir, süre/durum/errorClass/retry loglar ve `integration_op_*` sayaçlarını (tenant etiketi YOK) yazar. Maskeleme sunucuda zorunlu (`redact.ts`: anahtar + içerik tabanlı; token/parola/appkey/appsecret/Authorization/e-posta/telefon/TCKN/adres). Pazaryeri isteklerine correlation başlığı eklenmez.
3. *Fırsatçı göç + mandal:* statik jest testi `console.*` sayısını dosya başına sayar, **artmasına izin vermez** (mevcut statik sır testiyle aynı desen); dokunulan dosya göç ettirilir.

**1.8 Frontend logger ve hata sınırı:**
- Tek servis `frontend/src/composables/logger.ts`: seviyeler `error/warn/info/debug`; üretim derlemesinde `debug/info` no-op; **üretimde doğrudan `console.*` yok** — ESLint (flat config, `eslint-plugin-vue` + `@typescript-eslint`) `no-console: error`, mevcut 151 çağrı için dosya başına sayım mandalı (yeni ekleme yasak, azaltma serbest).
- Global yakalama: `app.config.errorHandler`, `window.addEventListener('unhandledrejection'|'error')`, `router.onError` (dinamik import/chunk hatası → "Uygulama güncellendi, yenileyin" iletisi + tek seferlik yeniden yükleme). Ekran seviyesinde `ErrorBoundary` bileşeni (ADR-0015 şablonlarının "hata durumu" yuvası) — ekran çökse de kabuk ayakta.
- **Kullanıcı iletisi ≠ teknik log:** kullanıcıya yalnızca eşlenmiş Türkçe ileti + **Destek kodu** (`X-Request-Id` varsa o; yoksa istemci üretir `c-<uuid8>`); teknik ayrıntı (yığın, yanıt gövdesi) yalnızca logger'a.
- `restapi.ts`: yanıt/hata interceptor'ı `X-Request-Id`'yi okur, hata nesnesine `requestId` ekler; `console.error(error)` kaldırılır (ham axios nesnesi istek yapılandırmasını basıyor). Mevcut `resolve(error)` sözleşmesi **bu ADR'de değiştirilmez** (tüm çağıranları etkiler; ayrı bir göç); bunun yerine `isApiError(res)` yardımcısı + ekran şablonlarının hata durumu kullanılır (K8'i ekran bazında kapatır).
- **İstemci hata raporlama:** `POST /client-log` (auth'lu; tenant/kullanıcı bağlamı sunucuda eklenir, istemciden alınmaz) — yalnızca `error` seviyesi + seçili `warn`; gövde ≤ 8 KB, alan beyaz listesi `{level, msg, errName, stack(≤30 satır), route (parametresiz rota adı), reqId, appVer, platform:'web'|'electron', ts}`; istemcide redaksiyon (URL sorgu dizesi, e-posta/telefon desenleri, token biçimleri) + sunucuda ikinci redaksiyon; istemci başına 20 olay/5 dk (in-process limiter, mevcut `createRateLimiter`), aynı parmak izi oturum başına 1 kez; hedef Karar 2.4 hata olayları (`source:'client'`). Kimliksiz sayfalar (giriş) raporlamaz (kötüye kullanım yüzeyi).
- **Kaynak haritası politikası:** üretimde `sourcemap: 'hidden'` — haritalar üretilir, **yayınlanmaz** (dağıtım artefaktından çıkarılır, sürüm etiketiyle derleme çıktısı olarak saklanır); admin hata olayı detayında yığın, sürüme uyan harita ile yerelde çözülür (`dev-tools/symbolicate` betiği, Aşama D). Herkese açık harita YOK (kaynak ifşası).
- **Web Vitals:** şimdi **toplanmaz** (tek haneli abone, masaüstü ağırlıklı B2B iç panel; değer düşük). Yeniden değerlendirme: tenant ≥ 50 veya performans şikâyeti ≥ 3/ay → `web-vitals` (Google, Apache-2.0) ile %10 örneklemeli, aynı `/client-log` ucuna `kind:'vital'`.
- **Electron farkı:** renderer aynı logger'ı kullanır (`platform:'electron'`, `appVer` = paket sürümü); `frontend/main.js` ana süreçte `render-process-gone`/`child-process-gone`/`uncaughtException` dinlenir, ana süreç hataları dosyaya değil yine renderer köprüsü üzerinden `/client-log`'a (çevrimdışıysa kuyrukta ≤ 50 olay, açılışta gönderilir). Electron `crashReporter` (minidump yükleme sunucusu gerektirir) **kurulmaz**.

### Karar 2 — Metrikler

**2.1 Kayıt defteri:** süreç-içi `MetricsRegistry` (counter, gauge, sabit-kovalı histogram; ms kovaları `[50,100,250,500,1000,2500,5000,10000,30000,60000,+Inf]`). 60 sn'de bir flush: `MetricRollups` koleksiyonuna **metrik adı × zaman kovası başına tek doküman**, etiket kümeleri doküman içinde harita (`series.<etiketAnahtarı>.{c,e,sum,h[]}`), `$inc` upsert — çoklu pod ve çoklu flush doğal olarak toplanır (bugünkü yüzdelik üzerine yazma sorunu biter). Aynı flush'ta iki çözünürlüğe yazılır: **5 dk kova** ve **1 saat kova** (sıkıştırma işi gerekmez).

**2.2 Seriler:**
- *RED — HTTP:* `http_requests{op, statusClass}` + süre histogramı. `op` = `Service/method` (OPERATION_POLICY ile sınırlı küme); `tenantId` etiketi YOK.
- *RED — entegrasyon çağrısı:* `integration_calls{tenantId, integrationCode, kind: read|write, outcome: ok|<IntegrationError.code>}` + süre histogramı + `retries` toplamı + `rate_limited` sayacı. **`IntegrationCallMetrics` çağrı-başı dokümanı durdurulur** (mevcut `setSink` üzerinden kayıt defterine yönlendirilir; K4'ü ve ADR-0006 Karar 1 sapmasını kapatır). `operation` metrik etiketi DEĞİL (URL'den türeyince kimlik içerebilir, `ResilientHttpClient.ts:197-205`) — yalnızca hata olayında normalize edilmiş haliyle (`/orders/:id`).
- *Kuyruk:* `order-sync-queue` için BullMQ `Queue.getJobCounts('wait','active','delayed','failed')` gauge (60 sn örnek — ham anahtar okuma kalkar); tamamlanan/başarısız + bekleme/işleme histogramı **bağımsız bir `QueueEvents` dinleyicisiyle** (`WebhookApiManager`'ın bağımsız Queue emsali; `OrderOrchestrator` gövdesine dokunmadan) — `QueueMetricsCollector` bu kayıt defterine bağlanır (K5 kapanır, ADR-0005 eşik merdiveni veri alır). Katalog hattı: `ExportSignals` durum sayıları + en eski `PENDING` (ertelenmiş `nextRunAt` hariç) yaşı gauge.
- *Devre kesici:* `ResilientHttpClient.snapshot()` salt-okur erişimci (yeni, testli) → `breaker_state{tenantId, integrationCode, kind}` gauge; cockatiel `onStateChange` → geçiş sayacı + hata olayı.
- *İş:* `order_sync_lag_seconds{tenantId, integrationCode}` (= şimdi − `lastSuccessfulOrderSync`), `webhook_healthy`, `oversold_open{tenantId}` (5 dk'da bir tenant başına tek `countDocuments`; 9 tenant için ihmal edilebilir), `stock_publish_lag` histogramı (UPDATE_STOCK kaydı oluşturma → tamamlanma), `dlq_open{tenantId}`.
- *Süreç:* olay döngüsü gecikmesi p99 (`perf_hooks.monitorEventLoopDelay`), heap/RSS, `unhandled_rejections` sayacı (K12; ADR-0006 Karar 6 "sayılır" hükmü uygulanır), uptime.
- *Zamanlayıcı:* Karar 3'ten.

**2.3 Kardinalite kuralları:** `tenantId` etiketi **yalnızca** varlık-kapsamlı serilerde (entegrasyon çağrısı, sync gecikmesi, oversold, DLQ, devre kesici); HTTP/kuyruk/süreç serilerinde yasak. Asla etiket olmayanlar: `userId`, `orderId`, `sku`, ham URL/path, hata mesajı, `corrId`. Üst sınır: tahmini en kötü durum 9 tenant × 6 entegrasyon × 2 tür × ~10 sonuç ≈ 1.080 seri/kova (gerçekte boş olanlar yazılmaz); kayıt defteri flush başına **5.000 seri** sınırını aşan yeni seriyi reddeder ve `metrics_series_dropped` sayar.

**2.4 Hata olayları (`ErrorEvents`, mini-Sentry):** parmak izi başına tek doküman `{fp, source: server|client, module, code, integrationCode?, tenantId?, count, firstSeen, lastSeen, sample{message(≤500, redakte), stack(≤30 satır), corrId, route/op, appVer}, status: open|acknowledged|resolved|muted}`; süreç-içi 10 sn toplama sonra `$inc` upsert (taşkında yazma patlaması yok). `resolved` bir olay yeniden görülürse `open`'a döner (regresyon işareti). Admin "son hatalar akışı" buradan beslenir.

**2.5 Sunum:** Prometheus `/metrics` **şimdi yok**. `MetricsRegistry` arayüzü, `prom-client` dışa aktarıcısının tek dosyayla eklenebileceği biçimde tutulur (tetikleyici: §Maliyet). Okuma tek serviste: `ObservabilityService` (Karar 5).

### Karar 3 — Zamanlayıcı görünürlüğü: `JobRunRegistry`

- Tek sarmalayıcı `runJob(def, fn)`; `def = { name, expectedIntervalMs, maxDurationMs, criticality: 'critical'|'normal', runOnStart: 'always'|'ifDue' }`. İş sonuç sözleşmesi `{ processed, failed, skipped?, note? }` (mevcut dönüş nesneleri eşleyiciyle uyarlanır, iş mantığı değişmez); fırlatırsa `failed`.
- **Durum:** `JobState` (iş adı başına 1 doküman): `lastStartedAt, lastFinishedAt, lastSuccessAt, lastStatus: ok|partial|failed|skipped, lastDurationMs, lastCounts, lastError (redakte, ≤500), consecutiveFailures, runningSince, heartbeatAt, pod, expectedIntervalMs`. **Geçmiş:** `JobRuns` — yalnızca anlamlı turlar (başarısız/kısmi/nedenli atlama/`processed>0`) + her iş için saatte en az bir kayıt; TTL 14 gün.
- **Üst üste binme koruması:** önceki tur hâlâ çalışıyorsa yeni tur atlanır ve `overlap_skipped` sayılır (bugün `setInterval` üst üste bindirebilir).
- **`ifDue`:** saatlik/günlük işler açılışta yalnızca `lastSuccessAt` aralıktan eskiyse koşar (günlük dış mutabakatın her dağıtımda yeniden koşması biter).
- **Stale tanımı:** `şimdi − lastFinishedAt > 2 × expectedInterval + 60 sn` (günlük işlerde + 1 saat tolerans) → **stale**; `runningSince` + son heartbeat `maxDurationMs`'i aştıysa → **hung**; süreç `2 × expectedInterval`'dan uzun süredir ayaktaysa ve kayıt yoksa → **never-ran**. Okuma anında hesaplanır (panel, değerlendiriciden bağımsız doğru kalır) ve alarm kuralı R6'yı besler. Uzun işler `ctx.heartbeat(progress)` çağırabilir.
- **Kapsam:** AllocationSweep (15 dk, critical), StockPublish (30 sn, critical), OversellCompensation (5 dk, critical), InternalReconciliation (1 sa), ExternalReconciliation (24 sa, ifDue), TrialExpiry (15 dk), zombi kilit temizliği (`IntegrationEngine`, 15 dk), sipariş zamanlayıcı turu (`OrderOrchestrator.runScheduleJobsSafely`, critical — lifecycle characterization testleri artık var, fb50bfe), metrik flush, alarm değerlendirici.
- **Çok pod:** `JobState.pod` iki pod'un sırayla yazdığını gösterir; lease **şimdi eklenmez** (tek worker varsayımı) — eşik: worker pod ≥ 2 → `runJob` içine `mongoLease.acquireLease` (hazır yardımcı).
- **Genel koşu şeması (ajan-hazır genişleme noktası, ADR-0018):** `JobRuns`/`JobState` yalnız zamanlayıcıya özgü değil, genel bir "koşu" kaydıdır; şimdiden şu alanlarla tanımlanır (zamanlayıcılar için çoğu varsayılan değerde kalır): `runType: 'scheduler' | 'agent' | 'manual'` (bugün yalnız `scheduler`), `scope: { level: 'platform'|'tenant', tenantId?, integrationCode? }`, `trigger: 'interval'|'startup'|'manual'|'event'`, `budget?: { maxDurationMs, maxCalls?, maxCostUnits? }`, `outputSummary?` (≤ 2 KB yapılandırılmış özet), `error?` (redakte), `corrId`. Böylece ADR-0018'in ileride tanımlayacağı `AgentRun`'lar ayrı bir koleksiyon/pano icat etmeden aynı kayıt, stale tespiti, konsol listesi ve alarm (R6) altyapısını kullanır. Ajan davranışı, bütçe politikası ve `AgentRun` ayrıntısı **ADR-0018'e aittir**; bu ADR yalnızca şemayı bu alanları taşıyabilecek şekilde tutar.

### Karar 4 — Uyarı / alarm

- `AlertEvaluator` (worker rolü, 60 sn, kendisi de `runJob` altında); kurallar kodda tablo (`alertRules.ts`), eşikler sabit + env ile ezilebilir. İlk kural seti (varsayılanlar; 2 haftalık gölge moddan sonra ayarlanır):

| Kural | Koşul (varsayılan) | Önem | Kapsam |
|---|---|---|---|
| R1 Entegrasyon hata oranı | 15 dk'da çağrı ≥ 20 ve hata ≥ %20 (≥ %50 kritik); `VALIDATION`/`NOT_SUPPORTED` oran dışı (veri sorunu, tenant'a ayrı bilgi) | uyarı/kritik | tenant × entegrasyon |
| R2 Kimlik/devre | `AUTH` hatası 15 dk'da ≥ 3 → "kimlik bilgisi geçersiz"; devre açık > 10 dk | kritik / uyarı | tenant × entegrasyon |
| R3 Sipariş senkron gecikmesi | lag > 3 × `syncIntervalMs` (varsayılan 30 dk) uyarı, > 2 sa kritik; webhook sağlıksız > 30 dk uyarı | uyarı/kritik | tenant × entegrasyon |
| R4 Kuyruk birikmesi | order-sync `wait` > 200 veya en eski bekleyen > 10 dk; ADR-0005 p95 > 30 sn 60 dk süreklilik → "ölçekleme eşiği" bilgi | uyarı/bilgi | platform |
| R5 Katalog birikmesi | en eski PENDING (ertelenmemiş) > 30 dk | uyarı | platform (+tenant listesi) |
| R6 Job stale/hung/never-ran | Karar 3; `consecutiveFailures ≥ 3` | critical işte kritik, diğerinde uyarı | platform |
| R7 DLQ | yeni kayıt → saatlik özet; ≥ 10/sa uyarı | bilgi/uyarı | platform + tenant sayısı |
| R8 OVERSOLD | açık OVERSOLD > ADR-0004 grace süresi | uyarı | tenant + platform bilgi |
| R9 Süreç/bağımlılık | olay döngüsü p99 > 500 ms 5 dk; `unhandled_rejections` > 0 /sa; Redis/Mongo hazırlık hatası > 2 dk | uyarı/kritik | platform |
| R10 Stok yayın gecikmesi | p95 > 5 dk (1 sa pencere) | uyarı | platform + tenant |
| R11 Yeni hata türü | daha önce görülmemiş/regresyon parmak izi, 1 sa'te ≥ 5 | bilgi | platform |
| R12 Entegrasyon uyum bulgusu | ADR-0018 `IntegrationFinding` olayı (şema/endpoint/sürüm/deprecation sapması); önem bulgunun kendi `severity` alanından | bulguya göre | platform (+ etkilenen tenant'lar) |

- **Alarm kaynakları (genişleme noktası):** değerlendirici yalnız metrik eşiklerini değil, olay tabanlı kaynakları da alır — `AlertSource` arayüzü: `metricRule` (R1–R10), `errorEvent` (R11), `jobRun` (R6), `integrationFinding` (R12, ADR-0018). Olay kaynakları kendi olayını `raiseAlert({ source, ruleId, scopeKey, severity, title, detailRef })` ile gönderir; tekilleştirme, histerezis, susturma, kanallar ve fırtına koruması **kaynaktan bağımsız aynıdır**. Bulgunun içeriği ve üretimi ADR-0018'e aittir; bu ADR yalnızca girişi ve yaşam döngüsünü sağlar.

- **Yaşam döngüsü:** `Alerts` koleksiyonu `(ruleId, scopeKey)` anahtarlı: `firing → resolved`; **histerezis** (2 ardışık temiz değerlendirme olmadan çözülmez); bildirim yalnızca `firing`'e geçişte, sonra yeniden bildirim kritikte 4 sa, uyarıda 24 sa; çözülünce tek ileti. **Susturma:** admin `(ruleId, scopeKey)`'i bitiş zamanlı susturur (denetim kaydıyla); **bakım penceresi** bayrağı tüm bildirimleri bastırır (değerlendirme sürer). **Fırtına koruması:** aynı değerlendirmede > 5 yeni uyarı → tek özet e-posta.
- **Kanallar:** platformAdmin → uygulama-içi **Uyarılar** paneli (ApplicationDB, tenant `Notifications`'tan ayrı) + e-posta (yalnız kritik anında, uyarılar saatlik özet; alıcılar `ALERT_EMAIL_TO`). Tenant → mevcut tenant bildirimi (`type:'SYSTEM'`, `severity`, `actionUrl` → Entegrasyon sağlığı sayfası) yalnızca tenant-kapsamlı ve **eyleme dönük** kurallarda (R1, R2, R3, R8); tenant e-postası varsayılan **kapalı** (bildirim tercihleri gelene dek). Webhook/Slack sonra: `AlertChannel` arayüzü, yeni kanal = tek dosya.
- **Gölge mod:** Aşama C ilk 14 gün değerlendirir ve kaydeder, e-posta göndermez; yanlış pozitif oranı ölçülüp eşikler ayarlanır.
- **Bekçiyi kim bekler:** web ve worker ayrı roldeyse web süreci 60 sn'de bir `AlertEvaluator` heartbeat'ini okur, > 5 dk stale ise doğrudan admin'e e-posta atar (çapraz-rol bekçi). Tek süreç (`all`) dağıtımında süreç ölürse içeriden alarm imkânsızdır → harici ücretsiz uptime denetimi önerilir (§9 S2); varsayılan: yok, risk belgelendi.
- Aşama C'de `NotificationService.ts:13` await/catch düzeltilir (K11).

### Karar 5 — Operasyon konsolu (platformAdmin) + tenant sağlık ekranı

- **Uçlar:** `ObservabilityService` (hepsi `platformAdmin`, `OPERATION_POLICY`'e eklenir): `getOverview` (servis/API, worker heartbeat, Mongo, Redis, kuyruklar, işler, entegrasyonlar — her biri yeşil/sarı/kırmızı + gerekçe; sunucuda 15 sn önbellek), `getTenantHealth` (tenant × entegrasyon tablosu), `getIntegrationMetrics(tenantId?, integrationCode?, range)`, `getJobs`, `getAlerts` + `ack/mute`, `getErrorEvents` + `ack/resolve`, `getDlq` + `retry/discard` (yeniden kuyruğa alma `OrderQueueProducer` üzerinden aynı jobId semantiği; her işlem `AuditLogger`'a), `getBreakers`. Hepsi sınırlı sorgu (zaman aralığı üst sınırı 90 gün, sayfalama zorunlu).
- **`getSystemHealth`**: characterization testleri (`admin-service-unauthenticated.test.ts:171,314`, `admin-system.spec.ts`) nedeniyle konsol eşdeğerliğe ulaşana dek korunur, sonra kaldırılır. 10 sn yoklama → yalnızca Overview'da 30 sn ve **sekme görünürken** (`document.visibilityState`; ADR-0012 sekmeli alanda arka sekme yoklamaz).
- **Her kartta açık durum:** `loading / ok / empty / error / stale` (veri > 2 dk eski). K8 bilinçli olarak ters çevrilir (spec'teki "hata = sıfır" testi "hata = hata durumu + Destek kodu" olur).
- **Ekranlar (ADR-0015 şablonları, "tek iş = tek desen"; yeni ad-hoc bileşen yok):** Overview → *pano* şablonu; Tenant sağlığı → *liste/tablo* + satır detay çekmecesi; Uyarılar / Hata olayları / DLQ / İşler → *liste + detay çekmecesi + toplu işlem* şablonu (ortak filtre çubuğu: zaman aralığı, tenant, entegrasyon, durum; sunucu sayfalama; URL'de filtre durumu); grafikler mevcut ECharts. Konsol sekme yapısı: **Genel bakış · Tenant sağlığı · Uyarılar · Hata olayları · DLQ · İşler/Koşular · Entegrasyon uyum** — son sekme ADR-0018 için ayrılmış yer tutucudur (bulgu listesi aynı *liste + detay çekmecesi* şablonuyla; içerik ve uçlar ADR-0018'de); "İşler/Koşular" sekmesi `runType` filtresiyle ileride ajan koşularını da listeler. Aynı liste/detay deseni tenant'ın Export/Import log listeleri ve denetim günlüğüyle paylaşılır — bu ekranların desen göçü kendi olgunluk turunda (§11) yapılır, bu ADR yalnızca ortak bileşeni tanımlar.
- **Ortak veri sözleşmesi** (admin tenant detayı ve tenant ekranı AYNI DTO + AYNI `IntegrationHealthCard/Row` bileşeni):
  ```
  IntegrationHealthItem {
    integrationCode, displayName,
    status: 'healthy'|'degraded'|'down'|'paused'|'unknown',
    reasons: [{ code, message /* TR, eşlenmiş */, since }],
    lastOrderSyncAt, orderSyncLagSec, lastStockPublishAt,
    calls1h, errorRate1h, errorRate24h,
    breaker: 'closed'|'open'|'half_open',
    authValid: boolean|null,
    webhook: { enabled, healthy, lastReceivedAt } | null,
    openAlerts, updatedAt
  }
  ```
  Durum hesaplaması tek saf fonksiyonda: `down` = devre > 10 dk açık veya AUTH geçersiz veya lag > 2 sa; `degraded` = hata ≥ %20 (n ≥ 20) veya lag > 3× aralık veya webhook sağlıksız; `paused` = entegrasyon pasif / tenant askıda; `unknown` = 24 sa veri yok. Tenant asla görmez: diğer tenant'lar, pod/Redis/altyapı, yığın izi; pazaryeri hata iletisi yalnızca redakte ve eşlenmiş kodla. **Tenant-yüzlü rota adı ve sarmalayıcı `docs/API_TENANT_SURFACE.md`'ye aittir** (paralel belge): alan **adlandırmasında** çakışma olursa o belge kazanır, **anlam ve hesaplama** bu ADR'de sabittir; orkestratör birleştirmede uzlaştırır.
- Uygulama kabuğunda **Destek kodu** gösterimi (Karar 1.8) ve platform durum bandı (Karar 6).

### Karar 6 — Genel durum (status) sayfası

**Şimdi herkese açık durum sayfası yok.** Bunun yerine uygulama-içi **platform durum bandı**: admin konsoldan olay/bakım iletisi girer (ApplicationDB ayarı, başlangıç-bitiş), tüm tenant'ların kabuğunda gösterilir (benchmark N17'yi ucuzca karşılar). `/health` detaysız kalır (bilgi ifşası yok). Herkese açık sayfa tetikleyicisi: ücretli tenant ≥ 20 **veya** SLA satışı **veya** ilk > 2 saatlik kesinti — o zaman kendi yazmak yerine barındırılan (ücretsiz katmanlı) durum sayfası tercih edilir (§9 S5).

### Karar 7 — Saklama, hacim, Mongo etkisi

| Veri | Saklama (varsayılan) | Hacim tahmini (9 tenant, ~22 aktif entegrasyon) |
|---|---|---|
| stdout JSON log | platformun saklaması (Render/Railway plana bağlı; §9 S3); Mongo'ya log yazılmaz | — |
| `MetricRollups` 5 dk | 7 gün (TTL) | ~160 etkin seri × 288 × 7 ≈ 320 bin seri-kova, ~15 ad × 2.016 kova ≈ 30 bin doküman, **≈ 40 MB** |
| `MetricRollups` 1 sa | 90 gün (TTL) | ≈ 40 MB |
| `ErrorEvents` | `lastSeen` + 30 gün | parmak izi sayısıyla sınırlı, < 5 MB |
| `JobState` / `JobRuns` | kalıcı (~10 dok.) / 14 gün | ≤ 1.500 dok./gün, < 10 MB |
| `Alerts` | çözülme + 90 gün | küçük |
| `DeadLetterQueue` | açıklar kalıcı; `resolved/discarded` + 30 gün (yeni TTL) | küçük |
| `AuditLogs` | 365 gün (ADR-0001, değişmez) | — |
| `IntegrationCallMetrics` | yazım Aşama B'de durur, mevcut 30 gün TTL ile boşalır, sonra koleksiyon kaldırılır | bugün (tahmin) ~50 bin dok./gün, 30 günde ~1,5 M dok. ≈ 300 MB + indeks |
| `QueueMetrics` | hiç yazılmadı (K5); boş olduğu doğrulanınca kaldırılır, veri `MetricRollups`'a | 0 |

Mongo yazma yükü: pod başına dakikada ~30 kova upsert + toplanmış hata olayları + iş durumları ≈ < 100 yazım/dk — bugünkü çağrı-başı insert'ten (ortalama ~35/dk, patlamada yüzlerce) daha düşük ve patlamaya dayanıklı. Okuma: Overview 15 sn önbellekli. **Koleksiyon kaldırma, TTL/indeks ekleme DB değişikliğidir → CLAUDE.md kural 3 (doğrulanmış yedek) ön koşuldur**; yerelde yeni tenant DB'si yaratılmaz, testler mock'ludur.

### Karar 8 — Uygulama sırası ve aşamalandırma

| Aşama | Kapsam | Çıkış kapısı | Test stratejisi (hepsi mock; gerçek DB/Redis YOK) | Geri alma |
|---|---|---|---|---|
| **A — Log + correlation + JobRunRegistry** (backend, M) | Karar 1.1–1.7; `X-Request-Id` yanıt başlığı; `JobRunRegistry` + 8 zamanlayıcının sarmalanması (ifDue, üst üste binme); `unhandled_rejections` sayacı; `ApiManager.sendError` hata zarfı (§10) | tüm testler 3× yeşil, tsc 0; `console.*` mandalı aktif; redaksiyon testi (bilinen sırlar/axios `config` çıktıda YOK); ALS yayılımı HTTP → BullMQ iş verisi → `ResilientHttpClient` testi; taşkın denetimi testi; `JobRunRegistry` sahte zamanlayıcıyla stale/hung/never-ran/overlap/ifDue testleri | birim + characterization; köprü yalnızca giriş noktasında (mevcut console casusları bozulmaz) | `LOG_FORMAT=legacy`; `runJob` saydam sarmalayıcı (kaldırılınca eski davranış) |
| **B — Metrikler + hata olayları + tenant sağlık verisi** (backend, M-L) | Karar 2; `IntegrationCallMetrics` sink değişimi; bağımsız `QueueEvents` dinleyicisi; örnekleyiciler; `ResilientHttpClient.snapshot()`; `ErrorEvents`; `/client-log`; `ObservabilityService` okuma uçları + tenant sağlık DTO'su (rota `API_TENANT_SURFACE.md`'ye göre) | histogram birleştirme (2 pod × 2 flush = tek sonuç) testi; kardinalite sınırı testi; DTO durum fonksiyonu tablo testleri; OPERATION_POLICY varsayılan-ret testi yeni uçları kapsar; tenant ucu başka tenant verisi döndürmez testi; ADR-0005 kalibrasyon ölçümü artık `MetricRollups`'tan alınabiliyor | mock model/`setSink`; sahte `Queue.getJobCounts` | `METRICS_SINK=legacy` (çağrı-başı yazıma döner) |
| **C — Alarm + bildirim** (backend, M) | Karar 4; `Alerts`; kanallar; susturma/bakım; çapraz-rol bekçi; `NotificationService` düzeltmesi; 14 gün gölge mod | kural başına sentetik kova tablo testleri; histerezis/yeniden bildirim/susturma sahte saatle; fırtına testi (100 eşzamanlı uyarı → 1 özet e-posta); `MailService` mock; gölge mod sonunda yanlış pozitif oranı < %30 | birim + sahte zaman | `ALERTS_NOTIFY=false` (değerlendirme sürer) |
| **D — Konsol + tenant ekranı + frontend log** (frontend, L; ADR-0015 şablonları) | Karar 1.8 (logger, global yakalama, ErrorBoundary, Destek kodu, `restapi.ts` interceptor, ESLint + mandal, `sourcemap:'hidden'`, Electron köprüsü); Karar 5 ekranları; Karar 6 bandı; `getSystemHealth` emekliye ayrılması | Playwright (mock API) her ekran için loading/empty/error/stale durumları + Destek kodu görünürlüğü; axe yeni ihlal 0; ekran görüntüsü tabanları; `admin-system.spec.ts` K8 testi bilinçli ters çevrildi (not düşülür); `vite build` + `vue-tsc` temiz | mevcut `e2e/fixtures/mockApi` deseni | rota bayrağı: eski `AdminSystemManagementView` eşdeğerlik onaylanana dek kalır |

Sıra: A → B → C; D, B'nin DTO'su sabitlenince C ile paralel başlayabilir. §10 maddeleri aynı aşamalara bağlıdır.

**Riskler:** (1) asenkron log'da çökme anında son tampon kaybı — `fatal` yolunda senkron flush; (2) köprü + çocuk logger çift yazımı — göç edilen dosyada `console` kalmaması mandalla denetlenir; (3) hata olayı taşkınında Mongo yazımı — 10 sn süreç-içi toplama; (4) alarm gürültüsü güveni öldürür — gölge mod + histerezis + özet; (5) `OrderOrchestrator`'a dokunma — bağımsız `QueueEvents` ve yalnızca `runScheduleJobsSafely` sarmalaması, lifecycle testleri önce yeşil.

### Karar 9 — Açık sorular (yalnızca insan kararı; hepsinin varsayılanı var)

- **S1 Ücretli izleme aracı** (Sentry / Better Stack / Grafana Cloud; Protokol 12): varsayılan **yok**. Mimari geçişi tek adaptöre indirir.
- **S2 Harici uptime denetimi** (ücretsiz katmanlı bir servisin `/health`'i dışarıdan yoklaması; tek-süreç dağıtımında süreç ölümünü yakalamanın tek yolu): varsayılan **yok**, önerilen **evet**.
- **S3 Saklama süreleri:** platform log saklaması (plan seçimi), metrik 7 gün/90 gün, hata olayı 30 gün — varsayılanlar yukarıda.
- **S4 Alarm kanalları:** admin e-posta alıcıları (`ALERT_EMAIL_TO`, varsayılan: platform sahibinin adresi env'de); tenant e-posta uyarısı varsayılan kapalı; Slack/webhook sonra.
- **S5 Herkese açık durum sayfası** zamanlaması (Karar 6 tetikleyicileri).

Eşikler, seviyeler, kardinalite, histogram kovaları, yoklama sıklıkları insan kararı DEĞİLDİR — varsayılanlar bu ADR'dedir, gölge mod verisiyle ayarlanır.

### §10 — Genel altyapı best-practice çıtası

Her madde: mevcut durum (kanıt) → karar → aşama → çıkış kapısı. Hepsi mevcut Express + TS + Vue içinde; yeni servis yok.

| Madde | Mevcut durum | Karar | Aşama / çıkış kapısı |
|---|---|---|---|
| **Yapılandırma doğrulama** | 60 dağınık `process.env` okuması; `dotenv`; yalnızca `FIELD_ENCRYPTION_KEYS` fail-fast (CLAUDE.md kural 5) | Tek şema `backend/src/config/env.ts` (**zod**, MIT): tipli, varsayılanlı, rol bazlı zorunluluk; açılışta doğrulama, hata → net ileti + exit(1); kod yalnızca `config`'ten okur. Frontend `import.meta.env` için aynı desen (build-time). `.env.example` şemadan üretilir/testle eşlenir. | A: statik test "şema dışı `process.env` okuması yok" mandalı; eksik zorunlu env ile açılış testi |
| **Güvenlik başlıkları** | `helmet` yok; `x-powered-by` açık; CSP yok; CORS yapılandırılmış (`Webserver.ts:117`) | `helmet` (MIT): HSTS (üretim), `noSniff`, `frameguard: deny`, `referrerPolicy`, `x-powered-by` kapalı; **CSP önce `Report-Only`** (Vite çıktısı + Vuetify inline stil gereksinimi ölçülür), raporlar `/client-log`'a (`kind:'csp'`), 2 hafta temizse zorunlu. | A (başlıklar) / D (CSP zorunlu) — başlık varlık testi; CSP ihlali 0/7 gün |
| **Rate limiting / kötüye kullanım** | In-process sınırlayıcı yalnızca login/register/billing webhook/mock checkout (`ApiManager.ts:42-43`, `rateLimit.ts`); güvenilir proxy hop'u doğru (`clientIp.ts:14-26`); genel API sınırı yok | Genel API için kimlik (`tenantId:userSub`) anahtarlı gevşek sınır (varsayılan 600 istek/dk, 429 + `Retry-After`) + pahalı uçlar (dışa aktarma, toplu işlem, `getOverview`) için ayrı düşük sınır; `/client-log` kendi sınırı. Çok pod'da Redis tabanlıya geçiş eşiği: web pod ≥ 2. | B — 429 zarfı ve başlık testi |
| **Girdi doğrulama** | Şema kütüphanesi yok; servisler `this.request`'ten elle okur (ör. `admin-service.ts:28,172`; `sortField` yalnızca bazı uçlarda beyaz listeli) | zod şemaları uç başına, `RunOperation` katmanında opsiyonel `schema` alanı; **yeni ve dokunulan uçlarda zorunlu**, eskilerde fırsatçı; mandal: şemalı uç sayısı azalamaz. Serbest `sortField`/`$regex` girdileri öncelikli (NoSQL enjeksiyon/ReDoS yüzeyi). | A (altyapı) / B+ (uçlar) — geçersiz girdi → 400 `VALIDATION` testi |
| **Tutarlı hata zarfı + kod kataloğu** | `ApiManager.sendError` `{ error: e.message, service, operation }` döndürür (`ApiManager.ts:31-34`): kod yok, 500'de iç ileti sızabilir | Zarf: `{ error: { code, message, requestId, details? } }` — `code` katalogdan (`docs/ERROR_CODES.md`, `IntegrationError` kodları + `VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL`); 5xx'te ileti genel ("Beklenmeyen hata"), ayrıntı yalnızca log'da. Frontend ileti eşlemesi koda göre (i18n). Geçiş: eski `error` alanı bir sürüm boyunca string olarak da tutulur (geriye uyum). | A (zarf) / D (FE eşleme) — sızıntı testi (Mongo hata iletisi 500 yanıtında YOK) |
| **Graceful shutdown** | VAR ve testli (ADR-0006 Karar 6) | Korunur; logger flush + metrik son flush + `runJob` "kapanıyor" durumu eklenir. | A |
| **Bağımlılık / lisans / güvenlik taraması** | `license-check` betiği ve `docs/LICENSE_AUDIT.md` var; CI yok; otomatik zafiyet taraması yok | CI'da `npm audit --omit=dev --audit-level=high` (engelleyici), lisans denetimi (izinli liste), haftalık bağımlılık güncelleme PR'ı (Renovate/Dependabot — barındırma platformuna göre, ücretsiz). Engelleyici istisna listesi gerekçeli dosyada. | CI kurulduğunda (aşağıda) |
| **CI/CD kalite kapıları** | CI yapılandırması yok (`.github/`, `.gitlab-ci.yml` yok); kapılar elle (tsc, jest, Playwright) | Tek pipeline: backend `tsc` + jest; frontend `vue-tsc` + ESLint + vite build + Playwright (mock, Chromium); mandallar (console, env, şema) testlerin parçası; `main`'e birleştirme yeşil pipeline şartlı. Dağıtım otomasyonu (Render/Railway) mevcut haliyle kalır. Barındırma seçimi (GitHub Actions / GitLab CI) insan kararı değil — uzak depo hangisindeyse (bugün `origin`). | A başında kurulur; çıkış: pipeline 3 ardışık yeşil |
| **Sürüm / changelog** | Her iki paket `1.0.0` (`package.json:3`), etiket yok, CHANGELOG yok | Semver + Conventional Commits'ten türetilen `CHANGELOG.md` (elle özetlenmiş bölüm başlıkları yeterli); build'e git SHA + sürüm gömülür (log `ver`, istemci `appVer`, kaynak haritası eşlemesi bunu kullanır); Electron paket sürümü aynı kaynaktan. | A (SHA gömme) / D (changelog) |
| **Ortam ayrımı** | yerel / Railway staging / Render / üretim; `restapi.ts:44-60` yorum satırında eski URL'ler | `APP_ENV = local|staging|production` şemada zorunlu; log `env` alanı; staging'de egress guard zorunlu (C19 dersi); üretim-dışı ortamda e-posta alıcıları sabit test adresine yönlendirilir; yorumlu URL blokları temizlenir. | A |
| **Yedekleme / DR** | Elle yedek + doğrulama kaydı (`backup/README.md`, `docs/DB_BACKUP_VERIFICATION.md`); Atlas tarafı yedekleme planı belgelenmemiş | Hedef: RPO ≤ 24 sa, RTO ≤ 4 sa (tek haneli ölçek için); Atlas'ın yönetilen yedeği (tier'a bağlı, insan kararı) + haftalık `mongodump` doğrulama işi `runJob` altında (Karar 3) — son başarılı yedek yaşı Overview'da ve R6'da; üç ayda bir geri yükleme tatbikatı `docs/`'a kaydedilir. | C (izleme) — "yedek yaşı > 8 gün" uyarısı |
| **Dokümantasyon (API)** | `docs/OPERATION_POLICY.md` işlem kataloğu var; OpenAPI yok; RPC tarzı `Service/method` uçları | Tam OpenAPI **şimdi yok** (RPC yapısında düşük değer); zod şemalarından **üretilen** işlem kataloğu (ad, kademe, girdi şeması, hata kodları) `OPERATION_POLICY.md`'yi besler. Tenant-yüzlü herkese açık API gelirse (`API_TENANT_SURFACE.md`) o yüzey için OpenAPI 3.1 zorunlu. | B+ — katalog üretimi testte eşlenir |

### §11 — Diğer mevcut yapılar için aynı olgunluk yükseltme yöntemi

Orkestratör bu yöntemi bildirim, log/rapor ekranları, içe/dışa aktarma, dashboard/rapor, destek/talep, ayarlar gibi alanlarda tekrar kullanır.

**Ölçütler (her biri 0–3 puan; 0 = yok/bozuk, 1 = ilkel, 2 = yeterli, 3 = sektör çıtasında):**
1. **Kanıt** — gerçekten çalışıyor mu? Dosya:satır, çağrı noktası, okuyucu var mı ("yazılıp hiç okunmayan" = 0; bkz. K4, K5).
2. **Kullanıcı değeri** — hangi persona, hangi iş; boş/hata/yükleniyor durumları ayrışıyor mu (K8 = 0)?
3. **Sektör çıtası** — `docs/research/2026-09-28-saas-capability-benchmark.md` karşılığı (ŞART/SIK/AYIRT) ve durumu.
4. **Operasyon güvenilirliği** — sessiz başarısızlık var mı; idempotent mi; tekrar denenebilir mi; bir hatası başka işleri etkiliyor mu (K3)?
5. **Test/gözlem** — characterization/sözleşme testi, log/metrik/`runJob` kancası, Destek kodu ile izlenebilirlik.
6. **Ölçeklenebilirlik ve maliyet** — sınırlı sorgu, sayfalama, indeks, TTL, kardinalite, yoklama sıklığı (K7).
7. **Güvenlik/gizlilik** — kademe politikası, redaksiyon, tenant izolasyonu.

**Yöntem:** (1) envanter — kanıt tablosu (bu ADR'nin Bağlam tablosu şablondur); (2) puanla; (3) sınıfla — *olgun* (tüm ölçütler ≥ 2: koru), *ilkel* (kanıt veya güvenilirlik 0, ya da ortalama < 1,5: yükselt), *çürük* (yalnızca `adr-writing` özel kuralı sağlanırsa yeniden yazım; şüphede refactor); (4) hedef seviyeyi sektör çıtası ve maliyetle seç (her ölçüt 3 olmak zorunda değil); (5) aşamalara böl, her aşamaya çıkış kapısı + mock'lu test + geri alma bayrağı; (6) sayısal yeniden değerlendirme eşiği yaz.

**Bu ADR'nin uygulanmış örneği (izleme alanı):** önce Kanıt 1 · Değer 1 · Çıta 1 · Güvenilirlik 0 · Test/gözlem 1 · Ölçek 1 · Güvenlik 2 → *ilkel*; hedef (D sonrası) 3 · 3 · 2 · 2 · 3 · 2 · 3.

**Sonraki turlar için bu keşifte görülen ilk sinyaller (doğrulanmadı, yalnızca başlangıç noktası):** bildirim — 3 günlük ömür, tercih yok, await edilmeyen kayıt (K11); log/rapor ekranları — Export 15 gün / OperationLog 90 gün / ImportJobReport 7 gün saklama tutarsızlığı (K15), `restapi` hata=boş; destek/talep — talep numarası `Math.random` 6 hane, çakışma denetimi yok (`admin-service.ts:216`); dashboard — ağır anlık aggregate ve 10 sn yoklama deseni (K7) başka panellerde de aranmalı.

## Gerekçe

Tek haneli abone ölçeğinde asıl risk "görmeden kaybetmek"tir: sessiz ölen bir stok yayını zamanlayıcısı zero-oversell hedefini (ADR-0004) doğrudan deler, kör kalan kuyruk metriği ADR-0005'in ölçekleme kararını imkânsız kılar, senkron log fırtınası sistemi yavaşlatır (C19). Bunların hepsi yeni servis gerektirmeden, tek üretim bağımlılığı (pino; zod ve helmet §10 için) ve ~5 küçük koleksiyonla çözülür; üstelik bugünkü çağrı-başı metrik yazımını kaldırdığı için Mongo yükü **azalır**. Tam gözlem yığını (A) veya ücretli APM (B) bu ölçekte değerinden pahalıdır; mimari ise ölçek büyüdüğünde onlara tek adaptörle geçişi açık tutar. Modüller yeniden yazılmıyor: `ResilientHttpClient`, zamanlayıcılar, `getSystemHealth`, `restapi.ts` sarmalanıyor/genişletiliyor; davranış değişiklikleri (K8 ters çevirme, hata zarfı) bilinçli ve testle belgeleniyor.

## Maliyet/Ölçek Notu

- **Ek maliyet:** yeni servis 0; yeni üretim bağımlılıkları `pino`, `zod`, `helmet` (MIT); geliştirme bağımlılıkları `pino-pretty`, ESLint takımı. Mongo ≈ 100 MB toplam yeni veri (≈ 300 MB'lık mevcut çağrı-başı metriğin yerine). Operasyon yükü: alarm eşiklerinin ilk 14 gün ayarı.
- **Yeniden değerlendirme eşikleri (herhangi biri):**
  - aktif tenant > 50 **veya** `MetricRollups` > 500 MB **veya** metrik yazımı > 1.000/dk → Prometheus uyumlu dışa aktarım + barındırılan Grafana/Prometheus (S1) değerlendirilir;
  - worker pod ≥ 2 → `runJob` içinde lease; web pod ≥ 2 → Redis tabanlı rate limit;
  - pod ≥ 3 **veya** nöbetçi (on-call) ekip ≥ 2 kişi → OpenTelemetry iz (trace) + ücretli APM;
  - `ErrorEvents` açık parmak izi > 500 **veya** ekip hata üçlemesine haftada > 2 saat harcıyorsa → barındırılan hata izleme (S1);
  - gölge mod sonrası alarm yanlış pozitif oranı 2 hafta boyunca > %30 → kural seti yeniden tasarlanır;
  - Overview p95 > 1 sn → önceden hesaplanmış anlık görüntü işi;
  - platform log saklaması olay incelemesi için yetersiz kalırsa (≥ 1 olayda gereken log bulunamadı) → log gönderimi (S3).

## Etki Alanı

Backend: `entegrasyonik.ts`, `Webserver.ts`, `api/ApiManager.ts`, `api/RunOperation.ts`, `api/operationPolicy.ts` (+`docs/OPERATION_POLICY.md`), `api/services/admin-service.ts` (emekliye ayrılacak `getSystemHealth`), yeni `api/services/observability-service.ts`, yeni `services/observability/*` (logger, context, MetricsRegistry, ErrorEvents, JobRunRegistry, AlertEvaluator, kanallar), `services/metrics/QueueMetricsCollector.ts`, `services/notification/NotificationService.ts`, `services/mail/MailService.ts` (tüketici), `integration/modules/common/http/{ResilientHttpClient,IntegrationCallMetrics}.ts`, `integration/engine/order/{OrderQueueProducer,OrderWorker,OrderErrorHandler,OrderOrchestrator(yalnız sarmalama)}.ts`, `integration/engine/IntegrationEngine.ts` (zombi temizliği sarmalama), `integration/engine/BaseWorker.ts`, `operations/stock/*Scheduler.ts`, `operations/billing/TrialExpiryScheduler.ts`, `utils/Logger.ts` (deprecated), yeni `config/env.ts`, ApplicationDB şemaları (`MetricRollups`, `ErrorEvents`, `JobState`, `JobRuns`, `Alerts`; DLQ TTL; `IntegrationCallMetrics`/`QueueMetrics` kaldırma), `health/*` (değişmez). Frontend: `main.ts`, `composables/restapi.ts`, yeni `composables/logger.ts`, `router`, kabuk (Destek kodu, durum bandı), `views/secure/adminPanel/*` (yeni konsol, `AdminSystemManagementView` emekliliği), tenant Entegrasyon sağlığı ekranı, `components/logListView/*` (teknik iz kodu gösterimi), `vite.config.mts`, `main.js` (Electron), ESLint yapılandırması, `e2e/specs/admin-system.spec.ts` (bilinçli ters çevirme). Belgeler: `docs/API_TENANT_SURFACE.md` (uyum), yeni `docs/ERROR_CODES.md`. İlişkili ADR'ler: 0001, 0004, 0005, 0006, 0012, 0015, 0018 (entegrasyon uyum izleme + ajan-hazır altyapı; genişleme noktaları: genel koşu şeması Karar 3, `AlertSource`/R12 Karar 4, konsol "Entegrasyon uyum" sekmesi Karar 5).

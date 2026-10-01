# Backoffice genel bakış (sağlık panosu) ve motor/kuyruklar — API sözleşmesi (B1, B7a-d)

`docs/BACKOFFICE_PLAN.md` §2.5 (B7), §3 "B1 kompozisyonu". Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum). Kaynak: `backend/src/api/services/backoffice-overview-service.ts`, `backoffice-engine-service.ts` (ince sarmalayıcılar), iş mantığı `backend/src/api/admin/overviewOps.ts` + `engineOps.ts` (saf, enjekte bağımlılık), şemalar `backend/src/capabilities/rpc-input/backoffice-engine.ts`, yetenekler `backend/src/capabilities/domains/backoffice-engine.ts` (`platform.overview.health`, `platform.engine.*`).

> Adlandırma notu: plan §3 paragrafı tek ucu `BackofficeHealthService/getOverview` diye anar; uygulanan ad görev kararıyla **`BackofficeOverviewService/getHealth`**'tir (FE bunu kullanır). B1'deki "bugünkü gelir özeti" (B4c) ve "yeni sorun" için ayrı L7 ucu bu işte YOK: gelir bölümü B4c bağlandığında `revenue` anahtarıyla EKLENİR (ek alan, kırıcı değil); sorun sayısı doğrudan `ErrorEvents`ten gelir.

## Genel kurallar

- Her uç `POST /admin-api/<Servis>/<operasyon>`, JSON gövde (okumalarda `{}`), çerezle oturum (`credentials: 'include'`), yazmada `Origin` zorunlu. Başarı: 200 + JSON.
- Gövde `strict`: bilinmeyen alan/operatör nesnesi → `400 VALIDATION`. `limit` 1..200 (varsayılan 50), `cursor` opak (sunucudan gelen `nextCursor` aynen geri gönderilir; bozuk imleç → `400 VALIDATION`). Sorgular `maxTimeMS ≤ 5000`.
- **Yük (payload) ve tenant iş verisi ASLA dönmez:** kuyruk işinin `data`'sı, hata METNİ, `errorMessage`, `outputSummary` yanıtta yoktur; yalnız kimlik, tenant numarası (`tenantId`), entegrasyon kodu, **hata kodu** (`[KOD]` öneki; yoksa `UNKNOWN`), sayaçlar ve zamanlar döner.
- **Step-up + gerekçe:** `retryJob`, `discardJob`, `releaseStuckLease` son 5 dk içinde `BackofficeAuthService/reauth` ister (yoksa `401 REAUTH_REQUIRED`) ve gövdede **`reason` (≥10, ≤500 karakter)** zorunludur (yoksa `400 VALIDATION`). Okumalar step-up istemez.
- Denetim (`AuditLogs`, `surface:'backoffice'`): her yazma RunOperation'dan `backoffice.write` (`meta.reason`) + hedefli olay: `backoffice.engine.retry_job`, `.discard_job`, `.release_lease` (`meta.queue/jobId/tenantId` ya da `meta.kind/id/previousOwner`, `meta.reason`; başarısız kira bırakma denemesi `result:'fail'`, `meta.why:'not_stuck'`).
- **LIVE_READONLY (`docs/LIVE_READONLY.md`):** `retryJob` yeteneği `external:true` + `write` işaretlidir (yeniden koşan iş pazaryerine yazabilir) → `LIVE_READONLY=1` iken `423 LIVE_READONLY`. `discardJob`/`releaseStuckLease` yerel durum değiştirir, bu kipte serbesttir. Okumalar serbesttir.
- Hata kodları (`docs/ERROR_CODES.md`): `VALIDATION` 400, `REAUTH_REQUIRED` 401, `QUEUE_UNAVAILABLE` 503 (Redis hazır değil; yalnız `listFailedJobs(source:bullmq)/retryJob/discardJob`), `JOB_NOT_FOUND` 404, `JOB_NOT_FAILED` 409 (yanıt metni güncel durumu yazar), `LEASE_NOT_STUCK` 409, `LIVE_READONLY` 423.
- Kuyruk adı şimdilik tek: `"order-sync-queue"` (BullMQ'nun tek kuyruğu; katalog hattı Mongo durum makinesidir → B7c). Yeni BullMQ kuyruğu eklenince `ENGINE_QUEUES` + şema enum'u genişler (FE kuyruk listesini yanıttan okumalı, sabit kodlamamalı).

## B1 — `BackofficeOverviewService/getHealth`
Girdi: `{}`. Bölümler paralel toplanır, **her biri 2 sn zaman aşımıyla**; hata/zaman aşımında yalnız o bölüm `{ "status":"degraded", "error":"timeout"|"error" }` olur, uç düşmez. Üst `status`: herhangi bir bölüm degraded VEYA bağımlılık hazır değilse `degraded`, aksi `ok`. FE her bölümü bağımsız çizmeli (degraded kartı + yeniden dene).
```json
{ "generatedAt": "2026-09-30T12:30:00.000Z", "status": "ok", "degradedSections": [],
  "dependencies": { "status":"ok", "ready": true, "role":"all", "mongo":"ok", "redis":"ok" },
  "pods": { "status":"ok", "self":"pod-7d9", "windowMinutes": 15, "items": [
      { "pod":"pod-7d9", "activeLeases": 3, "runningJobs": 1, "lastSeenAt":"2026-09-30T12:29:40.000Z", "self": true } ] },
  "red": { "status":"ok", "windowMinutes": 60, "from":"2026-09-30T11:30:00.000Z", "requests": 1200, "byStatusClass": {"2xx":1150,"4xx":30,"5xx":20},
           "errors5xx": 20, "errorRate": 0.0167, "requestsPerMinute": 20, "durationAvgMs": 140, "durationP95Ms": 500, "durationP95Overflow": false,
           "scope":"platform", "note":"Pod flush aralığı (60 sn) kadar gecikmeli; tüm podlar toplanır." },
  "queues": { "status":"ok", "items": [ { "name":"order-sync-queue", "available": true, "backlog": 5, "active": 2, "failed": 3, "dlqPending": 1 } ] },
  "intake": { "status":"ok", "allOpen": false, "scope":"process", "restricted": [ { "target":"platform:trendyol", "intake":"drain" } ] },
  "issues": { "status":"ok", "open": 12, "newLast24h": 2 } }
```
- `dependencies.role`: `web|worker|all`; `redis` `web` rolünde `n/a`. `ready:false` ise üst `status` `degraded` (bölüm yine `ok` — bilgi geçerlidir).
- `pods`: son 15 dk içinde kira tutan (ExportSignals/ImportJobs `lockedBy`) ya da zamanlayıcı heartbeat'i/başlangıcı olan podlar (pod adı = `POD_NAME`/hostname). Hiç iş yapmayan pod görünmez (ayrı heartbeat koleksiyonu yok).
- `red`: `MetricRollups` `http_requests` + `http_request_duration_ms` (5 dk kovaları, son 1 sa, TÜM podlar). `errorRate` = 5xx/toplam (`requests:0` ise `null`). `durationP95Ms` kova ÜST SINIRIdır (histogram; `null` + `durationP95Overflow:true` = 60 sn üstü). Metrik yoksa (yeni başlamış) sayılar 0, yüzdelikler `null`.
- `queues.items[].available:false` → Redis hazır değil (`backlog/active/failed` `null`); `backlog` = wait + delayed; `dlqPending` = Mongo DLQ'da `PENDING_MANUAL_REVIEW` sayısı (okunamazsa `null`).
- `intake`: **süreç-içi** anlık görüntü (config poll ile tüm podlarda aynıdır; kısa gecikme olabilir). `restricted` boşsa `allOpen:true`.
- `issues`: `ErrorEvents` `status:'open'` sayısı ve son 24 saatte ilk görülen açık grup sayısı.

## B7a — `BackofficeEngineService/getQueues`
Girdi: `{}`.
```json
{ "generatedAt": "…", "queues": [ {
    "name": "order-sync-queue", "available": true,
    "counts": { "wait": 3, "active": 1, "delayed": 0, "failed": 2, "completed": 40, "paused": 0 },
    "dlq": { "pendingReview": 1 },
    "metrics": { "resolution": "1h", "from": "2026-09-29T12:00:00.000Z", "to": "2026-09-30T13:00:00.000Z",
      "series": [ { "t": "2026-09-29T12:00:00.000Z", "count": 10, "failed": 2, "retried": 1, "waitMsP95Max": 300, "procMsP95Max": 900 } ] } } ] }
```
- `series`: `QueueMetrics` dakikalık kovalarından saatlik toplam; **25 nokta** (24 sa + içinde bulunulan saat), boş saatler 0/`null`. `*P95Max` = saat içindeki dakikalık p95'lerin en büyüğü (gerçek saatlik p95 değil). Ölçüm okunamazsa seri sıfırlarla döner (sayaçlar yine gelir).
- Redis hazır değilse: `available:false`, `counts:null` (**uç 200 döner**, hata değil).
- Not: bugünkü `AdminService/getSystemHealth` ham `llen/zcard` okuması DEĞİŞMEDİ; bu uç yenidir.

## B7b — `listFailedJobs`, `retryJob`, `discardJob`
`listFailedJobs { queue, source?: "bullmq"|"dlq" (varsayılan bullmq), cursor?, limit? }`
```json
{ "source":"bullmq", "queue":"order-sync-queue", "items": [ { "id":"fetch-42", "operation":"fetch-orders-trendyol", "tenantId":7, "integrationCode":"trendyol",
    "errorCode":"UNAVAILABLE", "attemptsMade":5, "maxAttempts":5, "failedAt":"…", "enqueuedAt":"…" } ], "nextCursor": "bzoy…" }
```
- `source:"dlq"` (Mongo `dead_letter_queue`; hatası kalıcı/deneme tükenmiş işler): öğe `{ id, originalJobId, tenantId, integrationCode, errorCode, dlqType:"FATAL_ERROR"|"MAX_RETRIES_EXCEEDED", status, failedAt }`; yeniden eskiye, keyset imleç. **DLQ kayıtları için retry/discard YOKTUR** (BULGU: DLQ'dan yeniden kuyruğa alma semantiği/idempotency ADR'de tanımlı değil; bu yüzden yalnız listelenir). `retryJob`/`discardJob` yalnız BullMQ `failed` kümesindeki işler içindir.
- `bullmq` kaynağı en yeni başarısız önce; `failed` kümesi son 500 ile sınırlıdır (`removeOnFail`). Boş durum: `items: []`, `nextCursor: null`.

`retryJob { queue, jobId, reason }` → `{ "queue", "jobId", "retried": true }`. İş `failed` durumundan yeniden kuyruğa alınır (BullMQ `job.retry('failed')`). `jobId` `^[A-Za-z0-9:_.-]{1,128}$`. Hatalar: `404 JOB_NOT_FOUND`, `409 JOB_NOT_FAILED`, `503 QUEUE_UNAVAILABLE`, `423 LIVE_READONLY`.

`discardJob { queue, jobId, reason }` (destructive) → `{ "queue", "jobId", "discarded": true }`. Yalnız `failed` iş silinir (aktif iş asla). Aynı hata kodları (423 hariç).

## B7c — `getStateMachineJobs`, `releaseStuckLease`
`getStateMachineJobs {}`:
```json
{ "generatedAt":"…", "leaseTimeoutMs": { "export": 1800000, "import": 1800000 },
  "exportSignals": { "byStatus": { "QUEUED": 4, "PENDING": 1, "COMPLETED": 900 }, "locked": 2 },
  "importJobs":    { "byStatus": { "PROCESSING": 1, "COMPLETED": 300 }, "locked": 1 },
  "stuckLeases": [ { "kind":"export", "id":"64b…(24 hex)", "tenantId":1, "integrationCode":"trendyol", "status":"PENDING", "lockedBy":"pod-a",
                     "leaseExpiredAt": null, "lastActivityAt":"…", "staleForMs": 2700000 } ],
  "stuckLeaseCount": 1, "stuckListTruncated": false }
```
- **Takılı kira tanımı** (orkestratörlerin zombi temizliğiyle aynı eşik; `*.config.json` `lockTimeout`, varsayılan 30 dk): `lockedBy` dolu VE — export: `lockExpiry < şimdi` ya da `updatedAt ≤ şimdi−eşik`; import: `lastCheckedAt ≤ şimdi−eşik`. En çok 100 öğe/tür (`stuckListTruncated`).
- `byStatus` tüm belgeler üzerinden gruplanır (export: `QUEUED|PREPARING|PENDING|SENT|WAITING|COMPLETED|FAILED`; import: `WAITING_FOR_FETCH|FETCHING|READY_TO_SYNC|PROCESSING|COMPLETED|FAILED|CANCELLED|ARCHIVED`).
- `lockedBy` = sahip pod adı.

`releaseStuckLease { kind:"export"|"import", id (24 hex), reason }` → `{ "kind", "id", "released": true, "previousOwner": "pod-a" }`. Koşul güncelleme İÇİNDE yeniden uygulanır (yarış güvenli): kira sağlıklıysa `409 LEASE_NOT_STUCK` ve DOKUNULMAZ; kayıt yoksa `404 JOB_NOT_FOUND`. Etki: `lockedBy:null`; import işi `FETCHING|PROCESSING` ise `ImportOrchestrator.clearZombies` ile aynı şekilde `status:'FAILED'` olur (iş yeniden başlatılmaz; sonraki tur/kullanıcı yeniden alır).

## B7d — `listJobRuns`
`{ job?: string, status?: "ok"|"partial"|"failed"|"skipped", cursor?, limit? }` — `JobRuns` (14 gün TTL; yalnız ANLAMLI turlar: başarısız/kısmi/nedenli atlama/işlem>0 + saatte en az bir), en yeni önce, keyset imleç.
```json
{ "items": [ { "id":"64b…", "job":"stock-sync", "runType":"scheduler", "trigger":"interval", "status":"failed", "startedAt":"…", "finishedAt":"…", "durationMs":1200,
    "counts": { "processed": 5 }, "skippedReason": null, "error": { "code":"E1", "message":"kısa" }, "scope": { "level":"platform" }, "corrId":"c1", "pod":"pod-a" } ],
  "nextCursor": null, "retentionDays": 14,
  "states": [ { "job":"stock-sync", "lastStatus":"ok", "lastStartedAt":"…", "lastFinishedAt":"…", "lastSuccessAt":"…", "lastDurationMs":900, "consecutiveFailures":0,
                "runningSince": null, "heartbeatAt": null, "pod":"pod-a", "expectedIntervalMs":60000, "overdue": false } ] }
```
- `states` yalnız **ilk sayfada** (imleçsiz istek) gelir (`JobState`, iş başına son durum; en çok 200). `overdue` = son bitiş `3 × expectedIntervalMs`'den eski (beklenen aralık yoksa `false`).
- `counts` yalnız sayısal değerler (en çok 20 anahtar); `outputSummary`/`budget` dönmez. `error.message` ≤500 karakter (yazımda redakte). `scope.level:"tenant"` ise `tenantId`/`integrationCode` de gelir.
- Boş durum: `{ "items": [], "nextCursor": null, "retentionDays": 14, "states": [] }`.

## Bilinçli sınırlar / bulgular
- DLQ kayıtlarında retry/discard yok (yukarıda); karar gerektirir (ADR).
- Pod listesi iş yapan podları gösterir; boşta pod için ayrı heartbeat mekanizması yok.
- `QueueMetricsCollector` sipariş kuyruğu olaylarına bağlı değilse `metrics.series` sıfır kalır (collector bağlantısı `QueueMetricsCollector.ts` başlığındaki açık bulgu).
- Yetenek kaydında `mcp` kapalı (platform_admin); agent/MCP'ye açılmaz.

## Ek (K51 / BO1) — dashboard ve toplu işlem
Tam sözleşme `docs/API_BACKOFFICE_ATTENTION.md`: `BackofficeOverviewService/getAttention` (öncelik sıralı "dikkat gerektirenler", sistem + müşteriler), `getPulse` (büyük resim); BE-03 `listFailedJobs` süzgeçleri (`tid`, `integrationCode`, `errorCode`) + `retryJobs` (toplu, ≤ 50, step-up + gerekçe, idempotent, LIVE_READONLY 423); BE-04 `listFailedJobs` öğelerinde `reqId`/`traceId`.

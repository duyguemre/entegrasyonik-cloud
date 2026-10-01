# Backoffice yönlendiren dashboard — `getAttention` + `getPulse` (+ BE-01..BE-06 ekleri) — API sözleşmesi

Karar: `USER_DECISIONS` K51; kullanıcı geri bildirimi `docs/cloud-contracts/BO_FEEDBACK_R1_2026-10-01.md` (BO1-DASH, BO1-PAGES); öneriler `frontend/backoffice/docs/elev/NEXT_TASKS.md` B bölümü. Ortak kurallar `docs/BACKOFFICE_PLAN.md` §2 ve `docs/API_BACKOFFICE_OVERVIEW_ENGINE.md` "Genel kurallar" (POST `/admin-api/<Servis>/<operasyon>`, `strict` gövde, `limit` 1..200, imleç opak, `maxTimeMS ≤ 5000`, tenant iş verisi/PII/yük ASLA dönmez). Bu belge o kuralları tekrar etmez.

> **Durum:** sözleşme önce yazılır, uygulama sonra gelir (bulut önyüz görevleri bu belgeye bağlanır). Alan adları bağlayıcıdır; ek alan eklenebilir (kırıcı değil), mevcut alan değişmez. Uygulama notları sonda "Uygulama notları" bölümüne işlenir.

Yüzey: `/admin-api` (yalnız platformAdmin, TOTP'li tam oturum). Hepsi `surface:'backoffice'`, `mcp` kapalı (`platform_admin`), `agent` kapalı. Okumalar step-up istemez.

---

## 1. `BackofficeOverviewService/getAttention`

Girdi: `{ limit?: 1..50 }` (varsayılan 20; **grup başına** üst sınır). Tek çağrı; iki grup paralel toplanır.

Her kontrol bölümü **2 sn zaman aşımıyla** çalışır (`getHealth` deseni). Hata/zaman aşımında yalnız o kontrol okunamaz (`degradedSections`'a girer), uç düşmez, diğer öğeler gelir. FE "N kontrol okunamadı" şeridi + yeniden dene gösterir; okunamayan kontrol "sorun yok" anlamına GELMEZ.

```jsonc
{
  "generatedAt": "2026-10-01T12:00:00.000Z",
  "status": "attention",              // "ok" (hiç öğe yok) | "attention" (≥1 öğe) | "degraded" (≥1 kontrol okunamadı; öğe de olabilir)
  "summary": { "critical": 1, "warning": 3, "info": 2 },   // iki grup toplamı (kesmeden ÖNCE sayım)
  "degradedSections": [ { "section": "circuits", "error": "timeout" } ],   // error: "timeout" | "error"
  "groups": {
    "system":    { "total": 3, "truncated": false, "items": [ /* AttentionItem[] */ ] },
    "customers": { "total": 3, "truncated": false, "items": [ /* AttentionItem[] */ ] }
  }
}
```

`items` her grupta **öncelik sıralıdır**: ciddiyet (`critical` > `warning` > `info`), sonra `weight` (azalan), sonra `since` (eski önce), sonra `id`. FE yeniden sıralamaz. `total` kesmeden önceki öğe sayısı; `limit` aşıldıysa `truncated:true`.

### AttentionItem

```jsonc
{
  "id": "sys.queue.backlog:order-sync-queue",   // kararlı kimlik: <grup kısaltması>.<kontrol>[:<kapsam>]; FE anahtar/yok-sayma için kullanır
  "group": "system",                            // "system" | "customers"
  "severity": "critical",                       // "critical" | "warning" | "info"
  "title": "Sipariş kuyruğunda birikim",        // TR, kısa (≤ 60 karakter)
  "why": "Bekleyen iş sayısı 1.240; işlenmeyi bekleyen iş eşiğin üstünde.",   // tek cümle (≤ 200 karakter); ham hata metni/PII yok
  "count": 1240,                                // sayı (kontrole göre: iş/tenant/çağrı/sorgu sayısı); yoksa null
  "countUnit": "iş",                            // "iş" | "müşteri" | "çağrı" | "sorgu" | "uyarı" | "kayıt" | "pod" | null
  "impact": "Sipariş senkronu gecikiyor.",      // etki, tek cümle (≤ 160 karakter) ya da null
  "since": "2026-10-01T11:20:00.000Z",          // koşulun başladığı/ilk görüldüğü an; bilinmiyorsa null
  "subjects": [ { "tid": 7, "name": "Örnek Mağaza" } ],   // yalnız "customers" grubu (ve tenant'a özgü system öğeleri); ≤ 5 örnek; yalnız tid + ad (tenant iş verisi/PII yok)
  "actions": [
    { "label": "Başarısız işlere git", "kind": "navigate", "target": { "route": "/motor", "query": { "tab": "failed" } } },
    { "label": "Hepsini yeniden dene", "kind": "action", "capabilityId": "platform.engine.retry_jobs" }
  ]
}
```

- `actions`: 1..3 öğe, ilki önerilen (birincil). `kind:'navigate'` → `target: { route: string; query?: Record<string,string> }`; `route` backoffice yolu (`frontend/backoffice/src/navigation/screens.ts` ile aynı: `/motor`, `/entegrasyonlar`, `/altyapi`, `/loglar`, `/musteriler`, `/musteriler/:tid`, `/abonelikler`, `/bildirimler/uyarilar`, `/musteriler/destek`, `/musteriler/yasam-dongusu`, `/genel-bakis`), `query` süzgeç önceden uygulanmış hali (BE-01/03/06 süzgeç adlarıyla aynı). Tek tenant'a özgü öğede route `/musteriler/<tid>` olabilir (yol parametresi hazır). `kind:'action'` → `capabilityId` (yetenek kaydı kimliği; FE kendi GuardedDialog akışını — step-up + gerekçe — açar, çağrıyı kendisi yapar). Sunucu eylemi KENDİSİ çalıştırmaz.
- `weight` yanıtta yoktur (yalnız sıralama için sunucu içi). Aynı ciddiyette önem sırası: etkilenen sayı büyük olan önce.

### Kontrol kataloğu (kimlik, eşik, kaynak)

Eşikler sabittir (sunucu sabiti; ayar yok), mevcut alarm kurallarıyla (`operations/alerts/alertRules.ts`) hizalıdır.

**SİSTEM (`group:'system'`)**

| `id` önek | Bölüm (`degradedSections.section`) | Koşul → ciddiyet | Birincil eylem |
|---|---|---|---|
| `sys.queue.backlog:<kuyruk>` | `queues` | `wait+delayed` ≥ 200 → warning; ≥ 1000 → critical | navigate `/motor` `{tab:'queues'}` |
| `sys.queue.failed:<kuyruk>` | `queues` | BullMQ `failed` ≥ 1 → warning; ≥ 25 → critical | navigate `/motor` `{tab:'failed'}` |
| `sys.queue.dlq:<kuyruk>` | `queues` | DLQ `PENDING_MANUAL_REVIEW` ≥ 1 → warning; ≥ 10 → critical | navigate `/motor` `{tab:'failed', source:'dlq'}` |
| `sys.queue.unavailable` | `queues` | Redis yok, kuyruk okunamadı → critical | navigate `/altyapi` |
| `sys.circuit.open:<entegrasyon>` | `circuits` | herhangi bir podda devre kesici `open` (>0) → critical; yalnız `half_open` → warning | navigate `/entegrasyonlar` `{tab:'resilience', integrationCode}` |
| `sys.api.errorrate:<entegrasyon>` | `apiHealth` | son 1 sa, ≥ 20 çağrı ve hata oranı ≥ %20 → warning; ≥ %50 → critical | navigate `/entegrasyonlar` `{tab:'api-health', integrationCode, range:'1h'}` |
| `sys.lease.stuck` | `leases` | takılı kira ≥ 1 → warning; ≥ 10 → critical | navigate `/motor` `{tab:'state-machine'}` ; ikincil action `platform.engine.release_stuck_lease` |
| `sys.infra.degraded` | `infra` | bağımlılık hazır değil (mongo/redis `ok` değil) → critical; yalnız bir sağlık bölümü degraded → warning | navigate `/altyapi` |
| `sys.http.5xx` | `infra` | son 1 sa, ≥ 50 istek ve 5xx oranı ≥ %5 → warning; ≥ %20 → critical | navigate `/loglar` `{tab:'issues', status:'open'}` |
| `sys.alert.firing:<ruleId>` | `alerts` | **tenant'a özgü olmayan** (`detail.tid` yok) `firing`, susturulmamış, `shadow` olmayan uyarılar; seviye uyarının kendi seviyesi | navigate `/bildirimler/uyarilar` `{status:'firing', ruleId}` ; ikincil action `platform.alerts.mute` |
| `sys.slowquery.burst` | `slowQueries` | son 1 sa yavaş sorgu ≥ 50 ve ≥ 3× önceki 23 sa saatlik ortalaması → warning; ≥ 500 → critical | navigate `/altyapi` `{tab:'slow-queries', range:'1h'}` |

**MÜŞTERİLER (`group:'customers'`)** — öğe başına en çok 5 `subjects`; `count` etkilenen müşteri sayısı.

| `id` önek | Bölüm | Koşul → ciddiyet | Birincil eylem |
|---|---|---|---|
| `cus.integration.error:<entegrasyon>` | `alerts` | R1 (tenant × entegrasyon hata oranı) `firing`, susturulmamış → uyarının seviyesi | navigate `/musteriler` `{hasIssues:'1'}` ; tek müşteri ise `/musteriler/<tid>` |
| `cus.integration.auth:<entegrasyon>` | `alerts` | R2 kimlik hatası `firing` (`scopeKey` `auth:…`) → critical | aynı |
| `cus.sync.lag` | `orderSync` | ACTIVE tenant, `lastSuccessfulOrderSync` var ve ≥ 6 sa önce → warning; ≥ 24 sa → critical (hiç senkronlanmamış tenant sayılmaz) | navigate `/musteriler` `{hasIssues:'1'}` |
| `cus.trial.ending` | `subscriptions` | `trialing` ve `trialEndsAt` ≤ 3 gün içinde → warning (≤ 1 gün → critical) | navigate `/abonelikler` `{status:'trialing', endingInDays:'3'}` ; action `platform.subscriptions.extend_trial` |
| `cus.sub.suspended` | `subscriptions` | `suspended` → warning | navigate `/abonelikler` `{status:'suspended'}` |
| `cus.payment.problem` | `subscriptions` | `past_due` → warning; `graceUntil` ≤ 2 gün içinde → critical | navigate `/abonelikler` `{status:'past_due'}` |
| `cus.deletion.pending` | `lifecycle` | `DELETION_PENDING` → info; kalıcı silmeye ≤ 3 gün → warning | navigate `/musteriler/yasam-dongusu` `{status:'DELETION_PENDING'}` |
| `cus.lifecycle.failed` | `lifecycle` | `PROVISIONING_FAILED` ya da `PURGE_FAILED` → critical | navigate `/musteriler/yasam-dongusu` `{status:'failed'}` |
| `cus.ticket.aging` | `tickets` | açık/işlemde destek talebi ≥ 24 sa → warning; ≥ 72 sa → critical | navigate `/musteriler/destek` `{status:'open', olderThanHours:'24'}` |

Tenant'a özgü kontrollerde `subjects` yalnız `{ tid, name }` (Clients başlığı) taşır; sipariş, ürün, kullanıcı, destek talebi içeriği YOKTUR.

---

## 2. `BackofficeOverviewService/getPulse`

Girdi: `{}`. "Sistem kullanımı büyük resimde nasıl?" kartları için sakin özet. Her blok **2 sn zaman aşımıyla**; tek blok `{status:'degraded',error}` olabilir. Veri yoksa ya da hesaplanamıyorsa değer **`null` + `computable:false` + `note:'hesaplanamadı'`** (uydurma 0 yok).

```jsonc
{
  "generatedAt": "…",
  "tenants": { "status":"ok", "active": 41, "total": 43, "byStatus": { "ACTIVE": 41, "DELETION_PENDING": 2 } },
  "orders":  { "status":"ok", "computable": true, "last24h": 412, "last7d": 2650, "previous24h": 380, "changePct": 8.4, "hourly": [{ "t": "2026-10-01T11:00:00.000Z", "count": 21 }] },   // veri yoksa: computable:false, last24h/last7d/previous24h/changePct null, hourly [], note:"hesaplanamadı"
  "calls":   { "status":"ok",
               "http":        { "computable": true, "last24h": 90210, "last7d": 610000, "hourly": [ { "t":"2026-10-01T11:00:00.000Z", "count": 3800 } ] },   /* hourly: son 24 sa */
               "integration": { "computable": true, "last24h": 40010, "last7d": 280000 } },
  "errorRate": { "status":"ok",
                 "http":        { "computable": true, "hourly": [ { "t":"…", "requests": 3800, "errors5xx": 12, "rate": 0.0032 } ] },   /* requests=0 → rate null */
                 "integration": { "computable": true, "last24h": 0.021, "last7d": 0.018 } },
  "mrr": { "status":"ok", "computable": true, "unit":"minor", "currency": { "TRY": 123400 }, "activeSubscriptions": 30, "trialing": 8, "lostLast30d": 2 }
}
```
- Veri yoksa ilgili alt blok `{ "computable": false, …null/[]…, "note": "hesaplanamadı" }` olur (HTTP/çağrı kovası hiç yoksa ya da `IntegrationCallMetrics` boşsa).

- `tenants`: `Clients` durum dağılımı (aktif = `ACTIVE`). 
- `orders`: platform geneli YENİ sipariş hacmi. Kaynak: tenant etiketsiz `orders_ingested_total{channel}` sayacı (sipariş içe alma yolunda `OrderRepository.saveOrders`; yalnız yeni oluşan sipariş sayılır, güncelleme sayılmaz) ve `MetricRollups` 1 sa kovaları (90 gün saklama). `last24h`/`last7d` toplam, `previous24h` bir önceki 24 saat, `changePct` = (son−önceki)/önceki×100 (1 ondalık; önceki 0 veya önceki dönem verisi yoksa `previous24h`/`changePct` `null`). Hiç kova yoksa `computable:false` + `note:'hesaplanamadı'` (uydurma 0 yok). Sayaç yalnız bu değişiklikten sonraki siparişleri kapsar (geriye dönük doldurma yok). Kanal kırılımı bu uçta dönmez.
- `calls`: `http` = `MetricRollups.http_requests` (tüm podlar, 5 dk/1 sa kovaları); `integration` = `IntegrationCallMetrics` (30 gün TTL) 24 sa/7 g sayısı.
- `errorRate.http`: saatlik 5xx oranı (son 24 sa); `integration`: hata/çağrı.
- `activeUsers` (MOB-08, ek blok) ve isteğe bağlı `platform` girdisi: `docs/API_BACKOFFICE_USAGE.md` §3.1.
- `mrr`: `computeRevenueMetrics` ile aynı hesap (plan liste fiyatı; muaf/özel teklif hariç; para birimi bazında, küçük birim). `lostLast30d` iptal/süresi dolan abonelik sayısı.

---

## 3. Yetenekler, denetim, hatalar

| Yetenek kimliği | RPC | Etki |
|---|---|---|
| `platform.overview.attention` | `BackofficeOverviewService/getAttention` | read |
| `platform.overview.pulse` | `BackofficeOverviewService/getPulse` | read |
| `platform.tenants.list` | `BackofficeTenantService/listTenants` (BE-01) | read, `sensitive_read` denetimi (çağrı başına tek kayıt, yalnız süzgeç özeti) |
| `platform.tenants.health_summary` | `BackofficeTenantService/getHealthSummary` (BE-02) | read (sayaç; denetimsiz) |
| `platform.tenants.usage` | `BackofficeTenantService/getUsage` (MOB-08; `docs/API_BACKOFFICE_USAGE.md`) | read (sayaç; denetimsiz) |
| `platform.engine.retry_jobs` | `BackofficeEngineService/retryJobs` (BE-03) | write + `external:true` (LIVE_READONLY → 423), step-up + gerekçe |
| `platform.prefs.list_views` / `save_view` / `delete_view` | `BackofficePrefsService/listViews|saveView|deleteView` (BE-05) | read / write / write |

- `getAttention` / `getPulse` denetim yazmaz (agregat, PII yok). Girdi `strict`: bilinmeyen alan → `400 VALIDATION`.
- Hata kodları yeni değil: `VALIDATION` 400, `REAUTH_REQUIRED` 401, `QUEUE_UNAVAILABLE` 503, `LIVE_READONLY` 423; BE-05 için `VIEW_LIMIT` 409 (aşağıda; `docs/ERROR_CODES.md`'ye eklenir).

---

## BE-01 — `BackofficeTenantService/listTenants` (müşteri listesine operasyon özeti)

Karar: mevcut `AdminService/getClients` (müşteri uygulamasının eski yanıt şekli, karakterizasyon testli) DEĞİŞMEZ; yeni uç eklenir.

Girdi (hepsi opsiyonel): `{ hasIssues?: boolean; subscriptionStatus?: SubscriptionStatus[] (≤ 6); status?: string[] (≤ 10, Clients durumu); q?: string (≤ 60; başlıkta büyük/küçük harf duyarsız içerir); sortBy?: 'tid'|'name'|'openIssues'|'lastErrorAt'|'failedJobs24h' (varsayılan 'tid'); sortDir?: 'asc'|'desc' (varsayılan: 'tid'/'name' için asc, diğerleri desc); cursor?, limit? }`

```jsonc
{ "items": [ {
    "tid": 7, "name": "Örnek Mağaza", "status": "ACTIVE",
    "ops": { "planCode": "growth", "subscriptionStatus": "active",
             "openIssues": 2, "openIssuesApprox": true,
             "failedJobs24h": 3, "lastErrorAt": "2026-10-01T10:02:00.000Z" } } ],
  "nextCursor": null, "scanned": 47, "scanTruncated": false,
  "opsDegraded": [ "failedJobs" ] }
```
- `ops.planCode/subscriptionStatus`: `Subscriptions` (yoksa `null`). `openIssues`: açık `ErrorEvents` gruplarından tenant'ın kovasını (`tenantBucketOf`) içerenlerin sayısı — **yaklaşık** (256 kovalı sayım; çakışmada fazla sayabilir, eksik saymaz) → `openIssuesApprox:true` her zaman. `failedJobs24h`: son 24 sa DLQ kayıtları + BullMQ `failed` kümesindeki (son 500) işler; Redis yoksa yalnız DLQ ve `opsDegraded` içinde `"failedJobs"`. `lastErrorAt`: son 7 günde `IntegrationCallMetrics` hata çağrısının en yeni zamanı (yok → `null`).
- `hasIssues:true`: `openIssues > 0` VEYA `failedJobs24h > 0` VEYA son 24 saatte hata çağrısı. Süzgeç/sıralama sunucuda tüm (≤ 1000) tenant üzerinde uygulanır, sonra sayfalanır (`scanned`; 1000 aşılırsa `scanTruncated:true`). İmleç ofset tabanlı (opak).
- Tenant iş verisi dönmez (ad + tid + sayaç). `sensitive_read` denetimi (süzgeç özeti).

## BE-02 — `BackofficeTenantService/getHealthSummary { tid }`

Hassas okuma DEĞİL (iş verisi yok; yalnız sayaç/kod). Denetim yazılmaz. `tid` = `Clients.clientId` (abonelik, kuyruk işi, çağrı metriği ve uyarı kimliği; bulunamazsa `order` ile aranır). Yoksa `404 NOT_FOUND`, geçersizse `400 VALIDATION`.
```jsonc
{ "tid": 7, "generatedAt": "…",
  "openIssues": { "approx": true, "items": [ { "fp": "server::adapter::UNAVAILABLE::…", "module":"adapter-trendyol", "code":"UNAVAILABLE", "integrationCode":"trendyol", "lastSeen":"…", "count": 14, "status":"open" } ] },   // ≤ 20, lastSeen azalan; örnek mesaj YOK
  "failedJobs": { "bullmq": 2, "dlq": 1, "bullmqAvailable": true },   // dlq = PENDING_MANUAL_REVIEW sayısı; Redis yoksa bullmq null + bullmqAvailable:false
  "lastSyncAt": { "trendyol": "2026-10-01T11:55:00.000Z", "hepsiburada": null },   // entegrasyon kodu → son BAŞARILI entegrasyon çağrısı (30 gün TTL; yalnız hata alan entegrasyon null)
  "lastOrderSyncAt": "2026-10-01T11:50:00.000Z",                                  // Clients.lastSuccessfulOrderSync (yoksa null)
  "alerts": [ { "ruleId":"R1", "scopeKey":"trendyol:7", "level":"warning", "status":"firing", "firstFiredAt":"…", "lastSeenAt":"…", "mutedUntil": null } ],   // ≤ 20; detail.tid === tid olan firing uyarılar
  "degradedSections": [ { "section": "openIssues", "error": "timeout" } ] }   // section: openIssues | failedJobs | lastSyncAt | alerts; error: timeout | error
```
- Bölüm başına 2 sn zaman aşımı. Okunamayan bölüm **boş/varsayılan** değerle döner (`[]`, `{}`, `{bullmq:null,dlq:null,bullmqAvailable:false}`) ve `degradedSections`'a yazılır — FE boşluğu "sorun yok" diye göstermemeli.
- `openIssues` yaklaşıktır (BE-06 ile aynı kova mantığı).

## BE-03 — Başarısız işlerde süzgeç + toplu yeniden deneme

`BackofficeEngineService/listFailedJobs` istek alanlarına eklenir (hepsi opsiyonel; mevcut sözleşme bozulmaz): `tid?: number`, `integrationCode?: string`, `errorCode?: string` (`^[A-Z_]{2,32}$`; `UNKNOWN` = `[KOD]` öneki olmayanlar). `bullmq` kaynağında süzgeç, `failed` kümesinin (≤ 500) tamamı okunup bellekte uygulanır, sonra ofset imleçle sayfalanır; `dlq` kaynağında Mongo sorgusuna iner. Yanıta `filter` yansır: `{ tid, integrationCode, errorCode }` (uygulananlar), `total` (yalnız `bullmq` + süzgeç varken; kesin sayı), diğer alanlar aynı.

`BackofficeEngineService/retryJobs { queue, jobIds: string[] (1..50, tekilleştirilir), reason }` → 
```jsonc
{ "queue": "order-sync-queue", "requested": 12, "succeeded": 11, "failed": 1,
  "results": [ { "jobId": "fetch-42", "ok": true }, { "jobId": "fetch-43", "ok": false, "error": "JOB_NOT_FAILED" } ] }
```
- Step-up (`REAUTH_RPCS`) + `reason` (≥ 10) zorunlu; LIVE_READONLY: yetenek `external:true`+write → **423** (tüm çağrı). Tek `Idempotency-Key` desteği mevcut dış-etkili-yazma mekanizmasındandır.
- **Idempotent**: iş başına bağımsız; `failed` değilse (`JOB_NOT_FAILED`, ör. önceki denemede zaten yeniden kuyruğa alındı) ya da yoksa (`JOB_NOT_FOUND`) o iş `ok:false` olur, çağrı **başarısız olmaz** (200). Aynı çağrının tekrarı güvenlidir. Kuyruk kullanılamıyorsa tüm çağrı `503 QUEUE_UNAVAILABLE`. İş başına beklenmeyen hata `error:'RETRY_FAILED'`. `jobId` deseni `^[A-Za-z0-9:_.-]{1,128}$`.
- Denetim: `RunOperation` `backoffice.write` (üst) + `backoffice.engine.retry_jobs` özet kaydı (`meta.queue/requested/succeeded/failed/reason`) + **iş başına** `backoffice.engine.retry_job` alt kaydı (`meta.jobId/tenantId/queue/reason`, `meta.batch:true`). Alt kayıt yalnız başarılı işler için.
- DLQ kayıtları için retry yoktur (değişmedi; ADR eksik).

## BE-04 — İşten loga iz

`listFailedJobs` (`bullmq`) öğesine ve `dlq` öğesine eklenir: `reqId: string | null` — işi kuyruğa alan akışın korelasyon kimliği (`job.data.correlationId`: periyodik işte `ord_…`, webhook'ta isteğin kimliği; desen `^[A-Za-z0-9._:-]{1,64}$`, aksi `null`), `traceId: string | null` (`job.data.traceId`; bugün yazan üretici yok → `null`). **FE iz için `reqId`'yi `BackofficeLogService/trace { correlationId: reqId }` ve `BackofficeLogService/list { correlationId }` ile kullanır** (ek uç yok). Zamanlayıcı koşuları (`listJobRuns.items[].corrId`) zaten aynı kimliği taşır.

## BE-05 — Kayıtlı görünümler (sunucu)

Yeni servis `BackofficePrefsService`; veri `ApplicationDB` yeni koleksiyon **`BackofficeViews`** (`autoIndex:false`; indeks + göç betiği `migrations/0019-backoffice-views-app.js` yazılır, ÇALIŞTIRILMAZ).
- `listViews { screen?: string }` → `{ items: [ { id, screen, name, query, createdAt, updatedAt } ] }` — yalnız **çağıran yöneticinin** kayıtları (`principal.sub`), `updatedAt` azalan, ≤ 20.
- `saveView { screen, name, query }` → `{ id, created: boolean, count }` — `(sub, screen, name)` üzerinde **upsert** (idempotent; aynı ad güncellenir). Yönetici başına toplam en çok **20**; yeni kayıt 21. olacaksa `409 VIEW_LIMIT`.
- `deleteView { id }` → `{ id, deleted: boolean }` — yalnız kendi kaydı (başkasınınki ya da yok → `deleted:false`, 200; yoklama sızıntısı yok).
- Şema: `screen` `^[a-z][a-z0-9-]{0,39}$`; `name` 1..60 (kırpılır); `query` `Record<string, string | string[]>` (≤ 20 anahtar, anahtar `^[A-Za-z][A-Za-z0-9_.-]{0,39}$`, değer ≤ 200 karakter, dizi ≤ 20 öğe; yalnız URL süzgeç modeli — NT-03). `$`/`.` içeren anahtar reddedilir.
- Yetenek: yazanlar `effect:'write'`, step-up/gerekçe YOK (kişisel tercih); `RunOperation` `backoffice.write` denetimi yazar.

## BE-06 — Sorun gruplarında müşteri süzgeci

`BackofficeLogService/issueGroups` girdisine `tid?: number` (pozitif tam sayı) eklenir. Süzgeç, `ErrorEvents.tenantBuckets` (tenant kimliği saklanmaz; ADR-0026 L1) üzerinden **kova eşleşmesiyle** uygulanır → sonuç **yaklaşık**dır (çakışma nedeniyle başka tenant'ın grubu da gelebilir; eksik gelmez). Yanıta `tenantFilter: { tid, approximate: true } | null` eklenir; her satırın alanları aynı. Log gezgini (`list`) zaten kesin `tenantId` süzgeci taşır (değişmedi). FE "yalnız olay akışına uygulanır" notunu kaldırır, sorun gruplarında "yaklaşık" ipucu gösterir.

## BE-07 — Kritik dikkat maddeleri için web push (MOB-06)

`BackofficePrefsService`'e üç uç (MOB-04 kanalı ve kuralları aynen; ayrıntı `docs/NOTIFICATION_PLAN.md` NB9 + "MOB-06 backoffice push"):
- `getPushConfig {}` → `{ enabled, publicKey, devices: [ { id, deviceLabel, createdAt, lastSuccessAt } ] }` — kanal kapalıysa `{enabled:false, publicKey:null, devices:[]}`; yalnız çağıranın cihazları.
- `subscribePush { subscription: { endpoint, expirationTime?, keys: { p256dh, auth } }, deviceLabel? }` → `{ ok: true }` — kanal kapalı `409 PUSH_DISABLED`, izinsiz uç `400 PUSH_ENDPOINT_NOT_ALLOWED`, bozuk anahtar `400 PUSH_KEYS_INVALID`.
- `unsubscribePush { endpoint } | { id }` → `{ removed }` — yalnız kendi kaydı; kanal kapalıyken de çalışır; ikisi birden ya da hiçbiri `400 VALIDATION`.
- Kayıt `PushSubscriptions` koleksiyonunda `tid = 0` (platform; tenant tid'leri ≥ 1) + `userId = principal.sub` — yeni koleksiyon/göç yok (göç `0020` yeterli).
- Yetenekler `platform.prefs.push_{config,subscribe,unsubscribe}` (`platformAdmin`, MCP'ye kapalı); yazmalar step-up/gerekçe istemez (kişisel tercih).
- Gönderici `notifications.platform-attention-push` (worker, 2 dk): `getAttention` ile aynı kaynaklar, yalnız `severity:'critical'` maddeler; yeni madde ya da 6 sa'tir süren madde bildirim üretir (süreç belleği; yeniden başlatmada en çok bir tekrar). İçerik sabit madde başlıkları (tenant adı/`subjects` yok), `url:'/'`, `tag:'bo-attention'`. Gönderim anında alıcı DB'den taze denetlenir: `isGlobalAdmin !== true` ya da `isActive === false` olanın aboneliği silinir.

---

## Uygulama notları (sözleşme sonrası, kırıcı değil)

- **tid kimliği:** yeni uçlarda `tid` = `Clients.clientId` (abonelik/iş/metrik/uyarı kimliği; yoksa `order`). Mevcut `getLifecycle` `order` ile arar; iki kimlik ayrışırsa FE `listTenants` satırındaki `tid`'i kullanmalı (BULGU: `clientId` ≠ `order` olan tenant şu an yoksa fark yok; ayrışma riski ayrı karar).
- **Eylem yetenek kimlikleri** (gerçek kayıt): `platform.engine.retry_jobs`, `platform.engine.release_stuck_lease`, `platform.alerts.mute`, `platform.subscriptions.extend_trial`.
- **Sistem uyarıları tekrar etmez:** tenant'a özgü (`detail.tid`) uyarılar MÜŞTERİLER grubuna gider; `circuit:*` kapsamlı R2 ve R4 (kuyruk) uyarıları kendi kontrolleriyle (`sys.circuit.*`, `sys.queue.*`) zaten gösterildiği için `sys.alert.firing` altında YOKTUR.
- **Müşteri öğesi `subjects` adları** toplu bir tenant-adı aramasıyla doldurulur; arama düşerse `name:null` (uç düşmez).
- **`listTenants` ek alanlar:** `opsDegraded: string[]` (`subscriptions|openIssues|failedJobs|lastErrorAt`; Redis yoksa `failedJobs` yalnız-DLQ olarak işaretlenir), `scanned`, `scanTruncated`. Tarama üst sınırı 1000 tenant.
- **BE-06 adlandırma:** NEXT_TASKS'taki `LogCenterService/getIssueGroups` uygulamada `BackofficeLogService/issueGroups`'tur.
- **Göç:** `BackofficeViews` için `backend/migrations/0019-backoffice-views-app.js` yazıldı, ÇALIŞTIRILMADI; `BackofficePrefsService` canlıya çıkmadan önce `done` olmalı (yoksa tekillik indeksi olmaz).

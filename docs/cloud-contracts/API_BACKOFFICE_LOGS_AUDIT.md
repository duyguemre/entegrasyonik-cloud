# Backoffice log kontrol merkezi + denetim ekranı — API sözleşmesi

ADR-0026 WP-LOG L2. Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum). Kaynak kod: `backend/src/api/services/backoffice-{log,error,audit}-service.ts`, şemalar `backend/src/capabilities/rpc-input/backoffice.ts`, yetenekler `backend/src/capabilities/domains/backoffice.ts`.

## Genel kurallar

- Her uç `POST /admin-api/<Servis>/<operasyon>`, gövde JSON, çerezle oturum (`credentials: 'include'`), yazmada `Origin` zorunlu (bkz. ADR-0026 Karar 4). Başarı: 200 + JSON gövde (aşağıdaki şekiller).
- Gövde `strict`: bilinmeyen alan → `400 VALIDATION` (+ `fields`: alan yolu/ileti listesi; değer yansımaz). Nesne/operatör (`{"$ne":1}`) değerleri reddedilir.
- Zaman: ISO-8601 string (`2026-09-30T10:00:00Z`). Yanıttaki tarihler ISO string.
- Aralık: `from`/`to` verilmezse log uçlarında son 24 saat, denetimde son 7 gün. Log uçlarında >31 gün sessizce 31 güne kırpılır (`to` sabit); **denetim ucunda >31 gün 400 VALIDATION**. `from > to` → 400.
- Hata kodları: `400 VALIDATION` (şema/aralık/imleç), `401 UNAUTHORIZED` / `401 REAUTH_REQUIRED` (oturum), `403 FORBIDDEN` (platform katmanı değil), `404` (yalnız `setStatus`, grup yok), `429` (hız sınırı), `503`. Kod listesi: `docs/ERROR_CODES.md`.
- Yanıtlardaki `msg`, `ctx`, `sampleMessage` en çok 2048 karakterdir. `ctx` JSON'u 2048 karakteri aşarsa `ctx = { "_truncated": true, "preview": "<ilk 2048 karakter>" }` olur (FE "kesildi" rozeti gösterebilir). PII yazım anında maskelidir; ek maskeleme yoktur. `tenantId` görünürdür.
- Sayfalama (`list` uçları): **imleç (keyset)**; `skip`/`page` YOK. İlk istek `cursor`suz; yanıttaki `nextCursor` (opak string, değiştirmeyin) bir sonraki istekte AYNI filtrelerle `cursor` olarak gönderilir. `nextCursor: null` = son sayfa. Sıralama: log `ts` azalan, denetim `at` azalan (eşitlikte `_id`). Filtre değiştirince imleç atılır. Geçersiz imleç → 400.
- Denetim: `BackofficeLogService/list`, `trace` ve `BackofficeAuditService/list` çağrısı **çağrı (=sayfa) başına tek** `backoffice.sensitive_read` kaydı yazar (`meta`: `service`, `operation`, `rows`, `f_<filtre>` özeti ≤6 alan; imleç yazılmaz). Agregat uçlar (`issueGroups`, `issueTrend`, `volume`) denetim yazmaz. `setStatus` `backoffice.write` yazar (step-up/gerekçe gerekmez).

## BackofficeLogService

### `list` — kalıcı log listesi
Girdi (hepsi isteğe bağlı): `from`, `to`, `level: string[]≤20` (`debug|info|warn|error|fatal`), `source: string[]`, `errorClass: string[]`, `tenantId: int>0`, `integrationCode`, `operation`, `correlationId`, `fingerprint`, `textPrefix` (msg ÖNEKİ, regex değil), `limit: 1..200` (vars. 50), `cursor`. Metinler ≤256 karakter.
Yanıt:
```json
{ "items": [ { "_id": "64b…", "ts": "2026-09-30T10:00:00.000Z", "level": "error", "source": "api", "module": "ApiManager", "code": "X", "errorClass": "ApplicationError",
  "tenantId": 7, "integrationCode": "trendyol", "operation": "OrderService/get", "correlationId": "req-1", "durationMs": 120, "msg": "…", "fingerprint": "5e2a…", "ctx": {}, "expAt": "…" } ],
  "nextCursor": "MTc…" }
```
Örnek: `POST /admin-api/BackofficeLogService/list` `{ "level": ["error","fatal"], "tenantId": 7, "limit": 100 }`.

### `issueGroups` — hata grupları (ErrorEvents)
Girdi: `from`, `to`, `status` (`open|acknowledged|resolved|muted`), `source` (`server|client`), `module`, `integrationCode`, `sort` (`lastSeen|count|tenantCount|firstSeen`, vars. `lastSeen`), `limit` 1..200 (vars. 50). İmleç yok (≤200 grup).
Yanıt: `{ "items": [ { "fp", "source", "module", "code", "integrationCode", "count", "rangeCount", "tenantCount", "firstSeen", "lastSeen", "status", "sampleMessage" } ] }`. `fp` = `fingerprint` (aşağıdaki uçlarda `fingerprint` olarak verilir).

### `issueTrend` — grubun günlük trendi
Girdi: `fingerprint` (zorunlu), `from`, `to` (vars. son 30 gün). Yanıt: `{ "points": [ { "day": "2026-09-30", "count": 4 } ] }` (UTC gün; boş günler 0; ≤40 nokta).

### `trace` — correlationId izi
Girdi: `correlationId` (zorunlu). Yanıt: `{ "items": [ …list ile aynı öğe şekli… ] }` (zaman artan, ≤500 kayıt, imleç yok).

### `volume` — kaynak x seviye hacmi
Girdi: `from`, `to`. Yanıt: `{ "items": [ { "source": "api", "level": "error", "count": 42 } ] }` (büyükten küçüğe, ≤200).

## BackofficeErrorService

### `setStatus`
Girdi: `{ "fingerprint": "5e2a…", "status": "open|acknowledged|resolved|muted" }` (şemadaki enum; "ignored" yoktur, karşılığı `muted`). Yanıt: `{ "fingerprint", "status" }`. Grup yoksa `404`. Yan etki: `backoffice.write` denetim kaydı.

## BackofficeAuditService

### `list` — platform geneli denetim kayıtları (AuditLogs)
Girdi (hepsi isteğe bağlı): `from`, `to` (aralık ≤31 gün), `tid: int>0` (tenant), `event` (`^[A-Za-z0-9_.:-]{1,64}$`, tam eşleşme; ör. `app.write`, `backoffice.write`, `backoffice.sensitive_read`, `impersonation.start`, `login`), `actor` (`sub`), `imp: boolean` (impersonation oturumundan yapılanlar; `false` = `imp` olmayanlar), `result` (`ok|fail|error`), `service`, `operation` (`meta.service`/`meta.operation`; `app.write`/`backoffice.write` kayıtlarında dolu), `limit` 1..200 (vars. 50), `cursor`.
Yanıt:
```json
{ "items": [ { "id": "64b…", "at": "2026-09-30T10:00:00.000Z", "event": "app.write", "result": "ok", "actor": "u1", "tid": 5, "onBehalfOf": null,
  "actorType": "user", "surface": "app", "imp": false, "reqId": "req-9", "ip": "1.2.3.4",
  "meta": { "service": "VariantService", "operation": "updateVariants", "effect": "write", "target": "p1", "a_stock": 3, "b_stock": 5 } } ],
  "nextCursor": "MTc…", "from": "…", "to": "…" }
```
Notlar: `meta` yalnızca `sanitizeMeta`'dan geçmiş ilkel alanlardır (≤10 anahtar, ≤200 karakter; parola/token benzeri anahtarlar yok). Önce/sonra alanları `b_<ad>` / `a_<ad>` (X4). `tid` dolu olan kayıtlar tenant tarafında, `backoffice.*` yazmalarında `tid` boş ve hedef `onBehalfOf`'tadır; bu yüzden "bir tenant hakkında yapılan platform işlemleri" için `tid` değil `event: "backoffice.write"` + (gerekirse) `actor` filtresi kullanılır (`onBehalfOf` filtresi yok, listede görünür). IP kişisel veri sayılabilir: yalnız platform yöneticisi görür.

## Performans / indeks notu
`AuditLogs`: mevcut `tid_1_at_-1`, `event_1_at_-1`, `sub_1_at_-1` ve `at` TTL indeksi yeterlidir; yalnız `imp`/`service`/`operation`/`result` tek başına verilirse ≤31 günlük `at` aralığı taranır (`maxTimeMS` 5 sn). Yeni indeks/göç önerilmedi. `LogEvents` indeksleri L1 göçü 0005'te tanımlıdır.

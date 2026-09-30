# Backoffice entegrasyon sağlığı + altyapı + cache — API sözleşmesi (B5/B6/B6b/B6c, B8a-d, B9)

`docs/BACKOFFICE_PLAN.md` §2.4, §2.6, §2.7. Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum). Kaynak: `backend/src/api/services/backoffice-integration-service.ts`, `backoffice-infra-service.ts`, `integration-config-service.ts` (`getCatalog`); mantık `backend/src/operations/backoffice/*`; şemalar `backend/src/capabilities/rpc-input/backoffice-infra.ts`; yetenekler `capabilities/domains/backoffice-infra.ts`.

## Genel kurallar
- Her uç `POST /admin-api/<Servis>/<operasyon>`, JSON gövde, çerezle oturum (`credentials:'include'`), yazmada `Origin` zorunlu. Başarı 200 + JSON.
- Gövde `strict` (bilinmeyen alan / operatör nesnesi → `400 VALIDATION`). Sayfa `limit ≤ 200`, imleç `cursor`. Her Mongo sorgusu `maxTimeMS ≤ 5000`.
- Tek yazan uç `flushCacheFamily`: step-up (`401 REAUTH_REQUIRED` yoksa, 5 dk) + `reason` (≥10, ≤500). RunOperation `backoffice.write` (`meta.reason`) yazar. Diğerleri salt okuma, denetim yazmaz.
- **Sızıntı kuralları (testle korunur):** tenant kimliği (yalnız sayı), belge içeriği, ham Redis/cache anahtarı, sorgu değeri, Redis slowlog argümanı, izinsiz DB adı hiçbir yanıtta yoktur.
- Hata kodları: `VALIDATION` 400, `NOT_FOUND` 404, `REAUTH_REQUIRED` 401, **`INFRA_UNAVAILABLE` 503** (Redis hazır değil / okuma başarısız; ham ileti yok), **`QUERY_TIMEOUT` 504** (5 sn bütçe aşıldı → aralığı daralt).

## B5 `BackofficeIntegrationService/getApiHealth { range, integrationCode? }`
`range`: `"1h" | "24h" | "7d"`. Kaynak `IntegrationCallMetrics` (30 gün TTL). İstek: `{ "range": "24h" }`
```json
{ "range": "24h", "since": "2026-09-29T12:00:00.000Z", "until": "2026-09-30T12:00:00.000Z",
  "items": [ { "integrationCode": "trendyol", "total": 1200, "errors": 30, "errorRate": 0.025,
               "errorsByCode": [ { "code": "UNAVAILABLE", "count": 20, "rate": 0.0167 }, { "code": "RATE_LIMITED", "count": 10, "rate": 0.0083 } ],
               "p95Ms": 1000, "affectedTenants": 4 } ] }
```
- `p95Ms` **yaklaşık**: kova üst sınırı (50/100/250/500/1000/2500/5000/10000/30000 ms); 30 sn üstü `null`. `affectedTenants` = hata alan tenant SAYISI. `items` çağrı sayısına göre azalan, ≤200. Boş durum: `items: []`.

## B6 `BackofficeIntegrationService/getResilienceState {}`
Her pod metrik flush'ında (≈60 sn) `resilience:<pod>` Redis anahtarına 60 sn TTL'li anlık görüntü yazar; uç tüm podların anahtarlarını okur (pod ölürse anahtar düşer → listeden kaybolur).
```json
{ "pods": [ { "pod": "api-1", "observedAt": "2026-09-30T12:00:05.000Z", "engineIntake": "on" } ],
  "items": [ { "integrationCode": "trendyol",
     "pods": [ { "pod": "api-1", "observedAt": "…", "circuits": { "closed": 12, "open": 1, "half_open": 0 },
                 "rate": { "limited": 2, "tenants": 13, "minRatio": 0.5 }, "lastOpenedAt": "2026-09-30T11:58:00.000Z", "intake": "drain" } ] } ] }
```
- `circuits`: o entegrasyondaki tenant×tür (read/write) devre kesicilerinin durum SAYILARI. `rate.limited`: 429 sonrası hızı düşürülmüş tenant sayısı; `minRatio`: etkin/taban hız oranı (1 = tam hız; taban yoksa `null`). `lastOpenedAt` yoksa `null`. `intake`: `on|drain|off` (pod belleğindeki değer; podlar arası sapma görünür). Bir pod o entegrasyonu hiç görmediyse sıfır/`on` satırı döner.
- Boş durum: `{ "pods": [], "items": [] }` (henüz flush yok / hiç dış çağrı yapılmamış). Redis yoksa `503 INFRA_UNAVAILABLE`.

## B6b `IntegrationConfigService/getCatalog { target? }`
`settingsCatalogMirror.ts` geçici kopyasının kalıcı karşılığı (ADR-0020 C açık işi). `target` (entegrasyon kodu, `_engine`, `_platform`) verilirse yalnız o hedefte uygulanabilir anahtarlar; bilinmeyen hedef `404 NOT_FOUND`.
```json
{ "catalogVersion": "2026-09-30.b3",
  "items": [ { "key": "export.publisher.chunkSize", "group": "export.product", "scope": "engine", "type": "int", "unit": "count", "default": 100,
               "safeRange": { "min": 1, "max": 500 }, "danger": "safe", "applies": "next_cycle", "label": { "tr": "…", "en": "…" }, "help": { "tr": "…", "en": "…" },
               "impact": { "tr": "…", "en": "…" }, "advanced": false, "overridable": true, "envLock": null, "tenantOverridable": null, "since": "2026-09-29", "deprecated": null, "exposure": null } ] }
```
Değer/sır yok (yalnız tanım); zod şeması ve iç `consumers` yolları dönmez. `default` tip `PerIntegrationDefault` olabilir (`{ "_": 10, "trendyol": 5 }`). Bu metaveriyle FE `settingsCatalogMirror.ts` silinebilir; `catalogVersion` ≠ `getEffectiveConfig.catalogVersion` ise bayat uyarısı.

## B6c `IntegrationConfigService/getEffectiveConfig` (yetenek bağı)
Zaten bağlı (`platform.integration_config.get`; `get` + `getEffectiveConfig` aynı yeteneğe). Ek iş yok; FE `getEffectiveConfig {target}` çağırır.

## B8a `BackofficeInfraService/getRedisStatus {}`
```json
{ "server": { "version": "7.2.4", "uptimeSeconds": 86400 },
  "memory": { "usedBytes": 1048576, "peakBytes": 2097152, "maxBytes": 0, "fragmentationRatio": 1.1, "evictionPolicy": "noeviction" },
  "clients": { "connected": 12, "blocked": 0 },
  "stats": { "opsPerSec": 35, "keyspaceHits": 100, "keyspaceMisses": 20, "expiredKeys": 5, "evictedKeys": 0 },
  "keyspace": [ { "db": "db0", "keys": 1500, "expires": 300 } ],
  "keyFamilies": { "sampled": 1500, "truncated": false, "items": [ { "family": "bull:order-sync-queue", "count": 900 }, { "family": "resilience", "count": 2 } ] },
  "slowlog": [ { "command": "SMEMBERS", "durationMicros": 15000, "at": "2026-09-30T11:00:00.000Z" } ] }
```
`maxBytes: 0` = sınırsız. Alanlar `INFO`'nun izinli alt kümesidir (eksikse `null`). `keyFamilies` SCAN örneklemesidir (≤10.000 anahtar, COUNT 500, 200 ms); `truncated:true` ise sayılar örnek. Aile = ilk segment (`bull` için `bull:<kuyruk>`; güvensiz ad `other`). Slowlog yalnız komut adı + süre. Yalnız `INFO`, `SCAN`, `SLOWLOG GET` çağrılır.

## B8b `BackofficeInfraService/getMongoStatus {}`
```json
{ "server": { "version": "8.0.4", "uptimeSeconds": 86400, "connections": { "current": 30, "available": 800, "totalCreated": 400 },
              "opcounters": { "insert": 1, "query": 2, "update": 3, "delete": 4, "getmore": 5, "command": 6 },
              "cache": { "usedBytes": 500, "maxBytes": 1000, "dirtyBytes": 10, "fillRatio": 0.5 } },
  "pools": { "appPoolSize": 20, "openTenantHandles": 3 },
  "databases": [ { "scope": "app", "label": "app", "available": true, "collections": 62, "objects": 10000, "dataSize": 1, "storageSize": 1, "indexes": 120, "indexSize": 1 },
                 { "scope": "tenant", "tenantId": 1, "label": "tenant #1", "available": true, "…": "…" } ],
  "skippedNotAllowlisted": 0 }
```
`server: null` = `serverStatus` yetkisi yok (FE "yetki yok" gösterir). **`listDatabases` çağrılmaz.** DB adı kaynağı: uygulama DB'si + `Clients.dbConfig.dbname` (≤200 tenant), CLAUDE.md kural 2'nin KESİN 7 adlık listesiyle kesiştirilir; listede olmayan DB okunmaz/adı dönmez (yalnız `skippedNotAllowlisted` sayacı). Tenant'lar "tenant #N".

## B8c `BackofficeInfraService/getMongoCollections { db, cursor?, limit? }`
`db`: `"app"` ya da tenant numarası (tamsayı). İzinli olmayan/bulunamayan DB → `404 NOT_FOUND` (ayrıştırılmaz). `limit` varsayılan 50, ≤200; imleç = son koleksiyon adı (`nextCursor:null` = son sayfa).
```json
{ "db": "tenant #1", "nextCursor": null,
  "items": [ { "name": "Orders", "documents": 1200, "dataSize": 1, "storageSize": 1, "indexSize": 1, "avgObjSize": 1,
               "indexes": [ { "name": "status_1", "keys": ["status:1"], "unique": false, "sparse": false, "partial": false, "ttlSeconds": null, "usage": 340, "usageSince": "2026-09-01T00:00:00.000Z" } ] } ] }
```
Belge içeriği yok; `partialFilterExpression` değerleri atılır (`partial:true` yalnız bayrak); `usage` = `$indexStats` ops (yoksa `null`); istatistik okunamazsa `statsAvailable:false`.

## B8d `BackofficeInfraService/getSlowQueries { range }`
`range`: `"1h" | "24h" | "7d" | "30d"` (≤24 sa için 5 dk kovası, ötesi 1 sa kovası). Uygulama tarafında mongoose eklentisi (**>200 ms**, find/update/delete/count/distinct/aggregate) `db_slow_query_ms{db,collection,op}` histogramını yazar (flush → `MetricRollups`); `db` yalnız `app|tenant`; sorgu değeri/filtre YAZILMAZ; profiler kullanılmaz.
```json
{ "range": "24h", "thresholdMs": 200, "since": "…", "until": "…",
  "items": [ { "db": "tenant", "collection": "orders", "op": "find", "count": 42, "p95Ms": 500 } ] }
```
`p95Ms` yaklaşık (histogram kova üst sınırı; >60 sn `null`). Boş durum: `items: []` (eşik aşan sorgu yok ya da eklenti henüz veri yazmadı).

## B9 `BackofficeInfraService/getCacheMetrics {}` ve `flushCacheFamily { family, reason }`
Bellek cache'i **pod-yereldir**: yanıt isteği karşılayan podu gösterir (`scope:"pod"`, `pod`); çok podlu ortamda her pod ayrı sorgulanır/boşaltılır (yük dengeleyici hangisine düşerse).
```json
{ "scope": "pod", "pod": "api-1", "hits": 100, "misses": 20, "keys": 50, "sets": 30, "evictions": 0, "maxKeys": 5000, "inflight": 0,
  "totals": { "hit": 100, "miss": 20, "set": 30, "error": 0, "skip": 1, "join": 0, "evict": 0, "invalidated": 2 },
  "breakdown": [ { "name": "orders.OrderSvc.list", "count": 12, "hit": 50, "miss": 5, "set": 8, "hitRatio": 0.91 } ] }
```
`flushCacheFamily { "family": "orders.OrderSvc.list", "reason": "…≥10 karakter…" }` → `{ "family", "removed": 12, "scope": "pod", "pod": "api-1" }`. Aile adı `breakdown[].name` ile TAM eşleşir (önek/alt dize eşleşmesi yok); bilinmeyen aile `404 NOT_FOUND`. Ham anahtar/tenant numarası hiçbir yanıtta yoktur.

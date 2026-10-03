# Backoffice bildirim / duyuru / uyarı + tenant duyuru bandı — API sözleşmesi (NB7, NB8)

`docs/adr/0029-bildirim-sistemi.md` Karar 7, `docs/NOTIFICATION_PLAN.md` NB7/NB8 (BO-N1..BO-N3, F-N4), `docs/adr/0017` Karar 4 (Aşama C, uyarı yaşam döngüsü). Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum) + tenant tarafı `/api` (`AnnouncementService/getActive`). Kaynak: `backend/src/api/services/backoffice-notification-service.ts`, `announcement-service.ts`; mantık `backend/src/operations/notifications/{announcements,announcementAdmin,backofficeOps,platformNotify}.ts`, `operations/alerts/*`; şemalar `capabilities/rpc-input/backoffice-notifications.ts`; yetenekler `capabilities/domains/backoffice-notifications.ts`.

## Genel kurallar
- Her uç `POST /admin-api/BackofficeNotificationService/<operasyon>`, JSON gövde, çerezle oturum (`credentials:'include'`), yazmada `Origin` zorunlu. Başarı 200 + JSON.
- Gövde `strict` (bilinmeyen alan / operatör nesnesi → `400 VALIDATION`; duyuru girdisinde iç içe nesneler de). `limit ≤ 200` (varsayılan 50), imleç `cursor` (opak; en yeni → en eski). Her Mongo sorgusu `maxTimeMS ≤ 5000`.
- **Yazan uçların TAMAMI step-up + gerekçe ister:** `createAnnouncement`, `updateAnnouncement`, `scheduleAnnouncement`, `cancelAnnouncement`, `retryDelivery`, `discardDelivery`, `sendTestEmail`, `muteAlert`. Step-up yoksa `401 REAUTH_REQUIRED` (5 dk pencere), gerekçe (`reason`, ≥10, ≤500 karakter) yoksa `400 VALIDATION`. RunOperation her yazmayı `backoffice.write` (`meta.reason`) olarak yazar; ek hedefli olaylar: `backoffice.notifications.announcement_email`, `…retry_delivery`, `…discard_delivery`, `…test_email`, `backoffice.alerts.mute`.
- **Sızıntı kuralları (testle korunur):** teslim satırında e-posta adresi, kullanıcı kimliği, platform alıcısı, bildirim metni/params YOKTUR. Tenant geçmişi yalnız meta veri döner. Test e-postası yalnız yöneticinin kendi adresine gider, yanıt/audit adres içermez. Yanıtlarda ham hata/sır yok.
- LIVE_READONLY kipinde (`docs/LIVE_READONLY.md`) dış etkili üç uç `423` döner: `scheduleAnnouncement`, `retryDelivery`, `sendTestEmail`.
- `NOTIFY_V2_ENABLED=false` iken (varsayılan) duyuru **bandı çalışır** (zaman penceresinden hesaplanır), ama uygulama içi/e-posta dağıtımı ve durum geçişi işi hiçbir şey yapmaz; uyarı değerlendiricisi ayrıca `ALERT_EVALUATOR_ENABLED` ister. **Canlıya açmadan önce `backend/migrations/0017-announcements-alerts-app.js` uygulanmış olmalı** (yeni koleksiyonlar `Announcements`, `Alerts`; insan onayı + yedek).

### Hata kodları
`VALIDATION` 400, `NOT_FOUND` 404, `REAUTH_REQUIRED` 401, **`ANNOUNCEMENT_NOT_FOUND` 404**, **`ANNOUNCEMENT_STATE` 409** (yalnız taslak düzenlenir/zamanlanır; bitmiş/iptal edilmiş iptal edilemez → detayı yenile), **`DELIVERY_NOT_FOUND` 404**, **`DELIVERY_STATE` 409** (retry yalnız `dead`/`failed`; discard yalnız `pending`/`dead`/`failed`/`skipped`; `sending` dokunulmaz), **`ALERT_NOT_FOUND` 404** (yalnız `firing` uyarı susturulur), **`NOTIFY_EMAIL_UNAVAILABLE` 503** (`NOTIFY_EMAIL_ENABLED` kapalı ya da taşıyıcı hatası; ham ileti yok).

## 1. Duyurular (BO-N1)

### Duyuru nesnesi (yanıt)
```json
{ "id": "64f0…", "kind": "maintenance", "severity": "warning",
  "title": { "tr": "Planlı bakım", "en": "Planned maintenance" }, "body": { "tr": "…", "en": "…" },
  "target": { "mode": "plans", "planCodes": ["pro"] }, "audience": "all_members",
  "channels": { "banner": true, "inApp": true, "email": false },
  "startsAt": "2026-10-02T23:00:00.000Z", "endsAt": "2026-10-03T01:00:00.000Z", "dismissible": false,
  "status": "scheduled", "emailConsentAt": null, "fanout": { "done": false, "tenants": 0, "notified": 0 },
  "createdBy": "<yönetici id>", "updatedBy": null, "scheduledBy": "<id>", "cancelledBy": null, "createdAt": "…", "updatedAt": "…" }
```
`status`: `draft → scheduled → active → ended`, `cancelled`. `fanout` yalnız dağıtım başladıysa dolu (`null` değilse): `done` tamamlandı, `tenants` işlenen tenant, `notified` bildirim üretilen.

### Girdi (`announcement`, create/update/önizleme taslağı)
| Alan | Kural |
|---|---|
| `kind` | `info` \| `maintenance` \| `incident` \| `release`. `maintenance`/`incident` **kapatılamaz** (`dismissible` sunucuda `false`'a zorlanır). |
| `severity?` | `info` \| `warning` \| `critical`; yoksa türden: info/release→info, maintenance→warning, incident→critical. |
| `title`, `body` | `{ tr (zorunlu), en? }`; başlık ≤160, gövde ≤2000 karakter. Düz metin (HTML yorumlanmaz). |
| `target` | `{ mode:"all" }` (aktif tüm tenant) \| `{ mode:"plans", planCodes:[…≤50] }` (ADR-0008 `Subscriptions.planCode`; trialing/active/past_due) \| `{ mode:"tenants", tids:[…≤5000] }`. |
| `audience?` | `all_members` (varsayılan) \| `owners_admins` (yalnız sahip/yönetici kademesi). |
| `channels` | `{ banner, inApp, email }` boolean; en az biri `true`. **`email:true` ise `inApp:true` zorunlu** (uygulama içi bildirim her zaman üretilir). |
| `startsAt` | ISO tarih (geçmişte olabilir → hemen aktif). `endsAt?` ISO ya da `null`; `startsAt`'tan sonra olmalı. |
| `dismissible?` | varsayılan `true` (maintenance/incident için `false`). |

### Uçlar
| Uç | İstek | Yanıt |
|---|---|---|
| `listAnnouncements` | `{ status?, kind?, from?, to?, cursor?, limit? }` (`from`/`to`: `startsAt` aralığı) | `{ items:[duyuru], nextCursor }` |
| `getAnnouncement` | `{ id }` | `{ announcement }` |
| `createAnnouncement` | `{ announcement, reason }` (step-up) | `{ announcement }` (durum `draft`) |
| `updateAnnouncement` | `{ id, announcement, reason }` (step-up; yalnız `draft`, aksi 409) | `{ announcement }` |
| `scheduleAnnouncement` | `{ id, emailConsent?, reason }` (step-up) | `{ announcement }` — `startsAt` gelecekteyse `scheduled`, değilse `active`. |
| `cancelAnnouncement` | `{ id, reason }` (step-up; draft/scheduled/active) | `{ announcement }` (`cancelled`; bant hemen kalkar, gönderilmiş bildirimler geri alınmaz) |
| `previewAnnouncement` | `{ id }` **ya da** `{ draft }` (yalnız biri; gönderim YOK, yazma yok) | `{ banner, notification:{tr,en}, email:{tr,en} }` (aşağıda) |

- **E-posta kanalı (toplu gönderim):** `channels.email:true` olan duyuru `scheduleAnnouncement`'ta **`emailConsent:true`** ister ("yalnızca hizmet duyurusu, pazarlama içeriği yasak" onay kutusu; yoksa `400 VALIDATION`). Onay zamanı `emailConsentAt`'e yazılır ve `backoffice.notifications.announcement_email` audit olayı (hedef modu + gerekçe) eklenir. FE akışı: kaydet/zamanla → step-up diyaloğu + gerekçe + onay kutusu. Alıcı yalnız doğrulanmış e-postalı üyelerdir ve kullanıcının `system` kategorisi e-posta tercihi (opt-out) geçerlidir; e-postada abonelik bağlantısı vardır.
- **Dağıtım (`notifications.announcements` işi, 60 sn, worker):** `startsAt` gelince `scheduled→active`, `endsAt` geçince `active→ended`; `inApp`/`email` açıksa hedef tenant'lara `SYSTEM_ANNOUNCEMENT` bildirimi (tenant başına idempotent: `announcementId:tid`). Bildirimin başlık/gövdesi duyuru metnidir (TR; `en` varsa İngilizce şablonda).
- `previewAnnouncement` yanıtı:
```json
{ "banner": { "id":"…", "kind":"info", "severity":"info", "title":{"tr":"…"}, "body":{"tr":"…"}, "dismissible":true, "startsAt":"…", "endsAt":null },
  "notification": { "tr": { "title":"…", "message":"…" }, "en": { "title":"…", "message":"…" } },
  "email": { "tr": { "subject":"…", "text":"…", "html":"…" }, "en": { "subject":"…", "text":"…", "html":"…" } } }
```
  `html` sunucuda kaçışlıdır; yine de **`<iframe sandbox srcdoc>` ile** gösterin (asla `innerHTML`). Abonelik bağlantısı yer tutucudur (`example.invalid`).

## 2. Teslim günlüğü ve olay kataloğu (BO-N2)

### `getDeliveryStats {}`
```json
{ "generatedAt": "…", "oldestPendingAgeSec": 90,
  "windows": { "24h": { "byStatus": { "pending":1, "sending":0, "sent":50, "failed":0, "dead":2, "skipped":3, "suppressed":0 },
                        "byChannelStatus": [ { "channel":"email", "status":"sent", "count":50 } ],
                        "byCode": [ { "code":"ORDER_SYNC_FAILED", "statuses": { "sent": 40, "dead": 2 } } ] },
               "7d": { "…": "aynı şekil" } } }
```
`oldestPendingAgeSec`: en eski bekleyen teslimin vadesinden bu yana saniye (`null` = bekleyen yok). `byCode` toplama göre azalan, ≤100.

### `listDeliveries { status?, channel?, tid?, code?, eventId?, cursor?, limit? }`
`status`: `pending|sending|sent|failed|dead|skipped|suppressed`; `channel`: `email`; `code`: SCREAMING_SNAKE katalog kodu; `eventId`: 24 hex (olayın tüm teslimleri; BO-N3 satır detayı).
```json
{ "items": [ { "id":"…", "eventId":"…", "tid":7, "code":"ORDER_SYNC_FAILED", "channel":"email", "mode":"instant", "status":"dead", "attempts":5,
               "lastErrorCode":"SMTP_5XX", "createdAt":"…", "nextAttemptAt":"…", "sentAt":null } ], "nextCursor": null }
```
`lastErrorCode` ham SMTP metni değil sınıf kodudur (`disabled`, `unverified`, `no_recipient`, `opt_out`, `misconfigured`, `quiet_hours`, `shadow`, `discarded`, `SMTP_*`…). Platform alarm teslimleri `tid:0` ile görünür.

### `retryDelivery { id, reason }` / `discardDelivery { id, reason }`
Step-up + gerekçe. İstek gövdesine isteğe bağlı `tid` eklenebilir (audit'te hedef tenant olarak görünür). Yanıt `{ id, ok:true }`. Retry: `dead|failed → pending` (deneme sayacı sıfırlanır, hemen kuyrukta); discard: `→ suppressed` (`lastErrorCode:"discarded"`, bir daha denenmez). Uygun olmayan durum `409 DELIVERY_STATE`, kayıt yok `404 DELIVERY_NOT_FOUND`.

### `getCatalog {}`
`{ "items": [ { "code", "category", "severities":[…], "mandatory", "defaultChannels":{"inApp":true,"email":"off|instant|digest"}, "permission", "retention", "surface":"tenant|platform", "titleKey", "bodyKey", "grouped", "legacy", "example":{…} } ] }` — `example` `previewTemplate` için örnek parametrelerdir.

### `previewTemplate { code, locale, channel, params? }`
`locale`: `tr|en`; `channel`: `inApp|email`; `params` yoksa katalog örneği; varsa katalog şemasına (strict) uymalı (aksi `400`, ileti yalnız alan yolu/kural kodu içerir, değer içermez). Yalnız render, **gönderim yok**.
- `inApp`: `{ channel, locale, title, message, actionPath|null, severity }`
- `email`: `{ channel, locale, subject, text, html }` (yukarıdaki `html` güvenlik notu geçerli)

### `sendTestEmail { reason }`
Step-up + gerekçe. Giriş yapmış yöneticinin **kendi** hesap adresine `[TEST]` iletisi gönderir (SMTP doğrulaması). Yanıt `{ sent:true }`. `NOTIFY_EMAIL_ENABLED` kapalıyken `503 NOTIFY_EMAIL_UNAVAILABLE`.

## 3. Tenant bildirim geçmişi (BO-N3)

### `getTenantHistory { tid, cursor?, limit? }`
Yetenek `pii:'masked'` → her çağrı `backoffice.sensitive_read` audit kaydı. **Yalnız meta veri** (bildirim metni, params, alıcı kimlikleri, e-posta adresi yok):
```json
{ "items": [ { "id":"<olay id>", "at":"…", "code":"ORDER_SYNC_FAILED", "category":"order", "severity":"error", "count":3,
               "recipientCount":2, "inAppCount":2, "emailQueued":1, "suppressedCount":0, "emailStatus": { "sent":1, "dead":1 } } ], "nextCursor": null }
```
`count`: grup penceresindeki olay sayısı. `emailStatus`: olayın e-posta teslim durumlarının sayıları (boş `{}` = e-posta yok). Satır detayı için `listDeliveries { eventId: id }`. Defter kaydı 30 gün saklanır (TTL).

## 4. Platform uyarıları (NB8; ADR-0017 "Uyarılar" paneli)

Uyarı yaşam döngüsü `Alerts` koleksiyonunda `(ruleId, scopeKey)` anahtarıyla `firing → resolved` (2 ardışık temiz değerlendirmeden sonra çözülür, çözülen kayıt 30 gün sonra silinir). **Panel 30 sn yoklama ile çalışır (SSE yok).** Değerlendirici (`alerts.evaluator`, 60 sn, worker) `ALERT_EVALUATOR_ENABLED=true` ister; ilk `ALERT_SHADOW_UNTIL` tarihine kadar **gölge moddur**: kayıt tutulur (`shadow:true`), e-posta ve tenant bildirimi gitmez.

| Kural | Koşul (varsayılan) | Önem | Kapsam (`scopeKey`) | Tenant bildirimi |
|---|---|---|---|---|
| `R1` | 15 dk'da çağrı ≥20 ve hata oranı ≥%20 (≥%50 kritik); `VALIDATION`/`NOT_SUPPORTED` orana girmez | warning/critical | `<entegrasyon>:<tid>` | `INTEGRATION_ERROR_RATE_HIGH` |
| `R2` | `AUTH` hatası 15 dk'da ≥3 | critical | `auth:<entegrasyon>:<tid>` | `INTEGRATION_AUTH_FAILED` (zorunlu) |
| `R2` | devre kesici > 10 dk açık | warning | `circuit:<entegrasyon>` | yok (pod görüntüsünde tenant yok) |
| `R4` | order-sync bekleyen > 200 ya da en eski > 10 dk | warning | `order-sync-queue` | yok |
| `R7` | son 1 saatte ≥10 `dead` bildirim teslimi | warning | `notification-outbox` | yok (platform kodu `PLATFORM_DELIVERY_DEAD_LETTERS`) |

Bildirim kuralları: yeni `firing`'de hemen; aynı uyarı için yeniden bildirim kritikte 4 sa, uyarıda 24 sa (cooldown); uyarı→kritik yükselişinde hemen; **susturma** ve **bakım modu** (`maintenance.enabled`) bildirimi bastırır (kayıt sürer); aynı turda >5 yeni platform uyarısı → tek `PLATFORM_ALERT_DIGEST`. Platform e-postası `ALERT_EMAIL_TO` alıcılarına (yoksa yalnız panel); adresler veritabanına yazılmaz.

### `listAlerts { status?, level?, ruleId?, cursor?, limit? }`
`status`: `firing|resolved`; `level`: `warning|critical`; `ruleId`: `R1|R2|R4|R7`.
```json
{ "items": [ { "id":"…", "ruleId":"R1", "scopeKey":"trendyol:7", "level":"critical", "status":"firing",
               "detail": { "integ":"trendyol", "tid":7, "total":100, "errors":55, "rate":0.55 },
               "firstFiredAt":"…", "lastSeenAt":"…", "lastNotifiedAt":"…", "resolvedAt":null, "mutedUntil":null, "shadow":false } ], "nextCursor": null }
```
`detail` yalnız sayı/kod içerir (R1: `integ,tid,total,errors,rate`; R2 auth: `integ,tid,authErrors`; R2 devre: `integ,openCircuits,openForSec`; R4: `wait,oldestWaitSec`; R7: `dead`).

### `muteAlert { ruleId, scopeKey, hours, reason }`
Step-up + gerekçe. `hours` 1–336 süreli susturur, `0` susturmayı kaldırır. Yalnız `firing` uyarı; yoksa `404 ALERT_NOT_FOUND`. Yanıt `{ ruleId, scopeKey, mutedUntil|null }`.

## 5. Tenant tarafı (F-N4 duyuru bandı)

### `POST /api/AnnouncementService/getActive {}` — `app:use` (her üye); hata = hata (boş liste DEĞİL)
Girişte, 5 dakikada bir ve (ileride) SSE `announcement` olayında çağrılır. Görünürlük sunucuda hesaplanır: zaman penceresi (`startsAt ≤ şimdi < endsAt`; durum `active` ya da pencere içindeki `scheduled`) + `channels.banner:true` + hedef (tümü / tenant'ın planı / tenant listesi) + kitle (`owners_admins` → yalnız yönetici/sahip kademesi).
```json
{ "items": [ { "id":"64f0…", "kind":"incident", "severity":"critical", "title":{"tr":"…","en":"…"}, "body":{"tr":"…","en":"…"},
               "dismissible": false, "startsAt":"…", "endsAt": null } ], "serverTime": "2026-10-01T10:00:00.000Z" }
```
Sıralama: önem (critical → warning → info) sonra yenilik. `en` yoksa istemci `tr`'ye düşer. `dismissible:false` (maintenance/incident) bant kapatılamaz; kapatılanlar istemcide (`localStorage ek.ann.dismissed.<uid>`, duyuru id listesi) tutulur. Hedef/kitle/yazar/dağıtım sayaçları yanıtta **yoktur**. Bakım modu 503'ünde (ADR-0026 B11) `maintenance.message` ayrı kaynaktır, bu uçtan gelmez.

### `SYSTEM_ANNOUNCEMENT` uygulama içi bildirimi
`inApp` açık duyuruda her hedef tenant üyesine düşer: `code:"SYSTEM_ANNOUNCEMENT"`, `actionUrl:"/notifications?announcement=<id>"`, `params: { announcementId, kind, title?, summary?, titleEn?, summaryEn? }`. **Bu kod için sunucunun `title/message` alanı duyuru metnidir; FE i18n anahtarı (`notifications.events.SYSTEM_ANNOUNCEMENT.*`) genel yedektir — önce sunucu `title/message` kullanılmalıdır.** `severity`: info/release → `info`, maintenance/incident → `warning`. Kullanıcı `system` kategorisinde e-postayı kapatabilir (uygulama içi kapatılamaz değildir; tercih matrisi F-N2).

## 6. Yapılandırma (env)
`NOTIFY_V2_ENABLED` (duyuru dağıtımı + `notify`), `NOTIFY_EMAIL_ENABLED` (e-posta), `ALERT_EVALUATOR_ENABLED` (varsayılan `false`), `ALERT_SHADOW_UNTIL` (ISO tarih; o tarihe dek gölge mod), `ALERT_EMAIL_TO` (virgülle ayrık alıcılar, ≤10; yoksa yalnız panel). Hepsi varsayılan kapalı; yeni koleksiyonlar için göç `0017` önkoşuldur.

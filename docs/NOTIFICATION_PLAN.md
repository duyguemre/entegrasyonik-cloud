# Bildirim sistemi — uygulama planı (ADR-0029)

Karar: `docs/adr/0029-bildirim-sistemi.md`. Denetim: `docs/audits/NOTIFICATION_AUDIT_2026-09-30.md`. Bu plan iş paketlerini, olay kataloğunun ilk sürümünü ve bulut/backoffice görev briflerini içerir. Backend işleri yerelde yapılır (`faz4-*` dalları). Frontend ve backoffice işleri bulutta yapılır (`cloud/<kısa-ad>`).

## 1. Sıra ve bağımlılıklar

```
NB1 katalog ──► NB2 çekirdek ──┬─► NB3 çağıran göçü
                               ├─► NB4 tenant API ──► F-N1, F-N2
                               ├─► NB5 e-posta ─────► F-N2 (abonelikten çıkma sayfası)
                               └─► NB6 SSE ─────────► F-N3
NB2 + ADR-0026 Aşama 2-BE ───────► NB7 duyuru + backoffice uçları ──► F-N4, BO-N1..N3
ADR-0017 Aşama C ────────────────► NB8 platform alarm kanalı + tenant alarm kodları
NB4 + NB5 outbox + MOB-01 PWA ────► NB9 web push kanalı (MOB-04)
```

- **DB kapısı:** NB2, NB5 ve NB7 yeni ApplicationDB koleksiyonları ve indeksleri getirir.
  - Kod ve testler mongodb-memory-server ile yazılır (`test:integration:mocked`). Gerçek yerel veya Atlas DB'de ilk çalıştırma (autoIndex dahil) ancak `backup/` doğrulanmış yedek (CLAUDE.md kural 3) ve insan onayı (Protokol 12) ile yapılır.
  - O zamana kadar `NOTIFY_V2_ENABLED=false` olur: cephe eski yolu kullanır (legacy yazım), yeni koleksiyonlara dokunulmaz.
- **ADR-0024 çakışması:**
  - NB4 ve NB7 `api/services/**` altına dokunur, P2-MOVE donması sırasında başlatılmaz.
  - NB3'ün `integration-service.ts` kısmı P3-INT ile aynı dosyadadır, aynı dalga içinde sıralanır.
  - NB2 `operations/notifications/**` altında yeni dosyalar açar ve çakışmaz.
- **Paralellik:** NB3, NB4, NB5 ve NB6'nın dosya sahiplikleri ayrıktır (§3), NB2'den sonra paralel yürür.

## 2. Olay kataloğu — ilk sürüm (v1)

Kısaltmalar:
- Kanal: UI = uygulama içi, E = e-posta (`inst` anında, `dig` özet, `off` kapalı).
- Zor. = zorunlu (kapatılamaz).
- Sakl. = saklama: S 14 gün, St 30 gün, L 90 gün.
- İzin: ADR-0028 anahtarı. Parantez içi değer, ADR-0028 Aşama 1'den önceki kademe yedeğidir.
- Rota: FE eylem bağlantısı.
- Grup/tekil: dedupe anahtarı (D) ya da grup anahtarı ve penceresi (G).
- Kaynak: üretildiği yer. "yeni" etiketi, üreticinin bu planla yazılacağını gösterir.

### 2.1 Tenant kodları

| Kod | Kategori | Önem | Zor. | UI/E | İzin (yedek) | Rota | Grup/tekil | Sakl. | Kaynak |
|---|---|---|---|---|---|---|---|---|---|
| `ORDER_SYNC_WINDOW_OVERFLOW` | order | warning | – | UI / off | `orders:read` (member) | `/integrations/health?code={integ}` | G `integ:reason`, 1 sa | S | `OrderWorker.ts:421` (Map kalkar) |
| `ORDER_SYNC_FAILED` | order | error | – | UI / dig | `orders:read` (member) | `/integrations/health?code={integ}` | G `integ`, 1 sa; yalnızca son deneme başarısızsa | St | yeni (OrderErrorHandler son deneme) |
| `ORDER_SYNC_LAGGING` | order | warning/critical | – | UI / inst (kritikte) | `orders:read` (member) | `/integrations/health` | G `integ`, 4 sa | St | ADR-0017 R3 (NB8) |
| `STOCK_OVERSOLD` | stock | critical | ✓ | UI / inst | `stock:read` (member) | `/orders?allocation=OVERSOLD` | D `lineId`; G `integ`, 15 dk | L | `PostOrderOperations.ts:173` |
| `STOCK_UNMAPPED_LINE` | stock | warning | ✓ | UI / dig | `stock:read` (member) | `/orders?allocation=UNMAPPED` | D `lineId`; G `integ`, 1 sa | L | `PostOrderOperations.ts:138` |
| `STOCK_REALLOCATED` | stock | success | – | UI / off | `stock:read` (member) | `/orders/{orderId}` | D `lineId:realloc`; G 1 sa | S | `OversellCompensationJob.ts:156` |
| `STOCK_LINE_AUTO_CANCELLED` | stock | warning | – | UI / dig | `stock:read` (member) | `/orders/{orderId}` | D `lineId:cancel` | St | `OversellCompensationJob.ts:209` |
| `STOCK_COMPENSATION_MANUAL` | stock | error | ✓ | UI / inst | `stock:read` (member) | `/orders/{orderId}` | D `lineId:manual:{reason}` | L | `OversellCompensationJob.ts:194,227` (belirsiz iptal / yetersiz stok; `reason` parametresi) |
| `STOCK_OVERSOLD_UNRESOLVED` | stock | warning | ✓ | UI / dig | `stock:read` (member) | `/catalog/stock-health` | G tenant, 4 sa | L | ADR-0017 R8 (NB8) |
| `STOCK_LOW` | stock | warning | - | UI / dig | `stock:read` (member) | `/catalog/stock-health?low=1` | dedupe `<variantId>:<gün>` (günde 1/varyant) | S | Faz-3 (`StockPublishTrigger`, tenant `lowStockThreshold`; docs/API_STOCK_FEATURES.md) |
| `INTEGRATION_AUTH_FAILED` | integration | critical | ✓ | UI / inst | `integrations:read` (member) | `/integrations/marketplace?code={integ}` | G `integ`, 24 sa | L | ADR-0017 R2 (NB8) |
| `INTEGRATION_CIRCUIT_OPEN` | integration | warning | – | UI / off | `integrations:read` (member) | `/integrations/health?code={integ}` | G `integ`, 4 sa | St | ADR-0017 R2 (NB8) |
| `INTEGRATION_ERROR_RATE_HIGH` | integration | warning/critical | – | UI / dig | `integrations:read` (member) | `/integrations/health?code={integ}` | G `integ`, 4 sa | St | ADR-0017 R1 (NB8) |
| `INTEGRATION_CHANGE_NOTICE` | integration | info/warning | – | UI / dig | `integrations:manage` (admin) | `/integrations/health?code={integ}` | D `findingId` | L | ADR-0018 triage sonrası (NB8) |
| `CATALOG_BATCH_SUBMITTED` | catalog | success/warning | – | UI / off | `catalog:read` (member), actorOnly | `/logs?mode={mode}` | D `batchId` | S | `integration-service.ts:1343` |
| `CATALOG_BATCH_FAILED` | catalog | error | – | UI / off | `catalog:read` (member), actorOnly | `/logs?mode={mode}` | D `batchId` | St | `integration-service.ts:1359` (`errorCode` + `corrId`, ham ileti YOK) |
| `CATALOG_IMPORT_COMPLETED` | catalog | success | – | UI / off | `catalog:read` (member) | `/logs?mode=IMPORT&job={jobId}` | D `jobId` | S | `ImportOrchestrator.ts:110` |
| `CATALOG_IMPORT_FAILED` | catalog | error | – | UI / dig | `catalog:read` (member) | `/logs?mode=IMPORT&job={jobId}` | D `jobId` | St | `ImportOrchestrator.ts:110` |
| `CATALOG_EXPORT_ERRORS_DIGEST` | catalog | warning | – | UI / dig | `catalog:read` (member) | `/logs?mode=TRANSFER&status=FAILED` | G `integ`, 1 sa | St | yeni (Publisher/Sentinel son başarısızlık; F-07 hata kutusu ile) |
| `FINANCE_RECONCILIATION_MISMATCH` | finance | warning | – | UI / dig | `finance:read` (admin) | `/finance` | G tenant, 24 sa | L | yeni (ExternalReconciliation, planlı) |
| `BILLING_TRIAL_ENDING` | billing | warning | ✓ | UI / inst | `billing:read` (owner) | `/subscription` | D `trialEnd:T-3` | L | `TrialExpiryJob.ts:163` |
| `BILLING_TRIAL_ENDED` | billing | error | ✓ | UI / inst | `billing:read` (owner) | `/subscription` | D `trialEnd` | L | `TrialExpiryJob.ts:138` |
| `BILLING_SUSPENSION_WARNING` | billing | critical | ✓ | UI / inst | `billing:read` (owner) | `/subscription` | D `suspendAt:T-3` | L | yeni (ADR-0008 satır 71) |
| `BILLING_SUSPENDED` | billing | critical | ✓ | UI / inst | `billing:read` (owner) | `/subscription` | D `suspendAt` | L | yeni (ADR-0008) |
| `BILLING_PAYMENT_FAILED` | billing | error | ✓ | UI / inst | `billing:read` (owner) | `/subscription` | D `invoiceId:attempt` | L | yeni (ADR-0008 dunning, sağlayıcı webhook) |
| `SECURITY_PASSWORD_CHANGED` | security | warning | ✓ | UI / inst | kişisel (`recipients=[self]`) | `/account/security` | D `passwordChangedAt` | L | `AccountLifecycleService` (doğrudan e-posta buraya taşınır) |
| `SECURITY_SUPPORT_ACCESS_STARTED` | security | warning | ✓ | UI / off (insan kararı) | `users:read` (admin) | `/settings/audit-log?event=impersonation` | D `impSessionId` | L | ADR-0028 §9 / ADR-0026 redeemImpersonation |
| `SECURITY_MEMBER_ROLE_CHANGED` | security | info | ✓ | UI / inst (hedef kişiye) | `users:read` (admin) + hedef | `/settings/users` | D `auditId` | L | ADR-0028 (MembershipService) |
| `SECURITY_OWNERSHIP_TRANSFERRED` | security | warning | ✓ | UI / inst | `users:read` (admin) | `/settings/users` | D `transferId` | L | ADR-0028 §5 |
| `SYSTEM_ANNOUNCEMENT` | system | info/warning | – (`maintenance`/`incident` türü ✓) | UI / inst (duyurunun `email` kanalı açıksa; işi `opts.email` ile belirler, yalnız-uygulama-içi duyuruda e-posta üretilmez) | `app:use` (member) | `/notifications?announcement={id}` | D `announcementId` | St | NB7 duyuru işi |
| `LEGACY_BATCH_PROCESS` … `LEGACY_INFO` | (tür eşlemesi) | çağıran | – | UI / off | `app:use` (member) | çağıranın `actionUrl`'i | yok | St | `sendClientNotification` köprüsü (göç bitince kaldırılır) |

Rota notları:
- Rotalar `frontend/src/navigation/screens.ts` slug'larından alındı (`orders`, `logs`, `finance`, `subscription`, `integrations/*`, `catalog/stock-health`, `account/security`, `settings/audit-log`, `notifications`).
- `/settings/users` ekranı ADR-0028 FE işiyle gelir.
- Sorgu parametreleri (`allocation=`, `code=`, `job=`, `event=`) FE tarafında henüz karşılanmıyorsa ekran yalnızca açılır. Filtre desteği ilgili ekran brifine eklenir.
- NB1 kabul testi rota önekinin izinli listede olduğunu denetler.

### 2.2 Platform kodları (`surface:'platform'`, alıcılar `ALERT_EMAIL_TO` + backoffice)

| Kod | Önem | E | Kaynak |
|---|---|---|---|
| `PLATFORM_ALERT_FIRING` | kural önemi | kritik: inst, uyarı: saatlik dig | ADR-0017 AlertEvaluator (R1-R12) |
| `PLATFORM_ALERT_RESOLVED` | info | dig | ADR-0017 |
| `PLATFORM_ALERT_DIGEST` | warning | inst (fırtına koruması: > 5 yeni uyarı → tek ileti) | ADR-0017 |
| `PLATFORM_DELIVERY_DEAD_LETTERS` | warning | dig | NB5 (saatte ≥ 10 `dead` teslim) |
| `PLATFORM_COMPLIANCE_FINDING` | bulgunun önemi | dig | ADR-0018 `FindingService` (`noopRaiseAlert` yerine) |

### 2.3 Tercih matrisi varsayılanları (tenant varsayılanı yoksa)

| Kategori | UI | E-posta | Kapatılabilir mi |
|---|---|---|---|
| order | açık | özet | evet |
| stock | açık | anında (zorunlu kodlar) / özet | zorunlu kodlar hayır |
| integration | açık | özet (`AUTH_FAILED` anında) | `AUTH_FAILED` hayır |
| catalog | açık | kapalı | evet |
| finance | açık | özet | evet |
| billing | açık | anında | hayır |
| security | açık | anında | hayır |
| system | açık | kapalı | evet (bakım/olay duyurusu hariç) |

Özet zamanlaması varsayılanı günlük 09:00 (Europe/Istanbul). Kullanıcı saatlik seçebilir.

## 3. Backend iş paketleri (yerel)

Her paket kendi dalında yürür (`faz4-ntf-<n>`). Commit öneki `faz4-ntf-<n>:` olur. Dosyalar yol yol eklenir; `git add -A` kullanılmaz.

Test komutları `docs/TESTING.md`'den alınır:
- ara adım: `npm run test:related -- <dosyalar>`,
- iş bitimi: `npm run test:all && npm run typecheck && npm run lint && npm run ratchet`.

### NB1 — Katalog, tipler, şablonlar (saf kod, DB yok)
- **Dosyalar:**
  - `backend/src/operations/notifications/{catalog.ts, catalog.types.ts, defineNotification.ts}`
  - `operations/notifications/templates/{tr.ts, en.ts, layout.ts, render.ts}`
  - `backend/tests/unit/notifications/**`
  - `backend/tests/tools/run-tests.js` (yalnızca `notifications` modül satırı eklenir)
- **İş:**
  - §2 tablosu kod olarak yazılır.
  - Kayıt değişmezleri test edilir:
    - kod tekil,
    - kategori ve izin geçerli (ADR-0028 `permissions.ts` varsa ondan, yoksa geçici sabit liste),
    - `mandatory` yalnızca izinli kategorilerde,
    - her kod için TR ve EN başlık/gövde var,
    - `example` zod'dan geçer ve render edilir,
    - `action` çıktısı `internalActionPath` kuralına uyar,
    - `params` şemasında yasak alan adı yok (`name|surname|address|phone|email|message|error|token|password`),
    - şablon çıktısında sır deseni yok.
  - `getCatalogDto()` (FE ve backoffice için) üretilir. `notification-catalog-baseline.json` mandalı eklenir: kod silme ya da yeniden adlandırma testte kırılır, alias zorunludur.
- **Test:** `npm run test:module -- notifications`, `npm run typecheck`.

### NB2 — Çekirdek `notify`, defter, uygulama içi yazım, alıcı ve tercih çözümü
- **Dosyalar:**
  - `operations/notifications/{notify.ts, ledger.ts, audience.ts, preferences.ts, inAppRepository.ts, legacy.ts}`
  - `database/application/models/{NotificationEvent,NotificationDelivery,NotificationPreference}.ts` + ApplicationDB şema kaydı (`ApplicationMongooseSchemas.ts`/`ApplicationDB.ts` yalnızca ekleme)
  - `database/client/models/Notification.ts` (yalnızca alan ekleme + `critical`)
  - `services/notification/NotificationService.ts` (cephe: `notify`, `sendClientNotification` → sink)
  - `services/notification/NotificationEventBus.ts` (dokunulmaz ya da yorum)
  - `bootstrap/app.ts` (sink enjeksiyonu, tek satır)
  - `interfaces/common/index.ts` (tipler, `UI_NOTIFY` kaldırılır)
  - `backend/tests/{unit,mongo-semantics}/notifications/**`
- **İş:** ADR-0029 Karar 2, 3, 5 ve 9.
  - Bayrak `NOTIFY_V2_ENABLED` (config zod, varsayılan `false`). `false` iken cephe bugünkü yazımı yapar (characterization testleri aynen yeşil).
  - Eski belge görünürlüğü `$or` ile sağlanır.
- **Kabul:**
  - idempotency: aynı `idemKey` iki kez gelirse tek belge oluşur, sayaç 2 olur,
  - grup penceresi: 23 olay tek belge ve `count=23` üretir,
  - kısma kovası süreç yeniden başlasa da korunur,
  - alıcı çözümü rol matrisine uyar: `finance:read` olmayan kullanıcı finans bildirimini almaz,
  - `userId`'siz depo çağrısı derleme hatası verir,
  - `notify` hiçbir durumda fırlatmaz,
  - `NotificationService.characterization` testleri bayrak kapalıyken değişmeden yeşil kalır.
- **Test:** `npm run test:module -- notifications`, `npm run test:integration:mocked`, `npm run test:related -- src/services/notification/NotificationService.ts`.

### NB3 — Çağıranların göçü
- **Dosyalar:**
  - `api/services/integration-service.ts` (yalnızca 1340-1372 aralığı)
  - `integration/engine/catalog/import/ImportOrchestrator.ts` (yalnızca `sendNotification`)
  - `integration/engine/order/OrderWorker.ts` (yalnızca `notifyWindowOverflow` + `overflowNotifiedAt` kaldırma)
  - `operations/billing/TrialExpiryJob.ts` (`notify`)
  - `operations/integration/PostOrderOperations.ts` (`notify`)
  - `operations/stock/OversellCompensationJob.ts` (`notify`)
  - `operations/account/AccountLifecycleService.ts` (parola değişti)
  - `operations/client/ClientOperations.ts` (`saveNotification` silinir)
  - ilgili characterization testleri
- **İş:**
  - Her çağıran katalog koduyla `notify` çağırır.
  - Ham `error.message` kaldırılır (N-05), yerine hata kodu ve `corrId` gelir.
  - `as any` kaldırılır.
  - `OrderWorker`'ın `OVERFLOW_NOTIFY_INTERVAL_MS` davranışı katalog grubunda aynen korunur. Characterization testi "saatte en fazla 1 bildirim" beklentisini sürdürür, yalnızca mekanizma değişir.
- **Test:**
  - `npm run test:integration-engine`
  - `npm run test:module -- stock`
  - `npm run test:module -- billing`
  - `npm run test:api`
  - `npm run test:module -- orders`

### NB4 — Tenant API
- **Dosyalar:**
  - `api/services/notification-service.ts`
  - `capabilities/domains/account.ts` (bildirim yetenekleri)
  - `capabilities/rpc-input/*` (NotificationService şemaları)
  - `capabilities/rpc-input-baseline.json`
  - `tests/characterization/notification/**`
  - `tests/characterization/auth/*` (anlık görüntü güncellemesi)
- **İş:**
  - `get`: `{cursor?, limit?, category?, onlyUnread?, archived?, afterId?}` alır, yanıta `nextCursor` ekler. Sorgular kullanıcı kapsamlıdır.
  - `markAsRead`, `delete`, yeni `archive`/`unarchive`: kişisel. `all:true` yalnızca kendi kayıtlarına uygulanır.
  - Geçersiz ObjectId `400` döner (N-12).
  - `getUnreadCount`: kişisel, isteğe bağlı `byCategory`.
  - Yeni RPC'ler: `getCatalog`, `getPreferences`, `updatePreferences` (kendi), `getTenantDefaults`, `updateTenantDefaults` (`settings:manage` / admin).
  - Impersonation salt okunur kuralı (`403 IMPERSONATION_READ_ONLY`).
  - Yetenek kaydı: yeni satırlar `scope:'user'`, `self:manage`. MCP kararları: `notifications.list` `deferred` kalır; tercihler `PLUMBING`; katalog `PLUMBING`.
- **Test:**
  - `npm run test:api`
  - `npm run test:module -- auth` (operation-policy / capability-parity anlık görüntüsü)
  - `npm run test:contract`

### NB5 — E-posta kanalı, outbox, özet, abonelikten çıkma
- **Dosyalar:**
  - `operations/notifications/channels/{ChannelAdapter.ts, emailChannel.ts}`
  - `operations/notifications/jobs/{emailDispatchJob.ts, digestJob.ts}`
  - `operations/notifications/unsubscribe.ts`
  - `api/http/notificationUnsubscribe.ts`
  - `bootstrap/{schedules.ts, http.ts}` (yalnızca kayıt satırları)
  - `services/mail/MailService.ts`
  - `config/*` (`NOTIFY_EMAIL_ENABLED`, `NOTIFY_UNSUB_SECRET`, `.env.example`)
  - `tests/unit/notifications/email/**`
- **İş:**
  - ADR-0029 Karar 4.
  - `MailService.sendMessage` headers alır, `messageId` döner, hatayı `transient`/`permanent` olarak sınıflar ve logda alıcıyı maskeler (N-14).
  - `send()` imzası geriye uyumlu kalır.
- **Kabul:**
  - sahte saatle yeniden deneme takvimi (1 dk → 6 sa) ve 5 denemeden sonra `dead`,
  - kalıcı hatada doğrudan `dead`,
  - lease: iki eşzamanlı gönderici aynı kaydı göndermez,
  - özet: 30 teslim tek iletide toplanır,
  - sessiz saat ertelemesi,
  - `List-Unsubscribe` ve `List-Unsubscribe-Post` başlıkları,
  - belirteç imzası, süre ve kurcalama testi,
  - zorunlu kategoride abonelikten çıkma reddedilir,
  - `NOTIFY_EMAIL_ENABLED=false` iken `skipped:disabled`, gönderim yok.
- **Test:** `npm run test:module -- notifications`, `npm run test:integration:mocked`, `npm run test:api`.

### NB6 — Gerçek zamanlı (SSE zili)
- **Dosyalar:**
  - `platform/runtime/realtime/{RealtimeBus.ts, localBus.ts, redisBus.ts, index.ts}`
  - `api/http/notificationStream.ts`
  - `bootstrap/http.ts` (rota ve sıkıştırma istisnası, yalnızca ekleme)
  - `capabilities/domains/account.ts` (`notifications.stream`; NB4 ile aynı dosya olduğu için NB4'ten sonra ya da NB4 içinde tek satır olarak eklenir)
  - `tests/unit/realtime/**`, `tests/characterization/notification/stream.*`
- **İş:** ADR-0029 Karar 6.
- **Kabul:**
  - başlıklar doğru,
  - 25 sn ping (sahte saat),
  - 30 dk kapanış,
  - `Last-Event-ID` → `sync`,
  - **A tenant'ının olayı B bağlantısına yazılmaz; aynı tenant'ta başka kullanıcıya ait olay yazılmaz**,
  - bağlantı sınırında 503,
  - kimliksiz ya da yanlış Origin'de 401/403,
  - Redis adaptörü sahte ioredis ile publish/subscribe,
  - Redis yokken publish fırlatmaz,
  - kapanışta (`shutdown.ts`) açık akışlar kapanır.
- **Test:** `npm run test:api`, `npm run test:module -- platform`, `npm run test:related -- src/api/http/notificationStream.ts`.

### NB7 — Duyurular ve backoffice uçları (ADR-0026 Aşama 2-BE sonrası)
> **Durum: YAPILDI (2026-10-01, `faz4-notify-nb7`; bayrak arkasında, göç `0017` çalıştırılmadı).** Sözleşme: `docs/API_BACKOFFICE_NOTIFICATIONS.md`. Dosya yerleşimi plandan küçük sapma: mantık `operations/notifications/{announcements,announcementAdmin,backofficeOps}.ts`, yetenek/şema `capabilities/{domains,rpc-input}/backoffice-notifications.ts`; iş `bootstrap/schedules.ts` (`notifications.announcements`). Yazan uçların hepsi step-up + gerekçe; e-posta kanalı ayrıca "hizmet duyurusu" onayı (S5).
- **Dosyalar:**
  - `database/application/models/Announcement.ts`
  - `operations/notifications/{announcements.ts, jobs/announcementJob.ts}`
  - `api/services/{announcement-service.ts, backoffice-notification-service.ts}`
  - `api/index.ts` (kayıt satırları)
  - `capabilities/domains/platform.ts` (backoffice yetenekleri, `surface:'backoffice'`)
  - `capabilities/rpc-input/*`
  - `tests/characterization/notification/backoffice.*`
- **İş:** ADR-0029 Karar 7.
  - Hedef çözümü: `all` / `plans` (ADR-0008 `Subscriptions.planCode`) / `tids`.
  - Tenant geçmişi yalnızca meta veri döner.
  - `retryDelivery`/`discardDelivery` audit'e yazılır.
  - Toplu e-posta step-up ister.
- **Test:** `npm run test:api`, `npm run test:module -- billing` (plan hedefi), `npm run test:module -- auth`.

### NB8 — Platform alarm kanalı ve tenant alarm kodları (ADR-0017 Aşama C içinde)
> **Durum: KISMEN YAPILDI (2026-10-01, `faz4-notify-nb7`):** `platformNotify` + `ALERT_EMAIL_TO` e-posta alıcısı (NB5 outbox'ı, adres saklanmaz) + alarm değerlendiricisi (`operations/alerts/*`: R1 hata oranı, R2 AUTH/devre, R4 kuyruk, R7 olu teslim; cooldown, histerezis, susturma, bakım, gölge mod `ALERT_SHADOW_UNTIL`, fırtına→özet) + `Alerts` paneli uçları (`listAlerts`/`muteAlert`) + tenant kodları `INTEGRATION_ERROR_RATE_HIGH` / `INTEGRATION_AUTH_FAILED`; R12: `FindingService.setAlertHook` -> `platformNotify('PLATFORM_COMPLIANCE_FINDING')` (`noopRaiseAlert` kalktı). **Açık:** R3/R8 tenant kodları (`ORDER_SYNC_LAGGING`, `STOCK_OVERSOLD_UNRESOLVED`, `INTEGRATION_CIRCUIT_OPEN` tenant kapsamı), R5/R6/R9-R11 kural kaynakları, `INTEGRATION_CHANGE_NOTICE` (triage sonrası tenant bildirimi). Eşikler kodda sabit (env ile ezme yok).
> **Güncelleme (2026-10-01, bulut `cloud/be-p4`):** R2 tenant devresi (`INTEGRATION_CIRCUIT_OPEN`; `IntegrationCallMetrics.circuitState`, pencerede `open` var ve `closed` yok), R3 (`ORDER_SYNC_LAGGING`; `Clients.integrations[].lastSuccessfulOrderSync`, kill-switch ve abonelik kapısı kapalı entegrasyonlar hariç), R8 (`STOCK_OVERSOLD_UNRESOLVED`; escalated ve hâlâ OVERSOLD satır, tenant taraması 10 dk önbellekli) ve `INTEGRATION_CHANGE_NOTICE` (`FindingService` `accept` + severity ≥ high → etkilenen tenant'lar; ADR-0018) eklendi. Eşikler artık `_platform` ayarı: `alerts.*` (11 anahtar, yöneticiye özel; katalog `integration/config/catalog/alerts.ts`), değerlendirici her turda okur. **Hâlâ açık:** R5/R6/R9-R11 kural kaynakları; backoffice ayar panelinde `platform.alerts` grubu (FE). Ayrıntı: `backend/docs/P4_REPORT.md`.
- **Dosyalar:**
  - `operations/notifications/platformNotify.ts`
  - ADR-0017 `AlertChannel` e-posta adaptörü (NB5 outbox'ını kullanır)
  - `integration/compliance/FindingService.ts` (`noopRaiseAlert` → `platformNotify`)
  - R1/R2/R3/R8 → tenant kodları (§2.1)
- **Kabul:**
  - 14 günlük gölge modda (ADR-0017) tenant bildirimi de üretilmez, yalnızca defter yazılır (`suppressed:shadow`),
  - fırtına testi: 100 uyarı → 1 özet.
- **Test:** ADR-0017 Aşama C test seti + `npm run test:module -- compliance`.

### NB9 — Web push kanalı (MOB-04; ADR-0029 Karar 4 "İleride: web push")
> **Durum: YAPILDI (2026-10-01, bulut `cloud/mob-push`; kanal env ile kapalı, göç `0020` ÇALIŞTIRILMADI).** Gerçek cihaz doğrulaması yerelde.

**Kanal kuralları**
- Push, uygulama içi + e-postanın **tamamlayıcısıdır**; cihaz aboneliği olmadan hiçbir şey gitmez. Tercih matrisinde yeni sütun `push: boolean` (kategori hücresi: `{inApp?, email?, push?}`).
- Varsayılan: zorunlu ya da kritik olabilen kodlar **açık** (`STOCK_OVERSOLD`, `INTEGRATION_AUTH_FAILED`, `security`/`billing` zorunluları…), diğerleri **kapalı**. Çözüm sırası e-postayla aynı: kullanıcı → tenant varsayılanı → katalog. Zorunlu kategoride de push kapatılabilir (kilit yalnız uygulama içi/e-posta için).
- **İçerik (hassas veri YOK):** başlık = katalog şablonunun sabit başlığı (yer tutucu içeriyorsa kategori etiketi), metin = sabit "Ayrıntılar için Entegrasyonik'i açın.", `url` = katalog `action` yolu (yalnız uygulama içi göreli yol), `tag = ntf:<eventId>`. `params` (sipariş no, SKU, entegrasyon adı…) kilit ekranına **asla** girmez; test tüm katalog için denetler. Yük RFC 8291 ile uçtan uca şifrelidir (push servisi okuyamaz).
- Destek oturumu (impersonation) aktörü push alamaz; destek oturumu abonelik yazamaz/silemez (403).

**Backend**
- `ApplicationDB.PushSubscriptions` (yeni): `{tid, userId, endpointHash (sha256), sub (enc:v1: {endpoint, keys}), deviceLabel?, createdAt, lastSuccessAt?}`; indeksler `uniq_endpointHash`, `tid_1_userId_1_createdAt_-1` → `migrations/0020-push-subscriptions-app.js` (**ÇALIŞTIRILMADI**; kanal açılmadan önce `done` olmalı). Kullanıcı başına ≤10 cihaz (en eskiler düşer). Aynı tarayıcıda başka kullanıcı abone olursa kayıt ona geçer.
- RPC (`NotificationService`, `self:manage`, kullanıcı kapsamlı, yetenek `notifications.push.{config,subscribe,unsubscribe}`, MCP'ye kapalı): `getPushConfig {}` → `{enabled, publicKey, devices[{id, deviceLabel, createdAt, lastSuccessAt}]}`; `subscribePush {subscription:{endpoint, expirationTime?, keys:{p256dh, auth}}, deviceLabel?}` (kanal kapalı → 409 `PUSH_DISABLED`, izinsiz uç → 400 `PUSH_ENDPOINT_NOT_ALLOWED`, bozuk anahtar → 400 `PUSH_KEYS_INVALID`); `unsubscribePush {endpoint} | {id}` (idempotent; kanal kapalıyken de çalışır).
- **SSRF koruması:** uç yalnız `https` + izinli push servisleri (`operations/notifications/push/pushHosts.ts`: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`); kimlik bilgisi/port yok.
- Üretim: `notify` 7b adımı — push açıksa aday alıcılardan cihazı olan ve tercihi açık olanlar için outbox'a `channel:'push', mode:'instant'` kaydı (`NotificationDeliveries`; özet yok). Gönderici `notifications.push-dispatch` (worker, 10 sn; `PushDispatcher`): e-postayla aynı kira/fencing/yeniden deneme (1 dk → 5 dk → 30 dk → 2 sa → 12 sa), kullanıcının tüm cihazlarına; **404/410 → abonelik silinir**; 429/5xx/ağ → yeniden dene; diğer 4xx → `dead`; tercih kapalı → `skipped:opt_out`; cihaz yok → `skipped:no_subscription`; 24 saatten eski → `skipped:stale`; sessiz saatlerde zorunlu olmayan ertelenir. TTL 12 sa; kritik/hata → `Urgency: high`.
- Taşıyıcı: `web-push` 3.6.7 (MPL-2.0 — dosya düzeyinde zayıf copyleft, değiştirilmeden kullanılır; `npm audit` 0). Backoffice teslim günlüğü `channel: 'push'` süzgecini kabul eder.
- Bayraklar: kanal = `NOTIFY_V2_ENABLED` **ve** geçerli `WEBPUSH_VAPID_PUBLIC/PRIVATE/SUBJECT`. Biri eksik/bozuksa kanal kapalı, süreç başlar (bir kez uyarı logu, değer loglanmaz).
- Testler: `tests/unit/notifications/webPush.test.ts` (VAPID, SSRF, içerik, tercih, abonelik deposu, gönderici, notify, web-push kripto gidiş-dönüş), `webPushRpc.test.ts` (RPC, impersonation, kapsam, RBAC), `tests/dev/egress-guard.test.ts`.

**Frontend**: bkz. `frontend/docs/MOB_PUSH.md` (tercih matrisinde "Telefon/tarayıcı" sütunu, izin isteme yalnız kullanıcı eylemiyle, iOS 16.4+ yalnız ana ekrana eklenmiş PWA, service worker `push` + `notificationclick`, Electron'da gizli).

**Yerel kurulum (VAPID üretimi ve gerçek cihazla deneme)**
1. Anahtar çifti üret (bir kez; ortam başına ayrı): `cd backend && npx web-push generate-vapid-keys` → çıktıdaki *Public Key* ve *Private Key*'i `backend/.env`'e yaz: `WEBPUSH_VAPID_PUBLIC=…`, `WEBPUSH_VAPID_PRIVATE=…` (SIR; yalnız `.env`), `WEBPUSH_VAPID_SUBJECT=mailto:<operasyon adresi>`. Anahtarı değiştirmek tüm abonelikleri geçersiz kılar (cihazlar yeniden abone olur; eski kayıtlar ilk gönderimde 404/410 ile temizlenir).
2. Yedek doğrulandıktan sonra göç: `node dev-tools/migrate.js` ile `0020-push-subscriptions-app` (önce `plan`, sonra `up`; CLAUDE.md kural 3).
3. `NOTIFY_V2_ENABLED=true`; backend'i `EGRESS_ALLOW_WEBPUSH=1 npm run start:local` ile çalıştır (egress guard yalnız bu bayrakla push servislerine izin verir; LLM/pazaryeri açılmaz).
4. Push yalnız güvenli bağlamda çalışır: `localhost` ya da HTTPS. Telefonla denemek için HTTPS tünel/staging gerekir; iOS'ta önce Safari → Paylaş → "Ana Ekrana Ekle", sonra uygulamayı ana ekrandan açıp Ayarlar > Bildirimler'den aç.

**MOB-06 backoffice push (2026-10-01, bulut `cloud/mob-android`)**
- Platform yöneticisi aboneliği: `BackofficePrefsService/{getPushConfig,subscribePush,unsubscribePush}` (sözleşme `docs/API_BACKOFFICE_ATTENTION.md` BE-07). Aynı `PushSubscriptions`, `tid = 0` + `userId = Users._id`; aynı SSRF/şifreleme/cihaz sınırı.
- Kaynak: outbox DEĞİL — `notifications.platform-attention-push` (worker, 2 dk; `operations/notifications/push/platformAttentionPush.ts`, üretim bağlantısı `api/admin/createAttentionPusher.ts`) her turda abone yönetici varsa `getAttention` (K51 kaynakları) hesaplar, yalnız **kritik** maddeleri gönderir. Kanal kapalı → DB'ye dokunmaz; abone yok → dikkat hesaplanmaz.
- Tekrar: yeni kritik madde ya da 6 sa'tir süren madde; çözülüp yeniden kritikleşen madde tekrar bildirilir. Durum süreç belleğinde (birden çok worker podunda aynı bildirim çoğalabilir; cihazda `tag:'bo-attention'` öncekinin yerine geçer). Yalnız geçici hatalarla iletilemezse durum yazılmaz (sonraki tur).
- Alıcı: gönderim anında `Users.isGlobalAdmin===true` ve `isActive!==false`; değilse abonelik silinir. 404/410 → silinir. `Urgency: high`, TTL 12 sa.
- Önyüz: `frontend/backoffice/src/pwa/{webPush.ts,PushCard.vue}` (Platform uyarıları ekranında kart; izin yalnız "Bu cihazda aç" ile), SW `push`/`notificationclick` (yalnız panel içi göreli yol). Testler: backend `tests/unit/notifications/platformAttentionPush.test.ts`; backoffice `tests/web-push.test.ts`, `tests/pwa-sw-push.test.ts`.

**MOB-07 Android kabuğu yerel push (FCM HTTP v1; 2026-10-01, bulut `cloud/mob-android`)**
- Android WebView'de Web Push API yok → kabukta bildirim FCM cihaz belirteciyle. Aynı kanal: aynı `PushSubscriptions` (`sub` = şifreli `{fcm}`, tekillik `sha256('fcm:'+token)`), aynı outbox/dağıtıcılar (tenant `notifications.push-dispatch`, backoffice `notifications.platform-attention-push`), aynı içerik kuralları. Gönderici hedef türüne göre yönlendirir (`createPushDispatcher.ts` → `fcm.ts`).
- RPC: `subscribePush { subscription } | { fcmToken }` ve `unsubscribePush { endpoint } | { id } | { fcmToken }` (tenant + backoffice; yalnız biri, aksi 400 `VALIDATION`; kanal türü kapalı → 409 `PUSH_DISABLED`; bozuk belirteç 400 `PUSH_TOKEN_INVALID`). `getPushConfig` yanıtına `fcm: boolean`; `enabled` = VAPID **ya da** FCM açık, `publicKey` yalnız VAPID açıkken.
- Yapılandırma: `FCM_SERVICE_ACCOUNT_JSON` (Firebase hizmet hesabı JSON'u, ham ya da base64; SIR, yalnız `.env`). Yoksa/bozuksa FCM kapalı, süreç başlar. OAuth2 erişim belirteci (JWT-bearer, RS256) bellekte; 401 → yenilenir. FCM 404 (UNREGISTERED) → abonelik silinir; 400 → `dead`; 429/5xx → yeniden dene. Egress guard: `EGRESS_ALLOW_WEBPUSH=1` `oauth2.googleapis.com`'u da açar. Yeni bağımlılık yok (`jsonwebtoken` + `fetch`).
- İstemci: `@entegrasyonik/ui/native` (kabuk tespiti, `registerNativePush`, bildirime dokunma → uygulama içi yol). Derleme/kurulum: `docs/MOBILE_ANDROID_BUILD.md`. Testler: `tests/unit/notifications/fcmPush.test.ts`.

## 4. Bulut görev brifleri — müşteri uygulaması (yapıştırmaya hazır)

Ortak ek (her brifin sonuna):
- `docs/CLOUD_BRIEFS.md` "Token tasarrufu" kuralları geçerlidir.
- Dal `cloud/<kısa-ad>` (main'den açılır). Küçük adımlarla commit + push yapılır.
- `*-linux.png` commit'lenmez.
- Yalnızca "Dosya sahipliği" satırındaki yollar değişir.
- Backend dosyaları SALT OKUNURDUR.

Ortak doğrulama: `cd frontend && npx vitest run && npm run typecheck && npm run test:typecheck-ratchet && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run build`

### Brif F-N1 — Bildirim merkezi v2 (`cloud/ntf-center-2`) — NB1 + NB4 birleştikten sonra
```
Görev: Bildirim merkezi ve çekmeceyi ADR-0029 sözleşmesine geçir. DS-v2 kuralları (frontend/DESIGN_SYSTEM.md) geçerli.
Önce oku: CLAUDE.md (kural 7), docs/adr/0029-bildirim-sistemi.md (Karar 1, 3, 5, 8), docs/NOTIFICATION_PLAN.md §2, backend/src/api/services/notification-service.ts ve backend/src/operations/notifications/catalog.ts (SALT OKU; alan uydurma).
Yap:
- types/NotificationTypes.ts: sabit tür enum'unu kaldır; kategori/kod/zorunluluk bilgisini NotificationService/getCatalog'dan okuyan küçük bir store (stores/notificationCatalog.ts, oturum başına bir kez). Eski `type` alanı yalnızca yedek ikon için kalsın. internalActionPath AYNEN kalsın.
- Render: başlık/gövde = i18n `notifications.events.<code>.title/body` (params ile); anahtar yoksa sunucunun title/message alanı. tr+en locale dosyalarına katalogdaki tüm kodlar (vitest: katalog kod listesi = locale anahtar listesi; katalog listesini backend dosyasından değil getCatalog mock fixture'ından al).
- Grup: count > 1 ise "×{count}" rozeti + "son: {lastOccurredAt göreli}".
- Önem: `critical` yeni ton (danger + vurgu); `danger` → error eşlemesi kalsın.
- Merkez: sunucu sayfalaması (cursor/nextCursor, EkPagerBar "daha fazla"), kategori filtresi (getCatalog kategorileri), "Arşiv" sekmesi (archive/unarchive), zorunlu kategori satırlarında kilit ikonu (a11y etiketi "Zorunlu bildirim").
- Sayfa açıklamasındaki "3 gün sonra silinir" metnini kaldır; yerine "Bildirimler öneme göre 14–90 gün saklanır".
- Impersonation oturumunda (context store `impersonation` alanı) okundu/arşiv/sil düğmeleri gizli + açıklama "Destek görünümü: salt okunur".
- İstek gövdeleri stores/notificationDrawer.ts'te tek kaynak kalsın.
Dosya sahipliği: frontend/src/types/NotificationTypes.ts, frontend/src/stores/{notificationDrawer,notificationCatalog}.ts, frontend/src/views/secure/NotificationCenterView.vue, frontend/src/components/user/NotificationDrawerComponent.vue, frontend/src/locales/**/notifications*, frontend/e2e/specs/notifications.spec.ts, frontend/tests/notification*.test.ts.
Test: notifications.spec.ts (liste, cursor ile ikinci sayfa, kategori filtresi, arşiv, grup rozeti, zorunlu kilidi, impersonation salt okunur, hata ≠ boş, axe=0, 3 viewport).
Doğrulama: (ortak) + npx playwright test notifications.spec.ts --project=chromium-desktop --update-snapshots=missing; sonda 3 viewport.
Commit: cloud-ntf-center-2: ...
```

### Brif F-N2 — Bildirim tercihleri + abonelikten çıkma sayfası (`cloud/ntf-prefs`) — NB4 + NB5
```
Görev: Ayarlar > Bildirimler ekranı (kategori × kanal matrisi) ve herkese açık /unsubscribe sayfası (ADR-0029 Karar 4-5; PRODUCT_VALUE_PLAN F-06 v2 / B-07).
Önce oku: docs/adr/0029-bildirim-sistemi.md Karar 4-5, docs/NOTIFICATION_PLAN.md §2.3, backend/src/api/services/notification-service.ts (getPreferences/updatePreferences/getTenantDefaults/updateTenantDefaults/getCatalog — SALT OKU).
Yap:
- NotificationPreferencesView (screens.ts: section 'settings'): satırlar = kategoriler (getCatalog), sütunlar = Uygulama içi (anahtar) ve E-posta (Kapalı/Anında/Özet). Zorunlu hücreler kilitli + açıklama. Özet zamanı (günlük saat/saatlik), dil (tr/en), isteğe bağlı sessiz saatler. Kaydet → updatePreferences; kirli durum uyarısı.
- "Mağaza varsayılanları" sekmesi yalnızca settings:manage izni (ADR-0028 permissions) ya da eski owner/admin kademesi varsa; aynı matris → updateTenantDefaults.
- /unsubscribe?t=… (public route, oturum gerekmez): belirteç ile POST (uç: backend api/http/notificationUnsubscribe.ts sözleşmesi), sonuç: "{kategori} e-postaları kapatıldı" + "Tercihleri yönet" bağlantısı; geçersiz/süresi dolmuş/zorunlu kategori durumları.
- Impersonation: salt okunur.
Dosya sahipliği: frontend/src/views/secure/settings/NotificationPreferencesView.vue, frontend/src/views/public/UnsubscribeView.vue, frontend/src/stores/notificationPreferences.ts, frontend/src/router/** (yalnızca iki rota ekleme), frontend/src/navigation/screens.ts (yalnızca ekleme), frontend/src/locales/**/notificationPreferences*, frontend/e2e/specs/notification-preferences.spec.ts.
Test: matris render, zorunlu kilidi, kaydet gövdesi, tenant varsayılanları izin kapısı, unsubscribe 4 durum, axe=0, 3 viewport.
Doğrulama: (ortak) + npx playwright test notification-preferences.spec.ts --project=chromium-desktop --update-snapshots=missing.
Commit: cloud-ntf-prefs: ...
```

### Brif F-N3 — Gerçek zamanlı zil istemcisi (`cloud/ntf-stream`) — NB6
```
Görev: SSE zili istemcisi (ADR-0029 Karar 6). Backend api/http/notificationStream.ts SALT OKU.
Yap:
- composables/useNotificationStream.ts: EventSource('/api/notifications/stream', {withCredentials:true}) (base URL restapi.ts ile aynı kaynaktan); olaylar: notification → unreadCount güncelle + çekmece/merkez açıksa NotificationService/get {afterId} ile yalnız yenileri başa ekle; announcement → duyuru store'unu tazele; sync → tam tazele.
- Yeniden bağlanma: tarayıcı yerleşik retry + kendi üstel geri çekilmesi (5 sn→60 sn, 503'te 60 sn); 30 dk sunucu kapanışı normaldir (hata sayılmaz).
- Yedek: bağlıyken notificationDrawer rozet yoklaması 5 dk; bağlı değilken bugünkü 30 sn (UNREAD_POLL_MS). Sekme 60 sn gizliyse bağlantıyı kapat, görünür olunca aç.
- Kritik (severity critical) yeni bildirimde useToast ile tost (aria-live assertive yalnızca critical; diğerleri polite, tost yok).
- Çıkışta (resetRegistry) bağlantı kapanır; Electron'da aynı kod.
- EventSource yoksa (eski ortam) yalnızca polling.
Dosya sahipliği: frontend/src/composables/useNotificationStream.ts, frontend/src/stores/notificationDrawer.ts (yalnızca yoklama aralığı anahtarlama), frontend/src/layouts/SecureLayout.vue (yalnızca başlatma satırı), frontend/tests/notification-stream.test.ts, frontend/e2e/specs/notifications-stream.spec.ts.
Test: vitest sahte EventSource (olay → sayaç, afterId isteği, geri çekilme, gizli sekme kapatma, çıkışta kapanma); Playwright route ile text/event-stream taklidi → rozet anında artar.
Doğrulama: (ortak) + npx playwright test notifications-stream.spec.ts --project=chromium-desktop --update-snapshots=missing.
Commit: cloud-ntf-stream: ...
```

### Brif F-N4 — Duyuru bandı (`cloud/ntf-announce`) — NB7
```
Görev: Uygulama kabuğunda duyuru bandı (ADR-0029 Karar 7). Backend AnnouncementService/getActive SALT OKU.
Yap:
- stores/announcements.ts: girişte + 5 dk'da bir + SSE announcement olayında getActive; kapatılanlar localStorage `ek.ann.dismissed.<uid>` (duyuru id listesi).
- EkAppHeader altında band: kind maintenance/incident → kapatılamaz, danger/warning ton; info/release → kapatılabilir. Birden çok duyuru: en yüksek önem üstte, "+N duyuru" açılır liste. Dil: title/body[locale] yoksa tr.
- Bakım modu 503 (ADR-0026 B11) yanıtında restapi'nin döndürdüğü bakım iletisini aynı bandda göster.
- a11y: role="region" aria-label="Duyurular"; kapatma düğmesi etiketli; hareket azaltma.
Dosya sahipliği: frontend/src/stores/announcements.ts, frontend/src/components/layout/AnnouncementBanner.vue, frontend/src/layouts/SecureLayout.vue (yalnızca bileşen yerleşimi), frontend/e2e/specs/announcements.spec.ts.
Test: kapatılabilir/kapatılamaz, çoklu duyuru, dil yedeği, bakım 503, axe=0, 3 viewport.
Doğrulama: (ortak) + npx playwright test announcements.spec.ts --project=chromium-desktop --update-snapshots=missing.
Commit: cloud-ntf-announce: ...
```

## 5. Bulut görev brifleri — backoffice (ADR-0026 Aşama 2-FE iskeleti hazır olduktan sonra)

Şablon: `docs/BACKOFFICE_PLAN.md` §5 "B-4.x". Doğrulama da aynıdır: `cd frontend && npm run typecheck -w @entegrasyonik/backoffice && npm run test -w @entegrasyonik/backoffice && npx playwright test -c backoffice/playwright.config.ts e2e/specs/<spec> --update-snapshots=missing`.

### Brif BO-N1 — Duyurular (`cloud/bo-ntf-announce`)
```
Görev: backoffice "Bildirimler ve duyurular > Duyurular" (ADR-0029 Karar 7). Backend BackofficeNotificationService (duyuru uçları) SALT OKU; alan uydurma.
Yap: liste (durum/tür/tarih filtresi, EkListScreen), oluştur/düzenle (EkDetailSheet: tür, önem, TR zorunlu / EN isteğe bağlı başlık-gövde, hedef: tümü / plan seçimi / tenant listesi arama, kitle: tüm üyeler / sahip-yönetici, kanallar: bant / uygulama içi / e-posta, başlangıç-bitiş, kapatılabilir), önizleme (bant + bildirim + e-posta sekmeleri, preview ucu), zamanla/iptal. E-posta kanalı açıkken kaydet → step-up diyaloğu + gerekçe (≥10 karakter) + "Yalnızca hizmet duyurusu, pazarlama içeriği yasak" onay kutusu.
Dosya sahipliği: frontend/backoffice/src/views/notifications/announcements/**, backoffice/src/navigation/screens.ts (yalnızca ekleme), backoffice/e2e/specs/notifications-announcements.spec.ts.
```

### Brif BO-N2 — Teslim günlüğü + olay kataloğu ve şablon önizleme (`cloud/bo-ntf-ops`)
```
Görev: backoffice "Teslim günlüğü" ve "Olay kataloğu" ekranları (ADR-0029 Karar 7). Backend getDeliveryStats/listDeliveries/retryDelivery/discardDelivery/getCatalog/previewTemplate/sendTestEmail SALT OKU.
Yap: Teslim günlüğü — metrik kartları (24 sa/7 gün: gönderildi, bekleyen, başarısız, ölü; en eski bekleyen yaşı), liste (durum/kanal/tenant/kod filtresi, imleç), satır: kod, tenant no, kanal, durum, deneme, son hata kodu, zamanlar (e-posta adresi YOK); yeniden dene / at → gerekçe diyaloğu. Olay kataloğu — kod/kategori/önem/zorunlu/varsayılan kanal/izin tablosu; satır → önizleme (dil tr/en × kanal uygulama içi/e-posta; örnek parametreler düzenlenebilir JSON; yalnızca render, gönderim yok). "Test e-postası gönder" (kendi adresime) → step-up.
Dosya sahipliği: frontend/backoffice/src/views/notifications/{deliveries,catalog}/**, backoffice/src/navigation/screens.ts (yalnızca ekleme), backoffice/e2e/specs/notifications-ops.spec.ts.
```

### Brif BO-N3 — Tenant detayı "Bildirim geçmişi" sekmesi (`cloud/bo-ntf-tenant`)
```
Görev: Müşteriler > tenant detayına "Bildirim geçmişi" sekmesi (getTenantHistory {tid, cursor}). Yalnızca meta veri: zaman, kod, kategori, önem, alıcı sayısı, uygulama içi/e-posta durum özeti, grup sayacı; satır → o olayın teslim kayıtları (listDeliveries {eventId}). Tenant iş verisi/bildirim metni gösterilmez (sunucu zaten dönmez).
Dosya sahipliği: frontend/backoffice/src/views/customers/detail/NotificationHistoryTab.vue (+ sekme kaydı satırı), backoffice/e2e/specs/customer-notification-history.spec.ts.
```

## 6. İnsan kararı gerektirenler (Protokol 12; varsayılanlar ADR'de, fabrikayı durdurmaz)

| No | Konu | Varsayılan |
|---|---|---|
| S1 | 4 yeni ApplicationDB koleksiyonu ve indeksleri (yerel + Atlas), yedek şartı | Kod bayrak arkasında birleşir, DB'ye dokunulmaz (`NOTIFY_V2_ENABLED=false`) |
| S2 | Canlı SMTP, SPF/DKIM/DMARC, `PUBLIC_APP_URL` (zaten bekleyen karar) | `NOTIFY_EMAIL_ENABLED=false` |
| S3 | Saklama süreleri: uygulama içi 14/30/90 gün, defter ve teslim 30 gün | ADR'deki değerler |
| S4 | Zorunlu kategori kümesi (§2.1 "Zor." sütunu) | ADR'deki küme |
| S5 | Toplu duyuru e-postası: yalnızca hizmet duyurusu; ticari ileti/İYS sınırı hukuki görüşü | E-posta kanalı step-up + onay kutusu ile, pazarlama yasak |
| S6 | Destek erişiminde (impersonation) tenant'a e-posta da gitsin mi, "önceden onay" ayarı olsun mu (ADR-0028 ile ortak) | Yalnızca uygulama içi, zorunlu |
| S7 | Doğrulanmamış e-posta adresine gönderim | Yalnızca zorunlu security/billing |
| S8 | Web push açılışı: VAPID anahtarları (ortam başına), göç `0020`, push servislerine çıkış (FCM/Mozilla/Apple/WNS — kullanıcı cihazına teslim için Google/Apple/Mozilla/Microsoft altyapısı; yük uçtan uca şifreli, içerikte kişisel veri yok) | Kapalı (`WEBPUSH_VAPID_*` boş) |
| S8 | Platform alarm alıcıları `ALERT_EMAIL_TO` (ADR-0017 S4) | Platform sahibinin adresi (env) |

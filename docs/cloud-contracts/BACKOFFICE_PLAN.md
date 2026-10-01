# Backoffice + ortak UI paketi + dark mode — uygulama planı

Karar: `docs/adr/0026-backoffice-ortak-ui-paketi-ve-tema.md` (ADR-0026). Bu belge ADR'yi tekrar etmez. İçeriği: ekran envanteri, backend eksikleri, aşama planı ve bulut görev brifleri.
Envanter kaynağı: `cloud/ds-v2-a5` dalının `frontend/` ağacı ve `faz4-integration` dalının `backend/src` ağacı (2026-09-30).

---

## 1. Ekran envanteri

### 1.1 Taşınacak ekranlar (frontend → backoffice)
Rota sütunu, müşteri uygulamasındaki slug'dır (`frontend/src/navigation/screens.ts:119-146`). Hepsi `platformAdmin`.

| # | Bugünkü dosya (frontend/src/…) | Slug | Backoffice hedefi (menü) | Çağırdığı RPC'ler (backend dosya:satır) | Not |
|---|---|---|---|---|---|
| 1 | `views/secure/adminPanel/AdminClientListView.vue` + `components/adminPanel/{AdminClientCreateComponent,AdminClientDetailComponent,ClientStatsCard}.vue` | `admin/clients` | Müşteriler → Tenant listesi/detay | `AdminService/getClients` (`api/services/admin-service.ts:28`), `deleteClient` (:721), `createClient` (:651), `updateClient` (:689), `getClientStats` (:75), `getClientIntegrations` (:118), `getGlobalMetrics` (:143) | `deleteClient` destructive → step-up + gerekçe. Detaya yaşam döngüsü, abonelik ve impersonation eklenir (Aşama 4). |
| 2 | `views/secure/adminPanel/AdminTicketListView.vue` + `components/adminPanel/AdminChatComponent.vue` | `admin/tickets` | Destek | `AdminService/getTickets` (:174), `createTicket` (:217), `replyToTicket` (:517), `deleteTicket` (:256), `getClients` (:28) | Destek yazışması PII içerir → `sensitive_read` audit. |
| 3 | `views/secure/adminPanel/AdminSystemManagementView.vue` (1.507 satır) | `admin/system` | **Bölünerek:** Genel bakış / Motor ve kuyruklar / Altyapı / Cache | `AdminService/getSystemHealth` (:275), `getExportDetails` (:550) | Bölme bir refactor'dür; `getSystemHealth` sözleşmesi korunur. Yeni uçlar (§2) geldikçe bölümler bu uçlara geçer. |
| 4 | `views/secure/adminPanel/integrations/IntegrationConfigListView.vue` | `admin/integrations` | Entegrasyonlar → Tanımlar | `IntegrationConfigService/list` (`api/services/integration-config-service.ts:75`), `setIntake` (:337) | `setIntake` destructive → step-up. |
| 5 | `…/integrations/IntegrationSettingsView.vue` + `components/adminPanel/integrations/{IntegrationConfigSettingsBody,SettingField,PublishConfirmDialog,settingsCatalogMirror,useIntegrationConfigApi,useOpenIntegrationConfigTab}` | `admin/integrations/settings` | Entegrasyonlar → Ayarlar | `getEffectiveConfig` (:97), `history` (:115), `saveDraft` (:127), `discardDraft` (:154), `previewPublish` (:181), `publish` (:196), `rollback` (:235), `takeOverLock` (:275), `testEndpoint` (:293) | **Bulgu (doğrulanmalı):** FE `IntegrationConfigService/getEffectiveConfig` çağırıyor, ama yetenek bağı yalnızca `IntegrationConfigService/get` (`capabilities/domains/platform.ts:100-102`). Dinamik `call(operation)` FE envanter taramasından muaf (`tests/characterization/auth/operation-policy.test.ts:89-92`). Bu yüzden gerçek backend'de 403 dönme olasılığı var. Aşama 3'te bağ eklenir ya da FE `get` çağırır. `settingsCatalogMirror.ts` GEÇİCİ; `getCatalog` ucu §2'de. |
| 6 | `…/integrations/EngineSettingsView.vue` | `admin/engine-settings` | Entegrasyonlar → Motor ayarları | #5 ile aynı servis | |
| 7 | `…/integrations/EffectiveConfigView.vue` | `admin/effective-config` | Entegrasyonlar → Etkin ayar | `getEffectiveConfig` (:97), `list` (:75) | #5 bulgusu burada da geçerli. |
| 8 | `…/integrations/ComplianceView.vue` + `components/adminPanel/integrations/{ComplianceSummaryPanel,ComplianceFindingSheet,useIntegrationComplianceApi}` | `admin/integration-compliance` | Entegrasyonlar → Uyum konsolu | `IntegrationComplianceService/list` (`api/services/integration-compliance-service.ts:112`), `summary` (:131), `getDetail` (:171), `transition` (:180) | |
| — | `components/adminPanel/integrations/PlatformAdminGuard.vue` | — | **Taşınmaz.** Backoffice kabuğu tümüyle platformAdmin'e kapalıdır. | — | Aşama 3'te silinir. |
| — | `views/secure/adminPanel/AdminView.vue` (674 satır) | kayıtsız | **Taşınmaz, silinir.** `MessageListView` kopyası, `screens.ts:117-118` "göç edilmedi" diyor. | `MessageService/*` (tenant) | Ölü kod. |

**Özet:** 8 ekran taşınır (bölünmeyle 11 backoffice sekmesi olur), 13 bileşen/composable onlarla birlikte gider, 2 dosya silinir. Müşteri uygulamasında `DashboardView.vue:105` `isPlatformAdmin` kontrolü ve `composables/user.ts:273-295` `isPlatformAdmin` Aşama 3'te gözden geçirilir. `ga` kullanıcısı müşteri uygulamasına artık yalnızca impersonation ile girer.

**Müşteri uygulamasında kalanlar (yönetim değil):** `LogListView` + `components/logListView/**` (tenant iş logları, `IntegrationService/*`), `AuditService/getAuditLogs` (`api/services/audit-service.ts:46`, tenant admin, kendi tenant'ı), `IntegrationService/getIntegrationHealth` (`integration-service.ts:271`, tenant).

### 1.2 Yeni ekranlar (backoffice, Aşama 4)
| Menü | Ekran | Veri kaynağı (§2 uç no) |
|---|---|---|
| Genel bakış | Sağlık panosu | B1 |
| Müşteriler | Yaşam döngüsü paneli, silmeyi geri al, impersonation | B2, B3, mevcut `TenantDataService/cancelDeletion` (`tenant-data-service.ts:54`) |
| Üyelik ve abonelikler | Planlar, abonelik listesi/detay, deneme uzat, plan değiştir, iptal, gelir metrikleri | B4 |
| Entegrasyonlar | API sağlığı (platform geneli), dayanıklılık durumu | B5, B6 |
| Motor ve kuyruklar | BullMQ kuyrukları + DLQ, durum makinesi işleri, zamanlayıcı koşuları | B7 |
| Altyapı | Redis durumu, MongoDB durumu (salt okuma) | B8 |
| Cache | Metrikler, aile dökümü, aile boşaltma | B9 |
| Log Kontrol Merkezi | Panolar, Sorunlar, Log gezgini + canlı akış, İz, Denetim kaydı | L1–L8, B10 |
| Bildirimler ve duyurular | Duyurular (hedefli, zamanlı), Teslim günlüğü + başarısızlıklar, Olay kataloğu + şablon önizleme, Tenant bildirim geçmişi (yalnız meta veri) | ADR-0029 NB7 (BO-N1..BO-N3; bkz. docs/NOTIFICATION_PLAN.md) |
| Sistem ayarları | Özellik bayrakları, bakım modu | B11 |
| Yöneticiler ve güvenlik | Yönetici listesi, 2FA, oturum kapatma | B12 |
| (kabuk) | Giriş, 2FA kaydı/doğrulama, step-up diyaloğu | S1–S6 |

---

## 2. Backend uçları

**Ortak kurallar (hepsi için):**
- Yetenek kaydı `capabilities/domains/backoffice.ts` içinde tutulur (yeni dosya; ya da mevcut `platform.ts`).
- Her yetenekte: `minTier:'platformAdmin'`, `surface:'backoffice'`, `mcp: notExposed{platform_admin}`, `agent: NO_AGENT`.
- Girdi şeması `capabilities/rpc-input/backoffice.ts` içinde, zod ile (ADR-0023).
- Yazma işlemleri gerekçe (`reason`) ister ve audit'e yazılır. `destructive` ve `requiresReauth` işlemleri step-up ister.
- Yanıtlar sınırlıdır: `limit≤200`, imleç, `maxTimeMS≤5000`.
- Tenant iş verisi dönmez.

### 2.1 Kabuk / oturum (Aşama 2-BE)
| No | Uç | Etki | Not |
|---|---|---|---|
| S1 | `/admin-api` bağlama noktası (ApiManager deseni) + `EK_ADMIN` çerezi + `aud:'backoffice'` + `ADMIN_CORS_ORIGINS` + isteğe bağlı `ADMIN_IP_ALLOWLIST` | altyapı | `api/ApiManager.ts`, `api/authenticate.ts`, `api/Security.ts`, `api/originCheck.ts`, `config/` |
| S2 | `BackofficeAuthService/login {email,password,captcha?}` → `{mfaRequired, enrollRequired}` (yarım oturum, 5 dk) | açık | Yalnızca `isGlobalAdmin` kullanıcı. Diğer herkese aynı genel hata (numaralandırma yok). |
| S3 | `BackofficeAuthService/enrollTotp` → `{otpauthUri}` · `confirmTotp {code}` → `{recoveryCodes[10]}` | yazma | Sır `enc:v1:` ile saklanır. `Users` şemasına `mfa: {secret, enabledAt, recoveryHashes[]}` eklenir. |
| S4 | `BackofficeAuthService/verifyTotp {code \| recoveryCode}` → tam oturum (`mfa:true`) | açık/yarım | Hız sınırı. Kurtarma kodu tek kullanımlıktır. |
| S5 | `BackofficeAuthService/reauth {password, code}` → `reauth_at` yenilenir · `logout` · `logoutAllSessions` (`tokenVersion++`) · `me` | yazma/okuma | `REAUTH_REQUIRED` ve `MFA_REQUIRED` `docs/ERROR_CODES.md`'ye eklenir. |
| S6 | Yetenek tipine `surface` ve `requiresReauth` alanları; `derivePolicy` bağlama noktasına göre süzer | altyapı | `capabilities/types.ts`, `derive/policy.ts`, `capability-parity.test.ts` |
| S7 | Audit genişletmesi: karar `effect` alanından türetilir, `reqId`/`reason`/`surface` yazılır | altyapı | Bulgu: `api/RunOperation.ts:115-130` yalnızca `AdminService` + ad regex'i kullanıyor. |

### 2.2 Müşteriler / impersonation
| No | Uç | Etki |
|---|---|---|
| B2 | `BackofficeTenantService/getLifecycle {tid}` → durum, deneme bitişi, silme talebi (bekleme sonu), provisioning adımları, son etkinlik | okuma |
| B3 | `BackofficeTenantService/startImpersonation {tid, reason}` → `{url}` (Redis `imp:<sha256>` NX EX 60) · müşteri `/api`: `SecurityService/redeemImpersonation {ticket}` (açık, bilet = kimlik) · `SecurityService/endImpersonation` | destructive (step-up) / açık / yazma |
| — | Mevcut: `AdminService/getClients/getClientStats/getClientIntegrations/getGlobalMetrics/createClient/updateClient/deleteClient`, `TenantDataService/cancelDeletion` (`platform.ts:17-19`, bugün `noUi`) | — |

### 2.3 Üyelik ve abonelikler
| No | Uç | Etki | Not |
|---|---|---|---|
| B4a | `BackofficeBillingService/listSubscriptions {status?, planCode?, cursor, limit}` · `getSubscription {tid}` (+ `BillingEvents` geçmişi) | okuma | `Subscriptions`/`BillingEvents` ApplicationDB'de (ADR-0008). |
| B4b | `extendTrial {tid, days≤30, reason}` · `cancelSubscription {tid, atPeriodEnd, reason}` · `changePlan {tid, planCode, reason}` | requiresReauth | Sağlayıcı arabirimi üzerinden gider (`services/billing/*Provider`). Doğrudan belge yazımı yapılmaz; ADR-0008 durum makinesi korunur. |
| B4c | `getRevenueMetrics {range}` → MRR, durum dağılımı (trialing/active/past_due/suspended/canceled), deneme→ücretli dönüşüm, kayıp | okuma | Mevcut koleksiyonlardan hesaplanır, yeni koleksiyon açılmaz. Plan fiyatı `Plan` modelinden gelir. |
| — | Mevcut: `BillingService/getPlans` (`billing-service.ts:42`, member) salt okuma olarak kullanılır. | | |

### 2.4 Entegrasyonlar
| No | Uç | Etki | Not |
|---|---|---|---|
| B5 | `BackofficeIntegrationService/getApiHealth {integrationCode?, range}` → platform geneli çağrı sayısı, hata oranı (kod bazında), p95, etkilenen tenant **sayısı** | okuma | `IntegrationCallMetrics` üzerinden. `operations/integrations/health.ts` tenant sürümünü yeniden kullanır. |
| B6 | `getResilienceState` → entegrasyon × pod: devre kesici durumu, hız sınırı bütçesi, son açılma zamanı; intake (on/drain/off) | okuma | Her pod metrik flush'ında `resilience:<pod>` Redis anahtarına 60 sn TTL'li anlık görüntü yazar. Uç tüm podların anahtarlarını okur. |
| B6b | `IntegrationConfigService/getCatalog` | okuma | ADR-0020 C açık işi (`settingsCatalogMirror.ts` geçici kopyasını kaldırır). |
| B6c | `IntegrationConfigService/getEffectiveConfig` yetenek bağı (ya da FE → `get`) | — | §1.1 #5 bulgusu. |

### 2.5 Motor ve kuyruklar
| No | Uç | Etki |
|---|---|---|
| B7a | `BackofficeEngineService/getQueues` → her BullMQ kuyruğu için `Queue.getJobCounts()` (wait/active/delayed/failed/completed/paused) + `QueueMetrics` son 24 saat serisi | okuma |
| B7b | `listFailedJobs {queue, cursor, limit}` → kimlik, tenant, operasyon, hata kodu, deneme sayısı, zaman (**yük dönmez**) · `retryJob {queue, jobId, reason}` (yazma) · `discardJob {queue, jobId, reason}` (destructive) | okuma/yazma |
| B7c | `getStateMachineJobs` → `ExportSignals`/`ImportJobs` durum dağılımı, takılı kiralar (kira süresi dolmuş ama `lockedBy` dolu), sahip pod · `releaseStuckLease {kind, id, reason}` (requiresReauth) | okuma/yazma |
| B7d | `listJobRuns {job?, status?, cursor}` → `JobRunRegistry` (zamanlayıcı koşuları, 14 gün) | okuma |

Bugünkü `getSystemHealth` `bull:order-sync-queue:*` anahtarlarını `llen`/`zcard` ile ham okuyor (`admin-service.ts:350-355`). B7a bunun yerine BullMQ API'sini kullanır.

### 2.6 Altyapı (salt okuma, tenant verisi sızdırmaz)
| No | Uç | Güvenlik kuralı |
|---|---|---|
| B8a | `BackofficeInfraService/getRedisStatus` → sürüm, çalışma süresi, used/peak/maxmemory, parçalanma, eviction politikası, bağlı/bloklu istemci, ops/sn, isabet/ıskalama, süresi dolan/tahliye edilen anahtar, db başına `dbsize`, **önek ailesi** bazında anahtar sayısı, slowlog (yalnızca komut adı + süre) | `INFO` alanlarının izinli listesi. `SCAN` örneklemesi: en fazla 10.000 anahtar, `COUNT 500`, 200 ms bütçe. Anahtar adı ve değer dönmez. `KEYS/MONITOR/CONFIG/FLUSH*/DEBUG` asla çağrılmaz. |
| B8b | `getMongoStatus` → `serverStatus` alt kümesi (bağlantılar, opcounters, çalışma süresi, sürüm, WiredTiger önbellek doluluğu), uygulama havuzları (DatabaseManager tenant bağlantı sayısı, `poolsize`), **izinli** DB'ler için `dbStats` | **`listDatabases` ÇAĞRILMAZ.** DB adı kaynağı `entegrasyonikDB` + `Clients.dbConfig.dbname`, ayrıca `CLAUDE.md` kural 2 izinli listesiyle kesişim. Tenant DB'leri "tenant #N" olarak görünür. |
| B8c | `getMongoCollections {db:'app' \| tid}` → `collStats` (boyut, belge sayısı, indeks boyutu) + `listIndexes` + `$indexStats` (kullanım sayısı) | Belge içeriği dönmez. |
| B8d | `getSlowQueries {range}` → `db.slow_query{db,collection,op}` sayısı ve p95 | Uygulama tarafında mongoose eklentisi (>200 ms) `MetricRollups`'a yazar. Profiler kullanılmaz. Sorgu değerleri yazılmaz. |

### 2.7 Cache
| No | Uç | Etki |
|---|---|---|
| B9 | `BackofficeInfraService/getCacheMetrics` → `utils/decorator/cache.ts:83 getCacheMetrics()` + `api/cacheDump.ts buildCacheDump()` (aile bazlı; WP10 kuralı, ham anahtar dönmez) · `flushCacheFamily {family, reason}` | okuma / requiresReauth |

### 2.8 Sistem ayarları ve yöneticiler
| No | Uç | Etki | Not |
|---|---|---|---|
| B11 | ADR-0020 yapılandırma motorunda yeni `platform` hedefi: `maintenance.enabled`, `maintenance.message`, `features.<ad>` | mevcut `IntegrationConfigService/*` | Yeni servis açılmaz. Bakım modu ara katmanı: `maintenance.enabled` açıkken `/api` yazmaları 503 döner (`/admin-api` ve `/health` hariç). |
| B12 | `BackofficeAdminUserService/list` · `invite {email}` · `disable {sub, reason}` · `resetMfa {sub, reason}` | okuma / requiresReauth | Son aktif yönetici kaldırılamaz. `GlobalRole` modeli (`user-service.ts`) incelenip yeniden kullanılır. |
| B10 | `BackofficeAuditService/search {from,to,event?,sub?,tid?,result?,reqId?,cursor}` (platform geneli; tenant sürümü `audit-service.ts:46`) | okuma | İndeks önerisi §2.9. |

### 2.9 Log Kontrol Merkezi (AYRI iş kalemi: WP-LOG)
**Bugünkü durum (bulgu):**
- pino yalnızca stdout'a yazıyor (`platform/core/logger/logger.ts:60-61`). Kalıcı log deposu yok.
- Hata grupları `ErrorEvents` koleksiyonunda: parmak izi `source::module::code::şablon`, 10 sn tamponlu upsert, 30 gün TTL, tek `tenantId` alanı (`platform/runtime/metrics/errorEvents.ts`, `database/application/models/ErrorEvent.ts:7-35`).
- Taşkın denetimi var (`floodControl.ts`, 60 sn).
- Redaksiyon varsayılan olarak reddeder (`redact.ts`, pino `redact.paths`).
- Metrik kovaları `MetricRollups` (5 dk kova 7 gün, 1 sa kova 90 gün). Çağrı metrikleri `IntegrationCallMetrics` (30 gün, **corrId yok**). Denetim `AuditLogs` (365 gün, **reqId yok**, `tid` indeksi yok).
- Bu kaynakların hiçbiri için platform okuma RPC'si yok. Entegrasyon katmanında 151 `console.*` var (F-06).

| No | İş / uç | Not |
|---|---|---|
| L1 | Log şeması: `logger.child` bağına `src` (zorunlu), `integ`, `op`, `errClass` eklenir. `consoleBridge` kayıtları `src:'legacy-console'` alır. `AppError.code` ve `IntegrationError.code` → `errClass`. | ADR-0026 Karar 7.1. **F-06 göçü (151 `console.*`) bu şemaya bağlanır:** adaptör başına `logger.child({module, src:'adapter', integ})`. Göç entegrasyon ailesi başına küçük commit'lerle yapılır; no-console mandalı düşer. |
| L2 | `LogEvents` kalıcılaştırma: pino multistream ek hedefi, tampon (2 sn / 200 belge), düşürme politikası (>5.000), günlük tavan 200.000 (sonra warn 1/10), `expAt` TTL (14 gün / 3 gün), `ctx` ≤2 KB | `database/application/models/LogEvent.ts` (yeni), `platform/runtime/logs/` (yeni, Sv5). Kanca bağımlılığı ters çevrilir (`setErrorHook` deseni, ADR-0016 katman kuralı). |
| L3 | PII maskeleri (e-posta, telefon, TCKN, IBAN, kart), kalıcılaştırmadan ÖNCE | `redact.ts` genişletilir. Birim testleri örnek dizelerle yazılır. |
| L4 | `ErrorEvents` genişletmesi: `src`, `errClass`, `op`, `level`, `tenantIds` (≤50), `tenantCount`, `daily` (30 gün) | `buildErrorEventUpsertOp` pipeline'ına eklenir. Mevcut regresyon kuralı (resolved → open) korunur. |
| L5 | `MetricRollups` sayacı `log.events{src,level}` (tüm loglar) | Panolar ve hata oranı için. |
| L6 | `LogCenterService/searchLogs {from,to,level[],src[],errClass[],tid?,integ?,op?,reqId?,text?(şablon öneki; regex YOK),cursor,limit≤200}` · `tail {afterCursor, filtreler}` (3 sn polling) | okuma, `maxTimeMS 5000` |
| L7 | `LogCenterService/listIssues {status?,src?,errClass?,integ?,range,sort: lastSeen\|count\|tenantCount\|new}` · `getIssue {fp}` (örnek, günlük trend, tenant sayısı + ilk 10 tid, ilgili reqId'ler) · `transitionIssue {fp, status, note}` (yazma) · `getDashboards {range,bucket}` (kategori hacmi, hata oranı serisi, en gürültülü kaynaklar, yeni sorunlar) | okuma / yazma |
| L8 | `LogCenterService/getTrace {reqId}` → LogEvents + AuditLogs + IntegrationCallMetrics birleşik zaman çizelgesi. `IntegrationCallMetric` şemasına `corrId`, `AuditLogger`'a `reqId` eklenir. | okuma |

**İndeks önerileri (YALNIZCA ÖNERİ — yeni koleksiyon ve indeks bir DB değişikliğidir: `backup/` içinde güncel doğrulanmış yedek şart (`CLAUDE.md` kural 3), Atlas için Protokol 12 onayı gerekir; yerelde mongoose `autoIndex` ile doğrulanır):**
- `LogEvents`: `{expAt:1}` TTL `expireAfterSeconds:0` · `{t:-1}` · `{level:1,t:-1}` · `{src:1,t:-1}` · `{fp:1,t:-1}` · `{reqId:1}` · `{tid:1,t:-1}` (sparse) · `{integ:1,t:-1}` (sparse)
- `ErrorEvents`: `{firstSeen:-1}` · `{integrationCode:1,lastSeen:-1}` · `{src:1,errClass:1,lastSeen:-1}` (mevcut `{status:1,lastSeen:-1}` korunur)
- `AuditLogs`: `{tid:1,at:-1}` (`audit-service.ts:35` zaten öneriyor) · `{sub:1,at:-1}` (varsa korunur) · `{'meta.reqId':1}` (sparse)
- `IntegrationCallMetrics`: `{corrId:1}` (sparse) · `{integrationCode:1,at:-1}`

**Hacim ve maliyet:** Günde 10–50 bin belge × ~0,6 KB, 14 günde yaklaşık 100–400 MB (indeksler dahil). Eşik: 1 GB, 1 milyon belge/gün ya da sorgu p95 > 2 sn olursa harici log deposu değerlendirilir (ADR-0026).

---

## 3. Aşama planı

Her aşama ayrı bir dal/görev olarak yürür. Hiçbir aşama bir öncekinin testlerini kırmadan birleşmez.

| Aşama | Nerede | Bağımlılık | Dosya sahipliği (yalnızca bunlar değişir) | Kabul |
|---|---|---|---|---|
| **0** Ortak UI paketi | Bulut `cloud/ui-pkg-0` | `cloud/ds-v2-a6b` birleşip `faz3-arayuz`'a girmiş ve `cloud-sync push` yapılmış olmalı | `frontend/package.json` (workspaces), `frontend/package-lock.json`, `frontend/packages/ui/**` (yeni), `frontend/src/design/**` → paket (`git mv`), `frontend/src/components/ds/**` → paket (`git mv`), ilgili import satırları, `frontend/scripts/*baseline*` + `*-baseline.json` (yeniden anahtarlama), `frontend/forge.config.js` (ignore), `frontend/vite.config.mts`/`vitest.config.ts`/`tsconfig.json` (dedupe/paths), `frontend/tests/theme/**` → paket, `site/src/styles/tokens.css`, `site/src/lib/tokens-node.ts`, `site/tests/tokens.test.ts`, `site/astro.config.mjs`, kök `.gitignore` negation (**bulut yazamaz**, orkestratör yerelde) | 0 görsel fark (`*-win32.png` yeniden üretilmez), vitest/Playwright/typecheck/mandallar yeşil, `npm run tokens -w @entegrasyonik/ui` idempotent, site testleri yeşil, `packages/ui`'dan `@/` importu 0 (statik test) |
| **1a** Dark altyapı | Bulut `cloud/dark-1a` | 0 | `packages/ui/src/{tokens,theme}/**`, `frontend/index.html`, `frontend/public/theme-boot.js`, `frontend/src/stores/theme.ts`, `frontend/src/plugins/vuetify.ts`, `frontend/src/design`'dan kalanlar, grafik kullanan bileşenler (`:theme`), `frontend/playwright.config.ts` (dark projesi), tema anlık görüntü tabanı (bilinçli) | `?theme=dark` ile ilk karede dark (titreme yok; Playwright ilk-kare testi: DOMContentLoaded anındaki `html[data-theme]` + `body` arka planı), dark kontrast birim testleri yeşil, light'ta 0 görsel fark |
| **1b** Dark tur + açılış | Bulut `cloud/dark-1b` + yerel taban onayı | 1a | P1+P2 ekran dosyaları (yalnızca literal → token), kullanıcı menüsü tema kontrolü, dark tabanlar `*-chromium-desktop-dark-win32.png` (yerelde) | ADR-0011 kapısı: P1+P2 literal renk 0 + dark axe 0. Bundan sonra anahtar görünür. |
| **2-BE** Backoffice oturumu | Yerel `faz4-bo-auth` | — (0/1 ile paralel yürüyebilir) | `backend/src/api/{ApiManager,authenticate,Security,originCheck,RunOperation}.ts`, `backend/src/config/**`, `backend/src/capabilities/{types,derive/policy}.ts` + `domains/backoffice.ts` + `rpc-input/backoffice.ts`, `backend/src/api/services/backoffice-auth-service.ts` (yeni), `database/application/models/User.ts` (mfa), testler | S1–S7; jest yeşil; `capability-parity` güncel; `docs/CAPABILITIES.md` yeniden üretildi; `.env.example`'da `ADMIN_CORS_ORIGINS`/`ADMIN_IP_ALLOWLIST` var |
| **2-FE** Backoffice iskeleti | Bulut `cloud/bo-shell-2` | 0 (+1a tercih edilir), 2-BE sözleşmesi (brifte verilir; mock fixture) | `frontend/backoffice/**` (yeni), `packages/ui/src/{shell,rpc}/**` (yeni), `frontend/src/stores/workspace.ts` + `frontend/src/composables/restapi.ts` (fabrika adaptörüne ince geçiş, davranış aynı) | Müşteri uygulamasında 0 görsel fark ve tüm testler yeşil; backoffice: giriş → 2FA → boş kabuk (menü, sekmeler, dark) Playwright + axe 0 (light+dark); mandallar 0'dan |
| **3** Ekran taşıma | Bulut `cloud/bo-move-3` + yerel BE | 2-FE, 2-BE | `frontend/src/views/secure/adminPanel/**` → `frontend/backoffice/src/views/**` (`git mv`), `frontend/src/components/adminPanel/**` → `frontend/backoffice/src/components/**`, `frontend/src/navigation/screens.ts` + `stores/site/menu.ts` (admin girdileri çıkar), ilgili frontend e2e spec'leri → `backoffice/e2e`, `AdminSystemManagementView` bölünmesi, `AdminView.vue`/`PlatformAdminGuard.vue` silinir. Yerel: `backend/tests/characterization/auth/operation-policy.test.ts` iki kökü tarar, `/api` platformAdmin kapatma, `ga` girişi reddi, `getEffectiveConfig` bağı, `selectStore` → bilet | Frontend'de `adminPanel` 0 dosya; backoffice'te 8 ekran yeşil (light+dark desktop taban, axe 0); backend FE envanter testi her iki kökte yeşil; yerelde uçtan uca giriş → impersonation → müşteri bandı |
| **4** Yeni ekranlar + uçlar | Ekran grubu başına: önce yerel BE, sonra bulut FE | 3 | Grup başına §2 satırları + `backoffice/src/views/<grup>/**` | Grup başına: jest + backoffice Playwright + axe (light+dark) |
| **4-LOG** Log Kontrol Merkezi (WP-LOG) | Yerel BE (L1–L8), sonra bulut FE | 2-BE; L1 F-06 ile paralel | `backend/src/platform/core/logger/**`, `backend/src/platform/runtime/{logs,metrics}/**`, `database/application/models/{LogEvent,ErrorEvent,IntegrationCallMetric}.ts`, `services/audit/AuditLogger.ts`, `api/services/log-center-service.ts`; FE: `backoffice/src/views/logs/**` | Yazım yolu olay döngüsünü beklemiyor (yük testi: 5.000 log/sn'de istek gecikmesi p95 artışı <%10), maske testleri, sorgular `maxTimeMS` içinde, TTL indeksleri yerelde doğrulanmış |

**Aşama 4 grup sırası (öneri):** (1) Genel bakış + Motor ve kuyruklar (B1, B7), (2) Log Kontrol Merkezi (WP-LOG), (3) Abonelikler (B4), (4) Müşteri yaşam döngüsü + impersonation UI (B2, B3), (5) Altyapı + Cache (B8, B9), (6) Sistem ayarları + Yöneticiler + Denetim (B10–B12), (7) Entegrasyon API sağlığı + dayanıklılık (B5, B6).

**B1 (genel bakış) kompozisyonu:** Bağımlılıklar (`health/HealthCheck.ts` hazır/ready mantığı yeniden kullanılır), podlar (kira ve heartbeat sahipleri), RED metrikleri son 1 saat (`MetricRollups http.requests`), kuyruk birikimi (B7a özeti), açık ve yeni sorun sayısı (L7 özeti), intake durumları, bugünkü gelir özeti (B4c). Tek uç: `BackofficeHealthService/getOverview`. Paralel alt sorgular kullanılır, her biri 2 sn zaman aşımıyla; başarısız bölüm `degraded` olarak işaretlenir.

---

## 4. Riskler ve dikkat noktaları
- **Aşama 0 zamanlaması:** Açık bir bulut dalı varken yol taşıyan bir commit birleştirilmez (`git apply --3way` taşınmış yola uygulanamaz). Aşama 0 başlarken başka bir `frontend/` bulut dalı açık olmamalı.
- **Kök `.gitignore` negation'ı** (`frontend/src/design/tokens/dist/` → yeni yol) kök dosya olduğu için bulut tarafından yazılamaz. Orkestratör bunu Aşama 0 pull'u sırasında yerelde ekler. Aksi halde taze checkout'ta `dist/*.css` kaybolur (T4c dersi).
- **Electron:** workspace kökünde `npm run package` çalıştırıldığında `packages/` ve `backoffice/` asar paketine girmemeli (Aşama 0 kabulü).
- **Menü DB kayıtları:** Aşama 3'te frontend `screens.ts`'ten çıkan admin anahtarları DB `menus` içinde kalabilir. Aşama 3 testi, kayıtta olmayan menü anahtarının kabukta görünmediğini doğrular. DB temizliği isteğe bağlıdır ve yedek şartına tabidir.
- **Tek yönetici kilitlenmesi:** 2FA zorunlu olduğundan kurtarma kodları kaybedilirse erişim kaybolur. Yerel bir kurtarma betiği bulunur (`backend/scripts/reset-admin-mfa.ts`, yalnızca yerel ve audit'li). Betik DB yazar, yani yedek şartı geçerlidir.

---

## 5. Bulut görev brifleri (yapıştırmaya hazır)

Ortak ek (her brifin sonuna): `docs/CLOUD_BRIEFS.md` "Token tasarrufu" kuralları. Dal `cloud/<kısa-ad>` (main'den), küçük adımlarla commit + push. `*-linux.png` commit'lenmez. Yalnızca "Dosya sahipliği" satırındaki yollar değişir.

### Brif B-0 — Ortak UI paketi (`cloud/ui-pkg-0`)
```
Görev: frontend/'i npm workspaces köküne çevir ve ortak UI paketini çıkar (ADR-0026 Karar 1-2, docs/BACKOFFICE_PLAN.md §3 Aşama 0). DAVRANIŞ DEĞİŞMEZ.
Önce oku: CLAUDE.md (kural 7), docs/adr/0026-backoffice-ortak-ui-paketi-ve-tema.md, docs/adr/0011-faz3-design-token-sistemi.md (dist politikası).
Yap:
- frontend/package.json: "workspaces": ["packages/*","backoffice"] (backoffice klasörü henüz yoksa yalnızca "packages/*").
- frontend/packages/ui (@entegrasyonik/ui, private, derleme adımı YOK, exports alt yolları: ./tokens ./theme ./components/* ./composables/* ./locales/*).
- git mv: src/design/tokens → packages/ui/src/tokens (dist/ dahil); vuetify-theme/defaults/overrides/echarts-theme/channels → packages/ui/src/theme; src/components/ds/** → packages/ui/src/components/**; format/useToast/useSavedViews/usePageAbout/useShellBreakpoints → packages/ui/src/composables (useSavedViews anahtarına uygulama ad alanı parametresi, varsayılan bugünkü anahtar).
- status-map: alan tiplerine bağlı eşlemeler frontend'de kalır; pakete genel defineStatusMap + 5 ton.
- Importları güncelle (@/design/... → @entegrasyonik/ui/...). packages/ui içinde "@/" importu YASAK: statik test (packages/ui/tests/no-app-imports.test.ts) + eslint no-restricted-imports.
- vite.config.mts/vitest.config.ts: resolve.dedupe vue/vuetify/pinia/vue-router/vue-i18n; tsconfig paths.
- tokens: packages/ui/scripts/build-tokens.ts; frontend "tokens" betiği "npm run tokens -w @entegrasyonik/ui"ye yönlenir. Drift/unit/kontrast testleri pakete taşınır.
- Mandal betikleri (style/pattern/no-console/typecheck): kökler src/, packages/ui/src/ (backoffice/src/ varsa); taban anahtarları kök önekli; taşınan dosyaların girdileri AYNI sayılarla yeniden anahtarlanır (git mv listesinden tek seferlik harita). Hiçbir sayı artmaz.
- forge.config.js packagerConfig.ignore: ^/packages, ^/backoffice, ^/e2e.
- site/: tokens.static.css import yolu frontend/packages/ui/src/tokens/dist/tokens.static.css (src/styles/tokens.css, src/lib/tokens-node.ts, tests/tokens.test.ts, astro.config.mjs yorum/yol).
- NOT (orkestratöre): kök .gitignore'daki tokens/dist negation'ı yeni yola taşınmalı — bulut kök dosyaya yazamaz; commit mesajında belirt.
Kabul: 0 görsel fark (hiçbir *-win32.png değişmez; --update-snapshots=missing yalnızca linux için), tüm testler yeşil.
Doğrulama: cd frontend && npm ci && npm run tokens && git diff --exit-code packages/ui/src/tokens/dist && npx vitest run && npm run typecheck && npm run test:typecheck-ratchet && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run build && npx playwright test --project=chromium-desktop --update-snapshots=missing; cd ../site && npm run build && npx vitest run.
```

### Brif B-1a — Dark mode altyapısı (`cloud/dark-1a`)
```
Görev: dark mode altyapısı (ADR-0026 Karar 3; kullanıcı anahtarı HENÜZ görünmez, yalnızca ?theme=dark).
Önce oku: CLAUDE.md kural 7, ADR-0026 Karar 3, ADR-0011 Karar 3, ADR-0015 Karar 5.5, packages/ui/src/tokens/{semantic,legacy}.ts.
Yap:
- packages/ui/src/theme/themePreference.ts: 'system'|'light'|'dark', localStorage['ek-theme'] (anahtar parametreli), matchMedia dinleyicisi, resolveTheme().
- frontend/public/theme-boot.js (eşzamanlı, modül değil; <head>'de CSS'ten önce): html[data-theme], .ek-dark, colorScheme, meta theme-color. index.html'e ekle. Satır içi betik YOK.
- createEkVuetify defaultTheme = resolveTheme(); geçişte bir karelik html.ek-theme-switching (transition:none).
- legacy dark: DARK_WIRED_LEGACY_KEYS sınırını kaldır; eksik 31 anahtar semantik dark'tan türesin; tema anlık görüntü tabanını bilinçli olarak yeniden üret (commit mesajında gerekçe).
- channels.ts {light,dark} (dark değer koyu yüzeyde ≥3:1); buildEchartsTheme(mode) iki tema; grafik bileşenlerinde :theme tepkisel.
- app.css: html/body arka planı tokens.static.css [data-theme] değerlerinden (Vuetify bağlanmadan önceki kare doğru).
- Testler: dark kontrast birim testleri (content ≥4,5 background+surface; subtle metin ≥4,5; border-input ≥3; kanal/grafik ≥3); Playwright ilk-kare testi (DOMContentLoaded'da html[data-theme]='dark' ve body arka planı dark); playwright.config.ts'e chromium-desktop-dark projesi (colorScheme dark + localStorage ek-theme=dark) — bu aşamada yalnızca shell + dashboard spec'i koşar.
Kabul: light'ta 0 görsel fark; dark projesi yeşil (tabanlar yerelde üretilecek).
Doğrulama: cd frontend && npx vitest run && npm run typecheck && npm run test:style-ratchet && npx playwright test e2e/specs/shell.spec.ts --project=chromium-desktop --project=chromium-desktop-dark --update-snapshots=missing.
```

### Brif B-1b — Dark görsel tur ve açılış (`cloud/dark-1b`)
```
Görev: P1+P2 ekranlarını ADR-0011 dark kapısına getir ve tema kontrolünü aç (ADR-0026 Karar 3.5-3.8).
Yap: dark projesinde P1+P2 spec'lerini koş; axe dark ihlallerini ve kalan literal renkleri yalnızca token'a çevirerek düzelt (yeni literal YASAK); kullanıcı menüsüne 3 seçenekli tema kontrolü (Sistem/Açık/Koyu); ApplicationBar'daki gizli eski anahtarı kaldır.
Kapı: P1+P2 literal renk 0 (style-baseline) + dark axe 0. Sağlanmazsa kontrolü AÇMA; eksik listesini commit mesajına ve frontend/docs'a yaz.
Doğrulama: cd frontend && npx vitest run && npm run test:style-ratchet && npx playwright test --project=chromium-desktop --project=chromium-desktop-dark --update-snapshots=missing (sonda bir kez tam koşu).
Not: dark tabanlar (*-chromium-desktop-dark-win32.png) YERELDE üretilip onaylanır.
```

### Brif B-2 — Backoffice iskeleti (`cloud/bo-shell-2`)
```
Görev: frontend/backoffice uygulamasının iskeleti (ADR-0026 Karar 1, 2, 4, 5; plan §2.1 sözleşmesi). Ekranlar BOŞ.
Önce oku: CLAUDE.md kural 7, ADR-0026, ADR-0012 (sekmeli çalışma alanı), backend/src/api/services/backoffice-auth-service.ts (SALT OKUNUR — sözleşmeyi AYNEN kullan; yerelde 2-BE bitmemişse plan §2.1 S2-S5 sözleşmesini e2e mock fixture olarak uygula).
Yap:
- packages/ui/src/rpc/createRpcClient.ts (axios örneği; global defaults/interceptor YOK; X-Request-Id; onUnauthorized; onReauthRequired → istek kuyruğu ve yeniden deneme). frontend/src/composables/restapi.ts bu fabrikayı kullanan ince adaptör olur; müşteri davranışı AYNI (global withCredentials ve 401 → /login dahil).
- packages/ui/src/shell/createWorkspaceStore.ts (resolveScreen, canOpen, notify, storageScope enjekte); frontend/src/stores/workspace.ts ince adaptör olur, davranış AYNI.
- frontend/backoffice: package.json (@entegrasyonik/backoffice), vite.config.mts (port 3100, dedupe), index.html + public/theme-boot.js (anahtar ek-bo-theme), createEkVuetify, i18n (TR; DS metinleri paketten), router, statik ekran kaydı src/navigation/screens.ts (ADR-0026 Karar 5'in 11 menü grubu, placeholder EkEmptyState), kabuk (EkSidebarNav + EkWorkspaceTabs + EkAppHeader), giriş → 2FA kaydı/doğrulama → kabuk; step-up diyaloğu (REAUTH_REQUIRED); oturum düşünce /login.
- Güvenlik başlıkları dosyası (nginx örneği): noindex, frame-ancestors 'none', sıkı CSP, no-referrer; service worker YOK.
- backoffice e2e (Playwright, /admin-api/** mock): giriş, 2FA, step-up, sekme aç/kapa, dark; axe 0 (light+dark).
- Mandallar backoffice/src'yi tarar, 0'dan başlar.
Kabul: müşteri uygulamasında 0 görsel fark ve tüm testler yeşil; backoffice testleri yeşil.
Doğrulama: cd frontend && npx vitest run && npm run typecheck && npm run build && npx playwright test e2e/specs/shell.spec.ts --project=chromium-desktop --update-snapshots=missing && npm run build -w @entegrasyonik/backoffice && npm run test -w @entegrasyonik/backoffice && npx playwright test -c backoffice/playwright.config.ts --update-snapshots=missing.
```

### Brif B-3 — Ekran taşıma (`cloud/bo-move-3`)
```
Görev: 8 admin ekranını frontend'den backoffice'e taşı (docs/BACKOFFICE_PLAN.md §1.1; yeniden yazma YOK — git mv + import/RPC istemcisi değişimi).
Yap:
- git mv frontend/src/views/secure/adminPanel/** → frontend/backoffice/src/views/**, frontend/src/components/adminPanel/** → frontend/backoffice/src/components/**; ilgili e2e spec'leri ve fixture'ları backoffice/e2e'ye.
- AdminSystemManagementView'ü 4 sekmeye böl (Genel bakış / Motor ve kuyruklar / Altyapı / Cache); getSystemHealth ve getExportDetails sözleşmesi AYNI.
- AdminView.vue ve PlatformAdminGuard.vue silinir.
- frontend/src/navigation/screens.ts ve stores/site/menu.ts: admin girdilerini çıkar; kayıtta olmayan menü anahtarının kabukta görünmediğini doğrulayan test.
- useIntegrationConfigApi: getEffectiveConfig çağrısını backend sözleşmesine göre düzelt (plan §1.1 #5 bulgusu — backend'de bağ eklendiyse aynen kalır).
- DashboardView likelyAdmin ve user.ts isPlatformAdmin: müşteri uygulamasında ga yalnızca impersonation ile gelir; impersonation bandı (Çık → SecurityService/endImpersonation) ve /impersonate#t= karşılama rotası.
Kabul: frontend/src altında adminPanel 0 dosya; backoffice'te 8 ekran light+dark desktop + axe 0.
Doğrulama: cd frontend && npx vitest run && npm run typecheck && npm run test:style-ratchet && npm run test:pattern-ratchet && npx playwright test --project=chromium-desktop --update-snapshots=missing && npx playwright test -c backoffice/playwright.config.ts --update-snapshots=missing.
Yerel eş iş (orkestratör/backend): operation-policy.test.ts FE_SRC → [frontend/src, frontend/backoffice/src] (+ backoffice istemci desenleri); /api platformAdmin kapatma (surface), ga login reddi, selectStore → bilet; jest yeşil.
```

### Brif B-4.x — Yeni ekran grubu (şablon)
```
Görev: backoffice <GRUP> ekranları (docs/BACKOFFICE_PLAN.md §1.2 + §2 <uç numaraları>). Backend HAZIR — backend/src/api/services/<servis>.ts SALT OKUNUR; girdi/çıktı şekillerini AYNEN kullan, uydurma alan ekleme.
Kurallar: yalnızca DS-v2 bileşenleri (EkListScreen/EkDataGrid/EkDetailSheet/EkMetricCard…), literal renk YOK, grafikler buildEchartsTheme(mode); yazma işlemlerinde gerekçe alanı; destructive/requiresReauth → step-up diyaloğu; tenant iş verisi gösterilmez.
Dosya sahipliği: frontend/backoffice/src/views/<grup>/**, backoffice/src/navigation/screens.ts (yalnızca ekleme), backoffice/e2e/specs/<grup>.spec.ts.
Doğrulama: cd frontend && npm run typecheck -w @entegrasyonik/backoffice && npm run test -w @entegrasyonik/backoffice && npx playwright test -c backoffice/playwright.config.ts e2e/specs/<grup>.spec.ts --update-snapshots=missing.
```

### Brif B-4-LOG — Log Kontrol Merkezi ekranları
```
Görev: backoffice Log Kontrol Merkezi (ADR-0026 Karar 7; plan §2.9 L6-L8, B10). Backend (LogCenterService, BackofficeAuditService) HAZIR — salt okunur.
Sekmeler: Panolar (kategori hacmi + hata oranı zaman serisi, en gürültülü kaynaklar, yeni sorunlar), Sorunlar (gruplu; filtre: durum/kaynak/hata sınıfı/entegrasyon; sıralama lastSeen/count/tenantCount/new; detayda günlük trend, örnek, etkilenen tenant sayısı, durum geçişi), Log gezgini (filtre çubuğu: seviye/kaynak/hata sınıfı/tenant/entegrasyon/operasyon/reqId/metin öneki; canlı akış anahtarı 3 sn polling, sekme görünmezken durur; kayıtlı görünümler useSavedViews), İz (reqId zaman çizelgesi: log + audit + entegrasyon çağrısı), Denetim kaydı.
Her satırdan: reqId → İz, fp → Sorun, integ → Entegrasyon API sağlığı sekmesi (openTab).
Maskeli alanlar olduğu gibi gösterilir; maskeyi açma YOK.
Doğrulama: B-4.x şablonuyla aynı (spec: logs-center.spec.ts).
```

### `docs/CLOUD_BRIEFS.md` eki (orkestratör ekler)
Akış tablosunun 4. adımına şu not eklenir: "backoffice değiştiyse ek doğrulama: `npm run build -w @entegrasyonik/backoffice && npx playwright test -c backoffice/playwright.config.ts`". Şablon listesine B-0…B-4-LOG başvurusu eklenir: "ayrıntı: `docs/BACKOFFICE_PLAN.md` §5".

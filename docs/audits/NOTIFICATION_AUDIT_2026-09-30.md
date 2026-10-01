# Bildirim altyapısı denetimi — 2026-09-30

Kapsam: backend bildirim üretimi, saklama, API ve e-posta; frontend bildirim çekmecesi, merkez ve rozet; ilgili ADR'ler (0008, 0017, 0018, 0021, 0024, 0026). Yöntem: kod okuması (dal `faz4-integration`, worktree `be`; frontend için ana kopya `cloud/ds-v2-a5`). DB/Redis'e bağlanılmadı, kod değiştirilmedi. Karar: `docs/adr/0029-bildirim-sistemi.md`. Plan: `docs/NOTIFICATION_PLAN.md`.

## 1. Bugünkü yapı (özet)

| Parça | Konum | Durum |
|---|---|---|
| Üretim giriş noktası | `backend/src/services/notification/NotificationService.ts:23-25` `sendClientNotification(event)` | `EventEmitter.emit` (senkron). Çağıranın `await`'i hiçbir şeyi beklemez. |
| Taşıyıcı | `backend/src/services/notification/NotificationEventBus.ts:1-14` | Süreç içi `EventEmitter` tekili. Çok süreçte yayılım yok. |
| Tüketici | `NotificationService.ts:10-18` → `operations/client/ClientOperations.ts:26-37` `saveNotification` | Tenant DB `Notifications`'a `create`. Hata yalnızca `console.error`. Yeniden deneme yok. |
| Model | `backend/src/database/client/models/Notification.ts` | Tenant DB. Alanlar `userId` (6), `type` enum 7 değer (12), koşullu `mode` (20-27, ADR-0021 D2), `severity` (32), `title/message` (düz Türkçe metin), `actionUrl`, `metaData`, `isRead`, `isDeleted`, `expiresAt` = +3 gün (59-62), TTL indeksi (81), `{userId,isRead,createdAt}` indeksi (74). |
| Tenant API | `backend/src/api/services/notification-service.ts` | `get` (en yeni ≤200, imleç yok), `markAsRead`, `delete` (soft), `getUnreadCount`. |
| Yetenek kaydı | `backend/src/capabilities/domains/account.ts:121-139` | 4 yetenek, `scope: 'user'`, `minTier: 'member'`. |
| E-posta | `backend/src/services/mail/MailService.ts` (nodemailer, havuzlu SMTP) + `operations/account/accountMailTemplates.ts` | Yalnızca hesap akışları (parola sıfırlama, doğrulama, parola değişti) kullanıyor. Bildirim olaylarının hiçbiri e-posta göndermiyor. |
| Gerçek zamanlı | yok | SSE/WebSocket/pub-sub yok (grep: `text/event-stream`, `socket.io`, `.publish(`/`.subscribe(` → 0). |
| Frontend | `frontend/src/stores/notificationDrawer.ts`, `components/user/NotificationDrawerComponent.vue`, `views/secure/NotificationCenterView.vue`, `types/NotificationTypes.ts`, `components/ds/EkAppHeader.vue:41-43` | C1.5 (bulut `w1-notifications`) tamam. 30 sn rozet yoklaması (`notificationDrawer.ts:15`), sekme gizliyken durur, çıkışta sıfırlanır. Merkezde tür filtresi, istemci tarafı sayfalama, güvenli `actionUrl` (`NotificationTypes.ts` `internalActionPath`). Tercih ekranı yok (B-07). |
| Platform yöneticisi kanalı | yok | ADR-0017 K11. `FindingService.ts:222-235` `noopRaiseAlert` yer tutucu. |

### Çağıranlar (`sendClientNotification`, 7 yer)

| Yer | Tür / önem | Not |
|---|---|---|
| `api/services/integration-service.ts:1343-1355` | `BATCH_PROCESS`, success/warning, "İşlem Özeti" | Aktör kullanıcı biliniyor ama `userId` yazılmıyor. |
| `api/services/integration-service.ts:1359-1370` | `BATCH_PROCESS`, error | Mesaja ham `error.message` konuyor (bkz. N-05). |
| `integration/engine/catalog/import/ImportOrchestrator.ts:110-132` | `IMPORT_READY` (`as any`), `severity:'danger'` | `danger` arayüz tipinde yok (N-11). |
| `integration/engine/order/OrderWorker.ts:422-441` | `SYSTEM`, warning, `metaData.code='ORDER_WINDOW_OVERFLOW'` | Kısma süreç içi `Map` (`OrderWorker.ts:31,36,424-426`, ff9df2c), saatte 1. |
| `operations/billing/TrialExpiryJob.ts:194-212` | `SYSTEM` + `mode: BILLING`, `actionUrl:'/subscription'` | E-posta bu işin kapsamı dışında bırakılmış (`TrialExpiryJob.ts:27-28`). |
| `operations/integration/PostOrderOperations.ts:222-248` | `STOCK_ALERT` (UNMAPPED 138, oversell 173) | Satır başına bildirim. Gruplama yok. |
| `operations/stock/OversellCompensationJob.ts:353-374` | `STOCK_ALERT` (156/194/209/227) | Satır başına bildirim. |

`IntegrationEventBus` (`integration/engine/IntegrationEventBus.ts:7-18`) yalnızca iç sinyal taşıyor (`PROCESS_NEXT_*`, `TRIGGER_ZOMBIE_CLEANUP`). Kullanıcıya dönük olay yok. `NOTIFICATION_EVENTS.UI_NOTIFY` (`interfaces/common/index.ts:18-21`) tanımlı ama kullanılmıyor. `EXPORT_READY`, `ORDER` ve `INFO` türlerinin üreticisi yok (grep 0).

## 2. Bulgular

P0 yok: tenant'lar arası sızıntı bulunmadı. Her okuma ve yazma, doğrulanmış principal'dan seçilen tenant DB'ye (`this.clientDB`) gidiyor. MASTER_STATE #13'e göre izolasyon karakterizasyon testleri var.

### P1

| No | Bulgu | Kanıt | Etki |
|---|---|---|---|
| N-01 | **Bildirimler kullanıcı bazlı değil, tenant bazlı.** Şemada `userId` var ama hiçbir üretici yazmıyor, hiçbir sorgu süzmüyor. Okundu durumu tüm kullanıcılar için ortak. `delete {all:true}` sorgusu `{}` olduğundan tenant'ın TÜM bildirimlerini herkes için siliyor. Yetenek kaydı `scope:'user'` dese de davranış tenant geneli. | `notification-service.ts:17,52-58,79-85,102`; `account.ts:121-139` | Bir `member` başka bir kullanıcının görmesi gereken aşırı satış uyarısını silebilir ya da okundu yapabilir. RBAC gelince (finans bildirimini yalnızca finans görür) model taşıyamaz. |
| N-02 | **Kritik bildirimler 3 günde siliniyor.** `expiresAt` önemden bağımsız olarak +3 gün. Aşırı satış, UNMAPPED ve deneme bitişi hafta sonunu geçemiyor. FE bunu metin olarak da söylüyor. | `Notification.ts:59-62`; `NotificationCenterView.vue:22` | Cuma akşamı oluşan aşırı satış uyarısı pazartesi görülmeyebilir. ADR-0017 K11 ile aynı bulgu. |
| N-03 | **Teslim garantisi yok.** Emit senkron, dinleyici asenkron. Kayıt hatası yalnızca loglanıyor, yeniden deneme yok, süreç çökerse kayıt kayboluyor. İdempotency yok: `AllocationSweepJob` 15 dakikada bir aynı satırı yeniden işlerse bildirim tekrarını engelleyen tek şey üreticinin kendi durum makinesi. | `NotificationService.ts:10-25`; `ClientOperations.ts:26-37` | Sessiz kayıp ya da tekrar. ADR-0021 D2 aynı türden sessiz kaybı bir kez yaşattı. |
| N-04 | **E-posta kanalı yok.** Hiçbir bildirim e-postaya çıkmıyor. ADR-0008 (satır 71) askıya almadan 3 gün önce ve askı anında e-posta istiyor, ancak `TrialExpiryJob` bunu kapsam dışı bırakmış. ADR-0017 kritik alarmda admin e-postası istiyor, o da yok. | `TrialExpiryJob.ts:27-28`; `MailService.ts` yalnızca `AccountLifecycleService`'ten çağrılıyor | Motor durduğunda müşteri uygulamayı açmazsa haberi olmaz. Aşırı satış riski müşteriye geçer (ADR-0008 risk notu). |
| N-05 | **Bildirim metnine ham iç hata iletisi yazılıyor.** `Toplu işlem sırasında bir hata oluştu: ${error.message}` ve `metaData.error`. | `integration-service.ts:1366-1367` | İç ayrıntı ya da (adaptör hatasında) karşı sistem yanıt parçası kullanıcıya ve kalıcı kayda gidiyor. ADR-0017'nin 5xx maskeleme ilkesiyle çelişiyor. |
| N-06 | **Platform yöneticisine bildirim ya da alarm kanalı yok.** Uyum bulguları (ADR-0018) ve ADR-0017 kuralları bağlanacak bir yer bulamıyor. | `FindingService.ts:222-235`; ADR-0017 K11 | Kuyruk birikmesi, devre kesicinin açılması ya da DLQ büyümesi yalnızca log'da kalıyor. |
| N-07 | **Kısma süreç içi.** `overflowNotifiedAt` bir `Map`. Yeniden başlatmada sıfırlanıyor. İkinci worker replikası açılırsa (ADR-0006 eşiği) her replika ayrı sayar. | `OrderWorker.ts:31-41,422-427` | Bugün (tek süreç) kabul edilebilir. Replika açıldığı gün tekrarlı bildirim. |
| N-08 | **Gruplama ya da özet yok.** Oversell ve UNMAPPED satır başına ayrı bildirim üretiyor. Büyük bir sipariş dalgasında gelen kutusu onlarca aynı kayıtla doluyor. | `PostOrderOperations.ts:138,173`; `OversellCompensationJob.ts:156-227` | Gürültü güveni öldürür (PRODUCT_VALUE_PLAN F-06: "otomatik deneme sürerken bildirim yok"). |

### P2

| No | Bulgu | Kanıt |
|---|---|---|
| N-09 | Başlık ve mesaj üretim anında Türkçe düz metin. i18n anahtarı ya da parametre yok, EN arayüzde Türkçe görünüyor. Olay kodu yok (yalnızca OrderWorker `metaData.code` taşıyor). | tüm çağıranlar |
| N-10 | Tür kümesi üç yerde elle kopyalanmış (şema enum'u, `NotificationPayload` tipi, FE `NotificationTypes.ts`). Tek kaynak yok, kayma riski var. | `Notification.ts:12`; `interfaces/common/index.ts:29`; FE `NotificationTypes.ts:10` |
| N-11 | `severity:'danger'` ve `type:'IMPORT_READY' as any`: tip dışı değerler `as any` ile geçiyor. Üç çağıran `as any` kullanıyor. | `ImportOrchestrator.ts:115-117`; `TrialExpiryJob.ts:208`; `PostOrderOperations.ts:244`; `OversellCompensationJob.ts:370` |
| N-12 | `markAsRead`/`delete` girdi doğrulaması yok. Geçersiz ObjectId `new ObjectId()` içinde hata fırlatıyor (500). `markAsRead` sorgusu `{isDeleted:false}` ile, `delete` sorgusu `{}` ile başlıyor (tutarsız, MASTER_STATE #13). `rpc-input/` içinde NotificationService şeması yok. | `notification-service.ts:52-85` |
| N-13 | Sunucu sayfalaması yok. Merkez en yeni 200 kaydı alıp istemcide sayfalıyor. Arşiv kavramı yok. | `notification-service.ts:12-29`; `NotificationCenterView.vue` başlık yorumu |
| N-14 | `MailService.send` alıcı adresini açık metin logluyor ve `html` yoksa düz metni HTML olarak basıyor. Kuyruk, yeniden deneme, geçici/kalıcı hata ayrımı, `List-Unsubscribe` başlığı yok. Başarısız gönderim çağırana SMTP iletisiyle birlikte `Error` fırlatıyor. | `MailService.ts:32-48` |
| N-15 | Gerçek zamanlı iletim yok. Rozet 30 sn yoklamayla geliyor. Tek haneli ölçekte kabul edilebilir, ancak kritik bir uyarı 30 sn gecikebiliyor ve açık sekme sayısıyla orantılı boş istek üretiliyor. | `notificationDrawer.ts:15,89-119` |
| N-16 | Tercih yok: kategori × kanal, zorunlu kategoriler ve sessiz saatler. FE bunu bilinçli olarak B-07'ye bırakmış. | `NotificationCenterView.vue:16`; `PRODUCT_VALUE_PLAN.md` F-06/B-07 |
| N-17 | Şemada hem elle tanımlı `createdAt` hem `timestamps:true` var (çift tanım, zararsız). `metaData` Mixed ve sınırsız. | `Notification.ts:51,63-66` |
| N-18 | Impersonation davranışı tanımsız. Yönetici tenant olarak girince bildirimleri okundu yapabilir veya silebilir, bu da müşterinin gelen kutusunu değiştirir. | `notification-service.ts` (actor kontrolü yok) |

## 3. Korunacak doğru parçalar

- **Tenant DB'de saklama** (`Notifications`, tenant başına DB ile doğal izolasyon, ADR-0013) ve TTL indeksi ile otomatik silme mekanizması. Değişen yalnızca `expiresAt` değeri: artık önem ve kategoriye göre hesaplanıyor. Mevcut TTL indeksi aynen kalıyor.
- `{userId, isRead, createdAt}` indeksi: kullanıcı bazlı modele geçişte zaten doğru indeks.
- `mode` alanının koşullu zorunluluğu (ADR-0021 D2) ve `saveNotification` içindeki `await` düzeltmesi (GV-09).
- RPC adları ve yanıt şekilleri (`get`, `markAsRead`, `delete`, `getUnreadCount`). Yalnızca ekleme yapılıyor, FE kırılmıyor.
- Frontend C1.5: store deseni (rozet yoklaması, görünürlükte durma, çıkışta sıfırlama), merkez ekranı, `internalActionPath` güvenliği ve "dikkat" türlerinin üstte sabitlenmesi.
- `accountMailTemplates.ts` şablon deseni (bağımlılık yok, `esc`, `wrap`, kullanıcı verisi şablona konmuyor). Bildirim e-posta şablonları aynı desenle yazılır.
- `MailService` taşıyıcısı (havuzlu nodemailer). Üzerine yalnızca başlık, sınıflandırma ve log düzeltmesi eklenir.
- `NotificationEventBus`: süreç içi gerçek zamanlı yayının yerel adaptörü olarak yeniden kullanılır.
- `sendClientNotification` imzası: geriye uyum köprüsü olarak yaşamaya devam eder.

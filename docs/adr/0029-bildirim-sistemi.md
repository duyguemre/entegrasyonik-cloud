# 0029 — Bildirim sistemi: olay kataloğu, tek giriş noktası, kanallar, tercihler ve gerçek zamanlı iletim

## Durum
Kabul edildi (2026-09-30). Uygulama planı: `docs/NOTIFICATION_PLAN.md`. Denetim: `docs/audits/NOTIFICATION_AUDIT_2026-09-30.md` (N-01…N-18).

## Bağlam

Kullanıcı isteği: bildirim altyapısı yeniden ve doğru biçimde kurgulanacak. Doğru yapılmış parçalar kullanılacak, sonuç backend, frontend ve backoffice'te tam bir bildirim sistemi gibi çalışacak.

Denetimin ana bulguları (P0 yok):
- **N-01:** Bildirimler kullanıcı bazlı değil. `userId` yazılmıyor ve sorgularda süzülmüyor. Okundu durumu ortak, `delete {all}` tüm tenant için siliyor.
- **N-02:** Kritik bildirimler 3 günde siliniyor.
- **N-03:** Emit senkron ve dinleyici fire-and-forget. İdempotency ve yeniden deneme yok.
- **N-04:** E-posta kanalı yok. ADR-0008'in askıya alma e-postası karşılanmıyor.
- **N-05:** Ham `error.message` bildirim metnine giriyor.
- **N-06:** Platform yöneticisi kanalı yok (ADR-0017 K11).
- **N-07:** Kısma süreç içi bir `Map`.
- **N-08:** Gruplama yok.
- **N-09/N-10:** Düz Türkçe metin ve üç ayrı yerde kopyalanmış tür kümesi.

Doğru kurulmuş parçalar:
- tenant DB'de saklama ve TTL mekanizması,
- `{userId,isRead,createdAt}` indeksi,
- RPC yüzeyi,
- FE C1.5 (çekmece, merkez, rozet, güvenli `actionUrl`),
- `accountMailTemplates` deseni,
- havuzlu `MailService`.

İlgili kararlar ve bağlandıkları yerler:
- **ADR-0017 Karar 4:** `Alerts`, `AlertChannel`, tenant'a yalnızca R1/R2/R3/R8. Tenant e-postası tercihler gelene kadar kapalı.
- **ADR-0018 C10:** Bulgu tenant'a yalnızca triage sonrası iletilir.
- **ADR-0024:**
  - `operations/<alan>`, `services` yalnızca altyapıdır,
  - `platform|services → operations` yasak,
  - `saveNotification → operations/notifications`,
  - P2-MOVE donması.
- **ADR-0026:**
  - `/admin-api`, `surface`, step-up, impersonation bileti,
  - backoffice canlı log için polling seçildi,
  - B11 bakım modu.
- **ADR-0028:**
  - `Memberships`, izin kataloğu (`kaynak:eylem`), roller (owner/admin/operator/viewer/accountant),
  - `self:manage` (bildirim yetenekleri),
  - impersonation başlayınca sahip ve yöneticilere uygulama içi bildirim.
- **ADR-0006:** `APP_ROLE` web/worker/all. Bugün tek süreç (`all`) çalışıyor, fiziksel ayrım eşiği aktif tenant > 20.

**Yeniden yazım değil, refactor.** Tenant koleksiyonu, RPC'ler, FE ekranları ve e-posta taşıyıcısı korunur. Yalnızca üretim yolu (tek giriş noktası), alıcı modeli (kullanıcı bazlı) ve yeni kanallar eklenir. Clean-room yeniden yazım gerekçesi yoktur (ADR yazım standardı özel kuralı).

## Değerlendirilen Alternatifler

### A. Üretim yolu
1. **Olay yolu (EventEmitter) korunur, üstüne dinleyiciler eklenir.**
   - Artı: az değişiklik.
   - Eksi: emit senkron, hata ve await kayboluyor (N-03). İdempotency ve gruplama için dinleyicinin yine tek bir servise gitmesi gerekiyor. Ara katman değer katmıyor.
2. **Tek giriş noktası `notify(code, tenantId, params, opts)`, her çağıran doğrudan çağırır.** Ara katman yok, `await` edilebilir, sonuç döner.
   - Artı: tek sözleşme, test edilebilir, katalog doğrulaması derleme zamanında.
   - Eksi: 7 çağıranın göçü.
3. **Dış olay/bildirim servisi (Knock, Novu, Courier vb.).**
   - Artı: hazır tercih arayüzü ve teslim günlüğü.
   - Eksi: aylık maliyet, üçüncü tarafa tenant verisi (KVKK), yeni bağımlılık. Tek haneli ölçekte gereksiz.

### B. Alıcı ve saklama modeli
1. **Tenant başına tek belge + `readBy[]` dizisi.** Az belge üretir, ama okundu, arşiv ve sil işlemleri dizi güncellemesi ister. Rol bazlı hedefleme okuma anında çözülür ve sorgusu karmaşıklaşır.
2. **Yazımda alıcı başına bir belge (fan-out on write), tenant DB'de.** Mevcut `userId` alanı ve indeksi aynen kullanılır, sorgular basittir, okundu, arşiv ve sil kişiseldir. Maliyeti N kullanıcı × olay kadar belgedir (tenant başına 1-10 kullanıcı).
3. **Merkezi ApplicationDB koleksiyonu.** Backoffice'te okuması kolaydır, ancak tenant içeriği platform DB'sine taşınır ve ADR-0013'ün izolasyon ilkesiyle çelişir.

### C. Gerçek zamanlı iletim
1. **Yalnızca polling (bugünkü 30 sn).** Sıfır yeni altyapı gerektirir. Gecikme 30 sn'ye kadar çıkar ve açık sekme başına boş istek üretir. Ölçek tek haneli olduğu için yük önemsizdir.
2. **SSE "zil" (doorbell) + polling yedeği.** Sunucu yalnızca "yeni bildirim var" sinyalini (id + okunmamış sayısı) gönderir, istemci veriyi normal RPC ile çeker. HTTP/1.1 ve HTTP/2 ile çalışır, proxy ve Cloudflare dostudur, EventSource otomatik yeniden bağlanır, `Last-Event-ID` taşır, çerezle kimlik doğrular. Tek yönlüdür, bu da ihtiyaca yeter.
3. **WebSocket (socket.io/ws).** İki yönlüdür, ama bu ihtiyaç için gereksiz. Ayrı yükseltme yolu, ayrı kimlik doğrulama el sıkışması ve ayrı bağımlılık getirir. Cloudflare ve Railway'de çalışır, ama bakım yükü daha fazladır.
4. **Mongo change stream.** Replica set gerektirir (yerel standalone kurulumda yok) ve her web süreci için ayrı bir akış açar. Reddedildi.

### D. E-posta teslimi
1. **Senkron `mailService.send` notify içinde.** SMTP gecikmesi çağıranı bekletir, yeniden deneme yoktur, çökme anında gönderim kaybolur.
2. **BullMQ kuyruğu.** Hazır yeniden deneme ve DLQ sunar. Ancak üreticilerin bir kısmı `web` rolünde (`integration-service`) ve orada Redis zorunlu değil (ADR-0005 Karar 2). Redis kesintisinde bildirim e-postası kaybolur.
3. **Mongo outbox (`NotificationDeliveries`) + zamanlanmış gönderici (`defineJob`, kira/lease).**
   - Mevcut desenleri kullanır: katalog Mongo durum makinesi, `mongoLease`, `runJob`.
   - Redis gerekmez. Teslim günlüğü ile outbox aynı kayıttır.
   - Gecikme gönderici aralığı kadardır (15 sn).

## Karar

**Bildirimler, kodda tek bir olay kataloğundan tanımlanır ve tek bir giriş noktasından (`NotificationService.notify(code, tenantId, params, opts)`) üretilir. Üretimde idempotency, gruplama ve kısma ApplicationDB'deki bir olay defterinde (`NotificationEvents`) çözülür. Uygulama içi bildirim tenant DB `Notifications`'a alıcı başına bir belge olarak yazılır. E-posta, ApplicationDB'deki Mongo outbox'tan (`NotificationDeliveries`) zamanlanmış bir gönderici ile anında ya da özet olarak gider. Tercihler kategori × kanal matrisidir ve zorunlu kategoriler kapatılamaz. Gerçek zamanlı iletim SSE "zil" ile yapılır, polling yedektir. Süreçler arası yayılım `RealtimeBus` portu ile sağlanır: tek süreçte yerel `NotificationEventBus`, web ve worker ayrıldığında Redis pub/sub. Backoffice duyuru, teslim günlüğü, tenant bildirim geçmişi, şablon önizleme ve platform alarm kanalı alır. Mevcut `sendClientNotification` bir uyum köprüsü olarak `notify` üzerinden çalışmaya devam eder.**

### Karar 1 — Olay kataloğu (tek kayıt, kodda)
`backend/src/operations/notifications/catalog.ts`. Her giriş `defineNotification({...})` ile tanımlanır ve zod ile doğrulanır. Kayıt değişmezleri test edilir.

```ts
{
  code: 'STOCK_OVERSOLD',                          // SCREAMING_SNAKE, kalıcı; yeniden adlandırılmaz (alias ile)
  category: 'order'|'stock'|'integration'|'catalog'|'finance'|'billing'|'security'|'system',
  severity: 'info'|'success'|'warning'|'error'|'critical',
  mandatory: boolean,                               // true → uygulama içi + (varsa) e-posta kapatılamaz
  defaultChannels: { inApp: true, email: 'off'|'instant'|'digest' },
  audience: { permission: Permission,               // ADR-0028 izin anahtarı (ör. 'finance:read')
              fallbackMinTier: 'member'|'admin'|'owner',  // ADR-0028 Aşama 1 gelene kadar
              actorOnly?: boolean },                // yalnızca işlemi başlatan kullanıcıya (toplu işlem özeti)
  params: z.object({...}).strict(),                 // izinli parametreler; PII yasak (bkz. Karar 8), ≤ 2 KB
  template: { titleKey, bodyKey },                  // i18n anahtarları: notifications.events.<code>.{title,body}
  action?: (p) => '/orders?...' ,                   // yalnızca uygulama içi yol (FE internalActionPath ile de süzülür)
  dedupeKey?: (p) => string,                        // aynı olay asla iki kez (ör. satır kimliği)
  group?: { key: (p) => string, windowMs: number }, // pencere içinde tek kayıtta toplanır (sayaç)
  retention: 'short'|'standard'|'long',             // 14 / 30 / 90 gün (uygulama içi TTL)
  surface: 'tenant'|'platform',                     // platform = platformAdmin alıcıları (ADR-0017 kanalı)
  example: {...},                                    // şablon önizleme ve testler için örnek parametre
}
```

- **Kategoriler ve izinler:**

  | Kategori | İzin (ADR-0028) |
  |---|---|
  | `order` | `orders:read` |
  | `stock` | `stock:read` |
  | `integration` | `integrations:read` |
  | `catalog` | `catalog:read` |
  | `finance` | `finance:read` |
  | `billing` | `billing:read` |
  | `security` | hedefe göre `users:read`, ya da `self:manage` (kişisel) |
  | `system` | `app:use` |

  Katalog girişi kategorinin varsayılan iznini daha dar bir izinle ezebilir, genişletemez.
- **i18n:**
  - Uygulama içi bildirimde FE, `notifications.events.<code>.title/body` anahtarlarını `params` ile render eder.
  - Sunucu yazım anında `title/message` alanlarını TR olarak da doldurur (geriye uyum ve i18n anahtarı eksikse yedek).
  - E-posta sunucuda, alıcının diliyle (`NotificationPreferences.locale`, varsayılan `tr`) render edilir.
  - TR ve EN şablon dosyaları: `operations/notifications/templates/{tr,en}.ts`. Desen `accountMailTemplates.ts` ile aynıdır: bağımlılık yok, `esc`, `wrap`.
- **Tek kaynak:**
  - FE tür, kategori ve zorunluluk bilgisini `NotificationService/getCatalog`'dan okur. `NotificationTypes.ts` enum kopyası kalkar (N-10).
  - Backoffice katalog ve önizleme de aynı kaydı okur.
  - İlk sürüm tablosu: `docs/NOTIFICATION_PLAN.md` §2.

### Karar 2 — Üretim (tek giriş noktası)
- **Cephe (facade):** `backend/src/services/notification/NotificationService.ts` kalır (içe aktarma yolu değişmez, tüm katmanlar çağırabilir). `notify()` ve `sendClientNotification()` yöntemleri, bootstrap'ta enjekte edilen bir **sink**'e iletir: `operations/notifications/notify.ts`. Bu sayede ADR-0024'ün `services → operations` yasağı korunur, bugünkü `init(clientOperations)` enjeksiyon deseni de sürer. Sink yoksa (test, erken açılış) kayıt `warn` ile düşürülür.
- **İmza:**

  ```ts
  notify<C extends Code>(code: C, tenantId: number, params: ParamsOf<C>, opts?: {
    idempotencyKey?: string; recipients?: { userIds: string[] }; actorUserId?: string;
    occurredAt?: Date; corrId?: string }): Promise<{ status: 'created'|'grouped'|'duplicate'|'suppressed'|'skipped'|'failed'; eventId?: string }>
  ```

  Çağırana **asla hata fırlatmaz**. Hata loglanır ve `notifications.notify{code,result}` metriği artar (ADR-0017 MetricsRegistry).
- **Akış:**
  1. katalog ve `params` doğrulaması (zod; başarısızsa `failed`, log),
  2. `idemKey` hesabı,
  3. `NotificationEvents`'e `insertOne`. Tekil ihlali (11000) → `duplicate`, sayaç `$inc`,
  4. grup penceresi açıksa ilgili kayıtta `$inc count` + `lastOccurredAt` → `grouped`,
  5. alıcı çözümü (Karar 5),
  6. uygulama içi yazım (tenant DB),
  7. e-posta teslimi gerekiyorsa `NotificationDeliveries`'e `pending` kayıt,
  8. `RealtimeBus.publish`.
- **İdempotency:** `idemKey = opts.idempotencyKey ?? code:tid:dedupeKey(params)`. Grup penceresi için `code:tid:groupKey:floor(t/windowMs)` kovası kullanılır. Kısma (OrderWorker'daki saatlik sınır, N-07) böylece kalıcı ve çok süreç güvenli olur, süreç içi `Map` kalkar.
- **Gruplama ve özet:**
  - Uygulama içinde pencere içindeki tekrarlar tek belgede toplanır: `count`, `lastOccurredAt`, son `params`. FE bunu "×23 · son 1 saat" olarak gösterir.
  - E-postada grubun ilk olayı anında gider (`instant` ise). Pencere kapanınca `count > 1` ise tek bir özet satırı çıkar.
  - Kullanıcının seçtiği `digest` modunda tüm e-postalar saatlik ya da günlük tek iletide toplanır.
- **Olay yolu:** Domain modülleri `notify`'ı doğrudan çağırır. `IntegrationEventBus` iç sinyal olarak kalır ve kullanıcıya dönük olay taşımaz. `NotificationEventBus` yerel `RealtimeBus` adaptörüne dönüşür (Karar 6). `UI_NOTIFY` sabiti silinir.

### Karar 3 — Veri modeli ve saklama
Aşağıdaki yeni koleksiyonlar ve indeksler **yalnızca önerilir**. Oluşturulmaları DB değişikliğidir: `CLAUDE.md` kural 3 (yedek) ve Protokol 12 uygulanır. Yerelde mongoose `autoIndex` bile yedek doğrulandıktan sonra açılır.

**Tenant DB `Notifications` (mevcut, yalnızca ekleme):**
- Yeni alanlar: `code`, `category`, `params` (≤2 KB), `eventId`, `groupKey`, `count` (varsayılan 1), `lastOccurredAt`, `isArchived`, `archivedAt`.
- `userId` artık **her zaman** yazılır.
- `expiresAt`, `retention` değerinden hesaplanır: short 14 gün, standard 30 gün, long 90 gün. Mevcut TTL indeksi aynen kalır.
- `severity` kümesine `critical` eklenir. `danger` okunurken `error` sayılır.
- Yeni indeks gerekmez: kullanıcı listesi, okunmamış sayımı ve grup araması `{userId,isRead,createdAt}` önekiyle karşılanır.

**ApplicationDB `NotificationEvents` (yeni, defter):**
- Alanlar: `{ _id, tid, code, category, severity, idemKey, groupKey?, bucket?, params (izinli, PII'siz), recipientCount, inAppCount, emailQueued, suppressedCount, source:{module, corrId}, createdAt, expAt }`
- İndeksler: `uniq {idemKey:1}`, `{tid:1, createdAt:-1}`, `{code:1, createdAt:-1}`, TTL `{expAt:1}` (30 gün).

**ApplicationDB `NotificationDeliveries` (yeni, outbox ve teslim günlüğü):**
- Alanlar: `{ _id, eventId, tid, userId, channel:'email'|…, mode:'instant'|'digest', digestAt?, status:'pending'|'sending'|'sent'|'failed'|'dead'|'skipped'|'suppressed', attempts, nextAttemptAt, leaseUntil?, lastErrorCode?, providerMessageId?, createdAt, sentAt?, expAt }`
- E-posta adresi **saklanmaz**. Gönderim anında `Users`'tan çözülür.
- İndeksler: `{status:1, nextAttemptAt:1}`, `{tid:1, createdAt:-1}`, `{eventId:1}`, TTL (30 gün).

**ApplicationDB `NotificationPreferences` (yeni):**
- Alanlar: `{ tid, userId|null (null = tenant varsayılanı), locale:'tr'|'en', matrix:{<category>:{inApp:boolean, email:'off'|'instant'|'digest'}}, digest:{cadence:'hourly'|'daily', hourLocal:9}, quietHours?:{start:'22:00', end:'08:00', tz:'Europe/Istanbul'}, updatedAt, updatedBy }`
- İndeks: `uniq {tid:1, userId:1}`.

**ApplicationDB `Announcements` (yeni, backoffice):** Karar 7.

**Okunmamış sayacı:** `countDocuments({userId, isRead:false, isDeleted:false, isArchived:{$ne:true}})` indeksle yapılır. Önbellek yok. Sayı SSE zilinde de taşınır.

**Sayfalama:** `get` isteğine `cursor` (son `_id`) + `limit ≤ 50` eklenir, yanıta `nextCursor` gelir. Mevcut `limit ≤ 200` davranışı cursor gönderilmediğinde aynen kalır.

### Karar 4 — Kanallar
- **Kanal adaptör arayüzü** (`operations/notifications/channels/ChannelAdapter.ts`):

  ```ts
  deliver(batch: DeliveryItem[], ctx): Promise<Result[]>
  ```

  Sonuç `sent`, `transient` (yeniden dene) ya da `permanent` (dead) olur. Yeni kanal tek dosyadır. ADR-0017'nin `AlertChannel` arayüzü bu arayüzün platform tarafıdır, ayrı bir icat yapılmaz.
- **Uygulama içi:** senkron yazım (notify içinde, tenant DB). Durumlar: okundu/okunmadı, arşiv, sil (soft). Hepsi kişiseldir.
- **E-posta:**
  - Gönderici: `defineJob('notifications.email', 15 sn, worker rolü, lease)` `pending` kayıtları kiralar ve gönderir.
  - Yeniden deneme: 1 dk → 5 dk → 30 dk → 2 sa → 6 sa. 5 denemeden sonra `dead` olur (ölü mektup).
  - Kalıcı SMTP hataları (5xx) doğrudan `dead` olur.
  - Özet işi: `notifications.digest` 5 dakikada bir çalışır, zamanı gelen `digest` kayıtlarını kullanıcı başına tek iletide toplar.
  - Sessiz saatler yalnızca zorunlu olmayan anında e-postayı saat bitimine erteler.
  - `MailService` şunları kazanır: `sendMessage({to, subject, text, html, headers})` → `{messageId}`; hata sınıflandırması; logda alıcı maskesi.
  - Her iletide şunlar bulunur: `List-Unsubscribe` (RFC 8058 tek tık POST) ve tercih bağlantısı `PUBLIC_APP_URL/settings/notifications`.
  - Abonelikten çıkma belirteci: HMAC imzalı `{tid, uid, category, exp}` (anahtar env, `FIELD_ENCRYPTION_KEYS` türetmesi değil, ayrı `NOTIFY_UNSUB_SECRET`). Zorunlu kategoride bağlantı yoktur, altbilgi "hizmet bildirimi" der.
  - Gönderim `NOTIFY_EMAIL_ENABLED` bayrağıyla açılır. Varsayılan `false`: yerelde ve canlı SMTP onayına kadar kayıtlar `skipped:disabled` olur. Geliştirme ve testte sahte taşıyıcı kullanılır.
- **Hesap akışı e-postaları kapsam dışıdır:** parola sıfırlama ve e-posta doğrulama `AccountLifecycleService`'te kalır, çünkü belirteç taşırlar ve bu belirteçler outbox'a yazılmaz. "Parola değişti" iletisi `SECURITY_PASSWORD_CHANGED` olarak katalogdan da üretilir (uygulama içi + e-posta, zorunlu). Mevcut doğrudan e-posta çift gönderimi önlemek için o koda taşınır.
- **İleride:**
  - Web push: mobil/PWA ADR'si ile.
  - Tenant webhook ve Slack: ilk müşteri talebiyle. Her biri tek adaptör ve tercih matrisinde yeni bir sütundur.

### Karar 5 — Alıcı çözümü ve tercihler
- **Alıcılar:**
  - `opts.recipients` verildiyse onlar kullanılır. Aksi hâlde `actorOnly && actorUserId` ise aktör alıcıdır.
  - İkisi de yoksa tenant'ın aktif üyeleri arasından `permission` iznine sahip olanlar seçilir. ADR-0028 Aşama 1'e kadar kademe kullanılır: `resolveTier` ≥ `fallbackMinTier`.
  - Üye listesi süreç içi LRU'da tutulur (30 sn, ADR-0028 `MembershipCache` gelince o kullanılır).
  - Impersonation aktörü (`imp:true`) hiçbir zaman e-posta alıcısı olamaz. Aktörün tetiklediği `actorOnly` bildirim tenant sahip ve yöneticilerine, yalnızca uygulama içi olarak yönlendirilir.
- **Kanal kararı:**
  - `mandatory` → uygulama içi her zaman açıktır. E-posta katalogdaki varsayılanla gider ve kapatılamaz, ancak `instant` yerine `digest` seçilebilir (kritik olanlar hariç).
  - Değilse şu sırayla çözülür: kullanıcı tercihi → tenant varsayılanı → katalog varsayılanı.
- **Zorunlu küme (v1):**
  - `security` kategorisinin tamamı,
  - `billing` kategorisinde deneme bitişi, askı uyarısı ve askı,
  - `STOCK_OVERSOLD`, `STOCK_UNMAPPED_LINE`, `STOCK_COMPENSATION_MANUAL`,
  - `INTEGRATION_AUTH_FAILED`.

  PRODUCT_VALUE_PLAN F-06 ile uyumludur.
- **E-posta alıcısı** doğrulanmış olmalıdır (`Users.emailVerified`). Zorunlu `security` ve `billing` kategorileri bunun istisnasıdır. Doğrulanmamış adres için teslim kaydı `skipped:unverified` olur.
- **Tenant varsayılanları** owner ve admin tarafından düzenlenir (`settings:manage`). Kullanıcı kendi matrisini düzenler (`self:manage`).

### Karar 6 — Gerçek zamanlı iletim (SSE zili)
- **Uç:** `GET /api/notifications/stream`. Bir HTTP rotasıdır, RPC değildir. Yetenek kaydında `notifications.stream` olarak yer alır: `scope:'user'`, `self:manage`, `mcp: PLUMBING`.
- **Kimlik doğrulama ve güvenlik:**
  - Normal `authenticate` ara katmanı (çerez) ve Origin denetimi uygulanır.
  - Bağlantı `{tid, userId, tokenVersion}` ile etiketlenir.
  - Sunucu bağlantıyı **30 dakikada bir kapatır**. İstemci yeniden bağlanır ve kimlik yeniden doğrulanır, böylece `tokenVersion` iptali ve oturum süresi uygulanır.
- **Yanıt:**
  - Başlıklar: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
  - Sıkıştırma bu rotada kapalıdır.
  - 25 sn'de bir yorum satırı (`: ping`) gönderilir. Cloudflare'in 100 sn boşta kalma sınırının altındadır.
  - `retry: 5000`.
- **Olaylar:**
  - `event: notification`, `id: <Notifications._id>`, `data: {"unread":7,"category":"stock","severity":"critical"}`.
  - `event: announcement` (yalnızca id).
  - `event: sync` (yeniden bağlanmada `Last-Event-ID`'den sonra kaçırılan varsa).
  - **Başlık, metin ve parametre gönderilmez.** İstemci `NotificationService/get {afterId}` ile çeker. Yetki yolu RPC'de kalır ve SSE kanalı PII taşımaz.
- **Sınırlar:** kullanıcı başına 5, süreç başına 500 eşzamanlı bağlantı. Aşılırsa 503 döner ve istemci polling'e geçer.
- **Yayılım (`platform/runtime/realtime/RealtimeBus.ts`):**
  - Arayüz: `publish({tid, userIds, kind, id, meta})` ve `subscribe(handler)`.
  - Yerel adaptör: `NotificationEventBus`. `APP_ROLE=all` iken varsayılandır.
  - Redis adaptörü: ioredis `duplicate()` abonesi, kanal `ntf:v1`. Web ve worker ayrı süreçteyse ya da `NOTIFY_REALTIME_BUS=redis` ise kullanılır.
  - Redis yoksa yayın sessizce düşer. Veri kaybı olmaz, istemci güvenlik yoklamasıyla yakalar.
  - Mesaj yalnızca kimlik ve sayı içerir.
- **Tenant izolasyonu:** Süzme sunucuda, bağlantı düzeyinde yapılır: `evt.tid === conn.tid && evt.userIds.includes(conn.userId)`. İstemci kanal ya da tenant seçemez. Test: A tenant'ının olayı B'nin bağlantısına asla yazılmaz.
- **FE yedeği:**
  - SSE bağlıyken rozet yoklaması 5 dakikaya iner (güvenlik ağı).
  - Bağlı değilken bugünkü 30 sn yoklama sürer.
  - Sekme gizliyken bağlantı 60 sn sonra kapatılır ve sekme görünür olunca yeniden açılır.
  - Electron ve web aynı kodu kullanır.
- **Backoffice SSE kullanmaz:** Platform alarm paneli 30 sn polling ile çalışır (ADR-0026 Karar 7.5 ile tutarlı).

### Karar 7 — Backoffice
- **Duyurular (`Announcements`, ApplicationDB):**
  - Alanlar: `{ _id, kind:'info'|'maintenance'|'incident'|'release', severity, title:{tr,en?}, body:{tr,en?}, target:{mode:'all'|'plans'|'tenants', planCodes?, tids?}, audience:'all_members'|'owners_admins', channels:{banner:boolean, inApp:boolean, email:boolean}, startsAt, endsAt, dismissible, status:'draft'|'scheduled'|'active'|'ended'|'cancelled', createdBy, updatedBy, createdAt }`
  - Banner okuma yoluyla gösterilir, fan-out yapılmaz: tenant tarafında `AnnouncementService/getActive` (`app:use`) giriş anında, 5 dakikada bir ve SSE `announcement` olayında çağrılır. Kapatılan duyurular istemcide (localStorage, kullanıcı ve duyuru anahtarıyla) tutulur. `maintenance` ve `incident` türleri kapatılamaz.
  - `inApp` açıksa `notifications.announcements` işi `startsAt` anında hedef tenant'lar için `notify('SYSTEM_ANNOUNCEMENT', tid, {announcementId})` çağırır. İdempotency anahtarı `announcementId:tid`'dir.
  - `email: true` toplu gönderimdir: step-up ve gerekçe ister (ADR-0026 Karar 4.6). Yalnızca hizmet duyurusu olabilir, pazarlama içeriği yasaktır (insan kararı, §S5).
  - Bakım duyurusu: ADR-0026 B11 `maintenance.enabled` açıkken banner, `maintenance.message` ile otomatik gösterilir (ayrı kayıt gerekmez). Planlı bakım önceden `kind:'maintenance'` duyurusuyla ilan edilir.
- **Platform alarmları:**
  - ADR-0017 `AlertEvaluator` şunu çağırır: `platformNotify(code, params)`. Katalogda `surface:'platform'` kodları `PLATFORM_ALERT_FIRING`, `PLATFORM_ALERT_RESOLVED`, `PLATFORM_ALERT_DIGEST`, `PLATFORM_DELIVERY_DEAD_LETTERS` ve `PLATFORM_COMPLIANCE_FINDING` olarak tanımlıdır.
  - Uygulama içi karşılık ADR-0017'nin `Alerts` paneli olarak kalır, ikinci bir kopya yazılmaz.
  - E-posta aynı outbox'tan `ALERT_EMAIL_TO` alıcılarına gider. `userId` yerine `platformRecipient` kullanılır.
  - Histerezis, susturma ve fırtına koruması ADR-0017'de kalır.
  - Tenant'a dönük R1/R2/R3/R8 kuralları ilgili tenant kodlarını (`INTEGRATION_ERROR_RATE_HIGH`, `INTEGRATION_AUTH_FAILED`, `INTEGRATION_CIRCUIT_OPEN`, `ORDER_SYNC_LAGGING`, `STOCK_OVERSOLD_UNRESOLVED`) `notify` ile üretir.
  - ADR-0018 bulgusu tenant'a yalnızca triage sonrası `INTEGRATION_CHANGE_NOTICE` olarak gider.
- **Backoffice uçları:** `BackofficeNotificationService`, `surface:'backoffice'`, `platformAdmin`, zod girdi, `limit ≤ 200`, imleç sayfalama.
  - Duyuru: `list`, `get`, `create`, `update`, `schedule`, `cancel`, `preview`.
  - Teslim: `getDeliveryStats` (kanal × durum × kod, 24 sa ve 7 gün), `listDeliveries` (filtre: durum, kanal, tid, kod), `retryDelivery` ve `discardDelivery` (gerekçe zorunlu, audit).
  - Tenant geçmişi: `getTenantHistory {tid, cursor}`. `NotificationEvents` meta verisi döner, tenant bildirim içeriği dönmez. Yetenek `pii:'masked'`, `backoffice.sensitive_read` audit ile.
  - Katalog: `getCatalog` ve `previewTemplate {code, locale, channel, params?}`. `example` parametreleriyle render eder, gönderim yapmaz.
  - `sendTestEmail`: yalnızca yöneticinin kendi adresine, step-up ile. SMTP doğrulaması içindir.
- **Menü:** ADR-0026 Karar 5'e yeni bir grup eklenir: "Bildirimler ve duyurular" (Duyurular · Teslim günlüğü · Olay kataloğu ve önizleme). Tenant detayına "Bildirim geçmişi" sekmesi gelir. Backoffice plan sahibi bu satırı `BACKOFFICE_PLAN.md` §1.2'ye ekler.

### Karar 8 — Güvenlik ve gizlilik
- **Tenant izolasyonu:**
  - Uygulama içi veri tenant DB'sindedir (seçim doğrulanmış principal'dan yapılır, mevcut).
  - SSE süzmesi sunucudadır (Karar 6).
  - Backoffice tenant geçmişi yalnızca meta veri döner.
  - `userId` süzmesi her okuma ve yazma sorgusunun **zorunlu** parçasıdır. Depo işlevleri (`inAppRepository`) `userId` olmadan çağrılamaz.
- **PII minimizasyonu:**
  - `params` şeması izinli alanlarla sınırlıdır (`strict`): kimlikler, sayılar, entegrasyon kodu, SKU/barkod, sipariş numarası.
  - Müşteri adı, adres, telefon, e-posta ve ham hata metni **yasaktır**. Kayıt değişmez testi alan adlarını yasak listeye karşı denetler.
  - `NotificationEvents` ve `NotificationDeliveries` tenant içeriği ya da e-posta adresi tutmaz.
- **E-postada sır yok:** Şablonlar yalnızca katalog `params`'ından beslenir. Belirteç, parola ve API anahtarı içeremez; bunu statik test denetler (şablon çıktısında `enc:v1:`, `token=` ve benzeri desen yok). Bağlantılar `PUBLIC_APP_URL` tabanlıdır.
- **Hata metni:** Kullanıcıya giden bildirimde `error.message` kullanılmaz. Hata kodu (`AppError.code`/`IntegrationError.code`) ve destek kodu (`corrId`) taşınır. N-05 bu kuralla kapanır.
- **Impersonation:**
  - Destek oturumu tenant'ın bildirim listesini **salt okunur, birleşik görünüm** olarak görür: tenant üyelerine yazılmış kayıtlar `eventId` üzerinden tekilleştirilir.
  - `markAsRead`, `archive`, `delete` ve tercih yazımı `403 IMPERSONATION_READ_ONLY` döner. Müşterinin gelen kutusu değişmez (N-18).
  - SSE açılabilir.
  - Oturum başladığında `SECURITY_SUPPORT_ACCESS_STARTED` sahip ve yöneticilere uygulama içi bildirim olarak gider (ADR-0028 §9). Varsayılan e-posta kapalıdır (insan kararı).
- **Kötüye kullanım:**
  - Kullanıcı `notify` tetikleyemez. Tek istisna kendi işleminin özetidir (`actorOnly`).
  - Duyuru ve test e-postası yalnızca backoffice'ten gönderilir.
  - Abonelikten çıkma ucu açıktır (imzalı belirteç, `exp`) ve hız sınırlıdır (`createRateLimiter`).

### Karar 9 — Geriye uyum ve göç
- `sendClientNotification(event)` kalır ve `notifyLegacy(event)` üzerinden çalışır. Eşleme şöyledir: `metaData.code` katalogda varsa o kod kullanılır. Yoksa `LEGACY_<type>` kodu kullanılır (düz `title/message` metnine izin veren tek kod ailesi; alıcı tenant'ın tüm üyeleri; yalnızca uygulama içi; `retention:'standard'`). Böylece göç edilmemiş çağıranlar bozulmaz.
- 7 çağıran (denetim §1) sırayla `notify(code, ...)`'e taşınır (plan NB3). `OrderWorker` içindeki `overflowNotifiedAt` `Map`'i kaldırılır ve yerini katalog `group` penceresi alır. `integration-service` hata dalı hata kodu taşır.
- **Eski belgeler** (`userId` yok):
  - Geçiş sürümünde liste ve sayım sorgusu `{$or:[{userId}, {userId:{$exists:false}}]}` biçimindedir. Eski belgeler 3 günlük TTL ile kendiliğinden biter.
  - `NOTIFY_LEGACY_VISIBLE_UNTIL` tarihinden sonra (dağıtım + 4 gün) `$or` kalkar.
  - **Veri göçü yoktur.**
- RPC yanıt şekilleri yalnızca ekleme yapar: `nextCursor`, `code`, `category`, `params`, `count`. FE C1.5 kodu değişmeden çalışır.
- `ClientOperations.saveNotification` kalkar (ADR-0024 D5 hedefi). Yerine `operations/notifications/inAppRepository.ts` gelir. ADR-0024'teki `saveNotification.ts` dosya adı bu depo dosyasıyla karşılanır.
- **Sıra kısıtı:** ADR-0024 P2-MOVE (donma) sırasında `api/services/**` dosyalarına dokunan NB4 ve NB7 paketleri başlatılmaz. Önce ya da sonra yapılır.

## Gerekçe

- **Maliyet bilinci (tek haneli tenant, tenant başına 1-10 kullanıcı):**
  - Yeni servis ve yeni üretim bağımlılığı yoktur. SSE Express ile yazılır, e-posta mevcut nodemailer ile gider, pub/sub mevcut ioredis ile yapılır, zamanlama mevcut `defineJob` ve lease ile yapılır.
  - Redis pub/sub, bugün tek süreçte (`all`) devreye girmez.
  - Fan-out on write, bu ölçekte olay başına en fazla 10 belge demektir ve sorguları en basit hâlde tutar.
  - Mongo outbox, web rolünde Redis zorunluluğu yaratmaz ve teslim günlüğünü bedava verir.
- **SSE, polling'e göre** kritik uyarıyı (aşırı satış, kimlik hatası) saniyeler içinde gösterir ve boş yoklamayı kaldırır. Bunu "zil" biçiminde yapar: veri ve yetki yolu RPC'de kalır, SSE yalnızca bir işaret taşır. Bu yüzden güvenlik yüzeyi küçüktür ve SSE koparsa sistem polling ile aynen çalışır.
- **WebSocket** iki yönlü ihtiyaç olmadığı için gereksiz karmaşıklıktır.
- **Katalog + tek giriş noktası**, N-03, N-05, N-07, N-08, N-09 ve N-10'u tek yerde çözer. Ayrıca ADR-0019'un "tek kayıt" ilkesiyle ve ADR-0028'in izin kataloğuyla aynı biçimdedir: kodda tanım, testte değişmez, FE'ye uçla aktarım.
- **Dış bildirim servisi** reddedildi: maliyet, KVKK veri işleyen sözleşmesi ve bu ölçekte getirisinin olmaması.

## Maliyet/Ölçek Notu

- **Ek maliyet:**
  - 0 yeni servis, 0 yeni üretim bağımlılığı.
  - 4 yeni ApplicationDB koleksiyonu. Tahmini hacim: günde < 5.000 olay ve < 1.000 teslim, 30 günde < 50 MB.
  - Web sürecinde açık SSE bağlantıları: kullanıcı × sekme, onlarca.
  - Operasyon yükü: canlı SMTP ve SPF/DKIM/DMARC (zaten bekleyen insan kararı), ölü mektup izleme (backoffice teslim günlüğü + `PLATFORM_DELIVERY_DEAD_LETTERS`).
- **Yeniden değerlendirme eşikleri:**
  - Günlük e-posta > **2.000**, **ya da** `pending` teslimlerin en eskisi p95 > **2 dk** (7 gün) → SMTP yerine işlem e-postası API'si (SES/Postmark) ve/veya BullMQ kuyruğu.
  - Süreç başına eşzamanlı SSE bağlantısı > **300**, **ya da** web replikası > **1** → Redis adaptörü zorunlu (rol ayrımında zaten açılır). > **2.000** → ayrı gerçek zamanlı süreç ya da yönetilen servis değerlendirilir.
  - `getUnreadCount` p95 > **50 ms**, **ya da** kullanıcı başına bildirim belgesi > **50.000** → sayaç belgesi ya da Redis sayacı ile yeni indeks.
  - Aktif tenant > **50**, **ya da** tenant başına kullanıcı > **25** → fan-out on write yerine tenant geneli olaylar için okuma anında birleştirme (seçenek B1) değerlendirilir.
  - Gruplama sonrası kullanıcı başına günlük uygulama içi bildirim medyanı > **50** → katalog varsayılanları ve grup pencereleri yeniden ayarlanır.
  - İlk ödeme yapan müşteri Slack ya da webhook isterse → adaptör eklenir.

## Etki Alanı

**Backend:**
- `services/notification/{NotificationService,NotificationEventBus}.ts`
- yeni `operations/notifications/**`:
  - `catalog`, `notify`, `audience`, `preferences`, `inAppRepository`, `ledger`
  - `channels/*`, `templates/*`, `jobs/*`, `announcements`, `unsubscribe`
- yeni `platform/runtime/realtime/*`
- yeni `api/http/{notificationStream,notificationUnsubscribe}.ts`
- `api/services/notification-service.ts` ve yeni `announcement-service.ts`, `backoffice-notification-service.ts`
- `capabilities/domains/{account,platform}.ts`, `capabilities/rpc-input/*`
- `services/mail/MailService.ts`
- `database/client/models/Notification.ts`
- yeni `database/application/models/{NotificationEvent,NotificationDelivery,NotificationPreference,Announcement}.ts` ve kayıtları
- `bootstrap/{app,schedules,http}.ts`
- 7 çağıran:
  - `integration-service.ts`
  - `ImportOrchestrator.ts`
  - `OrderWorker.ts`
  - `TrialExpiryJob.ts`
  - `PostOrderOperations.ts`
  - `OversellCompensationJob.ts`
  - `AccountLifecycleService.ts` (parola değişti)
- `operations/client/ClientOperations.ts` (kaldırılır)
- `interfaces/common/index.ts`

**Frontend:**
- `stores/notificationDrawer.ts`
- yeni `composables/useNotificationStream.ts`
- `views/secure/NotificationCenterView.vue`
- `components/user/NotificationDrawerComponent.vue`
- `types/NotificationTypes.ts`
- yeni tercih ekranı ve `/unsubscribe` sayfası
- duyuru bandı (kabuk)
- i18n `notifications.events.*`

**Backoffice:**
- Bildirimler ve duyurular grubu
- tenant detayında "Bildirim geçmişi" sekmesi

**İlişkili ADR'ler:** 0005, 0006, 0008, 0013, 0017 (K11 ve Karar 4 kanalları bu ADR'ye bağlanır), 0018, 0019, 0021, 0023, 0024, 0026, 0028.

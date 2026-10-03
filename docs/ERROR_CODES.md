# Hata kodları kataloğu

> Bu dosya `backend/src/platform/core/errors/codes.ts` dosyasından ÜRETİLİR; elle düzenlemeyin.
> Güncelleme: `UPDATE_ERROR_CODES=1 npx jest tests/unit/platform/errorCodes.docs.test.ts` (backend/).

## Yanıt zarfı (RPC, FE sözleşmesi korunur)

Hata yanıtı gövdesi: `{ "error": "<ileti>", "code": "<KOD>", "requestId": "<X-Request-Id>", "service": "...", "operation": "..." }`.

- `error` **string olarak kalır** (geriye uyum); `code` ve `requestId` yalnızca EKLENMİŞ alanlardır. FE ileti eşlemesi `code`'a göre yapılmalı, `error` metni yedektir.
- Her yanıtta (başarı ve hata) `X-Request-Id` başlığı vardır; gövdedeki `requestId` ile aynıdır. Destek talebine bu kod yapıştırılır.
- **Beklenmeyen (kataloğa/`AppError`'a çevrilmemiş) hatalar 500 döner; ileti maskelenir** ("Beklenmeyen bir hata oluştu."), ayrıntı yalnızca sunucu logunda `requestId` ile bulunur.
- Bilinçli üretilmiş 4xx hatalarında (`ApplicationError`/`AppError`) ileti olduğu gibi döner.
- **Girdi doğrulama hatası (`VALIDATION`, 400; ADR-0023):** ek olarak `"fields": [{ "path": "user.email", "message": "geçersiz biçim" }]` döner. `message` sabit koddan üretilir; gövde DEĞERLERİ yansıtılmaz (yalnız izin verilmeyen alan ADLARI).

## Genel kodlar

| Kod | HTTP | Varsayılan ileti | Anlam |
|---|---|---|---|
| `VALIDATION` | 400 | Geçersiz istek. | Girdi doğrulaması başarısız (eksik/yanlış tipli/aralık dışı alan). |
| `UNAUTHENTICATED` | 401 | Oturum gerekli. | Kimlik doğrulanamadı (token yok/geçersiz/süresi dolmuş). |
| `FORBIDDEN` | 403 | Bu işlem için yetkiniz yok. | Kimlik doğrulandı ama kademe/rol/tenant kuralı işleme izin vermiyor (ADR-0001). |
| `NOT_FOUND` | 404 | Kayıt bulunamadı. | İstenen kaynak yok ya da bu tenant için görünür değil. |
| `PAYLOAD_TOO_LARGE` | 413 | İstek gövdesi çok büyük. | İstek gövdesi üst sınırı (JSON 10 MB; istemci günlüğü 8 KB) aştı. |
| `CONFLICT` | 409 | İşlem mevcut durumla çakışıyor. | Eşzamanlı değişiklik / benzersizlik ihlali. |
| `RATE_LIMITED` | 429 | Çok fazla istek. Lütfen biraz bekleyin. | Rate limit aşıldı; `Retry-After` başlığı beklenecek saniyeyi verir. |
| `QUOTA_EXCEEDED` | 403 | Plan kotanız doldu. | Abonelik planının sayısal sınırı aşıldı (ADR-0008 EntitlementService). |
| `PLAN_REQUIRED` | 402 | Bu özellik mevcut planınızda yok. | Özellik daha üst bir plan gerektiriyor (ADR-0008). |
| `SUBSCRIPTION_RESTRICTED` | 403 | Aboneliğiniz bu işlem için yeterli erişime sahip değil. | ADR-0008 §3 durum makinesi: `EntitlementService.checkAccess` reddetti (suspended/canceled/expired/no_subscription); asıl neden `error` alanındadır. Yalnızca `ENTITLEMENT_GUARD_ENABLED=true` iken üretilir. |
| `REAUTH_REQUIRED` | 401 | Bu işlem için yeniden doğrulama gerekli. | Backoffice adım-yükseltmesi (ADR-0026 Karar 4.6): destructive/hassas işlem son 5 dk içinde parola + TOTP ile yeniden doğrulama ister. İstemci `BackofficeAuthService/reauth` çağırıp isteği yenilemelidir. |
| `MFA_REQUIRED` | 403 | İki adımlı doğrulama gerekli. | Backoffice oturumu TOTP tamamlanmadan (parola sonrası yarım oturum) ya da kayıt (enrollTotp/confirmTotp) yapılmadan bir operasyon çağırdı (ADR-0026 Karar 4.5). |
| `IMPERSONATION_UNAVAILABLE` | 503 | Impersonation şu an kullanılamıyor. | Tek kullanımlık bilet Redis gerektirir (ADR-0026 Karar 4.9); Redis hazır değilse bilet üretilmez/tüketilmez. |
| `ADMIN_API_ONLY` | 403 | Bu işlem yalnızca yönetim uygulamasından yapılabilir. | ADMIN_API_ONLY=true iken platformAdmin işlemleri, ga girişi ve selectStore `/api` üzerinde kapalıdır; yönetim uygulaması üzerinden yapılır (ADR-0026 Aşama 3). |
| `ADMIN_SELF_ACTION` | 403 | Bu işlemi kendi hesabınız üzerinde yapamazsınız. | Backoffice yönetici yönetimi (B12): platform yöneticisi kendi hesabını kapatamaz/MFA kaydını sıfırlayamaz (başka bir yönetici yapmalı; acil durum: yerel betik). |
| `LAST_PLATFORM_ADMIN` | 409 | Son aktif platform yöneticisi kapatılamaz. | Backoffice yönetici yönetimi (B12): işlem sonrası hiç aktif platform yöneticisi kalmayacaktı; önce başka bir yönetici davet edilip etkinleştirilmelidir. |
| `QUEUE_UNAVAILABLE` | 503 | Kuyruk şu an kullanılamıyor. | Backoffice motor uçları (B7): Redis hazır değil; BullMQ kuyruğuna erişilemiyor (getQueues bunun yerine available:false döner). |
| `JOB_NOT_FOUND` | 404 | İş bulunamadı. | Backoffice motor uçları (B7): kuyrukta ya da durum makinesi koleksiyonunda (ExportSignals/ImportJobs) bu kimlikle kayıt yok. |
| `JOB_NOT_FAILED` | 409 | İş başarısız durumda değil. | Backoffice retryJob/discardJob (B7): yalnız failed durumundaki kuyruk işi yeniden denenebilir/silinebilir; aktif/bekleyen/tamamlanmış iş reddedilir (yanıtta güncel durum yazar). |
| `LEASE_NOT_STUCK` | 409 | Kira takılı değil. | Backoffice releaseStuckLease (B7): kira süresi henüz dolmamış (sağlıklı pod tutuyor) ya da zaten bırakılmış; sağlıklı kiraya dokunulmaz. |
| `ADMIN_INVITE_EXISTING_USER` | 409 | Bu e-posta adresi zaten bir kullanıcıya ait. | Backoffice yönetici daveti (B12): e-posta mevcut bir kullanıcıya (tenant kullanıcısı ya da yönetici) aittir. Güvenli varsayılan: mevcut kullanıcıya platform yöneticiliği VERİLMEZ; ayrı bir e-posta adresi kullanılmalıdır. |
| `ADMIN_INVITE_INVALID` | 400 | Davet bağlantısı geçersiz veya süresi dolmuş. | Backoffice yönetici daveti kabulü (B12): token biçimi/özeti/süresi/kullanım durumu geçersiz (hangisi olduğu ayrıştırılmaz). Yeni davet istenmelidir. |
| `ADMIN_INVITE_UNAVAILABLE` | 503 | Yönetici daveti şu an gönderilemiyor. | Backoffice yönetici daveti (B12): backoffice adresi (ADMIN_CORS_ORIGINS ilk girdisi) yapılandırılmamış ya da e-posta gönderilemedi; davet kaydı geri alınır/yeniden gönderilebilir. |
| `INFRA_UNAVAILABLE` | 503 | Altyapı şu an okunamıyor. | Backoffice altyapı/entegrasyon gözlem uçları (B5/B6/B8): Redis hazır değil ya da Mongo/Redis okuması başarısız; ham hata yanıta konmaz, ayrıntı sunucu logundadır. |
| `MAINTENANCE` | 503 | Sistem bakımda. Lütfen daha sonra tekrar deneyin. | Bakım modu (BACKOFFICE_PLAN B11): `maintenance.enabled` açıkken tenant `/api` yazma istekleri reddedilir; `error` alanı `maintenance.message` ayarıdır (doluysa). Okuma, /health, /admin-api, public-config ve giriş/çıkış serbesttir; `Retry-After` başlığı yeniden deneme saniyesidir. |
| `QUERY_TIMEOUT` | 504 | Sorgu süre sınırını aştı. | Backoffice gözlem sorguları (B5/B8): sorgu maxTimeMS (5 sn) bütçesini aştı; aralık daraltılıp yeniden denenmeli. |
| `ANNOUNCEMENT_NOT_FOUND` | 404 | Duyuru bulunamadı. | Backoffice duyuru uçları (NB7): bu kimlikle duyuru kaydı yok. |
| `ANNOUNCEMENT_STATE` | 409 | Duyuru bu durumda bu işleme uygun değil. | Backoffice duyuru uçları (NB7): yalnız taslak düzenlenir/zamanlanır; sona ermiş ya da iptal edilmiş duyuru iptal edilemez. Detay yenilenip yeniden denenmeli. |
| `DELIVERY_NOT_FOUND` | 404 | Teslim kaydı bulunamadı. | Backoffice retryDelivery/discardDelivery (NB7): kayıt yok ya da TTL ile silinmiş. |
| `DELIVERY_STATE` | 409 | Teslim kaydı bu durumda bu işleme uygun değil. | Backoffice retryDelivery/discardDelivery (NB7): yeniden deneme yalnız dead/failed, atma yalnız pending/dead/failed/skipped kayıtlarda yapılır; gönderilmekte olan kayıt değiştirilmez. |
| `ALERT_NOT_FOUND` | 404 | Uyarı bulunamadı. | Backoffice muteAlert (NB8): (ruleId, scopeKey) için uyarı kaydı yok. |
| `NOTIFY_EMAIL_UNAVAILABLE` | 503 | E-posta şu an gönderilemiyor. | Backoffice sendTestEmail (NB7): NOTIFY_EMAIL_ENABLED kapalı ya da taşıyıcı hata verdi; ham hata yanıta konmaz. |
| `SUBSCRIPTION_NOT_FOUND` | 404 | Abonelik bulunamadı. | Backoffice abonelik uçları (B4): tenant için Subscriptions kaydı yok. |
| `PLAN_NOT_FOUND` | 404 | Plan bulunamadı. | Backoffice changePlan (B4): plan kodu yok ya da satışa kapalı. |
| `SUBSCRIPTION_CHANGED` | 409 | Abonelik eş zamanlı değişti. | Backoffice abonelik yazması (B4): iyimser kilit/durum koruması eşleşmedi (TrialExpiryJob, webhook ya da başka yönetici araya girdi); detayı yenileyip yeniden denenmeli. |
| `SUBSCRIPTION_EXEMPT` | 409 | Muaf abonelik bu işleme uygun değil. | Backoffice abonelik yazması (B4): billingExempt (legacy) abonelik deneme uzatma/sağlayıcı işlemi kapsamı dışındadır. |
| `SUBSCRIPTION_NOT_CANCELABLE` | 409 | Abonelik bu durumda iptal edilemez. | Backoffice cancelSubscription (B4): abonelik zaten canceled/expired. |
| `SUBSCRIPTION_NOT_CHANGEABLE` | 409 | Abonelik bu durumda plan değiştiremez. | Backoffice changePlan (B4): abonelik trialing/active/past_due dışında. |
| `TRIAL_NOT_ACTIVE` | 409 | Deneme süresi uzatılamaz. | Backoffice extendTrial (B4): yalnız süren (trialing) ya da denemesi bitip askıya alınmış kartsız (suspended, sağlayıcı kaydı yok) abonelik uzatılır (K40); ödeme yapan/sağlayıcı kayıtlı abonelikte reddedilir. |
| `TRIAL_EXTENSION_LIMIT` | 409 | Toplam deneme uzatma sınırı aşıldı. | Backoffice extendTrial (K40): tek seferde ≤30, bir abonelikte TOPLAM ≤60 gün; aşımda details.remainingDays/usedDays/maxTotalDays döner. |
| `NO_PROVIDER_SUBSCRIPTION` | 409 | Abonelikte sağlayıcı kaydı yok. | Backoffice changePlan (B4): kartsız denemede sağlayıcı aboneliği yoktur; plan değişimi uygulanamaz (K40: cancelSubscription bu durumda yerel iptal yapar, bu kodu VERMEZ). |
| `PROVIDER_MISMATCH` | 409 | Abonelik başka bir sağlayıcıya ait. | Backoffice cancel/changePlan (B4): Subscriptions.provider yapılandırılmış PAYMENT_PROVIDER ile eşleşmiyor. |
| `PROVIDER_SUBSCRIPTION_MISSING` | 409 | Sağlayıcıda abonelik kaydı bulunamadı. | Backoffice cancel/changePlan (B4): sağlayıcı (mock: süreç yeniden başlamış) verilen referansı tanımıyor; mutabakat gerekir. |
| `PROVIDER_ERROR` | 502 | Sağlayıcı işlemi başarısız. | Backoffice cancel/changePlan (B4): ödeme sağlayıcısı hata döndü; abonelik değiştirilmedi. |
| `SAME_PLAN` | 409 | Abonelik zaten bu planda. | Backoffice changePlan (B4): hedef plan mevcut planla aynı. |
| `PLAN_REQUIRES_QUOTE` | 409 | Bu plan özel teklif gerektirir. | Backoffice changePlan (B4): priceMinor=0 (özel teklif) plan sağlayıcı üzerinden atanamaz. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | Aynı işlem zaten işleniyor. | Aynı `Idempotency-Key` ile başlamış bir istek henüz bitmedi (ADR-0030 X3; yalnız IDEMPOTENCY_ENFORCE=enforce). İstemci kısa süre sonra AYNI anahtarla yeniden dener; işlem tamamlanmışsa önceki yanıtı alır. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Bu Idempotency-Key farklı bir istekle kullanılmış. | Aynı kullanıcı+operasyon için aynı `Idempotency-Key` FARKLI bir gövdeyle gönderildi (ADR-0030 X3; yalnız enforce kipi). Yeni bir eylem için yeni anahtar üretilmelidir. |
| `INTERNAL` | 500 | Beklenmeyen bir hata oluştu. | Beklenmeyen sunucu hatası. Ayrıntı YALNIZCA sunucu logunda; yanıtta `requestId` ile eşleştirilir. |
| `TURN_IN_PROGRESS` | 409 | Devam eden bir yanıtınız var. Bitmesini bekleyin. | Sohbet turu (BR-1): kullanıcı başına eşzamanlı yalnız 1 tur açıktır (Redis SET NX kilidi, TTL 90 sn); önceki tur bitmeden yeni tur başlatıldı. |
| `TURN_DUPLICATE` | 409 | Bu istek zaten işlendi. | Sohbet turu (BR-1): aynı `clientTurnId` 10 dk içinde yeniden gönderildi; tur tekrarlanmaz. İstemci yeniden denemede YENİ `clientTurnId` üretir. |
| `SETUP_REQUIRED` | 403 | Sohbet için kurulum gerekli. | Sohbet turu/bilgi (BR-1/BR-5): tenant için yapay zekâ sağlayıcı anahtarı (ya da sahip onayı) tanımlı değil. `GET /api/agent/info` aynı durumu `reason: SETUP_REQUIRED` ile bildirir. |
| `PROTOCOL` | 400 | Sohbet protokol sürümü uyuşmuyor. Sayfayı yenileyin. | Sohbet isteği (chat/v1): istek gövdesi `v: 1` ile uyuşmuyor ya da protokol şemasına uymuyor (ayrıntı `fields` alanında yalnız alan yolları). |
| `CONFIRM_EXPIRED` | 410 | Onay süresi doldu ya da işlem zaten yapıldı. İsteği yeniden oluşturun. | Sohbet onay ucu (BR-2): `PendingAction` yok (5 dk TTL doldu, tek kullanımlık hak kullanıldı) ya da bu kullanıcı/tenant/konuşmaya ait değil (ayrım yapılmaz; bilgi sızdırmaz). İstemci aynı isteği yeniden sohbetten üretir. |
| `CAPABILITY_DISABLED` | 503 | Bu özellik şu an yönetici tarafından kapatılmış. | Sohbet/MCP aracı (BR-2): yetenek kill-switch listesinde (`features.agent.disabledCapabilities`, platform ayarı). Araç listede görünmez; zorla çağrı bu kodla reddedilir. |
| `IMPERSONATION_FORBIDDEN` | 403 | Bu işlem yönetici görüntüleme (destek) oturumunda yapılamaz. | Sohbet aracı (BR-2): impersonation oturumunda yalnız `effect:read` araçlar vardır; yazma/dış/yasak izinli yetenek reddedilir (`impersonationPolicy` ile aynı kural). |
| `LLM_KEY_INVALID` | 422 | Yapay zekâ sağlayıcı anahtarı geçersiz. | LLM sağlayıcı hata sınıfı (ADR-0034 Karar 9): anahtar geçersiz/iptal (401/403). Ham sağlayıcı yanıtı istemciye ve loga gitmez. |
| `LLM_QUOTA` | 402 | Sağlayıcı hesabındaki kredi/kota tükendi. | LLM sağlayıcı hata sınıfı: kredi/fatura/kota bitti (maliyet kullanıcının kendi sağlayıcı hesabındadır, K37). |
| `LLM_RATE_LIMITED` | 429 | Sağlayıcı hız sınırına ulaşıldı. | LLM sağlayıcı hata sınıfı: sağlayıcı 429; `retry-after` varsa `retryAfterSec`. |
| `LLM_MODEL_UNAVAILABLE` | 422 | Seçili model kullanılamıyor. | LLM sağlayıcı hata sınıfı: model yok ya da bu anahtarla erişilemiyor (404). |
| `LLM_UNAVAILABLE` | 503 | Yapay zekâ sağlayıcısına ulaşılamıyor. | LLM sağlayıcı hata sınıfı: sağlayıcı 5xx, zaman aşımı ya da ağ hatası. |
| `OAUTH_INVALID_REQUEST` | 400 | Bağlantı isteği geçersiz. | OAuth onay kararı (MCP-1): gövde geçersiz (approve boolean değil, tid tam sayı değil ya da seçilen kapsam istenen kapsamın dışında). |
| `OAUTH_ACCESS_DENIED` | 403 | Bu mağaza için bağlantı izni veremezsiniz. | OAuth onay kararı (MCP-1): seçilen tenant kullanıcının aktif üyeliklerinde yok ya da kullanıcı/tenant artık geçerli değil. |
| `INSUFFICIENT_SCOPE` | 403 | Bu bağlantının izni bu işlem için yetmiyor. | Uzak MCP (MCP-3): çağrılan araç bu bağlantının kapsamında/izin tavanında değil (ör. yazma aracı yalnız okuma bağlantısında, ya da tenant ayarı yazmaya kapalı). Araç listesinde olmayan araç çağrısı `isError` ile bu kodu taşır. |
| `APPROVAL_EXPIRED` | 410 | Bu onay isteğinin süresi doldu. Yapay zekâ uygulamanızdan işlemi yeniden isteyin. | MCP bant dışı onay (MCP-4): `PendingAction` (surface mcp, 10 dk) süresi doldu, yetenek sürümü/girdi özeti değişti, bağlantı iptal edildi ya da tenant yazma erişimi kapandı. Yalnız kaydın SAHİBİNE döner; başka kullanıcı/tenant için 404 NOT_FOUND (ayrım sızdırılmaz). |
| `MCP_TENANT_OFF` | 403 | Bu mağazada yapay zekâ bağlantısı kapalı. | OAuth onay kararı (MCP-1/MCP-2): tenant `Settings.mcp.access` kapalı (ya da onay metni sürümü eski); mağaza sahibi Ayarlar > Yapay zekâ bağlantısı ekranından açmalıdır. |

## Entegrasyon (dış servis) kodları

| Kod | HTTP | Varsayılan ileti | Anlam |
|---|---|---|---|
| `INTEGRATION_PAUSED` | 503 | Bu entegrasyon geçici olarak durduruldu. | Acil durdurma (kill-switch intake, ADR-0030 X6-b): `off` iken tüm dış çağrı yapan RPC çağrıları, `drain` iken yalnız yeni dış etkili yazmalar (okumalar geçer) reddedilir. `Retry-After` YOKTUR (süre bilinmez); kullanıcıya "geçici olarak durduruldu" gösterilir, otomatik yeniden denenmez. |
| `LIVE_READONLY` | 423 | Canlı salt-okuma kipinde bu işlem kapalı. | LIVE_READONLY=1 (npm run start:live-readonly): pazaryeri/e-ticaret/ERP sistemlerine YAZAN RPC çağrıları (ürün/fiyat/stok gönderme, sipariş durumu, talep onayı, soru cevabı, token değişimi) reddedilir; okuma ve yerel içe alma çalışır (docs/LIVE_READONLY.md). Normal kipte bu kod üretilmez. |
| `AUTH` | 502 | Pazaryeri kimlik bilgisi geçersiz. | Dış servis kimlik doğrulamayı reddetti (kimlik bilgisi/anahtar yenilenmeli). |
| `UNAVAILABLE` | 503 | Dış servis geçici olarak kullanılamıyor. | Dış servis yanıt vermiyor / devre kesici açık (ADR-0006). |
| `NOT_SUPPORTED` | 501 | Bu işlem bu entegrasyonda desteklenmiyor. | Adaptör bu yeteneği sunmuyor (mock modunda mock'lanmamış uç dahil). |
| `UNKNOWN_OUTCOME` | 502 | İşlemin sonucu doğrulanamadı. | Yazma çağrısı zaman aşımı/kopma ile bitti; sonuç belirsiz, otomatik yeniden deneme YAPILMAZ (ADR-0006). |

## Hesap yaşam döngüsü (özel) kodları

| Kod | HTTP | Varsayılan ileti | Anlam |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | İstek geçersiz. | Hesap uçlarında genel geçersiz istek. |
| `INVALID_CURRENT_PASSWORD` | 400 | Mevcut parola hatalı. | changePassword: mevcut parola yanlış. |
| `SAME_PASSWORD` | 400 | Yeni parola mevcut parolayla aynı olamaz. | changePassword: yeni parola eskiyle aynı. |
| `WEAK_PASSWORD` | 400 | Parola politikayı karşılamıyor. | Parola politikası ihlali (uzunluk/karmaşıklık). |
| `TOKEN_INVALID` | 400 | Bağlantı geçersiz veya süresi dolmuş. | Parola sıfırlama / e-posta doğrulama belirteci geçersiz. |
| `GOOGLE_DISABLED` | 503 | Google ile giriş etkin değil. | GOOGLE_OAUTH_CLIENT_ID tanımsız; googleSignIn kapalı. |
| `GOOGLE_TOKEN_INVALID` | 401 | Google doğrulaması başarısız. | Google ID token imzası/aud/iss/süre geçersiz veya Google anahtarları alınamadı (gövde yansıtılmaz). |
| `GOOGLE_EMAIL_UNVERIFIED` | 403 | Google e-posta adresi doğrulanmamış. | ID token email_verified=true değil. |
| `GOOGLE_ACCOUNT_MISMATCH` | 409 | Bu e-posta başka bir Google hesabına bağlı. | Kullanıcıya daha önce farklı bir Google hesabı (googleSub) bağlanmış. |
| `EMAIL_NOT_CONFIGURED` | 503 | E-posta gönderimi yapılandırılmamış. | PUBLIC_APP_URL/SMTP tanımsız; e-posta gerektiren uçlar kapalı. |
| `COOLDOWN` | 429 | Lütfen yeni bir istekten önce bekleyin. | Aynı e-posta türü için bekleme süresi dolmadı. |
| `MAIL_FAILED` | 502 | E-posta gönderilemedi. | SMTP gönderimi başarısız. |
| `INVITATION_INVALID` | 400 | Davet bağlantısı geçersiz. | Davet belirteci biçim dışı ya da bilinmiyor (getInvitation/acceptInvitation). |
| `INVITATION_EXPIRED` | 410 | Davetin süresi dolmuş. | Davet 7 günlük süresini aştı; yöneticiden yeni davet/yeniden gönderim istenir. |
| `INVITATION_REVOKED` | 410 | Bu davet iptal edilmiş. | Davet bir yönetici tarafından iptal edildi. |
| `INVITATION_ACCEPTED` | 409 | Bu davet daha önce kullanılmış. | Davet tek kullanımlıktır; zaten kabul edildi (ya da eşzamanlı ikinci kabul). |
| `INVITATION_RATE_LIMITED` | 429 | Saatlik davet sınırına ulaşıldı. | Tenant başına saatte en çok 20 davet (yeniden gönderim dahil). |
| `PLAN_LIMIT_REACHED` | 403 | Plan kullanıcı sınırına ulaşıldı. | limits.users doldu (aktif üye + bekleyen davet); FE "planı yükselt" gösterir, yetki hatası değildir (ADR-0028 Karar 4). |
| `ALREADY_MEMBER` | 409 | Bu kullanıcı zaten mağazanın üyesi. | Davet edilen e-posta bu mağazada zaten üye. |
| `EMAIL_TAKEN` | 409 | Bu e-posta adresi kullanılamıyor. | E-posta başka bir mağazaya bağlı (Aşama 1-2 tek aktif üyelik; numaralandırma sızıntısı olmasın diye genel mesaj). |
| `LAST_OWNER` | 409 | Mağazanın son sahibi bu işleme konu olamaz. | Mağazada en az bir aktif sahip kalmalıdır (askıya alma/rol düşürme/silme). |
| `ALREADY_OWNER` | 409 | Kullanıcı zaten mağaza sahibi. | Sahiplik devri hedefi zaten sahip. |
| `TARGET_NOT_ACTIVE` | 409 | Devir hedefi aktif bir üye olmalıdır. | Sahiplik devri hedefi askıda/aktif değil. |
| `TARGET_EMAIL_UNVERIFIED` | 409 | Devir hedefinin e-postası doğrulanmış olmalıdır. | Sahiplik devri hedefinin e-posta adresi doğrulanmamış. |

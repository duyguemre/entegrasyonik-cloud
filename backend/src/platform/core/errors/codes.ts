// ADR-0017 §10 / ADR-0016 §4.3: hata kodu kataloğu. `docs/ERROR_CODES.md` BU dosyadan üretilir
// (tests/unit/platform/errorCodes.docs.test.ts eşitliği zorlar; güncellemek için UPDATE_ERROR_CODES=1 ile o testi koşun).
//
// Kod = makine-okur, KARARLI sözleşme (FE ileti eşlemesi bu koda göre yapılır; metin yalnızca yedektir). Kod SİLİNMEZ/yeniden
// anlamlandırılmaz; yeni kod eklenir. `status` = varsayılan HTTP durumu.

export interface ErrorCodeDef {
    readonly status: number;
    /** Kullanıcıya gösterilebilir güvenli varsayılan ileti (TR). */
    readonly message: string;
    readonly group: 'genel' | 'entegrasyon' | 'hesap';
    readonly description: string;
}

export const ERROR_CODES = {
    // --- Genel (ADR-0016 §4.3) ---
    VALIDATION: { status: 400, group: 'genel', message: 'Geçersiz istek.', description: 'Girdi doğrulaması başarısız (eksik/yanlış tipli/aralık dışı alan).' },
    UNAUTHENTICATED: { status: 401, group: 'genel', message: 'Oturum gerekli.', description: 'Kimlik doğrulanamadı (token yok/geçersiz/süresi dolmuş).' },
    FORBIDDEN: { status: 403, group: 'genel', message: 'Bu işlem için yetkiniz yok.', description: 'Kimlik doğrulandı ama kademe/rol/tenant kuralı işleme izin vermiyor (ADR-0001).' },
    NOT_FOUND: { status: 404, group: 'genel', message: 'Kayıt bulunamadı.', description: 'İstenen kaynak yok ya da bu tenant için görünür değil.' },
    PAYLOAD_TOO_LARGE: { status: 413, group: 'genel', message: 'İstek gövdesi çok büyük.', description: 'İstek gövdesi üst sınırı (JSON 10 MB; istemci günlüğü 8 KB) aştı.' },
    CONFLICT: { status: 409, group: 'genel', message: 'İşlem mevcut durumla çakışıyor.', description: 'Eşzamanlı değişiklik / benzersizlik ihlali.' },
    RATE_LIMITED: { status: 429, group: 'genel', message: 'Çok fazla istek. Lütfen biraz bekleyin.', description: 'Rate limit aşıldı; `Retry-After` başlığı beklenecek saniyeyi verir.' },
    QUOTA_EXCEEDED: { status: 403, group: 'genel', message: 'Plan kotanız doldu.', description: 'Abonelik planının sayısal sınırı aşıldı (ADR-0008 EntitlementService).' },
    PLAN_REQUIRED: { status: 402, group: 'genel', message: 'Bu özellik mevcut planınızda yok.', description: 'Özellik daha üst bir plan gerektiriyor (ADR-0008).' },
    SUBSCRIPTION_RESTRICTED: { status: 403, group: 'genel', message: 'Aboneliğiniz bu işlem için yeterli erişime sahip değil.', description: 'ADR-0008 §3 durum makinesi: `EntitlementService.checkAccess` reddetti (suspended/canceled/expired/no_subscription); asıl neden `error` alanındadır. Yalnızca `ENTITLEMENT_GUARD_ENABLED=true` iken üretilir.' },
    // --- Backoffice (ADR-0026 Karar 4; yalniz `/admin-api`) ---
    REAUTH_REQUIRED: { status: 401, group: 'genel', message: 'Bu işlem için yeniden doğrulama gerekli.', description: 'Backoffice adım-yükseltmesi (ADR-0026 Karar 4.6): destructive/hassas işlem son 5 dk içinde parola + TOTP ile yeniden doğrulama ister. İstemci `BackofficeAuthService/reauth` çağırıp isteği yenilemelidir.' },
    MFA_REQUIRED: { status: 403, group: 'genel', message: 'İki adımlı doğrulama gerekli.', description: 'Backoffice oturumu TOTP tamamlanmadan (parola sonrası yarım oturum) ya da kayıt (enrollTotp/confirmTotp) yapılmadan bir operasyon çağırdı (ADR-0026 Karar 4.5).' },
    IMPERSONATION_UNAVAILABLE: { status: 503, group: 'genel', message: 'Impersonation şu an kullanılamıyor.', description: 'Tek kullanımlık bilet Redis gerektirir (ADR-0026 Karar 4.9); Redis hazır değilse bilet üretilmez/tüketilmez.' },
    ADMIN_API_ONLY: { status: 403, group: 'genel', message: 'Bu işlem yalnızca yönetim uygulamasından yapılabilir.', description: 'ADMIN_API_ONLY=true iken platformAdmin işlemleri, ga girişi ve selectStore `/api` üzerinde kapalıdır; yönetim uygulaması üzerinden yapılır (ADR-0026 Aşama 3).' },
    ADMIN_SELF_ACTION: { status: 403, group: 'genel', message: 'Bu işlemi kendi hesabınız üzerinde yapamazsınız.', description: 'Backoffice yönetici yönetimi (B12): platform yöneticisi kendi hesabını kapatamaz/MFA kaydını sıfırlayamaz (başka bir yönetici yapmalı; acil durum: yerel betik).' },
    LAST_PLATFORM_ADMIN: { status: 409, group: 'genel', message: 'Son aktif platform yöneticisi kapatılamaz.', description: 'Backoffice yönetici yönetimi (B12): işlem sonrası hiç aktif platform yöneticisi kalmayacaktı; önce başka bir yönetici davet edilip etkinleştirilmelidir.' },
    // --- Backoffice motor ve kuyruklar (B7; docs/API_BACKOFFICE_OVERVIEW_ENGINE.md) ---
    QUEUE_UNAVAILABLE: { status: 503, group: 'genel', message: 'Kuyruk şu an kullanılamıyor.', description: 'Backoffice motor uçları (B7): Redis hazır değil; BullMQ kuyruğuna erişilemiyor (getQueues bunun yerine available:false döner).' },
    JOB_NOT_FOUND: { status: 404, group: 'genel', message: 'İş bulunamadı.', description: 'Backoffice motor uçları (B7): kuyrukta ya da durum makinesi koleksiyonunda (ExportSignals/ImportJobs) bu kimlikle kayıt yok.' },
    JOB_NOT_FAILED: { status: 409, group: 'genel', message: 'İş başarısız durumda değil.', description: 'Backoffice retryJob/discardJob (B7): yalnız failed durumundaki kuyruk işi yeniden denenebilir/silinebilir; aktif/bekleyen/tamamlanmış iş reddedilir (yanıtta güncel durum yazar).' },
    LEASE_NOT_STUCK: { status: 409, group: 'genel', message: 'Kira takılı değil.', description: 'Backoffice releaseStuckLease (B7): kira süresi henüz dolmamış (sağlıklı pod tutuyor) ya da zaten bırakılmış; sağlıklı kiraya dokunulmaz.' },
    VIEW_LIMIT: { status: 409, group: 'genel', message: 'Kayıtlı görünüm sınırı doldu.', description: 'Backoffice BackofficePrefsService/saveView (BE-05): yönetici başına en çok 20 kayıtlı görünüm; mevcut adı güncellemek serbesttir, yeni kayıt reddedilir.' },
    ADMIN_INVITE_EXISTING_USER: { status: 409, group: 'genel', message: 'Bu e-posta adresi zaten bir kullanıcıya ait.', description: 'Backoffice yönetici daveti (B12): e-posta mevcut bir kullanıcıya (tenant kullanıcısı ya da yönetici) aittir. Güvenli varsayılan: mevcut kullanıcıya platform yöneticiliği VERİLMEZ; ayrı bir e-posta adresi kullanılmalıdır.' },
    ADMIN_INVITE_INVALID: { status: 400, group: 'genel', message: 'Davet bağlantısı geçersiz veya süresi dolmuş.', description: 'Backoffice yönetici daveti kabulü (B12): token biçimi/özeti/süresi/kullanım durumu geçersiz (hangisi olduğu ayrıştırılmaz). Yeni davet istenmelidir.' },
    ADMIN_INVITE_UNAVAILABLE: { status: 503, group: 'genel', message: 'Yönetici daveti şu an gönderilemiyor.', description: 'Backoffice yönetici daveti (B12): backoffice adresi (ADMIN_CORS_ORIGINS ilk girdisi) yapılandırılmamış ya da e-posta gönderilemedi; davet kaydı geri alınır/yeniden gönderilebilir.' },
    INFRA_UNAVAILABLE: { status: 503, group: 'genel', message: 'Altyapı şu an okunamıyor.', description: 'Backoffice altyapı/entegrasyon gözlem uçları (B5/B6/B8): Redis hazır değil ya da Mongo/Redis okuması başarısız; ham hata yanıta konmaz, ayrıntı sunucu logundadır.' },
    MAINTENANCE: { status: 503, group: 'genel', message: 'Sistem bakımda. Lütfen daha sonra tekrar deneyin.', description: 'Bakım modu (BACKOFFICE_PLAN B11): `maintenance.enabled` açıkken tenant `/api` yazma istekleri reddedilir; `error` alanı `maintenance.message` ayarıdır (doluysa). Okuma, /health, /admin-api, public-config ve giriş/çıkış serbesttir; `Retry-After` başlığı yeniden deneme saniyesidir.' },
    QUERY_TIMEOUT: { status: 504, group: 'genel', message: 'Sorgu süre sınırını aştı.', description: 'Backoffice gözlem sorguları (B5/B8): sorgu maxTimeMS (5 sn) bütçesini aştı; aralık daraltılıp yeniden denenmeli.' },
    // --- Backoffice bildirim/duyuru/alarm (ADR-0029 NB7/NB8; docs/API_BACKOFFICE_NOTIFICATIONS.md) ---
    ANNOUNCEMENT_NOT_FOUND: { status: 404, group: 'genel', message: 'Duyuru bulunamadı.', description: 'Backoffice duyuru uçları (NB7): bu kimlikle duyuru kaydı yok.' },
    ANNOUNCEMENT_STATE: { status: 409, group: 'genel', message: 'Duyuru bu durumda bu işleme uygun değil.', description: 'Backoffice duyuru uçları (NB7): yalnız taslak düzenlenir/zamanlanır; sona ermiş ya da iptal edilmiş duyuru iptal edilemez. Detay yenilenip yeniden denenmeli.' },
    DELIVERY_NOT_FOUND: { status: 404, group: 'genel', message: 'Teslim kaydı bulunamadı.', description: 'Backoffice retryDelivery/discardDelivery (NB7): kayıt yok ya da TTL ile silinmiş.' },
    DELIVERY_STATE: { status: 409, group: 'genel', message: 'Teslim kaydı bu durumda bu işleme uygun değil.', description: 'Backoffice retryDelivery/discardDelivery (NB7): yeniden deneme yalnız dead/failed, atma yalnız pending/dead/failed/skipped kayıtlarda yapılır; gönderilmekte olan kayıt değiştirilmez.' },
    ALERT_NOT_FOUND: { status: 404, group: 'genel', message: 'Uyarı bulunamadı.', description: 'Backoffice muteAlert (NB8): (ruleId, scopeKey) için uyarı kaydı yok.' },
    NOTIFY_EMAIL_UNAVAILABLE: { status: 503, group: 'genel', message: 'E-posta şu an gönderilemiyor.', description: 'Backoffice sendTestEmail (NB7): NOTIFY_EMAIL_ENABLED kapalı ya da taşıyıcı hata verdi; ham hata yanıta konmaz.' },
    // --- Backoffice abonelik yonetimi (B4; docs/API_BACKOFFICE_BILLING_TENANTS.md) ---
    SUBSCRIPTION_NOT_FOUND: { status: 404, group: 'genel', message: 'Abonelik bulunamadı.', description: 'Backoffice abonelik uçları (B4): tenant için Subscriptions kaydı yok.' },
    PLAN_NOT_FOUND: { status: 404, group: 'genel', message: 'Plan bulunamadı.', description: 'Backoffice changePlan (B4): plan kodu yok ya da satışa kapalı.' },
    SUBSCRIPTION_CHANGED: { status: 409, group: 'genel', message: 'Abonelik eş zamanlı değişti.', description: 'Backoffice abonelik yazması (B4): iyimser kilit/durum koruması eşleşmedi (TrialExpiryJob, webhook ya da başka yönetici araya girdi); detayı yenileyip yeniden denenmeli.' },
    SUBSCRIPTION_EXEMPT: { status: 409, group: 'genel', message: 'Muaf abonelik bu işleme uygun değil.', description: 'Backoffice abonelik yazması (B4): billingExempt (legacy) abonelik deneme uzatma/sağlayıcı işlemi kapsamı dışındadır.' },
    SUBSCRIPTION_NOT_CANCELABLE: { status: 409, group: 'genel', message: 'Abonelik bu durumda iptal edilemez.', description: 'Backoffice cancelSubscription (B4): abonelik zaten canceled/expired.' },
    SUBSCRIPTION_NOT_CHANGEABLE: { status: 409, group: 'genel', message: 'Abonelik bu durumda plan değiştiremez.', description: 'Backoffice changePlan (B4): abonelik trialing/active/past_due dışında.' },
    TRIAL_NOT_ACTIVE: { status: 409, group: 'genel', message: 'Deneme süresi uzatılamaz.', description: 'Backoffice extendTrial (B4): yalnız süren (trialing) ya da denemesi bitip askıya alınmış kartsız (suspended, sağlayıcı kaydı yok) abonelik uzatılır (K40); ödeme yapan/sağlayıcı kayıtlı abonelikte reddedilir.' },
    TRIAL_EXTENSION_LIMIT: { status: 409, group: 'genel', message: 'Toplam deneme uzatma sınırı aşıldı.', description: 'Backoffice extendTrial (K40): tek seferde ≤30, bir abonelikte TOPLAM ≤60 gün; aşımda details.remainingDays/usedDays/maxTotalDays döner.' },
    NO_PROVIDER_SUBSCRIPTION: { status: 409, group: 'genel', message: 'Abonelikte sağlayıcı kaydı yok.', description: 'Backoffice changePlan (B4): kartsız denemede sağlayıcı aboneliği yoktur; plan değişimi uygulanamaz (K40: cancelSubscription bu durumda yerel iptal yapar, bu kodu VERMEZ).' },
    PROVIDER_MISMATCH: { status: 409, group: 'genel', message: 'Abonelik başka bir sağlayıcıya ait.', description: 'Backoffice cancel/changePlan (B4): Subscriptions.provider yapılandırılmış PAYMENT_PROVIDER ile eşleşmiyor.' },
    PROVIDER_SUBSCRIPTION_MISSING: { status: 409, group: 'genel', message: 'Sağlayıcıda abonelik kaydı bulunamadı.', description: 'Backoffice cancel/changePlan (B4): sağlayıcı (mock: süreç yeniden başlamış) verilen referansı tanımıyor; mutabakat gerekir.' },
    PROVIDER_ERROR: { status: 502, group: 'genel', message: 'Sağlayıcı işlemi başarısız.', description: 'Backoffice cancel/changePlan (B4): ödeme sağlayıcısı hata döndü; abonelik değiştirilmedi.' },
    SAME_PLAN: { status: 409, group: 'genel', message: 'Abonelik zaten bu planda.', description: 'Backoffice changePlan (B4): hedef plan mevcut planla aynı.' },
    PLAN_REQUIRES_QUOTE: { status: 409, group: 'genel', message: 'Bu plan özel teklif gerektirir.', description: 'Backoffice changePlan (B4): priceMinor=0 (özel teklif) plan sağlayıcı üzerinden atanamaz.' },
    IDEMPOTENCY_IN_PROGRESS: { status: 409, group: 'genel', message: 'Aynı işlem zaten işleniyor.', description: 'Aynı `Idempotency-Key` ile başlamış bir istek henüz bitmedi (ADR-0030 X3; yalnız IDEMPOTENCY_ENFORCE=enforce). İstemci kısa süre sonra AYNI anahtarla yeniden dener; işlem tamamlanmışsa önceki yanıtı alır.' },
    IDEMPOTENCY_KEY_REUSED: { status: 422, group: 'genel', message: 'Bu Idempotency-Key farklı bir istekle kullanılmış.', description: 'Aynı kullanıcı+operasyon için aynı `Idempotency-Key` FARKLI bir gövdeyle gönderildi (ADR-0030 X3; yalnız enforce kipi). Yeni bir eylem için yeni anahtar üretilmelidir.' },
    INTEGRATION_PAUSED: { status: 503, group: 'entegrasyon', message: 'Bu entegrasyon geçici olarak durduruldu.', description: 'Acil durdurma (kill-switch intake, ADR-0030 X6-b): `off` iken tüm dış çağrı yapan RPC çağrıları, `drain` iken yalnız yeni dış etkili yazmalar (okumalar geçer) reddedilir. `Retry-After` YOKTUR (süre bilinmez); kullanıcıya "geçici olarak durduruldu" gösterilir, otomatik yeniden denenmez.' },
    LIVE_READONLY: { status: 423, group: 'entegrasyon', message: 'Canlı salt-okuma kipinde bu işlem kapalı.', description: 'LIVE_READONLY=1 (npm run start:live-readonly): pazaryeri/e-ticaret/ERP sistemlerine YAZAN RPC çağrıları (ürün/fiyat/stok gönderme, sipariş durumu, talep onayı, soru cevabı, token değişimi) reddedilir; okuma ve yerel içe alma çalışır (docs/LIVE_READONLY.md). Normal kipte bu kod üretilmez.' },
    INTERNAL: { status: 500, group: 'genel', message: 'Beklenmeyen bir hata oluştu.', description: 'Beklenmeyen sunucu hatası. Ayrıntı YALNIZCA sunucu logunda; yanıtta `requestId` ile eşleştirilir.' },

    // --- Entegrasyon (ADR-0006 `IntegrationError` kodları; genel kodlarla aynı adlar aynı anlamdadır) ---
    AUTH: { status: 502, group: 'entegrasyon', message: 'Pazaryeri kimlik bilgisi geçersiz.', description: 'Dış servis kimlik doğrulamayı reddetti (kimlik bilgisi/anahtar yenilenmeli).' },
    UNAVAILABLE: { status: 503, group: 'entegrasyon', message: 'Dış servis geçici olarak kullanılamıyor.', description: 'Dış servis yanıt vermiyor / devre kesici açık (ADR-0006).' },
    NOT_SUPPORTED: { status: 501, group: 'entegrasyon', message: 'Bu işlem bu entegrasyonda desteklenmiyor.', description: 'Adaptör bu yeteneği sunmuyor (mock modunda mock\'lanmamış uç dahil).' },
    UNKNOWN_OUTCOME: { status: 502, group: 'entegrasyon', message: 'İşlemin sonucu doğrulanamadı.', description: 'Yazma çağrısı zaman aşımı/kopma ile bitti; sonuç belirsiz, otomatik yeniden deneme YAPILMAZ (ADR-0006).' },

    // --- Hesap yaşam döngüsü (docs/API_ACCOUNT_LIFECYCLE.md; mevcut özel kodlar — geriye uyum) ---
    INVALID_REQUEST: { status: 400, group: 'hesap', message: 'İstek geçersiz.', description: 'Hesap uçlarında genel geçersiz istek.' },
    INVALID_CURRENT_PASSWORD: { status: 400, group: 'hesap', message: 'Mevcut parola hatalı.', description: 'changePassword: mevcut parola yanlış.' },
    SAME_PASSWORD: { status: 400, group: 'hesap', message: 'Yeni parola mevcut parolayla aynı olamaz.', description: 'changePassword: yeni parola eskiyle aynı.' },
    WEAK_PASSWORD: { status: 400, group: 'hesap', message: 'Parola politikayı karşılamıyor.', description: 'Parola politikası ihlali (uzunluk/karmaşıklık).' },
    TOKEN_INVALID: { status: 400, group: 'hesap', message: 'Bağlantı geçersiz veya süresi dolmuş.', description: 'Parola sıfırlama / e-posta doğrulama belirteci geçersiz.' },
    EMAIL_NOT_CONFIGURED: { status: 503, group: 'hesap', message: 'E-posta gönderimi yapılandırılmamış.', description: 'PUBLIC_APP_URL/SMTP tanımsız; e-posta gerektiren uçlar kapalı.' },
    COOLDOWN: { status: 429, group: 'hesap', message: 'Lütfen yeni bir istekten önce bekleyin.', description: 'Aynı e-posta türü için bekleme süresi dolmadı.' },
    MAIL_FAILED: { status: 502, group: 'hesap', message: 'E-posta gönderilemedi.', description: 'SMTP gönderimi başarısız.' },
    // --- Kullanıcı yönetimi: davet / askıya alma / sahiplik devri (ADR-0028 WP-A4) ---
    INVITATION_INVALID: { status: 400, group: 'hesap', message: 'Davet bağlantısı geçersiz.', description: 'Davet belirteci biçim dışı ya da bilinmiyor (getInvitation/acceptInvitation).' },
    INVITATION_EXPIRED: { status: 410, group: 'hesap', message: 'Davetin süresi dolmuş.', description: 'Davet 7 günlük süresini aştı; yöneticiden yeni davet/yeniden gönderim istenir.' },
    INVITATION_REVOKED: { status: 410, group: 'hesap', message: 'Bu davet iptal edilmiş.', description: 'Davet bir yönetici tarafından iptal edildi.' },
    INVITATION_ACCEPTED: { status: 409, group: 'hesap', message: 'Bu davet daha önce kullanılmış.', description: 'Davet tek kullanımlıktır; zaten kabul edildi (ya da eşzamanlı ikinci kabul).' },
    INVITATION_RATE_LIMITED: { status: 429, group: 'hesap', message: 'Saatlik davet sınırına ulaşıldı.', description: 'Tenant başına saatte en çok 20 davet (yeniden gönderim dahil).' },
    PLAN_LIMIT_REACHED: { status: 403, group: 'hesap', message: 'Plan kullanıcı sınırına ulaşıldı.', description: 'limits.users doldu (aktif üye + bekleyen davet); FE "planı yükselt" gösterir, yetki hatası değildir (ADR-0028 Karar 4).' },
    ALREADY_MEMBER: { status: 409, group: 'hesap', message: 'Bu kullanıcı zaten mağazanın üyesi.', description: 'Davet edilen e-posta bu mağazada zaten üye.' },
    EMAIL_TAKEN: { status: 409, group: 'hesap', message: 'Bu e-posta adresi kullanılamıyor.', description: 'E-posta başka bir mağazaya bağlı (Aşama 1-2 tek aktif üyelik; numaralandırma sızıntısı olmasın diye genel mesaj).' },
    LAST_OWNER: { status: 409, group: 'hesap', message: 'Mağazanın son sahibi bu işleme konu olamaz.', description: 'Mağazada en az bir aktif sahip kalmalıdır (askıya alma/rol düşürme/silme).' },
    ALREADY_OWNER: { status: 409, group: 'hesap', message: 'Kullanıcı zaten mağaza sahibi.', description: 'Sahiplik devri hedefi zaten sahip.' },
    TARGET_NOT_ACTIVE: { status: 409, group: 'hesap', message: 'Devir hedefi aktif bir üye olmalıdır.', description: 'Sahiplik devri hedefi askıda/aktif değil.' },
    TARGET_EMAIL_UNVERIFIED: { status: 409, group: 'hesap', message: 'Devir hedefinin e-postası doğrulanmış olmalıdır.', description: 'Sahiplik devri hedefinin e-posta adresi doğrulanmamış.' },
    // --- Sohbet aracisi (ADR-0034 / AGENT_BROKER_PLAN BR-1; protokol chat/v1) ---
    TURN_IN_PROGRESS: { status: 409, group: 'genel', message: 'Devam eden bir yanıtınız var. Bitmesini bekleyin.', description: 'Sohbet turu (BR-1): kullanıcı başına eşzamanlı yalnız 1 tur açıktır (Redis SET NX kilidi, TTL 90 sn); önceki tur bitmeden yeni tur başlatıldı.' },
    TURN_DUPLICATE: { status: 409, group: 'genel', message: 'Bu istek zaten işlendi.', description: 'Sohbet turu (BR-1): aynı `clientTurnId` 10 dk içinde yeniden gönderildi; tur tekrarlanmaz. İstemci yeniden denemede YENİ `clientTurnId` üretir.' },
    SETUP_REQUIRED: { status: 403, group: 'genel', message: 'Sohbet için kurulum gerekli.', description: 'Sohbet turu/bilgi (BR-1/BR-5): tenant için yapay zekâ sağlayıcı anahtarı (ya da sahip onayı) tanımlı değil. `GET /api/agent/info` aynı durumu `reason: SETUP_REQUIRED` ile bildirir.' },
    PROTOCOL: { status: 400, group: 'genel', message: 'Sohbet protokol sürümü uyuşmuyor. Sayfayı yenileyin.', description: 'Sohbet isteği (chat/v1): istek gövdesi `v: 1` ile uyuşmuyor ya da protokol şemasına uymuyor (ayrıntı `fields` alanında yalnız alan yolları).' },
    CONFIRM_EXPIRED: { status: 410, group: 'genel', message: 'Onay süresi doldu ya da işlem zaten yapıldı. İsteği yeniden oluşturun.', description: 'Sohbet onay ucu (BR-2): `PendingAction` yok (5 dk TTL doldu, tek kullanımlık hak kullanıldı) ya da bu kullanıcı/tenant/konuşmaya ait değil (ayrım yapılmaz; bilgi sızdırmaz). İstemci aynı isteği yeniden sohbetten üretir.' },
    CAPABILITY_DISABLED: { status: 503, group: 'genel', message: 'Bu özellik şu an yönetici tarafından kapatılmış.', description: 'Sohbet/MCP aracı (BR-2): yetenek kill-switch listesinde (`features.agent.disabledCapabilities`, platform ayarı). Araç listede görünmez; zorla çağrı bu kodla reddedilir.' },
    IMPERSONATION_FORBIDDEN: { status: 403, group: 'genel', message: 'Bu işlem yönetici görüntüleme (destek) oturumunda yapılamaz.', description: 'Sohbet aracı (BR-2): impersonation oturumunda yalnız `effect:read` araçlar vardır; yazma/dış/yasak izinli yetenek reddedilir (`impersonationPolicy` ile aynı kural).' },
    LLM_KEY_INVALID: { status: 422, group: 'genel', message: 'Yapay zekâ sağlayıcı anahtarı geçersiz.', description: 'LLM sağlayıcı hata sınıfı (ADR-0034 Karar 9): anahtar geçersiz/iptal (401/403). Ham sağlayıcı yanıtı istemciye ve loga gitmez.' },
    LLM_QUOTA: { status: 402, group: 'genel', message: 'Sağlayıcı hesabındaki kredi/kota tükendi.', description: 'LLM sağlayıcı hata sınıfı: kredi/fatura/kota bitti (maliyet kullanıcının kendi sağlayıcı hesabındadır, K37).' },
    LLM_RATE_LIMITED: { status: 429, group: 'genel', message: 'Sağlayıcı hız sınırına ulaşıldı.', description: 'LLM sağlayıcı hata sınıfı: sağlayıcı 429; `retry-after` varsa `retryAfterSec`.' },
    LLM_MODEL_UNAVAILABLE: { status: 422, group: 'genel', message: 'Seçili model kullanılamıyor.', description: 'LLM sağlayıcı hata sınıfı: model yok ya da bu anahtarla erişilemiyor (404).' },
    LLM_UNAVAILABLE: { status: 503, group: 'genel', message: 'Yapay zekâ sağlayıcısına ulaşılamıyor.', description: 'LLM sağlayıcı hata sınıfı: sağlayıcı 5xx, zaman aşımı ya da ağ hatası.' },
    // --- Uzak MCP / OAuth onay ekrani (ADR-0035 / MCP-1; `/api/oauth/requests/*`) ---
    OAUTH_INVALID_REQUEST: { status: 400, group: 'genel', message: 'Bağlantı isteği geçersiz.', description: 'OAuth onay kararı (MCP-1): gövde geçersiz (approve boolean değil, tid tam sayı değil ya da seçilen kapsam istenen kapsamın dışında).' },
    OAUTH_ACCESS_DENIED: { status: 403, group: 'genel', message: 'Bu mağaza için bağlantı izni veremezsiniz.', description: 'OAuth onay kararı (MCP-1): seçilen tenant kullanıcının aktif üyeliklerinde yok ya da kullanıcı/tenant artık geçerli değil.' },
    INSUFFICIENT_SCOPE: { status: 403, group: 'genel', message: 'Bu bağlantının izni bu işlem için yetmiyor.', description: 'Uzak MCP (MCP-3): çağrılan araç bu bağlantının kapsamında/izin tavanında değil (ör. yazma aracı yalnız okuma bağlantısında, ya da tenant ayarı yazmaya kapalı). Araç listesinde olmayan araç çağrısı `isError` ile bu kodu taşır.' },
    APPROVAL_EXPIRED: { status: 410, group: 'genel', message: 'Bu onay isteğinin süresi doldu. Yapay zekâ uygulamanızdan işlemi yeniden isteyin.', description: 'MCP bant dışı onay (MCP-4): `PendingAction` (surface mcp, 10 dk) süresi doldu, yetenek sürümü/girdi özeti değişti, bağlantı iptal edildi ya da tenant yazma erişimi kapandı. Yalnız kaydın SAHİBİNE döner; başka kullanıcı/tenant için 404 NOT_FOUND (ayrım sızdırılmaz).' },
    MCP_TENANT_OFF: { status: 403, group: 'genel', message: 'Bu mağazada yapay zekâ bağlantısı kapalı.', description: 'OAuth onay kararı (MCP-1/MCP-2): tenant `Settings.mcp.access` kapalı (ya da onay metni sürümü eski); mağaza sahibi Ayarlar > Yapay zekâ bağlantısı ekranından açmalıdır.' },
} as const satisfies Record<string, ErrorCodeDef>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isKnownErrorCode(code: unknown): code is ErrorCode {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** HTTP durumundan katalog kodu (kod verilmemiş hatalar için). */
export function codeForStatus(status: number): ErrorCode {
    switch (status) {
        case 400: case 422: return 'VALIDATION';
        case 401: return 'UNAUTHENTICATED';
        case 402: return 'PLAN_REQUIRED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'CONFLICT';
        case 413: return 'PAYLOAD_TOO_LARGE';
        case 429: return 'RATE_LIMITED';
        case 501: return 'NOT_SUPPORTED';
        case 503: return 'UNAVAILABLE';
        default: return status >= 500 ? 'INTERNAL' : 'VALIDATION';
    }
}

/** `docs/ERROR_CODES.md` içeriği (tek üretici). */
export function renderErrorCodesMarkdown(): string {
    const groups: Array<[ErrorCodeDef['group'], string]> = [
        ['genel', 'Genel kodlar'],
        ['entegrasyon', 'Entegrasyon (dış servis) kodları'],
        ['hesap', 'Hesap yaşam döngüsü (özel) kodları'],
    ];
    const lines: string[] = [
        '# Hata kodları kataloğu',
        '',
        '> Bu dosya `backend/src/platform/core/errors/codes.ts` dosyasından ÜRETİLİR; elle düzenlemeyin.',
        '> Güncelleme: `UPDATE_ERROR_CODES=1 npx jest tests/unit/platform/errorCodes.docs.test.ts` (backend/).',
        '',
        '## Yanıt zarfı (RPC, FE sözleşmesi korunur)',
        '',
        'Hata yanıtı gövdesi: `{ "error": "<ileti>", "code": "<KOD>", "requestId": "<X-Request-Id>", "service": "...", "operation": "..." }`.',
        '',
        '- `error` **string olarak kalır** (geriye uyum); `code` ve `requestId` yalnızca EKLENMİŞ alanlardır. FE ileti eşlemesi `code`\'a göre yapılmalı, `error` metni yedektir.',
        '- Her yanıtta (başarı ve hata) `X-Request-Id` başlığı vardır; gövdedeki `requestId` ile aynıdır. Destek talebine bu kod yapıştırılır.',
        '- **Beklenmeyen (kataloğa/`AppError`\'a çevrilmemiş) hatalar 500 döner; ileti maskelenir** ("Beklenmeyen bir hata oluştu."), ayrıntı yalnızca sunucu logunda `requestId` ile bulunur.',
        '- Bilinçli üretilmiş 4xx hatalarında (`ApplicationError`/`AppError`) ileti olduğu gibi döner.',
        '- **Girdi doğrulama hatası (`VALIDATION`, 400; ADR-0023):** ek olarak `"fields": [{ "path": "user.email", "message": "geçersiz biçim" }]` döner. `message` sabit koddan üretilir; gövde DEĞERLERİ yansıtılmaz (yalnız izin verilmeyen alan ADLARI).',
        '',
    ];
    for (const [g, title] of groups) {
        lines.push(`## ${title}`, '', '| Kod | HTTP | Varsayılan ileti | Anlam |', '|---|---|---|---|');
        for (const [code, def] of Object.entries(ERROR_CODES) as Array<[string, ErrorCodeDef]>) {
            if (def.group !== g) continue;
            lines.push(`| \`${code}\` | ${def.status} | ${def.message} | ${def.description} |`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

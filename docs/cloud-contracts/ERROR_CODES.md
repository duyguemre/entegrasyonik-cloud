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
| `CONFLICT` | 409 | İşlem mevcut durumla çakışıyor. | Eşzamanlı değişiklik / benzersizlik ihlali. |
| `RATE_LIMITED` | 429 | Çok fazla istek. Lütfen biraz bekleyin. | Rate limit aşıldı; `Retry-After` başlığı beklenecek saniyeyi verir. |
| `QUOTA_EXCEEDED` | 403 | Plan kotanız doldu. | Abonelik planının sayısal sınırı aşıldı (ADR-0008 EntitlementService). |
| `PLAN_REQUIRED` | 402 | Bu özellik mevcut planınızda yok. | Özellik daha üst bir plan gerektiriyor (ADR-0008). |
| `SUBSCRIPTION_RESTRICTED` | 403 | Aboneliğiniz bu işlem için yeterli erişime sahip değil. | ADR-0008 §3 durum makinesi: `EntitlementService.checkAccess` reddetti (suspended/canceled/expired/no_subscription); asıl neden `error` alanındadır. Yalnızca `ENTITLEMENT_GUARD_ENABLED=true` iken üretilir. |
| `REAUTH_REQUIRED` | 401 | Bu işlem için yeniden doğrulama gerekli. | Backoffice adım-yükseltmesi (ADR-0026 Karar 4.6): destructive/hassas işlem son 5 dk içinde parola + TOTP ile yeniden doğrulama ister. İstemci `BackofficeAuthService/reauth` çağırıp isteği yenilemelidir. |
| `MFA_REQUIRED` | 403 | İki adımlı doğrulama gerekli. | Backoffice oturumu TOTP tamamlanmadan (parola sonrası yarım oturum) ya da kayıt (enrollTotp/confirmTotp) yapılmadan bir operasyon çağırdı (ADR-0026 Karar 4.5). |
| `IMPERSONATION_UNAVAILABLE` | 503 | Impersonation şu an kullanılamıyor. | Tek kullanımlık bilet Redis gerektirir (ADR-0026 Karar 4.9); Redis hazır değilse bilet üretilmez/tüketilmez. |
| `ADMIN_API_ONLY` | 403 | Bu işlem yalnızca yönetim uygulamasından yapılabilir. | ADMIN_API_ONLY=true iken platformAdmin işlemleri, ga girişi ve selectStore `/api` üzerinde kapalıdır; yönetim admin.entegrasyonik.com üzerinden yapılır (ADR-0026 Aşama 3). |
| `INTERNAL` | 500 | Beklenmeyen bir hata oluştu. | Beklenmeyen sunucu hatası. Ayrıntı YALNIZCA sunucu logunda; yanıtta `requestId` ile eşleştirilir. |

## Entegrasyon (dış servis) kodları

| Kod | HTTP | Varsayılan ileti | Anlam |
|---|---|---|---|
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

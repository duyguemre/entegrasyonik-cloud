# Kimlik hesabı yaşam döngüsü — API sözleşmesi

Kapsam: parola değiştirme, parola sıfırlama, e-posta doğrulama (backend; 2026-09-28). Frontend ekranları (Hesabım/Güvenlik, "Şifremi unuttum", `/reset-password`, `/verify-email`) ADR-0015 sonrası ayrı yapılacaktır — bu belge onların sözleşmesidir.
Kaynak: `backend/src/operations/account/*` (iş kuralları), `backend/src/api/rpc/handlers/account-service.ts` (API), `backend/src/api/rpc/ApiManager.ts` (özel rotalar + rate limit), `backend/src/api/rpc/operationPolicy.ts` (kademe). İlgili: ADR-0001 (login desenleri, tokenVersion, audit), FRONTEND_GAP_ANALYSIS N1/N2, araştırma Y-05.

## Genel

- Taban: `POST /api/AccountService/<operasyon>`, `Content-Type: application/json`, oturum HTTP-only çerez (`JWT_TOKEN`).
- Hata biçimi (mevcut `sendError` + yeni isteğe bağlı `code`): `{ "error": "<Türkçe mesaj>", "service": "AccountService", "operation": "<op>", "code": "<KOD>" }`. `code` yalnızca aşağıdaki hesap hatalarında bulunur. Yanıt istek gövdesini (parola/token) ASLA geri yansıtmaz.
- Rate limit aşımı: `429 { "error": "Too many requests" }` + `Retry-After` (saniye). Kullanıcının var olup olmadığından bağımsızdır.
- `requestPasswordReset`, `confirmPasswordReset`, `verifyEmail`, `changePassword` yalnızca yukarıdaki ÖZEL rotalardan çalışır (rate limit / çerez yenileme burada); jenerik `/api/:service/:operation` rotasından çağrılırsa (ör. yüzde-kodlanmış yol sapması) `403 Forbidden` döner. `resendVerificationEmail` jenerik RPC ile çağrılır (`restApi.post('AccountService/resendVerificationEmail')`).
- Tüm girdiler yalnızca **string** kabul edilir (nesne/dizi/sayı → `400 INVALID_REQUEST` veya `TOKEN_INVALID`; veritabanına gitmez).
- FE notu: 401 → giriş sayfası yönlendirmesi yakalayıcısı bu uçlarda YANLIŞ pozitif üretmez: açık uçlar hiçbir zaman 401 dönmez; `changePassword` yanlış mevcut parolada **400** döner (401 değil). Tek istisna: `changePassword` sırasında hesap kilitlenirse (5 yanlış deneme) sonraki istekler 401 olur ve oturum kapanır (login ile aynı kural).

## 1. `changePassword` — kimlikli (kademe: member)

`POST /api/AccountService/changePassword`

İstek: `{ "currentPassword": string, "newPassword": string }` (ikisi de 1–1024 karakter). Hedef kullanıcı DAİMA doğrulanmış oturumun sahibidir; gövdedeki `userId`/`email`/`principal` alanları yok sayılır.

Başarı `200`: `{ "success": true }` + **yeni `Set-Cookie: JWT_TOKEN`** (mevcut oturum için; `tv` yeni tokenVersion, `tid/imp/ga/auth_time` korunur — parola değişimi 7 günlük mutlak oturum sınırını uzatmaz). Bu kullanıcının TÜM diğer oturumları düşer (`Users.tokenVersion` +1 → authenticate 401). Ayrıca: kalan parola sıfırlama bağlantıları geçersiz olur; kullanıcıya "parolanız değiştirildi" bildirim e-postası gider (best-effort); `failedLoginAttempts` sıfırlanır, `lockUntil` silinir.

| HTTP | code | Durum |
|---|---|---|
| 400 | `INVALID_REQUEST` | alanlardan biri string değil/boş/>1024 |
| 400 | `INVALID_CURRENT_PASSWORD` | mevcut parola hatalı (sayaç +1; 5. hatada 15 dk kilit — login ile aynı) |
| 400 | `WEAK_PASSWORD` | yeni parola politikayı sağlamıyor (mesaj kuralları listeler) |
| 400 | `SAME_PASSWORD` | yeni parola mevcutla aynı |
| 401 | — | oturum yok/geçersiz (`Token is undefined` / `Token not verified`) |
| 409 | `CONFLICT` | eşzamanlı başka bir parola değişimi kazandı (yeniden dene) |

## 2. `requestPasswordReset` — AÇIK (kimliksiz)

`POST /api/AccountService/requestPasswordReset`

İstek: `{ "email": string }` (kırpılır, küçük harfe çevrilir; ≤254 karakter, e-posta biçimi).

Başarı `200` — HER ZAMAN aynı gövde (kayıtlı / kayıtsız / pasif / cooldown ayrımı YOK; yanıt süresi de aynı: kullanıcı arama, token üretimi ve e-posta gönderimi yanıttan sonra arka planda yapılır):
`{ "success": true, "message": "Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi." }`

Hatalar (kullanıcının varlığından BAĞIMSIZ, aynı girdi → aynı hata):

| HTTP | code | Durum |
|---|---|---|
| 400 | `INVALID_REQUEST` | e-posta string değil / biçim geçersiz / çok uzun |
| 429 | — | rate limit (aşağıda) |
| 503 | `EMAIL_NOT_CONFIGURED` | `PUBLIC_APP_URL` tanımsız/geçersiz (sunucu logunda açık hata) |

Davranış: kayıtlı ve aktif kullanıcıya, aynı kullanıcı için son 60 sn içinde token üretilmediyse, tek kullanımlık token içeren e-posta gider. Yeni token öncekini geçersiz kılar. Token **30 dakika** geçerlidir. SMTP hatası yanıtı DEĞİŞTİRMEZ (yalnızca loglanır).

Rate limit (süreç-içi, kayan pencere; env ile ayarlanır): IP+e-posta başına **3/saat** (`PASSWORD_RESET_RATE_LIMIT_MAX`), IP başına **10/saat** (`PASSWORD_RESET_RATE_LIMIT_IP_MAX`), pencere `PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` (3600000).

## 3. `confirmPasswordReset` — AÇIK (kimliksiz)

`POST /api/AccountService/confirmPasswordReset`

İstek: `{ "token": string, "newPassword": string }`. `token` e-posta bağlantısındaki `?token=` değeridir.

Başarı `200`: `{ "success": true }`. **Oturum AÇMAZ, çerez basmaz** — kullanıcı yeni parolayla giriş yapar. Kullanıcının TÜM oturumları düşer (`tokenVersion` +1); kilit/`failedLoginAttempts` temizlenir; e-posta doğrulanmış sayılır (bağlantıyı alan posta kutusunun sahibi olduğunu kanıtladı); bekleyen diğer sıfırlama token'ları ölür; "parolanız değiştirildi" e-postası gider.

| HTTP | code | Durum |
|---|---|---|
| 400 | `TOKEN_INVALID` | token geçersiz / süresi dolmuş / zaten kullanılmış / biçimsiz — **hepsi AYNI yanıt** (ayırt edilemez) |
| 400 | `WEAK_PASSWORD` | parola politikası (kullanıcının e-posta/ad/soyadını içermemeli). **Token yanmaz**; aynı token güçlü parolayla tekrar denenebilir |
| 400 | `INVALID_REQUEST` | `newPassword` string değil/boş/>1024 |
| 429 | — | IP başına 20 deneme / 10 dk (`ACCOUNT_TOKEN_RATE_LIMIT_MAX`, `_WINDOW_MS`) |

Tek kullanım atomiktir: eşzamanlı iki istekten yalnızca biri başarılı olur.

## 4. `verifyEmail` — AÇIK (kimliksiz)

`POST /api/AccountService/verifyEmail` — İstek `{ "token": string }`. Başarı `200 { "success": true }` (çerez basmaz; oturumları düşürmez). Hata: `400 TOKEN_INVALID` (geçersiz/süresi dolmuş/kullanılmış/biçimsiz; aynı yanıt), `429` (confirm ile aynı kova). Token **24 saat** geçerli, tek kullanımlık. Kullanıcı bağlantıyı başka tarayıcıda açabileceği için kimliksizdir. Parola sıfırlama token'ı burada, doğrulama token'ı orada KULLANILAMAZ (amaç ayrımı).

## 5. `resendVerificationEmail` — kimlikli (kademe: member)

`POST /api/AccountService/resendVerificationEmail` — İstek gövdesi boş. Başarı `200 { "success": true }` ya da zaten doğrulanmışsa `{ "success": true, "alreadyVerified": true }`. Hatalar: `429 COOLDOWN` (60 sn), `502 MAIL_FAILED` (SMTP hatası; ayrıntı sızmaz), `503 EMAIL_NOT_CONFIGURED`, `401`.

## 6. Davet (ADR-0028 WP-A4) — `UserService/*` (kademe: admin) + AÇIK `AccountService/*`

Token 256 bit rastgele, DB'de YALNIZ sha256 (`Invitations.tokenHash`), **7 gün**, tek kullanım (atomik `pending -> accepted`). E-posta bağlantısı: `${PUBLIC_APP_URL}/invite#t=<token>` (fragment; sunucu günlüğüne/Referer'a düşmez; FE okuyunca `history.replaceState` ile siler).

| Uç | Kimlik | Girdi -> Çıktı / Hatalar |
|---|---|---|
| `UserService/inviteUser` | admin (`users:manage`) | `{email, role: 'admin'\|'operator'}` -> `{id,email,role,status,expiresAt,expired,invitedBy,createdAt}` (token/özet ASLA dönmez). `403` rol tavanı (`owner` davetle verilemez; kendi kademesinden yüksek rol yok), `409 ALREADY_MEMBER` / `409 EMAIL_TAKEN` (başka mağazaya bağlı; Aşama 1-2 tek üyelik), `403 PLAN_LIMIT_REACHED` (limits.users: aktif üye + bekleyen davet), `429 INVITATION_RATE_LIMITED` (tenant başına 20/saat), `502 MAIL_FAILED` (davet kayıtlı kalır -> `resendInvitation`), `503 EMAIL_NOT_CONFIGURED` |
| `UserService/resendInvitation` / `revokeInvitation` | admin | `{invitationId}` -> davet DTO / `{success:true}`; yeni token eskisini öldürür. `404` (bekleyen değil) |
| `UserService/listInvitations` | admin (`users:read`) | `{status?: 'pending'\|'accepted'\|'revoked'}` -> `{invitations: [...]}` (en çok 200; `expired` bayrağı) |
| `AccountService/getInvitation` | **AÇIK**, `accountTokenLimiter` | `{token}` -> `{tenantTitle, role, email (maskeli), expiresAt}`. `400 INVITATION_INVALID`, `410 INVITATION_EXPIRED\|INVITATION_REVOKED`, `409 INVITATION_ACCEPTED` |
| `AccountService/acceptInvitation` | **AÇIK**, `accountTokenLimiter` | `{token, name, surname, password}` -> `{success:true}` (oturum AÇMAZ; FE giriş sayfasına yönlendirir). Parola politikası token TÜKETİLMEDEN uygulanır (`400 WEAK_PASSWORD` daveti yakmaz). Kullanıcı `emailVerified:true` doğar. Yeni kullanıcı (merkezi Users + moda göre tenant kopyası + Membership) tek işlemde; hata halinde geri alınır |

Mevcut kullanıcıya üyelik ekleme (çoklu üyelik) **Aşama 3**'tedir (ADR-0028 §7.3, §12); bugün başka mağazaya bağlı e-posta için genel `409 EMAIL_TAKEN` döner.

## 7. Askıya alma — `UserService/suspendUser` / `reactivateUser` (admin)

`{userId, reason?}` (`userId`: FE kullanıcı listesindeki tenant kopyası `_id`'si ya da merkezi `_id`) -> `{success:true, status}`. Sahibe yalnız sahip dokunur; kendine dokunulamaz (`403`); son aktif sahip askıya alınamaz (`409 LAST_OWNER`; işlem sonrası yeniden sayım + telafi). Yazılanlar: `Memberships.status/suspendedAt/By/Reason` (dual+membership), legacy `Users.isActive` (merkezi + tenant kopyası; legacy+dual), `tokenVersion++` ve kimlik önbelleği temizliği -> hedefin oturumları anında düşer (çok pod'da `AUTH_IDENTITY_CACHE_TTL_MS` kadar gecikme). İkinci askı idempotenttir.

## 8. Adım-yükseltme — `AccountService/reauthenticate` (member, kimlikli)

`{password}` -> `{success:true, reauthValidUntil}` (5 dk). Yanlış parola `400 INVALID_CURRENT_PASSWORD` (401 DEĞİL) + login ile aynı kilit sayacı. **Mekanizma sunucu taraflıdır** (`Users.reauthAt`; kullanıcı bazlı, oturum bazlı değil); ADR'nin `reauth_at` çerez claim'ine geçiş `operations/users/reauth.ts` içinde tek dosyalık değişikliktir. Step-up gerekip süresi geçmişse işlem `401 REAUTH_REQUIRED` döner; FE parola diyaloğu açıp `reauthenticate` + asıl isteği yineler.

## 9. Sahiplik devri (iki adım; ADR-0028 Karar 5.5)

1. `UserService/initiateOwnershipTransfer {targetUserId}` (yalnız sahip, **step-up**): hedef aktif + e-postası doğrulanmış üye olmalı (`409 TARGET_NOT_ACTIVE|TARGET_EMAIL_UNVERIFIED|ALREADY_OWNER`). `AccountTokens purpose='ownership_transfer'` (72 saat, tek kullanım, yalnız sha256; tenant başına TEK bekleyen: yenisi eskisini öldürür). Hedefe e-posta `${PUBLIC_APP_URL}/accept-ownership#t=<token>` + uygulama içi bildirim `SECURITY_OWNERSHIP_TRANSFER_REQUESTED`. Yanıt `{success, transferId, expiresAt}`. `cancelOwnershipTransfer` (sahip) bekleyeni iptal eder.
2. `UserService/acceptOwnershipTransfer {token}` (**hedef, oturum açıkken**): sıra hedef `owner` -> eski sahip `admin` (ara durumda 0 sahip yok); ikinci adım başarısızsa birincisi geri alınır ve belirteç yeniden kullanılabilir kalır. İki tarafın `tokenVersion`'ı artar (yeniden giriş). Geçersiz/başkasına ait/süresi dolmuş/kullanılmış belirteç: hep `400 TOKEN_INVALID`. Audit: `ownership.transfer.request|accept|cancel` + `membership.role_change`; bildirim `SECURITY_OWNERSHIP_TRANSFERRED`.

Tüm bu uçlar `imp:true` (impersonation) oturumunda `403`. Audit meta'da hedef kullanıcı (`targetUserId`), eski/yeni rol (`fromRole/toRole`) ve durum (`fromStatus/toStatus`) bulunur; e-posta/token yazılmaz.

## Kayıt ve `emailVerified`

- `SecurityService.register` başarısından sonra (yanıtı geciktirmeden, arka planda, best-effort) doğrulama e-postası gönderilir. E-posta/SMTP/`PUBLIC_APP_URL` hatası **kaydı bozmaz** (yalnızca uyarı loglanır).
- Profil DTO'su (`login`/`register`/`userContext`/`selectStore` yanıtlarındaki kullanıcı) artık **her zaman boolean `emailVerified`** taşır. Alanı olmayan (eski) kullanıcılar `false` döner.
- **Doğrulanmamış hesap girişten ENGELLENMEZ** (en muhafazakâr varsayılan). Zorunlu kılmak (kısıtlı mod / giriş engeli) ayrı insan kararıdır.

## Parola politikası (tek yerde: `operations/account/passwordPolicy.ts`)

En az 10 karakter; 10–15 karakterlik parolalar en az 3 sınıf (küçük/büyük/rakam/sembol) içermeli, 16+ karakterli parola cümlesi için sınıf şartı yok; en çok 72 bayt (bcrypt); yaygın-parola kara listesi; tekrarlayan/ardışık/aynı-birim-tekrarı yasak; e-posta yerel kısmı, ad veya soyadı (≥4 karakter) içeremez. `changePassword` ve `confirmPasswordReset` aynı fonksiyonu kullanır.

## E-posta bağlantıları (FE'nin uygulaması gereken rotalar)

`PUBLIC_APP_URL` (env; https zorunlu, yalnızca `localhost`/`127.0.0.1` için http; sorgu/parça/kimlik bilgisi yok) tabanıyla:

- `${PUBLIC_APP_URL}/reset-password?token=<token>` → FE formu `confirmPasswordReset({ token, newPassword })` çağırır.
- `${PUBLIC_APP_URL}/verify-email?token=<token>` → FE sayfası açılışta `verifyEmail({ token })` çağırır (GET ile yan etki YOKTUR; e-posta tarayıcıları bağlantıyı önden açsa da token yanmaz).
- FE önerileri: token'ı okuduktan hemen sonra `history.replaceState` ile URL'den sil; bu iki sayfada `Referrer-Policy: no-referrer` ver; token'ı loglama/analitiğe gönderme.

## Veri modeli ve güvenlik kararları

- Yeni koleksiyon `ApplicationDB.AccountTokens`: `{ sub, purpose ('password_reset'|'email_verify'), tokenHash (sha256, tekil indeks), createdAt, expiresAt (TTL indeks, expireAfterSeconds 0), usedAt?, ip? }`. **Düz token asla saklanmaz/loglanmaz/API yanıtına ve audit'e girmez**; 256 bit rastgele. İlk çalıştırmada Mongoose koleksiyon/indeksleri oluşturur (yeni koleksiyon; mevcut veri değişmez).
- `Users` yeni alanlar: `emailVerified` (bool, varsayılan false), `emailVerifiedAt`, `passwordChangedAt`. Şema `strict:false`; mevcut kayıtlara göç GEREKMEZ.
- Oturum iptali: `Users.tokenVersion` +1 (ADR-0001 Karar 4). `changePassword` CAS ile yazar (eşzamanlı ikinci değişim 409).
- Tenant DB'sindeki kullanıcı kopyasının parola özeti (UserService iki yere yazıyordu) best-effort eşitlenir; giriş yalnızca merkezi Users'a bakar, eşitleme hatası akışı bozmaz.
- Kullanıcı numaralandırma: `requestPasswordReset` yanıtı, durumu ve zamanlaması kullanıcıdan bağımsız; rate limit eşikleri varlıktan bağımsız; audit kaydı biçimi aynı (yalnızca `ip`). Token hataları tek yanıt.
- Denetim (`AuditLogs`, PII yok — e-posta/parola/token yazılmaz): `user.password_change` (ok/fail; `meta.reason`: `wrong_current|weak_password|same_password`), `password_reset.request` (ok; yalnızca ip), `password_reset.confirm` (ok: sub+tid; fail: ip), `email.verify` (ok/fail), `email.verify_resend`.
- E-posta gönderimi mevcut `MailService` (Zoho SMTP env'leri: `ZOHO_SMTP_*`, `FROM_*`) üzerindendir; testlerde ASLA gerçek SMTP yoktur (mock). Şablonlar sade Türkçe metin(+HTML); ad/soyad şablona konmaz; gerçek alan adı kodda yoktur.
- Süreç-içi rate limit tek replika varsayar (ADR-0001 Karar 10 ile aynı; 2+ replikada Redis'e taşınmalı).

## Açık insan kararları / bulgular

1. **E-posta doğrulamasını zorunlu kılma** (giriş engeli / kısıtlı mod / grace süresi) — şu an yalnızca bilgi (`emailVerified`). Eski kullanıcıların toplu doğrulama e-postası (backfill) ve göç ayrı karar.
2. **Canlı SMTP**: Zoho env'lerinin (`ZOHO_SMTP_HOST/PORT/USER/PASS`, `FROM_EMAIL`) ve `PUBLIC_APP_URL`'in staging/prod'da tanımlanması + gönderici alan adı için SPF/DKIM/DMARC (teslim edilebilirlik) insan işidir; kodda gerçek gönderim doğrulanmadı.
3. **Kayıt akışı parola politikası hâlâ eski** (`provisionInput.ts`: en az 8 karakter). Yeni tek politikaya birleştirmek kayıt sözleşmesini ve mevcut characterization testlerini değiştirir → karar gerekir.
4. **`UserService.updateUser` e-postayı değiştirebilir** ve `emailVerified`'ı sıfırlamaz / yeniden doğrulama istemez; ayrıca yöneticinin başkasının parolasını eski parola olmadan yazması sürüyor (`createUser`/`updateUser`) — davet bağlantılı akış (FRONTEND_GAP N11) bunu kapatır.
5. Süper yönetici (`isGlobalAdmin`) hesapları da e-posta ile sıfırlanabilir (tek faktör: posta kutusu). Platform yöneticileri için sıfırlamayı kapatma/ek doğrulama istenirse ayrı karar (2FA yok).
6. `GET /api/AccountService` → 403 (kayıtsız `get`); `AccountService` için başka genel metot yok.

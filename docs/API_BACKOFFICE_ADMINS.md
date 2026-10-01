# Backoffice platform yöneticisi yönetimi — API sözleşmesi (B12)

ADR-0026 + `docs/BACKOFFICE_PLAN.md` §2.8 (B12). Yüzey: `/admin-api` (yalnız platformAdmin, TOTP tamamlanmış tam oturum). Kaynak kod: `backend/src/api/rpc/handlers/backoffice-admin-user-service.ts` (ince sarmalayıcı), `backend/src/api/admin/adminUserManager.ts` (kurallar), şemalar `backend/src/capabilities/rpc-input/backoffice.ts`, yetenekler `backend/src/capabilities/domains/backoffice.ts` (`platform.admins.*`).

## Genel kurallar

- Servis adı **`BackofficeAdminUserService`** (plan §2.8 ve `admin/stepUp.ts REAUTH_RPCS` ile aynı). Her uç `POST /admin-api/BackofficeAdminUserService/<operasyon>`, JSON gövde, çerezle oturum (`credentials: 'include'`), yazmada `Origin` zorunlu. Başarı: 200 + JSON.
- Gövde `strict` (bilinmeyen alan → `400 VALIDATION`). `sub` = 24 hex `Users._id` (nesne/operatör reddedilir).
- **Yazan dört uç (`invite`, `disable`, `enable`, `resetMfa`) STEP-UP ister:** son 5 dk içinde `BackofficeAuthService/reauth` (parola + TOTP) yoksa `401 REAUTH_REQUIRED`; ayrıca gövdede **`reason` (≥10, ≤500 karakter)** zorunludur (yoksa `400 VALIDATION`). `list` step-up istemez.
- Denetim (`AuditLogs`, `surface:'backoffice'`): her yazma RunOperation'dan `backoffice.write` (`meta.reason`) + hedefi içeren özel olay: `backoffice.admin.invite`, `.invite_revoke`, `.disable`, `.enable`, `.mfa_reset`, `.invite_accept` (`meta.targetSub`, `meta.reason`). E-posta, token, sır hiçbir kayıtta yoktur.
- Hata kodları (`docs/ERROR_CODES.md`): `ADMIN_SELF_ACTION` (403), `LAST_PLATFORM_ADMIN` (409), `ADMIN_INVITE_EXISTING_USER` (409), `ADMIN_INVITE_INVALID` (400), `ADMIN_INVITE_UNAVAILABLE` (503), ayrıca `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `REAUTH_REQUIRED`, `WEAK_PASSWORD`.

## `list` — yönetici listesi
Girdi: `{}`. Yanıt (en çok 200; `createdAt` artan):
```json
{ "items": [ { "sub": "64b…", "email": "ada@…", "name": "Ada", "surname": "Yılmaz", "status": "active", "mfaEnabled": true,
               "lastLoginAt": "2026-09-30T10:00:00.000Z", "locked": false, "createdAt": "2026-01-01T00:00:00.000Z" } ] }
```
- `status`: `active` | `disabled` (`isActive:false`) | `invited` (davet bekliyor; `name/surname` yer tutucudur).
- `lastLoginAt`: son başarılı **tam giriş** (TOTP doğrulaması/kaydı; denetim kaydından) — yoksa `null`.
- `locked`: parola kilidi (`lockUntil`) VEYA TOTP kilidi aktif.
- Yanıtta parola özeti, TOTP sırrı, kurtarma kodu/özeti ASLA yoktur (alanlar beyaz listeli).

## `invite { email, reason }` — yeni platform yöneticisi daveti
- Yeni e-posta: bekleyen bir hesap taslağı (`isActive:false`, giriş yapamaz) + 256 bit tek kullanımlık token (**DB'de yalnız sha256**, 48 saat) oluşturulur ve e-posta gider. Bağlantı: `<ADMIN_CORS_ORIGINS ilk girdisi>/accept-invite#t=<token>` (fragment: sunucu günlüğü/Referer görmez). Token yanıta/denetime/loga GİRMEZ.
- Yanıt: `{ "sub": "64b…", "status": "invited", "expiresAt": "…", "renewed": false }`. Aynı e-postaya tekrar çağrı bekleyen daveti **yeniler** (`renewed:true`, eski bağlantı geçersiz olur).
- **Güvenli varsayılan:** e-posta mevcut bir kullanıcıya (tenant kullanıcısı ya da yönetici) aitse `409 ADMIN_INVITE_EXISTING_USER` — mevcut kullanıcıya platform yetkisi VERİLMEZ; ayrı e-posta gerekir. (Mevcut hesaba yetki verme ayrı bir insan kararıdır.)
- `503 ADMIN_INVITE_UNAVAILABLE`: backoffice adresi yapılandırılmamış (hiçbir şey yazılmaz) ya da e-posta gönderilemedi (taslak kalır; aynı çağrı tekrarlanarak yeniden gönderilir).

## `BackofficeAuthService/acceptInvite { token, name, surname, password }` — davet kabulü (KİMLİKSİZ)
Backoffice kabul sayfası `#t=` parçasını okur, ad/soyad/parola toplar ve bu ucu çağırır (yalnız `ADMIN_CORS_ORIGINS` kaynağından; giriş hız sınırlayıcısı uygulanır).
- Sıra: biçim → parola politikası (zayıfsa `400 WEAK_PASSWORD`, **token yanmaz**) → atomik tek kullanım → hesap etkinleşir (`emailVerified:true`).
- Yanıt: `{ "accepted": true }`; **oturum/çerez açılmaz.** FE kullanıcıyı giriş ekranına yönlendirir; ilk girişte TOTP kaydı zorunludur (mevcut akış: `enrollRequired:true`).
- Geçersiz / süresi dolmuş / kullanılmış / iptal edilmiş token hepsi aynı: `400 ADMIN_INVITE_INVALID` (ayrıştırılmaz).

## `disable { sub, reason }`
- Kendini kapatamaz → `403 ADMIN_SELF_ACTION`.
- Son aktif platform yöneticisi kapatılamaz → `409 LAST_PLATFORM_ADMIN` (kapatmadan sonra yeniden sayılır; eşzamanlı karşılıklı kapatma yarışında işlem geri alınır).
- Başarı: `isActive:false`, `tokenVersion++` (tüm oturumları anında geçersiz), kimlik önbelleği temizlenir. Yanıt `{ "sub", "status": "disabled" }`. İdempotent.
- Hedef **davet bekleyen** ise taslak silinir, token iptal olur → `{ "sub", "status": "revoked" }` (davet iptali).
- Hedef yönetici değilse `404`.

## `enable { sub, reason }`
Kapalı yöneticiyi açar (`isActive:true`, parola kilidi/deneme sayacı temizlenir, `tokenVersion++`). Yanıt `{ "sub", "status": "active" }`; zaten aktifse aynı yanıt. Davet bekleyen hesap açılamaz (`409 CONFLICT`; kabul edilmelidir).

## `resetMfa { sub, reason }`
Hedefin `AdminMfa` kaydı silinir (sonraki girişte TOTP yeniden kaydedilir: `enrollRequired:true`); hedefin mevcut oturumları da kapanır (`tokenVersion++`). Kendi MFA'sını sıfırlayamaz → `403 ADMIN_SELF_ACTION`. Davet bekleyen hesapta MFA yoktur → `409 CONFLICT`. Yanıt `{ "sub", "mfaEnabled": false }`.

## Acil durum: tüm yöneticiler kilitli
Yalnız YEREL: `cd backend && npm run admin:reset-mfa -- --email=<adres>` (DRY-RUN) / `… --apply`. Kapılar: yalnız `127.0.0.1` (`--allow-remote` reddedilir), izinli 7 DB, hedef `isGlobalAdmin` olmalı; `--apply` `AdminMfa` kaydını siler, oturumları kapatır, parola kilidini temizler ve `backoffice.admin.mfa_reset` (actorType `system`, `via:'local-script'`) yazar. Uzak/Atlas ortamda kullanılmaz.

## Bilinçli sınırlar
- Davet başına hız sınırı/cooldown yok (yalnız platform yöneticisi + step-up ister; tetikleyici: kötüye kullanım gözlenirse).
- Yönetici silme ve e-posta/ad değiştirme bu işte yoktur (`disable` kalıcı silme değildir).
- `lastLoginAt` denetim kaydından türetilir (AuditLogs 365 gün TTL; daha eski giriş `null` görünebilir).

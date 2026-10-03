# Google ile giris / kayit

Kapsam: `frontend` uygulamasi icin "Google ile giris; kayitli degilse kayit". Kod: `backend/src/operations/account/googleIdToken.ts`
(dogrulama + signupToken), `backend/src/api/services/security-service.ts` (`googleSignIn`, `register`), `backend/src/api/ApiManager.ts` (rotalar).
Yeni bagimlilik yok (Node `crypto`). Canli Google'a yerel testte istek ATILMAZ (testler sahte JWKS ile).

## Sozlesme

| Uc | Kimlik | Yanit |
|---|---|---|
| `GET /api/SecurityService/authConfig` | yok (onbellek `max-age=300`) | `{ googleClientId: string \| null }` (`GOOGLE_OAUTH_CLIENT_ID`; yoksa `null` = onyuz dugmeyi gizler) |
| `POST /api/SecurityService/googleSignIn` `{ credential }` YA DA `{ code }` | yok (`loginLimiter`) | kullanici VARSA: parola girisiyle ayni yanit + cerez + `status:'ok'` (super yonetici: `requireStoreSelection...` + `status`); YOKSA cerez YOK: `{ status:'signup_required', signupToken, profile:{ email, name, picture? } }` |
| `POST /api/SecurityService/register` `{ registerValues, googleSignupToken }` | yok (`registerLimiter`) | mevcut kayit yaniti (profil DTO + cerez) |

`googleSignupToken` govdenin ust duzeyinde (veya `registerValues` icinde) kabul edilir. Belirtec varsa e-posta BELIRTECTEN alinir
(govdedeki e-posta farkliysa 400), parola zorunlu degildir (verilmezse kullanilmaz rastgele parola ozeti yazilir; giris Google ile, ileride
"parola belirle" = mevcut parola sifirlama akisi), `googleSub` kaydedilir, `emailVerified=true`. Ad/soyad/magaza adi vb. ve hiz siniri kurallari aynen.

Hatalar (`code` alani): `GOOGLE_DISABLED` 503, `GOOGLE_TOKEN_INVALID` 401, `GOOGLE_EMAIL_UNVERIFIED` 403, `GOOGLE_ACCOUNT_MISMATCH` 409;
pasif/kilitli kullanici icin parola girisindeki genel 401 (`E-posta veya parola hatali`); gecersiz/suresi dolmus signupToken icin `TOKEN_INVALID` 400.

## Authorization code (popup) akisi

Onyuz kendi dugmesiyle `google.accounts.oauth2.initCodeClient({ client_id, scope: 'openid email profile', ux_mode: 'popup' })` kullanip `code` gonderebilir.
Sunucu `https://oauth2.googleapis.com/token`'a form-urlencoded POST yapar (`code`, `client_id`, `client_secret=GOOGLE_OAUTH_CLIENT_SECRET`,
`redirect_uri=postmessage`, `grant_type=authorization_code`; 8 sn zaman asimi, 64 KB govde tavani), yanittaki `id_token`'i `credential` ile AYNI dogrulamadan
gecirir ve sonrasi birebir ayni akistir. `access_token`/`refresh_token` saklanmaz, loglanmaz, yanita girmez. Token ucu hata yaniti -> `GOOGLE_TOKEN_INVALID` (govde yansitilmaz).
`credential` ve `code` yoksa 400. `GOOGLE_OAUTH_CLIENT_SECRET` yoksa `code` yolu `GOOGLE_DISABLED` (503); `credential` yolu etkilenmez.
Google Console'da ek ayar gerekmez (popup kod akisi `postmessage` kullanir; yetkili JavaScript kaynaklari yeterli). Secret yalniz `.env`/ortamda tutulur.

## Dogrulama kurallari

RS256 imza (Google JWKS `https://www.googleapis.com/oauth2/v3/certs`, `Cache-Control: max-age`'e gore bellekte; bilinmeyen `kid` en cok dakikada bir
yeniden cekim), `aud === GOOGLE_OAUTH_CLIENT_ID`, `iss` in {`accounts.google.com`, `https://accounts.google.com`}, `exp`/`iat` (+-60 sn), `email_verified === true`.
`signupToken`: sunucu JWT sirriyla HS256, `aud`/`typ` = `google-signup`, 15 dk; oturum dogrulayicisi `aud:'web'` zorunlu kildigindan oturum belirteci olarak ASLA gecmez
(ve tersi). Belirtec tek kullanimlik DEGILDIR; ayni belirtecle ikinci kayit e-posta zaten kayitli oldugundan mevcut "e-posta kullanimda" (409) hatasina duser.

Var olan kullanici + `googleSub` bos: bagla (Google e-postayi dogruladi; `emailVerified=true` yapilir). Dolu ve farkli: `GOOGLE_ACCOUNT_MISMATCH`.
Audit `login` olayi `meta.method:'google'` (e-posta/token yazilmaz).

## Giden istek / egress

K7 izin listesi: `ALLOWED_OUTBOUND_HOSTS['google-auth'] = ['www.googleapis.com', 'oauth2.googleapis.com']` (adaptor degil). Yerel `npm run start:local` egress guard varsayilan olarak
KAPALIDIR; gercek Google ile denemek icin (yalniz insan) `EGRESS_ALLOW_GOOGLE_AUTH=1` (yalniz bu iki host acilir).

## Ortam / sema / goc

- `GOOGLE_OAUTH_CLIENT_SECRET` (SIR; yalniz `code` akisi icin; bos = code yolu kapali).
- `GOOGLE_OAUTH_CLIENT_ID` (`backend/.env.example`; sir degil, bos = ozellik kapali).
- `Users.googleSub` (istege bagli, profil DTO'sunda donmez). Seyrek tekil indeks `uniq_googleSub`: `backend/migrations/0025-users-google-sub-app.js`
  (CALISTIRILMADI; CLAUDE.md kural 3: yedek dogrulanmadan DB degismez; once yerel, Atlas ayri onay). Indeks olmadan da kod calisir (E11000 yakalanir) ama sub tekilligi yalniz goc ile saglanir.

## Insan adimi (Protokol 12): Google Cloud Console'da OAuth istemcisi

1. Google Cloud Console > APIs & Services > OAuth consent screen: uygulama adi, destek e-postasi, yetkili alan adlari (`entegrasyonik.com`); kapsamlar yalniz varsayilan (`openid`, `email`, `profile`).
2. Credentials > Create credentials > OAuth client ID > Uygulama turu: **Web uygulamasi**.
3. **Yetkili JavaScript kaynaklari:** `https://app.entegrasyonik.com` ve yerel `http://localhost:3020`. (Yonlendirme URI'si gerekmez: Google Identity Services ID token akisi.)
4. Olusan Client ID'yi ortamlara `GOOGLE_OAUTH_CLIENT_ID` olarak yaz (yerel `backend/.env`, staging/production ortam degiskeni). Client secret yalniz `code` (popup) akisi icin `GOOGLE_OAUTH_CLIENT_SECRET` olarak ortama yazilir (commit'lenmez).
5. Uretimde OAuth onay ekranini "In production" yap (test modunda yalniz tanimli test kullanicilari girebilir).

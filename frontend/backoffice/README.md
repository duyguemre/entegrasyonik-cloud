# Entegrasyonik Yönetim (backoffice) — admin.entegrasyonik.com

ADR-0026 / BACKOFFICE_PLAN. Vite + Vue 3 + Vuetify 3, ortak tasarım sistemi `@entegrasyonik/ui` (aynı token/tema,
iki temada dark). Electron yok.

## Komutlar (`frontend/` kökünden)
```bash
npm install                      # workspaces: packages/ui + backoffice tek lock'la kurulur
npm run dev:backoffice           # http://localhost:3100 — dev'de sahte /admin-api (örnek hesaplar giriş ekranında)
npm run build:backoffice         # backoffice/dist (sahte API üretim paketine GİRMEZ)
npm run test:backoffice          # backoffice + ui vitest
npm run typecheck -w @entegrasyonik/backoffice
npx playwright test -c backoffice/playwright.config.ts --update-snapshots=missing   # duman testleri (3 proje)
BO_REVIEW=1 npx playwright test -c backoffice/playwright.config.ts e2e/specs/review.spec.ts --project=chromium-desktop  # docs/review kareleri
```
Bulutta Chromium yolu: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. Müşteri uygulamasının komutları (`npm run dev`,
`npm run build`, `npx vitest run`) aynen çalışır.

**Gerçek backend'e geçiş:** `VITE_ADMIN_API_BASE=https://api.entegrasyonik.com/admin-api` (yerelde ör.
`http://localhost:5001/admin-api`). Değişken doluysa sahte API devreden çıkar. `VITE_ADMIN_ENV=local|staging|production`
üst bardaki ortam rozetini belirler.

**Sahte API ile deneme:** `yonetici@ornek.test` (kayıtlı, TOTP) · `yeni.yonetici@ornek.test` (ilk giriş: QR + kurtarma
kodları) · parola `ornek-parola` · TOTP: `000000` dışında 6 hane · kurtarma kodu örn. `k7m2-q9xd`. Konsolda
`__boMock.expireReauth()` → bir sonraki geçici erişimde adım-yükseltmesi diyaloğu; `__boMock.setDegraded(true)` → Redis
düşük; `__boMock.expireSession()` → oturum düşer.

## Yerleşim
```
src/api/contract.ts      /admin-api sözleşmesi — TEK şekil kaynağı (istemci + sahte API + sözleşme testleri)
src/api/client.ts        axios örneği (withCredentials, global interceptor yok), hata zarfı → AdminApiError,
                         REAUTH_REQUIRED → step-up diyaloğu → tek yenileme, 401 → oturum düştü, MFA_REQUIRED
src/api/mock/            sahte sunucu (oturum durumlu) + axios adapter + örnek veri (yalnız dev)
src/auth/machine.ts      giriş durum makinesi (saf): booting → signedOut → verify|enroll → recovery → signedIn
src/navigation/screens.ts statik ekran kaydı (DB menus yok) — 5 bölüm, 13 ekran (4 hazır/taslak + 9 planlanan)
src/views/               Login, Overview, Tenants(+Detail), LogCenter (taslak), Audit, Planned
src/components/          TopBar, ReauthDialog, TraceDialog, StatusTile, Sparkline, BarTrend, QrCode, ToastHost
```

## Sözleşme tablosu (sahte API ↔ backend)
| Operasyon | Durum | Not |
|---|---|---|
| `BackofficeAuthService/login {email,password}` → `{mfaRequired, enrollRequired}` | 2-BE | yarım oturum 5 dk; bilinmeyen e-posta = yanlış parola (numaralandırma yok) |
| `…/enrollTotp` → `{otpauthUri}` · `…/confirmTotp {code}` → `{recoveryCodes[10]}` | 2-BE | kayıt tam oturum açar; kodlar yalnız bu yanıtta |
| `…/verifyTotp {code \| recoveryCode}` | 2-BE | yanıt gövdesi kullanılmaz, ardından `me`; 5 hatalı → 429 kilit |
| `…/reauth {password, code}` → `{reauthAt}` · `…/logout` · `…/me` | 2-BE | step-up 5 dk; girişte de yazılır |
| `BackofficeTenantService/startImpersonation {tid, reason≥10}` → `{url}` | 2-BE | step-up; URL yalnız `window.open(url,'_blank','noopener,noreferrer')` |
| `AdminService/getClients` | MEVCUT | `clientDto` beyaz listesi |
| `AdminService/getSystemHealth` (altküme) · `GET /health` · `GET /ready` | MEVCUT | `/ready` 503 de gövde döner |
| `BackofficeTenantService/getLifecycle {tid}` · `cancelDeletion {tid, reason}` | BE HAZIR (B2) | `src/api/contracts/billing.ts`; müşteri detayı → Yaşam döngüsü sekmesi |
| `LogCenterService/listLogs · getIssueGroups · getIssueTrend · getVolumeByCategory · getTrace` | PLAN L6–L8 | şekil öneri (`category` ekseni öneri) |
| `BackofficeAuditService/search` | PLAN B10 | alanlar 2-BE `AuditLogs` şeması; önce/sonra `meta.b_*`/`meta.a_*` |

Hata kodları (ERROR_CODES.md): `UNAUTHENTICATED` (401 → girişe dön), `MFA_REQUIRED` (403 → girişe dön), `REAUTH_REQUIRED`
(401 → step-up), `VALIDATION` (+`fields`), `RATE_LIMITED`, `IMPERSONATION_UNAVAILABLE`, `NOT_FOUND`.

### Aşama 4 (bo-p2) — BE HAZIR, tipler `src/api/contracts/*.ts`, sahte uçlar `src/api/mock/ops/*.ts`
| Grup | Uçlar | Ekran |
|---|---|---|
| B7a-d | `BackofficeEngineService/getQueues · listFailedJobs · retryJob · discardJob · getStateMachineJobs · releaseStuckLease · listJobRuns` | `/motor` |
| B5/B6/B6b/B6c | `BackofficeIntegrationService/getApiHealth · getResilienceState`, `IntegrationConfigService/getCatalog · getEffectiveConfig` | `/entegrasyonlar` |
| B8a-d, B9 | `BackofficeInfraService/getRedisStatus · getMongoStatus · getMongoCollections · getSlowQueries · getCacheMetrics · flushCacheFamily` | `/altyapi`, `/altyapi/onbellek` |
| B4a/b/c | `BackofficeBillingService/listSubscriptions · getSubscription · extendTrial · cancelSubscription · changePlan · getRevenueMetrics` | `/abonelikler`, `/abonelikler/:tid` |
| B11 + BO-CFG-1 | `IntegrationConfigService/getEffectiveConfig · saveDraft · discardDraft · previewPublish · publish · rollback · history` (`target:'_platform'`), `GET /api/public-config` | `/sistem/bayraklar` (Platform ayarları) |
| B12 | `BackofficeAdminUserService/list · invite · disable · enable · resetMfa`, `BackofficeAuthService/acceptInvite` | `/yoneticiler`, `/accept-invite#t=` |
| B3 | `BackofficeTenantService/startImpersonation` → `{url, expiresInSeconds}` | müşteri detayı "Müşterinin gözünden aç" |

Step-up listesi `REAUTH_OPS` backend `admin/stepUp.ts REAUTH_RPCS` ile testle eşlenir. Örnek davet bileti: `/accept-invite#t=ornekDavetBileti0000000000000000000000000000` (parola ≥12, harf+rakam). Test kolları: `docs/BO_UI_PATTERNS.md` bo-p2 eki.

## Güvenlik notları
- Kimlik yalnız HttpOnly `EK_ADMIN` çerezinde; kod token/oturumu hiçbir depoya yazmaz (statik test). localStorage'da yalnız
  tema tercihi (`ek-bo-theme`); sessionStorage'da yalnız dev sahte API oturumu.
- `index.html`: `robots noindex,nofollow`, `referrer no-referrer`; tema önyüklemesi harici eşzamanlı betik (CSP'de hash gerekmez).
- Sunucu başlıkları (barındırma ADR'si): `X-Robots-Tag`, `frame-ancestors 'none'`, sıkı `connect-src`, `Referrer-Policy`.

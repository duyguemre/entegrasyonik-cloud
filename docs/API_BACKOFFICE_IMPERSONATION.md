# Destek oturumu (impersonation) — API ve önyüz sözleşmesi (B3)

ADR-0026 Karar 4.9 + ADR-0028 Karar 9 + `docs/BACKOFFICE_PLAN.md` §2.2 (B3). Kaynak: `backend/src/api/admin/{AdminApiManager,impersonationTicket}.ts`, `backend/src/api/services/security-service.ts`, `backend/src/api/ApiManager.ts` (özel rotalar), merkezî yasak kuralı `backend/src/api/impersonationPolicy.ts`. Bu belge iki önyüz için sözleşmedir: **backoffice** (bileti alır, yeni sekme açar) ve **müşteri uygulaması** (`/impersonate` karşılaması + kalıcı bant). Önyüz kodu bu işte yazılmadı.

## 1. Akış

1. Backoffice: yönetici tenant ekranında "Müşteri gözünden aç" der; gerekçe ister (≥10, ≤500 karakter; ticket no vb.). Son 5 dk içinde `BackofficeAuthService/reauth` yapılmamışsa uç `401 REAUTH_REQUIRED` döner: önce `reauth` (parola + TOTP), sonra yeniden dene.
2. `POST /admin-api/BackofficeTenantService/startImpersonation` `{ tid, reason }` → `200 { url, expiresInSeconds: 60 }`. `url = <PUBLIC_APP_URL>/impersonate#t=<bilet>`: bilet **fragment'tadır** (sorgu dizesinde değil; sunucu logu/Referer görmez). Backoffice `url`'yi `window.open(url, '_blank', 'noopener,noreferrer')` ile açar; **url loglanmaz, saklanmaz, panoya kopyalanmaz**.
3. Müşteri uygulaması `/impersonate` rotası: fragment'tan `t`'yi okur, **hemen** `history.replaceState(null, '', '/impersonate')` ile adres çubuğundan siler, `POST /api/SecurityService/redeemImpersonation` `{ ticket }` çağırır (kimliksiz; çerez gerekmez). Başarıda sunucu HttpOnly oturum çerezini basar; gövde: `{ store: {clientId, title}, user: <profil DTO (yönetici kullanıcı)>, impersonation: { expiresAt } }`. Ardından uygulama normal açılış akışıyla (`GET /api/userContext`) ana ekrana yönlenir. Hata (`401`, tek genel mesaj: geçersiz/kullanılmış/süresi dolmuş/yönetici ya da tenant uygun değil) → "Bağlantı geçersiz veya süresi dolmuş; yönetim uygulamasından yenisini üretin" sayfası. Otomatik yeniden deneme YOK (bilet tek kullanımlık).
4. Oturum boyunca **kalıcı bant** (§3). "Bitir" → `POST /api/SecurityService/endImpersonation` (gövde `{}`; çerezi siler, denetime `impersonation.end` yazar) → sekme kapatılır (`window.close()`; olmazsa "Destek oturumu bitti" sayfası). Süre dolarsa (30 dk, yenilenmez; K41) istekler `401` döner: aynı sayfa gösterilir.

## 2. Uçlar

| Uç | Yüzey | Etki | Not |
|---|---|---|---|
| `BackofficeTenantService/startImpersonation {tid, reason}` | `/admin-api` | platformAdmin + step-up + gerekçe; hız sınırlı (IP başına `LOGIN_RATE_LIMIT_*` kovası; aşınca `429`) | Yalnız `ACTIVE` tenant (askıda/silme bekliyor/siliniyor/silindi → `400 VALIDATION`). Redis hazır değilse `503 IMPERSONATION_UNAVAILABLE`. |
| `SecurityService/redeemImpersonation {ticket}` | `/api` | açık (kimlik = bilet); `accountToken` hız sınırı | Bilet `GETDEL` ile atomik tüketilir. |
| `SecurityService/endImpersonation` | `/api` | yalnız `imp:true` oturum (aksi `400`) | Çerezi siler. |
| `GET /api/userContext` | `/api` | mevcut | Destek oturumunda ek alan `impersonation: { active: true, expiresAt (ISO), reason }` (bant sayfa yenilemesinde de çıksın). Normal oturumda alan yoktur. |

Bilet: 32 bayt rastgele (43 karakter base64url); Redis'te yalnız `imp:<sha256(bilet)>` (`SET NX EX 60`; ham bilet saklanmaz, bir Redis dökümü bilete yetmez); ikinci kullanım/süresi dolmuş/uydurma bilet hepsi aynı `401`. Redeem sırasında yönetici hâlâ geçerli olmalı (aktif, `isGlobalAdmin`, `tokenVersion` değişmemiş: başka yerden "tüm oturumları kapat" bileti de öldürür) ve tenant `ACTIVE` olmalı.

Oturum: HttpOnly çerez; JWT `imp:true`, `fx:true` (sabit ömür **30 dk** (K41; 60 dk'dan düşürüldü, uzatılamaz), sliding yenileme YOK), `sub` = yönetici (`impBy` aynı değer), `impReason` (≤200). Tenant `ACTIVE` kalmazsa ya da yönetici pasifleşir/`tokenVersion` değişirse oturum her istekte düşer (mevcut `authenticate` doğrulaması).

**Oturum rolü:** tenant sahibi (owner) DEĞİL. Yönetici tenant bağlamında `admin` kademesinde çalışır (`resolveTier`: platform yöneticisi → `admin`); ADR-0028'in `platform_support` (= admin − `users:manage`, `billing:manage`, `tenant:*`, `integrations:manage` yazma) eşdeğeri §4'teki merkezî yasakla uygulanır. Ayrı bir rol/üyelik kaydı oluşturulmaz.

## 3. Önyüz gereksinimleri (müşteri uygulaması)

- **Kalıcı bant:** `userContext.impersonation?.active` true iken uygulama kabuğunun en üstünde, kapatılamaz, yüksek kontrastlı bant: "Destek oturumu — <yönetici adı soyadı> — <tenant adı> — kalan süre mm:ss — [Bitir]". Yönetici adı `userContext` profil DTO'sundan (oturum yönetici kullanıcısıdır). `expiresAt`'e göre geri sayım; süre bitince oturum-sonu sayfası. Bant `role="region"` + `aria-label` ile erişilebilir olmalı; sayfa kaydırılsa da görünür kalır (sticky); tüm temalarda (light/dark) kontrast AA.
- Destek oturumunda yasak işlem düğmelerini gizlemek ZORUNLU değildir ama sunucu `403` döner (§4): istemci bu `403`'ü "Bu işlem destek oturumunda yapılamaz; yönetim uygulamasından yapın" diye gösterir (genel hata değil). Hesap silme, sahiplik devri, parola/kullanıcı yönetimi, faturalama, entegrasyon ayar kaydı ekranlarında düğmeleri `userContext.impersonation` varken devre dışı bırakmak önerilir (kolaylık; güvenlik sunucudadır).
- Yeni sekmede açıldığı için `noopener`; bilet hiçbir yerde (konsol, analitik, hata raporu, `client-log`) taşınmaz. `/impersonate` rotası `Referrer-Policy: no-referrer`.

## 4. Destek oturumunda reddedilen işlemler (`403 FORBIDDEN`)

Tek karar noktası `impersonationPolicy.ts` (`RunOperation.authorize` içinde, servis çalışmadan önce). Liste koda dağıtılmaz; yetenek kaydından türer:

| Kural | Türeme | Örnekler |
|---|---|---|
| `effect: 'destructive'` | kayıttaki her yıkıcı yetenek | tenant/hesap silme talebi (`TenantDataService/requestDeletion`), kullanıcı silme, anonimleştirme, ürün/sipariş silme |
| `external: true` | dışarıya/e-postaya/pazaryerine giden her yetenek | üye daveti (`inviteUser`/`resendInvitation`), sahiplik devri başlatma, `startCheckout`, sipariş/iade onayı, fatura/kargo oluşturma, `testConnection`, `retrieveAndSetExternalToken` |
| izin `users:manage` / `billing:manage` / `tenant:export` / `tenant:delete` (okuma dahil) | yetenek `permission` alanı | üye oluştur/güncelle (e-posta değişimi dahil)/askıya al/çıkar/davet iptal, faturalama, tenant verisi dışa aktarma |
| YAZMA olan `integrations:manage` / `tenant:transfer` | `permission` + `effect !== 'read'` | entegrasyon ayarları/sırları kaydetme (pazaryeri, e-ticaret, ERP, kargo), webhook belirteci üretme, sahiplik devri iptali |
| açık küçük liste `IMP_DENIED_CREDENTIAL_RPCS` | kayıtta `self:manage`/`member` görünür | `AccountService/changePassword`, `AccountService/reauthenticate`, `UserService/acceptOwnershipTransfer` |

Entegrasyon sırlarının **görülmesi**: hiçbir yanıtta sır dönmez (DB'de `enc:v1:`, API'de `'sensitive'` maskesi) — destek oturumu bunu değiştirmez. `integrations:manage` okumaları (sağlık vb.) destek için açıktır. 2FA: tenant tarafında 2FA yoktur (yalnız backoffice'te). LIVE_READONLY: dış yazma yapan her yetenek `external` olduğundan zaten reddedilir; `LIVE_READONLY=1` katmanı ayrıca bağımsız çalışır — destek oturumu dış yazmayı açmaz. Eski `selectStore` tabanlı imp oturumu (`fx` yok) `ADMIN_API_ONLY=true` olana kadar eski davranışta kalır (Aşama 3 ile kapanır).

## 5. Denetim (tenant görünürlüğü)

- `impersonation.start` (backoffice; `tid` bilerek boş → platform-içi; `onBehalfOf=tid`, `meta.reason`), `impersonation.redeem` (oturum başladı: `tid`, `meta.reason`), `impersonation.end` (`tid`, `meta.reason`). Tüm destek istekleri: yazmalar `app.write`, okumalar `impersonation.request` (`meta: {service, operation, effect, impReason}`); hepsi `sub = yönetici`, `actorType:'impersonator'`, `imp:true`, `onBehalfOf = tenant`.
- **Tenant denetim görünümü** (`AuditService/getAuditLogs`, `eventPrefix: 'impersonation.'` ile süzülebilir): `impersonation.*` ve `imp` kayıtlarında `userId` **null**, ek alan `actorLabel: 'Entegrasyonik Destek'` döner (yönetici kimliği tenant'a sızmaz); `meta.reason` görünür. Başlangıç = `impersonation.redeem`, bitiş = `impersonation.end` (süre dolumunda `end` yazılmaz; bitiş = başlangıç + 30 dk).
- Bildirim/e-posta bu işte YOK (BACKLOG: tenant sahip/yöneticilerine oturum başlangıç bildirimi, ADR-0029 kataloğuna bağlanacak).

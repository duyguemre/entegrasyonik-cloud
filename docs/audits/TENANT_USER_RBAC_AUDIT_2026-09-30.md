# Tenant kullanıcı ve yetki yönetimi — uçtan uca denetim (2026-09-30)

- **Kapsam:** Müşteri (tenant) kullanıcısı tanımlama, rol ve yetki, oturum, platform yöneticisi erişimi, denetim kaydı, FE yetki gösterimi.
- **Dal:** `faz4-integration`. Çalışma kopyası `.claude/worktrees/be`. Kod değiştirilmedi; DB ve Redis'e bağlanılmadı.
- **Karar:** `docs/adr/0028-tenant-kullanici-ve-yetki-modeli.md`.
- **Araştırma:** `docs/research/TENANT_USER_RBAC_BEST_PRACTICES_2026-09-30.md`.
- **Tutarlılık:** ADR-0024 (P1-CORE) ve ADR-0026 (backoffice, impersonation).

## 1. Özet

Kimlik doğrulama katmanı sağlam. Şunlar yerinde: imzalı JWT, `tokenVersion` iptali, varsayılan ret, yetenek kaydından türetilen politika, parola sıfırlama ve e-posta doğrulama akışları, rate limit. Tenant'lar arası izolasyon da sağlam: DB-per-tenant, ApplicationDB'de `clientId`/`tid` filtreleri ve IDOR testleri var.

Zayıf halka **tenant içi kullanıcı yönetimi**. `UserService` yalnız "çağıran admin mi" diye bakıyor, **hedef kullanıcıya göre hiçbir kural yok**. Bunun sonucu:
- Tenant `admin`'i sahibin parolasını değiştirip sahip olarak girebilir.
- Platform yöneticisi de impersonation'da aynı yolu kullanabilir.
- Sahip silinebilir.

Model de büyümeye kapalı:
- Bir kişi yalnız bir tenant'ta olabilir.
- Rol üç alandan (`owner`, `roleCode`, `isGlobalAdmin`) türetiliyor.
- Kullanıcı iki DB'de parola özetiyle birlikte kopyalanıyor.
- Davet, askıya alma, sahiplik devri ve son sahip koruması yok.
- FE sunucudan izin listesi almıyor.

Sayılar: P0 **2**, P1 **9**, P2 **8**.

## 2. Bulgular

Boyut: S ≤ 0,5 gün, M ≤ 2 gün, L > 2 gün. Risk: düzeltmenin kırma riski.

### P0

| # | Bulgu | Kanıt | Etki | Öneri (ADR-0028) | Boyut / risk |
|---|---|---|---|---|---|
| **A-01** | **Tenant admin'i sahibi devralabilir (dikey yetki yükseltme, BFLA/BOLA).** `updateUser` hedefi gövdeden alıyor: tenant kopyası `_id` ile, merkezi kayıt `email + clientId` ile bulunuyor. Hedefin `owner` olup olmadığına bakılmıyor. `password` alanı düz metin olarak kabul edilip hash'leniyor. Sahibin merkezi kaydı `clientId: order` taşıyor, yani eşleşiyor. Sonuç: admin sahibin parolasını yazar, sahip olarak girer. Artık `owner` kademesindeki KVKK dışa aktarımı (tüm PII) ve tenant silme ona açıktır | `api/services/user-service.ts:161-195` (filtre `:192`; parola `:169-179`), `operations/tenant/TenantProvisioningService.ts:145-156` (owner `clientId: order`), `capabilities/domains/account.ts` `account.tenant.data.export`/`deletion.request` `minTier:'owner'` | Kötü niyetli ya da ele geçirilmiş bir yönetici hesabı tenant'ı tamamen devralır. Platform yöneticisi `selectStore` ile admin kademesinde çalıştığı için aynı yol ona da açık (`operationPolicy.ts:103-106`) | Karar 5.1-5.2, 5.6: başkasının parola/e-postası yazılamaz, owner'a yalnız owner dokunur. Karar 9: impersonation'da `users:manage` yok. **Hemen uygulanabilir ara yama (WP-A0):** `updateUser`/`deleteUser` hedef `owner` ise ve aktör owner değilse 403; `updateUser` `password` alanını reddeder | S / düşük (karakterizasyon testi ters çevrilir) |
| **A-02** | **Sahip silinebilir; son sahip koruması yok.** `deleteUser` hedefi tenant kopyasından bulup iki DB'den de siliyor. Hedef `owner` mı, çağıranın kendisi mi, son sahip mi, bunlara bakmıyor. FE sahibin sil düğmesini yalnız devre dışı gösteriyor | `user-service.ts:206-225`; FE `views/secure/user/AuthorizationListView.vue:113` (`:disabled="item.owner"`, yalnız istemci) | Sahipsiz tenant. Hiç kimse `owner` işlemlerini (dışa aktarma, silme talebi) yapamaz. Kurtarma yalnız elle DB müdahalesiyle mümkün | Karar 5.2-5.4. Ara yama WP-A0 ile aynı | S / düşük |

### P1

| # | Bulgu | Kanıt | Etki | Öneri | Boyut / risk |
|---|---|---|---|---|---|
| **A-03** | **Kullanıcı iki kopyada, parola özeti ikisinde de; kopyalar ayrışıyor.** Liste tenant kopyasından, giriş merkezi kopyadan okunuyor. `updateUser` e-postayı değiştirirse merkezi filtre (`email: <yeni e-posta>`) eşleşmez. Bu durumda merkezi kayıt güncellenmez ve **`tokenVersion` artmaz**: rol değişimi eski oturumları düşürmez. Parola sıfırlama tenant kopyasını ayrıca eşitliyor | `user-service.ts:58, 122, 183-195`; `database/client/models/User.ts:4-7`; `AccountLifecycleService.ts:392-400`; `DATA_ARCHITECTURE_AUDIT` MM-20; ADR-0021 D11 | Yanlış liste, iptal edilmeyen oturum, parola özetinin iki yerde durması | Karar 1 + göç K1/G1: tek kaynak `Users` + `Memberships`, tenant kopyasına yazım durur, parola `$unset` | M / orta (göç) |
| **A-04** | **Parola ≥ 50 karakterse düz metin olarak saklanıyor.** Hash'leme kararı `user.password.length < 50` sezgisine bağlı. Şema 1024 karaktere izin veriyor (`secret`). Uzun bir parola ya da önceden hesaplanmış bir bcrypt özeti olduğu gibi yazılır. Ayrıca `createUser`/`updateUser` parola politikasını (`passwordPolicy.ts`) uygulamıyor | `user-service.ts:168-171`, `capabilities/rpc-input/common.ts:25`, `operations/account/passwordPolicy.ts` | DB'de düz metin parola; zayıf parola | Karar 5.6 + 7: yönetici parola yazamaz, davet kabulünde politika uygulanır. Ara yama: WP-A0 | S / düşük |
| **A-05** | **Askıya alma yok.** `isActive` şemada ve girdi şemasında var, ama `updateUser` bu alanı yazmıyor. `createUser` alanı yalnız tenant kopyasına yazıyor; girişi belirleyen merkezi kayda yazmıyor. Pasifleştirme UI'ı da yok | `user-service.ts:122, 130-139, 173-178`; `rpc-input/identity.ts:13` | Ayrılan personelin tek seçeneği silmek. Geçici erişim kapatma yok | Karar 5.7: `Membership.status` + `tokenVersion++` | S |
| **A-06** | **Davet yok; yönetici kullanıcının parolasını belirliyor.** E-posta sahipliği doğrulanmıyor, yönetici kullanıcının parolasını biliyor, `emailVerified` false kalıyor | `user-service.ts:110-159`; `components/user/UserAddComponent.vue:33-38`; `docs/API_ACCOUNT_LIFECYCLE.md:112` | Paylaşılan parola, hesap sahipliğinin kanıtlanmaması | Karar 7: davet (hash'li, tek kullanımlık, 7 gün) | M |
| **A-07** | **Rol modeli kodda örtük ve üç alana dağılmış.** `owner` alanı, `roleCode ∈ {ROLE_ADMIN, ROLE_OWNER}` ve `isGlobalAdmin` birlikte rol belirliyor. `roleCode` herhangi bir dizge olabilir (`GlobalRoles`'a karşı doğrulanmıyor; bilinmeyen değer member sayılıyor). `ROLE_OWNER` atanmış ama `owner:false` olan kullanıcı "admin" kademesinde. `GlobalRoles.permissions` hiç okunmuyor. `getRoles` ham `GlobalRoles` belgelerini döndürüyor | `operationPolicy.ts:31, 103-116`; `database/application/models/GlobalRole.ts:8-10`; `user-service.ts:89-96`; `rpc-input/identity.ts:12` | Rol anlamı belirsiz; ince yetki (salt okur, muhasebe) ifade edilemiyor | Karar 2-3: koddaki izin kataloğu + sistem rolleri, parite ile göç | M |
| **A-08** | **Denetim kaydı "kim kime ne yaptı" sorusunu cevaplayamıyor.** `user.create/role_change/delete` olaylarında hedef kullanıcı yok (`targetSub`), eski ve yeni rol yok (yalnız yeni `roleCode`). Davet, askı ve devir olayları yok | `user-service.ts:153, 197-198, 218`; `services/audit/AuditLogger.ts:7-14` | KVKK ve güvenlik incelemesinde iz sürülemiyor | Karar 10 | S |
| **A-09** | **Impersonation tenant tarafında görünmez ve sınırsız.** `selectStore` gerekçe istemiyor. Oturum normal kurallarla (8 saat + 7 güne kadar sliding) yaşıyor. Tenant'ta tam `admin` kademesi veriyor (A-01 yolu dahil). `AuditLogger` `imp` alanını **yazmıyor**: ADR-0026 Karar 4.9.8 bunu "mevcut" sayıyor, ama değil. Tenant denetim görünümünde yönetici eylemleri tanınmayan bir `sub` ile görünüyor. Müşteriye bildirim gitmiyor | `api/services/security-service.ts:141-190`; `api/authenticate.ts:118-128`; `AuditLogger.ts:81-92`; `api/services/audit-service.ts:16-17, 74-75` | Destek erişimi hesap verilebilir değil; yönetici hatası ya da ele geçirilmiş yönetici hesabı tüm tenant'larda admin | Karar 9 + ADR-0026 Karar 4.9. Ara sertleştirme: 60 dk, sliding yok, `platform_support` izin seti, `imp` audit alanı | S (ara) / M (bilet akışı ADR-0026) |
| **A-10** | **FE yetkiyi sunucudan almıyor.** `checkAuthorization` `Users.resources` üzerinde çalışan bir yasak listesi. Bu alanı hiçbir ekran ya da API yazmıyor (`createUser` şeması `resources`'u kabul etmiyor). Yani herkes her menüyü görüyor ve 403 ile karşılaşıyor. Router guard yalnız kimlik kontrolü yapıyor. Kullanıcı listesi filtresi `roleCodes` sunucuda yok sayılıyor | `frontend/src/composables/user.ts:247-256`; `router/index.ts:82-106`; `user-service.ts:58-59` (`$match: {}`) | Kötü deneyim; yetki durumu kullanıcıya görünmüyor | Karar 11: `permissions[]` + `can()` | M (FE) |
| **A-11** | **Adım-yükseltmesi (step-up) yok.** Yalnız tenant silme ad hoc parola soruyor. KVKK tam dışa aktarımı (tüm PII), entegrasyon kimlik bilgisi değişimi, rol verme ve ödeme başlatma mevcut oturumla yapılabiliyor | `api/services/tenant-data-service.ts:30-37` (yalnız silme); `account.tenant.data.export` `rpc-input/identity.ts:35` `strictBody({})` | Çalınan oturum çerezi = tam veri çıkarma | Karar 8: `requiresReauth` + `reauth_at` (5 dk) | S-M |

### P2

| # | Bulgu | Kanıt | Öneri |
|---|---|---|---|
| **A-12** | Tek tenant sınırı: `Users.email` global tekil ve tenant bağı `Users` üzerinde. Bir kişi ikinci mağazaya eklenemiyor (409) | `models/User.ts:31`, `user-service.ts:143-148` | Karar 12 (model hazır, ürün akışı eşikli) |
| **A-13** | RPC başına 3 ApplicationDB okuması (Users + Clients + BaseApi `getClientDB`). Üyelik eklenirse 4 olurdu | `authenticate.ts:85, 112`; `DatabaseManager.ts:34`; ADR-0024 BA-01 | Karar 6: `(sub, tid, tv)` önbelleği + TenantRegistry → 1 |
| **A-14** | Yetki kararı dağınık: `RunOperation.authorize`, `ExportDownloadApiManager` elle `isAllowed('owner', …)`, `selectStore` içinde ikinci ga kontrolü | `RunOperation.ts:51-57`; `ExportDownloadApiManager.ts:36`; `security-service.ts:155` | Karar 4: tek `can()` |
| **A-15** | Denetim kaydı kararı servis adı regex'ine bağlı (`AdminService` + `get/retrieve` değil). Tenant tarafı hassas yazmalar (ayar, kimlik bilgisi, abonelik) denetime yazılmıyor | `RunOperation.ts:108-110` (ADR-0026 bulgusuyla aynı) | Karar 10: `effect`'ten türetilmiş denetim |
| **A-16** | 17 "Belirsiz" kademe satırı (görevde 15 deniyordu; üretilmiş belgede 17) kademe modelinde çözülemiyor: silme ve finans operasyonlarını operatörden gizleme isteği | `docs/CAPABILITIES.md` (`grep -c Belirsiz` = 17) | Karar 3: parite korunur, ayrım rolle (Viewer/Muhasebe) yapılır. `integrations.*.settings.get` notları bayat olabilir (alanlar artık `'sensitive'`) |
| **A-17** | Captcha sahte: 3 başarısız denemeden sonra herhangi bir `captcha` değeri kabul ediliyor. Hesap kilidi (5 deneme / 15 dk) ve IP rate limit bunu telafi ediyor | `security-service.ts:85-91` | ADR-0001 Karar 10 zaten "kaldır ya da gerçek yap" diyor. Captcha kaldırılabilir (insan kararı) |
| **A-18** | Tenant içi nesne düzeyi (BOLA): tenant içinde sahiplik ya da kapsam kavramı yok, her üye tüm tenant verisini görüyor. Bugün bu bir ürün tercihi (paylaşılan çalışma alanı), açık değil. Tenant'lar arası BOLA korumalı: `ticket-service.ts:149,173` ve `integration-service.ts:1041,1081` `clientId` filtreli, `tests/characterization/idor/*`, `tests/unit/tenant-surface/policy-and-idor.test.ts`. ApplicationDB'de tenant alanlı koleksiyon sorgusunun filtre taşıdığını zorlayan **statik bir kural yok**. Ayrıca `getImportJobs` sıralama anahtarı doğrulanmıyor (`integration-service.ts:995-997`) | yukarıda | ADR-0024 P3 repository katmanında "tenant filtresiz sorgu üretilemez" yardımcısı + statik test. Kapsam (Aşama 3) aynı katmanda |
| **A-19** | `getRoles`/`getResources` ham koleksiyon belgesi döndürüyor (kullanılmayan `permissions` dahil). `USER_LIST_PROJECTION` `isGlobalAdmin`, `order`, `clientId` alanlarını tenant'a açıyor | `user-service.ts:9-12, 89-106` | Karar 1: koddaki rol kataloğu DTO'su; liste DTO'su üyelik görünümü |

### Sağlam bulunanlar (değiştirme)

- Token: `authenticate.ts` her istekte `tokenVersion`, `ga`, `isActive`, `lockUntil`, `Users.order == tid` ve tenant `ACTIVE` kontrolü yapıyor; fail-closed.
- Parola değişimi, sıfırlama ve doğrulama (`AccountLifecycleService`): CAS, `tokenVersion++`, hash'li tek kullanımlık token, genel yanıt, arka plan gönderimi.
- Varsayılan ret, prototip ve iç metot koruması (`ApiWrapper.ts`), gövdeden tenant alanlarının atılması (`RunOperation.ts:88-92`), ADR-0023 gövde şemaları (`createUser` `owner`/`isGlobalAdmin` kabul etmiyor).
- Tenant denetim görünümü `tid` filtresi zorunlu, IP dönmüyor, `admin.*` gizli (`audit-service.ts`).
- Rate limit: login, register, reset, token, changePassword ayrı kovalarda (`ApiManager.ts:83-134`).

## 3. Hedef model özeti (ayrıntı ADR-0028)

```
Users (kimlik, global)  1 ── * Memberships {tid, role, status, scope?}  * ── 1 Clients (tenant)
                         └─ Invitations {tid, email, role, tokenHash, expiresAt}
Yetenek (ADR-0019) ── permission 'kaynak:eylem' (~35)  ── roller (kod): owner ⊃ admin ⊃ operator ; viewer, accountant
etkili = rol izni ∧ entitlement(plan) ∧ kapsam ∧ ¬impersonation-yasağı ∧ reauth
```

## 4. Uygulama iş paketleri (ADR-0024 Dalga 1 P1-CORE ile birleşik sıra)

**Dosya sahipliği ilkesi:** `authenticate.ts`, `BaseApi.ts`, `RunOperation.ts` ve `operationPolicy.ts` P1-CORE'la ortak dosyalar. Bu dosyalara dokunan paketler seri yürür. Diğerleri paraleldir.

| Sıra | Paket | Dalga | Bağımlılık | Dosyalar (sahiplik) | Adımlar | Test |
|---|---|---|---|---|---|---|
| 0 | **WP-A0 — Acil ara yama (A-01, A-02, A-04 kısmi)** | Hemen (Dalga 0 ile paralel; `api/**` ama yalnız `user-service.ts` + `rpc-input/identity.ts`, P1-CORE bu dosyalara dokunmuyor) | yok | `api/services/user-service.ts`, `capabilities/rpc-input/identity.ts`, `tests/characterization/auth/user-service-*.test.ts`, yeni `tests/unit/users/target-guards.test.ts` | 1) Karakterizasyon: admin → owner parola yazımı ve owner silme **bugün başarılı** (belgelenir). 2) Ters çevir: hedef `owner` ise ve aktör owner değilse (`resolveTier`) 403 `OWNER_PROTECTED`; aktör kendini silemez; `updateUser` gövdesinde `password` → 400 (şemadan çıkar); `createUser` parola politikası (`passwordPolicy`); `roleCode` ∈ {ROLE_ADMIN, ROLE_OPERATOR} (ROLE_OWNER verilemez); merkezi güncelleme filtresi eski e-postayla (`existing.email`) yapılır, e-posta değişimi 400 (A-03 kısmi). 3) Denetim `targetSub` (kod alanı, şema değişikliği yok: `meta.target`). FE etkisi: kullanıcı düzenleme formunda parola alanı çalışmaz → brif §5 madde 1 | `npm run test:module -- auth`, `npm run test:api`, `npm run test:related -- src/api/services/user-service.ts` |
| 1 | **P1-CORE (ADR-0024)** | Dalga 1 | WP8 + webhook birleşmiş | ADR-0024'teki liste | ADR-0024 adımları 1-6. **Ek (bu ADR):** `RpcContext.actor` tipi ADR-0028 Karar 6'daki `Actor` şekliyle tanımlanır (`permissions` alanı bu pakette `legacyTier`'dan türetilen sabit setle doldurulur; davranış değişmez) | ADR-0024 listesi |
| 2 | **WP-A1 — İzin kataloğu + roller + parite** | Dalga 1, P1-CORE'dan sonra (aynı `operationPolicy.ts`) | P1-CORE | `capabilities/{types,define,index}.ts`, yeni `capabilities/{permissions,roles}.ts`, `capabilities/domains/*.ts` (yalnız `permission:` satırları), `capabilities/derive/policy.ts`, `api/operationPolicy.ts`, yeni `platform/authz/can.ts`, `api/RunOperation.ts` (`authorize` → `can`), `api/ExportDownloadApiManager.ts`, `tests/characterization/auth/capability-parity.test.ts` (P2 izin paritesi), `dev-tools/capabilities-docs.js` (izin sütunu) | 1) `permission` alanı + değişmezler `PERMISSION_MISSING`, `PERMISSION_MIXED_TIER`. 2) Rol tanımları (owner/admin/operator; viewer/accountant tanımlı ama atanamaz). 3) `can()` kademe yerine izinle karar verir; parite testi 174 çift × 3 rol birebir. 4) `docs/CAPABILITIES.md` yeniden üretilir; "Belirsiz" notları izne bağlanır | `npm run test:module -- auth`, `npm run test:api`, `cd backend && npm run capabilities:docs`, `npm run typecheck` |
| 3 | **WP-A2 — Üyelik veri modeli + göç scriptleri (DB'siz)** | Dalga 1, WP-A1 ile paralel (ayrık dosyalar) | yok | yeni `database/application/models/{Membership,Invitation}.ts`, `ApplicationMongooseSchemas.ts` (kayıt), `interfaces/...` (IApplicationDB getter'ları), `database/application/models/{AuditLog,AccountToken}.ts` (alan/amaç ekleme), yeni `migrations/0003-memberships-app.js`, `0004-memberships-backfill.js`, `0005-legacy-user-fields-unset.js`, `dev-tools/precheck-memberships.js`, `migrations/index-manifest.json`, `tests/mongo-semantics/memberships*.test.ts` | Şemalar (`strict:true`, timestamps), indeksler, `plan/up/down` bellek-içi Mongo'da (`up → down → up` idempotent), precheck raporu biçimi. **Gerçek DB'de ÇALIŞTIRILMAZ** (G0-E2 yerel prova ayrı adım, yedek şartı) | `npm run test:integration:mocked`, `npm run test:module -- database` |
| 4 | **WP-A3 — `authenticate` üyelik okuması + önbellek + `MEMBERSHIP_SOURCE`** | Dalga 1 sonu (P1-CORE `authenticate → TenantRegistry` adımından sonra; aynı dosya) | P1-CORE, WP-A1, WP-A2 | `api/authenticate.ts`, yeni `platform/authz/{MembershipCache,actor}.ts`, `config/env.ts` (bayrak, zod), `api/profileDto.ts` (eklemeli alanlar: `role`, `permissions`, `tenant`, `entitlements`, `impersonation`), `api/Security.ts` (`claimsFromUser` tid kaynağı: bayrak `membership` ise üyelik), `tests/characterization/auth/authenticate.test.ts`, yeni `tests/unit/authz/membership-cache.test.ts` | 1) DB okuma sayacı testi: sürekli durumda RPC başına 1 okuma. 2) `legacy/dual/membership` üç modun karar eşitliği. 3) Askı → 403 `MEMBERSHIP_SUSPENDED`; `tv` artışı → önbellek anahtarı tutmaz. 4) `userContext` DTO sözleşme testi (eski alanlar korunur) | `npm run test:module -- auth`, `npm run test:api`, `npm run test:module -- tenant` |
| 5 | **WP-A4 — MembershipService + davet + askı + devir + son sahip** | Dalga 3 (P3-ADM ile aynı dalga; `user-service.ts` bu paketin) | WP-A3 | `api/services/user-service.ts`, yeni `operations/users/{MembershipService,InvitationService,ownershipTransfer}.ts`, `api/services/account-service.ts` + `ApiManager.ts` (açık `getInvitation`/`acceptInvitation` rotaları + limiter), `operations/account/{accountTokens,accountMailTemplates,AccountLifecycleService}.ts` (davet e-postası, devir amacı, tenant kopyası senkronu kaldırılır), `capabilities/domains/account.ts` + `rpc-input/identity.ts` (yeni yetenekler: `users.invite`, `users.invitations.list/revoke/resend`, `users.suspend/reactivate/remove`, `users.role.set`, `users.password_reset_link.send`, `tenant.ownership.transfer.request/accept/cancel`, `account.invitation.accept`), `services/billing/EntitlementService.ts` (yalnız `limits.users` okuma yardımcısı), `operations/tenant/TenantProvisioningService.ts` (sahip üyeliği oluşturma), `tests/unit/users/**` | Karar 5 kurallarının her biri için pozitif + negatif test (rol matrisi: 5 rol × her yönetim işlemi × hedef rolü). Davet token'ı: süre dolmuş, tüketilmiş, iptal edilmiş, başka tenant. Son sahip yarışı (telafi). Entitlement `PLAN_LIMIT_REACHED` | `npm run test:module -- auth`, `npm run test:api`, `npm run test:module -- tenant`, `npm run test:module -- billing` |
| 6 | **WP-A5 — Step-up + denetim olayları + impersonation ara sertleştirmesi** | Dalga 3, WP-A4 ile paralel (ayrık dosyalar) | WP-A3 | `api/Security.ts` (`reauth_at` claim, imp TTL 60 dk / sliding yok), `api/services/security-service.ts` (`selectStore` `reason`, `reauthenticate`), `services/audit/AuditLogger.ts` (`actorType`, `imp`, `targetSub`, `reqId`), `api/services/audit-service.ts` (imp etiketi), `api/RunOperation.ts` (`effect` tabanlı denetim + `authz.denied` örnekleme; **seri: WP-A1'den sonra**), `api/services/tenant-data-service.ts` (ad hoc parola → reauth), `capabilities/types.ts` (`requiresReauth`) | Reauth yok → 401 `REAUTH_REQUIRED`, 5 dk sonra süre dolar. Impersonation: `users:manage` 403, destructive 403, 60 dk sonra 401. Denetim kaydında `imp:true` | `npm run test:module -- auth`, `npm run test:api` |
| 7 | **WP-A6 — Göç provası (yerel) ve canlı** | WP-A2 + WP-A3 sonrası | **İnsan:** yedek doğrulaması (kural 3); canlı için Protokol 12 | yalnız çalıştırma; kod yok | G0 precheck (yerel) → rapor insan onayı → E1/E2 yerel `plan/up/down/up` → `MEMBERSHIP_SOURCE=dual` ile `npm run start:local` uçtan uca → 14 gün gözlem (canlı) → K3 → G1 (ayrı onay) | `npm run test:integration` (gerçek yerel Mongo, izinli DB'ler, `zzTest_` önekli) |
| 8 | **WP-A7 — Temizlik** | K3'ten ≥1 sürüm sonra | WP-A6 G1, FE geçişi | `api/operationPolicy.ts` (`resolveTier` legacy yolu), `profileDto.ts` (`resources`, `owner`, `roleCode` alanları), `user-service.ts` (`createUser` deprecated → kaldır), `exportCollections.ts` (`users.ndjson` → üyelik görünümü) | FE'nin eski alanları okumadığı `grep` ile kanıtlanır | `npm run verify` |

**Birleşik sıra (tek bakışta):**
```
Dalga 0:  P0-DB ‖ P0-LIFE ‖ P0-LAYER ‖ P0-DEAD ‖ WP-A0 (acil)
Dalga 1:  P1-CORE ‖ P1-DEAD ‖ WP-A2 → WP-A1 → WP-A3
Dalga 2:  P2-MOVE (donmuş; WP-A* yolları taşınır — codemod içe aktarmaları günceller)
Dalga 3:  P3-* ‖ WP-A4 ‖ WP-A5   (+ bulut FE brifi, WP-A3'ten sonra başlayabilir)
Sonra:    WP-A6 (insan onaylı göç) → WP-A7
```

**P2-MOVE notu:** WP-A1..A3 Dalga 2'den önce birleşmezse Dalga 2 ertelenmez. Bu paketler yeni yollara (`api/rpc/...`) göre yeniden uygulanır. Yeni dosyalar zaten `platform/authz/` ve `operations/users/` altındadır; taşımadan etkilenmezler.

## 5. Bulut FE brifi (hazır metin — `docs/CLOUD_BRIEFS.md` biçiminde)

> **Görev: `cloud/users-rbac` — Kullanıcı ve rol yönetimi ekranları (ADR-0028)**
> Kapsam yalnız `frontend/`. `backend/` ve `docs/adr/` salt okunur, kanıt olarak okunur: `docs/adr/0028-tenant-kullanici-ve-yetki-modeli.md` Karar 3, 5, 7, 9, 11.
> Başlama koşulu: WP-A3 birleşmiş olmalı (`userContext.permissions` var). WP-A4 RPC'leri gelmeden ekranlar sahte (mock) `restApi` yanıtlarıyla yapılabilir. Sözleşme aşağıda.
>
> 1. **`useUser().can(perm: string): boolean`** — `userContext.permissions` üzerinden çalışır. `checkAuthorization`/`resources` kullanımını buna geçirin. Eski fonksiyon bir sürüm boyunca `can` üzerine sarılı kalır. Router: rotalara `meta.permission` ekleyin; izin yoksa `/yetkisiz` sayfası. Menü öğeleri de aynı anahtarla gizlenir. Kullanıcı yönetimi `users:read`, ayarlar `settings:manage`, entegrasyon ayarı kaydet `integrations:manage`, denetim `audit:read`.
> 2. **Kullanıcılar ekranı (`AuthorizationListView.vue`):**
>    - Sütunlar: Ad, E-posta, Rol (koddaki rol etiketi), Durum (Aktif / Askıda / Davet bekliyor), Son giriş (varsa).
>    - Sekmeler: "Üyeler" ve "Bekleyen davetler".
>    - "Kullanıcı ekle" yerine **"Davet et"** diyaloğu: e-posta + rol seçimi. Rol listesi `UserService/getRoles`'tan gelir ve aktörün tavanına göre süzülür: `owner` hiç görünmez, admin `admin/operator/viewer/accountant` görür. Plan limiti dolduysa diyalog "planı yükselt" durumunu gösterir (`entitlements.limits.users` / `usage.users`).
>    - Satır eylemleri: Rolü değiştir, Askıya al / Etkinleştir, Parola sıfırlama bağlantısı gönder, Kaldır.
>    - Kısıtlar: sahip satırında yalnız sahip eylem görür. Kişi kendi satırında rol değiştiremez ve askıya alamaz.
>    - Yıkıcı eylemler onay diyaloğu ister. `401 REAUTH_REQUIRED` gelirse parola diyaloğu açılır ve istek yinelenir (ortak `useReauth` composable).
> 3. **Davet kabul sayfası** (`/invite`, açık rota): token URL fragment'ından okunur (`#t=`) ve hemen adres çubuğundan silinir. `AccountService/getInvitation` → mağaza adı + rol gösterilir. Form: ad, soyad, parola + tekrar (parola politikası ipuçları `ChangePasswordView` ile aynı). `acceptInvitation` → oturum açılır. Hata durumları: süresi dolmuş, kullanılmış, "bu e-posta başka mağazaya bağlı".
> 4. **Sahiplik devri** (Hesap → Mağaza, yalnız `tenant:transfer`): üye seçimi → reauth → "davet gönderildi" durumu → iptal. Hedef kullanıcı uygulamada bir bant görür ("X sizi mağaza sahibi yapmak istiyor — Kabul et / Reddet").
> 5. **Impersonation bandı** (ADR-0026 Karar 4.9.6): `userContext.impersonation` varsa sabit bir üst bant gösterilir: "Entegrasyonik destek olarak görüntülüyorsunuz — kalan süre — Çık". Destek oturumunda yasaklı eylemler (`users:manage` vb.) zaten `can` ile gizlenir.
> 6. **Denetim görünümü** (varsa `audit:read`): `actorType:'platform'` satırlarında "Entegrasyonik Destek" etiketi gösterilir. Yeni olay adları için TR metinleri ekleyin (ADR-0028 Karar 10 tablosu).
> 7. **Hata kodu ayrımı** (`restapi.ts`): `FORBIDDEN` → "Bu işlem için yetkiniz yok"; `SUBSCRIPTION_RESTRICTED` / `PLAN_LIMIT_REACHED` → "Planınızı yükseltin"; `MEMBERSHIP_SUSPENDED` → oturumdan çık + bilgi.
> 8. **Test:** her ekran için Playwright spec'i. Rol matrisi: owner / admin / operator / viewer `userContext` sahteleri ile menü ve düğme görünürlüğü. axe 0 ihlal. Görsel tabanlar yerelde üretilir (`--update-snapshots=missing`, `*-linux.png` commit'lenmez). DS-v2 bileşenleri kullanılır, literal renk yok.
> 9. **Kabul:** `npm run build` yeşil. Yeni spec'ler yeşil. Mevcut `AuthorizationListView` karakterizasyon notları güncellenir (ham `roleCode` artık gösterilmez; rol etiketi gelir).

## 6. Backoffice (ADR-0026) tarafına etkiler

- Impersonation bileti (`redeemImpersonation`) basılan çerezde sentetik aktör `role:'platform_support'` olur. İzin seti ADR-0028 Karar 9'dadır. ADR-0026 Karar 4.9.7'deki "kullanıcı yönetimi reddedilir" kuralı izinle (`users:manage` yok) uygulanır. Ayrı bir liste tutulmaz.
- ADR-0026 Karar 4.9.8 "imp:true denetime yazılır (mevcut)" ifadesi **yanlış**: `AuditLogger` `imp` alanını yazmıyor (A-09). WP-A5 bu alanı ekler. Backoffice planındaki denetim alanı listesi (`reqId`, `surface`, `reason`) ile aynı şema genişletmesinde birleştirilir. Aynı dosyaya iki ayrı paket dokunmasın: WP-A5 veya backoffice denetim paketi, hangisi önce başlarsa diğerinin alanlarını da ekler.
- Backoffice "Müşteriler → detay" ekranı tenant üye listesini (rol, durum, son giriş; parola/e-posta düzenleme yok) `Memberships` üzerinden salt okunur gösterebilir. Platform düzeyi "askıya al" yalnız `Users.isActive` (hesap) ve tenant durumu (`Clients.status`) üzerinden yapılır. Tenant üyeliğini platform değiştirmez, ama son sahip kurtarma bunun istisnasıdır: sahibi kaybolan tenant için step-up + gerekçe ile `ownership.recover` (backoffice yeteneği, `surface:'backoffice'`).
- Platform yönetici hesapları `Memberships`'e girmez (Karar 2). ADR-0026 Karar 4.10'daki "son aktif yönetici" kuralı ADR-0028'deki son sahip kuralıyla aynı yardımcıyı kullanabilir, ama ayrı bir sayımla.

## 7. İnsan kararı gerektirenler

1. **Göç (WP-A6):** yerel prova öncesi doğrulanmış yedek (kural 3). Canlı E1/E2 ve ayrıca G1 (`$unset`, geri alınmaz) için Protokol 12.
2. **G0 precheck bulguları:** sahipsiz ya da birden çok sahipli tenant, merkezi ile tenant kopyası arasındaki farklar hangi tarafın doğru sayılacağı.
3. **Impersonation müşteri bildirimi:** uygulama içi (varsayılan açık) dışında e-posta bildirimi ve "destek erişimine önceden onay" tenant ayarı. Varsayılan yazma mı salt okuma mı (ADR-0026 yazma diyor; araştırma salt okuma öneriyor).
4. **Rol adları ve setleri:** Viewer ve Muhasebe'nin Aşama 2'de açılması, TR etiketleri ("Operatör" mü "Personel" mi), `limits.users` değerleri plan başına (ADR-0008 Plan kataloğu).
5. **Tek aktif üyelik sınırı:** Aşama 3'e kadar ikinci mağaza için "başka e-posta kullanın" yanıtı ürün olarak kabul edilebilir mi?
6. **Captcha:** kaldırılsın mı (A-17)?
7. **Rol değişiminde yeniden giriş zorunluluğu** (`tokenVersion++`) kullanıcı deneyimi olarak kabul mü? Alternatif ayrı `authVersion` alanı, maliyet notu ADR'de.

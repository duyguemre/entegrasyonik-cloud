# 0028 — Tenant kullanıcı ve yetki modeli (Üyelik + izin kataloğu)

## Durum
Kabul edildi (2026-09-30). Kod henüz değişmedi. DB'ye dokunan adımlar (yeni koleksiyon, geri doldurma, `$unset`) `CLAUDE.md` kural 3 (doğrulanmış yedek) ve Protokol 12 (canlı için insan onayı) şartına bağlıdır.

**Değiştirdiği / genişlettiği kararlar:**
- **ADR-0001 Karar 7-8 (kademe RBAC):** Kademe (`member < admin < owner`) karar birimi olmaktan çıkar; yerine **izin** (`kaynak:eylem`) gelir. Kademe, sistem rollerinin geriye uyumlu adı olarak kalır. ADR-0001'in kendi eşiği ("bir tenant'ta 5'ten fazla kullanıcı olup kısıtlı personel rolü talep edilirse izin eklenir") beklenmeden uygulanır. Gerekçe aşağıda: bugünkü açıklar (A-01, A-02) kademe modelinin içinde kapatılamıyor; hedef-kullanıcı kuralı gerekiyor.
- **ADR-0019 §1-2:** `CapabilityDef` yeni zorunlu alan `permission` alır. `OPERATION_POLICY` tek kaynak kalır. `derivePolicy` artık kademe yerine izin de üretir. `minTier` geçiş süresince parite kapısı için kalır, sonra türetilmiş alana dönüşür.
- **ADR-0021 D11 (merkezi Users tek kaynak):** Tenant bağı `Users.clientId` yerine yeni `Memberships` koleksiyonunda tutulur. D11'in "tenant `Users`'a yazım durur" ve "(G) tenant `Users.password` `$unset`" adımları aynen bu ADR'nin göç planına girer.
- **ADR-0024 D1/D3 (P1-CORE):** `RpcContext.actor` bu ADR'deki `Actor` şeklini taşır. Yetki kararı istek başına bir kez `authenticate` içinde kurulur. "RPC başına ApplicationDB okuması 3 → 1" hedefi Üyelik okumasıyla bozulmaz (Karar 6).
- **ADR-0026 Karar 4.9 (backoffice impersonation):** Aynen benimsenir. Bu ADR, impersonation oturumunun tenant tarafındaki **izin setini** ve **denetim görünürlüğünü** tanımlar.

## Bağlam

Denetim: `docs/audits/TENANT_USER_RBAC_AUDIT_2026-09-30.md` (bulgu kodları A-xx). Araştırma: `docs/research/TENANT_USER_RBAC_BEST_PRACTICES_2026-09-30.md`.

Bugünkü model:
- Bir kullanıcı = merkezi `Users` belgesi. Tenant bağı bu belgedeki `order`/`clientId` alanlarıdır. `Users.email` global tekildir. Sonuç: **bir kişi yalnızca bir tenant'a** üye olabilir (`user-service.ts:141-148` başka tenant'taki e-postayı 409 ile reddeder).
- Rol üç alandan türetilir: `owner: true` → owner; `roleCode ∈ {ROLE_ADMIN, ROLE_OWNER}` → admin; diğer her şey → member (`operationPolicy.ts:97-116`). `GlobalRoles.permissions` ve `Users.resources` sunucuda hiç okunmaz.
- Aynı kullanıcı tenant DB'sinde ikinci kez tutulur (parola özeti dahil, `database/client/models/User.ts`). Kullanıcı listesi bu kopyadan okunur, giriş merkezi kopyadan yapılır. İki kopya transaction'sız çift yazımla eşitlenir.
- Kullanıcı yönetimi (`UserService`) yalnız kademe kontrolüne sahip; **hedef kullanıcıya göre kural yok**. Bir tenant `admin`'i sahibin parolasını değiştirip sahip olarak girebilir, sahibi silebilir (A-01, A-02). Platform yöneticisi `selectStore` ile aynı yola sahip.
- Davet, askıya alma, sahiplik devri, son sahip koruması, adım-yükseltmesi (step-up) yok.
- FE rol/izin bilgisini sunucudan almıyor. `Users.resources` bir menü yasak listesi gibi kullanılıyor, ama hiçbir ekran bu alanı yazmıyor.

Ölçek: tek haneli abone, tenant başına 1-5 kullanıcı. Tek backend süreci (web+worker), MongoDB, Redis zaten zorunlu.

## Değerlendirilen Alternatifler

### A. Veri modeli: tenant bağı nerede?
1. **`Users` içinde kalır (bugün) + alan düzeltmeleri.** Artı: göç yok. Eksi: çoklu tenant imkânsız. Davet (henüz kullanıcı yok) ve askıya alma (tenant düzeyi) için yer yok. Rol ve kimlik aynı belgede kalır.
2. **`Users.memberships[]` gömülü dizi.** Artı: `authenticate` tek okuma. Eksi: tenant üye listesi çok anahtarlı indeks ister. Tenant işlemleri kullanıcı belgesini yazar (kimlik ile yetki karışır). Davet yine ayrı yer ister.
3. **Ayrı `Memberships` koleksiyonu (ApplicationDB) + ayrı `Invitations`.** Artı: sektör standardı (User ↔ Membership ↔ Tenant). Çoklu tenant, askı ve kapsam doğal. Tenant üye listesi tek indeksli sorgu. Kimlik belgesi yetkiden ayrılır. Eksi: istek başına ek bir okuma. Karar 6'daki önbellekle sürekli durumda 0'a iner. **Seçildi.**

### B. Yetki birimi
1. **Kademe (bugün).** Hedef-kullanıcı kuralları ve "salt okur", "muhasebe" gibi roller ifade edilemez.
2. **Kaba izin kataloğu (`kaynak:eylem`, ~35 anahtar) + koddaki sistem rolleri. Özel roller ve kapsam aşamalı, eşiğe bağlı.** **Seçildi.**
3. **Yetenek başına izin (~150 anahtar).** Bu, izni yeteneğin kendisi yapar. Rol editörü kullanılamaz hale gelir; Shopify/GitHub da kaba grup kullanıyor.
4. **Politika motoru (OpenFGA/Cerbos/Casbin).** Ek servis veya bağımlılık demek. Kaynak düzeyi paylaşım ihtiyacı yok. Tek haneli ölçekte orantısız. Karar arayüzü (`can`) soyut tutulur, eşik aşılırsa motor arkaya takılır.

### C. Yetki kararının önbelleği
1. **Önbellek yok.** Her RPC'de `Users` + `Memberships` = 2 okuma.
2. **Üyelik süreç-içi LRU, anahtar `(sub, tid, tokenVersion)`.** Her üyelik değişikliği `Users.tokenVersion`'ı artırır. `Users` zaten her istekte önbelleksiz okunuyor (ADR-0024 D1). Böylece bayat önbellek girdisi hiçbir pod'da kullanılamaz: anahtar tutmaz. Ayrıca eski token 401 olur. **Seçildi.**
3. **Redis önbelleği.** Çok pod'a gerek yok (C.2 tv ile zaten pod-bağımsız doğru). Ağ gidiş-dönüşü ekler.

### D. Çoklu tenant üyeliği
1. **Şimdi aç.** Tenant seçici, giriş sonrası seçim, davetle mevcut kullanıcıyı ekleme. Bugün talep yok.
2. **Model destekler, ürün akışı kapalı (1 aktif üyelik sınırı) ve eşikte açılır.** **Seçildi.**

## Karar

Tenant yetkisi, merkezi `Users` (kimlik) ile tenant (`Clients`) arasındaki yeni **`Memberships`** kaydından okunur. Karar birimi, yetenek kaydında (ADR-0019) her yeteneğe bağlanan **izin**dir (`kaynak:eylem`). İzinler koddaki **sistem rollerine** gruplanır. Bugünkü `member/admin/owner` kademeleri bu rollerin parite eşlemesiyle birebir korunur. Kullanıcı yönetimine **hedef-kullanıcı kuralları** (tavan, son sahip, kendine dokunma) eklenir. Kullanıcıya parola atama yerine **davet** gelir. Yetki kararı istek başına bir kez kurulur ve FE'ye izin listesi olarak taşınır.

### 1. Veri modeli (ApplicationDB — `entegrasyonikDB`)

**`Users` (kimlik; mevcut koleksiyon):** `email` (global tekil), `name`, `surname`, `password`, `isActive` (hesap düzeyi; tüm tenant'larda girişi kapatır), `lockUntil`, `failedLoginAttempts`, `emailVerified*`, `passwordChangedAt`, `tokenVersion`, `isGlobalAdmin` (platform; ADR-0026 backoffice'e taşır).
- Eski alanlar `order`, `clientId`, `owner`, `roleCode`, `resources` **geçiş süresince ayna** olarak yazılmaya devam eder. Göç Aşama G'de (`$unset`) kaldırılır.

**`Memberships` (yeni):**
```
{ _id, userId: ObjectId, tid: Number,
  role: 'owner'|'admin'|'operator'|'viewer'|'accountant'|<ileride özel rol kodu>,
  status: 'active'|'suspended',
  scope?: { integrationCodes?: string[] },          // Aşama 3; yoksa = tüm tenant
  createdAt, updatedAt, createdBy?: string, suspendedAt?, suspendedBy?, suspendReason? }
indeksler: uniq {userId:1, tid:1}; {tid:1, status:1}; {tid:1, role:1}
```
- Tek rol (dizi değil). Bugünkü model de tek rollü. Çoklu rol gerekirse özel rol (Aşama 3) çözer. Tek rol, "etkili izin = rolün izinleri" hesabını ve FE'yi basit tutar.
- Kaldırma = belge silinir (+ audit). "removed" durumu tutulmaz; geçmiş `AuditLogs`'tadır.
- `strict: true`, `timestamps: true` (ADR-0021 kuralları).

**`Invitations` (yeni):**
```
{ _id, tid: Number, email (küçük harf), role, tokenHash (sha256), expiresAt, invitedBy: sub,
  status: 'pending'|'accepted'|'revoked', acceptedAt?, acceptedUserId? , createdAt }
indeksler: uniq {tokenHash:1}; uniq kısmi {tid:1, email:1} (status:'pending'); TTL {expiresAt:1} (expireAfterSeconds: 30 gün sonra temizlik)
```
Token üretimi ve tüketimi `operations/account/accountTokens.ts` desenini aynen kullanır: 256 bit, yalnızca özet saklanır, atomik tüketilir.

**Tenant DB `Users` kopyası:** Yazımı durur (Aşama K). Parola özeti `$unset` edilir (Aşama G). Koleksiyon, KVKK dışa aktarım sözleşmesi (`exportCollections.ts` `users.ndjson`) üyelik görünümüne taşınınca düşürülür.

**`GlobalRoles`, `Resources`:** Sunucuda yetki kaynağı değildir. Sistem rolleri kodda tanımlanır. `UserService/getRoles` koddaki rol kataloğunu döner (etiketler TR/EN). Koleksiyonlar FE geçişinden sonra okunmaz, Aşama G'de bırakılır (silinmez; zararsız).

### 2. İzin kataloğu (kodda tek kaynak: `backend/src/capabilities/permissions.ts`)

Adlandırma `kaynak:eylem`. Varsayılan ret. Her yetenek **tam olarak bir** izne bağlıdır (`CapabilityDef.permission`, zorunlu; kayıt değişmezi `findRegistryInvariantViolations`'a eklenir).

| Alan | İzinler |
|---|---|
| Katalog | `catalog:read`, `catalog:write`, `catalog:delete`, `catalog:publish` (pazaryerine gönderim/eşitleme tetikleme) |
| Stok | `stock:read`, `stock:write` |
| Sipariş / iade | `orders:read`, `orders:write`, `claims:read`, `claims:write` |
| Müşteri / mesaj | `customers:read`, `messages:read`, `messages:reply` |
| Fatura / kargo / finans | `invoices:read`, `invoices:write`, `invoices:delete`, `shipments:read`, `shipments:write`, `finance:read` |
| Entegrasyon | `integrations:read`, `integrations:manage` (kimlik bilgisi/bağlantı ayarı, webhook token), `integrations:sync` (içe/dışa aktarma işi başlatma) |
| Rapor / toplu veri | `reports:read`, `data:export` (Excel/CSV toplu çıkarma) |
| Ayar | `settings:read`, `settings:manage` |
| Kullanıcı | `users:read`, `users:manage` (davet, rol verme, askıya alma, kaldırma) |
| Denetim | `audit:read` |
| Abonelik | `billing:read`, `billing:manage` |
| Destek | `support:use` |
| Tenant (sahip) | `tenant:export`, `tenant:delete`, `tenant:transfer` |
| Kendi hesabı / kabuk | `self:manage` (parola, bildirim, favori, doğrulama e-postası: `scope:'user'` yetenekleri), `app:use` (menü, yapılandırma, rol listesi gibi kabuk okumaları). İkisi de her aktif üyede vardır |

Platform yetenekleri (`minTier:'platformAdmin'`, 32 adet) izin kataloğuna **girmez**. Onlar `ga` dikeyinde ve ADR-0026 `surface:'backoffice'` ile kalır. Platform alt rolleri (`platformSupport/Billing/Readonly`) backoffice'in kendi konusudur. Eşik: >2 platform yöneticisi.

### 3. Sistem rolleri (kodda: `backend/src/capabilities/roles.ts`)

| Rol | Kod | İzinler | Eski karşılık |
|---|---|---|---|
| Sahip | `owner` | Hepsi | `owner:true` |
| Yönetici | `admin` | `tenant:*` dışında hepsi | `ROLE_ADMIN`, `ROLE_OWNER` (owner:false) |
| Operatör | `operator` | Bugün `member` kademesindeki yeteneklerin izinlerinin tamamı (parite) | `ROLE_OPERATOR`, tanımsız/bilinmeyen `roleCode` |
| Salt okur | `viewer` | `*:read` (`customers:read`, `users:read` ve `audit:read` HARİÇ) + `self:manage` + `app:use` + `support:use` | yeni (Aşama 2) |
| Muhasebe | `accountant` | `orders:read`, `claims:read`, `customers:read`, `invoices:*`, `shipments:read`, `finance:read`, `reports:read`, `data:export`, `billing:read`, `self:manage`, `app:use`, `support:use` | yeni (Aşama 2) |

- **Parite kuralı (Aşama 1 çıkış kapısı):** Tüm 174 `(servis, operasyon)` çifti ve her eski kademe için, "rolün izinleri ⊇ yeteneğin izni" kararı "kademe ≥ minTier" kararıyla **birebir aynı** olmalı. Test: `capability-parity.test.ts` genişletilir (P2 "izin paritesi"). Parite `operator = member` üzerinden kurulur. Bu yüzden izin atamasında kural şudur: bir izin anahtarı, farklı `minTier`'lı yetenekleri tek anahtarda toplayamaz. Toplarsa anahtar bölünür (ör. `integrations:read` member, `integrations:manage` admin). Kayıt değişmezi bunu zorlar: `PERMISSION_MIXED_TIER`.
- **17 "Belirsiz" satır** (`docs/CAPABILITIES.md`): Kademe değiştirilmez (parite). Kararları artık role bırakılır. Yıkıcı katalog silmeleri `catalog:delete`, `products.export` `data:export`, finans satırları `finance:read`, fatura silme `invoices:delete` olur. Operatör bunları bugün olduğu gibi yapar. Viewer ve Muhasebe yapamaz (Muhasebe yalnız `invoices:delete` yapar). `integrations.*.settings.get` satırlarının "kimlik bilgisi AÇIK döner" notu, alanlar artık `'sensitive'` maskeli döndüğü için muhtemelen bayat. WP-A1'de testle doğrulanıp not güncellenir.
- **Özel roller (Aşama 3, eşik + entitlement `customRoles`):** Tenant, katalogdaki izinlerden adlandırılmış bir küme oluşturur (`TenantRoles {tid, code, name, permissions[]}`). Kurallar: `tenant:*` ve `users:manage` özel role verilemez; bir özel rol, oluşturanın izinlerinin alt kümesi olmalı.
- **Kaynak kapsamı (Aşama 3, eşik):** `Membership.scope.integrationCodes`. Yalnız entegrasyon/mağaza düzeyinde. Uygulandığı yer repository katmanıdır (ADR-0024 P3 `database/repositories`), handler değil. Kapsamlı üye `integrations:manage` alamaz.

### 4. Etkili yetki ve karar arayüzü

```
etkili(aktör, yetenek) = izin(aktör.rol) ∋ yetenek.permission
                         ∧ entitlement(tenant, yetenek)          // ADR-0008 EntitlementService — ayrı katman
                         ∧ kapsam(aktör.scope, kaynak)           // Aşama 3; yoksa doğru
                         ∧ ¬impersonationYasak(aktör, yetenek)   // Karar 9
                         ∧ reauth(aktör, yetenek)                 // Karar 8
```
- Tek karar noktası: `backend/src/platform/authz/can.ts` → `can(actor, capability, resource?) → { allowed, code }`. Kod `can` üzerinden çağrılır. `RunOperation.authorize` ve `ExportDownloadApiManager`'daki elle `isAllowed('owner', …)` buna geçer. MCP/OAuth (ADR-0009/0010) aynı fonksiyonu kullanır. OAuth `scope` ile izinlerin **kesişimi** alınır.
- Hata kodları ayrıdır: izin yok → `403 FORBIDDEN`. Plan yetmiyor → `403 SUBSCRIPTION_RESTRICTED` (mevcut) ya da `403 PLAN_LIMIT_REACHED` (kullanıcı sayısı vb. limit; yeni katalog kodu). Adım-yükseltmesi gerek → `401 REAUTH_REQUIRED`. Üyelik askıda → `403 MEMBERSHIP_SUSPENDED`. FE bunları ayrı gösterir: yetki yok ile "planı yükselt" ayrı mesajlardır.
- **Entitlement ≠ permission:** Plan (ADR-0008 `Plan.features/limits`), tenant'ın *ne kullanabileceğini* söyler. Rol, kullanıcının *ne yapabileceğini* söyler. Plan rolü genişletemez, yalnız daraltır. Kullanıcı yönetimiyle ilgili entitlement'lar: `limits.users` (davet anında sayılır: aktif üyelik + bekleyen davet), `features: customRoles`, ileride `sso`.

### 5. Kullanıcı yönetimi kuralları (hedef-kullanıcı kuralları — `operations/users/MembershipService.ts`)

Her kural sunucuda, ayrıca FE'de de uygulanır:
1. **Tavan:** Aktör, kendi rolünden yüksek rol veremez. `owner` rolü davet veya rol değişimiyle **verilemez**; yalnız sahiplik devriyle (madde 5) verilir. `admin`, `admin` verebilir (Shopify/GitHub ile aynı).
2. **Hedef koruması:** `owner` üyeliğini yalnız başka bir `owner` değiştirir, askıya alır veya kaldırır. `admin` bir `owner`'a hiçbir yazma işlemi yapamaz.
3. **Kendine dokunma:** Kişi kendi rolünü değiştiremez, kendini askıya alamaz. Kendi üyeliğinden ayrılmak ("tenant'tan çık") ayrı bir işlemdir ve son sahip kuralına tabidir.
4. **Son sahip:** Tenant'ta en az bir `active` `owner` bulunur. Son sahip düşürülemez, askıya alınamaz, kaldırılamaz, çıkamaz. Uygulama: işlem öncesi `countDocuments({tid, role:'owner', status:'active'})`. Yarışa karşı işlem sonrası yeniden sayılır ve 0 ise geri alınır (telafi). Bu ölçekte transaction gerekmez. Yerel Mongo tek düğüm olabilir.
5. **Sahiplik devri (iki adım):** Sahip, aktif ve e-postası doğrulanmış bir üyeyi seçer. Adım-yükseltmesi gerekir. `Invitations`'a benzer, tek kullanımlık, 72 saatlik bir devir belirteci üretilir (`purpose:'ownership_transfer'`, `AccountTokens`'a yeni amaç). Hedef, uygulamaya girip kabul eder. Kabulde sıra şudur: önce hedef `owner` olur, sonra devreden `admin` olur. Böylece ara durumda 0 sahip olmaz. Olaylar audit'e yazılır; tenant'ın diğer sahip/yöneticilerine bildirim gider. Abonelik fatura iletişimi (ADR-0008) otomatik değişmez, ekranda hatırlatılır.
6. **Parola ve e-posta başkası tarafından yazılamaz:** `users:manage` başkasının parolasını veya e-postasını değiştiremez. Yerine "parola sıfırlama bağlantısı gönder" işlemi gelir (mevcut `AccountLifecycleService.executeResetRequest`). E-posta değişimi yalnız kişinin kendisi tarafından ve doğrulamalı yapılır (ayrı iş; bu ADR yalnız engeli koyar).
7. **Askıya alma:** `status:'suspended'` + `Users.tokenVersion++`. Tüm oturumlar anında düşer. Hesap diğer tenant'larda (Aşama 3) etkilenmez, ama o oturumlar da yeniden giriş ister. Kabul edilir. Geri açma `active` yapar. `Users.isActive=false` (hesap düzeyi) yalnız kişinin kendisi (hesap kapatma) veya platform tarafından kullanılır.
8. **Her rol/kapsam/durum değişimi ve kaldırma:** Aynı işlemde `Users.tokenVersion++` (ADR-0001 Karar 4). Rol değişiminde hedef kullanıcı yeniden giriş yapar. 8 saatlik oturum ve bu ölçekte kabul edilir; ayrı `authVersion` alanı gerekmez.

### 6. İstek başına yetki kararı (performans — ADR-0024 P1-CORE ile birlikte)

`authenticate` sırası:
1. JWT doğrula.
2. `Users.findById(sub)` → yalnız gerekli alanlar projeksiyonla okunur. **Önbelleksiz** (ADR-0024 D1). `tv`, `isActive`, `lockUntil`, `ga` kontrol edilir.
3. `principal.ga && principal.imp` ise sentetik aktör kurulur (Karar 9). Değilse `MembershipCache.get(sub, tid, tv)` okunur. Önbellek: `lru-cache`, en çok 5000 girdi, TTL 60 sn. Kaçırırsa `Memberships.findOne({userId, tid})` (lean, projeksiyon) okunur. Yoksa veya `suspended` ise reddedilir.
4. `TenantRegistry.get(tid)` → `ACTIVE` (ADR-0024 D1, 30 sn).
5. `Actor` bir kez kurulur ve dondurulur: `{ userId, tenantId, role, permissions: ReadonlySet<Permission>, scope?, legacyTier, platformAdmin, impersonation?: {by, expiresAt}, reauthAt? }`. `res.locals.actor` → `RunOperation` → `BaseApi.ctx.actor` (ADR-0024 D3).

Sonuç: sürekli durumda RPC başına **1** ApplicationDB okuması (`Users`); üyelik ve tenant önbellekten gelir. Geçersizleme: üyelik değişimi `tv`'yi artırır, bu yüzden eski anahtar hiçbir pod'da tutmaz. Aynı pod'da ek olarak `MembershipCache.invalidateUser(sub)` çağrılır (bellek temizliği).

Geçiş dönemi (`MEMBERSHIP_SOURCE` bayrağı: `legacy | dual | membership`, varsayılan `legacy` → göçten sonra `dual`):
- `legacy`: bugünkü `resolveTier`.
- `dual`: Üyelik okunur. Yoksa eski alanlardan türetilir, `membership.fallback` uyarısı loglanır ve sayılır. Her iki kaynaktan gelen karar farklıysa `authz.divergence` metriği yazılır, **üyelik kazanır**.
- `membership`: yalnız üyelik; eski alanlar okunmaz.

### 7. Davet akışı (`users:manage`)

1. `UserService/inviteUser {email, role}`: tavan kontrolü (madde 5.1) ve entitlement `limits.users` kontrolü yapılır. Aynı tenant'ta bekleyen davet varsa yenilenir (eski token iptal). Rate limit: tenant başına 20 davet/saat. `Invitations` kaydı yazılır. E-posta `PUBLIC_APP_URL/invite#t=<token>` olarak gönderilir (fragment; ADR-0026 bilet deseni). Audit `user.invite.create`.
2. `AccountService/getInvitation {token}` (açık, rate limitli) → yalnız `{tenantTitle, role, email maskeli, expiresAt}` döner.
3. `AccountService/acceptInvitation {token, name, surname, password}` (açık, `accountTokenLimiter`). Parola politikası (`passwordPolicy.ts`) uygulanır. Token atomik tüketilir.
   - E-posta kayıtlı değilse: `Users` (`emailVerified:true`; bağlantı e-postanın sahipliğini kanıtlar) + `Memberships` oluşturulur, oturum açılır.
   - E-posta kayıtlıysa: **Aşama 1-2**'de "Bu e-posta başka bir mağazaya bağlı" (409, tek aktif üyelik sınırı). **Aşama 3** (çoklu üyelik açıkken): kullanıcının giriş yapıp kabul etmesi istenir (`acceptInvitation` kimlikli varyant).
4. `UserService/revokeInvitation`, `resendInvitation`, `listInvitations`.
5. **`UserService/createUser` (yöneticinin parola atadığı akış):** FE davet ekranı yayına girene kadar kalır. Bu sürede şu kurallar geçerlidir: tavan, parola politikası, `roleCode` kod katalog doğrulaması. Sonra yetenek kaydında `deprecated` işaretlenir ve kaldırılır.

### 8. Adım-yükseltmesi (step-up), tenant tarafı

- Yetenek kaydına `requiresReauth: true` (ADR-0026 ile aynı alan) eklenir. İşaretlenenler: `tenant:delete`, `tenant:export`, `tenant:transfer`, `billing:manage` altındaki checkout, `integrations:manage` yazmaları, `users:manage` ile `admin` rolü verme ve sahip olmayan birini askıya alma/kaldırma.
- `AccountService/reauthenticate {password}` doğrularsa oturum çerezi `reauth_at` claim'iyle yeniden basılır. Geçerlilik 5 dakikadır. Yoksa `401 REAUTH_REQUIRED` döner, FE diyalog açıp isteği yineler (ADR-0026 deseni). `TenantDataService`'teki ad hoc parola kontrolü bu mekanizmaya bağlanır; tenant adı yazma onayı kalır.
- Tenant kullanıcıları için TOTP **Aşama 3**'tedir (backoffice'in TOTP kodu yeniden kullanılır). Tenant ayarı "sahip/yönetici için 2FA zorunlu" da Aşama 3'tedir. Eşik aşağıda.

### 9. Impersonation (platform yöneticisi → tenant) — ADR-0026 ile birlikte

- Giriş yolu ADR-0026 Karar 4.9'dur: bilet, 60 dk, uzatılmaz, bant gösterilir. O yol gelene kadar mevcut `selectStore` **ara sertleştirme** alır: imp oturumu 60 dk'da biter ve sliding yenilenmez; `reason` alanı (≥10 karakter) opsiyonelden zorunluya geçer (FE küçük değişiklik).
- Tenant içindeki sentetik aktör: `role:'platform_support'` (Membership değil). İzinleri: `admin` izinlerinden `users:manage`, `billing:manage`, `tenant:*`, `integrations:manage` **çıkarılır**. Ayrıca ADR-0026 kuralı gereği `effect:'destructive'` ve `external:true` yetenekler reddedilir. Bu, A-02'nin platform yöneticisi kolunu kapatır: impersonation sırasında sahip parolası değiştirilemez.
- **Denetim:** Impersonation sırasındaki her yazma `imp:true`, `actorType:'platform'` ile yazılır. Bugün `AuditLogger` `imp` alanını **yazmıyor** (A-09; ADR-0026 bunu "mevcut" sayıyor, düzeltilir). `impersonation.start/end` olayları `tid` ile yazılır. Tenant denetim görünümü (`AuditService`) bunları gizlemez ve `userId` yerine "Entegrasyonik Destek" etiketi gösterir. `admin.*` gizleme kuralı yalnız platform-içi olaylar için kalır.
- **Müşteri bildirimi:** Impersonation başlayınca tenant sahip ve yöneticilerine uygulama içi bildirim gider (varsayılan açık). E-posta bildirimi ve "destek erişimine önceden onay" tenant ayarı insan kararıdır (aşağıda).
- Araştırma "varsayılan salt-okuma" öneriyor. ADR-0026 yazmaya izin veriyor (yasaklı listeyle). Tutarlılık için ADR-0026 izlenir. Salt-okuma varsayılanı eşik tetiklenince (impersonation kaynaklı bir müşteri şikâyeti/olayı) açılır.

### 10. Denetim olayları (tenant kapsamlı; `AuditLogs`)

Kayıt şemasına eklenecek alanlar (geriye uyumlu, isteğe bağlı): `actorType: 'user'|'platform'|'system'`, `imp?: boolean`, `targetSub?: string` (etkilenen kullanıcı), `reqId?` (ADR-0026 ile aynı). `meta.fromRole/toRole` da eklenir. Mevcut olay adları **değişmez** (testler ve tenant sorguları kırılmasın). Yeni olaylar:

| Olay | Ne zaman |
|---|---|
| `user.invite.create` / `.resend` / `.revoke` / `.accept` | Davet yaşam döngüsü |
| `membership.role_change` (meta from/to) | Rol değişimi (mevcut `user.role_change` bir sürüm boyunca birlikte yazılır) |
| `membership.suspend` / `.reactivate` / `.remove` / `.leave` | Durum ve kaldırma |
| `ownership.transfer.request` / `.accept` / `.cancel` | Sahiplik devri |
| `user.password_reset_link_sent` | Yöneticinin başkası için sıfırlama bağlantısı göndermesi |
| `reauth` (ok/fail) | Adım-yükseltmesi |
| `session.revoke_all` | "Tüm oturumlarımı kapat" (kendi) |
| `authz.denied` | 403 örüntüsü; `(sub, capability)` başına 5 dakikada en çok 1 kayıt (taşkın koruması) |
| `impersonation.start` / `.end` | ADR-0026 |
| `settings.update`, `integration.credentials.update`, `billing.checkout.start` | Hassas tenant yazmaları; `effect`'ten türetilmiş denetim (ADR-0026 bulgusu) |

Mevcut `user.create`, `user.delete`, `user.role_change`, `user.password_change` olaylarına `targetSub` eklenir (A-08).

### 11. FE'ye izin taşıma

- `GET /api/userContext` ve login/selectStore profil DTO'suna **eklemeli** alanlar gelir: `role`, `permissions: string[]`, `tenant: {tid, title}`, `entitlements: {features[], limits{users, …}, usage{users}}`, `impersonation?: {expiresAt}`, `reauthValidUntil?`. Mevcut alanlar (`owner`, `roleCode`, `resources`, `isGlobalAdmin`) FE geçişi bitene kadar kalır. `resources` sonra kaldırılır.
- FE: `useUser().can('users:manage')`; menü ve düğme görünürlüğü yalnız bundan okunur. Gizleme bir kolaylıktır; sunucu her zaman zorlar. Yanıt 403 ise "yetkiniz yok" gösterilir, `SUBSCRIPTION_RESTRICTED/PLAN_LIMIT_REACHED` ise "planı yükselt".
- Menü öğeleri ve rotalar izin anahtarı taşır (`meta.permission`). Router guard izni yoksa "yetkisiz" sayfasına yönlendirir.

### 12. Çoklu tenant üyeliği (Aşama 3, eşikli)

Model hazırdır. Açıldığında: giriş sonrası 1'den fazla aktif üyelik varsa `requireTenantSelection` döner (süper yöneticinin mağaza seçimiyle aynı UX). `SecurityService/switchTenant {tid}` üyelik doğrular ve çerezi yeni `tid` ile basar (`imp:false`). Davetle mevcut kullanıcı eklenebilir. `Users.order` artık anlamsızdır (Aşama G'de kalkar).

### 13. Göç (DB'ye dokunur — kural 3: doğrulanmış yedek; canlı için Protokol 12)

ADR-0021 Karar 4 göç çerçevesi (`backend/migrations/NNNN-*.js`: `plan/up/down`) kullanılır. Sıra **E(xpand) → K(opya/okuma) → G(eri alınmaz temizlik)**:

| Adım | İçerik | Geri dönüş |
|---|---|---|
| **G0 ön kontrol** (salt okuma) | `dev-tools/precheck-memberships.js`: merkezi `Users` (ga hariç) → `order`'ı olmayan/`Clients`'ta bulunmayan/`PURGED` olanlar; sahibi 0 veya >1 olan tenant'lar; merkezi ↔ tenant `Users` fark raporu (e-posta farkı, `roleCode` farkı, yalnız bir tarafta olan). Çıkış kodu ≠ 0 ise durulur, insan karar verir | — |
| **E1** `0003-memberships-app.js` | `Memberships`, `Invitations` koleksiyonları ve indeksleri | `down`: yalnız bu göçün yarattığı koleksiyonları düşür |
| **E2** `0004-memberships-backfill.js` | Her uygun `Users` için `upsert {userId, tid:order}`, `role = legacyRole(owner, roleCode)`, `status = isActive===false ? 'suspended' : 'active'`. İdempotent. `createdBy:'migration:0004'` | `down`: `deleteMany({createdBy:'migration:0004'})` |
| **K1** bayrak `MEMBERSHIP_SOURCE=dual` | Okuma üyelikten, eski alanlara düşüş loglanır. Yazmalar hem üyeliğe hem eski ayna alanlara yapılır. Tenant `Users` kopyasına yazım durur | Bayrak `legacy` |
| **K2** gözlem | En az 14 gün `membership.fallback = 0` ve `authz.divergence = 0` | — |
| **K3** bayrak `membership` | Eski alanlar okunmaz | Bayrak `dual` |
| **G1** `0005-legacy-user-fields-unset.js` | Merkezi `Users`: `$unset owner, roleCode, resources` (`order/clientId` Aşama 3'e kadar ayna kalır; `claimsFromUser` onları kullanmayı bırakınca kalkar). Tenant `Users`: `$unset password` (ADR-0021 D11-G) | Geri alınmaz. `up` öncesi alanların yedek dökümü `backup/` altına yazılır (script bunu zorunlu tutar) |

- Yerelde prova: izinli yerel DB'lerde (`entegrasyonikDB` + tenant DB'leri), `plan → up → down → up`. Uygulama `npm run start:local` ile uçtan uca denenir. **Local'de yeni tenant oluşturulmaz** (kural 5). Davet ve kabul testleri mock'lu/bellek-içi Mongo ile yapılır.
- Canlı (Atlas) E1/E2/G1: Protokol 12 onayı + bakım penceresi gerekmez (ek koleksiyon + idempotent geri doldurma), ama yedek şarttır. G1 ayrı onay ister.
- Kod geri dönüşü: bayrak `legacy`. Üyelik koleksiyonu zarar vermeden durur.

## Gerekçe

- **Açıkları kapatan en küçük değişiklik.** A-01/A-02 (admin → sahip devralma, sahibin silinmesi) hedef-kullanıcı kuralları gerektirir. Kademe bunu ifade edemez. Üyelik ve sistem rolleri, ADR-0019 kaydına tek bir alan (`permission`) ekleyerek kurulur. Yeni servis, motor ya da bağımlılık yoktur (`lru-cache` zaten var).
- **Geriye uyumlu.** Parite testi, `operator/admin/owner`'ın bugünkü 174 kararla birebir aynı olduğunu kanıtlar. FE sözleşmesi eklemeyle genişler. Eski alanlar geçiş boyunca ayna olarak kalır.
- **Performans nötr.** `(sub, tid, tv)` anahtarlı önbellek sayesinde istek başına okuma ADR-0024 hedefinde (1) kalır. `tv`'nin zaten her istekte okunması, geçersizlemeyi pod'lar arasında bedavaya doğru yapar.
- **Maliyet bilinci.** Özel roller, kapsam, çoklu üyelik ve tenant 2FA bugün talep edilmiyor. Model onlara hazır, ama her biri sayısal eşiğe bağlı. Viewer ve Muhasebe iki kod satırı rol tanımıdır, bu yüzden Aşama 2'de ucuzdur.
- **Refactor, yeniden yazım değil.** `UserService` küçüktür (227 satır). Davranışı karakterizasyon testleriyle sabitlenebilir (`user-service-token-version`, `user-service-email-uniqueness` mevcut). Kurallar yeni `MembershipService`'e taşınır, RPC adları korunur.

## Maliyet/Ölçek Notu

- **Ek maliyet:** 2 yeni koleksiyon (ApplicationDB), 1 süreç-içi LRU, ~35 izin anahtarı + 5 rol (kod). Ek servis veya bağımlılık yok. Operasyon yükü: yeni yetenek eklerken `permission` seçmek (derleyici zorlar).
- **Yeniden değerlendirme eşikleri:**
  - **Özel roller:** ≥3 tenant talep ederse ya da herhangi bir tenant'ta ≥10 aktif üye olursa → Aşama 3 özel roller (entitlement `customRoles`, üst plan).
  - **Kaynak kapsamı:** ≥2 tenant "personel yalnız belirli pazaryerini görsün" isterse → `scope.integrationCodes`.
  - **Politika motoru (OpenFGA/Cerbos):** Kapsam dışında nesne düzeyi paylaşım gerekirse ya da `can` içinde >5 koşul birikirse → motor değerlendirilir; `can` arayüzü korunur.
  - **Çoklu üyelik:** İlk ajans/çok mağazalı müşteri talebi ya da "aynı e-posta ile ikinci mağaza" konulu ≥2 destek talebi → Aşama 3 çoklu üyelik.
  - **Tenant 2FA:** Herhangi bir tenant hesabı ele geçirme olayı ya da ≥1 müşteri talebi → TOTP (opsiyonel). Bir olay → sahip/yönetici için zorunlu kılma tenant ayarı.
  - **Önbellek:** `authenticate` p95 > 10 ms ya da sürekli > 50 istek/sn → `Users` okumasına 5 sn TTL değerlendirilir (ADR-0001 eşiği; iptal gecikmesi kabul edilirse).
  - **SSO/SCIM:** İlk kurumsal müşteri şartı → entitlement `sso` ile OIDC; SCIM deprovizyonu = üyelik askıya alma.

## Etki Alanı

- Backend: `api/{authenticate,RunOperation,operationPolicy,profileDto,ExportDownloadApiManager,ApiManager}.ts`, `api/services/{user,security,account,tenant-data,audit}-service.ts`, yeni `operations/users/MembershipService.ts`, `operations/users/InvitationService.ts`, yeni `platform/authz/{can,MembershipCache,actor}.ts`, `capabilities/{types,define,index}.ts` + yeni `capabilities/{permissions,roles}.ts` + `domains/*.ts` (her yeteneğe `permission`), `capabilities/rpc-input/identity.ts`, `database/application/models/{Membership,Invitation}.ts` (yeni) + `AuditLog.ts` (alan ekleme) + `AccountToken.ts` (yeni amaç), `services/audit/AuditLogger.ts`, `operations/tenant/{TenantProvisioningService,exportCollections}.ts`, `operations/account/AccountLifecycleService.ts` (tenant kopyası senkronu kalkar), `migrations/0003..0005`, `dev-tools/precheck-memberships.js`.
- Frontend: `composables/user.ts` (`can`), `stores/context.ts`, `router/index.ts` (`meta.permission`), `views/secure/user/AuthorizationListView.vue`, `components/user/UserAddComponent.vue` (davet), yeni davet kabul sayfası, sahiplik devri ve askıya alma diyalogları, impersonation bandı (ADR-0026).
- Belgeler: `docs/CAPABILITIES.md` (izin sütunu; üretilmiş), `docs/API_ACCOUNT_LIFECYCLE.md` (davet/devir), `docs/OPERATION_POLICY.md` (model bölümü).
- İlgili ADR'ler: 0001, 0003, 0008, 0010, 0019, 0021 (D11), 0023, 0024 (P1-CORE), 0026.
- Uygulama iş paketleri ve bulut FE brifi: `docs/audits/TENANT_USER_RBAC_AUDIT_2026-09-30.md` §4-§6.

# 0001 — Kimlik Doğrulama, Tenant Kimliği ve Sunucu Tarafı Yetkilendirme (RBAC)

## Durum
Kabul edildi (2026-09-26). Uygulama Protokol 13'e bağlıdır (önce characterization testleri). JWT sırrının üretimi/rotasyonu ve canlıya deploy insan onayı gerektirir (Protokol 12).

## Bağlam
Faz 1 denetimleri kimlik katmanının fiilen etkisiz olduğunu gösterdi (BACKLOG C1, C2):
- `SAAS_CORE_AUDIT.md` §2.1, §5, §13 ve `DATA_ARCHITECTURE_AUDIT.md` L-01/L-01b/L-02: genel RPC rotaları (`POST /api/:service/:operation`, `GET /api/:service`), görsel rotaları ve `Webserver.ts` içindeki "mock security" middleware'i token'ı imza doğrulamadan (`jwt.decode`) okuyor; token yoksa istek yine servise gidiyor.
- İmza sırrı kaynak kodda sabit ve git geçmişinde; token'da `exp` yok (süresiz); token yükü kullanıcı dokümanının tamamı (`resources` vb. dahil).
- Tenant kimliği (`order`) ve `isGlobalAdmin` imzasız yükten okunuyor → sahte token ile herhangi bir tenant'a tam okuma/yazma ve `selectStore` ile geçerli imzalı token üretimi.
- Sunucuda RBAC yok: `GlobalRoles.permissions`, `roleCode`, `owner` hiçbir yerde kontrol edilmiyor; `AdminService`'in 14 operasyonu kimliksiz çağrılabilir.
- Jenerik RPC, URL'deki operasyon adını sınıfın herhangi bir metoduna (yardımcı/`init` dahil) yönlendiriyor; izinli liste yok.
- Logout sunucuda no-op, iptal mekanizması yok; `selectStore` yeni token'ı gövdede döndürüyor ama çereze yazmıyor (süper yönetici mağaza seçimi muhtemelen kırık).
- CSRF: prod'da `SameSite=None`, CSRF koruması yok.
- Faz 4'te MCP sunucusu aynı kimlik/yetki modelini kullanacak (`docs/research/1f-findings.md` §6: OAuth 2.1 + PKCE, audience doğrulaması, token passthrough yasağı).

Mevcut istemci (Vue SPA) `/api/userContext` yanıtından yalnızca `owner`, `resources`, `username` gibi profil alanlarını okur ve rota değişiminde `/api/checkAuthentication` çağırır; 401 alırsa `/login`'e yönlenir.

## Değerlendirilen Alternatifler

**A. Mevcut JWT'yi düzelt: imzalı, süreli, asgari claim'li oturum JWT'si + sunucu tarafı `tokenVersion` iptali + kod içi operasyon politika kaydı (seçilen)**
- Artı: mevcut çerez akışı ve FE sözleşmesi korunur; yeni altyapı/servis yok; değişiklik küçük ve test edilebilir (Security.ts, ApiManager.ts, RunOperation.ts, ApiWrapper.ts, Webserver.ts).
- Eksi: istek başına merkezi `Users` okuması (tokenVersion) gerekir; çalınan token'ın iptali için `tokenVersion` artırılmalı (tekil oturum iptali yok).

**B. Sunucu tarafı oturum (express-session + Mongo store), JWT'yi kaldır**
- Artı: tekil oturum iptali doğal; token içeriği sunucuda.
- Eksi: yeni bağımlılık ve oturum koleksiyonu; Faz 4'teki MCP/Tauri gibi çerezsiz istemciler için yine token modeli gerekecek → iki model. Kazanç, A'nın `tokenVersion`'ına göre marjinal.

**C. Kısa ömürlü access token (15 dk) + refresh token rotasyonu (tam OAuth 2.1 benzeri)**
- Artı: endüstri standardı; MCP spesifikasyonuyla doğrudan uyumlu.
- Eksi: refresh deposu, rotasyon/yeniden kullanım tespiti, FE'de yenileme mantığı; tek haneli abone ve tek tarayıcı istemcisi için aşırı karmaşıklık. Çerezsiz istemci gelene kadar getirisi yok.

**D. Harici kimlik sağlayıcı (Auth0/Clerk/Keycloak)**
- Artı: MFA/parola sıfırlama/SSO hazır.
- Eksi: aylık maliyet veya işletilecek ek servis; mevcut `Users`/tenant modelinin taşınması; tek haneli ölçekte orantısız.

**RBAC için alt alternatifler:** (i) `GlobalRoles.permissions` ile operasyon bazlı ince izin; (ii) kod içinde operasyon başına kademe (tier) politikası; (iii) Casbin/OPA gibi politika motoru. (ii) seçildi; (i) eşik aşılınca (ii)'nin üzerine eklenir; (iii) bu ölçekte gereksiz.

## Karar
Mevcut JWT/çerez modeli yerinde refactor edilir: tüm `/api` rotaları varsayılan olarak reddeden tek bir kimlik middleware'inden geçer, token yalnızca env'deki sırla `HS256` olarak açık algoritma listesiyle doğrulanır, tenant kimliği yalnızca doğrulanmış `tid` claim'inden türetilir ve her operasyon kod içindeki izinli liste/kademe politikasına göre (varsayılan ret) yetkilendirilir.

Ayrıntılar:

1. **İmza doğrulama:** `decode` istek yollarından tamamen kaldırılır. `jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience })`. `Webserver.ts` "MOCK SECURITY" middleware'i silinir; yerine tek `authenticate` middleware'i gelir. Açık (kimliksiz) rotalar yalnızca sabit bir listededir: `SecurityService/login`, `SecurityService/register`, `SecurityService/getCaptcha`, `checkAuthentication` (401 döndürmesi beklenir), SPA statik dosyaları. Geri kalan her şey token yok/geçersizse **401**.
2. **Sır yönetimi:** `JWT_SECRET` env'den okunur (≥32 bayt rastgele). Tanımsız veya kısaysa süreç **başlamaz** (fail-fast; dev dahil — dev için ayrı rastgele değer). Rotasyon için isteğe bağlı `JWT_SECRET_PREVIOUS` yalnızca doğrulamada kabul edilir (bir token ömrü kadar), imzalamada kullanılmaz. Kaynak koddaki eski sabit sır **hiçbir koşulda kabul edilmez** (geçmişte sızmış sayılır).
3. **Token içeriği (asgari claim):** `sub` (merkezi `Users._id`), `tid` (tenant `order`, sayı; süper yönetici mağaza seçmeden önce yok), `role` (`roleCode`), `ga` (isGlobalAdmin), `tv` (tokenVersion), `imp` (süper yönetici başka tenant'ı görüntülüyorsa `true`), `iat`, `exp`, `iss`, `aud` (`web`). Kullanıcı dokümanı, `resources`, parola özeti token'a girmez.
4. **Ömür/yenileme/iptal:** `exp` = 8 saat (mevcut çerez süresi korunur). Kalan süre <4 saat olan geçerli token'lar kimlikli bir istekte yeniden imzalanır (sliding), ancak ilk girişten (`auth_time` claim'i) itibaren en fazla 7 gün; sonra yeniden giriş. Refresh token **yok**. İptal: merkezi `Users.tokenVersion`; parola değişimi, kullanıcı silme/pasifleştirme, rol değişimi ve "tüm oturumları kapat" bu sayıyı artırır. Middleware her istekte `sub` ile `Users`'ı (indeksli `_id`) okur ve `tv`, hesap kilidi/pasifliği kontrol eder. Logout çerezi siler; tekil token iptali (jti kara listesi) yapılmaz.
5. **Tenant kimliğinin türetilmesi:** Servislere geçen tenant kimliği yalnızca doğrulanmış `principal.tid`'dir; istek gövdesindeki `userContext`, `clientId`, `order` alanları sunucuda ezilir/yok sayılır. Middleware ayrıca (a) tenant olmayan kullanıcı için `Users.order == tid` eşitliğini, (b) `Clients` kaydının `status == 'ACTIVE'` olduğunu doğrular (bu sorgu zaten `getClientDB` içinde yapılıyor; indeks ADR 0003'te).
6. **`selectStore`:** Yalnızca `ga == true` doğrulanmış principal çağırabilir; hedef tenant `ACTIVE` olmalı. Sunucu yeni token'ı **`Set-Cookie` ile** yazar (gövdede token dönmez), `imp: true` ve `tid` set eder, olayı audit log'a yazar. Süper yönetici, tenant bağlamında `admin` kademesinde çalışır (`owner` kademesi değil).
7. **RBAC modeli (kademe):** Kademeler: `public` < `member` (tenant'taki her kullanıcı; `ROLE_OPERATOR` ve rolü tanımsız kullanıcı dahil) < `admin` (`ROLE_ADMIN`, `ROLE_OWNER`) < `owner` (`owner == true`) ve ayrı dikey `platformAdmin` (`ga == true`). Tanımsız/bilinmeyen `roleCode` en düşük tenant kademesi (`member`) sayılır.
8. **İzinli liste = politika kaydı:** Kodda tek bir `OPERATION_POLICY` kaydı (servis → operasyon → kademe) tutulur. `ApiWrapper` yalnızca kayıtta olan operasyonları çağırır; kayıtta olmayan her şey **403/404 (varsayılan ret)** — `init`, yardımcı ve özel metotlar dahil. İlk kayıt, FE'nin fiilen çağırdığı operasyonlardan (restApi çağrı envanteri, ≈130 operasyon) ve arka planda gerekli olanlardan çıkarılır; FE'nin çağırmadığı operasyon kayda girmez. Varsayılan kademe ataması: okuma ve günlük operasyonlar `member`; kullanıcı/rol yönetimi, entegrasyon kimlik bilgisi yazma, ayarlar `admin`; tenant veri dışa aktarma/silme (ADR 0003) `owner`; `AdminService` **tamamı `platformAdmin`**. `GlobalRoles.permissions` bu aşamada uygulanmaz (FE menü görünürlüğü için kalır).
9. **Görsel rotaları (`ImageApiManager`)** aynı middleware ve aynı politika kaydını kullanır; `res.locals.userContext` yalnızca doğrulanmış principal'dan dolar.
10. **CSRF ve giriş sertleştirmesi (asgari):** Durum değiştiren isteklerde `Origin` (yoksa `Referer`) başlığı `CORS_ORIGINS` listesine karşı doğrulanır; CORS `origin: '*'` kabul edilmez. `SameSite` değeri Faz 4 masaüstü/WebView ADR'sine kadar mevcut haliyle kalır. `login`/`register` için süreç-içi IP rate limit (ör. 10 istek/dk/IP), tek tip hata mesajı ("e-posta veya parola hatalı"), `username` yalnızca string kabul edilir (NoSQL operatör enjeksiyonu), sahte captcha ya gerçek doğrulamayla değiştirilir ya da kaldırılır (hesap kilidi + rate limit yeterli).
11. **Audit log (asgari):** ApplicationDB'de `AuditLogs` koleksiyonu (TTL 365 gün): giriş başarılı/başarısız, `selectStore`, rol/parola değişimi, kullanıcı ekleme/silme, tüm `AdminService` yazma işlemleri. Kayıtta PII olarak yalnızca `sub`/`tid`/IP tutulur.
12. **Yanıt hijyeni:** login/register/`userContext` yanıtları sunucuda kurulan bir **profil DTO**'sudur (FE'nin kullandığı `owner`, `resources`, `username`, ad-soyad, `roleCode`, `isGlobalAdmin`, `order` alanları korunur); parola özeti, `tokenVersion`, kilit sayaçları dönmez. Hata yanıtları istek gövdesini geri yansıtmaz. (Genel maskeleme kuralı: ADR 0003.)
13. **MCP (Faz 4) notu:** MCP katmanı kendi yetkilendirme mantığını yazmaz; aynı principal modelini (`sub`, `tid`, kademe) ve aynı `OPERATION_POLICY` kaydını kullanır, MCP araçları yalnızca kayıtta izin verilen operasyonları sarar. MCP için verilen token'lar `aud: mcp` ile ayrılır ve web token'ı MCP'de kabul edilmez (passthrough yasağı). Uzak MCP'nin OAuth 2.1 akışı (yetkilendirme sunucusu, PKCE, refresh rotasyonu) MCP topolojisi ADR'sinde kararlaştırılır; bu ADR'nin token modeli o noktada genişletilir, yeniden yazılmaz.

**Refactor, yeniden yazım değil:** Kimlik katmanı küçük (≈5 dosya) ve davranışı characterization testleriyle sabitlenebilir; audit bulgusu "yanlış kurulmuş" olsa da mevcut çerez/FE sözleşmesi korunarak yerinde düzeltilir. Clean-room yeniden yazım kararı verilmemiştir.

### Geçiş planı (mevcut istemcileri kırmadan)
Eski token'lar sızmış sabit sırla imzalı ve süresiz olduğundan **geçiş penceresinde bile kabul edilmez**; tüm kullanıcılar bir kez yeniden giriş yapar (tek haneli abone ölçeğinde kabul edilebilir maliyet). FE zaten `checkAuthentication` 401'inde `/login`'e yönlenir; ek olarak `restapi.ts`'e global 401 yakalayıcı eklenir. Çerez adı değişmez.

Sıra:
1. **Characterization testleri (jest + supertest, local Mongo, iki test tenant'ı):** (T1) imzasız/`alg:none`/yanlış sırla imzalı token ile tenant servisi çağrısı; (T2) token'sız `AdminService/getClients`; (T3) başka tenant'ın `order`'ı ile token; (T4) login/register yanıtında parola özeti; (T5) `/userContext` yanıt alanları (FE sözleşmesi); (T6) kayıtta olmayan metot (`init`, yardımcı metot) çağrısı; (T7) `selectStore` sonrası çerez; (T8) logout sonrası token. Testler önce mevcut (hatalı) davranışı belgeler; her düzeltme adımında beklenen değer tersine çevrilir.
2. `JWT_SECRET` env + fail-fast; `HS256` + `exp` + asgari claim; `verify` (T1, T3).
3. `authenticate` middleware; mock middleware ve tüm `decode` kullanımları kaldırılır; açık rota listesi (T2).
4. Principal → `RunOperation`: `tid` kaynağı, `ACTIVE` kontrolü, `tokenVersion` kontrolü (T3, T8).
5. `OPERATION_POLICY` + `ApiWrapper` varsayılan ret; `AdminService` = `platformAdmin` (T2, T6).
6. `selectStore` çerez akışı + audit log (T7).
7. Profil DTO, hata yanıtı hijyeni (T4, T5); login/register rate limit + Origin kontrolü.
8. FE: 401 yakalayıcı, `selectStore` akışının yeni yanıtla uyumu.
9. İnsan onayı: prod `JWT_SECRET` üretimi ve deploy (Protokol 12). Deploy anında tüm oturumlar düşer; önceden abonelere duyuru önerilir.

## Gerekçe
- Tek haneli abone ve tek istemci (tarayıcı SPA) için imzalı, süreli bir oturum JWT'si + `tokenVersion` iptali; refresh token, harici IdP veya oturum deposu gerektirmeden bulgulardaki tüm critical açıkları (L-01, L-01b, L-02, selectStore yükseltmesi, iptalsiz token) kapatır.
- `tokenVersion` kontrolü istek başına tek bir indeksli `_id` okumasıdır; bu ölçekte (saniyede birkaç istek) maliyeti ihmal edilebilir ve sunucu tarafı oturumun sağladığı iptalin pratikteki karşılığını verir.
- Operasyon politika kaydı hem izinli listeyi hem RBAC'yi tek yerde çözer; kod incelemesinde görünür, test edilebilir ve MCP tarafından yeniden kullanılabilir. İnce taneli izin (permissions) henüz talep eden müşteri olmadan eklenirse bakım yükü getirir.
- Eski token'ları kabul etmemek güvenlik açısından zorunludur (sır sızmış); bunun bedeli tek seferlik yeniden giriş.

## Maliyet/Ölçek Notu
- Ek servis yok. Ek bağımlılık: `supertest` (dev), isteğe bağlı `express-rate-limit` (süreç-içi depo). Ek DB: `AuditLogs` koleksiyonu (TTL'li), `Users.tokenVersion` alanı.
- Operasyon yükü: `OPERATION_POLICY` kaydı, FE'ye yeni operasyon eklendiğinde güncellenmelidir (eksikse 403 ile hemen görünür).
- Gözden geçirme eşikleri:
  - Çerezsiz bir istemci (Tauri/mobil uygulama veya uzak MCP) üretime alınırsa → refresh token rotasyonu/OAuth 2.1 (Alternatif C) bu ADR'nin genişletmesi olarak yeniden değerlendirilir.
  - Aktif tenant sayısı **25**'i geçerse veya herhangi bir tenant'ta **5**'ten fazla kullanıcı olup kısıtlı personel rolü talep edilirse → `GlobalRoles.permissions` ile operasyon bazlı izin eklenir.
  - `authenticate` middleware'inin `Users` okuması p95 **10 ms**'yi aşarsa veya sürekli **50 istek/sn** üzerine çıkılırsa → `tokenVersion` için 30 sn'lik süreç-içi önbellek (ADR 0002 kurallarına uygun, kullanıcı kapsamlı).
  - API **2 veya daha fazla replika** ile çalışırsa → rate limit deposu Redis'e taşınır.
  - Token'ı doğrulaması gereken **ikinci bir süreç/servis** (ör. ayrı MCP sunucusu) ortaya çıkarsa → `HS256`'dan asimetrik imzaya (`ES256` + kid) geçiş değerlendirilir; sır paylaşılmaz.

## Etki Alanı
- Backend: `api/Security.ts`, `api/ApiManager.ts`, `api/RunOperation.ts`, `api/ApiWrapper.ts`, `api/ImageApiManager.ts`, `Webserver.ts`, `api/services/security-service.ts` (login/register/selectStore/logout), `api/services/user-service.ts` (tokenVersion artışı, parola değişimi), `api/services/admin-service.ts` (platformAdmin), `database/application/models/User.ts` (`tokenVersion`), yeni `AuditLogs` modeli, `.env.example` (`JWT_SECRET`, `JWT_SECRET_PREVIOUS`, `JWT_ISSUER`).
- Frontend: `composables/restapi.ts` (401 yakalayıcı), `composables/user.ts` (`selectStore`).
- İlgili ADR'ler: 0002 (önbellek kapsamı), 0003 (tenant durumu, `Users.email` tekilliği, maskeleme kuralı, sır rotasyonu), MCP topolojisi ADR'si (Faz 4), 0010 (çerezsiz istemciler için OAuth 2.1 genişlemesi — Alternatif C'nin uygulanması).

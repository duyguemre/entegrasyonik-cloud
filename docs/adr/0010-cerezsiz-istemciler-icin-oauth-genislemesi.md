# 0010 — Çerezsiz İstemciler İçin OAuth 2.1 Genişlemesi (ADR-0001'in Alternatif C'si)

## Durum
Kabul edildi (2026-09-27). **Ön koşul:** ADR-0001'in geçiş planı (adım 1–9) uygulanmış ve BACKLOG C1–C4 (imzasız JWT, yetkisiz AdminService, `@Cache` tenant sızıntısı, IDOR) kapatılmış olmalıdır; bu olmadan bu ADR'deki hiçbir uç nokta hiçbir ortamda dışarı açılmaz. Prod imza sırrının üretimi ve deploy insan onayı gerektirir (Protokol 12). Bu ADR ADR-0001'i **genişletir, yerine geçmez**; çelişki olursa principal/RBAC/iptal konusunda ADR-0001 esas alınır.

## Bağlam
- ADR-0001, tek istemci (tarayıcı SPA) için imzalı çerez JWT'si + `Users.tokenVersion` iptalini seçti; refresh token rotasyonunu / OAuth 2.1'i (Alternatif C) açıkça erteledi: "Çerezsiz bir istemci (Tauri/mobil uygulama veya uzak MCP) üretime alınırsa → Alternatif C bu ADR'nin genişletmesi olarak yeniden değerlendirilir" (ADR-0001, Maliyet/Ölçek Notu). ADR-0001 madde 13 de uzak MCP'nin OAuth akışını ayrı bir karara bırakır.
- Bu eşik Faz 4'te tetiklenir: ADR-0007 masaüstü (Tauri, HTTP Rust tarafında, çerez yok) ve PWA için OAuth 2.1 + PKCE Bearer oturumu; ADR-0009 backend içinde uzak MCP (`/mcp`, Streamable HTTP, stateless) için OAuth 2.1 + PKCE S256, RFC 9728/8707, audience doğrulaması ve refresh rotasyonu öngörür.
- Tutarlılık açığı: ADR-0007 ve ADR-0009 bu token uç noktalarını "ADR-0001'in token uç noktaları" olarak anıyordu; ADR-0001'de böyle uç noktalar tanımlı değildir. Bu ADR o uç noktaları tanımlar; 0007/0009'daki atıflar bu ADR'ye çevrilmiştir.
- Kaynaklar: `docs/research/1f-findings.md` §6 (MCP yetkilendirme spesifikasyonu 2025-11-25: OAuth 2.1, PKCE S256, RFC 9728, RFC 8707, token passthrough yasağı), `.claude/skills/mcp-security-standards/SKILL.md`, `SAAS_CORE_AUDIT.md` §2.1/§5, `PRODUCT_SURFACES.md` §6.

## Değerlendirilen Alternatifler

**A. Backend içinde gömülü, asgari OAuth 2.1 yetkilendirme sunucusu (yalnızca Authorization Code + PKCE, birinci taraf public client'lar, Mongo'da refresh deposu) (seçilen)**
- Artı: yeni servis yok; ADR-0001'in principal modeli, `tokenVersion` iptali ve `OPERATION_POLICY` kaydı olduğu gibi yeniden kullanılır; MCP spesifikasyonuyla uyumlu; web çerez modeline dokunulmaz.
- Eksi: güvenlik açısından hassas yeni kod (authorize/token/revoke) yazılır ve test edilmelidir; refresh rotasyonu ve yeniden kullanım tespiti doğru kurulmalıdır.

**B. Hazır OAuth sunucu kütüphanesi (ör. `oidc-provider`) backend'e gömülür**
- Artı: spesifikasyon uyumu olgun; DCR, introspection, OIDC hazır.
- Eksi: büyük yapılandırma yüzeyi ve kendi adaptör/depo modeli; mevcut `Users`/`tid`/`tokenVersion` modeline uyarlamak asgari özel koddan daha fazla iş; ihtiyaç duyulmayan özellikler (OIDC, DCR, consent UI) saldırı yüzeyini büyütür. İki birinci taraf istemci için orantısız.

**C. Harici kimlik sağlayıcı (Auth0/Clerk/Keycloak)**
- Artı: MFA/SSO/DCR hazır.
- Eksi: aylık maliyet veya işletilecek ek servis; web çerez modeli ile iki ayrı kimlik kaynağı ya da web'in de taşınması (ADR-0001 Alternatif D ile aynı gerekçeyle reddedilir).

**D. Uzun ömürlü kişisel API anahtarı / uzun ömürlü Bearer JWT (refresh yok)**
- Artı: en basit.
- Eksi: MCP yetkilendirme spesifikasyonuna uymaz (PKCE, kısa ömür, rotasyon); cihazda sızan anahtar uzun süre geçerli; ADR-0007/0009 kararlarıyla çelişir.

## Karar
Backend, mevcut Express sürecinde gömülü ve yalnızca Authorization Code + PKCE (S256) destekleyen asgari bir OAuth 2.1 yetkilendirme sunucusu olur: birinci taraf public client'lara (masaüstü loopback, PWA) 15 dk ömürlü, `aud` ile ayrılmış HS256 access token ve Mongo'da saklanan, dönen ve yeniden kullanımda aileyi iptal eden refresh token verir; principal, RBAC ve iptal ADR-0001 ile birebir aynıdır ve web çerez modeli değişmez.

Ayrıntılar:

1. **Uç noktalar (tek backend, `/oauth` altında; jenerik `/:service/:operation` RPC'sinin dışında):**
   - `GET /oauth/authorize` — yalnızca `response_type=code`; `code_challenge_method=S256` zorunlu (`plain` reddedilir); `state` zorunlu; `resource` (RFC 8707) zorunlu ve izinli listede olmalı. Kullanıcı kimliği mevcut web oturumundan (ADR-0001 çerezi, `aud: web`, imza + `tokenVersion` doğrulamalı) alınır; oturum yoksa `/login`'e yönlendirilip geri dönülür. Birinci taraf istemcilerde onay ekranı yok, yalnızca "X uygulamasına giriş yapılıyor" bilgi sayfası + tek tık onay (CSRF: `state` + Origin kontrolü).
   - `POST /oauth/token` — `grant_type=authorization_code` ve `grant_type=refresh_token`; başka grant yok (implicit, password, client_credentials yok).
   - `POST /oauth/revoke` (RFC 7009) — refresh token verilirse **tüm aile** iptal edilir; bilinmeyen token için de 200 (bilgi sızdırmaz).
   - `GET /.well-known/oauth-authorization-server` (RFC 8414) ve `GET /.well-known/oauth-protected-resource` (RFC 9728, `/mcp` kaynağı için; ADR-0009). `/mcp` ve Bearer `/api` 401 yanıtlarında `WWW-Authenticate: Bearer resource_metadata=...` döner.
   - Introspection, dinamik istemci kaydı (DCR), Client ID Metadata Documents, OIDC/`id_token` **yok** (eşiğe bağlı, bkz. Maliyet/Ölçek).
2. **İstemci kaydı:** Kod içinde sabit iki public client (client secret yok): `entegrasyonik-desktop` — yönlendirme yalnızca loopback `http://127.0.0.1:{port}/callback` (RFC 8252: port her girişte değişebilir, host ve yol birebir eşleşir; `localhost` adı kabul edilmez); `entegrasyonik-pwa` — yönlendirme yalnızca kayıtlı tam HTTPS URI (birebir eşleşme). Her istemcinin izinli `resource` listesi: `api` ve `mcp`.
3. **Yetkilendirme kodu:** tek kullanımlık, **60 sn** ömürlü; `client_id`, `redirect_uri`, `code_challenge`, `resource`, `sub`, `tid` ile bağlıdır; ApplicationDB `OAuthAuthCodes` koleksiyonunda yalnızca SHA-256 özeti saklanır (TTL indeksli). İkinci kullanım denemesi o koddan verilmiş aileyi iptal eder.
4. **Access token (JWT):** ADR-0001 madde 3'teki asgari claim'lerin aynısı — `sub`, `tid`, `role`, `tv`, `iat`, `exp`, `iss` — artı `aud` ve `cid` (client_id). `aud` değerleri: `web` (yalnızca ADR-0001 çerezi; değişmez), `api` (Bearer ile `/api`, masaüstü/PWA'nın MCP dışı çağrıları), `mcp` (yalnızca `/mcp`). Her uç yalnızca kendi `aud`'unu kabul eder: `/mcp` yalnızca `aud: mcp` Bearer; `/api` çerezde yalnızca `aud: web`, Bearer'da yalnızca `aud: api`; web çerezi hiçbir Bearer uçta, Bearer token hiçbir çerez uçta geçerli değildir (passthrough yasağı). Ömür **15 dk** (ADR-0007/0009 ile aynı), sliding yenileme yok. `ga` ve `imp` claim'leri OAuth token'larına **girmez**: platform yöneticisi yetkisi ve `selectStore` taklidi yalnızca web çerez oturumunda kullanılabilir; tenant'ı olmayan kullanıcıya OAuth token'ı verilmez.
5. **Principal ve yetkilendirme (ADR-0001 ile birebir):** Bearer token doğrulandıktan sonra ADR-0001'in aynı `authenticate` hattından geçer: `sub` ile `Users` okunur, `tv`, kilit/pasiflik, `Users.order == tid`, `Clients.status == 'ACTIVE'` kontrol edilir; kademe (`member`/`admin`/`owner`) aynı kurallarla hesaplanır; `/api` Bearer çağrıları aynı `OPERATION_POLICY` kaydıyla (varsayılan ret), MCP araçları ADR-0009'daki araç kaydı üzerinden yine bu kademelerle yetkilendirilir. MCP araç rolleri ADR-0001 kademelerine eşlenir; ayrı bir rol modeli kurulmaz. CSRF/Origin kontrolü yalnızca çerezli isteklerde uygulanır (Bearer isteklerinde gerekmez).
6. **Refresh token rotasyonu ve yeniden kullanım tespiti:**
   - Refresh token opak, ≥32 bayt rastgele; istemciye bir kez verilir, sunucuda yalnızca SHA-256 özeti saklanır.
   - Her kullanımda yenisi verilir, eskisi `usedAt` ile işaretlenir. **Kullanılmış bir refresh token yeniden sunulursa tüm aile iptal edilir** ve audit log'a `oauth.refresh_reuse` yazılır. Grace penceresi yok; eşzamanlı yenilemeyi istemci serileştirir (masaüstü: Rust tarafında tek yenileyici; PWA: Web Locks API ile sekme arası kilit).
   - Her refresh kaydı ailenin oluşturulduğu andaki `tv`'yi taşır; yenilemede `Users.tokenVersion` farklıysa aile iptal edilir. Böylece ADR-0001'deki tüm iptal olayları (parola/rol değişimi, kullanıcı silme/pasifleştirme, "tüm oturumları kapat") web, masaüstü, PWA ve MCP oturumlarını birlikte kapatır; tenant `ACTIVE` değilse yenileme reddedilir.
   - Mutlak aile ömrü (ilk girişten itibaren, yenileme ile uzamaz): **PWA 7 gün** (ADR-0007 ile aynı), **masaüstü 30 gün** (refresh token Windows Credential Manager'da, WebView JS'i görmez — ADR-0007). Masaüstünde **7 gün** hiç kullanılmayan aile de sona erer (boşta kalma sınırı).
   - Refresh token `resource` kapsamlıdır: aile yalnızca authorize sırasında verilen kaynaklar (`api`, `mcp` veya ikisi) için access token üretebilir; her `/oauth/token` çağrısında `resource` ile tek audience seçilir.
   - Tekil iptal: istemci çıkışında `/oauth/revoke`; web uygulamasının "Bağlı uygulamalar" ekranından (sonraki adım, `admin` değil kullanıcının kendisi) aile bazlı iptal.
7. **Refresh deposu:** ApplicationDB'de `OAuthRefreshTokens` koleksiyonu: `{ tokenHash, familyId, sub, tid, clientId, resources[], tv, createdAt, familyExpiresAt, lastUsedAt, usedAt, revokedAt }`; indeksler: `tokenHash` (tekil), `familyId`, `sub`, TTL `familyExpiresAt`. Redis kullanılmaz (tek haneli ölçekte yenileme trafiği dakikada birkaç istektir; Mongo'nun dayanıklılığı yeterli ve Redis kesintisi oturumları düşürmez). Rotasyon tek atomik `findOneAndUpdate` (`usedAt: null` koşullu) ile yapılır; yarış halinde ikinci istek yeniden kullanım sayılır.
8. **İmza algoritması:** MCP backend ile **aynı süreçte** (ADR-0009) olduğundan token'ı doğrulayan ikinci bir süreç yoktur; ADR-0001'in ES256 eşiği tetiklenmemiştir, **HS256 kalır**. Anahtar ayrımı için OAuth access token'ları web çerezinden **ayrı bir sırla** (`JWT_OAUTH_SECRET`, ≥32 bayt, tanımsız/kısa ise süreç başlamaz; rotasyon için `JWT_OAUTH_SECRET_PREVIOUS`, ADR-0001 madde 2 ile aynı kurallar) imzalanır ve JWT başlığında `kid` taşınır; böylece `aud` denetimindeki olası bir hata web ve Bearer token'larını birbirine çeviremez. Sır değerleri repo'ya/dokümana yazılmaz.
9. **Rate limit:** `/oauth/authorize` ADR-0001'in giriş limitini paylaşır (10 istek/dk/IP); `/oauth/token` **30 istek/dk/IP** ve **10 istek/dk/aile**; `/oauth/revoke` 30 istek/dk/IP — ADR-0001'deki süreç-içi limiter (`express-rate-limit`) ile. MCP araç çağrısı limitleri ADR-0009'daki gibi (Redis, 60/dk kullanıcı-token, 300/dk tenant) değişmez.
10. **Audit:** ADR-0001'in `AuditLogs` koleksiyonuna: yetkilendirme verildi, token verildi (aile oluşturma), yeniden kullanım tespiti, iptal (istemci/kullanıcı/`tv`), reddedilen `aud`/`resource`. Token veya özet loglanmaz; yalnızca `sub`, `tid`, `clientId`, `familyId`, IP.
11. **Web çerez modeli değişmez:** ADR-0001 madde 3–4 (8 saat `exp`, 7 gün `auth_time` sınırlı sliding, refresh yok, `aud: web`, çerez adı) aynen kalır. Web SPA OAuth akışını kullanmaz.

**Refactor, yeniden yazım değil:** Bu ADR yeni uç noktalar ekler; ADR-0001 ile düzeltilen kimlik katmanı (`authenticate` middleware, principal, `OPERATION_POLICY`) yeniden yazılmaz, yalnızca Bearer/`aud` dalıyla genişletilir.

### Uygulama sırası
1. Ön koşul doğrulaması: ADR-0001 adım 1–9 tamam, BACKLOG C1–C4 kapalı, ADR-0001 characterization testleri yeşil.
2. Testler önce (jest + supertest, iki test tenant'ı): PKCE eksik/`plain`/yanlış verifier reddi; yönlendirme URI uyumsuzluğu; kodun ikinci kullanımı; refresh yeniden kullanımında aile iptali; `tv` artışından sonra yenileme reddi; `aud` karışması (web çerezi `/mcp`'de, `aud: mcp` token `/api`'de, `aud: api` token çerez yolunda reddedilir); tenant A token'ı ile B verisi dönmez; `ga` kullanıcısına OAuth token'ında `ga`/`imp` yok; pasif tenant'ta yenileme reddi.
3. Modeller (`OAuthAuthCodes`, `OAuthRefreshTokens`) + `JWT_OAUTH_SECRET` fail-fast + metadata uç noktaları.
4. `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`; `authenticate` hattına Bearer/`aud` dalı.
5. Masaüstü oturumu (ADR-0007 "Faz 4 ilk üç adım" #2), ardından PWA.
6. `/mcp` (ADR-0009) — yalnızca 2. adımdaki testler ve ADR-0009 Faz 4 DoD testleri yeşilken.
7. İnsan onayı: prod `JWT_OAUTH_SECRET` üretimi ve `/oauth` + `/mcp`'nin dışarı açıldığı deploy (Protokol 12).

## Gerekçe
- Eşik (çerezsiz istemci) ADR-0001'in önceden tanımladığı biçimde tetiklendi; bu ADR ADR-0001'in modelini genişletir: aynı principal, aynı `tokenVersion` iptali, aynı politika kaydı → iki ayrı yetki modeli oluşmaz.
- Yalnızca iki birinci taraf public client ve tek grant türü (Authorization Code + PKCE) desteklemek, MCP spesifikasyonunun zorunlu kıldığı asgariyi karşılar; DCR/OIDC/introspection gibi bu ölçekte kullanılmayacak yüzeyler eklenmez (Maliyet Bilinci).
- Refresh deposu olarak Mongo: zaten işletilen, dayanıklı bir depo; tek haneli abonede yenileme trafiği ihmal edilebilir. Redis'e koymak, Redis kesintisinde tüm çerezsiz oturumları düşürür ve kazanç sağlamaz.
- 15 dk access token + her istekte `tv` kontrolü (ADR-0001): iptal zaten anında etkili; kısa ömür yalnızca sızan token'ın yeniden kullanım penceresini daraltır ve spesifikasyonla uyumludur.
- HS256 + ayrı sır: tek doğrulayıcı süreç varken asimetrik anahtar/JWKS altyapısı gereksizdir; ayrı sır, `aud` hatalarına karşı ucuz bir ikinci savunma hattıdır.
- Web çerez modelinin değişmemesi, ADR-0001 geçişinin ve mevcut FE sözleşmesinin yeniden açılmamasını sağlar.

## Maliyet/Ölçek Notu
- Ek servis yok. Ek bağımlılık yok (JWT kütüphanesi ve `express-rate-limit` ADR-0001'den; PKCE için Node `crypto`). Ek DB: `OAuthAuthCodes`, `OAuthRefreshTokens` (TTL'li). Ek sır: `JWT_OAUTH_SECRET` (+ isteğe bağlı `_PREVIOUS`).
- Operasyon yükü: yeni güvenlik kritik kod (~4 uç nokta) ve test seti; ek sırrın rotasyonu (insan).
- Gözden geçirme eşikleri:
  - Token'ı doğrulaması gereken **ikinci bir süreç/servis** ortaya çıkarsa (ör. ADR-0009'un "MCP ayrı süreç" eşiği: `tools/call` p95 **2 sn** veya MCP CPU payı **%30**) → `ES256` + `kid` + JWKS uç noktasına geçiş (ADR-0001 eşiğiyle aynı).
  - Birinci taraf olmayan bir MCP istemcisi (ör. Claude Desktop) desteğini **en az 2 ödeyen müşteri** talep ederse → Client ID Metadata Documents / DCR ve onay ekranı ADR'si.
  - Aktif refresh ailesi sayısı **1.000**'i geçerse veya `/oauth/token` sürekli **5 istek/sn** üzerine çıkarsa ya da `OAuthRefreshTokens` sorgusu p95 **20 ms**'yi aşarsa → indeks/depo gözden geçirilir.
  - API **2 veya daha fazla replika** ile çalışırsa → `/oauth/*` rate limit deposu Redis'e taşınır (ADR-0001 eşiğiyle aynı).
  - Meşru kullanımdan kaynaklanan yeniden kullanım iptalleri (kullanıcı şikâyetiyle doğrulanmış) ayda **3**'ü geçerse → istemci serileştirmesi düzeltilir; o yetmezse **≤10 sn** grace penceresi değerlendirilir.
  - MFA veya SSO talep eden ödeyen müşteri sayısı **2**'yi geçerse ya da aktif tenant **50**'yi geçerse → harici IdP (Alternatif C) veya OIDC katmanı yeniden değerlendirilir.
  - PWA'ya yazma işlemi eklenirse (mobil MVP salt-okunur olmaktan çıkarsa) → PWA mutlak ömrü (7 gün) ve IndexedDB saklama modeli yeniden değerlendirilir.

## Etki Alanı
- Backend: yeni `src/api/oauth/` (öneri: authorize, token, revoke, metadata, istemci kaydı), `api/Security.ts` (Bearer/`aud` dalı, `kid` ile sır seçimi), `Webserver.ts` (`/oauth` ve `/.well-known/*` montajı), `database/application/models/` (`OAuthAuthCodes`, `OAuthRefreshTokens`), `AuditLogs` olay türleri, `.env.example` (`JWT_OAUTH_SECRET`, `JWT_OAUTH_SECRET_PREVIOUS`).
- Frontend (web): değişiklik yok; ileride "Bağlı uygulamalar" iptal ekranı.
- `desktop/` (ADR-0007): PKCE + loopback istemcisi, Credential Manager saklama, yenileme serileştirmesi; PWA derlemesi: IndexedDB + Web Locks.
- `/mcp` (ADR-0009): `aud: mcp` doğrulaması, RFC 9728 metadata.
- İlgili ADR'ler: 0001 (temel model; bu ADR onun genişletmesi), 0007 (masaüstü/PWA oturumu), 0009 (MCP yetkilendirmesi), 0008 (entitlement guard Bearer isteklerinde de aynı sırada çalışır).

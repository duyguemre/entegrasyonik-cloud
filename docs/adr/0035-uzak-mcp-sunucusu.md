# 0035 — Uzak MCP sunucusu: üçüncü taraf yapay zekâ uygulamaları için OAuth (DCR + onay ekranı), bant dışı yazma onayı ve tek araç türetimi

## Durum
Önerildi (2026-10-01). Kod yok. Uygulama planı: `docs/MCP_PLAN.md` (MCP-1..MCP-8). Önyüz sözleşmesi: `docs/cloud-contracts/MCP_UI_CONTRACT.md`. Kullanıcı kararları: K47, K36, K37, K38, K46, K20, K21 (`docs/adr/USER_DECISIONS.md`).

**Diğer ADR'lerle ilişki (değiştirdikleri açıkça):**
- **ADR-0010'u genişletir.** ADR-0010 yalnız iki birinci taraf public client öngörüyor, dinamik istemci kaydını (DCR) ve onay ekranını "≥2 ödeyen müşteri" eşiğine bırakıyordu. K37(b) ("kullanıcı kendi yapay zekâ uygulamasını/aboneliğini bağlar") bu eşiği ürün kararıyla tetikledi: üçüncü taraf istemci sınıfı, DCR, onay ekranı, kapsamlar ve bu sınıfa özel refresh ömrü/grace burada tanımlanır. ADR-0010'un geri kalanı (gömülü asgari yetkilendirme sunucusu, PKCE S256, `aud` ayrımı, `JWT_OAUTH_SECRET`, refresh rotasyonu, `tv` iptali, `ga`/`imp` token'a girmez) aynen geçerlidir.
- **ADR-0019 §5.3'ü MCP için değiştirir.** Orada yazma onayı MCP elicitation (form) / MRTR ile istemci içinde alınıyordu ve "onay kanalı olmayan istemciye yazma aracı listelenmez" deniyordu. Üçüncü taraf istemci güvenilmez olduğundan istemcinin "kabul" yanıtı insan onayı sayılmaz; onay **bizim uygulamamızda** (web oturumu) verilir (Karar 5). ADR-0019 §10-S3 ("harici istemcilere açılması") K37 ile karara bağlandı: açık.
- **ADR-0009 §1 (istemci kaydı) ve Maliyet notundaki "3 ödeyen müşteri" eşiği** K37 ile konusuz kaldı. ADR-0009'un güvenlik, rate limit, denetim, prompt-injection ilkeleri aynen geçerlidir. K36: yerel MCP ve stdio köprüsü yoktur.
- **ADR-0034 ile aynı hat:** araç listesi ve yürütme sohbet broker'ıyla **aynı fonksiyonlardan** gelir (`mcp.exposed` → `can()` → entitlement → kill-switch → LIVE_READONLY/bakım süzgeci → `invokeCapability`). `PendingAction` deposu ortaktır; MCP için ayrı koruma listesi yazılmaz.
- **ADR-0028:** tek karar noktası `can(actor, capability)`; çoklu üyelikte bağlantı tek tenant'a bağlanır.

**Refactor/yeniden yazım:** yok. Yeni modül (`src/api/oauth/**`, `src/mcp/**`) eklenir; `authenticate` hattına Bearer/`aud:mcp` dalı eklenir, yeniden yazılmaz.

## Bağlam
- K37(b): Entegrasyonik LLM satmaz. Tüketici aboneliğiyle (masaüstü/web sohbet uygulamaları) çalışmak isteyen kullanıcı, kendi uygulamasına bizim **uzak MCP sunucumuzu** "bağlayıcı" olarak ekler. Bu uygulamalar bizim önceden kaydettiğimiz birinci taraf istemciler değildir; istemci kimliklerini çalışma anında kendileri kaydeder (DCR) ya da bir metadata URL'si sunar.
- K47: MCP fazı başladı; LIVE_READONLY ve entegrasyona yazma yasağı aynen geçerli; kod CHAT-BR-2 sonrası.
- Bugün kodda OAuth yok (`src/api/oauth` yok; `authenticate.ts` yalnız çerez). Yetenek kaydı hazır (ADR-0019 Aşama A); BR-2 araç türetimi, `invokeCapability`, `PendingAction` şu an yazılıyor. `Plan.mcpCallsPerDay` alanı mevcut.
- Spesifikasyon (repo araştırması, ADR-0019 "Dış araştırma"): Streamable HTTP; 2025-11-25 (OAuth 2.1 + PKCE S256, RFC 9728 korumalı kaynak metadata, RFC 8707 `resource`, token passthrough yasağı, istemci kaydı için Client ID Metadata Documents önerilir / DCR isteğe bağlı, URL modlu elicitation) ve 2026-07-28 (durumsuzluk, `initialize`/oturum kaldırıldı, MRTR, form elicitation'da sır yasak) revizyonları. Hangi revizyonların destekleneceği uygulama anında SDK'nın kararlı desteğiyle doğrulanır (MCP-3 ilk adımı); sürüm farkı yalnız adaptörde kalır.

## Değerlendirilen Alternatifler

### A. Yetkilendirme sunucusu
1. **ADR-0010'daki gömülü asgari yetkilendirme sunucusu + DCR + onay ekranı (SEÇİLEN).** Artı: yeni servis/ücret yok; mevcut web oturumu, `tokenVersion`, `Memberships`, `can()` aynen; tek kimlik kaynağı. Eksi: güvenlik kritik yeni kod (register/authorize/token/revoke) ve test yükü.
2. **Hazır kütüphane (`oidc-provider`).** Artı: spesifikasyon olgun. Eksi: büyük yapılandırma yüzeyi, kendi depo modeli, OIDC gibi gereksiz yüzey; bizim `Users`/`Memberships`/`tv` modeline uyarlama asgari koddan pahalı (ADR-0010 B ile aynı gerekçe).
3. **Harici kimlik sağlayıcı (Auth0/Clerk/Keycloak).** Artı: DCR/onay ekranı hazır. Eksi: aylık ücret (Protokol 12) veya işletilecek servis; web çerez oturumu ile iki kimlik kaynağı; tenant/rol bilgisi yine bizde → token zenginleştirme köprüsü. Tek haneli abone ölçeğinde orantısız.
4. **Kişisel erişim anahtarı (PAT) ile Bearer.** Artı: en basit. Eksi: MCP yetkilendirme spesifikasyonuna uymaz; hedef istemcilerin "bağlayıcı ekle" akışı OAuth bekler; uzun ömürlü sızıntı riski.

### B. Üçüncü taraf istemci kaydı
1. **DCR (RFC 7591), yalnız public client, sıkı kısıtlarla (SEÇİLEN, v1).** Artı: yaygın hedef istemcilerin tamamı destekliyor; sunucu dışarıya HTTP isteği atmaz (SSRF yok). Eksi: açık kayıt ucu → kötüye kullanım sınırı gerekir.
2. **Client ID Metadata Documents (CIMD).** Artı: spesifikasyonun önerdiği yol, kayıt deposu gerekmez. Eksi: sunucu istemcinin verdiği URL'yi çeker (SSRF yüzeyi, egress guard'a yeni istisna), önbellek ve doğrulama kodu. **Eşiğe bağlı** (Maliyet notu).
3. **Yalnız önceden kayıtlı istemciler.** Eksi: hedef uygulamaların çoğu elle istemci kimliği girmeyi desteklemez; K37(b)'yi karşılamaz.

### C. Yazma onayı
1. **İstemci içi form elicitation / MRTR "kabul" yanıtı.** Eksi: yanıtı güvenilmeyen istemci üretir; otomatik kabul eden ya da modelin yanıtladığı istemci insan onayını taklit edebilir. Destek istemciden istemciye değişir. **Onay olarak reddedildi.**
2. **Bant dışı onay: yazma aracı yürütmez, `PendingAction` + uygulamamızda onay bağlantısı döner; kullanıcı web oturumuyla onaylar (SEÇİLEN).** Artı: onay bizim kimlik doğrulamamız ve bizim önizlememizle, model ve istemci dışında verilir; her istemcide çalışır (bağlantı düz metin olarak da gösterilir); sohbetle aynı `PendingAction`. URL modlu elicitation destekleyen istemcide aynı bağlantı o kanaldan sunulur (yalnız sunum farkı). Eksi: kullanıcı bir sekme açar (sürtünme) — yazma işlemleri seyrek ve bilinçli olmalı, kabul edilebilir.
3. **MCP'de yazma yok.** Artı: en güvenli. Eksi: K46 "insan onaylı öneri" ve K20 eşitliğini MCP'de karşılamaz.

## Karar
Uzak MCP sunucusu mevcut backend sürecinde `https://api.entegrasyonik.com/mcp` (Streamable HTTP, durumsuz) olarak açılır; yetkilendirme ADR-0010'un gömülü asgari OAuth 2.1 sunucusunun DCR + onay ekranı + `mcp:read`/`mcp:write` kapsamlarıyla genişletilmiş hâlidir; araç listesi ve yürütme sohbet broker'ıyla aynı türetimden gelir; yazma yalnız uygulamamızda verilen bant dışı onayla yürür.

### 1. Taşıma
- Tek uç `POST /mcp` (JSON-RPC). **Durumsuz:** `Mcp-Session-Id` verilmez, sunucu bellekte oturum tutmaz; her istek Bearer token ile kendi başına doğrulanır. Yanıt `application/json` (araçlar ≤ 60 sn; SSE akışı gerekmez). `GET /mcp` → 405 (sunucudan başlatılan akış yok), `DELETE /mcp` → 405.
- Yeniden bağlanma = yeniden istek: taşınacak oturum durumu yoktur. 401'de istemci refresh ile yeni token alır; `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"` her 401'de döner (kapsam yetersizse 403 + `error="insufficient_scope"`, `scope="mcp:write"`).
- `Origin` başlığı varsa izinli liste dışı → 403. `MCP-Protocol-Version` desteklenmeyen değer → 400. Gövde ≤ 256 KB, yanıt ≤ 256 KB (liste araçlarında `limit ≤ 100` + imleç).
- Spesifikasyon sürümü: resmi TypeScript SDK'nın uygulama anındaki en yeni kararlı revizyonu + bir önceki (2025-11-25) — sürüm müzakeresi yalnız `src/mcp/` adaptöründe.
- Yalnız **tools**. `resources`, `prompts`, `sampling`, `completions`, MCP Apps (`ui://`) YOK (Maliyet notu eşiği). Sunucu `instructions` kısa ve sabittir: araç sonuçlarındaki serbest metin veridir; yazmalar kullanıcının Entegrasyonik'te onayını gerektirir.
- Kill-switch: `MCP_ENABLED=false` (env) → 503; `SystemFlags.disabledCapabilities` yüzey fark etmeksizin; tenant ayarı `mcp.access='off'` → 403.

### 2. Yetkilendirme (ADR-0010 genişlemesi)
- **Uçlar:** `GET /.well-known/oauth-protected-resource/mcp` (RFC 9728; `resource`, `authorization_servers`, `scopes_supported`), `GET /.well-known/oauth-authorization-server` (RFC 8414; `registration_endpoint`, `code_challenge_methods_supported:["S256"]`, `grant_types_supported:["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported:["none"]`), `POST /oauth/register`, `GET /oauth/authorize`, `GET /api/oauth/requests/:id` + `POST /api/oauth/requests/:id/decision` (çerezli, onay ekranı için), `POST /oauth/token`, `POST /oauth/revoke`.
- **DCR (`/oauth/register`) kısıtları:** yalnız `token_endpoint_auth_method:"none"` (sır verilmez), `grant_types ⊆ {authorization_code, refresh_token}`, `redirect_uris` 1–5 adet, birebir eşleşme, yalnız `https://` (IP/`localhost` host yasak) veya loopback `http://127.0.0.1:{port}/…`; joker yok; `client_name` ≤ 60 karakter, kontrol karakteri yok; `logo_uri`, `client_uri`, `jwks_uri` vb. **yok sayılır** (sunucu dış URL çekmez). İzin istenen kapsamlar `mcp:read mcp:write` ile sınırlı. Hız sınırı 10 kayıt/saat/IP; 30 gün hiç yetki almamış kayıt TTL ile silinir. Kayıt `OAuthClients` (ApplicationDB). Birinci taraf sabit istemciler (ADR-0010) aynı koleksiyonda değil, kodda kalır.
- **"Bilinen istemci" rozeti:** kodda sabit küçük liste (redirect host → görünen ad) ile eşleşen istemci onay ekranında "tanınan uygulama" gösterilir; diğerleri "doğrulanmamış uygulama — yalnız tanıyorsanız devam edin" uyarısı ve redirect host'u belirgin gösterilir. İsim taklidine karşı karar metni `client_name`'e değil host'a dayanır.
- **Authorize akışı:** `GET /oauth/authorize` parametreleri doğrular (`response_type=code`, `code_challenge_method=S256`, `state`, `resource` = MCP kaynak URI'si zorunlu, `redirect_uri` kayıtlıyla birebir, `scope ⊆` kayıtlı). Geçersiz `client_id`/`redirect_uri` → yönlendirme YAPILMAZ, hata sayfası (açık yönlendirici olmaz). Geçerliyse istek Redis'e yazılır (`oauth:req:{id}`, 10 dk) ve kullanıcı `https://app.entegrasyonik.com/oauth/consent?req={id}` sayfasına gönderilir; oturum yoksa giriş sonrası geri döner.
- **Onay ekranı (uygulama SPA'sı, çerezli):** uygulama adı + rozet/uyarı + redirect host, **tenant seçimi** (kullanıcının `active` üyelikleri; bağlantı tek tenant'a bağlanır), istenen kapsamlar (yazma kapsamı kullanıcı tarafından kaldırılabilir; tenant `mcp.access='read'` ise hiç gösterilmez), KVKK bilgilendirmesi (veri kullanıcının seçtiği yapay zekâ sağlayıcısına gider; maskeleme), "İzin ver / Reddet". Karar `POST …/decision` (Origin + CSRF kuralları mevcut çerez hattıyla). Impersonation oturumunda (`imp`) ve platform yöneticisi oturumunda karar 403 `IMPERSONATION_FORBIDDEN`. Tenant MCP'yi açmamışsa (Karar 6) ekran "tenant sahibinin açması gerekir" durumunu gösterir.
- **Kapsamlar:** `mcp:read` → `effect ∈ {read, propose}` araçlar. `mcp:write` → ek olarak `confirm:'confirm'` yazma araçları. `destructive`/`typed` MCP'de v1'de açılmaz. Kapsam bir **tavan**dır: her `tools/list` ve `tools/call`'da güncel `can()` + tenant ayarı + plan ile yeniden kesiştirilir; rol düşerse veya tenant `read`'e çekilirse token yeniden verilmeden etkili olur. Refresh kapsamı genişletemez (yalnız daraltabilir).
- **Token:** access JWT 15 dk, `aud` = MCP kaynak URI'si, claim'ler ADR-0010 madde 4 + `scope` + `fam` (aile/bağlantı kimliği). `ga`, `imp` yok. `/mcp` yalnız bu `aud`'u kabul eder; web çerezi ve `aud:api` token `/mcp`'de geçersiz; `aud:mcp` token `/api`'de geçersiz.
- **Refresh (üçüncü taraf sınıfı):** dönen opak token, yeniden kullanımda aile iptali (ADR-0010) **ancak** aynı `client_id` ile ≤ 10 sn içinde tekrar sunulan token için grace: yeni erişim token'ı + aynı aileden yeni refresh verilir, aile iptal edilmez, denetim `oauth.refresh_grace` (üçüncü taraf istemcilerin eşzamanlı yenilemesini biz serileştiremeyiz). Boşta kalma sınırı **30 gün**, mutlak aile ömrü **90 gün** (dolunca kullanıcı bağlayıcıyı yeniden yetkilendirir).
- **Bağlantı = refresh ailesi.** "Bağlı uygulamalar" listesi aileden okunur (`OAuthRefreshTokens` ailesi alanları: `clientId`, `clientName` anlık görüntüsü, `tid`, `scopes`, `createdAt`, `lastUsedAt`). İptal: kullanıcı kendi bağlantısını; tenant sahibi/admin tenant'taki tüm bağlantıları (`users:manage` izni) iptal eder. İptal edilen aile kimliği süreç-içi LRU'ya (60 sn) ve kalıcı olarak depoya yazılır; `/mcp` her istekte aile durumunu (60 sn LRU arkasında) denetler → iptal ≤ 60 sn içinde etkili. `tv` artışı (parola/rol değişimi, "tüm oturumları kapat") tüm MCP bağlantılarını da kapatır.
- **Yeni bağlantı bildirimi:** aile oluşturulduğunda kullanıcıya mevcut bildirim sistemiyle (ADR-0029) "X uygulaması hesabınıza bağlandı" olayı (uygulama içi + e-posta, tercihe tabi; güvenlik olayı olduğu için kapatılamaz sınıf).

### 3. Araç yüzeyi
- `tools/list` ve `tools/call`, sohbet broker'ının araç türetim fonksiyonunu **aynı** çağırır (BR-2 `operations/agent/tools.ts` ortak bir `deriveTools(actor, surface)`'e çıkarılır; MCP ayrı kopya yazmaz): `mcp.exposed` → kapsam tavanı → `can()` → entitlement (K46 dahil) → `SystemFlags.disabledCapabilities` → LIVE_READONLY (`external && effect≠read` düşer) → bakım → ≤ 30 araç. Sıra kimliğe göre alfabetik (deterministik). Ad `derive/toolName.ts`.
- Şemalar: `inputSchema` zod'dan (strict), `outputSchema` + `structuredContent`; ek olarak kısa bir `text` özeti (outputSchema'yı işlemeyen istemciler için). Annotations `effect`/`external`'dan türetilir, elle yazılmaz.
- Yürütme yalnız `invokeCapability(ctx, id, input, 'mcp')` — `RunOperation` koruma zinciri, `can()`, entitlement, rate, idempotency, output strip, PII maskeleme, `untrustedPaths` aynen. Jenerik RPC'ye MCP'den erişim yok.
- Hatalar: girdi/iş/yetki/kota hataları `isError:true` + eyleme dönük kısa ileti + hata kodu + destek kodu (`requestId`); ham hata, yığın izi, iç ad yok. Kimlik hataları HTTP 401/403 (Karar 1).
- Impersonation: OAuth token'ında `imp` yoktur → MCP'de impersonation imkânsız (test ile sabitlenir).

### 4. Rate limit ve kota
Redis sabit pencere (zorunlu bağımlılık): bağlantı (aile) başına 60 çağrı/dk, tenant başına 300 çağrı/dk, `rateCost` çarpanı; plan günlük `mcpCallsPerDay` (tenant, tüm bağlantılar); yazma eylemleri K46 günlük eylem kotasını **sohbetle ortak** tüketir (CHAT-ENT-1 sayacı; onay anında düşer). Aşım → `isError:true` `RATE_LIMITED`/`QUOTA_EXCEEDED` + `retryAfterSec`. Redis yoksa `/mcp` 503 (kapalı-güvenli; sohbetin süreç-içi yedeği MCP'de kullanılmaz).

### 5. Yazma: bant dışı onay
- `mcp:write` ile listelenen bir yazma aracı çağrılınca yürütülmez: `PendingAction` (BR-2 deposu, Redis) `{surface:'mcp', userId, tid, clientId, fam, capId, version, inputHash, input, preview, status:'pending', expiresAt}` **10 dk** ömürle yazılır; yanıt `isError:false`, `structuredContent: { status:'approval_required', approvalUrl, expiresAt, preview }` + metin "Bu işlem Entegrasyonik'te onayınızı bekliyor: <url>". İstemci URL modlu elicitation bildirmişse aynı URL o kanaldan da sunulur (2025-11-25 `URLElicitationRequired`, 2026-07-28 MRTR karşılığı); **istemcinin form/MRTR "kabul" yanıtı hiçbir durumda onay sayılmaz.**
- Onay sayfası `https://app.entegrasyonik.com/onay/{id}` (çerezli web oturumu): yalnız `PendingAction.userId` ile aynı kullanıcı ve aynı tenant açabilir (başkası 404). Sunucu önizlemesi (ör. "12 sipariş Onaylandı olacak") + istemci adı + süre; "Onayla" → `invokeCapability` (idempotency anahtarı = `pendingActionId`), sonuç `PendingAction`'a yazılır (`executed|failed|rejected`, sonuç özeti; 24 sa tutulur). Onay ucu yazma olduğu için LIVE_READONLY/bakım/entitlement burada da uygulanır.
- Model aynı aracı aynı girdiyle yeniden çağırırsa sunucu `(userId, fam, capId, inputHash)` ile eşleşen kaydı bulur: `pending` → aynı bağlantı (yeni kayıt açılmaz), `executed` → saklanan sonuç (ikinci yürütme yok), `rejected` → "kullanıcı reddetti", süresi dolmuş → yeni kayıt. Ek "durum" aracı gerekmez.
- Uygulama içinde bekleyen MCP onayları "Bağlı uygulamalar" ekranında listelenir; kullanıcıya uygulama içi bildirim düşer (tercihe tabi).
- K47/LIVE_READONLY: dış etkili yazma araçları LIVE_READONLY açıkken **listelenmez**; zorla çağrı ve onay ucu 423 `LIVE_READONLY`. Yerel testler yalnız sahte servislerle.

### 6. Tenant düzeyi izin ve KVKK (K38 ile aynı ilke)
- Tenant `Settings.mcp = { access: 'off'|'read'|'readwrite', transferConsent: { at, by, textVersion } }` (şema `strict:false`, eklemeli, **göç yok**). Varsayılan `off`. Yalnız **tenant sahibi** değiştirir ve açarken sürümlü KVKK aktarım bilgilendirmesini onaylar (metin BYOK metninden ayrı sürüm serisi: `mcp-vN`; alıcı kullanıcının kendi seçtiği yapay zekâ sağlayıcısıdır). Metin sürümü artınca MCP `off` davranır, sahipten yeniden onay istenir. Impersonation'da yasak. Denetim `mcp.settings.changed`.
- Bağlanan her kullanıcı onay ekranında ayrıca bilgilendirilir (Karar 2). PII varsayılan maskeli; `pii:'raw'` MCP'ye açılamaz (P7).
- Konuşma içeriği bizde yoktur (MCP'de sohbet istemcidedir); yalnız denetim kaydı tutulur.

### 7. Denetim ve gözlemlenebilirlik
- `AuditLog.surface` enum'u `mcp` ile genişler (eklemeli; göç yok). Her `tools/call` (okuma dahil), her onay/ret, her OAuth olayı (kayıt, yetki verildi, token ailesi, grace, yeniden kullanım iptali, revoke, `aud`/`resource` reddi): `tid`, `sub`, `clientId`, `fam`, `capabilityId`, `version`, redakte parametre özeti, sonuç (`ok|error|denied|rate_limited|approval_required|expired`), `requestId`. Token, özet, kod loglanmaz.
- Metrikler: `capability_calls{surface="mcp"}`, `mcp_requests_total{method,outcome}`, `oauth_events_total{event}`.

## Gerekçe
- **Maliyet bilinci:** yeni servis/ücret yok; ADR-0010'da zaten kabul edilmiş gömülü sunucu yalnız üç parça büyür (DCR, onay ekranı, kapsam). Harici IdP tek haneli abone ölçeğinde aylık ücret + iki kimlik kaynağı demektir.
- **Tek türetim:** MCP ile sohbetin ayrı araç listeleri olsaydı "ekranda/sohbette/MCP'de farklı yetki" kayması kaçınılmaz olurdu (K20). Aynı `deriveTools` + `invokeCapability` bunu yapısal olarak engeller; P10 testi üç yüzeyi eşitler.
- **Onay güvenliği:** üçüncü taraf istemci ve model bizim güven sınırımızın dışındadır. İnsan onayının kanıtı ancak bizim oturumumuzla, bizim önizlememizle verilebilir. Bant dışı bağlantı her istemcide çalıştığı için "onay kanalı yoksa yazma yok" dallanmasına gerek kalmaz.
- **Durumsuz taşıma:** oturum deposu, yeniden bağlanma ve akış sürdürme kodu yazılmaz; çok replikada ek iş yok; spesifikasyonun gidişatıyla uyumlu.
- **DCR önce, CIMD eşikte:** DCR sunucunun dış URL çekmesini gerektirmez (SSRF yüzeyi yok) ve hedef istemcilerde yaygın; CIMD bugün ek güvenlik kodu getirir, somut ihtiyaç olunca eklenir.
- **Kaynak/prompt yok:** araç sonuçları tüm okuma ihtiyacını karşılıyor; ek MCP ilkeleri yeni saldırı ve bakım yüzeyi olur.

## Maliyet/Ölçek Notu
- Ek servis yok. Ek bağımlılık: `@modelcontextprotocol/sdk` (MIT; `backend/package.json` değişikliği, lisans + `npm audit` kapısı). Ek sır: `JWT_OAUTH_SECRET` (+ `_PREVIOUS`) (ADR-0010). Ek koleksiyon (ApplicationDB): `OAuthClients`, `OAuthAuthCodes`, `OAuthRefreshTokens` — yalnız yeni koleksiyon + indeks (veri göçü yok; CLAUDE.md kural 3 yedek şartı indeks oluşturma için de geçerli, yerelde). Redis: `oauth:req:*`, rate-limit anahtarları, `PendingAction` (mevcut).
- Operasyon: güvenlik kritik yeni kod; prod'da gerçek istemciyle uçtan uca deneme insan işidir (Protokol 12: deploy + sır).
- **Gözden geçirme eşikleri:**
  - Hedef istemcilerden biri DCR'yi desteklemeyi bırakır / yalnız CIMD kabul ederse **veya** `/oauth/register` günlük **> 200** kayıt (kötüye kullanım) → CIMD eklenir (egress guard istisnasıyla) ve DCR sıkılaştırılır.
  - Açık MCP aracı **> 30** (görünür bütçe) → onay ekranında toolset seçimi veya araç arama meta-aracı ADR'si.
  - `tools/call` p95 7 günde **> 2 sn** veya MCP CPU payı **> %30** → MCP ayrı süreç + ES256/JWKS (ADR-0009/0010 eşiği).
  - Aktif MCP bağlantısı (aile) **> 1.000** veya `/oauth/token` sürekli **> 5 istek/sn** → depo/indeks gözden geçirme (ADR-0010).
  - Meşru `oauth.refresh_grace` olayları ailelerin **%5**'inden fazlasında veya grace'e rağmen yeniden kullanım iptali şikâyeti ayda **> 3** → grace penceresi/aile modeli gözden geçirilir.
  - Onay bağlantısıyla açılan `PendingAction`'ların **%50**'den fazlası süre dolumuyla bitiyorsa (7 gün) → 10 dk ömür ve bildirim akışı gözden geçirilir.
  - Kaynak (resource) veya prompt ihtiyacı **≥ 2 tenant** talebiyle doğarsa ya da MCP Apps destekli istemci talebi **≥ 2 ödeyen müşteri** → ayrı karar (statik `ui://`, model üretimli HTML yasak kalır).
  - Çağrıların **%5**'inden fazlası 429 → limit değerleri gözden geçirilir.

## Etki Alanı
- Backend: yeni `src/api/oauth/**` (metadata, register, authorize, requests/decision, token, revoke, istemci politikası), `src/mcp/**` (Streamable HTTP adaptörü, sürüm müzakeresi, hata eşleme, onay bağlantısı sunumu), `api/Security.ts`/`authenticate.ts` (Bearer `aud:mcp` dalı), `operations/agent/tools.ts` → ortak `deriveTools` (BR-2 ile), `PendingActions` (`surface:'mcp'`, `fam`, sonuç saklama), `AuditLog.surface` += `mcp`, `database/application/models/` (3 OAuth koleksiyonu), tenant `Settings.mcp`, `rateLimit` (MCP kovaları), bildirim olayları (ADR-0029), `config/env.ts` (`MCP_ENABLED`, `JWT_OAUTH_SECRET*`, `MCP_RESOURCE_URI`, `APP_PUBLIC_URL`), `.env.example`.
- Frontend (bulut): onay (consent) sayfası, bant dışı onay sayfası, "Bağlı uygulamalar" ekranı, tenant MCP ayarı (sahip) — `docs/cloud-contracts/MCP_UI_CONTRACT.md`.
- Belgeler: `docs/ERROR_CODES.md` (yeni kodlar), `docs/CAPABILITIES.md` (MCP araç listesi), kullanıcıya yönelik bağlantı rehberi (site/yardım, MCP-7).
- ADR-0009/0010/0019 metinleri silinmez; bu ADR'ye atıf notu eklenir (MCP-1 işinde).

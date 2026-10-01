# MCP_LOCAL_SMOKE -- `/mcp` yerel elle doğrulama (MCP-3)

Amaç: yerelde gerçek süreçte `POST /mcp` salt-okuma ucunu uçtan uca görmek (keşif -> DCR -> onay -> token -> `tools/list` -> `tools/call`). Birim/uçtan uca testler zaten sahte servislerle yeşildir (`tests/unit/mcp/`); bu belge insanın yerelde gözle kontrolü içindir. Otomatik betik `scripts/mcp-smoke.cjs` MCP-7'dedir.

## Önkoşullar (HEPSİ gerekir; biri yoksa BAŞLAMAYIN)
1. **Göç `0018-oauth-app.js` (OAuth koleksiyon indeksleri) yerel veritabanına UYGULANMIŞ olmalıdır.** Bu belge göçü çalıştırmaz. Uygulamadan önce CLAUDE.md kural 3: `backup/` altında hem Atlas hem yerel için güncel ve doğrulanmış yedek (bkz. `backup/README.md`). Göç yalnız yeni koleksiyon + indeks ekler (veri göçü yok); yalnızca izinli veritabanında (`entegrasyonikDB`) çalışır. Uygulanmadıysa OAuth koleksiyonları indekssiz oluşur (`autoIndex:false`): TTL/tekillik garantileri YOKTUR, canlı ortama benzemez.
2. Yerel Redis çalışıyor olmalı (`/mcp` Redis'siz 503 verir -- bilinçli; oran sınırı ve kota Redis'tedir).
3. Yerel MongoDB (kullanıcının makinesindeki; `backend/.env` -> `DB_URL`=127.0.0.1). Docker'da ayrı Mongo kurulmaz.
4. Backend yalnızca `npm run start:local` (egress guard) ile çalıştırılır. Gerçek pazaryeri/LLM isteği atılmaz; araçlar yerel veriyi okur (`LIVE_READONLY=true` önerilir).

## `backend/.env` ek satırları (değerleri .env'de kalır, belgeye/commit'e yazılmaz)
```
MCP_ENABLED=true
JWT_OAUTH_SECRET=<en az 32 bayt rastgele; JWT_SECRET'ten FARKLI>
PUBLIC_API_URL=http://127.0.0.1:5001          # MCP kaynak URI'si = ${PUBLIC_API_URL}/mcp (token aud'u)
PUBLIC_APP_URL=http://localhost:3000          # onay sayfası tabanı (önyüz dev sunucusu)
# MCP_ALLOWED_ORIGINS=                         # tarayıcıdan denerseniz Origin'i buraya ekleyin (Origin başlığı yoksa denetim yok)
LIVE_READONLY=true
```
Not: `MCP_ENABLED=true` iken `JWT_OAUTH_SECRET`, `PUBLIC_API_URL`, `PUBLIC_APP_URL` yoksa süreç BAŞLAMAZ (fail-fast).

## Adımlar
Aşağıdaki `$API` = `http://127.0.0.1:5001`.

1. **Başlat:** `cd backend && npm run start:local`. `GET $API/health` 200; `GET $API/.well-known/oauth-protected-resource/mcp` -> `resource` = `$API/mcp`.
2. **Yüzey kapalı kontrolü (isteğe bağlı):** `MCP_ENABLED=false` ile `POST $API/mcp` -> 404.
3. **Kimliksiz keşif:** `curl -i -X POST $API/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'` -> **401** ve `WWW-Authenticate: Bearer resource_metadata="$API/.well-known/oauth-protected-resource/mcp"`.
4. **Tenant sahibi MCP'yi açar** (varsayılan KAPALI; yalnız sahip). Web uygulamasında sahip olarak giriş yapın (çerez) ve Ayarlar > Yapay zekâ bağlantısı'ndan "Salt okuma"yı seçip aktarım metnini onaylayın; ya da çerezle: `PUT $API/api/mcp/settings` `{"access":"read","acceptTextVersion":"mcp-v1"}`. Kapalıyken 7. adım `403 MCP_TENANT_OFF` verir.
5. **İstemci kaydı (DCR) + PKCE:**
   ```
   curl -s -X POST $API/oauth/register -H 'content-type: application/json' \
     -d '{"redirect_uris":["http://127.0.0.1:8765/cb"],"client_name":"Smoke","token_endpoint_auth_method":"none","scope":"mcp:read"}'
   node -e "const c=require('crypto');const v=c.randomBytes(48).toString('base64url');console.log(v, c.createHash('sha256').update(v).digest('base64url'))"
   ```
   `client_id`, `verifier`, `challenge` değerlerini not edin. Tarayıcıda `$API/oauth/authorize?response_type=code&client_id=<id>&redirect_uri=http://127.0.0.1:8765/cb&code_challenge=<challenge>&code_challenge_method=S256&state=x&resource=$API/mcp&scope=mcp:read` açın -> `PUBLIC_APP_URL/oauth/consent?req=...` onay sayfası (önyüz MCP-6/7'de bağlandıysa); onay ekranı henüz yoksa çerezli kullanıcıyla `GET $API/api/oauth/requests/<req>` ve `POST $API/api/oauth/requests/<req>/decision` `{"approve":true,"tid":<mağaza no>}` -> `redirectTo` içindeki `code`.
6. **Token:** `curl -s -X POST $API/oauth/token -d grant_type=authorization_code -d client_id=<id> -d code=<code> -d code_verifier=<verifier> -d redirect_uri=http://127.0.0.1:8765/cb` -> `access_token` (15 dk, `aud` = `$API/mcp`).
7. **Protokol:**
   ```
   H='-H content-type:application/json -H "authorization: Bearer <access_token>"'
   initialize : {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}
   tools/list : {"jsonrpc":"2.0","id":2,"method":"tools/list"}
   tools/call : {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"orders_list","arguments":{"limit":3}}}
   ```
   Beklenen: `initialize` -> `protocolVersion` `2025-11-25`, yalnız `tools` yeteneği, `Mcp-Session-Id` başlığı YOK. `tools/list` -> yalnız okuma araçları (rol ve plana göre; `orders_approve` ASLA yok). `tools/call` -> `structuredContent` + `content[0].text` (`"untrusted":true` zarfı); müşteri adı maskeli (`A*** Y***`), e-posta/telefon yok.
8. **Reddedilmesi gerekenler:** `MCP-Protocol-Version: 2024-01-01` -> 400; `Origin: https://evil.example` -> 403; `GET $API/mcp` -> 405; >256 KB gövde -> 413; `tools/call` `{"name":"orders_approve",...}` -> `isError:true` `INSUFFICIENT_SCOPE`, hiçbir sipariş değişmez.
9. **İptal:** Ayarlar > Bağlı uygulamalar'dan bağlantıyı kesin (ya da `DELETE $API/api/mcp/connections/<fam>`) -> aynı token ile `/mcp` en geç 60 sn içinde 401 `invalid_token`.
10. **Tenant ayarı:** sahip erişimi `off` yapınca token geçerli olsa bile her çağrı 403 `MCP_TENANT_OFF` (anında; 60 sn ayar önbelleği yazan süreçte geçersiz kılınır).

## Gözlem
- Denetim: `AuditLogs` koleksiyonunda `surface:'mcp'`, `event:'mcp.tool_call'` (okuma dahil), `meta.{clientId,fam,capabilityId,outcome,params(alan adları)}`; parametre DEĞERİ ve token yok.
- Metrikler: `mcp_requests_total{method,outcome}`, `agent_tool_calls_total{surface="mcp"}`.
- Oran sınırı: bağlantı başına 60/dk, tenant başına 300/dk (61. `tools/call` `isError` `RATE_LIMITED` + `retryAfterSec`; diğer metotlar HTTP 429); plan `mcpCallsPerDay` (yalnız `ENTITLEMENT_GUARD_ENABLED=true` iken).

## Sınırlar (bu adımda)
- Yazma araçları yok (MCP-4: bant dışı onay). Gerçek istemciyle bağlanma ve prod deploy insan adımıdır (MCP-8).
- Sürüm desteği: `2025-11-25`, `2025-06-18`, `2025-03-26` (`backend/src/mcp/versions.ts`); `2026-07-28` resmi SDK kararlı sürümünde olmadığı için desteklenmez.

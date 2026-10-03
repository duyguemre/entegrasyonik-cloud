# AGENT_BROKER_PLAN — Sohbet aracısı (broker) backend iş paketleri

Karar: `docs/adr/0034-ortak-sohbet-arayuzu.md` (ADR-0034). Önyüz sözleşmesi: `docs/cloud-contracts/CHAT_UI_CONTRACT.md` (protokol `chat/v1`).
Kullanıcı kararları: K21, K36, K37, K20, K03, K06 (`docs/adr/USER_DECISIONS.md`). BACKLOG: "Ortak sohbet arayüzü (CHAT)".

**K37 özeti:** Entegrasyonik LLM sağlamaz. Uygulama içi sohbet = kullanıcının kendi sağlayıcı anahtarı (BYOK; ilk Anthropic, OpenAI, Google; model seçimi kullanıcıda). Kendi AI uygulamasını (tüketici aboneliği) kullanmak isteyen uzak MCP sunucusuna (OAuth) bağlanır — aynı yetenek kaydı, aynı onay/denetim. Sahte (scripted) sağlayıcı geliştirme/test içindir.

**Genel kurallar (her paket):**
- Yerel iş (backend). Gerçek LLM, gerçek ağ, gerçek pazaryeri yok: testler `ScriptedLlmProvider` + sahte servisler + mevcut karakterizasyon yardımcılarıyla.
- DB göçü yok. Geçici durum Redis'te (zorunlu bağımlılık zaten). Yeni Mongo koleksiyonu açılmaz.
- Yeni koruma listesi yazılmaz: yetki, LIVE_READONLY, impersonation, idempotency, denetim **mevcut `RunOperation` zincirinden** gelir (ADR-0034 Karar 4.3).
- Katman yerleşimi (ADR-0024): `src/operations/agent/**` (döngü, araç türetme, sunum, onay, çalışma belleği, protokol kopyası), `src/platform/llm/**` (sağlayıcı portu ve bağdaştırıcılar), `src/api/http/agentRoutes.ts` (+ `api/admin/` eşi), `src/capabilities/invoke.ts` + `capabilities/derive/toolName.ts`.
- Yeni hata kodları `platform/core/errors/codes.ts` + `docs/ERROR_CODES.md` aynı işte: `TURN_IN_PROGRESS`, `TURN_DUPLICATE`, `CONFIRM_EXPIRED`, `CAPABILITY_DISABLED`, `IMPERSONATION_FORBIDDEN`, `SETUP_REQUIRED`, `LLM_KEY_INVALID`, `LLM_QUOTA`, `LLM_RATE_LIMITED`, `LLM_MODEL_UNAVAILABLE`, `LLM_UNAVAILABLE` (varsa mevcut karşılığı kullanılır).
- Başka ajanların alanı: `src/operations/notifications/**`, `src/api/admin/**`, `backend/package*.json` — BR-4 `api/admin`'e dokunur, o iş bitince sıralanır.

## MCP ile sıralama (net)

| Paket | MCP fazından önce yapılabilir mi? | Not |
|---|---|---|
| BR-1 protokol + sahte LLM + SSE uç | **Evet** | MCP ile hiçbir ortak parça yok. |
| BR-2 yetenek→araç türetimi + `can()` + onay akışı | **Evet** | `invokeCapability`, araç adı türetimi ve `PendingAction` burada yazılır; MCP adaptörü (ADR-0019 Aşama C/D) bunları **aynen** kullanır. İlk `mcp.exposed` işaretleri (core 5) konur; `/mcp` ucu açılmadığı için K06 kapısını delmez. |
| BR-3 denetim/idempotency/LIVE_READONLY/bakım/impersonation | **Evet** | Mevcut kancalar yeniden kullanılır. |
| BR-4 backoffice broker | **Evet** | ADR-0026 2-BE bitti; `api/admin` üzerindeki paralel iş bittikten sonra. |
| BR-5 BYOK sağlayıcılar + kurulum | **Evet** | Uzak MCP'den bağımsız. Gerçek anahtarla deneme yalnız insan tarafından yerelde; KVKK nihai metni (H2) canlıya çıkıştan önce. |
| MCP ile **birlikte** yapılacaklar | — | `/mcp` adaptörü (ADR-0019 C), P10 yüzey eşitliği testinin sohbet yüzeyini de kapsaması (UI ↔ sohbet ↔ MCP aynı sonuç), MCP onay kanalı (MRTR) ile `PendingAction` paylaşımı, `capability_calls{surface}` etiketine `mcp`. |
| Masaüstü yerel araçlar | DESK-01 sonrası | CHAT-DESK (DESK-04): protokole eklemeli `executor:'client'` onay kartı + `client-result` girdisi. |

---

## BR-1 — Protokol şeması + sahte LLM + SSE uç
**Amaç:** önyüz `sse` taşıyıcısı gerçek backend'e bağlanabilsin; araç yok, yalnız metin akışı.
- `src/operations/agent/protocol/v1.ts`: `frontend/packages/chat/src/protocol/v1.ts`'nin birebir kopyası (ilk yorum bloğu hariç). Kopyalama betiği `backend/scripts/sync-chat-protocol.cjs` (yerel). Test `tests/static/chatProtocol.static.test.ts`: iki dosya eşit; frontend dosyası yoksa kırmızı ("CHAT-FE-1 önce").
- `src/platform/llm/LlmProvider.ts`: port — `stream({ system, messages, tools, maxTokens, signal }) → AsyncIterable<LlmEvent>`; `LlmEvent = text-delta | tool-call{id,name,input} | usage{in,out} | done{reason}`.
- `src/platform/llm/ScriptedLlmProvider.ts`: kural tablosu (desen → adım listesi). Varsayılan senaryolar CHAT_UI_CONTRACT §6 ile aynı adlar (`orders-table`, `approve-orders`, `long-stream`, `denied`, `fallback`…); böylece önyüz mock'u ile backend sahte LLM'i aynı davranışı üretir.
- `config/env.ts`: `AGENT_LLM_SCRIPTED` (`1` → tüm tenant'lar için sahte sağlayıcı; yalnız yerel/test; `NODE_ENV=production`'da `1` ise süreç başlamaz), `.env.example` satırı (değer yok).
- `src/api/http/agentRoutes.ts` (`/api/agent`):
  - `GET /info` → `AgentInfo` (`agent.enabled` kapalı → `DISABLED`; açık ama tenant anahtarı yok ve `AGENT_LLM_SCRIPTED`≠1 → `SETUP_REQUIRED`; aksi `enabled:true`).
  - `POST /turns` → SSE. Başlıklar ADR-0029 Karar 6 ile aynı (`text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, sıkıştırma kapalı); 15 sn nabız; istek gövdesi `TurnRequestSchema` ile doğrulanır; `req.on('close')` → `AbortController` → sağlayıcı iptali.
  - `DELETE /conversations/:id`.
  - Yetenek kaydı girdileri `agent.turn`, `agent.info`, `agent.reset` (`scope:'user'`, izin `app:use`, `mcp: notExposed ui_plumbing`), bağ olmayan HTTP rota deseni `notifications.stream` ile aynı.
- Çalışma belleği `src/operations/agent/ConversationStore.ts`: Redis anahtarı `agent:conv:app:{tid}:{userId}:{convId}`, 60 dk kayan TTL, ≤ 40 mesaj; Redis yoksa tek turluk (bellek) çalışır ve `info` uyarı taşımaz (kalıcılık zaten yok).
- Sınırlar: girdi 4.000 karakter; kullanıcı başına eşzamanlı 1 tur (Redis `SET NX` kilidi, TTL 90 sn) → 409 `TURN_IN_PROGRESS`; aynı `clientTurnId` 10 dk içinde → 409 `TURN_DUPLICATE`; mevcut global rate limiter + kullanıcı 10 tur/dk.
- **Kabul:** supertest ile SSE akışı (olay sırası §4.1, şema doğrulaması, abort, nabız, 401/409/400), iki tenant'ın çalışma belleği anahtarı ayrışır, `agent.enabled=false` → `DISABLED`, anahtarsız tenant → `SETUP_REQUIRED`. `tsc` 0, mandallar yeşil.

## BR-2 — Yetenek → araç türetimi + `can()` + onay akışı
**Amaç:** sohbet yetenek kaydındaki araçları okuyup yazabilsin; yazma yalnız onayla.
- `src/capabilities/derive/toolName.ts`: `orders.list` → `orders_list` (ADR-0019 §4.3 regex); MCP manifest üretimi de bunu kullanacak.
- `src/capabilities/invoke.ts`: `invokeCapability(ctx, id, input, surface)` — ADR-0019 §2 sırası; yürütme `bindings` üzerinden mevcut `RunOperation` yolu (koruma zinciri aynen). `surface ∈ 'chat' | 'backoffice_chat'` (ileride `'mcp'`). Çıktı `output` zod ile `strip`; `pii` maskeleme; `untrustedPaths` işaretleme; yanıt ≤ 256 KB.
- `src/operations/agent/tools.ts`: tur başına araç listesi — `mcp.exposed` → `can(actor, cap)` → entitlement → `SystemFlags.disabledCapabilities` → LIVE_READONLY/bakım/impersonation süzgeci (ayrıntı BR-3) → ≤ 30 araç (sayfa bağlamı toolset'i + `core`). JSON Schema zod'dan (`zod-to-json-schema` gerekmez: zod 3.25'in `zod/v4` `toJSONSchema`'sı; bağımlılık eklenmez, olmazsa küçük yerel çevirici).
- İlk açılan yetenekler (`capabilities/domains/*`): ADR-0019 `core` 5 — `integrations.health`, `reports.sales.summary`, `orders.list`, `stock.low.list`, `products.search`; `llm` açıklama/örnek + strict girdi + çıktı şeması + `pii:'masked'`. Yoksa önce kayıtta tanımlanır (P7 kuralları). Parite testi (P3/P7) yeşil kalır.
- İlk yazma yeteneği (onay akışını kanıtlamak için tek): `orders.approve` (ADR-0019 §7-D önerisi) `mcp.exposed.confirm:'confirm'`. LIVE_READONLY'de dış yazma olduğu için bloklanır — test bununla yapılır.
- Sunum `src/operations/agent/present/*`: `present` → parça (`table`, `kpi`, `status`→table, `entity`→entity-link, `text`); yetenek başına kolon/etiket eşlemesi `present/specs.ts` (yalnız exposed yetenekler); eşleme yoksa çıktı şemasından genel kolonlar. `more` belirteci: Redis `agent:more:{token}` → `{capId, input, cursor, userId, tid}`, 10 dk.
- Onay `src/operations/agent/PendingActions.ts`: Redis `agent:pa:{id}` `{userId, tid, surface, capId, version, inputHash, input, expiresAt}`, `EX 300`; `POST /api/agent/confirm` → `GETDEL` + eşleşme denetimi → `approve`: `invokeCapability` (idempotency anahtarı = `pendingActionId`) → `part(confirm done/failed)` + deterministik sonuç metni (yetenek `summary` şablonu); `reject`: yürütme yok. Onaydan sonra LLM çağrılmaz. `typed` kipte ifade eşleşmesi sunucuda.
- Döngü `src/operations/agent/runTurn.ts`: sağlayıcı olayları → protokol olayları; araç çağrısı → `progress` parçası → `invokeCapability` (okuma) ya da `PendingAction` + `confirm` parçası (yazma, tur `awaiting-confirm` ile biter); tur başına ≤ 5 araç, ≤ 6 gidiş-dönüş, 60 sn; araç sonucu modele `untrusted` sarmalıyla.
- **Kabul:** her exposed yetenek için RBAC reddi (member/admin/owner matrisi `can()`), **2 tenant izolasyonu** (A'nın oturumuyla B'nin verisi dönmez; anahtar/`more`/`PendingAction` başka kullanıcıyla kullanılamaz), onaysız yürütme imkânsız (doğrudan `invokeCapability` yazma yolu yalnız onay ucundan), tekrar gönderimde tek uygulama, süresi dolmuş/başkasının `PendingAction`'ı reddedilir, tablo sayılarının modelden değil araç sonucundan geldiği (sahte LLM yanlış sayı yazsa da tablo doğru).

## BR-3 — Denetim, idempotency, LIVE_READONLY, bakım, impersonation
- Denetim: `AuditLog.surface` enum'una `chat`, `backoffice_chat` (geriye uyumlu; mevcut kayıtlar değişmez, göç yok). Her araç çağrısı (okuma dahil), her onay/ret: `capabilityId`, `version`, redakte parametre özeti, sonuç (`ok|error|denied|rate_limited|expired`), `corrId`, `turnId`, `imp`. Sohbet metni yazılmaz.
- Idempotency: `external && effect≠read` yazmalar mevcut `withIdempotency` deposundan `pendingActionId` anahtarıyla; `IDEMPOTENCY_IN_PROGRESS` / `UNKNOWN_OUTCOME` onay kartında "sonuç belirsiz, ekrandan kontrol edin" + `openIn`.
- LIVE_READONLY: araç listesinden `external && effect≠read` düşer; yürütmede `liveReadonlyRpcGuard` 423 → `error` parçası `LIVE_READONLY`. `info.readOnly = true`.
- Bakım: `maintenanceGuard` `/api/agent/*` için muaf; aynı `isMaintenanceBlocked` mantığı yetenek düzeyinde `invokeCapability`'de (read/propose serbest). Onay ucunda yazma → 503 `MAINTENANCE` parçası.
- Impersonation: araç listesi yalnız `effect:'read'`; yürütmede `impersonationDenial` aynen; `info.readOnly = true`; çalışma belleği anahtarı yöneticinin `sub`'ı ile ayrışır.
- Kill-switch: `SystemFlags.disabledCapabilities` → `CAPABILITY_DISABLED`; `agent.enabled=false` → `info.enabled=false`, açık turlar kapanır.
- Metrikler (ADR-0017 `MetricsRegistry`): `agent_turns_total{surface,outcome}`, `agent_turn_ms` histogram, `agent_tool_calls_total{surface,capabilityId,outcome}`, `agent_tokens_total{surface,provider,kind}`.
- **Kabul:** her koruma için sohbet yolundan test (UI yolunun mevcut testlerinin sohbet eşleri); denetim kaydı alan testi; LIVE_READONLY açıkken yazma aracı listede yok ve zorla çağrı 423.

## BR-4 — Backoffice broker (izole)
- `/admin-api/agent/*` aynı rota fabrikası, `EK_ADMIN` + TOTP kimliği, backoffice CORS/Origin kuralları.
- `capabilities/types.ts`: isteğe bağlı `adminChat?: { exposed: { present: Presentation; llm: Llm } }`; değişmez: yalnız `scope:'platform'` taşıyabilir (kayıt değişmezi + test). İlk açılanlar salt-okunur: motor/kuyruk sağlığı, genel bakış sayaçları, log arama, tenant meta listesi (tenant iş verisi döndürmeyenler — ADR-0026 Karar 6).
- v1'de backoffice sohbetinde **yazma aracı yok** (`effect≠read` adminChat'e açılamaz; test).
- Çalışma belleği anahtarı `agent:conv:bo:{adminId}:{convId}`; müşteri sohbetiyle anahtar, rota, çerez paylaşılmaz. Denetim `surface:'backoffice_chat'`.
- LLM anahtarı: **platform ayarı** (`agent.platformProvider`, `enc:v1`), `/admin-api/agent/provider` uçlarıyla (step-up + gerekçe; ADR-0026 Karar 4.6). Tenant anahtarı backoffice'te asla okunmaz; platform anahtarı tenant sohbetinde asla okunmaz (test).
- **Kabul:** müşteri çereziyle `/admin-api/agent` 401; backoffice çereziyle `/api/agent` 401; backoffice araç listesinde tenant kapsamlı yetenek yok; ADR-0026 step-up gerektiren hiçbir yetenek listede yok.

## BR-5 — BYOK sağlayıcı bağdaştırıcıları + kurulum uçları (K37)
**İnsan kararı gerektirmez** (K37/K38: BYOK, tenant düzeyi anahtar, Anthropic + OpenAI + Google, kayıt saklanmaz). Açık kalan: H2 KVKK nihai metni (geçici çözüm aşağıda, canlı öncesi hukuki göz), H4 backoffice platform anahtarı.
- `src/platform/llm/providers/{anthropic,openai,google}.ts`: düz `fetch` + SSE ayrıştırma (SDK eklenmez); araç çağırma zorunlu; `AbortSignal`, bağlantı/ilk bayt/toplam zaman aşımı; kullanım (girdi/çıktı token) olayı. Model izinli listesi bağdaştırıcıda sabit (sağlayıcı başına 2–4 model, biri `recommended`); temel adres kodda sabit, tenant yazamaz (K7/SSRF).
- Hata sınıflandırıcı `src/platform/llm/classifyProviderError.ts` (saf, birim testli): HTTP durum + sağlayıcı hata tipi → `LLM_KEY_INVALID` (401/403, geçersiz/iptal anahtar) · `LLM_QUOTA` (kredi/fatura/kota bitti) · `LLM_RATE_LIMITED` (429; `retry-after` → `retryAfterSec`) · `LLM_MODEL_UNAVAILABLE` (404/model erişimi yok) · `LLM_UNAVAILABLE` (5xx, zaman aşımı, ağ). Ham gövde loglanmaz, istemciye gitmez; logda yalnız sağlayıcı, durum kodu, sınıf, `corrId`.
- Anahtar deposu `src/operations/agent/providerSettings.ts`: tenant DB `Settings.agent = { provider, model, apiKey: 'enc:v1:…', transferConsent: { at, by, textVersion }, lastTest }` (şema `strict:false`, eklemeli; **göç yok**). Mevcut `FieldCrypto` / `FIELD_ENCRYPTION_KEYS`; `responseSanitizer` `apiKey` → `'sensitive'`. Önbellek: süreç içi LRU 60 sn (çözülmüş anahtar bellekte, loglanmaz).
- Uçlar (`/api/agent/provider`, yetenekler `agent.provider.get|save|test|remove`; izin `settings:read` / `settings:manage`; `mcp: notExposed credential`; `agent.provider.test` `external:true`):
  - `GET` → `ProviderStatus` (katalog, maskeli durum, kullanım, onay metni sürümü).
  - `PUT` → girdi `ProviderSaveRequest` (sahip/admin); `consent` alanı yalnız sahipten kabul edilir (admin gönderirse 403); kaydetmeden önce **test** (başarısızsa kaydetmez, `ProviderTestResult` 422); başarıda denetim `agent.provider.saved` (anahtar yok, yalnız sağlayıcı/model).
  - `POST /test` → sağlayıcının salt-okuma model listeleme ucu (üretim/çıkarım çağrısı yok); `apiKey` verilmezse kayıtlı anahtar; kullanıcı başına 5/dk.
  - `DELETE` → anahtarı siler, denetim.
  - `POST /consent` (`agent.provider.consent`, **yalnız tenant sahibi**; impersonation'da yasak) → `transferConsent {at, by, textVersion}` yazar/siler; denetim `agent.transfer_consent.given|revoked`. `info`: anahtar var ama geçerli sürüm için onay yok → `SETUP_REQUIRED` + `consentRequired:true`; tur isteği 403 `SETUP_REQUIRED`.
  - Konuşma kaydı saklanmaz (K38): Redis çalışma belleği dışında hiçbir yere sohbet metni yazılmaz (test: Mongo'ya `agent` kaynaklı yazım yalnız ayar/denetim).
  - `api/impersonationPolicy.ts` `IMP_DENIED_CREDENTIAL_RPCS`'e save/test/remove eklenir (destek oturumu tenant anahtarını göremez/değiştiremez).
- Ağ: `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com` → `ALLOWED_OUTBOUND_HOSTS` (K7 tek listesi) + egress guard + `liveReadonlyPolicy.ts` (bu üç host için POST izinli; gerekçe: çıkarım entegrasyona yazma değildir). Test: başka host reddedilir.
- Kullanım sayacı (yalnız bilgi): Redis `agent:usage:{tid}:{yyyymmdd}` (istek, girdi token, çıktı token; 40 gün TTL) + ay toplamı hesaplanarak `ProviderStatus.usage`; metrik `agent_tokens_total{surface,provider,kind}`. Kota/kesme yok.
- Backoffice platform anahtarı aynı modülün platform kipi (BR-4 ile).
- KVKK (K38 geçici çözümü): `consentText` sürümlü taslak bilgilendirme; sohbet yalnız tenant sahibi onayıyla açılır; H2 nihai metin gelince sürüm artar ve sahiplerden yeniden onay istenir. Gönderilen veri: yetenek sonuçları (PII maskeli), kullanıcı mesajları; sistem prompt'u.
- **Kabul:** sahte HTTP sunucusuyla her sağlayıcı için sözleşme testi (akış, araç çağrısı, kullanım, iptal, her hata sınıfı); anahtar hiçbir yanıtta/logda yok (sızıntı testi `sensitive`); tenant A anahtarı tenant B turunda kullanılmaz; impersonation'da kurulum ve onay uçları reddedilir; sahip onayı olmadan tur 403; admin onay veremez; gerçek anahtarlı deneme yalnız insan tarafından yerelde.

---

## Tahmini sıra ve süre
BR-1 (~1,5 gün) → BR-2 (~2 gün) → BR-3 (~1 gün) → BR-4 (~1 gün) ‖ CHAT-FE-4 uçtan uca (BR-2 sonrası). BR-5 (~2–3 gün) BR-1 sonrası BR-2 ile paralel olabilir.

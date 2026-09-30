# 0034 — Ortak sohbet arayüzü (chat-as-UI): web uygulaması + backoffice + Electron masaüstü; backend aracı (broker) ve tek yetenek kaydı

## Durum
Önerildi (2026-10-01). Kod yok. Uygulama sözleşmeleri: `docs/cloud-contracts/CHAT_UI_CONTRACT.md` (önyüz, bulut) ve `docs/AGENT_BROKER_PLAN.md` (backend, yerel). İş kalemleri: `BACKLOG.md` "Ortak sohbet arayüzü (CHAT)". DB göçü yok: geçici durum Redis'te (Karar 5); BYOK ayarı tenant `Settings` belgesine eklemeli alt nesne (`strict:false`), `AuditLog.surface` enum'u eklemeli genişler.

**Diğer ADR'lerle ilişki:**
- **ADR-0009 "Model çağrısının yeri"ni değiştirir (web, backoffice ve K36 ile masaüstü).** ADR-0009 LLM döngüsünü yalnız yerel uygulamaya koyuyor ve tarayıcıda sohbeti reddediyordu (gerekçe: anahtar tarayıcıda saklanamaz, LLM maliyeti bize geçmesin). Bu ADR tarayıcıya anahtar koymaz: döngü **backend'de** çalışır. ADR-0009'un "LLM maliyeti bize ait olmasın, kullanıcı kendi modelini getirir" ilkesi **K37 ile korunur**: uygulama içi sohbet kullanıcının kendi sağlayıcı anahtarıyla (BYOK) çalışır; Entegrasyonik LLM aboneliği satmaz/karşılamaz. Değişen tek şey anahtarın yeridir: ADR-0009 §5 "anahtar backend'e hiç gönderilmez" yerine anahtar tenant ayarında `enc:v1` (AES-256-GCM, `FIELD_ENCRYPTION_KEYS`) şifreli saklanır (Karar 9). Geliştirme ve testler sahte (scripted) sağlayıcıyla yapılır. ADR-0009'un güvenlik, allowlist, audit, GenUI kapalı katalog ve "yazma = modelin erişemediği kanaldan insan onayı" kuralları aynen geçerlidir.
- **ADR-0019 §5'i genişletir, değiştirmez.** Sohbet yeni bir yetenek kaydı açmaz. Sohbet araçları `mcp.exposed` yeteneklerden türetilir; `mcp.exposed` artık "LLM yüzeylerine (MCP + sohbet) açık" anlamına gelir. Alan adı değişmez. ADR-0019 §5.3'teki `PendingAction` bu ADR'de Redis'e konur (ApplicationDB koleksiyonu yerine; Karar 5). `invokeCapability` (ADR-0019 §2) bu ADR'nin BR-2 paketiyle yazılır ve MCP adaptörü aynı fonksiyonu kullanır.
- **ADR-0019 §5.7 "sohbet geçmişi yalnızca yerelde"** K36 ile konusuz kaldı (ayrı yerel uygulama yok). Tüm yüzeylerde kalıcı geçmiş yoktur; yalnız 60 dk ömürlü sunucu çalışma belleği vardır (Karar 5). Konuşma kaydı saklanmaz (K38); kalıcı geçmiş ileride ayrı karar + KVKK saklama süresiyle.
- **ADR-0026:** sohbet önyüzü `@entegrasyonik/ui` token ve bileşenlerini kullanır ama o pakete **girmez**; ayrı paket `frontend/packages/chat` açılır (Karar 2). Backoffice sohbeti `/admin-api` oturumuyla çalışır ve Karar 6 ("backoffice uçları tenant iş verisi döndürmez") aynen geçerlidir.
- **ADR-0028:** her araç çağrısında tek karar noktası `can(actor, capability)`. **ADR-0029:** SSE başlık/nabız kuralları kullanılır; `RealtimeBus` kullanılmaz (Alternatif B).
- **K36 (2026-10-01) ve ADR-0007/0009 (yerel uygulama):** ayrı Tauri uygulaması iptal edildi. Masaüstü = mevcut Electron kabuğu, aynı web derlemesi, aynı `@entegrasyonik/chat` paketi ve **web ile aynı taşıyıcı** (broker SSE). Electron yalnız dar bir yerel köprü açar; sohbette bunlar istemci tarafı araçlardır (Karar 8, BACKLOG DESK-04). Dış yapay zekâ istemcileri için MCP = uzak MCP sunucusu (OAuth, ADR-0009/0010); yerel MCP ve masaüstünde yerel LLM döngüsü yoktur. ADR-0019'daki Tauri/yerel döngü varsayımları bu yönde işaretlendi (ADR-0019 "K36 notu").
- **docs/LIVE_READONLY.md, bakım modu (BACKOFFICE_PLAN B11), impersonation politikası (`api/impersonationPolicy.ts`)** sohbet yolunda da aynen uygulanır; sohbet için ayrı kural listesi yazılmaz (Karar 4).

**Refactor/yeniden yazım:** yok. Yeni modül eklenir. Mevcut `RunOperation` koruma zinciri yeniden kullanılır.

## Bağlam
- **Kullanıcı kararı K21** (`docs/adr/USER_DECISIONS.md`, 2026-10-01): yerel uygulamada kararlaştırılan chat-as-UI (K20, ADR-0019) web uygulamasında ve backoffice'te de olsun. Önyüz **bir kez** yazılsın; web, backoffice ve yerel uygulama aynı bileşenleri kullansın. MCP henüz hazır değil; bu çalışmayı engellememeli.
- **Kullanıcı kararı K36** (2026-10-01): ayrı yerel uygulama yok; masaüstü = Electron kabuğunda aynı web uygulaması + dar yerel köprü (izinli klasörler, belge okuma, klasör izleme, yazıcı). Dış AI istemcileri için yalnız uzak MCP.
- **Kullanıcı kararı K37** (2026-10-01): sohbet kullanıcının kendi seçtiği model ve aboneliğiyle çalışır. İki mod, aynı yetki + onay kartı + denetim: (a) uygulama içi sohbet = BYOK (kendi API anahtarı, kendi sağlayıcı/model seçimi; anahtar yoksa kurulum ekranı; maliyet kullanıcının sağlayıcı hesabında), (b) tüketici AI aboneliği = kullanıcının kendi AI uygulaması + uzak MCP sunucusu (OAuth). Tüketici abonelikleri üçüncü taraf API'ye genelde açılmadığı için (b) onların yoludur.
- **Kullanıcı kararı K38** (2026-10-01): BYOK anahtarı **tenant düzeyinde** (sahip/admin girer, tüm üyeler kullanır; kullanıcı düzeyi anahtar yok); ilk sağlayıcılar Anthropic + OpenAI + Google; konuşma kaydı saklanmaz. Açık kalan tek konu KVKK yurt dışı aktarım metni; geçici çözüm: sohbet ayarında açık bilgilendirme + **tenant sahibinin onayı**, onay kaydı denetime.
- **K17:** ürün adı tek sabitten gelir, varsayılan **Otopilot**; "Asistan" kullanılmaz. **K03:** overengineering yok. **K06:** MCP fazı kullanıcı önyüz review'u bitene kadar başlamaz; gerçek tenant bağlantılarıyla yalnız okuma.
- **Bugünkü durum (2026-10-01, `faz4-integration`):**
  - Yetenek kaydı var (`backend/src/capabilities/`, ~149 yetenek). `mcp.exposed` işaretli yetenek sayısı **0**. `invokeCapability` ve `src/mcp/` **yok**.
  - Yetenek kaydını okuyan koruma kancaları zaten `RunOperation` yolunda: `liveReadonlyRpcGuard.ts`, `impersonationPolicy.ts`, `idempotencyGuard.ts` (`external && effect≠read`), `maintenanceGuard.ts` (HTTP ara katmanı; `read`/`propose` serbest).
  - SSE altyapısı: `api/http/notificationStream.ts` + `platform/runtime/realtime/{streamHub,RealtimeBus}.ts` (ADR-0029; "zil" modeli, içerik taşımaz).
  - `AuditLogs.surface` enum'u `['app','backoffice']`.
  - Önyüz: `frontend/packages/ui` (`@entegrasyonik/ui`) + `frontend/backoffice`; komut paleti `EkCommandPalette.vue`, kısayol kataloğu `navigation/shortcutCatalog.ts`, ekran kaydı `navigation/screens.ts`. Frontend'de `zod` bağımlılığı yok (backend `zod@3.25.76`).
  - Bulut kopyası yalnız `site/` ve `frontend/` yazar (CLAUDE.md kural 7); `ui` paketinde paralel bulut işleri var.
- **Sorun:** üç yüzey (web, backoffice, yerel) aynı sohbet deneyimini istiyor ama üç farklı kimlik/taşıma yolu var (çerez `/api`, çerez `/admin-api`, OAuth + `/mcp`). Önyüz taşımaya bağlı yazılırsa üç kez yazılır; araçlar yüzey başına tanımlanırsa ADR-0019'un tek-kaynak kuralı delinir.

## Değerlendirilen Alternatifler

### A. Tarayıcı araçlara nasıl ulaşır?
1. **Tarayıcı doğrudan `/mcp`'ye bağlanır, LLM döngüsü tarayıcıda.** Eksi: LLM anahtarı tarayıcıda (ADR-0009 bunu reddetti); `/mcp` çerez değil OAuth ister (ADR-0010 `aud:mcp`); MCP henüz yok ve K06 kapısının arkasında. **Reddedildi.**
2. **Backend aracı (broker): tarayıcı yalnız kendi oturumuyla `/api/agent/*` çağırır; döngü, araç listesi ve yürütme backend'de, aynı yetenek kaydından.** Artı: anahtar yalnız backend'de; oturum, `can()`, tenant ve tüm korumalar mevcut yoldan gelir; MCP'yi beklemez; MCP geldiğinde aynı `invokeCapability`'yi paylaşır. Eksi: sağlayıcı anahtarının sunucuda (şifreli) saklanması gerekir; maliyet K37 ile kullanıcının kendi hesabındadır. **SEÇİLEN.**
3. **Broker, iç MCP istemcisi olarak kendi `/mcp`'sine HTTP ile bağlanır.** Artı: "her şey MCP'den". Eksi: süreç içi çağrıya bir ağ katmanı ve OAuth token üretimi ekler; MCP bitmeden çalışmaz. Aynı eşitlik süreç içi `invokeCapability` ile sağlanır. **Reddedildi.**

### B. Akış taşıması
1. **Tur başına POST yanıtı olarak SSE (`fetch` + ReadableStream).** Artı: akış isteğin kendisine bağlı; fan-out, abonelik, çok-pod yayılımı gerekmez; istemci iptali = bağlantıyı kapat (LLM çağrısı da iptal). Eksi: `EventSource` kullanılamaz (POST); küçük bir SSE ayrıştırıcı gerekir. **SEÇİLEN.**
2. **ADR-0029 bildirim akışı + `RealtimeBus` üzerinden içerik.** Eksi: o kanal bilinçli olarak PII/içerik taşımaz; sohbet içeriği için tasarım değiştirmek gerekir; çok-pod'da Redis pub/sub zorunlu olur. **Reddedildi** (yalnız başlık/nabız kuralları ödünç alınır).
3. **WebSocket.** Eksi: çift yön gerekmiyor; yeni altyapı, proxy/Cloudflare ayarı. **Reddedildi.**

### C. Önyüz paketi nerede?
1. **`@entegrasyonik/ui` içine.** Eksi: `ui` paketinde paralel bulut işleri var (çakışma); `ui` salt tasarım sistemi kalmalı (ADR-0026 Karar 2 "ihtiyaç kadar"). **Reddedildi.**
2. **Her uygulamada ayrı sohbet bileşenleri.** Eksi: K21 "bir kez yazılsın" isteğine aykırı. **Reddedildi.**
3. **Ayrı paket `frontend/packages/chat` (`@entegrasyonik/chat`), `ui`'ye bağımlı, uygulamalardan bağımsız; taşıyıcı ve "host" enjekte edilir.** **SEÇİLEN.**

### D. Protokol şemasının tek kaynağı
1. **Backend'de kanonik, önyüze üretilmiş kopya.** Artı: güvenlik sınırı backend'de. Eksi: bulut backend'e yazamaz; önyüz BR-1'i beklemek zorunda kalır.
2. **Kök `contracts/` paketi.** Eksi: yeni workspace kökü; `cloud-sync.sh` ve kural 7 değişir (ADR-0026 Alt. 1a ile aynı maliyet). **Reddedildi.**
3. **Önyüz paketinde kanonik (`frontend/packages/chat/src/protocol/v1.ts`, yalnız `zod` içe aktarır), backend'e birebir kopya, iki taraflı eşitlik testi.** Artı: bulut hemen başlar; bulut kopyasında backend dosyası salt-okunur durduğu için önyüz testi tek taraflı protokol değişikliğini kırmızıya çevirir, yani değişiklik yerel bir işe zorlanır. Eksi: iki dosya (test bekler). **SEÇİLEN.**

### E. Sonuçların sunumu
1. **Model GenUI JSON üretir (ADR-0009 §8 `dataRef`).** Eksi: ek şema, model hatası, ek doğrulama; v1 için gereksiz. **Ertelendi.**
2. **Sunucu, araç sonucunu yeteneğin `present` ipucuna göre deterministik parçaya çevirir; model yalnız çevresindeki metni yazar.** Artı: tablo/KPI sayıları asla modelden gelmez (halüsinasyon yüzeyi sıfır), ek LLM maliyeti yok. **SEÇİLEN.**

## Karar
**Sohbet önyüzü bir kez, `frontend/packages/chat` (`@entegrasyonik/chat`) paketinde, taşıyıcıdan bağımsız yazılır ve web uygulaması, backoffice ve Electron masaüstü (aynı web derlemesi, K36) tarafından kullanılır. Tarayıcı MCP'ye bağlanmaz: web ve backoffice kendi oturumlarıyla backend aracına (`/api/agent/*`, `/admin-api/agent/*`) tur başına POST + SSE ile bağlanır. Aracı, kullanıcının oturumu + `can()` + tenant bağlamıyla çalışır ve araçlarını MCP ile aynı yetenek kaydından, aynı yürütücüyle (`invokeCapability`) türetir. Yazma/yan etkili yetenekler onay kartı → yürütme → denetim sırasıyla çalışır. LLM, kullanıcının kendi sağlayıcı anahtarıyla (BYOK, K37) çağrılır; anahtar yalnız backend'de şifreli durur, tarayıcıya ve yanıtlara hiç çıkmaz. Kendi AI uygulamasını kullanmak isteyen, aynı yetenek kaydına uzak MCP sunucusundan (OAuth) bağlanır. Geliştirme ve testler sahte (scripted) sağlayıcıyla yapılır.**

### Karar 1 — Ürün adı
- Tek sabit: `frontend/packages/chat/src/brand.ts` → `CHAT_PRODUCT = { name: 'Otopilot', slug: 'otopilot' }`. Menü, panel başlığı, rota slug'ı, komut paleti etiketi ve i18n bu sabitten okur. Backend sistem prompt'u ada ihtiyaç duyarsa `backend/src/operations/agent/brand.ts` kopyası ve eşitlik testi kullanılır.
- "Asistan", "Copilot" ve üçüncü taraf marka adları kod/metinde kullanılmaz (statik test). Site sabiti (S22) ile uyum testi site görevinde eklenir.

### Karar 2 — Önyüz paketi
- `frontend/packages/chat` workspace paketi; derleme adımı yok, kaynak olarak tüketilir (ADR-0026 deseni).
- Bağımlılık yönü: `chat` → `@entegrasyonik/ui`, `vue`, `vuetify`, `zod`, `markdown-it` (yalnız ayrıştırma). `chat` ne `frontend/src` (`@/`) ne `backoffice/src`'yi içe aktarır; `ui` `chat`'i içe aktaramaz (statik test + eslint kuralı).
- Uygulamaya özgü her şey **host** arayüzüyle enjekte edilir: bağlantı çözümü (`screens.ts` / backoffice rotaları), i18n `t`, yetki ipucu, gezinme, telemetri.
- Taşıyıcı arayüzü `ChatTransport`, iki uygulama: `sse` (web, backoffice ve Electron masaüstü; yalnız `baseUrl` farklı) ve `mock` (senaryolu, deterministik). Masaüstü ayrı taşıyıcı değildir; yalnız isteğe bağlı bir **yerel araç köprüsü** (`LocalToolBridge`, Karar 8) enjekte eder. Sözleşme: `CHAT_UI_CONTRACT.md` §3.
- Markdown güvenli alt kümedir: `markdown-it` yalnız token üretir, token'lar izinli listeden Vue VNode'a çevrilir; `v-html` yok, ham HTML yok, görsel yok, bağlantı çapa olarak çizilmez (uygulama bağlantısı yalnız `entity-link` parçasıyla).

### Karar 3 — Mesaj protokolü (`chat/v1`)
- Kanonik tanım: `frontend/packages/chat/src/protocol/v1.ts` (zod; yalnız `zod` içe aktarır; `zod@3.25.76` backend ile aynı sürüme sabitlenir). Backend kopyası `backend/src/operations/agent/protocol/v1.ts`; iki yönlü eşitlik testi (backend jest + frontend vitest; backend kopyası yoksa frontend testi "atlandı" diye raporlar).
- Olay akışı: `turn.start`, `part` (tam parça, `id` ile upsert), `delta` (metin eki), `turn.end`, `error`. Parça türleri: `text` (düz/markdown), `table`, `kpi`, `confirm`, `progress`, `error`, `entity-link`, `form`. `chart` ayrılmıştır, v1'de yoktur. Bilinmeyen parça türü istemcide güvenli yedek görünümle çizilir (ileri uyum).
- Sürüm: `v: 1`. Eklemeli değişiklik (isteğe bağlı alan, yeni parça türü) aynı ana sürümde; kırıcı değişiklik `v2` dosyası.
- İstemci her tur isteğinde **sayfa bağlamını** gönderebilir (`screen`, teknik kimlik, seçili kimlikler ≤ 100, PII'siz filtreler — ADR-0012 URL kuralı). Kullanıcı bağlam çipini kaldırabilir.

### Karar 4 — Aracı (broker) ve güvenlik
1. **Kimlik:** web `/api/agent/*` normal `authenticate` (çerez, Origin denetimi); backoffice `/admin-api/agent/*` `EK_ADMIN` + TOTP. `Actor` (ADR-0028) bir kez kurulur. Tenant yalnız oturumdan gelir; hiçbir araç girdisi tenant taşımaz (P7).
2. **Araç listesi (tur başına, sunucuda):** `mcp.exposed` yetenekler → `can(actor, cap)` → entitlement → `SystemFlags.disabledCapabilities` → LIVE_READONLY açıksa `external && effect≠read` düşer → bakım modunda `write/destructive` düşer → impersonation oturumunda yalnız `effect: read` kalır. Bütçe ≤ 30 araç (ADR-0019 §4.3); sayfa bağlamının toolset'i + `core` önceliklidir. Araç adları MCP ile aynı türetme fonksiyonundan (`orders.list` → `orders_list`).
3. **Yürütme:** yalnız `invokeCapability(ctx, id, input, surface)` ile; bu fonksiyon `bindings` üzerinden **mevcut `RunOperation` koruma zincirini** çalıştırır (yetki, entitlement, LIVE_READONLY 423, impersonation yasakları, idempotency, denetim). Liste 2'deki süzme bir kolaylıktır; güvence yürütmedeki yeniden denetimdir. Bakım modu HTTP ara katmanında olduğundan `/api/agent/*` o ara katmandan muaf tutulur ve aynı `isMaintenanceBlocked` kuralı yetenek düzeyinde `invokeCapability` içinde uygulanır.
4. **Yazma = onay kartı:** `effect ∈ {write, destructive}` her zaman önce `PendingAction` üretir (`confirm` parçası: eylem özeti, etkilenen kayıtlar, risk, dış sisteme gidip gitmediği, süre). Onay yalnız kullanıcının karttaki tıklamasıyla ayrı uca (`POST .../agent/confirm`) gider; model bu kanala erişemez. `PendingAction` tek kullanımlık (Redis `GETDEL`), 5 dk ömürlü, (kullanıcı, tenant, yetenek, sürüm, girdi özeti) eşleşmesi zorunlu. Yürütmede `pendingActionId` idempotency anahtarıdır; `external` yazmalar mevcut `withIdempotency` deposundan da geçer. `destructive` → `typed` onay; `irreversible` açılmaz (ADR-0019 §4.2). `propose` onaysız çalışır (önizleme).
5. **Onay sonrası metin deterministiktir** (yeteneğin `summary` şablonundan: "12 sipariş onaylandı"). Onaydan sonra LLM çağrılmaz (maliyet ve enjeksiyon yüzeyi küçülür).
6. **Denetim:** her araç çağrısı (okuma dahil) ve her onay/ret `AuditLogs`'a yazılır: `surface: 'chat'` (web) ya da `'backoffice_chat'`, `capabilityId`, `version`, redakte parametre özeti, sonuç, `corrId`, `turnId`, `imp`. Sohbet metni denetime yazılmaz.
7. **Enjeksiyon savunması:** araç sonuçları modele `untrusted` işaretli, uzunluk sınırlı JSON olarak gider; sistem prompt'u bunları veri olarak bildirir; dışa veri gönderen araç açılmaz (ADR-0009 §7).
8. **Sınırlar:** girdi ≤ 4.000 karakter; tur başına ≤ 5 araç çağrısı, ≤ 6 model gidiş-dönüşü, ≤ 60 sn; kullanıcı başına aynı anda 1 tur (409); kullanıcı 10 tur/dk (sunucumuzu korumak için; LLM maliyeti kullanıcıda olduğundan günlük tur kotası yok, yalnız bilgi amaçlı kullanım sayacı var — Karar 9). Yanıt parçası tablo ≤ 50 satır, "daha fazla" ile toplam ≤ 500 satır (ADR-0009 §8).
9. **Kill-switch ve kurulum:** `agent.enabled` platform ayarı (varsayılan üretimde `false`) kapalıysa `/agent/info` → `enabled:false, reason:'DISABLED'` ve önyüz giriş noktalarını gizler. Açık ama tenant'ın sağlayıcı anahtarı ya da tenant sahibinin aktarım onayı yoksa (Karar 9) `reason:'SETUP_REQUIRED'` → önyüz kurulum ekranını gösterir (yetkisi olmayan kullanıcıya "yöneticinizden kurmasını isteyin").

### Karar 5 — Durum ve saklama (kalıcı geçmiş yok)
- **Çalışma belleği:** Redis, anahtar `agent:conv:{surface}:{tid|admin}:{userId}:{convId}`, 60 dk boşta kalma ömrü, ≤ 40 mesaj (eskiler kırpılır). İçerik: kullanıcı/model metinleri, araç çağrı özetleri ve maskelenmiş sonuç özetleri. Mongo'ya yazılmaz, göç yok.
- Yeniden bağlanma/devam yok: bağlantı koparsa tur iptal edilir, istemci "yanıt yarıda kaldı, yeniden dene" gösterir. Yazma işlemleri ayrı onay ucundan yürüdüğü için yarıda kalan tur yan etki bırakmaz.
- Web ve backoffice anahtar alanları ayrıdır; aynı kişi iki yüzeyde ayrı sohbet görür. Tenant değişimi / impersonation farklı anahtardır.
- **Konuşma kaydı saklanmaz (K38).** Kalıcı geçmiş, sohbet listesi, arama "sonra" sepetinde; açılması ayrı kullanıcı kararı + KVKK saklama süresi gerektirir.

### Karar 6 — Backoffice sohbeti (izole)
- Uç `/admin-api/agent/*`, oturum `EK_ADMIN` (ADR-0026 Karar 4). Müşteri sohbetiyle oturum, geçmiş, anahtar alanı ve araç kümesi paylaşılmaz; ortak olan yalnız önyüz paketidir.
- Araçlar: `scope: 'platform'` yetenekler, **yalnız açık katılımla**. Yetenek tipine isteğe bağlı `adminChat?: { exposed: { present; llm } }` alanı eklenir (değişmez: yalnız `scope:'platform'` taşıyabilir; `llm` zorunlu). MCP'ye açılmazlar (`platform_admin` gerekçesi aynen kalır).
- **v1 salt-okunurdur** (genel bakış, motor sağlığı, kuyruk durumu, log arama, tenant meta listesi). ADR-0026 Karar 6: tenant iş verisi (ürün, sipariş, müşteri kişisel verisi) döndüren araç açılmaz; bunun yolu denetimli impersonation'dır ve impersonation içindeki sohbet müşteri sohbetidir (salt-okunur, Karar 4.2).
- Backoffice yazma araçları (step-up + gerekçe gerektirir) "sonra" sepetinde; tetikleyici: platform yöneticisi > 3 **veya** aynı yazma işleminin ayda > 20 kez elle yapılması.

### Karar 7 — Yerleşim (çerçeve; ayrıntılı UX bulutta)
- **Web uygulaması:** sağ yan panel; ≥ 1280 px'de içeriği iter (push), altında yüzen (overlay) çekmece; genişlik 360–560 px, kullanıcı ayarı yerelde saklanır. Tam sayfa görünümü (`screens.ts` girdisi, slug `CHAT_PRODUCT.slug`). < 768 px'de yalnız tam ekran sayfa.
- **Komut paleti:** Ctrl/⌘+K'da yazılan metin için "Otopilot'a sor: …" satırı; seçilince panel açılır ve metin gönderilir. Paneli aç/kapa kısayolu `shortcutCatalog.ts`'e eklenir (çakışma testi mevcut).
- **Bağlamsal açılış:** ekran ve kayıt başlıklarındaki "Otopilot'a sor" girişi o ekranın bağlamını (Karar 3) çip olarak ekler.
- Panel, sekme/sayfa değişiminde konuşmayı korur; çıkış, tenant değişimi, impersonation başlangıç/bitişinde temizlenir.
- **Backoffice:** aynı panel bileşeni, kendi taşıyıcısı ve host'u.

### Karar 8 — Masaüstü (Electron) ve istemci tarafı yerel araçlar (K36)
- Masaüstü, Electron kabuğunda **aynı web derlemesini** yükler; sohbet aynı `sse` taşıyıcısıyla aynı broker'a gider (oturum web ile aynı çerez modeli; ayrı OAuth/bearer gerekmez). Tek LLM döngüsü backend'dedir; masaüstünde yerel döngü, yerel model anahtarı ve yerel MCP **yoktur**.
- Yerel yetenekler kayıtta zaten `executor: 'desktop'` ve `domain: 'local'` ile beyan edilir (ADR-0019 §5.5). Broker bunları **yalnız** istemci tur isteğinde köprünün varlığını bildirdiğinde (`TurnRequest.client.localTools`) araç listesine ekler; yürütmez.
- Akış (DESK-04 ile gelir, protokole **eklemeli** değişiklik): model yerel aracı çağırır → broker bir onay kartı üretir (`executor: 'client'`; dosya adı/klasör, boyut, ne okunacağı) → kullanıcı onaylar → paket köprü üzerinden Electron'da çalıştırır → sonuç (sınırlı, `untrusted`) yeni bir tur girdisi olarak broker'a gider → denetim kaydı (`surface:'chat'`, `capabilityId: local.*`). Onaysız yerel okuma yoktur; dosya içeriği yalnız kullanıcı onayıyla sunucuya çıkar.
- Köprü sınırları DESK-00/01'dedir: `contextIsolation`, `sandbox`, `nodeIntegration: false`, yalnız izinli klasörler, tür/boyut sınırı, yazma yok.
- Web'de köprü yoktur; aynı araçlar listelenmez. Tek seferlik dosya seçimi tarayıcıdaki mevcut yükleme yoludur (sohbet v1'de dosya eki yok).

### Karar 9 — LLM sağlayıcı: BYOK (K37)
- **Entegrasyonik LLM sağlamaz.** İki yol, aynı yetenek kaydı + aynı `can()` + aynı onay/denetim:
  - **(a) Uygulama içi sohbet (web, backoffice, Electron) = BYOK.** Kullanıcının kendi API anahtarı ve kendi seçtiği sağlayıcı/model; maliyet kullanıcının sağlayıcı hesabında.
  - **(b) Kendi AI uygulaması (tüketici aboneliği) = uzak MCP sunucusu** (`/mcp`, OAuth; ADR-0009/0010/0019 Aşama C). Bu ADR (b)'ye iş eklemez; yalnız aynı `invokeCapability` ve `PendingAction`'ın paylaşılmasını şart koşar.
- **Sağlayıcı soyutlaması** `backend/src/platform/llm/`: `LlmProvider` portu (akışlı metin + araç çağrısı olayları, kullanım bilgisi, `AbortSignal`), ilk bağdaştırıcılar **Anthropic, OpenAI, Google** (düz `fetch` + SSE; SDK zorunlu değil), `ScriptedLlmProvider` (geliştirme ve testlerin varsayılanı; `AGENT_LLM_SCRIPTED=1` yalnız yerel/test, üretimde süreç başlarken reddedilir). Araç çağırmayı desteklemeyen model desteklenmez. Model listesi bağdaştırıcıda izinli liste; seçim kullanıcıda.
- **Anahtarın yeri:** tenant ayarı — tenant DB `Settings` belgesinde `agent: { provider, model, apiKey: 'enc:v1:…', transferConsent }` alt nesnesi (şema `strict:false`, eklemeli; göç yok) (**K38: tenant düzeyi**; sahip/admin `settings:manage` ile girer, tüm üyeler kullanır; kullanıcı düzeyi anahtar yoktur). Sağlayıcı temel adresi **tenant tarafından yazılamaz**; yalnız kodda sabit üç host (K7/SSRF, `tenantSettingsGuard` ile aynı ilke; OpenAI-uyumlu serbest uç bu yüzden eşikli). Anahtar `enc:v1` şifreli (`FIELD_ENCRYPTION_KEYS`), API yanıtlarında `'sensitive'` maskeli, loglarda yok, sohbet/LLM kanalından hiçbir zaman geçmez (kurulum normal bir ayar formudur, sohbet parçası değildir; ADR-0019 §4.2 `credential`). Anahtar kaydetme/silme/doğrulama yetenekleri `mcp: notExposed credential` ve impersonation'da yasak (kimlik bilgisi listesi).
- **Doğrulama ucu:** `agent.provider.test` — sağlayıcının salt-okuma model listeleme ucuyla anahtarı sınar (üretim çağrısı yapmaz), sonucu aşağıdaki sınıflarla döndürür.
- **Sağlayıcı hata sınıfları → kullanıcıya güvenli ileti:** `LLM_KEY_INVALID` (anahtar geçersiz/iptal), `LLM_QUOTA` (sağlayıcı hesabında kredi/kota bitti), `LLM_RATE_LIMITED` (sağlayıcı hız sınırı; `retryAfter`), `LLM_MODEL_UNAVAILABLE` (model yok/erişim yok), `LLM_UNAVAILABLE` (sağlayıcı hatası/zaman aşımı). Ham sağlayıcı yanıtı istemciye ve loglara gitmez.
- **Ağ:** sağlayıcı host'ları (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`) giden allowlist'e (`ALLOWED_OUTBOUND_HOSTS` / egress guard) ve `liveReadonlyPolicy.ts`'e POST izniyle eklenir (çıkarım isteği entegrasyona yazma değildir; K06 yasağı entegrasyonlar içindir). Başka host eklenmez.
- **Kullanım sayacı yalnız bilgi amaçlı:** tenant/kullanıcı başına istek ve token (girdi/çıktı) sayısı Redis günlük sayaçlarında + metrik (`agent_tokens_total{surface,provider,kind}`); ayarlar ekranında gösterilir. Faturalama, kota ya da kesme yok.
- **Backoffice:** platform tarafı ayrı anahtar (platform ayarı, `enc:v1`); tenant anahtarı backoffice'te **asla** kullanılmaz, platform anahtarı tenant sohbetinde asla kullanılmaz (test).
- **Sağlayıcıya giden veri ve KVKK (K38 geçici çözümü):** yetenek sonuçları kullanıcının kendi tenant verisidir (PII maskeli, ADR-0009 §5) ve kullanıcının seçtiği sağlayıcıya, muhtemelen yurt dışına gider. Kurulum ekranında sürümlü, açık bir aktarım bilgilendirmesi gösterilir. **Sohbet, tenant sahibi (owner) bu metni onaylamadan açılmaz:** admin anahtarı girebilir ama onay yoksa durum `SETUP_REQUIRED` (`consentRequired`) kalır ve sahibe "onayınız gerekiyor" gösterilir. Onay tenant ayarına (`transferConsent: {at, by, textVersion}`) ve `AuditLogs`'a (`agent.transfer_consent.given` / `.revoked`) yazılır. Metin sürümü artarsa (nihai hukuki metin, H2) yeniden sahip onayı istenir. Sahip onayı geri alabilir; alınca sohbet kapanır.

## Gerekçe
- **K21'i tek önyüzle karşılar.** Taşıma ve uygulama farkları iki arayüzün (taşıyıcı, host) arkasına iner; bileşenler, durum makinesi ve protokol bir kez yazılır, mock taşıyıcıyla bugün bulutta yapılabilir.
- **Tek kaynak korunur (K20, ADR-0019).** Sohbet yeni araç kaydı, yeni yetki tablosu ya da yeni koruma listesi açmaz: araç = `mcp.exposed`, yetki = `can()`, korumalar = `RunOperation` zinciri. MCP geldiğinde `invokeCapability`, araç adı türetimi ve `PendingAction` hazırdır; iş iki kez yapılmaz.
- **Güvenlik yüzeyi küçük:** anahtar tarayıcıda değil; yazma modelin erişemediği kanaldan; tablo/KPI sayıları modelden gelmez; onaydan sonra model çağrılmaz; LIVE_READONLY, bakım ve impersonation kuralları yetenek kaydından türediği için sohbette kendiliğinden geçerli.
- **Maliyet bilinci (K03, K37):** LLM maliyeti bize sıfır (BYOK); yeni servis yok; yeni Mongo koleksiyonu ve göç yok (geçici durum Redis'te, Redis zaten zorunlu; anahtar mevcut tenant ayarı yapısında); sağlayıcı bağdaştırıcıları düz `fetch` (yeni backend bağımlılığı yok); önyüzde `zod` + `markdown-it` (ikisi de MIT). Kalıcı geçmiş, çoklu ajan, dosya eki, grafik, backoffice yazma araçları tetikleyiciyle ertelendi.

## Maliyet/Ölçek Notu
- **Kaba iş:** önyüz ~6–8 ajan-günü (CHAT-FE-1..5), backend ~5–6 ajan-günü (BR-1..BR-4), BR-5 BYOK sağlayıcıları + kurulum ~2–3.
- **İşletme maliyeti:** sıfıra yakın. LLM maliyeti kullanıcının kendi sağlayıcı hesabındadır (K37); bize düşen yalnız akış bağlantılarının CPU/bellek payı. Backoffice sohbeti platform anahtarıyla çalışır; tek haneli yönetici sayısında ihmal edilebilir.
- **Yeniden değerlendirme eşikleri:**
  - Süreç başına eşzamanlı açık sohbet akışı > **50** ya da web replikası > **1** ve tur p95 > **20 sn** → akışların ayrı sürece alınması ya da kuyruk (ADR-0005/0029 eşikleriyle birlikte).
  - Sohbetten yapılan yanlış araç seçimi (kullanıcı reddi + "yanlış anladı" geri bildirimi) turların > **%10**'u → araç açıklamaları/eval (ADR-0019 P9) ve sayfa bağlamı toolset'i gözden geçirilir.
  - Sohbeti deneyen tenant'ların > **%30**'u anahtar edinmeyi engel olarak bildirirse ya da ≥ **3** ödeyen müşteri Entegrasyonik'in sağladığı modeli isterse → platform anahtarlı paket (ücretli, Protokol 12) ayrı ADR ile değerlendirilir.
  - 7 günde turların > **%5**'i `LLM_UNAVAILABLE` → sağlayıcı bağdaştırıcısı/zaman aşımı gözden geçirilir.
  - Yeni sağlayıcı talebi ≥ **2** tenant → yeni bağdaştırıcı (OpenAI-uyumlu genel uç dahil).
  - Kullanıcıların > **%30**'u 60 dk sonrası konuşmaya dönmek isterse (geri bildirim) ya da tenant talebi ≥ **2** → kalıcı geçmiş için kullanıcıya karar sorulur (K38 gereği ayrı karar + KVKK saklama süresi).
  - Model GenUI (sütun seçimi, grafik) talebi ya da `present` eşlemesinin yetmediği exposed yetenek > **5** → ADR-0009 §8 `dataRef` GenUI'si açılır.

## Etki Alanı
- **Frontend (bulut yazabilir):** yeni `frontend/packages/chat/**`; `frontend/package.json` (workspace zaten `packages/*`; `zod`, `markdown-it` bağımlılıkları), `frontend/src` (panel yerleşimi, `screens.ts` girdisi, komut paleti, kısayol, bağlam girişleri, host), `frontend/backoffice/src` (panel + host), mandal betiklerine `packages/chat/src` kökü. Masaüstü: `frontend/main.js` + preload (yerel köprü) yalnız DESK-00/01/04 ile; sohbet paketinde değişiklik gerektirmez.
- **Backend (yerel):** yeni `src/operations/agent/**` (broker döngüsü, araç türetme, sunum, `PendingAction`, çalışma belleği, protokol kopyası), `src/platform/llm/**`, `src/api/http/agentRoutes.ts` (+ `/admin-api` eşi), `src/capabilities/invoke.ts` + `derive/toolName.ts`, `capabilities/types.ts` (`adminChat?`), `capabilities/domains/*` (ilk `mcp.exposed` işaretleri: ADR-0019 §4.3 `core` 5 yetenek), `api/http/maintenanceGuard.ts` (muafiyet), `database/application/models/AuditLog.ts` (`surface` enum'una `chat`, `backoffice_chat`), `config/env.ts` (`AGENT_LLM_SCRIPTED`), tenant ayarı (sağlayıcı/model/şifreli anahtar/aktarım onayı), platform ayarları (`agent.*`, backoffice anahtarı), `integration/modules/adapterKeys.ts` + `common/security/liveReadonlyPolicy.ts` + egress guard (sağlayıcı host'ları), `api/impersonationPolicy.ts` (anahtar RPC'leri kimlik bilgisi listesinde).
- **Belgeler:** `docs/cloud-contracts/CHAT_UI_CONTRACT.md`, `docs/AGENT_BROKER_PLAN.md`, `docs/CAPABILITIES.md` (üretilir), `docs/adr/USER_DECISIONS.md` (K21), ERROR_CODES (yeni kodlar BR-1'de).

## İnsan kararları
**Karara bağlananlar (K37, K38, K39 — 2026-10-01):** ürün adı **Otopilot** (K39); BYOK (Entegrasyonik LLM sağlamaz); anahtar tenant düzeyinde, kullanıcı düzeyi yok; ilk sağlayıcılar Anthropic + OpenAI + Google; konuşma kaydı saklanmaz.

**Açık kalanlar (Protokol 12; varsayılanları var, önyüz ve BR-1..BR-5'i durdurmaz):**
- **H2 — KVKK yurt dışı aktarım nihai metni:** geçici çözüm K38 ile sabit (açık bilgilendirme + tenant sahibi onayı + denetim kaydı). Nihai hukuki metin gelince `consentText` sürümü artar, sahiplerden yeniden onay alınır. Canlıya çıkıştan önce hukuki göz önerilir.
- **H4 — Backoffice platform anahtarı:** hangi sağlayıcı/hesap (ücretli hesap Protokol 12). **Varsayılan:** anahtar girilene kadar backoffice sohbeti `SETUP_REQUIRED`.

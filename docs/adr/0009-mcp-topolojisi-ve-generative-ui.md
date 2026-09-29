# 0009 — MCP Sunucusu Topolojisi, Güvenlik Modeli ve Generative UI Kapsamı (Faz 4)

## Durum
Kabul edildi (2026-09-26). Ön koşul: ADR-0001 (auth/RBAC) ve ADR-0010 (çerezsiz istemciler için OAuth) uygulanmış ve BACKLOG C1–C4 (imzasız JWT, yetkisiz AdminService, `@Cache` tenant sızıntısı, IDOR) kapatılmış olmadan MCP uç noktası **hiçbir ortamda dışarı açılmaz**. Token/rol modeli ADR-0001 ile çelişirse ADR-0001 esas alınır ve bu ADR güncellenir. Yerel uygulama tarafı ADR-0007, plan kotası ADR-0008.

## Bağlam
- Master prompt Faz 1.0(c) ve Faz 4: MCP sunucusu topolojisi (backend'de remote mu, yerel köprü mü) ve "Generative UI" kapsamı karara bağlanmalı. Faz 4 DoD: MCP araç listesi belgelenmiş/test edilmiş, allowlist + audit trail çalışıyor, iki test tenant'ı birbirinin verisini görmüyor, masaüstü bir komutu uçtan uca çalıştırıyor.
- `.claude/skills/mcp-security-standards/SKILL.md` (bağlayıcı): OAuth benzeri token + refresh + iptal; rol bazlı tool allowlist sunucuda; tenant/token rate limit; durum değiştiren her çağrıda idempotency key; audit trail (kim/ne/ne zaman/sonuç, redaction) entegrasyon audit log'uyla aynı kaynağa; yalnızca açıkça seçilen dosya (Tauri izin modeli); araç çıktısı her zaman veri, asla talimat; kullanıcının modeli iş mantığını yalnızca tanımlı araçlarla etkiler.
- `docs/research/1f-findings.md` §6: MCP spesifikasyonu 2025-11-25 — OAuth 2.1 + PKCE S256, RFC 9728 korumalı kaynak metadata'sı, RFC 8707 `resource` parametresi, audience doğrulaması, token passthrough yasak, kısa ömürlü token + refresh rotasyonu; stdio MCP'de OAuth kullanılmaz. OWASP MCP: araç çıktısı güvenilmeyen girdi, araç şemaları sabitlenir, yazma işlemlerinde insan onayı, tüm çağrılar loglanır.
- Mevcut durum: backend jenerik RPC (`/:service/:operation`, izinli metot listesi yok — C1), sunucu tarafı RBAC yok, kullanıcı eylemi audit log'u yok (`INTEGRATION_ENGINE_STANDARDS.md` §14), API anahtarları düz metin (C12). Yani MCP katmanı mevcut RPC'yi dışa açmamalı; kendi dar, açıkça tanımlı yüzeyine sahip olmalı.
- Ölçek: tek haneli abone; LLM maliyeti bize ait olmamalı (BYO model).

## Değerlendirilen Alternatifler

### Topoloji
1. **Yalnızca remote MCP (backend içinde, Streamable HTTP + OAuth 2.1)** — Artı: tenant verisi ve iş mantığı sunucuda kalır, RBAC/rate limit/audit tek yerde; istemci (Tauri, PWA, ileride Claude Desktop gibi harici istemciler) güvenilmez kabul edilir; mevcut Express sürecine bir rota olarak eklenir, yeni servis yok; stateless mod çok pod'da yapışkan oturum gerektirmez. Eksi: yerel dosya araçları sunucuda çalışamaz (→ istemci içi yerel araçlarla çözülür).
2. **Yalnızca yerel köprü (stdio MCP sunucusu kullanıcı makinesinde, backend'e REST ile bağlanır)** — Artı: stdio destekli yerel istemcilerle doğrudan çalışır. Eksi: güvenlik kararları güvenilmez istemciye kayar ya da backend'de yine aynı kontroller gerekir (çift iş); köprünün kendisinin dağıtımı/güncellemesi; mobil PWA stdio çalıştıramaz.
3. **İkisi birden** — Artı: en geniş istemci uyumu. Eksi: iki yüzey, iki test/sürüm hattı; tek haneli ölçekte gereksiz.

### Model çağrısının (agent döngüsü) yeri
1. **Yerel uygulamada, kullanıcının anahtarıyla doğrudan sağlayıcıya** — Artı: model anahtarı ve prompt'lar sunucumuza gelmez; LLM maliyeti sıfır; kullanıcı yerel model (ör. Ollama) de seçebilir. Eksi: istemci tarafında araç döngüsü kodu.
2. **Backend'de (sunucu anahtarı veya kullanıcının anahtarını sunucuda saklayarak)** — Eksi: LLM maliyeti veya anahtar saklama sorumluluğu bize geçer; master prompt "kullanıcının kendi AI modeli" diyor.

### Generative UI
1. **Model HTML/JS/markdown-HTML üretir, WebView'da render edilir** — Eksi: XSS/enjeksiyon; prompt injection → kod çalıştırma yolu; reddedildi.
2. **Şema-tabanlı bileşen çıktısı (kapalı katalog + JSON Schema doğrulama)** — Artı: güvenli, tutarlı premium görsel dil, web app ile aynı bileşenler; test edilebilir. Eksi: model yalnızca katalogdaki bileşenleri kullanabilir (MVP için yeterli).
3. **Generative UI yok, yalnızca metin** — Eksi: master prompt Generative UI istiyor; tablo/grafik verisi metinde zayıf.

## Karar
MVP'de **yalnızca remote MCP** kurulur: mevcut backend Express sürecinde `/mcp` uç noktası (resmi TypeScript MCP SDK, Streamable HTTP, **stateless**), OAuth 2.1 + PKCE ile korunur ve yalnızca merkezi bir **araç kaydından** (tool registry) tanımlı, ilk aşamada **salt-okunur 5 araç** sunar; agent döngüsü ve kullanıcının model anahtarı **yerel uygulamada** kalır; yerel dosya okuma sunucu aracı değil, yalnızca kullanıcının seçtiği dosyaya erişen **istemci içi yerel araçtır**; Generative UI, modelin **kapalı bir bileşen kataloğuna uyan JSON (şema-doğrulamalı) UI tanımı** üretmesi ve sayısal verinin araç sonuçlarına referansla (modelin kopyaladığı sayılarla değil) bağlanmasıdır. stdio köprüsü yapılmaz.

### 1. Kimlik doğrulama ve token (ADR-0001 ile tutarlı)
- Backend hem yetkilendirme sunucusu (ADR-0010 token uç noktaları — ADR-0001'in genişletmesi) hem kaynak sunucusudur. `/.well-known/oauth-protected-resource` (RFC 9728) ve yetkilendirme sunucusu metadata'sı yayınlanır.
- Akış: Authorization Code + **PKCE S256** zorunlu; `resource` parametresi (RFC 8707) = MCP kaynak URI'si; token **audience** doğrulanır — web uygulaması çerez oturumu ve başka audience'lı token'lar `/mcp`'de kabul edilmez.
- İstemci kaydı: MVP'de yalnızca önceden kayıtlı birinci taraf public client'lar (`entegrasyonik-desktop`, `entegrasyonik-pwa`); loopback yönlendirme (ADR-0007). Harici istemciler (Client ID Metadata Documents / dinamik kayıt) backlog'da, eşiğe bağlı.
- Access token ≈ **15 dk**; refresh token **dönen**, token ailesi sunucuda saklanır → yeniden kullanım tespitinde tüm aile iptal; kullanıcı/yönetici tarafından tek taraflı iptal (şifre değişimi, rol değişimi, tenant askısı).
- **Tenant kimliği yalnızca token'daki imzalı iddiadan** alınır; hiçbir araç parametresi `tenantId/clientId` kabul etmez.
- **Token passthrough yok:** MCP katmanı kullanıcı token'ını pazaryerlerine/üçüncü taraflara iletmez; pazaryeri çağrıları (gerekirse) sunucudaki tenant entegrasyon kimlik bilgileriyle yapılır.

### 2. Araç kaydı, RBAC ve allowlist
- Merkezi kayıt `backend/src/mcp/tools/` (öneri): her araç `{ name, version, description, inputSchema, outputSchema, scope: 'mcp:read'|'mcp:write', roles[], mutating, piiLevel, rateCost }`. Uygulama, mevcut servis sınıflarını çağıran **ince, açık adaptörlerdir** — jenerik `/:service/:operation` dağıtımı MCP'den erişilemez.
- `tools/list` rol ve kapsama göre filtrelenir; `tools/call` aynı kontrolü **yeniden** yapar (istemci güvenilmez). Roller ADR-0001'in rol modeline eşlenir (ADR-0001 kademeleri: `member` < `admin` < `owner`; `platformAdmin` MCP'de kullanılmaz — ADR-0010); MVP'deki 5 salt-okunur araç tüm rollerde açıktır, gelecekteki yazma araçları varsayılan olarak yalnızca `owner/admin`'e açık.
- Plan özelliği `mcp` kapalıysa veya abonelik `suspended` ise (ADR-0008) MCP reddeder (salt-okunur takip araçları `suspended`'da açık kalabilir — ADR-0008 tablosuyla uyumlu: okuma tam).
- **Araç şeması sabitleme:** araç tanımlarının (ad + açıklama + şemalar) SHA-256 özeti sürüm manifestinde yayınlanır; yerel uygulama beklenmeyen değişiklikte kullanıcıyı uyarır ve yeni aracı onay olmadan modele sunmaz.

### 3. Rate limit, kota, idempotency
- Redis (zaten zorunlu bağımlılık) üzerinde sabit pencere: **kullanıcı/token başına 60 çağrı/dk**, **tenant başına 300 çağrı/dk**; plan günlük kotası `mcpCallsPerDay` (ADR-0008). Aşımda 429 + aksiyon alınabilir mesaj ("Dakikalık sınır aşıldı, N sn sonra tekrar deneyin").
- Yanıt boyutu sınırı (öneri 256 KB) ve liste araçlarında `limit ≤ 100` + imleç tabanlı sayfalama — model bağlamı ve DB yükü sınırlanır.
- **Yazma araçları (MVP sonrası)** için zorunlu kurallar şimdiden sabitlenir: (a) her çağrı `idempotencyKey` (UUID) taşır; `McpIdempotency` koleksiyonunda `(tenantId, key)` unique, sonuç saklanır, **24 saat TTL**; (b) **önizle → onayla** iki adımı: model yalnızca önizleme (dry-run, değişiklik listesi + onay kimliği) üretir; uygulama, onayı **modelden değil kullanıcının UI'daki açık tıklamasından** alıp ayrı bir uç noktaya iletir. Model tek başına durum değiştiremez.

### 4. Audit trail
- Her `tools/call` (başarılı/başarısız/reddedilmiş) ve her yetkilendirme olayı ortak **audit log** kaynağına yazılır (INTEGRATION_ENGINE_STANDARDS audit standardı; `source: 'mcp'`): `tenantId`, `userId`, `clientAppId`, `tool`, `toolVersion`, parametreler (**redaction'lı**: PII, anahtar, serbest metin kırpılmış), `result` (`ok|error|denied|rate_limited`), `durationMs`, `correlationId`, zaman. Önerilen saklama **180 gün** (TTL indeks). Faz 4 DoD'deki cross-tenant testinin kanıtı bu log + otomatik testtir.

### 5. Kullanıcının kendi modeli (BYO model)
- Model sağlayıcı seçimi ve anahtarı yerel uygulamada yapılandırılır; anahtar **Windows Credential Manager'da** (Rust `keyring`) saklanır, **backend'e hiçbir zaman gönderilmez**, loglanmaz; model çağrıları Rust tarafından doğrudan sağlayıcıya (veya yerel modele) yapılır; CSP `connect-src` yalnızca seçilen sağlayıcı alanını içerir.
- Sağlayıcı soyutlaması: MVP'de en az bir bulut sağlayıcı + OpenAI-uyumlu uç nokta (yerel model sunucuları dahil). Araç çağırma (tool use) desteği olmayan modeller desteklenmez.
- PWA (mobil) MVP'de AI sohbeti yoktur (ADR-0007): tarayıcıda anahtar güvenle saklanamaz; mobil takip görünümleri aynı araçları **model olmadan doğrudan** çağırıp katalog bileşenleriyle render eder.
- **KVKK:** Araç çıktıları kullanıcının seçtiği (muhtemelen yurt dışı) model sağlayıcısına gider. Tenant bu seçimde veri sorumlusudur; Entegrasyonik veri minimizasyonu uygular: son müşteri kişisel verileri (ad, adres, telefon, e-posta) araç çıktılarında **varsayılan olarak maskelenir**; maskesiz çıktı ayrı bir kapsam + tenant ayarı + uygulamada açık uyarı gerektirir (MVP'de yok). Yerel uygulamada ilk kurulumda bu aktarım hakkında bilgilendirme gösterilir (metnin nihai hali Protokol 12).

### 6. Yerel dosya erişimi (Tauri izin modeli)
- Dosya okuma **istemci içi yerel araç**tır (`local.read_selected_file`), sunucu MCP aracı değildir ve stdio sunucusu gerektirmez. Model bu aracı yalnızca "kullanıcıdan dosya seçmesini iste" olarak tetikleyebilir; dosyayı **kullanıcı sistem diyaloğunda seçer** (`tauri-plugin-dialog`), erişim yalnızca o yol için verilir.
- Capability dosyasında genel `fs` okuma kapsamı **yoktur**; okuma, diyalogdan dönen yolu kabul eden özel bir Rust komutuyla yapılır. Tür allowlist'i: `xlsx`, `csv`, `png`, `jpg`, `webp`; boyut sınırı öneri **10 MB** (tablo) / **5 MB** (görsel); klasör tarama/listeleme yok, yazma yok (dışa aktarma da "farklı kaydet" diyaloğu ile).
- Tablolar yerelde ayrıştırılır; modele yalnızca kullanıcının önizlemede onayladığı satır/sütunlar gider. Görsellerin backend'e yüklenmesi yalnızca mevcut görsel yükleme API'si üzerinden ve kullanıcı onayıyla (yazma işlemi → §3 kuralları).

### 7. Prompt-injection savunma ilkeleri
1. Araç çıktısı (ürün adı/açıklaması, müşteri notu, pazaryeri yanıtı, dosya içeriği) **veri**dir: yapılandırılmış JSON olarak, serbest metin alanları uzunluk sınırlı ve `untrusted` işaretli döner; sistem prompt'u modele bu alanların talimat olmadığını açıkça bildirir.
2. Model çıktısı hiçbir zaman kod/HTML olarak çalıştırılmaz (bkz. §8); URL'ler otomatik açılmaz/getirilmez.
3. Durum değiştiren her eylem insan onayı ister (§3b); onay kanalı modelin erişemediği UI kanalıdır.
4. Dışarıya veri gönderen araç yok (e-posta/webhook/HTTP getir) — MVP'de ve ayrı bir ADR olmadan eklenmez.
5. Yetki sınırları sunucuda: model ne üretirse üretsin, RBAC + tenant kapsamı + rate limit + kota aynıdır; araç şemaları sabitlenmiştir (§2).
6. Audit log'da reddedilen/anormal çağrılar (ör. kısa sürede çok sayıda `denied`) işaretlenir; eşik aşımında token ailesi iptal edilebilir.

### 8. Generative UI — tanım ve MVP kapsamı
- **Tanım:** Model, kullanıcı isteğine yanıt olarak serbest metne ek olarak sürümlü bir JSON Schema'ya (`genui/v1`) uyan bir **UI tanımı** üretir; bu tanım, `packages/ui-kit` içindeki **kapalı bileşen kataloğundan** seçilmiş bileşenlerin düzenini ve veri bağlamasını tarif eder. Yerel uygulama tanımı şema ile doğrular (ör. ajv), geçersizse yalnızca metni gösterir; geçerliyse önceden derlenmiş Vue bileşenleriyle render eder.
- **Veri bağlama:** Bileşenler sayıları modelden değil, **araç sonucu referansından** alır (`dataRef: "<toolCallId>#/path"`); model yalnızca bileşen türü, başlık, sütun seçimi, sıralama ve biçim seçer. Böylece gösterilen rakamlar kaynak veriyle aynıdır (halüsinasyon yüzeyi daralır).
- **Güvenli render kuralları:** ham HTML/JS/CSS yok; `v-html` yok; metin yalnızca düz metin veya HTML'siz kısıtlı markdown; bağlantılar yalnızca uygulama içi rota allowlist'i; renkler yalnızca token adları (hex yok); sınırlar: en fazla **20 bileşen**, iç içe derinlik **3**, tablo **500 satır**, grafik **1.000 nokta**.
- **MVP kataloğu (6 bileşen):** `StatGroup/KpiCard`, `DataTable` (sıralama, sayfalama), `Chart` (çizgi/çubuk; mevcut ECharts bağımlılığı), `Alert/StatusList` (önem derecesi), `EntityCard` (ürün/sipariş özeti), `Text`. Yazma araçlarıyla birlikte eklenecek: `ActionPreview` (değişiklik önizleme + onay butonu).
- Aynı bileşenler web uygulamasında da kullanılabilir (aynı token dili — ADR-0007).

### 9. İlk 5 MCP aracı (salt-okunur, `mcp:read`)
| # | Araç | Girdi | Çıktı | Not |
|---|---|---|---|---|
| 1 | `get_integration_health` | — | her bağlı entegrasyon: durum, son başarılı sync zamanı, son 24 saat hata sayısı, son hata özeti | `IntegrationOperationLogs`; ilk uçtan uca komut adayı |
| 2 | `get_sales_summary` | `from`, `to` (≤ 90 gün), `channel?` | kanal bazında sipariş adedi, ciro, iade adedi | `DataTable` + `Chart` gösterimi |
| 3 | `list_orders` | `status?`, `channel?`, `from/to?`, `limit ≤ 100`, `cursor?` | sipariş özeti; müşteri PII maskeli | C7 sipariş sync düzeltmesinden sonra güvenilir |
| 4 | `get_low_stock_products` | `threshold` (varsayılan 5), `limit ≤ 100` | eşik altı SKU'lar, kanal bazında yayınlanan stok | zero-oversell modelindeki "stok − rezerve" değerini kullanır (ilgili ADR) |
| 5 | `search_products` | `query`, `limit ≤ 50` | ürün/varyant: SKU, ad, fiyat, stok, kanal eşleşme durumu | serbest metin alanları `untrusted` |

Her araç için Faz 4 DoD: şema testi, RBAC reddi testi, **iki tenant izolasyon testi** (A'nın token'ı ile B'nin verisi dönmez), rate limit testi, audit kaydı testi. Yazma araçları (fiyat/stok güncelleme, toplu Excel içe aktarma) ayrı bir sonraki adımda ve §3b kurallarıyla.

## Gerekçe
- **Maliyet bilinci:** Remote MCP mevcut Express sürecine eklenen bir rota ve mevcut Redis/Mongo'yu kullanır — yeni servis, yeni süreç, ek barındırma yok. stdio köprüsü veya ikili topoloji, tek haneli ölçekte ikinci bir dağıtım/güncelleme/test hattı demektir ve güvenlik kontrollerini çoğaltır.
- Güvenlik standardının (skill) tüm maddeleri — sunucu tarafı allowlist/RBAC, rate limit, idempotency, audit — yalnızca sunucuda güvenilir biçimde uygulanabilir; remote topoloji bunu doğal kılar ve spesifikasyonun OAuth 2.1 modeliyle birebir örtüşür (stdio'da OAuth yok).
- BYO model + yerel agent döngüsü LLM maliyetini sıfırlar ve model anahtarı saklama sorumluluğunu sunucudan kaldırır.
- Salt-okunur başlangıç, C1–C4 sınıfı hatalar yeni kapatılmışken riskin en düşük olduğu yoldur; en değerli günlük soruları (sağlık, satış, sipariş, düşük stok, ürün arama) yanıtlar.
- Şema-tabanlı Generative UI, HTML enjeksiyonu yüzeyini tamamen ortadan kaldırır ve premium görsel dili (Protokol 6) model çıktısından bağımsız garanti eder.

## Maliyet/Ölçek Notu
- **Ek maliyet:** yeni bağımlılık `@modelcontextprotocol/sdk` (backend) ve istemci tarafı MCP istemcisi; JSON Schema doğrulayıcı. LLM maliyeti yok (BYO). Redis'te rate-limit anahtarları, Mongo'da audit + idempotency koleksiyonları (TTL'li).
- **Ek operasyon:** araç şema manifestinin sürümlenmesi; audit log boyutu (tek haneli ölçekte ihmal edilebilir).
- **Yeniden değerlendirme eşikleri:**
  - MCP `tools/call` p95 gecikmesi 7 günlük pencerede **2 sn'yi** aşarsa **veya** MCP trafiği backend CPU süresinin **%30'unu** geçerse → MCP'nin ayrı süreç/servis olarak ayrılması ADR'si.
  - En az **3 ödeyen müşteri** harici bir MCP istemcisiyle (Claude Desktop, ChatGPT vb.) bağlanmayı talep ederse → üçüncü taraf istemci kaydı (Client ID Metadata Documents/dinamik kayıt) ve onay ekranı; bu istemciler remote HTTP desteklemiyorsa ancak o zaman stdio köprüsü değerlendirilir.
  - Çağrıların **%5'inden fazlası** 429 alıyorsa → rate limit değerleri gözden geçirilir.
  - Salt-okunur araçlar **30 gün** boyunca cross-tenant/RBAC ihlali içeren sıfır audit bulgusuyla çalıştıktan sonra ilk yazma araçları (önizle→onayla) açılır.
  - Mobil PWA'dan aylık aktif kullanıcı **%30'u** geçerse → mobilde güvenli anahtar saklama (native mobil, ADR-0007 eşiğiyle birlikte) ile AI sohbeti değerlendirilir.
  - Katalog dışı bileşen ihtiyacı nedeniyle Generative UI tanımlarının **%10'undan fazlası** şema doğrulamasında reddediliyorsa → katalog genişletme (yeni bileşen) değerlendirilir; serbest HTML yine yasaktır.

## Etki Alanı
- `backend/`: yeni `src/mcp/` (uç nokta, araç kaydı, RBAC filtresi, rate limit, audit, idempotency), OAuth metadata uç noktaları (ADR-0010 token servisiyle — ADR-0001'in genişletmesi), `Webserver.ts` rota montajı; araçların çağırdığı servisler (`order`, `product`, `variant`, `integration`) — bu servisler değiştirilmeden önce characterization testleri (Protokol 13).
- `desktop/` (ADR-0007): MCP istemcisi, agent döngüsü, model sağlayıcı ayarları, keychain, yerel dosya aracı, GenUI render alanı.
- `packages/ui-kit`: `genui/v1` JSON Schema + katalog bileşenleri.
- Audit log standardı (INTEGRATION_ENGINE_STANDARDS §14), ADR-0008 (`mcpCallsPerDay`, abonelik durumu).
- Ön koşul kalemleri: BACKLOG C1, C2, C3, C4 (MCP açılmadan önce kapalı), C7 (`list_orders` güvenilirliği), C8 (`get_low_stock_products` doğruluğu).

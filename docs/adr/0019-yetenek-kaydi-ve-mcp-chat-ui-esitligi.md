# 0019 — Yetenek Kaydı (Capability Registry): UI, MCP ve Ajan Yüzeyleri İçin Tek Gerçek Kaynak + Chat-as-UI Eşitliği

## Durum
Kabul edildi (2026-09-28).

**Tetikleyen:** Proje sahibinin 2026-09-28 yönergesi. Chat-as-UI için hazırlanacak MCP sürdürülebilir olmalı. Önyüze eklenen her yetenek MCP tarafına da yansımalı; karmaşa ve eksik kalma olmamalı.

**Bu ADR'nin diğer ADR'lerle ilişkisi:**
- **ADR-0009 §2 ve §9'u değiştirir.** Orada `backend/src/mcp/tools/` altında ayrı bir araç kaydı öneriliyordu. Bu kayıt artık kurulmaz. MCP araçları bu ADR'nin Yetenek Kaydı'ndan türetilir. ADR-0009'daki ilk 5 aracın adları §4.3'teki adlandırma standardına göre yeniden adlandırılır. Bu araçların kodu henüz yok: `backend/src/mcp/` dizini bulunmuyor, dolayısıyla göç maliyeti sıfır.
- **ADR-0009'un kalan kuralları aynen geçerlidir:** güvenlik, OAuth, rate limit, audit, BYO model, GenUI kapalı katalog.
- **ADR-0001 Karar 7–9 (`OPERATION_POLICY`) davranışını değiştirmez.** Politika tablosu bu kayıttan türetilen bir görünüme dönüşür. Dışa açık API aynı kalır: `getRequiredTier`, `OPERATION_POLICY`, `OPEN_OPERATIONS`.
- **ADR-0015 Karar 2.4/2.5 ve B4'e bağlayıcı bir kural ekler** (§6). `screens.ts`'teki `actions` alanı, ADR-0015 satır 259'da komut paleti için öngörülmüştü. Bu alan yetenek kimliklerine bağlanır.
- **ADR-0018 ile uyum:** ADR-0018 hiçbir dalda henüz yok. ADR-0017 onu "entegrasyon uyum izleme + ajan-hazır altyapı" olarak anıyor (`docs/adr/0017-…`, `worktree` dalı `08091f3`, satır 122, 141, 143). ADR-0018'in "araç kaydı / ajan araç yüzeyi" ayrı bir kayıt **olamaz**. Ajanların kullanabileceği araçlar, bu kayıttaki `agent` alanıyla işaretlenmiş yeteneklerdir (§4.1). ADR-0018 bu ADR'ye referans verir, çift kayıt açmaz.
- **ADR-0016 hiçbir dalda bulunamadı.** Bu ADR ona bağımlılık kurmaz.
- **ADR-0017 henüz birleşmedi**, bir worktree dalında duruyor. Bu ADR'deki gözlemlenebilirlik maddeleri ona göre yazıldı. ADR-0017 birleşmeden önce değişirse ADR-0017 esas alınır.

**Protokol 12 durumu:** Bu ADR'nin varsayılanları ücretli servis, hesap, gerçek para ya da production deploy gerektirmez. İnsan kararı gereken 4 nokta §10'dadır. Hepsinin varsayılanı vardır ve fabrikayı durdurmaz.

**Refactor, yeniden yazım değil:** `operationPolicy.ts` ve `RunOperation.ts` yeniden yazılmaz. Politika nesnesi bir türetme fonksiyonunun çıktısı olur ve mevcut testler aynen yeşil kalır (§7-A çıkış kapısı). `adr-writing` yeniden yazım kuralı tetiklenmez.

## Bağlam

### Kanıt: yetenekler bugün 3–4 yerde dağınık ve elle senkronize ediliyor (2026-09-28, `faz3-arayuz` @ 389a72b)

| # | Kaynak | Ne tutuyor | Kanıt |
|---|---|---|---|
| K1 | `backend/src/api/operationPolicy.ts` | (servis, operasyon) → kademe. Varsayılan ret. Gerekçe yorum satırında, ayrıntı `docs/OPERATION_POLICY.md`'de. | `operationPolicy.ts:29-152`. Belge "156" diyor (`OPERATION_POLICY.md:17`). Gap analizindeki mekanik sayım 158 (`FRONTEND_GAP_ANALYSIS.md:9`), bu çalışmadaki kaba regex sayımı 159. **Kanonik bir sayı yok.** Bu da elle tutulan tablonun zayıflığını gösteriyor. |
| K2 | `docs/OPERATION_POLICY.md` | Aynı tablonun elle kopyası: gerekçe ve "Belirsiz" sütunu (15 kalem) | `OPERATION_POLICY.md:3`: "asıl kayıt koddur; değişiklik = `operationPolicy.ts` + bu dosya". İki yere elle yazılıyor. |
| K3 | `backend/tests/characterization/auth/operation-policy.test.ts` | **Bugünkü tek kayma bekçisi:** FE'deki `'Servis/op'` literal taraması ↔ kayıt | `:114-121` `FE_CALLS_WITHOUT_BACKEND` (12 kalem), `:101-108` `BACKEND_ONLY_NOT_YET_IN_FE` (5), `:82-90` elle çözülmüş dinamik çağrı dosyaları (7), `:352-370` iki yönlü eşitlik. Yalnızca "FE çağırıyor ↔ backend izin veriyor" çiftini bekler. **Ekran, MCP ve ajan boyutu yok.** |
| K4 | `frontend/src/navigation/screens.ts` | Ekran ↔ URL (slug, `urlParams`) | `:38-47` `ScreenDefinition`. Yetenek ya da eylem bağı yok. `:103` `mcp` URL segmenti zaten ayrılmış. |
| K5 | ApplicationDB `menus` + ADR-0015 `menuSource:'registry'` + `minRole` | Menü görünürlüğü | ADR-0015 `:233`. `minRole` "yalnızca görünürlük ipucu", kaynağı elle yazılıyor ve backend kademesiyle bağı yok. |
| K6 | `frontend/src/composables/restapi.ts` + ~40 dosyada literal çağrı | Çağrı biçimi `restApi.post('OrderService/approveOrder', …)`. Tipsiz. | `restapi.ts:190`. Test regex'i: `operation-policy.test.ts:131-132`. |
| K7 | ADR-0009 §2 (önerilen, yazılmamış) | Ayrı MCP araç kaydı `{name, version, description, inputSchema, outputSchema, scope, roles[], mutating, piiLevel, rateCost}` | ADR-0009 `:41`. Yazılırsa **dördüncü** kaynak olur. |
| K8 | ADR-0018 (planlanan) | "Ajan araç yüzeyi" | ADR-0017 `:122`. Ayrı kurulursa **beşinci** kaynak olur. |

**Sonuç:** Bugün yeni bir yetenek eklemek için 3 elle senkron adım gerekiyor: kayıt, belge ve FE literal'i. Faz 4 bunlara iki adım daha ekleyecek: MCP aracı ve ajan izni. "Önyüze eklendi ama MCP'de unutuldu" durumunu yakalayan hiçbir mekanizma yok. Yönergenin istediği tam olarak bu boşluğun kapatılması.

### Diğer bağlayıcı girdiler
- **Master prompt Faz 4** (`ENTEGRASYONIK_MASTER_PROMPT.md:123-128`):
  - MCP server Protokol 11'in tamamını uygular.
  - Kullanıcı kendi modelini bağlar; yerel dosya okunur; Generative UI vardır.
  - DoD: "MCP araç listesi belgelenmiş ve test edilmiş, allowlist/audit trail çalışıyor, iki tenant birbirini görmüyor".
- **Skill `mcp-security-standards`** (`SKILL.md:13-16`): "Tool tanımları backend'de **merkezi bir yerde** tutulur, rol bazlı filtre MCP server katmanında uygulanır (istemci güvenilmez)". Ayrıca durum değiştiren her çağrıda idempotency key, audit, rate limit, prompt-injection = veri (`:18-35`).
- **ADR-0010** (`:43`):
  - `aud: mcp` token'ı yalnızca `/mcp`'de geçerlidir.
  - OAuth token'larında `ga`/`imp` yoktur. Dolayısıyla `platformAdmin` yetenekleri MCP'den **teknik olarak** çağrılamaz.
- **ADR-0008** (`:44`, `:72`): plan `features[]` (`einvoice`, `erp`, `shipping`, `mcp`, `desktopApp`) ve `mcpCallsPerDay` tanımlı. Tek uygulama noktası `EntitlementService`'tir (API guard + Engine + MCP).
- **ADR-0007** (`:38`, `:54`):
  - Masaüstü, `packages/ui-kit`'i paylaşan ince bir Vue kabuğudur.
  - PWA'da AI sohbeti yoktur.
  - Çevrimdışı modda son yanıtlar önbellekten gösterilir, yazma kuyruğu yoktur.
- **ADR-0017** (worktree dalı; `:75`, `:96`, `:122`):
  - `X-Request-Id` + AsyncLocalStorage correlation.
  - `MetricsRegistry`.
  - `JobRuns.runType: 'agent'` genişleme noktası.
  - zod, §10'da planlanan bağımlılıktır.
- **`docs/PLATFORM_BASELINE.md`:** B1 (sunucu RBAC), B3 (şema-tabanlı doğrulama), B7 (denetim), D2 (mandallar), D5 (API sözleşmesi, OpenAPI), E1 (entitlement), E6 (genişleme noktaları).

### Dış araştırma (web, 2026-09-28; süzgeç: Entegrasyonik kimliği)

| Konu | Bulgu (kaynak) | Karar |
|---|---|---|
| MCP araç şeması | 2025-11-25 ve **2026-07-28** revizyonları: `name`, `title`, `description`, `inputSchema` (JSON Schema 2020-12; parametresiz araçta `additionalProperties:false` önerilir), `outputSchema` + `structuredContent`, `annotations`. Girdi doğrulama hataları protokol hatası olarak değil, `isError:true` tool execution error olarak döner, böylece model kendini düzeltebilir (modelcontextprotocol.io/specification/2025-11-25/server/tools, 2026-07-28 changelog SEP-1303, SEP-2106). | **Benimse.** Şemalar kayıttaki zod'dan üretilir (zod 4 yerel `toJSONSchema`, MIT, 4.6.5). |
| Annotations | `readOnlyHint`, `destructiveHint` (varsayılan true), `idempotentHint`, `openWorldHint` (varsayılan true). Hepsi **ipucudur** ve güvenilmeyen sunucudan geliyorsa istemci bunlara göre karar vermemelidir (schema, ToolAnnotations). | **Benimse, ama güvenlik aracı olarak değil.** Annotations kayıttaki `effect` alanından **türetilir** ve elle yazılamaz. Asıl yetki sunucudadır. |
| Araç adı | Spec (SEP-986): 1–128 karakter, `A-Z a-z 0-9 _ - .` izinli. **Ancak** kullanıcının kendi modeline (BYO, ADR-0009 §5) giden sağlayıcı API'si `^[a-zA-Z0-9_-]{1,128}$` ister, **nokta yasaktır** (docs.claude.com tool-use). Aynı kaynak servis önekli ad alanı öneriyor (`github_list_prs`). | **Uyarla.** Kayıt kimliği noktalıdır (`orders.approve`). MCP adı bundan deterministik türetilir (`orders_approve`, `^[a-z][a-z0-9_]{2,63}$`). |
| Araç sayısı | Model araç seçimi **30–50 aracın üstünde bozuluyor** (docs.claude.com tool-search-tool). GitHub MCP sunucusu "toolsets" + varsayılan küme + salt-okunur mod kullanıyor ve "yalnızca gereken toolset'i açmak seçimi iyileştirir" diyor (github/github-mcp-server README). | **Benimse:** toolset'ler + görünür araç bütçesi (§4.3). |
| tools/list değişkenliği | 2026-07-28 revizyonunda liste **bağlantıya göre değişemez**, ama **isteğe eklenen yetkilendirmeye göre değişebilir**. Deterministik sıra önerilir (önbellek ve prompt-cache için). `ttlMs`/`cacheScope` zorunlu. | **Benimse.** Rol, plan ve `cid` filtresi token'dan gelir. Toolset seçimi istemci tarafındadır (§4.3). Sıra kimliğe göre alfabetik. |
| Durumsuzluk / MRTR | 2026-07-28: `initialize` ve oturum kaldırıldı. Sunucudan başlatılan `elicitation/create` yerine **Multi Round-Trip Request** geldi: `InputRequiredResult` → istemci aynı isteği `inputResponses` ile yeniden gönderir. Form elicitation'ında **sır istemek yasaktır** (URL modu zorunlu). | **Benimse.** Yazma onayı bu kanalla, spec sürümünden bağımsız bir adaptörle yapılır (§5.3). Kimlik bilgisi yazma yetenekleri MCP'ye açılmaz (§4.2). |
| Taşıma / yetki | Streamable HTTP; Origin geçersizse 403; OAuth 2.1 + PKCE, RFC 9728/8707; stdio'da OAuth yok (1f-findings §6; 2025-11-25 changelog). | **ADR-0009/0010 aynen geçerli.** Remote `/mcp`, stdio köprüsü yok. |
| OpenAPI→MCP otomatik üretimi | Her uç noktayı 1:1 araca çeviren yaklaşım, 150+ düşük anlamlı ve LLM'e göre adlandırılmamış araç üretir. Bizim RPC'miz (`/:service/:operation`) REST de değil. | **Reddet** (1:1). **Uyarla:** "tek şemadan birden çok çıktı" fikri kayıttan üretimle karşılanır. |
| tRPC / ts-rest / oRPC | Router ve şema tek kaynaktan tip üretir, ama 156 operasyonun taşıma katmanını yeniden yazmayı ve backend'i workspace'e almayı (ADR-0007 `:50` bunu dışarıda bırakıyor) gerektirir. | **Reddet** (maliyet, yeniden yazım riski). Fikir aynı: şema kodda, tipler türetilir. |
| MCP Apps (SEP-1865, resmi uzantı) | Araç `_meta.ui.resourceUri` ile `ui://` HTML kaynağına işaret eder, host bunu sandbox iframe'de render eder (modelcontextprotocol.io/extensions/apps). | **Şimdilik reddet:** Birinci taraf istemcimiz ADR-0009 §8'deki kapalı JSON kataloğunu kullanır. HTML yüzeyi yok. **Eşikli uyarla (§8):** harici istemci desteği açılırsa, **model üretmediği**, `packages/ui-kit`'ten derlenmiş statik `ui://` şablonları değerlendirilir. |
| AG-UI / CopilotKit, Vercel AI SDK UI | Olay akışlı ajan↔UI protokolü ve React ağırlıklı "tool result → bileşen" kalıbı. | **Kütüphane olarak reddet:** ek çalışma zamanı getirir; model çağrısı ADR-0009 §5'e göre Rust'ta, kabuk Vue'da. **Kalıp olarak benimse:** "araç sonucu tipi → tek sunum bileşeni" eşlemesi, kayıttaki `present` alanıyla (§5.4). |
| Stripe / Linear tarzı küratörlü MCP | Az sayıda, iş odaklı, iyi açıklanmış araç + eylem bazlı açma/kapama. | **Benimse:** küratörlü açma (`mcp.exposed` açık karar). Toplu ve tekli varyantlar tek yetenekte birleşir. |

## Değerlendirilen Alternatifler

### A. Tek kaynak nerede ve hangi biçimde?
1. **Backend'de TypeScript kodu + zod şemaları (Yetenek Kaydı), diğer her şey ondan türetilir.**
   - Artı:
     - Derleyici "unutulmuş karar"ı yakalar: ayrımlı birleşim (discriminated union) tipinde `mcp` ve `ui` alanları zorunludur.
     - Mevcut `OPERATION_POLICY` ve `RunOperation` ile aynı süreçte, aynı dilde durur.
     - MCP sunucusu zaten backend'de (ADR-0009).
     - zod, ADR-0017 §10'da zaten planlanmış bir bağımlılık.
     - Yeni servis yok.
   - Eksi:
     - Backend workspace dışında (ADR-0007). FE'ye bir **üretilmiş dosya** ile ulaşılır ve bu dosyanın güncelliği bir kayma testiyle korunur.
2. **OpenAPI/YAML-first.**
   - Artı: araç ekosistemi.
   - Eksi:
     - Koddan ayrı ikinci bir dil.
     - Jenerik RPC'ye uymuyor.
     - 1:1 araç üretimi LLM için kötü sonuç verir.
     - Kaymayı yine bir testle bekletmek gerekir.
   - **Reddedildi.**
3. **tRPC/ts-rest'e taşıma.**
   - Eksi: 156 operasyonun taşıma katmanı ve FE çağrılarının hepsi değişir. Bu, Protokol 13'e göre karakterizasyon yükünün en ağır olduğu yoldur.
   - **Reddedildi.**
4. **Ayrı kayıtları koru, yalnızca çapraz testlerle bağla** (bugünkü K3 deseninin genişletilmesi).
   - Artı: en az değişiklik.
   - Eksi: 4–5 kaynak kalır. Her yeni yüzey (MCP, ajan, genel API) yeni bir çapraz test gerektirir. "Neden `notExposed`" bilgisinin yazılacağı bir yer olmaz.
   - **Reddedildi.**
5. **DB'de tutulan kayıt** (`menus` gibi).
   - Eksi: tip denetimi yok; her değişiklik göç + yedek şartı (CLAUDE.md kural 3) gerektirir. ADR-0015 Alt. F'nin gerekçesi burada da geçerli.
   - **Reddedildi.**

### B. MCP yüzeyi nasıl oluşur?
1. **Her operasyon otomatik olarak araç olur** (OpenAPI→MCP tarzı).
   - Eksi:
     - 150+ araç, seçim doğruluğu 30–50 aracın üstünde düşer.
     - `platformAdmin`, kimlik bilgisi yazma ve UI iç işleri (favori sıralama) da açığa çıkar.
   - **Reddedildi.**
2. **Tek jenerik `call_operation` meta-aracı.**
   - Eksi: ADR-0009 "jenerik RPC MCP'den erişilemez" kuralını çiğner; şemasız çağrı yapılır; prompt-injection yüzeyi büyür.
   - **Reddedildi.**
3. **Küratörlü açma: her yetenek MCP için açık bir karar taşır** (`exposed` ya da gerekçeli `notExposed`). Tekli ve toplu varyantlar tek yetenekte birleşir. Toolset + görünür araç bütçesi uygulanır. **SEÇİLEN.**

### C. Chat sonucunun sunumu
1. **Model HTML üretir / MCP Apps HTML.**
   - Eksi: XSS ve enjeksiyon riski. ADR-0009 §8 bunu reddetti.
   - Birinci taraf için **reddedildi**. Harici istemciler için eşikli (§8).
2. **Kapalı JSON kataloğu (ADR-0009 §8) + kayıttaki sunum ipucu (`present`).** Katalog bileşenleri ADR-0015'teki `Ek*` bileşenleridir. **SEÇİLEN.**
3. **Yalnızca metin.**
   - Eksi: tablo ve KPI verisi zayıf kalır, ekranla eşitlik sağlanmaz.
   - **Reddedildi.**

### D. Parite kapısı
1. **Yalnızca PR kontrol listesi** (insan dikkati).
   - Eksi: "unutma" tam olarak dikkat hatasıdır.
   - **Tek başına reddedildi.**
2. **Tip sistemi + üretim + jest parite testi + artamayan mandallar** (ADR-0015 6.4 ve K3 ile aynı desen). PR kontrol listesi bunu tamamlar. **SEÇİLEN.**

## Karar

**Entegrasyonik'in her kullanıcı yeteneği backend'de bir kez tanımlanır:** `backend/src/capabilities/` altında zod şemalı bir TypeScript kaydı olarak. Aşağıdakilerin hepsi bu kayıttan **türetilir** ya da kayda karşı **test edilir**:
- `OPERATION_POLICY` (yetki / varsayılan ret),
- FE tipli istemci ve kimlikleri,
- `screens.ts` eylem bağları,
- MCP araç manifesti ve adaptörü,
- ajan araç listesi (ADR-0018),
- belge.

Her yetenek şu üç kararı **zorunlu** olarak taşır: UI eşlemesi (`ui`), MCP kararı (`mcp: exposed | notExposed(gerekçe)`) ve ajan kararı (`agent`). Kararın eksik kalması derleme hatasıdır. Yüzeyler arası tutarlılık, CI'daki **parite kapısı** (§3) ve artamayan mandallarla korunur.

Chat-as-UI, ekranla **aynı yeteneği aynı yürütücüden** çağırır. Sonucu aynı `Ek*` bileşenleriyle gösterir ve ekrana derin bağlantı verir. Yazma işlemleri yalnızca kullanıcının modelin erişemediği bir kanaldan verdiği açık onayla yürür.

### 1. Yetenek Kaydı — şema (taslak; ad/konum sözleşmedir, iç ayrıntı uygulayıcıya aittir)

**Konum:**
- `backend/src/capabilities/`
  - `types.ts`, `define.ts`
  - `domains/<alan>.ts` (alan başına bir dosya: `catalog`, `orders`, `claims`, `customers`, `messages`, `invoices`, `shipments`, `finance`, `integrations`, `reports`, `account`, `billing`, `support`, `platform`, `local`)
  - `index.ts` (kayıt + değişmezler)
  - `derive/*` (türetme)
  - `invoke.ts` (tek yürütücü)

```ts
type Effect = 'read' | 'propose' | 'write' | 'destructive';
type Tier = 'member' | 'admin' | 'owner' | 'platformAdmin';           // operationPolicy.ts:13 ile aynı tip (oradan re-export)
type NotExposedReason =
  | 'ui_plumbing'      // kabuk/menü/favori/tercih — kullanıcının işi değil, uygulamanın iç işi
  | 'platform_admin'   // ga yetkisi; OAuth token'ında ga yok (ADR-0010:43) → MCP'de çağrılamaz
  | 'credential'       // sır/kimlik bilgisi okuma-yazma; LLM kanalından geçemez (MCP form elicitation'da sır yasak)
  | 'irreversible'     // geri alınamaz/hukuki (tenant silme, anonimleştirme) — yalnız ekranda, yeniden kimlik doğrulamayla
  | 'binary_file'      // görsel/dosya yükleme — yerel araç + mevcut yükleme API'si üzerinden (ADR-0009 §6)
  | 'no_backend'       // yalnız-UI formu/henüz çalışmayan uç (dürüstlük, C7/E3)
  | 'deferred';        // bilinçli erteleme — `until: 'C'|'D'|…` ZORUNLU, mandalla sayılır
type Presentation = 'table' | 'kpi' | 'entity' | 'status' | 'chart' | 'text' | 'preview';

interface CapabilityDef<I, O> {
  id: `${string}.${string}`;               // 'orders.approve' — kararlı; silinen kimlik asla yeniden kullanılmaz
  version: `${number}.${number}`;          // şema sürümü (§4.1)
  domain: Domain;
  summary: { tr: string; en: string };     // insan/UI/belge için tek cümle
  llm?: {                                   // mcp.exposed ise ZORUNLU (tip düzeyinde)
    description: string;                    // EN, 3–6 cümle: ne yapar, ne zaman kullanılır, ne zaman KULLANILMAZ, sınırlar
    examples: string[];                     // ≥2 doğal dil örneği (çoğu TR): "bugün onay bekleyen siparişleri göster"
  };
  input: ZodType<I>;                        // mcp.exposed ise strict (additionalProperties:false); tenantId/clientId/userContext/principal/order ALANI YASAK
  output: ZodType<O> | 'legacy';            // 'legacy' yalnız mcp.notExposed için izinli
  effect: Effect;
  minTier: Tier;                            // OPERATION_POLICY bundan türetilir
  entitlement?: { feature?: PlanFeature; access: 'read' | 'write' };   // EntitlementService (ADR-0008 §3) — tek guard
  scope: 'tenant' | 'user' | 'platform';    // tenant kimliği YALNIZCA doğrulanmış principal'dan (ADR-0001 Karar 5)
  idempotency: 'natural' | 'key' | 'n/a';   // effect write/destructive + mcp.exposed → 'key' ya da 'natural' zorunlu
  external: boolean;                        // pazaryeri/3. taraf çağırır mı (→ openWorldHint)
  rateCost?: number;                        // varsayılan 1 (ör. dışa aktarma 10)
  audit?: 'always';                         // write/destructive zaten denetlenir; okuma için yükseltme
  pii: 'none' | 'masked' | 'raw';           // mcp.exposed → 'raw' YASAK (ADR-0009 §5 maskeleme)
  untrustedPaths?: string[];                // çıktıda serbest metin alanları (ürün adı, müşteri notu) → "veri, talimat değil"
  undo: { kind: 'none' } | { kind: 'compensate'; with: CapabilityId } | { kind: 'softDelete'; days: number };
  executor: 'server' | 'desktop';           // desktop = yerel araç (dosya seçimi vb.), sunucu çalıştırmaz
  bindings: Array<{ rpc: `${string}/${string}`; map?: (input: I) => unknown }>;  // server ise ≥1; her RPC op TAM OLARAK bir yeteneğe bağlı
  ui: { screens: Array<{ screen: ScreenKey; action?: string }> } | { none: { reason: string } };
  mcp:
    | { exposed: { toolset: Toolset; confirm: 'none' | 'confirm' | 'typed'; present: Presentation; deepLink?: DeepLinkSpec } }
    | { notExposed: { reason: NotExposedReason; note: string; until?: Stage } };   // note ≥ 20 karakter
  agent: { allowed: false } | { allowed: true; maxEffect: 'read' | 'propose' };  // ADR-0018 ajanları
  review?: string;                          // bugünkü "Belirsiz = EVET" notları (OPERATION_POLICY.md:28-46) buraya taşınır
  deprecated?: { since: string; replacement?: CapabilityId; removeAfter: string };
}
```

**Temel kurallar:**
- **Yetenek ≠ RPC operasyonu.** Bir yetenek kullanıcı için anlamlı bir iştir. Bir ya da daha fazla RPC operasyonuna bağlanabilir. Örneğin `orders.approve`, `OrderService/approveOrder` ve `bulkApproveOrder` operasyonlarını tek bir `orderIds: string[1..100]` girdisiyle kapsar.
- **Değişmez:** her `OPERATION_POLICY` girdisi **tam olarak bir** yeteneğin `bindings` listesindedir. Kayıtsız operasyon varsayılan olarak reddedilir. Bu davranış değişmez.
- **Bağlama noktaları:**
  - `OPEN_OPERATIONS` (login/register/getCaptcha/logout) kayıt dışı kalır, `operationPolicy.ts:176` aynen.
  - `ImageApi` sözde-servisi `bindings.rpc: 'ImageApi/<rota>'` ile bağlanır. `IMAGE_API_TARGETS` aynen kalır.
- **Varsayılanlar güvenli yöndedir:**
  - `effect` elle yazılır. İçe aktarıcı yalnızca öneri üretir: `get*`/`retrieve*` → `read`, `delete*`/`remove*` → `destructive`, diğerleri → `write`, hepsi insan incelemesine işaretli.
  - Yeni yetenek `mcp.notExposed` ile başlar.
  - Açmak (`exposed`) ayrı ve bilinçli bir karardır. Açıldığında `llm`, strict şema ve sunum da zorunlu hale gelir.
- **Annotations elle yazılmaz, `effect` alanından türetilir:**
  - `read` → `readOnlyHint:true`
  - `write` → `readOnlyHint:false`, `destructiveHint:false`, `idempotentHint: idempotency !== 'n/a'`
  - `destructive` → `destructiveHint:true`
  - `openWorldHint = external`
  - `propose` (salt önizleme / dry-run) → `readOnlyHint:true`

### 2. Tek yürütücü ve türetme hattı

**`invokeCapability(ctx, id, input, surface)` sırası:**
1. Kayıttan bul (yoksa 403).
2. `input` zod doğrulaması. Hata olursa MCP'de `isError:true` + eyleme dönük ileti, UI'da 400.
3. Kademe: **aynı** `resolveTier` / `isAllowed` fonksiyonları (`operationPolicy.ts:214-229`).
4. Entitlement.
5. Rate limit (`rateCost`).
6. Yazma işleminde idempotency ve onay doğrulaması (§5.3).
7. `bindings` üzerinden mevcut `RunOperation.execute` yolu. Tenant yalnızca `userContext.order`'dan gelir (`RunOperation.ts:46-53`).
8. `output` doğrulama + ayıklama (strip). Şemada olmayan alan dışarı çıkmaz.
9. PII maskeleme + `untrustedPaths` zarfı.
10. Denetim + metrik + correlation.

**UI yolu:** `/api/:service/:operation` jenerik RPC'si **aynen kalır** (`ApiManager.ts:125`). Kademe tablosu artık kayıttan türetilir. Aşama B'den itibaren yeni FE kodu `restApi.call('<yetenek-id>', input)` sarmalayıcısını kullanır. Bu sarmalayıcı aynı RPC'ye gider.

**MCP yolu:** yalnızca `invokeCapability` üzerinden, yalnızca `mcp.exposed` yetenekler için. Jenerik RPC'ye MCP'den erişim yoktur (ADR-0009).

**Türetilen çıktılar** (`npm run capabilities:gen`; güncellik `capabilities:check` testiyle zorunlu, üretilmiş dosyalar commit'lenir):

| # | Çıktı | Tüketici |
|---|---|---|
| a | `OPERATION_POLICY` nesnesi, **bellekte türetilir** (`operationPolicy.ts` onu `derivePolicy(REGISTRY)` ile dışa verir) | `RunOperation.authorize` (`RunOperation.ts:32-37`) — değişmez |
| b | `frontend/src/generated/capabilities.ts`: kimlikler, `minTier`, `effect`, girdi/çıktı TS tipleri | `restApi.call`, `screens.ts` `actions`, komut paleti (ADR-0015 2.5), FE yetki ipucu |
| c | `backend/generated/mcp-manifest.json`: araç adı, açıklama, şemalar, annotations, toolset, sürüm, **SHA-256 özeti** (ADR-0009 §2 şema sabitleme) | `/mcp` adaptörü, masaüstü istemci (şema sabitleme uyarısı) |
| d | `docs/CAPABILITIES.md`: `docs/OPERATION_POLICY.md` tablosunun **yerine geçer** (gerekçe ve `review` notları dahil) + `docs/CAPABILITIES_CHANGELOG.md` | İnsan incelemesi, belge (D5/D6) |
| e | Ajan araç listesi (`agent.allowed` süzgeci) — ayrı dosya değil, (c) içinde `agent` bayrağı | ADR-0018 |
| f | OpenAPI 3.1: **şimdi üretilmez**, eşikte üretilir (§8, E6 genel API) | — |

`docs/OPERATION_POLICY.md` Aşama A sonunda üretilmiş `docs/CAPABILITIES.md`'ye yönlendiren tek satıra iner. Elle kopya tablo kalmaz (K2 kapanır).

### 3. Parite kapısı (CI'da zorunlu, mandal deseni)

`backend/tests/characterization/auth/capability-parity.test.ts`. Mevcut `operation-policy.test.ts` korunur ve **genişletilir**. Onun AST ve FE tarama yardımcıları yeniden kullanılır.

| Kural | Tanım | v1 (Aşama A) | Zorunlu (Aşama E) |
|---|---|---|---|
| P1 Bağ bütünlüğü | Her RPC operasyonu tam 1 yeteneğe bağlı; her bağ gerçek bir servis metodu (`operation-policy.test.ts:302-310` genişler); türetilen politika = Aşama A öncesi politikanın anlık görüntüsü | **hata** | hata |
| P2 FE çağrıları | FE'nin çağırdığı her `'Servis/op'` literal'i ve her `restApi.call('id')` bir yeteneğe çözülür. `FE_CALLS_WITHOUT_BACKEND` ve `BACKEND_ONLY_NOT_YET_IN_FE` listeleri **yalnızca küçülebilir** | **hata** (bugün de öyle) | hata |
| P3 MCP kararı | Her yetenekte `mcp` var (tip düzeyi); `notExposed.note` ≥ 20 karakter; `reason:'deferred'` → `until` zorunlu | **hata** (derleyici) | hata |
| P4 UI kararı | `ui.screens[].screen` → `screens.ts`'te var olan `key`; `ui.none.reason` dolu | uyarı | hata |
| P5 Ekran → yetenek | Her `SCREENS` kaydı ≥1 yetenek taşır (`actions`/`capabilities`); `menuSource:'registry'` ekranlarında `minRole` = ekranın birincil okuma yeteneğinin `minTier`'ı (görünürlük ipucu kayıttan gelir, elle yazılmaz) | uyarı | hata |
| P6 Yetim | `ui.none` + `mcp.notExposed` + `agent.allowed:false` birlikteyse "yetim" sayılır; sayısı `capability-baseline.json`'da, **artamaz** | uyarı (sayılır) | mandal |
| P7 MCP kalite | `exposed` için: `llm.description` 120–900 karakter; ≥2 örnek; strict girdi; liste araçlarında `limit ≤ 100` + `cursor`; `output ≠ 'legacy'`; `pii ≠ 'raw'`; ad regex'i ve tekilliği; toolset başına ≤ 15 araç; girdi şemasında `tenantId/clientId/order/userContext/principal` yok; `scope:'platform'` açılamaz; `effect ∈ {write,destructive}` → `confirm ≠ 'none'` | **hata** | hata |
| P8 Sözleşme uyumu | Manifest özeti değiştiyse: kırıcı değişiklik (zorunlu alan eklendi, alan silindi, tip daraldı) → yeni ana sürüm + `deprecated` kaydı; değişiklik günlüğünde karşılık yoksa kırmızı | uyarı | hata |
| P9 Eval | `exposed` ve `critical` işaretli her yetenek için ≥3 "doğal dil → araç" vakası (`capabilities/evals/*.json`). CI'da deterministik vekil ölçüm: BM25 benzeri sözcük sıralayıcı (ad + açıklama + örnekler), beklenen araç ilk 3'te olmalı; iki aracın açıklama benzerliği eşiği aşarsa çakışma uyarısı. **Gerçek LLM ile eval isteğe bağlıdır** (yerel model ya da kullanıcı anahtarı, CI dışı) | uyarı | hata (vekil) |
| P10 Yüzey eşitliği | `ui.screens` VE `mcp.exposed` olan her yetenek için sözleşme testi: sahte servisle aynı girdi UI yolundan (`run`) ve MCP yolundan (`invokeCapability`) çağrılır. Sonuç (sunum öncesi) ve yan etki çağrı dizisi **eşit** olmalı | — | hata (Aşama C'den) |

**Mandallar** (artamaz; düşüş `--write` ile kabul edilir; ADR-0015 6.4 ile aynı mekanizma):
- `orphanCount`
- `deferredCount`
- `feRawLiteralCalls` (FE'deki `'Servis/op'` literal çağrı sayısı, dosya başına)
- `FE_CALLS_WITHOUT_BACKEND.length`
- `BACKEND_ONLY_NOT_YET_IN_FE.length`

**PR kontrol listesi** (kullanılan barındırıcının MR/PR şablonuna ve `quality-gates` skill'ine eklenir):
```
Yetenek değişikliği: [ ] kayıt girdisi (id, effect, minTier, şemalar)  [ ] UI eşlemesi (screens.ts actions) ya da ui.none gerekçesi
[ ] MCP kararı (exposed + llm açıklama/örnek + eval) ya da notExposed gerekçesi  [ ] ajan kararı
[ ] testler (P1–P10 yeşil, RBAC reddi, 2 tenant izolasyonu)  [ ] capabilities:gen çalıştırıldı, CAPABILITIES_CHANGELOG girdisi
```

### 4. Sürdürülebilirlik kuralları

**4.1 Sürümleme ve kullanımdan kaldırma**
- `version` = `ana.alt`.
  - Eklemeli değişiklik (isteğe bağlı alan, yeni enum değeri *yalnızca çıktıda*) → alt sürüm.
  - Kırıcı değişiklik → ana sürüm.
- MCP'de kırıcı değişiklik **aynı adı değiştirmez**. Yeni kimlik açılır (`orders.list` → `orders.list.v2` → ad `orders_list_v2`). Eski yetenek `deprecated` işaretlenir:
  - Açıklamasının başına "DEPRECATED: use orders_list_v2" eklenir.
  - `removeAfter` ≥ **90 gün** ya da **2 masaüstü sürümü** (hangisi uzunsa).
  - `tools/list` `ttlMs` ve `listChanged` ile istemci bilgilendirilir.
- Masaüstü istemci manifest özeti değiştiğinde kullanıcıyı uyarır. Yeni aracı onay olmadan modele vermez (ADR-0009 §2).
- **Değişiklik günlüğü otomatiktir:** `capabilities:gen` önceki manifestle farkı hesaplar ve `docs/CAPABILITIES_CHANGELOG.md`'ye tarihli bir blok ekler. Blok şunları listeler: eklenen, açılan, kaldırılan, kırıcı değişen ve yetki değişen yetenekler. Kademe değişiklikleri **her zaman** günlüğe yazılır, çünkü güvenlik incelemesi için gereklidir.

**4.2 Açma politikası** (neyin MCP'ye açılmayacağı, varsayılan):
- `platform_admin`: tamamı açılmaz. OAuth token'ında `ga` yoktur (ADR-0010).
- `credential`: entegrasyon kimlik bilgisi okuma ve yazma. Kullanıcı chat'te "Trendyol'u bağla" derse sonuç, ilgili ekrana derin bağlantıdır (§5.4). Sır LLM kanalına girmez.
- `irreversible`: tenant silme ve anonimleştirme.
- `ui_plumbing`: menü, favori, sıralama.
- `no_backend`: yalnızca UI'da olan kargo ve e-fatura formları. Dürüstlük gereği açılmaz.

**4.3 Adlandırma, ad alanı, toolset ve araç bütçesi**
- **Kimlik:** `alan.eylem[.nesne]`, küçük harf, İngilizce.
  - Örnekler: `orders.list`, `orders.approve`, `products.search`, `stock.low.list`, `integrations.health`, `reports.sales.summary`.
  - **MCP adı** = kimlikteki `.` yerine `_` (`^[a-z][a-z0-9_]{2,63}$`). Sağlayıcı regex'iyle uyumludur ve alan önekiyle gruplanır.
- **ADR-0009'daki ilk 5 araç yeniden adlandırılır:**

  | Eski ad (ADR-0009) | Yeni ad |
  |---|---|
  | `get_integration_health` | `integrations_health` |
  | `get_sales_summary` | `reports_sales_summary` |
  | `list_orders` | `orders_list` |
  | `get_low_stock_products` | `stock_low_list` |
  | `search_products` | `products_search` |

- **Toolset'ler** (alan kümeleri):
  - `core` (her zaman açık; bugünkü 5 araç),
  - `catalog`,
  - `orders` (sipariş, iade, sevkiyat, fatura),
  - `customers` (müşteri, mesaj),
  - `integrations`,
  - `finance`,
  - `account` (ayar ve kullanıcı okuma).
- **Sunucu güvenlik süzgecini uygular:** rol, plan özelliği, `aud`, `cid`. Bunlar token'dan gelir. 2026-07-28 spec'i bunu açıkça izinli kılar.
- **İstemci ilgililik süzgecini uygular:** kullanıcının masaüstü ayarındaki toolset seçimi. Açık araç sayısı 30'u aşarsa istemci içinde bir "araç arama" adımı devreye girer. Böylece sunucu durumsuz kalır ve `tools/list` bağlantıya göre değişmez.
- **Bütçe:**
  - varsayılan görünür küme ≤ **30** araç,
  - toolset başına ≤ **15**,
  - toplam açık araç hedefi ≤ **60**.
  - Tekli/toplu birleştirme ve CRUD ailelerinin tek "yönet" yeteneği değil, **iş odaklı** yeteneklere bölünmesi bu bütçeyi korur. Bugünkü ~156 operasyonun ~100–110 yeteneğe ineceği tahmin ediliyor (doğrulanmadı, Aşama A ölçer).

**4.4 Açıklama kalitesi**
- `llm.description` İngilizce yazılır, çünkü model seçimi için en güvenilir dil budur. İçeriği:
  - ne yapar,
  - ne zaman kullanılır,
  - ne zaman **kullanılmaz** (en yakın komşu araca yönlendirir),
  - sınırlar: limit, maskeleme, kapsam dışı kanallar.
- `llm.examples` çoğunlukla Türkçe gerçek kullanıcı cümleleridir.
- Kullanıcıya görünen metin (`summary.tr`, UI etiketleri) i18n'den gelir.
- P7 ve P9 kalite testleridir.
- Dürüstlük kuralı (C7): açıklama, desteklenmeyen bir kanalı ya da işlemi ima edemez. Örneğin "kargo oluşturur" demek için gerçek bir kargo backend'i olmalı (E3).

**4.5 Gözlemlenebilirlik (ADR-0017 ile)**
- **Correlation zinciri:**
  - Masaüstü her sohbet turu için bir `turnId` üretir.
  - MCP isteğinin `_meta`'sında W3C `traceparent` taşınır (2026-07-28, SEP-414).
  - `/mcp` girişinde ADR-0017 `X-Request-Id`/ALS bağlamı açılır ve `traceparent` ile ilişkilendirilir.
  - Aynı `corrId` `invokeCapability` → `RunOperation` → adaptör → `ResilientHttpClient` boyunca taşınır.
- **Metrik:** `capability_calls{capabilityId, surface: ui|mcp|agent, outcome}` + süre histogramı (ADR-0017 `MetricsRegistry`). Etiket kardinalitesi sınırlıdır (~110 × 3 × ~8).
- **Denetim:** `effect ∈ {write, destructive}` olan her çağrı ve MCP'deki her çağrı ortak `AuditLogs`'a yazılır. Kayıt alanları: `source: ui|mcp|agent`, `capabilityId`, `version`, redakte parametre özeti, sonuç, `corrId`. Bugün yalnızca AdminService yazma işlemleri denetleniyor (`RunOperation.ts:56-72`). UI yazma işlemlerinin denetime alınması B7'nin uygulanmasıdır ve Aşama B'de yapılır.
- **Ajan koşuları** (ADR-0018) `JobRuns.runType:'agent'` altında aynı `corrId` ile görünür.

### 5. Chat-as-UI mimarisi (yerel uygulama)

**5.1 Akış**
1. Kullanıcı niyeti (doğal dil).
2. Masaüstü agent döngüsü: kullanıcının modeli, istemci süzgecinden geçmiş araç listesi.
3. Araç seçimi.
4. `/mcp tools/call`.
5. Sunucuda `invokeCapability`: yetki, plan, rate limit.
6. Okuma işleminde doğrudan sonuç. Yazma işleminde **önizleme + onay isteği** (§5.3).
7. Kullanıcı modelin dışındaki bir UI'da onaylar.
8. Yürütme.
9. `structuredContent`.
10. Sunum (§5.4) + derin bağlantı.

**5.2 Ekran ↔ chat eşitliği (bağlayıcı)**
- Aynı iş, aynı yetenek kimliği ve aynı yürütücüyle yapılır. Sonuç aynıdır (P10).
- Chat yeni iş mantığı içeremez. Chat'e özgü bir "kolaylık" gerekiyorsa bu önce bir yetenek olarak kayda girer ve ekranda da yeri tartışılır.
- Her `exposed` yetenek ya bir ekrana eşlenir ya da `ui.none` gerekçesi taşır. Chat'te yapılıp ekranda yapılamayan iş ancak bilinçli ve gerekçeli olabilir.

**5.3 Onay, önizleme, geri alma**
- **`confirm:'confirm'`** (yazma):
  1. İlk çağrı yürütmez. `PendingAction` oluşturur. Kayıt alanları: kullanıcı, tenant, yetenek, sürüm, girdi özeti, 5 dk ömür ve tek kullanım.
  2. Önizleme (diff: "12 siparişin durumu Onaylandı olacak") ve onay isteği döner. 2026-07-28'de bu `InputRequiredResult` (MRTR), 2025-11-25'te `elicitation/create` form modudur. Sürüm farkı yalnızca adaptördedir.
  3. Masaüstü onayı `EkConfirmDialog` ile **kullanıcıya** gösterir. Model bu kanala erişemez (ADR-0009 §3b).
  4. İstemci yeniden çağırır. Sunucu `PendingAction` eşleşmesini (aynı kullanıcı, tenant, girdi özeti, süre) ve `idempotencyKey`'i (ADR-0009 `McpIdempotency`, 24 sa TTL) doğrular, sonra yürütür.
- **`confirm:'typed'`** (yıkıcı işlem, ileride): kullanıcı hedefi yazarak onaylar ("12 ürünü sil" → "SİL 12"). Yalnızca `undo.kind ≠ 'none'` olan yıkıcı yetenekler açılabilir. `irreversible` açılmaz.
- **Onay kanalı olmayan istemci** (onay bildirmeyen harici istemci): yazma araçları o istemcinin token'ı (`cid`) için **listelenmez**. Güvenli yönde başarısız olur.
- **Geri alma:** `undo.compensate` bir telafi yeteneğine işaret eder. Sonuç kartında "Geri al" düğmesi yalnızca bu durumda görünür, ADR-0015 toast "Geri al" deseniyle.

**5.4 Sunum: "tek iş = tek desen" chat'te de geçerli**
- GenUI kataloğu (ADR-0009 §8) **ADR-0015 `Ek*` bileşenlerinin** `packages/ui-kit`'teki salt-okunur sürümüdür. Ayrı bir bileşen ailesi kurulmaz.

  | ADR-0009 §8 bileşeni | `Ek*` karşılığı |
  |---|---|
  | `StatGroup/KpiCard` | `EkKpiRow`/`EkKpiCard` |
  | `DataTable` | `EkDataTable` (`server=false`, salt-okunur) |
  | `Alert/StatusList` | `EkStatusChip` + `status-map.ts` listesi |
  | `EntityCard` | kart içinde `EkDescriptionList` |
  | `Chart` | ECharts `entegrasyonik` teması |
  | `ActionPreview` | `EkConfirmDialog` gövdesi + diff listesi |
  | boş / hata / yükleniyor | `EkEmptyState` / `EkErrorState` (Destek kodu = `corrId`) / `EkSkeleton` |

- Biçimlendirme tek kaynaktan gelir: `format.ts`.
- **`present` alanı yeteneğin varsayılan desenini sabitler.** Model yalnızca sütun seçimi, sıralama ve başlık belirler. Sayılar `dataRef` ile araç sonucundan bağlanır (ADR-0009 §8).
- **Derin bağlantı:** `deepLink: { screen, params }`.
  - URL `screens.ts` `buildScreenPath` + `pickUrlParams` ile kurulur. Yalnızca kapalı enum ve teknik kimlik parametreleri kullanılır. ADR-0012'nin PII kuralı geçerlidir.
  - Masaüstünde web uygulaması sistem tarayıcısında açılır (Tauri opener, alan adı allowlist'i).
  - Chat özeti salt-okunurdur. Ayrıntılı ya da toplu çalışma için "Ekranda aç" birincil yoldur.

**5.5 Yerel uygulama ↔ bulut backend**
- **Kimlik:** ADR-0010 OAuth 2.1 + PKCE. `aud:mcp` yalnızca `/mcp` için, `aud:api` MCP dışı çağrılar için. Tenant yalnızca token'dan gelir. Hiçbir araç parametresi tenant taşımaz (P7).
- **Çevrimdışı:** MCP çağrısı yapılmaz. Chat "çevrimdışı" durumunu gösterir. Son başarılı okuma sonuçları "son güncelleme" etiketiyle IndexedDB'den gösterilebilir (ADR-0007). **Yazma kuyruğu yoktur.**
- **Yerel yetenekler** (`executor:'desktop'`, alan `local`, ör. `local.file.read_selected`) kayıtta **beyan edilir**:
  - Kimlik, şema ve effect tanımlıdır; tek katalog ve parite için gereklidir.
  - Sunucu bunları çalıştırmaz ve `tools/list`'te döndürmez.
  - Masaüstü bunları manifestten alıp kendi araç listesine ekler.
  - Kurallar ADR-0009 §6'daki gibidir: diyalogla seçilen dosya, tür ve boyut sınırı, tarama yok.

**5.6 Güvenlik katmanı** (`mcp-security-standards` maddeleri → uygulama noktası)
- **Allowlist/RBAC:** kayıttaki `mcp.exposed` + `minTier` + entitlement. `tools/list` süzülür. `tools/call` aynı kontrolü **yeniden** yapar.
- **Sır saklama:** model anahtarı masaüstü keychain'indedir (ADR-0009 §5). MCP yanıtlarında sır yoktur (`'sensitive'` sözleşmesi, B4). `credential` yetenekleri kapalıdır.
- **Prompt-injection:**
  - `untrustedPaths` alanları uzunluk sınırlı döner ve `_untrusted` listesiyle işaretlenir.
  - Masaüstü sistem prompt'u bu alanların veri olduğunu bildirir.
  - URL'ler otomatik açılmaz.
  - Dışarı veri gönderen yetenek (e-posta, webhook, HTTP) MCP'ye açılmaz. Açmak ayrı ADR gerektirir.
- **Çıktı temizleme:** zod `strip` + PII maskeleme + yanıt boyutu ≤ 256 KB (ADR-0009 §3).
- **Kill-switch üç kademelidir:**
  1. `MCP_ENABLED=false` (env; süreç başında): `/mcp` 503 döner.
  2. ApplicationDB `SystemFlags.disabledCapabilities` (60 sn önbellek; deploy gerektirmez): belirli yetenekleri tüm yüzeylerde kapatır. UI'da ortak "geçici olarak devre dışı" durumu gösterilir.
  3. Tenant düzeyi: entitlement override (ADR-0008) + token ailesi iptali (ADR-0010).
- **Rate limit:** ADR-0009 §3 değerleri (60/dk kullanıcı, 300/dk tenant, `mcpCallsPerDay`) × `rateCost`.
- **Denetim:** §4.5.

**5.7 LLM sağlayıcı ve KVKK**
- **Varsayılan: sunucu tarafında LLM yok** (maliyet sıfır, ADR-0009). Kullanıcı kendi modelini ya da yerel modeli (OpenAI-uyumlu uç) masaüstünde yapılandırır.
- Sunucu tarafı LLM yalnızca isteğe bağlıdır ve Protokol 12'ye tabidir (§10-S1).
- **Tenant verisinin dış LLM'e gidişi:**
  - Veri minimizasyonu: yalnızca şemadaki alanlar gider.
  - Son müşteri PII'si varsayılan olarak maskelenir (`pii` alanı; `raw` açılamaz).
  - İlk kurulumda aydınlatma ve rıza ekranı gösterilir (metin Protokol 12).
  - Sohbet geçmişi **yalnızca yerelde** tutulur, sunucuya gönderilmez. Varsayılan saklama 30 gündür ve kullanıcı silebilir.
  - Denetim kaydı sohbet içeriğini değil, yalnızca araç çağrısı özetini tutar.

### 6. ADR-0015 B4'e bağlayıcı kural (ADR-0015 Karar 2.4 ve B4 satırına eklenir)
- **Yeni ekran = yeni yetenekler ile birlikte.** B4 kapsamındaki her yeni ekran (ve yeni eylem) aynı PR'da şunları içerir:
  - kayıtta ilgili yetenekler,
  - `screens.ts`'te `actions` / yetenek bağı,
  - her yetenek için MCP ve ajan kararı,
  - P1–P7 yeşil.
- Aşama A B4-P0'dan **önce** biter (A küçüktür, §7).
- A bitmeden başlamış bir B4 ekranı varsa, operasyonları bugünkü gibi `operationPolicy.ts`'e girer. İçe aktarıcı yeniden çalıştırılabilir olduğu için A'nın kapanışında otomatik olarak kayda taşınır.
- `menuSource:'registry'` ekranlarının `minRole` değeri kayıttan türetilir (P5). Elle yazılmaz.

## Gerekçe
- **Yönergeyi yapısal olarak karşılar.** "Önyüzden eklenen yetenek MCP'ye yansısın, eksik kalmasın" isteği bir disiplin çağrısı olarak bırakılmıyor, bir **tip ve test değişmezine** dönüşüyor:
  - MCP kararı olmayan yetenek derlenmez.
  - Ekrana bağlanmamış eylem, yetim yetenek ya da açıklamasız araç CI'da görünür ya da kırmızı olur.
  - Bu mandal deseni projede zaten işe yarıyor: K3, ADR-0015 6.4.
- **Tek kaynak, çok yüzey.** Bugün 3 olan, Faz 4 ve ADR-0018 ile 5'e çıkacak elle senkron kaynak 1'e iner. Yeni bir yüzey (genel API, E6) yeni bir kayıt değil, **bir türetme fonksiyonu** olur.
- **Güvenlik tek yerde.** MCP'nin, UI'nin ve ajanın yetkisi aynı `minTier` + `isAllowed` + entitlement'tan gelir. "MCP'de başka, ekranda başka yetki" kayması imkânsızlaşır. Bu, skill'in "tool tanımları merkezi, filtre sunucuda" kuralının doğrudan uygulamasıdır.
- **LLM için doğru boyutta yüzey.** Küratörlü açma, tekli/toplu birleştirme, toolset'ler ve ≤30 görünür araç, ölçülmüş 30–50 araç bozulma eşiğinin altında kalır. Açıklama kalitesi ve eval vekili bunu regresyona karşı korur. Bunun için ücretli LLM gerekmez.
- **Refactor, yeniden yazım değil.** `RunOperation`, jenerik RPC ve FE çağrıları çalışmaya devam eder. Politika tablosu türetilen görünüme dönüşür ve eski anlık görüntüyle eşitliği testle kanıtlanır. Göç kademelidir (FE literal mandalı).
- **Maliyet bilinci:**
  - Yeni servis yok.
  - Yeni üretim bağımlılığı yalnızca zod (ADR-0017'de zaten planlı) ve `@modelcontextprotocol/sdk` (ADR-0009'da zaten planlı). İkisi de MIT.
  - Üretim betiği küçük bir Node betiğidir.
  - Tek haneli abone ölçeğinde OpenAPI araç zinciri, tRPC göçü ya da ayrı bir "capability servisi" getirisini karşılamaz.
- **Spec oynaklığına dayanıklılık.** MCP 2025-11-25'ten 2026-07-28'e durumsuzluk ve MRTR gibi büyük değişiklikler geçirdi. Kayıt protokolden bağımsızdır. Sürüm farkı yalnızca `/mcp` adaptöründe kalır.

## Maliyet/Ölçek Notu
- **Maliyet (kaba):**

  | Aşama | Tahmini süre |
  |---|---|
  | A | ~2–3 ajan-günü (içe aktarıcı + şema + türetme + parite v1 + belge üretimi) |
  | B | ~2 |
  | C | ~4–5 (ADR-0010 OAuth hazır olmak kaydıyla) |
  | D | ~4–6 (masaüstü chat sunumu dahil, ADR-0007 adımlarıyla paylaşımlı) |
  | E | ~0,5 |

  - Bağımlılıklar: zod (MIT), `@modelcontextprotocol/sdk` (MIT, 1.30.x). JSON Schema → TS için yalnızca geliştirme bağımlılığı (ör. `json-schema-to-typescript`, MIT) ya da zod kaynaklı küçük bir üretici. Lisans kontrolü B9'a göre yapılır.
  - Yeni koleksiyonlar: `PendingActions` (TTL 10 dk), `McpIdempotency` (ADR-0009, TTL 24 sa), `SystemFlags` (tek belge). Hepsi ApplicationDB'de. Göç ve yedek şartı CLAUDE.md kural 3'e göre.
- **Operasyon yükü:**
  - Her yetenek PR'ında `capabilities:gen` çalıştırılır.
  - Manifest özeti ve değişiklik günlüğü otomatik üretilir.
  - İnsan incelemesi yalnızca `exposed` açma ve kademe değişikliğinde gerekir.
- **Yeniden değerlendirme eşikleri:**
  - Açık MCP aracı **> 60** ya da varsayılan görünür küme **> 30** → sunucu tarafında "araç arama" meta-aracı ya da ek toplu yetenek birleştirme ADR'si.
  - P9 vekil ölçümünde kritik vakaların ilk 3 isabeti **< %90** → yeni araç açma durdurulur, açıklamalar yeniden yazılır. İsteğe bağlı gerçek LLM eval'inde yanlış araç oranı **> %10** olursa aynı kural uygulanır.
  - Harici MCP istemcisi talebi ADR-0010 eşiğine ulaşırsa (**≥ 2 ödeyen müşteri**) → üçüncü taraf istemci kaydı. Aynı adımda MCP Apps için **statik, ui-kit'ten derlenmiş** `ui://` şablonları değerlendirilir. Model tarafından üretilen HTML yine yasaktır.
    - Not: ADR-0009 `:103` bu eşiği "3" diyor. Daha yeni olan ADR-0010 `:82` "2" diyor. Bu ADR yeni eşik koymaz, ADR-0010'u esas alır.
  - Genel API / API anahtarı (E6, benchmark Y-14/H3) işi başlarsa → kayıttan **OpenAPI 3.1** türetimi (`derive/openapi.ts`) ve `surface:'publicApi'` kararı alanı eklenir.
  - Aşama B'den sonra çeyrek başına **> 2** FE↔BE sözleşme kayması olayı yaşanırsa (tip üretimine rağmen) → ts-rest/oRPC benzeri sözleşme katmanı yeniden değerlendirilir.
  - Yetenek sayısı **> 300** ya da `capabilities:gen` süresi **> 10 sn** → kaydın paketleştirilmesi (`packages/contracts`, backend'in workspace'e alınması) ADR'si.
  - MCP `tools/call` p95 ve CPU eşikleri ADR-0009'dakilerle aynıdır.

## §7 Göç planı ve aşamalar

| Aşama | Kapsam | Çıkış kapısı | Test stratejisi (gerçek ağ/DB/LLM YOK) | Risk / geri alma | Sıra bağı |
|---|---|---|---|---|---|
| **A — Kayıt + içe aktarma + parite v1** | `capabilities/` şeması. İçe aktarıcı betik: `OPERATION_POLICY` + `OPERATION_POLICY.md` gerekçeleri → alan dosyaları; `effect` önerisi, `review` notları, `mcp.notExposed{deferred, until:'C'}` ya da gerekçeli sınıf, `ui` FE taramasından. Elle zenginleştirme: kimlikler, tekli/toplu birleştirme. `derivePolicy`. `docs/CAPABILITIES.md` üretimi. P1–P3, P7 hata; diğerleri uyarı. | `operation-policy.test.ts` **değişmeden** yeşil; türetilen politika = A öncesi anlık görüntü (derin eşitlik); `tsc` 0; kanonik operasyon sayısı belgede (156/158/159 ayrışması kapanır) | jest, AST (mevcut yardımcılar), anlık görüntü | Düşük. Geri alma: `operationPolicy.ts` literal nesnesi anlık görüntü fixture'ı olarak saklanır, tek commit'le geri dönülür | ADR-0015 B4-P0'dan **önce**; ADR-0017 A ile bağımsız |
| **B — FE bağı + üretilen tipler** | `frontend/src/generated/capabilities.ts`; `restApi.call(id, input)`; `screens.ts` `actions` / yetenek alanları + `minRole` türetimi; `feRawLiteralCalls` mandalı; UI yazma işlemlerinin denetimi (B7) | Üretilmiş dosya kayma testi; P4/P5 yeşil (uyarıdan hataya); mevcut Playwright spec'leri yeşil (fixture'lar RPC yoluyla aynı) | jest + vue-tsc + mevcut e2e (sentetik fixture) | Orta-düşük. Sarmalayıcı aynı RPC'ye gider. Geri alma: sarmalayıcı kullanımı dosya bazında geri alınır | B4-P0 ile paralel (yeni ekranlar doğrudan `call` kullanır) |
| **C — MCP iskeleti (salt-okunur)** | `/mcp` adaptörü (SDK, Streamable HTTP, durumsuz; spec sürümü uygulama anında SDK'nın desteklediği en yeni kararlı sürüm, adaptör katmanında). 5 `core` aracı `exposed`. Toolset'ler; güvenlik katmanı (§5.6); manifest + özet; P9 vekil; P10 yüzey eşitliği; kill-switch | ADR-0009 Faz 4 DoD'si araç başına: şema, RBAC reddi, **2 tenant izolasyonu**, rate limit, audit kaydı; P10 yeşil; masaüstü olmadan SDK'nın bellek içi istemcisiyle uçtan uca `tools/list` → `tools/call` | jest + supertest + SDK in-memory transport; sahte servisler; mock tenant'lar (yerel yeni tenant DB'si **oluşturulmaz**, CLAUDE.md kural 5) | Orta. Önkoşul: ADR-0010 OAuth + BACKLOG C1–C4 kapalı (ADR-0009 Durum). Geri alma: `MCP_ENABLED=false` | ADR-0010 sonrası; Faz 4 masaüstünü **beklemez** |
| **D — Yazma + onay + chat sunumu** | `PendingAction`, onay adaptörü (MRTR/elicitation), idempotency, `confirm` akışı. İlk yazma yetenekleri (öneri: `orders.approve`, `stock.update`, `prices.update`). `packages/ui-kit` katalog = `Ek*` salt-okunur + `ActionPreview`. Masaüstü chat render alanı | ADR-0009 eşiği: salt-okunur araçlar **30 gün** sıfır cross-tenant/RBAC bulgusuyla çalışmış olmalı. Onaysız yürütme imkânsızlığı testi; tekrar gönderimde tek uygulama; süresi dolmuş/başka kullanıcının `PendingAction`'ı reddedilir; önizleme = yürütme sonucu (P10) | jest (sunucu) + Vitest/Playwright (ui-kit bileşenleri, sentetik veri) | Yüksek (yazma). Geri alma: yetenek bazında `SystemFlags.disabledCapabilities` | ADR-0007 masaüstü adımları 2–3 ile birlikte |
| **E — Parite kapısı zorunlu** | P4–P6, P8–P10 hataya çevrilir; mandal tabanları kilitlenir; PR şablonu + `quality-gates` skill güncellemesi; `npm run verify` içinde | Tüm P kuralları hata modunda yeşil; mandal tabanları commit'li | CI | Düşük | **C çıkışından sonra**; D'yi beklemez |

**Operasyon/yetenek sayısı tutarsızlığı** (156/158/159) A'nın ilk adımında kanonik olarak ölçülür ve `docs/CAPABILITIES.md`'ye yazılır.

## §8 Baseline uyumu (`docs/PLATFORM_BASELINE.md`)

| Satır | Durum | Nasıl |
|---|---|---|
| A1 Gözlemlenebilirlik | Uygulanır | §4.5: `traceparent` → `corrId` zinciri, `capability_calls` metriği, ADR-0017 kayıt defteri |
| A2 Hata yönetimi | Uygulanır | Tek zarf; MCP'de doğrulama/iş hatası `isError:true` + eyleme dönük Türkçe/İngilizce ileti + Destek kodu; ham hata yok |
| A3 Dayanıklılık | Uygulanır | Yazmada `idempotencyKey` + `PendingAction`; "sonuç belirsiz" durumunda istemci aynı anahtarla yeniden sorar |
| A7 Kapasite | Uygulanır | Liste yeteneklerinde `limit ≤ 100` + imleç (P7), yanıt ≤ 256 KB |
| A8 Sürüm/göç | Uygulanır | §4.1 sürümleme/deprecation; A'da politika eşitlik anlık görüntüsü |
| B1 Kimlik/yetki | Uygulanır | Tek `minTier` → politika + MCP süzgeci; `tools/call`'da yeniden kontrol |
| B2 Tenant izolasyonu | Uygulanır | Girdi şemasında tenant alanı yasak (P7); 2 tenant testi (C) |
| B3 Girdi doğrulama | Uygulanır | zod strict (MCP); UI yolunda kademeli (`legacy` yalnızca `notExposed` için) |
| B4 Gizli yönetimi | Uygulanır | `credential` sınıfı MCP'ye kapalı; `'sensitive'` sözleşmesi korunur |
| B5 Web güvenliği | Uygulanır | `/mcp` Origin doğrulama (403); chat'te `v-html` yok, kapalı katalog |
| B6 Kötüye kullanım | Uygulanır | Rate limit × `rateCost`; `mcpCallsPerDay` |
| B7 Denetim izi | Uygulanır | Tüm yazma işlemleri + tüm MCP çağrıları, `source` alanıyla |
| B8 KVKK | Uygulanır | `pii` sınıfı, maskeleme, yerel sohbet geçmişi, aydınlatma (metin Protokol 12) |
| B9 Bağımlılık/lisans | Uygulanır | zod, MCP SDK: MIT; ek geliştirme bağımlılığı lisans taramasına girer |
| B10 Oturum | Uygulanır | ADR-0010 token iptali/`tv` |
| C1 Tasarım sistemi | Uygulanır | Chat kataloğu = `Ek*` (§5.4) |
| C2 Durumlar | Uygulanır | Chat'te yükleniyor/boş/hata/yetkisiz/devre dışı durumları aynı bileşenlerle |
| C3, C5, C7 | Uygulanır | Onay diyaloğu erişilebilirliği; `summary.tr/en` + i18n; açıklamada doğrulanmamış iddia yok |
| D1, D2 | Uygulanır | P1–P10 + mandallar `npm run verify`'da |
| D5 API sözleşmesi | Kısmen | Tip/şema/belge türetilir. **OpenAPI şimdilik uygulanmaz** (tüketici yok; eşik §Maliyet: E6 başlarsa) |
| D6 Belgeleme | Uygulanır | `CAPABILITIES.md` + otomatik değişiklik günlüğü; elle kopya tablo kalkar |
| E1 Plan/kota | Uygulanır | `entitlement` alanı → `EntitlementService` (tek guard) |
| E3 Entegrasyon dürüstlüğü | Uygulanır | `no_backend` sınıfı açılmaz; açıklama dürüstlük kuralı |
| E6 Genişleme noktaları | Uygulanır (hazırlık) | Kayıt, genel API/webhook/otomasyon için tek genişleme noktasıdır; yüzey eklemek bir türetme fonksiyonudur (şimdi yapılmaz) |
| A4–A6, C4, C6, C8–C10, D3–D4, D7–D9, E2, E4–E5, E7 | Bu ADR için uygulanmaz | Bu karar bu konulara yeni bir yüzey açmaz; ilgili ADR'ler geçerli |

**Önerilen tek satırlık bağlayıcı kural** (`PLATFORM_BASELINE.md` D bölümüne ve `quality-gates` skill'ine eklenmesi önerilir; ekleme orkestratöre aittir):
> **D10 — Yetenek paritesi:** Yeni ya da değişen yetenek = yetenek kaydı girdisi + UI eşlemesi (ya da gerekçeli `ui.none`) + MCP kararı (`exposed` ya da gerekçeli `notExposed`) + ajan kararı + test + belge (`capabilities:gen`). Aksi halde PR kabul edilmez.

## Etki Alanı
- **Backend:**
  - Yeni `src/capabilities/` (tip, alan dosyaları, `invoke.ts`, `derive/*`),
  - yeni `src/mcp/` (yalnızca adaptör; ADR-0009'daki `src/mcp/tools/` **kurulmaz**),
  - `src/api/operationPolicy.ts` (türetilen görünüm; dışa açık API aynı),
  - `src/api/RunOperation.ts` (yürütme yolu aynı; denetim genişlemesi B'de),
  - `src/api/ApiManager.ts` (değişmez),
  - `generated/mcp-manifest.json`,
  - ApplicationDB `PendingActions`, `McpIdempotency`, `SystemFlags`,
  - `tests/characterization/auth/{operation-policy,capability-parity}.test.ts`,
  - `capabilities/evals/*.json`,
  - `package.json` script'leri (`capabilities:gen`, `capabilities:check`).
- **Frontend:**
  - `src/generated/capabilities.ts`,
  - `src/composables/restapi.ts` (`call` sarmalayıcısı),
  - `src/navigation/screens.ts` (`actions`/yetenek alanları, `minRole` türetimi),
  - komut paleti (ADR-0015 2.5),
  - mandal betikleri.
- **Masaüstü / paylaşılan (Faz 4):** `packages/ui-kit` (GenUI katalog = `Ek*` salt-okunur + `ActionPreview`), `desktop/` (istemci süzgeci, toolset ayarı, onay UI'si, yerel yetenekler, sohbet geçmişi saklama).
- **Belgeler:**
  - `docs/CAPABILITIES.md` + `docs/CAPABILITIES_CHANGELOG.md` (üretilir),
  - `docs/OPERATION_POLICY.md` (yönlendirmeye iner),
  - ADR-0009 (§2/§9 değişikliği bu ADR'den referanslı),
  - ADR-0015 (B4 kuralı),
  - ADR-0018 (bu kayda referans vermeli),
  - `PLATFORM_BASELINE.md` (D10 önerisi),
  - `quality-gates` skill'i (PR kontrol listesi).

## §9 Uyum notları (paralel ADR'ler)
- **ADR-0018 yazarına:**
  - "Ajan araç yüzeyi" = bu kaydın `agent.allowed:true` yetenekleridir.
  - Ajanlar insansız çalıştığı için `maxEffect` en fazla `'propose'` olabilir. Yazma, §5.3'teki `PendingAction` ile bir insan onayına dönüşür.
  - `AgentRun` ADR-0017 `JobRuns.runType:'agent'`'i kullanır.
  - Ajana özgü yetenek (ör. `integrations.compliance.findings.list`) bu kayda girer ve aynı parite kurallarına uyar. Ayrı araç kaydı açılmaz.
- **ADR-0017'ye:** `capability_calls` metriği ve `source` alanlı denetim, ADR-0017 Karar 1–2'nin genişlemesidir. Etiket kümesi §4.5'tedir.

## §10 Açık sorular (yalnızca insan kararı; hepsinin varsayılanı var, fabrikayı durdurmaz)
- **S1 — LLM sağlayıcı ve bütçe:** Entegrasyonik barındırılan bir model sunacak mı (sunucu anahtarı, ücretli)?
  - **Varsayılan: hayır.** Kullanıcı kendi modelini ya da yerel modeli bağlar. Sunucu tarafında LLM yok.
  - Evet denirse Protokol 12 (ücretli hesap) + KVKK yurt dışı aktarım değerlendirmesi + yeni ADR gerekir.
- **S2 — Yerel uygulama dağıtımı ve imzalama:** Windows Authenticode sertifikası (ücretli/KYC) ve dağıtım kanalı.
  - **Varsayılan:** imzasız iç test sürümü + imzalı güncelleyici manifesti (ADR-0007). Müşteriye dağıtım imzadan sonra.
- **S3 — MCP'nin harici (üçüncü taraf) istemcilere açılması** (Claude Desktop, ChatGPT vb.; uzak, herkese açık uç).
  - **Varsayılan: kapalı.** Yalnızca birinci taraf istemciler (`entegrasyonik-desktop`) açık. ADR-0010 eşiğine kadar bekler.
  - Açılırsa: istemci kaydı + onay ekranı + MCP Apps statik şablon değerlendirmesi.
- **S4 — KVKK aydınlatma/rıza metni** (tenant verisinin kullanıcının seçtiği yurt dışı LLM sağlayıcısına gitmesi).
  - **Varsayılan:** taslak metin + maskeleme açık + rıza kaydı. Nihai metin Protokol 12 (hukuki yayın).

Diğer tüm noktaların varsayılanı bu ADR'de sabittir: adlandırma, toolset'ler, bütçe, onay modeli, saklama süreleri ve eşikler.

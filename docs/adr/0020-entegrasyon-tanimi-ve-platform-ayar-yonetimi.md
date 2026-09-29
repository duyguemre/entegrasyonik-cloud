# 0020 — Entegrasyon Tanımı ve Platform Düzeyi Ayar Yönetimi (tek kaynak, sürümlü geçersiz kılmalar, admin paneli)

## Durum
Kabul edildi (2026-09-28).
- Aşama A (ayar kataloğu + şema + etkin yapılandırma okuma servisi, davranış değişmez) ve Aşama B (yazma, sürümleme, geri alma, önbellek geçersizleme) yeni servis, ücretli hesap ya da insan onayı gerektirmez. Protokol 12'yi tetiklemez.
- Canlı DB göçleri (Atlas `Integrations.urls` → sürümlü geçersiz kılma) insan adımıdır: kural 3 yedeği ve Protokol 12 onayı gerekir (Karar 7).
- **C22 bu ADR'yi BEKLEMEZ.** Trendyol V2 geçişinin son tarihi 15 Ekim 2026 (17 gün). C22 kendi dar planıyla ilerler. Bu ADR yalnız C22'nin "eski URL'yi tanıyan güvenlik ağı"nı kalıcı yapıya taşıyacak yeri ve kuralı tanımlar (Karar 1.5, Aşama A0).

**Uyum notları (paralel ADR'ler):**
- **ADR-0016** (backend hedef mimari) henüz `docs/adr/` altında yok. Bu ADR'deki klasör önerileri (`src/integration/config/`, `api/services/integration-config-service.ts`) geçicidir. Yerleşimde çelişki olursa **0016 kazanır**, anlam değişmez.
- **ADR-0018** `IntegrationDescriptor` (manifesto) tipinin sahibidir. Bu ADR ona yalnız `config` bölümünü **ekler** (uç nokta şablonları, izinli host'lar, emekli uçlar, ayar varsayılanları). Tipi yeniden tanımlamaz. 0018 Aşama A henüz birleşmediyse, 0020 Aşama A yalnız `config` alanını içeren asgari bir `descriptor.ts` yazar ve 0018 kalan alanları doldurur. Aynı dosya iki aşamada çakışmasın diye sahiplik şöyledir: tip dosyası 0018'in, `config` alt tipi 0020'nindir.
- **ADR-0017** `zod` bağımlılığını ve `config/env.ts` şemasını getirir. Bu ADR `zod`'u ondan alır. 0017 Aşama A önce birleşmezse `zod`'u 0020 Aşama A ekler (aynı bağımlılık, hangisi önce gelirse). **Ayrım kesindir:** `config/env.ts` süreç/dağıtım ayarlarını (DB, Redis, sırlar, `POD_NAME`, mock bayrakları) doğrular. Bu ADR'nin kataloğu çalışma zamanında değiştirilebilen motor ve entegrasyon parametrelerini doğrular. Env tabanlı bir ayar katalogda yalnız **salt-okunur "env kilidi"** olarak görünür (Karar 1.3).
- **ADR-0019** yetenek kaydı. Bu ADR'nin yönetim uçları oraya `platform` alanında kayıt olur (Karar 6). ADR-0019'daki `PendingAction` (MCP onay jetonu, 5 dk ömür) ile bu ADR'deki "taslak revizyon" farklı şeylerdir. Ad çakışması yoktur.
- **ADR-0015** şablonları: ekranlar yalnız `EkListPage`, `EkDetailSheet`, `EkSettingsTemplate`, `EkReadonlyPanelTemplate`, `EkConfirmDialog` ile kurulur (Karar 4). Yeni şablon icat edilmez.

## Bağlam

**Proje sahibinin yönergesi (2026-09-28, özet):**
- Async ürün gönderimi, sipariş çekimi vb. ayarlar için admin panelde **tam** ve **anlaşılabilir** bir yönetim olmalı.
- Bütün entegrasyonların ayarları ön yüzden yapılabilmeli.
- Konu müşteri (tenant) entegrasyon ayarları değildir. Konu **genel** ayarlardır ve **entegrasyon bazında** yönetilir.

### Kanıt: bu ayarlar bugün nerede ve nasıl tutuluyor (`faz3-arayuz` @ 23e8c11)

| # | Bulgu | Kanıt (dosya:satır) |
|---|---|---|
| K1 | **Platform düzeyi entegrasyon tanımı** ApplicationDB `Integrations` koleksiyonunda. `urls` serbest `Object`, `settings` serbest `Object`. `strict:false` olduğu için her alan kabul ediliyor. Şema, sürüm ve denetim yok. Değişiklik ancak DB elle düzenlenerek yapılabiliyor (bunu yapan bir uç yok). | `database/application/models/Integration.ts:8,11,16` |
| K2 | **Birleştirme kuralı gizli ve kayıplı.** `IntegrationFactory.getIntegrationConfig`, `{ ...integration, settings: decryptSecrets(clientSetting.settings) }` üretiyor. Sonuç: (a) platform `urls` olduğu gibi adaptöre gidiyor; (b) platform `Integrations.settings` alanı tenant ayarıyla **tamamen eziliyor**, yani adaptör yolunda fiilen ölü; (c) hiçbir değerin kaynağı (kod/DB/tenant) izlenemiyor. | `modules/IntegrationFactory.ts:94-120` (özellikle `:114`) |
| K3 | **Önbellek:** `configCache` ve `instanceCache` süreç içinde tutuluyor, tüm önbellek 5 dk'da bir topluca siliniyor, `clearCache()` elle çağrılıyor ama hiçbir yerden çağrılmıyor. Çok pod'da DB değişikliği en geç 5 dk'da ve **pod başına farklı zamanda** yansıyor. | `IntegrationFactory.ts:27,32-34,73-81,226-230`; `grep IntegrationFactory.clearCache` = 0 çağıran |
| K4 | **Doğrulama yalnız varlık kontrolü:** `validateSettings`, `requiredSettings` alanlarının boş olmamasına bakıyor. Tip, aralık ve URL doğrulaması yok. | `IntegrationFactory.ts:83-92`; `requiredSettings`: `trendyol/index.ts:54`, `hepsiburada/index.ts:32`, `n11/index.ts:22`, `pazarama/index.ts:34`, `ideasoft/index.ts:19`, `bizimhesap/index.ts:18` |
| K5 | **C22'nin kök nedeni:** kod varsayılanı `settings.urls?.x \|\| "<doğru V2 URL>"` biçiminde. DB'de değer varsa kod düzeltmesi **hiç çalışmıyor**. Yerel DB'de Trendyol `orderListUrl` ESKİ uca, `productListUrl/transferUrl/checkBatchUrl/update*Url` V1 yollarına işaret ediyor. Trendyol'un ürün uçlarının **hiç kod varsayılanı yok** (DB yoksa hata). | `trendyol/api/OrderConnector.ts:18,102,129,173`; `trendyol/services/ProductService.ts:165,250,261,359`; BACKLOG C11, C22 |
| K6 | **Varsayılan desenleri tutarsız:** N11'de kod varsayılan tablosu var (`N11_DEFAULT_URLS`, DB yoksa kullanılıyor). Ideasoft ve Bizimhesap'ta satır içi `\|\|` var. Trendyol ve Hepsiburada'da çoğu uçta varsayılan yok. Toplam 27 `integrationSettings.urls` okuma noktası var. | `n11/services/Service.ts:9-12,96`; `n11/api/*Connector.ts:7,33`; `ideasoft/services/Service.ts:46,55`; `bizimhesap/services/Service.ts:33`; grep sayımı |
| K7 | **YENİ GÜVENLİK BULGUSU: tenant URL'yi değiştirebiliyor.** Hepsiburada adaptörü önce **tenant** ayarındaki `settings.urls`'i okuyor. Tenant yazma ucu `resolveSettingsForWrite` gövdeyi anahtar süzgecinden geçirmiyor (yalnız `stockPolicy` ayıklanıyor). Yani bir tenant yöneticisi `settings.urls.BASEURL` yazarak sunucumuzun kendi kimlik bilgileriyle istediği host'a istek atmasını sağlayabilir (SSRF ve kimlik bilgisi sızıntısı sınıfı). | `hepsiburada/services/Service.ts:33-35`; `api/services/integration-service.ts:101-116,134-143` |
| K8 | **Bilgi sızıntısı (düşük):** `IntegrationService.get` (member kademesi) `'settings.urls'` alanını projeksiyonla gizliyor. Ama uçlar üst düzey `urls` alanında durduğu için tenant'a dönüyorlar. `profitRate/commissin` da dönüyor. | `integration-service.ts:47-49`; `operationPolicy.ts:82-84` |
| K9 | **Motor parametreleri 4 JSON dosyasında ve sınıf sabitlerinde.** `export.config.json`, `import.config.json`, `order.config.json` ve `orchestrator.config.json` derleme anında içe aktarılıyor. Değiştirmek için yeniden dağıtım gerekiyor. | `engine/catalog/export/export.config.json`; `engine/catalog/import/import.config.json`; `engine/order/order.config.json`; `engine/orchestrator.config.json` |
| K10 | **JSON değeri ile kod içi `\|\|` yedek değeri çelişiyor.** Bugün etkin olan JSON değeridir, yedek değer ölü ve yanıltıcıdır. Ayrıca `\|\|` kullanıldığı için 0 değeri verilemiyor. Örnekler: Publisher `chunkSize` JSON 30 / yedek 50; Validator 50 / 100; Sentinel `cooldownMinutes` 1 / 10; Sync `cooldownMinutes` 1 / 30; Importer `fetchLimit` 50 / 100, `retryDelay` 3000 / 2000; `importLoopDelay` 30000 / 5000; `syncIntervalMs` 60000 / OrderOrchestrator'da 600000, OrderQueueProducer'da 60000 (aynı anahtar için iki farklı yedek). | `Publisher.ts:19`; `Validator.ts:11`; `Sentinel.ts:79,95,233`; `Sync.ts:13`; `Importer.ts:12-14`; `ImportOrchestrator.ts:48`; `OrderOrchestrator.ts:62`; `OrderQueueProducer.ts:283` |
| K11 | **Kodda gömülü sabitler (JSON'da bile yok):** Dispatcher `LEASE_TTL_MS` 5 dk; Publisher sinyal yeniden deneme 5 dk; webhook tekilleştirme penceresi 10 sn; fabrika çağrı zaman aşımı 120 sn ve önbellek 5 dk; stok yayını turu 30 sn, tarama sınırı 2000, **kanal üst sınırı yalnız Trendyol için 20000**; mutabakat, telafi ve süpürme aralıkları. | `Dispatcher.ts:18`; `Publisher.ts:24`; `OrderQueueProducer.ts:192`; `IntegrationFactory.ts:34-35`; `StockPublishScheduler.ts:9`; `StockPublishTrigger.ts:37-42`; `ReconciliationScheduler.ts:11-12`; `ExternalReconciliationJob.ts:18`; `InternalReconciliationJob.ts:15`; `OversellCompensationScheduler.ts:13`; `OversellCompensationJob.ts:44`; `AllocationSweepScheduler.ts:12` |
| K12 | **HTTP dayanıklılık ayarları adaptör başına kodda.** Zaman aşımı yalnız env ile değişiyor (`TY_/HB_/N11_/PAZARAMA_/IDEASOFT_/BIZIMHESAP_HTTP_TIMEOUT_MS`, "yalnız test/operasyonel"). `ratePerMin` sabit: TY 1800, N11 1000, Ideasoft 300, Bizimhesap 300; Pazarama bilinçli olarak yok. Retry ve devre kesici varsayılanları ortak sınıfta. Sayfa boyutları connector'larda gömülü (HB 100, N11 100, Ideasoft 100, Bizimhesap 1000, TY finans 1000). | `ResilientHttpClient.ts:21-38`; `trendyol/services/Service.ts:22,24`; `n11/services/Service.ts:61,64`; `ideasoft/services/Service.ts:34-35`; `bizimhesap/services/Service.ts:22-23`; `hepsiburada/services/Service.ts:16`; `pazarama/services/Service.ts:13,30,32`; `hepsiburada/api/OrderConnector.ts:23`; `n11/services/OrderService.ts:24`; `bizimhesap/services/OrderService.ts:28` |
| K13 | **Mock bayrakları env'de ve tek yerde okunuyor** (C19 kapandı, fail-closed): `<PREFIX>_MOCK_MODE`, `_MOCK_BASE_URL`, `_MOCKABLE_ENDPOINTS`. | `common/mock/MockMode.ts:19-35`; `backend/.env.example:29-45` |
| K14 | **Yapılandırma genel olarak dağınık:** denetimde 43 değişken, 30 dosya, 58 `process.env` okuması (bugün `grep process.env` = 72 satır). Tek doğrulanmış şema yok. | `docs/BACKEND_CODE_AUDIT.md` §9, MM-07; ADR-0017 §10 |
| K15 | **Admin tarafında ayar yönetimi hiç yok.** `AdminService` yalnız tenant CRUD, destek talepleri, `getSystemHealth` (önbellek istatistiği dahil) ve `getExportDetails` sunuyor. `AdminSystemManagementView` (1430 satır) bunları gösteriyor. Entegrasyon ve motor ayarı için ne uç ne ekran var. | `admin-service.ts:18-723` (`:266`, `:554`); `operationPolicy.ts:45-48`; `FRONTEND_GAP_ANALYSIS.md` satır 29 |
| K16 | **Çok pod'da yayın mekanizması yok:** `RedisService` pub/sub sunmuyor. `POD_NAME` yalnız kilit temizliğinde kullanılıyor. | `services/redis/RedisService.ts`; `ExportOrchestrator.ts:15` |
| K17 | **Etki önizlemesi için veri hazır:** ApplicationDB `Clients.integrations[]` tenant × entegrasyon bağını tutuyor (webhook ve sağlık bilgisi için kullanılıyor). Tenant DB'sine inmeden "kaç tenant etkilenir" sayılabiliyor. | `application/models/Client.ts:46`; `IntegrationHealthOperations.ts:8`; `WebhookApiManager.ts:65` |
| K18 | **Tenant düzeyi motor ayarı zaten tek bir örnekte var ve doğru kurulmuş:** kanal stok politikası (`bufferUnits/bufferPercent/graceMinutes/autoCancelOversold`), doğrulamalı özel bir uçla yazılıyor ve sınırlar kodda. | `ClientIntegration.ts:26-29`; `operations/stock/stockPolicyValidation.ts:15-26`; `integration-service.ts:230-231` |

Dış desenler (araştırma, `docs/research/2026-09-28-integration-saas-patterns.md` Konu 2 ve 11): bağlantı durumu tek kelimelik bir makinedir; kapsam beyanı makinece okunur; sağlayıcılar kırıcı değişiklikleri brownout ile dener. Bilinen tuzak: "DB'den gelen `settings.urls.*` kodda düzeltilen varsayılanı ezer" (C11/C22 dersi). Bu ADR bu tuzağı yapısal olarak kapatır.

**Ölçek:** 1 aktif tenant, tek haneli abone hedefi, 6 adaptör, 1 platformAdmin. Ayar değişikliği ayda birkaç kez olur. Ama tek bir yanlış değer (URL, lease, oran sınırı) **tüm** tenant'ları aynı anda etkiler. Bu yüzden tasarımın yükü hacimde değil, **değişiklik güvenliğindedir**.

## Değerlendirilen Alternatifler

### A. Doğruluk kaynağı nerede?
1. **Her şey DB'de, admin doğrudan düzenler (bugünkü modelin UI'lı hâli).**
   - Artı: en az kod.
   - Eksi: K5/C22 tam olarak bu modelin hatasıdır. DB değeri kod düzeltmesini sessizce ezer, sürüm ve şema yoktur, kodla birlikte değişmesi gereken değerler (uç yolu ↔ yanıt şekli) DB'de bayatlar.
   - **Reddedildi.**
2. **Her şey kodda veya env'de, değişiklik = dağıtım.**
   - Artı: sürümlü, gözden geçirilebilir.
   - Eksi: yönergeye aykırıdır ("kod elle düzenlenmesin"). Oran sınırı ya da sıklık gibi operasyonel ayarlar olay anında dağıtım beklemeden değişebilmelidir. Env değişikliği yeniden başlatma ister.
   - **Reddedildi.**
3. **Katmanlı model: kodda sürümlenen varsayılanlar (manifesto + ayar kataloğu) + DB'de sürümlü, şemalı platform geçersiz kılmaları + izinli listeyle sınırlı tenant ayarı + salt-okunur env kilidi. Etkin değer = birleşim ve kaynağı görünür.**
   - Artı: kod düzeltmesi ile DB değeri arasındaki çelişki tespit edilebilir hâle gelir. Her değişiklik şema doğrulamalı, sürümlü ve geri alınabilir olur.
   - Eksi: bir çözümleyici ve bir revizyon deposu yazılır.
   - **Seçildi.**
4. **Harici yapılandırma/özellik bayrağı servisi** (LaunchDarkly, Unleash, Consul, AWS AppConfig).
   - Eksi: ücret ya da ek servis (Protokol 12), ek işletim yükü. Türk pazaryeri uç noktalarına özgü doğrulama bilgisi yok. Tek haneli ölçekte getirisi yok.
   - **Reddedildi.** Eşik: Maliyet notu.

### B. Değişikliğin pod'lara yayılması
1. **Yalnız TTL önbellek (bugünkü 5 dk).** Kill-switch için çok yavaş. Pod'lar farklı anlarda farklı yapılandırmayla çalışır. **Reddedildi.**
2. **Redis pub/sub.** Hızlıdır. Ama kaçırılan mesaj sessizce kaybolur ve her pod'a ayrı bir abone bağlantısı gerekir. Doğruluk yine bir yoklamaya ihtiyaç duyar. **Şimdilik reddedildi** (hızlandırıcı olarak eşikli).
3. **Sürüm sayacı yoklaması:** küçük bir `IntegrationConfigHeads` belgesi, her pod'da 15 sn'de bir okunur (dakikada 4 hafif `find`). Sürüm değiştiyse ilgili önbellek anahtarları geçersiz kılınır. Doğruluğun kaynağı DB'dir. **Seçildi.**

### C. Sürümleme biçimi
1. **Alan bazlı değişiklik olayları** (event sourcing). Güçlüdür ama geri alma ve "o anki durum" hesabı karmaşıklaşır. **Reddedildi.**
2. **Revizyon başına tam geçersiz kılma anlık görüntüsü** (hedef başına birkaç KB). Fark (diff) iki görüntünün karşılaştırmasıyla hesaplanır. Geri alma = eski görüntüyü yeni revizyon olarak yayınlamak. **Seçildi.**

### D. Yönetim arayüzü
1. **Serbest JSON düzenleyici.** Anlaşılır değil, tehlikeli ve doğrulaması zayıf. **Reddedildi.**
2. **Entegrasyon başına elle yazılmış formlar.** Katalogla sapar (bugünkü FE formları ↔ backend ayrışmasının tekrarı). **Reddedildi.**
3. **Katalogdan türetilen şema güdümlü form** (tek `SettingField` bileşeni, tür başına bir giriş). **Seçildi.**

## Karar

Her entegrasyonun ve motorun çalışma zamanı ayarları, **kodda sürümlenen bir ayar kataloğuyla** (zod şemalı; tip, aralık, birim, varsayılan, tehlike seviyesi, uygulanma zamanı, tüketici ve TR/EN açıklama taşır) tanımlanır. DB'de yalnız **sürümlü platform geçersiz kılmaları** tutulur (taslak → fark → onay → yayın, geri alınabilir, denetimli). Etkin yapılandırma tek bir çözümleyiciden okunur ve her değerin kaynağı görünür (`default | platform | tenant | env | legacy`). Bu yapı, `platformAdmin` için ADR-0015 şablonlarıyla kurulan "Entegrasyonlar" ve "Motor ayarları" ekranlarından yönetilir. Pod'lar değişikliği 15 sn'lik sürüm yoklamasıyla alır. Uç nokta **yolları** koddadır, DB yalnız izinli host'lar içinde geçersiz kılar. Emekli bir uç noktaya işaret eden DB değeri reddedilir (yazmada) ve yok sayılıp bulgu üretir (okumada). C22 sınıfı hata böylece yapısal olarak kapanır.

### Karar 1 — Tek doğruluk kaynağı ve katmanlama

**1.1 Katmanlar (düşükten yükseğe):**

| Katman | Nerede | Kim değiştirir | İçerik |
|---|---|---|---|
| `default` | Kod: ayar kataloğu (`integration/config/catalog/*.ts`) + manifesto `config` bölümü (`modules/*/*/descriptor.ts`, ADR-0018) | Geliştirici (PR, sürümlü) | Tüm ayarların varsayılanı, güvenli aralığı ve şeması; uç nokta yol şablonları; izinli host'lar; emekli uç listesi; kapsam beyanı |
| `legacy` | ApplicationDB `Integrations.urls` (bugünkü alan) | Kimse (yalnız göç aracı okur) | **Geçiş katmanıdır.** Aşama A'da davranış değişmesin diye `default`'un üstünde okunur. Canlı göç sonrası (Karar 7) okunmaz, alan silinmez, bir sürüm boyunca yedek olarak kalır. |
| `platform` | ApplicationDB `IntegrationConfigRevisions` (yayınlanmış son revizyon) | platformAdmin (panel) | Katalogda `overridable:true` olan ayarların platform düzeyi değerleri. Hedef başına tek belge dizisi: `integrationCode` ya da motor-genel ayarlar için `_engine`. |
| `tenant` | Tenant DB `ClientIntegrations.<kategori>[].settings` | Tenant yöneticisi (tenant ekranları) | **Yalnız** katalogda `tenantOverridable` işaretli anahtarlar ve platformun izin verdiği sınır içinde. Bugün tek örnek `stockPolicy.*`'dır (K18). Kimlik bilgileri de bu katmandadır ama "ayar" değil "sır" sınıfındadır ve bu ADR'nin kapsamı dışındadır. |
| `env` | Süreç ortamı (`config/env.ts`, ADR-0017) | Dağıtım | Yalnız katalogda `envLock:'<AD>'` işaretli ayarlar. Tanımlıysa her şeyi ezer. Panelde "Ortam değişkeniyle kilitli" rozetiyle **salt-okunur** görünür. |

**Etkin değer:** `env ?? tenant(izinliyse, sınır içinde) ?? platform ?? legacy ?? default`. Çözümleyici her değer için `{ value, source, revision?, envVar? }` döndürür.

**1.2 Neden bu sıra:**
- Tenant, platform'un üstündedir, çünkü tenant ayarı bir iş tercihidir (ör. stok tamponu). Ama tenant yalnız platformun izin verdiği anahtarları ve aralıkları kullanabilir. Platform bir anahtarın **sınırlarını** geçersiz kılabilir (`stockPolicy.bufferUnitsMax` gibi), tenant'ın değerini değil.
- Env en üsttedir, çünkü dağıtım düzeyinde bir acil durdurma ya da test ayarıdır. Bu yüzden görünür ve kilitlidir. Env ile ayar yönetmek istisnadır: `envLock` alanı taşıyan ayar sayısı mandalla sayılır ve artamaz.

**1.3 Neyin nerede yaşadığı (bağlayıcı sınıflama):**
- **Yalnız kod (DB'den değiştirilemez, panelde salt-okunur):** kategori ve yetenekler (ADR-0018), `requiredSettings`, uç nokta **yol şablonları** ve beklenen API sürümü, emekli uç listesi, doküman/changelog URL'leri, güvenli aralıklar ve şema, `adapterVersion`. Gerekçe: bu değerler adaptör koduyla birlikte değişmek zorundadır (V2 yolu ↔ V2 yanıt şekli). C22 bunun kanıtıdır.
- **Yalnız env (panelde salt-okunur, `envLock`):** mock bayrakları (`*_MOCK_MODE/_MOCK_BASE_URL/_MOCKABLE_ENDPOINTS`, C19). Panelden mock açmak üretimde "sahte başarı" demektir (E3 ihlali). `*_HTTP_TIMEOUT_MS` test düğmeleri (tanımlıysa kilitler, tanımsızsa katalog değeri geçerlidir). `POD_NAME`, Redis, DB ve sırlar hiç kataloğa girmez (ADR-0017 `config/env.ts`).
- **Platform geçersiz kılması (panelden):** motor parametreleri, oran sınırı/dayanıklılık, sayfa boyutları, kanal üst sınırları, host (taban URL) seçimi, entegrasyon kabul durumu (kill-switch), görünüm metaverisi (`title/logo/color`).
- **Tenant (tenant ekranlarından, bu ADR'nin dışında):** `stockPolicy.*` ve ileride katalogda açıkça `tenantOverridable` işaretlenecek anahtarlar.

**1.4 Uç noktalar: yol kodda, host platformda:**
- Manifesto `config.endpoints` her uç için bir kayıt taşır: `{ key: 'orderList', method, pathTemplate: '/integration/order/sellers/<SELLERID>/v2/orders', apiVersion: 'v2', hostRef: 'api' }`.
- Manifesto `config.hosts` izinli host listesini taşır: `{ api: { prod: 'https://apigw.trendyol.com', stage: 'https://stageapigw.trendyol.com' } }`. Ideasoft gibi tenant'a özel alt alan adları şablonla tanımlanır: `https://<STORENAME>.ideasoft.com.tr`, yalnız `*.ideasoft.com.tr` son eki kabul edilir.
- Platform geçersiz kılması **host seçimi**dir (`hosts.api = 'stage'` ya da izinli listeden bir değer). Yol şablonunu geçersiz kılmak **`dangerous`** sınıfındadır: gerekçe zorunludur, emekli desenle eşleşmemelidir ve manifestodaki `apiVersion` ile aynı sürüm önekini taşımalıdır. Bu olanak yalnız "sağlayıcı aynı sürümde yolu değiştirdi ve kod henüz yayında değil" acil durumu içindir.
- Bugünkü `urls.<key>` tam URL'leri, göç aracıyla (Karar 7) `host + pathTemplate` çiftine ayrıştırılır. Ayrışmayan ya da manifestoyla çelişen değerler rapora düşer ve **otomatik taşınmaz**.

**1.5 Kod ↔ DB çelişkisinin tespiti (C22'yi yapısal kapatan kural):**
- Manifesto `config.retiredEndpoints[]`: `{ pattern (regex/glob), retiredAt, replacementKey, sourceRef }`. İlk kayıtlar: Trendyol `.../integration/order/sellers/*/orders` (V2 olmayan), Ürün V1 yolları (C22, `sourceRef`: resmi changelog).
- **Yazmada:** emekli desene uyan bir değer zod ön doğrulamasında reddedilir. Hata: "Bu uç nokta <tarih> itibarıyla kapatıldı; yerine <anahtar> kullanılır."
- **Okumada** (`legacy` ya da eski bir `platform` revizyonu): değer emekli desene uyuyorsa **kullanılmaz**, yerine kod varsayılanı kullanılır ve `IntegrationFinding{ kind:'endpoint', source:'config', severity:'high' }` üretilir (ADR-0018 `FindingService`; o henüz yoksa no-op sink + `warn` log). "Otomatik yükseltme" yalnız bu anlama gelir: **kodun zaten konuştuğu sürüme dönmek**. DB'deki değer DB'de değiştirilmez. Kalıcı düzeltme panelden (ya da göç aracıyla) yapılır, böylece denetim izi kalır.
- **Genel çelişki taraması** (Aşama A, açılışta ve her yayında): her `legacy/platform` URL değeri için şu durumlar `config_drift` bulgusu üretir (şiddet `medium`, yalnız konsol): (a) değer izinli host listesinde değil, (b) yol, manifesto şablonunun `apiVersion` önekini taşımıyor, (c) değer kod varsayılanından farklı ve kaynak `legacy`. Böylece "DB kodu eziyor" durumu artık sessiz değildir.
- **C22 ile ilişki (Aşama A0):** C22 çalışması "eski URL'yi tanıyıp V2'ye çeviren güvenlik ağı"nı yazarken emekli desen listesini **Trendyol `descriptor.ts` içindeki `config.retiredEndpoints` alanına** koyar (dosya henüz yoksa yalnız bu alanla açılır). Böylece 15 Ekim'e yetişen iş, bu ADR'nin kalıcı yapısında sonradan yeniden yazılmaz.

**1.6 Tenant URL geçersiz kılması kaldırılır (K7):** Katalogda `tenantOverridable` olmayan hiçbir anahtar tenant ayarından okunmaz. `hepsiburada/services/Service.ts:34`'teki `s.urls ||` dalı Aşama A'da kaldırılır. Önce bir karakterizasyon testi yazılır, sonra bu davranış kasıtlı olarak ters çevrilir. Tenant yazma ucu (`resolveSettingsForWrite`), katalogdan türetilen tenant anahtar izinli listesiyle süzülür: `requiredSettings` ∪ `tenantOverridable` ∪ bilinen form alanları. Bilinmeyen anahtar reddedilir. Bu bir güvenlik düzeltmesidir, orkestratörün BACKLOG'a ayrı kalem olarak (CRITICAL adayı) açması önerilir.

### Karar 2 — Ayar şeması, doğrulama ve katalog

**2.1 Ayar tanımı (sözleşme; iç ayrıntı uygulayıcıya aittir):**
```ts
type Danger = 'safe' | 'caution' | 'dangerous';
type Applies = 'immediate' | 'next_cycle' | 'restart';
type SettingType = 'int' | 'duration' | 'bool' | 'enum' | 'host' | 'pathTemplate' | 'stringList' | 'text';

interface SettingDef<T> {
  key: string;                       // 'export.publisher.chunkSize' — kararlı; silinen anahtar yeniden kullanılmaz
  group: SettingGroup;               // UI bölümü (Karar 4 sekmeleri)
  scope: 'engine' | 'integration' | 'engine+integration';  // engine+integration: motor varsayılanı + entegrasyon bazlı geçersiz kılma
  type: SettingType;
  schema: ZodType<T>;                // aralık dahil; strict
  unit?: 'ms' | 's' | 'min' | 'h' | 'day' | 'count' | 'perMin' | 'percent';
  default: T | { [integrationCode: string]: T; _: T };      // entegrasyon başına varsayılan mümkün
  safeRange?: { min: number; max: number };  // aralık dışı değer 'dangerous' onay akışına düşer
  danger: Danger;
  applies: Applies;
  consumers: string[];               // 'engine/catalog/export/Publisher.ts' — tutarlılık testi grep ile doğrular
  label: { tr: string; en: string };
  help: { tr: string; en: string };  // ne yapar + artırınca/azaltınca ne olur (sade dil)
  impact?: { tr: string; en: string };// ör. "Artırmak Trendyol oran sınırına takılma riskini artırır"
  advanced?: boolean;                // UI'da "Gelişmiş" katlanır bölümde
  overridable: boolean;              // false → panelde salt-okunur
  envLock?: string;                  // tanımlıysa env değeri kilitler (1.3)
  tenantOverridable?: { bounds: { min: number; max: number } };
  since: string; deprecated?: { since: string; replacement?: string };
}
```

**2.2 Doğrulama kuralları:**
- Geçersiz kılma haritası `z.strictObject` ile doğrulanır. **Bilinmeyen anahtar yazmada reddedilir.** Okumada (anahtarı katalogdan silinmiş eski bir revizyon) yok sayılır ve `config_drift` bulgusu üretilir.
- `overridable:false` ya da `envLock`'u etkin olan bir anahtara yazma reddedilir.
- **URL/host doğrulaması:** `https` zorunludur (mock tabanları env'dedir, kataloğa girmez). Host manifestonun `hosts` listesinde olmalıdır. IP adresi, `localhost`, özel ağ aralıkları ve kullanıcı bilgisi içeren URL (`user@host`) reddedilir. Port yalnız manifestoda tanımlıysa kabul edilir. Yol şablonu yalnız manifestoda tanımlı yer tutucuları taşıyabilir (`<SELLERID>`, `<PACKAGEID>`...). Emekli desen kontrolü 1.5'teki gibidir.
- **Çapraz doğrulama** (katalogda `crossChecks[]` saf fonksiyonları): ör. `order.claimSync.cursorOverlapMs < order.claimSync.intervalMs × 4`; Trendyol `order.lookbackDays ≤ 14` (sağlayıcı penceresi); `export.publisher.chunkSize ≤ manifesto.limits.maxItemsPerRequest` (Trendyol ≤1000); `http.ratePerMin ≤ manifesto.rateLimit.documented` (belgelenmiş sınır varsa, aksi halde `caution`).
- **Sır yasağı:** katalogda sır türü yoktur. Platform düzeyi kimlik bilgileri (ADR-0018 `PROBE_*`) yalnız env'de durur. Revizyon belgesine sır yazılamaz. Test, `password|secret|token|key` desenli anahtar adını katalogda reddeder (ADR-0003 ile uyumlu).

**2.3 Ayar kataloğunun ilk sürümü (bugünkü envanterden, kanıtlı):**

Değerler **bugün etkin olan** değerlerdir: JSON'da varsa JSON değeri, yoksa sabit. K10'daki ölü `||` yedekleri kataloğa **girmez**. Kesin sayılar ve her anahtarın tüketicisi Aşama A'da `docs/INTEGRATION_SETTINGS.md` olarak katalogdan **üretilir**. Tüketicisi grep ile bulunamayan JSON anahtarı (ör. `exportOrchestrator.zombieCheckInterval`'ın kullanılıp kullanılmadığı) kataloğa alınmaz, rapora yazılır.

| Grup (UI bölümü) | Kapsam | Ayarlar (bugünkü değer) | Adet (≈) | Tipik tehlike |
|---|---|---|---|---|
| **Ürün gönderimi (katalog aktarma)** | engine+integration | döngü gecikmesi 300 sn; oran sınırı bekleme 500 ms; orkestratör kilit süresi 30 dk; Dispatcher lease 5 dk; Validator fetch 100 / chunk 50 / hata bekleme 10 sn; Publisher chunk 30, varyant batch 50, cooldown 15 sn, yeniden deneme aralığı 5 dk, en fazla 3 deneme, sinyal yeniden deneme 5 dk; Sentinel izleme ömrü 24 sa, cooldown 1 dk, fetch 50; Sync batch 50, bekleme zaman aşımı 14 gün, cooldown 1 dk | 24 | chunk/batch: caution; lease/kilit: dangerous |
| **Ürün içe aktarma** | engine | import döngüsü 30 sn; kilit 30 dk; Stager döngüsü 15 sn; Importer döngüsü 30 sn, fetch 50, 3 deneme, 3 sn bekleme, hata beklemeleri | 10 | safe/caution |
| **Sipariş çekme** | engine+integration | senkron aralığı 60 sn; ilk senkron geriye dönük 1 gün; işçi eşzamanlılığı 5; iş denemesi 5, backoff 2 sn, iş zaman aşımı 15 sn; kuyruk tutma (tamamlanan 24 sa/1000, başarısız 500); imleç örtüşmesi 5 dk; webhook sağlıklıyken mutabakat 5 dk; webhook yokluk penceresi 30 dk; webhook tekilleştirme 10 sn; **sayfa boyutu** (HB 100, N11 100, Ideasoft 100, Bizimhesap 1000) | 18 | eşzamanlılık/aralık: caution; geriye dönük pencere: dangerous (sağlayıcı penceresi) |
| **İade / soru / finans** | engine+integration | iade: aralık 15 dk, örtüşme 1 sa, tam tarama 24 sa / 32 gün; finans: 6 sa, örtüşme 24 sa, tam tarama 24 sa / 30 gün; soru: 5 dk, örtüşme 15 dk; sayfa boyutları (iade 100, TY finans 1000) | 13 | safe/caution |
| **Stok ve fiyat yayını** | engine+integration | yayın turu 30 sn; tur başına tarama 2000; **kanal üst sınırı** (TY 20000, diğerleri tanımsız = sınırsız); süpürme 15 dk; iç mutabakat 1 sa (bayat koruması 2 dk); dış mutabakat 24 sa (kanal başına 20000); aşırı satış telafisi 5 dk (claim 2 dk); tenant `stockPolicy` sınırları (`bufferUnitsMax` 100000 vb.) | 12 | kanal sınırı ve telafi: dangerous (aşırı satış) |
| **Oran sınırı ve dayanıklılık** | integration | `timeoutMs` (30 sn, HB 60 sn; env kilitli olabilir); `ratePerMin` (TY 1800, N11 1000, Ideasoft 300, Bizimhesap 300, Pazarama/HB tanımsız); `maxConcurrent` (10, Pazarama 11); retry `maxAttempts` 4 / `baseDelayMs` 1000 / `maxDelayMs` 30000; kesici `consecutiveFailures` 5 / `openMs` 30 sn / `maxOpenMs` 5 dk; fabrika çağrı zaman aşımı 120 sn | 10 × 6 | ratePerMin artırma: dangerous (ban riski); diğerleri caution |
| **Uç noktalar** | integration | host seçimi (prod/stage) ve yol şablonları (salt-okunur, acil geçersiz kılma dangerous); bugün `Integrations.urls` içindeki anahtarlar (TY ≈20, HB ≈15, N11 `N11_DEFAULT_URLS`, Pazarama, Ideasoft, Bizimhesap) | ≈80 şablon (kesin sayı Aşama A) | host: dangerous |
| **Mock / gerçek mod** | integration | `MOCK_MODE`, `MOCK_BASE_URL`, `MOCKABLE_ENDPOINTS` | 3 × 6 | salt-okunur (env kilidi) |
| **Durum ve kapsam** | integration | kabul durumu (`intake: on / drain / off`), bakım modu ve iletisi (Karar 3.8); kapsam beyanı (salt-okunur, ADR-0018 yetenekleri); görünüm (`title/logo/color`) | 5 | intake: dangerous |
| **Önbellek** | engine | fabrika önbellek ömrü 5 dk; yapılandırma yoklama aralığı 15 sn (yeni) | 2 | caution |

**Özet:** yaklaşık 80 motor-genel ayar (bunların yaklaşık 25'i entegrasyon bazında geçersiz kılınabilir), entegrasyon başına yaklaşık 20 ayar (6 × 20 = 120), yaklaşık 80 uç nokta şablonu (salt-okunur ya da dangerous) ve 18 env kilitli mock satırı. Kesin sayım Aşama A çıktısıdır.

**Kataloğa bilinçli olarak girmeyenler:** `LOGIN_/REGISTER_/PASSWORD_RESET_*` hız sınırları ve hesap token süreleri (entegrasyon değil, ADR-0017 `config/env.ts`); faturalama ve deneme süresi (ADR-0008); ADR-0017 gözlemlenebilirlik eşikleri (kendi konsolunda). Bunlar ileride aynı katalog altyapısına "platform ayarları" grubu olarak eklenebilir. Eşik: Maliyet notu.

### Karar 3 — Değişiklik güvenliği ve yaşam döngüsü

**3.1 Veri modeli (ApplicationDB, 2 yeni koleksiyon):**
```
IntegrationConfigRevisions {
  _id, target: 'trendyol' | … | '_engine',
  version: number,                     // hedef başına artan; unique(target, version)
  status: 'draft' | 'published' | 'superseded' | 'discarded',
  overrides: { [key]: value },         // tam anlık görüntü (yalnız varsayılandan farklı olanlar)
  basedOnVersion: number,              // taslağın çıktığı yayın sürümü
  catalogVersion: string,              // kod kataloğunun sürümü (kod ↔ DB uyumluluğu)
  origin: { kind: 'manual' | 'rollback' | 'finding' | 'migration' | 'agent', ref? },
  reason: string,                      // caution/dangerous içeren yayında zorunlu, ≥ 15 karakter
  diff: [{ key, from, to, danger }],   // yayında sabitlenir
  impact: { activeTenants: number, perTenantOverrides?: number },
  createdBy, createdAt, draftRev, lockedBy?, lockedAt?,
  publishedBy?, publishedAt?, approvedBy? (iki kişi kuralı açıksa)
}
// Kısmi unique indeks: { target:1 } where status='draft' → hedef başına en fazla 1 taslak
IntegrationConfigHeads { _id: target, publishedVersion, intake, maintenance?, updatedAt }   // yoklanan küçük belge
```
- **Yayın atomikliği:** yayın, `Heads.publishedVersion` üzerinde koşullu güncellemedir: `findOneAndUpdate({ _id: target, publishedVersion: basedOnVersion }, { $set: { publishedVersion: new } })`. Koşul tutmazsa (bu arada başka yayın olduysa) 409 döner: "Siz düzenlerken yeni bir sürüm yayınlandı. Farkı yeniden gözden geçirin." Başarılı olursa revizyonun durumu `published`, öncekinin `superseded` olur. Tek belge üzerindeki koşullu güncelleme yeterlidir, transaction gerekmez.
- **Filtre semantiği:** `status` ve `publishedVersion` alanlarının hepsi zorunlu ve varsayılanlıdır. `null` ya da alanın hiç olmaması hiçbir sorguda anlam taşımaz (C23 dersi: `$lt/$eq` ile `null` karşılaştırmasına dayanan filtre yazılmaz). Bu sorgular gerçek Mongo semantiğiyle test edilir (Karar 7 test stratejisi).

**3.2 Taslak → fark → onay → yayın:**
1. Admin bir alanı değiştirir. Taslak otomatik kaydedilir (`saveDraft`, `expectedDraftRev` ile iyimser kilit). Taslak yoksa açılır ve `lockedBy` = admin olur.
2. "Gözden geçir ve yayınla" → sunucu `previewPublish` hesaplar: fark tablosu (anahtar, eski, yeni, kaynak, tehlike, uygulanma zamanı), çapraz doğrulama sonuçları ve etki önizlemesi (3.3).
3. Onay kapısı: yalnız `safe` değişiklik varsa tek tık. `caution` varsa gerekçe zorunlu. `dangerous` varsa gerekçe + **yazılı onay** (hedef kodunu yazmak, ADR-0015 `EkConfirmDialog` yıkıcı varyantı) + iki kişi kuralı açıksa ikinci bir platformAdmin'in onayı.
4. Yayın. Denetim kaydı yazılır. `Heads` güncellenir. Pod'lar ≤15 sn içinde alır (3.6).

**3.3 Etki önizlemesi:** `activeTenants` = ApplicationDB `Clients` içinde `status:'ACTIVE'` olan ve `integrations[]` listesinde bu kodu taşıyan tenant sayısı ve listesi (K17). Tenant DB'sine inilmez. `_engine` hedefi için tüm aktif tenant'lar sayılır. `tenantOverridable` anahtarların sınırı değişiyorsa, sınır dışında kalacak tenant değerleri tenant DB'lerinde sayılır. Bu sayım ≤50 tenant'la sınırlıdır, üstünde "yaklaşık" etiketi gösterilir. Ayrıca `applies:'restart'` anahtar sayısı gösterilir ("Bu değişikliğin 2 ayarı yeniden başlatmadan sonra etkinleşir").

**3.4 Geri alma:** "Bu sürüme dön" butonu, seçilen eski revizyonun `overrides` görüntüsünü yeni bir revizyon olarak (`origin.kind:'rollback'`, `ref` = eski sürüm) **aynı onay kapısından** yayınlar. Tarih yeniden yazılmaz. "Tümünü varsayılana döndür" = boş `overrides` ile yayın. Alan başına "Varsayılana dön" taslakta anahtarı kaldırır.

**3.5 Denetim:** her `saveDraft/publish/rollback/discard/intake/lockTakeover` işlemi `AuditLogger`'a yazılır (`event: 'integration_config.<eylem>'`, `meta: { target, fromVersion, toVersion, changedKeys, dangerLevels, reason }`). Değerler de yazılır, çünkü katalog sır içermez (2.2) ve URL/sayı değerleri kişisel veri değildir. `sanitizeMeta` süzgecinden geçer. Gerekçe metni ≤500 karakterdir ve kişisel veri yazılmaması UI'da mikro-kopyayla hatırlatılır.

**3.6 Sıcak yükleme ve çok pod'da geçersiz kılma:**
- Her süreç (web, worker ve `all` rolü) `ConfigResolver` içinde 15 sn'de bir `IntegrationConfigHeads`'i tek sorguyla okur (tüm hedefler; ≤ 8 belge).
- Sürüm değiştiyse ilgili hedefin çözümlenmiş önbelleği atılır. `IntegrationFactory` önbellek anahtarına yapılandırma sürümü eklenir (`${clientId}_${code}_v${version}`), böylece eski örnek doğal olarak düşer. Bugünkü 5 dk'lık toplu temizleme kalır (tenant ayarı değişiklikleri için).
- `applies`: `immediate` = sonraki okumada; `next_cycle` = döngü her turda çözümleyiciden okur (Aşama B'de ilgili döngüler turda okumaya çevrilir; `ExportOrchestrator` zaten turda yeniden atıyor, `ExportOrchestrator.ts:113`); `restart` = `setInterval` aralıkları ve BullMQ `Worker` eşzamanlılığı gibi açılışta kurulan değerler. Panel bunları "Yeniden başlatma gerekir" rozetiyle gösterir ve pod'ların çalıştığı sürümü ("Yayında: v7 · Pod'larda etkin: v6, yeniden başlatma bekliyor") ayrı ayrı raporlar. Otomatik yeniden başlatma **yoktur**.
- Yoklama zamanlayıcısı ADR-0017 `JobRunRegistry` altında (`config-head-poll`) kaydedilir. ADR-0016'nın zamanlayıcı/olay kararı farklı bir mekanizma getirirse bu yoklama oraya taşınır, sözleşme (≤15 sn yayılım) değişmez.
- DB okunamazsa son bilinen yapılandırma kullanılır. 3 ardışık hata olursa `warn` log ve ADR-0017 sistem uyarısı üretilir. Açılışta hiç okunamazsa katalog varsayılanları + `legacy` ile açılır, **fail-closed değildir**. Bu bilinçli bir karardır: yapılandırma okunamadı diye sipariş çekmek durmamalıdır.

**3.7 Kilit ve çakışma:** hedef başına tek taslak (kısmi unique indeks). Taslağı başka bir admin açmışsa ekran salt-okunur olur ve "Ayşe düzenliyor, 12 dk önce" gösterir. Kilit 30 dk hareketsizlikte bayatlar. "Düzenlemeyi devral" yapılabilir ve denetlenir. `draftRev` iyimser kilidi aynı sekmenin iki kopyasındaki çakışmayı da yakalar.

**3.8 Kill-switch ve bakım modu (entegrasyon bazlı):**
- `IntegrationConfigHeads.intake`:
  - `on`: normal çalışma.
  - `drain`: **yeni iş alınmaz, süren işler biter.** ExportOrchestrator/Dispatcher o kodun bayraklarını seçmez. `OrderQueueProducer` yeni sipariş senkron işi kuyruğa koymaz. `StockPublishTrigger` o kanalı atlar. Webhook'lar **kabul edilmeye ve saklanmaya devam eder** (sipariş kaybı olmasın), işlenmeleri `on`'a dönülünce yapılır. Kuyruktaki ve lease'li işler tamamlanır.
  - `off`: `drain` + bu entegrasyon için kullanıcı tetiklemeli işlemler (`IntegrationService` uçları) 503 ve eşlenmiş TR ileti döner.
- `maintenance: { message: {tr,en}, until? }`: `drain` ile birlikte kullanılır ve ADR-0017 `IntegrationHealthItem.status = 'paused'` + neden kodu `INTEGRATION_MAINTENANCE` olarak tenant ekranında görünür. Platform durum bandı ADR-0017 Karar 6'ya aittir, bu yalnız entegrasyon bazlı neden ekler.
- **Riskler UI'da açıkça yazılır:** stok yayınını durdurmak aşırı satış riskini artırır. Sipariş çekmeyi uzun süre durdurmak sağlayıcı penceresini aşabilir (Trendyol ≤2 hafta / 10.000 kayıt). Bu yüzden `drain/off` 24 saati aşarsa ADR-0017 uyarısı üretilir (R-sınıfı yeni kural, 0017 kural tablosuna eklenir). `intake` değişikliği **yayın akışının dışındadır**: acil durumda tek adımda uygulanır (gerekçe + yazılı onay), ama yine denetlenir ve ≤15 sn yayılır.
- ADR-0019 `SystemFlags.disabledCapabilities` ile ilişki: o mekanizma **yetenek** bazlıdır (tüm yüzeylerde bir işlemi kapatır). Bu mekanizma **entegrasyon** bazlıdır ve motor döngülerini de durdurur. İkisi birlikte bulunabilir. UI'da her ikisi de aynı "geçici olarak devre dışı" durumuyla gösterilir.

**3.9 "Test et" (bağlantı / uç nokta doğrulama):**
- **Statik:** şema, host izinli listesi, emekli desen, yer tutucular, çapraz doğrulama.
- **Replay:** ADR-0018 `ProbeRunner` replay modu. Kayıtlı ve redakte edilmiş fikstürler, geçersiz kılınmış yapılandırmayla adaptör + dönüştürücüden geçirilir.
- **Canlı:** yalnız ADR-0018 B+ açıldığında, yalnız **platform düzeyi** test hesaplarıyla (`PROBE_<KOD>_*` env), yalnız salt-okunur probe uçlarında ve yalnız worker rolünde yapılır.
- **Tenant kimlik bilgisiyle test yasaktır** (ADR-0018 Karar 2b ile aynı gerekçe). Canlı hesap yoksa buton "Canlı doğrulama için platform test hesabı tanımlı değil" iletisini gösterir. Sahte bir "başarılı" gösterilmez (E3).

### Karar 4 — Yönetim arayüzü (admin panel, `platformAdmin`)

**4.1 Ekran haritası** (ADR-0012 sekmeli çalışma alanı; `screens.ts` anahtarları):

| Ekran | `screens.ts` anahtarı | Şablon (ADR-0015) | İçerik |
|---|---|---|---|
| **Entegrasyonlar** (liste) | `admin.integrations` | `EkListPage` + `EkDetailSheet` | Sütunlar: entegrasyon (`EkPlatformMark`), kategori, `adapterVersion`, kabul durumu (`EkStatusChip`: Açık / Boşaltılıyor / Kapalı / Bakımda), sağlık (ADR-0017 `IntegrationHealthItem` özeti), kapsam özeti (yetenek sayısı / `limited`), aktif tenant sayısı, açık uyum bulgusu (ADR-0018), yayındaki sürüm + son değişiklik (kim/ne zaman), "taslak var" işareti. Filtre: kategori, durum, "taslağı olanlar", "çelişki bulgusu olanlar". Satır → detay çekmecesi: özet, son 5 revizyon, açık bulgular, hızlı eylemler (Ayarları düzenle, Boşalt/Kapat/Bakım, Etkin yapılandırmayı gör). |
| **Entegrasyon ayarları** | `admin.integrationSettings?code=` | `EkSettingsTemplate` (960 px, sol alt-gezinme) | Sol alt-gezinme bölümleri: **Genel** (manifesto bilgisi salt-okunur, görünüm, kabul/bakım) · **Uç noktalar** (host seçimi; yol şablonları salt-okunur tablo; emekli uçlar ve tarihleri) · **Ürün gönderimi** · **Sipariş çekme** · **Stok ve fiyat** · **İade, soru ve finans** · **Oran sınırları ve dayanıklılık** · **Mock / gerçek mod** (salt-okunur, env kaynağı ve "bu ortamda mock AÇIK" uyarı bandı) · **Kapsam beyanı** (ADR-0018 yetenek çipleri, salt-okunur) · **Sürüm geçmişi** (tablo: sürüm, durum, kim, ne zaman, gerekçe, değişen anahtar sayısı → satır: fark görünümü + "Bu sürüme dön") · **Uyum bulguları** (ADR-0018 konsolunun bu koda süzülmüş listesi, "Ayar önerisi oluştur" eylemi, Karar 5). Yalnız o entegrasyona uygulanabilen bölümler görünür (ör. Bizimhesap'ta "Stok ve fiyat" yoksa gizli; kapsam beyanına göre). |
| **Motor ayarları** | `admin.engineSettings` | `EkSettingsTemplate` | Hedef `_engine`. Bölümler: Ürün gönderimi, İçe aktarma, Sipariş kuyruğu, İade/soru/finans zamanlaması, Stok yayını ve mutabakat, Önbellek, Sürüm geçmişi. `engine+integration` anahtarlarında "Entegrasyon bazında geçersiz kılınanlar: Trendyol (30 → 100)" bağlantısı. |
| **Etkin yapılandırma** | `admin.effectiveConfig?code=` | `EkReadonlyPanelTemplate` | Salt-okunur tablo: anahtar, etkin değer, **kaynak çipi** (Varsayılan / Platform v7 / Tenant / Ortam değişkeni / Eski DB), varsayılan, uygulanma zamanı. "Çelişkiler" filtresi (legacy ≠ default, emekli, env kilidi). Pod başına etkin sürüm. Dışa aktarma (JSON, sır içermez). |
| **Yayın diyaloğu** | (diyalog) | `EkDetailSheet` (fark) + `EkConfirmDialog` | Fark tablosu, etki özeti ("3 aktif mağaza etkilenir · 2 ayar yeniden başlatma gerektirir"), çapraz doğrulama uyarıları, gerekçe alanı, dangerous için yazılı onay. |

**4.2 Alan anatomisi** (tek `SettingField` bileşeni; katalog tanımından üretilir):
- Etiket (sade TR), bir satır açıklama, "?" ile genişleyen etki notu.
- Birim son eki. Süreler insan biçiminde girilir ve gösterilir ("30 sn", "15 dk"), saklama ms'dir. `format.ts` kullanılır.
- "Varsayılan: 30" + "Etkin: 50 · Platform v7" kaynak çipi.
- Tehlike rozeti (`EkStatusChip` durum kodları `setting.caution` / `setting.dangerous`, `status-map.ts`'e eklenir; `safe` rozet göstermez).
- Uygulanma rozeti ("Hemen" / "Sonraki turda" / "Yeniden başlatma gerekir").
- "Varsayılana dön" bağlantısı (değer varsayılandan farklıysa).
- Env kilitliyse alan devre dışıdır ve "`TY_HTTP_TIMEOUT_MS` ortam değişkeniyle kilitli" yazar.
- Güvenli aralık dışında satır içi uyarı çıkar: "Önerilen aralık 10–200. Bu değer tehlikeli değişiklik onayı gerektirir."

**4.3 Anlaşılırlık kuralları** (ilk kez kullanan bir admin için):
- Her bölümün başında 1-2 cümlelik "Bu bölüm ne yapar" açıklaması bulunur (`EkSettingsTemplate` sol sütunu).
- `advanced:true` alanlar "Gelişmiş ayarlar" altında katlı gelir. Varsayılan görünümde bölüm başına ≤6 alan olur.
- Sayfa üstünde **arama** vardır (etiket, anahtar ve açıklama üzerinden, tüm bölümlerde). Arama sonucu bölüme atlar ve alanı vurgular.
- Filtre çipleri: "Yalnız değiştirilmişler", "Yalnız tehlikeliler", "Taslaktaki değişiklikler".
- Anahtar adları (`export.publisher.chunkSize`) yalnız "Gelişmiş bilgi" satırında ve kopyalanabilir biçimde görünür. Birincil metin her zaman TR etikettir.
- Yapışkan kaydet çubuğu: "Taslak kaydedildi 14:05 · 3 değişiklik · [Taslağı at] [Gözden geçir ve yayınla]". Kaydedilmemiş değişiklik uyarısı ADR-0012 `beforeClose` ile verilir.

**4.4 Durumlar (C2):** yükleniyor (`EkSkeleton form`), hata (`EkErrorState` + Destek kodu), yetkisiz (rota koruması + sunucu 403 → "Bu ekran yalnız platform yöneticileri içindir"), salt-okunur (başkası düzenliyor, ya da ADR-0019 `SystemFlags` ile ayar yönetimi geçici kapalı), boş (sürüm geçmişi yok: "Henüz hiçbir ayar değiştirilmedi; tüm değerler varsayılan"), çakışma (409: fark yeniden gösterilir).

**4.5 Kapsam dışı:** tenant-yüzlü entegrasyon kurulum ekranları (`views/secure/integrations/*`: kimlik bilgisi girme, `stockPolicy`, bağlantı testi). **İlişki:** tenant ekranları katalogdan yalnız `tenantOverridable` alanları ve sınırlarını okur (aynı `SettingField` bileşeni, `tenant` kaynağıyla). Kapsam rozetleri ADR-0018 `getCatalog`'dan gelir. Bakım/kapalı durumu tenant ekranında ADR-0017 sağlık nedeni olarak görünür.

### Karar 5 — Drift entegrasyonu (ADR-0018)
- `IntegrationFinding.kind ∈ {endpoint, version, deprecation}` olan ve `status ∈ {new, triaged, accepted}` durumundaki bir bulgunun detayında **"Ayar değişikliği önerisi oluştur"** eylemi bulunur.
- Eylem, hedef entegrasyon için bir **taslak revizyon** açar (`origin: { kind:'finding', ref: findingId }`). Öneri içeriği manifestodan türetilir: emekli uç eşleşmesi varsa `replacementKey`'in host seçimi, `Sunset` başlığı varsa ilgili uç. Serbest metin önerisi `recommendation` alanından **yalnız bilgi olarak** gelir ve taslağa otomatik değer yazmaz.
- Taslak normal yayın akışından geçer (Karar 3.2). Yayında bulgu `fixRef = 'config:v<N>'` ile `fixed` durumuna geçer. **Kod değişikliği gerektiren** bulgu (yol şablonu, yanıt şekli) için eylem gizlenir ve yerine "Kod değişikliği gerekir" etiketi gösterilir. C22 türü bir sürüm geçişi panelden yapılamaz, kodla gelir. Panel yalnız host/eski-değer temizliği yapar.
- **Kuyruk:** taslak revizyonun kendisi öneridir. İkinci bir öneri kuyruğu yazılmaz. ADR-0018 Aşama C'de ajanlar gelince, ajan `integrations.config.proposeChange` yeteneğini çağırır ve bu çağrı ADR-0018 `ActionProposals`'a bir kayıt düşer. Onaylandığında **aynı** taslak/yayın yoluna gider (`origin.kind:'agent'`). Ajan hiçbir zaman yayınlayamaz.

### Karar 6 — Yetenek kaydı (ADR-0019)
Hepsi `domain:'platform'`, `scope:'platform'`, `minTier:'platformAdmin'`, `external:false` (test hariç), `pii:'none'`. MCP kararı `notExposed({ reason:'platform_admin', note:'OAuth token\'ında ga yok (ADR-0010); platform yapılandırması yalnız panelden ve yazılı onayla' })`.

| Yetenek | effect | idempotency | undo | agent |
|---|---|---|---|---|
| `platform.integrations.list` | read | n/a | none | allowed, read |
| `platform.integrationConfig.get` (etkin yapılandırma + kaynak; hedef = kod ya da `_engine`) | read | n/a | none | allowed, read |
| `platform.integrationConfig.history` | read | n/a | none | allowed, read |
| `platform.integrationConfig.saveDraft` | write | natural (`expectedDraftRev`) | discardDraft | false |
| `platform.integrationConfig.discardDraft` | write | natural | none | false |
| `platform.integrationConfig.previewPublish` (fark + etki + doğrulama) | propose | n/a | none | allowed, propose |
| `platform.integrationConfig.publish` | write (dangerous içeren yayında onay `typed`) | natural (`basedOnVersion`) | compensate → `rollback` | false |
| `platform.integrationConfig.rollback` | write | natural | compensate → `rollback` | false |
| `platform.integrationConfig.takeOverLock` | write | natural | none | false |
| `platform.integrationConfig.proposeFromFinding` | write (yalnız taslak açar) | key (`findingId`) | discardDraft | allowed, **propose** (ADR-0018 3b) |
| `platform.integrationConfig.testEndpoint` | read (statik + replay; canlı yalnız B+) | n/a | none | false |
| `platform.integrations.setIntake` (on/drain/off + bakım) | **destructive** (hizmeti durdurur; geri alınabilir ama iş etkisi yüksek) | natural | compensate → `setIntake(on)` | false |

`OPERATION_POLICY`'ye `IntegrationConfigService` altında `P` kademesiyle girer (ADR-0019 Aşama A öncesiyse elle, sonrasıysa türetilir). Her write/destructive çağrı `AuditLogs`'a `source` alanıyla yazılır (ADR-0019 §4).

### Karar 7 — Göç ve uygulama planı

**7.1 Göç ilkeleri:**
- Kural 3 geçerlidir: hem Atlas hem yerel için güncel ve doğrulanmış yedek olmadan hiçbir DB yazan adım atılmaz. Canlı (Atlas) göç **insan adımıdır** (Protokol 12).
- Yerel `entegrasyonikDB` üzerinde çalıştırma yalnız yedek varken ve varsayılanı `--dry-run` olan araçla yapılır. İzinli 7 DB dışına dokunulmaz.
- **Göç aracı** `backend/tools/migrate-integration-config.ts`:
  - `Integrations.urls` ve bilinen platform alanlarını okur.
  - Her değeri manifestoyla karşılaştırır: aynı mı / host farkı / yol farkı / emekli / ayrışmıyor.
  - Rapor üretir. `--apply` verilirse **yalnız** "host farkı" ve "görünüm" değerlerini `origin.kind:'migration'` ile tek bir v1 revizyonuna yazar.
  - Emekli ve yol farkı olan değerler taşınmaz, raporda "kod varsayılanı kullanılacak" olarak listelenir.
  - `Integrations` belgesine dokunmaz.
- Göç sonrası `legacy` katmanı **bir sürüm boyunca** okunmaya devam eder ama `platform` katmanı onu gölgeler. Legacy'nin kapatılması (`CONFIG_LEGACY_LAYER=off`) ayrı bir adımdır ve 14 gün `config_drift` bulgusu çıkmazsa yapılır.
- Motor JSON dosyaları (`*.config.json`) ve sabitler katalog varsayılanlarına taşınır. JSON dosyaları Aşama A sonunda silinir (D7 temizlik). DB göçü gerektirmez.

**7.2 Aşamalar:**

| Aşama | Kapsam | Ne zaman | Çıkış kapısı (DoD) | Test stratejisi | Risk / geri alma |
|---|---|---|---|---|---|
| **A0 — C22 köprüsü** | C22 çalışması emekli desen listesini Trendyol `descriptor.ts` → `config.retiredEndpoints` alanına koyar; okuma yolunda eşleşen DB değeri yerine kod varsayılanı + uyarı (1.5) | **hemen, C22 ile** (bu ADR'nin diğer aşamalarını beklemez) | C22'nin kendi DoD'si + "emekli DB değeri → V2 varsayılanı" karakterizasyon testi | mock; karakterizasyon önce | C22 planındaki geri alma |
| **A — Katalog + şema + çözümleyici (salt okuma), davranış DEĞİŞMEZ** (backend, M) | `integration/config/`: `SettingDef` tipi, katalog (Karar 2.3), `crossChecks`, `ConfigResolver` (`default ← legacy`; `platform` katmanı boş), manifesto `config` alanı (6 adaptör: `hosts`, `endpoints`, `retiredEndpoints`, `limits`); `IntegrationFactory.getIntegrationConfig` çözümleyiciden okur (adaptöre giden `integrationSettings.urls` şekli **aynı** kalır: çözümleyici, `host+pathTemplate`'ten tam URL üretip bugünkü anahtarlarla verir); motor tüketicileri (`Publisher`, `Dispatcher`, orkestratörler, `OrderQueueProducer`, stok zamanlayıcıları, HTTP servisleri) `getSetting(key, code?)` ile okur; `config_drift` taraması (1.5); K7 düzeltmesi (tenant `settings.urls` okunmaz, tenant yazma izinli listesi); K8 düzeltmesi (`IntegrationService.get` projeksiyonu yalnız görünüm alanları); `platform.integrationConfig.get/history` okuma uçları; `docs/INTEGRATION_SETTINGS.md` katalogdan üretilir | **ADR-0017 A'dan bağımsız başlayabilir** (zod'u ilk gelen ekler); ADR-0018 A ile `descriptor.ts` sahiplik kuralı (Uyum notları) | **Önce karakterizasyon:** her tüketicide bugünkü etkin değeri sabitleyen test (JSON değeri; K10 çelişkileri test adında belgelenir) ve 6 adaptörde "yerel `Integrations.urls` fikstürü → adaptörün çağırdığı URL" anlık görüntüsü. Sonra: tüm karakterizasyon testleri **değişmeden** yeşil (K7 testi hariç, o kasıtlı ters çevrilir); katalog tutarlılık testleri (her `consumers` dosyası anahtarı gerçekten okuyor, JSON'da kataloğa girmemiş anahtar yok, `process.env` okuyan motor sabiti kalmadı mandalı, sır adı yasağı, TR/EN etiket var); tsc 0; testler 3× yeşil | birim + karakterizasyon (mock DB); gerçek ağ/DB yok | `CONFIG_RESOLVER=off` → tüketiciler katalog varsayılanlarını doğrudan okur (JSON'la aynı değerler), fabrika eski birleştirmeye döner |
| **B — Yazma + sürümleme + denetim + geri alma + yayılım** (backend, M) | `IntegrationConfigRevisions/Heads` şemaları ve indeksleri; `IntegrationConfigService` (saveDraft/discard/previewPublish/publish/rollback/takeOverLock/testEndpoint[statik+replay]); iki kişi kuralı bayrağı (kapalı); denetim; `config-head-poll` (15 sn); fabrika önbellek anahtarına sürüm eklenmesi; `next_cycle` tüketicilerinin turda okuması; pod etkin sürüm raporu (ADR-0017 heartbeat alanına eklenir); göç aracı (`--dry-run` varsayılan) | A'dan sonra | yayın yarışı testi (iki eşzamanlı yayın → biri 409); tek-taslak indeks testi; emekli/host/IP/özel ağ/`http` reddi tablo testleri; bilinmeyen anahtar reddi; env kilitli anahtara yazma reddi; geri alma = yeni revizyon; sahte saatle 15 sn yayılım testi (iki "pod" örneği); DB okunamazken son bilinen yapılandırma; denetim kaydında sır/PII yok; göç aracı fikstür raporları (aynı/host/yol/emekli/ayrışmaz) ve `--dry-run`'da sıfır yazma | birim (mock repo) + **Mongo filtre semantiği testleri** (koşullu yayın güncellemesi, kısmi unique indeks, en son yayın sorgusu; C23 dersi) `mongodb-memory-server` ile. İndirme dizini proje içinde ve git-ignored (`MONGOMS_DOWNLOAD_DIR`; kural 1). İzinli 7 DB'ye ve Atlas'a dokunulmaz. C23 çalışması başka bir mekanizma seçtiyse o yeniden kullanılır. | yazma uçlarını OPERATION_POLICY'den kaldırmak; `platform` katmanı boşken davranış A ile aynı |
| **B-göç — canlı DB** (insan) | yerel: yedek + `--dry-run` raporu + `--apply`; Atlas: yedek + rapor + insan onayı + `--apply` | B + C22 V2 kodunun canlı doğrulanmasından **sonra** (varsayılan) | rapordaki "taşınmayan" değerlerin her biri için karar kaydı; 14 gün `config_drift` sıfır → `CONFIG_LEGACY_LAYER=off` | — | v1 revizyonu `discarded` + legacy katmanı açık kalır |
| **C — Admin panel ekranları** (frontend, M-L) | Karar 4 ekranları, `SettingField`, arama/filtre, yayın diyaloğu, sürüm geçmişi + fark, etkin yapılandırma, `screens.ts` anahtarları, i18n TR/EN, `status-map.ts` ek durumları | **ADR-0015 Aşama A (A2 DS bileşenleri) sonrası**; B uçları hazırken; ADR-0017 D konsol sekmeleriyle paralel olabilir | Playwright (sentetik fikstür, 375/800/1280, axe 0 yeni ihlal): liste → ayar → değiştir → fark → gerekçe → yayın; dangerous'ta yazılı onay; 409 çakışma; kilitli taslak salt-okunur; env kilitli alan devre dışı; yetkisiz 403 durumu; arama bölüme atlıyor; desen sayacı mandalı (şablon dışı kullanım 0) | e2e (mock API) + bileşen testleri | rota gizlenir; backend etkilenmez |
| **D — Drift önerisi + kill-switch + bakım** (backend S-M, frontend S) | `proposeFromFinding` (ADR-0018 A/B gerekli), `setIntake` + motor kontrolleri (Dispatcher/Orkestratörler/OrderQueueProducer/StockPublishTrigger/IntegrationService), bakım nedeni → ADR-0017 sağlık, 24 sa `drain/off` uyarısı | ADR-0018 B ve ADR-0017 C sonrası. **Hızlandırma eşiği:** entegrasyon kaynaklı bir olayda "entegrasyonu durdur" ihtiyacı doğarsa `setIntake` backend'i B ile birlikte öne çekilir | drain testi: yeni iş alınmıyor, lease'li iş tamamlanıyor, webhook saklanıyor ve `on`'da işleniyor; `off`'ta kullanıcı uçları 503 + TR ileti; ≤15 sn yayılım; bulgudan taslak (kod gerektiren bulguda eylem yok); ajan kaynağı yayınlayamaz | birim + karakterizasyon (motor döngüleri mock) + e2e | `intake=on`; özellik bayrağı |

**Sıra ve paralellik:** A0 ∥ (A ∥ ADR-0017 A ∥ ADR-0018 A) → B → (C ∥ ADR-0017 D) → D. ADR-0019 A önce gelirse yetenekler oradan türetilir, sonra gelirse A/B'de `OPERATION_POLICY` elle yazılır ve içe aktarıcı onları alır. ADR-0016 bir klasör taşıması isterse A'dan önce uygulanır, sonra uygulanırsa taşıma saf bir yeniden adlandırmadır.

**Yeniden yazım yok:** bu ADR hiçbir modülü yeniden yazmaz. Tüketicilerde yalnız sabit/JSON okuması çözümleyici çağrısıyla değişir, önce karakterizasyon yazılır (Protokol 13). `IntegrationFactory`'nin birleştirme fonksiyonu refactor edilir, davranışı testle sabitlenir.

### Karar 8 — PLATFORM_BASELINE uyumu

| Satır | Durum | Not |
|---|---|---|
| A1 Gözlemlenebilirlik | **Uygulanır** | yayın/geri alma/drift olayları yapılandırılmış log; pod etkin sürüm raporu; `config_drift` bulguları ADR-0018 konsolunda |
| A2 Hata yönetimi | **Uygulanır** | doğrulama hataları alan bazlı TR ileti; 409 çakışma zarfı; `off` durumunda eşlenmiş 503 |
| A3 Dayanıklılık | **Uygulanır** | DB okunamazsa son bilinen yapılandırma (fail-open, bilinçli); koşullu yayın; `drain` süren işleri bitirir |
| A4 Zamanlanmış işler | **Uygulanır** | `config-head-poll` `JobRunRegistry` altında; `applies:'restart'` görünür |
| A5 Yaşam döngüsü | Uygulanır | açılışta katalog ↔ DB uyumu taraması; `catalogVersion` uyuşmazlığı log + bulgu |
| A6 Yedekleme/DR | **Uygulanır** | canlı göç yedek şartı; revizyonlar geri alma yolu |
| A7 Kapasite | Uygulanır | yoklama ≤8 belge/15 sn; etki sayımı ≤50 tenant sınırı |
| A8 Sürüm/göç | **Uygulanır** | revizyon + `catalogVersion`; göç aracı `--dry-run` varsayılan; legacy katmanı kademeli kapanır |
| B1 Kimlik/yetki | **Uygulanır** | tüm uçlar platformAdmin + OPERATION_POLICY; FE yalnız yansıtır |
| B2 Tenant izolasyonu | **Uygulanır** | platform ayarı tenant verisi taşımaz; tenant ayarı izinli listeyle sınırlı (K7) |
| B3 Girdi doğrulama | **Uygulanır (çekirdek)** | strict zod, bilinmeyen anahtar reddi, çapraz doğrulama, mass-assignment kapandı (K7) |
| B4 Sır yönetimi | **Uygulanır** | katalogda sır türü yok; sır adı yasağı testi; probe kimlikleri env |
| B5 Web güvenliği | **Uygulanır** | SSRF: https + host izinli listesi + IP/özel ağ reddi |
| B6 Kötüye kullanım | Uygulanır | ratePerMin artırma dangerous; yazma uçları genel API sınırında |
| B7 Denetim izi | **Uygulanır** | her yazma/yayın/geri alma/intake denetimli; gerekçe zorunluluğu |
| B8 KVKK | Uygulanmaz (genel) | katalog kişisel veri taşımaz; gerekçe alanında PII uyarısı |
| B9 Bağımlılık/lisans | Uygulanır | `zod` (MIT, ADR-0017); `mongodb-memory-server` (MIT, yalnız dev) |
| B10 Oturum/hesap | Uygulanmaz | yeni oturum modeli yok |
| C1 Tasarım sistemi | **Uygulanır** | yalnız ADR-0015 şablonları; yeni şablon yok |
| C2 Durumlar | **Uygulanır** | Karar 4.4 |
| C3 Erişilebilirlik | Uygulanır | axe 0 yeni ihlal; rozetler metinli |
| C4 Hareket | Uygulanır (genel) | — |
| C5 i18n | **Uygulanır** | katalog etiket/açıklama TR/EN zorunlu (test) |
| C6 Duyarlılık | Uygulanır | 375/800/1280 |
| C7 Mikro-kopya/dürüstlük | **Uygulanır** | sade dil, tehlike ve etki notu; canlı test yoksa sahte başarı yok |
| C8 Onboarding/yardım | Uygulanır | bölüm açıklamaları, alan yardımı |
| C9 Toplu işlem | Uygulanır (kısmi) | taslakta çoklu değişiklik + tek yayın; "tümünü varsayılana döndür" |
| C10 Bildirim | Uygulanır | 24 sa `drain/off` uyarısı; bakım nedeni tenant sağlığında |
| D1 Test piramidi | **Uygulanır** | karakterizasyon → birim → Mongo semantiği → e2e |
| D2 Kalite kapıları | Uygulanır | katalog tutarlılığı, `process.env` mandalı, desen sayacı |
| D3 Modülerlik | Uygulanır | `integration/config/` tek modül (yerleşim ADR-0016) |
| D4 Yapılandırma | **Uygulanır (çekirdek)** | motor sabitleri ve JSON'lar tek katalogda; env yalnız dağıtım; ölü `\|\|` yedekleri silinir |
| D5 API sözleşmesi | Uygulanır | tutarlı zarf, 409, sürüm alanları |
| D6 Belgeleme | **Uygulanır** | `docs/INTEGRATION_SETTINGS.md` katalogdan üretilir |
| D7 Temizlik | Uygulanır | `*.config.json` ve ölü yedekler silinir; legacy katmanı kapanır |
| D8 Geliştirici deneyimi | Uygulanır | `.env.example` mock satırları korunur; katalog belgesi |
| D9 Git hijyeni | Uygulanır (genel) | — |
| E1 Plan/kota | Uygulanmaz | platform ayarı plan özelliği değil |
| E2 Faturalama | Uygulanmaz | — |
| E3 Entegrasyon dürüstlüğü | **Uygulanır** | kapsam beyanı salt-okunur manifestodan; mock durumu görünür; kapalı/bakım tenant'a görünür |
| E4 Ürün analitiği | Uygulanmaz | — |
| E5 Destek/operasyon araçları | **Uygulanır** | etkin yapılandırma görünümü, kill-switch, bakım |
| E6 Genişleme noktaları | Uygulanır | ajan öneri yolu (ADR-0018 C) aynı taslak/yayın akışına bağlı |
| E7 Yasal/marka | Uygulanmaz | — |
| E8 Yetenek eşitliği | **Uygulanır** | Karar 6: tüm uçlar kayıtta, MCP `notExposed(platform_admin)` gerekçeli |

### Karar 9 — Açık insan kararları (hepsinin varsayılanı var, fabrikayı durdurmaz)
1. **İki kişi kuralı** (`dangerous` yayın ve `setIntake(off)` için ikinci platformAdmin onayı). *Varsayılan:* **kapalı**. Bugün tek platformAdmin var, kural açılırsa hiçbir tehlikeli değişiklik yapılamaz. Yerine gerekçe + yazılı onay + denetim + tek tık geri alma uygulanır. *Açılma eşiği:* aktif platformAdmin sayısı ≥2 **ve** ekip dışı (destek/operasyon) bir kişiye platformAdmin verildiğinde, ya da bir dangerous değişiklik bir olaya yol açtığında.
2. **Canlı DB göç zamanı** (`Integrations.urls` → v1 revizyonu, Atlas). *Varsayılan:* B tamamlandıktan **ve** C22 V2 kodu canlıda doğrulandıktan sonra, bir bakım penceresinde, yedekle. 15 Ekim öncesinde yalnız C22'nin kendi dar URL düzeltmesi yapılır.
3. **Hangi ayarlar tehlikeli sayılır.** *Varsayılan* (Karar 2.3 tablosu): host/yol, `ratePerMin` artışı, lease/kilit süreleri, sipariş geriye dönük penceresi, kanal üst sınırı, aşırı satış telafisi, `intake` → **dangerous**; chunk/batch/eşzamanlılık/aralıklar → **caution**; bekleme süreleri, sayfa boyutu (sağlayıcı sınırı içinde), görünüm → **safe**. İnsan bir anahtarı yeniden sınıflarsa yalnız katalogda tek satır değişir.
4. **(Küçük) Tenant bazında platform geçersiz kılması** (ör. büyük bir tenant için daha büyük chunk). *Varsayılan:* **yok**. *Eşik:* tek tenant'ta >50.000 aktif SKU **veya** ≥20 aktif tenant.

## Gerekçe
- **Maliyet bilinci:** yeni servis, süreç ve ücretli hesap yok. İki küçük koleksiyon, bir çözümleyici, bir 15 sn'lik yoklama ve bir ekran grubu ekleniyor. Harici bayrak servisi, pub/sub ve iş akışı motoru reddedildi. Tek haneli ölçekte sorun hacim değil, **yanlış tek değişikliğin herkese etkisi**dir. Yatırım bu yüzden doğrulama, fark, onay ve geri almaya yapıldı.
- **C22 tekrar etmesin:** kök neden "DB değeri kodu sessizce ezer" idi (K5). Yol şablonu artık kodda, DB yalnız izinli host'ları seçiyor. Emekli uç yazmada reddediliyor, okumada yok sayılıp bulgu üretiyor. Kod ↔ DB çelişkisi `config_drift` olarak görünür hâle geliyor.
- **Anlaşılırlık yönergesi:** form katalogdan üretiliyor. Etiket, açıklama, birim, varsayılan, etkin değer + kaynak, tehlike ve etki notu her alanda aynı yerde duruyor. Gelişmiş alanlar katlı. Tek iş = tek desen (ADR-0015).
- **Güvenlik kazanımı:** K7 (tenant URL geçersiz kılması → SSRF) ve K8 (member'a `urls` dönmesi) bu işin doğal yan ürünü olarak kapanıyor.
- **Yeniden yazım yok:** tüketiciler yalnız okuma noktasında değişiyor, davranış karakterizasyonla sabitleniyor.

## Maliyet/Ölçek Notu
- **Ek maliyet:** 2 ApplicationDB koleksiyonu (`IntegrationConfigRevisions`: yılda <1.000 belge, <5 MB; `IntegrationConfigHeads`: ≤ entegrasyon sayısı + 1). Pod başına dakikada 4 hafif sorgu. Bağımlılık: `zod` (ADR-0017 ile ortak) ve `mongodb-memory-server` (yalnız dev). Operasyon yükü: değişiklik başına 1-3 dk (gerekçe + onay).
- **Yeniden değerlendirme eşikleri (sayısal):**
  - Pod sayısı ≥5 **veya** kill-switch yayılım gereksinimi <5 sn olursa → yoklamanın üstüne Redis pub/sub hızlandırıcısı eklenir (doğruluk yine yoklamada kalır).
  - Revizyon sayısı hedef başına >500 **veya** toplam >10.000 olursa → 2 yıldan eski `superseded` revizyonlar arşivlenir (hedef başına son 50 kalır).
  - Entegrasyon sayısı ≥15 **veya** katalog anahtar sayısı >400 olursa → katalog belgesi ve form bölümleri koddan otomatik gruplanır, arama sunucu tarafına alınır.
  - Aktif platformAdmin ≥2 ve ekip dışı erişim → iki kişi kuralı (Karar 9.1).
  - Ayda >20 yayın **veya** yayın kaynaklı bir olay → "zamanlanmış yayın" ve "kademeli açılış" (önce tek tenant/pod) değerlendirilir.
  - Tenant bazında ayar isteği ≥3 tenant'tan gelirse → `tenantOverridable` kümesi genişletilir (anahtar başına karar).
  - Ücretli bayrak/yapılandırma servisi yalnız: entegrasyon ≥25 **ve** ≥3 ortam (prod/stage/bölge) **ve** deney/A-B ihtiyacı birlikte oluşursa (Protokol 12).
  - Platform düzeyi diğer ayarların (hız sınırları, deneme süresi vb.) aynı kataloğa alınması: bu ayarlardan birinin ayda >1 kez değiştirilmesi gerekirse.

## Etki Alanı
- **Backend:**
  - yeni `src/integration/config/` (`types.ts`, `catalog/*.ts`, `crossChecks.ts`, `ConfigResolver.ts`, `ConfigHeadPoller.ts`, `urlGuard.ts`, `revisionRepository.ts`),
  - `modules/*/*/descriptor.ts` (`config` alanı; tip sahibi ADR-0018),
  - `modules/IntegrationFactory.ts` (birleştirme + önbellek anahtarı),
  - motor tüketicileri: `engine/catalog/export/{Dispatcher,Validator,Publisher,Sentinel,Sync,ExportOrchestrator}.ts`, `engine/catalog/import/{Importer,Stager,ImportOrchestrator}.ts`, `engine/order/{OrderOrchestrator,OrderQueueProducer,OrderWorker,worker-runner}.ts`, `engine/IntegrationEngine.ts`,
  - `operations/stock/{StockPublishTrigger,StockPublishScheduler,Reconciliation*,OversellCompensation*,AllocationSweepScheduler}.ts`,
  - adaptör `services/Service.ts` (HTTP politikası) ve sayfa boyutu okuyan connector'lar,
  - `hepsiburada/services/Service.ts:34` (K7),
  - `api/services/integration-service.ts` (K7 izinli liste, K8 projeksiyon),
  - yeni `api/services/integration-config-service.ts`, `api/operationPolicy.ts` + `docs/OPERATION_POLICY.md`,
  - ApplicationDB şemaları (`IntegrationConfigRevisions`, `IntegrationConfigHeads`),
  - `tools/migrate-integration-config.ts`,
  - silinen `engine/**/*.config.json`.
- **Testler:** `tests/characterization/config/**` (tüketici değerleri, adaptör URL anlık görüntüleri, K7), `tests/unit/config/**`, `tests/mongo-semantics/**` (yeni, memory-server), katalog tutarlılık testleri.
- **Frontend:** `views/secure/adminPanel/integrations/*` (liste, ayarlar, motor, etkin yapılandırma), `components/settings/SettingField.vue`, `navigation/screens.ts`, `status-map.ts`, i18n.
- **Belgeler:** yeni `docs/INTEGRATION_SETTINGS.md` (üretilir), `INTEGRATIONS_REGISTRY.md` (uç/host kaynağı manifestodur notu), `docs/OPERATION_POLICY.md`.
- **İlişkili ADR'ler:** 0003 (sırlar, tenant ayarı), 0004 (stok politikası sınırları), 0005 (sipariş kuyruğu parametreleri), 0006 (HTTP dayanıklılık), 0012 (sekmeli alan, `beforeClose`), 0015 (şablonlar), 0016 (yerleşim), 0017 (zod, env şeması, JobRunRegistry, sağlık nedeni, uyarı), 0018 (manifesto, IntegrationFinding, ActionProposals, ProbeRunner), 0019 (yetenek kaydı, SystemFlags).
- **Orkestratöre önerilen yeni BACKLOG kalemleri** (bu ADR BACKLOG'u güncellemez): K7 (tenant `settings.urls` → SSRF, CRITICAL adayı), K8 (member'a `Integrations.urls/profitRate` dönmesi, düşük), K10 (JSON ↔ `||` yedek çelişkileri; Aşama A'da temizlenir).

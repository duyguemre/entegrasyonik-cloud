# 0016 — Backend Hedef Mimarisi ve Modernizasyon Planı (modüler monolit, katman sözleşmesi, zamanlayıcı, portlar, API sözleşmesi, test ve faz planı)

## Durum
Kabul edildi (2026-09-28). Uygulama beş fazda yapılır (§9). Bunlara ek olarak fazdan bağımsız bir "hemen" listesi vardır (§9.1). İnsan kararı gerektiren noktalar §10.2'dedir ve hepsinin bir varsayılanı vardır. Varsayılanlarla ilerlemek Protokol 12'yi tetiklemez: ücretli servis alınmaz, canlı sisteme dokunulmaz.

**Bu ADR hiçbir modülü yeniden yazmaz.** `adr-writing` özel kuralının iki koşulu (somut çürüme kanıtı ve karakterizasyon testlerinin yazılabilir olması) hiçbir modül için birlikte sağlanmadı. `BACKEND_CODE_AUDIT.md` olgunluk tablosunda en düşük puanlı alanlar (e-posta 1,2 · bildirim 1,7) **eksik**tir, çürümüş değildir. Tüm değişiklikler kademeli refaktör, ek (additive) yapı ya da karakterizasyon testinin ardından yapılan davranış düzeltmesidir (Protokol 13).

**Diğer ADR'lerle ilişkisi:**
- ADR-0017 (gözlemlenebilirlik), ADR-0018 (entegrasyon uyumu / ajan) ve ADR-0019 (yetenek kaydı) ile **çelişmez**. Bu ADR onların uygulama sırasını ve yerleşimini birleştirir.
- **Klasör yerleşiminde bu ADR kazanır.** ADR-0017 ve ADR-0018'deki yol önerileri §1.3'teki tabloyla yeniden eşlenir.
- **Tek bilinçli değişiklik (gerekçeli):** ADR-0017 Karar 3'teki "zamanlayıcıya lease şimdi eklenmez" hükmü öne çekilir (§2.2). Bunun gerekçesi, ADR-0017'nin değerlendirmediği iki olgudur: kayan (rolling) dağıtımda iki pod'un kısa süre üst üste çalışması ve GV-08'deki dış yan etki.
- ADR-0018'in `IntegrationFactory` için "120 sn timeout Proxy'si" ifadesinin yerini §3.3 alır. Proxy kaldırılır.

## Bağlam

**Proje sahibinin yönergesi (2026-09-28):**
- "SaaS entegrasyon işleri için olması gereken her şey olmalı, doğru mimari olmalı; hatalı yapılar varsa modern bir backend yapılanması istiyorum; gereksiz dosyaları silebilirsin; eksiksiz bir backend istiyorum — genel hatlara uyarak."
- "Var olan yapıları da olması gereken noktaya çıkar; genel altyapılarda best practice'ler premium seviyede olsun."
- Entegrasyon kapsamı beş kategoridir: pazaryeri, e-ticaret, ERP, e-fatura ve kargo. Ayrıca API değişim izleme, ajan-hazır altyapı ve chat-as-UI/MCP eşitliği istenir.

**Ana girdi:** `docs/BACKEND_CODE_AUDIT.md` (2026-09-28, `faz3-arayuz` @ 451dda5). Bu ADR'yi tetikleyen bulgular:

| Bulgu | Kanıt (audit ID) | Bu ADR'de |
|---|---|---|
| Girdi doğrulama yok. 20+ kaçışsız `$regex`, sınırsız `limit`, istemciden gelen `sort`, tüm gövdeyi `$set`'leme | MM-08, GV-01, GV-06 | §4 |
| 5 statik `setInterval`, `IntegrationEngine`/`OrderOrchestrator` aralıkları. Lider/kilit/örtüşme koruması yok, kapanışta durdurulmuyorlar. `OversellCompensationJob` çift iptal riski taşıyor | MM-13, GV-08 | §2 |
| `PROCESS_NEXT_SIGNAL` süreç-içi `EventEmitter`. `web` → `worker` sinyali kayboluyor (≤ 5 dk gecikme) | MM-14 | §2.4 |
| `IPlatform` ~37 metot, 23 `NOT_SUPPORTED`. Fabrika `switch` ile çalışıyor, yalnız 3 kategori dizisini arıyor. Proxy zaman aşımı iptal edilemiyor, statik toplu önbellek var | MM-17, MM-18 | §3 |
| Hata zarfı ham `e.message` sızdırıyor, hata kodu yok | MM-09, GV-07 | §4.3 |
| 26 RPC servis sınıfı doğrudan model/aggregate kullanıyor. God class'lar var (`integration-service` 1330 satır). Ters bağımlılıklar: `operations→api` 6, `modules→api` 2 | MM-01..04 | §1, §5 |
| 43 env değişkeni, 58 dağınık `process.env` okuması | MM-07 | §1 (`config/`) |
| Test ağı dengesiz: `api/services` %27, 16 servis %0. Sipariş/iade/müşteri/fatura/mesaj repository'leri %0-11. Kalite kapısı, lint, dependency-cruiser, CI yok | TB-01..05 | §8 |
| Tenant kaydı her RPC'de 3 okuma. LRU tahliyesi uçuştaki sorguyu kesebilir. Merkezi ve tenant `Users` çift kayıt | MM-19, MM-20 | §5 |
| Kargo/e-fatura backend'i, genel API, giden webhook, otomasyon, asenkron iş, bildirim kanalı ve entitlement guard yok | §6 (c), Y-01..Y-23 | §6 |
| Gereksiz dosya/bağımlılık (knip, depcheck, `tsc --noUnusedLocals`) | GN-01..18 | §7 |

**Audit'ten sonra değişen olgular** (kod okumasıyla doğrulandı, 2026-09-28 `faz3-arayuz` @ 5ddfc67):
1. **`MailService` artık canlı.** N2 hesap yaşam döngüsü (`operations/account/AccountLifecycleService.ts:22-25`) onu tembel içe aktarmayla kullanıyor. Audit c.2 #1'deki "nodemailer + MailService'i sil" önerisi **geçersizdir**. Doğru yol: port arkasına alıp güncel sürüme yükseltmek (§6, §10.2 S1).
2. **C21 kısmen kapandı** (`0d48ce6`). Proxy artık senkron `IPlatform` metotlarını sarmıyor. Ancak Proxy ve iptal edilemeyen `Promise.race` zaman aşımı hâlâ duruyor (`IntegrationFactory.ts:134-138`).
3. **N1/N2 backend kapandı** (`e86609f`). "Hesap kurtarma" yeni-yetenek listesinden çıkar. Kalan kısımlar: davet ve hedef-rol kuralı.
4. **C22 (Trendyol V2, 15 Ekim 2026 kapanışı) zaman kritiktir** (BACKLOG C22). Faz planının dışında, "hemen" listesindedir.

**Bağlayıcı çıta:** `docs/PLATFORM_BASELINE.md`, A–E satırları (§10.1).

**Mevcut kararlar (korunur):**
- ADR-0001: tenant kimliği yalnız doğrulanmış principal'dan gelir, RBAC varsayılan olarak reddeder.
- ADR-0003 / ADR-0013: tenant başına DB, sır şifreleme.
- ADR-0004: zero-oversell, atomik rezervasyon.
- ADR-0005: iki kuyruk mekanizması; Redis yalnız sipariş hattı için zorunlu.
- ADR-0006: `IntegrationError`, `ResilientHttpClient`, süreç rolleri, `/ready`.
- ADR-0008: ödeme portu, `EntitlementService`.

**Diğer girdiler:**
- `docs/research/2026-09-28-integration-saas-patterns.md`: Konu 3 genel API/webhook, Konu 4 otomasyon, Konu 5 bildirim, Konu 6 toplu iş.
- `docs/research/2026-09-28-saas-capability-benchmark.md`: Y-kataloğu.
- `docs/INTEGRATION_CATEGORY_MODEL.md`.
- `docs/FRONTEND_GAP_ANALYSIS.md`.

**Ölçek gerçeği (Maliyet Bilinci):**
- 1 aktif tenant, en fazla 9 tenant kaydı, 6 adaptör.
- Sipariş hattı yaklaşık 80 iş/dk (ADR-0005).
- Bu ölçekte doğru yatırım yığın değişimi değildir. Doğru yatırım şunlardır: sınırların yazılı ve makinece zorlanır olması, çok-pod güvenliği, girdi doğrulama, test ağı ve eksik SaaS yetenekleri.

## Değerlendirilen Alternatifler

### A. Genel mimari yön

| Alternatif | Artı | Eksi | Sonuç |
|---|---|---|---|
| A1 — Mikroservislere bölmek (entegrasyon motoru, API, faturalama ayrı servis) | Bağımsız ölçek ve dağıtım | Dağıtık işlem/tutarlılık, ağ hataları, çoklu dağıtım hattı, gözlem yükü. Tek haneli tenant ve 1-2 kişilik ekipte maliyeti değerinin çok üstünde. Audit (f)1 açıkça önermiyor | **Reddedildi** |
| A2 — Framework değişimi (NestJS/Fastify) + ORM (Prisma/TypeORM) + GraphQL | DI, modül sistemi ve şema kalıpları hazır gelir | ~36 bin satırın ve 1.900+ testin büyük kısmı yeniden yazılır. Gizli iş kuralı kaybı riski var (`adr-writing` özel kuralının yasakladığı "daha kolay olur" gerekçesi). Mongoose çok-kiracılı bağlantı modeli (ADR-0003) yeniden kurulur | **Reddedildi** |
| A3 — Big-bang klasör taşıma (tek seferde hedef ağaca) | Hızlı "temiz görüntü" | Tüm paralel worktree'lerle çakışma, 116 test dosyasının içe aktarma yolları kırılır, geri alınamaz | **Reddedildi** |
| A4 — **Express + TS modüler monolit içinde kademeli modernizasyon** (yazılı + makinece zorlanan katman sözleşmesi, alan-bazlı dikey dilimler, additive platform altyapısı, adım başına tek servis) | Genel hatlar korunur (çok-kiracılı, IntegrationEngine, RPC sözleşmesi). Her adım geri alınabilir ve testlidir. Paralel çalışmaya uygundur | Geçiş süresince eski ve yeni desen yan yana yaşar. Bunun için mandal (ratchet) disiplini gerekir | **Seçildi** |
| A5 — Statüko + nokta düzeltmeler | En ucuzu | Çok-pod güvenliği, doğrulama, katman kayması ve yeni kategori maliyeti çözülmez. Yönergeye aykırı | **Reddedildi** |

### B. Zamanlayıcı ve lider seçimi (§2)

| Alternatif | Artı | Eksi |
|---|---|---|
| B1 — BullMQ Job Scheduler (`upsertJobScheduler`) | Redis tek-yürütme, tekrar ve jitter hazır gelir. Ek bağımlılık yok | Mongo'ya ait işler (stok yayını, telafi, mutabakat, deneme bitişi) Redis'e bağlanır. Bu, ADR-0005 Karar 2'deki "Redis yalnız sipariş hattı için zorunlu" sınırını deler. Durum ikiye bölünür (tekrar tanımı Redis'te, `JobState`/`JobRuns` Mongo'da, ADR-0017). Redis kesintisinde tüm bakım işleri durur |
| B2 — Tek global lider (bir pod tüm zamanlayıcıları çalıştırır, `mongoLease` ile lider kiralaması) | Basit zihinsel model | Lider pod ölünce tüm işler lease süresi kadar durur. Tek pod'da uzun bir iş diğerlerini geciktirir. Lider devri ek kod ister |
| B3 — **İş başına Mongo lease** (mevcut `@utils/mongoLease`) + ADR-0017 `runJob`/`JobRunRegistry` + süreç-içi örtüşme koruması + kapanış kancası (cron-lease'in iş başına biçimi) | Yeni bağımlılık yok. Redis'ten bağımsız. İşler pod'lar arasında doğal dağılır. Mevcut ve testli yardımcı kullanılır (`Dispatcher`/`Sync` emsali). ADR-0017'nin tek soyutlamasıyla birleşir | İş başına tur başı 1-2 Mongo yazımı (bugün ~10 iş için dakikada < 20 yazım, ihmal edilebilir) |

### C. `web` → `worker` sinyali (§2.4)

| Alternatif | Artı | Eksi |
|---|---|---|
| C1 — Redis pub/sub | Gecikme milisaniye düzeyinde | Katalog hattına Redis bağımlılığı getirir (ADR-0005 bunu bilerek Redis'siz tuttu). Pub/sub "ateşle-unut"tur, abone kopukken kaybolur, yine de yoklama gerekir |
| C2 — MongoDB change stream | Push modeli, DB tek kaynak | Replica set ister (yerel geliştirme Mongo'su bağımsız çalışıyor, test edilemez). Resume-token yönetimi gerekir |
| C3 — **Kısa aralıklı DB yoklaması** (indeksli `findOne`) + süreç-içi emitter (aynı süreçte anlık uyanma) | Redis'siz. Bugünkü `ExportSignals` durum makinesinin doğal uzantısı. Kayıp olmaz (durum DB'de) | Gecikme ≤ yoklama aralığı. Worker başına dakikada 4 hafif sorgu |

### D. Port bölünmesi (§3)
- **D1 — `IPlatform`'u fiziksel olarak kategori arayüzlerine bölmek.** 13 çağıran ve 6 adaptör değişir. ADR-0018 Karar 1.4 bunu reddetti ve bir eşik koydu.
- **D2 — `IPlatform` aynen kalır; yeni kategoriler dar portlar alır (ADR-0018); `IPlatform`'un tanımı rol portlarının birleşimi olarak derleme-zamanında yeniden ifade edilir.** Çağıran değişmez. Yeni kod dar portlara bağımlı olur.
- **D3 — Statüko** (`switch` + her yeni kategori için ~35 saplama).

D2 seçildi.

### E. Doğrulama kütüphanesi (§4)
- **zod (seçildi).** Tip çıkarımı var, JSON Schema/OpenAPI türetimi var. ADR-0017 (env), ADR-0018 (sözleşmeler) ve ADR-0019 (yetenek kaydı) zaten zod seçti. Tek şema dili olur.
- **Joi.** Tip çıkarımı zayıf.
- **Ajv + JSON Schema.** Yazımı ağır, TS tipi ayrıca üretilmesi gerekir.
- **express-validator.** Yalnız HTTP katmanında çalışır. MCP ve iş (job) girdilerinde kullanılamaz.

### F. Arama teknolojisi (§5.4)
- **Atlas Search.** Yerel Mongo'da çalışmaz, dolayısıyla yerelde test edilemez. Atlas katmanına ve indeks senkronuna bağlıdır.
- **`$text` + `searchText` alanı.** Türkçe kök bulma var, yerelde çalışır. Koleksiyon başına tek text indeksi sınırı vardır.
- **Kaçışlı ve öneki bağlı `$regex` + normalize alan (seçildi, 1. basamak).** En ucuzu, mevcut kodla uyumlu, bugünkü ölçeğe yeterli.

## Karar

Entegrasyonik backend'i **Express + TypeScript + Mongoose + BullMQ modüler monoliti olarak kalır.** Değişiklikler şöyledir:

- Yazılı ve **dependency-cruiser ile zorlanan** bir katman sözleşmesine sahip hedef klasör yapısına **kademeli** göç edilir (§1).
- Tüm zamanlanmış işler **tek bir `platform/scheduler` soyutlamasına** taşınır: ADR-0017 `runJob`, iş başına Mongo lease, örtüşme koruması ve kapanış kancası (§2).
- Adaptörler **`AdapterRegistry` + ADR-0018 `IntegrationDescriptor`** (tek manifesto modeli) ve dar portlarla genişler (§3).
- RPC sınırında **zod doğrulaması** ADR-0019 yetenek kaydından gelir. RPC sözleşmesi (adlar ve yanıt biçimleri) **korunur**. Kamu yüzeyi ayrı bir `api/v1`'dedir (§4).
- Veri erişimi **tenant-kapsamlı repository'lerde** toplanır (§5).
- Eksik SaaS yetenekleri, bağımlılık grafiğine göre sıralanmış modüller olarak eklenir (§6).
- Temizlik kanıtlı listelerle yapılır (§7). Test ve kalite kapıları mandal disipliniyle kurulur (§8).
- İş, **Faz 0 → 4** sırasıyla ve paralellik haritasına göre yürütülür (§9).

### §1 — Hedef klasör/katman yapısı

#### 1.1 Hedef ağaç (`backend/`)

```
backend/
  entegrasyonik.ts            giriş noktası (ad DEĞİŞMEZ: Dockerfile/script'ler dist/entegrasyonik.js'e bağlı); yalnız bootstrap'i çağırır
  src/
    bootstrap/                bileşim kökü: roles.ts (APP_ROLE planı), schedules.ts (tüm iş tanımlarının TEK kaydı),
                              shutdown.ts (graceful shutdown adımları — ADR-0006 Karar 6), http.ts (Webserver kurulumu)
    config/                   env.schema.ts (zod), index.ts (tipli `config`, fail-fast), roles.ts — ADR-0017 §10
    platform/
      core/                   logger/ (pino cephesi, ADR-0017 K1), context/ (AsyncLocalStorage: requestId, corrId, tenantId, principal),
                              errors/ (AppError, hata kodu kataloğu codes.ts), crypto/ (FieldCrypto, integrationSecrets şifre çözme,
                              redaksiyon/secretKeys, responseSanitizer), validation/ (escapeRegex, pagination, sort, searchTerm, objectId zod yardımcıları)
      runtime/                scheduler/ (defineJob, runJob, JobRunRegistry, lease — §2), jobs/ (isimli BullMQ kuyruk fabrikası, ortak retry/DLQ),
                              events/ (süreç-içi bus + DomainEvents outbox — §6), metrics/ (MetricsRegistry, ErrorEvents — ADR-0017 K2),
                              alerts/ (AlertEvaluator, kanallar — ADR-0017 K4)
    capabilities/             ADR-0019: types.ts, define.ts, domains/<alan>.ts, index.ts, derive/*, invoke.ts, evals/
    mcp/                      ADR-0019 adaptörü (Aşama C)
    api/
      http/                   authenticate, originCheck, clientIp, rateLimit (→ Redis eşikte), requestId, securityHeaders (helmet), errorMiddleware
      rpc/                    ApiManager (POST /api/:service/:operation), RunOperation, ApiWrapper, BaseApi, operationPolicy (kayıttan türetilir),
                              handlers/<ad>-service.ts (bugünkü api/services — AYNI sınıf adları, ince cephe), dto/ (profileDto, clientDto, sessionResult)
      webhooks/               Trendyol (WebhookApiManager), Billing, MockCheckout
      v1/                     kamu REST API (Faz 4, B-N10) — rota bugün yalnız ayrılır
      files/                  ImageApiManager, dışa aktarma indirme rotası (C17)
    operations/<alan>/        alan-bazlı kullanım senaryoları (§1.4); alanlar arası çağrı yalnız `operations/<alan>/index.ts` cephesinden
    database/
      application/, client/   Mongoose şemaları/modelleri (DEĞİŞMEZ)
      repositories/           app/ (ApplicationDB kapsamlı) ve tenant/ (ClientDB kapsamlı) — §5
      Database.ts, DatabaseManager.ts, tenantConnection.ts, TenantRegistry.ts (§5.2)
    services/                 YALNIZ altyapı adaptörleri: redis/, storage/ (S3/R2), mail/ (MailTransport — §6), audit/ (AuditLogger sink)
    integration/
      ports/                  IIntegrationAdapter, rol portları (§3.1), IShippingProvider, IEInvoiceProvider, IErpSink
      registry/               AdapterRegistry, IntegrationDescriptor tipleri + kategori eşleyicisi (shipping↔shipment), IntegrationFactory (cephe)
      compliance/             ADR-0018: ContractGuard, ShapeFingerprint, FindingService, ProbeRunner, SourceMonitor
      modules/<kategori>/<kod>/   marketplace/{trendyol,hepsiburada,n11,pazarama}, ecommerce/ideasoft, erp/bizimhesap,
                              shipping/<kod>, einvoice/<kod> (Faz 4); her birinde descriptor.ts + contracts/ (ADR-0018)
      modules/common/         http/ (ResilientHttpClient, IntegrationError), mock/ (MockMode)
      engine/                 IntegrationEngine, BaseWorker, catalog/ (Stager→…→Sync, ADR-0005 — YENİDEN YAZILMAZ), order/ (BullMQ)
    agents/                   ADR-0018 Aşama C (eşikli; bugün klasör açılmaz)
    health/                   /health, /ready, HealthServer (DEĞİŞMEZ)
    interfaces/               paylaşılan TS tipleri (kademeli küçülür; alan tipleri kendi alanına taşınır)
    utils/                    yan etkisiz saf yardımcılar (podIdentity, mongoLease düşük seviye ilkel, BarcodeGenerator…)
  tests/                      unit/, characterization/, contract/, integration/ (gerçek-Mongo, ayrı proje — §8), helpers/
```

#### 1.2 Katman yönü (dependency-cruiser ile zorlanır)

Bir modül yalnız **kendi seviyesindeki ya da daha alt seviyedeki** modülleri içe aktarabilir.

| Sv | Katman | İzinli bağımlılık |
|---|---|---|
| 0 | `interfaces`, `utils` | yalnız 0 (utils → interfaces) |
| 1 | `config` | 0 |
| 2 | `platform/core` | 0-1 |
| 3 | `database` | 0-2 |
| 4 | `services` (altyapı adaptörleri) | 0-3 |
| 5 | `platform/runtime` | 0-4 |
| 6 | `integration/{ports,registry,compliance,modules}` | 0-5 (`modules` → `ports`, `modules/common`. `database` yalnız adaptörün kendi token/durum deposu için, bugün Ideasoft) |
| 7 | `operations/<alan>`, `capabilities/` (tanım kısmı: `types, define, domains, index, derive`) | 0-6 |
| 8 | `integration/engine` | 0-7 |
| 9 | Yüzeyler: `api/*`, `mcp/`, `capabilities/invoke.ts`, `agents/`, `health/` | 0-8 |
| 10 | `bootstrap/`, `entegrasyonik.ts` | hepsi |

**Açık yasaklar** (dependency-cruiser `forbidden`, önem: `error`):
- Sv 0-8'den `api/**`'ya bağımlılık yasak. Bugünkü ihlaller: MM-04, `operations→api` 6, `modules→api` 2.
- `integration/modules/**` → `operations/**`, `integration/engine/**` yasak.
- `database/**` → `operations/**`, `integration/**` yasak.
- Adaptörler arası (`modules/<a>/<x>` → `modules/<b>/<y>`) yasak. Tek istisna `modules/common`.
- `operations/<a>/**` → `operations/<b>/<iç dosya>` yasak. Yalnız `operations/<b>/index.ts` üzerinden erişilir.
- `api/rpc/handlers/**` → `database/{application,client}/models/**` yasak. **Başlangıçta `warn` + taban çizgisi.** Her servis taşındıkça o dosya için `error`'a geçer (§5.1).
- `capabilities/**` (invoke hariç) → `api/**` yasak. Bu kural, `operationPolicy` ile kayıt arasındaki döngüyü önler (ADR-0019 §2).
- Döngüsel bağımlılık (`no-circular`) yasak. Bugün yalnız `interfaces` içindeki tip döngüsü var (madge). Faz 0'da `import type` ile çözülür.
- `src/...` ile başlayan çıplak içe aktarma yasak (MM-16'da 3 yer).

**Geçiş:** `dependency-cruiser` önce `--ignore-known` taban çizgisiyle (`.dependency-cruiser-known-violations.json`) kurulur. Taban çizgisi **yalnız küçülebilir** (mandal). Yeni ihlal CI'ı kırar (B-R4). B-R13 sonunda `operations/modules→api` taban çizgisi 0 olur.

**Alias'lar:**
- Mevcut alias'lar korunur: `@api @services @operations @integration @database @interfaces @utils @health`.
- Yeni alias'lar: `@config`, `@platform`, `@capabilities`, `@bootstrap`.
- Kural: üst-düzey klasörler arası içe aktarma alias ile, aynı üst-düzey klasör içi göreli yolla yapılır.

#### 1.3 Mevcut → hedef eşleme

| Mevcut | Hedef | Ne zaman / not |
|---|---|---|
| `entegrasyonik.ts` (rol, kapanış, 5 zamanlayıcı başlatma) | `entegrasyonik.ts` (ince) + `src/bootstrap/{roles,schedules,shutdown,http}.ts` | Faz 1 (B-R11 ile). Davranış aynı |
| 58 `process.env` okuması | `src/config` (`config.x`) | Faz 1 B-R5. Statik mandal: `config/` dışında `process.env` sayısı artamaz |
| `utils/Logger.ts`, `console.*` | `platform/core/logger` | ADR-0017 Aşama A. Yol: ADR-0017'nin `services/observability/logger.ts` önerisinin yerine geçer |
| ADR-0017 `services/observability/{context,MetricsRegistry,ErrorEvents,JobRunRegistry,AlertEvaluator}` | `platform/core/context`, `platform/runtime/metrics`, `platform/runtime/scheduler`, `platform/runtime/alerts` | Yalnız yerleşim değişir, içerik ADR-0017'dedir |
| `api/Security.ts` (`ApplicationError`, parola karması) | `platform/core/errors` (`AppError`, `ApplicationError` uyumlu alt sınıf olarak kalır), `platform/core/crypto/password.ts` | B-R13 |
| `api/integrationSecrets.ts`, `api/responseSanitizer.ts`, `utils/secretKeys.ts`, `utils/FieldCrypto.ts` | `platform/core/crypto/*` | B-R13. Eski yol bir faz boyunca yeniden-dışa-aktarma olarak kalır, sonra silinir |
| `api/{ApiManager,ApiWrapper,RunOperation,BaseApi,operationPolicy}.ts` | `api/rpc/*` | B-R13 (mekanik taşıma, ayrı commit) |
| `api/{authenticate,originCheck,clientIp,rateLimit}.ts` | `api/http/*` | B-R13 |
| `api/{WebhookApiManager,BillingWebhookApiManager,MockCheckoutApiManager}.ts` | `api/webhooks/*` | B-R13 |
| `api/services/*.ts` (26 sınıf) | `api/rpc/handlers/*.ts`, **aynı sınıf adıyla** (FE sözleşmesi). Mantık `operations/<alan>` ve `database/repositories` katmanına çıkar | B-R15/B-R16, servis başına bir adım |
| `api/index.ts` (servis kayıt nesnesi) | Kayıt, ADR-0019 yetenek kaydının `bindings` alanından doğrulanır (P1). Kayıtsız servis testi kırar | ADR-0019 Aşama A |
| `operations/account` | `operations/account` (ad korunur, ADR-0019 alanı `account`) | — |
| `operations/tenant` | `operations/tenant` (ad korunur) | — |
| `operations/billing` + `services/billing/{EntitlementService,PaymentProvider*}` | `operations/billing` (alan mantığı). Ödeme sağlayıcı adaptörü `services/billing/` altında kalır (altyapı) | B-R13 |
| `operations/stock` | `operations/stock` (işler `platform/runtime/scheduler`'a kayıtlı, `*Scheduler.ts` dosyaları silinir) | B-R11 |
| `operations/integration/{PostOrderOperations,QueryBuilderOperations}` | `operations/orders/postOrder.ts`; `QueryBuilderOperations` → `integration/engine/catalog/queryBuilder.ts` (yalnız motor kullanıyor) | B-R16 |
| `operations/client/{ClientOperations,StatsOperations}` | `database/repositories/tenant/*` + `operations/reports` | B-R16 |
| `operations/catalog/CatalogOperations.ts` (0 içe aktaran) | **silinir** (§7) | Faz 0 |
| `services/notification/*`, `services/statistics/*`, `services/image/*` (alan mantığı) | `operations/notifications`, `operations/reports`, `operations/catalog/images` | Faz 3-4 |
| `services/metrics/QueueMetricsCollector.ts` | `platform/runtime/metrics` (ADR-0017 B) | ADR-0017 B |
| `integration/engine/**/repositories/*Repository.ts` (Order/Claim/Customer/Invoice/Message/Financial) | `database/repositories/tenant/*` (api ve engine ortak kullanır) | B-R16 (önce B-R-T2 karakterizasyonu) |
| `integration/modules/IntegrationFactory.ts` (`switch`) | `integration/registry/{AdapterRegistry,IntegrationFactory}.ts` (aynı dış API) | B-R17 |
| ADR-0018 `src/integration/catalog/` (descriptor tipleri + registry) | `src/integration/registry/`. "catalog" adı ürün kataloğuyla karıştığı için kullanılmaz | ADR-0018 Aşama A bu yerleşimle yapılır |
| `interfaces/platforms/IPlatform` | Tanım `integration/ports/`'a taşınır. `interfaces/platforms` bir süre yeniden-dışa-aktarır | B-R17 |
| `integration/modules/provider/PlatformMappingProvider.ts` | `operations/catalog/mapping/` (alan mantığı) | B-R16 |
| `utils/LifecycleManager.ts`, `utils/BarcodeGenerator.ts` | §7'ye göre silinir | Faz 0 (onaylı liste) |
| `tsconfig.json` (`include **/*.ts`, ES2015, `dom`) | `tsconfig.json` (editör/test) + `tsconfig.build.json` (`src/**` + `entegrasyonik.ts`, `declaration:false`), `target/lib ES2022`, `useDefineForClassFields:false` | Faz 0 B-R3 |

#### 1.4 `operations/<alan>` listesi ve iç düzen

**Alanlar:**
- `catalog`: ürün, varyant, kategori, marka, nitelik eşleme, görsel, fiyat kuralı
- `orders`: sipariş, iade, müşteri, soru-cevap mesajı, elle fatura/kargo kaydı, post-order
- `stock`: mevcut ADR-0004
- `integrations`: ayarlar, stok politikası, sağlık, iş günlüğü, bağlantı testi
- `account`: kimlik/hesap
- `tenant`: yaşam döngüsü, KVKK
- `billing`
- `notifications`
- `files`: asenkron içe/dışa aktarma
- `reports`
- `automation`
- `audit`: okuma
- `support`: talepler

Yeni alan ancak bir ADR ya da bu listeye yapılan ekle açılır.

**Alan içi düzen:**
- `<işlem>.usecase.ts`: tenant bağlamı + girdi alır, repository/port çağırır.
- `<alan>.schemas.ts`: zod şemaları. Yetenek kaydı bunları içe aktarır, **şema tek yerde durur**.
- `<alan>.policy.ts`: saf iş kuralları.
- `index.ts`: alanın dışa açık cephesi.

**Yasak:** use-case içinde `this.request` gibi ham HTTP nesnesi kullanmak. Use-case'ler yüzeyden bağımsızdır; RPC, MCP, iş ve ajan aynı use-case'i çağırır. Bu, ADR-0019'daki tek yürütücü ilkesinin kod karşılığıdır.

**Bağımlılık enjeksiyonu (MM-05):** DI konteyneri **kurulmaz**.
- Yeni kod kurucu parametresiyle bağımlılık alır (repository, port, saat, logger). Bileşim `bootstrap/` içinde ya da cephe sınıfında yapılır.
- Eski singleton'lar (`DatabaseManagerInstance`, statik önbellekler) dokunuldukça ya enjekte edilir ya da `TenantRegistry`'ye (§5.2) taşınır.
- Toplu dönüşüm yapılmaz.

### §2 — Zamanlayıcı, lider seçimi, çok-pod güvenliği

**Karar (Alternatif B3):** Tüm periyodik işler tek bir `platform/runtime/scheduler` soyutlamasıyla çalışır.

**Kapsam — 9 iş:**
- `AllocationSweep`, `StockPublish`, `OversellCompensation`, `InternalReconciliation`, `ExternalReconciliation`, `TrialExpiry`
- `IntegrationEngine` zombi kilit temizliği
- `OrderOrchestrator.runScheduleJobsSafely` turu
- ADR-0017 metrik flush / alarm değerlendirici
- Eklenecekler: ADR-0018 probe / kaynak izleyici, KVKK purge (C17), DomainEvents yayıcısı

#### 2.1 İş tanımı ve yürütme
```ts
defineJob({
  name: 'stock.publish',                // kararlı ad = lease anahtarı = JobState anahtarı
  every: 30_000, jitterPct: 10,         // ya da `dailyAt: '03:10'` (Europe/Istanbul)
  maxDurationMs: 25_000,                // lease TTL ve "hung" eşiği (ADR-0017 Karar 3)
  criticality: 'critical', runOnStart: 'always' | 'ifDue',
  requires: ['mongo'] | ['mongo','redis'],   // Redis kapalıysa tur `skipped: redis_unavailable` (bugünkü semantik korunur)
  roles: ['worker','all'],
  run: async (ctx) => ({ processed, failed, skipped? }),   // ctx: { signal: AbortSignal, heartbeat(), logger, runId }
})
```

**Yürütme sırası (tur başına):**
1. Zamanlama `setInterval` ile değil, **`setTimeout` zinciriyle** yapılır. Tur bitince bir sonraki tur planlanır, jitter eklenir.
2. **Süreç-içi örtüşme koruması:** aynı iş hâlâ koşuyorsa tur atlanır ve `overlap_skipped` sayacı artar.
3. **Mongo lease:** `mongoLease.acquireLease` çağrılır. `JobLeases` koleksiyonunda iş adı başına tek doküman tutulur. `owner = podId:runId`, `expiresAt = now + maxDurationMs`. Başka pod tutuyorsa tur `skipped: leased_elsewhere` olur.
4. ADR-0017 `runJob` çağrılır: `JobState`/`JobRuns` yazılır, stale/hung/never-ran tespiti yapılır.
5. `ctx.heartbeat()` lease süresini uzatır. Uzun işler (mutabakat) bunu çağırmak zorundadır.
6. **Lease bırakma sahip koşulludur:** `releaseLease({name, owner})`. Başkasının lease'i silinemez. Bu, audit GN-14'teki `RedisService.acquireLock` hatasının tekrarlanmaması içindir. O güvensiz ilkel Faz 0'da silinir.

#### 2.2 Lease neden şimdi (ADR-0017 Karar 3'ün öne çekilmesi)
- ADR-0017 lease'i "worker pod ≥ 2" eşiğine bağlamıştı. Ancak Render ve Railway'in kesintisiz dağıtımı, eski ve yeni sürümü **kısa bir süre birlikte çalıştırır**. Bu nedenle `replicas=1` iken bile iki worker aynı turu koşabilir.
- `OversellCompensation` dış yan etki üretir: pazaryerinde gerçek iptal (GV-08).
- Lease'in maliyeti dakikada < 20 Mongo yazımıdır.
- Kaçış anahtarı `SCHEDULER_LEASE=off`'tur (yalnız acil durum için). Varsayılan `on`'dur.

#### 2.3 Kapanış (ADR-0006 Karar 6 ile birleşir)
`bootstrap/shutdown.ts` şu adımları izler:
1. `/ready` → 503.
2. `scheduler.stop()`: yeni tur planlanmaz, koşan işlere `AbortSignal` gönderilir, en fazla **15 sn** beklenir (toplam 25 sn bütçesinin içinde), lease'ler bırakılır.
3. Export/Import `while(true)` döngüleri durdurma bayrağı ve `AbortController` ile durdurulur (B-R12, C14 açık ucu).
4. BullMQ kapatılır, logger flush edilir, Redis `quit` çağrılır (mevcut).

#### 2.4 `web` → `worker` sinyali (Alternatif C3)
- `PROCESS_NEXT_SIGNAL` süreç-içi emitter olarak **kalır**. `all` rolünde ve aynı süreçte anlık uyanmayı sağlar.
- `ExportOrchestrator` ve `ImportOrchestrator` boşta uyku süresi `min(nextRunAt, EXPORT_IDLE_POLL_MS)` olur. `EXPORT_IDLE_POLL_MS` varsayılanı **15 sn**'dir (bugün `exportLoopDelay = 300000`).
- Yoklama indeksli `ExportSignals.findOne({status:'PENDING', nextRunAt ≤ now})` ile yapılır. Gerekli indeksin varlığı B-R12'de doğrulanır. Yoksa indeks eklemek DB değişikliğidir ve CLAUDE.md kural 3 (doğrulanmış yedek) ön koşuldur.
- Sonuç: kullanıcı eylemi ile işin başlaması arasındaki gecikme ≤ 15 sn olur (bugün ≤ 5 dk).
- **Redis pub/sub kurulmaz** (ADR-0005 sınırı korunur).

#### 2.5 `OversellCompensationJob` atomik talep ilkesi (GV-08; "hemen" listesinde)
Dış yan etkili her otomatik eylem **satır bazlı atomik talep** ile korunur. Zamanlayıcı lease'i yalnızca ikinci savunma hattıdır.

1. **Talep:** `findOneAndUpdate` ile `Orders.items[i].compensation` alanı `{state:'CLAIMED', claimedBy: podId:runId, claimedAt}` olarak yazılır. Koşul: `state` ya yoktur ya da `CLAIMED` ve `claimedAt < now − claimTtl(10 dk)`. `arrayFilters` kullanılır. Talep alınamazsa satır atlanır.
2. **Dış çağrı:** `rejectOrder` çağrılır.
   - Başarı → `CANCEL_SENT → DONE` (+ mevcut `RELEASED` yazımı).
   - `IntegrationError.retryable=false` → `FAILED` + bildirim.
   - `UNKNOWN_OUTCOME` / zaman aşımı → `UNKNOWN`. **Otomatik yeniden deneme yok.** Bir sonraki turda önce pazaryerinden sipariş durumu **okunur**. İptal edilmişse `DONE`, edilmemişse yeniden talep edilir.
3. Alan eklemelidir (additive). Mevcut belgelerde alanın olmaması "talep edilmemiş" anlamına gelir. Göç gerekmez.
4. **Test:** iki eşzamanlı tur (iki sahte pod) → tam **1** `rejectOrder` çağrısı. `UNKNOWN` sonrası ikinci turda dış çağrıdan önce okuma yapılır.

Aynı ilke Faz 4'te kargo gönderisi oluşturma, e-fatura kesme ve otomasyon eylemleri için **zorunludur**. Bunlara idempotency anahtarı ve `UNKNOWN_OUTCOME` doğrulama akışı eklenir (ADR-0018 Karar 1.4).

### §3 — Portlar, AdapterRegistry, tek manifesto modeli

#### 3.1 Portlar (Alternatif D2)
`integration/ports/` altındaki yapı:

- **`IIntegrationAdapter`** (ADR-0018 / kategori belgesi §5): `descriptor`, `requiredSettings`, `testConnection()`. **Tüm** adaptörlerin ortak tabanıdır. Mevcut 6 adaptöre `testConnection` eklenir (Y-03e, B-N4).
- **Rol portları:** bugünkü `IPlatform` metotlarının yeteneğe göre gruplanmasıdır. Adlar kategori belgesi §3'teki yetenek anahtarlarıyla eşleşir:

| Port | Metotlar |
|---|---|
| `ICatalogPort` | `products`, `categories`, `stockPrice` |
| `IOrderPort` | `orders`, `orderActions` |
| `IReturnsPort` | — |
| `IQuestionsPort` | — |
| `IFinancePort` | — |
| `IChannelNoticePort` | `shippingNotice`, `invoiceNotice` |

- **`IPlatform` aynen kalır.** Adı, imzası ve 13 çağıranı değişmez. Tanımı `IIntegrationAdapter & ICatalogPort & IOrderPort & …` birleşimi olarak **derleme-zamanında eşdeğer** biçimde yeniden yazılır. Çağıran değişmez, çalışma zamanı değişmez. ADR-0018 Karar 1.4'ün reddettiği "fiziksel bölme" **yapılmaz**. ADR-0018'in `IPlatform` ayrıştırma eşiği aynen geçerlidir.
- **Yeni kod en dar portu ister.** Örnekler: `StockPublishTrigger` → `ICatalogPort`, `OversellCompensation` → `IOrderPort`, sağlık ekranı → `IIntegrationAdapter`.
- **Yeni kategoriler yalnız kendi dar portlarını uygular:** `IShippingProvider`, `IEInvoiceProvider` (kategori belgesi §5.1/§5.2), `IErpSink` (Y-17, ERP yazma yönü; `accountingSync` yeteneği). Hiçbiri `IPlatform` saplaması yazmaz.

#### 3.2 Tek manifesto modeli (çift tanım yok)
- **Manifesto = ADR-0018 `IntegrationDescriptor`** (`modules/<kat>/<kod>/descriptor.ts`). Audit'in önerdiği ayrı `AdapterManifest` **açılmaz**. Onun alanlarının (kategori, yetenekler, requiredSettings, API sürümü, doküman URL'si, son doğrulama, hız sınırı, mock) hepsi `IntegrationDescriptor`'da zaten var.
- Yetenek → port metodu bağı `descriptor.capabilities[k].methods` alanındadır. Tutarlılık testi (ADR-0018 Aşama A) iki şeyi doğrular: her `methods` girdisi ilgili rol portunda tanımlı olmalı ve `not_supported` işaretli metot `NOT_SUPPORTED` fırlatmalı.
- **Ayrım:** ADR-0019 kullanıcı yetenekleri (`orders.approve`) ile entegrasyon yetenekleri (`orderActions`) ayrı kavramlardır. Aralarındaki bağ, kullanıcı yeteneğinin kullanılabilirliğinin descriptor'dan türetilmesidir. Örnek: `orders.approve` yalnız `orderActions ∈ {supported, limited}` olan entegrasyonlarda UI'da etkin görünür (FRONTEND_GAP N13).

#### 3.3 AdapterRegistry ve fabrika
- **`integration/registry/AdapterRegistry.ts`:** statik kayıt tablosudur, `code → { descriptor, create(ctx) }`. `ctx = { tenantId, settings (çözülmüş sır), http: ResilientHttpClient fabrikası, logger }`. ADR-0018 `IntegrationDescriptorRegistry` **bu kaydın salt-okuma görünümüdür**, ayrı liste değildir.
- **`IntegrationFactory` dış API'si korunur:** `getInstance(code)`, ADR-0018'in eklediği `getShippingProvider(code)` / `getEInvoiceProvider(code)`, `clearCache`.
  - İçeride `switch` yerine registry kullanılır.
  - Yapılandırma araması `categoryToStorageKey(descriptor.category)` ile **5 kategorinin tamamında** yapılır. `ClientIntegrations.{marketplace,ecommerce,erp,shipment,einvoice}` dizilerine bakılır. `shipment` göç edilmez.
- **Proxy kaldırılır (C21 kalanı, MM-18):**
  - Zaman aşımı **yalnız** `ResilientHttpClient` seviyesindedir. Orada gerçek bir `AbortController` zaten var (ADR-0006).
  - Operasyon düzeyi üst süre (bugünkü 120 sn) çağırana `AbortSignal` olarak geçirilir (`withDeadline(signal, 120_000)`).
  - Yazma işleminde süre aşımı `UNKNOWN_OUTCOME` olarak işaretlenir. Bugün `Promise.race` alttaki isteği iptal etmediği için sonuç belirsiz kalıyor ve işaretlenmiyor.
  - Önce karakterizasyon yapılır (`IntegrationFactory.getMatchKeyPromise` testleri ters çevrilir).
- **Önbellek:**
  - Statik `instanceCache`/`configCache`'in 5 dakikada bir toplu temizlenmesi yerine `lru-cache` kullanılır: `(tenantId, code)` anahtarlı, **TTL 60 sn**, `max 500`.
  - Ayar değişikliğinde yerel `invalidate(tenantId, code)` çağrılır. Diğer pod'lar en geç 60 sn içinde tazelenir. Redis pub/sub geçersiz kılma **kurulmaz** (§Maliyet eşiği).
  - Platform düzeyi `Integrations` kataloğu (küçük) ayrı olarak 5 dk TTL ile önbelleğe alınır. Bugünkü "her config miss'inde tüm koleksiyonu `find()`" davranışı biter.
- **Ideasoft `init()` (C10):** fabrika `init()` çağırmaz. Token akışı adaptörün kendi `SecurityService` sorumluluğudur (C10 ayrı görev). Registry, `descriptor.auth.tokenLifecycle === 'cached_refresh'` olan adaptörler için `create()` sonrasında tembel `ensureAuth()` kancası sağlar. Kancayı C10 görevi bağlar.

#### 3.4 Mevcut 6 adaptörün göç yolu (adaptör adaptör, önce karakterizasyon)
Sıra: **Trendyol** (C22 V2 geçişiyle aynı partide değil, C22'den sonra) → Hepsiburada → Pazarama → N11 → Bizimhesap → Ideasoft (C10 sonrası).

Her adaptör için adımlar:
1. `*.resilience.contract` ve transformer karakterizasyonu yeşil olmalı. Transformer'lar %3-25 ise önce B-R-T4 yapılır.
2. `descriptor.ts` yazılır (ADR-0018 Aşama A).
3. Registry kaydı eklenir, `switch` dalı silinir.
4. `testConnection()` yazılır. Metot yan etkisiz en ucuz okumayı kullanır.
5. Tutarlılık testleri yeşil olmalı.

Adaptör başına commit **geri alınabilir**. Registry'de olmayan kod eski `switch`'e düşer; bu fallback yalnız göç süresince vardır ve son adaptör taşınınca silinir.

### §4 — Girdi doğrulama ve API sözleşmesi

#### 4.1 Tek şema kaynağı
- RPC girdi şeması **ADR-0019 yetenek kaydının `input` alanıdır**. Şema nesnesi `operations/<alan>/<alan>.schemas.ts` içinde durur. Audit B-R10'daki "politika kaydını `{tier, kind, schema}`'ya genişlet" önerisi **ayrı yapılmaz**; ADR-0019 Aşama A bunu karşılar. `effect` alanı, audit'teki `kind`'ın yerine geçer.
- **`RunOperation` kancası:** `authorize` → **`validate`** → **`entitle`** → `execute`.
  - `validate`: yeteneğin `input` şeması `'legacy'` değilse RPC gövdesi (binding `map` ile) şemadan geçer. Handler yalnız **ayrıştırılmış** girdiyi (`this.input`) kullanır.
  - Taşınmış handler'da `this.request` doğrudan kullanılamaz. Bu bir ESLint kuralıdır (`no-restricted-syntax`, dosya bazlı liste).
  - Mass-assignment (GV-06) bu kural ve şemanın `strip` davranışıyla kapanır.
- **RPC ve MCP farkı:**
  - RPC yolunda bilinmeyen anahtarlar **atılır** (`strip`). FE bugün fazladan alan gönderiyor olabilir; sözleşme kırılmaz.
  - MCP yolunda `strict` kullanılır (ADR-0019 P7).
- **Yumuşak geçiş:** `VALIDATION_MODE=warn|enforce`. Yeni şemalı operasyon ilk 7 gün `warn` modunda çalışır: ihlal loglanır ve `validation_rejections{op}` metriği sayılır, istek geçer. Sonra `enforce` olur. Yeni yazılan operasyonlar doğrudan `enforce` ile başlar.
- **Ortak yardımcılar** (`platform/core/validation`):
  - `escapeRegex(s)`
  - `searchTerm`: trim, 1–100 karakter, kontrol karakteri yok
  - `pagination`: `page ≥ 1`, `limit 1..100`, varsayılan 20. Liste uçlarında **zorunlu**
  - `sortOf(['createdAt','dates.orderDate',…])`: izinli alan listesi + `asc|desc`
  - `objectId`
  - `integrationCode`: registry kodlarından türetilen enum. Dinamik yolları (`['platforms.'+code]`, audit MM-08) kapatır.
- **Uygulama sırası:** GV-01 / sınırsız `limit` siteleri "hemen" listesindedir (§9.1). Geri kalan şemalar yüksek risk sırasıyla B-R14'te yazılır: `SettingService`, `IntegrationService` ayar kaydı, arama/liste, kullanıcı yönetimi, ürün/varyant yazma.

#### 4.2 RPC sözleşmesi korunur
`POST /api/:service/:operation`, `GET /api/:service`, özel rotalar, operasyon adları ve başarılı yanıt gövdeleri **değişmez** (FE sözleşmesi, audit (f)3). Bugün hata durumunda `200 {result:false}` dönen eski operasyonlar da değiştirilmez. Yeni operasyonlar doğru 4xx/5xx kullanır.

#### 4.3 Hata zarfı + kod kataloğu (ADR-0017 §10 ile aynı alanlar)
- **`platform/core/errors/AppError`:** `{ code, status, expose, message (kullanıcıya gösterilecek TR ileti), details?, cause? }`.
- **Katalog:** `platform/core/errors/codes.ts`. İçerik: ADR-0006 `IntegrationError` kodları + `VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, QUOTA_EXCEEDED, PLAN_REQUIRED, INTERNAL`. `docs/ERROR_CODES.md` bu dosyadan **üretilir**.
- **Merkezi `api/http/errorMiddleware`:**
  - `AppError` ve `expose=true` ise ileti döner.
  - Diğer tüm hatalarda 500 döner, ileti "Beklenmeyen bir hata oluştu" olur, `requestId` döner. Ayrıntı yalnız log'a ve `ErrorEvents`'e gider.
- **Yüzeye göre yerleşim** (ADR-0017'nin "geçiş" hükmünün somut hâli):
  - **RPC (FE):** `{ error: "<ileti>", code, requestId, details?, service, operation }`. `error` **string olarak kalır**, yeni alanlar yalnız **eklenir**. FE koda göre eşlemeye geçince (ADR-0017 Aşama D) `error` metni yalnız yedek olarak kalır.
  - **`api/v1` ve MCP:** `{ error: { code, message, requestId, details? } }`.
- **Göç:** `ApplicationError` → `AppError`'ın uyumlu alt sınıfı olur. `api/services` içindeki 68 genel `throw new Error('<kullanıcı metni>')` servis servis `AppError(4xx)`'e çevrilir. Çevrilmeyen her `Error` artık **maskelenir**. FE'nin bir hata metnine bağlı olup olmadığı B-R6'dan önce FE taramasıyla doğrulanır (audit Ek-B 3).

#### 4.4 `api/v1` sürüm politikası (B-N10'da uygulanır; bugün yalnız karar)
- **URL öneki:** `/api/v1/...`. Router, RPC'nin `/api/:service/:operation` rotasından **önce** bağlanır. `v1` ve `v2` ayrılmış servis adlarıdır; bir RPC servisi bu adları alamaz (test).
- **Değişiklik kuralı:** `v1` içinde **yalnız ek** değişiklik yapılır (yeni isteğe bağlı alan, yeni uç, çıktıda yeni enum değeri). Kırıcı değişiklik → `/api/v2`. Eski sürüm yanıtlarına `Deprecation` ve `Sunset` başlıkları eklenir. Eski sürüm yeni sürüm çıktıktan sonra **en az 12 ay** desteklenir (varsayılan; §10.2 S7).
- **Tanım ve belge:** kaynak yönelimli REST. Kaynaklar ADR-0019 kayıt yeteneklerinden `surface: 'publicApi'` kararıyla seçilir. **OpenAPI 3.1 kayıttan türetilir** (`capabilities/derive/openapi.ts`, ADR-0019 §Maliyet eşiği).
- **Liste ve yazma uçları:** liste uçlarında imleç sayfalama (`cursor`, `limit ≤ 100`). POST'ta `Idempotency-Key` desteklenir: ilk sonuç 24 saat saklanır, parametre uyuşmazlığında 409 döner.
- **Rate limit:** tenant ve anahtar başına Redis tabanlı sınır (web pod ≥ 2 eşiğinden bağımsız olarak kamu API'sinde **baştan** Redis). Yanıtta `RateLimit-*` benzeri başlıklar + 429 + `Retry-After` döner.
- **Kimlik:**
  - **API anahtarı:** kaynak grubu başına `none|read|write` kapsamı. Yalnız bir kez gösterilir, DB'de yalnız özeti tutulur. Döndürmede ≤ 7 gün çift geçerlilik, "son kullanım" kaydı. Oluşturma ve iptal owner kademesindedir ve denetlenir.
  - **Birinci taraf masaüstü ve MCP** için OAuth **ADR-0010**'dur. Üçüncü taraf MCP istemcileri ADR-0009/0010 eşiğine tabidir.
  - Anahtar da bir principal türüdür: `principal.kind = 'user' | 'apiKey' | 'agent'`. Tenant kimliği yine yalnız principal'dan gelir (ADR-0001 Karar 5).
- **Plan kapısı:** `publicApi` plan özelliği (`EntitlementService`, ADR-0008).

### §5 — Veri erişimi ve tenant

#### 5.1 Repository deseni
- **Konum:** `database/repositories/tenant/<Varlık>Repository.ts` (ClientDB) ve `database/repositories/app/<Varlık>Repository.ts` (ApplicationDB).
- **Kurucu:** tenant repository'leri `TenantContext { tenantId, db: ClientDB }` alır. **Hiçbir metot çağırandan `clientId` / `tenantId` parametresi almaz.**
- **ApplicationDB koleksiyonları:** tenant sütunu taşıyan koleksiyonlarda (`ExportSignals`, `ImportJobs`, `IntegrationCallMetrics`, `AuditLogs`, `Subscriptions`…) repository, kurucudaki `tenantId`'yi **her** filtreye kendisi ekler.
- **Sorgu yeri:** `find` / `aggregate` / `update` **yalnız** repository'dedir. Sayfalama, sıralama, arama ve projeksiyon da burada yapılır (§4.1 yardımcılarıyla). Metotlar `lean` DTO döndürür.
- **Genel `BaseRepository<T>` sihri yok.** Açık, küçük metotlar yazılır. ORM değişmez.
- **Kopyalar birleşir:** `advancedSearchExportJobs` ve `getExportJobs` (MM-02) tek `ExportJobRepository.search` olur. `StockPublishTrigger`'daki toplu işlem kopyası (C8) da birleştirilir.
- **Mandal:** `api/rpc/handlers/**` içindeki `getXModel()` çağrı sayısı **artamaz**. Her B-R16 adımında düşer. Hedef 0.

#### 5.2 Tenant kaydı önbelleği (MM-19)
- **`database/TenantRegistry.ts`:** `Clients` kaydı (status, dbConfig.dbname, poolsize) için süreç-içi `lru-cache` kullanılır. **TTL 30 sn**, tenant anahtarlıdır.
  - Durum değişikliği (askı, silme) aynı pod'da anında `invalidate` edilir, diğer pod'larda ≤ 30 sn sürer.
  - `authenticate`'teki `Clients.findOne(status)` ve `BaseApi`'deki `Clients.findOne({order})` bu önbellekten okur. Böylece RPC başına 3 okuma 1'e iner.
  - **Merkezi `Users` okuması önbelleğe ALINMAZ.** Oturum iptali (`tokenVersion`) anında etkili olmalıdır (ADR-0001).
- **`ClientDB` LRU:**
  - Tahliyede bağlantı hemen kapatılmaz. Referans sayımı yapılır; uçuşta sorgu yoksa ya da 60 sn geçtiyse kapatılır.
  - `maxPoolSize` varsayılanı 5 (bugün `DB_POOL_SIZE || 20`) olur, `maxIdleTimeMS: 60000` eklenir.
  - Tenant başına `dbConfig.poolsize` ezme değeri korunur.
- Statik 5 dk toplu temizleme (`IntegrationFactory`) §3.3'te çözüldü.

#### 5.3 Merkezi/tenant çift kullanıcı kaydı (MM-20)
- **Karar:** kimlik bilgisinin **tek doğruluk kaynağı** merkezi `Users`'tır (ApplicationDB). Kapsamı: e-posta, parola özeti, `tokenVersion`, rol, e-posta doğrulama, 2FA sırrı.
- **Tenant `Users` kopyası** yalnız tenant-içi profil/görüntü projeksiyonu olur (ad, soyad, tercih, `centralUserId`). **Parola özeti tenant kopyasına yazılmaz.**
- **Uygulama (B-R16 kapsamı, `UserService`):**
  1. Karakterizasyon (mevcut %87 test) yapılır.
  2. `createUser` / `updateUser` yazma sırası değişir: önce merkezi kayıt; tenant projeksiyonu ardından best-effort yazılır ve uzlaştırma işi eklenir.
  3. Tenant kopyasındaki mevcut parola özetlerinin **silinmesi bir DB göçüdür**. Göç betiği dry-run varsayılanla çalışır ve CLAUDE.md kural 3 (doğrulanmış yedek) ön koşuldur. İnsan onayıyla `--apply` edilir.
- Bu karar ADR-0003/0013'ü değiştirmez (DB-per-tenant modeli aynen kalır).

#### 5.4 Arama teknolojisi (Alternatif F)
- **1. basamak (bugün, "hemen" + B-R8):** `escapeRegex` + uzunluk sınırı. Mümkün olan alanlarda **öneki bağlı** (`^…`) arama yapılır. Büyük koleksiyonlarda indeksli, normalize edilmiş (küçük harf, TR `İ/ı` normalize) bir `searchKey` alanı kullanılır. `SmartService`'teki kelime başına `$regex` + `$lookup` taraması kaldırılır ve koleksiyon başına sınırlı `limit` ile birleştirilir.
- **2. basamak (eşikte):** koleksiyon başına yansıtılmış `searchText` + `$text` indeksi (`default_language: 'turkish'`).
- **3. basamak (eşikte, ayrı ADR):** Atlas Search. Yerelde çalışmadığı için test stratejisi o ADR'de çözülmelidir.

#### 5.5 IDOR / izolasyon test deseni
- **İki-tenant koşum yardımcısı** (`tests/helpers/twoTenantHarness.ts`): sahte `ClientDB` ×2 + principal ×2.
- Her tenant-yüzlü yetenek için zorunlu testler:
  - A'nın kaynağına B'nin okuma, yazma ve silme girişimi → `NOT_FOUND` (varlık sızdırmaz; `FORBIDDEN` değil).
  - Gövdeye `clientId` / `order` / `tenantId` konması etkisizdir (bugünkü `RunOperation` davranışının genellenmesi).
- **Statik test:** `database/repositories/app/**` içindeki her sorgu kurucusu `tenantId` filtresi içerir (AST taraması; istisna listesi gerekçeli).
- ADR-0019 P10 ve ADR-0009 "2 tenant izolasyonu" DoD'si bu yardımcıyı kullanır.

### §6 — Yeni yetenek modülleri (bağımlılık grafiği ve aşamalandırma)

Her yeni yetenek PLATFORM_BASELINE **E8** (yetenek kaydı + UI + MCP kararı + test + belge) ve **D10** önerisine tabidir.

| # | Yetenek (audit/benchmark) | Modül yeri | Bağımlılık | Karar/ADR ihtiyacı | Durum / sıra |
|---|---|---|---|---|---|
| B-N1 | Bildirim kanalları + tercihler + e-posta teslimi (Y-05/H2, C10 baseline) | `operations/notifications` (gelen kutusu, tercih matrisi kategori × kanal, zorunlu kategoriler kapatılamaz), `services/mail/MailTransport` portu (SMTP adaptörü, mevcut `MailService` bunun uygulayıcısı olur), `platform/runtime/jobs` `notifications` kuyruğu (yeniden deneme) | `platform/runtime/jobs` (Faz 1), ADR-0017 C (alarm kanalı ortak) | E-posta sağlayıcısı: **varsayılan SMTP (mevcut hesap) + nodemailer güncel yamalı sürüm**, §10.2 S1 | Faz 4 dalga 1 |
| — | Hesap kurtarma / e-posta doğrulama (Y-05) | `operations/account` | — | — | **YAPILDI** (N1/N2, `e86609f`). Kalan: davet + hedef-rol kuralı (Y-08) → B-N2 |
| B-N2 | Davet, hedef-rol kuralı (Y-08, N11) | `operations/account` | B-N1 (davet e-postası), ADR-0019 A | Hedef-rol matrisi insan incelemesi (`OPERATION_POLICY.md` 15 belirsiz) | Faz 4 dalga 1 |
| B-N3 | Entitlement guard: API + Engine (Y-04, E1) | `RunOperation` `entitle` kancası (yetenek `entitlement` alanı), engine kapıları (`OrderQueueProducer.scheduleJobs`, `Dispatcher`), kota sayaçları `operations/billing` | ADR-0019 A, **mevcut tenant'lar için legacy abonelik göçü ÖNCE** (insan adımı: canlı erişimi etkiler, yedek şartı) | ADR-0008 Aşama B. Varsayılan: mevcut tenant'lar `billingExempt:true` legacy | Faz 4 dalga 1 (göç onayı gelince) |
| B-N4 | Entegrasyon sağlığı + `testConnection` (Y-06, Y-03e, N7) | `operations/integrations/health` + ADR-0017 `IntegrationHealthItem` DTO | ADR-0017 B (metrik), §3 `IIntegrationAdapter.testConnection` | — | **YAPILIYOR** (başka ajan). Bu ADR yalnız yerleşimi bağlar |
| B-N5 | Asenkron içe/dışa aktarma işleri + indirme rotası + purge zamanlayıcısı (Y-07, Y-21, C17) | `operations/files` (`FileJobs` koleksiyonu: tür, ilerleme, sonuç R2, satır bazlı hata dosyası), `platform/runtime/jobs` `file-jobs` kuyruğu, `api/files` imzalı indirme (`verifyExportDownloadToken` bağlanır), `exceljs` (xlsx yerine) | Faz 1 scheduler/jobs, B-R-T1 (ürün/varyant karakterizasyonu) | Araştırma Konu 6 kararları (önizleme → onay → uygula, 7 gün geri alma önerisi — süre insan) | Faz 4 dalga 1 |
| B-N6 | Stok politikası API + OVERSOLD görünürlüğü (Y-09, N5/N6/N8) | `operations/integrations/settings` (`saveStockPolicy`, birleştirici settings yazımı) | — | — | **YAPILIYOR** (başka ajan). `ReconciliationRuns` kalıcılığı B-N6 sonrası |
| B-N7 | Denetim günlüğü okuma + üye yazma denetimi (Y-20, N10, B7) | `operations/audit` + `AuditService.getAuditLogs` (tenant zorunlu, sayfalı) | ADR-0019 A (`effect ∈ {write,destructive}` → otomatik audit) | — | Faz 4 dalga 1 |
| B-N8 | Kargo katmanı (Y-01) | `integration/modules/shipping/<kod>` + `IShippingProvider`, `operations/orders/shipping` (toplu etiket PDF, takip → pazaryeri `sendOrderShipping`) | §3 registry (B-R17), B-R-T2 (`shipment-service`) | **Firma seçimi insan** (ADR-0018 Karar 6/1). Varsayılan: port yazılır, adaptör yazılmaz | Faz 4 dalga 2 |
| B-N9 | E-fatura / e-arşiv (Y-02, Y-23) | `integration/modules/einvoice/<kod>` + `IEInvoiceProvider`, `operations/orders/invoicing` (`externalRef` tekilleştirme zorunlu) | B-R17, B-R-T2 (`invoice-service`) | **Entegratör ve iş modeli insan** (ADR-0018 Karar 6/2) | Faz 4 dalga 2 |
| B-N10 | `api/v1` + API anahtarı + giden webhook + OpenAPI (Y-14, E6) | `api/v1`, `operations/apiAccess` (anahtarlar), `operations/webhooks` (abonelik, HMAC-SHA256 zaman damgalı imza, Standard Webhooks başlık adları, "thin" olay, teslim günlüğü, elle yeniden gönderim), `webhook-delivery` kuyruğu | B-N3, DomainEvents outbox, Redis rate limiter, `capabilities/derive/openapi` | §4.4. Yeniden deneme takvimi ve destek süresi insan (S7). **Tetik:** ilk ödeyen müşteri talebi ya da plan paketine girmesi | Faz 4 dalga 2 (tetikli) |
| B-N11 | Otomasyon kural motoru v1 (Y-15) | `operations/automation` (kapalı katalog: tetik/koşul/eylem, derinlik = 1, kural ve tenant tavanları, kuru çalıştırma, çalışma günlüğü; araştırma Konu 4) | DomainEvents outbox, B-N1, (kargo ataması için) B-N8 | Kural sayısının plana bağlanması insan (ADR-0008) | Faz 4 dalga 3 |
| B-N12 | Raporlama: kâr, komisyon, hakediş (Y-11/12) | `operations/reports` (ön-toplanmış günlük kovalar, tenant TZ — GV-03), `Settlement` modeli yeniden tasarlanır | B-N5 (Excel çıktısı), GV-03 düzeltmesi | Komisyon veri kaynağı (DB/çekim; `commissions.json`) insan | Faz 4 dalga 2 |
| B-N13 | 2FA (TOTP) (Y-20, B10) | `operations/account` (`otplib`, kurtarma kodları, owner/admin için zorunlu kılma politikası) | B-N1 | — | Faz 4 dalga 3 |

**Bağımlılık grafiği:**
```
Faz1(scheduler, jobs, errors, config, logger, capabilities-A)
  ├─► B-N1 notifications ──► B-N2 davet ──► B-N13 2FA
  │        └──────────────► B-N11 otomasyon ◄── DomainEvents ◄── (ilk tüketiciyle kurulur)
  ├─► B-N3 entitlement (legacy göçü ⟂ insan) ──► B-N10 api/v1 + webhook
  ├─► B-N5 files ──► B-N12 raporlar
  ├─► B-N7 audit okuma
  └─► B-R17 registry ──► B-N8 kargo (firma ⟂ insan) ──► B-N11 (kargo ataması eylemi)
                     └─► B-N9 e-fatura (entegratör ⟂ insan)
```

**DomainEvents outbox:**
- ApplicationDB'deki `DomainEvents` koleksiyonunda tutulur: `{tenantId, type, ids, occurredAt, dispatchedAt?, attempts}`. Gönderilenler 7 gün TTL ile silinir.
- Kayıt, alan yazımından **sonra eklenir** (post-commit append). Tenant DB ile ApplicationDB arasında transaction mümkün değildir.
- Olaylar **"ince" ipucudur**. Tüketici güncel durumu kendisi okur (ADR-0005 webhook felsefesi). Kritik tüketiciler (OVERSOLD bildirimi, faturalama) ayrıca durum tabanlı süpürmeyle uzlaştırılır. Yazım ile ekleme arasındaki çökme penceresinin bedeli budur.
- Outbox, **ilk tüketicisiyle** (B-N1 ya da B-N10, hangisi önce) kurulur. Faz 1'de kurulmaz; boş altyapı açılmaz.

### §7 — Silme / temizlik politikası

**Genel ilkeler:**
- Her silme tek başına bir commit'tir.
- Kapı: `tsc` 0 + tam jest yeşil + `npm run build` (+ bağımlılık silmede `docker build`).
- `git revert` ile geri alınabilir. Git geçmişi korunur.
- DB'ye dokunan silme yoktur.

| Sıra | Adım | İçerik | Kapı / not |
|---|---|---|---|
| 1 | **B-R1** (Faz 0) | Audit c.1 "kesin güvenli" 8 madde: `marketplace-service.ts1`, `services/mail/.env.example` (içeriği `backend/.env.example`'a taşınır), kök `README`, `Webserver.ts` ölü üyeleri, 131 kullanılmayan yerel/import (`noUnusedLocals`), 24 kullanılmayan tip, `axios-rate-limit`, `RedisService.isRateLimited/acquireLock/releaseLock` (güvensiz ilkel), `register-service.ts` + kaydı (FE `restapi.ts:71` satırı FE göreviyle birlikte) | Mekanik |
| 2 | **B-R1 ek** (bu ADR'nin kararıyla onaylı) | `operations/catalog/CatalogOperations.ts` (0 içe aktaran; CLAUDE.md alias örneği güncellenir), `utils/LifecycleManager.ts` (FE kopyası kaynak kalır; sunucu tarafı eylem izinleri gerekirse yetenek kaydının `ui`/koşul alanlarından gelir, bu dosya canlandırılmaz), `utils/BarcodeGenerator.ts` + `tests/smoke.test.ts` düzenlemesi, `database/client/models/Settlement.ts` + `interfaces/settlement` (kayıtsız şema; Y-12 kendi modelini B-N12'de tasarlar, git geçmişinde referans kalır), `integration/README.md` (bayat; yerine kısa, doğru bir mimari özet — bu ADR'ye bağlantı) | Ürün kararı gerektirmez: kod ölü, işlevi yok |
| 3 | **B-R2** (Faz 0) | Bağımlılıklar: `uuid` → `crypto.randomUUID`; `npm audit fix` (qs); `ioredis`, `lru-cache` açıkça bildirilir; `typescript`, `@types/bcrypt`, `@jest/globals` devDep'e taşınır. **nodemailer SİLİNMEZ** (artık canlı, bkz. Bağlam) → güncel yamalı ana sürüme yükseltilir + `MailTransport` portu arkasına alınır (B-N1 ile birleştirilebilir, ama CVE kapanışı Faz 0'dadır) | `docker build`, `npm audit --omit=dev` (hedef: yüksek yalnız sharp + xlsx, istisna dosyası gerekçeli) |
| 4 | **B-R2 onaya bağlı** | (a) Native isteğe bağlı paketler (`kerberos, snappy, @mongodb-js/zstd, mongodb-client-encryption, gcp-metadata`) + Dockerfile `krb5-dev`: **üretim `DB_URL`'inde `compressors=` / GSSAPI olmadığının insan tarafından teyidi** sonrası. (b) rollup/webpack zinciri + `herokubuild`: **Render/Railway build komutlarının teyidi** sonrası (§10.2 S5) | Teyit gelmezse dokunulmaz |
| 5 | Faz 3 içinde | `ecommerce-service.ts` (FE `IdeasoftComponent.vue:214`, `integrationStore.ts:47` bugün 403 alıyor): C10 (Ideasoft token akışı) kararıyla birlikte ya silinir ve FE çağrıları kaldırılır ya da `operations/integrations` altına ürün çekme olarak yeniden bağlanır. **Varsayılan: C10 çözülene dek dokunulmaz**, FE'de "yakında" gösterilir (E3 dürüstlük) | FE ile koordineli |
| 6 | Ürün kararı | `commissions.json` (Trendyol 2,9 MB, kullanılıyor) → DB/periyodik çekime **taşınır**, silinmez (B-N12). Pazarama boş `[]` dosyaları taşımayla birlikte kaldırılır | B-N12 |
| 7 | **İnsan kararı (C5)** | `gitlab/` — seçenekler aşağıda | Protokol 12 |
| 8 | **İnsan kararı (C15)** | `mockserver/` — seçenekler aşağıda | Protokol 12, kural 2 |

**`gitlab/` (84 MB, 1.783 izlenen dosya, geçmişte sabit sır) — seçenekler:**
- **(a)** Olduğu gibi bırakmak. Şişkinlik ve karışıklık sürer.
- **(b)** `git rm -r gitlab/`, yeni commit. Çalışma ağacı temizlenir. Geçmiş, pack boyutu ve sızmış sır geçmişte kalır. Hiçbir kod referansı yoktur, risksizdir.
- **(c)** (b) + geçmiş yeniden yazımı (`git filter-repo`). Zorunlu force-push ve tüm klonların yeniden alınması gerekir.

**Öneri:** (b) **şimdi** (insan onayıyla; referans yok, geri alınabilir). (c) **yalnız** C5 / ADR-0003 adım 7 sır rotasyonu tamamlandıktan sonra, ADR-0013 B1 ile **tek bir bakım olayında** yapılır. Rotasyon olmadan geçmiş temizliği güvenlik sağlamaz; sızmış sırlar zaten geçersiz kılınmalıdır.

**`mockserver/` (94 dosya, izinli liste dışı `unified_mock_marketplaces` DB'si) — seçenekler:**
- **(a)** Olduğu gibi bırakmak. Çalıştırılamaz (kural 2).
- **(b)** DB adını izinli listeye eklemek (insan onayı).
- **(c)** Depolamayı bellek-içi ya da fikstür dosyalarına çevirmek. Fikstürler ADR-0018 2d zod sözleşmelerinden türetilir. `herpsiburada/` yazım hatası, ikili `.docx/.odt` dosyaları ve bozuk `scratch/seedScenarios.js` temizlenir.
- **(d)** Silip `MockMode` + sözleşme fikstürlerine dayanmak.

**Öneri:**
- Kısa vadede **(a)** + mekanik temizlik (typo klasörü, ikili dokümanlar) — insan onayıyla.
- Orta vadede **(c)**. "Tek doğruluk kaynağı zod sözleşmesidir" ilkesiyle uyumludur ve C20 sapma sınıfını kapatır.
- (b) önerilmez. Kalıcı ek DB, kural 2 yüzeyini büyütür.

### §8 — Test ve kalite stratejisi

#### 8.1 Test piramidi ve katmanlar

| Katman | Konum | Çalışma | Kapsam kuralı |
|---|---|---|---|
| Birim | `tests/unit/**` | `npm test` (varsayılan) | Saf fonksiyonlar, use-case'ler (sahte repository/port), `platform/*` |
| Karakterizasyon | `tests/characterization/**` | `npm test` | Refaktörden **önce** zorunlu (Protokol 13). Kasıtlı ters çevirmeler etiketli |
| Sözleşme | `tests/contract/**` | `npm test` | Adaptör sözleşmeleri + fikstürler (ADR-0018), yetenek paritesi P1–P10 (ADR-0019), manifesto tutarlılığı, HTTP düzeyi `supertest` (hata zarfı, auth, politika, `X-Request-Id`) |
| Entegrasyon (gerçek Mongo) | `tests/integration/**` | **Ayrı**: `npm run test:integration`. Varsayılan `npm test`'ten **hariç** (jest `projects`; TB-03) | Yalnız eşzamanlılık / atomiklik kanıtı (`StockAllocator.concurrency`), izinli DB'de, kendini temizleyen sentetik veri |
| E2E | frontend Playwright (mock API) | frontend | ADR-0015 |

**Yeni test yardımcıları:** `twoTenantHarness`, sahte saat (`@sinonjs/fake-timers` üzerinden jest modern timers), `fakeLease`, sahte `ResilientHttpClient` ve kayıtlı fikstür oynatıcı.

#### 8.2 Kapsam eşiği (mandal: düşemez)
- `jest.config.js` `coverageThreshold.global` bugünkü ölçüm tabanıyla kurulur: satır 54, dal 35, fonksiyon 42, ifade 53. Ölçüm her yükselişte `coverage-baseline.json` ile **yukarı** güncellenir (`--write`). Düşüş CI'ı kırar.
- **Dizin eşikleri** (yeni kod için baştan):

| Dizin | Satır | Dal |
|---|---|---|
| `src/platform/**`, `src/config/**`, `src/capabilities/**`, `src/database/repositories/**`, `src/integration/registry/**` | ≥ %85 | ≥ %70 |
| Her yeni `operations/<alan>` | ≥ %80 | — |

- **Faz 2 çıkış hedefleri:**
  - `api/services` %27 → **≥ %60**.
  - Faz 3'te refaktör edilecek hiçbir servis %0 kalmaz. Refaktör edilecek her servis için ön koşul **≥ %70**'tir.
  - Engine repository'leri ≥ %70.
  - Adaptör ürün/kategori transformer'ları ≥ %60.

#### 8.3 Kalite kapıları ve `npm run verify` (B-R4)
`verify` şu sırayla koşar:
1. `tsc -p tsconfig.build.json --noEmit`
2. `eslint` (typescript-eslint; önce `no-floating-promises`, `no-misused-promises`, `no-restricted-syntax` [taşınmış handler'da `this.request`], `no-console` [mandal sayımıyla, ADR-0017])
3. `prettier --check` (yalnız değişen dosyalar; toplu biçimlendirme commit'i **yapılmaz**, diff gürültüsü yaratır)
4. `depcruise` (§1.2, bilinen-ihlal taban çizgisiyle)
5. `knip` (yapılandırmalı; girdi noktaları `entegrasyonik.ts`, `dev-tools/*`, `tests/**`; §c.3 yanlış pozitifleri)
6. `jest --coverage` (birim + karakterizasyon + sözleşme)
7. Mandallar: `console.*` sayısı, `config/` dışı `process.env` sayısı, handler `getXModel()` sayısı, şemalı operasyon sayısı (artmalı), `capabilities:check`
8. `npm audit --omit=dev --audit-level=high` (gerekçeli istisna dosyası `audit-exceptions.json` ile)
9. `license-check`

**CI:** uzak depo hangi barındırıcıdaysa (bugün yerel Gitea `origin`) orada **tek pipeline** kurulur. Pipeline `verify` + frontend kapılarını (ADR-0017 §10) koşar. `main`/`master` birleştirmesi yeşil pipeline şartına bağlanır. CI kurulamadığı sürece `verify` **pre-push kancası** olarak zorunludur.

#### 8.4 Flaky test politikası
- Flaky test **tolere edilmez** (D1).
- Tespit edilen test 24 saat içinde ya düzeltilir ya da `tests/quarantine.json`'a eklenir. Kayıt şu alanları taşır: sahip, açılış tarihi, kök neden notu, **en fazla 14 gün**.
- Karantinadaki test ayrı bir işte `retryTimes(2)` ile koşar. Ana kapıyı kırmaz ama raporlanır. 14 günde kapanmayan kayıt CI'ı kırar.
- Duvar-saati toleranslı testler sahte zamanlayıcıya taşınır. İlk örnek `ResilientHttpClient.test.ts` (TB-02, B-R-T5).
- Gerçek ağ ya da gerçek DB kullanan test `tests/integration/` dışında **yasaktır**. Statik test bunu `net.connect`/`mongoose.connect` taramasıyla denetler.

### §9 — Uygulama planı

#### 9.1 "Hemen" listesi (fazdan bağımsız; bugün başlar, her biri S boyutunda, önce karakterizasyon)

| # | İş | Neden hemen | Sıcak dosya (tek sahip) |
|---|---|---|---|
| H1 | **C22 Trendyol V2:** Order V2 uç noktası, Ürün V2 servisleri, menşe alanı (23 Ekim), yerel `Integrations.urls` güncelleme betiği (dry-run; DB yazımı yedek şartı + insan onayı) | **15 Ekim 2026 kapanış**; 3×10 dk günlük brownout zaten başladı | `integration/modules/marketplace/trendyol/**` (bu iş bitene dek başka hiçbir iş Trendyol modülüne dokunmaz; §3.4 göçü C22'den sonra) |
| H2 | **GV-08** `OversellCompensationJob` satır bazlı atomik talep (§2.5) | Gerçek pazaryeri iptali çift gidebilir | `operations/stock/OversellCompensationJob.ts` |
| H3 | **GV-01** `escapeRegex` + arama uzunluk sınırı + `parsePagination(limit ≤ 100)` tüm `$regex`/sınırsız `limit` sitelerine (şema değil, yardımcı düzeyinde; şemalar B-R14'te) | ReDoS / tenant DB'sini düşürme | `order-service`, `claim`, `customer`, `financial`, `integration-service` (arama blokları), `invoice`, `admin`, `ticket`, `smart`, `notification` — **dosya başına küçük diff**, B-R-T kapsamı olmayan servislerde yardımcı testi + minimal karakterizasyon |
| H4 | GV-02 `getOrders` `dates.orderDate` (test kasıtlı ters çevrilir) + GV-09 `NotificationService` `await` + GV-05 `multer` `limits` / MIME | Kullanıcıya yanlış/boş liste; sessiz bildirim kaybı; bellek DoS | `order-service.ts` (H3 ile aynı sahip, ardışık), `NotificationService.ts`, `ImageApiManager.ts` |

#### 9.2 Fazlar

**Tahmin birimi:** ajan-günü (orkestratör doğrulaması hariç).

| Faz | Kapsam | Çıkış kapısı | Boyut | Geri alma |
|---|---|---|---|---|
| **Faz 0 — Silme/mekanik** | B-R1 (+ek), B-R2 (onaysız kısım), **B-R3** (`tsconfig.build.json`, ES2022, `dom` kaldır, `noUnusedLocals`; jest `projects` ile gerçek-Mongo testi ayrılır; Node LTS yükseltmesi + Docker imaj özeti sabitleme — §10.2 S6), **B-R4** (ESLint, Prettier, dependency-cruiser taban çizgisi, knip, coverage mandalı, `verify`, CI/pre-push), **tek "bağımlılık ekleme" commit'i**: `zod`, `pino`, `helmet`, `lru-cache`, `ioredis` (bildirim), devDep kalite araçları — sonraki fazlar `package.json`'a dokunmaz | tsc 0; tam jest 3× yeşil; `dist/` içinde test yok; `npm audit --omit=dev` yüksek = yalnız istisna dosyasındakiler; `npm run verify` yeşil; depcruise/knip taban çizgileri commit'li; `docker build` başarılı | ~3-4 | Commit başına `git revert`; Node yükseltmesi ayrı commit |
| **Faz 1 — Temel altyapı** (ADR-0017 Aşama A ve ADR-0019 Aşama A ile **BİRLEŞİK**) | 1a **B-R5** `config` (= ADR-0017 §10 env). 1b **B-R6** `AppError` + katalog + `errorMiddleware` + RPC zarfı (= ADR-0017 A hata zarfı) — FE metin bağımlılığı taraması önce. 1c **B-R7** logger + `requestContext` + `X-Request-Id` + `console` köprüsü (= ADR-0017 A Karar 1). 1d **B-R11** `platform/runtime/scheduler` = ADR-0017 `runJob`/`JobRunRegistry` **+ lease + overlap + shutdown**; 9 iş göçü; `*Scheduler.ts` silinir (tek iş kalemi, iki ADR'nin ortak çıktısı). 1e **ADR-0019 Aşama A** (kayıt + içe aktarıcı + `derivePolicy` + parite v1) → ardından **B-R10'un kalanı**: `RunOperation` `validate` + `entitle` (no-op) kancaları, `VALIDATION_MODE`. 1f **B-R12** katalog motoru dayanıklılığı: Export/Import durdurma bayrağı + `AbortController`, `key.split('-')`, `POD_NAME`→`podIdentity`, §2.4 kısa yoklama. 1g `platform/runtime/jobs` (isimli kuyruk fabrikası; ilk tüketici Faz 4'te — yalnız fabrika + test). B-R8 (şema dışı yardımcılar) H3 ile zaten yapıldı; B-R9 = H2/H4 | ADR-0017 Aşama A çıkış kapısının tamamı; `config` dışı `process.env` mandalı aktif; 500 yanıtında iç ileti YOK testi; 2 sahte pod × 9 iş → her turda tek yürütme testi; kapanışta koşan iş 15 sn içinde `AbortSignal` alır testi; ADR-0019 A çıkış kapısı (türetilen politika = anlık görüntü); Export/Import döngüleri `stop()` ile sonlanır testi; tsc 0, jest 3× | ~12-15 | Bayraklar: `LOG_FORMAT=legacy`, `SCHEDULER_LEASE=off`, `VALIDATION_MODE=warn`; `runJob` saydam sarmalayıcı |
| **Faz 2 — Test ağı** (Faz 1 ile **paralel** başlayabilir; Faz 3'teki ilgili adımdan ÖNCE bitmek zorunda) | B-R-T1 (katalog servisleri), B-R-T2 (sipariş/iade/müşteri/fatura/mesaj/finans + engine repository'leri), B-R-T3 (`integration-service`, menu, setting, configuration, smart, notification, image/S3), B-R-T4 (transformer'lar + 6 adaptörde sözleşme şablonu — ADR-0018 A fikstürleriyle ortak), B-R-T5 (flaky + `supertest` sözleşmeleri) | §8.2 Faz 2 hedefleri; flaky karantina boş; `supertest` hata zarfı/auth/politika sözleşmeleri yeşil | ~12-16 (4 paralel alt ajan) | Yalnız test ekler; risk yok |
| **Faz 3 — Katman/modülerleştirme** | **B-R13** ters bağımlılıklar + dosya taşımaları (`api/{http,rpc,webhooks,files}`, `platform/core/{errors,crypto}`) — **mekanik, tek başına commit, başka işle karıştırılmaz**; depcruise `operations/modules→api` kuralı `error`. **B-R14** zod şemaları (yüksek risk sırası, §4.1) → `enforce`. **B-R15** `IntegrationService` bölme (ayar / iş günlüğü / dışa aktarma toplu işlem → `integration/engine/catalog/export/ExportBatchService` / platform arama); RPC adları aynı. **B-R16** servis başına: handler ince cephe + `database/repositories` + `operations/<alan>` (sıra: order → claim/customer/message → variant/product → admin → user [MM-20 §5.3]). **B-R17** portlar + registry + Proxy kaldırma + 5 kategori config araması (§3; adaptör başına commit). **B-R18** `TenantRegistry` + `ClientDB` havuz/referans sayımı (§5.2) | depcruise: `operations/modules→api` = 0, `no-circular` = 0; handler `getXModel()` mandalı her adımda düşer (hedef 0); `integration-service` cephesi ≤ 300 satır; `switch` yok; Proxy yok; RPC başına ApplicationDB okuması 3 → ≤ 1 (merkezi `Users` hariç) testle; ilgili karakterizasyonlar değişmeden yeşil (kasıtlı ters çevirmeler etiketli) | ~20-25 (adımlar arası paralel, aşağıdaki harita) | Servis/adaptör başına commit; taşımalarda bir faz boyunca yeniden-dışa-aktarma |
| **Faz 4 — Yeni yetenekler** | §6 dalga 1 → 2 → 3 (insan kararı gelen öne alınır) | Her yetenek: E8 (kayıt + UI + MCP kararı + test + belge), iki-tenant IDOR testi, RBAC reddi, audit, metrik; dış yan etkili yazmalarda §2.5 talep + idempotency + `UNKNOWN_OUTCOME` doğrulaması | Yetenek başına S-L | Yetenek bayrağı (`SystemFlags.disabledCapabilities`, ADR-0019) |

**ADR-0015 (frontend) ile sıra uyumu:**
- **B4-P0 ekranları** (N1/N2 hazır; N5 stok politikası → B-N6; N4 KVKK indirme → B-N5 rotası; N3 abonelik yönetimi → ADR-0008 B) backend'i hazır olan sırayla açılır.
- ADR-0017 Aşama D (FE hata kodu eşleme, Destek kodu) **B-R6'dan sonra** başlar.
- ADR-0019 Aşama B (FE `restApi.call`) **1e'den sonra** başlar.
- Backend Faz 3 **RPC sözleşmesini değiştirmediği** için FE aşamalarını beklemez ve bloklamaz.

#### 9.3 Paralellik haritası (worktree güvenliği)

**Sıcak dosyalar — tek sahip kuralı** (aynı anda yalnız bir worktree dokunur; orkestratör birleştirme sırasını yönetir):

| Sıcak dosya/klasör | Sahip (o anda) | Diğerleri için kural |
|---|---|---|
| `backend/package.json`, `package-lock.json` | Faz 0 "bağımlılık" commit'i; sonra yalnız Faz 4'te yetenek başına tek commit (`exceljs`, `otplib`, `@modelcontextprotocol/sdk`) | Başka worktree bağımlılık eklemez; ihtiyaç orkestratöre bildirilir |
| `tsconfig*.json`, `jest.config.js`, `.eslintrc`/`eslint.config`, `.dependency-cruiser.js` | Faz 0 B-R3/B-R4 | Sonrasında yalnız taban çizgisi dosyaları (`--write`) değişir |
| `entegrasyonik.ts`, `src/bootstrap/**` | Faz 1d (scheduler) → sonra 1c (logger köprüsü) — **sıralı** | — |
| `api/ApiManager.ts`, `api/RunOperation.ts`, `Webserver.ts` | 1b (hata zarfı) → 1c (requestId) → 1e (validate/entitle) — **sıralı**; B-R13 taşıması Faz 3 başında tek commit | Faz 4 işleri buraya dokunmaz (kancalar hazır) |
| `api/operationPolicy.ts`, `docs/OPERATION_POLICY.md`, `capabilities/index.ts` | 1e (ADR-0019 A) | Sonrasında yetenek eklemek **alan dosyasına** (`capabilities/domains/<alan>.ts`) yapılır → çakışma alan başına |
| `api/index.ts` | 1e'ye kadar yalnız ekleme; sonra kayıttan doğrulanır | — |
| `integration-service.ts` | "Yapılıyor" işler (B-N4 sağlık, B-N6 stok politikası) → H3 arama blokları → B-R15 | B-R15, B-N4 ve B-N6 birleşmeden başlamaz |
| `order-service.ts` | H3 → H4 (GV-02) → B-R16 | — |
| `integration/modules/IntegrationFactory.ts` | B-R17 | ADR-0018 A `descriptor.ts` dosyaları **adaptör klasöründe** (fabrikaya dokunmadan) paralel yazılabilir |
| `integration/modules/marketplace/trendyol/**` | H1 (C22) | ADR-0018 A Trendyol sözleşmeleri ve §3.4 Trendyol göçü H1 birleştikten sonra |
| `database/application/{ApplicationDB,ApplicationMongooseSchemas}.ts` | Yalnız **ekleme** (yeni model = yeni dosya + tek kayıt satırı) | Aynı gün iki ekleme → orkestratör sırayla birleştirir |
| `config/env.schema.ts`, `.env.example` | 1a'dan sonra yalnız **ekleme** | Aynı kural |

**Güvenle paralel yürüyen işler:**
- **Faz 0:** B-R1 ‖ B-R3 (B-R2'nin onaysız kısmı B-R1'den sonra). H1 ‖ H2 ‖ H3 ‖ H4 (H3 ve H4, `order-service` üzerinde sıralı).
- **Faz 1:** 1a → {1b, 1d, 1g} paralel → 1c (1b ve 1d'den sonra, sıcak dosya sırası) ; 1e (1b'den sonra) ‖ 1f (1d'den sonra). ADR-0018 Aşama A (descriptor, `IntegrationFinding`, bekçi) Faz 1 ile **paralel** yürür, sıcak dosyalardan yalnız `ResilientHttpClient`'a dokunur (tek sahip: ADR-0018 A).
- **Faz 2:** B-R-T1 ‖ B-R-T2 ‖ B-R-T3 ‖ B-R-T4 (yalnız test dosyası ekler, `src/` değişmez). Faz 1 ile de paralel.
- **Faz 3:** B-R13 **tek başına** (mekanik taşıma, diğer her şey dondurulur, 1 gün). Sonra B-R14 (servis başına dosya) ‖ B-R16 (farklı servisler) ‖ B-R17 (adaptör başına) ‖ B-R18. B-R15 ise B-R16'nın `integration-service`'e dokunmayan adımlarıyla paralel yürür.
- **Faz 4:** dalga içindeki yetenekler farklı `operations/<alan>` klasörlerinde paralel yürür. Ortak noktalar: `capabilities/domains/<alan>.ts`, model kaydı (yalnız ekleme), `bootstrap/schedules.ts` (yalnız ekleme).

### §10 — Baseline uyumu ve açık insan kararları

#### 10.1 `PLATFORM_BASELINE.md` uyumu

| Satır | Durum | Nasıl (bu ADR) |
|---|---|---|
| A1 Gözlemlenebilirlik | Uygulanır | ADR-0017'ye uyar. Yerleşim `platform/core/logger`, `platform/runtime/metrics`. Zamanlayıcı turları `runId`; RPC `requestId` |
| A2 Hata yönetimi | Uygulanır | §4.3 `AppError` + katalog + maskeleme + Destek kodu (`requestId`) |
| A3 Dayanıklılık | Uygulanır | §2.5 atomik talep, §3.3 `AbortSignal` üst süre + `UNKNOWN_OUTCOME`, iş kuyruklarında retry/DLQ (`platform/runtime/jobs`), Idempotency-Key (v1) |
| A4 Zamanlanmış işler | Uygulanır | §2: tek soyutlama, lease, overlap, JobRunRegistry, Redis-kapalı semantiği, stale tespiti |
| A5 Yaşam döngüsü | Uygulanır | §2.3 kapanış, durdurulabilir döngüler, `config` fail-fast |
| A6 Yedekleme/DR | Uygulanır (sınırlı) | Bu ADR'deki tüm DB değişiklikleri (indeks, MM-20 göçü, legacy abonelik göçü) dry-run + doğrulanmış yedek şartlı. RPO/RTO ADR-0017 §10 |
| A7 Kapasite | Uygulanır | Zorunlu sayfalama (`limit ≤ 100`), `$regex` sınırı, tenant önbelleği, havuz boyutu, yoklama maliyeti hesaplı |
| A8 Sürüm/göç | Uygulanır | RPC donuk; `api/v1` sürüm politikası (§4.4); göçler dry-run; yeniden-dışa-aktarma ile kademeli taşıma |
| B1 Kimlik/yetki | Uygulanır | Politika ADR-0019 kaydından türetilir; `principal.kind` (apiKey/agent) |
| B2 Tenant izolasyonu | Uygulanır | Repository kurucusunda tenant; statik test; `twoTenantHarness`; önbellek anahtarında tenant (§3.3, §5.2) |
| B3 Girdi doğrulama | Uygulanır | §4.1 zod + `warn`→`enforce`; multer sınırları (H4) |
| B4 Gizli yönetimi | Uygulanır | `platform/core/crypto` tek yer; API anahtarı yalnız özet; registry `ctx.settings` çözülmüş sırrı yalnız adaptöre verir |
| B5 Web güvenliği | Uygulanır | `helmet` (ADR-0017 §10), `x-powered-by` kapalı, CSP (ADR-0017) |
| B6 Kötüye kullanım | Uygulanır | Genel rate limit (ADR-0017 §10), `api/v1`'de baştan Redis limiter, `rateCost` (ADR-0019) |
| B7 Denetim izi | Uygulanır | B-N7: `effect ∈ {write, destructive}` otomatik audit + okuma ucu |
| B8 KVKK | Uygulanır | B-N5 indirme rotası + purge zamanlayıcısı (C17); webhook "thin" olay (PII yok); log redaksiyonu |
| B9 Bağımlılık/lisans | Uygulanır | §7 temizlik, `verify`'da audit + lisans, istisna dosyası |
| B10 Oturum/hesap | Uygulanır | N1/N2 yapıldı; B-N13 2FA; merkezi `Users` tek kaynak (§5.3) |
| C1–C10 | Uygulanmaz (bu ADR) | Backend mimari kararı; UI ADR-0015/0017'de. C10 bildirim için backend temeli B-N1 |
| D1 Test piramidi | Uygulanır | §8.1 + gerçek-DB ayrımı |
| D2 Kalite kapıları/CI | Uygulanır | §8.3 `verify` + CI/pre-push |
| D3 Modülerlik | Uygulanır | §1 katman sözleşmesi + dependency-cruiser + God class bölme |
| D4 Yapılandırma | Uygulanır | `config/` zod şeması, mandal |
| D5 API sözleşmesi | Uygulanır | RPC donuk + zarf; `api/v1` + OpenAPI kayıttan |
| D6 Belgeleme | Uygulanır | Bu ADR; `ERROR_CODES.md` ve `CAPABILITIES.md` üretilir; `integration/README.md` ve CLAUDE.md mimari bölümü güncellenir (Faz 0) |
| D7 Temizlik | Uygulanır | §7 |
| D8 Geliştirici deneyimi | Uygulanır | `verify` tek komut; `.env.example` şemayla eşlenir; `start:local` egress guard korunur |
| D9 Git hijyeni | Uygulanır | Commit başına tek adım; mekanik taşıma ayrı commit; yol yol `git add` |
| D10 (önerilen, ADR-0019) | Uygulanır | Faz 4 her yetenek için |
| E1 Plan/kota | Uygulanır | B-N3 (API + Engine guard), legacy göçü önce |
| E2 Faturalama | Uygulanmaz (bu ADR) | ADR-0008 |
| E3 Entegrasyon dürüstlüğü | Uygulanır | Tek manifesto (§3.2), kargo/e-fatura "yakında" (adaptör gelene dek) |
| E4 Ürün analitiği | Uygulanmaz | Kapsam dışı |
| E5 Destek/operasyon araçları | Uygulanır | ADR-0017 konsol; §2 JobState; DLQ |
| E6 Genişleme noktaları | Uygulanır | B-N10 (`api/v1`, anahtar, imzalı idempotent webhook), B-N11 otomasyon, DomainEvents |
| E7 Yasal/marka | Uygulanmaz | — |
| E8 Yetenek eşitliği | Uygulanır | Use-case yüzeyden bağımsız (§1.4); kayıt tek kaynak |

#### 10.2 Açık insan kararları (her birinin varsayılanı var; fabrikayı durdurmaz)

| # | Karar | Varsayılan (itiraz yoksa geçerli) |
|---|---|---|
| S1 | **E-posta sağlayıcısı** | Mevcut SMTP hesabı (Zoho) + `nodemailer` güncel yamalı ana sürüm, `MailTransport` portu arkasında. Barındırılan API sağlayıcısı (ücretli olabilir, Protokol 12) yalnız eşikte (§Maliyet) |
| S2 | **Arama teknolojisi** | Mongo-yerel: kaçışlı öneki bağlı arama → eşikte `$text`. Atlas Search yok |
| S3 | **Çok-pod ölçek** | Faz 1 çıkışına dek `web` ×1 + `worker` ×1 (ya da `all` ×1). Faz 1 sonrası worker ≥ 2 serbest. Web ≥ 2 → Redis rate limiter (ADR-0017) |
| S4 | **`gitlab/` ve `mockserver/`** (C5/C15) | `gitlab/`: `git rm` önerilir, onay beklenir; geçmiş temizliği rotasyonla tek olay. `mockserver/`: dokunulmaz + mekanik temizlik önerisi; orta vadede sözleşme fikstürlü mock |
| S5 | **Dağıtım build komutlarının teyidi** (Render/Railway; GN-05) ve **üretim `DB_URL` `compressors=`/GSSAPI teyidi** (GN-07) | Teyit gelene dek rollup/webpack zinciri ve native paketler **silinmez** |
| S6 | **Node LTS sürümü** | Node 24 LTS (Node 20 upstream desteği bitti; 22'nin kalan süresi kısa — sürüm takvimi uygulama anında resmi kaynaktan doğrulanır). `bcrypt`/`sharp` native derleme `docker build` + tam jest ile kanıtlanamazsa Node 22 LTS. `engines` + `.nvmrc` + imaj özeti sabitleme |
| S7 | **`api/v1` destek süresi ve webhook yeniden deneme takvimi** | ≥ 12 ay; 1 dk, 5 dk, 30 dk, 2 sa, 6 sa, 24 sa sonra dur + tenant bildirimi (araştırma Konu 3 önerisi) |
| S8 | **Mevcut tenant'lar için legacy abonelik göçü** (B-N3 ön koşulu) | `billingExempt:true` legacy kaydı; göç dry-run + yedek + insan onayı ile `--apply` |
| S9 | **Kargo firması ve e-fatura entegratörü** | ADR-0018 Karar 6 varsayılanları (port var, adaptör yok, formlar "yakında") |
| S10 | **Toplu içe aktarma geri alma süresi** | 7 gün (yalnız fiyat/stok/durum alanları; araştırma Konu 6) |

Bu tabloda **olmayan** her şeyin (katman kuralları, TTL'ler, yoklama aralıkları, eşikler, kapsam hedefleri) varsayılanı bu ADR'dedir ve ölçümle ayarlanır.

## Gerekçe

- **Maliyet bilinci:**
  - Tek haneli tenant ölçeğinde darboğaz yığın değil; sınırların belirsizliği, çok-pod güvensizliği, doğrulamasız girdi ve test ağı eksikliği.
  - Bu ADR'nin getirdiği çalışma zamanı maliyeti:
    - Yeni servis: 0.
    - Yeni üretim bağımlılığı: `zod`, `pino`, `helmet` (üçü de zaten ADR-0017/0018/0019'dan geliyor) ve `lru-cache` / `ioredis`'in açık bildirimi (zaten yüklüler).
    - Mongo yükü: dakikada < 20 lease yazımı + worker başına dakikada 4 hafif yoklama.
  - Karşılığında şu riskler kapanır: çift pazaryeri iptali (GV-08), ReDoS (GV-01), iç ileti sızıntısı (GV-07), ≤ 5 dk sinyal gecikmesi (MM-14), yeni kategori maliyeti (MM-17).
- **Genel hatlara uyum:**
  - Çok-kiracılı model (DB-per-tenant, principal kaynaklı tenant), IntegrationEngine (Mongo durum makinesi + BullMQ sipariş hattı), mevcut 6 adaptör, alias'lar ve **RPC sözleşmesi** aynen kalır.
  - Eklenenler altyapı katmanları ve sınırlardır. Hiçbir iş kuralı yeniden yazılmaz.
- **Neden B3 (iş başına lease), BullMQ scheduler değil:**
  - Zamanlanmış işlerin çoğu Mongo'ya aittir. Onları Redis'e bağlamak ADR-0005'in bilinçli sınırını deler ve Redis kesintisinde stok yayınını ve telafiyi durdurur.
  - Lease yardımcısı mevcut ve testlidir. ADR-0017 `runJob` ile tek soyutlama olur.
- **Neden kısa yoklama, pub/sub değil:** durum zaten DB'de. Yoklama kayıpsızdır, Redis'siz çalışır ve 15 sn gecikme katalog işlerinin dakika-saat ölçeği için yeterlidir.
- **Neden `IPlatform`'u fiziksel bölmek değil:** ADR-0018 eşiği aşılmadı. Derleme-zamanı birleşim, yeni kodun dar porta bağımlı olmasını ve kategori-genel manifestoyu **sıfır çağıran değişikliğiyle** sağlar.
- **Neden kayıttan şema:** ADR-0019 tek kaynağı zaten zorunlu kılıyor. RPC, MCP, `api/v1` ve ajan aynı zod şemasını kullanınca doğrulama, dokümantasyon ve OpenAPI tek yerden türer. Ayrı bir politika genişletmesi ikinci kaynak yaratırdı.
- **Neden mandal disiplini:** paralel worktree fabrikasında "sıfırdan temiz" hedefi çakışma üretir. Taban çizgisi + "artamaz" kuralı, kalite borcunu her committe biraz azaltır ve geri kaymayı engeller.

## Maliyet/Ölçek Notu

**Ek maliyet:**
- Yeni servis yok.
- Yeni koleksiyonlar (ApplicationDB): `JobLeases` (iş başına 1 doküman). Faz 4'te `DomainEvents` (7 gün TTL), `FileJobs`, API anahtarları ve webhook abonelik/teslim günlüğü. ADR-0017/0018/0019 koleksiyonları kendi ADR'lerindedir.
- Bütün koleksiyon/indeks eklemeleri CLAUDE.md kural 3'e tabidir.
- **Operasyon yükü:** CI/pre-push `verify` süresi (hedef ≤ 6 dk) ve mandal tabanlarının `--write` ile güncellenmesi.
- **Geliştirme maliyeti:** Faz 0-3 toplamı ~47-60 ajan-günü (paralelle takvimde ~3-4 hafta). Faz 4 yetenek başına.

**Yeniden değerlendirme eşikleri (sayısal):**
- **Modüler monolit → servis ayırma ADR'si** yalnız şu koşullardan biri sağlanırsa açılır:
  - Aktif tenant > 200.
  - Bir alanın CPU'su diğerlerinden bağımsız olarak 7 günün ≥ 3'ünde > %70 **ve** dikey ölçek tükenmiş (ADR-0005 Seviye 2 sonrası).
  - ≥ 3 bağımsız geliştirme ekibi aynı dağıtım hattında haftada > 2 çakışma yaşıyor.
- **Zamanlayıcı:**
  - Kayıtlı iş sayısı > 30, **veya** tenant başına kullanıcı tanımlı zamanlama (rapor/otomasyon) > 100 → tenant-kapsamlı zamanlamalar için BullMQ Job Scheduler ADR'si. Platform işleri lease'te kalır.
  - Lease yazımı > 200/dk → lease süreleri ve iş aralıkları gözden geçirilir.
- **`web` → `worker` sinyali:** kullanıcı tetikli export'un başlama gecikmesi p95 > 30 sn (7 gün), **veya** worker pod ≥ 5, **veya** yoklama sorguları toplam > 60/dk → Redis pub/sub sinyal (katalog hattına Redis bağımlılığı ADR-0005 değişikliğiyle).
- **Önbellek tutarlılığı:** ayar değişikliği sonrası "eski ayarla çalıştı" olayı ayda ≥ 1 **veya** entegrasyon ayarı yazımı > 100/gün → ayar sürüm damgası + Redis pub/sub geçersiz kılma.
- **Tenant önbelleği / havuz:** aktif tenant > 50 (ADR-0003/0013 eşiğiyle aynı) **veya** Atlas bağlantı sayısı limitin > %60'ı → havuz boyutu, LRU `max` ve tenant başına DB kullanıcısı birlikte yeniden değerlendirilir.
- **Arama:**
  - Tek tenant koleksiyonunda > 200 bin doküman **veya** arama p95 > 800 ms (7 gün) → 2. basamak (`$text` + `searchText`).
  - > 2 milyon doküman **veya** yazım-hatası toleransı talebi ≥ 3 müşteri → Atlas Search ADR'si.
- **E-posta:** geri dönme > %5 **veya** spam şikâyeti > %0,3 **veya** aylık hacim > 10 bin **veya** SMTP gönderim hatası > %2 (7 gün) → barındırılan transactional e-posta API'si (Protokol 12).
- **DomainEvents:** kritik akışta kayıp olay ayda ≥ 1 → tenant DB'de transactional outbox (replica set şartı; yerel geliştirme için replica set kararı).
- **Doğrulama:** `validation_rejections` `enforce` sonrası 7 günde > %1 istek → ilgili şema FE ile birlikte gözden geçirilir (şema gevşetilmez, FE düzeltilir ya da alan açıkça eklenir).
- **Kalite kapısı süresi:** `verify` > 10 dk → jest paralel shard + değişen-dosya odaklı lint.
- **`IPlatform` fiziksel ayrıştırma:** ADR-0018 Karar 1 eşiği aynen (uygulayıcıların ≥ %40'ı metotlarının yarısından fazlasını `NOT_SUPPORTED` işaretlerse).
- **`api/v1`:** kamu API isteği > 1 milyon/ay **veya** harici entegratör > 20 → sürüm başlığı modeli, API geçidi ve kota faturalaması yeniden değerlendirilir.

## Etki Alanı

**Backend (kademeli):**
- `entegrasyonik.ts`, yeni `src/bootstrap/**`, `src/config/**`, `src/platform/**`
- `src/api/**` (taşıma `http/rpc/webhooks/files/v1`, handler'lar ince cephe)
- `src/operations/**` (alan-bazlı)
- `src/database/repositories/**`, `src/database/TenantRegistry.ts`, `ClientDB.ts`
- `src/services/**` (yalnız altyapı), `src/services/mail` (`MailTransport`)
- `src/integration/{ports,registry,compliance}/**`, `integration/modules/**` (`descriptor.ts`, `testConnection`), `IntegrationFactory.ts` (cephe)
- `integration/engine/catalog/export/{ExportOrchestrator,ImportOrchestrator}` (durdurma, yoklama), `operations/stock/*` (scheduler göçü, GV-08)
- `interfaces/platforms` (tip birleşimi)
- `tsconfig*.json`, `jest.config.js`, `package.json`, `Dockerfile` (Node LTS, özet sabitleme, `krb5-dev` onay sonrası)
- Yeni kalite yapılandırmaları (ESLint, Prettier, dependency-cruiser, knip)

**Testler:** `tests/{unit,characterization,contract,integration,helpers}`, `twoTenantHarness`, `quarantine.json`, mandal tabanları.

**Belgeler:**
- `docs/ERROR_CODES.md` (üretilir)
- `CLAUDE.md` "Architecture" bölümü (Faz 0 sonunda bu ADR'ye göre güncellenir: test takımı var, alias listesi, katman kuralları)
- `src/integration/README.md` (yeniden yazılır)
- `docs/PLATFORM_BASELINE.md` (D10 önerisi — orkestratör)
- `BACKLOG.md` (B-R/B-N kalemleri, H1-H4 — orkestratör işler; bu ADR güncellemez)

**Frontend:** doğrudan değişiklik yok. RPC hata yanıtına eklenen `code` / `requestId` alanları ADR-0017 Aşama D'de tüketilir. `ecommerce-service` kararı (C10) FE ile koordinelidir.

**İlişkili ADR'ler:**
- 0001 (principal/RBAC)
- 0003 / 0013 (tenant DB, MM-20)
- 0004 (GV-08)
- 0005 (Redis sınırı, sinyal)
- 0006 (dayanıklılık, roller, kapanış)
- 0008 (entitlement, legacy göçü)
- 0009 / 0010 (MCP, OAuth, `api/v1` kimliği)
- 0015 (FE sırası)
- 0017 (yerleşim eşlemesi; Karar 3 lease hükmü öne çekildi)
- 0018 (tek manifesto, registry yerleşimi, Proxy notu)
- 0019 (şema tek kaynak, Aşama A = B-R10)

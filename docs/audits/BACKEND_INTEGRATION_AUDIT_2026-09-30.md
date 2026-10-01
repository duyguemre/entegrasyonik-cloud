# BACKEND_INTEGRATION_AUDIT — 2026-09-30

Kapsam: `backend/src/integration/**` (öncelik), cache/perf, gözlemlenebilirlik, API/güvenlik, test organizasyonu.
Çalışma kopyası: `.claude/worktrees/be` (dal `faz4-integration`). Yöntem: **yalnızca statik kod okuma** (kod değiştirilmedi, sunucu/DB/Redis çalıştırılmadı, test koşulmadı).
Durum sözlüğü: **DOĞRULANDI** = kodda satır düzeyinde görüldü · **DOĞRULANAMADI** = statik okumayla karar verilemedi, ek inceleme gerekiyor.
Kanıt biçimi: `dosya:satır` (yol `backend/src/` köküne göre; aksi belirtilmedikçe).
Bu dosyada sır/parola/PII yoktur.

Sınırlar (dürüstlük notu):
- BACKLOG.md 312 satırın çoğu çok uzun tablo satırıdır; C1, C2, C8, C12, C16, C17 gibi satırların ARKA bölümleri kısaltılmış okundu. Bu maddelerde "kalan kısım" `DOĞRULANAMADI` işaretlidir, ilgili ADR/backlog-detail ile teyit edilmelidir.
- Alan listeleri (bölüm 2.3) bir betikle çıkarılmış **ham heuristiktir** (nesne-literal anahtarları + `raw.x` okumaları); dahili ve harici alanlar karışık olabilir. Resmi dokümanla karşılaştırmadan önce her converter elle doğrulanmalıdır.
- Test süresi ölçülmedi (bölüm 6).

---

## 1. BACKLOG — açık / kısmen açık maddeler (kapsam filtreli)

Kaynak: `BACKLOG.md`, `MASTER_STATE.md`, `docs/PLATFORM_BASELINE.md`. "Kanıt" = backlog/ADR/kod yolu.

| ID | Kapsam | Tek satır özet | Durum | Kanıt |
|---|---|---|---|---|
| C22 | entegrasyon | Trendyol API kapanışları: eski sipariş uç noktası + Ürün V1 **15 Ekim 2026**, menşe (origin) zorunluluğu **23 Ekim 2026**. Kod tarafı (sipariş V2, ürün V2, urlSafetyNet) kapandı; canlı DB URL göçü ve gerçek-mod duman testi doğrulanmadı | kod kapandı / **canlı doğrulama açık, zaman kritik** | BACKLOG C22 (2026-09-28 satırları), `integration/modules/marketplace/trendyol/urlSafetyNet.ts`, `package.json` `migrate:trendyol-urls` |
| C11 | entegrasyon | Trendyol varsayılan URL + User-Agent (SELLERID) düzeltmesi | büyük ölçüde kapandı; `OrderConnector.ts:13,214,241,285` sabit URL fallback'leri sürüyor | `trendyol/services/Service.ts:17,65-74`, `trendyol/api/OrderConnector.ts:13` |
| C20 | entegrasyon | Trendyol mock/adaptör şema sapmaları (contract test bulgusu) | açık (yalnız raporlandı) | BACKLOG C20, `tests/contract/Trendyol.schema.test.ts` |
| C10 | entegrasyon | Ideasoft gerçek mod token akışı kopuk (`init()` çağrılmıyor, token boş) | açık — bilinçli dokunulmadı | `ecommerce/ideasoft/services/Service.ts:20-33` yorumu, `SecurityService.ts` |
| C9 | entegrasyon | "Sahte başarı" (sonuç yutma) | büyük ölçüde kapandı; `checkBatchProduct` Bizimhesap/Ideasoft hâlâ daima `undefined` | BACKLOG "İncelenmesi gereken" 16-17, `erp/bizimhesap/services/ProductService.ts` |
| C14 | kuyruk/arka plan | Durdurma bayrağı yok (`clearInterval` çağrılmıyor); Export kilit anahtarı `split('-')` tireli platform kodunu keser; Import `PROCESS_NEXT_IMPORT_JOB` olay kaybı (≤30 sn gecikme) | açık uç | BACKLOG 2026-09-28 "C14 açık ucu"; `engine/catalog/export/ExportOrchestrator.ts:42`, `engine/catalog/import/ImportOrchestrator.ts:30` |
| C7 | kuyruk | Sipariş sync bütünlüğü; `OrderRepository.updateLastSyncTimestamp` DB hatasını yutuyor | çekirdek kapandı; "yutulan hata" ucu açık | BACKLOG "İncelenmesi" (1g-T3) |
| 1g-T3 | kuyruk | `order.config.json > retryLimits` — backlog "hiçbir yerde kullanılmıyor" diyor; kodda `OrderQueueProducer.ts:19-22` kullanıyor → **not bayat, teyit gerek**; `worker-runner.ts` Worker seçeneklerinde attempts/backoff yok | kısmen bayat | `engine/order/OrderQueueProducer.ts:19-28`, `engine/order/worker-runner.ts:45` |
| C3 | cache/tenant | `@Cache` tenant sızıntısı: sızıntı kapandı; ADR-0002 adım 3-5 (zorunlu `scope` API, yasak-metot mandalı, `invalidateTenantCache`, tespit betiği) YAPILMADI | kısmen | `docs/adr/0002-*.md` "Uygulama sırası", `utils/decorator/cache.ts` |
| C1 | güvenlik/yetki | Kimlik doğrulama etkisizdi; imza doğrulama/RBAC/varsayılan-ret kapandı. Kalan ayrıntılar (satır kısaltıldı) | kısmen kapandı — kalan kısım DOĞRULANAMADI | BACKLOG C1, `api/operationPolicy.ts`, `api/RunOperation.ts` |
| 1g-T1 | güvenlik | Cookie regex boşluksuz ayraç; login kullanıcı enumeration mesaj farkı; captcha yalnızca varlık kontrolü; `UserService.updateUser` merkezi filtre e-posta değişiminde eşleşmiyor | açık (yalnız kaydedildi) | BACKLOG "İncelenmesi" (ADR-0001 adım 6/7, 1g-T1) |
| C2 | yetki/audit | AdminService yetki kısmı kapandı; `deleteClient` tenant DB/R2 silmemesi C17 ile ilişkili | kısmen | BACKLOG C2/C17 |
| C5 | secret | Kaynakta/geçmişte sabit sırlar: kod kısmı kapandı; **rotasyon + git geçmişi temizliği insan onayı bekliyor** | açık · onay bekliyor | BACKLOG C5 |
| C13 | secret/PII | Local kopyada gerçek müşteri verisi (maskeleme yok) | açık | `docs/DB_BACKUP_VERIFICATION.md` |
| C12 | güvenlik/PII | Hassas veri ifşası: profil DTO, sanitizer eklendi; kalan uçlar teyit edilmemiş | kısmen — kalan DOĞRULANAMADI | `api/responseSanitizer.ts` |
| C15 | test/altyapı | Mock DB (`unified_mock_marketplaces`) izinli 7 DB listesinde yok → mock sunucusu çalıştırılamaz | açık · karar bekliyor | BACKLOG C15 |
| C16 | yetki/billing | Entitlement guard API+motora bağlandı ama `ENTITLEMENT_GUARD_ENABLED` varsayılan KAPALI; e-posta/insan kararları | kısmen | `api/RunOperation.ts:62-80`, `integration/engine/order/OrderQueueProducer.ts:63-79` |
| C17 | KVKK | Tenant purge mantığı var; **periyodik tetikleme yok / gerçek R2 silme insan kararı** (ADR-0003 3c notu) | kısmen | BACKLOG "İncelenmesi" (ADR-0003 aşama 3c) |
| C18 | bağımlılık | 0 critical/3 high (nodemailer, sharp majör; xlsx düzeltmesiz); qs/express, uuid transitive; majör yükseltmelerin characterization testi yok | açık · kısmen | BACKLOG "Bağımlılık güvenliği istisna kaydı", `backend/package.json` |
| ADR-0017 | log/metrik/health | Aşama A (log, correlation, JobRunRegistry) ve B (metrik, ErrorEvents, `/client-log`) kapandı. **Aşama C (alarm+bildirim) yapıldığına dair kanıt bulunamadı**; Aşama D frontend dilimi kısmen | kısmen | `docs/adr/0017-*.md` Karar 8, BACKLOG 2026-09-28/29 satırları |
| ADR-0016 | modernizasyon | Faz 0 (B-R1..B-R4) kapandı; girdi doğrulama (zod) ve modül sınırları planı sürüyor | kısmen | BACKLOG "Backend kod denetimi"; `docs/BACKEND_CODE_AUDIT.md` |
| ADR-0018 | drift/uyum | Aşama A+B kapandı (descriptor, ContractGuard, ProbeRunner replay, SourceMonitor). Canlı probe yürütücü yok (insan kararı). Yalnız Trendyol zod sözleşmesi var | kısmen | `integration/catalog/*`, `integration/compliance/*`, `trendyol/contracts/*` |
| ADR-0020 | ayar yönetimi | Aşama A-D kapandı; Trendyol `envLock` sayısal doğrulama farkı (`positiveIntEnv`) korunuyor | kapandı (küçük fark açık) | BACKLOG ADR-0020 satırları |
| ADR-0021 | veri/index | Aşama A + D9 indeks göçleri kapandı; **D9 sırasında yedek/kural 3 olay kaydı, kullanıcı onayı bekliyor** | kısmen (onay bekliyor) | BACKLOG "ADR-0021 D9 ... OLAY KAYDI" |
| GV-08/GV-01 | güvenlik/idempotency | Oversell iptal claim + `$regex` enjeksiyonu kapandı | kapandı | BACKLOG |
| — | test org. | `tests/README.md` bayat ("DB gerektiren testler henüz yok", oysa `tests/integration` 6 dosya) | açık | `backend/tests/README.md` |
| — | doküman | `INTEGRATION_ENGINE_STANDARDS.md` (kök) 2026-09-26 tarihli, "circuit breaker YOK", "health yok" diyor; kod bunları artık içeriyor → **drift** | açık | kök `INTEGRATION_ENGINE_STANDARDS.md:31-60` |
| — | veri gözlemi | Local kopyada Hepsiburada `SELLERID == APIKEY` (düz metin) | açık (veri) | BACKLOG "Veri gözlemi (ADR-0003 3b)" |
| — | tutarsızlık | HB/Pazarama `OrderService`/`ClaimService`'te `getInstance` yok; Trendyol hata sarmalama `[clientId]` kontrolü tutarsız | açık | BACKLOG "İncelenmesi" 13-14 |
| RA-1..10 | ürün | rakip analizi adayları (kargo, e-fatura, ek pazaryeri, XML tedarik...) | planned / insan kararı | BACKLOG PLANNED |

---

## 2. INTEGRATION MODÜLÜ

### 2.1 Yapı özeti

`backend/src/integration/` = 200 dosya. Alt dizinler:
- `modules/common/` — `IntegrationError.ts` (147 satır, hata sözleşmesi), `http/ResilientHttpClient.ts` (378), `http/RateLimiter.ts`, `http/IntegrationCallMetrics*.ts`, `mock/MockMode.ts`, `security/outboundHosts.ts`, `contract/reportUnknownEnum.ts`.
- `modules/marketplace/{trendyol,hepsiburada,n11,pazarama}`, `modules/ecommerce/ideasoft`, `modules/erp/bizimhesap`.
- `modules/provider/PlatformMappingProvider.ts`, `modules/IntegrationFactory.ts` (222).
- `engine/` — `catalog/{export,import}` (Mongo durum makinesi), `order/` (BullMQ), `IntegrationEngine.ts`.
- `config/` (ADR-0020: ConfigResolver, katalog), `catalog/` (ADR-0018 descriptor kaydı), `compliance/` (ContractGuard/ProbeRunner/SourceMonitor).

### 2.2 Ortak yapı değerlendirmesi

| Konu | Durum | Kanıt / not |
|---|---|---|
| **Base class (adaptör)** | **YOK.** `IPlatform` arayüzü (~35 metot) 6 adaptörde elle uygulanıyor; her `index.ts` yalnızca `service.X` delege ediyor. Katmanlı `Service`→`Connector`→`Mapper` deseni tutarlı ama ortak soyut sınıf/yardımcı yok. Tek `abstract` sınıf `engine/BaseWorker.ts` | `grep extends` sonucu: yalnız `BaseWorker`; `hepsiburada/index.ts:1-90` |
| **HTTP client sayısı** | **1 ortak + 3 istisna.** Tüm adaptör HTTP'si `ResilientHttpClient` (cockatiel) üzerinden. Sapmalar: (a) `n11/services/Service.ts:157` SOAP `axios.post` çağrısı `executeCustom` içinde enjekte edilir (dayanıklılık katmanından geçer, kabul edilebilir); (b) `compliance/SourceMonitor.ts:164,172` ham `axios.get` (retry/breaker/host allowlist YOK; resmi doküman URL'lerini çeker, `validateStatus:()=>true`, 10 sn timeout); (c) `ResilientHttpClient.ts:334-347` içinde 4 farklı `axios.*` çağrısı. `fetch`/`got` kullanımı YOK | `grep axios` (12 dosya) |
| **Auth/token** | Trendyol: Basic auth + `User-Agent: {SELLERID} - Entegrasyonik` (`trendyol/services/Service.ts:65-74`). HB: Basic (`hepsiburada/services/Service.ts:70-77`). N11: `appkey`/`appsecret` başlığı (REST) + SOAP gövdesinde `auth` + başlıkta secret (`n11/services/Service.ts:156-165`). Bizimhesap: `key`/`token` başlığı. Pazarama: OAuth2 client_credentials, **örnek başına bellekte token**, 401'de 1 kez yenile (`pazarama/services/Service.ts:57-140`). Ideasoft: OAuth (kopuk, C10). **Ortak token yöneticisi / single-flight yok.** | ayrıntı bölüm 7 F-04, F-14 |
| **Mapping/convert** | Her platformda `transformers/` (bkz. 2.4). Ortak `PlatformMappingProvider` (tenant başına `@Cache`). Ortak normalizer yok; `OrderTransformer`'lar (HB/Pazarama/Trendyol) ~60 ortak iç-model anahtarını kopyalıyor | 2.4, F-09 |
| **Hata sınıflandırma** | **VAR, iyi.** `IntegrationError` (8 kod, `retryable`, mesaj redaksiyonu, `[CODE]` öneki BullMQ için) + `fromHttpError` (`IntegrationError.ts:100-147`). 84 yerde `if (IntegrationError.isIntegrationError(error)) throw error; throw new Error(...)` deseni tekrarlanıyor — ikinci satırdaki generic `Error` kodu/retryable'ı yeniden kaybettiriyor | `grep` 84 eşleşme |
| **Retry/backoff** | **VAR.** okuma: ağ/timeout/5xx/408, tam jitter 1/2/4/8 sn (üst 30 sn); yazma: yalnız ECONNREFUSED/DNS; 429: `Retry-After` ≤60 sn ise ≤4 tekrar (`ResilientHttpClient.ts:302-305`). Retry politikası her `while` turunda yeniden kuruluyor (küçük maliyet) | `ResilientHttpClient.ts:268-331` |
| **Rate limit** | **VAR.** `RateLimiter` (istemci başına, `ratePerMin`), 429'da düşürme. Pazarama `ratePerMin` bilinçli tanımsız (resmi limit doğrulanamadı). HB `0` = sınırsız. Trendyol sipariş çekimi ayrıca 30/dk pacer | `pazarama/services/Service.ts:35-38`, `trendyol/limits.ts` |
| **Timeout** | **VAR.** cockatiel `TimeoutStrategy.Aggressive` + AbortController; adaptör varsayılanı 30 sn (HB 60 sn). `IntegrationFactory` ayrıca 120 sn Proxy zaman aşımı koyar ama **altta yatan isteği iptal etmez** (`IntegrationFactory.ts:136-154`) | — |
| **Circuit breaker** | **VAR.** cockatiel `ConsecutiveBreaker(5)`, okuma/yazma ayrı, half-open bekleme 30 sn→5 dk artan. Durum **statik `Map`** (`ResilientHttpClient.ts:151`, anahtar `clientId::integrationCode`); süreç yeniden başlayınca sıfırlanır, tenant sayısıyla sınırsız büyür, `snapshot()` (ADR-0017 B'de anılan) kodda **yok** → dışarıdan gözlenemez | F-07 |
| **Idempotency** | Giden isteklerde `Idempotency-Key` **YOK** (`grep idempotencyKey` yalnız capability metinlerinde). Yazma retry'ı bu yüzden bilinçli olarak kısıtlı; `UNKNOWN_OUTCOME` sonrası mutabakat gerekiyor. Sipariş kuyruğunda `jobId` ile idempotency VAR (`OrderQueueProducer.ts` `uniqueJobId`) | F-16 |
| **Pagination/batch** | **Tutarsız.** Trendyol: sayfa/pencere bölme + `nextPageToken` (iyi). Pazarama ürün: `hasMore` döngüsü. **HB sipariş/iade: tek sayfa `limit:100 offset:0`** (`hepsiburada/api/OrderConnector.ts:22`, `ClaimConnector.ts:11`). **N11 REST sipariş: tek sayfa `pageSize:100` + `lastSyncTimestamp` yok sayılıyor** (`n11/services/OrderService.ts:24`). Ideasoft: 4 yerde `while(true)` sayfa üst sınırı yok | F-02, F-10 |
| **Webhook doğrulama** | Yalnız Trendyol: `/hooks/trendyol/:hookToken` — token, `Client.integrations[].webhookToken` DB eşleşmesi; imza/HMAC yok (platform desteğine bağlı, ADR-0005 Karar 8). Token karşılaştırması DB `find` eşitliği; oran sınırı bu rotada **DOĞRULANAMADI** | `api/WebhookApiManager.ts:53-91` |
| **Credential yönetimi** | DB'de AES-256-GCM (`enc:v1:`), API yanıtında 'sensitive', `IntegrationFactory` yalnızca kurulumda çözüyor, K7/K8 URL alanlarını tenant'tan yok sayıyor + giden host allowlist (`outboundHosts.ts`, https-only, IP/port/userinfo reddi). **Boşluk:** axios yönlendirme (redirect) takibi kapatılmamış (F-03); Ideasoft sırları URL sorgusunda (F-04) | — |
| **Mock modu** | `common/mock/MockMode.ts` fail-closed (C19). Ama mock URL çözümü her adaptörde **elle kopya** (`getTargetUrl` 5 kez) | 2.3 |
| **Yapılandırma** | ADR-0020 `getSetting()` ile timeout/eşzamanlılık/rate katalogdan; ortam düğmeleri (`TY_HTTP_TIMEOUT_MS`, `HB_...`) 6 adaptörde ayrı ayrı `Number(process.env.X) \|\| getSetting(...)` | `trendyol/services/Service.ts:39`, `hepsiburada/services/Service.ts:16` |

### 2.3 Platform bazlı envanter ve sapmalar

Ortak desen: `index.ts` (IPlatform) → `services/*Service.ts` → `api/*Connector.ts` (URL + HTTP) → `transformers/*` (dönüşüm). `descriptor.ts` (ADR-0018) her platformda var.

**Trendyol** (`modules/marketplace/trendyol`, ~18 kaynak dosya + `commissions.json` 63 bin satır)
- Dosyalar: `index.ts`(272), `services/{Service,Brand,Category,Claim,Financial,Message,Order,Product(541),Shipment}Service.ts`, `api/{Brand,Category,Claim,Financial,Message,Order(321),Product,Shipment}Connector.ts`, `api/productUrls.ts`(208), `urlSafetyNet.ts`, `limits.ts`, `contracts/{orders.list,claims.list}.ts` (zod), `productConstants.ts`, `transformers/*` (8), `descriptor.ts`(177).
- Sapmalar: tek zod sözleşmeli platform (ContractGuard); URL güvenlik ağı + V2 göçü; sipariş çekme özel pencere/pacer; `productUrls.ts` ayrı URL çözümleyici; hata sarmalama `[clientId]` içerirse tekrar sarmıyor (HB/Pazarama her zaman sarar).
- Tekrar/sabit: `OrderConnector.ts:13,214,241,285` sabit URL fallback; `Service.ts:17` `TRENDYOL_FALLBACK_BASE_URL`; `CategoryService.ts:22,42,52` `@Cache` keyFn `that.integrationCode` — sınıfta **`integrationCode` alanı yok** → anahtar `...-undefined-` (F-05).

**Hepsiburada** (`modules/marketplace/hepsiburada`)
- Dosyalar: `index.ts`(104), `services/{Service,Category,Claim,Financial,Order,Product(319),Question}Service.ts` + `services/index.ts`, `api/{Category,Claim,Financial,Order,Product}Connector.ts`, `transformers/{Category,Claim,Financial,Order,Product,Question}*.ts`, `descriptor.ts`.
- Sapmalar: 4 farklı taban URL (`BASEURL/LISTINGBASEURL/ACCOUNTINGBASEURL/TICKETBASEURL`) yol içeriğine göre seçiliyor (`Service.ts:56-67`, `url.includes('listings/')` string eşleştirmesi — kırılgan); `getMerchantId()` `MERCHANTID→SELLERID→APIKEY` zinciri (`OrderConnector.ts:11`, tek yerde tanımlı ama SELLERID==APIKEY veri anomalisiyle birleşince yanlış id riski); varyant/teslimat güncelleme `NOT_SUPPORTED`; `retrieveBrands` `[]` döner (`index.ts`); sipariş/iade sayfalama yok.
- Tekrar: `@Cache(24, integrationCode)` (`CategoryService.ts:18,29`) — TTL **24 saniye** (24 saat değil, birim hatası), keyFn yok.

**N11** (`modules/marketplace/n11`) — REST + SOAP karma
- Dosyalar: `index.ts`, `services/{Service(195),RestService,Auxiliary,Category,Claim,Message,Order,Product(225)}Service.ts`, `api/{Auxiliary,Category,Order,Product}Connector.ts`, `transformers/{Mappers(255),OrderMapper(234)}.ts`, `descriptor.ts`.
- Sapmalar: **iki ayrı `ResilientHttpClient`** (`n11` ve `n11-soap`, breaker izolasyonu) aynı politikayla; SOAP zarfı elle string şablon (`Service.ts:143-150`, gövde `xml2js.Builder` ile üretiliyor — kaçışlı); `Service.ts:157` doğrudan `axios.post`; kimlik bilgisi SOAP gövdesinde + `appsecret` başlığı; REST→SOAP yedek yol (yalnız UNAVAILABLE/NOT_SUPPORTED); REST sipariş sayfalama/zaman penceresi yok (F-02); tarih formatı `dd/MM/yyyy` yerel saat (`OrderService.ts:53-56`, saat dilimi belirsiz). Tek `Mappers.ts` dosyasında 4 mapper (diğer platformlarda ayrı dosya).

**Pazarama** (`modules/marketplace/pazarama`) — en geniş yüzey
- Dosyalar: `index.ts`, `services/{Service,Brand,Category,Claim,Financial,Message,Order,Product(352),Shipment}Service.ts`, `api/{Brand,Category,Claim,Financial,Message,Order,Product,Shipment}Connector.ts`, `transformers/*` (8), `descriptor.ts`, `commissions.json`, `shipment-providers.json`.
- Sapmalar: token bellek içi/örnek başına, **single-flight yok**; token isteği gövdesi `client_id=${APIKEY}&client_secret=${APISECRET}` **URL-encode edilmemiş** (`Service.ts:71`); mock varsayılan portları tutarsız (token 6011 vs api 3006, kod yorumunda not edilmiş, `Service.ts:44,101`); dönüştürücüler hem PascalCase hem camelCase okuyor (şema belirsizliği belirtisi, bkz. 2.4); `OrderConnector.ts:11` **sorgu nesnesini `console.log` ile yazıyor**.

**Ideasoft** (`modules/ecommerce/ideasoft`)
- Dosyalar: `index.ts`, `services/{Service,Security,Brand,Category,Order,Product(262)}Service.ts`, `transformers/{Category,Order,Product}Transformer.ts`, `descriptor.ts`.
- Sapmalar: token akışı kopuk (C10); `SecurityService.ts:15-18,62` `client_secret` ve `refresh_token` **URL sorgusunda GET** ile gönderiliyor; `while(true)` sayfalama 4 yerde üst sınırsız (`BrandService.ts:19`, `CategoryService.ts:22`, `OrderService.ts:33`, `ProductService.ts:176`); `OrderTransformer` dönüş tipi `as any` ile düz nesne; `checkBatchProduct` daima `undefined`.

**Bizimhesap** (`modules/erp/bizimhesap`) — okuma yönlü ERP
- Dosyalar: `index.ts`, `services/{Service,Brand,Category,Order,Product}Service.ts`, `transformers/ProductTransformer.ts`, `descriptor.ts`.
- Sapmalar: yalnız ürün okuma; `checkBatchProduct` `undefined`; kimlik `key`/`token` başlıkları (yönlendirme takibinde başka host'a sızabilir, F-03).

**Tekrarlanan kod (dosya:satır)**
- Mock/URL çözümleme 6 kopya: `trendyol/services/Service.ts:79-110`, `hepsiburada/services/Service.ts:31-70`, `pazarama/services/Service.ts:100-125`, `n11/services/Service.ts:64-100` + `RestService.ts:26-64`, `ideasoft/services/Service.ts:61-78`, `bizimhesap/services/Service.ts:33-56`.
- `ResilientHttpClient` kurulumu (`timeoutMs`/`maxConcurrent`/`ratePerMin` + env düğmesi) 6 kopya: `trendyol/services/Service.ts:34-47`, `hepsiburada/services/Service.ts:15-27`, `pazarama/services/Service.ts:28-39`, `n11/services/Service.ts:57-72`, `ideasoft/services/Service.ts:34-49`, `bizimhesap/services/Service.ts:22-35`.
- `get/post/put` sarmalayıcı üçlüsü (idempotent varsayılanları) 6 kopya.
- Hata rethrow/wrap deseni: 84 kopya (bölüm 2.2).
- URL şablon yer tutucu (`<SELLERID>`, `<MERCHANTID>`) `.replace` zincirleri connector'larda dağınık (`hepsiburada/api/OrderConnector.ts:16,31`, `trendyol/api/OrderConnector.ts`).

### 2.4 Converter / mapper dosyaları ve alanlar

**Uyarı:** ham heuristik. "OKUNAN" = kodun harici (pazaryeri) yanıtından eriştiği alanlar; "ÜRETİLEN" = gönderilen gövdede gördüğüm anahtarlar. Resmi dokümanla karşılaştırmadan önce elle teyit edin.
Kök: `backend/src/integration/modules/`.

**Trendyol** — `marketplace/trendyol/transformers/`
- `OrderTransformer.ts` (317) OKUNAN: id, orderNumber, packageId/shipmentPackageId, status, orderDate/creationDate/lastModifiedDate, shippedDate, deliveredDate, estimatedDeliveryEndDate, customerId/FirstName/LastName/Email/Phone, identityNumber, shipmentAddress, invoiceAddress, cargoProviderName, cargoTrackingNumber/Link, cargoAmount, cargoDeci, currencyCode, grossAmount, totalDiscount, totalPrice, packageTotalPrice/GrossAmount/SellerDiscount/TotalDiscount, lines[] (quantity, price, lineUnitPrice, lineSellerDiscount, lineTotalDiscount, vatRate, vatBaseAmount, taxAmount, barcode, merchantSku, stockCode, productName, orderLineItemStatusName, statusReason), giftBox/giftBoxRequested, etgbNo/etgbDate, micro, commercial, invoiceLink.
- `ProductTransformer.ts` (596) ÜRETİLEN (V2 gövde): barcode, title, productMainId, brandId, categoryId/pimCategoryId, quantity, stockCode, description, listPrice, salePrice, vatRate, images[], attributes[{attributeId, attributeValueId | customAttributeValue}], deliveryOption.deliveryDuration, origin, lotNumber, contentId, variantId, dimensionalWeight, returningAddressId/shipmentAddressId, cargoProviders, locationBasedDelivery; batch sonucu OKUNAN: status (SUCCESS/FAILED/IN_PROGRESS...), items[], reason/message, rejectReasonDetails, approved, archived, blacklisted, locked, onSale, platformListingId, productContentId, uniqueId.
- `ClaimTransformer.ts` (138) OKUNAN: id/claimId, orderNumber, orderOutboundPackageId, claimDate/creationDate, status, customerId/FirstName/LastName/Email/Phone, cargoTrackingNumber/Link/cargoProviderName, items/claimItems[] (orderLine, quantity, unitPrice, reason), rejectedpackageinfo, replacementOutboundpackageinfo, totalRefundAmount, isDisputed/disputeStatus, shipmentAddress.
- `FinancialMapper.ts` (92) OKUNAN: id, transactionType, transactionDate, paymentDate, paymentOrderId, receiptId, orderNumber, shipmentPackageId, parcelUniqueId, barcode, desi, commissionRate/Amount, sellerRevenue, credit/debt, affiliate, shipmentPackageType, description.
- `MessageTransformer.ts` (77) OKUNAN: id, text, creationDate, orderNumber, productMainId, productName, imageUrl, webUrl, userName, showUserName, status, public, reason, answer, rejectedAnswer, rejectedDate, reportReason, reportedDate.
- `CategoryTransformer.ts` (54): id, name, subCategories, attributes[{attribute{id,name}, required, allowCustom, varianter, slicer, attributeValues}], values. `BrandTransformer.ts` (17): id, name/title, content. `ShippmentTransformer.ts` (47): id, code, name (adres alanları: city, district, fullAddress, subtitle, type).

**Hepsiburada** — `marketplace/hepsiburada/transformers/`
- `OrderTransformer.ts` (170) OKUNAN: id, orderId, orderNumber, orderDate, status, customerId/customerName/customerEmail, billingAddress, shippingAddress, cargoCompany, shippedDate, deliveredDate, totalPrice, lineItems[] (sku, merchantSku, barcode, productName, quantity, price, vatRate, status).
- `ProductTransformer.ts` (188) ÜRETİLEN (kategori nitelikleri Türkçe anahtar): Barcode, UrunAdi, UrunAciklamasi, Marka, GarantiSuresi, VaryantGroupID, kg, tax_vat_rate, merchantSku, price, stock, images, categoryId, attributes; OKUNAN durum: hbSku, productStatus, statusDescription, validationResults, taskDetails, errors, stockCount, listPrice, vatRate.
- `ClaimTransformer.ts` (83): id, number, claimType, claimDate, status, orderNumber, lineItemId, merchantSku/sku, productName, quantity, price/priceCurrency, refundAmount/refundCurrency, totalPriceAmount, trackingCode, carrierName, customerId/customerName.
- `FinancialMapper.ts` (35): id, transactionType, orderNumber, orderDate, amount, grossAmount, commissionAmount/Rate, netPayoutAmount, payoutDate, maturityDate, description.
- `QuestionTransformer.ts` (38): id, text, answer, answerDate, creationDate, customerName, orderNumber, productName, productSku, status, type. `CategoryTransformer.ts` (90): id, name, type, mandatory, multiValue, baseAttributes/attributes/variantAttributes, value.

**N11** — `marketplace/n11/transformers/`
- `OrderMapper.ts` (234) OKUNAN (REST GetShipmentPackages): content[], id, orderNumber, status/shipmentPackageStatus, packageHistories, createDate, lastModifiedDate, agreedDeliveryDate, customerfullName, customerEmail, buyer, billingAddress, shippingAddress, lines[] (orderLineId, productId, productName, sellerStockCode/stockCode, quantity, price, totalSellerDiscountPrice), totalAmount, totalDiscountAmount; SOAP: orderList/orderItemList.
- `Mappers.ts` (255): `ProductMapper` ÜRETİLEN (SOAP SaveProductRequest): productSellerCode, title, description, category{id}, price, listPrice, currencyType, stockItems.stockItem[{quantity, sellerStockCode, optionPrice, gtin, attributes}], images, shipmentTemplate, preparingDay, productMainId; `CategoryMapper` OKUNAN: id, name, subCategories, attributeList.attribute, categoryAttributes, attributeValues, valueId, value; `MessageMapper`: productQuestions, question, answer, buyerEmail, productTitle, status; `FinancialMapper`: settlementListData, settlementAmount, settlementDate.

**Pazarama** — `marketplace/pazarama/transformers/` (PascalCase + camelCase çift okuma)
- `OrderTransformer.ts` (184) OKUNAN: OrderId, OrderNumber, OrderDate, OrderStatus, OrderAmount, DiscountAmount, ShipmentAmount, TotalPrice, Currency, CustomerId/CustomerName/customerEmail, BillingAddress, ShipmentAddress, DeliveryDate, ShipmentDate, Items[] (OrderItemId, OrderItemStatus, ProductId, ProductName, Barcode, StockCode, Quantity, SalePrice, VatRate, TaxAmount).
- `ProductTransformer.ts` (212): ÜRETİLEN code, name/displayName, brandId, categoryId, stockCount, stockCode, listPrice, salePrice, vatRate, desi, groupCode, images, attributes[{attributeId, attributeValueId, customAttributeValue}], currencyType; OKUNAN: state, stateDescription, batchResult, failedProducts, waitingApproveExp, productId.
- `ClaimTransformer.ts` (110): RefundId/RefundNumber, RefundStatus/RefundStatusName, RefundType, RefundDate, RefundAmount, OrderNumber, orderItem/orderItemId, ProductCode/ProductName/ProductStockCode, CustomerId/CustomerName/CustomerEmail/CustomerPhoneNumber, CargoCompanyName/CargoTrackingNumber/CargoTrackingUrl, ShipmentCode/ShipmentCompanyName.
- `FinancialMapper.ts` (64): trxId, trxCode, orderNumber, orderId, packageId, amount, allowanceAmount, commissionRate/Amount, desi, status, transferredDate, transactionDate, transactionList. `MessageTransformer.ts` (46): QuestionId, Question, Answer, QuestionDate, AnswerDate, QuestionStatus, ApprovalAnswersByMerchant, Barcode, Brand, MaskedUserName, ProductImageUrl. `CategoryTransformer.ts` (93), `BrandTransformer.ts` (18), `ShipmentTransformer.ts` (23).

**Ideasoft** — `ecommerce/ideasoft/transformers/`
- `OrderTransformer.ts` (97) OKUNAN: id, orderNumber, status, createdAt/orderDate, customer, customerEmail, billingAddress/invoiceAddress, shippingAddress/deliveryAddress, items/lines/orderLines[] (sku, barcode, productName, quantity, price/salePrice, product), total/totalPrice, shippingPrice, cargo/cargoCompany, trackingNumber.
- `ProductTransformer.ts` (135) ÜRETİLEN: fullname/name, sku, barcode, slug, price1, currency, tax, taxIncluded, stockAmount, categories, brand, images, hasOption, options, variant, volumetricWeight, customShippingDisabled, detail, hasGift, categoryShowcaseStatus, infos; OKUNAN: title, description, desi, minPrice, totalStock, stockTypeLabel, warranty, platformBrandId/platformCategoryId.
- `CategoryTransformer.ts` (76): id, name, title, parent, optionGroup, values.

**Bizimhesap** — `erp/bizimhesap/transformers/ProductTransformer.ts` (182) OKUNAN: id, code, title, description, barcode, brand, category, price, tax, quantity, isActive, photo/PhotoUrl, variants[{variantName, ...}].

Not: sipariş/iade/finans/mesaj dönüştürücülerinde `Pazarama`, `Hepsiburada`, `Trendyol` için aynı dahili model anahtarları (`externalIdentities`, `fulfillment`, `financials`, `flags`, `dates`, `isEmailMasked`, `isPhoneMasked`...) 3 kopya (`marketplace/{hepsiburada,pazarama}/transformers/OrderTransformer.ts:28-29`, `trendyol/.../OrderTransformer.ts:121-122`).

---

## 3. PERFORMANS / CACHE

### 3.1 `@Cache` dekoratörü (`utils/decorator/cache.ts`, 76 satır)

| Özellik | Durum | Kanıt |
|---|---|---|
| Depo | süreç-içi `NodeCache` tek örnek, `stdTTL: 300`, **`maxKeys` yok** (bellek sınırsız), `useClones` varsayılan true (her isabette derin kopya — büyük kategori ağaçlarında CPU/bellek) | `cache.ts:3` |
| Anahtar | `${context}.${Class}.${method}-${keyFn(this)}-${argParts}`; argüman parçaları `safeKeyPart` (düz nesne → kararlı JSON `q:...`). Ayırıcı `-` serbest metinle çakışabilir (`a-` + `b` vs `a` + `-b`) | `cache.ts:53` |
| **Tenant ayrımı** | **Dekoratör yapısal olarak zorlamıyor.** Tenant, çağıranın verdiği `keyFn`'e bağlı. Sipariş/iade `@Cache`'leri kaldırıldı (C3). Kalan kullanımlar (kayıtlı 20 nokta, kanıt: `grep @Cache`): `PlatformMappingProvider` ×5, `CatalogOperations` ×4, `ShipmentService` (Trendyol/Pazarama) → `that.clientId` **VAR**; kategori servisleri (Trendyol/Pazarama/HB) → tenant YOK (platform-genel veri, ADR-0002 kararı `global`). `clientId` `undefined` ise anahtar `undefined` stringine çöker ve tenantlar **paylaşır** (ADR-0002 "fail-closed atla" uygulanmadı) | ADR-0002 Karar 2 vs `cache.ts:52` |
| **Anahtar hataları** | (1) Trendyol `CategoryService.ts:22,42,52` `keyFn: that.integrationCode` — sınıfta bu alan **yok** (Pazarama'da `public integrationCode` var, `pazarama/services/CategoryService.ts:13`) → anahtar `catalog-service.CategoryService.fetchCategories-undefined-`. Platform-genel veri olduğu için bugün zararsız, ama Trendyol'a ait tek anahtar başka sınıfla çakışırsa yanlış veri döner. (2) HB `CategoryService.ts:18,29` `@Cache(24, integrationCode)` → **TTL 24 SANİYE**, keyFn yok; niyet muhtemelen 24 saat (DOĞRULANAMADI, ADR-0002 "global katalog ≤ 24 saat") | — |
| TTL'ler | 24 sn (HB kategori), 30 sn (attributeMappings), 300 sn (kategori/kargo/CatalogOperations), 600 sn (mapping/brands/categories/choices) | dekoratör kullanım satırları |
| Invalidation | **YOK** (yalnız TTL). `PlatformMappingProvider` eşleştirme/kategori/marka verisini 600 sn önbellekler; kullanıcı eşleşmeyi değiştirirse export en fazla 10 dk **bayat eşleşmeyle** çalışır. ADR-0002 adım 4 (`invalidateTenantCache`) yapılmadı | `provider/PlatformMappingProvider.ts:14-38` |
| Stampede önlemi | **YOK.** Aynı anahtar eşzamanlı ıskalarsa N istek orijinal metodu çalıştırır (single-flight yok); 6 platformun kategori ağacı çekimi (yüzlerce sayfa) bu yüzden tekrarlanabilir | `cache.ts:56-70` |
| Değer semantiği | `if (cached)` ile isabet kontrolü (`0`/`''`/`false` ıska sayılır, ADR-0002 Karar 6 `has()` istiyor); boş dizi ve falsy sonuç **hiç cache'lenmez** → boş dönen (ör. yeni tenant, boş mapping) çağrılar her seferinde DB/HTTP'ye gider (negatif cache yok) | `cache.ts:57,65-69` |
| Hit/miss metriği | **YOK.** Yalnız `admin-service.ts:364` `nodeCache.getStats()` ile anlık sayım; ADR-0017 metrik kayıt defterine köprü yok | — |
| Çok pod | Her pod ayrı önbellek; invalidation yayılımı yok (mevcut tek-süreç varsayımı, ADR-0002 Bağlam) | — |
| `IntegrationFactory` önbelleği | `instanceCache`/`configCache` anahtarları `clientId` içeriyor (**tenant ayrımı VAR**, `IntegrationFactory.ts:93,171`). Ancak her 5 dk'da **tüm tenant'ların** örnek+config önbelleği topluca siliniyor (`:66-74`, `cacheTTL`) → aynı anda tüm tenant'lar için DB okuması + Pazarama token yeniden alımı (thundering herd) | F-13 |

### 3.2 N+1 ve sorgu desenleri

| Yer | Sorun | Şiddet |
|---|---|---|
| `engine/catalog/export/Validator.ts:130-134` | `productCache` Map'i var (iyi) ama ıskalarda ürün başına `findById` (döngü içinde `await`); toplu `find({_id:{$in}})` ile önden yüklenebilir | P2 |
| `engine/catalog/export/Sync.ts:145-147` | `for entry of chunk { platformResults.find(...) }` O(n·m); Map ile O(n) | P2 |
| `engine/catalog/export/Dispatcher.ts:31-60,111-160` | en çok 20 bayrak × bayrak başına 3-4 sorgu (sinyal, staged, count) | P2 |
| `engine/catalog/import/Importer.ts:84` | `Promise.all(rawItems.map(convertToInternalModel))` — chunk boyutu kadar **sınırsız paralel** dönüşüm (CPU/bellek; `fetchLimit` değerine bağlı) | P2 |
| `engine/catalog/import/Importer.ts:43` | job'a ait TÜM `ImportStagedProductSummary` belleğe alınıyor (`Map`) | P2 |
| `engine/catalog/import/Stager.ts:33` | tüm `AttributeMapping` (integrationCode) belleğe | P2 |
| `engine/order/OrderQueueProducer.ts:52` | her zamanlama turunda **tüm ACTIVE tenant dokümanları** (`integrations` dizisi, şifreli sırlar dahil) projeksiyonsuz `find().lean()` ile çekiliyor; `orderQueue.add` tenant×entegrasyon başına sıralı `await` (`addBulk` yok); guard açıkken tenant başına `checkAccess` (N çağrı) | P1 |
| `api/services/product-service.ts:472` | `exportExcel`: `find(filterQuery).lean()` limitsiz + tüm varyantlar + `XLSX.write(..., base64)` tek yanıt gövdesinde (10 MB `bodyParser` sınırı yanıt için değil, bellek için risk) — **senkron ağır iş, event loop bloklar** | P1 |
| `engine/catalog/export/ExportOrchestrator.ts:247` | arşivleme: batch'in tüm staged dokümanları (payload'larla) belleğe → tek arşiv → R2 | P2 |

### 3.3 Eksik index adayları (yalnızca kod okuma — DOĞRULANAMADI, D7 göç çerçevesiyle canlı `getIndexes` karşılaştırması gerekir)

| Aday | Gerekçe | Kanıt |
|---|---|---|
| `ExportStagedProducts { stockcode:1, status:1, ... }` | Validator/Sync/Sentinel `find({[matchKey]: {$in}})` sorguları `matchKey` `stockcode` (N11) iken var olan indeksler yalnız `barcode` üzerine (`{barcode,status,mode}`, `{barcode,createdAt}`) | `client/models/Export.ts:90,93`; `Sentinel.ts:167`, `Validator.ts:67` |
| `Variants { productId }` mevcut; `{ 'platforms.<code>.upload.*.status }` sorguları — **DOĞRULANAMADI** | — | `Variant.ts:35` |
| `ClientIntegrations` iç içe dizi indeksleri var (`marketplace.code`+sync alanları) ama `OrderQueueProducer` `Clients.integrations[]` üzerinden okuyor (`Client` şeması) | — | `client/models/ClientIntegration.ts:42-49` |

Not: D9 indeks göçleri (`backend/migrations/0001,0002`) ve `index-manifest.json` mevcut; yeni indeks = DB'ye dokunur → yedek kuralı.

### 3.4 Bellek/uzun iş riskleri
- Ürün çekme/Excel/arşiv (yukarıda). `ResilientHttpClient.adapterStates` statik Map hiç temizlenmiyor (tenant × platform × bulkhead + breaker; `ResilientHttpClient.ts:151`).
- `axios` yanıt boyutu sınırı (`maxContentLength`) yok; büyük kategori yanıtı bellekte.
- `while(true)` döngüleri: `ExportOrchestrator.ts:42`, `ImportOrchestrator.ts:30` durdurma bayrağı yok (C14); Ideasoft 4 kez (bölüm 2.2).
- İş bazlı zamanlayıcılar ADR-0016 §2 ile `scheduleJob` + `JobRunRegistry` üstüne alındı (BACKLOG); motorun kendi `while(true)` döngüleri hâlâ eski desende.

---

## 4. GÖZLEMLENEBİLİRLİK

| Konu | Durum | Kanıt |
|---|---|---|
| Structured log | **VAR (pino 10)**, `platform/core/logger/`: seviye, `reqId` mixin, modül child, taşkın denetimi, redaksiyon (`redactForLog` anahtar listesi + axios `config`/`request` atma + serbest-metin desenleri). Ama **316 `console.*` çağrısı kaldı** (integration 145, api 73, operations 52, services 24); `consoleBridge` bunları `logger[level]({legacy:true}, string)` ile pino'ya yönlendiriyor → **yapısız düz metin**, alan yok (clientId/integrationCode yalnız metin içinde), ANSI temizleniyor. Baseline mandalı (`quality/baseline.json`) yeni `console`'u engelliyor ama mevcutları taşımadı | `platform/core/logger/consoleBridge.ts`, `quality/baseline.json` |
| Correlation / trace id | HTTP: `X-Request-Id` + AsyncLocalStorage (`api/http/requestId.ts`, `platform/core/context`) — hata zarfında `requestId`. **Motor/işçi/adaptör yolunda YOK:** `grep requestContext` integration'da 0 sonuç; BullMQ job'ı, katalog işçileri ve `ResilientHttpClient` logları/metrikleri correlation id taşımıyor (Dispatcher yalnız kendi `groupId`'sini üretiyor, `Dispatcher.ts:202`). Giden isteklerde de id başlığı yok (platform tarafında izlenebilirlik yok) | F-06 |
| Entegrasyon çağrı süresi / hata oranı | **VAR (ADR-0017 B):** `IntegrationCallMetrics` → `MetricsRegistry` köprüsü (`IntegrationCallMetricsBridge.ts`) — çağrı başına Mongo yazımı durdu (K4 kapandı). Etiketler `{tenantId, integrationCode, outcome}`; `kind` (read/write) etiketi yok (köprü dosyası bulgu olarak yazıyor); `operation` metrikte yok (yalnız kayıtta 200 karakter) | `modules/common/http/IntegrationCallMetricsBridge.ts:1-30` |
| Breaker/limiter durumu | Metrik/health'e yansımıyor; `snapshot()` yok | F-07 |
| Health | **VAR:** `/health` (sabit 200), `/ready` (ApplicationDB ping ≤1 sn + rol `worker/all` ise Redis PING), kapanışta 503, `worker` rolü için `HealthServer` (`health/HealthCheck.ts`, `HealthServer.ts`). Entegrasyon sağlığı (platform erişilebilirliği/breaker) ready'ye bilinçli olarak dahil değil; tenant sağlığı `IntegrationService.getIntegrationHealth` (yalnız okuma) | — |
| Log maskeleme | `IntegrationError` mesajı: Bearer/Basic/`pass|token|secret|auth|apikey|key=` desenleri + 500 karakter kesme (`IntegrationError.ts:39-48`). Logger: `redactForLog` anahtar bazlı + axios config atma. **Açık:** (a) URL sorgusundaki sırlar (Ideasoft `client_secret`/`refresh_token`) — `redactFreeText` `?...` kısmını maskeler ama yalnız `/client-log` yolunda; adaptör `console`/logger çıktısı bundan geçmiyor (DOĞRULANAMADI: hangi log satırının URL içerdiği); (b) PII (müşteri adı/e-posta/telefon) `console.log(...JSON.stringify(query))` gibi satırlarda maskelenmiyor (`pazarama/api/OrderConnector.ts:11`); (c) `Validator.ts:110` `JSON.stringify(entry)` staged kaydı yazıyor | F-06 |
| ADR-0017 durumu | Aşama A ve B **kapandı**; JobRunRegistry kapandı; frontend log döngüsü kapandı. **Aşama C (alarm/bildirim/bekçi) için kod kanıtı bulunamadı** (`Alerts` modeli/`AlertRules` grep sonucu boş — ayrıca teyit edilmeli). Aşama D konsol ekranları kısmen | F-07 |

---

## 5. API / GÜVENLİK

### 5.1 Response formatı ve hata kodları
- Sözleşme: tek RPC uç `POST /api/:service/:operation` (`api/ApiManager.ts`). **Başarı gövdesi serbest** (servis neyi döndürürse; `sanitizeResponse` yalnız yasak anahtarları siler) — tek tip zarf yok. Hata zarfı standart: `{error, service, operation, code?, requestId?}`; 5xx mesajı maskeleniyor (`ApiManager.ts:44-59`).
- `docs/ERROR_CODES.md`: 10 genel + 4 entegrasyon (`AUTH`, `UNAVAILABLE`, `NOT_SUPPORTED`, `UNKNOWN_OUTCOME`) + hesap kodları; koddan üretiliyor (test korumalı). **Boşluk:** `IntegrationError` 8 kodundan `RATE_LIMITED`/`VALIDATION`/`NOT_FOUND`/`INTERNAL` genel kodlarla örtüşüyor ama entegrasyon yolunda `ApplicationError`'a çevrilme kuralı belgede yok; birçok servis hâlâ `throw new Error("[clientId][Service:op] ...")` generic Error atıyor (örn. `trendyol/services/CategoryService.ts:35-46`) → istemciye `INTERNAL` maskeli 500 döner, eyleme dönük ileti kaybolur.
- Versiyonlama: **YOK.** Yol öneki `/api` (context); `v1/v2` yok, deprecation başlığı yok. Sözleşme drift'i `capabilities/` kaydı (174 RPC) + `operationPolicy` türetmesi ile izleniyor (iyi), ama istemci uyumluluğu için sürüm anahtarı yok.

### 5.2 Input validation
- **Kütüphane:** zod 3.25 var ama yalnızca `config/env.ts`, `capabilities/`, `integration/config/*` ve Trendyol `contracts/*` içinde kullanılıyor. **API servis katmanında (33 servis, ~9.500 satır) istek gövdesi şema doğrulaması YOK** (`grep zod` `api/` içinde 0). Doğrulama servis içinde el yazısı; ADR/backlog bulguları: `updateSettings` `request.settings` tanımsızsa TypeError, marka/menü servislerinde "doğrulama yok".
- Kapsam: mass-assignment `RunOperation.execute` içinde `userContext/principal/order/clientId` gövdeden soyuluyor (`RunOperation.ts:88-95`); `$regex` enjeksiyonu GV-01 ile `escapeRegex`; `sort.field` izin listesi. Genel şema tabanlı doğrulama (B3) uygulanmadı.
- Görsel yükleme: `ImageApiManager.ts:31` `JSON.parse(req.body.uploadImageForm)` doğrulamasız (try/catch bağlamı DOĞRULANAMADI).

### 5.3 OWASP API Security Top 10 (2023) hızlı eşleme

| # | Risk | Durum | Not |
|---|---|---|---|
| API1 | BOLA | **Kısmen iyi** | tenant `tid` doğrulanmış token'dan; IDOR C4 kapandı; ama tenant filtresi her serviste **elle** eklenmeli (merkezi zorlayıcı yok; `ApplicationDB` koleksiyonlarında `clientId` filtre unutma riski sürekli) |
| API2 | Broken Authentication | **Kısmen** | JWT imza/sır fail-fast, `tokenVersion`, IP oran sınırı; login enumeration + captcha doğrulanmıyor (1g-T1) |
| API3 | BOPLA | **Kısmen** | `responseSanitizer` (yasak anahtar + `enc:v1:` çıktısı), profil DTO; girdi şeması yok → aşırı alan kabulü servis bazlı |
| API4 | Kaynak tüketimi | **Kısmen** | oran sınırı süreç-içi (çok pod'da pod başına), body 10 MB, Excel dışa aktarma sınırsız, ortak sayfalama standardı yok |
| API5 | BFLA | **İyi** | `OPERATION_POLICY` varsayılan ret, kademe kontrolü, servis örneklenmeden 403 (`RunOperation.ts:52-60`) |
| API6 | Hassas iş akışları | **Kısmen** | register/reset/kayıt ayrı kovalar; sipariş onay/ret gibi iş akışlarında idempotency anahtarı yok |
| API7 | SSRF | **İyi + boşluk** | giden host allowlist, https, IP/port/userinfo reddi, K7/K8 URL alanı yok sayma; **boşluk:** axios `maxRedirects` varsayılan (5) → allowlist yalnız ilk URL'ye uygulanıyor; `SourceMonitor` ham axios (allowlist dışı, doküman URL'leri descriptor'dan) |
| API8 | Yanlış yapılandırma | **İyi** | helmet (`Webserver.ts:97`), CORS allowlist + wildcard reddi, `originCheck`, CSP (Report-Only iki hafta planı BACKLOG) |
| API9 | Envanter | **Kısmen** | yetenek kaydı + `docs/CAPABILITIES.md`; API sürümü yok, eski `/health`-dışı rotalar (webhook, mock checkout, export download) `configureApis` dışında ayrı yönetici sınıflarda |
| API10 | Güvensiz API tüketimi | **Zayıf** | yanıt şeması doğrulaması yalnız Trendyol sipariş/iade; diğer adaptörler `response?.data?.items \|\| []`, `response?.data?.data \|\| response?.data \|\| []` gibi sessiz boş/yanlış-tip varsayımları kullanıyor → API değişiminde "sıfır sipariş" (sahte başarı) riski (ADR-0018 B ile yalnız replay modu) |

### 5.4 Bağımlılık modernizasyonu (backend/package.json)
Gözlem (kod okuma; `npm audit` çalıştırılmadı — BACKLOG C18 verisiyle): `express ^4` (qs pinli), `multer ^1.4.5-lts.1` (1.x hattı bakımda değil; 2.x'te yayımlanmış DoS düzeltmeleri — advisory numaraları npm audit ile doğrulanmalı), `sharp ^0.32.3` (açık high, majör yükseltme), `xlsx ^0.18.5` (düzeltmesiz high), `uuid ^8` (Node 20 `crypto.randomUUID` yeterli olabilir), `nodemailer ^8` (backlog audit'te major), `body-parser` (express 4.16+ yerleşik), `typescript`/`rollup`/`webpack*` **dependencies** içinde (prod imajına gereksiz), `kerberos`/`snappy`/`@mongodb-js/zstd` (opsiyonel sıkıştırma/auth; kullanım DOĞRULANAMADI), `mongodb-client-encryption` (kullanım DOĞRULANAMADI). Node 20 Alpine.

---

## 6. TEST ORGANİZASYONU

- Dizin: `backend/tests/` — `characterization/` (161 dosya, alan bazlı 35+ alt dizin), `unit/` (70), `contract/` (13; Trendyol şema + katalog), `integration/` (6; gerçek Mongo), `mongo-semantics/` (4), `static/` (3), `dev/` (1), `smoke.test.ts`; toplam **259** `*.test.ts`. BACKLOG: 253 paket/3826 test (2026-09-29).
- Jest: tek proje (`jest.config.js`), `ts-jest`, `roots: [src, tests]`, `tests/integration` **varsayılan dışı** (`npm run test:integration` ile ayrı, yerel Mongo gerektirir). Kapsam eşiği global (stmts 64,0 / branch 49,6 / fn 54,8 / lines 64,5), yalnız `--coverage` ile uygulanır.
- Unit/integration/e2e ayrımı: **kısmi.** unit ≈ characterization (mock'lu), contract ayrı, gerçek-DB `tests/integration` ayrı; e2e (HTTP+DB+Redis uçtan uca) **yok**. Adlandırma: karakterizasyon (davranış kilitleme) ile birim test aynı ağaçta karışık.
- Modül bazlı çalıştırma: **mümkün ama elle** (`npx jest tests/characterization/transformers` / `--testPathPattern`). Modül başına `npm script`/jest `projects` yok; `package.json`'da yalnız `test`, `test:cov`, `test:integration`, `verify`, `ratchet`.
- Süre: **ölçülmedi** (test koşulmadı). BACKLOG'da tek koşu süresi yazılı değil; paralel yük kaynaklı geçici flake notları var (`ContractGuard`, `ResilientHttpClient`, `errorCodes.docs` CRLF/LF).
- Bayatlık: `tests/README.md` "DB gerektiren testler (henüz yok)" diyor, `tests/integration` 6 dosya var; `INTEGRATION_ENGINE_STANDARDS.md` bayat (bölüm 1).
- Boşluklar: HB/Pazarama/Ideasoft/Bizimhesap transformer characterization testleri var (B-R-T4); Trendyol/N11 transformer için ayrı dilim notu yok; adaptör `Service.ts` (token/mock URL) için testler var; **axios redirect/`maxRedirects`** ve **HB/N11 sayfalama** için test bulunamadı (DOĞRULANAMADI: tam tarama yapılmadı).

---

## 7. BULGULAR

Şiddet: P0 (veri kaybı/güvenlik/iş sürekliliği, hemen), P1 (yakın vadede), P2 (planlı). Boyut: S (<1 gün), M (1-3 gün), L (>3 gün). DB: evet ise CLAUDE.md kural 3 (`backup/` doğrulanmış yedek) ve kural 2 (izinli 7 DB) geçerli.

| ID | Şiddet | Başlık | Kanıt | Önerilen düzeltme | Boyut | DB'ye dokunur mu |
|---|---|---|---|---|---|---|
| F-01 | **P0** | Trendyol 15 Ekim 2026 kapanışı: kod hazır, canlı tarafı doğrulanmadı (DB'deki `orderListUrl`/ürün URL'leri, gerçek-mod duman testi, origin 23 Ekim) | BACKLOG C22, `trendyol/urlSafetyNet.ts`, `package.json` `migrate:trendyol-urls`; ADR-0018 SourceMonitor | (1) safety net'in canlıda tetiklendiğini metrikle/loglarla doğrula; (2) `migrate:trendyol-urls` dry-run raporu; (3) sözleşme testi + mock dışında sandbox duman testi (insan kararı: canlı hesap); (4) origin alanı zorunluluğu için ürün validasyonu | S-M | **Evet** (`--apply` yedek kanıtı ile; dry-run varsayılan) |
| F-02 | **P0** | HB sipariş/iade ve N11 REST siparişte sayfalama/pencere yok → >100 kayıtlık pencerede sessiz veri kaybı | `hepsiburada/api/OrderConnector.ts:22`, `hepsiburada/api/ClaimConnector.ts:11`, `n11/services/OrderService.ts:24` (`pageSize:100,currentPage:0`; `lastSyncTimestamp` yalnız SOAP dalında kullanılıyor `:46-50`) | Ortak `paginate()` yardımcısı: toplam/next-page sinyaline göre döngü + sayfa tavanı + `ORDER_WINDOW_OVERFLOW` (Trendyol deseni: `trendyol/api/OrderConnector.ts:139-160`); N11 REST'e tarih penceresi; `lastSuccessfulOrderSync` yalnız tam çekimde ilerlesin | M | Hayır |
| F-03 | **P1** | axios yönlendirme takibi açık → host allowlist yalnız ilk URL'yi denetliyor; özel kimlik başlıkları (`appkey`,`appsecret`,`key`,`token`) cross-host yönlendirmede sızabilir; `maxContentLength` yok | `ResilientHttpClient.ts:334-347` (config: headers/auth/signal), `outboundHosts.ts:79-100` | `maxRedirects: 0` (veya `beforeRedirect` ile aynı allowlist kontrolü), `maxContentLength`/`maxBodyLength`; `SourceMonitor.ts:164,172` de `ResilientHttpClient` veya allowlist'ten geçirilsin; regresyon testi | S | Hayır |
| F-04 | **P1** | Ideasoft: (a) token akışı kopuk (C10); (b) `client_secret`/`refresh_token` GET URL sorgusunda; (c) 4× `while(true)` tavansız | `ideasoft/services/SecurityService.ts:15-18,62`, `Service.ts:20-33`, `BrandService.ts:19`, `CategoryService.ts:22`, `OrderService.ts:33`, `ProductService.ts:176` | Token uçlarını POST form gövdesine taşı (platform dokümanı teyidi gerek — DOĞRULANAMADI), `init()`/refresh'i `IntegrationFactory` kurulumuna bağla, ortak sayfalama tavanı, sır içeren URL'leri log/metrik `operation` alanına yansıtma | M-L | Evet (token `persistToken` yazımı; yalnızca gerçek modda; mock testlerle) |
| F-05 | **P1** | `@Cache`: tenant ayrımı imza ile zorlanmıyor, falsy/boş sonuç cache'lenmiyor, single-flight/`maxKeys`/hit-miss metriği yok, Trendyol anahtarı `undefined`, HB TTL 24 sn, mapping invalidation yok | `utils/decorator/cache.ts:3,53,57,65-69`, `trendyol/services/CategoryService.ts:22,42,52`, `hepsiburada/services/CategoryService.ts:18,29`, `provider/PlatformMappingProvider.ts:14-38` | ADR-0002 adım 3-5: `@Cache({scope,ttlSeconds,context,key})` (scope zorunlu, `clientId` otomatik, yoksa atla), `has()` semantiği, tekil-uçuş (in-flight Map), `maxKeys`, MetricsRegistry sayaçları, `invalidateTenantCache` + yazma yollarına bağlama, yasak-metot mandalı testi | M | Hayır |
| F-06 | **P1** | Correlation id motor/adaptör yolunda yok; 316 `console.*` (145 integration) yapısız; PII/URL loglama riski | `grep requestContext` integration=0; `consoleBridge.ts`; `pazarama/api/OrderConnector.ts:11`; `Validator.ts:110`; `quality/baseline.json` | BullMQ job data + katalog sinyaline `corrId` taşı, `runWithContext` ile işçi başlangıcı, `ResilientHttpClient` metrik/log alanı `{integrationCode, clientId, operation, corrId}`; integration içi `console.*` → `logger.child({module})` (ratchet ile aşağı çek) | M-L | Hayır |
| F-07 | **P1** | Circuit breaker/limiter durumu gözlenemiyor; `adapterStates` sınırsız; ADR-0017 Aşama C (alarm) kanıtı yok | `ResilientHttpClient.ts:151,181-194`; ADR-0017 Karar 4/8 | `snapshot()` (breaker state, kuyruk, limiter) → MetricsRegistry + `getIntegrationHealth`; `adapterStates` LRU/TTL; C aşaması (gölge mod + kural tabanlı alarm) | M | Hayır (uyarı kanalı sonra) |
| F-08 | **P1** | Adaptör ortak altyapısı yok: 6 `Service.ts` kopyası (mock URL, kurulum sabitleri, env düğmeleri, get/post/put), 84 rethrow/wrap tekrarı | bölüm 2.3 "Tekrarlanan kod" | `BaseHttpService` (kurulum: policy'yi `getSetting` ile çöz; `resolveUrl(mock,real)` tek yerde; `authHeaders()` soyut), `wrapError(op)` yardımcı/dekoratör; adaptör başına karakterizasyon testi önce (Protokol 13) | L | Hayır |
| F-09 | **P1** | Sözleşme/drift koruması yalnız Trendyol sipariş+iade; diğer 5 adaptörde sessiz boş-dönüş varsayımları (`|| []`); dönüştürücüler kopya | `trendyol/contracts/*`; `pazarama/api/OrderConnector.ts:14`; `hepsiburada/api/OrderConnector.ts:29`; bölüm 2.4 | ContractGuard zod şemalarını HB/N11/Pazarama sipariş+ürün yanıtlarına genişlet (ADR-0018 B replay); beklenmeyen şekilde `IntegrationError` (boş dizi değil); ortak `toInternalOrder` normalizer | L | Hayır |
| F-10 | **P1** | Ideasoft/diğer döngülerde sayfa üst sınırı yok; durdurma bayrağı yok (C14) | F-04 kanıtları, `ExportOrchestrator.ts:42`, `ImportOrchestrator.ts:30`; BACKLOG C14 | `MAX_PAGES` + hata; motor döngülerine `AbortSignal`/durdurma bayrağı; Export kilit anahtarı `split('-')` düzelt (C14) | M | Hayır |
| F-11 | **P1** | API girdi doğrulaması yok (zod servis katmanında kullanılmıyor) | `grep zod` `api/`=0; BACKLOG `updateSettings` TypeError notu | `capabilities/` kaydına `input` zod şeması ekle, `RunOperation.execute` içinde tek noktadan doğrula (VALIDATION 400); pilot: IntegrationService + OrderService + ProductService | L | Hayır |
| F-12 | **P1** | Bellekte büyük veri: Excel dışa aktarma limitsiz, tenant listesi projeksiyonsuz, arşivleme tüm batch | `product-service.ts:472,491-494`, `OrderQueueProducer.ts:52,63-119`, `ExportOrchestrator.ts:247` | Excel: sayfalı/yayın akışı (`exceljs` stream) veya iş kuyruğu + R2 indirme (ExportDownloadApiManager mevcut); Producer: `select('clientId order status integrations')`, `addBulk`; arşiv: parça parça | M | Hayır |
| F-13 | **P2** | `IntegrationFactory` her 5 dk tüm tenant örneklerini birlikte siler → toplu DB okuması + Pazarama token yenileme dalgası; 120 sn Proxy zaman aşımı istek iptal etmez; `console.log` | `IntegrationFactory.ts:36,66-74,136-154` | Anahtar bazlı TTL/LRU (`lru-cache` zaten bağımlılık); Proxy zaman aşımında `AbortSignal`; token yönetimini örnek dışına (tenant-anahtarlı) çıkar | S-M | Hayır |
| F-14 | **P2** | Pazarama token gövdesi URL-encode değil, single-flight yok | `pazarama/services/Service.ts:71,57-83` | `URLSearchParams`, in-flight promise paylaşımı | S | Hayır |
| F-15 | **P2** | Trendyol sabit URL fallback'leri (`OrderConnector.ts:13,214,241,285`) ve `TRENDYOL_FALLBACK_BASE_URL` — ADR-0020 "hardcoded URL yok" ilkesi; tek kaynak descriptor/`productUrls` | `trendyol/api/OrderConnector.ts:13,214,241,285`, `trendyol/services/Service.ts:17` | Descriptor/`ConfigResolver` üzerinden çöz | S | Hayır |
| F-16 | **P2** | Giden yazmalarda idempotency anahtarı yok; `UNKNOWN_OUTCOME` sonrası tek yol mutabakat | `ResilientHttpClient.ts:251-262`, `IntegrationError.ts:100-147` | Platform destekliyorsa (Trendyol batch requestId benzeri) anahtar üret; yoksa mutabakat işini (`ExternalReconciliationJob`) UNKNOWN_OUTCOME'a bağla — mimari karar (architect) | M | Hayır |
| F-17 | **P2** | Tutarsızlıklar: HB `getMerchantId` `→APIKEY` fallback; HB/Pazarama `getInstance` yok; Bizimhesap/Ideasoft `checkBatchProduct` `undefined`; Ideasoft `OrderTransformer` `as any`; Pazarama mock port 6011/3006 | `hepsiburada/api/OrderConnector.ts:11`, `pazarama/services/Service.ts:44,101`, BACKLOG "İncelenmesi" 13-18 | Sırayla düzelt; `checkBatchProduct` `NOT_SUPPORTED` fırlatsın (C9 ilkesi) | S-M | Hayır |
| F-18 | **P2** | Index adayı `ExportStagedProducts{stockcode,...}` | bölüm 3.3 | `getIndexes` ile teyit et, D7 göç çerçevesiyle `0003-*` ekle | S | **Evet** (indeks = şema değişikliği; yedek kanıtı + `--backup-ref`; ayrıca D9 olay kaydı onayı bekliyor) |
| F-19 | **P2** | API sürümleme yok; başarı gövdesi tek zarfa bağlı değil | `ApiManager.ts:33-34`, `RunOperation.ts` | Mimari karar gerekir (`entegrasyonik-architect`): `/api/v1` öneki + `Deprecation` başlığı + başarı zarfı (geriye uyumlu ek alan) | M | Hayır |
| F-20 | **P2** | Test organizasyonu: modül bazlı script/jest `projects` yok, README bayat, süre bütçesi yok, e2e yok | bölüm 6 | jest `projects` (unit/characterization/contract/integration), `npm run test:integration-module` kısayolları, README güncelle, süre raporu (`--json`), flake izleme | S-M | Hayır (integration gerçek Mongo ister) |
| F-21 | **P2** | Bağımlılıklar: multer 1.x, sharp 0.32, xlsx 0.18, uuid 8, gereksiz build araçları prod bağımlılıklarında | bölüm 5.4, BACKLOG C18 | Önce characterization testi, sonra sırayla: multer 2.x, sharp majör, xlsx→exceljs (ADR gerekli), build araçlarını devDependencies'e | M-L | Hayır |
| F-22 | **P2** | Doküman drift: `INTEGRATION_ENGINE_STANDARDS.md` bayat | kök dosya | Güncelle veya "tarihsel" işaretle | S | Hayır |
| F-23 | **P2** | Webhook tarafında oran sınırı ve sabit-zamanlı karşılaştırma doğrulanamadı | `api/WebhookApiManager.ts:53-91` | Teyit et; yoksa `hookToken` başına IP oran sınırı, yanıt gecikmesi eşitleme | S | Hayır |
| F-24 | **P2** | `SourceMonitor` doküman çekimi (raw axios) — allowlist/retry dışı | `compliance/SourceMonitor.ts:164,172` | F-03 ile birlikte | S | Hayır |
| F-25 | **P2** | Tenant izolasyonu cross-tenant taraması (integration kapsamı): `IntegrationFactory`/`ResilientHttpClient` anahtarları tenant'lı **(bulgu yok)**; `@Cache` `undefined` anahtar paylaşımı (F-05) tek somut risk; motor sorguları tenant DB'de (ayrı DB) → paylaşımlı koleksiyon riski `ApplicationDB` sorgularında (ExportSignals/ImportJobs `clientId` filtresi: `Dispatcher.ts` sinyal sorguları teyit edilmeli — DOĞRULANAMADI, satır bazında incelenmedi) | `IntegrationFactory.ts:93,171`, `ResilientHttpClient.ts:179`, `Dispatcher.ts:111-117` | `Dispatcher/Sentinel/Sync` `ApplicationDB` sorgularının `clientId` filtresini tek tek doğrulayan cross-tenant testi | S-M | Hayır (mock'lu test) |

Not (BACKLOG'a ekleme): kullanıcı bu dosyayı salt-okunur denetim olarak istedi; `BACKLOG.md` bu görevde değiştirilmedi. F-01, F-02, F-03 `critical` olarak BACKLOG'a eklenmesi için orkestratöre önerilir.

---

## 8. Önerilen uygulama sırası (≤25, backlog ID'leriyle)

1. **F-01 / C22, C11, C20** — Trendyol 15 Ekim son tarihi: canlı doğrulama, `migrate:trendyol-urls` dry-run, origin (23 Ekim). *(DB: yedek şartı)*
2. **F-02 / C7, C14** — HB + N11 REST sipariş/iade sayfalama ve pencere; `lastSuccessfulOrderSync` yalnız tam çekimde ilerlesin. Önce characterization testi.
3. **F-03 / K7-K8** — `maxRedirects:0` + `maxContentLength`, `SourceMonitor` allowlist (F-24 ile).
4. **F-05 / C3 (ADR-0002 adım 3-5)** — `@Cache` yeni API, `has()`, tekil-uçuş, `maxKeys`, invalidation, yasak-metot mandalı; HB TTL/Trendyol anahtar düzeltmesi bunun içinde.
5. **F-04 / C10** — Ideasoft token akışı + URL'de sır + sayfa tavanı (F-10 ile).
6. **F-06 / ADR-0017 A kalan** — correlation id'yi motora/adaptöre taşı; integration `console.*` göçü (ratchet ile).
7. **F-07 / ADR-0017 B-C** — breaker/limiter `snapshot()` + metrik; alarm aşaması (gölge mod).
8. **F-10 / C14** — motor durdurma bayrağı, Export kilit `split('-')`, Import olay kaybı.
9. **F-12** — Excel dışa aktarma akış/kuyruk, Producer projeksiyonu + `addBulk`, arşiv parçalama.
10. **F-25** — motor `ApplicationDB` sorguları için cross-tenant testi (PLATFORM_BASELINE B2).
11. **F-08 / ADR-0016 §modüler** — `BaseHttpService` + hata sarmalama yardımcısı (adaptör başına char. test önce).
12. **F-09 / ADR-0018** — zod sözleşmelerini HB/N11/Pazarama sipariş+ürün yanıtına genişlet; sessiz `|| []` yerine hata.
13. **F-11 / ADR-0016 (B3)** — capability kaydı `input` şemasıyla tek noktadan doğrulama (pilot 3 servis).
14. **F-13, F-14** — `IntegrationFactory` anahtar bazlı TTL + token single-flight + Pazarama form encode.
15. **F-17** — tutarsızlık temizliği (`checkBatchProduct` NOT_SUPPORTED, `getInstance`, HB merchantId, mock port).
16. **F-15** — Trendyol sabit URL fallback'lerini `ConfigResolver/descriptor`a taşı (C11 kalanı).
17. **F-16** — idempotency/UNKNOWN_OUTCOME mutabakat kararı (mimari → `entegrasyonik-architect`).
18. **F-18 / ADR-0021 D7** — `ExportStagedProducts{stockcode}` index adayı (D9 olay kaydı onayı sonrası; DB'ye dokunur).
19. **F-21 / C18** — bağımlılık modernizasyonu (multer, sharp, xlsx→exceljs ADR, build araçları devDeps).
20. **F-20** — jest `projects` + modül scriptleri + README + süre ölçümü.
21. **F-19** — API `/v1` + başarı zarfı kararı (architect).
22. **F-23** — webhook oran sınırı teyidi.
23. **1g-T1 / C12** — login enumeration, captcha doğrulama, `updateUser` merkezi filtre, cookie regex (güvenlik kalanı).
24. **F-22** — `INTEGRATION_ENGINE_STANDARDS.md` yenileme.
25. **İnsan kararı bekleyenler (kod işi değil):** C5 sır rotasyonu, C13 maskeleme, C15 mock DB izni, C16 guard bayrağı, C17 purge zamanlayıcı/R2, ADR-0021 D9 olay kaydı onayı.

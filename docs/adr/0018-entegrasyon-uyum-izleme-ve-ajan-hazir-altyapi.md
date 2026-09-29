# 0018 — Entegrasyon Uyum İzleme (API drift tespiti) ve Ajan-Hazır Altyapı

## Durum
Kabul edildi (2026-09-28).
- Bugün yapılacak kısımlar Aşama A ve Aşama B'nin canlı probe hariç bölümüdür (Karar 4). Bunlar yeni servis, ücretli hesap veya LLM gerektirmez ve Protokol 12'yi tetiklemez.
- Aşama C (ajan iskeleti) ve Aşama D (ajanları açma) sayısal eşiklere bağlıdır.
- Kargo/e-fatura sağlayıcısı, LLM sağlayıcısı ve platform düzeyi test hesapları insan kararıdır (Karar 6).

Ayrıntı belgesi: `docs/INTEGRATION_CATEGORY_MODEL.md` (kategori kümesi, yetenek kataloğu, `IntegrationDescriptor` şeması, kargo/e-fatura port taslakları, sağlayıcı seçenek tabloları). Çelişki olursa bu ADR kazanır.

**Uyum notları (paralel ADR'ler):**
- **ADR-0017** (izleme), `faz3-arayuz`'a henüz birleşmemiş bir worktree'de okundu. Bu ADR, 0017'nin açtığı genişleme noktalarını **kullanır ve yeniden tanımlamaz**:
  - genel koşu şeması `JobRuns/JobState` (`runType:'agent'`, `scope`, `budget`, Karar 3),
  - `AlertSource: integrationFinding` / kural **R12** (Karar 4),
  - konsol sekmesi "Entegrasyon uyum" (Karar 5),
  - `MetricsRegistry` ve `zod` bağımlılığı (Karar 2, Maliyet notu).

  0017 değişirse bu ADR'nin atıfları güncellenir. 0017 henüz birleşmemişse Aşama A'nın o parçaları (R12 çağrısı, metrik serileri) bir no-op adaptörle yazılır (bkz. Karar 4).
- **ADR-0016** (backend hedef mimari): `docs/adr/` altında (ana ağaç ve worktree'ler) **henüz yok**. Bu ADR'deki klasör önerileri (`src/integration/catalog/`, `src/integration/compliance/`, `src/agents/`) geçicidir. Yerleşimde çelişki olursa **0016 kazanır**, anlam değişmez.
- **ADR-0019** (Yetenek Kaydı ve MCP/chat-UI eşitliği; orkestratörün uyum notu, 2026-09-28): **henüz yok**. Ajanların çağıracağı araç yüzeyi **ayrı bir kayıt değildir**. Bu yüzey, ADR-0019 yetenek kaydının bir **izin boyutudur** (`agentAllowed` + yan etki sınıfı + onay gereksinimi). Bu ADR araç şemasını tanımlamaz. Yalnız ajana özgü kısımları tanımlar: `AgentTask`/`AgentRun`, bütçe/süre, onay kuyruğu, guardrail'ler, `agents.enabled` (Karar 3). "Yetenek" kelimesi iki anlamda kullanılıyor. Burada *entegrasyon yeteneği* (`CapabilityKey`, bir adaptörün ne yaptığı) ile *uygulama yeteneği/aracı* (ADR-0019, kullanıcı/MCP/ajan tarafından çağrılabilir işlem) ayrıdır. Birincisi manifestoda, ikincisi ADR-0019 kaydında yaşar.

## Bağlam

**Proje sahibinin yönergesi (2026-09-28, özet):**
- "Entegrasyon" pazaryeri, e-ticaret, ERP, e-fatura ve kargonun hepsidir.
- Bir entegrasyonun API'si değiştiğinde bunu yakalamalıyız.
- İleride her entegrasyonu belirli aralıklarla kontrol eden bir AJAN konacak. Yatay işlevler (sipariş takibi, ürün işleri vb.) için de ajanlar konacak, ancak bu müşteri sayısı artınca olacak.
- Altyapı bugünden buna hazır tasarlanmalı. Ajanlar şimdi konmayacak.

**Kanıtlanmış mevcut durum:**

| # | Bulgu | Kanıt |
|---|---|---|
| B1 | Backend'de 3 kategori (marketplace 4, ecommerce 1, erp 1) var. Kargo ve e-fatura yalnız UI formu. | `modules/IntegrationFactory.ts:207-216`; `shipment-service.ts:80`, `invoice-service.ts:190` sabit `false`; `INTEGRATION_CATEGORY_MODEL.md` §1 |
| B2 | Tek sözleşme `IPlatform` pazaryeri odaklı. Yetenek bilgisi 4 yerde elle tutuluyor (kod, registry, site, formlar). Kategori adı tutarsız (`shipment`/`shipping`/ObjectId). | `interfaces/platforms/index.ts:217-315`; `ClientIntegration.ts:18-22`; `site/src/data/integrations.ts:16-29`; `Integration.ts:6` |
| B3 | **API drift yalnız elle yakalandı.** Trendyol host/yol (`api.trendyol.com/sapigw` → `apigw.trendyol.com/integration/.../v2`) ve User-Agent (`{clientId} - Entegrasyonik` → `{sellerId} - {entegratör}`, aksi halde 403) sapmaları, orkestratörün 2026-09-27 web doğrulama turunda doküman okunarak bulundu. Hiçbir otomatik sinyal bunları üretmedi. | `docs/research/2026-09-27-api-verification.md:7-27`; BACKLOG C11/C20 |
| B4 | Resmi kaynak listesi var ve "otomatik drift tespiti" için başlangıç noktası olarak kaydedilmiş. Ideasoft JS ile render ediliyor (WebFetch okuyamadı). Pazarama giriş arkasında. PTT kaynağı resmi değil. | `docs/research/official-api-reference-sources.md:7-19`; BACKLOG PLANNED (satır 176) |
| B5 | Sözleşme testi yalnız Trendyol'da var. Assertion'lar bilinçli olarak zayıf (sapma `console.warn` ile raporlanıyor, test kırmızıya dönmüyor). C20'de 7 mock/adaptör şema sapması kayıtlı. | `tests/contract/Trendyol.schema.test.ts:32-43`; BACKLOG C20 |
| B6 | Mock, gerçek sözleşmenin elle yazılmış bir türevi ve sapıyor (C20 (d)-(g): alanlar eksik, limitler simüle edilmiyor). Mock artık fail-closed çalışıyor (C19 kapandı). | `common/mock/MockMode.ts:1-10`; `INTEGRATIONS_REGISTRY.md` §1.1 |
| B7 | **Sessiz enum sapması:** Trendyol ve Pazarama `mapStatus`, bilinmeyen sipariş durumunu `UNAPPROVED`'a düşürüyor. Pazaryeri yeni bir durum eklerse bu hiçbir yerde görünmez. Trendyol dokümanı 13 durumdan bahsediyor, kod 8'ini işliyor (C20 (c)). | `trendyol/transformers/OrderTransformer.ts:162-172`; `pazarama/transformers/OrderTransformer.ts:127` |
| B8 | Tüm 6 adaptör (N11 SOAP dahil 7 örnek) tek `ResilientHttpClient`'tan geçiyor. Bu, pasif gözlem için doğal bir tek boğaz noktası. Çağrı metriği yalnız durum/kod/süre yazıyor. Yanıt **şekli**, yanıt başlıkları (`Deprecation`/`Sunset`) ve bilinmeyen alanlar hiç gözlenmiyor. | `common/http/ResilientHttpClient.ts:228-312`, `:270/291/304`; `IntegrationCallMetrics.ts:4-14`; `grep new ResilientHttpClient` = 7 |
| B9 | Zamanlayıcılar düz `setInterval` ile çalışıyor (6 adet). ADR-0017 bunları `JobRunRegistry` altına alıyor ve koşu şemasını ajan için genişletilebilir tanımladı. | `entegrasyonik.ts:158-167`; `TrialExpiryScheduler.ts:5-14`; ADR-0017 Karar 3 |
| B10 | Ajan için yeniden kullanılabilir temeller zaten var: denetim kaydı sanitizasyonu, sunucu tarafı `OPERATION_POLICY` (varsayılan ret), plan `features[]` açık listesi, `EntitlementService`, ADR-0009'un araç kaydı ve "önizle→onayla" yazma kuralı. | `services/audit/AuditLogger.ts:18-36`; `docs/OPERATION_POLICY.md`; `application/models/Plan.ts:9,31`; ADR-0009 §2-3,7 |

**Ölçek:** 1 aktif tenant, tek haneli abone hedefi, 6 adaptör. Bir drift olayı bugün **tüm** müşteriyi aynı anda etkiler. Buna karşın izleme maliyeti, sabit ve küçük bir mühendislik yüküdür.

## Değerlendirilen Alternatifler

### A. Drift tespit yaklaşımı
1. **Yalnız periyodik manuel doğrulama turu** (2026-09-27 turunun tekrarı).
   - Artı: sıfır kod.
   - Eksi: B3'te görüldüğü gibi tek yakalama yolu insan dikkati. Aralık uzadıkça canlı kırılma riski artıyor. Yönergedeki "ajan koyacağız" hedefine veri üretmez.
   - **Reddedildi (tek başına).** Destekleyici katman olarak kalır.
2. **Yalnız aktif canlı probe** (her entegrasyona zamanlanmış gerçek çağrı).
   - Artı: değişikliği müşteriden önce görür.
   - Eksi: platform düzeyi test hesabı gerektirir (bugün yok, Protokol 12). Tenant kimliğiyle yapılması reddedilir (Karar 2b). Tek başına şema sapmasının yalnız probe edilen uçlardaki kısmını görür.
   - **Tek başına yetersiz.**
3. **Katmanlı: pasif sözleşme bekçisi + aktif probe (replay → canlı) + kaynak izleme + mock senkronu; tek bulgu modeli.**
   - Artı: pasif katman sıfır ek dış çağrıyla gerçek trafiği gözler. Kaynak izleme değişikliği henüz koda yansımadan duyar. Hepsi tek `IntegrationFinding` modeline akar, yani ileride ajanın tek girdi/çıktı yüzeyi olur.
   - Eksi: 4 küçük parça yazılır, yanlış pozitif yönetimi gerekir.
   - **Seçildi.**
4. **Ücretli API izleme/sözleşme SaaS'ı** (ör. harici şema/uptime izleyicileri).
   - Eksi: ücret (Protokol 12). Türk pazaryeri API'lerine özel bilgi yok. Tenant trafiği üçüncü tarafa gider (KVKK).
   - **Reddedildi.** Eşik: entegrasyon sayısı 25'i geçerse yeniden bakılır.

### B. Şema doğrulama biçimi
1. **Zod şemaları (TypeScript kaynaklı)**: ADR-0017 zaten `zod`'u üretim bağımlılığı olarak getiriyor. Tip çıkarımı ile adaptör kodu aynı şemayı kullanabilir. **Seçildi.**
2. **JSON Schema + ajv**: dile bağımsız ve OpenAPI ile uyumlu. Ama ikinci bir doğrulayıcı bağımlılığı getirir, TS tipleri ayrıca yazılır. Resmi OpenAPI yayınlayan bir entegrasyon çıkarsa, **o** entegrasyon için OpenAPI'den zod'a dönüşüm yapılır. Bugün doğrulanmış OpenAPI kaynağı yok.
3. **Şema yok, yalnız "şekil parmak izi" (anahtar yolu + tip hash'i)**: çok ucuz ama "hangi alan önemli" ayrımını yapamaz. **Tamamlayıcı olarak** kullanılır (bilinmeyen alan tespiti).

### C. Ajan altyapısı
1. **Bugün tam ajan çerçevesi** (LLM döngüsü, araç çağırma, çok-ajan orkestrasyonu). Tek haneli ölçekte aşırı mühendislik. LLM maliyeti ve KVKK kararı (Protokol 12) gerektirir. Kullanılmayan kod çürür. **Reddedildi.**
2. **Hiçbir şey yapmamak, ajan gelince tasarlamak.** Bugün atılacak yanlış temeller geri döndürülemez: ajan koşularının ayrı bir koleksiyonda tutulması, araç yüzeyinin ikinci bir kayıtla çoğaltılması, onay akışının MCP'den ayrı yazılması, bulguların serbest metin loglarda kalması. **Reddedildi.**
3. **Veri modelleri ve sınırlar bugün kararlaştırılır, kod eşikte yazılır.** Ajanın girdisi (bulgular, metrikler, koşular) ve sınırları (araç izin boyutu, onay kuyruğu, bütçe) şimdi tanımlanır. Bugün yalnız ajan olmadan da değer üreten parçalar yazılır (manifesto, bulgu modeli, bekçi, probe/kaynak izleme). **Seçildi.**

## Karar

Entegrasyonlar beş kanonik kategoride (`marketplace | ecommerce | erp | einvoice | shipping`) **kodla sürümlenen bir yetenek manifestosuyla** (`IntegrationDescriptor`) tanımlanır. Bu manifesto UI, site iddiaları ve izleme için tek kaynaktır. API değişimi dört katmanda tespit edilir: pasif sözleşme bekçisi, aktif probe, kaynak izleme ve mock senkronu. Bu katmanların hepsi tek `IntegrationFinding` modeline akar ve ADR-0017 alarm/konsol altyapısıyla görünür olur. Ajanlar için bugün yalnız veri modelleri ve sınırlar sabitlenir. Ajan koşuları ADR-0017 `JobRuns` kaydıdır, araçlar ADR-0019 yetenek kaydının `agentAllowed` boyutudur, yazma eylemleri MCP ile ortak insan onay kuyruğundan geçer. Ajan kodu ve LLM kullanımı sayısal eşiklere bağlanır.

### Karar 1 — Kategori modeli ve yetenek manifestosu
Ayrıntı: `docs/INTEGRATION_CATEGORY_MODEL.md` §2-6.

1. `IntegrationCategory` beş değerden oluşur. Kanonik ad `shipping`'dir. DB'deki `shipment` göç edilmez, tek bir eşleyiciyle çevrilir. `payment/sms/fulfillment` adları **ayrılmıştır** ama ilk gerçek adaptöre kadar enum'a girmez.
2. Her adaptörün yanında bir `descriptor.ts` bulunur. İçeriği: kategori, `adapterVersion` (semver), auth tipi + `requiredSettings`, yetenekler (`supported | limited | platform_auto | not_supported`, "bilinçli desteklenmeyen" dahil), görünür kapsam sınırları, rate limit (dokümante / yapılandırılmış / doğrulandı mı), bilinen API sürümü, host'lar, doküman/changelog URL'leri ve izleme modu, mock uyumluluğu (fikstürler, bilinen sapmalar), izlenen sözleşmeler, probe tanımları.
3. **Tek kaynak (E3):**
   - Frontend kapsam rozetlerini ve "yakında" durumunu manifestodan okur.
   - Site iddia kaydı manifestoya **test ile bağlanır**: site manifestodan fazlasını iddia edemez.
   - Tutarlılık testleri: fabrika kodları, `requiredSettings`, rate politikası, ve `not_supported` metotlarının gerçekten `NOT_SUPPORTED` fırlattığı.
   - Örtük sınırlar `limited` + `note` ile yazılır (ör. Bizimhesap siparişleri üretici tarafından taranmıyor, `OrderQueueProducer.ts:65`).
4. **`IPlatform` bölünmez.** Kargo ve e-fatura, ortak `IIntegrationAdapter` tabanından türeyen dar portlar alır (`IShippingProvider`, `IEInvoiceProvider`, taslak §5). Fabrika bunlar için aynı yapılandırma/şifre çözme/timeout/önbellek yolunu kullanan iki yeni giriş alır. Yazma işlemlerinde idempotency ve `UNKNOWN_OUTCOME` zorunludur. E-faturada `externalRef` tekilleştirmesi yasal gerekliliktir.
5. **Sağlayıcı seçimi insan kararıdır.** Seçenek tabloları ve öneriler kategori belgesinin §7 bölümündedir. Kargo önerisi: port K1/K2/K3'ü karşılar, ilk adaptör talep güdümlü doğrudan firma API'si olur, aracıya geçiş eşiği "≥3 firma × ≥2 tenant"tır. E-fatura önerisi: özel entegratör + BYO hesap modeli, bayilik yok.

- **Reddedilen:** manifestoyu DB'de tutmak (kod ile senkronu bozulur, sürümlenmez), `IPlatform`'u kategori arayüzlerine bölmek (13 çağıran; getirisi bugün düşük), boş kategoriler açmak.
- **Geçiş eşikleri:**
  - Manifesto sayısı ≥12 olursa **veya** site↔manifesto uyumsuzluğu bir çeyrekte >2 kez yakalanırsa, site verisi manifestodan **üretilir** (kod üretimi).
  - `IPlatform` uygulayıcılarının ≥%40'ı metotlarının yarıdan fazlasını `NOT_SUPPORTED` olarak işaretliyorsa, ya da yeni bir pazaryeri-dışı kategori `IPlatform` üzerinden eklenmek istenirse, `IPlatform` ayrıştırma ADR'si yazılır.

### Karar 2 — API drift tespiti: dört katman, tek bulgu modeli

#### 2a. Pasif sözleşme bekçisi (contract guard): gerçek trafikten, ek dış çağrı olmadan
- **Konum:** adaptörün connector katmanı. Yanıt tipi ancak orada bilinir. `ResilientHttpClient`'a yalnız **jenerik** iki kanca eklenir:
  1. yanıt başlıklarından `Deprecation`, `Sunset` (RFC 8594) ve `Warning` yakalama,
  2. isteğe bağlı `contract?: ContractRef` seçeneği (verilirse gövde, sözleşme bekçisine örneklenerek iletilir).
- **Sözleşme:** `modules/<kat>/<kod>/contracts/*.ts` içinde, her izlenen işlem için bir zod şeması (`trendyol.orders.list@v2` gibi kimlikle). Şema **yalnız adaptörün gerçekten okuduğu alanları** zorunlu tutar (C20'deki "usedFor" yaklaşımı). Geri kalanı `passthrough` olur, böylece bilinmeyen alan hata değil bilgi sayılır.
- **Davranış (kesin kural): gözlem yalnızca.** Bekçi yanıtı **asla** değiştirmez, reddetmez ve fırlatmaz. İş akışını bozmak ADR-0006 hata sözleşmesinin işidir. Bekçi dört şeyi ölçer:
  - (i) zorunlu alan eksik / tip uyuşmazlığı → `schema_mismatch`,
  - (ii) şemada olmayan yeni alan → `unknown_fields` (anahtar yolu listesi),
  - (iii) **bilinmeyen enum değeri**: durum eşleyicileri `default` dalında sessizce `UNAPPROVED`'a düşmek yerine `reportUnknownEnum(contractId, field, value)` çağırır. Eşleme davranışı değişmez, önce karakterizasyon testi yazılır. Durum kodu gibi kısa, PII olmayan değerler, ≤64 karakter ve yalnız `[A-Za-z0-9_-]` içeriyorsa kaydedilir,
  - (iv) **şekil parmak izi**: sıralı anahtar yolları + tip adlarının SHA-256'sı. Değer asla alınmaz.
- **HTTP kalıpları** (ADR-0017 `integration_calls` metriğinden türetilir, ayrı sayaç açılmaz):
  - önceden başarılı bir işlemde 404, ya da 410/426 → `endpoint`/`version` şüphesi,
  - aynı entegrasyonda **≥2 tenant'ta** 15 dk içinde eşzamanlı 401/403 artışı → `auth` şüphesi. Tek tenant'ta görülen AUTH, drift değil tenant kimlik sorunudur (ADR-0017 R2),
  - `Retry-After`/429 kalıbının belirgin değişimi → `ratelimit`.
- **Örnekleme ve maliyet:** her `(entegrasyon, sözleşme)` için 10 dakikada ilk yanıt + parmak izi değişen her yanıt + hata yanıtları doğrulanır. Bir doğrulamada en fazla 50 dizi elemanı gezilir. Hedef ek süre, doğrulanan çağrı başına p95 < 5 ms.
- **Gizlilik ve sır:** kanıt olarak yalnız anahtar yolları, tip adları, enum kodu, HTTP durumu, normalize işlem yolu (`/orders/:id`) ve başlık **adları** (değer değil; `Sunset` tarihi hariç) saklanır. Müşteri adı, adresi, telefonu veya herhangi bir gövde değeri **asla** saklanmaz. Kanıt, `AuditLogger.sanitizeMeta` ile aynı yasak anahtar süzgecinden ve ADR-0017 redaksiyonundan geçer.
- **Metrik** (ADR-0017 kayıt defteri): `integration_contract_checks{integrationCode, contractId, outcome: ok|unknown_fields|mismatch|unknown_enum}`. Bu seride `tenantId` etiketi **yok**, çünkü drift platform düzeyindedir. Etkilenen tenant'lar bulgunun `affectedTenants` alanında tutulur.

#### 2b. Aktif probe (canary): zamanlanmış salt-okunur sözleşme testi
- Her manifestodaki `probes[]` için salt-okunur, yan etkisiz uçlar kullanılır: kategori ağacı, nitelikler, kargo firmaları, token alma, `testConnection`. Probe yanıtı **aynı** sözleşme bekçisinden geçer.
- **İki mod:**
  - **replay** (varsayılan, bugün): kayıtlı ve redakte edilmiş fikstürler adaptör + dönüştürücüden geçirilir. Bu, CI'da koşan sözleşme regresyon testidir.
  - **live** (`PROBES_LIVE=true`, yalnız worker rolü, yalnız **platform düzeyi** test hesaplarıyla, kimlikler `PROBE_<KOD>_*` env'de): günde 1 kez her entegrasyon için, bütçe ≤20 çağrı/entegrasyon/gün. Canlı mod her koşuda `JobRunRegistry` altında `probe:<kod>` işi olarak kaydedilir (`runType:'scheduler'`, `scope.level:'platform'`).
- **Tenant kimliğiyle probe yasaktır.** Tenant kotasını ve sözleşmesini aşar, KVKK amaç sınırlamasına aykırıdır. İleride bir tenant "erken uyarı programı" için açık rıza verirse bu yeniden değerlendirilir. Eşik: ≥3 tenant talep ederse.
- **Hangi entegrasyonda mümkün:** kategori belgesi §8. Hiçbir entegrasyonda platform düzeyi sandbox varlığı henüz doğrulanmadı. Bugün hepsi replay modunda çalışır. Ideasoft, C10 kapanana kadar kapalıdır.
- Canlı mod mock'ta ve lokal ortamda **çalışmaz**. `MockMode` fail-closed ve egress guard ile yapısal olarak engellenir (C19). Probe başlatıcısı `PROBES_LIVE=true` ile mock modunun aynı anda açık olmasını fail-fast reddeder.

#### 2c. Kaynak izleme: resmi doküman, changelog ve duyurular
- Manifestodaki `docs[]` içinde `monitor:'auto'` işaretli URL'ler **haftada 1** kez çekilir. Koşullu GET kullanılır (`ETag`/`If-Modified-Since`). Ana metin çıkarılır (script/nav/footer atılır, boşluk normalize edilir) ve SHA-256 hash'i alınır. Değişiklik varsa ≤2 KB'lık satır diff özeti saklanır ve `IntegrationFinding{kind:'doc', severity:'info'}` üretilir.
- **Tercih sırası:** makinece okunabilir kaynaklar (OpenAPI/Swagger JSON, RSS/Atom, sürüm notu sayfası, durum sayfası) > HTML sayfa. OpenAPI varsa yapısal diff yapılır (işlem listesi, zorunlu alanlar) ve `endpoint/schema` türü bulgu üretilir.
- **Hukuki ve etik sınırlar (bağlayıcı):**
  - `robots.txt`'e uyulur.
  - Kimliği belli bir `User-Agent` kullanılır (ürün adı + iletişim adresi, env'den).
  - URL başına haftada ≤1 istek, toplam ≤1 istek/sn.
  - Giriş gerektiren veya ToS'u otomatik erişimi yasaklayan sayfalar `monitor:'manual'` olarak işaretlenir. Pazarama paneli ve Ideasoft (JS render) bugün bu kapsamdadır. **Headless tarayıcı kullanılmaz** (maliyet ve kırılganlık).
  - İçerik yeniden yayımlanmaz. Yalnız hash ve iç kullanım için kısa diff tutulur.
- **Kırılganlık:** sayfa düzeni değişince yanlış pozitif üretir. Bu yüzden `doc` bulguları **her zaman `info`** olur, alarm üretmez, yalnız konsolda triage kuyruğuna düşer. Bir kaynak 30 günde >4 kez "değişti" üretip hepsi `false_positive` işaretlenirse, çıkarım seçicisi daraltılır ya da kaynak `manual`'a alınır.
- **Manuel tur:** `monitor:'manual'` kaynaklar ve genel doğrulama için **çeyrekte bir** doğrulama turu yapılır (2026-09-27 turunun deseni). Sonuç manifestonun `api.lastVerifiedAt` ve `verificationRef` alanlarına işlenir. Bu tur, ileride "entegrasyon uyum ajanı"nın ilk otomatikleştireceği iştir (Karar 3d).

#### 2d. Mock ve sözleşme senkronu
- **Tek doğruluk kaynağı zod sözleşmesidir.** Fikstürler ve mock ondan türetilir, tersi değil.
  - Fikstürler: `backend/tests/contract/fixtures/<kod>/<sözleşme>.<varyant>.json`. Sentetik veya redakte edilmiş olmalıdır, gerçek müşteri verisi içeremez.
  - Kontrol: şemaya uyum + adaptör dönüşüm testi.
- **Akış (bulgu kabul edilince):** (1) sözleşme şeması + fikstür güncellenir (kaynak: doküman veya redakte canlı örnek) → (2) adaptör sözleşme testi kırmızıya döner → (3) adaptör düzeltilir, `adapterVersion` artar → (4) mockserver güncellenir → (5) opsiyonel `mock-contract` kontrolü, mock yanıtlarını aynı şemayla doğrular → (6) bulgu `fixed` olur ve `fixedInAdapterVersion` + commit ile bağlanır.
- `mock-contract` kontrolü varsayılan test takımında **değildir**, çünkü mockserver'ın kendi Mongo'su var ve C15 henüz karara bağlanmadı. Bu kontrol ayrı bir script ve işaretli bir testtir.
- `Trendyol.schema.test.ts`'in zayıf assertion'ları, C20 kapandığında aynı zod sözleşmelerine taşınarak katı hale getirilir. Bu, C20'nin kapanış koşuludur.

#### Bulgu modeli: `IntegrationFinding` (ApplicationDB, tek model)
```
IntegrationFinding {
  _id, dedupKey (unique) = sha256(integrationCode | kind | subjectKey | signature),
  integrationCode, category,
  kind: 'schema' | 'unknown_enum' | 'endpoint' | 'version' | 'deprecation' | 'auth' | 'ratelimit' | 'doc',
  source: 'guard' | 'probe' | 'source_monitor' | 'manual' | 'agent',
  subjectKey,            // ör. 'trendyol.orders.list@v2#content[].status' | doc URL | normalize işlem yolu
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info',
  evidence: { paths?, types?, enumValue?, httpStatus?, headerNames?, sunsetAt?, docDiff? (≤2KB), fingerprint? },  // REDAKTE
  occurrences, firstSeenAt, lastSeenAt, affectedTenants: number[] (yalnız kimlik, ≤100),
  confirmed: boolean,    // yanlış pozitif kapısı (aşağıda)
  status: 'new' | 'triaged' | 'accepted' | 'fixed' | 'wontfix' | 'false_positive',
  adapterVersionSeen, fixedInAdapterVersion?, fixRef? (commit/PR), recommendation? (≤1KB),
  decidedBy?, decidedAt?, notes?, closedAt?
}
```
- **Tekilleştirme:** aynı `dedupKey` için `$inc occurrences` + `lastSeenAt` güncellenir, `affectedTenants` için `$addToSet` yapılır (upsert, süreç içinde 10 sn toplama, ADR-0017 ErrorEvents deseni). **Regresyon:** `fixed` bir bulgu, `fixedAt + 24 sa` sonrasında aynı imzayla tekrar görülürse `new`'e döner.
- **Şiddet varsayılanları:**

  | Şiddet | Durum |
  |---|---|
  | critical | ≥2 tenant'ta auth şeması değişimi; 410; kullanılan uçta ≥%50 404 |
  | high | kullanılan alanda eksiklik/tip değişimi; sipariş/iade durumunda `unknown_enum`; `Sunset` < 30 gün |
  | medium | `Deprecation` başlığı; ratelimit kalıbı değişimi |
  | low | `unknown_fields` |
  | info | `doc` |

- **Yanlış pozitif kapısı:** `confirmed = true` olması için iki koşuldan biri gerekir: (≥2 tenant) **veya** (≥20 gözlem ve ≥30 dk süreklilik) **veya** kaynak probe/manual. Onaylanmamış bulgu alarm üretmez, yalnız konsolda görünür.
- **Alarm** (ADR-0017 R12): `confirmed && severity ≥ high` olan bulgu, `new` durumuna geçişte `raiseAlert({source:'integrationFinding', ruleId:'R12', scopeKey: integrationCode+kind, severity})` çağırır. Tekilleştirme, histerezis, susturma ve fırtına koruması ADR-0017'dendir.
- **Tenant görünürlüğü:** tenant, bulgunun kendisini **görmez**. Bulgu admin tarafından `accepted` yapıldığında ve `severity ≥ high` ise, ADR-0017 `IntegrationHealthItem.reasons[]` alanına eşlenmiş TR bir neden eklenir (`code:'INTEGRATION_API_CHANGE'`, ör. "Trendyol API'sinde değişiklik tespit edildi; ekibimiz çalışıyor"). Otomatik ve triage'sız tenant uyarısı yoktur, çünkü yanlış pozitif müşteri güvenini bozar.
- **Devre kesici / degraded ilişkisi:** drift bulgusu **devre kesiciyi açmaz ve durumu otomatik `down` yapmaz**. Kesici ADR-0006'da yalnız taşıma hatalarıyla sürer. Drift gerçek hata üretiyorsa zaten R1/R2 ve kesici devreye girer. Drift yalnız `accepted` sonrasında `degraded` nedenine eklenir.
- **Saklama:** açık bulgular kalıcıdır. Kapalı bulgular (`fixed|wontfix|false_positive`) `closedAt + 365 gün` TTL ile silinir (kısmi TTL indeks). Beklenen hacim: ayda onlarca doküman.
- **Konsol** (ADR-0017 Karar 5 "Entegrasyon uyum" sekmesi, ADR-0015 *liste + detay çekmecesi* şablonu):
  - Filtreler: entegrasyon, kategori, tür, şiddet, durum.
  - Entegrasyon başına özet kartı: `adapterVersion`, `lastVerifiedAt`, son probe sonucu, izlenen kaynakların durumu, açık bulgular (şiddete göre).
  - Detay: kanıt, etkilenen tenant sayısı ve listesi (yalnız platformAdmin), öneri.
  - Eylemler: triage / accept / wontfix / false_positive / fixed (fixRef zorunlu). Her eylem `AuditLogger`'a yazılır.
  - Uçlar `IntegrationComplianceService` altında toplanır. Yalnız `platformAdmin` erişir ve uçlar `OPERATION_POLICY`'ye kaydedilir.

### Karar 3 — Ajan-hazır altyapı (bugün sabitlenen sınırlar; kod eşikte)

#### 3a. Ajan çalıştırma modeli
- **`AgentTask`: tanım.** Kodda, statik bir kayıttır. DB'den düzenlenmez (güvenlik yüzeyi ve sürümleme gerekçesiyle). Alanları:
  - `id`, `version`, amaç,
  - `scope: 'platform' | 'tenant'`,
  - `triggers: interval | event(<IntegrationEventBus/NotificationEventBus olayı>) | manual`,
  - `inputSchema`,
  - `tools: string[]` (ADR-0019 yetenek adları; kayıt anında hepsinin `agentAllowed` olduğu doğrulanır),
  - `maxSideEffect: 'read' | 'propose'` (**ajan asla doğrudan `write` yapamaz**),
  - `budget { maxDurationMs, maxToolCalls, maxCostUnits, maxLlmTokens? }`,
  - `llm: 'none' | 'optional' | 'required'`,
  - `outputs: ('finding' | 'proposal' | 'summary')[]`,
  - `flag` (açma anahtarı), `owner`, `evalSetRef`.
- **`AgentRun`: koşu.** Yeni bir koleksiyon **açılmaz**. ADR-0017 `JobRuns/JobState` kaydıdır: `runType:'agent'`, `scope {level, tenantId?, integrationCode?}`, `trigger`, `budget`, `outputSummary`, `error`, `corrId`. Ajana özgü ek alanlar `outputSummary` içinde yapılandırılmış olarak durur: `taskId`, `taskVersion`, `toolCalls`, `costUnits`, `llmTokens`, `findingIds[]`, `proposalIds[]`. Ek durum değerleri: `budget_exceeded`, `killed`, `disabled`. Böylece stale/hung tespiti (R6), konsol listesi ("İşler/Koşular", `runType` filtresi) ve alarm ücretsiz gelir.
- **Çalıştırıcı** (Aşama C): `runAgent(task, scope)` → `runJob` sarmalayıcısı içinde çalışır. Bütçe her araç çağrısından önce denetlenir. Bütçe aşılırsa koşu `budget_exceeded` ile durur ve kısmi çıktı saklanır. Tenant kapsamlı koşu **asla** birden fazla tenant'a dokunmaz. Çok-tenant iş, tenant başına ayrı koşudur.

#### 3b. Araç yüzeyi: ADR-0019 yetenek kaydının ajan izin boyutu
- Ayrı bir "ajan araç kaydı" **yoktur**. Ajan, ADR-0019 kaydındaki yetenekleri çağırır. Ajan için gereken boyutlar (şemaları ADR-0019'dadır) şunlardır: `agentAllowed: boolean` (varsayılan **false**), `sideEffect: 'read' | 'propose' | 'write'`, `approval: 'none' | 'required'`, `tenantScope: 'tenant' | 'platform'`.
- **Değişmezler (bu ADR'de bağlayıcı):**
  1. Varsayılan yalnız okumadır.
  2. `write` yetenekleri ajana **doğrudan** hiçbir zaman açılmaz. Ajan yalnız `propose` çağırabilir, bu da bir `ActionProposal` üretir (3c).
  3. Yetenek, çağrıldığı kanaldan (UI, MCP, ajan) bağımsız olarak aynı servis yolundan, aynı `OPERATION_POLICY` + `EntitlementService` + tenant kapsamı + rate limit denetimleriyle çalışır.
  4. Ajanın kimliği sentetik bir ilkedir (`agent:<taskId>`). Tenant kimliği **yalnız koşu kapsamından** gelir, model çıktısından veya araç parametresinden asla alınmaz (ADR-0009 §1 ile aynı ilke). Rolü en fazla `member`-okuma düzeyindedir.
  5. Platform kapsamlı ajanlar (ör. entegrasyon uyumu) tenant DB'sine **erişemez**. Yalnız bulgular, toplu metrikler, koşu kayıtları ve manifestolar üzerinde çalışır.
  6. Dışarıya veri gönderen yetenekler (e-posta, webhook, rastgele URL getirme) ajana açılmaz. Kaynak izleme dışında URL getirme, yalnız manifestodaki `docs[].url` alan adlarıyla sınırlıdır (allowlist).

#### 3c. İnsan onayı (human-in-the-loop), guardrail'ler, kill-switch
- **`ActionProposals` (ApplicationDB): ajan ve MCP yazma araçları için ORTAK onay kuyruğu.** ADR-0009 §3b "önizle→onayla" akışının kalıcı karşılığıdır. İkinci bir onay mekanizması yazılmaz. ADR-0019 aynı kavramı tanımlarsa ad konusunda ADR-0019 kazanır.
  - Alanlar: `{tenantId|null, source:'agent'|'mcp'|'rule', sourceRunId, capability, capabilityVersion, input (şema-doğrulanmış), preview (değişiklik listesi/diff, PII maskeli), riskClass: 'low'|'high'|'destructive', requiredRole, status: 'pending'|'approved'|'rejected'|'expired'|'executed'|'failed', idempotencyKey (unique), expiresAt (varsayılan 72 sa), decidedBy, decidedAt, executionRef}`.
  - Onay **yalnız** UI'daki açık bir kullanıcı eylemiyle verilir. Model veya ajan onay kanalına erişemez.
  - Yürütme, **onaylayan kullanıcının kimliğiyle** aynı yetenek yolundan yapılır. Ajanın kimliği yürütmede kullanılmaz.
  - Yıkıcı sınıftaki öneriler (silme, iptal, toplu fiyat değişimi) için ikinci onay veya `owner` rolü gerekir. Bu ayrım Protokol 12'nin ürün içi karşılığıdır.
- **Guardrail'ler:**
  - (i) **Dış içerik veridir, talimat değildir.** Doküman sayfası, pazaryeri yanıtı, müşteri mesajı ve ürün açıklaması `untrusted` işaretli, uzunluk sınırlı yapılandırılmış veri olarak verilir. Araç seçimi içerikten türetilemez (ADR-0009 §7).
  - (ii) Ajanlar kimlik bilgilerini hiçbir zaman görmez. Araç çıktıları redaksiyondan geçer.
  - (iii) Her araç çağrısı ve her öneri `AuditLogs`'a `source:'agent'` ile yazılır.
  - (iv) Anomali durdurucu: bir koşuda ≥3 `denied` veya bütçe aşımı olursa görev otomatik olarak `disabled` olur ve R6/R12 benzeri bir uyarı üretilir.
  - (v) Ajan çıktısı kod veya HTML olarak çalıştırılmaz.
- **Açma/kapama (üç kat):**
  1. env `AGENTS_ENABLED` (varsayılan `false`, global kill-switch),
  2. görev bayrağı (`AgentTaskState.disabled`, konsoldan anlık kapatma, denetimli),
  3. tenant kapsamlı görevlerde plan özelliği `agents` (ADR-0008 `features[]` açık liste, `EntitlementService` ile). Tenant ayarı ayrıca `aiProcessingConsent` gerektirir (LLM kullanan görevlerde, 3e).

#### 3d. Yatay işlev ajanları envanteri

İlke: **önce deterministik kural/iş, sonra (gerekirse) LLM.** Bir "ajan" çoğu durumda bir kural tespitçisi ile opsiyonel bir LLM özet/öneri katmanının birleşimidir. Tablodaki "ön koşul" sütunu, ajanın hangi manifesto yeteneğine ve servise dayandığını gösterir. **Bugün hiçbiri yazılmaz.**

| # | Ajan | Neyi izler / sinyal | Eylem taslağı (propose) | Risk | Ön koşul | Öncelik | Geçiş eşiği |
|---|---|---|---|---|---|---|---|
| 1 | **Entegrasyon uyumu** (platform) | `IntegrationFinding`, `doc` diff'leri, probe sonuçları, manuel tur takvimi | bulgu triage önerisi; sözleşme/fikstür değişiklik taslağı (PR metni); manifesto `lastVerifiedAt` güncelleme önerisi | düşük (tenant verisi yok) | Karar 2 (A+B) | **1** | izlenen kaynak değişimi >5/ay **veya** entegrasyon sayısı ≥10 **veya** manuel triage yükü >4 sa/ay |
| 2 | Sipariş takibi (tenant) | kargo termini aşan, `lastOrderSync` gecikmesi, takılı durum (onaylı ama gönderilmemiş > N sa) | tenant'a eylem listesi; `sendOrderShipping` önerisi | orta | `orders`, `shippingNotice`, ADR-0017 lag metrikleri | 2 | ≥20 aktif tenant **veya** toplam ≥3.000 sipariş/gün |
| 3 | Katalog sağlığı | reddedilen/onay bekleyen ürünler, eksik zorunlu nitelik, batch hata oranı | düzeltme taslağı (nitelik eşleme) | orta | `products`, `categories`, Validator/Sentinel çıktıları | 3 | ≥20 tenant **veya** ≥50.000 aktif SKU |
| 4 | Stok mutabakatı açıklayıcı | `Internal/ExternalReconciliationJob` farkları, OVERSOLD | fark açıklaması + düzeltici stok yayını önerisi | yüksek (satış) | ADR-0004 işleri (var) | 3 | açık OVERSOLD >10/hafta **veya** ≥20 tenant |
| 5 | Fiyat/komisyon | komisyon oranı değişimi, marjın eşik altına düşmesi | fiyat değişim önerisi (onaylı) | yüksek | `finance`, maliyet alanı (**yok**, benchmark G2) | 4 | maliyet verisi modeli var **ve** ≥20 tenant |
| 6 | İade/soru yanıt taslağı | yeni soru/iade, SLA süresi | yanıt metni taslağı (LLM); tenant gönderir | orta (marka dili, PII) | `questions`, `returns`, LLM kararı | 3 | tenant'lar toplamında ≥200 soru/hafta |
| 7 | Kargo takibi | `track` istisnaları, teslim edilemeyen gönderi | müşteriye bilgilendirme/iade kargo önerisi | orta | kargo portu (Y-01) | 4 | kargo adaptörü canlı + ≥500 gönderi/gün |
| 8 | E-fatura hataları | `documentStatus` = REJECTED/ERROR, kesilmemiş fatura | yeniden kesim/düzeltme taslağı | **yüksek (yasal)** | e-fatura portu (Y-02) | 4 | e-fatura adaptörü canlı + ≥5 red/hafta |
| 9 | Hakediş mutabakatı | `retrieveFinancials` ile sipariş/iade/kargo faturası farkı | fark raporu + itiraz taslağı | orta | `finance` (HB/N11 kısmi) | 3 | ≥10 tenant finans modülünü kullanıyorsa |
| 10 | Abonelik/dunning (platform) | `past_due`, trial bitişi, kullanım/kota | hatırlatma metni önerisi | düşük | ADR-0008 (var) | 4 | ≥30 ödeyen tenant |
| 11 | Destek talebi ön-sınıflandırma (platform) | yeni ticket, ilgili bulgu/uyarı | kategori + ilgili bulgu bağlantısı | düşük | Ticket servisi, bulgu modeli | 4 | ≥50 ticket/hafta |

Tablodaki tenant sayıları "aktif (son 30 günde en az 1 sync)" tenant anlamındadır. Kaynak: ADR-0017 metrikleri. Eşikler, ajanın gerçek insan zamanını geri kazandıracağı hacmi temsil eder. Eşiğe ulaşılmadan önce aynı ihtiyaç konsol listesi ve ADR-0017 alarmlarıyla karşılanır.

#### 3e. Kalite, maliyet, değerlendirme (eval), LLM soyutlaması, KVKK
- **LLM portu:** `LlmPort.complete({ purpose, taskId, messages, jsonSchema?, maxTokens })` → `{ output, usage{inTokens,outTokens,costUnits}, model }`. Varsayılan uygulama `NullLlm`'dir: `unavailable` döner ve görev deterministik çıktıyla devam eder. Her görevin LLM'siz bir yedek yolu **zorunludur**. Sağlayıcı ve hesap seçimi ücretli bir karardır (Protokol 12). Port model-bağımsızdır: OpenAI-uyumlu uç veya başka bir sağlayıcı olabilir, yerel modeller de dahil. LLM **yalnız yorumlama, özetleme ve öneri metni** katmanında kullanılır. Karar, eşik ve yetki hep deterministik koddadır.
- **ADR-0009 ile fark:** ADR-0009'da kullanıcı sohbeti BYO modelle masaüstünde çalışır ve maliyet kullanıcıdadır. Sunucu tarafı ajanların LLM maliyeti ise **bize** aittir. Bu yüzden varsayılan `none`'dır ve açılması bütçe kararı gerektirir.
- **Değerlendirme:** her görevin `evalSetRef`'i olur. Bu, kayıtlı girdilerden (fikstür bulguları/metrikler) beklenen bulgu ve önerilere giden bir altın küme setidir. Eval CI'da `NullLlm` ve deterministik stub ile koşar. LLM katmanının kalite değerlendirmesi, LLM kararı verildikten sonra elle tetiklenir ve maliyeti raporlanır.
- **Canlı kalite ölçütleri** (koşu `outputSummary`'sinden türetilen ADR-0017 metrikleri): öneri onay oranı, ret oranı, bulgu yanlış pozitif oranı, koşu başı maliyet birimi, bütçe aşım oranı.
- **Otomatik gölge moda düşürme:** son 30 öneride onay oranı <%50 **veya** yanlış pozitif oranı >%30 olursa görev gölge moda geçer. Gölge modda öneri üretir ama kullanıcıya göstermez.
- **KVKK:**
  - Platform kapsamlı uyum ajanı yalnız kamuya açık dokümanı ve kendi kodumuzu işler. Kişisel veri yoktur, bu yüzden **ilk LLM adayıdır**.
  - Tenant verisi dış bir LLM'e ancak üç koşul **birlikte** sağlanırsa gidebilir: (i) tenant ayarında `aiProcessingConsent = true` (aydınlatma metni hukuk onaylı, Protokol 12), (ii) sağlayıcıyla veri işleme sözleşmesi ve yurt dışı aktarım değerlendirmesi, (iii) gönderim öncesi **maskeleme**: son müşteri adı, adresi, telefonu, e-postası ve T.C./VKN maskelenir, sipariş/paket kimlikleri takma adlaştırılır, serbest metin kırpılır.
  - Maskeleme fonksiyonu, MCP araç çıktılarındaki PII maskelemesiyle (ADR-0009 §5) **aynı** yardımcıdır.

### Karar 4 — Aşamalar: bugün yapılacak temeller ve sonraya bırakılanlar

| Aşama | Kapsam | Ne zaman | Çıkış kapısı (DoD) | Test stratejisi | Geri alma |
|---|---|---|---|---|---|
| **A — Manifesto + bulgu modeli + bekçi v1** (backend, M) | `IntegrationCategory` + `CapabilityKey` + `IntegrationDescriptor` tipleri; 6 manifesto; kategori eşleyicisi (`shipping↔shipment`); tutarlılık testleri (fabrika, `requiredSettings`, rate, `not_supported`→`NOT_SUPPORTED`, `platform_auto`); site↔manifesto iddia testi; `IntegrationFinding` şeması + `FindingService.record/upsert/transition` (dedup, regresyon, TTL, kanıt redaksiyonu); `ResilientHttpClient` başlık kancası (`Deprecation`/`Sunset`) + `contract` seçeneği; zod sözleşmeleri: Trendyol `orders.list` + `claims.list` (en olgun adaptör) ve 4 pazaryerinin sipariş durum eşleyicilerinde `reportUnknownEnum` (önce karakterizasyon, eşleme değişmez); şekil parmak izi yardımcısı; `getCatalog` salt-okunur uç (member) | **bugün** | tsc 0; tüm testler 3× yeşil; 6 manifesto tutarlılık testleri yeşil; bekçinin yanıtı değiştirmediği/fırlatmadığı test edildi (bozuk gövde → iş akışı aynı, yalnız bulgu); redaksiyon testi (PII içeren sahte gövdeden bulguya hiçbir değer sızmaz); dedup/regresyon/TTL testleri; `unknown_enum` testi (yeni Trendyol durumu → `UNAPPROVED` davranışı AYNI + bulgu) | birim + karakterizasyon + sözleşme (kayıtlı fikstür); **gerçek ağ/DB yok** (bulgu sink'i `setSink` deseniyle mock) | bekçi `CONTRACT_GUARD=off`; kancalar no-op; manifesto salt veri |
| **B — Probe (replay) + kaynak izleme v1 + uyum konsolu** (backend M, frontend S-M) | `ProbeRunner` (replay modu CI'da; canlı mod kodu hazır ama `PROBES_LIVE=false`); zod sözleşmelerinin 6 adaptörün ana okuma işlemlerine genişletilmesi; `SourceMonitor` (haftalık, koşullu GET, robots, hız sınırı, metin normalize, hash + ≤2 KB diff; `JobRunRegistry` altında `source-monitor`); `IntegrationComplianceService` (platformAdmin: liste/detay/geçişler/özet); konsol "Entegrasyon uyum" sekmesi (ADR-0015 liste+çekmece); R12 bağlantısı; `mock-contract` script'i | **bugün** (A'dan sonra; konsol ADR-0017 Aşama D konsol iskeletinden sonra) | kaynak izleyici: kayıtlı HTML fikstürleriyle değişti/değişmedi/304/robots-yasak/rate testi, **ağ yok** (HTTP istemcisi enjekte); probe replay 6 entegrasyonda yeşil; konsol Playwright (sentetik fixture, 3 viewport, axe 0 yeni ihlal); OPERATION_POLICY RBAC reddi testi (member → 403); denetim kaydı testi | birim + e2e (mock API) | `SOURCE_MONITOR=off`; sekme gizlenir |
| **B+ — Canlı probe** | platform düzeyi test hesaplarıyla `PROBES_LIVE=true` | **insan kararı** (hesaplar, Protokol 12) | ilk 14 gün gölge (bulgu üretir, alarm yok); yanlış pozitif <%30 | canlı, yalnız worker | env kapatma |
| **C — Ajan iskeleti** (backend M, frontend S) | `AgentTask` kaydı, `runAgent` (JobRunRegistry `runType:'agent'`), bütçe denetimi, `ActionProposals` + onay UI (liste+çekmece), `LlmPort` + `NullLlm`, `AGENTS_ENABLED`/görev bayrağı/`agents` özelliği, `source:'agent'` denetimi, ADR-0019 `agentAllowed` denetimi; ilk görev: **entegrasyon uyumu (deterministik)**: bulgu özetleri + manuel tur hatırlatması + doc diff → triage önerisi | **eşik:** şunlardan İLKİ: (i) ADR-0009 MCP yazma araçlarının açılması (ortak onay kuyruğu gerekir), (ii) Karar 3d #1 eşiği, (iii) ≥10 ödeyen tenant | bütçe aşımı/kill-switch/denied-anomali testleri; tenant izolasyon testi (A kapsamlı koşu B verisine dokunamaz); onay yalnız UI kanalından; yürütme onaylayan kimliğiyle; eval seti CI'da yeşil | birim + karakterizasyon; LLM yok | `AGENTS_ENABLED=false` |
| **D — Ajanları açma** | Karar 3d envanterinden eşiği gelen görev(ler); LLM gerekiyorsa sağlayıcı | **eşik:** her görevin kendi eşiği + LLM için insan kararı | görev başına: 14 gün gölge mod; onay oranı ≥%50; yanlış pozitif ≤%30; koşu başı maliyet bütçe içinde | eval + gölge | görev bayrağı |

**Bugün yapılacak ucuz temeller (net liste, A + B):**
1. Kategori enum'u + `shipping↔shipment` eşleyicisi.
2. 6 adaptör için `descriptor.ts` (yetenek, kapsam sınırı, rate, doküman URL, mock bilgisi).
3. Manifesto tutarlılık testleri + site iddia testi (dürüstlük ilkesinin otomatik bekçisi).
4. `IntegrationFinding` modeli + servis (dedup, yaşam döngüsü, redaksiyon, TTL).
5. `ResilientHttpClient`'a `Deprecation/Sunset` başlık kancası + `contract` seçeneği.
6. Zod sözleşmeleri (Trendyol sipariş/iade önce, sonra 6 adaptörün ana okumaları) + şekil parmak izi.
7. 4 pazaryeri durum eşleyicisinde `reportUnknownEnum` (davranış değişmeden).
8. Kayıtlı fikstürlerle probe replay + sözleşme testleri.
9. Haftalık kaynak izleyici (robots, hız sınırı, yalnız `auto` kaynaklar).
10. Admin "Entegrasyon uyum" sekmesi + R12 alarm bağlantısı.
11. `getCatalog` ucu (frontend kapsam rozetleri buradan beslenir; kargo/e-fatura formları "yakında").

**Sonraya (eşikli):** canlı probe (insan: hesaplar), ajan iskeleti (C), LLM (insan: sağlayıcı/bütçe), kargo/e-fatura adaptörleri (insan: sağlayıcı), OpenAPI tabanlı yapısal diff (resmi OpenAPI bulunursa), site verisinin manifestodan üretilmesi (≥12 manifesto).

**ADR-0017 bağımlılığı:** Aşama A, 0017 Aşama A'dan (log/JobRunRegistry) **bağımsız** başlayabilir. `FindingService` kendi sink'iyle yazar. Metrik serisi ve R12 çağrısı, 0017'nin `MetricsRegistry`/`raiseAlert` arayüzleri gelene kadar no-op adaptör arkasında durur. Aşama B'nin konsol sekmesi 0017 konsol iskeletini, kaynak izleyici de `JobRunRegistry`'yi bekler.

**Riskler:**
1. **Bekçinin iş akışını bozması.** Önlem: yalnız gözlem, try/catch ile yalıtım (kendi hatası `ErrorEvents`'e gider), `CONTRACT_GUARD=off`.
2. **Yanlış pozitif gürültüsü.** Önlem: onay kapısı, `doc`=info, gölge mod.
3. **Kaynak izleyicinin ToS/robots ihlali.** Önlem: bağlayıcı sınırlar, manual işaretleme.
4. **Manifestonun bayatlaması.** Önlem: tutarlılık testleri CI'da kırmızıya döner.
5. **Sessiz enum raporlamasının PII sızdırması.** Önlem: yalnız ≤64 karakterlik kod benzeri değer, desen süzgeci.

Protokol 12 sınırları: ücretli hesap, sağlayıcı sözleşmesi, platform test hesabı, LLM, tenant rıza metni. Bunların hiçbiri A/B'de gerekmez.

### Karar 5 — PLATFORM_BASELINE uyumu

| Satır | Durum | Not |
|---|---|---|
| A1 Gözlemlenebilirlik | **Uygulanır** | bekçi metrikleri + bulgular ADR-0017 kayıt defteri/konsolu üzerinden; `console.*` yok |
| A2 Hata yönetimi | **Uygulanır** | bekçi hata üretmez; drift gerçek hataya dönüşürse ADR-0006 `IntegrationError`; sessiz enum düşüşü (B7) görünür kılınır |
| A3 Dayanıklılık | **Uygulanır** | drift kesiciyi açmaz; probe bütçeli; yeni portlarda idempotency + `UNKNOWN_OUTCOME` |
| A4 Zamanlanmış işler | **Uygulanır** | probe, kaynak izleyici ve ajanlar `JobRunRegistry` altında (stale/hung/overlap) |
| A5 Yaşam döngüsü | Uygulanır (kısmi) | `PROBES_LIVE`+mock çakışması fail-fast; yeni iş döngüleri graceful shutdown'a kayıtlı |
| A7 Kapasite | **Uygulanır** | örnekleme, dizi eleman sınırı, p95 <5 ms hedefi, TTL, kardinalite (tenantId etiketsiz) |
| A8 Sürüm/göç | **Uygulanır** | `adapterVersion` semver; `shipment` göçü yapılmaz (eşleyici) |
| B1 Kimlik/yetki | **Uygulanır** | uyum uçları platformAdmin + OPERATION_POLICY; ajan sentetik ilke, en fazla member-okuma |
| B2 Tenant izolasyonu | **Uygulanır** | probe tenant kimliği kullanmaz; platform ajanı tenant DB'sine erişmez; tenant koşusu tek tenant |
| B3 Girdi doğrulama | **Uygulanır** | zod sözleşmeleri; `ActionProposal.input` şema doğrulamalı |
| B4 Sır yönetimi | **Uygulanır** | kanıtta değer yok; probe kimlikleri yalnız env; ajan kimlik bilgisi görmez |
| B7 Denetim izi | **Uygulanır** | bulgu geçişleri, öneri kararları, ajan araç çağrıları `AuditLogs`'a |
| B8 KVKK | **Uygulanır** | maskeleme, rıza (`aiProcessingConsent`), amaç sınırlaması (tenant kimliğiyle probe yok), TTL |
| B6 Kötüye kullanım | Uygulanır | kaynak izleyici hız sınırı; ajan bütçesi |
| C2 Durumlar | Uygulanır | konsol: yükleniyor/boş/hata/stale |
| C7 Mikro-kopya/dürüstlük | **Uygulanır** | manifesto tek kaynak; site iddia testi |
| C10 Bildirim | Uygulanır | R12 → ADR-0017 kanalları; tenant'a yalnız triage sonrası |
| D1 Test piramidi | **Uygulanır** | sözleşme katmanı genişler; gerçek ağ/DB yok |
| D4 Yapılandırma | Uygulanır | `CONTRACT_GUARD`, `PROBES_LIVE`, `SOURCE_MONITOR`, `AGENTS_ENABLED` → ADR-0017 `config/env.ts` şemasına |
| D5 API sözleşmesi | Uygulanır | `getCatalog` ve uyum uçları sayfalı/tutarlı zarf |
| E1 Plan/kota | **Uygulanır** | `agents` plan özelliği + EntitlementService |
| E3 Entegrasyon dürüstlüğü | **Uygulanır (çekirdek)** | `not_supported`→`NOT_SUPPORTED` testi; kargo/e-fatura "yakında"; `limited`+not |
| E5 Destek araçları | Uygulanır | uyum konsolu, etkilenen tenant listesi |
| E6 Genişleme noktaları | **Uygulanır** | yetenek/ajan izin boyutu ADR-0019 kaydında; ortak onay kuyruğu; `IIntegrationAdapter` + kategori portları |
| B5, B9, B10, C1, C3-C6, C8-C9, D2-D3, D6-D9, E2, E4, E7 | Uygulanmaz / genel | bu ADR yeni bir web yüzeyi/bağımlılık/oturum modeli getirmiyor; konsol ekranı ADR-0015 şablonuyla genel çıtaya tabi |

### Karar 6 — Açık sorular (yalnız insan kararı; hepsinin varsayılanı var)
1. **Kargo stratejisi ve ilk firma(lar)** (K1/K2/K3, kategori belgesi §7.1). *Varsayılan:* port yazılır, adaptör yazılmaz. Formlar "yakında" olarak gösterilir.
2. **E-fatura entegratörü ve iş modeli** (BYO hesap mı, bayilik mi; §7.2). *Varsayılan:* adaptör yok. Manuel yol sürer. Formlar "yakında" (bugün kaydetmeyen `EInvoiceView` dürüstleşir).
3. **Platform düzeyi test/sandbox hesapları** (her pazaryeri için; başvuru ve olası ücret). *Varsayılan:* probe yalnız replay modunda çalışır.
4. **LLM sağlayıcısı, aylık bütçe tavanı, veri işleme sözleşmesi.** *Varsayılan:* `NullLlm`. İlk aday, tenant verisi içermeyen uyum ajanıdır.
5. **Tenant AI rıza/aydınlatma metni** (hukuk). *Varsayılan:* `aiProcessingConsent` alanı `false`. Tenant verisi dış LLM'e gitmez.

İnsan kararı gerektirmeyen noktalar ve varsayılanları:
- probe ve kaynak izleme sıklıkları (günlük/haftalık),
- bulgu şiddet tablosu, onay kapısı sayıları, TTL 365 gün,
- `ActionProposal` süresi 72 saat,
- gölge mod ölçütleri.

Bunlar 30 günlük gözlemden sonra ayarlanır.

## Gerekçe
- **Maliyet bilinci:**
  - Yeni servis, yeni süreç, ücretli hesap veya LLM gerekmez.
  - Tek yeni bağımlılık `zod`'dur ve o da ADR-0017'den gelir.
  - Pasif bekçi, zaten var olan tek boğaz noktasını (`ResilientHttpClient`, B8) ve ADR-0017 kayıt defterini kullanır, ek dış çağrı yapmaz.
  - Kaynak izleme haftada birkaç düzine koşullu GET'tir.
  - 1 tenant ve 6 adaptör ölçeğinde toplam veri hacmi ihmal edilebilir: ayda onlarca bulgu ve birkaç düzine kaynak dokümanı.
- **Değer, ajan gelmeden başlar:**
  - Manifesto "UI'da var, backend'de yok" sınıfı dürüstlük hatalarını (B1/B2, EInvoiceView) test ile kilitler.
  - `unknown_enum`, bugün var olan sessiz veri bozulmasını (B7) görünür yapar.
  - Kaynak izleme B3'teki gibi bir sapmayı elle turdan önce yakalayabilir.
- **Ajan-hazır olmanın en ucuz yolu doğru veri sözleşmeleridir.**
  - Ajanın girdisi (bulgular, koşular, metrikler) ve çıktısı (bulgu, öneri) bugünden tek modelde durur.
  - Araç yüzeyi (ADR-0019) ve onay kuyruğu (MCP ile ortak) çoğaltılmaz.
  - Ajan geldiğinde yazılacak şey yalnızca "çalıştırıcı + görev" olur. Veri göçü, ikinci konsol ya da ikinci onay akışı gerekmez.
- **Güvenlik:** "ajan asla doğrudan yazmaz, tenant kimliği yalnız kapsamdan gelir, dış içerik veridir" değişmezleri ADR-0009'un MCP ilkeleriyle birebir aynıdır. Bu sayede tek bir güvenlik modeli olur.
- **Yeniden yazım yok:** bu ADR hiçbir modülü yeniden yazmaz. Bekçi ve kancalar ekleme niteliğindedir. Eşleyicilere yapılan dokunuşlar önce karakterizasyon testine bağlıdır (Protokol 13).

## Maliyet/Ölçek Notu
- **Ek maliyet:**
  - servis 0, bağımlılık 0 (zod ADR-0017'den);
  - Mongo'da yeni koleksiyonlar: `IntegrationFindings` (< 1 MB/yıl bu ölçekte), `SourceSnapshots` (URL başına 1 doküman, < 100 doküman), `ActionProposals` (Aşama C, 72 sa süre + kapalılar 180 gün TTL);
  - `JobRuns` koşuları ADR-0017 bütçesi içinde;
  - CPU: örneklenmiş doğrulama (10 dk'da bir + değişimde).
  - Operasyon yükü: ilk 30 gün bulgu triage'ı (tahmini haftada < 30 dk), çeyreklik manuel doğrulama turu (≈ 2-3 saat).
- **Yeniden değerlendirme eşikleri (sayısal):**
  - Bekçi ek süresi p95 > 5 ms **veya** worker CPU'sunun > %2'si → örnekleme aralığı 30 dk'ya çıkar, dizi sınırı 20'ye iner.
  - Bulgu yanlış pozitif oranı 30 günde > %30 → onay kapısı sıkılaştırılır (≥3 tenant / ≥60 dk).
  - İzlenen kaynak > 100 URL **veya** entegrasyon sayısı ≥ 15 → kaynak izleme ve probe'lar ayrı bir kuyruk/işçiye alınır (ADR-0005 kuyruk merdiveni).
  - Entegrasyon sayısı ≥ 25 → ücretli sözleşme/izleme araçları yeniden değerlendirilir (Protokol 12).
  - Manifesto ≥ 12 → site verisi manifestodan üretilir.
  - Ajan iskeleti (C): MCP yazma araçları açılırsa **veya** Karar 3d #1 eşiği **veya** ≥ 10 ödeyen tenant (hangisi önce gelirse).
  - LLM'li ajan koşu başı maliyeti, görevin aylık bütçesinin > %120'si 2 hafta boyunca → görev gölge moda düşer.
  - Görev başına ajan açma eşikleri Karar 3d tablosundadır.

## Etki Alanı
- **Backend:**
  - yeni `src/integration/catalog/` (tipler, `IntegrationDescriptorRegistry`, kategori eşleyicisi),
  - `modules/*/*/descriptor.ts` (6),
  - `modules/*/*/contracts/*.ts`,
  - yeni `src/integration/compliance/` (`ContractGuard`, `ShapeFingerprint`, `FindingService`, `ProbeRunner`, `SourceMonitor`),
  - `modules/common/http/ResilientHttpClient.ts` (başlık kancası + `contract` seçeneği; davranış değişmez),
  - `modules/marketplace/*/transformers/OrderTransformer.ts` (`reportUnknownEnum`, karakterizasyon önce),
  - `modules/IntegrationFactory.ts` (Aşama sonrası: kargo/e-fatura girişleri — adaptör gelince),
  - `api/services/integration-service.ts` veya yeni `integration-catalog-service.ts` (`getCatalog`),
  - yeni `api/services/integration-compliance-service.ts`,
  - `api/operationPolicy.ts` + `docs/OPERATION_POLICY.md`,
  - ApplicationDB şemaları (`IntegrationFindings`, `SourceSnapshots`; C'de `ActionProposals`, `AgentTaskState`),
  - Aşama C: yeni `src/agents/` (görev kaydı, `runAgent`, `LlmPort`/`NullLlm`), `services/billing/EntitlementService.ts` (`agents` özelliği).

  Yerleşim ADR-0016'ya tabidir.
- **Testler:**
  - `backend/tests/contract/**` (fikstürler, manifesto tutarlılığı, site iddia testi),
  - `tests/characterization/**` (durum eşleyicileri),
  - `Trendyol.schema.test.ts` (C20 kapanışında katılaşır).
- **Frontend:**
  - entegrasyon ekranları (`views/secure/integrations/*`: kapsam rozetleri, kargo/e-fatura "yakında"),
  - admin konsolu "Entegrasyon uyum" sekmesi,
  - Aşama C: onay kuyruğu ekranı.
- **Site:** `site/src/data/integrations.ts` (manifestoyla test bağı).
- **Mock:** `mockserver/` (sözleşme senkron akışı, C20).
- **Belgeler:**
  - `docs/INTEGRATION_CATEGORY_MODEL.md` (yeni),
  - `docs/research/official-api-reference-sources.md` (manifestoya taşınır, belge referans olarak kalır),
  - `INTEGRATIONS_REGISTRY.md` (manifestoyu izler),
  - `BACKLOG.md` PLANNED "drift tespit sistemi" kalemi bu ADR'ye bağlanır (orkestratör).
- **İlişkili ADR'ler:** 0004, 0005, 0006, 0008, 0009, 0014, 0015, 0016 (yerleşim), 0017 (izleme altyapısı), 0019 (yetenek kaydı).

## Ek — Diğer yatay işlevler için ajan-uygunluk değerlendirme ölçütü

Karar 3d envanterine yeni bir işlev eklenmeden önce aşağıdaki sorular sırayla yanıtlanır. İlk "hayır"da işlev ajan **olmaz**, yanında belirtilen biçimde çözülür.

1. **Deterministik bir kural yetiyor mu?** Eşik, eşleşme veya fark hesabı yeterliyse → ajan değil, `JobRunRegistry` altında bir iş + ADR-0017 alarmı. Ajan ancak yapılandırılmamış girdiyi yorumlama (doküman diff'i, müşteri metni) veya çok kaynaklı gerekçelendirme gerektiğinde değer katar.
2. **Hacim var mı?** Görev, tenant'lar toplamında haftada ≥ 2 saat insan zamanı tüketmiyorsa → konsol listesi/filtre yeterlidir.
3. **Sinyal ve araç hazır mı?** Gerekli manifesto yeteneği `supported` ve ADR-0019'da `agentAllowed` bir okuma aracı yoksa → önce yetenek yazılır.
4. **Eylem geri alınabilir mi, riski ne?** Geri alınamaz veya yasal (fatura, iptal, toplu fiyat) ise → yalnız `propose` + `destructive` risk sınıfı + ikinci onay. Otomatik yürütme hiçbir koşulda yoktur.
5. **Değerlendirilebilir mi?** Kayıtlı girdilerden beklenen çıktıyı tanımlayan en az 20 örnekli bir altın küme kurulamıyorsa → ajan açılmaz (kalitesi ölçülemez).
6. **Veri hassasiyeti uygun mu?** Kişisel veri içeriyor ve LLM gerektiriyorsa → Karar 3e'nin üç koşulu (rıza, veri işleme sözleşmesi, maskeleme) sağlanmadan açılmaz. Önce LLM'siz deterministik sürüm çalışır.
7. **Maliyet/değer:** tahmini aylık koşu maliyeti (LLM dahil), kazandırılan insan saatinin parasal karşılığının %20'sini aşıyorsa → erteleme.

Soruların tamamı "evet" ise görev Karar 3d tablosuna **öncelik ve sayısal geçiş eşiğiyle** eklenir ve Aşama D kapısından (14 gün gölge mod) geçer.

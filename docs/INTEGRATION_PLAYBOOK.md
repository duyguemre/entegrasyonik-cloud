# Yeni Entegrasyon Ekleme Playbook'u (pazaryeri · e-ticaret · ERP · e-fatura · kargo)

**Sürüm:** 1.3.0 · **Tarih:** 2026-09-30 · **Sahibi:** Baş Mimar · **Karar:** `docs/adr/0033-entegrasyon-ekleme-standardi-ve-adaptor-taban-sozlesmesi.md`

Bu belge yeni bir entegrasyon eklemenin **tek** kaynağıdır. Her yeni entegrasyon bu adımları sırayla izler. Yeni desen icat edilmez;
bir ihtiyaç buradaki kalıplara uymuyorsa önce bu belge (ve gerekiyorsa bir ADR) güncellenir, sonra kod yazılır.

Ölçek ilkesi (overengineering yok): bu playbook yalnız mevcut 6 adaptörde **en az iki kez** tekrarlanmış ya da somut hata üretmiş
şeyleri zorunlu kılar. Pazaryerine özgü davranış zorla genelleştirilmez; adaptörün kendi dosyasında kalır.

Bağlı belgeler (burada tekrar edilmez, yalnız referans verilir):
`docs/INTEGRATION_CATEGORY_MODEL.md` (kategori/yetenek/port taslakları) · `INTEGRATIONS_REGISTRY.md` (kanıtlı envanter) ·
`docs/CAPABILITY_CHECKLIST.md` (yetenek kaydı, ADR-0019) · `docs/PLATFORM_BASELINE.md` (ortak çıta) · `docs/TESTING.md` ·
`docs/ERROR_CODES.md` · `docs/API_IDEMPOTENCY.md` · `docs/DATA_MODEL_CONVENTIONS.md` · `docs/research/official-api-reference-sources.md`.

---

## İçindekiler

0. Hızlı yol (özet akış)
1. Ön keşif (araştırma şablonu)
2. Kategori bazlı zorunlu yetenek matrisi
3. Dosya yerleşimi, adlandırma ve dokunma noktaları
4. Zorunlu mühendislik kuralları (Definition of Done)
5. Test seti ve uyumluluk (conformance) kiti
6. Mock sunucu, canlıya geçiş, izleme, geri alma
7. Süre tahmini kalıpları ve tipik tuzaklar
8. Güncel tutma kuralı ve değişiklik günlüğü
- Ek A: Entegrasyon envanteri (bu belgeye bağlı)
- Ek B: Aday entegrasyonlar ön sınıflandırması

---

## 0. Hızlı yol (özet akış)

| # | Adım | Çıktı | Kapı (geçmeden sonraki adıma geçilmez) |
|---|---|---|---|
| 1 | Ön keşif (§1) | `docs/research/INTEGRATION_<KOD>.md` | Şablonun tüm "zorunlu" satırları dolu; bilinmeyenler `DOĞRULANMADI` diye işaretli |
| 2 | Kapsam kararı (§2) | Yetenek matrisi satırı (descriptor taslağı) | Zorunlu yeteneklerin her biri `supported` / `limited` / `platform_auto` / gerekçeli `not_supported` |
| 3 | İskelet (§3) | `npm run integration:new -- --kind <marketplace\|ecommerce\|erp\|einvoice\|shipping> --code <kod> [--name "<Ad>"]` (önce `--dry-run`; INT-08) | Dosyalar üretildi + ekrana basılan parçacıklar (§3.3) yapıştırıldı; `npm run test:module -- <kod>` çalışıyor (testler kırmızı olabilir) |
| 4 | Sözleşmeler + mock (§4.2, §6.1) | `contracts/*.ts` zod şemaları + mock/fixture | Fixture'lar resmi doküman örneğinden; kaynak satırı fixture başında |
| 5 | Connector/service/transformer | Kod | Conformance kiti yeşil (§5.2) |
| 6 | Kayıtlar (§3.3) | Fabrika, host izin listesi, ayar kataloğu, UI formu, yetenek kaydı | Statik playbook uyum testi yeşil (§8.3) |
| 7 | Canlıya geçiş (§6.2) | sandbox → pilot tenant → genel | Kontrol listesi tamam; kill-switch denendi |
| 8 | Belge | `INTEGRATIONS_REGISTRY.md` bölümü + bu belgenin Ek A satırı + değişiklik günlüğü | Aynı PR'da (§8) |

**İskelet üretici (v1.3.0, INT-08; `backend/dev-tools/integration-new.js`, bağımlılıksız Node, ağ/DB yok):**
- Kural: YALNIZ yeni dosya üretir; mevcut hiçbir TS dosyasına dokunmaz; var olan kod/klasör/dosyayı reddeder (`--force` YOK); `--dry-run` yalnız listeler; `--kind cargo` = `shipping`. Kod: `^[a-z][a-z0-9]{1,23}$` ve `ADAPTER_KEYS`'te olmayan.
- Üretir (`modules/<kategori>/<kod>/`): `constants.ts`, `descriptor.ts` (kategori Z yetenekleri `not_supported` + TODO, `status:'roadmap'`), `index.ts` (marketplace/ecommerce/erp: tüm `IPlatform` metotları `NOT_SUPPORTED` stub'ı + `testConnection` probe iskeleti; einvoice/shipping: port henüz yok, sade cephe), `limits.ts`, `readme.md`, `services/Service.ts` (`AdapterHttpService`, `authConfig` TODO), `api/*Connector.ts` (`paginate` + `observeResponseSchema`), `transformers/*Transformer.ts`, `contracts/index.ts` (boş zod şemaları + `CONTRACT_IDS`); ayrıca `tests/conformance/<kod>.conformance.test.ts` ve `docs/research/INTEGRATION_<KOD>.md` (§1 şablonu). Fixture dizini, transformer test iskeleti ve mock sunucu rotası üretilmez (ilk gerçek fixture ile elle açılır).
- Conformance iskeleti "henüz kayıtlı değil" modundadır: kod `ADAPTER_KEYS`'te yokken yalnız `it.todo` koşar (`KNOWN_OPEN`'a EKLENMEZ: ratchet yeni adaptörün açıkla gelmesini yasaklar); `ADAPTER_KEYS` satırı eklenince kit GERÇEKTEN koşar ve spec TODO'ları doldurulana dek kırmızıdır.
- Ekrana basar (yapıştırılır, otomatik eklenmez): §3.3 satır 4, 3, 1, 2, 8, 9, 10, 13, 15 için hazır parçacıklar; 11, 12, 14 koşullu; 16-22 (bulut önyüz/site/belge) kontrol listesi; ardından sonraki adımlar. Eksik kalanı statik testler (`adapterKeys` + `integrationPlaybook`) ADIYLA raporlar.
- Test: `tests/unit/dev-tools/integrationNew.test.ts` (5 kategori üretimi + `tsc` ile derleme, dry-run yazmıyor, var olanı reddediyor).

Adım 1-2 bir insan kararı içerebilir (sözleşme/ücret, hesap açma, canlı kimlik bilgisi): Protokol 12 kapsamındadır, fabrikayı durdurmaz,
ama canlı hesap olmadan adaptör `status: 'limited'` + `verification.liveApi: false` ile yayınlanır.

---

## 1. Ön keşif (araştırma şablonu)

Her yeni entegrasyon için `docs/research/INTEGRATION_<KOD>.md` (KOD = büyük harf fabrika kodu, ör. `INTEGRATION_CICEKSEPETI.md`) açılır.
İskelet üretici dosyayı bu şablonla oluşturur. Yalnız resmi kaynak "doğrulandı" sayılır; blog/forum/resmi olmayan GitHub
kaynağı `official:false` diye işaretlenir (ör. PTT: `official-api-reference-sources.md`).

```markdown
# INTEGRATION_<KOD> — ön keşif (<tarih>, <araştıran>)

## 0. Özet kararı
- Kategori: marketplace | ecommerce | erp | einvoice | shipping
- Tahmini boy: S | M | L (§7.1 ölçütleriyle)       - Önerilen ilk kapsam: (yetenek listesi)
- Engelleyen insan kararı var mı? (hesap/sözleşme/ücret/entegratör başvurusu)

## 1. Resmi kaynaklar                      [ZORUNLU]
| URL | tür (reference/changelog/announcements/openapi/status) | resmi mi | izleme (auto/manual/off) | erişim notu |

## 2. Kimlik doğrulama                     [ZORUNLU]
- Tür: basic | api_key_header | oauth2_client_credentials | oauth2_authorization_code | custom (HMAC imza vb.)
- Tenant'tan alınacak alanlar (ad, anlam, sır mı?)  — ör. SELLERID (sır değil), APIKEY (sır), APISECRET (sır)
- Token ömrü / yenileme / iptal; zorunlu başlıklar (ör. User-Agent biçimi)
- Entegratör (bizim) kaydı gerekiyor mu? (entegratör kodu, onay süreci, süre)

## 3. Ortamlar                             [ZORUNLU]
- Prod host(lar), sandbox/stage host(lar), tenant'a özgü host var mı (ör. `<mağaza>.myshopify.com`, self-hosted)?
- Sandbox var mı, nasıl alınır, sandbox verisi gerçekçi mi?

## 4. Oran limitleri ve servis grupları   [ZORUNLU]
| Servis grubu (ürün yazma, stok/fiyat, sipariş okuma, …) | limit | pencere | kaynak | doğrulandı mı |
- 429 yanıtı: Retry-After başlığı var mı? Aynı gövde tekrar kısıtı var mı (Trendyol 15 dk)?

## 5. Sayfalama ve pencere                 [ZORUNLU]
- Tür: page+size | offset+limit | cursor/nextPageToken | tarih penceresi | yok
- Toplam sinyali (totalPages/totalElements/hasMore) var mı? Sayfa/pencere üst sınırları?
- Sipariş sorgusunda en büyük tarih aralığı, sıralama anahtarı, "son değişen" filtresi var mı?

## 6. Webhook / olay                       [ZORUNLU]
- Var/yok; imza yöntemi (HMAC başlığı, basic, URL token); tekrar gönderim ve sıra garantisi; hangi olaylar

## 7. İş akışları                          [kategoriye göre ZORUNLU, §2]
- Ürün: oluşturma senkron mu asenkron (batch/trackingId) mı? Onay süreci? Varyant modeli?
- Stok/fiyat: ayrı uç mu, toplu mu, gecikme?
- Sipariş: durum listesi (tam enum), paket/satır kimlikleri, iptal/kısmi iptal
- İade/talep: durumlar, onay/ret
- Fatura: fatura linki/dosyası pazaryerine nasıl bildirilir?
- Kargo: pazaryeri anlaşmalı kargo mu, satıcı kargo mu; takip no bildirimi
- (e-fatura) mükellef sorgusu, belge türleri, durum/iptal süreleri   (kargo) gönderi/etiket/takip/iptal/iade

## 8. Kategori / marka / öznitelik modeli  [marketplace + ecommerce ZORUNLU]
- Kategori ağacı derinliği, yaprak zorunlu mu, öznitelik türleri (seçmeli/serbest/çoklu), varyant öznitelikleri, marka kimliği

## 9. Hata modeli                          [ZORUNLU]
- Hata gövdesi biçimi; iş hatası HTTP 200 ile mi dönüyor (N11 SOAP gibi)?; bilinen kodlar -> IntegrationError eşlemesi taslağı

## 10. Sürümleme ve kapanışlar             [ZORUNLU]
- Güncel sürüm, bilinen kapanış/brownout tarihleri, changelog/duyuru kanalı (descriptor.api.docs + knownDeprecatedEndpoints)

## 11. Hukuki / KVKK / ticari notlar       [ZORUNLU]
- API kullanım koşulları (veri saklama, önbellek süresi, yeniden satış yasağı), maskelenmiş PII alanları, entegratör ücreti

## 12. Açık sorular / DOĞRULANMADI listesi
```

Kural: 12. bölüm boş değilse ilgili yetenek descriptor'da `limited` + `note` ile işaretlenir ve `rateLimits.verified:false` kalır
(Pazarama emsali: panel belgesi erişilemedi, `ratePerMin` bilinçli ayarlanmadı).

---

## 2. Kategori bazlı zorunlu yetenek matrisi

Yetenek anahtarları `backend/src/integration/catalog/types.ts::CapabilityKey`; düzeyler `supported | limited | platform_auto | not_supported`.
**Z** = zorunlu (ilk sürümde `supported`/`limited`/`platform_auto` olmalı), **Z\*** = zorunlu ama platform desteklemiyorsa gerekçeli
`not_supported` kabul (manifestoda açık yazılır, metot `IntegrationError('NOT_SUPPORTED')` fırlatır), **O** = opsiyonel, **–** = uygulanmaz.

| Yetenek (metotlar) | Pazaryeri | E-ticaret | ERP | E-fatura | Kargo |
|---|---|---|---|---|---|
| `testConnection()` (yan etkisiz en ucuz çağrı) | Z | Z | Z | Z | Z |
| `products` (`streamProducts`, `transferProducts`, `checkBatchProduct`, `updateProduct`) | Z (aktarım + batch durumu) | Z (okuma; yazma yönü kararı §2.1) | Z (okuma: ana veri) | – | – |
| `stockPrice` (`updateProductStock`, `updateProductPrice`) | Z | Z | Z\* (ERP stok kaynağıysa okuma, §2.1) | – | – |
| `orders` (`retrieveOrders`, tarih penceresi + tam sayfalama) | Z | Z | O (ERP'ye sipariş yazma: `accountingSync`) | – | – |
| `orderActions` (`approveOrder`, `rejectOrder`) | Z\* (çoğu pazaryerinde `platform_auto`) | O | – | – | – |
| `shippingNotice` (`sendOrderShipping`) | Z\* | Z\* (fulfillment + takip no) | – | – | – |
| `invoiceNotice` (`sendOrderInvoice`) | Z\* | O | – | – | – |
| `returns` (`retrieveClaims`; `approveClaim`/`rejectClaim` O) | Z (okuma) | O | – | – | – |
| `categories` (`retrieveCategories`, `…Attributes`, `…AttributeValues`, `retrieveBrands`) | Z | Z\* | O | – | – |
| `questions` (`retrieveMessages`, `answerMessage`) | O | – | – | – | – |
| `finance` (`retrieveFinancials`, …) | O | – | O | – | – |
| `accountingSync` | – | – | O | – | – |
| `taxpayerLookup` | – | – | O (F2: ERP e-fatura) | Z | – |
| `einvoiceIssue` / `earchiveIssue` (en az biri) | – | – | O (F2) | Z | – |
| `documentStatus`, `documentPdf` | – | – | – | Z | – |
| `documentCancel`, `edespatchIssue` | – | – | – | O | – |
| `shipmentCreate`, `label`, `tracking` | – | – | – | – | Z |
| `shipmentCancel`, `rates`, `returnShipment` | – | – | – | – | O |
| Webhook alma | O (varsa tercih) | O (varsa tercih) | O | O | O (takip olayı) |

Port (arayüz) eşlemesi:
- Pazaryeri / e-ticaret / ERP: bugünkü `IPlatform` (`backend/src/interfaces/platforms/index.ts`). **Bölünmez** (13 çağıran, kategori belgesi §5).
  `testConnection()` IPlatform'a **opsiyonel** metot olarak eklenir (ADR-0033); yeni adaptörler için zorunlu.
- E-fatura: `IEInvoiceProvider`, kargo: `IShippingProvider` — taslaklar `INTEGRATION_CATEGORY_MODEL.md` §5.1/§5.2. İlk gerçek adaptörle
  birlikte `IntegrationFactory.getEInvoiceProvider/getShippingProvider` açılır (bugün yok; açılış ilk adaptörün PR'ının parçasıdır).
- Sosyal kanal (WhatsApp/Instagram): `ChannelAdapter` (ADR-0029, BACKLOG WA-02/SOC-00). Ödeme: `PaymentProvider` (ADR-0008).
  Bu iki aile bu playbook'un §3-§6 kurallarına (HTTP, sır, mock, conformance, canlıya geçiş) uyar; yetenek matrisi kendi ADR'lerindedir.

### 2.1 Yön ve "tek yazar" kararı (her e-ticaret/ERP entegrasyonunda yazılı olmalı)
Her kaynak alan için tek yazar vardır (ADR-0004): ürün ana verisi, stok, fiyat, sipariş için
`kaynak: entegrasyonik | platform` kararı ön keşif §0'a ve descriptor `limitations`'a yazılır. ERP stok kaynağıysa stok ERP'den okunur ve
`markStockDirty` üzerinden kanala yayılır (X2); ERP'ye stok **yazılmaz**. İki yönlü aynı alan senkronu yasaktır (döngü + aşırı satış riski).

---

## 3. Dosya yerleşimi, adlandırma ve dokunma noktaları

### 3.1 Modül dizini (kod = küçük harf, harf+rakam, tire yok; ör. `ciceksepeti`, `pttavm`, `amazontr`)

```
backend/src/integration/modules/<kategori>/<kod>/
  index.ts                 IPlatform facade (ya da IShippingProvider / IEInvoiceProvider); yalnız yönlendirme, iş mantığı YOK
  constants.ts             integrationCode, integrationName, requiredSettings, sabit enum'lar
  descriptor.ts            IntegrationDescriptor (ADR-0018) — kodla sürümlenir, DB'ye yazılmaz
  limits.ts                servis grubu adları + varsayılan limitler (yalnız platform servis grubu tanımlıyorsa; X1)
  services/
    Service.ts             AdapterHttpService'ten türer (ADR-0033): authConfig(), baseUrlFor(), mockRewrite
    <Alan>Service.ts       Product/Order/Category/Claim/... iş mantığı (connector çağırır, transformer uygular)
  api/                     (opsiyonel; pazaryerlerinde) <Alan>Connector.ts: YALNIZ URL + HTTP çağrısı + sözleşme etiketi
  transformers/
    <Alan>Transformer.ts   saf fonksiyonlar: platform JSON <-> iç model (IProduct, IOrder, IInternalResult ...)
  contracts/
    <alan>.<işlem>.ts      zod yanıt şeması (.passthrough()), kimlik `<kod>.<alan>.<işlem>@v<n>` (ör. `ciceksepeti.orders.list@v1`)
    index.ts               sözleşme kimlikleri dizisi (descriptor.contracts buradan beslenir)
  mapping/                 (yalnız gerekiyorsa) kategori/marka/öznitelik eşleme yardımcıları; ortak çözümleyici ADR-0025 attributeResolver
  webhook.ts               (yalnız webhook varsa) verify(headers, rawBody, settings) + parse(body) -> sinyal listesi
  readme.md                platforma özgü notlar (tuzaklar, alan anlamları); playbook'u TEKRAR ETMEZ
```

Adlandırma: sınıf/dosya `PascalCase` + görev eki (`OrderConnector`, `OrderService`, `OrderTransformer`); tek dosyada çoklu mapper
yapılmaz (N11 `Mappers.ts` istisnası tarihsel). Olay (eventLog) adları `UPPER_SNAKE`, önek `<KOD>_` (ör. `CICEKSEPETI_ORDER_WINDOW_OVERFLOW`);
ortak olaylar (`API_SCHEMA_DRIFT`, `OUTBOUND_HOST_NOT_ALLOWED`, `MOCK_ENDPOINT_NOT_MOCKED`) öneksiz kalır.

### 3.2 Test ve mock dizinleri

```
backend/tests/conformance/<kod>.conformance.test.ts        conformance kiti bağlantısı (§5.2) — ZORUNLU
backend/tests/characterization/transformers/<Kod>/*.test.ts  dönüştürücü birim/karakterizasyon testleri — ZORUNLU
backend/tests/contract/<kod>/*.contract.test.ts             sözleşme fixture testleri (zod şema × resmi örnek)
backend/tests/fixtures/<kod>/*.json                         resmi doküman örneklerinden fixture (ilk satırda kaynak URL + tarih, `_source` alanı)
mockserver/backend/src/platforms/<kod>/                     mock sunucu rotaları (proje kökünde; bulut kopyasında YOK)
```

### 3.3 Modül dışı dokunma noktaları (tam liste)

Bugün 6 adaptörün kodu modül dışında ~11 backend dosyasında elle tekrarlanıyor (tarama 2026-09-30: `bizimhesap` modül dışında
`integration-service.ts`, `capabilities/domains/integrations.ts`, `config/env.ts`, `codeToCategory.ts`, `IntegrationDescriptorRegistry.ts`,
`config/catalog/integrationHttp.ts`, `config/catalog/mock.ts`, `MockMode.ts`, `outboundHosts.ts`, `IntegrationFactory.ts`,
`TenantProvisioningService.ts`). ADR-0033 INT-02 bunların veri kısmını tek tabloya (`ADAPTER_KEYS`) indirir; o yapılana kadar
aşağıdaki tablo **eksiksiz** uygulanır. Statik uyum testi (§8.3) her satırı denetler.

**Üretici (v1.3.0, INT-08):** `npm run integration:new` bu tablonun 1, 2, 3, 4, 8, 9, 10, 13, 15. satırları için yapıştırılacak parçacıkları ekrana basar (satır numaraları bu tabloyla birebir; kodu kendisi DÜZENLEMEZ), 11/12/14 koşullu, 16-22 için kontrol listesi verir. Tablo elle uygulanacaksa da aynıdır.

**Durum (v1.1.0, INT-02 yapıldı):** `integration/modules/adapterKeys.ts` (`ADAPTER_KEYS`, saf veri) VAR. Satır 5-9 artık **elle yazılmaz**:
`MockPrefix`/`MOCK_PREFIXES`, `outboundHosts.ts` `MOCK_PREFIX`/`MOCK_DEFAULT_BASE`, `mock.ts` katalog eşlemesi, `codeToCategory.ts`,
`integrationHttp.ts` `INTEGRATION_CODES` bu tablodan türer. Yeni entegrasyon = tabloya **bir satır** (`code, category, mockPrefix, envPrefix,
mockDefaultBase[, fallbackBaseUrl]`) + `ALLOWED_OUTBOUND_HOSTS[<kod>]` (host listesi güvenlik incelemesi için ayrı kalır) + `env.ts`'te
`<ENVPREFIX>_HTTP_TIMEOUT_MS` + `integrationHttp.ts` `perIntegration` değerleri + `run-tests.js` modül girişi. `tests/static/adapterKeys.static.test.ts`
eşitliği (host anahtarları, kategori haritası, env öneki, Factory, run-tests) denetler; eksik dokunma noktası adıyla kırmızı olur.
Not: Pazarama `Service.ts` eskiden iki farklı varsayılan mock portu kullanıyordu (token 6011, diğerleri 3006); INT-05'te token ucu da tablodaki tek değerden (3006) türer. Tarihsel değer `http://localhost:3006/apigateway` korunur (P3 bilinen açığı: `6015` değil).

| # | Dosya | Ne eklenir | INT-02 sonrası |
|---|---|---|---|
| 1 | `integration/modules/IntegrationFactory.ts` | `case '<kod>'` (+ yeni port ise `getShippingProvider/getEInvoiceProvider`) | aynen (açık switch kalır) |
| 2 | `integration/catalog/IntegrationDescriptorRegistry.ts` | descriptor import + `INTEGRATION_DESCRIPTORS` girdisi | aynen |
| 3 | `integration/modules/common/security/outboundHosts.ts` | `ALLOWED_OUTBOUND_HOSTS[<kod>]` (prod + sandbox host; tam host, joker yalnız tenant alt alan adı için) | yalnız host listesi burada kalır (güvenlik incelemesi) |
| 4 | `integration/modules/adapterKeys.ts` (INT-02 ile gelir) | `{ code, category, mockPrefix, mockDefaultBase, envPrefix }` | TEK veri satırı; aşağıdaki 5-9 buradan türetilir |
| 5 | `outboundHosts.ts` `MOCK_PREFIX` / `MOCK_DEFAULT_BASE` | ön ek + mock tabanı | türetilir |
| 6 | `modules/common/mock/MockMode.ts` `MockPrefix` tipi; `config/env.ts` `MOCK_PREFIXES`; `config/catalog/mock.ts` | ön ek | türetilir |
| 7 | `integration/catalog/codeToCategory.ts` | `<kod>: '<kategori>'` | türetilir |
| 8 | `config/catalog/integrationHttp.ts` `INTEGRATION_CODES` + `perIntegration` değerleri | kod + `timeoutMs/maxConcurrent/ratePerMin` varsayılanı (belgelenmiş limitin altı) | kod türetilir; değerler burada kalır |
| 9 | `config/env.ts` `<ENVPREFIX>_HTTP_TIMEOUT_MS` | yalnız test/operasyon düğmesi | türetilir |
| 10 | `operations/tenant/TenantProvisioningService.ts` | yeni tenant seed'ine girdi (status:false; kimlik bilgisi YOK) | aynen |
| 11 | `capabilities/domains/*.ts` | yalnız **yeni RPC** açılıyorsa (entegrasyona özgü RPC nadirdir; genel RPC'ler `integrationCode` parametreli) — `CAPABILITY_CHECKLIST.md` | aynen |
| 12 | `api/rpc/handlers/integration-service.ts` `FE_VISIBLE_PLATFORM_URLS` | yalnız FE'nin okuduğu `urls` alt kümesi gerekiyorsa (OAuth yetkilendirme adresi) | aynen |
| 13 | `utils/secretKeys.ts` `INTEGRATION_SECRET_FIELD_NAMES` | yeni sır alan ADI mevcut listede yoksa (ör. `lwarefreshtoken`) | aynen |
| 14 | `api/webhooks/WebhookApiManager.ts` | yalnız webhook varsa (bkz. §4.10) | aynen |
| 15 | `tests/tools/run-tests.js` modül haritası | `<kod>: ['[Kk]od']` | türetilir |
| 16 | `frontend/src/components/integrations/<kategori>/<Kod>Component.vue` + ilgili `*View.vue` dalı | bağlantı formu (bulut önyüz işi, `docs/CLOUD_BRIEFS.md`) | INT-06 sonrası descriptor alanlarından üretilen ortak form (yalnız özel alan varsa bileşen) |
| 17 | `frontend/src/plugins/locales/{tr,en}.json` | Bağlantı formu etiketleri **alan adından** gelir: her `descriptor.auth.requiredSettings` alanı için `integrations.<alan küçük harf>` (ör. `integrations.apikey`) hem `tr` hem `en`'de bulunur; `integrations.<kod>.*` biçimi KULLANILMAZ (statik test P11 denetler) | aynen |
| 18 | `frontend/src/navigation/screens.ts` `allowed` enum'ları; `design/tokens/palette.ts`, `ds/EkPlatformMark.vue` | kod + marka rengi/logo | aynen (bulut) |
| 19 | `frontend/src/components/adminPanel/integrations/settingsCatalogMirror.ts` | ayar kataloğu aynası (ADR-0020) | aynen (bulut) |
| 20 | `site/src/data/{integrations,capabilities,connect,faq,channel-colors}.ts` | tanıtım kaydı (`siteClaims.consistency.test.ts` canlı kümeyi fabrikaya karşı doğrular) | aynen (bulut) |
| 21 | `INTEGRATIONS_REGISTRY.md` | `### x.y <Ad> — M/<kategori>/<kod>/` bölümü | aynen |
| 22 | Bu belge Ek A | envanter satırı | aynen |

Sırlar (enc:v1): tenant formundan gelen ve adı `INTEGRATION_SECRET_FIELD_NAMES` ile eşleşen her alan DB'de AES-256-GCM ile şifrelenir,
API yanıtında `'sensitive'` döner (`platform/core/security/integrationSecrets.ts`). Yeni bir sır alan adı listeye eklenmeden forma konmaz.

ADR-0020 ayar anahtarları: HTTP politikası `resilience.timeoutMs`, `resilience.maxConcurrent`, `resilience.ratePerMin` (entegrasyon
bazlı varsayılan); platforma özgü sayısal limit gerekiyorsa `resilience.<kod>.<ad>` biçiminde katalog anahtarı açılır
(emsal `resilience.trendyol.orderListRatePerMin`). Adaptör kodunda sayısal sabit limit YAZILMAZ; `getSetting()` ile okunur.

---

## 4. Zorunlu mühendislik kuralları (Definition of Done)

Her kural bir kanıta (test/kod) bağlanır. "DoD" satırları PR açıklamasına kopyalanır.

### 4.1 HTTP: ResilientHttpClient + servis grubu etiketleri
- Tüm giden çağrılar `common/http/ResilientHttpClient` üzerinden (ADR-0006, ADR-0022). Doğrudan `axios`/`fetch` YASAK
  (N11 tarihsel istisnası INT-05'te kapandı: SOAP çağrısı da tabanın `post`'undan geçer). Taban sınıf (ADR-0033 `AdapterHttpService`) bunu kurar.
- **Taban API'si (v1.1.0, INT-01; `integration/modules/common/adapter/`):** `Service extends AdapterHttpService` (tek düzey kalıtım;
  `super(ADAPTER_KEYS satırı, params, { clientSuffix?, policy? })`). Zorunlu hook `authConfig()` (`{ headers?, auth? }`); opsiyonel
  `baseUrlFor(path)` (varsayılan: mock açıkken mock tabanı, değilse `Integrations.urls.baseUrl || fallbackBaseUrl`), `mockHostPattern` (gerçek host -> mock
  tabanı), `enforceMockableEndpoints` (mock açıkken `*_MOCKABLE_ENDPOINTS` listesi zorunlu, C19). `get/post/put/delete(url, ..., { operation, group, contract,
  idempotent, timeoutMs })`: okuma `idempotent:true`, yazma `false`; `resolveUrl` mock fail-closed; `fail(op, err)` çift sarmasız `IntegrationError` fırlatır.
  Politika bugünkü davranışla aynı: `<ENV>_HTTP_TIMEOUT_MS` -> `getSetting('resilience.*', { integrationCode })` (ratePerMin 0 = sınırsız).
  Yardımcılar: `OAuthTokenCache(fetchToken, skewMs=300000)` (`get(force?)` single-flight, `invalidate()`); `paginate(fetchPage, { kind: 'page'|'offset'|'cursor',
  maxPages, limit, maxRecords, operation })` tavan/tekrar sayfada `markIncomplete` (§4.8); `buildInternalOrder(partial)` ortak IOrder varsayılanları
  (alan eşlemesi adaptörde). `paginate` akış kipi: `onPage(items, req)` + `collect:false` (büyük katalog import'u bellekte toplanmaz; tavan yine `getIncomplete`). `CallOpts.headers` kimlik başlıklarının üzerine birleşir (ör. multipart Content-Type). Yeni adaptörler `IPlatform.testConnection?()` yazar (yan etkisiz, asla fırlatmaz). Örnek bağlantı: `erp/bizimhesap/services/Service.ts`
  (yalnız `authConfig`). Kalan 5 adaptör INT-05'te aşamalı geçer; geçene kadar eski desen yan yana yaşar.
  **REST+SOAP karma protokol (N11, INT-05):** SOAP zorla tabana uydurulmaz ama HTTP'si tabandan geçer: XML gövde `post` ile gider, `Content-Type: text/xml` `CallOpts.headers` ile eklenir; zarf kurma/ayrıştırma ve SOAP adres çözümlemesi (`resolveUrl` override: WSDL yolu + kendi mock eşleştirmesi) adaptörde kalır. REST ve SOAP AYRI breaker/limiter ister (REST->SOAP yedek yolu tek breaker'da anlamsızlaşır): ikinci örnek tabanın `clientSuffix:'soap'` seçeneğiyle (`n11-soap`) kurulur. Taban istemcisi yönlendirme takip etmez ve gövde boyut tavanı uygular (ADR-0022); eski doğrudan axios SOAP çağrısında ikisi de yoktu.
  **testConnection uçları (INT-01, kimlik doğrulamalı en hafif GET, tek kayıt; gövde atılır):** Trendyol `product/sellers/{SELLERID}/products/approved?page=0&size=1` (grup `product_read`; sipariş ucu 30/dk pacer'lı ve PII'li, kategori/marka uçları kimliksiz olduğu için seçilmedi) · N11 `ms/product-query?page=0&size=1` · Pazarama `product/products?page=1&size=1` (OAuth2 token alımını da zorlar) · Ideasoft `products?limit=1&page=1` (Bearer) · Bizimhesap `orderListUrl?page=0&size=1` (yoksa `products`). Yeni adaptör `runConnectionProbe(kod, probe)` kullanır; `detail` sabit metindir, ham hata/PII yazılmaz.
- Okuma `idempotent:true` (retry'lı), yazma `idempotent:false` (yalnız 429/bağlantı reddi/DNS retry). Her çağrı `operation` adı taşır
  (`<alan>.<işlem>`, ör. `orders.list`) — metrik ve eventLog bu adı kullanır; `operation`'a URL/sorgu/sır YAZILMAZ.
- Platform servis grubu tanımlıyorsa (ön keşif §4) her çağrı `group` etiketi taşır ve `groupRatePerMin` katalogdan gelir (X1;
  emsal `trendyol/limits.ts`). Stok/fiyat yazımı ayrı grupta olmalı (içerik/okuma trafiği onu aç bırakmasın).
- `maxRedirects:0` ve gövde sınırı ResilientHttpClient'ta (F-03, ADR-0022); adaptör bunu gevşetmez.
- Host: yalnız `ALLOWED_OUTBOUND_HOSTS[<kod>]`. Tenant ayarındaki URL alanları yok sayılır (K7/K8); taban URL platform `Integrations.urls`
  ya da kod varsayılanından gelir.

### 4.2 Yanıt sözleşmeleri + `API_SCHEMA_DRIFT`
- Motorun okuduğu her kritik yanıt için zod şeması (`.passthrough()`): en az **sipariş listesi**, **batch/toplu işlem durumu**,
  **kategori + öznitelik** (pazaryeri); **ürün listesi + sipariş listesi** (e-ticaret/ERP); **belge durumu** (e-fatura); **takip** (kargo).
- Çağrıya `contract: { id: '<kod>.<alan>.<işlem>@v<n>', schema }` geçilir; uyuşmazlıkta `observeResponseSchema` `API_SCHEMA_DRIFT`
  yazar (alan yolu + beklenen tip; değer/PII yok) ve istek başarısız sayılmaz (gözlem). Zorunlu alan yoksa (ör. sipariş kimliği)
  adaptör `IntegrationError('VALIDATION')` fırlatır — **sessiz `|| []` yasak** (F-09 dersi).
- Bilinmeyen enum değeri (sipariş/iade/batch durumu) `reportUnknownEnum` ile raporlanır ve `UNKNOWN`/ham değer korunur; başka bir duruma
  sessizce eşlenmez (Trendyol/Pazarama `UNAPPROVED` dersi, kategori belgesi §5.1).
- Sözleşme kimlikleri descriptor `contracts` dizisinde; şema değişikliği `adapterVersion` minor artırır (kategori belgesi §6).

### 4.3 Stok: tek kapı (X2)
- Adaptör stok **yayınlamaz**, yalnız `updateProductStock(payload)` çağrısına yanıt verir. Yayın `StockPublishTrigger` → adaptör yolundan geçer.
- Adaptör içinden stok değeri değiştiren bir yazma (ör. ERP'den okunan stok) doğrudan varyanta yazılmaz; `operations/stock/markStockDirty.ts`
  `stockDirtyFields()` kullanan servis yolundan geçer. Doğrudan `variant.stock` güncellemesi PR incelemesinde reddedilir.
- Yazma sonucu (v1.2.0 düzeltmesi: gerçek sözleşme) `IBatchProcessResult` `{ trackingId, result, variantList[], failedVariants[] }`; batch sonucu `IInternalResult[]`
  `{ matchValue, status: 'COMPLETED'|'FAILED'|'WAITING', messages[] }`. Asenkron platformda yazma `trackingId` döner, sonuç `checkBatchProduct` ile alınır.
  `checkBatchProduct` **yalnız "henüz sonuçlanmadı" için** `undefined` dönebilir (Trendyol: Sentinel bekler, C8b); sonuçlanmışsa `COMPLETED/FAILED` dizisi döner.
  Batch kavramı OLMAYAN adaptörde (Ideasoft/Bizimhesap dersi) `undefined` DEĞİL `IntegrationError('NOT_SUPPORTED')` fırlatılır (conformance C8b).

### 4.4 İş alımı kapısı (X6 intake)
- Adaptör kendi zamanlayıcısını (`setInterval`/`setTimeout` döngüsü, cron) kurmaz; tüm periyodik iş motor tüketicilerinden
  (`OrderQueueProducer`, `Dispatcher`, `StockPublishTrigger`, `ExternalReconciliationJob`) gelir ve `intakeGate.allowNewWork(code)` ile
  kapatılabilir. Statik test: modül dizininde zamanlayıcı yok.
- Kullanıcı tetiklemeli RPC'ler de aynı kapıdan geçer (X6-b, `api/rpc/intakeRpcGuard.ts`, RunOperation'da idempotency'den ÖNCE): yetenek kaydı
  `external:true` + etki alanı integrations/orders/claims/invoices/shipments/messages (hesap e-postası/ödeme hariç). Entegrasyon kodu girdiden
  (`integrationCode`, `selectedIntegrations`) çözülür; çözülemezse (X6-c) yalnız bir entegrasyon kısıtlıyken kayıt kimliğinden (`orderId`/`claimId`/`invoiceId`/`messageId` + bulk dizileri) tek sorguyla çözülür, hata olursa yalnız `_engine`. `off` → okuma dahil 503 `INTEGRATION_PAUSED`; `drain` → yalnız
  `effect !== 'read'` reddedilir. Yeni bir dış çağrı RPC'si eklerken yetenek kaydında `external:true` işaretlemek yeterli (ayrı liste yok);
  kodu girdiden çözülebilsin diye alan adı `integrationCode` kullanılmalı.

### 4.5 Idempotency (dış etkili yazmalar, X3)
- Dış etkili yazma (ürün aktarımı, sevk bildirimi, fatura bildirimi, gönderi oluşturma, fatura kesme) zaman aşımı/5xx'te
  `UNKNOWN_OUTCOME` döner, **otomatik tekrar edilmez**; sonuç durum sorgusuyla doğrulanır.
- Platform idempotency anahtarı/`externalRef` kabul ediyorsa gönderilir (e-faturada ZORUNLU: aynı fatura iki kez kesilemez).
  Anahtar türetimi deterministik: `<clientId>:<kod>:<iş>:<iç kimlik>` (rastgele değil).
- Gelen RPC tarafı `Idempotency-Key` (docs/API_IDEMPOTENCY.md) motor dışı; adaptör ek bir şey yapmaz.
- Sipariş içe alma: `retrieveOrders` aynı girdide aynı `externalId`/paket kimliğini üretir (upsert anahtarı kararlı); satır kimliği platformun
  kalıcı satır kimliğidir (Trendyol `lineId` dersi, BACKLOG R9).

### 4.6 Hata zarfı ve kodlar
- Tüm hatalar `IntegrationError` (`AUTH`, `RATE_LIMITED`, `UNAVAILABLE`, `NOT_SUPPORTED`, `UNKNOWN_OUTCOME`, `VALIDATION`; `docs/ERROR_CODES.md`).
  Katmanlar arası **tekrar sarma yok**: connector'dan gelen `IntegrationError` service katmanında generic `Error`'a çevrilmez
  (6 resilience testinin ortak senaryosu). Taban sınıfın `fail(op, err)` yardımcısı `fromHttpError` + çift sarma koruması yapar.
- HTTP 200 ile dönen iş hatası (SOAP fault, `success:false`) `VALIDATION` olur; retry/breaker tetiklemez (N11 emsali).
- Platform hata iletisi kullanıcıya **maskelenmiş** gider (IntegrationError mesaj maskeleme + 500 karakter kesme).

### 4.7 Sırlar, PII, log
- Sır alanları: §3.3 sır notu. Sır **URL sorgusuna konmaz** (Ideasoft F-04 dersi); token isteği form gövdesi `URLSearchParams` ile
  kodlanır (Pazarama `client_id=${APIKEY}` dersi).
- Log: yalnız `eventLog('integration', '<Kod>…')`; `console.*` YASAK (ratchet testi). İstek/yanıt gövdesi, sorgu nesnesi, müşteri
  adı/e-posta/telefon/adres/TCKN log'a yazılmaz (`pazarama/api/OrderConnector.ts:11` dersi). Gerekirse yalnız sayılar ve kimlikler.
- Platform maskeli PII döndürüyorsa (`isEmailMasked`, `isPhoneMasked`) iç modelde bayrak set edilir.

### 4.8 Sayfalama tamlık sinyali (WP7)
- Tüm liste çağrıları ortak sayfalama yardımcısından geçer (ADR-0033 `paginate`: page/offset/cursor + `maxPages` tavanı).
  `while(true)` tavansız döngü YASAK (Ideasoft F-04/F-10). Tek sayfa çekip bırakmak YASAK (HB/N11 F-02).
- Tavan ya da pencere taşması olursa sonuç `contracts/IncompleteFetch.ts::markIncomplete` ile işaretlenir; motor `lastSuccessfulOrderSync`'i
  yalnız tam çekimde ilerletir. Pencere büyükse Trendyol deseni: pencereyi böl (`ORDER_WINDOW_OVERFLOW`).

### 4.9 Zaman, para, KDV (docs/DATA_MODEL_CONVENTIONS.md §3-4)
- Tarihler iç modelde UTC `Date`. Platform ofsetsiz yerel saat veriyorsa `Europe/Istanbul` kabul edilir ve **transformer'da tek yerde**
  dönüştürülür; dönüştürme testi zorunlu (N11 `dd/MM/yyyy` dersi). Sorgu penceresi parametreleri de aynı yardımcıyla üretilir.
- Para: platformun ondalık tutarı iç modelin mevcut alanına aynen; platformun kendi defterlerine giden tutar `*Minor` (tam sayı) +
  `currency` (ISO-4217). `currency` platformdan okunur; varsayılan `TRY` yalnız platform belgesi söylüyorsa ve `note`'ta yazılı.
- KDV: `vatRate` yüzde sayı (`20`); fiyatın KDV dahil/hariç olduğu `vatIncluded` ile açık yazılır (Ideasoft `taxIncluded` emsali).

### 4.10 Webhook (varsa)
- Webhook = **sinyal**, polling = **doğruluk**: gelen olay yalnız ilgili kaydın yeniden çekimini tetikler; gövde veri kaynağı olarak
  doğrudan yazılmaz (sıra/tekrar/sahte olay riskine karşı en ucuz koruma). Polling yedeği her zaman çalışır.
- Doğrulama: `api/webhooks/webhookAuth.ts` (`safeEqual` sabit zamanlı, basic/başlık/HMAC); URL token + platform imzası; olay kimliğiyle tekilleştirme;
  WP10 testleri (`tests/characterization/webhooks/WebhookSecurity.wp10.test.ts`) kalıbıyla test.
- Bugün rota yalnız `/hooks/trendyol/:hookToken`. İkinci webhook'lu adaptör geldiğinde (tetikleyici) rota `/hooks/:code/:hookToken`
  olarak genelleştirilir ve adaptör `webhook.ts` (`verify`, `parse`) sağlar (ADR-0033 Karar 5).

### 4.11 Yetki ve MCP/UI eşitliği (ADR-0019, ADR-0028)
- Yeni entegrasyon çoğunlukla **yeni RPC açmaz** (genel RPC'ler `integrationCode` parametreli). Açarsa `CAPABILITY_CHECKLIST.md` tam uygulanır:
  kayıt girdisi, `minTier`, `ui` eşlemesi, `mcp` kararı (`nx`/`deferred`), `agent: NO_AGENT`.
- Bağlantı kurma/sır girme yalnız tenant `admin` rolü (mevcut `integrations` yetenekleri); yeni izin anahtarı açılmaz.

### 4.12 Mock modu
- Mock yalnız `<ENVPREFIX>_MOCK_MODE=true` ile; **fail-closed**: `<ENVPREFIX>_MOCKABLE_ENDPOINTS` dışındaki uç `MOCK_ENDPOINT_NOT_MOCKED`
  fırlatır, gerçek host'a gitmez (`assertEndpointMockable` + `assertMockSafeUrl`; C19). Mock tabanı tek yerde (INT-02 `ADAPTER_KEYS`),
  kodda ikinci bir varsayılan port yazılmaz (Pazarama 6011/3006 dersi). Varsayılan mock tabanı `http://localhost:6015/<kod>`.
- **Mock uç listesi tek kaynağı (C10c, faz4-conf-close):** `ADAPTER_KEYS[].mockDefaultEndpoints` (kod içi varsayılan; mockserver rotalarından, `/mock-api/*` yönetim uçları hariç) ∪ `<ENVPREFIX>_MOCKABLE_ENDPOINTS` (env varsayılanı GENİŞLETİR; yerel `.env` eski/eksik olsa da mock çalışır). Yalnız-env kipi için listede `!` girişi (kit C10b/C10c `!,/mockable-yok` kullanır). Alan yoksa (TY/Pazarama/N11) yalnız env (boş => hiçbir uç mock sayılmaz). Yeni adaptör `mockDefaultEndpoints` tanımlar ve `enforceMockableEndpoints = true` açar; çözümleme `common/mock/MockMode.ts::resolveMockableEndpoints`.

### 4.13 Descriptor dürüstlüğü
- `limitations` görünür sınırları yazar; `rateLimits.configured` ResilientHttpClient politikasıyla eşit (mevcut test);
  `verification.liveApi` yalnız gerçek hesapla duman testi yapıldıysa `true`; `api.lastVerifiedAt` araştırma tarihidir.

### 4.14 Kanal durumu ve eşleme verisi (ADR-0032)
- Dış sistemin kendi kaydı (sipariş, iade, finans, mesaj) kendi koleksiyonunda `{integrationCode, external…Id}` unique ile tutulur.
- Katalog varlığının kanal durumu yalnız tipli `Variants.platforms.<kod>` (`ChannelState`: `mapping`, `upload`/`publish.<MOD>`, `prices`,
  `attributes`, `stockSync`) altında; **şemasız yeni alt anahtar açılmaz**, adaptöre özel alan gerekiyorsa önce ADR-0032 şeması genişletilir.
- Kategori/öznitelik eşlemesinin tek kaynağı `AttributeMappings` + ADR-0025 çözümleyici; kanal paylaşılan referans verisi (kategori ağacı,
  komisyon) tenant DB'ye kopyalanmaz, sır belgesine alan eklenmez.

### DoD kopyala-yapıştır

```
Entegrasyon <kod> DoD:
[ ] docs/research/INTEGRATION_<KOD>.md dolu; DOĞRULANMADI listesi descriptor'a yansıdı
[ ] Yetenek matrisi: tüm Z satırları var; Z* not_supported'lar gerekçeli ve NOT_SUPPORTED fırlatıyor
[ ] Service.ts AdapterHttpService'ten türüyor; doğrudan axios yok; operation adları var; group etiketleri (varsa)
[ ] Host izin listesi girildi (prod+sandbox); mock tabanı yalnız ADAPTER_KEYS'te
[ ] Sözleşmeler: kritik yanıtlar zod; sessiz || [] yok; bilinmeyen enum raporlanıyor
[ ] Sayfalama ortak yardımcıdan; maxPages; incomplete işareti
[ ] Stok yazımı tek kapıdan; checkBatchProduct undefined dönmüyor
[ ] Dış etkili yazmalar UNKNOWN_OUTCOME + deterministik idempotency anahtarı
[ ] Sır alanları secretKeys listesinde; URL'de sır yok; console.* yok; PII log yok
[ ] Tarih UTC dönüşümü transformer'da + test; currency/vatIncluded açık
[ ] Zamanlayıcı yok (intake kapısı motor tarafında)
[ ] Kanal durumu yalnız tipli ChannelState alanlarında; şemasız alt anahtar yok (ADR-0032)
[ ] Conformance kiti yeşil: npm run test:module -- <kod>
[ ] Statik playbook uyum testi yeşil
[ ] Yeni RPC varsa CAPABILITY_CHECKLIST uygulandı
[ ] INTEGRATIONS_REGISTRY.md bölümü + playbook Ek A satırı + değişiklik günlüğü (aynı PR)
```

---

## 5. Test seti ve uyumluluk (conformance) kiti

### 5.1 Katmanlar

| Katman | Ne | Nerede | Komut |
|---|---|---|---|
| Birim / karakterizasyon | Transformer'lar (saf): resmi örnek fixture → iç model; tarih/para/KDV; bilinmeyen enum | `tests/characterization/transformers/<Kod>/` | `npm run test:module -- <kod>` |
| Sözleşme | zod şema × resmi örnek (geçer) × bozulmuş örnek (drift yakalanır) | `tests/contract/<kod>/` | `npm run test:contract` |
| Conformance | Ortak senaryolar, yerel HTTP sunucusuna karşı (`tests/helpers/localHttpServer.ts`), ağ/DB yok | `tests/conformance/<kod>.conformance.test.ts` + `kit.ts` + `exemptions.ts` | `npm run test:module -- <kod>` / tümü `npm run test:conformance` (hedef < 60 sn; bugün ~11 sn) |
| Manifesto tutarlılığı | descriptor ↔ fabrika ↔ requiredSettings ↔ politika ↔ not_supported ↔ site | `tests/contract/catalog/*` (mevcut) | `npm run test:contract` |
| Statik playbook uyumu | §8.3 | `tests/static/integrationPlaybook.static.test.ts` | `npm test` |

Gerçek API'ye giden test varsayılan koşuda YOKTUR; sandbox duman testi elle ve kayıtlı yapılır (§6.2).

### 5.2 Conformance kiti (ADR-0033 Karar 3; v1.2.0: INT-03 ile GERÇEKLEŞTİ)

Bugün 6 adaptörde `tests/characterization/common/<Ad>.resilience.contract.test.ts` olarak elle kopyalanmış ~1.200 satırlık aynı
senaryolar tek parametrik kitte toplandı: `backend/tests/conformance/kit.ts` (`runAdapterConformance(spec)`). Adaptör yalnız bir
**fixture sağlayıcı** (`ConformanceSpec`) yazar; senaryolar kitin içindedir:

```ts
// tests/conformance/<kod>.conformance.test.ts
const spec: ConformanceSpec = {
  code: 'ciceksepeti',                      // ADAPTER_KEYS kodu
  mock: { prefix: 'CICEKSEPETI' },          // <PREFIX>_MOCK_MODE / _MOCKABLE_ENDPOINTS (C10)
  timeoutEnv: 'CICEKSEPETI_HTTP_TIMEOUT_MS',
  secrets: [APIKEY, /* türev kodlamalar: base64(user:pass) */],   // C11: log'da görünmemeli
  build: (baseUrl) => ({ platform: new Ciceksepeti(params(baseUrl)), raw?: service }),  // IPlatform cephesi, yerel sunucuya yönlenmiş
  read: {                                   // sipariş okuma (IPlatform.retrieveOrders)
    call, page(i, pageCount, perPage), ids(result), packageShapeOk, driftBody, missingIdBody, unknownEnumBody(raw), statusesOf, pii },
  write?: { call, respond(req, 'write'|'batch-done'|'batch-pending'), shapeOk },   // stok yazımı + batch durumu
  writeNotSupported?: { call }, rawWrite?,  // yazma yolu yoksa (ERP): NOT_SUPPORTED + taban sınıf POST yolu
};
runAdapterConformance(spec);
```

Senaryolar (alt kimlikler `exemptions.ts::SCENARIO_IDS`; her biri yerel sunucuya karşı gerçek `ResilientHttpClient` ile koşar):

| Id | Senaryo | Beklenen |
|---|---|---|
| C1 | Okuma 500 | `IntegrationError(UNAVAILABLE)`, `[]` dönmez |
| C2a / C2b | 429 küçük (`Retry-After: 0`) / büyük (3600) | sonunda başarı (tam 2 istek) / `RATE_LIMITED` |
| C3 | Zaman aşımı (`<ENV>_HTTP_TIMEOUT_MS=50`) | `UNAVAILABLE` |
| C4 | 401 ve 403 | `AUTH`, `retryable:false`; service katmanında generic Error'a sarılmaz |
| C5 | Dış etkili yazma 5xx | `UNKNOWN_OUTCOME`, tam 1 istek (otomatik tekrar yok) |
| C6a | Sayfalama: 3 sayfa x n kayıt | tüm kayıtlar benzersiz, tam 3 istek |
| C6b | Sonsuz `totalPages` bildiren sunucu | <= 25 istekte durur; `incomplete` işareti YA DA `ORDER_WINDOW_OVERFLOW` (tavansız döngü yasak) |
| C7a | Sözleşme drift'i (zorunlu olmayan alan tipi bozuk) | istek başarılı + `API_SCHEMA_DRIFT` olayı YA DA ContractGuard `#mismatch` bulgusu |
| C7b | Zorunlu kimlik tüm kayıtlarda eksik | `VALIDATION` (sessiz `"undefined"` kimliği yasak) |
| C8a | Stok yazımı | `IBatchProcessResult` şekli (`result:true`, `trackingId`, `variantList`); yazma yoksa `NOT_SUPPORTED` |
| C8b | `checkBatchProduct` | tamamlanmışta `COMPLETED/FAILED`; sonuçlanmamışta `undefined` YA DA `WAITING`; batch kavramı yoksa `NOT_SUPPORTED` |
| C9a / C9b | Sipariş içe alma kararlılığı / şekil | aynı girdi iki kez -> aynı sipariş+satır kimlikleri, "undefined" yok / `IOrderPackage` (`order.externalOrderId`, `customer`) |
| C10a | İzinsiz host | `VALIDATION` + `OUTBOUND_HOST_NOT_ALLOWED` |
| C10b / C10c | Mock açık + yabancı host / mock açık + `MOCKABLE_ENDPOINTS` dışı uç | fail-closed (`MOCK_ENDPOINT_NOT_MOCKED` ya da host reddi) / `MOCK_ENDPOINT_NOT_MOCKED`, sunucuya 0 istek |
| C11 | Log hijyeni (başarı + 500 + 401 akışları; `logCapture` + konsol casusu) | yakalanan hiçbir satırda sır değeri/fixture PII yok |
| C12 | Bilinmeyen enum | ham değer korunur + `reportUnknownEnum` olayı |
| C13 | Intake off (statik) | modül dizininde `setInterval`/cron yok; periyodik iş motor tüketicilerinden (`intakeGate` testleri mevcut kapsamda) |
| C14 | `testConnection()` | başarıda `{ok:true, code:'OK'}`; 401'de `{ok:false, code:'AUTH_FAILED'}`; yalnız GET (kodlar: OK, AUTH_FAILED, UNREACHABLE, RATE_LIMITED, UNKNOWN; `common/adapter/testConnection.ts`) |

Kategoriye göre C8/C9 yerine: e-fatura -> mükerrer `externalRef` ile ikinci `issue` yeni belge üretmez; kargo -> `track` bilinmeyen
durum `UNKNOWN(+raw)` (bu iki kategori için senaryolar ilk adaptörle kite eklenir). Kit yalnız **ortak** davranışı test eder; platforma özgü
iş kuralları (Trendyol 15 dk aynı gövde, HB çoklu taban) adaptörün kendi testindedir.

**Bilinen-açık ratchet (`tests/conformance/exemptions.ts`):** bir senaryo adaptörde bugün başarısızsa kod DEĞİŞTİRİLMEDEN `KNOWN_OPEN[kod][senaryo] = gerekçe`
yazılır. Kit o senaryoyu yine koşturur ve BAŞARISIZ OLMASINI bekler; düzelirse test kırılır ("listeden çıkar"). Toplam/adaptör başına sayı
`exemptions.ratchet.test.ts` ile dondurulmuştur (ARTAMAZ). `NOT_APPLICABLE` tanım gereği uygulanmayan senaryolar içindir (gerekçe zorunlu).
Yeni adaptör KNOWN_OPEN ile GELEMEZ (yalnız INT-05'teki mevcut 6 için geçici); açık kapatmak = listeden silmek + sayıyı düşürmek.

Kite bağlı adaptörler (v1.2.0, faz4-conf-close 2026-09-30): **6 adaptörün tümü 0 açık (21/21)**: pazarama, trendyol, n11, hepsiburada (C10c: mock uç listesi tek kaynak + `enforceMockableEndpoints`), ideasoft (C7a F-09 sözleşmeleri, C10c, C12 `reportUnknownEnum`), bizimhesap (C6b ortak `paginate` + `BIZIMHESAP_MAX_PAGES`, C7a, C10c, C12 sipariş `status`). `KNOWN_OPEN` boştur ve ratchet tabanı 0'dır.
Kit koşusu gerçek zamanlı oran limitleyiciye takılır (ör. 300/dk = 200 ms/istek); bu yüzden C6b'nin istek tavanı küçüktür (25).
Kit seçenekleri (v1.2.0, Ideasoft ile): `spec.env` (tüm senaryolarda geçerli env; ör. adaptör sayfa tavanını düşürmek), `read.pageSize`/`read.c6aTotal` (sayfa boyutu sabit adaptörler: `<100` = son sayfa), `rawWrite` verilmişse C5 onu kullanır (senkron toplu yazmada per-öğe hata `failedVariants`'a gider, fırlatmaz).

Çalıştırma: `cd backend && npm run test:module -- <kod>` (karakterizasyon + sözleşme + conformance, yalnız o adaptör) veya `npm run test:conformance` (tüm adaptörler).
Bağlanan adaptörün eski `*.resilience.contract.test.ts` dosyasındaki tekrar eden senaryolar kit yeşil geçtikten sonra INT-05'te silinir
(kapsam kaybı yok: senaryo eşlemesi PR'da tablo olarak yazılır). Bugün işaretli (silinecek) tekrarlar: Trendyol dosyasının tamamı (C1-C4),
Bizimhesap dosyasında senaryo 1-4 ve 8 (C1, C2b, C3, C4, C9a); Bizimhesap'a özgü senaryolar kalır.

---

## 6. Mock sunucu, canlıya geçiş, izleme, geri alma

### 6.1 Mock sunucu ve fixture kuralı
- Mock: `mockserver/backend/src/platforms/<kod>/` (tek süreç, port 6015). Mock **yalnız resmi şemayı** üretir; alan adları resmi
  örnekle aynı (Trendyol C20 dersi: mock V1 alan adında kaldı). Onaylı iş akışları (batch `PROCESSING` → `/approve` → `COMPLETED`)
  simüle edilir (`modules/README.md` §4).
- Fixture: `tests/fixtures/<kod>/*.json`, resmi doküman örneğinden; `_source: { url, retrievedAt }` alanı zorunlu. Gerçek müşteri verisi
  fixture'a ASLA girmez (sentetik ad/telefon).
- Mock'un fark bildiği sapmalar descriptor `mock.knownDeviations`'a yazılır.

### 6.2 Canlıya geçiş kontrol listesi (sandbox → pilot → genel)

```
Aşama 1 — Sandbox (descriptor status:'limited', verification.liveApi:false)
[ ] Sandbox kimlik bilgisi yalnız .env/tenant formunda (dokümana/commit'e yazılmaz)
[ ] testConnection yeşil; her Z yetenek için en az bir elle duman çağrısı; sonuç research dosyasına tarihli not
[ ] Oran limitleri gözlendi (429 geldi mi?); rateLimits.verified güncellendi
[ ] Sözleşme fixture'ları gerçek sandbox yanıtıyla karşılaştırıldı (fark → şema/transformer düzeltmesi)
Aşama 2 — Pilot tenant (tek tenant, gerçek hesap, insan onayı — Protokol 12)
[ ] Yedek şartı (CLAUDE.md kural 3) — pilot tenant DB'si için
[ ] Salt okuma ile başla: ürün/sipariş içe alma 48 saat; API_SCHEMA_DRIFT = 0, incomplete-fetch = 0
[ ] Sonra yazma: stok → fiyat → ürün aktarımı; her biri için ilk 20 işlem elle doğrulanır
[ ] Kill-switch denendi: intake `drain`/`off` → yeni iş durdu, `on` ile kaldığı yerden devam etti
Aşama 3 — Genel (status:'available', verification.liveApi:true)
[ ] 7 gün pilot: hata oranı < %2 (yazma), breaker açılması yok, drift olayı yok
[ ] Site/FE "Yakında" → canlı (siteClaims testi), INTEGRATIONS_REGISTRY bölümü "canlı doğrulandı: <tarih>"
```

### 6.3 İzleme ve alarmlar (mevcut metrikler; yeni altyapı yok)
- `IntegrationCallMetrics` (çağrı sayısı/süre/sonuç, `integrationCode`+`operation` etiketli), `API_SCHEMA_DRIFT`, `*_UNKNOWN_ENUM`,
  `OUTBOUND_HOST_NOT_ALLOWED`, incomplete-fetch olayı, `stock_publish_lag_ms` (X2), breaker durumu (F-07 `snapshot()` geldiğinde).
- Yeni adaptör için pano satırı = aynı metriklerin `integrationCode` süzgeci; ayrı pano yapılmaz. Alarm eşikleri ADR-0017 Aşama C ile
  tanımlanınca her adaptöre aynı kurallar uygulanır (entegrasyona özel alarm yazılmaz).
- `SourceMonitor` (ADR-0018): descriptor `api.docs` içinde `monitor:'auto'` en az bir changelog/duyuru kaynağı; yoksa `manual` +
  araştırma dosyasında 90 günlük elle kontrol notu.

### 6.4 Geri alma (kill-switch)
- Birinci düğme: intake kapısı (`intakeGate`, ADR-0020 Karar 3.8 `intake`, ADR-0030 X6) — `<kod>` hedefi için `drain` yeni işi durdurur (süren iş biter), `off` hiçbir dış çağrı yapmaz (yarım iş silinmez, açılınca devam eder); `_engine` hedefi tüm entegrasyonları kapsar.
- İkinci düğme: tenant entegrasyon kaydı `status:false` (tenant bazlı).
- Üçüncü: kod geri alma — adaptör `IntegrationFactory` switch'inden çıkarılmaz; descriptor `status:'limited'` + intake off yeterli.
- Veri geri alma gerekirse yedek şartı; adaptör hiçbir zaman toplu silme yapmaz.

---

## 7. Süre tahmini kalıpları ve tipik tuzaklar

### 7.1 S / M / L ölçütleri (tek geliştirici + ajan, conformance kiti ve taban sınıf hazır varsayımıyla)

| Boy | Ölçüt (hepsi) | Tahmin | Mevcut emsal |
|---|---|---|---|
| **S** | REST/JSON, API key/basic, tek host, sandbox var, standart sayfalama, ≤3 yetenek grubu, kategori modeli yok ya da düz | 3-5 iş günü | Bizimhesap (okuma yönlü ERP) |
| **M** | OAuth2 (token önbelleği), kategori + öznitelik ağacı, asenkron batch durum sorgusu, belgelenmiş limit, 4-8 yetenek grubu | 8-12 iş günü | Pazarama, Ideasoft |
| **L** | SOAP ya da karma protokol, çoklu host/taban, servis grubu limitleri, sürüm göçü/kapanış takvimi, webhook imzası, yasal süreç (e-fatura), belge eksik/giriş arkasında | 15-25 iş günü | Trendyol (V2 göçü), Hepsiburada (4 taban URL), N11 (REST+SOAP) |

Çarpanlar: sandbox yok → ×1.3; resmi limit doğrulanamıyor → `limited` ile yayınla (süreyi uzatma); tenant'a özgü/self-hosted host → +3 gün
(host izin modeli, §7.3); ilk kargo ve ilk e-fatura adaptörü port açılışını da taşıdığı için +3 gün.

### 7.2 Mevcut 6 entegrasyondan çıkarılan tuzaklar (kural karşılığıyla)

| # | Tuzak (kanıt) | Karşı kural |
|---|---|---|
| 1 | İlk sayfayı çekip bırakmak → >100 kayıtta sessiz veri kaybı (HB sipariş/iade, N11 REST, F-02) | §4.8 ortak `paginate`, C6 |
| 2 | Tavansız `while(true)` (Ideasoft ×4, F-10) | `maxPages`, C6 |
| 3 | Beklenmeyen yanıtta sessiz `|| []` (5 adaptör, F-09) | §4.2, C1/C7 |
| 4 | Bilinmeyen durumu `UNAPPROVED`'a eşlemek (Trendyol/Pazarama) | §4.2 `reportUnknownEnum`, C12 |
| 5 | Mock portları/ön ekleri dağınık ve tutarsız (Pazarama 6011/3006; Ideasoft/Bizimhesap `.env`'de tanımsız); mock fail-open (C19) | §4.12, `ADAPTER_KEYS` |
| 6 | Mock resmi şemadan kopmuş (Trendyol mock V1 alanları, C20) | §6.1 fixture/mock resmi şemadan |
| 7 | Sır URL sorgusunda, token gövdesi kodlanmamış, token single-flight yok (Ideasoft F-04, Pazarama) | §4.7, taban `OAuthTokenCache` |
| 8 | `@Cache` TTL birimi (HB 24 sn), anahtar `undefined` (Trendyol, F-05) | Adaptörde `@Cache` yalnız ADR-0002 yeni API ile; kategori/marka önbelleği `scope` zorunlu |
| 9 | Ofsetsiz yerel tarih (N11 `dd/MM/yyyy`) | §4.9, transformer testi |
| 10 | Zorunlu başlık biçimi (Trendyol `User-Agent: {SELLERID} - Entegrasyonik`, yanlışsa 403) | Ön keşif §2 "zorunlu başlıklar"; `authConfig()` testi |
| 11 | Kimlik alanı anlam karmaşası (HB `MERCHANTID→SELLERID→APIKEY` zinciri) | Ön keşif §2 alan anlamları; zincir fallback yasak, eksikse hata |
| 12 | Taban URL'yi yol içeriğinden `url.includes('listings/')` ile seçmek (HB) | Taban sınıf `baseUrlFor(path)` açık eşleme tablosu (servis → taban) |
| 13 | Kapanış tarihinin geç fark edilmesi (Trendyol V1 15.10.2026) | Descriptor `knownDeprecatedEndpoints` + `SourceMonitor` auto kaynak |
| 14 | `console.log` ile sorgu/PII yazmak (Pazarama OrderConnector) | §4.7, C11 |
| 15 | `checkBatchProduct` `undefined` (Ideasoft/Bizimhesap) | §4.3, C8 |
| 16 | PascalCase + camelCase çift okuma (Pazarama transformer'ları — şema belirsizliği) | Sözleşme önce yazılır; transformer yalnız şemadaki adı okur |
| 17 | Aynı iç model iskeletinin (~60 anahtar: `externalIdentities`, `flags`, `dates`, masking) 3 transformer'da kopyası | Ortak `buildInternalOrder()` (INT-07) |
| 18 | Resmi limit doğrulanamadan limit uydurmak | `rateLimits.verified:false` + limiter yalnız bilinen değerle; tahmin YAZILMAZ |

### 7.3 Yeni aileler için önceden bilinen tuzaklar (ön keşifte doğrulanacak — DOĞRULANMADI)
- **Self-hosted mağaza (WooCommerce, OpenCart, Magento):** host her tenant'ta farklı → statik izin listesi yetmez. Tenant host'u kayıtta
  doğrulanan (https, genel IP'ye çözülen, özel/loopback IP reddi) tenant bazlı izin gerekir; bu, `outboundHosts` modelinin genişlemesidir
  ve ilk self-hosted adaptörle birlikte kısa bir ADR ekiyle yapılır (DNS rebinding notu `outboundHosts.ts` başında).
- **Tenant alt alan adlı SaaS (Shopify `*.myshopify.com`, Ideasoft):** joker desen yeterli; OAuth authorization_code + webhook HMAC beklenir.
- **GraphQL API'ler:** sayfalama cursor tabanlıdır, maliyet/puan tabanlı limit olabilir → `group` + katalog limiti; sözleşme şeması
  sorgu başına yazılır.
- **Rapor/feed tabanlı asenkron API'ler (büyük pazaryeri satıcı API'leri):** yazma = feed gönder → durum sorgula; `checkBatchProduct`
  deseni birebir karşılar; token yenileme (LWA benzeri) `OAuthTokenCache`.
- **On-prem ERP (Logo, Mikro, Netsis):** bulut sunucumuz tenant ağına erişemez → aracı ajan/bulut servis katmanı gerekir; bu bir ürün kararıdır
  (Protokol 12). Ön keşifte "bulut API var mı" ilk sorudur; yoksa L+ ve ayrı ADR.
- **Kargo firmaları:** SOAP yaygın, test ortamı firma başvurusuyla; etiket formatı (PDF/ZPL) ve desi hesabı farklı → `IShippingProvider`.
- **E-fatura entegratörleri:** mükerrer kesim yasal risk → `externalRef` zorunlu, `UNKNOWN_OUTCOME` sonrası durum sorgusu zorunlu.

---

## 8. Güncel tutma kuralı ve değişiklik günlüğü

### 8.1 Kural
1. **Her yeni entegrasyon PR'ı** bu belgenin Ek A satırını ve değişiklik günlüğünü **aynı PR'da** günceller; yeni bir tuzak öğrenildiyse §7.2'ye satır ekler.
2. **Ortak altyapı değişikliği** (aşağıdaki "referans yollar" listesindeki bir dosyanın sözleşmesini değiştiren PR: taban sınıf, ResilientHttpClient
   seçenekleri, descriptor tipi, conformance kiti, outboundHosts modeli, intake/stok/idempotency kapıları) ilgili bölümü aynı PR'da günceller.
3. Sürüm: kural ekleme/kaldırma → minor (`1.x.0`), düzeltme/açıklama → patch. Kırıcı kural (mevcut adaptörü uyumsuz yapan) → major + ADR notu.
4. Belge 90 günden eski `Tarih` taşıyorsa ve arada entegrasyon PR'ı olduysa, statik test uyarı verir (hata değil).

### 8.2 Referans yollar (statik test bu yolların var olduğunu doğrular; taşınırsa belge de güncellenmek zorunda kalır)

<!-- playbook-paths:start -->
- `backend/src/integration/modules/IntegrationFactory.ts`
- `backend/src/integration/catalog/IntegrationDescriptorRegistry.ts`
- `backend/src/integration/catalog/types.ts`
- `backend/src/integration/modules/common/http/ResilientHttpClient.ts`
- `backend/src/integration/modules/common/security/outboundHosts.ts`
- `backend/src/integration/modules/common/mock/MockMode.ts`
- `backend/src/integration/modules/common/contract/observeResponseSchema.ts`
- `backend/src/integration/modules/common/contract/reportUnknownEnum.ts`
- `backend/src/integration/modules/common/IntegrationError.ts`
- `backend/src/integration/contracts/IncompleteFetch.ts`
- `backend/src/integration/config/intakeGate.ts`
- `backend/src/integration/config/catalog/integrationHttp.ts`
- `backend/src/operations/stock/markStockDirty.ts`
- `backend/src/utils/secretKeys.ts`
- `backend/src/api/webhooks/webhookAuth.ts`
- `backend/tests/helpers/localHttpServer.ts`
- `backend/tests/helpers/logCapture.ts`
- `backend/tests/conformance/kit.ts`
- `backend/tests/conformance/exemptions.ts`
- `backend/tests/static/integrationPlaybook.static.test.ts`
<!-- playbook-paths:end -->

### 8.3 Statik "playbook uyum" testi (INT-04) — `backend/tests/static/integrationPlaybook.static.test.ts` (v1.2.0: GERÇEKLEŞTİ)
Her `ADAPTER_KEYS` adaptörü için aşağıdaki kontroller koşar (`P` kimlikleri testtekiyle aynıdır). Mevcut 6 adaptörün bilinen açıkları
`KNOWN_GAPS` tablosunda dondurulmuştur (bugün 50 açık, yalnız AŞAĞI iner): **açık artarsa ya da yeni adaptör eksikle gelirse test kırmızı olur;
açık kapanırsa da kırmızı olur ("tabanı düşür")**.
1. **P1** descriptor kayıtlı, zorunlu alanlar dolu, kategori eşit; kategorinin Z/Z* yetenekleri manifestoda yazılı (§2 matrisi testte veri olarak tutulur; matris değişirse test ve belge aynı PR'da değişir).
2. **P2** `api.docs` en az bir `official:true` kaynak; `monitor:'auto'` yoksa `accessNote` dolu.
3. **P3** `config.hosts` boş değil ve `ALLOWED_OUTBOUND_HOSTS[kod]` ile aynı; `mock.prefix` `ADAPTER_KEYS` ile aynı; mock tabanı `http://localhost:6015/<kod>` (§4.12).
4. **P4** `contracts` kimlik biçimi `<kod>.<alan>.<işlem>@v<n>` ve kategori minimumu (pazaryeri: `orders.list` + `batch…`; e-ticaret/ERP: `products.list` + `orders.list`); `contracts/` klasörü + `index.ts`.
5. **P5** `docs/research/INTEGRATION_<KOD>.md` var (mevcut 6 için ratchet).
6. **P6** `tests/conformance/<kod>.conformance.test.ts` var (INT-05 ilerledikçe boşalır).
7. **P7** `INTEGRATIONS_REGISTRY.md` içinde `M/<kategori>/<kod>/` başlığı ve bu belgenin Ek A tablosunda kod satırı (Ek A kodları ≡ `ADAPTER_KEYS`).
8. **P8** bu belgenin başlığındaki `Sürüm`/`Tarih` ayrıştırılır, §8.4'te o sürüme ait satır var; §8.2 yolları mevcut.
9. **P9** modül dizininde (yorumlar hariç) `console.*`, doğrudan `axios`/`fetch` kullanımı, `setInterval` sayısı (mevcut ihlal yok; N11 doğrudan axios INT-05'te kapandı).
10. **P10** HTTP politika kataloğunda (`integrationHttp.ts`) adaptöre özgü `resilience.timeoutMs` + `resilience.maxConcurrent` varsayılanı; `descriptor.rateLimits.configured` dolu.
11. **P11** UI: `components/integrations/<kategori>/<Ad>Component.vue` var; her `requiredSettings` alanı için `integrations.<alan küçük harf>` anahtarı `tr` ve `en`'de var (önyüz dizini yoksa atlanır).
12. **P12** yeni-tenant seed'inde (`TenantProvisioningService`) kod var.

Bilinen açık sınıfları (2026-09-30 ilk ölçüm): sözleşme minimumu/`contracts` klasörü (14), EN/TR form etiketleri (19), ön keşif dosyası (6), conformance bağlantısı (4),
yetenek manifestosu eksikleri (3), tarihsel mock tabanı (2) (ilk ölçüm; N11 doğrudan axios (2) INT-05'te kapandı).

### 8.4 Değişiklik günlüğü

| Sürüm | Tarih | Değişiklik | PR/ADR |
|---|---|---|---|
| 1.0.0 | 2026-09-30 | İlk sürüm: ön keşif şablonu, yetenek matrisi, dosya/dokunma noktaları (22), DoD (14 kural), conformance kiti (C1-C14), canlıya geçiş, S/M/L, 18 tuzak | ADR-0033 |
| 1.1.0 | 2026-09-30 | INT-02: `ADAPTER_KEYS` tek kod tablosu (§3.3 satır 4-9 türetilir, `adapterKeys.static.test.ts`); INT-01: `AdapterHttpService` + `OAuthTokenCache` + `paginate` + `buildInternalOrder` + opsiyonel `IPlatform.testConnection` (§4.1), Bizimhesap taban üstünde | ADR-0033 INT-01/02 |
| 1.2.0 | 2026-09-30 | INT-03: conformance kiti GERÇEK (`tests/conformance/kit.ts`, `exemptions.ts` bilinen-açık ratchet, `npm run test:conformance`; Trendyol + Bizimhesap bağlı; senaryo kimlikleri alt-kırılımlı C1-C14, §5.2); INT-04: statik playbook uyum testi GERÇEK (§8.3, P1-P12, `KNOWN_GAPS` ratchet 50); düzeltmeler: §4.3 yazma/batch sonuç tipleri ve `checkBatchProduct` `undefined` anlamı, §3.3 satır 17 i18n anahtar biçimi (`integrations.<alan>`); §8.2'ye kit/statik test yolları | ADR-0033 INT-03/04 |
| 1.3.0 | 2026-09-30 | INT-08: iskelet üretici `npm run integration:new` (`backend/dev-tools/integration-new.js`; yalnız yeni dosya, `--dry-run`, `--force` yok; 5 kategori; "kayıtsız" conformance iskeleti; §3.3 parçacıklarını ekrana basar; `tests/unit/dev-tools/integrationNew.test.ts`); §0 hızlı yol + §3.3 üreticiye göre güncellendi | ADR-0033 INT-08 |
| 1.3.1 | 2026-09-30 | INT-07: Trendyol/Hepsiburada/Pazarama OrderTransformer ortak `buildInternalOrder` üstünde (çıktı tam görüntü karakterizasyonuyla birebir; yeni iç-model dönüştürücüler iskeleti bu yardımcıyla kurmalı). N11 geçirilmedi (çıktısı iskelet varsayılanlarını içermiyor) | ADR-0033 INT-07 |
| 1.2.0 | 2026-09-30 | X6-b: kullanıcı tetiklemeli dış çağrı RPC'leri intake kapısına bağlandı (§4.4; `intakeRpcGuard`, 503 `INTEGRATION_PAUSED`) | ADR-0030 |
| 1.2.0 | 2026-09-30 | X6-c: intake RPC kapısı kayıt kimliğinden entegrasyon kodu çözer (§4.4; yalnız kısıtlıyken, DB hatasında `_engine`) | ADR-0030 |
| 1.2.0 | 2026-09-30 | INT-01 testConnection: Trendyol/N11/Pazarama/Ideasoft/Bizimhesap `IPlatform.testConnection()` (sonuç kodları OK/AUTH_FAILED/UNREACHABLE/RATE_LIMITED/UNKNOWN; ortak eşleme `common/adapter/testConnection.ts`); RPC `IntegrationService/testConnection` (admin, dakikada 3); C14 kodu `AUTH` -> `AUTH_FAILED`, KNOWN_OPEN 9 -> 7 (Ek A: Trendyol 0, Bizimhesap 7 açık) | ADR-0033 |
| 1.2.0 | 2026-09-30 | INT-05 Hepsiburada: `Service` `AdapterHttpService` tabanına geçti; sayfalama ortak `paginate` üstüne (akış kipi `onPage`/`collect:false`, `CallOpts.headers`); F-02 kalan uçlar kapandı (listing durum taraması, streamProducts, finans, sorular, kategori tavanı); `testConnection`; conformance bağlandı (20/21, C10c bilinçli; kit `maxSaneRequests`); KNOWN_OPEN 7 -> 8 (yeni adaptör, Ek A: Hepsiburada 1 açık) | ADR-0033 INT-05 |
| 1.2.0 | 2026-09-30 | INT-05 Ideasoft: `Service` `AdapterHttpService` tabanına geçti (mağaza host şablonu, Bearer, 401'de bir kez yenile-tekrar); OAuth token `OAuthTokenCache` (+`prime`) üstünde, örnekler arası single-flight ve başka örnek yeniledikten sonra Service token'ı güncellenir; sayfalama ortak `paginate` üstüne (F-04c/F-10: sipariş/marka/kategori/öznitelik/streamProducts; tavan/tekrar => `incomplete`, eskiden INTERNAL fırlatma; streamProducts tavan/tekrarda FAILED); sır URL yerine form gövdesi (F-04, önceki adım); conformance bağlandı (15/21; kit `env`/`pageSize`/`c6aTotal`/`rawWrite` önceliği); KNOWN_OPEN 8 -> 14 (Ideasoft 6) | ADR-0033 |
| 1.2.0 | 2026-09-30 | faz4-conf-fix (conformance bulguları): Ideasoft `OrderTransformer` ve Bizimhesap `OrderService.convert` GERÇEKTEN BOZUKTU (düz nesne döndürüyordu; `OrderWorker` `pkg.order.customerId` üzerinde TypeError ile patlıyordu, karakterizasyon: `tests/characterization/orders/IdeasoftBizimhesap.orderIntake...`) => ortak `buildInternalOrder` ile `IOrderPackage` (C9b); kimliksiz sipariş atlanır + loglanır, 3+ ve tümü kimliksizse `VALIDATION ORDER_SCHEMA_DRIFT` (C7b); kimliksiz SATIR atlanır, tüm satırları kimliksiz sipariş atlanır (Ideasoft'un sentetik `<orderId>_<idx>` satır kimliği kaldırıldı); `checkBatchProduct` `NOT_SUPPORTED` (C8b; kit `noBatch` seçeneği eklendi); KNOWN_OPEN 14 -> 8 (Ek A: Bizimhesap 4, Ideasoft 3) | ADR-0033 |
| 1.2.0 | 2026-09-30 | INT-05 Trendyol: `Service` `AdapterHttpService` tabanına geçti (142->67 satır; HTTP kurulum/URL çözümleme/mock fail-closed tabandan; `fallbackBaseUrl` `ADAPTER_KEYS` tek kaynak); V2 güvenlik ağı, X1 grup kovaları, BarcodePriceGate, finans grubu/storeFrontCode, UA/SELLERID kuralı ve V2 pencere-bölen sayfalama adaptörde kalır (ADR-0033); davranış birebir (yeni `Trendyol.service.characterization.test.ts`); `Trendyol.resilience.contract.test.ts` silindi (C1-C4); conformance 21/21 | ADR-0033 INT-05 |
| 1.2.0 | 2026-09-30 | INT-05 Pazarama: `Service` `AdapterHttpService` + `OAuthTokenCache` tabanına geçti (token single-flight; token gövdesi `URLSearchParams` ile kodlanır; token ucunun ayrı 6011 varsayılan portu `ADAPTER_KEYS` 3006 tek kaynağına bağlandı; 401/403 -> token yenile + bir kez tekrar adaptörde kaldı); sipariş/iade sayfalaması ortak `paginate` üstüne (`paginatePage`; eskiden tek istek = 100 kayıtta sessiz eksik), streamProducts tavanlı (eskiden sonsuz döngü riski); kimliksiz sipariş atlama/VALIDATION (C7b); conformance bağlandı (21/21, KNOWN_OPEN 0; kit `authHandler` + POST gövdesinden sayfa indeksi); KNOWN_GAPS P6 pazarama düştü | ADR-0033 INT-05 |
| 1.2.0 | 2026-09-30 | INT-05 N11: `Service` `AdapterHttpService` tabanına geçti (`RestService` kalktı; `rest` cephesi); SOAP bağlama kararı: XML gövde tabanın `post`'undan (`CallOpts.headers` Content-Type), adres çözümlemesi `resolveUrl` override, ayrı `n11-soap` istemcisi (tabanın `clientSuffix`'i; breaker izolasyonu korunur) — doğrudan `axios.post` KALKTI (INT-04 P9; bilinçli düzeltme: yönlendirme takip edilmez + gövde tavanı, ADR-0022); sipariş (REST) ve streamProducts sayfalaması ortak `paginate` üstüne (`paginatePage`; 50 sayfa/5000 kayıt, tekrar/tavan => `incomplete`; streamProducts eskiden yalnız ilk 100 + COMPLETED idi, artık tüm sayfalar, tavan/tekrar => FAILED); kimliksiz sipariş (REST+SOAP) atlanır, tamamı kimliksizse `VALIDATION ORDER_SCHEMA_DRIFT` (C7b); conformance bağlandı (21/21, KNOWN_OPEN 0, ratchet artmadı); descriptor dürüst (siparişler `supported` sayfalı, `categories` yeteneği, SOAP yedek yolu sayfalanmaz notu); resilience testinden kit-karşılanan 3 REST senaryo silindi; INT-04 P1/P6/P9 n11 tabanları düştü | ADR-0033 INT-05 |
| 1.2.0 | 2026-09-30 | faz4-conf-close (KNOWN_OPEN 8 -> 0): C10c mock uç listesi TEK KAYNAK (`ADAPTER_KEYS[].mockDefaultEndpoints` kod içi varsayılan ∪ env; `!` yalnız-env kaçışı; HB/Ideasoft/Bizimhesap `enforceMockableEndpoints` açıldı; yerel `.env` HB listesi eski/eksik olsa da kırılmaz); Bizimhesap C6b (`fetchOrders` ortak `paginate`, `totalPages` imleç, `BIZIMHESAP_MAX_PAGES`, `incomplete` taşınır), C7a (Ideasoft+Bizimhesap `contracts/index.ts` F-09 zod sözleşmeleri, `API_SCHEMA_DRIFT`, davranış değişmez), C12 (Ideasoft `mapOrderStatus` + Bizimhesap `status` bilinmeyen değer `reportUnknownEnum`, eşleme aynı; Bizimhesap bilinen-değer kümesi belgesiz/geçici); INT-04 KNOWN_GAPS P4 `contracts-klasoru-yok` ideasoft+bizimhesap düştü (MAX_TOTAL 50 -> 48) | ADR-0033 |

---

## Ek A — Entegrasyon envanteri (bu belgeye bağlı; her yeni entegrasyon satır ekler)

| Kod | Kategori | Boy (gerçekleşen) | Protokol / auth | Sözleşmeler | Conformance | Ön keşif dosyası | Not |
|---|---|---|---|---|---|---|---|
| trendyol | marketplace | L | REST / basic + UA | orders.list@v2, claims.list@v1 | bağlı (INT-03/INT-05; 0 açık, 21/21) | ratchet (research/2026-09-28-trendyol-v2-migration-spec.md) | servis grupları (X1), V2 göçü; `AdapterHttpService` tabanında (Basic + UA `authConfig`, politika `ratePerMin`/`groupRatePerMin`, mock'ta `/integration` çift-yol tekilleştirme); V2 güvenlik ağı, limits.ts/BarcodePriceGate, sipariş pencere bölme ve sayfalama (V2 toplamlarına bağlı) adaptörde kalır |
| hepsiburada | marketplace | L | REST / basic, 4 taban | F-09 pasif şemalar | bağlı (INT-05; 0 açık, 21/21; C10c faz4-conf-close) | ratchet | çoklu taban (§7.2 #12); `AdapterHttpService` tabanında (yalnız `baseUrlFor`+`authConfig`), sayfalama `paginate` üstünde (F-02 kapalı), `testConnection` var |
| n11 | marketplace | L | REST+SOAP / başlık | F-09 pasif şemalar | bağlı (INT-05; 0 açık, 21/21) | ratchet | `AdapterHttpService` tabanında; iki istemci (`n11` REST, `n11-soap` SOAP: tabanın `clientSuffix`'i, ayrı breaker), SOAP HTTP'si tabanın `post`'undan (XML gövde + `CallOpts.headers`), zarf/ayrıştırma + SOAP adres çözümlemesi adaptörde; sipariş/streamProducts sayfalaması `paginate` üstünde (`paginatePage`; `currentPage`/`pageSize`/`totalElements` canlı doğrulanmadı); SOAP yedek yolu sayfalanmaz; REST->SOAP yedeği yalnız UNAVAILABLE/NOT_SUPPORTED'ta |
| pazarama | marketplace | M | REST / OAuth2 cc | F-09 pasif şemalar | bağlı (INT-05; 0 açık, 21/21) | ratchet | `AdapterHttpService` + `OAuthTokenCache` tabanında (single-flight, form gövdesi `URLSearchParams`, mock portu tek kaynak); 401/403'te token yenile + BİR KEZ tekrar adaptörde kalır (tabanda jenerik hook yok); sipariş/iade sayfalaması `paginate` üstünde (`paginatePage`; 50 sayfa/5000 kayıt tavan, `pageNumber`/`pageSize` canlı doğrulanmadı), streamProducts tavanlı (FAILED); bulgu: satır kimliksiz kayıt "undefined" kimliğiyle geçer; `ratePerMin` doğrulanmadı |
| ideasoft | ecommerce | M | REST / OAuth2 (C10 bağlandı) | F-09 pasif şemalar (`contracts/`: orders/products/categories/brands) | bağlı (INT-05; 0 açık, 21/21; faz4-conf-fix + faz4-conf-close) | ratchet | `AdapterHttpService` tabanında (mağaza host şablonu + Bearer + 401'de bir kez yenile), token `OAuthTokenCache` (single-flight; örnekler arası dedup), sayfalama `paginate` üstünde (F-04c/F-10 kapalı: tavan/tekrar => `incomplete`, streamProducts FAILED), sır URL'de değil form gövdesinde (F-04), `testConnection` var; bulgu: sipariş çıktısı düz nesne (C9b) |
| bizimhesap | erp | S | REST / başlık key+token | F-09 pasif şemalar (`contracts/`: orders.list, products.list) | bağlı (INT-03; 0 açık, 21/21) | ratchet | yalnız okuma; sipariş sayfalaması ortak `paginate` (tavan `BIZIMHESAP_MAX_PAGES`, varsayılan 200; tavan => `incomplete`), `status` bilinmeyen => `reportUnknownEnum`; `AdapterHttpService` tabanında (INT-01 örneği) |

## Ek B — Aday entegrasyonlar ön sınıflandırması (BACKLOG RA-5/RA-6, kargo/e-fatura; tahmin, ön keşifte doğrulanır)

| Aday | Kategori | Beklenen boy | Ön keşifte ilk soru |
|---|---|---|---|
| Çiçeksepeti, idefix, PttAVM | marketplace | M (PttAVM protokolü belirsiz → M-L) | sandbox, batch modeli, kategori ağacı |
| Amazon TR | marketplace | L | satıcı API kaydı, token yenileme, feed/rapor asenkron akışı |
| ikas, T-Soft, Ticimax | ecommerce | M (Ticimax protokolü belirsiz → M-L) | GraphQL/SOAP mı, webhook var mı |
| Shopify | ecommerce | M | uygulama kaydı (authorization_code), webhook HMAC, GraphQL limit modeli |
| WooCommerce, OpenCart | ecommerce | M + self-hosted host modeli (§7.3) | tenant host doğrulama |
| Paraşüt | erp (+ einvoice F2) | M | OAuth2 akışı, e-fatura yeteneği var mı |
| Logo, Mikro, Netsis | erp | L+ (on-prem ise ayrı ADR) | bulut API var mı |
| Yurtiçi, Aras, MNG, Sürat, PTT, Hepsijet | shipping | M (ilki port açılışıyla +3 gün) | test ortamı başvurusu, SOAP/REST, etiket formatı |
| e-fatura entegratörü (Nilvera, Uyumsoft, e-Logo, Turkcell e-Şirket …) | einvoice | L | test ortamı, externalRef/mükerrer koruma, iptal süresi |

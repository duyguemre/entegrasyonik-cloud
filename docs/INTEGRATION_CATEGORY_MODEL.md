# Entegrasyon Kategori Modeli ve Yetenek Manifestosu (`IntegrationDescriptor`)

Durum: ADR-0018 Karar 1'in ayrıntı belgesidir (2026-09-28). ADR ile çelişirse **ADR kazanır**. Bu belge bir **tasarım sözleşmesidir**. Kod bloklarındaki TypeScript taslak niteliğindedir. Uygulama ADR-0018 Aşama A'da `entegrasyonik-backend-builder` tarafından yapılır. Alan adları uygulamada küçük farklarla değişebilir, ama anlamları değişmez.

Proje sahibinin yönergesi (2026-09-28): "Entegrasyon" yalnız pazaryeri demek değildir. **E-ticaret, ERP, e-fatura ve kargo** da entegrasyondur ve hepsinin güncel kalması gerekir.

---

## 1. Bugünkü gerçek durum (kanıt)

| Kategori | Backend adaptörü | Kanıt | UI |
|---|---|---|---|
| marketplace | Trendyol, Hepsiburada, N11, Pazarama | `backend/src/integration/modules/IntegrationFactory.ts:207-216` (switch, 6 kod) | 5 form (Amazon'un yalnız formu var) |
| ecommerce | Ideasoft (gerçek modda token akışı kopuk, C10) | aynı switch; `INTEGRATIONS_REGISTRY.md` §3.1 | 9 form (8'i yalnız form) |
| erp | Bizimhesap (yalnız okuma) | aynı switch; `INTEGRATIONS_REGISTRY.md` §4.1 | 1 form |
| shipping | **YOK** | `api/services/shipment-service.ts:80` `hasShipmentIntegration = false` | 9 form (PTT, Aras, Yurtiçi, MNG, Hepsijet, Sürat, Sendeo, Oplog, UPS) |
| einvoice | **YOK** | `api/services/invoice-service.ts:190` `hasIntegratedProvider = false`; `EInvoiceView.onUpdate` yalnız `console.log` | 4 form (GİB, e-Logo, Turkcell e-Şirket, Trendyol e-Faturam) |

Bunun yapısal nedenleri şunlar:
- Tek sözleşme olan `IPlatform` (`backend/src/interfaces/platforms/index.ts:217-315`) pazaryeri odaklıdır. ERP ve e-ticaret adaptörleri desteklemedikleri metotlarda `NOT_SUPPORTED` fırlatarak bu sözleşmeyi taşıyor.
- Tenant ayarı 5 dizi taşır (`client/models/ClientIntegration.ts:18-22`: `marketplace, shipment, ecommerce, erp, einvoice`). Fabrika ise yalnız 3'ünü arar (`IntegrationFactory.ts:107-109`).
- Kategori adı 3 yerde 3 farklı biçimde geçer:
  - DB: `shipment`.
  - Site iddia kaydı: `shipping` (`site/src/data/integrations.ts:16`).
  - `Integrations.type`: `IntegrationTypes` koleksiyonuna ObjectId referansı (`application/models/Integration.ts:6`).
- Yetenek bilgisi ("bu entegrasyon neyi yapar/yapmaz") bugün **dört yerde** elle tutuluyor ve birbirinden kopuk:
  - adaptör kodu (NOT_SUPPORTED dalları),
  - `INTEGRATIONS_REGISTRY.md`,
  - site `integrations.ts` (`CapabilityKey`, `notProvided`, `limitations`),
  - frontend formları.
- Sipariş üreticisi yalnız `marketplace` ve `ecommerce` tiplerini tarar (`engine/order/OrderQueueProducer.ts:65`). Bu yüzden Bizimhesap'ın "sipariş okuma" yeteneği otomatik tetiklenmez. Bu, "kodda var ama çalışmıyor" türünden örtük bir kapsam sınırıdır.

## 2. Kategori kümesi (kanonik)

```ts
export type IntegrationCategory = 'marketplace' | 'ecommerce' | 'erp' | 'einvoice' | 'shipping';
```

- **Kanonik ad `shipping`** olarak seçildi (site ve ADR-0008 `features[]` ile uyumlu). DB'deki `ClientIntegrations.shipment` dizisi **göç edilmez**. Tek bir eşleyici (`categoryToStorageKey('shipping') === 'shipment'`) bu dönüşümü yapar. Sebep: kod tarafında bir satırlık çözümü olan bir sorun için migration ve yedek maliyeti gerekmez.
- `einvoice` kategorisi e-fatura, e-arşiv ve e-irsaliye belgelerini kapsar. Belge türü kategori değil, **yetenek** düzeyinde ayrılır (§3).
- **Ayrılmış ama bugün enum'da OLMAYAN** kategoriler: `payment` (sanal POS/tahsilat), `sms` (bildirim), `fulfillment` (3PL/depo, ör. Oplog). Bunlar enum'a **ilk gerçek adaptör geldiğinde** eklenir. Boş kategori açmak "UI'da var, backend'de yok" sorununun aynısını yeniden üretir. Bugünkü `Oplog` formu `shipping` altında duruyor. Oplog gerçekte bir fulfillment sağlayıcısıdır. İlk fulfillment adaptöründe `fulfillment` kategorisine taşınır.
- `IntegrationTypes.code` değerleri bu enum ile **eşit olmalıdır**. Bunu kontrol eden test Aşama A'da yazılır (mock'lu, DB'siz: seed/fixture üzerinden). Gerçek DB içeriği doğrulanamadı (INTEGRATIONS_REGISTRY §9). Uyuşmazlık çıkarsa göç yapılmaz, eşleme tablosu kullanılır.

## 3. Yetenek (capability) kataloğu

Tek bir düz anahtar kümesi kullanılır. Bugünkü site anahtarları (`site/src/data/integrations.ts:19-29`) **aynen korunur**, üzerine yeni anahtarlar eklenir. Her anahtarın hangi kategorilerde anlamlı olduğu tabloda belirtilmiştir.

| Anahtar | Anlamı | Kategoriler | `IPlatform`/port metotları (bugün) |
|---|---|---|---|
| `products` | ürün aktarma/güncelleme/okuma | marketplace, ecommerce, erp (kaynak) | `streamProducts`, `transferProducts`, `updateProduct*` |
| `stockPrice` | stok ve fiyat yazma | marketplace, ecommerce | `updateProductStock`, `updateProductPrice` |
| `orders` | sipariş çekme | marketplace, ecommerce, erp | `retrieveOrders` |
| `orderActions` | onay/red/iptal nedenleri | marketplace, ecommerce | `approveOrder`, `rejectOrder`, `retrieveOrderRejectionReasons` |
| `returns` | iade/talep | marketplace | `retrieveClaims`, `approveClaim`, `rejectClaim` |
| `questions` | müşteri soruları | marketplace | `retrieveMessages`, `answerMessage` |
| `finance` | hakediş/ekstre | marketplace | `retrieveFinancials`, `retrieveSettlementsByPaymentId`, `retrieveCargoInvoices` |
| `shippingNotice` | takip bilgisini kanala bildirme | marketplace, ecommerce | `sendOrderShipping` |
| `invoiceNotice` | fatura linkini kanala bildirme | marketplace, ecommerce | `sendOrderInvoice` |
| `categories` | kategori/nitelik/marka tanımları | marketplace, ecommerce | `retrieveCategories`, `retrieveCategoryAttributes`, `retrieveBrands` |
| `shipmentCreate` | gönderi oluşturma | shipping | `IShippingProvider.createShipment` (§5) |
| `label` | etiket/barkod (PDF/ZPL) | shipping | `getLabel` |
| `tracking` | takip durumu sorgulama | shipping | `track` |
| `shipmentCancel` | gönderi iptali | shipping | `cancelShipment` |
| `rates` | fiyat/desi hesaplama | shipping | `quote` |
| `returnShipment` | iade kargo kodu | shipping | `createReturnShipment` |
| `einvoiceIssue` | e-fatura kesme | einvoice | `IEInvoiceProvider.issue({type:'EFATURA'})` |
| `earchiveIssue` | e-arşiv kesme | einvoice | `issue({type:'EARSIV'})` |
| `edespatchIssue` | e-irsaliye | einvoice | `issueDespatch` |
| `documentStatus` | belge durumu (GİB yanıtı) | einvoice | `getStatus` |
| `documentCancel` | iptal/itiraz | einvoice | `cancel` |
| `taxpayerLookup` | e-fatura mükellefi mi sorgusu | einvoice | `lookupTaxpayer` |
| `documentPdf` | belge PDF/link | einvoice | `getDocument` |
| `accountingSync` | cari/fatura/tahsilat aktarımı | erp | (gelecek) |

Yetenek düzeyi:

```ts
export type CapabilityLevel =
  | 'supported'      // gerçek çağrı yapar, testlidir
  | 'limited'        // çalışır ama kapsamı dar (ör. sayfalamasız, yalnız ilk kalem); `note` ZORUNLU
  | 'platform_auto'  // platform kendisi yapar, biz bilinçli no-op'uz (ör. Trendyol approveOrder → { performed:false, reason:'PLATFORM_AUTO' }, ADR-0006 Karar 2)
  | 'not_supported'; // BİLİNÇLİ desteklenmiyor — metot IntegrationError('NOT_SUPPORTED') fırlatmak ZORUNDA
```

Yetenek, manifestoda **yoksa** bu da `not_supported` sayılır. İki durum arasındaki fark şudur: açıkça yazılmış `not_supported` bir kapsam sınırı olarak UI'da gösterilir. Hiç yazılmamış yetenek o kategoride anlamsızdır ve gösterilmez.

## 4. `IntegrationDescriptor` (yetenek manifestosu)

Konum: her adaptörün yanında `modules/<kategori>/<kod>/descriptor.ts`. Manifesto **kodla birlikte sürümlenir** ve DB'ye yazılmaz. `Integrations` koleksiyonu görüntü alanlarını (logo, renk, `urls`) taşımaya devam eder. Manifesto, "ne yapabildiğimiz" bilgisinin tek kaynağıdır. Kayıt yeri: `IntegrationDescriptorRegistry` (saf, statik liste).

```ts
export interface IntegrationDescriptor {
  code: string;                       // IntegrationFactory kodu (küçük harf) — fabrika ile eşitlik testi
  displayName: string;
  category: IntegrationCategory;
  status: 'available' | 'limited' | 'roadmap' | 'deprecated';
  adapterVersion: string;             // semver; sözleşme/şema değişikliğinde artar (§6)
  protocol: 'rest' | 'soap' | 'mixed';
  auth: {
    type: 'basic' | 'api_key_header' | 'oauth2_client_credentials' | 'oauth2_authorization_code' | 'custom';
    requiredSettings: string[];       // adaptörün `requiredSettings` alanıyla EŞİT olmalı (test)
    tokenLifecycle?: 'none' | 'cached_refresh' | 'user_consent';
  };
  capabilities: Partial<Record<CapabilityKey, {
    level: CapabilityLevel;
    methods: string[];                // hangi port metotları bu yeteneği karşılıyor
    note?: string;                    // TR, kısa, doğrulanabilir; 'limited' ise zorunlu
    evidence?: string[];              // 'dosya:satır' veya test adı (görünmez)
  }>>;
  limitations: string[];              // görünür kapsam sınırları (dürüstlük ilkesi)
  rateLimits: {
    documented?: { perMinute?: number; perSecond?: number; notes?: string; source: string };
    configured: { maxConcurrent?: number; ratePerMin?: number; timeoutMs?: number }; // ResilientHttpClient politikası ile eşit (test)
    verified: boolean;                // resmi kaynaktan doğrulandı mı (Pazarama: false — INTEGRATIONS_REGISTRY §2.4)
  };
  api: {
    knownVersion?: string;            // ör. Trendyol 'integration/order v2'; bilinmiyorsa undefined
    hosts: string[];                  // yalnız host (sır/sorgu yok), ör. 'apigw.trendyol.com'
    docs: Array<{
      url: string;
      kind: 'reference' | 'changelog' | 'announcements' | 'openapi' | 'status' | 'community';
      official: boolean;              // PTT GitHub referansı: false
      monitor: 'auto' | 'manual' | 'off'; // kaynak izleme (ADR-0018 Karar 2c)
      accessNote?: string;            // ör. 'JS ile render — manual', 'giriş arkasında — manual'
    }>;
    lastVerifiedAt?: string;          // son insan/araştırma doğrulama turu (ISO tarih)
    verificationRef?: string;         // ör. 'docs/research/2026-09-27-api-verification.md'
  };
  mock: {
    available: boolean;
    prefix?: MockPrefix;              // common/mock/MockMode.ts:13
    contractFixtures: string[];       // kayıtlı fikstür kimlikleri (tests/contract/fixtures/<code>/...)
    knownDeviations?: string[];       // ör. ['BACKLOG C20']
  };
  contracts: string[];                // izlenen işlem sözleşmesi kimlikleri, ör. 'trendyol.orders.list@v2'
  probes?: Array<{ id: string; capability: CapabilityKey; readOnly: true; needs: 'platform_account' | 'public' }>;
  verification: { liveApi: boolean; mockEnvironment: boolean }; // site ile aynı anlam
}
```

**Tek kaynak kuralı (E3 dürüstlük):**
1. Frontend entegrasyon ekranları, kapsam sınırlarını ve "desteklenmiyor" rozetlerini `IntegrationService/getCatalog` (member, salt-okunur) üzerinden manifestodan okur. Uç adı `docs/API_TENANT_SURFACE.md` ile uzlaştırılır. `status: 'roadmap'` olan kargo ve e-fatura formları, "yakında" durumunda ve **kaydetme işlevi olmadan** gösterilir (ürün kararı: gizle veya "yakında" göster; varsayılan "yakında").
2. Site iddia kaydı (`site/src/data/integrations.ts`) statik bir Astro paketidir ve derleme anında backend'e bağlanmaz. Bu yüzden **kopyalanmaz, test ile bağlanır**. Aşama A'da yazılacak bir test, site kaydındaki her `available` kodun manifestoda da bulunduğunu doğrular. Ayrıca sitenin her `supported` yeteneği için manifestoda `supported` veya `limited` bulunmalıdır. Site manifestodan **fazlasını** iddia edemez. Kod üretimine (tek dosyadan iki pakete) **eşikte** geçilir: manifesto sayısı ≥ 12 olursa veya site↔manifesto uyumsuzluğu bir çeyrekte 2'den fazla kez yakalanırsa.
3. Tutarlılık testleri (Aşama A, mock'lu):
   - fabrika kodları = `available|limited` manifesto kodları,
   - `auth.requiredSettings` = adaptör `requiredSettings`,
   - `rateLimits.configured` = `ResilientHttpClient` politikası,
   - `not_supported` işaretli her yeteneğin metodu, sahte yapılandırmayla çağrıldığında `NOT_SUPPORTED` fırlatır (sahte başarı yasağı, ADR-0006 Karar 2),
   - `platform_auto` metotları `{ performed:false }` döner.

**İlk doldurma kuralı:** Aşama A'da 6 manifesto `INTEGRATIONS_REGISTRY.md` ve site kaydından doldurulur. Sonrasında yön tersine döner: kayıt belgesi ve site, manifestoyu izler. Bilinen örtük sınırlar `limited` ve bir `note` ile yazılır. Örnekler:
- Bizimhesap `orders` → `limited`, not: "sipariş üreticisi ERP tipini taramıyor (`OrderQueueProducer.ts:65`)".
- HB `shippingNotice` → `limited`, not: "takip kodu taşımıyor".
- N11 `returns` → `limited`, not: "yalnız REQUESTED, tek sayfa".

## 5. Yeni kategoriler için port sözleşmesi taslakları

**`IPlatform` bölünmez.** 13 çağıran ve karakterizasyon testleri ona bağlıdır. Yeniden düzenleme riski, bugünkü faydadan büyüktür. Yeni kategoriler **ayrı, dar portlar** alır. Hepsinin ortak bir tabanı vardır:

```ts
export interface IIntegrationAdapter {
  readonly descriptor: IntegrationDescriptor;
  requiredSettings: string[];
  /** Kimlik bilgisini doğrulayan, YAN ETKİSİZ en ucuz çağrı. Y-03(e) "Bağlantıyı test et" + probe'lar kullanır. */
  testConnection(): Promise<{ ok: boolean; code?: IntegrationErrorCode; detail?: string }>;
}
```

- Fabrika, `IntegrationFactory.getInstance`'ın yanına iki yeni giriş alır: `getShippingProvider(code)` ve `getEInvoiceProvider(code)`. Bu girişler **aynı** yapılandırma, `decryptSecrets`, 120 sn timeout Proxy'si, tenant anahtarlı önbellek ve `ResilientHttpClient` davranışını kullanır. Aranan diziler `shipment` ve `einvoice`'tır.
- Hatalar `IntegrationError` sözleşmesine tabidir (ADR-0006). **Yazma işlemleri** (gönderi oluşturma, fatura kesme) idempotency anahtarı taşır. Bu işlemler timeout ya da 5xx aldığında `UNKNOWN_OUTCOME` döner ve durum sorgusuyla doğrulanır. Aynı faturanın iki kez kesilmesi yasal bir sorundur. Bu yüzden e-faturada `externalRef` ile tekilleştirme **zorunludur**.

### 5.1 `IShippingProvider` (taslak)

```ts
interface IShippingProvider extends IIntegrationAdapter {
  quote?(req: ShipmentQuoteRequest): Promise<ShipmentQuote[]>;                 // rates
  createShipment(req: CreateShipmentRequest /* idempotencyKey, orderRef, parcels[desi,kg], sender, receiver(PII), payment:'sender'|'receiver', cod? */)
    : Promise<{ shipmentId: string; trackingNumber?: string; barcode?: string; outcome: 'created' | 'unknown_outcome' }>;
  getLabel(shipmentId: string, format: 'pdf' | 'zpl'): Promise<{ contentType: string; data: Buffer }>;
  track(ref: { shipmentId?: string; trackingNumber?: string }): Promise<TrackingStatus>; // normalize: CREATED|PICKED_UP|IN_TRANSIT|OUT_FOR_DELIVERY|DELIVERED|RETURNED|EXCEPTION|UNKNOWN(+raw)
  cancelShipment?(shipmentId: string): Promise<IPlatformResponse>;
  createReturnShipment?(req: ReturnShipmentRequest): Promise<{ returnCode: string }>;
}
```

`TrackingStatus` içindeki `UNKNOWN(+raw)` değeri bilinçli bir tercihtir. Bilinmeyen bir sağlayıcı durumu hiçbir zaman sessizce başka bir duruma eşlenmez. Bunun yerine "bilinmeyen enum" bulgusu üretilir (ADR-0018 Karar 2a). Pazaryeri tarafında bugün bu hata var: Trendyol ve Pazarama `mapStatus`, bilinmeyen durumu `UNAPPROVED` olarak döndürüyor (`trendyol/transformers/OrderTransformer.ts:172`, `pazarama/transformers/OrderTransformer.ts:127`).

### 5.2 `IEInvoiceProvider` (taslak)

```ts
interface IEInvoiceProvider extends IIntegrationAdapter {
  lookupTaxpayer(vknTckn: string): Promise<{ isEInvoiceUser: boolean; aliases?: string[] }>; // e-fatura mı e-arşiv mi kararı
  issue(doc: InvoiceDocument /* type:'EFATURA'|'EARSIV', externalRef(idempotency), lines, taxes, buyer(PII) */)
    : Promise<{ uuid /* ETTN — sağlayıcıdan */: string; number?: string; outcome: 'accepted' | 'queued' | 'unknown_outcome' }>;
  getStatus(uuid: string): Promise<{ state: 'QUEUED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'ERROR' | 'UNKNOWN'; raw?: string }>;
  getDocument(uuid: string, format: 'pdf' | 'html' | 'xml'): Promise<{ contentType: string; data: Buffer } | { url: string }>;
  cancel?(uuid: string, reason: string): Promise<IPlatformResponse>;
  issueDespatch?(doc: DespatchDocument): Promise<{ uuid: string; outcome: string }>; // e-irsaliye (Y-23, sonra)
}
```

Bugünkü `invoice-service.ts`'teki sahte ETTN (`ObjectId`, INTEGRATIONS_REGISTRY §5.2) gerçek sağlayıcı geldiğinde **kaldırılmaz**. Bu değer yalnız manuel yolun iç kimliği olarak kalır. Sağlayıcıdan gelen ETTN ayrı bir alanda tutulur.

## 6. Sürüm kuralı (`adapterVersion`)

- **patch**: davranışı değiştirmeyen düzeltme.
- **minor**: yeni yetenek, yeni izlenen sözleşme ya da sözleşme şemasının genişlemesi (yeni opsiyonel alan).
- **major**: dış API'nin kırıcı değişikliğine uyum. Örnek: Trendyol `sapigw` → `apigw` host/yol değişimi (C11).

`IntegrationFinding.fixedInAdapterVersion` bu sürüme bağlanır (ADR-0018 Karar 2).

## 7. Sağlayıcı seçenek tabloları (KARAR DEĞİL — Protokol 12, insan kararı)

Sağlayıcı seçimi, sözleşme/ücret içerir ve bu yüzden insan kararıdır. Aşağıdaki bilgiler 2026-09-28 tarihli benchmark'tan alınmıştır (`docs/research/2026-09-28-saas-capability-benchmark.md` T2/T3/T5/T6, Y-01/Y-02). Sağlayıcıların API ve sandbox iddiaları **doğrulanmadı**, seçimden önce bir araştırma turu gerekir.

### 7.1 Kargo

| Seçenek | Artı | Eksi | Kimlik modeli |
|---|---|---|---|
| **K1 Doğrudan firma API'leri** (Yurtiçi, Aras, MNG, PTT, Sürat, Hepsijet …) | aracı ücreti yok; tenant kendi anlaşmasını kullanır | firma başına ayrı adaptör, mock ve drift izleme (N adaptör = N yük); firmaların API kalitesi değişken; PTT için elimizde yalnız resmi olmayan referans var (`official-api-reference-sources.md`) | BYO: tenant'ın kendi müşteri no/şifresi |
| **K2 Kargo entegratörü/aracı** (ör. Kargo Entegratör, Kargopi) | tek API ile çok firma; tek adaptör ve tek drift yüzeyi | gönderi başı ücret veya iş ortaklığı sözleşmesi; üçüncü tarafa bağımlılık; KVKK açısından alıcı adresi bir işleyiciye daha gider | platform hesabı veya tenant hesabı (sözleşmeye bağlı) |
| **K3 Pazaryeri anlaşmalı kargo** (Trendyol/HB kargo kodu/etiketi) | ek sözleşme gerekmez; kısmen zaten var (`sendOrderShipping`, `shipment-providers.json`) | yalnız o pazaryerinin siparişleri; e-ticaret ve ERP siparişlerini kapsamaz | tenant pazaryeri kimliği |

**Öneri (karar değil):** Port (§5.1) üç modeli de karşılayacak şekilde kurulur. İlk gerçek adaptör **K1** ile, ilk ödeyen müşterilerin fiilen kullandığı firma için yazılır (talep güdümlü). K3 mevcut akışla sürer. **K2'ye geçiş eşiği:** en az 3 farklı firma, her biri en az 2 tenant tarafından talep edilirse aracı değerlendirilir. Bu noktada N adaptörün bakım ve drift maliyeti aracı ücretini geçer.

### 7.2 E-fatura / e-arşiv / e-irsaliye

| Seçenek | Artı | Eksi |
|---|---|---|
| **F1 Özel entegratör API'si** (ör. Nilvera, Uyumsoft, Sovos, e-Logo, Turkcell e-Şirket; UI'da formu olan Trendyol e-Faturam) | yasal süreç (GİB iletimi, saklama) entegratörde; çoğunun REST/SOAP API'si ve test ortamı olduğu belirtiliyor (**doğrulanmadı**) | sağlayıcı başına adaptör; kontör/ücret tenant'a ya da bize; KVKK açısından alıcı verisi entegratöre gider (zaten yasal akışın parçası) |
| **F2 Muhasebe/ERP yazılımı üzerinden** (ör. Paraşüt; Bizimhesap'ın e-fatura modülü varsa) | tenant zaten o yazılımı kullanıyorsa tek entegrasyon hem ERP hem e-fatura işini görür | e-fatura, ERP adaptörünün yeteneği olur (`erp` + `einvoiceIssue`); yalnız o yazılımın müşterilerine hizmet eder |
| **F3 GİB'e doğrudan entegrasyon / portal** | aracı yok | yüksek yasal ve teknik bariyer (izin, saklama yükümlülüğü); tek haneli ölçekte **önerilmez** |

**Öneri (karar değil):** F1 ve BYO hesap modeli (tenant kendi entegratör hesabını bağlar; biz kontör satmayız, yani bayilik/ödeme sorumluluğu almayız). İlk sağlayıcı, ilk ödeyen müşterilerin mevcut entegratörüne göre seçilir. Port (§5.2) F2'yi de karşılar: bir ERP adaptörü `einvoiceIssue` yeteneğini ilan edebilir. Bayilik (kontör satışı) ancak en az 10 tenant aynı entegratörü kullanıyorsa değerlendirilir ve Protokol 12 kapsamındadır.

## 8. Probe (canary) uygunluk tablosu

Ayrıntı ADR-0018 Karar 2b'dedir. "Doğrulanmadı" ifadesi, platform düzeyinde test hesabı veya sandbox olup olmadığının resmi kaynaktan teyit edilmediği anlamına gelir.

| Entegrasyon | Salt-okunur, güvenli aday uçlar | Platform düzeyi hesap/sandbox | Varsayılan mod |
|---|---|---|---|
| Trendyol | kategori ağacı, kategori nitelikleri, kargo firmaları, marka arama | test ortamı var mı: doğrulanmadı | replay (fikstür) |
| Hepsiburada | kategori listesi, (sit/test ortamı?) | doğrulanmadı | replay |
| N11 | kategori (REST `cdn/categories`), SOAP kategori servisi | doğrulanmadı | replay |
| Pazarama | token (`connect/token`), kategori | doğrulanmadı (panel 403) | replay |
| Ideasoft | test mağazası (partner programı?) | doğrulanmadı; ayrıca C10 token akışı kopuk | kapalı (C10 kapanana dek) |
| Bizimhesap | ürün listesi (kendi test hesabımız) | doğrulanmadı | replay |
| Kargo/e-fatura | `testConnection`, mükellef sorgu (e-fatura), fiyat sorgu (kargo) | sağlayıcı seçilince | — |

**Tenant kimlik bilgisiyle probe YAPILMAZ.** Bunun iki gerekçesi var. Birincisi, tenant'ın kotasını ve API hakkını bizim izleme amacımız için harcamak tenant ile yaptığımız sözleşmenin dışına çıkar. İkincisi, KVKK amaç sınırlaması gerekir. Canlı mod (`PROBES_LIVE=true`) yalnız insanın sağladığı **platform düzeyi** hesaplarla açılır (Protokol 12).

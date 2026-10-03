# 04 — Bizimhesap API: Güncel Doküman vs. Kod Karşılaştırması

Tarih: 2026-10-03 · Depo: `/home/user/entegrasyonik-cloud` (salt okunur) · Kapsam: `backend/src/integration/modules/erp/bizimhesap/**`

## Güven etiketleri ve erişim notu (önce okuyun)

- **[RESMİ]** apidocs.bizimhesap.com içeriği. **Site bu oturumda doğrudan ÇEKİLEMEDİ** (egress proxy 403; `/`, `/llms.txt`, `/products.md`, `/inventory.md`, `/addinvoice` tümü engelli). Resmî metin yalnız **arama motoru dizin parçacıkları** üzerinden görüldü ve `tcgunel/bizimhesap-b2b` test dosyasındaki, resmî dokümandan birebir kopyalanmış docblock'larla (aynı cümleler: "Kayıtlı ürünlerin listesini getiren servistir", "Bizimhesap tarafından verilecek özel tekil ID") çapraz doğrulandı. Bu nedenle resmî maddeler **[RESMİ/parçacık]** olarak işaretlidir: kaynak resmî, görünürlük kısmi.
- **[İKİNCİL]** Üç açık kaynak istemci (git ile klonlandı, 2026-10-03):
  - `github.com/tcgunel/bizimhesap-b2b` — son commit **2024-06-12**; gerçek yanıt örnekleri içeren test fixture'ları (en değerli ikincil kaynak).
  - `github.com/sitesepetim/bizimhesap-laravel` (Packagist: `vizyontech/bizimhesap-laravel`) — son commit **2025-09-17**; README kendisi "response formatları tahmine dayalı" der → alan adları için güvenilmez, host/auth/sınırlama notları için kullanıldı.
  - `github.com/ismail0234/bizimhesap-efatura-php-api` — son commit **2022-01-20**; yalnız addinvoice.
- **DOĞRULANAMADI**: hiçbir kaynakta görülmeyen ya da kaynaklar arasında çelişen madde.
- Depo içi önceki araştırmalar: `docs/research/API_CONTRACTS_2026-09-30.md` §6, `docs/research/2026-09-27-api-verification.md`, `docs/research/2026-09-28-integration-deadlines-scan.md` §7.
- WebSearch bütçesi (200) bu görev sırasında tükendi; §F'de hangi doğrulamaların bu yüzden yapılamadığı yazılıdır.

---

## (A) Kod envanteri

### A.1 Kimlik, host, ayarlar

| Konu | Kodda | Kanıt |
|---|---|---|
| Zorunlu ayarlar | `requiredSettings = ['key','secret']`; `init()` ikisi yoksa `false` | `index.ts:19,35-43` |
| Kimlik başlıkları | `headers: { key: settings.key\|APIKEY\|apikey, token: settings.secret\|APISECRET\|token, 'Content-Type': 'application/json' }` (küçük harf `key`/`token`) | `services/Service.ts:20-25` |
| Ön yüz etiketleri | `settings.key` → **"Bizimhesap ID"**, `settings.secret` → **"API Key"** | `frontend/src/components/integrations/erp/BizimhesapComponent.vue:13-14` |
| Varsayılan host | `fallbackBaseUrl: 'https://api.bizimhesap.com'` (tenant `urls.baseUrl` yoksa) | `adapterKeys.ts:24`; `AdapterHttpService.ts:66-70` |
| İzinli egress hostları | `['api.bizimhesap.com', 'bizimhesap.com']`; yorum: "kod varsayılanı api.bizimhesap.com; yerel DB kopyasındaki Integrations.urls bizimhesap.com" | `common/security/outboundHosts.ts:37-38` |
| Mock uç listesi | `['products', 'orders']` | `adapterKeys.ts:13` |
| HTTP politikası | ratePerMin 300, maxConcurrent 10, timeout `BIZIMHESAP_HTTP_TIMEOUT_MS`\|\|30000; okuma idempotent (retry var), POST/PUT retry yok | `Service.ts:4-8`, `descriptor.ts:51-55` (`verified:false`) |
| Token yaşam döngüsü | `tokenLifecycle: 'none'` (statik anahtar) | `descriptor.ts:18` |
| FirmId ayarı | **YOK** (hiçbir yerde `firmId` okunmaz) | tüm modül |
| Sayfalama (ürün) | yok — tek GET, tüm liste | `ProductService.ts:22-31` |
| Sayfalama (sipariş) | `?page=N&size=1000`, yanıt `{content[], totalPages}`; `BIZIMHESAP_MAX_PAGES` (vars. 200) → aşımda `incomplete` | `OrderService.ts:16-50` |
| Tarih formatı | yazma yok; okuma `new Date(order.orderDate \|\| order.createdAt)` | `OrderService.ts:128` |

### A.2 Metot → uç → parametre tablosu

| IPlatform metodu | Uygulama | HTTP | Uç (göreli; `baseUrl`'e eklenir) | Parametreler / okunan alanlar | Durum |
|---|---|---|---|---|---|
| `testConnection` | `runConnectionProbe` | GET | `urls.orderListUrl?page=0&size=1` varsa; yoksa `urls.productListUrl \|\| 'products'` | `<SELLERID>` → `settings.sellerId` | çalışır; **sipariş ucu resmî dokümanda yok** (bkz. C-3) |
| `streamProducts` | `ProductService.fetchAllProducts` | GET | `urls.productListUrl \|\| 'products'` | yanıt: `data.data.products \|\| data.products \|\| data \|\| []`; `query.init===true` ise yalnız katalog çıkarır ve `ClientIntegration.erp.$.settings.catalog`'a yazar | çalışır |
| `convertToInternalModel` | ProductService | – | – | `raw.{title,brand,category,code,barcode,id,quantity,price,isActive,variantName}` | çalışır |
| `getSummaryFromRaw` | ProductService | – | – | `category,price,quantity,barcode,code,id` | çalışır |
| `updateProductStatuses` | ProductService → `toInternalStatusResult` | GET | `products` (tüm liste tekrar çekilir) | eşleşme `barcode`, `isActive===1\|true` → COMPLETED aksi FAILED 'Pasif' | çalışır (bkz. C-9) |
| `validate` | – | – | – | daima `{result:true}` | stub |
| `checkBatchProduct` | – | – | – | – | `IntegrationError('NOT_SUPPORTED')` |
| `transferProducts`, `updateProductPrice`, `updateProductStock`, `updateProduct`, `updateProductVariant`, `updateProductDelivery` | `notSupported(op)` | – | – | – | `NOT_SUPPORTED` fırlatır |
| `retrieveOrders` | `OrderService.fetchOrders` | GET | `urls.orderListUrl` (**varsayılan yok; yoksa `[]`**) `?page&size=1000` | yanıt `{content:[{id\|orderNumber,status,lines[{id,quantity,amount,discount,merchantSku,barcode,productName}],customerFirstName/LastName/Email/Id,shipmentAddress{phone,address1,city,district,postalCode,countryCode},invoiceAddress,grossAmount,totalDiscount,cargoTrackingNumber,cargoProviderName,orderDate\|createdAt}], totalPages}`; durum → daima `AWAITING_APPROVAL`, bilinmeyen `status` → `reportUnknownEnum`; para `TRY`, `taxRate:0`, `shippingFee:0` | **hiçbir kaynakta karşılığı yok** (C-3) |
| `approveOrder`, `sendOrderShipping`, `sendOrderInvoice`, `approveClaim`, `rejectClaim` | – | – | – | `{success:false,message:'Not supported'}` | stub (IntegrationError değil — C-11) |
| `rejectOrder`, `answerMessage` | – | – | – | `false` | stub |
| `retrieveOrderRejectionReasons` | sabit liste | – | – | `[{1:'Stokta Yok'},{2:'Diğer'}]` | uydurma sabit |
| `retrieveClaims/Messages/Financials/CargoInvoices/SettlementsByPaymentId` | – | – | – | `[]` | stub |
| `retrieveCategories` | `CategoryService.fetchCategories` | DB | `ClientIntegration.erp[code=bizimhesap].settings.catalog.categories` | API çağrısı yok | türetilmiş |
| `retrieveCategoryAttributes` | aynı doc `.options` (varyant adlarından) | DB | – | – | türetilmiş |
| `retrieveCategoryAttributeValues` | – | – | – | `[]` | stub |
| `retrieveCategoryCommision` | – | – | – | `undefined` | stub |
| `retrieveBrands` | `BrandService` | DB | `settings.catalog.brands` | – | türetilmiş |
| `retrievePlatformInfos` | – | – | – | `{shipments:[],addresses:[]}` | stub |

### A.3 Ürün dönüşümü ve kategori/marka/özellik çözümü (`transformers/ProductTransformer.ts`)

- **Gruplama anahtarı:** `maincode = toUrlFriendly(p.title)` (başlık normalize edilir; `id` KULLANILMAZ). Aynı başlıklı satırlar tek ürünün varyantları sayılır; `hasVariant: true` sabit.
- **Kategori:** `p.category` düz metin → `{ _id: category, parentId:'0', level:0, title: category }` (hiyerarşi yok). `mappingProvider.getLocalCategoryId(p.category)` ile yerel kategoriye eşlenir; eşleme yoksa ham metin kalır.
- **Marka:** `p.brand` düz metin → `{ id: brand, title: brand }`; `getLocalBrandId(p.brand)`.
- **Özellik/varyant:** `p.variantName.split(' -- ')` (ör. `"EBAT -- RENK"`) adlar; `p.variant.split(' -- ')` değerler; indeks eşlemesi → `platforms.bizimhesap.attributes {EBAT:'L', RENK:'KIRMIZI'}` ve katalog `options[]` (`varianter:true`).
- **Fiyat:** `salePrice = p.price`; `price = salePrice * 100/(100+tax)` → **kod `price`'ı KDV DAHİL varsayar**; `taxPercentage = p.tax`. `variantPrice` ve `currency` alanları **okunmaz**.
- **Stok:** `p.quantity` (ürün listesindeki toplam); depo (`inventory`) ucu kullanılmaz.
- **Görsel:** `p.photo` JSON dizgisi → `PhotoUrl || url`.
- **Kimlik:** `mapping.productId = p.id`, `categoryId = p.category`, `brandId = p.brand`.
- **Kaynak sözleşmesi (yalnız gözlem):** `contracts/index.ts` `BIZIMHESAP_PRODUCTS_LIST` `{data.products[] | products[] | []}`; `BIZIMHESAP_ORDERS_LIST` `{content[], totalPages}`.

### A.4 Yetenek manifestosu (`descriptor.ts`)

`status:'limited'`, `auth.type:'api_key_header'`, yetenekler: `products` (limited, yalnız `streamProducts`), `orders` (limited, `retrieveOrders`; "OrderQueueProducer ERP tipini taramıyor" → otomatik çekim yok), `categories` (limited, katalogdan türetilir). `limitations[4]`: "Resmi dokümantasyonda sipariş LİSTELEME uç noktası görünmüyor… mock'a dayanıyor olabilir (P1)". `accountingSync` yeteneği: `catalog/types.ts:72`'de tür olarak var, `INTEGRATION_CATEGORY_MODEL.md:73` "cari/fatura/tahsilat aktarımı, erp, (gelecek)"; Bizimhesap descriptor'ında **tanımlı değil**. `verification: { liveApi:false, mockEnvironment:true }`. `docs/LIVE_READONLY.md:86`: canlı bağlantı testi **Bizimhesap 402** döndü (host/kimlik sorununa işaret; bkz. C-1/C-2).

---

## (B) Güncel doküman özeti (dış kaynaklar)

### B.1 Resmî doküman yapısı — [RESMİ/parçacık] + depo içi önceki tarama
- Sayfalar (llms.txt, `docs/research/2026-09-28-integration-deadlines-scan.md:98`): `master.md` (Genel Bilgiler), `addinvoice.md`, `products.md`, `warehouses.md`, `inventory.md`. **Toplam 5 sayfa; changelog, sürüm, oran limiti sayfası yok.** Dokümanda `?ask=` sorgu parametresi ile LLM yanıtı özelliği var (arama parçacığı, 2026-10-03).
- Resmî dizinde **sipariş listeleme, müşteri listeleme, ekstre, fatura iptal sayfası GÖRÜNMÜYOR**; bunlar yalnız ikincil kaynakta var (B.6).

### B.2 Base URL ve kimlik doğrulama
| Madde | Değer | Kaynak / güven |
|---|---|---|
| Base URL | `https://bizimhesap.com/api/b2b/` (ürün: `https://bizimhesap.com/api/b2b/products`; depo ve stok sayfalarında `http://bizimhesap.com/api/b2b/...` yazılı) | [RESMİ/parçacık] apidocs `/products`, `/warehouses`, `/inventory`, `/addinvoice`, 2026-10-03; [İKİNCİL] tcgunel (tüm uçlar sabit `https://bizimhesap.com/api/b2b/...`), Laravel `base_url` |
| `api.bizimhesap.com` | **hiçbir kaynakta geçmiyor** | DOĞRULANAMADI (kodun varsayılanı) |
| Kimlik | İstek başlıkları **`Key`** ve **`Token`** (ikisi zorunlu); "API Key hem Key hem Token başlığı olarak gönderilir; Bizimhesap ikisini eşdeğer tutar" | [RESMİ/parçacık] "Genel Bilgiler" (arama özeti, 2026-10-03); depo `API_CONTRACTS §6` aynı tespit |
| tcgunel davranışı | yalnız `token` başlığı; `firmId` = aynı token değeri (`$invoice->firmId = $this->token`, `CancelInvoice FirmId = token`) | [İKİNCİL] `tests/Unit/BizimHesapB2bTest.php`, `BizimHesapB2bCancelInvoice.php` |
| Laravel paketi davranışı | `Key` = sabit `BZMHB2B724018943908D0B82491F203F` ("Bizimhesap tarafından verilen sabit anahtar"), `Token` = hesap token'ı, `firm_id` ayrı env | [İKİNCİL, güven düşük] `src/Config/bizimhesap.php`, `BizimhesapClient.php:41-42` — resmî metinle çelişir (resmî: Key=Token=API key) |
| API anahtarının yeri | Panel: "Profil → Hesabım" (bir kaynak) / "E-Ticaret > Ayarlar > E-Ticaret Yönetim Uygulamaları" (başka kaynak) | [İKİNCİL] arama özetleri (yacevap, infoset.help — sayfalar açılamadı) |
| FirmID | "Bizimhesap tarafından verilecek özel tekil ID" (addinvoice gövdesinde) | [RESMİ/parçacık] `/addinvoice` |
| Hata/401 şekli | geçersiz token: HTTP 401 `{"Message":"Token is invalid."}`; iş hatası: HTTP 200 `{"resultCode":0,"errorText":"...","data":{}}`; başarı: `{"resultCode":1,"errorText":"","data":{...}}` | [İKİNCİL] tcgunel fixture'ları |
| Desteklenen metotlar | yalnız GET ve POST; UPDATE/DELETE yok | [İKİNCİL] Laravel README:389 |
| Rate limit / retry | **dokümante değil** | [RESMİ/parçacık] (yok); Laravel README:392 "Resmi rate limiting bilgisi yok" |
| Sandbox/demo | **bulunamadı** | DOĞRULANAMADI |
| Format | JSON (fixture'lar JSON). Eski bir forum notu (r10.net, parçacık) XML `Accept: application/xml` ile çağrı anlatıyor | [İKİNCİL]; XML DOĞRULANAMADI (muhtemelen eski) |

### B.3 Ürün listesi — `GET /api/b2b/products` [RESMİ/parçacık: "Kayıtlı ürünlerin listesini getiren servistir"; alanlar İKİNCİL (tcgunel fixture, 2024)]
Yanıt: `{ resultCode, errorText, data: { products: [ ... ] } }`. **Sayfalama yok.** Ürün alanları (örnek değerlerle):

| Alan | Tip/örnek | Not |
|---|---|---|
| `id` | GUID dizgi `"BE51CAB5…"` | **varyantlar aynı `id`'yi paylaşır** (fixture: iki "Gömlek" satırı aynı `id`, farklı `code`/`barcode`/`variant`) |
| `isActive` | `1` / `0` | |
| `code` | `"TV001"` stok kodu | boş olabilir |
| `barcode` | `"8690123456789"` | boş olabilir |
| `title` | `"LED Televizyon"` | varyant satırlarında büyük/küçük harf farkı olabilir (`"Gömlek"` / `"GÖMLEK"`) |
| `price` | `1298.00` | **KDV dahil mi hariç mi: DOĞRULANAMADI** (Laravel paketi `getPriceWithTax()` ile hariç varsayar ama "tahmine dayalı") |
| `variantPrice` | `""` / `0` / `4` | varyanta özel fiyat; tcgunel: doluysa `price` yerine kullan |
| `currency` | `"TL"` | para birimi kodu **`TL`** (ISO `TRY` değil) |
| `unit` | `"Adet"` | |
| `tax` | `18.0` | KDV **oranı** (%) |
| `photo` | JSON **dizgisi**: `[{"PhotoUrl","PhotoUrlOriginal","FlCover":true}]` | boş `""` olabilir |
| `description`, `ecommerceDescription` | dizgi | |
| `variantName` | `"EBAT -- RENK"` | özellik adları, ayraç `" -- "` |
| `variant` | `"L-KIRMIZI"`, `"L-YESIL"` | **değer ayracı fixture'da `"-"`** (`" -- "` değil) — DOĞRULANAMADI (fixture elle yazılmış olabilir) |
| `quantity` | `12.000` | ondalık; depo toplamı olduğu varsayılır (DOĞRULANAMADI) |
| `brand` | `"Örnek"` düz metin | |
| `category` | `"Ev Elektroniği"`, `"Hizmet"`, `"Schwarzkopf"` düz metin | tek seviye; hiyerarşi/ID yok |

### B.4 Depo ve stok — [RESMİ/parçacık] + [İKİNCİL] alanlar
- `GET /api/b2b/warehouses` → "Kayıtlı depoların listesini getiren servistir" → `data.warehouses[{ id (GUID), title }]`.
- `GET /api/b2b/inventory/{depo-id}` → "Bir deponun stoklarını getiren servistir"; `{depo-id}` zorunlu, warehouses'tan alınır → `data.inventory[{ id (ürün GUID), title, qty ("12" dizgi) }]`.
- Rezerve/kullanılabilir ayrımı, min/max stok: **yok** (Laravel paketindeki `reserved/available/minStock` kendi uydurmasıdır — README'de itiraf ediliyor).

### B.5 Sipariş/Fatura ekleme (yazma) — `POST /api/b2b/addinvoice` [RESMİ/parçacık + depo API_CONTRACTS §6 + İKİNCİL]
- Açıklama (resmî metin): "Alış veya satış faturası ekleyen metottur. Gönderilen datadaki **müşteri ve ürün bilgileri bizimhesap üzerinde mevcut değilse otomatik olarak oluşturulurlar** ve ardından fatura kaydedilir." → **yan etkili yazma: cari ve stok kartı yaratır.**
- Gövde (camelCase kullanılıyor ikincil istemcilerde; resmî sayfa PascalCase yazıyor — sunucu büyük/küçük harfe duyarsız görünüyor, DOĞRULANAMADI):
  - `firmId` (zorunlu), `invoiceNo` (isteğe bağlı), `invoiceType` (**3 = Satış, 5 = Alış**), `note` (isteğe bağlı)
  - `dates: { invoiceDate (zorunlu), dueDate (zorunlu), deliveryDate (isteğe bağlı) }` — format: resmî örnek ISO 8601 + offset `2017-07-08T18:45:52.516+03:00` (`API_CONTRACTS §6`); tcgunel `Y-m-d\TH:i:s.u` (offset'siz), ismail0234 `Y-m-d\TH:i:s`, Laravel `toIso8601String()` → **ISO 8601 kabul ediliyor; offset'siz de çalışıyor görünüyor (İKİNCİL)**
  - `customer: { customerId (zorunlu; Bizimhesap cari kodu), title (zorunlu), address (zorunlu), taxOffice, taxNo (VKN/TCKN), email, phone }`
  - `details[]: { productId, productName, note, barcode, taxRate, quantity, unitPrice, grossPrice, discount, net, tax, total }` — resmî anlam (parçacık): GrossPrice brüt; **Net = indirim sonrası, KDV hariç**; **Total = Net + KDV**
  - `amounts: { currency ("TL","USD","EUR","CHF","GBP"), gross, discount, net, tax, total }`
- Yanıt: HTTP 200 `{ "url": "https://bizimhesap.com/web/ngn/doc/printout?rc=1&id=…&tp=…", "guid": "…", "error": "", "eInvoiceNo": "" }` — **hata da HTTP 200 ile `error` dolu gelir**. `eInvoiceNo` alanı [İKİNCİL] — e-fatura numarası dönebileceğini ima eder; **API ile e-fatura/e-arşiv kesilip kesilmediği DOĞRULANAMADI** (fixture'da boş).
- **Idempotency anahtarı yok**; tekrar gönderim çift fatura riski (depo API_CONTRACTS §6 aynı tespit).

### B.6 Yalnız ikincil kaynakta görülen uçlar — [İKİNCİL] tcgunel (2024-06), resmî dizinde (llms.txt 5 sayfa) YOK
| Uç | Metot | Açıklama (docblock, resmî dil) | Yanıt |
|---|---|---|---|
| `/api/b2b/customers` | GET, `token` başlığı | "Kayıtlı müşterilerin listesini getiren servistir." | `data.customers[{ id, code, title, address, phone, taxno, taxoffice, authorized, balance ("100.000,00" TR biçimi), email }]` |
| `/api/b2b/abstract/{musteri-id}` | GET | "Bir carinin hesap ekstresini getiren servistir." `{musteri-id}` = cari kodu (= AddInvoice `customerId`) | `data{ title,email,phone,balance,debitSum,creditSum,link, abstract[{trxdate "01.01.2021", type ("Tahsilat","Ödeme","Hesap Açılışı"), note, payment, debit, credit, balance}] }` — **tahsilat OKUMA bu şekilde mümkün; tahsilat YAZMA ucu yok** |
| `/api/b2b/cancelinvoice` | POST gövde `{ FirmId, Guid }` | "Alış veya satış faturası iptal eden metottur. AddInvoice'tan alınan guid ile." | `{ error, status }` — `status` "0" başarı, "1" hata |

Bu üç ucun 2026'da hâlâ açık olup olmadığı **DOĞRULANAMADI** (arama bütçesi bitti; resmî site engelli).

### B.7 Webhook, duyuru, kullanımdan kaldırma
- **Webhook:** hiçbir kaynakta Bizimhesap webhook'u yok. (Laravel paketi CHANGELOG'daki "Webhook support" paketin kendi özelliğidir, Bizimhesap API'si değil.) → DOĞRULANAMADI/yok.
- **Duyuru kanalı:** `duyuru.bizimhesap.com` var (engelli). Arama parçacığı: 2024'te "Hepsiburada entegrasyon altyapı değişikliği" duyurusu (ürün içi pazaryeri modülü; B2B API'yi ilgilendirmiyor).
- **Kaldırılan uç:** bulunamadı. **API değişiklik günlüğü yok.**
- Bizimhesap'ın kendi ürününde pazaryeri (Trendyol/HB) ve e-fatura/e-arşiv modülleri var (arama parçacıkları: "Bizim Hesap ile e-Arşiv faturanızı düzenleyin", `/ozellikler/e-fatura`, `/ozellikler/e-ticaret`) — ancak **bunlar B2B API üzerinden erişilebilir değil** (en azından dokümante değil).

---

## (C) FARKLAR — kod kanıtı, kaynak, önerilen düzeltme

| # | Fark | Kod kanıtı | Kaynak (güven) | Önerilen düzeltme | Öncelik |
|---|---|---|---|---|---|
| C-1 | **Varsayılan host yanlış.** Kod `https://api.bizimhesap.com`; tüm kaynaklar `https://bizimhesap.com/api/b2b`. Tenant `urls.baseUrl` boşsa `GET https://api.bizimhesap.com/products` atılır. `LIVE_READONLY.md:86`'daki **402** muhtemelen bununla/kimlikle ilgili. | `adapterKeys.ts:24 fallbackBaseUrl`; `outboundHosts.ts:37-38` | [RESMİ/parçacık] 4 sayfa URL'si; [İKİNCİL] 3 istemci | `fallbackBaseUrl: 'https://bizimhesap.com/api/b2b'`; `api.bizimhesap.com`'u izinli listeden çıkar (ya da canlı doğrulanana dek yorumla); descriptor `api.hosts` güncelle | P1 |
| C-2 | **Kimlik başlıkları ve ayar eşlemesi.** Resmî: `Key` ve `Token` **aynı API anahtarı**. Kod: `key = settings.key` (ön yüz etiketi "Bizimhesap ID") ve `token = settings.secret` ("API Key") → `Key` başlığına Bizimhesap ID gidiyor. İki ayrı sır toplamak anlamsız; `firmId` ise hiç toplanmıyor (addinvoice için gerekir). | `Service.ts:22-24`; `BizimhesapComponent.vue:13-14`; `index.ts:19` | [RESMİ/parçacık] Genel Bilgiler; [İKİNCİL] tcgunel (yalnız `token`), API_CONTRACTS §6 | Tek `apiKey` ayarı → `Key` ve `Token` başlıklarına aynı değer; `firmId` ayrı ayar (ikincil kaynağa göre API key ile aynı değer olabilir — canlıda doğrula). Ön yüz etiketlerini düzelt; `requiredSettings` güncelle; characterization testi önce | P1 |
| C-3 | **Sipariş listeleme ucu hiçbir kaynakta yok.** Kod Trendyol/Spring tarzı `?page&size` + `{content,totalPages}` bekliyor; mock listesinde `orders`; conformance testi `${baseUrl}/orders/<SELLERID>`. Bizimhesap'ta "sipariş okuma" ucu dokümante değil; **yalnız yazma (addinvoice) var.** | `OrderService.ts:33-57`; `contracts/index.ts:22-26`; `adapterKeys.ts:13`; `tests/conformance/bizimhesap.conformance.test.ts:25`; `index.ts:53-54` | [RESMİ/parçacık] llms.txt 5 sayfa; [İKİNCİL] tcgunel "tüm api metodları" — sipariş okuma yok | `retrieveOrders` → `NOT_SUPPORTED` (ya da `orderListUrl` tanımlı değilse zaten `[]`; descriptor'da `orders` yeteneğini kaldır/`planned` yap); `testConnection`'dan orderListUrl dalını çıkar (yanlış uçla sahte AUTH_FAILED/UNKNOWN üretir); mock listesinden `orders` çıkar; site/registry metinlerinden "siparişleri okuma" iddiasını kaldır | P1 |
| C-4 | **Yanıt zarfı ve hata sözleşmesi işlenmiyor.** Gerçek zarf `{resultCode, errorText, data:{products}}`; iş hatası HTTP **200** + `resultCode:0`. Kod `data.data.products \|\| data.products \|\| data \|\| []` → hata zarfında `data` = `{resultCode:0,errorText,data:{}}` nesnesi "ürün listesi" olarak döner (dizi değil) → `for..of` TypeError ya da sessiz boş sonuç (sahte başarı, ADR-0006 Karar 2'ye aykırı). | `ProductService.ts:30`; `contracts/index.ts:37` (`Array.isArray(b?.data)` dalı gerçek zarfa uymaz) | [İKİNCİL] tcgunel fixture `api_error`, `HandleErrors.php` | `resultCode === 0 \|\| errorText` → `IntegrationError('VALIDATION'/'UNAVAILABLE')`; 401 `{Message}` → `AUTH_FAILED`; `data.products` dizi değilse hata; zod sözleşmesine `resultCode/errorText` ekle | P1 |
| C-5 | **Varyant gruplama anahtarı.** Kod başlığı normalize ederek gruplar; Bizimhesap varyantları **aynı `id`** ile verir ve başlık yazımı farklı olabilir (`Gömlek`/`GÖMLEK`) → aynı ürün iki ürüne bölünür; `mapping.productId` ikisinde de aynı `id` → eşleme çakışması. | `ProductTransformer.ts:103-123` | [İKİNCİL] tcgunel fixture (iki satır aynı `id`) | Gruplama anahtarı `p.id` (fallback title); `maincode` = `id` ya da ilk `code` | P2 |
| C-6 | **Varyant değer ayracı.** Kod `variant.split(' -- ')`; fixture `"L-KIRMIZI"` (`-`). Ad ayracı `" -- "` tutarlı. | `ProductTransformer.ts:28,64` | [İKİNCİL] fixture — DOĞRULANAMADI (gerçek veri gerekir) | Canlı salt-okuma örneğiyle doğrula; ayracı `' -- '` → eşleşmezse `'-'` fallback; eşleşmezlikte `reportUnknownEnum` benzeri gözlem | P2 |
| C-7 | **`variantPrice` ve `currency` yok sayılıyor.** Varyant fiyatı farklıysa yanlış fiyat; para birimi `TL` dışında (`USD/EUR/CHF/GBP` ürünü) `TRY` varsayımı yanlış. | `ProductTransformer.ts:131-147`; `ProductService.ts:83-88` | [İKİNCİL] fixture alanları; [RESMİ/parçacık] para birimi listesi (addinvoice) | `price = variantPrice > 0 ? variantPrice : price`; `currency !== 'TL'` ise uyar/çevir ya da ürünü `incomplete` işaretle | P2 |
| C-8 | **KDV dahil/hariç varsayımı doğrulanmamış.** Kod `price`'ı KDV dahil sayıp `price*100/(100+tax)` ile hariç türetir. Laravel paketi tersini varsayar (kendi itirafıyla tahmin). | `ProductTransformer.ts:144` | DOĞRULANAMADI | Canlı tek ürünle doğrula (panelde KDV dahil/hariç fiyat alanı); varsayımı `descriptor.limitations`'a yaz | P2 |
| C-9 | **Durum eşlemesi boş barkodla çakışır.** `toInternalStatusResult` `matchValue = barcode`; gerçek veride barkod sıkça boş (`""`) → tüm barkodsuz ürünler aynı anahtarda. | `ProductTransformer.ts:175-182`; `index.ts:60` (`MATCHKEY` vars. `barcode`) | [İKİNCİL] fixture (3/4 satır barkodsuz) | `MATCHKEY` için `code` ya da `id` alternatifini destekle; boş anahtarı atla + logla | P2 |
| C-10 | **Depo/stok ucu kullanılmıyor.** `inventory/{depo-id}` ve `warehouses` mevcut; kod `products.quantity`'ye güveniyor (anlamı: toplam mı, varsayılan depo mu — DOĞRULANAMADI). | `ProductService.ts:22-31` | [RESMİ/parçacık] 2 sayfa | Çoklu depo tenant'ları için `warehouses` + `inventory/{id}` ile stok toplama seçeneği (`settings.warehouseId`); mock listesine `warehouses`, `inventory` ekle | P3 |
| C-11 | **Stub'lar `IntegrationError` yerine `{success:false}`/`false` döner** (`approveOrder`, `rejectOrder`, `sendOrderShipping`, `sendOrderInvoice`, claim/mesaj). ERP için bu metotlar anlamsız; ADR-0006 Karar 2 sözleşmesi `NOT_SUPPORTED` ister (Ideasoft/N11 örneği). `retrieveOrderRejectionReasons` uydurma sabit liste. | `index.ts:87-101,141-146` | playbook §4.3 / BACKLOG C9 | `NOT_SUPPORTED` fırlat; sabit listeyi kaldır | P3 |
| C-12 | **Para birimi kodu.** Bizimhesap `"TL"`, bizim model `TRY`. accountingSync'te çeviri gerekir. | `OrderService.ts:131` (`currencyCode:'TRY'`) | [RESMİ/parçacık] addinvoice `Currency: TL, USD, EUR, CHF, GBP` | `TRY↔TL` eşleme tablosu | accountingSync |
| C-13 | **Rate limit `ratePerMin:300` dayanaksız** (`verified:false` doğru işaretli). | `descriptor.ts:51-55` | yok | Olduğu gibi kalsın; canlı 429 gözlenirse düşür | – |
| C-14 | **Descriptor `lastVerifiedAt:'2026-09-28'`** — o tarama da yalnız llms.txt dizinini gördü. | `descriptor.ts:62` | bu rapor | `verificationRef` bu rapora güncellensin; `api.docs` listesine `/products.md`, `/addinvoice.md`, `/warehouses.md`, `/inventory.md` eklensin (izleme) | P3 |

**Kodla uyumlu olanlar (fark yok):** `photo` JSON dizgisi ayrıştırma (`PhotoUrl`), `isActive` 1/0, `tax` oran olarak `taxPercentage`, `quantity` ondalık, kategori/marka düz metin → katalog türetme yaklaşımı, ürün listesinde sayfalama olmaması, `Content-Type: application/json`, POST'ta retry yok (addinvoice idempotent değil — ileride doğru politika).

---

## (D) Rate limit / webhook / sandbox / durum değiştiren uçlar

- **Rate limit:** dokümante değil ([RESMİ/parçacık], [İKİNCİL] Laravel README:392). 429 davranışı bilinmiyor. Öneri: 300/dk üst sınırı koru; ürün listesi tek çağrı olduğu için pratikte risk düşük.
- **Retry/backoff:** resmî yönlendirme yok. GET idempotent; `addinvoice`/`cancelinvoice` **idempotent değil** (anahtar yok) → mevcut "POST'ta retry yok, UNKNOWN_OUTCOME" politikası doğru; tekrar denemeden önce `guid` ile mükerrer kontrolü (bizim tarafta `invoiceNo`/`externalOrderId`→`guid` tablosu) şart.
- **Webhook:** yok (hiçbir kaynakta). Değişiklik tespiti yalnız polling ile.
- **Sandbox/demo hesap:** bulunamadı (DOĞRULANAMADI). Laravel paketinin "test mode"u kendi özelliğidir. Canlı doğrulama için gerçek hesap + salt-okuma GET'ler (products/warehouses/inventory/customers/abstract) kullanılmalı; `addinvoice` **test hesabında bile gerçek fatura ve cari yaratır**.
- **Durum değiştiren uçlar:**
  - `POST addinvoice` — fatura **+ yoksa cari + yoksa stok kartı yaratır** (resmî metin). Stok düşer (satış) / artar (alış) — DOĞRULANAMADI ama fatura mantığı gereği beklenir.
  - `POST cancelinvoice` — fatura iptali ([İKİNCİL]).
  - Okuma gibi görünüp durum değiştiren uç: **tespit edilmedi**. `products`, `warehouses`, `inventory`, `customers`, `abstract` GET'leri yan etkisiz görünür. `abstract` çağrısı yanıtta müşteriye paylaşılabilir `link` (bzmhsp.page.link) döndürür — veri sızıntısı açısından loglanmamalı.
- **Kimlik:** statik anahtar, süresi dolmaz (tokenLifecycle none doğru). 401 gövdesi `{"Message":"Token is invalid."}`.
- **Metot kısıtı:** yalnız GET/POST ([İKİNCİL]).

---

## (E) Kategori/marka kavramı ve eşleme gereksinimi

- **Bizimhesap'ta kategori ve marka:** ürün kartında **düz metin** alanlar (`category`, `brand`); **ayrı kategori/marka API'si yok, ID yok, hiyerarşi yok**. Veri kalitesi düşük olabilir (fixture'da `category:"Schwarzkopf"` — bir marka adı kategori alanında; `category:"Hizmet"` hizmet kalemi).
- **Özellik/varyant:** `variantName`/`variant` çiftiyle kodlanmış, `" -- "` ayraçlı ad listesi; değer ayracı belirsiz (C-6). Varyantlar aynı `id`'li ayrı satırlar.
- **Kodun yaklaşımı doğru yönde** (katalogdan türetme, `ClientIntegration.settings.catalog`'da saklama), ancak:
  1. Kategori `_id` = kategori metni → Türkçe karakter/boşluk/büyük-küçük harf farkları ayrı kategori yaratır. **Öneri:** normalize anahtar (`toUrlFriendly(lower)`) + görünen `title`.
  2. Kategori eşlemesi `mappingProvider.getLocalCategoryId(metin)` ile pazaryeri kategori ağacına bağlanmalı; ERP'den gelen düz metin → yerel kategori eşlemesi **kullanıcı onaylı bir eşleme tablosu** gerektirir (otomatik eşleme güvenilmez). Eşlenmemiş ürünler yayına çıkamaz; Validator'da `category` boşsa `VALIDATION`.
  3. Marka: Trendyol/HB marka ID'leri gerekir; düz metin → marka ID eşlemesi aynı tabloda; boş marka (`""`) sık → varsayılan marka politikası tanımlanmalı.
  4. Özellikler: Bizimhesap varyant adları (`EBAT`, `RENK`) pazaryeri zorunlu attribute'larına (`Beden`, `Renk`) **ad-bazlı eşleme** gerektirir; `options[]` zaten `varianter:true` ile üretiliyor — `AttributeMappingService` tarafında ERP kaynaklı adlar için ayrı eşleme kümesi.
  5. **accountingSync yönünde** (biz → Bizimhesap): `details[].productId` Bizimhesap ürün GUID'i olmalı; eşleşmezse Bizimhesap **yeni stok kartı yaratır** (çift kart riski). Bu yüzden önce `products` ile barkod/stok kodu → `id` eşlemesi yapılmalı; eşleşmeyen satırda fatura gönderimi durdurulmalı (ya da bilinçli "yeni kart aç" seçeneği).

---

## (F) Erişilemeyen kaynaklar ve doğrulanamayanlar

### F.1 Erişilemeyen (egress proxy 403 / engelli), 2026-10-03
- `https://apidocs.bizimhesap.com/` ve tüm alt sayfalar (`/llms.txt`, `/products.md`, `/inventory.md`, `/addinvoice`, `/warehouses`, `/master.md`) — **resmî doküman**
- `https://bizimhesap.com/*` (`/ozellikler/e-fatura`, `/blog/...`) ve `https://duyuru.bizimhesap.com/*`
- `https://r.jina.ai/*` (proxy-okuyucu)
- İkincil yardım sayfaları: `support.agesoft.com.tr`, `www.sopyo.com`, `infoset.help`, `www.r10.net`, `yandex.com.tr/yacevap`, `www.eticaretkur.com`, `www.sitebizden.com`, `www.jetstok.com`, `wordpress.org/plugins/eticaret-kapisi-price-bridge-bizimhesap`, `ismail0234.github.io`, `bitrix24.it`
- `gh api` (GitHub REST) oturumda yetkisiz; depolar anonim `git clone` ile alındı.

### F.2 Erişilen
- `github.com/sitesepetim/bizimhesap-laravel` (sayfa + klon), `github.com/tcgunel/bizimhesap-b2b` (sayfa + klon), `github.com/ismail0234/bizimhesap-efatura-php-api` (klon), `github.com/musda84-glitch/tamkobi/pull/108` (sayfa), `packagist.org/packages/vizyontech/bizimhesap-laravel`
- Arama motoru parçacıkları (apidocs içeriği, 2026-10-03) — WebSearch bütçesi (200) bu görev içinde tükendi.

### F.3 Doğrulanamayanlar (tahmin yazılmadı)
1. `Key`/`Token` başlıklarının **tam** anlamı ve `FirmId`'nin API anahtarı ile aynı olup olmadığı (resmî parçacık "eşdeğer" diyor; Laravel paketi sabit bir `Key` kullanıyor — çelişki).
2. `api.bizimhesap.com` host'unun var olup olmadığı (hiçbir kaynakta yok; `LIVE_READONLY` 402'nin nedeni).
3. `customers`, `abstract/{id}`, `cancelinvoice` uçlarının 2026'da açık olup olmadığı (yalnız 2024 tarihli ikincil kaynak).
4. Ürün `price` alanının KDV dahil/hariç olduğu; `quantity`'nin depo toplamı olup olmadığı.
5. `variant` değer ayracı (`-` mi `" -- "` mi).
6. `addinvoice` tarih formatında offset zorunluluğu; gövde alan adlarında büyük/küçük harf duyarlılığı.
7. `eInvoiceNo` ile e-fatura/e-arşiv kesiminin API'den tetiklenebilirliği (fixture'da boş; resmî sayfada görülmedi).
8. Rate limit, 429 davranışı, sandbox varlığı, webhook (tümü "bulunamadı").
9. XML yanıt desteği (eski forum notu).
10. `duyuru.bizimhesap.com`'da API'yi etkileyen 2025-2026 duyurusu olup olmadığı.

### F.4 Önerilen yerel doğrulama adımı (bulut oturumunda yapılamaz)
Gerçek tenant anahtarıyla, yalnız GET: `GET https://bizimhesap.com/api/b2b/products` (başlıklar `Key`+`Token` = aynı API anahtarı) → zarf/alanları kaydet (barkod/fiyat/KDV/varyant ayracı); `GET .../warehouses`, `GET .../inventory/{id}`, `GET .../customers` (açık mı?). `addinvoice`/`cancelinvoice` **çalıştırılmaz**. Sonuçlar `docs/research/` altına ham örnekle (PII maskeli) eklenir ve C-1…C-9 düzeltmeleri characterization testleriyle yapılır.

---

## Kaynak listesi (erişim 2026-10-03)
- [RESMİ/parçacık] https://apidocs.bizimhesap.com/ · /products · /warehouses · /inventory · /addinvoice · /llms.txt (arama dizini üzerinden; doğrudan erişim engelli)
- [İKİNCİL] https://github.com/tcgunel/bizimhesap-b2b (commit 53a3c0d, 2024-06-12) — `tests/Unit/BizimHesapB2bTest.php`, `src/BizimHesapB2b*.php`, `src/Models/**`
- [İKİNCİL] https://github.com/sitesepetim/bizimhesap-laravel (commit 1e9ed7a, 2025-09-17) — `README.md`, `src/Config/bizimhesap.php`, `src/Services/*.php`; https://packagist.org/packages/vizyontech/bizimhesap-laravel
- [İKİNCİL] https://github.com/ismail0234/bizimhesap-efatura-php-api (commit 131cbcf, 2022-01-20)
- [İKİNCİL] https://github.com/musda84-glitch/tamkobi/pull/108 (ürün/stok/resim aktarımı; token tabanlı)
- Depo içi: `docs/research/API_CONTRACTS_2026-09-30.md` §6; `docs/research/2026-09-27-api-verification.md`; `docs/research/2026-09-28-integration-deadlines-scan.md` §7; `docs/LIVE_READONLY.md:86`; `docs/INTEGRATION_PLAYBOOK.md:278,666`; `docs/INTEGRATION_CATEGORY_MODEL.md:31,73,152`

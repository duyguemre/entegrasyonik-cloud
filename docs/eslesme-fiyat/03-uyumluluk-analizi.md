# 03 — Request/Response uyumluluk analizi (Bölüm 12, adım 5; Bölüm 6 ve 7)

Tarih: 2026-10-03 · Dal: `feature/eslesme-fiyat-yeniden-yapilandirma` · Ortam: bulut kopyası.

## 0. Yöntem ve sınırlar (önce oku)

- **Canlı okuma bu ortamda YAPILAMADI.** Bulut ortamında hiçbir pazaryeri/DB/Redis anahtarı yok (ortam değişkenleri boş). Bu belge
  **statik** karşılaştırmadır: adaptör kodu ↔ güncel doküman raporları (`02-ekler/*.md`, `API_HEPSIBURADA.md`, `API_IDEASOFT.md`) ↔
  Entegrasyonik veri modeli (`01-ekler/A,B,E`). Gerçek yanıt örneği depoda yok; testlerdeki fikstürler sentetiktir (Ek E §E).
- Tek canlı kanıt: 2026-10-03 yerel salt-okuma turu (docs/LIVE_READONLY.md): Trendyol/HB/N11 bağlantı OK; HB OMS host'u doğrulandı;
  Pazarama anahtarı geçersiz, Ideasoft token süresi dolmuş, Bizimhesap 402. Siparişler/iadeler o turda çekilmedi.
- Doküman tarafının güvenilirliği entegrasyona göre değişir: Trendyol (resmî sayfalar, güçlü), HB (portaldan yakalanmış OpenAPI kopyası + prod'da
  doğrulanmış SDK, orta-güçlü), N11/Pazarama (resmî sayfa alıntıları + ikincil, orta), Ideasoft (üçüncü taraf OpenAPI kopyası, zayıf), Bizimhesap (5 sayfalık resmî doküman + ikincil, zayıf).
- Durum sözlüğü: **UYUMLU** (alan/uç eşleşiyor), **KISMEN** (çalışır ama veri/alan kaybı), **KIRIK** (kod yolu dokümanla uyuşmuyor; canlıda büyük olasılıkla hata), **YOK** (platform sağlıyor, bizde yok), **N/A** (platform sağlamıyor), **?** (doğrulanamadı).
- Bölüm 2 kuralı: canlıda yazma yok. Yazma uçlarının uyumu yalnız doküman + mock + (varsa) sandbox ile değerlendirildi.

## 1. Entegrasyon × modül matrisi

| Modül | Trendyol | Hepsiburada | N11 | Pazarama | Ideasoft | Bizimhesap |
|---|---|---|---|---|---|---|
| Ürün çekme (import) | KISMEN (V2 alanları; varyant/özellik eşleme ADR-0025) | **KIRIK** (listing'de ürün bilgisi yok; Stager'a iç model) HB K-3 | **KIRIK** (`convertToInternalModel` boş; sayfalama `pageSize/currentPage`) N11 C-3 | KISMEN (`page/size` küçük harf, `Approved` yok) PZ C-5 | **KIRIK** (`parent`sız → `ideasoft_undefined`; taban adres/token) IS K-1,2,8 | KISMEN (sayfalama yok; varyantlar aynı `id`; host `api.bizimhesap.com` kanıtsız) |
| Ürün gönderme (export) | KISMEN (V2 doğru; `origin` 23.10 zorunlu; çoklu değer yok; rate kovaları eksik) TY C-* | **KIRIK** (kategori/marka kaynağı, zorunlu denetim yok) HB K-4,5 | **KIRIK** (attributes/shipmentTemplate/vatRate yok) N11 C-1 | KISMEN (attributes çift alan, `isRequired` okunmuyor, batch sonucu hep COMPLETED) PZ C-6,7,9 | KISMEN (sözleşme kanıtsız; `price1 = minPrice`; görsel ?) | N/A (yalnız okuma) |
| Fiyat / stok | KISMEN (barkod 30/dk kovası yok; aynı gövde 15 dk kuralı) | KISMEN (sonuç yolu `/id/`; `priceValidations` okunmuyor) HB K-11 | KISMEN (stok güncellemesi fiyat da yollar; `currencyType` yok) N11 C-13 | **KIRIK** (stok → fiyat ucuna; batch sonucu ucu uydurma) PZ C-3,4 | KISMEN (kısmi PUT semantiği ?) | N/A |
| Sipariş çekme | UYUMLU/KISMEN (V2 ✓; `paymentMethod/commercial/split/packageHistories/invoiceNumber` normalize değil) Ek E C-1 | KISMEN (`/cancelled` çekilmiyor; tarih biçimi; indirim/vergi/kargo 0) HB K-10,15 | KISMEN (`page/size` adları; pencere kuralı; `UnPacked`) N11 C-5,6,8 | KISMEN (adres sözlüğü tek kaynak; durum kodları kanıtsız; aralık sınırsız) PZ C-10,13,14 | **KIRIK** (alan adları hiç örtüşmüyor → siparişler atlanır) IS K-3 | KISMEN (zamanlanmıyor; listeleme ucu resmî dizinde yok; durum hep AWAITING) |
| Sipariş yazma (onay/ret/kargo) | KISMEN (onay platform_auto ✓; kargo hiç gönderilmiyor ama success; ret `reasonId` kataloğu yanlış) Ek E F-P0-2, F-P1-4 | **KIRIK** (iptal ucu dokümanda yok; kargo takip gönderilmiyor) HB K-7,8 | YOK→VAR (REST `PUT order/v1/update` Picking mevcut, kodda NS) N11 C-7; kargo SOAP gövdesi uyumsuz C-9 | KISMEN (yalnız ilk kalem; ret `ProductId` gönderiyor) PZ C-11, Ek E F-P0-4 | ? (durum değerleri kanıtsız) | N/A |
| İade (claim) | KISMEN (`claimId` kökü; statü ilk kalemden; `Accepted` ölü dal; 23.09.2026 yeni red sebepleri) TY B.7 | KISMEN (onay/ret yolu; `beginDate`; `AwaitingPreApproval`) HB K-9 | **KIRIK** (mapper yok → OrderWorker TypeError) Ek E F-P0-1 | KISMEN (durum 9/6/8 bilinmiyor; `sendToReview` ulaşılamaz) PZ C-16 | YOK (`/order_refund_requests` var, bizde `[]`) IS K-6 | N/A |
| Fatura | KISMEN (`seller-invoice-links` ✓; `invoiceNumber/invoiceDateTime` mikro ihracatta zorunlu; 409 ele alınmıyor; fatura reddi okunmuyor) | **KIRIK** (`orders/.../invoices` dokümanda yok; `PUT packages/.../invoice` gerekir) HB K-6 | KISMEN (SOAP ✓; e-ihracat zorunlu alanlar yok; URL kısıtları) N11 C-10 | KISMEN (`orderid` GUID yerine OrderNumber) PZ C-12 | NS (okuma `/invoices` var, bizde yok) | N/A (addinvoice = yazma, kapsam dışı) |
| Finans | KISMEN (Sale/Return + 4 tür; Discount/Coupon/Provision yok; `storeFrontCode`; 100/dk) TY B.9 | **KIRIK** (host/uç: `mpfinance-external /transactions`) HB K-1 | KISMEN (SOAP `GetSettlementList`; `externalId = tarih`) Ek E F-P1-7 | KISMEN (yalnız `paymentAgreement`; uçlar kanıtsız) PZ C-17 | N/A | N/A |
| Mesaj / soru | KISMEN (tek sayfa `size=50`; `REPORTED/UNANSWERED` yok) TY B.8 | **KIRIK** (host/uç: `api-asktoseller-merchant /issues`) HB K-2 | ? (SOAP `GetProductQuestionList` kapandı mı belirsiz; tarih `new Date()`) N11 C-12 | KISMEN (`Search` POST kanıtlı, GET kanıtsız; `WAITING_APPROVAL` enum dışı) PZ C-17 | N/A | N/A |
| Webhook | VAR (yalnız sipariş; alıcı var, abonelik elle) | VAR (12 olay; bizde yok) | YOK | YOK | VAR (41 konu, HMAC; bizde yok) | YOK |
| Sandbox | VAR (stage + IP whitelist) | VAR (`-sit` host'ları) | YOK | YOK | YOK (demo mağaza talep) | YOK |

Kısaltma referansları: `TY C-n` = 02-ekler/trendyol.md §C; `HB K-n` = API_HEPSIBURADA.md §10; `N11 C-n` = 02-ekler/n11.md §C; `PZ C-n` = 02-ekler/pazarama.md §C;
`IS K-n` = API_IDEASOFT.md §Kod karşılaştırması; `Ek E` = 01-ekler/E-siparis-iade-fatura-finans-mesaj.md.

## 2. Ürün çekme ve gönderme — alan alan (Bölüm 6)

### 2.1 Ortak veri modeli ile çapraz uyumsuzluklar

| Konu | Entegrasyonik modeli | Platformlar | Uyumsuzluk / düzeltme kimliği |
|---|---|---|---|
| Para / ondalık | `Number` float TL, para birimi alanı yok (Ek B §B) | TY number (2 ondalık), HB import `"130,50"` string, N11 `currencyType`, PZ `VatRate` 0/1/10/20, IS `currency:{id}` | Yazımda yuvarlama yok, canlıya giderken yuvarlanıyor (N11 hariç). **D-PRICE-1**: kuruş-tamsayı saklama ya da yazımda `round2`; para birimi sabit TRY açıkça modele. |
| KDV | `Products.taxPercentage` default 0 = "ayarsız" (Ek B P1-3) | TY 0/1/10/20 (0 geçerli), HB `tax_vat_rate` string, PZ 0/1/10/20, IS `tax`+`taxIncluded` | Kanal başına farklı varsayılan (20/18). **D-PRICE-2**: `taxPercentage: null` = ayarsız; preflight zorunlu; sessiz varsayılan kaldırılır. |
| Barkod / stok kodu | `barcode` sparse unique, `stockcode` sparse unique, `maincode` ürün | TY barcode ≤40 (`. - _`), stockCode ≤100; N11 stockCode ≤255; HB merchantSku; PZ `Code`/`GroupCode` | Uzunluk/karakter doğrulaması yok. **D-VAL-1**: kanal bazlı alan kısıtları preflight'ta. |
| Varyant grubu | `maincode` + `choices[]` + `variantHash` | TY `productMainId` + varianter; HB `VaryantGroupID` + `*_variant_property`; N11 `productMainId`; PZ `GroupCode`; IS `parent.id` + `optionGroups` | HB/N11 import'ta `choices` hep `[]` (Ek A P1-8). **D-IMP-1**: her adaptörde varyant özelliği → yerel Choice çözümü (Trendyol kalıbı). |
| Görseller | `images[]` ham (string/nesne karışık) | TY ≤8 HTTPS 1200×1800; HB Image1..10 URL; N11 `images[]`; PZ `images[].imageurl`; IS `attachment` (?) | Sayı/boyut denetimi yok. **D-VAL-2**: preflight görsel sayısı/HTTPS kontrolü (kanal kataloğundan). |
| Zorunlu özellik | Yalnız TY+PZ denetler (Ek A P1-5) | TY `required`, HB `mandatory` (3 kova), N11 `isMandatory`, PZ `required/isRequired`, IS yok | **D-MAP-3**: tek `prepareAttributes` sözleşmesi (adaptör bağımsız) + preflight. |
| Çoklu değer | Tek değer (Ek A P1-12) | TY `allowMultipleAttributeValues`→`attributeValueIds`; HB `multiValue`; diğerleri tek | **D-MAP-5**: çoklu değer desteği (TY/HB), yoksa açık uyarı. |
| Sayfalama / tavan | `paginate.ts` (page/offset/cursor, tavan → incomplete) | TY ≤200/sayfa, 10k tavanı; HB offset/limit 100 (paket 10); N11 `page/size` ≤250/100; PZ `Page/Size` PascalCase; IS `limit≤100` | N11 ve PZ parametre adları kodda yanlış (N11 C-3/5, PZ C-5). **D-PAGE-1**. |
| Hata biçimi | Düz metin + `errorType` (Ek A P1-6) | TY `batch-requests` kalem `failureReasons[]`; HB `validationResults[].attributeName`; N11 `reasons[]`; PZ `batchResult[].message`; IS 422 gövdesi | Pazaryeri hata metinleri ham ve çevrilmemiş. **D-ERR-1**: yapılandırılmış hata sözleşmesi `{code, reason, field?, solution, link}` + adaptör hata kodu tabloları. |

### 2.2 Round-trip (çek → gönder) veri kaybı — entegrasyon başına

Round-trip, "platformdan çekilen ürünün, aynı platforma gönderim payload'ına dönüştürülünce hangi alanları kaybettiği"dir (yalnız kod içinde; yazma yok).

| Entegrasyon | Kaybolan / bozulan alanlar | Kaynak |
|---|---|---|
| Trendyol | `productMainId` ↔ `maincode` ✓; `listPrice/salePrice` ✓; `vatRate` ✓ (0 dahil); `dimensionalWeight` ✓ (?); **kayıp:** `origin` (23.10 zorunlu, import'ta okunmuyor), `deliveryOption`, `cargoProviders`, `lotNumber`, çoklu değer (`attributeValueIds` → tek), `channels` CORE/LUXE, görsel sırası (?) | TY B.3, Ek A P1-12 |
| Hepsiburada | **Çekilen listing'de ürün bilgisi yok** → round-trip kurulamaz (ad/kategori/marka/görsel boş); fiyat `number` → `"130,50"` ✓; `VaryantGroupID` ← `maincode` ✓; **kayıp:** `kg/GarantiSuresi` (sessiz 1/24 varsayılan), varyant özellikleri (`*_variant_property` çözülmüyor) | HB K-3,5; Ek A P1-7 |
| N11 | Import boş (stub) → round-trip yok; export gövdesi zaten eksik (attributes/shipmentTemplate/vatRate) | N11 C-1,3 |
| Pazarama | `Code/GroupCode/ListPrice/SalePrice/StockCount` ✓; **kayıp:** `Desi` (sabit 1), `DeliveryType`, `VatRate` (varsayılan 20), `attributes` (hem `attributeValueId` hem `customAttributeValue` gidiyor) | PZ C-6,15 |
| Ideasoft | `price1` ✓ (KDV dahil/hariç ?), `stockAmount` ✓; **kayıp:** `discount/discountType`, görseller (ham), `optionGroups` (sözleşme ?), `detail` (açıklama), `parent` ilişkisi (`ideasoft_undefined`) | IS K-8,9 |
| Bizimhesap | Yalnız okuma; `platforms.bizimhesap.prices = {}` truthy tuzağı | Ek B P2-6 |

### 2.3 Entegrasyon başına ürün çekme/gönderme bulgu özeti (düzeltme kimlikleriyle)

- **Trendyol (TY):** V2 uyumlu; kritik takvim: ürün V1 ve sipariş V1 **15 Ekim 2026** kapanışı (kodda V2 ✓), `origin` **23 Ekim 2026** zorunlu (**D-TY-1**), rate kovaları eksik: marka/kategori 50/dk, iade onay/red 5/dk, soru cevap 500/dk (**D-TY-2**), `storeFrontCode` değeri `TR` vs `1` çelişkisi (**D-TY-3**, yerelde doğrulanır), marka listesi `size` 1000–2000 (**D-TY-4**), 429'da `Retry-After` yok → kendi backoff (**D-TY-5**).
- **Hepsiburada (HB):** D-HB-1 (import kaynağı: katalog + listing birleşimi), D-HB-2 (kategori/özellik/marka: AttributeMappings + 3 kova + zorunlu denetim + `Marka` = ad), D-HB-3 (fiyat/stok sonuç yolu + `priceValidations`), D-HB-4 (ürün güncelleme ticket-api Bearer — `limited`), D-HB-5 (host listesi + SIT).
- **N11:** D-N11-1 (export gövdesi: attributes/shipmentTemplate/vatRate/productMainId), D-N11-2 (import: `page/size`, `content[]`, `convertToInternalModel`), D-N11-3 (task-details POST + `itemCode` + liveReadonly okuma istisnası), D-N11-4 (marka = özellik id 1, serbest metin).
- **Pazarama (PZ):** D-PZ-1 (token `scope` + sarmalı yanıt), D-PZ-2 (marka listesi `Page/Size/name`), D-PZ-3 (stok → `product/updateStock`), D-PZ-4 (batch sonucu ucu → `getProductBatchResult`), D-PZ-5 (`Page/Size/Approved` PascalCase), D-PZ-6 (attributes tek alan + `isRequired`), D-PZ-7 (batch `isSuccess`).
- **Ideasoft (IS):** D-IS-1 (taban `/admin-api` + token `/oauth/v2/token` + `/panel/auth`), D-IS-2 (`maincode = ideasoft_<id>`), D-IS-3 (`taxIncluded/discount`), D-IS-4 (varyant/görsel sözleşmesi — test mağazası sonrası).
- **Bizimhesap (BH):** D-BH-1 (taban `bizimhesap.com/api/b2b` kanıtı; `Key`+`Token` başlıkları; 402 canlı), D-BH-2 (varyant aynı `id` → `maincode` türetimi), yalnız okuma.

## 3. Sipariş, iade, fatura, finans, mesaj — uyumluluk (Bölüm 7)

### 3.1 Ortak model boşlukları (tüm kanallar)

| Konu | Durum | Düzeltme |
|---|---|---|
| İdempotency | Order/Claim/Message/Financial unique ✓; **Invoice yok** (yalnız `ettn`) | **D-ORD-1**: `Invoices {integrationCode, externalOrderId, type}` unique (göç) |
| Denetim izi | `Orders.history` şemada yok → `$push` düşer; Claim `history` `$setOnInsert` | **D-ORD-2**: `history[]` şeması (kim/ne zaman/ne) + repo güncellemesi |
| Normalize edilmeyen alanlar | `meta` ham (TY iade/finans ve N11 iade/mesaj/finans hariç) | **D-ORD-3**: `paymentMethod, commercial, invoiceNumber/Status, taxAmount, cargoAmount, splitFrom(originPackageIds), channel` normalize alanlar |
| Durum sözlükleri | Kanal başına farklı semantik; `WAITING_APPROVAL` şema dışı; HB `AwaitingPreApproval`, TY `UnPacked`, IS string/sayı karışık | **D-ORD-4**: durum eşleme tabloları tek dosyada, `reportUnknownEnum` her kanalda, yeni iç durumlar (PRE_APPROVAL, SPLIT) |
| Sebep katalogları | Tek RPC hem iptal hem iade reddi (Ek E F-P1-4); TY 23.09.2026 yeni kodlar | **D-ORD-5**: `getOrderCancelReasons` ve `getClaimRejectReasons` ayrı; TY canlı katalog |
| Kargo bildirimi sözleşmesi | `lineItems/orderItemId/packageNumber` gönderilmiyor; TY her sipariş "pazaryeri lojistiği" | **D-ORD-6**: `ISendShippingPayload` zenginleştirme + TY satıcı kargo modeli kararı (K-D) |
| Finans idempotency | HB `String(id\|\|'')`, N11 tarih, TY `id?` | **D-FIN-1**: `externalId` zorunlu, yoksa satır atlanır + rapor |
| Fatura okuma | Hiçbir kanalda pazaryerinden fatura okunmuyor | TY `invoiceStatus/invoiceNumber` (D-ORD-3), HB `missing-invoice` (opsiyonel), IS `/invoices` (opsiyonel) |

### 3.2 Kanal başına

| Kanal | Sipariş | İade | Fatura | Finans | Mesaj |
|---|---|---|---|---|---|
| TY | V2 ✓; D-ORD-3 alanları; split paket ilişkisi; `orderDate` −3 sa yönü (?) | `claimId` kökü ✓; statü ilk kalemden (**D-TY-6** kalem düzeyi durum); onay 5/dk kovası; sebepler 23.09.2026 (**D-TY-7**) | ✓; 409 ve mikro ihracat zorunlu alanlar (**D-TY-8**) | Sale/Return + 4 tür; Discount/Coupon/Provision ekle; `settlements-by-payment` sayfalı (**D-TY-9**) | tek sayfa → sayfalı; REPORTED/UNANSWERED (**D-TY-10**) |
| HB | `/cancelled` imleci (**D-HB-6**); tarih `YYYY-MM-DD HH:mm` TR (**D-HB-7**) | yol/parametre/durum (**D-HB-8**) | `PUT packages/.../invoice` + packageNumber (**D-HB-9**) | mpfinance (**D-HB-10**) | asktoseller (**D-HB-11**) |
| N11 | `page/size`, ≤15 gün dilim, `UnPacked`; REST onay (**D-N11-5**); kargo SOAP gövdesi (**D-N11-6**) | mapper + sayfa 20 (**D-N11-7**, P0) | e-ihracat zorunlu alanlar (**D-N11-8**) | SOAP ✓; `externalId` (D-FIN-1) | SOAP durumu yerelde doğrulanır; tarih yanıttan (**D-N11-9**) |
| PZ | adres sözlüğü takma adları; ≤30 gün dilim; durum enum canlıdan (**D-PZ-8**); onay/ret `updateOrderStatusList` + `OrderItemId` (**D-PZ-9**, P0 oversell) | `RefundStatus` 9/6/8 (?) ; `sendToReview` ya bağla ya sil (**D-PZ-10**) | `orderid` = GUID `meta.OrderId` (**D-PZ-11**) | `otherfinancials` çağır; uçlar kanıtsız (**D-PZ-12**) | `Search` POST'a taşı (**D-PZ-13**) |
| IS | alan takma adları (**D-IS-5**, P0); `startUpdatedAt` artımlı (**D-IS-6**); durum enum (?) | `not_supported` → ileride `/order_refund_requests` okuma | NS | NS (fırlat) | NS (fırlat) |
| BH | zamanlanmıyor; listeleme ucu kanıtsız; durum hep AWAITING (**D-BH-3**) | NS | NS | NS | NS |

NS = `not_supported` olarak açıkça yazılır ve metot `NOT_SUPPORTED` fırlatır (INTEGRATION_CATEGORY_MODEL §3); sessiz `[]` kaldırılır (**D-CAP-1**).

### 3.3 Durum değiştiren "okuma" uçları (Bölüm 2 denetimi)

Kodda sipariş "alındı" işaretleme, soru "okundu", kuyruk tüketimi yapan gizli uç **bulunmadı** (Ek E §D; TY `orders/stream` kullanılmıyor). Dikkat listesi:
- HB `GET packages/.../labels` etiket üretir (yan etki ?) → canlı okuma turunda **çağrılmaz**.
- HB `POST check-product-status`, PZ `getOrdersForApi/getRefund/paymentAgreement/finance/*`, N11 `task-details/page-query` (POST), TY `POST buybox-information`: okuma amaçlı POST'lar; `liveReadonlyPolicy` izin listesi N11 task-details için güncellenmeli (D-N11-3).
- TY `POST price-and-inventory` aynı gövde 15 dk hata; `PUT shipment-packages` (Picking/Invoiced) kodda yok (iyi).

## 4. Çekim süreleri için platform kısıtları (Bölüm 8 girdisi)

| Kanal | Sipariş okuma limiti | Pencere kuralı | Webhook | Not |
|---|---|---|---|---|
| TY | getShipmentPackages 30–100/dk (kademe), stream 1000/dk; iade 1000/dk; soru 1000/dk; finans 100/dk | ≤2 hafta, tavan 10k; finans ≤15 gün | 13 sipariş olayı; 13 hata → pasif; HMAC yok | stream (cursor) sipariş yoklaması için daha ucuz (**D-TY-11**, değerlendirme) |
| HB | resmî tablo yok; upload ≤5 bekleyen; SDK varsayılanı orders 120/dk | finans ≤1 ay | 12 olay (PUT), 5 sn 2xx | paylaşımlı IP'de 520 riski |
| N11 | shipmentPackages 1000/dk | 15 gün / 1 ay çelişkili; Kasım 2024 öncesi yok | yok | SOAP tavanı bilinmiyor |
| PZ | bilinmiyor (Servis Limitleri sayfası okunamadı) | sipariş ≤31 gün (?) | yok | `verified:false` kalır |
| IS | 429 var, sayı yok | — | 41 konu, HMAC | token yenileme eski refresh'i tüketir → tek pod |
| BH | yok | sayfalama yok | yok | zamanlanmaz |

## 5. Canlı ortamda kullanıcının test edeceği maddeler (Bölüm 6/7 "canlı doğrulama" listesi; yalnız OKUMA)

Yerelde `npm run start:live-readonly` ile; her madde için yanıtın PII temizlenmiş kopyası `backend/tests/fixtures/<kanal>/` altına sözleşme fikstürü olarak kaydedilir (PLAN §7).

| # | Kanal | Çağrı (GET / okuma) | Ne doğrulanır |
|---|---|---|---|
| L-1 | TY | `GET product/categories/{id}/attributes` (V2) | gömülü `attributeValues` var mı; `allowMultipleAttributeValues` |
| L-2 | TY | `GET product/brands?page=0&size=1000` | sayfa boyutu kabulü; `luxe` alanı |
| L-3 | TY | `GET order/sellers/{id}/v2/orders?size=1` + `storeFrontCode` TR/1 | D-TY-3; `paymentMethod/commercial/createdBy` alanları |
| L-4 | TY | `GET order/sellers/{id}/claims?size=1`, `GET order/claim-issue-reasons` | `claimId` kökü, yeni sebep kodları |
| L-5 | TY | `GET finance/che/.../settlements` (15 gün, `transactionTypes` çoklu) | alan listesi; Discount/Coupon türleri |
| L-6 | HB | `GET mpop /api/products/all-products-of-merchant/{m}?page=0&size=1` | ürün bilgisi alanları (D-HB-1) |
| L-7 | HB | `GET listing-external /listings/merchantid/{m}?offset=0&limit=1` | `availableStock/isSalable/isFulfilledByHB` |
| L-8 | HB | `GET mpop /api/categories/{id}/attribute/{attrId}/values?page=0&size=10` | tekil `attribute` yolu (D-HB-2) |
| L-9 | HB | `GET oms-external /orders/merchantid/{m}?begindate=...&limit=1`, `/cancelled?limit=1` | tarih biçimi/parametre adı duyarlılığı; iptal listesi |
| L-10 | HB | `GET oms-external /claims/merchantId/{m}?offset=0&limit=1` | alanlar, `AwaitingPreApproval` |
| L-11 | HB | `GET mpfinance-external /transactions/merchantid/{m}?Offset=0&Limit=1&...` | host/uç (D-HB-10) |
| L-12 | HB | `GET api-asktoseller-merchant /api/v1.0/issues?size=1` (+`merchantId` başlığı) | host/uç (D-HB-11) |
| L-13 | N11 | `GET /ms/product-query?page=0&size=1` | `content[]/totalPages`, `productStatus` |
| L-14 | N11 | `GET /rest/delivery/v1/shipmentPackages?page=0&size=1&startDate&endDate` | parametre adları; pencere kuralı (15 gün/1 ay) |
| L-15 | N11 | `GET /cdn/category/{id}/attribute` | `attributeValues` gömülü; Marka `attributeId:1` |
| L-16 | N11 | SOAP `GetProductQuestionListRequest`, `ClaimReturnListRequest` (allowlist'te) | hâlâ çalışıyor mu; alan adları |
| L-17 | PZ | token (`scope` ile) + `GET brand/getBrands?Page=1&Size=100` | D-PZ-1/2 (önce anahtar yenilenmeli: canlı tur "geçersiz anahtar") |
| L-18 | PZ | `GET product/products?Approved=true&Page=1&Size=1` | PascalCase kabulü |
| L-19 | PZ | `POST order/getOrdersForApi` (1 gün) | adres sözlüğü, durum kodları |
| L-20 (SONRA, K-H) | IS | `urls.baseUrl/tokenUrl` DB kontrolü → `LIVE_READONLY_ALLOW_TOKEN_REFRESH=ideasoft` ile tek yenileme → `GET /admin-api/orders?limit=1`, `/products?limit=1`, `/brands?limit=1` | D-IS-1/5 (token süresi dolmuş; yenileme üretimi bozabilir — **kullanıcı kararı**) |
| L-21 | BH | `GET https://bizimhesap.com/api/b2b/products` (`Key`+`Token`) | host/başlık (canlı 402'nin nedeni) |

**Çağrılmayacaklar:** HB `labels`, HB/TY/PZ/N11 tüm POST/PUT yazma uçları, TY `PUT shipment-packages`, IS `PUT orders/{id}`, PZ `product/create`.

## 6. Düzeltme kimlikleri → PLAN eşlemesi

Bu belgedeki `D-*` kimlikleri `PLAN.md` §6 iş paketlerinde kullanılır. Öncelik: P0 (canlıda kırık/yanlış veri) → P1 → P2. Yazma içeren her düzeltme
(fatura, iptal, kargo, onay) yalnız mock + sandbox (TY stage, HB SIT) ile doğrulanır; canlı yazma kullanıcı testine bırakılır.

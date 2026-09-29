# Trendyol V2 Geçiş Spesifikasyonu (Sipariş V2 + Ürün V2)

Tarih: 2026-09-28. Hazırlayan: dış araştırma uzmanı (kod yazılmadı; yalnızca doküman + statik kod okuma).
Kapsam: yalnızca resmi `developers.trendyol.com` sayfaları. Kod referansları `backend/src/integration/modules/marketplace/trendyol/` altındadır (aşağıda `T/`).

Kanıt sınıfı: **A** = sayfa doğrudan çekildi (WebFetch; küçük model özeti, kritik değerler birden fazla sayfayla çapraz doğrulandı), **B** = arama özeti, **C** = 3. taraf. Aksi belirtilmedikçe her satır A'dır. "Doğrulanamadı" = resmi sayfalarda görülemedi veya sayfalar birbiriyle çelişiyor.

> Yöntem notu: WebFetch küçük modelle özetlediği için tarih/sayı/alan adı gerektiğinde ikinci bir sayfayla çapraz doğrulandı. `.md` uzantılı sayfa sürümleri ve `https://developers.trendyol.com/llms.txt` (tam sayfa indeksi) çekilebiliyor. Dikkat: `https://developers.trendyol.com/changelog/changelog.md` içeriği 2026 girdilerini İÇERMİYOR (bayat); güncel changelog `https://developers.trendyol.com/v2.0/changelog/changelog` adresinde.

---

## 0. Yönetici özeti

- **Bugün 2026-09-28; 15 Ekim 2026'ya 17 gün var.** Sipariş V1 (`.../orders`) ve Ürün V1 (aktarma, güncelleme, filtreleme, kategori-özellik V1) 15 Ekim 2026'da kapanıyor. Ayrıca 23 Ekim 2026'da `origin` alanı zorunlu.
- Oran limitleri 14 Eylül 2026'dan itibaren ZATEN yürürlükte (ürün servisleri, listeleme kapasitesi kademeli). Sipariş çekme limiti kademeli tabloda 30-100 istek/dk; `Service.ts` içindeki `ratePerMin: 1800` bu limitlerin çok üstünde.
- Stok/fiyat servisi (`price-and-inventory`) V1-V2 ORTAK; yol ve gövde DEĞİŞMEDİ. Ancak batch sonuç sorgusunda bu servis için batch-seviyesi `status` DÖNMÜYOR (yalnızca item bazlı) — mevcut `checkBatchProduct` kodu bunu bekliyor (bkz. §6, madde R7).
- Kod okumasından çıkan, V2'den bağımsız ama V2 geçişiyle birlikte düzeltilmesi gereken DOĞRULUK riskleri: sipariş yanıtındaki alan yeniden adlandırmaları (`line.id` -> `lineId` vb.) `OrderTransformer`'da `externalLineItemId`'yi "undefined" yapabilir; `delivery-bulk-update` yolu resmi `delivery-info-bulk-update` ile uyuşmuyor; fatura linki gövdesi resmi şemayla uyuşmuyor.

---

## 1. ESKİ -> YENİ uç nokta eşleme tablosu

Baz: PROD `https://apigw.trendyol.com/integration`, STAGE `https://stageapigw.trendyol.com/integration` (tüm V2 sayfalarında STAGE karşılığı listeli).

Durum: **ESKİ** = 15.10.2026'da kapanıyor, **YENİ** = eklenmesi gereken karşılık, **DEĞİŞMEDİ** = yol/metot aynı (V1-V2 ortak veya V1/V2 ayrımı yok).

| Bizim anahtar (DB `Integrations.urls`) | Bizdeki yol | Resmi güncel uç nokta (metot) | Durum | Kapanış | Kaynak |
|---|---|---|---|---|---|
| `orderListUrl` | `order/sellers/<SELLERID>/orders` | `order/sellers/{sellerId}/v2/orders` (GET) | ESKİ -> YENİ | 15.10.2026 (günde 3x10 dk HTTP 426 brownout, o tarihe kadar) | changelog 30.07.2026; `sipariş-paketlerini-çekme-getshipmentpackages` |
| (yeni, opsiyonel) orderStream | - | `order/sellers/{sellerId}/orders/stream` (GET) | YENİ (02.06.2026'da yayınlandı) | - | `sipariş-paketlerini-akış-ile-çekme` |
| `orderRejectUrl` | `order/sellers/<SELLERID>/shipment-packages/<PACKAGEID>/items/unsupplied` | `order/sellers/{sellerId}/shipment-packages/{packageId}/items/unsupplied` (PUT) gövde `{lines:[{lineId,quantity}], reasonId}` | DEĞİŞMEDİ | yok | `tedarik-edememe-bildirimi-updatepackage` |
| (kodda fallback) `orderShippingUrl` | `order/sellers/<SELLERID>/shipment-packages/shipped` | Resmi dokümanda bu yol YOK; paket statü bildirimi `PUT order/sellers/{sellerId}/shipment-packages/{packageId}` (yalnızca `Picking`, `Invoiced`) | Doğrulanamadı | - | `paket-statü-bildirimi-updatepackage`; llms.txt sipariş listesi |
| `claimListUrl` | `order/sellers/<SELLERID>/claims` | `order/sellers/{sellerId}/claims` (GET) | DEĞİŞMEDİ | yok | `iadesi-oluşturulan-siparişleri-çekme-getclaims` |
| `claimApproveUrl` | `.../claims/<CLAIMID>/items/approve` | `order/sellers/{sellerId}/claims/{claimId}/items/approve` (PUT) gövde `{claimLineItemIdList:[...], params:{}}` | DEĞİŞMEDİ (gövde farkı: bkz. §7) | yok | `iade-siparişleri-onaylama-approveclaimlineitems` |
| `claimRejectUrl` | `.../claims/<CLAIMID>/issue?...` | `order/sellers/{sellerId}/claims/{claimId}/issue?claimIssueReasonId=&claimItemIdList=&description=` (POST; opsiyonel form-data dosya; dosya zorunlu değil: 1651, 451, 2101) | DEĞİŞMEDİ | yok | `iade-siparişlerinde-ret-talebi-oluşturma-createclaimissue` |
| `claimRejectionReasonsUrl` | `order/claim-issue-reasons` | `order/claim-issue-reasons` (GET) | DEĞİŞMEDİ; 23.09.2026'da red sebepleri değişti (6 kod kaldırıldı: 251, 1701, 1751, 2201, 2001, 2151; 3 yeni: 2077-2079; 8 açıklama güncellendi) | 23.09.2026 (yürürlükte) | changelog 23.09.2026 |
| `qnaListUrl` | `qna/sellers/<SELLERID>/questions/filter` | `qna/sellers/{sellerId}/questions/filter` (GET; size<=50, tarih aralığı en fazla 2 hafta) | DEĞİŞMEDİ | yok | `müşteri-sorularını-çekme` |
| `qnaAnswerUrl` | `qna/sellers/<SELLERID>/questions/<ID>/answers` | `qna/sellers/{sellerId}/questions/{id}/answers` (POST `{text}`; 10-2000 karakter) | DEĞİŞMEDİ | yok | `müşteri-sorularını-cevaplama` |
| `productListUrl` (ürün çekme) | `product/sellers/<SELLERID>/products` (V1 filterProducts) | Onaylı: `product/sellers/{sellerId}/products/approved` (GET); onaysız: `.../products/unapproved` (GET); tek barkod: `.../product/{barcode}`; stok-fiyat: `.../products/approved/inventory-and-price` | ESKİ -> YENİ | 15.10.2026 | `ürün-api-endpoint` (V1 tablosu), `ürün-v2-api-endpoint` |
| `transferUrl` (ürün aktarma) | `product/sellers/<SELLERID>/products` (POST) | `product/sellers/{sellerId}/v2/products` (POST) | ESKİ -> YENİ | 15.10.2026 | `ürün-yaratma-v2`, `ürün-aktarma-v2createproducts` |
| (kodda `PLATFORM_PROCESS.UPDATE` = PUT `transferUrl`) | `PUT products` (V1 updateProducts) | Onaylı: POST `products/content-bulk-update` + `products/variant-bulk-update` + `products/delivery-info-bulk-update`; Onaysız: POST `products/unapproved-bulk-update` | ESKİ -> YENİ | 15.10.2026 | `ürün-bilgisi-güncelleme-updateproduct`, `ürün-güncelleme-onaylı-ürün-v2`, `ürün-güncelleme-onaysız-ürün-v2` |
| `checkTransferUrl` / `checkBatchUrl` | `product/sellers/<SELLERID>/products/batch-requests/` | `product/sellers/{sellerId}/products/batch-requests/{batchRequestId}` (GET) | DEĞİŞMEDİ (yol); yanıt alanları/tipleri genişledi (bkz. §3.4) | yok | `toplu-işlem-kontrolü-getbatchrequestresult` (+ `-1` V2 sayfası) |
| `updatePriceUrl` / `updateStockUrl` | `inventory/sellers/<SELLERID>/products/price-and-inventory` | `inventory/sellers/{sellerId}/products/price-and-inventory` (POST) | DEĞİŞMEDİ (V1-V2 ortak) | yok | `ürün-v2-api-endpoint` ("V1-V2"), `stok-ve-fiyat-güncelleme-updatepriceandinventory-1` |
| `updateContentUrl` | `.../products/content-bulk-update` | `product/sellers/{sellerId}/products/content-bulk-update` (POST; `contentId` anahtarlı) | Yol DEĞİŞMEDİ; gövde V2'ye özgü (contentId) | yok | `ürün-güncelleme-onaylı-ürün-v2` |
| `updateVariantUrl` | `.../products/variant-bulk-update` | `product/sellers/{sellerId}/products/variant-bulk-update` (POST) | DEĞİŞMEDİ (yol) | yok | aynı |
| `updateDeliveryUrl` | `.../products/delivery-bulk-update` | `product/sellers/{sellerId}/products/delivery-info-bulk-update` (POST) | **YOL UYUŞMUYOR** (bizde `delivery-bulk-update`; resmi iki sayfada `delivery-info-bulk-update`) | - | `ürün-güncelleme-onaylı-ürün-v2`; `reference/updatedeliveryinfobulk` |
| `brandListUrl` | `product/brands/by-name` | `product/brands/by-name?name=` (GET; büyük/küçük harf duyarlı); liste: `product/brands` | DEĞİŞMEDİ (V1-V2 ortak) | yok | `reference/getbrandsbyname`; `ürün-v2-api-endpoint` |
| `categoryListUrl` | `product/product-categories` | `product/product-categories` (GET) | DEĞİŞMEDİ (V1-V2 ortak) | yok | `ürün-v2-api-endpoint` |
| `categoryAttributeListUrl` | `product/product-categories/<CATEGORYID>/attributes` | V2: `product/categories/{categoryId}/attributes` (GET); değerler: `product/categories/{categoryId}/attributes/{attributeId}/values` (GET) | ESKİ -> YENİ | 15.10.2026 (V1 sayfa bandı) | `kategori-özellik-listesi-v2`; `trendyol-kategori-özellik-listesi-getcategoryattributes` |
| `warehouseAddressList` | `sellers/<SELLERID>/addresses` | `sellers/{sellerId}/addresses` (GET; tam yol `/integration/sellers/{sellerId}/addresses`) | **BELİRSİZ**: V1 tablosunda listeli, V2 tablosunda YOK, kendi sayfasında kapanış notu YOK; yeni bir karşılık yayınlanmadı | doğrulanamadı | `ürün-api-endpoint`, `i̇ade-ve-sevkiyat-adres-bilgileri-getsuppliersaddresses` |
| Finans: settlements | `finance/che/sellers/<SELLERID>/settlements` | aynı (GET); tarih aralığı en fazla 15 gün | DEĞİŞMEDİ | yok | `cari-hesap-ekstresi-entegrasyonu` |
| Finans: otherfinancials | `.../otherfinancials` | aynı (GET); 15 gün | DEĞİŞMEDİ | yok | aynı |
| Finans: ödeme emri | `.../payment-order` | aynı (GET; size<=10) | DEĞİŞMEDİ | yok | aynı |
| Finans: kargo faturası | `.../cargo-invoice/<...>/items` | `finance/che/sellers/{sellerId}/cargo-invoice/{invoiceSerialNumber}/items` (GET) | DEĞİŞMEDİ | yok | `kargo-faturası-detayları` |
| Fatura linki | `sellers/<SELLERID>/seller-invoice-links` | `sellers/{sellerId}/seller-invoice-links` (POST) gövde `{invoiceLink, shipmentPackageId, invoiceDateTime, invoiceNumber}`; 201 / 409 | Yol DEĞİŞMEDİ; **gövde bizde farklı** (bkz. §7) | yok | `fatura-linki-gönderme-sendinvoicelink` |
| Fatura dosyası | `sellers/<SELLERID>/seller-invoice-file` | `sellers/{sellerId}/seller-invoice-file` (POST multipart: `shipmentPackageId`, `file` PDF/JPEG/PNG <=10 MB) | DEĞİŞMEDİ | yok | `fatura-dosyası-gönderme` |
| Fatura linki silme | `.../seller-invoice-links/delete` | `sellers/{sellerId}/seller-invoice-links/delete` (POST `{serviceSourceId, channelId:1, customerId}`; 202) | DEĞİŞMEDİ | yok | `fatura-linki-silme` |

Ek V2 uç noktaları (bizde henüz anahtarı yok): ürün silme `DELETE product/sellers/{id}/products` (V1-V2 ortak), arşivleme `PUT .../products/archive-state`, buybox `POST .../products/buybox-information`, kilit kaldırma `PUT .../products/unlock`, güncelleme sonucu `GET .../products/{contentId}/update-audits`, marka yaratma `POST .../brands`, webhook `POST webhook/sellers/{sellerId}/webhooks`.

---

## 2. Sipariş V2

### 2.1 Uç nokta ve parametreler (GET `.../order/sellers/{sellerId}/v2/orders`)

| Parametre | Tip | Zorunlu | Not |
|---|---|---|---|
| `startDate`, `endDate` | long (ms, GMT+3) | opsiyonel | verilirse aralık en fazla **2 hafta**; verilmezse **son 1 hafta** döner |
| `page` | int (0 tabanlı) | opsiyonel | `size=200` iken güvenli aralık `page=0..49` (toplam 10.000) |
| `size` | int | opsiyonel | max **200** (referans sayfasında varsayılan 200) |
| `supplierId` | long | zorunlu (doküman tablosunda) | referans sayfasında sorgu paramı olarak yok; doğrulanamadı |
| `orderNumber` | string | opsiyonel | |
| `status` | string | opsiyonel | Created, Picking, Invoiced, Shipped, Cancelled, Delivered, UnDelivered, Returned, AtCollectionPoint, UnPacked, UnSupplied, Awaiting, Verified |
| `orderByField` | enum | opsiyonel | `PackageLastModifiedDate`, `CreatedDate` (referans) |
| `orderByDirection` | enum | opsiyonel | ASC / DESC |
| `shipmentPackageIds` | long[] | opsiyonel | en fazla 50 |

Sınırlar: **maxQueryWindowResult = 10.000** kayıt, sayaç `shipmentPackageId` (paket) bazlı, sipariş/satır bazlı değil; bölünmüş paketler ayrı sayılır. Erişilebilir veri kapsamı **son 1 ay** olarak kısıtlanacak ("başlangıçta tüm veri; kısıtlanacak"; tarih verilmemiş -> doğrulanamadı). `totalElements > 10000` ise: daha dar tarih aralığı/filtre veya `getShipmentPackagesStream`. 10.000'i aşan sorgularda 429 dönecek (changelog 02.06.2026; geçerlilik 08.06.2026).
Awaiting/Verified statüleri: ödeme onayı bekleyen paketler; **stok düşümü dışında hiçbir işlem yapılmamalı**, Created olana kadar dokunulmamalı.

### 2.2 Stream servisi (GET `.../order/sellers/{sellerId}/orders/stream`, yol `/v2/` İÇERMEZ)

- Parametreler: `supplierId`, `packageItemStatuses` (aynı 13 statü), `lastModifiedStartDate`, `lastModifiedEndDate` (ms, GMT+3), `size` (varsayılan 50, max 200), `nextCursor` (opak; ilk istekte yok).
- İmleç mantığı: `hasMore=true` iken yanıttaki `nextCursor` ile devam; `hasMore=false` -> bitti. `nextCursor` ayrıştırılmaz/değiştirilmez.
- Kapsam: **son 3 ay**; zaman aralığı **en fazla 14 gün**; verilmezse son 2 hafta.
- Yanıt: `hasMore`, `nextCursor`, `size`, `content[]`; **`totalElements`/`totalPages`/`page` YOK**.
- İstekler arası **en az 5 sn** önerilir; ayrı oran limiti değeri yayınlanmamış (doğrulanamadı).
- Amaç: tam tarama, periyodik senkron, dışa aktarım (changelog 02.06.2026).

### 2.3 Yanıt şeması ve alan adı FARKLARI

Güncel örnek (docs sayfası, örnek tarihleri Kas 2025) — paket seviyesi: `shipmentPackageId`, `orderNumber`, `paymentMethod` (09.09.2026'da eklendi), `orderCountryCode`, `packageGrossAmount`, `packageSellerDiscount`, `packageTyDiscount`, `packageTotalDiscount`, `packageTotalPrice`, `discountDisplays[]`, `supplierId`, `channelId` (1 = TR çekirdek, 25 = Luxe), `customerId/FirstName/LastName/Email`, `identityNumber`, `shipmentAddress{... postalCode, company, addressLines, latitude/longitude(invoice)}`, `invoiceAddress{... taxOffice, taxNumber}`, `cargoTrackingNumber`, `cargoTrackingLink`, `cargoSenderNumber`, `cargoProviderName`, `cargoDeci`, `packageHistories[{createdDate,status}]`, `shipmentPackageStatus`, `status`, `orderDate`, `lastModifiedDate`, `commercial`, `micro`, `is4P`, `3pByTrendyol`, `invoiceLink/invoiceNumber/invoiceStatus/invoiceRejectedReasonKeys`, `createdBy` (order-creation|cancel|split|transfer), `originPackageIds`, `etgbNo/etgbDate`, `hsCode`, `deliveryAddressType`, `whoPays`, `isCod`, `containsDangerousProduct`.
Satır (`lines[]`): `lineId`, `quantity`, `stockCode`, `contentId`, `barcode`, `productName`, `productSize`, `productColor`, `productOrigin`, `productCategoryId`, `sellerId`, `lineGrossAmount`, `lineTotalDiscount`, `lineSellerDiscount`, `lineTyDiscount`, `lineUnitPrice`, `discountDetails[{lineItemId,lineItemPrice,lineItemSellerDiscount,lineItemTyDiscount}]`, `vatRate`, `commission`, `currencyCode`, `orderLineItemStatusName`, `cancelledBy`, `cancelReason`, `cancelReasonCode`, `salesCampaignId`, `businessUnit`, `defectiveClaimListingInsight`.

Yeniden adlandırma tablosu (changelog girdisi "08.12.2025", eski adlar "1 ay sonra" kaldırılacak = fiilen Ocak 2026 başı; iade: "2 ay sonra"):

| Eski | Yeni |
|---|---|
| `merchantSku` | `stockCode` |
| `merchantId` | `sellerId` |
| kök `id` | `shipmentPackageId` |
| `line.id` | `lineId` |
| `line.amount` | `lineGrossAmount` |
| `line.discount` | `lineSellerDiscount` |
| `line.tyDiscount` | `lineTyDiscount` |
| `line.lineItemDiscount` | `lineItemSellerDiscount` |
| `line.price` | `lineUnitPrice` |
| kök `grossAmount` | `packageGrossAmount` |
| `totalDiscount` | `packageSellerDiscount` |
| `totalTyDiscount` | `packageTyDiscount` |
| `totalPrice` | `packageTotalPrice` |
| `productCode` | `contentId` |
| `vatBaseAmount` | `vatRate` |
Kaldırılanlar: `sku`, `scheduledDeliveryStoreId`, `agreedDeliveryDateExtendible`, `extendedAgreedDeliveryDate`, `agreedDeliveryExtensionEndDate`, `agreedDeliveryExtensionStartDate`, `groupDeal`. Yeni: `cancelledBy`, `cancelReason`, `cancelReasonCode`, `lineTotalDiscount`, `packageTotalDiscount`. İade (getClaims): `content/id` -> `claimId`, `vatBaseAmount` -> `vatRate`.
**ÇELİŞKİ:** `reference/getshipmentpackages` (OpenAPI referansı) hâlâ ESKİ adları (`id`, `merchantSku`, `amount`, `price`...) gösteriyor; guide sayfası (updatedAt 2026-09-24) ve changelog YENİ adları gösteriyor. Baskın olan: guide + changelog (referans sayfası bayat görünüyor). Canlı yanıt doğrulaması yapılmadı.

Guide sayfasında V1'e göre alan-bazlı fark listesi verilmemiş ("v1/v2 farkları ayrıca listelenmemiş"); V2 için tek belgelenmiş şema farkı yukarıdaki güncel örnektir. Stream yanıtı guide örneğiyle aynı paket şemasını taşır.

### 2.4 Webhook

- 13 statü: CREATED, PICKING, INVOICED, SHIPPED, CANCELLED, DELIVERED, UNDELIVERED, RETURNED, UNSUPPLIED, AWAITING, UNPACKED, AT_COLLECTION_POINT, VERIFIED.
- Yük = sipariş paketi modeli (yukarıdaki şema; `paymentMethod` dahil, 09.09.2026).
- Kimlik doğrulama: `API_KEY` (`x-api-key` başlığı) veya `BASIC_AUTHENTICATION`. Yeniden deneme: başarılana kadar 5 dakikada bir; hatalarda webhook otomatik pasife alınır ve 2 e-posta gider. Satıcı başına en fazla **15** webhook (pasifler dahil); URL "Trendyol", "Dolap", "Localhost" içeremez. `subscribedStatuses` boşsa tüm statüler. Oluşturma: `POST webhook/sellers/{sellerId}/webhooks`.
- Olaylar: 02.09.2026 ve 08.09.2026'da sipariş paketi çekme ve webhook modelinde kesinti; kaçan siparişler için manuel yeniden sorgu gerekti -> webhook tek başına yeterli değil, düzenli uzlaştırma (reconciliation) sorgusu gerekir.
- Bizde webhook YOK (INTEGRATIONS_REGISTRY §1: tüm entegrasyonlar polling).

---

## 3. Ürün V2

### 3.1 Aktarma gövdesi: V1 -> V2 alan farkı (`items[]`, istek başına en fazla 1.000)

| Alan | V1 (POST products) | V2 (POST v2/products) | Bizde (`T/transformers/ProductTransformer.ts`) |
|---|---|---|---|
| `barcode`, `title`(100), `productMainId`(40), `brandId`, `categoryId`, `quantity`, `description`(30.000), `listPrice`, `salePrice`, `vatRate` (0/1/10/20), `images` (HTTPS, max 8, 1200x1800), `attributes` | zorunlu | zorunlu | var |
| `stockCode` | opsiyonel (100) | docs sayfası: opsiyonel; OpenAPI referansı: **zorunlu** (çelişki) | var (`variant.stockcode`) |
| `dimensionalWeight` | **zorunlu** | docs sayfası: opsiyonel; OpenAPI referansı: **zorunlu** (çelişki) | var |
| `currencyType` | **zorunlu** ("TRY") | **yok** | gönderiyor (`"TRY"`) |
| `cargoCompanyId` | **zorunlu** | **yok** (yerine opsiyonel `cargoProviders`, barkod bazlı kargo kodu) | gönderiyor |
| `cargoProviders` | opsiyonel | opsiyonel | yok |
| `stockUnitType` | belgede yok | belgede yok | gönderiyor (`"Adet"`) — resmi şemada görülmedi |
| `origin` | opsiyonel, string(2) | opsiyonel, string(2) ISO ülke kodu; **23.10.2026'da zorunlu** | **yok** |
| `deliveryOption` | `{deliveryDuration, fastDeliveryType}` | `{deliveryDuration}`; `fastDeliveryType` Ağustos 2026'dan itibaren işlenmiyor | `{deliveryDuration:1, fastDeliveryType}` |
| `lotNumber` | opsiyonel (100; `A-Za-z0-9,-.:/`) | opsiyonel (100, nullable) | varsayılan `"1"` (yanıltıcı) |
| `shipmentAddressId`, `returningAddressId` | opsiyonel | opsiyonel | var |
| `channels` (CORE/LUXE) | yalnız onaylı ürün güncellemede | onaylı varyant güncellemede | yok |

Doğrulama notu: yukarıdaki V2 "yok" satırları docs sayfasından (`ürün-yaratma-v2`, A) ve OpenAPI referansından (`reference/createproducts`, A) çıkarıldı; referansta `origin` özelliği HİÇ listelenmemiş (docs sayfasında opsiyonel olarak var) — referans bayat görünüyor.

### 3.2 Menşe (origin)

- Alan adı: `origin` (kök seviyede, `stockCode`/`barcode` gibi bağımsız alan). Biçim: 2 karakterlik ülke kodu (örn. `TR`, `AD`, `US`); geçerli değerler "Menşei Değerleri Listesi" sayfasında (`ürün-menşei-değerleri`; uç nokta belirtilmemiş, tablo).
- Takvim (changelog 17.08.2026, tam metin doğrulandı): geçiş dönemi boyunca kategori için zorunlu bir attribute ise menşe `attributes` altından gönderilmeye DEVAM; yeni `origin` alanı opsiyonel. **23 Ekim 2026'dan itibaren `origin` zorunlu, `attributes` altından menşe gönderimi opsiyonel.** İleri bir tarihte attribute altı menşe kaldırılacak (tarih açıklanmadı). Geçmiş veriler 23.10.2026'da Trendyol tarafından otomatik yeni alana taşınacak.
- Etkilenen servisler (V1 ve V2): ürün aktarma, güncelleme (onaysız/onaylı varyant), filtreleme, batch sonuç. Filtre yanıtlarında `origin` (onaylı: `variants[].origin`; onaysız: kök) döner.
- Arama özetinde (B) "30 Haziran 2026'da zorunlu" ifadesi görüldü; resmi changelog ile çelişiyor ve başka kaynakla doğrulanmadı -> DİKKATE ALINMADI.

### 3.3 Güncelleme V2 (tümü POST, istek başına max 1.000 item, yanıt `batchRequestId`)

- **Onaylı içerik** `products/content-bulk-update`: `contentId` (zorunlu), `title`, `description`, `images[{url}]`, `attributes[{attributeId, attributeValueId | customAttributeValue}]`. Onaylı üründe `barcode`, `productMainId`, `brandId`, `categoryId` ve slicer/varianter attribute değerleri değiştirilemez; kısmi güncelleme desteklenir, ancak attributes değişiyorsa TÜM attribute değerleri gönderilmeli.
- **Onaylı varyant** `products/variant-bulk-update`: `barcode` (zorunlu, değiştirilemez), `channels`, `stockCode`, `origin`, `vatRate`, `shipmentAddressId`, `returningAddressId`, `dimensionalWeight`, `lotNumber`, `cargoProviders`, `locationBasedDelivery` ("ENABLED"/"DISABLED"/null).
- **Onaylı teslimat** `products/delivery-info-bulk-update`: `barcode` + `deliveryOptions.deliveryDuration` (0 = aynı gün, 1 = ertesi gün). Not: bu servis için gövde nesne adı **çoğul `deliveryOptions`** (iki kaynak: docs sayfası ve `reference/updatedeliveryinfobulk`); ürün oluşturmada tekil `deliveryOption`. Referans sayfası hâlâ `fastDeliveryType` enum'u (SAME_DAY_SHIPPING, FAST_DELIVERY) gösteriyor; changelog/ürün sayfaları bunu artık işlenmez diyor.
- **Onaysız** `products/unapproved-bulk-update`: `barcode`, `title`, `description`, `productMainId`, `brandId`, `categoryId`, `stockCode`, `origin`, `dimensionalWeight`, `vatRate`, `deliveryOption.deliveryDuration`, `locationBasedDelivery`, `lotNumber`, `cargoProviders`, `shipmentAddressId`, `returningAddressId`, `images`, `attributes`.
- Sonuç kontrolü: her biri için `getBatchRequestResult` (`ProductV2Update`, `ApprovedProductContentUpdate`, `ApprovedProductVariantUpdate`, `ProductDeliveryOptionUpdate` tipleri). Güncelleme denetimi: `GET products/{contentId}/update-audits`.

### 3.4 Batch sonuç sorgusu (`GET products/batch-requests/{batchRequestId}`)

- Yanıt: `batchRequestId`, `status`, `creationDate`, `lastModification`, `sourceType` (API|WEB), `itemCount`, `failedItemCount`, `batchRequestType`, `items[{requestItem, status, failureReasons[]}]`.
- Batch-seviyesi `status`: `IN_PROGRESS`, `COMPLETED`. Item `status`: `SUCCESS`, `FAILED` (+ `IN_PROGRESS` yalnız teslimat güncellemede). `PARTIALLY_COMPLETED` belgede YOK (bizim kod bekliyor).
- `batchRequestType` değerleri: ProductV2OnBoarding, ProductV2Update, ApprovedProductContentUpdate, ApprovedProductVariantUpdate, ProductDeliveryOptionUpdate, ProductInventoryUpdate, ProductArchiveUpdate, ProductDeletion, ProductUnlockUpdate.
- **Stok/fiyat batch'lerinde batch `status` alanı DÖNMÜYOR; yalnızca item bazlı `status` kontrol edilmeli** (docs: "Batch status alanı tarafınıza dönmeyecektir"; changelog 09.05.2025 ile uyumlu).
- Saklama: sonuçlar işlemden sonra **4 saat** görüntülenebilir.

### 3.5 Stok/fiyat servisi (değişti mi? HAYIR)

`POST inventory/sellers/{sellerId}/products/price-and-inventory`, V1-V2 ortak. Gövde `{items:[{barcode, quantity?, salePrice?, listPrice?}]}` (yalnız biri güncellenirken diğeri zorunlu değil). Limitler: istek başına en fazla **1.000** item; **aynı isteği 15 dakika boyunca tekrarlayamazsınız** (aynı gövde kuralı; yalnız bu sayfada geçiyor); maksimum stok **20.000** adet; fiyat için **barkod başına 30 istek/dk** (aşılırsa batch sonucunda o barkod için hata). Yanıt `{batchRequestId}`.

### 3.6 Ürün filtreleme V2 (ürün çekme)

- Onaylı `GET .../products/approved`: `page`, `size` (max 100), `page x size <= 10.000`, aşımı için `nextPageToken`; `barcode`, `barcodes` (max 50), `startDate/endDate` + `dateQueryType` (VARIANT_CREATED_DATE, VARIANT_MODIFIED_DATE, CONTENT_MODIFIED_DATE), `stockCode`, `origin`, `productMainId`, `brandIds`, `status` (archived, blacklisted, locked, onSale, notOnSale), `contentId`, `orderByDirection`. Yanıt ürün-seviyesi (`contentId`, `productMainId`, `brand`, `category`, `title`, `description`, `images`, `attributes`, `variants[]`) + varyant seviyesi (`variantId`, `barcode`, `stock{quantity}`, `price{salePrice,listPrice,priceSeenByCustomer}`, `stockCode`, `origin`, `vatRate`, `onSale`, `locked`, `archived`, `blacklisted`, `cargoProviders`, `deliveryOption`, `channels`...). Yani V1'deki düz `content[]` (barkod bazlı) yapı, contentId altında `variants[]` iç içe yapıya dönüştü.
- Onaysız `GET .../products/unapproved`: `size` max 1.000; `status`: rejected, pendingApproval; `rejectReasonDetails[{rejectReason, rejectReasonDetail}]`.

### 3.7 Oran limitleri — iki belge çözümü

Kaynaklar ve güncellik (sayfa başındaki `updatedAt`, `.md` sürümünden):
1. **"1. Servis Limitleri"** (`updatedAt 2026-08-25`, A): ürün servisleri için ESKİ limitler 14.09.2026'ya kadar; YENİ limitler 14.09.2026'dan itibaren (bugün itibarıyla YÜRÜRLÜKTE), listeleme kapasitesi kademesine bağlı (50K / 75K / 150K / 500K / sınırsız):
   - Ürün Entegrasyonu OKUMA (ortak grup): 1000 / 1250 / 1500 / 1750 / 2000 istek/dk.
   - Ürün Entegrasyonu YAZMA (aktarma+güncelleme+silme ortak grup): 200 / 300 / 400 / 500 / 600 istek/dk.
   - Stok & Fiyat YAZMA: 350 / 500 / 1000 / 1500 / 2000 istek/dk.
   - Barkod bazlı fiyat güncelleme: 30 istek/dk.
   - Limitler tekil endpoint değil servis GRUBU bazında ortak uygulanır (örnek: 50K satıcıda 50 aktarma + 100 güncelleme + 50 silme = yazma grubunu tüketir).
   - ESKİ (14.09.2026 öncesi): Ürün yükleme 1000/dk, güncelleme 1000/dk, stok-fiyat SINIRSIZ, batch kontrol 1000/dk, filtreleme 2000/dk, silme 100/dk, adres 1/saat, marka/kategori/kategori-özellik 50/dk, buybox 1000/dk, güncelleme sonucu 100/dk. Yeni tabloda marka/kategori/adres için ayrı değer gösterilmedi (doğrulanamadı; eski değerler geçerli varsayılıyor).
2. **"Sipariş Paketlerini Çekme"** sayfası (`updatedAt 2026-09-24`, A): "1 dakikada en fazla **1000** istek" + uyarı: V2 ile oran limit değerleri güncellenecek, yüksek hacimde 429 sıklaşabilir.
3. Sipariş çekme için Servis Limitleri sayfasındaki kademeli tablo: **30 / 40 / 50 / 100 / 100 istek/dk** (50K/75K/150K/500K/sınırsız). Diğer sipariş servisleri 100-1000 istek/dk veya SINIRSIZ (kademeye göre); iade: getClaims 1000/dk, onay ve red 5/dk; finans 100/dk; soru çekme 1000/dk, cevap 500/dk.
4. Yetkilendirme sayfası (`updatedAt 2026-04-27`): genel 429 kuralı "10 saniyede 50 istek" (`too.many.requests`).

Çözüm (kanıta dayalı öneri, kesin değil): sipariş çekme için 1000/dk ifadesi ile 30-100/dk tablosu ÇELİŞİYOR ve hangisinin baskın olduğu resmi olarak belirtilmemiş. Kademeli tablo, listeleme-limiti bazlı limitleri anlatan 27.02.2025 changelog girdisinin ve 02.06.2026 duyurusunun devamıdır; getShipmentPackages sayfasındaki 1000/dk cümlesi eski kalmış olabilir ancak sayfa daha yeni tarihli. **Muhafazakâr taban: 50K kademe için 30 istek/dk, 10 sn'de 50 istek, 429'da geri çekilme.** Kademe, tenant başına ayarlanabilir olmalı. Yazma grubu için ürün gönderimi 50K kademede en fazla 200 istek/dk (tüm yazma servisleri toplamı). Kesin değer için Trendyol'a destek talebi önerilir (bkz. §5 destek sayfası).

---

## 4. Kimlik doğrulama / User-Agent / entegratör kimliği (güncel: DEĞİŞMEDİ)

- HTTP **Basic Authentication**: kullanıcı adı = API KEY, parola = API SECRET KEY (satıcı panelinde "Entegrasyon Bilgileri", yalnız master kullanıcı). `supplierId` = satıcı ID.
- `User-Agent` zorunlu: entegratör için `"{SellerId} - {IntegratorName}"`, kendi entegrasyon için `"{SellerId} - SelfIntegration"`; entegratör adı alfanümerik, en fazla 30 karakter. Eksik/yanlış User-Agent -> **403**; yanlış kimlik -> 401 `ClientApiAuthenticationException`; aşırı istek -> 429 `too.many.requests`.
- Bizdeki durum: `T/services/Service.ts` `User-Agent: ${SELLERID} - Entegrasyonik` -> uyumlu ("Entegrasyonik" alfanümerik, 30 karakter altı). 2026'ya ait kimlik doğrulama değişikliği sayfada belirtilmemiş (sayfa 2026-04-27).
- Test ortamı IP yetkisi yoksa 503 döner (bkz. §5).

---

## 5. Stage (test) ortamı

- STAGE API: `https://stageapigw.trendyol.com/integration/...`; panel: `https://stagepartner.trendyol.com/account/login`. Tüm V2 sayfalarında (`/v2/orders`, `/orders/stream`, `/v2/products`, bulk update, batch-requests, filtreleme) STAGE URL'si açıkça listeli -> V2 uç noktaları stage'de bulunuyor (A). Stage'de V2'nin fiilen çalıştığı canlı doğrulanmadı.
- Erişim: uygulama sunucularının IP'leri Trendyol'a bildirilmeli (aksi halde **503**). Yönetim servisi: `GET/POST/DELETE https://apigw.trendyol.com/integration/product/sellers/{sellerId}/ip-whitelists` — en fazla **7 aktif IP**, günde en fazla 7 ekleme, yalnız IPv4, her kaydın son kullanma tarihi var, limit aşımı 429 (POST 201, DELETE 204).
- Stage hesabı: panelde "Hesap Bilgilerim"; paylaşımlı test hesabı için çağrı merkezi; özel hesap için e-posta+telefon+VKN/TCKN destek talebi.
- Test siparişi: `POST https://stageapigw.trendyol.com/integration/test/order/orders/core` (docs sayfası). Eski changelog (27.12.2024) `https://stageapi.trendyol.com/integration/order/orders/core` diyor -> çelişki, docs sayfası daha güncel kabul edildi. Test siparişi statü güncelleme ve iade test siparişini WaitingInAction'a çekme servisleri var; stage'de müşteri sorusu oluşturma servisi var. V2 sipariş uç noktasının test siparişleriyle uyumu: belgelenmemiş (doğrulanamadı).
- Uyarı: yerel geliştirme kuralları (CLAUDE.md: egress guard, mock fail-closed) stage'e gerçek istek atmak için orkestratör/insan kararı gerektirir; IP whitelist kaydı gerçek ağ çıkış IP'si ister.

---

## 6. Geçiş RİSK / etki analizi (bizim akışlarımıza göre)

Kırılma tarihleri: K1 = 15.10.2026 (kesin kapanış), K2 = 23.10.2026 (origin), K0 = ŞİMDİ (zaten etkin).

| # | Akış / bileşen | Ne kırılır | Kırılma tarihi | Öncelik |
|---|---|---|---|---|
| R1 | **Sipariş çekme** (`orderListUrl` DB değeri hâlâ V1; kod fallback'i V2 ama DB değeri önceliklidir: `T/api/OrderConnector.ts:18`) | 15.10'da tüm sipariş çekme 4xx/kapalı; o zamana kadar günde 3x10 dk HTTP 426 (bu sırada `fromHttpError` ile hata fırlatılıp imleç ilerlemiyor: `OrderConnector.ts:79-82` — kabul edilebilir ama sipariş gecikir) | K0 (brownout) / K1 | P0 |
| R2 | Sipariş çekme sayfalama (`OrderConnector.ts:23,51-71`) | `size=50`, tüm sayfalar `Promise.all` ile paralel; 10.000 tavanı ve 2 haftalık pencere yok; `startDate/endDate` doğrudan iletiliyor; büyük geriye dönük senkronda 429/eksik veri | K0 (08.06.2026'dan beri) | P0 |
| R3 | **Katalog aktarma** (`transferUrl` POST V1 + `categoryAttributeListUrl` V1) | Aktarma ve kategori özellik çekme 15.10'da kapanır; kategori özellikleri kapanınca `processBatch` (TRANSFER/UPDATE) `fetchCategoryAttributes` üzerinden de düşer | K1 | P0 |
| R4 | **Ürün güncelleme** (`PLATFORM_PROCESS.UPDATE` = PUT `transferUrl`, `ProductService.ts:81-82,362`) | V1 PUT kapanır; yerine onaylı/onaysız ayrımı gerekir (contentId, ürün onay durumu) | K1 | P0 |
| R5 | **Ürün çekme / durum takibi** (`productListUrl`; `getProductsAndPersist`, `updateProductStatuses` `ProductService.ts:153-267`) | V1 filtreleme kapanır; V2 yanıtı `content[].variants[]` iç içe; `page*size<=10.000` + `nextPageToken`; `updateProductStatuses` `barcodes` paramı en fazla 50 | K1 | P0 |
| R6 | **origin** zorunlu (`ProductTransformer.toPlatformBatch` hiç göndermiyor) | 23.10'dan sonra TRANSFER/UPDATE gövdeleri reddedilir (zorunlu alan eksik) | K2 | P0 (K2 yakın) |
| R7 | **Stok/fiyat yayın** (`price-and-inventory` yolu DEĞİŞMEDİ) ama sonuç sorgusu: `checkBatchProduct` yalnız `['COMPLETED','FAILED','PARTIALLY_COMPLETED']` batch statüsünde sonuç üretiyor (`ProductService.ts:253`); stok/fiyat batch'lerinde batch `status` gelmiyor (yalnız item bazlı) | Stok/fiyat batch sonuçları hiç "tamamlandı" sayılmayabilir (kalıcı bekleme) -> sıfır-oversell doğrulaması körleşir | K0 (09.05.2025 changelog'undan beri; canlı doğrulanmadı) | P0 (doğruluk) |
| R8 | **Oran limitleri** (14.09.2026'dan beri): `Service.ts:22-24` `maxConcurrent 10`, `ratePerMin 1800` | Kademe limitlerinin çok üstü; yazma grubu 200/dk (50K), stok-fiyat 350/dk, sipariş çekme 30/dk, barkod başına fiyat 30/dk -> 429 fırtınası, batch'te barkod hataları; "aynı gövde 15 dk" kuralı için tekrar gönderim engeli yok | K0 | P1 |
| R9 | **Sipariş yanıt alanı yeniden adlandırmaları** (`T/transformers/OrderTransformer.ts:124-125`: `String(line.id)`) | Güncel şemada `line.id` yok (`lineId`) -> `externalLineItemId`/`externalItemId` = `"undefined"`; kalem düzeyinde işlemler (tedarik edememe `lineId`, iade eşleme) yanlış ID kullanır. Ayrıca `lineItemPrice` satır kökünde yok (`discountDetails` altında) -> `totalPrice` 0; `zipCode` yerine `postalCode` (`:208`), `companyName` yerine `company` (`:198`) -> boş alanlar | K0 (eski adlar 1 ay sonra kaldırıldı = Ocak 2026); canlı yanıtla doğrulanmadı, mock eski şemaya dayanıyor olabilir | P0 (veri bütünlüğü) |
| R10 | **Yeni statüler** (`OrderTransformer.mapStatus` `:162-173`) | `Awaiting`, `Verified`, `AtCollectionPoint`, `UnPacked` varsayılan `UNAPPROVED`'a düşer; Awaiting/Verified siparişlerde stok dışı işlem YASAK (iptal edilebilir) -> yanlış onay/hazırlık | K0 | P1 |
| R11 | **İade** (getClaims) | `content/id`->`claimId` (kod `claim.claimId || claim.id` ile güvenli); 23.09.2026 red sebepleri değişti (6 kod kaldırıldı, 3 eklendi): koda gömülü/önbellekli sebep listesi varsa eski kodlar reddedilir; `approveClaim` gövdesi `{}` (`ClaimConnector.ts:114`) — resmi gövde `claimLineItemIdList` içerir | K0 (23.09.2026) | P1 |
| R12 | **Teslimat**: `fastDeliveryType` artık işlenmiyor, `deliveryDuration` 0/1 (`ProductTransformer.ts:161-167` `deliveryDuration:1` sabit + `fastDeliveryType`); `updateDeliveryUrl` yolu yanlış (`delivery-bulk-update`) ve gövde nesnesi tekil `deliveryOption` (resmi: çoğul `deliveryOptions`) | Aynı gün kargo isteği ertesi güne dönüşür; teslimat toplu güncellemesi 404/400 | K0 (Ağustos 2026) | P1 |
| R13 | **Fatura bildirimi** (`OrderConnector.sendOrderInvoice`) | Fallback URL `order/sellers/<SELLERID>/seller-invoice-links` (resmi yol `sellers/{id}/seller-invoice-links`, `order/` öneki yok) ve gövde `{orderNumber, invoiceLink}` (resmi: `shipmentPackageId`, `invoiceLink`, opsiyonel `invoiceNumber`/`invoiceDateTime`) | K0 | P1 |
| R14 | **Kargo bildirimi** (`orderShippingUrl` `.../shipment-packages/shipped`) | Resmi dokümanda karşılığı bulunamadı; MARKETPLACE kargo modunda `OrderService.sendOrderShipping` zaten atlıyor | doğrulanamadı | P2 |
| R15 | **Soru-cevap, finans, marka/kategori, stok-fiyat yolu** | Yol değişikliği yok | - | P3 |

En riskli 5 (özet): R1+R2 (sipariş çekme), R9 (satır kimliği bozulması), R3+R4+R5 (katalog V1 kapanışı), R6 (origin), R7 (stok/fiyat batch sonuç körlüğü).

### 15 Ekim 2026 öncesi YAPILMASI ŞART (uç nokta bazında)

1. `GET order/sellers/{id}/orders` -> `GET order/sellers/{id}/v2/orders`: DB `Integrations.urls.orderListUrl` güncellemesi (yerel + Atlas; yedek/insan onayı gerekir); pencere <=14 gün, `size=200`, sayfa <=49, `totalElements>10000` durumunda daralt/stream; paralel sayfa çekimi yerine oran limitli sıralı çekim.
2. `POST product/sellers/{id}/products` -> `POST product/sellers/{id}/v2/products` (`transferUrl`): gövdeden `currencyType`/`cargoCompanyId`/`stockUnitType` çıkar, `origin` + (varsa) `cargoProviders` ekle, `deliveryOption` yalnız `deliveryDuration`.
3. `PUT product/sellers/{id}/products` (UPDATE) -> onaylı: `POST .../products/content-bulk-update`, `.../variant-bulk-update`, `.../delivery-info-bulk-update`; onaysız: `POST .../products/unapproved-bulk-update`.
4. `GET product/sellers/{id}/products` (filterProducts) -> `.../products/approved`, `.../products/unapproved` (+ barkod: `.../product/{barcode}`; stok-fiyat: `.../products/approved/inventory-and-price`).
5. `GET product/product-categories/{id}/attributes` -> `GET product/categories/{id}/attributes` (+ `.../attributes/{attributeId}/values`).
6. `GET .../products/batch-requests/{id}`: yanıt işleme mantığı (item bazlı statü; batch status yalnız IN_PROGRESS/COMPLETED; stok/fiyatta batch status yok).
7. `updateDeliveryUrl`: `delivery-bulk-update` -> `delivery-info-bulk-update`.
8. Oran limitleri ve 429 geri çekilmesi (14.09'dan beri geçerli; 15.10'a kadar bekletilmemeli).

23 Ekim 2026 öncesi: her ürün gönderiminde `origin` (2 harfli ülke kodu) zorunlu; ürün modelinde menşe alanı yoksa eşleme/backfill gerekir (Trendyol geçmiş veriyi otomatik taşır, ama yeni/güncellenen ürünlerde biz göndermezsek reddedilir).

---

## 7. Kod tarafı uygulama notları (yalnızca öneri; kod yazılmadı)

- **DB `Integrations.urls`** (Trendyol kaydı): `orderListUrl`, `transferUrl`, `productListUrl`, `categoryAttributeListUrl`, `updateDeliveryUrl` değiştirilecek; yeni anahtarlar önerilir: `orderStreamUrl`, `updateUnapprovedUrl`, `productApprovedUrl`, `productUnapprovedUrl`, `categoryAttributeValuesUrl`. Not: `T/api/OrderConnector.ts:18` fallback'i zaten V2; asıl değer DB'de. DB değişikliği CLAUDE.md kural 3 (yedek) kapsamındadır.
- `T/api/OrderConnector.ts`: `size` 50 -> 200; tarih penceresi bölücü (<=14 gün); sayfa tavanı 50; ardışık (veya küçük eşzamanlılıkla) çekim + oran limiti; `totalElements>10000` için stream'e düşme; büyük backfill için `orders/stream` (`packageItemStatuses`, `lastModifiedStartDate/EndDate`, `nextCursor`, 5 sn aralık); dinamik `lastModifiedDate` imleci; statü filtresi kullanılırken `Awaiting/Verified` çekilse bile işleme alınmamalı.
- `T/transformers/OrderTransformer.ts`: `line.id` -> `line.lineId ?? line.id` (`:124-125`); `lineItemPrice` yerine `lineUnitPrice*quantity` veya `discountDetails`; `postalCode` (`:208`), `company` (`:198`); `cancelReason` `lines[].cancelReason/cancelReasonCode`; `paymentMethod`, `channelId` (Luxe=25), `productOrigin` meta'ya; yeni statüler için `mapStatus` (`Awaiting/Verified` -> ayrı bekleme durumu, `AtCollectionPoint`, `UnPacked`); `order.taxAmount/cargoAmount` güncel şemada yok.
- `T/services/ProductService.ts`: `getEndpointUrl` (`:356-369`) UPDATE için onaylı/onaysız yönlendirme; `processBatch` PUT (`:81-82`) -> POST; `getProductsAndPersist` V2 `nextPageToken` + `variants[]` düzleştirme (`:153-221`); `updateProductStatuses` barkod başına en fazla 50 (`:259-267`); `checkBatchProduct` (`:247-257`) item bazlı sonuç + stok/fiyat için batch status beklememe + `IN_PROGRESS`.
- `T/transformers/ProductTransformer.ts`: `origin` ekle (`toPlatformBatch`, `toInternalVariant` — filtre yanıtından oku); `currencyType`, `cargoCompanyId`, `stockUnitType` V2 gövdesinden kaldır (V2 yolunda), `cargoProviders`; `getDeliveryOption` (`:161-167`) -> `{deliveryDuration: 0|1}`; UPDATE_DELIVERY için `deliveryOptions` (çoğul); `lotNumber` varsayılan `"1"` (`:87,114,132`) kaldır/null; UPDATE_CONTENT için `contentId` (`mapping.productContentId` zaten çekilen veriden geliyor: `:212`), `barcode` göndermeme; `toInternalBatchResult` (`:236-243`) item `SUCCESS`/`FAILED`/`IN_PROGRESS`.
- `T/services/CategoryService.ts` (okunmadı): V2 kategori özellik endpoint'i ve ayrı `values` endpoint'i; V2 yanıtta `attributeValues` gömülü mü doğrulanamadı.
- `T/services/Service.ts:22-24`: `ratePerMin`/`maxConcurrent` tenant kademesine göre; servis-grubu bazlı limitleyici (okuma/yazma/stok-fiyat/sipariş); barkod başına fiyat için 30/dk sayacı; "aynı gövde 15 dk" tekrar önleme (gövde hash'i); 429'da `Retry-After`/geri çekilme; genel 50 istek/10 sn koruması.
- `T/api/ClaimConnector.ts`: `approveClaim` gövdesi (`:114`) `{claimLineItemIdList:[...], params:{}}`; red sebepleri sabit listeleme yerine canlı çekim + 23.09.2026 değişiklikleri.
- `T/api/OrderConnector.ts` `sendOrderInvoice` (`:173-181`): yol ve gövde resmi şemaya (`shipmentPackageId`, `invoiceLink`, `invoiceNumber`, `invoiceDateTime`; 201/409 işleme).
- Webhook (opsiyonel, ikinci faz): `order` yükü aynı şema; tek başına yeterli değil (02.09/08.09.2026 kesintileri) -> periyodik uzlaştırma sorgusu şart.
- **Mock sunucu** (`mockserver/backend/platforms/trendyol/`, INTEGRATIONS_REGISTRY §2.1): `/v2/orders`, `/orders/stream`, `/v2/products`, `products/approved|unapproved`, bulk update yolları, yeni şema alan adları, batch yanıt biçimi ve limitleri (10.000, 429, 15 dk aynı gövde) eklenmezse testler eski şemaya karşı geçer ("mock tek doğruluk kaynağı olmasın", Registry §8/12).
- Test: characterization testleri (Registry §8 madde 3-4) V2 şemasıyla güncellenmeli; canlı/stage doğrulaması insan onayı gerektirir.

---

## 8. Doğrulanamayanlar / çelişkiler

1. Sipariş çekme oran limiti: 30-100/dk (kademeli tablo, 2026-08-25) vs 1000/dk (servis sayfası, 2026-09-24) vs 10 sn'de 50 (auth sayfası).
2. Ürün V1 kapanış tarihi: changelog 21.07.2026 girdisi hâlâ "15 Eylül 2026" diyor (ilk duyuru 10.02.2026'da "10 Ağustos" idi); servis sayfaları (updatedAt 2026-09-18) "15 Ekim 2026" diyor -> tarih uzatılmış görünüyor, 15 Ekim geçerli kabul edildi. Ürün V1 brownout'ları (3x15 dk/gün) şu an sürüyor mu: bilinmiyor.
3. `reference/getshipmentpackages` ve `reference/createproducts` OpenAPI referansları guide sayfalarıyla uyuşmuyor (eski alan adları; `origin` yok; `stockCode`/`dimensionalWeight` zorunlu görünüyor).
4. Adres servisi (`sellers/{id}/addresses`) V1 kapanış listesinde mi: belirsiz.
5. Stream servisi için ayrı oran limiti değeri: yayınlanmamış.
6. getClaims / getClaims tarih penceresi ve sayfa boyutu üst sınırı: sayfada belirtilmemiş (doğrulanamadı).
7. Order V2 brownout saat aralıkları: yayınlanmamış (yalnız "günde 3x10 dk").
8. Changelog'da tarih tutarsızlıkları (ör. yeniden adlandırma girdisi "08.12.2025" olarak listelenmiş ve 2024 girdileri arasında konumlanıyor; örnek yanıt Kasım 2025 tarihli olduğundan 2025 makul); LLM özeti ile ham metin farklı çıkabiliyor -> izleme ajanı ham metni saklamalı.
9. `orderShippingUrl` (`shipment-packages/shipped`) resmi karşılığı bulunamadı.
10. V2 kategori-özellik yanıtında `attributeValues` gömülü mü, yoksa yalnız ayrı `values` uç noktasıyla mı çekiliyor: özet net değil.

---

## Kaynaklar (hepsi A sınıfı, 2026-09-28'de çekildi; aksi belirtilmedikçe)

- Changelog (güncel): https://developers.trendyol.com/v2.0/changelog/changelog
- Sayfa indeksi: https://developers.trendyol.com/llms.txt
- Sipariş: https://developers.trendyol.com/docs/sipari%C5%9F-paketlerini-%C3%A7ekme-getshipmentpackages , https://developers.trendyol.com/docs/sipari%C5%9F-paketlerini-ak%C4%B1%C5%9F-ile-%C3%A7ekme , https://developers.trendyol.com/reference/getshipmentpackages.md
- Webhook: https://developers.trendyol.com/docs/webhook-model.md , https://developers.trendyol.com/docs/webhook-yaratma.md
- Ürün V2: https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-yaratma-v2 , https://developers.trendyol.com/reference/createproducts.md , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-g%C3%BCncelleme-onayl%C4%B1-%C3%BCr%C3%BCn-v2 , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-g%C3%BCncelleme-onays%C4%B1z-%C3%BCr%C3%BCn-v2 , https://developers.trendyol.com/reference/updatedeliveryinfobulk.md , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-v2-api-endpoint , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-men%C5%9Fei-de%C4%9Ferleri (llms.txt üzerinden .md) , https://developers.trendyol.com/docs/kategori-özellik-listesi-v2.md , filtreleme V2 sayfaları (llms.txt'te)
- Ürün V1: https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-api-endpoint , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-aktarma-v2createproducts , https://developers.trendyol.com/docs/%C3%BCr%C3%BCn-bilgisi-g%C3%BCncelleme-updateproduct
- Batch: https://developers.trendyol.com/docs/toplu-i%CC%87%C5%9Flem-kontrol%C3%BC-getbatchrequestresult
- Stok/fiyat V2: https://developers.trendyol.com/docs/stok-ve-fiyat-güncelleme-updatepriceandinventory-1.md
- Limitler: https://developers.trendyol.com/docs/1-servis-limitleri
- Auth / stage: https://developers.trendyol.com/docs/2-authorization.md , https://developers.trendyol.com/docs/3-canlı-test-ortam-bilgileri.md , https://developers.trendyol.com/docs/test-ortam-ip-whitelist-yönetimi.md , https://developers.trendyol.com/docs/test-siparişi-oluşturma.md
- İade/soru/finans/fatura/adres/marka: llms.txt'te listeli `.md` sayfaları (getClaims, approveClaimLineItems, createClaimIssue, getClaimsIssueReasons, müşteri soruları çekme/cevaplama, cari hesap ekstresi, kargo faturası, sendInvoiceLink, uploadInvoiceFile, fatura linki silme, getSuppliersAddresses, getBrandsByName)
- B sınıfı (arama özeti): "origin 30 Haziran 2026" iddiası (reddedildi), rate-limit özetleri (A ile doğrulandı).

# Pazaryeri / E-ticaret / ERP API Sozlesme Referansi

Erisim tarihi (tum kaynaklar): 2026-09-30.
Guven notasyonu: [RESMI] = resmi dokuman sayfasi okundu; [IKINCIL] = ucuncu taraf/arama ozeti (dogrulama gerekir); DOGRULANAMADI = kaynak bulunamadi veya erisilemedi (tahmin yazilmadi).

Erisim notu: developers.hepsiburada.com, listing-external.hepsiburada.com/docs, magazadestek.n11.com, cdn.pazarama.com PDF ve apidoc.ideasoft.dev bu arac uzerinden 401/403 veya bos icerik dondu. Bu platformlarin buyuk kismi bu nedenle [IKINCIL] veya DOGRULANAMADI. Resmi sayfalara tarayici ile elle bakilip dogrulanmali.

---

## 1. TRENDYOL  [RESMI: developers.trendyol.com, .md dizini: https://developers.trendyol.com/llms.txt]

| Konu | Sozlesme | Kaynak |
|---|---|---|
| Kimlik dogrulama | HTTP Basic (sellerId + API Key + API Secret; satici panelinde "Entegrasyon Bilgileri"). Zorunlu `User-Agent`; yoksa 403. Format: `{SellerId} - {EntegrasyonFirmaAdi}` veya kendi yazilim icin `{SellerId} - SelfIntegration` | https://developers.trendyol.com/tr/v3.0/docs/getting-started-1 (arama ozeti) |
| Ortamlar | Prod `https://apigw.trendyol.com/integration/...`; Stage `https://stageapigw.trendyol.com/integration/...` | https://developers.trendyol.com/docs/ürün-yaratma-v2.md |
| Rate limit (14 Eyl 2026 itibariyle) | Servis grubu bazinda ORTAK limit, urun sayisi kademesine gore. Product Read: 1000-2000 req/dk; Product Write: 200-600 req/dk; Inventory&Price Write: 350-2000 req/dk (50K urun: 350); fiyat guncellemede barkod bazli 30 req/dk. Siparis 30-1000/dk; getShipmentPackages 1000/dk; Returns 5-1000; Finance 100; Q&A 500-1000. 429 / Retry-After davranisi dokumanda YOK (DOGRULANAMADI). Eski kural "ayni endpoint'e 10 sn'de 50" artik gecerli mi DOGRULANAMADI | https://developers.trendyol.com/docs/1-servis-limitleri.md |
| Urun olusturma V2 | `POST /integration/product/sellers/{sellerId}/v2/products`. Zorunlu: barcode (str, max 40; sadece `. - _`, bosluk silinir), title (max 100), productMainId (max 40), brandId (int), categoryId (int), quantity (int), description (HTML, max 30000), listPrice (>= salePrice), salePrice, vatRate (int: 0,1,10,20), images (max 8, HTTPS, 1200x1800), attributes. Opsiyonel: stockCode (100), dimensionalWeight, origin (str, 2 karakter ulke kodu), deliveryDuration (0=ayni gun, 1=yarin), lotNumber (100), cargoProviders, shipmentAddressId, returningAddressId. Batch: max 1000 kalem, yanit `batchRequestId` | https://developers.trendyol.com/docs/ürün-yaratma-v2.md |
| Guncelleme | V2 bulk: `.../products/content-bulk-update`, `variant-bulk-update`, `delivery-info-bulk-update`; her biri max 1000 kalem, batchRequestId doner. Content update barcode/productMainId/brandId/categoryId/slicer attribute degistiremez; attribute degisiyorsa TUM attribute degerleri gonderilmeli. `channels`: CORE/LUXE; `locationBasedDelivery`: ENABLED/DISABLED/null | https://developers.trendyol.com/docs/ürün-güncelleme-onaylı-ürün-v2.md |
| Fiyat/stok | `POST /integration/inventory/sellers/{sellerId}/products/price-and-inventory` (V1-V2 ortak). Batch limiti bu okumada DOGRULANAMADI (urun endpoint'leri icin 1000). Onayli urun stok/fiyat listeleme: max 50 barkod/istek, page size max 100, 10.000 sonrasi `nextPageToken` | https://developers.trendyol.com/docs/ürün-v2-api-endpoint.md ; https://developers.trendyol.com/docs/ürün-filtreleme-onaylı-ürün-v2-stok-ve-fiyat.md |
| Batch sonucu | `GET /integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}` (V2) | ayni endpoint dokumani |
| Siparis listeleme | V2 `GET /integration/order/sellers/{sellerId}/v2/orders` (eski `/orders` 15 Eki 2026 sonrasi kapanir). startDate/endDate = epoch ms (GMT+3 yorumlanir), maks 2 hafta aralik; page 0-tabanli, size max 200; erisilebilir en fazla 10.000 paket; sadece son 1 ay. orderByField yalniz `PackageLastModifiedDate`. Durumlar: Created, Picking, Invoiced, Shipped, Cancelled, Delivered, UnDelivered, Returned, Awaiting, Verified, UnSupplied, UnPacked. Limit `shipmentPackageId` sayar (orderNumber degil). `orderDate` GMT+3, `createdDate` GMT dondurur (tutarsizlik!). Para: packageGrossAmount, packageTotalDiscount, packageTotalPrice, lineGrossAmount, lineTotalDiscount. Kurumsal fatura: `commercial=true` | https://developers.trendyol.com/docs/sipariş-paketlerini-çekme-getshipmentpackages.md |
| Iade (claims) | `GET /integration/order/sellers/{sellerId}/claims`; tarihler epoch ms (GMT), iade paketinin lastModifiedDate'ine gore; page 0-tabanli, size max belirtilmemis. claimIds verilirse diger filtreler yok sayilir. Durum: Created, WaitingInAction, WaitingFraudCheck, Unresolved, Rejected, Accepted, Cancelled, InAnalysis. Islem yapilmayan iade 48 saatte otomatik kabul | https://developers.trendyol.com/docs/i̇adesi-oluşturulan-siparişleri-çekme-getclaims.md |
| Soru-cevap | `GET /integration/qna/sellers/{sellerId}/questions/filter` ve `/questions/{id}`; epoch ms, max 2 hafta, size 1-50 (varsayilan 20). Durum: WAITING_FOR_ANSWER, ANSWERED, REPORTED, REJECTED, UNANSWERED | https://developers.trendyol.com/docs/müşteri-sorularını-çekme.md |
| Kategori/marka/attr | `GET /integration/product/brands`, `/product-categories`, `/categories/{id}/attributes`, `/categories/{id}/attributes/{attrId}/values`. Onbellek/degisme sikligi dokumanda YOK (DOGRULANAMADI) | https://developers.trendyol.com/docs/ürün-v2-api-endpoint.md |
| Webhook | VAR (siparis durumlari). Auth: API_KEY (`x-api-key` header) veya BASIC; HMAC imza YOK. 13 durum (CREATED, PICKING, INVOICED, SHIPPED, CANCELLED, DELIVERED, UNDELIVERED, RETURNED, UNSUPPLIED, AWAITING, UNPACKED, AT_COLLECTION_POINT, VERIFIED). Hata halinde 5 dk'da bir tekrar, tekrarlayan hatada otomatik devre disi. Max 15 webhook; URL "Trendyol/Dolap/Localhost" iceremez. Dokuman: periyodik senkron da yapilmali | https://developers.trendyol.com/docs/webhook-model.md |
| Idempotency | Dokumanda idempotency anahtari YOK (DOGRULANAMADI); batch asenkron, sonuc batchRequestId ile sorgulanir |  |

### Trendyol degisiklik takvimi (https://developers.trendyol.com/changelog/changelog.md)
- 10 Sub 2026: Product V2 (barkod yerine content-bazli yapi) yayinda; V1'den gecis son tarihi **15 Eyl 2026 (GECTI)**; V1 brownout (gunde 3x, 15 dk).
- 13 May 2026: bagimsiz `origin` alani eklendi (opsiyonel, gecis donemi). 17 Agu 2026: zorunluluk tarihi **23 Eki 2026**'ya ertelendi; attributes-bazli mensei "until further notice" opsiyonel; eski veri otomatik tasinir.
- 17 Agu 2026: DeliveryOption sadelesme; `fastDeliveryType` bagimliligi kalkti; ayni gun kargo artik `deliveryDuration: 0`; mevcut SAME_DAY_SHIPPING urunler 30 Eyl'e kadar otomatik tasinir.
- 30 Tem 2026: Order V2; eski siparis endpoint'i **15 Eki 2026**'da kapanir, oncesinde 426 doner; V2 10.000 kayit limiti.
- 14 Eyl 2026: yeni servis limitleri (yukarida). 9 Eyl 2026: siparis yanitlarina `paymentMethod`. 16 Mar 2026: `businessUnit` (dijital urunler). 8 Nis 2026: video servisleri. 24 Haz 2025: siparise `createdBy`, `originPackageIds`.

---

## 2. HEPSIBURADA  [cogu IKINCIL; resmi portal 403 dondu]

Kaynak (ikincil): https://www.zunapro.com/turkey/en/blog/hepsiburada-integration-api-guide-seller-manual ; arama sonuclarinda gorunen resmi sayfalar (icerigi okunamadi): https://listing-external.hepsiburada.com/docs , https://developers.hepsiburada.com/hepsiburada/reference/get_packages-merchantid-merchantid , https://developers.hepsiburada.com/hepsiburada/reference/get_claims-merchantid-merchantid

| Konu | Icerik |
|---|---|
| Auth | HTTP Basic (username=API key/integrator, password=secret) [IKINCIL]. Zorunlu `User-Agent: {MERCHANT_ID} - {AppName}`; eksik/hatali ise 401 [IKINCIL]. Baska bir ikincil kaynak OAuth2 Bearer/24 saat token diyor: CELISKILI, DOGRULANAMADI (listing-external resmi arama ozeti Basic diyor) |
| Host'lar | listing-external.hepsiburada.com (listing), mpop.hepsiburada.com/product/api/... (katalog/urun), oms-external.hepsiburada.com (siparis/paket), returns-external (iade), integration.hepsiburada.com/finance. SIT/stage URL: DOGRULANAMADI |
| Rate limit | Kaynaklar celisiyor: "listing ~30 rps, order ~10 rps, 429 + Retry-After" vs "100 istek/dk/merchant". DOGRULANAMADI |
| Urun | Bulk import `POST /product/api/products/import` -> 202 + trackingId, `GET .../import/{trackingId}` ile sorgu; istek basi ~100 urun [IKINCIL]. Alan uzunluk/enum/KDV: DOGRULANAMADI |
| Fiyat/stok | `PUT /listings/merchantid/{id}/sku/{merchantSku}` [IKINCIL]; toplu limit DOGRULANAMADI |
| Siparis/paket | `GET oms-external.../packages/merchantid/{id}` (tarih araligi + sayfalama); tarih formati ve limit max DOGRULANAMADI. Durumlar (ikincil, taslak): Open, Picking, Packaged, Shipped, Delivered, Cancelled, Returned |
| Talepler | `GET /claims/merchantid/{id}` (returns-external) var; enum/format DOGRULANAMADI |
| Webhook | `/webhook-subscriptions` [IKINCIL, DOGRULANAMADI] |
| Degisiklikler | 2025-2026 Hepsiburada duyurulari DOGRULANAMADI |

---

## 3. N11 (REST)  [IKINCIL: codeilla + arama ozeti; magazadestek.n11.com 403]

Kaynaklar: https://codeilla.com.tr/n11-entegrasyon-dokumani-rest-api/ ; resmi sayfalar (okunamadi): https://magazadestek.n11.com/satis-surecleri/restapi-urun-yukleme-10393 , .../restapi-siparis-listeleme-10413 , .../restapi-urun-bilgileri-ve-fiyat-stok-guncelleme-servisi-10173 , .../api-hata-mesajlari-ve-aciklamalari-10433

| Konu | Icerik |
|---|---|
| Auth | Header'da `appkey` + `appsecret` (Authorization yok). Base `https://api.n11.com` |
| Urun | `POST /ms/product/tasks/product-create`, `/product-update`, `/price-stock-update`; max 1000 SKU/istek; asenkron `taskId`; sonuc `POST /ms/product/task-details/page-query`; sorgu `GET /ms/product-query` (varsayilan page 0 size 20) |
| Kategori | `GET /cdn/categories`, `/cdn/category/{id}/attribute`. Onbellek suresi DOGRULANAMADI |
| Siparis | `GET /rest/delivery/v1/shipmentPackages` (startDate, endDate, status, orderNumber, packageIds, page, size, orderByDirection); `PUT /rest/order/v1/update`; `POST /rest/delivery/v1/splitCombinePackage` |
| Tarih | Istek: epoch ms (GMT+3); yanit tarihleri `DD-MM-YYYY HH:MM:SS` (istek/yanit format asimetrisi: mapping tuzagi) [IKINCIL] |
| Para birimi | TL, USD, EUR [IKINCIL] |
| Rate limit | shipmentPackages 1000 istek/dk [IKINCIL]; 429/Retry-After DOGRULANAMADI |
| Iade/talep, soru-cevap, webhook, KDV enum'lari, alan uzunluklari, idempotency | DOGRULANAMADI |
| SOAP gecisi | Sunset tarihi DOGRULANAMADI (magazadestek'te CatalogService SOAP sayfasi hala var) |

---

## 4. PAZARAMA  [IKINCIL / eski PDF]

Kaynaklar: https://cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf (403, okunamadi; 2023 tarihli = guncel olmayabilir), https://isortagim.pazarama.com/auth/integration (panel)

- Auth: OAuth2 client_credentials (clientId/clientSecret, panelde Hesabim > Entegrasyon Bilgileri); token `POST https://isortagimgiris.pazarama.com/connect/token`; token omru arama ozetinde **1 saat**, bir GitHub README'de "1 ay" (CELISKILI, DOGRULANAMADI). Kaynak: arama ozeti (platin360/payer dokumanlari), https://github.com/mehmetgokkaya/pazarama-api-entegrasyon-php
- Batch sonucu: `product/getProductBatchResult?BatchRequestId=...`; siparis: `order/getOrdersForApi` (yol adlari arama ozetinden).
- Rate limit, zorunlu alanlar, enum'lar, tarih formati, iade, webhook, idempotency, prod/stage URL'leri: DOGRULANAMADI.

---

## 5. IDEASOFT  [zayif]

Kaynaklar: https://apidoc.ideasoft.dev/ (Stoplight SPA, icerik cekilemedi), https://www.ideasoft.com.tr/yardim/api-kullanimi/
- Auth: OAuth2 (Client ID/Secret; Read veya Read/Write izin; redirect URL zorunlu; access + refresh token). Token omru, base URL formati (`{magaza}.myideasoft.com/admin-api` ihtimali), rate limit, sayfalama, tarih formati, webhook: DOGRULANAMADI.
- Destek: apisupport@ideasoft.com.tr.

## 6. BIZIMHESAP  [RESMI: https://apidocs.bizimhesap.com/]

- Endpoint'ler (4+1): Siparis/Fatura Ekleme, Urun Listesi, Depo Listesi, Depo Stogu. Base `https://bizimhesap.com/api/b2b/...` (addinvoice: https://apidocs.bizimhesap.com/addinvoice).
- Auth: `FirmID` (govdede/istekte); API Key ve Token ayni deger (arama ozeti); FirmID destek talebiyle alinir. Rate limit, retry: dokumanda YOK.
- addinvoice: tarihler ISO 8601 + offset (`2017-07-08T18:45:52.516+03:00`); invoiceType 3=satis, 5=alis; zorunlu: firmId, invoiceType, dates.invoiceDate, dates.dueDate, customer.customerId/title/address, amounts (currency, gross, discount, net, tax, total), details[]; para/miktar decimal. Yanit HTTP 200 `{error, guid, url}` (HATA da 200 olabilir: `error` alani bos degilse basarisiz sayilmali). Idempotency anahtari YOK: tekrar gonderim cift fatura riski; kendi tarafta invoiceNo/guid ile mukerrer kontrolu gerekir.
- Webhook: yok/DOGRULANAMADI.

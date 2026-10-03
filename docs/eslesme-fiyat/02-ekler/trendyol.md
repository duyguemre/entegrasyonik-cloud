# 04 — Trendyol API Güncellik Raporu (Bölüm 5)

Tarih: 2026-10-03. Depo: `/home/user/entegrasyonik-cloud` (HEAD 7b9b003b, 2026-10-03), salt okunur. Kod kökü: `backend/src/integration/modules/marketplace/trendyol/` (aşağıda `T/`).

## 0. Yöntem ve kaynak güven notasyonu (ÖNCE OKU)

Bu oturumda `developers.trendyol.com` ve `web.archive.org` **kurumsal çıkış politikasıyla engellidir** (proxy `CONNECT 403`; `curl -sS "$HTTPS_PROXY/__agentproxy/status"` ve README "403/407: policy denial, route around etme" — bu yüzden dolanılmadı). Resmî sayfaların `.md` sürümleri, `llms.txt`, iki changelog adresi ve `api-status` **bu oturumda doğrudan okunamadı**. Trendyol'un resmî GitHub deposu (`Trendyol/trendyol-integration-developer-tool`) da `gh api` ile 403 (oturum için etkin değil). Kullanılan kanallar ve güven sınıfları:

| Etiket | Anlamı |
|---|---|
| **[RESMİ-ÖNCEKİ]** | Resmî sayfa 2026-09-28/30 oturumlarında doğrudan okundu (A sınıfı): `docs/research/2026-09-28-trendyol-v2-migration-spec.md` (spec), `docs/research/API_CONTRACTS_2026-09-30.md` (API_CONTRACTS), `docs/research/2026-09-27-api-verification.md`. Bu oturumda **tekrar üretilmedi**, yalnız kodla karşılaştırıldı ve arama özetleriyle çapraz kontrol edildi. |
| **[İKİNCİL-ARAMA]** | Bu oturumda (2026-10-03) WebSearch'ün resmî `developers.trendyol.com` sayfası için verdiği arama-dizini özeti. Sayfa URL'si verilir; metin birebir alıntı değildir, küçük model özetidir. |
| **[İKİNCİL-3T]** | Üçüncü taraf (GitHub SDK/README, blog). Yalnız destekleyici. |
| **DOĞRULANAMADI** | Hiçbir kanalda görülmedi ya da kaynaklar çelişiyor. Tahmin yazılmadı. |

Tarihler: tüm erişimler 2026-10-03 (aksi belirtilmedikçe). Önceki tur erişimleri 2026-09-28 ve 2026-09-30.

---

## (A) Kod envanteri — metot → uç nokta → parametreler

Host/baz: göreli URL'ler `ADAPTER_KEYS.fallbackBaseUrl = https://apigw.trendyol.com/integration` üzerine bindirilir (`src/integration/modules/adapterKeys.ts:16`, `T/services/Service.ts:18`). İzinli host'lar: `api.trendyol.com`, `apigw.trendyol.com`, `stageapigw.trendyol.com` (`common/security/outboundHosts.ts:27`; descriptor `api.hosts` aynı). Mock: `http://localhost:3005/integration` (fail-closed, `TY_MOCKABLE_ENDPOINTS`, `.env.example:61`).

Kimlik/başlık (`T/services/Service.ts:51-60`): HTTP Basic (`APIKEY`/`APISECRET`), `User-Agent: "{SELLERID} - Entegrasyonik"` (SELLERID yoksa fırlatır — C11/2026-09-27 düzeltmesi **koda uygulanmış**). Finans ve buybox çağrılarına ek `storeFrontCode: TR` başlığı (`T/limits.ts:191`, `T/api/FinancialConnector.ts:7`, `T/api/BuyboxConnector.ts:17,56`). Diğer uçlarda storeFrontCode gönderilmez.

Politika: genel 200 istek/dk (`DEFAULT_GLOBAL_RATE_PER_MIN`, env `TY_RATE_PER_MIN`), grup kovaları 50K kademesi: product_read 1000, product_write 200, inventory_price_write 350, finance 100; sipariş listesi 30/dk (`orderListPacer`); barkod başına fiyat 30/dk (`BarcodePriceGate`); maxConcurrent 10, timeout 30 s (`T/limits.ts`, `T/descriptor.ts:142-150`, `rateLimits.verified:false`).

Tarih formatı: tüm connector'lar `startDate/endDate` için **epoch ms** gönderir (OrderConnector `toEpochMs`, Claim/Message/Financial `getTime()`).

| # | Metot (facade `T/index.ts`) | HTTP | Uç nokta şablonu (kod varsayılanı / DB anahtarı) | Parametreler, sabitler, gövde | Kod kanıtı |
|---|---|---|---|---|---|
| 1 | `testConnection` | GET | `product/sellers/{SELLERID}/products/approved` | `page=0,size=1`, grup product_read | `index.ts:75-81` |
| 2 | `retrieveOrders` | GET | `order/sellers/<SELLERID>/v2/orders` (varsayılan; DB `orderListUrl` eski biçimse `urlSafetyNet` V2'ye çevirir; `sapigw` eski gateway tanınır) | `size=200`, `page 0..49`, pencere ≤14 gün-1 dk, geriye bakış ≤30 gün-1 sa, `totalElements>10000` ⇒ pencere ikiye bölme, ardışık çekim, 30/dk pacer; 426 ⇒ `UNAVAILABLE` (brownout) | `OrderConnector.ts:16,30-171`, `limits.ts:32-49`, `urlSafetyNet.ts` |
| 3 | `rejectOrder` | PUT | `order/sellers/<SELLERID>/shipment-packages/<PACKAGEID>/items/unsupplied` (DB `orderRejectUrl`) | gövde `{lines:[{lineId:Number, quantity}], reasonId:Number}` | `OrderConnector.ts:208-240` |
| 4 | `sendOrderShipping` | POST | `order/sellers/<SELLERID>/shipment-packages/shipped` (DB `orderShippingUrl`) — **resmî karşılığı yok** | gövde `{shipments:[{shipmentPackageId, trackingNumber, carrierCode, shipmentDate, items[]}]}`; MARKETPLACE kargo modunda atlanır (no-op) | `OrderConnector.ts:244-284`, `OrderService.ts:50-58` |
| 5 | `sendOrderInvoice` | POST | `sellers/<SELLERID>/seller-invoice-links` (DB `sendInvoiceLinkUrl`) | gövde `{invoiceLink, shipmentPackageId:long, invoiceNumber?}`; `invoiceDateTime` gönderilmez | `OrderConnector.ts:286-329` |
| 6 | `approveOrder` | — | yok (platform otomatik; `true` döner) | — | `index.ts:195-197` |
| 7 | `retrieveClaims` | GET | DB `claimListUrl` (`.../claims`; test fikstüründe eski `api.trendyol.com/sapigw/suppliers/...`) | `page=0,size=50`, `status→claimItemStatus`, tarihler ms; sayfa tavanı 50, eşzamanlılık 3 | `ClaimConnector.ts:16-110`, `limits.ts:56` |
| 8 | `approveClaim` | PUT | DB `claimApproveUrl` (`.../claims/<CLAIMID>/items/approve`) | gövde `{claimLineItemIdList:[...], params:{}}` (kimlik yoksa `{}` + uyarı) | `ClaimConnector.ts:128-159` |
| 9 | `rejectClaim` | POST | DB `claimRejectUrl` (`.../claims/<CLAIMID>/issue?claimIssueReasonId=&claimItemIdList=&description=`) | sorgu dizesi yer tutucuları; gövde `{}`; dosya eki yok | `ClaimConnector.ts:161-191` |
| 10 | `retrieveOrderRejectionReasons` | GET | DB `claimRejectionReasonsUrl` (`order/claim-issue-reasons`) | — | `ClaimConnector.ts:112-126` |
| 11 | `retrieveMessages` | GET | DB `qnaListUrl` (`qna/sellers/<SELLERID>/questions/filter`) | `size=50`, tarihler ms, diğer filtreler aynen | `MessageConnector.ts:11-54` |
| 12 | `answerMessage` | POST | DB `qnaAnswerUrl` (`qna/sellers/<SELLERID>/questions/<QID>/answers`) | gövde `{text}` | `MessageConnector.ts:56-74` |
| 13 | `retrieveFinancials` | GET | DB `financeSettlementsUrl` (`finance/che/sellers/<SELLERID>/settlements`), `financeOtherFinancialsUrl` (`.../otherfinancials`) | `page,size=500`, `startDate/endDate` ms, 15 günlük parçalar, `transactionType` tek tip/çağrı (Sale, Return / PaymentOrder, DeductionInvoices, CreditNote, CommissionInvoice), `storeFrontCode: TR`, grup finance 100/dk, ≤200 sayfa | `FinancialConnector.ts`, `FinancialService.ts` |
| 14 | `retrieveCargoInvoices` | GET | DB `cargoInvoiceUrl` (`.../cargo-invoice/<INVOICESERIALNUMBER>/items`) | `page=0,size=1000` | `FinancialConnector.ts:39-53` |
| 15 | `retrieveSettlementsByPaymentId` | GET | settlements | `paymentOrderId`, `size=1000` | `FinancialConnector.ts:58-69` |
| 16 | `retrieveCategories` | GET | DB `categoryListUrl` (`product/product-categories`) | 6 sa global cache; yanıt `categories[]/subCategories[]` | `CategoryConnector.ts:8-11`, `CategoryService.ts` |
| 17 | `retrieveCategoryAttributes` | GET | `product/categories/<CATEGORYID>/attributes` (V1 `product-categories/...` normalize edilir) | hoşgörülü okuma `categoryAttributes|attributes|content`; `multiple:false` sabit | `CategoryConnector.ts:17-20`, `productUrls.ts:92-98`, `CategoryTransformer.ts` |
| 18 | `retrieveCategoryAttributeValues` | GET | `product/categories/<CATEGORYID>/attributes/<ATTRIBUTEID>/values` (gömülü `attributeValues` yoksa) | sayfalama parametresi gönderilmez | `CategoryConnector.ts:23-26`, `CategoryService.ts:25-44` |
| 19 | `retrieveBrands` | GET | DB `brandListUrl` (`product/brands/by-name`, migrationClassifier testinde apigw) | `size=500` (+`name` ya da sorgu nesnesi); yanıt `brands[]|content[]|dizi` | `BrandConnector.ts`, `BrandTransformer.ts` |
| 20 | `retrieveCategoryCommision` | yerel | `commissions.json` (API yok) | — | `CategoryService.ts:75-101` |
| 21 | `retrievePlatformInfos` → adresler | GET | DB `warehouseAddressList` (`sellers/<SELLERID>/addresses`) | yanıt `supplierAddresses[]`; kargo firmaları statik `shipment-providers.json` | `ShipmentConnector.ts`, `ShipmentService.ts` |
| 22 | `transferProducts` | POST | `product/sellers/<SELLERID>/v2/products` (DB `transferUrl` V1 ise normalize) | `{items:[...]}` ≤1000; alanlar: barcode, title, description, productMainId, brandId, categoryId, quantity, stockCode, dimensionalWeight, lotNumber?, vatRate, shipmentAddressId, returningAddressId, salePrice, listPrice, origin?, deliveryOption{deliveryDuration}?, images[{url}], attributes[{attributeId, attributeValueId | customAttributeValue}]; `cargoProviders` yok; grup product_write | `ProductService.ts:64-168`, `ProductTransformer.ts:79-142` |
| 23 | `updateProduct` (onaylı) | POST | `product/sellers/<SELLERID>/products/content-bulk-update` | `{contentId, title, description, images?, attributes?}` (slicer/varianter hariç; boş attributes gönderilmez) | `ProductTransformer.ts:143-156` |
| 24 | `updateProduct` (onaysız) | POST | `.../products/unapproved-bulk-update` | barkod anahtarlı tam gövde (22 ile aynı alanlar) | `ProductTransformer.ts:156-178` |
| 25 | `updateProductVariant` | POST | `.../products/variant-bulk-update` | `{barcode, vatRate, stockCode, shipmentAddressId, returningAddressId, dimensionalWeight, lotNumber?, locationBasedDelivery, origin?}`; `channels` yok | `ProductTransformer.ts:181-192` |
| 26 | `updateProductDelivery` | POST | `.../products/delivery-info-bulk-update` (`delivery-bulk-update` normalize) | `{barcode, deliveryOptions:{deliveryDuration:0|1}}` | `ProductTransformer.ts:193-202`, `productUrls.ts:101-105` |
| 27 | `updateProductPrice` / `updateProductStock` | POST | DB `updatePriceUrl`/`updateStockUrl` (`inventory/sellers/<SELLERID>/products/price-and-inventory`) | `{items:[{barcode, salePrice, listPrice}]}` / `{items:[{barcode, quantity}]}` ≤1000; grup inventory_price_write; barkod 30/dk ertelemesi; aynı gövde 15 dk engeli `StockPublishTrigger`'da | `ProductService.ts:130,175-191`, `productConstants.ts` |
| 28 | `checkBatchProduct` | GET | `.../products/batch-requests/{batchRequestId}` (DB `checkBatchUrl`/`checkTransferUrl`) | timeout 15 s; batch `status` IN_PROGRESS/COMPLETED(+eski FAILED/PARTIALLY_COMPLETED), kalem SUCCESS/FAILED; stok-fiyat batch'inde statü yoksa kalemden karar | `ProductService.ts:388-415`, `ProductTransformer.ts:512-533` |
| 29 | `streamProducts` | GET | `.../products/approved` (size 100) sonra `.../products/unapproved` (size 1000) | `page`/`nextPageToken`, `page*size≤10000` | `ProductService.ts:286-359` |
| 30 | `updateProductStatuses` | GET | approved (+ unapproved ≤3 sayfa) | `barcodes` ≤50/istek (virgüllü) | `ProductService.ts:430-465` |
| 31 | `readBuybox` | POST | `product/sellers/<SELLERID>/products/buybox-information` (DB `buyboxUrl`) | `{barcodes[≤10]}`, `storeFrontCode: TR` (ayar `STOREFRONTCODE`), yanıt `buyboxInfo[].{barcode,buyboxOrder,buyboxPrice,hasMultipleSeller}`; iş varsayılan kapalı | `BuyboxConnector.ts` |
| 32 | Webhook alıcı (inbound) | POST (gelen) | `/hooks/trendyol/:hookToken` (Express, `/api` dışında) | gövde okunmaz; token eşleşmesi + opsiyonel `webhookAuthType` (API_KEY `x-api-key` / Basic); 404/200/500; yalnız "şimdi çek" sinyali | `src/api/webhooks/WebhookApiManager.ts`, `webhookAuth.ts` |

Descriptor (`T/descriptor.ts`): `adapterVersion 1.1.0`; `api.knownVersion: 'integration v2 (sipariş+ürün)'`; `api.docs`: `v2.0/changelog/changelog`, `llms.txt`, `docs/1-servis-limitleri`, `docs/api-status.md` (hepsi `official:true, monitor:'auto'`); `lastVerifiedAt 2026-09-28`; `knownDeprecatedEndpoints`: sipariş V1 (15.10.2026), ürün V1 (15.10.2026), origin zorunluluğu (23.10.2026); `limitations` hâlâ "`line.id`→`lineId` uygulanmadı (R9)" ve "`origin` eklenmedi (R6)" diyor — **ikisi de kodda uygulanmış, descriptor metni bayat** (bkz. C-13).

Sabitler (`T/productConstants.ts`): alan sınırları barcode 40, title 100, productMainId 40, description 30000, stockCode 100, lotNumber 100, images 8; KDV `[0,1,10,20]`; `TRENDYOL_ORIGIN_REQUIRED_FROM_MS = 2026-10-23T00:00+03:00`; batch sonucu 4 sa; aynı gövde 15 dk.

### A.1 Önceki araştırma bulgularının koda uygulanma durumu (doğrulandı)

| Bulgu (kaynak) | Kodda durum |
|---|---|
| `apigw.trendyol.com/integration` host/yol (2026-09-27) | **Uygulandı** (`adapterKeys.ts:16`, tüm varsayılanlar) |
| User-Agent `{SELLERID} - Entegratör` (2026-09-27) | **Uygulandı** (`Service.ts:58`) |
| Sipariş V2 `v2/orders` + pencere/sayfa/oran (spec §2) | **Uygulandı** (`OrderConnector.ts`, `urlSafetyNet.ts`) |
| Ürün V2 (`v2/products`, approved/unapproved, bulk-update, `categories/{id}/attributes`, `delivery-info-bulk-update`) (spec §1,§3) | **Uygulandı** (`productUrls.ts`, `ProductService.ts`) |
| `origin` alanı + 23.10.2026 zorunluluk (spec §3.2) | **Uygulandı** (`ProductTransformer.resolveOrigin`) — descriptor/limitations metni güncellenmemiş |
| `line.id`→`lineId`, `postalCode`, `company`, para alanları (spec R9) | **Uygulandı** (`OrderTransformer.ts:95-101,193-198,314-324`) — descriptor metni güncellenmemiş |
| Fatura linki gövdesi `{invoiceLink, shipmentPackageId, invoiceNumber?}` (R13) | **Uygulandı** |
| approveClaim `{claimLineItemIdList, params:{}}` (R11) | **Uygulandı** (kimlik yoksa `{}` fallback) |
| Yeni statüler Awaiting/Verified/AtCollectionPoint/UnPacked (R10) | **Uygulandı** (`STATUS_RULES`) |
| `deliveryDuration 0|1`, `fastDeliveryType` kaldırıldı (R12) | **Uygulandı** |
| Oran limitleri grup kovaları + barkod 30/dk (R8, X1) | **Uygulandı** (`limits.ts`) |
| Finans `storeFrontCode` + 100/dk (COM-03) | **Uygulandı** |
| DB `Integrations.urls` göçü (`npm run migrate:trendyol-urls`) | Araç var; **gerçek DB'ye uygulandığı bu depodan doğrulanamaz** (insan adımı; kod tarafı güvenlik ağı var) |

---

## (B) Güncel doküman özeti (konu bazlı)

### B.1 Takvim / kapanışlar
- **Sipariş V1 `order/sellers/{id}/orders` 15 Ekim 2026'da kapanır; o tarihe kadar günde 3×10 dk HTTP 426.** [RESMİ-ÖNCEKİ spec §1; İKİNCİL-ARAMA: `docs/sipariş-paketlerini-çekme-getshipmentpackages`, `changelog/changelog`] — Bu oturumda arama özeti aynı tarihi teyit etti ("v2 endpoint will be activated on October 15, 2026", "V1 deactivated as of October 15, 2026").
- **Ürün V1 servisleri 15 Ekim 2026'da geçersiz** (aktarma, PUT güncelleme, filtreleme, kategori-özellik V1). [RESMİ-ÖNCEKİ spec §8-2; İKİNCİL-ARAMA: `docs/ürün-v2-api-endpoint` "Product V1 services will be invalid starting from 15th October 2026"]. Not: changelog'un eski girdisi "15 Eylül 2026" diyor (bir arama özeti de bunu yansıttı); servis sayfası 15 Ekim — **15 Ekim geçerli kabul** (spec §8-2 ile aynı çözüm).
- **`origin` 23 Ekim 2026'dan itibaren zorunlu**, attributes altı menşe o tarihten sonra opsiyonel, ileride kaldırılacak; mevcut attribute menşe verisi Trendyol tarafından otomatik taşınır. [RESMİ-ÖNCEKİ spec §3.2 (changelog 17.08.2026); İKİNCİL-ARAMA teyit: `changelog/changelog`, `docs/ürün-yaratma-v2`]
- **Oran limitleri 14 Eylül 2026'dan beri servis grubu bazlı/kademeli** (yürürlükte). [RESMİ-ÖNCEKİ spec §3.7; İKİNCİL-ARAMA teyit: `docs/1-servis-limitleri`]
- **23.09.2026: iade red sebepleri yenilendi** (6 kod kaldırıldı: 251, 1701, 1751, 2201, 2001, 2151; 3 yeni: 2077 "kişiye özel ürün iade edilemez", 2078 "kusur yok, müşteri memnuniyeti için kabul", 2079 "ürünü doğru/sağlam gönderdim"; 8 açıklama güncellendi). [RESMİ-ÖNCEKİ spec §1; İKİNCİL-ARAMA teyit `changelog/changelog`]
- **24.09.2026'dan sonraki changelog girdisi**: aramalarda en yeni tarihli girdi 23.09.2026; 25.09–03.10.2026 arası girdi **bulunamadı** (DOĞRULANAMADI — changelog sayfası okunamadı, "yok" kanıtı değil).
- Diğer 2026 girdileri (İKİNCİL-ARAMA ile teyit): 09.09.2026 `paymentMethod`; 17.08.2026 `deliveryDuration 0/1` + `channelId` (1 CORE, 25 Luxe); 31.07.2026 Luxe (`channels`, marka `luxe` alanı); 02.06.2026 stream + 10.000 tavanı; 13.05.2026 bağımsız `origin` (ürün v2 sayfası güncellendi).
- API durum sayfası: `https://developers.trendyol.com/api-status` ("API Health Check", gerçek zamanlı servis sağlığı). [İKİNCİL-ARAMA] (descriptor'daki `docs/api-status.md` adresi DOĞRULANAMADI; gerçek yol `/api-status`).

### B.2 Kimlik doğrulama / başlıklar
- HTTP Basic (API KEY / API SECRET; satıcı paneli Hesap Bilgilerim → Entegrasyon Bilgileri). `User-Agent` zorunlu, yoksa **403**; biçim `"{SellerId} - {EntegratörAdı}"` / `"{SellerId} - SelfIntegration"` (örnek "4321 - SelfIntegration"); entegratör adı alfanümerik ≤30 karakter [RESMİ-ÖNCEKİ spec §4; İKİNCİL-ARAMA `docs/2-authorization`: 401 `ClientApiAuthenticationException`, 403 Forbidden]. 429 `too.many.requests` + "10 sn'de 50 istek" genel kuralı yalnız [RESMİ-ÖNCEKİ spec §3.7-4]; bu oturumda arama ile görülemedi. **`Retry-After` başlığı belgede yok** (DOĞRULANAMADI).
- **`storeFrontCode` başlığı**: TR-dil sayfalarında buybox ve finans (cari hesap ekstresi) için "Header Parameter olarak gönderilmeli" [İKİNCİL-ARAMA `docs/ürün-buybox-kontrol-servisi`, `docs/cari-hesap-ekstresi-entegrasyonu`]. İngilizce v3.0 (global/çok-ülke) dokümanı aynı başlığı kategori, marka, filtre, webhook create, ürün create/delete, getShipmentPackages için de ister ve "TR marketplace için storefrontCode her zaman **'1'**" der [İKİNCİL-ARAMA `v3.0/docs/marketplace-business-model`, `v3.0/docs/product-create-v2`]. **ÇELİŞKİ:** kod `TR` gönderir; TR yerel API'si için doğru değerin `TR` mi `1` mi olduğu DOĞRULANAMADI (bkz. C-9).

### B.3 Ürün oluşturma/güncelleme (V2)
- `POST product/sellers/{sellerId}/v2/products`, `items[]` ≤1000, yanıt `batchRequestId`. Zorunlu: barcode (≤40; yalnız `. - _`, boşluk silinir), title (≤100), productMainId (≤40), brandId (int), categoryId (int), quantity (int), description (HTML ≤30000), listPrice ≥ salePrice, salePrice, vatRate (0/1/10/20), images (≤8, HTTPS, 1200×1800), attributes. Opsiyonel: stockCode (≤100; docs opsiyonel, OpenAPI referansı zorunlu — çelişki), dimensionalWeight (docs opsiyonel/referans zorunlu — çelişki), origin (2 harf; 23.10'da zorunlu), deliveryOption.deliveryDuration (0 aynı gün, 1 ertesi gün), lotNumber (≤100), cargoProviders (barkod bazlı kargo firması, opsiyonel), shipmentAddressId, returningAddressId. `currencyType`, `cargoCompanyId`, `fastDeliveryType` V2'de yok. [RESMİ-ÖNCEKİ API_CONTRACTS §1 + spec §3.1; İKİNCİL-ARAMA teyit: `docs/ürün-yaratma-v2` (updated 13 May 2026), `cargoProviders` opsiyonel]
- **Çoklu özellik değeri:** kategori özellik listesi v2 `allowMultipleAttributeValues:true` döndürürse ürün gövdesinde `attributeValueIds` (çoğul) ile birden fazla değer gönderilir [İKİNCİL-ARAMA `docs/kategori-özellik-listesi-v2`, `docs/ürün-yaratma-v2`]. Alan adının tam yazımı (`attributeValueIds`) yalnız arama özetinde görüldü — resmî sayfa okunamadı.
- Onaylı ürün: `content-bulk-update` (contentId anahtarlı; barcode/productMainId/brandId/categoryId/slicer-varianter değiştirilemez; kısmi güncelleme destekli; attributes değişiyorsa tümü gönderilmeli), `variant-bulk-update` (`channels` CORE/LUXE, stockCode, origin, vatRate, adresler, dimensionalWeight, lotNumber, cargoProviders, `locationBasedDelivery` ENABLED/DISABLED/null), `delivery-info-bulk-update` (`deliveryOptions.deliveryDuration`). Onaysız: `unapproved-bulk-update`. Her biri ≤1000 kalem. [RESMİ-ÖNCEKİ spec §3.3; İKİNCİL-ARAMA teyit `docs/ürün-güncelleme-onaylı-ürün-v2`]
- Batch sonucu `GET .../products/batch-requests/{id}`: 4 sa görüntülenir; batch `status` IN_PROGRESS/COMPLETED, kalem SUCCESS/FAILED(+IN_PROGRESS teslimatta), stok-fiyat batch'inde batch `status` dönmez. [RESMİ-ÖNCEKİ spec §3.4; İKİNCİL-ARAMA teyit 4 sa]

### B.4 Fiyat/stok
- `POST inventory/sellers/{sellerId}/products/price-and-inventory` (V1-V2 ortak), `items[{barcode, quantity?, salePrice?, listPrice?}]` ≤1000; **aynı gövde 15 dk tekrarlanamaz** (hata metni "15 dakika boyunca aynı isteği tekrarlı olarak atamazsınız!"); stok ≤20.000; fiyat için **barkod başına 30 istek/dk** (aşım batch kaleminde hata); yanıt `batchRequestId`. [RESMİ-ÖNCEKİ spec §3.5; İKİNCİL-ARAMA teyit `docs/stok-ve-fiyat-güncelleme-updatepriceandinventory`, `docs/1-servis-limitleri`]
- Onaylı ürün stok/fiyat listeleme: `products/approved/inventory-and-price` (≤50 barkod, size ≤100, `nextPageToken`) [RESMİ-ÖNCEKİ API_CONTRACTS §1] — kodda kullanılmıyor.

### B.5 Kategori / marka / özellik
- `GET product/product-categories` (V1-V2 ortak), `GET product/categories/{id}/attributes` (V2; yanıt: `allowCustom, attribute{id,name}, categoryId, required, varianter, slicer, allowMultipleAttributeValues`; gömülü `attributeValues` V2'de **DOĞRULANAMADI**), `GET product/categories/{id}/attributes/{attrId}/values` (**sayfalı**: `page`, `size` ≤1000; yanıt `totalElements,totalPages,page,size,content[{attributeValueId, attributeValue}]`). Haftalık yenileme önerilir; en alt seviye kategori zorunlu. [İKİNCİL-ARAMA `docs/kategori-özellik-listesi-v2`, `docs/kategori-özellik-değerleri-listesi-v2`; spec §1]
- Marka: `GET product/brands?page=&size=` — **size 1000–2000 arası** ("minimum 1000 marka/sayfa"); `GET product/brands/by-name?name=` (büyük/küçük harf duyarlı); yanıt `brands[]{id,name,luxe}`; limit **50 istek/dk**. [İKİNCİL-ARAMA `docs/trendyol-marka-listesi-getbrands`; spec §1 by-name]

### B.6 Sipariş V2
- `GET order/sellers/{id}/v2/orders`: `startDate/endDate` epoch ms (GMT+3), aralık ≤2 hafta, verilmezse son 1 hafta; `page` 0 tabanlı, `size` ≤200; tavan 10.000 paket (`shipmentPackageId` sayılır); kapsam son 1 ay; `status`, `orderNumber`, `orderByField` (PackageLastModifiedDate / CreatedDate), `orderByDirection`, `shipmentPackageIds` (≤50). Statüler (13): Created, Picking, Invoiced, Shipped, Cancelled, Delivered, UnDelivered, Returned, AtCollectionPoint, UnPacked, UnSupplied, Awaiting, Verified. Awaiting/Verified: stok düşümü dışında işlem yapılmamalı. [RESMİ-ÖNCEKİ spec §2.1; İKİNCİL-ARAMA teyit]
- Yanıt alanları: `shipmentPackageId, orderNumber, paymentMethod` (değerler: "Banka Kartı", "Kredi Kartı", "Alışveriş Kredisi", "Cüzdan - Trendpay", "Şimdi Al Sonra Öde - Trendpay", "-"; faturada gösterilmeli), `commercial` (kurumsal fatura), `createdBy` (order-creation|cancel|split|transfer), `originPackageIds`, `channelId`, `invoiceAddress{taxOffice, taxNumber, company, postalCode, ...}`, `shipmentAddress{...}`, `cargoTrackingNumber/Link, cargoProviderName, cargoDeci, cargoSenderNumber`, `packageGrossAmount/SellerDiscount/TyDiscount/TotalDiscount/TotalPrice`, `orderDate` (GMT+3) vs `createdDate` (GMT), `lines[]{lineId, stockCode, contentId, barcode, lineUnitPrice, lineGrossAmount, lineTotalDiscount, vatRate, orderLineItemStatusName, cancelReason/Code, cancelledBy, productOrigin, ...}`. [RESMİ-ÖNCEKİ spec §2.3; İKİNCİL-ARAMA teyit `paymentMethod` 09.09.2026, `createdBy`]
- Stream: `GET order/sellers/{id}/orders/stream` (cursor `nextCursor/hasMore`, son 3 ay, aralık ≤14 gün, size ≤200, **1000 istek/dk**) [RESMİ-ÖNCEKİ spec §2.2; İKİNCİL-ARAMA `docs/sipariş-paketlerini-akış-ile-çekme` 1000/dk — spec'teki "limit yayınlanmamış" notu artık güncellenebilir, ancak "5 sn aralık" bu oturumda görülmedi].
- Paket statü bildirimi: `PUT order/sellers/{id}/shipment-packages/{packageId}` gövde `{lines:[{lineId,quantity}], params:{invoiceNumber?}, status:"Picking"|"Invoiced"}` [İKİNCİL-ARAMA `v3.0/reference/updatepackagestatus`, `docs/paket-statü-bildirimi-updatepackage`; spec §1]. Tedarik edememe: `PUT .../shipment-packages/{packageId}/items/unsupplied` gövde `{lines:[{lineId,quantity}], reasonId}`; sonrasında paket bölünür, yeni `shipmentPackageId` oluşur [İKİNCİL-ARAMA `docs/tedarik-edememe-bildirimi-updatepackage`; spec §1]. Red sebep kodları (500-5xx) DOĞRULANAMADI.
- Fatura linki: `POST sellers/{id}/seller-invoice-links` `{invoiceLink, shipmentPackageId:long, invoiceDateTime:long(10 veya 13 hane), invoiceNumber:string(3 alfanümerik+13 rakam=16)}`; `invoiceNumber`/`invoiceDateTime` **mikro ihracat ve Trendyol Cross-Border paketlerinde zorunlu**, diğerlerinde opsiyonel; 201 başarı; **409 = link daha önce başka pakete atanmış**. [İKİNCİL-ARAMA `reference/sendinvoicelink`, `v2.0/docs/send-customer-invoice-link-sendinvoicelink`]
- "Kargo bildirimi" (`shipment-packages/shipped`) resmî dokümanda **yok** [RESMİ-ÖNCEKİ spec §1,§8-9; bu oturumda da bulunamadı].

### B.7 İade (claims)
- `GET order/sellers/{id}/claims`: `claimItemStatus` (Created, WaitingInAction, Accepted, Cancelled, Rejected, Unresolved, InAnalysis; +WaitingFraudCheck API_CONTRACTS'ta), `orderNumber`, `claimIds[]` (verilirse diğer filtreler yok sayılır), `startDate/endDate` (ms, paket `lastModifiedDate`), `page` 0, **`size` varsayılan 50, maksimum 200**. Yanıt kökü `claimId` (eski `id`), red paketlerinde `cargoTrackingNumber, packageId, cargoProviderName, cargoTrackingLink, shipmentAddress` (telefon 4 gün). [RESMİ-ÖNCEKİ API_CONTRACTS §1; İKİNCİL-ARAMA `reference/getclaims`, `v3.0/docs/2-getting-returned-orders`]. 48 saatte otomatik kabul [RESMİ-ÖNCEKİ API_CONTRACTS; bu oturumda görülmedi].
- Onay: `PUT .../claims/{claimId}/items/approve` `{claimLineItemIdList, params:{}}` — yalnız **WaitingInAction**; limit **5 istek/dk**. Red: `POST .../claims/{claimId}/issue?claimIssueReasonId=&claimItemIdList=&description=` (opsiyonel dosya; bazı sebeplerde zorunlu değil); limit 5/dk. Sebepler: `GET order/claim-issue-reasons`. [RESMİ-ÖNCEKİ spec §1; İKİNCİL-ARAMA teyit]
- Ek uçlar (kodda yok): `createClaim` (satıcı adına iade açma), `claim audits`. [İKİNCİL-ARAMA/İKİNCİL-3T bevren MCP]

### B.8 Soru-cevap
- `GET qna/sellers/{id}/questions/filter`: `startDate/endDate` ms, ≤2 hafta, `size` varsayılan 20 / **≤50**, `status`: **WAITING_FOR_ANSWER, ANSWERED, REPORTED, REJECTED, UNANSWERED** (yalnız WAITING_FOR_ANSWER cevaplanabilir); `GET .../questions/{id}`. Cevap: `POST .../questions/{id}/answers` `{text}` 10–2000 karakter, yasaklı kelime denetimi. Limit: çekme 1000/dk, cevap 500/dk. [RESMİ-ÖNCEKİ spec §1; İKİNCİL-ARAMA `docs/müşteri-sorularını-çekme`, `docs/müşteri-sorularını-cevaplama`]

### B.9 Finans
- `GET finance/che/sellers/{id}/settlements` (Sale, Return, Discount, Coupon, komisyon), `.../otherfinancials` (PaymentOrder, DeductionInvoices, CreditNote, CommissionInvoice, virman, satıcı finansmanı...), `.../payment-order` (ÖDENMİŞ ödeme emirleri, sayfa ≤10 kayıt; `id` → `paymentOrderId` filtresi), `.../cargo-invoice/{invoiceSerialNumber}/items`. `startDate–endDate ≤15 gün`; `transactionType` tek tip, `transactionTypes` çoklu (ikisi birlikte verilirse `transactionTypes` geçerli); `storeFrontCode` başlığı zorunlu; limit **100/dk**. [RESMİ-ÖNCEKİ spec §1 + MARKETPLACE_COMMISSIONS; İKİNCİL-ARAMA `docs/cari-hesap-ekstresi-entegrasyonu`, `reference/getotherfinancials`, `reference/getcargoinvoiceitems`]. Yanıt satır alanları (`id, transactionType, orderNumber, barcode, commissionRate, commissionAmount, sellerRevenue, debt, credit, paymentPeriod, paymentDate, paymentOrderId, transactionDate`) koddaki zod gözlem sözleşmesinden (`contracts/finance.settlements.ts`); resmî alan listesi bu oturumda DOĞRULANAMADI.

---

## (C) FARKLAR — eski/kullanımdan kalkmış uçlar, değişen alanlar, eksik zorunlu alanlar

Öncelik: P0 = 15–23 Ekim 2026 kırılması / veri bütünlüğü; P1 = ret/429/hatalı iş; P2 = iyileştirme.

| # | Ö | Fark | Kod kanıtı | Doküman kaynağı | Önerilen düzeltme |
|---|---|---|---|---|---|
| C-1 | **P0** | **Çoklu özellik değeri gönderilemiyor.** V2'de `allowMultipleAttributeValues:true` özelliklerde `attributeValueIds[]` beklenir; kod yalnız `{attributeId, attributeValueId}` üretir ve kategori eşlemesinde `multiple:false` sabittir. Çoklu zorunlu özelliklerde eksik/yanlış değer → ürün reddi. | `ProductTransformer.ts:625-672` (`out = {attributeId, attributeValueId}`), `CategoryTransformer.ts:46` (`multiple:false`), `ProductService.ts:251` | [İKİNCİL-ARAMA] `docs/kategori-özellik-listesi-v2`, `docs/ürün-yaratma-v2`; WP9 notu (`ProductTransformer.ts:623`) "çoklu değer temsil edilemez" | `CategoryMapper.toInternalAttributes` → `multiple: !!attr.allowMultipleAttributeValues`; veri modeli özellik başına değer dizisi; `prepareAttributes` çoklu değerde `attributeValueIds:[...]` üretsin. Alan adının tam yazımı resmî sayfadan (yerelden) teyit edilmeli. |
| C-2 | **P0** | **Kategori özellik değerleri ucu sayfalı (`page`, `size≤1000`); kod sayfalama göndermiyor ve yanıtı `data.attributeValues ?? values ?? content ?? []` olarak tek seferde okuyor.** 1000'den çok değerli özelliklerde (renk vb.) ilk sayfadan sonrası kaybolur → "değer listede yok" hatası ile yanlış ret. Yanıt alan adları `attributeValueId/attributeValue` iken `toInternalValues` `id/name` bekler (`v.id` yoksa kayıt düşer). | `CategoryConnector.ts:23-26`, `CategoryService.ts:25-44`, `CategoryTransformer.ts:50-56` | [İKİNCİL-ARAMA] `docs/kategori-özellik-değerleri-listesi-v2` (yanıt `totalElements,totalPages,page,size,content[{attributeValueId,attributeValue}]`) | `fetchAttributeValuesFromPlatform(categoryId, attributeId, page, size=1000)` + `totalPages` döngüsü; `toInternalValues` `attributeValueId/attributeValue` alanlarını da okusun. Yanıt şekli yerelde LIVE_READONLY ile teyit edilsin. |
| C-3 | **P0** | **Marka listesi `size=500` gönderiyor; resmî `size` 1000–2000 arası.** `brands/by-name` için `size` parametresi belgelenmedi; `brands` listesi için 500 geçersiz (min 1000) → 400 riski ya da sessiz yok sayma. Marka limiti 50/dk — kodda ayrı kova yok (genel 200). | `BrandConnector.ts:12` | [İKİNCİL-ARAMA] `docs/trendyol-marka-listesi-getbrands` ("size min 1000 max 2000", 50 req/min) | `by-name` çağrısında yalnız `name`; tam liste için `size=1000` + `page` döngüsü; `brand_read` 50/dk kovası. |
| C-4 | **P0** | **Soru statü enum'u eski:** kod `WAITING_SELLER` bekler/döner; resmî statüler `WAITING_FOR_ANSWER, ANSWERED, REPORTED, REJECTED, UNANSWERED`. `mapStatus` bilinmeyen değeri `WAITING_SELLER`'a düşürdüğü için REPORTED/UNANSWERED sorular "cevap bekliyor" görünür, cevap denemesi reddedilir. | `MessageTransformer.ts:65-76` | [İKİNCİL-ARAMA] `docs/müşteri-sorularını-çekme`, `docs/müşteri-sorularını-cevaplama` | Eşleme: WAITING_FOR_ANSWER→WAITING_SELLER(iç), REPORTED/UNANSWERED→ayrı iç statü (cevaplanamaz), bilinmeyen→`reportUnknownEnum`. Listeleme sorgusunda `status=WAITING_FOR_ANSWER` kullan. |
| C-5 | **P1** | **`sendOrderShipping` ucu (`shipment-packages/shipped`) resmî dokümanda yok.** Resmî paket statü ucu `PUT .../shipment-packages/{packageId}` `{lines, params, status:"Picking"|"Invoiced"}`; "Shipped" satıcı tarafından bildirilmez (kargo entegrasyonu). MARKETPLACE modunda atlanıyor; manuel kargoda 404 üretir. | `OrderConnector.ts:249-268` | [RESMİ-ÖNCEKİ] spec §1 "doğrulanamadı/yok"; [İKİNCİL-ARAMA] `v3.0/reference/updatepackagestatus` | Ucu `NOT_SUPPORTED` olarak işaretle ya da Picking/Invoiced statü bildirimine dönüştür (descriptor `shippingNotice` → `not_supported`/`platform_auto`). |
| C-6 | **P1** | **Fatura linki: `invoiceNumber`/`invoiceDateTime` mikro ihracat ve Cross-Border paketlerde zorunlu**; kod `invoiceDateTime` hiç göndermiyor, `invoiceNumber` biçimi (3 alfanümerik+13 rakam) doğrulanmıyor; 409'un anlamı ("link başka pakete atanmış") kodda bilinmiyor. | `OrderConnector.ts:297-311` | [İKİNCİL-ARAMA] `reference/sendinvoicelink`, `v2.0/docs/send-customer-invoice-link-sendinvoicelink` | `micro`/`etgbNo` olan paketlerde iki alanı zorunlu kıl; `invoiceDateTime` epoch ms gönder; 409'u `CONFLICT` (idempotent başarı adayı) olarak sınıfla. |
| C-7 | **P1** | **İade listesi `size=50` sabit; resmî maksimum 200.** 50 sayfa tavanı × 50 = 2.500 iade/pencere; 200 ile 10.000'e çıkar, istek sayısı 4'e böler (getClaims 1000/dk ama onay/red 5/dk). | `ClaimConnector.ts:23`, `limits.ts:56` | [İKİNCİL-ARAMA] `reference/getclaims` ("size default 50, max 200") | `size=200`; `TRENDYOL_CLAIM_PAGING` notunu güncelle; onay/red için 5/dk kovası ekle (kodda yok). |
| C-8 | **P1** | **Onaylı içerik güncellemede `channels` ve `cargoProviders` desteklenmiyor**; Luxe kanalı (31.07.2026) ve barkod bazlı kargo firması gönderilemez. V1'den kalan statik `shipment-providers.json` resmî `getProviders` ucu yerine kullanılıyor. | `ProductTransformer.ts:181-192`, `ShipmentService.ts:28-40` | [İKİNCİL-ARAMA] `docs/ürün-güncelleme-onaylı-ürün-v2`, `docs/trendyol-kargo-şirketleri-listesi-getproviders-1` | Varyant gövdesine opsiyonel `channels`/`cargoProviders`; kargo firmalarını `getProviders`'tan çek (statik JSON bayatlık riski). |
| C-9 | **P1** | **`storeFrontCode` değeri çelişkili (`TR` vs `1`) ve yalnız finans+buybox'ta gönderiliyor.** v3.0 (çok-ülke) dokümanı TR için `1` der ve başlığı kategori/marka/filtre/ürün/sipariş/webhook uçlarında da ister; TR yerel sayfaları yalnız buybox/finans için ister. | `limits.ts:191`, `BuyboxConnector.ts:17`, `FinancialConnector.ts:7` | [İKİNCİL-ARAMA] `v3.0/docs/marketplace-business-model`, `docs/cari-hesap-ekstresi-entegrasyonu`, `docs/ürün-buybox-kontrol-servisi` | Yerelde LIVE_READONLY ile `TR` ve `1` denenip teyit; değer `STOREFRONTCODE` ayarına bağlanıp varsayılan doğrulanmış değere çekilsin. Finans testleri geçiyorsa `TR` doğru olabilir — kanıt yok. |
| C-10 | **P1** | **Sipariş çekme imleci yok:** her poll son 1 hafta tam taranıyor (`lastSyncTimestamp`→`startDate` kararı açık, BACKLOG C22); `orderByField=PackageLastModifiedDate` kullanılmıyor; stream ucu (1000/dk, cursor) kullanılmıyor. | `OrderConnector.ts:54-57`, BACKLOG C22 notu | [RESMİ-ÖNCEKİ] spec §2.2; [İKİNCİL-ARAMA] stream 1000/dk | `lastModifiedDate` imleci + `orders/stream` ile periyodik senkron; `v2/orders` yalnız dar pencere/orderNumber sorguları için. |
| C-11 | **P1** | **Tedarik edememe `reasonId`**: resmî gövde `{lines, reasonId}` ile uyumlu; ancak `OversellCompensationJob` `reasonId:'OUT_OF_STOCK'` → `Number()` = NaN (BACKLOG C22 bulgusu, hâlâ açık). Red sebep kodu listesi doğrulanamadı. | `OrderConnector.ts:229-235`; BACKLOG C22 | [İKİNCİL-ARAMA] `docs/tedarik-edememe-bildirimi-updatepackage` | Sayısal `reasonId` zorunlu doğrulaması; sebep kodları `retrieveOrderRejectionReasons`/resmî sayfadan alınmalı (sayfa okunamadı). |
| C-12 | **P2** | **Onaysız filtre `barcodes` parametresi belgelenmedi**; kod 3 sayfaya kadar deneme yapıyor (belirsizlik kodda not edilmiş). Onaysız `status` (rejected, pendingApproval) filtresi kullanılmıyor. | `ProductService.ts:454-461` | [RESMİ-ÖNCEKİ] spec §3.6; bu oturumda onaysız filtre parametreleri DOĞRULANAMADI | Yerelde teyit; `status=rejected` ile daraltma. |
| C-13 | **P2** | **Descriptor/limitations bayat:** "lineId uygulanmadı (R9)", "origin eklenmedi (R6)" yazıyor; ikisi de uygulandı. `api.docs` `docs/api-status.md` adresi DOĞRULANAMADI (gerçek sayfa `/api-status`). `lastVerifiedAt 2026-09-28`. | `descriptor.ts:136-141,158` | Kod (`OrderTransformer.ts:95-101`, `ProductTransformer.ts:324-341`) | Limitations güncelle; `api-status` URL'sini düzelt; `lastVerifiedAt` yalnız yerel doğrulama sonrası ilerlet. |
| C-14 | **P2** | **Kategori özellik yanıtında `allowMultipleAttributeValues` okunmuyor** (C-1'in ön koşulu); V2 yanıtında değerlerin gömülü gelip gelmediği belirsiz — kod önce gömülüyü dener. | `CategoryTransformer.ts:34-48` | [İKİNCİL-ARAMA] `docs/kategori-özellik-listesi-v2` | Alanı modele ekle; gömülü değer yoksa C-2 sayfalı çekim. |
| C-15 | **P2** | **Claim statüsü `WaitingFraudCheck` APPROVED'a eşleniyor**; `Accepted`/`completed` çakışan eşleme (`'Accepted'` küçük harfe çevrildikten sonra asla eşleşmez — ölü dal). | `ClaimTransformer.ts:118-131` | [RESMİ-ÖNCEKİ] API_CONTRACTS §1 statü listesi | WaitingFraudCheck→UNDER_REVIEW; ölü dalı temizle. |
| C-16 | P2 | Webhook alıcısı gövdeyi okumuyor (bilinçli, ADR-0005) — `paymentMethod` dahil yük kullanılmıyor; Trendyol tarafında webhook **oluşturma** (`POST webhook/sellers/{id}/webhooks`) kodda yok (manuel). | `WebhookApiManager.ts` | [İKİNCİL-ARAMA] `docs/webhook-yaratma` | Webhook kaydını API ile yönet (15 limit, URL kısıtı); pasife alınma e-postası izlenemez → `webhookHealthy` mutabakatı korunmalı. |

**Doğru/uyumlu bulunanlar (fark yok):** V2 sipariş/ürün yolları ve pencere/sayfa sınırları; `v2/products` zorunlu alan seti + alan uzunlukları + KDV enum; `origin` 23.10.2026 kapısı; `deliveryDuration 0/1`; `price-and-inventory` 1000 kalem + 15 dk + barkod 30/dk; batch sonucu yorumu (stok-fiyat batch'inde statü yok); `approveClaim` gövdesi; QnA cevap gövdesi `{text}` (uzunluk 10–2000 kodda doğrulanmıyor — küçük eksik); finans 15 gün parçalama + `transactionType` tek tip; fatura linki yolu (`order/` öneksiz); User-Agent; Basic auth; grup kovaları 50K değerleri (1000/200/350, finans 100, sipariş 30).

---

## (D) Rate limit / webhook / sandbox / durum-değiştiren uçlar

### D.1 Rate limit tablosu (14 Eylül 2026'dan itibaren; kademe = satıcının listeleme kapasitesi)
| Servis grubu | 50K | 75K | 150K | 500K | Sınırsız | Kaynak |
|---|---|---|---|---|---|---|
| Ürün OKUMA (filtre, batch kontrol vb. ortak) | 1000 | 1250 | 1500 | 1750 | 2000 | [RESMİ-ÖNCEKİ spec §3.7]; aralık [İKİNCİL-ARAMA] teyit |
| Ürün YAZMA (aktarma+güncelleme+silme ortak) | 200 | 300 | 400 | 500 | 600 | aynı |
| Stok & Fiyat YAZMA | 350 | 500 | 1000 | 1500 | 2000 | aynı |
| Fiyat, barkod bazlı | 30/dk (tüm kademeler) | | | | | aynı |
| Sipariş çekme (getShipmentPackages) | 30 | 40 | 50 | 100 | 100 | [RESMİ-ÖNCEKİ spec §3.7-3; İKİNCİL-ARAMA teyit] — **servis sayfası "1000/dk" diyor (çelişki sürüyor)** |
| Sipariş stream | 1000/dk | | | | | [İKİNCİL-ARAMA] `docs/sipariş-paketlerini-akış-ile-çekme` |
| İade çekme / onay / red | 1000 / 5 / 5 per dk | | | | | [RESMİ-ÖNCEKİ spec; İKİNCİL-ARAMA teyit 1000 ve 5] |
| Finans (settlements/otherfinancials/cargo) | 100/dk | | | | | [İKİNCİL-ARAMA] `docs/cari-hesap-ekstresi-entegrasyonu` |
| Soru çekme / cevap | 1000 / 500 per dk | | | | | [İKİNCİL-ARAMA] |
| Marka / kategori / kategori-özellik | 50/dk (eski tablo; yeni tabloda ayrı değer yok) | | | | | [RESMİ-ÖNCEKİ spec §3.7-1]; marka 50/dk [İKİNCİL-ARAMA] |
| Buybox | 1000/dk | | | | | [İKİNCİL-ARAMA] |
| Adres | 1/saat (eski tablo) | | | | | [RESMİ-ÖNCEKİ] |

Kod eşlemesi: product_read/write/inventory_price/finance kovaları doğru (50K). **Eksik kovalar:** marka/kategori (50/dk), iade onay/red (5/dk), soru cevap (500/dk), adres (1/saat; kodda 5 dk tenant cache var — saatte 12 çağrı olabilir). 429 davranışı: genel "10 sn'de 50 istek" + `too.many.requests` [RESMİ-ÖNCEKİ]; `Retry-After` **belgede yok** (DOĞRULANAMADI); 10.000 tavanı aşan sipariş sorgusu 429 döner [RESMİ-ÖNCEKİ spec §2.1].

### D.2 Webhook
- Var; yalnız **sipariş paketi durumu** olayları: CREATED, PICKING, INVOICED, SHIPPED, CANCELLED, DELIVERED, UNDELIVERED, RETURNED, UNSUPPLIED, AWAITING, UNPACKED, AT_COLLECTION_POINT, VERIFIED (boş `subscribedStatuses` = hepsi). Yük = paket modeli (`paymentMethod` dahil). [İKİNCİL-ARAMA `docs/webhook-model`, `docs/webhook-yaratma`; RESMİ-ÖNCEKİ spec §2.4]
- Auth: `authenticationType` = `API_KEY` (`x-api-key` başlığı, `apiKey`) veya `BASIC_AUTHENTICATION` (`username`/`password`). **HMAC imza yok.** [İKİNCİL-ARAMA]
- Yeniden deneme/pasife alma: hata hâlinde tekrar denenir ("başarılana kadar 5 dk'da bir" [RESMİ-ÖNCEKİ spec §2.4]); arama özeti "13 hata sonrası otomatik pasif + 2 e-posta" dedi [İKİNCİL-ARAMA `docs/webhook-model`]; 3. taraf "5 deneme, 3 sn içinde 200" dedi [İKİNCİL-3T zunapro] — **sayılar çelişiyor, kesin kural DOĞRULANAMADI**; "otomatik pasif + e-posta" her kaynakta ortak. Satıcı başına ≤15 webhook (pasifler dahil); URL "Trendyol/Dolap/Localhost" içeremez; pasif webhook düzeltme sonrası yeniden aktifleştirilebilir. Uçlar: `POST/GET/PUT/DELETE webhook/sellers/{id}/webhooks`.
- Kod: alıcı var (`/hooks/trendyol/:hookToken`), API_KEY/Basic doğrulaması `webhookAuthType` ile; gövde okunmaz → yalnız "çek" sinyali. 02.09/08.09.2026 kesintileri nedeniyle periyodik mutabakat şart (kodda 5 dk geri düşüş var, ADR-0005).

### D.3 Sandbox / stage
- `https://stageapigw.trendyol.com/integration/...`; panel `https://stagepartner.trendyol.com/account/login`. IP whitelist zorunlu, yoksa **503**; çağrı merkezi 0850 258 58 00 üzerinden "satıcı bildirimi" (test ortamı + IP). Paylaşımlı test hesabı var; özel hesap için Satıcı Merkezi destek talebi (e-posta, telefon, VKN/TCKN). Test siparişi: `POST https://stageapigw.trendyol.com/integration/test/order/orders/core` (Header `SellerID`, Basic auth test satıcısıyla); test sipariş statü güncelleme, iade testini WaitingInAction'a alma, stage'de soru oluşturma servisleri var. [İKİNCİL-ARAMA `docs/3-canlı-test-ortam-bilgileri`, `docs/test-siparişi-oluşturma`; RESMİ-ÖNCEKİ spec §5]. IP whitelist API (`product/sellers/{id}/ip-whitelists`, ≤7 IP, günde 7, IPv4) yalnız [RESMİ-ÖNCEKİ spec §5]; bu oturumda arama ile görülemedi.
- Kod: `stageapigw.trendyol.com` izinli host listesinde ve `urlSafetyNet` stage'i tanır; stage kullanımı için ayar/DB URL'leri değiştirilmeli (ayrı "env" kavramı yok).

### D.4 "Okuma gibi görünen ama durum değiştiren" uçlar
| Uç | Görünüm | Gerçek etki | Koddaki durum |
|---|---|---|---|
| `PUT shipment-packages/{id}` status Picking/Invoiced | "statü senkronu" | Siparişi hazırlanıyor/faturalandı yapar; müşteri bildirimi tetikler | Kodda yok (approveOrder no-op) — iyi |
| `PUT .../items/unsupplied` | "iptal bildirimi" | Paketi böler, yeni `shipmentPackageId` üretir, satırı iptal eder | `rejectOrder` — yazma; `OversellCompensationJob` NaN reasonId riski |
| `POST seller-invoice-links` | "fatura linki" | Müşteriye fatura gönderir; 409 = link başka pakete bağlı | yazma, idempotent değil |
| `PUT claims/{id}/items/approve`, `POST claims/{id}/issue` | "iade işlemi" | İadeyi kapatır / itiraz açar; 5/dk | yazma |
| `POST questions/{id}/answers` | "cevap" | Yayınlanır, yasaklı kelime denetimi; yalnız WAITING_FOR_ANSWER | yazma |
| `POST products/buybox-information` | **POST ama salt okuma** | Yan etkisiz (gövde = barkod listesi) | kod `idempotent:true` işaretli — doğru |
| `POST price-and-inventory` aynı gövde | "tekrar gönderim" | 15 dk içinde aynı gövde **hata** verir; batch kuyruğu kirlenir | `StockPublishTrigger` engeli |
| `POST test/order/orders/core` (stage) | "test" | Stage'de gerçek sipariş kaydı | kodda yok |
| Webhook `POST webhooks` | "kayıt" | Trendyol tarafında kalıcı kaynak; 15 sınırı | kodda yok (manuel) |
| Soru "okundu" işareti, bildirim kuyruğu tüketme | — | **Trendyol API'sinde böyle uç bulunamadı** (DOĞRULANAMADI/yok) | — |

---

## (E) Marka eşlemesi desteği

- **`brandId` ürün oluşturmada zorunlu (int)**; kaynak `GET product/brands` (sayfalı, `size` 1000–2000, yanıt `brands[]{id,name,luxe}`) veya `GET product/brands/by-name?name=` (büyük/küçük harf duyarlı, tam ad). Limit 50/dk. [İKİNCİL-ARAMA `docs/trendyol-marka-listesi-getbrands`, `reference/getbrandsbyname`]
- **Marka talebi:** resmî TR dokümanında `createBrand` POST ucu için tam sayfa bu oturumda bulunamadı; önceki tur "marka yaratma `POST .../brands`" listeledi [RESMİ-ÖNCEKİ spec §1 ek uçlar], bevren MCP de `trendyol_create_brand` aracı sunuyor [İKİNCİL-3T]. Entegratör rehberleri (ikas, ideasoft, sentos) "marka listede yoksa önce **satıcı panelinde** marka oluşturulmalı/başvuru yapılmalı" diyor [İKİNCİL-3T]. **Sonuç: API ile marka talebi açılabilirliği ve gövdesi DOĞRULANAMADI; panel yolu kesin.**
- Kod: `mappingProvider.getPlatformBrandId` ile eşleme; eşleşme yoksa ürün `failedVariants` ("Eşleşme bulunamadı") (`ProductService.ts:84-89`); `assertContract` `brandId` tam sayı denetimi (`ProductTransformer.ts:236`). Marka arama `by-name` + `size=500` (C-3). **Eksik:** Luxe markası kontrolü (`luxe` alanı), marka talebi akışı (panel yönlendirmesi/UI notu), 50/dk kovası.

---

## (F) Erişilemeyen kaynaklar ve doğrulanamayanlar

**Erişilemeyen (bu oturum, 2026-10-03, politika engeli 403):**
- `https://developers.trendyol.com/llms.txt`, `/changelog/changelog.md`, `/v2.0/changelog/changelog`, `/docs/1-servis-limitleri.md`, `/docs/2-authorization.md`, `/docs/3-canlı-test-ortam-bilgileri.md`, `/api-status` ve tüm `docs/*.md`, `reference/*` sayfaları (`EGRESS_BLOCKED`).
- `https://web.archive.org/...` (aynı engel).
- `https://github.com/Trendyol/trendyol-integration-developer-tool` (raw README 404; `gh api` 403 — oturum için depo etkin değil; `add_repo` denenmedi çünkü üçüncü taraf depoya erişim kapsam dışı sayıldı).

**Doğrulanamayanlar / çelişkiler:**
1. 25.09.2026–03.10.2026 arasında yeni changelog girdisi var mı (en yeni görülen 23.09.2026).
2. `storeFrontCode` TR değeri (`TR` vs `1`) ve hangi uçlarda zorunlu (TR yerel vs global dokümanı).
3. Sipariş çekme oran limiti: 30–100/dk kademe tablosu vs 1000/dk servis sayfası.
4. 429 `Retry-After` başlığı; "10 sn'de 50 istek" kuralının 14.09.2026 sonrası geçerliliği.
5. Webhook yeniden deneme sayısı/aralığı (5 dk'da bir / 13 hata / 5 deneme — üç farklı anlatım).
6. `attributeValueIds` alan adının tam yazımı ve çoklu değer gövde örneği.
7. Onaysız ürün filtresi parametreleri (`barcodes`, `status`) ve V2 kategori-özellik yanıtında gömülü değer varlığı.
8. Tedarik edememe `reasonId` kod listesi; Picking/Invoiced statü ucunun gövde ayrıntısı.
9. `createBrand`/marka talebi API ucu ve gövdesi.
10. Adres ucu (`sellers/{id}/addresses`) V1 kapanış listesinde mi.
11. getClaims 48 saat otomatik kabul; iade `size` max 200 (tek arama özeti).
12. IP whitelist API sınırları (7 IP) — yalnız önceki tur.
13. Ürün V1 brownout'larının şu an sürüp sürmediği; Order V1 426 saat aralıkları.
14. `api-status` sayfasının makine okunur (`.md`/JSON) sürümü var mı.

**Öneri:** yerelde (egress izinli ortam) `docs/LIVE_READONLY.md` prosedürüyle salt okunur çağrılarla C-2, C-3, C-9 ve `allowMultipleAttributeValues` yanıt şekli teyit edilmeli; `llms.txt` + changelog ham metni `docs/research/` altında arşivlenmeli (izleme ajanı için).

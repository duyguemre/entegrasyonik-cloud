# 04 — Pazarama API: Kod Envanteri vs. Güncel Doküman Araştırması

Tarih: 2026-10-03 · Depo: `entegrasyonik-cloud` (salt okunur) · Modül: `backend/src/integration/modules/marketplace/pazarama/**`

Güven etiketleri: **[RESMİ]** Pazarama'nın kendi yayını · **[RESMİ-snippet]** resmî sayfanın arama motoru özetinden (sayfa kendisi erişilemedi) · **[İKİNCİL]** üçüncü taraf SDK/entegratör/kod · **DOĞRULANAMADI** hiçbir dış kaynak yok.
Erişim durumu (özet, ayrıntı §F): Pazarama'nın kendi host'ları (`isortagim`, `cdn`) ve `archive.org` bu oturumda egress proxy'de engelli; `developer.pazarama.com` DNS'te yok (ENOTFOUND). Tüm doğrulamalar GitHub kaynak kodu (14 depo, 2022–2026) ve arama motoru snippet'leri üzerinden yapıldı. **Tahmin yazılmadı; kaynağı olmayan her şey DOĞRULANAMADI olarak işaretlendi.**

---

## (A) Kod envanteri

### A.1 Host, auth, taban ayarlar
| Konu | Kodda | Kanıt |
|---|---|---|
| İzinli host'lar | `isortagim.pazarama.com`, `isortagimapi.pazarama.com`, `isortagimgiris.pazarama.com` | `common/security/outboundHosts.ts:34`, `descriptor.ts api.hosts` |
| Token ucu | `POST https://isortagimgiris.pazarama.com/connect/token` (tenant `urls.tokenUrl` ile ezilebilir) | `services/Service.ts` `DEFAULT_TOKEN_URL` |
| Token gövdesi | `application/x-www-form-urlencoded`: `grant_type=client_credentials`, `client_id`, `client_secret` (gövdede) — **`scope` YOK**, Basic auth YOK | `Service.ts fetchToken` |
| Token yanıtı okunan alanlar | yalnız `access_token`, `expires_in`; yoksa `AUTH/TOKEN_RESPONSE_INVALID` fırlatır | `Service.ts fetchToken` |
| Veri çağrısı başlıkları | `Authorization: Bearer`, `User-Agent: <clientId> - Entegrasyonik`, `Content-Type: application/json`; 401/403'te token yenile + 1 kez tekrar | `Service.ts authConfig/withAuthRetry` |
| Taban URL | Kodda sabit yok (`adapterKeys.ts` pazarama satırında `fallbackBaseUrl` YOK; mock tabanı `http://localhost:3006/apigateway`); canlı taban tenant `Integrations.urls.baseUrl`'den gelir (bulutta DB yok, okunamadı). `readme.md`: "Base URL `https://isortagim.pazarama.com/apigateway`" | `adapterKeys.ts:21`, `readme.md`, `Service.ts mockHostPattern` |
| Zorunlu ayarlar | `APIKEY`, `APISECRET` (UI ayrıca `SELLERID`, `storename`, `shipmentId`, `cities`, `taxPercentage`) | `index.ts requiredSettings`, `frontend/.../PazaramaComponent.vue` |
| Dayanıklılık | timeout 30 sn, `maxConcurrent` 11, `ratePerMin` tanımsız (0=sınırsız), `rateLimits.verified:false` | `integrationHttp.ts`, `descriptor.ts` |
| Mock | `PAZARAMA_MOCK_MODE`, mock'lanabilir uçlar yalnız env'den: `product,order,finance,claim,qna,listing-state,QuestionAnswer` | `backend/.env.example:62-64` |

### A.2 Metot → uç → parametre tablosu (varsayılan yollar; hepsi `integrationSettings.urls.*` ile ezilebilir)
| IPlatform metodu | HTTP + yol (varsayılan) | Gönderilen alanlar / okunan yanıt | Kaynak dosya |
|---|---|---|---|
| `testConnection` | GET `product/products?page=1&size=1` | küçük harf `page/size` | `index.ts` |
| `retrieveBrands(query)` | GET `brand/getBrands` | string sorgu → `brandName=`; nesne → aynen; **sayfalama yok**. Yanıt: dizi ∨ `data` ∨ `brands`; öğe `id|brandId`, `name|brandName` | `api/BrandConnector.ts`, `transformers/BrandTransformer.ts` |
| `retrieveCategories` | GET `category/getCategoryTree` | yanıt: `data.categories|data|categories|dizi`; ağaç çocukları `Children|children|subCategories`; düz liste ise `ParentId|parentId` ile ağaç kurar; kimlik `CategoryId|categoryId|id` | `api/CategoryConnector.ts`, `transformers/CategoryTransformer.ts` |
| `retrieveCategoryAttributes(catId)` | GET `category/getCategoryWithAttributes?Id=<CATEGORYID>` | yanıt: `data.categoryAttributes|data.attributes|data|...`; alanlar `AttributeId|attributeId|Id|id`, `Name|name`, `AllowCustom|allowCustom`, `Required|required`, `IsVariantable|isVariantable|IsVariant|Varianter`, `IsSlicer|Slicer`, `AllowMultipleSelection|IsMultiple|Multiple`, değerler `AttributeValues|attributeValues|Values|values[{id|ValueId|valueId|Id, value|Name|name|ValueName}]` — **`isRequired` OKUNMAZ** | aynı |
| `retrieveCategoryAttributeValues` | (ağ yok) yukarıdakinin `values`'u | 6 sa global cache | `services/CategoryService.ts` |
| `retrieveCategoryCommision` | (ağ yok) `commissions.json` | dosya **boş `[]`** → daima `undefined` | `commissions.json` |
| `transferProducts` / `updateProduct*` | POST `product/create` gövde `{products:[...]}` | öğe (camelCase): `barcode,name,displayName,description,code(=barcode),groupCode,stockCode,brandId,categoryId,stockCount,salePrice,listPrice,vatRate(vars.20),images[{imageurl}],attributes[...],desi:1,currencyType:'TRY'`. `attributes[]` öğesi `{attributeId, attributeValueId, customAttributeValue}` (nesne biçiminde ikisi de varsa **ikisi birden**). Yanıt: `data` string ∨ `data.batchRequestId` ∨ `id`; sıfır GUID → trackingId null | `services/ProductService.ts`, `transformers/ProductTransformer.ts`, `api/ProductConnector.ts` |
| `updateProductPrice` | POST `product/updatePrice-v2` gövde `{items:[{code,salePrice,listPrice,stockCount}]}` | aynı gövde fiyat+stok | `ProductService.getEndpointUrl` |
| `updateProductStock` | POST **`product/updatePrice-v2`** (fiyatla aynı uç) | aynı gövde | aynı |
| `checkBatchProduct` (TRANSFER/UPDATE) | GET `product/getProductBatchResult?BatchRequestId=<BATCHID>` | okur: `data.batchResult[{productCode|code,barcode}]` → hepsi COMPLETED; `data.failedProducts[{productCode|barcode,errorReason}]` → FAILED | `ProductConnector.fetchBatchResults`, `ProductService.checkBatchProduct` |
| `checkBatchProduct` (PRICE/STOCK) | GET `listing-state/batch-id/<BATCHID>/lake-projections?page=1&pageSize=3000` | okur: `data.data[{code,barcode,price.status(0=ok),operationStatusText,price.operationDetail}]` | `ProductConnector.fetchUpdateBatchResults` |
| `streamProducts` | GET `urls.productListUrl` (**varsayılan yok**, tenant ayarı şart) `{...query,page,size:100}` + her öğe için POST `product/getProductDetail {Code}` | sayfa 100, tavan 1000 sayfa/100k | `ProductService.getProductsAndPersist` |
| `updateProductStatuses` | GET `urls.productListUrl` `{Code}` | `state`: 3→COMPLETED, 6→FAILED, 1/2/7→WAITING; mesaj `waitingApproveExp|stateDescription` | `ProductTransformer.toInternalStatusResult` |
| `retrieveOrders` | POST `order/getOrdersForApi` gövde `{startDate,endDate (ISO 8601), pageNumber, pageSize:100}` (idempotent:true) | `lastSyncTimestamp`→now, yoksa son 24 sa; sayfa tavanı 50/5000 → `markIncomplete`; yanıt `data[]` ∨ dizi; kimlik `OrderNumber|orderNumber|OrderId|orderId` (hiçbiri yoksa atla; ≥3 kayıt hepsi kimliksizse `ORDER_SCHEMA_DRIFT`) | `api/OrderConnector.ts`, `api/paginatePage.ts`, `services/OrderService.ts` |
| (sipariş dönüşümü) | — | adres: `ShipmentAddress{NameSurname,PhoneNumber,AddressDetail,NeighborhoodName,CityName,DistrictName,PostalCode,TaxNumber,TaxOffice,CompanyName,CustomerEmail}`; para: `OrderAmount,DiscountAmount,TaxAmount,ShipmentAmount` (`{Value}` veya sayı); kalem: `Items[{OrderItemId,OrderItemStatus,Quantity,SalePrice,TotalPrice,ShipmentCode,Cargo{CompanyName,TrackingNumber},Product{ProductId,Name,Code,VatRate}}]`; durum `OrderStatus|orderStatus|status` sayısal: 3 onay bekliyor, 12 onaylandı, 5/16/19 kargoda, 11/9 teslim, 6/18/13/14 iptal, 7/8/10 iade; bilinmeyen → `reportUnknownEnum` + UNAPPROVED | `transformers/OrderTransformer.ts` |
| `approveOrder` | PUT `order/updateOrderStatus` `{orderNumber, item:{orderItemId, status:12}}` | **yalnız tek kalem** (`meta.externalLineItemId` ∨ `items[0].orderItemId` ∨ son çare `externalOrderId`) | `index.ts`, `OrderService.updateOrderPackageStatus` |
| `rejectOrder` | PUT `order/updateOrderStatus` kalem başına `status:13` ("Tedarik Edilemedi") | kalem yoksa `orderItemId=externalOrderId` | `OrderService.rejectOrder` |
| `sendOrderShipping` | (durum 3 ise önce status 12) → PUT `order/updateOrderStatus` `{orderNumber, item:{orderItemId, status:5, deliveryType:1, shippingTrackingNumber, trackingUrl, cargoCompanyId}}` | **yalnız ilk kalem**; `cargoCompanyId = payload.carrierCode` (GUID beklenir) | `OrderConnector.sendOrderShipping` |
| `sendOrderInvoice` | POST `order/invoice-link` `{invoiceLink, orderid, deliveryCompanyId, trackingNumber}` | `orderid = payload.orderId` (= dahili `externalOrderId` = **OrderNumber**) | `OrderConnector.sendOrderInvoice` |
| `retrieveOrderRejectionReasons` | (ağ yok) sabit 4 sebep | DOĞRULANAMADI | `OrderService` |
| `retrieveClaims` | POST `order/getRefund` `{refundStatus, requestStartDate, requestEndDate ('YYYY-MM-DD HH:mm:ss'), pageNumber, pageSize:100}` (idempotent:true) | yanıt `data.refundList|refundList|dizi`; alanlar `refundId|id, OrderNumber, RefundStatus, RefundStatusName, RefundAmount{Value,Currency}, RefundDate, RefundNumber, RefundType, orderItem[]|ProductCode..., ShipmentCode/CargoTrackingNumber, ShipmentCompanyName` | `api/ClaimConnector.ts`, `transformers/ClaimTransformer.ts` |
| (iade durumları) | — | 1 inceleme, 2/4/6/8 onay, 10 tamamlandı, 3/5 ret, 7 iptal | `ClaimTransformer.mapNumericClaimStatus` |
| `approveClaim` | POST `order/updateRefund` `{refundId, status:2}` | | `ClaimConnector` |
| `rejectClaim` | POST `order/updateRefund` `{refundId, status:3, RefundRejectType (vars.12), description, documentObjects[{name,bytes}]}` | 12 sabit ret sebebi `ClaimService.retrieveOrderRejectionReasons` | aynı |
| `sendToReview` (iç) | POST `order/updateRefund` `{refundId, status:9, refundReviewType, description, documentObjects}` | | aynı |
| `sendRevision` (iç) | POST `order/api/refund/revision` `{refundId, description, documentObjects}` | | aynı |
| `retrieveMessages` | GET `QuestionAnswer/getApprovalAnswersByMerchant` + her soru için GET `QuestionAnswer/getApprovalAnswerById?questionId=` | liste `data.approvalAnswersByMerchant|...Searchs`; alanlar `questionId, maskedUserName, question, answer, questionStatus (0 bekliyor,1 cevaplandı,2 onay bekliyor,3 red), productName, productImageUrl, barcode, brand, questionDate, answerDate` | `api/MessageConnector.ts`, `transformers/MessageTransformer.ts` |
| `answerMessage` | PUT `QuestionAnswer/sellerAnswer` `{questionId, text}` | | aynı |
| (arama, iç) | POST `QuestionAnswer/getApprovalAnswersByMerchantSearch` (idempotent:true) | | aynı |
| `retrieveFinancials` | POST `order/paymentAgreement` `{startDate,endDate,allowanceDate,orderId}` (idempotent:true) | yanıt `transactionList|data.transactionList|items|content`; alanlar `trxId|id, orderId, status (metin: satış/iade/ödeme), amount, commissionAmount, allowanceAmount, commissionRate, transactionDate, transferredDate, trxCode` | `api/FinancialConnector.ts`, `transformers/FinancialMapper.ts` |
| `retrieveCargoInvoices` | POST `finance/getcargoinvoicedetails` `{invoiceSerialNumber}` | `items|content[{orderNumber,packageId,desi,amount,transactionDate}]` | aynı |
| (iç) | POST `finance/getsettlements`, POST `finance/getotherfinancials` | çağıran yok (ölü) | `FinancialConnector` |
| `retrieveSettlementsByPaymentId` | — | daima `[]` | `index.ts` |
| `retrievePlatformInfos` | (ağ yok) `shipment-providers.json` + GET `supplier/getaddresses` | **`shipment-providers.json` boş `[]`** → kargo firması listesi yok; adres yanıtı `data.addresses|data` | `services/ShipmentService.ts`, `api/ShipmentConnector.ts` |
| Live read-only politikası | POST'tan okuma sayılan yollar: `order/getOrdersForApi`, `order/getRefund`, `order/paymentAgreement`, `finance/getsettlements|getotherfinancials|getcargoinvoicedetails`, `QuestionAnswer/getApprovalAnswersByMerchant(Search)`, `product/getProductDetail`, `connect/token` | `common/security/liveReadonlyPolicy.ts:24-29` |

### A.3 Depodaki önceki araştırmaların durumu (okundu)
- `docs/research/API_CONTRACTS_2026-09-30.md §4`: Pazarama [İKİNCİL/eski PDF]; token ömrü "1 saat vs 1 ay" çelişkisi; rate limit/zorunlu alan/enum/tarih/iade/webhook DOĞRULANAMADI. **Bu tur:** 1 saat lehine 5 bağımsız kaynak (bkz. §B.1); PDF hâlâ erişilemez.
- `docs/research/2026-09-27-api-verification.md`: "Resmi doküman `developer.pazarama.com` satıcı paneli girişi arkasında" — **düzeltme gerekli:** bu alan adı DNS'te yok (ENOTFOUND, 2026-10-03); resmî doküman `isortagim.pazarama.com/auth/integration/*` altında (descriptor zaten bunu gösteriyor).
- `docs/audits/ATTRIBUTE_MAPPING_REVIEW_2026-09-30.md §6`: `attributeId/attributeValueId/customAttributeValue` birlikte gönderimi ve `required/multiple` alan adları doğrulanamamıştı. **Bu tur:** üç bağımsız istemci (kivanc/bluntk, asbajans/rr, evinso/modulpos) **ya `attributeValueId` ya `customAttributeValue`** gönderiyor, ikisini birlikte gönderen yok; resmî snippet "allowCustom true ise ID yerine freetext gönderilmeli" ve "required = true alanlar mutlaka gönderilmeli" (bkz. §B.3). Alan adı `isRequired` (MesTech DTO) vs kodun okuduğu `required/Required` — çelişki (§C-7).
- `docs/research/2026-09-28-integration-deadlines-scan.md §5`: değişiklik duyurusu bulunamadı — bu tur da bulunamadı.

---

## (B) Güncel doküman özeti (erişilebilen kaynaklarla)

### B.0 Resmî dokümanın yapısı [RESMİ-snippet]
`https://isortagim.pazarama.com/auth/integration` (Angular SPA; satıcı girişi gerekmiyor gibi görünüyor — arama motoru içeriği indekslemiş, alt sayfa örneği `/auth/integration/brand-marka`). Erişim 2026-10-03 yalnız snippet. Bölüm başlıkları (snippet'lerden derlendi):
- **Servis Limitleri** (başlık var, içerik alınamadı) · **Yetkilendirme / Token Alma**
- **Ürün Entegrasyonu:** Ürünler, Ürün Ekleme, BatchId sorgu, "Tekli Ürün – Toplu Ürün İşlem Kontrolü", Markalar, Kategori Listesi, Kategori Özellik Bilgileri, Şehir bilgisi sorgulama, Ürün Fiyat Güncelleme, Ürün Stok Güncelleme, "Fiyat ve Stok Veri Sorgulama"
- **Teslimat Tipi Görüntüleme**
- **Sipariş Entegrasyonu:** Siparişler, "Orderitem statü güncelleme", "Apide Bir Siparişteki Itemların Statüsünü Tek Seferde Güncelleme"
- **İade Entegrasyonu** · **Fatura Entegrasyonu:** "fatura linki güncelleme", "kalem bazlı fatura yükleme"
- **Muhasebe ve Finans Servisi** · **Satıcıya Soru Sor Entegrasyonu:** soru konularına göre sorgulama, detaylı filtreleme, ID ile detay, cevaplama, satıcı cevaplarını özet filtreleme
- **İptal ve Statü Güncelleme Entegrasyonu:** "İptal Durumu ve Güncelleme Servisi", "İptal Taleplerini Sorgulama Servisi"
- Snippet'te "API Entegrasyon Dokümanı (tedarikçiler için), 8 Ekim" tarihli bir belge anılıyor; yıl görünmedi. Bilinen PDF: `cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf` (engelli).

### B.1 Yetkilendirme
| Bilgi | Değer | Kaynak / güven |
|---|---|---|
| Token ucu | `POST https://isortagimgiris.pazarama.com/connect/token` | 14 depo tutarlı [İKİNCİL]; descriptor ile aynı |
| Veri tabanı | `https://isortagimapi.pazarama.com` (kökte, `/apigateway` **yok**) | kivanc/bluntk `API_URL`, wiensa, MesTech, asbajans, Entegro, modulpos, iwapim, Beekod canlı log 2026-01-12 (`isortagimapi.pazarama.com/product/products?Approved=true&Size=100&Page=1` → 100 kayıt) [İKİNCİL, güçlü] |
| Grant | `grant_type=client_credentials` + **`scope=merchantgatewayapi.fullaccess`** | 11 depo scope gönderiyor (kivanc, wiensa, iwapim, modulpos, Entegro, MesTech, asbajans, stockmasterpro, vercel-entegre…) [İKİNCİL, güçlü] |
| Kimlik taşıma | çoğunluk **HTTP Basic** (`clientId:clientSecret`); bazıları gövdede `client_id/client_secret` (MesTech script, stockmasterpro, asbajans her ikisini dener) | [İKİNCİL] — ikisi de çalışıyor görünüyor; DOĞRULANAMADI |
| Yanıt şekli | iki gözlem: (a) standart `{access_token, expires_in:3600, token_type}` (MesTech sözleşme testi, wiensa, Beekod); (b) sarmalı `{success:true, data:{accessToken, expiresIn}}` (kivanc/bluntk `data.accessToken`; asbajans: "Token bulunamadı" hatası bu sarmalla düzeltildi) | **ÇELİŞKİLİ** [İKİNCİL]; muhtemelen Basic-auth vs gövde-kimlik yollarına göre farklı ya da sürüm değişimi — DOĞRULANAMADI |
| Token ömrü | 3600 sn / 60 dk (kivanc cache 3600, MesTech mock 3600, BaturhanKahraman spec "60 dk ömür, 55'te yenile", stockmasterpro "her saat", modulpos 55 dk cache); aykırı: mehmetgokkaya 2022 "1 ay" | 1 saat lehine 5 kaynak [İKİNCİL] |

### B.2 Ürün / katalog uçları [İKİNCİL; (★) = resmî snippet ile de tutarlı]
| Uç | Metot | Parametre / gövde | Kaynak |
|---|---|---|---|
| `brand/getBrands` (★) | GET | `Page` (vars. 1, zorunlu), `Size` (vars. **10**, zorunlu; örnek `Size=100000`), `name=` arama. **PascalCase `Page/Size` şart** — küçük harf gönderilince API yok sayıp vars. döndürür | [RESMİ-snippet `/auth/integration/brand-marka`: "CreateProduct… brandId bu servisten alınacaktır", "Ürün eklerken BrandId gönderilmesi gerekmektedir"], asbajans AGENTS.md (canlı gözlem), wiensa, kivanc |
| `category/getCategoryTree` | GET | yanıt: düz liste `{id (GUID), parentId, name, displayName, leaf}` (BaturhanKahraman); MesTech mock'ta çocuklar `parentCategories[]` adıyla iç içe | [İKİNCİL]; çocuk alan adı DOĞRULANAMADI |
| `category/getCategoryWithAttributes?Id=<GUID>` (★) | GET | yanıt `{id,name,attributes:[{id,name,isVariantable,isRequired,values:[{id,name}]}]}` (MesTech DTO); `allowCustom`, `required` (resmî snippet) | [RESMİ-snippet]: "allowCustom true ise ürün create edilirken ID yerine freetext (string) gönderilmeli"; "required = true olan alanlar ürün oluşturma isteğinde mutlaka gönderilmelidir"; "en alt seviye (leaf) kategori ID kullanılmalı" |
| `parameter/cities` | GET | şehir listesi | kivanc, asbajans |
| `sellerRegister/getSellerDelivery` | GET | satıcının teslimat seçenekleri (`data[]`) — "Teslimat Tipi Görüntüleme" | kivanc, asbajans |
| `product/create` (★) | POST | `{products:[{Name, DisplayName, Description, BrandId (GUID), CategoryId (GUID), Code, GroupCode, StockCount, VatRate, ListPrice, SalePrice, Desi, images:[{imageurl}], attributes:[{attributeId, attributeValueId}] ∨ {attributeId, customAttributeValue}], DeliveryType?, DeliveryMessageType?, Barcode?}]}` → `{data:{batchRequestId, creationDate}}`. Not: `products` dizisi zorunlu (tek nesne → `BAC_108: products alanını doldurunuz`); `product/CreateProduct` ve `product/UpdateProductAndStockByCode` **404**; güncelleme = aynı uca tekrar gönderim (Code ile upsert); VatRate yalnız 0/1/10/20 (asbajans); tek ürün gönderiminde sıfır GUID dönebilir (kod notu) | kivanc README ("dokümandaki gibi"), asbajans AGENTS.md, MesTech DTO, modulpos |
| `product/products` | GET | `Approved` (bool; onaylı/onaysız ayrı çekilir), `Code`, `Page`, `Size` (PascalCase; asbajans "Size maks 250") → `{data:[{id,name,displayName,code,salePrice,listPrice,stockCount,state,groupCode,…}],success}` | wiensa, MesTech, Entegro, iwapim, Beekod canlı log |
| `product/getProducts` | GET | aynı parametreler (eski ad?) | kivanc (2022/2024), modulpos |
| `product/getProductDetail` | POST | `{Code}` | wiensa, iwapim |
| `product/updatePrice` | POST | `{items:[{code, listPrice, salePrice}]}` | wiensa, MesTech DTO, modulpos, kivanc, mehmetgokkaya |
| `product/updatePrice-v2` | POST | `{items:[{code, listPrice, salePrice}]}` (fiyat) | Entegro (C#), asbajans integration-service — **yalnız 2 kaynak** |
| `product/updateStock` | POST | `{items:[{code, stockCount}]}` | wiensa, MesTech DTO, modulpos, kivanc, mehmetgokkaya (5 kaynak) |
| `product/getProductBatchResult?BatchRequestId=` (★) | GET | yanıt `{data:{batchRequestId, status (1 devam, 2 tamam, 3 hata), totalCount, successCount, failedCount, batchResult:[{code, isSuccess, message}]}, success}` | MesTech DTO+mock, kivanc, wiensa, asbajans |
| Fiyat/stok batch sonucu | ? | resmî başlık "Fiyat ve Stok Veri Sorgulama" var; uç adı snippet'te yok | DOĞRULANAMADI |

### B.3 Sipariş / iade / fatura / soru-cevap / finans [İKİNCİL]
| Uç | Metot | Gövde / notlar | Kaynak |
|---|---|---|---|
| `order/getOrdersForApi` (★) | POST | iki ad şeması gözlendi: `{StartDate, EndDate, Page, Size}` (kivanc, modulpos, asbajans — "Size maks 100") ve `{pageSize, pageNumber, startDate, endDate, orderNumber?}` (MesTech, Beekod, Entegro, wiensa). Tarih: ISO 8601 UTC (MesTech) ∨ `YYYY-MM-DD` (stockmasterpro). MesTech: **aralık en çok 31 gün** | ad şeması ÇELİŞKİLİ; 31 gün DOĞRULANAMADI |
| sipariş yanıtı | — | `{data:[{orderId (GUID), orderNumber (long), orderDate, orderAmount, orderStatus, customerId, customerName, shipmentAddress{fullName,address,city,district,postalCode,phone}, billingAddress, items:[{orderItemId (GUID), orderItemStatus, quantity, listPrice, salePrice, taxAmount, totalPrice, deliveryType, shipmentCode, cargo{companyName,trackingNumber,trackingUrl}, product{productId,name,code,vatRate,imageURL}}]}], success}` (MesTech DTO). Beekod ayrıca `customer{}, shippingAddress{}, deliveryDetail{}, invoiceType, paymentType, totalAmount` | adres alan adları DOĞRULANAMADI (kodunkiyle çelişiyor, §C-10) |
| `order/getOrder/{orderId}` | GET | tek sipariş | asbajans (tek kaynak) |
| `order/updateOrderStatus` (★ "Orderitem statü güncelleme") | PUT | `{orderNumber (long), item:{orderItemId (GUID), status, deliveryType:1, shippingTrackingNumber, trackingUrl, cargoCompanyId (GUID)}}` | wiensa, MesTech, asbajans — kodla uyumlu |
| `order/updateOrderStatusList` (★ "Itemların statüsünü tek seferde güncelleme") | PUT | `{orderNumber, status}` — tüm kalemler | wiensa, stockmasterpro |
| Sipariş durum kodları | — | **tutarlı:** 12 = Hazırlanıyor/onay, 5 = Kargoya verildi, 3 = yeni/alındı. **Çelişkili:** MesTech "6=Teslim, 7=İptal"; asbajans "11=teslim, 9=iptal, 14/15=iade"; Beekod "3,5,7–14"; kod "11/9 teslim, 6/18/13/14 iptal, 7/8/10 iade, 13 = tedarik edilemedi" | yalnız 3/5/12 güvenli; diğerleri DOĞRULANAMADI |
| `order/invoice-link` (★ "fatura linki güncelleme") | POST | `{invoiceLink, orderid (**GUID OrderId**, MesTech `Guid OrderId`), deliveryCompanyId?, trackingNumber?}` | wiensa, asbajans, MesTech |
| kalem bazlı fatura yükleme (★) | ? | resmî başlık var; uç adı bulunamadı | DOĞRULANAMADI |
| `order/getRefund` (★) | POST | `{refundStatus, requestStartDate, requestEndDate, pageNumber, pageSize}` → `{data:{responsePage, pageReport, refundList:[{refundId (GUID), orderNumber, refundNumber, refundType, refundStatus, refundAmount, customerName, productName, productCode, shipmentCode}]}, success}` | wiensa, MesTech, asbajans — kodla uyumlu |
| `order/getRefundItems` | POST | `{refundId}` | wiensa (tek kaynak) |
| `order/updateRefund` (★) | POST | `{refundId, status}`: **2 = Tedarikçi onayladı, 3 = Tedarikçi reddetti**; `RefundRejectType`, `description`, `documentObjects`, `status:9`, `refundReviewType` → hiçbir dış kaynakta yok | 2/3 [İKİNCİL]; ek alanlar DOĞRULANAMADI |
| `order/api/refund/revision` | POST | — | DOĞRULANAMADI (0 kaynak) |
| `QuestionAnswer/getApprovalAnswersByMerchantSearch` | POST | `qStatus`: 0 cevap bekliyor, 1 cevaplandı | stockmasterpro (tek kaynak, canlı kullanım) |
| `QuestionAnswer/sellerAnswer` | PUT | cevap | stockmasterpro |
| `QuestionAnswer/getApprovalAnswersByMerchant`, `getApprovalAnswerById` | GET | — | DOĞRULANAMADI (0 dış kaynak; resmî başlık "ID ile detay" var) |
| `order/paymentAgreement`, `finance/getsettlements`, `finance/getotherfinancials`, `finance/getcargoinvoicedetails` | POST | — | DOĞRULANAMADI (0 dış kaynak; resmî başlık "Muhasebe ve Finans Servisi" var) |
| `supplier/getaddresses` | GET | — | DOĞRULANAMADI (0 dış kaynak) |
| `listing-state/batch-id/<id>/lake-projections` | GET | — | DOĞRULANAMADI (GitHub kod arama + web: 0 sonuç) |

---

## (C) FARKLAR — kod kanıtı · kaynak · önerilen düzeltme
Öncelik: **P0** canlıda kırılma/veri kaybı · **P1** işlevsel eksik/yanlış · **P2** iyileştirme. Hepsi canlı API'de doğrulanmadan uygulanmamalı (bulutta DB/ağ yok).

| # | Ö | Fark | Kod kanıtı | Dış kaynak | Önerilen düzeltme |
|---|---|---|---|---|---|
| C-1 | P0 | Token isteği **`scope` göndermiyor**; yanıtı yalnız `access_token` olarak okuyor. Sarmalı `{success,data:{accessToken,expiresIn}}` dönerse `TOKEN_RESPONSE_INVALID` ile tüm adaptör durur | `Service.ts fetchToken`: `new URLSearchParams({grant_type, client_id, client_secret})`; `response.data?.access_token` | scope: 11 depo [İKİNCİL güçlü]; yanıt iki şekil [ÇELİŞKİLİ] | `scope=merchantgatewayapi.fullaccess` ekle; yanıt okumayı `access_token ?? data?.accessToken`, `expires_in ?? data?.expiresIn` olarak genişlet; Basic-auth seçeneğini ayar bayrağıyla destekle. Karakterizasyon testi (`Pazarama.service.characterization`) güncellenmeli |
| C-2 | P0 | **Marka listesi sayfalanmıyor ve arama parametresi yanlış**: `brandName=` gönderiliyor, `Page/Size` yok → API vars. `Size=10` → yalnız 10 marka; marka eşleme (bkz. §E) fiilen çalışmaz | `BrandConnector.fetchBrandsFromPlatform`: `queryParams.brandName = query` | [RESMİ-snippet] `getBrands?Page=1&Size=100000` / `?Page=1&Size=100&name=...`; Size vars. 10 zorunlu; asbajans: küçük harf `page/size` yok sayılır | `Page`/`Size` (PascalCase) ile sayfalı çek (veya `Size` büyük tek istek), arama parametresini `name` yap; yanıtı `data[]` + olası `data.items[]` oku |
| C-3 | P0 | **Stok güncellemesi fiyat ucuna gidiyor**: `updateProductStock` → `product/updatePrice-v2` + `stockCount` | `ProductService.getEndpointUrl`: `UPDATE_STOCK: ... 'product/updatePrice-v2'` | `product/updateStock {items:[{code,stockCount}]}` 5 kaynak; `updatePrice-v2` yalnız fiyat (2 kaynak), stok için hiçbir kaynak yok | Stok için `product/updateStock`; fiyat için `product/updatePrice` (v2 panelden teyit edilince v2). Gövdeleri ayır (`{code,listPrice,salePrice}` / `{code,stockCount}`). Zero-oversell açısından kritik |
| C-4 | P0 | **Fiyat/stok batch sonucu ucu uydurma görünüyor**: `listing-state/batch-id/<id>/lake-projections?page=1&pageSize=3000` ve `data.data[].price.status` yapısı hiçbir Pazarama kaynağında yok | `ProductConnector.fetchUpdateBatchResults`, `contracts PAZARAMA_UPDATE_BATCH_RESULT`, `.env.example PAZARAMA_MOCKABLE_ENDPOINTS=...listing-state` | GitHub kod arama "lake-projections": 0 Pazarama sonucu; resmî başlık "Fiyat ve Stok Veri Sorgulama" (uç adı bilinmiyor) | Canlı/panel dokümanıyla doğrulanmadan **kullanma**; fiyat/stok güncelleme yanıtı `batchRequestId` ise `product/getProductBatchResult` ile sorgula; değilse "Fiyat ve Stok Veri Sorgulama" ucunu panelden al. Mock listesinden `listing-state` kaldırılabilir |
| C-5 | P1 | Ürün listesi parametreleri küçük harf `page/size`, `Approved` yok | `index.ts testConnection {page:1,size:1}`, `ProductService.getProductsAndPersist {page,size}` | Beekod canlı: `Approved=true&Size=100&Page=1`; asbajans: küçük harf yok sayılır (marka ucunda gözlendi); `Approved=false` ayrıca çekilmeli | `Page/Size/Approved/Code` PascalCase; onaylı+onaysız iki geçiş (onaysız ürün durum takibi için gerekli). `paginatePage` tekrar-sayfa koruması bunu zaten FAILED yapar — iyi, ama akış hiç çalışmaz |
| C-6 | P1 | `attributes[]` öğesinde `attributeValueId` ve `customAttributeValue` **birlikte** gönderiliyor | `ProductTransformer.prepareAttributes`; test `ProductTransformer.characterization.test.ts:127` ikisini birden sabitliyor | kivanc/asbajans: yalnız `{attributeId, attributeValueId}`; modulpos: `valueId` varsa `attributeValueId`, yoksa `customAttributeValue` (karşılıklı dışlayıcı); [RESMİ-snippet] "allowCustom true ise ID yerine freetext" | Tam bir alan gönder: kategori özelliği `allowCustom=false` ise `attributeValueId`; `allowCustom=true` ve kimlik yoksa `customAttributeValue`. İkisi birden gönderimin kabul edildiğine dair kanıt yok |
| C-7 | P1 | Zorunlu özellik alanı okunmuyor: kod `Required|required`, DTO'da `isRequired` → `missingRequiredAttributes` hiç tetiklenmez; `multiple` için okunan `AllowMultipleSelection|IsMultiple|Multiple` hiçbir kaynakta yok | `CategoryTransformer.toInternalAttributes` | MesTech DTO `IsRequired`, `IsVariantable`; [RESMİ-snippet] "required = true olan alanlar mutlaka gönderilmeli" | `isRequired|IsRequired` takma adını ekle; `multiple` alan adını panelden teyit et (kaynak yok) |
| C-8 | P1 | Kategori ağacı çocuk alanı: kod `Children|children|subCategories`; MesTech mock çocukları `parentCategories[]` adıyla iç içe veriyor; `leaf` bayrağı okunmuyor | `CategoryTransformer.toInternalCategories` | MesTech DTO `ParentCategories`, `Leaf`; BaturhanKahraman: düz liste + `parentId` + `leaf` | Düz liste yolu zaten var (parentId); `leaf` okunup yalnız yaprak kategori seçilebilir yapılmalı (resmî: create için en alt seviye ID). `parentCategories` takma adı için teyit gerekli |
| C-9 | P1 | `checkBatchProduct` her `batchResult[]` öğesini **COMPLETED** sayıyor; `isSuccess:false` ve `message` dikkate alınmaz; `status` (1 devam / 2 tamam / 3 hata) okunmaz; `failedProducts` alanı hiçbir kaynakta yok | `ProductService.checkBatchProduct` (transformer'daki `toInternalBatchResult` `isSuccess` okur ama kullanılmaz) | MesTech `{status, batchResult:[{code,isSuccess,message}], failedCount}` | `status===1` → WAITING; öğe `isSuccess===false` → FAILED + `message`; `failedProducts` okumasını koru (zararsız) ama kanıtsız olduğunu not et |
| C-10 | P1 | Sipariş adres/alan sözlüğü tek kaynaktan: kod `NameSurname/AddressDetail/CityName/DistrictName/PhoneNumber/NeighborhoodName`, `OrderAmount{Value}`; dış DTO `fullName/address/city/district/postalCode/phone`, `orderAmount` sayı, `taxAmount` kalemde | `OrderTransformer.mapToIAddress`, conformance fixture'ları kodun kendi sözlüğünü kullanır | MesTech DTO/mock (tek bağımsız sözlük) | Her iki sözlüğü de okuyacak takma adlar ekle (`fullName`, `address`, `city`, `district`, `phone`); canlı ilk örnek yanıtla `PAZARAMA_ORDERS_LIST` sözleşmesini sertleştir. Şu an kritik alanlar boşsa "Adres Bilgisi Yok"/boş şehir yazılır |
| C-11 | P1 | `approveOrder` yalnız **tek kalemi** 12'ye alır (fallback `orderItemId = externalOrderId` kesin hatalı); `rejectOrder` kalem başına döngü | `index.ts approveOrder`, `OrderService.rejectOrder` | `PUT order/updateOrderStatusList {orderNumber, status}` tüm kalemleri tek istekle (wiensa, stockmasterpro; resmî başlık) | Onay/ret için `updateOrderStatusList` kullan; kalem bazlı uç yalnız kargo bildirimi için kalsın; `externalOrderId`'yi `orderItemId` olarak gönderen fallback'i kaldır (hata üret) |
| C-12 | P1 | `sendOrderInvoice` `orderid` alanına **OrderNumber** gönderiyor; `cargoCompanyId` GUID beklenir ama kargo firması listesi **boş** (`shipment-providers.json = []`) | `OrderConnector.sendOrderInvoice` (`payload.orderId` = `externalOrderId` = `OrderNumber`), `ShipmentService.fetchShipments` | MesTech `PzInvoiceLinkRequest.OrderId: Guid`; teslimat/kargo seçenekleri `sellerRegister/getSellerDelivery` | `meta.OrderId` (GUID) sakla ve `invoice-link`'te onu gönder; `sellerRegister/getSellerDelivery` ile kargo/teslimat GUID'lerini çek, `supplier/getaddresses` (kanıtsız) yerine kullan |
| C-13 | P1 | Sipariş durum kodları 6/7/9/11/13/14/16/18/19 ve ret için `13` kanıtsız; dış kaynaklar birbiriyle de çelişiyor | `OrderTransformer.mapNumericStatus`, `OrderService.rejectOrder status 13` | yalnız 3/5/12 tutarlı | Panel dokümanından ("İptal ve Statü Güncelleme Entegrasyonu") tam enum alınmalı; `reportUnknownEnum` zaten var — canlı gözlem toplayıp tabloyu düzelt. Ret için 13'ü doğrulanmadan canlıda kullanma |
| C-14 | P1 | Sipariş sorgu aralığı sınırsız (`lastSyncTimestamp`→now) | `OrderService.fetchOrders` | MesTech: StartDate/EndDate **en çok 31 gün** [İKİNCİL tek kaynak] | Aralığı 30 günlük pencerelere böl (uzun kesintiden sonra sipariş kaçırmayı önler) |
| C-15 | P2 | Ürün gövdesi camelCase (`name, brandId…`) + fazladan `stockCode`, `currencyType`, `barcode` üst alanları, `desi:1` sabit, `vatRate` 0/1/10/20 doğrulaması yok | `ProductTransformer.toPlatformBatch` | Tüm istemciler PascalCase (`Name, BrandId, CategoryId, Code, GroupCode, StockCount, VatRate, ListPrice, SalePrice, Desi`); `images[].imageurl` ve `attributes[]` küçük harf; VatRate 0/1/10/20 (asbajans) | ASP.NET genelde büyük/küçük harf duyarsızdır (DOĞRULANAMADI); güvenli taraf PascalCase. `vatRate`'i {0,1,10,20} ile doğrula (18 → ret riski); `desi` üründen gelsin |
| C-16 | P2 | `rejectClaim` ek alanları (`RefundRejectType`, `description`, `documentObjects`), `status:9` inceleme, `order/api/refund/revision`, 12 sabit ret sebebi, iade durumları 4–10 | `ClaimConnector`, `ClaimService`, `ClaimTransformer` | yalnız `{refundId, status 2|3}` kanıtlı | Panelden "İade Entegrasyonu" ile teyit; teyitsiz alanlar yanıtta reddedilmiyorsa zararsız ama `status:9`/revision canlıda denenmemeli |
| C-17 | P2 | Finans uçları (4 yol) ve `supplier/getaddresses`, `getApprovalAnswersByMerchant`/`ById` kanıtsız | `FinancialConnector`, `ShipmentConnector`, `MessageConnector` | 0 dış kaynak; yalnız `getApprovalAnswersByMerchantSearch` (POST) ve `sellerAnswer` (PUT) kanıtlı | Mesaj listesini `…Search` POST'una taşımayı değerlendir; finans/adres uçlarını panelden doğrula; descriptor `finance.level:'limited'` kalmalı |
| C-18 | P2 | `commissions.json` ve `shipment-providers.json` boş → komisyon ve kargo firması bilgisi hiç yok; UI "Teslimat Şekli" alanı doldurulamaz | dosyalar `[]` | — | Komisyon: panel/kategori komisyon tablosu; kargo: `getSellerDelivery` |
| C-19 | P2 | `readme.md` taban URL'i `isortagim.pazarama.com/apigateway`; tüm dış kaynaklar `isortagimapi.pazarama.com` kökü. Canlı taban tenant DB'de (okunamadı) | `readme.md`, `Service.ts mockHostPattern (/api|/apigateway)?` | 14 depo | Yerelde `Integrations.urls.baseUrl` kontrol edilip readme düzeltilmeli; host listesi zaten her ikisini kapsıyor |
| C-20 | P2 | `docs/research/2026-09-27-api-verification.md` "developer.pazarama.com" diyor; alan adı yok | — | ENOTFOUND 2026-10-03 | Doküman notunu `isortagim.pazarama.com/auth/integration` olarak düzelt; descriptor doğru |

---

## (D) Rate limit · 429 · webhook · sandbox · durum değiştiren "okuma" uçları
| Konu | Bulgu | Güven |
|---|---|---|
| Rate limit | Resmî dokümanda **"Servis Limitleri"** başlığı var; içerik hiçbir snippet/ikincil kaynakta yok. Sayısal limit bulunamadı. Descriptor `rateLimits.verified:false` ve `ratePerMin=0` **doğru kalmalı** | [RESMİ-snippet başlık] + DOĞRULANAMADI |
| 429 davranışı | MesTech adaptörü 429'da `Retry-After` başlığıyla 5 tekrar uyguluyor (jenerik; Pazarama'nın 429 döndüğüne dair canlı kanıt değil). stockmasterpro "429 işleme" var, ayrıntı yok | DOĞRULANAMADI |
| Webhook | Pazarama tarafı webhook/bildirim ucuna dair **hiçbir kanıt yok**; GitHub'da görülen "webhook" ifadeleri entegratörlerin kendi iç sistemleri. Sipariş akışı polling (asbajans 10 dk) | DOĞRULANAMADI → yok varsay |
| Sandbox / test ortamı | Ayrı test host'u bulunamadı; MesTech "sandbox script"i canlı `isortagimgiris`/`isortagimapi`'ye gidiyor ("separate sandbox tanımlı değil"). `developer.pazarama.com` yok | DOĞRULANAMADI → yok varsay; canlı hesapla dikkatli test |
| Okuma gibi görünüp durum değiştiren uçlar | Bulunamadı. Not: `product/create` güncelleme için de kullanılır (Code ile **upsert**) — "güncelleme" niyetiyle yanlış `Code` gönderilirse **yeni ürün yaratır**. POST olan listeleme uçları (`getOrdersForApi`, `getRefund`, `getApprovalAnswersByMerchantSearch`, `getProductDetail`) salt okuma; `liveReadonlyPolicy.PAZARAMA_READ_POST_PATHS` ile uyumlu | [İKİNCİL] |
| Batch limitleri | Ürün create / fiyat / stok için öğe tavanı hiçbir kaynakta yok (stockmasterpro stok için "1000'lik paketler" kullanıyor — kendi tercihi). Sayfa boyutu: siparişte `Size≤100` (asbajans), üründe `Size≤250` (asbajans), markada `Size=100000` çalışıyor | [İKİNCİL tek kaynaklar] |
| Tarih formatı | Sipariş: ISO 8601 UTC (MesTech) ∨ `YYYY-MM-DD` (stockmasterpro); iade: kod `YYYY-MM-DD HH:mm:ss`, MesTech ISO | DOĞRULANAMADI |

---

## (E) Marka eşlemesi desteği
- **Resmî (snippet):** `GET brand/getBrands?Page=&Size=&name=` — "CreateProduct servisine gönderilecek **brandId** bu servisten alınır"; "Ürün eklerken **BrandId gönderilmesi gerekmektedir**" → marka **zorunlu**, GUID. Marka başvurusu/oluşturma için API ucu **bulunamadı** (panelden manuel olduğu varsayılmamalı; DOĞRULANAMADI).
- **Kod:** `ProductService.processBatch` brandId yoksa "Eşleşme bulunamadı" ile varyantı düşürür — zorunluluk doğru uygulanmış. Ancak **C-2** nedeniyle `retrieveBrands` en fazla 10 (varsayılan Size) marka döndürür ve `brandName=` filtresi büyük olasılıkla yok sayılır → `PlatformMappingProvider` eşleme havuzu fiilen boş; `convertToInternalModel` tarafında `getLocalBrandId(platformProduct.brandId)` da aynı listeye bağlı.
- `BrandTransformer` `id|brandId`, `name|brandName` okur — dış yanıt `{id (GUID), name, logoUrl?, website?}` ile uyumlu (MesTech DTO, asbajans). wiensa ek olarak `data.items[]` sarmalını da deniyor (teyitsiz).
- asbajans canlı notu: `BrandId/CategoryId` **GUID string** gönderilmeli (`Number()` dönüşümü `NaN` üretmiş) — kod `String(mapping.brandId)` kullanıyor ✓.
- Öneri: C-2 düzeltmesi + marka listesinin global cache'e alınması (kategori gibi `scope:'global'`), isimle arama için `name=`.

---

## (F) Erişilemeyen kaynaklar ve doğrulanamayanlar

### F.1 Erişilemeyenler (2026-10-03)
| Kaynak | Durum | Not |
|---|---|---|
| `https://isortagim.pazarama.com/auth/integration` (+ `/brand-marka`, `/auth/faq`) | **EGRESS_BLOCKED** (proxy) | Resmî doküman; SPA. Arama motoru indekslemiş (giriş gerekmiyor olabilir) — yerel tarayıcıyla açılmalı. **Öncelikli tek kaynak** |
| `https://cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf` | EGRESS_BLOCKED (önceki turlarda 403) | 2023 tarihli; daha yeni "8 Ekim" tarihli belge anılıyor (yıl bilinmiyor) |
| `developer.pazarama.com` | **ENOTFOUND** (DNS yok) | Önceki araştırma notu hatalı |
| `web.archive.org` / `archive.org` | EGRESS_BLOCKED | Arşiv kopyası alınamadı |
| `docs.platin360.com`, `docs.payer.com.tr`, `payer-yazilim.gitbook.io`, `dogusbilisim.net`, `bilgibankasi.akinsoft.net`, `parasut.com`, `yardim.hesapbilir.com` | EGRESS_BLOCKED | Entegratör kılavuzları (çoğu yalnız API anahtarı alma adımları) |
| GitHub dosya içerikleri (MCP `get_file_contents`) | yetki yok (yalnız bu depo) | `search_code` text_matches ve `github.com/.../blob` WebFetch ile telafi edildi |
| WebSearch | oturum bütçesi doldu (200/200) | Resmî alt sayfa snippet taraması yarıda kaldı (`Servis Limitleri`, sipariş/iade alt sayfaları) |

### F.2 Satıcı paneli girişi gerektirebilecek / elle bakılacaklar
1. `isortagim.pazarama.com/auth/integration` → **Servis Limitleri**, **Yetkilendirme/Token Alma** (yanıt şekli, scope, Basic vs gövde), **Ürün Ekleme** (alan adları, attributes kuralı, VatRate kümesi, batch tavanı), **Fiyat/Stok Güncelleme + Veri Sorgulama** (C-3/C-4), **Sipariş** (alan sözlüğü, statü enum'u, tarih aralığı), **İade** (statü/ret sebebi enum'u, belge alanları), **Fatura** (orderid tipi, kalem bazlı yükleme), **Muhasebe ve Finans**, **Satıcıya Soru Sor**, **İptal ve Statü Güncelleme**, **Teslimat Tipi Görüntüleme**.
2. Panel → Hesabım → Entegrasyon Bilgileri: API Key/Secret; "API Entegrasyon Dokümanı (tedarikçiler için)" PDF'inin güncel sürümü.
3. Yerel ortamda `Integrations.urls.baseUrl` (C-19) ve `urls.productListUrl` (streamProducts için varsayılan yok).

### F.3 Doğrulanamayan kod sözleşmeleri (özet)
`updatePrice-v2` ile stok · `listing-state/.../lake-projections` · `failedProducts` · `supplier/getaddresses` · `getApprovalAnswersByMerchant` / `getApprovalAnswerById` (GET) · `order/paymentAgreement`, `finance/*` (4 uç) · `order/api/refund/revision` · `updateRefund` ek alanları ve `status:9` · sipariş statü kodları 6/7/9/11/13/14/16/18/19 · iade statü 4–10 · ürün `state` 1–7 anlamları · `multiple`/`slicer` alan adları · adres alan sözlüğü · `attributeValueId`+`customAttributeValue` birlikte gönderimi · rate limit değeri · webhook/sandbox varlığı · `NeighborhoodName`, `Currency:'TL'`.

### F.4 Kullanılan ikincil kaynaklar (erişim 2026-10-03, tümü [İKİNCİL])
- github.com/kivancagaogluu/pazarama (bluntk/pazarama, Packagist v2 2024-11-11; README "parametreler Pazarama API dökümanında yer aldığı gibi")
- github.com/wiensa/pazarama-sp-api (2025-04; Order/Product/Brand/Category/Return servisleri)
- github.com/MesTechSync/MesTech_Stok (2026; `PazaramaAdapter.cs`, `PazaramaDtos.cs`, sözleşme testleri, `Sandbox_Test_Script.md`)
- github.com/asbajans/rr (2026; `clients/pazarama.ts`, `AGENTS.md` canlı gözlem notları: BAC_108, 404 uçlar, GUID, Page/Size)
- github.com/fkokay/Entegro (`updatePrice-v2`), github.com/evinso/modulpos, github.com/SuleymanEmirGergin/Beekod (canlı log 2026-01-12), github.com/stockmasterpro/siparis-kontrol-app (QuestionAnswer, updateOrderStatusList), github.com/developkariyer/iwapim, github.com/ersinonline/vercel-entegre, github.com/BaturhanKahraman/Entegrasyon (2026-03-22 tasarım notu), github.com/mehmetgokkaya/pazarama-api-entegrasyon-php (2022), github.com/4li4ydin/Pazarama-API-Entegrasyonu-MSSQL (2026-08, uç ayrıntısı yok), github.com/davutkmbr/pazarama-docs (yalnız müşteri SSS; API değil)
- Arama motoru snippet'leri: `isortagim.pazarama.com/auth/integration` ve `/auth/integration/brand-marka` [RESMİ-snippet]

# Hepsiburada Satıcı (Merchant) API Araştırma Raporu

Tarih: 2026-10-03
Kapsam: yalnızca herkese açık dokümantasyon/kaynak okuma. Hiçbir API'ye istek atılmadı, kod değiştirilmedi, sır yazılmadı.

## Erişim özeti (ÖNEMLİ — kaynak güvenilirliği)

- developers.hepsiburada.com ve listing-external.hepsiburada.com/docs: ağ çıkış proxy'si tarafından ENGELLENDİ (ERİŞİLEMEDİ). Resmi portalın hiçbir sayfası doğrudan okunamadı.
- Dolaylı resmi kaynak: GitHub `loncadev/lonca` deposu, geliştirici portalından 2026-05-31'de yakalanmış 7 OpenAPI 3.0.3 dosyasını (67 operasyon) "Hepsiburada telifi altında, değiştirilmeden" yeniden dağıtıyor. Bu rapordaki kesin alan/uç bilgilerinin çoğu buradan. Topluluk projesi (resmi değil), "alpha/stabil değil" uyarısı var; SDK 1.0.0 (2026-08-30) prod hesapla doğrulandığını belirtiyor.
- Okunan sayfa sayısı: yaklaşık 70 GitHub sayfası/raw dosyası başarıyla okundu (lonca specs + SDK kaynak/CHANGELOG/docs, 3 PHP/Laravel kütüphanesi, 2 PR, GitHub topic/org sayfaları). ERİŞİLEMEDİ: ~16 alan adı/sayfa (developers.hepsiburada.com, listing-external docs, developers.hepsiexpress.com, zunapro, ecosire, docs.akinon, mcpmarket, akinsoft bilgi bankası, sopyo, solmandigital, moyduz, temasis, nparadox, r10, blogspot, duyuru.bizimhesap) + GitHub kod araması (giriş istiyor).
- Ayrıca ~22 web araması yapıldı; bazı bulgular yalnızca arama özetinden geldi (sayfa okunamadı) — "[A]" ile işaretli.

Kaynak etiketleri:
- [S] = lonca'nın yakaladığı portal OpenAPI dosyası (en güvenilir; 2026-05-04..12 tarihli operasyonlar)
- [K] = lonca SDK kaynağı/belgesi (canlı SIT/prod doğrulamalı, ama topluluk yorumu)
- [P] = eski/üçüncü taraf PHP kütüphaneleri (ksmylmz, mustafa-m-ugur; en son 2023 civarı, düşük güven)
- [A] = arama motoru özeti (portal sayfası okunamadı)
- [B] = SEO blog/AI üretimi içerik (zunapro, ecosire vb.; GÜVENİLMEZ, çelişenler aşağıda işaretli)

Kaynak URL'leri (tek tek tekrar edilmemek için kısaltma):
- S-dir: https://github.com/loncadev/lonca/tree/main/specs/hepsiburada (raw: https://raw.githubusercontent.com/loncadev/lonca/main/specs/hepsiburada/<dosya>.json)
- SDK: https://github.com/loncadev/lonca/tree/main/sdks/hepsiburada (README, CHANGELOG, src/resources/*.ts, src/types/*.ts)
- Guide: https://github.com/loncadev/lonca/blob/main/docs/src/content/docs/guides/hepsiburada.md
- Webhook guide: https://github.com/loncadev/lonca/blob/main/docs/src/content/docs/guides/webhook-events.md
- Auth: https://github.com/loncadev/lonca/blob/main/docs/src/content/docs/authentication.md
- Manifest: https://raw.githubusercontent.com/loncadev/lonca/main/specs/hepsiburada/manifest.json

---

## 1. Host / uç nokta envanteri

### 1.0 Host haritası (prod; sandbox "SIT" için `-sit` eki) [K: src/transport.ts, S: manifest]

| Servis | Prod host | SIT host |
|---|---|---|
| Listing (fiyat/stok/listing) | listing-external.hepsiburada.com | listing-external-sit.hepsiburada.com |
| Katalog / ürün (mpop) | mpop.hepsiburada.com/product | mpop-sit.hepsiburada.com/product |
| Ürün güncelleme (ticket-api) | mpop.hepsiburada.com/ticket-api | mpop-sit.hepsiburada.com/ticket-api |
| Sipariş / paket / claim (OMS) | oms-external.hepsiburada.com | oms-external-sit.hepsiburada.com |
| Test sipariş (stub) | oms-stub-external.hepsiburada.com | oms-stub-external-sit... |
| Claim oluşturma (stub) | claim-stub-external.hepsiburada.com | ...-sit |
| Kargo/profil | shipping-external.hepsiburada.com | ...-sit |
| Finans / muhasebe | mpfinance-external.hepsiburada.com | mpfinance-external-sit... |
| Soru (ask to seller) | api-asktoseller-merchant.hepsiburada.com | api-asktoseller-merchant-sit... |
| Satıcı promosyon (diskonto) | diskonto-external.hepsiburada.com | ...-sit |
| Tedarikçi (supplier) | supplier-api-external.hepsiburada.com | ...-sit |

Not: lonca 0.13.0 bulgusu — 5 kaynak (finans, soru, promosyon, mpop, supplier) yanlışlıkla `oms-external` üzerinden yönlendirildiğinde 401/404 veriyordu; gerçek servis host'ları şart. [K: CHANGELOG 0.13.0]
Çelişki: [B] bloglar `returns-external.hepsiburada.com` ve `integration.hepsiburada.com/finance` host'larını anıyor; hiçbir güvenilir kaynakta YOK -> DOĞRULANAMADI, büyük olasılıkla yanlış (claim'ler oms-external'da, finans mpfinance'ta).

### 1.1 Listing (fiyat/stok) — host: listing-external
Spec dosyası yayınlanmamış (lonca: "listings, claims, shipping, test orders için spec yok"); aşağıdakiler [K: src/resources/listings.ts] + [P: ksmylmz Endpoints.php].

| Metot | Yol | Not |
|---|---|---|
| GET | /listings/merchantid/{merchantId} | offset (zorunlu, >=0), limit (zorunlu, >=1), hbSkuList, merchantSkuList, salableListings, notsalableListings, updateStartDate, updateEndDate, productId. Yanıt: totalCount, limit, offset, items |
| POST | .../inventory-uploads | stok+fiyat+kargo birleşik; gövde dizisi; SDK'ya göre max 1000 kalem; asenkron, `{id}` döner |
| GET | .../inventory-uploads/id/{uploadId} | sonuç sorgu (>=24 saat saklanır) |
| POST/GET | .../stock-uploads , .../stock-uploads/id/{id} | yalnız stok (fiyatsız); "overwrite"; HB-fulfilled (isFulfilledByHB) listing'lerde kullanma |
| POST/GET | .../price-uploads , .../price-uploads/id/{id} | yanıtta priceValidations[] (MinPrice, MaxPrice, RegulativePrice) |
| POST/GET | .../shipping-info-uploads | dispatchTime, kargo firması, depo |
| POST/GET | .../additional-info-uploads | kişiselleştirme metni, kurulum bayrağı |
| POST | .../sku/{hbSku}/activate , /deactivate | tek SKU durum |
| POST | .../sku/{hbSku}/merchantsku/{merchantSku} | tek listing güncelle (stok/fiyat/dispatch) |
| DELETE | .../sku/{hbSku}/merchantsku/{merchantSku} | KALICI silme |
| POST | .../bulk-unlock | `{hbSkuList:[]}` HB'nin kilitlediği SKU'ları açar |
| GET | /buybox-orders/merchantid/{id}?skuList=... | skuList zorunlu (boşsa 400); "best-effort" buybox sırası |
| GET | /commissions/merchantid/{id}?skuList=... | SKU başına komisyon oranı; skuList zorunlu |

Kimlik: Basic. Path büyük/küçük harf: listing-external YALNIZCA küçük `/merchantid/` kabul eder (camelCase reddedilir). [K: CHANGELOG 0.5.0]
Eski biçim: [P] ksmylmz ve [A] listing dokümanı inventory-uploads gövdesini XML (`<listings><listing>`, content-type application/xml) olarak tarif ediyor; lonca SDK JSON kullanıyor (Content-Type application/json). Hangisinin güncel olduğu DOĞRULANAMADI (portal okunamadı) -> uygulamada ikisi de test edilmeli.
Listing alanları [K: types/listing.ts]: hepsiburadaSku, merchantSku, price, pricings[] (finalPrice, startDate, endDate ISO 8601 UTC), availableStock, maximum/minimumPurchasableQuantity, dispatchTime (gün), cargoCompany1..3, isSalable, isSuspended, isLocked(+lockReasons), isFrozen, isFulfilledByHB, priceIncrease/Decrease/stockDecreaseDisabled, updatedAt (çoğu zaman null — son-yazan-kazanır çakışma tespiti için güvenilmez).

### 1.2 Katalog / ürün oluşturma — host: mpop (`/product/api/...`) [S: mpop-catalog.json, Basic]

| Metot | Yol | Not |
|---|---|---|
| POST | /api/products/import?version=1 | multipart/form-data, zorunlu `file` (JSON dizisi). Yanıtta trackingId |
| POST | /api/products/fastlisting | global barkodlu, HB kataloğunda zaten olan ürünler için (mapping'siz). Alanlar: merchant, merchantSku, productName zorunlu; barcode, hbSku, stock, price, itemOrderID opsiyonel |
| GET | /api/products/status/{trackingId}?page&size | import durumu: importStatus SUCCESS/FAILED/PROCESSING, importMessages[], validationResults, matchedHbProductInfo, qualityScore |
| POST | /api/products/check-product-status | gövde: [{merchant, merchantSkuList[]}]; limit: IP başına 500 istek/sn [S] |
| GET | /api/products/products-by-merchant-and-status | merchantId, productStatus ZORUNLU (yoksa HTTP 500), taskStatus, page, size(1000) |
| GET | /api/products/all-products-of-merchant/{merchantId} | filtre: barcode, merchantSku, hbSku; sayfalı; filtre eşleşmezse HTTP 200 + success:false |
| GET | /api/products/trackingId-history | geçmiş trackingId'ler (version=2 varsayılan) |
| POST | /api/products/approve-prematch , /reject-prematch | PRE_MATCHED ürünleri onay/red (durum DEĞİŞTİRİR) |
| POST/GET | /api/products/delete-process , /delete-process/{trackingId} | yalnız "aksiyon bekleyen" ürünleri siler; CREATED/satışa hazır ürünler silinemez |

productStatus enum (BÜYÜK_HARF, harf duyarlı; yanlış yazım -> HTTP 500): WAITING, IN_EXTERNAL_PROGRESS, PRE_MATCHED, MATCHED, REJECTED, MATCHED_WITH_STAGED, MISSING_INFO, CREATED, BLOCKED. [S][K]
Sayfalama: Spring zarfı `{success, code, data, totalElements, totalPages, number}`; offset kullanılacaksa limit'in tam katı olmalı. [K: types/catalog-product.ts]

Import JSON örneği (spec'ten, alan adları Türkçe/karışık) [S]:
- Kök: `categoryId` (int, zorunlu), `merchant` (UUID, zorunlu), `attributes` (obje, zorunlu)
- attributes: `merchantSku` (zorunlu), `VaryantGroupID`, `Barcode`, `UrunAdi`, `UrunAciklamasi`, `Marka`, `GarantiSuresi` (int), `kg`, `tax_vat_rate`, `price` (STRING, örnek "130,50" — virgüllü), `stock` (string), `Image1`..`Image10` (URL), `Video1`, ayrıca kategoriye özgü varyant/özellik anahtarları (örn. `renk_variant_property`, `ebatlar_variant_property`).
- Aynı barkod/merchantSku ile eşleşen HB ürünü varsa ürün PRE_MATCHED olur ve onay beklenebilir.

Ürün güncelleme servisi — ayrı ticket-api, Bearer JWT [S: mpop-product-updates.json]:
- POST /api/integrator/import?version=1 (multipart `file`: `{merchantId, items:[{hbSku, productName, productDescription, image1..10, video, attributes}]}`)
- GET /api/integrator/merchant/{merchantId}/hbSku/{hbSku} (güncelleme geçmişi/trackingId)
- GET /api/integrator/status/{trackingId}?page&size
- Güncellenebilir alanlar: NAME, DESCRIPTION, KDV, BARCODE, IS_CUSTOMIZABLE, BRAND, DESI, WARRANTY_PERIOD, MEDIA, ATTRIBUTE. Durumlar: COMPLETED/UNCOMPLETED; alan sonucu APPROVED/REJECTED/IN_PROGRESS/PARTIAL_APPROVED.
- Bearer token nasıl alınır: portal spec'inde güvenlik şeması yalnızca "bearerAuth (JWT)". Token ucu DOĞRULANAMADI. [A]+[P]: `POST mpop-sit.hepsiburada.com/api/authenticate` gövde {username,password,authenticationType:"INTEGRATOR"}, ~30 dk geçerli (eski kütüphane; teyitsiz).

### 1.3 Kategori ağacı + öznitelikler — host: mpop [S: mpop-catalog.json]

| Metot | Yol | Parametreler |
|---|---|---|
| GET | /api/categories/get-all-categories | leaf (varsayılan true), status (ACTIVE/INACTIVE/ARCHIVED; varsayılan ACTIVE), available (true), type (HX/HB/HC), version=1, page=0, size=1000 |
| GET | /api/categories/{categoryId}/attributes | modifiedAtSince, version=2 |
| GET | /api/categories/{categoryId}/attribute/{attributeId}/values | yalnız type=enum özellikler için; modifiedAtSince, version=5, page, size=1000 |

- Kategori alanları: categoryId, name, displayName, parentCategoryId, paths[], leaf, available, status, type, sortId, merge. Toplam ~27.000 kategori; listelenebilir olanlar için leaf=true kullan. [K: categories.ts]
- Öznitelik yanıtı 3 kovaya ayrılır: `baseAttributes`, `attributes` (kategori), `variantAttributes`; her öznitelik: id, name, mandatory, type (enum veya metin), multiValue. Enum değer listeleri ayrı uçtan sayfalı çekilir. [S]
- Ürün tarafı varyant: `VaryantGroupID` ile gruplama + `*_variant_property` anahtarları; ürün bilgisi yanıtında `variantTypeAttributes`, `productAttributes`, `baseAttributes` döner. [S]

### 1.3a MARKA (özel soru)
- Markalar LİSTESİ ucu: 7 portal spec'inde ve SDK'da (95 metot) YOK. Lonca categories.ts: "brand'e referans veren metot yok". -> Herkese açık bir "markalar listesi" API'si doğrulanamadı (DOĞRULANAMADI, yokluğu kesin değil; portal okunamadı).
- Ürün gönderiminde marka: import JSON'unda `attributes.Marka` SERBEST METİN string (örnek "Nike"); ID verilmez. Ürün bilgisi yanıtında `brand` string. [S]
- Marka eşlemesi: istek tarafında ID eşlemesi gerekmiyor (string). Ancak [B] (zunapro) "Apple/APPLE farklı kayıt" diyor -> DOĞRULANAMADI. Pratikte HB tarafı markayı kendi kayıtlarıyla eşliyor (PRE_MATCHED/REJECTED/MISSING_INFO sonuçları ve `validationResults[].attributeName`). Marka sonradan düzeltme: ticket-api `BRAND` alanı.
- Katalog marka doğrulama hatalarını `GET /api/products/status/{trackingId}` içindeki importMessages/validationResults'tan izlemek gerekir.

### 1.4 Sipariş / paket — host: oms-external [S: oms-external.json, Basic, User-Agent zorunlu]

Sipariş listeleri (yalnız okuma):
- GET /orders/merchantid/{id} — ödemesi tamamlanmış ("order received") kalemler; begindate, enddate, offset, limit (varsayılan ve MAX 100)
- GET .../paymentawaiting (max 50), GET .../cancelled (max 50)
- GET /orders/merchantid/{id}/ordernumber/{orderNumber} — tek sipariş (`model.OrderRepresentation`)
- Not: yanıtta `status` filtresi SDK'da var; spec'te `status` parametresi görünmedi -> DOĞRULANAMADI.

Paket listeleri: GET /packages/merchantid/{id} (limit varsayılan/max 10; begindate, enddate, timespan [saat geriye], offset; yanıt HAM DİZİ, totalCount zarfı yok [K]); /shipped, /delivered, /undelivered (limit 50); /status/unpacked; /missing-invoice (limit 50); GET /packages/.../packagenumber/{no} (kargo/takip); GET .../labels?format= (barkod etiketi).

Yazma uçları (durum DEĞİŞTİRİR):
- POST /packages/merchantid/{id} — paket oluştur (lineItems + kargo); yanıt packageNumber + barcode (201)
- POST .../packagenumber/{no}/split , /unpack
- POST .../intransit , /deliver , /undeliver (gövde: trackingNumber, reason)
- PUT .../parcel-info (totalDesi, totalParcel), PUT .../warehouse (shippingAddressLabel)
- PUT .../invoice (fatura linki; bkz. 1.6)
- POST /lineitems/merchantid/{id}/id/{lineId}/cancelbymerchant (paketlenmemiş kalem; gövde: reasonId)
- Kargo değişimi: GET /delivery/changeablecargocompanies/merchantid/{id}/orderlineid/{lid}; PUT /lineitems/.../orderlineid/{id}/cargocompany; GET/PUT /packages/.../changablecargocompanies , /changecargocompany; PUT .../laborcost (yalnız altın ürün)
- GET /lineitems/.../packageablewith/lineitemid/{id} (birlikte paketlenebilir kalemler)

Alanlar: orderNumber, externalOrderNumber, status, createdDate, modifiedDate, total (SDK'da gevşek tipli); kalem düzeyi alanlar (items, totalPrice, cargo) için tam şema DOĞRULANAMADI (spec'in ilgili kısmı okunamadı) -> `oms-external.json` raw dosyası doğrudan incelenmeli.
Durumlar (SDK normalize): Open, Shipped, Delivered, Cancelled, Returned; bilinmeyen -> unknown. [K: status.ts]

### 1.5 İade / Claim — host: oms-external (+ claim-stub, yalnız test) [K: claims.ts; spec yok]
- GET /claims/merchantId/{id}?offset&limit&beginDate&endDate — limit ZORUNLU (yoksa 400 "LimitCannotBeEmpty")
- GET /claims/merchantId/{id}/status/{status} (+ statusBeginDate/statusEndDate)
- Durumlar: NewRequest, Accepted, AwaitingAction, InDispute, Rejected, Refunded, Cancelled, AwaitingPreApproval (geçersiz -> 400 "Wrong Claim Status")
- POST /claims/number/{claimNumber}/accept ; /reject (gövde: reasonCode vb.) ; /preapprovalconfirm (bazı kategorilerde 2. adım onay)
- POST /claims/merchant/{id}/create (claim-stub; test amaçlı)
- [P] ek: POST claims/awaitingaction, GET claims/packages (teyitsiz).
- Alanlar: claimNumber, status, createdAt (sunucu-yerel string), gerisi `raw`; sebep (reason) alanının adı DOĞRULANAMADI.

### 1.6 Fatura
- Ayrı e-fatura servisi YOK; satıcı kendi kestiği faturanın LİNKİNİ pakete bağlar: PUT /packages/merchantid/{id}/packagenumber/{no}/invoice, gövde: `invoiceLink`, `serialNumber`, `rowNumber`, `arrangementDate`, `invoices[]` (yanıt 204). Yalnız kargoya verilmiş paketler. Fatura eksik paketler: GET /packages/.../missing-invoice. [S][K]
- [P] eski kütüphane `invoices/merchantid/{id}` (finance) uç adı veriyor; güncel muhasebe ucu 1.7'dedir.

### 1.7 Finans / hakediş — host: mpfinance-external [S: mpfinance-external.json, Basic]
- GET /orders/merchantid/{id} — "Performans": sipariş/ürün kırılımı finansal performans. Zorunlu: Limit (100), Offset (0), User-Agent; filtre: DueDateStart/End, OrderDateStart/End, OrderNumber, Sku. Yanıt: totalCount, items[] (allowance, unit, income, expense tutarları, adet, para birimi kodu).
- GET /transactions/merchantid/{id} — ödeme ve fatura kayıtları. Filtre: OrderNumber, PackageNumber, ReferenceDocument, Sku, TransactionTypes (70+ değer: Payment, Commission, Returns, VAT...), Status (Paid, WillBePaid), çoklu tarih aralığı (Order/Invoice/Payment/Record/Due). Yanıt alanları: transactionId, transactionDate, paymentDate, type, amount, currency, orderNumber (+tax/fatura bilgileri).
- Kısıt: sorgu ya bir tanımlayıcı (orderNumber/packageNumber/referenceDocument/sku) ya da EN FAZLA 1 AY'lık tarih çifti içermeli, aksi halde 400. Sorgu parametreleri PascalCase (Offset/Limit). [K: accounting.ts]
- Komisyon oranı ayrıca listing-external `/commissions/merchantid/{id}?skuList=` ile alınır (1.1).

### 1.8 Soru (Ask to Seller) — host: api-asktoseller-merchant [S: asktoseller-merchant.json, Basic]
Her istekte başlık: `merchantId` (yoksa 401) + `User-Agent`.
- GET /api/v1.0/issues — filtre: source (1 siparişsiz, 2 siparişli), subject, minCreatedAt/maxCreatedAt, minModifiedAt/maxModifiedAt, issueNumber, status[] (WaitingForAnswer, Answered, Rejected, AutoClosed), search, sortBy, desc, page (1'den, varsayılan 1), size (25)
- GET /api/v1.0/issues/count — waitingForAnswer, answered, reported, autoClosedInLastWeek
- GET /api/v1.0/issues/{number} — issueNumber, status, expireDate, customerId, orderNumber, subject, conversations[], product, merchant, lastModifiedAt
- POST /api/v1.0/issues/{number}/answer — multipart: `Answer` (zorunlu, max 2000 karakter), `Files[]` opsiyonel; 201
- POST /api/v1.0/issues/{number}/reject — "sorun bildir": rejectReason (max 2000), rejectConversationId
- POST /api/v1.0/issues — soru oluşturma, YALNIZ SIT (issueCount)
- Yanıt süresi: 1 iş günü (expireDate); süre dolunca AutoClosed.
- Not: SEO/[B] kaynakların "ask.hepsiburada.com" alanı doğrulanamadı; gerçek host yukarıdaki.

### 1.9 Kargo / paketleme ve diğer
- shipping-external: GET /cargoFirms/{merchantId}, GET /profiles/{merchantId}, POST /profile/createByMerchantId, PUT /profile/updateByMerchantId (camelCase merchantId). [K: shipping.ts; spec yok]
- Paketleme akışı: 1.4 (POST packages -> labels -> intransit/deliver). Kargo etiketi HB anlaşmalı kargolar için `labels`.
- Satıcı promosyon (diskonto-external): 9 operasyon (bütçe, 3 indirim türü, iptal); kapsam dışı. Satıcının satış yaptığı kategoriler `GET /categories/{merchantId}` (500 istek/sn) [A].
- Supplier API (tedarikçi/B2B, genelde marketplace satıcısı için değil): listingUpdateRequests, supplierlistings/search, openPurchaseOrders/search. [S]

---

## 2. Kimlik doğrulama ve başlıklar
- Şema: HTTP Basic (`Authorization: Basic base64(kullanıcıAdı:parola)`), tüm spec servislerinde; yalnız ürün güncelleme (ticket-api) Bearer JWT. [S]
- Kimlik bilgileri (merchantId UUID + entegrasyon kullanıcı adı + parola): Satıcı Paneli -> Ayarlar -> Entegrasyonlar. [K: authentication.md]
- User-Agent ZORUNLU. Canlı doğrulama: `User-Agent: <merchantId> - <integratorName>` biçimi SIT'te 401/403 verdi; doğru biçim YALNIZCA çıplak entegratör adı ve bu ad panelde kayıtlı entegratör adıyla eşleşmeli. [K: CHANGELOG 0.3.0, authentication.md]. Çelişki: [B] bloglar "User-Agent merchantId içermeli" diyor -> bu, canlı doğrulamayla ÇELİŞİYOR; güvenme.
- Ek başlık: `merchantId` (soru API'si), `x-correlationid` (SDK'nın kendi izleme başlığı, zorunlu değil), Content-Type/Accept: application/json.
- IP beyaz liste: HB için yok [K]. Ancak prod "bot manager" daha sıkı; Cloudflare Workers gibi paylaşımlı IP'lerden `oms-external` istekleri HTTP 520 döndü, sabit sunucu IP'li proxy ile çözüldü. [github.com/mustafadenizkurt-lab/terragolds-site/pull/216, üçüncü taraf PR] -> bulut/serverless çıkışlarında risk.
- Sandbox (SIT) daha esnek; prod daha katı.

## 3. Veri tipi / format
- Tarih: sipariş `begindate/enddate` için "YYYY-MM-DD HH:mm" (Türkiye saati) [üçüncü taraf PR; spec "belirtilmemiş" diyor] -> DOĞRULANAMADI/yarı. Claim tarihleri `yyyy-MM-dd HH:mm` [K]. Listing pricings ISO 8601 UTC [K]. Supplier API `yyyy-MM-dd` [S]. Claim `createdAt` sunucu-yerel string.
- Para: import'ta `price` STRING ve ondalık virgüllü ("130,50") [S]; listing yanıtında `price` number [K]; muhasebede `currency` kodu; supplier API TRY/USD/EUR.
- KDV: `tax_vat_rate` string (örn "5"). Ağırlık `kg` string; desi/koli paket seviyesinde.
- Görsel: Image1..Image10 URL + Video1 [S]. Boyut/çözünürlük sınırı DOĞRULANAMADI.
- Soru yanıtı max 2000 karakter [S]. Ürün adı/açıklama uzunluğu, barkod/SKU uzunluğu, açıklamada HTML izni: DOĞRULANAMADI (spec'te yok).
- Sayfalama: OMS offset/limit (+totalcount; paket listesi ham dizi); katalog page/size (Spring); soru page(1'den)/size.
- Katalog kalite: qualityScore (double), qualityStatus.

## 4. İstek limitleri
- Resmî (spec metni): `check-product-status` ve `Satıcı Ürün Kategorileri` için IP başına 500 istek/sn [S][A].
- Listing yükleme: aynı anda bekleyen/devam eden POST (upload) işlemi tek mağaza için 5'i geçemez [A: developers.hepsiburada.com listing price-uploads sayfası arama özeti; sayfa okunamadı].
- Sayfa boyutu üst sınırları: orders 100, paymentawaiting/cancelled/delivered/shipped 50, packages 10, supplier limit 0-1000, katalog size 1000.
- lonca SDK varsayılanları (HB'nin resmî limiti DEĞİL, istemci tarafı koruma): listings 600/dk, orders 120/dk, questions 120/dk, accounting 60/dk, test-orders 30/dk. 429'da Retry-After'a uyulur; yazma isteklerinde yalnız 429'da yeniden deneme (kopya sipariş/paket riski). [K]
- [B] bloglardaki "30 istek/sn listing, 10/sn sipariş, 100/dk" -> DOĞRULANAMADI, kullanma.
- Genel (uç bazlı) resmi rate-limit tablosu bulunamadı.

## 5. Webhook / bildirim
- VAR (sipariş + claim): endpoint-başına-olay modeli; HB her olay için `PUT <baseUrl>/<eventName>` çağırır. 12 olay: createOrder, createPackages, orderCancel, unpack, intransit, deliver, undeliver, changeShippingAddressOrder (sipariş, 8); awaitingAction, awaitingPreApproval, disputedClaimResult, packageFromClaimResult (claim, 4). [K: types/webhook-event.ts, Webhook guide]
- Yanıt: 5 sn içinde 2xx; non-2xx'te HB yeniden dener. Alan şemaları portalda HTML tablolarıyla verilmiş (makine-okunur değil) -> payload alanları DOĞRULANAMADI.
- Kayıt (abonelik) yöntemi: DOĞRULANAMADI (portal/destek üzerinden olduğu varsayılabilir, kaynak yok).
- İmza/HMAC doğrulaması: kaynaklarda GÖRÜLMEDİ. [B]'deki "X-HB-Signature HMAC", "POST /webhook-subscriptions", "order.created/return.created/question.received" ifadeleri resmî olay adlarıyla (yukarıdaki 12) uyuşmuyor -> UYDURMA/DOĞRULANAMADI.
- SORU için webhook YOK (12 olayda yok) -> polling (`/issues`, `/issues/count`).
- Finans/ürün-durum için webhook yok -> polling (`trackingId` sorgusu).
- Öneri: webhook + periyodik polling mutabakatı birlikte (SDK dokümanı da endpoint-per-event modelini tarif ediyor).

## 6. Test (sandbox) ortamı
- VAR: `{servis}-sit.hepsiburada.com` host'ları (bölüm 1.0). Aynı Basic kimlik + entegratör User-Agent; SIT'te bazı kısıtlar gevşek. [S][K]
- Test sipariş: POST `oms-stub-external-sit.hepsiburada.com/orders/merchantId/{id}` (yalnız SIT; yanıt şeması yayınlanmamış). Test soru: POST /api/v1.0/issues (yalnız SIT, `issueCount`). Test claim: claim-stub `POST /claims/merchant/{id}/create`. [K][S]
- SIT için ayrı "test merchant" kimliğinin nasıl alındığı (başvuru/destek) DOĞRULANAMADI. Not: lonca doğrulamaları hem SIT hem prod hesapla yapılmış.
- [A] `developers.hepsiburada.com` sayfaları SIT URL'lerini örnek olarak veriyor (mpop-sit, oms-external-sit, listing-external-sit, api-asktoseller-merchant-sit, diskonto-external-sit).

## 7. Okuma gibi görünüp durum değiştiren / dikkat edilecek uçlar
Okuma amaçlı POST (yan etkisiz sanılır, GET değil): `POST /api/products/check-product-status`, `POST /suppliers/{id}/.../search` ailesi. Yan etki yok ama "yalnız GET'e izin ver" kuralı bunları engellemeli.
Bu tür kod "okuma" katmanında yanlışlıkla çağrılmamalı (durum DEĞİŞTİRİR):
- POST /packages/merchantid/{id} (paket oluşturma — sipariş kalemini "paketlendi" yapar), /split, /unpack, /intransit, /deliver, /undeliver
- POST .../cancelbymerchant (kalem iptali, geri alınamaz), PUT cargocompany/changecargocompany/laborcost/parcel-info/warehouse/invoice
- POST approve-prematch / reject-prematch / delete-process / import / fastlisting
- Listing: POST activate/deactivate, bulk-unlock, price/stock/inventory uploads (stock-uploads fiyatsız ve "overwrite"), DELETE tek SKU (kalıcı)
- POST /issues/{n}/answer (müşteriye görünür, geri alınamaz), /reject
- POST /claims/number/{n}/accept|reject|preapprovalconfirm (finansal etki: iade)
- GET /packages/.../labels: etiket üretir; yan etkisi (örn. kargo barkodu rezervasyonu) spec'te belirtilmiyor -> DOĞRULANAMADI, temkinli ol.
- "Siparişi alındı işaretleme" ve "soru okundu işaretleme" uçları YOK (spec'te rastlanmadı); sipariş listesi GET'leri durum değiştirmez ("durum değiştiren GET belgelenmemiş" [S özet]). Sipariş "alındı" akışı: paketleme (POST packages) ile ilerler.
- Katalog GET'lerinde dikkat: `products-by-merchant-and-status` productStatus eksikse/yanlışsa HTTP 500; `claims` limit eksikse 400.

## 8. Eski / kullanımdan kaldırılan uçlar, sürüm notları, duyurular
- developers.hepsiburada.com arama özetlerinde hâlâ görünen eski "Radium" uçları: `POST radium.hepsiburada.com/api/product/create_trend` (ürün yaratma), `GET radium.hepsiburada.com/api/order_status` (sipariş listeleme) [A]. Güncel katalog/OMS uçları (mpop/oms-external) varken bunlar eski kuşak görünüyor; resmî kullanımdan kaldırma duyurusu DOĞRULANAMADI. Yeni geliştirmede kullanma.
- Eski kuşak: mpop `.../api/authenticate` + Bearer token akışı ve listing XML gövdesi ([P]/[A]); güncel spec Basic + JSON'a geçmiş görünüyor (tek istisna ticket-api Bearer). Tam geçiş tarihi DOĞRULANAMADI.
- "mpop vs oms-external geçişi" için resmî kaynak BULUNAMADI (DOĞRULANAMADI). Bulunan somut bulgu: servis host ayrımı (1.0) ve path büyük/küçük harf farkları (listing: küçük `merchantid`; mpop/shipping: camelCase; oms/finans: ikisi de).
- lonca CHANGELOG, 2026 boyunca kırıcı/sessiz davranışlar (yeniden doğrulama gerekli): sayfalı zarfların (`totalElements/data`) sessizce boş dizi döndürmesi (0.11.0); soru API'sinde `merchantId` başlığı zorunluluğu (0.13.0); finans'ta PascalCase `Offset/Limit` (0.13.0); diskonto'da `Data` zarfı (0.13.0); 403 yanıt gövdesinin sızdırma riski (0.9.2). [K]
- Lonca "nightly contract-probe" ile HB API şekil değişikliklerini izliyor; sürüm: 1.0.0 (2026-08-30, 12 probe 200). Lonca stability notu: "Hepsiburada API'lerini haber vermeden değiştirebilir". [K]
- [A] Bizimhesap duyurusu: Hepsiburada entegrasyon altyapı geçişi, son tarih 2024-08-15 (kendi ürünlerinin geçişi; Hepsiburada API duyurusu değil) — yalnız arama özeti, DOĞRULANAMADI.
- AKINSOFT "Hepsiburada API Parametrelerinde Yapılan Değişiklik Duyurusu" var (içerik ve tarih ERİŞİLEMEDİ).
- [B]'de geçen "60-90 gün önceden bildirim" politikası, "API Health paneli" vb. -> kaynaksız, DOĞRULANAMADI.

## 9. Özet tablo (uç | durum | kaynak)

| Uç | Durum | Kaynak |
|---|---|---|
| GET /listings/merchantid/{id} (+uploads: inventory/stock/price/shipping/additional) | güncel (SDK 1.0.0 prod doğrulamalı); gövde biçimi JSON mu XML mi teyitsiz | [K] listings.ts; [P] |
| GET /buybox-orders, /commissions (listing-external) | güncel | [K] |
| POST mpop /api/products/import | güncel | [S] mpop-catalog.json |
| POST /api/products/fastlisting | güncel | [S] |
| GET /api/products/status/{trackingId}, check-product-status, products-by-merchant-and-status, all-products-of-merchant, trackingId-history | güncel | [S] |
| approve/reject-prematch, delete-process | güncel | [S] |
| ticket-api /api/integrator/import, status, history (Bearer) | güncel (token ucu DOĞRULANAMADI) | [S] mpop-product-updates.json |
| GET categories (get-all, attributes, attribute values) | güncel | [S] |
| Markalar listesi ucu | doğrulanamadı (yok gibi) | [S][K] |
| GET /orders, /paymentawaiting, /cancelled, /ordernumber/{n} (oms-external) | güncel | [S] oms-external.json |
| /packages (list/create/split/unpack/intransit/deliver/undeliver/labels/invoice/parcel-info/warehouse) | güncel | [S] |
| /claims (list, status, accept, reject, preapprovalconfirm) | güncel (spec yok, SDK canlı doğrulamalı) | [K] claims.ts |
| mpfinance /transactions, /orders (performans) | güncel | [S] mpfinance-external.json |
| asktoseller /api/v1.0/issues (+count, answer, reject) | güncel; POST create yalnız SIT | [S] asktoseller-merchant.json |
| Webhook (12 olay, PUT <baseUrl>/<event>) | güncel; kayıt/payload şeması doğrulanamadı | [K] webhook-events.md |
| shipping-external (cargoFirms, profiles) | güncel (spec yok) | [K] |
| Test: oms-stub-external-sit (test sipariş), claim-stub create | güncel (yalnız SIT) | [K] |
| radium create_trend / order_status | eskidi (olası) / doğrulanamadı | [A] |
| returns-external.hepsiburada.com, integration.hepsiburada.com/finance, /webhook-subscriptions, X-HB-Signature | doğrulanamadı (güvenilmez blog iddiası) | [B] |
| Genel rate-limit tablosu | doğrulanamadı (yalnız 500/sn ve 5 eşzamanlı upload) | [S][A] |

## 10. Kod karşılaştırması

Kaynak: adaptör kodu (`backend/src/integration/modules/marketplace/hepsiburada/**`, salt okuma, 2026-10-03; ayrıntılı envanter orkestratör
çalışma notunda) ile yukarıdaki bulgular. Kod tarafındaki tek canlı kanıt: 2026-10-03 yerel salt-okuma turu (`oms-external` orders/packages/claims = 200;
`settlements` oms'te 404; `entegrasyonik` User-Agent kabul). Öncelik: P0 = büyük olasılıkla canlıda kırık / yanlış veri; P1 = işlevsel eksik; P2 = doğrulama/iyileştirme.
Hiçbir yazma ucu canlıda denenmez (Bölüm 2); yazma düzeltmeleri mock + SIT ile doğrulanır.

| # | Ö. | Konu | Doküman (etiket) | Kod (dosya:satır) | Fark / aksiyon |
|---|---|---|---|---|---|
| K-1 | P0 | Finans host/uç | `mpfinance-external` `GET /transactions/merchantid/{id}` (PascalCase `Offset/Limit`, `TransactionTypes`, ≤1 aylık tarih çifti) ve `/orders/merchantid/{id}` (performans) [S] | `settlements/merchantid/{m}?startDate&endDate` → `accounting-external` (`services/Service.ts:35`, `api/FinancialConnector.ts:7-29`); `mpfinance-external` izinli host listesinde YOK | Canlı turda 404. Uç, host, parametre adları ve yanıt alanları (`transactionId, transactionDate, paymentDate, type, amount, currency, orderNumber`) yeniden yazılmalı; `FinancialMapper` (`transactionType/commissionAmount/grossAmount/netPayoutAmount/orderDate`) doküman alanlarına eşlenmeli; `externalId = transactionId`; 1 aylık pencere dilimleme (motorun 30 günlük tam süpürmesi ikiye bölünmeli). Host `outboundHosts` + K7 listesine eklenir. |
| K-2 | P0 | Soru/mesaj host/uç | `api-asktoseller-merchant` `GET /api/v1.0/issues` (`merchantId` BAŞLIĞI zorunlu; `status[]` WaitingForAnswer/Answered/Rejected/AutoClosed; `page` 1'den, `size` 25; `minCreatedAt/maxCreatedAt`, `minModifiedAt/maxModifiedAt`), `POST /issues/{number}/answer` (multipart `Answer` ≤2000) [S] | `questions/merchantid/{m}` ve `.../answers {questionId, answer}` → **mpop** (`services/QuestionService.ts:22,32-35`); `ticket-api` host'u hiç kullanılmıyor | Mevcut uç hiçbir spec'te yok; soru modülü HB'de fiilen çalışmıyor. Yeni connector: host + `merchantId` başlığı + sayfa/durum parametreleri + multipart cevap; `QuestionTransformer` alanları (`issueNumber, status, expireDate, orderNumber, subject, conversations[], product`) yeniden eşlenir; `AutoClosed` → yeni iç durum (REJECTED değil); `expireDate` (1 iş günü) önyüz SLA'sına (messageSla) gerçek kaynak olur. |
| K-3 | P0 | Ürün İÇE AKTARIM kaynağı | Listing yanıtı (`listing-external`) yalnız `hepsiburadaSku, merchantSku, price, pricings[], availableStock, isSalable, dispatchTime, cargoCompany1..3, isFulfilledByHB, isLocked` taşır [K]; ürün bilgisi (ad, barkod, kategori, marka, görsel, öznitelikler) `mpop GET /api/products/all-products-of-merchant/{merchantId}` (sayfalı, Spring zarfı; `productAttributes/variantTypeAttributes/baseAttributes`, `brand` string) [S] | Import yalnız `listings/merchantid/{m}` okuyor ve `productName/barcode/categoryId/brand/images/attributes/stockCount/status==='Active'` bekliyor (`transformers/ProductTransformer.ts:88-133`); ayrıca Stager'a ham veri yerine iç model veriliyor (`services/ProductService.ts:261-262`) | Listing'den ürün bilgisi gelmediği için HB'den çekilen ürünler ad/kategori/marka/görselsiz oluşur (Ek A P1-7 ile uyumlu). İki kaynak birleştirilmeli: katalog ürünleri (ürün bilgisi + öznitelik) + listing (fiyat/stok/satılabilirlik), anahtar `merchantSku`/`hbSku`. Alan adları: `availableStock` (stok), `isSalable` (onSale). Stager'a ham kayıt verilip `getSummaryFromRaw/convertToInternalModel` ham alanları okumalı. |
| K-4 | P0 | Marka | Import JSON'da `attributes.Marka` SERBEST METİN (ad); markalar listesi ucu YOK; HB markayı kendi kataloğuyla eşleyip sonucu `status/{trackingId}` `validationResults[]`'ta bildirir [S] | `Marka: String(mapping.brandId)` (kimlik) (`ProductTransformer.ts:74`); `retrieveBrands` `[]`; önyüz marka eşleme satırı yalnız `hasBrandMapping` bayrağıyla gizleniyor (kaynağı belirsiz) | HB'de **marka eşlemesi yoktur**: ürün gönderiminde yerel `Brands.title` gönderilir; descriptor/yetenek kaydına `brandMapping: not_supported` eklenir ve marka eşleme ekranı HB için gizlenir (Bölüm 4 madde 2). Import sonucundaki marka red/eksik mesajı yapılandırılmış hataya (kod `HB_BRAND_UNMATCHED`, çözüm: "marka adını HB'deki yazımıyla düzelt") çevrilir. |
| K-5 | P0 | Kategori kimliği ve zorunlu öznitelik denetimi | `GET /api/categories/{id}/attributes` üç kova (`baseAttributes`, `attributes`, `variantAttributes`; her biri `mandatory`, `type`, `multiValue`); enum değerleri `GET /api/categories/{id}/attribute/{attributeId}/values` (sayfalı, size 1000, **tekil `attribute`**); varyant anahtarları `*_variant_property`, gruplama `VaryantGroupID` [S] | Kategori kimliği `variant.platforms.hepsiburada.mapping.categoryId` (yalnız import yazar; `AttributeMappings` okunmaz; `mappingProvider` HB'de yok) → yerel üründe `categoryId: NaN`; `catAttrs=[]` → zorunlu denetim yok (`services/ProductService.ts:36-42`); değer ucu yolu `categories/{cat}/attributes/{attr}/values` (çoğul) (`api/CategoryConnector.ts:55-62`); `CategoryTransformer` `values: []` ve `lazyValues` bayrağı yok | Trendyol/Pazarama kalıbı: `getPlatformCategoryId` + `fetchCategoryAttributes` + `prepareAttributes` zorunlu denetimi; üç kovanın `mandatory` alanı korunur, `variantAttributes` → varianter. Değer ucu yolu dokümanla (tekil `attribute`) yerelde doğrulanır. `lazyValues:true` işaretlenir (Ek C P0-2). `multiValue` desteklenmediği için önyüzde "tek değer" uyarısı. |
| K-6 | P0 | Fatura linki bildirimi | `PUT /packages/merchantid/{id}/packagenumber/{no}/invoice` gövde `invoiceLink, serialNumber, rowNumber, arrangementDate, invoices[]`; yalnız kargoya verilmiş paket; 204 [S][K]; eksik fatura listesi `GET /packages/.../missing-invoice` | `POST orders/merchantid/{m}/invoices [{orderNumber, invoiceUrl}]` (`api/OrderConnector.ts:89-115`); descriptor `invoiceNotice: supported` (`liveApi:false`) | Uç dokümanda yok → `invoiceNotice` fiilen çalışmıyor sayılmalı. Paket numarası (`POST packages` yanıtı `packageNumber`) `Order.fulfillment[].packageNumber` olarak saklanmalı; fatura akışı `invoiceNumber`'ı `serialNumber+rowNumber`'a bölmeli; mock + SIT testi; descriptor `limited`. |
| K-7 | P1 | Sipariş iptali / tedarik edememe | `POST /lineitems/merchantid/{id}/id/{lineId}/cancelbymerchant` gövde `reasonId` (kalem düzeyi, geri alınamaz) [S] | `POST orders/merchantid/{m}/cancel {orderNumber, cancellationReason}` (`OrderConnector.ts:75-87`); sebep kataloğu iade-red listesinden (`services/ClaimService.ts:47-57`) | Uç dokümanda yok. Kalem bazlı iptal + HB iptal sebep kataloğu (resmî liste DOĞRULANAMADI; SIT'te okunmalı) gerekir. Oversell telafisinde HB zaten "doğrulanmamış kanal". |
| K-8 | P1 | Kargo bildirimi | Paket akışı: `POST packages` → `GET labels` → `POST .../packagenumber/{no}/intransit` (trackingNumber) → `/deliver`; `PUT parcel-info` [S] | `sendOrderShipping` yalnız `packages` POST'u yapar, takip no/kargo firması hiç gönderilmez (`services/OrderService.ts:106-122`) | Satıcı kendi kargosuyla gönderiyorsa `intransit` çağrısı eklenmeli; HB anlaşmalı kargoda `labels` yeterli. Descriptor `shippingNotice: limited` notu gerçek davranışla eşitlenir; Ek E F-P0-3 ile birlikte çözülür. |
| K-9 | P1 | İade (claim) uçları ve durumlar | `GET /claims/merchantId/{id}?offset&limit&beginDate&endDate` (`limit` zorunlu, yoksa 400), `/status/{status}`; durumlar NewRequest, Accepted, AwaitingAction, InDispute, Rejected, Refunded, Cancelled, **AwaitingPreApproval**; `POST /claims/number/{claimNumber}/accept\|reject\|preapprovalconfirm` [K] | Liste ✓ (OMS'de canlı 200) ama tarih parametreleri motorun `startDate/endDate`'i ham geçiyor (`api/ClaimConnector.ts:12-15`); onay/ret `POST claims/merchantId/{m}/approve\|reject {claimId}` (`:23-53`); `AwaitingPreApproval` eşlenmemiş (sessiz WAITING); tür hep REFUND, tek kalem | Tarih adları `beginDate/endDate` (`yyyy-MM-dd HH:mm`); onay/ret yolları `claims/number/{claimNumber}/...`; `preapprovalconfirm` ikinci adımı ve `AwaitingPreApproval` → yeni iç durum (ön onay bekliyor); `reportUnknownEnum` eklenir. |
| K-10 | P1 | İptal edilen / ödeme bekleyen siparişler | `GET /orders/merchantid/{id}` yalnız "order received"; iptaller `/cancelled` (limit 50), ödeme bekleyenler `/paymentawaiting` (limit 50) ayrı uçlar [S] | Yalnız ana liste çekiliyor (`api/OrderConnector.ts:27-51`) | Müşteri iptalleri hiç gelmez → yerel sipariş "onay bekliyor" kalır, stok tahsisi serbest bırakılmaz. `/cancelled` ayrı imleçle (aynı pencere) çekilip CANCELLED'a eşlenmeli. |
| K-11 | P1 | Fiyat/stok yükleme sonuçları | `POST .../price-uploads\|stock-uploads` ✓; sonuç `GET .../{tür}-uploads/id/{uploadId}` (`/id/` segmenti), `priceValidations[]` (MinPrice/MaxPrice/RegulativePrice); `stock-uploads` "overwrite", `isFulfilledByHB` listing'lerde kullanılmamalı; listing-external yalnız küçük harf `merchantid`; aynı anda ≤5 bekleyen yükleme/mağaza [K][A]; gövde JSON mu XML mi teyitsiz | Yükleme ✓ (küçük harf ✓, JSON), sonuç `price-uploads/{id}` (`/id/` yok) (`api/ProductConnector.ts:116-129`); `priceValidations` okunmuyor; eşzamanlı yükleme sınırı yok (ratePerMin yok) | Sonuç yolu dokümana göre düzeltilir (yerelde doğrulanır); `priceValidations` → yapılandırılmış fiyat hatası ("HB taban/tavan fiyat: X–Y"); yazma kovası `maxConcurrent` 5 → 2 ve tenant başına "bekleyen upload ≤5" koruması (Sentinel zaten trackingId izliyor). |
| K-12 | P1 | Ürün import durum enum'u | `importStatus` SUCCESS/FAILED/PROCESSING; `productStatus` WAITING, IN_EXTERNAL_PROGRESS, PRE_MATCHED, MATCHED, REJECTED, MATCHED_WITH_STAGED, MISSING_INFO, CREATED, BLOCKED (BÜYÜK_HARF; yanlış yazım 500); `importMessages[]`, `validationResults[]`, `matchedHbProductInfo`, `qualityScore` [S] | `Processing` → bekle; REJECTED/MISSING_INFO → FAILED, `Satışa Hazır`/MATCHED → COMPLETED, diğer → WAITING (`transformers/ProductTransformer.ts:135-188`, mock akışından türemiş) | Tam enum tablosu: PRE_MATCHED → "onay bekliyor (HB eşleşmesi)" (kullanıcıya `approve-prematch` kararı sunulabilir; yazma), BLOCKED → FAILED, CREATED/MATCHED/MATCHED_WITH_STAGED → COMPLETED; `validationResults[].attributeName` yapılandırılmış hataya (hangi öznitelik). |
| K-13 | P1 | merchantId kaynağı | `merchantId` UUID; import JSON kökünde `merchant` (UUID); soru API'sinde `merchantId` başlığı [S][K] | Sorgu yollarında `MERCHANTID\|SELLERID\|APIKEY` zinciri; import `merchant` ve ürün güncelleme `merchantId` **APIKEY/USERNAME**'den (`ProductTransformer.ts:67`, `ProductService.ts:160`) | Tek kaynak: `settings.SELLERID` (= merchant UUID) — yerel DB'de hangi alanda tutulduğu doğrulanmalı; tek `merchantId()` yardımcı fonksiyonu. |
| K-14 | P1 | Ürün güncelleme servisi | `ticket-api` `POST /api/integrator/import?version=1` (multipart `file`, **Bearer JWT**), alanlar NAME/DESCRIPTION/KDV/BARCODE/BRAND/DESI/WARRANTY_PERIOD/MEDIA/ATTRIBUTE; durum `GET /api/integrator/status/{trackingId}`; token ucu DOĞRULANAMADI [S] | `POST product/api/products/product-update` (mpop, Basic, JSON gövde) (`api/ProductConnector.ts:102-131`) | Uç/host/kimlik üçü de farklı; `updateProduct` HB'de çalışmıyor sayılmalı → descriptor `products` notu; Bearer token ucu yerelde (SIT) bulunana kadar `limited`. |
| K-15 | P1 | Tarih biçimi / pencere | Sipariş `begindate/enddate` "YYYY-MM-DD HH:mm" (TR saati; yarı doğrulanmış), claim `yyyy-MM-dd HH:mm`, listing `updateStartDate/EndDate` ISO [K] | `beginDate = YYYY-MM-DD` (UTC gün), pencere daraltmada `endDate` tam ISO (`services/OrderService.ts:28-33`) | Tek biçimlendirici: Europe/Istanbul `YYYY-MM-DD HH:mm`; parametre adlarının büyük/küçük harf duyarlılığı yerelde doğrulanır (OMS "ikisi de"). Listing `updateStartDate` ile ürün artımlı taraması mümkün (bugün tam tarama). |
| K-16 | P1 | Host listesi / sandbox | Servis host'ları (1.0) + `-sit` eşleri; `oms-stub-external-sit` test sipariş, `claim-stub` test iade, `/issues` SIT soru | `outboundHosts`: mpop, listing-external, accounting-external, ticket-api, oms-external; SIT yok | `mpfinance-external`, `api-asktoseller-merchant`, `shipping-external` + SIT eşleri eklenir (`accounting-external` kaldırılır); sandbox yalnız açık `HB_ENV=sit` bayrağıyla (ayrı tenant ayarı), Bölüm 2 "yazma testleri sandbox'ta" için ön koşul. |
| K-17 | P2 | Hız sınırı bildirimi | Doğrulanan yalnız: `check-product-status` 500/sn/IP, ≤5 bekleyen upload; SDK istemci varsayılanları 600/120/120/60 dk [S][K] | descriptor `documented.perSecond:1000` (kaynaksız), `configured.ratePerMin` yok | `documented` yalnız doğrulanan iki değerle; `configured` SDK muhafazakâr değerleri (orders 120/dk, listings 300/dk, accounting 60/dk) `verified:false`. |
| K-18 | P2 | Webhook | 12 olay (8 sipariş, 4 claim), HB `PUT <baseUrl>/<eventName>` çağırır, 5 sn 2xx; kayıt/payload/imza DOĞRULANAMADI; soru/finans için yok [K] | Yok | Bölüm 8 adayı (Trendyol deseninde "çek" sinyali). İmza belgelenmediği için yol-token + IP izin listesi; kayıt yöntemi HB desteğinden öğrenilmeli (insan görevi). |
| K-19 | P2 | Eski yol kalıntıları | `rest/delivery/v1/shipmentPackages`, `radium.*` eski kuşak | Mock listesinde ve `legacyOmsPath` süzgecinde (`adapterKeys.ts:11`, `OrderConnector.ts:14-17`) | Mock listesinden kaldır; süzgeç kalsın (DB `urls` temizlenene kadar). |
| K-20 | P2 | Paylaşımlı IP / 520 | Prod bot manager paylaşımlı çıkış IP'lerinde 520 verebiliyor [üçüncü taraf PR] | — | Railway/Render çıkış IP'si sabit değilse canlı turda gözlenmeli; docs/DEPLOYMENT notu. |

**Uyumlu olanlar (korunur).** Basic auth + çıplak `entegrasyonik` User-Agent (canlı doğrulandı; panelde kayıtlı entegratör adıyla eşleşmeli); listing yükleme
yolları ve küçük harf `merchantid`; katalog import JSON alanları (`merchantSku, VaryantGroupID, Barcode, UrunAdi, UrunAciklamasi, GarantiSuresi, kg,
tax_vat_rate, price "130,50", Image1..10`) ve `status/{trackingId}` ucu; OMS sipariş/paket/claim listeleme host'u; offset/limit sayfalama + `totalCount`.

**Özet.** HB'de ürün gönderiminin iskeleti doğru, ama kategori/öznitelik/marka kaynağı (K-4, K-5) ve import veri kaynağı (K-3) yanlış; finans ve soru
modülleri yanlış host/uçta (K-1, K-2); fatura ve iptal uçları dokümanda yok (K-6, K-7). Yerel ilk adım: `GET all-products-of-merchant` (1 sayfa),
`GET /transactions/merchantid` (1 ay), `GET /api/v1.0/issues?size=1` ve `GET /claims?limit=1` yanıtlarını (PII temizlenmiş) sözleşme fikstürü olarak
kaydetmek; K-3/K-1/K-2/K-9 düzeltmeleri bu fikstürlere göre yazılır. Yazma uçları (K-6, K-7, K-8, K-11, K-14) yalnız mock + SIT.

---

## Ek: Orkestratör için öne çıkan riskler ve doğrulanacaklar (kısa)
1. User-Agent biçimi: bare entegratör adı, panelde kayıtlı olmalı; `merchantId - ad` biçimi SIT'te reddedildi.
2. Host ayrımı: finans -> mpfinance-external, soru -> api-asktoseller-merchant, ürün -> mpop; hepsini oms-external'a yönlendirme 401/404 verir. `listing-external` yolunda küçük harf `merchantid`.
3. Marka: ID değil serbest metin `Marka`; markalar listesi API'si bulunamadı -> marka eşleme tablosu HB'ye değil kendi tarafımızda tutulmalı (HB doğrulamayı import sonucu/`validationResults` ile bildirir).
4. Fiyat import'ta virgüllü string ("130,50"); listing yanıtında number; Basic + JSON, ancak listing inventory-uploads XML mi JSON mı teyit edilmeli.
5. Katalog `productStatus` BÜYÜK_HARF zorunlu (yoksa 500); claims `limit` zorunlu; accounting sorgusu tanımlayıcı veya <=1 aylık tarih çifti ister.
6. Webhook var (12 olay, PUT, 5 sn 2xx); soru/finans için polling. HMAC imza doğrulaması belgelenmemiş -> kaynak IP/paylaşılan sır gibi ek önlem düşünülmeli.
7. Listing upload eşzamanlılığı <=5 bekleyen işlem [A]; check-product-status 500/sn/IP.
8. Doğrudan okunamayan resmî sayfalar (developers.hepsiburada.com) için yerelde (egress izinli ortam) şu raw spec'ler elle okunmalı: oms-external.json (kalem/sipariş şeması, CreatePackageRequest), mpop-catalog.json (öznitelik örnekleri), ve listing-external/docs.

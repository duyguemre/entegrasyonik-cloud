# Ideasoft Admin API - Araştırma Raporu

Tarih: 2026-10-03
Hazırlayan: dış araştırma uzmanı (yalnızca herkese açık sayfalar okundu; hiçbir mağaza API'sine istek atılmadı; sır/anahtar yok)

## ÖNEMLİ UYARI - Kaynak güvenilirliği

Resmi dokümantasyon sitesi `apidoc.ideasoft.dev` bu ortamdan ERİŞİLEMEDİ (ağ çıkış proxy'si engelledi). Resmi Ideasoft sayfaları
(`www.ideasoft.com.tr`) de ERİŞİLEMEDİ. Bu rapordaki teknik ayrıntıların büyük kısmı TÜM ÜÇÜNCÜ TARAF, açık kaynak bir depodan gelir:
`Turkmen87ai/IdeaSoftApiIntegration` (resmi SDK DEĞİL; README'si de "resmi SDK değildir" der). Depo, resmi Admin API OpenAPI
anlık görüntüsünü (`admin-swagger-prod.json`, "Ideashop API" v3.0.0) içeriyor; ancak bu dosya çok büyük olduğu için okuyucu araç
yalnızca ilk kısmını (alfabetik olarak `abandoned_carts` ... `blacklists`) gösterebildi. Ürün/sipariş/marka/kategori/webhook uç
şemalarının resmi OpenAPI'den DOĞRUDAN doğrulaması YAPILAMADI. Aşağıda her bulgunun yanında güvenilirlik etiketi var:

- [OAS] resmi OpenAPI anlık görüntüsünün okunabilen kısmından
- [DEPO] üçüncü taraf deponun README/docs/kaynak kodundan (resmî değil, yazarın kendi doğrulama iddiasına dayanır)
- [YARDIM] Ideasoft yardım sayfasının arama motoru özetinden (sayfanın kendisi ERİŞİLEMEDİ)
- [ÇIKARIM] yukarıdakilerden mantıksal çıkarım; DOĞRULANAMADI sayılmalı

## Erişim özeti

- Başarıyla okunan sayfa/dosya: 24 (hepsi GitHub: README, 4 docs/*.md [Admin-Store rehberi, Webhook, LLM haritası, MCP], `ideaSoftApi.md`,
  `admin-swagger-prod.json` [kısmi, ~ilk bölüm], C# modeller Product/Order/OrderItem/ProductImage/Brand/Category, `IdeaSoftOAuthClient.cs`,
  `AdminResourceClient.cs`, `IdeaSoftResponse.cs`, 5 dizin listeleme sayfası, 3 yan depo sayfası)
- Arama motoru özeti olarak görülen (sayfa okunmadı): Ideasoft Yardım "Api Kullanımı" sayfası, `apidoc.ideasoft.dev` ana sayfa kaydı
- ERİŞİLEMEDİ (11): apidoc.ideasoft.dev (3 farklı yol), apidoc.ideasoft.com.tr (eski alan adı), www.ideasoft.com.tr/yardim/api-kullanimi,
  www.ideasoft.com.tr/sayfa/apps-basvuru, web.archive.org, r.jina.ai, docs.iyzico.com, birfatura.com, webrazzi.com;
  GitHub API (403) ve GitHub kod araması (giriş gerekli)
- Hiçbir sürüm notu/changelog sayfası bulunamadı (bkz. bölüm 9)

## 1. Kimlik doğrulama (OAuth2)

- Akış: OAuth2 Authorization Code. Kaynak: https://github.com/Turkmen87ai/IdeaSoftApiIntegration (README) [DEPO]
- Uygulama kaydı (mağaza bazlı): Ideasoft yönetim paneli > Entegrasyonlar > API > "API Ekle"; "Adı" ve "Yönlendirme Adresi" (redirect URI)
  girilir; Kaydet sonrası Client ID ve Client Secret üretilir. Kaynak: https://www.ideasoft.com.tr/yardim/api-kullanimi/ [YARDIM, sayfa ERİŞİLEMEDİ; arama özeti]
  - Yani merkezi bir "geliştirici hesabı/uygulama" kaydı değil, HER MAĞAZA kendi panelinde istemci oluşturur [YARDIM/DEPO].
  - "Yalnızca yönetici kullanıcı ID 1 API bölümüne erişebilir ve düzenleyebilir" [DEPO README]. Müşterinin bu kullanıcıyla işlem yapması gerekir.
  - Yetkilendirme (izin): panelde API eklendikten sonra "İzin Yönetimi" bölümünden "Okuma" veya "Okuma/Yazma" seçilir [YARDIM].
  - Destek: apisupport@ideasoft.com.tr [YARDIM]
- Ideasoft App Store (Ideasoft Apps) mevcut: https://www.ideasoft.com.tr/ozellikler/entegrasyon-cozumleri/ ve
  https://www.ideasoft.com.tr/sayfa/apps-basvuru/ (başvuru sayfası var, içeriği ERİŞİLEMEDİ; geliştirici/OAuth gereksinimi DOĞRULANAMADI)
- Uç noktalar (mağaza alan adı üzerinde, `https://{magaza}.myideasoft.com`) [DEPO: IdeaSoftOAuthClient.cs, LLM_BILGI_HARITASI.md]:
  - Yetkilendirme: `GET {store}/panel/auth?client_id=...&response_type=code&state=...&redirect_uri=...`
    (DİKKAT: `/oauth/v2/auth` DEĞİL, `/panel/auth`)
  - Token: `POST {store}/oauth/v2/token`, `Content-Type: application/x-www-form-urlencoded`
    - code takası: `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`
    - yenileme: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`
  - Kullanım: `Authorization: Bearer <access_token>`
- Süreler [DEPO, "yaklaşık"]: yetkilendirme kodu ~30 sn; access token ~24 saat; refresh token ~2 ay. Her yenilemede YENİ refresh token döner;
  eskisi geçersiz sayılmalı (hemen yeni değeri kaydet). Resmi sayfadan DOĞRULANAMADI.
- Scope'lar: OpenAPI'de `<kaynak>_read / _create / _update / _delete` kalıbı görülüyor (örn. `order_read`, `order_create`, `order_update`,
  `banner_read/create/update/delete`, `payment_setting_read/update`, `abandoned_cart_read`) [OAS, kısmi]. Ürün/marka/kategori/webhook scope adları
  görünür bölümde yoktu: DOĞRULANAMADI. (`ideaSoftApi.md` türetilmiş metni `product_read`, `product_write` gibi adlar sayıyor ama bu, OAS'deki
  `_create/_update/_delete` kalıbıyla çelişiyor; güvenilmez.) Panelde izin yalnız "Okuma / Okuma-Yazma" olarak seçiliyor [YARDIM].
- Kimlik bilgisi türü: OAS iki şema tanımlıyor: `bearerAuth` ve `OAuth2` [OAS]. Client-credentials akışı için bulgu YOK; kullanıcı-yetkilendirmeli akış gerekli görünüyor.

## 2. Uç nokta envanteri

Genel [DEPO ADMIN_STORE_API_REHBERI.md, "son doğrulama 2 Ekim 2026" iddiası; bağımsız doğrulanamadı]:
- Admin API: `https://{magaza}.myideasoft.com/admin-api/...` - 903 işlem, 176 kaynak grubu (508 GET, 115 POST, 159 PUT, 121 DELETE).
- Store API: `https://{magaza}.myideasoft.com/api/...` - 333 işlem, 74 grup. Anonim değil, o da Bearer ister. Admin ile aynı ada sahip kaynakların
  şeması FARKLI olabilir; `admin-api` yerine `api` koyarak URL türetme.
- Kaynak adı -> yol adlandırması snake_case çoğul [OAS örnekleri: `abandoned_carts`, `billing_addresses`, `bddk_categories/update_remotely`,
  `client_webhooks`, `order_refund_requests`]. Yalnızca adı geçen kaynaklar için yol kesin; diğerleri [ÇIKARIM].
- Liste uçlarında ortak sorgu parametreleri [OAS, `/banners` örneği + gözlenen kalıp]: `page` (varsayılan 1, min 1), `limit` (varsayılan 20, min 1,
  MAX 100), `sort` (`id` artan, `-id` azalan), `id`, `ids` (virgüllü), `sinceId`, `q[...]`, `s`, ve tarih aralığı
  `startCreatedAt`, `endCreatedAt`, `startUpdatedAt`, `endUpdatedAt` (yyyy-mm-dd). Her kaynakta hepsinin bulunduğu DOĞRULANAMADI.
- Çoğu kaynakta `GET /{kaynak}/count` var [OAS: `/banks/count`, `/banners/count`...; DEPO istemcisi `/count` kullanıyor].
- Yanıt zarfı: liste mi dizi mi, toplam sayı başlığı var mı DOĞRULANAMADI (istemci yalnızca `/count` kullanıyor).
- Hata kodları [DEPO README tablosu]: 200/201/204; 400 yapı; 401 token yok/geçersiz; 403 yetki yetersiz; 404; 422 alan doğrulama; 429 hız sınırı;
  500/503. İstemci `ApiException` içinde hata kodu + `RequestId` taşıyor (başlık adı DOĞRULANAMADI).

Kaynak bazında:

| Alan | Bulgu | Etiket |
|---|---|---|
| products | GET /admin-api/products, GET /products/{id}, POST, PUT /{id}, DELETE /{id}. Ek: `PUT products/{id}/change_category` (gövde `{category: id}`). Admin Product 9 işlem (kategori / görüntüleme sırası güncelleme dahil). Listeleme filtreleri: `category`, `distributor`, `status`, `sinceId`, `startCreatedAt/endCreatedAt`, `q[...]`, `sort` | DEPO |
| varyant | `Option`, `OptionGroup` kaynak adları geçiyor (örn. beden/renk grubu + seçenek). Tam yollar (`/option_groups`? `/options`?), varyant başına sku/barkod/stok/fiyat alanları DOĞRULANAMADI. `product-detail`, `variant`, `optionValue` adlarına rastlanmadı | DEPO (yalnız isimler) |
| kategoriler | GET/POST /admin-api/categories, GET /categories/search_tree (ağaç arama). Üst kategori `parent` (nesne) ile. | DEPO |
| markalar | GET/POST /admin-api/brands, PUT/DELETE /brands/{id} | DEPO |
| görseller | `ProductImage` kaynağı (ürün görseli); `FileManager` kaynağı (dosya). Yol DOĞRULANAMADI | DEPO |
| fiyat / döviz | ürün alanları `price1`, `discount`, `discountType`, `taxIncluded`, `tax`; `Currency` kaynağı: GET /admin-api/currencies; `ProductPrice` kaynağı. price2/price3 vb. DOĞRULANAMADI | DEPO |
| stok | ürün `stockAmount` (decimal); stoğu ürün PUT ile güncelleme; `StockWarning` kaynağı (düşük stok uyarısı). Ayrı stok ucu yok/DOĞRULANAMADI | DEPO |
| müşteri | `Member` kaynağı (`/admin-api/members`); sipariş filtresi `member` | DEPO |
| siparişler | GET/POST /admin-api/orders, GET/PUT/DELETE /orders/{id}; filtreler `member`, `status`, `startCreatedAt/endCreatedAt`, `q[...]`. İlgili kaynaklar: `OrderItem`, `OrderDetail`, `OrderCustomTaxLine`, `OrderUserNote` | DEPO |
| sipariş durumu güncelleme | Ayrı "durum güncelle" ucu bulunamadı; `PUT /orders/{id}` ve scope `order_update` var. Hangi alanın (`status`) yazılabilir olduğu DOĞRULANAMADI | OAS (scope) + DOĞRULANAMADI |
| iade | VAR: `OrderRefundRequest` -> `/admin-api/order_refund_requests` (GET/POST/PUT/DELETE). Webhook'ta da konu var | DEPO + OAS (yol kalıbı) |
| fatura | VAR (kısmen): `GET /admin-api/invoices`, `PUT /invoices/{id}`; `InvoiceSetting` kaynağı. E-fatura kesme/gönderme yeteneği DOĞRULANAMADI | DEPO |
| finans | Admin API'de ayrı "finans/cari/hakediş" kaynağı bulgusu YOK (DOĞRULANAMADI; tam liste okunamadı). Ödeme: `payment_setting_*` scope, `Payment` webhook konusu mevcut | OAS/DEPO |
| mesajlar | Müşteri mesajı/soru-cevap kaynağı bulgusu YOK (DOĞRULANAMADI). Pazaryeri tarzı mesajlaşma uçları varsaymayın | - |
| webhooks | VAR: `/admin-api/client_webhooks` (bölüm 6) | DEPO |
| terk edilmiş sepet | `/abandoned_carts`, `/abandoned_orders`, `/active_carts` (+count) - ek iş değeri | OAS |

## 3. Alan ayrıntıları

Aşağıdaki alanlar üçüncü taraf C# modellerinden alınmıştır; modeller "yazarın ilgilendiği alt küme"dir, API tüm alanları dönmez/almaz
(modeller `[JsonExtensionData]` ile bilinmeyen alanları da yakalıyor). Resmi şema DOĞRULANAMADI.

Ürün (`Product.cs`) [DEPO]:
`id`(long), `name`, `fullName`, `slug`, `sku`, `barcode`, `stockAmount`(decimal), `price1`(decimal), `discount`(decimal), `discountType`(int),
`taxIncluded`(int, 0/1 gibi), `tax`(int, KDV oranı), `status`(int, 1=aktif varsayımı DOĞRULANAMADI), `shortDetails`, `pageTitle`, `metaDescription`,
`metaKeywords`, `canonicalUrl`, `categories`(Category[]), `images`(ProductImage[]), `createdAt`, `updatedAt`.
- İstenen alanlardan MODELDE YOK / DOĞRULANAMADI: `brand{id,name}` (ürün-marka ilişki alanı modelde yok), `currency` (ürün düzeyi), `detail`
  (uzun açıklama alanı; `shortDetails` var, HTML'li uzun açıklama alan adı DOĞRULANAMADI), varyant alanları.
Görsel (`ProductImage.cs`): `id`, `filename`, `extension`, `sortOrder`, `thumbUrl`, `originalUrl`, `attachment`(string).
Kategori (`Category.cs`): `id`, `name`, `slug`, `sortOrder`, `status`, `imageFile`, `imageUrl`, `attachment`, `showcaseContent`,
`showcaseFooterContent`, `pageTitle`, `metaDescription`, `metaKeywords`, `parent`(Category nesnesi), `createdAt`.
Marka (`Brand.cs`): `id`, `name`, `slug`, `status`, `sortOrder`, `imageUrl`, `attachment`, `showcaseContent`, `showcaseFooterContent`.
Sipariş (`Order.cs`): `id`, `transactionId`, `customerFirstname`, `customerSurname`, `customerEmail`, `customerPhone`, `status`(STRING),
`paymentStatus`(STRING), `paymentTypeName`, `currency`(string), `generalAmount`, `finalAmount`, `shippingAmount`, `shippingProviderName`,
`shippingTrackingCode`, `orderItems`(OrderItem[]), `createdAt`, `updatedAt`.
- İstenen `orderNumber`, `customer{}`, `shippingAddress{}`, `totalAmount` adları modelde YOK; müşteri alanları düz (`customerFirstname`...),
  toplam `generalAmount/finalAmount`. Adres alanları (teslimat/fatura) DOĞRULANAMADI (`billing_addresses` kaynağı var [OAS]).
- `status`/`paymentStatus` olası değer listesi DOĞRULANAMADI (kod karşılaştırması için resmî enum alınmalı).
Sipariş kalemi (`OrderItem.cs`): `id`, `productName`, `productSku`, `productBarcode`, `productPrice`, `productCurrency`, `productQuantity`(decimal),
`productTax`, `productDiscount`, `discount`.

## 4. Veri tipi / format

- Tarih alanları (`createdAt`, `updatedAt`): istemci `DateTimeOffset` kullanıyor -> saat dilimli ISO 8601 beklenir; kesin biçim/dilimi DOĞRULANAMADI [ÇIKARIM].
- Filtre tarihleri: `yyyy-mm-dd` (string/date) [OAS özeti]; saat bileşeni desteği DOĞRULANAMADI.
- Para: `decimal`; kur kodu string (`currency`, `productCurrency`). Ondalık hane sayısı, kod biçimi ("TRY"/"TL") DOĞRULANAMADI.
  KDV: `tax` tam sayı, `taxIncluded` bayrağı (fiyat KDV dahil mi) - fiyat eşlemesinde kritik.
- Stok `decimal` (kesirli stok olabilir).
- sku/barkod uzunluk sınırları DOĞRULANAMADI. Doğrulama hatası 422 döner [DEPO].
- Görsel yükleme: modelde `attachment` (string) alanı var; base64 mi, URL mi DOĞRULANAMADI. Yanıtta `thumbUrl/originalUrl` URL olarak döner.
  `FileManager` kaynağı da var. Tahminle ilerlemeyin; kanıtlayıcı ilk test bir test mağazada yapılmalı.
- Açıklama HTML: `shortDetails`, `showcaseContent` gibi alanlar HTML bekler görünüyor (vitrin içeriği); DOĞRULANAMADI.

## 5. İstek limitleri

- Sayısal rate limit (dakika/saat) DOĞRULANAMADI; resmi sayfada bulunamadı. `ideaSoftApi.md`: "belgelenmemiş". HTTP 429 dönüyor [DEPO].
- Öneri (varsayım değil, savunmacı tasarım): 429/502/503/504'te üstel geri çekilme; POST'u otomatik yeniden deneme (çift kayıt riski) [DEPO önerisi].
- Sayfalama: `limit` en çok 100, varsayılan 20 [OAS `/banners`; "çoğu liste uçunda" kalıbı]. Yani 100'lük sayfalarla tarama.
  Büyük kataloglarda `sinceId` + `sort=id` ile artımlı tarama mümkün görünüyor [OAS parametre adı].

## 6. Webhook / bildirim

Kaynak: https://github.com/Turkmen87ai/IdeaSoftApiIntegration (docs/WEBHOOK_REHBERI.md) [DEPO]; resmi sayfa (apidoc.ideasoft.dev/docs/webhooks/...) ERİŞİLEMEDİ.
- VAR. Abonelik yönetimi: `POST/GET /admin-api/client_webhooks`, `PUT/DELETE /admin-api/client_webhooks/{id}`; alanlar `topic`, `address`
  (yalnızca HTTPS), `status` (1 aktif / 0 pasif).
- 41 konu: `product/create|update|delete`, `order/create|update|delete`, `member/create|update|delete`; ayrıca Brand, Category, Member Group,
  Order Refund Request, Payment, Theme, Queue Process, Email List, Currency(3), Price Rule, Contract(2), Extra Preference.
- İmza: başlık `X-Ideashop-Hmac-Sha256` = Base64(HMAC-SHA256(ham gövde, client secret)). Ham gövde üzerinde doğrula (JSON ayrıştırmadan önce).
- Alıcı 10 sn içinde HTTP 200 dönmeli. Yeniden deneme sayısı/takvimi, sıra garantisi, benzersiz olay kimliği BELGELENMEMİŞ; tükenen yeniden
  denemelerden sonra abonelik OTOMATİK SİLİNEBİLİR -> abonelikleri periyodik denetle. Çift/sırasız teslime karşı idempotent tasarla; `update`
  olaylarında yalnız değişen alanlar gelir, eski zaman damgasında API'den tazele.
- Entegrasyonik için: webhook varsa bile sağlayıcı sorunlarına karşı periyodik "updatedAt/sinceId" taraması gerekir (güvenilirlik garantisi yok).

## 7. Test ortamı

- Genel sandbox/demo API ortamı bulgusu YOK (DOĞRULANAMADI). API her mağazanın kendi alan adında ve kendi panel istemcisiyle çalışır.
  Deponun önerisi: "canlı olmayan/pasif mağazada" deneyin; yazma öncesi yedek alın [DEPO]. Test için bir Ideasoft deneme/demo mağazası
  (Ideasoft'tan talep) gerekir; bunun koşulları DOĞRULANAMADI. apisupport@ideasoft.com.tr ile teyit edilmeli.

## 8. Okuma gibi görünüp durum değiştiren uçlar

- Bulgu yok (DOĞRULANAMADI; tam uç listesi okunamadı). Dikkat edilecekler:
  - `PUT /bddk_categories/update_remotely` [OAS]: adı "uzaktan güncelle" - tetikleyici uç, okuma değil.
  - `PUT products/{id}/change_category` [DEPO]: özel işlem ucu (bir ürünün kategorisini değiştirir).
  - Token yenileme: her `refresh_token` çağrısı eski refresh token'ı tüketir (yan etki); eşzamanlı iki işçi yenilerse biri geçersiz token ile kalır -> tek noktadan kilitle.

## 9. Kullanımdan kaldırma / sürüm notları (2024-2026)

- Resmi changelog/sürüm notu sayfası bulunamadı/ERİŞİLEMEDİ. OpenAPI başlığı: "Ideashop API", sürüm 3.0.0 [OAS].
- Eski alan adı `apidoc.ideasoft.com.tr` artık `apidoc.ideasoft.dev`'e taşınmış görünüyor (eski SwaggerHub tabanlı üretilmiş istemciler, 5 commit,
  güncel değil: https://github.com/ceymishetfild/ideasoft-api-client-libraries) -> eski SwaggerHub şemalarına dayanma.
- Webhook'ta "V8" ile bazı alanların kaldırıldığı not edilmiş ("Webhook fields removed in V8: yeni aboneliklerde ekleme") [DEPO LLM_BILGI_HARITASI.md]; "V8"in
  neyi ifade ettiği (webhook şema sürümü?) DOĞRULANAMADI.
- Depo yazarı, yerel enum'unda 32 webhook konusu, canlı API'de 41 değer olduğunu not ediyor -> konu listesi zamanla genişlemiş; yerel listelere değil
  canlı uç sözleşmesine güven.
- Mevcut (en güncel) sürüm olarak 2026-10 itibarıyla `/admin-api` yolunda sürüm öneki YOK (v1/v2 yok) [OAS sunucu URL'si]; sürüm geçişi duyurusu bulunamadı.

## 10. Marka (brand) analizi

- Marka bir KAYNAKTIR: `/admin-api/brands` (GET/POST/PUT/DELETE; alanlar `id`, `name`, `slug`, `status`...) [DEPO]. Webhook'ta Brand konusu var.
- Ürün gönderiminde marka id zorunlu mu: DOĞRULANAMADI. C# `Product` modelinde marka alanı yok (alt küme olabilir); resmi şema okunamadı.
  Bu nedenle ürünün markasının `brand: {id}` nesnesiyle mi, ad ile mi bağlanacağı kanıtlanamadı.
- Pratik sonuç (ÇIKARIM, DOĞRULANAMADI): marka ayrı varlık olduğundan ürün-marka bağı büyük olasılıkla marka id'si üzerinden kurulur. Pazaryerlerindeki
  (Trendyol vb.) hazır marka listesinden FARKLI olarak Ideasoft'ta markayı mağaza sahibi kendi oluşturur (POST /brands mevcut).
  Entegrasyonik'te önerilen model: "marka eşlemesi" Ideasoft için zorunlu bir pazaryeri-marka-kataloğu eşlemesi DEĞİL, bir "bul-veya-oluştur" adımı
  olabilir: GET /brands (ad ile q/s filtresi, DOĞRULANAMADI) -> yoksa POST /brands -> dönen id'yi ürüne bağla. Bu, ilk canlı/test mağaza denemesiyle
  doğrulanmadan koda dökülmemeli.

## 11. Özet tablo

| Uç / konu | Durum | Kaynak |
|---|---|---|
| OAuth2 authorize `/panel/auth` | güncel görünüyor (üçüncü taraf) | https://github.com/Turkmen87ai/IdeaSoftApiIntegration |
| OAuth2 token `POST /oauth/v2/token` | güncel görünüyor (üçüncü taraf) | aynı depo (IdeaSoftOAuthClient.cs) |
| Token süreleri (24s / 2 ay) | doğrulanamadı (yaklaşık) | aynı depo README |
| API uygulaması panelden oluşturma | güncel (yardım sayfası özeti) | https://www.ideasoft.com.tr/yardim/api-kullanimi/ (ERİŞİLEMEDİ, arama özeti) |
| Scope adları | kısmen güncel (order_*, banner_*...); ürün/marka scope'u doğrulanamadı | https://raw.githubusercontent.com/Turkmen87ai/IdeaSoftApiIntegration/main/admin-swagger-prod.json |
| `/admin-api/products` CRUD | güncel görünüyor | https://raw.githubusercontent.com/Turkmen87ai/IdeaSoftApiIntegration/main/ideaSoftApi.md |
| `PUT products/{id}/change_category` | güncel görünüyor | aynı depo README |
| Varyant (Option/OptionGroup) uçları | doğrulanamadı (yalnız isim) | ideaSoftApi.md |
| `/categories`, `/categories/search_tree` | güncel görünüyor | ideaSoftApi.md |
| `/brands` CRUD | güncel görünüyor | ideaSoftApi.md |
| Ürün görseli yükleme biçimi | doğrulanamadı | ProductImage.cs |
| `/orders` (GET/PUT...) | güncel görünüyor | ideaSoftApi.md |
| Sipariş durumu enum'u | doğrulanamadı | Order.cs (string) |
| `/order_refund_requests` | güncel görünüyor | ideaSoftApi.md |
| `/invoices` | güncel görünüyor (kısmi) | ideaSoftApi.md |
| Finans / mesajlar uçları | bulgu yok / doğrulanamadı | - |
| `/client_webhooks` + 41 konu | güncel görünüyor | https://raw.githubusercontent.com/Turkmen87ai/IdeaSoftApiIntegration/main/docs/WEBHOOK_REHBERI.md |
| Webhook imzası `X-Ideashop-Hmac-Sha256` | güncel görünüyor | aynı |
| Rate limit sayısı | doğrulanamadı (429 var) | README hata tablosu |
| Sayfalama limit<=100 | güncel (OpenAPI) | admin-swagger-prod.json (`/banners`) |
| Test/sandbox ortamı | doğrulanamadı | - |
| Resmi dokümantasyon (apidoc.ideasoft.dev) | ERİŞİLEMEDİ | https://apidoc.ideasoft.dev/ |
| Store API (`/api`) | farklı sözleşme; entegrasyon için Admin API öncelikli | https://raw.githubusercontent.com/Turkmen87ai/IdeaSoftApiIntegration/main/docs/ADMIN_STORE_API_REHBERI.md |

## Öneri / sonraki adım (gerçek doğrulama için)

1. apidoc.ideasoft.dev sayfalarını (Products, Brands, Orders, Variants, Webhooks, Authentication) erişimi olan bir ortamdan okuyup bu rapordaki
   "DOĞRULANAMADI" satırlarını kapatın; özellikle: marka alanı, varyant uçları, görsel yükleme biçimi, sipariş status enum'u, `updatedAt` filtresi, rate limit.
2. `admin-swagger-prod.json` dosyasını yerelde tam olarak indirip (yalnızca bu depodan, herkese açık) şemaları kontrol edin; dosya büyük olduğundan
   bu araştırma yalnızca ilk bölümü okuyabildi.
3. Test için Ideasoft'tan demo/test mağaza ve API izni talebi (apisupport@ideasoft.com.tr).

## Kod karşılaştırması

(orkestratör tarafından doldurulacak)

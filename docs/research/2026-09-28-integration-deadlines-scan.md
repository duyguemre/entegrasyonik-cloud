# Entegrasyon Takvim Taraması (120 gün: 2026-09-28 -> 2027-01-26)

Tarih: 2026-09-28. Bu, ileride kurulacak API-değişim izleme ajanının (ADR-0018) ELLE yapılmış ilk taramasıdır. Kod yazılmadı.

Kanıt sınıfı: **A** = sayfa doğrudan çekildi, **B** = arama özeti, **C** = 3. taraf. "Kaynak bulunamadı" = resmi kaynak bulunamadı veya erişilemedi (nedeni belirtilir).
Etkilenme: "Evet" = kodumuzda kullandığımız uç nokta/alan; "Dolaylı" = yalnız veri/şema; "Hayır"; "Doğrulanamadı".
Öncelik: P0 (kırılma/veri bütünlüğü, <30 gün), P1, P2, P3.

Kapsam notu: Trendyol için ayrıntılı spesifikasyon `docs/research/2026-09-28-trendyol-v2-migration-spec.md` dosyasındadır; burada yalnız takvim özeti var.

---

## 1. Özet takvim (120 gün penceresi)

| Tarih | Platform | Değişiklik | Etkilenme | Öncelik | Kanıt |
|---|---|---|---|---|---|
| 14.09.2026 (geçmiş, etkin) | Trendyol | Ürün servisleri oran limitleri listeleme kapasitesine göre kademeli (yazma grubu 200-600/dk, stok-fiyat 350-2000/dk, okuma 1000-2000/dk, barkod başına fiyat 30/dk) | Evet (`Service.ts` ratePerMin 1800) | P1 | A |
| 23.09.2026 (geçmiş, etkin) | Trendyol | İade red sebepleri: 6 kod kaldırıldı (251, 1701, 1751, 2201, 2001, 2151), 3 yeni (2077-2079) | Evet (red sebebi akışı) | P1 | A |
| 09.09.2026 (geçmiş) | Trendyol | `paymentMethod` alanı eklendi (paket + webhook) | Dolaylı (geriye uyumlu) | P3 | A |
| **15.10.2026** | Trendyol | Sipariş V1 (`.../orders`) kapanır; o tarihe kadar günde 3x10 dk HTTP 426; Sipariş V2: 10.000 kayıt tavanı | **Evet** (`orderListUrl` DB'de V1) | **P0** | A |
| **15.10.2026** | Trendyol | Ürün V1 servisleri kapanır (aktarma, güncelleme PUT, filtreleme, kategori-özellik V1, ...) ; Ürün V2 zorunlu | **Evet** (transferUrl, productListUrl, categoryAttributeListUrl, UPDATE=PUT) | **P0** | A |
| **23.10.2026** | Trendyol | `origin` alanı zorunlu (attribute altı opsiyonel) | **Evet** (biz `origin` göndermiyoruz) | **P0** | A |
| 02.11.2026 | GİB e-Belge | e-Döviz ve Kıymetli Maden Alım Satım Belgesi paketi yürürlük (duyuru 25.09.2026) | Hayır (planlı e-fatura sağlayıcısı için izleme) | P3 | A (özet) |
| **01.01.2027** | GİB / VUK | Basit usul ve işletme hesabı mükellefleri dahil tüm faturalarda tutar sınırı olmadan e-Arşiv (VUK Genel Tebliği Sıra No 589, RG 31.12.2025) | Dolaylı: e-fatura sağlayıcı entegrasyonu talebi/zorunluluğu artar (kodda e-fatura entegrasyonu YOK, manuel) | P2 | B/C |
| Tarih yok | Trendyol | getShipmentPackages veri kapsamı "son 1 ay" ile kısıtlanacak; `attributes` altı menşe ileride kaldırılacak (tarih "paylaşılacak") | Evet (izle) | P2 | A |
| Pencerede tarih yok | N11 | Yaklaşan kapanış/zorunluluk bulunamadı (son changelog 03.08.2026) | - | - | A |
| Pencerede tarih yok | Hepsiburada, Pazarama, Ideasoft, Bizimhesap, kargo firmaları | Kaynak bulunamadı / erişilemedi | Doğrulanamadı | - | - |

---

## 2. Trendyol (referans; ayrıntı ayrı dokümanda)

Kaynak: https://developers.trendyol.com/v2.0/changelog/changelog (A), https://developers.trendyol.com/docs/1-servis-limitleri (A).
Yukarıdaki tabloya ek: 08.09.2026 ve 02.09.2026'da sipariş paketi çekme + webhook kesintileri (manuel yeniden sorgu gerekti); 31.07.2026 Trendyol Luxe kanalı (`channelId` 25, CORE/LUXE `channels`, LUXE marka doğrulaması); 17.08.2026 `fastDeliveryType` kaldırıldı (`deliveryDuration` 0 = aynı gün, 1 = ertesi gün); 02.06.2026 Stream servisi + getShipmentPackages 10.000 tavanı (08.06.2026'da yürürlük, aşımda 429).

---

## 3. N11

Resmi kaynak: https://developer.n11.com/documentation/changelog/ (A, çekildi). `magazadestek.n11.com` sayfaları WebFetch'e 403 döndü (arama sonuçlarında başlıkları görüldü, B).

Changelog girdileri (A):

| Tarih | Değişiklik | Bizim etkilenme | Öncelik |
|---|---|---|---|
| 03.08.2026 | Sipariş listeleme (GetShipmentPackages) `deliveryAddressType` parametresi (KTN, EASYPOINT, PUP, null) | Dolaylı (yeni alan; teslim noktası siparişi ayrımı) | P3 |
| 08.06.2026 | E-ihracat: GetShipmentPackages ve SendInvoiceLink yeni alanlar (`countryCode`, `productOrigin`, `micro`, `hsCode`, `invoiceLink`, `invoiceDate`, `etgbNo`, `etgbDate`); **SendInvoiceLink ihracat siparişlerinde `invoiceDateTime` + `invoiceNumber` zorunlu** | Evet (fatura linki SOAP: `SellerInvoiceService`) yalnız ihracat siparişlerinde | P2 |
| 25.05.2026 | Paket bölme yanıtına `splitPackageOrderItems` | Dolaylı | P3 |
| 14.10.2025 | `tcId` alanı TCKN'siz müşteride boş döner (15.10.2025'ten itibaren; REST GetShipmentPackages + SOAP DetailedOrderList/OrderDetail/OrderList) | Evet (müşteri kimliği alanı) - geçmişte | P3 |
| 17.07.2025 | Kategori servisleri için API Key+Secret kimlik doğrulama 15.08.2025'ten itibaren zorunlu | Doğrulanamadı: kodumuz `cdn/categories` (REST) kullanıyor; kimlik başlığı gönderiliyor mu kontrol edilmeli | P2 |
| 25.01.2025 | **SOAP servisleri kapatıldı**: ProductSellingService, ProductStockService, ProductService'in ürün yönetimi metotları | **Evet olabilir**: INTEGRATIONS_REGISTRY §2.3'e göre SOAP `ProductService` (liste/kaydet/soru-cevap) kullanıyoruz; hangi metotların kapatıldığı changelog'da metot bazında belirtilmemiş -> doğrulanamadı, canlıda test gerekir | P1 |
| 25.12.2024 | Sipariş Listeleme/Onay/Bölme REST'e taşındı (paket bazlı) | Evet: sipariş çekme REST (`rest/delivery/v1/shipmentPackages`) öncelikli, SOAP yedek | - |

Diğer A bulguları:
- Sipariş listeleme: `GET https://api.n11.com/rest/delivery/v1/shipmentPackages`; appKey/appSecret başlık; `size` max 100; yalnız `startDate` -> 15 gün ileri, yalnız `endDate` -> 15 gün geri; **Kasım 2024 öncesi sipariş verisi verilmez**; oran limiti **1000 istek/dk** (`developer.n11.com/documentation/elements/siparis-listeleme-servisi/`). Bizim REST sipariş yolu `lastSyncTimestamp` kullanmıyor ve tek sayfa (Registry §2.3) -> 100'den fazla paket kaçabilir (mevcut sorun, takvimli değil).
- İade: `ReturnService` hâlâ **SOAP** (`https://api.n11.com/ws/ReturnService.wsdl`, 20 kayıt/sayfa, 6 metot); kapanış notu YOK (`developer.n11.com/documentation/iade-entgrasyonu/iade-talepleri-servisi/`).
- Pencerede SOAP kapanış tarihi: **kaynak bulunamadı** (resmi changelog'da ve çekilen 3. taraf makalede — nasistan.com, 14.05.2026, C — kapanış duyurusu yok). Bu bir "yok" kanıtı değil, "bulunamadı"dır.
- Risk: SOAP sipariş/iade/settlement/soru servisleri için REST karşılığı ve kapanış takvimi ayrıca izlenmeli. Öncelik P2 (izleme).

---

## 4. Hepsiburada

Resmi kaynaklar: https://developers.hepsiburada.com/hepsiburada/changelog (ReadMe tabanlı), referans sayfaları. **Tüm `developers.hepsiburada.com` sayfaları WebFetch'e 403 döndü** (changelog, getting-started, llms.txt, referans sayfaları). Aşağıdakiler yalnız arama özetlerinden (B):

| Bulgu | Tarih | Etkilenme | Öncelik | Kanıt |
|---|---|---|---|---|
| Sipariş entegrasyonu servislerinde oran limiti: SIT ve Prod'da 1000 istek/sn; aşımda 429; yanıt başlıkları `X-RateLimit-Remaining/-Limit/-Reset` | Tarih özetten çıkarılamadı (eski changelog Mayıs 2024'te 10.000 istek/10 sn diyor) | Evet (429 işleme; `Service.ts` yalnız 429'da bekliyor) | P3 | B |
| Listeleme entegrasyonunda kategori bazlı eşik değerlerine geçiş: fiyat güncellemesi eşiği aşarsa SKU kilitlenir; yeni hata mesajları; canlıda ortalama fiyat (en düşük/yüksek hariç) yüzdesel limit mekanizması | Tarih yok | Evet (fiyat güncelleme; yanlış fiyat -> SKU kilitleme riski) | P1 (doğruluk) | B |
| Entegratör "Servis Anahtarı" (12 karakter alfanümerik, satıcıya özel): yeni auth yapısı; Basic auth kullanıcı adı `User-Agent` başlığına taşındı, parola istekte kullanılmıyor; eski servisler Şubat 2024'te kapanacaktı | 2024 (geçmiş) | Evet olabilir: Registry §2.2 `USERNAME|APIKEY` / `PASSWORD|APISECRET` Basic auth diyor; yeni yapıya uyum doğrulanamadı | P1 | B |
| Komisyon Bilgisi Sorgulama servisi (50 SKU/istek, 240 istek/dk) | Ekim 2025 | Hayır (yeni özellik) | P3 | B |
| Genel not: 60-90 gün önceden bildirim, "typical" iddiası | - | - | - | C (doğrulanmadı) |

- 2026 tarihli, pencere içine düşen (28.09.2026-26.01.2027) bir kapanış/zorunluluk duyurusu: **kaynak bulunamadı** (resmi changelog erişilemedi; arama indeksinde en yeni changelog başlığı "Ekim 2025").
- 3. taraf (C, zunapro.com "2026 Edition"): host'lar `listing-external`, `oms-external`, `returns-external`, `mpop.../product/api/products`, `integration.hepsiburada.com/finance`; UA formatı `{MERCHANT_ID} - {AppName}`; makale 2026-2027 kapanışlarından söz etmiyor. Registry §2.2 sipariş yollarının `mpop` tabanında olduğunu doğrulayamamıştı; `oms-external` bilgisi bu doğrulamaya girdi olabilir (C).

---

## 5. Pazarama

- Resmi doküman: entegrasyon dokümanı PDF (https://cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf -> WebFetch 403; arama başlığı "Maximum Mobil API Entegrasyon Dokümanı", tarih 18.09.2023, B) ve satıcı paneli https://isortagim.pazarama.com/auth/integration (SPA; içerik alınamadı, A: yalnızca logo).
- Changelog/duyuru sayfası bulunamadı. Token süresi 1 saat (C: entegratör kılavuzları). Oran limiti değeri: bulunamadı (Registry §2.4 ile aynı sonuç).
- Pencere içi kapanış/zorunluluk: **kaynak bulunamadı**. Öncelik: izleme kanalı yok -> P2 (panel duyurusunu insan izlemeli).

---

## 6. Ideasoft

- Platform sürümleri: https://my.ideasoft.com.tr/versiyonlar (A): V8.4.3.2 (02.09.2026: altyapı/performans, e-posta altyapısı, abonelik yenileme fiyatı, Masterpass V2 alanları), V8.4.3.0 (02.07.2026: AI mağaza kurulumu, PayTR otomatik iade, Paycell, SMS, temalar...). API uç noktası/şema/kapanış notu YOK.
- Admin API dokümantasyonu: https://apidoc.ideasoft.dev/ (Stoplight SPA; içerik alınamadı, A) ve yardım sayfası https://www.ideasoft.com.tr/yardim/api-kullanimi/ (A; oluşturma 2024-10-08, son değişiklik 2026-07-23; oran limiti/kapanış yok; destek: apisupport@ideasoft.com.tr).
- Token: erişim 6 saat, yenileme 2 ay (B: arama özeti; sayfada doğrulanmadı).
- Pencere içi kapanış/zorunluluk/limit değişikliği: **kaynak bulunamadı**. Bizim durum: gerçek modda token akışı kopuk (Registry §3.1), yani API değişiminden önce bağlanma sorunu var (ayrı backlog).

---

## 7. Bizimhesap

- Kaynak: https://apidocs.bizimhesap.com/ (A; GitBook benzeri, `llms.txt` ve `.md` sürümleri var). Sayfa listesi (llms.txt, A): `master.md` (Genel Bilgiler), `addinvoice.md` (Sipariş/Fatura Ekleme), `products.md` (Ürün Listesi Alma), `warehouses.md` (Depoların Listesi Alma), `inventory.md` (Depo Stoğu Getirme). Changelog/sürüm/oran limiti/kimlik doğrulama detayı çekilen özetlerde YOK.
- **Önemli gözlem:** Resmi doküman listesinde sipariş OKUMA (listeleme) uç noktası görünmüyor; yalnız "Sipariş / Fatura Ekleme" (yazma). Bizim `OrderService.fetchOrders` (Registry §4.1) Trendyol benzeri sayfalama varsayan bir sipariş listesi okuyor -> resmi dokümanda karşılığı bulunamadı (mock'a dayanıyor olabilir). Öncelik P1 (doğruluk; "kaynak bulunamadı" ve "uç nokta belgede yok" ayrımı: yalnız 5 sayfalık dizin görüldü).
- 3. taraf (C): B2B ürün uç noktası `https://bizimhesap.com/api/b2b/products` (XML çıktı; github.com/tcgunel/bizimhesap-b2b).
- Pencere içi kapanış/zorunluluk: **kaynak bulunamadı**.

---

## 8. Kargo firmaları (planlı; kodda entegrasyon YOK)

- Yurtiçi, Aras, MNG, PTT, Sürat vb. için resmi API changelog/duyuru sayfası: **kaynak bulunamadı**. Arama sonuçları yalnız 3. taraf (C) entegratör rehberleri: çoğu firma SOAP/WSDL (2010'lar mimarisi), REST yeni; Aras için webhook desteği iddiası (C, doğrulanmadı).
- Pencere içi tarihli kapanış/zorunluluk: **kaynak bulunamadı**. Not: Trendyol tarafında kargo değişiklikleri (örn. Sendeo -> Kolay Gelsin, 30.12.2024; Aras Kargo takip kodu bildirme servisinin 12.05.2025 değişikliği, 30.06.2025 son tarih, A) pazaryeri kanalı üzerinden gelir; kargo firması API'sinden değil.

---

## 9. E-fatura sağlayıcıları / mevzuat (planlı; kodda entegrasyon YOK)

- **GİB e-Belge duyuruları** (A, özet, https://ebelge.gib.gov.tr/duyurular.html): 25.09.2026 e-Döviz ve Kıymetli Maden Alım Satım Belgesi paketi (yürürlük 02.11.2026); 18.09.2026 planlı bakım duyurusu; 15.09.2026 e-Gider Pusulası paketi; 24.08.2026 e-Fatura Paketi düzeltmesi (sürüm (29), 27.07.2026 yayınındaki eksikler); 11.08.2026 e-Arşiv paketi `earsiv.xsd` düzeltmesi (`earsiv_paket_v1.1_8.zip`); 12.01.2026 Yatırım Teşvik Belgesi kapsamında yeni fatura tipleri (`ISTISNA`, `YTBISTISNA`), UBL-TR 1.2.1 paketi; 09.01.2026 İDİS teknik kılavuzu (son tarih 02.02.2026). Etkilenme: e-fatura sağlayıcı seçimi/şema izleme için girdi; kodda etki yok. Öncelik P3.
- **1 Ocak 2027:** VUK Genel Tebliği Sıra No 589 (RG 31.12.2025) ile basit usul ve işletme hesabı mükellefleri için 3.000 TL altı kâğıt fatura istisnası biter; tutar sınırı olmadan e-Arşiv zorunlu (B: gib.gov.tr/resmigazete sonuçlarına dayalı arama özeti; C: parasut.com blog 27.06.2026/30.07.2026, edonustur.com). Bilanço esasına tabi mükellefler için 01.01.2026'dan beri zaten tutar sınırı yok. İnternet satışları tutardan bağımsız e-Arşiv (C). Not: bir TÜRMOB sayfası çekildi ama özeti (3.000.000/650.000 TL ciro grupları) diğer kaynaklarla uyuşmadı -> güvenilmez sayıldı; resmi Tebliğ metni (gib.gov.tr / Resmi Gazete 31.12.2025) doğrudan çekilemedi, insan/hukuk doğrulaması gerekir.
  Etkilenme: Entegrasyonik'in manuel fatura akışı (Registry §5.2, `hasIntegratedProvider=false`) müşterilere yasal baskı altında yetersiz kalabilir; e-fatura sağlayıcı entegrasyonu talebi Ocak 2027'de artacak. Öncelik P2 (iş değeri; BACKLOG'a "planned" olarak eklenmesi önerilir).
- e-Logo, Turkcell e-Şirket, Trendyol e-Faturam sağlayıcı API duyuruları: **kaynak bulunamadı** (taranmadı; yalnız isimleri Registry'de).

---

## 10. İzlenebilir kaynaklar (ADR-0018 için)

| Platform | Kaynak URL | Biçim | Gözlenen güncellenme sıklığı | İzleme notu |
|---|---|---|---|---|
| Trendyol | https://developers.trendyol.com/v2.0/changelog/changelog | HTML (yıl bazlı, sayfa içinde tarihli girdiler; Türkçe) | 2026'da en az 8 girdi: 02.06, 21.07, 30.07, 31.07, 17.08, 02.09, 08.09, 09.09, 23.09 (yaklaşık haftalık-2 haftalık) | ham metin diff; LLM özeti çekimden çekime farklı çıkabiliyor (tarih/sıra tutarsızlıkları gözlendi). `https://developers.trendyol.com/changelog/changelog.md` BAYAT (2026 girdisi yok) — bunu izleme |
| Trendyol | https://developers.trendyol.com/llms.txt | Düz metin sayfa indeksi (başlık + `.md` URL'leri) | Yeni sayfa eklendikçe | yeni/silinen sayfa tespiti için ideal |
| Trendyol | herhangi bir `docs/...md` sayfası | Markdown; başında `updatedAt` zaman damgası (örn. limitler 2026-08-25, getShipmentPackages 2026-09-24, V1 sayfaları 2026-09-18, V2 endpoint listesi 2026-07-20, auth 2026-04-27, api-status 2026-02-03) | sayfaya göre değişken | `updatedAt` + içerik hash'i; kritik sayfalar: 1-servis-limitleri, sipariş çekme/stream, ürün-v2-api-endpoint, ürün-yaratma-v2, güncelleme v2 sayfaları, ürün-api-endpoint (V1 banner), hata kodları, webhook-model |
| Trendyol | https://developers.trendyol.com/docs/api-status.md | Durum sayfası (bileşen; biçim net değil) | - | RSS/feed doğrulanmadı |
| N11 | https://developer.n11.com/documentation/changelog/ | HTML, yıl gruplu tarihli girdiler (İngilizce/Türkçe karışık özet) | 2026'da 3 girdi (25.05, 08.06, 03.08); 2025'te 4 | RSS bulunmadı; sitemap: wp-sitemap-posts-manual_documentation-1.xml (WordPress) |
| N11 | https://developer.n11.com/documentation/elements/siparis-listeleme-servisi/ vb. | HTML dokümantasyon | - | oran limiti/parametre değişimi için sayfa hash'i |
| N11 | https://magazadestek.n11.com/ | HTML | - | WebFetch 403 (bot koruması) — izleme ajanı farklı istemci/başlık gerektirebilir |
| Hepsiburada | https://developers.hepsiburada.com/hepsiburada/changelog (ve `?page=2`) | ReadMe tabanlı changelog; aylık başlıklar "Hepsiburada Entegrasyon- {Ay} {Yıl}" (arama indeksinde Eylül 2022, Ocak/Şubat 2023, Ocak/Mayıs/Ağustos 2024, Ocak/Mart/Ekim 2025 görüldü) | yaklaşık aylık-iki aylık | Tüm hepsiburada developer sayfaları WebFetch'e **403**; izleme ajanı tarayıcı benzeri istemci/ReadMe API ile denenmeli; erişilene dek "izlenemiyor" işaretlenmeli |
| Pazarama | https://isortagim.pazarama.com/auth/integration ; PDF: https://cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf | SPA (giriş gerekebilir); PDF 403 | bilinmiyor (dokümanın son bilinen tarihi 18.09.2023) | otomatik izlenebilir kaynak bulunamadı; PDF URL'sinin tarih içeren adı yeni sürümde değişebilir |
| Ideasoft | https://my.ideasoft.com.tr/versiyonlar | HTML sürüm listesi (V8.x.x.x + tarih) | 2026'da 02.07 ve 02.09 görüldü (~2 ayda bir) | platform sürümü; API değişikliği ayrıca belirtilmiyor |
| Ideasoft | https://apidoc.ideasoft.dev/ | Stoplight (SPA; içerik çekilemedi) | bilinmiyor | statik olarak izlenemedi; Stoplight'ın OpenAPI çıktısı varsa onu izlemek daha iyi olur (doğrulanmadı) |
| Ideasoft | https://www.ideasoft.com.tr/yardim/api-kullanimi/ | HTML | son değişiklik 2026-07-23 (sayfa üstbilgisi) | sayfa hash'i |
| Bizimhesap | https://apidocs.bizimhesap.com/llms.txt (+ `.md` sayfaları: master, addinvoice, products, warehouses, inventory) | Markdown + indeks (GitBook benzeri) | changelog yok; 5 sayfa | sayfa hash'i; yeni sayfa eklenirse llms.txt farkı |
| GİB e-Belge | https://ebelge.gib.gov.tr/duyurular.html | HTML duyuru listesi (tarih + başlık) | 2026'da çok sık (Ağustos'ta 2, Eylül'de 3 duyuru) | e-fatura sağlayıcı planı için |
| GİB mevzuat | https://www.gib.gov.tr/duyuru-arsivi/guncel/... ve Resmi Gazete | HTML/PDF | - | tebliğ yayınları; yasal doğrulama |

Genel izleme önerileri (gözlem):
1. Resmi sayfalar LLM ile özetlenince sayı/tarih hatası riski var (bu taramada aynı Trendyol girdisinin iki çekimde farklı tarih göstermesi, "08.12.2025/2024" ve "07.01/08.01.2025" tutarsızlığı gözlendi). İzleme ajanı ham metin saklayıp yalnız DEĞİŞEN paragrafı özetlemeli.
2. `updatedAt` zaman damgası (Trendyol `.md`) ucuz ve güvenilir bir "değişti" sinyali; ama içerik değişmeden de güncellenebilir -> hash ile birlikte kullanılmalı.
3. Hepsiburada ve N11 destek sitesi için bot koruması (403) var; izleme ajanının bunlar için ayrı istemci stratejisi (insan doğrulaması, e-posta/panel duyurusu aboneliği) gerekir.
4. Pazaryeri panelleri içi duyurular (Trendyol/HB/N11/Pazarama satıcı panelleri, e-posta) izlenebilir web kaynağı değil; bu bir kör noktadır.

---

## 11. Doğrulanamayanlar

- Hepsiburada 2026 changelog içeriği (403); Pazarama tüm resmi kaynaklar (403/SPA); kargo firmalarının resmi duyuruları; Ideasoft API şeması/limitleri; Bizimhesap kimlik doğrulama/oran limiti/sipariş listeleme uç noktası.
- N11 SOAP servislerinin tam listesi ve hangilerinin kapandığı (yalnız 25.01.2025 girdisinin metot listesi genel).
- VUK 589 metninin resmi kaynaktan doğrudan doğrulaması (B/C'ye dayanıyor).
- Trendyol dışı hiçbir platformda pencere içinde (28.09.2026-26.01.2027) TARİHLİ bir kapanış/zorunluluk bulunamadı; bu "yok" anlamına gelmez, erişilemeyen kaynaklar nedeniyle "bulunamadı"dır.

---

## Kaynaklar

- Trendyol: https://developers.trendyol.com/v2.0/changelog/changelog , https://developers.trendyol.com/llms.txt , https://developers.trendyol.com/docs/1-servis-limitleri (A)
- N11: https://developer.n11.com/documentation/changelog/ , https://developer.n11.com/documentation/elements/siparis-listeleme-servisi/ , https://developer.n11.com/documentation/iade-entgrasyonu/iade-talepleri-servisi/ , https://developer.n11.com/ (A); https://nasistan.com/blog/n11-soap-api-entegrasyonu-2026-rehberi-ve-pratik-adimlar (C)
- Hepsiburada (B, arama özetleri; sayfalar 403): https://developers.hepsiburada.com/hepsiburada/reference/siparis-entegrasyonu-onemli-bilgiler , https://developers.hepsiburada.com/hepsiburada/reference/listing-bilgilerini-g%C3%BCncelleme-1 , https://developers.hepsiburada.com/hepsiburada/changelog/hepsiburada-entegrasyon-ekim-2025 , https://developers.hepsiburada.com/hepsiburada/docs/entegrat%C3%B6re-servis-anahtar%C4%B1-eklemeg%C3%B6r%C3%BCnt%C3%BCleme ; (C) https://www.zunapro.com/turkey/en/blog/hepsiburada-integration-api-guide-seller-manual
- Pazarama: https://isortagim.pazarama.com/auth/integration (A, içeriksiz), https://cdn.pazarama.com/asset/entegrasyondokumani/APIEntegrasyonDokumani18.09.2023.pdf (B)
- Ideasoft: https://my.ideasoft.com.tr/versiyonlar , https://www.ideasoft.com.tr/yardim/api-kullanimi/ , https://apidoc.ideasoft.dev/ (A)
- Bizimhesap: https://apidocs.bizimhesap.com/ , https://apidocs.bizimhesap.com/llms.txt , https://apidocs.bizimhesap.com/master.md (A); https://github.com/tcgunel/bizimhesap-b2b (C)
- GİB: https://ebelge.gib.gov.tr/duyurular.html (A, özet); B: gib.gov.tr / resmigazete.gov.tr arama sonuçları (VUK 589); C: https://www.parasut.com/blog/e-fatura-ve-e-arsiv-zorunlulugu , https://edonustur.com/e-arsiv-fatura-zorunlulugu-kimler-icin-var/

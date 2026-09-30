# Ürün ekleme/düzenleme akışı: envanter, sorunlar, öneri (A6a — `productform`)

Tarih: 2026-09-30 · Kapsam: `ProductDefinitionView` (ekleme), `ProductUpdateView` (düzenleme) ve altındaki adım bileşenleri.
Yöntem: yalnız kod okuması (`frontend/src`, `backend/src` salt-okur) + Playwright ile alınan ekran görüntüleri.
Backend'de görülmeyen/doğrulanmayan hiçbir şey "var" diye yazılmadı; belirsiz olanlar "doğrulanmadı" diye işaretlidir.

Görüntüler (`frontend/docs/a6a-review/productform-<durum>-{before|after}-{1440|390}.png`):
`ekle-kategori`, `ekle-tanim`, `ekle-tekil`, `ekle-detay`, `ekle-eksikler` (kaydet öncesi eksikler), `duzenle-acilis`, `duzenle-tanim`, `kanal-fiyatlari`.

---

## 1. Mevcut durum (değişiklikten önce)

Akış: 4 adımlı `v-stepper` — **Kategori Seçimi → Ürün Tanımı → Tekil Ürün Bilgisi / Varyant Bilgileri → Detay Bilgiler**; Kaydet (düzenlemede Güncelle) düğmesi stepper başlığının sağında.

- **Kilitler** (`editable`): 2. adım kategori ister; 3. adım `title.length > 3` (+ varyantlıda `maincode`); 4. adım `title.length > 2`. Form kuralı ise başlık için 2–160 karakter der — üç eşik birbirini tutmuyordu.
- **Kaydet koşulu** (`isSaveDisabled`/`isUpdateDisabled`): `category && brand && variants.length>0 && her varyantta barcode+stockcode`. Neden kapalı olduğu hiçbir yerde yazmıyordu. Başlık, varyantlıda ana kod ve yinelenen kod bu koşulda yoktu; arka uç ise `Products.title` ve `Products.maincode` için `required`, `Variants.stockcode` için `required + unique`, `barcode` için `unique` diyor (bkz. §3).
- **Kaydetme uçları:** ekleme `ProductService/saveProduct` (gövde: `{ productInfo }`, `images` çıkarılır; tekil üründe `maincode` istemcide üretilir, `variants[0].images = images.map(url)`), düzenleme `ProductService/updateProduct` (`{ productInfo }`; sonra `retrieveProduct`'tan gelen ürünle form yenilenir). Gövde şekli `e2e/specs/product-form-bodies.spec.ts` ile sabitlenmiştir ve **değişmedi**.
- **Görsel dil:** `v-stepper` başlığı 390px'te taşıyordu: "Seçimi", "Tekil Ürün Bilgis…" kırpılıyor, **Kaydet düğmesi ekran dışında** kalıyordu (`ekle-eksikler-before-390.png`).

---

## 2. Alan envanteri

Kısaltmalar: **Form** = arayüzdeki doğrulama kuralı (`composables/formrules.ts`) / Kaydet koşulu; **AU** = arka uç (şema `required`/`unique`, servis, kanal dönüştürücüsü). `Kanal` sütunu: genel = kanaldan bağımsız ürün verisi.

### 2.1 Ürün düzeyi

| # | Etiket | Model yolu | Adım / bileşen | Kanal | Zorunluluk — Form | Zorunluluk — AU | AU'da nereye |
|---|---|---|---|---|---|---|---|
| 1 | Ürün kategorisi (yaprak) | `productInfoForm.category` | 1 · `CategorySelectBoxLevelComponent` | genel (kanal kategorisi buradan türer) | Kaydet koşulunda; klasör seçilirse `undefined` olur | şemada `required:false` | `ProductService.saveProduct/updateProduct` → `Products.category` (`$set`) |
| 2 | Ürün tipi (Tekil/Varyantlı) | `hasVariant` | 2 · `ProductInfoFormComponent` | genel | varsayılan Tekil; değişince `variants` sıfırlanır (ekleme) | şemada alan yok (`strict:false`); `updateProduct`: varyantlıda `stockcode/barcode = undefined`, tekilde `variants[0]`'dan | `Products.hasVariant` |
| 3 | Ana kod | `maincode` | 2 (yalnız varyantlı) | genel | `stockcodeRules`: zorunlu, 2–32, `maxlength 32` | `Products.maincode` `required + unique`; `Variants.maincode` `required` | `Products.maincode`; her varyanta `maincode` kopyalanır. Tekilde ekleme ekranı kayıtta üretir |
| 4 | Marka | `brand` | 2 · `BrandSelectBoxComponent` (`mandatory`) | genel (kanal marka eşleşmesi ayrı) | zorunlu; **bileşen ana markayı (yoksa ilk markayı) kendisi seçer** | `required:false` | `Products.brand` |
| 5 | Ürün Başlığı | `title` | 2 | genel; kanalda `platforms[kod].mapping.title` ile ezilebilir | `titleRules`: zorunlu, 2–160 | `Products.title` `required` | `Products.title` |
| 6 | Ürün açıklaması | `description` (HTML) | 2 · Quill | genel; kanalda `mapping.description` (arayüzü yok) | yok | `required:false` | `Products.description` |
| 7 | Resim galerisi | `images` (sunucuda `Images`, `tempId`/`_id` ile) | 2 · `ProductImagesComponent` | genel | yok | yok | `ImageService`; `saveProduct` gövdesinden `images` çıkarılır; `updateProduct` geçici resimleri kalıcıya kopyalar (`copyTempImages`) |
| 8 | Maksimum Satış Adedi | `maxPurchaseQuantity` | 4 · `ProductDetailsComponent` | genel | `length_0_16`, isteğe bağlı | şemada yok; dönüştürücülerde **okunmuyor** (grep) | `Products` (`strict:false`) |
| 9 | Kargo Süresi | `shippingDuration` | 4 | genel | isteğe bağlı | şemada yok; dönüştürücülerde **okunmuyor** | aynı |
| 10 | Desi | `desi` | 4 | genel; kanalda `mapping.desi` | isteğe bağlı | `Number`, varsayılan 0; Trendyol/Hepsiburada/Ideasoft okur | `Products.desi` |
| 11 | Garanti Süresi | `warranty` | 4 | genel; kanalda `mapping.warranty` | isteğe bağlı | **şema alanı `warrantyDuration`** (varsayılan 0); Hepsiburada/Ideasoft `product.warranty` okur | `Products.warranty` (şema dışı) |
| 12 | KDV | `taxPercentage` | 4 | genel; kanalda `mapping.taxPercentage` | 1–29 listesi | `Number`; tüm dönüştürücüler okur (varsayılan 20/18) | `Products.taxPercentage` |
| — | (gövdede giden, arayüzü olmayan) | `tempId`, `prices.{costPrice,price,salePrice,marketPrice,manuelPricesFlag,competitivePricesFlag,competitive}`, `stock`, `shelf`, `prepDuration`, `warrantyDuration`, `subtitle`, `invoiceTitle` | — | — | — | `prices` şemada `{minSalePrice,maxSalePrice}`; `saveProduct` sonunda `updateProductStockAndPrices` bunu varyantlardan yeniden yazar | — |

### 2.2 Varyant düzeyi — tekil ürün (`ProductSingleVariantComponent`, adım 3)

| # | Etiket | Model yolu | Kanal | Form | AU | AU'da nereye |
|---|---|---|---|---|---|---|
| 13 | Stok Kodu | `variants[0].stockcode` | genel | `titleRules` (zorunlu, 2–160) + Kaydet koşulu | `Variants.stockcode` `required + unique(sparse)` | `Variants.stockcode`; ürüne `stockcode` kopyalanır (tekil) |
| 14 | Barkod | `variants[0].barcode` | genel; Trendyol doğrulaması "Barkod eksik" der | `titleRules` + Kaydet koşulu | `unique(sparse)`, `required:false` | `Variants.barcode`; ürüne kopyalanır |
| 15 | Satış Fiyatı | `variants[0].prices.salePrice` | genel; Trendyol: `> 0` ve `≤ piyasa fiyatı` | `mandatoryRule` (0 geçer) | `prices.salePrice` `required`, varsayılan 0 | `Variants.prices` |
| 16 | Piyasa Fiyatı | `variants[0].prices.marketPrice` | genel | `mandatoryRule` (0 geçer) | `required`, varsayılan 0 | aynı |
| 17 | Platform Bazında Fiyat | `prices.isPlatformBasedPrice`; `platforms[kod].prices.{salePrice,marketPrice}` (`PlatformPriceComponent`) | pazaryerleri + e-ticaret | `mandatoryRule` (0 geçer) | dönüştürücüler `platforms[kod].prices \|\| prices` kullanır; ürün min/max fiyatı buradan hesaplanır | `Variants.platforms` |
| 18 | Stok Adedi | `variants[0].stock` | genel | **eski kural 2–160 karakter (yanlış)**; şimdi zorunlu + rakam | `default 0`; Trendyol: `< 0` reddedilir | `Variants.stock`; `Products.stock` toplam |
| 19 | Raf | `variants[0].shelf` | genel | isteğe bağlı (**eski kural zorunluydu**) | varyant şemasında yok (`strict:false`) | `Variants.shelf` |
| 20 | Ürün Özellikleri (düğme) | `variants[i].platforms[kod].attributes[özellikId] = { attributeName, attributeValue, attributeValueId }` | kanal-özel (Trendyol · Hepsiburada · N11 · Pazarama · Ideasoft) | kanal API'sinden gelen "Zorunlu" işareti; kaydı engellemez. Kayıtta `checkVariantAttributes` geçersiz değerleri siler | eksik zorunlu özellik kanal gönderiminde reddedilir (kanal API'si) | `Variants.platforms.<kod>.attributes` |

### 2.3 Varyantlı ürün (`ProductVariantsComponent` — okundu, dokunulmadı)

| # | Alan / işlem | Model yolu | Not |
|---|---|---|---|
| 21 | Varyant üretici | `variants[i].choices = [{ choiceId, choiceValueId }]` | kombinasyonlar kartezyen çarpımla; `variantHash` sunucuda (`maincode + choices`) — `unique` |
| 22 | Izgara satırı | `stockcode`, `barcode`, `prices.salePrice/marketPrice/isPlatformBasedPrice`, `stock`, `shelf`, `images` | Kaydet koşulu her satırda stok kodu + barkod ister |
| 23 | Toplu düzenleme | stok kodu/barkod üret; satış/piyasa fiyatı; platform bazlı fiyat; stok; raf; özellik; seçenek eşleştir; silme | `VariantService/batchProcessUpdate`, `batchProcessDelete` |
| 24 | Varyant resimleri | `variants[i].images` (URL listesi) | `ProductVariantImagesComponent` |
| 25 | Satır/ızgara kayıtları | `VariantService/updateVariants`, `addVariant`, `addVariants`, `deleteVariant` | Bu uçlar `Products` belgesindeki **gömülü `variants` dizisine** yazıyor; `ProductService` ise `Variants` koleksiyonuna yazıyor. Hangisinin canlı yol olduğu doğrulanmadı (bkz. B9) |

### 2.4 Kanal-özel varyant bilgileri (`platforms[kod].mapping.*`, "Ürün Özellikleri" penceresi — `platformInfos/**`, okundu, dokunulmadı)

Her kanal sekmesinde önce **genel** `VariantInfoComponent`, ardından kanala özel bileşen çıkar.

| Kanal | Alan (etiket) | Model | AU dönüştürücüsü okuyor mu? |
|---|---|---|---|
| Tüm kanallar (genel panel) | Variant Başlık | `mapping.title` (kural `length_0_16`, `maxlength 20`) | Trendyol · Hepsiburada · Pazarama okur |
| | Kargo Süresi | `mapping.shippingDuration` | okunmuyor (grep) |
| | Desi | `mapping.desi` | Trendyol · Hepsiburada okur |
| | Garanti Süresi | `mapping.warranty` | Hepsiburada okur |
| | Maksimum Satılabilir Adet | `mapping.maxPurchaseQuantity` | okunmuyor |
| | KDV | **`productInfoForm.taxPercentage`** (kanal panelinde ürün düzeyini yazar) | adaptörler `mapping.taxPercentage \|\| product.taxPercentage` okur; panel `mapping`'e yazmaz |
| Trendyol | Kargo Firması | `mapping.shippingId` | dönüştürücüde okunmuyor |
| | Teslimat Seçeneği | `mapping.fastDeliveryType` | yalnız eski davranış için yedek okunuyor; Trendyol Ağustos 2026'dan beri işlemiyor (kod yorumu) |
| | *(arayüzü yok)* | `mapping.origin`, `deliveryDuration`, `shipmentAddressId`, `returningAddressId`, `locationBasedDelivery`, `description` | **dönüştürücü okuyor**: menşe (2 harf) 23.10.2026'dan sonra zorunlu |
| Hepsiburada | *(boş bileşen)* | — | — |
| N11 | Ön Tanımlı Kargo Şablonu | `mapping.shippingId` | okunmuyor; dönüştürücüde `shipmentTemplate: 'Default'` sabit |
| Pazarama | Teslimat Şekli · Teslimat Şehirleri | `mapping.shippingId`, `mapping.cities` | okunmuyor |
| Ideasoft | Stok Tipi · Hediye Durumu · Kargo Ücreti | `mapping.stockTypeLabel`, `hasGift`, `customShippingCost` | dönüştürücü `variant.stockTypeLabel` / `product.stockTypeLabel` okur (`mapping` altındakini değil); `hasGift: 0` sabit; kargo ücreti okunmuyor |
| Bizimhesap | — (kanal-özel form bileşeni yok) | — | — |

Ulaşılamayan / ölü: `ProductCompetitivePricesComponent` (`isCompetitivePricesDialog` hiç `true` olmaz → `prices.competitive*` alanlarına arayüzden erişilemez); `CategoryNameComponent` yalnız `TEST.vue`'da kullanılır.

---

## 3. Sorunlar

| # | Sorun | Kanıt | Durum |
|---|---|---|---|
| S1 | **390px'te stepper kırpılıyor, Kaydet ekran dışında** | `ekle-eksikler-before-390.png` | Çözüldü (A1) |
| S2 | Kaydet'in neden kapalı olduğu söylenmiyor; koşul gizli | `isSaveDisabled` | Çözüldü (A3) |
| S3 | Gizli zorunlular: başlık (AU `required`), varyantlıda ana kod (AU `required+unique`), yinelenen stok kodu/barkod (AU `unique`) Kaydet koşulunda yoktu | Product.ts, Variant.ts | Çözüldü (A6) |
| S4 | Adım kilidi eşikleri tutarsız (kural ≥2, varyant adımı >3, detay >2) | iki görünümde `editable` | Çözüldü (A6) |
| S5 | Stok Adedi'ne 2–160 **karakter** kuralı: "5" gibi tek haneli stok hatalı görünüyordu; Raf "isteğe bağlı" denip zorunlu kurallıydı | `ProductSingleVariantComponent` | Çözüldü (A8) |
| S6 | Başlık/ana kod/stok kodu/barkod/raf `type="tel"` (mobilde sayısal klavye, harf girilemiyor) | aynı | Çözüldü (A8) |
| S7 | Marka sessizce ön seçili (`BrandSelectBoxComponent.onMounted`) | bileşen | Açıklama eklendi (A8); davranış B/karar |
| S8 | Kanal fiyat penceresi, kanal kaydı olmayan varyantta **boş açılıp hata bildirimi veriyor** (`platforms[kod].prices` okunurken) | `kanal-fiyatlari-before-1440.png` | Çözüldü (A7) |
| S9 | Kanal-özel alanlar karışık: genel panel her kanal sekmesinde; KDV kanal panelinde ürün düzeyini yazıyor; kanal başlığı 16/20 karakter; "Variant Başlık" yazımı; Hepsiburada paneli boş; kaydedilip dönüştürücüde okunmayan alanlar (§2.4); Trendyol menşe/teslimat süresi arayüzsüz, eski `fastDeliveryType` var | §2.4 | Öneri (A11, B6) — dosyalar kapsam dışı |
| S10 | Çift tıklamada çift istek koruması yok | `saveProduct` | Çözüldü (`isSaving`) |
| S11 | Hata geri bildirimi genel ("Bir şeyler ters gitti. Destek kodu…"); alan bilgisi yok | `kanal-fiyatlari-before` toast'ları | Öneri (B1) |
| S12 | Sıralama: kod/fiyat/stok tek kartta; "Detay" adımının isteğe bağlı olduğu yazmıyor; kanal bilgileri form akışının dışında bir pencerede | görüntüler | Kısmen (A8); kanal adımı önerisi |
| S13 | Form verisi tutulmuyor: `onDeactivated`/`destroy` formu sıfırlıyor (sekme kapanınca kayıp; sekme değiştirmede davranış doğrulanmadı) | görünümlerde `onDeactivated`, `destroy` | Öneri (A10) |
| S14 | `warranty` (arayüz, adaptörler) ↔ `warrantyDuration` (şema, ilk değer) adı tutarsız | Product.ts | B5 |

---

## 4. Öneri

### 4.1 Yapı

Sihirbaz numaralı adımlar + her adımda durum: **Tamam · N eksik · İsteğe bağlı · Kilitli**. Adım kilidinin nedeni odaklanabilir ve okunabilir olmalı. Üstte tek bir "zorunlu bilgiler x/y" ilerlemesi; Kaydet'in neden kapalı olduğu düğmeyle ilişkili tek cümle; "Eksikleri göster" ile kayıt öncesi kontrol + özet.

Önerilen bölüm sırası (bugünkü 4 adım korunur, 5. adım kanal verisi gelince eklenir):

1. **Kategori** — yaprak seçimi.
2. **Ürün tanımı** — Ürün tipi → Temel bilgiler (marka, başlık) → Resimler → Açıklama.
3. **Kodlar, fiyat ve stok** — tekilde Kod bilgileri → Fiyat → Stok; varyantlıda üretici + ızgara.
4. **Kanallar** *(öneri, henüz yok)* — her kanal katlanabilir bir bölüm: kanal işareti + "hazır / N eksik özellik" durumu; yalnız eksiği olan kanal açık gelir. Kanal başlığı, kargo, teslimat vb. burada; genel alanlar (KDV, desi) burada tekrarlanmaz.
5. **Detay** — isteğe bağlı (cümleyle belirtilir).

### 4.2 Kanal-özel alanların katlanması

Kanal alanları (fiyat, özellik, kanal bilgisi) tek desen: `EkPlatformMark` başlıklı katlanabilir bölüm, başlıkta özet (fiyat / eksik sayısı), gövdede alanlar. Genel ürün alanları kanal sekmesine karışmaz; kanalda "ezme" gerekiyorsa açıkça "Bu kanal için farklı başlık" gibi yazılır.

### 4.3 (A) Backend değişikliği GEREKTİRMEYEN

| # | Öneri | Durum |
|---|---|---|
| A1 | `v-stepper` yerine DS-v2 sihirbaz şeridi (`ProductFormWizardBar`): numara/onay + başlık + durum; 390px'te 4 sütun, kırpma yok | **Uygulandı** |
| A2 | Zorunlu bilgi ilerlemesi (x/y) + adım başına eksik sayısı — saf fonksiyonlar `useProductFormProgress.ts` (vitest ile) | **Uygulandı** |
| A3 | Kaydet/Güncelle'nin neden kapalı olduğunu söyleyen cümle; `aria-describedby` ile düğmeye bağlı | **Uygulandı** |
| A4 | "Eksikleri göster": eksik zorunlular + uyarılar + kayıt özeti; madde tıklanınca ilgili adıma gider ve alana odaklanır (`data-pf-field`) | **Uygulandı** |
| A5 | Geri / Devam altbilgisi (klavye + mobil ardışık gezinti); sonraki adım kilitliyse nedeni yazılı | **Uygulandı** |
| A6 | Gizli zorunlular Kaydet koşuluna: geçerli başlık, varyantlıda ana kod, yinelenen stok kodu/barkod; adım kilidi eşikleri tek kurala (başlık ≥2) | **Uygulandı** |
| A7 | Kanal fiyatları: katlanabilir kanal bölümleri (`EkPlatformMark`); kanal kaydı yoksa hata yerine "Fiyat gir" | **Uygulandı** |
| A8 | Alan düzeltmeleri: Stok Adedi sayı kuralı; Raf gerçekten isteğe bağlı; metin alanlarında `type="tel"` kaldırıldı; Detay adımı "tüm alanlar isteğe bağlı"; marka ön seçimi açıklaması | **Uygulandı** |
| A9 | Engellemeyen uyarılar: satış fiyatı 0 · satış > piyasa (Trendyol doğrulaması reddeder) · resim yok | **Uygulandı** |
| A10 | Taslak koruma (form verisini tarayıcıda tutma) | **Uygulanmadı — karar gerekli** (ürün verisi ticari veridir; ADR-0012 "form verisi yazılmaz" ilkesiyle çelişir). İstenirse: oturum başına, tenant+kullanıcı kapsamlı `sessionStorage`, kayıtta silinir |
| A11 | `platformInfos/**` düzeltmeleri: genel panelin yalnız kanala özel alanları göstermesi; KDV'nin kanal panelinden çıkarılması ya da `mapping.taxPercentage`'e yazması; kanal başlığı sınırının 16/20'den kalkması; "Variant Başlık" yazımı; Hepsiburada boş panelin kaldırılması; Trendyol için `origin` ve `deliveryDuration` alanları, eski `fastDeliveryType`'ın kaldırılması (backend zaten okuyor) | **Uygulanmadı — dosyalar bu görevin kapsamı dışı** (ana oturum) |
| A12 | Kanal başına "N zorunlu özellik eksik" göstergesi (mevcut `retrieveIntegrationCategoryChoices` verisiyle) ve sihirbazda Kanallar adımı | **Uygulanmadı** — `ProductVariantAttributesComponent` ve kategori-kanal eşleşme akışına bağlı |

### 4.4 (B) Backend GEREKTİREN (yalnız öneri)

| # | Gereken değişiklik | Kullanıcının vereceği karar |
|---|---|---|
| B1 | `saveProduct`/`updateProduct` doğrulama hatasında alan bazlı yanıt: `422 { errors: [{ field, code, message }] }` (title, maincode, stockcode, barcode, `variantHash` çakışması). Bugün istisna → genel hata bildirimi. Mesaj tablosu backend'den gelmeli | Hata kodları ve Türkçe metinlerin sahibi |
| B2 | Kayıt öncesi kod çakışması sorgusu: `checkCodes { stockcodes[], barcodes[], excludeProductId }` → çakışanlar. Bugün yinelenen kod (başka üründe) yalnız kayıtta `unique` dizini ile patlıyor | Kayıt anında engelleyici mi, uyarı mı |
| B3 | Kanal uygunluk ön kontrolü (salt-okur): taslak ürünü kanalın `validate()` kuralları ve zorunlu özellik/menşe kontrolleriyle değerlendirip kanal başına sonuç dönen uç | Kanal başına uyarı mı, kayıt engeli mi |
| B4 | Sunucu taraflı taslak (`tempId` zaten resim için var; form verisi yok) | Saklama süresi, tenant başına sınır, KVKK/gizlilik değerlendirmesi |
| B5 | `warranty` ↔ `warrantyDuration` (ve kullanılmayan `prepDuration`) adının tekleştirilmesi; şema + adaptörler + varsa veri taşıma | Kalıcı ad. **Veri taşıma DB'yi etkiler: yedek + insan onayı gerekir** |
| B6 | Kanal alanlarının gerçek kullanımı: `shippingId`/`cities` (Trendyol, N11, Pazarama), `hasGift`, `customShippingCost`, `stockTypeLabel` (Ideasoft `mapping` altında değil `variant/product` düzeyinde okunuyor), N11 `shipmentTemplate: 'Default'` sabit, `shippingDuration`/`maxPurchaseQuantity` | Her alan için: dönüştürücü okusun mu, yoksa arayüzden kaldırılsın mı |
| B7 | Kategori × kanal hazırlığı tek çağrıda: `CategoryService/getChannelReadiness { categoryId }` → kanal başına eşleşme durumu + zorunlu özellik sayısı (bugün kanal başına ayrı ayrı çekiliyor) | Kanallar adımı için gerekli mi |
| B8 | `saveProduct` atomikliği: ürün `upsert` sonra varyant `insertMany` ayrı adımlar; ikincisi başarısızsa yarım kayıt kalabilir (koddan çıkarım, doğrulanmadı) → işlem/transaction veya geri alma | Yarım kayıt politikası |
| B9 | `VariantService.updateVariants/addVariant` gömülü `variants` dizisine, `ProductService` `Variants` koleksiyonuna yazıyor; canlı yolun netleştirilmesi/eski yolun kaldırılması | Hangisi kalıcı |

---

## 5. Bu turda uygulananların dosya haritası

- Yeni: `components/productDefinitions/crud/ProductFormWizardBar.vue`, `ProductFormStepFooter.vue`, `composables/useProductFormProgress.ts` (saf hesap), `composables/productFormFocus.ts` (alana odak).
- Değişen: `ProductDefinitionView.vue`, `ProductUpdateView.vue` (şerit + altbilgi + `isSaving`; kaydetme gövdeleri aynı; `<temnplate>` yazım hatası giderildi, varyant adımı `pdv-step-variants` blok sarmalayıcısı, `pdv-variants` sınıfları ve prop/emit'ler aynen), `ProductInfoFormComponent.vue`, `ProductSingleVariantComponent.vue`, `ProductDetailsComponent.vue`, `PlatformPriceComponent.vue`.
- Testler: `tests/product-form-progress.test.ts` (vitest, 23), `e2e/specs/product-form-wizard.spec.ts` (şerit, panel, odak, 390px, axe), inceleme: `e2e/specs/a6a-review-productform.spec.ts` (`A6A_REVIEW=1`).

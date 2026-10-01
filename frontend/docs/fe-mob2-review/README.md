# fe-mob2 — kamerayla ürün fotoğrafı (MOB-02) ve barkodla ürün/sipariş bulma (MOB-03)

Dal `cloud/fe-mob2` (taban `cloud/fe-mobdesk`). Kapsam: K35 (tek web kod tabanı, kamera `capture`, native yok), K48
(frontend: akış değiştiren her şey → `PROPOSALS_PENDING.md` P-MOB2-1..6). Yalnız `frontend/`; backend değişmedi.
Yalnız cihaz girişi: MCP/sohbet eşitliği gerekmez (brif).

Görseller (açık tema, dokunmatik öykünme, `reducedMotion`, sahte medya): `390/`, `430/`.
- Yeniden üretme:
  `MOB2_REVIEW=1 MOB2_WIDTHS=390,430 MOB3_REVIEW=1 MOB3_WIDTHS=390,430 npx playwright test e2e/specs/mob-02-camera-photo.spec.ts e2e/specs/mob-03-barcode.spec.ts -c playwright.cloud.config.ts --project=chromium-mobile`

| Dosya | Ne gösteriyor |
|---|---|
| `galeri-bos-kamera.png` | Boş galeri: bırakma alanı + altında "Fotoğraf çek" (yalnız telefon/tablet) |
| `galeri-kamera-yuklendi.png` | 4000×3000 GPS'li fotoğraf → yüklenen görsel `kamera-YYYYAAGG-SSDDss.jpg`, **2400×1800**; ızgarada "Görsel ekle" + "Fotoğraf çek" kutuları |
| `galeri-kamera-hata.png` | Çözülemeyen dosya: red satırı "Fotoğraf bu tarayıcıda açılamadı — JPG olarak kaydedip "Görsel ekle" ile yükleyin" |
| `urun-listesi-barkod-dugmesi.png` | Ürün listesi: arama kutusunun yanında barkod düğmesi (44×44) |
| `urun-barkod-tarama.png` | Tarama diyaloğu: "Kamera açılıyor…", elle giriş alanı, "Ara" (boşken pasif) |
| `urun-barkod-bulundu.png` | Kamera akışından EAN-13 okundu → arama → tek ürün → ürün sekmesi açıldı |
| `siparis-barkod-izin-yok.png` | Kamera izni reddi: dürüst durum + "Yeniden dene" + elle giriş |
| `siparis-barkod-detay.png` | Elle girilen sipariş no → tek sipariş → detay açıldı |

## 1. MOB-02 — kamerayla ürün fotoğrafı

| Karar | Neden |
|---|---|
| "Fotoğraf çek" yalnız **telefon/tablette** (mobil genişlik < 768 YA DA `pointer: coarse`), Electron kabuğunda hiç (`useDeviceInput`) | Masaüstünde dosya seçimi aynı işi yapar; Electron kamera iznini politika gereği reddeder (DESK-00) |
| Ayrı gizli giriş `accept="image/*" capture="environment"`; mevcut "Görsel ekle" girişi (`image/jpeg,png,webp`, çoklu) aynen | Arka kamera doğrudan açılır; galeri seçimi davranışı değişmez (galeriden seçileni de hazırlamak → P-MOB2-1) |
| İstemci hazırlığı `photoPrep.ts`: `createImageBitmap(…, { imageOrientation: 'from-image' })` → uzun kenar **2400 px**'e küçült (büyütme yok) → beyaz zeminli tuvale çiz → **JPEG yeniden kodla** (kalite 0,88) | Tuval yeniden kodlaması EXIF/GPS/XMP/IPTC'yi taşımaz; yön görüntüye işlenir (EXIF silinince fotoğraf yan dönmez); saydam PNG siyaha dönmez |
| Güvence: çıktıda APP1 (Exif/XMP), APP13 (IPTC), COM bölütleri **bayt düzeyinde** de silinir; APP0 (JFIF) ve APP2 (ICC renk profili) kalır | Bir tarayıcı kodlayıcısı meta veri yazsa bile konum sızmaz; renk profili korunur |
| Bayt tavanı 10 MB (yükleme sözleşmesi): aşılırsa kalite 0,88 → 0,8 → 0,7, sonra boyut ×0,8 (en çok 3 kez); yine aşarsa dürüst hata | Pratikte 2400 px JPEG 0,4–1,5 MB; kademeler yalnız uç durum |
| Girdi korumaları: fotoğraf olmayan tür, 0 bayt, > 40 MB dosya, > 50 MP görüntü (sözleşme), çözülemeyen biçim (ör. Chrome'da HEIC) → "<ne oldu> — <ne yapılmalı>" metni, mevcut "n dosya eklenmedi" uyarısında | Ham `DOMException` gösterilmez (premium-ui hata standardı) |
| Hazırlanan dosya **mevcut yükleme kuyruğuna** (`useImageUploads` → multipart `ImageApi/upload`) verilir; kart başına ilerleme/hata/"Tekrar dene" aynen | Backend değişmez. Brif "mevcut imzalı yükleme akışı" diyor ama önyüz henüz imzalı PUT'a geçmemiş → çelişki P-MOB2-2'de; dosya imzalı akışa da uygun (`image/jpeg`, ≤ 10 MB) |
| Dosya adı `kamera-YYYYAAGG-SSDDss.jpg` (yerel saat) | Telefonun verdiği "image.jpg" galeride ayırt edilemiyordu |
| Hazırlanırken: kutu "Hazırlanıyor…" (pasif), alt satır "Fotoğraf hazırlanıyor…", ekran okuyucuya duyuru | Yükleniyor durumu (premium-ui durum kapsamı) |

Uzun kenar: sözleşmede piksel sınırı **yok** (yalnız 10 MB / 50 MP) — 2400 seçildi, gerekçe ve değiştirme noktası P-MOB2-5.

## 2. MOB-03 — barkodla ürün/sipariş bulma (yalnız arama)

| Karar | Neden |
|---|---|
| Düğme: liste arama kutusunun hemen yanında (`EkListScreen` yeni `#search-append` yuvası), ikon düğmesi 44×44, `aria-label` "Barkod okutarak ürün/sipariş ara"; yalnız telefon/tablet | Masaüstünde görünmez (arama kutusu + el okuyucusu klavye gibi zaten çalışır) |
| Motor: yerel `BarcodeDetector` ürün barkodu biçimini (EAN-13 / Code 128) destekliyorsa o; yoksa JS okuyucu **dinamik `import()`** ile | Chrome/Android'de ek indirme yok; iOS Safari / Firefox / masaüstü Chromium'da JS yedek |
| JS okuyucu yalnız 1B biçimler (EAN-13/8, UPC-A/E, Code 128/39/93, ITF, Codabar); aynı kod **2 kare üst üste** okununca kabul (yerelde 1) | Ürün ve kargo etiketleri 1B; tek karelik yanlış okumaya karşı uzlaşı |
| Kamera: arka kamera (`facingMode: environment`), 1280×720 hedef, ~6 kare/sn tarama, okununca/kapatınca/söküldüğünde izler durdurulur | Pil/CPU; kamera ışığı söner |
| İzin reddi / kamera yok / güvensiz bağlam / kamera meşgul → ayrı dürüst başlık + metin; reddi ve meşgulde "Yeniden dene"; **elle giriş her durumda açık** ("Ara" boşken pasif, Enter gönderir) | Brif: dürüst durum + elle giriş |
| Okunan kod temizlenir (boşluk, denetim karakterleri/GS1 FNC1, ≤ 64 karakter) | Arama sunucuda kaçışlı "içerir" eşleşmesidir (GV-01) |
| **Ürün**: kod hızlı aramaya (`searchText` → ad / stok kodu / barkod) yazılır; tek ürün eşleşirse ürün sekmesi açılır, birden çoksa filtreli liste | BACKLOG MOB-03 kabulü "barkod → ürün detayı"; mevcut arama alanı (barkod/stok kodu) kullanılır |
| **Sipariş**: kod genel aramaya (`globalSearch` → sipariş no, pazaryeri no, kargo takip no, müşteri) yazılır; tek sipariş → detay açılır (P-MOB2-4) | Kargo etiketi/sipariş no barkodu bulunur. Ürün barkoduyla sipariş bulma backend'de yok → P-MOB2-6 |
| Yazma yok: hiçbir RPC eklenmedi; yalnız mevcut `ProductService/getProducts` ve `OrderService/getOrders` | Brif: yalnız arama |

### Paket kararı (boyut / lisans)

| Seçenek | Lisans | Boyut | Karar |
|---|---|---|---|
| **`@zxing/library` 0.23.0 — derin yollar, yalnız 1B okuyucular** | Apache-2.0 (+ `ts-custom-error` MIT; isteğe bağlı `@zxing/text-encoding` Unlicense/Apache, kullanılmıyor) | Ayrı parça `zxingDecoder-*.js` **140 KB, 31,3 KB gzip**; ana pakete 0 bayt | **Seçildi.** Saf JS → CSP'de `wasm-unsafe-eval` gerekmez, Electron CSP'si de değişmez |
| `@zxing/library` kök içe aktarma | Apache-2.0 | ~458 KB / 120 KB gzip (QR, PDF417, Aztec, DataMatrix, tarayıcı kodu dahil) | Reddedildi |
| `barcode-detector` (polyfill) / `zxing-wasm` | MIT | ~1 MB WASM; varsayılan olarak CDN'den indirir | Reddedildi: CSP (`wasm-unsafe-eval`, dış origin) ve çevrimdışı |
| `@ericblade/quagga2` | MIT | ~150 KB+, yalnız 1B, bakım yavaş | Reddedildi |

Korumalar: `tests/mob-03-barcode.test.ts` — `@zxing` yalnız `zxingDecoder.ts`'te ve yalnız derin yollardan; `zxingDecoder`
yalnız dinamik `import()` ile. Derleme çıktısında zxing kodu (`ChecksumException`/`NotFoundException`) yalnız
`zxingDecoder-*.js`'te. Playwright: liste açılışında zxing isteği **yok**; yerel BarcodeDetector varken tarama boyunca **yok**;
JS yolunda yalnız tarama başlayınca iner. `npm run license-check`: GPL/AGPL yok.

## 3. Dokunulan ortak parçalar

- `src/components/page/templates/EkListScreen.vue` — `#search-append` yuvası (iki başlık düzeninde de; boşsa hiçbir şey çizilmez).
- `src/composables/useDeviceInput.ts` — "cihaz girişi görünsün mü" tek kaynak (MOB-02 ve MOB-03 ortak).
- Yeni: `src/components/productDefinitions/images/photoPrep.ts`, `src/composables/barcode/{barcodeScan,useBarcodeScanner,zxingDecoder}.ts`,
  `src/components/barcode/BarcodeScanButton.vue`, `e2e/fixtures/ean13.ts`.

## 4. Testler (bulut, chromium)

- **vitest tam:** 88 dosya / 1664 test geçti (yeni: `mob-02-photo-prep.test.ts` 16, `mob-03-barcode.test.ts` 24).
  - EXIF silme: sentetik JPEG (APP1 Exif + GPS, XMP, IPTC, COM, ICC) → Exif/GPS/XMP/IPTC/yorum yok; JFIF + ICC + entropi verisi bayt bayt aynı;
    tarayıcı kodlayıcısı meta veri yazsa bile çıktıda yok.
  - Boyut sınırı: 4000×3000 → 2400×1800; dikey; büyütme yok; 10 MB tavanında kalite→boyut kademeleri; sığmazsa `too-large-output`.
  - Hata durumları: tür, 0 bayt, > 40 MB, çözülemez, > 50 MP, kodlama hatası → kullanıcı metni (ham hata sızmaz); kaynak her durumda kapatılır.
  - Barkod: motor seçimi, kamera hatası → durum, kod temizleme, uzlaşı, **gerçek `@zxing/library` ile sentetik EAN-13 okuma**, lazy-load korumaları.
- **vue-tsc:** 0 hata (typecheck mandalı 0/0). Mandallar: style / pattern / no-console OK. ESLint: yeni dosyalarda 0 uyarı.
- **build:** OK (zxing ayrı parça, yukarıda). **build:backoffice:** OK.
- **Playwright (yeni, chromium-mobile, sahte medya):**
  - `mob-02-camera-photo.spec.ts` — gerçek Chromium tuvaliyle 4000×3000, GPS'li EXIF'li JPEG → yükleme isteğinde 2400×1800 JPEG, `Exif`/`GPS`/üretici
    metni YOK, ≤ 10 MB, aynı `upload` ucu; hata durumları (PDF, bozuk JPEG) → red satırı, yükleme yok; masaüstünde düğme/giriş yok; axe 0.
  - `mob-03-barcode.spec.ts` — `getUserMedia` yerine EAN-13 çizilmiş tuvalin `captureStream()`'i → JS okuyucu → arama → ürün açılır;
    sahte yerel `BarcodeDetector` → zxing parçası hiç inmez, birden çok sonuçta liste kalır; izin reddi → dürüst durum + elle giriş → sipariş detayı;
    masaüstünde düğme yok; axe 0 (tarama ve izin reddi diyalogları).
  - 390 + 430: 12/12; tekrar (`--repeat-each`) 9/9 ve 8/8.
- **Mevcut spec'ler (etkilenenler):** `mob-00-mobile` (44 px kapısı, yatay kayma — yeni düğme dahil) geçti; `products`, `orders`,
  `product-definition-parts` mobil + masaüstü: yalnız ekran görüntüsü karşılaştırmaları "Linux tabanı yok" (tabanlar Windows'ta,
  `*-linux.png` git-ignored) — davranış testleri geçti. Görsel onay yerelde.
- **Tam mobil koşu:** bkz. §6.

## 5. Bilinen sınırlar

- Gerçek cihaz doğrulaması yapılmadı (bulut). iOS Safari'de `capture` arka kamerayı açar ve HEIC'i JPEG'e çevirerek verir; Safari
  `createImageBitmap` HEIC çözer — yine de cihazda denenmeli. Android Chrome'da yerel `BarcodeDetector` vardır (JS parçası inmez).
- Koyu temada tarama çerçevesi açık yüzey rengindedir (video üstünde okunur); koyu tema ekran görüntüsü alınmadı.
- Sipariş araması kalem barkodunu kapsamaz (backend) → P-MOB2-6.
- Kök `BACKLOG.md` bu oturumda güncellenmedi (yalnız `frontend/` kapsamı): MOB-02 / MOB-03 durumunu yerelde "bulut: yapıldı,
  cihaz doğrulaması bekliyor" yapmak önerilir.

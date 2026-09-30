# B2 — Ürün resim galerisi + varyanta resim atama (`cloud/fe-b2`)

Kullanıcı: *"Ürün ekleme/güncelleme kısmında resim galerisi ve varyanta resim ekleme kısmı — ciddi bir çalışma yap;
tasarım konusunda premium, albenili, seçkin ve kullanıcı deneyimi çok iyi olan bir yapı bekliyorum."*

Görseller: `before/` (eski hâl), `iterasyon-1/` (ilk uygulama; eleştiri buradan), `after/` (son). Her durum 1440 + 390,
`-yakin` = 2x yakın çekim. Araç: `B2_REVIEW=1 B2_WIDTH=1440|390 B2_OUT=docs/b2-review/after npx playwright test
e2e/specs/b2-review.spec.ts --project=chromium-desktop --workers=1` (390'da dokunmatik öykünme). Veri sentetik
(`e2e/fixtures/productImages.ts`: 3 renk × 3 beden tişört, 6 SVG görsel, biri 480×480).

## 1. Araştırma (best-in-class)

| Kaynak | Alınan | Alınmayan |
|---|---|---|
| Shopify admin — ürün medyası | İlk görsel = öne çıkan (kapak); ızgarada ilk hücre büyük; sürükleyerek sırala; seçim kutusu + toplu sil; ızgara sonunda "ekle" hücresi. Varyant görselleri seçeneğe göre (Renk) gruplanır | Shopify varyant başına TEK görsel atar; bizim sözleşmede varyant çoklu görsel taşır → grup seviyesinde çoklu seçim |
| Linear / Figma sürükle-bırak | Sakin kaldırma: yer tutucu = kesik çerçeveli boş yuva, taşınan kopya = hafif gölge; ölçek/zıplama yok; bırakınca iyimser güncelleme | Yay (spring) animasyonları — motion token'larıyla çelişir |
| Erişilebilir sürükle-bırak deseni (Primer, dnd-kit, Salesforce) | Tutamakta Boşluk = al → oklar → Boşluk = bırak, Esc = vazgeç; `aria-pressed`, `aria-describedby` talimatı, `aria-live` konum duyurusu; odak taşınan öğede kalır; her sürükleme işinin menü alternatifi (Öne al / Kapak yap) | `aria-grabbed` (ARIA 1.1'de kaldırıldı) |

Kaynaklar: fudge.ai/guides/how-to-reorder-product-images-in-shopify, support.cleancanvas.co.uk (media grouping),
primer.style/accessibility/patterns/drag-and-drop, dnd-kit accessibility kılavuzu, Salesforce UX "4 major patterns for accessible drag and drop".

## 2. Eski hâlin eleştirisi (`before/`)

1. **Kapak kavramı yok** — tüm kutular eşit (280px); hangi görselin vitrinde çıkacağı belli değil.
2. **Eylemler yalnız hover'da** (indir/sil köşe ikonları, mavi "info" sürükleme bandı) — klavye ve dokunmatikte keşfedilemez; ağır mavi bant görseli örtüyor.
3. **Varyant ataması saklı** — ancak görsel seçilince sağda beliren çoklu `v-select`'ler; hangi varyanta ne atandığı hiçbir yerde görünmüyor; atanmamış varyant uyarısı yok.
4. **Yükleme**: tek genel "yükleniyor" örtüsü; kart başına ilerleme/hata/yeniden dene yok; yapıştırma yok; tür/adet reddi sessiz (`return false`).
5. **Silme geri alınamaz**, onay da yok.
6. **390px**: ızgara yatayda taşıyor (kart kesiliyor), sağ sütun alta düşüyor.
7. **Varyant paneli** iki ayrı sürüklenebilir ızgara; "+" kaplamalı galeri; yüklemede backend'in döndürdüğü **tüm** ürün görsellerini varyanta ekleyen hata; silinmiş galeri görseli için boş kutular.
8. **Ölü/verimsiz kod**: `watch(variants, …, { deep: true })` içinde `console.log` ×2 ve kullanılmayan kategori süzgeci (sonuç hemen eziliyordu); "Elma/Armut" örnek verisi + grup seçim fonksiyonları; `getFileSizeOld`, `constructImageUrl`, `FileReader` kalıntısı, `onActivated` + JSON kopyası, 15 `console.log`. `ImageUploaderComponent`'te `dropZone:hover { background: red }`.

## 3. Alternatifler ve karar

| | A — Galeri + sağ denetçi paneli | B — Sekmeli: Galeri / Varyantlar (**seçildi**) | C — Atama varyant tablosunda satır satır |
|---|---|---|---|
| Fikir | Seçili görselin ayrıntısı ve atama sağ sütunda | Galeri tam genişlik; atama ayrı sekmede seçenek grubu satırlarıyla | Her varyant satırında görsel seçici |
| Artı | Tek ekran | Izgara geniş (kapak 2×2 + 4 sütun); atama "Renk=Kırmızı → 3 varyant" düzeyinde, eksikler tek bakışta | Tanıdık |
| Eksi | 1040px diyalogda ızgara daralır; 390'da ikiye bölünür | Bir tık fazla | 9–60 varyantta tekrar eden iş; grup mantığı kaybolur |

Ek olarak **iki kısa yol**: galeride görsel seçip toplu çubuktan "Varyantlara ata" (değer hapları → "n varyanta eklenecek"),
ve varyant tablosunda satırdaki küçük görselden **tek varyant paneli** (+ "aynı renkteki n varyanta uygula").

## 4. Kararlar (son hâl)

- **Kapak = ızgaranın ilk hücresi (2×2)**, "★ Kapak" rozeti; kapak hücresine bırakılan görsel kapak olur. Diğerlerinde sıra numarası.
- **Sıralama**: fare → kartın tamamından sürükle (SortableJS, `forceFallback`, animasyon `--ek-duration-base`, reduced-motion'da 0); dokunmatik → yalnız tutamaktan (sayfa kaydırması serbest, 40px hedef). Klavye → tutamakta Boşluk/oklar/Boşluk/Esc (`aria-live` konum). Menü → Kapak yap · Bir öne/geriye taşı · Önizle · İndir · Sil.
- **Sil = geri al tostu** (6 sn, üzerine gelince durur); istek tost kapanınca ya da panel kapanınca gider (onay diyaloğu yerine geri al: EkSavedViews ile aynı desen).
- **Yükleme**: bırakma alanı (boşken büyük; doluyken "Görsel ekle" hücresi + panel üzerine dosya sürükleyince örtü), tıkla, **yapıştır (Ctrl+V)**. Dosya başına istek → kart başına ilerleme çubuğu, hata ("Sunucu görseli kaydedemedi" / "Bağlantı kurulamadı"…), **Tekrar dene**, ≥2 hatada "Tümünü tekrar dene". Tür/adet reddi görünür uyarı.
- **Kalite ipuçları**: kısa kenar < 800 px uyarı, < 1200 px bilgi, oran 1:2–2:1 dışı bilgi. **Pazaryeri kuralı değildir** (projede pazaryeri görsel kuralı verisi yok) — yalnız ipucu, yüklemeyi engellemez; beyaz zemin yalnız öneri metni.
- **Önizleme (lightbox)**: iç içe `EkDialogHost` (Esc yalnız önizlemeyi kapatır), ←/→ Home/End, alt şerit, çözünürlük/boyut, ipuçları, **kullanıldığı varyantlar**, Kapak yap/İndir/Sil.
- **Varyantlar sekmesi**: eksik uyarısı (adlarıyla, "Yalnız eksikleri göster"), "Görselleri şuna göre ata: Renk | Beden" (tercih: renk benzeri ad), değer satırı: varyant/görsel sayısı, ortak görseller, "Görsel yok" / "n varyantta farklı", satır içi seçici → "n varyanta uygula" (varyanta özel görseller korunur) + Geri al; satır genişletilince varyantlar tek tek.
- **Varyant tablosu**: görselsiz varyant uyarı tonlu "+" kutusu, çoklu görselde sayı rozeti; araç çubuğunda "Görseller" → galeri Varyantlar sekmesinde açılır.
- **390**: tek sütun düzen (sekmeler, çubuk, ızgara 2 sütun + kapak tam genişlik), dokunmatikte eylemler hep görünür, sürükle/Ctrl+V metinleri gizlenir ("Ürün görsellerini ekleyin").

## 5. İterasyonlar

| # | Bulgu (göz incelemesi / test) | Düzeltme |
|---|---|---|
| 1 | "Düşük çözünürlük" rozeti küçük kutudan taşıyor; hata metni tek satırda kesik; "Yükleniyor %0"; boş durumda sıralama ipuçlu araç çubuğu anlamsız | Rozet metni yalnız kapakta (diğerlerinde ikon + ipucu); hata 2 satır; "Yükleniyor…"; boşken çubuk yok |
| 1 | 390'da sekme adı ("Varyant görselleri · 3 eksik") taşıyor, alt bilgi 2 satır | "Varyantlar · 3 eksik"; dar ekranda ikincil metinler gizli |
| 2 | Varyant tablosunda görselsiz satır soluk ikonla ayırt edilmiyor; varyant adımından atamaya giriş yok (`isImagesDialog` hiç açılmıyordu) | Uyarı tonlu boş kutu + sayı rozeti; "Görseller" düğmesi |
| 3 | e2e: Esc (klavyeyle taşıma iptali) **tüm galeriyi kapatıyordu** — sekme örtüsü Esc'i pencere yakalama aşamasında alıyor | `useTabScope`: `[data-ek-esc-local]` içindeki Esc örtüyü kapatmaz; tutulan tutamak bu özniteliği taşır |
| 3 | e2e: tosttaki "Geri al" **tıklanamıyordu** — sekme diyaloğunun Vuetify z-index'i 2400'e çıkıp `--ek-z-toast` (2400) ile eşitleniyor, DOM'da sonra gelen diyalog üstte kalıyordu (uygulama geneli, önceden var olan hata) | `EkToastHost` z-index = `--ek-z-toast + --ek-z-overlay` |
| 3 | axe: kalite/kullanım rozetinde rolsüz `aria-label` | `role="img"` |
| 3 | Dokunmatikte "bırakın"/Ctrl+V/Alt+ok metinleri anlamsız | `(hover: none)` metin değişimi |

## 6. Sözleşme

Backend DEĞİŞMEDİ. `getImages {productId: tempId}` · `upload` (multipart `uploadImageForm` + `files`; artık dosya başına) ·
`sortImages {sortedImageIds, tempProductId}` · `deleteImage {imageId, tempProductId}` · `deleteImageSelected {tempProductId, selectedImages}` ·
`downloadImage/:id`. Varyant atamaları `productInfoForm.variants[].images` (kimlik; içe aktarılmış ürünlerde URL) — ürün kaydıyla gider.
`restApi.postImageUpload(data, onProgress?)` — ikinci argüman isteğe bağlı (yalnız axios `onUploadProgress`).
Bilinçli davranış değişikliği: galeri yenilenince varyant referansları artık **URL referanslarını da korur** (eskiden kimlik olmayan her referans düşüyordu).

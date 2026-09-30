# B1 — Ürün listesi: rowspan'lı varyant grupları + premium küçük görseller (önce / sonra)

Kullanıcı geri bildirimi (A11 sonrası): "Ürün listesi resim gösterimlerini beğenmedim. Rowspan'lı grupları varyantlı ürünlerin
varyantlarında göstermek daha güzel — ürün güncelle sayfasındaki varyant listesinde olduğu gibi. Resimlerde yazan sayılar hoş durmamış."

Araç: `B1_REVIEW=1 B1_REVIEW_WIDTH=1440|390 B1_REVIEW_OUT=docs/b1-review/<before|after> npx playwright test e2e/specs/b1-review.spec.ts --project=chromium-desktop`
(bulutta `-c playwright.cloud.config.ts`; 2x). Görseller `images.entegrasyonik.com` isteği yakalanarak üretilen sentetik SVG'ler.

| Dosya | Senaryo |
|---|---|
| `b1-liste-*` | ürün listesi: çoklu/tekli görselli + görselsiz ürün |
| `b2-varyant-*` | 3 renk × beden, karışık giriş sırası, görselli/görselsiz varyant (390: `-yakin-2` kart görünümü) |
| `b3-cok-varyant-*` | 14 varyant (kompakt) + `-tumu-acik` |
| `b4-onizleme-*` | `-erken` (250 ms: henüz açık değil), önizleme, `-varyant`, `-klavye` (odakla açılır) |
| `b5-yukleniyor-*` | görsel yanıtı gecikirken iskelet |

## Önce (A11) — eleştiri
1. **Sayı rozetleri** (6 / 3 / 1 / 2) görselin köşesini kapatıyor, bildirim rozeti gibi okunuyor; 10 px ham yazı.
2. Ürün görseli 114 px yüksekliğinde çizilip 44 px kutuda kırpılıyor → yalnız görselin **üst kenarı** görünüyor.
3. Görselsiz üründe dev (114 px) ikon kırpılıp **kırık bir şekil** gibi duruyor; varyant görseli `v-img` en-boy oranıyla küçülüp kutuda "yüzüyor".
4. Yüklenme durumu yok (boş gri kutu → ani belirme); büyütüp bakmanın yolu yok.
5. Varyant grupları ayrı **başlık satırı** ("● RENK Beyaz 3 varyant · stok 83") — ürün güncelle ekranındaki rowspan'lı gruptan farklı dil.
6. Sıra **alfabetik**: Beyaz → Lacivert → Siyah; bedenler L, M, S (tanım sırası S, M, L, XL değil).

## Alternatifler
**Varyant grupları**
- A) A11 başlık satırı (mevcut) — yatay alan kazanır, ama iki ekran iki farklı dil; her grup +1 satır yükseklik.
- B) **Ürün güncelle ızgarasıyla aynı rowspan'lı grup kolonu** ✔ — tek görsel dil, grup başına ek satır yok, grup adı satırların solunda sabit.
- C) Grup = çip/şerit (sol renkli çizgi + ilk satırda ad) — kompakt ama grup adını ve sayısını tarama zor; ızgarayla yine farklı.
- Seçim B: kullanıcının açık isteği + tek desen; yatay alan kaybı kalan seçenek adını başlığa taşıyarak ("BEDEN" kolonu, çipte yalnız değer) ve varyant hücresi en küçük genişliğini daraltarak geri alındı (taşma 0 px, A11 ile aynı).

**Çoklu görsel ipucu**
- A) Sayı rozeti (A11) — reddedildi (kullanıcı).
- B) Alt nokta göstergesi (karusel noktaları) — satıra yükseklik/gürültü ekler, 28 px kompaktta okunmaz.
- C) **Arkada tek ince "yığın" kenarı** ✔ — sayı yok, mutlak konumlu (yerleşim/satır yüksekliği değişmez), dark mode'da token.
- D) Köşede küçük "katman" ikonu — ikon da bir rozet gibi görseli kapatıyor.
- Seçim C + önizleme balonunda en fazla 5 karelik sessiz şerit (sayı yalnız ekran okuyucu metninde).

## Sonra — kararlar
- **Ortak desen:** `variants/VariantGroupCell.vue` (rowspan'lı `<td>`: ad + "n varyant" [+ stok]) ve `variants/useVariantGrouping.ts`
  (grup = seçenek TANIM sırası, grup içi kolon sıralaması, yoksa kalan seçeneklerin tanım sırası). Rowspan hesabı yine tek yerde:
  `grid/variantSheet.ts` `groupRows` + `windowRowspans` (ızgaranın sanal kaydırması ve listenin "Tümünü gör" kırpması aynı fonksiyon).
  `VariantGrid.vue` ve `ProductVariantListComponent.vue` ikisi de bunları kullanır; A11'in `groupVariants` kopyası kaldırıldı.
- **Liste satırı:** A11'in iyi kısımları korundu — barkod kopyala, kanal çipleri (durum ikonu, ipucunda neden, tıkla → durum kartı, "+n"),
  stok tonu (tükendi/az) + raf, `EkRowActions`, özet şeridi. Satır yüksekliği A11 ile **aynı 58 px** (grup ayırıcı çizgi mevcut alt kenarlıkta,
  ek kenarlık yok; tek varyantlı grupta etiket satıra sığar — e2e iddiası).
- **ProductThumb** (`products/ProductThumb.vue`): kare (28/40/44), `object-fit: cover`, ince kenar + `--ek-radius-tile`; yüklenirken nabız
  iskeleti (reduced-motion'da durağan) ve yumuşak belirme; görsel yoksa/yüklenemezse `mdi-image-outline` yer tutucu (subtle içerik tonu).
  Önizleme: 450 ms gecikmeli `v-tooltip` (etkileşimsiz, odak kapanı yok), **sabit 240×240 çerçeve** (`contain`) → açılışta/yüklemede boyut
  değişmez; açık yüzey (`surface-raised`, genel ters-yüzey tooltip kuralı yalnız bu sınıfta geri alındı). Ürün satırında görsel bir düğme
  (Enter → düzenle), klavye odağında da önizleme açılır.
- **Adres çözümü** `products/productImage.ts` (saf, testli): eski bileşenlerle aynı kural (ürün: yalnız `url`; varyant: http / `_id` → url /
  `…/[temp/]tempId/_id_t.uzantı`).
- **Dar kap (< 600px):** A6b kart görünümü korunur; grup hücresi grubun ilk kartının üstünde tam genişlik başlık ("Siyah 3 varyant · stok 11"),
  kartta seçenek adı geri gelir ("Beden S" — tablo başlığı gizli).

## İterasyonlar
1. Rowspan + ProductThumb ilk hâli → kanal çipleri 2 satıra kırıldı (satır 63 px), grup etiketi 35 px aşağı itildi (yapışık üst ofset
   yanlış kaydırma kabına göre), önizleme sınıfları `v-tooltip`'e gidiyordu (hover testi zaman aşımı).
2. `inheritAttrs:false`, çipler tek satır, yapışıklık yalnız iç kaydırmada → satır 58 px; tek varyantlı grupta 79 px (etiket kırılıyor) ve
   grup başında +1 px → etiket sıkılaştırıldı, ayırıcı alt kenarlığa taşındı. Önizleme koyu çıktı (genel tooltip `!important`) → açık yüzey.
3. Yatay taşma 46 px (grup kolonu) → "BEDEN" başlığı + çipte yalnız değer, varyant hücresi min genişliği; kompaktta stok kodları hizasız
   (S/XL çip genişliği) → sabit çip kolonu. Izgarada grup etiketi hizası (dikey `top`) korunarak `td.` öncelikli seçici.

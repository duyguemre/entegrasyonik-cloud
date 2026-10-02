# FE R4 · Şerit B — Ürün ekleme/düzenleme yeniden tasarımı (RAPOR · bitiş işareti)

Dal `cloud/fe-r4b` · taban `origin/main` (= faz3-arayuz @ b68ae6f7) · sözleşme `docs/cloud-contracts/FE_FEEDBACK_R4_2026-10-02.md` Şerit B (K61).
Kapsam yalnız `frontend/`: `components/productDefinitions/crud/**`, `views/secure/definitions/ProductDefinitionView.vue` +
`ProductUpdateView.vue` ve yalnız bunların kullandığı alt bileşenler (`variants/ProductSingleVariantComponent`,
`ProductDetailsComponent`, `ProductVariantsComponent`, `grid/VariantGrid`). Paylaşılan `@entegrasyonik/ui` / token
dosyalarına DOKUNULMADI (yalnız mevcut bileşen ve tokenlar kullanıldı). Kabuk, dashboard, ayarlar, diğer
`definitions/*View`, pricing (`CompetitionPanel`) ve liste standardı değişmedi.

## 1. Yapılanlar

| # | Ne | Nerede |
|---|---|---|
| 1 | **Adım şeridi**: dört ayrı kutu yerine tek kartta bağlı adım çizgisi (işaretçi + başlık + durum; tamamlanan adımdan sonra bağlantı başarı tonunda, etkin adım aksiyon tonlu hap, kilitli adım kesik çerçeveli kilit). Tablette başlıklar kesilmez (2 satır), mobilde işaretçiler tek sırada bağlantıyla, başlık/durum altta. | `crud/ProductFormWizardBar.vue` |
| 2 | **Kayıt çubuğu** (ayrı ikinci kök): durum kapsülü + "Zorunlu bilgiler" ölçer + sayı + ipucu tek satır; sağda "Eksikleri göster · n" ve Kaydet/Güncelle. Masaüstü/tablette **iş alanında yapışkan** — uzun adımda (Ürün Tanımı editörü, Tekil, varyant ızgarası) Kaydet hep erişilir; üstünde zemin renginde perde (kayan içerik sızmaz). Mobilde akışta. | aynı |
| 3 | **Kontrol paneli** artık çubuğun içinde açılır (yapışkanken de görünür, `max-height` + iç kaydırma, `overscroll-behavior: contain`); eksik/uyarı satırları "Adım n" hapı + ok, özet ayrı kartçık, "tamam" durumu başarı bandı. | aynı |
| 4 | **Ortak adım kartı** `ProductStepCard` (ikon kapsülü + h2 + açıklama + sağda eylemler). Ürün Tanımı · Tekil Ürün Bilgisi · Detay Bilgiler aynı kabukta; önceden genişlikler 880 / 1200 / tam genişlik arasında değişiyordu → tüm sihirbaz **tek sütun (en fazla 1280px)**. | `crud/ProductStepCard.vue`, görünümler |
| 5 | **Ürün Tanımı**: ürün tipi radyoları seçim kutucuğu (radyo + etiket tek tıklama alanı, seçili aksiyon tonlu) + tipe göre tek cümle açıklama; galeri sütunu 248px, mobilde 200px. | `crud/ProductInfoFormComponent.vue` |
| 6 | **Tekil Ürün Bilgisi**: iki sütun (solda Kod + Stok, sağda Fiyat: kanal fiyatları + platform bazında fiyat + maliyet), dar kapta alt alta; "Ürün Özellikleri" kart başlığının eylemine taşındı (aynı düğme, aynı ad). | `variants/ProductSingleVariantComponent.vue` |
| 7 | **Detay Bilgiler**: iki bölüm yan yana (Satış ve kargo · Ölçü, garanti ve vergi), dar kapta alt alta. | `variants/ProductDetailsComponent.vue` |
| 8 | **Adım altbilgisi**: Geri · konum göstergesi (4 nokta + "n / 4", dekoratif) · kilit nedeni + Devam; ince ayraçla içerikten ayrılır (ızgara düzeni, Devam her zaman sağda). | `crud/ProductFormStepFooter.vue` |
| 9 | **Varyantlar (yalnız görsel cila — ROWSPAN YAPISI AYNEN)**: başlıkta adım kartlarıyla aynı ikon kapsülü; grup hücresinde ince aksiyon şeridi; eylem kolonu 84→104px (kalem/çöp düğmeleri kesiliyordu); görselsiz varyant kutusu dolu uyarı bloğu yerine kesik uyarı çerçeveli (koyu temada ağırdı); dar ekranda "Görseller / Toplu düzenle / Varyant oluştur" yalnız ikon (aria-label korunur); meta satırında "… grubu grubu" yinelemesi giderildi. | `variants/ProductVariantsComponent.vue`, `variants/grid/VariantGrid.vue` |
| 10 | **Erişilebilirlik**: açıklama editörü (Quill) araç çubuğu denetimlerine Türkçe ad + `role="toolbar"` (axe `aria-command-name` ihlali vardı — başlık seçicisi adsızdı). | `crud/ProductInfoFormComponent.vue` |

`ProductDefinitionView` satır eylemleri: bu ekran bir liste değil (sihirbaz); içindeki tek "satır" eylemleri varyant ızgarası
`EkRowActions` (düzenle/sil) ve "Varyant işlemleri" menüsüdür — hepsi zaten bağlı (`onVariantOp` 8/8 anahtar, `@edit/@delete/@images/@channel-prices`). Bağlanacak işlevsiz eylem bulunmadı.

## 2. Korunan davranışın kanıtı

**Önce karakterizasyon** (`tests/fe-r4b-product-form-characterization.test.ts`, 18 test, vitest + happy-dom, gerçek `tr.json` mesajları):
taban üzerinde yazıldı ve ilk commit'te (`fe-r4b-cloud: ürün formu karakterizasyonu …`) yeşil olarak itildi; tasarım commit'lerinden
sonra **dosya değişmeden** yeşil (18/18).

| Grup | Sabitlenen |
|---|---|
| Alanlar + doğrulama | Ürün tipi radyoları (etiket/değer), Varyant Grup Kodu (32, `stockcodeRules`), Ürün Başlığı (160, `titleRules`), marka (zorunlu), galeri (taslak kimliği yokken kapalı), Detay 4 metin (20/20/16/16, `tel`, `length_0_16`) + KDV (1–29, varsayılan ipuçları), Tekil: Stok Kodu/Barkod (160, `titleRules`), Stok Adedi (zorunlu + rakam), Raf (2–160), Satış/Piyasa (zorunlu, 0 geçer), Maliyet (kuralsız), kanal fiyatı açılınca ana fiyat alanları yerine "Kanal fiyatları"; 11 yoklama girdisinde her kuralın MESAJI; v-model bağları |
| Sihirbaz | 4 adımın erişilebilir adı + durum, `aria-current`, `aria-disabled`, kilit nedeni (`title` + `aria-describedby`), Kaydet etkinliği + ipucu cümlesi, ölçer max/değer, eksik listesi sırası, maddeye tıklayınca hedef adım/alan, kaydediliyor kilidi, Geri/Devam ve kilit nedeni |
| Gövdeler | Ekleme `ProductService/saveProduct` `{ productInfo }` — anahtar kümesi, `images` çıkarılır, tekilde `maincode` üretilir ve varyanta galerinin url'leri, varyantlıda her varyanta ana kod; başarıda bildirim + maliyet ayrı yazma (`create`) + sıfırlama; başarısızlıkta form korunur. Düzenleme `retrieveProduct` → `updateProduct` gövdesi formun kendisi, yanıt formu yeniler, maliyet `update`. Gizli davranış (korunur, düzeltilmedi): ekleme açılışında `hasVariant` izleyicisi tekil varyantı boşaltır, 3. adıma geçişte yeniden oluşur |
| Rowspan (DOM) | İlk seçeneğe göre tanım sırasıyla gruplama, `rowspan` = grup boyu, grup içi beden sırası; kolon sıralaması grupları bozmaz; kanal fiyatlı satırda `colspan=2`; sanal pencerede (19 satır) son grup `rowspan=3` ile kırpılır, sayaç toplamı (8) gösterir; arama süzgeci grupları yeniden hesaplar |

E2E gövde karakterizasyonu `product-form-bodies.spec.ts` (değişmedi) ve yeni `fe-r4b-product-form.spec.ts` (rowspan 2/1) yeşil.

## 3. İnceleme rotaları (yerel: `npm run dev` → http://localhost:3020)

- Ekleme: http://localhost:3020/ → Ürün kataloğu › Ürünler → **Yeni ürün** (Kategori → Ürün Tanımı → Tekil Ürün Bilgisi / Varyant Bilgileri → Detay Bilgiler; "Eksikleri göster").
- Düzenleme (tekil): Ürünler listesinde tekil bir ürünün satırında **Ürünü düzenle** → adımlar arası gez, Tekil adımında aşağı kaydır (kayıt çubuğu yapışkan).
- Düzenleme (varyantlı): varyantlı bir ürünün **Ürünü düzenle** → **Varyant Bilgileri** (rowspan'lı ızgara, görselsiz varyant kutusu, eylem kolonu).
- Koyu tema: uygulamanın tema tercihini "Koyu" yapın (veya işletim sistemi koyu + tercih "Sistem"); dar ekran: tarayıcıyı 390px'e daraltın.

Önce/sonra görüntüleri: `once/` (33 görüntü) ve `sonra/` (36 — ek olarak `duzenle-3-tekil-kaydirilmis` × 3) (her biri `<ekran>-<genişlik>-<tema>.png`; 1440 açık + koyu, 390 açık;
ekleme: `ekle-*`, düzenleme: `duzenle-*` (+ `duzenle-3-tekil-kaydirilmis` yapışkan çubuk), varyantlı: `varyant-*`).
Üretim: `R4B_REVIEW=once|sonra npx playwright test -c playwright.cloud.config.ts fe-r4b-review --project=chromium-desktop`.

## 4. Öz-eleştiri turları

1. **Tur 1** (ara görüntüler): yapışkan çubuğun üstündeki 8px boşluktan kayan içerik görünüyordu → zemin perdesi; koyu temada tamamlanan bağlantı ve altbilgi noktaları seçilmiyordu (`success-border` koyu) → `success` + saydamlık; mobil kart başlığında ikon tek başına satıra düşüyordu → başlık bloğu `flex-basis: 0`; radyo kutucuğunda daire kenara yapışıktı → iç boşluk; mobil galeri kapağı ekranın yarısını kaplıyordu → 200px; altbilgi noktası genişlik animasyonu → yalnız `transform`.
2. **Tur 2** (800px tablet + 390): adım başlıkları "Kategori S…" diye kesiliyordu → tablette iki satıra sarılır; mobil şerit kenara dayanıyordu → iç boşluk; axe AA taraması editör araç çubuğunda gerçek ihlal buldu → Türkçe adlar. Sonrasında 3 viewport'ta axe ihlali 0.

## 5. Testler

| Kontrol | Sonuç |
|---|---|
| `npx vitest run` (frontend) | 1754 geçti / 18 kırmızı — 18 kırmızının tamamı tabanda (`origin/main`) da aynı (kabuk/sekme/yenile/hareket testleri; bu dalın dosyalarına değmiyor). Taban: 1736 geçti / 18 kırmızı; fark = bu daldaki 18 yeni karakterizasyon testi |
| — bunun içinde `fe-r4b-product-form-characterization` | 18 / 18 (tasarım öncesi ve sonrası, dosya değişmeden) |
| `npm run build` | yeşil |
| `test:pattern-ratchet` · `test:no-console-ratchet` · `test:contract-paths` | OK · OK · OK (182 yol) |
| `test:style-ratchet` | tabanla AYNI çıktı — `EkWorkspaceTabs.vue` vb. 14 satır tabanda da kırmızı (Şerit A/kabuk; bu dalın dosyası yok) |
| `test:typecheck-ratchet` | tabanla AYNI 2 hata (`BrandIntegrationSelectBoxComponent.vue`, `BrandListComponent.vue`; bu dalın dosyası değil) |
| `eslint` (değişen dosyalar) | 0 hata (uyarılar tabandaki eski kod) |
| Playwright ilgili spec'ler, 3 proje, `--update-snapshots=missing` | 12 spec × 3 proje (`fe-r4b-product-form`, `product-form-bodies`, `product-definitions`, `product-definition-parts`, `product-form-r2c`, `product-variants`, `product-variant-dialogs`, `ds-overlays`, `mob-00/02/03`, `prc-r1-pricing`): ilk koşu 191 geçti / 22 kırmızı / 60 atlandı — 20 kırmızı ilk kez yazılan linux tabanı ("snapshot doesn't exist … writing actual"), 2 kırmızı eşzamanlı koşumda iz dosyası çakışması (`ENOENT …trace`); bu 3 spec yeniden: **48/48 geçti**. Atlananlar spec içi `fixme`/`skip` (mobil "Yeni ürün" B1, inceleme spec'leri, koyu proje eşleşmesi) |
| axe (wcag2a/aa, 21a/aa) — `fe-r4b-product-form` | 0 ihlal (tekil 4 adım + kontrol paneli, varyant adımı, ekleme kategori + panel; mobil/tablet/masaüstü) |

## 6. Değişen win32 tabanları (Windows'ta bilinçli yenilenmeli; bulutta `*-linux.png` commit'lenmedi)

Ürün formu düzeni (adım şeridi, kayıt çubuğu, kart kabuğu, genişlik) değiştiği için aşağıdaki tabanlar yerelde
`npx playwright test <spec> --update-snapshots` ile yeniden üretilmeli (diyalog tabanlarında da arka plandaki form görünür):

- `product-definition-parts.spec.ts-snapshots/`: `product-details-*`, `product-images-*`, `product-single-variant-*` (× desktop/tablet/mobile = 9)
- `product-variants.spec.ts-snapshots/`: `product-variants-*` (3)
- `product-variant-dialogs.spec.ts-snapshots/`: `variant-attributes-*`, `variant-batch-attributes-*`, `variant-batch-prices-*`, `variant-generator-*`, `variant-images-*`, `variant-platform-prices-*`, `variant-search-*` (21)

Toplam 33 dosya. Yeni spec'ler (`fe-r4b-product-form`, `fe-r4b-review`) görsel taban üretmez.

## 7. Notlar / devreden

- `vitest.config.ts`'e `@vitejs/plugin-vue` eklendi (yalnız ekleme): `.vue` bileşenlerini happy-dom'da bağlayan karakterizasyon için. Diğer testlerin sonucu değişmedi.
- Tabanda kırmızı olan 18 vitest (A10/A12/A7/A8/B4/FR3 hareket/vuetify tema — kabuk/sekme/yenile düğmesi) bu dalda dokunulmadı; Şerit A/D ile ilgili.
- Bulut kurulumunda `scripts/cloud-setup.sh` içindeki `npx playwright install` 403 verdi (cdn.playwright.dev engelli); önceden kurulu Chromium (`playwright.cloud.config.ts`) kullanıldı. `frontend` için `@rollup/rollup-linux-x64-gnu` (`--no-save`) ve `npm run tokens` (git-ignored `tokens.app.css`) gerekti.
- Gizli davranış (karakterizasyonda belgelendi, kapsam gereği düzeltilmedi): ekleme açılışında tekil varyant `hasVariant` izleyicisiyle boşalır, 3. adımda yeniden oluşur.

# FE R5 · Şerit B — Ürün ekleme/düzenleme GERÇEK yeniden tasarımı (RAPOR · bitiş işareti)

Dal `cloud/fe-r5b` · taban `origin/main` (= faz3-arayuz @ b21c8e5e, FE-R4 birleşimi dahil) · çıkış noktası kullanıcı geri bildirimi
"ürün ekleme sayfasında bir değişiklik yok" (R4-B yalnız cila yapmıştı). Bu turda **işlev / veri / API / doğrulama / adım kilitleri
AYNI**, **görünüm ve yerleşim baştan**.
Kapsam yalnız `frontend/src` (ürün formu bileşenleri + iki görünüm) + testler + bu klasör. `@entegrasyonik/ui`, token dosyaları,
kabuk, backoffice ve packages'a DOKUNULMADI (yalnız mevcut bileşen ve tokenlar kullanıldı).

## 1. Yerleşim kararı — değerlendirilen 3 alternatif

Ölçü: 1440px ekranda kabuk menüsü açıkken iş alanı ≈ 1144px (1280px'te ≈ 984px). Varyant ızgarası 11 kolon (~1140px) ister.

| | Alternatif | Artı | Eksi | Karar |
|---|---|---|---|---|
| A | **3 sütun**: solda dikey adımlar (≈230) · ortada içerik · sağda yapışkan özet (≈300) | Brife birebir | İçerik 1440'ta ≈ 560px'e iner: yan yana alanlar sıkışır, varyant ızgarası yarıdan fazlası yatay kaydırmada kalır; 1280'de kullanılamaz | ✗ |
| B | Üstte yatay adım şeridi + sağda yapışkan özet | İçerik ≈ 820px | Üst şerit R4-B'nin aynısı — kullanıcı "değişiklik yok" der; özet ile adımlar iki ayrı yerde | ✗ |
| **C** | **Ürün rayı**: solda TEK yapışkan sütun (288px) — ürün önizleme kartı → dikey adımlar → tamamlanma halkası + Kaydet + Eksikler; sağda geniş içerik (≈ 830px). Ray **daraltılabilir** (76px: işaretçiler, halka, Kaydet simgesi) | Önizleme + adım + durum tek bakışta, tek yerde; içerik geniş; varyant adımında ray daraltılınca ızgara ≈ 1040px; açılınca hemen fark edilen yeni kimlik ("ürün editörü") | Özet sağda değil solda (brif "veya eşdeğer güçlü bir düzen" diyor) | **✓ seçildi** |

Duyarlılık **kap sorgusu** (`container: pform`) ile — kabuk menüsü açık/kapalı fark etmez, iş alanının gerçek genişliği belirler:
- **≥ 960px kap** (1440 ve 1280 masaüstü): ürün rayı + içerik.
- **< 960px kap** (tablet 800, telefon 390): önizleme kartı + yatay adım şeridi üstte, **durum kartı altta yapışkan kayıt çubuğu**
  (halka + ipucu + Eksikler + Kaydet; kontrol paneli yukarı açılır). Telefonda eylemler ikinci satırda tam genişlik.

## 2. Yapılanlar

| # | Ne | Nerede |
|---|---|---|
| 1 | **Ürün rayı** (üç kök): (a) önizleme kartı — kapak küçük resmi / boş yer tutucu, ürün tipi mikro etiketi, başlık (2 satır), marka, kategori yolu (kökten yaprağa), Fiyat (tek fiyat · aralık · "Kanal fiyatı") / Toplam stok / Varyant sayısı; (b) **dikey adım gezintisi** — işaretçi + ad + durum ("Tamam · n eksik · İsteğe bağlı · Kilitli"), işaretçiler arası ilerleme çizgisi, etkin adım sol vurgu çizgisi + ok; (c) **durum kartı** — tamamlanma halkası (yüzde / onay), "Zorunlu bilgiler n / m", ipucu cümlesi, tam genişlik Kaydet/Güncelle, altında Eksikleri göster · Kayıt özeti; kontrol paneli rayın sağına, içeriğin üzerine katman olarak açılır (Esc kapatır) | `crud/ProductFormWizardBar.vue` |
| 2 | **Ray daraltma** (geniş kapta): «/» düğmesi; daraltılmışta metinler görsel olarak gizlenir (erişilebilir adlar aynı), adım düğmesinde ipucu; tercih tarayıcıda hatırlanır (depolama yoksa varsayılan açık) | aynı + `composables/useProductFormPreview.ts` (`useProductRailPreference`) |
| 3 | **Sayfa iskeleti**: `.pdv-grid` (ray + içerik), yapışkan ray, dar kapta alt çubuk için içerik alt boşluğu | `views/.../ProductDefinitionView.vue`, `ProductUpdateView.vue` |
| 4 | **Adım sayfası başlığı**: tek büyük kart kalktı → "ADIM n / 4" mikro etiket + büyük başlık (title rolü) + kısa açıklama + ikon kapsülü + sağda eylem | `crud/ProductStepCard.vue` |
| 5 | **Bölüm kartları** (yeni): başlık bandı (ikon kapsülü + başlık + tek satır yardım + sağda rozet/eylem) + `EkFormGrid` gövde; `role="group"` + görünür adla adlandırılır | `crud/ProductFormSection.vue` |
| 6 | **Kategori adımı** yeniden: "Seçili kategori" kartı — yol **çipleri** (yaprak çip vurgulu) ya da boş durum yönlendirmesi; seçilince **kanal eşleşmesi** çipleri (bağlı pazaryeri başına "Eşleşti / Eşleşmedi", `Categories.platforms[kod]`, salt okunur); altında aramalı kademeli seçici ("Kategori ağacı") | `crud/ProductCategoryStep.vue` (yeni), `CategorySelectBoxLevelComponent.vue` (yalnız başlık metni) |
| 7 | **Ürün tanımı**: dört kart — Ürün tipi (iki **seçim kartı**: radyo + başlık + açıklama), Temel bilgiler (Marka · Varyant Grup Kodu yan yana; Başlık tam satır), **Görseller** (kapak 2×2 büyük + "Kapak" rozeti + küçük resimler + "Ekle" kutusu + "+n"; boşken kesik çizgili bırakma alanı görünümü), Ürün açıklaması (editör) | `crud/ProductInfoFormComponent.vue` |
| 8 | **Tekil ürün bilgisi**: üç kart — Kimlik kodları (Stok kodu · Barkod), Fiyat (Satış · Piyasa · Maliyet 3 kolon + kanal fiyatı anahtarı), Stok ve depo (Stok · Raf) | `variants/ProductSingleVariantComponent.vue` |
| 9 | **Detay bilgiler**: iki kart — Satış ve kargo (2 kolon), Ölçü, garanti ve vergi (Desi · Garanti · KDV 3 kolon) | `variants/ProductDetailsComponent.vue` |
| 10 | **Varyant adımı — ızgara YAPI OLARAK AYNEN**; çevresi yeni dil: adım başlığı, **özet kutucukları** (Varyant + grup sayısı · Toplam stok + stoksuz · Satış fiyatı aralığı + kanal fiyatlı · Görsel n/m + görselsiz), boş durumda 3 adımlı "nasıl" şeridi. Araç çubuğu, menüler, toplu işlemler değişmedi | `variants/ProductVariantsComponent.vue` (yalnız şablon çevresi + özet hesabı) |
| 11 | **Kayıt geri bildirimi**: mevcut toast'a ek **satır içi** bildirim (durum kartında, `role="status"` canlı bölge): ekleme başarı "Ürün eklendi — “…” kataloğa kaydedildi; yeni ürün için form temizlendi.", güncelleme başarı "Değişiklikler kaydedildi"; başarısız yanıt / bağlantı hatası "… kaydedilemedi — bilgileriniz korunuyor, …". Başarı 8 sn sonra söner, hata adım değişince kalkar | iki görünüm (`showFeedback`) |
| 12 | Adım altbilgisi sakin çubuk (soluk zemin, ince kenarlık) | `crud/ProductFormStepFooter.vue` (yalnız stil) |

## 3. Korunan davranışın kanıtı

- `tests/fe-r4b-product-form-characterization.test.ts` — **18/18, dosya DEĞİŞTİRİLMEDEN** (her commit sonrası koşuldu). Kapsadığı: alan
  etiketleri/maxlength/kural mesajları, adım adları/durumları/kilitler/aria bağları, Kaydet etkinliği ve ipucu, eksik listesi ve gezinti,
  `saveProduct` / `updateProduct` istek gövdeleri, rowspan DOM'u (sıra, rowspan, sanal pencere kırpması, arama).
- `e2e/specs/product-form-bodies.spec.ts` ve `e2e/specs/fe-r4b-product-form.spec.ts` — **DEĞİŞTİRİLMEDEN** yeşil (3 proje): gövdeler,
  4 adımda axe AA 0 ihlal + yatay taşma yok, kontrol paneli axe 0, rowspan 2/1, ekleme formunda Kaydet kapalı + açıklama, uzun adımda
  aşağı kaydırınca Güncelle görünür. **Seçici değişikliği gerekmedi.**
- Bilerek korunan kısıtlar: `nav[aria-label="Ürün formu adımları"]` içinde yalnız 4 adım düğmesi; tek `<progress>` (görsel karşılığı halka,
  kendisi görsel olarak gizli ama etiketli); önizleme `dt/dd` kullanmaz (kayıt özeti tek açıklama listesi); içerik başlıkları adım
  adlarıyla büyük/küçük harf farklı (e2e `getByText(..., { exact: true })` çakışmaz); yeni düğme adları "Kaydet/Güncelle/Kayıt özeti/
  Eksikleri göster" alt dizesini içermez; alan DOM sırası (Stok kodu → Barkod → Stok → Raf; Satış → Piyasa → Maliyet) aynı.
- Davranış farkı YOK: yalnız `showFeedback` çağrıları eklendi; `saveProduct` istisnada aynı hatayı yeniden fırlatır (önceki
  `try/finally` akışı korunur).

## 4. Testler (bulut, Linux, Chromium 1194 — `playwright.cloud.config.ts`)

Kurulum: `scripts/cloud-setup.sh` → `npx playwright install` 403 (cdn.playwright.dev engelli) → INT_REPORT §3 çözümü: `frontend npm ci`,
`@rollup/rollup-linux-x64-gnu` (`--no-save`), `npm run tokens`, önceden kurulu Chromium.

| Kontrol | Sonuç |
|---|---|
| frontend vitest | **1809 geçti / 18 kırmızı** (1827). 18'in tamamı tabanda da kırmızı (a10/a12/a6b-Standart 9/a7/a8/b4 kabuk, hareket tek kaynak, vuetify tema) — bu dalın dosyalarına değmiyor. Taban (`origin/main` ayrı çalışma ağacı) aynı 18 (+ çalışma ağacına özgü token kopyası farkları). `clientLogTransport` zamanlama testi bir koşuda kırmızı, diğerinde yeşil (bu dalla ilgisiz) |
| — `fe-r4b-product-form-characterization` | 18 / 18 (değişmedi) |
| — yeni `fe-r5b-product-form-layout` | 9 / 9 (önizleme kartı, halka, satır içi geri bildirim, ray daraltma, kategori yolu) |
| `npm run build` | ✓ |
| `test:pattern-ratchet` · `test:no-console-ratchet` · `test:contract-paths` | OK · OK · OK (182 yol) |
| `test:style-ratchet` | tabanla aynı 14 satır (EkSidebarNav, EkWorkspaceTabs, EkPageBar, DefinitionValueChip, ProductVariantListComponent, ChoiceListView — kabuk/başka ekran); bu dalın dosyası listede YOK |
| `test:typecheck-ratchet` | tabanla aynı 2 hata (BrandIntegrationSelectBoxComponent, BrandListComponent); yeni dosyalarda 0 |
| eslint (değişen 11 dosya) | 0 hata |
| a6b Standart 10 (ikon kayıt defteri) | yakalandı ve düzeltildi (`mdi-cloud-upload-outline` → `mdi-upload-outline`) |
| Playwright ürün formu spec'leri, 3 proje, `--update-snapshots=missing` | `product-definition-parts`, `product-definitions`, `product-form-r2c`, `product-variants`, `product-variant-dialogs`, `ds-overlays`, `mob-00/02/03`, `prc-r1-pricing`: 255 test → 166 geçti / 31 kırmızı / 58 atlandı; 31'in 30'u ilk kez yazılan `*-linux.png` ("snapshot doesn't exist … writing actual"), 1'i eşzamanlı koşuda iz dosyası çakışması (ENOENT) → `--last-failed` yeniden: **31/31 geçti**. Son değişiklikten sonra `product-form-bodies` + `fe-r4b-product-form` + `product-definition-parts` + `product-variants`: **43 geçti / 2 atlandı / 0 kırmızı** |
| axe (wcag2a/aa, 21a/aa) | 0 ihlal (`fe-r4b-product-form`: tekil 4 adım + kontrol paneli, varyant adımı, ekleme; mobil/tablet/masaüstü) |

`*-linux.png` dosyaları commit'lenmedi (git-ignored).

## 5. Değişen win32 tabanları (Windows'ta bilinçli yenilenmeli — `npx playwright test <spec> --update-snapshots`)

Ürün formu yerleşimi (ray, adım başlığı, bölüm kartları) değiştiği için formun görüldüğü TÜM tabanlar yenilenmeli (diyalog tabanlarında
da arka planda form görünür):
- `product-definition-parts.spec.ts-snapshots/`: `product-details-*`, `product-images-*`, `product-single-variant-*` × desktop/tablet/mobile = **9**
- `product-variants.spec.ts-snapshots/`: `product-variants-*` = **3**
- `product-variant-dialogs.spec.ts-snapshots/`: `variant-attributes`, `variant-batch-attributes`, `variant-batch-prices`, `variant-generator`, `variant-images`, `variant-platform-prices`, `variant-search` × 3 = **21**

Toplam **33** dosya. Yeni spec'ler (`fe-r5b-review`, birim testi) görsel taban üretmez.

## 6. Göz kontrolü — önce / sonra ve öz-eleştiri turları

Görüntüler: `once/` (42, taban `origin/main` üzerinde AYNI spec ile) ve `sonra/` (44 = 42 + `varyant-3-izgara-ray-daraltilmis` × 1440 açık/koyu).
Ad: `<ekran>-<genişlik>-<tema>.png`; ekleme tüm adımlar `ekle-1-kategori`, `ekle-1b-kategori-secili`, `ekle-2-tanim`, `ekle-eksikler`,
`ekle-3-tekil`, `ekle-4-detay`; düzenleme tekil `duzenle-1…4`, `duzenle-3-tekil-kaydirilmis`, `duzenle-ozet`; varyantlı `varyant-2-tanim`,
`varyant-3-izgara`. Üretim: `R5B_REVIEW=once|sonra npx playwright test -c playwright.cloud.config.ts fe-r5b-review --project=chromium-desktop`
(`R5B_TABLET=1` ara turlarda 800px ekler; rapora girmez).

1. **Tur 1** — *Fark hemen görülüyor mu?* Evet (sol ürün rayı, büyük adım başlıkları, kart bölümler). *Premium mu?* Henüz değil: ürün tipi
   radyo grubu Vuetify grubunu ızgaraya çevirince iki radyo üst üste biniyordu (DOM ölçümüyle doğrulandı) → esnek satır; seçim kartında
   ikon + radyo kalabalıktı → ikon kaldırıldı; önizlemede "Kanal b…" kesiliyor, marka · kategori satırı garip sarılıyordu → kategori yolu
   ayrı satır + ikon, fiyat tam satır; **ray 900px yükseklikte taşıyordu** (Kaydet görünmüyordu) → önizleme/adım/halka sıkıştırıldı.
   Varyant ızgarası rayla ≈ 830px'e düşüyordu → **ray daraltma** eklendi.
2. **Tur 2** — Tablet (800) ve telefon (390): alt yapışkan kayıt çubuğu ve yukarı açılan panel doğru; telefonda bölüm kartı başlığında ikon
   ayrı satıra düşüyordu → başlık bloğu `flex: 1 1 0`; önizleme istatistik kutusunda "VARYANT" etiketi taşıyordu → kolon oranları +
   "Kanal fiyatı"; ikon kayıt defteri testi takma ad glifi yakaladı → düzeltildi.
3. **Tur 3** — Eksik varken "Eksikleri göster 3" + "Kaydet" iki satıra kırılıyor, hazırken tek satır kalıyordu (tutarsız) → **Kaydet her
   durumda üstte tam genişlik**, Eksikler/Kayıt özeti altında; adım altbilgisi kartlarla aynı dile (soluk çubuk). Son bakış: 1440 açık/koyu,
   1280 (e2e), 800, 390'da ray/çubuk, kartlar ve panel tutarlı; koyu temada kontrast token'dan, axe 0. *Kullanıcı ekranı açınca farkı
   hemen görür mü?* Evet — sayfa artık soldaki ürün kartı + dikey adımlar + halka ile açılıyor, içerik bölüm kartlarında. *Premium mu?*
   Evet, kabuğun sakin diliyle (tek vurgu rengi, ince kenarlık, token gölge, hareket yalnız token).

Bilinçli bırakılanlar: kademeli seçicinin boş sağ kolonu (paylaşılan `EkCascadePicker`, packages'a dokunulmadı); "Rekabet ve kâr" paneli
(pricing, kapsam dışı); varyant ızgarası rayla açıkken yatay kaydırır (daraltma ile ≈ 1040px; kabuk menüsü de gizlenebilir).

## 7. İnceleme rotası (yerel: `npm run dev` → http://localhost:3020)

- **Ekleme**: http://localhost:3020 → Ürün kataloğu › **Ürünler** → **Yeni ürün** → Kategori (arama + yol çipleri + kanal eşleşmesi) →
  Ürün Tanımı (seçim kartları, Görseller) → başlık girin → Tekil Ürün Bilgisi → Detay Bilgiler; soldaki rayda önizleme kartı canlı
  güncellenir; "Eksikleri göster" paneli rayın sağına açılır; Kaydet sonrası rayda satır içi "Ürün eklendi" bildirimi.
- **Düzenleme (tekil)**: Ürünler listesinde tekil ürünün **Ürünü düzenle** → adımlar arası gezin, uzun adımda aşağı kaydırın (ray yapışkan).
- **Düzenleme (varyantlı)**: varyantlı ürünün **Ürünü düzenle** → **Varyant Bilgileri** (özet kutucukları + rowspan'lı ızgara) → rayın «
  düğmesiyle daraltın.
- Koyu tema: tema tercihi "Koyu"; dar ekran: tarayıcıyı 800px / 390px'e daraltın (önizleme + şerit üstte, kayıt çubuğu altta).

## 8. Notlar / devreden

- **Kullanıcı kararı kaydı (CLAUDE.md kural 8):** bu tur yeni bir yön içeriyor ("R4-B yetmedi, yerleşim ve görünüm gerçekten değişmeli;
  işlev aynı"). `docs/adr/` bulutta salt-okunur olduğundan satır EKLENEMEDİ — yerelde `USER_DECISIONS.md`'ye önerilen satır:
  `K62 | 2026-10-02 | Ürün ekleme sayfasında değişiklik görünmüyor; temelde işi bozmadan gerçek yeniden tasarım | İşlev/veri/API/doğrulama
  aynı; yerleşim serbest → solda ürün rayı (önizleme · dikey adımlar · halka · Kaydet), bölüm kartları, varyant rowspan aynen | frontend/docs/fe-r5b-review/REPORT.md | UYGULANIYOR`.
  K48 (frontend yalnız bariz düzeltme) ile çelişki yok: bu tur kullanıcının açık isteğidir.
- Yeni dosyalar: `crud/ProductFormSection.vue`, `crud/ProductCategoryStep.vue`, `composables/useProductFormPreview.ts`,
  `tests/fe-r5b-product-form-layout.test.ts`, `e2e/specs/fe-r5b-review.spec.ts` (R5B_REVIEW verilmezse atlanır).
- Kap sorgusu (`@container`) ilk kez bir görünüm iskeletinde kullanıldı (önceden `ProductVariantListComponent`, `CustomerAddresses`'ta vardı).
- Bulut kurulum notu (INT_REPORT §3 ile aynı): `npx playwright install` 403; ilk Playwright koşusunda dev sunucusu soğuk derlemesi
  inceleme spec'inin ilk testini 20 sn sınırında düşürebiliyor (yeniden denemede geçer).

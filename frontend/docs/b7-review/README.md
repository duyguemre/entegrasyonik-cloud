# B7 — Kategoriler ve Markalar sayfaları (`cloud/fe-b7`)

Kullanıcı isteği: "Kategoriler sayfasına ayrı bir iş olarak çalış; daha premium, kullanıcı dostu, albenili, naif ama hoplayıp
zıplamayan, siteye uyumlu bir tasarım. Markalarda aynı şekilde." Beğenilmezse geri alınacak → değişiklik yalnız iki sayfaya ve
onların kullandığı YENİ bileşenlere sınırlı (ortak bileşen değişmedi).

Görüntüler: `before/` (eski), `after/` (yeni) — `<senaryo>-<genişlik>.png`, `-yakin` = 2x yakın çekim.
Araç: `B7_REVIEW=1 B7_REVIEW_WIDTH=1440|390 [B7_REVIEW_SCALE=2] B7_REVIEW_OUT=docs/b7-review/after npx playwright test e2e/specs/b7-review.spec.ts --project=chromium-desktop`
(ölçek 2 geçişi yalnız `-yakin` dosyalarını yazar). Veri: `e2e/fixtures/b7Catalog.ts` (backend yanıt şekilleri; 46 kategori / 4 seviye,
24 marka, eşlemeler).

| Senaryo | Önce | Sonra |
|---|---|---|
| k1 kategori listesi | ✓ | ✓ |
| k2 arama "tişört" | ✓ | ✓ |
| k3 yaprak seçili (Giyim › Kadın › Üst Giyim › Tişört) | ✓ | ✓ (+ `-2` 390 devamı) |
| k4 boş ağaç | ✓ | ✓ |
| k5 "Eşlemesi eksik" süzgeci | — (eskide yok) | ✓ |
| k6 satır içi yeniden adlandırma + satır menüsü | — (eskide yok) | ✓ |
| m1 marka ızgarası | ✓ | ✓ |
| m2 arama "ça" | ✓ | ✓ |
| m3 marka seçili | ✓ | ✓ |
| m4 boş liste | ✓ | ✓ |
| m5 liste görünümü | — (eskide yok) | ✓ |

## 1. Eleştiri (önce)

**Kategoriler**
1. Sayfa başlığı satırı yok (H1 yok); kart başlığı "Kategori Listesi" sekme adını tekrarlıyor — uygulamanın EkPageBar dilinden kopuk.
2. Hiyerarşi okunmuyor: her düğüm çerçeveli kutu, her seviye 48px girinti → 3.–4. seviyede ad alanı eziliyor; 56px satır; baştaki
   "1 ⇅" sıra kutuları en baskın öğe; "(3)" sayısı ada yapışık; yaprak kalın, grup ince (vurgu ters).
3. Seçim yalnız küçük ⚙ düğmesiyle; satırın kendisi seçmiyor. Her açık grupta ayrı "Alt Kategori İsmi" alanı → gürültü.
4. Arama eşleşmeyi vurgulamıyor, eşleşen dalı açmıyor; üstelik **hata veriyordu** (ana kayıtta `children` yok → "Bir şeyler ters
   gitti" toast'ı; before/k2). Alan `type="tel"` (mobilde sayı klavyesi) + gereksiz sayaç.
5. Pazaryeri eşleme durumu ağaçta hiç görünmüyor; öğrenmek için kategori + platform tek tek tıklanmalı.
6. Boş/yükleniyor/hata durumları yok (boşta yalnız arama kutusu; yüklenirken beyaz ekran).
7. 390px: iki panel alt alta, ağaç 520px iç kaydırmalı, detay sayfanın çok altında; geri dönüş yolu yok.

**Markalar**
1. Başlık satırı yok; klasör ikonu (yanlış metafor) + anlamsız sıra numarası; ⚙ tek giriş.
2. Veride olan eşleme (`platforms.<kod>.id`) listede gösterilmiyor.
3. Arama ile ekleme alanı aynı ağırlıkta alt alta; `type="tel"`.
4. Boş durum boş kart; 390'da detay listenin altında kayboluyor.

## 2. Alternatifler ve kararlar

| Sayfa | Alternatif | Karar |
|---|---|---|
| Kategoriler | A) Ağaç + detay paneli (ana-detay) · B) Sütunlu gezinme (Miller) · C) Tam genişlik ağaç-tablo + yan sayfa | **A.** Eşleme durumunu tüm ağaç boyunca bir bakışta gösterir, derin ağaçta arama/süzgeç doğal; B tek dalı gösterir (genel bakış kaybolur) ve ürün formundaki kademeli seçiciyle (fe-a9, kapsam dışı) karışırdı; C'de detay paneli (mevcut eşleme formu) için yer dar. |
| Markalar | A) Izgara kartlar + detay · B) Yoğun liste + detay · C) EkListScreen tablosu | **A + B anahtarla** (istek: ızgara/liste; tercih bu cihazda hatırlanır). Detay Kategorilerle aynı ana-detay dili; C tablo olarak marka adı + platform eşlemesi için fazla ağır. |

**Ortak kararlar**
- Başlık satırı: `EkPageHeader` (Katalog / Kategoriler, (i) sayfa hakkında + ipuçları, tek birincil eylem "Kategori ekle" / "Marka ekle",
  sağda `EkRefreshButton` — Alt+R). Uygulama geneliyle aynı.
- Ana-detay: `CatalogSplit` — kap ≥ 920px iki bölme, her biri kendi içinde kayar; altında tek bölme: seçim yokken liste, seçimde detay +
  "← Tüm kategoriler/markalar" (geri dönünce odak seçili satıra döner). Dar ekranda gruba dokunmak yalnız açar/kapatır (gezinme sürer).
- Detay: üstte özet kartı (yol, ad, tür, platform platform eşleme) + altta **mevcut** `CategorySyncComponent` / `BrandSyncComponent`
  AYNEN (kaydet/sil standart düğmeleri, tehlikeli onay, platform + seçenek eşleme, A6a hata durumları). Sarmalayıcı yalnız dış boşluğu sıfırlar.
- Seçim yokken detay bölmesi = **genel bakış**: sayılar, platform başına eşleme kapsaması (çubuk + "10 / 32 yaprak · %31"), "Eksik olanları
  göster", klavye ipuçları; Kategorilerde otomatik eşleştirme (mevcut uç nokta, ikincil düğme — tek birincil kuralı).
- Eşleme gösterimi: platform başına nokta (dolu = eşli, boş halka = eşlenmedi) + "2/3" metni; grupta "🔗̸ n eksik" (link-off ikonu —
  3. iterasyonda turuncu nokta Trendyol rengiyle karıştığı için değişti). Ad/ipucu/ekran okuyucu metni platform platform döküm verir.
- **Ürün sayısı gösterilmedi:** `CategoryService` / `BrandService` yanıtlarında ürün sayısı yok (backend `get` projeksiyonu) → uydurulmadı.
  **Logo:** Brand modelinde logo alanı yok → her zaman nötr baş harf avatarı.
- Hareket: yalnız opaklık + `distance-sm` kayma, `--ek-duration-*` / `--ek-easing-*` (A9 envanteri), chevron dönüşü; ölçek/zıplama yok;
  reduced-motion token'larla 0.

**Kategoriler — ayrıntı**
- Düzleştirilmiş WAI-ARIA ağacı (`tree/treeitem`, level/setsize/posinset/expanded/selected), tek sekme durağı. 40px satır, 20px girinti
  + ince rehber çizgisi; grup adı orta ağırlık, kök yarı kalın; seçili = aksiyon zemin + 3px sol çubuk (sol menüyle aynı dil).
- Klavye: ↑↓ Home End · → aç/ilk çocuk · ← kapat/üst · Enter/Boşluk ayrıntı · F2 yeniden adlandır · Alt+↑/↓ sıra · harf = atla · `*` kardeşleri aç.
  Arama kutusunda ↓ ağaca iner. Canlı bölge: "Giyim açıldı".
- Arama: Türkçe harf yoksa aksan katlanır (tisort → Tişört), varsa harf bilinçli (ça → Çanta, Olcay değil); `<mark>` vurgu; ataları açar;
  eşleşen grubun alt ağacı görünür; temizleyince aramadan önceki açık düğümler (+ seçilinin yolu) geri gelir.
- "Eşlemesi eksik" süzgeci (sayılı): yalnız eksik yapraklar + ataları.
- Satır içi: ⋯ menüsü (Ayrıntıları aç · Yeniden adlandır F2 · Alt kategori ekle · Konum: Yukarı/Aşağı taşı · Bir üst seviyeye çıkar);
  ad girişi Enter/Esc, 2–160 kuralı (eski formlarla aynı), hata `role=alert`. Sürükle-bırak korunur: ortası = içine taşı, kenar = kardeşle
  yer değiştir (eski ağaçla aynı iki uç nokta + aynı "taşınabilir mi" kuralı).
- Performans: > 300 görünür satırda `v-virtual-scroll` (sabit 40px); klavye odağı sanal satır çizilene kadar kare bekler (e2e: 648 satır →
  DOM'da < 120).
- Durumlar: iskelet (girintili çizgiler), `EkProblemState` + Tekrar dene, ilk kategori boş durumu, arama/süzgeç boş sonucu (temizle / tümünü göster).

**Markalar — ayrıntı**
- `listbox/option`, dolaşan tabindex; ızgarada ↑↓ satır atlar (sütun sayısı ölçülür), ←→ Home End, Enter seçer, harf = atla.
- Kart: nötr baş harf avatarı (İY, ÇO — Türkçe büyük harf) + ad + noktalar + kısa özet ("Tamamı eşli" / "2/4 eşli" / "Eşleme yok").
  Liste: avatar + ad + (geniş kapta) platform çipleri, dar kapta noktalar.
- Platformlar `BrandSyncComponent` ile aynı kural: pazaryeri + e-ticaret + ERP, `hasBrandMapping === false` hariç.

## 3. İterasyonlar (ekran görüntüsü → eleştiri → düzeltme)

1. **İlk kurulum:** iki bölme hiç yan yana gelmedi (kap sorgusu kabın kendisini hedefliyordu → dış sarmalayıcı kap oldu); grup "eksik"
   çipleri her satırda turuncu dolgu → gürültü, sakin nokta + metne indi; tüm kısayol ipuçlarında "↑ + ↓" akor gibi okunuyordu → "↑/↓".
2. **390 + durumlar:** dar ekranda gruba dokunmak detaya atlayıp ağacı gizliyordu → dar kapta grup dokunuşu yalnız açar; boş ağaçta genel
   bakış 0/0 çubukları gösteriyordu → yalnız yönlendirme; ızgara kartında "Tüm platformlarda eşli" taşıyordu → kısa özet + üç nokta;
   "ça" araması Olcay'ı buluyordu → Türkçe harf varsa katlama yok; ipucu satırı flex yüzünden kelime kelime kırılıyordu → akış metni;
   dar kapta detayda × ile ← yan yana (gereksiz) → × gizlendi.
3. **Yakın çekim:** eksik işareti (turuncu nokta) Trendyol noktasıyla karışıyordu → link-off ikonu; eşleme kartları kanal renkli dolgu
   (üç renkli şerit, "naif" değil) → nötr kart + kanal noktası + yeşil ✓ "Eşli", eşlenmemiş kesik kenar; sağda ~55px boş sütun → kaydırma
   çubuğu payı kaldırıldı; sanal listede End/Home odağı kaçıyordu → kare bekleme.

## 4. Değişen dosyalar (geri alma listesi)

Geri almak için: aşağıdaki iki sayfayı `origin/cloud/ds-v2-a6b` hâline döndürüp `src/components/catalogPages/` klasörünü silmek, test
güncellemelerini geri almak ve mandal tabanındaki iki satırı eski değerine çekmek yeterli.

- `src/views/secure/productDefinitions/CategoryListView.vue` (yeniden yazıldı)
- `src/views/secure/productDefinitions/BrandListView.vue` (yeniden yazıldı)
- `src/components/catalogPages/` (YENİ, yalnız bu iki sayfa kullanır): `catalogModel.ts`, `CatalogSplit.vue`, `CatalogOverview.vue`,
  `CatCoverage.vue`, `CatMappingDots.vue`, `CatNameInput.vue`, `CatSegmented.vue`, `CategoryTree.vue`, `CategoryTreeRow.vue`,
  `CategoryDetail.vue`, `BrandCollection.vue`, `BrandDetail.vue`
- Testler: `tests/b7-catalog-pages.test.ts` (yeni), `e2e/specs/b7-catalog-pages.spec.ts` (yeni), `e2e/specs/b7-review.spec.ts` (yeni),
  `e2e/fixtures/b7Catalog.ts` (yeni); bilinçli güncellenen: `e2e/specs/category-definitions.spec.ts`, `brand-definitions.spec.ts`,
  `definition-forms.spec.ts`, `a6a-review-mapping.spec.ts` (seçim ⚙ yerine satır/kart; yeni yüzey metinleri; dar kapta tek bölme).
- Mandal tabanları: `pattern-baseline.json` (pageHeaderMissing 4 → 2: iki sayfa artık EkPageHeader kullanıyor), `no-console-baseline.json`
  (CategoryListView 1 → 0).
- Belgeler: `DESIGN_SYSTEM.md` §19, bu klasör.

**Dokunulmayanlar:** `CategoryListComponent`, `CategoryTreeComponent`, `CategorySyncComponent`, `BrandListComponent`, `BrandSyncComponent`,
tüm `ds/` bileşenleri, depolar, `screens.ts`/menü, kategori seçici (fe-a9). Uç noktalar/gövdeler aynı.

**Görsel tabanlar:** `category-definitions` ve `brand-definitions` ekran görüntüsü tabanları (win32) Windows'ta bilinçli yeniden
tabanlanmalı (sayfa tamamen değişti).

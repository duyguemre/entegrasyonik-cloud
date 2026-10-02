# fe-r4d — Şerit D: bekleyen önyüz borçları (RAPOR — bitiş işareti)

Sözleşme: `docs/cloud-contracts/FE_FEEDBACK_R4_2026-10-02.md` Şerit D (K61). Dal `cloud/fe-r4d`, taban `origin/main`
(`199628a` = faz3-arayuz @ b68ae6f7). Değişiklik yalnız `frontend/` (backend, docs/adr, kök dosyalar dokunulmadı).
Görüntüler: `sonra/` (1440 açık + koyu, 390; D1 ayrıca 800 tablet odak karesi). Üretim:
`FE_R4D_REVIEW=1 npx playwright test e2e/specs/fe-r4d-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop`.
"Önce" karesi yok: D5'te eylemler hiçbir şey yapmıyordu (görsel fark yok), D1/D2/D3/D4 test/betik düzeltmesi.

## Madde madde

| Madde | Yeniden üretim | Kök neden | Çözüm | Commit |
|---|---|---|---|---|
| **D1** prc-r2 mobil/tablet axe | Tablet: 2 test her koşuda kırmızı (`scrollable-region-focusable`, `.ek-grid`); kontrast ihlali bu ortamda üretilemedi | (a) Fiyat ızgaraları 800px'te yatay taşıyor; hücrelerinde odaklanabilir öğe yok (geçmiş, kapalı durum) → klavye kullanıcısı kaydıramıyor (WCAG 2.1.1). (b) ~#7891e1 = birincil renk ile zemin arası **geçiş karesi**: axe, hareket token'ının (150–300ms) renk geçişi sürerken koşunca ara rengi ölçüyor — yerleşmiş renk AA'yı geçiyor | (a) `EkDataGrid`'e isteğe bağlı `focusableScroll` (EKLEME; varsayılan kapalı): taşma varken kap `tabindex=0`, `role=region`, ad "<liste> — kaydırılabilir", odak halkası token'dan. Fiyat kuralları ekranının 3 ızgarasında açık. (b) Ölçümden önce süren sonlu animasyonlar beklenir (`e2e/fixtures/settle.ts`, sabit bekleme değil) | `d7199e9`, `c51b745` |
| **D2** list-standard tablette sayfalama ~183px | Bulutta 4 işçi + `--repeat-each=6` yeşil; ölçümle kök neden kanıtlandı | **Ölçüm yarışı, yapışkanlık hatası değil.** Tur teklifi kartı kabuk hazır olduktan 900ms sonra açılır ve çalışma alanına kendi yüksekliği kadar alt pay ayırır (`--ek-tour-offer-space`). Tablette kart 158.5px + 24 = **183px** (ölçüldü). İki `boundingBox` ölçümü arasında açılırsa sayfalama 183px yukarı çıkıyordu (yavaş/yüklü makinede) | Test, teklif açılıp pay yerleştikten sonra ölçer (P15 "tur teklifi payı" kapsamı korunur; teklif gizlenmez). Ürün kodu değişmedi | `2a64033` |
| **D3** legacy-definition | Bulutta yeşil (2 işçi ve 4 işçi) | Önceki raporlarda (INT_1001, fe-mob2) yalnız 4 işçili yük altında `gotoAuthed` 20sn kabuk beklemesinde zaman aşımı; tek başına yeşil | Kod değişikliği gerekmedi; D5 testleri eklendi. Yük kaynaklı zaman aşımı → aşağıda "ortam" | — |
| **D3** mcp-connections / mcp-consent axe | Bulutta yeşil | Koyu tema axe'ı `forceDarkTheme` sonrası **sabit 300ms** bekliyordu; tema renk geçişi yük altında bitmeden ölçülünce ara renk → kontrast ihlali. Açık tema axe'ı radyo seçimi / rehber açılımı geçişinin hemen ardından koşuyordu | `forceDarkTheme` + her axe çağrısı öncesi `settleAnimations` | `c51b745` |
| **D3** privacy-data (C1.6) | İşlevsel testler bulutta yeşil; yalnız `-linux.png` tabanı yazımı | Aynı sınıf: diyalog açılış geçişi sürerken axe (silme doğrulama / onay diyaloğu) | 6 axe çağrısı öncesi `settleAnimations` | `c51b745` |
| **D3** product-variant-list | 3 projede kırmızı (`.pvl-ch.is-unsent` 4 beklenip 0) — **gerçek** | Test eskimiş: FR2 madde 21 gönderilmeyen kanalları kanal başına pasif karo yerine tek soluk "+n" hapında topladı; spec eski 4 karoyu arıyordu. Axe kısmı bulutta yeşil | Spec yeni sözleşmeye göre: durum karosu yok, "+4" düğmesi "4 kanala gönderilmedi. Ayrıntı" adlı, bilgi kartı 4 kanalı "Gönderilmedi" ve "Kanallara yükle" yönergesiyle listeler. Bileşen değişmedi (ürün/varyant alanı DOKUNMA) | `e9f70c4` |
| **D3** ds-overlays | Bulutta yeşil (mobil 4 test tasarım gereği atlanır) | Önceki "Ürünü düzenle çift eşleşme" kırmızısı bu tabanda yok (sonraki commit'lerde giderilmiş); kalan risk axe geçiş anı | 2 axe çağrısı öncesi `settleAnimations` | `c51b745` |
| **D4** pattern-baseline / EkPageBar | `CategoryDefinitionView` + `BrandListView` + `CategoryListView` `pageHeaderMissing=1` (başlıkları var) | `hasPageHeader` yalnız `EkPageHeader` ve başlıklı `EkListScreen`'i tanıyordu; (a) doğrudan `<EkPageBar>` çizen ekran, (b) içeriğini yönetici bileşene devreden ekran (`CategoryDefinitionView → CategoryManager`, `BrandListView → BrandListComponent`) eksik sayılıyordu | Betik `<EkPageBar>`'ı tanır ve ekranın içe aktardığı yerel bileşen zincirini (en çok 2 adım, döngü korumalı, `components/page/**` şablonları hariç) izler. Taban `--write` ile **yeniden üretildi** (elle düzeltme yok): eksik 5 → 2 (yalnız gerçekten başlıksız `AdminView`, `TEST.vue`); taban dosya listesindeki 4 silinmiş/17 eksik dosya da güncellendi | `f5e9f86` |
| **D5** definitions/* satır eylemleri | 7 ekranda `onClick: () => {}` | Prototip ekranlar (sabit örnek veri, backend uç noktası YOK — `pageHelp.ts`) eylemleri hiç bağlamamıştı | Tek kaynak `components/definitions/legacyDefinitionRows.ts` + `LegacyDefinitionRowDialogs.vue`: **Düzenle** → `EkFormDialog` (iki kolon, ad zorunlu + e-posta biçimi, alan altında "<ne oldu> — <ne yapılmalı>"), **Sil** → `EkConfirmDialog` (danger, odak Vazgeç, soru başlığı). İstek atılmaz (örnek veri sekme ömrü boyunca güncellenir; diyalog açıklaması bunu söyler). Aynı `id`li satırlar için sıra anahtarı → seçim de artık satır başına (önceden tek tık 6 satırı seçiyordu). `ProductDefinitionView` dokunulmadı | `b955a60` |

## Kararlar
1. **D1 düzeltme yeri.** (a) `EkDataGrid` varsayılanını değiştirmek tüm ızgaraları etkiler (paylaşılan paket: yalnız ekleme);
   (b) ekranda `tabindex`'i her zaman eklemek taşma yokken boş sekme durağı yaratır; (c) **isteğe bağlı prop, taşmaya bağlı**.
   Seçim (c). Öneri (onaya): `focusableScroll` taşma durumunda varsayılan olsun — diğer taşan ızgaralar da aynı WCAG kuralına takılabilir.
2. **Kontrast "geçiş anı".** Renkler değiştirilmedi: yerleşmiş renkler AA'yı geçiyor; sorun ölçüm zamanı. Sabit bekleme
   (`waitForTimeout`) yerine tarayıcının animasyon listesi (`document.getAnimations()`) beklenir; sonsuz animasyonlar hariç.
3. **D2 ürün davranışı.** Teklif kartının alt payı (FR2-SHELL madde 3: kart içeriği örtmesin) bilinçli; kaldırılmadı.
4. **D5 kapsamı.** Ekranlar sahte veri gösterdiği için "gerçek" kayıt/silme yok; yeni API uydurulmadı. Temizlik kararı
   (FRONTEND_CLEANUP_PLAN D-01: 7 ekranın silinmesi) ürün sahibinde duruyor; bu iş onu değiştirmez.

## Testler (bulut, Chromium 1194, 4 çekirdek)

| Kontrol | Sonuç |
|---|---|
| vitest (tam) | **1748 geçti / 18 kırmızı** — 18'in tamamı tabanda (`199628a` ayrı çalışma ağacında) birebir aynı; yeni: `fe-r4d-legacy-definition-rows` 7, `pattern-counts` +5 |
| `npm run build` | geçti |
| desen mandalı | OK (taban yeniden üretildi, 2 eksik başlık) |
| no-console / sözleşme yolu | OK / OK (173 kanca) |
| stil mandalı | **TABAN KIRMIZI** — EkPageBar, EkSidebarNav, EkWorkspaceTabs (kabuk), ProductVariantListComponent, ChoiceListView, DefinitionValueChip; tabanda aynı, bu dal değiştirmedi (kabuk DOKUNMA) |
| vue-tsc | **TABAN KIRMIZI** 2 hata (`BrandIntegrationSelectBoxComponent:12`, `BrandListComponent:41`) — tabanda aynı |
| ESLint (değişen dosyalar) | 0 hata (uyarılar eski tanım ekranlarındaki `var`/kullanılmayan değişken, önceden vardı) |
| D kapsamı 8 spec, 3 proje, 4 işçi | **239 geçti, 0 kırmızı**, 13 atlandı (tasarım gereği: mobil ds-overlays/yapışkan sayfalama) |
| prc-r2 `--repeat-each=2/3` mobil+tablet | 54/54 (düzeltme öncesi tablet 6/6 kırmızı) |
| list-standard yapışkan `--repeat-each=3`, 4 işçi | yeşil |
| D5 e2e (7 ekran × 3 proje, axe dahil) | 21/21 |
| Frontend Playwright tam koşu (tek sefer, 4 proje, 4 işçi, 1.4 sa) | **3210 test: 1831 geçti, 1173 atlandı, 206 kırmızı** — 179'u yalnız "`-linux.png` tabanı yok, yazıldı" (bulut ilk koşusu; tabanlar Windows), 27 davranış kırmızısı aşağıda sınıflı. D kapsamındaki spec'lerden **hiçbiri** kırmızı değil |

## Kalan kırmızılar (sınıflı)
27 davranış kırmızısı ayrıca 2 işçiyle yeniden koşuldu; aynı 22'si `199628a` tabanının ayrı çalışma ağacında da koşuldu.

| Sınıf | Testler | Kanıt / not |
|---|---|---|
| **Taban** (tabanda birebir aynı kırmızı; bu dalın dokunmadığı dosyalar) — 22 | `dark-mode:102` ×8 (axe `aria-tooltip-name: #tour-homepage-smartsearch` — üst bar akıllı arama, kabuk/Şerit A); `design-system:29` ×4 (axe `color-contrast` `#ek-side-v-*` — EkSidebarNav, kabuk); `category-definitions:67` mobil+tablet; `financial:447` ×3 (P03 başlık araçları); `navigation:161` tablet+masaüstü (zaman aşımı); `admin-characterization:50`; `logs-characterization:79` (strict mode çift "Ürün adı" kutusu); `logs:84` mobil | Taban koşusu: 24 kırmızı / 1 geçti (aynı seçim). Kabuk ve tema dosyaları DOKUNMA kapsamında → Şerit A / ilgili sahiplere |
| **Ortam** (yük; 4 çekirdekli bulutta 4 işçi + vite) — 5 | `settings` mobil ×4, `logs:28` mobil | 2 işçiyle yeniden koşuda yeşil. Yerelde (12 çekirdek) beklenmez |
| **Gerçek** (bu dal) | — | Yok |
| Ek: vitest 18 / stil mandalı / vue-tsc 2 | yukarıdaki tabloda | Tabanda birebir aynı |

## Değişen win32 tabanları
Yok. Bu dal hiçbir `*-win32.png` tabanını değiştirmedi; görünür değişiklik yalnız D5 diyalogları (taban testi yok) ve
fiyat ızgarasının odak halkası (yalnız odakta). Yerelde yeniden üretilmesi gereken taban beklenmiyor; `legacy-definition`
ekran görüntüsü tabanları değişmedi (tablo görünümü aynı).

## Rapora yazılanlar (dokunma alanı)
- Stil mandalı ve vue-tsc tabanda kırmızı (kabuk/ürün dosyaları) — Şerit A/B/yerel cila sahipleri.
- vitest 18 kırmızı (a10/a12/a6b/a7/a8/b4 kabuk sözleşme testleri, hareket tek kaynak, vuetify tema karakterizasyonu) — yerel
  FE-LOCAL-1002 cilasının testleri güncellemediği izlenimi; kabuk Şerit A'ya ait.
- Öneri: `EkDataGrid focusableScroll` varsayılan olsun (Karar 1).

# BO-R2a raporu — backoffice sistem katmanı (K59)

Dal: `cloud/bo-r2a` (← `origin/main` + `origin/cloud/fe-cfg2` birleştirildi; fe-cfg2 raporu görev başında hazırdı, bekleme gerekmedi).
Kaynak: `docs/cloud-contracts/BO_FEEDBACK_R2_2026-10-01.md`. Desen: `docs/BO_UI_PATTERNS.md` **§12** (bo-r2b bunu izler).
Envanter: `INVENTORY.md`. Kareler: `once/` (işe başlamadan, 21 ekran × 1440 açık + koyu + 390) · `sonra/` (aynı set).
Kapsam yalnız `frontend/backoffice/` (+ kök `frontend/package-lock.json` workspace satırı); `packages/ui` ve `packages/chat`
**değişmedi** → web uygulaması etkilenmez.

## 1. BO2 madde durumu

| Kimlik | Durum | Ne yapıldı |
|---|---|---|
| BO2-01 Envanter | ✅ | `INVENTORY.md`: 21 tekrar eden yapı (yer, mevcut, hedef, durum), sayfa başına gözlem, ölü kod |
| BO2-02 Ortak bileşenler | ✅ temel / 🟡 sayfalar | 12 yeni ortak bileşen + grafik katmanı (§2). Yerel kopya mandalı (8 kural) azalan tabanla; 3 kural tabanı **0** (h1, Yenile, SVG grafik) |
| BO2-03 Sayfa sayfa düzenleme | 🟡 | Genel bakış + teknik ayrıntılar bu görevde; kalan sayfalar **bo-r2b** (taban listesi = iş listesi) |
| BO2-04 Sayfa başına özet | ✅ | §3 |
| BO2-10 Dar yan boşluk | ✅ | `.bo-page` 24 → 16 px yan (mobil 16 → 12), tavan 1440 → 1760 px, üst 24 → 20 px — tüm sayfalar |
| BO2-11 Bölümler ayrışsın | ✅ bileşen / 🟡 sayfalar | `BoSection` (kart + başlık bandı + boşluk hiyerarşisi); genel bakışta tüm bölümler kart. 24 yerel başlık çubuğu tabanda |
| BO2-12 Eş yükseklik + hizalı | ✅ bileşen + pano | `BoTileGrid` (stretch); genel bakış iki satır + KPI şeridi + teknik ayrıntılar 3+2. e2e ölçer (±1 px) |
| BO2-20 Standart başlık | ✅ | `BoPageHeader` tüm sayfalarda: ekran ikonu kapsülü (≥ 600 px), tek ölçek h1, alt ayraç, sağda eylem grubu, Yenile en sağda |
| BO2-30 Tek tipografi ölçeği | ✅ | `typeRole` 9 rolü + mandal (font-size/weight/font, satır içi stil). 9 ölçek dışı değer düzeltildi; taban **0** |
| BO2-40 Standart datatable | ✅ bileşen / 🟡 sayfalar | `BoDataTable` (EkDataTable + 36 px + 4 durum + sayfalama yuvası), `BoTableFrame` (özel satır). Taban: 19 + 6 |
| BO2-41 Tek filtre + sayfalama | ✅ sayfalama / 🟡 filtre | `BoPagination` (8 liste taşındı, `LoadMore` silindi), `BoFilterBar` + `BoSegmented` hazır. Taban: segment 22, yerel sayfalama 6 |
| BO2-50 Eylem sözlüğü | ✅ | `actions.ts` (18 eylem, paket `ACTION_ICONS` glifleri) + `BoAction`; 18 sayfa başlığı Yenile taşındı (taban **0**) |
| BO2-60 ECharts | ✅ | echarts ^6 + vue-echarts ^8 (backoffice paketine, uygulamayla aynı sürüm), tree-shaken SVG; token'dan açık/koyu tema; `BoChart` (4 durum, erişilebilir özet, tablo görünümü, eşik çizgisi); `Sparkline`/`BarTrend`/`SeriesBars` taşındı (API aynı → Loglar, Motor, Kullanım, Müşteri kullanımı otomatik); yeni: API isteği alan grafiği, müşteri durumu halkası |
| BO2-70 Uzun sayfa bölme | ✅ bileşen / 🟡 sayfalar | `BoTabs`, `BoViewSwitch`, `BoCollapsible` (+ mevcut `BoDetailSection`); kural §12.5. Pano: dikkat listeleri yoğun + katlanır açıklama |
| BO2-71 Yatay kaydırma yok | ✅ pano | e2e `scrollWidth ≤ clientWidth` (3 proje); teknik ayrıntılar kuyruk tablosu dar kutuda sayı kutularına çevrildi |
| BO2-P1 Genel bakış | ✅ | §3.1 |
| BO2-P2 Teknik ayrıntılar | ✅ | §3.2 |
| BO2-P3..P7 | ⏭ bo-r2b | devir notları §6 |

## 2. Oluşturulan / standartlaşan bileşenler

**Yeni — `src/components/r2/`:** `BoSection`, `BoTileGrid`, `BoStat`, `BoAction` + `actions.ts`, `BoFilterBar`, `BoSegmented`,
`BoPagination`, `BoTableFrame`, `BoDataTable`, `BoTabs`, `BoViewSwitch`, `BoCollapsible`.
**Yeni — `src/components/charts/`:** `BoChart.vue`, `chartTheme.ts` (saf), `options.ts` (saf), `register.ts` (tek ECharts kaydı).
**Standartlaşan (atılmadı):**
- `BoPageHeader` — ekran ikonu, tek ölçek, ayraç, `hideIcon`; `:auto-refresh` artık panoda da tek metin.
- `BoTriageSection` — soru başlığı `title` (22) → `heading` (16) (h1 ile yarışmıyor), iç boşluk ritmi.
- `BoAttentionList` — `compact`: ne oldu / önem / sayı / süre / müşteriler / **eylem** görünür; "neden + ne yapmalı + yerinde
  yetenek" `BoCollapsible inline` altında ("Neden ve ne yapmalı" → "Açıklamayı gizle"). Varsayılan (diğer sayfalar) değişmedi.
- `BoStatusHeader` — ölçek dışı geri düşüş kaldırıldı. `PageVerdict`, `BoActionCard`, `BoDetailSection` — değişmedi (zaten ölçekte).
- `Sparkline`, `BarTrend`, `kit/SeriesBars` — çizim BoChart'ta; prop sözleşmesi aynı.
- `kit/LoadMore` → silindi, `BoPagination`.

## 3. Sayfa başına değişiklik

### 3.1 Genel bakış (`/genel-bakis`) — BO2-P1
- **Önemli metrikler öne:** hükmün hemen altında 6 kutuluk KPI şeridi (`BoStat`): Kritik konu · İzlenecek konu · API isteği 24 sa
  (+ sparkline) · 5xx hata oranı (+ sparkline, eşik) · Aktif müşteri · MRR. Ayrıntı ⓘ ipucunda ya da kutunun bağlantısında.
- **Metin yükü azaldı:** dikkat maddelerinde açıklama ve "ne yapmalı" katlandı; görünür limit 4/5 → 3 (mobil 2, kritikler hep görünür).
  Sayfa açıklaması kısaldı. Ölçüm (tam sayfa yüksekliği): **1440 açık 2.291 → 1.808 px (−%21)**, üstelik KPI şeridi ve grafik
  eklendi. 390 px'te 3.026 → 3.389 px (+%12): KPI şeridi (2 sütun × 3 satır) öne geldi, dikkat listeleri 2 maddeyle kısa —
  CONSOLE_IDENTITY "mobilde önce hüküm ve sayılar" kuralı; bo-r2b gerekirse şeridi mobilde 4 kutuya indirebilir.
- **Hizalı düzen:** duvar düzeni yerine iki eş yükseklikli satır (1 Sistem | 2 Büyük resim · 3 Müşteriler | 4 Genel kullanım; K51
  okuma sırası korundu). "Büyük resim" kutusuna API isteği alan grafiği (ECharts, 24 sa saatlik, tablo görünümü); "Genel kullanım"
  müşteri durumu halkası + abonelik sayıları (aktif müşteri ve MRR şeritte, tekrar yok).
- Yenile → `BoAction`; sabit "Sekme açıkken…" notu `:auto-refresh`.

### 3.2 Teknik ayrıntılar (`/genel-bakis?ayrinti=teknik`) — BO2-P2
- Önce: 2 sütun `align-items: start` (farklı yükseklik) + tek başına "Veri alımı" + tam genişlik yönetim işlemleri.
  Açık ayrıntıyla tam sayfa (1440): 3.448 → 2.597 px.
- Sonra: **satır 1** (3 eş kutu) Bağımlılıklar · Kuyruklar · Veri alımı; **satır 2** (2 eş kutu) Podlar · Son yönetim işlemleri.
  Kutular `BoSection` (ikon + başlık + açıklama + alt bağlantı `#footer` — alt bağlantılar aynı hizada). Kuyruk tablosu üçte bir
  genişlikte yatay kayıyordu → kuyruk başına 2×2 sayı kutusu. Pod tablosu `BoTableFrame`. Olay kodu satırdan kaldırıldı (ipucunda).
- "Bağımlılıklar ve podlar" kartı ikiye ayrıldı (e2e `r1a.spec.ts` başlık adı güncellendi).

### 3.3 Diğer sayfalar (yalnız sistem katmanı etkisi; içerik/düzen bo-r2b)
- Tümü: daha dar yan boşluk, yeni başlık (ikon + ayraç), Yenile sözlükten (18 sayfa).
- Liste alt bilgisi `BoPagination`: başarısız işler, zamanlanmış koşular, teslimler, duyurular, müşteri bildirim geçmişi, uyarılar,
  abonelik listesi, Mongo koleksiyonları.
- ECharts grafikleri: Motor › kuyruk saatlik iş, Kullanım ve müşteri kullanımı (günlük aktif), Loglar (kategori/sorun eğilimi, olay çubukları).
- Ölçek dışı font düzeltmeleri: komut paleti girişi, üst bar avatarı (bold → semibold), "yakında" ikonu, giriş kodu alanı,
  başarısız iş toplamı, `.bo-mono`, `.bo-table .is-id`, `.bo-code`.

## 4. İnceleme rotaları (yerel: `npm run dev:backoffice` → http://localhost:3100)
- http://localhost:3100/genel-bakis — KPI şeridi, yoğun dikkat listesi ("Neden ve ne yapmalı"), eş yükseklikli satırlar, grafikler
- http://localhost:3100/genel-bakis?ayrinti=teknik — 3+2 hizalı ızgara
- http://localhost:3100/motor — ECharts yığılmış sütun (kuyruk saatlik), yeni başlık
- http://localhost:3100/musteriler/kullanim — ECharts günlük aktif
- http://localhost:3100/loglar — sparkline + olay eğilimi (bir sorun grubunu açın)
- Koyu tema: sağ üst tema düğmesi; sakin senaryo: konsolda `__boMock.setCalm(true)` + Yenile
- Kareler: `docs/bo-r2-review/once/*.png` ↔ `sonra/*.png` (aynı ad)

## 5. Test sonuçları
| Kapı | Sonuç |
|---|---|
| `npm run test:backoffice` | backoffice **33 dosya / 357 test geçti** (yeni: `r2-system` 11, `r2-charts-actions` 7) + ui **6 / 43 geçti** |
| frontend vitest tam (`npm test`) | **94 dosya / 1.751 test geçti** |
| chat vitest (`npm run test:chat`) | **12 dosya / 183 geçti, 1 atlandı** (paket değişmedi) |
| vue-tsc | uygulama `typecheck` 0 hata (typecheck-ratchet taban 0 korundu); backoffice `vue-tsc -p tsconfig.json` 0 hata |
| Ratchet'ler | style (635 dosya) · pattern (319 dosya) · no-console · typecheck — hepsi OK |
| `test:contract-paths` | OK (171 yol kancası) |
| `build:backoffice` + `build` | ikisi de başarılı. ECharts ayrı tembel parça `BoChart-*.js` 578 kB (gzip 201 kB) |
| Backoffice Playwright ara adımlar | `r1a` 6/6, `r2a` 12/12 (3 proje), `smoke`+`mobile`+`engine-tenant`+`r1a`+`r2a` yeniden koşu 101 geçti (8 kırmızı = yalnız "linux tabanı yok, yazılıyor") → smoke tek başına **48 geçti / 3 atlandı** |
| **Backoffice Playwright tam koşu** (3 proje, `--update-snapshots=missing`, 28 dk) | **371 geçti, 167 atlandı (inceleme/ortam kapılı), 5 kırmızı.** Kök nedenler aşağıda; düzeltme sonrası `notifications`+`smoke` yeniden koşu **67 geçti / 6 atlandı / 2 kırmızı** |

Kırmızıların açıklaması:
1. **Katalog önizleme (notifications.spec:144, 3 proje) — düzeltildi.** axe, betiksiz `sandbox=""` e-posta çerçevesine betik
   enjekte edemediği için ~31 sn bekliyordu (ölçüm: çerçeveli 31,3 sn / çerçeve hariç 1,1 sn); 45 sn test bütçesini aşıyordu.
   **Taban commit'te (fafc2d7f) de aynı** (axe 32,7 sn, tek başına da zaman aşımı) → R2a'dan önce var. Test sağlamlaştırıldı:
   `expectNoA11yViolations(page, undefined, '[data-testid="email-frame"]')` (yalnız sandbox'lı çerçeve hariç; sayfa taranıyor).
   Test atlanmadı/devre dışı bırakılmadı.
2. **Smoke "Log kontrol merkezi" görsel taban (açık + koyu) — R2a dışı.** Karşılaştırma, bu oturumda yazılan yerel `*-linux.png`
   ile; fark sahte log verisinin rastgeleliği (grup sayıları/sırası, ör. "64 uyarı" ↔ "62 uyarı", ek hüküm maddesi) — yerleşim aynı.
   Önceki smoke koşusunda aynı test yeşildi. Linux tabanları git-ignored; Windows tabanları yerelde yeniden üretilmeli (§6.10).
3. Ara koşudaki diğer kırmızılar giderildi: grafik alanı `role="img"` adı (Loglar sorun eğilimi, Motor `order-sync-queue`
   metni ikilenmesi), dokunmatik 44 px (grafik düğmeleri, kullanım sayıları, müşteri "Şu an" satırları — dar kenar boşluğuyla tek
   satıra sığdıkları için 39 px'e inmişlerdi).

Notlar: bulutta Playwright `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` ile (kurulum betiğinin tarayıcı indirmesi
`cdn.playwright.dev` 403); rollup linux ikilisi `npm i --no-save @rollup/rollup-linux-x64-gnu@4.63.5`; token css `npm run tokens`.
İlk soğuk koşuda Vite yeni bağımlılığı (echarts) ön-derlerken sayfayı bir kez yeniden yükler → ilk girişte zaman aşımı; ısınınca yok.
`*-linux.png` commit'lenmedi.

## 6. bo-r2b için devir notları
1. **İş listesi = taban:** `tests/r2-baseline.json`. Her sayfa taşındığında ilgili satır düşer; `R2_BASELINE_WRITE=1 npx vitest run
   tests/r2-system.test.ts` ile taban güncellenir (artış her zaman hata). Hedef: tümü 0.
2. **Sayfa iskeleti (§12.5):** `BoPageHeader` → `PageVerdict` → (varsa) `BoTileGrid :min` + `BoStat` → `BoSection`/`BoTileGrid :cols`
   → `BoTabs`/`BoDetailSection`. Başlık çubuğu + `EkCard` ikilisi tek `BoSection` olur (`#actions` içine panel `EkRefreshButton`).
3. **Listeler:** `EkDataTable` → `BoDataTable` (aynı `columns`, `#cell-*` yuvaları geçer; `phase` = `StateBlock` fazı), alt bilgi
   `#footer` → `BoPagination`. Yerel "Daha fazla" (Denetim, Loglar) ve `.bo-table-foot` (Müşteriler, Duyurular, Müşteri geçmişi,
   Rekabet istisnaları) → `BoPagination` (`total` biliniyorsa ver).
4. **Filtreler:** `.bo-toolbar` + yerel radiogroup → `BoFilterBar` + `BoSegmented` (`options` sayaçlı). "Filtreleri temizle"
   yalnız `BoFilterBar`'ın kendi düğmesi; etkin süzgeç sayısını verin.
5. **Eylemler:** sil/düzenle/dışa aktar/yeniden dene → `BoAction kind=…` (satırda `icon-only` + `object`). `mdi-delete` /
   `mdi-delete-outline` karışıklığı sözlükle biter (çöp kutusu). Bağlantı "→" kopyaları (`bo-link-more`, `__more`, `__link`) →
   `BoAction kind="detail" :to` ya da `BoSection #footer`.
6. **KPI:** `EkMetricCard` (Kuyruklar, Redis, Mongo, API sağlığı, Gelir, Önbellek, Kullanım) → `BoStat` + `BoTileGrid :min`.
   Uzun `description` → `hint` (tek satır) + `info`.
7. **P3 Otopilot:** sohbet paketi değişirse web `src` + chat vitest + frontend e2e sohbet spec'leri; backoffice tarafında önce
   `OtopilotView` kabuk genişliği (tam sayfa ise `.bo-page` tavanını kaldırın) — paket değişmeden çözülebilir olabilir.
8. **P6 Motor:** `BoViewSwitch` (Özet = hata koduna/türe göre gruplu sayı + en eski; Ayrıntılı = `BoDataTable`: tür, durum, hata
   nedeni (kod → `codes.ts` iletisi), deneme, zaman, müşteri, iz). Eksik alan için BE isteği aşağıda.
9. **Ölü kod:** `components/HealthKpi.vue`, `backoffice.css` `.bo-page__head/__title/__lede` (kullanım yok) silinebilir.
10. Görsel taban (`*-win32.png`) Windows'ta yeniden üretilmeli: başlık, boşluk ve grafikler değişti (smoke `genel-bakis`,
    `musteriler`, `loglar`, `denetim` tabanları fark verecek — beklenen).

## 7. PROPOSALS_PENDING / backend istekleri
- **BE (BO2-60, düşük):** `getPulse.calls.integration.hourly` (kanal çağrısı saatlik seri) ve `errorRate.integration.hourly` —
  büyük resimde kanal çağrısı/hata oranı satırlarına sparkline + grafik için. Şu an `series: null`.
- **BE (BO2-P6, bo-r2b'de kesinleşir):** başarısız iş satırında `jobType` (iş türü insan okur adı), `failedReason` kodu +
  `attemptsMade/attempts`, `firstFailedAt` — sözleşme isteği bo-r2b raporunda `docs/cloud-contracts`'a yazılacak.
- **Öneri (karar):** R2 bileşenlerinin (`BoSection`, `BoTileGrid`, `BoStat`, `BoChart`) `@entegrasyonik/ui`'ye taşınması —
  web uygulaması da aynı dili kullanabilir. Bu görevde paket değiştirilmedi (web'i bozmama kuralı); ayrı karar/görev.
- **Öneri (performans):** ECharts parçası tembel yüklenen ayrı chunk (`BoChart-*.js` ≈ 578 kB / gzip ≈ 201 kB). Genel bakış
  açılışında yüklenir; gerekirse `defineAsyncComponent` ile ilk boyamadan sonraya alınabilir (LCP etkisi yerelde ölçülmeli).

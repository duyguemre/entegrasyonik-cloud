# BO-R2 envanter — tekrar eden yapılar (BO2-01)

Kaynak: `docs/cloud-contracts/BO_FEEDBACK_R2_2026-10-01.md` (K59). Tarih: 2026-10-01, dal `cloud/bo-r2a` (fe-cfg2 birleştirilmiş).
Yöntem: 21 hazır ekranın (+ detay sayfaları) kaynak taraması + `once/` inceleme kareleri (1440 açık/koyu, 390).
Sayılar `tests/r2-baseline.json` ile aynı ölçümdür (şablonda, yorumlar hariç); bo-r2b taşıdıkça taban düşer.

Kısaltmalar: **ortak** = `src/components/r2|charts|shell|triage|verdict` · **paket** = `@entegrasyonik/ui` · **yerel** = sayfada elle yazılmış kopya.

## 1. Yapı → sayfa → mevcut → hedef

| # | Yapı | Görüldüğü sayfalar | Mevcut (R1 sonu) | Hedef ortak bileşen (R2) | bo-r2a durumu |
|---|---|---|---|---|---|
| 1 | **Sayfa başlığı** (ad + açıklama + meta + eylemler) | 25 ekran (detaylar dahil) | `BoPageHeader` (ortak) — h1 22 px, ikon yok, alt ayraç yok, açıklama 88ch | `BoPageHeader` standartlaştı: ekran ikonu kapsülde, tek ölçek (`title`), alt ayraç, sağda eylem grubu | ✅ tüm sayfalarda (bileşen içinden); yerel h1: 0 (giriş/davet hariç — kabuk dışı) |
| 2 | **Durum → Karar → Eylem** şeridi | 19 ekran | `PageVerdict` / `BoStatusHeader` / `BoAttentionList` / `BoActionCard` (R1) | Korundu; tipografi tek ölçeğe çekildi, `BoAttentionList compact` (BO2-P1) | ✅ bileşen düzeyi |
| 3 | **Bölüm kartı** (başlık + açıklama + eylem + gövde) | 23 panel/sayfa `.bo-panel__bar` + `<h2 class="bo-panel__title">`; 38 dosyada `EkCard`; panoda `BoTriageSection` | Üç ayrı dil: (a) kartsız başlık çubuğu + altında `EkCard`, (b) `EkCard` başlığı, (c) soru kartı. Bölümler "dağınık" görünüyor (BO2-11) | `BoSection` (kart + başlık bandı + boşluk hiyerarşisi + `#actions` + `#footer`; `fill`, `flush`, `plain`, `tone`) | ✅ genel bakış teknik ayrıntılar; **24 yerel başlık çubuğu tabanda** (bo-r2b) |
| 4 | **Kutu ızgarası** (aynı satırdaki kartlar) | `bo-grid-2/3` 12 dosya; genel bakışta duvar düzeni; teknik ayrıntılarda `align-items: start` | Kutular farklı yükseklikte, kenarlar hizasız (BO2-12, BO2-P2) | `BoTileGrid` (`cols` sabit / `min` otomatik; hücreler `stretch`, çocuk %100 yükseklik; `data-span`) | ✅ genel bakış + teknik ayrıntılar; `bo-grid-*` kullanan 12 dosya bo-r2b |
| 5 | **Metrik kutusu** (KPI) | `EkMetricCard` 7 dosya (QueuesPanel, Redis/Mongo, ApiHealth, Revenue, Cache, Usage); `UsageSummary` yerel `bo-us__stats`; `HealthKpi` (artık kullanılmıyor) | Üç farklı KPI dili; uzun açıklama kutunun içinde | `BoStat` (mikro etiket + metrik değer + tek satır bağlam + ⓘ ayrıntı + isteğe bağlı sparkline + bağlantı; `tone` yalnız durum) | ✅ genel bakış metrik şeridi; `EkMetricCard` sayfaları bo-r2b (öneri: `BoStat`'a geçiş) · `HealthKpi.vue` ölü kod (silme önerisi) |
| 6 | **Veri tablosu (sütun tanımlı)** | `EkDataTable` 17 dosya / 19 kullanım | Ortak paket tablosu doğrudan; yoğunluk `.bo-dense` bazen, durumlar `StateBlock` ile ayrı ayrı | `BoDataTable` (EkDataTable + 36 px yoğunluk + dört durum + `#footer` sayfalama + bölge etiketi) | 🟡 bileşen hazır; **19 doğrudan kullanım tabanda** |
| 7 | **Veri tablosu (özel satır)** | `.bo-table` 7 dosya (Tenants, Deliveries, Catalog, Competition×3, TechDetails) | Her dosya `bo-table-wrap` + `tabindex` + `caption` işaretlemesini elle yazıyor | `BoTableFrame` (odaklanır kaydırma bölgesi + sr başlığı + yoğunluk + `#head`) | ✅ TechDetails; **6 dosya tabanda** |
| 8 | **Filtre çubuğu** | `.bo-toolbar` 15 dosya; "Filtreleri temizle" 3 farklı biçim (Audit ghost/secondary, LogCenter, Subscriptions) | Her sayfa kendi düzeni; temizle düğmesi farklı varyant/yerde | `BoFilterBar` (arama · alanlar · "N süzgeç etkin" + Filtreleri temizle · `#trailing`; mobilde tam genişlik) | 🟡 bileşen hazır; sayfalar bo-r2b |
| 9 | **Tek seçimli segment** | `role="radiogroup"` 22 yerel kopya / 16 dosya | `.bo-seg` CSS ortak ama işaretleme + klavye her yerde elle (çoğunda ←/→ yok) | `BoSegmented` (radiogroup, ←/→, sayaç, devre dışı) | 🟡 bileşen hazır; **22 kopya tabanda** |
| 10 | **Sayfalama** | `LoadMore` 8 dosya; yerel "Daha fazla" (Audit, LogCenter); `.bo-table-foot` (Tenants, Announcements, TenantHistory, CompetitionOverrides) | Üç farklı alt bilgi | `BoPagination` (imleçli: "N kayıt gösteriliyor · listenin sonu", `total` → "12 / 40", satır içi hata) | ✅ `LoadMore` kaldırıldı, 8 dosya taşındı; **6 yerel tabanda** |
| 11 | **Sekmeler** | `EkPageTabs` + `useTabQuery` 5 sayfa (Motor, Abonelikler, Entegrasyonlar, Altyapı, Müşteri detayı) + duyuru önizlemesi | Paket bileşeni + sayfada URL eşlemesi | `BoTabs` (EkPageTabs + `?sekme=` eşlemesi, `v-model` ya da kendi kendine) | 🟡 hazır; mevcut kullanımlar doğru, isteğe bağlı taşıma |
| 12 | **Görünüm değiştirici** | yok (Motor/Loglar uzun) | — | `BoViewSwitch` (`?gorunum=` özet/ayrıntılı) | 🟡 hazır; BO2-P6 Motor için |
| 13 | **Daraltılabilir bölüm** | `BoDetailSection` (pano), `<details>` 3 dosya (Planned, PlatformBreakdown, EmailFrame) | Sayfa düzeyi var, kart içi yok | `BoCollapsible` (kart/madde içi; `inline` eylem satırına katılır) + `BoDetailSection` (sayfa, `?ayrinti=`) | ✅ dikkat listesinde (compact) |
| 14 | **Eylem düğmeleri** (yenile/düzenle/sil/detay/dışa aktar/yeniden dene) | Yenile: 18 sayfa başlığı + 16 panel `EkRefreshButton`; sil: 8 dosya (`mdi-delete*` karışık); düzenle 3; dışa aktar 1 | İkon/etiket/varyant sayfada seçiliyor (`mdi-delete` vs `mdi-delete-outline` vs çöp kutusu) | `actions.ts` sözlüğü (paket `ACTION_ICONS` glifleri) + `BoAction` (metinli / ikon / bağlantı) | ✅ 18 başlık Yenile → `BoAction kind="refresh"` (taban 0); panel `EkRefreshButton` (sessiz başarı, NT-07) aynı kalır |
| 15 | **Grafikler** | `Sparkline` (PulseTrends, LogCenter×2), `BarTrend` (LogCenter), `SeriesBars` (Queues, Usage, TenantUsage); `MeterList` (oran çubukları, 8 dosya) | El yazımı SVG; ipucu/ızgara/eksen yok, koyu temada soluk | `BoChart` (vue-echarts, SVG çizici, token teması açık/koyu, dört durum, erişilebilir özet + "Tablo olarak göster") | ✅ üç grafik bileşeni BoChart'a taşındı (API korunarak); yeni: API isteği alan grafiği, müşteri durum halkası. `MeterList` grafik değil (değer metin) — korunur |
| 16 | **Durum blokları** (yükleniyor/boş/hata/bozulma) | `StateBlock` 34 dosya, `BoPanelState` 7 dosya | İki bileşen, aynı görsel dil | Değişmedi (R1/bo-p2 standardı); `BoDataTable` StateBlock'u içerir | — |
| 17 | **Anahtar-değer listesi** | `.bo-kv` 7 dosya | Ortak sınıf | Değişmedi | — |
| 18 | **Satır eylemleri** | `.bo-row-actions` 5 dosya | Ortak sınıf + yıkıcı ayraç | `BoAction icon-only` (sözlük) + mevcut ayraç kuralı | 🟡 bo-r2b |
| 19 | **Bağlantı "→ daha fazla"** | `bo-link-more`, `__more`, `__link` 18 dosyada farklı adlarla | Aynı görünüm, ayrı CSS | `BoAction kind="detail" :to` ya da `BoSection #footer` bağlantısı | 🟡 bo-r2b |
| 20 | **Tipografi** | tüm dosyalar | Ölçek dışı: `--ek-font-size-md` ×2, `0.92em` ×2, `0.86em`, `32px`, `20px`, `font-weight: 600`, `bold` | Tek ölçek: `--ek-type-<rol>-size/-weight` (mandal) | ✅ 9 ihlal düzeltildi, taban 0 |
| 21 | **Sayfa kabuğu** | `.bo-page` | `max-width: 1440px` + 24 px yan boşluk (≥ 1600 px ekranlarda geniş boş kenar) | 1760 px tavan, 16 px yan (≤ 767 px: 12 px), 20 px üst | ✅ |

## 2. Sayfa başına gözlem (önce kareleri)

| Sayfa | Gözlem (R2 kuralı) | Kimde |
|---|---|---|
| Genel bakış | Çok metin; dört soru kartının her maddesinde "neden + ne yapmalı" açık (P1); duvar düzeninde kutular farklı yükseklik (BO2-12) | bo-r2a ✅ |
| Genel bakış › Teknik ayrıntılar | 2+1 düzende kutular farklı yükseklik, "Veri alımı" yalnız; yönetim işlemleri tam genişlik ama ayrık (P2) | bo-r2a ✅ |
| Otopilot | Sohbet dar sütunda; yatay kaydırma riski (P3) | bo-r2b |
| Müşteriler | `.bo-table` + yerel segment + `.bo-table-foot` | bo-r2b |
| Müşteri detayı | Uzun dikey; sekmeli ama özet sekmesi uzun | bo-r2b |
| Kullanım | `SeriesBars` (artık ECharts); kutular bitişik (P4) | bo-r2b |
| Abonelikler | Sekmeler var ama "neyin neyi açtığı" belirsiz (P5) | bo-r2b |
| Motor ve kuyruklar | "Başarısız işler" iş başına tür/neden/zaman belirsiz; çok uzun (P6) — `BoViewSwitch` + `BoDataTable` | bo-r2b |
| Entegrasyonlar, Altyapı, Önbellek | `EkMetricCard` + yerel başlık çubuğu + `EkDataTable` | bo-r2b |
| Loglar | 1.210 satırlık tek dosya; yerel segment, yerel "Daha fazla", çok sayıda sparkline | bo-r2b |
| Denetim | Yerel segment + yerel "Daha fazla" + farklı "Filtreleri temizle" | bo-r2b |
| Yöneticiler, Sistem ayarları, Rekabet | Yerel başlık çubuğu, `.bo-table` | bo-r2b |
| Bildirimler (duyurular, teslimler, katalog, uyarılar, müşteri geçmişi) | En çok yerel segment (11) ve `.bo-table` | bo-r2b |

## 3. Ölü / birleşecek kod
- `components/HealthKpi.vue` — hiçbir yerde kullanılmıyor (R1'de genel bakış yeniden kurulunca düştü). `BoStat` yerini aldı; silme bo-r2b'de (davranış etkisi yok).
- `components/kit/LoadMore.vue` — silindi (→ `BoPagination`).
- `.bo-page__head/__title/__lede` (backoffice.css) — `BoPageHeader` öncesinden kalma; kullanım yok, bo-r2b temizliği.

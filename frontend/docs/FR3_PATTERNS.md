# FR3 ortak desenleri (fe-r3a — kabuk, menü, sekmeler, filtre, tablo, hareket)

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R3_2026-10-01.md` madde 1–10, karar K49. FR2 standartları (`FR2_PATTERNS.md`)
geçerliliğini korur; bu dosya onları **genişletir**. Paralel görevler (`cloud/fe-r3b` ekranlar, `cloud/fe-r3c` çıktılar)
burada anlatılanı **kullanır**; ortak bileşen/token değişikliği yalnız `frontend/packages/ui`'dadır (K11).

## 1. Hareket — tek kaynak (madde 7)

Bileşen **süre/eğri seçmez, etkileşimin türünü (rolü) seçer**. Aynı tür her yerde aynı hızda akar: filtre paneli
açılışı = ürün formundaki kategori seviyesi açılışı = menü grubu açılışı → hepsi `reveal`.

| Rol (CSS) | Süre · eğri | Ne zaman |
|---|---|---|
| `--ek-motion-feedback` | fast 150ms · ease-out | Hover, odak, seçili durumda renk/zemin/kenarlık/gölge/opaklık (`--ek-transition-colors` bunu kullanır) |
| `--ek-motion-reveal` | base 200ms · ease-in-out | Aç/kapa: yükseklik + opaklık (EkCollapse, filtre paneli, sayfa hakkında, menü grubu, kategori seviyesi, akordeon), ok dönüşü, genişleyen satır |
| `--ek-motion-dismiss` | fast 150ms · ease-in-out | Kaybolan geçici öğe (menü/diyalog çıkışı, kapanan kolon, silinen satır). Çıkış girişten hep kısa |
| `--ek-motion-overlay` | base 200ms · ease-out | Yükselen katman girişi: menü, açılır liste, diyalog, toast, sekme içeriği (opaklık + `--ek-motion-distance-sm` kayma) |
| `--ek-motion-layout` | slow 300ms · ease-out | Kabuk/yerleşim: sol menü ray ↔ tam |
| `--ek-motion-stagger` | fast / 3 | Kademeli öğeler arası adım (en fazla 2 adım) |
| `--ek-motion-loop-pulse` · `-brand` · `-flow` · `-spin` · `-transfer` | 1400 · 1800 · 1000 · 900 · 8000ms | YALNIZ bekleme döngüleri (iskelet, marka yükleyicisi, yazıyor/akış çizgisi, yenile dönüşü, aktarım gösterimi); eğri `--ek-easing-standard` (sabit hız `--ek-easing-linear`) |

Her rolün `-duration` ve `-easing` parçası da vardır (`transition-delay: var(--ek-motion-reveal-duration)` gibi).

```css
.my-panel { transition: grid-template-rows var(--ek-motion-reveal), opacity var(--ek-motion-reveal); }
.my-menu-enter-active { transition: opacity var(--ek-motion-overlay), transform var(--ek-motion-overlay); }
.my-menu-leave-active { transition: opacity var(--ek-motion-dismiss); }
.my-row { transition: var(--ek-transition-colors); }          /* hover */
.my-step { transition-delay: calc(var(--i) * var(--ek-motion-stagger)); }
```

JS (Web Animations, SortableJS, kaydırma): `@entegrasyonik/ui/motion` → `motionMs(rol)`, `motionEasing(rol)`,
`motionDistancePx('sm')`, `motionReduced()`. Azaltılmış harekette (`prefers-reduced-motion` veya
`<html data-motion="reduced">`) `motionMs` 0 döner; CSS'te kök süreler 0'a indiği için roller de iner.

**Yasak** (bekçi `tests/motion-single-source.test.ts`): CSS'te literal süre (`.3s`, `200ms`; `0s` serbest), eğri anahtar
kelimesi (`ease`, `ease-in-out`, `linear` …), `cubic-bezier(`; bileşende ham ölçek token'ı (`--ek-duration-*`, döngü
dışında `--ek-easing-*`); script'te ham `easing: 'ease-…'`, `cubic-bezier`, hareket modülü olmadan `.animate(`.
Paralel görevlerin dört dosyası (`PrintoutListView`, `SettingListView`, `ProductListView`, `ProductChannelStatus`) ham ölçek
token'ı için ratchet listesindedir — dokunduğunuzda role geçirin, sayı düşer; **artamaz**.

Vuetify'ın kendi adlandırılmış geçişleri (`fade-transition`, `scale-transition`, `dialog-transition` …) ve bileşen mikro
geçişleri (düğme/liste/çip katmanı, sekme, seçim denetimi, perde) `vuetify-overrides.css`'te rollere bağlıdır; test listeyi
`node_modules/vuetify` CSS'inden türetir. Bilinen istisna: Vuetify'ın JS ile yaptığı iki FLIP (alan etiketi yüzmesi
~150ms, `v-tabs` kaydırıcısı) — `EkPageTabs` artık kaydırıcı kullanmaz (bkz. §4).

## 2. Sol menü ve favoriler (madde 1–2)

| Karar | Değer |
|---|---|
| Zemin | Menü yüzeyi **beyaz** (`sidebar-bg` = ink-0; koyu: canvas üstü yüzey) — gri çalışma alanından 1px `sidebar-border` ile ayrışır; kart dili (site ile aynı) |
| Hiyerarşi | Bölüm etiketi (mikro, büyük harf, `content-muted`) → öğe (13/500, `content-default`) → alt öğe (13/**400**, `content-muted`, girinti + kılavuz çizgi). Tam menüde bölümler yalnız boşluk + etiketle ayrılır; ayraç çizgisi yalnız rayda |
| Etkin | Tek vurgu: `sidebar-active` zemin + 3px aksiyon göstergesi + aksiyon ikonu. Grup başlığı nötr kalır. Favoriler satırında etkin sayfa yalnız metin/ikon tonuyla (iki hap yok) |
| Hover | `sidebar-hover` zemin + mürekkep `content-strong`; geometri değişmez |
| Ray | İkon sütunu; odak/hover içerik kaydırmaz (`overflow: clip` — önceki hata: Tab ile ikonlar ekrandan çıkıyordu) |
| Favoriler | Menünün **en üstünde** "Favoriler" bölümü (kayıtlı sıra). Yaprak/alt öğenin sağında yıldız: işaretliyken küçük dolu yıldız her zaman görünür, değilse hover/odakta. "Düzenle" → ↑/↓ ile sırala (klavyede her zaman Alt+↑/↓). Boşken tek satır kesik çizgili ipucu (× ile kapanır, `ek.nav.v1.favHint`). Ekle/çıkar/sırala iyimser (sunucu reddederse geri alınır). Akıllı arama (Ctrl+K) boş durumunda da "Favoriler" grubu |

`EkSidebarNav` yeni (geri uyumlu) alanlar: bölümde `id`, `icon`, `reorderable`, `emptyText`; olaylar `reorder(id, keys)`,
`dismiss-empty(id)`; `#item-trailing` alt öğelerde de çizilir (`{ item, section }`).

## 3. Breadcrumb (madde 3, K49)

`[🛒 Satış] › [Ara ekran] › Sayfa başlığı (H1) (?)` — kök ve ara halkalar **nötr çip** (22px, hap, 1px `border-subtle`,
`surface-muted`, 12/500 `content-muted`; bağlantı çipi hover'da `surface` + `border-strong` + `content-strong`); vurgu rengi
yok. Bulunulan sayfa çip DEĞİL, hiyerarşinin tek güçlü noktası H1 (`title` rolü). Ekranlar yalnız `EkPageBar` prop'larını
verir (`title`, `section`, `trail`, `record`); kendi breadcrumb'ını yazmaz.

## 4. Sekmeler (madde 4–5)

**Ana sekmeler (`EkWorkspaceTabs`):** pasif sekme en az 132px, metin `content-default` (hover `content-strong`), kesilen
başlık "…" yerine yumuşak solar; kapatma pasifte yer ayırmaz (hover/odakta solma bölgesinin üstünde belirir). Etkin sekme
kısalmaz (≤260px). Sağ uçta **tek "Tüm sekmeler" düğmesi**: toplam sayı + şeritte görünmeyen varsa nötr "+N" hapı; liste
iki grup (Şeritte görünmeyen · Şeritteki sekmeler), Alt+1…9 ipuçları, sonda "Tümünü kapat" (`listActions`).

**İçerik sekmeleri (`EkPageTabs`):** sitenin süzgeç dili — **segment tepsisi**: içerik genişliğinde soluk tepsi
(`surface-muted` + 1px `border-default`, `radius-xl`, 3px iç boşluk); etkin segment yüzeye çıkar (`surface` + kenarlık +
`shadow-card`, yarı kalın, aksiyon ikonu), sayı hapı etkinde `action` dolgulu. Alt çizgi/kaydırıcı yok. Ekranlar tepsiye
zemin/kenarlık vermez; sekmeyi tam genişlik yapmaz.

## 5. Filtre paneli başlığı (madde 6)

Başlık 52 → **44px** (kontrol `sm` 32 + 6px dolgu), filtre karosu 24px, chevron 28px; gövde 16px, eylem çubuğu 8px dikey
dolgu. `#head-actions` içine `size="sm"` (32px) kontrol koyun. API değişmedi.

## 6. Tablolar (madde 8–9)

| Karar | Değer |
|---|---|
| Kanal kimliği (`channelKey`) | Satır İÇİNDE, sol kenardan 4px ayrık, yuvarlak uçlu 3px **kanal çizgisi** (orijinal marka rengi, K13), satır yüksekliğinin ~%72'si; hover'da tam boya uzar (`feedback`). Seçili satır kanal rengini korur (seçim = `selection` zemin + işaretli kutu); kanalsız seçili satırda aksiyon çizgisi. Kart görünümünde (<600px) kartın solunda aynı çizgi |
| Font ailesi | Tablo içinde **tek aile** (Inter). Kod, barkod, olay kodu da Inter — hücre içinde mono yok (`EkDataGrid`/`EkDataTable` zorlar) |
| Rakamlar | Tablo genelinde `tabular-nums` (tarih, tutar, kod her kolonda alt alta hizalı) |
| Ağırlık | 400 veri · 500 birincil metin (`.ek-cell-primary`) · 600 kimlik/bağlantı (kolon `type: 'id'`) |
| Boyut | 13 hücre, 12 ikincil satır (`.ek-cell-secondary`) |
| Hizalama | Tutar/adet sağa (`type: 'num'`), tarih sola, tek satır (saat dahil) |

## 7. Tarih aralığı filtresi (madde 10)

Tarih sütunu olan ve backend'i aralık kabul eden HER liste `EkDateRange` kullanır (filtre ızgarasında 2 kolon):

```vue
<EkDateRange v-model:start="filters.startDate" v-model:end="filters.endDate" label="Sipariş tarihi" value-format="iso-date" />
```

İki `EkDateField` birbirini sınırlar; hazır aralıklar menüsü (Bugün · Son 7 gün · Son 30 gün · Bu ay · Geçen ay · Temizle).
Etkin filtre çipi tek "Tarih" çipi: `formatDateRange(start, end)` (`@entegrasyonik/ui/components/dateRange`). Listede ayrı
"Başlangıç/Bitiş" `EkDateField` çifti açılmaz (bekçi `tests/date-range-filter.test.ts`). Backend parametresi olmayanlar:
`PROPOSALS_PENDING.md` P-R3A-1…4.

## 8. Kayıt detayı diyaloğu (fe-r3b — madde 12–13)

Sipariş, iade, müşteri, fatura ve destek talebi detayları TEK desende: `EkRecordSheet` (yan sayfa) + `EkDetailPanel` (bölüm kartı).
`EkDetailSheet` kaldırılmadı (admin/uyumluluk ekranları kullanıyor); yeni kayıt detayları `EkRecordSheet` kullanır.

```vue
<EkRecordSheet v-model="open" size="lg" kind="Sipariş" :identity="order.orderNumber">
  <template #status><EkStatusChip :tone="…" :label="…" /></template>
  <template #header-actions>…sessiz: Düzenle, ⋯ …</template>
  <template #summary><EkRecordSummary … /><EkNextStep … /></template>
  <EkDetailPanel title="Ürünler" icon="mdi-package-variant-closed" :description="'3 kalem · 4 adet'" flush>…</EkDetailPanel>
  <EkDetailPanel title="Kargo" icon="mdi-truck-outline" :rows="[{ label: 'Takip kodu', value: '…', numeric: true }]" />
  <template #footer-start><EkActionButton action="cancel" show-label … /></template>
  <template #actions><EkButton tone="secondary">…</EkButton><EkButton tone="primary">Sıradaki iş</EkButton></template>
</EkRecordSheet>
```

| Kural | Değer |
|---|---|
| Zemin | Gövde `app-bg` (sayfa tuvali); bölüm kartları `surface` + `border-default` + `shadow-card` → kutular öne çıkar. Üst/alt çubuk `surface` |
| Üst çubuk | Tür etiketi (mikro) · kimlik (H2) · durum çipi; sağda yalnız sessiz başlık eylemleri (`#header-actions`) + kapat |
| Özet | `#summary` her zaman en üstte: `EkRecordSummary` (kanalı olmayan kayıtta `icon`), ardından "sıradaki adım" / durum kartı |
| Bölüm | Gövdede çıplak içerik yok — her bölüm `EkDetailPanel` (ikon karosu nötr, başlık H3, kısa açıklama/sayaç aynı satırda). Liste/zaman çizgisi `flush` + kendi çerçevesini kaldırır (`RecordLineList plain`) |
| Öne çıkan kutu | Tutar dökümü / toplam: kartın altında `surface-muted` bant (sipariş + iade aynı) |
| Eylemler | İş akışı eylemleri **sabit alt çubukta**: yıkıcı/ikincil solda (`#footer-start`), birincil en sağda (tek primary). "Sıradaki adım" kartı eylemi tekrarlamaz; yalnız dış bağlantı (kargo takibi) taşır. Destek talebinde alt çubuk yanıt alanıdır (`#footer`) |
| Dar ekran | Tam ekran; kart iç boşlukları 12px; alt çubuk sarılır |

## 9. Ayar ekranı satırı (fe-r3b — madde 14)

`SettingRow` (`src/components/settings`): solda etiket (`<label for>` → alanın erişilebilir adı) + tek cümle açıklama, sağda
denetim; geniş denetimler `stacked`. Satırlar `EkDetailPanel flush` kartında. Ekran: solda arama + dikey bölüm listesi
(değişen bölümde nokta, aramada eşleşme sayısı), altta yapışkan kaydetme durumu çubuğu ("Kaydedilmemiş değişiklik var · …"
+ Vazgeç + Kaydet; temizken sakin). Değişen satırda "Değişti" işareti. Arama yalnız kayıt defterindeki etiket/açıklama/anahtar
kelimelerde çalışır (`SettingListView` `ROWS`).

## 10. Ürün listesi kanal hücresi (fe-r3b — madde 11)

İki satır: (1) en kritik durum sade cümleyle ve durum tonunda ("1 kanalda hata", "Tüm kanallarda yayında", "Gönderime hazır")
— `channelStatusSummary` (saf, testli); (2) ürünün bulunduğu kanalların K13 kısa rozeti + **yanında** durum glifi (rozetin
üstüne binen nokta değil), gönderilmemişler tek "+n" hapı. İpucu kanal başına satır; panel çipleri aynı ikonları kullanır.

## 11. Ana sayfa — aksiyon önce (fe-r3b — madde 16)

Sıra: **Bugün sırada** (`DashboardNextActions`) → İşletme performansı (KPI) → Sipariş ve kanal durumu → Stok ve katalog.
"Bugün sırada": kişisel selamlama + iş sayısı; sıradaki iş öne çıkan kutuda (sol tonlu şerit, `surface-muted`, tek primary);
"Sonra" listesi (en fazla 5, satır = ekranı açan düğme); "Bekleyen yok" satırı. Liste `nextActions.ts`'ten (saf, testli):
Acil (aşırı satış, erişilemeyen bağlantı) → Bugün (kargo → fatura → iade → soru) → Fırsat buldukça (sorunlu bağlantı,
eşleşmeyen kalem, kanala iletilmeyi bekleyen stok, eksik kurulum). Rakamlar yalnız backend yanıtından; menüde olmayan
ekranın eylemi çizilmez.

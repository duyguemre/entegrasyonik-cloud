# Entegrasyonik Tasarım Sistemi — DS-v2

> **Durum:** Aşama 1 (yalnızca tasarım sistemi + vitrin) — **kullanıcı onayı bekliyor.** Ekran göçü yapılmadı.
> **Vitrin:** `npm run dev` → `http://localhost:3000/design-system` (yalnızca geliştirme; üretim derlemesinde yok, menüde yok).
> **İnceleme görselleri:** `frontend/docs/design-system-review/` (liste §12).
> **Kaynaklar:** kullanıcı brifi `docs/design-reference/README.md` (görsel yön), ADR-0011 (token mimarisi), ADR-0015 (süreç/test/desen kataloğu; görsel yönü bu brifle geçersiz kılındı).

---

## 1. Mimari (ADR-0011 korunur)

```
src/design/tokens/            SAF TS — tek kaynak
  palette.ts                  primitifler (ink / navy / cobalt + durum adımları)  → YALNIZCA token dosyalarında
  semantic.ts                 semantik roller (site profili değerleri + DS-v2 rolleri)
  workspace.ts                UYGULAMA profili: paylaşılan anahtarların uygulama değerleri + legacy→DS-v2 eşlemesi
  roles.ts                    her rolün KULLANIM AMACI + zorunlu kontrast çiftleri (vitrin, bu belge ve testler okur)
  scale.ts                    boşluk, radius(+rol), tipografi rolleri, ikon, kontrol yüksekliği, gölge, hareket, z-index
  contrast.ts                 WCAG kontrast hesabı
  render.ts → dist/tokens.{app,static}.css   (`npm run tokens`; drift testi korur)
src/design/vuetify-theme.ts   tokens → Vuetify teması (uygulama profili)
src/design/vuetify-defaults.ts Vuetify bileşen varsayılanları
src/design/vuetify-overrides.css radius/gölge/tooltip/menü/alan/tablo başlığı — rol token'larıyla
src/design/app.css            --ek-app-* kabuk ölçüleri, yoğunluk, .ek-num, .ek-sr-only
```

### 1.1 İki profil — neden?

Tanıtım sitesi (`site/`) `tokens.static.css`'i yüzlerce yerde kullanıyor ve paralel oturumlar orada çalışıyor
(ADR-0015 1.3: sitenin kullandığı anahtarların değeri değişmez). Uygulama ise yeni dil ister (tonlu zemin, tek vurgu
rengi). Bu yüzden:

| Çıktı | Kim tüketir | Paylaşılan anahtarlar (`background`, `primary`, `content-*`, `border-*` …) | DS-v2 rolleri |
|---|---|---|---|
| `tokens.static.css` | site | **eski değerler — değişmedi** (test: "site profili dondurma") | eklendi (site kullanmıyor) |
| Vuetify teması → `tokens.app.css` | uygulama | **DS-v2 değerleri** (`workspace.ts` `WORKSPACE_OVERRIDES_*`) | aynı |

Adlar aynıdır; **hiçbir `--ek-*` adı kaldırılmadı** (112 DS-v2 öncesi ad `tests/theme/token-names.v1.json` ile korunur).
Uygulamada `--ek-color-primary` = aksiyon (cobalt); marka laciverti artık `--ek-color-brand`.

---

## 2. Palet (hex + amaç)

### 2.1 Primitif ölçekler (yalnızca token dosyalarında)

| Ölçek | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 | Amaç |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ink** (nötr) | `#F6F8FB` | `#EDF0F5` | `#D9DFE8` | `#C3CBD8` | `#99A4B5` | `#78859A` | `#505C71` | `#2F394B` | `#1F2838` | `#121A2B` | `#0A0F1A` | metin, kenarlık, yüzey (ayrıca `0 #FFFFFF`, `150 #E4E8EF`) |
| **navy** (marka) | `#EEF2FA` | `#DCE3F3` | `#B9C6E6` | `#8C9FD2` | `#5F78BA` | `#3E5AA0` | `#2D4787` | `#223A72` | `#1A2F63` | **`#13255B`** | `#0B173D` | kimlik: üst bar, logo, bölüm etiketi |
| **cobalt** (vurgu) | `#EEF3FE` | `#E1E9FC` | `#C4D3F8` | `#9BB3F1` | `#6C8BE6` | `#4A6BDD` | **`#2E55D4`** | `#2445B0` | `#1E3A94` | `#1B3276` | `#121F48` | TEK vurgu: aksiyon, seçim, odak |

Durum tonları mevcut AA paletinden (ADR-0015 3.3) + tamamlayıcı adımlar (`statusSteps`).

### 2.2 Semantik roller (uygulama profili, light)

| Grup | Rol | Hex | Kullanım amacı |
|---|---|---|---|
| Yüzey | `app-bg` (= `background`) | `#EDF0F5` | Çalışma alanı zemini. Saf beyaz değil. |
| | `surface-sunken` | `#F1F4F8` | Kart İÇİNDE çukur: filtre gövdesi, değer kuyusu, kod bloğu |
| | `surface-muted` | `#F6F8FB` | Kart başlık bandı, tablo başlığı, eylem çubuğu |
| | `surface` | `#FFFFFF` | Kart, tablo gövdesi, form alanı — içerik burada okunur |
| | `surface-raised` | `#FFFFFF` + `shadow-popover/dialog` | Menü, açılır liste, arama sonuçları, diyalog |
| | `surface-inverse` | `#1F2838` | Tooltip (üzerinde `content-inverse`) |
| | `scrim` | `#0A0F1A` → `--ek-color-scrim-veil` (%44) | Modal perdesi |
| Kabuk | `chrome` → `chrome-end` | `#13255B` → `#2D4787` | Üst bar degradesi (`--ek-gradient-chrome`) — kimliği taşıyan TEK boyalı alan |
| | `chrome-raised` / `chrome-border` | `#1A2F63` / `#2D4787` | Üst bar kontrolleri (arama, anahtar, profil) |
| | `chrome-text` / `chrome-text-muted` | `#FFFFFF` / `#B9C6E6` | Üst bar metni / ikincil metin |
| Sidebar | `sidebar-bg` / `sidebar-border` | `#F6F8FB` / `#D9DFE8` | Sol menü — zeminden bir kademe açık |
| | `sidebar-section` | `#3E5AA0` | Bölüm başlığı (mikro etiket) |
| | `sidebar-text` / `sidebar-hover` | `#2F394B` / `#E4E8EF` | Öğe / hover |
| | `sidebar-active` | `#E1E9FC` | Etkin ekran (metin `action-emphasis`, solda 3px `action`) |
| Sekme | `tabstrip-bg` / `tab-hover` / `tab-active` | `#E4E8EF` / `#D9DFE8` / `#EDF0F5` | Şerit / pasif hover / etkin (içerikle birleşir) |
| Metin | `content-strong` | `#121A2B` | Başlık, birincil değer |
| | `content-default` | `#2F394B` | Gövde, tablo hücresi |
| | `content-muted` | `#505C71` | İkincil metin, etiket, yardım — **tüm yüzeylerde AA** |
| | `content-subtle` | `#99A4B5` | YALNIZCA dekoratif/devre dışı/yer tutucu (AA altı) |
| Kenarlık | `border-subtle` / `border-default` / `border-strong` | `#E4E8EF` / `#D9DFE8` / `#C3CBD8` | İç ayraç / kart çizgisi / vurgulu çerçeve |
| | `border-input` | `#78859A` | Form alanı kenarlığı (≥3:1) |
| | `border-focus` | `#2E55D4` | Odak halkası (`--ek-focus-ring`) |
| Aksiyon | `action` (= `primary`) | `#2E55D4` | Birincil düğme, bağlantı, etkin gösterge, seçili sayfa, checkbox |
| | `action-hover` / `action-active` | `#2445B0` / `#1E3A94` | Hover / basılı |
| | `action-subtle` / `action-border` / `action-emphasis` | `#EEF3FE` / `#C4D3F8` / `#1E3A94` | Seçili zemin / seçim çerçevesi / seçili metin |
| Durum | `success` · `-subtle` · `-border` · `-emphasis` | `#15803D` · `#DCFCE7` · `#A7E3BC` · `#166534` | Başarılı / tamamlandı / aktif |
| | `warning` · … | `#B45309` · `#FEF3C7` · `#F3D58A` · `#92400E` | Dikkat / bekliyor / kısmi |
| | `error` · … | `#B91C1C` · `#FEE2E2` · `#F5B8B8` · `#991B1B` | Hata ve TEHLİKELİ aksiyon |
| | `info` · … | `#0369A1` · `#E0F2FE` · `#A9D8F3` · `#075985` | Bilgi / işleniyor |
| | `neutral` · … | `#505C71` · `#EDF0F5` · `#C3CBD8` · `#1F2838` | Kuyrukta / taslak |
| | `*-contrast` | `#FFFFFF` | Dolgu (sayaç, tehlike düğmesi) üzerindeki metin |
| Marka | `brand` | `#13255B` | Logo, marka öğesi — düğme için KULLANILMAZ |
| | `secondary` | `#48A9A6` | Logo teal merkezi — yalnızca dekoratif |
| | `selection` / `highlight` | `#EEF3FE` / `#FEF3C7` | Seçili satır / arama eşleşmesi `<mark>` |

Dark değerlerin tamamı tanımlı (TS tipi zorlar, AA testi dark için de koşar); dark kapısı ADR-0011 Karar 3 gereği kapalı.

### 2.3 Semantik renk kuralları

1. **Tek vurgu rengi:** ana iş (Sorgula, Kaydet, Güncelle) her yerde `action` dolgu; ekran başına **tek** birincil düğme. İkincil = nötr çerçeveli.
2. **Lacivert yalnızca kimlik:** üst bar, logo, bölüm etiketi, vitrin numaraları. Aksiyon/durum için kullanılmaz.
3. **Durum renkleri tek anlamda:** ekran renk seçmez, `status-map.ts` üzerinden ton verir. `warning` asla aksiyon rengi değildir; `info` aksiyonla karıştırılmaz.
4. **Durum çipi:** subtle zemin + koyu (emphasis/ton) metin, aynı şekil/boyut; dolgu yalnızca sayaç rozetinde.
5. **Tehlike:** `error` dolgu yalnızca onay diyaloğunun son adımında; menüde tehlikeli öğe en sonda, `error` metin.
6. **Renk tek başına anlam taşımaz** — her zaman metin/ikon eşlik eder (WCAG 1.4.1).
7. `content-subtle` okunması gereken metinde kullanılmaz.

---

## 3. Tipografi ve ikon (yazıyla orantılı)

Aile **Inter** (kendi barındırılan). CSS: `--ek-type-<rol>-{size,line,weight,tracking,icon}`.

| Rol | Boyut/Satır · Ağırlık | İkon | Kullanım |
|---|---|---|---|
| `display` | 32/40 · 700 · −0,02em | 32 (`2xl`) | Vitrin/karşılama, çok büyük sayı |
| `metric` | 28/34 · 700 · tabular | 24 (`xl`) | KPI değeri |
| `title` | 22/30 · 600 | 24 (`xl`) | Sayfa başlığı (tek H1) |
| `heading` | 16/24 · 600 | 20 (`lg`) | Kart/bölüm başlığı |
| `subheading` | 14/20 · 600 | 18 (`md`) | Alt bölüm, liste öğesi başlığı |
| `body` | 14/22 · 400 | 18 (`md`) | Gövde |
| `label` | 13/18 · 500 | 16 (`sm`) | Form etiketi, düğme, menü öğesi |
| `table` | 13/20 · 400 | 16 (`sm`) | Tablo hücresi |
| `tab` | 13/18 · 500 | 16 (`sm`) | Sekme |
| `caption` | 12/16 · 400 | 14 (`xs`) | Yardım, zaman, meta |
| `micro` | 11/16 · 600 · 0,06em · BÜYÜK HARF | 14 (`xs`) | Mikro etiket, tablo başlığı, anahtar-değer etiketi |

- İkon ölçeği: `xs 14 · sm 16 · md 18 · lg 20 · xl 24 · 2xl 32`. Oran testi: ikon/yazı 0,85–1,35×.
- **Tek ikon ailesi MDI**, outline tercih. İkonlar anlam taşıyorsa hep **ikon kapsülünde** (`EkIconTile`: sm 28/16 · md 36/18 · lg 44/24; açık ton zemin + ton rengi).
- Sayılar `tabular-nums` (`.ek-num`).

## 4. Boşluk, radius, gölge, hareket, katman

- **Boşluk** (4 px taban): `--ek-space-{0,1,2,3,4,5,6,8,10,12,16}` = 0…64. Sayfa 24 · bölüm 32 · kart içi 20 · form alanı 16 · satır içi 8.
- **Radius rolleri:** `control 8` (düğme, input, sayfa düğmesi) · `tile 8` · `tab 8` · `card 12` · `popover 12` · `dialog 16` · `chip hap`. Bileşenler ölçeği değil **rolü** kullanır.
- **Gölge** (lacivert-mürekkep tonlu): `card` (kart), `raised` (hover/tooltip), `popover` (menü/açılır), `dialog`, `chrome` (üst bar). Eski `sm/md/lg` korunur.
- **Kontrol yüksekliği:** `sm 32 · md 36 · lg 40`.
- **Hareket:** süre `150/200/300 ms`, eğri `ease-out/ease-in-out`, mesafe `4/8 px`; yalnızca opaklık + kısa slide + renk geçişleri (`--ek-transition-colors`). Hover'da kayma/ölçek, bounce, ripple YOK. `prefers-reduced-motion` → süreler 0.
- **z-index:** `sticky 10 · sidebar 900 · header 1000 · dropdown 1100 · overlay 2000 · toast 2400 · tooltip 2500`.

## 5. Vuetify

- Tema `lightTheme`/`darkTheme` uygulama profilinden (119 / 88 anahtar; karakterizasyon tabanı bilinçli yenilendi).
- `vuetify-defaults.ts`: ripple kapalı; VBtn flat; alanlar outlined/compact/`hideDetails:auto`; VCard flat+border; VDataTable hover/fixedHeader/compact; VChip small tonal; VTabs compact primary; VDialog fade+scrollable; **VMenu offset 6**; VTooltip 400 ms altta; VList compact.
- `vuetify-overrides.css` (rol token'ları): kontrol radius 8, kart 12, diyalog 16; kart = kenarlık + `shadow-card`; menü = `shadow-popover` + ince kenarlık; tooltip = ters yüzey + caption; tablo başlığı `surface-muted`/`content-muted`/600;
  **outlined alan zemini `surface` + kenarlık `border-input`**; alan etiketi ve yardım/hata metni opaklığı 1 (AA); yüzen etiket sonrası asıl `<label>` erişilebilir kalır (axe "label" düzeltmesi — tüm uygulamaya yansır).

## 6. Bileşen kataloğu ve kullanım kuralları (`src/components/ds/`)

Mevcut ds bileşenlerinin (EkStatusChip, EkDataTable, EkKpiCard, EkFilterBar, EkPagination, EkConfirmDialog …) **API'si değişmedi.** Yeni DS-v2 bileşenleri:

| Bileşen | Ne zaman | Kurallar |
|---|---|---|
| `EkButton` | tüm düğmeler | `primary` (ana iş, tek) · `secondary` · `ghost` · `danger` (yalnız onay adımı); sıra sağa yaslı `⋯ → ikincil → birincil`; yalnız-ikon → `aria-label` + tooltip zorunlu |
| `EkIconTile` | kart/KPI/menü/sonuç ikonları | ton = anlam; dekoratif (`aria-hidden`) |
| `EkCard` | tüm kartlar | başlık motifi sabit: kapsül + başlık/alt başlık + `#actions` + yuvarlak ok (`to-label`) |
| `EkMetricCard` | KPI | MİKRO ETİKET → değer (metric) + trend (renkli METİN) → açıklama; `loading` iskelet |
| `EkBadge` | sayaç / tür etiketi | durum için DEĞİL (durum = `EkStatusChip`) |
| `EkKbd` | kısayol gösterimi | menü, tooltip, arama alt şeridi |
| `EkTooltip` | ipucu | ters yüzey, kısayol içinde; aria-label'ın yerine geçmez |
| `EkDialog` (+`EkDialogCard`) | tüm diyaloglar | başlık bandı · içerik · eylem çubuğu; `tone="danger"` soru başlığı + nesne adı + varsayılan odak Vazgeç; genişlik sm 440 / md 560 / lg 760 |
| `EkMenuPanel` / `EkContextMenu` | bağlam, satır `⋯`, üst bar menüleri | gruplu (mikro başlık), ayraçlı, ikonlu, kısayollu; tehlikeli en sonda; ↑↓ Home End Enter Esc |
| `EkAppHeader` | üst bar | degrade kimlik; çalışma alanı anahtarı (Genel ↔ seçili kayıt); `#search`; bildirim sayacı, yardım, profil |
| `EkSmartSearch` | üst bar araması | gruplu sonuç + sayaç; eşleşme `<mark>`; tür rozeti + "ETİKET değer" çipleri; combobox/listbox, ↑↓ Enter Esc |
| `EkWorkspaceTabs` | çalışma alanı sekmeleri | etkin sekme içerikle birleşir + 2px aksiyon çizgisi; kapatma hover/etkin'de; uzun başlık … + tooltip; ←/→ Home End Enter Delete; soldaki boşluk yok |
| `EkSidebarNav` | sol menü | etiket 2 satıra sarılır (kesilmez); etkin = `sidebar-active` + 3px gösterge; ray modunda tooltip |
| `EkFormGrid` | TÜM formlar ve filtreler | eşit kolon + 16px boşluk; `ek-span-2`/`ek-span-full`; tablet ≤2, mobil 1 → alanlar üst üste binmez |
| `EkFilterPanel` + `EkActiveFilters` | liste filtreleri | sayfa İÇİ, katlanabilir; Temizle · Sorgula; aktif filtreler çip, tek tıkla kaldır |
| `EkDataGrid` | TÜM liste tabloları | yapışkan mikro başlık, `aria-sort`, seçim + tri-state, hover/selected, tipli kolon (id/num/muted), iskelet, boş durum |
| `EkPagerBar` | sayfalama | çerçevenin ALTINA SABİT; sol boyut+toplam, orta sayfalar, sağ `#trailing` |
| `EkListFrame` | liste ekranı iskeleti | filtreler → kart (toolbar → grid [yalnız burası kayar] → pager) |
| `EkCascadePicker` | kategori ağacı, ekran başlatıcı | Miller kolonları, seçili yol vurgusu, arama tam yol, ←→↑↓ Enter |
| `EkFormSection` | form bölümleri (entegrasyon, ürün, diyalog gövdeleri) | `fieldset` + `legend` (ikon + başlık) + isteğe bağlı yardım; içi `EkFormGrid` (varsayılan 2 kolon); hata metni alanın altında `error` tonunda, `aria-describedby` ile bağlı |
| `EkDialogHost` | sekme içinden açılan panel/çekmece gövdeleri (varyant, eşitleme, galeri) | `EkDialog` kabuğu olmadan yalnız overlay; `attach` ile sekme kapsayıcısına bağlanır (sol menünün altında kalmaz); `placement` center/end |
| `EkCascadeDialog` | form içinde kademeli seçim (pazaryeri kategori eşleştirme) | salt-okunur alan + modal `EkCascadePicker`; taslak yol, Onayla ile yaprak kimliği döner; Esc/Vazgeç değişiklik yapmaz |

Vitrin-only prop'lar (`forceState`, `forceHoverKey`, `forceOpen`, `inline`) yalnızca vitrin içindir.

## 7. Erişilebilirlik ve testler

| Kontrol | Yer | Sonuç |
|---|---|---|
| 73 zorunlu kontrast çifti (light + dark) | `tests/theme/ds-v2-tokens.test.ts` | yeşil |
| Ad koruması (112 eski ad), site profili dondurma, rol belgesi bütünlüğü, ikon/yazı orantısı | aynı dosya | yeşil |
| Vitrin rotası yalnızca DEV | `tests/design-system-route.test.ts` | yeşil |
| Vitrin smoke + **axe WCAG 2.1 AA = 0** + klavye sözleşmeleri | `e2e/specs/design-system.spec.ts` (3 viewport) | 24/24 |

İnceleme görselleri: `DS_REVIEW_CAPTURE=1 DS_REVIEW_WIDTH=1440 npx playwright test e2e/specs/design-system.spec.ts -g inceleme --project=chromium-desktop` (390 için `DS_REVIEW_WIDTH=390`).

## 8. Aşama 2 — göç planı (sıralı)

Her adım ADR-0015 süreçleriyle: spec önce yeşil → göç → ekran görüntüsü bilinçli yeniden tabanlama (Windows) → axe 0 → mandallar düşüş.

1. **Kabuk** — `SecureLayout`, `ApplicationBar` → `EkAppHeader` + `EkSmartSearch` (komut paleti ile birleşik arama, Ctrl+K); `NavigationMenu`/`NavigationRail` → `EkSidebarNav` (kesilen alt menüler); `WorkplaceTabSwitcher`/`.workplace-tabs` → `EkWorkspaceTabs` (soldaki boşluk kalkar; `'ANASAYFA'` büyük harf spec çapası Karar 5.1 listesine alınır). Kısayollar: Ctrl+K, Ctrl+←/→, Ctrl+B.
2. **Liste standardı** — tüm listeler (sipariş, ürün, iade, müşteri, fatura, mesaj, loglar, admin listeleri) `EkListFrame` + `EkFilterPanel` + `EkActiveFilters` + `EkDataGrid` + `EkPagerBar`. Tam sayfa filtre popup'ları kalkar; sayfalama alta sabit. `EkDataTable`/`EkPagination`/`EkFilterBar` bu adımda DS-v2'ye delege eder (API korunur).
3. **Diyalog / menü / form** — `ConfirmationDialogComponent`, `ActionDialogComponent`, `CustomDialogComponent`, `EkConfirmDialog`, `EkFormDialog` → `EkDialog`; `BatchProcessMenu`, satır menüleri → `EkContextMenu`; **tüm formlar `EkFormGrid`** — öncelik **Trendyol pazaryeri entegrasyon formu** (`integrations/*`, üst üste binen alanlar) ve diğer entegrasyon/ayar formları. Bu adımda `site.css` `.v-dialog .v-overlay__content` global kuralı kaldırılır.
4. **Dashboard** — `EkMetricCard` KPI satırı, `EkCard` özet bölümleri (bekleyen aksiyonlar, pazaryeri bağlantı durumu), ECharts teması uygulama profiline bağlanır.

### Adım 3 (diyalog / menü / form) — uygulandı (`cloud/ds-v2-overlays`)

- **Diyalog:** `ConfirmationDialogComponent`, `ActionDialogComponent` aynı API ile `EkDialog` üzerine yeniden yazıldı (`layout/dialogTone.ts`: eski `color` → ton; tehlikeli renk → `tone="danger"`, soru başlığı, varsayılan odak Vazgeç). `EkConfirmDialog`/`EkFormDialog` `EkDialog`'a delege eder (API korunur, `role="alertdialog"` sürer). `EkDialog` geri uyumlu eklemeler: `width="xl"` (1040), `maxWidth`, `attach`, `hideActions/hideCancel/hideClose`, `asForm` (Enter = onay), `iconTone`, `cancelCloses`. Ham `<v-dialog>` kullanan ürün/tanım gövdeleri (toplu silme, varyant, ürün tanımlama/güncelleme, ürün silme) standarda taşındı.
- **Global kural kaldırıldı:** `site.css` `.v-dialog .v-overlay__content { top:0; left:0; max-width: unset; padding: 8px }` silindi; diyalog yerleşimi yalnız `ds/ek-dialog-overlay.css`'ten gelir.
- **Menü:** ürün toplu işlem menüsü → `EkMenuPanel` (gruplar, ayraç, tehlikeli en sonda); varyant satır menüsü → `EkContextMenu`.
- **Form:** 6 entegrasyon formu (Trendyol, Hepsiburada, N11, Pazarama, Ideasoft, Bizimhesap) `IntegrationFormFrame` + `EkFormSection`; sekmeler kart başlığında, eylem çubuğu Vazgeç/Kaydet sağda. Ürün tanım/güncelleme sihirbazı (`ProductInfoFormComponent` ortak gövde, tekil ürün, detaylar), marka/kategori tanım panelleri, manuel fatura/sevkiyat, destek talebi, kullanıcı/istemci ekleme diyalog gövdeleri `EkFormGrid`/`EkFormSection`'a geçti.
- **Kategori:** ürün kategori adımı gömülü `EkCascadePicker` (`embedded`, klavye + arama); pazaryeri kategori eşleştirme alanı `EkCascadeDialog`.
- **Testler:** `integration-forms.spec.ts`, `definition-forms.spec.ts`, `product-form-bodies.spec.ts` (gönderilen gövdeleri göçten ÖNCE sabitledi, sonra da yeşil), `ds-overlays.spec.ts` (seçici klavye/arama, tehlikeli diyalog, form hata metni, axe AA = 0).
- **Kapsam dışı kalan (paralel oturumlar):** ListView içi filtre diyalogları, log listesi filtre formları, sipariş satır menüsü, komut paleti.

## 9. Eski / tutarsız renk envanteri (Aşama 2 temizlik listesi)

Ölçüm 2026-09-29 (`style-baseline.json` + hedefli grep; `src/design/tokens` hariç).

**Toplam literal (style mandalı tabanı, 294 dosya):** hex 383 · `rgb(a)(` 168 · inline `style="` 380 · `cubic-bezier(` 8 · >300ms hareket 5.
Global legacy CSS: `public/assets/css/site.css` (hex 83, rgb 68, cubic-bezier 5) · `integrations.css` (hex 61).

**En yoğun dosyalar (hex+rgb):** `HashtagListView` 33 · `CategorySelectBoxLevelComponent` 22 · `AdminView` 16 · `ActionDialogComponent` 15 · `BrandListComponent` 14 · `CardComponent` 14 · `ApplicationBar` 14 · `ChoicesMappingComponent` 13 · `ChoicesSyncComponent` 12 · `BatchProcessMenu` 11 · `ProductTransferComponent` 10 · `SettingListView` 10 · `Category*` (Integration/List/Sync/Tree) 9'ar · `stores/ecommerce.ts`, `stores/marketplace.ts` 8'er.
**En sık literal değerler:** `#DDD` 23 · `#EEE` 14 · `#FFF` 11 · `#BBB` 8 · `#F3F3F3` 7 · `#FAFAFF` 6 · `#E2E8F0` 6 · `#000` 6 · `#E53935FF` 4 · `#69B6FF` 4 · `#1867C0` 3 · `#3B82F6` 3 · `#4F46E5` 3 → hepsi `ink`/rol token'larına.

**Tanımsız tema anahtarları (kırık):**
- `loginColor` — `AdminView.vue` (+ ADR-0011'de kayıtlı 9 dosya ailesi) → `surface`
- `infoButtonColor` — `ProductImagesComponent.vue`, `ProductVariantImagesComponent.vue` → `action`/`info`
- `slate-100/200/300` (Vuetify tema anahtarı olarak) — `ApplicationBar.vue`, `AdminView.vue` → `surface-sunken`/`border-*`
- `color="tonal"` (renk değil varyant adı) — `CategoryListComponent`, `CategorySyncComponent`, `ProductListView`
- `workspaceColor` ve benzeri tanımsız adlar grep'te bu turda bulunmadı (önceden temizlenmiş).

**Legacy anahtar kullanımı (dosya sayısı) — uygulamada değerleri DS-v2'ye eşlendi, Aşama 2'de adlar da göçer:**
`danger` 53 → `error` · `textfieldColor` 41 → `surface` · `processButtonColor` 38 → `neutral` · `passiveColor` 34 → `content-muted` · `saveButtonColor` 14 (eskiden kırmızı!) → `action` · `newButtonColor` 8 → `action` · `borderColor` 6 · `deleteButtonColor` 6 → `error` · `borderColorLight` 5 · `primaryLighten(More)` 3 · diğerleri ≤2. Tam eşleme: `workspace.ts` `LEGACY_TO_WORKSPACE_MAP`.

**Material palet adları (ton dışı renk):** `color="white"` 39 · `bg-color="white"` 19 · `color="red"` 12 · `color="grey"` 7 · `red-lighten-1/darken-4`, `grey-lighten-*`, `blue-grey-*`, `indigo(-accent-2)`, `orange-darken-2` ve `text-red`/`bg-grey-lighten-5`/`bg-green` sınıfları → semantik tonlar.

**Global kural çakışmaları:** ~~`site.css` `.v-dialog .v-overlay__content {…}`~~ (Aşama 2 / Adım 3'te kaldırıldı), `.v-overlay__scrim { top:1px }`, drawer z-index `!important`'ları.

## 10. Tasarım kararları ve gerekçeleri

1. **Lacivert kimlik + cobalt tek vurgu.** Kimlik (navy) ile aksiyon (cobalt) aynı aileden ama ayrışır: kabuk kurumsal/ciddi kalır, ana iş rengiyle hemen bulunur. Turuncu/teal vurgu reddedildi: turuncu `warning`, teal `success` ile karışır. Cobalt `#2E55D4` beyaz metinle 6,24:1.
2. **Tonlu zemin, beyaz kart.** "Ağırlıklı beyazı azalt": alanın çoğu `app-bg #EDF0F5`; beyaz yalnızca içerik yüzeyinde. Katmanlar ton + kenarlık + yumuşak lacivert gölgeyle ayrışır (ADR-0015'in "gölgesiz kart" kuralı brifin "ince kenarlık + yumuşak gölge" talebiyle güncellendi).
3. **Metin tonlu zeminde de AA.** `content-muted` slate-500'den ink-600'e koyulaştı (tabstrip üzerinde bile 5,29:1).
4. **Profil ayrımı.** Site değerlerine dokunmadan uygulama yeni dile geçer; adlar ortak, geri uyumluluk tam.
5. **Rol token'ları.** Radius/tipografi/gölge/ikon rol adlarıyla tüketilir; ölçek değişince bileşenler dokunulmadan uyum sağlar.
6. **Tekrarlayan motifler bileşene gömülü.** Kart başlığı, ikon kapsülü, mikro etiket, durum çipi her yerde aynı bileşenden gelir → "tek tasarım dili" bütünlüğü kodla korunur.
7. **Formda tek ızgara.** Alanların üst üste binmesi kolon/boşluk tutarsızlığından; `EkFormGrid` + diyalog gövdesinde yüzen etiket payı (8px) standarttır.
8. **Klavye her yerde.** Arama, menü, sekme, tablo sıralama, kademeli seçici WAI-ARIA desenleriyle; kısayollar `EkKbd` ile görünür.

## 11. Açık sorular (kullanıcı onayı)

- Palet/ton seçimleri (özellikle cobalt vurgu ve `app-bg` tonu) onaylanıyor mu?
- Sidebar açık tonlu (mevcut) mu kalsın, yoksa koyu lacivert (üst barla L-kabuk) mi olsun? Token'lar ikisini de destekler.
- Dark mode kapısı ADR-0011 Karar 3 koşullarıyla kapalı kalır.

## 12. İnceleme görselleri (`frontend/docs/design-system-review/`)

`00-vitrin-1440x900-tam.png`, `00-vitrin-1440x900-ilk-ekran.png`, `00-vitrin-390x844-tam.png`, `00-vitrin-390x844-ilk-ekran.png`,
`01-renk` · `02-yuzey` · `03-tipografi` · `04-olcek` · `05-buton` · `06-form` · `07-kart` · `08-rozet` · `09-diyalog` · `10-kabuk` · `11-liste` · `12-kademeli`,
`20-canli-baglam-menusu`, `21-canli-tehlikeli-diyalog`, `m-kabuk-390` · `m-liste-390` · `m-form-390`.

**Aşama 2 / Adım 3 (diyalog/menü/form):** `a2-overlays-trendyol-api-{before,after}-1440`, `a2-overlays-trendyol-varsayilan-{before,after}-{1440,800,390}`, `a2-overlays-dialog-danger-{1440,390}`, `a2-overlays-category-picker-{1440,800}`, `a2-overlays-category-picker-search-1440`, `a2-overlays-product-info-form-1440` (bulutta Linux Chromium ile e2e sahte verisinden alındı; görsel onay yerelde).

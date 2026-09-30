# Entegrasyonik Tasarım Sistemi — DS-v2

> **Durum:** Aşama 1 (tasarım sistemi + vitrin), Aşama 2 (kabuk, liste standardı, diyalog/menü/form, dashboard) ve
> **Aşama 3 (entegrasyon + premium eleştiri turları)** `cloud/ds-v2-int` dalında birleşik (§14); **Aşama 4** (W1/W2 birleştirmesi +
> ikinci bağımsız premium tur) `cloud/ds-v2-int2` (§15); **Aşama 5** (kullanıcı geri bildirimi, 11 madde) `cloud/ds-v2-a5` (§16);
> **Aşama 6b** (uygulama geneli tutarlılık turu, 12 standart + `cloud/ds-v2-a6a` birleşimi) `cloud/ds-v2-a6b` (§17). Görsel taban onayı yerelde (Windows) yapılır.
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
- **Gölge** (lacivert-mürekkep tonlu): `card` (kart), `raised` (hover/tooltip), `popover` (menü/açılır), `dialog`, `chrome` (üst bar), **`scroll-start` / `scroll-end`** (Aşama 3: yatay kaydırılan tabloda yapışık kolonun kenar gölgesi — altında içerik kaldığını söyler; yalnız `EkDataGrid`). Eski `sm/md/lg` korunur.
- **Kontrol yüksekliği:** `sm 32 · md 36 · lg 40`.
- **Hareket:** süre `150/200/300 ms`, eğri `ease-out/ease-in-out`, mesafe `4/8 px`; yalnızca opaklık + kısa slide + renk geçişleri (`--ek-transition-colors`). Hover'da kayma/ölçek, bounce, ripple YOK. `prefers-reduced-motion` → süreler 0.
- **z-index:** `sticky 10 · sidebar 900 · header 1000 · dropdown 1100 · overlay 2000 · toast 2400 · tooltip 2500`.

## 5. Vuetify

- Tema `lightTheme`/`darkTheme` uygulama profilinden (119 / 88 anahtar; karakterizasyon tabanı bilinçli yenilendi).
- `vuetify-defaults.ts`: ripple kapalı; VBtn flat; alanlar outlined/compact/`hideDetails:auto`; VCard flat+border; VDataTable hover/fixedHeader/compact; VChip small tonal; VTabs compact primary; VDialog fade+scrollable; **VMenu offset 6**; VTooltip 400 ms altta; VList compact.
- `vuetify-overrides.css` (rol token'ları): kontrol radius 8, kart 12, diyalog 16; kart = kenarlık + `shadow-card`; menü = `shadow-popover` + ince kenarlık; tooltip = ters yüzey + caption; tablo başlığı `surface-muted`/`content-muted`/600;
  **outlined alan zemini `surface` + kenarlık `border-input`**; alan etiketi ve yardım/hata metni opaklığı 1 (AA); yüzen etiket sonrası asıl `<label>` erişilebilir kalır (axe "label" düzeltmesi — tüm uygulamaya yansır).
  **Aşama 3:** ekran içi `v-tab` cümle düzeni + `tab` rolü (13/18/500, düz aralık); alan yardım/hata metni `caption` rolü (12/16, düz aralık, üstte 4px).
  **Aşama 4:** ham `v-btn` metni boyut → rol (default/large `label` 13 yarı kalın, small `caption`, x-small `micro` boyutu); ikon düğmesi tabanı
  `caption` (glif 1.5em = 18px). Eski `site.css` `12px !important` düğme kuralı kaldırıldı; yüzen alan etiketi `micro` boyutu (10px ölçek dışıydı).

## 6. Bileşen kataloğu ve kullanım kuralları (`src/components/ds/`)

Mevcut ds bileşenlerinin (EkStatusChip, EkDataTable, EkKpiCard, EkFilterBar, EkPagination, EkConfirmDialog …) **API'si değişmedi.** Yeni DS-v2 bileşenleri:

| Bileşen | Ne zaman | Kurallar |
|---|---|---|
| `EkButton` | tüm düğmeler | `primary` (ana iş, tek) · `secondary` · `ghost` · `danger` (yalnız onay adımı); sıra sağa yaslı `⋯ → ikincil → birincil`; yalnız-ikon → `aria-label` + tooltip zorunlu |
| `EkIconTile` | kart/KPI/menü/sonuç ikonları | ton = anlam; dekoratif (`aria-hidden`) |
| `EkCard` | tüm kartlar | başlık motifi sabit: kapsül + başlık/alt başlık + `#actions` + yuvarlak ok (`to-label`) |
| `EkMetricCard` | KPI | MİKRO ETİKET → değer (metric) + trend (renkli METİN) → açıklama; `loading` iskelet; **< 600px** ikon üstte (sütun düzeni) — KPI ızgaraları dar ekranda 2 sütun |
| `EkBadge` | sayaç / tür etiketi | durum için DEĞİL (durum = `EkStatusChip`) |
| `EkKbd` | kısayol gösterimi | menü, tooltip, arama alt şeridi |
| `EkTooltip` | ipucu | ters yüzey, kısayol içinde; aria-label'ın yerine geçmez |
| `EkDialog` (+`EkDialogCard`) | tüm diyaloglar | başlık bandı · içerik · eylem çubuğu; `tone="danger"` soru başlığı + nesne adı + varsayılan odak Vazgeç; genişlik sm 440 / md 560 / lg 760 |
| `EkMenuPanel` / `EkContextMenu` | bağlam, satır `⋯`, üst bar menüleri | gruplu (mikro başlık), ayraçlı, ikonlu, kısayollu; tehlikeli en sonda; ↑↓ Home End Enter Esc |
| `EkAppHeader` | üst bar | degrade kimlik; `#search`; bildirim sayacı, yardım, profil (Aşama 5: "Genel ↔ seçili kayıt" anahtarı KALDIRILDI) |
| `EkSmartSearch` | üst bar araması | gruplu sonuç + sayaç; eşleşme `<mark>`; tür rozeti + "ETİKET değer" çipleri; combobox/listbox, ↑↓ Enter Esc |
| `EkWorkspaceTabs` | çalışma alanı sekmeleri | **Aşama 5:** etkin sekme klasör sekmesi — içerik zemininde, arada çizgi yok (şerit alt çizgisi iç gölge, etkin sekme keser), içbükey alt köşe, `shadow-tab-active`; şerit `tabstrip-bg` bir kademe koyu; taşma YALNIZ yatay (gizli çubuk + solma + ok, tekerlek yatay; dikey kaydırma yok) + 2px aksiyon çizgisi; kapatma hover/etkin'de; uzun başlık … + tooltip; ←/→ Home End Enter Delete; soldaki boşluk yok |
| `EkSidebarNav` | sol menü | etiket 2 satıra sarılır (kesilmez); etkin = `sidebar-active` + 3px gösterge; ray modunda tooltip |
| `EkFormGrid` | TÜM formlar ve filtreler | eşit kolon + 16px boşluk; `ek-span-2`/`ek-span-full`; tablet ≤2, mobil 1 → alanlar üst üste binmez |
| `EkFilterPanel` + `EkActiveFilters` | liste filtreleri | sayfa İÇİ, katlanabilir (Aşama 5: `EkCollapse` ile yükseklik + opaklık 200ms, reduced-motion'da anında); Temizle · Sorgula (Aşama 4: eylem çubuğu gövdeyle aynı `surface-sunken` blok, ayraçsız); aktif filtreler çip, tek tıkla kaldır |
| `EkDataGrid` | TÜM liste tabloları | yapışkan mikro başlık, `aria-sort`, seçim + tri-state, hover/selected, tipli kolon (id/num/muted), iskelet, boş durum; **yatay taşma (Aşama 3):** seçim + ilk (kimlik) kolonu sola yapışık (kap ≥600px; `pin:'none'` kapatır), `pin:'end'` eylem kolonu sağa yapışık, altında içerik kalan kenar `shadow-scroll-*` gölgesi, yapışık kolonsuz dar görünümde CSS kaydırma gölgesi; **dar kap (< 600px, Aşama 4): satır = KART** (☐ · kimlik başlığı · eylemler; altında ETİKET–değer; `label` kart etiketi, `hideLabel` etiketsiz), başlık satırı sıralama çubuğu (sıralanabilir kolon yoksa gizli), açık ARIA tablo rolleri; seçim kolonu tam 44px; tek satır metin kolonu ≤ 240px (üç nokta) |
| `EkPagerBar` | sayfalama | çerçevenin ALTINA SABİT; sol boyut+toplam, orta sayfalar, sağ `#trailing` |
| `EkListFrame` | liste ekranı iskeleti | filtreler → kart (toolbar → grid [yalnız burası kayar] → pager) |
| `EkCascadePicker` | kategori ağacı, ekran başlatıcı | Miller kolonları, seçili yol vurgusu, arama tam yol, ←→↑↓ Home/End Enter Backspace; A9: seviye geçişleri (§18), < 640px tek panel + seviye yolu, `loadChildren` iskeleti |
| `EkDateField` | TÜM tarih alanları | her zaman **GG.AA.YYYY** (tarayıcının yerel `type="date"`'i kullanılmaz); yazarken nokta otomatik; geçersiz tarihte hata metni; takvim Türkçe, pazartesi başlar, sayfa içi küçük menü; `label`/`min`/`max`/temizlenebilir; model `valueFormat` `iso-date` (metin) \| `date` (`Date`), verilmezse gelen türü korur (Aşama 3 birleşimi: iki dalın ayrı yazdığı sürümler tek bileşen) |
| `EkListScreen` | TÜM liste ekranları | başlık = `EkPageBar` (Aşama 5: bölüm › H1 (i) … arama + eylemler tek satır; açıklama + yeteneklerden üretilen ipuçları "Sayfa hakkında" panelinde); `channelKey` → satır kanal şeridi; `#summary` yuvası başlık ile liste arasında (KPI satırı); sayfa boyutu 10/25/50/100, varsayılan 25 (`tests/page-size-standard.test.ts`) |
| `EkSavedViews` | kişisel kayıtlı filtre görünümleri (C2.4) | `EkListScreen` `saved-views` ile filtre başlığının sağında (`EkFilterPanel` `#head-actions`, daraltılmışken de görünür); uygula · sil (toast'ta Geri al) · kaydet; görünüm YALNIZ `screens.ts` `urlParams` alanlarını taşır (`useSavedViews` → `pickUrlParams`; arama metni saklanmaz), yerel depo `ek.views.v1.<userId>.<tenantId>`, erişilemezse gizli; ekran başına ≤20; uygulanınca adres `replace` ile kurulur |
| `EkFormSection` | form bölümleri (entegrasyon, ürün, diyalog gövdeleri) | `fieldset` + `legend` (ikon + başlık) + isteğe bağlı yardım; içi `EkFormGrid` (varsayılan 2 kolon); hata metni alanın altında `error` tonunda, `aria-describedby` ile bağlı |
| `EkDialogHost` | sekme içinden açılan panel/çekmece gövdeleri (varyant, eşitleme, galeri) | `EkDialog` kabuğu olmadan yalnız overlay; `attach` ile sekme kapsayıcısına bağlanır (sol menünün altında kalmaz); `placement` center/end |
| `EkCascadeDialog` | form içinde kademeli seçim (pazaryeri kategori eşleştirme) | salt-okunur alan + modal `EkCascadePicker`; taslak yol, Onayla ile yaprak kimliği döner; Esc/Vazgeç değişiklik yapmaz |
| `EkAlert` (6b) | TÜM satır içi uyarı/bilgi bantları | ton info/success/warning/error; ikon + başlık + metin + `#actions`; ham `v-alert` yok |
| `EkProblemState` (6b) | TÜM hata durumları (sayfa, liste gövdesi, panel, entegrasyon yanıtı) | ne oldu · olası neden · ne yapmalı · Tekrar dene · `#actions` · katlanır teknik ayrıntı (kapalıyken DOM'da yok) |
| `EkToastHost` + `useToast` (6b) | TÜM geçici bildirimler (eski `snackbarStore` buraya yönlenir) | ton şeridi, süre çizgisi, üzerine gelince durur, hata kalıcı, ≤3 |
| `EkBrandLoader` / `EkLoadingOverlay` (6b) | engelleyici iş (kaydet/sil/aktar) | logo motifi animasyon (reduced-motion statik); örtü yalnız sekme kabını örter; ilk yükleme = iskelet |
| `EkRefreshButton` (6b) | sayfa yenileme | `EkPageBar`/`EkPageHeader`/`EkListScreen` `refreshable`; başlık satırının en sağı; dönen ikon; "Son güncelleme"; Alt+R |
| `EkActionButton` + `design/icons.ts` (6b) | TÜM eylem ikonları | kayıt defteri: aynı iş = aynı glif/ton/ipucu; tehlikeli = hata tonu + onay |
| `EkRowActions` (6b) | TÜM liste satır/kart eylemleri | ≤2 eylem ikon düğme (tehlikeli en sağda); 3+ ana eylem + `⋯` (grup, ayraç, tehlikeli en sonda) |
| `EkPageTabs` v2 (6b) | TÜM sayfa içi sekmeler | ikinci seviye: zeminsiz metin + 2px alt çizgi, ikon, sayı rozeti, taşmada ok |
| `EkRecordSummary` / `EkStatusTimeline` / `EkInfoCard` (6b) | kayıt detayı (sipariş, iade) | kanal renkli özet · tarihli durum çizgisi (dar kapta dikey) · bilgi kartları |
| `EkSelect` (6b) | liste filtreleri ve alan-özel seçimler | kanal rengi/durum tonu noktası, alt satır, grup, son kullanılanlar, arama + vurgu, n/m seçili · Tümünü seç · Temizle |

Vitrin-only prop'lar (`forceState`, `forceHoverKey`, `forceOpen`, `inline`) yalnızca vitrin içindir.

**Aşama 2'de eklenen (geri uyumlu) özellikler:** `EkSmartSearch` `openOnFocus` · `emptyText` · öğede `platform` (marka renkli nokta) ·
`dismiss` olayı · dar ekranda görünüm alanına yaslanan açılır · `EkWorkspaceTabs` yalnızca **kesilen** başlıkta tooltip · sağ tık /
Shift+F10 / Menü tuşu → `contextmenu(id,{x,y})` · orta tık kapatır · `focusActive()` · `EkSidebarNav` etiketler kırpılmadan sarılır ·
etkin öğenin grubu kendiliğinden açılır · `#item-trailing` (düğmenin kardeşi) · ray'de grup → `expand-request` · `hookClasses` ·
`EkAppHeader` menü düğmesinde kısayollu ipucu · `menuShortcut` · `menuExpanded` · `recordHint` · `data-header-action` çapaları ·
`#end-start` · `EkMenuPanel` `autofocus` · `EkPlatformMark` `variant="dot"`.
**Kural (tooltip):** Vuetify `VTooltip` varsayılanı `eager: true` — boş `role=tooltip` düğümleri DOM'da kalır (axe `aria-tooltip-name`).
Kabuk/DS tooltip'lerinde `:eager="false"` + `transition="fade-transition"` (ölçek animasyonu yok) kullanılır.

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

1. **Kabuk** ✅ (uygulandı, §13) — `SecureLayout`, `ApplicationBar` → `EkAppHeader` + `EkSmartSearch` (komut paleti ile birleşik arama, Ctrl+K); `NavigationMenu`/`NavigationRail` → `EkSidebarNav` (kesilen alt menüler); `WorkplaceTabSwitcher`/`.workplace-tabs` → `EkWorkspaceTabs` (soldaki boşluk kalkar; `'ANASAYFA'` büyük harf spec çapası Karar 5.1 listesine alınır). Kısayollar: Ctrl+K, Ctrl+←/→, Ctrl+B.
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

## 9. Eski / tutarsız renk envanteri — SIFIRLANDI (Aşama 3)

Ölçüm 2026-09-30 (`scripts/style-literal-counts.js`; `src/**` + `public/assets/css/site.css`, `src/design/tokens` hariç, 386 dosya):

| Kategori | Aşama 1 tabanı (2026-09-29) | Aşama 3 sonu |
|---|---|---|
| hex | 383 | **0** |
| `rgb(a)(` | 168 | **0** |
| `cubic-bezier(` | 8 | **0** |
| >300 ms hareket | 5 | **0** |
| inline `style="` | 380 | 37 — hepsi veri güdümlü `:style` (kullanıcının seçtiği etiket/marka rengi, platform rengi, kâğıt/çerçeve ölçüsü, konum, girinti) |
| eski tema anahtarı çağrı yeri (`danger` renk olarak, `textfieldColor`, `processButtonColor`, `passiveColor`, `save/new/deleteButtonColor`, `loginColor`, `slate-*`, `color="tonal"` …) | ~250 | **0** (uyum adaptörleri `workspace.ts` `LEGACY_TO_WORKSPACE_MAP` ve `layout/dialogTone.ts` eski çağıranlar için duruyor) |
| Material palet adları (`white`, `red`, `grey*`, `blue-grey*`, `indigo*`, `orange*`, `text-red`, `bg-grey-lighten-5` …) | ~90 | **0** |

- `public/assets/css/integrations.css` tamamen ölüydü → silindi. `site.css` ~1000 satır ölü kural silindi; kalanlar rol token'ı.
- Global kural çakışmaları kalktı: `.v-overlay__scrim { top:1px }`, drawer `z-index … !important`, eski `EkDetailSheet` yaması.
- Kullanıcı verisi olan renkler (etiket paleti, marka paleti) kayıtlı değerleri değişmesin diye sayısal (`0xRRGGBB`) tutulup çalışma anında `#RRGGBB`'ye çevrilir; baskı penceresi (`BarcodePrintComponent`) uygulama token'ı taşımadığı için `black`/`white` anahtar sözcükleri kullanır.
- Desen mandalı (19): `definitions/*` 7 eski prototip ekranı + `TEST.vue` ham `v-data-table` (karakterizasyon spec'i sabitliyor), `LoadingComponent` `v-progress-circular` (DS'de spinner bileşeni yok, bilinçli).

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

## 13. Aşama 2 / adım 1 — Kabuk (uygulandı)

| Parça | Dosya | Ne yapar |
|---|---|---|
| Yerleşim | `layouts/SecureLayout.vue` | Üst bar tam genişlik (Vuetify layout sırası), altında sol menü + sekme şeridi + çalışma alanı. Üst bölüm daraltma (üst bar yukarı kayar), odak modu (üst bar + sol menü gizli, destekleniyorsa tarayıcı tam ekranı; tam ekrandan Esc ile çıkış odak modunu da kapatır). Sekme değişiminde çalışma alanına kısa giriş hareketi (opaklık + 4px, `--ek-duration-base`, `--ek-easing-enter`; reduced-motion'da yok). Tüm kısayolların tek dinleyicisi. |
| Üst bar | `components/layout/ApplicationBar.vue` | `v-app-bar` (düzen) + `EkAppHeader` (görünüm). (Aşama 5: çalışma alanı anahtarı kaldırıldı.) Yardım ve hesap menüleri `EkMenuPanel` (kısayollu, tehlikeli "Çıkış" en sonda). |
| Akıllı arama | `components/layout/ShellSearch.vue` | Komut paleti ile BİRLEŞİK (Ctrl+K). Boş sorgu: **Son açılanlar** (oturum içi, yalnız bellekte). Sorgu: **Ekranlar** (menü, anında) + ≥2 karakterde `SmartService/unifiedSearch` → Siparişler / Ürünler / Müşteriler / İadeler ve talepler; grup başlığı + sayaç, eşleşme `<mark>`, "ETİKET değer" çipleri, kanal marka noktası. Seçim eski davranışla aynı (arama değeri sekme parametresi — URL'ye yazılmaz). Uydurma sonuç yok. |
| Sekmeler | `components/layout/ShellTabStrip.vue` | `EkWorkspaceTabs`; her açık örnek ayrı sekme; pano sekmesi sabit. Sağ tık: Kapat · Diğerlerini kapat · Sağdakileri kapat. Sağ uçta: açık sekmeler listesi (Alt+1…9 ipuçlu, "Tümünü kapat"), üst bölümü daralt, odak modu. |
| Sol menü | `components/layout/NavigationMenu.vue`, `NavigationRail.vue`, `useShellMenu.ts` | `EkSidebarNav` (tam) ve aynı modelin ray sunumu (ikon + sağa açılan ipucu). Favori yıldızı öğenin sağında. Spec çapaları korunur: `.soft-nav`, `.soft-item`, `.v-list-group`/`__header`, `.sub-item-soft`, `.soft-rail`, `.rail-logo-btn`, `.collapse-btn`. |
| Kısayol kaydı | `navigation/shortcuts.ts` | Kısayolların TEK tanımı; dinleyici, ipuçları (EkKbd) ve `?` diyaloğu (`ShortcutHelpDialog.vue`) buradan okur. |

**Kısayollar** (metin alanında yazarken yalnızca Ctrl+K, Ctrl+Shift+H ve Ctrl+Shift+F çalışır — Ctrl+B orada "kalın" olarak kalır; tarayıcının kendi kısayolları ezilmez):

| Tuş | Eylem |
|---|---|
| Ctrl+K | Akıllı aramaya git (üst bar gizliyse geçici olarak gösterir; Esc önceki odağa döner) |
| ? | Klavye kısayolları listesi |
| Ctrl+→ / Ctrl+← | Sonraki / önceki sekme |
| Alt+1…9 | N. sekmeye git |
| Alt+W | Etkin sekmeyi kapat (pano sekmesi kapanmaz) |
| Ctrl+B | Sol menü: masaüstünde tam ↔ ray, tablet/mobilde katmanı aç/kapa |
| Ctrl+Shift+H (eski Alt+U takma ad) | Üst bölümü daralt / göster (Aşama 5; düğmesi üst barın altındaki yüzen tutamakta) |
| Ctrl+Shift+F | Tam ekran / odak modu (düğmesi yüzen tutamakta) |
| Sekme şeridinde ←/→ · Home/End · Enter · Delete · Shift+F10 | gezin · etkinleştir · kapat · sekme menüsü |
| Aramada ↑/↓ · Enter · Esc | gezin · aç · kapat |

**Ölçü:** `--ek-app-tabstrip-height` 36 → **40px** (`design/app.css`; etkin sekme 36px + üst boşluk). Token dosyalarına dokunulmadı.
**Spec'ler:** yeni `e2e/specs/shell-dsv2.spec.ts` (kısayollar, arama klavyesi, sekme menüsü, kayıt anahtarı, kabuk bölgelerinde axe AA = 0);
`shell-v2`/`navigation`/`session-isolation`/`admin-integration-settings`/`settings` + `fixtures/session.ts` yalnızca seçici güncellemesi (sayfa-genel seçiciler `.workplace-area`'ya kapsandı — üst barda artık "Genel" metni ve radio var) (Karar 5.1 izinli değişiklik 1 — iddialar aynı;
komut paleti iddiaları birleşik aramaya taşındı; sekme başlıkları artık cümle düzeninde, `'ANASAYFA'` karşılaştırması büyük harfe çevrilerek).
**İnceleme görselleri:** `a2-shell-1440-{kabuk,arama,sekme-menusu,kisayollar,ray,ust-daraltilmis}.png`, `a2-shell-390-{kabuk,arama,sekme-menusu,kisayollar,menu}.png`
(`SHELL_REVIEW_CAPTURE=1 SHELL_REVIEW_WIDTH=1440|390 npx playwright test e2e/specs/shell-dsv2.spec.ts -g inceleme`).
**Açık:** görsel tabanlar (`shell-dashboard` vb.) Windows'ta bilinçli yeniden tabanlanmalı; ~~`menu.user.user` gibi ham anahtarlar~~ → Aşama 3'te `navigation/menuTitle.ts` ile kapatıldı (§14).
**Aşama 2 / Adım 3 (diyalog/menü/form):** `a2-overlays-trendyol-api-{before,after}-1440`, `a2-overlays-trendyol-varsayilan-{before,after}-{1440,800,390}`, `a2-overlays-dialog-danger-{1440,390}`, `a2-overlays-category-picker-{1440,800}`, `a2-overlays-category-picker-search-1440`, `a2-overlays-product-info-form-1440` (bulutta Linux Chromium ile e2e sahte verisinden alındı; görsel onay yerelde).

## 14. Aşama 3 — entegrasyon ve premium eleştiri turları (`cloud/ds-v2-int`)

**Birleştirme** (sırayla, `--no-ff`): shell → lists → overlays → dashboard → b4p1c-dsv2 → w1-notifications → w1-privacy-complete →
w1-stock-health → w1-finance. Çakışma notları dal commit mesajlarında; özet: `EkDateField` iki dalda ayrı yazılmıştı (tek API'de
birleştirildi), `ProductListView` (liste gövdesi + overlays diyalogları), `EkMenuPanel` (autofocus + başlık), `screens.ts`/`menu.ts`/
`status-map.ts` (tüm eklemeler korundu), `tr.json`/`en.json` (yapısal 3 yollu JSON birleştirme; değer çakışması yok).

**Tamamlanan bağlantılar:** stok tahsis zaman çizgisi sipariş detayında (`OrderDetailComponent`, yalnız tahsis durumu olan kalem
varsa); müşteri anonimleştirme (`CustomerService/anonymizeCustomer`, müşteri kartı ⋯ menüsü → tehlikeli onay; `useUser.isTenantAdmin`
yalnız görünürlük ipucu).

**Sistem düzeyi değişiklikler (tüm ekranlara yansır):**

| Konu | Değişiklik |
|---|---|
| Menü başlıkları | `navigation/menuTitle.ts` tek çözümleyici: menü anahtarı → üst/başlık varyantı → `screens.ts` `titleKey` → okunur yedek. Ham i18n anahtarı ekrana düşmez (sol menü, ray, arama, sekme şeridi). `sections.ts`'e `settings`, `account`. |
| Sayfa boyutu | Tek standart 10/25/50/100, varsayılan 25; statik test standart dışını engeller. |
| Tablo taşması | `EkDataGrid` yapışık ilk/seçim/eylem kolonu + kenar gölgesi (yeni `shadow-scroll-start/end` token'ı — gerekçe: kesik kolon yerine "kaydırılabilir" ipucu; mevcut gölgeler yöne bağlı değildi). |
| Başlık ritmi | `EkListScreen` bölüm yolu + `#summary`; `EkPageHeader`, `EkSettingsSection` tip rollerine bağlandı. |
| KPI dili | `EkKpiCard` = `EkMetricCard` dili (mikro etiket, `metric` değer); finans özeti, sistem yönetimi metrikleri aynı dile taşındı. |
| Sekmeler/alanlar | `v-tab` cümle düzeni; alan yardım/hata metni `caption` rolü; giriş sekmeleri cümle düzeni. |
| Metin | Boş/hata durum ve diyalog başlıkları cümle düzeni; `formatPhone` tek telefon biçimi. |
| Renk envanteri | §9 — sıfırlandı. |

**Eleştiri turları:** `docs/design-system-review/a3-critique-{1,2,3}.md` (ekran başına kusur listesi + durum). Araç:
`A3_REVIEW=1 A3_REVIEW_WIDTH=1440|390 A3_REVIEW_OUT=<klasör> npx playwright test e2e/specs/a3-review.spec.ts --project=chromium-desktop`
(`e2e/fixtures/reviewScreens.ts`: `screens.ts`'teki tüm ekranları kapsayan sentetik menü + dolu durum fixture'ları).
Son görüntüler: `docs/design-system-review/a3-final/*.png` (1440 ve 390; Linux Chromium — görsel onay yerelde).

## 15. Aşama 4 — W1/W2 birleştirmesi ve ikinci bağımsız premium tur (`cloud/ds-v2-int2`)

**Birleştirme** (sırayla, `--no-ff`, taban `cloud/ds-v2-int-fix`): `ds-v2-int` (a3-final) → `w1-integration-coverage` →
`w2-subscription-banner` → `w2-saved-views` → `w2-message-sla`. Çakışmalar: 7 spec (int-fix'in Windows'ta doğrulanmış sürümü alındı —
pano kartıyla çift RPC ayrımı, diyalog axe geçiş zamanlaması, dar ekran imleç), marka/kategori panelleri (< 960px üst üste; iki
düzeltmenin birleşimi), `en.json` (abonelik bandı + mesaj bekleme anahtarları birlikte). W2 ekranlarında int-fix sınıfı sorunlar
(diyalog axe zamanlaması, < 600px iki panel, pano kartıyla çift RPC) yeniden kontrol edildi: webhook onay diyaloğu axe = 0, abonelik
bandı ekranın kendi okumasıyla çakışmıyor (ekranda bant gizli, dönüşte yeniden okunur), kayıtlı görünümler paneli `role=dialog` axe = 0.

**Sistem düzeyi değişiklikler:**

| Konu | Değişiklik |
|---|---|
| Mobil liste | `EkDataGrid` dar kap kart düzeni (§6) — 390px'te durum/tutar/mesaj metni/bekleme rozeti görünür. |
| Düğme tipografisi | Ham `v-btn` = `EkButton` dili (§5); eski `site.css` kuralı kalktı. |
| Sayfa ızgarası | `EkSettingsTemplate` ve abonelik içeriği sola hizalı (liste/pano ile aynı sol kenar), `section` → bölüm yolu; sekmeli sayfalarda (İşlem kayıtları, Finans) bölüm yolu. |
| Liste başlığı | ≥ 1024px'te arama + eylemler her zaman sağ üstte; mobilde arama + yenile ilk satır, metinli eylemler alt satıra. |
| Durum dili | Hata durumunda sayfalama gizli (hata ≠ "0 kayıt"); destek durumu tek kaynak (`TicketTypes`); BÜYÜK HARF düğme/rozet/diyalog metinleri cümle düzeni. |
| KPI | Finans özet şeridi değerleri nötr (renk anlamı: başarı/aksiyon ≠ tutar vurgusu); mobilde 2 sütun. |
| Menü | Menü ikonu yoksa `screens.ts` ikonu (belgelenmiş yedek niyeti). |

Token değişikliği YOK (yalnız mevcut rol token'larına bağlama). **Eleştiri turları:** `docs/design-system-review/a4-critique-{1,2,3}.md`.
Araç: `A4_REVIEW=1 A4_REVIEW_WIDTH=1440|800|390 A4_REVIEW_OUT=<klasör> npx playwright test e2e/specs/a4-review.spec.ts --project=chromium-desktop`
(ekranlar + W1/W2 durumları + boş/hata/yükleniyor/stres + klavye odağı; saat sabit). Son görüntüler: `docs/design-system-review/a4-final/*.png`
(1440 ve 390; Linux Chromium — görsel onay yerelde).

## 16. Aşama 5 — kullanıcı geri bildirimi (11 madde, `cloud/ds-v2-a5`)

Her madde tek yerde (DS bileşeni / token) çözüldü ve tüm ekranlara yayıldı; ekran başına yama yok.
Önce/sonra görüntüleri: `docs/a5-review/{before,after}/mNN-*-{1440,390}.png` (+ sekme şeridi 800);
araç `A5_REVIEW=1 A5_REVIEW_WIDTH=1440|800|390 A5_REVIEW_OUT=<klasör> npx playwright test e2e/specs/a5-review.spec.ts --project=chromium-desktop`
(`A5_REVIEW_SCALE=2` yakın çekim).

| # | Konu | Tek kaynak | Değişiklik |
|---|---|---|---|
| 1 | Hiyerarşi | `EkPageBar` | üst bar → sekme şeridi → **tek satır** (bölüm › H1 (i) · meta … eylemler) → filtre → içerik; büyük başlık+açıklama bloğu yok (liste ekranlarında ~60px dikey kazanç) |
| 2 | Çipler | `EkStatusChip`, `EkActiveFilters`, `v-chip` (overrides), `--ek-app-chip-h-sm/md` (22/28) | tek çip dili: ton `subtle` zemin + 1px `*-border` + `*-emphasis` metin (AA), hap yarıçap, 14px ikon/6px nokta optik ortalı, hover/odak halkası |
| 3 | Kanal renkleri | `palette.ts` `channelPalette` → `--ek-channel-<kod>-{solid,subtle,border,text}` + `.ek-ch-<kod>` kapsam sınıfları (`render.ts`), `design/channels.ts` | kanallar ayrışır (renk açısı ≥ 20°, test); kanal çipi (`EkChannelDot`), kanal tonlu avatar + alt şerit (`EkPlatformMark`), entegrasyon kartı sol şerit/seçim, liste satırı/kartı sol şerit (`EkDataGrid channelKey`), varyant kanal durumu; `integrationAccent` = `solid` (geri uyum) |
| 4 | Etkin sekme | `EkWorkspaceTabs`, `tabstrip-bg` ink-200 / `tab-hover` ink-150, `shadow-tab-active` | klasör sekmesi: içerik zemini, çizgisiz tek parça geçiş, içbükey köşe; pasifler geri planda |
| 5 | Dikey kaydırma | `EkWorkspaceTabs` | kap `overflow:hidden`, liste yalnız yatay + çubuk alanı 0; solma + ok; e2e: 3 viewport'ta dikey taşma/çubuk alanı 0 |
| 6 | Sayfa başlığı | `EkPageBar` (+ `EkPageHeader`, `EkListScreen` delege eder) | açıklama breadcrumb satırındaki (i) ile açılan "Sayfa hakkında" panelinde: amaç · ipuçları · kısayollar · "Tüm kısayollar" (`ek:shortcut-help`); varsayılan kapalı, tercih ortak ve hatırlanır (`usePageAbout`, `ek.ui.v1.pageAbout`) |
| 7 | Filtre geçişi | `EkCollapse` | `grid-template-rows 0fr↔1fr` + opaklık, `--ek-duration-base`; kapalıyken `visibility:hidden` + `inert` |
| 8 | Etiket titremesi | `vuetify-overrides.css`, `site.css` | hareket eden etiket geçiş boyunca görünür; ölçek = micro/body (11/14) → varış boyutu = yüzen kopya; iki kopya aynı ağırlık/aile/aralık; yalnız transform |
| 9 | Üst bölüm / tam ekran | `ShellChromeHandle`, `shortcuts.ts` | düğmeler sekme şeridinden kalktı → üst barın alt kenarında yüzen tutamak (dinlenirken 12px dil, üzerine gelince/odakta iki düğme); **Ctrl+Shift+H** üst bölüm (Alt+U takma ad), **Ctrl+Shift+F** tam ekran; kısayol listesinde ve tooltip'te |
| 10 | Genel \| Seçili kayıt | `EkAppHeader`, `ApplicationBar`, `stores/workspace` | anahtar ve `recordTab`/`activateGeneral` kaldırıldı; kayıt bağlamı sekme şeridinden |
| 11 | Ürün seçenekleri | `ProductVariantListComponent`, `EkDataGrid` genişleme geçişi | varyant ızgarası: mikro başlık + sıralama, görsel + stok kodu/barkod, grup hücresi, seçenek çipleri, fiyat/stok sağa hizalı tabular (tükenen vurgulu, raf), kanal renginde durum çipi + ikon |

**Yeni token'lar:** `shadow-tab-active`, `--ek-channel-*` (6 kanal + nötr × 4 ton), `.ek-ch-*` kapsam sınıfları,
`--ek-app-chip-h-sm/md`. **Değişen:** `tabstrip-bg`/`tab-hover` (light). **Yeni bileşenler:** `EkPageBar`, `EkCollapse`,
`ShellChromeHandle`. **Testler:** `tests/theme/channel-tokens.test.ts`, `tests/shell-shortcuts.test.ts` (Ctrl+Shift+H),
`e2e/specs/page-about.spec.ts`, `shell-dsv2` (dikey taşma 3 viewport; anahtar testi → "anahtar yok, sekmeden geçiş").

## 17. Aşama 6b — uygulama geneli tutarlılık turu (12 standart, `cloud/ds-v2-a6b`)

Taban `cloud/ds-v2-a5` (A5 bitmiş: `docs/a5-review/after/*` commit'li). **`cloud/ds-v2-a6a` birleştirildi** (a6a-review görüntüleri
commit'liydi): çakışma yalnız mandal tabanlarında (yeniden sayıldı, artış yok). a6a raporunda ayrı bir "ortak bileşen ihtiyaçları"
listesi yoktu; a6a'nın ekrana özel ortak parçaları bu standartlara bağlandı: `IntegrationErrorPanel` → `EkProblemState` (Standart 1),
`IntegrationLoadingBlock` iskelet deseni (Standart 8), `ChannelTabList` ikinci seviye sekme dili (Standart 5), varyant araç çubuğu →
`EkBulkBar` (Standart 3). Süreç: envanter → tek ds bileşeni/desen → tüm ekranlar → ekran görüntüsü göz incelemesi → 2. iterasyon.
Önce/sonra: `docs/a6b-review/{before,after}/sNN-*-{1440,390}.png`; araç
`A6B_REVIEW=1 A6B_REVIEW_WIDTH=1440|390 A6B_REVIEW_OUT=<klasör> npx playwright test e2e/specs/a6b-review.spec.ts --project=chromium-desktop`.

| # | Standart | Envanter (önce) | Tek kaynak | Uygulandı |
|---|---|---|---|---|
| 1 | Hata / uyarı / bilgi / boş / toast | 21 ham `v-alert` (11 dosya); 3 bildirim mekanizması (snackbar 154 çağrı, `useToast` 14, `LoadingComponent` sonuç kutuları); hata deseni 2 farklı görünüm | `EkAlert`, `EkProblemState`, `EkEmptyState`, `useToast`/`EkToastHost`, `useProblem` | ham `v-alert` 0 (detay ekranları dahil); `snackbarStore` → `useToast` (ayrı görünüm silindi); `LoadingComponent` sonuçları toast; `EkErrorState`, `IntegrationErrorPanel`, `EkDataGrid` hata gövdesi → `EkProblemState`; sipariş/iade listesi hatasında neden + teknik ayrıntı (`problemFromError`). Entegrasyon yanıtı alınamama (kategori/özellik/değer eşleme) aynı desen. |
| 2 | Mobilde tablo → kart | `EkDataGrid` kart (26 liste); `EkDataTable` kartsız (9 kullanım: sipariş/iade/müşteri kalemleri, yönetim tabloları); ham `v-data-table` 8 | `EkDataGrid`, `EkDataTable` kap sorgusu (< 600px) | `EkDataTable` kart düzeni (ilk kolon başlık, `actions` sağ üst, ETİKET–değer); ham `v-data-table` mobil satırı ds kart dili (Vuetify eşiği değişmedi); kart sıralama çubuğu tek satır yatay kayar. Kartta: birincil alan, durum çipi, kanal şeridi, ana eylem + `⋯`. |
| 3 | Toplu işlem + bağlam | `EkBulkBar` 9 ekran + 2 kopya (bildirim, varyant); satır eylemi 18 ekranda 2–3 serbest ikon, 1 ekranda `⋯` | `EkBulkBar`, `EkRowActions`, `EkContextMenu`/`EkMenuPanel` | kopyalar `EkBulkBar`'a; tüm liste eylem hücreleri `EkRowActions` (tek kural: ≤2 ikon, 3+ ana + `⋯`; tehlikeli kırmızı, menüde en sonda); sipariş satır menüsü aynı bileşene. |
| 4 | Ana sekmeler dar ekranda | ok/solma/tekerlek/etkini göster/liste menüsü vardı; 390px'te sekmeler "F…" | `EkWorkspaceTabs`, `ShellTabStrip` | < 768px sekme ≥ 136px + yatay kayar; kapatma yalnız etkinde; açık sekmeler listesinde "Etkin sekme"; A5 klasör/çizgisiz geçiş korundu. |
| 5 | Sayfa içi sekmeler | `EkPageTabs` (3 ekran, rozet/ikon yok) + 4 ham `v-tabs` (farklı renk/büyük harf) | `EkPageTabs` v2 | ikinci seviye dil (zeminsiz metin + 2px aksiyon alt çizgisi), ikon, sayı rozeti, taşmada ok; müşteri, mağaza detayı, ayarlar göç etti (giriş ekranının segment anahtarı bilinçli istisna). |
| 6 | Sipariş + iade | detay: düz tanım listeleri, statik rehber kartları, tarihsiz stepper | `EkRecordSummary`, `EkStatusTimeline`, `EkInfoCard` | özet başlık (kanal rengi, alıcı, No, tarih, toplam), tarihli durum çizgisi (iptal/red başarısız adım), kalemler + tutar dökümü, Alıcı/Teslimat/Kargo/Fatura kartları; iade nedeni kartı + süreç adımları + geçmiş; başlıkta sıradaki iş birincil, iptal/red tehlikeli. Müşteri metrikleri veride yoksa gösterilmez (backend projeksiyonu göndermiyor — uydurma 0 yok). `EkDetailSheet` axe 2 → 0. |
| 7 | Sekme sınırında overlay | tek `.workplace-area`; ~30 örtü gövdeye teleport (yan sayfalar, onaylar, alt sayfalar) | `WorkspaceTabHost` + `useTabScope`/`useTabOverlay` | bkz. aşağıda. |
| 8 | Yükleme | `LoadingComponent` dönen çember + sonuç kutuları (55 kullanım); iskelet 19; düğme içi `EkButton loading` | `EkBrandLoader`, `EkLoadingOverlay`, `EkSkeleton`, `EkButton loading` | tek desen: ilk yükleme = iskelet (yüklenirken "0 kayıt" sayfalaması gizli), engelleyici iş = sekme içi marka örtüsü (+ isteğe bağlı yüzde), düğme işi = düğme içi. |
| 9 | Sayfa yenileme | 13 farklı yenile düğmesi (ikincil "Yenile", araç çubuğu ikonu, kutu düğme; çoğu dönmüyor) | `EkRefreshButton` | başlık satırının en sağı (dar ekranda başlık satırında), çerçeveli 32px, yüklenirken döner (reduced-motion'da durur), ipucu "Yenile · Son güncelleme 14:02 · Alt+R"; pano, stok sağlığı, entegrasyon sağlığı, bildirimler, sistem yönetimi + tüm `EkListScreen` listeleri. |
| 10 | Eylem ikonları | kayıt defteri yok; sil 9 glif, düzenle 6, görüntüle 5, indir 5, yükle 6, kapat 6, `⋯` yatay/dikey | `design/icons.ts`, `EkActionButton` | 49 eski glif kanoniğe (68 dosya); sil = `trash-can-outline` + hata tonu + onay; iptal = `cancel`; görüntüle = `eye-outline`; `⋯` yatay. Alan-özel eylem (Yanıtla, Okundu işaretle) kendi ikonunu korur. |
| 11 | Form elemanları | `density="comfortable"` 67, `variant="plain"` 42 (7 eski ekran), anahtar rengi/inset 22 sapma; komşu yardım metni alanı uzatıyordu | Vuetify varsayılanları + `vuetify-overrides.css` | tek yükseklik 40px (compact), anahtar tek görünüm (inset, primary), seçim denetimleri 40px satır, tek satır alanda önek/yer tutucu kaymaz, `v-input` satırları `auto auto` (ızgarada alan boyu sabit). A5 etiket geçişi korundu. |
| 12 | Açılır listeler | kanal/durum seçimleri şablonsuz; kanal kaynağı 3 farklı; `#item` şablonlarında `role=option` eksik (10 dosya) | `EkSelect` + `selectOptions.ts` | kanal rengi + tür alt satırı, durum tonu, grup, son kullanılanlar, 8+ seçenekte arama + `<mark>` vurgusu, n/m seçili · Tümünü seç · Temizle, "+n" çip özeti, boş/yükleniyor metni; 18 filtre alanı göç etti; marka/kategori seçicilerin mevcut özel şablonları korundu + `role=option`. |

### 17.1 Standart 7 — sekme içi örtüler (çalışma alanı çoklu görevi)

- Her sekme `WorkspaceTabHost` (`#ek-tab-host-<kod>`, `position:relative`) içinde çizilir; gizli sekmede kap `display:none` → örtüler
  durumunu koruyarak gizlenir, sekmeye dönünce aynı durumda görünür.
- ds örtüleri (`EkDialog`, `EkDialogHost`, `EkCascadeDialog`, `EkDetailSheet`, `EkLoadingOverlay`, `LoadingComponent`) `useTabOverlay` ile
  kaba bağlanır (`attach` + `contained`); ham `v-dialog`/`v-bottom-sheet` Vuetify varsayılanlarıyla (defaults provider) aynı kaba.
- Odak tuzağı sekme içi: odak kabın içinde örtü dışına kaçarsa örtüye döner; sekme şeridi / üst bar / sol menü serbest. Fareyle geri
  dönüşte odak açık örtüye, klavyeyle şeritte geziniliyorsa şeritte kalır.
- Esc ve perde tıklaması yalnız ODAKTAKİ sekmenin en üst örtüsünü kapatır (Vuetify genel yığını başka sekmedeki örtüyü "en üst" saydığı
  için kapanış `useTabOverlay`'de). Kabuk kısayol bekçisi yalnız uygulama geneli örtülerde durur → diyalog açıkken Ctrl+←/→ çalışır.
- **Tam ekran kalan (uygulama geneli) örtüler:** kısayol listesi (`ShortcutHelpDialog`, SecureLayout), bildirim çekmecesi
  (`NotificationDrawerComponent`), toast (`EkToastHost`, App.vue), üst çubuğun uygulama yükleme örtüsü (ApplicationBar → `.AppView`),
  akıllı arama sonuçları ve kabuk menüleri (sekme/hesap/yardım). Oturum süresi dolunca diyalog değil `/login?reason=session-expired`
  yönlendirmesi var; genel onay servisi yok.
- Test: `e2e/specs/tab-overlays.spec.ts` (iki sekmede ayrı diyalog, geçiş, diğer sekmede işlem, Esc yalnız odaktaki sekme, şerit/arama
  örtü altında değil, Ctrl+←/→ diyalog açıkken).

### 17.2 Yeni kısayol

| Tuş | Eylem | Not |
|---|---|---|
| Alt+R | Etkin sekmenin sayfa verisini yenile (`EkRefreshButton`) | Ctrl+R / F5 tarayıcıyı yeniler (EZİLMEZ — tüm sekmeler kaybolurdu); Alt+R Chrome/Edge/Electron'da ayrılmış değil; AltGr (Ctrl+Alt) ile eşleşmez; metin alanında çalışmaz. |

### 17.3 Bekçiler (mandal / test)

`tests/a6b-standards.test.ts` — eski eylem glifi 0 (kayıt defteri dışı ikon yasak), liste eylem hücreleri `EkRowActions`, sekme kabı +
ds örtüleri sekme kapsamında, hiçbir örtü `attach="body"`/`:attach="true|false"` ile kendini gövdeye zorlamaz (uygulama geneli liste
hariç), kabuk bekçisi yalnız genel örtüde durur, Alt+R eşlemesi, başlıkta serbest "Yenile" yok, `EkDataTable`/`EkDataGrid` kart kap
sorgusu, "n … seçildi" çubuğu yalnız `EkBulkBar`, ham `v-tabs` yok (giriş hariç), alan yoğunluk/varyant sapması 0, anahtar rengi yalnız
primary, `#item` şablonlarında `role=option`, kanal filtresi `EkSelect`. `tests/select-options.test.ts` (seçenek mantığı),
`tests/useToast.test.ts`, `tests/error-reporting.test.ts` (toast'a yönlenme). e2e: `tab-overlays.spec.ts`, vitrin §13 `design-system.spec`
(axe dahil). Token değişikliği YOK.

**Bilinçli e2e seçici güncellemeleri (iddia aynı):** yeni gliflere seçiciler (`.mdi-eye` → `.mdi-eye-outline` vb.), hata deseninin
"ne oldu / ne yapmalı" iki satırı (7 iddia), `EkProblemState` sınıfı (kategori eşleme), mağaza detayı sekme adı cümle düzeni.
## 17b. A7 — breadcrumb + sayfa başlığı satırı (`cloud/fe-breadcrumb`)

Kullanıcı: "breadcrumb gösterimi çok amatör". Tek kaynak `EkPageBar` (tüm sayfalar `EkPageHeader` / `EkListScreen` /
`EkSettingsTemplate` üzerinden aynı bileşeni kullanır; statik test ekranların kendi breadcrumb'ını yazmasını engeller).

    [▣ Bölüm] / Üst ekran / Üst ekran / H1 Başlık [● kod ⧉] (i) · meta ........ eylemler [↻]

| Karar | Gerekçe |
|---|---|
| Kök = modül ikonu kapsülü (24px, `tile` radius, `sidebar-section` lacivert ikon) + bölüm adı; tıklanmaz | Nerede olduğunu sol menüyle aynı ikonla söyler; bölüm bir ekran değildir (ADR-0015 Karar 2.3). İkon menü kaydından (`usePageContext`, `WorkspaceTabHost` sağlar; alt öğede üst öğenin ikonu; klon sekmede ilk üst ekranın ikonu) |
| Ayraç tipografik `/`, `content-subtle`, `aria-hidden` | chevron ikonu yerine daha sakin; ekran okuyucu okumaz |
| Ara öğe = gerçek üst ekran (`trail: EkCrumb[]`, `onSelect` → bağlantı): `content-muted`, hover'da metin koyulaşır + `tab-hover` zemin + ince alt çizgi | ölü bağlantı yok; hizayı bozmayan negatif kenar payı |
| Son öğe = tek H1, `title` rolü (22/30/600), `aria-current="page"` | hiyerarşinin tek güçlü noktası; 40px satır ritmine sığar |
| Uzun yol: > 2 ara öğe '…' menüsüne (`EkContextMenu`); satıra sığmazsa önce 1 sonra 0 ara öğe kalır | kısaltılmış anlamsız "E…" yerine katlama; başlık en son kısalır |
| Kayıt kimliği (`record: { code, channel?, label? }`): hap, kanal noktası (`.ek-ch-*`), eş aralıklı kod, kopyala (toast + ✓) | kayıt detayında "hangi kayıt" sorusu başlık satırında cevaplanır |
| (i) 28px hayalet düğme, ikon 18 — A6b yenile (32px) ile aynı dikey eksen | satır tek ritim; panel içeriği/API'si değişmedi (fe-help) |
| Dar kap (< 560px, kap genişliği): iki satır — `[←] ebeveyn` (ya da kök) üstte, H1 + (i) altta, kayıt hapı sığmazsa alta; '…' yok | "son iki öğe + geri oku"; başlık asla kaybolmaz |
| Genişlik ölçümü yalnız genişlik + sonraki kare | ResizeObserver döngü hatası yok |

Yalnız semantik token (ham renk yok → dark hazır). Bağlananlar: Etkin yapılandırma (Yönetim / Entegrasyonlar / <hedef> ayarları / Etkin
yapılandırma + ● kod), Entegrasyon/Motor ayarları (Yönetim / Entegrasyonlar / <hedef>), Ürün düzenle (Katalog / Ürünler / Ürünü Düzenle +
stok kodu; varyantlı üründe kod gösterilmez). **Testler:** `tests/a7-breadcrumb.test.ts` (model, modül ikonu, aria/token/tek bileşen),
`e2e/specs/breadcrumb.spec.ts` (3 viewport). **Görseller:** `docs/a7-review/{before,after}/` (`a-liste`, `b-liste-hakkinda`, `c-derin-rota`,
`d-kayit-detayi`, `e-odak`; 1440 + 390, `-yakin` 2x yakın çekim) — araç `A7_REVIEW=1 A7_REVIEW_WIDTH=1440|390 A7_REVIEW_OUT=<klasör> npx playwright test e2e/specs/a7-review.spec.ts --project=chromium-desktop`.
Görsel tabanlar (`admin-effective-config`, `admin-integration-settings` ve başlık satırı içeren tüm ekranlar) Windows'ta bilinçli yeniden tabanlanmalı.

## 18. A9 — kademeli seçici seviye geçişleri (`cloud/fe-a9`)

Kullanıcı isteği: ürün ekle/güncelle kategori seçiminde bir seviyede seçim yapınca sağdaki seviye uygulamanın diğer geçişleriyle AYNI dilde açılıp kapanmalı. Mantık `src/components/ds/cascadeMotion.ts` (saf, vitest), sunum `EkCascadePicker`.

**Uygulama geneli geçiş envanteri (bu turda tespit edilen, hepsi §4 token'larıyla):**

| Geçiş | Yer | Süre / eğri | Hareket |
|---|---|---|---|
| Filtre paneli, "sayfa hakkında" aç/kapa | `EkCollapse` | base 200 / standard | yükseklik (grid 0fr↔1fr) + opaklık |
| Filtre/menü chevron dönüşü | `EkFilterPanel`, `EkSidebarNav` | base / standard | transform |
| Sekme (çalışma alanı) girişi | `SecureLayout.playTabEnter` | base / enter | opaklık + `distance-sm` Y |
| Bildirim (toast) | `EkToastHost` | base / standard | opaklık + `distance-md` Y |
| Tablo satırı genişleme | `EkDataGrid` | giriş base / enter, çıkış fast / standard | opaklık + `-distance-sm` Y |
| Kabuk tutamağı | `ShellChromeHandle` | base | transform |
| Hover/odak/seçim rengi | `--ek-transition-colors` | fast / enter | renk, gölge, opaklık |
| Tooltip | DS tooltip'leri | Vuetify `fade-transition` | opaklık (ölçek yok) |
| Dialog / drawer / menü | Vuetify varsayılanları | Vuetify | — (A9 kapsamı dışı) |

**Kademeli seçici kararları:**
- Yeni seviye: opaklık + `distance-md` yatay (sağdan) · base / enter — toast ile aynı mesafe, sekme ile aynı süre/eğri. Çıkış: fast / standard (grid satırı gibi).
- Üst seviye değişimi: eski alt seviyeler DERİNDEN SIĞA sırayla söner (adım = fast/3, en fazla 2 adım), yeni seviye kapanışlar bitince açılır; en kötü toplam = 2·fast/3 + base = slow (300). Geri gidişte (alt seviyeler kapanır) ters yön: kapanan seviye geldiği yöne (sağa) çekilir.
- Genişlik: kolonlar sabit 260px; kapanan kolon yama ÖNCESİ toplu ölçülüp yerinde `position:absolute` sabitlenir (sırayla sabitleme kalanları kaydırıyordu). Sağdaki "kuyruk" (ipucu / onay kartı) hareket etmez, yalnız içeriği yeniden anahtarlanır — FLIP denendi, kuyruğun transform'u geçici yatay taşma + yanlış otomatik kaydırma üretti (2. iterasyonda kaldırıldı). Otomatik kaydırma son kolonun `offsetLeft`'ine göre.
- Yaprak seçimi: son seviyenin başlığında "✓ Seçildi" (success-subtle zemin), kuyrukta onay kartı (yol + ad), seçili satırda onay ikonu opaklıkla gelir.
- Dar alan (bileşen genişliği < 640px, ör. 390px telefon): tek panel + "Seviye yolu" breadcrumb'ı (geri düğmesi, bağlantılı üst seviyeler, sağda sayı / "Seçildi"). İleri = sağdan, geri = soldan; eski panel ease-out ile önce söner, yeni panel 2 adım sonra girer (iki yarı saydam liste üst üste binmez).
- İskelet: `loadChildren` + `node.lazy` → kolon 6 sabit iskelet satırı (sonsuz animasyon yok), liste gelince aynı çapraz geçiş (opaklık + `distance-sm`).
- Reduced-motion: sistem ayarı token'ları 0'a indirir (app.css). Uygulama tercihi `<html data-motion="reduced">` (şimdilik ayar ekranı yok; kanca hazır) bileşende `is-static` → geçiş/animasyon yok. Kaydırma da `auto`.
- Klavye: ↑/↓ Home/End (seçim odağı izler), → / Enter klasörü açar ve odağı yeni seviyenin İLK öğesine taşır (açık seviyeye dönüşte seçili öğeye), ← / Backspace üst seviye; tek panelde ← paneli de geri kaydırır. `aria-live="polite"`: "2. seviye: Moda, 3 öğe", "Moda alt kategorileri yükleniyor…", "Seçildi: Moda › Kadın › Tişört".
- Bekçiler: `tests/cascade-motion.test.ts` (plan/sıra/adım ≤ slow, reduced-motion, klavye, duyuru, statik: yalnız transform/opacity, ham ms/px yok), `e2e/specs/a9-cascade-motion.spec.ts` (canlı animasyon özellikleri, kapanış adımları, reduced-motion + data-motion, klavye/odak/aria-live, 390 tek panel). İnceleme kareleri: `docs/a9-review/` (`A9_REVIEW=1 A9_WIDTH=1440|390 npx playwright test e2e/specs/a9-review.spec.ts --project=chromium-desktop`).

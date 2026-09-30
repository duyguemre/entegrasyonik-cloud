# FR2 ortak desenleri (fe-r2a — kabuk sahibi)

Kaynak: `docs/cloud-contracts/FE_FEEDBACK_R2_2026-09-30.md` FR2-SHELL madde 1–9, FR2-HELP 16–17.
Bu dosya FR2 ekran görevlerinin (`cloud/fe-r2b..d`, `cloud/chat-fe`, `cloud/bo-p1`) **okuyacağı** tek standarttır.
Ortak bileşen/token değişiklikleri yalnız `frontend/packages/ui`'dadır (K11); ekranlar burada anlatılanı **kullanır**,
renk/ikon/yükseklik seçmez. Karanlık mod (madde 10) bu işte yok; aşağıdakilerin hepsi yalnız tema token'ı kullanır.

## 1. Form alanı — yükseklik ve etiket (madde 4, 5)

| Karar | Değer | Nerede |
|---|---|---|
| Alan yüksekliği | **36px** = `--ek-control-h-field` (önce 40). Düğme `md` ile aynı → filtre/form satırında alan ve düğme aynı hizada | `packages/ui/src/tokens/scale.ts` `controlHeight.field`, `styles/vuetify-overrides.css` |
| Kapsam | TÜM Vuetify alanları (text, select, autocomplete, combobox, EkDateField, EkSelect) `density="compact"` + `variant="outlined"` varsayılanıyla otomatik; checkbox/switch satırı da 36 | `theme/defaults.ts` (değişmedi) |
| Etiket titremesi | Düzeltildi (tek yerden). Kök neden: Vuetify FLIP geçişi bitince dinlenen etiket `opacity 150ms` CSS geçişiyle **alan içinde görünüp sönüyordu**. `.v-field-label` artık yalnız `transform` geçişi taşır | `vuetify-overrides.css` "FR2-SHELL madde 4" |

**Ekranlar için kural:** alanlara `height`, `min-height`, `density` veya `style="height:…"` vermeyin. Özel bileşen bir alanın
yanında hizalanacaksa `var(--ek-control-h-field)` kullanın (`--ek-control-h-lg` alan için artık KULLANILMAZ).
`label` + `placeholder` birlikte verilebilir (placeholder yalnız odakta, örnek biçim için: "örn. 8690000000001").
Etiketi placeholder'a taşımayın — erişilebilir ad etikettir.

## 2. Kaydet / sil — tek standart (madde 9)

`EkButton` artık `intent` alır; ton + ikon + varsayılan metin birlikte gelir (ikon kayıt defterinden, `icons.ts`):

```vue
<EkButton intent="save" :loading="saving" @click="save" />                 <!-- primary · mdi-content-save-outline · "Kaydet" -->
<EkButton intent="save" :loading="saving" @click="save">Güncelle</EkButton><!-- metin özelleşebilir, biçim aynı -->
<EkButton intent="delete" @click="askDelete" />                            <!-- danger-quiet · çöp kutusu · "Sil" -->
<EkButton intent="delete" confirm @click="remove">Kalıcı olarak sil</EkButton> <!-- YALNIZ onay diyaloğunun son adımı: dolgu kırmızı -->
```

| Yer | Biçim |
|---|---|
| Form/sayfa kaydet | `intent="save"` (primary dolgu). Ekranda tek primary kuralı sürer |
| Form/sayfa sil | `intent="delete"` → **danger-quiet**: yüzey zemin, kırmızı metin/ikon, hover'da `error-subtle`. Her zaman onay diyaloğu açar |
| Onay diyaloğunun son adımı | `intent="delete" confirm` (veya `tone="danger"`) — uygulamada dolgu kırmızının TEK yeri |
| Satır/kart silme | `EkRowActions` / `EkActionButton action="delete"` (zeminsiz kırmızı glif, hover `error-subtle`). Ham `v-btn icon color="error"` (dolgu kırmızı kare dahil) CSS ile aynı görünüme çekildi — yeni kodda kullanmayın |
| Vazgeç / Temizle | `tone="secondary"` (form) / `tone="ghost"` (filtre çubuğu) |

Düğme sırası (sağa yaslı): `[ikincil …] [Vazgeç] [Kaydet]`; sil soldadır (`intent="delete"`), kaydetten uzak.

## 3. Bağlantı / metin eylemi (madde 6)

"Mavi + hover'da altı çizili" kalktı. Tek dil (`packages/ui/src/styles/app.css`):

| Sınıf | Kullanım |
|---|---|
| `.ek-link` | Satır içi bağlantı / metin eylemi ("Yardım merkezinde oku", "Tümünü gör"). Aksiyon rengi, orta ağırlık, çizgi yok; hover'da 1px alt çizgi soldan dolar + renk koyulaşır; odakta DS halkası |
| `.ek-link--quiet` | Liste içi bağlantı (makale listesi, ikincil gezinme): nötr metin, hover'da aksiyon rengi |
| `.ek-link--sm` | Caption boyu |
| `.ek-link__arrow` | Sonda ok ikonu (`<v-icon class="ek-link__arrow" icon="mdi-arrow-right" />`), hover'da 2px kayar |

Sınıfsız ham `<a>` aynı dili otomatik alır. `<button class="ek-link">` da çalışır (kenarlık/zemin sıfırlanır).
Düğme gibi görünmesi gereken eylem için `EkButton tone="ghost"`; `text-decoration: underline` yazmayın.

## 4. Filtre paneli (madde 9)

`EkFilterPanel` API'si değişmedi; görünüm üç katman oldu:
1. **Başlık çubuğu** — beyaz yüzey, 52px; ikon karosu (filtre etkinse aksiyon tonunda), "Filtreler" + sayı hapı,
   etkin filtre çipleri özeti, `#head-actions` (ör. Görünümler), dönen chevron.
2. **Gövde** — `surface-muted` hafif ton; alanlar 36px beyaz kutular, `EkFormGrid` aralıkları.
3. **Eylem çubuğu** — beyaz yüzey + ince üst ayraç; solda `#extra-actions` (yoksa sessiz "Enter ile sorgula" ipucu),
   sağda `Temizle` (ghost) · `Sorgula` (primary).

Ekranlar filtre paneline arka plan/kenarlık/padding vermez; seçim listeleri (kanal/durum) için FR2-CHANNEL kuralları.

## 5. Yenile düğmesi (madde 9)

Tek yer: `EkPageBar` başlık satırının **en sağı** (`refreshable` + `@refresh`). `EkRefreshButton` artık ikincil düğme
dilinde kare kontrol (yüzey + ince kenarlık + kart gölgesi, 36px); başarıda yeşil tonlu kare, hatada kırmızı nokta.
Ekranlar kendi yenile düğmesini çizmez; Alt+R kabuk kısayolu bu düğmeyi tetikler.

## 6. Kabuk kaydırma ve ana sekmeler (madde 3)

Çalışma alanı (`.workplace-area`) artık kaydırma kabıdır (`overflow-y: auto`); belge (window) kaymaz. Sonuç: ana
sekme şeridi (EkWorkspaceTabs) ve başlık satırı her sayfada sabit kalır. Ekranlar için:
- Kendi `position: fixed` / `100vh` hesabınızı yapmayın; yapışkan öğe (`position: sticky; top: 0`) çalışma alanına göre yapışır.
- Sayfaya kaydırmayı `.workplace-area`'da yapın (`el.closest('.workplace-area')?.scrollTo(...)`), `window.scrollTo` değil.
- Eski `.workarea-scroll` (mutlak konumlu iç kaydırıcı) çalışmaya devam eder.

## 7. Menü ve ayarlar (madde 2, 7, 8)

- Sol menü: grup başlığı ile yaprak arasında RENK farkı yok; tek tipografi, hiyerarşi girinti + ince kılavuz çizgisiyle.
- "Eğitim Merkezi" menüden, aramadan ve destek kısayollarından kalktı (Yardım merkezi yerine geçti).
- "Uygulama Ayarları" (`SettingListView`) "Ayarlar" grubundan çıkıp bölümün **üst seviyesine** alındı; hesap menüsündeki
  "Uygulama ayarları" da aynı ekranı açar. İç içe menü kaydı (`parent/Code`) haritada yoksa bileşen koda göre çözülür
  (önce boş sekme / beyaz ekran veriyordu).

## 8. Breadcrumb ve "Sayfa hakkında" (madde 1, 16)

Bkz. `src/components/page/EkPageBar.vue` başlık yorumu. Ekranlar yalnız `EkPageHeader`/`EkPageBar` prop'larını
(`title`, `section`, `trail`, `record`) verir; yardım içeriği `src/help/pageHelp.ts` kaydından gelir.

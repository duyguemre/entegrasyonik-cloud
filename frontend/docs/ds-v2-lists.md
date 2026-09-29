# DS-v2 Aşama 2 — Liste standardı (uygulama notu)

> Dal: `cloud/ds-v2-lists` (taban `cloud/ds-v2-a1`). Hedef görsel: `docs/design-system-review/11-liste.png`.
> Sonuç görselleri: `docs/design-system-review/a2-lists-{siparis,urun,log}-{1440,390}.png`.

## 1. Tek şablon

`src/components/ds/templates/EkListScreen.vue` — tüm veri listeleme ekranlarının TEK şablonu:

```
başlık  : H1 + açıklama ............ [hızlı arama] [#header-actions] [yenile]
filtre  : EkFilterPanel (sayfa İÇİ, katlanır; 4 kolon EkFormGrid; Temizle · Sorgula)
çipler  : EkActiveFilters (son SORGULANAN değerler; tek tıkla kaldır · Tümünü temizle)
kart    : EkBulkBar (seçim → toplu eylemler | ipucu + #toolbar-end)
          EkDataGrid (yapışkan başlık, YALNIZ satırlar kayar, sıralama, seçim, iskelet, boş/hata)
          EkPagerBar (kartın ALTINA SABİT: sol boyut + toplam · orta sayfalar · sağ #pager-trailing)
```

Filtre paneli bileşen örneğinde yaşar (overlay/teleport yok) → bir sekmenin filtresi yalnız o sekmeyi etkiler.
Durumlar ayrıdır: **yükleniyor** (iskelet, başlık korunur) · **hata** (`isRequestError`, "… yüklenemedi" + Tekrar dene) ·
**filtre sonucu boş** (çip varsa; "Filtreleri temizle") · **hiç veri yok** (`emptyTitle`).

### Eklenen / genişletilen DS parçaları (yalnız ekleme, geri uyumlu)

| Parça | Değişiklik |
|---|---|
| `EkDataGrid` | `error`/`errorTitle`/`errorText` + `#error-action`; kolon `hideLabel`, `wrap`, `pin:'end'` (satır eylemleri yatay kaydırmada görünür); `rowClass`; `expandedKeys` + `#expanded` (satır altı açılım); `indeterminateKeys`; hücre slot kapsamına `item`/`index` |
| `EkPagerBar` | mevcut sayfa boyutu seçeneklerde yoksa eklenir (15/13 gibi ekran varsayılanları) |
| `EkBulkBar` (yeni) | seçim çubuğu: "n <nesne> seçildi" · eylemler · Seçimi kaldır; seçim yokken ipucu + uç slot |
| `EkChannelDot` (yeni) | kanal marka rengi nokta (`integrationAccent`) + ad; bilinmeyen kod nötr |
| `EkDateField` (yeni) | tr-TR GG.AA.YYYY gösterimli tarih alanı (sayfa içi küçük takvim) |
| `listStandard.ts` (yeni) | `sortRows` (istemci sıralama, Türkçe) · `isRequestError` (restApi hata nesnesi tespiti) |
| `templates/EkListScreen` (yeni) | yukarıdaki şablon; `search-submit` (Enter ile arayan ekranlar), başlıksız kullanım (sekmeli sayfa içi) |

`EkListPage`, `EkDataTable`, `EkPagination`, `EkFilterBar` API'leri DEĞİŞMEDİ (hâlâ detay diyaloglarında ve kapsam dışı
ekranlarda kullanılıyor; delege etme Aşama 3/diyalog işine bırakıldı).

## 2. Ekran envanteri

Durum: ✅ göçtü · ⏭ kapsam dışı (neden) — ayrıntılı tablo: teslim raporu.

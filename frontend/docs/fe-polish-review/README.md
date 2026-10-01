# fe-polish — birleşik dal denetimi ve bariz düzeltmeler (2026-10-01)

Dal `cloud/fe-polish`, taban `origin/main` @ e846131. Özerklik SINIRLI (kullanıcı: "bariz düzenlemeleri yap ama site kadar
özgür davranma; uç durumlarda onaylı gideriz"). Onay gerektirenler uygulanmadı → `../PROPOSALS_PENDING.md` (P01–P13).

## Birleşim
Sırayla `--no-ff`: fe-r2a → fe-r2b → fe-r2c → fe-r2d → fe-dark. Tek çakışma: `packages/ui/src/components/EkFilterPanel.vue`
(r2a ile fe-dark aynı satır, değer aynı `content-muted`; fe-dark'ın AA yorumu alındı). fe-dark'ın birleştirme notundaki
"fe-r2b koyu rozet seçicisi eşleşmiyor" uyarısı aşağıda (A1) düzeltildi.

## Denetim
`e2e/specs/fe-polish-review.spec.ts` (günlük koşuda atlanır): 34 deep-link ekran + menüden 4 ekran + sipariş detayı + giriş;
light + dark × 1440 + 390; her sayfada axe (WCAG 2.1 AA), yatay taşma, ham i18n anahtarı, "undefined/NaN" taraması.

```
POLISH_REVIEW=1 POLISH_WIDTH=1440 POLISH_OUT=<klasör> npx playwright test e2e/specs/fe-polish-review.spec.ts \
  -c playwright.cloud.config.ts --project=chromium-desktop
```

Makine bulguları: `once-makine-bulgulari.json` / `sonra-makine-bulgulari.json` (155 sayfa).
- **Önce:** axe `aria-tooltip-name` (finans 4, mağaza ayarları 9, sipariş detayı 1 düğüm; light+dark, iki genişlik),
  `scrollable-region-focusable` (çıktılar 390). Taşma 0. Ham anahtar yalnız yönetici yapılandırma anahtarları ve denetim
  günlüğü olay kodları (bilinçli, ikincil satır).
- **Sonra:** axe 0 ihlal (155/155 sayfa, light + dark). Taşma 0.

Görüntüler: `once/` (uygulama öncesi birleşik hal; öneri dosyasının kanıtları dahil), `sonra/` (düzeltilen ekranlar).
Linux görüntüleridir; görsel onay yerelde (Windows) yapılır.

## (A) Uygulanan bariz düzeltmeler
| # | Sınıf | Ne | Görüntü |
|---|---|---|---|
| A1 | Token / dark | Koyu temada kanal rozeti oranları hiç uygulanmıyordu: üretilen kural `.v-theme--dark` idi, Vuetify sınıfı `.v-theme--darkTheme`. Kural `:root[data-theme='dark'], .v-theme--darkTheme`; test sınıf adını `THEME_NAMES`'ten doğrular | `sonra/products-dark-1440.png`, `sonra/orders-dark-1440.png` |
| A2 | Kontrast (dark) | Entegrasyon şeridinde koyu marka rengi (Ideasoft) koyu yüzeyde ~1,7:1 → koyu temada K13 rozet kenarlığı (marka hex'i değişmez) | `once/` ↔ `sonra/integrations-ecommerce-dark-1440.png` |
| A3 | Yazım | "Api Bilgileri" → "API Bilgileri" (7 form), "Api Key" → "API Key", "Satıcı Id" → "Satıcı ID"; yardım metinleri aynı | `sonra/integrations-marketplace-dark-1440.png`, `sonra/integrations-erp-light-1440.png` |
| A4 | i18n | Menü grup başlıkları İngilizce görünüyordu ("MANAGEMENT", "SUPPORTS") → "Kullanıcı Yönetimi", "Destek" (tr/en) | `once/` ↔ `sonra/menu-setting-dark-1440.png` |
| A5 | Terim | Destek tablosu "Statü" → "Durum" (diğer tüm tablolar) | `sonra/menu-ticket-light-1440.png` |
| A6 | Hizalama | Kısa başlıklarda ("Kargo", "ERP", "Finans") (?) düğmesi 4em alt sınır yüzünden uzakta duruyordu → sınır başlık halkasında | `once/` ↔ `sonra/integrations-shipping-light-1440.png` |
| A7 | Kırık düzen (390) | Panoda meta ("Örnek Ticaret · Son güncelleme…") başlığı "Genel …"e kesiyordu → dar kapta meta alt satıra iner | `once/` ↔ `sonra/dashboard-{light,dark}-390.png` |
| A8 | Hizalama / FR2 §2 | Mağaza Ayarları ortalanıyordu (başlık diğer ekranlardan 36px içeride) → sol hiza; "Ayarları Kaydet" `EkButton intent="save"` | `once/` ↔ `sonra/menu-setting-dark-1440.png` |
| A9 | Erişilebilirlik | Kapalı ipuçları DOM'da kalıyordu (finans tür çipi, renk paleti) → `EkTooltip` / `:eager="false"`; `EkTooltip` tetikleyiciye tıklanınca kapanır (detay sayfası açılınca ipucu arkada asılı kalıyordu) | makine bulguları |
| A10 | Erişilebilirlik | Çıktılar şablon kâğıdı (390'da yatay kayar) klavyeyle odaklanır + odak halkası | `sonra/menu-printout-light-390.png` |
| A11 | Kontrast | `content-subtle` metin olarak (light 2,5:1): varyant kaynak etiketi, boş değerler, görsel ölçüsü, fiyat farkı "Ana fiyatla aynı" / indirim yok, backoffice kayıt yolu → `content-muted`. İkon, ayraç, devre dışı kullanımlar bilinçli olarak kaldı | — |
| A12 | Tutarlılık | İşlem kayıtlarında ürün görseli boş kare → ürün listesiyle aynı `ProductThumb` (yer tutucu ikon) | `once/` ↔ `sonra/logs-dark-1440.png` |
| A13 | Taşma (kısmi) | Sipariş/iade "İçerik" kolonunda ürün adı 160px + ipucu. Kalan 30–60px yatay taşma kolon sayısından → P04 | `sonra/orders-dark-1440.png`, `sonra/claims-light-1440.png` |

## Testler
| Kontrol | Sonuç |
|---|---|
| vitest (frontend) | 73 dosya, 1462/1462 |
| backoffice + ui paketi | 30 + 25 |
| vue-tsc | 0 hata (mandal 0) |
| build, build:backoffice | geçti |
| stil / desen / typecheck / console mandalları | OK |
| Playwright ilgili 11 spec (chromium-desktop, `--update-snapshots=missing`) | 111 geçti / 21 kırık — **21'i de birleşik tabanda (değişikliklerim stash'teyken) birebir aynı**; yeni kırık 0 |
| `dark-mode.spec` (axe light + dark: kabuk, menü, pano, giriş) | 10/10 |
| ds-overlays + design-system | 11 geçti / 2 kırık — tabanda aynı 2 |
| Denetim spec'i axe (155 sayfa, light + dark, 1440 + 390) | 0 ihlal |

Tabanda zaten kırık olanlar (bu işin kapsamı dışında, yerel koşuda da bakılmalı): `logs.spec` aktarım sekmesi zaman aşımı
(9) ve "E2E Test Ürünü - Gönderim" çift eşleşme (2), `settings.spec` 4 zaman aşımı, `financial.spec` özet hata/yetki
durumları (3), `dashboard.spec` katalog kanal kartı çift `data-channel` (1), `printouts.spec` CSS beklentisi (1),
`support-tickets.spec` detay (1), `design-system.spec` kademeli seçici çift seçenek (1), `ds-overlays.spec` ürün silme
"Ürünü düzenle" çift eşleşme (1); kalanlar ilk koşuda `-linux.png` tabanı yazılması.

## Notlar
- `K48` (özerklik: SINIRLI) `docs/adr/USER_DECISIONS.md`'de yok; bulut oturumunda `docs/adr/` salt-okunur (CLAUDE.md
  kural 7) olduğu için satır eklenmedi — yerel oturum eklemeli.
- `src/design/tokens/dist/` ve `packages/ui/src/tokens/dist/` bulut kopyasında git-ignored; vitest öncesi `npm run tokens` gerekir.

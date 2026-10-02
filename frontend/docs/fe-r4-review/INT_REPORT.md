# FE-R4 entegrasyon raporu (INT — bitiş işareti)

Dal `cloud/fe-r4-int` · taban `origin/main` = `199628a5` (faz3-arayuz @ b68ae6f7) · sözleşmeler:
`docs/cloud-contracts/FE_FEEDBACK_R4_2026-10-02.md` (K61), `docs/cloud-contracts/BO_FEEDBACK_R2_2026-10-01.md` (K59) + K60.
Değişiklik yalnız `frontend/` (backoffice ve packages dahil); backend, docs/adr, kök dosyalar dokunulmadı.

## 1. Birleşen dallar

| Sıra | Dal | Uç commit | Yöntem | Not |
|---|---|---|---|---|
| 1 | `cloud/fe-r4a` | `414786d3` → rapor ekleri `ff549e29` | `merge --no-ff` | Rapor son hâli (win32 listesi) sonradan ikinci birleştirmeyle alındı |
| 2 | `cloud/fe-r4c` | `fc369a5f` | `merge --no-ff` | |
| 3 | `cloud/fe-r4b` | `16e44bf7` | `merge --no-ff` | |
| 4 | `cloud/fe-r4d` | `e6c82468` → rapor eki `cc13d501` | `merge --no-ff` | Rapor son hâli (kalan kırmızılar) ikinci birleştirmeyle |
| 5 | `cloud/bo-wdg` | `bddd2200` | yama: `git diff origin/main...origin/cloud/bo-wdg -- frontend/backoffice frontend/packages` | bo-r2a + bo-r2b + bo-wdg; `frontend/backoffice` artık `bddd2200` ile birebir |

Bekleme: dört FE raporu + bo-wdg raporu 01:38 UTC'de tamamdı (sınır 7 sa; eksik dal yok).

## 2. Çakışmalar ve çözümleri

- **Dört FE şeridi:** metin çakışması yok; şeritlerin değiştirdiği dosya kümeleri tamamen ayrık (PNG hariç ortak dosya 0).
- **`packages/chat/src/components/ChatPanel.vue`** (Şerit A ↔ bo-wdg): A `appearance="refined"` görsel katmanı (web Otopilot penceresi),
  bo-wdg `wide` + `confirmReset` + `#setup` yuvası (backoffice). İkisi de "isteğe bağlı, varsayılan eski davranış" sözleşmesinde →
  **üç prop birlikte korundu**, kök sınıf `{ 'is-wide': wide, 'ek-chat--refined': appearance === 'refined' }`. `chat.css` ekleri
  otomatik birleşti (A sondaki refined kuralları + bo-wdg geniş yerleşim kuralları). Chat vitest 190/190 (+1 atlanan) yeşil.
- **`frontend/package-lock.json`:** bo-wdg'nin backoffice `echarts`/`vue-echarts` workspace girdisi (4 satır) alındı — backoffice'in
  `npm ci` ile kurulabilmesi için zorunlu; kök dosya değil, `frontend/` içinde.
- **Packages'ta diğer bo-wdg değişiklikleri** (`EkDialogCard`, `app.css` forced-colors odak, `vuetify-overrides.css`) şerit
  eklemeleriyle çakışmadı.

### frontend/src dışına yayılan (UYGULANMAYAN) bo-wdg değişikliği — rapor

`origin/main...origin/cloud/bo-wdg` farkında `backoffice`/`packages` dışında **36 dosya** var (bo-r2b zincirindeki **fe-cfg2**):
`views/secure/definitions/{Brand,Customer,Hashtag,Invoice,Option,Order,Return}DefinitionView.vue` → `LegacyDefinitionEmpty.vue` boş
durumu, `LoginView.vue` destek iletişimi + `components/layout/supportContact.ts`, `e2e/fixtures/publicConfig.ts`,
`public-config.spec.ts`, `fe-cfg2-review.spec.ts`, ürün görsel galerisi (`gallerySrc.ts`, `useImageUploads.ts` …), liste sayfa
boyutu (`ProductListView`, `ChoiceListView`, `HashtagListView`, `InvoiceListView`, `FinancialListView`, `MessageListView` …),
`pattern-baseline.json`, `tests/fe-cfg-rest.test.ts`, `docs/FE_CFG2_REPORT.md`, `docs/PROPOSALS_PENDING.md`.
Brif gereği **uygulanmadı**. Dikkat: fe-cfg2 yedi tanım ekranını boş duruma çevirirken **Şerit D5 aynı yedi ekranın satır
eylemlerini bağladı** → iki yön çelişiyor; FRONTEND_CLEANUP_PLAN D-01 (ekranları kaldırma) ürün sahibi kararıyla birlikte yerelde
seçilmeli. Backoffice testleri/derlemesi bu dosyalar olmadan yeşil (bağımlılık yok).

## 3. Testler (bulut, Linux, Chromium 1194 — Playwright 1.63 için `PLAYWRIGHT_BROWSERS_PATH` yönlendirmesi)

Kurulum notu: `scripts/cloud-setup.sh` `npx playwright install` adımında 403 (cdn.playwright.dev engelli) → `frontend npm ci` elle;
`@rollup/rollup-linux-x64-gnu` (`--no-save`) ve `npm run tokens` (git-ignored `tokens.app.css`/`tokens.static.css`) gerekti.
Taban sınıflaması için `origin/main` ayrı çalışma ağacında aynı komutlar koşuldu.

| Kontrol | INT sonucu | Taban (`199628a5`) | Sınıf |
|---|---|---|---|
| frontend vitest | **1800 geçti / 18 kırmızı** (1818) | 1736 / 18 | 18'in tamamı tabanda birebir (a6b/a7/a8/a10/a12/b4 kabuk, hareket tek kaynak, vuetify tema) |
| `npm run build` (web) | ✓ | ✓ | |
| lint (eslint) | 0 hata | | |
| pattern / no-console / contract-paths | OK / OK / OK | OK | |
| typecheck-ratchet | 2 hata | aynı 2 | taban (`BrandIntegrationSelectBoxComponent:12`, `BrandListComponent:41`) |
| style-ratchet | 14 satır | aynı 14 | taban (`EkSidebarNav`, `EkWorkspaceTabs`, `EkPageBar`, `DefinitionValueChip`, `ProductVariantListComponent`, `ChoiceListView`) |
| backoffice vitest | **35 dosya / 368 geçti** | | |
| `build:backoffice` | ✓ | | |
| `@entegrasyonik/ui` vitest | 6 / **43 geçti** | | |
| `@entegrasyonik/chat` vitest | 14 / **190 geçti, 1 atlandı** | | |
| **frontend Playwright tam** (4 proje, 3393 test, `--update-snapshots=missing`) | 1. koşu: 1870 geçti · 242 kırmızı · 1281 atlandı (1,2 sa); kırmızıların yeniden koşusu: **220 geçti · 22 kırmızı** | aynı 8 spec tabanda: 21 kırmızı (birebir) | 220 = ilk kez yazılan `*-linux.png`; 22 kırmızının tamamı taban (aşağıda) |
| **backoffice Playwright tam** (3 proje, 561 test) | 379 geçti · 10 kırmızı · 172 atlandı; yeniden: 4 geçti · 6 kırmızı; `smoke.spec` tek başına **48/48** | | 6 = `smoke.spec:73` tam sayfa yüksekliği ±3 px (saate bağlı örnek veri — bo-wdg raporundaki aynı sınıf), yeniden koşuda yeşil |

**FE e2e taban kırmızıları (22) ve bu turdaki durum:**

| Test | Proje | Sınıf | Bu turda |
|---|---|---|---|
| `dark-mode.spec:102` axe `aria-tooltip-name: #tour-homepage-smartsearch` | 4 proje × açık/koyu = 8 | taban, akıllı arama | **DÜZELTİLDİ** (bkz. §4-1) → 8/8 yeşil |
| `navigation.spec:161` akıllı arama → sipariş sekmesi | tablet, masaüstü | taban, eskimiş seçici (`placeholder="Akıllı arama"` artık "Ara…") | **DÜZELTİLDİ** (combobox erişilebilir adı) → yeşil |
| `design-system.spec:29` axe `color-contrast #ek-side-v-*` | 4 | taban, `EkSidebarNav` (yerel cila FE-LOCAL-1002) | açık — kabuk sahibi / yerel |
| `category-definitions.spec:67` "Bir kategori seçin" başlığı | mobil, tablet | taban | açık |
| `financial.spec:447` başlık araçları (P03) | 3 | taban | açık |
| `admin-characterization.spec:50` "Listeyi yenile" düğmesi | masaüstü | taban | açık |
| `logs-characterization.spec:79` strict mode çift "Ürün adı" kutusu | masaüstü | taban | açık |
| `logs.spec:84` mobil görsel taban | mobil | ortam (linux taban yazımı tekrarı) | — |

Bu turun değişikliklerinden sonra etkilenen spec'ler (settings, fe-r4c, dashboard, shell, shell-v2, shell-dsv2, dark-mode,
design-system, navigation, fe-r4a-shell, otopilot, account-security; 4 proje): son koşu **159 geçti / 0 kırmızı** (fe-r4a-shell,
settings, fe-r4c, shell, otopilot) + **100 geçti / 2 kırmızı → 0** (dark-mode, dashboard, navigation; 2 kırmızı navigation:161,
sonra düzeltildi). Not: backoffice tam koşusuyla eşzamanlı ilk etki koşusunda dashboard mobil 4 test yük nedeniyle zaman aşımına
düştü; tek başına koşuda yeşil. vitest/ratchet sonuçları düzeltmelerden sonra tabanla birebir.

## 4. Premium bütünlük eleştiri turu (tek tur)

Kareler: `frontend/docs/fe-r4-review/int/once/` (birleşik hâl, düzeltmeden önce) ↔ `int/sonra/`; üst bar/profil/bildirim/arama/
Otopilot (`01`–`11`, Şerit A inceleme betiği), dashboard + ayarlar (`anasayfa-*`, `ayarlar-*`, Şerit C betiği), ürün formu
(`ekle-*`, Şerit B betiği) × 1440 açık + 1440 koyu + 390.

Genel değerlendirme: üst bar (yumuşak ton), profil, bildirim penceresi, Otopilot ve "Bugün sırada" aynı ikon kapsülünü
(`EkIconTile`), aynı ton token'larını, mikro etiketleri ve kart dilini kullanıyor; şeritler arası renk/hareket sapması bulunmadı.
Bulunan tutarsızlıklar ve düzeltmeler:

1. **Akıllı arama — ipucu sonuç panelini örtüyor + tur çapası yanlış öğede** (Şerit A × kabuk; tabanda da var). "Ara Ctrl+K"
   ipucu arama açıkken de beliriyor ve sonuç panelinin "OTOPİLOT" başlığının üstüne biniyordu (`once/07-*`). Kök: `ShellSearch`
   kökü `v-tooltip` olduğundan `ApplicationBar`'ın verdiği `id="tour-homepage-smartsearch"` ipucu katmanına düşüyordu → axe
   `aria-tooltip-name` (8 e2e kırmızısı) ve uygulama turunun hedefi görünmez katman. Düzeltme: çapa `EkSmartSearch`'ün kendisinde,
   ipucu katmanına erişilebilir ad, ipucu arama kullanılırken (odak/sonuçlar/bağlam menüsü) açılmaz. (`ApplicationBar`'ın
   `@focusout` dinleyicisi de aynı nedenle ipucu katmanına bağlı ve hiç tetiklenmiyor — davranış değişmesin diye DOKUNULMADI;
   mobil `searchPeek` kapanışı için ayrıca değerlendirilmeli.)
2. **Dashboard + Otopilot yan paneli** (Şerit C × Şerit A). ≥1280'de panel iş alanını ~790 px'e itiyor; ızgaralar görünüm alanı
   kırılımına bağlı olduğundan 4 KPI kartı dar sütunlara sıkışıyor, "₺349,90" kart kenarını aşıyordu, "Bugün sırada" iki kolonu
   ve alt kart ızgarası 2/3–1/3 kalıyordu (`once/09-otopilot-tablo-1440-*`). Düzeltme: `.dash-scroll` adlı kap (`ek-dash`) +
   **ek** kap sorguları (KPI ≤ 950 px → 2 sütun; "Bugün sırada" ve kart satırları ≤ 850 px → tek kolon). Görünüm kırılımları
   aynen duruyor; panel kapalıyken hiçbir genişlikte görünüm değişmez (win32 tabanı etkilenmez).
3. **Ayarlar bölüm kartı başlığı ↔ ürün formu adım kartı** (Şerit C × Şerit B). Ayarlar yerel 44 px ikon kutusu + soluk zemin
   bandı + gövde boyu açıklama kullanıyordu; ürün formu (ve bildirim/dashboard) ortak `EkIconTile md` + bantsız başlık + altyazı.
   Düzeltme: ayarlar başlığı aynı dile çekildi (`EkIconTile md`, aynı iç boşluk/aralık, açıklama altyazı rolü, bant yok).

Bilinçli bırakılanlar: ayarların "kaydet çubuğu" (altta) ile ürün formunun "kayıt çubuğu" (üstte, yapışkan) farklı konumda —
biri serbest form, diğeri adımlı sihirbaz; ikisi de aynı durum kapsülü/düğme dilini kullanıyor. Ayarlar alt bölüm başlığı (mikro
etiket) ile ürün formu alt bölüm başlığı (ikon + cümle düzeni) farklı; ürün formu R2c sözleşmesinde, değiştirmek B kapsamını aşar
→ öneri. Koyu temada çalışma alanı inceleme karelerinde sol menü etkin öğe metni okunaksız görünüyor (`01-ust-bar-1440-koyu`);
tabanda da aynı ve karelerin `ek-theme` yerel depolama + açık `prefers-color-scheme` karışımından kaynaklanıyor (dark-mode axe
testleri iki temada 0) — yerelde gözle teyit edilmeli.

## 5. Yerelde yenilenecek win32 tabanları (Windows, `npx playwright test <spec> --update-snapshots`, gözle onay)

Bu turun düzeltmeleri win32 tabanı değiştirmez (dashboard kap sorguları yalnız panel açıkken devreye girer; ayarların taban
görüntüsü yok; ipucu yalnız hover'da). Liste şerit raporlarının birleşimidir:

- **Şerit A — üst bar tonu + profil (kabuk içeren her ekran), 122 dosya:** `account-security`, `admin-clients-list`,
  `admin-effective-config`, `admin-engine-settings`, `admin-integration-compliance{,-detail,-empty}`,
  `admin-integration-config-list`, `admin-integration-settings`, `admin-system-{export-detail,top}`, `admin-tickets-list`,
  `audit-log`, `category-definitions`, `claims-list`, `customers-list`, `dashboard`, `integration-health`,
  `integration-{ECommerce,Erp,Marketplace,Shipping,EInvoice}View`, `invoices-list`, `logs-export-list`, `logs-import-list`,
  `messages-list`, `orders-list`, `privacy-data`, `privacy-deletion-verify`, `batch-action-menu`,
  `variant-{batch-prices,generator,platform-prices}`, `product-variant-list`, `product-variants`, `shell-dashboard`,
  `stock-health`, `stock-policy`, `subscription` (her biri desktop + mobile + tablet) ve `claims-detail`, `logs-import-detail`
  (yalnız desktop). Ayrıntı: `a/REPORT.md` §"Değişen win32".
- **Şerit B — ürün formu, 33 dosya** (A ile ortak olanlar hariç ek): `product-definition-parts.spec.ts-snapshots/`
  `product-details-*`, `product-images-*`, `product-single-variant-*`; `product-variant-dialogs.spec.ts-snapshots/`
  `variant-attributes-*`, `variant-batch-attributes-*`, `variant-images-*`, `variant-search-*` (A'daki `variant-batch-prices`,
  `variant-generator`, `variant-platform-prices`, `product-variants` iki şeridin birleşik hâliyle bir kez yenilenir).
- **Şerit C — dashboard:** `dashboard-chromium-{desktop,mobile,tablet}-win32.png`, `shell-dashboard-*` (A ile ortak; birleşik hâl
  bir kez). `dashboard-chromium-desktop-dark-win32.png` depoda hiç yok (tabanda da) — yerelde üretilmeli.
- **Şerit D:** yok. **Backoffice (bo-wdg):** win32 tabanı değişikliği bildirilmedi.
- `otopilot-harness` `otopilot-empty-{light,dark}`: win32 tabanı yok; A raporu tezgâh oynaklığı not ediyor — gerekmedikçe üretmeyin.

## 6. Kullanıcının gözle bakacağı rotalar

**Web uygulaması** (`cd frontend && npm run dev` → http://localhost:3020):
- http://localhost:3020/ — üst bar (açılmış ton), profil düğmesi + hesap menüsü, zil → bildirim penceresi, "Bugün sırada", KPI ve
  kart ızgarası (1440/1280/1024/768/390). **Otopilot'u açın (Ctrl+J)** → dashboard panel yanında tek kolona akar (bu tur).
- Ctrl+K → akıllı arama; "ay" yazın, sonuçta sağ tık / Shift+F10 → bağlam menüsü; ipucu artık paneli örtmez (bu tur).
- http://localhost:3020/otopilot — tam sayfa Otopilot; mock tezgâh http://localhost:3020/dev/otopilot?speed=0
- http://localhost:3020/notifications — bildirim merkezi.
- Ayarlar › Mağaza ayarları (sol menü / profil menüsü "Uygulama ayarları") — bölüm kartı başlığı (bu tur), kaydet çubuğu,
  geçersiz e-posta/TCKN ile Kaydet, Ctrl+S, sayfayı yenileme onayı.
- Ürün kataloğu › Ürünler → **Yeni ürün** (adım şeridi, kayıt çubuğu, "Eksikleri göster"); bir ürünün **Ürünü düzenle**;
  varyantlı üründe Varyant Bilgileri (rowspan aynen).
- Fiyat kuralları ekranı (tablet genişliğinde Tab ile ızgara kaydırma bölgesi), tanım ekranları (Marka/Müşteri/… tanımları:
  satır Düzenle/Sil diyalogları — §2'deki fe-cfg2 çelişkisine bakın).
- Koyu tema: hesap menüsü → Görünüm → Koyu.

**Backoffice** (`cd frontend && npm run dev:backoffice` → http://localhost:3100): http://localhost:3100/ (Genel bakış),
`/denetim` (1024–1280 px), `/loglar` (390 px çekmece, Görünümler → sil → Geri al), `/motor?sekme=basarisiz&gorunum=ayrinti`,
`/motor?sekme=durum`, `/altyapi/onbellek`, `/abonelikler/103?sekme=eylemler`, `/musteriler/102?sekme=kullanim`,
`/sistem/bayraklar` (taslak at + ayrılma uyarısı), `/sistem/rekabet`, `/sistem/duyurular/yeni`, `/otopilot`
(`window.__BO_CHAT_MOCK__={config:'enabled',speed:1}` + yenile → geniş sohbet, "Yeni sohbet" onayı), `/giris` (kod `000000`).

## 7. Açık noktalar / öneriler

- Tabanda kırmızı kalanlar (§3 tablo, "açık"): design-system axe (EkSidebarNav kontrastı), 18 vitest kabuk sözleşme testi,
  stil/tip mandalları — yerel FE-LOCAL-1002 cilası testleri/tabanları güncellememiş görünüyor; yerelde ele alınmalı.
- fe-cfg2 ↔ D5 tanım ekranları çelişkisi (§2) — ürün sahibi kararı.
- `ApplicationBar` `@focusout="search-blur"` ölü bağ (§4-1) — mobil arama "peek" kapanışı istenen davranışsa bağlanmalı.
- Şerit önerileri (onay bekler): `EkDataGrid focusableScroll` varsayılanı (D), sekme kapatırken kirli form koruması (C),
  `index.html` `theme-color` navy-700 (A), P-WDG-1…8 (bo-wdg).

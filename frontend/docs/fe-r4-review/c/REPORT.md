# FE R4 — Şerit C raporu (C1 ayarlar · C2 "Bugün sırada" · C3 dashboard ızgarası) — BİTTİ

Dal: `cloud/fe-r4c` · Taban: `origin/main` (= faz3-arayuz @ b68ae6f7) · Sözleşme: `docs/cloud-contracts/FE_FEEDBACK_R4_2026-10-02.md` Şerit C (K61).
Görseller: `once/` (taban) ve `sonra/` — 1440 açık + koyu, 390; dashboard ayrıca 1440/1280/1024/768/390 tam yükseklik (`*-tam.png`). Her görüntünün axe sonucu `*/axe/`.

## Yapılanlar

### C1 — Uygulama ayarları (`views/secure/SettingListView.vue`) baştan yeniden tasarım
- **Düzen:** sol kolon = arama + bölüm gezinmesi (kart içinde; etkin bölüm sol menüyle aynı dil: seçili zemin + 3 px gösterge) + **yapışkan canlı önizleme** (`components/settings/SettingsStorePreview.vue` — her bölümden görünür; < 960 px'te kimlik bölümünün sonunda, tek kopya). Sağ = **bölüm başına tek kart**: başlık bandı (kapsül + başlık + açıklama + "n değişiklik" rozeti) ve `fieldset` alt bölümler (mikro başlık).
- **Alanlar:** `SettingRow` yeniden yazıldı — etiket üstte, açıklama altta, **2 kolonlu ızgara** (geniş alanlar tam satır; < 768 px tek kolon). Eski "solda etiket / sağda alan, alan başına tam satır" düzenine göre aynı alanlar belirgin biçimde daha kısa sayfada (bkz. `once/` ↔ `sonra/ayarlar-fatura-*`). Gün seçimi kutucuk dizisi (işaretli gün aksiyon tonunda), renk paleti kuyu içinde + damlalık düğmesi, logo yükleme alanı durum başlığıyla ("Henüz logo yok / Logo yüklü").
- **Bölüm gezinmesi durumları:** arama eşleşme sayısı > **hata sayısı** (kırmızı rozet, ekran okuyucuya "n alan düzeltilmeli") > değişiklik noktası.
- **Kaydet / vazgeç durumları** (yapışık çubuk, `aria-live`): temiz · kaydedildi (saat) · değişiklik var (bölümler + alan sayısı) · **n alan düzeltilmeli** (+ "İlk hataya git") · **Kaydediliyor…** (Kaydet düğmesi yükleniyor). Ctrl/⌘+S kısayolu (yalnız ekran görünürken; arka plandaki sekmede başka ekranın kısayolunu çalmaz). Mobilde temizken tek satır.
- **Doğrulama** (`components/settings/settingsValidation.ts`, saf + 5 vitest): yalnız biçim, boş alan her zaman geçerli — e-posta, telefon (10–13 rakam), T.C. Kimlik No (11 hane + denetim haneleri), Vergi No (10/11 hane), MERSIS (16 hane), sayı alanları (≥ 0, tam sayı/üst sınır), renk kodu, logo bağlantısı (yalnız URL modunda), en az bir çalışma günü. Hata alan odaktan çıkınca ya da kaydetmede görünür (yazarken erken kırmızı yok); metin "ne oldu — ne yapmalı" biçiminde, alanın altında (`aria-describedby`).
- **Kirli form uyarısı:** değişiklik varken sayfa yenileme/kapama tarayıcı onayı ister.
- **Korunan davranış/API:** `getSettings({})`, `updateSettings({ settings })` tüm nesne, başarıda yeniden yükleme + bildirim, `_id` yoksa hata bildirimi, logo yükleme + `?t=`, varsayılanlar, kurumsal alanların yalnız `invoice.type === 1` iken görünmesi, arama, Vazgeç. `settings.spec.ts` (16 karakterizasyon testi) DEĞİŞMEDEN yeşil.

### C2 — "Bugün sırada" (`components/dashboard/DashboardNextActions.vue`)
- Başlıkta **öncelik sayacı** (Acil · Bugün · Fırsat buldukça; yalnız sıfırdan büyükler, bölümlü tek kapsül).
- **Sıradaki iş** kutusu: "SIRADAKİ İŞ · 1 / n", öncelik çipi, ikon kapsülü, sayılı başlık, neden cümlesi, tek birincil eylem (altta sabit); menüde ekranı yoksa yetki açıklaması.
- **Sipariş akışı sayacı** (Kargo · Fatura · İade · Soru — `getOrderDashboardInsights.pending`; sıfırsa onay işareti).
- **Sonra** listesi önceliğe göre gruplu (grup başlığında sayı), satırda eylem adı + ok (açılamayanda "Yalnız bilgi"), en fazla 5 satır + "n iş daha".
- Alt şerit: "Bekleyen yok" onay çipleri. Boş durum (başarı kutusu), hata (`EkErrorState` + Tekrar dene), yükleme iskeleti korunur.
- Veri: yalnız backend yanıtları (`nextActions.ts` değişmedi; uydurma sayı yok).

### C3 — Dashboard alt kart ızgarası (`views/secure/DashboardView.vue`)
- Kök neden: 8/4 iki **bağımsız kolon** (`align-items: start`) — sağ kolon (durum + sağlık) uzun olduğu için "Son 7 gün" ve "Son işlemler" altında ~400 px boşluk kalıyordu (`once/anasayfa-light-1440-tam.png`).
- Yeni ızgara **satır tabanlı, `stretch`**: aynı satırdaki kartların alt kenarı hizalı; yükseklikleri yakın kartlar eşlendi: **Son 7 gün ↔ Sipariş durumları** (grafik kalan yüksekliği doldurur, `autoresize`), **Stok uyarıları ↔ Entegrasyon sağlığı**, **Katalog ↔ Son işlemler** (eşit kolonlar; tek kart kalırsa tam genişlik). Sağlık kartı yoksa (403) stok ↔ katalog eşlenir; stok da yoksa kalanlar eşit kolonlarda akar. < 1100 px tek kolon.
- Kanıt: `sonra/anasayfa-light-{1440,1280,1024,768,390}-tam.png` + e2e `fe-r4c.spec.ts` "C3: aynı satırdaki kartların alt kenarı hizalı" (±1 px).
- Bölüm etiketleri: "SİPARİŞ DURUMU", "STOK, KANALLAR VE KATALOG" ("İŞLETME PERFORMANSI" kabuk-hazır çapası korunur).

## Kararlar
1. **Geçersiz alan varken kayıt isteği gönderilmez** (sözleşme "doğrulama mesajları" istedi). Geçerli veride gövde birebir aynı; karakterizasyon verileri (settings.spec) geçerli sayılır. Doğrulama yalnız biçimdir, zorunlu alan yoktur (API'de yok).
2. **Kirli form uyarısı `main.ts`'e 6 satır + `composables/useUnsavedChanges.ts`:** `main.ts`'teki `window.onbeforeunload` bileşen dinleyicisinden ÖNCE çalışıp uygulamayı unmount ediyordu (dinleyici hiç çağrılmıyordu — e2e ile kanıtlandı). Artık önce kayda danışır; değişiklik varsa onay ister ve **unmount etmez** (kullanıcı "Kal" derse veri kaybolmaz). Sahiplik listesinde olmayan tek dosya bu; değişiklik eklemeli.
3. Önizlemedeki marka rengi kullanıcı verisi: `--sl-brand` özel özelliği `.sl-layout` üzerinde tek bağlamayla verilir (stil mandalı: yeni satır içi stil yok).
4. Paylaşılan `@entegrasyonik/ui` / token dosyalarına dokunulmadı.

## Öz-eleştiri turları
- **Tur 1 (dashboard):** ilk C3 eşlemesi (stok ↔ sağlık+katalog kolonu) alt kenarları hizaladı ama stok kartı içinde ~230 px boşluk bıraktı → eşleme stok↔sağlık, katalog↔son işlemler olarak değiştirildi. İlk C2'de sıradaki iş kutusu listeyle eşitlenince ortası boş kaldı → backend sayılarından sipariş akışı sayacı eklendi, liste sıkılaştırıldı.
- **Tur 2 (ayarlar):** mağaza adı sayacı boş satır bırakıyordu (kaldırıldı); gezinme ikonları kapsüle göre büyüktü; mobilde temiz kaydetme çubuğu iki satırdı (tek satıra indi); yatay bölüm şeridinde seçilen öğe kırpılıyordu (görünüme kaydırılır). Desen mandalı: ham sayı biçimi → `formatNumber`, ham spinner → nokta göstergesi.

## İnceleme rotaları (`npm run dev` → http://localhost:3020)
- http://localhost:3020/ — Genel bakış: "Bugün sırada" + kart ızgarası (1440/1280/1024/768/390 ve koyu tema).
- http://localhost:3020/ → Ayarlar › **Mağaza ayarları** (sol menü / üst bar profil menüsü "Uygulama ayarları"): 4 bölüm, bir alanı değiştirip kaydetme çubuğu, geçersiz e-posta/TCKN ile Kaydet (ilk hataya gider), Ctrl+S, sayfayı yenilemeyi deneyin (onay).

## Testler (bulut, Linux Chromium 1194)
| Kontrol | Sonuç |
|---|---|
| vitest | 1741 geçti / 18 kırmızı — **18'i de tabanda kırmızı** (kabuk/EkPageBar/A10/A12/tema; bu dal yenisini eklemedi). Yeni: `fe-r4c-settings-validation` 5/5, `fe-r3b-next-actions` yeşil |
| `npm run build` | ✓ |
| typecheck-ratchet | 2 hata — tabanda da aynı 2 (`BrandIntegrationSelectBoxComponent`, `BrandListComponent`); yeni yok |
| pattern-ratchet | OK |
| style-ratchet | bu dalın dosyalarında regresyon yok; kalan kırmızılar tabanda (`EkWorkspaceTabs`, `EkPageBar`, `DefinitionValueChip` …) |
| no-console-ratchet, contract-paths | OK |
| Playwright (tüm projeler: mobile/tablet/desktop/desktop-dark) `settings` + `dashboard` + `fe-r4c` | **100 geçti**, 6 atlandı (C3 hizalama yalnız masaüstü), 4 = eksik `*-linux.png` tabanı yazıldı (ikinci koşuda 4/4 geçti; linux PNG'ler commit'lenmedi) |
| Son tur (mobile + desktop, `settings` + `fe-r4c`, `--repeat-each=2`) | **86/86** — bir önceki tekli koşuda `settings.spec` "değişiklik durumu" bir kez zaman aşımına düştü (desktop, 4 worker yükü); tek başına 3/3 ve tekrarlı koşuda temiz — yerel koşuda izlenmeli |
| `shell.spec` (desktop) | 5 geçti + dashboard görüntü tabanı (aynı nedenle) |
| axe (inceleme görüntüleri, 20 kare) | ayarlar/dashboard içeriğinde **0**; tek bulgu `#tour-homepage-smartsearch` `aria-tooltip-name` (üst bar akıllı arama — kabuk/Şerit A, `once/`'da da var) |

Yeni e2e: `e2e/specs/fe-r4c.spec.ts` (6) — doğrulama (istek gitmez, ilk hataya odak, bölüm hata rozeti, düzeltince aynı gövde), odaktan çıkınca hata + gün seçimi, kirli form `beforeunload` + uygulamanın ayakta kalması, Ctrl+S, C2 sayaçları, C3 hizalama. İnceleme: `e2e/specs/fe-r4c-review.spec.ts` (`R4C_REVIEW=1`, günlük koşuda atlanır).

## Yerelde yenilenecek win32 tabanları (görsel onay)
- `e2e/specs/dashboard.spec.ts-snapshots/dashboard-chromium-{desktop,mobile,tablet}-win32.png` (C2 + C3) — ayrıca `dashboard-chromium-desktop-dark-win32.png` depoda hiç yok (koyu proje bu spec'i koşuyor; tabanda da eksikti).
- `e2e/specs/shell.spec.ts-snapshots/shell-dashboard-chromium-{desktop,mobile,tablet}-win32.png` (dashboard görünür).
- Ayarlar ekranının ekran görüntüsü tabanı yok (değişen win32 yok).

## Öneriler (kapsam dışı, onay gerekir)
- **Çalışma alanı sekmesini kapatırken kirli form koruması:** `stores/workspace.ts` `closeTab` kabuk koduna `hasUnsavedChanges()` danışması + onay diyaloğu (Şerit A / kabuk sahibi). Kayıt (`useUnsavedChanges`) hazır; diğer formlar (bildirim tercihleri, stok politikası) da kaydolabilir.
- `main.ts` `onbeforeunload` içindeki koşulsuz `app.unmount()` tasarımı gözden geçirilmeli (sayfa kapanırken gereksiz).

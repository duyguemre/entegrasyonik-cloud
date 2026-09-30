# FR2-DARK (madde 10) — karanlık mod inceleme

Dal `cloud/fe-dark`, taban `origin/cloud/fe-r2a` @ 05af113 (merge). Görüntüler: `<ekran>-<light|dark>-<1440|390>.png`
(16 ekran × 2 tema × 2 genişlik). Üretim:

```
FE_DARK_REVIEW=1 FE_DARK_REVIEW_WIDTH=1440 npx playwright test e2e/specs/fe-dark-review.spec.ts --project=chromium-desktop
FE_DARK_REVIEW=1 FE_DARK_REVIEW_WIDTH=390  npx playwright test e2e/specs/fe-dark-review.spec.ts --project=chromium-desktop
```

Görsel onay yerelde (Windows) yapılır; dark tabanlar `*-chromium-desktop-dark-win32.png` yerelde üretilir.

## Ne yapıldı
- **Kapı açıldı, tek kaynak (K11/K12):** `@entegrasyonik/ui/theme` → `createThemeController(key)` (tercih `system|light|dark`,
  `?theme=`, sistem değişimi, Vuetify + `<html data-theme>`). Uygulama (`ek-theme`) ve backoffice (`ek-bo-theme`) aynı fabrika.
- **Titreme yok:** `public/theme-boot.js` (paket kaynağıyla bayt bayt aynı) `<head>`'de eşzamanlı; Vuetify başlangıç teması aynı
  çözümden. Spec, `<body>` eklendiği anda `data-theme`'in zaten koyu olduğunu doğrular.
- **Seçici:** `EkThemeSwitch` (Açık / Koyu / Sistem, ARIA radio grubu, ok tuşları) hesap menüsünde; menü içerik tıklamasıyla kapanmaz.
- **Grafikler:** `entegrasyonik(-dark)` ve `entegrasyonik-app(-dark)` ECharts temaları; tema adı ve seri renkleri tepkisel.
  Koyu kategorik palet koyu yüzeyde ≥3:1.
- **Sabit renkler:** hex/rgb zaten 0'dı. Adlı renkler (CSS `black/white/red`, `text-white`, `color="red"`, JS `style.color="black"`)
  token'a taşındı; stil mandalına `namedColor` kategorisi eklendi (0'dan kilitli).
- **Koyu zemin düzeltmeleri:** giriş marka paneli kromda (`--ek-app-login-*`), mağaza logosu açık plaka (`--ek-app-media-plate`),
  kanal işareti açık iç halka (marka hex'i değişmez, K13), avatar / "Enter ile sorgula" / marka karosu kontrastı, iç progressbar AT'den gizli,
  tema geçiş kuralı (`ek-theme-switching`) pakete taşındı (BO kopyası kalktı).

## Token eksikleri (rapor)
- `content-subtle` metin rengi olarak 39 yerde kullanılıyor: light 2,52:1, dark 3,97:1 (AA altı). Axe'nin yakaladığı yerler düzeltildi;
  ikon/dekoratif kullanımlar serbest. Metin kullanımları ekran başına `content-muted`'a taşınmalı.
- Kanal markası için ayrı dark tonu yok (K13 bilinçli); görünürlük halka ile sağlanıyor.
- `<meta name="theme-color">` güncellenmiyor (üst bar iki temada lacivert → etkisi yok).

## Kalan sabit renkler
- Veri kaynaklı (kullanıcı rengi, bilinçli): etiket/hashtag renkleri, mağaza marka rengi önizlemesi (`SettingListView`,
  `HashtagListView`, `ProductListView` hashtag noktası), `HashtagSelectBoxComponent`/`HashtagListView` kontrast hesabının `'white'/'black'` dönüşü.
- `views/secure/productDefinitions/TEST.vue` (`/src/assets/logo.png`) — geliştirici sayfası, dokunulmadı.

## Paralel dallar (birleştirmede yerelde düzeltilecek)
- **fe-r2b:** koyu kanal rozeti kuralı `.v-theme--dark` seçicisine bağlı; Vuetify tema adı `darkTheme` → sınıf `.v-theme--darkTheme`.
  Kural hiç eşleşmez → `[data-theme='dark']` kullanılmalı. Ideasoft seçili kutu çerçevesi (`#391EE0`) koyu zeminde düşük kontrast.
  `ProductListView`'de 2 satır token değişimi (fe-r2b de dosyayı değiştiriyor; komşu satır değil).
- **fe-r2c / fe-r2d:** tabanlarında yeni adlı/hex renk yok (mandal temiz); birleştirmede `check-style-baseline.js` (namedColor) koşulmalı.
- **fe-r2a:** `docs/fe-r2a-review/sonra/` henüz commit'li değil (yalnız `once/` + README).

## Testler (bu tabanda)
| Kontrol | Sonuç |
|---|---|
| vitest (frontend) | 69 dosya, 1411/1411 |
| backoffice + ui paketi | 30 + 25 |
| vue-tsc (uygulama + backoffice) | 0 hata |
| build, build:backoffice | geçti |
| stil / desen / typecheck / console mandalları | OK |
| `dark-mode.spec` (seçici, kalıcılık, ilk kare, sistem, klavye, axe light+dark: kabuk+menü, pano, giriş) | 10/10 |
| DS vitrini axe (light + dark) | 0 ihlal |
| `chromium-desktop-dark` projesi (8 spec) | 56 geçti, 5 kırık — beşi de light'ta aynı şekilde kırık (taban: kademeli seçici, CAPTCHA, `?` kısayol Esc, çalışma alanı anahtarı, sol menü tooltip) |

# @entegrasyonik/ui — ortak tasarım sistemi (TEK MERKEZ)

ADR-0026 Karar 1–3. Müşteri uygulaması (`frontend/src`) ve backoffice (`frontend/backoffice`) token, tema ve DS bileşenlerini
YALNIZ buradan alır. Derleme adımı yok; kaynak (TS/SFC) olarak tüketilir. **Ortak bileşen/token değişikliği yalnız burada yapılır;
uygulamaya özel kopya açılmaz** (bekçiler: `tests/no-app-imports.test.ts`, `frontend/tests/ui-package-single-source.test.ts`).

| Giriş | İçerik |
|---|---|
| `@entegrasyonik/ui/tokens` | Token kaydı (palet, semantik, workspace, rol, kontrast, ölçek, kanal adı/rengi) — `src/tokens` |
| `@entegrasyonik/ui/theme` | `createEkVuetify` (light + dark AYNI token seti), `lightTheme`/`darkTheme`, `vuetifyDefaults`, tema tercihi (`system/light/dark`, `?theme=`), `applyThemeToDocument`, `theme-boot.js` |
| `@entegrasyonik/ui/components` | 66 DS bileşeni (`Ek*`) + tipleri. Saf TS yardımcıları .vue yüklemeden: `@entegrasyonik/ui/components/<ad>` (listStandard, pageTrail, refreshState, filterHeader, selectOptions, cascadeMotion, statusTone) |
| `@entegrasyonik/ui/styles` | Vuetify + MDI + token CSS + türev değişkenler + override + Inter (kademe sırası sabit) |
| `@entegrasyonik/ui/icons`, `/shortcuts`, `/format`, `/composables/useToast`, `/composables/useTabScope` | DS seviyesinde saf TS modülleri |

## Bağımlılık yönü
Paket `@/` (müşteri uygulaması), backoffice, `pinia`, `vue-router`, `vue-i18n` import ETMEZ ve kendi klasörünün dışına göreli
yolla çıkmaz. Uygulama durumuna (store/router/i18n/yardım sistemi) bağlı sayfa bileşenleri
(`EkPageBar`, `EkPageHeader`, `EkHelpHint`, `EkSavedViews` ve sayfa şablonları) `frontend/src/components/page/` altında kalır ve
paket bileşenlerini `@entegrasyonik/ui/components`'tan alır. Uygulamaya özgü durum → ton eşlemesi (`src/design/status-map.ts`) ve grafik
teması (`echarts-theme.ts`) de uygulamadadır; paketin `StatusTone` tipini kullanır.

## Token çıktıları
`npm run tokens` (frontend): `tokens.app.css` → `src/tokens/dist/` (iki uygulamanın stil katmanı); `tokens.static.css` →
`frontend/src/design/tokens/dist/` (tanıtım sitesinin sözleşme yolu; aynı üretimin çıktısı — site yolu paket dist'ine taşınınca
`scripts/build-tokens.ts` ve `scripts/check-contract-paths.js` güncellenir).

## Dark mode
`darkTheme` = workspace semantik dark + legacy anahtarların DS-v2 rol eşlemesinden (`LEGACY_TO_WORKSPACE_MAP`) dark değerleri
(light ile aynı 119 anahtar). Kontrast birim testleri (`tests/themes.test.ts`). **İki uygulamada da açık** (FR2-DARK):
- Tercih `system | light | dark` (varsayılan `system`), `createThemeController(key)` ile — anahtar `ek-theme` (uygulama) /
  `ek-bo-theme` (backoffice). `?theme=dark|light` geliştirici/test geçersiz kılmasıdır (kalıcı değil).
- İlk kare: `theme-boot.js` (eşzamanlı, `<head>`'de; uygulamaların `public/` kopyaları bayt bayt aynı — testlerle korunur).
- Seçici: `EkThemeSwitch` (Açık / Koyu / Sistem, ARIA radio grubu) uygulamanın hesap menüsünde; backoffice'in üst bar tema menüsü aynı denetleyiciyi kullanır.
- Tema geçişi kuralı (`html.ek-theme-switching`) ve koyu türevler (`--ek-app-login-*`, `--ek-app-media-plate`, kanal halkası)
  `styles/app.css`'te; ekranlar yalnız `--ek-*` token'ı kullanır (literal + adlı renk mandalı: `scripts/check-style-baseline.js`).

`npm run test -w @entegrasyonik/ui`

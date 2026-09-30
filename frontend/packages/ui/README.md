# @entegrasyonik/ui — ortak tasarım sistemi paylaşım noktası

ADR-0026 Karar 1–3. Müşteri uygulaması (`frontend/src`) ve backoffice (`frontend/backoffice`) aynı token, tema ve DS-v2
bileşenlerini buradan alır. Derleme adımı yok; kaynak (TS/SFC) olarak tüketilir.

| Giriş | İçerik | Kaynak |
|---|---|---|
| `@entegrasyonik/ui/tokens` | Token kaydı (palet, semantik, workspace, rol, kontrast) | köprü → `frontend/src/design/tokens` |
| `@entegrasyonik/ui/theme` | `createEkVuetify`, `lightTheme`, **tam** `darkTheme` (43 legacy anahtar dahil), tema tercihi (`system/light/dark`, `?theme=`), `applyThemeToDocument`, `theme-boot.js` | **pakette** |
| `@entegrasyonik/ui/styles` | Vuetify + MDI + token CSS + türev değişkenler + override + Inter (uygulamadakiyle aynı kademe) | köprü → `frontend/src/design/*.css` |
| `@entegrasyonik/ui/components` | Backoffice'in kullandığı DS-v2 bileşenleri (dar liste) | köprü → `frontend/src/components/ds` |
| `@entegrasyonik/ui/format` | TR tarih/sayı/para biçimlendiricileri | köprü → `frontend/src/composables/format.ts` |

## Köprü modu (neden fiziksel taşıma değil?)
Token, tema ve DS dosyaları açık paralel bulut dallarında (fe-b*, fe-c*, fe-a8…) değişiyor. `git mv` + eski yolda
yeniden-dışa-aktarma dosyaları yine "silinip yeniden yazılmış" gösterir ve o dalların birleşmesinde çakışma üretir.
Bu yüzden Aşama 0'ın ilk adımı **ters yönlü**: kaynak yerinde kalır, paket onu `src/bridge/` üzerinden dışa verir.
Tüketiciler yalnız `@entegrasyonik/ui/*` yolunu bilir; açık dal kalmadığında fiziksel taşıma yalnız `src/bridge/*`
dosyalarını değiştirir (backoffice importları değişmez). `frontend/src`'de **hiçbir dosya değişmedi**.

Kurallar (`tests/no-app-imports.test.ts`): paket `@/` ve backoffice import etmez; uygulama kaynağına yalnız `src/bridge/`
çıkar ve yalnız DS katmanına (`src/design/**`, `src/components/ds/**`, `src/composables/format`). DS bileşenlerinin kendi
içindeki `@/design/…` importları tüketen uygulamanın `@` takma adıyla çözülür (backoffice `vite.config.mts`).

## Dark mode
`darkTheme` = workspace semantik dark + legacy anahtarların DS-v2 rol eşlemesinden (`LEGACY_TO_WORKSPACE_MAP`) dark
değerleri. Kontrast birim testleri (`tests/themes.test.ts`): `content-strong/default/muted` × `background/surface/app-bg`
≥ 4,5; durum metni kendi subtle zemininde ≥ 4,5; `border-input` ≥ 3 — iki temada. Müşteri uygulaması bugün kendi
`src/design/vuetify-theme.ts` tanımını kullanır (davranış değişmedi); dark-1a'da `createEkVuetify` + `theme-boot.js`
(`data-storage-key="ek-theme"`) ile aynı sete geçer.

`npm run test -w @entegrasyonik/ui`

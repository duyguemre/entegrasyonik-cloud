/**
 * frontend/src/design/vuetify-theme.ts
 *
 * ADR-0011 Karar 1 — Vuetify adaptörü. Tek bağımlılık yönü: `tokens ← bu
 * dosya` (tokens Vuetify'ı hiç bilmez). `plugins/vuetify.ts` yalnızca bu
 * modülü import eder.
 *
 * **ADR-0015 Karar 5.2 (A1) — ADR-0011'in "yalnızca bugün var olan anahtar
 * kümesi kablanır" kısıtını (Aşama 0 sıfır-fark) DEĞİŞTİRİR:**
 *   - light: TÜM semantik anahtarlar (Core + New, 27) + 43 legacy anahtarın
 *     TAMAMI kablanır (legacy zaten Aşama 0'da da tamdı, değişmedi).
 *   - dark: TÜM semantik anahtarlar (Core + New, 27) kablanır (Aşama 0'da
 *     yalnızca 13 çekirdekti — bu genişleme T1a karakterizasyonunu KASITLI
 *     olarak ters çevirir, bkz. `tests/theme/theme-snapshot.baseline.json`).
 *     Legacy anahtarlar dark'ta hâlâ `DARK_WIRED_LEGACY_KEYS` (12 anahtar)
 *     ile SINIRLI kalır — bu 43 legacy (çoğunlukla kabuk/chrome) anahtarının
 *     dark'a tam açılması bu ADR'nin kapsamı DIŞINDA (dark mode kapısı
 *     kapalı kalıyor, ADR-0015 Karar 5.5); yalnızca semantik anahtarlar
 *     (durum paleti + nötr/kenarlık aileleri) tam tanımlanır.
 */
import {
  appSemanticColorsLight,
  appSemanticColorsDark,
  legacyColorsWorkspaceLight,
  legacyColorsWorkspaceDarkWired,
} from './tokens/workspace'

/*
 * DS-v2 (Aşama 1) — Vuetify teması artık "workspace" (uygulama) profilinden
 * beslenir (`tokens/workspace.ts`): paylaşılan anahtarların uygulamaya özgü
 * değerleri + DS-v2 rolleri + DS-v2'ye eşlenmiş legacy anahtarları. Anahtar
 * ADLARI değişmedi (hiçbiri kaldırılmadı); dark tarafta legacy kablolaması
 * önceki gibi `DARK_WIRED_LEGACY_KEYS` ile sınırlı (dark kapısı kapalı).
 * Site (`tokens.static.css`) bu dosyadan ETKİLENMEZ.
 */

export interface VuetifyThemeDefinition {
  dark: boolean
  colors: Record<string, string>
}

export const lightTheme: VuetifyThemeDefinition = {
  dark: false,
  colors: {
    ...appSemanticColorsLight,
    ...legacyColorsWorkspaceLight,
  },
}

export const darkTheme: VuetifyThemeDefinition = {
  dark: true,
  colors: {
    ...appSemanticColorsDark,
    ...(legacyColorsWorkspaceDarkWired as Record<string, string>),
  },
}

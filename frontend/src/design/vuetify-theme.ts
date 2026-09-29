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
import { semanticColorsLight, semanticColorsDark } from './tokens/semantic'
import {
  legacyColorsLight,
  legacyColorsDark,
  DARK_WIRED_LEGACY_KEYS,
} from './tokens/legacy'

function pick<K extends string, V>(source: Record<K, V>, keys: readonly K[]): Record<K, V> {
  const result = {} as Record<K, V>
  for (const key of keys) result[key] = source[key]
  return result
}

export interface VuetifyThemeDefinition {
  dark: boolean
  colors: Record<string, string>
}

export const lightTheme: VuetifyThemeDefinition = {
  dark: false,
  colors: {
    ...semanticColorsLight,
    ...legacyColorsLight,
  },
}

export const darkTheme: VuetifyThemeDefinition = {
  dark: true,
  colors: {
    ...semanticColorsDark,
    ...pick(legacyColorsDark, DARK_WIRED_LEGACY_KEYS),
  },
}

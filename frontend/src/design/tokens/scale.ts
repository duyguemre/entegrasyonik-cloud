/**
 * frontend/src/design/tokens/scale.ts
 *
 * ADR-0011 Karar 1 — renk dışı ölçekler (spacing/radius/font/elevation/
 * motion/breakpoint). SAF TS (vue/vuetify/`@/` import'u YASAK). Tümü `px`
 * (gerekçe: kök `html` 14px'e sabit ve standart dışı, `rem` bu mirasa
 * bağlanırdı; tarayıcı yakınlaştırması `px` ile WCAG 1.4.4'ü karşılar).
 */

/** Spacing — 4px taban (Vuetify `ma-1` birimi; `pa-4` ≡ `--ek-space-4`). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const

/**
 * Font ailesi — Inter (kendi barındırılan, `@fontsource/inter`, CDN YOK).
 * ADR-0011 Açık Soru 1 KARARLANDI (kullanıcı, 2026-09-27): Roboto → Inter.
 * Ağırlıklar `--ek-font-weight-*` ile eşleşir (400/500/600/700), bkz.
 * `src/main.ts` (`@fontsource/inter/{400,500,600,700}.css` import'u).
 */
export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** `md` = bugünkü 14px gövde boyutu. */
export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
} as const

/**
 * Elevation — tema-bağımlı (light/dark ayrı değer). Stripe/Linear stili:
 * kartta gölge yerine `border-default` tercih edilir; `shadow` yalnızca
 * gerçekten yükselen yüzeyler (menü/dialog) için kullanılır.
 */
export const shadow = {
  light: {
    none: 'none',
    sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
    md: '0 2px 8px rgba(15, 23, 42, 0.10)',
    lg: '0 8px 24px rgba(15, 23, 42, 0.14)',
  },
  dark: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.40)',
    md: '0 2px 8px rgba(0, 0, 0, 0.48)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.56)',
  },
} as const

/**
 * Motion — 150/200/300ms; `ease-in-out`/`ease-out`. Başka süre/eğri token'ı
 * TANIMLANMAZ (premium-ui-standards skill + ADR-0011 Karar 1).
 */
export const duration = {
  fast: 150,
  base: 200,
  slow: 300,
} as const

export const easing = {
  standard: 'ease-in-out',
  enter: 'ease-out',
} as const

/** Kırılım — yalnızca JS sabiti + belge (Vuetify `display.thresholds` AYRI, omurgada değişmez). */
export const breakpoint = {
  tablet: 768,
  desktop: 1024,
} as const

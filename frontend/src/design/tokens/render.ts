/**
 * frontend/src/design/tokens/render.ts
 *
 * ADR-0011 Karar 1 — saf render fonksiyonu: token kaynağından iki CSS
 * çıktısı üretir. SAF TS (vue/vuetify/`@/` import'u YASAK; yalnızca DOM'suz
 * string üretimi, dosya I/O'su `frontend/scripts/build-tokens.ts`'te).
 *
 * - `renderTokenCss('app')`  → `dist/tokens.app.css`  (Vuetify'a bağlı: renk
 *   değerleri `rgb(var(--v-theme-<key>))`; tema değişimi Vuetify'ın
 *   `.v-theme--*` sınıfından tek noktadan akar.)
 * - `renderTokenCss('static')` → `dist/tokens.static.css` (Vuetify'sız
 *   tüketiciler için literal değerler: `:root` = light, `[data-theme="dark"]` = dark.)
 *
 * Renk-dışı ölçekler (`scale.ts`) her iki çıktıda da AYNI literal değerlerle
 * yazılır (Vuetify'a bağımlı değiller); `shadow` yalnızca tema-bağımlı olduğu
 * için renk gibi light/dark ayrı blokta yazılır.
 */
import { semanticColorsLight, semanticColorsDark, type SemanticColorKey } from './semantic'
import {
  legacyColorsLight,
  legacyColorsDark,
  DARK_WIRED_LEGACY_KEYS,
  type LegacyColorKey,
} from './legacy'
import {
  space,
  radius,
  radiusRole,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  typeRole,
  iconSize,
  iconTile,
  controlHeight,
  shadow,
  duration,
  easing,
  motionDistance,
  zIndex,
} from './scale'
import { channelPalette } from './palette'

export type RenderTarget = 'app' | 'static'

/** `primaryLighten` → `primary-lighten`; zaten kebab olan adlar değişmez. */
function toKebabCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * ADR-0015 Karar 5.2 (A1) — `vuetify-theme.ts` artık TÜM semantik anahtarları
 * (light + dark) canlı Vuetify temasına kablar (Aşama 0'ın yalnızca 13
 * çekirdek anahtarla sınırlı kablolaması kaldırıldı). Bu yüzden
 * `tokens.app.css` çıktısında her semantik anahtar `rgb(var(--v-theme-<key>))`
 * biçiminde yazılır (tema değişimi Vuetify'ın `.v-theme--*` sınıfından akar).
 */
function isWiredSemanticKey(_key: SemanticColorKey): boolean {
  return true
}

function cssVarLine(name: string, value: string): string {
  return `  --ek-${name}: ${value};`
}

function pxLine(name: string, value: number): string {
  return cssVarLine(name, `${value}px`)
}

function renderColorBlockApp(): string {
  const lines: string[] = []
  const semanticKeys = Object.keys(semanticColorsLight) as SemanticColorKey[]
  for (const key of semanticKeys) {
    const wired = isWiredSemanticKey(key)
    const value = wired ? `rgb(var(--v-theme-${key}))` : semanticColorsLight[key]
    lines.push(cssVarLine(`color-${key}`, value))
  }
  const legacyKeys = Object.keys(legacyColorsLight) as LegacyColorKey[]
  for (const key of legacyKeys) {
    lines.push(cssVarLine(`color-${toKebabCase(key)}`, `rgb(var(--v-theme-${key}))`))
  }
  return lines.join('\n')
}

function renderColorBlockStatic(light: boolean): string {
  const semanticSource = light ? semanticColorsLight : semanticColorsDark
  const legacySource = light ? legacyColorsLight : legacyColorsDark
  const lines: string[] = []
  const semanticKeys = Object.keys(semanticSource) as SemanticColorKey[]
  for (const key of semanticKeys) {
    lines.push(cssVarLine(`color-${key}`, semanticSource[key]))
  }
  const legacyKeys = Object.keys(legacySource) as LegacyColorKey[]
  for (const key of legacyKeys) {
    // Aşama 0'da dark'ta gerçekten kablı olmayan legacy anahtarlar için de
    // `legacy.ts`'in tam (eşlenmiş) dark kaydı literal olarak yayılır —
    // `tokens.static.css` Vuetify'ın canlı tema kısıtına tabi DEĞİL (Karar 1).
    lines.push(cssVarLine(`color-${toKebabCase(key)}`, legacySource[key]))
  }
  return lines.join('\n')
}

function renderScaleLines(): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(space)) lines.push(pxLine(`space-${key}`, value))
  for (const [key, value] of Object.entries(radius)) lines.push(pxLine(`radius-${key}`, value))
  lines.push(cssVarLine('font-sans', fontFamily.sans))
  lines.push(cssVarLine('font-mono', fontFamily.mono))
  for (const [key, value] of Object.entries(fontSize)) lines.push(pxLine(`font-size-${key}`, value))
  for (const [key, value] of Object.entries(fontWeight)) lines.push(cssVarLine(`font-weight-${key}`, String(value)))
  for (const [key, value] of Object.entries(lineHeight)) lines.push(cssVarLine(`line-height-${key}`, String(value)))
  for (const [key, value] of Object.entries(duration)) lines.push(cssVarLine(`duration-${key}`, `${value}ms`))
  for (const [key, value] of Object.entries(easing)) lines.push(cssVarLine(`easing-${key}`, value))
  return [...lines, ...renderDsV2ScaleLines()]
}

/** DS-v2 — rol token'ları (radius/tipografi/ikon/kontrol/hareket/z-index). */
function renderDsV2ScaleLines(): string[] {
  const lines: string[] = []
  for (const [role, scaleKey] of Object.entries(radiusRole)) {
    lines.push(cssVarLine(`radius-${role}`, `var(--ek-radius-${scaleKey})`))
  }
  for (const [role, t] of Object.entries(typeRole)) {
    lines.push(pxLine(`type-${role}-size`, t.size))
    lines.push(pxLine(`type-${role}-line`, t.line))
    lines.push(cssVarLine(`type-${role}-weight`, String(t.weight)))
    lines.push(cssVarLine(`type-${role}-tracking`, t.tracking))
    lines.push(cssVarLine(`type-${role}-icon`, `var(--ek-icon-${t.icon})`))
  }
  for (const [key, value] of Object.entries(iconSize)) lines.push(pxLine(`icon-${key}`, value))
  for (const [key, value] of Object.entries(iconTile)) {
    lines.push(pxLine(`icon-tile-${key}`, value.box))
    lines.push(cssVarLine(`icon-tile-${key}-icon`, `var(--ek-icon-${value.icon})`))
  }
  for (const [key, value] of Object.entries(controlHeight)) lines.push(pxLine(`control-h-${key}`, value))
  for (const [key, value] of Object.entries(motionDistance)) lines.push(pxLine(`motion-distance-${key}`, value))
  for (const [key, value] of Object.entries(zIndex)) lines.push(cssVarLine(`z-${key}`, String(value)))
  lines.push(
    cssVarLine(
      'transition-colors',
      ['color', 'background-color', 'border-color', 'box-shadow', 'opacity']
        .map((prop) => `${prop} var(--ek-duration-fast) var(--ek-easing-enter)`)
        .join(', '),
    ),
  )
  return lines
}

/**
 * DS-v2 — renk BİLEŞİMLERİ (degrade, saydam scrim, odak halkası). Yalnızca
 * diğer `--ek-color-*` değişkenlerine başvurur; ham renk içermez. Custom
 * property içindeki `var()` bildirildiği öğede çözüldüğü için static çıktıda
 * dark bloğunda da yeniden yazılır.
 */
function renderEffectLines(): string[] {
  return [
    cssVarLine(
      'gradient-chrome',
      'linear-gradient(100deg, var(--ek-color-chrome) 0%, var(--ek-color-chrome-end) 100%)',
    ),
    cssVarLine('color-scrim-veil', 'color-mix(in srgb, var(--ek-color-scrim) 44%, transparent)'),
    cssVarLine(
      'focus-ring',
      '0 0 0 2px var(--ek-color-surface), 0 0 0 4px var(--ek-color-border-focus)',
    ),
    cssVarLine('selection-ring', 'inset 0 0 0 1px var(--ek-color-action-border)'),
  ]
}

/**
 * C1 — kanal marka renkleri (`palette.ts` `channelPalette` TEK kaynak):
 *   `--ek-channel-<kod>-brand` / `-on-brand` (+ varsa `-secondary`, yalnız logo zemini) ve tanımsız kanal için
 *   `neutral` (nötr durum rollerine bağlı). `--ek-channel-ring`: marka rengini DEĞİŞTİRMEDEN küçük işaretleri
 *   (nokta, logo zemini, dolgulu çip) her iki temada zeminden ayıran nötr kıl halka (içerik renginin %20'si).
 * Marka rengi tema bağımsız (dark'ta da aynı) → yalnız `:root`; halka tema rolüne bağlı olduğu için kendiliğinden döner.
 */
export const CHANNEL_SCOPE_CODES = [...Object.keys(channelPalette), 'neutral'] as const

function renderChannelLines(): string[] {
  const lines: string[] = []
  for (const [code, tones] of Object.entries(channelPalette)) {
    lines.push(cssVarLine(`channel-${code}-brand`, tones.brand), cssVarLine(`channel-${code}-on-brand`, tones.onBrand))
    if ('secondary' in tones) lines.push(cssVarLine(`channel-${code}-secondary`, tones.secondary))
  }
  lines.push(
    cssVarLine('channel-neutral-brand', 'var(--ek-color-neutral)'),
    cssVarLine('channel-neutral-on-brand', 'var(--ek-color-neutral-contrast)'),
    cssVarLine('channel-ring', 'color-mix(in srgb, var(--ek-color-content-default) 20%, transparent)'),
  )
  return lines
}

/**
 * Kanal kapsam sınıfları: `.ek-ch-<kod>` öğeye `--ek-ch-brand`, `--ek-ch-on-brand`, `--ek-ch-secondary` (tanımsızsa
 * marka) verir. Bileşenler kanal rengini satır içi stil/`v-bind` OLMADAN, yalnız sınıf + `var(--ek-ch-*)` ile kullanır
 * (`design/channels.ts`). Geri uyum takma adları (C1 öncesi tüketiciler; yeni kodda KULLANMA): `solid`/`border` →
 * marka, `subtle` → nötr zemin, `text` → varsayılan içerik rengi — hiçbiri marka tonu türetmez.
 */
function renderChannelScopes(): string[] {
  return CHANNEL_SCOPE_CODES.map((code) => {
    const tones = (channelPalette as Record<string, { secondary?: string }>)[code]
    const brand = `var(--ek-channel-${code}-brand)`
    return [
      `.ek-ch-${code} {`,
      `  --ek-ch-brand: ${brand};`,
      `  --ek-ch-on-brand: var(--ek-channel-${code}-on-brand);`,
      `  --ek-ch-secondary: ${tones?.secondary ? `var(--ek-channel-${code}-secondary)` : brand};`,
      `  --ek-ch-solid: ${brand};`,
      `  --ek-ch-border: ${brand};`,
      '  --ek-ch-subtle: var(--ek-color-neutral-subtle);',
      '  --ek-ch-text: var(--ek-color-content-default);',
      '}',
    ].join('\n')
  })
}

function renderShadowLines(light: boolean): string[] {
  const source = light ? shadow.light : shadow.dark
  return Object.entries(source).map(([key, value]) => cssVarLine(`shadow-${key}`, value))
}

const HEADER =
  '/* Üretilmiş dosya — DÜZENLEMEYİN. Kaynak: frontend/src/design/tokens/**' +
  ' (`npm run tokens` ile yeniden üretilir; drift testi bu dosyayı kaynakla karşılaştırır). */'

/** `target: 'app'` → Vuetify'a bağlı; `target: 'static'` → literal (light `:root`, dark `[data-theme="dark"]`). */
export function renderTokenCss(target: RenderTarget): string {
  const scaleLines = renderScaleLines()
  if (target === 'app') {
    const colorLines = renderColorBlockApp()
    const shadowLightLines = renderShadowLines(true)
    return [
      HEADER,
      ':root {',
      colorLines,
      scaleLines.join('\n'),
      shadowLightLines.join('\n'),
      renderEffectLines().join('\n'),
      renderChannelLines().join('\n'),
      '}',
      '',
      renderChannelScopes().join('\n\n'),
      '',
    ].join('\n')
  }

  const lightColorLines = renderColorBlockStatic(true)
  const darkColorLines = renderColorBlockStatic(false)
  const shadowLightLines = renderShadowLines(true)
  const shadowDarkLines = renderShadowLines(false)
  return [
    HEADER,
    ':root {',
    lightColorLines,
    scaleLines.join('\n'),
    shadowLightLines.join('\n'),
    renderEffectLines().join('\n'),
    '}',
    '',
    '[data-theme="dark"] {',
    darkColorLines,
    shadowDarkLines.join('\n'),
    renderEffectLines().join('\n'),
    '}',
    '',
  ].join('\n')
}

// `DARK_WIRED_LEGACY_KEYS` bugün canlı Vuetify dark temasında var olan
// legacy anahtarları belgeler — `renderColorBlockStatic` bu kısıtla
// SINIRLI DEĞİL (static çıktı Vuetify'sız tüketiciler için, tam eşlenmiş
// dark değerlerini yayar); yalnızca `vuetify-theme.ts` bu listeyle sınırlı
// kablolama yapar. Referans burada dokümantasyon amaçlı tutulur.
export { DARK_WIRED_LEGACY_KEYS }

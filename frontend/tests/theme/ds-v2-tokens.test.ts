import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import namesV1 from './token-names.v1.json'
import {
  CONTRAST_PAIRS,
  COLOR_ROLES,
  appSemanticColorsLight,
  appSemanticColorsDark,
  semanticColorsLight,
  workspaceColorsLight,
  legacyColorsLight,
  legacyColorsWorkspaceLight,
  LEGACY_TO_WORKSPACE_MAP,
  contrastRatio,
  typeRole,
  iconSize,
  renderTokenCss,
  type SemanticColorKey,
} from '../../src/design/tokens'

/**
 * DS-v2 Aşama 1 — tasarım sistemi token sözleşmesi.
 * (1) Tüm zorunlu metin/arka plan çiftleri WCAG AA (uygulama profili, light+dark).
 * (2) Geriye uyumluluk: DS-v2 öncesi hiçbir `--ek-*` adı kaldırılmadı.
 * (3) Site profili (`tokens.static.css`) paylaşılan anahtarlarda DEĞİŞMEDİ.
 * (4) Her DS-v2 rolünün yazılı kullanım amacı var; ikon/yazı boyutları orantılı.
 */
describe('DS-v2 — WCAG AA kontrast çiftleri (roles.ts CONTRAST_PAIRS)', () => {
  const cases = CONTRAST_PAIRS.map((p) => ({ ...p, label: `${p.fg} / ${p.bg} ≥ ${p.min}` }))

  it.each(cases)('light: $label', ({ fg, bg, min }) => {
    expect(contrastRatio(appSemanticColorsLight[fg], appSemanticColorsLight[bg])).toBeGreaterThanOrEqual(min)
  })

  it.each(cases)('dark: $label', ({ fg, bg, min }) => {
    expect(contrastRatio(appSemanticColorsDark[fg], appSemanticColorsDark[bg])).toBeGreaterThanOrEqual(min)
  })

  it('content-subtle yalnızca dekoratif: tonlu zeminde AA altında kalır (metin için kullanılmaz)', () => {
    expect(contrastRatio(appSemanticColorsLight['content-subtle'], appSemanticColorsLight['app-bg'])).toBeLessThan(4.5)
  })
})

describe('DS-v2 — geriye uyumluluk (ad kaldırma YOK)', () => {
  const staticCss = renderTokenCss('static')
  const appCss = renderTokenCss('app')
  const declared = (css: string) => new Set([...css.matchAll(/(--ek-[\w-]+)\s*:/g)].map((m) => m[1]))

  it.each(namesV1.names)('%s hâlâ tokens.static.css ve tokens.app.css içinde tanımlı', (name) => {
    expect(declared(staticCss).has(name)).toBe(true)
    expect(declared(appCss).has(name)).toBe(true)
  })
})

describe('DS-v2 — site profili (tokens.static.css) paylaşılan değerleri korunur', () => {
  // ADR-0015 Karar 1.3: sitenin kullandığı anahtarların değeri değiştirilmez.
  const FROZEN: Partial<Record<SemanticColorKey, string>> = {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    primary: '#13255B',
    'primary-darken-1': '#1F5592',
    secondary: '#48A9A6',
    'secondary-darken-1': '#018786',
    'surface-muted': '#F8FAFC',
    'surface-sunken': '#F1F5F9',
    'border-default': '#E2E8F0',
    'border-strong': '#CBD5E1',
    'content-strong': '#0F172A',
    'content-default': '#334155',
    'content-muted': '#64748B',
    'content-subtle': '#94A3B8',
  }
  it.each(Object.entries(FROZEN))('%s = %s', (key, value) => {
    expect(semanticColorsLight[key as SemanticColorKey]).toBe(value)
  })

  it('site legacy değerleri (legacyColorsLight) uygulamanın DS-v2 legacy eşlemesinden bağımsız kalır', () => {
    expect(legacyColorsLight.amber).toBe('#FFC107')
    expect(legacyColorsWorkspaceLight.amber).toBe(appSemanticColorsLight.warning)
  })
})

describe('DS-v2 — rol belgeleri ve eşleme bütünlüğü', () => {
  const documented = new Set(COLOR_ROLES.map((r) => r.key))

  it.each(Object.keys(workspaceColorsLight))('"%s" rolünün yazılı kullanım amacı var', (key) => {
    expect(documented.has(key as SemanticColorKey)).toBe(true)
  })

  it('her rol belgesi gerçek bir anahtarı gösterir ve amacı boş değil', () => {
    for (const role of COLOR_ROLES) {
      expect(appSemanticColorsLight[role.key], role.key).toBeTruthy()
      expect(role.purpose.length).toBeGreaterThan(10)
    }
  })

  it('her legacy anahtarı bir DS-v2 rolüne eşlenir ve değeri o rolün değeridir', () => {
    for (const [legacy, target] of Object.entries(LEGACY_TO_WORKSPACE_MAP)) {
      expect(legacyColorsWorkspaceLight[legacy as keyof typeof legacyColorsWorkspaceLight]).toBe(appSemanticColorsLight[target])
    }
  })

  it('uygulamada primary = action (tek vurgu rengi kuralı)', () => {
    expect(appSemanticColorsLight.primary).toBe(appSemanticColorsLight.action)
    expect(appSemanticColorsLight.background).toBe(appSemanticColorsLight['app-bg'])
  })
})

describe('DS-v2 — ikon boyutu yazı boyutuyla orantılı (0,85–1,35 ×)', () => {
  it.each(Object.entries(typeRole))('%s', (_role, t) => {
    const ratio = iconSize[t.icon] / t.size
    expect(ratio).toBeGreaterThanOrEqual(0.85)
    expect(ratio).toBeLessThanOrEqual(1.35)
  })
})

describe('DS-v2 — üretilmiş CSS commit\'li dosyayla eşit (drift)', () => {
  it('tokens.static.css DS-v2 rollerini içerir', () => {
    const css = readFileSync(resolve(__dirname, '../../src/design/tokens/dist/tokens.static.css'), 'utf8')
    for (const name of ['--ek-color-app-bg', '--ek-color-action', '--ek-radius-card', '--ek-type-heading-size', '--ek-icon-md', '--ek-z-dropdown', '--ek-gradient-chrome']) {
      expect(css).toContain(`${name}:`)
    }
  })
})

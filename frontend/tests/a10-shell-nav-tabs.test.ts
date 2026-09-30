// A10 — sol menü bölüm deseni + ana sekme ↔ içerik birleşme bölgesi için statik bekçiler (DESIGN_SYSTEM.md §18).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const style = (text: string) => text.slice(text.indexOf('<style'))
const rule = (css: string, selector: string) => {
  const i = css.indexOf(`${selector} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

const nav = read('src/components/ds/EkSidebarNav.vue')
const tabs = read('src/components/ds/EkWorkspaceTabs.vue')

describe('A10 — sol menü bölümleri', () => {
  const css = style(nav)

  it('bölüm başlığı öğe renginde (soluk/devre dışı tonu değil) ve mikro etiket biçiminde', () => {
    const label = rule(css, '.ek-side__section-label')
    expect(label).toContain('color: var(--ek-color-sidebar-text)')
    expect(label).toContain('text-transform: uppercase')
    expect(label).toContain('letter-spacing: var(--ek-type-micro-tracking)')
    expect(label).not.toMatch(/content-subtle|opacity/)
  })

  it('bölümler ayırıcıyla ayrılır; ray modunda da başlık yerine ayırıcı var', () => {
    expect(nav).toMatch(/v-if="sIndex > 0" class="ek-side__section-rule"/)
    expect(css).toContain('.ek-side--collapsed .ek-side__section-rule')
  })

  it('başlıklı bölüm listesi başlığa bağlanır (ekran okuyucu grup adını okur)', () => {
    expect(nav).toMatch(/:aria-labelledby="!collapsed && showLabel\(section\)/)
  })

  it('reduced-motion bloğu tek ve temiz (yinelenen kural yok)', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block.match(/\.ek-side__trailing/g) ?? []).toHaveLength(0)
  })
})

describe('A10 — etkin sekme ↔ içerik birleşmesi', () => {
  const css = style(tabs)

  it('şerit alt çizgisi, etkin sekme kenarlığı ve içbükey köşe halkası AYNI token (renk sıçraması yok)', () => {
    expect(rule(css, '.ek-tabs')).toContain('--ek-tab-line: var(--ek-color-border-strong)')
    expect(rule(css, '.ek-tabs')).toContain('box-shadow: inset 0 -1px 0 var(--ek-tab-line)')
    expect(rule(css, '.ek-tab.is-active')).toContain('border-color: var(--ek-tab-line)')
    expect(rule(css, '.ek-tab__flare')).toContain('var(--ek-tab-line)')
  })

  it('etkin sekmenin alt kenarı yok ve zemini içerik zemini (tek parça)', () => {
    expect(rule(css, '.ek-tab')).toContain('border-bottom: 0')
    expect(rule(css, '.ek-tab.is-active')).toContain('background: var(--ek-color-tab-active)')
  })

  it('etkinleşmede zemin/kenarlık geçişi yok (köşelerle aynı karede); gösterge animasyonu reduced-motion’da kapalı', () => {
    expect(rule(css, '.ek-tab')).not.toContain('var(--ek-transition-colors)')
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toMatch(/\.ek-tab\.is-active::after\s*\{\s*animation: none/)
  })

  it('ham renk yok', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})

// A12 — ana sekme şeridinde pasif sekmeler için statik bekçiler (DESIGN_SYSTEM.md §19). Ölçüm iddiaları (layout shift 0,
// AA, odak, 390px) e2e/specs/workspace-tabs-passive.spec.ts'te.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const tabs = readFileSync(join(__dirname, '..', 'packages/ui/src/components/EkWorkspaceTabs.vue'), 'utf8')
const css = tabs.slice(tabs.indexOf('<style'))
const rule = (selector: string) => {
  // Satır başındaki kural (FR3: `.ek-tab:not(.is-active) .ek-tab__close {` gibi daha özgül kurallarla karışmasın).
  const i = css.indexOf(`\n${selector} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}
/** Sekmenin hover/odak durumlarını tanımlayan tüm kural blokları. */
const hoverBlocks = [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)].filter(([, sel]) => sel.includes('.ek-tab') && !sel.includes('__close:hover') && !sel.includes('__arrow'))

describe('A12 — pasif sekme hover yalnız renk/opaklık', () => {
  it('hover kurallarında boyut/dolgu/kalınlık/kenarlık kalınlığı/transform yok', () => {
    expect(hoverBlocks.length).toBeGreaterThan(0)
    for (const [, sel, body] of hoverBlocks) {
      expect(body, sel).not.toMatch(/\b(height|width|padding|margin|font-weight|border-width|border:|transform|scale|inset)\b/)
    }
  })

  it('ışıma ayrı katmanda (tab-hover → şerit sönen gradyan + action-border saç çizgisi), yalnız opaklıkla ve motion token’larıyla geçer', () => {
    expect(tabs).toContain('<span class="ek-tab__wash" aria-hidden="true"></span>')
    const wash = rule('.ek-tab__wash')
    expect(wash).toMatch(/background: linear-gradient\(to bottom, var\(--ek-color-tab-hover\), color-mix\(in srgb, var\(--ek-color-tab-hover\) \d+%, transparent\)\)/)
    expect(wash).toContain('inset: -1px -1px 1px') // alt çizgi hover altında görünür
    expect(wash).toContain('opacity: 0')
    expect(wash).toMatch(/transition: opacity var\(--ek-motion-feedback\)/)
    expect(rule('.ek-tab__wash::after')).toContain('background: var(--ek-color-action-border)')
    // A10: etkinleşince ışıma ANINDA kalkar
    expect(rule('.ek-tab.is-active .ek-tab__wash')).toMatch(/opacity: 0;\s*transition: none/)
  })

  it('sekme zemini hover’da DEĞİŞMEZ (ışıma katmanı taşır) — FR3: pasif metin default, hover strong; yarı kalın yalnız etkin', () => {
    expect(css).not.toMatch(/\.ek-tab:hover,\s*\.ek-tab\.is-hover\s*\{[^}]*background/)
    expect(rule('.ek-tab')).toContain('color: var(--ek-color-content-default)')
    expect(css).toMatch(/\.ek-tab:not\(\.is-active\):hover,\s*\.ek-tab\.is-hover:not\(\.is-active\)\s*\{\s*color: var\(--ek-color-content-strong\)/)
  })
})

describe('A12 — genişlik sabitliği', () => {
  it('hayalet kalın başlık: başlık kutusu yarı kalın genişliği ayırır, ekran okuyucuya boş alternatif metin', () => {
    expect(tabs).toContain(':data-text="tab.title"')
    const ghost = rule('.ek-tab__title::after')
    expect(ghost).toContain("content: attr(data-text) / ''")
    expect(ghost).toContain('font-weight: var(--ek-font-weight-semibold)')
    expect(ghost).toMatch(/height: 0/)
    expect(ghost).toContain('visibility: hidden')
  })

  it('kapatma pasifte opaklıkla gizli (display/width ile değil); FR3: pasifte yer AYIRMAZ, solma bölgesinin üstünde belirir', () => {
    const close = rule('.ek-tab__close')
    expect(close).toContain('opacity: 0')
    expect(close).toContain('width: 20px')
    const passive = css.slice(css.indexOf('.ek-tab:not(.is-active) .ek-tab__close {'))
    expect(passive.slice(0, passive.indexOf('}'))).toContain('position: absolute')
    expect(css).toMatch(/\.ek-tab:not\(\.is-active\) \.ek-tab__title \{[^}]*mask-image/)
  })
})

describe('A12 — odak ve hareket', () => {
  it('klavye odağı tüm sekmeyi sarar (:has), etkin sekmede gösterge korunur', () => {
    expect(css).toContain('.ek-tab:not(.is-active):has(.ek-tab__button:focus-visible)::after')
    expect(css).toMatch(/\.ek-tab\.is-active:has\(\.ek-tab__button:focus-visible\)\s*\{\s*box-shadow: var\(--ek-shadow-tab-active\), inset 0 0 0 2px var\(--ek-color-border-focus\)/)
  })

  it('reduced-motion: sekme, ayraç, ışıma, kapatma geçişleri kapalı', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    const first = reduced.slice(0, reduced.indexOf('}'))
    for (const sel of ['.ek-tab,', '.ek-tab + .ek-tab::before', '.ek-tab__wash', '.ek-tab__close']) expect(first).toContain(sel)
    expect(first).toContain('transition: none')
  })

  it('ham renk yok', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})

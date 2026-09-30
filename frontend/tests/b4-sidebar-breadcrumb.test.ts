// B4 — sol menü (yalnız etkin sayfa vurgulu, koreografili daralma) + breadcrumb çipleri + yardım tetikleyicisi için
// statik bekçiler (DESIGN_SYSTEM.md §19). Davranışsal karşılığı: e2e/specs/b4-sidebar.spec.ts.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const style = (text: string) => text.slice(text.indexOf('<style'))
/** Seçiciyle BAŞLAYAN kuralın gövdesi (ilk eşleşme). */
const rule = (css: string, selector: string) => {
  const i = css.indexOf(`\n${selector} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}
/** CSS'i { seçici, gövde } bloklarına ayırır (düz kurallar; @media içleri de düz okunur). */
const blocks = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))

const nav = read('packages/ui/src/components/EkSidebarNav.vue')
const menu = read('src/components/layout/NavigationMenu.vue')
const shell = read('src/layouts/SecureLayout.vue')
const app = read('packages/ui/src/styles/app.css')
const bar = read('src/components/page/EkPageBar.vue')

describe('B4 — sol menü: vurgu rengi YALNIZ etkin öğede', () => {
  const css = style(nav)

  it('aksiyon/vurgu rengi (action*, sidebar-active) yalnız .is-active seçicilerinde', () => {
    const offenders = blocks(css)
      .filter((b) => /--ek-color-(action|sidebar-active)/.test(b.body))
      .filter((b) => !b.sel.split(',').every((s) => s.includes('.is-active')))
      .map((b) => b.sel)
    expect(offenders).toEqual([])
  })

  it('grup (etkin öğenin üstü) ve bölüm başlığı nötr', () => {
    expect(rule(css, '.ek-side__section-label')).toContain('color: var(--ek-color-content-muted)')
    const parent = blocks(css).filter((b) => b.sel.includes('is-parent-active') && !b.sel.includes('collapsed'))
    expect(parent.length).toBeGreaterThan(0)
    for (const b of parent) expect(b.body).not.toMatch(/action/)
  })

  it('durumlar geometri değiştirmez: etkin/hover/üst-etkin kurallarında ağırlık, boşluk, yükseklik yok', () => {
    const stateful = blocks(css).filter((b) => /(is-active|is-parent-active|:hover|is-hover|:focus-visible)/.test(b.sel) && !b.sel.includes('::'))
    for (const b of stateful) expect(b.body, b.sel).not.toMatch(/font-weight|padding|margin|height|width|border:/)
  })

  it('ham renk yok', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(style(menu)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  })
})

describe('B4 — daralma/genişleme koreografisi', () => {
  it('ray ayrı bileşen değil: tam ↔ ray AYNI çekmecede (ikonlar yerinde kalır)', () => {
    expect(existsSync(join(__dirname, '..', 'src/components/layout/NavigationRail.vue'))).toBe(false)
    expect(menu).toMatch(/:rail="isRail"/)
    expect(menu).toMatch(/isRail \? 'soft-rail is-rail' : 'soft-nav'/)
    expect(shell).toMatch(/:rail="showRail"/)
  })

  it('içerik kırpılarak değil opaklıkla kaybolur; etiketler DOM’da kalır (v-if="!collapsed" yok)', () => {
    expect(nav).not.toMatch(/v-if="!collapsed"/)
    expect(style(nav)).toMatch(/\.ek-side--collapsed \.ek-side__fade \{\s*opacity: 0;/)
  })

  it('süre/eğri/gecikme yalnız hareket token’larından; ray’a giderken geometri solmadan SONRA', () => {
    expect(app).toContain('--ek-app-nav-fade: var(--ek-duration-fast)')
    expect(app).toContain('--ek-app-nav-move: var(--ek-duration-slow)')
    expect(rule(style(nav), '.ek-side--collapsed')).toMatch(/--ek-side-geo: var\(--ek-app-nav-move, 0ms\) var\(--ek-easing-enter\) var\(--ek-app-nav-lag, 0ms\)/)
    expect(rule(style(menu), '.ek-shell-nav.is-rail')).toContain('transition-delay: var(--ek-app-nav-lag)')
    expect(style(shell)).toMatch(/\.ek-shell--rail \{\s*--ek-shell-left: left var\(--ek-app-nav-move\) var\(--ek-easing-enter\) var\(--ek-app-nav-lag\)/)
    for (const src of [nav, menu, shell]) expect(style(src)).not.toMatch(/cubic-bezier|\d{3,}ms/)
  })

  it('reduced-motion ve uygulama tercihi → anında (tüm nav süreleri 0)', () => {
    const reduced = app.slice(app.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const v of ['fade', 'move', 'lag', 'reveal']) expect(reduced).toContain(`--ek-app-nav-${v}: 0ms`)
    const pref = app.slice(app.indexOf(":root[data-motion='reduced']"))
    for (const v of ['fade', 'move', 'lag', 'reveal']) expect(pref).toContain(`--ek-app-nav-${v}: 0ms`)
  })

  it('rayda gizli içerik odaklanamaz (alt liste inert, favori görünmez)', () => {
    expect(nav).toMatch(/:inert="!\(isOpen\(item\.key\) && !collapsed\) \|\| undefined"/)
    expect(style(nav)).toMatch(/\.ek-side--collapsed \.ek-side__hideable \{\s*visibility: hidden;/)
  })
})

describe('B4 — breadcrumb çipleri + yardım tetikleyicisi', () => {
  const css = style(bar)

  // FR2-SHELL madde 1 (fe-r2a, bilinçli güncelleme): çip kenarlığı/zemini KALKTI — sakin metin izi (kullanıcı: "amatör").
  it('ara öğeler ve kök nötr metin halkası (kenarlık/zemin yok, chip-h-md hedef yüksekliği); vurgu rengi yok', () => {
    const chip = rule(css, '.ek-crumbs__chip')
    expect(chip).toContain('height: var(--ek-app-chip-h-md)')
    expect(chip).toContain('border: 0')
    expect(chip).toContain('background: transparent')
    expect(chip).toContain('color: var(--ek-color-content-muted)')
    const crumbBlocks = blocks(css).filter((b) => b.sel.includes('ek-crumbs'))
    for (const b of crumbBlocks) expect(b.body, b.sel).not.toMatch(/--ek-color-action/)
    expect(bar).toMatch(/class="ek-crumbs__link ek-crumbs__chip"/)
  })

  it('yardım tetikleyicisi: küçük yuvarlak nötr düğme, ince "?" — dolgulu/renkli ikon yok; ipucu + odak halkası', () => {
    const info = rule(css, '.ek-page-bar__info')
    expect(info).toContain('width: 24px')
    expect(info).toContain('border-radius: var(--ek-radius-chip)')
    expect(info).toContain('border: 1px solid var(--ek-color-border-default)')
    const states = blocks(css).filter((b) => b.sel.includes('ek-page-bar__info') && !b.sel.includes('focus'))
    for (const b of states) expect(b.body, b.sel).not.toMatch(/--ek-color-action/)
    expect(bar).toMatch(/<EkTooltip[^>]*Sayfa hakkında[\s\S]{0,400}class="ek-page-bar__info"/)
    expect(bar).toMatch(/icon="mdi-help" size="14"/)
    expect(css).toMatch(/\.ek-page-bar__info:focus-visible[\s\S]*?box-shadow: var\(--ek-focus-ring\)/)
  })

  it('davranış/API korunur: aria-expanded + aria-controls + "Sayfa hakkında: <başlık>"', () => {
    expect(bar).toMatch(/:aria-expanded="about\.open\.value"/)
    expect(bar).toMatch(/:aria-controls="panelId"/)
    expect(bar).toMatch(/:aria-label="`Sayfa hakkında: \$\{title\}`"/)
  })
})

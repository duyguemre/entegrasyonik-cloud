/**
 * S21 — hero "operasyon merkezi" çerçevesi (uygulama penceresi) kaynak düzeyi korumaları:
 *  - çerçeve süsleri (kenar ışığı, parıltı) yerleşime girmez → sahne yüksekliği/konumu değişmez (CLS 0)
 *  - parıltı döngüsü yalnızca transform/opacity sınıfı, reduced-motion'da hiç tanımlı değil ve yalnızca sahne
 *    görünürken çalışır (show döngüsüyle aynı kapı); statik hâlde görünmez ama kenar ışığı kalır
 *  - S9 ofsetli "hayalet" paneller geri gelmez; 390 px'te çerçeve sadeleşir
 * Kaynak: src/components/home/Hero.astro + src/styles/scenes-loops.css (derleme gerektirmez).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src')
const read = (p: string) => readFileSync(path.join(src, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const hero = read('components/home/Hero.astro')
const heroCss = stripComments(hero.slice(hero.indexOf('<style>')))
const heroMarkup = hero.slice(0, hero.indexOf('<style>'))
const loops = stripComments(read('styles/scenes-loops.css'))

/** Seçicinin İLK (medya sorgusu dışı) kural gövdesi. */
const rule = (css: string, selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`))
  return m?.[1] ?? ''
}

/** Bir keyframes bloğunun tamamı (iç içe süslü parantezlerle). */
const keyframes = (css: string, name: string) => {
  const start = css.indexOf(`@keyframes ${name}`)
  if (start < 0) return ''
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return ''
}

describe('S21 hero çerçevesi — uygulama penceresi', () => {
  it('pencere çubuğu: pencere noktaları + başlık + araç çubukları; sahne dekoratif (aria-hidden) kalır', () => {
    expect(heroMarkup).toMatch(/<div class="show__bar">[\s\S]*show__dots[\s\S]*show__brand[\s\S]*Operasyon merkezi[\s\S]*show__tools/)
    expect(heroMarkup).toMatch(/class="show"[^>]*aria-hidden="true"/)
    expect(heroMarkup).toMatch(/class="show__rim" aria-hidden="true"><span class="show__sheen" data-part="frame-sheen">/)
  })

  it('S9 ofsetli "hayalet" paneller ve paralaks kökü geri gelmez (sahneyle yarışan kaymış kenarlar)', () => {
    expect(hero).not.toMatch(/hero__depth|data-parallax-root/)
    expect(heroCss).not.toMatch(/\.hero__visual::after/)
  })

  it('CLS 0: kenar ışığı ve parıltı mutlak konumlu, zemin ışıması sözde öğe; sahne ızgarası tek hücre', () => {
    expect(rule(heroCss, '.show__rim')).toMatch(/position:\s*absolute/)
    expect(rule(heroCss, '.show__rim')).toMatch(/pointer-events:\s*none/)
    expect(rule(heroCss, '.show__sheen')).toMatch(/position:\s*absolute/)
    expect(rule(heroCss, '.hero__visual::before')).toMatch(/position:\s*absolute/)
    // Çerçeve derinliği yalnızca gölge/arka planla (yerleşimi etkilemeyen özellikler); kasa = box-shadow halkası
    const show = rule(heroCss, '.show')
    expect(show).toMatch(/box-shadow:/)
    expect(show).not.toMatch(/(?:^|\s)(?:margin|outline-offset):/)
    // sahneler üst üste aynı hücrede (yükseklik = en uzun sahne; döngü yerleşimi değiştirmez)
    expect(rule(heroCss, '.show__stage')).toMatch(/display:\s*grid/)
    expect(rule(heroCss, '.show__scene')).toMatch(/grid-area:\s*1\s*\/\s*1/)
  })

  it('parıltı statik hâlde görünmez (opacity 0); kenar ışığı statik hâlde de vardır (reduced-motion şık kalır)', () => {
    expect(rule(heroCss, '.show__sheen')).toMatch(/opacity:\s*0;/)
    expect(rule(heroCss, '.show__rim')).toMatch(/background:\s*linear-gradient/)
  })

  it('parıltı döngüsü: yalnızca translate/opacity, reduced-motion altında tanımsız, görünürlük kapısında', () => {
    const kf = keyframes(loops, 'loop-frame-sheen')
    expect(kf).not.toBe('')
    const props = [...kf.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
    expect(new Set(props)).toEqual(new Set(['opacity', 'translate']))
    // tüm döngü dosyası `no-preference` içinde → reduce'ta keyframes/kural yok
    const mediaStart = loops.indexOf('@media (prefers-reduced-motion: no-preference)')
    expect(mediaStart).toBeGreaterThanOrEqual(0)
    expect(loops.indexOf('@keyframes loop-frame-sheen')).toBeGreaterThan(mediaStart)
    // show döngüsüyle aynı üç kapı: paused başlar, görünürken running, üzerine gelince paused
    const lists = [...loops.matchAll(/\[data-scene='hero-mock'\]\[data-state='play'\](\[data-visible='true'\])?(:hover)?\s*:is\(([^)]*)\)\s*,?[^{]*\{([^}]*)\}/g)]
    const gates = lists.filter((m) => m[3].includes("[data-part='frame-sheen']")).map((m) => `${m[1] ? 'v' : ''}${m[2] ? 'h' : ''}:${m[4].trim()}`)
    expect(gates.some((g) => g.startsWith(':') && /animation-play-state:\s*paused/.test(g))).toBe(true)
    expect(gates.some((g) => g.startsWith('v:') && /running/.test(g))).toBe(true)
    expect(gates.some((g) => g.startsWith('vh:') && /paused/.test(g))).toBe(true)
  })

  it('390 px: çerçeve sadeleşir (araç çubukları gizli, ışıma küçülür)', () => {
    const mobile = heroCss.slice(heroCss.indexOf('@media (max-width: 29.99rem)'))
    expect(mobile).toMatch(/\.show__tools\s*\{\s*display:\s*none/)
    expect(mobile).toMatch(/\.show\s*\{\s*box-shadow:/)
  })
})

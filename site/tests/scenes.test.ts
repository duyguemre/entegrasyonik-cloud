/**
 * Animasyon sahneleri kuralları (ADR-0014 Karar 3, S3 + S7) — KAYNAK düzeyi (derleme gerektirmez):
 *  - her sahne için CSS kuralı ve bileşen kancası (`data-scene`/`data-part`) var
 *  - reduced-motion: tüm animasyon bildirimleri `@media (prefers-reduced-motion: no-preference)` içinde ve
 *    `html[data-motion='play']` koşullu → reduce / durdurulmuş / JS'siz durumda sahneler statik son durumda
 *  - giriş (reveal) sahneleri: `scene-*` keyframes yalnızca `from` (varış = statik son durum); süreler token
 *  - döngüsel (ambient) sahneler (`loop-*`, scenes-loops.css): yalnızca opacity/translate/scale; `paused` başlar ve yalnızca
 *    `data-visible='true'` iken çalışır; süre token (6/12/30 sn)
 *  - sahne süreleri bağlayıcı sınırlar içinde (giriş 400–900 ms, stagger <= 80 ms, toplam <= 1,6 sn; döngü 6–30 sn)
 *  - durdurma kontrolü ve yürütücü: erişilebilirlik sözleşmesi (aria-pressed, localStorage try/catch, çerez yok)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(siteRoot, 'src')
const read = (p: string) => readFileSync(path.join(src, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const enterCss = stripComments(read('styles/scenes.css'))
const loopsCss = stripComments(read('styles/scenes-loops.css'))
const scenesCss = `${enterCss}\n${loopsCss}`
const siteTokens = stripComments(read('styles/site-tokens.css'))
const scenesTs = read('scripts/scenes.ts')
const toggle = read('components/MotionToggle.astro')

/** Giriş (reveal) sahneleri ve barındıran bileşen. `null` = yalnızca genel `[data-reveal]` kuralını kullanır. */
const ENTER_SCENES: Record<string, string> = {
  'hero-mock': 'components/home/Hero.astro',
  'problem-solution': 'components/home/ProblemSolution.astro',
  'stock-single-winner': 'components/home/Capabilities.astro',
  'orders-merge': 'components/home/Capabilities.astro',
  'integration-status': 'components/home/Capabilities.astro',
  'secret-encryption': 'components/home/Capabilities.astro',
  'tenant-isolation': 'components/home/Capabilities.astro',
  'story-step': 'components/home/OrderStory.astro',
  'how-progress': 'components/home/HowItWorks.astro',
  'request-guard': 'components/home/SecuritySummary.astro',
  'price-emphasis': 'components/home/PricingSummary.astro',
}
/** Genel `[data-reveal]` girişini kullanan sahneler (kendi CSS kuralı yok). */
const GENERIC_SCENES: Record<string, string> = {
  'section-head': 'components/home/SectionHeading.astro',
  reveal: 'components/home/IntegrationShowcase.astro',
  tile: 'components/home/Capabilities.astro',
  'stat-counters': 'components/home/Proof.astro',
  'cta-reveal': 'components/home/ClosingCta.astro',
}
/** Yalnızca döngüsel (ambient) sahneler. */
const LOOP_SCENES: Record<string, string> = {
  'hero-bg': 'components/home/Hero.astro',
  marquee: 'components/home/Proof.astro',
  // S18: /asistan hero'su — örnek senaryo sohbeti (30 sn tek zaman çizelgesi; statik hâl = tüm diyalog + onay bekliyor)
  'assistant-chat': 'components/assistant/ChatScene.astro',
  // S22: ajan sayfası — konsol durum ışıması + tarama ışığı; ajan döngüsü iz ışığı + düğüm vurgusu
  'agent-console': 'components/assistant/AgentConsole.astro',
  'agent-loop': 'components/assistant/AgentLoop.astro',
}
const ALL_SCENES = { ...ENTER_SCENES, ...GENERIC_SCENES, ...LOOP_SCENES }

const NO_PREF = '@media (prefers-reduced-motion: no-preference) {'

/** Dengeli süslü parantez bloğunu (açılıştan sonra) döndürür. */
function balancedBlock(css: string, startIndex: number): string {
  let depth = 0
  for (let i = startIndex; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(startIndex + 1, i)
    }
  }
  throw new Error('dengesiz blok')
}

/** Bir CSS dosyasını `no-preference` gövdesi ve dışı olarak böler. */
function split(css: string) {
  const start = css.indexOf(NO_PREF)
  const body = balancedBlock(css, start + NO_PREF.length - 1)
  const outside = css.slice(0, start) + css.slice(start + NO_PREF.length + body.length + 1)
  return { start, body, outside }
}
const enter = split(enterCss)
const loops = split(loopsCss)
const noPrefBody = `${enter.body}\n${loops.body}`

const toMs = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000)
const tokenMs = (name: string): number => {
  const m = siteTokens.match(new RegExp(`${name}:\\s*([\\d.]+m?s)\\s*;`))
  if (m) return toMs(m[1])
  // türetilmiş token: `calc(var(--x) * N)` veya `var(--x)`
  const d = siteTokens.match(new RegExp(`${name}:\\s*(?:calc\\(var\\((--[\\w-]+)\\)\\s*\\*\\s*(\\d+)\\)|var\\((--[\\w-]+)\\))\\s*;`))
  if (!d) throw new Error(`${name} tanımlı değil`)
  return d[1] ? tokenMs(d[1]) * Number(d[2]) : tokenMs(d[3])
}

const rulesOf = (body: string) => [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
const keyframesOf = (body: string) =>
  [...body.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => ({
    name: m[1],
    body: balancedBlock(body, m.index! + m[0].length - 1),
  }))

describe('sahne kapsamı', () => {
  it.each(Object.keys(ENTER_SCENES).concat(Object.keys(LOOP_SCENES)))('%s: CSS kuralı ve bileşen kancası var', (scene) => {
    expect(scenesCss).toContain(`[data-scene='${scene}']`)
    expect(read(ALL_SCENES[scene])).toContain(`data-scene="${scene}"`)
  })

  it.each(Object.keys(GENERIC_SCENES))('%s: genel [data-reveal] girişi + bileşen kancası var', (scene) => {
    expect(read(GENERIC_SCENES[scene])).toContain(`data-scene="${scene}"`)
    expect(read(GENERIC_SCENES[scene])).toContain('data-reveal')
  })

  it("genel giriş kuralı: [data-scene] [data-reveal] hazır pozu ve yükselme animasyonu var", () => {
    expect(enterCss).toMatch(/html\[data-motion='play'\] \[data-scene\]\[data-state='ready'\] \[data-reveal\]\s*\{\s*opacity:\s*0/)
    expect(enterCss).toMatch(/\[data-state='play'\] \[data-reveal\]\s*\{[^}]*animation:\s*scene-rise/)
  })

  it("yer tutucu kancaları (data-part) CSS ile bileşenler arasında tutarlı: CSS'in hedeflediği her data-part bir bileşende var", () => {
    const parts = new Set([...scenesCss.matchAll(/data-part='([\w-]+)'/g)].map((m) => m[1]))
    expect(parts.size).toBeGreaterThan(30)
    const all = [...new Set(Object.values(ALL_SCENES))].map((c) => read(c)).join('\n')
    for (const p of parts) expect(all, `data-part="${p}"`).toMatch(new RegExp(`data-part=["']${p}["']|data-part="\\$\\{|data-part=\\{`))
  })
})

describe('reduced-motion ve durdurma: animasyon yalnızca oynatma durumunda çalışır', () => {
  it("animasyon/keyframes bildirimi `no-preference` bloğunun DIŞINDA yok (iki dosyada da)", () => {
    for (const s of [enter, loops]) {
      expect(s.start).toBeGreaterThanOrEqual(0)
      expect(s.outside).not.toMatch(/@keyframes|animation\s*:|animation-name|transition\s*:/)
      expect(s.body).toContain('@keyframes')
    }
  })

  it("her animasyon veren kural `html[data-motion='play']` ister (durdurulmuş/reduced/JS'siz → statik son durum)", () => {
    const rules = rulesOf(noPrefBody)
    const animating = rules.filter((r) => /animation(?:-name)?\s*:/.test(r.body) && !/animation\s*:\s*none/.test(r.body))
    expect(animating.length).toBeGreaterThanOrEqual(40)
    for (const r of animating) expect(r.selector, r.selector).toContain("html[data-motion='play']")
    // başlangıç pozu (opacity 0) yalnızca oynatma durumunda ve `ready` iken uygulanır
    const poses = rules.filter((r) => /opacity\s*:\s*0\s*;?/.test(r.body) && r.selector.includes("[data-state='ready']"))
    for (const r of poses) expect(r.selector, r.selector).toContain("html[data-motion='play']")
    // her giriş sahnesinin bir başlangıç pozu vardır
    for (const scene of Object.keys(ENTER_SCENES)) {
      expect(poses.some((r) => r.selector.includes(`[data-scene='${scene}']`)), scene).toBe(true)
    }
  })

  it("döngüsel (ortam) akış: her sonsuz animasyon `paused` başlar; yalnızca data-visible=true iken running", () => {
    const rules = rulesOf(loops.body)
    const infinite = rules.filter((r) => /animation(?:-iteration-count)?\s*:[^;]*infinite/.test(r.body))
    expect(infinite.length).toBeGreaterThanOrEqual(4)
    for (const r of infinite) expect(r.body, r.selector).toMatch(/\bpaused\b/)
    const running = rules.filter((r) => /animation-play-state:\s*running/.test(r.body))
    expect(running.length).toBeGreaterThanOrEqual(4)
    for (const r of running) expect(r.selector, r.selector).toContain("[data-visible='true']")
    // giriş dosyasında sonsuz animasyon yok
    expect(enter.body).not.toMatch(/infinite/)
  })

  it('sekme gizliyken sahne animasyonları durur', () => {
    expect(noPrefBody).toMatch(/html\[data-tab='hidden'\][^{}]*\{[^{}]*animation-play-state:\s*paused\s*!important/)
  })

  it('scroll-jacking / scroll-bağlı animasyon yok', () => {
    expect(scenesCss).not.toMatch(/animation-timeline|scroll-snap|position:\s*sticky/)
    expect(scenesTs).not.toMatch(/addEventListener\(\s*['"](?:wheel|scroll|touchmove)/)
    expect(scenesTs).not.toMatch(/scrollTo|scrollBy|preventDefault/)
  })
})

describe('yalnızca transform/opacity sınıfı animasyon, token süreleri', () => {
  const enterKf = keyframesOf(enter.body)
  const loopKf = keyframesOf(loops.body)

  it('keyframes: yalnızca opacity, translate, scale özellikleri (layout/paint özelliği yok)', () => {
    expect(enterKf.length).toBeGreaterThanOrEqual(6)
    expect(loopKf.length).toBeGreaterThanOrEqual(15)
    for (const k of [...enterKf, ...loopKf]) {
      const props = [...k.body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1])
      for (const p of props) expect(['opacity', 'translate', 'scale'], `${k.name}: ${p}`).toContain(p)
    }
  })

  it('giriş `scene-*` keyframes yalnızca `from` tanımlar (varış = statik son durum)', () => {
    for (const k of enterKf) {
      expect(k.name, k.name).toMatch(/^scene-/)
      expect(k.body, k.name).toMatch(/\bfrom\b/)
      expect(k.body, k.name).not.toMatch(/\bto\b\s*\{|\d+%/)
    }
  })

  it("döngü `loop-*` keyframes tam döngüyü (yüzdelerle) tanımlar", () => {
    for (const k of loopKf) {
      expect(k.name, k.name).toMatch(/^loop-/)
      expect(k.body, k.name).toMatch(/\d+(?:\.\d+)?%|\bto\b/)
    }
  })

  it('animasyon süreleri ve gecikmeleri token: ham süre yok', () => {
    for (const m of noPrefBody.matchAll(/animation(?:-delay|-duration)?\s*:([^;]+);/g)) {
      expect(m[1], m[0]).not.toMatch(/(?<![\w.-])\d+(?:\.\d+)?m?s\b/)
    }
    for (const m of enter.body.matchAll(/animation\s*:\s*([\w-]+)\s+(var\([^)]+\))/g)) {
      expect(m[2], m[0]).toMatch(/var\(--site-motion-duration-reveal(?:-sm|-lg)?\)/)
    }
    for (const m of loops.body.matchAll(/animation(?:-duration)?\s*:\s*(?:[\w-]+\s+)?(var\(--site-motion-[\w-]+\))/g)) {
      expect(m[1], m[0]).toMatch(/var\(--site-motion-(?:loop-scene|loop-marquee|ambient-fast)\)/)
    }
  })

  it('animasyon adları yasaklı "lunapark" listesinde değil', () => {
    for (const k of [...enterKf, ...loopKf]) expect(k.name).not.toMatch(/bounce|pulse|wobble|shake|jelly|elastic|swing|tada|flip/i)
  })
})

describe('sahne süreleri bağlayıcı sınırlar içinde (ADR-0014 Karar 3)', () => {
  const stagger = tokenMs('--site-motion-stagger')
  const sm = tokenMs('--site-motion-duration-reveal-sm')
  const reveal = tokenMs('--site-motion-duration-reveal')
  const lg = tokenMs('--site-motion-duration-reveal-lg')
  const maxScene = tokenMs('--site-motion-scene-max')
  const DURATION: Record<string, number> = { '--site-motion-duration-reveal-sm': sm, '--site-motion-duration-reveal': reveal, '--site-motion-duration-reveal-lg': lg }

  /** `calc(var(--site-motion-stagger) * (var(--i) + 3))` gibi ifadeyi sahne başına en büyük değişken değerleriyle hesaplar. */
  function delayMs(expr: string, vars: Record<string, number>): number {
    let e = expr.trim()
    e = e.replace(/^calc\(/, '(').replace(/var\(--site-motion-stagger\)/g, String(stagger))
    e = e.replace(/var\(--site-motion-duration-reveal-sm\)/g, String(sm)).replace(/var\(--site-motion-duration-reveal\)/g, String(reveal))
    e = e.replace(/var\(--(\w+)\)/g, (_m, v: string) => String(vars[v] ?? 0))
    if (!/^[\d\s+*().-]+$/.test(e)) throw new Error(`hesaplanamayan gecikme: ${expr} -> ${e}`)
    return Function(`"use strict"; return (${e})`)() as number
  }

  /** Bir giriş sahnesinin en geç bitiş zamanı (ms): en büyük gecikme + o kuraldaki süre. */
  function sceneEnd(scene: string): number {
    const rules = rulesOf(enter.body)
    const forScene = rules.filter((r) => r.selector.includes(`[data-scene='${scene}']`))
    const vars: Record<string, number> = {}
    for (const r of forScene) for (const m of r.body.matchAll(/--([ijkd])\s*:\s*(\d+)/g)) vars[m[1]] = Math.max(vars[m[1]] ?? 0, Number(m[2]))
    let end = 0
    for (const r of forScene) {
      const anim = r.body.match(/animation\s*:\s*[\w-]+\s+var\(([^)]+)\)/)
      if (!anim) continue
      const delay = r.body.match(/animation-delay\s*:\s*([^;]+);/)
      end = Math.max(end, (delay ? delayMs(delay[1], vars) : 0) + DURATION[anim[1]])
    }
    return end
  }

  it('token ön koşulları: stagger 80 ms, sahne üst sınırı 1,6 sn, giriş 400–900 ms', () => {
    expect(stagger).toBeLessThanOrEqual(80)
    expect(maxScene).toBeLessThanOrEqual(1600)
    expect(sm).toBeGreaterThanOrEqual(400)
    expect(lg).toBeLessThanOrEqual(900)
  })

  it.each(Object.keys(ENTER_SCENES))('%s: giriş sahnesi toplam süresi <= 1,6 sn', (scene) => {
    const end = sceneEnd(scene)
    expect(end).toBeGreaterThan(0)
    expect(end).toBeLessThanOrEqual(maxScene)
  })

  it('genel [data-reveal] girişi: en kötü durum (12. öğe) <= 1,6 sn', () => {
    expect(11 * stagger + reveal).toBeLessThanOrEqual(maxScene)
  })

  it('döngü süreleri 6–30 sn: senaryo 12 sn, ışın 6 sn, şerit/ışıma/hero show 30 sn', () => {
    for (const name of ['--site-motion-ambient-fast', '--site-motion-loop-scene', '--site-motion-loop-marquee']) {
      const ms = tokenMs(name)
      expect(ms, name).toBeGreaterThanOrEqual(6000)
      expect(ms, name).toBeLessThanOrEqual(30000)
    }
    // S13: hero show merkezi 30 sn'de dört sahne (dilim başına 7,5 sn); 12 sn senaryo token'ı diğer sahnelerde sürer
    expect(loops.body).toMatch(/animation-duration:\s*var\(--site-motion-loop-marquee\)/)
    expect(loops.body).toMatch(/var\(--site-motion-loop-scene\)/)
    expect(loops.body).toMatch(/animation:\s*loop-marquee var\(--site-motion-loop-marquee\)/)
  })
})

describe('durdurma kontrolü ve yürütücü (WCAG 2.2.2)', () => {
  it('kontrol: <button type="button">, aria-pressed, sabit ad, 44 px hedef, JS\'siz gizli, reduced-motion\'da gösterilmez', () => {
    expect(toggle).toMatch(/<button[^>]*type="button"[^>]*data-motion-toggle|<button[^>]*data-motion-toggle[^>]*type="button"/)
    expect(toggle).toContain('aria-pressed="false"')
    expect(toggle).toContain('Hareketi durdur')
    expect(toggle).toMatch(/min-height:\s*var\(--site-tap-target\)/)
    expect(toggle).toMatch(/min-width:\s*var\(--site-tap-target\)/)
    expect(toggle).toMatch(/html:not\(\[data-motion\]\)[^{]*\{\s*visibility:\s*hidden/)
    expect(toggle).toMatch(/prefers-reduced-motion:\s*reduce\)\s*\{\s*\.motion-toggle\s*\{\s*display:\s*none/)
  })

  it('kontrol header\'a SIĞAR: S24\'ten beri her genişlikte yalnızca simge (görünür etiket yok); ad sabit', () => {
    expect(toggle).not.toMatch(/motion-toggle__label\s*\{\s*display:\s*inline/)
    expect(toggle).toMatch(/\.motion-toggle__label\s*\{\s*display:\s*none/)
    expect(toggle).not.toMatch(/margin-inline-start:\s*auto[\s\S]*flex:\s*1/)
    // görünür etiket ("Hareket") erişilebilir adın ("Hareketi durdur") içinde geçer (WCAG 2.5.3)
    expect('Hareketi durdur').toContain('Hareket')
    expect(toggle).toMatch(/motion-toggle__label" aria-hidden="true">Hareket</)
  })

  it("yürütücü: IntersectionObserver, localStorage yalnızca try/catch içinde, çerez yok, data-motion durumları", () => {
    expect(scenesTs).toContain('IntersectionObserver')
    expect(scenesTs).not.toContain('document.cookie')
    for (const m of scenesTs.matchAll(/localStorage\.(?:getItem|setItem|removeItem)/g)) {
      const before = scenesTs.slice(0, m.index!)
      expect(before.lastIndexOf('try {'), 'localStorage try içinde').toBeGreaterThan(before.lastIndexOf('}\n\n'))
    }
    expect(scenesTs).toContain("'aria-pressed'")
    for (const state of ["'play'", "'paused'", "'reduced'"]) expect(scenesTs).toContain(state)
    expect(scenesTs).toContain('prefers-reduced-motion: reduce')
    expect(scenesTs).toMatch(/dataset\.visible/)
  })

  it('sayaç: hareket kapalıyken son değer statik yazılır (finishCount); sayı kaynağı data-count', () => {
    expect(scenesTs).toMatch(/finishCount/)
    expect(scenesTs).toMatch(/dataset\.count/)
    expect(scenesTs).toMatch(/requestAnimationFrame/)
  })

  it("kontrol yalnızca sahneli sayfada: BaseLayout `scenes` prop'u -> Header `motionControl`; ana sayfa açar", () => {
    expect(read('layouts/BaseLayout.astro')).toMatch(/<Header motionControl=\{scenes\}/)
    expect(read('components/Header.astro')).toMatch(/\{motionControl && <MotionToggle \/>\}/)
    expect(read('pages/index.astro')).toMatch(/<BaseLayout\s+scenes\b/)
  })
})

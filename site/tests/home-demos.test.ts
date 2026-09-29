/**
 * S13 (parça B) — "Nasıl çalışır" örnek görünüm demoları ve ekosistem şeması: bileşen içi hareket kuralları
 * KAYNAK düzeyinde (derleme gerektirmez). scenes.test.ts'in styles/* için koyduğu sözleşmenin bileşen karşılığı:
 *  - animasyon/keyframes yalnızca `@media (prefers-reduced-motion: no-preference)` içinde
 *  - her animasyon veren kural `html[data-motion='play']` ister (durdurulmuş/reduced/JS'siz → statik son durum)
 *  - keyframes yalnızca opacity/translate/scale/rotate
 *  - sonsuz döngüler `paused` başlar; yalnızca görünürken (`data-live`/`data-visible`) running
 *  - demo betiği yalnızca durum üretir; hareket tercihine ve sekme durumuna uyar; kanal adı yok
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const read = (p: string) => readFileSync(path.join(src, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const NO_PREF = '@media (prefers-reduced-motion: no-preference) {'

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
const styleOf = (file: string) => stripComments(read(file).match(/<style>([\s\S]*?)<\/style>/)![1])
const scriptOf = (file: string) => read(file).match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
/** Tüm `no-preference` bloklarını birleştirir (bir bileşende birden fazla olabilir); dışarıda kalan = statik CSS. */
function split(css: string) {
  const start = css.indexOf(NO_PREF)
  let body = ''
  let outside = ''
  let from = 0
  for (let i = start; i >= 0; i = css.indexOf(NO_PREF, from)) {
    const b = balancedBlock(css, i + NO_PREF.length - 1)
    outside += css.slice(from, i)
    body += `${b}\n`
    from = i + NO_PREF.length + b.length + 1
  }
  outside += css.slice(from)
  return { start, body, outside }
}
const rulesOf = (body: string) => [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
const keyframesOf = (body: string) =>
  [...body.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => ({ name: m[1], body: balancedBlock(body, m.index! + m[0].length - 1) }))

const FILES = {
  how: 'components/home/HowItWorks.astro',
  eco: 'components/home/IntegrationShowcase.astro',
  caps: 'components/home/Capabilities.astro',
} as const

describe.each(Object.entries(FILES))('%s: bileşen içi hareket sözleşmesi', (_key, file) => {
  const css = styleOf(file)
  const { start, body, outside } = split(css)

  it('animasyon/keyframes/geçiş-animasyonu yalnızca no-preference bloğunda', () => {
    expect(start).toBeGreaterThanOrEqual(0)
    expect(outside).not.toMatch(/@keyframes/)
    // hover vurgusunda döngüyü kapatmak (`animation: none`) serbesttir; başka animasyon bildirimi yok
    for (const m of outside.matchAll(/animation(?:-name)?\s*:\s*([^;]+);/g)) expect(m[1].trim(), m[0]).toBe('none')
  })

  it("her animasyon veren kural `html[data-motion='play']` ister", () => {
    const animating = rulesOf(body).filter((r) => /animation(?:-name)?\s*:/.test(r.body) && !/animation\s*:\s*none/.test(r.body))
    expect(animating.length).toBeGreaterThanOrEqual(8)
    for (const r of animating) expect(r.selector, r.selector).toContain("html[data-motion='play']")
  })

  it('keyframes yalnızca opacity/translate/scale/rotate; yasaklı ad yok', () => {
    const kfs = keyframesOf(body)
    expect(kfs.length).toBeGreaterThanOrEqual(4)
    for (const k of kfs) {
      for (const p of [...k.body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1])) {
        expect(['opacity', 'translate', 'scale', 'rotate'], `${k.name}: ${p}`).toContain(p)
      }
      expect(k.name).not.toMatch(/bounce|pulse|wobble|shake|jelly|elastic|swing|tada|flip/i)
    }
  })

  it('sonsuz döngüler paused başlar, yalnızca görünürken running olur', () => {
    const rules = rulesOf(body)
    const infinite = rules.filter((r) => /animation\s*:[^;]*infinite/.test(r.body))
    expect(infinite.length).toBeGreaterThanOrEqual(2)
    for (const r of infinite) expect(r.body, r.selector).toMatch(/\bpaused\b/)
    const running = rules.filter((r) => /animation-play-state:\s*running/.test(r.body))
    expect(running.length).toBeGreaterThanOrEqual(1)
    for (const r of running) expect(r.selector, r.selector).toMatch(/\[data-live='true'\]|\[data-visible='true'\]/)
  })

  it('süreler token: animasyon satırlarında ham ms/s yok', () => {
    for (const m of body.matchAll(/animation(?:-delay|-duration)?\s*:([^;]+);/g)) {
      expect(m[1], m[0]).not.toMatch(/(?<![\w.-])\d+(?:\.\d+)?m?s\b/)
    }
  })
})

describe('Nasıl çalışır: vuruş tabanlı demo', () => {
  const html = read(FILES.how)
  const script = scriptOf(FILES.how)
  const css = styleOf(FILES.how)

  it('dört demo (hesap, kanal, ürün, panel) ve sağdan kayan ekran girişi korunur', () => {
    for (const key of ['account', 'connect', 'import', 'manage']) expect(html).toContain(`key: '${key}'`)
    expect(html).toMatch(/data-demo=\{s\.key\}\s+data-beats=\{s\.beats\}/)
    expect(css).toMatch(/\[data-state='play'\] \.how__visual\s*\{\s*animation:\s*how-screen-in/)
  })

  it('başlangıç pozu yalnızca `data-demo-on` varken; statik (varsayılan) hâl tamamlanmış son durumdur', () => {
    const { body, outside } = split(css)
    // demo kancaları no-preference dışında hiç kullanılmaz → hareket kapalıyken son durum
    expect(outside).not.toMatch(/data-demo-on|data-b\d|data-rewind/)
    for (const r of rulesOf(body).filter((x) => /opacity:\s*0\s*;/.test(x.body) && /data-b\d/.test(x.selector))) {
      expect(r.selector, r.selector).toMatch(/\[data-demo-on\]:not\(\[data-b\d\]\)/)
    }
    // uçan kart statikte görünmez; çubuk/onay statikte dolu/görünür
    expect(outside).toMatch(/\.flier\s*\{[^}]*opacity:\s*0/)
    expect(outside).not.toMatch(/\.ship__fill\s*\{[^}]*(opacity:\s*0|scale:\s*0)/)
  })

  it('betik: yalnızca durum üretir, hareket tercihi + sekme + görünürlük koşullu, token süresi', () => {
    expect(script).toContain('IntersectionObserver')
    expect(script).toContain("root.dataset.motion === 'play'")
    expect(script).toContain("root.dataset.tab !== 'hidden'")
    expect(script).toContain("removeAttribute('data-demo-on')")
    expect(script).toContain('--site-motion-duration-reveal')
    expect(script).toMatch(/attributeFilter:\s*\['data-motion', 'data-tab'\]/)
    expect(script).not.toMatch(/innerHTML|textContent\s*=|addEventListener\(\s*['"](?:scroll|wheel)/)
    expect(script).not.toMatch(/localStorage|document\.cookie/)
  })
})

describe('Ekosistem: iki yönlü akış, sıralı ışıma, hover vurgusu', () => {
  const html = read(FILES.eco)
  const css = styleOf(FILES.eco)

  it('her hatta düğümden merkeze (kanal renginde) ve merkezden düğüme paket; dört hat ışını', () => {
    expect(html).toMatch(/eco__packet eco__packet--in" data-code=\{l\.code\}/)
    expect(html).toMatch(/eco__packet eco__packet--out"/)
    for (const slot of ['tl', 'tr', 'bl', 'br']) expect(html).toContain(`eco__beam eco__beam--${slot}`)
  })

  it('sıralı ışıma: ışın, giden paket ve düğüm halkası aynı çeyrek faz (--k) ile gecikir', () => {
    const { body } = split(css)
    for (const cls of ['eco__beam', 'eco__packet--out', 'eco__lit']) {
      const r = rulesOf(body).find((x) => x.selector.includes(cls) && /animation-delay/.test(x.body))
      expect(r, cls).toBeDefined()
      expect(r!.body, cls).toMatch(/var\(--k, 0\) \/ 4/)
    }
  })

  it('hover: yalnızca üzerine gelinen düğümün hattı/şeridi tam görünür (:has, JS yok)', () => {
    for (const slot of ['tl', 'tr', 'bl', 'br']) {
      expect(css).toContain(`.eco:has(.eco__node--${slot}:hover) :is(.eco__wire--${slot}, .eco__lane--${slot})`)
    }
    expect(css).toMatch(/\.eco:has\(\.eco__node:hover\) \.eco__lane\s*\{\s*opacity:\s*0\.25/)
  })

  it('yörünge noktaları isimsiz: yalnızca data-code (kanal adı metni yok)', () => {
    expect(html).toMatch(/<i class="eco__sat" data-code=\{code\}><\/i>/)
    expect(html).not.toMatch(/\.name\b/)
  })
})

describe('S15-C: "Örnek görünüm" etiketi yok; görseller aria-hidden (anlam çevredeki metinde)', () => {
  it.each(Object.values(FILES))('%s: görünür etiket metni yok', (file) => {
    const markup = read(file).split('<style>')[0].replace(/\/\*[\s\S]*?\*\//g, '')
    expect(markup).not.toMatch(/Örnek görünüm|örnek görünüm/)
  })

  it('bento/stok görsellerinin kökleri aria-hidden kalır', () => {
    const html = read(FILES.caps)
    for (const scene of ['stock-single-winner', 'orders-merge', 'integration-status', 'secret-encryption', 'tenant-isolation']) {
      expect(html, scene).toMatch(new RegExp(`data-scene="${scene}" aria-hidden="true"`))
    }
  })
})

describe('S15-C: stok rezervasyonu anlatısı (eşzamanlı iki sipariş -> biri rezerve, diğeri aşırı satış)', () => {
  const html = read(FILES.caps)
  const css = styleOf(FILES.caps)
  const { body, outside } = split(css)

  it('scenes.css giriş kancaları korunur; iki giriş hattı + iki çıkış hattı ve ışık taşıyıcıları var', () => {
    for (const part of ['order-a', 'order-b', 'arrow-a', 'product', 'arrow-b', 'left-a', 'left-b', 'result-ok', 'result-oversold']) {
      expect(html, part).toContain(`data-part="${part}"`)
    }
    for (const c of ['a', 'b', 'ok', 'warn']) expect(html).toContain(`stock__carrier stock__carrier--${c}`)
    expect(html).toContain('Rezerve edildi')
    expect(html).toContain('Aşırı satış olarak işaretlendi')
  })

  it('statik son durum: kalan 0, döngü öğeleri (ışık, parlama, "1") hareket kapalıyken görünmez', () => {
    expect(outside).toMatch(/\.stock__left-a,\s*\.stock__one\s*\{\s*opacity:\s*0/)
    expect(outside).toMatch(/\.stock__pulse\s*\{[^}]*opacity:\s*0/)
    expect(outside).toMatch(/\.stock__flash\s*\{[^}]*opacity:\s*0/)
    expect(outside).not.toMatch(/\.stock__zero\s*\{[^}]*opacity:\s*0/)
  })

  it('iki sipariş ışığı AYNI fazda (eşzamanlı); başarı hattı uyarı hattından önce', () => {
    const phase = (sel: string) => Number(body.match(new RegExp(`${sel}[^{]*\\{\\s*--p:\\s*([\\d.]+)`))![1])
    expect(body).toMatch(/\.stock__carrier--a,\s*\.stock__carrier--b\s*\{\s*--p:/)
    expect(phase('\\.stock__carrier--ok')).toBeLessThan(phase('\\.stock__carrier--warn'))
    expect(phase('\\.stock__result--ok')).toBeLessThan(phase('\\.stock__result--warn'))
  })
})

describe('S15-C: ekosistem düğümlerinin iç hareketi (yörünge korunur)', () => {
  const html = read(FILES.eco)
  const { body } = split(styleOf(FILES.eco))

  it('yörünge noktaları ve dönüşü korunur', () => {
    expect(html).toContain('eco__orbit eco__orbit--outer')
    expect(body).toMatch(/\.eco__orbit--outer\s*\{\s*animation:\s*eco-orbit/)
  })

  it('düğüm içi: ikon uyanışı, kanal noktası nabzı ve akış çizgisi düğümün çeyrek fazına (--k) bağlı', () => {
    expect(html).toContain('<span class="eco__flow"><span class="eco__stream"></span></span>')
    for (const sel of ['.eco__icon', '.eco__dots > i', '.eco__stream']) {
      const r = rulesOf(body).find((x) => x.selector.includes(sel) && /animation-delay/.test(x.body))
      expect(r, sel).toBeDefined()
      expect(r!.body, sel).toMatch(/var\(--k, 0\) \/ 4/)
    }
  })
})

// FR3 madde 7 (fe-r3a) — HAREKET TEK KAYNAK bekçisi. Kullanıcı (FE_FEEDBACK_R3): "TÜM geçişler tek kaynaktan (motion
// token'ları) ve tutarlı hızda; ör. ürün ekle → kategori seçiminde seviyeler filtre paneli açılma hızıyla aynı olmalı.
// Dağınık süre/easing değerleri kalmasın."
//
// Kurallar (ayrıntı: frontend/docs/FR3_PATTERNS.md §1):
//  1. CSS'te geçiş/animasyon bildirimlerinde ve özel değişkenlerde LİTERAL süre (0 hariç), eğri anahtar kelimesi
//     (ease*, linear) ve cubic-bezier YOK. Tek istisna token katmanı (`packages/ui/src/styles/app.css`, `tokens/dist`).
//  2. Bileşenler süre/eğri SEÇMEZ, ROL seçer: `--ek-motion-<feedback|reveal|dismiss|overlay|layout>` (+ `-duration`,
//     `-easing`), `--ek-motion-stagger`, döngüde `--ek-motion-loop-*` + `--ek-easing-standard|linear`. Ham ölçek token'ı
//     (`--ek-duration-*`, döngü dışı `--ek-easing-*`) yalnız ratchet listesindeki (paralel görevlerin) dosyalarda, sayı
//     ARTAMAZ.
//  3. Script'te ham eğri/`cubic-bezier` yok; Web Animations (`.animate(`) çağıran dosya `@entegrasyonik/ui/motion` kullanır.
//  4. Vuetify'ın her adlandırılmış geçişi `vuetify-overrides.css`'te rollere bağlı (yeni Vuetify geçişi → test düşer).
//  5. Rol tablosu: süreler 150–300ms ölçeğinden, eğriler ease-in-out/ease-out (sıçrama yok).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { duration, easing, motionLoop, motionRole } from '../packages/ui/src/tokens/scale'

const FE = join(__dirname, '..')
const posix = (p: string) => p.split(sep).join('/')
const ROOTS = ['src', 'packages/ui/src', 'packages/chat/src']
/** Token katmanı: kök değerleri burada tanımlanır (reduced-motion kökü dahil). */
const TOKEN_LAYER = new Set(['packages/ui/src/styles/app.css'])

/**
 * Ratchet — paralel FR3 görevlerinin (fe-r3b ekranları, fe-r3c çıktılar) dosyaları: çakışma olmasın diye bu dalda
 * role GÖÇ ETTİRİLMEDİ; o görevler dosyaya dokunduğunda rollere geçer ve sayı düşer. Sayı ARTAMAZ, yeni dosya EKLENEMEZ.
 */
const PRIMITIVE_RATCHET: Record<string, number> = {
  'src/views/secure/PrintoutListView.vue': 6,
  'src/views/secure/SettingListView.vue': 6,
  'src/views/secure/productDefinitions/ProductListView.vue': 4,
  'src/components/productDefinitions/products/ProductChannelStatus.vue': 6,
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(join(FE, r))).map((abs) => ({ abs, rel: posix(relative(FE, abs)) }))
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function styleOf(rel: string, text: string): string {
  if (rel.endsWith('.css')) return stripComments(text)
  if (!rel.endsWith('.vue')) return ''
  return stripComments([...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'))
}

function scriptOf(rel: string, text: string): string {
  if (/\.(ts|js|mts)$/.test(rel)) return text
  if (!rel.endsWith('.vue')) return ''
  return [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
}

/** Hareketle ilgili bildirimler: transition*, animation*, ve değeri hareket içeren özel değişkenler. */
function motionDeclarations(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/(?:^|[;{\s])((?:transition|animation)(?:-[a-z-]+)?|--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    const [prop, value] = [m[1], m[2].trim()]
    if (prop.startsWith('--') && !/\d(?:ms|s)\b|ease|linear|cubic-bezier|--ek-(?:duration|easing|motion)-/.test(value)) continue
    if (prop === 'transition-property') continue
    out.push(`${prop}: ${value}`)
  }
  return out
}

const TIME_LITERAL = /(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/g
const EASING_KEYWORD = /(?<![\w-])(ease(?:-in-out|-in|-out)?|linear)(?![\w-])/

function literalProblems(decl: string): string[] {
  const problems: string[] = []
  for (const m of decl.matchAll(TIME_LITERAL)) if (parseFloat(m[1]) !== 0) problems.push(`süre literali ${m[0]}`)
  if (EASING_KEYWORD.test(decl.replace(/var\([^)]*\)/g, ''))) problems.push('eğri anahtar kelimesi')
  if (/cubic-bezier\(/.test(decl)) problems.push('cubic-bezier')
  return problems
}

/** Ham ölçek token'ı: `--ek-duration-*` her zaman; `--ek-easing-*` yalnız döngü (`--ek-motion-loop-*`) dışında. */
function primitiveCount(decl: string): number {
  if (/^--ek-(?:motion|duration|easing)-/.test(decl)) return 0 // rol tanımı (yalnız token katmanında olur)
  const durations = (decl.match(/var\(--ek-duration-[a-z]+\)/g) ?? []).length
  const easings = /--ek-motion-loop-/.test(decl) ? 0 : (decl.match(/var\(--ek-easing-(?:standard|enter)\)/g) ?? []).length
  return durations + easings
}

describe('FR3 madde 7 — hareket tek kaynak', () => {
  it('rol tablosu: süreler 150–300ms ölçeğinden, eğriler yalnız ease-in-out / ease-out', () => {
    expect(Object.values(duration).every((ms) => ms >= 150 && ms <= 300)).toBe(true)
    expect(Object.values(easing).sort()).toEqual(['ease-in-out', 'ease-out'])
    for (const role of Object.values(motionRole)) {
      expect(duration[role.duration]).toBeDefined()
      expect(easing[role.easing]).toBeDefined()
    }
    // Çıkış girişten uzun olamaz; aç/kapa (reveal) ile katman girişi (overlay) aynı ölçek adımı.
    expect(duration[motionRole.dismiss.duration]).toBeLessThanOrEqual(duration[motionRole.overlay.duration])
    expect(motionRole.reveal.duration).toBe(motionRole.overlay.duration)
    expect(Object.values(motionLoop).every((ms) => ms >= 900)).toBe(true)
  })

  it('CSS: literal süre / eğri anahtar kelimesi / cubic-bezier yok (token katmanı hariç)', () => {
    const offenders: string[] = []
    for (const { abs, rel } of files) {
      if (TOKEN_LAYER.has(rel)) continue
      const css = styleOf(rel, readFileSync(abs, 'utf8'))
      for (const decl of motionDeclarations(css)) {
        const problems = literalProblems(decl)
        if (problems.length) offenders.push(`${rel} → ${decl} (${problems.join(', ')})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('CSS: bileşenler ROL kullanır — ham `--ek-duration-*` / döngü dışı `--ek-easing-*` yalnız ratchet dosyalarında, artmaz', () => {
    const counts: Record<string, number> = {}
    for (const { abs, rel } of files) {
      if (TOKEN_LAYER.has(rel)) continue
      const css = styleOf(rel, readFileSync(abs, 'utf8'))
      const n = motionDeclarations(css).reduce((sum, d) => sum + primitiveCount(d), 0)
      if (n) counts[rel] = n
    }
    const grew = Object.entries(counts).filter(([rel, n]) => n > (PRIMITIVE_RATCHET[rel] ?? 0))
    expect(grew).toEqual([])
  })

  it('script: ham eğri / cubic-bezier yok; `.animate(` çağıran dosya `@entegrasyonik/ui/motion` kullanır', () => {
    const offenders: string[] = []
    // EkToastHost: ilerleme çubuğu süresi = bildirimin otomatik kapanma süresi (sayaç, hareket rolü değil).
    const ANIMATE_ALLOW = new Set(['packages/ui/src/components/EkToastHost.vue'])
    for (const { abs, rel } of files) {
      if (rel === 'packages/ui/src/tokens/scale.ts' || rel === 'packages/ui/src/motion.ts') continue
      const js = scriptOf(rel, readFileSync(abs, 'utf8'))
      if (!js) continue
      if (/cubic-bezier\(/.test(js)) offenders.push(`${rel}: cubic-bezier`)
      if (/easing\s*:\s*['"`](?:ease|linear|cubic)/.test(js)) offenders.push(`${rel}: ham easing literali`)
      if (/\.animate\(\s*\[/.test(js) && !ANIMATE_ALLOW.has(rel) && !/@entegrasyonik\/ui\/motion|from '\.\.\/motion'|from '\.\/motion'/.test(js)) {
        offenders.push(`${rel}: .animate( hareket modülü olmadan`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('Vuetify: her adlandırılmış geçiş (enter/leave) rollere bağlı', () => {
    const vuetifyCss = readFileSync(join(FE, 'node_modules/vuetify/lib/styles/main.css'), 'utf8')
    const names = [...new Set([...vuetifyCss.matchAll(/\.([a-z0-9-]+-transition)-(?:enter|leave)-active/g)].map((m) => m[1]))]
    expect(names.length).toBeGreaterThan(10)
    const overrides = readFileSync(join(FE, 'packages/ui/src/styles/vuetify-overrides.css'), 'utf8')
    const missing = names.filter((n) => {
      if (n.startsWith('expand')) return !overrides.includes(`.${n}-enter-active`)
      return !overrides.includes(`.${n}-enter-active`) || !overrides.includes(`.${n}-leave-active`)
    })
    expect(missing).toEqual([])
  })

  it('FR3 örneği: filtre paneli (EkCollapse) = kategori seviyesi (EkCascadePicker) = menü grubu (EkSidebarNav) → `reveal`', () => {
    const read = (rel: string) => styleOf(rel, readFileSync(join(FE, rel), 'utf8'))
    const collapse = read('packages/ui/src/components/EkCollapse.vue')
    expect(collapse).toMatch(/grid-template-rows var\(--ek-motion-reveal\)/)
    const cascade = read('packages/ui/src/components/EkCascadePicker.vue')
    const colEnter = cascade.match(/\.ek-cascade-col-enter-active\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(colEnter).toMatch(/opacity var\(--ek-motion-reveal\)/)
    expect(colEnter).toMatch(/var\(--ek-motion-stagger\)/)
    const side = read('packages/ui/src/components/EkSidebarNav.vue')
    const subOpen = side.match(/\.ek-side__subwrap\.is-open\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(subOpen).toMatch(/grid-template-rows var\(--ek-motion-reveal\)/)
  })
})

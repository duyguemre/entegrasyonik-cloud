// BO-R2 (K59) sistem katmanı mandalları — BO_UI_PATTERNS §12.
//  1) TEK tipografi ölçeği (BO2-30): font-size yalnız `--ek-type-<rol>-size` / `--ek-icon-*` / inherit; font-weight yalnız
//     `--ek-type-<rol>-weight` ya da `--ek-font-weight-(regular|medium|semibold)` / inherit. Taban: 0 (ihlal yok).
//  2) Yerel kopya yasağı (BO2-02/20/40/41/50/60): sayfa başlığı, tablo, segment/filtre, sayfalama, yenile düğmesi, bölüm
//     başlığı ve grafik ortak bileşenden çizilir. Mevcut ihlaller AZALAN TABANDA (tests/r2-baseline.json): artış = hata,
//     azalış = tabanı düşürün (bo-r2b her sayfayı taşıdıkça taban küçülür). Taban yazmak: R2_BASELINE_WRITE=1 npx vitest run tests/r2-system.test.ts
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { typeRole } from '@entegrasyonik/ui/tokens'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')
const BASELINE_FILE = join(__dirname, 'r2-baseline.json')
const posix = (p: string) => p.split(sep).join('/')

const files: string[] = []
;(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|vue|css)$/.test(name)) files.push(full)
  }
})(SRC)
const rel = (f: string) => posix(relative(ROOT, f))
const read = (f: string) => readFileSync(f, 'utf8')
const styleOf = (f: string) => (f.endsWith('.css') ? read(f) : [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')).replace(/\/\*[\s\S]*?\*\//g, '')
const templateOf = (f: string) => (f.endsWith('.vue') ? (read(f).match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '').replace(/<!--[\s\S]*?-->/g, '') : '')

const ROLES = Object.keys(typeRole).join('|')
const SIZE_OK = new RegExp(`^(var\\(--ek-type-(${ROLES})-size\\)|var\\(--ek-icon-(xs|sm|md|lg|xl|2xl)\\)|inherit)$`)
const WEIGHT_OK = new RegExp(`^(var\\(--ek-type-(${ROLES})-weight\\)|var\\(--ek-font-weight-(regular|medium|semibold)\\)|inherit)$`)

describe('BO2-30 tek tipografi ölçeği', () => {
  it('font-size / font-weight / font yalnız ölçek token\'ı', () => {
    const bad: string[] = []
    for (const f of files) {
      const css = styleOf(f)
      for (const m of css.matchAll(/(?<![\w-])font-size:\s*([^;}]+)/g)) if (!SIZE_OK.test(m[1].trim())) bad.push(`${rel(f)} font-size: ${m[1].trim()}`)
      for (const m of css.matchAll(/(?<![\w-])font-weight:\s*([^;}]+)/g)) if (!WEIGHT_OK.test(m[1].trim())) bad.push(`${rel(f)} font-weight: ${m[1].trim()}`)
      for (const m of css.matchAll(/(?<![\w-])font:\s*([^;}]+)/g)) if (m[1].trim() !== 'inherit') bad.push(`${rel(f)} font: ${m[1].trim()}`)
    }
    expect(bad).toEqual([])
  })

  it('şablonda satır içi font stili yok', () => {
    const bad = files.filter((f) => /style="[^"]*font-(size|weight)/.test(templateOf(f))).map(rel)
    expect(bad).toEqual([])
  })
})

/** Kural → (dosya → sayı). `owner` = kuralın tek meşru yeri (bileşenin kendisi). */
const RULES: Array<{ id: string; what: string; owner: string[]; scope?: RegExp; count: (tpl: string, src: string) => number }> = [
  { id: 'page-title', what: 'yerel h1 (sayfa başlığı → BoPageHeader)', owner: ['src/components/shell/BoPageHeader.vue', 'src/views/LoginView.vue', 'src/views/admins/AcceptInviteView.vue'], count: (t) => (t.match(/<h1[\s>]/g) ?? []).length },
  { id: 'raw-table', what: 'yerel .bo-table (→ BoTableFrame / BoDataTable)', owner: ['src/components/r2/BoTableFrame.vue'], count: (t) => (t.match(/class="bo-table"/g) ?? []).length },
  { id: 'datatable', what: 'doğrudan EkDataTable (→ BoDataTable)', owner: ['src/components/r2/BoDataTable.vue'], count: (t) => (t.match(/<EkDataTable[\s>]/g) ?? []).length },
  { id: 'segment', what: 'yerel radiogroup segmenti (→ BoSegmented)', owner: ['src/components/r2/BoSegmented.vue'], count: (t) => (t.match(/role="radiogroup"/g) ?? []).length },
  { id: 'pagination', what: 'yerel sayfalama ("Daha fazla" / .bo-table-foot → BoPagination)', owner: ['src/components/r2/BoPagination.vue'], count: (t) => (t.match(/bo-table-foot|>\s*Daha fazla\s*</g) ?? []).length },
  { id: 'refresh', what: 'yerel yenile düğmesi (icon="mdi-refresh" → BoAction kind="refresh")', owner: ['src/components/r2/actions.ts'], count: (t) => (t.match(/icon="mdi-refresh"/g) ?? []).length },
  { id: 'section-head', what: 'yerel bölüm başlığı (.bo-panel__bar → BoSection)', owner: ['src/components/r2/BoSection.vue'], count: (t) => (t.match(/class="bo-panel__bar"/g) ?? []).length },
  { id: 'chart-svg', what: 'yerel SVG grafik (→ BoChart)', owner: ['src/components/charts/BoChart.vue', 'src/components/QrCode.vue'], count: (t) => (t.match(/<svg[^>]*role="img"/g) ?? []).length },
]

function measure(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const r of RULES) {
    out[r.id] = {}
    for (const f of files) {
      if (!f.endsWith('.vue') || r.owner.includes(rel(f))) continue
      const n = r.count(templateOf(f), read(f))
      if (n) out[r.id][rel(f)] = n
    }
  }
  return out
}

describe('BO2-02 yerel kopya yasağı (azalan taban)', () => {
  const actual = measure()
  if (process.env.R2_BASELINE_WRITE) writeFileSync(BASELINE_FILE, `${JSON.stringify(actual, null, 2)}\n`)
  const baseline: Record<string, Record<string, number>> = JSON.parse(read(BASELINE_FILE))

  for (const r of RULES) {
    it(`${r.id}: ${r.what}`, () => {
      const base = baseline[r.id] ?? {}
      const grew = Object.entries(actual[r.id]).filter(([f, n]) => n > (base[f] ?? 0)).map(([f, n]) => `${f}: ${base[f] ?? 0} → ${n} (yeni ihlal — ortak bileşeni kullanın)`)
      const shrank = Object.entries(base).filter(([f, n]) => (actual[r.id][f] ?? 0) < n).map(([f, n]) => `${f}: ${n} → ${actual[r.id][f] ?? 0} (tabanı düşürün: R2_BASELINE_WRITE=1)`)
      expect([...grew, ...shrank]).toEqual([])
    })
  }

  it('ortak bileşenler mevcut ve sayfalar onları kullanabilir', () => {
    for (const owner of RULES.flatMap((r) => r.owner)) expect(() => statSync(join(ROOT, owner)), owner).not.toThrow()
  })
})

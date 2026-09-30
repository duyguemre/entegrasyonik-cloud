// ADR-0026 Aşama 0 — "tek merkez" bekçisi: tasarım token'ları, temalar ve DS bileşenleri YALNIZ
// `packages/ui` (@entegrasyonik/ui) içinde yaşar. Müşteri uygulaması ve backoffice bunları yalnız paket yolundan alır;
// uygulamaya özgü DS kopyası açılmaz (DESIGN_SYSTEM.md "Ortak bileşen/token değişikliği yalnız packages/ui'da").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const FE = join(__dirname, '..')
const posix = (p: string) => p.split(sep).join('/')

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

const sourceFiles = (root: string) => walk(join(FE, root)).filter((f) => /\.(ts|vue|js|mts)$/.test(f))
const specifiers = (text: string) => [...text.matchAll(/(?:from\s+|import\s+|import\(\s*|vi\.mock\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])

describe('@entegrasyonik/ui — tek merkez (uygulamada DS kopyası yok)', () => {
  it('uygulamada `components/ds` klasörü yok', () => {
    expect(existsSync(join(FE, 'src/components/ds'))).toBe(false)
  })

  it('src/design yalnız uygulamaya özgü alan eşlemelerini taşır (token/tema/defaults/css/ikon/kanal kopyası yok)', () => {
    const left = walk(join(FE, 'src/design')).map((f) => posix(relative(join(FE, 'src/design'), f))).sort()
    expect(left).toEqual(['echarts-theme.ts', 'status-map.ts'])
    // tanıtım sitesinin sözleşme yolu (üretilmiş çıktı; scripts/build-tokens.ts) — kaynak paketin tokens/render.ts'idir
    expect(existsSync(join(FE, 'src/design/tokens/dist/tokens.static.css'))).toBe(true)
  })

  it('hiçbir uygulama/test/backoffice dosyası `components/ds` ya da köprü/kopya DS yolunu import etmez', () => {
    const offenders: string[] = []
    for (const root of ['src', 'tests', 'e2e', 'backoffice/src', 'backoffice/tests', 'backoffice/e2e']) {
      for (const f of sourceFiles(root)) {
        if (posix(relative(FE, f)) === 'tests/ui-package-single-source.test.ts') continue
        for (const spec of specifiers(readFileSync(f, 'utf8'))) {
          if (/components\/ds(\/|$)/.test(spec) || /\/bridge(\/|$)/.test(spec) || /design\/(tokens\/(?!dist)|vuetify-|icons|channels|app\.css)/.test(spec)) {
            offenders.push(`${posix(relative(FE, f))} → ${spec}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('backoffice müşteri uygulamasının kaynağına bağlanmaz (`@/` ya da ../../src yok)', () => {
    const offenders: string[] = []
    for (const f of sourceFiles('backoffice/src')) {
      for (const spec of specifiers(readFileSync(f, 'utf8'))) {
        if (spec.startsWith('@/') || /\.\.\/\.\.\/src\//.test(spec)) offenders.push(`${posix(relative(FE, f))} → ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('müşteri uygulamasının Vuetify kurulumu paketin createEkVuetify\'ından gelir (ayrı tema kopyası yok)', () => {
    const plugin = readFileSync(join(FE, 'src/plugins/vuetify.ts'), 'utf8')
    expect(plugin).toMatch(/from '@entegrasyonik\/ui\/theme'/)
    expect(plugin).toMatch(/createEkVuetify\(/)
    expect(/createVuetify\(/.test(plugin)).toBe(false)
  })
})

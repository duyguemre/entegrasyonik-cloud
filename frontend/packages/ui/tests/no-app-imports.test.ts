// ADR-0026 Karar 1 "bağımlılık yönü": paket TEK merkezdir ve uygulamaya bağımlı değildir.
// Paket ne `@/` (müşteri uygulaması) ne `backoffice/` import eder; uygulama durumuna (store/router/i18n) bağlanmaz;
// paket klasörünün dışına (göreli yolla) çıkmaz.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const files: string[] = []
;(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|vue|js|css)$/.test(name)) files.push(full)
  }
})(SRC)

const specifiers = (text: string) => [...text.matchAll(/(?:from\s+|import\s+|import\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
const FORBIDDEN_PACKAGES = ['pinia', 'vue-router', 'vue-i18n']

describe('@entegrasyonik/ui bağımlılık yönü', () => {
  it('paket dosyaları var (köprü klasörü yok, fiziksel taşıma yapıldı)', () => {
    expect(files.length).toBeGreaterThan(60)
    expect(files.some((f) => relative(SRC, f).startsWith('bridge'))).toBe(false)
  })

  it('hiçbir dosya `@/` ya da backoffice import etmez', () => {
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        expect(spec.startsWith('@/'), `${relative(SRC, file)} → ${spec}`).toBe(false)
        expect(/backoffice/.test(spec), `${relative(SRC, file)} → ${spec}`).toBe(false)
      }
    }
  })

  it('uygulama durumuna bağlanmaz: pinia / vue-router / vue-i18n import edilmez', () => {
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        expect(FORBIDDEN_PACKAGES.includes(spec), `${relative(SRC, file)} → ${spec}`).toBe(false)
      }
    }
  })

  it('göreli importlar paketin src klasöründen dışarı çıkmaz', () => {
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue
        const target = resolve(dirname(file), spec)
        expect(relative(SRC, target).startsWith('..'), `${relative(SRC, file)} → ${spec}`).toBe(false)
      }
    }
  })
})

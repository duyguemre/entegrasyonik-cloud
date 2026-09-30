// ADR-0026 Karar 1 "bağımlılık yönü": paket ne `@/` (uygulama) ne `backoffice/` import eder.
// Köprü modu istisnası: uygulama kaynağına YALNIZ `src/bridge/` referans verir ve yalnız DS katmanına
// (`src/design/**`, `src/components/ds/**`) — iş/ekran koduna asla.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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

describe('@entegrasyonik/ui bağımlılık yönü', () => {
  it('hiçbir dosya `@/` ya da backoffice import etmez', () => {
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        expect(spec.startsWith('@/'), `${relative(SRC, file)} → ${spec}`).toBe(false)
        expect(/backoffice/.test(spec), `${relative(SRC, file)} → ${spec}`).toBe(false)
      }
    }
  })

  it('paket dışına yalnız src/bridge/ çıkar; hedef yalnız DS katmanıdır', () => {
    for (const file of files) {
      const rel = relative(SRC, file)
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (!spec.includes('../../../../src/')) continue
        expect(rel.startsWith('bridge'), `${rel} → ${spec}`).toBe(true)
        expect(/\.\.\/src\/(design\/|components\/ds\/|composables\/format$)/.test(spec), `${rel} → ${spec}`).toBe(true)
      }
    }
  })
})

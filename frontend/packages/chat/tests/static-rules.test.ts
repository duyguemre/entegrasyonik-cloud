// §1 / §9 statik kurallar: v-html = 0, yasak ad dizgeleri = 0, içe aktarma yönü, CHAT_PRODUCT dışında ad literal'i yok.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAT_PRODUCT } from '../src/brand'

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')
const UI_SRC = resolve(ROOT, '../ui/src')

function walk(dir: string, exts = ['.ts', '.vue', '.css']): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, exts)
    return exts.some((e) => name.endsWith(e)) ? [full] : []
  })
}
const files = walk(SRC)
const rel = (f: string) => relative(ROOT, f).split(String.fromCharCode(92)).join('/')
/** Yorumlar (belge metni) kural dışı: blok, satır ve HTML yorumları atılır. */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
/** Yalnız içe aktarma bildirimleri (şablon metni değil). */
const importsOf = (f: string) =>
  [...code(f).matchAll(/^\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm)].map((m) => m[1] ?? m[2] ?? m[3])

describe('statik kurallar', () => {
  it('v-html sayısı 0 (paket .vue dosyaları) ve innerHTML yok', () => {
    for (const f of files) {
      const src = code(f)
      expect(src.includes('v-html'), rel(f)).toBe(false)
      expect(/innerHTML|outerHTML|insertAdjacentHTML/.test(src), rel(f)).toBe(false)
    }
  })

  it('yasak ad dizgeleri ("Asistan", "Assistant", "Copilot") src ve i18n\'de yok', () => {
    // Küçük harfli `'assistant'` sözleşmedeki mesaj ROLÜ kimliğidir (ChatMessage.role), ürün adı değil — yalnız o serbest.
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(/[Aa]sistan|ASİSTAN|ASISTAN|Assistant|ASSISTANT|[Cc]opilot|COPILOT/.test(src), rel(f)).toBe(false)
    }
  })

  it(`ürün adı ("${CHAT_PRODUCT.name}") yalnız brand.ts'te literal`, () => {
    for (const f of files) {
      if (f.endsWith('brand.ts')) continue
      expect(code(f).includes(CHAT_PRODUCT.name), rel(f)).toBe(false)
    }
  })

  it('içe aktarma yönü: chat → @/ (frontend/src) ve backoffice YASAK; göreli yolla paket dışına çıkılmaz', () => {
    for (const f of files) {
      const specs = importsOf(f)
      for (const s of specs) {
        expect(s.startsWith('@/'), `${rel(f)} → ${s}`).toBe(false)
        expect(/backoffice/.test(s), `${rel(f)} → ${s}`).toBe(false)
        if (s.startsWith('.')) expect(resolve(f, '..', s).startsWith(SRC), `${rel(f)} → ${s}`).toBe(true)
      }
    }
  })

  it('izinli dış bağımlılıklar: vue, vuetify, @entegrasyonik/ui, zod (yalnız protocol), markdown-it (yalnız markdown)', () => {
    const allowed = [/^vue$/, /^vuetify(\/|$)/, /^@entegrasyonik\/ui\//, /^zod$/, /^markdown-it(\/|$)/]
    for (const f of files) {
      const specs = importsOf(f).filter((s) => !s.startsWith('.'))
      for (const s of specs) {
        expect(allowed.some((r) => r.test(s)), `${rel(f)} → ${s}`).toBe(true)
        if (s === 'zod') expect(rel(f).startsWith('src/protocol/') || rel(f).startsWith('src/transport/'), `${rel(f)} zod`).toBe(true)
        if (s.startsWith('markdown-it')) expect(rel(f), 'markdown-it').toBe('src/markdown/renderMarkdown.ts')
      }
    }
  })

  it('protocol/v1.ts yalnız zod içe aktarır', () => {
    const src = readFileSync(join(SRC, 'protocol/v1.ts'), 'utf8')
    expect(importsOf(join(SRC, 'protocol/v1.ts'))).toEqual(['zod'])
    expect(src.length).toBeGreaterThan(0)
  })

  it('packages/ui → @entegrasyonik/chat içe aktarmaz', () => {
    for (const f of walk(UI_SRC, ['.ts', '.vue'])) expect(readFileSync(f, 'utf8').includes('@entegrasyonik/chat'), f).toBe(false)
  })

  it('literal stil yok: hex/rgb/cubic-bezier/satır içi stil (mandal tabanı 0)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(/(?<![0-9a-fA-F&])#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/.test(src.replace(/`#\$\{/g, '')), `${rel(f)} hex`).toBe(false)
      expect(/rgba?\(|cubic-bezier\(|style="/.test(src), `${rel(f)} rgb/cubic/style`).toBe(false)
    }
  })
})

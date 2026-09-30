// Backoffice kuralları (statik): ham renk yok, token depoya yazılmaz, uygulama koduna doğrudan import yok,
// public/theme-boot.js ortak paketteki kaynakla aynı.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'src')
const files: string[] = []
;(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(ts|vue|css)$/.test(name)) files.push(full)
  }
})(SRC)
const read = (f: string) => readFileSync(f, 'utf8')

describe('backoffice statik kurallar', () => {
  it('ham renk yok (hex / rgb / hsl / adlandırılmış renk) — yalnız token', () => {
    const RAW = /#[0-9a-fA-F]{3,8}\b(?![\w-]*=)|\brgba?\(|\bhsla?\(|:\s*(white|black|red|blue|green|gray|grey)\b/
    for (const f of files) {
      const styles = [...read(f).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') + (f.endsWith('.css') ? read(f) : '')
      const code = styles.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(RAW.test(code), `${relative(ROOT, f)}: ham renk`).toBe(false)
    }
  })

  it('token/oturum depoya yazılmaz (yalnız tema tercihi ve dev sahte API)', () => {
    for (const f of files) {
      const rel = relative(ROOT, f)
      if (rel.startsWith(join('src', 'api', 'mock')) || rel === join('src', 'api', 'index.ts')) continue
      // Otopilot yan panel tercihi: yalnız { open, width }, `bo:` önekli (chat-storage.test.ts korur).
      if (rel === join('src', 'chat', 'prefs.ts')) continue
      expect(/localStorage|sessionStorage|document\.cookie/.test(read(f)), `${rel}`).toBe(false)
    }
  })

  it('uygulama (frontend/src) koduna doğrudan import yok — yalnız @entegrasyonik/ui', () => {
    for (const f of files) {
      const specs = [...read(f).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const s of specs) {
        expect(s.startsWith('@/') || /\.\.\/\.\.\/src\//.test(s), `${relative(ROOT, f)} → ${s}`).toBe(false)
      }
    }
  })

  it('impersonation URL\'i yalnız window.open ile (noopener,noreferrer) açılır, loglanmaz', () => {
    const f = read(join(SRC, 'views', 'TenantDetailView.vue'))
    expect(f).toMatch(/window\.open\(url, '_blank', 'noopener,noreferrer'\)/)
    expect(/console\.|logger/.test(f)).toBe(false)
  })

  it('public/theme-boot.js = packages/ui/src/theme/theme-boot.js', () => {
    expect(read(join(ROOT, 'public', 'theme-boot.js'))).toBe(read(join(ROOT, '..', 'packages', 'ui', 'src', 'theme', 'theme-boot.js')))
  })

  it('sahte API yalnız dev: USE_MOCK import.meta.env.DEV ile korunur', () => {
    expect(read(join(SRC, 'api', 'index.ts'))).toMatch(/USE_MOCK = import\.meta\.env\.DEV && !import\.meta\.env\.VITE_ADMIN_API_BASE/)
  })
})

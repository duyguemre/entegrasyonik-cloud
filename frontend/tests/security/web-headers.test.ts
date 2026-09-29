// R7 / G-03 — nginx güvenlik başlıkları + satır içi betik yokluğu (statik kapı).
// nginx bu ortamda çalıştırılamadığı için (docker daemon yok) yapılandırma METİN düzeyinde doğrulanır.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (f: string) => readFileSync(path.join(root, f), 'utf8')

describe('nginx güvenlik başlıkları', () => {
  const headers = read('nginx-security-headers.conf')
  const conf = read('nginx.conf')

  it.each([
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy-Report-Only',
  ])('%s tanımlı ve "always" ile', (name) => {
    expect(headers).toMatch(new RegExp(`^add_header\\s+${name}\\s+".*"\\s+always;`, 'm'))
  })

  it('CSP önce Report-Only (zorunlu CSP başlığı henüz YOK — ADR-0017 §10)', () => {
    expect(headers).not.toMatch(/^add_header\s+Content-Security-Policy\s/m)
  })

  it("CSP: satır içi betik/eval'e izin vermez, object/base/frame-ancestors kısıtlı", () => {
    const csp = headers.match(/Content-Security-Policy-Report-Only\s+"([^"]+)"/)![1]
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it('nginx.conf her location bloğunda başlık dosyasını include eder (add_header mirası tuzağı)', () => {
    const locations = conf.match(/location\s+[^{]+\{[^}]*\}/g) || []
    expect(locations.length).toBeGreaterThan(0)
    for (const loc of locations) {
      expect(loc, `include eksik: ${loc.split('\n')[0]}`).toContain('include /etc/nginx/snippets/security-headers.conf;')
    }
    expect(conf).toContain('server_tokens off;')
  })

  it('Dockerfile başlık dosyasını imaja kopyalar', () => {
    expect(read('Dockerfile')).toContain('COPY ./nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf')
  })
})

describe('index.html', () => {
  it('satır içi <script> yok (CSP script-src self ile uyumlu); SW kaydı modülde', () => {
    const html = read('index.html')
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)]
    expect(inline).toHaveLength(0)
    expect(html).toContain('src="/src/registerServiceWorker.ts"')
  })
})

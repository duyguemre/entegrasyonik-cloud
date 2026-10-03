import { describe, it, expect } from 'vitest'
import { buildCsp, buildHeadersFile, parseHeadersFile, pathMatches } from '../src/lib/headers.mjs'

describe('CSP (ADR-0014 Karar 1)', () => {
  const csp = buildCsp('https://app.example.test/some/path')
  const directives = Object.fromEntries(
    csp.split('; ').map((d) => {
      const [name, ...values] = d.split(' ')
      return [name, values]
    }),
  )

  it('hiçbir yönergede unsafe-inline/unsafe-eval/uzak origin yok', () => {
    expect(csp).not.toMatch(/unsafe-|\*/)
    for (const [name, values] of Object.entries(directives)) {
      if (name === 'form-action') continue
      for (const v of values) expect(v, `${name}`).toMatch(/^'(self|none)'$|^data:$/)
    }
  })

  it('zorunlu yönergeler', () => {
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).toEqual(["'self'"])
    expect(directives['style-src']).toEqual(["'self'"])
    expect(directives['font-src']).toEqual(["'self'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['object-src']).toEqual(["'none'"])
  })

  it('form-action yalnızca site + uygulama origin (yol atılır)', () => {
    expect(directives['form-action']).toEqual(["'self'", 'https://app.example.test'])
  })
})

describe('_headers dosyası', () => {
  const text = buildHeadersFile('https://app.example.test')
  const blocks = parseHeadersFile(text)

  it('gidiş-dönüş ayrıştırılır', () => {
    expect(blocks.map((b) => b.path)).toEqual(['/*', '/_astro/*'])
    expect(blocks[0].headers['Content-Security-Policy']).toBe(buildCsp('https://app.example.test'))
    expect(blocks[0].headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(blocks[0].headers['X-Content-Type-Options']).toBe('nosniff')
    expect(blocks[0].headers['Permissions-Policy']).toContain('camera=()')
  })

  it('hash-li varlıklar değişmez önbellek alır', () => {
    expect(blocks[1].headers['Cache-Control']).toContain('immutable')
  })

  it('pathMatches joker karakter', () => {
    expect(pathMatches('/*', '/herhangi/bir/yol')).toBe(true)
    expect(pathMatches('/_astro/*', '/_astro/a.css')).toBe(true)
    expect(pathMatches('/_astro/*', '/baska/a.css')).toBe(false)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderTokenCss } from '../../src/design/tokens/render'

/**
 * ADR-0011 Karar 1 — "İki çıktı ... Drift testi: commit'li dosya ≠
 * `renderTokenCss()` çıktısı ise test kırılır." Token kaynağı
 * (`src/design/tokens/{palette,semantic,legacy,scale,render}.ts`) değişip
 * `npm run tokens` çalıştırılmadan commit'lenirse bu test kırılır.
 */
describe('token drift (dist/tokens.{app,static}.css ≡ renderTokenCss())', () => {
  const distDir = resolve(__dirname, '../../src/design/tokens/dist')

  it('tokens.app.css, renderTokenCss("app") çıktısıyla bit-bit aynı', () => {
    const committed = readFileSync(resolve(distDir, 'tokens.app.css'), 'utf8')
    expect(committed).toBe(renderTokenCss('app'))
  })

  it('tokens.static.css, renderTokenCss("static") çıktısıyla bit-bit aynı', () => {
    const committed = readFileSync(resolve(distDir, 'tokens.static.css'), 'utf8')
    expect(committed).toBe(renderTokenCss('static'))
  })
})

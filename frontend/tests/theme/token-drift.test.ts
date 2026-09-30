import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderTokenCss } from '@entegrasyonik/ui/tokens'

/**
 * ADR-0011 Karar 1 — "İki çıktı ... Drift testi: commit'li dosya ≠
 * `renderTokenCss()` çıktısı ise test kırılır." Token kaynağı
 * (`packages/ui/src/tokens/{palette,semantic,legacy,scale,render}.ts`) değişip
 * `npm run tokens` çalıştırılmadan commit'lenirse bu test kırılır.
 */
describe('token drift (dist/tokens.{app,static}.css ≡ renderTokenCss())', () => {
  // app çıktısı pakette; static çıktı tanıtım sitesinin sözleşme yolunda (bkz. scripts/build-tokens.ts)
  const appDist = resolve(__dirname, '../../packages/ui/src/tokens/dist')
  const staticDist = resolve(__dirname, '../../src/design/tokens/dist')

  it('tokens.app.css, renderTokenCss("app") çıktısıyla bit-bit aynı', () => {
    const committed = readFileSync(resolve(appDist, 'tokens.app.css'), 'utf8')
    expect(committed).toBe(renderTokenCss('app'))
  })

  it('tokens.static.css, renderTokenCss("static") çıktısıyla bit-bit aynı', () => {
    const committed = readFileSync(resolve(staticDist, 'tokens.static.css'), 'utf8')
    expect(committed).toBe(renderTokenCss('static'))
  })
})

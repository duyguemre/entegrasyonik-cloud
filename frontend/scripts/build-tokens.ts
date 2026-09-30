/**
 * frontend/scripts/build-tokens.ts
 *
 * ADR-0011 Karar 1 / ADR-0026 — `npm run tokens` bu dosyayı `vite-node` ile çalıştırır ve
 * `packages/ui/src/tokens/render.ts`'in ürettiği iki CSS çıktısını YAZAR (commit'li dosyalar):
 *   - `tokens.app.css`    → `packages/ui/src/tokens/dist/` (iki uygulamanın stil katmanı bunu yükler)
 *   - `tokens.static.css` → `src/design/tokens/dist/` (TANITIM SİTESİNİN sözleşme yolu: site bu yolu okur ve
 *     site/ bu işte değiştirilmez; site yolu paketin dist'ine taşındığında bu satır ve `check-contract-paths.js`
 *     güncellenir). Başka bir DS kopyası DEĞİLDİR: aynı `renderTokenCss('static')` çıktısıdır.
 * Drift testi (`tests/theme/token-drift.test.ts`) iki dosyanın `renderTokenCss()`'in ANLIK çıktısıyla aynı
 * kaldığını doğrular — token kaynağı değişip `npm run tokens` unutulursa test kırılır.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderTokenCss } from '@entegrasyonik/ui/tokens'

const OUT_DIRS = {
  app: resolve(__dirname, '../packages/ui/src/tokens/dist'),
  static: resolve(__dirname, '../src/design/tokens/dist'),
} as const

function write(target: 'app' | 'static'): string {
  const outPath = resolve(OUT_DIRS[target], `tokens.${target}.css`)
  const css = renderTokenCss(target)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, css, 'utf8')
  return outPath
}

const appPath = write('app')
const staticPath = write('static')

console.log(`[tokens] yazıldı: ${appPath}`)
console.log(`[tokens] yazıldı: ${staticPath}`)

/**
 * frontend/scripts/build-tokens.ts
 *
 * ADR-0011 Karar 1 — `npm run tokens` bu dosyayı `vite-node` ile çalıştırır
 * ve `src/design/tokens/render.ts`'in ürettiği iki CSS çıktısını
 * `src/design/tokens/dist/` altına YAZAR (commit'li dosyalar). Drift testi
 * (`tests/theme/token-drift.test.ts`) bu dosyaların `renderTokenCss()`'in
 * ANLIK çıktısıyla aynı kaldığını doğrular — token kaynağı değişip
 * `npm run tokens` unutulursa test kırılır.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderTokenCss } from '../src/design/tokens/render'

const DIST_DIR = resolve(__dirname, '../src/design/tokens/dist')

function write(target: 'app' | 'static'): string {
  const outPath = resolve(DIST_DIR, `tokens.${target}.css`)
  const css = renderTokenCss(target)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, css, 'utf8')
  return outPath
}

const appPath = write('app')
const staticPath = write('static')

console.log(`[tokens] yazıldı: ${appPath}`)
console.log(`[tokens] yazıldı: ${staticPath}`)

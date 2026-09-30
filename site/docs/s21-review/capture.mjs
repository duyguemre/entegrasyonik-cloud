// S21 inceleme görüntüleri: hero operasyon merkezi çerçevesi (1440/1920/390 + yakın çekim).
// Kullanım: node scripts/serve-dist.mjs --dir dist --port 4391 & ; node docs/s21-review/capture.mjs <önek> [--reduced]
// Bulutta Playwright'ın kendi Chromium'u indirilemez → CHROME_PATH (varsayılan /opt/pw-browsers/chromium).
import { chromium } from '@playwright/test'

const prefix = process.argv[2] ?? 'shot'
const reduced = process.argv.includes('--reduced')
// Aday karşılaştırması: --frame=a|b|c → `.hero__visual[data-frame]` yakalamadan önce değiştirilir.
const frame = process.argv.find((a) => a.startsWith('--frame='))?.slice(8)
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4391/'
const out = new URL('.', import.meta.url).pathname
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium' })

for (const [w, h] of [[1440, 900], [1920, 1080], [390, 844]].filter(([w]) => !only || only.split(',').includes(String(w)))) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  if (frame) await page.evaluate((f) => document.querySelector('[data-testid=hero-visual]').setAttribute('data-frame', f), frame)
  const hero = page.getByTestId('hero')
  // Döngü sahnesinin kararlı bir anı: 1. sahnenin sonu (≈6,5 sn) — reduced'da zaten statik.
  if (!reduced) await page.waitForTimeout(Number(process.env.WAIT_MS ?? 6500))
  if (w === 390) {
    await page.getByTestId('hero-mock').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await page.getByTestId('hero-visual').screenshot({ path: `${out}${prefix}-390.png` })
  } else {
    await hero.screenshot({ path: `${out}${prefix}-${w}.png` })
  }
  if (w === 1440) {
    // Yakın çekim: çerçevenin sol üst köşesi (pencere çubuğu + kenar ışığı) 2x
    const p2 = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await p2.goto(base, { waitUntil: 'networkidle' })
    await p2.evaluate(() => document.fonts.ready)
    if (frame) await p2.evaluate((f) => document.querySelector('[data-testid=hero-visual]').setAttribute('data-frame', f), frame)
    if (!reduced) await p2.waitForTimeout(Number(process.env.WAIT_MS ?? 6500))
    const box = await p2.getByTestId('hero-visual').boundingBox()
    await p2.screenshot({ path: `${out}${prefix}-yakin.png`, clip: { x: box.x - 40, y: box.y - 40, width: Math.min(560, box.width + 80), height: 300 } })
    await p2.close()
  }
  await page.close()
}
await browser.close()

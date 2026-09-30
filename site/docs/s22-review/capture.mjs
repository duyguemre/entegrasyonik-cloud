// S22 inceleme görüntüleri: ajan sayfası (tam sayfa) + ana sayfa hero'su, 1440 ve 390, isteğe bağlı reduced-motion.
// Kullanım: npm run build && ./docs/s22-review/restart-server.sh && node docs/s22-review/capture.mjs <önek> [--path=/otopilot] [--reduced] [--only=1440,390] [--home]
// Bulutta Playwright'ın kendi Chromium'u indirilemez → CHROME_PATH (varsayılan /opt/pw-browsers/chromium).
import { chromium } from '@playwright/test'

const prefix = process.argv[2] ?? 'shot'
const reduced = process.argv.includes('--reduced')
const home = process.argv.includes('--home')
const dark = process.argv.includes('--dark')
const route = process.argv.find((a) => a.startsWith('--path='))?.slice(7) ?? '/otopilot'
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4392'
const out = new URL('.', import.meta.url).pathname
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium' })

for (const [w, h] of [[1440, 900], [390, 844]].filter(([w]) => !only || only.split(',').includes(String(w)))) {
  const page = await browser.newPage({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    colorScheme: dark ? 'dark' : 'light',
  })
  await page.goto(base + (home ? '/' : route), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  if (home) {
    if (!reduced) await page.waitForTimeout(6500)
    await page.getByTestId('hero').screenshot({ path: `${out}${prefix}-hero-${w}.png` })
  } else {
    // Tüm bölümler görünür olsun (giriş animasyonları IntersectionObserver ile tetiklenir): sayfayı adım adım kaydır.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(reduced ? 300 : 1500)
    await page.screenshot({ path: `${out}${prefix}-${w}.png`, fullPage: true })
    await page.screenshot({ path: `${out}${prefix}-ust-${w}.png` })
  }
  await page.close()
}
await browser.close()

// Yerel Lighthouse ölçümü (ADR-0014 Karar 1 kalite hedefleri) — mobil profil (Lighthouse varsayılanı).
//   Taslak derleme  → Performans / Erişilebilirlik / En İyi Uygulamalar (noindex SEO'yu düşürür)
//   Yayın derlemesi → SEO (SITE_DRAFT=false, yalnızca yerel test dizini; hiçbir yere yayınlanmaz)
// Kullanım: npm run lighthouse [-- --runs 3]   (Chrome gerekir: CHROME_PATH veya standart kurulum)
// Sunucu: scripts/serve-dist.mjs (`_headers` + brotli) — üretime yakın başlık/sıkıştırma.
import fs from 'node:fs'
import path from 'node:path'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { buildSite, siteRoot } from './lib/build.mjs'
import { startServer } from './serve-dist.mjs'

// LH_PATH: ölçülecek sayfa yolu (varsayılan ana sayfa), ör. LH_PATH=/entegrasyonlar
const LH_PATH = process.env.LH_PATH || '/'
const THRESHOLDS = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 95 }
const APP_URL = 'https://app.example.test'
const runsArg = process.argv.indexOf('--runs')
const RUNS = runsArg > -1 ? Number(process.argv[runsArg + 1]) : 3
// Ölçülecek sayfa (varsayılan '/'): `npm run lighthouse -- --path /fiyatlandirma` (ADR-0014 S4b) ve isteğe bağlı `--port-base <n>`.
const pathArg = process.argv.indexOf('--path')
const PAGE_PATH = pathArg > -1 ? process.argv[pathArg + 1] : LH_PATH
const portArg = process.argv.indexOf('--port-base')
const PORT_BASE = portArg > -1 ? Number(process.argv[portArg + 1]) : 4391
const reportDir = path.join(siteRoot, '.lighthouse')
// Windows'ta önceki koşudan kalan Chrome profili kilitli olabilir (EBUSY): koşuya özgü profil adı + yeniden deneme.
const PROFILE_NAME = `chrome-profile-${process.pid}`
// Windows: Chrome kapanırken profil dosyaları kısa süre kilitli kalır (EBUSY) -> yeniden dene, olmazsa yut.
function rmProfile() {
  try {
    fs.rmSync(path.join(reportDir, PROFILE_NAME), { recursive: true, force: true, maxRetries: 20, retryDelay: 500 })
  } catch {
    /* kilitli profil bir sonraki koşuda yeni adla açılır; ölçümü düşürme */
  }
}
rmProfile()
fs.mkdirSync(path.join(reportDir, PROFILE_NAME), { recursive: true })

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function measure({ label, dir, port, categories }) {
  const server = await startServer({ dir, port })
  rmProfile() // her ölçüm temiz profil
  fs.mkdirSync(path.join(reportDir, PROFILE_NAME), { recursive: true })
  let chrome
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--disable-gpu'],
      userDataDir: path.join(reportDir, PROFILE_NAME),
    })
  } catch (error) {
    server.close()
    throw new Error(`Chrome başlatılamadı (CHROME_PATH ayarlayın): ${error.message}`)
  }
  const scores = Object.fromEntries(categories.map((c) => [c, []]))
  const metrics = { lcp: [], cls: [], tbt: [] }
  try {
    for (let i = 0; i < RUNS; i++) {
      const result = await lighthouse(`http://127.0.0.1:${port}${PAGE_PATH}`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: categories,
      })
      const lhr = result.lhr
      for (const c of categories) scores[c].push(Math.round((lhr.categories[c].score ?? 0) * 100))
      metrics.lcp.push(lhr.audits['largest-contentful-paint'].numericValue)
      metrics.cls.push(lhr.audits['cumulative-layout-shift'].numericValue)
      metrics.tbt.push(lhr.audits['total-blocking-time'].numericValue)
      if (i === 0) fs.writeFileSync(path.join(reportDir, `${label}.json`), result.report)
    }
  } finally {
    await chrome.kill()
    server.close()
  }
  return {
    scores: Object.fromEntries(categories.map((c) => [c, median(scores[c])])),
    all: scores,
    metrics: { lcpMs: Math.round(median(metrics.lcp)), cls: +median(metrics.cls).toFixed(3), tbtMs: Math.round(median(metrics.tbt)) },
  }
}

const draftDir = buildSite({ outDir: 'dist-lh', env: { SITE_DRAFT: 'true', PUBLIC_APP_URL: APP_URL }, silent: true })
const finalDir = buildSite({
  outDir: 'dist-lh-final',
  env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: APP_URL, PUBLIC_SITE_URL: 'https://site.example.test' },
  silent: true,
})

const draft = await measure({ label: 'draft', dir: draftDir, port: PORT_BASE, categories: ['performance', 'accessibility', 'best-practices'] })
const final = await measure({ label: 'final', dir: finalDir, port: PORT_BASE + 1, categories: ['performance', 'accessibility', 'best-practices', 'seo'] })

console.log(`\nLighthouse (mobil, ${RUNS} koşu medyanı)`)
console.log('TASLAK derleme   :', JSON.stringify(draft.scores), JSON.stringify(draft.metrics))
console.log('YAYIN derlemesi  :', JSON.stringify(final.scores), JSON.stringify(final.metrics))

const failures = []
for (const [name, min] of Object.entries(THRESHOLDS)) {
  const value = name === 'seo' ? final.scores.seo : Math.min(draft.scores[name], final.scores[name])
  if (value < min) failures.push(`${name}: ${value} < ${min}`)
}
if (draft.metrics.cls >= 0.1) failures.push(`CLS ${draft.metrics.cls} >= 0.1`)
if (draft.metrics.lcpMs >= 2500) failures.push(`LCP ${draft.metrics.lcpMs}ms >= 2500`)
if (draft.metrics.tbtMs >= 200) failures.push(`TBT ${draft.metrics.tbtMs}ms >= 200`)
if (failures.length) {
  console.error('\nEŞİK İHLALİ:\n - ' + failures.join('\n - '))
  process.exit(1)
}
console.log('\nTüm eşikler sağlandı.')
process.exit(0)

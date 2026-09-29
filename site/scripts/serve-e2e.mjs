// Playwright webServer girişi: E2E derlemesini (önizleme rotalarıyla, sabit test app adresiyle) üretir ve sunar.
import { buildSite } from './lib/build.mjs'
import { startServer } from './serve-dist.mjs'

export const E2E_APP_URL = 'https://app.example.test'

const port = Number(process.env.E2E_PORT) || 4381
const dir = buildSite({
  outDir: 'dist-e2e',
  env: { SITE_PREVIEW_ROUTES: 'true', PUBLIC_APP_URL: E2E_APP_URL, SITE_DRAFT: 'true' },
})
await startServer({ dir, port })
console.log(`serve-e2e: http://127.0.0.1:${port}`)

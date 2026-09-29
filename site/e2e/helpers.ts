import type { Page } from '@playwright/test'

/** E2E derlemesindeki uygulama adresi (scripts/serve-e2e.mjs ile aynı). */
export const APP_URL = 'https://app.example.test'

export const DESKTOP_MIN_WIDTH = 1024

export function isDesktop(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH
}

/**
 * Konsol hatası, yakalanmamış istisna ve CSP ihlali toplar. Sunucu `_headers` ile gerçek CSP gönderir →
 * satır içi betik/stil veya üçüncü taraf istek varsa burada görünür.
 */
export function collectProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`))
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()}`))
  void page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  return problems
}

export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export const ACCOUNT = { email: 'yonetici@ornek.test', firstLogin: 'yeni.yonetici@ornek.test', password: 'ornek-parola' }

export async function signIn(page: Page, email = ACCOUNT.email) {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
  await page.getByRole('button', { name: 'Devam et' }).click()
}

export async function signInFully(page: Page) {
  await signIn(page)
  await page.getByLabel('Doğrulama kodu').fill('123456')
  await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
  await expect(page).toHaveURL(/\/genel-bakis$/)
}

/** axe: WCAG 2.1 A/AA ihlali 0 (iki temada). */
export async function expectNoA11yViolations(page: Page, include?: string) {
  // Açılış/geçiş animasyonları (≤ slow 300 ms) bitsin; ara karede opaklık kontrastı yanlış ölçülür.
  await page.waitForTimeout(400)
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (include) builder = builder.include(include)
  const result = await builder.analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
}

/** Yükleme iskeletleri bitsin (sahte API gecikmesi 120–380 ms). */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 })
}

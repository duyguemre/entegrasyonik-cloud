// ADR-0034 — Otopilot e2e yardımcıları. Mock taşıyıcı `window.__EK_CHAT_MOCK__` (yalnız DEV) ile seçilir;
// gerçek backend'e bağlanan test YOK (CHAT_UI_CONTRACT §9). `speed` küçük → senaryo beklemeleri kısalır.
import { expect, type Page } from '@playwright/test'
import { installApiMocks, type MockValue } from './mockApi'
import { waitForShellReady } from './nav'
import { CHAT_PRODUCT } from '../../packages/chat/src/brand'

export const NAME = CHAT_PRODUCT.name

export type OtopilotConfig =
  | 'enabled' | 'unavailable' | 'maintenance' | 'setup-required' | 'setup-no-permission'
  | 'consent-pending-owner' | 'consent-pending-admin' | 'read-only'

export async function useOtopilotMock(page: Page, config: OtopilotConfig = 'enabled', speed = 0) {
  await page.addInitScript(([c, s]) => {
    ;(window as unknown as { __EK_CHAT_MOCK__: unknown }).__EK_CHAT_MOCK__ = { config: c, speed: s }
    // Yardım turu teklifi bu spec'in konusu değil (kendi spec'i var); kapatılmış sayılır.
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
    } catch {
      /* depolama kapalı */
    }
  }, [config, speed] as const)
}

/** Kabuğu mock API + mock sohbet taşıyıcısıyla açar. */
export async function gotoWithOtopilot(page: Page, config: OtopilotConfig = 'enabled', options: { speed?: number; overrides?: Record<string, MockValue>; path?: string } = {}) {
  await installApiMocks(page, options.overrides ?? {})
  await useOtopilotMock(page, config, options.speed ?? 0)
  await page.goto(options.path ?? '/')
  if (!options.path || options.path === '/') await waitForShellReady(page)
}

export const launcher = (page: Page) => page.locator('[data-header-action="otopilot"]')
export const dock = (page: Page) => page.locator('.ek-otopilot-dock')
export const panel = (page: Page) => page.locator('.ek-chat').first()
export const composer = (page: Page) => page.getByRole('textbox', { name: `${NAME}'a mesaj` })

export async function openPanel(page: Page) {
  await expect(launcher(page)).toBeVisible()
  await launcher(page).click()
  await expect(composer(page)).toBeVisible()
}

export async function ask(page: Page, text: string) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}

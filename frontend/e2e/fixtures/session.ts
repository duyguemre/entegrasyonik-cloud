// R9b (docs/FRONTEND_CODE_AUDIT.md H-01 / T-15) — iki kullanıcılı oturum yardımcıları (e2e fixture).
import { expect, type Page } from '@playwright/test'
import { installApiMocks, type MockValue } from './mockApi'
import { menuFixture } from './nav'
import { settingsFixture, userContextFixture } from './apiData'

export type Session = 'A' | 'B' | null

export const userA = { ...userContextFixture, _id: 'user-e2e-A', username: 'a.kullanici@entegrasyonik-e2e.invalid' }
export const userB = { ...userContextFixture, _id: 'user-e2e-B', username: 'b.kullanici@entegrasyonik-e2e.invalid' }
export const settingsA = { settings: { ...settingsFixture.settings, storeName: 'A Mağazası (E2E)' } }
export const settingsB = { settings: { ...settingsFixture.settings, storeName: 'B Mağazası (E2E)' } }

// B'nin menüsü A'nınkinin alt kümesi: iade (ClaimListView) ve müşteri (CustomerListView) YOK.
const menuB = menuFixture.map((g) => ({
  ...g,
  links: g.links.filter((l: any) => !['ClaimListView', 'CustomerListView'].includes(l.code)),
}))

const notificationsA = {
  result: true,
  unreadCount: 7,
  data: [{ _id: 'n-A-1', title: 'A kullanıcısına ait bildirim', message: 'yalnızca A görmeli', severity: 'info', read: false }],
}

export async function installTwoUserMocks(page: Page, state: { session: Session }, extra: Record<string, MockValue> = {}) {
  const json = (route: any, headers: any, status: number, body: unknown) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const bySession = <T>(a: T, b: T, none: T) => (state.session === 'A' ? a : state.session === 'B' ? b : none)

  await installApiMocks(page, {
    checkAuthentication: (route, h) => json(route, h, 200, state.session !== null),
    userContext: (route, h) => (state.session ? json(route, h, 200, bySession(userA, userB, null)) : json(route, h, 401, {})),
    MenuService: (route, h) => json(route, h, 200, bySession(menuFixture, menuB, [])),
    'SettingService/getSettings': (route, h) => json(route, h, 200, bySession(settingsA, settingsB, {})),
    NotificationService: (route, h) => json(route, h, 200, bySession(notificationsA, { result: true, unreadCount: 0, data: [] }, {})),
    'SecurityService/login': (route, h) => {
      const body = route.request().postDataJSON?.() ?? {}
      state.session = String(body.username || '').startsWith('a.') ? 'A' : 'B'
      return json(route, h, 200, state.session === 'A' ? userA : userB)
    },
    'SecurityService/logout': (route, h) => {
      state.session = null
      return json(route, h, 200, {})
    },
    ...extra,
  })
}

export async function loginViaForm(page: Page, email: string, landing: RegExp = /\/dashboard$/) {
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Parola', { exact: true }).fill('e2e-pass-1234')
  await page.getByRole('button', { name: 'Giriş' }).click()
  await expect(page).toHaveURL(landing, { timeout: 10_000 })
}

export async function logoutViaAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Hesap menüsü' }).click()
  // [DS-v2 Aşama 2] Hesap menüsü `EkMenuPanel` (role=menuitem) — niyet aynı: menüden "Çıkış".
  await page.locator('.v-overlay--active').getByRole('menuitem', { name: 'Çıkış' }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
}

export const workspaceKeys = (page: Page) =>
  page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('ek.ws.v1:')))


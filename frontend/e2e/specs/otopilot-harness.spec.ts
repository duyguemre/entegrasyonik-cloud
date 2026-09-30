// ADR-0034 / CHAT_UI_CONTRACT §8–9 — Otopilot paneli AÇIK + KOYU temada axe WCAG 2.2 AA = 0 ve görsel tabanlar.
// Uygulamanın koyu tema kapısı (FR2-DARK) kapalı olduğundan koyu tema DEV tezgâhında (`/dev/otopilot`) doğrulanır;
// panel bileşenleri uygulamadakiyle birebir aynıdır (tek paket). Görsel tabanlar Windows'ta (*-win32.png) üretilir;
// bulutta `--update-snapshots=missing` ile *-linux.png oluşur ve commit'lenmez (CLAUDE.md kural 7).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

interface State {
  name: string
  query: string
  ready: string
}

const STATES: State[] = [
  { name: 'empty', query: '', ready: 'işinizi konuşarak' },
  { name: 'table', query: 'ask=onay%20bekleyen%20sipari%C5%9Fler', ready: 'en eski 25' },
  { name: 'kpi', query: 'ask=bu%20haftaki%20sat%C4%B1%C5%9F', ready: 'arttı' },
  { name: 'confirm', query: 'ask=sipari%C5%9Fleri%20onayla', ready: 'Kalan süre' },
  { name: 'typed', query: 'ask=tasla%C4%9F%C4%B1%20sil', ready: 'Kalan süre' },
  { name: 'form', query: 'ask=fiyat%20g%C3%BCncelle', ready: 'Önizle' },
  { name: 'entity', query: 'ask=sto%C4%9Fu%20azalan%20%C3%BCr%C3%BCn', ready: 'Demo Pamuk Tişört' },
  { name: 'errors', query: 'ask=yetkim%20var%20m%C4%B1', ready: 'Destek kodu' },
  { name: 'unknown', query: 'ask=yeni%20t%C3%BCr', ready: 'gösterilemiyor' },
  { name: 'setup', query: 'config=setup-required', ready: 'API anahtarı' },
  { name: 'setup-no-permission', query: 'config=setup-no-permission', ready: 'Yönetici kurulumu' },
  { name: 'consent-owner', query: 'config=consent-pending-owner', ready: 'Onayınız gerekiyor' },
  { name: 'unavailable', query: 'config=unavailable', ready: 'şu an kapalı' },
  { name: 'settings', query: 'settings=1', ready: 'Kullanım (bilgi amaçlı)' },
]

async function open(page: Page, state: State, theme: 'light' | 'dark', extra = '') {
  await installApiMocks(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/dev/otopilot?speed=0&theme=${theme}${state.query ? `&${state.query}` : ''}${extra}`)
  await expect(page.getByText(state.ready, { exact: false }).first()).toBeVisible()
  await page.waitForTimeout(150)
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Otopilot tezgâhı — ${theme}`, () => {
    for (const state of STATES) {
      test(`${state.name}: axe WCAG 2.2 AA = 0`, async ({ page }) => {
        await open(page, state, theme)
        const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-otopilot-harness').analyze()
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
      })
    }

    test('görsel tabanlar: boş, tablo, onay, kurulum', async ({ page }) => {
      test.skip((page.viewportSize()?.width ?? 0) < 1024, 'görsel taban masaüstünde')
      for (const name of ['empty', 'table', 'confirm', 'setup']) {
        const state = STATES.find((s) => s.name === name)!
        await open(page, state, theme)
        await page.locator('.ek-chat-caret').waitFor({ state: 'detached' }).catch(() => undefined)
        await expect(page.locator('.ek-otopilot-harness__frame')).toHaveScreenshot(`otopilot-${name}-${theme}.png`, {
          mask: [page.locator('.ek-chat-confirm__timer')],
          animations: 'disabled',
        })
      }
    })
  })
}

test('reduced-motion: yazma imleci ve nokta animasyonu kapalı', async ({ page }) => {
  await installApiMocks(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dev/otopilot?speed=1&ask=uzun%20rapor')
  const caret = page.locator('.ek-chat-caret')
  await expect(caret).toBeVisible()
  expect(await caret.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})

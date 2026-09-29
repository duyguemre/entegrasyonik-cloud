// ADR-0015 B5-2 — ChoiceListView (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { choicesDoluFixture, choicesBosFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import type { Page } from '@playwright/test'

const menuFixtureWithChoice = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? { ...link, children: [...link.children, { code: 'ChoiceListView', parent: 'productDefinitions', title: 'choiceList', icon: 'mdi-palette-swatch-outline', singleton: true }] }
            : link,
        ),
      }
    : group,
)

async function openChoiceListView(page: Page) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const groupItem = group.locator('.v-list-group__header')
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) {
    await groupItem.click()
    await expect(subItem).toBeVisible()
  }
  await subItem.click()
  await page.waitForTimeout(200)
}

test.describe('P3 (B5-2) — Varyant Grupları (ChoiceListView)', () => {
  test('smoke: arama kutusu + varyant grubu satırları render olur', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithChoice, ChoiceService: choicesDoluFixture })
    await gotoAuthed(page)
    await openChoiceListView(page)

    await expectScreenOpen(page, '.choiceListView')
    await expect(page.getByPlaceholder('Seçenek Grubu')).toBeVisible()
    await expect(page.locator('.choiceListView').getByText('E2E Renk Grubu')).toBeVisible()
    await expect(page.locator('.choiceListView').getByText('E2E Beden Grubu')).toBeVisible()
    await expect(page.locator('.choiceListView').getByText('Siyah')).toBeVisible()
    await expect(page.locator('.choiceListView').getByText('GRUP (SLICER)').first()).toBeVisible()
    await expect(page.locator('.choiceListView').getByText('VARYANT', { exact: true }).first()).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Grup Bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithChoice, ChoiceService: choicesBosFixture })
    await gotoAuthed(page)
    await openChoiceListView(page)

    await expectScreenOpen(page, '.choiceListView')
    await expect(page.getByText('Grup Bulunamadı')).toBeVisible()
  })

  test('hata durumu: ChoiceService 500 verdiğinde ham hata sızmaz (karakterizasyon — bkz. not)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithChoice, ChoiceService: mockError(500) })
    await gotoAuthed(page)
    await openChoiceListView(page)

    await expectScreenOpen(page, '.choiceListView')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: yeni grup adı yazıp ekle butonuna basınca addChoice çağrısı yapılır', async ({ page }) => {
    let addChoiceCalled = false
    await installApiMocks(page, {
      MenuService: menuFixtureWithChoice,
      ChoiceService: choicesDoluFixture,
      'ChoiceService/addChoice': async (route, headers) => {
        addChoiceCalled = true
        const body = route.request().postDataJSON?.() ?? {}
        expect(body.title).toBe('E2E Yeni Grup')
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: { _id: 'choice-new' } }) })
      },
    })
    await gotoAuthed(page)
    await openChoiceListView(page)

    await page.getByPlaceholder('Seçenek Grubu').fill('E2E Yeni Grup')
    await page.locator('.choiceListView').getByRole('button').filter({ has: page.locator('.mdi-plus') }).first().click()
    await expect.poll(() => addChoiceCalled).toBe(true)
  })

  test('ekran görüntüsü tabanı (varyant grupları)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithChoice, ChoiceService: choicesDoluFixture })
    await gotoAuthed(page)
    await openChoiceListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('choice-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithChoice, ChoiceService: choicesDoluFixture })
    await gotoAuthed(page)
    await openChoiceListView(page)
    await expect(page.locator('.choiceListView').getByText('E2E Renk Grubu')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.choiceListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ChoiceListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ChoiceListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

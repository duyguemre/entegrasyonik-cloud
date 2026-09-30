// A6a inceleme görselleri — kategori / özellik eşleme hata durumları (yalnızca A6A_REVIEW=1 ile çalışır).
// Çıktı: docs/a6a-review/mapping-<durum>-<before|after>-<1440|390>.png (A6A_PHASE ile evre seçilir).
import { test, expect, type Page, type Route } from '@playwright/test'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { menuFixture, gotoAuthed, openDrawer } from '../fixtures/nav'
import { choicesDoluFixture } from '../fixtures/apiData'

const PHASE = process.env.A6A_PHASE === 'after' ? 'after' : 'before'
const OUT = 'docs/a6a-review'

// Gerçek menü kaydı (`productDefinitions/CategoryListView`) e2e menü fixture'ında yok — yalnız bu spec'te eklenir.
async function openCategoryListView(page: Page) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) {
    await group.locator('.v-list-group__header').click()
    await expect(subItem).toBeVisible()
    await page.waitForTimeout(300)
  }
  await subItem.click()
  await page.waitForTimeout(300)
}
const menuWithCategories = menuFixture.map((g: any) => ({
  ...g,
  links: g.links.map((l: any) =>
    l.code === 'productDefinitions'
      ? { ...l, children: [...l.children, { code: 'CategoryListView', parent: 'productDefinitions', title: 'categoryList', icon: 'mdi-shape-outline', singleton: true }] }
      : l,
  ),
}))

const json = (route: Route, headers: any, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

const localTree = [
  { _id: 'cat-root', title: 'Kategoriler', isMain: true, children: [] },
  { _id: 'cat-tisort', title: 'Tişört', level: 0, children: [], choiceIds: [], platforms: [] },
]
const platformCategories = [
  { _id: 1001, title: 'Tişört', parentId: 0, children: [] },
  { _id: 1002, title: 'Gömlek', parentId: 0, children: [] },
]
const platformAttributes = [
  { _id: 'attr-renk', title: 'Renk', required: true, allowCustom: false, varianter: true, slicer: false, values: undefined },
  { _id: 'attr-kumas', title: 'Kumaş Tipi', required: false, allowCustom: true, varianter: false, slicer: false, values: [] },
]

type Fail = MockValue
const FAILS: Record<string, Fail> = {
  '5xx': mockError(500, { error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', requestId: 'req-e2e-0001' }),
  auth: mockError(403, { error: 'Bu işlem için yetkiniz yok.' }),
  timeout: mockError(504, { error: 'Gateway Timeout' }),
  network: (route: Route) => route.abort('failed'),
  empty: [],
}

async function setup(page: Page, overrides: Record<string, MockValue>) {
  await page.clock.setFixedTime(new Date('2026-09-30T09:30:00'))
  await installApiMocks(page, {
    MenuService: menuWithCategories,
    CategoryService: localTree,
    'AttributeMappingService/getCategoryMapping': (r, h) => json(r, h, 200, { platformCategoryId: 1001 }),
    'IntegrationService/retrieveCategoriesFromIntegration': platformCategories,
    'IntegrationService/retrieveCommisionForCategoryFromIntegration': { commission: 12 },
    'IntegrationService/retrieveCategoryAttributesFromIntegration': platformAttributes,
    ChoiceService: choicesDoluFixture,
    'AttributeMappingService': [],
    'AttributeMappingService/getAttributeMapping': {},
    'IntegrationService/retrieveCategoryAttributeValuesFromIntegration': [{ id: 1, title: 'Kırmızı' }],
    ...overrides,
  })
  await gotoAuthed(page)
  await openCategoryListView(page)
  await page.getByRole('button', { name: 'Tişört ayarları' }).click()
  await page.locator('.categorySyncComponent .ek-platform-choice').first().click()
}

async function shot(page: Page, name: string, width: number, locatorSel?: string) {
  await page.waitForTimeout(500)
  if (locatorSel) await page.locator(locatorSel).last().evaluate((el) => el.scrollIntoView({ block: 'end' }))
  else await page.locator('.categorySyncComponent fieldset').last().evaluate((el) => el.scrollIntoView({ block: 'end' })).catch(() => {})
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${OUT}/mapping-${name}-${PHASE}-${width}.png` })
}

for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
  test.describe(`A6a inceleme mapping ${vp.w}`, () => {
    test.skip(!process.env.A6A_REVIEW, 'A6A_REVIEW=1 ile çalışır')
    test.use({ viewport: { width: vp.w, height: vp.h } })

    for (const [key, fail] of Object.entries(FAILS)) {
      test(`kategori ağacı ${key}`, async ({ page }) => {
        await setup(page, { 'IntegrationService/retrieveCategoriesFromIntegration': fail })
        await shot(page, `category-${key}`, vp.w)
      })
      test(`özellikler ${key}`, async ({ page }) => {
        await setup(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': fail })
        await shot(page, `choices-${key}`, vp.w)
      })
    }

    for (const key of ['5xx', 'empty']) {
      test(`değerler ${key}`, async ({ page }) => {
        await setup(page, { 'IntegrationService/retrieveCategoryAttributeValuesFromIntegration': FAILS[key] })
        await page.getByLabel('Platform seçeneği').click()
        await page.locator('.v-overlay--active .v-list-item').filter({ hasText: 'Renk' }).first().click()
        await page.getByRole('button', { name: /Seçenek Eşleştir/ }).click()
        await page.locator('.cm-card .v-field').first().click()
        await page.locator('.v-overlay--active .v-list-item').filter({ hasText: 'E2E Renk Grubu' }).first().click()
        await shot(page, `values-${key}`, vp.w, '.cm-card fieldset')
      })
    }

    if (PHASE === 'after') {
      test('teknik ayrıntı açık (kategori + özellik)', async ({ page }) => {
        await setup(page, { 'IntegrationService/retrieveCategoriesFromIntegration': FAILS['5xx'] })
        await page.locator('summary', { hasText: 'Teknik ayrıntı' }).first().click()
        await shot(page, 'category-tech', vp.w, 'details[open]')
        await expect(page.locator('details[open]')).toContainText('IntegrationService/retrieveCategoriesFromIntegration')
      })
      test('özellik teknik ayrıntı açık', async ({ page }) => {
        await setup(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': FAILS['5xx'] })
        await page.locator('summary', { hasText: 'Teknik ayrıntı' }).first().click()
        await shot(page, 'choices-tech', vp.w, 'details[open]')
      })
    }
  })
}

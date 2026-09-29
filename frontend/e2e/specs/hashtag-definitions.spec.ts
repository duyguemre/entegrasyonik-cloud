// ADR-0015 B5-2 — HashtagListView (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { hashtagsDoluFixture, hashtagsBosFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import type { Page } from '@playwright/test'

const menuFixtureWithHashtag = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? { ...link, children: [...link.children, { code: 'HashtagListView', parent: 'productDefinitions', title: 'hashtagList', icon: 'mdi-pound', singleton: true }] }
            : link,
        ),
      }
    : group,
)

async function openHashtagListView(page: Page) {
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

test.describe('P3 (B5-2) — Etiketler (HashtagListView)', () => {
  test('smoke: arama kutusu + etiket grubu satırları render olur', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithHashtag, HashtagService: hashtagsDoluFixture })
    await gotoAuthed(page)
    await openHashtagListView(page)

    await expectScreenOpen(page, '.hashtagListView')
    await expect(page.locator('.hashtagListView').getByText('E2E Kampanya Etiketi')).toBeVisible()
    await expect(page.locator('.hashtagListView').getByText('yaz-indirimi')).toBeVisible()
    await expect(page.locator('.hashtagListView').getByText('yeni-sezon')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Etiket Bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithHashtag, HashtagService: hashtagsBosFixture })
    await gotoAuthed(page)
    await openHashtagListView(page)

    await expectScreenOpen(page, '.hashtagListView')
    await expect(page.getByText('Etiket Bulunamadı')).toBeVisible()
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: 500 artık boş duruma düşmez; "Etiketler yüklenemedi" + "Tekrar dene".
  test('hata durumu: HashtagService 500 verdiğinde ham hata sızmaz, "yüklenemedi" + Tekrar dene gösterilir', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithHashtag, HashtagService: mockError(500) })
    await gotoAuthed(page)
    await openHashtagListView(page)

    await expectScreenOpen(page, '.hashtagListView')
    await expect(page.getByText('Etiketler yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: yeni etiket grubu adı yazıp ekle butonuna basınca addHashtag çağrısı yapılır', async ({ page }) => {
    let addHashtagCalled = false
    await installApiMocks(page, {
      MenuService: menuFixtureWithHashtag,
      HashtagService: hashtagsDoluFixture,
      'HashtagService/addHashtag': async (route, headers) => {
        addHashtagCalled = true
        const body = route.request().postDataJSON?.() ?? {}
        expect(body.title).toBe('E2E Yeni Etiket')
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: { _id: 'hashtag-new' } }) })
      },
    })
    await gotoAuthed(page)
    await openHashtagListView(page)

    await page.getByPlaceholder('Yeni Etiket Ekle').fill('E2E Yeni Etiket')
    await page.locator('.hashtagListView').getByRole('button').filter({ has: page.locator('.mdi-plus') }).first().click()
    await expect.poll(() => addHashtagCalled).toBe(true)
  })

  test('ekran görüntüsü tabanı (etiketler)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithHashtag, HashtagService: hashtagsDoluFixture })
    await gotoAuthed(page)
    await openHashtagListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('hashtag-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithHashtag, HashtagService: hashtagsDoluFixture })
    await gotoAuthed(page)
    await openHashtagListView(page)
    await expect(page.locator('.hashtagListView').getByText('E2E Kampanya Etiketi')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.hashtagListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-HashtagListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] HashtagListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

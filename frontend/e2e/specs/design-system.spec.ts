// DS-v2 Aşama 1 — geliştirme vitrini (/design-system). YENİ spec (ADR-0015 Karar 5.1).
// Smoke + WCAG 2.1 AA (axe, ihlal 0) + DS-v2 bileşenlerinin klavye sözleşmeleri.
// `DS_REVIEW_CAPTURE=1` ile inceleme görsellerini frontend/docs/design-system-review/ altına yazar
// (belge görselleri; Playwright tabanı DEĞİLDİR).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'

const SECTIONS = ['renk', 'yuzey', 'tipografi', 'olcek', 'buton', 'form', 'kart', 'rozet', 'diyalog', 'kabuk', 'liste', 'kademeli']

async function openVitrine(page: import('@playwright/test').Page) {
  await installApiMocks(page)
  await page.goto('/design-system')
  await expect(page.getByRole('heading', { level: 1, name: 'Tasarım sistemi' })).toBeVisible()
}

test.describe('DS-v2 vitrini (/design-system)', () => {
  test('tüm bölümler render olur, konsolda hata yok', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await openVitrine(page)
    for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toBeVisible()
    await expect(page.getByRole('table', { name: 'Sipariş listesi' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Sipariş sayfalama' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('axe WCAG 2.1 AA ihlali 0', async ({ page }) => {
    await openVitrine(page)
    const results = await new AxeBuilder({ page }).include('.dsv').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const summary = results.violations.map((v) => `${v.id}: ${v.nodes.length} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    expect(summary).toEqual([])
  })

  test('akıllı arama: ↓/Enter seçer, gruplu sonuç ve vurgu', async ({ page }) => {
    await openVitrine(page)
    const input = page.locator('#kabuk').getByRole('combobox', { name: 'Akıllı arama' })
    await expect(page.locator('#kabuk').getByRole('listbox')).toBeVisible()
    await expect(page.locator('#kabuk').getByRole('group', { name: 'Siparişler' })).toBeVisible()
    await expect(page.locator('#kabuk mark').first()).toHaveText('TY-1023')
    await input.focus()
    const before = await input.getAttribute('aria-activedescendant')
    await page.keyboard.press('ArrowDown')
    await expect(input).not.toHaveAttribute('aria-activedescendant', before ?? '')
  })

  test('workspace sekmeleri: ←/→ odak taşır, Enter etkinleştirir, Delete kapatır', async ({ page }) => {
    await openVitrine(page)
    const tablist = page.getByRole('tablist', { name: 'Açık ekranlar (sekme örneği)' })
    const active = tablist.getByRole('tab', { selected: true })
    await active.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(tablist.getByRole('tab', { name: /Ürün Listesi/ })).toHaveAttribute('aria-selected', 'true')
    const shellTabs = page.getByRole('tablist', { name: 'Açık ekranlar (örnek)' })
    const count = await shellTabs.getByRole('tab').count()
    await shellTabs.getByRole('tab', { selected: true }).focus()
    await page.keyboard.press('Delete')
    await expect(shellTabs.getByRole('tab')).toHaveCount(count - 1)
  })

  test('bağlam menüsü: açılır, ↓ ile gezilir, Esc kapatır', async ({ page }) => {
    await openVitrine(page)
    await page.getByRole('button', { name: 'Satır menüsü' }).click()
    const menu = page.getByRole('menu', { name: 'Sipariş işlemleri', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Detayı aç/ })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: /Yeni sekmede aç/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('tehlikeli diyalog: varsayılan odak Vazgeç, Esc kapatır', async ({ page }) => {
    await openVitrine(page)
    await page.getByRole('button', { name: 'Tehlikeli diyalog aç' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Vazgeç' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('tablo: sıralama aria-sort, tümünü seç', async ({ page }) => {
    await openVitrine(page)
    const table = page.getByRole('table', { name: 'Sipariş listesi' })
    const header = table.getByRole('columnheader', { name: /Tutar/ })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await table.getByRole('checkbox', { name: 'Tüm satırları seç' }).check()
    await expect(page.getByText(/18 sipariş seçildi/)).toBeVisible()
  })

  test('kademeli seçici: → alt kolona geçer, arama yaprak yollarını listeler', async ({ page }, testInfo) => {
    await openVitrine(page)
    // §12'de iki seçici var (ana + lazy); ana olanı başlığıyla (role=group) seç.
    const picker = page.locator('#kademeli').getByRole('group', { name: 'Pazaryeri kategorisi seç' })
    // Dar alanda (< 640px) seçici tek panel gösterir ve seçili yolun en derin seviyesinde açılır → önce seviye yolundan köke dön.
    if (testInfo.project.name === 'chromium-mobile') await picker.getByRole('button', { name: 'Ana kategoriler' }).click()
    await picker.getByRole('option', { name: /Elektronik/ }).click()
    await expect(picker.getByRole('listbox', { name: 'Elektronik' })).toBeVisible()
    await picker.getByRole('searchbox', { name: 'Kategori ara…' }).fill('kılıf')
    await expect(picker.getByRole('listbox', { name: 'Arama sonuçları' }).getByRole('option')).toHaveCount(1)
  })
})

test.describe('DS-v2 inceleme görselleri', () => {
  test.skip(!process.env.DS_REVIEW_CAPTURE, 'yalnızca DS_REVIEW_CAPTURE=1 ile')
  test('tam sayfa + bölüm yakın planları', async ({ page }, info) => {
    test.setTimeout(120_000)
    const dir = 'docs/design-system-review'
    const vw = Number(process.env.DS_REVIEW_WIDTH ?? 1440)
    await page.setViewportSize({ width: vw, height: vw >= 1440 ? 900 : 844 })
    await openVitrine(page)
    await page.waitForTimeout(800)
    if (vw >= 1440) {
      await page.screenshot({ path: `${dir}/00-vitrin-1440x900-tam.png`, fullPage: true })
      await page.screenshot({ path: `${dir}/00-vitrin-1440x900-ilk-ekran.png` })
      let n = 1
      for (const id of SECTIONS) {
        await page.locator(`#${id}`).screenshot({ path: `${dir}/${String(n++).padStart(2, '0')}-${id}.png` })
      }
      // Canlı etkileşim yakın planları
      await page.getByRole('button', { name: 'Satır menüsü' }).click()
      await page.waitForTimeout(400)
      await page.locator('#diyalog').screenshot({ path: `${dir}/20-canli-baglam-menusu.png` })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Tehlikeli diyalog aç' }).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${dir}/21-canli-tehlikeli-diyalog.png` })
    } else {
      await page.screenshot({ path: `${dir}/00-vitrin-390x844-tam.png`, fullPage: true })
      await page.screenshot({ path: `${dir}/00-vitrin-390x844-ilk-ekran.png` })
      for (const id of ['kabuk', 'liste', 'form']) {
        await page.locator(`#${id}`).screenshot({ path: `${dir}/m-${id}-390.png` })
      }
    }
    info.annotations.push({ type: 'capture', description: dir })
  })
})

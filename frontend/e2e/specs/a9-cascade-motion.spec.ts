// Faz 3 A9 — kademeli kategori seçici (ürün ekle "Kategori Seçimi") seviye geçiş sözleşmesi:
//  1) klasör seçilince sağdaki seviye GEÇİŞLE açılır (yalnız opacity/transform animasyonu), içerik zıplamaz
//  2) üst seviye değişince alt seviyeler derinden sığa SIRAYLA kapanır (data-close-step 0,1), yeni seviye sonra açılır
//  3) reduced-motion (işletim sistemi) ve `<html data-motion="reduced">` → animasyon yok (anında)
//  4) klavye: Enter/→ klasörü açar, odak yeni seviyenin İLK öğesine; aria-live seviye duyurusu
//  5) dar ekran (390): tek panel + seviye yolu; Geri ters yönde döner, odak üst seviyedeki seçili öğede
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const menu = [
  ...menuFixture,
  { group: 'a9HiddenProductForm', links: [{ code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true }] },
]
const leaf = (id: string, title: string) => ({ _id: id, title, children: [] })
const categoryTree = [
  {
    _id: 'root',
    title: 'Kategoriler',
    isMain: true,
    children: [
      {
        _id: 'moda',
        title: 'Moda',
        children: [
          { _id: 'kadin', title: 'Kadın', children: [{ _id: 'giyim', title: 'Giyim', children: [leaf('tisort', 'Tişört'), leaf('elbise', 'Elbise')] }, leaf('aksesuar', 'Aksesuar')] },
          { _id: 'erkek', title: 'Erkek', children: [leaf('e-tisort', 'Tişört')] },
        ],
      },
      { _id: 'elektronik', title: 'Elektronik', children: [leaf('kulaklik', 'Kulaklık')] },
      leaf('kitap', 'Kitap'),
    ],
  },
]

async function openPicker(page: Page) {
  await installApiMocks(page, { MenuService: menu, CategoryService: categoryTree })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  // B1 (mobilde tablo "Yeni ürün"ü örtüyor, ProductListView kapsamı) — doğrudan tıklama olayı.
  await page.getByRole('button', { name: 'Yeni ürün', exact: true }).evaluate((el: HTMLElement) => el.click())
  const picker = page.locator('.productDefinitionView .ek-cascade')
  await expect(picker).toBeVisible()
  return picker
}

/** Tıklar ve AYNI karede kolonların animasyon/sınıf durumunu okur (geçiş bitmeden). */
async function clickAndSample(page: Page, selector: string) {
  return page.evaluate(
    (sel) =>
      new Promise<{ props: string[]; closing: Array<{ key: string; step: string }>; entering: string[] }>((resolve) => {
        ;(document.querySelector(sel) as HTMLElement).click()
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const root = document.querySelector('.productDefinitionView .ek-cascade')!
            const props = document
              .getAnimations()
              .filter((a) => root.contains((a.effect as KeyframeEffect | null)?.target as Node))
              // Hem CSS transition'ları hem @keyframes animasyonları: canlandırılan TÜM özellikler.
              .flatMap((a) =>
                ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).flatMap((k) =>
                  Object.keys(k).filter((p) => !['offset', 'computedOffset', 'easing', 'composite'].includes(p)),
                ),
              )
              .map((p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
            const closing = [...root.querySelectorAll<HTMLElement>('.ek-cascade-col-leave-active')].map((el) => ({ key: el.dataset.key ?? '', step: el.dataset.closeStep ?? '' }))
            const entering = [...root.querySelectorAll<HTMLElement>('.ek-cascade-col-enter-active')].map((el) => el.dataset.key ?? '')
            resolve({ props, closing, entering })
          }),
        )
      }),
    selector,
  )
}

const opt = (id: string) => `.productDefinitionView .ek-cascade__track [data-id="${id}"]`

test.describe('A9 — kademeli seçici seviye geçişleri', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü sözleşmesi; dar ekran ayrı describe')
  })

  test('açılış geçişi yalnız opacity/transform; üst seviye değişince derinden sığa sıralı kapanış', async ({ page }) => {
    const picker = await openPicker(page)
    const open = await clickAndSample(page, opt('moda'))
    expect(open.entering).toEqual(['moda'])
    expect(open.props.length).toBeGreaterThan(0)
    for (const p of open.props) expect(['opacity', 'transform', 'color', 'background-color', 'border-color', 'box-shadow']).toContain(p)

    for (const id of ['kadin', 'giyim', 'tisort']) await picker.locator(`[data-id="${id}"]`).first().click()
    await expect(picker.locator('.ek-cascade__col.is-complete')).toContainText('Seçildi')
    await expect(picker.locator('.ek-cascade__tail-card.is-done')).toContainText('Tişört')

    const replace = await clickAndSample(page, opt('elektronik'))
    expect(replace.closing).toEqual(
      expect.arrayContaining([
        { key: 'giyim', step: '0' },
        { key: 'kadin', step: '1' },
        { key: 'moda', step: '2' },
      ]),
    )
    expect(replace.entering).toEqual(['elektronik'])
    for (const p of replace.props) expect(['opacity', 'transform', 'color', 'background-color', 'border-color', 'box-shadow']).toContain(p)
    await expect(picker.locator('.ek-cascade__col')).toHaveCount(2)
  })

  test('reduced-motion (sistem) → animasyon yok; data-motion="reduced" → statik', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openPicker(page)
    const sys = await clickAndSample(page, opt('moda'))
    expect(sys.props.filter((p) => p === 'opacity' || p === 'transform')).toEqual([])

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(() => (document.documentElement.dataset.motion = 'reduced'))
    const pref = await clickAndSample(page, opt('elektronik'))
    expect(pref.props).toEqual([])
    await expect(page.locator('.productDefinitionView .ek-cascade__columns')).toHaveClass(/is-static/)
  })

  test('klavye: Enter klasörü açar, odak yeni seviyenin ilk öğesine; aria-live duyurur; ← geri', async ({ page }) => {
    const picker = await openPicker(page)
    await picker.getByRole('searchbox', { name: 'Kategori ara…' }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(picker.getByRole('option', { name: /Moda/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(picker.getByRole('listbox', { name: 'Moda' }).getByRole('option').first()).toBeFocused()
    await expect(picker.locator('[aria-live="polite"]')).toHaveText('2. seviye: Moda, 2 öğe')
    await page.keyboard.press('End')
    await expect(picker.getByRole('option', { name: /Erkek/ })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(picker.getByRole('listbox', { name: 'Erkek' }).getByRole('option', { name: /Tişört/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(picker.locator('[aria-live="polite"]')).toHaveText('Seçildi: Moda › Erkek › Tişört')
    await page.keyboard.press('ArrowLeft')
    await expect(picker.getByRole('option', { name: /Erkek/ })).toBeFocused()
  })
})

test.describe('A9 — dar ekran (390): tek panel + seviye yolu', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Görünüm alanı sabit; tek projede koşar')
  })

  test('ileri tek panel, yol kırıntısı; Geri ters yön + odak; yaprakta onay rozeti', async ({ page }) => {
    const picker = await openPicker(page)
    await expect(picker.locator('.ek-cascade__col')).toHaveCount(1)
    const fwd = await clickAndSample(page, opt('moda'))
    expect(fwd.entering).toEqual(['moda'])
    expect(fwd.closing.map((c) => c.key)).toEqual(['root'])
    await expect(picker.locator('.ek-cascade__columns')).toHaveClass(/is-dir-forward/)

    const trail = picker.getByRole('navigation', { name: 'Seviye yolu' })
    await expect(trail).toContainText('Ana kategoriler')
    await expect(trail).toContainText('Moda')
    await expect(picker.locator('.ek-cascade__col')).toHaveCount(1)

    await picker.getByRole('option', { name: /Kadın/ }).click()
    await picker.getByRole('option', { name: /Aksesuar/ }).click()
    await expect(trail).toContainText('Seçildi')

    await trail.getByRole('button', { name: /^Geri:/ }).click()
    await expect(picker.locator('.ek-cascade__columns')).toHaveClass(/is-dir-back/)
    await expect(picker.getByRole('option', { name: /Kadın/ })).toBeFocused()
    await trail.getByRole('button', { name: 'Ana kategoriler', exact: true }).click()
    await expect(picker.getByRole('option', { name: /Moda/ })).toHaveAttribute('aria-selected', 'true')
  })
})

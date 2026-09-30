// Faz 3 A9 — kademeli kategori seçici seviye geçişleri: adım adım inceleme kareleri (seçim öncesi / geçiş ortası /
// sonrası). İddia yok; günlük koşuda ATLANIR. Geçiş ortası: tıklamadan 2 kare sonra sayfadaki TÜM animasyonlar
// (CSS transition'ları dahil) duraklatılır ve `currentTime` sabitlenir → kare deterministik.
//   A9_REVIEW=1 A9_WIDTH=1440|390 E2E_PORT=4394 \
//     npx playwright test e2e/specs/a9-review.spec.ts --project=chromium-desktop --workers=1
// Dosya adı: `docs/a9-review/NN-<adım>-<genişlik>.png`. Veri sentetik (PII yok).
import { test, expect, type Locator, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const ENABLED = process.env.A9_REVIEW === '1'
const WIDTH = Number(process.env.A9_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A9_OUT || 'docs/a9-review'
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`

const menu = [
  ...menuFixture,
  {
    group: 'a9HiddenProductForm',
    links: [{ code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true }],
  },
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
          {
            _id: 'kadin',
            title: 'Kadın',
            children: [
              { _id: 'giyim', title: 'Giyim', children: [leaf('tisort', 'Tişört'), leaf('elbise', 'Elbise'), leaf('gomlek', 'Gömlek'), leaf('pantolon', 'Pantolon')] },
              { _id: 'ayakkabi', title: 'Ayakkabı', children: [leaf('sneaker', 'Sneaker'), leaf('topuklu', 'Topuklu Ayakkabı')] },
              leaf('aksesuar', 'Aksesuar'),
            ],
          },
          { _id: 'erkek', title: 'Erkek', children: [leaf('e-tisort', 'Tişört'), leaf('e-gomlek', 'Gömlek')] },
          { _id: 'cocuk', title: 'Çocuk', children: [leaf('bebek', 'Bebek Giyim')] },
        ],
      },
      {
        _id: 'elektronik',
        title: 'Elektronik',
        children: [
          { _id: 'telefon', title: 'Cep Telefonu Aksesuarları', children: [leaf('kilif', 'Kılıf'), leaf('sarj', 'Şarj Cihazı')] },
          leaf('kulaklik', 'Kulaklık'),
        ],
      },
      { _id: 'ev', title: 'Ev ve Yaşam', children: [leaf('mutfak', 'Mutfak'), leaf('banyo', 'Banyo')] },
      { _id: 'kozmetik', title: 'Kozmetik ve Kişisel Bakım', children: [leaf('cilt', 'Cilt Bakımı')] },
      leaf('kitap', 'Kitap'),
    ],
  },
]

async function settle(page: Page, ms = 450) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/** Öğeye tıklar, 2 kare bekler, tüm animasyonları `at` ms'de dondurur. */
async function clickAndFreeze(page: Page, target: Locator, at: number) {
  await target.evaluate((el: HTMLElement) => el.click())
  await page.evaluate(
    (t) =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            for (const a of document.getAnimations()) {
              a.pause()
              a.currentTime = t
            }
            resolve()
          }),
        ),
      ),
    at,
  )
}

async function release(page: Page) {
  await page.evaluate(() => document.getAnimations().forEach((a) => (a.effect?.getComputedTiming().endTime === Infinity ? a.play() : a.finish())))
  await settle(page, 350)
}

async function openPicker(page: Page) {
  await installApiMocks(page, { MenuService: menu, CategoryService: categoryTree })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  // B1 (mobilde tablo "Yeni ürün"ü örtüyor) — inceleme için doğrudan tıklama olayı.
  await page.getByRole('button', { name: 'Yeni ürün', exact: true }).evaluate((el: HTMLElement) => el.click())
  const picker = page.locator('.productDefinitionView .ek-cascade')
  await expect(picker).toBeVisible()
  await picker.scrollIntoViewIfNeeded()
  await settle(page, 700)
  return picker
}

const option = (picker: Locator, name: string | RegExp) => picker.getByRole('option', { name }).first()

test.describe('A9 kademeli seçici geçiş kareleri', () => {
  test.skip(!ENABLED, 'Yalnızca A9_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  test('ürün ekle — ileri, derin, yaprak onayı, üst seviye değişimi, geri', async ({ page }) => {
    const picker = await openPicker(page)
    const shot = async (name: string) => picker.screenshot({ path: file(name), animations: 'allow' })

    await page.screenshot({ path: file('00-sayfa-secim-oncesi') })
    await shot('01-secim-oncesi')

    await clickAndFreeze(page, option(picker, /Moda/), WIDTH > 640 ? 90 : 170)
    await shot('02-ileri-gecis-ortasi')
    await release(page)
    await shot('03-ileri-sonrasi')

    await option(picker, /Kadın/).click()
    await settle(page, 350)
    await option(picker, /Giyim/).click()
    await settle(page, 350)
    await clickAndFreeze(page, option(picker, /Tişört/), 110)
    await shot('04-yaprak-onay-gecis-ortasi')
    await release(page)
    await shot('05-yaprak-onay-sonrasi')
    await page.screenshot({ path: file('12-sayfa-yaprak-secili') })

    if (WIDTH > 640) {
      // Üst seviye değişimi: Giyim → Kadın kapanır (derinden sığa), Elektronik açılır.
      await clickAndFreeze(page, option(picker, /Elektronik/), 70)
      await shot('06-yenile-gecis-ortasi')
      await release(page)
      await shot('07-yenile-sonrasi')
    } else {
      // Tek panel: seviye yolundan geri (ters yön), sonra yeni dal ileri.
      await clickAndFreeze(page, picker.getByRole('button', { name: /^Geri:/ }), 170)
      await shot('06-geri-gecis-ortasi')
      await release(page)
      await shot('07-geri-sonrasi')
      await picker.getByRole('navigation', { name: 'Seviye yolu' }).getByRole('button', { name: 'Ana kategoriler', exact: true }).click()
      await settle(page, 350)
      await shot('08-kok-seviye')
    }
  })

  test('vitrin — alt seviye yüklenirken iskelet, sonra liste', async ({ page }) => {
    await page.goto('/design-system')
    const picker = page.locator('.ds-cascade-lazy')
    await picker.scrollIntoViewIfNeeded()
    await settle(page, 600)
    await option(picker, /Moda/).click()
    await page.waitForTimeout(260)
    await picker.screenshot({ path: file('09-iskelet-yukleniyor') })
    await page.waitForFunction(() => !!document.querySelector('.ds-cascade-lazy .ek-cascade-swap-enter-active'), null, { polling: 'raf' })
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        a.pause()
        a.currentTime = 100
      }),
    )
    await picker.screenshot({ path: file('10-iskelet-liste-gecis-ortasi') })
    await release(page)
    await picker.screenshot({ path: file('11-iskelet-sonrasi') })
  })
})

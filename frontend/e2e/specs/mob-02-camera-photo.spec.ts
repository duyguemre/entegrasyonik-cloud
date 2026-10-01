// MOB-02 — kamerayla ürün fotoğrafı (ürün galerisi). Gerçek Chromium tuvaliyle uçtan uca:
//   • yalnız dokunmatik/mobil genişlikte "Fotoğraf çek" + `accept="image/*" capture="environment"` girişi; masaüstünde yok
//   • 4000×3000, GPS'li EXIF taşıyan JPEG → yükleme isteğinde ≤ 2400 px uzun kenar, Exif/GPS YOK, JPEG, ≤ 10 MB
//   • hata durumları: fotoğraf olmayan dosya, çözülemeyen görüntü → kullanıcı diliyle red satırı (ham hata yok)
//   • axe (WCAG 2.1 AA) galeri diyaloğunda
// Sahte medya: girdi fotoğrafı tarayıcıda tuvalle üretilir, Node'da EXIF (GPS) bölütü eklenir; yükleme ağ düzeyinde taklit.
// İnceleme (MOB2_REVIEW=1): ekran görüntüleri → MOB2_OUT (varsayılan docs/fe-mob2-review/<genişlik>).
//   MOB2_REVIEW=1 MOB2_WIDTHS=390,430 npx playwright test e2e/specs/mob-02-camera-photo.spec.ts -c playwright.cloud.config.ts --project=chromium-mobile
import { mkdirSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'

const REVIEW = process.env.MOB2_REVIEW === '1'
const WIDTHS = (process.env.MOB2_WIDTHS || '390').split(',').map(Number)
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const product = buildProduct({
  _id: 'product-e2e-mob2',
  title: 'Kamera Test Ürünü',
  hasVariant: false,
  variants: [{ tempId: 'mob2-1', stockcode: 'SK-MOB2', barcode: '8690000000301', choices: [], prices: { salePrice: 99.9, marketPrice: 119.9, isPlatformBasedPrice: false }, stock: 5, images: [], platforms: {} }],
  images: [],
  category: 'category-e2e-1',
})

// ---------------------------------------------------------------- JPEG yardımcıları (Node)

/** APP1 Exif bölütü (GPS etiketi metniyle) — gerçek telefon fotoğrafındaki konum bilgisinin yerine geçer. */
function exifSegment(): Buffer {
  const payload = Buffer.concat([
    Buffer.from('Exif\0\0MM\0\x2a\0\0\0\x08', 'latin1'),
    Buffer.from('GPSLatitude=41.0082N;GPSLongitude=28.9784E;Make=TelefonX', 'latin1'),
  ])
  const len = payload.length + 2
  return Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), payload])
}

function withExif(jpeg: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(), jpeg.subarray(2)])
}

/** SOFn başlığından boyut. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const m = b[i + 1]
    const len = b.readUInt16BE(i + 2)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

/** Multipart gövdesinden `files` parçasının baytları. */
function filePart(body: Buffer): { name: string; type: string; bytes: Buffer } | null {
  const text = body.toString('latin1')
  const m = /Content-Disposition: form-data; name="files"; filename="([^"]*)"\r\nContent-Type: ([^\r]+)\r\n\r\n/.exec(text)
  if (!m) return null
  const start = m.index + m[0].length
  const end = text.indexOf('\r\n--', start)
  return { name: m[1], type: m[2], bytes: body.subarray(start, end) }
}

/** Tarayıcıda sahte "telefon fotoğrafı" (degrade + ürün silueti) üretir. */
async function fakePhoto(page: Page, width = 4000, height = 3000): Promise<Buffer> {
  const b64 = await page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#d9dde3')
    g.addColorStop(1, '#f4f5f7')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#2f4a7a'
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, w / 5, h / 3, 0, 0, Math.PI * 2)
    ctx.fill()
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  }, { w: width, h: height })
  return Buffer.from(b64, 'base64')
}

// ---------------------------------------------------------------- akış

interface Captured { name: string; type: string; bytes: Buffer }

async function openGallery(page: Page, uploads: Captured[] = []) {
  let images: any[] = []
  await page.route('**/e2e-mob2/**', (route) => {
    const last = uploads[uploads.length - 1]
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: last?.bytes ?? Buffer.alloc(0) })
  })
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    'ProductService/retrieveProduct': { product },
    getImages: { get images() { return images } },
    upload: async (route: Route, headers: Record<string, string>) => {
      const part = filePart(route.request().postDataBuffer() ?? Buffer.alloc(0))
      if (part) uploads.push(part)
      const size = part ? jpegSize(part.bytes) : null
      images = [...images, {
        _id: `mob2-img-${uploads.length}`, url: `http://127.0.0.1/e2e-mob2/${uploads.length}.jpg`, originalname: part?.name,
        width: size?.width, height: size?.height, order: images.length, extension: 'jpg',
      }]
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: images }) })
    },
  })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
      localStorage.setItem('ek-pwa-install-dismissed', '1')
    } catch { /* depolama kapalı */ }
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView').getByRole('button', { name: 'Ürünü düzenle' }).first().click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Tekil Ürün Bilgisi')).toBeVisible({ timeout: 20_000 })
  await root.getByText('Ürün Tanımı').click()
  await root.locator('[data-pf-field="gallery"]').click()
  const dialog = page.locator('.v-overlay--active:not(.v-snackbar)').filter({ hasText: 'Ürün Resim Galerisi' }).first()
  await expect(dialog).toBeVisible()
  return dialog
}

async function axe(page: Page) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
  return r.violations.map((v) => `${v.id}: ${v.nodes.length}`)
}

for (const width of WIDTHS) {
  test.describe(`MOB-02 kamera fotoğrafı @${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const out = `${process.env.MOB2_OUT || 'docs/fe-mob2-review'}/${width}`

    test('fotoğraf çek → küçültülür, EXIF/GPS silinir, aynı yükleme ucuna gider', async ({ page }) => {
      test.setTimeout(90_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const uploads: Captured[] = []
      const dialog = await openGallery(page, uploads)

      const camBtn = dialog.getByRole('button', { name: 'Fotoğraf çek' })
      await expect(camBtn).toBeVisible()
      const box = await camBtn.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      const camInput = page.locator('input.pig-file--camera')
      await expect(camInput).toHaveAttribute('accept', 'image/*')
      await expect(camInput).toHaveAttribute('capture', 'environment')
      expect(await axe(page)).toEqual([])
      if (REVIEW) {
        mkdirSync(out, { recursive: true })
        await page.screenshot({ path: `${out}/galeri-bos-kamera.png` })
      }

      const original = withExif(await fakePhoto(page))
      expect(original.includes(Buffer.from('GPSLatitude'))).toBe(true)
      expect(original.length).toBeGreaterThan(50_000)
      await camInput.setInputFiles({ name: 'image.jpg', mimeType: 'image/jpeg', buffer: original })

      await expect.poll(() => uploads.length, { timeout: 20_000 }).toBe(1)
      const up = uploads[0]
      expect(up.type).toBe('image/jpeg')
      expect(up.name).toMatch(/^kamera-\d{8}-\d{6}\.jpg$/)
      expect(up.bytes[0]).toBe(0xff)
      expect(up.bytes[1]).toBe(0xd8)
      expect(up.bytes.includes(Buffer.from('Exif'))).toBe(false)
      expect(up.bytes.includes(Buffer.from('GPS'))).toBe(false)
      expect(up.bytes.includes(Buffer.from('TelefonX'))).toBe(false)
      expect(jpegSize(up.bytes)).toEqual({ width: 2400, height: 1800 })
      expect(up.bytes.length).toBeLessThanOrEqual(10 * 1024 * 1024)

      await expect(dialog.locator('.pig-tile[data-id]')).toHaveCount(1)
      await expect(dialog.getByRole('button', { name: 'Fotoğraf çek' })).toBeVisible()
      expect(await axe(page)).toEqual([])
      if (REVIEW) await page.screenshot({ path: `${out}/galeri-kamera-yuklendi.png` })
    })

    test('hata durumları: fotoğraf olmayan dosya ve çözülemeyen görüntü → kullanıcı diliyle red, yükleme yok', async ({ page }) => {
      test.setTimeout(60_000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const uploads: Captured[] = []
      const dialog = await openGallery(page, uploads)
      const camInput = page.locator('input.pig-file--camera')

      await camInput.setInputFiles({ name: 'fatura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sahte') })
      const alert = dialog.locator('.ek-alert, [role="alert"], [role="status"]').filter({ hasText: 'dosya eklenmedi' }).first()
      await expect(alert).toBeVisible()
      await expect(alert).toContainText('Bu dosya bir fotoğraf değil')

      await camInput.setInputFiles({ name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xd9]) })
      await expect(dialog.getByText('Fotoğraf bu tarayıcıda açılamadı')).toBeVisible()
      await expect(dialog.getByText(/DOMException|InvalidStateError|decode/i)).toHaveCount(0)
      expect(uploads).toHaveLength(0)
      expect(await axe(page)).toEqual([])
      if (REVIEW) {
        mkdirSync(out, { recursive: true })
        await page.screenshot({ path: `${out}/galeri-kamera-hata.png` })
      }
    })
  })
}

test.describe('MOB-02 masaüstü', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  test('fare/masaüstünde "Fotoğraf çek" ve kamera girişi yok; dosya seçimi aynen', async ({ page }) => {
    const dialog = await openGallery(page)
    await expect(dialog.getByRole('button', { name: /Görsel|cihazınızdan/ }).first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Fotoğraf çek' })).toHaveCount(0)
    await expect(page.locator('input.pig-file--camera')).toHaveCount(0)
    await expect(page.locator('input.pig-file:not(.pig-file--camera)')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })
})

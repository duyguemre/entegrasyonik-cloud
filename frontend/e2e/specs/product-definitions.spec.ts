// ADR-0015 B5-1 — ProductDefinitionView (Yeni ürün) + ProductUpdateView (Ürünü düzenle).
//
// Bu iki ekran, B5 kapsamındaki 10 `views/secure/definitions/**` ekranı arasında CANLI ve
// GERÇEKTEN erişilebilir olan tek çifttir (grep ile doğrulandı, 2026-09-29): her ikisi de
// `ProductListView.vue` (B1 kapsamı, DOKUNULMADI) üzerinden `menuStore.getMenuLinkWithTitle(...)`
// + `eventBus.emit('openTab', ...)` deseniyle açılıyor (bkz. `ProductListView.vue`
// `openProductDefinition`/`openEditProduct`). B5'in diğer 8 ekranı için CANLI bir tetikleyici
// YOK (bkz. `category-definition.spec.ts` ve `legacy-definition-placeholders.spec.ts` baş yorumu).
//
// `e2e/fixtures/nav.ts`'in paylaşılan `menuFixture`'ında ('sale' grubu) `title: 'productDefinition'`
// / `title: 'productUpdate'` bağlantıları YOK (yalnızca `ProductListView` çocuğu var) — üretimde
// bu başlıklar ApplicationDB `menus`'ta muhtemelen ayrı, sidebar'da GÖRÜNMEYEN girişlerdir
// (`useOpenIntegrationConfigTab.ts`'teki AYNI desen: "GERÇEK menü kaydı bu görevin kapsamı DIŞI").
// Bu yüzden nav.ts'e DOKUNMADAN (kapsam dışı, B1/A3 sahipliğinde), bu dosyaya ÖZEL sentetik bir
// menü grubu ekleniyor — `menuFixtureWithAdmin`/`menuFixtureWithIntegrationConfig` (nav.ts) ile
// AYNI desen, yalnızca bu spec dosyasında yaşıyor.
//
// ORTAM NOTU: ilk bulut oturumunda Chromium indirilemedi (`cdn.playwright.dev` 403) ve spec
// statik okumayla yazıldı. 2026-09-29 ikinci bulut oturumunda önceden kurulu Chromium ile
// ÇALIŞTIRILDI (seçici hatası düzeltildi). Görsel onay yine yerelde (Windows tabanları) yapılır.
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const menuFixtureWithProductDefinitions = [
  ...menuFixture,
  {
    group: 'b5_1HiddenProductDefinitions',
    links: [
      // `parent`/`code` `stores/site/menu.ts` `views` Map anahtarıyla birebir eşleşir
      // (`views.get(parent + '/' + code)`): 'definitions/ProductDefinitionView'.
      { code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true },
      // `ProductUpdateView`'in `views` Map anahtarı İSTİSNAİ OLARAK önek TAŞIMAZ (bare
      // 'ProductUpdateView') — bu yüzden `parent: ''`.
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

function withMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithProductDefinitions, ...overrides }
}

test.describe('B5-1 — Ürün tanımlama (ProductDefinitionView)', () => {
  test('smoke: "Yeni ürün" tıklanınca sihirbaz açılır, ilk adım "Kategori Seçimi"dir, Kaydet devre dışıdır', async ({ page }, testInfo) => {
    // BİLİNEN HATA (B1 kapsamı, ProductListView — bu görevde DÜZELTİLMEDİ, insan onayı): 375px
    // mobil görünümde ürün tablosu (`.plv-table`) EkPageHeader'daki "Yeni ürün" düğmesinin
    // üzerine biner ve tıklamayı yutar ("subtree intercepts pointer events", bulut koşusu
    // 2026-09-29). Tetikleyici mobilde erişilemez olduğu için bu viewport `fixme` olarak işaretli.
    test.fixme(testInfo.project.name === 'chromium-mobile', 'B1: ProductListView tablosu mobilde "Yeni ürün" düğmesini örtüyor')
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    // `exact`: ProductListView'de adı "Yeni ürün" İÇEREN 3 düğme var ("Yeni ürün seçeneği ekle",
    // "Yeni ürün ekle") — bulut koşusunda (2026-09-29) strict mode ihlali verdi.
    await page.getByRole('button', { name: 'Yeni ürün', exact: true }).click()

    const root = page.locator('.productDefinitionView')
    await expect(root).toBeVisible()
    await expect(root.getByRole('heading', { level: 1, name: 'Yeni Ürün' })).toBeVisible()
    await expect(root.getByText('Kategori Seçimi', { exact: true })).toBeVisible()
    await expect(root.getByText('Ürün Tanımı', { exact: true })).toBeVisible()
    await expect(root.getByText('Detay Bilgiler', { exact: true })).toBeVisible()
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md önerisi): `isSaveDisabled()`
    // yalnızca `category` + `brand` + tamamlanmış bir varyant varsa `false` döner; kategori/marka
    // seçilmeden Kaydet HER ZAMAN devre dışıdır.
    await expect(root.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
  })
})

test.describe('B5-1 — Ürün güncelleme (ProductUpdateView)', () => {
  test('smoke: satırdaki "Ürünü düzenle" tıklanınca ürün bilgisiyle sekme açılır, Güncelle devre dışıdır', async ({ page }) => {
    const product = buildProduct()
    await installApiMocks(page, withMenu({
      'ProductService/retrieveProduct': { product },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()

    const root = page.locator(`.productUpdateView${product._id}`)
    await expect(root).toBeVisible()
    await expect(root.getByRole('heading', { level: 1, name: 'Ürünü Düzenle' })).toBeVisible()
    await expect(root.getByText('Kategori Seçimi', { exact: true })).toBeVisible()
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md önerisi): sabit fixture'da
    // `brand`/`category` `null` olduğu için `isUpdateDisabled()` HER ZAMAN `true` döner; bu,
    // gerçek (kategori/marka atanmış) bir üründe farklı davranabilir.
    await expect(root.getByRole('button', { name: 'Güncelle' })).toBeDisabled()
  })

  test('yükleniyor durumu: ürün bilgisi gelene kadar sade bir iskelet gösterilir (YENİ — önceden bu aralıkta hiçbir geri bildirim yoktu)', async ({ page }) => {
    // BİLİNÇLİ TAMAMLAMA (Karar 5.1 değişiklik listesi, B5-1): `retrieveProduct()` tamamlanana
    // kadar `v-if="initialized"` formu göstermiyordu ve ÖNCEDEN bu aralıkta hiçbir yükleniyor
    // göstergesi YOKTU (boş ekran). Davranış AYNI kalır (form hâlâ `initialized` olduğunda
    // render olur), yalnızca bu bekleme aralığına `EkSkeleton` eklendi.
    const product = buildProduct()
    let resolveRetrieve: (() => void) | undefined
    await installApiMocks(page, withMenu({
      'ProductService/retrieveProduct': async (route: any, headers: any) => {
        await new Promise<void>((resolve) => {
          resolveRetrieve = resolve
        })
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ product }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()

    const root = page.locator(`.productUpdateView${product._id}`)
    await expect(root.locator('.v-skeleton-loader').first()).toBeVisible()

    resolveRetrieve?.()
    await expect(root.getByRole('heading', { level: 1, name: 'Ürünü Düzenle' })).toBeVisible()
  })
})

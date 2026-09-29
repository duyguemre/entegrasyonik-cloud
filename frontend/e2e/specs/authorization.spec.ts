// ADR-0015 B5-3 — user/AuthorizationListView.vue + components/user/UserAddComponent.vue.
// Protokol 13: bu spec önce DEĞİŞMEMİŞ ekrana karşı yazıldı (karakterizasyon).
import { test, expect } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

function withAccountMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAccountSupport, ...overrides }
}

const usersDoluFixture = {
  users: [
    { _id: 'user-e2e-0001', name: 'Elif', surname: 'Yıldız', email: 'elif.yildiz@example.com', roleCode: 'MANAGER', owner: false, isGlobalAdmin: false, createdAt: '2026-01-15T10:00:00.000Z' },
    { _id: 'user-e2e-0002', name: 'Deniz', surname: 'Kaya', email: 'deniz.kaya@example.com', roleCode: undefined, owner: true, isGlobalAdmin: false, createdAt: '2025-11-02T08:30:00.000Z' },
    { _id: 'user-e2e-0003', name: 'Aylin', surname: 'Demir', email: 'aylin.demir@example.com', roleCode: undefined, owner: false, isGlobalAdmin: true, createdAt: '2025-09-05T09:15:00.000Z' },
  ],
  totalNumberOfRecords: 3,
  fromTo: {},
}

const usersBosFixture = { users: [], totalNumberOfRecords: 0, fromTo: {} }

const rolesFixture = [
  { code: 'MANAGER', name: 'Yönetici', description: 'Katalog ve siparişleri yönetebilir.' },
  { code: 'STAFF', name: 'Personel', description: 'Sınırlı, salt-okunur erişim.' },
]

test.describe('ADR-0015 B5-3 — AuthorizationListView + UserAddComponent', () => {
  test('smoke: arama alanı + personel satırları render olur', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': usersDoluFixture, 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    await expect(page.locator('.authorizationListView')).toBeVisible()
    await expect(page.getByLabel('İsim, e-posta veya yetki ara...', { exact: true })).toBeVisible()
    await expect(page.getByText('Elif Yıldız')).toBeVisible()
    await expect(page.getByText('elif.yildiz@example.com')).toBeVisible()
    await expect(page.locator('.authorizationListView tbody tr')).toHaveCount(3)
  })

  test('karakterizasyon: rol rozeti ham `roleCode` metnini gösterir (rol adına ÇEVRİLMİYOR)', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': usersDoluFixture, 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    // Elif: roleCode='MANAGER', owner=false, isGlobalAdmin=false -> rozet ham kodu gösterir ("Yönetici" DEĞİL).
    await expect(page.getByText('MANAGER', { exact: true })).toBeVisible()
    // Deniz: owner=true -> "MAĞAZA YÖNETİCİSİ".
    await expect(page.getByText('MAĞAZA YÖNETİCİSİ')).toBeVisible()
    // Aylin: isGlobalAdmin=true -> "SÜPER YÖNETİCİ".
    await expect(page.getByText('SÜPER YÖNETİCİ')).toBeVisible()
  })

  test('karakterizasyon: mağaza yöneticisinin (owner) silme düğmesi devre dışıdır', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': usersDoluFixture, 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    const denizRow = page.locator('.authorizationListView tbody tr', { hasText: 'Deniz Kaya' })
    await expect(denizRow.locator('button:has(.mdi-delete)')).toBeDisabled()
    const elifRow = page.locator('.authorizationListView tbody tr', { hasText: 'Elif Yıldız' })
    await expect(elifRow.locator('button:has(.mdi-delete)')).toBeEnabled()
  })

  test('boş durum: "Personel Bulunamadı" mesajı gösterilir', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': usersBosFixture, 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    await expect(page.getByText('Personel Bulunamadı')).toBeVisible()
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: 500 artık boş duruma DÜŞMEZ; "Personel listesi yüklenemedi" + "Tekrar dene" gösterilir.
  // (Boş durumdaki "TÜMÜNÜ GÖSTER" eylemi de kalktı: filtre sonucu boşsa "Filtreleri temizle" çıkar.)
  test('hata durumu: 500 alındığında "Personel listesi yüklenemedi" + "Tekrar dene" gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': mockError(500), 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    await expect(page.getByText('Personel listesi yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  })

  test('yeni kullanıcı ekle: "+" ile diyalog açılır, form gönderilince UserService/createUser çağrılır', async ({ page }) => {
    let created: any = null
    await installApiMocks(page, withAccountMenu({
      'UserService/getUsers': usersDoluFixture,
      'UserService/getRoles': rolesFixture,
      'UserService/createUser': async (route: any, headers: any) => {
        created = route.request().postDataJSON?.()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(true) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    await page.locator('.authorizationListView button:has(.mdi-plus)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni Kullanıcı Ekle' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('İsim', { exact: true }).fill('Yeni')
    await dialog.getByLabel('Soyisim', { exact: true }).fill('Personel')
    await dialog.getByLabel('E-posta Adresi', { exact: true }).fill('yeni.personel@example.com')
    await dialog.getByRole('button', { name: 'Kaydet' }).click()

    await expect.poll(() => created).not.toBeNull()
    expect(created.user.name).toBe('Yeni')
    expect(created.user.email).toBe('yeni.personel@example.com')
  })

  test('düzenle: kalem ikonuna tıklayınca mevcut kullanıcı bilgileriyle diyalog açılır', async ({ page }) => {
    await installApiMocks(page, withAccountMenu({ 'UserService/getUsers': usersDoluFixture, 'UserService/getRoles': rolesFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    const elifRow = page.locator('.authorizationListView tbody tr', { hasText: 'Elif Yıldız' })
    await elifRow.locator('button:has(.mdi-pencil)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Kullanıcı Düzenle' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('İsim', { exact: true })).toHaveValue('Elif')
  })

  test('yetkisiz kullanıcı: NoAuthorizationComponent gösterilir, tablo render edilmez', async ({ page }) => {
    // `checkAuthorization('navigation.authorization')` (composables/user.ts): `owner!==true` VE
    // `resources` bu kodu içeriyorsa true döner -> `v-if` NoAuthorizationComponent'i açar.
    await installApiMocks(page, withAccountMenu({
      userContext: { ...userContextFixture, owner: false, resources: ['navigation.authorization'] },
      'UserService/getUsers': usersDoluFixture,
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AuthorizationListView')

    await expect(page.locator('.authorizationListView table')).toHaveCount(0)
  })
})

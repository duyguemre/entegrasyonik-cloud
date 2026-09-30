// ADR-0015 B5-3 — components/user/NotificationDrawerComponent.vue.
// Protokol 13: bu spec önce DEĞİŞMEMİŞ bileşene karşı yazıldı (karakterizasyon).
//
// KARAKTERİZASYON NOTU (C1.5 ile DÜZELTİLDİ — ilk test bilinçli olarak güncellendi): `stores/
// notificationDrawer.ts`'in `startPolling()`'i (10sn'de bir `fetchNotifications()` çağıran
// polling) HİÇBİR YERDEN çağrılmıyor (grep ile doğrulandı — yalnızca kendi tanımında var);
// `fetchNotifications()` de shell açılışında/`drawer` açılışında DOĞRUDAN ÇAĞRILMIYOR. Yani
// çekmece ilk açıldığında (ve ApplicationBar'daki okunmamış rozet) veri ASLA otomatik
// YÜKLENMİYOR — yalnızca "Tümünü Okundu İşaretle"/"Tümünü Sil" (id'siz, toplu) eylemleri
// `fetchNotifications()`'ı YAN ETKİ olarak tetikliyor. Bu davranış AYNEN korunuyor.
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'

const notificationsFixture = {
  result: true,
  unreadCount: 2,
  data: [
    {
      _id: 'notif-e2e-0001',
      title: 'E2E içe aktarma tamamlandı',
      message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.',
      severity: 'success',
      isRead: false,
      type: 'IMPORT_READY',
      mode: 'IMPORT',
      createdAt: '2026-09-29T09:00:00.000Z',
      metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42, invalidCount: 3 },
    },
    {
      _id: 'notif-e2e-0002',
      title: 'E2E senkronizasyon uyarısı',
      message: 'Hepsiburada bağlantısında gecikme tespit edildi.',
      severity: 'warning',
      isRead: true,
      createdAt: '2026-09-28T15:30:00.000Z',
    },
  ],
}

function withNotifications(overrides: Record<string, any> = {}) {
  return {
    NotificationService: notificationsFixture,
    'NotificationService/markAsRead': { result: true },
    'NotificationService/delete': { result: true },
    ...overrides,
  }
}

async function openNotificationDrawer(page: any) {
  await page.locator('button:has(.mdi-bell-outline)').click()
}

test.describe('ADR-0015 B5-3 — NotificationDrawerComponent', () => {
  // C1.5 (F-06) BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ (brif: "tam liste YALNIZ çekmece açıldığında çekilsin"):
  // eski karakterizasyon ("çekmece açılışında veri ÇEKİLMİYOR — boş durum") artık geçersiz; iddia
  // tersine çevrildi. Menüde bildirim merkezi kaydı yoksa "Tümünü gör" gösterilmez.
  test('C1.5: çekmece açılınca tam liste çekilir ve kartlar render olur; merkez menüde yoksa "Tümünü gör" yok', async ({ page }) => {
    await installApiMocks(page, withNotifications())
    await gotoAuthed(page)
    await openNotificationDrawer(page)

    await expect(page.getByText('E2E içe aktarma tamamlandı')).toBeVisible()
    await expect(page.getByText('Henüz bildiriminiz yok')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Tümünü gör' })).toHaveCount(0)
  })

  test('"Tümünü Okundu İşaretle" tıklanınca fetchNotifications tetiklenir ve kartlar render olur', async ({ page }) => {
    await installApiMocks(page, withNotifications())
    await gotoAuthed(page)
    await openNotificationDrawer(page)

    await page.locator('button:has(.mdi-check-all)').click()

    await expect(page.getByText('E2E içe aktarma tamamlandı')).toBeVisible()
    await expect(page.getByText('Trendyol kataloğunuzdan 42 ürün aktarıldı.')).toBeVisible()
    await expect(page.getByText('E2E senkronizasyon uyarısı')).toBeVisible()
    // IMPORT_READY tipi + metaData -> "İşlem Özeti" mini-tablosu render olur.
    await expect(page.getByText('İşlem Özeti')).toBeVisible()
  })

  test('"Tümünü Sil" tıklanınca NotificationService/delete {all:true} ile çağrılır', async ({ page }) => {
    let deletePayload: any = null
    await installApiMocks(page, withNotifications({
      'NotificationService/delete': async (route: any, headers: any) => {
        deletePayload = route.request().postDataJSON?.()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true }) })
      },
    }))
    await gotoAuthed(page)
    await openNotificationDrawer(page)

    // Aşama 6b (Standart 10): satır silme ikonları da kayıt defteri glifini kullanır — düğme adıyla seçilir (iddia aynı).
    // C2b BİLİNÇLİ DEĞİŞİKLİK: geri alınamaz "Tümünü sil" başlıkta çıplak ikon değil; ⋯ menüsünde EN SONDA (tehlikeli)
    // ve onay diyaloğu ister. Gönderilen gövde (iddia) AYNI: {all:true}.
    await page.getByRole('button', { name: 'Bildirim işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Tümünü sil' }).click()
    await page.getByRole('dialog').filter({ hasText: 'Tüm bildirimler silinsin mi?' }).getByRole('button', { name: 'Tümünü sil' }).click()

    await expect.poll(() => deletePayload).not.toBeNull()
    expect(deletePayload.all).toBe(true)
  })
})

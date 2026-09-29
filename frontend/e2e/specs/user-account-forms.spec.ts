// ADR-0015 B5-3 — user/ExitView.vue, user/ChangePasswordView.vue, user/InvoiceInfoView.vue.
// Protokol 13 (characterization-testing skill): bu spec önce DEĞİŞMEMİŞ ekranlara karşı yazıldı.
//
// KARAKTERİZASYON NOTU (şüpheli davranış, DÜZELTİLMEDİ — bkz. final rapor / BACKLOG önerisi):
// Üçü de günlük akışta gerçek bir işlev taşımıyor — `ExitView` sabit "EXIT" metni basıyor
// (kullanılmayan `useRestApi`/`useRouter` import'ları, boş `onBeforeMount`), `ChangePasswordView`
// ve `InvoiceInfoView` hiçbir kaydet/gönder düğmesi RENDER ETMİYOR (ikincisinde `buttons` dizisi
// script'te tanımlı ama template'te hiç kullanılmıyor) — yani alanlar dolduruluyor ama hiçbir yere
// gönderilemiyor. `docs/adr/0015-uygulama-gorsel-yenileme.md` gap eşleme tablosu (§d) `ExitView`/
// `InvoiceInfoView`'ı "ölü/prototip ekran" olarak sınıflandırıp Aşama 0'a (kaldırma) atıyor ve
// `ChangePasswordView`'ı N1 ("Hesabım ve güvenlik") ile DEĞİŞTİRİLECEK ekran sayıyor — B5'e değil.
// Bu görev talimatı bu 3 dosyayı açıkça B5-3 kapsamına koyduğu için buradaki iş YALNIZCA görsel
// katmandır (mantık/route EKLENMEDİ, KALDIRILMADI) — nihai kader (silme/N1 ile değiştirme)
// orkestratörün Aşama 0/B4 kararına bırakılmıştır (final rapora ayrıca yazıldı).
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

function withAccountMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAccountSupport, ...overrides }
}

test.describe('ADR-0015 B5-3 — Hesap ekranları (ExitView / ChangePasswordView / InvoiceInfoView)', () => {
  test('ExitView: sabit "EXIT" metni render olur (gerçek çıkış işlevi YOK — karakterizasyon)', async ({ page }) => {
    await installApiMocks(page, withAccountMenu())
    await gotoAuthed(page)
    await openScreen(page, 'ExitView')

    await expect(page.getByText('EXIT', { exact: true })).toBeVisible()
  })

  test('ChangePasswordView: iki şifre alanı render olur, kaydet düğmesi YOK (karakterizasyon)', async ({ page }) => {
    await installApiMocks(page, withAccountMenu())
    await gotoAuthed(page)
    await openScreen(page, 'ChangePasswordView')

    await expect(page.getByLabel('Yeni Şifre', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Yeni Şifre (Tekrar)')).toBeVisible()
    // Karakterizasyon: script bloğu boş, hiçbir "Değiştir/Kaydet" düğmesi DOM'da yok.
    await expect(page.getByRole('button', { name: /değiştir|kaydet/i })).toHaveCount(0)
  })

  test('InvoiceInfoView: fatura bilgisi alanları render olur, kaydet düğmesi YOK (karakterizasyon)', async ({ page }) => {
    await installApiMocks(page, withAccountMenu())
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceInfoView')

    await expect(page.getByText('Gerçek Kişi')).toBeVisible()
    await expect(page.getByText('Tüzel Kişi')).toBeVisible()
    await expect(page.getByLabel('İsim', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Soyisim', { exact: true })).toBeVisible()
    await expect(page.getByLabel('TC Kimlik No')).toBeVisible()
    await expect(page.getByLabel('Firma Ünvanı')).toBeVisible()
    await expect(page.getByLabel('Vergi Dairesi')).toBeVisible()
    await expect(page.getByLabel('Vergi No')).toBeVisible()
    // Karakterizasyon (çeviri boşluğu, DÜZELTİLMEDİ): `user.invoiceInfo.address` tr.json'da
    // çevrilmemiş — etiket literal İngilizce "Address" metnini gösteriyor.
    await expect(page.getByLabel('Address', { exact: true })).toBeVisible()
    await expect(page.getByLabel('İl', { exact: true })).toBeVisible()
    await expect(page.getByLabel('İlçe', { exact: true })).toBeVisible()
    // Karakterizasyon: `buttons` script'te tanımlı ama template'te KULLANILMIYOR — "Güncelle" düğmesi DOM'da yok.
    await expect(page.getByRole('button', { name: 'Güncelle' })).toHaveCount(0)
  })
})

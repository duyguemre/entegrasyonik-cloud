// Uygulama diyalogları için dayanıklı seçici. Kabukta ilk girişte engellemeyen bir "Tur teklifi" kartı
// (`HelpTour`, role="dialog", `data-help-tour-offer`) bulunur; çıplak `getByRole('dialog')` onu da eşler
// (strict-mode çifti / toHaveCount(0) hatası). Bu yardımcı yalnızca GERÇEK (tur teklifi olmayan) diyalogları döner.
import type { Locator, Page } from '@playwright/test'

export function appDialogs(page: Page): Locator {
  return page.getByRole('dialog').and(page.locator(':not([data-help-tour-offer]):not([data-help-tour-card])'))
}

/**
 * Tur teklifi kartını (sağ alt, `HelpTour`) bastırır: tercih `localStorage`'a "dismissed" yazılır (sayfa yüklenmeden önce).
 * Kart, sağ alttaki sabit eylem çubuklarını (ör. "Ayarları kaydet") örter; bu yardımcı yalnızca o örtmenin test
 * sonuçlarını etkilediği spec'lerde `beforeEach`'te çağrılır. Teklifin kendisini doğrulayan testlerde ÇAĞRILMAZ.
 */
export async function suppressTourOffer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { localStorage.setItem('ek.help.v1.tour', 'dismissed') } catch { /* depo yok */ }
  })
}

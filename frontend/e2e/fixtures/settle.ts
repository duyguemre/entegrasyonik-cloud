// fe-r4d D1/D3 — axe ölçümünden önce süren CSS geçiş/animasyonlarını bekler.
// Kök neden: hareket token'ları (150–300ms) renk/opaklık geçişi yapar; axe geçiş anında koşarsa ara rengi ölçer
// (ör. ~#7891e1) ve sahte "color-contrast" ihlali üretir — yavaş/yüklü makinede (yerel 4 işçi) kırmızı, hızlıda yeşil.
// Sabit `waitForTimeout` yerine tarayıcının kendi animasyon listesi beklenir; sonsuz animasyonlar (iskelet, yükleniyor
// halkası) beklenmez. Ölçülen = kullanıcının gördüğü yerleşmiş son durum.
import type { Page } from '@playwright/test'

export async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
}

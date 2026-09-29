// ADR-0015 B4-P0 — yeni ekranların (N1 Hesabım/güvenlik, N4 Veri ve gizlilik, N5 Stok politikası)
// ortak test yardımcıları. Sentetik veri (Protokol 7: PII YOK, `.invalid` alan adı).
//
// Menü: gerçek menü ağacı backend `MenuService`'ten (ApplicationDB `menus`) gelir ve bu ekranların
// kaydı bu bulut görevinin kapsamı dışıdır. `nav.ts`'teki paylaşılan `menuFixture` DEĞİŞTİRİLMEDİ
// (dashboard/kabuk ekran görüntüsü tabanlarını kaydırmamak için — `menuFixtureWithLogs` ile aynı
// gerekçe); yalnız bu görevin spec'leri `menuFixtureWithB4` override'ını kullanır. `workspace.ts`
// derin bağlantıyı (`/account/security` vb.) çözerken hedefi menü ağacında arar (`code`+`parent`).
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { menuFixture, waitForWorkplaceReady } from './nav'

export const B4_SCREENS = {
  AccountSecurityView: { code: 'AccountSecurityView', title: 'accountSecurity', icon: 'mdi-shield-account-outline', slug: 'account/security', root: '.accountSecurityView' },
  PrivacyDataView: { code: 'PrivacyDataView', title: 'privacyData', icon: 'mdi-shield-lock-outline', slug: 'account/privacy', root: '.privacyDataView' },
  StockPolicyView: { code: 'StockPolicyView', title: 'stockPolicy', icon: 'mdi-scale-balance', slug: 'catalog/stock-policy', root: '.stockPolicyView' },
} as const

export type B4ScreenCode = keyof typeof B4_SCREENS

/** `menuFixture` + kök düzeyde sentetik 'system' grubu (etiketi `menu.system` = "Sistem") (yalnızca istenen ekranlar — olumsuz rol testi için alt küme verilebilir). */
export function menuFixtureWithB4(codes: B4ScreenCode[] = ['AccountSecurityView', 'PrivacyDataView', 'StockPolicyView']) {
  return [
    ...menuFixture,
    {
      group: 'system',
      links: codes.map((c) => ({ code: B4_SCREENS[c].code, parent: '', title: B4_SCREENS[c].title, icon: B4_SCREENS[c].icon, singleton: true })),
    },
  ]
}

/** Derin bağlantıyla ekranı açar ve AKTİF sekme olduğunu doğrular (`hide-tab-component` yok). */
export async function openB4Screen(page: Page, code: B4ScreenCode) {
  const def = B4_SCREENS[code]
  await page.goto(`/${def.slug}`)
  await waitForWorkplaceReady(page)
  await expect(page.locator(`${def.root}:not(.hide-tab-component)`)).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

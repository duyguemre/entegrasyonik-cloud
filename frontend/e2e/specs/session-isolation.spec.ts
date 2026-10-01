// R9b (docs/FRONTEND_CODE_AUDIT.md H-01 / T-15) — çıkış sonrası oturum/durum izolasyonu.
//
// AYNI SPA oturumunda (sayfa yenilemeden) kullanıcı A oturumu bırakır (açık çıkış VEYA oturum süresi
// dolması), kullanıcı B girer. B'nin arayüzünde A'dan kalan menü / açık sekme / oturum-kalıcılığı
// (sessionStorage) olmamalı. Kaynak-kod okuması sızıntı "var" diyordu ama akış e2e'de yoktu
// ("doğrulanamadı"): düzeltme ÖNCESİ bu akış sızıntıyı kaydetti (commit geçmişi: "R9b H-01 characterization");
// bu sürüm izolasyonu doğrular. ADR-0012 Karar 3: oturum süresi dolması sekme kalıcılığını SİLMEZ (aynı
// kullanıcı geri dönünce sekmeler gelir), yalnızca açık çıkış siler.
import { test, expect, type Page } from '@playwright/test'
import { ordersDoluFixture } from '../fixtures/apiData'
import { openDrawer, waitForShellReady, waitForWorkplaceReady, openScreen } from '../fixtures/nav'
import {
  installTwoUserMocks,
  loginViaForm,
  logoutViaAccountMenu,
  userA,
  userB,
  workspaceKeys,
  type Session,
} from '../fixtures/session'

const A_KEY = 'ek.ws.v1:default:a.kullanici@entegrasyonik-e2e.invalid'
const B_KEY = 'ek.ws.v1:default:b.kullanici@entegrasyonik-e2e.invalid'

type Leave = 'logout' | 'expire'

async function leaveSessionA(page: Page, state: { session: Session }, how: Leave) {
  if (how === 'logout') {
    await logoutViaAccountMenu(page)
    return
  }
  // Oturum süresi dolması: sunucu tarafında oturum bitti; bir sonraki gezinme/API çağrısı -> /login (guard `redirect`
  // sorgusuyla ya da 401 `reason=session-expired` ile) — iki yol da giriş ekranına götürür.
  state.session = null
  await openDrawer(page)
  await page.locator('.v-navigation-drawer.soft-nav .soft-item').filter({ has: page.locator('.mdi-cart-outline') }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
}

async function runFlow(page: Page, how: Leave, next: 'A' | 'B') {
  const state: { session: Session } = { session: null }
  await installTwoUserMocks(page, state, {
    'OrderService/getOrders': (route, h) =>
      state.session
        ? route.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(ordersDoluFixture) })
        : route.fulfill({ status: 401, contentType: 'application/json', headers: h, body: '{}' }),
  })

  // --- A oturumu ---
  await page.goto('/login')
  await loginViaForm(page, userA.username)
  await waitForShellReady(page)
  await expect(page.getByText('A Mağazası (E2E)').first()).toBeVisible()
  await openScreen(page, 'ClaimListView') // A'nın açık iade sekmesi
  await expect(page.locator('.claimListView:not(.hide-tab-component)')).toHaveCount(1)
  const keysWhileA = await workspaceKeys(page)

  // --- A ayrılır ---
  await leaveSessionA(page, state, how)
  const keysAfterLeave = await workspaceKeys(page)

  // --- sonraki kullanıcı (yenileme YOK) ---
  // Süre dolması yönlendirmesi `redirect=/orders` taşır; açık çıkışta varsayılan /dashboard.
  await loginViaForm(page, next === 'A' ? userA.username : userB.username, how === 'expire' ? /\/orders$/ : /\/dashboard$/)
  await waitForWorkplaceReady(page)
  await expect(page.getByText(next === 'A' ? 'A Mağazası (E2E)' : 'B Mağazası (E2E)').first()).toBeVisible()
  await page.waitForTimeout(500)

  // [DS-v2 Aşama 2, Karar 5.1 izinli değişiklik 1] Sekme başlıkları artık cümle düzeninde (okunaklılık —
  // kullanıcı brifi madde 4); karşılaştırma büyük harfe çevrilerek yapılır, iddialar ('ANASAYFA' var /
  // 'İADELER' yok — fe-r3d P05 tek ad kaydı: eski 'İade yönetimi') DEĞİŞMEDİ.
  const tabTitles = (await page.locator('.workplace-tabs [role="tab"]').allInnerTexts()).join('|').toLocaleUpperCase('tr-TR')
  const claimsTabMounted = await page.locator('.claimListView').count()
  // [ADR-0015 A3] Eski ham `img[src="/assets/images/logo6.png"]` seçicisi yerine paylaşılan
  // `openDrawer()` yardımcısı (bkz. dosya başı import) — kabuk artık kalıcı/ray/geçici üç sunumdan
  // birini gösterebiliyor, `openDrawer()` bunların hepsini ele alan TEK kaynak (ADR Karar 5.1
  // "İzinli değişiklik 1 — yardımcılar"). Bu satırın NİYETİ (drawer'ı aç, içeriğini oku) DEĞİŞMEDİ.
  await openDrawer(page)
  await page.waitForTimeout(400)
  const drawerItems = page.locator('.v-navigation-drawer.soft-nav .soft-item')
  const count = (icon: string) => drawerItems.filter({ has: page.locator(`.${icon}`) }).count()
  return {
    keysWhileA,
    keysAfterLeave,
    keysAfterNext: await workspaceKeys(page),
    tabTitles,
    claimsTabMounted,
    ordersInDrawer: await count('mdi-cart-outline'),
    claimsInDrawer: await count('mdi-undo-variant'),
    customersInDrawer: await count('mdi-account-group-outline'),
  }
}

test.describe('R9b — çıkış sonrası oturum izolasyonu (H-01 / T-15)', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Hesap menüsü adı yalnızca ≥960px görünür; akış tek projede doğrulanır')
  })

  test('açık çıkış: B girince A\'nın menüsü/sekmeleri/kalıcılığı yok, B\'nin kendi menüsü görünür', async ({ page }) => {
    const o = await runFlow(page, 'logout', 'B')

    // Kalıcılık: A'nın anahtarı vardı, açık çıkışta SİLİNDİ (ADR-0012 Karar 3); B kendi anahtarını yazar.
    expect(o.keysWhileA).toEqual([A_KEY])
    expect(o.keysAfterLeave).toEqual([])
    expect(o.keysAfterNext).toEqual([B_KEY])

    // Menü: B'nin menüsünde iade/müşteri YOK ve A'nınki kalmadı.
    expect(o.ordersInDrawer).toBe(1)
    expect(o.claimsInDrawer).toBe(0)
    expect(o.customersInDrawer).toBe(0)

    // Sekmeler: yalnızca B'nin anasayfası; A'nın iade sekmesi yok ve monte değil.
    expect(o.tabTitles).toContain('ANASAYFA')
    expect(o.tabTitles).not.toContain('İADELER')
    expect(o.claimsTabMounted).toBe(0)
  })

  test('oturum süresi dolması: B girince A\'dan hiçbir şey kalmaz; A\'nın kalıcılığı (ADR-0012) silinmez', async ({ page }) => {
    const o = await runFlow(page, 'expire', 'B')

    expect(o.keysWhileA).toEqual([A_KEY])
    // Süre dolması kalıcılığı SİLMEZ (aynı kullanıcı dönerse sekmeleri gelsin); B ise kendi anahtarını yazar.
    expect(o.keysAfterLeave).toEqual([A_KEY])
    expect(o.keysAfterNext.sort()).toEqual([A_KEY, B_KEY])

    expect(o.claimsInDrawer).toBe(0)
    expect(o.customersInDrawer).toBe(0)
    expect(o.tabTitles).not.toContain('İADELER')
    expect(o.claimsTabMounted).toBe(0)
  })

  test('oturum süresi dolması, AYNI kullanıcı döner: açık sekmeleri sessionStorage\'dan geri gelir (ADR-0012 korunur)', async ({ page }) => {
    const o = await runFlow(page, 'expire', 'A')

    expect(o.tabTitles).toContain('ANASAYFA')
    expect(o.tabTitles).toContain('İADELER')
    expect(o.claimsInDrawer).toBe(1) // A'nın kendi menüsü
    expect(o.customersInDrawer).toBe(1)
  })
})

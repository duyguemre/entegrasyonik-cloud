// ADR-0012 — Gezinme modeli (URL'li sekmeli çalışma alanı). T4a kabul kriteri: derin bağlantı,
// kimliksiz derin bağlantı -> /login?redirect= -> giriş -> hedef, geri/ileri (Karar 4 tablosu),
// yenileme sonrası sekme listesi (Karar 3 persist), PII'li parametrenin URL'de OLMADIĞI,
// bilinmeyen slug -> dashboard (Karar 2 "Çözümleme ve güvenlik").
import { test, expect } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen, waitForShellReady, waitForWorkplaceReady } from '../fixtures/nav'

test.describe('ADR-0012 — Derin bağlantı', () => {
  test('kimlik doğrulanmış kullanıcı: /orders?internalStatuses=... doğrudan doğru sekmeyi + filtreyi açar', async ({ page }) => {
    await installApiMocks(page)
    await page.goto('/orders?internalStatuses=AWAITING_APPROVAL')
    await waitForWorkplaceReady(page)

    await expect(page).toHaveURL(/\/orders\?internalStatuses=AWAITING_APPROVAL$/)
    await expect(page.locator('.orderListView')).toBeVisible()
    // Filtre gerçekten uygulandı: OrderListView.vue `parameters?.internalStatuses`'u okuyup
    // çoklu-seçim durum alanına yazıyor (bkz. navigation/screens.ts yorumu) — chip olarak görünür.
    // DS-v2 Aşama 2: aynı metin artık panel alanında, aktif filtre çipinde ve satır durumunda görünür;
    // filtrenin uygulandığını aktif filtre çipi kanıtlar.
    await expect(page.locator('.orderListView').getByRole('group', { name: 'Aktif filtreler' }).getByText('Satıcı onayı bekliyor')).toBeVisible()
  })

  test('bilinmeyen slug panoya düşer + bildirim gösterilir', async ({ page }) => {
    await installApiMocks(page)
    await page.goto('/bu-ekran-hic-yok')
    await waitForShellReady(page)

    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText(/bulunamadı/i)).toBeVisible()
  })

  test('kimliksiz derin bağlantı: /login?redirect= ile korunur, giriş sonrası hedefe döner', async ({ page }) => {
    let authenticated = false
    await installApiMocks(page, {
      checkAuthentication: async (route, headers) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(authenticated) }),
      // NOT: `userContext` bilinçli olarak 401 DÖNDÜRMÜYOR (sabit `userContextFixture`) — bu uçtan
      // gelen bir 401, `restapi.ts` axios interceptor'ünü (ADR-0001 adım 8, oturum-süresi-dolması
      // yönlendirmesi — bu görevin kapsamı DIŞINDA, dokunulmadı) tetikleyip `/login?reason=
      // session-expired`'a yarışan İKİNCİ bir yönlendirme üretiyor ve `router` guard'ının ürettiği
      // `redirect` parametresiyle YARIŞ DURUMU oluşturuyor. Kapıyı (giriş guard'ı) tek başına test
      // etmek için `checkAuthentication:false` tek başına yeterli ve gerçekçi bir izolasyon.
      userContext: userContextFixture,
      'SecurityService/login': async (route, headers) => {
        authenticated = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(userContextFixture) })
      },
    })

    await page.goto('/orders?internalStatuses=APPROVED')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)orders/)

    await page.getByLabel('E-posta').fill('e2e@example.invalid')
    await page.getByLabel('Parola', { exact: true }).fill('e2e-pass-1234')
    await page.getByRole('button', { name: 'Giriş' }).click()

    await expect(page).toHaveURL(/\/orders\?internalStatuses=APPROVED$/, { timeout: 10_000 })
    await expect(page.locator('.orderListView')).toBeVisible()
  })

  test('açık yönlendirme önlemi: //evil.com gibi bir redirect kabul edilmez, /dashboard\'a düşer', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto('/login?redirect=%2F%2Fevil.com')
    await page.getByLabel('E-posta').fill('e2e@example.invalid')
    await page.getByLabel('Parola', { exact: true }).fill('e2e-pass-1234')
    await installApiMocks(page, {
      'SecurityService/login': userContextFixture,
      checkAuthentication: true,
      userContext: userContextFixture,
    })
    await page.getByRole('button', { name: 'Giriş' }).click()

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 })
  })
})

const TAB = '.workplace-tabs [role="tab"]'
const ACTIVE_TAB_CLOSE = '.workplace-tabs .ek-tab.is-active .ek-tab__close'

test.describe('ADR-0012 — Geri/ileri (Karar 4)', () => {
  // NOT: bu describe'daki testler sekme şeridi seçicilerini (`TAB`/`ACTIVE_TAB_CLOSE`) kullanıyor.
  // [DS-v2 Aşama 2, Karar 5.1 izinli değişiklik 1 — yalnızca seçici] Sekme şeridi `EkWorkspaceTabs`'a
  // taşındı (`.workplace-tab`/`.close-tab-icon` → `role=tab` / `.ek-tab.is-active .ek-tab__close`);
  // iddialar (sayı, kapatma, URL) DEĞİŞMEDİ. Mobil atlaması korunur (davranış kapsamı aynı kalsın).
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Masaüstü/tablet sekme çubuğu gerektiriyor (mobilde gizli, ADR-0012 Karar 5)')
  })

  test('A -> B -> geri = A (aktif sekme geçişi push, tarayıcı geri A\'ya döner)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await expect(page).toHaveURL(/\/dashboard$/)

    await openScreen(page, 'OrderListView')
    await expect(page).toHaveURL(/\/orders$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible()
  })

  test('kapat -> geri geçmişe yazılmaz (replace); kapamadan sonra geri o kapanan sekmenin girdisini "yutar"', async ({ page }) => {
    // ADR-0012 Karar 4: "Sekme kapama | replace (yeni aktif sekmenin adresi) | kapama geçmişe
    // yazılmaz." `/orders` girdisi (push ile eklenmişti) kapamada `replace` ile `/dashboard`'a
    // EZİLİR — yani geçmişte artık `/orders`'a işaret eden bir konum YOK; geri tuşu bir önceki
    // (zaten `/dashboard` olan) konuma gider. Bu KASITLI: "kapama geçmişe yazılmaz" tam olarak
    // bunu ifade ediyor (kapamanın kendisi geri tuşuyla "geri alınabilir" bir geçmiş adımı değil).
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await expect(page).toHaveURL(/\/orders$/)

    const closeIcon = page.locator(ACTIVE_TAB_CLOSE)
    await closeIcon.click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible()
  })

  test('kapatılmış bir sekmenin adresine tekrar gidilirse taze (yeniden) açılır', async ({ page }) => {
    // ADR-0012 Karar 4 "popstate": "sekme kapatılmışsa yeniden açılır (URL parametreleriyle, taze
    // initialize)". Bu, kapamadan SONRA o ekranın adresine (bookmark/yeniden yazılan URL/ileri
    // geçmiş) HERHANGİ bir yoldan dönüldüğünde geçerlidir — burada doğrudan `page.goto` ile
    // (deterministik, geri/ileri koreografisinden bağımsız) doğrulanıyor.
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.locator(ACTIVE_TAB_CLOSE).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator(TAB)).toHaveCount(1)

    await page.goto('/orders')
    await expect(page.locator('.orderListView')).toBeVisible()
    await expect(page.locator(TAB)).toHaveCount(2)
  })
})

test.describe('ADR-0012 — Persist (Karar 3, sessionStorage)', () => {
  test('yenileme sonrası açık sekmeler çubukta kalır (oturum-kapsamlı persist)', async ({ page }, testInfo) => {
    // Sekme sayımı masaüstü/tablet projelerinde doğrulanır (bkz. yukarıdaki NOT).
    test.skip(testInfo.project.name === 'chromium-mobile', 'Masaüstü/tablet sekme çubuğu gerektiriyor (mobilde gizli, ADR-0012 Karar 5)')
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await expect(page).toHaveURL(/\/orders$/)

    await page.reload()
    await waitForWorkplaceReady(page)

    // Aktif ekran URL'den geri geliyor (Siparişler), dashboard sekmesi de sekme çubuğunda kalıyor
    // (persist edilen tab listesi, tembel geri yükleme).
    await expect(page.locator('.orderListView')).toBeVisible()
    await expect(page.locator(TAB)).toHaveCount(2)
  })
})

test.describe('ADR-0012 — PII URL\'e YAZILMAZ (Karar 2)', () => {
  test('ApplicationBar akıllı arama ile açılan sipariş sekmesinde globalSearch URL\'de YOK', async ({ page }, testInfo) => {
    // Arama kutusu yalnızca `$vuetify.display.smAndUp` (>=600px) iken doğrudan render oluyor
    // (ApplicationBar.vue, T4a kapsamı DIŞI); mobilde ayrı bir ikon+diyalog akışı var.
    test.skip(testInfo.project.name === 'chromium-mobile', 'Arama kutusu $vuetify.display.smAndUp gerektiriyor')
    await installApiMocks(page, {
      'SmartService/unifiedSearch': {
        navigation: [],
        orders: [{ _id: 'order-e2e-0001', orderNumber: 'E2E-100001' }],
        products: [],
        customers: [],
        claims: [],
      },
    })
    await gotoAuthed(page)

    await page.getByPlaceholder('Akıllı arama').first().fill('E2E-100001')
    await expect(page.getByText('E2E-100001', { exact: false }).first()).toBeVisible({ timeout: 5000 })
    await page.getByText('E2E-100001', { exact: false }).first().click()

    await expect(page.locator('.orderListView')).toBeVisible()
    // OrderListView kayıtta yalnızca `internalStatuses` (kapalı değer kümesi) taşıyor —
    // `globalSearch` (serbest metin, sipariş no/müşteri adı olabilir) urlParams'ta YOK, bu yüzden
    // URL'e asla yazılmaz (bellekte sekme parametresi olarak kalır, ADR-0012 Karar 2).
    expect(page.url()).not.toContain('globalSearch')
    expect(page.url()).not.toContain('E2E-100001')
  })
})

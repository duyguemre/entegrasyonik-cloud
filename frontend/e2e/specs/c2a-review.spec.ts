// Faz 3 / C2a — ekip yönetimi / davet / devir / reauth İNCELEME görüntüleri (iddia yok; günlük koşuda ATLANIR).
//   C2A_REVIEW=1 C2A_REVIEW_WIDTH=1440|390 [C2A_REVIEW_OUT=docs/c2a-review] [C2A_REVIEW_ONLY=a,b] \
//     npx playwright test e2e/specs/c2a-review.spec.ts --project=chromium-desktop --workers=2
// Dosya adı: `<durum>-<genişlik>.png`. Saat sabit, veri sentetik (PII yok).
import { test, expect, type Page, type Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const ENABLED = process.env.C2A_REVIEW === '1'
const WIDTH = Number(process.env.C2A_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.C2A_REVIEW_OUT || 'docs/c2a-review'
const ONLY = (process.env.C2A_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-30T09:00:00.000Z')
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()
const TOKEN = 'c2aSentetikDavetBelirteci_0123456789abcdefghij'
const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) } as const

const members = {
  users: [
    { _id: 'user-e2e-001', name: 'Test', surname: 'Kullanıcı', email: 'test.kullanici@entegrasyonik-e2e.invalid', owner: true, isActive: true, createdAt: '2025-06-01T09:00:00.000Z' },
    { _id: 'u-2', name: 'Elif', surname: 'Yıldız', email: 'elif.yildiz@example.com', roleCode: 'ROLE_ADMIN', isActive: true, createdAt: '2026-01-15T10:00:00.000Z' },
    { _id: 'u-3', name: 'Mert', surname: 'Aydın', email: 'mert.aydin@example.com', roleCode: 'STAFF', isActive: true, createdAt: '2026-03-02T08:30:00.000Z' },
    { _id: 'u-4', name: 'Selin', surname: 'Koç', email: 'selin.koc@example.com', roleCode: 'STAFF', isActive: false, createdAt: '2026-04-20T12:00:00.000Z' },
    { _id: 'u-5', name: 'Burak', surname: 'Şahin', email: 'burak.sahin@example.com', roleCode: 'STAFF', isActive: true, createdAt: '2026-05-11T07:45:00.000Z' },
  ],
  totalNumberOfRecords: 5,
  fromTo: {},
}
const invitations = {
  invitations: [
    { id: 'inv-1', email: 'ayse.demir@example.com', role: 'operator', status: 'pending', expiresAt: at(5), expired: false },
    { id: 'inv-2', email: 'can.oz@example.com', role: 'admin', status: 'pending', expiresAt: at(-1), expired: true },
    { id: 'inv-3', email: 'deniz.aksoy.uzun.adres@ornek-magaza-deposu.com.tr', role: 'operator', status: 'pending', expiresAt: at(0.3), expired: false },
  ],
}

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function shoot(page: Page, name: string) {
  await settle(page)
  await page.screenshot({ path: `${OUT}/${name}-${WIDTH}.png` })
}

async function team(page: Page, overrides: Record<string, unknown> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithAccountSupport,
    'UserService/getUsers': members,
    'UserService/getRoles': [],
    'UserService/listInvitations': invitations,
    ...overrides,
  })
  await gotoAuthed(page)
  await openScreen(page, 'AuthorizationListView')
  await expect(page.getByText('Elif Yıldız').first()).toBeVisible()
  await settle(page, 800)
}

async function openRowMenu(page: Page, name: string) {
  await page.locator('.authorizationListView tbody tr, .authorizationListView .ek-grid-card', { hasText: name }).first().locator('[data-action="more"]').click()
}

const CASES: Array<{ name: string; run: (p: Page) => Promise<void> }> = [
  { name: 'a-ekip-listesi', run: async (p) => { await team(p); await shoot(p, 'a-ekip-listesi') } },
  {
    name: 'b-davet-diyalogu',
    run: async (p) => {
      await team(p)
      await p.getByTestId('invite-open').click()
      const d = p.getByRole('dialog', { name: 'Ekibe kişi davet et' })
      await d.getByLabel('E-posta').fill('yeni.kisi@example.com')
      await d.getByTestId('invite-role-admin').click()
      await shoot(p, 'b-davet-diyalogu')
    },
  },
  {
    name: 'c-davet-plan-siniri',
    run: async (p) => {
      await team(p, { 'UserService/inviteUser': mockError(403, { code: 'PLAN_LIMIT_REACHED', error: 'x' }) })
      await p.getByTestId('invite-open').click()
      const d = p.getByRole('dialog', { name: 'Ekibe kişi davet et' })
      await d.getByLabel('E-posta').fill('yeni.kisi@example.com')
      await d.getByRole('button', { name: 'Davet gönder' }).click()
      await expect(d.getByTestId('invite-error')).toBeVisible()
      await shoot(p, 'c-davet-plan-siniri')
    },
  },
  {
    name: 'd-satir-menusu',
    run: async (p) => {
      await team(p)
      await openRowMenu(p, 'Elif Yıldız')
      await shoot(p, 'd-satir-menusu')
    },
  },
  {
    name: 'e-askiya-al',
    run: async (p) => {
      await team(p, { 'UserService/suspendUser': mockError(409, { code: 'LAST_OWNER', error: 'x' }) })
      await openRowMenu(p, 'Mert Aydın')
      await p.getByRole('menuitem', { name: 'Askıya al', exact: true }).click()
      const d = p.getByRole('dialog', { name: 'Mert Aydın askıya alınsın mı?' })
      await d.getByLabel('Neden (isteğe bağlı)').fill('Sözleşme dönemi bitti')
      await d.getByRole('button', { name: 'Askıya al' }).click()
      await expect(d.getByText(/son sahibi/)).toBeVisible()
      await shoot(p, 'e-askiya-al')
    },
  },
  {
    name: 'f-sahiplik-devri',
    run: async (p) => {
      await team(p)
      await openRowMenu(p, 'Elif Yıldız')
      await p.getByRole('menuitem', { name: 'Sahipliği devret', exact: true }).click()
      await expect(p.getByRole('dialog', { name: 'Mağaza sahipliğini devret' })).toBeVisible()
      await shoot(p, 'f-sahiplik-devri')
    },
  },
  {
    name: 'g-reauth',
    run: async (p) => {
      await team(p, {
        'UserService/initiateOwnershipTransfer': mockError(401, { code: 'REAUTH_REQUIRED', error: 'x' }),
        'AccountService/reauthenticate': mockError(400, { code: 'INVALID_CURRENT_PASSWORD', error: 'x' }),
      })
      await openRowMenu(p, 'Elif Yıldız')
      await p.getByRole('menuitem', { name: 'Sahipliği devret', exact: true }).click()
      await p.getByRole('dialog', { name: 'Mağaza sahipliğini devret' }).getByRole('button', { name: 'Devri başlat' }).click()
      const r = p.getByRole('dialog', { name: 'Kimliğinizi doğrulayın' })
      await r.getByTestId('reauth-password').locator('input').fill('yanlis-parola')
      await r.getByRole('button', { name: 'Doğrula ve devam et' }).click()
      await expect(r.getByText(/Parola hatalı/)).toBeVisible()
      await shoot(p, 'g-reauth')
    },
  },
  {
    name: 'h-devir-bekliyor',
    run: async (p) => {
      await team(p, { 'UserService/initiateOwnershipTransfer': { success: true, transferId: 't-1', expiresAt: at(3) } })
      await openRowMenu(p, 'Elif Yıldız')
      await p.getByRole('menuitem', { name: 'Sahipliği devret', exact: true }).click()
      await p.getByRole('dialog', { name: 'Mağaza sahipliğini devret' }).getByRole('button', { name: 'Devri başlat' }).click()
      await expect(p.getByTestId('transfer-pending')).toBeVisible()
      await p.mouse.move(0, 0)
      await p.waitForTimeout(4500) // başarı toast'ı kapanır
      await shoot(p, 'h-devir-bekliyor')
    },
  },
  {
    name: 'i-davet-kabul',
    run: async (p) => {
      await installApiMocks(p, { ...NO_SESSION, 'AccountService/getInvitation': { tenantTitle: 'Moda Dünyası', role: 'operator', email: 'a***@example.com', expiresAt: at(4) } })
      await p.goto(`/invite#t=${TOKEN}`)
      await expect(p.getByTestId('invite-summary')).toBeVisible()
      await shoot(p, 'i-davet-kabul')
    },
  },
  {
    name: 'j-davet-hata',
    run: async (p) => {
      await installApiMocks(p, {
        ...NO_SESSION,
        'AccountService/getInvitation': { tenantTitle: 'Moda Dünyası', role: 'admin', email: 'a***@example.com', expiresAt: at(4) },
        'AccountService/acceptInvitation': mockError(400, { code: 'WEAK_PASSWORD', error: 'x' }),
      })
      await p.goto(`/invite#t=${TOKEN}`)
      await p.getByLabel('Ad', { exact: true }).fill('Ayşe')
      await p.getByLabel('Soyad').fill('Demir')
      await p.getByLabel('Parola', { exact: true }).fill('parola12345')
      await p.getByLabel('Parola (tekrar)').fill('parola12345')
      await p.getByTestId('invite-submit').click()
      await expect(p.getByText(/Parola yeterince güçlü değil/).first()).toBeVisible()
      await shoot(p, 'j-davet-hata')
    },
  },
  {
    name: 'k-davet-suresi-dolmus',
    run: async (p) => {
      await installApiMocks(p, { ...NO_SESSION, 'AccountService/getInvitation': mockError(410, { code: 'INVITATION_EXPIRED', error: 'x' }) })
      await p.goto(`/invite#t=${TOKEN}`)
      await expect(p.getByText('Davetin süresi dolmuş', { exact: true })).toBeVisible()
      await shoot(p, 'k-davet-suresi-dolmus')
    },
  },
  {
    name: 'l-davet-tamam',
    run: async (p) => {
      await installApiMocks(p, {
        ...NO_SESSION,
        'AccountService/getInvitation': { tenantTitle: 'Moda Dünyası', role: 'operator', email: 'a***@example.com', expiresAt: at(4) },
        'AccountService/acceptInvitation': { success: true },
      })
      await p.goto(`/invite#t=${TOKEN}`)
      await p.getByLabel('Ad', { exact: true }).fill('Ayşe')
      await p.getByLabel('Soyad').fill('Demir')
      await p.getByLabel('Parola', { exact: true }).fill('Guclu-Parola-2026!')
      await p.getByLabel('Parola (tekrar)').fill('Guclu-Parola-2026!')
      await p.getByTestId('invite-submit').click()
      await expect(p.getByRole('heading', { name: 'Hesabınız hazır' })).toBeVisible()
      await shoot(p, 'l-davet-tamam')
    },
  },
  {
    name: 'm-sahiplik-kabul',
    run: async (p) => {
      await installApiMocks(p, { 'UserService/acceptOwnershipTransfer': async (route: Route, h: Record<string, string>) => route.fulfill({ status: 200, headers: h, contentType: 'application/json', body: '{"success":true}' }) })
      await p.goto(`/accept-ownership#t=${TOKEN}`)
      await expect(p.getByRole('heading', { name: 'Mağaza sahipliğini kabul edin' })).toBeVisible()
      await shoot(p, 'm-sahiplik-kabul')
    },
  },
  {
    name: 'n-giris-notu',
    run: async (p) => {
      await installApiMocks(p, { ...NO_SESSION })
      await p.goto('/login?reason=invitation-accepted')
      await expect(p.getByText(/Hesabınız oluşturuldu/)).toBeVisible()
      await shoot(p, 'n-giris-notu')
    },
  },
]

test.describe('C2a inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca C2A_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const c of CASES) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => {
      test.setTimeout(60_000)
      await c.run(page)
    })
  }
})

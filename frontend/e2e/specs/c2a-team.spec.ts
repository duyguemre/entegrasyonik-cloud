// Faz 3 / C2a — ekip yönetimi + davet kabulü + sahiplik devri + merkezi reauth + Idempotency-Key.
// Sözleşme: docs/cloud-contracts/{API_ACCOUNT_LIFECYCLE (§6-9), API_IDEMPOTENCY, ERROR_CODES}.md. Tüm veri sentetik.
import { test, expect, type Page, type Request, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'
import { AXE_TAGS } from '../fixtures/b4Screens'

const ME_EMAIL = 'test.kullanici@entegrasyonik-e2e.invalid' // userContextFixture.username (owner: true)
const TOKEN = 'c2aSentetikDavetBelirteci_0123456789abcdefghij'
const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) } as const

const members = {
  users: [
    { _id: 'user-e2e-001', name: 'Test', surname: 'Kullanıcı', email: ME_EMAIL, roleCode: undefined, owner: true, isActive: true, createdAt: '2025-06-01T09:00:00.000Z' },
    { _id: 'user-e2e-0101', name: 'Elif', surname: 'Yıldız', email: 'elif.yildiz@example.com', roleCode: 'ROLE_ADMIN', owner: false, isActive: true, createdAt: '2026-01-15T10:00:00.000Z' },
    { _id: 'user-e2e-0102', name: 'Mert', surname: 'Aydın', email: 'mert.aydin@example.com', roleCode: 'STAFF', owner: false, isActive: true, createdAt: '2026-03-02T08:30:00.000Z' },
    { _id: 'user-e2e-0103', name: 'Selin', surname: 'Koç', email: 'selin.koc@example.com', roleCode: 'STAFF', owner: false, isActive: false, createdAt: '2026-04-20T12:00:00.000Z' },
  ],
  totalNumberOfRecords: 4,
  fromTo: {},
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const pendingInvitations = {
  invitations: [
    { id: 'inv-01', email: 'ayse.demir@example.com', role: 'operator', status: 'pending', expiresAt: inDays(5), expired: false, createdAt: inDays(-2) },
    { id: 'inv-02', email: 'can.oz@example.com', role: 'admin', status: 'pending', expiresAt: inDays(-1), expired: true, createdAt: inDays(-8) },
  ],
}

type Capture = { rpc: string; body: any; key: string | null }

function json(route: Route, headers: Record<string, string>, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
}

/** Yanıt dizisi: her çağrıda sıradaki (sonuncusu tekrar eder); gövde + Idempotency-Key kaydedilir. */
function sequence(captures: Capture[], rpc: string, replies: Array<{ status: number; body: unknown }>) {
  let i = 0
  return async (route: Route, headers: Record<string, string>) => {
    const req: Request = route.request()
    captures.push({ rpc, body: req.postDataJSON?.() ?? null, key: (await req.headerValue('idempotency-key')) ?? null })
    const r = replies[Math.min(i++, replies.length - 1)]
    return json(route, headers, r.status, r.body)
  }
}

async function openTeam(page: Page, overrides: Record<string, unknown> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithAccountSupport,
    'UserService/getUsers': members,
    'UserService/getRoles': [],
    'UserService/listInvitations': pendingInvitations,
    ...overrides,
  })
  await gotoAuthed(page)
  await openScreen(page, 'AuthorizationListView')
  await expect(page.locator('.authorizationListView tbody tr, .authorizationListView [role="row"]').filter({ hasText: 'Elif Yıldız' }).first()).toBeVisible()
}

const row = (page: Page, name: string) => page.locator('.authorizationListView tbody tr', { hasText: name })

async function openRowMenu(page: Page, name: string) {
  await row(page, name).locator('[data-action="more"]').click()
}

test.describe('C2a — ekip yönetimi', () => {
  test('liste: Durum kolonu, "Siz" rozeti, bekleyen davetler kartı (süre / süresi doldu)', async ({ page }) => {
    await openTeam(page)
    await expect(row(page, 'Selin Koç')).toContainText('Askıda')
    await expect(row(page, 'Elif Yıldız')).toContainText('Aktif')
    await expect(row(page, 'Test Kullanıcı')).toContainText('Siz')
    const card = page.getByTestId('pending-invitations')
    await expect(card).toContainText('Bekleyen davetler')
    await expect(card.getByTestId('invitation-row')).toHaveCount(2)
    await expect(card.getByTestId('invitation-row').nth(0)).toContainText('gün kaldı')
    await expect(card.getByTestId('invitation-row').nth(1)).toContainText('Süresi doldu')
  })

  test('davet: rol tavanı (yalnız Yönetici/Operatör), e-posta doğrulaması, gövde + Idempotency-Key; aynı eylemin yeniden denemesi aynı anahtar', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/inviteUser': sequence(captures, 'inviteUser', [
        { status: 502, body: { code: 'NETWORK_BLIP_SIM' } },
        { status: 200, body: { id: 'inv-9', email: 'yeni.kisi@example.com', role: 'admin', status: 'pending' } },
      ]),
    })
    await page.getByTestId('invite-open').click()
    const dialog = page.getByRole('dialog', { name: 'Ekibe kişi davet et' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('invite-role-admin')).toBeVisible()
    await expect(dialog.getByTestId('invite-role-operator')).toBeVisible()
    await expect(dialog.getByText('Sahip', { exact: true })).toHaveCount(0)
    // Varsayılan en az yetki: Operatör seçili.
    await expect(dialog.getByTestId('invite-role-operator').locator('input')).toBeChecked()

    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByText('E-posta adresini girin.')).toBeVisible()
    await dialog.getByLabel('E-posta').fill('gecersiz-adres')
    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByText(/Geçerli bir e-posta adresi girin/)).toBeVisible()
    expect(captures).toHaveLength(0)

    await dialog.getByLabel('E-posta').fill('  Yeni.Kisi@Example.com ')
    // Klavye: ok tuşu radyo grubunda gezinir.
    await dialog.getByTestId('invite-role-operator').locator('input').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByTestId('invite-role-admin').locator('input')).toBeChecked()

    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByTestId('invite-error')).toContainText('Servis geçici olarak kullanılamıyor')
    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(page.getByText('Davet yeni.kisi@example.com adresine gönderildi.')).toBeVisible()
    await expect(dialog).toBeHidden()

    expect(captures).toHaveLength(2)
    expect(captures[0].body).toEqual({ email: 'yeni.kisi@example.com', role: 'admin' })
    expect(captures[0].key).toMatch(/^[0-9a-f-]{36}$/)
    expect(captures[1].key).toBe(captures[0].key) // aynı kullanıcı eyleminin yeniden denemesi
  })

  test('davet hataları okunur iletiye eşlenir: PLAN_LIMIT_REACHED (planı yükselt), ALREADY_MEMBER (alan), rol tavanı 403', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/inviteUser': sequence(captures, 'inviteUser', [
        { status: 403, body: { code: 'PLAN_LIMIT_REACHED', error: 'Plan kullanıcı sınırına ulaşıldı.' } },
        { status: 409, body: { code: 'ALREADY_MEMBER', error: 'Bu kullanıcı zaten mağazanın üyesi.' } },
        { status: 403, body: { code: 'FORBIDDEN', error: 'Bu işlem için yetkiniz yok.' } },
      ]),
    })
    await page.getByTestId('invite-open').click()
    const dialog = page.getByRole('dialog', { name: 'Ekibe kişi davet et' })
    await dialog.getByLabel('E-posta').fill('kisi@example.com')
    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByTestId('invite-error')).toContainText('kullanıcı sınırına ulaşıldı')
    await expect(dialog.getByRole('button', { name: 'Aboneliği görüntüle' })).toBeVisible()

    await dialog.getByLabel('E-posta').fill('elif.yildiz@example.com')
    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByText('Bu kişi zaten mağazanızın üyesi.')).toBeVisible()

    await dialog.getByLabel('E-posta').fill('uc@example.com')
    await dialog.getByRole('button', { name: 'Davet gönder' }).click()
    await expect(dialog.getByTestId('invite-error')).toContainText('Kendi rolünüzden yüksek bir rol davetle verilemez')
    // Gövde değiştikçe yeni anahtar.
    expect(new Set(captures.map((c) => c.key)).size).toBe(3)
  })

  test('bekleyen davet: yeniden gönder (Idempotency-Key) ve iptal (onay diyaloğu)', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/resendInvitation': sequence(captures, 'resend', [{ status: 200, body: { id: 'inv-02', status: 'pending' } }]),
      'UserService/revokeInvitation': sequence(captures, 'revoke', [{ status: 200, body: { success: true } }]),
    })
    const card = page.getByTestId('pending-invitations')
    await card.getByTestId('invitation-row').nth(1).getByRole('button', { name: 'Yeni bağlantı gönder' }).click()
    await expect(page.getByText('Davet can.oz@example.com adresine yeniden gönderildi.')).toBeVisible()
    expect(captures[0]).toMatchObject({ rpc: 'resend', body: { invitationId: 'inv-02' } })
    expect(captures[0].key).toMatch(/^[0-9a-f-]{36}$/)

    await card.getByTestId('invitation-row').nth(0).getByRole('button', { name: 'Daveti iptal et' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Davet iptal edilsin mi?' })
    await expect(confirm).toContainText('ayse.demir@example.com')
    await confirm.getByRole('button', { name: 'Daveti iptal et' }).click()
    await expect(page.getByText('Davet iptal edildi.')).toBeVisible()
    expect(captures[1]).toMatchObject({ rpc: 'revoke', body: { invitationId: 'inv-01' }, key: null })
  })

  test('askı: kendine kapalı; son sahip 409 LAST_OWNER okunur ileti; operatör askıya alınır, askıdaki yeniden etkinleşir', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/suspendUser': sequence(captures, 'suspend', [
        { status: 409, body: { code: 'LAST_OWNER', error: 'Mağazanın son sahibi bu işleme konu olamaz.' } },
        { status: 200, body: { success: true, status: 'suspended' } },
      ]),
      'UserService/reactivateUser': sequence(captures, 'reactivate', [{ status: 200, body: { success: true, status: 'active' } }]),
    })
    await openRowMenu(page, 'Test Kullanıcı')
    await expect(page.getByRole('menuitem', { name: /Askıya al — Kendi hesabınızda yapılamaz/ })).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    await openRowMenu(page, 'Mert Aydın')
    await page.getByRole('menuitem', { name: 'Askıya al' }).click()
    const dialog = page.getByRole('dialog', { name: 'Mert Aydın askıya alınsın mı?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Vazgeç' })).toBeFocused() // tehlikeli: varsayılan odak Vazgeç
    await dialog.getByLabel('Neden (isteğe bağlı)').fill('Sözleşme bitti')
    await dialog.getByRole('button', { name: 'Askıya al' }).click()
    await expect(dialog.getByText(/son sahibi askıya alınamaz/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Askıya al' }).click()
    await expect(page.getByText('Mert Aydın askıya alındı.')).toBeVisible()
    expect(captures[0].body).toEqual({ userId: 'user-e2e-0102', reason: 'Sözleşme bitti' })

    await openRowMenu(page, 'Selin Koç')
    await page.getByRole('menuitem', { name: 'Yeniden etkinleştir' }).click()
    const re = page.getByRole('dialog', { name: 'Selin Koç yeniden etkinleştirilsin mi?' })
    await re.getByRole('button', { name: 'Yeniden etkinleştir' }).click()
    await expect(page.getByText('Selin Koç yeniden etkinleştirildi.')).toBeVisible()
    expect(captures.at(-1)).toMatchObject({ rpc: 'reactivate', body: { userId: 'user-e2e-0103' } })
  })

  test('sahiplik devri: REAUTH_REQUIRED → tek parola diyaloğu → yanlış parola iletisi → doğrulama → AYNI anahtarla yineleme → bekleyen devir bandı → iptal', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/initiateOwnershipTransfer': sequence(captures, 'initiate', [
        { status: 401, body: { code: 'REAUTH_REQUIRED', error: 'Bu işlem için yeniden doğrulama gerekli.' } },
        { status: 200, body: { success: true, transferId: 'tr-1', expiresAt: inDays(3) } },
      ]),
      'AccountService/reauthenticate': async (route: Route, headers: Record<string, string>) => {
        const body = route.request().postDataJSON()
        captures.push({ rpc: 'reauth', body: { hasPassword: typeof body?.password === 'string' }, key: (await route.request().headerValue('idempotency-key')) ?? null })
        return body?.password === 'Dogru-Parola-2026'
          ? json(route, headers, 200, { success: true, reauthValidUntil: inDays(0.003) })
          : json(route, headers, 400, { code: 'INVALID_CURRENT_PASSWORD', error: 'Mevcut parola hatalı.' })
      },
      'UserService/cancelOwnershipTransfer': sequence(captures, 'cancel', [{ status: 200, body: { success: true } }]),
    })
    await openRowMenu(page, 'Elif Yıldız')
    await page.getByRole('menuitem', { name: 'Sahipliği devret' }).click()
    const dialog = page.getByRole('dialog', { name: 'Mağaza sahipliğini devret' })
    await expect(dialog).toContainText('Devri başlatın')
    await expect(dialog).toContainText('Yeni sahip kabul eder')
    await expect(dialog.getByTestId('transfer-target')).toContainText('Elif Yıldız') // satırdan önceden seçili
    await dialog.getByRole('button', { name: 'Devri başlat' }).click()

    const reauth = page.getByRole('dialog', { name: 'Kimliğinizi doğrulayın' })
    await expect(reauth).toBeVisible()
    await expect(page).not.toHaveURL(/\/login/)
    await expect(reauth.getByTestId('reauth-password').locator('input')).toBeFocused()
    await page.keyboard.type('yanlis-parola')
    await page.keyboard.press('Enter')
    await expect(reauth.getByText(/Parola hatalı/)).toBeVisible()
    await expect(reauth).toBeVisible()
    await reauth.getByTestId('reauth-password').locator('input').fill('Dogru-Parola-2026')
    await reauth.getByRole('button', { name: 'Doğrula ve devam et' }).click()
    await expect(reauth).toBeHidden()

    await expect(page.getByText('Devir başlatıldı. Elif Yıldız e-postasındaki bağlantıyla kabul edebilir.')).toBeVisible()
    await expect(page.getByTestId('transfer-pending')).toContainText('Elif Yıldız kabul edene kadar mağaza sahibi sizsiniz.')

    const initiates = captures.filter((c) => c.rpc === 'initiate')
    expect(initiates).toHaveLength(2)
    expect(initiates[0].body).toEqual({ targetUserId: 'user-e2e-0101' })
    expect(initiates[1].key).toBe(initiates[0].key)
    expect(captures.filter((c) => c.rpc === 'reauth')).toHaveLength(2)
    expect(captures.find((c) => c.rpc === 'reauth')!.key).toBeNull()

    await page.getByTestId('transfer-pending').getByRole('button', { name: 'Devri iptal et' }).click()
    await page.getByRole('alertdialog', { name: 'Sahiplik devri iptal edilsin mi?' }).getByRole('button', { name: 'Devri iptal et' }).click()
    await expect(page.getByText('Sahiplik devri iptal edildi.')).toBeVisible()
    await expect(page.getByTestId('transfer-pending')).toBeHidden()
  })

  test('reauth vazgeçilirse işlem yapılmaz: istek yinelenmez, hata iletisi yok, devir diyaloğu açık kalır', async ({ page }) => {
    const captures: Capture[] = []
    await openTeam(page, {
      'UserService/initiateOwnershipTransfer': sequence(captures, 'initiate', [{ status: 401, body: { code: 'REAUTH_REQUIRED' } }]),
    })
    await openRowMenu(page, 'Elif Yıldız')
    await page.getByRole('menuitem', { name: 'Sahipliği devret' }).click()
    const dialog = page.getByRole('dialog', { name: 'Mağaza sahipliğini devret' })
    await dialog.getByRole('button', { name: 'Devri başlat' }).click()
    const reauth = page.getByRole('dialog', { name: 'Kimliğinizi doğrulayın' })
    await expect(reauth).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(reauth).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('transfer-error')).toHaveCount(0)
    expect(captures).toHaveLength(1)
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('axe: ekip ekranı + davet ve devir diyalogları WCAG 2.1 AA ihlalsiz', async ({ page }) => {
    await openTeam(page)
    const list = await new AxeBuilder({ page }).include('.authorizationListView').withTags(AXE_TAGS).analyze()
    expect(list.violations, JSON.stringify(list.violations, null, 2)).toEqual([])
    await page.getByTestId('invite-open').click()
    await expect(page.getByRole('dialog', { name: 'Ekibe kişi davet et' })).toBeVisible()
    await page.waitForTimeout(350)
    const invite = await new AxeBuilder({ page }).include('.v-overlay--active .ek-dialog-content').withTags(AXE_TAGS).analyze()
    expect(invite.violations, JSON.stringify(invite.violations, null, 2)).toEqual([])
  })
})

test.describe('C2a — davet kabul sayfası (/invite)', () => {
  const invitation = { tenantTitle: 'Moda Dünyası', role: 'operator', email: 'a***@example.com', expiresAt: inDays(4) }

  test('token parçadan okunur, adresten hemen silinir; özet + form; zayıf parola alan iletisi; kabul oturum açmaz → giriş notu', async ({ page }) => {
    const captures: Capture[] = []
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/getInvitation': sequence(captures, 'get', [{ status: 200, body: invitation }]),
      'AccountService/acceptInvitation': sequence(captures, 'accept', [
        { status: 400, body: { code: 'WEAK_PASSWORD', error: 'Parola en az 10 karakter olmalı…' } },
        { status: 200, body: { success: true } },
      ]),
    })
    await page.goto(`/invite#t=${TOKEN}`)
    await expect(page.getByRole('heading', { name: 'Moda Dünyası sizi ekibine davet etti' })).toBeVisible()
    expect(page.url()).not.toContain(TOKEN)
    expect(page.url()).not.toContain('#')
    const summary = page.getByTestId('invite-summary')
    await expect(summary).toContainText('Operatör')
    await expect(summary).toContainText('a***@example.com')
    await expect(summary).toContainText('gün kaldı')
    expect(captures[0].body).toEqual({ token: TOKEN })

    await page.getByTestId('invite-submit').click()
    await expect(page.getByText('Adınızı girin.').first()).toBeVisible()
    await page.getByLabel('Ad', { exact: true }).fill('Ayşe')
    await page.getByLabel('Soyad').fill('Demir')
    await page.getByLabel('Parola', { exact: true }).fill('parola12345')
    await page.getByLabel('Parola (tekrar)').fill('parola12345')
    await page.getByTestId('invite-submit').click()
    await expect(page.getByText(/Parola yeterince güçlü değil/).first()).toBeVisible()
    await page.getByLabel('Parola', { exact: true }).fill('Guclu-Parola-2026!')
    await page.getByLabel('Parola (tekrar)').fill('Guclu-Parola-2026!')
    await page.getByTestId('invite-submit').click()
    await expect(page.getByRole('heading', { name: 'Hesabınız hazır' })).toBeVisible()
    expect(captures.at(-1)!.body).toEqual({ token: TOKEN, name: 'Ayşe', surname: 'Demir', password: 'Guclu-Parola-2026!' })

    await page.getByTestId('invite-to-login').click()
    await expect(page).toHaveURL(/\/login\?reason=invitation-accepted/)
    await expect(page.getByText('Hesabınız oluşturuldu. E-posta adresiniz ve yeni parolanızla giriş yapın.')).toBeVisible()
    expect(page.url()).not.toContain(TOKEN)
  })

  for (const [code, status, title] of [
    ['INVITATION_EXPIRED', 410, 'Davetin süresi dolmuş'],
    ['INVITATION_REVOKED', 410, 'Davet iptal edilmiş'],
    ['INVITATION_ACCEPTED', 409, 'Davet zaten kabul edilmiş'],
    ['INVITATION_INVALID', 400, 'Davet bağlantısı geçersiz'],
  ] as const) {
    test(`belirteç durumu ${code} → "${title}"`, async ({ page }) => {
      await installApiMocks(page, { ...NO_SESSION, 'AccountService/getInvitation': mockError(status, { code, error: 'x' }) })
      await page.goto(`/invite#t=${TOKEN}`)
      await expect(page.getByText(title, { exact: true })).toBeVisible()
      await expect(page.getByTestId('invite-submit')).toHaveCount(0)
    })
  }

  test('bağlantısız açılış: "Davet bağlantısı bulunamadı", istek atılmaz; axe ihlalsiz', async ({ page }) => {
    const captures: Capture[] = []
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/getInvitation': sequence(captures, 'get', [{ status: 200, body: invitation }]) })
    await page.goto('/invite')
    await expect(page.getByText('Davet bağlantısı bulunamadı')).toBeVisible()
    expect(captures).toHaveLength(0)
    const r = await new AxeBuilder({ page }).include('.InvitationAcceptView').withTags(AXE_TAGS).analyze()
    expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([])
  })

  test('axe: dolu davet formu ihlalsiz', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/getInvitation': invitation })
    await page.goto(`/invite#t=${TOKEN}`)
    await expect(page.getByTestId('invite-summary')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('.InvitationAcceptView').withTags(AXE_TAGS).analyze()
    expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([])
  })
})

test.describe('C2a — sahiplik kabul sayfası (/accept-ownership)', () => {
  test('oturum varken: kabul → oturum kapanır → giriş notu; token adreste kalmaz', async ({ page }) => {
    const captures: Capture[] = []
    await installApiMocks(page, {
      'UserService/acceptOwnershipTransfer': sequence(captures, 'accept', [{ status: 200, body: { success: true } }]),
    })
    await page.goto(`/accept-ownership#t=${TOKEN}`)
    await expect(page.getByRole('heading', { name: 'Mağaza sahipliğini kabul edin' })).toBeVisible()
    expect(page.url()).not.toContain(TOKEN)
    await page.getByTestId('ownership-accept').click()
    await expect(page.getByRole('heading', { name: 'Artık mağaza sahibisiniz' })).toBeVisible()
    expect(captures[0].body).toEqual({ token: TOKEN })
  })

  test('oturum yokken: "Giriş yap ve devam et" → /login?redirect=/accept-ownership (token sorguda YOK)', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION })
    await page.goto(`/accept-ownership#t=${TOKEN}`)
    await page.getByTestId('ownership-login').click()
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)accept-ownership$/)
    expect(page.url()).not.toContain(TOKEN)
  })

  test('geçersiz belirteç: 400 TOKEN_INVALID → "Devir bağlantısı geçersiz"', async ({ page }) => {
    await installApiMocks(page, { 'UserService/acceptOwnershipTransfer': mockError(400, { code: 'TOKEN_INVALID', error: 'x' }) })
    await page.goto(`/accept-ownership#t=${TOKEN}`)
    await page.getByTestId('ownership-accept').click()
    await expect(page.getByText('Devir bağlantısı geçersiz')).toBeVisible()
  })
})

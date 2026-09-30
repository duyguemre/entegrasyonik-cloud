// İstemci + sahte API birlikte: hata zarfı, MFA_REQUIRED / REAUTH_REQUIRED işleme ve step-up yenilemesi.
import { describe, expect, it, vi } from 'vitest'
import { AdminApiError, apiOriginOf, createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'

function setup() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  const hooks = { onUnauthenticated: vi.fn(), onMfaRequired: vi.fn(), requestReauth: vi.fn(async () => true) }
  api.setHooks(hooks)
  return { server, api, hooks }
}

async function signIn(api: ReturnType<typeof setup>['api']) {
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
}

describe('admin-api istemcisi', () => {
  it('hata zarfı → AdminApiError {status, code, requestId}; yanlış parola hook tetiklemez (kimlik akışı)', async () => {
    const { api, hooks } = setup()
    const err = await api.call('BackofficeAuthService/login', { email: 'x@ornek.test', password: 'yanlis' }).catch((e) => e)
    expect(err).toBeInstanceOf(AdminApiError)
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(err.requestId).toMatch(/^mock-/)
    expect(err.message).toBe('E-posta veya parola hatalı.')
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled()
  })

  it('yarım oturumda (parola sonrası, TOTP öncesi) operasyon → MFA_REQUIRED → onMfaRequired', async () => {
    const { api, hooks } = setup()
    await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    const err = await api.call('AdminService/getClients', {}).catch((e) => e)
    expect(err).toMatchObject({ status: 403, code: 'MFA_REQUIRED' })
    expect(hooks.onMfaRequired).toHaveBeenCalledTimes(1)
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled()
  })

  it('oturum yokken operasyon → 401 → onUnauthenticated', async () => {
    const { api, hooks } = setup()
    await expect(api.call('AdminService/getClients', {})).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(hooks.onUnauthenticated).toHaveBeenCalledTimes(1)
  })

  it('REAUTH_REQUIRED → step-up diyaloğu → reauth → istek BİR kez yenilenir ve başarır', async () => {
    const { api, server, hooks } = setup()
    await signIn(api)
    server.expireReauth()
    hooks.requestReauth.mockImplementation(async () => {
      await api.call('BackofficeAuthService/reauth', { password: MOCK_ACCOUNTS.password, code: '654321' })
      return true
    })
    const res = await api.call('BackofficeTenantService/startImpersonation', { tid: 102, reason: 'Destek talebi incelemesi' })
    expect(hooks.requestReauth).toHaveBeenCalledTimes(1)
    expect(res.url).toMatch(/\/impersonate#t=[0-9a-f]{32}$/)
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled()
  })

  it('step-up iptal → istek atılmaz, hata cancelled=true; oturum düşmez', async () => {
    const { api, server, hooks } = setup()
    await signIn(api)
    server.expireReauth()
    hooks.requestReauth.mockResolvedValue(false)
    const err = await api.call('BackofficeTenantService/startImpersonation', { tid: 102, reason: 'Destek talebi incelemesi' }).catch((e) => e)
    expect(err).toMatchObject({ code: 'REAUTH_REQUIRED', cancelled: true })
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled()
  })

  it('reauth sonrası hâlâ REAUTH_REQUIRED ise sonsuz döngü yok (tek yenileme)', async () => {
    const { api, server, hooks } = setup()
    await signIn(api)
    server.expireReauth()
    hooks.requestReauth.mockResolvedValue(true) // doğrulamadan "tamam" der
    await expect(api.call('BackofficeTenantService/startImpersonation', { tid: 102, reason: 'Destek talebi incelemesi' })).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' })
    expect(hooks.requestReauth).toHaveBeenCalledTimes(1)
  })

  it('eşzamanlı iki REAUTH_REQUIRED tek diyalog açar', async () => {
    const { api, server, hooks } = setup()
    await signIn(api)
    server.expireReauth()
    hooks.requestReauth.mockImplementation(async () => {
      await api.call('BackofficeAuthService/reauth', { password: MOCK_ACCOUNTS.password, code: '111111' })
      return true
    })
    const body = { tid: 101, reason: 'Destek talebi incelemesi' }
    await Promise.all([api.call('BackofficeTenantService/startImpersonation', body), api.call('BackofficeTenantService/startImpersonation', body)])
    expect(hooks.requestReauth).toHaveBeenCalledTimes(1)
  })

  it('yanlış reauth kodu oturumu düşürmez (reauth kimlik akışında)', async () => {
    const { api, hooks } = setup()
    await signIn(api)
    await expect(api.call('BackofficeAuthService/reauth', { password: MOCK_ACCOUNTS.password, code: '000000' })).rejects.toMatchObject({ status: 401 })
    expect(hooks.onUnauthenticated).not.toHaveBeenCalled()
  })

  it('gerekçe < 10 karakter → VALIDATION + fields', async () => {
    const { api } = setup()
    await signIn(api)
    await expect(api.call('BackofficeTenantService/startImpersonation', { tid: 102, reason: 'kısa' })).rejects.toMatchObject({ code: 'VALIDATION', fields: [{ path: 'reason' }] })
  })

  it('/health ve /ready bağlam yolunun dışında; 503 bir yanıttır', async () => {
    const { api, server } = setup()
    expect(apiOriginOf('https://api.entegrasyonik.com/admin-api')).toBe('https://api.entegrasyonik.com')
    server.setDegraded(true)
    const ready = await api.probe<{ ready: boolean; redis: string }>('/ready')
    expect(ready).toMatchObject({ ok: true, status: 503, data: { ready: false, redis: 'fail' } })
  })

  it('5 hatalı TOTP → kilit (429 RATE_LIMITED)', async () => {
    const { api } = setup()
    await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    for (let i = 0; i < 5; i++) await api.call('BackofficeAuthService/verifyTotp', { code: '000000' }).catch(() => undefined)
    await expect(api.call('BackofficeAuthService/verifyTotp', { code: '123456' })).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
  })
})

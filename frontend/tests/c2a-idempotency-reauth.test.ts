// Faz 3 / C2a — Idempotency-Key üretimi (API_IDEMPOTENCY.md) + REAUTH_REQUIRED merkezi yakalayıcısı
// (API_ACCOUNT_LIFECYCLE.md §8). Gerçek axios yakalayıcıları üzerinden, sahte adaptörle (ağ yok) sınanır.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

const push = vi.fn()
vi.mock('@/router', () => ({
  default: { isReady: () => Promise.resolve(), currentRoute: { value: { path: '/settings/users', meta: { requiresAuth: true } } }, push },
}))

import useRestApi, {
  IDEMPOTENT_RPCS,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENCY_RETRY_DELAYS_MS,
  buildPostConfig,
  createIdempotentAction,
  isIdempotentRpc,
  newIdempotencyKey,
} from '../src/composables/restapi'
import { __resetReauthForTests, cancelReauth, submitReauth, useReauth } from '../src/composables/reauth'
import { errorMessageKey } from '../src/composables/errorCodes'

type Reply = { status: number; data?: any }
type Handler = (config: InternalAxiosRequestConfig) => Reply

const calls: InternalAxiosRequestConfig[] = []
let handler: Handler = () => ({ status: 200, data: {} })
const originalAdapter = axios.defaults.adapter

function headerOf(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const h: any = config.headers
  return (h?.get ? h.get(name) : h?.[name]) ?? undefined
}

function rpcOf(config: InternalAxiosRequestConfig): string {
  return String(config.url ?? '').replace(/^.*\/api\//, '')
}

const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  setActivePinia(createPinia())
  push.mockReset()
  calls.length = 0
  __resetReauthForTests()
  axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    calls.push(config)
    const reply = handler(config)
    const response = { status: reply.status, statusText: '', data: reply.data ?? {}, headers: new AxiosHeaders(), config }
    if (reply.status >= 400) throw new AxiosError(`HTTP ${reply.status}`, AxiosError.ERR_BAD_RESPONSE, config, null, response as any)
    return response
  }) as any
})

afterEach(() => {
  axios.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

describe('Idempotency-Key üretimi (tek yer: restapi.ts)', () => {
  it('sözleşmedeki 22 RPC listesi birebir (backend yetenek kaydı external && effect!=read)', () => {
    expect([...IDEMPOTENT_RPCS].sort()).toEqual([
      'AccountService/resendVerificationEmail',
      'BillingService/startCheckout',
      'ClaimService/approveClaim', 'ClaimService/bulkApproveClaim', 'ClaimService/rejectClaim',
      'IntegrationService/batchCreator', 'IntegrationService/requestFetchFromPlatform', 'IntegrationService/retrieveAndSetExternalToken',
      'InvoiceService/bulkCreateInvoice', 'InvoiceService/createInvoice', 'InvoiceService/createManualInvoice', 'InvoiceService/resolveAndReissueInvoice',
      'MessageService/replyMessage',
      'OrderService/approveOrder', 'OrderService/bulkApproveOrder', 'OrderService/bulkCancelOrder', 'OrderService/cancelOrder',
      'ShipmentService/bulkCreateShipment', 'ShipmentService/createShipment',
      'UserService/initiateOwnershipTransfer', 'UserService/inviteUser', 'UserService/resendInvitation',
    ].sort())
  })

  it('anahtar biçimi sözleşmeye uyar (UUID; 8-128, A-Za-z0-9._:-) ve her üretim farklıdır', () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    expect(a).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('listedeki RPC başlık alır; listede olmayan almaz (eski çağrı biçimi: yapılandırma undefined)', () => {
    expect(isIdempotentRpc('OrderService/cancelOrder')).toBe(true)
    expect(isIdempotentRpc('OrderService/getOrders')).toBe(false)
    expect(buildPostConfig('OrderService/getOrders')).toBeUndefined()
    const cfg = buildPostConfig('OrderService/cancelOrder')!
    expect(cfg.headers[IDEMPOTENCY_HEADER]).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(buildPostConfig('ProductService/save', { idempotent: true })!.headers[IDEMPOTENCY_HEADER]).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(buildPostConfig('X/y', { skipSessionRedirect: true })).toEqual({ skipSessionRedirect: true })
  })

  it('verilen eylem anahtarı kullanılır; biçimsiz anahtar yerine yenisi üretilir', () => {
    expect(buildPostConfig('UserService/inviteUser', { idempotencyKey: 'abc12345-key' })!.headers[IDEMPOTENCY_HEADER]).toBe('abc12345-key')
    expect(buildPostConfig('UserService/inviteUser', { idempotencyKey: 'kısa' })!.headers[IDEMPOTENCY_HEADER]).not.toBe('kısa')
  })

  it('kullanıcı eylemi: aynı gövdenin yeniden denemesi AYNI anahtar; gövde değişince YENİ; reset sonrası YENİ', () => {
    const action = createIdempotentAction()
    const k1 = action.keyFor({ email: 'a@b.co', role: 'admin' })
    expect(action.keyFor({ role: 'admin', email: 'a@b.co' })).toBe(k1) // alan sırası farkı aynı gövde
    const k2 = action.keyFor({ email: 'a@b.co', role: 'operator' })
    expect(k2).not.toBe(k1)
    action.reset()
    expect(action.keyFor({ email: 'a@b.co', role: 'operator' })).not.toBe(k2)
  })

  it('iki ayrı post çağrısı (iki ayrı düğme basışı) iki ayrı anahtar gönderir; eylem anahtarı verilince ikisi aynı', async () => {
    handler = () => ({ status: 200, data: { success: true } })
    const api = useRestApi()
    await api.post('OrderService/cancelOrder', { id: 1 })
    await api.post('OrderService/cancelOrder', { id: 1 })
    expect(headerOf(calls[0], IDEMPOTENCY_HEADER)).not.toBe(headerOf(calls[1], IDEMPOTENCY_HEADER))

    const action = createIdempotentAction()
    await api.post('OrderService/cancelOrder', { id: 2 }, true, undefined, { idempotencyKey: action.keyFor({ id: 2 }) })
    await api.post('OrderService/cancelOrder', { id: 2 }, true, undefined, { idempotencyKey: action.keyFor({ id: 2 }) })
    expect(headerOf(calls[2], IDEMPOTENCY_HEADER)).toBe(headerOf(calls[3], IDEMPOTENCY_HEADER))
  })

  it('409 IDEMPOTENCY_IN_PROGRESS kullanıcıya gösterilmez: AYNI anahtarla otomatik yeniden sorulur', async () => {
    const saved = [...IDEMPOTENCY_RETRY_DELAYS_MS]
    IDEMPOTENCY_RETRY_DELAYS_MS.splice(0, saved.length, 0, 0, 0)
    try {
      let n = 0
      handler = () => (++n < 3 ? { status: 409, data: { code: 'IDEMPOTENCY_IN_PROGRESS' } } : { status: 200, data: { success: true } })
      const resp = await useRestApi().post('InvoiceService/createInvoice', { orderId: 'o1' })
      expect(resp).toEqual({ success: true })
      expect(calls).toHaveLength(3)
      const keys = new Set(calls.map((c) => headerOf(c, IDEMPOTENCY_HEADER)))
      expect(keys.size).toBe(1)

      // Tavan aşılırsa hata çağırana döner; ileti "işlem sürüyor".
      calls.length = 0
      handler = () => ({ status: 409, data: { code: 'IDEMPOTENCY_IN_PROGRESS' } })
      const stuck = await useRestApi().post('InvoiceService/createInvoice', { orderId: 'o2' })
      expect(calls).toHaveLength(4)
      expect(errorMessageKey(stuck)).toBe('apiErrors.IDEMPOTENCY_IN_PROGRESS')
    } finally {
      IDEMPOTENCY_RETRY_DELAYS_MS.splice(0, 3, ...saved)
    }
  })

  it('422 IDEMPOTENCY_KEY_REUSED yeniden denenmez, okunur iletiye eşlenir', async () => {
    handler = () => ({ status: 422, data: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    const resp = await useRestApi().post('UserService/inviteUser', { email: 'x@y.co', role: 'admin' })
    expect(calls).toHaveLength(1)
    expect(errorMessageKey(resp)).toBe('apiErrors.IDEMPOTENCY_KEY_REUSED')
  })
})

describe('REAUTH_REQUIRED — tek diyalog, doğrulama sonrası AYNI anahtarla yineleme', () => {
  const reauthRequired: Reply = { status: 401, data: { code: 'REAUTH_REQUIRED', error: 'Bu işlem için yeniden doğrulama gerekli.' } }

  it('401 REAUTH_REQUIRED girişe YÖNLENDİRMEZ; diyalog açılır, parola doğrulanınca istek aynı Idempotency-Key ile yinelenir', async () => {
    let transferCalls = 0
    handler = (c) => {
      if (rpcOf(c) === 'AccountService/reauthenticate') return { status: 200, data: { success: true, reauthValidUntil: '2026-09-30T10:05:00.000Z' } }
      return ++transferCalls === 1 ? reauthRequired : { status: 200, data: { success: true, transferId: 't1' } }
    }
    const { state } = useReauth()
    const pending = useRestApi().post('UserService/initiateOwnershipTransfer', { targetUserId: 'u2' })
    await flush()
    expect(state.open).toBe(true)
    expect(push).not.toHaveBeenCalled()

    await submitReauth('Doğru-Parola-2026')
    const resp = await pending
    expect(resp).toEqual({ success: true, transferId: 't1' })
    expect(state.open).toBe(false)

    const transfer = calls.filter((c) => rpcOf(c) === 'UserService/initiateOwnershipTransfer')
    expect(transfer).toHaveLength(2)
    expect(headerOf(transfer[0], IDEMPOTENCY_HEADER)).toMatch(IDEMPOTENCY_KEY_PATTERN)
    expect(headerOf(transfer[1], IDEMPOTENCY_HEADER)).toBe(headerOf(transfer[0], IDEMPOTENCY_HEADER))
    expect(JSON.parse(String(transfer[1].data))).toEqual({ targetUserId: 'u2' })

    const reauth = calls.find((c) => rpcOf(c) === 'AccountService/reauthenticate')!
    expect(JSON.parse(String(reauth.data))).toEqual({ password: 'Doğru-Parola-2026' })
    expect(headerOf(reauth, IDEMPOTENCY_HEADER)).toBeUndefined()
    expect(push).not.toHaveBeenCalled()
  })

  it('yanlış parola (400 INVALID_CURRENT_PASSWORD) diyaloğu kapatmaz; hata iletisi gösterilir, doğru parolada devam eder', async () => {
    let transferCalls = 0
    handler = (c) => {
      if (rpcOf(c) === 'AccountService/reauthenticate') {
        return JSON.parse(String(c.data)).password === 'dogru' ? { status: 200, data: { success: true } } : { status: 400, data: { code: 'INVALID_CURRENT_PASSWORD' } }
      }
      return ++transferCalls === 1 ? reauthRequired : { status: 200, data: { success: true } }
    }
    const { state } = useReauth()
    const pending = useRestApi().post('UserService/initiateOwnershipTransfer', { targetUserId: 'u2' })
    await flush()
    expect(await submitReauth('yanlis')).toBe(false)
    expect(state.open).toBe(true)
    expect(state.errorKey).toBe('reauth.errors.wrongPassword')
    expect(push).not.toHaveBeenCalled()
    expect(await submitReauth('dogru')).toBe(true)
    expect(await pending).toEqual({ success: true })
  })

  it('vazgeçilirse işlem YAPILMAZ: istek bir kez gitmiş olur, sonuç "iptal" işaretli, kullanıcıya hata iletisi yok', async () => {
    handler = () => reauthRequired
    const { state } = useReauth()
    const pending = useRestApi().post('UserService/initiateOwnershipTransfer', { targetUserId: 'u2' })
    await flush()
    cancelReauth()
    const resp: any = await pending
    expect(state.open).toBe(false)
    expect(resp.reauthCancelled).toBe(true)
    expect(calls.filter((c) => rpcOf(c) === 'UserService/initiateOwnershipTransfer')).toHaveLength(1)
    expect(calls.some((c) => rpcOf(c) === 'AccountService/reauthenticate')).toBe(false)
    expect(errorMessageKey(resp)).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('eşzamanlı iki istek tek diyalog açar; doğrulama ikisini de yineler', async () => {
    const seen = new Map<string, number>()
    handler = (c) => {
      const rpc = rpcOf(c)
      if (rpc === 'AccountService/reauthenticate') return { status: 200, data: { success: true } }
      const n = (seen.get(rpc) ?? 0) + 1
      seen.set(rpc, n)
      return n === 1 ? reauthRequired : { status: 200, data: { ok: rpc } }
    }
    const api = useRestApi()
    const a = api.post('UserService/initiateOwnershipTransfer', { targetUserId: 'u2' })
    const b = api.post('UserService/suspendUser', { userId: 'u3' })
    await flush()
    await submitReauth('parola')
    expect(await a).toEqual({ ok: 'UserService/initiateOwnershipTransfer' })
    expect(await b).toEqual({ ok: 'UserService/suspendUser' })
    expect(calls.filter((c) => rpcOf(c) === 'AccountService/reauthenticate')).toHaveLength(1)
  })

  it('yinelenen istek yine REAUTH_REQUIRED dönerse döngü yok: hata çağırana döner', async () => {
    handler = (c) => (rpcOf(c) === 'AccountService/reauthenticate' ? { status: 200, data: { success: true } } : reauthRequired)
    const pending = useRestApi().post('UserService/initiateOwnershipTransfer', { targetUserId: 'u2' })
    await flush()
    await submitReauth('parola')
    const resp: any = await pending
    expect(resp.response.status).toBe(401)
    expect(calls.filter((c) => rpcOf(c) === 'UserService/initiateOwnershipTransfer')).toHaveLength(2)
    expect(push).not.toHaveBeenCalled()
  })

  it('kodsuz 401 hâlâ oturum düşmesidir (girişe yönlendirme — genel davranış korunur)', async () => {
    handler = () => ({ status: 401, data: {} })
    await useRestApi().post('ProductService/getProducts', {})
    await flush()
    expect(push).toHaveBeenCalledWith({ path: '/login', query: { reason: 'session-expired' } })
  })
})

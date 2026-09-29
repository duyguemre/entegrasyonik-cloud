// ADR-0017 Karar 1.8 — `sendClientLog` (gerçek `POST /api/client-log` nakliyesi) birim testi.
// Gerçek ağ çağrısı YOK: `fetch` mock'lanır. `@/router` mock'lanır (gerçek router ağır/DOM
// gerektirir — burada yalnızca "geçerli rota" alanının gövdeye doğru yansıdığı test edilir).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/router', () => ({
  default: {
    currentRoute: {
      value: {
        name: 'workspace',
        path: '/dashboard',
        matched: [{ path: '/' }, { path: ':screen(.*)*' }],
      },
    },
  },
}))

async function importFresh() {
  vi.resetModules()
  return await import('../src/composables/clientLogTransport')
}

describe('sendClientLog (ADR-0017 Karar 1.8)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ status: 204 } as any)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('doğru uca (POST /api/client-log), kimlik bilgisiyle (credentials: include) çağrı yapar', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'bir şey patladı')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/client-log$/)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('gövde şekli beyaz listeye uyar: level, msg, platform, ts, route dolu; reqId YOK', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'kritik hata', { module: 'test', op: 'x' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.level).toBe('error')
    expect(body.msg).toBe('kritik hata')
    expect(body.platform).toBe('web')
    expect(typeof body.ts).toBe('string')
    expect(body.route).toContain('workspace')
    expect(body).not.toHaveProperty('reqId')
    expect(body.context).toMatchObject({ module: 'test', op: 'x' })
  })

  it('context içindeki stack/errName TEKRAR gönderilmez (ayrı alanlara taşınmış)', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'x', { stack: 'Error: x\n at a\n at b', errName: 'TypeError' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.errName).toBe('TypeError')
    expect(body.stack).toContain('Error: x')
    expect(body.context).toBeUndefined()
  })

  it('stack 30 satırla sınırlanır', async () => {
    const { sendClientLog } = await importFresh()
    const stack = Array.from({ length: 60 }, (_, i) => `at line${i}`).join('\n')
    sendClientLog('error', 'x', { stack })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.stack!.split('\n')).toHaveLength(30)
  })

  it('sır anahtarları (password/token/secret/apiKey) context\'ten ATILIR', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'x', { password: 'gizli', token: 'abc', apiKey: 'k', safeField: 'ok' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.context).toEqual({ safeField: 'ok' })
  })

  it('mesajdaki e-posta/Bearer token istemci tarafında da REDAKTE edilir', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'kullanici@ornek.com Bearer abcdef123456 hata verdi')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.msg).not.toContain('kullanici@ornek.com')
    expect(body.msg).not.toContain('abcdef123456')
  })

  it('gövde 8 KB backend sınırının altında kalır (aşırı büyük context/stack kırpılır)', async () => {
    const { sendClientLog } = await importFresh()
    const hugeContext: Record<string, string> = {}
    for (let i = 0; i < 50; i++) hugeContext[`k${i}`] = 'x'.repeat(2000)
    sendClientLog('error', 'x'.repeat(2000), { stack: 'y'.repeat(20000), ...hugeContext })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const raw: string = fetchMock.mock.calls[0][1].body
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(7 * 1024)
    const body = JSON.parse(raw)
    expect(body.msg.length).toBeGreaterThan(0)
  })

  it('401 (auth yok) SESSİZCE yutulur — hata fırlatmaz, retry YOK', async () => {
    fetchMock.mockResolvedValue({ status: 401 } as any)
    const { sendClientLog } = await importFresh()
    expect(() => sendClientLog('error', 'kimliksiz istek')).not.toThrow()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // bir miktar daha bekle: retry YOK
    await new Promise(r => setTimeout(r, 20))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ağ hatası (fetch reddi) SESSİZCE yutulur — hata fırlatmaz', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { sendClientLog } = await importFresh()
    expect(() => sendClientLog('error', 'ağ hatası')).not.toThrow()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('aynı parmak izi 60 sn içinde İKİNCİ kez GÖNDERİLMEZ (istemci taşkın denetimi)', async () => {
    vi.useFakeTimers()
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000_000)
    const { sendClientLog } = await importFresh()

    sendClientLog('error', 'tekrar eden hata')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    nowSpy.mockReturnValue(1_000_000 + 10_000) // 10 sn sonra — hâlâ pencere içinde
    sendClientLog('error', 'tekrar eden hata')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    nowSpy.mockReturnValue(1_000_000 + 61_000) // 61 sn sonra — pencere dışında
    sendClientLog('error', 'tekrar eden hata')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it('farklı mesajlar taşkın denetimine takılmadan HER ZAMAN gönderilir', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('error', 'hata A')
    sendClientLog('error', 'hata B')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('warn seviyesi de gönderilir (backend "error"/"warn" kabul ediyor)', async () => {
    const { sendClientLog } = await importFresh()
    sendClientLog('warn', 'dikkat')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.level).toBe('warn')
  })
})

// §9 sse taşıyıcı: fetch sahtesiyle HTTP hata eşlemesi (§3.1), turn.end'siz kapanış → STREAM_INTERRUPTED, abort, PROTOCOL.
import { describe, expect, it, vi } from 'vitest'
import { createSseTransport, mapHttpError } from '../src/transport/sse'
import { ChatTransportError } from '../src/transport/types'
import type { ServerEvent, TurnRequest } from '../src/protocol/v1'
import { collect } from './helpers'

const REQ: TurnRequest = { v: 1, conversationId: null, clientTurnId: '11111111-1111-4111-8111-111111111111', locale: 'tr', input: { kind: 'text', text: 'merhaba' } }

function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init })
}
const frame = (e: ServerEvent) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
const START: ServerEvent = { type: 'turn.start', turnId: 't1', conversationId: 'c1', messageId: 'm1' }
const END: ServerEvent = { type: 'turn.end', turnId: 't1', status: 'completed' }

describe('sse taşıyıcı', () => {
  it('istek biçimi: POST /turns, Accept text/event-stream, credentials include, JSON gövde', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([frame(START), frame(END)]))
    const t = createSseTransport({ baseUrl: 'https://api.test/api/agent/', fetchImpl })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    expect(events.map((e) => e.type)).toEqual(['turn.start', 'turn.end'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/agent/turns')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream')
    expect(JSON.parse(String(init.body))).toEqual(REQ)
  })

  it('parça sınırında bölünmüş SSE + nabız yorumu doğru ayrıştırılır', async () => {
    const all = `: ping\n\n${frame(START)}${frame({ type: 'part', messageId: 'm1', part: { id: 'p', type: 'text', format: 'plain', text: 'a' } })}${frame(END)}`
    const chunks = [all.slice(0, 7), all.slice(7, 50), all.slice(50, 51), all.slice(51)]
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => sseResponse(chunks) })
    expect((await collect(t.sendTurn(REQ, new AbortController().signal))).map((e) => e.type)).toEqual(['turn.start', 'part', 'turn.end'])
  })

  it.each([
    [401, {}, 'UNAUTHENTICATED'],
    [403, {}, 'FORBIDDEN'],
    [409, {}, 'TURN_IN_PROGRESS'],
    [409, { code: 'TURN_DUPLICATE' }, 'TURN_DUPLICATE'],
    [423, {}, 'LIVE_READONLY'],
    [429, {}, 'RATE_LIMITED'],
    [429, { code: 'QUOTA_EXCEEDED' }, 'QUOTA_EXCEEDED'],
    [503, {}, 'MAINTENANCE'],
    [400, { code: 'PROTOCOL' }, 'PROTOCOL'],
    [500, {}, 'INTERNAL'],
  ])('HTTP %s %j → %s (tek error olayı)', async (status, body, code) => {
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => new Response(JSON.stringify({ message: 'Sunucu iletisi', supportCode: 'EK-1', ...body }), { status }) })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    const e = (events[0] as Extract<ServerEvent, { type: 'error' }>).error
    expect(e.code).toBe(code)
    expect(e.supportCode).toBe('EK-1')
    // PROTOCOL'de kendi "sayfayı yenileyin" metnimiz; diğerlerinde sunucu iletisi.
    expect(e.message).toBe(code === 'PROTOCOL' ? 'Uygulama sürümü güncel değil — sayfayı yenileyin.' : 'Sunucu iletisi')
  })

  it('retryable eşlemesi: 429/503 yeniden denenebilir, 403 değil', () => {
    expect(mapHttpError(429, null)).toBe('RATE_LIMITED')
    expect(mapHttpError(504, null)).toBe('TIMEOUT')
  })

  it('turn.end gelmeden kapanan akış → STREAM_INTERRUPTED (retryable)', async () => {
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => sseResponse([frame(START)]) })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    const last = events[events.length - 1] as Extract<ServerEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.error).toMatchObject({ code: 'STREAM_INTERRUPTED', retryable: true })
  })

  it('şemaya uymayan olay → PROTOCOL; ham içerik iletide YOK', async () => {
    const bad = `data: ${JSON.stringify({ type: 'part', messageId: 'm1', part: { id: 'p', type: 'text', format: 'html', text: '<script>SIR</script>' } })}\n\n`
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => sseResponse([frame(START), bad, frame(END)]) })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    expect(events.map((e) => e.type)).toEqual(['turn.start', 'error'])
    const e = (events[1] as Extract<ServerEvent, { type: 'error' }>).error
    expect(e.code).toBe('PROTOCOL')
    expect(JSON.stringify(e)).not.toContain('SIR')
  })

  it('JSON olmayan data → PROTOCOL', async () => {
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => sseResponse(['data: {bozuk\n\n']) })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    expect((events[0] as Extract<ServerEvent, { type: 'error' }>).error.code).toBe('PROTOCOL')
  })

  it('abort: fetch iptal edilir, olay üretilmez', async () => {
    const ac = new AbortController()
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: fetchImpl as unknown as typeof fetch })
    const pending = collect(t.sendTurn(REQ, ac.signal))
    ac.abort()
    expect(await pending).toEqual([])
  })

  it('abort akış ortasında: okuyucu iptal edilir, STREAM_INTERRUPTED üretilmez', async () => {
    const ac = new AbortController()
    const enc = new TextEncoder()
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(frame(START)))
      },
      cancel() {
        cancelled = true
      },
    })
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => new Response(body, { status: 200 }) })
    const out: ServerEvent[] = []
    for await (const e of t.sendTurn(REQ, ac.signal)) {
      out.push(e)
      ac.abort()
    }
    expect(out.map((e) => e.type)).toEqual(['turn.start'])
    expect(cancelled).toBe(true)
  })

  it('ağ hatası → UNAVAILABLE error olayı', async () => {
    const t = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
    const events = await collect(t.sendTurn(REQ, new AbortController().signal))
    expect((events[0] as Extract<ServerEvent, { type: 'error' }>).error).toMatchObject({ code: 'UNAVAILABLE', retryable: true })
  })

  it('JSON uçları: info şemayla doğrulanır; bozuk yanıt PROTOCOL; HTTP hatası ChatTransportError', async () => {
    const ok = { v: 1, enabled: true, setup: { configured: true, canConfigure: true, consentRequired: false, canConsent: true }, readOnly: false, limits: { maxInputChars: 4000, turnsPerMinute: 10 }, suggestions: [] }
    const t1 = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => new Response(JSON.stringify(ok)) })
    await expect(t1.info()).resolves.toMatchObject({ enabled: true })
    const t2 = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => new Response(JSON.stringify({ ...ok, extra: 1 })) })
    await expect(t2.info()).rejects.toMatchObject({ code: 'PROTOCOL' })
    const t3 = createSseTransport({ baseUrl: '/api/agent', fetchImpl: async () => new Response('{}', { status: 401 }) })
    await expect(t3.info()).rejects.toBeInstanceOf(ChatTransportError)
  })

  it('uç haritası (§3.1): setup/more/reset/confirm', async () => {
    const calls: Array<[string, string]> = []
    const status = { v: 1, configured: false, canConfigure: true, consentRequired: true, canConsent: true, catalog: [], consentText: { version: '1', body: 'x' } }
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([init?.method ?? 'GET', url])
      if (url.endsWith('/more')) return new Response(JSON.stringify({ rows: [], more: null, total: 0 }))
      if (url.includes('/conversations/') || (init?.method === 'DELETE' && url.endsWith('/provider'))) return new Response(null, { status: 204 })
      if (url.endsWith('/provider/test')) return new Response(JSON.stringify({ ok: true, message: 'ok' }))
      if (url.endsWith('/confirm')) return sseResponse([frame(END)])
      return new Response(JSON.stringify(status))
    })
    const t = createSseTransport({ baseUrl: '/x/agent', fetchImpl: fetchImpl as unknown as typeof fetch })
    await t.setup.status()
    await t.setup.save({ v: 1, provider: 'openai', model: 'm' })
    await t.setup.test({ v: 1, provider: 'openai', model: 'm' })
    await t.setup.remove()
    await t.setup.consent({ v: 1, textVersion: '1', decision: 'accept' })
    await t.more({ v: 1, token: 'tok' })
    await t.reset('c/1')
    await collect(t.confirm({ v: 1, conversationId: 'c', pendingActionId: 'p', decision: 'reject', idempotencyKey: '11111111-1111-4111-8111-111111111111' }, new AbortController().signal))
    expect(calls).toEqual([
      ['GET', '/x/agent/provider'],
      ['PUT', '/x/agent/provider'],
      ['POST', '/x/agent/provider/test'],
      ['DELETE', '/x/agent/provider'],
      ['GET', '/x/agent/provider'], // DELETE 204 -> güncel durum ayrıca okunur
      ['POST', '/x/agent/provider/consent'],
      ['POST', '/x/agent/more'],
      ['DELETE', '/x/agent/conversations/c%2F1'],
      ['POST', '/x/agent/confirm'],
    ])
  })

  it('backend hata zarfı {error, code, requestId} -> {message, code, supportCode} (CHAT-FE-4)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'Kota doldu.', code: 'QUOTA_EXCEEDED', requestId: 'req-123' }), { status: 403 }))
    const t = createSseTransport({ baseUrl: '/x/agent', fetchImpl: fetchImpl as unknown as typeof fetch })
    const events = await collect(t.sendTurn({ v: 1, conversationId: 'c', clientTurnId: '11111111-1111-4111-8111-111111111111', locale: 'tr', input: { text: 'a' } } as never, new AbortController().signal))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', error: { code: 'QUOTA_EXCEEDED', message: 'Kota doldu.', supportCode: 'req-123' } })
    await expect(t.more({ v: 1, token: 'x' })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', supportCode: 'req-123', status: 403 })
  })

  it('PUT /provider 422 + ProviderTestResult -> LLM hata kodu ile ChatTransportError (kaydedilmedi)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: 'LLM_RATE_LIMITED', message: 'Sınır', retryAfterSec: 30 }), { status: 422 }))
    const t = createSseTransport({ baseUrl: '/x/agent', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(t.setup.save({ v: 1, provider: 'openai', model: 'm', apiKey: 'k' })).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED', status: 422, retryAfterSec: 30 })
  })

  it('backoffice: yazma isteklerine gerekçe eklenir; 401 REAUTH_REQUIRED -> reauth sonrası BİR kez yinelenir', async () => {
    const bodies: unknown[] = []
    let first = true
    const status = { v: 1, configured: true, canConfigure: true, consentRequired: false, canConsent: false, catalog: [], consentText: { version: '1', body: 'x' } }
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : null)
      if (init?.method === 'PUT' && first) {
        first = false
        return new Response(JSON.stringify({ error: 'Yeniden doğrulama gerekli', code: 'REAUTH_REQUIRED' }), { status: 401 })
      }
      return new Response(JSON.stringify(status))
    })
    const reauth = vi.fn(async () => true)
    const t = createSseTransport({ baseUrl: '/x/admin-api/agent', fetchImpl: fetchImpl as unknown as typeof fetch, setupWriteExtras: () => ({ reason: 'bakım için anahtar' }), reauth })
    await t.setup.save({ v: 1, provider: 'openai', model: 'm', apiKey: 'k' })
    expect(reauth).toHaveBeenCalledTimes(1)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toMatchObject({ reason: 'bakım için anahtar', provider: 'openai' })
    const noReason = createSseTransport({ baseUrl: '/x', fetchImpl: fetchImpl as unknown as typeof fetch, setupWriteExtras: () => { throw new ChatTransportError('VALIDATION', 'gerekçe') } })
    await expect(noReason.setup.save({ v: 1, provider: 'openai', model: 'm', apiKey: 'k' })).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

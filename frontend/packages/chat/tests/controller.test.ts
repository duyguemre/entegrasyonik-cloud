// useChat denetleyicisi — mock taşıyıcıyla uçtan uca (§5 yan etkileri, §4.1 olay sırası, idempotency, bağlam).
import { describe, expect, it, vi } from 'vitest'
import type { ConfirmPart, TablePart, TurnRequest } from '../src/protocol/v1'
import { flush, testChat } from './helpers'

const last = <T>(a: T[]) => a[a.length - 1]
const partsOf = (c: ReturnType<typeof testChat>['controller']) => c.messages.value.flatMap((m) => m.parts)

async function ready(options: Parameters<typeof testChat>[0] = {}) {
  const chat = testChat(options)
  await chat.controller.ensureLoaded()
  await flush()
  return chat
}

describe('useChat', () => {
  it('info → idle; SEND → kullanıcı + asistan mesajı; turn.end → idle; canlı özet', async () => {
    const { controller } = await ready()
    expect(controller.status.value).toBe('idle')
    expect(controller.send('onay bekleyen siparişler')).toBe(true)
    await flush(10)
    expect(controller.status.value).toBe('idle')
    const [user, assistant] = controller.messages.value
    expect(user.role).toBe('user')
    expect(assistant.role).toBe('assistant')
    expect(assistant.status).toBe('complete')
    expect(assistant.parts.map((p) => p.type)).toEqual(['progress', 'table', 'text'])
    await flush()
    expect(controller.liveMessage.value).toContain('tablo, 25 satır')
  })

  it('tek tur kuralı: tur sürerken ikinci SEND reddedilir', async () => {
    const { controller } = await ready({ speed: 1 })
    controller.send('uzun rapor')
    expect(controller.send('ikinci')).toBe(false)
    controller.stop()
  })

  it('STOP: akış durur, mesaj cancelled, durum idle', async () => {
    vi.useFakeTimers()
    const { controller } = testChat({ speed: 1 })
    const loading = controller.ensureLoaded()
    await vi.advanceTimersByTimeAsync(300)
    await loading
    controller.send('uzun rapor')
    await vi.advanceTimersByTimeAsync(400)
    expect(controller.status.value).toBe('streaming')
    controller.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(controller.status.value).toBe('idle')
    expect(last(controller.messages.value).status).toBe('cancelled')
    vi.useRealTimers()
  })

  it('onay akışı: awaiting-confirm → approve (idempotencyKey kart başına tek) → done', async () => {
    const { controller, transport } = await ready()
    const spy = vi.spyOn(transport, 'confirm')
    controller.send('siparişleri onayla')
    await flush(10)
    expect(controller.status.value).toBe('awaiting-confirm')
    expect(controller.focusRequest.value?.target).toBe('confirm')
    const card = partsOf(controller).find((p) => p.type === 'confirm') as ConfirmPart
    controller.approve(card)
    await flush(10)
    expect(controller.status.value).toBe('idle')
    expect((partsOf(controller).find((p) => p.type === 'confirm') as ConfirmPart).state).toBe('done')
    const reqs = spy.mock.calls.map((c) => c[0])
    expect(reqs).toHaveLength(1)
    expect(reqs[0]).toMatchObject({ decision: 'approve', pendingActionId: card.pendingActionId })
    expect(reqs[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ret akışı: rejected + "İşlem iptal edildi."', async () => {
    const { controller } = await ready()
    controller.send('siparişleri onayla')
    await flush(10)
    controller.reject(partsOf(controller).find((p) => p.type === 'confirm') as ConfirmPart)
    await flush(10)
    expect((partsOf(controller).find((p) => p.type === 'confirm') as ConfirmPart).state).toBe('rejected')
    expect(partsOf(controller).some((p) => p.type === 'text' && (p as { text: string }).text === 'İşlem iptal edildi.')).toBe(true)
  })

  it('typed kip: yanlış ifadeyle onay GÖNDERİLMEZ', async () => {
    const { controller, transport } = await ready()
    const spy = vi.spyOn(transport, 'confirm')
    controller.send('taslakları sil')
    await flush(10)
    const card = partsOf(controller).find((p) => p.type === 'confirm') as ConfirmPart
    controller.approve(card, 'sil 2')
    expect(spy).not.toHaveBeenCalled()
    controller.approve(card, 'SİL 2')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('confirm-expire: istemci saati dolunca kart expired + durum idle', async () => {
    let now = Date.UTC(2026, 9, 1, 10, 0, 0)
    const timers: Array<{ fn: () => void; at: number }> = []
    const { controller, transport } = testChat({ clock: { now: () => now, setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => undefined } })
    // Denetleyici saatini de sahte saate bağla.
    const c2 = (await import('../src/state/useChat')).createChatController({
      transport,
      host: controller.host,
      now: () => now,
      setTimer: (fn, ms) => (timers.push({ fn, at: now + ms }), timers.length),
      clearTimer: () => undefined,
    })
    await c2.ensureLoaded()
    await flush()
    c2.send('hızlı onay')
    await flush(10)
    expect(c2.status.value).toBe('awaiting-confirm')
    now += 10_500
    for (const t of timers.filter((x) => x.at <= now)) t.fn()
    expect(c2.status.value).toBe('idle')
    expect((c2.messages.value.flatMap((m) => m.parts).find((p) => p.type === 'confirm') as ConfirmPart).state).toBe('expired')
  })

  it('interrupted → error (STREAM_INTERRUPTED) → RETRY yeni clientTurnId ile', async () => {
    const { controller, transport } = await ready()
    const spy = vi.spyOn(transport, 'sendTurn')
    controller.send('kopma')
    await flush(10)
    expect(controller.status.value).toBe('error')
    expect(controller.machine.value.error?.code).toBe('STREAM_INTERRUPTED')
    controller.retry()
    await flush(10)
    const [a, b] = spy.mock.calls.map((c) => c[0] as TurnRequest)
    expect(b.clientTurnId).not.toBe(a.clientTurnId)
    expect(b.input).toEqual(a.input)
  })

  it('llm-key-invalid → OPEN_SETUP → setup-required (mesaj listesi korunur)', async () => {
    const { controller } = await ready()
    controller.send('anahtar')
    await flush(10)
    const count = controller.messages.value.length
    controller.openSetup()
    expect(controller.status.value).toBe('setup-required')
    expect(controller.messages.value).toHaveLength(count)
  })

  it('price-form: form gönderimi form→submitted, onay kartına bağlanır; yeni metin açık formu cancelled yapar', async () => {
    const { controller } = await ready()
    controller.send('fiyat güncelle')
    await flush(10)
    expect(controller.status.value).toBe('idle')
    const form = partsOf(controller).find((p) => p.type === 'form') as any
    expect(form.state).toBe('open')
    controller.send('vazgeçtim, satış özeti')
    await flush(10)
    expect((partsOf(controller).find((p) => p.type === 'form') as any).state).toBe('cancelled')
    controller.send('fiyat güncelle')
    await flush(10)
    const open = partsOf(controller).filter((p) => p.type === 'form').at(-1) as any
    expect(controller.submitForm(open, { product: 'prd_0001', price: 399.9, channels: ['trendyol'] }, 'Fiyat güncelle · ...')).toBe(true)
    await flush(10)
    expect(controller.status.value).toBe('awaiting-confirm')
  })

  it('daha fazla: satırlar eklenir, ilk yeni satır dizini döner; 500 satır tavanı', async () => {
    const { controller } = await ready()
    controller.send('siparişler')
    await flush(10)
    const msg = last(controller.messages.value)
    const table = msg.parts.find((p) => p.type === 'table') as TablePart
    const r = await controller.loadMore(msg.id, table.id)
    expect(r).toEqual({ firstNewIndex: 25 })
    expect((last(controller.messages.value).parts.find((p) => p.type === 'table') as TablePart).rows).toHaveLength(50)
  })

  it('bağlam çipi: istekte gönderilir; kaldırılınca gönderilmez', async () => {
    const { controller, transport } = await ready()
    const spy = vi.spyOn(transport, 'sendTurn')
    controller.setContext({ screen: 'OrderListView' }, 'Siparişler')
    controller.send('satış')
    await flush(10)
    controller.clearContext()
    controller.send('satış')
    await flush(10)
    expect((spy.mock.calls[0][0] as TurnRequest).context).toEqual({ screen: 'OrderListView' })
    expect((spy.mock.calls[1][0] as TurnRequest).context).toBeUndefined()
  })

  it('RESET: liste temizlenir + "Yeni sohbet başladı"; conversationId sıfırlanır; transport.reset çağrılır', async () => {
    const { controller, transport } = await ready()
    const reset = vi.spyOn(transport, 'reset')
    const send = vi.spyOn(transport, 'sendTurn')
    controller.send('satış')
    await flush(10)
    await controller.reset()
    expect(controller.messages.value.map((m) => m.role)).toEqual(['notice'])
    expect(reset).toHaveBeenCalledWith('conv-mock-1')
    controller.send('satış')
    await flush(10)
    expect((send.mock.calls[1][0] as TurnRequest).conversationId).toBeNull()
  })

  it('OFFLINE → error OFFLINE; ONLINE → idle', async () => {
    const { controller } = await ready()
    controller.setOnline(false)
    expect(controller.machine.value.error?.code).toBe('OFFLINE')
    controller.setOnline(true)
    expect(controller.status.value).toBe('idle')
  })

  it('setup-required → kurulum kaydı → setupSaved → idle', async () => {
    const { controller, transport } = await ready({ config: 'setup-required' })
    expect(controller.status.value).toBe('setup-required')
    const st = await transport.setup.status()
    await transport.setup.save({ v: 1, provider: 'openai', model: 'openai-demo-balanced', apiKey: 'sk-good', consent: { textVersion: st.consentText.version, accepted: true } })
    controller.setupSaved()
    await flush(5)
    expect(controller.status.value).toBe('idle')
  })

  it('telemetri: yalnız olay adı + sayısal alanlar (metin YOK)', async () => {
    const track = vi.fn()
    const { controller } = await ready({ host: { track } })
    controller.send('Gizli müşteri adı Ayşe ile ilgili satış')
    await flush(10)
    const payload = JSON.stringify(track.mock.calls)
    expect(payload).not.toContain('Ayşe')
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ name: 'chat.turn', outcome: 'completed' }))
  })
})

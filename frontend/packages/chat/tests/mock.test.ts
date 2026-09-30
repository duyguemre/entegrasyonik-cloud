// §6 mock senaryoları: tetik eşleşmesi, akış biçimleri, onay/ret, more sayfaları, kurulum yapılandırmaları.
import { describe, expect, it } from 'vitest'
import { createMockTransport, mockKeyCheck, MOCK_CONFIG_IDS } from '../src/transport/mock'
import { matchScenario, SCENARIOS } from '../src/transport/mock/scenarios'
import type { ConfirmPart, ServerEvent, TablePart, TurnRequest } from '../src/protocol/v1'
import { collect } from './helpers'

const req = (text: string, conversationId: string | null = null): TurnRequest => ({ v: 1, conversationId, clientTurnId: '11111111-1111-4111-8111-111111111111', locale: 'tr', input: { kind: 'text', text } })
const signal = () => new AbortController().signal
const parts = (events: ServerEvent[]) => events.flatMap((e) => (e.type === 'part' ? [e.part] : []))

describe('tetik eşleşmesi (sözcük başı, öncelik sırası)', () => {
  it.each([
    ['Onay bekleyen siparişleri göster', 'orders-table'],
    ['sipariş listesi', 'orders-table'],
    ['İlk 3 siparişi onayla', 'approve-orders'],
    ['hızlı onay ver', 'confirm-expire'],
    ['taslakları sil', 'delete-typed'],
    ['Bir ürünün fiyat güncelle', 'price-form'],
    ['Stoğu azalan ürün hangisi?', 'entity'],
    ['bu haftaki satış özeti', 'sales-kpi'],
    ['ciro nedir', 'sales-kpi'],
    ['yetkim var mı', 'denied'],
    ['pazaryerine gönder', 'live-readonly'],
    ['çok hızlı yaz', 'rate'],
    ['kopma testi', 'interrupted'],
    ['haftalık rapor', 'long-stream'],
    ['yeni tür göster', 'unknown-part'],
    ['anahtar sorunu', 'llm-key-invalid'],
    ['sistem yoğun mu', 'llm-rate'],
  ])('%s → %s', (text, id) => {
    expect(matchScenario(text)?.id).toBe(id)
  })
  it('"kısıl" "sil" tetiklemez; eşleşme yoksa fallback', async () => {
    expect(matchScenario('kısıl')).toBeUndefined()
    const mock = createMockTransport({ speed: 0 })
    const events = await collect(mock.sendTurn(req('merhaba'), signal()))
    const text = parts(events).find((p) => p.type === 'text') as { text: string }
    expect(text.text).toContain('Bu demo şu soruları yanıtlar:')
  })
  it('senaryo kimlikleri tekil ve sözleşmedeki liste', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['orders-table', 'sales-kpi', 'approve-orders', 'delete-typed', 'confirm-expire', 'price-form', 'entity', 'denied', 'live-readonly', 'rate', 'interrupted', 'long-stream', 'unknown-part', 'llm-key-invalid', 'llm-rate']) expect(ids).toContain(id)
    for (const cfg of ['unavailable', 'setup-required', 'setup-no-permission', 'consent-pending-owner', 'consent-pending-admin', 'read-only']) expect(MOCK_CONFIG_IDS).toContain(cfg)
  })
})

describe('akış biçimleri', () => {
  it('orders-table: progress running→done, 8 kolon 25 satır total 132, maskeli müşteri, more 2 kez token, 3. çağrıda null', async () => {
    const mock = createMockTransport({ speed: 0 })
    const events = await collect(mock.sendTurn(req('onay bekleyen siparişler'), signal()))
    expect(events[0].type).toBe('turn.start')
    expect(events[events.length - 1]).toMatchObject({ type: 'turn.end', status: 'completed' })
    const progress = parts(events).filter((p) => p.type === 'progress') as Array<{ state: string; detail?: string }>
    expect(progress.map((p) => p.state)).toEqual(['running', 'done'])
    expect(progress[1].detail).toBe('25 kayıt')
    const table = parts(events).find((p) => p.type === 'table') as TablePart
    expect(table.columns).toHaveLength(8)
    expect(table.rows).toHaveLength(25)
    expect(table.total).toBe(132)
    expect(String(table.rows[0].customer)).toMatch(/^\S\*\*\* \S\*\*\*$/)
    const m1 = await mock.more({ v: 1, token: table.more!.token })
    const m2 = await mock.more({ v: 1, token: m1.more!.token })
    const m3 = await mock.more({ v: 1, token: m2.more!.token })
    expect([m1.rows.length, m2.rows.length, m3.rows.length]).toEqual([25, 25, 25])
    expect(m1.more && m2.more).toBeTruthy()
    expect(m3.more).toBeNull()
  })
  it('approve-orders: awaiting-confirm; onay executing→done (+openIn); ret rejected + "İşlem iptal edildi."', async () => {
    for (const decision of ['approve', 'reject'] as const) {
      const mock = createMockTransport({ speed: 0 })
      const events = await collect(mock.sendTurn(req('siparişleri onayla'), signal()))
      expect(events[events.length - 1]).toMatchObject({ type: 'turn.end', status: 'awaiting-confirm' })
      const card = parts(events).find((p) => p.type === 'confirm') as ConfirmPart
      expect(card).toMatchObject({ effect: 'write', risk: 'medium', external: true, state: 'pending' })
      expect(card.affected.sample).toHaveLength(3)
      expect(card.changes).toHaveLength(1)
      const start = events[0] as Extract<ServerEvent, { type: 'turn.start' }>
      const out = await collect(mock.confirm({ v: 1, conversationId: start.conversationId, pendingActionId: card.pendingActionId, decision, idempotencyKey: '11111111-1111-4111-8111-111111111111' }, signal()))
      expect(out.some((e) => e.type === 'turn.start')).toBe(false)
      const states = parts(out).filter((p) => p.type === 'confirm').map((p) => (p as ConfirmPart).state)
      if (decision === 'approve') {
        expect(states).toEqual(['executing', 'done'])
        expect((parts(out).at(-1) as ConfirmPart).result?.openIn).toBeTruthy()
      } else {
        expect(states).toEqual(['rejected'])
        expect(parts(out).some((p) => p.type === 'text' && (p as { text: string }).text === 'İşlem iptal edildi.')).toBe(true)
      }
      // Tek kullanımlık: aynı kart ikinci kez karara bağlanamaz.
      const again = await collect(mock.confirm({ v: 1, conversationId: start.conversationId, pendingActionId: card.pendingActionId, decision, idempotencyKey: '11111111-1111-4111-8111-111111111111' }, signal()))
      expect(again[0]).toMatchObject({ type: 'error', error: { code: 'CONFIRM_EXPIRED' } })
    }
  })
  it('delete-typed: destructive/high/typed "SİL 2"; yanlış ifade reddedilir', async () => {
    const mock = createMockTransport({ speed: 0 })
    const events = await collect(mock.sendTurn(req('taslakları sil'), signal()))
    const card = parts(events).find((p) => p.type === 'confirm') as ConfirmPart
    expect(card).toMatchObject({ effect: 'destructive', risk: 'high', confirmMode: 'typed', typedPhrase: 'SİL 2' })
    const bad = await collect(mock.confirm({ v: 1, conversationId: 'conv-mock-1', pendingActionId: card.pendingActionId, decision: 'approve', typedPhrase: 'sil 2', idempotencyKey: '11111111-1111-4111-8111-111111111111' }, signal()))
    expect(bad[0]).toMatchObject({ type: 'error', error: { code: 'VALIDATION' } })
  })
  it('confirm-expire: expiresAt +10 sn; süre dolunca onay reddedilir (expired)', async () => {
    let now = Date.UTC(2026, 9, 1, 10, 0, 0)
    const clock = { now: () => now, setTimeout: (fn: () => void) => (fn(), 0), clearTimeout: () => undefined }
    const mock = createMockTransport({ speed: 0, clock })
    const events = await collect(mock.sendTurn(req('hızlı onay'), signal()))
    const card = parts(events).find((p) => p.type === 'confirm') as ConfirmPart
    expect(Date.parse(card.expiresAt) - now).toBe(10_000)
    now += 11_000
    const out = await collect(mock.confirm({ v: 1, conversationId: 'conv-mock-1', pendingActionId: card.pendingActionId, decision: 'approve', idempotencyKey: '11111111-1111-4111-8111-111111111111' }, signal()))
    expect((parts(out)[0] as ConfirmPart).state).toBe('expired')
  })
  it('price-form: form (entity, money, select multiple) → awaiting-input; gönderilince onay akışı', async () => {
    const mock = createMockTransport({ speed: 0 })
    const events = await collect(mock.sendTurn(req('fiyat güncelle'), signal()))
    expect(events.at(-1)).toMatchObject({ type: 'turn.end', status: 'awaiting-input' })
    const form = parts(events).find((p) => p.type === 'form') as { formId: string; fields: Array<{ kind: string; multiple?: boolean }> }
    expect(form.fields.map((f) => f.kind)).toEqual(['entity', 'money', 'select'])
    expect(form.fields[2].multiple).toBe(true)
    const next = await collect(mock.sendTurn({ ...req('x', 'conv-mock-1'), input: { kind: 'form', formId: form.formId, values: { product: 'prd_0001', price: 399.9, channels: ['trendyol'] } } }, signal()))
    expect(next.at(-1)).toMatchObject({ type: 'turn.end', status: 'awaiting-confirm' })
  })
  it('interrupted: 3 delta sonra STREAM_INTERRUPTED; rate: turn.start YOK, RATE_LIMITED retryable', async () => {
    const mock = createMockTransport({ speed: 0 })
    const a = await collect(mock.sendTurn(req('kopma'), signal()))
    expect(a.filter((e) => e.type === 'delta')).toHaveLength(3)
    expect(a.at(-1)).toMatchObject({ type: 'error', error: { code: 'STREAM_INTERRUPTED', retryable: true } })
    const b = await collect(mock.sendTurn(req('çok hızlı'), signal()))
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ type: 'error', error: { code: 'RATE_LIMITED', retryable: true } })
  })
  it('long-stream: ~120 delta, 2.500 karakter; abort akışı durdurur', async () => {
    const mock = createMockTransport({ speed: 0 })
    const all = await collect(mock.sendTurn(req('uzun rapor'), signal()))
    const deltas = all.filter((e) => e.type === 'delta') as Array<{ text: string }>
    expect(deltas.length).toBeGreaterThanOrEqual(110)
    expect(deltas.map((d) => d.text).join('')).toHaveLength(2500)
    const ac = new AbortController()
    const got: ServerEvent[] = []
    for await (const e of mock.sendTurn(req('uzun rapor'), ac.signal)) {
      got.push(e)
      if (got.length === 5) ac.abort()
    }
    expect(got).toHaveLength(5)
  })
  it('hata senaryoları: denied (FORBIDDEN, open), llm-key-invalid (setup), llm-rate (retryable), live-readonly (parça)', async () => {
    const mock = createMockTransport({ speed: 0 })
    const denied = (await collect(mock.sendTurn(req('yetki'), signal()))).at(-1) as Extract<ServerEvent, { type: 'error' }>
    expect(denied.error).toMatchObject({ code: 'FORBIDDEN', retryable: false, action: { kind: 'open' } })
    const key = (await collect(mock.sendTurn(req('anahtar'), signal()))).at(-1) as Extract<ServerEvent, { type: 'error' }>
    expect(key.error).toMatchObject({ code: 'LLM_KEY_INVALID', action: { kind: 'setup' } })
    const rate = (await collect(mock.sendTurn(req('yoğun'), signal()))).at(-1) as Extract<ServerEvent, { type: 'error' }>
    expect(rate.error).toMatchObject({ code: 'LLM_RATE_LIMITED', retryable: true })
    expect(rate.error.message).toContain('20 sn')
    const ro = await collect(mock.sendTurn(req('pazaryerine gönder'), signal()))
    expect(parts(ro).some((p) => p.type === 'error' && (p as { code: string }).code === 'LIVE_READONLY')).toBe(true)
    expect(ro.at(-1)).toMatchObject({ type: 'turn.end', status: 'completed' })
  })
})

describe('yapılandırmalar ve kurulum API', () => {
  it('info: unavailable/maintenance/read-only/setup-required', async () => {
    expect(await createMockTransport({ speed: 0, config: 'unavailable' }).info()).toMatchObject({ enabled: false, reason: 'DISABLED' })
    expect(await createMockTransport({ speed: 0, config: 'maintenance' }).info()).toMatchObject({ enabled: false, reason: 'MAINTENANCE' })
    expect(await createMockTransport({ speed: 0, config: 'read-only' }).info()).toMatchObject({ enabled: true, readOnly: true })
    expect(await createMockTransport({ speed: 0, config: 'setup-required' }).info()).toMatchObject({ enabled: false, reason: 'SETUP_REQUIRED', setup: { canConfigure: true } })
    expect(await createMockTransport({ speed: 0, config: 'setup-no-permission' }).info()).toMatchObject({ reason: 'SETUP_REQUIRED', setup: { canConfigure: false } })
  })
  it('setup-required: test bad/quota; save sonrası (sahip onayıyla) enabled; kayıtta anahtar geri dönmez', async () => {
    const mock = createMockTransport({ speed: 0, config: 'setup-required' })
    expect((await mock.setup.test({ v: 1, provider: 'openai', model: 'm', apiKey: 'sk-bad' })).code).toBe('LLM_KEY_INVALID')
    expect((await mock.setup.test({ v: 1, provider: 'openai', model: 'm', apiKey: 'sk-quota' })).code).toBe('LLM_QUOTA')
    expect(mockKeyCheck('sk-good').ok).toBe(true)
    await expect(mock.setup.save({ v: 1, provider: 'openai', model: 'openai-demo-balanced', apiKey: 'sk-bad' })).rejects.toMatchObject({ code: 'LLM_KEY_INVALID' })
    const st = await mock.setup.status()
    const status = await mock.setup.save({ v: 1, provider: 'openai', model: 'openai-demo-balanced', apiKey: 'sk-good-123', consent: { textVersion: st.consentText.version, accepted: true } })
    expect(status.apiKey).toBe('sensitive')
    expect(JSON.stringify(status)).not.toContain('sk-good-123')
    expect(await mock.info()).toMatchObject({ enabled: true })
  })
  it('consent-pending-owner → onay → enabled; admin onay veremez (403)', async () => {
    const owner = createMockTransport({ speed: 0, config: 'consent-pending-owner' })
    const st = await owner.setup.status()
    await owner.setup.consent({ v: 1, textVersion: st.consentText.version, decision: 'accept' })
    expect(await owner.info()).toMatchObject({ enabled: true })
    const admin = createMockTransport({ speed: 0, config: 'consent-pending-admin' })
    await expect(admin.setup.consent({ v: 1, textVersion: st.consentText.version, decision: 'accept' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(admin.setup.save({ v: 1, provider: 'anthropic', model: 'x', consent: { textVersion: st.consentText.version, accepted: true } })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

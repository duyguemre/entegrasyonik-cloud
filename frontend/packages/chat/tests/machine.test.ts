// CHAT_UI_CONTRACT.md §5 — durum makinesi tablosunun HER satırı + yasak geçişler.
import { describe, expect, it } from 'vitest'
import { transition, type ChatStatus, type MachineEvent, type MachineState } from '../src/state/machine'
import type { AgentInfo, TurnError } from '../src/protocol/v1'

const info = (over: Partial<AgentInfo> = {}): AgentInfo => ({
  v: 1,
  enabled: true,
  setup: { configured: true, canConfigure: true, consentRequired: false, canConsent: true },
  readOnly: false,
  limits: { maxInputChars: 4000, turnsPerMinute: 10 },
  suggestions: [],
  ...over,
})
const st = (status: ChatStatus, extra: Partial<MachineState> = {}): MachineState => ({ status, ...extra })
const err = (code: TurnError['code'], retryable: boolean): TurnError => ({ code, message: 'x', retryable })
const effects = (r: ReturnType<typeof transition>) => r.effects.map((e) => e.type)
const ALL: ChatStatus[] = ['loading', 'setup-required', 'unavailable', 'idle', 'sending', 'streaming', 'awaiting-confirm', 'error']

describe('§5 tablo satırları', () => {
  it('loading + info enabled → idle', () => {
    expect(transition(st('loading'), { type: 'INFO', info: info() }).state.status).toBe('idle')
  })
  it('loading + SETUP_REQUIRED → setup-required', () => {
    expect(transition(st('loading'), { type: 'INFO', info: info({ enabled: false, reason: 'SETUP_REQUIRED' }) }).state.status).toBe('setup-required')
  })
  it('loading + DISABLED / MAINTENANCE → unavailable (nedenle)', () => {
    const a = transition(st('loading'), { type: 'INFO', info: info({ enabled: false, reason: 'DISABLED' }) }).state
    const b = transition(st('loading'), { type: 'INFO', info: info({ enabled: false, reason: 'MAINTENANCE' }) }).state
    expect(a).toEqual({ status: 'unavailable', unavailableReason: 'DISABLED' })
    expect(b).toEqual({ status: 'unavailable', unavailableReason: 'MAINTENANCE' })
  })
  it('loading + info alınamadı → unavailable LOAD_FAILED (yeniden dene)', () => {
    expect(transition(st('loading'), { type: 'INFO_FAILED' }).state).toEqual({ status: 'unavailable', unavailableReason: 'LOAD_FAILED' })
  })
  it('setup-required + SETUP_SAVED → loading + info yeniden alınır', () => {
    const r = transition(st('setup-required'), { type: 'SETUP_SAVED' })
    expect(r.state.status).toBe('loading')
    expect(effects(r)).toEqual(['fetchInfo'])
  })
  it('tur dışı herhangi + OPEN_SETUP → setup-required (mesaj listesine dokunmaz)', () => {
    for (const s of ['idle', 'error', 'awaiting-confirm', 'unavailable'] as ChatStatus[]) {
      const r = transition(st(s), { type: 'OPEN_SETUP' })
      expect(r.state.status, s).toBe('setup-required')
      expect(effects(r), s).not.toContain('resetConversation')
    }
  })
  it('idle + SEND → sending; açık formlar cancelled; tur başlar', () => {
    const r = transition(st('idle'), { type: 'SEND', input: { kind: 'text', text: 'merhaba' } })
    expect(r.state.status).toBe('sending')
    expect(effects(r)).toEqual(['cancelOpenForms', 'startTurn'])
  })
  it('sending + turn.start → streaming', () => {
    expect(transition(st('sending'), { type: 'TURN_START' }).state.status).toBe('streaming')
  })
  it('sending/streaming + part/delta → streaming', () => {
    for (const s of ['sending', 'streaming'] as ChatStatus[]) {
      expect(transition(st(s), { type: 'PART' }).state.status).toBe('streaming')
      expect(transition(st(s), { type: 'DELTA' }).state.status).toBe('streaming')
    }
  })
  it('streaming + turn.end completed → idle, mesaj complete, odak composer', () => {
    const r = transition(st('streaming'), { type: 'TURN_END', status: 'completed' })
    expect(r.state.status).toBe('idle')
    expect(r.effects).toContainEqual({ type: 'markMessage', status: 'complete' })
    expect(r.effects).toContainEqual({ type: 'focus', target: 'composer' })
  })
  it('streaming + turn.end awaiting-input → idle (form açık)', () => {
    const r = transition(st('streaming'), { type: 'TURN_END', status: 'awaiting-input' })
    expect(r.state.status).toBe('idle')
    expect(effects(r)).not.toContain('cancelOpenForms')
  })
  it('streaming + turn.end awaiting-confirm → awaiting-confirm, odak onay kartı başlığına', () => {
    const r = transition(st('streaming'), { type: 'TURN_END', status: 'awaiting-confirm' })
    expect(r.state.status).toBe('awaiting-confirm')
    expect(r.effects).toContainEqual({ type: 'focus', target: 'confirm' })
  })
  it('streaming + turn.end cancelled → idle (mesaj cancelled); failed → error (mesaj error)', () => {
    const c = transition(st('streaming'), { type: 'TURN_END', status: 'cancelled' })
    expect(c.state.status).toBe('idle')
    expect(c.effects).toContainEqual({ type: 'markMessage', status: 'cancelled' })
    const f = transition(st('streaming'), { type: 'TURN_END', status: 'failed' })
    expect(f.state.status).toBe('error')
    expect(f.effects).toContainEqual({ type: 'markMessage', status: 'error' })
  })
  it('sending/streaming + STOP → idle, abort, mesaj cancelled', () => {
    for (const s of ['sending', 'streaming'] as ChatStatus[]) {
      const r = transition(st(s), { type: 'STOP' })
      expect(r.state.status).toBe('idle')
      expect(effects(r)).toContain('abort')
      expect(r.effects).toContainEqual({ type: 'markMessage', status: 'cancelled' })
    }
  })
  it('sending/streaming + error olayı → error (hata saklanır)', () => {
    for (const s of ['sending', 'streaming'] as ChatStatus[]) {
      const r = transition(st(s), { type: 'SERVER_ERROR', error: err('RATE_LIMITED', true) })
      expect(r.state).toEqual({ status: 'error', error: err('RATE_LIMITED', true) })
    }
  })
  it('awaiting-confirm + APPROVE / REJECT → sending (confirm)', () => {
    expect(transition(st('awaiting-confirm'), { type: 'APPROVE' }).effects).toContainEqual({ type: 'confirm', decision: 'approve' })
    expect(transition(st('awaiting-confirm'), { type: 'REJECT' }).effects).toContainEqual({ type: 'confirm', decision: 'reject' })
    expect(transition(st('awaiting-confirm'), { type: 'APPROVE' }).state.status).toBe('sending')
  })
  it('awaiting-confirm + EXPIRE → idle', () => {
    const r = transition(st('awaiting-confirm'), { type: 'EXPIRE' })
    expect(r.state.status).toBe('idle')
    expect(effects(r)).toContain('expireConfirm')
  })
  it('error + RETRY (retryable) → sending (retryTurn: YENİ clientTurnId useChat\'te)', () => {
    const r = transition(st('error', { error: err('STREAM_INTERRUPTED', true) }), { type: 'RETRY' })
    expect(r.state.status).toBe('sending')
    expect(effects(r)).toEqual(['retryTurn'])
  })
  it('error + DISMISS → idle; error + SEND → sending', () => {
    expect(transition(st('error', { error: err('FORBIDDEN', false) }), { type: 'DISMISS' }).state.status).toBe('idle')
    expect(transition(st('error', { error: err('FORBIDDEN', false) }), { type: 'SEND', input: { kind: 'text', text: 'x' } }).state.status).toBe('sending')
  })
  it('herhangi + RESET → idle (sohbet durumlarında); tur sürüyorsa abort', () => {
    for (const s of ['idle', 'sending', 'streaming', 'awaiting-confirm', 'error'] as ChatStatus[]) {
      const r = transition(st(s), { type: 'RESET' })
      expect(r.state.status, s).toBe('idle')
      expect(effects(r), s).toContain('resetConversation')
      expect(effects(r).includes('abort'), s).toBe(s === 'sending' || s === 'streaming')
    }
  })
  it('RESET kurulum/kapalı/yükleniyor durumunu KORUR (sohbeti açmaz), listeyi temizler', () => {
    for (const s of ['loading', 'setup-required', 'unavailable'] as ChatStatus[]) {
      const r = transition(st(s), { type: 'RESET' })
      expect(r.state.status).toBe(s)
      expect(effects(r)).toEqual(['resetConversation'])
    }
  })
  it('herhangi + OFFLINE → error OFFLINE; çevrimiçi olunca DISMISS → idle', () => {
    const off = transition(st('streaming'), { type: 'OFFLINE' })
    expect(off.state.status).toBe('error')
    expect(off.state.error?.code).toBe('OFFLINE')
    expect(effects(off)).toContain('abort')
    expect(transition(off.state, { type: 'ONLINE' }).state.status).toBe('idle')
  })
})

describe('yasak geçişler (durum ve etki değişmez)', () => {
  const unchanged = (s: MachineState, e: MachineEvent) => {
    const r = transition(s, e)
    expect(r.state, `${s.status} + ${e.type}`).toBe(s)
    expect(r.effects, `${s.status} + ${e.type}`).toEqual([])
  }
  it('tek tur kuralı: sending/streaming/awaiting-confirm iken SEND reddedilir', () => {
    for (const s of ['sending', 'streaming', 'awaiting-confirm', 'loading', 'setup-required', 'unavailable'] as ChatStatus[]) unchanged(st(s), { type: 'SEND', input: { kind: 'text', text: 'x' } })
  })
  it('APPROVE/REJECT yalnız awaiting-confirm\'de', () => {
    for (const s of ALL.filter((x) => x !== 'awaiting-confirm')) {
      unchanged(st(s), { type: 'APPROVE' })
      unchanged(st(s), { type: 'REJECT' })
      unchanged(st(s), { type: 'EXPIRE' })
    }
  })
  it('retryable olmayan hata yeniden denenmez; error dışında RETRY yok sayılır', () => {
    unchanged(st('error', { error: err('FORBIDDEN', false) }), { type: 'RETRY' })
    for (const s of ALL.filter((x) => x !== 'error')) unchanged(st(s), { type: 'RETRY' })
  })
  it('tur olayları tur dışında yok sayılır', () => {
    for (const s of ['idle', 'awaiting-confirm', 'setup-required', 'unavailable', 'loading', 'error'] as ChatStatus[]) {
      unchanged(st(s), { type: 'PART' })
      unchanged(st(s), { type: 'DELTA' })
      unchanged(st(s), { type: 'TURN_END', status: 'completed' })
      unchanged(st(s), { type: 'STOP' })
      unchanged(st(s), { type: 'SERVER_ERROR', error: err('INTERNAL', true) })
    }
    unchanged(st('streaming'), { type: 'TURN_START' })
  })
  it('INFO yalnız loading\'de; SETUP_SAVED yalnız setup-required\'da; tur sırasında LOAD/OPEN_SETUP yok', () => {
    for (const s of ALL.filter((x) => x !== 'loading')) unchanged(st(s), { type: 'INFO', info: info() })
    for (const s of ALL.filter((x) => x !== 'setup-required')) unchanged(st(s), { type: 'SETUP_SAVED' })
    for (const s of ['sending', 'streaming'] as ChatStatus[]) {
      unchanged(st(s), { type: 'LOAD' })
      unchanged(st(s), { type: 'OPEN_SETUP' })
    }
  })
  it('ONLINE yalnız OFFLINE hatasını kapatır', () => {
    unchanged(st('error', { error: err('FORBIDDEN', false) }), { type: 'ONLINE' })
  })
})

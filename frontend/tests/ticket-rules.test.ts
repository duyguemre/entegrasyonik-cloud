import { describe, expect, it } from 'vitest'
import { TicketPriorityEnum, TicketTypeEnum } from '../src/types/TicketTypes'
import {
  MESSAGE_MAX, SUBJECT_MAX, TICKET_PRIORITY_META, TICKET_TYPE_META, buildOpenTicketPayload, buildTimeline, classifyFailure,
  counterAnnouncement, counterState, dayKey, describeSubmitError, emptyDraft, hasErrors, initialSubmitState, isSubmitShortcut,
  nextRadioIndex, submitReducer, validateDraft, withDaySeparators,
} from '../src/components/ticket/composables/ticketRules'

describe('ticketRules — doğrulama', () => {
  it('boş konu ve mesaj ayrı ayrı, eylem gösteren metinle reddedilir', () => {
    const e = validateDraft({ subject: '   ', message: '' })
    expect(e.subject).toMatch(/zorunlu/)
    expect(e.message).toMatch(/zorunlu/)
    expect(hasErrors(e)).toBe(true)
  })

  it('geçerli taslakta hata yok; sınırlar dahil kabul edilir', () => {
    expect(validateDraft({ subject: 'a'.repeat(SUBJECT_MAX), message: 'b'.repeat(MESSAGE_MAX) })).toEqual({})
  })

  it('sınırı aşan konu/mesaj reddedilir ve sınır metinde geçer', () => {
    const e = validateDraft({ subject: 'a'.repeat(SUBJECT_MAX + 1), message: 'b'.repeat(MESSAGE_MAX + 1) })
    expect(e.subject).toContain(String(SUBJECT_MAX))
    expect(e.message).toContain(String(MESSAGE_MAX))
  })

  it('backend gövdesi yalnız subject/type/priority/message anahtarlarını taşır ve kırpılır', () => {
    const body = buildOpenTicketPayload({ subject: '  Konu ', type: TicketTypeEnum.BILLING, priority: TicketPriorityEnum.URGENT, message: ' Mesaj \n' })
    expect(body).toEqual({ subject: 'Konu', type: 'BILLING', priority: 'URGENT', message: 'Mesaj' })
    expect(Object.keys(body).sort()).toEqual(['message', 'priority', 'subject', 'type'])
  })

  it('varsayılan taslak backend varsayılanlarıyla aynı (GENERAL / MEDIUM)', () => {
    expect(emptyDraft()).toEqual({ subject: '', type: 'GENERAL', priority: 'MEDIUM', message: '' })
  })

  it('kart üst verisi enum değerlerinin tamamını kapsar (uydurma seçenek yok)', () => {
    expect(Object.keys(TICKET_TYPE_META).sort()).toEqual(Object.values(TicketTypeEnum).sort())
    expect(Object.keys(TICKET_PRIORITY_META).sort()).toEqual(Object.values(TicketPriorityEnum).sort())
  })
})

describe('ticketRules — sayaç', () => {
  it('düzeyler: ok → warn (%90) → over', () => {
    expect(counterState('a'.repeat(10), 100).level).toBe('ok')
    expect(counterState('a'.repeat(90), 100).level).toBe('warn')
    expect(counterState('a'.repeat(100), 100).level).toBe('warn')
    expect(counterState('a'.repeat(101), 100).level).toBe('over')
    expect(counterState('abc', 100).label).toBe('3 / 100')
    expect(counterState('abc', 100).remaining).toBe(97)
  })

  it('duyuru gürültüsüz: normal yazımda boş, eşikte ve her 50 karakterde dolu', () => {
    expect(counterAnnouncement('a'.repeat(10), 1000)).toBe('')
    expect(counterAnnouncement('a'.repeat(900), 1000)).toBe('100 karakter kaldı.')
    expect(counterAnnouncement('a'.repeat(901), 1000)).toBe('')
    expect(counterAnnouncement('a'.repeat(950), 1000)).toBe('50 karakter kaldı.')
    expect(counterAnnouncement('a'.repeat(1000), 1000)).toBe('Karakter sınırına ulaşıldı.')
    expect(counterAnnouncement('a'.repeat(1012), 1000)).toMatch(/12 karakter aşıldı/)
  })
})

describe('ticketRules — gönderim durum makinesi', () => {
  const err = { title: 't', hint: 'h' }

  it('idle → submitting → success; sonuç saklanır', () => {
    let s = submitReducer(initialSubmitState<string>(), { type: 'submit' })
    expect(s.phase).toBe('submitting')
    s = submitReducer(s, { type: 'resolve', result: 'ok' })
    expect(s).toEqual({ phase: 'success', error: null, result: 'ok' })
  })

  it('gönderilirken ikinci submit yok sayılır (çift gönderim yok)', () => {
    const s = submitReducer(initialSubmitState(), { type: 'submit' })
    expect(submitReducer(s, { type: 'submit' })).toBe(s)
  })

  it('hata → tekrar deneme mümkün; hata metni temizlenir', () => {
    let s = submitReducer(initialSubmitState(), { type: 'submit' })
    s = submitReducer(s, { type: 'reject', error: err })
    expect(s.phase).toBe('error')
    expect(s.error).toEqual(err)
    s = submitReducer(s, { type: 'submit' })
    expect(s).toEqual({ phase: 'submitting', error: null, result: null })
  })

  it('başarıdan yalnız reset ile çıkılır; gönderim dışında resolve/reject etkisizdir', () => {
    const idle = initialSubmitState()
    expect(submitReducer(idle, { type: 'resolve', result: 1 })).toBe(idle)
    expect(submitReducer(idle, { type: 'reject', error: err })).toBe(idle)
    let s = submitReducer(submitReducer(idle, { type: 'submit' }), { type: 'resolve', result: 1 })
    expect(submitReducer(s, { type: 'submit' })).toBe(s)
    s = submitReducer(s, { type: 'reset' })
    expect(s.phase).toBe('idle')
  })
})

describe('ticketRules — hata metni', () => {
  it('ham hata/HTTP kodu sızmaz; içerik korunduğu söylenir', () => {
    const net = describeSubmitError('create', classifyFailure({ isAxiosError: true, code: 'ERR_NETWORK' }))
    const srv = describeSubmitError('reply', classifyFailure({ isAxiosError: true, response: { status: 503 } }))
    expect(net.title).toMatch(/bağlantı/)
    expect(net.hint).toMatch(/korundu/)
    expect(srv.title).toMatch(/Yanıtınız gönderilemedi/)
    expect(JSON.stringify([net, srv])).not.toMatch(/503|ERR_NETWORK|axios/i)
  })

  it('sınıflama', () => {
    expect(classifyFailure({ isAxiosError: true, response: { status: 401 } })).toBe('session')
    expect(classifyFailure({ isAxiosError: true, response: { status: 500 } })).toBe('server')
    expect(classifyFailure({ isAxiosError: true, response: { status: 400 } })).toBe('unknown')
    expect(classifyFailure({ isAxiosError: true })).toBe('network')
    expect(classifyFailure(undefined)).toBe('unknown')
    expect(classifyFailure({ _id: 'x' })).toBe('unknown')
  })
})

describe('ticketRules — klavye', () => {
  it('Ctrl/Cmd+Enter gönderir, Enter tek başına göndermez', () => {
    expect(isSubmitShortcut({ key: 'Enter', ctrlKey: true })).toBe(true)
    expect(isSubmitShortcut({ key: 'Enter', metaKey: true })).toBe(true)
    expect(isSubmitShortcut({ key: 'Enter' })).toBe(false)
    expect(isSubmitShortcut({ key: 'a', ctrlKey: true })).toBe(false)
  })

  it('radiogroup ok tuşları döngüseldir; Home/End uçlara gider', () => {
    expect(nextRadioIndex('ArrowRight', 5, 6)).toBe(0)
    expect(nextRadioIndex('ArrowDown', 1, 6)).toBe(2)
    expect(nextRadioIndex('ArrowLeft', 0, 6)).toBe(5)
    expect(nextRadioIndex('ArrowUp', 3, 6)).toBe(2)
    expect(nextRadioIndex('Home', 4, 6)).toBe(0)
    expect(nextRadioIndex('End', 1, 6)).toBe(5)
    expect(nextRadioIndex('Tab', 1, 6)).toBeNull()
    expect(nextRadioIndex('ArrowRight', 0, 0)).toBeNull()
  })
})

describe('ticketRules — zaman çizgisi', () => {
  const base = { ticketNumber: 'DSK-1', createdDate: '2026-09-28T10:00:00.000Z' }

  it('yalnız açılış + mesajlar (açık talep); destek olmayan gönderen "mine"', () => {
    const t = buildTimeline({ ...base, status: 'IN_PROGRESS', messages: [
      { senderType: 'CLIENT', senderName: 'Ayşe', content: 'a', date: '2026-09-28T10:05:00.000Z' },
      { senderType: 'SUPPORT', senderName: 'Destek', content: 'b', date: '2026-09-28T11:05:00.000Z' },
    ] })
    expect(t.map((i) => i.kind)).toEqual(['event', 'message', 'message'])
    expect(t[0]).toMatchObject({ key: 'opened', text: 'DSK-1 numaralı talep açıldı' })
    expect(t[1]).toMatchObject({ mine: true, sender: 'Ayşe' })
    expect(t[2]).toMatchObject({ mine: false })
  })

  it('kapalı talepte kapanış olayı updatedDate ile eklenir; ara durum geçişi TÜRETİLMEZ', () => {
    const t = buildTimeline({ ...base, status: 'CLOSED', updatedDate: '2026-09-30T08:00:00.000Z', messages: [] })
    expect(t.map((i) => i.key)).toEqual(['opened', 'closed'])
    expect(t[1]).toMatchObject({ date: '2026-09-30T08:00:00.000Z' })
    expect(buildTimeline({ ...base, status: 'WAITING_CLIENT', messages: [] }).map((i) => i.key)).toEqual(['opened'])
  })

  it('updatedDate yoksa kapanış zamansız gösterilir; ticket yoksa boş', () => {
    expect(buildTimeline({ ...base, status: 'CLOSED' }).at(-1)).toMatchObject({ key: 'closed', date: null })
    expect(buildTimeline(null)).toEqual([])
  })

  it('gönderen adı yoksa varsayılan etiket', () => {
    const t = buildTimeline({ ...base, messages: [{ senderType: 'SUPPORT', content: 'x' }] })
    expect(t[1]).toMatchObject({ sender: 'Destek Ekibi' })
  })

  it('gün ayracı gün değişince eklenir', () => {
    const items = buildTimeline({ ...base, messages: [
      { senderType: 'CLIENT', content: 'a', date: new Date(2026, 8, 28, 10, 5) },
      { senderType: 'CLIENT', content: 'b', date: new Date(2026, 8, 28, 12, 5) },
      { senderType: 'SUPPORT', content: 'c', date: new Date(2026, 8, 29, 9, 0) },
    ], createdDate: new Date(2026, 8, 28, 10, 0) })
    const out = withDaySeparators(items)
    expect(out.filter((e) => e.kind === 'day')).toHaveLength(2)
    expect(out[0].kind).toBe('day')
    expect(dayKey(new Date(2026, 8, 5))).toBe('2026-09-05')
    expect(dayKey('geçersiz')).toBeNull()
    expect(dayKey(null)).toBeNull()
  })
})

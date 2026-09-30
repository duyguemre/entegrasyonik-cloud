import { describe, expect, it, vi } from 'vitest'
import { useTicketCreateForm } from '../src/components/ticket/composables/useTicketCreateForm'
import { useTicketReply } from '../src/components/ticket/composables/useTicketReply'

describe('useTicketCreateForm', () => {
  it('geçersiz taslakta gönderim yapılmaz; alanlar dokunulmuş sayılır ve hata görünür', async () => {
    const send = vi.fn()
    const f = useTicketCreateForm(send)
    expect(f.shownErrors.value.subject).toBe('')
    const errors = f.validateAll()
    expect(errors.subject && errors.message).toBeTruthy()
    expect(f.shownErrors.value.subject).toMatch(/zorunlu/)
    await f.submitDraft()
    expect(send).not.toHaveBeenCalled()
    expect(f.phase.value).toBe('idle')
  })

  it('başarı: gövde beklenen şekilde, özet talep no/konu', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, ticket: { _id: '1', ticketNumber: 'TKT-1042', subject: 'S', type: 'BUG', priority: 'HIGH' } })
    const f = useTicketCreateForm(send)
    Object.assign(f.draft, { subject: ' S ', message: ' M ', type: 'BUG', priority: 'HIGH' })
    await f.submitDraft()
    expect(send).toHaveBeenCalledWith({ subject: 'S', type: 'BUG', priority: 'HIGH', message: 'M' })
    expect(f.phase.value).toBe('success')
    expect(f.createdNumber.value).toBe('TKT-1042')
    expect(f.createdSubject.value).toBe('S')
    f.resetAll()
    expect(f.phase.value).toBe('idle')
    expect(f.draft.subject).toBe('')
  })

  it('hata: içerik korunur, insan-okunur mesaj, tekrar denenebilir', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: false, failure: 'network' })
      .mockResolvedValueOnce({ ok: true, ticket: { _id: '1', ticketNumber: 'TKT-1' } })
    const f = useTicketCreateForm(send)
    Object.assign(f.draft, { subject: 'Konu', message: 'Mesaj' })
    await f.submitDraft()
    expect(f.phase.value).toBe('error')
    expect(f.state.value.error?.hint).toMatch(/korundu/)
    expect(f.draft).toMatchObject({ subject: 'Konu', message: 'Mesaj' })
    await f.submitDraft()
    expect(f.phase.value).toBe('success')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('gönderim özel durum fırlatırsa da hata durumuna düşer', async () => {
    const f = useTicketCreateForm(vi.fn().mockRejectedValue(new Error('x')))
    Object.assign(f.draft, { subject: 'Konu', message: 'Mesaj' })
    await f.submitDraft()
    expect(f.phase.value).toBe('error')
  })

  it('gönderilirken ikinci gönderim engellenir', async () => {
    let release: (v: any) => void = () => {}
    const send = vi.fn().mockReturnValue(new Promise((r) => { release = r }))
    const f = useTicketCreateForm(send)
    Object.assign(f.draft, { subject: 'Konu', message: 'Mesaj' })
    const first = f.submitDraft()
    await f.submitDraft()
    expect(send).toHaveBeenCalledTimes(1)
    expect(f.busy.value).toBe(true)
    release({ ok: true, ticket: { _id: '1' } })
    await first
    expect(f.busy.value).toBe(false)
  })
})

describe('useTicketReply', () => {
  it('boş/yalnız boşluk gönderilemez; sayaç güncellenir', () => {
    const r = useTicketReply(vi.fn())
    r.draft.value = '   '
    expect(r.canSend.value).toBe(false)
    r.draft.value = 'Merhaba'
    expect(r.canSend.value).toBe(true)
    expect(r.counter.value.label).toBe('7 / 4000')
  })

  it('başarıda taslak temizlenir, içerik olduğu gibi iletilir', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, ticket: { _id: 't' } })
    const r = useTicketReply(send)
    r.draft.value = 'Yanıt\nİkinci satır'
    expect(await r.submit()).toBe(true)
    expect(send).toHaveBeenCalledWith('Yanıt\nİkinci satır')
    expect(r.draft.value).toBe('')
    expect(r.state.value.phase).toBe('idle')
  })

  it('hatada taslak korunur ve hata gösterilir; yeniden gönderilebilir', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, failure: 'server' })
    const r = useTicketReply(send)
    r.draft.value = 'Yanıt'
    expect(await r.submit()).toBe(false)
    expect(r.draft.value).toBe('Yanıt')
    expect(r.state.value.error?.title).toMatch(/Yanıtınız gönderilemedi/)
    expect(r.canSend.value).toBe(true)
  })

  it('sınırı aşan yanıt gönderilemez', () => {
    const r = useTicketReply(vi.fn())
    r.draft.value = 'a'.repeat(4001)
    expect(r.canSend.value).toBe(false)
    expect(r.counter.value.level).toBe('over')
  })
})

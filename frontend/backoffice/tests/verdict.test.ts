import { describe, expect, it, vi } from 'vitest'
import { buildVerdict, rankAttention, toneOf, unreadable, type AttentionItem } from '@bo/utils/verdict'
import { dominantErrorCode, engineVerdict } from '@bo/views/engine/engineVerdict'
import type { GetQueuesResponse, GetStateMachineJobsResponse, JobState } from '@bo/api/contract'

const item = (id: string, tone: AttentionItem['tone']): AttentionItem => ({ id, tone, title: id })

describe('verdict modeli (K51)', () => {
  it('kırmızı → sarı → bilgi; aynı tonda sıra korunur', () => {
    const out = rankAttention([item('w1', 'warning'), item('i1', 'info'), item('e1', 'error'), item('w2', 'warning')])
    expect(out.map((x) => x.id)).toEqual(['e1', 'w1', 'w2', 'i1'])
  })

  it('ton: bilgi öğesi sakin sayfayı bozmaz', () => {
    expect(toneOf([item('i', 'info')])).toBe('success')
    expect(toneOf([item('w', 'warning'), item('i', 'info')])).toBe('warning')
    expect(toneOf([item('w', 'warning'), item('e', 'error')])).toBe('error')
  })

  it('sakin: özet ve "Sağlıklı" rozeti; boş öğeler atılır', () => {
    const v = buildVerdict({ attention: [null, false, undefined], calm: { summary: 'Her şey yolunda.' } })
    expect(v).toMatchObject({ tone: 'success', badge: 'Sağlıklı', summary: 'Her şey yolunda.', attention: [] })
  })

  it('dikkat varken varsayılan özet en acil maddeyi söyler', () => {
    const v = buildVerdict({ attention: [item('Az önemli', 'warning'), item('Çok önemli', 'error')], calm: { summary: '-' } })
    expect(v.tone).toBe('error')
    expect(v.badge).toBe('Müdahale gerekli')
    expect(v.summary).toBe('1 konu şimdi müdahale istiyor')
    expect(v.note).toBe('En önemlisi: Çok önemli.')
  })

  it('okunamayan kaynak sarı ve tekrar dene eylemi taşır; "sağlıklı" denmez', () => {
    const retry = vi.fn()
    const v = buildVerdict({ attention: [unreadable('x', 'Kuyruk durumu', retry)], calm: { summary: 'Sağlıklı' } })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].title).toBe('Kuyruk durumu okunamadı')
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
  })
})

describe('motor hükmü', () => {
  const queues = (over: Partial<GetQueuesResponse['queues'][0]> = {}): GetQueuesResponse => ({
    generatedAt: '',
    queues: [{ name: 'q', available: true, counts: { wait: 3, active: 1, delayed: 0, failed: 0, completed: 9, paused: 0 }, dlq: { pendingReview: 0 }, metrics: { resolution: '1h', from: '', to: '', series: [] }, ...over }],
  })
  const sm = (stuck = 0) => ({ stuckLeaseCount: stuck, leaseTimeoutMs: { export: 1_800_000, import: 1_800_000 } }) as GetStateMachineJobsResponse
  const base = { failed: { queues: false, sm: false, jobs: false }, retry: () => undefined }

  it('sakin', () => {
    const v = engineVerdict({ ...base, queues: queues(), sm: sm(), jobs: [] })
    expect(v.tone).toBe('success')
    expect(v.actions).toEqual([])
    expect(v.checks?.length).toBeGreaterThan(0)
  })

  it('Redis düşük → kırmızı ve altyapıya bağlı', () => {
    const v = engineVerdict({ ...base, queues: queues({ available: false, counts: null }), sm: sm(), jobs: [] })
    expect(v.tone).toBe('error')
    expect(v.attention[0]).toMatchObject({ id: 'redis-down', to: { path: '/altyapi' } })
  })

  it('DLQ ölü mektup sekmesine götürür; yeniden deneme güvenli eylemdir', () => {
    const v = engineVerdict({ ...base, queues: queues({ dlq: { pendingReview: 4 }, counts: { wait: 0, active: 0, delayed: 0, failed: 2, completed: 0, paused: 0 } }), sm: sm(1), jobs: [] })
    expect(v.tone).toBe('warning')
    expect(v.attention.find((a) => a.id === 'dlq')!.to).toEqual({ query: { sekme: 'basarisiz', kaynak: 'dlq' } })
    // Her madde bağlantılı (okunamayan kaynak dışında) ve etki + öneri taşır (§11.2).
    for (const a of v.attention) expect(a.to && a.impact && a.advice).toBeTruthy()
    expect(v.actions.find((a) => a.id === 'retry')?.guarded).toBe(true)
    expect(v.actions.find((a) => a.id === 'release')?.guarded).toBe(true)
  })

  it('art arda başarısız görev kırmızı; tümü okunamazsa hüküm verilmez', () => {
    const job = { job: 'stock-sync', consecutiveFailures: 4, overdue: false } as JobState
    expect(engineVerdict({ ...base, queues: queues(), sm: sm(), jobs: [job] }).tone).toBe('error')
    const v = engineVerdict({ ...base, queues: null, sm: null, jobs: null, failed: { queues: true, sm: true, jobs: true } })
    expect(v.summary).toContain('okunamadı')
  })

  it('baskın hata koduna göre süzgeçli bağlantı ve toplu yeniden deneme önerisi (BE-03)', () => {
    const counts = { wait: 0, active: 0, delayed: 0, failed: 5, completed: 0, paused: 0 }
    const sample = ['UNAVAILABLE', 'UNAVAILABLE', 'AUTH', 'UNAVAILABLE', 'RATE_LIMITED'].map((errorCode) => ({ errorCode })) as never
    expect(dominantErrorCode(sample)).toBe('UNAVAILABLE')
    expect(dominantErrorCode([])).toBeNull()
    const v = engineVerdict({ ...base, queues: queues({ counts }), sm: sm(), jobs: [], failedSample: sample })
    const item = v.attention.find((a) => a.id === 'failed')!
    expect(item.to).toEqual({ query: { sekme: 'basarisiz', kod: 'UNAVAILABLE' } })
    expect(item.advice).toContain('toplu yeniden deneyin')
    const act = v.actions.find((a) => a.id === 'retry')!
    expect(act.to).toEqual({ query: { sekme: 'basarisiz', kod: 'UNAVAILABLE' } })
    expect(act.guarded).toBe(true)
    // Kalıcı kod: yeniden deneme önerilmez, süzgeçli bağlantı yine var.
    const auth = engineVerdict({ ...base, queues: queues({ counts }), sm: sm(), jobs: [], failedSample: [{ errorCode: 'AUTH' }] as never })
    expect(auth.attention.find((a) => a.id === 'failed')!.to).toEqual({ query: { sekme: 'basarisiz', kod: 'AUTH' } })
    expect(auth.attention.find((a) => a.id === 'failed')!.advice).not.toContain('toplu')
    expect(auth.actions.find((a) => a.id === 'retry')!.to).toEqual({ query: { sekme: 'basarisiz' } })
  })
})

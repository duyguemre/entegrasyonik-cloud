// BO2-P6: başarısız iş yardımcıları — iş türü türetme, durum rozeti, hata koduna göre özet (backend `groups` yoksa örneklemden).
import { describe, expect, it } from 'vitest'
import { bullState, jobTypeCode, jobTypeLabel, summarize } from '../src/views/engine/failedJobs'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'

const job = (o: Record<string, unknown>) => ({ id: 'fetch-orders-1200', operation: 'fetch-orders-trendyol', integrationCode: 'trendyol', errorCode: 'AUTH', failedAt: '2026-10-01T10:00:00.000Z', ...o }) as never

describe('iş türü ve durum', () => {
  it('jobType yoksa operation/iş kimliğinden türetilir; insan okur ad', () => {
    expect(jobTypeCode(job({}))).toBe('fetch-orders')
    expect(jobTypeCode(job({ jobType: 'push-cargo' }))).toBe('push-cargo')
    expect(jobTypeCode(job({ operation: undefined, integrationCode: null, id: 'push-status-12' }))).toBe('push-status')
    expect(jobTypeLabel('fetch-orders')).toBe('Sipariş çekme')
    expect(jobTypeLabel('bilinmeyen-is')).toBe('bilinmeyen-is')
    expect(jobTypeLabel(null)).toBe('İş türü bildirilmedi')
  })
  it('durum: state yoksa başarısız', () => {
    expect(bullState({})).toEqual({ label: 'Başarısız', tone: 'danger' })
    expect(bullState({ state: 'retrying' }).label).toBe('Yeniden deneniyor')
  })
})

describe('özet', () => {
  it('örneklemden hata koduna göre gruplar, iş türü dağılımı ve en eski hata; sonraki sayfa varsa kesin değil', () => {
    const items = [job({}), job({ id: 'push-cargo-1', operation: 'push-cargo-trendyol', failedAt: '2026-10-01T08:00:00.000Z' }), job({ errorCode: 'UNAVAILABLE' })]
    const s = summarize({ items, nextCursor: 'x' })
    expect(s.exact).toBe(false)
    expect(s.rows.map((r) => [r.errorCode, r.count])).toEqual([['AUTH', 2], ['UNAVAILABLE', 1]])
    expect(s.rows[0].jobTypes.map((j) => j.code).sort()).toEqual(['fetch-orders', 'push-cargo'])
    expect(s.rows[0].oldestFailedAt).toBe('2026-10-01T08:00:00.000Z')
    expect(summarize({ items, nextCursor: null }).exact).toBe(true)
  })
  it('backend groups verilirse onlar kullanılır (kesin)', () => {
    const s = summarize({ items: [], nextCursor: 'x', groups: [{ errorCode: 'AUTH', jobType: 'fetch-orders', count: 30, oldestFailedAt: 'a' }, { errorCode: 'AUTH', jobType: null, count: 2, oldestFailedAt: 'b' }] })
    expect(s.exact).toBe(true)
    expect(s.count).toBe(32)
    expect(s.rows[0].jobTypes).toHaveLength(2)
  })
  it('sahte API groups döner ve toplamı süzgeçli listeyle tutar', async () => {
    const server = new MockAdminServer()
    const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
    const res = await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', limit: 5 })
    expect(res.groups!.reduce((n, g) => n + g.count, 0)).toBe(37)
    expect(summarize(res).count).toBe(37)
  })
})

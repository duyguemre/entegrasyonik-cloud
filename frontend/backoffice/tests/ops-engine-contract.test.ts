// BE-03/BE-04 sahte API sözleşmesi: listFailedJobs süzgeçleri + total + reqId; retryJobs toplu yeniden deneme.
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { RETRY_JOBS_MAX, type FailedBullJob } from '../src/api/contract'

const Q = 'order-sync-queue'
const REASON = 'Destek kaydı #örnek: test gerekçesi'

async function signedIn() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return { api, server }
}
const list = async (api: Awaited<ReturnType<typeof signedIn>>['api'], extra: Record<string, unknown> = {}) =>
  api.call('BackofficeEngineService/listFailedJobs', { queue: Q, limit: 50, ...extra } as never)

describe('listFailedJobs süzgeçleri (BE-03)', () => {
  it('süzgeçsiz: filter ve total yok (geriye uyumlu)', async () => {
    const { api } = await signedIn()
    const res = await list(api)
    expect(res.total).toBeUndefined()
    expect(res.filter).toBeUndefined()
  })

  it('tid/integrationCode/errorCode strict süzer; total yalnız bullmq + süzgeç', async () => {
    const { api } = await signedIn()
    const res = await list(api, { errorCode: 'UNAVAILABLE', integrationCode: 'trendyol' })
    const items = res.items as FailedBullJob[]
    expect(items.length).toBeGreaterThan(0)
    expect(res.total).toBe(items.length)
    expect(items.every((j) => j.errorCode === 'UNAVAILABLE' && j.integrationCode === 'trendyol')).toBe(true)
    expect(res.filter).toEqual({ tid: null, integrationCode: 'trendyol', errorCode: 'UNAVAILABLE' })
    const tid = items[0].tenantId!
    const byTid = await list(api, { tid })
    expect((byTid.items as FailedBullJob[]).every((j) => j.tenantId === tid)).toBe(true)
    expect(byTid.total).toBe(byTid.items.length)
    const dlq = await list(api, { source: 'dlq', errorCode: 'AUTH' })
    expect(dlq.total).toBeUndefined()
  })

  it('geçersiz süzgeç 400; bilinmeyen alan 400', async () => {
    const { api } = await signedIn()
    await expect(list(api, { errorCode: 'unavailable' })).rejects.toMatchObject({ status: 400 })
    await expect(list(api, { tid: 0 })).rejects.toMatchObject({ status: 400 })
    await expect(list(api, { foo: 1 })).rejects.toMatchObject({ status: 400 })
  })

  it('öğelerde reqId (çoğunda dolu, bazısında null) ve traceId null (BE-04)', async () => {
    const { api } = await signedIn()
    const items = (await list(api)).items as FailedBullJob[]
    expect(items.some((j) => j.reqId)).toBe(true)
    expect(items.some((j) => j.reqId === null)).toBe(true)
    for (const j of items) {
      expect(j.traceId).toBeNull()
      if (j.reqId) expect(j.reqId).toMatch(/^[A-Za-z0-9._:-]{1,64}$/)
    }
  })
})

describe('retryJobs (BE-03)', () => {
  it('iş başına sonuç: başarı + JOB_NOT_FOUND + JOB_NOT_FAILED; çağrı 200; tekilleştirir', async () => {
    const { api } = await signedIn()
    const items = (await list(api, { errorCode: 'UNAVAILABLE', integrationCode: 'trendyol' })).items as FailedBullJob[]
    const ids = items.map((j) => j.id)
    const res = await api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: [...ids, ids[0], 'yok-1', 'push-status-active'], reason: REASON })
    expect(res.requested).toBe(ids.length + 2)
    expect(res.succeeded + res.failed).toBe(res.requested)
    expect(res.results.find((r) => r.jobId === 'yok-1')).toEqual({ jobId: 'yok-1', ok: false, error: 'JOB_NOT_FOUND' })
    expect(res.results.find((r) => r.jobId === 'push-status-active')?.error).toBe('JOB_NOT_FAILED')
    expect(res.results.some((r) => r.error === 'JOB_NOT_FAILED' && ids.includes(r.jobId))).toBe(true)
    // Başarılılar listeden düştü; idempotent tekrar: artık hepsi ok:false.
    const again = await api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: ids, reason: REASON })
    expect(again.succeeded).toBe(0)
  })

  it('1..50 sınırı, gerekçe, step-up, LIVE_READONLY 423, Redis düşük 503', async () => {
    const { api, server } = await signedIn()
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: [], reason: REASON })).rejects.toMatchObject({ status: 400 })
    const many = Array.from({ length: RETRY_JOBS_MAX + 1 }, (_, i) => `j-${i}`)
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: many, reason: REASON })).rejects.toMatchObject({ status: 400 })
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: ['a'], reason: 'kısa' })).rejects.toMatchObject({ status: 400 })
    server.setLiveReadonly(true)
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: ['a'], reason: REASON })).rejects.toMatchObject({ status: 423, code: 'LIVE_READONLY' })
    server.setLiveReadonly(false)
    server.setDegraded(true)
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: ['a'], reason: REASON })).rejects.toMatchObject({ status: 503, code: 'QUEUE_UNAVAILABLE' })
    server.setDegraded(false)
    server.expireReauth()
    await expect(api.call('BackofficeEngineService/retryJobs', { queue: Q, jobIds: ['a'], reason: REASON })).rejects.toMatchObject({ status: 401, code: 'REAUTH_REQUIRED' })
  })
})

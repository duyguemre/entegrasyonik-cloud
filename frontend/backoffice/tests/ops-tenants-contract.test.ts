// BE-01 / BE-02 sahte uçları sözleşme şekline birebir (API_BACKOFFICE_ATTENTION.md).
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'

const ISO = /^\d{4}-\d{2}-\d{2}T/
const keys = (o: object) => Object.keys(o).sort()

async function signedIn() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return { api, server }
}

describe('BE-01 listTenants (sahte)', () => {
  it('yanıt şekli birebir; ops alanları', async () => {
    const { api } = await signedIn()
    const res = await api.call('BackofficeTenantService/listTenants', {})
    expect(keys(res)).toEqual(['items', 'nextCursor', 'opsDegraded', 'scanTruncated', 'scanned'])
    expect(res.scanned).toBe(12)
    expect(res.opsDegraded).toEqual([])
    for (const r of res.items) {
      expect(keys(r)).toEqual(['name', 'ops', 'status', 'tid'])
      expect(keys(r.ops)).toEqual(['failedJobs24h', 'lastErrorAt', 'openIssues', 'openIssuesApprox', 'planCode', 'subscriptionStatus'])
      expect(r.ops.openIssuesApprox).toBe(true)
      if (r.ops.lastErrorAt) expect(r.ops.lastErrorAt).toMatch(ISO)
    }
    expect(res.items.map((r) => r.tid)).toEqual([...res.items.map((r) => r.tid)].sort((a, b) => a - b))
  })

  it('hasIssues + sortBy: #102 sakin, #107 ve #104 önde', async () => {
    const { api } = await signedIn()
    const res = await api.call('BackofficeTenantService/listTenants', { hasIssues: true, sortBy: 'openIssues' })
    const ids = res.items.map((r) => r.tid)
    expect(ids).not.toContain(102)
    expect(ids.slice(0, 2)).toEqual([107, 104])
    const failed = await api.call('BackofficeTenantService/listTenants', { sortBy: 'failedJobs24h', sortDir: 'asc', limit: 3 })
    expect(failed.items[0].ops.failedJobs24h).toBe(0)
    expect(failed.nextCursor).toBeTruthy()
  })

  it('süzgeçler: abonelik, durum, q; imleç sayfalar', async () => {
    const { api } = await signedIn()
    const sus = await api.call('BackofficeTenantService/listTenants', { subscriptionStatus: ['suspended', 'past_due'] })
    expect(sus.items.every((r) => ['suspended', 'past_due'].includes(r.ops.subscriptionStatus!))).toBe(true)
    expect(sus.items.length).toBeGreaterThan(0)
    const pas = await api.call('BackofficeTenantService/listTenants', { status: ['PASSIVE'] })
    expect(pas.items.every((r) => r.status === 'PASSIVE')).toBe(true)
    const q = await api.call('BackofficeTenantService/listTenants', { q: 'ÖRNEK' })
    expect(q.items.length).toBe(12)
    const p1 = await api.call('BackofficeTenantService/listTenants', { limit: 5 })
    const p2 = await api.call('BackofficeTenantService/listTenants', { limit: 5, cursor: p1.nextCursor! })
    expect(p2.items[0].tid).toBe(p1.items[4].tid + 1)
  })

  it('strict girdi: bilinmeyen alan ve geçersiz değerler 400 VALIDATION', async () => {
    const { api } = await signedIn()
    for (const bad of [{ foo: 1 }, { sortBy: 'plan' }, { sortDir: 'up' }, { subscriptionStatus: ['x'] }, { q: 'a'.repeat(61) }, { hasIssues: 'yes' }, { cursor: 'zz' }, { limit: 0 }]) {
      await expect(api.call('BackofficeTenantService/listTenants', bad as never), JSON.stringify(bad)).rejects.toMatchObject({ status: 400 })
    }
  })

  it('Redis yokken: failedJobs yalnız DLQ, opsDegraded dolu', async () => {
    const { api, server } = await signedIn()
    const ok = await api.call('BackofficeTenantService/listTenants', {})
    server.setDegraded(true)
    const res = await api.call('BackofficeTenantService/listTenants', {})
    expect(res.opsDegraded).toEqual(['failedJobs'])
    const at = (r: typeof res, tid: number) => r.items.find((x) => x.tid === tid)!.ops.failedJobs24h
    expect(at(ok, 107)).toBe(14)
    expect(at(res, 107)).toBe(2)
  })
})

describe('BE-02 getHealthSummary (sahte)', () => {
  it('yanıt şekli birebir', async () => {
    const { api } = await signedIn()
    const h = await api.call('BackofficeTenantService/getHealthSummary', { tid: 107 })
    expect(keys(h)).toEqual(['alerts', 'degradedSections', 'failedJobs', 'generatedAt', 'lastOrderSyncAt', 'lastSyncAt', 'openIssues', 'tid'])
    expect(h.openIssues.approx).toBe(true)
    expect(h.openIssues.items.length).toBe(4)
    for (const i of h.openIssues.items) expect(keys(i)).toEqual(['code', 'count', 'fp', 'integrationCode', 'lastSeen', 'module', 'status'])
    const seen = h.openIssues.items.map((i) => Date.parse(i.lastSeen))
    expect(seen).toEqual([...seen].sort((a, b) => b - a))
    expect(h.failedJobs).toEqual({ bullmq: 12, dlq: 2, bullmqAvailable: true })
    expect(h.alerts[0]).toMatchObject({ ruleId: 'R1', status: 'firing', level: 'critical', mutedUntil: null })
    expect(keys(h.alerts[0])).toEqual(['firstFiredAt', 'lastSeenAt', 'level', 'mutedUntil', 'ruleId', 'scopeKey', 'status'])
    expect(h.lastSyncAt.trendyol).toBeNull()
    expect(h.generatedAt).toMatch(ISO)
  })

  it('#102 sakin', async () => {
    const { api } = await signedIn()
    const h = await api.call('BackofficeTenantService/getHealthSummary', { tid: 102 })
    expect(h.openIssues.items).toEqual([])
    expect(h.failedJobs).toEqual({ bullmq: 0, dlq: 0, bullmqAvailable: true })
    expect(h.alerts).toEqual([])
  })

  it('Redis yokken: bullmq null + bullmqAvailable false + degradedSections', async () => {
    const { api, server } = await signedIn()
    server.setDegraded(true)
    const h = await api.call('BackofficeTenantService/getHealthSummary', { tid: 107 })
    expect(h.failedJobs.bullmq).toBeNull()
    expect(h.failedJobs.bullmqAvailable).toBe(false)
    expect(h.degradedSections).toEqual([{ section: 'failedJobs', error: 'error' }])
  })

  it('bilinmeyen tid 404; geçersiz/ fazla alan 400', async () => {
    const { api } = await signedIn()
    await expect(api.call('BackofficeTenantService/getHealthSummary', { tid: 9999 })).rejects.toMatchObject({ status: 404 })
    await expect(api.call('BackofficeTenantService/getHealthSummary', { tid: 'x' } as never)).rejects.toMatchObject({ status: 400 })
    await expect(api.call('BackofficeTenantService/getHealthSummary', { tid: 107, foo: 1 } as never)).rejects.toMatchObject({ status: 400 })
  })
})

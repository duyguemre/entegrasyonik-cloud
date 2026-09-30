// Sahte API'nin yanıtları contract.ts şekline birebir uyar (alan adları + tipler; fazla alan YOK).
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'

type Shape = Record<string, string>
/** Alan → tip ('?' = isteğe bağlı). Yanıtta tanımsız alan varsa test düşer. */
function conforms(obj: Record<string, unknown>, shape: Shape, where: string) {
  for (const key of Object.keys(obj)) expect(Object.keys(shape).map((k) => k.replace('?', '')), `${where}: fazla alan ${key}`).toContain(key)
  for (const [k, type] of Object.entries(shape)) {
    const opt = k.endsWith('?')
    const key = k.replace('?', '')
    const v = obj[key]
    if (v === undefined) {
      expect(opt, `${where}: eksik ${key}`).toBe(true)
      continue
    }
    const actual = Array.isArray(v) ? 'array' : typeof v
    expect(actual, `${where}.${key}`).toBe(type)
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}T/

async function signedIn() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return api
}

describe('sahte API ↔ sözleşme', () => {
  it('kimlik: login / enroll / confirm / me / reauth', async () => {
    const server = new MockAdminServer()
    const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    conforms(await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.firstLogin.email, password: MOCK_ACCOUNTS.password }), { mfaRequired: 'boolean', enrollRequired: 'boolean' }, 'login')
    const enroll = await api.call('BackofficeAuthService/enrollTotp')
    conforms(enroll, { otpauthUri: 'string' }, 'enrollTotp')
    expect(enroll.otpauthUri).toMatch(/^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/)
    const confirm = await api.call('BackofficeAuthService/confirmTotp', { code: '123456' })
    expect(confirm.recoveryCodes).toHaveLength(10)
    const me = await api.call('BackofficeAuthService/me')
    conforms(me as unknown as Record<string, unknown>, { sub: 'string', email: 'string', name: 'string', mfa: 'boolean', authTime: 'string', 'reauthAt?': 'string' }, 'me')
    expect(me.authTime).toMatch(ISO)
    conforms(await api.call('BackofficeAuthService/reauth', { password: MOCK_ACCOUNTS.password, code: '222222' }), { reauthAt: 'string' }, 'reauth')
  })

  it('getClients: clientDto beyaz listesi dışında alan yok (dbConfig asla)', async () => {
    const api = await signedIn()
    const res = await api.call('AdminService/getClients', { limit: 200 })
    conforms(res as unknown as Record<string, unknown>, { success: 'boolean', clients: 'array', total: 'number', page: 'number', limit: 'number' }, 'getClients')
    for (const c of res.clients) {
      conforms(c as unknown as Record<string, unknown>, {
        _id: 'string', 'name?': 'string', title: 'string', order: 'number', clientId: 'number', status: 'string',
        'lastSuccessfulOrderSync?': 'string', 'integrations?': 'array', createdAt: 'string', updatedAt: 'string',
      }, `client ${c.clientId}`)
      expect(c.title.startsWith('Örnek · '), 'örnek veri açıkça işaretli').toBe(true)
    }
  })

  it('getLifecycle / getSystemHealth', async () => {
    const api = await signedIn()
    conforms(await api.call('BackofficeTenantService/getLifecycle', { tid: 103 }) as unknown as Record<string, unknown>, {
      tid: 'number', status: 'string', name: 'string', lastSuccessfulOrderSync: 'string', trial: 'object', deletion: 'object', provisioning: 'object', recentEvents: 'array',
    }, 'getLifecycle (B2)')
    const h = await api.call('AdminService/getSystemHealth', { timeFrame: 'DAY' })
    expect(Object.keys(h.infrastructure.queues).sort()).toEqual(['export', 'import', 'orderSync'])
    conforms(h.infrastructure.redis, { usedMemory: 'string', connectedClients: 'string', uptime: 'string', version: 'string' }, 'redis')
  })

  it('log merkezi: listLogs / getIssueGroups / getIssueTrend / getVolumeByCategory / getTrace', async () => {
    const api = await signedIn()
    const logs = await api.call('LogCenterService/listLogs', { range: '24h', limit: 200 })
    expect(logs.items.length).toBeLessThanOrEqual(200)
    for (const e of logs.items.slice(0, 50)) {
      conforms(e as unknown as Record<string, unknown>, {
        id: 'string', t: 'string', level: 'string', src: 'string', category: 'string', msg: 'string',
        'fp?': 'string', 'reqId?': 'string', 'tid?': 'number', 'integ?': 'string', 'op?': 'string', 'errClass?': 'string', pod: 'string',
      }, `log ${e.id}`)
    }
    const level = Object.values(logs.facets.level).reduce((a, b) => a + (b ?? 0), 0)
    expect(level, 'seviye yüzü toplamı = kayıt sayısı (filtresiz)').toBeGreaterThanOrEqual(logs.items.length)

    const groups = await api.call('LogCenterService/getIssueGroups', { range: '7d', sort: 'count' })
    expect(groups.items.length).toBeGreaterThan(5)
    const counts = groups.items.map((g) => g.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    for (const g of groups.items) {
      conforms(g as unknown as Record<string, unknown>, {
        fp: 'string', title: 'string', level: 'string', src: 'string', category: 'string', 'errClass?': 'string', 'integ?': 'string', 'op?': 'string',
        status: 'string', count: 'number', tenantCount: 'number', firstSeen: 'string', lastSeen: 'string', isNew: 'boolean', daily: 'object', 'sampleReqId?': 'string',
      }, `issue ${g.fp}`)
      expect(Object.keys(g.daily)).toHaveLength(14)
    }

    const trend = await api.call('LogCenterService/getIssueTrend', { fp: groups.items[0].fp, range: '24h' })
    expect(trend.points).toHaveLength(24)
    expect(trend.bucket).toBe('hour')

    const vol = await api.call('LogCenterService/getVolumeByCategory', { range: '7d' })
    expect(vol.categories.map((c) => c.category).sort()).toEqual(['auth', 'billing', 'catalog', 'integration', 'order', 'platform'])
    for (const c of vol.categories) expect(c.series).toHaveLength(7)

    const reqId = groups.items[0].sampleReqId!
    const trace = await api.call('LogCenterService/getTrace', { reqId })
    conforms(trace as unknown as Record<string, unknown>, { reqId: 'string', 'tid?': 'number', startedAt: 'string', durationMs: 'number', events: 'array' }, 'getTrace')
    expect(trace.events.length).toBeGreaterThan(1)
    await expect(api.call('LogCenterService/getTrace', { reqId: 'req_yok' })).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('denetim: kayıtlar sözleşme alanları; önce/sonra meta a_/b_; PII yok (IP belge aralığı)', async () => {
    const api = await signedIn()
    const res = await api.call('BackofficeAuditService/search', { range: '7d', limit: 200 })
    for (const a of res.items) {
      conforms(a as unknown as Record<string, unknown>, {
        id: 'string', at: 'string', event: 'string', 'sub?': 'string', 'tid?': 'number', 'ip?': 'string', result: 'string',
        'surface?': 'string', 'actorType?': 'string', 'onBehalfOf?': 'number', 'imp?': 'boolean', 'reqId?': 'string', 'meta?': 'object',
      }, `audit ${a.id}`)
      if (a.ip) expect(a.ip).toMatch(/^203\.0\.113\./)
      for (const v of Object.values(a.meta ?? {})) expect(['string', 'number', 'boolean']).toContain(typeof v)
    }
    expect(res.items.some((a) => Object.keys(a.meta ?? {}).some((k) => k.startsWith('b_')))).toBe(true)
    const bo = await api.call('BackofficeAuditService/search', { range: '7d', surface: 'backoffice' })
    expect(bo.items.every((a) => a.surface === 'backoffice')).toBe(true)
  })
})

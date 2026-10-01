// BE-05 kayıtlı görünümler + BE-06 sorun grubu müşteri süzgeci: sahte API sözleşmeye birebir (API_BACKOFFICE_ATTENTION.md).
import { describe, expect, it } from 'vitest'
import { createAdminApi, AdminApiError } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { createPrefsMock } from '../src/api/mock/ops/prefs'
import { SAVED_VIEW_LIMIT } from '../src/api/contracts/ops'

async function signedIn(email: string = MOCK_ACCOUNTS.enrolled.email) {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return { api, server }
}
const fails = async (p: Promise<unknown>) => p.then(() => null, (e) => e as AdminApiError)

describe('BE-05 kayıtlı görünümler', () => {
  it('kaydet → listele (ekrana süz) → aynı ad güncellenir → sil; başkasının/olmayan id deleted:false', async () => {
    const { api } = await signedIn()
    expect((await api.call('BackofficePrefsService/listViews', {})).items).toEqual([])
    const a = await api.call('BackofficePrefsService/saveView', { screen: 'tenants', name: '  Askıdakiler ', query: { durum: 'suspended' } })
    expect(a).toMatchObject({ created: true, count: 1 })
    expect(a.id).toMatch(/^[0-9a-f]{24}$/)
    await api.call('BackofficePrefsService/saveView', { screen: 'engine', name: 'DLQ', query: { sekme: ['a', 'b'] } })
    const b = await api.call('BackofficePrefsService/saveView', { screen: 'tenants', name: 'Askıdakiler', query: { durum: 'canceled' } })
    expect(b).toEqual({ id: a.id, created: false, count: 2 })
    const list = await api.call('BackofficePrefsService/listViews', { screen: 'tenants' })
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({ id: a.id, screen: 'tenants', name: 'Askıdakiler', query: { durum: 'canceled' } })
    expect(Object.keys(list.items[0]).sort()).toEqual(['createdAt', 'id', 'name', 'query', 'screen', 'updatedAt'])
    expect(await api.call('BackofficePrefsService/deleteView', { id: a.id })).toEqual({ id: a.id, deleted: true })
    expect(await api.call('BackofficePrefsService/deleteView', { id: a.id })).toEqual({ id: a.id, deleted: false })
    expect(await api.call('BackofficePrefsService/deleteView', { id: 'f'.repeat(24) })).toMatchObject({ deleted: false })
  })

  it('yalnız oturumdaki yöneticinin kayıtları görünür (başkasının kaydı listelenmez, silinemez)', () => {
    const d = createPrefsMock(Date.now())
    const ctx = (actorEmail: string) => ({ now: Date.now(), t0: Date.now(), degraded: false, liveReadonly: false, clients: [], actorEmail })
    const { id } = d.handle('BackofficePrefsService/saveView', { screen: 'alerts', name: 'Benim', query: {} }, ctx('a@ornek.test')) as { id: string }
    expect(d.handle('BackofficePrefsService/listViews', {}, ctx('b@ornek.test'))).toEqual({ items: [] })
    expect(d.handle('BackofficePrefsService/deleteView', { id }, ctx('b@ornek.test'))).toEqual({ id, deleted: false })
    expect((d.handle('BackofficePrefsService/listViews', {}, ctx('a@ornek.test')) as { items: unknown[] }).items).toHaveLength(1)
  })

  it('21. yeni kayıt 409 VIEW_LIMIT; var olan ad güncellenir', async () => {
    const { api } = await signedIn()
    for (let i = 0; i < SAVED_VIEW_LIMIT; i++) await api.call('BackofficePrefsService/saveView', { screen: 'tenants', name: `G${i}`, query: { q: String(i) } })
    const err = await fails(api.call('BackofficePrefsService/saveView', { screen: 'tenants', name: 'Fazla', query: {} }))
    expect(err?.status).toBe(409)
    expect(err?.code).toBe('VIEW_LIMIT')
    expect(await api.call('BackofficePrefsService/saveView', { screen: 'tenants', name: 'G3', query: { q: 'x' } })).toMatchObject({ created: false, count: SAVED_VIEW_LIMIT })
  })

  it('şema: strict gövde + screen/name/query kuralları 400 VALIDATION', async () => {
    const { api } = await signedIn()
    const bad = async (body: Record<string, unknown>) => (await fails(api.call('BackofficePrefsService/saveView', body as never)))?.code
    expect(await bad({ screen: 'tenants', name: 'a', query: {}, extra: 1 })).toBe('VALIDATION')
    expect(await bad({ screen: 'Tenants', name: 'a', query: {} })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: '   ', query: {} })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'x'.repeat(61), query: {} })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'a', query: { '$ne': 'x' } })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'a', query: { 'a.b': 'x' } })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'a', query: { q: 'x'.repeat(201) } })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'a', query: { q: 5 } })).toBe('VALIDATION')
    expect(await bad({ screen: 'tenants', name: 'a', query: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v'])) })).toBe('VALIDATION')
    expect((await fails(api.call('BackofficePrefsService/listViews', { screen: 'X!' })))?.code).toBe('VALIDATION')
    expect((await fails(api.call('BackofficePrefsService/deleteView', { id: 'abc' })))?.code).toBe('VALIDATION')
  })
})

describe('BE-06 sorun gruplarında müşteri süzgeci', () => {
  it('tid → tenantFilter {approximate:true}; süzgeç gruplar azaltır; geçersiz tid 400', async () => {
    const { api } = await signedIn()
    const all = await api.call('LogCenterService/getIssueGroups', { range: '7d' })
    expect(all.tenantFilter).toBeUndefined()
    const scoped = await api.call('LogCenterService/getIssueGroups', { range: '7d', tid: 104 })
    expect(scoped.tenantFilter).toEqual({ tid: 104, approximate: true })
    expect(scoped.items.length).toBeLessThan(all.items.length)
    expect(scoped.items.length).toBeGreaterThan(0)
    for (const bad of [0, -1, 1.5]) expect((await fails(api.call('LogCenterService/getIssueGroups', { range: '24h', tid: bad })))?.code).toBe('VALIDATION')
  })
})

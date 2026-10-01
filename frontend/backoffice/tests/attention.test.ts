// BO-R1a: yönlendiren genel bakış — sahte getAttention/getPulse sözleşmeye BİREBİR (docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md),
// adaptör (src/api/attention.ts) sunucu metnini/sırasını korur, sorgu adlarını ekranlara çevirir, uç yoksa getHealth'e düşer.
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { fromAttention, fromHealth, fromPulse, routeOf, toItem } from '../src/api/attention'
import { countText, healthOf } from '../src/components/triage/triage'
import type { AttentionItemDto } from '../src/api/contract'

async function signedIn() {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  return { api, server }
}

const ITEM_KEYS = ['id', 'group', 'severity', 'title', 'why', 'count', 'countUnit', 'impact', 'since', 'subjects', 'actions']
const SEV = { critical: 0, warning: 1, info: 2 }

describe('getAttention (sahte) — sözleşme şekli', () => {
  it('üst alanlar, grup başına öncelik sırası, metin uzunlukları, eylem şekli', async () => {
    const { api } = await signedIn()
    const r = await api.call('BackofficeOverviewService/getAttention', {})
    expect(Object.keys(r).sort()).toEqual(['degradedSections', 'generatedAt', 'groups', 'status', 'summary'])
    expect(r.status).toBe('attention')
    expect(Object.keys(r.groups).sort()).toEqual(['customers', 'system'])
    let total = 0
    for (const g of ['system', 'customers'] as const) {
      const grp = r.groups[g]
      expect(Object.keys(grp).sort()).toEqual(['items', 'total', 'truncated'])
      total += grp.total
      const sev = grp.items.map((i) => SEV[i.severity])
      expect(sev).toEqual([...sev].sort((a, b) => a - b))
      for (const i of grp.items) {
        for (const k of Object.keys(i)) expect(ITEM_KEYS).toContain(k)
        expect(i.group).toBe(g)
        expect(i.id.startsWith(g === 'system' ? 'sys.' : 'cus.')).toBe(true)
        expect(i.title.length).toBeLessThanOrEqual(60)
        expect(i.why.length).toBeLessThanOrEqual(200)
        if (i.impact) expect(i.impact.length).toBeLessThanOrEqual(160)
        expect(i.actions.length).toBeGreaterThanOrEqual(1)
        expect(i.actions.length).toBeLessThanOrEqual(3)
        for (const a of i.actions) {
          if (a.kind === 'navigate') expect(a.target.route.startsWith('/')).toBe(true)
          else expect(a.capabilityId).toMatch(/^platform\./)
        }
        if (g === 'customers') {
          expect(i.subjects?.length).toBeGreaterThan(0)
          for (const s of i.subjects ?? []) expect(Object.keys(s).sort()).toEqual(['name', 'tid'])
        }
      }
    }
    expect(r.summary.critical + r.summary.warning + r.summary.info).toBe(total)
  })

  it('strict gövde + limit 1..50; limit grup başına keser (truncated)', async () => {
    const { api } = await signedIn()
    await expect(api.call('BackofficeOverviewService/getAttention', { foo: 1 } as never)).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    await expect(api.call('BackofficeOverviewService/getAttention', { limit: 0 })).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(api.call('BackofficeOverviewService/getAttention', { limit: 51 })).rejects.toMatchObject({ code: 'VALIDATION' })
    const r = await api.call('BackofficeOverviewService/getAttention', { limit: 1 })
    expect(r.groups.customers.items).toHaveLength(1)
    expect(r.groups.customers.truncated).toBe(true)
    expect(r.groups.customers.total).toBeGreaterThan(1)
  })

  it('susturulmuş (n11:103) ve gölge (R4) uyarılar YOK; deneme > 3 gün → öğe yok', async () => {
    const { api } = await signedIn()
    const r = await api.call('BackofficeOverviewService/getAttention', {})
    const ids = [...r.groups.system.items, ...r.groups.customers.items].map((i) => i.id)
    expect(ids.some((i) => i.startsWith('cus.integration.auth'))).toBe(false)
    expect(ids.some((i) => i.startsWith('sys.alert.firing'))).toBe(false)
    expect(ids).not.toContain('cus.trial.ending')
  })

  it('sakin kol → status ok, öğe yok; okunamayan kontrol → degraded + o kontrolün öğesi yok', async () => {
    const { api, server } = await signedIn()
    server.setCalm(true)
    const calm = await api.call('BackofficeOverviewService/getAttention', {})
    expect(calm.status).toBe('ok')
    expect(calm.groups.system.items).toHaveLength(0)
    expect(calm.groups.customers.items).toHaveLength(0)
    server.setCalm(false)
    server.setAttentionDegraded(['circuits'])
    const d = await api.call('BackofficeOverviewService/getAttention', {})
    expect(d.status).toBe('degraded')
    expect(d.degradedSections).toEqual([{ section: 'circuits', error: 'timeout' }])
    expect(d.groups.system.items.some((i) => i.id.startsWith('sys.circuit'))).toBe(false)
  })

  it('Redis düşük → kritik altyapı/kuyruk öğeleri en önde', async () => {
    const { api, server } = await signedIn()
    server.setDegraded(true)
    const r = await api.call('BackofficeOverviewService/getAttention', {})
    expect(r.groups.system.items[0].severity).toBe('critical')
    expect(r.groups.system.items.map((i) => i.id)).toContain('sys.queue.unavailable')
  })
})

describe('getPulse (sahte) — sözleşme şekli', () => {
  it('bloklar; sipariş DAİMA hesaplanamadı; saatlik seri 24 nokta; strict gövde', async () => {
    const { api } = await signedIn()
    const p = await api.call('BackofficeOverviewService/getPulse', {})
    // activeUsers: MOB-08 kullanım bloğu (INT-1001 birleşimi; sözleşme docs/API_BACKOFFICE_USAGE.md).
    expect(Object.keys(p).sort()).toEqual(['activeUsers', 'calls', 'errorRate', 'generatedAt', 'mrr', 'orders', 'tenants'])
    expect(p.orders).toMatchObject({ status: 'ok', computable: false, last24h: null, hourly: [], note: 'hesaplanamadı' })
    if (p.calls.status !== 'ok' || p.errorRate.status !== 'ok') throw new Error('beklenmeyen degraded')
    expect(p.calls.http.hourly).toHaveLength(24)
    expect(p.errorRate.http.hourly).toHaveLength(24)
    await expect(api.call('BackofficeOverviewService/getPulse', { range: '24h' } as never)).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('adaptör', () => {
  it('sorgu adları ekranlara çevrilir (tab→sekme, source→kaynak, Türkçe sekme değerleri)', () => {
    expect(routeOf({ route: '/motor', query: { tab: 'failed', source: 'dlq' } })).toEqual({ path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq' } })
    expect(routeOf({ route: '/entegrasyonlar', query: { tab: 'resilience', integrationCode: 'n11' } })).toEqual({ path: '/entegrasyonlar', query: { sekme: 'dayaniklilik', integrationCode: 'n11' } })
    expect(routeOf({ route: '/entegrasyonlar', query: { tab: 'api-health' } })).toEqual({ path: '/entegrasyonlar', query: { sekme: 'saglik' } })
    expect(routeOf({ route: '/altyapi', query: { tab: 'slow-queries', range: '1h' } })).toEqual({ path: '/altyapi', query: { sekme: 'yavas', range: '1h' } })
    expect(routeOf({ route: '/loglar', query: { tab: 'issues', status: 'open' } })).toEqual({ path: '/loglar', query: { status: 'open' } })
    expect(routeOf({ route: '/altyapi' })).toEqual({ path: '/altyapi' })
  })

  it('sunucu metni ve sırası korunur; tek müşterili öğe detay kaydına gider; yetenek eylemi ipucu olur', async () => {
    const { api } = await signedIn()
    const r = await api.call('BackofficeOverviewService/getAttention', {})
    const m = fromAttention(r)
    expect(m.items.system.map((i) => i.id)).toEqual(r.groups.system.items.map((i) => i.id))
    expect(m.items.system[0].title).toBe(r.groups.system.items[0].title)
    const pay = m.items.tenant.find((i) => i.id === 'cus.payment.problem')!
    expect(pay.action?.to).toEqual({ path: '/abonelikler/105' })
    const life = m.items.tenant.find((i) => i.id === 'cus.lifecycle.failed')!
    expect(life.action?.to).toEqual({ path: '/musteriler/108', query: { sekme: 'yasam-dongusu' } })
    const failed = m.items.system.find((i) => i.id.startsWith('sys.queue.failed'))!
    expect(failed.capabilities).toEqual([{ label: 'Hepsini yeniden dene', capabilityId: 'platform.engine.retry_jobs' }])
    expect(failed.count).toBe('3 iş')
    expect(failed.advice).toBeTruthy()
  })

  it('birden çok müşterili öğe sözleşme hedefini korur', () => {
    const d: AttentionItemDto = { id: 'cus.payment.problem', group: 'customers', severity: 'warning', title: 'Ödeme', why: 'x', count: 2, countUnit: 'müşteri', impact: null, since: null, subjects: [{ tid: 1, name: null }, { tid: 2, name: null }], actions: [{ label: 'Git', kind: 'navigate', target: { route: '/abonelikler', query: { status: 'past_due' } } }] }
    expect(toItem(d).action?.to).toEqual({ path: '/abonelikler', query: { status: 'past_due' } })
  })

  it('okunamayan kontrol doğru kapsama yazılır (alerts iki gruba)', () => {
    const m = fromAttention({ generatedAt: 'x', status: 'degraded', summary: { critical: 0, warning: 0, info: 0 }, degradedSections: [{ section: 'alerts', error: 'error' }, { section: 'tickets', error: 'timeout' }], groups: { system: { total: 0, truncated: false, items: [] }, customers: { total: 0, truncated: false, items: [] } } })
    expect(m.degraded.system).toEqual(['Uyarı kuralları'])
    expect(m.degraded.tenant).toEqual(['Uyarı kuralları', 'Destek talepleri'])
  })

  it('uç yoksa (404) getHealth geri düşüşü: sistem maddeleri, müşteri kapsamı yok', async () => {
    const { api, server } = await signedIn()
    server.setAttentionMissing(true)
    await expect(api.call('BackofficeOverviewService/getAttention', {})).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    const m = fromHealth(await api.call('BackofficeOverviewService/getHealth', {}))
    expect(m.source).toBe('fallback')
    expect(m.items.tenant).toEqual([])
    expect(m.items.system.map((i) => i.id)).toContain('sys.queue.dlq')
    const dlq = m.items.system.find((i) => i.id === 'sys.queue.dlq')!
    expect(dlq.action?.to).toEqual({ path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq' } })
  })

  it('nabız: hesaplanamayan "—" + neden; eşik aşımı yalnız sözleşme eşiğinde', async () => {
    const { api } = await signedIn()
    const p = fromPulse(await api.call('BackofficeOverviewService/getPulse', {}))
    const orders = p.rows.find((r) => r.key === 'orders')!
    expect(orders).toMatchObject({ value: '—', state: 'na' })
    expect(p.rows.every((r) => !r.over)).toBe(true)
    expect(p.usage.tenants.state).toBe('ok')
  })

  it('triyaj yardımcıları: sağlık hükmü ve sayım metni', () => {
    expect(healthOf([{ severity: 'info' }])).toBe('ok')
    expect(healthOf([], true)).toBe('unknown')
    expect(healthOf([{ severity: 'warning' }, { severity: 'critical' }])).toBe('critical')
    expect(countText([{ severity: 'critical' }, { severity: 'warning' }, { severity: 'warning' }])).toBe('1 kritik · 2 uyarı')
  })
})

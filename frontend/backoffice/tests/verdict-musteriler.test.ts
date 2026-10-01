import { describe, expect, it, vi } from 'vitest'
import type { ClientDto, TenantLifecycle } from '@bo/api/contract'
import { SEGMENT_SLUG, SLUG_SEGMENT, inSegment, tenantsVerdict } from '@bo/views/tenantsVerdict'
import { tenantDetailVerdict } from '@bo/views/tenantDetailVerdict'
import type { TenantHealthSummary, TenantOpsRow } from '@bo/api/contracts/ops'
import { FAILED_JOBS_ERROR, OPEN_ISSUES_ERROR } from '@bo/views/tenantsVerdict'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const H = 3_600_000
const client = (id: number, over: Partial<ClientDto> = {}): ClientDto => ({
  _id: String(id),
  title: `Mağaza ${id}`,
  order: id,
  clientId: id,
  status: 'ACTIVE',
  lastSuccessfulOrderSync: ago(10 * 60_000),
  integrations: [{ integrationCode: 'trendyol' }],
  createdAt: ago(100 * 24 * H),
  updatedAt: ago(24 * H),
  ...over,
})
const base = { total: 3, failed: false, retry: vi.fn(), segmentTo: (seg: string) => ({ query: { durum: SEGMENT_SLUG[seg as keyof typeof SEGMENT_SLUG] } }), now: NOW }

describe('müşteri listesi hükmü', () => {
  it('sakin: özet somut, eylem yok', () => {
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2)] })
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('2 aktif hesabın hepsinde')
    expect(v.attention).toEqual([])
    expect(v.actions).toEqual([])
    expect(v.checks?.length).toBeGreaterThan(0)
    expect(v.note).toBeTruthy()
  })

  it('eski eşitleme sarı; süzgece bağlı; loglara eylem', () => {
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2), client(3, { lastSuccessfulOrderSync: ago(30 * H) })] })
    expect(v.tone).toBe('warning')
    expect(v.attention[0]).toMatchObject({ id: 'stale-sync', tone: 'warning' })
    expect(v.attention[0].to).toEqual({ query: { durum: 'eski' } })
    expect(v.attention[0].impact).toBeTruthy()
    expect(v.attention[0].advice).toBeTruthy()
    expect(v.actions[0].id).toBe('stale-list')
    expect(v.actions.find((a) => a.id === 'order-logs')?.to).toMatchObject({ path: '/loglar', query: { category: 'order' } })
  })

  it('çoğu hesapta eşitleme eski → kırmızı ve motora bağlantı', () => {
    const old = { lastSuccessfulOrderSync: ago(48 * H) }
    const v = tenantsVerdict({ ...base, clients: [client(1, old), client(2, old), client(3)] })
    expect(v.tone).toBe('error')
    expect(v.actions[0]).toMatchObject({ id: 'engine', to: '/motor' })
  })

  it('eşitleme kaydı hiç olmayan kanallı aktif hesap eski sayılır; kanalsız ve pasif yalnız bilgi', () => {
    const clients = [client(1), client(2, { lastSuccessfulOrderSync: undefined }), client(3, { integrations: [], lastSuccessfulOrderSync: undefined }), client(4, { status: 'PASSIVE', lastSuccessfulOrderSync: undefined })]
    expect(inSegment(clients[1], 'stale', NOW)).toBe(true)
    expect(inSegment(clients[2], 'nochannel', NOW)).toBe(true)
    expect(inSegment(clients[3], 'stale', NOW)).toBe(false)
    const v = tenantsVerdict({ ...base, clients })
    expect(v.attention.map((a) => [a.id, a.tone])).toEqual([['stale-sync', 'warning'], ['no-channel', 'info'], ['passive', 'info']])
    for (const a of v.attention) {
      expect(a.to).toBeTruthy()
      expect(a.onSelect).toBeUndefined()
    }
  })

  it('yalnız bilgi maddeleri hükmü bozmaz', () => {
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2, { integrations: [], lastSuccessfulOrderSync: undefined })] })
    expect(v.tone).toBe('success')
    expect(v.attention).toHaveLength(1)
  })

  it('okunamadı: hüküm "bilinmiyor", tekrar dene bağlı', () => {
    const retry = vi.fn()
    const v = tenantsVerdict({ ...base, retry, clients: null, failed: true })
    expect(v.summary).toContain('okunamadı')
    expect(v.tone).toBe('warning')
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
    expect(v.attention[0].source).toBe('Müşteri listesi')
  })

  const opsRow = (tid: number, o: Partial<TenantOpsRow['ops']> = {}, status = 'ACTIVE'): TenantOpsRow => ({
    tid,
    name: `Mağaza ${tid}`,
    status,
    ops: { planCode: 'growth', subscriptionStatus: 'active', openIssues: 0, openIssuesApprox: true, failedJobs24h: 0, lastErrorAt: null, ...o },
  })

  it('operasyon: sakin müşteriler → özet açık sorun yok der', () => {
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2)], ops: [opsRow(1), opsRow(2)], opsDegraded: [] })
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('açık sorun ya da başarısız iş yok')
  })

  it('operasyon: eşik üstü müşteri kırmızı, adıyla (tenant) ve detaya bağlı; eylemin ilki en sorunlu müşteri', () => {
    const ops = [opsRow(1, { openIssues: 1 }), opsRow(2, { failedJobs24h: FAILED_JOBS_ERROR, openIssues: OPEN_ISSUES_ERROR }), opsRow(3, { failedJobs24h: 2 })]
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2), client(3)], ops })
    expect(v.tone).toBe('error')
    expect(v.attention[0]).toMatchObject({ id: 'tenant-2', tone: 'error', to: '/musteriler/2', tenant: { tid: 2, name: 'Mağaza 2' } })
    expect(v.attention.find((a) => a.id === 'tenant-3')?.tone).toBe('warning')
    expect(v.attention.find((a) => a.id === 'problem-tenants')?.to).toEqual({ query: { durum: 'sorunlu' } })
    expect(v.actions[0]).toMatchObject({ id: 'top-tenant', to: '/musteriler/2' })
  })

  it('operasyon: askıda ve ödeme gecikti abonelikler abonelik listesine bağlı', () => {
    const ops = [opsRow(1, { subscriptionStatus: 'suspended' }), opsRow(2, { subscriptionStatus: 'past_due' })]
    const v = tenantsVerdict({ ...base, clients: [client(1), client(2)], ops })
    expect(v.attention.find((a) => a.id === 'sub-suspended')?.to).toEqual({ path: '/abonelikler', query: { durum: 'suspended' } })
    expect(v.attention.find((a) => a.id === 'sub-past-due')?.to).toEqual({ path: '/abonelikler', query: { durum: 'past_due' } })
    expect(v.tone).toBe('warning')
  })

  it('operasyon okunamadı / bölüm eksik: "okunamadı" yazılır, sakin özet çıkmaz', () => {
    const failed = tenantsVerdict({ ...base, clients: [client(1)], ops: null, opsFailed: true })
    expect(failed.attention[0].id).toBe('unreadable-ops')
    expect(failed.summary).not.toContain('açık sorun ya da başarısız iş yok')
    const part = tenantsVerdict({ ...base, clients: [client(1)], ops: [opsRow(1)], opsDegraded: ['failedJobs'] })
    expect(part.attention[0]).toMatchObject({ id: 'unreadable-ops-failedJobs', title: expect.stringContaining('okunamadı') })
    expect(part.tone).toBe('warning')
  })

  it('sorunlu segment: sunucudaki hasIssues kuralı (sorun, başarısız iş, son 24 saatte hata)', () => {
    const ops = new Map<number, TenantOpsRow['ops']>([
      [1, opsRow(1).ops],
      [2, opsRow(2, { openIssues: 1 }).ops],
      [3, opsRow(3, { lastErrorAt: ago(2 * H) }).ops],
      [4, opsRow(4, { lastErrorAt: ago(30 * H) }).ops],
    ])
    const got = [1, 2, 3, 4].filter((id) => inSegment(client(id), 'sorunlu', NOW, (t) => ops.get(t)))
    expect(got).toEqual([2, 3])
  })

  it('URL eşlemesi iki yönlü', () => {
    for (const [seg, slug] of Object.entries(SEGMENT_SLUG)) if (slug) expect(SLUG_SEGMENT[slug]).toBe(seg)
  })
})

const life = (over: Partial<TenantLifecycle> = {}): TenantLifecycle => ({
  tid: 102,
  status: 'ACTIVE',
  name: 'x',
  lastSuccessfulOrderSync: ago(10 * 60_000),
  trial: { subscriptionStatus: 'active', planCode: 'growth', trialEndsAt: null, daysLeft: null, billingExempt: false },
  deletion: null,
  provisioning: { steps: [], startedAt: null, failedAt: null, failedStep: null },
  recentEvents: [],
  ...over,
})
const dbase = { tid: 102, client: client(102), failed: false, retry: vi.fn(), tabTo: (tab: string) => ({ query: { sekme: tab } }), impersonate: vi.fn(), undoDeletion: vi.fn(), now: NOW }

describe('müşteri detayı hükmü', () => {
  it('sakin: durum cümlesi plan ve eşitlemeyi söyler', () => {
    const v = tenantDetailVerdict({ ...dbase, life: life() })
    expect(v.tone).toBe('success')
    expect(v.summary).toMatch(/Hesap aktif; abonelik Büyüme · aktif/)
    expect(v.actions).toEqual([])
  })

  it('kurulum başarısız → kırmızı, yaşam döngüsü sekmesine bağlı', () => {
    const v = tenantDetailVerdict({ ...dbase, life: life({ status: 'PROVISIONING_FAILED', provisioning: { steps: [], startedAt: null, failedAt: null, failedStep: 'tenant-user' } }) })
    expect(v.tone).toBe('error')
    expect(v.attention[0].to).toEqual({ query: { sekme: 'yasam-dongusu' } })
    expect(v.attention[0].impact && v.attention[0].advice).toBeTruthy()
    expect(v.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['logs', 'audit', 'notifications']))
  })

  it('silme bekliyor → sarı; geri alma korumalı eylem', () => {
    const undoDeletion = vi.fn()
    const v = tenantDetailVerdict({ ...dbase, undoDeletion, life: life({ status: 'DELETION_PENDING', deletion: { requestedAt: null, requestedBy: null, scheduledAt: null, daysUntilPurge: 5, canCancel: true, purgedAt: null, purgeFailedStep: null } }) })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].title).toContain('5 gün')
    const undo = v.actions[0]
    expect(undo.id).toBe('undo-deletion')
    expect(undo.guarded).toBe(true)
    undo.onSelect!()
    expect(undoDeletion).toHaveBeenCalled()
    expect(v.actions.find((a) => a.id === 'impersonate')).toBeUndefined()
  })

  it('askıda kırmızı, ödeme gecikti sarı, deneme ≤3 gün sarı; hepsi aboneliğe bağlı', () => {
    const t = (subscriptionStatus: 'suspended' | 'past_due' | 'trialing', daysLeft: number | null = null) => life({ trial: { subscriptionStatus, planCode: 'starter', trialEndsAt: null, daysLeft, billingExempt: false } })
    const sus = tenantDetailVerdict({ ...dbase, life: t('suspended') })
    expect(sus.tone).toBe('error')
    expect(sus.attention[0].to).toBe('/abonelikler/102')
    expect(tenantDetailVerdict({ ...dbase, life: t('past_due') }).tone).toBe('warning')
    const trial = tenantDetailVerdict({ ...dbase, life: t('trialing', 2) })
    expect(trial.tone).toBe('warning')
    expect(trial.actions.find((a) => a.id === 'extend-trial')?.to).toBe('/abonelikler/102')
    expect(tenantDetailVerdict({ ...dbase, life: t('trialing', 12) }).tone).toBe('success')
  })

  it('eski eşitleme → sarı ve müşteri süzgeçli loga bağlı; destek oturumu korumalı', () => {
    const v = tenantDetailVerdict({ ...dbase, life: life({ lastSuccessfulOrderSync: ago(50 * H) }) })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].to).toMatchObject({ path: '/loglar', query: { tid: '102', category: 'order' } })
    expect(v.actions.find((a) => a.id === 'impersonate')?.guarded).toBe(true)
  })

  const health = (over: Partial<TenantHealthSummary> = {}): TenantHealthSummary => ({
    tid: 102,
    generatedAt: ago(0),
    openIssues: { approx: true, items: [] },
    failedJobs: { bullmq: 0, dlq: 0, bullmqAvailable: true },
    lastSyncAt: { trendyol: ago(5 * 60_000) },
    lastOrderSyncAt: ago(5 * 60_000),
    alerts: [],
    degradedSections: [],
    ...over,
  })
  const issue = { fp: 'adapter::trendyol::RATE_LIMITED::a1f3', module: 'adapter-trendyol', code: 'RATE_LIMITED', integrationCode: 'trendyol', lastSeen: ago(4 * 60_000), count: 38, status: 'open' }

  it('sağlık özeti sakin: özet "sorun yok" der; BE-02 yok ifadesi kalmadı', () => {
    const v = tenantDetailVerdict({ ...dbase, life: life(), health: health() })
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('açık sorun, başarısız iş ve etkin uyarı yok')
    expect(v.note).not.toMatch(/ucu yok/)
  })

  it('sağlık özeti: açık sorun loglara (tid+fp), başarısız iş motora, firing uyarı uyarılara bağlı', () => {
    const v = tenantDetailVerdict({
      ...dbase,
      life: life(),
      health: health({
        openIssues: { approx: true, items: [issue, { ...issue, fp: 'b' }, { ...issue, fp: 'c' }] },
        failedJobs: { bullmq: 12, dlq: 1, bullmqAvailable: true },
        alerts: [{ ruleId: 'R1', scopeKey: 'trendyol:102', level: 'critical', status: 'firing', firstFiredAt: ago(H), lastSeenAt: ago(60_000), mutedUntil: null }],
      }),
    })
    expect(v.tone).toBe('error')
    expect(v.attention.find((a) => a.id === 'open-issues')).toMatchObject({ tone: 'error', to: { path: '/loglar', query: { tid: '102', fp: issue.fp } } })
    expect(v.attention.find((a) => a.id === 'failed-jobs')).toMatchObject({ tone: 'error', to: { path: '/motor', query: { sekme: 'basarisiz', tid: '102' } } })
    expect(v.attention.find((a) => a.id.startsWith('alert-'))?.to).toEqual({ path: '/bildirimler/uyarilar', query: { durum: 'firing' } })
    expect(v.actions.find((a) => a.id === 'failed-jobs')).toBeTruthy()
  })

  it('yalnız elle inceleme bekleyen iş → kaynak=dlq; susturulmuş uyarı bilgi', () => {
    const v = tenantDetailVerdict({
      ...dbase,
      life: life(),
      health: health({ failedJobs: { bullmq: 0, dlq: 2, bullmqAvailable: true }, alerts: [{ ruleId: 'R2', scopeKey: 'x', level: 'critical', status: 'firing', firstFiredAt: ago(H), lastSeenAt: ago(0), mutedUntil: new Date(NOW + H).toISOString() }] }),
    })
    expect(v.attention.find((a) => a.id === 'failed-jobs')).toMatchObject({ tone: 'warning', to: { query: { kaynak: 'dlq' } } })
    expect(v.attention.find((a) => a.id.startsWith('alert-'))?.tone).toBe('info')
  })

  it('degradedSections: bölüm "okunamadı", boş değer sorun yok sayılmaz', () => {
    const v = tenantDetailVerdict({ ...dbase, life: life(), health: health({ failedJobs: { bullmq: null, dlq: null, bullmqAvailable: false }, degradedSections: [{ section: 'failedJobs', error: 'timeout' }] }) })
    expect(v.tone).toBe('warning')
    expect(v.attention[0]).toMatchObject({ id: 'unreadable-health-failedJobs', title: expect.stringContaining('okunamadı') })
    expect(v.summary).not.toContain('başarısız iş ve etkin uyarı yok')
    expect(tenantDetailVerdict({ ...dbase, life: life(), health: null, healthFailed: true }).attention[0].id).toBe('unreadable-health')
  })

  it('okunamadı → hüküm verilmez', () => {
    const v = tenantDetailVerdict({ ...dbase, life: null, failed: true })
    expect(v.summary).toContain('okunamadı')
    expect(v.attention[0].id).toBe('unreadable-lifecycle')
  })
})

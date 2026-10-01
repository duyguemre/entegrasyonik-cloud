import { describe, expect, it, vi } from 'vitest'
import type { BillingEventRow, ListSubscriptionsResponse, RevenueMetrics, SubscriptionRow } from '@bo/api/contract'
import { subscriptionDetailVerdict, subscriptionsVerdict } from '@bo/views/billing/billingVerdict'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(NOW + ms).toISOString()
const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  tid: 101, tenantName: 'Lale', planCode: 'growth', planVersion: 1, status: 'active', trialEndsAt: null, currentPeriodStart: iso(-10 * DAY), currentPeriodEnd: iso(20 * DAY),
  cancelAtPeriodEnd: false, graceUntil: null, billingExempt: false, provider: 'mock', hasProviderRef: true, cardLast4: '4242', cardBrand: 'visa', createdAt: iso(-90 * DAY), updatedAt: iso(-DAY), ...over,
})
const list = (...items: SubscriptionRow[]): ListSubscriptionsResponse => ({ items, nextCursor: null })
const revenue = (over: Partial<RevenueMetrics> = {}): RevenueMetrics => ({
  range: '30d', from: iso(-30 * DAY), to: iso(0),
  mrr: { byCurrency: { TRY: 1_200_000 }, byPlan: [], billedSubscriptions: 4, quoteBasedSubscriptions: 0, unpricedSubscriptions: 0 },
  statusDistribution: { trialing: 1, active: 4, past_due: 0, suspended: 0, canceled: 0, expired: 0 }, exemptSubscriptions: 0,
  trialConversion: { cohort: 2, converted: 1, rate: 0.5 }, churn: { count: 0, mrrLostByCurrency: {}, rate: 0 }, paymentEvents: { succeeded: 10, failed: 0 }, ...over,
})
const ok = { revenue: false, pastDue: false, suspended: false, trialing: false }
const base = { revenue: revenue(), pastDue: list(), suspended: list(), trialing: list(), failed: ok, retry: vi.fn(), now: NOW }

describe('abonelikler hükmü', () => {
  it('sakin: aktif sayısı ve tahmini gelir', () => {
    const v = subscriptionsVerdict(base)
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('4 aktif abonelik')
    expect(v.summary).toContain('tahmini')
    expect(v.checks?.length).toBeGreaterThan(0)
  })

  it('askıda kırmızı, süzgece bağlı; ödeme gecikti sarı; yakında biten deneme sarı', () => {
    const v = subscriptionsVerdict({
      ...base,
      suspended: list(sub({ status: 'suspended' })),
      pastDue: list(sub({ status: 'past_due', graceUntil: iso(4 * DAY) })),
      trialing: list(sub({ status: 'trialing', trialEndsAt: iso(2 * DAY) }), sub({ tid: 2, status: 'trialing', trialEndsAt: iso(9 * DAY) })),
    })
    expect(v.tone).toBe('error')
    expect(v.attention.map((a) => [a.id, a.tone])).toEqual([['suspended', 'error'], ['past-due', 'warning'], ['trial-ending', 'warning']])
    expect(v.attention[0].to).toEqual({ query: { durum: 'suspended' } })
    expect(v.attention[2].title).toContain('1 denemenin')
    expect(v.actions[0].id).toBe('suspended')
    for (const x of v.attention) expect([x.impact, x.advice, x.to].every(Boolean)).toBe(true)
  })

  it('ödeme hataları: düşük oran bilgi, yüksek oran sarı; kayıp bilgi ve gelir sekmesine bağlı', () => {
    const low = subscriptionsVerdict({ ...base, revenue: revenue({ paymentEvents: { succeeded: 95, failed: 5 }, churn: { count: 2, mrrLostByCurrency: { TRY: 50_000 }, rate: 0.1 } }) })
    expect(low.tone).toBe('success')
    expect(low.attention.map((a) => a.id)).toEqual(['payment-failures', 'churn'])
    expect(low.attention[1].to).toMatchObject({ query: { sekme: 'gelir' } })
    const high = subscriptionsVerdict({ ...base, revenue: revenue({ paymentEvents: { succeeded: 6, failed: 4 } }) })
    expect(high.tone).toBe('warning')
  })

  it('okunamayan kaynak sağlıklı demez; tümü okunamazsa hüküm verilmez', () => {
    const v = subscriptionsVerdict({ ...base, suspended: null, failed: { ...ok, suspended: true } })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('unreadable-suspended')
    const all = subscriptionsVerdict({ revenue: null, pastDue: null, suspended: null, trialing: null, failed: { revenue: true, pastDue: true, suspended: true, trialing: true }, retry: vi.fn(), now: NOW })
    expect(all.summary).toContain('okunamadı')
  })
})

const events: BillingEventRow[] = []
const dbase = { tid: 101, events, failed: false, retry: vi.fn(), why: { extend: '', change: '', cancel: '' }, reopen: false, openExtend: vi.fn(), openChange: vi.fn(), openCancel: vi.fn(), now: NOW }

describe('abonelik detayı hükmü', () => {
  it('sakin: dönem sonu söylenir; eylemler korumalı, iptal danger', () => {
    const v = subscriptionDetailVerdict({ ...dbase, sub: sub() })
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('Abonelik sorunsuz')
    expect(v.actions.map((a) => a.id)).toEqual(['extend-trial', 'change-plan', 'cancel'])
    expect(v.actions.filter((a) => !a.danger).every((a) => a.guarded)).toBe(true)
    const cancel = v.actions.find((a) => a.id === 'cancel')!
    expect(cancel.danger).toBe(true)
    expect(cancel.onSelect).toBeUndefined()
    expect(cancel.to).toEqual({ hash: '#iptal' })
    expect(v.actions[0].danger).toBeFalsy()
  })

  it('askıda kırmızı (yeniden aç eylemi); ödeme gecikti sarı; dönem sonunda iptal sarı', () => {
    const sus = subscriptionDetailVerdict({ ...dbase, reopen: true, sub: sub({ status: 'suspended', hasProviderRef: false }) })
    expect(sus.tone).toBe('error')
    expect(sus.actions[0].label).toBe('Denemeyi yeniden aç')
    expect(subscriptionDetailVerdict({ ...dbase, sub: sub({ status: 'past_due', graceUntil: iso(3 * DAY) }) }).tone).toBe('warning')
    const end = subscriptionDetailVerdict({ ...dbase, sub: sub({ cancelAtPeriodEnd: true }) })
    expect(end.tone).toBe('warning')
    expect(end.attention[0].to).toBe('/musteriler/101')
    expect(sus.actions.find((x) => x.id === 'cancel')?.danger).toBe(true)
  })

  it('uygunsuz eylem önerilmez; sona ermiş abonelik yalnız bilgi', () => {
    const v = subscriptionDetailVerdict({ ...dbase, why: { extend: 'x', change: 'x', cancel: 'x' }, sub: sub({ status: 'canceled' }) })
    expect(v.tone).toBe('success')
    expect(v.actions).toEqual([])
    expect(v.attention[0].tone).toBe('info')
  })

  it('okunamadı', () => {
    expect(subscriptionDetailVerdict({ ...dbase, sub: null, failed: true }).summary).toContain('okunamadı')
  })
})

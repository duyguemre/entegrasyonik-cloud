// FR3 madde 16 — ana sayfa "Bugün sırada": yalnız backend verisinden, kritik → bugün → fırsat buldukça sırası.
import { describe, expect, it } from 'vitest'
import { buildNextActions, greeting } from '@/components/dashboard/nextActions'

const insights = (pending: Partial<Record<'shippingCount' | 'invoiceCount' | 'claimCount' | 'messageCount', number>>) => ({
  totals: { orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 },
  today: { count: 0, revenue: 0 },
  trend: { countChange: 0, revenueChange: 0 },
  statusDistribution: { total: 0 },
  pending: { shippingCount: 0, invoiceCount: 0, claimCount: 0, messageCount: 0, ...pending },
  last7Days: [],
}) as any
const stock = (oversold: number, unmapped: number, publishPending = 0) => ({
  attention: { oversold: { lines: oversold, units: oversold }, unmapped: { lines: unmapped, units: unmapped } },
  variants: { publishPending }, recentOrders: [],
}) as any
const entry = (code: string, health: string, extra: Record<string, any> = {}) => ({ integrationCode: code, type: 'MARKETPLACE', enabled: true, credentialsConfigured: true, lastSuccessfulSyncAt: null, lastError: null, last24h: { total: 10, success: 7, error: 3 }, health, ...extra })
const name = (c: string) => ({ trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' } as Record<string, string>)[c] ?? c

describe('buildNextActions', () => {
  it('kritik önce, sonra iş akışı sırası, sonra fırsat buldukça; sıfırlar "bekleyen yok"', () => {
    const { actions, cleared } = buildNextActions({
      insights: insights({ shippingCount: 2, invoiceCount: 1 }),
      stock: stock(2, 1, 3),
      health: { generatedAt: '', windowHours: 24, integrations: [entry('trendyol', 'degraded'), entry('hepsiburada', 'down')] } as any,
      channelName: name,
    })
    expect(actions.map((a) => a.key)).toEqual(['oversold', 'down-hepsiburada', 'shipping', 'invoice', 'degraded-trendyol', 'unmapped', 'publish'])
    expect(actions[0]).toMatchObject({ level: 'critical', title: '2 sipariş kaleminde aşırı satış', screen: 'StockHealthView' })
    expect(actions.find((a) => a.key === 'shipping')).toMatchObject({ title: '2 sipariş kargoya verilmeyi bekliyor', params: { internalStatuses: ['APPROVED'] } })
    expect(actions.find((a) => a.key === 'degraded-trendyol')?.text).toContain('3 işlem')
    expect(cleared.map((c) => c.label)).toEqual(['İade', 'Müşteri sorusu'])
  })

  it('kapalı entegrasyon ve kurulum eksikleri', () => {
    const { actions } = buildNextActions({
      insights: insights({}), stock: null,
      health: { generatedAt: '', windowHours: 24, integrations: [entry('trendyol', 'down', { enabled: false }), entry('hepsiburada', 'not_configured', { credentialsConfigured: false })] } as any,
      channelName: name,
    })
    expect(actions.map((a) => a.key)).toEqual(['setup-hepsiburada'])
    expect(actions[0].title).toBe('Hepsiburada kurulumunu tamamlayın')
  })

  it('veri yokken uydurma iş yok', () => {
    expect(buildNextActions({ insights: null, stock: null, health: null, channelName: name })).toEqual({ actions: [], cleared: [] })
    const { actions, cleared } = buildNextActions({ insights: insights({}), stock: stock(0, 0), health: null, channelName: name })
    expect(actions).toEqual([])
    expect(cleared).toHaveLength(4)
  })
})

describe('greeting', () => {
  it('saate göre', () => {
    expect(greeting(8)).toBe('Günaydın')
    expect(greeting(14)).toBe('İyi günler')
    expect(greeting(21)).toBe('İyi akşamlar')
    expect(greeting(2)).toBe('İyi akşamlar')
  })
})

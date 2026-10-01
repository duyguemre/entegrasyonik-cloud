/**
 * PRC-R2 backoffice — Fiyat kuralları paneli: dikkat mantığı (saf), sahte API sözleşmesi (yalnız TOPLAM; tenant verisi yok),
 * kill-switch ve S6 kota ayarı `_platform` kataloğunda (taslak → yayın akışı).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { pricingRulesAttention } from '../src/views/settings/pricingRulesLogic'
import type { PricingRulesOverview } from '../src/api/contract'

const base: PricingRulesOverview = {
  killSwitch: { key: 'features.pricingRules', enabled: true, label: null, help: null }, autoApply: { available: false, reason: 'PRC-R3' }, at: '2026-10-01T12:00:00.000Z',
  scannedTenants: 4, tenantsEnabled: 1, tenantsWithRules: 1, rules: { total: 2, enabled: 2, pausedExternal: 0, pausedOscillation: 0 },
  suggestions: { open: 3, blocked: 1, applied7d: 5, dismissed7d: 1 }, failedTenants: 0, truncated: false,
}

describe('pricingRulesAttention (K51: müdahale gerekiyor mu?)', () => {
  it('sakin durumda dikkat yok', () => { expect(pricingRulesAttention(base, true)).toEqual([]) })
  it('anahtar kapalıyken açık müşteri/kural varsa bilgi; duraklayan kural ve eksik sayım uyarılır', () => {
    const ids = pricingRulesAttention({ ...base, rules: { ...base.rules, pausedExternal: 1, pausedOscillation: 2 }, failedTenants: 1 }, false).map((a) => a.id)
    expect(ids).toEqual(['switch-off', 'paused-external', 'paused-oscillation', 'partial'])
  })
  it('veri yoksa boş', () => { expect(pricingRulesAttention(null, true)).toEqual([]) })
})

describe('sahte API sözleşmesi', () => {
  async function api() {
    const server = new MockAdminServer()
    const a = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    await a.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    await a.call('BackofficeAuthService/verifyTotp', { code: '123456' })
    return { a, server }
  }
  it('getPricingRulesOverview yalnız toplam döner (tenant kimliği/fiyat yok); otomatik uygulama yok', async () => {
    const { a } = await api()
    const o = await a.call('BackofficeBillingService/getPricingRulesOverview', {})
    expect(o.autoApply.available).toBe(false)
    expect(o.killSwitch.key).toBe('features.pricingRules')
    expect(JSON.stringify(o)).not.toMatch(/"tid"|tenantName|barcode|price/i)
  })
})

describe('kaynak sözleşmeleri', () => {
  const panel = readFileSync(resolve(__dirname, '../src/views/settings/PricingRulesPanel.vue'), 'utf8')
  it('kill-switch ve S6 kota ayarı mevcut taslak → yayın akışıyla (ayrı yazma ucu yok); tenant verisi metni', () => {
    expect(panel).toContain("const FLAG = 'features.pricingRules'")
    expect(panel).toContain("const QUOTA = 'pricing.suggestions.bulkApplyQuota'")
    expect(panel).toContain('cfg.saveAndPreview()')
    expect(panel).not.toMatch(/api\.call\('(IntegrationConfigService\/publish|BackofficeBillingService\/set)/)
    expect(panel).toMatch(/müşteri adı, ürün ya da fiyat gösterilmez/)
  })
})

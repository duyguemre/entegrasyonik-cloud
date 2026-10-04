// [eslesme-fiyat WP7b, F-10] "Şimdi senkronize et" istemcisi: başarılı yanıt, sunucu hata kodu → i18n anahtarı, gövde biçimi.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('@/composables/restapi', () => ({ default: () => ({ post }) }))

import { syncNowErrorKey, useSyncNowApi } from '@/composables/useSyncNowApi'
import tr from '@/plugins/locales/tr.json'
import en from '@/plugins/locales/en.json'

const axiosErr = (status: number, code?: string) => ({ isAxiosError: true, response: { status, data: code ? { code } : {} }, config: {} })

describe('useSyncNowApi', () => {
  beforeEach(() => post.mockReset())

  it('gövde yalnız integrationCode + kind; kabul yanıtı döner', async () => {
    post.mockResolvedValue({ accepted: true, jobId: 'manual_7_trendyol_orders_1', kind: 'orders', integrationCode: 'trendyol', requestedAt: 'x', nextAllowedAt: 'y', lastSuccessAt: null })
    const res = await useSyncNowApi().syncNow('trendyol')
    expect(post).toHaveBeenCalledWith('IntegrationService/syncNow', { integrationCode: 'trendyol', kind: 'orders' })
    expect(res).toMatchObject({ ok: true, data: { jobId: 'manual_7_trendyol_orders_1' } })
  })

  it('429 RATE_LIMITED → soğuma; kod ve durum korunur', async () => {
    post.mockResolvedValue(axiosErr(429, 'RATE_LIMITED'))
    const res = await useSyncNowApi().syncNow('n11', 'claims')
    expect(res).toEqual({ ok: false, status: 429, code: 'RATE_LIMITED' })
    expect(syncNowErrorKey('RATE_LIMITED', 429)).toBe('integrationSync.error.cooldown')
  })

  it('beklenmeyen biçim → genel hata (kabul sayılmaz)', async () => {
    post.mockResolvedValue({ ok: 1 })
    expect(await useSyncNowApi().syncNow('n11')).toEqual({ ok: false, status: null, code: null })
  })
})

describe('syncNowErrorKey', () => {
  it.each([
    ['INTEGRATION_PAUSED', 503, 'integrationSync.error.paused'],
    ['LIVE_READONLY', 423, 'integrationSync.error.readonly'],
    ['AUTH', 502, 'integrationSync.error.auth'],
    ['QUEUE_UNAVAILABLE', 503, 'integrationSync.error.queue'],
    ['NOT_FOUND', 404, 'integrationSync.error.notConfigured'],
    [null, 403, 'integrationSync.error.forbidden'],
    ['INTERNAL', 500, 'integrationSync.error.generic'],
  ])('%s/%s → %s (iki dilde de anahtar var)', (code, status, key) => {
    expect(syncNowErrorKey(code as any, status as any)).toBe(key)
    const leaf = key.split('.').reduce((o: any, k) => o?.[k], tr as any)
    const leafEn = key.split('.').reduce((o: any, k) => o?.[k], en as any)
    expect(typeof leaf).toBe('string')
    expect(typeof leafEn).toBe('string')
  })
})

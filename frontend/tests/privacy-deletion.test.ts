// C1.6 — Mağaza silme talebi (`TenantDataService/requestDeletion`, owner). Bu uçta 401 = YANLIŞ PAROLA
// (oturum değil); çağrı `skipSessionRedirect` ile yapılır ve genel "/login" yakalayıcısı TETİKLENMEZ.
// Genel 401 davranışı (başka uçlar) DEĞİŞMEDİ — ikisi de burada sabitlenir.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'

const push = vi.fn()
vi.mock('@/router', () => ({
  default: { isReady: () => Promise.resolve(), currentRoute: { value: { path: '/account/privacy', meta: {} } }, push },
}))

import useRestApi from '../src/composables/restapi'
import { deletionErrorOutcome, isDeletionResult, useTenantDataApi } from '../src/composables/useTenantDataApi'

function responseRejectedHandler(): (error: any) => Promise<any> {
  const handlers = (axios.interceptors.response as any).handlers.filter(Boolean)
  return handlers[handlers.length - 1].rejected
}

describe('deletionErrorOutcome (saf)', () => {
  it('401 → parola alanı "wrongPassword"', () => {
    expect(deletionErrorOutcome(401, 'Parola doğrulanamadı.')).toEqual({ field: 'password', key: 'privacyData.deletion.errors.wrongPassword' })
  })
  it('400 mesajları alan hatasına eşlenir; bilinmeyen 400 alan hatası DEĞİL', () => {
    expect(deletionErrorOutcome(400, 'Parola gerekli.').field).toBe('password')
    expect(deletionErrorOutcome(400, 'Mağaza adı doğrulanamadı.')).toEqual({ field: 'storeName', key: 'privacyData.deletion.errors.storeNameMismatch' })
    expect(deletionErrorOutcome(400, 'Tenant bulunamadı.')).toEqual({ key: 'privacyData.deletion.errors.noTenant' })
  })
  it('403/404/409/5xx/ağ → genel anahtarlar (ham metin yok)', () => {
    expect(deletionErrorOutcome(403).key).toBe('privacyData.deletion.errors.ownerOnly')
    expect(deletionErrorOutcome(404).key).toBe('privacyData.deletion.errors.noTenant')
    expect(deletionErrorOutcome(409, "Tenant 'SUSPENDED' durumunda").key).toBe('privacyData.deletion.errors.notEligible')
    expect(deletionErrorOutcome(500).key).toBe('privacyData.deletion.errors.generic')
    expect(deletionErrorOutcome(undefined).key).toBe('privacyData.deletion.errors.generic')
  })
  it('isDeletionResult: yalnız başarı gövdesi', () => {
    expect(isDeletionResult({ order: 7, status: 'DELETION_PENDING', deletionScheduledAt: '2026-10-29T10:15:00.000Z' })).toBe(true)
    expect(isDeletionResult({ isAxiosError: true, response: { status: 401 } })).toBe(false)
    expect(isDeletionResult(undefined)).toBe(false)
  })
})

describe('restApi.post skipSessionRedirect (geri uyumlu çağrı seçeneği)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    push.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requestDeletion gövdesi { password, confirmTenantName } + seçenek axios yapılandırmasına geçer', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { status: 'DELETION_PENDING' } } as any)
    const resp = await useTenantDataApi().requestDeletion('sentetik', 'E2E Test Mağazası')
    const [url, data, config] = postSpy.mock.calls[0]
    expect(url).toMatch(/TenantDataService\/requestDeletion$/)
    expect(data).toEqual({ password: 'sentetik', confirmTenantName: 'E2E Test Mağazası' })
    expect((config as any)?.skipSessionRedirect).toBe(true)
    expect(resp).toEqual({ status: 'DELETION_PENDING' })
  })

  it('seçeneksiz post çağrısı eskisi gibi yapılandırmasız (üçüncü argüman undefined)', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any)
    await useRestApi().post('ProductService/getProducts', { a: 1 })
    expect(postSpy.mock.calls[0][2]).toBeUndefined()
  })

  it('yakalayıcı: skipSessionRedirect ile 401 → /login yönlendirmesi YOK; seçeneksiz 401 → yönlendirme (genel davranış)', async () => {
    const rejected = responseRejectedHandler()
    const skipped = { config: { url: 'http://x/api/TenantDataService/requestDeletion', skipSessionRedirect: true }, response: { status: 401 } }
    await expect(rejected(skipped)).rejects.toBe(skipped)
    expect(push).not.toHaveBeenCalled()

    const general = { config: { url: 'http://x/api/ProductService/getProducts' }, response: { status: 401 } }
    await expect(rejected(general)).rejects.toBe(general)
    expect(push).toHaveBeenCalledWith({ path: '/login', query: { reason: 'session-expired' } })
  })
})

// MOB-08 / K55: müşteri uygulaması kendi API'sine giden her istekte `X-Client-Platform` gönderir (tek kaynak @entegrasyonik/ui/platform);
// dış adreslere eklenmez; yalnız sınıf değeri (ham UA yok).
import { describe, it, expect } from 'vitest'
import { AxiosHeaders } from 'axios'
import { withClientPlatformHeader } from '../src/composables/restapi'
import { apiBaseUrl } from '../src/config/env'
import { CLIENT_PLATFORMS } from '@entegrasyonik/ui/platform'

describe('X-Client-Platform (müşteri uygulaması)', () => {
  it('kendi API kökü → başlık eklenir (AxiosHeaders ve düz nesne)', () => {
    const a = withClientPlatformHeader({ url: apiBaseUrl + 'ProductService/list', headers: new AxiosHeaders() })
    expect(CLIENT_PLATFORMS).toContain((a.headers as AxiosHeaders).get('X-Client-Platform'))
    const b = withClientPlatformHeader({ url: apiBaseUrl + 'OrderService/list', headers: { 'Idempotency-Key': 'k' } as any })
    expect(b.headers['Idempotency-Key']).toBe('k')
    expect(CLIENT_PLATFORMS).toContain(b.headers['X-Client-Platform'])
  })
  it('dış adres → eklenmez', () => {
    const c = withClientPlatformHeader({ url: 'https://images.example.com/x.png', headers: new AxiosHeaders() })
    expect((c.headers as AxiosHeaders).has('X-Client-Platform')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { resolveSiteConfig, createAppUrls, DEFAULT_APP_URL } from '../src/lib/site-config'

describe('resolveSiteConfig', () => {
  it('varsayılan: TASLAK açık, uygulama adresi yerel', () => {
    const c = resolveSiteConfig({})
    expect(c.draft).toBe(true)
    expect(c.appUrl).toBe(DEFAULT_APP_URL)
    expect(c.siteUrl).toBeUndefined()
  })

  it('yalnızca açıkça "false" TASLAK modunu kapatır (güvenli varsayılan)', () => {
    const base = { PUBLIC_APP_URL: 'https://app.example.test', PUBLIC_SITE_URL: 'https://example.test' }
    expect(resolveSiteConfig({ ...base, SITE_DRAFT: 'false' }).draft).toBe(false)
    expect(resolveSiteConfig({ ...base, SITE_DRAFT: 'FALSE' }).draft).toBe(false)
    for (const v of ['true', '', '0', 'no', 'off', 'undefined']) {
      expect(resolveSiteConfig({ ...base, SITE_DRAFT: v }).draft, `SITE_DRAFT=${v}`).toBe(true)
    }
  })

  it('SITE_DRAFT=false iken adresler zorunlu (fail-fast)', () => {
    expect(() => resolveSiteConfig({ SITE_DRAFT: 'false' })).toThrow(/PUBLIC_APP_URL/)
    expect(() => resolveSiteConfig({ SITE_DRAFT: 'false', PUBLIC_APP_URL: 'https://a.test' })).toThrow(
      /PUBLIC_SITE_URL/,
    )
  })

  it('adresleri normalleştirir (sondaki eğik çizgi) ve http(s) dışını reddeder', () => {
    expect(resolveSiteConfig({ PUBLIC_APP_URL: 'https://app.example.test/' }).appUrl).toBe(
      'https://app.example.test',
    )
    expect(() => resolveSiteConfig({ PUBLIC_APP_URL: 'javascript:alert(1)' })).toThrow()
    expect(() => resolveSiteConfig({ PUBLIC_APP_URL: 'not a url' })).toThrow()
  })
})

describe('createAppUrls (ADR-0014 Karar 2 parametre sözleşmesi)', () => {
  const urls = createAppUrls('https://app.example.test')

  it('login', () => {
    expect(urls.login()).toBe('https://app.example.test/login')
  })

  it('register: yalnızca mode', () => {
    expect(urls.register()).toBe('https://app.example.test/login?mode=register')
  })

  it('register: plan + interval', () => {
    expect(urls.register({ plan: 'growth', interval: 'year' })).toBe(
      'https://app.example.test/login?mode=register&plan=growth&interval=year',
    )
  })

  it('bilinmeyen/biçimsiz plan ve interval SESSİZCE yok sayılır', () => {
    expect(urls.register({ plan: '../evil?x=1', interval: 'weekly' })).toBe(
      'https://app.example.test/login?mode=register',
    )
    expect(urls.register({ plan: 'UPPER', interval: 'month' })).toBe(
      'https://app.example.test/login?mode=register&interval=month',
    )
  })
})

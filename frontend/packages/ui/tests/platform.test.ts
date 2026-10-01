// MOB-08 / K55: istemci platform sınıfı algılama (tek kaynak).
import { describe, it, expect } from 'vitest'
import { CLIENT_PLATFORMS, detectClientPlatform, platformClassOf, clientPlatformHeaders, resetClientPlatformCache, type PlatformEnv } from '../src/platform'

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

function env(o: { ua?: string; media?: string[]; cap?: PlatformEnv['Capacitor']; bridge?: unknown; standalone?: boolean; uaMobile?: boolean }): PlatformEnv {
  const media = new Set(o.media ?? [])
  return {
    Capacitor: o.cap, ekDesktop: o.bridge,
    matchMedia: (q) => ({ matches: media.has(q) }),
    navigator: { userAgent: o.ua ?? UA_DESKTOP, standalone: o.standalone, userAgentData: o.uaMobile === undefined ? undefined : { mobile: o.uaMobile } },
  }
}
const TOUCH = ['(pointer: coarse)', '(hover: none)']

describe('detectClientPlatform', () => {
  it('liste backend ile aynı (sıra + değer)', () => {
    expect(CLIENT_PLATFORMS).toEqual(['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown'])
  })
  const UA_SHELL = UA_ANDROID + ' EntegrasyonikShell/1.0.0 (backoffice; fcm=0)'
  it('Android kabuğu (UA işareti + isNativePlatform; MOB-07 köprüsüyle aynı kural) → android_app', () => {
    expect(detectClientPlatform(env({ ua: UA_SHELL, media: [...TOUCH, '(display-mode: standalone)'], cap: { isNativePlatform: () => true, getPlatform: () => 'android' } }))).toBe('android_app')
  })
  it('UA işareti tek başına ya da isNativePlatform tek başına kabuk saymaz', () => {
    expect(detectClientPlatform(env({ ua: UA_SHELL, media: TOUCH }))).toBe('mobile_web')
    expect(detectClientPlatform(env({ ua: UA_ANDROID, media: TOUCH, cap: { isNativePlatform: () => true } }))).toBe('mobile_web')
  })
  it('Capacitor web modunda (isNativePlatform=false) yok sayılır', () => {
    expect(detectClientPlatform(env({ ua: UA_ANDROID, media: TOUCH, cap: { isNativePlatform: () => false, getPlatform: () => 'web' } }))).toBe('mobile_web')
  })
  it('Electron: köprü ya da UA işareti', () => {
    expect(detectClientPlatform(env({ bridge: {} }))).toBe('electron')
    expect(detectClientPlatform(env({ ua: UA_DESKTOP + ' Electron/29.0.0' }))).toBe('electron')
  })
  it('kurulu PWA: mobil cihazda pwa; masaüstüne kurulu PWA desktop_web', () => {
    expect(detectClientPlatform(env({ ua: UA_ANDROID, media: [...TOUCH, '(display-mode: standalone)'] }))).toBe('pwa')
    expect(detectClientPlatform(env({ ua: UA_ANDROID, standalone: true }))).toBe('pwa')
    expect(detectClientPlatform(env({ media: ['(display-mode: standalone)'] }))).toBe('desktop_web')
  })
  it('mobil tarayıcı: UA-CH mobile, kaba işaretçi + hover yok ya da UA işareti; dar masaüstü penceresi mobil sayılmaz', () => {
    expect(detectClientPlatform(env({ uaMobile: true }))).toBe('mobile_web')
    expect(detectClientPlatform(env({ media: TOUCH }))).toBe('mobile_web')
    expect(detectClientPlatform(env({ ua: UA_ANDROID }))).toBe('mobile_web')
    expect(detectClientPlatform(env({ media: ['(max-width: 600px)'] }))).toBe('desktop_web')
  })
  it('ortam yoksa unknown; matchMedia hatası düşürmez', () => {
    expect(detectClientPlatform(undefined)).toBe('unknown')
    expect(detectClientPlatform({ matchMedia: () => { throw new Error('x') }, navigator: { userAgent: UA_DESKTOP } })).toBe('desktop_web')
  })
  it('sınıf eşlemesi', () => {
    expect(CLIENT_PLATFORMS.map(platformClassOf)).toEqual(['desktop', 'desktop', 'mobile', 'mobile', 'mobile', 'unknown'])
  })
  it('başlık nesnesi yalnız sınıf değeri taşır (UA yok)', () => {
    resetClientPlatformCache()
    const h = clientPlatformHeaders()
    expect(Object.keys(h)).toEqual(['X-Client-Platform'])
    expect(CLIENT_PLATFORMS).toContain(h['X-Client-Platform'])
  })
})

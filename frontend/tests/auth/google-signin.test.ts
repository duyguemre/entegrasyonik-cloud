// GL-FE — Google ile giriş yardımcıları (saf; window/document enjekte edilir).
import { beforeEach, describe, expect, it } from 'vitest'
import {
  GSI_SRC,
  __resetGoogleSignIn,
  fetchGoogleClientId,
  googleClientErrorMessage,
  googleErrorMessage,
  googleSignInBlocked,
  loadGoogleIdentity,
} from '@/composables/googleSignIn'

beforeEach(() => __resetGoogleSignIn())

describe('googleSignInBlocked', () => {
  it('normal tarayıcıda açık; Electron ve Android kabuğunda kapalı', () => {
    expect(googleSignInBlocked({ navigator: { userAgent: 'Mozilla/5.0 Chrome' } } as any)).toBe(false)
    expect(googleSignInBlocked({ navigator: { userAgent: 'x' }, entegrasyonikDesktop: { isDesktop: true } } as any)).toBe(true)
    expect(googleSignInBlocked({ navigator: { userAgent: 'Mozilla/5.0 EntegrasyonikShell/1.0.0 (app; fcm=0)' }, Capacitor: { isNativePlatform: () => true } } as any)).toBe(true)
  })
})

describe('fetchGoogleClientId', () => {
  it('istemci kimliğini döner; boş/hatalı yanıt null', async () => {
    expect(await fetchGoogleClientId(async () => ({ googleClientId: ' abc.apps.googleusercontent.com ' }))).toBe('abc.apps.googleusercontent.com')
    __resetGoogleSignIn()
    expect(await fetchGoogleClientId(async () => ({ googleClientId: null }))).toBeNull()
    __resetGoogleSignIn()
    expect(await fetchGoogleClientId(async () => { throw new Error('ağ') })).toBeNull()
  })
})

describe('loadGoogleIdentity', () => {
  it('google zaten varsa betik eklemeden döner', async () => {
    const google = { accounts: { oauth2: { initCodeClient: () => ({ requestCode() {} }) } } }
    expect(await loadGoogleIdentity({ google } as any, {} as any)).toBe(google)
  })

  it('betiği bir kez ekler; hata olursa null', async () => {
    const listeners: Record<string, () => void> = {}
    const script: any = { addEventListener: (ev: string, fn: () => void) => { listeners[ev] = fn } }
    const appended: any[] = []
    const doc: any = { querySelector: () => null, createElement: () => script, head: { appendChild: (n: any) => appended.push(n) } }
    const p = loadGoogleIdentity({} as any, doc, 1000)
    expect(appended).toHaveLength(1)
    expect(script.src).toBe(GSI_SRC)
    listeners.error()
    expect(await p).toBeNull()
  })
})

describe('googleErrorMessage', () => {
  it('sunucu kodlarını Türkçe mesaja çevirir', () => {
    expect(googleErrorMessage({ response: { status: 400, data: { code: 'GOOGLE_EMAIL_UNVERIFIED' } } }).title).toBe('E-posta adresi doğrulanmamış')
    expect(googleErrorMessage({ response: { status: 409, data: { code: 'GOOGLE_ACCOUNT_MISMATCH' } } }).title).toBe('Hesap eşleşmedi')
    expect(googleErrorMessage({ response: { status: 429, data: {} } }).title).toBe('Çok fazla deneme')
    expect(googleErrorMessage({ isAxiosError: true }).title).toBe('Sunucuya ulaşılamadı')
  })
})

describe('googleClientErrorMessage (GL-FE2 kod akışı)', () => {
  it('vazgeçme sessiz; açılır pencere engeli ve diğer hatalar ileti döner', () => {
    expect(googleClientErrorMessage({ type: 'popup_closed' })).toBeNull()
    expect(googleClientErrorMessage({ error: 'access_denied' })).toBeNull()
    expect(googleClientErrorMessage({ type: 'popup_failed_to_open' })?.title).toBe('Google penceresi açılamadı')
    expect(googleClientErrorMessage({ type: 'unknown' })?.title).toBe('Google ile giriş yapılamadı')
  })
})

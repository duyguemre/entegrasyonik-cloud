import { describe, expect, it } from 'vitest'
import { authTransition, initialAuthState, type AuthEvent, type AuthState } from '../src/auth/machine'

const user = { sub: 'adm_1', email: 'yonetici@ornek.test', name: 'Örnek', mfa: true, authTime: '2026-09-30T10:00:00Z' }
const run = (events: AuthEvent[], from: AuthState = initialAuthState) => events.reduce(authTransition, from)

describe('giriş durum makinesi', () => {
  it('açılış: me başarılı → signedIn; başarısız → signedOut (bildirim yok)', () => {
    expect(run([{ type: 'ME_OK', user }]).status).toBe('signedIn')
    const out = run([{ type: 'ME_FAILED' }])
    expect(out).toMatchObject({ status: 'signedOut', notice: null })
  })

  it('kayıtlı hesap: parola → verify → (VERIFIED) booting → me → signedIn', () => {
    const s1 = run([{ type: 'ME_FAILED' }, { type: 'LOGIN_OK', result: { mfaRequired: true, enrollRequired: false } }])
    expect(s1.status).toBe('verify')
    const s2 = run([{ type: 'VERIFIED' }], s1)
    expect(s2.status).toBe('booting')
    expect(run([{ type: 'ME_OK', user }], s2).status).toBe('signedIn')
  })

  it('ilk giriş: enroll → kurtarma kodları (me gelse de kodlar görünür kalır) → onay → signedIn', () => {
    const codes = Array.from({ length: 10 }, (_, i) => `c${i}`)
    const s = run([
      { type: 'ME_FAILED' },
      { type: 'LOGIN_OK', result: { mfaRequired: false, enrollRequired: true } },
      { type: 'ENROLLED', recoveryCodes: codes },
      { type: 'ME_OK', user },
    ])
    expect(s.status).toBe('recovery')
    expect(s.recoveryCodes).toEqual(codes)
    const done = run([{ type: 'RECOVERY_ACK' }], s)
    expect(done).toMatchObject({ status: 'signedIn', recoveryCodes: null })
  })

  it('sözleşme dışı "mfa gerekmiyor" yanıtı bile TOTP adımına gider (TOTP\'siz oturum yok)', () => {
    expect(run([{ type: 'ME_FAILED' }, { type: 'LOGIN_OK', result: { mfaRequired: false, enrollRequired: false } }]).status).toBe('verify')
  })

  it('oturum düşerse (401) signedOut + "expired"; yarım oturumda düşerse "stageExpired"', () => {
    expect(run([{ type: 'ME_OK', user }, { type: 'SESSION_EXPIRED' }])).toMatchObject({ status: 'signedOut', notice: 'expired', user: null })
    const verify = run([{ type: 'ME_FAILED' }, { type: 'LOGIN_OK', result: { mfaRequired: true, enrollRequired: false } }])
    expect(run([{ type: 'SESSION_EXPIRED' }], verify)).toMatchObject({ status: 'signedOut', notice: 'stageExpired' })
  })

  it('MFA_REQUIRED tam oturumda → signedOut + "mfa"; diğer durumlarda yok sayılır', () => {
    expect(run([{ type: 'ME_OK', user }, { type: 'MFA_REQUIRED' }])).toMatchObject({ status: 'signedOut', notice: 'mfa' })
    const verify = run([{ type: 'ME_FAILED' }, { type: 'LOGIN_OK', result: { mfaRequired: true, enrollRequired: false } }])
    expect(run([{ type: 'MFA_REQUIRED' }], verify).status).toBe('verify')
  })

  it('geçersiz geçişler durumu değiştirmez; LOGOUT/RESTART her yerden signedOut', () => {
    const signedIn = run([{ type: 'ME_OK', user }])
    expect(run([{ type: 'LOGIN_OK', result: { mfaRequired: true, enrollRequired: false } }], signedIn)).toBe(signedIn)
    expect(run([{ type: 'VERIFIED' }], signedIn)).toBe(signedIn)
    expect(run([{ type: 'LOGOUT' }], signedIn)).toMatchObject({ status: 'signedOut', notice: 'loggedOut' })
    expect(run([{ type: 'RESTART' }], signedIn)).toMatchObject({ status: 'signedOut', notice: null })
  })
})

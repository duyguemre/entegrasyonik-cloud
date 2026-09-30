/**
 * Backoffice giriş akışı — SAF durum makinesi (vue/axios yok; tests/auth-machine.test.ts).
 *
 *   booting ──me ok──────────────────────────────▶ signedIn
 *      └─me 401/403──▶ signedOut ──login──┬─mfaRequired──▶ verify ──verifyTotp ok──▶ signedIn
 *                                         └─enrollRequired─▶ enroll ──confirmTotp ok──▶ recovery ──ack──▶ signedIn
 *   signedIn ──UNAUTHENTICATED──▶ signedOut (notice: expired)   signedIn ──MFA_REQUIRED──▶ signedOut (notice: mfa)
 *   verify/enroll ──yarım oturum düştü (401)──▶ signedOut (notice: stageExpired)        * ──logout──▶ signedOut
 */
import type { BackofficeMe, LoginResponse } from '../api/contract'

export type AuthStatus = 'booting' | 'signedOut' | 'verify' | 'enroll' | 'recovery' | 'signedIn'
export type AuthNotice = 'expired' | 'mfa' | 'stageExpired' | 'loggedOut' | null

export interface AuthState {
  status: AuthStatus
  user: BackofficeMe | null
  /** Yalnız `recovery` durumunda, yalnız bellekte (depoya yazılmaz). */
  recoveryCodes: string[] | null
  notice: AuthNotice
}

export type AuthEvent =
  | { type: 'ME_OK'; user: BackofficeMe }
  | { type: 'ME_FAILED' }
  | { type: 'LOGIN_OK'; result: LoginResponse }
  | { type: 'VERIFIED' }
  | { type: 'ENROLLED'; recoveryCodes: string[] }
  | { type: 'RECOVERY_ACK' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'MFA_REQUIRED' }
  | { type: 'LOGOUT' }
  /** Kullanıcı yarım oturumda "Başa dön" dedi (bildirim yok). */
  | { type: 'RESTART' }

export const initialAuthState: AuthState = { status: 'booting', user: null, recoveryCodes: null, notice: null }

const signedOut = (notice: AuthNotice): AuthState => ({ status: 'signedOut', user: null, recoveryCodes: null, notice })

export function authTransition(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'ME_OK':
      // `recovery` ekranındayken arka planda me gelmesi kodları kapatmamalı.
      if (state.status === 'recovery') return { ...state, user: event.user }
      return { status: 'signedIn', user: event.user, recoveryCodes: null, notice: null }
    case 'ME_FAILED':
      return state.status === 'booting' ? signedOut(null) : state
    case 'LOGIN_OK':
      if (state.status !== 'signedOut') return state
      if (event.result.enrollRequired) return { ...state, status: 'enroll', notice: null }
      if (event.result.mfaRequired) return { ...state, status: 'verify', notice: null }
      // Sözleşme dışı (TOTP'siz tam oturum yok, ADR-0026 Karar 4.5): güvenli taraf — doğrulamaya gönder.
      return { ...state, status: 'verify', notice: null }
    case 'VERIFIED':
      return state.status === 'verify' ? { ...state, status: 'booting' } : state
    case 'ENROLLED':
      return state.status === 'enroll' ? { ...state, status: 'recovery', recoveryCodes: event.recoveryCodes } : state
    case 'RECOVERY_ACK':
      if (state.status !== 'recovery') return state
      return state.user ? { status: 'signedIn', user: state.user, recoveryCodes: null, notice: null } : { ...state, status: 'booting', recoveryCodes: null }
    case 'SESSION_EXPIRED':
      if (state.status === 'verify' || state.status === 'enroll') return signedOut('stageExpired')
      if (state.status === 'signedIn' || state.status === 'recovery') return signedOut('expired')
      return state.status === 'booting' ? signedOut(null) : state
    case 'MFA_REQUIRED':
      return state.status === 'signedIn' ? signedOut('mfa') : state
    case 'LOGOUT':
      return signedOut('loggedOut')
    case 'RESTART':
      return signedOut(null)
  }
}

export const NOTICE_TEXT: Record<Exclude<AuthNotice, null>, string> = {
  expired: 'Oturumunuz sona erdi. Güvenliğiniz için yeniden giriş yapın.',
  mfa: 'İki adımlı doğrulama gerekiyor. Lütfen yeniden giriş yapın.',
  stageExpired: 'Doğrulama süresi doldu (5 dakika). Parolanızla yeniden başlayın.',
  loggedOut: 'Çıkış yapıldı.',
}

/**
 * Oturum deposu: durum makinesini API çağrılarına bağlar. Kimlik yalnız HttpOnly `EK_ADMIN` çerezindedir;
 * burada yalnız profil (me) ve akış durumu tutulur — hiçbir şey kalıcı depoya yazılmaz.
 */
import { reactive, readonly } from 'vue'
import { api } from '../api'
import type { LoginRequest, VerifyTotpRequest } from '../api/contract'
import { authTransition, initialAuthState, type AuthEvent, type AuthState } from './machine'

const state = reactive<AuthState>({ ...initialAuthState })

function dispatch(event: AuthEvent) {
  Object.assign(state, authTransition({ ...state }, event))
}

async function refreshMe() {
  try {
    dispatch({ type: 'ME_OK', user: await api.call('BackofficeAuthService/me') })
  } catch {
    dispatch({ type: 'ME_FAILED' })
  }
}

export const session = {
  state: readonly(state),
  dispatch,
  boot: refreshMe,
  async login(credentials: LoginRequest) {
    dispatch({ type: 'LOGIN_OK', result: await api.call('BackofficeAuthService/login', credentials) })
  },
  async verify(request: VerifyTotpRequest) {
    await api.call('BackofficeAuthService/verifyTotp', request)
    dispatch({ type: 'VERIFIED' })
    await refreshMe()
  },
  enrollStart() {
    return api.call('BackofficeAuthService/enrollTotp')
  },
  async enrollConfirm(code: string) {
    const { recoveryCodes } = await api.call('BackofficeAuthService/confirmTotp', { code })
    dispatch({ type: 'ENROLLED', recoveryCodes })
    await refreshMe()
  },
  acknowledgeRecovery() {
    dispatch({ type: 'RECOVERY_ACK' })
  },
  /** Yarım oturumu bırakıp parola adımına dön (sunucuda çerezi de sil). */
  restart() {
    dispatch({ type: 'RESTART' })
    api.call('BackofficeAuthService/logout').catch(() => undefined)
  },
  async logout() {
    try {
      await api.call('BackofficeAuthService/logout')
    } finally {
      dispatch({ type: 'LOGOUT' })
    }
  },
}

/**
 * frontend/src/composables/reauth.ts
 *
 * Faz 3 / C2a — adım-yükseltme (step-up) oturumu. Sözleşme: docs/cloud-contracts/API_ACCOUNT_LIFECYCLE.md §8.
 * Hassas bir işlem `401 { code: 'REAUTH_REQUIRED' }` dönerse `restapi.ts`'teki merkezi yakalayıcı `requestReauth()`
 * çağırır: uygulama genelindeki TEK `ReauthDialog` (App.vue) açılır, kullanıcı parolasını girer →
 * `AccountService/reauthenticate` → başarıda yakalayıcı asıl isteği AYNI yapılandırmayla (aynı `Idempotency-Key`
 * başlığı dahil) yineler; kullanıcı vazgeçerse istek `reauthCancelled` işaretiyle reddedilir (işlem yapılmaz,
 * kullanıcıya hata gösterilmez — bkz. `apiErrors.ts`).
 *
 * Eşzamanlı birden çok istek aynı anda REAUTH_REQUIRED alırsa TEK diyalog açılır; hepsi aynı sonucu bekler.
 * Parola bu modülde SAKLANMAZ (yalnız istek gövdesinde bir kez gider), loglanmaz.
 */
import axios from 'axios'
import { reactive } from 'vue'
import { apiBaseUrl } from '@/config/env'

export const REAUTH_RPC = 'AccountService/reauthenticate'

export interface ReauthState {
  open: boolean
  busy: boolean
  /** i18n anahtarı (ör. `reauth.errors.wrongPassword`); boşsa hata yok. */
  errorKey: string
  /** Başarılı doğrulamadan sonra sunucunun verdiği geçerlilik sonu (ISO). */
  validUntil: string | null
}

const state = reactive<ReauthState>({ open: false, busy: false, errorKey: '', validUntil: null })

let pending: Promise<boolean> | null = null
let settle: ((ok: boolean) => void) | null = null

function finish(ok: boolean) {
  const done = settle
  pending = null
  settle = null
  state.open = false
  state.busy = false
  state.errorKey = ''
  done?.(ok)
}

/** Diyaloğu açar (açıksa aynı bekleyişe katılır). `true` = doğrulandı, `false` = kullanıcı vazgeçti. */
export function requestReauth(): Promise<boolean> {
  if (pending) return pending
  state.errorKey = ''
  state.busy = false
  state.open = true
  pending = new Promise<boolean>((resolve) => {
    settle = resolve
  })
  return pending
}

/** Parolayı doğrular. Başarıda bekleyen istek(ler) yinelenir; hatada diyalog açık kalır ve hata anahtarı yazılır. */
export async function submitReauth(password: string): Promise<boolean> {
  if (!pending || state.busy) return false
  if (!password) {
    state.errorKey = 'reauth.errors.required'
    return false
  }
  state.busy = true
  state.errorKey = ''
  try {
    const resp = await axios.post(apiBaseUrl + REAUTH_RPC, { password }, { skipReauth: true })
    state.validUntil = typeof resp?.data?.reauthValidUntil === 'string' ? resp.data.reauthValidUntil : null
    finish(true)
    return true
  } catch (error: any) {
    const status = error?.response?.status
    const code = error?.response?.data?.code
    state.busy = false
    if (code === 'INVALID_CURRENT_PASSWORD') state.errorKey = 'reauth.errors.wrongPassword'
    else if (status === 429) state.errorKey = 'reauth.errors.rateLimited'
    else if (status === 401) {
      // Oturum düştü (ör. 5 yanlış denemede kilit): genel yakalayıcı girişe yönlendirir; bekleyen işlem vazgeçilir.
      finish(false)
      return false
    } else if (!error?.response) state.errorKey = 'reauth.errors.network'
    else state.errorKey = 'reauth.errors.generic'
    return false
  }
}

/** Kullanıcı vazgeçti (Vazgeç / Esc / ×): bekleyen istek(ler) işlem yapılmadan reddedilir. */
export function cancelReauth() {
  if (!pending || state.busy) return
  finish(false)
}

export function useReauth() {
  return { state, requestReauth, submitReauth, cancelReauth }
}

/** Yalnız testler: modül durumunu sıfırlar. */
export function __resetReauthForTests() {
  if (settle) settle(false)
  pending = null
  settle = null
  Object.assign(state, { open: false, busy: false, errorKey: '', validUntil: null })
}

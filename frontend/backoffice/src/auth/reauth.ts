/** Adım-yükseltmesi (step-up) köprüsü: istemci REAUTH_REQUIRED alınca diyaloğu açar, sonucu bekler. */
import { reactive } from 'vue'

export const reauthState = reactive({ open: false })
let pending: ((ok: boolean) => void) | null = null

export function requestReauth(): Promise<boolean> {
  reauthState.open = true
  return new Promise((resolve) => (pending = resolve))
}

export function settleReauth(ok: boolean) {
  reauthState.open = false
  pending?.(ok)
  pending = null
}

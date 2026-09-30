// A8 — EkRefreshButton yardımcıları: göreli zaman metni + (isteğe bağlı) sayfa yenileme DURUMU sağlayıcısı.
//
// Hata durumu düğmeye iki yoldan ulaşır: doğrudan `error` prop'u ya da ata bileşenin `provideRefreshState`
// ile verdiği getter (ör. EkListScreen `error`, pano/sağlık ekranlarının `state === 'error'`). Sağlayıcı
// sayesinde başlık satırı bileşenleri (EkPageBar / EkPageHeader) yeni prop taşımak zorunda kalmaz.
import { inject, provide, type InjectionKey } from 'vue'

export interface RefreshState {
  /** Son yenileme başarısız mı (true) — ya da kısa hata metni. */
  error?: boolean | string | null
}

export const REFRESH_STATE: InjectionKey<() => RefreshState> = Symbol('ek-refresh-state')

export function provideRefreshState(getter: () => RefreshState) {
  provide(REFRESH_STATE, getter)
}

export function injectRefreshState(): (() => RefreshState) | null {
  return inject(REFRESH_STATE, null)
}

/** "az önce" · "3 dk önce" · "2 sa önce" · "dün 14:02" · "27.09 14:02" (tr-TR, 24 saat). */
export function formatRelativeTime(at: Date, now: number = Date.now()): string {
  const diff = Math.max(0, now - at.getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'az önce'
  if (min < 60) return `${min} dk önce`
  const hr = Math.floor(min / 60)
  const time = at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const today = new Date(now)
  const sameDay = at.toDateString() === today.toDateString()
  if (sameDay && hr < 24) return `${hr} sa önce`
  const yesterday = new Date(now - 86_400_000)
  if (at.toDateString() === yesterday.toDateString()) return `dün ${time}`
  const day = at.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
  return `${day} ${time}`
}

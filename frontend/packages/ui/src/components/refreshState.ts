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
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const today = new Date(now)
  const sameDay = at.toDateString() === today.toDateString()
  if (sameDay && hr < 24) return `${hr} sa önce`
  const yesterday = new Date(now - 86_400_000)
  if (at.toDateString() === yesterday.toDateString()) return `dün ${time}`
  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)} ${time}`
}

export type RefreshVisualState = 'idle' | 'loading' | 'success' | 'error'

export interface RefreshViewInput {
  loading: boolean
  error: boolean
  /** Başarı onayı (kısa tik) gösterimde mi. */
  flash: boolean
  label: string
  keys: readonly string[]
  /** Göreli son güncelleme metni ("2 dk önce") — yoksa boş. */
  updatedText: string
}

export interface RefreshView {
  state: RefreshVisualState
  tipTitle: string
  tipMeta: string
  ariaLabel: string
}

/** EkRefreshButton'ın görünür durumu + ipucu + erişilebilir adı (saf; bileşen ve test aynı kaynağı kullanır). */
export function resolveRefreshView(i: RefreshViewInput): RefreshView {
  const state: RefreshVisualState = i.loading ? 'loading' : i.error ? 'error' : i.flash ? 'success' : 'idle'
  const tipTitle = state === 'loading' ? 'Yenileniyor…' : state === 'error' ? 'Yenilenemedi — tekrar denemek için tıklayın' : i.label
  const tipMeta = !i.updatedText ? '' : state === 'error' ? `Son başarılı güncelleme ${i.updatedText}` : `Son güncelleme ${i.updatedText}`
  const base = `${i.label} (${i.keys.join('+')})`
  let ariaLabel = base
  if (state === 'loading') ariaLabel = `${base}, yenileniyor`
  else if (state === 'error') ariaLabel = `${base}, son yenileme başarısız${i.updatedText ? `; son başarılı güncelleme ${i.updatedText}` : ''}`
  else if (i.updatedText) ariaLabel = `${base}, son güncelleme ${i.updatedText}`
  return { state, tipTitle, tipMeta, ariaLabel }
}

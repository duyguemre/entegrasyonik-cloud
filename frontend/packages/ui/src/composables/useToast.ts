/**
 * frontend/src/composables/useToast.ts
 *
 * ADR-0015 Karar 6.1 + Aşama 6b (Standart 1) — TEK toast kaynağı. `EkToastHost` (App.vue, tek örnek) bu modülün
 * paylaşılan durumunu okur; eski `snackbarStore.addSnackbar` de buraya yönlenir (ikinci bir görünüm yok).
 * Kural: ton `success|info|warning|error`, süre 4 sn (`error` kullanıcı kapatana dek kalır), üzerine gelince/odakta
 * süre durur, eylem bağlantısı ≤1 ("Geri al", "Görüntüle"), aynı anda ≤3 toast (en eski otomatik düşer). Kalıcı
 * bildirimler bildirim çekmecesindedir — toast'lar oraya yazılmaz.
 *
 *   const { showToast } = useToast()
 *   showToast({ tone: 'success', message: 'Ürün kaydedildi.' })
 *   showToast({ tone: 'error', title: 'Kaydedilemedi', message: 'Bağlantınızı kontrol edin.', actionLabel: 'Tekrar dene', onAction: retry })
 */
import { reactive } from 'vue'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastOptions {
  tone: ToastTone
  message: string
  /** İsteğe bağlı kısa başlık (ör. "Kaydedildi"); yoksa yalnız ileti. */
  title?: string
  actionLabel?: string
  onAction?: () => void
  /** Özel süre (ms). `error` her zaman kalıcıdır. */
  duration?: number
  /** FE-LOCAL-1050: destek kodu — iletinin altında kopyalanabilir küçük kod kutusu ("Destek kodu · ABC123"). */
  code?: string
}

export interface Toast extends ToastOptions {
  id: number
  /** Otomatik kapanma süresi (ms); 0 = kalıcı. İlerleme çizgisi bunu kullanır. */
  timeout: number
  paused: boolean
}

const MAX_VISIBLE_TOASTS = 3
const DEFAULT_DURATION_MS = 4000

/** Modül düzeyinde paylaşılan durum — tek `EkToastHost` örneği bunu render eder. */
const toasts = reactive<Toast[]>([])
let nextId = 1
const timers = new Map<number, { handle: ReturnType<typeof setTimeout>; endsAt: number; remaining: number }>()

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) clearTimeout(t.handle)
  timers.delete(id)
}

function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
  clearTimer(id)
}

function arm(id: number, ms: number) {
  clearTimer(id)
  timers.set(id, { handle: setTimeout(() => dismissToast(id), ms), endsAt: Date.now() + ms, remaining: ms })
}

function showToast(options: ToastOptions): number {
  const id = nextId++
  const timeout = options.tone === 'error' ? 0 : Math.max(0, options.duration ?? DEFAULT_DURATION_MS)
  toasts.push({ ...options, id, timeout, paused: false })
  while (toasts.length > MAX_VISIBLE_TOASTS) dismissToast(toasts[0].id)
  // Hatalar kullanıcı kapatana dek kalır (Karar 6.1); diğerleri süre sonunda kapanır.
  if (timeout > 0) arm(id, timeout)
  return id
}

/** Üzerine gelince / odakta süre durur (okuma süresi), ayrılınca kalan süreden devam eder. */
function pauseToast(id: number): void {
  const t = timers.get(id)
  const toast = toasts.find((x) => x.id === id)
  if (!t || !toast) return
  clearTimeout(t.handle)
  timers.set(id, { ...t, remaining: Math.max(0, t.endsAt - Date.now()) })
  toast.paused = true
}

function resumeToast(id: number): void {
  const t = timers.get(id)
  const toast = toasts.find((x) => x.id === id)
  if (!t || !toast) return
  toast.paused = false
  arm(id, Math.max(800, t.remaining))
}

export function useToast() {
  return { toasts, showToast, dismissToast, pauseToast, resumeToast }
}

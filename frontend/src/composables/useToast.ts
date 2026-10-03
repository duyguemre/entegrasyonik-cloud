/**
 * frontend/src/composables/useToast.ts
 *
 * ADR-0015 Karar 6.1 — tek toast kaynağı. `EkToastHost` (kabukta, tek
 * örnek) bu modülün paylaşılan durumunu okur. Kural: ton
 * `success|info|warning|error` (status-map.ts 5 tonundan 4'ü — `neutral`
 * toast'ta kullanılmaz), süre 4sn (`error` kullanıcı kapatana dek kalır),
 * eylem bağlantısı ≤1 ("Geri al", "Görüntüle"), aynı anda ≤3 toast (en eski
 * otomatik düşer). Kalıcı bildirimler üst çubuktaki bildirim çekmecesindedir
 * (mevcut `NotificationDrawerComponent`) — toast'lar ORAYA yazılmaz.
 *
 * Kullanım:
 *   const { showToast } = useToast()
 *   showToast({ tone: 'success', message: 'Ürün kaydedildi.' })
 *   showToast({ tone: 'error', message: 'Kaydedilemedi — tekrar deneyin.', actionLabel: 'Tekrar dene', onAction: retry })
 */
import { reactive } from 'vue'

export type ToastTone = 'success' | 'info' | 'warning' | 'error'

export interface ToastOptions {
  tone: ToastTone
  message: string
  actionLabel?: string
  onAction?: () => void
}

export interface Toast extends ToastOptions {
  id: number
}

const MAX_VISIBLE_TOASTS = 3
const DEFAULT_DURATION_MS = 4000

/** Modül düzeyinde paylaşılan durum — tek `EkToastHost` örneği bunu render eder. */
const toasts = reactive<Toast[]>([])
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function dismissToast(id: number): void {
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

function showToast(options: ToastOptions): number {
  const id = nextId++
  toasts.push({ ...options, id })
  // Aynı anda en fazla 3 toast — en eski otomatik düşer.
  while (toasts.length > MAX_VISIBLE_TOASTS) {
    dismissToast(toasts[0].id)
  }
  // Hatalar kullanıcı kapatana dek kalır (Karar 6.1); diğerleri 4sn sonra kapanır.
  if (options.tone !== 'error') {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), DEFAULT_DURATION_MS),
    )
  }
  return id
}

export function useToast() {
  return { toasts, showToast, dismissToast }
}

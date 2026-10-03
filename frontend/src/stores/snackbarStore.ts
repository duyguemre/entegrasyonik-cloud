// Eski bildirim API'si (40+ çağrı noktası). Aşama 6b (Standart 1): ikinci bir görünüm YOK — tüm çağrılar tek toast
// kaynağına (`useToast` → `EkToastHost`) yönlenir; renk adı tona çevrilir. Yeni kod doğrudan `useToast()` kullanır.
import { defineStore } from 'pinia'
import { useToast, type ToastTone } from '@entegrasyonik/ui/composables/useToast'

const TONE: Record<string, ToastTone> = { success: 'success', error: 'error', danger: 'error', warning: 'warning', info: 'info' }

export const useSnackbarStore = defineStore('snackbarStore', () => {
  const { showToast, dismissToast } = useToast()

  const addSnackbar = (snackbar: { text?: string; color?: string; timeout?: number; [k: string]: unknown }) => {
    if (!snackbar?.text) return
    return showToast({
      tone: TONE[snackbar.color ?? 'info'] ?? 'info',
      message: String(snackbar.text),
      duration: snackbar.timeout,
      title: typeof snackbar.title === 'string' ? snackbar.title : undefined,
      code: typeof snackbar.code === 'string' ? snackbar.code : undefined,
    })
  }

  const removeSnackbar = (id: number) => dismissToast(id)
  return { addSnackbar, removeSnackbar }
})

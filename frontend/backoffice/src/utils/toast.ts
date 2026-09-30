import { reactive } from 'vue'

export interface Toast {
  id: number
  tone: 'success' | 'info' | 'warning' | 'error'
  text: string
}
export const toasts = reactive<Toast[]>([])
let seq = 0

export function notify(tone: Toast['tone'], text: string, ms = 5000) {
  const id = ++seq
  toasts.push({ id, tone, text })
  setTimeout(() => dismiss(id), ms)
}

export function dismiss(id: number) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

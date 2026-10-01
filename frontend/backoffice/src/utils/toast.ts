/**
 * Backoffice bildirimleri — ortak paketin TEK toast kaynağı (`useToast` + `EkToastHost`, App.vue).
 * Tehlikeli işlem sonrası: `notifyAudited` başarı metni + "Denetim kaydını aç" bağlantısı (BO_UI_PATTERNS §6).
 */
import { useToast, type ToastTone } from '@entegrasyonik/ui/composables/useToast'

const { showToast } = useToast()

export function notify(tone: ToastTone, text: string, ms?: number) {
  showToast({ tone, message: text, duration: ms })
}

/** Denetime yazılan bir işlemin sonucu: denetim ekranında o kayda (istek kimliği / müşteri) süzülmüş bağlantı. */
export function notifyAudited(text: string, open: () => void, title = 'İşlem tamamlandı') {
  showToast({ tone: 'success', title, message: text, actionLabel: 'Denetim kaydını aç', onAction: open, duration: 8000 })
}

/**
 * `notifyAudited` kısayolu (bo-wdg): denetim ekranını verilen süzgeçle açar (`tid`, `event`, `reqId`, `surface`, `range`).
 * Yönlendirici tembel alınır (görünümler → toast → yönlendirici döngüsü kurulmaz).
 */
export function notifyAuditedAt(text: string, query: Record<string, string>, title?: string) {
  notifyAudited(text, () => void import('@bo/router').then(({ router }) => router.push({ path: '/denetim', query })), title)
}

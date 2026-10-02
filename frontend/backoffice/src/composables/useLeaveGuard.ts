/**
 * BO-WDG — kaydedilmemiş değişiklik varken sayfadan ayrılma uyarısı (TEK kaynak). İki yol korunur:
 *   - uygulama içi gezinti: `onBeforeRouteLeave` → onay diyaloğu (ekran `EkConfirmDialog`'u bu duruma bağlar)
 *   - sekme kapatma / yeniden yükleme: `beforeunload` (tarayıcının kendi uyarısı; metin tarayıcıdan gelir)
 * Kayıttan hemen sonra yapılan yönlendirme için `allow()` korumayı bir kez atlatır.
 *
 *   const leave = useLeaveGuard(() => cfg.changedKeys.length > 0)
 *   <EkConfirmDialog v-model="leave.open.value" v-bind="LEAVE_DIALOG" danger @confirm="leave.confirm" />
 */
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

/** Ayrılma diyaloğunun ortak metni (soru başlık, sonuç açıklama, fiil onay). */
export const LEAVE_DIALOG = {
  title: 'Kaydedilmemiş değişiklikler silinsin mi?',
  description: 'Bu sayfadaki kaydedilmemiş değişiklikler kaybolur. Bu işlem geri alınamaz.',
  confirmLabel: 'Değişiklikleri at',
  cancelLabel: 'Sayfada kal',
} as const

export interface LeaveGuard {
  /** Diyalog açık mı (EkConfirmDialog `v-model`). Esc / dış tık ile kapanırsa "sayfada kal" sayılır. */
  open: Ref<boolean>
  /** Kirliyse onay sorar; temizse hemen `true`. Sayfa içi "Vazgeç" düğmeleri de bunu kullanır. */
  ask: () => Promise<boolean>
  confirm: () => void
  cancel: () => void
  /** Sonraki tek gezintide sormadan geçir (ör. kayıt başarılı → liste sayfasına dönüş). */
  allow: () => void
}

export function useLeaveGuard(isDirty: Ref<boolean> | (() => boolean)): LeaveGuard {
  const dirty = () => (typeof isDirty === 'function' ? isDirty() : isDirty.value)
  const open = ref(false)
  let pending: ((ok: boolean) => void) | null = null
  let bypass = false

  function settle(ok: boolean) {
    const resolve = pending
    pending = null
    open.value = false
    resolve?.(ok)
  }

  function ask(): Promise<boolean> {
    if (bypass || !dirty()) return Promise.resolve(true)
    // Açık bir soru varsa (çift tık) aynı yanıtı bekletmek yerine öncekini "kal" sayıp yenisini aç.
    if (pending) settle(false)
    open.value = true
    return new Promise((resolve) => (pending = resolve))
  }

  // Diyalog Esc / dış tıkla kapanırsa bekleyen soru "sayfada kal" olarak yanıtlanır.
  watch(open, (v) => {
    if (!v && pending) settle(false)
  })

  onBeforeRouteLeave(async () => {
    if (bypass) {
      bypass = false
      return true
    }
    return ask()
  })

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (bypass || !dirty()) return
    e.preventDefault()
    // Eski tarayıcılar uyarıyı yalnız returnValue ile gösterir.
    e.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (pending) settle(false)
  })

  return {
    open,
    ask,
    confirm: () => settle(true),
    cancel: () => settle(false),
    allow: () => {
      bypass = true
    },
  }
}
